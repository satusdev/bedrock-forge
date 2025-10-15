"""
Performance Testing Utility for Bedrock Forge.

Integrates with Google Lighthouse for comprehensive performance testing,
including Core Web Vitals, SEO, accessibility, and best practices analysis.
"""

import json
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import tempfile
import os
import sqlite3

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..constants import PERFORMANCE_DB_PATH, PERFORMANCE_REPORTS_DIR


@dataclass
class PerformanceScore:
    """Individual performance category score."""
    category: str
    score: float
    title: str
    description: str


@dataclass
class CoreWebVitals:
    """Core Web Vitals metrics."""
    lcp: float  # Largest Contentful Paint
    fid: float  # First Input Delay
    cls: float  # Cumulative Layout Shift
    fcp: float  # First Contentful Paint
    ttfb: float  # Time to First Byte
    si: float  # Speed Index


@dataclass
class PerformanceAudit:
    """Individual audit result from Lighthouse."""
    id: str
    title: str
    description: str
    score: Optional[float]
    score_display_mode: str
    details: Optional[Dict[str, Any]]


@dataclass
class PerformanceTestResult:
    """Complete performance test result."""
    url: str
    timestamp: datetime
    performance_score: float
    accessibility_score: float
    best_practices_score: float
    seo_score: float
    pwa_score: Optional[float]
    core_web_vitals: CoreWebVitals
    audits: List[PerformanceAudit]
    recommendations: List[str]
    loading_experience: str
    origin_loading_experience: str
    device: str
    test_duration: float


@dataclass
class PerformanceBudget:
    """Performance budget configuration."""
    budget_type: str  # size, count, time
    resource_type: str
    max_value: float
    warning_threshold: float


@dataclass
class PerformanceTarget:
    """Performance target configuration."""
    metric: str
    target_value: float
    warning_threshold: float
    critical_threshold: float


class PerformanceTester:
    """Main performance testing class with Lighthouse integration."""

    def __init__(self, project_path: Optional[Path] = None):
        """Initialize performance tester."""
        self.project_path = project_path or Path.cwd()
        self.db_path = self.project_path / ".ddev" / PERFORMANCE_DB_PATH
        self.reports_dir = self.project_path / ".ddev" / PERFORMANCE_REPORTS_DIR
        self._ensure_directories()
        self._init_database()

    def _ensure_directories(self) -> None:
        """Ensure necessary directories exist."""
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _init_database(self) -> None:
        """Initialize performance database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS performance_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT NOT NULL,
                    timestamp DATETIME NOT NULL,
                    performance_score REAL,
                    accessibility_score REAL,
                    best_practices_score REAL,
                    seo_score REAL,
                    pwa_score REAL,
                    lcp REAL,
                    fid REAL,
                    cls REAL,
                    fcp REAL,
                    ttfb REAL,
                    si REAL,
                    device TEXT,
                    test_duration REAL,
                    recommendations TEXT,
                    raw_data TEXT
                );

                CREATE TABLE IF NOT EXISTS performance_budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_path TEXT NOT NULL,
                    budget_type TEXT NOT NULL,
                    resource_type TEXT NOT NULL,
                    max_value REAL NOT NULL,
                    warning_threshold REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS performance_targets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_path TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    target_value REAL NOT NULL,
                    warning_threshold REAL,
                    critical_threshold REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_performance_tests_timestamp
                ON performance_tests(timestamp);
            """)

    async def run_lighthouse_test(
        self,
        url: str,
        device: str = "desktop",
        headless: bool = True,
        form_factor: str = "desktop",
        throttling: bool = True
    ) -> PerformanceTestResult:
        """Run Lighthouse performance test."""
        logger.info(f"Running Lighthouse test for {url} on {device}")

        start_time = datetime.now()

        try:
            # Check if Lighthouse is available
            await self._check_lighthouse_availability()

            # Create temporary file for Lighthouse output
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
                temp_path = temp_file.name

            # Build Lighthouse command
            cmd = [
                "npx", "lighthouse",
                url,
                "--output=json",
                f"--output-path={temp_path}",
                "--chrome-flags='--headless'" if headless else "",
                f"--form-factor={form_factor}",
                "--throttling-method=provided" if throttling else "--throttling-method=provided"
            ]

            # Add device-specific settings
            if device == "mobile":
                cmd.extend([
                    "--screenEmulation.mobile",
                    "--emulatedUserAgent=Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36"
                ])

            # Run Lighthouse
            logger.debug(f"Executing: {' '.join(cmd)}")
            result = subprocess.run(
                ' '.join(filter(None, cmd)),
                shell=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode != 0:
                raise ForgeError(f"Lighthouse failed: {result.stderr}")

            # Parse results
            with open(temp_path, 'r') as f:
                lighthouse_data = json.load(f)

            # Clean up temp file
            os.unlink(temp_path)

            # Process results
            test_result = self._parse_lighthouse_results(
                lighthouse_data, url, device, start_time
            )

            # Save to database
            await self._save_test_result(test_result)

            # Generate recommendations
            test_result.recommendations = self._generate_recommendations(test_result)

            logger.info(f"Lighthouse test completed in {test_result.test_duration:.2f}s")
            return test_result

        except subprocess.TimeoutExpired:
            raise ForgeError("Lighthouse test timed out (5 minutes)")
        except Exception as e:
            raise ForgeError(f"Performance test failed: {str(e)}")

    async def _check_lighthouse_availability(self) -> None:
        """Check if Lighthouse is available."""
        try:
            result = subprocess.run(
                "npx lighthouse --version",
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode != 0:
                raise ForgeError("Lighthouse not found. Install with: npm install -g lighthouse")
        except subprocess.TimeoutExpired:
            raise ForgeError("Lighthouse check timed out")

    def _parse_lighthouse_results(
        self,
        lighthouse_data: Dict[str, Any],
        url: str,
        device: str,
        start_time: datetime
    ) -> PerformanceTestResult:
        """Parse Lighthouse results into PerformanceTestResult."""
        categories = lighthouse_data.get('categories', {})

        # Extract category scores
        performance_score = self._get_category_score(categories, 'performance')
        accessibility_score = self._get_category_score(categories, 'accessibility')
        best_practices_score = self._get_category_score(categories, 'best-practices')
        seo_score = self._get_category_score(categories, 'seo')
        pwa_score = self._get_category_score(categories, 'pwa')

        # Extract Core Web Vitals
        audits = lighthouse_data.get('audits', {})
        core_web_vitals = CoreWebVitals(
            lcp=self._get_audit_value(audits, 'largest-contentful-paint', 'numericValue', 0),
            fid=self._get_audit_value(audits, 'max-potential-fid', 'numericValue', 0),
            cls=self._get_audit_value(audits, 'cumulative-layout-shift', 'numericValue', 0),
            fcp=self._get_audit_value(audits, 'first-contentful-paint', 'numericValue', 0),
            ttfb=self._get_audit_value(audits, 'server-response-time', 'numericValue', 0),
            si=self._get_audit_value(audits, 'speed-index', 'numericValue', 0)
        )

        # Extract audits
        performance_audits = []
        for audit_id, audit_data in audits.items():
            if audit_data.get('scoreDisplayMode') in ['numeric', 'binary']:
                performance_audits.append(PerformanceAudit(
                    id=audit_id,
                    title=audit_data.get('title', ''),
                    description=audit_data.get('description', ''),
                    score=audit_data.get('score'),
                    score_display_mode=audit_data.get('scoreDisplayMode', ''),
                    details=audit_data.get('details')
                ))

        # Calculate test duration
        test_duration = (datetime.now() - start_time).total_seconds()

        return PerformanceTestResult(
            url=url,
            timestamp=start_time,
            performance_score=performance_score,
            accessibility_score=accessibility_score,
            best_practices_score=best_practices_score,
            seo_score=seo_score,
            pwa_score=pwa_score,
            core_web_vitals=core_web_vitals,
            audits=performance_audits,
            recommendations=[],  # Will be filled later
            loading_experience=lighthouse_data.get('loadingExperience', {}).get('overall_category', 'UNKNOWN'),
            origin_loading_experience=lighthouse_data.get('originLoadingExperience', {}).get('overall_category', 'UNKNOWN'),
            device=device,
            test_duration=test_duration
        )

    def _get_category_score(self, categories: Dict[str, Any], category_id: str) -> float:
        """Extract score from category data."""
        return categories.get(category_id, {}).get('score', 0.0) * 100

    def _get_audit_value(self, audits: Dict[str, Any], audit_id: str, key: str, default: float = 0.0) -> float:
        """Get numeric value from audit data."""
        return audits.get(audit_id, {}).get(key, default)

    async def _save_test_result(self, result: PerformanceTestResult) -> None:
        """Save test result to database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO performance_tests (
                    url, timestamp, performance_score, accessibility_score,
                    best_practices_score, seo_score, pwa_score,
                    lcp, fid, cls, fcp, ttfb, si, device, test_duration,
                    recommendations, raw_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                result.url,
                result.timestamp,
                result.performance_score,
                result.accessibility_score,
                result.best_practices_score,
                result.seo_score,
                result.pwa_score,
                result.core_web_vitals.lcp,
                result.core_web_vitals.fid,
                result.core_web_vitals.cls,
                result.core_web_vitals.fcp,
                result.core_web_vitals.ttfb,
                result.core_web_vitals.si,
                result.device,
                result.test_duration,
                json.dumps(result.recommendations),
                json.dumps(asdict(result))
            ))

    def _generate_recommendations(self, result: PerformanceTestResult) -> List[str]:
        """Generate performance recommendations based on test results."""
        recommendations = []

        # Performance score recommendations
        if result.performance_score < 50:
            recommendations.append("Critical: Performance score is very low. Major optimizations needed.")
        elif result.performance_score < 80:
            recommendations.append("Warning: Performance score could be improved with optimizations.")

        # Core Web Vitals recommendations
        if result.core_web_vitals.lcp > 2500:
            recommendations.append("Optimize Largest Contentful Paint (LCP) - consider image optimization and server improvements.")

        if result.core_web_vitals.cls > 0.1:
            recommendations.append("Reduce Cumulative Layout Shift (CLS) - ensure proper image dimensions and ad placement.")

        if result.core_web_vitals.ttfb > 600:
            recommendations.append("Improve Time to First Byte (TTFB) - optimize server response time.")

        # Audit-specific recommendations
        for audit in result.audits:
            if audit.score and audit.score < 0.8:
                if audit.id == 'unused-css-rules':
                    recommendations.append("Remove unused CSS rules to reduce page weight.")
                elif audit.id == 'render-blocking-resources':
                    recommendations.append("Eliminate render-blocking resources to improve loading speed.")
                elif audit.id == 'uses-responsive-images':
                    recommendations.append("Implement responsive images for better mobile performance.")
                elif audit.id == 'efficient-animated-content':
                    recommendations.append("Optimize animated content for better performance.")

        return recommendations

    def get_performance_history(
        self,
        url: Optional[str] = None,
        days: int = 30,
        device: Optional[str] = None
    ) -> List[PerformanceTestResult]:
        """Get performance test history."""
        with sqlite3.connect(self.db_path) as conn:
            query = """
                SELECT raw_data FROM performance_tests
                WHERE timestamp >= datetime('now', '-{} days')
            """.format(days)

            params = []
            if url:
                query += " AND url = ?"
                params.append(url)

            if device:
                query += " AND device = ?"
                params.append(device)

            query += " ORDER BY timestamp DESC"

            cursor = conn.execute(query, params)
            results = []

            for row in cursor.fetchall():
                data = json.loads(row[0])
                # Convert timestamp string back to datetime
                data['timestamp'] = datetime.fromisoformat(data['timestamp'])
                results.append(PerformanceTestResult(**data))

            return results

    def generate_performance_report(
        self,
        url: str,
        days: int = 30,
        format: str = "html"
    ) -> str:
        """Generate performance report."""
        history = self.get_performance_history(url, days)

        if not history:
            raise ForgeError(f"No performance data found for {url} in the last {days} days")

        # Calculate trends and averages
        performance_scores = [r.performance_score for r in history]
        avg_performance = sum(performance_scores) / len(performance_scores)

        # Generate report content
        if format == "html":
            return self._generate_html_report(url, history, avg_performance)
        elif format == "json":
            return json.dumps({
                'url': url,
                'period_days': days,
                'total_tests': len(history),
                'average_performance': avg_performance,
                'latest_score': performance_scores[0],
                'trend': 'improving' if performance_scores[0] > performance_scores[-1] else 'declining',
                'history': [asdict(r) for r in history]
            }, indent=2)
        else:
            raise ForgeError(f"Unsupported report format: {format}")

    def _generate_html_report(self, url: str, history: List[PerformanceTestResult], avg_performance: float) -> str:
        """Generate HTML performance report."""
        latest = history[0]

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Performance Report - {url}</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .score {{ font-size: 24px; font-weight: bold; margin: 10px 0; }}
                .good {{ color: #0c9; }}
                .warning {{ color: #f90; }}
                .critical {{ color: #f00; }}
                .metric {{ margin: 10px 0; }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            <h1>Performance Report</h1>
            <h2>{url}</h2>

            <div class="metric">
                <strong>Latest Performance Score:</strong>
                <span class="score {self._get_score_class(latest.performance_score)}">
                    {latest.performance_score:.1f}
                </span>
            </div>

            <div class="metric">
                <strong>Average Performance (Last {len(history)} tests):</strong>
                <span class="score {self._get_score_class(avg_performance)}">
                    {avg_performance:.1f}
                </span>
            </div>

            <div class="metric">
                <strong>Last Test:</strong> {latest.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
            </div>

            <h3>Core Web Vitals (Latest)</h3>
            <table>
                <tr><th>Metric</th><th>Value</th><th>Status</th></tr>
                <tr>
                    <td>Largest Contentful Paint (LCP)</td>
                    <td>{latest.core_web_vitals.lcp:.0f}ms</td>
                    <td class="{self._get_cwv_class('lcp', latest.core_web_vitals.lcp)}">{self._get_cwv_status('lcp', latest.core_web_vitals.lcp)}</td>
                </tr>
                <tr>
                    <td>First Input Delay (FID)</td>
                    <td>{latest.core_web_vitals.fid:.0f}ms</td>
                    <td class="{self._get_cwv_class('fid', latest.core_web_vitals.fid)}">{self._get_cwv_status('fid', latest.core_web_vitals.fid)}</td>
                </tr>
                <tr>
                    <td>Cumulative Layout Shift (CLS)</td>
                    <td>{latest.core_web_vitals.cls:.3f}</td>
                    <td class="{self._get_cwv_class('cls', latest.core_web_vitals.cls)}">{self._get_cwv_status('cls', latest.core_web_vitals.cls)}</td>
                </tr>
            </table>

            <h3>Recommendations</h3>
            <ul>
        """

        for rec in latest.recommendations:
            html += f"<li>{rec}</li>"

        html += """
            </ul>
        </body>
        </html>
        """

        return html

    def _get_score_class(self, score: float) -> str:
        """Get CSS class for performance score."""
        if score >= 80:
            return "good"
        elif score >= 50:
            return "warning"
        else:
            return "critical"

    def _get_cwv_class(self, metric: str, value: float) -> str:
        """Get CSS class for Core Web Vitals metric."""
        thresholds = {
            'lcp': [(2500, 'good'), (4000, 'warning')],
            'fid': [(100, 'good'), (300, 'warning')],
            'cls': [(0.1, 'good'), (0.25, 'warning')]
        }

        for threshold, css_class in thresholds.get(metric, []):
            if value <= threshold:
                return css_class
        return 'critical'

    def _get_cwv_status(self, metric: str, value: float) -> str:
        """Get status text for Core Web Vitals metric."""
        css_class = self._get_cwv_class(metric, value)
        status_map = {
            'good': 'Good',
            'warning': 'Needs Improvement',
            'critical': 'Poor'
        }
        return status_map.get(css_class, 'Unknown')

    async def run_competitor_analysis(
        self,
        urls: List[str],
        device: str = "desktop"
    ) -> Dict[str, PerformanceTestResult]:
        """Run performance tests on multiple URLs for competitor analysis."""
        results = {}

        # Run tests concurrently
        tasks = [
            self.run_lighthouse_test(url, device)
            for url in urls
        ]

        completed_results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, result in zip(urls, completed_results):
            if isinstance(result, Exception):
                logger.error(f"Failed to test {url}: {result}")
                continue
            results[url] = result

        return results

    def save_performance_budget(self, budget: PerformanceBudget) -> None:
        """Save performance budget configuration."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO performance_budgets (
                    project_path, budget_type, resource_type, max_value, warning_threshold
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                str(self.project_path),
                budget.budget_type,
                budget.resource_type,
                budget.max_value,
                budget.warning_threshold
            ))

    def check_performance_budgets(self, result: PerformanceTestResult) -> List[str]:
        """Check if performance test results meet budget requirements."""
        violations = []

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT budget_type, resource_type, max_value, warning_threshold
                FROM performance_budgets
                WHERE project_path = ?
            """, (str(self.project_path),))

            for budget_type, resource_type, max_value, warning_threshold in cursor.fetchall():
                # Check various budget types
                if budget_type == "performance_score" and result.performance_score < max_value:
                    violations.append(f"Performance score ({result.performance_score:.1f}) below budget ({max_value})")
                elif budget_type == "lcp" and result.core_web_vitals.lcp > max_value:
                    violations.append(f"LCP ({result.core_web_vitals.lcp:.0f}ms) exceeds budget ({max_value}ms)")
                elif budget_type == "cls" and result.core_web_vitals.cls > max_value:
                    violations.append(f"CLS ({result.core_web_vitals.cls:.3f}) exceeds budget ({max_value})")

        return violations
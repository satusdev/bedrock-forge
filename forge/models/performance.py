"""
Performance data models for Bedrock Forge.

Defines data structures for performance testing, monitoring,
and optimization results.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum
import json


class PerformanceGrade(Enum):
    """Performance grade classification."""
    EXCELLENT = "excellent"
    GOOD = "good"
    NEEDS_IMPROVEMENT = "needs_improvement"
    POOR = "poor"


class DeviceType(Enum):
    """Device types for performance testing."""
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"


class AlertLevel(Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class CoreWebVitals:
    """Core Web Vitals metrics."""
    lcp: float = 0.0  # Largest Contentful Paint (ms)
    fid: float = 0.0  # First Input Delay (ms)
    cls: float = 0.0  # Cumulative Layout Shift
    fcp: float = 0.0  # First Contentful Paint (ms)
    ttfb: float = 0.0  # Time to First Byte (ms)
    si: float = 0.0  # Speed Index (ms)

    def get_grade(self) -> PerformanceGrade:
        """Get overall Core Web Vitals grade."""
        lcp_grade = self._get_lcp_grade()
        cls_grade = self._get_cls_grade()
        fid_grade = self._get_fid_grade()

        grades = [lcp_grade, cls_grade, fid_grade]

        if all(g == PerformanceGrade.EXCELLENT for g in grades):
            return PerformanceGrade.EXCELLENT
        elif all(g in [PerformanceGrade.EXCELLENT, PerformanceGrade.GOOD] for g in grades):
            return PerformanceGrade.GOOD
        elif PerformanceGrade.POOR in grades:
            return PerformanceGrade.POOR
        else:
            return PerformanceGrade.NEEDS_IMPROVEMENT

    def _get_lcp_grade(self) -> PerformanceGrade:
        """Get LCP grade."""
        if self.lcp <= 2500:
            return PerformanceGrade.EXCELLENT
        elif self.lcp <= 4000:
            return PerformanceGrade.GOOD
        else:
            return PerformanceGrade.POOR

    def _get_cls_grade(self) -> PerformanceGrade:
        """Get CLS grade."""
        if self.cls <= 0.1:
            return PerformanceGrade.EXCELLENT
        elif self.cls <= 0.25:
            return PerformanceGrade.GOOD
        else:
            return PerformanceGrade.POOR

    def _get_fid_grade(self) -> PerformanceGrade:
        """Get FID grade."""
        if self.fid <= 100:
            return PerformanceGrade.EXCELLENT
        elif self.fid <= 300:
            return PerformanceGrade.GOOD
        else:
            return PerformanceGrade.POOR


@dataclass
class PerformanceScore:
    """Individual performance category score."""
    category: str
    score: float
    grade: PerformanceGrade
    title: str
    description: str
    recommendations: List[str] = field(default_factory=list)

    def __post_init__(self):
        """Calculate grade based on score."""
        if self.grade == PerformanceGrade.EXCELLENT:  # If grade manually set
            return

        if self.score >= 90:
            self.grade = PerformanceGrade.EXCELLENT
        elif self.score >= 70:
            self.grade = PerformanceGrade.GOOD
        elif self.score >= 50:
            self.grade = PerformanceGrade.NEEDS_IMPROVEMENT
        else:
            self.grade = PerformanceGrade.POOR


@dataclass
class PerformanceAudit:
    """Individual audit result from performance testing."""
    id: str
    title: str
    description: str
    score: Optional[float]
    grade: PerformanceGrade
    score_display_mode: str
    details: Optional[Dict[str, Any]] = None
    numeric_value: Optional[float] = None
    numeric_unit: Optional[str] = None

    def __post_init__(self):
        """Calculate grade based on score."""
        if self.grade == PerformanceGrade.EXCELLENT:  # If grade manually set
            return

        if self.score is None:
            self.grade = PerformanceGrade.NEEDS_IMPROVEMENT
        elif self.score >= 0.9:
            self.grade = PerformanceGrade.EXCELLENT
        elif self.score >= 0.7:
            self.grade = PerformanceGrade.GOOD
        elif self.score >= 0.5:
            self.grade = PerformanceGrade.NEEDS_IMPROVEMENT
        else:
            self.grade = PerformanceGrade.POOR


@dataclass
class PerformanceTest:
    """Complete performance test result."""
    id: Optional[str] = None
    url: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    device: DeviceType = DeviceType.DESKTOP
    test_duration: float = 0.0

    # Category scores
    performance_score: PerformanceScore = field(default_factory=lambda: PerformanceScore(
        category="performance", score=0.0, grade=PerformanceGrade.POOR,
        title="Performance", description="Measures loading speed and interactivity"
    ))
    accessibility_score: PerformanceScore = field(default_factory=lambda: PerformanceScore(
        category="accessibility", score=0.0, grade=PerformanceGrade.POOR,
        title="Accessibility", description="Measures accessibility for users with disabilities"
    ))
    best_practices_score: PerformanceScore = field(default_factory=lambda: PerformanceScore(
        category="best-practices", score=0.0, grade=PerformanceGrade.POOR,
        title="Best Practices", description="Measures modern web development best practices"
    ))
    seo_score: PerformanceScore = field(default_factory=lambda: PerformanceScore(
        category="seo", score=0.0, grade=PerformanceGrade.POOR,
        title="SEO", description="Measures search engine optimization"
    ))
    pwa_score: Optional[PerformanceScore] = None

    # Core Web Vitals
    core_web_vitals: CoreWebVitals = field(default_factory=CoreWebVitals)

    # Audits and recommendations
    audits: List[PerformanceAudit] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    loading_experience: str = "UNKNOWN"
    origin_loading_experience: str = "UNKNOWN"

    # Resource metrics
    total_size: float = 0.0  # Total page size in bytes
    resource_count: int = 0
    script_count: int = 0
    stylesheet_count: int = 0
    image_count: int = 0

    def get_overall_grade(self) -> PerformanceGrade:
        """Get overall performance grade."""
        scores = [
            self.performance_score.score,
            self.accessibility_score.score,
            self.best_practices_score.score,
            self.seo_score.score
        ]

        avg_score = sum(scores) / len(scores)

        if avg_score >= 90:
            return PerformanceGrade.EXCELLENT
        elif avg_score >= 70:
            return PerformanceGrade.GOOD
        elif avg_score >= 50:
            return PerformanceGrade.NEEDS_IMPROVEMENT
        else:
            return PerformanceGrade.POOR

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'url': self.url,
            'timestamp': self.timestamp.isoformat(),
            'device': self.device.value,
            'test_duration': self.test_duration,
            'performance_score': {
                'category': self.performance_score.category,
                'score': self.performance_score.score,
                'grade': self.performance_score.grade.value,
                'title': self.performance_score.title,
                'description': self.performance_score.description,
                'recommendations': self.performance_score.recommendations
            },
            'accessibility_score': {
                'category': self.accessibility_score.category,
                'score': self.accessibility_score.score,
                'grade': self.accessibility_score.grade.value,
                'title': self.accessibility_score.title,
                'description': self.accessibility_score.description,
                'recommendations': self.accessibility_score.recommendations
            },
            'best_practices_score': {
                'category': self.best_practices_score.category,
                'score': self.best_practices_score.score,
                'grade': self.best_practices_score.grade.value,
                'title': self.best_practices_score.title,
                'description': self.best_practices_score.description,
                'recommendations': self.best_practices_score.recommendations
            },
            'seo_score': {
                'category': self.seo_score.category,
                'score': self.seo_score.score,
                'grade': self.seo_score.grade.value,
                'title': self.seo_score.title,
                'description': self.seo_score.description,
                'recommendations': self.seo_score.recommendations
            },
            'pwa_score': {
                'category': self.pwa_score.category,
                'score': self.pwa_score.score,
                'grade': self.pwa_score.grade.value,
                'title': self.pwa_score.title,
                'description': self.pwa_score.description,
                'recommendations': self.pwa_score.recommendations
            } if self.pwa_score else None,
            'core_web_vitals': {
                'lcp': self.core_web_vitals.lcp,
                'fid': self.core_web_vitals.fid,
                'cls': self.core_web_vitals.cls,
                'fcp': self.core_web_vitals.fcp,
                'ttfb': self.core_web_vitals.ttfb,
                'si': self.core_web_vitals.si,
                'grade': self.core_web_vitals.get_grade().value
            },
            'audits': [
                {
                    'id': audit.id,
                    'title': audit.title,
                    'description': audit.description,
                    'score': audit.score,
                    'grade': audit.grade.value,
                    'score_display_mode': audit.score_display_mode,
                    'numeric_value': audit.numeric_value,
                    'numeric_unit': audit.numeric_unit
                } for audit in self.audits
            ],
            'recommendations': self.recommendations,
            'loading_experience': self.loading_experience,
            'origin_loading_experience': self.origin_loading_experience,
            'total_size': self.total_size,
            'resource_count': self.resource_count,
            'script_count': self.script_count,
            'stylesheet_count': self.stylesheet_count,
            'image_count': self.image_count,
            'overall_grade': self.get_overall_grade().value
        }


@dataclass
class PerformanceBudget:
    """Performance budget configuration."""
    id: Optional[str] = None
    project_path: str = ""
    budget_type: str = ""  # performance_score, lcp, cls, fid, total_size, etc.
    resource_type: str = ""  # page, script, stylesheet, image, etc.
    max_value: float = 0.0
    warning_threshold: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True

    def check_violation(self, value: float) -> AlertLevel:
        """Check if value violates budget."""
        if value > self.max_value:
            return AlertLevel.CRITICAL
        elif value > self.warning_threshold:
            return AlertLevel.WARNING
        else:
            return AlertLevel.INFO


@dataclass
class PerformanceTarget:
    """Performance target configuration."""
    id: Optional[str] = None
    project_path: str = ""
    metric: str = ""  # performance_score, lcp, cls, fid, etc.
    target_value: float = 0.0
    warning_threshold: float = 0.0
    critical_threshold: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True

    def check_performance(self, value: float) -> AlertLevel:
        """Check if performance meets target."""
        if value < self.critical_threshold:
            return AlertLevel.CRITICAL
        elif value < self.warning_threshold:
            return AlertLevel.WARNING
        else:
            return AlertLevel.INFO


@dataclass
class PerformanceAlert:
    """Performance alert configuration."""
    id: Optional[str] = None
    project_path: str = ""
    alert_type: str = ""  # budget_violation, target_miss, regression
    metric: str = ""
    current_value: float = 0.0
    threshold_value: float = 0.0
    severity: AlertLevel = AlertLevel.INFO
    message: str = ""
    url: str = ""
    device: DeviceType = DeviceType.DESKTOP
    created_at: datetime = field(default_factory=datetime.now)
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None


@dataclass
class PerformanceTrend:
    """Performance trend analysis."""
    metric: str
    current_value: float
    previous_value: float
    trend_direction: str  # improving, declining, stable
    change_percentage: float
    significance: str  # significant, moderate, minimal
    timeframe_days: int = 30

    def get_trend_description(self) -> str:
        """Get human-readable trend description."""
        if self.trend_direction == "stable":
            return f"{self.metric} has remained stable over the last {self.timeframe_days} days"
        elif self.trend_direction == "improving":
            return f"{self.metric} has improved by {abs(self.change_percentage):.1f}% over the last {self.timeframe_days} days"
        else:
            return f"{self.metric} has declined by {abs(self.change_percentage):.1f}% over the last {self.timeframe_days} days"


@dataclass
class PerformanceReport:
    """Complete performance report."""
    project_path: str = ""
    url: str = ""
    report_period_days: int = 30
    generated_at: datetime = field(default_factory=datetime.now)

    # Summary metrics
    total_tests: int = 0
    average_performance_score: float = 0.0
    best_performance_score: float = 0.0
    worst_performance_score: float = 0.0

    # Core Web Vitals averages
    average_lcp: float = 0.0
    average_fid: float = 0.0
    average_cls: float = 0.0

    # Trends
    performance_trend: Optional[PerformanceTrend] = None
    cwv_trends: Dict[str, PerformanceTrend] = field(default_factory=dict)

    # Issues and recommendations
    critical_issues: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    budget_violations: List[str] = field(default_factory=list)

    # Test results
    test_results: List[PerformanceTest] = field(default_factory=list)

    def get_executive_summary(self) -> str:
        """Get executive summary of performance report."""
        grade_map = {
            PerformanceGrade.EXCELLENT: "excellent",
            PerformanceGrade.GOOD: "good",
            PerformanceGrade.NEEDS_IMPROVEMENT: "needs improvement",
            PerformanceGrade.POOR: "poor"
        }

        if not self.test_results:
            return "No performance data available for the selected period."

        latest_test = self.test_results[0]
        latest_grade = grade_map[latest_test.get_overall_grade()]

        summary = f"""
Performance Summary for {self.url}

Overall Performance Grade: {latest_grade.title()}
Average Performance Score: {self.average_performance_score:.1f}/100
Tests Analyzed: {self.total_tests} over {self.report_period_days} days

Core Web Vitals:
- Largest Contentful Paint (LCP): {self.average_lcp:.0f}ms
- First Input Delay (FID): {self.average_fid:.0f}ms
- Cumulative Layout Shift (CLS): {self.average_cls:.3f}
"""

        if self.critical_issues:
            summary += f"\nCritical Issues Found: {len(self.critical_issues)}"

        if self.budget_violations:
            summary += f"\nBudget Violations: {len(self.budget_violations)}"

        return summary.strip()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'project_path': self.project_path,
            'url': self.url,
            'report_period_days': self.report_period_days,
            'generated_at': self.generated_at.isoformat(),
            'total_tests': self.total_tests,
            'average_performance_score': self.average_performance_score,
            'best_performance_score': self.best_performance_score,
            'worst_performance_score': self.worst_performance_score,
            'average_lcp': self.average_lcp,
            'average_fid': self.average_fid,
            'average_cls': self.average_cls,
            'performance_trend': {
                'metric': self.performance_trend.metric,
                'current_value': self.performance_trend.current_value,
                'previous_value': self.performance_trend.previous_value,
                'trend_direction': self.performance_trend.trend_direction,
                'change_percentage': self.performance_trend.change_percentage,
                'significance': self.performance_trend.significance,
                'timeframe_days': self.performance_trend.timeframe_days
            } if self.performance_trend else None,
            'cwv_trends': {
                metric: {
                    'metric': trend.metric,
                    'current_value': trend.current_value,
                    'previous_value': trend.previous_value,
                    'trend_direction': trend.trend_direction,
                    'change_percentage': trend.change_percentage,
                    'significance': trend.significance,
                    'timeframe_days': trend.timeframe_days
                } for metric, trend in self.cwv_trends.items()
            },
            'critical_issues': self.critical_issues,
            'recommendations': self.recommendations,
            'budget_violations': self.budget_violations,
            'test_results': [test.to_dict() for test in self.test_results],
            'executive_summary': self.get_executive_summary()
        }
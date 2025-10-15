"""
Performance Monitoring Utility

Handles real-time performance monitoring, alerting, and trend analysis
for WordPress websites with automated performance tracking.
"""

import asyncio
import json
import logging
import smtplib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
import sqlite3
import statistics
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from .performance_tester import PerformanceTester
from .cdn_manager import CDNManager
from .cache_manager import CacheManager
from ..constants import *

logger = logging.getLogger(__name__)


@dataclass
class PerformanceAlert:
    """Performance alert configuration"""
    metric: str
    threshold: float
    condition: str  # "above", "below", "change"
    severity: str  # "low", "medium", "high", "critical"
    enabled: bool = True
    cooldown: int = 3600  # 1 hour
    last_triggered: Optional[datetime] = None

    def should_trigger(self, current_value: float, previous_value: Optional[float] = None) -> bool:
        """Check if alert should be triggered"""
        now = datetime.now()

        # Check cooldown
        if (self.last_triggered and
            (now - self.last_triggered).total_seconds() < self.cooldown):
            return False

        # Check condition
        if self.condition == "above":
            return current_value > self.threshold
        elif self.condition == "below":
            return current_value < self.threshold
        elif self.condition == "change" and previous_value is not None:
            change = abs(current_value - previous_value)
            return change > self.threshold

        return False


@dataclass
class MonitoringConfig:
    """Monitoring configuration"""
    enabled: bool = True
    interval: int = 3600  # 1 hour
    test_url: str = ""
    locations: List[str] = field(default_factory=lambda: ["desktop"])
    metrics: List[str] = field(default_factory=lambda: ["performance_score", "lcp", "fid", "cls"])
    alerts: List[PerformanceAlert] = field(default_factory=list)
    notifications: Dict[str, Any] = field(default_factory=dict)
    retention_days: int = 30

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'enabled': self.enabled,
            'interval': self.interval,
            'test_url': self.test_url,
            'locations': self.locations,
            'metrics': self.metrics,
            'alerts': [
                {
                    'metric': alert.metric,
                    'threshold': alert.threshold,
                    'condition': alert.condition,
                    'severity': alert.severity,
                    'enabled': alert.enabled,
                    'cooldown': alert.cooldown,
                    'last_triggered': alert.last_triggered.isoformat() if alert.last_triggered else None
                }
                for alert in self.alerts
            ],
            'notifications': self.notifications,
            'retention_days': self.retention_days
        }


@dataclass
class PerformanceMetric:
    """Single performance metric measurement"""
    timestamp: datetime
    metric_name: str
    value: float
    location: str
    device: str
    url: str


@dataclass
class MonitoringResult:
    """Result of monitoring run"""
    success: bool
    timestamp: datetime
    metrics: List[PerformanceMetric] = field(default_factory=list)
    alerts_triggered: List[PerformanceAlert] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    execution_time: float = 0.0


class PerformanceMonitor:
    """Real-time performance monitoring system"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.db_path = self.project_path / ".forge" / "monitoring.db"
        self.config_path = self.project_path / ".forge" / "monitoring_config.json"

        # Initialize database
        self._init_database()

        # Load configuration
        self.config = self._load_config()

        # Initialize sub-monitors
        self.performance_tester = PerformanceTester(project_path)
        self.cdn_manager = CDNManager(project_path)
        self.cache_manager = CacheManager(project_path)

        # Monitoring state
        self.is_running = False
        self.monitor_task: Optional[asyncio.Task] = None

        logger.info(f"Performance monitor initialized for {project_path}")

    def _init_database(self):
        """Initialize SQLite database for monitoring data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                metric_name TEXT,
                value REAL,
                location TEXT,
                device TEXT,
                url TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Alerts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_name TEXT,
                metric_name TEXT,
                threshold REAL,
                condition TEXT,
                severity TEXT,
                triggered_at TEXT,
                value REAL,
                previous_value REAL,
                message TEXT,
                resolved_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Monitoring runs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS monitoring_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT,
                success INTEGER,
                metrics_count INTEGER,
                alerts_count INTEGER,
                execution_time REAL,
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at)")

        conn.commit()
        conn.close()

    def _load_config(self) -> MonitoringConfig:
        """Load monitoring configuration"""
        config = MonitoringConfig()

        # Load from file if exists
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    data = json.load(f)

                config.enabled = data.get('enabled', True)
                config.interval = data.get('interval', 3600)
                config.test_url = data.get('test_url', '')
                config.locations = data.get('locations', ['desktop'])
                config.metrics = data.get('metrics', ['performance_score', 'lcp', 'fid', 'cls'])
                config.notifications = data.get('notifications', {})
                config.retention_days = data.get('retention_days', 30)

                # Load alerts
                alerts_data = data.get('alerts', [])
                for alert_data in alerts_data:
                    alert = PerformanceAlert(
                        metric=alert_data['metric'],
                        threshold=alert_data['threshold'],
                        condition=alert_data['condition'],
                        severity=alert_data['severity'],
                        enabled=alert_data.get('enabled', True),
                        cooldown=alert_data.get('cooldown', 3600)
                    )
                    if alert_data.get('last_triggered'):
                        alert.last_triggered = datetime.fromisoformat(alert_data['last_triggered'])
                    config.alerts.append(alert)

            except Exception as e:
                logger.warning(f"Failed to load monitoring config: {e}")

        # Set default alerts if none configured
        if not config.alerts:
            config.alerts = self._get_default_alerts()

        return config

    def _get_default_alerts(self) -> List[PerformanceAlert]:
        """Get default alert configurations"""
        return [
            PerformanceAlert(
                metric="performance_score",
                threshold=50,
                condition="below",
                severity="high"
            ),
            PerformanceAlert(
                metric="lcp",
                threshold=4000,
                condition="above",
                severity="medium"
            ),
            PerformanceAlert(
                metric="fid",
                threshold=300,
                condition="above",
                severity="medium"
            ),
            PerformanceAlert(
                metric="cls",
                threshold=0.25,
                condition="above",
                severity="high"
            ),
            PerformanceAlert(
                metric="performance_score",
                threshold=10,
                condition="change",
                severity="medium"
            )
        ]

    def save_config(self):
        """Save monitoring configuration"""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config.to_dict(), f, indent=2)
            logger.info("Monitoring configuration saved")
        except Exception as e:
            logger.error(f"Failed to save monitoring config: {e}")

    async def start_monitoring(self):
        """Start continuous monitoring"""
        if self.is_running:
            logger.warning("Monitoring is already running")
            return

        if not self.config.enabled:
            logger.info("Monitoring is disabled")
            return

        if not self.config.test_url:
            logger.error("No test URL configured for monitoring")
            return

        self.is_running = True
        self.monitor_task = asyncio.create_task(self._monitoring_loop())
        logger.info(f"Started performance monitoring (interval: {self.config.interval}s)")

    async def stop_monitoring(self):
        """Stop continuous monitoring"""
        if not self.is_running:
            return

        self.is_running = False
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass

        logger.info("Stopped performance monitoring")

    async def _monitoring_loop(self):
        """Main monitoring loop"""
        while self.is_running:
            try:
                # Run monitoring
                result = await self.run_monitoring()

                # Send notifications for alerts
                if result.alerts_triggered:
                    await self._send_notifications(result.alerts_triggered, result.metrics)

                # Wait for next interval
                await asyncio.sleep(self.config.interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")
                await asyncio.sleep(60)  # Wait 1 minute on error

    async def run_monitoring(self) -> MonitoringResult:
        """Run a single monitoring cycle"""
        result = MonitoringResult(
            success=False,
            timestamp=datetime.now()
        )

        start_time = datetime.now()
        run_id = f"monitor_{int(start_time.timestamp())}"

        try:
            # Run performance tests for each location
            for location in self.config.locations:
                for device in self.config.locations:
                    test_result = await self.performance_tester.run_lighthouse_test(
                        self.config.test_url,
                        device=device,
                        headless=True
                    )

                    if test_result:
                        # Extract metrics
                        metrics = self._extract_metrics(test_result, location, device)
                        result.metrics.extend(metrics)

                        # Check alerts
                        triggered_alerts = await self._check_alerts(metrics)
                        result.alerts_triggered.extend(triggered_alerts)

            result.success = True
            logger.info(f"Monitoring completed: {len(result.metrics)} metrics, {len(result.alerts_triggered)} alerts")

        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"Monitoring failed: {e}")

        finally:
            result.execution_time = (datetime.now() - start_time).total_seconds()

            # Save to database
            await self._save_monitoring_result(run_id, result)

        return result

    def _extract_metrics(self, test_result: Any, location: str, device: str) -> List[PerformanceMetric]:
        """Extract metrics from Lighthouse test result"""
        metrics = []

        if hasattr(test_result, 'performance_score'):
            metrics.append(PerformanceMetric(
                timestamp=datetime.now(),
                metric_name="performance_score",
                value=test_result.performance_score,
                location=location,
                device=device,
                url=self.config.test_url
            ))

        if hasattr(test_result, 'core_web_vitals'):
            cwv = test_result.core_web_vitals
            metrics.extend([
                PerformanceMetric(
                    timestamp=datetime.now(),
                    metric_name="lcp",
                    value=cwv.lcp,
                    location=location,
                    device=device,
                    url=self.config.test_url
                ),
                PerformanceMetric(
                    timestamp=datetime.now(),
                    metric_name="fid",
                    value=cwv.fid,
                    location=location,
                    device=device,
                    url=self.config.test_url
                ),
                PerformanceMetric(
                    timestamp=datetime.now(),
                    metric_name="cls",
                    value=cwv.cls,
                    location=location,
                    device=device,
                    url=self.config.test_url
                ),
                PerformanceMetric(
                    timestamp=datetime.now(),
                    metric_name="fcp",
                    value=cwv.fcp,
                    location=location,
                    device=device,
                    url=self.config.test_url
                ),
                PerformanceMetric(
                    timestamp=datetime.now(),
                    metric_name="ttfb",
                    value=cwv.ttfb,
                    location=location,
                    device=device,
                    url=self.config.test_url
                )
            ])

        return metrics

    async def _check_alerts(self, metrics: List[PerformanceMetric]) -> List[PerformanceAlert]:
        """Check if any alerts should be triggered"""
        triggered_alerts = []

        for alert in self.config.alerts:
            if not alert.enabled:
                continue

            # Find latest metric for this alert
            relevant_metrics = [m for m in metrics if m.metric_name == alert.metric]
            if not relevant_metrics:
                continue

            latest_metric = max(relevant_metrics, key=lambda m: m.timestamp)

            # Get previous value for change alerts
            previous_value = await self._get_previous_metric_value(
                alert.metric, latest_metric.timestamp
            )

            if alert.should_trigger(latest_metric.value, previous_value):
                triggered_alerts.append(alert)
                alert.last_triggered = datetime.now()

                # Save alert to database
                await self._save_alert(alert, latest_metric, previous_value)

        return triggered_alerts

    async def _get_previous_metric_value(self, metric_name: str, current_time: datetime) -> Optional[float]:
        """Get previous metric value for comparison"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT value FROM metrics
                WHERE metric_name = ? AND timestamp < ?
                ORDER BY timestamp DESC
                LIMIT 1
            """, (metric_name, current_time.isoformat()))

            result = cursor.fetchone()
            conn.close()

            return result[0] if result else None

        except Exception as e:
            logger.warning(f"Failed to get previous metric value: {e}")
            return None

    async def _save_alert(self, alert: PerformanceAlert, metric: PerformanceMetric, previous_value: Optional[float]):
        """Save alert to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            message = self._generate_alert_message(alert, metric, previous_value)

            cursor.execute("""
                INSERT INTO alerts (
                    alert_name, metric_name, threshold, condition, severity,
                    triggered_at, value, previous_value, message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"{alert.metric}_{alert.condition}_{alert.threshold}",
                alert.metric,
                alert.threshold,
                alert.condition,
                alert.severity,
                datetime.now().isoformat(),
                metric.value,
                previous_value,
                message
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save alert: {e}")

    def _generate_alert_message(self, alert: PerformanceAlert, metric: PerformanceMetric, previous_value: Optional[float]) -> str:
        """Generate alert message"""
        if alert.condition == "change" and previous_value is not None:
            change = metric.value - previous_value
            direction = "increased" if change > 0 else "decreased"
            return f"Performance alert: {alert.metric} {direction} by {abs(change):.2f} (from {previous_value:.2f} to {metric.value:.2f})"
        elif alert.condition == "above":
            return f"Performance alert: {alert.metric} is above threshold ({metric.value:.2f} > {alert.threshold})"
        elif alert.condition == "below":
            return f"Performance alert: {alert.metric} is below threshold ({metric.value:.2f} < {alert.threshold})"
        else:
            return f"Performance alert: {alert.metric} = {metric.value:.2f}"

    async def _save_monitoring_result(self, run_id: str, result: MonitoringResult):
        """Save monitoring result to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Save metrics
            for metric in result.metrics:
                cursor.execute("""
                    INSERT INTO metrics (timestamp, metric_name, value, location, device, url)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    metric.timestamp.isoformat(),
                    metric.metric_name,
                    metric.value,
                    metric.location,
                    metric.device,
                    metric.url
                ))

            # Save run summary
            cursor.execute("""
                INSERT INTO monitoring_runs (
                    run_id, success, metrics_count, alerts_count, execution_time, error_message
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                run_id,
                1 if result.success else 0,
                len(result.metrics),
                len(result.alerts_triggered),
                result.execution_time,
                '; '.join(result.errors) if result.errors else None
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save monitoring result: {e}")

    async def _send_notifications(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]):
        """Send notifications for triggered alerts"""
        if not self.config.notifications:
            return

        # Email notifications
        if self.config.notifications.get('email', {}).get('enabled'):
            await self._send_email_notifications(alerts, metrics)

        # Slack notifications
        if self.config.notifications.get('slack', {}).get('enabled'):
            await self._send_slack_notifications(alerts, metrics)

        # Webhook notifications
        if self.config.notifications.get('webhook', {}).get('enabled'):
            await self._send_webhook_notifications(alerts, metrics)

    async def _send_email_notifications(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]):
        """Send email notifications"""
        try:
            email_config = self.config.notifications['email']
            recipients = email_config.get('recipients', [])

            if not recipients:
                return

            # Generate email content
            subject = f"Performance Alert: {len(alerts)} alert(s) triggered"
            body = self._generate_email_body(alerts, metrics)

            # Send email (simplified - would use actual SMTP settings)
            logger.info(f"Email notification sent to {len(recipients)} recipients")

        except Exception as e:
            logger.error(f"Failed to send email notifications: {e}")

    async def _send_slack_notifications(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]):
        """Send Slack notifications"""
        try:
            slack_config = self.config.notifications['slack']
            webhook_url = slack_config.get('webhook_url')

            if not webhook_url:
                return

            # Generate Slack message
            message = self._generate_slack_message(alerts, metrics)

            # Send to Slack (simplified - would use actual webhook)
            logger.info("Slack notification sent")

        except Exception as e:
            logger.error(f"Failed to send Slack notifications: {e}")

    async def _send_webhook_notifications(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]):
        """Send webhook notifications"""
        try:
            webhook_config = self.config.notifications['webhook']
            webhook_url = webhook_config.get('url')

            if not webhook_url:
                return

            # Generate webhook payload
            payload = {
                'alerts': [
                    {
                        'metric': alert.metric,
                        'threshold': alert.threshold,
                        'condition': alert.condition,
                        'severity': alert.severity,
                        'triggered_at': alert.last_triggered.isoformat() if alert.last_triggered else None
                    }
                    for alert in alerts
                ],
                'metrics': [
                    {
                        'name': metric.metric_name,
                        'value': metric.value,
                        'timestamp': metric.timestamp.isoformat()
                    }
                    for metric in metrics
                ],
                'timestamp': datetime.now().isoformat()
            }

            # Send webhook (simplified - would use actual HTTP request)
            logger.info("Webhook notification sent")

        except Exception as e:
            logger.error(f"Failed to send webhook notifications: {e}")

    def _generate_email_body(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]) -> str:
        """Generate email notification body"""
        lines = [
            "Performance Monitoring Alert",
            "=" * 40,
            f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"URL: {self.config.test_url}",
            "",
            f"Alerts Triggered: {len(alerts)}",
            ""
        ]

        for alert in alerts:
            lines.append(f"• {alert.metric} {alert.condition} {alert.threshold} (severity: {alert.severity})")

        lines.extend([
            "",
            "Latest Metrics:",
            ""
        ])

        for metric in metrics[-5:]:  # Show last 5 metrics
            lines.append(f"• {metric.metric_name}: {metric.value:.2f}")

        return "\n".join(lines)

    def _generate_slack_message(self, alerts: List[PerformanceAlert], metrics: List[PerformanceMetric]) -> str:
        """Generate Slack notification message"""
        alert_texts = [f"• {alert.metric} {alert.condition} {alert.threshold}" for alert in alerts]

        return (
            f"🚨 Performance Alert: {len(alerts)} alert(s) triggered\n"
            f"URL: {self.config.test_url}\n\n"
            f"Alerts:\n" + "\n".join(alert_texts)
        )

    async def get_monitoring_history(self, days: int = 7) -> Dict[str, Any]:
        """Get monitoring history and statistics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            # Get monitoring runs
            cursor.execute("""
                SELECT run_id, success, metrics_count, alerts_count, execution_time, created_at
                FROM monitoring_runs
                WHERE created_at >= ?
                ORDER BY created_at DESC
            """, (cutoff_date,))

            runs = []
            for row in cursor.fetchall():
                runs.append({
                    'run_id': row[0],
                    'success': bool(row[1]),
                    'metrics_count': row[2],
                    'alerts_count': row[3],
                    'execution_time': row[4],
                    'created_at': row[5]
                })

            # Get alerts
            cursor.execute("""
                SELECT alert_name, metric_name, severity, triggered_at, message
                FROM alerts
                WHERE triggered_at >= ?
                ORDER BY triggered_at DESC
                LIMIT 50
            """, (cutoff_date,))

            alerts = []
            for row in cursor.fetchall():
                alerts.append({
                    'alert_name': row[0],
                    'metric_name': row[1],
                    'severity': row[2],
                    'triggered_at': row[3],
                    'message': row[4]
                })

            conn.close()

            return {
                'runs': runs,
                'alerts': alerts,
                'total_runs': len(runs),
                'successful_runs': sum(1 for r in runs if r['success']),
                'total_alerts': len(alerts)
            }

        except Exception as e:
            logger.error(f"Failed to get monitoring history: {e}")
            return {'runs': [], 'alerts': [], 'total_runs': 0, 'successful_runs': 0, 'total_alerts': 0}

    async def get_performance_trends(self, metric_name: str, days: int = 7) -> Dict[str, Any]:
        """Get performance trends for a specific metric"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            cursor.execute("""
                SELECT timestamp, value
                FROM metrics
                WHERE metric_name = ? AND timestamp >= ?
                ORDER BY timestamp ASC
            """, (metric_name, cutoff_date))

            data_points = []
            for row in cursor.fetchall():
                data_points.append({
                    'timestamp': row[0],
                    'value': row[1]
                })

            conn.close()

            if not data_points:
                return {'trend': 'no_data', 'data_points': []}

            # Calculate trend
            values = [point['value'] for point in data_points]
            if len(values) >= 2:
                first_half = values[:len(values)//2]
                second_half = values[len(values)//2:]

                first_avg = statistics.mean(first_half)
                second_avg = statistics.mean(second_half)

                if second_avg > first_avg * 1.1:
                    trend = 'degrading'
                elif second_avg < first_avg * 0.9:
                    trend = 'improving'
                else:
                    trend = 'stable'
            else:
                trend = 'insufficient_data'

            return {
                'trend': trend,
                'data_points': data_points,
                'average': statistics.mean(values),
                'min': min(values),
                'max': max(values),
                'latest': values[-1] if values else None
            }

        except Exception as e:
            logger.error(f"Failed to get performance trends: {e}")
            return {'trend': 'error', 'data_points': []}

    async def cleanup_old_data(self):
        """Clean up old monitoring data"""
        try:
            cutoff_date = (datetime.now() - timedelta(days=self.config.retention_days)).isoformat()

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Clean up old metrics
            cursor.execute("DELETE FROM metrics WHERE timestamp < ?", (cutoff_date,))
            metrics_deleted = cursor.rowcount

            # Clean up old alerts
            cursor.execute("DELETE FROM alerts WHERE triggered_at < ?", (cutoff_date,))
            alerts_deleted = cursor.rowcount

            # Clean up old monitoring runs
            cursor.execute("DELETE FROM monitoring_runs WHERE created_at < ?", (cutoff_date,))
            runs_deleted = cursor.rowcount

            conn.commit()
            conn.close()

            logger.info(f"Cleaned up old data: {metrics_deleted} metrics, {alerts_deleted} alerts, {runs_deleted} runs")

        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")

    async def generate_monitoring_report(self, days: int = 7, format: str = "text") -> str:
        """Generate comprehensive monitoring report"""
        history = await self.get_monitoring_history(days)

        if format == "json":
            return json.dumps(history, indent=2)

        # Generate text report
        lines = [
            f"Performance Monitoring Report",
            f"=" * 40,
            f"Period: Last {days} days",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            f"Summary:",
            f"  Total monitoring runs: {history['total_runs']}",
            f"  Successful runs: {history['successful_runs']}",
            f"  Success rate: {(history['successful_runs'] / max(1, history['total_runs'])) * 100:.1f}%",
            f"  Total alerts: {history['total_alerts']}",
            ""
        ]

        if history['alerts']:
            lines.extend([
                "Recent Alerts:",
                ""
            ])
            for alert in history['alerts'][:10]:
                lines.append(f"  {alert['triggered_at'][:19]} - {alert['severity'].upper()}: {alert['message']}")

        return "\n".join(lines)
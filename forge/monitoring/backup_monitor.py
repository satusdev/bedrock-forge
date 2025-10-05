"""
Backup monitoring and health checking system.

This module provides comprehensive monitoring for backup operations,
including health checks, performance metrics, and integration with
monitoring systems like Prometheus.
"""

import json
import time
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from dataclasses_json import dataclass_json

from ..commands.sync import BackupStatus, BackupResult
from ..utils.logging import logger
from ..utils.errors import ForgeError


@dataclass_json
@dataclass
class BackupMetrics:
    """Backup performance and health metrics."""
    timestamp: datetime
    project_name: str
    backup_type: str
    success: bool
    duration_seconds: float
    size_bytes: int
    files_count: int
    gdrive_synced: bool
    error_message: Optional[str] = None
    transfer_rate_mbps: Optional[float] = None


@dataclass_json
@dataclass
class BackupHealthCheck:
    """Result of backup health check."""
    healthy: bool
    issues: List[str]
    warnings: List[str]
    last_backup_age_hours: float
    last_successful_backup_age_hours: Optional[float]
    consecutive_failures: int
    total_backups: int
    success_rate: float
    storage_usage_mb: float
    recommendations: List[str]


class BackupMonitor:
    """Comprehensive backup monitoring system."""

    def __init__(self, project_dir: Path):
        self.project_dir = project_dir
        self.backup_status = BackupStatus(project_dir)
        self.backup_dir = project_dir / ".ddev" / "backups"
        self.metrics_file = project_dir / ".ddev" / "backup_metrics.json"

    def collect_metrics(self) -> List[BackupMetrics]:
        """Collect backup metrics from history."""
        metrics = []

        try:
            # Read backup status history
            latest_status = self.backup_status.get_latest_status()
            if latest_status:
                metrics.append(self._status_to_metrics(latest_status))

            # Read historical metrics if available
            if self.metrics_file.exists():
                with open(self.metrics_file, 'r') as f:
                    historical_data = json.load(f)
                    for item in historical_data.get('metrics', []):
                        if isinstance(item, dict):
                            item['timestamp'] = datetime.fromisoformat(item['timestamp'])
                            metrics.append(BackupMetrics.from_dict(item))

        except Exception as e:
            logger.error(f"Failed to collect backup metrics: {e}")

        return metrics

    def save_metrics(self, metrics: List[BackupMetrics]) -> None:
        """Save backup metrics to file."""
        try:
            # Keep only last 100 entries
            metrics_data = [asdict(m) for m in metrics[-100:]]

            # Convert datetime objects to ISO strings
            for item in metrics_data:
                item['timestamp'] = item['timestamp'].isoformat() if isinstance(item['timestamp'], datetime) else item['timestamp']

            data = {
                'project_dir': str(self.project_dir),
                'last_updated': datetime.now().isoformat(),
                'metrics': metrics_data
            }

            self.metrics_file.parent.mkdir(exist_ok=True)
            with open(self.metrics_file, 'w') as f:
                json.dump(data, f, indent=2)

            logger.debug(f"Saved {len(metrics_data)} backup metrics")

        except Exception as e:
            logger.error(f"Failed to save backup metrics: {e}")

    def health_check(self, max_age_hours: int = 24) -> BackupHealthCheck:
        """
        Perform comprehensive backup health check.

        Args:
            max_age_hours: Maximum acceptable age for last backup

        Returns:
            BackupHealthCheck with detailed health information
        """
        issues = []
        warnings = []
        recommendations = []

        try:
            latest_status = self.backup_status.get_latest_status()
            metrics = self.collect_metrics()

            if not latest_status:
                return BackupHealthCheck(
                    healthy=False,
                    issues=["No backup history found"],
                    warnings=["System has never been backed up"],
                    last_backup_age_hours=float('inf'),
                    last_successful_backup_age_hours=None,
                    consecutive_failures=0,
                    total_backups=0,
                    success_rate=0.0,
                    storage_usage_mb=0.0,
                    recommendations=["Run initial backup immediately"]
                )

            # Calculate backup ages
            timestamp_str = latest_status.get('timestamp')
            if timestamp_str:
                backup_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                last_backup_age = (datetime.now(backup_time.tzinfo) - backup_time).total_seconds() / 3600
            else:
                last_backup_age = float('inf')

            # Calculate consecutive failures
            consecutive_failures = self._count_consecutive_failures(metrics)

            # Calculate success rate
            if metrics:
                successful_backups = sum(1 for m in metrics if m.success)
                success_rate = (successful_backups / len(metrics)) * 100
            else:
                success_rate = 100.0 if latest_status.get('success', False) else 0.0

            # Calculate storage usage
            storage_usage_mb = self._calculate_storage_usage()

            # Determine if last backup was successful and when
            last_successful_backup_age = None
            if latest_status.get('success', False):
                last_successful_backup_age = last_backup_age
            else:
                # Find last successful backup
                for metric in metrics:
                    if metric.success:
                        age = (datetime.now(metric.timestamp.tzinfo) - metric.timestamp).total_seconds() / 3600
                        last_successful_backup_age = age
                        break

            # Health checks
            healthy = True

            # Check backup age
            if last_backup_age > max_age_hours:
                healthy = False
                issues.append(f"Last backup is {last_backup_age:.1f} hours old (limit: {max_age_hours}h)")
                recommendations.append("Check backup scheduling and system connectivity")

            # Check consecutive failures
            if consecutive_failures >= 3:
                healthy = False
                issues.append(f"{consecutive_failures} consecutive backup failures")
                recommendations.append("Investigate backup failures immediately")

            # Check success rate
            if success_rate < 80 and len(metrics) >= 5:
                healthy = False
                issues.append(f"Low success rate: {success_rate:.1f}%")
                recommendations.append("Review backup configuration and error logs")

            # Check storage space
            if storage_usage_mb > 1000:  # 1GB
                warnings.append(f"High storage usage: {storage_usage_mb:.1f} MB")
                recommendations.append("Consider adjusting retention policy or cleaning up old backups")

            # Check Google Drive sync
            if not latest_status.get('gdrive_synced', False):
                warnings.append("Google Drive sync is not enabled or failed")
                recommendations.append("Configure Google Drive for offsite backups")

            # Check backup size trends
            if len(metrics) >= 3:
                recent_sizes = [m.size_bytes for m in metrics[-3:] if m.success]
                if len(recent_sizes) == 3:
                    size_change = abs(recent_sizes[-1] - recent_sizes[0]) / recent_sizes[0]
                    if size_change > 0.5:  # 50% change
                        warnings.append(f"Significant backup size change detected: {size_change*100:.1f}%")
                        recommendations.append("Review backup content for unexpected changes")

            # Additional recommendations based on configuration
            if not latest_status.get('metadata', {}).get('retention_applied'):
                recommendations.append("Configure backup retention policy")

            return BackupHealthCheck(
                healthy=healthy,
                issues=issues,
                warnings=warnings,
                last_backup_age_hours=last_backup_age,
                last_successful_backup_age_hours=last_successful_backup_age,
                consecutive_failures=consecutive_failures,
                total_backups=len(metrics) + 1,  # +1 for latest
                success_rate=success_rate,
                storage_usage_mb=storage_usage_mb,
                recommendations=recommendations
            )

        except Exception as e:
            logger.error(f"Backup health check failed: {e}")
            return BackupHealthCheck(
                healthy=False,
                issues=[f"Health check failed: {str(e)}"],
                warnings=[],
                last_backup_age_hours=float('inf'),
                last_successful_backup_age_hours=None,
                consecutive_failures=0,
                total_backups=0,
                success_rate=0.0,
                storage_usage_mb=0.0,
                recommendations=["Fix monitoring system issues"]
            )

    def _status_to_metrics(self, status: Dict[str, Any]) -> BackupMetrics:
        """Convert backup status to metrics."""
        return BackupMetrics(
            timestamp=datetime.fromisoformat(status.get('timestamp', '').replace('Z', '+00:00')),
            project_name=self.project_dir.name,
            backup_type=status.get('backup_type', 'unknown'),
            success=status.get('success', False),
            duration_seconds=status.get('duration_seconds', 0),
            size_bytes=status.get('size_bytes', 0),
            files_count=len(status.get('files', [])),
            gdrive_synced=status.get('gdrive_synced', False),
            error_message=status.get('error_message'),
            transfer_rate_mbps=self._calculate_transfer_rate(status)
        )

    def _calculate_transfer_rate(self, status: Dict[str, Any]) -> Optional[float]:
        """Calculate transfer rate in MB/s."""
        size_bytes = status.get('size_bytes', 0)
        duration_seconds = status.get('duration_seconds', 1)

        if duration_seconds > 0 and size_bytes > 0:
            # Convert to megabits per second
            return (size_bytes * 8) / (duration_seconds * 1_000_000)
        return None

    def _count_consecutive_failures(self, metrics: List[BackupMetrics]) -> int:
        """Count consecutive backup failures."""
        failures = 0
        for metric in sorted(metrics, key=lambda x: x.timestamp, reverse=True):
            if not metric.success:
                failures += 1
            else:
                break
        return failures

    def _calculate_storage_usage(self) -> float:
        """Calculate total storage usage in MB."""
        if not self.backup_dir.exists():
            return 0.0

        total_bytes = 0
        for file_path in self.backup_dir.rglob('*'):
            if file_path.is_file():
                total_bytes += file_path.stat().st_size

        return total_bytes / (1024 * 1024)  # Convert to MB

    def get_performance_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get performance statistics for the last N days."""
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_metrics = [
                m for m in self.collect_metrics()
                if m.timestamp >= cutoff_date
            ]

            if not recent_metrics:
                return {
                    'period_days': days,
                    'total_backups': 0,
                    'successful_backups': 0,
                    'failed_backups': 0,
                    'success_rate': 0.0,
                    'avg_duration_seconds': 0.0,
                    'avg_size_mb': 0.0,
                    'total_size_mb': 0.0,
                    'gdrive_sync_rate': 0.0
                }

            successful_metrics = [m for m in recent_metrics if m.success]
            failed_metrics = [m for m in recent_metrics if not m.success]

            # Calculate statistics
            total_size = sum(m.size_bytes for m in successful_metrics)
            total_duration = sum(m.duration_seconds for m in successful_metrics)
            gdrive_synced = sum(1 for m in successful_metrics if m.gdrive_synced)

            return {
                'period_days': days,
                'total_backups': len(recent_metrics),
                'successful_backups': len(successful_metrics),
                'failed_backups': len(failed_metrics),
                'success_rate': (len(successful_metrics) / len(recent_metrics)) * 100,
                'avg_duration_seconds': total_duration / len(successful_metrics) if successful_metrics else 0,
                'avg_size_mb': (total_size / len(successful_metrics) / (1024 * 1024)) if successful_metrics else 0,
                'total_size_mb': total_size / (1024 * 1024),
                'gdrive_sync_rate': (gdrive_synced / len(successful_metrics)) * 100 if successful_metrics else 0
            }

        except Exception as e:
            logger.error(f"Failed to get performance stats: {e}")
            return {'error': str(e)}


class PrometheusExporter:
    """Export backup metrics in Prometheus format."""

    def __init__(self, monitor: BackupMonitor):
        self.monitor = monitor

    def export_metrics(self) -> str:
        """Generate Prometheus-compatible metrics."""
        try:
            health = self.monitor.health_check()
            stats = self.monitor.get_performance_stats()
            metrics = self.monitor.collect_metrics()

            prometheus_metrics = []

            # Health status
            prometheus_metrics.append(
                f'forge_backup_healthy {1 if health.healthy else 0}'
            )
            prometheus_metrics.append(
                f'forge_backup_last_backup_age_hours {health.last_backup_age_hours:.2f}'
            )
            prometheus_metrics.append(
                f'forge_backup_consecutive_failures {health.consecutive_failures}'
            )
            prometheus_metrics.append(
                f'forge_backup_success_rate {health.success_rate:.2f}'
            )
            prometheus_metrics.append(
                f'forge_backup_storage_usage_mb {health.storage_usage_mb:.2f}'
            )

            # Performance stats
            prometheus_metrics.append(
                f'forge_backup_total_backups {stats.get("total_backups", 0)}'
            )
            prometheus_metrics.append(
                f'forge_backup_successful_backups {stats.get("successful_backups", 0)}'
            )
            prometheus_metrics.append(
                f'forge_backup_avg_duration_seconds {stats.get("avg_duration_seconds", 0):.2f}'
            )
            prometheus_metrics.append(
                f'forge_backup_avg_size_mb {stats.get("avg_size_mb", 0):.2f}'
            )
            prometheus_metrics.append(
                f'forge_backup_gdrive_sync_rate {stats.get("gdrive_sync_rate", 0):.2f}'
            )

            # Latest backup details
            if metrics:
                latest = max(metrics, key=lambda x: x.timestamp)
                prometheus_metrics.append(
                    f'forge_backup_latest_success {1 if latest.success else 0}'
                )
                prometheus_metrics.append(
                    f'forge_backup_latest_duration_seconds {latest.duration_seconds:.2f}'
                )
                prometheus_metrics.append(
                    f'forge_backup_latest_size_bytes {latest.size_bytes}'
                )
                prometheus_metrics.append(
                    f'forge_backup_latest_gdrive_synced {1 if latest.gdrive_synced else 0}'
                )

            # Add timestamp
            prometheus_metrics.append(
                f'forge_backup_metrics_timestamp {time.time()}'
            )

            return '\n'.join(prometheus_metrics) + '\n'

        except Exception as e:
            logger.error(f"Failed to export Prometheus metrics: {e}")
            return f'# Export failed: {str(e)}\n'


def generate_health_report(project_dir: Path, output_file: Optional[Path] = None) -> str:
    """Generate comprehensive backup health report."""
    monitor = BackupMonitor(project_dir)
    health = monitor.health_check()
    stats = monitor.get_performance_stats()

    report = f"""
# Backup Health Report
## Project: {project_dir.name}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Overall Health Status
{'✅ HEALTHY' if health.healthy else '❌ UNHEALTHY'}

## Key Metrics
- Last backup age: {health.last_backup_age_hours:.1f} hours
- Success rate: {health.success_rate:.1f}%
- Total backups: {health.total_backups}
- Consecutive failures: {health.consecutive_failures}
- Storage usage: {health.storage_usage_mb:.1f} MB

## Issues
"""

    if health.issues:
        for issue in health.issues:
            report += f"- ❌ {issue}\n"
    else:
        report += "- No critical issues\n"

    report += "\n## Warnings\n"
    if health.warnings:
        for warning in health.warnings:
            report += f"- ⚠️ {warning}\n"
    else:
        report += "- No warnings\n"

    report += "\n## Recommendations\n"
    for rec in health.recommendations:
        report += f"- 💡 {rec}\n"

    report += f"\n## Performance Statistics (Last 7 Days)\n"
    report += f"- Total backups: {stats.get('total_backups', 0)}\n"
    report += f"- Successful: {stats.get('successful_backups', 0)}\n"
    report += f"- Failed: {stats.get('failed_backups', 0)}\n"
    report += f"- Average duration: {stats.get('avg_duration_seconds', 0):.2f} seconds\n"
    report += f"- Average size: {stats.get('avg_size_mb', 0):.1f} MB\n"
    report += f"- Google Drive sync rate: {stats.get('gdrive_sync_rate', 0):.1f}%\n"

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w') as f:
            f.write(report)
        logger.info(f"Health report saved to {output_file}")

    return report
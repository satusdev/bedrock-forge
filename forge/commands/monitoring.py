"""
Performance Monitoring Command

Provides CLI interface for real-time performance monitoring, alerting,
and trend analysis for WordPress websites.
"""

import asyncio
import json
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.live import Live
from rich.layout import Layout
from rich.text import Text

from forge.utils.performance_monitor import PerformanceMonitor, PerformanceAlert, MonitoringConfig
from forge.utils.project import get_project_config

app = typer.Typer(help="Performance monitoring and alerting commands")
console = Console()


@app.command()
def start(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    url: Optional[str] = typer.Option(None, "--url", "-u", help="URL to monitor"),
    interval: Optional[int] = typer.Option(None, "--interval", "-i", help="Monitoring interval in seconds"),
    daemon: bool = typer.Option(False, "--daemon", "-d", help="Run in background")
):
    """Start continuous performance monitoring"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        # Update configuration if provided
        if url:
            monitor.config.test_url = url
        if interval:
            monitor.config.interval = interval

        if not monitor.config.test_url:
            console.print("[red]❌ No monitoring URL configured[/red]")
            console.print("Use --url to specify a URL or configure it with 'forge monitoring config'")
            raise typer.Exit(1)

        console.print(f"[blue]🔍 Starting performance monitoring...[/blue]")
        console.print(f"  URL: {monitor.config.test_url}")
        console.print(f"  Interval: {monitor.config.interval} seconds")
        console.print(f"  Metrics: {', '.join(monitor.config.metrics)}")

        if daemon:
            # Run in background
            console.print("[green]✅ Monitoring started in background[/green]")
            asyncio.create_task(monitor.start_monitoring())
        else:
            # Run with live display
            console.print("[green]✅ Monitoring started (Press Ctrl+C to stop)[/green]")
            console.print("")

            try:
                asyncio.run(monitor.start_monitoring())

                # Keep running with status display
                async def run_live_display():
                    with Live(console=console, refresh_per_second=1) as live:
                        while monitor.is_running:
                            # Get recent status
                            history = await monitor.get_monitoring_history(days=1)

                            # Create status display
                            layout = Layout()
                            layout.split_column(
                                Layout(name="header", size=3),
                                Layout(name="status"),
                                Layout(name="footer", size=3)
                            )

                            # Header
                            layout["header"].update(
                                Panel(
                                    f"[bold blue]Performance Monitoring[/bold blue]\n"
                                    f"URL: {monitor.config.test_url} | Interval: {monitor.config.interval}s",
                                    border_style="blue"
                                )
                            )

                            # Status
                            status_text = Text()
                            if history['runs']:
                                latest_run = history['runs'][0]
                                status_text.append(f"Latest Run: ", style="bold")
                                status_text.append(f"{latest_run['created_at'][:19]}", style="cyan")
                                status_text.append(f" | Status: ", style="bold")
                                status_text.append(
                                    "✅ Success" if latest_run['success'] else "❌ Failed",
                                    style="green" if latest_run['success'] else "red"
                                )
                                status_text.append(f" | Metrics: {latest_run['metrics_count']}")
                                if latest_run['alerts_count'] > 0:
                                    status_text.append(f" | Alerts: ", style="bold")
                                    status_text.append(f"{latest_run['alerts_count']}", style="red")

                            layout["status"].update(Panel(status_text, border_style="green"))

                            # Footer
                            layout["footer"].update(
                                Panel(
                                    "Press Ctrl+C to stop monitoring",
                                    border_style="dim"
                                )
                            )

                            live.update(layout)
                            await asyncio.sleep(5)

                asyncio.run(run_live_display())

            except KeyboardInterrupt:
                console.print("\n[yellow]⏹️  Stopping monitoring...[/yellow]")
                asyncio.run(monitor.stop_monitoring())
                console.print("[green]✅ Monitoring stopped[/green]")

    except Exception as e:
        console.print(f"[red]❌ Failed to start monitoring: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def stop(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name")
):
    """Stop continuous performance monitoring"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        if not monitor.is_running:
            console.print("[yellow]⚠️  Monitoring is not running[/yellow]")
            return

        console.print("[blue]⏹️  Stopping performance monitoring...[/blue]")
        asyncio.run(monitor.stop_monitoring())
        console.print("[green]✅ Monitoring stopped[/green]")

    except Exception as e:
        console.print(f"[red]❌ Failed to stop monitoring: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def status(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name")
):
    """Show current monitoring status"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        # Display status
        console.print(Panel(
            f"[bold blue]Monitoring Status[/bold blue]\n\n"
            f"Enabled: {'Yes' if monitor.config.enabled else 'No'}\n"
            f"Running: {'Yes' if monitor.is_running else 'No'}\n"
            f"URL: {monitor.config.test_url or 'Not configured'}\n"
            f"Interval: {monitor.config.interval} seconds\n"
            f"Locations: {', '.join(monitor.config.locations)}\n"
            f"Metrics: {', '.join(monitor.config.metrics)}\n"
            f"Alerts Configured: {len(monitor.config.alerts)}",
            title="Current Status",
            border_style="blue"
        ))

        # Show recent activity
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Loading recent activity...", total=None)

            history = asyncio.run(monitor.get_monitoring_history(days=1))

            progress.update(task, completed=True)

        if history['runs']:
            console.print("\n[bold]Recent Activity:[/bold]")
            table = Table()
            table.add_column("Time", style="cyan")
            table.add_column("Status", style="green")
            table.add_column("Metrics", justify="right")
            table.add_column("Alerts", justify="right", style="red")

            for run in history['runs'][:5]:
                table.add_row(
                    run['created_at'][:19],
                    "✅ Success" if run['success'] else "❌ Failed",
                    str(run['metrics_count']),
                    str(run['alerts_count'])
                )

            console.print(table)
        else:
            console.print("\n[dim]No recent monitoring activity[/dim]")

    except Exception as e:
        console.print(f"[red]❌ Failed to get status: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    url: Optional[str] = typer.Option(None, "--url", "-u", help="Monitoring URL"),
    interval: Optional[int] = typer.Option(None, "--interval", "-i", help="Monitoring interval in seconds"),
    enabled: Optional[bool] = typer.Option(None, "--enable/--disable", help="Enable/disable monitoring"),
    show: bool = typer.Option(True, "--show", help="Show current configuration")
):
    """Configure monitoring settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        # Update configuration
        updated = False
        if url is not None:
            monitor.config.test_url = url
            updated = True
        if interval is not None:
            monitor.config.interval = interval
            updated = True
        if enabled is not None:
            monitor.config.enabled = enabled
            updated = True

        if updated:
            monitor.save_config()
            console.print("[green]✅ Configuration updated[/green]")

        if show:
            _display_configuration(monitor.config)

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def alerts(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    add: bool = typer.Option(False, "--add", "-a", help="Add new alert"),
    remove: Optional[str] = typer.Option(None, "--remove", "-r", help="Remove alert by name"),
    list: bool = typer.Option(True, "--list", "-l", help="List all alerts"),
    metric: Optional[str] = typer.Option(None, "--metric", "-m", help="Metric to monitor"),
    threshold: Optional[float] = typer.Option(None, "--threshold", "-t", help="Alert threshold"),
    condition: Optional[str] = typer.Option(None, "--condition", "-c", help="Alert condition (above/below/change)"),
    severity: Optional[str] = typer.Option(None, "--severity", "-s", help="Alert severity (low/medium/high/critical)")
):
    """Manage performance alerts"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        if add:
            # Add new alert
            if not all([metric, threshold is not None, condition, severity]):
                console.print("[red]❌ Missing required alert parameters[/red]")
                console.print("Required: --metric, --threshold, --condition, --severity")
                raise typer.Exit(1)

            if condition not in ["above", "below", "change"]:
                console.print("[red]❌ Invalid condition. Use: above, below, or change[/red]")
                raise typer.Exit(1)

            if severity not in ["low", "medium", "high", "critical"]:
                console.print("[red]❌ Invalid severity. Use: low, medium, high, or critical[/red]")
                raise typer.Exit(1)

            alert = PerformanceAlert(
                metric=metric,
                threshold=threshold,
                condition=condition,
                severity=severity
            )

            monitor.config.alerts.append(alert)
            monitor.save_config()

            console.print(f"[green]✅ Alert added: {metric} {condition} {threshold} ({severity})[/green]")

        elif remove:
            # Remove alert
            monitor.config.alerts = [
                alert for alert in monitor.config.alerts
                if f"{alert.metric}_{alert.condition}_{alert.threshold}" != remove
            ]
            monitor.save_config()
            console.print(f"[green]✅ Alert removed: {remove}[/green]")

        elif list:
            # List alerts
            _display_alerts(monitor.config.alerts)

    except Exception as e:
        console.print(f"[red]❌ Alert management failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def history(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(7, "--days", "-d", help="Number of days to show"),
    format: str = typer.Option("text", "--format", "-f", help="Output format (text|json)"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path")
):
    """Show monitoring history and statistics"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Loading monitoring history...", total=None)

            history_data = asyncio.run(monitor.get_monitoring_history(days=days))

            progress.update(task, completed=True)

        if format == "json":
            report_data = json.dumps(history_data, indent=2)
            if output:
                with open(output, 'w') as f:
                    f.write(report_data)
                console.print(f"[green]✅ History saved to: {output}[/green]")
            else:
                console.print_json(data=history_data)
        else:
            # Generate text report
            report = asyncio.run(monitor.generate_monitoring_report(days=days, format="text"))

            if output:
                with open(output, 'w') as f:
                    f.write(report)
                console.print(f"[green]✅ Report saved to: {output}[/green]")
            else:
                console.print(Panel(
                    report,
                    title=f"Monitoring History (Last {days} days)",
                    border_style="blue"
                ))

    except Exception as e:
        console.print(f"[red]❌ Failed to get history: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def trends(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    metric: str = typer.Argument(..., help="Metric to analyze"),
    days: int = typer.Option(7, "--days", "-d", help="Number of days to analyze")
):
    """Show performance trends for a specific metric"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task(f"Analyzing {metric} trends...", total=None)

            trends_data = asyncio.run(monitor.get_performance_trends(metric, days))

            progress.update(task, completed=True)

        _display_trends(metric, trends_data, days)

    except Exception as e:
        console.print(f"[red]❌ Failed to analyze trends: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def test(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name")
):
    """Run a single monitoring cycle"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        if not monitor.config.test_url:
            console.print("[red]❌ No monitoring URL configured[/red]")
            console.print("Configure with: forge monitoring config --url <URL>")
            raise typer.Exit(1)

        console.print(f"[blue]🔍 Running monitoring test for {monitor.config.test_url}...[/blue]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Running monitoring cycle...", total=None)

            result = asyncio.run(monitor.run_monitoring())

            progress.update(task, completed=True)

        _display_test_result(result)

    except Exception as e:
        console.print(f"[red]❌ Monitoring test failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def cleanup(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: Optional[int] = typer.Option(None, "--days", "-d", help="Retention period in days")
):
    """Clean up old monitoring data"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        monitor = PerformanceMonitor(project_path)

        if days:
            monitor.config.retention_days = days
            monitor.save_config()

        console.print(f"[blue]🧹 Cleaning up monitoring data (retention: {monitor.config.retention_days} days)...[/blue]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Cleaning up old data...", total=None)

            asyncio.run(monitor.cleanup_old_data())

            progress.update(task, completed=True)

        console.print("[green]✅ Cleanup completed[/green]")

    except Exception as e:
        console.print(f"[red]❌ Cleanup failed: {e}[/red]")
        raise typer.Exit(1)


def _display_configuration(config: MonitoringConfig):
    """Display monitoring configuration"""
    table = Table(title="Monitoring Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    config_items = [
        ("Enabled", "Yes" if config.enabled else "No"),
        ("URL", config.test_url or "Not configured"),
        ("Interval", f"{config.interval} seconds"),
        ("Locations", ", ".join(config.locations)),
        ("Metrics", ", ".join(config.metrics)),
        ("Alerts Configured", str(len(config.alerts))),
        ("Retention Days", str(config.retention_days))
    ]

    for key, value in config_items:
        table.add_row(key, value)

    console.print(table)


def _display_alerts(alerts: list):
    """Display configured alerts"""
    if not alerts:
        console.print("[dim]No alerts configured[/dim]")
        return

    table = Table(title="Performance Alerts")
    table.add_column("Metric", style="cyan")
    table.add_column("Condition", style="yellow")
    table.add_column("Threshold", justify="right")
    table.add_column("Severity", style="red")
    table.add_column("Enabled", style="green")
    table.add_column("Cooldown", justify="right")

    for alert in alerts:
        table.add_row(
            alert.metric,
            alert.condition,
            str(alert.threshold),
            alert.severity,
            "Yes" if alert.enabled else "No",
            f"{alert.cooldown}s"
        )

    console.print(table)


def _display_trends(metric: str, trends_data: dict, days: int):
    """Display performance trends"""
    console.print(Panel(
        f"[bold blue]Performance Trends: {metric}[/bold blue]\n\n"
        f"Period: Last {days} days\n"
        f"Trend: {trends_data.get('trend', 'unknown')}\n"
        f"Data Points: {len(trends_data.get('data_points', []))}",
        title="Trend Analysis",
        border_style="blue"
    ))

    if trends_data.get('data_points'):
        data = trends_data['data_points']
        if len(data) > 0:
            values = [point['value'] for point in data]

            console.print(f"\n[bold]Statistics:[/bold]")
            console.print(f"  Average: {trends_data.get('average', 0):.2f}")
            console.print(f"  Minimum: {trends_data.get('min', 0):.2f}")
            console.print(f"  Maximum: {trends_data.get('max', 0):.2f}")
            console.print(f"  Latest: {trends_data.get('latest', 0):.2f}")

            # Show recent values
            console.print(f"\n[bold]Recent Values:[/bold]")
            for point in data[-5:]:  # Show last 5
                timestamp = point['timestamp'][:19] if len(point['timestamp']) > 19 else point['timestamp']
                console.print(f"  {timestamp}: {point['value']:.2f}")


def _display_test_result(result):
    """Display monitoring test result"""
    if result.success:
        console.print("[green]✅ Monitoring test completed successfully[/green]")
        console.print(f"  Metrics collected: {len(result.metrics)}")
        console.print(f"  Alerts triggered: {len(result.alerts_triggered)}")
        console.print(f"  Execution time: {result.execution_time:.2f}s")

        if result.metrics:
            console.print(f"\n[bold]Latest Metrics:[/bold]")
            for metric in result.metrics[-5:]:  # Show last 5
                console.print(f"  {metric.metric_name}: {metric.value:.2f}")

        if result.alerts_triggered:
            console.print(f"\n[bold red]Alerts Triggered:[/bold red]")
            for alert in result.alerts_triggered:
                console.print(f"  • {alert.metric} {alert.condition} {alert.threshold} ({alert.severity})")
    else:
        console.print("[red]❌ Monitoring test failed[/red]")
        for error in result.errors:
            console.print(f"  {error}")


if __name__ == "__main__":
    app()
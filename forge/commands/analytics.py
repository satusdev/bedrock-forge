"""
Analytics Command

Provides CLI interface for website analytics, traffic analysis,
content performance, and real-time analytics.
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.layout import Layout
from rich.live import Live
from rich.text import Text
from rich.tree import Tree

from forge.utils.analytics_collector import AnalyticsCollector
from forge.utils.site_analytics import TrafficAnalyzer, ContentAnalyzer, RealTimeAnalytics
from forge.utils.project import get_project_config

app = typer.Typer(help="Website analytics and traffic analysis commands")
console = Console()


@app.command()
def collect(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(7, "--days", "-d", help="Number of days to collect data for"),
    source: Optional[str] = typer.Option(None, "--source", "-s", help="Data source (ga4|wordpress|all)"),
    force: bool = typer.Option(False, "--force", "-f", help="Force collection even if recent data exists")
):
    """Collect analytics data from various sources"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        collector = AnalyticsCollector(project_path)

        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        console.print(f"[blue]📊 Collecting analytics data...[/blue]")
        console.print(f"  Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        console.print(f"  Source: {source or 'all'}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Collecting data...", total=None)

            results = asyncio.run(collector.collect_all_data(start_date, end_date))

            progress.update(task, completed=True)

        # Display results
        _display_collection_results(results, source)

    except Exception as e:
        console.print(f"[red]❌ Data collection failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def traffic(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    compare: Optional[int] = typer.Option(None, "--compare", "-c", help="Compare with previous period (days)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze website traffic patterns and trends"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = TrafficAnalyzer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing traffic patterns...", total=None)

            analysis = asyncio.run(analyzer.analyze_traffic_patterns(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display traffic analysis
        _display_traffic_analysis(analysis, days, compare)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)
            console.print(f"[green]✅ Analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Traffic analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def content(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    limit: int = typer.Option(10, "--limit", "-l", help="Number of top pages to show"),
    category: Optional[str] = typer.Option(None, "--category", "-c", help="Filter by content category")
):
    """Analyze content performance and engagement"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = ContentAnalyzer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing content performance...", total=None)

            analysis = asyncio.run(analyzer.analyze_content_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display content analysis
        _display_content_analysis(analysis, limit, category)

    except Exception as e:
        console.print(f"[red]❌ Content analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def realtime(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    refresh: int = typer.Option(30, "--refresh", "-r", help="Refresh interval in seconds"),
    duration: Optional[int] = typer.Option(None, "--duration", "-t", help="Duration to run (seconds)")
):
    """Show real-time analytics dashboard"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        realtime_analytics = RealTimeAnalytics(project_path)

        console.print("[blue]🔴 Real-time Analytics Dashboard[/blue]")
        console.print(f"  Refresh interval: {refresh} seconds")
        if duration:
            console.print(f"  Duration: {duration} seconds")
        console.print("")

        start_time = datetime.now()

        async def run_realtime_display():
            with Live(console=console, refresh_per_second=1) as live:
                while True:
                    # Check duration limit
                    if duration and (datetime.now() - start_time).total_seconds() > duration:
                        break

                    # Get real-time data
                    data = await realtime_analytics.get_real_time_data()

                    if "error" in data:
                        live.update(Panel(f"[red]Error: {data['error']}[/red]", title="Real-time Analytics"))
                        await asyncio.sleep(refresh)
                        continue

                    # Create dashboard layout
                    layout = Layout()
                    layout.split_column(
                        Layout(name="header", size=3),
                        Layout(name="main"),
                        Layout(name="footer", size=3)
                    )

                    layout["main"].split_row(
                        Layout(name="metrics"),
                        Layout(name="pages")
                    )

                    # Header
                    layout["header"].update(
                        Panel(
                            f"[bold blue]Real-time Analytics[/bold blue]\n"
                            f"Last updated: {data['timestamp'][:19]}",
                            border_style="blue"
                        )
                    )

                    # Metrics panel
                    metrics_text = Text()
                    metrics_text.append("Active Sessions: ", style="bold")
                    metrics_text.append(f"{data['active_sessions']}", style="green")
                    metrics_text.append("\nRecent Views (30m): ", style="bold")
                    metrics_text.append(f"{data['recent_page_views']}", style="blue")
                    metrics_text.append("\nToday's Sessions: ", style="bold")
                    metrics_text.append(f"{data['today_metrics']['sessions']}", style="cyan")
                    metrics_text.append("\nToday's Page Views: ", style="bold")
                    metrics_text.append(f"{data['today_metrics']['page_views']}", style="magenta")

                    layout["metrics"].update(Panel(metrics_text, title="Live Metrics", border_style="green"))

                    # Active pages panel
                    if data['active_pages']:
                        pages_table = Table(title="Active Pages")
                        pages_table.add_column("URL", style="cyan")
                        pages_table.add_column("Views", justify="right", style="green")
                        pages_table.add_column("Sessions", justify="right", style="blue")

                        for page in data['active_pages'][:8]:  # Show top 8
                            # Truncate long URLs
                            url = page['url'][:50] + "..." if len(page['url']) > 50 else page['url']
                            pages_table.add_row(url, str(page['views']), str(page['sessions']))

                        layout["pages"].update(pages_table)
                    else:
                        layout["pages"].update(Panel("No active pages", title="Active Pages", border_style="dim"))

                    # Footer
                    layout["footer"].update(
                        Panel(
                            f"Press Ctrl+C to stop | Next refresh in {refresh}s",
                            border_style="dim"
                        )
                    )

                    live.update(layout)

                    # Wait for refresh
                    await asyncio.sleep(refresh)

        asyncio.run(run_realtime_display())

    except KeyboardInterrupt:
        console.print("\n[yellow]⏹️  Real-time monitoring stopped[/yellow]")
    except Exception as e:
        console.print(f"[red]❌ Real-time analytics failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def compare(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    period1: int = typer.Option(7, "--period1", "-p1", help="First period in days"),
    period2: int = typer.Option(7, "--period2", "-p2", help="Second period in days"),
    metric: str = typer.Option("sessions", "--metric", "-m", help="Metric to compare (sessions|users|pageviews)")
):
    """Compare traffic between two periods"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = TrafficAnalyzer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing comparison data...", total=None)

            # Get data for both periods
            end_date = datetime.now()
            start1 = end_date - timedelta(days=period1)
            end1 = end_date

            start2 = end1 - timedelta(days=period2)
            end2 = start1

            analysis1 = asyncio.run(analyzer.analyze_traffic_patterns(period1))
            analysis2 = asyncio.run(analyzer.analyze_traffic_patterns(period2))

            progress.update(task, completed=True)

        if "error" in analysis1 or "error" in analysis2:
            console.print("[red]❌ Failed to get comparison data[/red]")
            raise typer.Exit(1)

        # Display comparison
        _display_period_comparison(analysis1, analysis2, period1, period2, metric)

    except Exception as e:
        console.print(f"[red]❌ Comparison analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def insights(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    actionable: bool = typer.Option(True, "--actionable/--all", help="Show only actionable insights")
):
    """Generate actionable insights from analytics data"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        traffic_analyzer = TrafficAnalyzer(project_path)
        content_analyzer = ContentAnalyzer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Generating insights...", total=None)

            traffic_analysis = asyncio.run(traffic_analyzer.analyze_traffic_patterns(days))
            content_analysis = asyncio.run(content_analyzer.analyze_content_performance(days))

            progress.update(task, completed=True)

        # Display insights
        _display_insights(traffic_analysis, content_analysis, actionable)

    except Exception as e:
        console.print(f"[red]❌ Insights generation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    show: bool = typer.Option(True, "--show", help="Show current configuration"),
    ga4_property: Optional[str] = typer.Option(None, "--ga4-property", help="Google Analytics 4 Property ID"),
    ga4_credentials: Optional[str] = typer.Option(None, "--ga4-credentials", help="Path to GA4 credentials file"),
    wp_site_url: Optional[str] = typer.Option(None, "--wp-site-url", help="WordPress site URL"),
    wp_api_key: Optional[str] = typer.Option(None, "--wp-api-key", help="WordPress Stats API key"),
    enable_custom: Optional[bool] = typer.Option(None, "--enable-custom/--disable-custom", help="Enable/disable custom tracking")
):
    """Configure analytics data collection settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        collector = AnalyticsCollector(project_path)

        # Update configuration
        updated = False
        if ga4_property is not None:
            collector.config['ga4']['property_id'] = ga4_property
            collector.config['ga4']['enabled'] = bool(ga4_property)
            updated = True
        if ga4_credentials is not None:
            collector.config['ga4']['credentials_path'] = ga4_credentials
            updated = True
        if wp_site_url is not None:
            collector.config['wordpress_stats']['site_url'] = wp_site_url
            collector.config['wordpress_stats']['enabled'] = bool(wp_site_url)
            updated = True
        if wp_api_key is not None:
            collector.config['wordpress_stats']['api_key'] = wp_api_key
            updated = True
        if enable_custom is not None:
            collector.config['custom_tracking']['enabled'] = enable_custom
            updated = True

        if updated:
            collector.save_config()
            console.print("[green]✅ Configuration updated[/green]")

        if show:
            _display_analytics_config(collector.config)

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


def _display_collection_results(results: dict, source: Optional[str]):
    """Display data collection results"""
    console.print(Panel(
        f"[bold green]Data Collection Complete[/bold green]\n\n"
        f"Traffic Data: {'✅' if results['traffic'] else '❌'}\n"
        f"Content Data: {'✅' if results['content'] else '❌'}\n"
        f"Custom Events: {'✅' if results['events'] else '❌'}\n"
        f"Conversions: {'✅' if results['conversions'] else '❌'}",
        title="Collection Results",
        border_style="green"
    ))

    if results['traffic']:
        traffic_count = len(results['traffic'])
        console.print(f"[green]✅ Collected {traffic_count} days of traffic data[/green]")

    if results['events']:
        event_count = len(results['events'])
        console.print(f"[green]✅ Collected {event_count} custom events[/green]")


def _display_traffic_analysis(analysis: dict, days: int, compare_period: Optional[int]):
    """Display traffic analysis results"""
    # Summary section
    summary = analysis.get('summary', {})
    console.print(Panel(
        f"[bold blue]Traffic Analysis Summary[/bold blue]\n\n"
        f"Total Sessions: {summary.get('total_sessions', 0):,}\n"
        f"Total Users: {summary.get('total_users', 0):,}\n"
        f"Total Page Views: {summary.get('total_page_views', 0):,}\n"
        f"Pages per Session: {summary.get('pages_per_session', 0):.2f}\n"
        f"Avg Bounce Rate: {summary.get('avg_bounce_rate', 0):.1f}%\n"
        f"Avg Session Duration: {summary.get('avg_session_duration', 0):.1f}s\n"
        f"New User Rate: {summary.get('new_user_rate', 0):.1f}%",
        title=f"Traffic Overview (Last {days} days)",
        border_style="blue"
    ))

    # Trends section
    trends = analysis.get('trends', {})
    if 'session_trend_percent' in trends:
        trend_color = "green" if trends['session_trend_percent'] > 0 else "red"
        trend_symbol = "📈" if trends['session_trend_percent'] > 0 else "📉"

        console.print(Panel(
            f"[bold]Traffic Trends[/bold]\n\n"
            f"{trend_symbol} Session Trend: [{trend_color}]{trends['session_trend_percent']:+.1f}%[/{trend_color}]\n"
            f"User Trend: [{'green' if trends['user_trend_percent'] > 0 else 'red'}]{trends['user_trend_percent']:+.1f}%[/]\n"
            f"Trend Direction: {trends.get('trend_direction', 'stable')}\n"
            f"Peak Traffic Day: {trends.get('peak_traffic_day', 'N/A')}",
            title="Trend Analysis",
            border_style="cyan"
        ))

    # Traffic sources
    if summary.get('traffic_sources'):
        console.print("\n[bold]Traffic Sources:[/bold]")
        sources_table = Table()
        sources_table.add_column("Source", style="cyan")
        sources_table.add_column("Sessions", justify="right", style="green")
        sources_table.add_column("Percentage", justify="right", style="blue")

        total_sessions = summary.get('total_sessions', 1)
        for source, sessions in sorted(summary['traffic_sources'].items(), key=lambda x: x[1], reverse=True)[:5]:
            percentage = (sessions / total_sessions) * 100
            sources_table.add_row(source.title(), f"{sessions:,}", f"{percentage:.1f}%")

        console.print(sources_table)

    # Insights
    insights = analysis.get('insights', [])
    if insights:
        console.print("\n[bold yellow]Key Insights:[/bold yellow]")
        for insight in insights:
            console.print(f"💡 {insight}")

    # Recommendations
    recommendations = analysis.get('recommendations', [])
    if recommendations:
        console.print("\n[bold green]Recommendations:[/bold green]")
        for i, rec in enumerate(recommendations, 1):
            console.print(f"{i}. {rec}")


def _display_content_analysis(analysis: dict, limit: int, category: Optional[str]):
    """Display content analysis results"""
    # Top pages
    top_pages = analysis.get('top_pages', [])[:limit]
    if top_pages:
        console.print(Panel(
            f"[bold blue]Top Performing Pages[/bold blue]",
            title=f"Content Performance (Top {len(top_pages)})"
        ))

        pages_table = Table()
        pages_table.add_column("Title", style="cyan")
        pages_table.add_column("Views", justify="right", style="green")
        pages_table.add_column("Time on Page", justify="right", style="blue")
        pages_table.add_column("Bounce Rate", justify="right", style="red")
        pages_table.add_column("Score", justify="right", style="magenta")

        for page in top_pages:
            title = page['title'][:50] + "..." if len(page['title']) > 50 else page['title']
            pages_table.add_row(
                title,
                f"{page['page_views']:,}",
                f"{page['avg_time_on_page']:.1f}s",
                f"{page['bounce_rate']:.1f}%",
                f"{page['content_score']:.0f}"
            )

        console.print(pages_table)

    # Content categories
    categories = analysis.get('content_categories', {})
    if categories:
        console.print(f"\n[bold]Content Categories:[/bold]")
        cat_table = Table()
        cat_table.add_column("Category", style="cyan")
        cat_table.add_column("Pages", justify="right")
        cat_table.add_column("Total Views", justify="right", style="green")
        cat_table.add_column("Avg Time", justify="right", style="blue")

        for cat_name, cat_data in sorted(categories.items(), key=lambda x: x[1]['total_views'], reverse=True):
            cat_table.add_row(
                cat_name.title(),
                str(cat_data['pages']),
                f"{cat_data['total_views']:,}",
                f"{cat_data['avg_time_on_page']:.1f}s"
            )

        console.print(cat_table)

    # Engagement metrics
    engagement = analysis.get('engagement_metrics', {})
    if engagement:
        console.print(f"\n[bold]Engagement Overview:[/bold]")
        console.print(f"  Total Pages: {engagement.get('total_pages', 0)}")
        console.print(f"  Conversion Rate: {engagement.get('conversion_rate', 0):.2f}%")
        console.print(f"  Avg Time on Page: {engagement.get('avg_time_on_page', 0):.1f}s")
        console.print(f"  Avg Content Score: {engagement.get('avg_content_score', 0):.1f}")
        console.print(f"  High Performing Pages: {engagement.get('high_performing_pages', 0)}")
        console.print(f"  Low Performing Pages: {engagement.get('low_performing_pages', 0)}")

    # Insights
    insights = analysis.get('content_insights', [])
    if insights:
        console.print("\n[bold yellow]Content Insights:[/bold yellow]")
        for insight in insights:
            console.print(f"📝 {insight}")

    # Optimization opportunities
    opportunities = analysis.get('optimization_opportunities', [])
    if opportunities:
        console.print("\n[bold orange1]Optimization Opportunities:[/bold orange1]")
        for opp in opportunities[:5]:  # Show top 5
            opp_type = opp['type'].replace('_', ' ').title()
            console.print(f"• {opp_type}: {opp['title'][:40]}{'...' if len(opp['title']) > 40 else ''}")
            console.print(f"  💡 {opp['recommendation']}")
            console.print("")


def _display_period_comparison(analysis1: dict, analysis2: dict, period1: int, period2: int, metric: str):
    """Display period comparison results"""
    summary1 = analysis1.get('summary', {})
    summary2 = analysis2.get('summary', {})

    # Create comparison table
    table = Table(title=f"Period Comparison: {metric.title()}")
    table.add_column("Metric", style="cyan")
    table.add_column(f"Period 1 (Last {period1} days)", justify="right", style="green")
    table.add_column(f"Period 2 (Previous {period2} days)", justify="right", style="blue")
    table.add_column("Change", justify="right", style="yellow")
    table.add_column("% Change", justify="right", style="magenta")

    # Metrics to compare
    metrics_to_compare = [
        ('Total Sessions', 'total_sessions'),
        ('Total Users', 'total_users'),
        ('Page Views', 'total_page_views'),
        ('Pages per Session', 'pages_per_session'),
        ('Bounce Rate', 'avg_bounce_rate'),
        ('Session Duration', 'avg_session_duration')
    ]

    for display_name, key in metrics_to_compare:
        value1 = summary1.get(key, 0)
        value2 = summary2.get(key, 0)

        if key in ['pages_per_session', 'avg_bounce_rate', 'avg_session_duration']:
            change = value1 - value2
            change_str = f"{change:+.2f}"
            percent_change = (change / value2 * 100) if value2 != 0 else 0
            percent_str = f"{percent_change:+.1f}%"
        else:
            change = value1 - value2
            change_str = f"{change:+,}"
            percent_change = (change / value2 * 100) if value2 != 0 else 0
            percent_str = f"{percent_change:+.1f}%"

        # Color coding for change
        change_color = "green" if change > 0 else "red" if change < 0 else "white"
        percent_color = "green" if percent_change > 0 else "red" if percent_change < 0 else "white"

        table.add_row(
            display_name,
            f"{value1:,}" if isinstance(value1, int) else f"{value1:.2f}",
            f"{value2:,}" if isinstance(value2, int) else f"{value2:.2f}",
            f"[{change_color}]{change_str}[/{change_color}]",
            f"[{percent_color}]{percent_str}[/{percent_color}]"
        )

    console.print(table)


def _display_insights(traffic_analysis: dict, content_analysis: dict, actionable_only: bool):
    """Display comprehensive insights"""
    all_insights = []

    # Traffic insights
    traffic_insights = traffic_analysis.get('insights', [])
    for insight in traffic_insights:
        all_insights.append(("Traffic", insight))

    # Content insights
    content_insights = content_analysis.get('content_insights', [])
    for insight in content_insights:
        all_insights.append(("Content", insight))

    # Recommendations (as actionable insights)
    if not actionable_only:
        traffic_recs = traffic_analysis.get('recommendations', [])
        for rec in traffic_recs:
            all_insights.append(("Traffic Recommendation", rec))

        content_ops = content_analysis.get('optimization_opportunities', [])
        for opp in content_ops[:5]:  # Top 5
            all_insights.append(("Content Optimization", opp['recommendation']))

    if not all_insights:
        console.print("[yellow]📭 No insights available. Collect more analytics data first.[/yellow]")
        return

    console.print(Panel(
        f"[bold blue]Analytics Insights[/bold blue]\n\n"
        f"Generated {len(all_insights)} insights from your data",
        title="Business Intelligence",
        border_style="blue"
    ))

    # Group insights by category
    categories = {}
    for category, insight in all_insights:
        if category not in categories:
            categories[category] = []
        categories[category].append(insight)

    # Display insights by category
    for category, insights in categories.items():
        console.print(f"\n[bold]{category}:[/bold]")
        for i, insight in enumerate(insights, 1):
            icon = "💡" if "Recommendation" not in category else "🎯"
            console.print(f"  {icon} {insight}")


def _display_analytics_config(config: dict):
    """Display analytics configuration"""
    table = Table(title="Analytics Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    # General settings
    table.add_row("Analytics Enabled", "Yes" if config.get('enabled') else "No")
    table.add_row("Auto Collect", "Yes" if config.get('auto_collect') else "No")
    table.add_row("Collection Interval", f"{config.get('collection_interval', 0)} seconds")
    table.add_row("Data Retention", f"{config.get('data_retention_days', 0)} days")

    # GA4 settings
    ga4_config = config.get('ga4', {})
    table.add_row("GA4 Enabled", "Yes" if ga4_config.get('enabled') else "No")
    table.add_row("GA4 Property ID", ga4_config.get('property_id', 'Not configured'))
    table.add_row("GA4 Credentials", ga4_config.get('credentials_path', 'Not configured'))

    # WordPress Stats settings
    wp_config = config.get('wordpress_stats', {})
    table.add_row("WordPress Stats Enabled", "Yes" if wp_config.get('enabled') else "No")
    table.add_row("WordPress Site URL", wp_config.get('site_url', 'Not configured'))
    table.add_row("WordPress API Key", "Configured" if wp_config.get('api_key') else "Not configured")

    # Custom tracking settings
    custom_config = config.get('custom_tracking', {})
    table.add_row("Custom Tracking Enabled", "Yes" if custom_config.get('enabled') else "No")
    table.add_row("Track Page Views", "Yes" if custom_config.get('track_page_views') else "No")
    table.add_row("Track Events", "Yes" if custom_config.get('track_events') else "No")
    table.add_row("Track Conversions", "Yes" if custom_config.get('track_conversions') else "No")

    console.print(table)


if __name__ == "__main__":
    app()
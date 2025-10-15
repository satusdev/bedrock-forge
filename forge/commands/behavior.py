"""
User Behavior Command

Provides CLI interface for user behavior tracking, session analysis,
user segmentation, and journey mapping.
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
from rich.tree import Tree
from rich.text import Text

from forge.utils.user_behavior import SessionAnalyzer, UserSegmentation, JourneyMapper
from forge.utils.project import get_project_config

app = typer.Typer(help="User behavior tracking and analysis commands")
console = Console()


@app.command()
def analyze(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    metric: str = typer.Option("overview", "--metric", "-m", help="Analysis metric (overview|engagement|device|flows)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze user behavior and session patterns"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SessionAnalyzer(project_path)

        console.print(f"[blue]🔍 Analyzing user behavior...[/blue]")
        console.print(f"  Period: Last {days} days")
        console.print(f"  Metric: {metric}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing user behavior...", total=None)

            analysis = asyncio.run(analyzer.analyze_sessions(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display analysis based on metric
        if metric == "overview":
            _display_session_overview(analysis)
        elif metric == "engagement":
            _display_engagement_analysis(analysis)
        elif metric == "device":
            _display_device_analysis(analysis)
        elif metric == "flows":
            _display_journey_flows(analysis)
        else:
            _display_full_behavior_analysis(analysis)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)
            console.print(f"[green]✅ Analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Behavior analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def segments(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    type: str = typer.Option("behavior", "--type", "-t", help="Segmentation type (behavior|engagement|frequency|device|acquisition)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze user segments and cohorts"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        segmentation = UserSegmentation(project_path)

        console.print(f"[blue]👥 Analyzing user segments...[/blue]")
        console.print(f"  Period: Last {days} days")
        console.print(f"  Type: {type} segmentation")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Segmenting users...", total=None)

            segments_data = asyncio.run(segmentation.segment_users(type, days))

            progress.update(task, completed=True)

        if "error" in segments_data:
            console.print(f"[red]❌ {segments_data['error']}[/red]")
            raise typer.Exit(1)

        # Display segmentation results
        _display_user_segments(segments_data, type)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(segments_data, f, indent=2, default=str)
            console.print(f"[green]✅ Segments exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ User segmentation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def journey(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    type: str = typer.Option("conversion", "--type", "-t", help="Journey type (conversion|all)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Map user journeys and conversion paths"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        mapper = JourneyMapper(project_path)

        console.print(f"[blue]🗺️  Mapping user journeys...[/blue]")
        console.print(f"  Period: Last {days} days")
        console.print(f"  Type: {type} journeys")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Mapping journeys...", total=None)

            journeys = asyncio.run(mapper.map_user_journeys(days, type))

            progress.update(task, completed=True)

        if "error" in journeys:
            console.print(f"[red]❌ {journeys['error']}[/red]")
            raise typer.Exit(1)

        # Display journey mapping results
        _display_journey_mapping(journeys, type)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(journeys, f, indent=2, default=str)
            console.print(f"[green]✅ Journey mapping exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Journey mapping failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def compare(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    segment1: str = typer.Option("converters", "--segment1", "-s1", help="First segment to compare"),
    segment2: str = typer.Option("non_converters", "--segment2", "-s2", help="Second segment to compare"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze")
):
    """Compare behavior between user segments"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        segmentation = UserSegmentation(project_path)

        console.print(f"[blue]📊 Comparing user segments...[/blue]")
        console.print(f"  Segment 1: {segment1}")
        console.print(f"  Segment 2: {segment2}")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Comparing segments...", total=None)

            # Get segmentation data
            segments_data = asyncio.run(segmentation.segment_users("behavior", days))

            progress.update(task, completed=True)

        if "error" in segments_data:
            console.print(f"[red]❌ {segments_data['error']}[/red]")
            raise typer.Exit(1)

        # Display comparison
        _display_segment_comparison(segments_data, segment1, segment2)

    except Exception as e:
        console.print(f"[red]❌ Segment comparison failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def heatmap(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(7, "--days", "-d", help="Number of days to analyze"),
    metric: str = typer.Option("time", "--metric", "-m", help="Heatmap metric (time|clicks|scroll)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Generate user behavior heatmap data"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SessionAnalyzer(project_path)

        console.print(f"[blue]🔥 Generating behavior heatmap...[/blue]")
        console.print(f"  Period: Last {days} days")
        console.print(f"  Metric: {metric}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Generating heatmap data...", total=None)

            # Get session data for heatmap
            analysis = asyncio.run(analyzer.analyze_sessions(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display heatmap visualization
        _display_behavior_heatmap(analysis, metric)

        # Export if requested
        if export:
            heatmap_data = _prepare_heatmap_data(analysis, metric)
            with open(export, 'w') as f:
                json.dump(heatmap_data, f, indent=2, default=str)
            console.print(f"[green]✅ Heatmap data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Heatmap generation failed: {e}[/red]")
        raise typer.Exit(1)


def _display_session_overview(analysis: dict):
    """Display session overview metrics"""
    overview = analysis.get('session_overview', {})

    console.print(Panel(
        f"[bold blue]Session Overview[/bold blue]\n\n"
        f"Total Sessions: {overview.get('total_sessions', 0):,}\n"
        f"Unique Users: {overview.get('unique_users', 0):,}\n"
        f"Total Page Views: {overview.get('total_page_views', 0):,}\n"
        f"Avg Session Duration: {overview.get('avg_session_duration', 0):.1f}s\n"
        f"Avg Pages per Session: {overview.get('avg_pages_per_session', 0):.2f}\n"
        f"Bounce Rate: {overview.get('bounce_rate', 0):.1f}%\n"
        f"Conversion Rate: {overview.get('conversion_rate', 0):.1f}%\n"
        f"Returning User Rate: {overview.get('returning_user_rate', 0):.1f}%",
        title="User Behavior Overview",
        border_style="blue"
    ))

    # Display insights
    insights = analysis.get('behavior_insights', [])
    if insights:
        console.print("\n[bold yellow]Key Insights:[/bold yellow]")
        for insight in insights:
            console.print(f"💡 {insight}")


def _display_engagement_analysis(analysis: dict):
    """Display engagement analysis"""
    engagement = analysis.get('engagement_patterns', {})

    console.print(Panel(
        f"[bold green]Engagement Analysis[/bold green]\n\n"
        f"High Engagement Rate: {engagement.get('high_engagement_rate', 0):.1f}%\n"
        f"Average Time on Page: {engagement.get('avg_time_on_page', 0):.1f}s\n"
        f"Average Scroll Depth: {engagement.get('avg_scroll_depth', 0):.1%}\n"
        f"Average Clicks per Page: {engagement.get('avg_clicks_per_page', 0):.1f}\n"
        f"Form Interaction Rate: {engagement.get('form_interaction_rate', 0):.1f}%",
        title="User Engagement Metrics",
        border_style="green"
    ))

    # Engagement distribution
    distribution = engagement.get('engagement_distribution', {})
    if distribution:
        console.print(f"\n[bold]Engagement Distribution:[/bold]")
        eng_table = Table()
        eng_table.add_column("Level", style="cyan")
        eng_table.add_column("Count", justify="right", style="green")
        eng_table.add_column("Percentage", justify="right", style="blue")

        total = sum(distribution.values())
        for level, count in distribution.items():
            percentage = (count / total) * 100 if total > 0 else 0
            eng_table.add_row(level.title(), str(count), f"{percentage:.1f}%")

        console.print(eng_table)


def _display_device_analysis(analysis: dict):
    """Display device behavior analysis"""
    device_stats = analysis.get('device_behavior', {})

    if not device_stats:
        console.print("[yellow]No device data available[/yellow]")
        return

    console.print(Panel(
        f"[bold cyan]Device Behavior Analysis[/bold cyan]",
        title="Cross-Device Analytics"
    ))

    device_table = Table()
    device_table.add_column("Device", style="cyan")
    device_table.add_column("Sessions", justify="right", style="green")
    device_table.add_column("Page Views", justify="right", style="blue")
    device_table.add_column("Avg Time", justify="right", style="magenta")
    device_table.add_column("Bounce Rate", justify="right", style="red")
    device_table.add_column("Conversion Rate", justify="right", style="yellow")

    for device, stats in device_stats.items():
        device_table.add_row(
            device.title(),
            f"{stats['sessions']:,}",
            f"{stats['page_views']:,}",
            f"{stats['avg_time_on_page']:.1f}s",
            f"{stats['bounce_rate']:.1f}%",
            f"{stats['conversion_rate']:.1f}%"
        )

    console.print(device_table)


def _display_journey_flows(analysis: dict):
    """Display journey flow analysis"""
    flows = analysis.get('journey_flows', {})

    # Common paths
    common_paths = flows.get('common_paths', {})
    if common_paths:
        console.print(Panel(
            f"[bold magenta]Top User Journey Paths[/bold magenta]",
            title="Common User Flows"
        ))

        for path, count in list(common_paths.items())[:5]:
            console.print(f"[green]{count}[/green] users: {path}")

    # Entry pages
    entry_pages = flows.get('top_entry_pages', {})
    if entry_pages:
        console.print(f"\n[bold]Top Entry Pages:[/bold]")
        for page, count in list(entry_pages.items())[:5]:
            console.print(f"  {page}: {count} entries")

    # Exit pages
    exit_pages = flows.get('top_exit_pages', {})
    if exit_pages:
        console.print(f"\n[bold]Top Exit Pages:[/bold]")
        for page, count in list(exit_pages.items())[:5]:
            console.print(f"  {page}: {count} exits")


def _display_full_behavior_analysis(analysis: dict):
    """Display complete behavior analysis"""
    _display_session_overview(analysis)
    console.print("")
    _display_engagement_analysis(analysis)
    console.print("")
    _display_device_analysis(analysis)
    console.print("")
    _display_journey_flows(analysis)


def _display_user_segments(segments_data: dict, segmentation_type: str):
    """Display user segmentation results"""
    console.print(Panel(
        f"[bold blue]User Segmentation Results[/bold blue]\n\n"
        f"Segmentation Type: {segmentation_type.title()}\n"
        f"Total Users: {segments_data.get('total_users', 0):,}\n"
        f"Segments: {len(segments_data.get('segments', {}))}",
        title=f"{segmentation_type.title()} Segmentation",
        border_style="blue"
    ))

    segments = segments_data.get('segments', {})
    if segments:
        # Create segments table
        seg_table = Table()
        seg_table.add_column("Segment", style="cyan")
        seg_table.add_column("Users", justify="right", style="green")
        seg_table.add_column("Percentage", justify="right", style="blue")
        seg_table.add_column("Avg Sessions", justify="right", style="magenta")
        seg_table.add_column("Avg Value", justify="right", style="yellow")

        total_users = segments_data.get('total_users', 1)

        for segment_name, users in segments.items():
            if not users:
                continue

            segment_display = segment_name.replace('_', ' ').title()
            user_count = len(users)
            percentage = (user_count / total_users) * 100

            # Calculate segment metrics
            avg_sessions = sum(u.get('total_sessions', 0) for u in users) / len(users) if users else 0
            avg_value = sum(u.get('conversion_value', 0) for u in users) / len(users) if users else 0

            seg_table.add_row(
                segment_display,
                f"{user_count:,}",
                f"{percentage:.1f}%",
                f"{avg_sessions:.1f}",
                f"${avg_value:.2f}"
            )

        console.print(seg_table)

    # Display insights
    insights = segments_data.get('insights', [])
    if insights:
        console.print(f"\n[bold yellow]Segment Insights:[/bold yellow]")
        for insight in insights:
            console.print(f"📊 {insight}")


def _display_journey_mapping(journeys: dict, journey_type: str):
    """Display journey mapping results"""
    overview = journeys.get('journey_overview', {})

    console.print(Panel(
        f"[bold magenta]Journey Mapping Results[/bold magenta]\n\n"
        f"Journey Type: {journey_type.title()}\n"
        f"Total Journeys: {overview.get('total_journeys', 0):,}\n"
        f"Converting Journeys: {overview.get('converting_journeys', 0):,}\n"
        f"Conversion Rate: {overview.get('conversion_rate', 0):.1f}%\n"
        f"Total Conversion Value: ${overview.get('total_conversion_value', 0):.2f}\n"
        f"Avg Journey Duration: {overview.get('avg_journey_duration', 0):.1f}s\n"
        f"Avg Sessions per Journey: {overview.get('avg_sessions_per_journey', 0):.1f}",
        title=f"{journey_type.title()} Journey Analysis",
        border_style="magenta"
    ))

    # Common paths
    paths = journeys.get('common_paths', {})
    top_paths = paths.get('top_conversion_paths', {})
    if top_paths:
        console.print(f"\n[bold]Top Conversion Paths:[/bold]")
        for path, count in list(top_paths.items())[:5]:
            console.print(f"  🎯 {count} conversions: {path}")

    # Touchpoint analysis
    touchpoints = journeys.get('touchpoint_analysis', {})
    entry_points = touchpoints.get('top_entry_points', {})
    if entry_points:
        console.print(f"\n[bold]Top Entry Points:[/bold]")
        for point, count in list(entry_points.items())[:5]:
            console.print(f"  🚪 {point}: {count} entries")

    # Journey segments
    journey_segments = journeys.get('journey_segments', {})
    if journey_segments:
        console.print(f"\n[bold]Journey Segments:[/bold]")
        for segment_name, segment_journeys in journey_segments.items():
            if segment_journeys:
                segment_display = segment_name.replace('_', ' ').title()
                console.print(f"  {segment_display}: {len(segment_journeys)} journeys")

    # Optimization opportunities
    opportunities = journeys.get('optimization_opportunities', [])
    if opportunities:
        console.print(f"\n[bold orange1]Optimization Opportunities:[/bold orange1]")
        for opp in opportunities:
            console.print(f"  💡 {opp.get('description', '')}")
            console.print(f"     Recommendation: {opp.get('recommendation', '')}")
            console.print("")


def _display_segment_comparison(segments_data: dict, segment1: str, segment2: str):
    """Display comparison between user segments"""
    segments = segments_data.get('segments', {})

    # Find the segments to compare
    seg1_data = None
    seg2_data = None

    for seg_name, users in segments.items():
        if segment1.lower() in seg_name.lower():
            seg1_data = {'name': seg_name, 'users': users}
        if segment2.lower() in seg_name.lower():
            seg2_data = {'name': seg_name, 'users': users}

    if not seg1_data or not seg2_data:
        console.print(f"[red]❌ Could not find segments for comparison[/red]")
        return

    console.print(Panel(
        f"[bold cyan]Segment Comparison[/bold cyan]\n\n"
        f"Segment 1: {seg1_data['name'].replace('_', ' ').title()}\n"
        f"Segment 2: {seg2_data['name'].replace('_', ' ').title()}",
        title="User Segment Analysis",
        border_style="cyan"
    ))

    # Create comparison table
    comparison_table = Table()
    comparison_table.add_column("Metric", style="bold")
    comparison_table.add_column(seg1_data['name'].replace('_', ' ').title(), justify="right", style="blue")
    comparison_table.add_column(seg2_data['name'].replace('_', ' ').title(), justify="right", style="green")
    comparison_table.add_column("Difference", justify="right", style="yellow")

    # Calculate metrics for each segment
    def calculate_segment_metrics(users):
        if not users:
            return {'sessions': 0, 'page_views': 0, 'time': 0, 'conversions': 0, 'value': 0}

        total_sessions = sum(u.get('total_sessions', 0) for u in users)
        total_page_views = sum(u.get('total_page_views', 0) for u in users)
        total_time = sum(u.get('total_time_on_site', 0) for u in users)
        total_conversions = sum(1 for u in users if u.get('conversions'))
        total_value = sum(u.get('conversion_value', 0) for u in users)

        return {
            'sessions': total_sessions,
            'page_views': total_page_views,
            'time': total_time,
            'conversions': total_conversions,
            'value': total_value
        }

    seg1_metrics = calculate_segment_metrics(seg1_data['users'])
    seg2_metrics = calculate_segment_metrics(seg2_data['users'])

    # Add comparison rows
    metrics_to_compare = [
        ('Users', len(seg1_data['users']), len(seg2_data['users'])),
        ('Total Sessions', seg1_metrics['sessions'], seg2_metrics['sessions']),
        ('Total Page Views', seg1_metrics['page_views'], seg2_metrics['page_views']),
        ('Avg Time on Site', seg1_metrics['time'] / len(seg1_data['users']) if seg1_data['users'] else 0,
         seg2_metrics['time'] / len(seg2_data['users']) if seg2_data['users'] else 0),
        ('Conversions', seg1_metrics['conversions'], seg2_metrics['conversions']),
        ('Total Value', seg1_metrics['value'], seg2_metrics['value'])
    ]

    for metric_name, val1, val2 in metrics_to_compare:
        if isinstance(val1, float) or isinstance(val2, float):
            val1_display = f"{val1:.1f}"
            val2_display = f"{val2:.1f}"
            diff = val1 - val2
            diff_display = f"{diff:+.1f}"
        else:
            val1_display = f"{val1:,}"
            val2_display = f"{val2:,}"
            diff = val1 - val2
            diff_display = f"{diff:+,}"

        comparison_table.add_row(metric_name, val1_display, val2_display, diff_display)

    console.print(comparison_table)


def _display_behavior_heatmap(analysis: dict, metric: str):
    """Display behavior heatmap visualization"""
    console.print(Panel(
        f"[bold red]Behavior Heatmap[/bold red]\n\n"
        f"Metric: {metric.title()}\n"
        f"Note: This is a simplified visualization. For detailed heatmaps, use a dedicated visualization tool.",
        title="User Activity Heatmap",
        border_style="red"
    ))

    # Create a simple text-based heatmap
    engagement = analysis.get('engagement_patterns', {})
    device_stats = analysis.get('device_behavior', {})

    if metric == "time":
        console.print("\n[bold]Time on Page Heatmap by Device:[/bold]")
        for device, stats in device_stats.items():
            # Create visual representation of time spent
            time_val = stats.get('avg_time_on_page', 0)
            bar_length = min(20, int(time_val / 10))  # Scale to max 20 chars
            bar = "█" * bar_length + "░" * (20 - bar_length)
            console.print(f"{device.title():12} │{bar}│ {time_val:.1f}s")

    elif metric == "clicks":
        console.print("\n[bold]Click Activity Heatmap:[/bold]")
        clicks_per_page = engagement.get('avg_clicks_per_page', 0)
        bar_length = min(20, int(clicks_per_page))
        bar = "█" * bar_length + "░" * (20 - bar_length)
        console.print(f"{'Avg Clicks':12} │{bar}│ {clicks_per_page:.1f}")

    elif metric == "scroll":
        console.print("\n[bold]Scroll Depth Heatmap:[/bold]")
        scroll_depth = engagement.get('avg_scroll_depth', 0) * 100
        bar_length = min(20, int(scroll_depth / 5))  # Scale to max 20 chars
        bar = "█" * bar_length + "░" * (20 - bar_length)
        console.print(f"{'Scroll Depth':12} │{bar}│ {scroll_depth:.1f}%")


def _prepare_heatmap_data(analysis: dict, metric: str) -> dict:
    """Prepare heatmap data for export"""
    heatmap_data = {
        "metric": metric,
        "generated_at": datetime.now().isoformat(),
        "data": {}
    }

    if metric == "time":
        device_stats = analysis.get('device_behavior', {})
        heatmap_data["data"] = {
            device: stats.get('avg_time_on_page', 0)
            for device, stats in device_stats.items()
        }
    elif metric == "clicks":
        engagement = analysis.get('engagement_patterns', {})
        heatmap_data["data"] = {
            "avg_clicks_per_page": engagement.get('avg_clicks_per_page', 0),
            "form_interaction_rate": engagement.get('form_interaction_rate', 0)
        }
    elif metric == "scroll":
        engagement = analysis.get('engagement_patterns', {})
        heatmap_data["data"] = {
            "avg_scroll_depth": engagement.get('avg_scroll_depth', 0)
        }

    return heatmap_data


if __name__ == "__main__":
    app()
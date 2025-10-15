"""
Conversions Command

Provides CLI interface for conversion tracking, funnel analysis,
ROI calculation, and attribution modeling.
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
from rich.bar import Bar

from forge.utils.conversion_tracker import ConversionTracker
from forge.utils.project import get_project_config

app = typer.Typer(help="Conversion tracking and analysis commands")
console = Console()


@app.command()
def track(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    conversion_type: str = typer.Argument(..., help="Type of conversion (purchase|lead|signup|download|form|custom)"),
    value: float = typer.Option(0.0, "--value", "-v", help="Conversion value"),
    session_id: Optional[str] = typer.Option(None, "--session-id", "-s", help="Session ID"),
    user_id: Optional[str] = typer.Option(None, "--user-id", "-u", help="User ID"),
    page_url: Optional[str] = typer.Option(None, "--url", help="Page URL where conversion occurred"),
    campaign: Optional[str] = typer.Option(None, "--campaign", "-c", help="Marketing campaign"),
    product_id: Optional[str] = typer.Option(None, "--product-id", help="Product ID"),
    product_name: Optional[str] = typer.Option(None, "--product-name", help="Product name"),
    quantity: int = typer.Option(1, "--quantity", "-q", help="Quantity purchased")
):
    """Track a conversion event"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        # Prepare conversion data
        conversion_data = {
            'conversion_type': conversion_type,
            'value': value,
            'session_id': session_id,
            'user_id': user_id,
            'page_url': page_url,
            'campaign': campaign,
            'product_id': product_id,
            'product_name': product_name,
            'quantity': quantity,
            'timestamp': datetime.now().isoformat()
        }

        console.print(f"[blue]🎯 Tracking conversion...[/blue]")
        console.print(f"  Type: {conversion_type}")
        console.print(f"  Value: ${value:.2f}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Tracking conversion...", total=None)

            success = asyncio.run(tracker.track_conversion(conversion_data))

            progress.update(task, completed=True)

        if success:
            console.print("[green]✅ Conversion tracked successfully[/green]")
        else:
            console.print("[red]❌ Failed to track conversion[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]❌ Conversion tracking failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def funnel(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    funnel_name: str = typer.Argument(..., help="Funnel name to analyze"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze conversion funnel performance"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        console.print(f"[blue]🔍 Analyzing funnel: {funnel_name}[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing funnel...", total=None)

            funnel_analysis = asyncio.run(tracker.analyze_funnel(funnel_name, days))

            progress.update(task, completed=True)

        if not funnel_analysis:
            console.print(f"[red]❌ Funnel '{funnel_name}' not found[/red]")
            raise typer.Exit(1)

        # Display funnel analysis
        _display_funnel_analysis(funnel_analysis)

        # Export if requested
        if export:
            export_data = {
                'name': funnel_analysis.name,
                'date': funnel_analysis.date.isoformat(),
                'total_entries': funnel_analysis.total_entries,
                'total_exits': funnel_analysis.total_exits,
                'total_conversions': funnel_analysis.total_conversions,
                'conversion_rate': funnel_analysis.conversion_rate,
                'total_value': funnel_analysis.total_value,
                'step_performance': funnel_analysis.calculate_funnel_performance()
            }
            with open(export, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)
            console.print(f"[green]✅ Funnel analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Funnel analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def roi(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Calculate ROI and marketing performance metrics"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        console.print(f"[blue]💰 Calculating ROI metrics...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Calculating ROI...", total=None)

            roi_data = asyncio.run(tracker.calculate_roi(days))

            progress.update(task, completed=True)

        if "error" in roi_data:
            console.print(f"[red]❌ {roi_data['error']}[/red]")
            raise typer.Exit(1)

        # Display ROI analysis
        _display_roi_analysis(roi_data)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(roi_data, f, indent=2, default=str)
            console.print(f"[green]✅ ROI data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ ROI calculation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def trends(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    chart: bool = typer.Option(False, "--chart", help="Display ASCII chart"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze conversion trends over time"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        console.print(f"[blue]📈 Analyzing conversion trends...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing trends...", total=None)

            trends_data = asyncio.run(tracker.get_conversion_trends(days))

            progress.update(task, completed=True)

        if "error" in trends_data:
            console.print(f"[red]❌ {trends_data['error']}[/red]")
            raise typer.Exit(1)

        # Display trend analysis
        _display_conversion_trends(trends_data, chart)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(trends_data, f, indent=2, default=str)
            console.print(f"[green]✅ Trends data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Trend analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def goals(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    action: str = typer.Option("list", "--action", "-a", help="Action (list|create|delete)"),
    goal_name: Optional[str] = typer.Option(None, "--name", "-n", help="Goal name"),
    goal_type: Optional[str] = typer.Option(None, "--type", "-t", help="Goal type"),
    value: Optional[float] = typer.Option(None, "--value", "-v", help="Goal value"),
    description: Optional[str] = typer.Option(None, "--description", "-d", help="Goal description")
):
    """Manage conversion goals"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        if action == "create":
            if not goal_name or not goal_type:
                console.print("[red]❌ Goal name and type are required for creation[/red]")
                raise typer.Exit(1)

            console.print(f"[blue]🎯 Creating conversion goal...[/blue]")
            console.print(f"  Name: {goal_name}")
            console.print(f"  Type: {goal_type}")
            console.print(f"  Value: ${value or 0:.2f}")

            success = asyncio.run(tracker.create_goal(goal_name, goal_type, value or 0.0, description or ""))

            if success:
                console.print("[green]✅ Goal created successfully[/green]")
            else:
                console.print("[red]❌ Failed to create goal[/red]")
                raise typer.Exit(1)

        elif action == "list":
            console.print("[blue]📋 Conversion Goals[/blue]")
            # In a real implementation, this would fetch and display existing goals
            console.print("[yellow]No goals configured yet. Use --action create to add goals.[/yellow]")

        else:
            console.print(f"[red]❌ Unknown action: {action}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]❌ Goal management failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def analyze(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    conversion_type: Optional[str] = typer.Option(None, "--type", "-t", help="Filter by conversion type"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze conversion performance and insights"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        console.print(f"[blue]🔍 Analyzing conversions...[/blue]")
        console.print(f"  Period: Last {days} days")
        if conversion_type:
            console.print(f"  Type: {conversion_type}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing conversions...", total=None)

            # Get conversions data
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            conversions = asyncio.run(tracker.get_conversions(start_date, end_date, conversion_type))

            # Get additional metrics
            roi_data = asyncio.run(tracker.calculate_roi(days))
            trends_data = asyncio.run(tracker.get_conversion_trends(days))

            progress.update(task, completed=True)

        if not conversions:
            console.print("[yellow]📭 No conversion data found for the specified period[/yellow]")
            return

        # Display comprehensive analysis
        _display_conversion_analysis(conversions, roi_data, trends_data, days)

        # Export if requested
        if export:
            analysis_data = {
                'conversions': [
                    {
                        'event_id': c.event_id,
                        'conversion_type': c.conversion_type.value,
                        'value': c.value,
                        'timestamp': c.timestamp.isoformat(),
                        'page_url': c.page_url,
                        'campaign': c.campaign
                    }
                    for c in conversions
                ],
                'roi_metrics': roi_data,
                'trend_data': trends_data,
                'analysis_period': f"Last {days} days"
            }
            with open(export, 'w') as f:
                json.dump(analysis_data, f, indent=2, default=str)
            console.print(f"[green]✅ Analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Conversion analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    show: bool = typer.Option(True, "--show", help="Show current configuration"),
    attribution_model: Optional[str] = typer.Option(None, "--attribution", help="Attribution model (first_click|last_click|linear|time_decay)"),
    currency: Optional[str] = typer.Option(None, "--currency", help="Default currency"),
    auto_track: Optional[bool] = typer.Option(None, "--auto-track/--no-auto-track", help="Enable/disable auto tracking")
):
    """Configure conversion tracking settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        tracker = ConversionTracker(project_path)

        # Update configuration
        updated = False
        if attribution_model is not None:
            tracker.config['attribution_model'] = attribution_model
            updated = True
        if currency is not None:
            tracker.config['conversion_currency'] = currency
            updated = True
        if auto_track is not None:
            tracker.config['auto_track'] = auto_track
            updated = True

        if updated:
            tracker.save_config()
            console.print("[green]✅ Configuration updated[/green]")

        if show:
            _display_conversion_config(tracker.config)

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


def _display_funnel_analysis(funnel):
    """Display conversion funnel analysis"""
    console.print(Panel(
        f"[bold blue]Funnel Analysis: {funnel.name}[/bold blue]\n\n"
        f"Total Entries: {funnel.total_entries:,}\n"
        f"Total Conversions: {funnel.total_conversions:,}\n"
        f"Conversion Rate: {funnel.conversion_rate:.2f}%\n"
        f"Total Value: ${funnel.total_value:,.2f}\n"
        f"Analysis Date: {funnel.date.strftime('%Y-%m-%d')}",
        title="Conversion Funnel Performance",
        border_style="blue"
    ))

    # Display funnel steps
    if funnel.steps:
        console.print(f"\n[bold]Funnel Steps:[/bold]")

        steps_table = Table()
        steps_table.add_column("Step", style="cyan")
        steps_table.add_column("Users", justify="right", style="green")
        steps_table.add_column("Completion Rate", justify="right", style="blue")
        steps_table.add_column("Dropoff Rate", justify="right", style="red")

        step_performance = funnel.calculate_funnel_performance()

        for i, step in enumerate(funnel.steps):
            step_name = step['name']
            users = step['users']
            completion_rate = step['completion_rate']
            dropoff_rate = step['dropoff_rate']

            # Color coding
            if dropoff_rate > 50:
                dropoff_color = "red"
            elif dropoff_rate > 25:
                dropoff_color = "yellow"
            else:
                dropoff_color = "green"

            steps_table.add_row(
                step_name,
                f"{users:,}",
                f"{completion_rate:.1f}%",
                f"[{dropoff_color}]{dropoff_rate:.1f}%[/{dropoff_color}]"
            )

        console.print(steps_table)

        # Visual funnel representation
        console.print(f"\n[bold]Visual Funnel:[/bold]")
        for i, step in enumerate(funnel.steps):
            users = step['users']
            max_users = funnel.total_entries
            bar_length = max(1, int((users / max_users) * 30))
            bar = "█" * bar_length + "░" * (30 - bar_length)

            console.print(f"{step['name']:20} │{bar}│ {users:,}")

def _display_roi_analysis(roi_data):
    """Display ROI analysis results"""
    overall = roi_data.get('overall_metrics', {})
    channel_data = roi_data.get('channel_data', {})

    console.print(Panel(
        f"[bold green]ROI Analysis Summary[/bold green]\n\n"
        f"Total Conversions: {overall.get('total_conversions', 0):,}\n"
        f"Total Revenue: ${overall.get('total_revenue', 0):,.2f}\n"
        f"Total Spend: ${overall.get('total_spend', 0):,.2f}\n"
        f"Overall ROI: {overall.get('overall_roi', 0):.1f}%\n"
        f"Overall ROAS: {overall.get('overall_roas', 0):.2f}",
        title=roi_data.get('period', 'Performance Metrics'),
        border_style="green"
    ))

    # Channel performance
    if channel_data:
        console.print(f"\n[bold]Channel Performance:[/bold]")

        channel_table = Table()
        channel_table.add_column("Channel", style="cyan")
        channel_table.add_column("Conversions", justify="right", style="green")
        channel_table.add_column("Revenue", justify="right", style="blue")
        channel_table.add_column("Spend", justify="right", style="yellow")
        channel_table.add_column("ROI", justify="right", style="magenta")
        channel_table.add_column("ROAS", justify="right", style="red")

        for channel, metrics in channel_data.items():
            roi = metrics['roi']
            roas = metrics['roas']

            # Color coding for ROI
            if roi > 100:
                roi_color = "green"
            elif roi > 0:
                roi_color = "yellow"
            else:
                roi_color = "red"

            channel_table.add_row(
                channel.title(),
                f"{metrics['conversions']:,}",
                f"${metrics['revenue']:,.2f}",
                f"${metrics['spend']:,.2f}",
                f"[{roi_color}]{roi:.1f}%[/{roi_color}]",
                f"{roas:.2f}"
            )

        console.print(channel_table)

        # Visual ROI comparison
        console.print(f"\n[bold]ROI Comparison:[/bold]")
        for channel, metrics in sorted(channel_data.items(), key=lambda x: x[1]['roi'], reverse=True):
            roi = metrics['roi']
            bar_length = min(20, max(1, int(abs(roi) / 10)))
            if roi >= 0:
                bar = "█" * bar_length
                color = "green" if roi > 50 else "yellow" if roi > 0 else "red"
            else:
                bar = "█" * bar_length
                color = "red"

            console.print(f"{channel.title():15} │[{color}]{bar}[/{color}]│ {roi:+.1f}%")


def _display_conversion_trends(trends_data, show_chart=False):
    """Display conversion trend analysis"""
    summary = trends_data.get('summary', {})
    trend_data = trends_data.get('trend_data', [])

    console.print(Panel(
        f"[bold blue]Conversion Trends Analysis[/bold blue]\n\n"
        f"Total Conversions: {summary.get('total_conversions', 0):,}\n"
        f"Total Revenue: ${summary.get('total_revenue', 0):,.2f}\n"
        f"Average Conversion Value: ${summary.get('avg_conversion_value', 0):.2f}\n"
        f"Conversion Trend: {summary.get('conversion_trend', 0):+.1f}%\n"
        f"Revenue Trend: {summary.get('revenue_trend', 0):+.1f}%",
        title=summary.get('period', 'Trend Overview'),
        border_style="blue"
    ))

    # Display recent data
    if trend_data:
        console.print(f"\n[bold]Recent Performance:[/bold]")

        recent_table = Table()
        recent_table.add_column("Date", style="cyan")
        recent_table.add_column("Conversions", justify="right", style="green")
        recent_table.add_column("Revenue", justify="right", style="blue")
        recent_table.add_column("Avg Value", justify="right", style="magenta")

        for data_point in trend_data[-10:]:  # Show last 10 days
            recent_table.add_row(
                data_point['date'],
                f"{data_point['conversions']:,}",
                f"${data_point['revenue']:,.2f}",
                f"${data_point['avg_conversion_value']:.2f}"
            )

        console.print(recent_table)

        # Display ASCII chart if requested
        if show_chart and len(trend_data) > 1:
            console.print(f"\n[bold]Conversion Trend Chart:[/bold]")

            max_conversions = max(d['conversions'] for d in trend_data)
            if max_conversions > 0:
                for data_point in trend_data:
                    conversions = data_point['conversions']
                    bar_length = max(1, int((conversions / max_conversions) * 30))
                    bar = "█" * bar_length + "░" * (30 - bar_length)
                    console.print(f"{data_point['date']:12} │{bar}│ {conversions}")


def _display_conversion_analysis(conversions, roi_data, trends_data, days):
    """Display comprehensive conversion analysis"""
    # Summary statistics
    total_conversions = len(conversions)
    total_revenue = sum(c.value for c in conversions)
    avg_value = total_revenue / total_conversions if total_conversions > 0 else 0

    # Conversion type breakdown
    type_breakdown = {}
    for conversion in conversions:
        conv_type = conversion.conversion_type.value
        type_breakdown[conv_type] = type_breakdown.get(conv_type, 0) + 1

    console.print(Panel(
        f"[bold green]Conversion Analysis Summary[/bold green]\n\n"
        f"Total Conversions: {total_conversions:,}\n"
        f"Total Revenue: ${total_revenue:,.2f}\n"
        f"Average Conversion Value: ${avg_value:.2f}\n"
        f"Analysis Period: Last {days} days",
        title="Conversion Performance",
        border_style="green"
    ))

    # Conversion types
    if type_breakdown:
        console.print(f"\n[bold]Conversion Types:[/bold]")
        type_table = Table()
        type_table.add_column("Type", style="cyan")
        type_table.add_column("Count", justify="right", style="green")
        type_table.add_column("Percentage", justify="right", style="blue")

        for conv_type, count in type_breakdown.items():
            percentage = (count / total_conversions) * 100
            type_table.add_row(conv_type.title(), f"{count:,}", f"{percentage:.1f}%")

        console.print(type_table)

    # Top conversions by value
    top_conversions = sorted(conversions, key=lambda c: c.value, reverse=True)[:10]
    if top_conversions:
        console.print(f"\n[bold]Top Conversions by Value:[/bold]")
        top_table = Table()
        top_table.add_column("Date", style="cyan")
        top_table.add_column("Type", style="green")
        top_table.add_column("Value", justify="right", style="blue")
        top_table.add_column("Campaign", style="magenta")

        for conv in top_conversions:
            top_table.add_row(
                conv.timestamp.strftime("%Y-%m-%d"),
                conv.conversion_type.value.title(),
                f"${conv.value:.2f}",
                conv.campaign or "N/A"
            )

        console.print(top_table)

    # ROI summary
    overall = roi_data.get('overall_metrics', {})
    console.print(f"\n[bold]ROI Summary:[/bold]")
    console.print(f"  Overall ROI: {overall.get('overall_roi', 0):.1f}%")
    console.print(f"  Return on Ad Spend: {overall.get('overall_roas', 0):.2f}")

    # Trend summary
    summary = trends_data.get('summary', {})
    console.print(f"\n[bold]Trend Summary:[/bold]")
    console.print(f"  Conversion Trend: {summary.get('conversion_trend', 0):+.1f}%")
    console.print(f"  Revenue Trend: {summary.get('revenue_trend', 0):+.1f}%")


def _display_conversion_config(config):
    """Display conversion tracking configuration"""
    table = Table(title="Conversion Tracking Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Tracking Enabled", "Yes" if config.get('enabled') else "No")
    table.add_row("Auto Track", "Yes" if config.get('auto_track') else "No")
    table.add_row("Attribution Model", config.get('attribution_model', 'last_click'))
    table.add_row("Default Currency", config.get('conversion_currency', 'USD'))

    # Tracking events
    tracking_events = config.get('tracking_events', {})
    if tracking_events:
        table.add_row("Page View Tracking", "Yes" if tracking_events.get('page_view') else "No")
        table.add_row("Form Submission Tracking", "Yes" if tracking_events.get('form_submission') else "No")
        table.add_row("Button Click Tracking", "Yes" if tracking_events.get('button_click') else "No")
        table.add_row("Download Tracking", "Yes" if tracking_events.get('download') else "No")
        table.add_row("Purchase Tracking", "Yes" if tracking_events.get('purchase') else "No")

    console.print(table)


if __name__ == "__main__":
    app()
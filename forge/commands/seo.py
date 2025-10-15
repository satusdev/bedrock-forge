"""
SEO Analytics Command

Provides CLI interface for SEO performance monitoring, keyword tracking,
backlink analysis, and search engine optimization insights.
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

from forge.utils.seo_analytics import SEOAnalyzer
from forge.utils.project import get_project_config

app = typer.Typer(help="SEO performance monitoring and analysis commands")
console = Console()


@app.command()
def analyze(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze comprehensive SEO performance"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]🔍 Analyzing SEO performance...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing SEO metrics...", total=None)

            analysis = asyncio.run(analyzer.analyze_seo_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display SEO analysis results
        _display_seo_analysis(analysis, days)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)
            console.print(f"[green]✅ Analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ SEO analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def keywords(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    limit: int = typer.Option(20, "--limit", "-l", help="Number of keywords to show"),
    sort: str = typer.Option("position", "--sort", "-s", help="Sort by (position|impressions|clicks|ctr|score)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze keyword rankings and performance"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]🎯 Analyzing keyword performance...[/blue]")
        console.print(f"  Period: Last {days} days")
        console.print(f"  Sort by: {sort}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing keywords...", total=None)

            analysis = asyncio.run(analyzer.analyze_seo_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display keyword analysis
        _display_keyword_analysis(analysis, limit, sort)

        # Export if requested
        if export:
            keyword_data = analysis.get('keyword_performance', {})
            with open(export, 'w') as f:
                json.dump(keyword_data, f, indent=2, default=str)
            console.print(f"[green]✅ Keyword data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Keyword analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def track(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    keyword: str = typer.Argument(..., help="Keyword to track"),
    domain: Optional[str] = typer.Option(None, "--domain", "-d", help="Domain to track"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Track specific keyword performance over time"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]📈 Tracking keyword: '{keyword}'[/blue]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Tracking keyword...", total=None)

            tracking_data = asyncio.run(analyzer.track_keyword(keyword, domain))

            progress.update(task, completed=True)

        if "error" in tracking_data:
            console.print(f"[red]❌ {tracking_data['error']}[/red]")
            raise typer.Exit(1)

        # Display tracking results
        _display_keyword_tracking(tracking_data)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(tracking_data, f, indent=2, default=str)
            console.print(f"[green]✅ Tracking data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Keyword tracking failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def competitors(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze competitor SEO performance"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]🏢 Analyzing competitor performance...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing competitors...", total=None)

            analysis = asyncio.run(analyzer.analyze_seo_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display competitor analysis
        _display_competitor_analysis(analysis)

        # Export if requested
        if export:
            competitor_data = analysis.get('competitor_analysis', {})
            with open(export, 'w') as f:
                json.dump(competitor_data, f, indent=2, default=str)
            console.print(f"[green]✅ Competitor data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Competitor analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def backlinks(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze backlink profile and health"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]🔗 Analyzing backlink profile...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing backlinks...", total=None)

            analysis = asyncio.run(analyzer.analyze_seo_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display backlink analysis
        _display_backlink_analysis(analysis)

        # Export if requested
        if export:
            backlink_data = analysis.get('backlink_health', {})
            with open(export, 'w') as f:
                json.dump(backlink_data, f, indent=2, default=str)
            console.print(f"[green]✅ Backlink data exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Backlink analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def technical(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    url: str = typer.Option("", "--url", "-u", help="URL to analyze (uses site URL if not provided)"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export results to file")
):
    """Analyze technical SEO aspects of a page"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        # Use provided URL or get from config
        if not url:
            config = analyzer.config
            url = config.get('gsc', {}).get('site_url', 'https://example.com')

        console.print(f"[blue]🔧 Analyzing technical SEO for: {url}[/blue]")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing technical SEO...", total=None)

            technical_analysis = asyncio.run(analyzer.analyze_technical_seo(url))

            progress.update(task, completed=True)

        if "error" in technical_analysis:
            console.print(f"[red]❌ {technical_analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display technical SEO analysis
        _display_technical_seo(technical_analysis)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(technical_analysis, f, indent=2, default=str)
            console.print(f"[green]✅ Technical analysis exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Technical SEO analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def recommendations(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to analyze"),
    actionable: bool = typer.Option(True, "--actionable/--all", help="Show only actionable recommendations")
):
    """Get SEO recommendations based on analysis"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        console.print(f"[blue]💡 Generating SEO recommendations...[/blue]")
        console.print(f"  Period: Last {days} days")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Generating recommendations...", total=None)

            analysis = asyncio.run(analyzer.analyze_seo_performance(days))

            progress.update(task, completed=True)

        if "error" in analysis:
            console.print(f"[red]❌ {analysis['error']}[/red]")
            raise typer.Exit(1)

        # Display recommendations
        _display_seo_recommendations(analysis, actionable)

    except Exception as e:
        console.print(f"[red]❌ Recommendations generation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    show: bool = typer.Option(True, "--show", help="Show current configuration"),
    gsc_site_url: Optional[str] = typer.Option(None, "--gsc-site-url", help="Google Search Console site URL"),
    gsc_credentials: Optional[str] = typer.Option(None, "--gsc-credentials", help="Path to GSC credentials file"),
    semrush_key: Optional[str] = typer.Option(None, "--semrush-key", help="SEMrush API key"),
    keywords: Optional[str] = typer.Option(None, "--keywords", "-k", help="Comma-separated keywords to track")
):
    """Configure SEO analytics settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        analyzer = SEOAnalyzer(project_path)

        # Update configuration
        updated = False
        if gsc_site_url is not None:
            analyzer.config['gsc']['site_url'] = gsc_site_url
            analyzer.config['gsc']['enabled'] = bool(gsc_site_url)
            updated = True
        if gsc_credentials is not None:
            analyzer.config['gsc']['credentials_path'] = gsc_credentials
            updated = True
        if semrush_key is not None:
            analyzer.config['semrush']['api_key'] = semrush_key
            analyzer.config['semrush']['enabled'] = bool(semrush_key)
            updated = True
        if keywords is not None:
            analyzer.config['tracking']['keywords'] = [k.strip() for k in keywords.split(',')]
            updated = True

        if updated:
            analyzer.save_config()
            console.print("[green]✅ SEO configuration updated[/green]")

        if show:
            _display_seo_config(analyzer.config)

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


def _display_seo_analysis(analysis: dict, days: int):
    """Display comprehensive SEO analysis results"""
    # Keyword performance summary
    keyword_perf = analysis.get('keyword_performance', {})
    if keyword_perf:
        console.print(Panel(
            f"[bold green]SEO Performance Summary[/bold green]\n\n"
            f"Total Keywords: {keyword_perf.get('total_keywords', 0):,}\n"
            f"Average Position: {keyword_perf.get('avg_position', 0):.1f}\n"
            f"Total Impressions: {keyword_perf.get('total_impressions', 0):,}\n"
            f"Total Clicks: {keyword_perf.get('total_clicks', 0):,}\n"
            f"Average CTR: {keyword_perf.get('avg_ctr', 0):.1%}",
            title=f"SEO Overview (Last {days} days)",
            border_style="green"
        ))

        # Top keywords
        top_keywords = keyword_perf.get('top_keywords', [])
        if top_keywords:
            console.print(f"\n[bold]Top Performing Keywords:[/bold]")
            keywords_table = Table()
            keywords_table.add_column("Keyword", style="cyan")
            keywords_table.add_column("Score", justify="right", style="green")

            for keyword, score in top_keywords[:10]:
                keywords_table.add_row(keyword, f"{score:.1f}")

            console.print(keywords_table)

    # Ranking distribution
    ranking_dist = keyword_perf.get('ranking_distribution', {})
    if ranking_dist:
        console.print(f"\n[bold]Ranking Distribution:[/bold]")

        # Create visual distribution
        total_keywords = sum(ranking_dist.values())
        for position_range in ['1-3', '4-10', '11-20', '21+']:
            if position_range == '1-3':
                count = sum(ranking_dist.get(i, 0) for i in [1, 2, 3])
                color = "green"
            elif position_range == '4-10':
                count = sum(ranking_dist.get(i, 0) for i in range(4, 11))
                color = "yellow"
            elif position_range == '11-20':
                count = sum(ranking_dist.get(i, 0) for i in range(11, 21))
                color = "orange1"
            else:
                count = ranking_dist.get(11, 0)  # Position 11+ bucket
                color = "red"

            percentage = (count / total_keywords) * 100 if total_keywords > 0 else 0
            bar_length = int(percentage / 5)  # Scale to max 20 chars
            bar = "█" * bar_length + "░" * (20 - bar_length)

            console.print(f"[{color}]{position_range:4}[/color]: {bar} [{color}]{count} ({percentage:.1f}%)[/{color}]")

    # Backlink health
    backlink_health = analysis.get('backlink_health', {})
    if backlink_health and 'error' not in backlink_health:
        console.print(f"\n[bold]Backlink Profile:[/bold]")
        console.print(f"  Total Backlinks: {backlink_health.get('total_backlinks', 0):,}")
        console.print(f"  Referring Domains: {backlink_health.get('referring_domains', 0):,}")
        console.print(f"  Domain Authority: {backlink_health.get('domain_authority', 0):.1f}")
        console.print(f"  Health Score: {backlink_health.get('health_score', 0):.1f}/100")

    # SEO insights
    insights = analysis.get('seo_insights', [])
    if insights:
        console.print(f"\n[bold yellow]SEO Insights:[/bold yellow]")
        for insight in insights:
            console.print(f"💡 {insight}")

    # Recommendations
    recommendations = analysis.get('recommendations', [])
    if recommendations:
        console.print(f"\n[bold green]SEO Recommendations:[/bold green]")
        for i, rec in enumerate(recommendations, 1):
            console.print(f"{i}. {rec}")


def _display_keyword_analysis(analysis: dict, limit: int, sort_by: str):
    """Display keyword analysis results"""
    keyword_perf = analysis.get('keyword_performance', {})
    if not keyword_perf or 'error' in keyword_perf:
        console.print("[yellow]No keyword data available[/yellow]")
        return

    keyword_data = keyword_perf.get('keyword_performance', {})
    if not keyword_data:
        console.print("[yellow]No keyword data available[/yellow]")
        return

    # Sort keywords based on sort parameter
    if sort_by == "position":
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['current_position'])
    elif sort_by == "impressions":
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['impressions'], reverse=True)
    elif sort_by == "clicks":
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['clicks'], reverse=True)
    elif sort_by == "ctr":
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['ctr'], reverse=True)
    elif sort_by == "score":
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['seo_score'], reverse=True)
    else:
        sorted_keywords = sorted(keyword_data.items(), key=lambda x: x[1]['current_position'])

    # Display top keywords
    console.print(Panel(
        f"[bold blue]Keyword Performance Analysis[/bold blue]\n\n"
        f"Total Keywords: {keyword_perf.get('total_keywords', 0):,}\n"
        f"Average Position: {keyword_perf.get('avg_position', 0):.1f}\n"
        f"Sort by: {sort_by}",
        title=f"Top {limit} Keywords",
        border_style="blue"
    ))

    keywords_table = Table()
    keywords_table.add_column("Keyword", style="cyan")
    keywords_table.add_column("Position", justify="right", style="green")
    keywords_table.add_column("Impressions", justify="right", style="blue")
    keywords_table.add_column("Clicks", justify="right", style="magenta")
    keywords_table.add_column("CTR", justify="right", style="yellow")
    keywords_table.add_column("Score", justify="right", style="red")
    keywords_table.add_column("Trend", justify="center", style="white")

    trend_symbols = {
        "improving": "📈",
        "declining": "📉",
        "stable": "➡️",
        "insufficient_data": "❓"
    }

    for keyword, data in sorted_keywords[:limit]:
        position = data['current_position']
        trend_symbol = trend_symbols.get(data['trend'], "❓")

        # Color code position
        position_color = "green" if position <= 10 else "yellow" if position <= 20 else "red"

        keywords_table.add_row(
            keyword[:50] + "..." if len(keyword) > 50 else keyword,
            f"[{position_color}]{position}[/{position_color}]",
            f"{data['impressions']:,}",
            f"{data['clicks']:,}",
            f"{data['ctr']:.1%}",
            f"{data['seo_score']:.1f}",
            trend_symbol
        )

    console.print(keywords_table)


def _display_keyword_tracking(tracking_data: dict):
    """Display keyword tracking results"""
    console.print(Panel(
        f"[bold magenta]Keyword Tracking Results[/bold magenta]\n\n"
        f"Keyword: {tracking_data.get('keyword', 'N/A')}\n"
        f"Current Position: {tracking_data.get('current_position', 0)}\n"
        f"Current URL: {tracking_data.get('current_url', 'N/A')}\n"
        f"Impressions: {tracking_data.get('impressions', 0):,}\n"
        f"Clicks: {tracking_data.get('clicks', 0):,}\n"
        f"CTR: {tracking_data.get('ctr', 0):.1%}\n"
        f"Trend: {tracking_data.get('trend', 'N/A')}",
        title="Keyword Performance",
        border_style="magenta"
    ))

    # Display historical data
    historical_data = tracking_data.get('historical_data', [])
    if historical_data:
        console.print(f"\n[bold]Historical Performance:[/bold]")

        history_table = Table()
        history_table.add_column("Date", style="cyan")
        history_table.add_column("Position", justify="right", style="green")
        history_table.add_column("Impressions", justify="right", style="blue")
        history_table.add_column("Clicks", justify="right", style="magenta")
        history_table.add_column("CTR", justify="right", style="yellow")

        for data_point in historical_data[-10:]:  # Show last 10 days
            date = data_point['date'][:10]
            position = data_point['position']
            position_color = "green" if position <= 10 else "yellow" if position <= 20 else "red"

            history_table.add_row(
                date,
                f"[{position_color}]{position}[/{position_color}]",
                f"{data_point['impressions']:,}",
                f"{data_point['clicks']:,}",
                f"{data_point['ctr']:.1%}"
            )

        console.print(history_table)


def _display_competitor_analysis(analysis: dict):
    """Display competitor analysis results"""
    competitor_data = analysis.get('competitor_analysis', {})
    if not competitor_data or 'error' in competitor_data:
        console.print("[yellow]No competitor data available[/yellow]")
        return

    console.print(Panel(
        f"[bold cyan]Competitor Analysis[/bold cyan]\n\n"
        f"Competitors Tracked: {competitor_data.get('competitor_count', 0)}",
        title="SEO Competitive Intelligence",
        border_style="cyan"
    ))

    # Top competitors
    top_competitors = competitor_data.get('top_competitors', [])
    if top_competitors:
        console.print(f"\n[bold]Top Competitors:[/bold]")

        comp_table = Table()
        comp_table.add_column("Competitor", style="cyan")
        comp_table.add_column("Avg Position", justify="right", style="green")
        comp_table.add_column("Best Position", justify="right", style="blue")
        comp_table.add_column("Keywords", justify="right", style="magenta")
        comp_table.add_column("Trend", justify="center", style="yellow")

        trend_symbols = {
            "improving": "📈",
            "declining": "📉",
            "stable": "➡️",
            "insufficient_data": "❓"
        }

        for competitor, data in top_competitors[:10]:
            trend_symbol = trend_symbols.get(data['trend'], "❓")

            comp_table.add_row(
                competitor,
                f"{data['avg_position']:.1f}",
                str(data['best_position']),
                str(data['keyword_count']),
                trend_symbol
            )

        console.print(comp_table)


def _display_backlink_analysis(analysis: dict):
    """Display backlink analysis results"""
    backlink_health = analysis.get('backlink_health', {})
    if not backlink_health or 'error' in backlink_health:
        console.print("[yellow]No backlink data available[/yellow]")
        return

    console.print(Panel(
        f"[bold orange1]Backlink Profile Analysis[/bold orange1]\n\n"
        f"Total Backlinks: {backlink_health.get('total_backlinks', 0):,}\n"
        f"Referring Domains: {backlink_health.get('referring_domains', 0):,}\n"
        f"Domain Authority: {backlink_health.get('domain_authority', 0):.1f}\n"
        f"Page Authority: {backlink_health.get('page_authority', 0):.1f}\n"
        f"Spam Score: {backlink_health.get('spam_score', 0):.1f}\n"
        f"Health Score: {backlink_health.get('health_score', 0):.1f}/100",
        title="Backlink Health Assessment",
        border_style="orange1"
    ))

    # Link quality distribution
    console.print(f"\n[bold]Link Quality Distribution:[/bold]")

    total_links = backlink_health.get('total_backlinks', 1)
    high_quality = backlink_health.get('high_quality_ratio', 0)

    # Create visual representation
    quality_bar_length = 20
    high_quality_bar = "█" * int(high_quality / 5)
    medium_quality_bar = "█" * int((100 - high_quality) / 10)

    console.print(f"[green]High Quality: {high_quality_bar}{'░' * (quality_bar_length - int(high_quality / 5))} {high_quality:.1f}%[/green]")
    console.print(f"[yellow]Medium/Low: {medium_quality_bar}{'░' * (quality_bar_length - int((100 - high_quality) / 10))} {100 - high_quality:.1f}%[/yellow]")

    # Recent changes
    new_links = backlink_health.get('new_links', 0)
    lost_links = backlink_health.get('lost_links', 0)

    console.print(f"\n[bold]Recent Changes:[/bold]")
    console.print(f"  New Links: [green]+{new_links}[/green]")
    console.print(f"  Lost Links: [red]-{lost_links}[/red]")
    console.print(f"  Net Change: [{'green' if new_links > lost_links else 'red'}]{new_links - lost_links:+}[/]")


def _display_technical_seo(analysis: dict):
    """Display technical SEO analysis results"""
    console.print(Panel(
        f"[bold blue]Technical SEO Analysis[/bold blue]\n\n"
        f"URL: {analysis.get('url', 'N/A')}\n"
        f"SEO Score: {analysis.get('seo_score', 0)}/100",
        title="Technical SEO Assessment",
        border_style="blue"
    ))

    # Create metrics table
    metrics_table = Table()
    metrics_table.add_column("Metric", style="cyan")
    metrics_table.add_column("Value", style="green")
    metrics_table.add_column("Status", style="yellow")

    metrics = [
        ("Title Length", f"{analysis.get('title_length', 0)} characters",
         "✅ Good" if 30 <= analysis.get('title_length', 0) <= 60 else "⚠️ Needs attention"),
        ("Meta Description", f"{analysis.get('meta_description_length', 0)} characters",
         "✅ Good" if 120 <= analysis.get('meta_description_length', 0) <= 160 else "⚠️ Needs attention"),
        ("H1 Tag", "Present" if analysis.get('h1_present', False) else "Missing",
         "✅ Present" if analysis.get('h1_present', False) else "❌ Missing"),
        ("H2 Tags", f"{analysis.get('h2_count', 0)} tags",
         "✅ Good" if analysis.get('h2_count', 0) > 0 else "⚠️ Consider adding"),
        ("Word Count", f"{analysis.get('word_count', 0)} words",
         "✅ Good" if analysis.get('word_count', 0) >= 300 else "⚠️ Too short"),
        ("Internal Links", f"{analysis.get('internal_links', 0)} links",
         "✅ Good" if analysis.get('internal_links', 0) > 0 else "⚠️ Add internal links"),
        ("External Links", f"{analysis.get('external_links', 0)} links",
         "✅ Good" if analysis.get('external_links', 0) > 0 else "⚠️ Consider external links"),
        ("Images without Alt", f"{analysis.get('images_without_alt', 0)} images",
         "✅ All have alt" if analysis.get('images_without_alt', 0) == 0 else "❌ Missing alt text"),
        ("Load Time", f"{analysis.get('load_time', 0):.1f}s",
         "✅ Fast" if analysis.get('load_time', 0) < 3 else "⚠️ Too slow"),
        ("Mobile Friendly", "Yes" if analysis.get('mobile_friendly', False) else "No",
         "✅ Mobile friendly" if analysis.get('mobile_friendly', False) else "❌ Not mobile friendly"),
        ("SSL Certificate", "Valid" if analysis.get('ssl_certificate', False) else "Invalid",
         "✅ Valid" if analysis.get('ssl_certificate', False) else "❌ Invalid or missing")
    ]

    for metric, value, status in metrics:
        metrics_table.add_row(metric, value, status)

    console.print(metrics_table)

    # Issues and recommendations
    issues = analysis.get('issues', [])
    if issues:
        console.print(f"\n[bold red]Issues Found:[/bold red]")
        for issue in issues:
            console.print(f"❌ {issue}")

    recommendations = analysis.get('recommendations', [])
    if recommendations:
        console.print(f"\n[bold green]Recommendations:[/bold green]")
        for rec in recommendations:
            console.print(f"💡 {rec}")


def _display_seo_recommendations(analysis: dict, actionable_only: bool):
    """Display SEO recommendations"""
    recommendations = analysis.get('recommendations', [])

    if not recommendations:
        console.print("[yellow]📭 No recommendations available. Your SEO is performing well![/yellow]")
        return

    console.print(Panel(
        f"[bold green]SEO Recommendations[/bold green]\n\n"
        f"Total Recommendations: {len(recommendations)}",
        title="Actionable SEO Insights",
        border_style="green"
    ))

    # Categorize recommendations
    categorized = {
        'Keywords & Content': [],
        'Technical SEO': [],
        'Backlinks & Authority': [],
        'General': []
    }

    for rec in recommendations:
        rec_lower = rec.lower()
        if any(keyword in rec_lower for keyword in ['keyword', 'content', 'meta', 'title', 'description']):
            categorized['Keywords & Content'].append(rec)
        elif any(keyword in rec_lower for keyword in ['backlink', 'domain', 'authority', 'link']):
            categorized['Backlinks & Authority'].append(rec)
        elif any(keyword in rec_lower for keyword in ['optimize', 'technical', 'load', 'mobile', 'ssl']):
            categorized['Technical SEO'].append(rec)
        else:
            categorized['General'].append(rec)

    # Display categorized recommendations
    for category, recs in categorized.items():
        if recs:
            console.print(f"\n[bold cyan]{category}:[/bold cyan]")
            for i, rec in enumerate(recs, 1):
                console.print(f"{i}. {rec}")


def _display_seo_config(config: dict):
    """Display SEO configuration"""
    table = Table(title="SEO Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    # General settings
    table.add_row("SEO Enabled", "Yes" if config.get('enabled') else "No")
    table.add_row("Auto Collect", "Yes" if config.get('auto_collect') else "No")
    table.add_row("Collection Interval", f"{config.get('collection_interval', 0)} seconds")
    table.add_row("Data Retention", f"{config.get('data_retention_days', 0)} days")

    # GSC settings
    gsc_config = config.get('gsc', {})
    table.add_row("GSC Enabled", "Yes" if gsc_config.get('enabled') else "No")
    table.add_row("GSC Site URL", gsc_config.get('site_url', 'Not configured'))
    table.add_row("GSC Credentials", gsc_config.get('credentials_path', 'Not configured'))

    # SEMrush settings
    semrush_config = config.get('semrush', {})
    table.add_row("SEMrush Enabled", "Yes" if semrush_config.get('enabled') else "No")
    table.add_row("SEMrush API Key", "Configured" if semrush_config.get('api_key') else "Not configured")

    # Tracking settings
    tracking_config = config.get('tracking', {})
    table.add_row("Tracked Keywords", f"{len(tracking_config.get('keywords', []))}")
    table.add_row("Tracked Competitors", f"{len(tracking_config.get('competitors', []))}")
    table.add_row("Target Position", str(tracking_config.get('target_position', 10)))

    console.print(table)


if __name__ == "__main__":
    app()
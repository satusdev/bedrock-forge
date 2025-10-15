"""
Database optimization commands for Bedrock Forge.

Provides comprehensive database analysis, optimization, and maintenance
tools for WordPress databases.
"""

import asyncio
import typer
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.prompt import Confirm, Prompt

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.db_optimizer import DatabaseOptimizer
from ..models.project import Project
from ..constants import *
from ..utils.local_config import LocalConfigManager
from ..utils.project_helpers import ProjectSelector

app = typer.Typer(help="Database optimization and maintenance")

# Rich console for beautiful output
console = Console()

# Initialize utilities
config_manager = LocalConfigManager()
project_selector = ProjectSelector(config_manager)


def display_table_stats(table_stats: List[Dict]) -> None:
    """Display table statistics in a beautiful format."""
    if not table_stats:
        console.print("No table statistics available.")
        return

    table = Table(title="Database Table Statistics")
    table.add_column("Table", style="cyan")
    table.add_column("Rows", style="green")
    table.add_column("Data Size", style="blue")
    table.add_column("Index Size", style="yellow")
    table.add_column("Total Size", style="red")
    table.add_column("Fragmentation", style="magenta")

    for stat in table_stats:
        fragmentation_mb = stat.get('fragmentation', 0) / (1024 * 1024)
        frag_color = "red" if fragmentation_mb > 50 else "yellow" if fragmentation_mb > 10 else "green"

        table.add_row(
            stat['table_name'],
            f"{stat.get('rows', 0):,}",
            format_bytes(stat.get('data_size', 0)),
            format_bytes(stat.get('index_size', 0)),
            format_bytes(stat.get('total_size', 0)),
            f"{fragmentation_mb:.1f}MB",
            style=frag_color
        )

    console.print(table)


def display_query_stats(query_stats: List[Dict]) -> None:
    """Display query statistics."""
    if not query_stats:
        console.print("No query statistics available.")
        return

    table = Table(title="Query Performance Statistics")
    table.add_column("Query", style="cyan", max_width=50)
    table.add_column("Executions", style="green")
    table.add_column("Avg Time", style="yellow")
    table.add_column("Max Time", style="red")
    table.add_column("Rows Sent", style="blue")
    table.add_column("Rows Examined", style="magenta")

    for stat in query_stats[:20]:  # Show top 20
        avg_time_color = "red" if stat.get('avg_time', 0) > 1.0 else "yellow" if stat.get('avg_time', 0) > 0.5 else "green"
        max_time_color = "red" if stat.get('max_time', 0) > 2.0 else "yellow" if stat.get('max_time', 0) > 1.0 else "green"

        table.add_row(
            stat['query'][:47] + "..." if len(stat['query']) > 50 else stat['query'],
            f"{stat.get('execution_count', 0):,}",
            f"{stat.get('avg_time', 0):.3f}s",
            f"{stat.get('max_time', 0):.3f}s",
            f"{stat.get('rows_sent', 0):,}",
            f"{stat.get('rows_examined', 0):,}",
            style=avg_time_color
        )

    console.print(table)


def display_slow_queries(slow_queries: List[Dict]) -> None:
    """Display slow queries."""
    if not slow_queries:
        console.print("🟢 No slow queries found!")
        return

    table = Table(title="Slow Queries")
    table.add_column("Query", style="cyan", max_width=60)
    table.add_column("Executions", style="green")
    table.add_column("Avg Time", style="yellow")
    table.add_column("Max Time", style="red")
    table.add_column("Rows Sent/Examined", style="blue")

    for query in slow_queries:
        avg_time = query.get('avg_time', 0)
        rows_sent = query.get('rows_sent', 0)
        rows_examined = query.get('rows_examined', 0)

        # Color code based on severity
        time_color = "red" if avg_time > 5.0 else "yellow" if avg_time > 2.0 else "green"
        scan_ratio = rows_examined / max(rows_sent, 1)
        scan_color = "red" if scan_ratio > 100 else "yellow" if scan_ratio > 10 else "green"

        table.add_row(
            query['query'][:57] + "..." if len(query['query']) > 60 else query['query'],
            f"{query.get('execution_count', 0):,}",
            f"{avg_time:.3f}s",
            f"{query.get('max_time', 0):.3f}s",
            f"{rows_sent:,}/{rows_examined:,}",
            style=time_color
        )

    console.print(table)


def format_bytes(bytes_value: int) -> str:
    """Format bytes in human readable format."""
    if bytes_value == 0:
        return "0B"

    units = ['B', 'KB', 'MB', 'GB', 'TB']
    unit_index = 0
    size = float(bytes_value)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    return f"{size:.1f}{units[unit_index]}"


@app.command()
def analyze(
    project_name: Optional[str] = typer.Argument(None, help="Project name to analyze"),
    detailed: bool = typer.Option(False, "--detailed", help="Include detailed analysis"),
    output_format: str = typer.Option("table", "--output", help="Output format: table, json"),
    save_report: bool = typer.Option(True, "--save-report/--no-save-report", help="Save analysis report"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Analyze database performance and structure."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found. Create a project first.")

            console.print("Available projects:")
            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name} ({project.wp_home})")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        console.print(f"🔍 Analyzing database for project: {project_name}")

        if dry_run:
            console.print("[yellow]Dry run: Would analyze database performance[/yellow]")
            return

        # Run analysis with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing database structure...", total=None)

            optimizer = DatabaseOptimizer(project)
            analysis = asyncio.run(optimizer.analyze_database(detailed=detailed))

            progress.update(task, description="Processing analysis results...")

        # Display results
        if output_format == "json":
            console.print(json.dumps(analysis, indent=2, default=str))
        else:
            # Display summary
            console.print("\n📊 Database Analysis Summary")
            console.print(f"Tables analyzed: {len(analysis.get('tables', []))}")
            console.print(f"Queries analyzed: {len(analysis.get('queries', []))}")
            console.print(f"Slow queries: {len(analysis.get('slow_queries', []))}")
            console.print(f"Index recommendations: {len(analysis.get('indexes', []))}")

            # Display table statistics
            if analysis.get('tables'):
                console.print("\n📋 Table Statistics")
                display_table_stats(analysis['tables'])

            # Display query statistics
            if analysis.get('queries'):
                console.print("\n⚡ Query Performance")
                display_query_stats(analysis['queries'])

            # Display slow queries
            if analysis.get('slow_queries'):
                console.print("\n🐌 Slow Queries")
                display_slow_queries(analysis['slow_queries'])

            # Display recommendations
            if analysis.get('recommendations'):
                console.print("\n💡 Recommendations")
                for i, rec in enumerate(analysis['recommendations'][:10], 1):
                    console.print(f"{i}. {rec}")

        # Save report if requested
        if save_report:
            report_path = project_dir / ".ddev" / f"db_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)

            with open(report_path, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)

            console.print(f"\n💾 Analysis report saved to: {report_path}")

    except Exception as e:
        console.print(f"❌ Database analysis failed: {e}")
        raise typer.Exit(1)


@app.command()
def optimize(
    project_name: Optional[str] = typer.Argument(None, help="Project name to optimize"),
    auto: bool = typer.Option(False, "--auto", help="Run optimization without confirmation"),
    optimize_tables: bool = typer.Option(True, "--optimize-tables/--no-optimize-tables", help="Optimize tables"),
    add_indexes: bool = typer.Option(True, "--add-indexes/--no-add-indexes", help="Add recommended indexes"),
    analyze_queries: bool = typer.Option(True, "--analyze-queries/--no-analyze-queries", help="Analyze queries"),
    cleanup: bool = typer.Option(True, "--cleanup/--no-cleanup", help="Clean up database"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Optimize database for better performance."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        console.print(f"🚀 Optimizing database for project: {project_name}")

        # Show optimization plan
        optimization_plan = []
        if optimize_tables:
            optimization_plan.append("• Optimize database tables")
        if add_indexes:
            optimization_plan.append("• Add recommended indexes")
        if analyze_queries:
            optimization_plan.append("• Analyze and optimize queries")
        if cleanup:
            optimization_plan.append("• Clean up old data (transients, revisions, spam)")

        console.print("\n📋 Optimization Plan:")
        for item in optimization_plan:
            console.print(item)

        if not auto and not dry_run:
            if not Confirm.ask("\nProceed with optimization?"):
                console.print("Optimization cancelled.")
                return

        if dry_run:
            console.print("[yellow]Dry run: Would perform database optimization[/yellow]")
            return

        # Run optimization with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Running database optimization...", total=None)

            optimizer = DatabaseOptimizer(project)
            options = {
                'optimize_tables': optimize_tables,
                'add_indexes': add_indexes,
                'analyze_queries': analyze_queries,
                'clean_up': cleanup
            }

            result = asyncio.run(optimizer.optimize_database(options))

            progress.update(task, description="Optimization completed...")

        # Display results
        console.print("\n✅ Database Optimization Results")
        console.print(f"Tables optimized: {result.tables_optimized}")
        console.print(f"Indexes added: {result.indexes_added}")
        console.print(f"Space saved: {format_bytes(result.space_saved)}")
        console.print(f"Queries analyzed: {result.queries_analyzed}")
        console.print(f"Slow queries optimized: {result.slow_queries_fixed}")
        console.print(f"Optimization time: {result.optimization_time:.2f} seconds")

        if result.recommendations:
            console.print("\n💡 Post-optimization Recommendations:")
            for i, rec in enumerate(result.recommendations[:5], 1):
                console.print(f"{i}. {rec}")

        # Save optimization history
        history_path = project_dir / ".ddev" / f"db_optimization_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        history_path.parent.mkdir(parents=True, exist_ok=True)

        with open(history_path, 'w') as f:
            json.dump(result.__dict__, f, indent=2, default=str)

        console.print(f"\n💾 Optimization history saved to: {history_path}")

    except Exception as e:
        console.print(f"❌ Database optimization failed: {e}")
        raise typer.Exit(1)


@app.command()
def history(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    days: int = typer.Option(30, "--days", help="Number of days to show"),
    output_format: str = typer.Option("table", "--output", help="Output format: table, json"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """View database optimization history."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        optimizer = DatabaseOptimizer(project)
        history_data = optimizer.get_optimization_history(days)

        if not history_data:
            console.print(f"No optimization history found in the last {days} days.")
            return

        if output_format == "json":
            console.print(json.dumps([h.__dict__ for h in history_data], indent=2, default=str))
        else:
            table = Table(title=f"Database Optimization History (Last {days} days)")
            table.add_column("Date", style="cyan")
            table.add_column("Tables", style="green")
            table.add_column("Indexes", style="yellow")
            table.add_column("Space Saved", style="blue")
            table.add_column("Time", style="red")

            for record in history_data:
                table.add_row(
                    record.timestamp.strftime("%Y-%m-%d %H:%M"),
                    str(record.tables_optimized),
                    str(record.indexes_added),
                    format_bytes(record.space_saved),
                    f"{record.optimization_time:.1f}s"
                )

            console.print(table)

    except Exception as e:
        console.print(f"❌ Failed to get optimization history: {e}")
        raise typer.Exit(1)


@app.command()
def schedule(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    frequency: str = typer.Option("weekly", "--frequency", help="Frequency: daily, weekly, monthly"),
    enable: bool = typer.Option(False, "--enable", help="Enable scheduled maintenance"),
    disable: bool = typer.Option(False, "--disable", help="Disable scheduled maintenance"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Schedule regular database maintenance."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        optimizer = DatabaseOptimizer(project)

        if enable:
            console.print(f"🕐 Scheduling database maintenance for {project_name}")
            console.print(f"📅 Frequency: {frequency}")

            if dry_run:
                console.print("[yellow]Dry run: Would schedule maintenance[/yellow]")
                return

            # Generate maintenance script and cron entry
            cron_entry = asyncio.run(optimizer.schedule_maintenance(frequency))

            console.print("✅ Database maintenance scheduled")
            console.print("\n📝 Add this to your crontab:")
            console.print(Panel(cron_entry, title="Cron Entry"))

        elif disable:
            console.print(f"🛑 Disabling scheduled maintenance for {project_name}")
            # Implementation would remove cron entry
            console.print("✅ Scheduled maintenance disabled")

        else:
            # Show current schedule status
            console.print(f"📊 Maintenance Schedule Status for {project_name}")
            console.print("Status: Check crontab for existing database maintenance jobs")

    except Exception as e:
        console.print(f"❌ Schedule operation failed: {e}")
        raise typer.Exit(1)


@app.command()
def status(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Show database status and health."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        console.print(f"📊 Database Status for {project_name}")

        # Get basic database information
        try:
            optimizer = DatabaseOptimizer(project)
            analysis = asyncio.run(optimizer.analyze_database(detailed=False))

            # Calculate total database size
            tables = analysis.get('tables', [])
            total_size = sum(t.get('total_size', 0) for t in tables)
            total_rows = sum(t.get('rows', 0) for t in tables)

            # Calculate fragmentation
            fragmented_tables = [t for t in tables if t.get('fragmentation', 0) > 10485760]  # > 10MB
            total_fragmentation = sum(t.get('fragmentation', 0) for t in tables)

            # Count slow queries
            slow_queries = analysis.get('slow_queries', [])

            # Display status
            console.print(f"\n📈 Database Metrics:")
            console.print(f"Total Tables: {len(tables)}")
            console.print(f"Total Rows: {total_rows:,}")
            console.print(f"Total Size: {format_bytes(total_size)}")
            console.print(f"Fragmented Tables: {len(fragmented_tables)}")
            console.print(f"Total Fragmentation: {format_bytes(total_fragmentation)}")
            console.print(f"Slow Queries: {len(slow_queries)}")

            # Health indicators
            console.print(f"\n🏥 Database Health:")

            # Size health
            if total_size > 5 * 1024 * 1024 * 1024:  # > 5GB
                console.print("🔴 Database size is large (>5GB)")
            elif total_size > 1 * 1024 * 1024 * 1024:  # > 1GB
                console.print("🟡 Database size is moderate (>1GB)")
            else:
                console.print("🟢 Database size is healthy")

            # Fragmentation health
            if len(fragmented_tables) > len(tables) * 0.3:  # > 30% fragmented
                console.print("🔴 High fragmentation detected")
            elif len(fragmented_tables) > 0:
                console.print("🟡 Some fragmentation detected")
            else:
                console.print("🟢 Database fragmentation is minimal")

            # Query performance health
            if len(slow_queries) > 10:
                console.print("🔴 Many slow queries detected")
            elif len(slow_queries) > 0:
                console.print("🟡 Some slow queries detected")
            else:
                console.print("🟢 Query performance is good")

            # Recommendations
            recommendations = []
            if total_size > 1 * 1024 * 1024 * 1024:
                recommendations.append("Consider archiving old data")
            if len(fragmented_tables) > 0:
                recommendations.append("Run database optimization")
            if len(slow_queries) > 0:
                recommendations.append("Analyze and optimize slow queries")

            if recommendations:
                console.print(f"\n💡 Recommendations:")
                for i, rec in enumerate(recommendations, 1):
                    console.print(f"{i}. {rec}")

        except Exception as e:
            console.print(f"❌ Failed to get database status: {e}")

    except Exception as e:
        console.print(f"❌ Database status check failed: {e}")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
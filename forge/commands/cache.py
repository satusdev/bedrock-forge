"""
Cache management commands for Bedrock Forge.

Provides comprehensive cache configuration, optimization, and monitoring
tools for WordPress sites with multiple caching strategies.
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
from rich.prompt import Confirm, Prompt, IntPrompt

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.cache_manager import (
    CacheManager, CacheType, CacheStrategy, CacheStatus,
    CacheConfig, CacheStats
)
from ..models.project import Project
from ..constants import *
from ..utils.local_config import LocalConfigManager
from ..utils.project_helpers import ProjectSelector

app = typer.Typer(help="Cache management and optimization")

# Rich console for beautiful output
console = Console()

# Initialize utilities
config_manager = LocalConfigManager()
project_selector = ProjectSelector(config_manager)


def display_cache_configs(configs: Dict[CacheType, CacheConfig]) -> None:
    """Display cache configurations in a beautiful format."""
    if not configs:
        console.print("No cache configurations found.")
        return

    table = Table(title="Cache Configuration")
    table.add_column("Cache Type", style="cyan")
    table.add_column("Strategy", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("TTL", style="blue")
    table.add_column("Max Size", style="red")
    table.add_column("Compression", style="magenta")

    for cache_type, config in configs.items():
        status_emoji = "🟢" if config.enabled else "🔴"
        compression_emoji = "✅" if config.compression else "❌"

        table.add_row(
            cache_type.value.title(),
            config.strategy.value.title(),
            f"{status_emoji} {'Enabled' if config.enabled else 'Disabled'}",
            format_duration(config.ttl),
            format_bytes(config.max_size) if config.max_size else "Unlimited",
            compression_emoji
        )

    console.print(table)


def display_cache_stats(stats: Dict[str, CacheStats]) -> None:
    """Display cache statistics."""
    if not stats:
        console.print("No cache statistics available.")
        return

    table = Table(title="Cache Statistics")
    table.add_column("Cache Type", style="cyan")
    table.add_column("Hits", style="green")
    table.add_column("Misses", style="red")
    table.add_column("Hit Rate", style="yellow")
    table.add_column("Current Size", style="blue")
    table.add_column("Memory Usage", style="magenta")

    for cache_type_name, stat in stats.items():
        hit_rate_color = "green" if stat.hit_rate > 80 else "yellow" if stat.hit_rate > 50 else "red"

        table.add_row(
            cache_type_name.title(),
            f"{stat.hits:,}",
            f"{stat.misses:,}",
            f"{stat.hit_rate:.1f}%",
            format_bytes(stat.current_size),
            format_bytes(stat.memory_usage),
            style=hit_rate_color
        )

    console.print(table)


def format_duration(seconds: int) -> str:
    """Format duration in human readable format."""
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{hours}h {minutes}m"


def format_bytes(bytes_value: Optional[int]) -> str:
    """Format bytes in human readable format."""
    if not bytes_value or bytes_value == 0:
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
    """Analyze cache performance and configuration."""
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

        console.print(f"🔍 Analyzing cache for project: {project_name}")

        if dry_run:
            console.print("[yellow]Dry run: Would analyze cache performance[/yellow]")
            return

        # Run analysis with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing cache performance...", total=None)

            cache_manager = CacheManager(project)
            analysis = asyncio.run(cache_manager.analyze_cache_performance(detailed=detailed))

            progress.update(task, description="Processing analysis results...")

        # Display results
        if output_format == "json":
            console.print(json.dumps(analysis, indent=2, default=str))
        else:
            # Display summary
            console.print("\n📊 Cache Analysis Summary")

            # Cache configurations
            cache_configs = analysis.get('cache_configs', {})
            console.print(f"Configured caches: {len(cache_configs)}")
            enabled_caches = sum(1 for cfg in cache_configs.values() if cfg.get('enabled'))
            console.print(f"Enabled caches: {enabled_caches}")

            # Plugin status
            plugins = analysis.get('plugin_status', {})
            active_plugins = sum(plugins.values())
            console.print(f"Active cache plugins: {active_plugins}")

            # Server cache
            server_cache = analysis.get('server_cache', {})
            server_cache_enabled = sum(server_cache.values())
            console.print(f"Server cache enabled: {server_cache_enabled}")

            # Display detailed information
            if cache_configs:
                console.print("\n⚙️ Cache Configuration")
                display_cache_configs({CacheType(k): CacheConfig(**v) for k, v in cache_configs.items()})

            # Plugin status details
            if plugins:
                console.print("\n🔌 Cache Plugin Status")
                plugin_table = Table()
                plugin_table.add_column("Plugin", style="cyan")
                plugin_table.add_column("Status", style="green")

                for plugin, status in plugins.items():
                    status_emoji = "✅" if status else "❌"
                    plugin_table.add_row(plugin.replace('_', '-').title(), status_emoji)

                console.print(plugin_table)

            # Server cache details
            if server_cache:
                console.print("\n🖥️ Server Cache Status")
                server_table = Table()
                server_table.add_column("Cache Type", style="cyan")
                server_table.add_column("Status", style="green")

                for cache_type, status in server_cache.items():
                    status_emoji = "✅" if status else "❌"
                    server_table.add_row(cache_type.replace('_', '-').title(), status_emoji)

                console.print(server_table)

            # Recommendations
            recommendations = analysis.get('recommendations', [])
            if recommendations:
                console.print("\n💡 Recommendations")
                for i, rec in enumerate(recommendations[:10], 1):
                    console.print(f"{i}. {rec}")

        # Save report if requested
        if save_report:
            report_path = project_dir / ".ddev" / f"cache_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)

            with open(report_path, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)

            console.print(f"\n💾 Analysis report saved to: {report_path}")

    except Exception as e:
        console.print(f"❌ Cache analysis failed: {e}")
        raise typer.Exit(1)


@app.command()
def optimize(
    project_name: Optional[str] = typer.Argument(None, help="Project name to optimize"),
    preset: str = typer.Option("business", "--preset", help="Optimization preset: blog, business, ecommerce, performance"),
    auto: bool = typer.Option(False, "--auto", help="Apply optimizations without confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Optimize cache configuration for better performance."""
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

        console.print(f"🚀 Optimizing cache for project: {project_name}")
        console.print(f"⚙️ Preset: {preset}")

        if dry_run:
            console.print("[yellow]Dry run: Would optimize cache configuration[/yellow]")
            return

        if not auto:
            if not Confirm.ask("\nThis will modify cache configurations. Continue?"):
                console.print("Cache optimization cancelled.")
                return

        # Run optimization with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Optimizing cache configuration...", total=None)

            cache_manager = CacheManager(project)
            result = asyncio.run(cache_manager.optimize_cache_configuration(preset=preset, auto=auto))

            progress.update(task, description="Optimization completed...")

        # Display results
        console.print("\n✅ Cache Optimization Results")
        console.print(f"Configurations updated: {result.configs_updated}")
        console.print(f"Invalidation rules added: {result.rules_added}")
        console.print(f"Cache warmed: {result.cache_warmed}")
        console.print(f"Optimization time: {result.optimization_time:.2f} seconds")

        if result.recommendations:
            console.print("\n💡 Post-optimization Recommendations:")
            for i, rec in enumerate(result.recommendations[:5], 1):
                console.print(f"{i}. {rec}")

        # Save optimization history
        history_path = project_dir / ".ddev" / f"cache_optimization_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        history_path.parent.mkdir(parents=True, exist_ok=True)

        with open(history_path, 'w') as f:
            json.dump(result.__dict__, f, indent=2, default=str)

        console.print(f"\n💾 Optimization history saved to: {history_path}")

    except Exception as e:
        console.print(f"❌ Cache optimization failed: {e}")
        raise typer.Exit(1)


@app.command()
def clear(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    cache_type: str = typer.Option("all", "--type", help="Cache type to clear: page, object, opcode, browser, all"),
    pattern: str = typer.Option("", "--pattern", help="Clear cache matching pattern"),
    auto: bool = typer.Option(False, "--auto", help="Clear cache without confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Clear specified cache types."""
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

        console.print(f"🧹 Clearing cache for project: {project_name}")
        console.print(f"📦 Cache type: {cache_type}")

        if not auto and not dry_run:
            if not Confirm.ask(f"\nClear {cache_type} cache? This may temporarily slow down your site."):
                console.print("Cache clear cancelled.")
                return

        if dry_run:
            console.print(f"[yellow]Dry run: Would clear {cache_type} cache[/yellow]")
            return

        # Determine cache types to clear
        if cache_type == "all":
            cache_types = None
        else:
            try:
                cache_types = [CacheType(cache_type)]
            except ValueError:
                raise ForgeError(f"Invalid cache type: {cache_type}")

        # Clear cache
        cache_manager = CacheManager(project)
        cleared = asyncio.run(cache_manager.clear_cache(cache_types, pattern if pattern else None))

        if cleared:
            console.print("✅ Cache cleared successfully")
        else:
            console.print("⚠️ No cache was cleared")

    except Exception as e:
        console.print(f"❌ Cache clear failed: {e}")
        raise typer.Exit(1)


@app.command()
def warm(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    urls: Optional[str] = typer.Option(None, "--urls", help="Comma-separated URLs to warm"),
    auto: bool = typer.Option(False, "--auto", help="Use default URLs without confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Warm cache for specified URLs."""
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

        # Parse URLs
        url_list = None
        if urls:
            url_list = [url.strip() for url in urls.split(',') if url.strip()]

        console.print(f"🔥 Warming cache for project: {project_name}")
        if url_list:
            console.print(f"🌐 URLs: {len(url_list)} custom URLs")
        else:
            console.print("🌐 Using default URLs")

        if not auto and not dry_run:
            if not Confirm.ask("\nProceed with cache warming?"):
                console.print("Cache warming cancelled.")
                return

        if dry_run:
            console.print("[yellow]Dry run: Would warm cache[/yellow]")
            return

        # Run cache warming with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Warming cache...", total=None)

            cache_manager = CacheManager(project)
            warmed_count = asyncio.run(cache_manager.warm_cache(url_list))

            progress.update(task, description=f"Warmed {warmed_count} URLs...")

        console.print(f"✅ Cache warming completed. Warmed {warmed_count} URLs")

    except Exception as e:
        console.print(f"❌ Cache warming failed: {e}")
        raise typer.Exit(1)


@app.command()
def status(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Show cache status and health."""
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

        console.print(f"📊 Cache Status for {project_name}")

        cache_manager = CacheManager(project)
        health_data = asyncio.run(cache_manager.get_cache_health())

        # Display health score
        health_score = health_data.get('health_score', 0)
        status = health_data.get('status', 'unknown')

        # Determine color based on score
        if health_score >= 80:
            score_color = "green"
            status_emoji = "🟢"
        elif health_score >= 60:
            score_color = "yellow"
            status_emoji = "🟡"
        else:
            score_color = "red"
            status_emoji = "🔴"

        console.print(f"\n{status_emoji} Cache Health Score: {health_score}/100")
        console.print(f"📈 Status: {status.title()}")

        # Display issues and warnings
        issues = health_data.get('issues', [])
        warnings = health_data.get('warnings', [])

        if issues:
            console.print(f"\n🔴 Issues ({len(issues)}):")
            for issue in issues:
                console.print(f"• {issue}")

        if warnings:
            console.print(f"\n🟡 Warnings ({len(warnings)}):")
            for warning in warnings:
                console.print(f"• {warning}")

        if not issues and not warnings:
            console.print("\n🟢 No cache issues detected!")

        # Display recommendations
        recommendations = health_data.get('recommendations', [])
        if recommendations:
            console.print(f"\n💡 Recommendations:")
            for i, rec in enumerate(recommendations[:5], 1):
                console.print(f"{i}. {rec}")

        # Get current configuration summary
        configs = cache_manager.cache_configs
        if configs:
            console.print(f"\n⚙️ Current Configuration:")
            enabled_count = sum(1 for config in configs.values() if config.enabled)
            total_count = len(configs)
            console.print(f"• Enabled caches: {enabled_count}/{total_count}")

            for cache_type, config in configs.items():
                status = "✅" if config.enabled else "❌"
                console.print(f"• {cache_type.value.title()}: {status}")

    except Exception as e:
        console.print(f"❌ Cache status check failed: {e}")
        raise typer.Exit(1)


@app.command()
def config(
    action: str = typer.Argument(..., help="Action: show, set, list"),
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    cache_type: str = typer.Option("", "--type", help="Cache type: page, object, opcode, browser"),
    strategy: str = typer.Option("", "--strategy", help="Cache strategy: basic, aggressive, custom"),
    ttl: int = typer.Option(0, "--ttl", help="Time to live in seconds"),
    enable: bool = typer.Option(False, "--enable", help="Enable cache type"),
    disable: bool = typer.Option(False, "--disable", help="Disable cache type"),
    compression: bool = typer.Option(False, "--compression/--no-compression", help="Enable compression"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Configure cache settings."""
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

        cache_manager = CacheManager(project)

        if action == "show":
            console.print(f"📋 Cache Configuration for {project_name}")
            display_cache_configs(cache_manager.cache_configs)

        elif action == "list":
            console.print("📋 Available Cache Types:")
            for cache_type in CacheType:
                console.print(f"• {cache_type.value}")

            console.print("\n📋 Available Strategies:")
            for strategy in CacheStrategy:
                console.print(f"• {strategy.value}")

        elif action == "set":
            if not cache_type:
                raise ForgeError("Cache type is required for setting configuration")

            try:
                cache_type_enum = CacheType(cache_type)
            except ValueError:
                raise ForgeError(f"Invalid cache type: {cache_type}")

            # Get current config or create default
            current_config = cache_manager.cache_configs.get(cache_type_enum)
            if not current_config:
                current_config = CacheConfig(
                    cache_type=cache_type_enum,
                    strategy=CacheStrategy.BASIC,
                    enabled=False,
                    ttl=3600
                )

            # Update configuration
            updates = []
            if strategy:
                try:
                    current_config.strategy = CacheStrategy(strategy)
                    updates.append(f"strategy: {strategy}")
                except ValueError:
                    raise ForgeError(f"Invalid strategy: {strategy}")

            if ttl > 0:
                current_config.ttl = ttl
                updates.append(f"ttl: {ttl}s")

            if enable:
                current_config.enabled = True
                updates.append("enabled: True")
            elif disable:
                current_config.enabled = False
                updates.append("enabled: False")

            current_config.compression = compression
            updates.append(f"compression: {compression}")

            if dry_run:
                console.print(f"[yellow]Dry run: Would update {cache_type} cache config[/yellow]")
                console.print(f"Changes: {', '.join(updates)}")
                return

            # Save updated configuration
            cache_manager.cache_configs[cache_type_enum] = current_config
            asyncio.run(cache_manager._save_cache_config())

            console.print(f"✅ Updated {cache_type} cache configuration")
            console.print(f"Changes: {', '.join(updates)}")

        else:
            raise ForgeError(f"Unknown action: {action}")

    except Exception as e:
        console.print(f"❌ Cache configuration failed: {e}")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
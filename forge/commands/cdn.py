"""
CDN management commands for Bedrock Forge.

Provides comprehensive CDN setup, configuration, and optimization
tools for WordPress sites with support for multiple CDN providers.
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
from rich.text import Text

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.cdn_manager import (
    CDNManager, CDNProvider, CDNStatus, CacheLevel,
    CDNConfig, CDNStats, CDNRule
)
from ..models.project import Project
from ..constants import *
from ..utils.local_config import LocalConfigManager
from ..utils.project_helpers import ProjectSelector

app = typer.Typer(help="CDN management and optimization")

# Rich console for beautiful output
console = Console()

# Initialize utilities
config_manager = LocalConfigManager()
project_selector = ProjectSelector(config_manager)


def display_cdn_configs(configs: Dict[str, CDNConfig]) -> None:
    """Display CDN configurations in a beautiful format."""
    if not configs:
        console.print("No CDN configurations found.")
        return

    table = Table(title="CDN Configuration")
    table.add_column("Domain", style="cyan")
    table.add_column("Provider", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Cache Level", style="blue")
    table.add_column("TTL", style="red")
    table.add_column("Compression", style="magenta")

    for domain, config in configs.items():
        status_emoji = "🟢" if config.enabled else "🔴"
        compression_emoji = "✅" if config.compression else "❌"

        table.add_row(
            domain,
            config.provider.value.title(),
            f"{status_emoji} {'Enabled' if config.enabled else 'Disabled'}",
            config.cache_level.value.title(),
            format_duration(config.ttl),
            compression_emoji
        )

    console.print(table)


def display_cdn_stats(stats: Dict[str, CDNStats]) -> None:
    """Display CDN statistics."""
    if not stats:
        console.print("No CDN statistics available.")
        return

    table = Table(title="CDN Statistics")
    table.add_column("Domain", style="cyan")
    table.add_column("Provider", style="green")
    table.add_column("Requests", style="blue")
    bandwidt_h = "Bandwidth"
    table.add_column(f"{bandwidt_h} Saved", style="red")
    table.add_column("Hit Rate", style="yellow")
    table.add_column("Avg Response", style="magenta")

    for domain, stat in stats.items():
        hit_rate_color = "green" if stat.cache_hit_rate > 80 else "yellow" if stat.cache_hit_rate > 60 else "red"
        response_time_color = "green" if stat.avg_response_time < 500 else "yellow" if stat.avg_response_time < 1000 else "red"

        table.add_row(
            domain,
            stat.provider.value.title(),
            f"{stat.requests_served:,}",
            format_bytes(stat.bandwidth_saved),
            f"{stat.cache_hit_rate:.1f}%",
            f"{stat.avg_response_time:.0f}ms",
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
    """Analyze CDN setup and performance."""
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

        console.print(f"🔍 Analyzing CDN for project: {project_name}")

        if dry_run:
            console.print("[yellow]Dry run: Would analyze CDN performance[/yellow]")
            return

        # Run analysis with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing CDN setup...", total=None)

            cdn_manager = CDNManager(project)
            analysis = asyncio.run(cdn_manager.analyze_cdn_setup(detailed=detailed))

            progress.update(task, description="Processing analysis results...")

        # Display results
        if output_format == "json":
            console.print(json.dumps(analysis, indent=2, default=str))
        else:
            # Display summary
            console.print("\n📊 CDN Analysis Summary")

            # CDN configurations
            cdn_configs = analysis.get('cdn_configs', {})
            console.print(f"Configured domains: {len(cdn_configs)}")
            enabled_configs = sum(1 for cfg in cdn_configs.values() if cfg.get('enabled'))
            console.print(f"Enabled domains: {enabled_configs}")

            # Plugin status
            plugins = analysis.get('plugin_status', {})
            active_plugins = sum(plugins.values())
            console.print(f"Active CDN plugins: {active_plugins}")

            # Domain analysis
            domains = analysis.get('domain_analysis', {})
            console.print(f"Analyzed domains: {len(domains)}")
            configured_domains = sum(1 for domain_info in domains.values() if domain_info.get('dns_configured'))
            console.print(f"Configured domains: {configured_domains}")

            # Display detailed information
            if cdn_configs:
                console.print("\n⚙️ CDN Configuration")
                display_cdn_configs(cdn_configs)

            # Plugin status details
            if plugins:
                console.print("\n🔌 CDN Plugin Status")
                plugin_table = Table()
                plugin_table.add_column("Plugin", style="cyan")
                plugin_table.add_column("Status", style="green")

                for plugin, status in plugins.items():
                    status_emoji = "✅" if status else "❌"
                    plugin_table.add_row(plugin.replace('_', '-').title(), status_emoji)

                console.print(plugin_table)

            # Domain analysis details
            if domains:
                console.print("\n🌐 Domain Analysis")
                domain_table = Table()
                domain_table.add_column("Domain", style="cyan")
                domain_table.add_column("DNS", style="green")
                domain_table.add_column("SSL", style="yellow")
                domain_table.add_column("Provider", style="blue")

                for domain, domain_info in domains.items():
                    dns_emoji = "✅" if domain_info.get('dns_configured') else "❌"
                    ssl_info = domain_info.get('ssl_certificate', {})
                    ssl_status = ssl_info.get('valid', False)
                    ssl_emoji = "✅" if ssl_status else "❌"
                    provider = domain_info.get('dns_provider', 'Unknown')

                    domain_table.add_row(
                        domain,
                        dns_emoji,
                        ssl_emoji,
                        provider.title()
                    )

                console.print(domain_table)

            # CDN statistics
            cdn_stats = analysis.get('cdn_stats', {})
            if cdn_stats:
                console.print("\n📈 CDN Statistics")
                display_cdn_stats(cdn_stats)

            # Recommendations
            recommendations = analysis.get('recommendations', [])
            if recommendations:
                console.print("\n💡 Recommendations")
                for i, rec in enumerate(recommendations[:10], 1):
                    console.print(f"{i}. {rec}")

        # Save report if requested
        if save_report:
            report_path = project_dir / ".ddev" / f"cdn_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)

            with open(report_path, 'w') as f:
                json.dump(analysis, f, indent=2, default=str)

            console.print(f"\n💾 Analysis report saved to: {report_path}")

    except Exception as e:
        console.print(f"❌ CDN analysis failed: {e}")
        raise typer.Exit(1)


@app.command()
def setup(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    provider: str = typer.Option("cloudflare", "--provider", help="CDN provider: cloudflare, aws_cloudfront, fastly, keycdn"),
    domain: str = typer.Option("", "--domain", help="Domain to configure"),
    api_key: Optional[str] = typer.Option(None, "--api-key", help="CDN API key"),
    api_secret: Optional[str] = typer.Option(None, "--api-secret", help="CDN API secret"),
    account_id: Optional[str] = typer.Option(None, "--account-id", help="CDN account ID"),
    preset: str = typer.Option("basic", "--preset", help="Setup preset: basic, advanced, performance"),
    auto: bool = typer.Option(False, "--auto", help="Setup without confirmation prompts"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Set up CDN configuration."""
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

        # Get domain if not provided
        if not domain:
            try:
                cmd = f"cd {project_dir} && ddev wp option get siteurl"
                result = run_shell(cmd, dry_run=False)
                if result:
                    from urllib.parse import urlparse
                    parsed = urlparse(result.strip())
                    domain = parsed.netloc
            except Exception:
                domain = Prompt.ask("Enter domain to configure for CDN")

        console.print(f"🚀 Setting up CDN for project: {project_name}")
        console.print(f"🌐 Domain: {domain}")
        console.print(f"📡 Provider: {provider}")
        console.print(f"⚙️ Preset: {preset}")

        # Get API credentials if needed
        if provider == "cloudflare":
            if not api_key:
                api_key = Prompt.ask("Enter Cloudflare API key", password=True)
            if not account_id:
                account_id = Prompt.ask("Enter Cloudflare account ID")

        if not auto and not dry_run:
            console.print("\n📋 CDN Setup Plan:")
            console.print(f"• Configure {provider.title()} CDN")
            console.print(f"• Set up domain: {domain}")
            console.print(f"• Apply {preset} optimizations")

            if not Confirm.ask("\nProceed with CDN setup?"):
                console.print("CDN setup cancelled.")
                return

        if dry_run:
            console.print("[yellow]Dry run: Would set up CDN configuration[/yellow]")
            return

        # Run CDN setup with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Setting up CDN...", total=None)

            cdn_manager = CDNManager(project)
            result = asyncio.run(cdn_manager.setup_cdn(
                provider=provider,
                domain=domain,
                api_key=api_key,
                api_secret=api_secret,
                account_id=account_id,
                preset=preset
            ))

            progress.update(task, description="Setup completed...")

        # Display results
        console.print("\n✅ CDN Setup Results")
        console.print(f"Configurations updated: {result.configs_updated}")
        console.print(f"Cache rules added: {result.rules_added}")
        console.print(f"Domains configured: {result.domains_configured}")
        console.print(f"SSL certificates: {result.ssl_certificates}")
        console.print(f"Setup time: {result.optimization_time:.2f} seconds")

        if result.bandwidth_savings > 0:
            console.print(f"💰 Estimated bandwidth savings: {format_bytes(result.bandwidth_savings)}/month")

        if result.recommendations:
            console.print("\n💡 Post-Setup Recommendations:")
            for i, rec in enumerate(result.recommendations[:5], 1):
                console.print(f"{i}. {rec}")

        # Save setup history
        history_path = project_dir / ".ddev" / f"cdn_setup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        history_path.parent.mkdir(parents=True, exist_ok=True)

        with open(history_path, 'w') as f:
            json.dump(result.__dict__, f, indent=2, default=str)

        console.print(f"\n💾 Setup history saved to: {history_path}")

    except Exception as e:
        console.print(f"❌ CDN setup failed: {e}")
        raise typer.Exit(1)


@app.command()
def clear(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    domain: str = typer.Option("", "--domain", help="Domain to clear cache for"),
    pattern: str = typer.Option("", "--pattern", help="Clear cache matching pattern"),
    auto: bool = typer.Option(False, "--auto", help="Clear cache without confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Clear CDN cache."""
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

        console.print(f"🧹 Clearing CDN cache for project: {project_name}")
        if domain:
            console.print(f"🌐 Domain: {domain}")
        if pattern:
            console.print(f"🔍 Pattern: {pattern}")

        if not auto and not dry_run:
            if not Confirm.ask(f"\nClear CDN cache? This may temporarily slow down your site."):
                console.print("CDN cache clear cancelled.")
                return

        if dry_run:
            console.print("[yellow]Dry run: Would clear CDN cache[/yellow]")
            return

        # Clear cache
        cdn_manager = CDNManager(project)
        cleared = asyncio.run(cdn_manager.clear_cdn_cache(domain if domain else None, pattern if pattern else None))

        if cleared:
            console.print("✅ CDN cache cleared successfully")
        else:
            console.print("⚠️ No cache was cleared (check configuration)")

    except Exception as e:
        console.print(f"❌ CDN cache clear failed: {e}")
        raise typer.Exit(1)


@app.command()
def status(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Show CDN status and health."""
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

        console.print(f"📊 CDN Status for {project_name}")

        cdn_manager = CDNManager(project)
        health_data = asyncio.run(cdn_manager.get_cdn_health())

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

        console.print(f"\n{status_emoji} CDN Health Score: {health_score}/100")
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
            console.print("\n🟢 No CDN issues detected!")

        # Get current configuration summary
        configs = cdn_manager.cdn_configs
        if configs:
            console.print(f"\n⚙️ Current Configuration:")
            enabled_count = sum(1 for config in configs.values() if config.enabled)
            total_count = len(configs)
            console.print(f"• Enabled domains: {enabled_count}/{total_count}")

            for domain, config in configs.items():
                status = "✅" if config.enabled else "❌"
                console.print(f"• {domain} ({config.provider.value}): {status}")

        # Get domain analysis
        try:
            analysis = asyncio.run(cdn_manager.analyze_cdn_setup(detailed=False))
            domains = analysis.get('domain_analysis', {})

            if domains:
                console.print(f"\n🌐 Domain Status:")
                for domain, domain_info in domains.items():
                    dns_status = "✅" if domain_info.get('dns_configured') else "❌"
                    ssl_info = domain_info.get('ssl_certificate', {})
                    ssl_status = "✅" if ssl_info.get('valid') else "❌"
                    provider = domain_info.get('dns_provider', 'Unknown')

                    console.print(f"• {domain}: DNS {dns_status} | SSL {ssl_status} | Provider: {provider}")

        except Exception as e:
            logger.error(f"Failed to get domain status: {e}")

    except Exception as e:
        console.print(f"❌ CDN status check failed: {e}")
        raise typer.Exit(1)


@app.command()
def config(
    action: str = typer.Argument(..., help="Action: show, list, test"),
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Configure CDN settings."""
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

        cdn_manager = CDNManager(project)

        if action == "show":
            console.print(f"📋 CDN Configuration for {project_name}")
            display_cdn_configs(cdn_manager.cdn_configs)

        elif action == "list":
            console.print("📋 Available CDN Providers:")
            for provider in CDNProvider:
                if provider != CDNProvider.NONE:
                    console.print(f"• {provider.value.title()}")

            console.print("\n📋 Available Cache Levels:")
            for level in CacheLevel:
                console.print(f"• {level.value.title()}")

        elif action == "test":
            console.print(f"🧪 Testing CDN configuration for {project_name}")
            # Implementation would test CDN connectivity and performance
            console.print("Testing CDN connectivity...")

            # Test DNS resolution
            configs = cdn_manager.cdn_configs
            for domain, config in configs.items():
                if config.enabled:
                    try:
                        import subprocess
                        result = subprocess.run(f"dig +short {domain}", shell=True, capture_output=True, text=True, timeout=10)
                        if result.returncode == 0:
                            console.print(f"✅ {domain}: DNS resolution successful")
                        else:
                            console.print(f"❌ {domain}: DNS resolution failed")
                    except Exception as e:
                        console.print(f"❌ {domain}: DNS test failed - {e}")

        else:
            raise ForgeError(f"Unknown action: {action}")

    except Exception as e:
        console.print(f"❌ CDN configuration failed: {e}")
        raise typer.Exit(1)


@app.command()
def warm(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    urls: Optional[str] = typer.Option(None, "--urls", help="Comma-separated URLs to warm"),
    auto: bool = typer.Option(False, "--auto", help="Use default URLs without confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Warm CDN cache for specified URLs."""
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

        console.print(f"🔥 Warming CDN cache for project: {project_name}")
        if url_list:
            console.print(f"🌐 URLs: {len(url_list)} custom URLs")
        else:
            console.print("🌐 Using default URLs (homepage, key pages)")

        if not auto and not dry_run:
            if not Confirm.ask("\nProceed with CDN cache warming?"):
                console.print("Cache warming cancelled.")
                return

        if dry_run:
            console.print("[yellow]Dry run: Would warm CDN cache[/yellow]")
            return

        # Run cache warming with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Warming CDN cache...", total=None)

            # Get default URLs if none provided
            if not url_list:
                try:
                    cmd = f"cd {project_dir} && ddev wp option get siteurl"
                    result = run_shell(cmd, dry_run=False)
                    if result:
                        site_url = result.strip()
                        url_list = [
                            site_url,
                            f"{site_url}/about",
                            f"{site_url}/contact",
                            f"{site_url}/blog",
                            f"{site_url}/shop"
                        ]
                except Exception:
                    url_list = []

            warmed_count = 0
            total_urls = len(url_list)

            for i, url in enumerate(url_list):
                progress.update(task, description=f"Warming {i+1}/{total_urls}...")

                # Make HTTP request to warm CDN cache
                cmd = f"curl -s -o /dev/null -w '%{{http_code}}' '{url}'"
                result = run_shell(cmd, dry_run=False)

                if result and "200" in result:
                    warmed_count += 1
                    logger.info(f"Warmed CDN cache for: {url}")

            progress.update(task, description=f"Warmed {warmed_count}/{total_urls} URLs...")

        console.print(f"✅ CDN cache warming completed. Warmed {warmed_count}/{total_urls} URLs")

    except Exception as e:
        console.print(f"❌ CDN cache warming failed: {e}")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
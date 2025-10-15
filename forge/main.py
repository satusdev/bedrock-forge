import typer
from .commands import local, provision, sync, deploy, ci, monitor, info, workflow, config, plugins, api, performance, database, cache, cdn, image, monitoring, analytics, behavior, seo, conversions, reports
from .utils.logging import logger

app = typer.Typer(rich_markup_mode="rich", help="Unified CLI for Bedrock WordPress workflows")

app.add_typer(local.app, name="local", help="Manage local projects with DDEV")
app.add_typer(provision.app, name="provision", help="Provision servers and services")
app.add_typer(sync.app, name="sync", help="Sync, backup, and restore data")
app.add_typer(deploy.app, name="deploy", help="Deploy code to remote")
app.add_typer(ci.app, name="ci", help="CI/CD integrations")
app.add_typer(monitor.app, name="monitor", help="Monitoring and logging setup")
app.add_typer(info.app, name="info", help="Display project/server info")
app.add_typer(workflow.app, name="workflow", help="Run chained workflows")
app.add_typer(config.app, name="config", help="Manage Forge configuration")
app.add_typer(plugins.app, name="plugins", help="Manage Forge plugins")
app.add_typer(api.app, name="api", help="Manage REST API server")
app.add_typer(performance.app, name="performance", help="Performance testing and optimization")
app.add_typer(database.app, name="database", help="Database optimization and management")
app.add_typer(cache.app, name="cache", help="Caching strategies and management")
app.add_typer(cdn.app, name="cdn", help="CDN integration and optimization")
app.add_typer(image.app, name="image", help="Image optimization and management")
app.add_typer(monitoring.app, name="monitoring", help="Real-time performance monitoring and alerting")
app.add_typer(analytics.app, name="analytics", help="Website analytics and traffic analysis")
app.add_typer(behavior.app, name="behavior", help="User behavior tracking and analysis")
app.add_typer(seo.app, name="seo", help="SEO performance monitoring and analysis")
app.add_typer(conversions.app, name="conversions", help="Conversion tracking and analysis")
app.add_typer(reports.app, name="reports", help="Custom report generation and management")

@app.callback()
def main(
    env: str = typer.Option("local", "--env", help="Environment (local/staging/production)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    if verbose:
        logger.setLevel("DEBUG")
    typer.echo(f"Running in {env} mode (dry-run: {dry_run})")

def main():
    """Entry point for the forge CLI command."""
    app()

# Add version command
@app.command()
def version():
    """Show version information."""
    import sys
    print(f"Bedrock Forge CLI v0.1.0")
    print(f"Python: {sys.version}")

# Add update command
@app.command()
def update():
    """Update Bedrock Forge CLI to latest version."""
    import subprocess
    import os
    from pathlib import Path

    install_dir = Path.home() / ".bedrock-forge"
    update_script = install_dir / "scripts" / "update-forge"

    if update_script.exists():
        try:
            subprocess.run([str(update_script)], check=True)
        except subprocess.CalledProcessError as e:
            print(f"❌ Update failed: {e}")
            raise typer.Exit(1)
    else:
        print("❌ Update script not found. Please reinstall using:")
        print("curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash")
        raise typer.Exit(1)

# Add uninstall command
@app.command()
def uninstall():
    """Uninstall Bedrock Forge CLI completely."""
    import subprocess
    from pathlib import Path

    install_dir = Path.home() / ".bedrock-forge"
    uninstall_script = install_dir / "scripts" / "uninstall-forge"

    if uninstall_script.exists():
        try:
            subprocess.run([str(uninstall_script)], check=True)
        except subprocess.CalledProcessError as e:
            print(f"❌ Uninstall failed: {e}")
            raise typer.Exit(1)
    else:
        print("❌ Uninstall script not found. Please remove manually:")
        print("rm -rf ~/.bedrock-forge")
        print("rm -f ~/.local/bin/forge")
        raise typer.Exit(1)

if __name__ == "__main__":
    main()
import typer
from .commands import local, provision, sync, deploy, ci, monitor, info, workflow
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

@app.callback()
def main(
    env: str = typer.Option("local", "--env", help="Environment (local/staging/production)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    if verbose:
        logger.setLevel("DEBUG")
    typer.echo(f"Running in {env} mode (dry-run: {dry_run})")

if __name__ == "__main__":
    app()
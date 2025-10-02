import typer
from typing import List, Optional
from forge.commands.local import create_project
from forge.commands.provision import provision
from forge.commands.deploy import push
from forge.commands.sync import backup
from forge.commands.monitor import add_monitor
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from tqdm import tqdm
import gettext

_ = gettext.gettext

app = typer.Typer()

def full_project_workflow(
    project_name: str,
    remote_host: str,
    ssh_user: str,
    ssh_key: str,
    domain: str,
    monitor_url: str,
    dry_run: bool = False,
    verbose: bool = False,
    skip_steps: Optional[List[str]] = None
) -> None:
    """Run full workflow: create → provision → deploy → backup → monitor."""
    steps = {
        "create": create_project,
        "provision": provision,
        "deploy": push,
        "backup": backup,
        "monitor": add_monitor
    }
    if skip_steps:
        for skip in skip_steps:
            steps.pop(skip, None)
    logger.info(_("Starting full-project workflow..."))
    for step_name, func in tqdm(steps.items(), desc=_("Workflow steps"), disable=not verbose):
        logger.info(_(f"Running step: {step_name}"))
        if step_name == "create":
            func(project_name=project_name, dry_run=dry_run, verbose=verbose)
        elif step_name == "provision":
            func(project_name=project_name, domain=domain, dry_run=dry_run, verbose=verbose)
        elif step_name == "deploy":
            func(local_dir=get_base_dir() / project_name, remote_dir="/var/www/html", host=remote_host, protocol="ssh", user=ssh_user, key=ssh_key, dry_run=dry_run, verbose=verbose)
        elif step_name == "backup":
            func(project_dir=get_base_dir() / project_name, gdrive=True, dry_run=dry_run, verbose=verbose)
        elif step_name == "monitor":
            func(name=project_name, url=monitor_url, dry_run=dry_run, verbose=verbose)
    logger.info(_("Full-project workflow complete."))

@app.command()
def full_project(
    project_name: str = typer.Argument(..., help=_("Project name")),
    remote_host: str = typer.Argument(..., help=_("Remote host")),
    ssh_user: str = typer.Argument(..., help=_("SSH user")),
    ssh_key: str = typer.Argument(..., help=_("SSH private key")),
    domain: str = typer.Argument(..., help=_("Domain")),
    monitor_url: str = typer.Argument(..., help=_("URL to monitor")),
    skip: List[str] = typer.Option([], "--skip", help=_("Skip steps (create, provision, deploy, backup, monitor)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    full_project_workflow(project_name, remote_host, ssh_user, ssh_key, domain, monitor_url, dry_run, verbose, skip)

if __name__ == "__main__":
    app()
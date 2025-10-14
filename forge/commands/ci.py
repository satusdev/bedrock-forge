import typer
import requests
import os
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from retrying import retry  # pip install retrying for retries

app = typer.Typer(help="CI/CD integrations")

@retry(stop_max_attempt_number=3, wait_fixed=2000)  # Retry 3 times with 2s wait
def trigger_jenkins_api(url, params, auth, timeout):
    resp = requests.post(url, params=params, auth=auth, timeout=timeout)
    resp.raise_for_status()
    return resp

def trigger_jenkins(
    job: str,
    branch: str = "main",
    token: str = None,
    user: str = "admin",
    url: str = None,
    params: str = "",
    timeout: int = 30,
    dry_run: bool = False,
    verbose: bool = False
):
    """Trigger a Jenkins job via API. (Exposed for dashboard/API use)"""
    if not token:
        token = os.getenv("JENKINS_TOKEN")
    if not token:
        raise ForgeError("Jenkins API token required")
    param_dict = {"branch": branch}
    if params:
        for pair in params.split(","):
            if "=" in pair:
                k, v = pair.split("=", 1)
                param_dict[k.strip()] = v.strip()
    api_url = f"{url.rstrip('/')}/job/{job}/buildWithParameters"
    if dry_run:
        logger.info(f"Dry run: Would trigger {api_url} with params {param_dict}")
        return
    try:
        if verbose:
            logger.debug(f"Triggering Jenkins: {api_url}")
        resp = trigger_jenkins_api(api_url, param_dict, (user, token), timeout)
        logger.info(f"Triggered Jenkins job {job} on {branch}")
    except Exception as e:
        raise ForgeError(f"Failed to trigger Jenkins: {str(e)}")

@app.command(help="Trigger Jenkins job via API")
def jenkins_trigger(
    job: str = typer.Argument(..., help="Jenkins job name"),
    branch: str = typer.Option("main", "--branch", help="Git branch"),
    token: str = typer.Option(None, "--token", help="Jenkins API token"),
    user: str = typer.Option("admin", "--user", help="Jenkins API user"),
    url: str = typer.Option(..., "--url", help="Jenkins base URL"),
    params: str = typer.Option("", "--params", help="Extra job parameters (key1=val1,key2=val2)"),
    timeout: int = typer.Option(30, "--timeout", help="Request timeout in seconds"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    trigger_jenkins(job, branch, token, user, url, params, timeout, dry_run, verbose)
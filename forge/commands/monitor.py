import typer
import requests
import os
from pathlib import Path
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from retrying import retry
import paramiko
from getpass import getpass
from tqdm import tqdm
import gettext

_ = gettext.gettext

app = typer.Typer()

@retry(stop_max_attempt_number=3, wait_fixed=2000)
def _make_request(method: str, url: str, **kwargs):
    func = getattr(requests, method.lower())
    resp = func(url, **kwargs)
    resp.raise_for_status()
    return resp

def get_headers(token: str = None, url: str = None) -> tuple:
    kuma_url = url or os.getenv("KUMA_URL", "http://localhost:3001/api")
    kuma_token = token or os.getenv("KUMA_TOKEN")
    if not kuma_token and typer.get_tty():
        kuma_token = getpass(_("Uptime Kuma Token: "))
    if not kuma_token:
        raise ForgeError(_("KUMA_TOKEN required"))
    return {"Authorization": f"Bearer {kuma_token}", "Content-Type": "application/json"}, kuma_url

def add_monitor(
    name: str,
    url: str,
    type: str = "http",
    keyword: str = None,
    port: int = None,
    kuma_token: str = None,
    kuma_url: str = None,
    timeout: int = 30,
    dry_run: bool = False,
    verbose: bool = False
) -> None:
    if dry_run:
        logger.info(_(f"Dry run: Would add monitor {name}"))
        return
    headers, base_url = get_headers(kuma_token, kuma_url)
    data = {"name": name, "type": type, "url": url}
    if keyword:
        data["keyword"] = keyword
    if port:
        data["port"] = port
    try:
        if verbose:
            logger.debug(_(f"Adding monitor to {base_url}"))
        _make_request("post", f"{base_url}/monitors", json=data, headers=headers, timeout=timeout)
        logger.info(_(f"Added monitor {name}"))
    except Exception as e:
        raise ForgeError(_(f"Failed to add monitor: {str(e)}"))

@app.command()
def add(
    name: str = typer.Argument(..., help=_("Monitor name")),
    url: str = typer.Argument(..., help=_("URL to monitor")),
    type: str = typer.Option("http", "--type", help=_("Monitor type (http, keyword, port)")),
    keyword: str = typer.Option(None, "--keyword", help=_("Keyword for keyword monitor")),
    port: int = typer.Option(None, "--port", help=_("Port for port monitor")),
    token: str = typer.Option(None, "--token", help=_("Uptime Kuma token")),
    kuma_url: str = typer.Option(None, "--kuma-url", help=_("Uptime Kuma API URL")),
    timeout: int = typer.Option(30, "--timeout"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    add_monitor(name, url, type, keyword, port, token, kuma_url, timeout, dry_run, verbose)

@app.command()
def remove(
    monitor_id: int = typer.Argument(..., help=_("Monitor ID")),
    token: str = typer.Option(None, "--token", help=_("Uptime Kuma token")),
    kuma_url: str = typer.Option(None, "--kuma-url", help=_("Uptime Kuma API URL")),
    timeout: int = typer.Option(30, "--timeout"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    if dry_run:
        logger.info(_(f"Dry run: Would remove monitor {monitor_id}"))
        return
    headers, base_url = get_headers(token, kuma_url)
    try:
        if verbose:
            logger.debug(_(f"Removing monitor from {base_url}"))
        _make_request("delete", f"{base_url}/monitors/{monitor_id}", headers=headers, timeout=timeout)
        logger.info(_(f"Removed monitor {monitor_id}"))
    except Exception as e:
        raise ForgeError(_(f"Failed to remove monitor: {str(e)}"))

@app.command()
def list_monitors(
    token: str = typer.Option(None, "--token", help=_("Uptime Kuma token")),
    kuma_url: str = typer.Option(None, "--kuma-url", help=_("Uptime Kuma API URL")),
    timeout: int = typer.Option(30, "--timeout"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """List all monitors in Uptime Kuma."""
    headers, base_url = get_headers(token, kuma_url)
    try:
        resp = _make_request("get", f"{base_url}/monitors", headers=headers, timeout=timeout)
        monitors = resp.json()
        for m in tqdm(monitors, desc=_("Listing monitors"), disable=not verbose):
            typer.secho(_(f"{m['id']}: {m['name']} ({m['type']}) {m['url']}"), fg=typer.colors.BLUE)
    except Exception as e:
        raise ForgeError(_(f"List monitors failed: {str(e)}"))

@app.command()
def logrotate(
    host: str = typer.Argument(..., help=_("Remote host")),
    user: str = typer.Argument(..., help=_("SSH user")),
    key: str = typer.Argument(..., help=_("SSH private key")),
    log_path: str = typer.Argument("/var/log/nginx/*.log", help=_("Log file path/pattern")),
    service: str = typer.Option("nginx", "--service", help=_("Service to reload (nginx/apache)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Setup log rotation on remote server via SSH for specified service."""
    logrotate_conf = f"""{log_path} {{
    daily
    rotate 14
    compress
    missingok
    notifempty
    create 0640 root adm
    sharedscripts
    postrotate
        systemctl reload {service} > /dev/null 2>&1 || true
    endscript
}}
"""
    logger.info(_(f"Setting up logrotate for {log_path} on {host} for {service}"))
    key_path = Path(key).expanduser()
    with paramiko.SSHClient() as client:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(host, username=user, key_filename=str(key_path))
        if not dry_run:
            sftp = client.open_sftp()
            conf_path = f"/etc/logrotate.d/forge_{service}"
            with sftp.file(conf_path, "w") as f:
                f.write(logrotate_conf)
            sftp.close()
            if verbose:
                logger.info(_(f"Logrotate config written to {conf_path}"))

if __name__ == "__main__":
    app()
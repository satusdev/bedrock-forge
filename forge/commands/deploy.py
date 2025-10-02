import typer
import paramiko
import os
from datetime import datetime
from pathlib import Path
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from getpass import getpass  # For secure password input
import subprocess

app = typer.Typer()

from forge.provision.ftp import upload_via_ftp

def ssh_push(
    local_dir: Path,
    remote_dir: str,
    host: str,
    user: str,
    key: str,
    port: int = 22,
    env: str = "production",
    dry_run: bool = False,
    verbose: bool = False,
    exclude: list = None
):
    """Push site to remote using rsync over SSH."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"{remote_dir}_backup_{timestamp}"
    with paramiko.SSHClient() as client:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(host, username=user, key_filename=str(key), port=port)
        if not dry_run:
            _, stdout, _ = client.exec_command(f"cp -r {remote_dir} {backup_dir}")
            stdout.channel.recv_exit_status()
    rsync_cmd = f"rsync -avz -e 'ssh -i {str(key)} -p {port}' {str(local_dir)}/ {user}@{host}:{remote_dir}"
    if exclude:
        rsync_cmd += " --exclude=" + " --exclude=".join(exclude)
    if verbose:
        logger.debug(f"Executing rsync: {rsync_cmd}")
    if not dry_run:
        subprocess.run(rsync_cmd, shell=True, check=True)
    logger.info(f"Pushed {local_dir} to {host}:{remote_dir} ({env})")

def ftp_push(
    local_dir: Path,
    remote_dir: str,
    host: str,
    user: str,
    password: str = None,
    dry_run: bool = False,
    verbose: bool = False
):
    if not password:
        password = getpass("FTP Password: ")
    logger.info(f"Pushing {local_dir} to {host}:{remote_dir} (FTP)")
    upload_via_ftp(host, user, password, str(local_dir), remote_dir, dry_run, verbose)

# Similar improvements for ssh_rollback, ftp_rollback: Use Path, logging, sort by time

@app.command()
def push(
    local_dir: str = typer.Argument(..., help="Local directory to deploy"),
    remote_dir: str = typer.Argument(..., help="Remote directory to deploy to"),
    host: str = typer.Argument(..., help="Remote host"),
    protocol: str = typer.Option("ssh", "--protocol", help="Deployment protocol: ssh or ftp"),
    user: str = typer.Option(None, "--user", help="SSH/FTP user"),
    key: str = typer.Option(None, "--key", help="SSH private key (for SSH)"),
    password: str = typer.Option(None, "--password", help="FTP password (for FTP; prompted if not provided)"),
    port: int = typer.Option(22, "--port", help="SSH port (for SSH)"),
    env: str = typer.Option("production", "--env", help="Environment (production/staging)"),
    exclude: list = typer.Option([], "--exclude", help="Files/patterns to exclude (multiple)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    local_path = Path(local_dir).expanduser().resolve()
    if protocol == "ssh":
        if not user or not key:
            raise ForgeError("SSH user and key required")
        ssh_push(local_path, remote_dir, host, user, key, port, env, dry_run, verbose, exclude)
    elif protocol == "ftp":
        if not user:
            raise ForgeError("FTP user required")
        ftp_push(local_path, remote_dir, host, user, password, dry_run, verbose)
    else:
        raise ForgeError("Unsupported protocol")
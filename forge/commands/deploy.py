import typer
import json
import paramiko
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from getpass import getpass  # For secure password input
import subprocess

app = typer.Typer()

from forge.provision.ftp import upload_via_ftp
from forge.provision.core import (
    ServerConfig, DeploymentMethod, ServerType, WebServer,
    create_deployment_strategy, create_enhanced_deployment,
    validate_deployment_config, get_deployment_methods
)
from forge.provision.enhanced_deployment import (
    EnhancedDeployment, DeploymentConfig, VersionManager,
    create_deployment_config
)

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
    exclude = None
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
    exclude: str = typer.Option("", "--exclude", help="Files/patterns to exclude (comma separated)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    local_path = Path(local_dir).expanduser().resolve()
    # Convert exclude string to list
    exclude_list = [item.strip() for item in exclude.split(",") if item.strip()] if exclude else []
    if protocol == "ssh":
        if not user or not key:
            raise ForgeError("SSH user and key required")
        ssh_push(local_path, remote_dir, host, user, key, port, env, dry_run, verbose, exclude_list)
    elif protocol == "ftp":
        if not user:
            raise ForgeError("FTP user required")
        ftp_push(local_path, remote_dir, host, user, password, dry_run, verbose)
    else:
        raise ForgeError("Unsupported protocol")


@app.command()
def deploy(
    project_dir: str = typer.Argument(".", help="Local project directory to deploy"),
    remote_path: str = typer.Argument("/var/www/html", help="Remote deployment path"),
    host: str = typer.Option(..., "--host", help="Remote server host/IP"),
    user: str = typer.Option(..., "--user", help="SSH/FTP username"),
    key: str = typer.Option("~/.ssh/id_rsa", "--key", help="SSH private key path"),
    password: str = typer.Option(None, "--password", help="FTP password (for FTP deployments)"),
    protocol: str = typer.Option("rsync", "--protocol", help=f"Deployment protocol: {', '.join(get_deployment_methods())}"),
    port: int = typer.Option(22, "--port", help="SSH/FTP port"),
    domain: str = typer.Option("", "--domain", help="Domain name for the deployment"),
    bandwidth_limit: int = typer.Option(None, "--bandwidth-limit", help="Bandwidth limit in KB/s"),
    checksum: bool = typer.Option(False, "--checksum", help="Use checksum verification"),
    backup: bool = typer.Option(True, "--backup/--no-backup", help="Create backup before deployment"),
    atomic: bool = typer.Option(True, "--atomic/--no-atomic", help="Use atomic deployment"),
    max_versions: int = typer.Option(10, "--max-versions", help="Maximum versions to keep"),
    health_check: str = typer.Option("", "--health-check", help="Health check URL after deployment"),
    rollback_on_failure: bool = typer.Option(True, "--rollback-on-failure/--no-rollback-on-failure", help="Auto rollback on failure"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Perform a dry run"),
    verbose: bool = typer.Option(False, "--verbose", help="Verbose output")
):
    """Deploy project with enhanced version management and rollback support."""
    try:
        # Validate protocol
        if protocol not in get_deployment_methods():
            raise ForgeError(f"Unsupported protocol: {protocol}. Available: {', '.join(get_deployment_methods())}")

        # Create server configuration
        server_config = ServerConfig(
            name=f"deploy_{domain or host}",
            ip_address=host,
            domain=domain or host,
            ssh_user=user if protocol in ['ssh', 'sftp', 'rsync'] else None,
            ssh_key=key,
            ssh_port=port,
            ftp_user=user if protocol == 'ftp' else None,
            ftp_password=password,
            ftp_port=port,
            deployment_method=DeploymentMethod(protocol),
            provider=ServerType.GENERIC_SSH
        )

        # Validate configuration
        issues = validate_deployment_config(server_config)
        if issues:
            for issue in issues:
                typer.secho(f"❌ {issue}", fg=typer.colors.RED)
            raise typer.Exit(1)

        # Create deployment configuration
        deployment_config = create_deployment_config(
            local_path=project_dir,
            remote_path=remote_path,
            backup_before_deploy=backup,
            atomic_deployment=atomic,
            bandwidth_limit=bandwidth_limit,
            checksum_verification=checksum,
            max_versions_to_keep=max_versions,
            health_check_url=health_check if health_check else None,
            rollback_on_failure=rollback_on_failure
        )

        # Create enhanced deployment
        deployment = create_enhanced_deployment(
            server_config,
            deployment_config,
            dry_run=dry_run,
            verbose=verbose
        )

        # Perform deployment
        result = deployment.deploy()

        if result.success:
            typer.secho("✅ Deployment completed successfully!", fg=typer.colors.GREEN)
            typer.echo(f"📦 Version: {result.details.get('version', 'N/A')}")
            typer.echo(f"⏱️ Duration: {result.details.get('duration_seconds', 0):.2f}s")
            typer.echo(f"📁 Files changed: {result.details.get('files_changed', 0)}")
            typer.echo(f"📊 Bytes transferred: {result.details.get('bytes_transferred', 0):,}")
            if result.details.get('backup_path'):
                typer.echo(f"💾 Backup: {result.details.get('backup_path')}")
        else:
            typer.secho("❌ Deployment failed!", fg=typer.colors.RED)
            typer.echo(f"Error: {result.error}")
            if result.details.get('backup_path'):
                typer.echo(f"💾 Backup available: {result.details.get('backup_path')}")
            raise typer.Exit(1)

    except Exception as e:
        typer.secho(f"❌ Deployment failed: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)


@app.command()
def rollback(
    target_version: str = typer.Option(None, "--version", help="Target version to rollback to"),
    project_dir: str = typer.Option(".", "--project-dir", help="Project directory"),
    host: str = typer.Option(..., "--host", help="Remote server host/IP"),
    user: str = typer.Option(..., "--user", help="SSH username"),
    key: str = typer.Option("~/.ssh/id_rsa", "--key", help="SSH private key path"),
    remote_path: str = typer.Option("/var/www/html", "--remote-path", help="Remote deployment path"),
    protocol: str = typer.Option("rsync", "--protocol", help=f"Deployment protocol: {', '.join(get_deployment_methods())}"),
    port: int = typer.Option(22, "--port", help="SSH port"),
    verbose: bool = typer.Option(False, "--verbose", help="Verbose output")
):
    """Rollback deployment to a previous version."""
    try:
        # Create server configuration
        server_config = ServerConfig(
            name=f"rollback_{host}",
            ip_address=host,
            domain=host,
            ssh_user=user,
            ssh_key=key,
            ssh_port=port,
            deployment_method=DeploymentMethod(protocol),
            provider=ServerType.GENERIC_SSH
        )

        # Create deployment configuration
        deployment_config = create_deployment_config(
            local_path=project_dir,
            remote_path=remote_path
        )

        # Create enhanced deployment
        deployment = create_enhanced_deployment(
            server_config,
            deployment_config,
            verbose=verbose
        )

        # Perform rollback
        result = deployment.rollback(target_version)

        if result.success:
            typer.secho("✅ Rollback completed successfully!", fg=typer.colors.GREEN)
            typer.echo(f"📦 Target version: {result.details.get('target_version', 'N/A')}")
        else:
            typer.secho("❌ Rollback failed!", fg=typer.colors.RED)
            typer.echo(f"Error: {result.error}")
            raise typer.Exit(1)

    except Exception as e:
        typer.secho(f"❌ Rollback failed: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)


@app.command()
def history(
    project_dir: str = typer.Option(".", "--project-dir", help="Project directory"),
    limit: int = typer.Option(10, "--limit", help="Number of versions to show"),
    detailed: bool = typer.Option(False, "--detailed", help="Show detailed information")
):
    """Show deployment history."""
    try:
        version_manager = VersionManager(Path(project_dir))
        history = version_manager.load_history()

        if not history:
            typer.echo("No deployment history found.")
            return

        # Show recent deployments
        recent_history = history[-limit:] if limit > 0 else history

        typer.secho("📋 Deployment History", fg=typer.colors.BLUE)
        typer.echo("=" * 60)

        for version in recent_history:
            status_emoji = {
                "success": "✅",
                "failed": "❌",
                "rolled_back": "🔄",
                "in_progress": "⏳",
                "pending": "⏸️"
            }.get(version.status.value, "❓")

            typer.echo(f"{status_emoji} {version.version} - {version.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
            typer.echo(f"   Status: {version.status.value}")

            if version.commit_hash:
                typer.echo(f"   Commit: {version.commit_hash}")
            if version.author:
                typer.echo(f"   Author: {version.author}")
            if version.message:
                typer.echo(f"   Message: {version.message}")

            if detailed:
                typer.echo(f"   Files changed: {version.files_changed}")
                typer.echo(f"   Bytes transferred: {version.bytes_transferred:,}")
                typer.echo(f"   Duration: {version.duration_seconds:.2f}s")
                if version.backup_path:
                    typer.echo(f"   Backup: {version.backup_path}")

            typer.echo()

    except Exception as e:
        typer.secho(f"❌ Failed to load deployment history: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)
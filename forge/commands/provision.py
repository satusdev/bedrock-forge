import typer
import os
import json
import shutil
from pathlib import Path
from ..provision.hetzner import create_server, manage_server
from ..provision.cyberpanel import install_cyberpanel, deploy_wordpress
from ..provision.cloudflare import validate_domain, configure_cloudflare_domain
from ..provision.ftp import upload_via_ftp
from ..utils.config import load_config
from ..utils.errors import ForgeError
from ..utils.logging import logger
from getpass import getpass
from tqdm import tqdm
import gettext
from ..provision.cyberpanel import run_ssh_command 

_ = gettext.gettext

app = typer.Typer(name="provision", help=_("Provision servers and services"))

def check_requirements() -> None:
    """Check if required tools (DDEV, Docker, Git) are installed."""
    for cmd in ["ddev", "docker", "git"]:
        if not shutil.which(cmd):
            raise ForgeError(_(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV."))

def validate_ssh_key(ssh_key: Path) -> None:
    """Validate SSH key existence."""
    if not ssh_key.exists():
        raise ForgeError(_(f"SSH key not found at {ssh_key}"))

def check_server_health(server_ip: str, ssh_user: str, ssh_key: Path, dry_run: bool, verbose: bool) -> str:
    """Check server health via SSH (uptime)."""
    if dry_run:
        logger.info(_(f"Dry run: Would check health of {server_ip}"))
        return "dry-run-healthy"
    
    with paramiko.SSHClient() as client:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(server_ip, username=ssh_user, key_filename=str(ssh_key), timeout=10)
            uptime = run_ssh_command(client, "uptime", dry_run, verbose)
            if verbose:
                logger.info(_(f"Server {server_ip} health: {uptime}"))
            return uptime
        except Exception as e:
            raise ForgeError(_(f"Server {server_ip} health check failed: {str(e)}"))

def provision_server(
    project_name: str,
    domain: str,
    server_type: str = "cx11",
    region: str = "fsn1",
    ssh_user: str = "root",
    ssh_key: Path = Path("~/.ssh/id_rsa").expanduser(),
    hetzner_token: str = None,
    cloudflare_token: str = None,
    dry_run: bool = False,
    verbose: bool = False
) -> None:
    """Provision server, install CyberPanel, deploy WordPress, configure Cloudflare, hardening, and SSL. Exposed for API."""
    check_requirements()
    config = load_config(project_name, "production")
    hetzner_token = hetzner_token or os.getenv("HETZNER_TOKEN", getattr(config, "hetzner_token", None))
    if not hetzner_token and typer.get_tty():
        hetzner_token = getpass(_("Hetzner Token: "))
    if not hetzner_token:
        raise ForgeError(_("HETZNER_TOKEN not found in .env.local or config"))
    cloudflare_token = cloudflare_token or os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))
    if not cloudflare_token and typer.get_tty():
        cloudflare_token = getpass(_("Cloudflare Token: "))
    if not cloudflare_token:
        raise ForgeError(_("CLOUDFLARE_TOKEN not found in .env.local or config"))
    validate_ssh_key(ssh_key)
    validate_domain(domain, cloudflare_token, dry_run, verbose)
    server_ip = create_server(project_name, server_type, region, str(ssh_key), hetzner_token, dry_run, verbose)
    if dry_run:
        logger.info(_(f"Dry run: Would configure domain {domain}, install CyberPanel, deploy WordPress, harden, and setup SSL"))
        return
    install_cyberpanel(server_ip, ssh_user, str(ssh_key), dry_run, verbose)
    deploy_wordpress(project_name, server_ip, ssh_user, str(ssh_key), domain, dry_run, verbose)
    configure_cloudflare_domain(domain, server_ip, cloudflare_token, dry_run, verbose)
    # Hardening and SSL with progress
    hardening_cmds = [
        "apt update && apt upgrade -y",
        "apt install -y ufw fail2ban certbot python3-certbot-nginx",
        "ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable -y",
        "systemctl enable fail2ban",
        f"certbot --non-interactive --agree-tos --email admin@{domain} --nginx -d {domain}"
    ]
    with paramiko.SSHClient() as client:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server_ip, username=ssh_user, key_filename=str(ssh_key))
        for cmd in tqdm(hardening_cmds, desc=_("Server hardening and SSL setup"), disable=not verbose):
            run_ssh_command(client, cmd, dry_run, verbose)
    uptime = check_server_health(server_ip, ssh_user, ssh_key, dry_run, verbose)
    config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge"))
    config_path.mkdir(exist_ok=True)
    with open(config_path / "server.json", "w") as f:
        json.dump({
            "server_ip": server_ip,
            "ssh_user": ssh_user,
            "ssh_key": str(ssh_key),
            "domain": domain,
            "provider": "hetzner"
        }, f, indent=2)
    logger.info(_(f"Server created for {project_name} at {server_ip}"))
    logger.info(_(f"Domain configured: http://{domain}"))
    logger.info(_(f"Access CyberPanel at http://{server_ip}:8090"))
    logger.info(_(f"WordPress site: http://{domain}/wp/wp-admin"))
    logger.info(_(f"SSH: ssh {ssh_user}@{server_ip} -i {ssh_key}"))
    logger.info(_(f"Server health: {uptime}"))

@app.command()
def create(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    domain: str = typer.Option(..., "--domain", help=_("Domain for the site (e.g., example.com)")),
    server_type: str = typer.Option("cx11", "--server-type", help=_("Hetzner server type (e.g., cx11, cx21)")),
    region: str = typer.Option("fsn1", "--region", help=_("Hetzner region (e.g., fsn1, nbg1, hel1)")),
    ssh_user: str = typer.Option("root", "--ssh-user", help=_("SSH user for the server")),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help=_("Path to SSH private key")),
    hetzner_token: str = typer.Option(None, "--hetzner-token", help=_("Hetzner token (prompted if not provided)")),
    cloudflare_token: str = typer.Option(None, "--cloudflare-token", help=_("Cloudflare token (prompted if not provided)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Create a new server, install CyberPanel, deploy WordPress, and configure Cloudflare."""
    ssh_key_path = Path(ssh_key).expanduser()
    provision_server(
        project_name=project_name,
        domain=domain,
        server_type=server_type,
        region=region,
        ssh_user=ssh_user,
        ssh_key=ssh_key_path,
        hetzner_token=hetzner_token,
        cloudflare_token=cloudflare_token,
        dry_run=dry_run,
        verbose=verbose
    )

@app.command()
def setup(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    server_ip: str = typer.Option(..., "--server-ip", help=_("IP address of existing server")),
    domain: str = typer.Option(..., "--domain", help=_("Domain for the site (e.g., example.com)")),
    ssh_user: str = typer.Option("root", "--ssh-user", help=_("SSH user for the server")),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help=_("Path to SSH private key")),
    use_ftp: bool = typer.Option(False, "--use-ftp", help=_("Use FTP instead of SSH for deployment")),
    ftp_user: str = typer.Option("", "--ftp-user", help=_("FTP username (required if --use-ftp)")),
    ftp_password: str = typer.Option(None, "--ftp-password", help=_("FTP password (prompted if not provided)")),
    cloudflare_token: str = typer.Option(None, "--cloudflare-token", help=_("Cloudflare token (prompted if not provided)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Set up CyberPanel, deploy WordPress, and configure Cloudflare on an existing server."""
    check_requirements()
    
    config = load_config(project_name, "production")
    cloudflare_token = cloudflare_token or os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))
    if not cloudflare_token and typer.get_tty():
        cloudflare_token = getpass(_("Cloudflare Token: "))
    if not cloudflare_token:
        raise ForgeError(_("CLOUDFLARE_TOKEN not found in .env.local or config"))
    if use_ftp and (not ftp_user or (not ftp_password and typer.get_tty())):
        ftp_password = getpass(_("FTP Password: "))
    if use_ftp and (not ftp_user or not ftp_password):
        raise ForgeError(_("FTP user and password required when --use-ftp is specified"))
    
    ssh_key_path = Path(ssh_key).expanduser()
    validate_ssh_key(ssh_key_path)
    validate_domain(domain, cloudflare_token, dry_run, verbose)
    
    install_cyberpanel(server_ip, ssh_user, str(ssh_key_path), dry_run, verbose)
    if use_ftp:
        upload_via_ftp(server_ip, ftp_user, ftp_password, 
                       os.path.expanduser(f"~/Work/Wordpress/{project_name}"), 
                       f"/home/{domain}/public_html", dry_run, verbose)
    else:
        deploy_wordpress(project_name, server_ip, ssh_user, str(ssh_key_path), domain, dry_run, verbose)
    
    configure_cloudflare_domain(domain, server_ip, cloudflare_token, dry_run, verbose)
    uptime = check_server_health(server_ip, ssh_user, ssh_key_path, dry_run, verbose)
    
    if not dry_run:
        config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge"))
        config_path.mkdir(exist_ok=True)
        with open(config_path / "server.json", "w") as f:
            json.dump({
                "server_ip": server_ip,
                "ssh_user": ssh_user,
                "ssh_key": ssh_key,
                "domain": domain,
                "provider": "existing"
            }, f, indent=2)
        
        typer.echo(_(f"Server setup completed for {project_name} at {server_ip}"))
        typer.echo(_(f"Domain configured: http://{domain}"))
        typer.echo(_(f"Access CyberPanel at http://{server_ip}:8090"))
        typer.echo(_(f"WordPress site: http://{domain}/wp/wp-admin"))
        typer.echo(_(f"Server health: {uptime}"))
        if use_ftp:
            typer.echo(_(f"FTP: ftp://{ftp_user}@{server_ip}"))
        else:
            typer.echo(_(f"SSH: ssh {ssh_user}@{server_ip} -i {ssh_key}"))

@app.command()
def manage(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    action: str = typer.Argument(..., help=_("Action: start, stop, status")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage server (start, stop, status) for a project."""
    check_requirements()
    
    config = load_config(project_name, "production")
    server_config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json"))
    if not server_config_path.exists():
        raise ForgeError(_(f"Server configuration not found at {server_config_path}"))
    
    with open(server_config_path) as f:
        server_config = json.load(f)
    
    server_ip = server_config.get("server_ip")
    provider = server_config.get("provider")
    ssh_user = server_config.get("ssh_user", "root")
    ssh_key = Path(server_config.get("ssh_key", "~/.ssh/id_rsa")).expanduser()
    
    if provider == "hetzner":
        hetzner_token = os.getenv("HETZNER_TOKEN", getattr(config, "hetzner_token", None))
        if not hetzner_token and typer.get_tty():
            hetzner_token = getpass(_("Hetzner Token: "))
        if not hetzner_token:
            raise ForgeError(_("HETZNER_TOKEN not found in .env.local or config"))
        status = manage_server(project_name, action, hetzner_token, dry_run, verbose)
        if not dry_run:
            typer.echo(_(f"Server {action} completed for {project_name}: {status}"))
    else:
        if action == "status":
            uptime = check_server_health(server_ip, ssh_user, ssh_key, dry_run, verbose)
            if not dry_run:
                typer.echo(_(f"Server {server_ip} status: running (Uptime: {uptime})"))
        else:
            raise ForgeError(_(f"Action {action} not supported for existing servers"))

provision = provision_server
__all__ = ["provision"]

if __name__ == "__main__":
    app()

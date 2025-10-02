import typer
import os
import json
import shutil
from ..provision.hetzner import create_server, manage_server
from ..provision.cyberpanel import install_cyberpanel, deploy_wordpress
from ..provision.cloudflare import validate_domain, configure_cloudflare_domain
from ..provision.ftp import upload_via_ftp
from ..utils.config import load_config
from ..utils.errors import ForgeError
from ..utils.logging import logger

app = typer.Typer(name="provision", help="Provision servers and services")

def check_requirements() -> None:
    """Check if required tools (DDEV, Docker, Git) are installed."""
    for cmd in ["ddev", "docker", "git"]:
        if not shutil.which(cmd):
            raise ForgeError(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV.")

def validate_ssh_key(ssh_key: str) -> None:
    """Validate SSH key existence."""
    ssh_key_path = os.path.expanduser(ssh_key)
    if not os.path.exists(ssh_key_path):
        raise ForgeError(f"SSH key not found at {ssh_key_path}")

def check_server_health(server_ip: str, ssh_user: str, ssh_key: str, dry_run: bool, verbose: bool) -> str:
    """Check server health via SSH (uptime)."""
    from provision.cyberpanel import run_ssh_command
    import paramiko
    
    if dry_run:
        logger.info(f"Dry run: Would check health of {server_ip}")
        return "dry-run-healthy"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(server_ip, username=ssh_user, key_filename=os.path.expanduser(ssh_key), timeout=10)
        uptime = run_ssh_command(client, "uptime", dry_run, verbose)
        if verbose:
            logger.info(f"Server {server_ip} health: {uptime}")
        return uptime
    except Exception as e:
        raise ForgeError(f"Server {server_ip} health check failed: {str(e)}")
    finally:
        client.close()

@app.command()
def create(
    project_name: str = typer.Argument(..., help="Name of the project"),
    domain: str = typer.Option(..., "--domain", help="Domain for the site (e.g., example.com)"),
    server_type: str = typer.Option("cx11", "--server-type", help="Hetzner server type (e.g., cx11, cx21)"),
    region: str = typer.Option("fsn1", "--region", help="Hetzner region (e.g., fsn1, nbg1, hel1)"),
    ssh_user: str = typer.Option("root", "--ssh-user", help="SSH user for the server"),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help="Path to SSH private key"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Create a new server, install CyberPanel, deploy WordPress, and configure Cloudflare."""
    check_requirements()
    
    config = load_config(project_name, "production")
    hetzner_token = os.getenv("HETZNER_TOKEN", getattr(config, "hetzner_token", None))
    cloudflare_token = os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))
    
    if not hetzner_token:
        raise ForgeError("HETZNER_TOKEN not found in .env.local or config")
    if not cloudflare_token:
        raise ForgeError("CLOUDFLARE_TOKEN not found in .env.local or config")
    
    validate_ssh_key(ssh_key)
    validate_domain(domain, cloudflare_token, dry_run, verbose)
    
    server_ip = create_server(project_name, server_type, region, ssh_key, hetzner_token, dry_run, verbose)
    if dry_run:
        logger.info(f"Dry run: Would configure domain {domain}, install CyberPanel, and deploy WordPress")
        return
    
    install_cyberpanel(server_ip, ssh_user, ssh_key, dry_run, verbose)
    deploy_wordpress(project_name, server_ip, ssh_user, ssh_key, domain, dry_run, verbose)
    configure_cloudflare_domain(domain, server_ip, cloudflare_token, dry_run, verbose)
    uptime = check_server_health(server_ip, ssh_user, ssh_key, dry_run, verbose)
    
    config_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge")
    os.makedirs(config_path, exist_ok=True)
    with open(os.path.join(config_path, "server.json"), "w") as f:
        json.dump({
            "server_ip": server_ip,
            "ssh_user": ssh_user,
            "ssh_key": ssh_key,
            "domain": domain,
            "provider": "hetzner"
        }, f, indent=2)
    
    typer.echo(f"Server created for {project_name} at {server_ip}")
    typer.echo(f"Domain configured: http://{domain}")
    typer.echo(f"Access CyberPanel at http://{server_ip}:8090")
    typer.echo(f"WordPress site: http://{domain}/wp/wp-admin")
    typer.echo(f"SSH: ssh {ssh_user}@{server_ip} -i {ssh_key}")
    typer.echo(f"Server health: {uptime}")

@app.command()
def setup(
    project_name: str = typer.Argument(..., help="Name of the project"),
    server_ip: str = typer.Option(..., "--server-ip", help="IP address of existing server"),
    domain: str = typer.Option(..., "--domain", help="Domain for the site (e.g., example.com)"),
    ssh_user: str = typer.Option("root", "--ssh-user", help="SSH user for the server"),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help="Path to SSH private key"),
    use_ftp: bool = typer.Option(False, "--use-ftp", help="Use FTP instead of SSH for deployment"),
    ftp_user: str = typer.Option("", "--ftp-user", help="FTP username (required if --use-ftp)"),
    ftp_password: str = typer.Option("", "--ftp-password", help="FTP password (required if --use-ftp)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Set up CyberPanel, deploy WordPress, and configure Cloudflare on an existing server."""
    check_requirements()
    
    config = load_config(project_name, "production")
    cloudflare_token = os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))
    
    if not cloudflare_token:
        raise ForgeError("CLOUDFLARE_TOKEN not found in .env.local or config")
    if use_ftp and (not ftp_user or not ftp_password):
        raise ForgeError("FTP user and password required when --use-ftp is specified")
    
    validate_ssh_key(ssh_key)
    validate_domain(domain, cloudflare_token, dry_run, verbose)
    
    install_cyberpanel(server_ip, ssh_user, ssh_key, dry_run, verbose)
    if use_ftp:
        upload_via_ftp(server_ip, ftp_user, ftp_password, 
                       os.path.expanduser(f"~/Work/Wordpress/{project_name}"), 
                       f"/home/{domain}/public_html", dry_run, verbose)
    else:
        deploy_wordpress(project_name, server_ip, ssh_user, ssh_key, domain, dry_run, verbose)
    
    configure_cloudflare_domain(domain, server_ip, cloudflare_token, dry_run, verbose)
    uptime = check_server_health(server_ip, ssh_user, ssh_key, dry_run, verbose)
    
    if not dry_run:
        config_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge")
        os.makedirs(config_path, exist_ok=True)
        with open(os.path.join(config_path, "server.json"), "w") as f:
            json.dump({
                "server_ip": server_ip,
                "ssh_user": ssh_user,
                "ssh_key": ssh_key,
                "domain": domain,
                "provider": "existing"
            }, f, indent=2)
        
        typer.echo(f"Server setup completed for {project_name} at {server_ip}")
        typer.echo(f"Domain configured: http://{domain}")
        typer.echo(f"Access CyberPanel at http://{server_ip}:8090")
        typer.echo(f"WordPress site: http://{domain}/wp/wp-admin")
        typer.echo(f"Server health: {uptime}")
        if use_ftp:
            typer.echo(f"FTP: ftp://{ftp_user}@{server_ip}")
        else:
            typer.echo(f"SSH: ssh {ssh_user}@{server_ip} -i {ssh_key}")

@app.command()
def manage(
    project_name: str = typer.Argument(..., help="Name of the project"),
    action: str = typer.Argument(..., help="Action: start, stop, status"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage server (start, stop, status) for a project."""
    check_requirements()
    
    config = load_config(project_name, "production")
    server_config_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json")
    if not os.path.exists(server_config_path):
        raise ForgeError(f"Server configuration not found at {server_config_path}")
    
    with open(server_config_path) as f:
        server_config = json.load(f)
    
    server_ip = server_config.get("server_ip")
    provider = server_config.get("provider")
    ssh_user = server_config.get("ssh_user", "root")
    ssh_key = server_config.get("ssh_key", "~/.ssh/id_rsa")
    
    if provider == "hetzner":
        hetzner_token = os.getenv("HETZNER_TOKEN", getattr(config, "hetzner_token", None))
        if not hetzner_token:
            raise ForgeError("HETZNER_TOKEN not found in .env.local or config")
        status = manage_server(project_name, action, hetzner_token, dry_run, verbose)
        if not dry_run:
            typer.echo(f"Server {action} completed for {project_name}: {status}")
    else:
        if action == "status":
            uptime = check_server_health(server_ip, ssh_user, ssh_key, dry_run, verbose)
            if not dry_run:
                typer.echo(f"Server {server_ip} status: running (Uptime: {uptime})")
        else:
            raise ForgeError(f"Action {action} not supported for existing servers")
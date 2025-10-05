import typer
import os
import json
import shutil
from pathlib import Path
import paramiko
from ..provision.core import (
    ServerProvider, ServerConfig, DeploymentResult, ServerType,
    DeploymentMethod, WebServer, create_provider, create_deployment_strategy,
    validate_ssh_connection, run_ssh_command
)
from ..provision.hetzner import create_server, manage_server
from ..provision.cyberpanel import install_cyberpanel, deploy_wordpress
from ..provision.cloudflare import validate_domain, configure_cloudflare_domain
from ..provision.ftp import upload_via_ftp, upload_via_sftp, test_ftp_connection, test_sftp_connection
from ..provision.ssl_certificates import provision_ssl_via_certbot, setup_ssl_auto_renewal, provision_hardening, verify_ssl_domain, check_ssl_certificate
from ..provision.libyanspider import setup_cpanel_wordpress, deploy_to_cpanel
from ..provision.rsync import sync_files, test_rsync_connection
from ..utils.config import load_config
from ..utils.errors import ForgeError
from ..utils.logging import logger
from getpass import getpass
from tqdm import tqdm
import gettext

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

def create_server_config(project_name: str, domain: str, provider_type: ServerType,
                        ssh_user: str = "root", ssh_key: str = "~/.ssh/id_rsa",
                        deployment_method: DeploymentMethod = DeploymentMethod.SSH,
                        **kwargs) -> ServerConfig:
    """Create a ServerConfig object from parameters."""
    return ServerConfig(
        name=project_name,
        ip_address=kwargs.get('ip_address', ''),
        domain=domain,
        ssh_user=ssh_user,
        ssh_key=ssh_key,
        ssh_port=kwargs.get('ssh_port', 22),
        provider=provider_type,
        deployment_method=deployment_method,
        web_server=kwargs.get('web_server', WebServer.NGINX),
        ftp_user=kwargs.get('ftp_user'),
        ftp_password=kwargs.get('ftp_password'),
        ftp_port=kwargs.get('ftp_port', 21),
        cloudflare_token=kwargs.get('cloudflare_token'),
        additional_config=kwargs.get('additional_config', {})
    )

def save_server_config(config: ServerConfig, project_name: str) -> None:
    """Save server configuration to project directory."""
    config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge"))
    config_path.mkdir(parents=True, exist_ok=True)

    config_file = config_path / "server.json"
    with open(config_file, 'w') as f:
        json.dump(config.to_dict(), f, indent=2)

    logger.info(f"Server configuration saved to {config_file}")

def load_server_config(project_name: str) -> ServerConfig:
    """Load server configuration from project directory."""
    config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json"))
    if not config_path.exists():
        raise ForgeError(f"Server configuration not found at {config_path}")

    with open(config_path) as f:
        data = json.load(f)

    return ServerConfig.from_dict(data)

def run_provider_workflow(project_name: str, provider: ServerProvider,
                         setup_ssl: bool = True, setup_hardening: bool = True) -> DeploymentResult:
    """Run complete provider workflow."""
    results = []

    # 1. Create server (if needed)
    if not provider.config.ip_address:
        result = provider.create_server()
        results.append(result)
        if not result.success:
            return result

    # 2. Setup environment
    result = provider.setup_environment()
    results.append(result)
    if not result.success:
        return result

    # 3. Deploy application
    result = provider.deploy_application()
    results.append(result)
    if not result.success:
        return result

    # 4. Configure SSL (if requested)
    if setup_ssl:
        result = provider.configure_ssl()
        results.append(result)
        # SSL is optional for basic setup, so don't fail if it doesn't work

    # 5. Apply security hardening (if requested)
    if setup_hardening:
        result = provider.apply_security_hardening()
        results.append(result)
        # Hardening is optional, so don't fail if it doesn't work

    # Return overall success
    all_success = all(result.success for result in results)
    messages = [result.message for result in results if result.message]

    return DeploymentResult(
        success=all_success,
        message="; ".join(messages),
        details={"workflow_results": [result.__dict__ for result in results]}
    )

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
    # Apply server hardening and SSL setup with progress
    if verbose:
        logger.info(_("Applying server hardening and SSL setup..."))

    with paramiko.SSHClient() as client:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server_ip, username=ssh_user, key_filename=str(ssh_key))

        # Verify domain points to server before SSL
        verify_ssl_domain(client, domain, dry_run, verbose)

        # Apply server hardening
        provision_hardening(client, "basic", dry_run, verbose)

        # Provision SSL certificate
        provision_ssl_via_certbot(client, domain, f"admin@{domain}", dry_run, verbose)

        # Set up SSL auto-renewal
        setup_ssl_auto_renewal(client, domain, dry_run, verbose)
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

@app.command()
def setup_cpanel(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    server_ip: str = typer.Option(..., "--server-ip", help=_("IP address of existing CPanel server")),
    domain: str = typer.Option(..., "--domain", help=_("Domain for the site")),
    cpanel_user: str = typer.Option(..., "--cpanel-user", help=_("CPanel username")),
    ssh_user: str = typer.Option("root", "--ssh-user", help=_("SSH user for the server")),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help=_("Path to SSH private key")),
    cpanel_password: str = typer.Option(None, "--cpanel-password", help=_("CPanel password (prompted if not provided)")),
    cloudflare_token: str = typer.Option(None, "--cloudflare-token", help=_("Cloudflare token (prompted if not provided)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Set up WordPress on LibyanSpider CPanel server."""
    check_requirements()

    config = load_config(project_name, "production")
    cloudflare_token = cloudflare_token or os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))
    if not cloudflare_token and typer.get_tty():
        cloudflare_token = getpass(_("Cloudflare Token: "))
    if not cloudflare_token:
        raise ForgeError(_("CLOUDFLARE_TOKEN not found in .env.local or config"))

    if not cpanel_password and typer.get_tty():
        cpanel_password = getpass(_("CPanel Password: "))
    if not cpanel_password:
        raise ForgeError(_("CPanel password required"))

    ssh_key_path = Path(ssh_key).expanduser()
    validate_ssh_key(ssh_key_path)
    validate_domain(domain, cloudflare_token, dry_run, verbose)

    # Deploy to CPanel
    deployment_result = deploy_to_cpanel(
        project_name, server_ip, ssh_user, str(ssh_key_path), domain,
        cpanel_user, cpanel_password, dry_run, verbose
    )

    if not dry_run:
        configure_cloudflare_domain(domain, server_ip, cloudflare_token, dry_run, verbose)

        # Store server configuration
        config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge"))
        config_path.mkdir(exist_ok=True)
        with open(config_path / "server.json", "w") as f:
            json.dump({
                "server_ip": server_ip,
                "ssh_user": ssh_user,
                "ssh_key": ssh_key,
                "domain": domain,
                "provider": "libyanspider_cpanel",
                "cpanel_user": cpanel_user,
                "document_root": deployment_result.get("document_root")
            }, f, indent=2)

        typer.echo(_(f"CPanel setup completed for {project_name}"))
        typer.echo(_(f"Domain: https://{domain}"))
        typer.echo(_(f"WordPress Admin: {deployment_result.get('wp_admin_url')}"))
        typer.echo(_(f"CPanel: https://{server_ip}:2083"))

@app.command()
def ssl(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    action: str = typer.Option("setup", "--action", help=_("Action: setup, renew, check, revoke")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage SSL certificates for a project."""
    check_requirements()

    server_config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json"))
    if not server_config_path.exists():
        raise ForgeError(_(f"Server configuration not found at {server_config_path}"))

    with open(server_config_path) as f:
        server_config = json.load(f)

    server_ip = server_config.get("server_ip")
    domain = server_config.get("domain")
    ssh_user = server_config.get("ssh_user", "root")
    ssh_key = Path(server_config.get("ssh_key", "~/.ssh/id_rsa")).expanduser()

    validate_ssh_key(ssh_key)

    client = None
    try:
        from ..provision.cyberpanel import create_ssh_client
        client = create_ssh_client(server_ip, ssh_user, str(ssh_key), verbose=verbose)

        if action == "setup":
            provision_ssl_via_certbot(client, domain, f"admin@{domain}", dry_run, verbose)
            setup_ssl_auto_renewal(client, domain, dry_run, verbose)
            if not dry_run:
                typer.echo(_(f"SSL certificate setup completed for {domain}"))

        elif action == "renew":
            # Manual renewal command
            run_ssh_command(client, f"certbot renew --cert-name {domain}", dry_run, verbose)
            if not dry_run:
                typer.echo(_(f"SSL certificate renewal completed for {domain}"))

        elif action == "check":
            ssl_info = check_ssl_certificate(client, domain, dry_run, verbose)
            typer.echo(_(f"SSL certificate status for {domain}:"))
            typer.echo(_(f"  Status: {ssl_info.get('status', 'unknown')}"))
            if ssl_info.get('days_remaining') is not None:
                typer.echo(_(f"  Days remaining: {ssl_info['days_remaining']}"))

        elif action == "revoke":
            from ..provision.ssl_certificates import revoke_ssl_certificate
            revoke_ssl_certificate(client, domain, dry_run, verbose)
            if not dry_run:
                typer.echo(_(f"SSL certificate revoked for {domain}"))

        else:
            raise ForgeError(_(f"Unknown SSL action: {action}"))

    finally:
        if client:
            client.close()

@app.command()
def harden(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    level: str = typer.Option("basic", "--level", help=_("Security level: basic, medium, strict")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Apply server hardening to a project."""
    check_requirements()

    server_config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json"))
    if not server_config_path.exists():
        raise ForgeError(_(f"Server configuration not found at {server_config_path}"))

    with open(server_config_path) as f:
        server_config = json.load(f)

    server_ip = server_config.get("server_ip")
    ssh_user = server_config.get("ssh_user", "root")
    ssh_key = Path(server_config.get("ssh_key", "~/.ssh/id_rsa")).expanduser()

    validate_ssh_key(ssh_key)

    client = None
    try:
        from ..provision.cyberpanel import create_ssh_client
        client = create_ssh_client(server_ip, ssh_user, str(ssh_key), verbose=verbose)

        provision_hardening(client, level, dry_run, verbose)

        if not dry_run:
            typer.echo(_(f"Server hardening (level: {level}) completed for {project_name}"))

    finally:
        if client:
            client.close()

@app.command()
def provision_modular(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    provider: str = typer.Option(..., "--provider", help=_("Provider type: hetzner, libyanspider_cpanel, cyberpanel, generic_ssh")),
    domain: str = typer.Option(..., "--domain", help=_("Domain for the site (e.g., example.com)")),
    deployment_method: str = typer.Option("ssh", "--deployment-method", help=_("Deployment method: ssh, ftp, sftp, rsync")),
    server_ip: str = typer.Option("", "--server-ip", help=_("Existing server IP (optional for new servers)")),
    ssh_user: str = typer.Option("root", "--ssh-user", help=_("SSH user for the server")),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help=_("Path to SSH private key")),
    hetzner_token: str = typer.Option(None, "--hetzner-token", help=_("Hetzner token (required for Hetzner)")),
    server_type: str = typer.Option("cpx11", "--server-type", help=_("Hetzner server type")),
    region: str = typer.Option("nbg1", "--region", help=_("Hetzner region")),
    cpanel_user: str = typer.Option("", "--cpanel-user", help=_("CPanel username (for LibyanSpider)")),
    cpanel_password: str = typer.Option(None, "--cpanel-password", help=_("CPanel password (for LibyanSpider)")),
    ftp_user: str = typer.Option("", "--ftp-user", help=_("FTP username (for FTP/SFTP methods)")),
    ftp_password: str = typer.Option(None, "--ftp-password", help=_("FTP password (for FTP/SFTP methods)")),
    cloudflare_token: str = typer.Option(None, "--cloudflare-token", help=_("Cloudflare token")),
    setup_ssl: bool = typer.Option(True, "--setup-ssl/--no-ssl", help=_("Setup SSL certificates")),
    setup_hardening: bool = typer.Option(True, "--setup-hardening/--no-hardening", help=_("Apply security hardening")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Provision server using the new modular provider architecture."""
    check_requirements()

    # Validate provider type
    try:
        provider_type = ServerType(provider)
    except ValueError:
        valid_providers = [p.value for p in ServerType]
        raise ForgeError(f"Invalid provider: {provider}. Choose from: {valid_providers}")

    # Validate deployment method
    try:
        deployment_method_enum = DeploymentMethod(deployment_method)
    except ValueError:
        valid_methods = [m.value for m in DeploymentMethod]
        raise ForgeError(f"Invalid deployment method: {deployment_method}. Choose from: {valid_methods}")

    # Get configuration and tokens
    config = load_config(project_name, "production")
    hetzner_token = hetzner_token or os.getenv("HETZNER_TOKEN", getattr(config, "hetzner_token", None))
    cloudflare_token = cloudflare_token or os.getenv("CLOUDFLARE_TOKEN", getattr(config, "cloudflare_token", None))

    # Provider-specific token validation
    if provider_type == ServerType.HETZNER:
        if not hetzner_token and typer.get_tty():
            hetzner_token = getpass(_("Hetzner Token: "))
        if not hetzner_token:
            raise ForgeError(_("HETZNER_TOKEN required for Hetzner provider"))
    elif provider_type == ServerType.LIBYANSPIDER_CPANEL:
        if not cpanel_user:
            cpanel_user = typer.prompt(_("CPanel Username"))
        if not cpanel_password and typer.get_tty():
            cpanel_password = getpass(_("CPanel Password: "))
        if not cpanel_user or not cpanel_password:
            raise ForgeError(_("CPanel credentials required for LibyanSpider provider"))

    # Get FTP credentials if needed
    if deployment_method_enum in [DeploymentMethod.FTP, DeploymentMethod.SFTP]:
        if not ftp_user:
            ftp_user = typer.prompt(_("FTP Username"))
        if not ftp_password and typer.get_tty():
            ftp_password = getpass(_("FTP Password: "))
        if not ftp_user or not ftp_password:
            raise ForgeError(_("FTP credentials required for FTP/SFTP deployment methods"))

    # Validate domain if Cloudflare will be used
    if cloudflare_token:
        validate_domain(domain, cloudflare_token, dry_run, verbose)

    # Validate SSH key
    ssh_key_path = Path(ssh_key).expanduser()
    validate_ssh_key(ssh_key_path)

    # Create server configuration
    additional_config = {}
    if provider_type == ServerType.HETZNER:
        additional_config.update({
            'hetzner_token': hetzner_token,
            'server_type': server_type,
            'region': region
        })
    elif provider_type == ServerType.LIBYANSPIDER_CPANEL:
        additional_config.update({
            'cpanel_user': cpanel_user,
            'cpanel_password': cpanel_password
        })

    server_config = create_server_config(
        project_name=project_name,
        domain=domain,
        provider_type=provider_type,
        ssh_user=ssh_user,
        ssh_key=ssh_key,
        deployment_method=deployment_method_enum,
        ip_address=server_ip,
        cloudflare_token=cloudflare_token,
        ftp_user=ftp_user,
        ftp_password=ftp_password,
        additional_config=additional_config
    )

    # Create provider and run workflow
    try:
        provider_instance = create_provider(server_config, dry_run, verbose)

        if verbose:
            logger.info(f"Using provider: {provider_type.value}")
            logger.info(f"Deployment method: {deployment_method_enum.value}")

        # Run the complete provider workflow
        result = run_provider_workflow(
            project_name=project_name,
            provider=provider_instance,
            setup_ssl=setup_ssl,
            setup_hardening=setup_hardening
        )

        if result.success:
            # Save configuration
            save_server_config(server_config, project_name)

            # Configure Cloudflare if token provided
            if cloudflare_token and server_config.ip_address:
                configure_cloudflare_domain(domain, server_config.ip_address, cloudflare_token, dry_run, verbose)

            # Display results
            typer.echo(_("✓ Server provisioning completed successfully"))
            typer.echo(f"  Project: {project_name}")
            typer.echo(f"  Provider: {provider_type.value}")
            typer.echo(f"  Domain: {domain}")
            typer.echo(f"  Server IP: {server_config.ip_address}")
            typer.echo(f"  SSH: {ssh_user}@{server_config.ip_address}")

            if provider_type == ServerType.HETZNER:
                typer.echo(f"  Server type: {server_type}")
                typer.echo(f"  Region: {region}")

            if verbose:
                typer.echo(f"  Details: {result.message}")

        else:
            raise ForgeError(f"Provisioning failed: {result.error or result.message}")

    except Exception as e:
        raise ForgeError(f"Provider workflow failed: {str(e)}")


@app.command()
def transfer(
    project_name: str = typer.Argument(..., help=_("Name of the project")),
    method: str = typer.Option("ssh", "--method", help=_("Transfer method: ssh, ftp, sftp, rsync")),
    direction: str = typer.Option("upload", "--direction", help=_("Direction: upload, download")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Transfer files to/from server using various methods."""
    check_requirements()

    server_config_path = Path(os.path.expanduser(f"~/Work/Wordpress/{project_name}/.forge/server.json"))
    if not server_config_path.exists():
        raise ForgeError(_(f"Server configuration not found at {server_config_path}"))

    with open(server_config_path) as f:
        server_config = json.load(f)

    server_ip = server_config.get("server_ip")
    domain = server_config.get("domain")
    ssh_user = server_config.get("ssh_user", "root")
    ssh_key = Path(server_config.get("ssh_key", "~/.ssh/id_rsa")).expanduser()

    local_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}")

    # Determine remote path based on provider
    provider = server_config.get("provider")
    if provider == "libyanspider_cpanel":
        remote_path = server_config.get("document_root", f"/home/{server_config.get('cpanel_user')}/public_html/{domain}")
    else:
        remote_path = f"/home/{domain}/public_html"

    validate_ssh_key(ssh_key)

    if method == "ssh":
        # Use SCP via shell command
        from ..utils.shell import run_shell
        if direction == "upload":
            cmd = f"scp -r -i {ssh_key} {local_path}/* {ssh_user}@{server_ip}:{remote_path}"
        else:
            cmd = f"scp -r -i {ssh_key} {ssh_user}@{server_ip}:{remote_path}/* {local_path}/"

        run_shell(cmd, dry_run)
        if not dry_run:
            typer.echo(_(f"SSH transfer completed ({direction})"))

    elif method == "ftp":
        ftp_user = typer.prompt(_("FTP Username"))
        ftp_password = typer.prompt(_("FTP Password"), hide_input=True)

        result = upload_via_ftp(server_ip, ftp_user, ftp_password, local_path, remote_path, dry_run, verbose)
        if not dry_run:
            typer.echo(_(f"FTP transfer completed: {result['files_uploaded']} files"))

    elif method == "sftp":
        result = upload_via_sftp(server_ip, ssh_user, str(ssh_key), local_path, remote_path, dry_run, verbose)
        if not dry_run:
            typer.echo(_(f"SFTP transfer completed: {result['files_uploaded']} files"))

    elif method == "rsync":
        result = sync_files(local_path, server_ip, ssh_user, str(ssh_key), remote_path, dry_run, verbose, direction=direction)
        if not dry_run:
            if result['success']:
                typer.echo(_(f"rsync transfer completed ({direction})"))
                if result.get('stats'):
                    stats = result['stats']
                    typer.echo(_(f"Files transferred: {stats.get('files_transferred', 0)}"))
            else:
                typer.echo(_(f"rsync transfer failed: {result.get('error', 'Unknown error')}"))

    else:
        raise ForgeError(_(f"Unknown transfer method: {method}"))

@app.command()
def test_connection(
    server_ip: str = typer.Option(..., "--server-ip", help=_("Server IP address")),
    ssh_user: str = typer.Option("root", "--ssh-user", help=_("SSH username")),
    ssh_key: str = typer.Option("~/.ssh/id_rsa", "--ssh-key", help=_("SSH private key path")),
    ssh_port: int = typer.Option(22, "--ssh-port", help=_("SSH port")),
    method: str = typer.Option("ssh", "--method", help=_("Connection method to test: ssh, ftp, sftp, rsync")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Test connection to server using various methods."""
    check_requirements()

    ssh_key_path = Path(ssh_key).expanduser()
    validate_ssh_key(ssh_key_path)

    success = False
    message = ""

    if method == "ssh":
        from ..provision.cyberpanel import test_ssh_connection
        success = test_ssh_connection(server_ip, ssh_user, str(ssh_key_path), ssh_port, verbose)
        message = f"SSH connection to {server_ip}:{ssh_port}"

    elif method == "ftp":
        ftp_user = typer.prompt(_("FTP Username"))
        ftp_password = typer.prompt(_("FTP Password"), hide_input=True)
        success = test_ftp_connection(server_ip, ftp_user, ftp_password, verbose=verbose)
        message = f"FTP connection to {server_ip}"

    elif method == "sftp":
        success = test_sftp_connection(server_ip, ssh_user, str(ssh_key_path), ssh_port, verbose)
        message = f"SFTP connection to {server_ip}:{ssh_port}"

    elif method == "rsync":
        success = test_rsync_connection(server_ip, ssh_user, str(ssh_key_path), ssh_port, verbose)
        message = f"rsync connection to {server_ip}:{ssh_port}"

    else:
        raise ForgeError(_(f"Unknown connection method: {method}"))

    if success:
        typer.echo(_(f"✓ {message} successful"))
    else:
        typer.echo(_(f"✗ {message} failed"))
        raise typer.Exit(1)

provision = provision_server
__all__ = ["provision"]

if __name__ == "__main__":
    app()

import paramiko
from ..utils.errors import ForgeError
from ..utils.logging import logger
from ..utils.shell import run_shell
import os

def run_ssh_command(client: paramiko.SSHClient, command: str, dry_run: bool = False, verbose: bool = False) -> str:
    """Execute a command via SSH and return output."""
    if dry_run:
        logger.info(f"Dry run: Would execute SSH command: {command}")
        return ""
    try:
        stdin, stdout, stderr = client.exec_command(command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()
        if error:
            raise ForgeError(f"SSH command failed: {command}\nError: {error}")
        if verbose:
            logger.info(f"SSH command executed: {command}\nOutput: {output}")
        return output
    except Exception as e:
        raise ForgeError(f"SSH command failed: {command}\nError: {str(e)}")

def provision_ssl_via_certbot(client: paramiko.SSHClient, domain: str, dry_run: bool = False, verbose: bool = False) -> None:
    """Provision SSL using Certbot via SSH."""
    if verbose:
        logger.info(f"Provisioning SSL for {domain} via Certbot")
    # Install Certbot and request certificate
    commands = [
        "sudo apt update && sudo apt install -y certbot",
        f"sudo certbot certonly --standalone -d {domain} --non-interactive --agree-tos -m admin@{domain} --register-unsafely-without-email"
    ]
    for cmd in commands:
        run_ssh_command(client, cmd, dry_run, verbose)
    if verbose:
        logger.info(f"SSL certificate provisioned for {domain}")

def provision_hardening(client: paramiko.SSHClient, dry_run: bool = False, verbose: bool = False) -> None:
    """Provision server hardening: firewall (ufw) and fail2ban via SSH."""
    if verbose:
        logger.info("Provisioning server hardening (firewall, fail2ban)")
    commands = [
        "sudo apt update && sudo apt install -y ufw fail2ban",
        "sudo ufw allow OpenSSH",
        "sudo ufw allow 'Nginx Full' || sudo ufw allow 80/tcp && sudo ufw allow 443/tcp",
        "sudo ufw --force enable",
        "sudo systemctl enable fail2ban && sudo systemctl start fail2ban"
    ]
    for cmd in commands:
        run_ssh_command(client, cmd, dry_run, verbose)
    if verbose:
        logger.info("Server hardening applied (firewall, fail2ban)")

def install_cyberpanel(server_ip: str, ssh_user: str, ssh_key: str, dry_run: bool, verbose: bool, ssh_port: int = 22) -> None:
    """Install CyberPanel on the server via SSH (supports custom host/user/port)."""
    if verbose:
        logger.info(f"Installing CyberPanel on {server_ip}:{ssh_port} as {ssh_user}")
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        if dry_run:
            logger.info(f"Dry run: Would connect to {server_ip}:{ssh_port} as {ssh_user} and install CyberPanel")
            return
        client.connect(server_ip, username=ssh_user, key_filename=os.path.expanduser(ssh_key), port=ssh_port, timeout=10)
        
        commands = [
            "apt update && apt install -y wget",
            "wget -O - https://cyberpanel.net/install.sh | sudo bash",
            "echo -e '\n\n1\nY\nY\nN\nY\n' | sudo sh install.sh"
        ]
        for cmd in commands:
            run_ssh_command(client, cmd, dry_run, verbose)
    finally:
        client.close()

def deploy_wordpress(project_name: str, server_ip: str, ssh_user: str, ssh_key: str, domain: str, dry_run: bool, verbose: bool) -> None:
    """Deploy Bedrock WordPress site to CyberPanel via SSH."""
    local_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    remote_path = f"/home/{domain}/public_html"
    
    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")
    
    if dry_run:
        logger.info(f"Dry run: Would deploy {local_path} to {remote_path} on {server_ip}")
        return
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(server_ip, username=ssh_user, key_filename=os.path.expanduser(ssh_key), timeout=10)
        
        commands = [
            f"cyberpanel createWebsite --package Default --owner admin --domainName {domain} --email admin@{domain} --php 8.1",
            f"chown -R {domain}:{domain} {remote_path}",
        ]
        for cmd in commands:
            run_ssh_command(client, cmd, dry_run, verbose)
        
        run_shell(f"scp -r -i {os.path.expanduser(ssh_key)} {local_path}/* {ssh_user}@{server_ip}:{remote_path}", dry_run)
        if verbose:
            logger.info(f"Deployed {local_path} to {remote_path} via SCP")
    except Exception as e:
        raise ForgeError(f"SSH deployment failed: {str(e)}")
    finally:
        client.close()

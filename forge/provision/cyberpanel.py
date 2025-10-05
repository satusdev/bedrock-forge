import paramiko
import time
import socket
from ..utils.errors import ForgeError
from ..utils.logging import logger
from ..utils.shell import run_shell
from .ssl_certificates import run_ssh_command
import os

def create_ssh_client(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, timeout: int = 30, verbose: bool = False) -> paramiko.SSHClient:
    """Create and configure an SSH client with connection testing."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if verbose:
            logger.info(f"Connecting to {server_ip}:{ssh_port} as {ssh_user}")

        # Expand SSH key path
        ssh_key_path = os.path.expanduser(ssh_key)

        # Test basic connectivity first
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        result = sock.connect_ex((server_ip, ssh_port))
        sock.close()

        if result != 0:
            raise ForgeError(f"Cannot connect to {server_ip}:{ssh_port} - port is closed or firewall is blocking")

        # Attempt SSH connection with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                client.connect(
                    server_ip,
                    username=ssh_user,
                    key_filename=ssh_key_path,
                    port=ssh_port,
                    timeout=timeout,
                    look_for_keys=False,
                    allow_agent=False
                )

                if verbose:
                    logger.info(f"Successfully connected to {server_ip}:{ssh_port}")

                # Test connection with a simple command
                test_output = run_ssh_command(client, "echo 'Connection test successful'", False, verbose)
                if "Connection test successful" in test_output:
                    return client
                else:
                    raise ForgeError("SSH connection test failed")

            except paramiko.AuthenticationException:
                raise ForgeError(f"Authentication failed for {ssh_user}@{server_ip}:{ssh_port}. Check SSH key and user.")
            except paramiko.SSHException as e:
                if attempt == max_retries - 1:
                    raise ForgeError(f"SSH connection failed after {max_retries} attempts: {str(e)}")
                if verbose:
                    logger.info(f"SSH connection attempt {attempt + 1} failed, retrying in 5 seconds...")
                time.sleep(5)

    except Exception as e:
        if isinstance(e, ForgeError):
            raise
        raise ForgeError(f"Failed to create SSH connection to {server_ip}:{ssh_port}: {str(e)}")

    return client

def test_ssh_connection(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, verbose: bool = False) -> bool:
    """Test SSH connection to server."""
    try:
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)
        client.close()
        if verbose:
            logger.info(f"SSH connection test successful to {server_ip}:{ssh_port}")
        return True
    except Exception as e:
        if verbose:
            logger.error(f"SSH connection test failed: {str(e)}")
        return False

def get_server_info(client: paramiko.SSHClient, verbose: bool = False) -> dict:
    """Get server information via SSH."""
    try:
        info = {}

        # System info
        info['hostname'] = run_ssh_command(client, "hostname", False, verbose)
        info['uptime'] = run_ssh_command(client, "uptime -p", False, verbose)
        info['os'] = run_ssh_command(client, "lsb_release -d | cut -f2", False, verbose)
        info['kernel'] = run_ssh_command(client, "uname -r", False, verbose)

        # Hardware info
        info['cpu_cores'] = run_ssh_command(client, "nproc", False, verbose)
        info['memory'] = run_ssh_command(client, "free -h | grep '^Mem:' | awk '{print $2}'", False, verbose)
        info['disk'] = run_ssh_command(client, "df -h / | tail -1 | awk '{print $2}'", False, verbose)

        # Network info
        info['public_ip'] = run_ssh_command(client, "curl -s ifconfig.me || curl -s ipinfo.io/ip", False, verbose)

        return info

    except Exception as e:
        raise ForgeError(f"Failed to get server info: {str(e)}")

def wait_for_server(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, max_wait: int = 300, verbose: bool = False) -> bool:
    """Wait for server to become accessible via SSH."""
    if verbose:
        logger.info(f"Waiting for server {server_ip}:{ssh_port} to become accessible...")

    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            if test_ssh_connection(server_ip, ssh_user, ssh_key, ssh_port, verbose):
                if verbose:
                    logger.info(f"Server {server_ip}:{ssh_port} is now accessible")
                return True
        except:
            pass

        if verbose:
            logger.info(f"Server not ready yet, waiting 10 seconds... (elapsed: {int(time.time() - start_time)}s)")
        time.sleep(10)

    raise ForgeError(f"Server {server_ip}:{ssh_port} did not become accessible within {max_wait} seconds")

def install_cyberpanel(server_ip: str, ssh_user: str, ssh_key: str, dry_run: bool, verbose: bool, ssh_port: int = 22) -> None:
    """Install CyberPanel on the server via SSH (supports custom host/user/port)."""
    if verbose:
        logger.info(f"Installing CyberPanel on {server_ip}:{ssh_port} as {ssh_user}")

    if dry_run:
        logger.info(f"Dry run: Would connect to {server_ip}:{ssh_port} as {ssh_user} and install CyberPanel")
        return

    client = None
    try:
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)

        commands = [
            "apt update && apt install -y wget",
            "wget -O - https://cyberpanel.net/install.sh | sudo bash",
            "echo -e '\n\n1\nY\nY\nN\nY\n' | sudo sh install.sh"
        ]
        for cmd in commands:
            run_ssh_command(client, cmd, dry_run, verbose)
    finally:
        if client:
            client.close()

def deploy_wordpress(project_name: str, server_ip: str, ssh_user: str, ssh_key: str, domain: str, dry_run: bool, verbose: bool, ssh_port: int = 22) -> None:
    """Deploy Bedrock WordPress site to CyberPanel via SSH."""
    local_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    remote_path = f"/home/{domain}/public_html"

    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")

    if dry_run:
        logger.info(f"Dry run: Would deploy {local_path} to {remote_path} on {server_ip}:{ssh_port}")
        return

    client = None
    try:
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)

        commands = [
            f"cyberpanel createWebsite --package Default --owner admin --domainName {domain} --email admin@{domain} --php 8.1",
            f"chown -R {domain}:{domain} {remote_path}",
        ]
        for cmd in commands:
            run_ssh_command(client, cmd, dry_run, verbose)

        run_shell(f"scp -r -i {os.path.expanduser(ssh_key)} -P {ssh_port} {local_path}/* {ssh_user}@{server_ip}:{remote_path}", dry_run)
        if verbose:
            logger.info(f"Deployed {local_path} to {remote_path} via SCP")
    except Exception as e:
        raise ForgeError(f"SSH deployment failed: {str(e)}")
    finally:
        if client:
            client.close()

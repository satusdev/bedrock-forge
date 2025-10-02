from hcloud import Client
from hcloud.images import Image
from hcloud.ssh_keys import SSHKey
from ..utils.errors import ForgeError
from ..utils.logging import logger
import os
import time

def create_server(project_name: str, server_type: str, region: str, ssh_key: str, hetzner_token: str, dry_run: bool, verbose: bool) -> str:
    """Create a Hetzner server and return its IP."""
    if dry_run:
        logger.info(f"Dry run: Would create server for {project_name} with type {server_type} in {region}")
        return "dry-run-ip"
    
    ssh_key_path = os.path.expanduser(ssh_key)
    if not os.path.exists(ssh_key_path):
        raise ForgeError(f"SSH key not found at {ssh_key_path}")
    
    client = Client(token=hetzner_token)
    try:
        ssh_key_obj = client.ssh_keys.get_by_name("forge-key")
        if not ssh_key_obj:
            with open(os.path.expanduser(ssh_key + ".pub")) as f:
                public_key = f.read().strip()
            ssh_key_obj = client.ssh_keys.create(name="forge-key", public_key=public_key)
        
        response = client.servers.create(
            name=f"{project_name}-server",
            server_type=client.server_types.get_by_name(server_type),
            image=Image(name="ubuntu-22.04"),
            location=client.locations.get_by_name(region),
            ssh_keys=[ssh_key_obj]
        )
        server = response.server
        if verbose:
            logger.info(f"Created server {server.name} with IP {server.public_net.ipv4.ip}")
        
        for _ in range(30):
            server = client.servers.get_by_id(server.id)
            if server.status == "running":
                break
            time.sleep(10)
        else:
            raise ForgeError(f"Server {server.name} failed to start within 5 minutes")
        
        return server.public_net.ipv4.ip
    except Exception as e:
        raise ForgeError(f"Failed to create server for {project_name}: {str(e)}")

def manage_server(project_name: str, action: str, hetzner_token: str, dry_run: bool, verbose: bool) -> str:
    """Manage Hetzner server (start, stop, status)."""
    valid_actions = ["start", "stop", "status"]
    if action not in valid_actions:
        raise ForgeError(f"Invalid action: {action}. Choose from {valid_actions}")
    
    client = Client(token=hetzner_token)
    server = client.servers.get_by_name(f"{project_name}-server")
    if not server:
        raise ForgeError(f"Server {project_name}-server not found in Hetzner")
    
    if dry_run:
        logger.info(f"Dry run: Would perform {action} on server {server.name}")
        return f"dry-run-{action}"
    
    try:
        if action == "start":
            server.power_on()
            logger.info(f"Started server {server.name}")
            return "started"
        elif action == "stop":
            server.power_off()
            logger.info(f"Stopped server {server.name}")
            return "stopped"
        elif action == "status":
            server = client.servers.get_by_id(server.id)
            return server.status
    except Exception as e:
        raise ForgeError(f"Failed to {action} server {project_name}: {str(e)}")
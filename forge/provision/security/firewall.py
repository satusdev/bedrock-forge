from forge.utils.ssh import SSHConnection
from forge.utils.logging import logger

def setup_firewall(connection: SSHConnection, ssh_port: int = 22):
    """
    Configure UFW firewall.
    
    Args:
        connection: SSHConnection object
        ssh_port: Custom SSH port if changed
    """
    logger.info("Configuring UFW firewall...")
    
    # Ensure UFW is installed
    connection.run("apt-get update && apt-get install -y ufw")
    
    # Default policies
    connection.run("ufw default deny incoming")
    connection.run("ufw default allow outgoing")
    
    # Allow essential ports
    connection.run(f"ufw allow {ssh_port}/tcp comment 'SSH'")
    connection.run("ufw allow 80/tcp comment 'HTTP'")
    connection.run("ufw allow 443/tcp comment 'HTTPS'")
    
    # Allow Nginx Full profile (alternative to separate ports)
    connection.run("ufw allow 'Nginx Full'")
    
    # Enable firewall
    # We use 'echo "y"' to bypass the confirmation prompt "Command may disrupt existing ssh connections"
    connection.run('echo "y" | ufw enable')
    
    logger.info("UFW firewall configured and enabled.")

def status(connection: SSHConnection):
    """Get firewall status."""
    return connection.run("ufw status verbose")

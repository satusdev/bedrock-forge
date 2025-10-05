"""
Core server provisioning utilities and provider abstractions.

This module provides base classes and common utilities for server provisioning
across different providers (Hetzner, LibyanSpider, etc.) and deployment methods
(SSH, FTP, SFTP).
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from enum import Enum
import paramiko
from pathlib import Path
import json
import time
from ..utils.errors import ForgeError
from ..utils.logging import logger


class DeploymentMethod(Enum):
    """Supported deployment methods."""
    SSH = "ssh"
    FTP = "ftp"
    SFTP = "sftp"
    RSYNC = "rsync"


class ServerType(Enum):
    """Supported server types/environments."""
    GENERIC_SSH = "generic_ssh"
    HETZNER = "hetzner"
    LIBYANSPIDER_CPANEL = "libyanspider_cpanel"
    CYBERPANEL = "cyberpanel"


class WebServer(Enum):
    """Supported web servers."""
    NGINX = "nginx"
    APACHE = "apache"
    LITESPEED = "litespeed"


@dataclass
class ServerConfig:
    """Server configuration data."""
    name: str
    ip_address: str
    domain: str
    ssh_user: str
    ssh_key: str
    ssh_port: int = 22
    provider: ServerType = ServerType.GENERIC_SSH
    deployment_method: DeploymentMethod = DeploymentMethod.SSH
    web_server: WebServer = WebServer.NGINX
    ftp_user: Optional[str] = None
    ftp_password: Optional[str] = None
    ftp_port: int = 21
    cloudflare_token: Optional[str] = None
    additional_config: Dict[str, Any] = None

    def __post_init__(self):
        if self.additional_config is None:
            self.additional_config = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'name': self.name,
            'ip_address': self.ip_address,
            'domain': self.domain,
            'ssh_user': self.ssh_user,
            'ssh_key': self.ssh_key,
            'ssh_port': self.ssh_port,
            'provider': self.provider.value,
            'deployment_method': self.deployment_method.value,
            'web_server': self.web_server.value,
            'ftp_user': self.ftp_user,
            'ftp_port': self.ftp_port,
            'cloudflare_token': self.cloudflare_token,
            'additional_config': self.additional_config
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ServerConfig':
        """Create from dictionary."""
        return cls(
            name=data['name'],
            ip_address=data['ip_address'],
            domain=data['domain'],
            ssh_user=data['ssh_user'],
            ssh_key=data['ssh_key'],
            ssh_port=data.get('ssh_port', 22),
            provider=ServerType(data.get('provider', 'generic_ssh')),
            deployment_method=DeploymentMethod(data.get('deployment_method', 'ssh')),
            web_server=WebServer(data.get('web_server', 'nginx')),
            ftp_user=data.get('ftp_user'),
            ftp_password=data.get('ftp_password'),
            ftp_port=data.get('ftp_port', 21),
            cloudflare_token=data.get('cloudflare_token'),
            additional_config=data.get('additional_config', {})
        )


@dataclass
class DeploymentResult:
    """Result of a deployment operation."""
    success: bool
    message: str
    details: Dict[str, Any] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.details is None:
            self.details = {}


class ServerProvider(ABC):
    """Abstract base class for server providers."""

    def __init__(self, config: ServerConfig, dry_run: bool = False, verbose: bool = False):
        self.config = config
        self.dry_run = dry_run
        self.verbose = verbose
        self.logger = logger

    @abstractmethod
    def create_server(self) -> DeploymentResult:
        """Create a new server."""
        pass

    @abstractmethod
    def setup_environment(self) -> DeploymentResult:
        """Set up the server environment (web server, database, etc.)."""
        pass

    @abstractmethod
    def deploy_application(self) -> DeploymentResult:
        """Deploy the application to the server."""
        pass

    @abstractmethod
    def configure_ssl(self) -> DeploymentResult:
        """Configure SSL certificates."""
        pass

    @abstractmethod
    def apply_security_hardening(self) -> DeploymentResult:
        """Apply security hardening."""
        pass

    def save_config(self, config_path: Path) -> None:
        """Save server configuration to file."""
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(self.config.to_dict(), f, indent=2)
        self.logger.info(f"Server configuration saved to {config_path}")

    @classmethod
    def load_config(cls, config_path: Path) -> ServerConfig:
        """Load server configuration from file."""
        if not config_path.exists():
            raise ForgeError(f"Server configuration not found at {config_path}")

        with open(config_path) as f:
            data = json.load(f)

        return ServerConfig.from_dict(data)


class DeploymentStrategy(ABC):
    """Abstract base class for deployment strategies."""

    def __init__(self, config: ServerConfig, dry_run: bool = False, verbose: bool = False):
        self.config = config
        self.dry_run = dry_run
        self.verbose = verbose
        self.logger = logger

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to server."""
        pass

    @abstractmethod
    def upload_files(self, local_path: Path, remote_path: str) -> DeploymentResult:
        """Upload files to server."""
        pass

    @abstractmethod
    def download_files(self, remote_path: str, local_path: Path) -> DeploymentResult:
        """Download files from server."""
        pass

    @abstractmethod
    def execute_command(self, command: str) -> DeploymentResult:
        """Execute command on server."""
        pass

    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to server."""
        pass

    def test_connection(self) -> DeploymentResult:
        """Test connection to server."""
        try:
            if self.connect():
                result = self.execute_command("echo 'Connection test successful'")
                self.disconnect()
                return result
            else:
                return DeploymentResult(
                    success=False,
                    message="Failed to establish connection",
                    error="Connection failed"
                )
        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Connection test failed",
                error=str(e)
            )


def create_provider(config: ServerConfig, dry_run: bool = False, verbose: bool = False) -> ServerProvider:
    """Factory function to create appropriate provider instance."""
    from .generic import GenericSSHProvider
    from .hetzner import HetznerProvider
    from .libyanspider import LibyanSpiderProvider

    provider_map = {
        ServerType.GENERIC_SSH: GenericSSHProvider,
        ServerType.HETZNER: HetznerProvider,
        ServerType.LIBYANSPIDER_CPANEL: LibyanSpiderProvider,
        ServerType.CYBERPANEL: GenericSSHProvider,  # Use generic for CyberPanel
    }

    provider_class = provider_map.get(config.provider)
    if not provider_class:
        raise ForgeError(f"Unsupported provider: {config.provider}")

    return provider_class(config, dry_run, verbose)


def create_deployment_strategy(config: ServerConfig, dry_run: bool = False, verbose: bool = False) -> DeploymentStrategy:
    """Factory function to create appropriate deployment strategy."""
    from .deployment_strategies import SSHDeployment, FTPDeployment, SFTPDeployment, RsyncDeployment

    strategy_map = {
        DeploymentMethod.SSH: SSHDeployment,
        DeploymentMethod.FTP: FTPDeployment,
        DeploymentMethod.SFTP: SFTPDeployment,
        DeploymentMethod.RSYNC: RsyncDeployment,
    }

    strategy_class = strategy_map.get(config.deployment_method)
    if not strategy_class:
        raise ForgeError(f"Unsupported deployment method: {config.deployment_method}")

    return strategy_class(config, dry_run, verbose)


def create_enhanced_deployment(
    config: ServerConfig,
    deployment_config,
    dry_run: bool = False,
    verbose: bool = False
):
    """Create enhanced deployment with version management."""
    from .enhanced_deployment import EnhancedDeployment
    return EnhancedDeployment(config, deployment_config, dry_run, verbose)


def get_deployment_methods() -> List[str]:
    """Get list of available deployment methods."""
    return [method.value for method in DeploymentMethod]


def validate_deployment_config(config: ServerConfig) -> List[str]:
    """Validate deployment configuration and return list of issues."""
    issues = []

    # Check SSH configuration
    if config.deployment_method in [DeploymentMethod.SSH, DeploymentMethod.SFTP, DeploymentMethod.RSYNC]:
        if not config.ssh_key or not Path(config.ssh_key).exists():
            issues.append(f"SSH key not found: {config.ssh_key}")
        if not config.ssh_user:
            issues.append("SSH user is required")
        if config.ssh_port < 1 or config.ssh_port > 65535:
            issues.append(f"Invalid SSH port: {config.ssh_port}")

    # Check FTP configuration
    if config.deployment_method == DeploymentMethod.FTP:
        if not config.ftp_user:
            issues.append("FTP user is required")
        if not config.ftp_password:
            issues.append("FTP password is required")
        if config.ftp_port < 1 or config.ftp_port > 65535:
            issues.append(f"Invalid FTP port: {config.ftp_port}")

    # Check IP address
    if not config.ip_address:
        issues.append("Server IP address is required")

    # Check domain
    if not config.domain:
        issues.append("Domain name is required")

    return issues


def run_ssh_command(client: paramiko.SSHClient, command: str, dry_run: bool = False, verbose: bool = False) -> str:
    """Execute a command via SSH and return output."""
    if dry_run:
        logger.info(f"Dry run: Would execute SSH command: {command}")
        return ""

    try:
        stdin, stdout, stderr = client.exec_command(command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if error and "Warning" not in error:
            raise ForgeError(f"SSH command failed: {command}\nError: {error}")

        if verbose:
            logger.info(f"SSH command executed: {command}")
            if output:
                logger.info(f"Output: {output}")

        return output
    except Exception as e:
        raise ForgeError(f"SSH command failed: {command}\nError: {str(e)}")


def validate_ssh_connection(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, verbose: bool = False) -> bool:
    """Validate SSH connection to server."""
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        if verbose:
            logger.info(f"Testing SSH connection to {server_ip}:{ssh_port} as {ssh_user}")

        client.connect(
            server_ip,
            username=ssh_user,
            key_filename=ssh_key,
            port=ssh_port,
            timeout=10
        )

        # Test with a simple command
        output = run_ssh_command(client, "echo 'SSH connection test successful'", False, verbose)

        client.close()

        if "SSH connection test successful" in output:
            if verbose:
                logger.info("SSH connection test successful")
            return True
        else:
            logger.error("SSH connection test failed - unexpected output")
            return False

    except Exception as e:
        logger.error(f"SSH connection test failed: {str(e)}")
        return False


def wait_for_service_ready(service_name: str, check_command: str, max_attempts: int = 30,
                          delay: int = 10, dry_run: bool = False, verbose: bool = False) -> bool:
    """Wait for a service to be ready."""
    if dry_run:
        logger.info(f"Dry run: Would wait for {service_name} to be ready")
        return True

    if verbose:
        logger.info(f"Waiting for {service_name} to be ready...")

    for attempt in range(max_attempts):
        try:
            # This would be called via SSH client in practice
            # For now, simulate with sleep
            time.sleep(delay)
            if verbose:
                logger.info(f"Attempt {attempt + 1}/{max_attempts}: Checking {service_name}")

            # In actual implementation, this would run the check_command via SSH
            # and return True when the service responds correctly

            if attempt == max_attempts - 1:
                logger.warning(f"{service_name} did not become ready within {max_attempts * delay} seconds")
                return False

        except Exception as e:
            if verbose:
                logger.info(f"Attempt {attempt + 1} failed: {str(e)}")
            continue

    return True
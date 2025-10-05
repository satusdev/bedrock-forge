"""
Configuration management utilities for server provisioning.

This module provides centralized configuration management for different providers,
deployment methods, and server configurations.
"""

import os
import json
import typer
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

from ..utils.errors import ForgeError
from ..utils.logging import logger
from ..provision.core import ServerConfig, ServerType, DeploymentMethod, WebServer


class ConfigFormat(Enum):
    """Supported configuration file formats."""
    JSON = "json"
    YAML = "yaml"
    TOML = "toml"


@dataclass
class ProviderConfig:
    """Provider-specific configuration."""
    provider_type: ServerType
    credentials: Dict[str, Any] = field(default_factory=dict)
    defaults: Dict[str, Any] = field(default_factory=dict)
    regions: List[str] = field(default_factory=list)
    server_types: List[str] = field(default_factory=list)
    deployment_methods: List[DeploymentMethod] = field(default_factory=list)


@dataclass
class GlobalConfig:
    """Global configuration for the Forge CLI."""
    default_ssh_user: str = "root"
    default_ssh_key: str = "~/.ssh/id_rsa"
    default_ssh_port: int = 22
    default_provider: ServerType = ServerType.GENERIC_SSH
    default_deployment_method: DeploymentMethod = DeploymentMethod.SSH
    default_web_server: WebServer = WebServer.NGINX
    providers: Dict[str, ProviderConfig] = field(default_factory=dict)
    global_credentials: Dict[str, str] = field(default_factory=dict)
    project_defaults: Dict[str, Any] = field(default_factory=dict)


class ConfigManager:
    """Manages configuration for Forge CLI."""

    def __init__(self, config_dir: Optional[Path] = None):
        if config_dir is None:
            config_dir = Path.home() / ".forge"

        self.config_dir = config_dir
        self.config_dir.mkdir(exist_ok=True)

        self.global_config_file = self.config_dir / "config.json"
        self.providers_dir = self.config_dir / "providers"
        self.providers_dir.mkdir(exist_ok=True)

        self._global_config: Optional[GlobalConfig] = None
        self._provider_configs: Dict[str, ProviderConfig] = {}

    def load_global_config(self) -> GlobalConfig:
        """Load global configuration."""
        if self._global_config is not None:
            return self._global_config

        if self.global_config_file.exists():
            try:
                with open(self.global_config_file, 'r') as f:
                    data = json.load(f)

                # Convert string enums back to enum objects
                data['default_provider'] = ServerType(data.get('default_provider', 'generic_ssh'))
                data['default_deployment_method'] = DeploymentMethod(data.get('default_deployment_method', 'ssh'))
                data['default_web_server'] = WebServer(data.get('default_web_server', 'nginx'))

                # Load provider configurations
                providers = {}
                for provider_name, provider_data in data.get('providers', {}).items():
                    provider_data['provider_type'] = ServerType(provider_data['provider_type'])
                    provider_data['deployment_methods'] = [
                        DeploymentMethod(method) for method in provider_data.get('deployment_methods', [])
                    ]
                    providers[provider_name] = ProviderConfig(**provider_data)

                data['providers'] = providers
                self._global_config = GlobalConfig(**data)

            except Exception as e:
                logger.warning(f"Failed to load global config: {e}. Using defaults.")
                self._global_config = GlobalConfig()
        else:
            self._global_config = GlobalConfig()
            # Initialize with default provider configurations
            self._initialize_default_providers()

        return self._global_config

    def save_global_config(self) -> None:
        """Save global configuration."""
        config = self.load_global_config()

        # Convert enum objects to strings for JSON serialization
        data = {
            'default_ssh_user': config.default_ssh_user,
            'default_ssh_key': config.default_ssh_key,
            'default_ssh_port': config.default_ssh_port,
            'default_provider': config.default_provider.value,
            'default_deployment_method': config.default_deployment_method.value,
            'default_web_server': config.default_web_server.value,
            'global_credentials': config.global_credentials,
            'project_defaults': config.project_defaults,
            'providers': {}
        }

        # Convert provider configurations
        for name, provider_config in config.providers.items():
            data['providers'][name] = {
                'provider_type': provider_config.provider_type.value,
                'credentials': provider_config.credentials,
                'defaults': provider_config.defaults,
                'regions': provider_config.regions,
                'server_types': provider_config.server_types,
                'deployment_methods': [method.value for method in provider_config.deployment_methods]
            }

        with open(self.global_config_file, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Global configuration saved to {self.global_config_file}")

    def load_provider_config(self, provider_name: str) -> ProviderConfig:
        """Load provider-specific configuration."""
        if provider_name in self._provider_configs:
            return self._provider_configs[provider_name]

        provider_file = self.providers_dir / f"{provider_name}.json"
        if provider_file.exists():
            try:
                with open(provider_file, 'r') as f:
                    data = json.load(f)

                data['provider_type'] = ServerType(data['provider_type'])
                data['deployment_methods'] = [
                    DeploymentMethod(method) for method in data.get('deployment_methods', [])
                ]

                config = ProviderConfig(**data)
                self._provider_configs[provider_name] = config
                return config

            except Exception as e:
                logger.warning(f"Failed to load provider config for {provider_name}: {e}")

        # Return empty config if file doesn't exist or fails to load
        return ProviderConfig(provider_type=ServerType.GENERIC_SSH)

    def save_provider_config(self, provider_name: str, config: ProviderConfig) -> None:
        """Save provider-specific configuration."""
        provider_file = self.providers_dir / f"{provider_name}.json"

        data = {
            'provider_type': config.provider_type.value,
            'credentials': config.credentials,
            'defaults': config.defaults,
            'regions': config.regions,
            'server_types': config.server_types,
            'deployment_methods': [method.value for method in config.deployment_methods]
        }

        with open(provider_file, 'w') as f:
            json.dump(data, f, indent=2)

        self._provider_configs[provider_name] = config
        logger.info(f"Provider configuration for {provider_name} saved to {provider_file}")

    def get_credential(self, key: str, provider: Optional[str] = None) -> Optional[str]:
        """Get credential from environment variables or config."""
        # First check environment variables
        env_value = os.getenv(key.upper())
        if env_value:
            return env_value

        # Check global credentials
        global_config = self.load_global_config()
        if key in global_config.global_credentials:
            return global_config.global_credentials[key]

        # Check provider-specific credentials
        if provider:
            provider_config = self.load_provider_config(provider)
            if key in provider_config.credentials:
                return provider_config.credentials[key]

        return None

    def set_credential(self, key: str, value: str, provider: Optional[str] = None) -> None:
        """Set credential in configuration."""
        if provider:
            provider_config = self.load_provider_config(provider)
            provider_config.credentials[key] = value
            self.save_provider_config(provider, provider_config)
        else:
            global_config = self.load_global_config()
            global_config.global_credentials[key] = value
            self.save_global_config()

    def create_server_config_from_project(self, project_name: str,
                                        provider: Optional[str] = None,
                                        **overrides) -> ServerConfig:
        """Create ServerConfig from project configuration and defaults."""
        global_config = self.load_global_config()

        # Load project-specific configuration if it exists
        project_config_path = Path(f"~/Work/Wordpress/{project_name}/.forge/config.json").expanduser()
        project_data = {}

        if project_config_path.exists():
            try:
                with open(project_config_path) as f:
                    project_data = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load project config: {e}")

        # Determine provider
        provider_name = provider or project_data.get('provider') or global_config.default_provider.value
        provider_config = self.load_provider_config(provider_name)

        # Merge defaults with project-specific and override values
        config_data = {
            'name': project_name,
            'provider': ServerType(provider_name),
            'ssh_user': project_data.get('ssh_user', global_config.default_ssh_user),
            'ssh_key': project_data.get('ssh_key', global_config.default_ssh_key),
            'ssh_port': project_data.get('ssh_port', global_config.default_ssh_port),
            'deployment_method': DeploymentMethod(
                project_data.get('deployment_method', global_config.default_deployment_method.value)
            ),
            'web_server': WebServer(
                project_data.get('web_server', global_config.default_web_server.value)
            ),
            'ip_address': project_data.get('ip_address', ''),
            'domain': project_data.get('domain', ''),
            'ftp_user': project_data.get('ftp_user'),
            'ftp_password': project_data.get('ftp_password'),
            'ftp_port': project_data.get('ftp_port', 21),
            'cloudflare_token': project_data.get('cloudflare_token'),
            'additional_config': project_data.get('additional_config', {})
        }

        # Apply provider defaults
        config_data.update(provider_config.defaults)

        # Apply overrides
        config_data.update(overrides)

        return ServerConfig(**config_data)

    def _initialize_default_providers(self) -> None:
        """Initialize default provider configurations."""
        global_config = self.load_global_config()

        # Hetzner provider
        hetzner_config = ProviderConfig(
            provider_type=ServerType.HETZNER,
            defaults={
                'server_type': 'cpx11',
                'region': 'nbg1'
            },
            regions=['nbg1', 'fsn1', 'hel1'],
            server_types=['cpx11', 'cpx21', 'cpx31', 'cpx41', 'cpx51'],
            deployment_methods=[DeploymentMethod.SSH, DeploymentMethod.SFTP, DeploymentMethod.RSYNC]
        )
        global_config.providers['hetzner'] = hetzner_config

        # LibyanSpider provider
        libyanspider_config = ProviderConfig(
            provider_type=ServerType.LIBYANSPIDER_CPANEL,
            defaults={
                'web_server': 'litespeed'
            },
            deployment_methods=[DeploymentMethod.SSH, DeploymentMethod.FTP, DeploymentMethod.SFTP]
        )
        global_config.providers['libyanspider'] = libyanspider_config

        # CyberPanel provider
        cyberpanel_config = ProviderConfig(
            provider_type=ServerType.CYBERPANEL,
            defaults={
                'web_server': 'litespeed'
            },
            deployment_methods=[DeploymentMethod.SSH, DeploymentMethod.SFTP, DeploymentMethod.RSYNC]
        )
        global_config.providers['cyberpanel'] = cyberpanel_config

        # Generic SSH provider
        generic_config = ProviderConfig(
            provider_type=ServerType.GENERIC_SSH,
            deployment_methods=[DeploymentMethod.SSH, DeploymentMethod.SFTP, DeploymentMethod.RSYNC]
        )
        global_config.providers['generic'] = generic_config

        self.save_global_config()


# Global config manager instance
_config_manager = None

def get_config_manager() -> ConfigManager:
    """Get the global configuration manager instance."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


def setup_credentials_interactive() -> None:
    """Interactive setup for common credentials."""
    config_manager = get_config_manager()

    typer.echo("Setting up Forge credentials...")

    # Hetzner token
    hetzner_token = typer.prompt("Hetzner API Token", hide_input=True, default="")
    if hetzner_token:
        config_manager.set_credential('hetzner_token', hetzner_token, 'hetzner')

    # Cloudflare token
    cloudflare_token = typer.prompt("Cloudflare API Token", hide_input=True, default="")
    if cloudflare_token:
        config_manager.set_credential('cloudflare_token', cloudflare_token)

    # Default SSH key
    ssh_key = typer.prompt("Default SSH key path", default="~/.ssh/id_rsa")
    if ssh_key:
        global_config = config_manager.load_global_config()
        global_config.default_ssh_key = ssh_key
        config_manager.save_global_config()

    typer.echo("✓ Credentials configured successfully!")
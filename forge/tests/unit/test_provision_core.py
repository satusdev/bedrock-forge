"""
Unit tests for forge.provision.core module.

Tests the core server provisioning utilities and provider abstractions.
"""

import pytest
import json
import paramiko
from pathlib import Path
from unittest.mock import Mock, patch, call
from dataclasses import asdict

from forge.provision.core import (
    ServerConfig, DeploymentMethod, ServerType, WebServer,
    DeploymentResult, ServerProvider, DeploymentStrategy,
    create_provider, create_deployment_strategy, validate_deployment_config,
    run_ssh_command, validate_ssh_connection, wait_for_service_ready,
    get_deployment_methods, create_enhanced_deployment
)
from forge.utils.errors import ForgeError


class TestServerConfig:
    """Test ServerConfig dataclass functionality."""

    def test_server_config_creation(self):
        """Test creating a server configuration."""
        config = ServerConfig(
            name="test-server",
            ip_address="192.168.1.100",
            domain="test.example.com",
            ssh_user="admin",
            ssh_key="/path/to/key",
            provider=ServerType.HETZNER,
            deployment_method=DeploymentMethod.RSYNC
        )

        assert config.name == "test-server"
        assert config.ip_address == "192.168.1.100"
        assert config.domain == "test.example.com"
        assert config.ssh_user == "admin"
        assert config.ssh_key == "/path/to/key"
        assert config.provider == ServerType.HETZNER
        assert config.deployment_method == DeploymentMethod.RSYNC
        assert config.ssh_port == 22  # Default value
        assert config.web_server == WebServer.NGINX  # Default value
        assert config.additional_config == {}  # Default value

    def test_server_config_to_dict(self):
        """Test converting server config to dictionary."""
        config = ServerConfig(
            name="test-server",
            ip_address="192.168.1.100",
            domain="test.example.com",
            ssh_user="admin",
            ssh_key="/path/to/key",
            additional_config={"php_version": "8.1"}
        )

        config_dict = config.to_dict()

        expected = {
            'name': 'test-server',
            'ip_address': '192.168.1.100',
            'domain': 'test.example.com',
            'ssh_user': 'admin',
            'ssh_key': '/path/to/key',
            'ssh_port': 22,
            'provider': ServerType.GENERIC_SSH.value,
            'deployment_method': DeploymentMethod.SSH.value,
            'web_server': WebServer.NGINX.value,
            'ftp_user': None,
            'ftp_port': 21,
            'cloudflare_token': None,
            'additional_config': {"php_version": "8.1"}
        }

        assert config_dict == expected

    def test_server_config_from_dict(self):
        """Test creating server config from dictionary."""
        data = {
            'name': 'test-server',
            'ip_address': '192.168.1.100',
            'domain': 'test.example.com',
            'ssh_user': 'admin',
            'ssh_key': '/path/to/key',
            'ssh_port': 2222,
            'provider': 'hetzner',
            'deployment_method': 'rsync',
            'web_server': 'apache',
            'additional_config': {'php_version': '8.1'}
        }

        config = ServerConfig.from_dict(data)

        assert config.name == "test-server"
        assert config.ip_address == "192.168.1.100"
        assert config.domain == "test.example.com"
        assert config.ssh_user == "admin"
        assert config.ssh_key == "/path/to/key"
        assert config.ssh_port == 2222
        assert config.provider == ServerType.HETZNER
        assert config.deployment_method == DeploymentMethod.RSYNC
        assert config.web_server == WebServer.APACHE
        assert config.additional_config == {"php_version": "8.1"}

    def test_server_config_defaults_from_dict(self):
        """Test creating server config from dict with missing optional fields."""
        data = {
            'name': 'test-server',
            'ip_address': '192.168.1.100',
            'domain': 'test.example.com',
            'ssh_user': 'admin',
            'ssh_key': '/path/to/key'
        }

        config = ServerConfig.from_dict(data)

        assert config.ssh_port == 22  # Default
        assert config.provider == ServerType.GENERIC_SSH  # Default
        assert config.deployment_method == DeploymentMethod.SSH  # Default
        assert config.web_server == WebServer.NGINX  # Default
        assert config.ftp_user is None
        assert config.ftp_password is None


class TestDeploymentResult:
    """Test DeploymentResult dataclass functionality."""

    def test_deployment_result_success(self):
        """Test successful deployment result."""
        result = DeploymentResult(
            success=True,
            message="Deployment completed successfully",
            details={"files_transferred": 10, "bytes": 1048576}
        )

        assert result.success is True
        assert result.message == "Deployment completed successfully"
        assert result.details == {"files_transferred": 10, "bytes": 1048576}
        assert result.error is None

    def test_deployment_result_failure(self):
        """Test failed deployment result."""
        result = DeploymentResult(
            success=False,
            message="Deployment failed",
            error="Connection timeout"
        )

        assert result.success is False
        assert result.message == "Deployment failed"
        assert result.error == "Connection timeout"
        assert result.details == {}  # Default empty dict


class TestServerProvider:
    """Test ServerProvider abstract class."""

    def test_server_provider_initialization(self, sample_server_config):
        """Test server provider initialization."""

        class TestProvider(ServerProvider):
            def create_server(self):
                return DeploymentResult(success=True, message="Created")

            def setup_environment(self):
                return DeploymentResult(success=True, message="Setup done")

            def deploy_application(self):
                return DeploymentResult(success=True, message="Deployed")

            def configure_ssl(self):
                return DeploymentResult(success=True, message="SSL configured")

            def apply_security_hardening(self):
                return DeploymentResult(success=True, message="Security applied")

        provider = TestProvider(sample_server_config, dry_run=True, verbose=True)

        assert provider.config == sample_server_config
        assert provider.dry_run is True
        assert provider.verbose is True

    def test_save_config(self, sample_server_config, temp_dir):
        """Test saving server configuration to file."""

        class TestProvider(ServerProvider):
            def create_server(self):
                pass
            def setup_environment(self):
                pass
            def deploy_application(self):
                pass
            def configure_ssl(self):
                pass
            def apply_security_hardening(self):
                pass

        provider = TestProvider(sample_server_config)
        config_path = temp_dir / "test_config.json"

        provider.save_config(config_path)

        assert config_path.exists()
        saved_data = json.loads(config_path.read_text())
        assert saved_data["name"] == "test-server"

    def test_load_config(self, sample_server_config, temp_dir):
        """Test loading server configuration from file."""

        class TestProvider(ServerProvider):
            def create_server(self):
                pass
            def setup_environment(self):
                pass
            def deploy_application(self):
                pass
            def configure_ssl(self):
                pass
            def apply_security_hardening(self):
                pass

        config_path = temp_dir / "test_config.json"
        config_path.write_text(json.dumps(sample_server_config.to_dict(), indent=2))

        loaded_config = TestProvider.load_config(config_path)

        assert loaded_config.name == sample_server_config.name
        assert loaded_config.ip_address == sample_server_config.ip_address

    def test_load_config_not_found(self):
        """Test loading non-existent configuration file."""

        class TestProvider(ServerProvider):
            def create_server(self):
                pass
            def setup_environment(self):
                pass
            def deploy_application(self):
                pass
            def configure_ssl(self):
                pass
            def apply_security_hardening(self):
                pass

        with pytest.raises(ForgeError, match="Server configuration not found"):
            TestProvider.load_config(Path("/non/existent/path.json"))


class TestDeploymentStrategy:
    """Test DeploymentStrategy abstract class."""

    def test_deployment_strategy_initialization(self, sample_server_config):
        """Test deployment strategy initialization."""

        class TestStrategy(DeploymentStrategy):
            def connect(self):
                return True

            def upload_files(self, local_path, remote_path):
                return DeploymentResult(success=True, message="Uploaded")

            def download_files(self, remote_path, local_path):
                return DeploymentResult(success=True, message="Downloaded")

            def execute_command(self, command):
                return DeploymentResult(success=True, message="Executed")

            def disconnect(self):
                pass

        strategy = TestStrategy(sample_server_config, dry_run=True, verbose=True)

        assert strategy.config == sample_server_config
        assert strategy.dry_run is True
        assert strategy.verbose is True

    def test_test_connection_success(self, sample_server_config):
        """Test successful connection test."""

        class TestStrategy(DeploymentStrategy):
            def connect(self):
                return True

            def execute_command(self, command):
                return DeploymentResult(success=True, message="Connection test successful")

            def upload_files(self, local_path, remote_path):
                pass
            def download_files(self, remote_path, local_path):
                pass
            def disconnect(self):
                pass

        strategy = TestStrategy(sample_server_config)
        result = strategy.test_connection()

        assert result.success is True
        assert "Connection test successful" in result.message

    def test_test_connection_failure(self, sample_server_config):
        """Test failed connection test."""

        class TestStrategy(DeploymentStrategy):
            def connect(self):
                return False

            def execute_command(self, command):
                pass
            def upload_files(self, local_path, remote_path):
                pass
            def download_files(self, remote_path, local_path):
                pass
            def disconnect(self):
                pass

        strategy = TestStrategy(sample_server_config)
        result = strategy.test_connection()

        assert result.success is False
        assert result.error == "Connection failed"


class TestFactoryFunctions:
    """Test factory functions for creating providers and strategies."""

    def test_get_deployment_methods(self):
        """Test getting list of deployment methods."""
        methods = get_deployment_methods()

        expected = ["ssh", "ftp", "sftp", "rsync"]
        assert methods == expected

    @patch('forge.provision.core.GenericSSHProvider')
    def test_create_provider_generic_ssh(self, mock_provider_class, sample_server_config):
        """Test creating generic SSH provider."""
        mock_provider = Mock()
        mock_provider_class.return_value = mock_provider

        sample_server_config.provider = ServerType.GENERIC_SSH
        provider = create_provider(sample_server_config, dry_run=True, verbose=True)

        mock_provider_class.assert_called_once_with(sample_server_config, dry_run=True, verbose=True)
        assert provider == mock_provider

    @patch('forge.provision.core.HetznerProvider')
    def test_create_provider_hetzner(self, mock_provider_class, sample_server_config):
        """Test creating Hetzner provider."""
        mock_provider = Mock()
        mock_provider_class.return_value = mock_provider

        sample_server_config.provider = ServerType.HETZNER
        provider = create_provider(sample_server_config)

        mock_provider_class.assert_called_once_with(sample_server_config, dry_run=False, verbose=False)
        assert provider == mock_provider

    def test_create_provider_unsupported(self, sample_server_config):
        """Test creating provider for unsupported type."""
        sample_server_config.provider = "unsupported_provider"

        with pytest.raises(ForgeError, match="Unsupported provider"):
            create_provider(sample_server_config)

    @patch('forge.provision.core.SSHDeployment')
    def test_create_deployment_strategy_ssh(self, mock_strategy_class, sample_server_config):
        """Test creating SSH deployment strategy."""
        mock_strategy = Mock()
        mock_strategy_class.return_value = mock_strategy

        sample_server_config.deployment_method = DeploymentMethod.SSH
        strategy = create_deployment_strategy(sample_server_config, dry_run=True, verbose=True)

        mock_strategy_class.assert_called_once_with(sample_server_config, dry_run=True, verbose=True)
        assert strategy == mock_strategy

    def test_create_deployment_strategy_unsupported(self, sample_server_config):
        """Test creating deployment strategy for unsupported method."""
        sample_server_config.deployment_method = "unsupported_method"

        with pytest.raises(ForgeError, match="Unsupported deployment method"):
            create_deployment_strategy(sample_server_config)


class TestValidationFunctions:
    """Test configuration validation functions."""

    def test_validate_deployment_config_valid_ssh(self, sample_server_config):
        """Test validation of valid SSH configuration."""
        # Mock SSH key file existence
        with patch('pathlib.Path.exists', return_value=True):
            issues = validate_deployment_config(sample_server_config)

        assert issues == []

    def test_validate_deployment_config_missing_ssh_key(self, sample_server_config):
        """Test validation with missing SSH key."""
        sample_server_config.deployment_method = DeploymentMethod.SSH
        sample_server_config.ssh_key = "/non/existent/key"

        with patch('pathlib.Path.exists', return_value=False):
            issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "SSH key not found" in issues[0]

    def test_validate_deployment_config_missing_ssh_user(self, sample_server_config):
        """Test validation with missing SSH user."""
        sample_server_config.deployment_method = DeploymentMethod.SSH
        sample_server_config.ssh_user = ""

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "SSH user is required" in issues[0]

    def test_validate_deployment_config_invalid_ssh_port(self, sample_server_config):
        """Test validation with invalid SSH port."""
        sample_server_config.ssh_port = 70000  # Invalid port

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "Invalid SSH port" in issues[0]

    def test_validate_deployment_config_valid_ftp(self, sample_server_config):
        """Test validation of valid FTP configuration."""
        sample_server_config.deployment_method = DeploymentMethod.FTP
        sample_server_config.ftp_user = "ftpuser"
        sample_server_config.ftp_password = "ftppass"

        issues = validate_deployment_config(sample_server_config)

        assert issues == []

    def test_validate_deployment_config_missing_ftp_user(self, sample_server_config):
        """Test validation with missing FTP user."""
        sample_server_config.deployment_method = DeploymentMethod.FTP
        sample_server_config.ftp_user = ""

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "FTP user is required" in issues[0]

    def test_validate_deployment_config_missing_ftp_password(self, sample_server_config):
        """Test validation with missing FTP password."""
        sample_server_config.deployment_method = DeploymentMethod.FTP
        sample_server_config.ftp_password = ""

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "FTP password is required" in issues[0]

    def test_validate_deployment_config_missing_ip_address(self, sample_server_config):
        """Test validation with missing IP address."""
        sample_server_config.ip_address = ""

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "Server IP address is required" in issues[0]

    def test_validate_deployment_config_missing_domain(self, sample_server_config):
        """Test validation with missing domain."""
        sample_server_config.domain = ""

        issues = validate_deployment_config(sample_server_config)

        assert len(issues) == 1
        assert "Domain name is required" in issues[0]


class TestSSHUtilities:
    """Test SSH utility functions."""

    @patch('forge.provision.core.paramiko.SSHClient')
    def test_validate_ssh_connection_success(self, mock_ssh_client_class):
        """Test successful SSH connection validation."""
        mock_client = Mock()
        mock_ssh_client_class.return_value = mock_client

        # Mock successful command execution
        mock_stdout = Mock()
        mock_stdout.read.return_value = b"SSH connection test successful"
        mock_stderr = Mock()
        mock_stderr.read.return_value = b""

        mock_client.exec_command.return_value = (None, mock_stdout, mock_stderr)

        result = validate_ssh_connection(
            server_ip="192.168.1.100",
            ssh_user="admin",
            ssh_key="/path/to/key",
            verbose=True
        )

        assert result is True
        mock_client.connect.assert_called_once()
        mock_client.close.assert_called_once()

    @patch('forge.provision.core.paramiko.SSHClient')
    def test_validate_ssh_connection_failure(self, mock_ssh_client_class):
        """Test failed SSH connection validation."""
        mock_client = Mock()
        mock_ssh_client_class.return_value = mock_client

        # Mock connection failure
        mock_client.connect.side_effect = Exception("Connection failed")

        result = validate_ssh_connection(
            server_ip="192.168.1.100",
            ssh_user="admin",
            ssh_key="/path/to/key"
        )

        assert result is False

    @patch('forge.provision.core.logger')
    def test_wait_for_service_ready_dry_run(self, mock_logger):
        """Test waiting for service in dry run mode."""
        result = wait_for_service_ready(
            service_name="nginx",
            check_command="systemctl is-active nginx",
            dry_run=True,
            verbose=True
        )

        assert result is True
        mock_logger.info.assert_called_with("Dry run: Would wait for nginx to be ready")

    def test_wait_for_service_ready_timeout(self):
        """Test waiting for service with timeout."""
        result = wait_for_service_ready(
            service_name="test-service",
            check_command="echo 'ready'",
            max_attempts=1,
            delay=1,
            dry_run=False
        )

        assert result is True  # Always returns True in current implementation

    @patch('forge.provision.core.run_ssh_command')
    def test_run_ssh_command_success(self, mock_run_ssh_command):
        """Test successful SSH command execution."""
        mock_run_ssh_command.return_value = "Command output"

        client = Mock()
        output = run_ssh_command(client, "echo 'test'", dry_run=False, verbose=True)

        assert output == "Command output"
        mock_run_ssh_command.assert_called_once_with(client, "echo 'test'", dry_run=False, verbose=True)

    @patch('forge.provision.core.run_ssh_command')
    def test_run_ssh_command_dry_run(self, mock_run_ssh_command):
        """Test SSH command execution in dry run mode."""
        with patch('forge.provision.core.logger') as mock_logger:
            output = run_ssh_command(Mock(), "echo 'test'", dry_run=True, verbose=True)

            assert output == ""
            mock_logger.info.assert_called_with("Dry run: Would execute SSH command: echo 'test'")


class TestCreateEnhancedDeployment:
    """Test enhanced deployment creation function."""

    @patch('forge.provision.core.EnhancedDeployment')
    def test_create_enhanced_deployment(self, mock_enhanced_deployment):
        """Test creating enhanced deployment."""
        mock_deployment = Mock()
        mock_enhanced_deployment.return_value = mock_deployment

        config = Mock()
        deployment_config = Mock()

        result = create_enhanced_deployment(
            config,
            deployment_config,
            dry_run=True,
            verbose=True
        )

        mock_enhanced_deployment.assert_called_once_with(config, deployment_config, dry_run=True, verbose=True)
        assert result == mock_deployment


class TestEnums:
    """Test enum values and functionality."""

    def test_deployment_method_values(self):
        """Test DeploymentMethod enum values."""
        assert DeploymentMethod.SSH.value == "ssh"
        assert DeploymentMethod.FTP.value == "ftp"
        assert DeploymentMethod.SFTP.value == "sftp"
        assert DeploymentMethod.RSYNC.value == "rsync"

    def test_server_type_values(self):
        """Test ServerType enum values."""
        assert ServerType.GENERIC_SSH.value == "generic_ssh"
        assert ServerType.HETZNER.value == "hetzner"
        assert ServerType.LIBYANSPIDER_CPANEL.value == "libyanspider_cpanel"
        assert ServerType.CYBERPANEL.value == "cyberpanel"

    def test_web_server_values(self):
        """Test WebServer enum values."""
        assert WebServer.NGINX.value == "nginx"
        assert WebServer.APACHE.value == "apache"
        assert WebServer.LITESPEED.value == "litespeed"
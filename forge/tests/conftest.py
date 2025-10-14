"""
Pytest configuration and shared fixtures for bedrock-forge testing.

This module provides common test fixtures, mocks, and utilities
used across the entire test suite.
"""

import os
import sys
import json
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import pytest
import paramiko

# Add the forge module to Python path for testing
sys.path.insert(0, str(Path(__file__).parent.parent))

from forge.provision.core import ServerConfig, DeploymentMethod, ServerType, WebServer
from forge.utils.config import Config as ForgeConfig


@pytest.fixture(scope="session")
def test_data_dir():
    """Get the test data directory path."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests."""
    temp_path = Path(tempfile.mkdtemp())
    yield temp_path
    shutil.rmtree(temp_path)


@pytest.fixture
def temp_project_dir(temp_dir):
    """Create a temporary project directory structure."""
    # Create basic WordPress project structure
    dirs = [
        "web/app/themes",
        "web/app/plugins",
        "web/app/mu-plugins",
        "web/wp",
        "config",
        "vendor"
    ]

    for dir_path in dirs:
        (temp_dir / dir_path).mkdir(parents=True)

    # Create basic files
    (temp_dir / "web/app/themes/index.php").write_text("<?php // Theme index")
    (temp_dir / "web/app/plugins/index.php").write_text("<?php // Plugin index")
    (temp_dir / "web/wp/index.php").write_text("<?php // WordPress index")
    (temp_dir / "composer.json").write_text(json.dumps({
        "name": "test/wordpress-project",
        "type": "project"
    }))

    return temp_dir


@pytest.fixture
def sample_server_config():
    """Sample server configuration for testing."""
    return ServerConfig(
        name="test-server",
        ip_address="192.168.1.100",
        domain="test.example.com",
        ssh_user="testuser",
        ssh_key=str(Path(__file__).parent / "fixtures" / "test_key"),
        ssh_port=22,
        provider=ServerType.GENERIC_SSH,
        deployment_method=DeploymentMethod.SSH,
        web_server=WebServer.NGINX,
        additional_config={
            "php_version": "8.1",
            "mysql_version": "8.0"
        }
    )


@pytest.fixture
def sample_forge_config():
    """Sample Forge configuration for testing."""
    return ForgeConfig(
        admin_user="test_admin",
        admin_email="test@example.com",
        site_name="test_site",
        php_version="8.1",
        mysql_version="8.0",
        github_token="fake_token_for_testing"
    )


@pytest.fixture
def mock_ssh_client():
    """Mock SSH client for testing SSH operations."""
    mock_client = Mock(spec=paramiko.SSHClient)

    # Mock successful connection
    mock_client.connect.return_value = None

    # Mock command execution
    mock_stdout = Mock()
    mock_stdout.read.return_value = b"Command executed successfully"
    mock_stdout.channel.recv_exit_status.return_value = 0

    mock_stderr = Mock()
    mock_stderr.read.return_value = b""

    mock_client.exec_command.return_value = (None, mock_stdout, mock_stderr)

    return mock_client


@pytest.fixture
def mock_ftp_connection():
    """Mock FTP connection for testing FTP operations."""
    mock_ftp = Mock()
    mock_ftp.login.return_value = None
    mock_ftp.nlst.return_value = ["file1.txt", "file2.txt"]
    mock_ftp.pwd.return_value = "/remote/path"
    mock_ftp.size.return_value = 1024

    return mock_ftp


@pytest.fixture
def mock_hetzner_client():
    """Mock Hetzner Cloud client for testing."""
    mock_client = Mock()

    # Mock server creation
    mock_server = Mock()
    mock_server.id = 12345
    mock_server.name = "test-server"
    mock_server.public_net.ipv4.ip = "192.168.1.100"
    mock_server.status = "running"

    mock_client.servers.create.return_value = mock_server
    mock_client.servers.get_by_id.return_value = mock_server
    mock_client.servers.get_list.return_value = [mock_server]

    # Mock server actions
    mock_action = Mock()
    mock_action.id = 67890
    mock_action.status = "success"
    mock_client.servers.enable_rescue.return_value = mock_action
    mock_client.servers.power_on.return_value = mock_action

    return mock_client


@pytest.fixture
def mock_cloudflare_client():
    """Mock Cloudflare client for testing."""
    mock_client = Mock()

    # Mock DNS records
    mock_zone = Mock()
    mock_zone.id = "zone123"
    mock_zone.name = "example.com"

    mock_record = Mock()
    mock_record.id = "record123"
    mock_record.name = "test"
    mock_record.content = "192.168.1.100"
    mock_record.type = "A"

    mock_client.zones.list.return_value = [mock_zone]
    mock_client.dns.records.list.return_value = [mock_record]
    mock_client.dns.records.create.return_value = mock_record

    return mock_client


@pytest.fixture
def backup_test_data(temp_dir):
    """Create test data for backup testing."""
    # Create test files
    test_files = {
        "web/app/themes/test-theme/style.css": "/* Test theme CSS */",
        "web/app/plugins/test-plugin/plugin.php": "<?php // Test plugin",
        "config/application.php": "<?php // App config",
        "database.sql": "-- Test SQL dump\nCREATE TABLE test_table (id INT);",
        "uploads/image.jpg": "fake-image-content"
    }

    for file_path, content in test_files.items():
        full_path = temp_dir / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content)

    return temp_dir


@pytest.fixture
def deployment_test_data(temp_dir):
    """Create test data for deployment testing."""
    # Create project structure
    dirs = ["src", "config", "assets", "tests"]
    for dir_path in dirs:
        (temp_dir / dir_path).mkdir(parents=True)

    # Create deployment files
    files = {
        "src/index.php": "<?php echo 'Hello World';",
        "src/app.js": "console.log('Hello World');",
        "config/app.json": '{"name": "test-app", "version": "1.0.0"}',
        "assets/style.css": "body { margin: 0; }",
        "composer.json": '{"name": "test/deployment-project"}'
    }

    for file_path, content in files.items():
        (temp_dir / file_path).write_text(content)

    return temp_dir


@pytest.fixture
def mock_rclone_output():
    """Mock rclone command output for testing."""
    return {
        "list": [
            {"Path": "backup_20240101_120000", "Size": 1048576, "ModTime": "2024-01-01T12:00:00Z"},
            {"Path": "backup_20240102_120000", "Size": 2097152, "ModTime": "2024-01-02T12:00:00Z"}
        ],
        "stats": {
            "bytes": 1048576,
            "checks": 10,
            "deletes": 0,
            "errors": 0,
            "renames": 0,
            "transferTime": 30.5,
            "transfers": 10
        }
    }


@dataclass
class MockDeploymentResult:
    """Mock deployment result for testing."""
    success: bool = True
    message: str = "Deployment successful"
    details: Dict[str, Any] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.details is None:
            self.details = {
                "version": "v1.0.0",
                "duration_seconds": 45.2,
                "files_changed": 15,
                "bytes_transferred": 1048576
            }


@pytest.fixture
def mock_deployment_result():
    """Create a mock deployment result."""
    return MockDeploymentResult()


# Environment variables for testing
@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Set up test environment variables."""
    test_env = {
        "FORGE_ENV": "test",
        "FORGE_LOG_LEVEL": "DEBUG",
        "GITHUB_TOKEN": "fake_test_token",
        "CI": "true"
    }

    for key, value in test_env.items():
        monkeypatch.setenv(key, value)


# Patches for external services
@pytest.fixture(autouse=True)
def patch_external_services():
    """Patch external services to prevent actual API calls during tests."""
    with patch('paramiko.SSHClient'), \
         patch('forge.utils.shell.run_shell'), \
         patch('forge.provision.hetzner.Client'), \
         patch('cloudflare.Client'), \
         patch('subprocess.run'):
        yield


# Markers for different test types
def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line(
        "markers", "unit: Mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: Mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: Mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "external: Mark test as requiring external services"
    )
    config.addinivalue_line(
        "markers", "provisioning: Mark test as related to provisioning"
    )
    config.addinivalue_line(
        "markers", "deployment: Mark test as related to deployment"
    )
    config.addinivalue_line(
        "markers", "backup: Mark test as related to backup operations"
    )
    config.addinivalue_line(
        "markers", "cli: Mark test as CLI related"
    )
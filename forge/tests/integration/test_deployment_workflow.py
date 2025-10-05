"""
Integration tests for complete deployment workflow.

Tests the entire deployment pipeline from project creation to deployment
with rollback functionality.
"""

import pytest
import tempfile
import json
from pathlib import Path
from unittest.mock import patch, Mock
from typer.testing import CliRunner

from forge.main import app
from forge.provision.enhanced_deployment import EnhancedDeployment, DeploymentConfig
from forge.provision.core import ServerConfig, DeploymentMethod, ServerType
from tests.mocks.mock_hetzner import HetznerMockPatcher
from tests.mocks.mock_ssh_ftp import SSHMockPatcher, RsyncMockPatcher


class TestDeploymentWorkflow:
    """Test complete deployment workflow."""

    def setup_method(self):
        """Set up test environment."""
        self.runner = CliRunner()
        self.temp_dir = Path(tempfile.mkdtemp())
        self.project_dir = self.temp_dir / "test_project"
        self.project_dir.mkdir()

        # Create a basic WordPress project structure
        self._create_wordpress_project()

    def _create_wordpress_project(self):
        """Create a basic WordPress project for testing."""
        directories = [
            "web/app/themes",
            "web/app/plugins",
            "web/app/mu-plugins",
            "web/wp",
            "config",
            "vendor"
        ]

        for directory in directories:
            (self.project_dir / directory).mkdir(parents=True)

        # Create basic files
        files = {
            "web/app/themes/test-theme/style.css": "/* Theme styles */",
            "web/app/plugins/test-plugin/plugin.php": "<?php // Plugin file",
            "web/wp/index.php": "<?php // WordPress index",
            "config/application.php": "<?php // App config",
            "composer.json": json.dumps({
                "name": "test/wordpress-project",
                "type": "project"
            })
        }

        for file_path, content in files.items():
            (self.project_dir / file_path).write_text(content)

    def test_complete_deployment_workflow_success(self):
        """Test complete successful deployment workflow."""
        with HetznerMockPatcher() as hetzner_client, \
             SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            # Set up mock server
            hetzner_client.mock_server.status = "running"
            ssh_server.default_connection.connected = True
            rsync_op.simulate_success(files_transferred=15, bytes_transferred=2097152)

            # Create server configuration
            server_config = ServerConfig(
                name="test-deploy-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC,
                provider=ServerType.HETZNER
            )

            # Create deployment configuration
            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                backup_before_deploy=True,
                atomic_deployment=True,
                max_versions_to_keep=5
            )

            # Create enhanced deployment
            deployment = EnhancedDeployment(server_config, deployment_config, dry_run=False)

            # Perform deployment
            result = deployment.deploy()

            # Verify deployment success
            assert result.success is True
            assert "Deployment completed successfully" in result.message
            assert result.details["version"] is not None
            assert result.details["files_changed"] == 15
            assert result.details["bytes_transferred"] == 2097152

            # Verify deployment history was created
            history = deployment.version_manager.load_history()
            assert len(history) == 1
            assert history[0].status == "success"

    def test_deployment_with_backup_and_rollback(self):
        """Test deployment with backup and rollback functionality."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            # Set up mocks
            ssh_server.default_connection.connected = True
            ssh_server.default_connection.add_file("/var/www/html/index.php", "old content")
            rsync_op.simulate_success()

            # Configure deployment with backup
            server_config = ServerConfig(
                name="rollback-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                backup_before_deploy=True,
                rollback_on_failure=True
            )

            deployment = EnhancedDeployment(server_config, deployment_config)

            # Mock backup creation
            deployment.create_backup = Mock(return_value=True)

            # Perform deployment
            result = deployment.deploy()
            assert result.success is True

            # Simulate rollback scenario
            rollback_result = deployment.rollback()
            assert rollback_result.success is True
            assert "Rollback completed" in rollback_result.message

    def test_deployment_failure_with_rollback(self):
        """Test deployment failure with automatic rollback."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            # Set up mocks for failure scenario
            ssh_server.default_connection.connected = True
            rsync_op.simulate_failure("rsync: permission denied")

            server_config = ServerConfig(
                name="failure-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                backup_before_deploy=True,
                rollback_on_failure=True
            )

            deployment = EnhancedDeployment(server_config, deployment_config)

            # Mock backup creation but fail upload
            deployment.create_backup = Mock(return_value=True)
            deployment.perform_health_check = Mock(return_value=False)  # Health check fails

            # Perform deployment
            result = deployment.deploy()

            # Verify deployment failed
            assert result.success is False
            assert "Health check failed" in result.error

    def test_atomic_deployment_workflow(self):
        """Test atomic deployment workflow."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            server_config = ServerConfig(
                name="atomic-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                atomic_deployment=True,
                backup_before_deploy=True
            )

            deployment = EnhancedDeployment(server_config, deployment_config)

            # Mock atomic deployment operations
            deployment.perform_atomic_deployment = Mock(return_value=True)
            deployment.create_backup = Mock(return_value=True)

            result = deployment.deploy()

            assert result.success is True
            deployment.perform_atomic_deployment.assert_called_once()

    def test_deployment_with_health_check(self):
        """Test deployment with health check."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op, \
             patch('forge.provision.enhanced_deployment.requests') as mock_requests:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            # Mock successful health check
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "OK"
            mock_requests.get.return_value = mock_response

            server_config = ServerConfig(
                name="health-check-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                health_check_url="https://test.example.com/health"
            )

            deployment = EnhancedDeployment(server_config, deployment_config)

            result = deployment.deploy()

            assert result.success is True
            deployment.perform_health_check.assert_called_once()
            mock_requests.get.assert_called_once_with(
                "https://test.example.com/health",
                timeout=30
            )

    def test_deployment_health_check_failure(self):
        """Test deployment with health check failure."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op, \
             patch('forge.provision.enhanced_deployment.requests') as mock_requests:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            # Mock failed health check
            mock_response = Mock()
            mock_response.status_code = 500
            mock_requests.get.return_value = mock_response

            server_config = ServerConfig(
                name="health-fail-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                health_check_url="https://test.example.com/health",
                rollback_on_failure=True
            )

            deployment = EnhancedDeployment(server_config, deployment_config)
            deployment.create_backup = Mock(return_value=True)
            deployment.rollback_to_backup = Mock(return_value=True)

            result = deployment.deploy()

            assert result.success is False
            assert "Health check failed" in result.error

    def test_version_management_workflow(self):
        """Test deployment version management."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            server_config = ServerConfig(
                name="version-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                max_versions_to_keep=3
            )

            deployment = EnhancedDeployment(server_config, deployment_config)

            # Perform multiple deployments
            for i in range(5):
                rsync_op.simulate_success(files_transferred=i+5)
                result = deployment.deploy()
                assert result.success is True

            # Check that only 3 versions are kept
            history = deployment.version_manager.load_history()
            assert len(history) <= 3

            # Test rollback to specific version
            if history:
                target_version = history[0].version
                rollback_result = deployment.rollback(target_version)
                assert rollback_result.success is True

    def test_deployment_with_git_integration(self):
        """Test deployment with Git integration."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op, \
             patch('forge.provision.enhanced_deployment.run_shell') as mock_shell:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            # Mock Git commands
            mock_shell.side_effect = [
                Mock(stdout="abc123"),  # git rev-parse HEAD
                Mock(stdout="Test Author\n"),  # git log -1 --format=%an
                Mock(stdout="Test commit message\n")  # git log -1 --format=%s
            ]

            server_config = ServerConfig(
                name="git-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html"
            )

            deployment = EnhancedDeployment(server_config, deployment_config)
            result = deployment.deploy()

            assert result.success is True
            assert result.details.get("commit_hash") == "abc123"
            assert result.details.get("author") == "Test Author"
            assert result.details.get("message") == "Test commit message"

    def test_deployment_with_excludes(self):
        """Test deployment with file exclusions."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            # Add files that should be excluded
            (self.project_dir / "node_modules").mkdir()
            (self.project_dir / "node_modules" / "package.json").write_text("{}")
            (self.project_dir / ".env").write_text("SECRET=secret")
            (self.project_dir / "debug.log").write_text("log content")

            server_config = ServerConfig(
                name="exclude-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                excludes=["node_modules", "*.log", ".env"]
            )

            deployment = EnhancedDeployment(server_config, deployment_config)
            result = deployment.deploy()

            assert result.success is True

    def test_deployment_with_bandwidth_limit(self):
        """Test deployment with bandwidth limiting."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            server_config = ServerConfig(
                name="bandwidth-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                bandwidth_limit=1000  # 1000 KB/s
            )

            deployment = EnhancedDeployment(server_config, deployment_config)
            result = deployment.deploy()

            assert result.success is True

    def test_deployment_with_checksum_verification(self):
        """Test deployment with checksum verification."""
        with SSHMockPatcher() as ssh_server, \
             RsyncMockPatcher() as rsync_op:

            ssh_server.default_connection.connected = True
            rsync_op.simulate_success()

            server_config = ServerConfig(
                name="checksum-test-server",
                ip_address="192.168.1.100",
                domain="test.example.com",
                ssh_user="admin",
                ssh_key=str(self.project_dir / "test_key"),
                deployment_method=DeploymentMethod.RSYNC
            )

            deployment_config = DeploymentConfig(
                local_path=str(self.project_dir),
                remote_path="/var/www/html",
                checksum_verification=True
            )

            deployment = EnhancedDeployment(server_config, deployment_config)
            result = deployment.deploy()

            assert result.success is True
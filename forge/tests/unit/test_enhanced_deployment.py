"""
Unit tests for forge.provision.enhanced_deployment module.

Tests enhanced deployment functionality with version management and rollback.
"""

import pytest
import json
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, call, MagicMock
from dataclasses import asdict

from forge.provision.enhanced_deployment import (
    EnhancedDeployment, DeploymentConfig, DeploymentVersion,
    VersionManager, create_deployment_config
)
from forge.provision.core import ServerConfig, DeploymentResult, DeploymentMethod


class TestDeploymentVersion:
    """Test DeploymentVersion dataclass functionality."""

    def test_deployment_version_creation(self):
        """Test creating a deployment version."""
        timestamp = datetime.now()
        version = DeploymentVersion(
            version="v1.0.0",
            timestamp=timestamp,
            status="success",
            files_changed=15,
            bytes_transferred=1048576,
            duration_seconds=45.2,
            commit_hash="abc123",
            author="test_author",
            message="Test deployment",
            backup_path="/backup/path"
        )

        assert version.version == "v1.0.0"
        assert version.timestamp == timestamp
        assert version.status == "success"
        assert version.files_changed == 15
        assert version.bytes_transferred == 1048576
        assert version.duration_seconds == 45.2
        assert version.commit_hash == "abc123"
        assert version.author == "test_author"
        assert version.message == "Test deployment"
        assert version.backup_path == "/backup/path"

    def test_deployment_version_to_dict(self):
        """Test converting deployment version to dictionary."""
        timestamp = datetime(2024, 1, 1, 12, 0, 0)
        version = DeploymentVersion(
            version="v1.0.0",
            timestamp=timestamp,
            status="success",
            files_changed=10
        )

        version_dict = asdict(version)

        expected = {
            "version": "v1.0.0",
            "timestamp": timestamp,
            "status": "success",
            "files_changed": 10,
            "bytes_transferred": 0,
            "duration_seconds": 0.0,
            "commit_hash": None,
            "author": None,
            "message": None,
            "backup_path": None
        }

        assert version_dict == expected

    def test_deployment_version_from_dict(self):
        """Test creating deployment version from dictionary."""
        timestamp = datetime(2024, 1, 1, 12, 0, 0)
        data = {
            "version": "v1.0.0",
            "timestamp": timestamp,
            "status": "success",
            "files_changed": 10,
            "bytes_transferred": 1048576,
            "duration_seconds": 45.2,
            "commit_hash": "abc123",
            "author": "test_author",
            "message": "Test deployment",
            "backup_path": "/backup/path"
        }

        version = DeploymentVersion(**data)

        assert version.version == "v1.0.0"
        assert version.timestamp == timestamp
        assert version.status == "success"


class TestDeploymentConfig:
    """Test DeploymentConfig dataclass functionality."""

    def test_deployment_config_creation(self):
        """Test creating a deployment configuration."""
        config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path",
            backup_before_deploy=True,
            atomic_deployment=True,
            bandwidth_limit=1000,
            checksum_verification=True,
            max_versions_to_keep=5,
            health_check_url="https://example.com/health",
            rollback_on_failure=True
        )

        assert config.local_path == "/local/path"
        assert config.remote_path == "/remote/path"
        assert config.backup_before_deploy is True
        assert config.atomic_deployment is True
        assert config.bandwidth_limit == 1000
        assert config.checksum_verification is True
        assert config.max_versions_to_keep == 5
        assert config.health_check_url == "https://example.com/health"
        assert config.rollback_on_failure is True

    def test_deployment_config_defaults(self):
        """Test deployment configuration with default values."""
        config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        assert config.backup_before_deploy is True
        assert config.atomic_deployment is True
        assert config.bandwidth_limit is None
        assert config.checksum_verification is False
        assert config.max_versions_to_keep == 10
        assert config.health_check_url is None
        assert config.rollback_on_failure is True

    def test_deployment_config_excludes(self):
        """Test deployment configuration with exclude patterns."""
        excludes = ["node_modules", "*.log", ".env"]
        config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path",
            excludes=excludes
        )

        assert config.excludes == excludes


class TestVersionManager:
    """Test VersionManager class functionality."""

    def test_version_manager_initialization(self, temp_dir):
        """Test version manager initialization."""
        manager = VersionManager(temp_dir)

        assert manager.project_path == temp_dir
        assert manager.history_file == temp_dir / ".forge" / "deployment_history.json"

    def test_version_manager_create_history_file(self, temp_dir):
        """Test creating deployment history file."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        assert manager.history_file.exists()
        data = json.loads(manager.history_file.read_text())
        assert data == []

    def test_version_manager_load_history_empty(self, temp_dir):
        """Test loading empty deployment history."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        history = manager.load_history()
        assert history == []

    def test_version_manager_save_version(self, temp_dir):
        """Test saving deployment version."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        version = DeploymentVersion(
            version="v1.0.0",
            timestamp=datetime.now(),
            status="success",
            files_changed=10
        )

        manager.save_version(version)

        history = manager.load_history()
        assert len(history) == 1
        assert history[0].version == "v1.0.0"
        assert history[0].files_changed == 10

    def test_version_manager_save_multiple_versions(self, temp_dir):
        """Test saving multiple deployment versions."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        versions = [
            DeploymentVersion(
                version=f"v1.{i}.0",
                timestamp=datetime.now() + timedelta(hours=i),
                status="success",
                files_changed=i * 5
            )
            for i in range(3)
        ]

        for version in versions:
            manager.save_version(version)

        history = manager.load_history()
        assert len(history) == 3
        assert history[0].version == "v1.0.0"
        assert history[1].version == "v1.1.0"
        assert history[2].version == "v1.2.0"

    def test_version_manager_get_latest_version(self, temp_dir):
        """Test getting latest deployment version."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        versions = [
            DeploymentVersion(
                version=f"v1.{i}.0",
                timestamp=datetime.now() + timedelta(hours=i),
                status="success"
            )
            for i in range(3)
        ]

        for version in versions:
            manager.save_version(version)

        latest = manager.get_latest_version()
        assert latest.version == "v1.2.0"

    def test_version_manager_get_latest_version_empty(self, temp_dir):
        """Test getting latest version when history is empty."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        latest = manager.get_latest_version()
        assert latest is None

    def test_version_manager_get_version_by_tag(self, temp_dir):
        """Test getting version by tag."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        version = DeploymentVersion(
            version="v1.2.0",
            timestamp=datetime.now(),
            status="success"
        )
        manager.save_version(version)

        found = manager.get_version_by_tag("v1.2.0")
        assert found is not None
        assert found.version == "v1.2.0"

        not_found = manager.get_version_by_tag("v2.0.0")
        assert not_found is None

    def test_version_manager_cleanup_old_versions(self, temp_dir):
        """Test cleaning up old deployment versions."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        # Create 5 versions
        for i in range(5):
            version = DeploymentVersion(
                version=f"v1.{i}.0",
                timestamp=datetime.now() + timedelta(hours=i),
                status="success"
            )
            manager.save_version(version)

        # Keep only 3 most recent
        manager.cleanup_old_versions(max_versions=3)

        history = manager.load_history()
        assert len(history) == 3
        assert history[0].version == "v1.2.0"
        assert history[1].version == "v1.3.0"
        assert history[2].version == "v1.4.0"

    def test_version_manager_generate_version_tag(self, temp_dir):
        """Test generating version tags."""
        manager = VersionManager(temp_dir)
        manager.create_history_file()

        # First version should be v1.0.0
        tag1 = manager.generate_version_tag()
        assert tag1 == "v1.0.0"

        # Save a version
        version1 = DeploymentVersion(
            version=tag1,
            timestamp=datetime.now(),
            status="success"
        )
        manager.save_version(version1)

        # Next version should be v1.0.1
        tag2 = manager.generate_version_tag()
        assert tag2 == "v1.0.1"


class TestEnhancedDeployment:
    """Test EnhancedDeployment class functionality."""

    def test_enhanced_deployment_initialization(self, sample_server_config):
        """Test enhanced deployment initialization."""
        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(
            sample_server_config,
            deployment_config,
            dry_run=True,
            verbose=True
        )

        assert deployment.server_config == sample_server_config
        assert deployment.deployment_config == deployment_config
        assert deployment.dry_run is True
        assert deployment.verbose is True
        assert deployment.deployment_strategy is not None
        assert deployment.version_manager is not None

    @patch('forge.provision.enhanced_deployment.create_deployment_strategy')
    def test_enhanced_deployment_create_strategy(self, mock_create_strategy, sample_server_config):
        """Test deployment strategy creation."""
        mock_strategy = Mock()
        mock_create_strategy.return_value = mock_strategy

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)

        mock_create_strategy.assert_called_once_with(sample_server_config, dry_run=False, verbose=False)

    @patch('forge.provision.enhanced_deployment.run_shell')
    def test_enhanced_deployment_get_git_info(self, mock_run_shell, sample_server_config):
        """Test getting Git information."""
        mock_run_shell.side_effect = [
            Mock(stdout="abc123"),  # git rev-parse HEAD
            Mock(stdout="Test Author\n"),  # git log -1 --format=%an
            Mock(stdout="Test commit message\n")  # git log -1 --format=%s
        ]

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        git_info = deployment.get_git_info()

        assert git_info["commit_hash"] == "abc123"
        assert git_info["author"] == "Test Author"
        assert git_info["message"] == "Test commit message"

    @patch('forge.provision.enhanced_deployment.run_shell')
    def test_enhanced_deployment_get_git_info_no_repo(self, mock_run_shell, sample_server_config):
        """Test getting Git information when not in a Git repository."""
        mock_run_shell.side_effect = Exception("Not a git repository")

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        git_info = deployment.get_git_info()

        assert git_info["commit_hash"] is None
        assert git_info["author"] is None
        assert git_info["message"] is None

    @patch('forge.provision.enhanced_deployment.requests.get')
    def test_enhanced_deployment_health_check_success(self, mock_get, sample_server_config):
        """Test successful health check."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_get.return_value = mock_response

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path",
            health_check_url="https://example.com/health"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        result = deployment.perform_health_check()

        assert result is True
        mock_get.assert_called_once_with("https://example.com/health", timeout=30)

    @patch('forge.provision.enhanced_deployment.requests.get')
    def test_enhanced_deployment_health_check_failure(self, mock_get, sample_server_config):
        """Test failed health check."""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path",
            health_check_url="https://example.com/health"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        result = deployment.perform_health_check()

        assert result is False

    @patch('forge.provision.enhanced_deployment.requests.get')
    def test_enhanced_deployment_health_check_timeout(self, mock_get, sample_server_config):
        """Test health check with timeout."""
        mock_get.side_effect = Exception("Request timeout")

        deployment_config = DeploymentConfig(
            local_path="/local/path",
            remote_path="/remote/path",
            health_check_url="https://example.com/health"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        result = deployment.perform_health_check()

        assert result is False

    def test_enhanced_deployment_backup_deployment(self, sample_server_config, temp_dir):
        """Test creating deployment backup."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path",
            backup_before_deploy=True
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock successful backup
        deployment.deployment_strategy.execute_command.return_value = DeploymentResult(
            success=True,
            message="Backup created"
        )

        result = deployment.create_backup()

        assert result is True
        deployment.deployment_strategy.execute_command.assert_called()

    def test_enhanced_deployment_backup_failure(self, sample_server_config, temp_dir):
        """Test failed deployment backup."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path",
            backup_before_deploy=True
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock failed backup
        deployment.deployment_strategy.execute_command.return_value = DeploymentResult(
            success=False,
            message="Backup failed"
        )

        result = deployment.create_backup()

        assert result is False

    def test_enhanced_deployment_atomic_deployment(self, sample_server_config, temp_dir):
        """Test atomic deployment."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path",
            atomic_deployment=True
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock successful commands
        deployment.deployment_strategy.execute_command.return_value = DeploymentResult(
            success=True,
            message="Command executed"
        )

        result = deployment.perform_atomic_deployment()

        assert result is True
        assert deployment.deployment_strategy.execute_command.call_count >= 2

    def test_enhanced_deployment_rollback_deployment(self, sample_server_config, temp_dir):
        """Test deployment rollback."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock successful rollback
        deployment.deployment_strategy.execute_command.return_value = DeploymentResult(
            success=True,
            message="Rollback completed"
        )

        result = deployment.rollback_to_backup("/backup/path")

        assert result is True

    @patch('forge.provision.enhanced_deployment.EnhancedDeployment.get_git_info')
    def test_enhanced_deployment_deploy_success(self, mock_get_git_info, sample_server_config, temp_dir):
        """Test successful deployment."""
        mock_get_git_info.return_value = {
            "commit_hash": "abc123",
            "author": "Test Author",
            "message": "Test commit"
        }

        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path",
            backup_before_deploy=True,
            atomic_deployment=True
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config, dry_run=True)
        deployment.deployment_strategy = Mock()

        # Mock successful operations
        deployment.deployment_strategy.connect.return_value = True
        deployment.deployment_strategy.upload_files.return_value = DeploymentResult(
            success=True,
            message="Files uploaded",
            details={"files_changed": 10, "bytes_transferred": 1048576}
        )
        deployment.create_backup.return_value = True
        deployment.perform_atomic_deployment.return_value = True
        deployment.perform_health_check.return_value = True

        result = deployment.deploy()

        assert result.success is True
        assert "Deployment completed successfully" in result.message
        assert result.details["version"] is not None
        assert result.details["files_changed"] == 10

    def test_enhanced_deployment_deploy_connection_failure(self, sample_server_config, temp_dir):
        """Test deployment with connection failure."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock connection failure
        deployment.deployment_strategy.connect.return_value = False

        result = deployment.deploy()

        assert result.success is False
        assert "Failed to connect" in result.error

    def test_enhanced_deployment_deploy_upload_failure(self, sample_server_config, temp_dir):
        """Test deployment with upload failure."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock successful connection but failed upload
        deployment.deployment_strategy.connect.return_value = True
        deployment.deployment_strategy.upload_files.return_value = DeploymentResult(
            success=False,
            message="Upload failed",
            error="Permission denied"
        )

        result = deployment.deploy()

        assert result.success is False
        assert "Upload failed" in result.error

    def test_enhanced_deployment_deploy_rollback_on_failure(self, sample_server_config, temp_dir):
        """Test deployment with rollback on failure."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path",
            rollback_on_failure=True
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Mock successful connection and upload but failed health check
        deployment.deployment_strategy.connect.return_value = True
        deployment.deployment_strategy.upload_files.return_value = DeploymentResult(
            success=True,
            message="Files uploaded"
        )
        deployment.create_backup.return_value = True
        deployment.perform_atomic_deployment.return_value = True
        deployment.perform_health_check.return_value = False  # Health check fails
        deployment.rollback_to_backup.return_value = True

        result = deployment.deploy()

        assert result.success is False
        assert "Health check failed" in result.error
        # Rollback should be attempted
        deployment.rollback_to_backup.assert_called_once()

    def test_enhanced_deployment_rollback_to_version(self, sample_server_config, temp_dir):
        """Test rollback to specific version."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.deployment_strategy = Mock()

        # Create a mock version in history
        mock_version = DeploymentVersion(
            version="v1.0.0",
            timestamp=datetime.now(),
            status="success",
            backup_path="/backup/v1.0.0"
        )
        deployment.version_manager = Mock()
        deployment.version_manager.get_version_by_tag.return_value = mock_version

        # Mock successful rollback
        deployment.deployment_strategy.execute_command.return_value = DeploymentResult(
            success=True,
            message="Rollback completed"
        )

        result = deployment.rollback("v1.0.0")

        assert result.success is True
        assert "Rollback completed" in result.message
        assert result.details["target_version"] == "v1.0.0"

    def test_enhanced_deployment_rollback_version_not_found(self, sample_server_config, temp_dir):
        """Test rollback to version that doesn't exist."""
        deployment_config = DeploymentConfig(
            local_path=str(temp_dir),
            remote_path="/remote/path"
        )

        deployment = EnhancedDeployment(sample_server_config, deployment_config)
        deployment.version_manager = Mock()
        deployment.version_manager.get_version_by_tag.return_value = None

        result = deployment.rollback("v999.0.0")

        assert result.success is False
        assert "Version v999.0.0 not found" in result.error


class TestCreateDeploymentConfig:
    """Test create_deployment_config function."""

    def test_create_deployment_config_basic(self):
        """Test basic deployment config creation."""
        config = create_deployment_config(
            local_path="/local/path",
            remote_path="/remote/path"
        )

        assert config.local_path == "/local/path"
        assert config.remote_path == "/remote/path"
        assert config.backup_before_deploy is True  # Default
        assert config.atomic_deployment is True  # Default

    def test_create_deployment_config_with_options(self):
        """Test deployment config creation with options."""
        config = create_deployment_config(
            local_path="/local/path",
            remote_path="/remote/path",
            backup_before_deploy=False,
            atomic_deployment=False,
            bandwidth_limit=500,
            checksum_verification=True,
            max_versions_to_keep=15,
            health_check_url="https://example.com/health",
            rollback_on_failure=False,
            excludes=["*.log", "tmp/*"]
        )

        assert config.backup_before_deploy is False
        assert config.atomic_deployment is False
        assert config.bandwidth_limit == 500
        assert config.checksum_verification is True
        assert config.max_versions_to_keep == 15
        assert config.health_check_url == "https://example.com/health"
        assert config.rollback_on_failure is False
        assert config.excludes == ["*.log", "tmp/*"]
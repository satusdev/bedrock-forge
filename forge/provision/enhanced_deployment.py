"""
Enhanced deployment system with version management, rollback, and optimized rsync.

This module provides a comprehensive deployment solution with:
- Optimized rsync deployments with progress tracking
- Version management and deployment history
- Complete rollback functionality
- Atomic deployments with zero-downtime support
- Integration with existing provider system
"""

import os
import json
import time
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any, Union, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib
import tempfile

from .core import ServerConfig, DeploymentResult, DeploymentMethod
from .deployment_strategies import SSHDeployment, FTPDeployment, SFTPDeployment, RsyncDeployment
from ..utils.errors import ForgeError
from ..utils.logging import logger


class DeploymentStatus(Enum):
    """Deployment status enumeration."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class DeploymentVersion:
    """Deployment version information."""
    version: str
    timestamp: datetime
    status: DeploymentStatus
    commit_hash: Optional[str] = None
    author: Optional[str] = None
    message: Optional[str] = None
    files_changed: int = 0
    bytes_transferred: int = 0
    duration_seconds: float = 0.0
    remote_path: str = ""
    backup_path: Optional[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            **asdict(self),
            'timestamp': self.timestamp.isoformat(),
            'status': self.status.value
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DeploymentVersion':
        """Create from dictionary."""
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        data['status'] = DeploymentStatus(data['status'])
        return cls(**data)


@dataclass
class DeploymentConfig:
    """Deployment configuration."""
    local_path: Path
    remote_path: str
    exclude_patterns: List[str] = None
    include_patterns: List[str] = None
    backup_before_deploy: bool = True
    atomic_deployment: bool = True
    bandwidth_limit: Optional[int] = None
    checksum_verification: bool = False
    max_versions_to_keep: int = 10
    pre_deploy_commands: List[str] = None
    post_deploy_commands: List[str] = None
    health_check_url: Optional[str] = None
    rollback_on_failure: bool = True

    def __post_init__(self):
        if self.exclude_patterns is None:
            self.exclude_patterns = [
                '.git', '__pycache__', 'node_modules', '.DS_Store',
                '*.log', '.env', '.ddev', 'tmp', 'cache', '.rsync-partial'
            ]
        if self.include_patterns is None:
            self.include_patterns = []
        if self.pre_deploy_commands is None:
            self.pre_deploy_commands = []
        if self.post_deploy_commands is None:
            self.post_deploy_commands = []


class VersionManager:
    """Manages deployment versions and history."""

    def __init__(self, project_dir: Path):
        self.project_dir = project_dir
        self.deployments_dir = project_dir / ".ddev" / "deployments"
        self.deployments_dir.mkdir(parents=True, exist_ok=True)
        self.history_file = self.deployments_dir / "history.json"

    def load_history(self) -> List[DeploymentVersion]:
        """Load deployment history."""
        if not self.history_file.exists():
            return []

        try:
            with open(self.history_file, 'r') as f:
                data = json.load(f)
            return [DeploymentVersion.from_dict(item) for item in data]
        except Exception as e:
            logger.error(f"Failed to load deployment history: {e}")
            return []

    def save_history(self, history: List[DeploymentVersion]) -> None:
        """Save deployment history."""
        try:
            data = [version.to_dict() for version in history]
            with open(self.history_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save deployment history: {e}")

    def add_version(self, version: DeploymentVersion) -> None:
        """Add a new deployment version."""
        history = self.load_history()
        history.append(version)
        self.save_history(history)

    def get_latest_version(self) -> Optional[DeploymentVersion]:
        """Get the latest deployment version."""
        history = self.load_history()
        return history[-1] if history else None

    def get_version_by_version(self, version_str: str) -> Optional[DeploymentVersion]:
        """Get a specific version by version string."""
        history = self.load_history()
        for version in history:
            if version.version == version_str:
                return version
        return None

    def cleanup_old_versions(self, max_versions: int) -> int:
        """Remove old deployment versions, keeping only the most recent N."""
        history = self.load_history()
        if len(history) <= max_versions:
            return 0

        removed_count = len(history) - max_versions
        history = history[-max_versions:]
        self.save_history(history)

        # Clean up backup directories
        for i in range(removed_count):
            old_version = history[i]
            if old_version.backup_path:
                try:
                    # Remove backup directory on remote server
                    logger.info(f"Cleaning up old backup: {old_version.backup_path}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup old backup {old_version.backup_path}: {e}")

        return removed_count

    def generate_version(self) -> str:
        """Generate a new version string based on timestamp and git hash."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        try:
            # Get git commit hash if available
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, cwd=self.project_dir
            )
            if result.returncode == 0:
                git_hash = result.stdout.strip()
                return f"v{timestamp}_{git_hash}"
        except Exception:
            pass
        return f"v{timestamp}"


class EnhancedDeployment:
    """Enhanced deployment system with version management and rollback."""

    def __init__(self, config: ServerConfig, deployment_config: DeploymentConfig,
                 dry_run: bool = False, verbose: bool = False):
        self.config = config
        self.deployment_config = deployment_config
        self.dry_run = dry_run
        self.verbose = verbose
        self.version_manager = VersionManager(deployment_config.local_path)
        self.deployment_strategy = self._create_deployment_strategy()

    def _create_deployment_strategy(self) -> Union[SSHDeployment, FTPDeployment, SFTPDeployment, RsyncDeployment]:
        """Create appropriate deployment strategy based on configuration."""
        if self.config.deployment_method == DeploymentMethod.RSYNC:
            return RsyncDeployment(
                self.config, self.dry_run, self.verbose,
                bandwidth_limit=self.deployment_config.bandwidth_limit,
                checksum=self.deployment_config.checksum_verification,
                atomic=self.deployment_config.atomic_deployment,
                exclude_patterns=self.deployment_config.exclude_patterns
            )
        elif self.config.deployment_method == DeploymentMethod.SSH:
            return SSHDeployment(self.config, self.dry_run, self.verbose)
        elif self.config.deployment_method == DeploymentMethod.SFTP:
            return SFTPDeployment(self.config, self.dry_run, self.verbose)
        elif self.config.deployment_method == DeploymentMethod.FTP:
            return FTPDeployment(self.config, self.dry_run, self.verbose)
        else:
            raise ForgeError(f"Unsupported deployment method: {self.config.deployment_method}")

    def _create_backup(self, remote_path: str) -> Optional[str]:
        """Create a backup of the remote deployment."""
        if not self.deployment_config.backup_before_deploy:
            return None

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{remote_path}_backup_{timestamp}"

            if self.config.deployment_method in [DeploymentMethod.SSH, DeploymentMethod.RSYNC]:
                # Use SSH to create backup
                cmd = f"cp -r {remote_path} {backup_path}"
                result = self.deployment_strategy.execute_command(cmd)

                if result.success:
                    if self.verbose:
                        logger.info(f"Created backup: {backup_path}")
                    return backup_path
                else:
                    logger.error(f"Failed to create backup: {result.error}")
                    return None
            else:
                logger.warning(f"Backup not supported for {self.config.deployment_method}")
                return None

        except Exception as e:
            logger.error(f"Backup creation failed: {e}")
            return None

    def _execute_pre_deploy_commands(self) -> bool:
        """Execute pre-deployment commands."""
        if not self.deployment_config.pre_deploy_commands:
            return True

        try:
            for cmd in self.deployment_config.pre_deploy_commands:
                if self.verbose:
                    logger.info(f"Executing pre-deploy command: {cmd}")

                result = self.deployment_strategy.execute_command(cmd)
                if not result.success:
                    logger.error(f"Pre-deploy command failed: {cmd} - {result.error}")
                    return False

            return True
        except Exception as e:
            logger.error(f"Pre-deploy commands failed: {e}")
            return False

    def _execute_post_deploy_commands(self) -> bool:
        """Execute post-deployment commands."""
        if not self.deployment_config.post_deploy_commands:
            return True

        try:
            for cmd in self.deployment_config.post_deploy_commands:
                if self.verbose:
                    logger.info(f"Executing post-deploy command: {cmd}")

                result = self.deployment_strategy.execute_command(cmd)
                if not result.success:
                    logger.error(f"Post-deploy command failed: {cmd} - {result.error}")
                    return False

            return True
        except Exception as e:
            logger.error(f"Post-deploy commands failed: {e}")
            return False

    def _perform_health_check(self) -> bool:
        """Perform health check after deployment."""
        if not self.deployment_config.health_check_url:
            return True

        try:
            import requests
            response = requests.get(self.deployment_config.health_check_url, timeout=30)
            if response.status_code == 200:
                if self.verbose:
                    logger.info("Health check passed")
                return True
            else:
                logger.error(f"Health check failed with status code: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    def _get_git_info(self) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Get git commit information."""
        try:
            # Get commit hash
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True, text=True, cwd=self.deployment_config.local_path
            )
            commit_hash = result.stdout.strip() if result.returncode == 0 else None

            # Get commit author
            result = subprocess.run(
                ["git", "log", "-1", "--pretty=format:'%an'"],
                capture_output=True, text=True, cwd=self.deployment_config.local_path
            )
            author = result.stdout.strip().strip("'") if result.returncode == 0 else None

            # Get commit message
            result = subprocess.run(
                ["git", "log", "-1", "--pretty=format:'%s'"],
                capture_output=True, text=True, cwd=self.deployment_config.local_path
            )
            message = result.stdout.strip().strip("'") if result.returncode == 0 else None

            return commit_hash, author, message
        except Exception:
            return None, None, None

    def _count_changed_files(self) -> int:
        """Count the number of changed files."""
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
                capture_output=True, text=True, cwd=self.deployment_config.local_path
            )
            if result.returncode == 0:
                return len([line for line in result.stdout.strip().split('\n') if line.strip()])
        except Exception:
            pass
        return 0

    def deploy(self) -> DeploymentResult:
        """Perform deployment with version management."""
        version_str = self.version_manager.generate_version()
        start_time = time.time()

        # Create deployment version
        commit_hash, author, message = self._get_git_info()
        deployment_version = DeploymentVersion(
            version=version_str,
            timestamp=datetime.now(),
            status=DeploymentStatus.PENDING,
            commit_hash=commit_hash,
            author=author,
            message=message,
            files_changed=self._count_changed_files(),
            remote_path=self.deployment_config.remote_path
        )

        try:
            if self.verbose:
                logger.info(f"Starting deployment {version_str} to {self.config.ip_address}:{self.deployment_config.remote_path}")

            # Update status to in progress
            deployment_version.status = DeploymentStatus.IN_PROGRESS
            self.version_manager.add_version(deployment_version)

            # Create backup
            backup_path = self._create_backup(self.deployment_config.remote_path)
            deployment_version.backup_path = backup_path

            # Execute pre-deploy commands
            if not self._execute_pre_deploy_commands():
                raise ForgeError("Pre-deployment commands failed")

            # Perform the actual deployment
            deploy_result = self.deployment_strategy.upload_files(
                self.deployment_config.local_path,
                self.deployment_config.remote_path
            )

            if not deploy_result.success:
                raise ForgeError(f"Deployment failed: {deploy_result.error}")

            # Extract deployment statistics
            stats = deploy_result.details.get('stats', {})
            deployment_version.bytes_transferred = stats.get('bytes_sent', 0)
            deployment_version.duration_seconds = time.time() - start_time
            deployment_version.metadata.update(deploy_result.details)

            # Execute post-deploy commands
            if not self._execute_post_deploy_commands():
                raise ForgeError("Post-deployment commands failed")

            # Perform health check
            if not self._perform_health_check():
                if self.deployment_config.rollback_on_failure:
                    logger.warning("Health check failed, initiating rollback")
                    self.rollback(version_str)
                    raise ForgeError("Deployment failed health check and was rolled back")
                else:
                    logger.error("Health check failed")
                    raise ForgeError("Deployment failed health check")

            # Mark as successful
            deployment_version.status = DeploymentStatus.SUCCESS
            self.version_manager.add_version(deployment_version)

            # Cleanup old versions
            removed_count = self.version_manager.cleanup_old_versions(
                self.deployment_config.max_versions_to_keep
            )
            if removed_count > 0 and self.verbose:
                logger.info(f"Cleaned up {removed_count} old deployment versions")

            duration = time.time() - start_time
            if self.verbose:
                logger.info(f"Deployment {version_str} completed successfully in {duration:.2f}s")

            return DeploymentResult(
                success=True,
                message=f"Deployment {version_str} completed successfully",
                details={
                    "version": version_str,
                    "duration_seconds": duration,
                    "backup_path": backup_path,
                    "files_changed": deployment_version.files_changed,
                    "bytes_transferred": deployment_version.bytes_transferred,
                    **deploy_result.details
                }
            )

        except Exception as e:
            deployment_version.status = DeploymentStatus.FAILED
            deployment_version.metadata["error"] = str(e)
            self.version_manager.add_version(deployment_version)

            logger.error(f"Deployment {version_str} failed: {e}")
            return DeploymentResult(
                success=False,
                message=f"Deployment {version_str} failed",
                error=str(e),
                details={
                    "version": version_str,
                    "duration_seconds": time.time() - start_time,
                    "backup_path": backup_path
                }
            )

    def rollback(self, target_version: Optional[str] = None) -> DeploymentResult:
        """Rollback to a specific version or previous version."""
        try:
            if target_version:
                # Rollback to specific version
                version = self.version_manager.get_version_by_version(target_version)
                if not version:
                    raise ForgeError(f"Version {target_version} not found")
            else:
                # Rollback to previous successful version
                history = self.version_manager.load_history()
                successful_versions = [v for v in history if v.status == DeploymentStatus.SUCCESS]

                if not successful_versions:
                    raise ForgeError("No successful deployment found to rollback to")

                version = successful_versions[-2] if len(successful_versions) > 1 else successful_versions[-1]
                target_version = version.version

            if self.verbose:
                logger.info(f"Rolling back to version {target_version}")

            if not version.backup_path:
                raise ForgeError(f"No backup available for version {target_version}")

            # Perform rollback
            rollback_cmd = f"rm -rf {self.deployment_config.remote_path} && mv {version.backup_path} {self.deployment_config.remote_path}"
            result = self.deployment_strategy.execute_command(rollback_cmd)

            if result.success:
                # Create rollback version record
                rollback_version = DeploymentVersion(
                    version=f"rollback_{self.version_manager.generate_version()}",
                    timestamp=datetime.now(),
                    status=DeploymentStatus.ROLLED_BACK,
                    message=f"Rolled back to {target_version}",
                    metadata={"rolled_back_from": target_version}
                )
                self.version_manager.add_version(rollback_version)

                if self.verbose:
                    logger.info(f"Successfully rolled back to version {target_version}")

                return DeploymentResult(
                    success=True,
                    message=f"Successfully rolled back to version {target_version}",
                    details={
                        "rollback_version": rollback_version.version,
                        "target_version": target_version
                    }
                )
            else:
                raise ForgeError(f"Rollback command failed: {result.error}")

        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            return DeploymentResult(
                success=False,
                message=f"Rollback to {target_version or 'previous version'} failed",
                error=str(e)
            )

    def get_deployment_history(self, limit: int = 10) -> List[DeploymentVersion]:
        """Get deployment history."""
        history = self.version_manager.load_history()
        return history[-limit:] if limit > 0 else history

    def get_deployment_status(self, version: Optional[str] = None) -> Optional[DeploymentVersion]:
        """Get status of a specific deployment."""
        if version:
            return self.version_manager.get_version_by_version(version)
        else:
            return self.version_manager.get_latest_version()


def create_deployment_config(
    local_path: Union[str, Path],
    remote_path: str,
    **kwargs
) -> DeploymentConfig:
    """Create deployment configuration with sensible defaults."""
    return DeploymentConfig(
        local_path=Path(local_path),
        remote_path=remote_path,
        **kwargs
    )
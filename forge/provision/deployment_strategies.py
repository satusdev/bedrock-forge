"""
Deployment strategy implementations for different protocols.

This module provides concrete implementations of deployment strategies
for SSH, FTP, SFTP, and RSYNC protocols.
"""

import paramiko
import ftplib
import os
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any
from getpass import getpass
from tqdm import tqdm
import time

from .core import DeploymentStrategy, DeploymentResult, DeploymentMethod
from ..utils.errors import ForgeError
from ..utils.logging import logger


class SSHDeployment(DeploymentStrategy):
    """SSH-based deployment strategy using rsync over SSH."""

    def __init__(self, config, dry_run: bool = False, verbose: bool = False):
        super().__init__(config, dry_run, verbose)
        self.client = None

    def connect(self) -> bool:
        """Establish SSH connection."""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            if self.verbose:
                logger.info(f"Connecting to {self.config.ip_address}:{self.config.ssh_port} as {self.config.ssh_user}")

            self.client.connect(
                self.config.ip_address,
                username=self.config.ssh_user,
                key_filename=os.path.expanduser(self.config.ssh_key),
                port=self.config.ssh_port,
                timeout=30
            )

            if self.verbose:
                logger.info("SSH connection established successfully")
            return True

        except Exception as e:
            logger.error(f"SSH connection failed: {str(e)}")
            return False

    def upload_files(self, local_path: Path, remote_path: str) -> DeploymentResult:
        """Upload files using rsync over SSH."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            ssh_key_path = os.path.expanduser(self.config.ssh_key)

            # Build rsync command
            rsync_cmd = [
                "rsync", "-avz", "--delete",
                "-e", f"ssh -i {ssh_key_path} -p {self.config.ssh_port}",
                f"{str(local_path)}/",
                f"{self.config.ssh_user}@{self.config.ip_address}:{remote_path}"
            ]

            if self.verbose:
                logger.info(f"Uploading files with rsync: {' '.join(rsync_cmd)}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {' '.join(rsync_cmd)}")
                return DeploymentResult(
                    success=True,
                    message="Dry run: Files would be uploaded via rsync",
                    details={"command": " ".join(rsync_cmd)}
                )

            # Execute rsync
            result = subprocess.run(rsync_cmd, capture_output=True, text=True, check=True)

            if self.verbose:
                logger.info(f"rsync output: {result.stdout}")

            return DeploymentResult(
                success=True,
                message="Files uploaded successfully via rsync",
                details={"output": result.stdout, "command": " ".join(rsync_cmd)}
            )

        except subprocess.CalledProcessError as e:
            return DeploymentResult(
                success=False,
                message="rsync upload failed",
                error=f"Exit code {e.returncode}: {e.stderr}",
                details={"command": " ".join(rsync_cmd), "output": e.stdout}
            )
        except Exception as e:
            return DeploymentResult(
                success=False,
                message="SSH upload failed",
                error=str(e)
            )

    def download_files(self, remote_path: str, local_path: Path) -> DeploymentResult:
        """Download files using rsync over SSH."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            local_path.mkdir(parents=True, exist_ok=True)
            ssh_key_path = os.path.expanduser(self.config.ssh_key)

            # Build rsync command for download
            rsync_cmd = [
                "rsync", "-avz",
                "-e", f"ssh -i {ssh_key_path} -p {self.config.ssh_port}",
                f"{self.config.ssh_user}@{self.config.ip_address}:{remote_path}/",
                f"{str(local_path)}/"
            ]

            if self.verbose:
                logger.info(f"Downloading files with rsync: {' '.join(rsync_cmd)}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {' '.join(rsync_cmd)}")
                return DeploymentResult(
                    success=True,
                    message="Dry run: Files would be downloaded via rsync",
                    details={"command": " ".join(rsync_cmd)}
                )

            # Execute rsync
            result = subprocess.run(rsync_cmd, capture_output=True, text=True, check=True)

            if self.verbose:
                logger.info(f"rsync output: {result.stdout}")

            return DeploymentResult(
                success=True,
                message="Files downloaded successfully via rsync",
                details={"output": result.stdout, "command": " ".join(rsync_cmd)}
            )

        except subprocess.CalledProcessError as e:
            return DeploymentResult(
                success=False,
                message="rsync download failed",
                error=f"Exit code {e.returncode}: {e.stderr}",
                details={"command": " ".join(rsync_cmd)}
            )
        except Exception as e:
            return DeploymentResult(
                success=False,
                message="SSH download failed",
                error=str(e)
            )

    def execute_command(self, command: str) -> DeploymentResult:
        """Execute command via SSH."""
        try:
            if not self.client:
                if not self.connect():
                    return DeploymentResult(
                        success=False,
                        message="SSH connection not established",
                        error="No active SSH connection"
                    )

            if self.verbose:
                logger.info(f"Executing SSH command: {command}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {command}")
                return DeploymentResult(
                    success=True,
                    message=f"Dry run: Would execute command",
                    details={"command": command}
                )

            stdin, stdout, stderr = self.client.exec_command(command)
            output = stdout.read().decode().strip()
            error = stderr.read().decode().strip()
            exit_code = stdout.channel.recv_exit_status()

            if exit_code != 0:
                return DeploymentResult(
                    success=False,
                    message="Command execution failed",
                    error=f"Exit code {exit_code}: {error}",
                    details={"command": command, "output": output}
                )

            return DeploymentResult(
                success=True,
                message="Command executed successfully",
                details={"command": command, "output": output}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Command execution failed",
                error=str(e),
                details={"command": command}
            )

    def disconnect(self) -> None:
        """Close SSH connection."""
        if self.client:
            self.client.close()
            self.client = None
            if self.verbose:
                logger.info("SSH connection closed")


class FTPDeployment(DeploymentStrategy):
    """FTP-based deployment strategy."""

    def __init__(self, config, dry_run: bool = False, verbose: bool = False):
        super().__init__(config, dry_run, verbose)
        self.ftp = None

    def connect(self) -> bool:
        """Establish FTP connection."""
        try:
            if not self.config.ftp_user or not self.config.ftp_password:
                raise ForgeError("FTP credentials not provided in configuration")

            if self.verbose:
                logger.info(f"Connecting to FTP server {self.config.ip_address}:{self.config.ftp_port}")

            self.ftp = ftplib.FTP()
            self.ftp.connect(self.config.ip_address, self.config.ftp_port, timeout=30)
            self.ftp.login(self.config.ftp_user, self.config.ftp_password)

            if self.verbose:
                logger.info("FTP connection established successfully")
            return True

        except Exception as e:
            logger.error(f"FTP connection failed: {str(e)}")
            return False

    def upload_files(self, local_path: Path, remote_path: str) -> DeploymentResult:
        """Upload files via FTP."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            files_uploaded = 0

            if not self.ftp:
                if not self.connect():
                    return DeploymentResult(
                        success=False,
                        message="FTP connection not established",
                        error="No active FTP connection"
                    )

            # Create remote directory if it doesn't exist
            try:
                self.ftp.mkd(remote_path)
            except ftplib.error_perm:
                pass  # Directory likely already exists

            # Upload all files recursively
            for file_path in tqdm(local_path.rglob("*"), desc="Uploading via FTP", disable=not self.verbose):
                if file_path.is_file():
                    relative_path = file_path.relative_to(local_path)
                    remote_file_path = f"{remote_path}/{relative_path}"

                    # Create remote subdirectories
                    remote_dir = str(remote_file_path.rsplit("/", 1)[0])
                    try:
                        self.ftp.mkd(remote_dir)
                    except ftplib.error_perm:
                        pass  # Directory likely already exists

                    if self.verbose:
                        logger.info(f"Uploading {file_path} to {remote_file_path}")

                    if not self.dry_run:
                        with open(file_path, 'rb') as f:
                            self.ftp.storbinary(f"STOR {remote_file_path}", f)

                    files_uploaded += 1

            return DeploymentResult(
                success=True,
                message=f"Uploaded {files_uploaded} files via FTP",
                details={"files_uploaded": files_uploaded, "remote_path": remote_path}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="FTP upload failed",
                error=str(e)
            )

    def download_files(self, remote_path: str, local_path: Path) -> DeploymentResult:
        """Download files via FTP."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            local_path.mkdir(parents=True, exist_ok=True)
            files_downloaded = 0

            if not self.ftp:
                if not self.connect():
                    return DeploymentResult(
                        success=False,
                        message="FTP connection not established",
                        error="No active FTP connection"
                    )

            def download_file(ftp_file_path, local_file_path):
                with open(local_file_path, 'wb') as f:
                    self.ftp.retrbinary(f"RETR {ftp_file_path}", f.write)

            def list_files(ftp_path):
                try:
                    return self.ftp.nlst(ftp_path)
                except ftplib.error_perm:
                    return []

            def recursive_download(remote_dir, local_dir):
                nonlocal files_downloaded
                local_dir.mkdir(parents=True, exist_ok=True)

                files = list_files(remote_dir)
                for file_item in files:
                    remote_file = f"{remote_dir}/{file_item}"
                    local_file = local_dir / file_item

                    try:
                        # Try to change to the item as a directory
                        original_cwd = self.ftp.pwd()
                        self.ftp.cwd(remote_file)
                        self.ftp.cwd(original_cwd)  # Change back

                        # It's a directory, recurse
                        recursive_download(remote_file, local_file)
                    except ftplib.error_perm:
                        # It's a file, download it
                        if self.verbose:
                            logger.info(f"Downloading {remote_file} to {local_file}")

                        if not self.dry_run:
                            download_file(remote_file, local_file)
                        files_downloaded += 1

            recursive_download(remote_path, local_path)

            return DeploymentResult(
                success=True,
                message=f"Downloaded {files_downloaded} files via FTP",
                details={"files_downloaded": files_downloaded, "local_path": str(local_path)}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="FTP download failed",
                error=str(e)
            )

    def execute_command(self, command: str) -> DeploymentResult:
        """FTP doesn't support command execution."""
        return DeploymentResult(
            success=False,
            message="FTP protocol doesn't support command execution",
            error="Use SSH or SFTP for command execution"
        )

    def disconnect(self) -> None:
        """Close FTP connection."""
        if self.ftp:
            try:
                self.ftp.quit()
            except:
                self.ftp.close()
            self.ftp = None
            if self.verbose:
                logger.info("FTP connection closed")


class SFTPDeployment(DeploymentStrategy):
    """SFTP-based deployment strategy."""

    def __init__(self, config, dry_run: bool = False, verbose: bool = False):
        super().__init__(config, dry_run, verbose)
        self.sftp = None
        self.client = None

    def connect(self) -> bool:
        """Establish SFTP connection."""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            if self.verbose:
                logger.info(f"Connecting to SFTP server {self.config.ip_address}:{self.config.ssh_port}")

            self.client.connect(
                self.config.ip_address,
                username=self.config.ssh_user,
                key_filename=os.path.expanduser(self.config.ssh_key),
                port=self.config.ssh_port,
                timeout=30
            )

            self.sftp = self.client.open_sftp()

            if self.verbose:
                logger.info("SFTP connection established successfully")
            return True

        except Exception as e:
            logger.error(f"SFTP connection failed: {str(e)}")
            return False

    def upload_files(self, local_path: Path, remote_path: str) -> DeploymentResult:
        """Upload files via SFTP."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            files_uploaded = 0

            if not self.sftp:
                if not self.connect():
                    return DeploymentResult(
                        success=False,
                        message="SFTP connection not established",
                        error="No active SFTP connection"
                    )

            # Create remote directory structure
            try:
                self.sftp.mkdir(remote_path)
            except IOError:
                pass  # Directory likely already exists

            # Upload all files recursively
            for file_path in tqdm(local_path.rglob("*"), desc="Uploading via SFTP", disable=not self.verbose):
                if file_path.is_file():
                    relative_path = file_path.relative_to(local_path)
                    remote_file_path = f"{remote_path}/{relative_path}".replace("\\", "/")

                    # Create remote subdirectories
                    remote_dir = str(remote_file_path.rsplit("/", 1)[0])
                    try:
                        self.sftp.mkdir(remote_dir)
                    except IOError:
                        pass  # Directory likely already exists

                    if self.verbose:
                        logger.info(f"Uploading {file_path} to {remote_file_path}")

                    if not self.dry_run:
                        self.sftp.put(str(file_path), remote_file_path)

                    files_uploaded += 1

            return DeploymentResult(
                success=True,
                message=f"Uploaded {files_uploaded} files via SFTP",
                details={"files_uploaded": files_uploaded, "remote_path": remote_path}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="SFTP upload failed",
                error=str(e)
            )

    def download_files(self, remote_path: str, local_path: Path) -> DeploymentResult:
        """Download files via SFTP."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            local_path.mkdir(parents=True, exist_ok=True)
            files_downloaded = 0

            if not self.sftp:
                if not self.connect():
                    return DeploymentResult(
                        success=False,
                        message="SFTP connection not established",
                        error="No active SFTP connection"
                    )

            def recursive_download(remote_dir, local_dir):
                nonlocal files_downloaded
                local_dir.mkdir(parents=True, exist_ok=True)

                for item in self.sftp.listdir_attr(remote_dir):
                    remote_item = f"{remote_dir}/{item.filename}"
                    local_item = local_dir / item.filename

                    if item.st_mode is not None and (item.st_mode & 0o040000):  # Directory
                        recursive_download(remote_item, local_item)
                    else:  # File
                        if self.verbose:
                            logger.info(f"Downloading {remote_item} to {local_item}")

                        if not self.dry_run:
                            self.sftp.get(remote_item, str(local_item))
                        files_downloaded += 1

            recursive_download(remote_path, local_path)

            return DeploymentResult(
                success=True,
                message=f"Downloaded {files_downloaded} files via SFTP",
                details={"files_downloaded": files_downloaded, "local_path": str(local_path)}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="SFTP download failed",
                error=str(e)
            )

    def execute_command(self, command: str) -> DeploymentResult:
        """Execute command via SSH (SFTP uses SSH transport)."""
        if not self.client:
            if not self.connect():
                return DeploymentResult(
                    success=False,
                    message="SFTP connection not established",
                    error="No active SFTP connection"
                )

        try:
            if self.verbose:
                logger.info(f"Executing command via SFTP transport: {command}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {command}")
                return DeploymentResult(
                    success=True,
                    message=f"Dry run: Would execute command",
                    details={"command": command}
                )

            stdin, stdout, stderr = self.client.exec_command(command)
            output = stdout.read().decode().strip()
            error = stderr.read().decode().strip()
            exit_code = stdout.channel.recv_exit_status()

            if exit_code != 0:
                return DeploymentResult(
                    success=False,
                    message="Command execution failed",
                    error=f"Exit code {exit_code}: {error}",
                    details={"command": command, "output": output}
                )

            return DeploymentResult(
                success=True,
                message="Command executed successfully",
                details={"command": command, "output": output}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Command execution failed",
                error=str(e),
                details={"command": command}
            )

    def disconnect(self) -> None:
        """Close SFTP connection."""
        if self.sftp:
            self.sftp.close()
            self.sftp = None
        if self.client:
            self.client.close()
            self.client = None
        if self.verbose:
            logger.info("SFTP connection closed")


class RsyncDeployment(DeploymentStrategy):
    """Optimized rsync deployment strategy with advanced features."""

    def __init__(self, config, dry_run: bool = False, verbose: bool = False,
                 bandwidth_limit: int = None, checksum: bool = False,
                 atomic: bool = True, exclude_patterns: List[str] = None):
        super().__init__(config, dry_run, verbose)
        self.bandwidth_limit = bandwidth_limit
        self.checksum = checksum
        self.atomic = atomic
        self.exclude_patterns = exclude_patterns or [
            '.git', '__pycache__', 'node_modules', '.DS_Store',
            '*.log', '.env', '.ddev', 'tmp', 'cache'
        ]

    def connect(self) -> bool:
        """Rsync doesn't maintain persistent connections."""
        # Rsync creates new connections for each operation
        return True

    def _build_ssh_options(self) -> str:
        """Build SSH options string for rsync."""
        ssh_key_path = os.path.expanduser(self.config.ssh_key)
        ssh_opts = f"-i {ssh_key_path} -p {self.config.ssh_port} -o StrictHostKeyChecking=no -o ServerAliveInterval=60"
        return ssh_opts

    def _build_rsync_command(self, local_path: Path, remote_path: str,
                           dry_run: bool = False, for_backup: bool = False) -> List[str]:
        """Build optimized rsync command."""
        cmd = ["rsync"]

        # Basic options
        if not for_backup:
            cmd.extend(["-avz", "--delete"])
        else:
            cmd.extend(["-avz"])

        # Add checksum option for better integrity checking
        if self.checksum:
            cmd.append("--checksum")

        # Add progress tracking
        if self.verbose:
            cmd.append("--progress")

        # Add bandwidth limiting
        if self.bandwidth_limit:
            cmd.extend(["--bwlimit", str(self.bandwidth_limit)])

        # Add exclude patterns
        for pattern in self.exclude_patterns:
            cmd.extend(["--exclude", pattern])

        # Add atomic deployment support
        if self.atomic and not for_backup:
            cmd.extend(["--partial", "--partial-dir=.rsync-partial"])

        # Add dry run option
        if dry_run:
            cmd.append("--dry-run")

        # SSH options
        cmd.extend(["-e", self._build_ssh_options()])

        # Source and destination
        cmd.extend([f"{str(local_path)}/", f"{self.config.ssh_user}@{self.config.ip_address}:{remote_path}"])

        return cmd

    def _parse_rsync_stats(self, output: str) -> Dict[str, Any]:
        """Parse rsync statistics for progress tracking."""
        stats = {
            'files_transferred': 0,
            'bytes_sent': 0,
            'bytes_received': 0,
            'total_size': 0,
            'speed': 0.0
        }

        try:
            lines = output.split('\n')
            for line in lines:
                if 'Number of files transferred:' in line:
                    stats['files_transferred'] = int(line.split(':')[1].strip())
                elif 'Total bytes sent:' in line:
                    stats['bytes_sent'] = int(line.split(':')[1].replace(',', '').strip())
                elif 'Total bytes received:' in line:
                    stats['bytes_received'] = int(line.split(':')[1].replace(',', '').strip())
                elif 'sent' in line and 'received' in line and 'bytes/sec' in line:
                    # Extract speed: "sent 1,234,567 bytes  received 987,654 bytes  1,234.56 bytes/sec"
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if part == 'bytes/sec' and i > 0:
                            stats['speed'] = float(parts[i-1].replace(',', ''))
                            break
        except Exception as e:
            if self.verbose:
                logger.warning(f"Failed to parse rsync stats: {e}")

        return stats

    def upload_files(self, local_path: Path, remote_path: str) -> DeploymentResult:
        """Upload files using rsync."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            ssh_key_path = os.path.expanduser(self.config.ssh_key)

            # Build rsync command with additional options for better sync
            rsync_cmd = [
                "rsync", "-avz", "--delete", "--progress",
                "-e", f"ssh -i {ssh_key_path} -p {self.config.ssh_port} -o StrictHostKeyChecking=no",
                f"{str(local_path)}/",
                f"{self.config.ssh_user}@{self.config.ip_address}:{remote_path}"
            ]

            if self.verbose:
                logger.info(f"Syncing files with rsync: {' '.join(rsync_cmd)}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {' '.join(rsync_cmd)}")
                return DeploymentResult(
                    success=True,
                    message="Dry run: Files would be synced via rsync",
                    details={"command": " ".join(rsync_cmd)}
                )

            # Execute rsync
            result = subprocess.run(rsync_cmd, capture_output=True, text=True, check=True)

            if self.verbose:
                logger.info(f"rsync output: {result.stdout}")

            return DeploymentResult(
                success=True,
                message="Files synced successfully via rsync",
                details={"output": result.stdout, "command": " ".join(rsync_cmd)}
            )

        except subprocess.CalledProcessError as e:
            return DeploymentResult(
                success=False,
                message="rsync sync failed",
                error=f"Exit code {e.returncode}: {e.stderr}",
                details={"command": " ".join(rsync_cmd), "output": e.stdout}
            )
        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Rsync upload failed",
                error=str(e)
            )

    def download_files(self, remote_path: str, local_path: Path) -> DeploymentResult:
        """Download files using rsync."""
        try:
            local_path = Path(local_path).expanduser().resolve()
            local_path.mkdir(parents=True, exist_ok=True)
            ssh_key_path = os.path.expanduser(self.config.ssh_key)

            rsync_cmd = [
                "rsync", "-avz", "--progress",
                "-e", f"ssh -i {ssh_key_path} -p {self.config.ssh_port} -o StrictHostKeyChecking=no",
                f"{self.config.ssh_user}@{self.config.ip_address}:{remote_path}/",
                f"{str(local_path)}/"
            ]

            if self.verbose:
                logger.info(f"Downloading files with rsync: {' '.join(rsync_cmd)}")

            if self.dry_run:
                logger.info(f"Dry run: Would execute: {' '.join(rsync_cmd)}")
                return DeploymentResult(
                    success=True,
                    message="Dry run: Files would be downloaded via rsync",
                    details={"command": " ".join(rsync_cmd)}
                )

            result = subprocess.run(rsync_cmd, capture_output=True, text=True, check=True)

            if self.verbose:
                logger.info(f"rsync output: {result.stdout}")

            return DeploymentResult(
                success=True,
                message="Files downloaded successfully via rsync",
                details={"output": result.stdout, "command": " ".join(rsync_cmd)}
            )

        except subprocess.CalledProcessError as e:
            return DeploymentResult(
                success=False,
                message="rsync download failed",
                error=f"Exit code {e.returncode}: {e.stderr}",
                details={"command": " ".join(rsync_cmd)}
            )
        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Rsync download failed",
                error=str(e)
            )

    def execute_command(self, command: str) -> DeploymentResult:
        """Rsync doesn't support command execution directly."""
        return DeploymentResult(
            success=False,
            message="Rsync protocol doesn't support command execution",
            error="Use SSH deployment for command execution"
        )

    def disconnect(self) -> None:
        """Rsync doesn't maintain persistent connections."""
        pass
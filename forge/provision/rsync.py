import subprocess
import os
import re
from pathlib import Path
from ..utils.errors import ForgeError
from ..utils.logging import logger
from typing import List, Optional, Dict, Any
import shlex
import time

class RsyncTransfer:
    """Enhanced Rsync wrapper for efficient file transfers with progress tracking."""

    def __init__(self, ssh_key: str, ssh_port: int = 22, timeout: int = 300, verbose: bool = False):
        """
        Initialize Rsync transfer manager.

        Args:
            ssh_key: Path to SSH private key
            ssh_port: SSH port for remote connections
            timeout: Transfer timeout in seconds
            verbose: Enable verbose logging
        """
        self.ssh_key = os.path.expanduser(ssh_key)
        self.ssh_port = ssh_port
        self.timeout = timeout
        self.verbose = verbose

    def _build_rsync_command(self, source: str, destination: str, options: List[str] = None,
                           exclude_patterns: List[str] = None, bandwidth_limit: int = None) -> List[str]:
        """Build rsync command with appropriate options."""
        if options is None:
            options = ['-a', '-z', '--delete']

        if exclude_patterns is None:
            exclude_patterns = ['.git', '__pycache__', 'node_modules', '.DS_Store', '*.log']

        # Base rsync command
        cmd = ['rsync']

        # Add options
        cmd.extend(options)

        # Add exclude patterns
        for pattern in exclude_patterns:
            cmd.extend(['--exclude', pattern])

        # Add SSH options
        ssh_opts = ['-i', self.ssh_key, '-p', str(self.ssh_port), '-o', 'StrictHostKeyChecking=no']
        if bandwidth_limit:
            ssh_opts.extend(['-l', str(bandwidth_limit)])

        cmd.extend(['-e', ' '.join(ssh_opts)])

        # Add source and destination
        cmd.extend([source, destination])

        return cmd

    def _parse_rsync_output(self, output: str) -> Dict[str, Any]:
        """Parse rsync output to extract transfer statistics."""
        stats = {
            'files_transferred': 0,
            'files_created': 0,
            'files_deleted': 0,
            'bytes_sent': 0,
            'bytes_received': 0,
            'transfer_rate': 0,
            'total_size': 0
        }

        # Parse various rsync statistics
        patterns = {
            'files_transferred': r'Number of files transferred:\s+(\d+)',
            'files_created': r'Number of created files:\s+(\d+)',
            'files_deleted': r'Number of deleted files:\s+(\d+)',
            'bytes_sent': r'Total bytes sent:\s+([\d,]+)',
            'bytes_received': r'Total bytes received:\s+([\d,]+)',
            'transfer_rate': r'sent ([\d,\.]+) bytes/sec',
            'total_size': r'Total file size:\s+([\d,\.]+)\s+bytes'
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, output)
            if match:
                value = match.group(1).replace(',', '')
                try:
                    if '.' in value:
                        stats[key] = float(value)
                    else:
                        stats[key] = int(value)
                except ValueError:
                    pass

        return stats

    def transfer(self, source: str, destination: str, dry_run: bool = False,
                 exclude_patterns: List[str] = None, bandwidth_limit: int = None,
                 progress_callback: callable = None) -> Dict[str, Any]:
        """
        Transfer files using rsync with progress tracking.

        Args:
            source: Source path (local)
            destination: Destination path (local or remote)
            dry_run: Perform a dry run without actual transfer
            exclude_patterns: Patterns to exclude from transfer
            bandwidth_limit: Bandwidth limit in KB/s
            progress_callback: Callback function for progress updates

        Returns:
            Dictionary with transfer statistics
        """
        if not os.path.exists(source):
            raise ForgeError(f"Source path does not exist: {source}")

        # Build rsync command
        options = ['-a', '-z', '--stats', '--human-readable']
        if dry_run:
            options.append('--dry-run')
        else:
            options.extend(['--delete', '--progress'])

        cmd = self._build_rsync_command(source, destination, options, exclude_patterns, bandwidth_limit)

        if self.verbose:
            logger.info(f"Running rsync command: {' '.join(cmd)}")

        result = {
            'success': False,
            'dry_run': dry_run,
            'command': ' '.join(cmd),
            'output': '',
            'error': '',
            'stats': {}
        }

        try:
            # Run rsync command
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            # Monitor progress
            output_lines = []
            error_lines = []
            start_time = time.time()

            while True:
                # Read stdout
                if process.poll() is None:  # Process is still running
                    try:
                        # Non-blocking read
                        line = process.stdout.readline()
                        if line:
                            output_lines.append(line.strip())
                            if self.verbose:
                                logger.info(f"rsync: {line.strip()}")

                            # Check for progress information
                            if progress_callback and ('to-check=' in line or 'sent' in line.lower()):
                                progress_callback(line.strip())

                    except:
                        pass

                if process.poll() is not None:  # Process has finished
                    break

                # Check timeout
                if time.time() - start_time > self.timeout:
                    process.terminate()
                    raise ForgeError(f"rsync transfer timed out after {self.timeout} seconds")

            # Get remaining output
            remaining_stdout, remaining_stderr = process.communicate()
            output_lines.extend(remaining_stdout.split('\n'))
            error_lines.extend(remaining_stderr.split('\n'))

            result['output'] = '\n'.join(output_lines)
            result['error'] = '\n'.join(error_lines)

            if process.returncode == 0:
                result['success'] = True
                result['stats'] = self._parse_rsync_output(result['output'])

                if self.verbose:
                    logger.info(f"rsync transfer completed successfully")
                    if result['stats']:
                        logger.info(f"Transfer stats: {result['stats']}")
            else:
                raise ForgeError(f"rsync failed with return code {process.returncode}: {result['error']}")

        except subprocess.TimeoutExpired:
            raise ForgeError(f"rsync transfer timed out after {self.timeout} seconds")
        except Exception as e:
            raise ForgeError(f"rsync transfer failed: {str(e)}")

        return result

    def sync_to_remote(self, local_path: str, server_ip: str, ssh_user: str, remote_path: str,
                      dry_run: bool = False, exclude_patterns: List[str] = None,
                      bandwidth_limit: int = None, progress_callback: callable = None) -> Dict[str, Any]:
        """
        Sync local directory to remote server.

        Args:
            local_path: Local source path
            server_ip: Remote server IP
            ssh_user: SSH username
            remote_path: Remote destination path
            dry_run: Perform dry run
            exclude_patterns: Patterns to exclude
            bandwidth_limit: Bandwidth limit in KB/s
            progress_callback: Progress callback function

        Returns:
            Transfer statistics
        """
        # Remove trailing slash from local path if present
        local_source = local_path.rstrip('/')
        remote_dest = f"{ssh_user}@{server_ip}:{remote_path}"

        return self.transfer(
            source=local_source + '/',
            destination=remote_dest,
            dry_run=dry_run,
            exclude_patterns=exclude_patterns,
            bandwidth_limit=bandwidth_limit,
            progress_callback=progress_callback
        )

    def sync_from_remote(self, server_ip: str, ssh_user: str, remote_path: str, local_path: str,
                        dry_run: bool = False, exclude_patterns: List[str] = None,
                        bandwidth_limit: int = None, progress_callback: callable = None) -> Dict[str, Any]:
        """
        Sync remote directory to local.

        Args:
            server_ip: Remote server IP
            ssh_user: SSH username
            remote_path: Remote source path
            local_path: Local destination path
            dry_run: Perform dry run
            exclude_patterns: Patterns to exclude
            bandwidth_limit: Bandwidth limit in KB/s
            progress_callback: Progress callback function

        Returns:
            Transfer statistics
        """
        remote_source = f"{ssh_user}@{server_ip}:{remote_path}"
        local_dest = local_path.rstrip('/')

        return self.transfer(
            source=remote_source,
            destination=local_dest,
            dry_run=dry_run,
            exclude_patterns=exclude_patterns,
            bandwidth_limit=bandwidth_limit,
            progress_callback=progress_callback
        )

def sync_files(local_path: str, server_ip: str, ssh_user: str, ssh_key: str, remote_path: str,
               dry_run: bool = False, verbose: bool = False, ssh_port: int = 22,
               exclude_patterns: List[str] = None, bandwidth_limit: int = None,
               direction: str = "upload") -> Dict[str, Any]:
    """
    Sync files using rsync with enhanced error handling.

    Args:
        local_path: Local path
        server_ip: Server IP address
        ssh_user: SSH username
        ssh_key: SSH private key path
        remote_path: Remote path
        dry_run: Perform dry run
        verbose: Enable verbose logging
        ssh_port: SSH port
        exclude_patterns: Patterns to exclude
        bandwidth_limit: Bandwidth limit in KB/s
        direction: Transfer direction ("upload" or "download")

    Returns:
        Dictionary with transfer results
    """
    if not os.path.exists(local_path) and direction == "upload":
        raise ForgeError(f"Local path does not exist: {local_path}")

    if direction not in ["upload", "download"]:
        raise ForgeError("Direction must be 'upload' or 'download'")

    if verbose:
        logger.info(f"Syncing files {direction}: {local_path} <-> {server_ip}:{remote_path}")

    # Create rsync transfer manager
    rsync = RsyncTransfer(
        ssh_key=ssh_key,
        ssh_port=ssh_port,
        timeout=600,  # 10 minutes timeout
        verbose=verbose
    )

    def progress_callback(line: str):
        """Simple progress callback."""
        if verbose and 'sent' in line.lower() or 'received' in line.lower():
            logger.info(f"Progress: {line}")

    try:
        if direction == "upload":
            result = rsync.sync_to_remote(
                local_path=local_path,
                server_ip=server_ip,
                ssh_user=ssh_user,
                remote_path=remote_path,
                dry_run=dry_run,
                exclude_patterns=exclude_patterns,
                bandwidth_limit=bandwidth_limit,
                progress_callback=progress_callback
            )
        else:  # download
            result = rsync.sync_from_remote(
                server_ip=server_ip,
                ssh_user=ssh_user,
                remote_path=remote_path,
                local_path=local_path,
                dry_run=dry_run,
                exclude_patterns=exclude_patterns,
                bandwidth_limit=bandwidth_limit,
                progress_callback=progress_callback
            )

        if verbose:
            if result['success']:
                logger.info(f"rsync {direction} completed successfully")
                if result.get('stats'):
                    stats = result['stats']
                    logger.info(f"Files transferred: {stats.get('files_transferred', 0)}")
                    logger.info(f"Bytes sent: {stats.get('bytes_sent', 0):,}")
                    if stats.get('transfer_rate', 0) > 0:
                        logger.info(f"Transfer rate: {stats['transfer_rate']:,.2f} bytes/sec")
            else:
                logger.error(f"rsync {direction} failed: {result.get('error', 'Unknown error')}")

        return result

    except Exception as e:
        raise ForgeError(f"rsync {direction} failed: {str(e)}")

def test_rsync_connection(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, verbose: bool = False) -> bool:
    """Test rsync connection to remote server."""
    try:
        if verbose:
            logger.info(f"Testing rsync connection to {server_ip}:{ssh_port}")

        # Create a temporary test file
        test_file = "/tmp/bedrock_forge_test.txt"
        with open(test_file, 'w') as f:
            f.write("Bedrock Forge rsync test file")

        try:
            # Try to sync the test file to /tmp on remote server
            result = sync_files(
                local_path=test_file,
                server_ip=server_ip,
                ssh_user=ssh_user,
                ssh_key=ssh_key,
                remote_path="/tmp/",
                dry_run=False,
                verbose=verbose,
                ssh_port=ssh_port,
                direction="upload"
            )

            success = result.get('success', False)

            if verbose:
                if success:
                    logger.info("rsync connection test successful")
                else:
                    logger.error(f"rsync connection test failed: {result.get('error', 'Unknown error')}")

            return success

        finally:
            # Clean up test file
            if os.path.exists(test_file):
                os.remove(test_file)

    except Exception as e:
        if verbose:
            logger.error(f"rsync connection test failed: {str(e)}")
        return False

def create_rsync_exclude_file(exclude_patterns: List[str], temp_dir: str = "/tmp") -> str:
    """Create a temporary exclude file for rsync."""
    exclude_file = os.path.join(temp_dir, f"bedrock_forge_exclude_{int(time.time())}.txt")

    try:
        with open(exclude_file, 'w') as f:
            for pattern in exclude_patterns:
                f.write(f"{pattern}\n")

        return exclude_file

    except Exception as e:
        if os.path.exists(exclude_file):
            os.remove(exclude_file)
        raise ForgeError(f"Failed to create rsync exclude file: {str(e)}")
import ftplib
import paramiko
import os
import hashlib
from ..utils.errors import ForgeError
from ..utils.logging import logger
from typing import Optional, Callable
import stat

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA256 hash of a file."""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

def upload_via_ftp(server_ip: str, ftp_user: str, ftp_password: str, local_path: str, remote_path: str,
                   dry_run: bool = False, verbose: bool = False, passive: bool = True,
                   verify_files: bool = True, exclude_patterns: list = None) -> dict:
    """Upload files to the server via FTP with enhanced error handling and verification."""
    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")

    if exclude_patterns is None:
        exclude_patterns = ['.git', '__pycache__', 'node_modules', '.DS_Store']

    if dry_run:
        logger.info(f"Dry run: Would upload {local_path} to {remote_path} on {server_ip} via FTP")
        return {"status": "dry-run", "files_uploaded": 0}

    upload_stats = {
        "status": "success",
        "files_uploaded": 0,
        "files_skipped": 0,
        "errors": [],
        "total_size": 0
    }

    try:
        with ftplib.FTP(timeout=30) as ftp:
            # Connect with enhanced error handling
            try:
                ftp.connect(server_ip, 21)
                ftp.login(ftp_user, ftp_password)

                if passive:
                    ftp.set_pasv(True)
                else:
                    ftp.set_pasv(False)

                if verbose:
                    logger.info(f"Connected to FTP server {server_ip}")
                    logger.info(f"Current directory: {ftp.pwd()}")

            except ftplib.all_errors as e:
                raise ForgeError(f"FTP connection failed: {str(e)}")

            # Create remote directory structure
            try:
                ftp.cwd(remote_path)
            except ftplib.error_perm:
                # Directory doesn't exist, create it
                try:
                    ftp.mkd(remote_path)
                    ftp.cwd(remote_path)
                    if verbose:
                        logger.info(f"Created remote directory: {remote_path}")
                except ftplib.error_perm as e:
                    raise ForgeError(f"Failed to create remote directory {remote_path}: {str(e)}")

            # Walk through local directory and upload files
            for root, dirs, files in os.walk(local_path):
                # Filter out excluded directories
                dirs[:] = [d for d in dirs if d not in exclude_patterns]

                rel_dir = os.path.relpath(root, local_path)
                if rel_dir == '.':
                    remote_dir = remote_path
                else:
                    remote_dir = os.path.join(remote_path, rel_dir).replace(os.sep, '/')

                # Create remote subdirectories
                if rel_dir != '.':
                    try:
                        ftp.mkd(remote_dir)
                        if verbose:
                            logger.info(f"Created remote subdirectory: {remote_dir}")
                    except ftplib.error_perm:
                        pass  # Directory may already exist

                # Upload files
                for file in files:
                    if any(pattern in file for pattern in exclude_patterns):
                        upload_stats["files_skipped"] += 1
                        continue

                    local_file = os.path.join(root, file)
                    remote_file = os.path.join(remote_dir, file).replace(os.sep, '/')

                    try:
                        # Get file size for progress tracking
                        file_size = os.path.getsize(local_file)
                        upload_stats["total_size"] += file_size

                        if verbose:
                            logger.info(f"Uploading {local_file} -> {remote_file} ({file_size} bytes)")

                        # Upload file with binary mode
                        with open(local_file, 'rb') as f:
                            ftp.storbinary(f"STOR {remote_file}", f, blocksize=8192)

                        upload_stats["files_uploaded"] += 1

                        # Verify file upload if requested
                        if verify_files:
                            remote_size = ftp.size(remote_file)
                            if remote_size != file_size:
                                error_msg = f"File size mismatch for {file}: local={file_size}, remote={remote_size}"
                                upload_stats["errors"].append(error_msg)
                                logger.error(error_msg)

                    except (IOError, ftplib.all_errors) as e:
                        error_msg = f"Failed to upload {file}: {str(e)}"
                        upload_stats["errors"].append(error_msg)
                        logger.error(error_msg)

        if upload_stats["errors"]:
            upload_stats["status"] = "completed_with_errors"
            logger.warning(f"FTP upload completed with {len(upload_stats['errors'])} errors")

        if verbose:
            logger.info(f"FTP upload complete: {upload_stats['files_uploaded']} files uploaded, "
                       f"{upload_stats['files_skipped']} files skipped, "
                       f"{upload_stats['total_size']} bytes total")

        return upload_stats

    except Exception as e:
        raise ForgeError(f"FTP upload failed to {server_ip}:{remote_path}: {str(e)}")

def upload_via_sftp(server_ip: str, ssh_user: str, ssh_key: str, local_path: str, remote_path: str,
                    dry_run: bool = False, verbose: bool = False, ssh_port: int = 22,
                    verify_files: bool = True, exclude_patterns: list = None) -> dict:
    """Upload files to the server via SFTP with enhanced error handling."""
    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")

    if exclude_patterns is None:
        exclude_patterns = ['.git', '__pycache__', 'node_modules', '.DS_Store']

    if dry_run:
        logger.info(f"Dry run: Would upload {local_path} to {remote_path} on {server_ip} via SFTP")
        return {"status": "dry-run", "files_uploaded": 0}

    upload_stats = {
        "status": "success",
        "files_uploaded": 0,
        "files_skipped": 0,
        "errors": [],
        "total_size": 0
    }

    client = None
    sftp = None
    try:
        # Create SSH connection
        from ..cyberpanel import create_ssh_client
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)
        sftp = client.open_sftp()

        if verbose:
            logger.info(f"Connected via SFTP to {server_ip}:{ssh_port}")

        # Create remote directory structure
        try:
            sftp.stat(remote_path)
        except FileNotFoundError:
            # Create directory recursively
            path_parts = remote_path.strip('/').split('/')
            current_path = '/'
            for part in path_parts:
                current_path = os.path.join(current_path, part)
                try:
                    sftp.stat(current_path)
                except FileNotFoundError:
                    sftp.mkdir(current_path)
                    if verbose:
                        logger.info(f"Created remote directory: {current_path}")

        # Walk through local directory and upload files
        for root, dirs, files in os.walk(local_path):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_patterns]

            rel_dir = os.path.relpath(root, local_path)
            if rel_dir == '.':
                remote_dir = remote_path
            else:
                remote_dir = os.path.join(remote_path, rel_dir).replace(os.sep, '/')

            # Create remote subdirectories
            if rel_dir != '.':
                try:
                    sftp.stat(remote_dir)
                except FileNotFoundError:
                    sftp.mkdir(remote_dir)
                    if verbose:
                        logger.info(f"Created remote subdirectory: {remote_dir}")

            # Upload files
            for file in files:
                if any(pattern in file for pattern in exclude_patterns):
                    upload_stats["files_skipped"] += 1
                    continue

                local_file = os.path.join(root, file)
                remote_file = os.path.join(remote_dir, file).replace(os.sep, '/')

                try:
                    # Get file size for progress tracking
                    file_size = os.path.getsize(local_file)
                    upload_stats["total_size"] += file_size

                    if verbose:
                        logger.info(f"Uploading {local_file} -> {remote_file} ({file_size} bytes)")

                    # Upload file
                    sftp.put(local_file, remote_file, callback=None if not verbose else lambda x, y: None)
                    upload_stats["files_uploaded"] += 1

                    # Verify file upload if requested
                    if verify_files:
                        remote_stat = sftp.stat(remote_file)
                        if remote_stat.st_size != file_size:
                            error_msg = f"File size mismatch for {file}: local={file_size}, remote={remote_stat.st_size}"
                            upload_stats["errors"].append(error_msg)
                            logger.error(error_msg)

                        # Set appropriate file permissions
                        if os.access(local_file, os.X_OK):
                            sftp.chmod(remote_file, stat.S_IRWXU | stat.S_IRGRP | stat.S_IROTH)
                        else:
                            sftp.chmod(remote_file, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

                except Exception as e:
                    error_msg = f"Failed to upload {file}: {str(e)}"
                    upload_stats["errors"].append(error_msg)
                    logger.error(error_msg)

    except Exception as e:
        raise ForgeError(f"SFTP upload failed to {server_ip}:{remote_path}: {str(e)}")
    finally:
        if sftp:
            sftp.close()
        if client:
            client.close()

    if upload_stats["errors"]:
        upload_stats["status"] = "completed_with_errors"
        logger.warning(f"SFTP upload completed with {len(upload_stats['errors'])} errors")

    if verbose:
        logger.info(f"SFTP upload complete: {upload_stats['files_uploaded']} files uploaded, "
                   f"{upload_stats['files_skipped']} files skipped, "
                   f"{upload_stats['total_size']} bytes total")

    return upload_stats

def test_ftp_connection(server_ip: str, ftp_user: str, ftp_password: str, passive: bool = True, verbose: bool = False) -> bool:
    """Test FTP connection to server."""
    try:
        with ftplib.FTP(timeout=10) as ftp:
            ftp.connect(server_ip, 21)
            ftp.login(ftp_user, ftp_password)
            if passive:
                ftp.set_pasv(True)
            else:
                ftp.set_pasv(False)

            # Test basic operations
            pwd = ftp.pwd()
            if verbose:
                logger.info(f"FTP connection test successful to {server_ip}, current directory: {pwd}")
            return True

    except Exception as e:
        if verbose:
            logger.error(f"FTP connection test failed: {str(e)}")
        return False

def test_sftp_connection(server_ip: str, ssh_user: str, ssh_key: str, ssh_port: int = 22, verbose: bool = False) -> bool:
    """Test SFTP connection to server."""
    try:
        from ..cyberpanel import create_ssh_client
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)
        sftp = client.open_sftp()
        pwd = sftp.getcwd()
        sftp.close()
        client.close()

        if verbose:
            logger.info(f"SFTP connection test successful to {server_ip}:{ssh_port}, current directory: {pwd}")
        return True

    except Exception as e:
        if verbose:
            logger.error(f"SFTP connection test failed: {str(e)}")
        return False
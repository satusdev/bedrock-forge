import ftplib
import os
from ..utils.errors import ForgeError
from ..utils.logging import logger

def upload_via_ftp(server_ip: str, ftp_user: str, ftp_password: str, local_path: str, remote_path: str, dry_run: bool, verbose: bool) -> None:
    """Upload files to the server via FTP."""
    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")
    
    if dry_run:
        logger.info(f"Dry run: Would upload {local_path} to {remote_path} on {server_ip} via FTP")
        return
    
    try:
        with ftplib.FTP(server_ip, ftp_user, ftp_password, timeout=30) as ftp:
            ftp.cwd(remote_path)
            for root, _, files in os.walk(local_path):
                rel_dir = os.path.relpath(root, local_path)
                remote_dir = os.path.join(remote_path, rel_dir).replace(os.sep, '/')
                try:
                    ftp.mkd(remote_dir)
                except ftplib.error_perm:
                    pass  # Directory may exist
                for file in files:
                    local_file = os.path.join(root, file)
                    remote_file = os.path.join(remote_dir, file).replace(os.sep, '/')
                    with open(local_file, 'rb') as f:
                        ftp.storbinary(f"STOR {remote_file}", f)
                    if verbose:
                        logger.info(f"Uploaded {local_file} to {remote_file}")
    except Exception as e:
        raise ForgeError(f"FTP upload failed to {server_ip}:{remote_path}: {str(e)}")
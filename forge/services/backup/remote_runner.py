"""
Remote backup execution logic.

Handles database and file backups over SSH.
"""
import asyncio
from pathlib import Path
from typing import Optional, Callable

from forge.utils.logging import logger
from forge.utils.ssh import SSHClient
from forge.services.ssh_service import SSHKeyService

from forge.core.backup_types import BackupConfig

class RemoteBackupRunner:
    """
    Executes backup operations on remote servers via SSH.
    """
    def __init__(self, db_session):
        self.db = db_session

    async def _get_ssh_client(self, config: BackupConfig) -> SSHClient:
        """Helper to create SSH client from config with system key fallback."""
        host = config.server_hostname
        port = config.server_ssh_port
        user = config.server_ssh_user
        key_path = config.server_ssh_key_path
        password = config.server_ssh_password
        private_key = config.server_ssh_private_key
        
        # Fallback to System SSH Key if no credentials provided
        if not password and not key_path and not private_key:
            system_keys = await SSHKeyService.get_system_key(self.db)
            if system_keys and system_keys.get("private_key"):
                private_key = system_keys["private_key"]
                logger.info(f"Using system SSH key for backup of {host}")

        return SSHClient(
            host=host, 
            user=user, 
            port=port,
            key_path=key_path,
            password=password,
            private_key=private_key
        )

    async def backup_database(
        self,
        config: BackupConfig,
        temp_dir: Path,
        backup_id: str,
        log: Optional[Callable] = None
    ) -> Optional[Path]:
        """Backup remote database."""
        try:
            dump_filename = f"{backup_id}_database.sql"
            remote_dump_path = f"/tmp/{dump_filename}"
            local_dump_path = temp_dir / dump_filename
            
            ssh = await self._get_ssh_client(config)
            
            loop = asyncio.get_event_loop()
            local_gz_path = local_dump_path.with_suffix('.sql.gz')
            
            def perform_remote_backup():
                nonlocal local_gz_path
                with ssh:
                    # 1. Export DB on remote (compressed)
                    cmd = f"cd '{config.wp_path}' && wp db export - --allow-root | gzip > '{remote_dump_path}.gz'"
                    logger.info(f"Executing remote export: {cmd}")
                    result = ssh.run(cmd)
                    
                    if result.returncode != 0:
                        raise Exception(f"Remote WP-CLI failed: {result.stderr}")
                    
                    # 2. Download dump
                    remote_gz_path = f"{remote_dump_path}.gz"
                    logger.info(f"Downloading dump: {remote_gz_path} -> {local_gz_path}")
                    ssh.download(remote_gz_path, str(local_gz_path))
                    
                    # 3. Cleanup remote
                    ssh.run(f"rm '{remote_gz_path}'")

            if log: await log("Starting remote database backup...")
            await loop.run_in_executor(None, perform_remote_backup)
            
            if local_gz_path.exists():
                return local_gz_path
            
            return None
            
        except Exception as e:
            logger.error(f"Remote DB backup failed: {e}")
            raise

    async def backup_files(
        self,
        config: BackupConfig,
        temp_dir: Path,
        backup_id: str,
        log: Optional[Callable] = None
    ) -> Optional[Path]:
        """Backup remote files."""
        try:
            ssh = await self._get_ssh_client(config)
            
            local_archive_path = temp_dir / f"{backup_id}_files.tar.gz"
            remote_archive_path = f"/tmp/{backup_id}_files.tar.gz"
            
            loop = asyncio.get_event_loop()
            
            def perform_remote_file_backup():
                with ssh:
                    # Check for 'web' directory at root
                    check_web_cmd = f"test -d '{config.wp_path}/web' && echo 'exists'"
                    web_exists_result = ssh.run(check_web_cmd)
                    has_web = "exists" in web_exists_result.stdout.strip()
                    
                    dirs = []
                    if has_web:
                         logger.info("Found remote 'web' directory, backing up entire folder...")
                         dirs.append("web")
                         dirs.append("config")
                         dirs.append(".env")
                    else:
                        dirs = [
                            "web/app/themes",
                            "web/app/plugins",
                            "web/app/mu-plugins",
                            "config",
                            ".env"
                        ]
                        if config.include_uploads:
                            dirs.append("web/app/uploads")

                    excludes = ""
                    if config.exclude_patterns:
                        excludes = " ".join([f"--exclude='{p}'" for p in config.exclude_patterns])
                    
                    dirs_str = " ".join([f"'{d}'" for d in dirs])
                    
                    cmd = f"cd '{config.wp_path}' && tar -czvf '{remote_archive_path}' {excludes} {dirs_str}"
                    logger.info(f"Executing remote file backup: {cmd}")
                    
                    result = ssh.run(cmd)
                    if result.returncode != 0:
                        logger.warning(f"Remote tar warning/error: {result.stderr}")
                    
                    ssh.download(remote_archive_path, str(local_archive_path))
                    # Cleanup
                    ssh.run(f"rm '{remote_archive_path}'")
            
            if log: await log(f"Starting remote file backup for {config.server_hostname}...")
            await loop.run_in_executor(None, perform_remote_file_backup)
            if log: await log("Remote files downloaded successfully.")
            
            if local_archive_path.exists():
                return local_archive_path
            return None

        except Exception as e:
            logger.error(f"Remote file backup failed: {e}")
            raise

"""
Site cloning tasks for Celery.

Clone WordPress sites between environments (staging, production, same/cross server).
"""
from datetime import datetime
from typing import Optional, Dict
import asyncio
import tempfile
import os
from pathlib import Path

from celery import shared_task
from sqlalchemy import select

from ..db import AsyncSessionLocal
from ..db.models.project_server import ProjectServer
from ..db.models.server import Server
from ..db.models.project import Project
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async
from ..utils.ssh import SSHConnection
from ..utils.crypto import decrypt_credential
from ..api.deps import update_task_status
from ..api.dashboard_config import get_dashboard_config
from ..services.backup.storage.gdrive import GoogleDriveStorage


class SiteCloner:
    """
    Handles cloning WordPress sites between environments.
    
    Supports:
    - Same server cloning (e.g., example.com → staging.example.com)
    - Cross-server cloning (Server A → Server B)
    - Automatic CyberPanel website creation
    - Database export/import
    - URL search-replace
    """
    
    def __init__(self, source: ProjectServer, target_server: Server, target_domain: str):
        self.source = source
        self.target_server = target_server
        self.target_domain = target_domain
        self.logs = []
    
    def log(self, message: str, level: str = "info"):
        """Add log message."""
        self.logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message
        })
        getattr(logger, level)(f"[SiteCloner] {message}")
    
    async def create_target_site(self, db) -> dict:
        """Create website on target CyberPanel server."""
        from ..services.cyberpanel_service import CyberPanelService
        
        self.log(f"Creating website {self.target_domain} on {self.target_server.name}")
        
        try:
            service = CyberPanelService.from_server(self.target_server, db)
            result = await service.create_website(
                domain=self.target_domain,
                email=f"admin@{self.target_domain}",
                php_version="8.1",
                ssl=True
            )
            self.log(f"Website created: {result}")
            return {"success": True, "result": result}
        except Exception as e:
            self.log(f"Failed to create website: {e}", "error")
            return {"success": False, "error": str(e)}
    
    def _get_ssh_connection(self, server: Server, owner_id: int) -> SSHConnection:
        """Get SSH connection to a server."""
        ssh_password = server.ssh_password
        ssh_key_path = server.ssh_key_path
        ssh_private_key = server.ssh_private_key
        
        # Attempt decryption
        if ssh_password:
            try:
                ssh_password = decrypt_credential(ssh_password, str(owner_id))
            except:
                pass
        if ssh_private_key:
            try:
                ssh_private_key = decrypt_credential(ssh_private_key, str(owner_id))
            except:
                pass
        
        return SSHConnection(
            server.hostname,
            server.ssh_user,
            ssh_key_path,
            server.ssh_port,
            ssh_password,
            ssh_private_key
        )

    async def set_user_shell_and_password(self, system_user: str, owner_id: int) -> dict:
        """Enable bash shell and set a new password for system user."""
        cmd = (
            f"usermod -s /bin/bash {system_user} && "
            "NEW_PASS=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 14) && "
            f"echo -e \"$NEW_PASS\\n$NEW_PASS\" | passwd {system_user} >/dev/null && "
            "echo \"New password for user: $NEW_PASS\""
        )

        def _run():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                return ssh.run(cmd)

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _run)

        new_password = None
        if result and getattr(result, "stdout", None):
            for line in result.stdout.splitlines():
                if "New password for user:" in line:
                    new_password = line.split("New password for user:", 1)[-1].strip()

        return {"success": True, "password": new_password}

    async def restore_files_archive(self, local_archive: Path, owner_id: int) -> dict:
        """Upload and extract files archive to target path."""
        target_path = f"/home/{self.target_domain}/public_html"
        remote_archive = f"/tmp/forge_files_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.tar.gz"

        def _run():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                ssh.upload(str(local_archive), remote_archive)
                ssh.run(f"mkdir -p '{target_path}'")
                ssh.run(f"tar -xzf '{remote_archive}' -C '{target_path}'")
                ssh.run(f"rm -f '{remote_archive}'", warn=True)

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run)

        return {"success": True, "target_path": target_path}

    async def import_database_dump(self, local_dump: Path, owner_id: int) -> dict:
        """Upload and import database dump on target server."""
        target_path = f"/home/{self.target_domain}/public_html"
        remote_dump = f"/tmp/forge_db_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.sql.gz"

        def _run():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                ssh.upload(str(local_dump), remote_dump)
                sql_path = remote_dump
                if remote_dump.endswith(".gz"):
                    sql_path = remote_dump.replace(".gz", "")
                    ssh.run(f"gunzip -c '{remote_dump}' > '{sql_path}'")

                import_cmd = (
                    f"cd '{target_path}' && "
                    "if command -v wp &> /dev/null; then "
                    f"wp db import '{sql_path}' --allow-root 2>/dev/null || "
                    f"wp db import '{sql_path}' 2>/dev/null; "
                    "else "
                    "DB_NAME=$(grep \"DB_NAME\" wp-config.php | cut -d \"'\" -f 4); "
                    "DB_USER=$(grep \"DB_USER\" wp-config.php | cut -d \"'\" -f 4); "
                    "DB_PASSWORD=$(grep \"DB_PASSWORD\" wp-config.php | cut -d \"'\" -f 4); "
                    "DB_HOST=$(grep \"DB_HOST\" wp-config.php | cut -d \"'\" -f 4); "
                    f"mysql -h \"$DB_HOST\" -u \"$DB_USER\" -p\"$DB_PASSWORD\" \"$DB_NAME\" < '{sql_path}'; "
                    "fi"
                )
                ssh.run(import_cmd)
                ssh.run(f"rm -f '{remote_dump}' '{sql_path}'", warn=True)

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run)

        return {"success": True}

    async def run_bedrock_maintenance(
        self,
        owner_id: int,
        composer_install: bool = True,
        composer_update: bool = False,
        wp_plugin_update: bool = False
    ) -> dict:
        """Run Bedrock maintenance commands."""
        target_path = f"/home/{self.target_domain}/public_html"

        commands = []
        if composer_install:
            commands.append(f"cd '{target_path}' && composer install --no-interaction")
        if composer_update:
            commands.append(f"cd '{target_path}' && composer update --no-interaction")
        if wp_plugin_update:
            commands.append(
                f"cd '{target_path}' && wp plugin update --all --allow-root 2>/dev/null || true"
            )

        def _run():
            results = []
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                for cmd in commands:
                    try:
                        results.append(ssh.run(cmd, warn=True))
                    except Exception:
                        pass
            return results

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run)

        return {"success": True}
    
    async def sync_files(self, source_server: Server, owner_id: int) -> dict:
        """
        Sync files from source to target.
        
        For same-server: Direct local rsync.
        For cross-server: Sync via local worker (Source -> Worker -> Target) to ensure keys work.
        """
        source_path = self.source.wp_path
        target_path = f"/home/{self.target_domain}/public_html"
        
        same_server = source_server.id == self.target_server.id
        
        if same_server:
            self.log(f"Same-server clone: copying {source_path} to {target_path}")
            
            # Use rsync locally on the server
            cmd = f"rsync -avz --exclude='wp-config.php' --exclude='.env' --exclude='node_modules' --exclude='vendor' '{source_path}/' '{target_path}/'"
            
            def _run():
                with self._get_ssh_connection(source_server, owner_id) as ssh:
                    return ssh.run(cmd)
            
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, _run)
            self.log(f"Rsync output: {result.stdout[:500]}...")
            
        else:
            self.log(f"Cross-server clone: {source_server.hostname} → {self.target_server.hostname}")
            self.log("Relaying files through worker to ensure connectivity...")
            
            # Create temp dir on worker
            with tempfile.TemporaryDirectory(prefix="forge_sync_") as temp_dir:
                # 1. Pull from Source
                self.log(f"Pulling files from {source_server.hostname}...")
                
                # We need to construct rsync command locally on the worker
                # This requires access to the SSH keys on the filesystem or using sshpass/key-file logic
                # Since we are inside the worker and may not have the keys as files, 
                # we might need to rely on the SFTP approach or similar if keys are blobs.
                
                # However, SiteCloner uses _get_ssh_connection which uses paramiko.
                # To use rsync locally, we need key files.
                # Currently _get_ssh_connection handles logic.
                
                # Fallback to creating a tarball on source, downloading, and uploading.
                # This is cleaner than managing local rsync keys.
                
                archive_name = f"forge_sync_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.tar.gz"
                remote_archive_src = f"/tmp/{archive_name}"
                local_archive = Path(temp_dir) / archive_name
                remote_archive_tgt = f"/tmp/{archive_name}"
                
                # Create tar on source
                tar_cmd_src = f"cd '{source_path}' && tar -czf '{remote_archive_src}' --exclude='wp-config.php' --exclude='.env' --exclude='node_modules' --exclude='vendor' ."
                
                def _pack():
                    with self._get_ssh_connection(source_server, owner_id) as ssh:
                        return ssh.run(tar_cmd_src)
                
                await asyncio.to_thread(_pack)
                
                # Download
                def _download():
                    with self._get_ssh_connection(source_server, owner_id) as ssh:
                        ssh.download(remote_archive_src, str(local_archive))
                        ssh.run(f"rm -f '{remote_archive_src}'", warn=True)
                        
                await asyncio.to_thread(_download)
                
                # Upload to target
                def _upload():
                    with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                        ssh.upload(str(local_archive), remote_archive_tgt)
                        # Extract
                        ssh.run(f"mkdir -p '{target_path}'")
                        ssh.run(f"tar -xzf '{remote_archive_tgt}' -C '{target_path}'")
                        ssh.run(f"rm -f '{remote_archive_tgt}'", warn=True)
                        
                await asyncio.to_thread(_upload)
                
                self.log("Files synced successfully via archive.")

        return {"success": True, "target_path": target_path}
    
    async def export_database(self, source_server: Server, owner_id: int) -> str:
        """Export WordPress database from source."""
        source_path = self.source.wp_path
        dump_file = f"/tmp/wp_clone_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.sql"
        
        # Use wp db export
        cmd = f"cd '{source_path}' && wp db export '{dump_file}' --allow-root"
        
        self.log(f"Exporting database from {source_path}")
        
        def _run():
            with self._get_ssh_connection(source_server, owner_id) as ssh:
                return ssh.run(cmd)
        
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _run)
        self.log(f"DB export: {result}")
        
        return dump_file
    
    async def import_database(self, dump_file: str, source_server: Server, owner_id: int) -> dict:
        """Import database to target."""
        target_path = f"/home/{self.target_domain}/public_html"
        
        same_server = source_server.id == self.target_server.id
        
        if not same_server:
            # Transfer dump file to target server
            self.log(f"Transferring database dump to {self.target_server.hostname}")
            transfer_cmd = f"scp -o StrictHostKeyChecking=no '{dump_file}' {self.target_server.ssh_user}@{self.target_server.hostname}:{dump_file}"
            
            def _transfer():
                with self._get_ssh_connection(source_server, owner_id) as ssh:
                    return ssh.run(transfer_cmd)
            
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _transfer)
        
        # Import on target
        import_cmd = f"cd '{target_path}' && wp db import '{dump_file}' --allow-root"
        
        self.log(f"Importing database to {target_path}")
        
        def _import():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                return ssh.run(import_cmd)
        
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _import)
        self.log(f"DB import: {result}")
        
        # Cleanup dump file
        cleanup_cmd = f"rm -f '{dump_file}'"
        def _cleanup():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                ssh.run(cleanup_cmd)
            if not same_server:
                with self._get_ssh_connection(source_server, owner_id) as ssh:
                    ssh.run(cleanup_cmd)
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _cleanup)
        
        return {"success": True}
    
    async def search_replace_urls(
        self,
        source_url: str,
        owner_id: int,
        target_url: Optional[str] = None
    ) -> dict:
        """Run wp search-replace for URLs."""
        target_path = f"/home/{self.target_domain}/public_html"
        target_url = target_url or f"https://{self.target_domain}"
        
        # Normalize URLs
        source_url = source_url.rstrip("/")
        target_url = target_url.rstrip("/")
        
        self.log(f"Search-replace: {source_url} → {target_url}")
        
        cmd = f"cd '{target_path}' && wp search-replace '{source_url}' '{target_url}' --all-tables --allow-root"
        
        def _run():
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                return ssh.run(cmd)
        
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _run)
        self.log(f"Search-replace: {result}")
        
        return {"success": True, "result": result}
    
    async def finalize(self, owner_id: int) -> dict:
        """Final steps: clear cache, fix permissions, etc."""
        target_path = f"/home/{self.target_domain}/public_html"
        
        commands = [
            f"chown -R {self.target_domain}:{self.target_domain} '{target_path}'",
            f"cd '{target_path}' && wp cache flush --allow-root 2>/dev/null || true",
            f"cd '{target_path}' && wp rewrite flush --allow-root 2>/dev/null || true"
        ]
        
        self.log("Finalizing clone: fixing permissions and clearing cache")
        
        def _run():
            results = []
            with self._get_ssh_connection(self.target_server, owner_id) as ssh:
                for cmd in commands:
                    try:
                        results.append(ssh.run(cmd))
                    except:
                        pass
            return results
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run)
        
        return {"success": True}


async def _clone_site(
    source_project_server_id: int,
    target_server_id: int,
    target_domain: str,
    target_environment: str,
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_uploads: bool = True,
    search_replace: bool = True
) -> dict:
    """
    Clone a site from source environment to target server.
    """
    async with AsyncSessionLocal() as db:
        # Get source ProjectServer
        source_result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == source_project_server_id)
        )
        source = source_result.scalar_one_or_none()
        
        if not source:
            return {"success": False, "error": "Source environment not found"}
        
        # Get source server
        source_server_result = await db.execute(
            select(Server).where(Server.id == source.server_id)
        )
        source_server = source_server_result.scalar_one_or_none()
        
        # Get target server
        target_server_result = await db.execute(
            select(Server).where(Server.id == target_server_id)
        )
        target_server = target_server_result.scalar_one_or_none()
        
        if not target_server:
            return {"success": False, "error": "Target server not found"}
        
        # Get project for owner_id
        project_result = await db.execute(
            select(Project).where(Project.id == source.project_id)
        )
        project = project_result.scalar_one_or_none()
        owner_id = project.owner_id if project else 1
        
        # Initialize cloner
        cloner = SiteCloner(source, target_server, target_domain)
        
        try:
            # 1. Create target site in CyberPanel (if requested)
            if create_cyberpanel_site:
                site_result = await cloner.create_target_site(db)
                if not site_result.get("success"):
                    return {"success": False, "error": site_result.get("error"), "logs": cloner.logs}
            
            # 2. Sync files
            sync_result = await cloner.sync_files(source_server, owner_id)
            target_path = sync_result.get("target_path")
            
            # 3. Export/import database
            if include_database:
                dump_file = await cloner.export_database(source_server, owner_id)
                await cloner.import_database(dump_file, source_server, owner_id)
            
            # 4. Search-replace URLs
            if search_replace and include_database:
                await cloner.search_replace_urls(source.wp_url, owner_id, f"https://{target_domain}")
            
            # 5. Finalize
            await cloner.finalize(owner_id)
            
            cloner.log(f"Clone completed: {target_domain}")
            
            # 6. Update/Create Database Record (ProjectServer)
            try:
                from ..db.models.project_server import ServerEnvironment
                
                # Check for existing environment link
                env_val = target_environment
                if isinstance(env_val, str):
                    try:
                        env_val = ServerEnvironment(env_val.lower())
                    except ValueError:
                        env_val = ServerEnvironment.staging # fallback
                
                existing_ps_result = await db.execute(
                    select(ProjectServer).where(
                        ProjectServer.project_id == project.id,
                        ProjectServer.environment == env_val
                    )
                )
                existing_ps = existing_ps_result.scalar_one_or_none()

                if existing_ps:
                    # Update existing
                    existing_ps.server_id = target_server.id
                    existing_ps.wp_path = target_path
                    existing_ps.wp_url = f"https://{target_domain}"
                    existing_ps.updated_at = datetime.utcnow()
                    cloner.log(f"Updated existing environment record: {env_val.value}")
                else:
                    # Create new
                    new_ps = ProjectServer(
                        project_id=project.id,
                        server_id=target_server.id,
                        environment=env_val,
                        wp_path=target_path,
                        wp_url=f"https://{target_domain}",
                        is_primary=False # Clones are usually secondary unless specified
                    )
                    db.add(new_ps)
                    cloner.log(f"Created new environment record: {env_val.value}")
                
                await db.commit()
            except Exception as db_e:
                 cloner.log(f"Database update failed (site cloned but DB record missing): {db_e}", "error")
            
            return {
                "success": True,
                "target_domain": target_domain,
                "target_server": target_server.name,
                "target_path": target_path,
                "logs": cloner.logs
            }
            
        except Exception as e:
            cloner.log(f"Clone failed: {str(e)}", "error")
            return {
                "success": False,
                "error": str(e),
                "logs": cloner.logs
            }


async def _clone_site_from_drive(
    project_id: int,
    user_id: int,
    target_server_id: int,
    target_domain: str,
    environment: str,
    backup_timestamp: str,
    source_url: Optional[str] = None,
    target_url: Optional[str] = None,
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_files: bool = True,
    set_shell_user: Optional[str] = None,
    run_composer_install: bool = True,
    run_composer_update: bool = False,
    run_wp_plugin_update: bool = False,
    dry_run: bool = False,
    task_id: Optional[str] = None
) -> dict:
    """Restore a site from Google Drive backups (db + files)."""
    async with AsyncSessionLocal() as db:
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return {"success": False, "error": "Project not found"}

        if task_id:
            update_task_status(task_id, "running", "Validating Drive backups", 5)

        target_server_result = await db.execute(
            select(Server).where(Server.id == target_server_id)
        )
        target_server = target_server_result.scalar_one_or_none()
        if not target_server:
            return {"success": False, "error": "Target server not found"}

        config = get_dashboard_config()
        remote_name = getattr(config, "gdrive_rclone_remote", "gdrive")
        base_path = (getattr(config, "gdrive_base_path", "WebDev/Projects") or "").strip("/")

        backup_root = (project.gdrive_backups_folder_id or "").strip("/")
        if not backup_root:
            project_name = project.name or project.slug
            if not project_name:
                return {"success": False, "error": "Project name missing"}
            backup_root = f"{base_path}/{project_name}/Backups".strip("/")

        storage = GoogleDriveStorage(remote_name=remote_name, base_folder="")
        configured, message = await storage.check_configured()
        if not configured:
            return {"success": False, "error": message}

        timestamp_root = f"{backup_root}/{environment}/{backup_timestamp}".strip("/")
        db_path = None
        files_path = None

        if include_database:
            db_candidates = await storage.list_files(prefix=f"{timestamp_root}/db", max_results=1)
            if not db_candidates:
                return {"success": False, "error": "Database backup not found"}
            db_path = db_candidates[0]

        if include_files:
            files_candidates = await storage.list_files(prefix=f"{timestamp_root}/files", max_results=1)
            if not files_candidates:
                return {"success": False, "error": "Files backup not found"}
            files_path = files_candidates[0]

        temp_dir = Path(tempfile.mkdtemp(prefix="forge_drive_restore_"))

        local_db = None
        local_files = None

        if db_path:
            local_db = temp_dir / Path(db_path).name
            result = await storage.download(db_path, local_db)
            if not result.success:
                return {"success": False, "error": result.error or "Failed to download DB backup"}

        if files_path:
            local_files = temp_dir / Path(files_path).name
            result = await storage.download(files_path, local_files)
            if not result.success:
                return {"success": False, "error": result.error or "Failed to download files backup"}

        if task_id:
            update_task_status(task_id, "running", "Backups downloaded", 40)

        if dry_run:
            staged = {
                "db": {
                    "path": str(local_db) if local_db else None,
                    "size": local_db.stat().st_size if local_db and local_db.exists() else 0
                },
                "files": {
                    "path": str(local_files) if local_files else None,
                    "size": local_files.stat().st_size if local_files and local_files.exists() else 0
                }
            }
            if task_id:
                update_task_status(
                    task_id,
                    "completed",
                    "Dry-run complete (downloads staged)",
                    100,
                    {"staged": staged}
                )
            return {
                "success": True,
                "dry_run": True,
                "staged": staged
            }

        owner_id = project.owner_id or user_id
        cloner = SiteCloner(
            source=None,
            target_server=target_server,
            target_domain=target_domain
        )

        try:
            if create_cyberpanel_site:
                from ..services.cyberpanel_service import CyberPanelService
                service = await CyberPanelService.from_server(target_server, db)
                result = await service.create_website(
                    domain=target_domain,
                    email=f"admin@{target_domain}",
                    php_version="8.1",
                    ssl=True
                )
                if not result.get("success"):
                    return {"success": False, "error": result.get("error")}

            if include_files and local_files:
                await cloner.restore_files_archive(local_files, owner_id)

            if include_database and local_db:
                await cloner.import_database_dump(local_db, owner_id)

            if source_url:
                await cloner.search_replace_urls(
                    source_url,
                    owner_id,
                    target_url or f"https://{target_domain}"
                )

            await cloner.run_bedrock_maintenance(
                owner_id,
                composer_install=run_composer_install,
                composer_update=run_composer_update,
                wp_plugin_update=run_wp_plugin_update
            )

            await cloner.finalize(owner_id)

            password_result = None
            if set_shell_user:
                password_result = await cloner.set_user_shell_and_password(
                    set_shell_user,
                    owner_id
                )

            if task_id:
                update_task_status(task_id, "completed", "Drive clone completed", 100)

            # Update/Create Database Record (ProjectServer)
            try:
                from ..db.models.project_server import ServerEnvironment
                
                # Check for existing environment link
                env_val = environment
                if isinstance(env_val, str):
                    try:
                        env_val = ServerEnvironment(env_val.lower())
                    except ValueError:
                        env_val = ServerEnvironment.staging # fallback
                
                target_path = f"/home/{target_domain}/public_html"
                
                existing_ps_result = await db.execute(
                    select(ProjectServer).where(
                        ProjectServer.project_id == project.id,
                        ProjectServer.environment == env_val
                    )
                )
                existing_ps = existing_ps_result.scalar_one_or_none()

                if existing_ps:
                    # Update existing
                    existing_ps.server_id = target_server.id
                    existing_ps.wp_path = target_path
                    existing_ps.wp_url = f"https://{target_domain}"
                    existing_ps.updated_at = datetime.utcnow()
                    logger.info(f"Drive Restore: Updated existing environment record: {env_val.value}")
                else:
                    # Create new
                    new_ps = ProjectServer(
                        project_id=project.id,
                        server_id=target_server.id,
                        environment=env_val,
                        wp_path=target_path,
                        wp_url=f"https://{target_domain}",
                        is_primary=False
                    )
                    db.add(new_ps)
                    logger.info(f"Drive Restore: Created new environment record: {env_val.value}")
                
                await db.commit()
            except Exception as db_e:
                 logger.error(f"Drive Restore: Database update failed: {db_e}")

            return {
                "success": True,
                "target_domain": target_domain,
                "target_server": target_server.name,
                "password": password_result.get("password") if password_result else None
            }
        finally:
            if not dry_run:
                try:
                    if local_db and local_db.exists():
                        local_db.unlink()
                    if local_files and local_files.exists():
                        local_files.unlink()
                    temp_dir.rmdir()
                except Exception:
                    pass


@shared_task
def clone_site(
    source_project_server_id: int,
    target_server_id: int,
    target_domain: str,
    target_environment: str = "staging",
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_uploads: bool = True,
    search_replace: bool = True
):
    """
    Clone a WordPress site between environments.
    
    Celery task for asynchronous site cloning.
    """
    logger.info(f"Starting clone: ProjectServer {source_project_server_id} → {target_domain} ({target_environment})")
    
    result = run_async(_clone_site(
        source_project_server_id,
        target_server_id,
        target_domain,
        target_environment,
        create_cyberpanel_site,
        include_database,
        include_uploads,
        search_replace
    ))
    
    if result.get("success"):
        logger.info(f"Clone completed successfully: {target_domain}")
    else:
        logger.error(f"Clone failed: {result.get('error')}")
    
    return result


@shared_task
def clone_site_from_drive(
    project_id: int,
    user_id: int,
    target_server_id: int,
    target_domain: str,
    environment: str,
    backup_timestamp: str,
    source_url: Optional[str] = None,
    target_url: Optional[str] = None,
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_files: bool = True,
    set_shell_user: Optional[str] = None,
    run_composer_install: bool = True,
    run_composer_update: bool = False,
    run_wp_plugin_update: bool = False,
    dry_run: bool = False,
    task_id: Optional[str] = None
):
    """Clone a site from Google Drive backups."""
    result = run_async(_clone_site_from_drive(
        project_id,
        user_id,
        target_server_id,
        target_domain,
        environment,
        backup_timestamp,
        source_url,
        target_url,
        create_cyberpanel_site,
        include_database,
        include_files,
        set_shell_user,
        run_composer_install,
        run_composer_update,
        run_wp_plugin_update,
        dry_run,
        task_id
    ))

    if result.get("success"):
        logger.info(f"Drive clone completed: {target_domain}")
    else:
        logger.error(f"Drive clone failed: {result.get('error')}")

    return result

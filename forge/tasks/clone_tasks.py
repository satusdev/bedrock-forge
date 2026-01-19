"""
Site cloning tasks for Celery.

Clone WordPress sites between environments (staging, production, same/cross server).
"""
from datetime import datetime
from typing import Optional, Dict
import asyncio
import tempfile
import os

from celery import shared_task
from sqlalchemy import select

from ..db import AsyncSessionLocal
from ..db.models.project_server import ProjectServer
from ..db.models.server import Server
from ..db.models.project import Project
from ..utils.logging import logger
from ..utils.ssh import SSHConnection
from ..utils.crypto import decrypt_credential


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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
    
    async def sync_files(self, source_server: Server, owner_id: int) -> dict:
        """
        Sync files from source to target using rsync.
        
        For same-server: Direct copy
        For cross-server: rsync over SSH
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
            self.log(f"Rsync output: {result[:500]}...")
            
        else:
            self.log(f"Cross-server clone: {source_server.hostname} → {self.target_server.hostname}")
            
            # rsync from source to target over SSH 
            # This requires source server to have SSH access to target
            cmd = f"rsync -avz -e 'ssh -o StrictHostKeyChecking=no' --exclude='wp-config.php' --exclude='.env' --exclude='node_modules' --exclude='vendor' '{source_path}/' {self.target_server.ssh_user}@{self.target_server.hostname}:'{target_path}/'"
            
            def _run():
                with self._get_ssh_connection(source_server, owner_id) as ssh:
                    return ssh.run(cmd)
            
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, _run)
            self.log(f"Rsync output: {result[:500]}...")
        
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
    
    async def search_replace_urls(self, source_url: str, owner_id: int) -> dict:
        """Run wp search-replace for URLs."""
        target_path = f"/home/{self.target_domain}/public_html"
        target_url = f"https://{self.target_domain}"
        
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
                await cloner.search_replace_urls(source.wp_url, owner_id)
            
            # 5. Finalize
            await cloner.finalize(owner_id)
            
            cloner.log(f"Clone completed: {target_domain}")
            
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


@shared_task
def clone_site(
    source_project_server_id: int,
    target_server_id: int,
    target_domain: str,
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_uploads: bool = True,
    search_replace: bool = True
):
    """
    Clone a WordPress site between environments.
    
    Celery task for asynchronous site cloning.
    """
    logger.info(f"Starting clone: ProjectServer {source_project_server_id} → {target_domain}")
    
    result = run_async(_clone_site(
        source_project_server_id,
        target_server_id,
        target_domain,
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

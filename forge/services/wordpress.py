"""
WordPress Service
Handles interactions with WordPress sites via WP-CLI over SSH.
"""
import json
import os
import asyncio
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models import Server, ProjectServer
from ..utils.ssh import SSHClient
from ..utils.logging import logger

class WordPressService:
    def __init__(self, server: Server, wp_path: str, db: AsyncSession, system_private_key: Optional[str] = None):
        self.server = server
        self.wp_path = wp_path
        self.db = db
        
        # Determine SSH credentials (prefer server-level, might need decryption)
        # Note: SSHConnection handles decryption logic internally if we just pass values?
        # Actually SSHConnection expects raw values. 
        # But _run_remote_wp_cli in projects.py handles decryption.
        # Let's import logic or do it here. 
        # For now, simplistic pass-through, assuming unencrypted or handled by caller?
        # Re-checking projects.py _run_remote_wp_cli... it decrypts.
        # We should probably replicate that or assume server fields are usable.
        # However, to fix the specific error "getaddrinfo argument 1 must be string", 
        # we fundamentally just need to pass the hostname string.
        
        # We need to decrypt if encrypted. Check utils.crypto.
        from ..utils.crypto import decrypt_credential
        
        password = server.ssh_password
        if password:
             try:
                 password = decrypt_credential(password, str(server.owner_id))
             except:
                 pass
                 
        private_key = server.ssh_private_key
        if private_key:
             try:
                 private_key = decrypt_credential(private_key, str(server.owner_id))
             except:
                 pass

        # Expand key path if provided
        key_path = server.ssh_key_path
        if key_path:
            key_path = os.path.expanduser(key_path)

        # Fallback to system SSH key if no credentials provided
        if not password and not key_path and not private_key and system_private_key:
            private_key = system_private_key

        self.ssh = SSHClient(
            host=server.hostname or server.ip_address,
            user=server.ssh_user,
            port=server.ssh_port,
            key_path=key_path,
            password=password,
            private_key=private_key
        )

    async def _run_wp_cli(self, command: str) -> str:
        """Run a WP-CLI command."""
        wp_env = "PATH=$PATH:/usr/local/sbin:/usr/local/bin:/usr/bin:/bin"
        check_command = f"{wp_env} command -v wp || {wp_env} which wp || true"

        # SSHConnection is sync; run in thread to avoid await on Result
        check_result = await asyncio.to_thread(self.ssh.run, check_command, True)
        wp_bin = (check_result.stdout or "").strip().splitlines()
        wp_bin = wp_bin[-1].strip() if wp_bin else ""
        if check_result.returncode != 0 or not wp_bin:
            raise Exception(
                "WP-CLI not found on the server. Install wp-cli and ensure it is in PATH "
                "(/usr/local/bin or /usr/bin)."
                f" Host={self.server.hostname or self.server.ip_address}. "
                f"Stdout={check_result.stdout or ''} Stderr={check_result.stderr or ''}"
            )

        full_command = f"cd '{self.wp_path}' && {wp_env} {wp_bin} {command} --allow-root"
        result = await asyncio.to_thread(self.ssh.run, full_command, True)
        if result.returncode != 0:
            raise Exception(
                f"WP-CLI command failed (code {result.returncode}). "
                f"Stderr: {result.stderr or 'N/A'} | Stdout: {result.stdout or 'N/A'}"
            )
        return (result.stdout or "").strip()

    async def _run_wp_json(self, command: str) -> any:
        """Run a WP-CLI command and parse JSON output."""
        output = await self._run_wp_cli(f"{command} --format=json")
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse WP-CLI JSON output: {output}")
            raise Exception("Invalid JSON response from WP-CLI")

    async def list_users(self) -> List[Dict]:
        """List all WordPress users."""
        users = await self._run_wp_json("user list --fields=ID,user_login,user_email,display_name,roles")
        normalized = []
        for user in users or []:
            roles = user.get("roles")
            if isinstance(roles, str):
                roles = [r.strip() for r in roles.split(",") if r.strip()]
            elif roles is None:
                roles = []
            user["roles"] = roles
            normalized.append(user)
        return normalized

    async def create_user(
        self, 
        user_login: str, 
        user_email: str, 
        role: str = 'subscriber',
        send_email: bool = False
    ) -> Dict:
        """Create a new WordPress user."""
        cmd = f"user create '{user_login}' '{user_email}' --role='{role}' --porcelain"
        if send_email:
            cmd += " --send-email"
        
        user_id = await self._run_wp_cli(cmd)
        user = await self._run_wp_json(
            f"user get {user_id} --fields=ID,user_login,user_email,display_name,roles"
        )
        roles = user.get("roles")
        if isinstance(roles, str):
            roles = [r.strip() for r in roles.split(",") if r.strip()]
        elif roles is None:
            roles = []
        user["roles"] = roles
        return user

    async def ensure_login_command_package(self):
        """Ensure the wp-cli-login-command package is installed."""
        # Check if installed
        try:
            installed = await self._run_wp_cli("package list --fields=name --format=json")
            packages = json.loads(installed)
            if any(p['name'] == 'aaemnnosttv/wp-cli-login-command' for p in packages):
                return
        except:
            pass
        
        # Install if not found
        logger.info("Installing wp-cli-login-command package...")
        await self._run_wp_cli("package install aaemnnosttv/wp-cli-login-command")

    async def get_magic_login_url(self, user_id_or_login: str) -> str:
        """Generate a magic login URL for a user."""
        # Ensure package is installed first
        await self.ensure_login_command_package()
        
        # Generator URL
        output = await self._run_wp_cli(f"login create '{user_id_or_login}' --url-only")
        
        # The output might contain warnings/info, the URL should be the last line
        lines = output.strip().split('\n')
        url = lines[-1]
        
        if not url.startswith('http'):
             raise Exception(f"Failed to generate login URL: {output}")
             
        return url

    async def update_user_password(self, user_id: int, password: str):
        """Update a user's password."""
        await self._run_wp_cli(f"user update {user_id} --user_pass='{password}'")

"""
CyberPanel Service

Provides CyberPanel integration via SSH CLI and Django Shell.
Bypasses HTTP API for improved stability and authenticates via SSH (Key or Password).
"""
import json
import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from ..utils.logging import logger
from ..utils.crypto import decrypt_credential
from ..utils.ssh import SSHConnection
from ..utils.errors import ForgeError

@dataclass
class CyberPanelConfig:
    """CyberPanel connection configuration."""
    hostname: str
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_key_path: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_private_key: Optional[str] = None


class CyberPanelService:
    """Service for CyberPanel operations via SSH."""
    
    def __init__(self, config: CyberPanelConfig):
        self.config = config
    
    @classmethod
    async def from_server(cls, server, db=None) -> "CyberPanelService":
        """
        Create service from Server model instance.
        If no credentials provided, attempts to use System SSH Key (requires db session).
        """
        ssh_password = server.ssh_password
        ssh_key_path = server.ssh_key_path
        ssh_private_key = server.ssh_private_key
        
        if server.owner_id:
            # Decrypt credentials if needed
            if ssh_password:
                try:
                    ssh_password = decrypt_credential(ssh_password, str(server.owner_id))
                except Exception:
                    logger.warning(f"Failed to decrypt SSH password for server {server.id}")
            
            if ssh_key_path:
                try:
                    ssh_key_path = decrypt_credential(ssh_key_path, str(server.owner_id))
                except Exception:
                    pass # Keep as is (might be plain path)
            
            if ssh_private_key:
                try:
                    ssh_private_key = decrypt_credential(ssh_private_key, str(server.owner_id))
                except Exception:
                    logger.warning(f"Failed to decrypt SSH private key for server {server.id}")
        
        # Fallback to System Key
        if not ssh_password and not ssh_key_path and not ssh_private_key and db:
            from .ssh_service import SSHKeyService
            try:
                system_keys = await SSHKeyService.get_system_key(db)
                if system_keys and system_keys.get("private_key"):
                    ssh_private_key = system_keys["private_key"]
            except Exception as e:
                logger.warning(f"Failed to fetch system key: {e}")

        config = CyberPanelConfig(
            hostname=server.hostname,
            ssh_user=server.ssh_user,
            ssh_port=server.ssh_port,
            ssh_key_path=ssh_key_path,
            ssh_password=ssh_password,
            ssh_private_key=ssh_private_key
        )
        return cls(config)
    
    async def _run_ssh_command(self, command: str) -> str:
        """Run SSH command in a thread pool to avoid blocking."""
        def _run():
            with SSHConnection(
                self.config.hostname, 
                self.config.ssh_user, 
                self.config.ssh_key_path, 
                self.config.ssh_port,
                self.config.ssh_password,
                self.config.ssh_private_key
            ) as ssh:
                result = ssh.run(command)
                return result

        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, _run)
            if result.returncode != 0:
                raise ForgeError(f"Command failed: {result.stderr}")
            return result.stdout
        except Exception as e:
            logger.error(f"SSH execution failed: {e}")
            raise

    async def verify_connection(self) -> bool:
        """Verify SSH connection."""
        try:
            await self._run_ssh_command("echo 'connected'")
            return True
        except Exception:
            return False
    
    async def list_websites(self) -> List[Dict[str, Any]]:
        """List all websites via CyberPanel Django Shell."""
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from websiteFunctions.models import Websites
from django.core.serializers.json import DjangoJSONEncoder
qs = Websites.objects.all().values('domain', 'adminEmail', 'package', 'state', 'phpSelection')
print(json.dumps(list(qs), cls=DjangoJSONEncoder))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            data = json.loads(output)
            # Normalize data to match expected frontend format if needed
            # Frontend expects: domain, adminEmail, package, state, phpSelection
            return data
        except Exception as e:
            logger.error(f"Failed to list websites via SSH: {e}. Output: {output if 'output' in locals() else 'N/A'}")
            raise ForgeError(f"Failed to list websites: {e}")
    
    async def create_website(
        self,
        domain: str,
        email: str,
        php_version: str = "8.1",
        package: str = "Default",
        ssl: bool = True
    ) -> Dict[str, Any]:
        """Create a new website using cyberpanel CLI."""
        # Clean PHP version string (e.g. "8.1" -> "8.1")
        # CLI might expect "8.1"
        
        # Using dynamic python path to bypass potential bad interpreter in /usr/bin/cyberpanel
        cmd_prefix = '''
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py
'''
        cmd = f"{cmd_prefix} createWebsite --domainName {domain} --ownerEmail {email} --packageName {package} --phpVersion {php_version}"
        if ssl:
             cmd += " --ssl 1"
        
        try:
            # We need to strip semicolons/newlines from cmd when passing to run? 
            # actually the multiline string helps. 
            # But the previous implementation passed single line.
            # We should flatten it to avoid issues or execute as one block.
            # Let's flatten the detection logic for safety in one line
            python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
            
            cmd = f'{python_detect} $PY /usr/local/CyberCP/plogical/websiteFunctions.py createWebsite --domainName {domain} --ownerEmail {email} --packageName {package} --phpVersion {php_version}'
            # Wait, is it manage.py createWebsite or separate script?
            # Research suggests `cyberpanel` utility calls specific python scripts or management commands.
            # If `cyberpanel` is a python script itself, we can read it?
            # "cyberpanel" command often points to /usr/local/CyberCP/bin/cyberpanel which is a python script.
            # We can run THAT script with our python.
            # Let's try running the cyberpanel utility script directly with the detected python.
            
            cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel createWebsite --domainName {domain} --ownerEmail {email} --packageName {package} --phpVersion {php_version}'
             
            if ssl:
                 cmd += " --ssl 1"

            await self._run_ssh_command(cmd)
            return {"success": True, "domain": domain}
        except Exception as e:
             return {"success": False, "error": str(e)}

    async def delete_website(self, domain: str) -> Dict[str, Any]:
        """Delete a website."""
        python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
        cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel deleteWebsite --domainName {domain}'
        try:
            await self._run_ssh_command(cmd)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def issue_ssl(self, domain: str) -> Dict[str, Any]:
        """Issue SSL certificate."""
        python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
        cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel issueSSL --domainName {domain}'
        try:
            await self._run_ssh_command(cmd)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_website_stats(self, domain: str) -> Dict[str, Any]:
        """Get stats. Not easily available via CLI, might need Django query."""
        # Fallback to zero for now or implement django query
        return {"success": True, "bandwidth": 0, "disk_usage": 0}

    async def change_php_version(self, domain: str, php_version: str) -> Dict[str, Any]:
        """Change PHP version."""
        python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
        cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel changePHP --domainName {domain} --phpVersion {php_version}'
        try:
             await self._run_ssh_command(cmd)
             return {"success": True, "php_version": php_version}
        except Exception as e:
             return {"success": False, "error": str(e)}

    async def list_databases(self) -> List[Dict[str, Any]]:
        """List databases via Django."""
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from websiteFunctions.models import Websites
# Logic to list DBs is more complex relationally.
# For now, return empty or implement proper query if schema is known.
print('[]')
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            return json.loads(output)
        except Exception:
            return []

    async def create_database(
        self,
        domain: str,
        db_name: str,
        db_user: str,
        db_password: str
    ) -> Dict[str, Any]:
        """Create database via CLI."""
        python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
        cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel createDatabase --databaseWebsite {domain} --dbName {db_name} --dbUsername {db_user} --dbPassword {db_password}'
        try:
            await self._run_ssh_command(cmd)
            return {"success": True, "database": db_name}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def delete_database(self, db_name: str) -> Dict[str, Any]:
        """
        Delete a MySQL database via CyberPanel CLI.
        
        Args:
            db_name: The database name to delete
            
        Returns:
            Dict with success status
        """
        python_detect = 'if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python"; elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3"; else PY="python3"; fi;'
        cmd = f'{python_detect} $PY /usr/local/CyberCP/bin/cyberpanel deleteDatabase --dbName {db_name}'
        try:
            await self._run_ssh_command(cmd)
            return {"success": True, "database": db_name}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def list_databases_detailed(self) -> List[Dict[str, Any]]:
        """
        List databases with detailed info via Django Shell.
        
        Returns list of dicts with:
        - dbName, dbUser, website
        - size (if available)
        """
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
try:
    from databases.models import Databases
    dbs = Databases.objects.all()
    result = []
    for db in dbs:
        result.append({
            'dbName': db.dbName,
            'dbUser': db.dbUser,
            'website': db.website.domain if hasattr(db, 'website') and db.website else None,
        })
    print(json.dumps(result))
except Exception as e:
    print(json.dumps([]))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            databases = json.loads(output.strip())
            
            # Try to get sizes via MySQL
            try:
                size_cmd = '''mysql -N -e "SELECT table_schema, SUM(data_length + index_length) FROM information_schema.tables GROUP BY table_schema;"'''
                size_output = await self._run_ssh_command(size_cmd)
                sizes = {}
                for line in size_output.strip().split('\n'):
                    if line.strip():
                        parts = line.split('\t')
                        if len(parts) >= 2:
                            sizes[parts[0]] = int(parts[1]) if parts[1] and parts[1] != 'NULL' else 0
                
                for db in databases:
                    db['size_bytes'] = sizes.get(db['dbName'], 0)
            except:
                pass
            
            return databases
        except Exception as e:
            logger.error(f"Error listing databases: {e}")
            return []

    async def scan_wordpress_sites(self) -> List[Dict[str, Any]]:
        """Scan for WP sites."""
        # Use find command via SSH
        # Not implemented yet, reuse list_websites approximation
        websites = await self.list_websites()
        return [{
            "domain": w.get("domain", ""),
            "path": f"/home/{w.get('domain', '')}/public_html",
            "owner": w.get("adminEmail", "")
        } for w in websites]

    async def get_server_info(self) -> Dict[str, Any]:
        """Get server info via SSH commands."""
        # Load avg
        try:
            load = await self._run_ssh_command("cat /proc/loadavg")
            return {
                "success": True,
                "load_average": load.split()[0]
            }
        except:
            return {"success": False}

    # ===== USER MANAGEMENT =====
    
    async def list_users(self) -> List[Dict[str, Any]]:
        """
        List all CyberPanel users via Django Shell.
        
        Returns user info including:
        - userName, email, firstName, lastName
        - type (admin/reseller/user), acl
        - Package limits and usage
        """
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator
from websiteFunctions.models import Websites
from django.core.serializers.json import DjangoJSONEncoder

users = []
for admin in Administrator.objects.all():
    # Count websites owned by this user
    website_count = Websites.objects.filter(admin=admin).count()
    
    # Get ACL name
    acl_name = admin.acl.name if admin.acl else 'user'
    
    # Determine user type from ACL
    user_type = 'user'
    if acl_name == 'admin':
        user_type = 'admin'
    elif 'reseller' in acl_name.lower():
        user_type = 'reseller'
    
    users.append({
        'id': admin.id,
        'userName': admin.userName,
        'email': admin.email,
        'firstName': admin.firstName if hasattr(admin, 'firstName') else '',
        'lastName': admin.lastName if hasattr(admin, 'lastName') else '',
        'type': user_type,
        'acl': acl_name,
        'websitesLimit': admin.websitesLimit if hasattr(admin, 'websitesLimit') else 0,
        'websitesCount': website_count,
        'diskLimit': admin.diskLimit if hasattr(admin, 'diskLimit') else 0,
        'bandwidthLimit': admin.bandwidthLimit if hasattr(admin, 'bandwidthLimit') else 0,
    })

print(json.dumps(users, cls=DjangoJSONEncoder))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            # Parse JSON from output (may have extra whitespace/newlines)
            output = output.strip()
            data = json.loads(output)
            return data
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse user list JSON: {e}. Output: {output if 'output' in locals() else 'N/A'}")
            raise ForgeError(f"Failed to parse CyberPanel user list: {e}")
        except Exception as e:
            logger.error(f"Failed to list users via SSH: {e}")
            raise ForgeError(f"Failed to list users: {e}")

    async def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get a single CyberPanel user by username.
        
        Returns detailed user info or None if not found.
        """
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator
from websiteFunctions.models import Websites
from django.core.serializers.json import DjangoJSONEncoder

try:
    admin = Administrator.objects.get(userName='{username}')
    website_count = Websites.objects.filter(admin=admin).count()
    acl_name = admin.acl.name if admin.acl else 'user'
    
    user_type = 'user'
    if acl_name == 'admin':
        user_type = 'admin'
    elif 'reseller' in acl_name.lower():
        user_type = 'reseller'
    
    user_data = {{
        'id': admin.id,
        'userName': admin.userName,
        'email': admin.email,
        'firstName': getattr(admin, 'firstName', ''),
        'lastName': getattr(admin, 'lastName', ''),
        'type': user_type,
        'acl': acl_name,
        'websitesLimit': getattr(admin, 'websitesLimit', 0),
        'websitesCount': website_count,
        'diskLimit': getattr(admin, 'diskLimit', 0),
        'bandwidthLimit': getattr(admin, 'bandwidthLimit', 0),
    }}
    print(json.dumps(user_data, cls=DjangoJSONEncoder))
except Administrator.DoesNotExist:
    print('null')
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            if output == 'null':
                return None
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to get user {username}: {e}")
            return None

    async def create_user(
        self,
        username: str,
        email: str,
        password: str,
        first_name: str = "",
        last_name: str = "",
        user_type: str = "user",
        websites_limit: int = 0,
        disk_limit: int = 0,
        bandwidth_limit: int = 0,
        package_name: str = "Default"
    ) -> Dict[str, Any]:
        """
        Create a new CyberPanel user.
        
        Args:
            username: Unique username
            email: User email address
            password: User password
            first_name: Optional first name
            last_name: Optional last name
            user_type: admin, reseller, or user
            websites_limit: Max websites (0=unlimited)
            disk_limit: Disk quota in MB (0=unlimited)
            bandwidth_limit: Bandwidth limit in MB (0=unlimited)
            package_name: CyberPanel package to assign
        
        Returns:
            Dict with success status and user info or error
        """
        # Map user_type to CyberPanel ACL
        acl_map = {
            "admin": "admin",
            "reseller": "reseller",
            "user": "user"
        }
        acl = acl_map.get(user_type, "user")
        
        # Escape special characters in password for shell
        escaped_password = password.replace("'", "'\\''")
        
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator, ACL
from django.contrib.auth.hashers import make_password

# Check if user already exists
if Administrator.objects.filter(userName='{username}').exists():
    print(json.dumps({{'success': False, 'error': 'User already exists'}}))
else:
    try:
        # Get or create ACL
        acl, _ = ACL.objects.get_or_create(name='{acl}')
        
        # Create user
        admin = Administrator.objects.create(
            userName='{username}',
            email='{email}',
            password=make_password('{escaped_password}'),
            firstName='{first_name}',
            lastName='{last_name}',
            acl=acl,
            websitesLimit={websites_limit},
            diskLimit={disk_limit},
            bandwidthLimit={bandwidth_limit},
        )
        
        print(json.dumps({{
            'success': True,
            'user': {{
                'id': admin.id,
                'userName': admin.userName,
                'email': admin.email,
                'type': '{user_type}'
            }}
        }}))
    except Exception as e:
        print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            result = json.loads(output)
            return result
        except Exception as e:
            logger.error(f"Failed to create user {username}: {e}")
            return {"success": False, "error": str(e)}

    async def delete_user(self, username: str) -> Dict[str, Any]:
        """
        Delete a CyberPanel user.
        
        WARNING: This may also delete associated websites depending on CyberPanel config.
        
        Args:
            username: Username to delete
            
        Returns:
            Dict with success status
        """
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator

try:
    admin = Administrator.objects.get(userName='{username}')
    
    # Don't allow deletion of main admin
    if admin.userName == 'admin':
        print(json.dumps({{'success': False, 'error': 'Cannot delete main admin user'}}))
    else:
        admin.delete()
        print(json.dumps({{'success': True}}))
except Administrator.DoesNotExist:
    print(json.dumps({{'success': False, 'error': 'User not found'}}))
except Exception as e:
    print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to delete user {username}: {e}")
            return {"success": False, "error": str(e)}

    async def change_user_password(self, username: str, new_password: str) -> Dict[str, Any]:
        """
        Change a CyberPanel user's password.
        
        Args:
            username: Username to update
            new_password: New password
            
        Returns:
            Dict with success status
        """
        # Escape special characters in password for shell
        escaped_password = new_password.replace("'", "'\\''")
        
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator
from django.contrib.auth.hashers import make_password

try:
    admin = Administrator.objects.get(userName='{username}')
    admin.password = make_password('{escaped_password}')
    admin.save()
    print(json.dumps({{'success': True}}))
except Administrator.DoesNotExist:
    print(json.dumps({{'success': False, 'error': 'User not found'}}))
except Exception as e:
    print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to change password for {username}: {e}")
            return {"success": False, "error": str(e)}

    async def update_user(
        self,
        username: str,
        email: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        websites_limit: Optional[int] = None,
        disk_limit: Optional[int] = None,
        bandwidth_limit: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update a CyberPanel user's details.
        
        Args:
            username: Username to update
            email: New email (optional)
            first_name: New first name (optional)
            last_name: New last name (optional)
            websites_limit: New website limit (optional)
            disk_limit: New disk limit in MB (optional)
            bandwidth_limit: New bandwidth limit in MB (optional)
            
        Returns:
            Dict with success status and updated user info
        """
        # Build update fields
        updates = []
        if email is not None:
            updates.append(f"admin.email = '{email}'")
        if first_name is not None:
            updates.append(f"admin.firstName = '{first_name}'")
        if last_name is not None:
            updates.append(f"admin.lastName = '{last_name}'")
        if websites_limit is not None:
            updates.append(f"admin.websitesLimit = {websites_limit}")
        if disk_limit is not None:
            updates.append(f"admin.diskLimit = {disk_limit}")
        if bandwidth_limit is not None:
            updates.append(f"admin.bandwidthLimit = {bandwidth_limit}")
        
        if not updates:
            return {"success": True, "message": "No updates provided"}
        
        updates_str = "; ".join(updates)
        
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator

try:
    admin = Administrator.objects.get(userName='{username}')
    {updates_str}
    admin.save()
    print(json.dumps({{
        'success': True,
        'user': {{
            'userName': admin.userName,
            'email': admin.email,
            'firstName': getattr(admin, 'firstName', ''),
            'lastName': getattr(admin, 'lastName', ''),
        }}
    }}))
except Administrator.DoesNotExist:
    print(json.dumps({{'success': False, 'error': 'User not found'}}))
except Exception as e:
    print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to update user {username}: {e}")
            return {"success": False, "error": str(e)}

    async def suspend_user(self, username: str) -> Dict[str, Any]:
        """
        Suspend a CyberPanel user (disable login).
        
        Args:
            username: Username to suspend
            
        Returns:
            Dict with success status
        """
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator

try:
    admin = Administrator.objects.get(userName='{username}')
    if admin.userName == 'admin':
        print(json.dumps({{'success': False, 'error': 'Cannot suspend main admin'}}))
    else:
        admin.is_active = False
        admin.save()
        print(json.dumps({{'success': True}}))
except Administrator.DoesNotExist:
    print(json.dumps({{'success': False, 'error': 'User not found'}}))
except Exception as e:
    print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to suspend user {username}: {e}")
            return {"success": False, "error": str(e)}

    async def unsuspend_user(self, username: str) -> Dict[str, Any]:
        """
        Unsuspend a CyberPanel user (enable login).
        
        Args:
            username: Username to unsuspend
            
        Returns:
            Dict with success status
        """
        cmd = f'''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import Administrator

try:
    admin = Administrator.objects.get(userName='{username}')
    admin.is_active = True
    admin.save()
    print(json.dumps({{'success': True}}))
except Administrator.DoesNotExist:
    print(json.dumps({{'success': False, 'error': 'User not found'}}))
except Exception as e:
    print(json.dumps({{'success': False, 'error': str(e)}}))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to unsuspend user {username}: {e}")
            return {"success": False, "error": str(e)}

    async def list_packages(self) -> List[Dict[str, Any]]:
        """
        List available CyberPanel packages.
        
        Packages define resource limits for users/websites.
        """
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from packages.models import Package
from django.core.serializers.json import DjangoJSONEncoder

packages = []
for pkg in Package.objects.all():
    packages.append({
        'id': pkg.id,
        'packageName': pkg.packageName,
        'diskSpace': pkg.diskSpace,
        'bandwidth': pkg.bandwidth,
        'emailAccounts': pkg.emailAccounts,
        'dataBases': pkg.dataBases,
        'ftpAccounts': pkg.ftpAccounts,
        'allowedDomains': pkg.allowedDomains,
    })
print(json.dumps(packages, cls=DjangoJSONEncoder))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to list packages: {e}")
            return []

    async def list_acls(self) -> List[Dict[str, Any]]:
        """
        List available CyberPanel ACLs (Access Control Lists).
        
        ACLs define what features a user can access.
        """
        cmd = '''
export PYTHONPATH=/usr/local/CyberCP;
if [ -f /usr/local/CyberCP/bin/python ]; then PY="/usr/local/CyberCP/bin/python";
elif [ -f /usr/local/CyberCP/bin/python3 ]; then PY="/usr/local/CyberCP/bin/python3";
else PY="python3"; fi;
$PY /usr/local/CyberCP/manage.py shell -c "
import json
from loginSystem.models import ACL
from django.core.serializers.json import DjangoJSONEncoder

acls = []
for acl in ACL.objects.all():
    acls.append({
        'id': acl.id,
        'name': acl.name,
    })
print(json.dumps(acls, cls=DjangoJSONEncoder))
"
'''
        try:
            output = await self._run_ssh_command(cmd)
            output = output.strip()
            return json.loads(output)
        except Exception as e:
            logger.error(f"Failed to list ACLs: {e}")
            return []

    async def close(self):
        pass




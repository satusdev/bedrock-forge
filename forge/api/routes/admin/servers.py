"""
Server management API routes.

Provides CRUD operations for server management and SSH connection testing.
"""
from datetime import datetime
from typing import Annotated, List
import asyncio
import subprocess
import httpx

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db, Server, User
from ....db.models.server import ServerStatus
from ....utils.logging import logger
from ....utils.ssh import SSHConnection
from ....utils.crypto import decrypt_credential
from ...deps import get_current_active_user
from ...schemas.server import ServerCreate, ServerUpdate, ServerRead, ServerTestResult

router = APIRouter()


@router.get("/", response_model=List[ServerRead])
async def list_servers(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100)
):
    """List all servers (global access)."""
    result = await db.execute(
        select(Server)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/", response_model=ServerRead, status_code=status.HTTP_201_CREATED)
async def create_server(
    server_data: ServerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new server."""
    server = Server(
        name=server_data.name,
        hostname=server_data.hostname,
        provider=server_data.provider,
        ssh_user=server_data.ssh_user,
        ssh_port=server_data.ssh_port,
        ssh_key_path=server_data.ssh_key_path,
        panel_type=server_data.panel_type,
        panel_url=server_data.panel_url,
        panel_username=server_data.panel_username,
        panel_password=server_data.panel_password,
        status=ServerStatus.OFFLINE,
        owner_id=current_user.id
    )
    db.add(server)
    await db.flush()
    await db.refresh(server)
    
    logger.info(f"Server created: {server.name} by {current_user.email}")
    return server


@router.get("/{server_id}", response_model=ServerRead)
async def get_server(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get server by ID (global access)."""
    result = await db.execute(
        select(Server).where(Server.id == server_id)
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    return server


@router.put("/{server_id}", response_model=ServerRead)
async def update_server(
    server_id: int,
    server_data: ServerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update server."""
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    # Update fields if provided
    if server_data.name is not None:
        server.name = server_data.name
    if server_data.hostname is not None:
        server.hostname = server_data.hostname
    if server_data.provider is not None:
        server.provider = server_data.provider
    if server_data.ssh_user is not None:
        server.ssh_user = server_data.ssh_user
    if server_data.ssh_port is not None:
        server.ssh_port = server_data.ssh_port
    if server_data.ssh_key_path is not None:
        server.ssh_key_path = server_data.ssh_key_path
    if server_data.panel_type is not None:
        server.panel_type = server_data.panel_type
    if server_data.panel_url is not None:
        server.panel_url = server_data.panel_url
    if server_data.panel_username is not None:
        server.panel_username = server_data.panel_username
    if server_data.panel_password is not None:
        server.panel_password = server_data.panel_password
    
    await db.flush()
    await db.refresh(server)
    
    logger.info(f"Server updated: {server.name}")
    return server


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete server."""
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    await db.delete(server)
    logger.info(f"Server deleted: {server.name}")


@router.get("/{server_id}/panel/login-url")
async def get_panel_login_url(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Get auto-login URL for server control panel.
    
    Returns the panel URL with credentials for CyberPanel auto-login.
    """
    from ....utils.crypto import decrypt_credential
    
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    if not server.panel_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No panel URL configured for this server"
        )
    
    if not server.panel_username or not server.panel_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Panel credentials not configured. Add username and password to server settings."
        )
    
    # Decrypt credentials
    try:
        username = decrypt_credential(server.panel_username, str(server.owner_id))
        password = decrypt_credential(server.panel_password, str(server.owner_id))
    except Exception:
        # If decryption fails, assume already decrypted (for backwards compat)
        username = server.panel_username
        password = server.panel_password
    
    # Build panel login URL (CyberPanel uses :8090)
    panel_url = server.panel_url.rstrip('/')
    
    return {
        "server_id": server.id,
        "server_name": server.name,
        "panel_type": server.panel_type.value if server.panel_type else None,
        "panel_url": panel_url,
        "login_url": f"{panel_url}/",
        "username": username,
        "password": password,
        "instructions": "Use these credentials to log in to the control panel."
    }
    
async def _generate_cyberpanel_session(panel_url: str, username: str, password: str) -> dict:
    base_url = panel_url.rstrip("/")
    endpoint = f"{base_url}/api/verifyLogin"

    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        response = await client.post(endpoint, json={"username": username, "password": password})
        if response.status_code == status.HTTP_404_NOT_FOUND:
            return {"session_url": None, "session_token": None, "raw": {}}
        response.raise_for_status()
        data = response.json() if response.content else {}

    session_url = None
    for key in ("loginURL", "loginUrl", "login_url", "session_url", "url"):
        if isinstance(data.get(key), str) and data.get(key):
            session_url = data[key]
            break

    session_token = data.get("token") or data.get("access_token")
    if not session_url and session_token:
        session_url = f"{base_url}/?token={session_token}"

    return {
        "session_url": session_url,
        "session_token": session_token,
        "raw": data,
    }


@router.post("/{server_id}/panel/session-url")
async def get_panel_session_url(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Generate a CyberPanel session URL.

    Attempts to authenticate against the panel API and returns a session URL or token.
    """
    from ....utils.crypto import decrypt_credential

    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()

    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )

    if not server.panel_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No panel URL configured for this server"
        )

    if not server.panel_username or not server.panel_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Panel credentials not configured. Add username and password to server settings."
        )

    if not server.panel_type or server.panel_type.value != "cyberpanel":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session URL generation is only supported for CyberPanel servers"
        )

    try:
        username = decrypt_credential(server.panel_username, str(server.owner_id))
        password = decrypt_credential(server.panel_password, str(server.owner_id))
    except Exception:
        username = server.panel_username
        password = server.panel_password

    panel_url = server.panel_url.rstrip("/")

    try:
        session_data = await _generate_cyberpanel_session(panel_url, username, password)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate CyberPanel session: {exc}"
        )

    return {
        "server_id": server.id,
        "server_name": server.name,
        "panel_type": server.panel_type.value if server.panel_type else None,
        "panel_url": panel_url,
        "login_url": f"{panel_url}/",
        "username": username,
        "password": password,
        "session_url": session_data.get("session_url"),
        "session_token": session_data.get("session_token"),
    }



@router.post("/{server_id}/test", response_model=ServerTestResult)
async def test_server_connection(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Test connection to server.
    
    For CyberPanel servers: Tests panel API using HTTP with the stored API token.
    For other servers: Tests SSH connection.
    """
    from ....db.models.server import PanelType
    import httpx
    
    result = await db.execute(
        select(Server).where(Server.id == server_id)
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    start_time = datetime.now()
    
    start_time = datetime.now()
    
    # For CyberPanel servers, verify via SSH using the new service logic if possible, 
    # but strictly speaking the 'test' endpoint is often just connectivity.
    # Since we moved CyberPanel to use SSH, we can fall through to the SSH test below.
    # So we remove the specific HTTP API test block entirely.
    
    # For non-panel servers (and now CyberPanel too due to SSH shift), test SSH connection
    try:
        # Decrypt credentials
        ssh_password = server.ssh_password
        ssh_key_path = server.ssh_key_path
        ssh_private_key = server.ssh_private_key

        if server.owner_id:
            if ssh_password:
                try:
                    ssh_password = decrypt_credential(ssh_password, str(server.owner_id))
                except:
                    pass
            if ssh_key_path:
                try:
                    ssh_key_path = decrypt_credential(ssh_key_path, str(server.owner_id))
                except:
                    pass
            if ssh_private_key:
                try:
                    ssh_private_key = decrypt_credential(ssh_private_key, str(server.owner_id))
                except:
                    pass

        # Fallback to System SSH Key if no credentials provided
        if not ssh_password and not ssh_key_path and not ssh_private_key:
            from forge.services.ssh_service import SSHKeyService  # Local import to avoid circular dependency
            system_keys = await SSHKeyService.get_system_key(db)
            if system_keys and system_keys.get("private_key"):
                ssh_private_key = system_keys["private_key"]


        # Use SSHConnection helper which handles keys/passwords/timeouts
        def _try_connect():
            with SSHConnection(
                server.hostname, 
                server.ssh_user, 
                ssh_key_path, 
                server.ssh_port,
                ssh_password,
                ssh_private_key
            ) as ssh:
                return ssh.run("echo 'Connection successful'")

        # Run in thread pool
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _try_connect)
        
        elapsed = (datetime.now() - start_time).total_seconds() * 1000
        
        server.status = ServerStatus.ONLINE
        server.last_health_check = datetime.now()
        # If CyberPanel, we mark verified too since SSH is the new verification
        if server.panel_type == PanelType.CYBERPANEL:
            server.panel_verified = True
            
        await db.flush()
        
        return ServerTestResult(
            success=True,
            message="SSH connection successful",
            response_time_ms=int(elapsed)
        )

    except Exception as e:
        await db.rollback()
        result = await db.execute(
            select(Server).where(Server.id == server_id)
        )
        server = result.scalar_one_or_none()
        if server:
            server.status = ServerStatus.OFFLINE
            if server.panel_type == PanelType.CYBERPANEL:
                server.panel_verified = False
            try:
                await db.flush()
            except Exception:
                await db.rollback()
        return ServerTestResult(
            success=False,
            message=str(e),
            response_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
        )


@router.get("/{server_id}/health")
async def get_server_health(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get server health status with detailed information."""
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    return {
        "server_id": server.id,
        "server_name": server.name,
        "hostname": server.hostname,
        "status": server.status.value if server.status else "unknown",
        "last_health_check": server.last_health_check.isoformat() if server.last_health_check else None,
        "panel_verified": server.panel_verified,
        "panel_url": server.panel_url,
        "panel_type": server.panel_type.value if server.panel_type else None
    }


@router.post("/{server_id}/health/trigger")
async def trigger_health_check(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Trigger an on-demand health check for a server.
    
    Queues a background task to check ping, SSH, and panel connectivity.
    """
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    
    # Queue Celery task for health check
    try:
        from ....tasks.server_monitors import check_server_health
        check_server_health.delay(server_id=server_id)
        logger.info(f"Health check triggered for server {server.name}")
        
        return {
            "status": "accepted",
            "message": f"Health check queued for {server.name}",
            "server_id": server_id
        }
    except ImportError:
        # Celery not available, run synchronously
        from ....tasks.server_monitors import ping_host, check_ssh_port
        
        ping_result = ping_host(server.hostname)
        ssh_result = check_ssh_port(server.hostname, server.ssh_port)
        
        # Update server status
        if ping_result["success"] and ssh_result["success"]:
            server.status = ServerStatus.ONLINE
        elif ping_result["success"]:
            server.status = ServerStatus.MAINTENANCE
        else:
            server.status = ServerStatus.OFFLINE
        
        server.last_health_check = datetime.now()
        await db.flush()
        
        return {
            "status": "completed",
            "server_id": server_id,
            "server_name": server.name,
            "ping": ping_result,
            "ssh": ssh_result,
            "server_status": server.status.value
        }


# ============================================================================
# Directory Scanning and Tags
# ============================================================================

async def _get_server_or_404(
    server_id: int,
    db: AsyncSession,
    current_user: User
) -> Server:
    """Get server by ID or raise 404."""
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found"
        )
    return server


@router.post("/{server_id}/scan-sites")
async def scan_server_wordpress_sites(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    base_path: str = Query("/home", description="Base path to scan (e.g., /home for CyberPanel, /var/www for standard)"),
    max_depth: int = Query(4, ge=1, le=6, description="Maximum directory depth to scan")
):
    """
    Comprehensive scan for WordPress sites on a server.
    
    Finds WordPress installations, detects Bedrock structure, extracts site URLs,
    WP version, and identifies if they're already imported as projects.
    
    For CyberPanel: Use base_path=/home (sites are in /home/domain/public_html)
    For standard: Use base_path=/var/www
    """
    import json
    from sqlalchemy import select as sa_select
    from ....db.models.project_server import ProjectServer
    
    server = await _get_server_or_404(server_id, db, current_user)
    
    # Get SSH credentials
    ssh_password = server.ssh_password
    ssh_key_path = server.ssh_key_path
    ssh_private_key = server.ssh_private_key
    
    if server.owner_id:
        if ssh_password:
            try:
                ssh_password = decrypt_credential(ssh_password, str(server.owner_id))
            except:
                pass
        if ssh_key_path:
            try:
                ssh_key_path = decrypt_credential(ssh_key_path, str(server.owner_id))
            except:
                pass
        if ssh_private_key:
            try:
                ssh_private_key = decrypt_credential(ssh_private_key, str(server.owner_id))
            except:
                pass
    
    # Fallback to system SSH key
    if not ssh_password and not ssh_key_path and not ssh_private_key:
        from forge.services.ssh_service import SSHKeyService
        system_keys = await SSHKeyService.get_system_key(db)
        if system_keys and system_keys.get("private_key"):
            ssh_private_key = system_keys["private_key"]
    
    # Check if we have any credentials
    if not ssh_password and not ssh_key_path and not ssh_private_key:
        return {
            "success": False,
            "message": "No SSH credentials configured for this server. Please add SSH password or key in server settings.",
            "sites": [],
            "scan_path": base_path,
            "server_id": server.id,
            "server_name": server.name
        }
    
    def _run_scan():
        """Run the scan in a thread pool to not block."""
        sites = []
        
        try:
            with SSHConnection(
                server.hostname,
                server.ssh_user,
                ssh_key_path,
                server.ssh_port,
                ssh_password,
                ssh_private_key
            ) as ssh:
                # Find all wp-config.php files
                find_result = ssh.run(
                    f"find {base_path} -maxdepth {max_depth} -name 'wp-config.php' -type f 2>/dev/null || true",
                    warn=True
                )
                
                if not find_result.stdout:
                    return sites
                
                wp_config_paths = [p.strip() for p in find_result.stdout.split('\n') if p.strip()]
                
                for config_path in wp_config_paths:
                    # Get the directory containing wp-config.php
                    wp_dir = config_path.rsplit('/wp-config.php', 1)[0]
                    
                    site_info = {
                        "path": wp_dir,
                        "wp_config_path": config_path,
                        "is_bedrock": False,
                        "wp_path": wp_dir,  # Path for WP-CLI
                        "site_url": None,
                        "site_name": None,
                        "wp_version": None,
                        "php_version": None,
                        "domain": None,
                        "imported": False,
                        "project_id": None
                    }
                    
                    # Detect Bedrock: check for /web/app or /web/wp structure
                    bedrock_check = ssh.run(
                        f"(test -d '{wp_dir}/web/app' || test -d '{wp_dir}/web/wp') && echo 'bedrock' || echo 'standard'",
                        warn=True
                    )
                    
                    if 'bedrock' in bedrock_check.stdout.lower():
                        site_info["is_bedrock"] = True
                        # For Bedrock, WP-CLI should run from project root, not /web/app
                        site_info["wp_path"] = wp_dir
                    else:
                        # Also check if this is inside a Bedrock web/app path
                        if '/web/app' in wp_dir:
                            site_info["is_bedrock"] = True
                            # Go up to project root for WP-CLI
                            site_info["wp_path"] = wp_dir.split('/web/app')[0]
                    
                    # Check for .env in parent directory (Bedrock signature for /public_html/web structures)
                    if not site_info["is_bedrock"]:
                        parent_dir = wp_dir.rsplit('/', 1)[0] if '/' in wp_dir else ''
                        if parent_dir:
                            env_check = ssh.run(
                                f"test -f '{parent_dir}/.env' && echo 'bedrock' || echo ''",
                                warn=True
                            )
                            if 'bedrock' in env_check.stdout.lower():
                                site_info["is_bedrock"] = True
                                site_info["wp_path"] = parent_dir  # Bedrock root is parent
                    
                    # Extract domain from path (works for CyberPanel /home/domain.com/public_html)
                    path_parts = wp_dir.split('/')
                    for i, part in enumerate(path_parts):
                        if '.' in part and len(part) > 3 and part not in ['wp-content', 'wp-includes']:
                            # Looks like a domain
                            site_info["domain"] = part
                            break
                    
                    # Try to get site URL using WP-CLI
                    try:
                        cli_path = site_info["wp_path"]
                        url_result = ssh.run(
                            f"cd '{cli_path}' && wp option get siteurl --skip-plugins --skip-themes 2>/dev/null || echo ''",
                            warn=True
                        )
                        if url_result.stdout and url_result.stdout.startswith('http'):
                            site_info["site_url"] = url_result.stdout.strip()
                            # Extract domain from URL if not already set
                            if not site_info["domain"]:
                                from urllib.parse import urlparse
                                parsed = urlparse(site_info["site_url"])
                                site_info["domain"] = parsed.netloc
                    except:
                        pass
                    
                    # Try to get site name
                    try:
                        cli_path = site_info["wp_path"]
                        name_result = ssh.run(
                            f"cd '{cli_path}' && wp option get blogname --skip-plugins --skip-themes 2>/dev/null || echo ''",
                            warn=True
                        )
                        if name_result.stdout and name_result.returncode == 0:
                            site_info["site_name"] = name_result.stdout.strip()
                    except:
                        pass
                    
                    # Try to get WP version
                    try:
                        cli_path = site_info["wp_path"]
                        version_result = ssh.run(
                            f"cd '{cli_path}' && wp core version --skip-plugins --skip-themes 2>/dev/null || echo ''",
                            warn=True
                        )
                        if version_result.stdout and version_result.returncode == 0:
                            site_info["wp_version"] = version_result.stdout.strip()
                    except:
                        pass
                    
                    # Get PHP version
                    try:
                        php_result = ssh.run("php -v 2>/dev/null | head -1 | awk '{print $2}'", warn=True)
                        if php_result.stdout:
                            site_info["php_version"] = php_result.stdout.strip()
                    except:
                        pass
                    
                    sites.append(site_info)
                
                return sites
        except Exception as e:
            # Return error info that can be handled by the caller
            return {"error": str(e), "sites": []}
    
    try:
        # Run in thread pool
        loop = asyncio.get_running_loop()
        discovered_sites = await asyncio.wait_for(
            loop.run_in_executor(None, _run_scan),
            timeout=120  # 2 minute timeout for full scan
        )
        
        # Check if _run_scan returned an error
        if isinstance(discovered_sites, dict) and "error" in discovered_sites:
            return {
                "success": False,
                "message": f"SSH connection failed: {discovered_sites['error']}",
                "sites": [],
                "scan_path": base_path,
                "server_id": server.id,
                "server_name": server.name
            }
        
        # Check which sites are already imported as projects
        existing_links = await db.execute(
            sa_select(ProjectServer)
            .where(ProjectServer.server_id == server.id)
        )
        existing_paths = {link.wp_path for link in existing_links.scalars().all()}
        
        for site in discovered_sites:
            if site["path"] in existing_paths or site["wp_path"] in existing_paths:
                site["imported"] = True
        
        # Store discovered paths in server record
        server.wp_root_paths = json.dumps([s["path"] for s in discovered_sites])
        await db.flush()
        
        logger.info(f"Scanned {server.name}: found {len(discovered_sites)} WordPress sites")
        
        return {
            "success": True,
            "message": f"Found {len(discovered_sites)} WordPress site(s)",
            "sites": discovered_sites,
            "scan_path": base_path,
            "server_id": server.id,
            "server_name": server.name
        }
        
    except asyncio.TimeoutError:
        return {
            "success": False,
            "message": "Scan timed out after 2 minutes",
            "sites": [],
            "scan_path": base_path,
            "server_id": server.id,
            "server_name": server.name
        }
    except Exception as e:
        logger.error(f"Site scan error for {server.name}: {e}")
        return {
            "success": False,
            "message": str(e)[:300],
            "sites": [],
            "scan_path": base_path,
            "server_id": server.id,
            "server_name": server.name
        }


def parse_bedrock_env(env_content: str) -> dict:
    """Parse Bedrock .env file content and extract environment variables."""
    result = {
        "db_name": None,
        "db_user": None,
        "db_password": None,
        "db_host": "localhost",
        "wp_home": None,
        "wp_siteurl": None,
        "wp_env": "production",
        "table_prefix": "wp_"
    }
    
    key_mapping = {
        "DB_NAME": "db_name",
        "DB_USER": "db_user",
        "DB_PASSWORD": "db_password",
        "DB_HOST": "db_host",
        "WP_HOME": "wp_home",
        "WP_SITEURL": "wp_siteurl",
        "WP_ENV": "wp_env",
        "TABLE_PREFIX": "table_prefix"
    }
    
    for line in env_content.split('\n'):
        line = line.strip()
        # Skip comments and empty lines
        if not line or line.startswith('#'):
            continue
        # Parse KEY=value format
        if '=' in line:
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip()
            # Remove quotes from value
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            # Map to result dict
            if key in key_mapping:
                result[key_mapping[key]] = value
    
    return result


@router.post("/{server_id}/read-env")
async def read_server_env(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    path: str = Query(..., description="Path to the Bedrock site root (directory containing .env)")
):
    """
    Read and parse the .env file from a Bedrock WordPress installation.
    
    Returns database credentials and WordPress configuration extracted from
    the .env file. Does NOT return sensitive values directly - frontend should
    handle credential storage appropriately.
    """
    # Get server
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    try:
        # Get SSH credentials with proper decryption
        ssh_password = server.ssh_password
        ssh_key_path = server.ssh_key_path
        ssh_private_key = server.ssh_private_key
        
        if server.owner_id:
            if ssh_password:
                try:
                    ssh_password = decrypt_credential(ssh_password, str(server.owner_id))
                except:
                    pass
            if ssh_key_path:
                try:
                    ssh_key_path = decrypt_credential(ssh_key_path, str(server.owner_id))
                except:
                    pass
            if ssh_private_key:
                try:
                    ssh_private_key = decrypt_credential(ssh_private_key, str(server.owner_id))
                except:
                    pass
        
        # Fallback to system SSH key
        if not ssh_password and not ssh_key_path and not ssh_private_key:
            from forge.services.ssh_service import SSHKeyService
            system_keys = await SSHKeyService.get_system_key(db)
            if system_keys and system_keys.get("private_key"):
                ssh_private_key = system_keys["private_key"]
        
        # Check if we have any credentials
        if not ssh_password and not ssh_key_path and not ssh_private_key:
            raise HTTPException(
                status_code=400,
                detail="Server has no SSH credentials configured"
            )
        
        # Connect and read .env file
        def _read_env():
            with SSHConnection(
                server.hostname,
                server.ssh_user,
                ssh_key_path,
                server.ssh_port,
                ssh_password,
                ssh_private_key
            ) as ssh:
                # Try direct path first
                env_path = f"{path.rstrip('/')}/.env"
                logger.info(f"Reading env from {env_path}")
                result = ssh.run(f"cat {env_path}", warn=True)
                
                # If not found, try parent directory (Bedrock standard structure)
                if not result.stdout and '/' in path.rstrip('/'):
                    parent_path = path.rstrip('/').rsplit('/', 1)[0]
                    env_path = f"{parent_path}/.env"
                    logger.info(f"Trying parent env from {env_path}")
                    result = ssh.run(f"cat {env_path}", warn=True)
                
                if not result.stdout:
                    logger.warning(f"Failed to find .env at {env_path}")
                    return {"success": False, "error": f".env file not found at {env_path}"}
                
                return {"success": True, "content": result.stdout}
        
        loop = asyncio.get_event_loop()
        read_result = await loop.run_in_executor(None, _read_env)
        
        if not read_result["success"]:
            raise HTTPException(status_code=404, detail=read_result["error"])
        
        # Parse the .env content
        env_data = parse_bedrock_env(read_result["content"])
        
        return {
            "success": True,
            "server_id": server.id,
            "path": path,
            "env": env_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read .env from {server.name}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read .env file: {str(e)[:200]}"
        )


@router.post("/{server_id}/scan-directories")
async def scan_server_directories(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    base_path: str = Query("/var/www", description="Base path to scan for WordPress installations"),
    max_depth: int = Query(3, ge=1, le=5, description="Maximum directory depth to scan")
):
    """
    Legacy scan for WordPress installations (use /scan-sites for more details).
    
    Finds directories containing wp-config.php and identifies whether
    they are standard WordPress or Bedrock installations.
    """
    import json
    
    server = await _get_server_or_404(server_id, db, current_user)
    
    # Build SSH command to find WordPress installations
    find_cmd = f"find {base_path} -maxdepth {max_depth} -name 'wp-config.php' -type f 2>/dev/null"
    
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-p", str(server.ssh_port),
    ]
    if server.ssh_key_path:
        ssh_cmd.extend(["-i", server.ssh_key_path])
    ssh_cmd.extend([
        f"{server.ssh_user}@{server.hostname}",
        find_cmd
    ])
    
    try:
        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        
        if proc.returncode != 0:
            return {
                "success": False,
                "message": f"Scan failed: {stderr.decode()[:200]}",
                "directories": [],
                "scan_path": base_path
            }
        
        # Parse found paths
        wp_config_paths = stdout.decode().strip().split('\n')
        wp_config_paths = [p.strip() for p in wp_config_paths if p.strip()]
        
        directories = []
        for config_path in wp_config_paths:
            # Determine WordPress root directory
            # For Bedrock: wp-config.php is in project root
            # For standard: wp-config.php is in WP root
            dir_path = config_path.rsplit('/wp-config.php', 1)[0]
            
            # Check if it's Bedrock by looking for web/wp directory
            is_bedrock = False
            check_bedrock_cmd = f"test -d '{dir_path}/web/wp' && echo 'bedrock' || echo 'standard'"
            
            ssh_check = [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=5",
                "-o", "BatchMode=yes",
                "-p", str(server.ssh_port),
            ]
            if server.ssh_key_path:
                ssh_check.extend(["-i", server.ssh_key_path])
            ssh_check.extend([
                f"{server.ssh_user}@{server.hostname}",
                check_bedrock_cmd
            ])
            
            try:
                check_proc = await asyncio.create_subprocess_exec(
                    *ssh_check,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                check_stdout, _ = await asyncio.wait_for(check_proc.communicate(), timeout=10)
                is_bedrock = 'bedrock' in check_stdout.decode().lower()
            except:
                pass
            
            directories.append({
                "path": dir_path,
                "is_bedrock": is_bedrock,
                "wp_version": None,  # Would need additional commands to get
                "site_url": None     # Would need to read wp-config to get
            })
        
        # Store discovered paths in server record
        server.wp_root_paths = json.dumps([d["path"] for d in directories])
        await db.flush()
        
        logger.info(f"Scanned {server.name}: found {len(directories)} WordPress installations")
        
        return {
            "success": True,
            "message": f"Found {len(directories)} WordPress installation(s)",
            "directories": directories,
            "scan_path": base_path
        }
        
    except asyncio.TimeoutError:
        return {
            "success": False,
            "message": "Scan timed out",
            "directories": [],
            "scan_path": base_path
        }
    except Exception as e:
        logger.error(f"Directory scan error for {server.name}: {e}")
        return {
            "success": False,
            "message": str(e)[:200],
            "directories": [],
            "scan_path": base_path
        }


@router.get("/{server_id}/directories")
async def get_server_directories(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    List previously discovered WordPress directories on a server.
    
    Returns directories from the last scan. Use POST /scan-directories
    to refresh this list.
    """
    import json
    
    server = await _get_server_or_404(server_id, db, current_user)
    
    directories = []
    if server.wp_root_paths:
        try:
            directories = json.loads(server.wp_root_paths)
        except json.JSONDecodeError:
            directories = []
    
    return {
        "server_id": server.id,
        "server_name": server.name,
        "directories": directories,
        "uploads_path": server.uploads_path
    }


@router.put("/{server_id}/tags")
async def update_server_tags(
    server_id: int,
    tags: List[str],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Update server tags for filtering and organization.
    
    Tags are stored as a JSON array and can be used to filter
    servers in the dashboard.
    """
    import json
    
    server = await _get_server_or_404(server_id, db, current_user)
    
    # Clean and validate tags
    clean_tags = list(set([
        tag.strip().lower() 
        for tag in tags 
        if tag and tag.strip()
    ]))
    
    server.tags = json.dumps(clean_tags)
    await db.flush()
    await db.refresh(server)
    
    logger.info(f"Updated tags for server {server.name}: {clean_tags}")
    
    return {
        "server_id": server.id,
        "server_name": server.name,
        "tags": clean_tags
    }


@router.get("/{server_id}/tags")
async def get_server_tags(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get server tags."""
    import json
    
    server = await _get_server_or_404(server_id, db, current_user)
    
    tags = []
    if server.tags:
        try:
            tags = json.loads(server.tags)
        except json.JSONDecodeError:
            tags = []
    
    return {
        "server_id": server.id,
        "server_name": server.name,
        "tags": tags
    }


@router.get("/tags/all")
async def list_all_tags(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    List all unique tags across user's servers.
    
    Useful for populating filter dropdowns.
    """
    import json
    
    result = await db.execute(
        select(Server.tags)
        .where(Server.owner_id == current_user.id)
        .where(Server.tags.isnot(None))
    )
    
    all_tags = set()
    for (tags_json,) in result.all():
        if tags_json:
            try:
                tags = json.loads(tags_json)
                all_tags.update(tags)
            except json.JSONDecodeError:
                pass
    
    return {
        "tags": sorted(list(all_tags))
    }


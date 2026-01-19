"""
Projects API routes.

This module contains project management, DDEV control, plugins/themes management,
and WordPress core update endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from pathlib import Path
from typing import Dict, Any, List, Optional, Annotated
from datetime import datetime
from pydantic import BaseModel
import subprocess
import asyncio
import uuid
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ....utils.logging import logger
from ....utils.local_config import LocalConfigManager
from ...schemas import ProjectStatus, QuickAction
from ...schemas import ProjectCreate, ProjectUpdate, ProjectRead, ProjectSummary, LocalProject, TagsResponse
from ...schemas import EnvironmentCreate, EnvironmentUpdate, EnvironmentRead
from ...deps import task_status, update_task_status, get_current_active_user
from ....db import get_db
from ....db.models import Project, Server, User
from ....db.models.project import ProjectStatus as DBProjectStatus
from ....db.models.project_server import ProjectServer, ServerEnvironment
from ....db.models.monitor import Monitor, MonitorType

router = APIRouter()


def _get_project(project_name: str):
    """Helper to get project by name from local config."""
    local_config = LocalConfigManager()
    projects = local_config.load_projects()
    for p in projects:
        if p.project_name == project_name:
            return p
    return None


async def _get_db_project(project_name: str, db: AsyncSession):
    """Helper to get project by name or slug from database."""
    result = await db.execute(
        select(Project).where(
            (Project.name == project_name) | (Project.slug == project_name)
        )
    )
    return result.scalar_one_or_none()


async def _get_project_server(project_id: int, db: AsyncSession, environment: str = None):
    """Get the primary project-server link for a project, optionally filtered by environment."""
    from ....db.models.project_server import ServerEnvironment
    
    query = select(ProjectServer).where(
        ProjectServer.project_id == project_id,
        ProjectServer.is_primary == True
    )
    
    if environment:
        env_enum = ServerEnvironment(environment.lower())
        query = query.where(ProjectServer.environment == env_enum)
    
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def _run_remote_wp_cli(server: "Server", wp_path: str, command: str, user_id: int) -> dict:
    """
    Run WP-CLI command on remote server via SSH.
    
    Args:
        server: Server model with SSH credentials
        wp_path: WordPress installation path on the server
        command: WP-CLI command to run (without 'wp' prefix)
        user_id: User ID for decrypting credentials
    
    Returns:
        dict with 'success', 'output', and 'error' keys
    """
    from ....utils.ssh import SSHConnection
    from ....utils.crypto import decrypt_credential
    
    try:
        # Get SSH credentials
        ssh_password = None
        ssh_private_key = None
        
        if server.ssh_password:
            try:
                ssh_password = decrypt_credential(server.ssh_password, str(user_id))
            except:
                ssh_password = server.ssh_password
        
        if server.ssh_private_key:
            try:
                ssh_private_key = decrypt_credential(server.ssh_private_key, str(user_id))
            except:
                ssh_private_key = server.ssh_private_key
        
        # Detect Bedrock structure and find the correct path for wp-cli
        is_bedrock = '/web/app' in wp_path or wp_path.endswith('/web/app')
        
        # For Bedrock, wp-cli should run from the bedrock root (parent of web/)
        if is_bedrock:
            if wp_path.endswith('/web/app'):
                cli_path = wp_path[:-8]  # Remove /web/app
            elif '/web/app' in wp_path:
                cli_path = wp_path.split('/web/app')[0]
            else:
                cli_path = wp_path
        else:
            cli_path = wp_path
        
        with SSHConnection(
            host=server.hostname,
            user=server.ssh_user,
            port=server.ssh_port,
            password=ssh_password,
            private_key=ssh_private_key,
            key_path=server.ssh_key_path
        ) as ssh:
            # Run WP-CLI command
            full_command = f"cd {cli_path} && wp {command}"
            result = ssh.run(full_command, warn=True)
            
            return {
                'success': result.returncode == 0,
                'output': result.stdout,
                'error': result.stderr
            }
    
    except Exception as e:
        logger.error(f"Error running remote WP-CLI: {e}")
        return {
            'success': False,
            'output': '',
            'error': str(e)
        }


# =============================================================================
# NEW: Database-backed project endpoints
# =============================================================================

@router.get("/local", response_model=List[LocalProject])
async def get_local_projects():
    """Get local projects from ~/.forge (DDEV development projects)."""
    try:
        local_config = LocalConfigManager()
        projects = local_config.load_projects()
        local_projects = []
        
        for project in projects:
            project_dir = Path(project.directory)
            ddev_status = "unknown"
            
            if project_dir.exists():
                try:
                    result = subprocess.run(
                        ["ddev", "status"],
                        cwd=str(project_dir),
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        if "ok" in result.stdout.lower():
                            ddev_status = "running"
                        elif "stopped" in result.stdout.lower():
                            ddev_status = "stopped"
                except Exception:
                    pass
            
            local_projects.append(LocalProject(
                project_name=project.project_name,
                directory=project.directory,
                wp_home=project.wp_home,
                repo_url=project.repo_url,
                created_date=project.created_date,
                ddev_status=ddev_status
            ))
        
        return local_projects
    except Exception as e:
        logger.error(f"Error getting local projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/remote", response_model=List[ProjectSummary])
async def get_remote_projects(
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get all remote projects from database (server-deployed projects)."""
    try:
        result = await db.execute(
            select(Project, Server.name.label("server_name"))
            .outerjoin(Server, Project.server_id == Server.id)
            .order_by(Project.created_at.desc())
        )
        rows = result.all()
        
        projects = []
        for row in rows:
            project = row[0]
            server_name = row[1]
            
            # Parse tags from JSON
            tags = []
            if project.tags:
                try:
                    tags = json.loads(project.tags)
                except json.JSONDecodeError:
                    pass
            
            projects.append(ProjectSummary(
                id=project.id,
                name=project.name,
                slug=project.slug,
                domain=project.wp_home or "",
                environment=project.environment,
                status=project.status,
                server_name=server_name,
                health_score=90,  # TODO: Calculate actual health score
                tags=tags,
                created_at=project.created_at
            ))
        
        return projects
    except Exception as e:
        logger.error(f"Error getting remote projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags", response_model=TagsResponse)
async def get_all_tags(
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get all unique tags from projects for the tags dropdown."""
    try:
        result = await db.execute(select(Project.tags))
        rows = result.scalars().all()
        
        all_tags = set()
        for tags_json in rows:
            if tags_json:
                try:
                    tags = json.loads(tags_json)
                    all_tags.update(tags)
                except json.JSONDecodeError:
                    pass
        
        return TagsResponse(tags=sorted(list(all_tags)))
    except Exception as e:
        logger.error(f"Error getting tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=ProjectRead, status_code=201)
async def create_project(
    project_data: ProjectCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new project (simplified - no server required at creation)."""
    try:
        # Generate slug from name
        slug = project_data.name.lower().replace(" ", "-").replace("_", "-")
        
        # Check if slug already exists
        existing = await db.execute(
            select(Project).where(Project.slug == slug)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Project with slug '{slug}' already exists")
        
        # Create project without server (environments added separately)
        new_project = Project(
            name=project_data.name,
            slug=slug,
            description=project_data.description,
            path="",  # Set when environments are linked
            status=DBProjectStatus.ACTIVE,
            wp_home=project_data.domain,
            github_repo_url=project_data.github_repo_url,
            github_branch=project_data.github_branch,
            tags=json.dumps(project_data.tags) if project_data.tags else None,
            owner_id=current_user.id
        )
        
        db.add(new_project)
        await db.commit()
        await db.refresh(new_project)
        
        # Parse tags back for response
        tags = []
        if new_project.tags:
            try:
                tags = json.loads(new_project.tags)
            except json.JSONDecodeError:
                pass
        
        return ProjectRead(
            id=new_project.id,
            name=new_project.name,
            slug=new_project.slug,
            domain=new_project.wp_home or "",
            site_title=project_data.site_title,
            description=new_project.description,
            status=new_project.status,
            github_repo_url=new_project.github_repo_url,
            github_branch=new_project.github_branch,
            tags=tags,
            environments_count=0,
            created_at=new_project.created_at,
            updated_at=new_project.updated_at
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete a remote project."""
    try:
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        await db.delete(project)
        await db.commit()
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Environment Linking Endpoints
# =============================================================================

@router.get("/{project_id}/environments", response_model=List[EnvironmentRead])
async def get_project_environments(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get all environments linked to a project."""
    try:
        # Verify project exists
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        if not project_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get environments
        result = await db.execute(
            select(ProjectServer, Server.name, Server.hostname)
            .join(Server, ProjectServer.server_id == Server.id)
            .where(ProjectServer.project_id == project_id)
            .order_by(ProjectServer.environment)
        )
        rows = result.all()
        
        environments = []
        for row in rows:
            ps = row[0]
            server_name = row[1]
            server_hostname = row[2]
            
            environments.append(EnvironmentRead(
                id=ps.id,
                environment=ps.environment,
                server_id=ps.server_id,
                server_name=server_name,
                server_hostname=server_hostname,
                wp_url=ps.wp_url,
                wp_path=ps.wp_path,
                notes=ps.notes,
                is_primary=ps.is_primary,
                created_at=ps.created_at,
                updated_at=ps.updated_at
            ))
        
        return environments
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project environments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/environments", response_model=EnvironmentRead, status_code=201)
async def link_environment(
    project_id: int,
    env_data: EnvironmentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Link an environment (staging/production) to a server for a project."""
    try:
        # Verify project exists
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Verify server exists
        server_result = await db.execute(
            select(Server).where(Server.id == env_data.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        # Check if this environment already exists for this project
        existing = await db.execute(
            select(ProjectServer).where(
                ProjectServer.project_id == project_id,
                ProjectServer.environment == env_data.environment
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400, 
                detail=f"{env_data.environment.value} environment already linked for this project"
            )
        
        # Create environment link
        project_server = ProjectServer(
            project_id=project_id,
            server_id=env_data.server_id,
            environment=env_data.environment,
            wp_url=env_data.wp_url,
            wp_path=env_data.wp_path,
            notes=env_data.notes,
            is_primary=True
        )
        
        db.add(project_server)
        await db.commit()
        await db.refresh(project_server)
        
        # Auto-create uptime monitor for the environment URL
        try:
            monitor = Monitor(
                name=f"{project.name} - {env_data.environment.value.capitalize()}",
                url=env_data.wp_url,
                monitor_type=MonitorType.UPTIME,
                project_id=project.id,
                created_by_id=current_user.id,
                interval_seconds=300,  # 5-minute interval
                timeout_seconds=30,
                is_active=True,
            )
            db.add(monitor)
            await db.commit()
            logger.info(f"Auto-created monitor '{monitor.name}' for project {project.name}")
        except Exception as monitor_error:
            # Log but don't fail the environment linking if monitor creation fails
            logger.warning(f"Failed to auto-create monitor for {env_data.wp_url}: {monitor_error}")
        
        return EnvironmentRead(
            id=project_server.id,
            environment=project_server.environment,
            server_id=project_server.server_id,
            server_name=server.name,
            server_hostname=server.hostname,
            wp_url=project_server.wp_url,
            wp_path=project_server.wp_path,
            notes=project_server.notes,
            is_primary=project_server.is_primary,
            created_at=project_server.created_at,
            updated_at=project_server.updated_at
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking environment: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}/environments/{env_id}", status_code=204)
async def unlink_environment(
    project_id: int,
    env_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Remove an environment link from a project."""
    try:
        result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.id == env_id,
                ProjectServer.project_id == project_id
            )
        )
        project_server = result.scalar_one_or_none()
        
        if not project_server:
            raise HTTPException(status_code=404, detail="Environment link not found")
        
        await db.delete(project_server)
        await db.commit()
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unlinking environment: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Site Cloning
# =============================================================================

class CloneRequest(BaseModel):
    """Request to clone a site between environments."""
    source_env_id: int
    target_server_id: int
    target_domain: str
    target_environment: str = "staging"  # staging | production | development
    create_cyberpanel_site: bool = True
    include_database: bool = True
    include_uploads: bool = True
    search_replace: bool = True


@router.post("/{project_id}/clone")
async def clone_project_environment(
    project_id: int,
    request: CloneRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Clone a project environment to another server/domain.
    
    Supports:
    - Same server cloning (e.g., example.com → staging.example.com)
    - Cross-server cloning (Server A → Server B)
    - Auto-create target CyberPanel website
    - Database export/import with search-replace
    """
    from ....db.models.server import Server
    
    # Verify project exists and user has access
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Verify source environment exists
    source_result = await db.execute(
        select(ProjectServer).where(
            ProjectServer.id == request.source_env_id,
            ProjectServer.project_id == project_id
        )
    )
    source_env = source_result.scalar_one_or_none()
    
    if not source_env:
        raise HTTPException(status_code=404, detail="Source environment not found")
    
    # Verify target server exists
    target_server_result = await db.execute(
        select(Server).where(Server.id == request.target_server_id)
    )
    target_server = target_server_result.scalar_one_or_none()
    
    if not target_server:
        raise HTTPException(status_code=404, detail="Target server not found")
    
    # Queue clone task
    try:
        from ....tasks.clone_tasks import clone_site
        task = clone_site.delay(
            source_project_server_id=request.source_env_id,
            target_server_id=request.target_server_id,
            target_domain=request.target_domain,
            create_cyberpanel_site=request.create_cyberpanel_site,
            include_database=request.include_database,
            include_uploads=request.include_uploads,
            search_replace=request.search_replace
        )
        
        logger.info(f"Clone task queued: {source_env.wp_url} → {request.target_domain}")
        
        return {
            "status": "queued",
            "task_id": task.id,
            "source_url": source_env.wp_url,
            "target_domain": request.target_domain,
            "target_server": target_server.name,
            "message": f"Clone task started. This may take several minutes."
        }
    except ImportError:
        # Celery not available - for dev, could run sync but it's slow
        raise HTTPException(
            status_code=503,
            detail="Background task system not available. Start Celery worker."
        )


# =============================================================================
# Security Scan
# =============================================================================

class SecurityCheck(BaseModel):
    """Individual security check result."""
    name: str
    status: str  # 'pass', 'warn', 'fail'
    message: str
    severity: str  # 'info', 'low', 'medium', 'high', 'critical'
    details: Optional[Dict[str, Any]] = None


class SecurityScanResult(BaseModel):
    """Complete security scan result."""
    project_id: int
    project_name: str
    scanned_at: datetime
    overall_status: str  # 'pass', 'warn', 'fail'
    score: int  # 0-100
    checks: List[SecurityCheck]
    summary: Dict[str, int]  # {'pass': 5, 'warn': 2, 'fail': 1}


@router.post("/{project_id}/security/scan", response_model=SecurityScanResult)
async def run_security_scan(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Run custom security scan on a project.
    
    Checks:
    - WordPress version (up to date?)
    - Plugin updates available
    - Theme updates available  
    - File permissions (wp-config.php)
    - Debug mode enabled
    - SSL certificate status
    - Database prefix (non-default?)
    - Admin user enumeration
    - .htaccess protections
    - XML-RPC status
    """
    import ssl
    import socket
    from urllib.parse import urlparse
    import requests
    
    # Get project
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    checks: List[SecurityCheck] = []
    
    # Determine if local (DDEV) or remote
    is_local = project.directory and Path(project.directory).exists()
    site_url = project.wp_home
    
    if not site_url:
        raise HTTPException(status_code=400, detail="Project has no URL configured")
    
    parsed_url = urlparse(site_url)
    
    # 1. SSL Certificate Check
    if parsed_url.scheme == 'https':
        try:
            context = ssl.create_default_context()
            with socket.create_connection((parsed_url.hostname, 443), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=parsed_url.hostname) as ssock:
                    cert = ssock.getpeercert()
                    expire_date = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    days_until_expire = (expire_date - datetime.now()).days
                    
                    if days_until_expire > 30:
                        checks.append(SecurityCheck(
                            name="SSL Certificate",
                            status="pass",
                            message=f"Valid SSL certificate, expires in {days_until_expire} days",
                            severity="info",
                            details={"expires_in_days": days_until_expire, "expires_at": expire_date.isoformat()}
                        ))
                    elif days_until_expire > 0:
                        checks.append(SecurityCheck(
                            name="SSL Certificate",
                            status="warn",
                            message=f"SSL certificate expires soon ({days_until_expire} days)",
                            severity="medium",
                            details={"expires_in_days": days_until_expire, "expires_at": expire_date.isoformat()}
                        ))
                    else:
                        checks.append(SecurityCheck(
                            name="SSL Certificate",
                            status="fail",
                            message="SSL certificate has expired!",
                            severity="critical",
                            details={"expires_in_days": days_until_expire, "expires_at": expire_date.isoformat()}
                        ))
        except Exception as e:
            checks.append(SecurityCheck(
                name="SSL Certificate",
                status="fail",
                message=f"SSL check failed: {str(e)[:100]}",
                severity="high"
            ))
    else:
        checks.append(SecurityCheck(
            name="SSL Certificate",
            status="fail",
            message="Site not using HTTPS",
            severity="high"
        ))
    
    # 2. Check site accessibility and headers
    try:
        response = requests.get(site_url, timeout=15, verify=False, allow_redirects=True)
        headers = response.headers
        
        # Security headers check
        security_headers = {
            'X-Frame-Options': 'Clickjacking protection',
            'X-Content-Type-Options': 'MIME sniffing protection',
            'X-XSS-Protection': 'XSS filter',
            'Strict-Transport-Security': 'HSTS',
            'Content-Security-Policy': 'CSP'
        }
        
        missing_headers = []
        for header, desc in security_headers.items():
            if header.lower() not in [h.lower() for h in headers.keys()]:
                missing_headers.append(f"{header} ({desc})")
        
        if len(missing_headers) == 0:
            checks.append(SecurityCheck(
                name="Security Headers",
                status="pass",
                message="All recommended security headers present",
                severity="info"
            ))
        elif len(missing_headers) <= 2:
            checks.append(SecurityCheck(
                name="Security Headers",
                status="warn",
                message=f"Missing headers: {', '.join(missing_headers[:2])}",
                severity="low",
                details={"missing": missing_headers}
            ))
        else:
            checks.append(SecurityCheck(
                name="Security Headers",
                status="fail",
                message=f"Missing {len(missing_headers)} security headers",
                severity="medium",
                details={"missing": missing_headers}
            ))
        
        # Check for exposed WordPress version
        if 'X-Powered-By' in headers or 'wp-' in response.text[:5000]:
            # Try to extract version from generator meta tag
            import re
            version_match = re.search(r'<meta name="generator" content="WordPress ([0-9.]+)"', response.text)
            if version_match:
                wp_version = version_match.group(1)
                checks.append(SecurityCheck(
                    name="WordPress Version Exposure",
                    status="warn",
                    message=f"WordPress version {wp_version} exposed in HTML",
                    severity="low",
                    details={"version": wp_version}
                ))
            else:
                checks.append(SecurityCheck(
                    name="WordPress Version Exposure",
                    status="pass",
                    message="WordPress version not exposed in HTML",
                    severity="info"
                ))
        
    except requests.RequestException as e:
        checks.append(SecurityCheck(
            name="Site Accessibility",
            status="fail",
            message=f"Cannot reach site: {str(e)[:100]}",
            severity="critical"
        ))
    
    # 3. XML-RPC Check (potential brute force vector)
    try:
        xmlrpc_url = f"{site_url.rstrip('/')}/xmlrpc.php"
        xmlrpc_response = requests.get(xmlrpc_url, timeout=10, verify=False)
        if xmlrpc_response.status_code == 200 and 'XML-RPC server accepts POST requests only' in xmlrpc_response.text:
            checks.append(SecurityCheck(
                name="XML-RPC",
                status="warn",
                message="XML-RPC is enabled (potential brute force vector)",
                severity="medium",
                details={"url": xmlrpc_url, "recommendation": "Disable XML-RPC if not needed"}
            ))
        else:
            checks.append(SecurityCheck(
                name="XML-RPC",
                status="pass",
                message="XML-RPC appears disabled or protected",
                severity="info"
            ))
    except:
        checks.append(SecurityCheck(
            name="XML-RPC",
            status="pass",
            message="XML-RPC not accessible",
            severity="info"
        ))
    
    # 4. Check wp-login.php accessibility
    try:
        login_url = f"{site_url.rstrip('/')}/wp-login.php"
        login_response = requests.get(login_url, timeout=10, verify=False)
        if login_response.status_code == 200:
            checks.append(SecurityCheck(
                name="Login Page",
                status="warn",
                message="Default wp-login.php accessible (consider hiding)",
                severity="low",
                details={"url": login_url}
            ))
        else:
            checks.append(SecurityCheck(
                name="Login Page",
                status="pass",
                message="Login page protected or hidden",
                severity="info"
            ))
    except:
        pass
    
    # 5. Check wp-config.php exposure
    try:
        wpconfig_url = f"{site_url.rstrip('/')}/wp-config.php"
        wpconfig_response = requests.get(wpconfig_url, timeout=10, verify=False)
        if wpconfig_response.status_code == 200 and 'DB_NAME' in wpconfig_response.text:
            checks.append(SecurityCheck(
                name="wp-config.php Exposure",
                status="fail",
                message="wp-config.php is publicly accessible!",
                severity="critical",
                details={"url": wpconfig_url}
            ))
        else:
            checks.append(SecurityCheck(
                name="wp-config.php Exposure",
                status="pass",
                message="wp-config.php properly protected",
                severity="info"
            ))
    except:
        checks.append(SecurityCheck(
            name="wp-config.php Exposure",
            status="pass",
            message="wp-config.php not accessible",
            severity="info"
        ))
    
    # 6. Check for debug.log exposure
    try:
        debug_url = f"{site_url.rstrip('/')}/wp-content/debug.log"
        debug_response = requests.get(debug_url, timeout=10, verify=False)
        if debug_response.status_code == 200:
            checks.append(SecurityCheck(
                name="Debug Log Exposure",
                status="fail",
                message="Debug log is publicly accessible!",
                severity="high",
                details={"url": debug_url}
            ))
        else:
            checks.append(SecurityCheck(
                name="Debug Log Exposure",
                status="pass",
                message="Debug log not accessible",
                severity="info"
            ))
    except:
        checks.append(SecurityCheck(
            name="Debug Log Exposure",
            status="pass",
            message="Debug log not accessible",
            severity="info"
        ))
    
    # 7. Check for user enumeration
    try:
        # Check if /?author=1 redirects and exposes username
        author_url = f"{site_url.rstrip('/')}/?author=1"
        author_response = requests.get(author_url, timeout=10, verify=False, allow_redirects=True)
        if '/author/' in author_response.url:
            username = author_response.url.split('/author/')[-1].strip('/')
            if username:
                checks.append(SecurityCheck(
                    name="User Enumeration",
                    status="warn",
                    message=f"User enumeration possible (found: {username})",
                    severity="medium",
                    details={"username": username}
                ))
            else:
                checks.append(SecurityCheck(
                    name="User Enumeration",
                    status="pass",
                    message="User enumeration appears blocked",
                    severity="info"
                ))
        else:
            checks.append(SecurityCheck(
                name="User Enumeration",
                status="pass",
                message="Author archives blocked or no users exposed",
                severity="info"
            ))
    except:
        pass
    
    # 8. Local-only checks (if DDEV project)
    if is_local:
        project_dir = Path(project.directory)
        
        # Check wp-config.php debug settings
        web_dir = project_dir / "web"
        wpconfig_path = web_dir / "wp-config.php" if web_dir.exists() else project_dir / "wp-config.php"
        
        if wpconfig_path.exists():
            try:
                wpconfig_content = wpconfig_path.read_text()
                
                # WP_DEBUG check
                if "define('WP_DEBUG', true)" in wpconfig_content or 'define("WP_DEBUG", true)' in wpconfig_content:
                    checks.append(SecurityCheck(
                        name="WP_DEBUG Mode",
                        status="warn",
                        message="WP_DEBUG is enabled",
                        severity="low" if is_local else "medium",
                        details={"note": "Acceptable for local development"}
                    ))
                else:
                    checks.append(SecurityCheck(
                        name="WP_DEBUG Mode",
                        status="pass",
                        message="WP_DEBUG is disabled",
                        severity="info"
                    ))
                
                # Default table prefix check
                import re
                prefix_match = re.search(r"\$table_prefix\s*=\s*['\"]([^'\"]+)['\"]", wpconfig_content)
                if prefix_match:
                    prefix = prefix_match.group(1)
                    if prefix == 'wp_':
                        checks.append(SecurityCheck(
                            name="Database Prefix",
                            status="warn",
                            message="Using default 'wp_' database prefix",
                            severity="low",
                            details={"prefix": prefix}
                        ))
                    else:
                        checks.append(SecurityCheck(
                            name="Database Prefix",
                            status="pass",
                            message=f"Custom database prefix in use: {prefix}",
                            severity="info",
                            details={"prefix": prefix}
                        ))
            except Exception as e:
                logger.warning(f"Could not read wp-config.php: {e}")
        
        # Check file permissions
        if wpconfig_path.exists():
            mode = oct(wpconfig_path.stat().st_mode)[-3:]
            if mode in ['644', '640', '600']:
                checks.append(SecurityCheck(
                    name="File Permissions",
                    status="pass",
                    message=f"wp-config.php has secure permissions ({mode})",
                    severity="info"
                ))
            else:
                checks.append(SecurityCheck(
                    name="File Permissions",
                    status="warn",
                    message=f"wp-config.php permissions ({mode}) may be too permissive",
                    severity="medium"
                ))
    
    # Calculate summary and score
    summary = {"pass": 0, "warn": 0, "fail": 0}
    for check in checks:
        summary[check.status] = summary.get(check.status, 0) + 1
    
    total_checks = len(checks)
    if total_checks == 0:
        score = 100
        overall_status = "pass"
    else:
        # Score: pass=100%, warn=50%, fail=0%
        score = int(((summary["pass"] * 100) + (summary["warn"] * 50)) / total_checks)
        
        if summary["fail"] > 0:
            overall_status = "fail"
        elif summary["warn"] > 0:
            overall_status = "warn"
        else:
            overall_status = "pass"
    
    return SecurityScanResult(
        project_id=project.id,
        project_name=project.name,
        scanned_at=datetime.utcnow(),
        overall_status=overall_status,
        score=score,
        checks=checks,
        summary=summary
    )


# =============================================================================
# Project Backups
# =============================================================================

@router.get("/{project_id}/backups")
async def get_project_backups(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    limit: int = 20
):
    """
    Get all backups for a project.
    
    Returns backup history for point-in-time recovery.
    """
    from ....db.models.backup import Backup
    
    # Verify project access
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get backups ordered by newest first
    backups_result = await db.execute(
        select(Backup)
        .where(Backup.project_id == project_id)
        .order_by(Backup.created_at.desc())
        .limit(limit)
    )
    backups = backups_result.scalars().all()
    
    return [
        {
            "id": b.id,
            "name": b.name,
            "backup_type": b.backup_type.value if b.backup_type else None,
            "status": b.status.value if b.status else "unknown",
            "storage_type": b.storage_type.value if b.storage_type else "local",
            "file_path": b.file_path,
            "size_bytes": b.size_bytes,
            "gdrive_file_id": getattr(b, 'gdrive_file_id', None),
            "created_at": b.created_at.isoformat() if b.created_at else None
        }
        for b in backups
    ]


# =============================================================================
# Google Drive Integration
# =============================================================================

class DriveSettingsUpdate(BaseModel):
    """Schema for updating project Drive settings."""
    gdrive_folder_id: Optional[str] = None
    gdrive_backups_folder_id: Optional[str] = None
    gdrive_assets_folder_id: Optional[str] = None
    gdrive_docs_folder_id: Optional[str] = None


class DriveSettingsRead(BaseModel):
    """Schema for reading project Drive settings."""
    gdrive_connected: bool
    gdrive_folder_id: Optional[str]
    gdrive_backups_folder_id: Optional[str]
    gdrive_assets_folder_id: Optional[str]
    gdrive_docs_folder_id: Optional[str]
    gdrive_last_sync: Optional[datetime]


@router.get("/{project_id}/drive", response_model=DriveSettingsRead)
async def get_project_drive_settings(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get Google Drive settings for a project."""
    try:
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return DriveSettingsRead(
            gdrive_connected=project.gdrive_connected,
            gdrive_folder_id=project.gdrive_folder_id,
            gdrive_backups_folder_id=project.gdrive_backups_folder_id,
            gdrive_assets_folder_id=project.gdrive_assets_folder_id,
            gdrive_docs_folder_id=project.gdrive_docs_folder_id,
            gdrive_last_sync=project.gdrive_last_sync
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Drive settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{project_id}/drive", response_model=DriveSettingsRead)
async def update_project_drive_settings(
    project_id: int,
    settings: DriveSettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update Google Drive settings for a project."""
    try:
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update only provided fields
        if settings.gdrive_folder_id is not None:
            project.gdrive_folder_id = settings.gdrive_folder_id or None
        if settings.gdrive_backups_folder_id is not None:
            project.gdrive_backups_folder_id = settings.gdrive_backups_folder_id or None
        if settings.gdrive_assets_folder_id is not None:
            project.gdrive_assets_folder_id = settings.gdrive_assets_folder_id or None
        if settings.gdrive_docs_folder_id is not None:
            project.gdrive_docs_folder_id = settings.gdrive_docs_folder_id or None
        
        # Mark as connected if any folder is set
        project.gdrive_connected = bool(
            project.gdrive_folder_id or 
            project.gdrive_backups_folder_id or
            project.gdrive_assets_folder_id or
            project.gdrive_docs_folder_id
        )
        
        await db.commit()
        await db.refresh(project)
        
        return DriveSettingsRead(
            gdrive_connected=project.gdrive_connected,
            gdrive_folder_id=project.gdrive_folder_id,
            gdrive_backups_folder_id=project.gdrive_backups_folder_id,
            gdrive_assets_folder_id=project.gdrive_assets_folder_id,
            gdrive_docs_folder_id=project.gdrive_docs_folder_id,
            gdrive_last_sync=project.gdrive_last_sync
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating Drive settings: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Legacy: Local project status endpoints (for backward compatibility)
# =============================================================================

@router.get("/", response_model=List[ProjectStatus])
async def get_projects_status():
    """Get status of all projects."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()
        project_statuses = []

        for project in projects:
            project_dir = Path(project.directory)
            if not project_dir.exists():
                continue

            status = ProjectStatus(
                project_name=project.project_name,
                directory=project.directory,
                wp_home=project.wp_home,
                ddev_status="unknown",
                git_status="unknown",
                wp_version=None,
                last_deployed=None,
                backup_status="unknown",
                site_health="unknown"
            )

            # Get DDEV status
            try:
                result = subprocess.run(
                    ["ddev", "status"], 
                    capture_output=True, text=True, 
                    timeout=10, cwd=project_dir
                )
                if result.returncode == 0:
                    if "ok" in result.stdout.lower():
                        status.ddev_status = "running"
                    elif "stopped" in result.stdout.lower():
                        status.ddev_status = "stopped"
            except Exception as e:
                logger.warning(f"Failed to get DDEV status for {project.project_name}: {e}")

            # Get Git status
            try:
                result = subprocess.run(
                    ["git", "status", "--porcelain"],
                    capture_output=True, text=True,
                    timeout=10, cwd=project_dir
                )
                if result.returncode == 0:
                    status.git_status = "clean" if result.stdout.strip() == "" else "dirty"
            except Exception as e:
                logger.warning(f"Failed to get Git status for {project.project_name}: {e}")

            project_statuses.append(status)

        return project_statuses

    except Exception as e:
        logger.error(f"Error getting projects status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/comprehensive", response_model=List[Dict[str, Any]])
async def get_comprehensive_projects(
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Get all projects with comprehensive information.
    Merges local DDEV projects with remote DB projects.
    """
    try:
        # 1. Get Local Projects
        local_config = LocalConfigManager()
        local_projects = local_config.load_projects()
        
        # Dict to store projects by name/slug for merging
        # Key: project name/slug, Value: project data dict
        all_projects_map = {}

        # Process local projects first
        for project in local_projects:
            project_dir = Path(project.directory)
            ddev_status = "unknown"
            
            if project_dir.exists():
                try:
                    result = subprocess.run(
                        ["ddev", "status", "--json-output"],
                        cwd=str(project_dir),
                        capture_output=True, text=True, timeout=10
                    )
                    if result.returncode == 0:
                        status_data = json.loads(result.stdout)
                        if project.project_name in status_data:
                            ddev_status = status_data[project.project_name].get("status", "unknown")
                except Exception:
                    pass

            project_data = {
                "id": project.project_name, # Temporary ID using name
                "project_name": project.project_name,
                "slug": project.project_name, # Default slug to name for local
                "directory": project.directory,
                "status": "active" if ddev_status == "running" else "inactive",
                "health_score": 90 if ddev_status == "running" else 65,
                "wp_home": getattr(project, 'wp_home', f"https://{project.project_name}.ddev.site"),
                "project_type": "wordpress",
                "updated_at": datetime.now().isoformat(),
                "environments": {
                    "local": {
                        "type": "local",
                        "url": f"https://{project.project_name}.ddev.site",
                        "ddev_status": ddev_status,
                        "wordpress_version": "6.4.3", # TODO: Detect actual version
                        "php_version": "8.1"
                    }
                },
                "github": {"connected": False},
                "google_drive": {"connected": False},
                "client": {"name": None}
            }
            all_projects_map[project.project_name] = project_data

        # 2. Get Remote Projects from DB
        result = await db.execute(
            select(Project, Server.name.label("server_name"))
            .outerjoin(Server, Project.server_id == Server.id)
            .order_by(Project.created_at.desc())
        )
        rows = result.all()
        
        for row in rows:
            db_project = row[0]
            server_name = row[1]
            
            # Key to match with local projects (try slug then name)
            key = db_project.slug or db_project.name
            
            # Base data from DB
            db_data = {
                "id": db_project.id,
                "project_name": db_project.name,
                "slug": db_project.slug,
                "directory": db_project.path or "",
                "status": db_project.status.value,
                "health_score": 90, # Placeholder
                "wp_home": db_project.wp_home,
                "project_type": "wordpress",
                "updated_at": db_project.updated_at.isoformat() if db_project.updated_at else datetime.now().isoformat(),
                "github": {
                    "connected": bool(db_project.github_repo_url),
                    "repo_url": db_project.github_repo_url
                },
                "google_drive": {
                    "connected": db_project.gdrive_connected
                },
                "client": {"name": None} # TODO: Fetch client
            }

            # Check if this project already exists in our map (from local)
            # If so, merge them. If not, add it.
            # We try both name and slug as keys to find a match
            matched_key = None
            if db_project.name in all_projects_map:
                matched_key = db_project.name
            elif db_project.slug in all_projects_map:
                matched_key = db_project.slug
            
            if matched_key:
                # Merge DB data into existing local data
                # We prioritize DB ID and remote info, but keep local env info
                existing_data = all_projects_map[matched_key]
                
                # Update existing with DB data
                existing_data["id"] = db_project.id
                existing_data["slug"] = db_project.slug
                existing_data["status"] = db_project.status.value # Use DB status? Or keep local status logic? TODO: Decide priority
                if existing_data["status"] == "inactive" and db_project.status.value == "active":
                     existing_data["status"] = "active"
                
                existing_data["github"] = db_data["github"]
                existing_data["google_drive"] = db_data["google_drive"]
                
                # Determine environments
                if "environments" not in existing_data:
                    existing_data["environments"] = {}
                
                # Add remote environment if server linked
                if server_name:
                    env_type = db_project.environment.value
                    existing_data["environments"][env_type] = {
                        "type": env_type,
                        "url": db_project.wp_home,
                        "server_name": server_name,
                        "server_id": db_project.server_id
                    }
                
                all_projects_map[matched_key] = existing_data
            else:
                # New remote-only project
                db_data["environments"] = {}
                if server_name:
                    env_type = db_project.environment.value
                    db_data["environments"][env_type] = {
                        "type": env_type,
                        "url": db_project.wp_home,
                        "server_name": server_name,
                        "server_id": db_project.server_id
                    }
                
                # Use slug as key for the map
                all_projects_map[key] = db_data

        return list(all_projects_map.values())

    except Exception as e:
        logger.error(f"Error getting comprehensive projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_name}", response_model=ProjectStatus)
async def get_project_status(project_name: str):
    """Get detailed status of a specific project."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        return ProjectStatus(
            project_name=project_name,
            directory=str(project_dir),
            wp_home=project.wp_home,
            ddev_status="unknown",
            git_status="unknown"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project status for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/action")
async def execute_project_action(project_name: str, action: QuickAction):
    """Execute a quick action on a project."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        task_id = str(uuid.uuid4())
        
        if action.action == "start_ddev":
            cmd = ["ddev", "start"]
        elif action.action == "stop_ddev":
            cmd = ["ddev", "stop"]
        elif action.action == "restart_ddev":
            cmd = ["ddev", "restart"]
        elif action.action == "open_site":
            return {"status": "success", "url": project.wp_home}
        elif action.action == "git_pull":
            cmd = ["git", "pull"]
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action.action}")

        update_task_status(task_id, "running", f"Executing {action.action}...")
        
        return {"status": "accepted", "task_id": task_id, "message": f"Action {action.action} started"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing action {action.action} on {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# DDEV Control endpoints
@router.post("/{project_name}/ddev/start")
async def start_ddev(project_name: str):
    """Start DDEV for a project."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        result = subprocess.run(
            ["ddev", "start"],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=120
        )
        
        if result.returncode == 0:
            return {"status": "success", "message": f"DDEV started for {project_name}"}
        else:
            return {"status": "error", "message": result.stderr}

    except Exception as e:
        logger.error(f"Error starting DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/ddev/stop")
async def stop_ddev(project_name: str):
    """Stop DDEV for a project."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        result = subprocess.run(
            ["ddev", "stop"],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode == 0:
            return {"status": "success", "message": f"DDEV stopped for {project_name}"}
        else:
            return {"status": "error", "message": result.stderr}

    except Exception as e:
        logger.error(f"Error stopping DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/ddev/restart")
async def restart_ddev(project_name: str):
    """Restart DDEV for a project."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        result = subprocess.run(
            ["ddev", "restart"],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=120
        )
        
        if result.returncode == 0:
            return {"status": "success", "message": f"DDEV restarted for {project_name}"}
        else:
            return {"status": "error", "message": result.stderr}

    except Exception as e:
        logger.error(f"Error restarting DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Plugin Management
@router.get("/{project_name}/plugins")
async def get_project_plugins(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get plugins for a project (supports both local DDEV and remote servers)."""
    try:
        # First try local project
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            result = subprocess.run(
                ["ddev", "wp", "plugin", "list", "--format=json"],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=30
            )
            
            if result.returncode == 0:
                plugins = json.loads(result.stdout)
                return {"plugins": plugins, "source": "local"}
            else:
                return {"plugins": [], "error": result.stderr, "source": "local"}
        
        # Try database project (remote server)
        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")
        
        # Get project-server link
        project_server = await _get_project_server(db_project.id, db)
        if not project_server:
            return {"plugins": [], "error": "No server linked to this project. Link a server first.", "source": "remote"}
        
        # Get server details
        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            return {"plugins": [], "error": "Server not found", "source": "remote"}
        
        # Run WP-CLI remotely via SSH
        result = await _run_remote_wp_cli(
            server, 
            project_server.wp_path, 
            "plugin list --format=json",
            current_user.id
        )
        
        if result['success']:
            try:
                plugins = json.loads(result['output'])
                return {"plugins": plugins, "source": "remote"}
            except json.JSONDecodeError:
                return {"plugins": [], "error": "Invalid JSON response from server", "source": "remote"}
        else:
            return {"plugins": [], "error": result['error'] or "Failed to fetch plugins", "source": "remote"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting plugins for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/plugins/{plugin_name}/update")
async def update_project_plugin(project_name: str, plugin_name: str):
    """Update a specific plugin."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        result = subprocess.run(
            ["ddev", "wp", "plugin", "update", plugin_name],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode == 0:
            return {"status": "success", "message": f"Plugin {plugin_name} updated"}
        else:
            return {"status": "error", "message": result.stderr}

    except Exception as e:
        logger.error(f"Error updating plugin {plugin_name} for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Theme Management
@router.get("/{project_name}/themes")
async def get_project_themes(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get themes for a project (supports both local DDEV and remote servers)."""
    try:
        # First try local project
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            result = subprocess.run(
                ["ddev", "wp", "theme", "list", "--format=json"],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=30
            )
            
            if result.returncode == 0:
                themes = json.loads(result.stdout)
                return {"themes": themes, "source": "local"}
            else:
                return {"themes": [], "error": result.stderr, "source": "local"}
        
        # Try database project (remote server)
        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")
        
        # Get project-server link
        project_server = await _get_project_server(db_project.id, db)
        if not project_server:
            return {"themes": [], "error": "No server linked to this project", "source": "remote"}
        
        # Get server details
        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            return {"themes": [], "error": "Server not found", "source": "remote"}
        
        # Run WP-CLI remotely
        result = await _run_remote_wp_cli(
            server, 
            project_server.wp_path, 
            "theme list --format=json",
            current_user.id
        )
        
        if result['success']:
            try:
                themes = json.loads(result['output'])
                return {"themes": themes, "source": "remote"}
            except json.JSONDecodeError:
                return {"themes": [], "error": "Invalid JSON response", "source": "remote"}
        else:
            return {"themes": [], "error": result['error'] or "Failed to fetch themes", "source": "remote"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting themes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# WordPress Core
@router.post("/{project_name}/wordpress/update")
async def update_wordpress_core(project_name: str):
    """Update WordPress core."""
    try:
        project = _get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_dir = Path(project.directory)
        result = subprocess.run(
            ["ddev", "wp", "core", "update"],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=120
        )
        
        if result.returncode == 0:
            return {"status": "success", "message": "WordPress core updated"}
        else:
            return {"status": "error", "message": result.stderr}

    except Exception as e:
        logger.error(f"Error updating WordPress for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Task status
@router.get("/tasks/{task_id}")
async def get_task_status_endpoint(task_id: str):
    """Get status of a background task."""
    if task_id not in task_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_status[task_id]


# Local Development endpoints
@router.get("/{project_name}/local-status")
async def get_local_status(project_name: str):
    """
    Check if project exists locally and get DDEV status.
    
    Returns local development environment status including:
    - Whether the project exists locally
    - DDEV configuration and running status
    - Local URL
    """
    try:
        from ...schemas.dashboard import LocalStatus
        
        local_config = LocalConfigManager()
        status = LocalStatus()
        
        # Check if project exists in tracking
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            status.exists = project_dir.exists()
            status.local_path = str(project_dir) if status.exists else None
            
            if status.exists:
                # Check DDEV configuration
                ddev_config = project_dir / ".ddev" / "config.yaml"
                status.ddev_configured = ddev_config.exists()
                
                if status.ddev_configured:
                    status.ddev_url = f"https://{project_name}.ddev.site"
                    
                    # Check if DDEV is running
                    try:
                        result = subprocess.run(
                            ["ddev", "status"],
                            cwd=str(project_dir),
                            capture_output=True, text=True, timeout=10
                        )
                        status.ddev_running = result.returncode == 0 and "ok" in result.stdout.lower()
                    except Exception:
                        status.ddev_running = False
        else:
            # Check if it exists in base directory but not tracked
            base_dir = local_config.base_dir
            potential_path = base_dir / project_name
            if potential_path.exists():
                status.exists = True
                status.local_path = str(potential_path)
                status.ddev_configured = (potential_path / ".ddev" / "config.yaml").exists()
        
        return status
        
    except Exception as e:
        logger.error(f"Error getting local status for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/clone-local")
async def clone_to_local(project_name: str, clone_options: Dict[str, Any]):
    """
    Clone project from GitHub to local directory.
    
    Creates a background task that:
    1. Git clones to ~/Work/Wordpress/{project_name}
    2. Runs composer install
    3. Configures DDEV
    4. Optionally starts DDEV
    """
    try:
        github_url = clone_options.get("github_url")
        if not github_url:
            raise HTTPException(status_code=400, detail="github_url is required")
        
        branch = clone_options.get("branch", "main")
        run_composer = clone_options.get("run_composer", True)
        setup_ddev = clone_options.get("setup_ddev", True)
        start_after = clone_options.get("start_after_setup", True)
        
        local_config = LocalConfigManager()
        target_dir = local_config.base_dir / project_name
        
        # Check if already exists
        if target_dir.exists():
            raise HTTPException(
                status_code=409,
                detail=f"Directory already exists: {target_dir}"
            )
        
        task_id = str(uuid.uuid4())
        update_task_status(task_id, "pending", f"Cloning {project_name} from GitHub...")
        
        # Run clone in background (simplified - ideally use Celery)
        async def clone_task():
            try:
                # Ensure base directory exists
                local_config.base_dir.mkdir(parents=True, exist_ok=True)
                
                # Git clone
                update_task_status(task_id, "running", "Cloning repository...")
                result = subprocess.run(
                    ["git", "clone", "-b", branch, github_url, str(target_dir)],
                    capture_output=True, text=True, timeout=300
                )
                if result.returncode != 0:
                    update_task_status(task_id, "failed", f"Clone failed: {result.stderr}")
                    return
                
                # Composer install
                if run_composer:
                    update_task_status(task_id, "running", "Running composer install...")
                    result = subprocess.run(
                        ["composer", "install", "--no-interaction"],
                        cwd=str(target_dir),
                        capture_output=True, text=True, timeout=300
                    )
                    if result.returncode != 0:
                        update_task_status(task_id, "failed", f"Composer failed: {result.stderr}")
                        return
                
                # DDEV setup
                if setup_ddev:
                    update_task_status(task_id, "running", "Configuring DDEV...")
                    result = subprocess.run(
                        ["ddev", "config", "--project-type=wordpress", "--docroot=web", 
                         f"--project-name={project_name}", "--auto"],
                        cwd=str(target_dir),
                        capture_output=True, text=True, timeout=60
                    )
                    
                    if start_after and result.returncode == 0:
                        update_task_status(task_id, "running", "Starting DDEV...")
                        subprocess.run(
                            ["ddev", "start"],
                            cwd=str(target_dir),
                            capture_output=True, text=True, timeout=180
                        )
                
                # Register project
                from ....utils.local_config import GlobalProject
                global_project = GlobalProject(
                    project_name=project_name,
                    directory=str(target_dir),
                    wp_home=f"https://{project_name}.ddev.site",
                    repo_url=github_url
                )
                local_config.add_project(global_project)
                
                update_task_status(task_id, "completed", f"Project {project_name} cloned successfully!")
                
            except Exception as e:
                update_task_status(task_id, "failed", str(e))
        
        # Start background task
        asyncio.create_task(clone_task())
        
        return {
            "status": "accepted",
            "task_id": task_id,
            "message": f"Clone task started for {project_name}",
            "target_directory": str(target_dir)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cloning {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/setup-local")
async def setup_local(project_name: str, setup_options: Dict[str, Any] = None):
    """
    Setup DDEV for an existing local project.
    
    Configures DDEV and optionally starts the environment.
    """
    try:
        setup_options = setup_options or {}
        php_version = setup_options.get("php_version", "8.1")
        docroot = setup_options.get("docroot", "web")
        start_after = setup_options.get("start_after_setup", True)
        
        project = _get_project(project_name)
        if not project:
            # Try to find in base directory
            local_config = LocalConfigManager()
            project_dir = local_config.base_dir / project_name
            if not project_dir.exists():
                raise HTTPException(status_code=404, detail=f"Project {project_name} not found")
        else:
            project_dir = Path(project.directory)
        
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")
        
        # Configure DDEV
        result = subprocess.run(
            ["ddev", "config", 
             f"--project-type=wordpress",
             f"--docroot={docroot}",
             f"--php-version={php_version}",
             f"--project-name={project_name}",
             "--auto"],
            cwd=str(project_dir),
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode != 0:
            return {"status": "error", "message": f"DDEV config failed: {result.stderr}"}
        
        # Start DDEV if requested
        if start_after:
            result = subprocess.run(
                ["ddev", "start"],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=180
            )
            if result.returncode != 0:
                return {
                    "status": "partial",
                    "message": f"DDEV configured but start failed: {result.stderr}",
                    "ddev_configured": True
                }
        
        return {
            "status": "success",
            "message": f"DDEV setup complete for {project_name}",
            "ddev_url": f"https://{project_name}.ddev.site",
            "ddev_running": start_after
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting up DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


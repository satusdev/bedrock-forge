"""
Projects API routes.

This module contains project management, DDEV control, plugins/themes management,
and WordPress core update endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse
from pathlib import Path
from typing import Dict, Any, List, Optional, Annotated
from datetime import datetime
from pydantic import BaseModel
import subprocess
import asyncio
import uuid
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, desc
from sqlalchemy.orm import joinedload

from ....utils.logging import logger
from ....utils.local_config import LocalConfigManager
from ...schemas import ProjectStatus, QuickAction
from ...schemas import ProjectCreate, ProjectUpdate, ProjectRead, ProjectSummary, LocalProject, TagsResponse
from ...schemas import EnvironmentCreate, EnvironmentUpdate, EnvironmentRead
from ...deps import get_task_status, update_task_status, get_current_active_user
from ....db import get_db
from ....db.models import Project, Server, User, Domain
from ....db.models.project import ProjectStatus as DBProjectStatus
from ....db.models.project_server import ProjectServer, ServerEnvironment
from ...dashboard_config import get_dashboard_config
from ....services.backup.storage.gdrive import GoogleDriveStorage
from ....db.models.monitor import Monitor, MonitorType
from ....services.wordpress import WordPressService
from ...schemas.wordpress import WPUser, WPUserCreate, MagicLoginResponse
from ...schemas import ProjectServerUpdate, ProjectServerRead
from ....services.monitor_service import MonitorService
from ....services.domain_service import DomainService

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
    # Prefer slug match (unique) to avoid multiple-row errors on name.
    result = await db.execute(
        select(Project).where(Project.slug == project_name)
    )
    project = result.scalar_one_or_none()
    if project:
        return project

    # Fallback: name match (non-unique). Return most recent.
    result = await db.execute(
        select(Project)
        .where(Project.name == project_name)
        .order_by(Project.created_at.desc())
    )
    return result.scalars().first()


async def _get_project_server(project_id: int, db: AsyncSession, environment: str = None):
    """Get a project-server link for a project, optionally filtered by environment."""
    from ....db.models.project_server import ServerEnvironment

    query = select(ProjectServer).where(ProjectServer.project_id == project_id)

    if environment:
        env_enum = ServerEnvironment(environment.lower())
        query = query.where(ProjectServer.environment == env_enum)

    # Prefer primary, then prefer production -> staging -> development, then newest
    env_priority = case(
        (ProjectServer.environment == ServerEnvironment.production, 0),
        (ProjectServer.environment == ServerEnvironment.staging, 1),
        (ProjectServer.environment == ServerEnvironment.development, 2),
        else_=3,
    )

    query = query.order_by(
        desc(ProjectServer.is_primary),
        env_priority,
        desc(ProjectServer.updated_at),
        desc(ProjectServer.created_at),
    )

    result = await db.execute(query)
    return result.scalars().first()


async def _run_remote_wp_cli(
    server: "Server", 
    wp_path: str, 
    command: str, 
    user_id: int,
    db: AsyncSession,
    project_server: "ProjectServer" = None
) -> dict:
    """
    Run WP-CLI command on remote server via SSH.
    
    Args:
        server: Server model with SSH credentials
        wp_path: WordPress installation path on the server
        command: WP-CLI command to run (without 'wp' prefix)
        user_id: User ID for decrypting credentials
        db: Database session for system key fallback
        project_server: Optional environment with SSH credential overrides
    
    Returns:
        dict with 'success', 'output', and 'error' keys
    """
    from ....utils.ssh import SSHConnection
    from ....utils.crypto import decrypt_credential
    
    from forge.services.ssh_service import SSHKeyService

    try:
        ssh = await SSHKeyService.get_configured_client(
            db,
            server,
            ssh_user=project_server.ssh_user if project_server else None,
            ssh_key_path=project_server.ssh_key_path if project_server else None
        )
        
        # Log credentials being used for debugging
        # Note: server.ssh_password might be encrypted string representation, we don't log it
        logger.info(f"SSH Connection: host={server.hostname}, port={server.ssh_port}")
        
        # Normalize path to avoid duplicate /web/web
        normalized_wp_path = (wp_path or "").rstrip("/")
        if "/web/web" in normalized_wp_path:
            normalized_wp_path = normalized_wp_path.replace("/web/web", "/web")

        # Detect Bedrock structure and find the correct path for wp-cli
        is_bedrock = (
            '/web/app' in normalized_wp_path
            or normalized_wp_path.endswith('/web/app')
            or normalized_wp_path.endswith('/web')
        )
        
        # For Bedrock, wp-cli should run from the bedrock root (parent of web/)
        if is_bedrock:
            if normalized_wp_path.endswith('/web/app'):
                cli_path = normalized_wp_path[:-8]  # Remove /web/app
            elif '/web/app' in normalized_wp_path:
                cli_path = normalized_wp_path.split('/web/app')[0]
            elif normalized_wp_path.endswith('/web'):
                cli_path = normalized_wp_path[:-4]  # Remove /web
            else:
                cli_path = normalized_wp_path
        else:
            cli_path = normalized_wp_path
        
        ssh_user = project_server.ssh_user if project_server and project_server.ssh_user else server.ssh_user
        extra_flags = ""
        if ssh_user == "root" and "--allow-root" not in command:
            extra_flags = " --allow-root"

        with ssh:
            # Run WP-CLI command
            wp_env = "PATH=$PATH:/usr/local/bin:/usr/bin:/bin"
            full_command = f"cd {cli_path} && {wp_env} wp {command}{extra_flags}"
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
                database_name=ps.database_name,
                database_user=ps.database_user,
                database_password=ps.database_password,
                notes=ps.notes,
                is_primary=ps.is_primary,
                gdrive_backups_folder_id=ps.gdrive_backups_folder_id,
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
        # Ensure environment is handled case-insensitively
        env_val = env_data.environment
        if hasattr(env_val, 'value'):
            env_val = env_val.value
        if isinstance(env_val, str):
            env_val = ServerEnvironment(env_val.lower())

        existing = await db.execute(
            select(ProjectServer).where(
                ProjectServer.project_id == project_id,
                ProjectServer.environment == env_val
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
            ssh_user=env_data.ssh_user,
            ssh_key_path=env_data.ssh_key_path,
            database_name=env_data.database_name,
            database_user=env_data.database_user,
            database_password=env_data.database_password,
            gdrive_backups_folder_id=env_data.gdrive_backups_folder_id,
            notes=env_data.notes,
            is_primary=True
        )
        
        db.add(project_server)
        await db.commit()
        await db.refresh(project_server)
        
        # Auto-create uptime monitor and sync domain
        try:
            # Monitor
            monitor_service = MonitorService(db)
            await monitor_service.create_monitor(
                 name=f"{project.name} - {env_data.environment.value.capitalize()}",
                 url=env_data.wp_url,
                 user_id=current_user.id,
                 project_id=project.id
            )
            logger.info(f"Auto-created monitor for project {project.name}")

            # Domain (only if project has client)
            # Domain (only if project has client OR fallback to internal)
            client_id = project.client_id
            
            if not client_id:
                # Try to find default internal client
                from ....db.models.client import Client
                internal_client = await db.execute(select(Client).where(Client.name == "Lamah Internal"))
                ic = internal_client.scalar_one_or_none()
                if ic:
                    client_id = ic.id
                    
            if client_id:
                domain_service = DomainService(db)
                await domain_service.sync_domain_from_url(
                    url=env_data.wp_url,
                    client_id=client_id,
                    project_id=project.id
                )
                logger.info(f"Auto-synced domain for project {project.name}")
            else:
                logger.info(f"Skipping domain sync: Project {project.name} has no client and 'Lamah Internal' not found")

        except Exception as service_error:
            # Log but don't fail the environment linking
            logger.warning(f"Failed to run auto-services for {env_data.wp_url}: {service_error}")
        
        return EnvironmentRead(
            id=project_server.id,
            environment=project_server.environment,
            server_id=project_server.server_id,
            server_name=server.name,
            server_hostname=server.hostname,
            wp_url=project_server.wp_url,
            wp_path=project_server.wp_path,
            notes=project_server.notes,
            gdrive_backups_folder_id=project_server.gdrive_backups_folder_id,
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
            
        # Decouple backups before deleting
        # We want to keep the backups but remove the link to this specific environment entry
        from ....db.models.backup import Backup
        from sqlalchemy import update
        
        await db.execute(
            update(Backup)
            .where(Backup.project_server_id == project_server.id)
            .values(project_server_id=None)
        )
        
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
            target_environment=request.target_environment,
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
    env_id: Optional[int] = None, # Optional environment ID
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    current_user: Annotated[User, Depends(get_current_active_user)] = None
):
    """
    Run custom security scan on a project.
    If env_id is provided, runs specific checks for that environment.
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
    
    # Determine target URL and environment type
    site_url = project.wp_home
    is_local = True
    remote_server = None
    remote_wp_path = None
    
    if env_id:
        env_result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.id == env_id,
                ProjectServer.project_id == project_id
            ).options(joinedload(ProjectServer.server))
        )
        env_link = env_result.scalar_one_or_none()
        
        if env_link:
            site_url = env_link.wp_url
            remote_server = env_link.server
            remote_wp_path = env_link.wp_path
            is_local = False
    elif project.directory and Path(project.directory).exists():
        is_local = True
    else:
        # Fallback to local config checks if no env specified and project dir doesn't look local?
        # Actually existing logic assumed local if project.directory exists.
        pass
    
    if not site_url:
        raise HTTPException(status_code=400, detail="Target environment has no URL configured")
    
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
    
    # 8. Local/Remote config checks
    if is_local and project.directory:
        # Existing local logic
        project_dir = Path(project.directory)
        web_dir = project_dir / "web"
        wpconfig_path = web_dir / "wp-config.php" if web_dir.exists() else project_dir / "wp-config.php"
        
        if wpconfig_path.exists():
            try:
                wpconfig_content = wpconfig_path.read_text()
                _check_wp_config_content(checks, wpconfig_content, oct(wpconfig_path.stat().st_mode)[-3:])
            except Exception as e:
                logger.warning(f"Could not read local wp-config: {e}")

    elif remote_server and remote_wp_path:
        # Remote SSH Logic
        try:
            from ...ssh import SSHClient
            ssh = SSHClient(remote_server, db)
            
            # Read wp-config.php
            # Typically at root or web root. We'll try configured path first.
            cmd = f"cat {remote_wp_path}/wp-config.php || cat {remote_wp_path}/web/wp-config.php"
            result = await ssh.run(cmd)
            
            if result.exit_status == 0:
                wpconfig_content = result.stdout
                
                # Check permissions (stat)
                perm_cmd = f"stat -c '%a' {remote_wp_path}/wp-config.php || stat -c '%a' {remote_wp_path}/web/wp-config.php"
                perm_result = await ssh.run(perm_cmd)
                mode = perm_result.stdout.strip() if perm_result.exit_status == 0 else "644" # fallback
                
                _check_wp_config_content(checks, wpconfig_content, mode)
            else:
                checks.append(SecurityCheck(
                    name="Configuration Check",
                    status="warn",
                    message="Could not read wp-config.php via SSH",
                    severity="medium"
                ))
                
        except Exception as e:
             checks.append(SecurityCheck(
                name="Remote Access",
                status="fail",
                message=f"SSH check failed: {str(e)}",
                severity="high"
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



def _check_wp_config_content(checks, wpconfig_content, mode):
    """Helper to check wp-config content strings."""
    # WP_DEBUG check
    if "define('WP_DEBUG', true)" in wpconfig_content or 'define("WP_DEBUG", true)' in wpconfig_content:
        checks.append(SecurityCheck(
            name="WP_DEBUG Mode",
            status="warn",
            message="WP_DEBUG is enabled",
            severity="medium",
            details={"note": "Disable in production"}
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
            
    # File permissions check
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


# =============================================================================
# Project Backups
# =============================================================================

@router.get("/{project_id}/backups")
async def get_project_backups(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    page: int = 1,
    page_size: int = 10
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
    
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    offset = (page - 1) * page_size

    total_result = await db.execute(
        select(func.count(Backup.id)).where(Backup.project_id == project_id)
    )
    total = total_result.scalar_one()

    backups_result = await db.execute(
        select(Backup)
        .where(Backup.project_id == project_id)
        .order_by(Backup.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    backups = backups_result.scalars().all()

    return {
        "items": [
            {
                "id": b.id,
                "name": b.name,
                "backup_type": b.backup_type.value if b.backup_type else None,
                "status": b.status.value if b.status else "unknown",
                "storage_type": b.storage_type.value if b.storage_type else "local",
                "file_path": b.storage_path,
                "size_bytes": b.size_bytes,
                "error_message": b.error_message,
                "notes": b.notes,
                "storage_file_id": b.storage_file_id,
                "drive_folder_id": b.drive_folder_id,
                "gdrive_file_id": b.storage_file_id,
                "gdrive_link": f"https://drive.google.com/drive/folders/{b.drive_folder_id}" if b.drive_folder_id and b.storage_type.value == "google_drive" else None,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "project_name": project.name
            }
            for b in backups
        ],
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{project_id}/environments/{env_id}/backups")
async def get_environment_backups(
    project_id: int,
    env_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    page: int = 1,
    page_size: int = 10
):
    """
    Get backups for a specific environment.
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

    # Verify environment exists
    env_result = await db.execute(
        select(ProjectServer).where(
            ProjectServer.id == env_id,
            ProjectServer.project_id == project_id
        )
    )
    if not env_result.scalar_one_or_none():
         raise HTTPException(status_code=404, detail="Environment not found")
    
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    offset = (page - 1) * page_size

    total_result = await db.execute(
        select(func.count(Backup.id)).where(
            Backup.project_id == project_id,
            Backup.project_server_id == env_id
        )
    )
    total = total_result.scalar_one()

    backups_result = await db.execute(
        select(Backup)
        .where(
            Backup.project_id == project_id,
            Backup.project_server_id == env_id
        )
        .order_by(Backup.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    backups = backups_result.scalars().all()
    
    return {
        "items": [
            {
                "id": b.id,
                "name": b.name,
                "backup_type": b.backup_type.value if b.backup_type else None,
                "status": b.status.value if b.status else "unknown",
                "storage_type": b.storage_type.value if b.storage_type else "local",
                "file_path": b.storage_path,
                "size_bytes": b.size_bytes,
                "error_message": b.error_message,
                "notes": b.notes,
                "storage_file_id": b.storage_file_id,
                "drive_folder_id": b.drive_folder_id,
                "gdrive_file_id": b.storage_file_id,
                "gdrive_link": f"https://drive.google.com/drive/folders/{b.drive_folder_id}" if b.drive_folder_id and b.storage_type.value == "google_drive" else None,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "project_name": project.name
            }
            for b in backups
        ],
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.post("/{project_id}/environments/{env_id}/backups", status_code=status.HTTP_202_ACCEPTED)
async def create_environment_backup(
    project_id: int,
    env_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    backup_type: str = "database",
    storage_type: str = "gdrive",
):
    """
    Create a backup for a specific environment.
    """
    import traceback
    
    try:
        logger.info(f"Starting environment backup backup for project {project_id}, env {env_id}")
        from ....db.models.backup import Backup
        from sqlalchemy.orm import joinedload
        from ....db.models.backup import BackupType as DBBackupType, BackupStatus as DBBackupStatus, BackupStorageType as StorageType
        
        # Verify project and environment
        project_result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.owner_id == current_user.id
            )
        )
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        env_result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.id == env_id,
                ProjectServer.project_id == project_id
            ).options(joinedload(ProjectServer.server))
        )
        env_link = env_result.scalar_one_or_none()

        if not env_link:
            raise HTTPException(status_code=404, detail="Environment not found")

        # Determine initial storage type/badge
        # Import correctly from forge.db.models.backup (4 levels up from api/routes/admin)
        from ....db.models.backup import BackupStorageType as StorageType, Backup, BackupType as DBBackupType, BackupStatus as DBBackupStatus
        
        initial_storage_type = StorageType.LOCAL
        if storage_type in ["gdrive", "both"]:
            initial_storage_type = StorageType.GOOGLE_DRIVE
        elif storage_type == "s3":
            initial_storage_type = StorageType.S3

        # Create PENDING backup record
        backup_record = Backup(
            project_id=project_id,
            name=f"Backup {env_link.environment.upper()} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            backup_type=DBBackupType(backup_type), # Use passed type
            status=DBBackupStatus.PENDING,
            storage_type=initial_storage_type, # Set initial badge derived from request
            storage_path="pending", # Placeholder until completed
            created_at=datetime.utcnow(),
            started_at=datetime.utcnow(),
            created_by_id=current_user.id,
            project_server_id=env_id
        )
        
        db.add(backup_record)
        await db.commit()
        await db.refresh(backup_record)
        
        # Queue Celery task
        try:
            from ....tasks.backup_tasks import create_environment_backup_task
            from ....services.backup.storage.gdrive import GoogleDriveStorage
            
            storage_backends = []
            
            # Use requested storage type
            if storage_type == "local":
                storage_backends = ["local"]
            elif storage_type == "gdrive":
                # Check availability
                if project.gdrive_connected:
                    storage_backends = ["gdrive"]
                else:
                    try:
                        is_configured, _ = await GoogleDriveStorage(remote_name="gdrive").check_configured()
                        if is_configured:
                            storage_backends = ["gdrive"]
                        else:
                            # Fallback if requested GDrive but not available? 
                            # User said "always google drive", so maybe fail or warn?
                            # For now, let's try GDrive and let task fail if not configured
                            storage_backends = ["gdrive"]
                    except:
                        storage_backends = ["gdrive"]
            elif storage_type == "both":
                 storage_backends = ["local"]
                 if project.gdrive_connected:
                     storage_backends.append("gdrive")
                 else:
                     try:
                         is_configured, _ = await GoogleDriveStorage(remote_name="gdrive").check_configured()
                         if is_configured:
                             storage_backends.append("gdrive")
                     except:
                         pass
            else:
                 # Default behavior (smart detection)
                 if project.gdrive_connected:
                     storage_backends.append("gdrive")
                 else:
                     try:
                         is_configured, _ = await GoogleDriveStorage(remote_name="gdrive").check_configured()
                         if is_configured:
                             storage_backends.append("gdrive")
                     except:
                         pass
                 
                 if not storage_backends:
                     storage_backends = ["local"]
            
            # Deduplicate
            storage_backends = list(set(storage_backends))
            
            # NUCLEAR FIX: Explicitly pass the configured folder ID to avoid any ambiguity in the worker
            override_folder_id = None
            if env_link: # Ensure env_link is available in this scope
                 override_folder_id = env_link.gdrive_backups_folder_id
                 if override_folder_id:
                     logger.info(f"Queueing environment backup with override folder: {override_folder_id}")

            create_environment_backup_task.delay(
                project_id=project_id,
                env_id=env_id,
                backup_id=backup_record.id,
                backup_type=backup_type,
                storage_backends=storage_backends,
                override_gdrive_folder_id=override_folder_id
            )
            logger.info(f"Queued backup task for backup {backup_record.id} with backends: {storage_backends}")
            
        except ImportError:
            logger.error("Celery worker import failed")
            # Fallback (optional, or just fail) - simplified to keep consistent with async flow
            
        return {
            "status": "accepted", 
            "backup_id": backup_record.id,
            "message": "Backup started in background"
        }

    except Exception as e:
        logger.error(f"Error creating environment backup: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/backups/download")
async def download_backup(
    project_id: int,
    path: str,
    storage: str = "local",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    current_user: Annotated[User, Depends(get_current_active_user)] = None
):
    """
    Download a backup file.
    Streams the file from the storage backend.
    """
    from ....services.backup.backup_service import BackupService
    
    # Verify project access
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    service = BackupService(db)
    
    try:
        # Get config for storage if needed
        # For GDrive, we need the remote name
        storage_config = {}
        if storage == "gdrive":
             config = get_dashboard_config()
             storage_config["gdrive_remote"] = getattr(config, "gdrive_rclone_remote", "gdrive")
             # Base folder shouldn't matter for absolute paths (which list_files returns relative to base, but GDrive handles IDs/paths)
             # Wait, list_files returns paths relative to base folder if prefix was used?
             # My updated list_files returns relative path if prefix was used.
             # But download expects a path that works with the storage backend.
             # GDrive download uses _get_remote_path which prepends base_folder.
             # The path coming from list_backups is relative to base_folder.
             # So passing it back to download should work fine.
             storage_config["gdrive_folder"] = "" # We want raw path processing

        local_path, temp_dir = await service.download_backup_stream(
            backup_path=path,
            storage_backend=storage,
            storage_config=storage_config
        )
        
        # Filename from path
        filename = Path(path).name
        
        def iterfile():
            try:
                with open(local_path, mode="rb") as file_like:
                    while chunk := file_like.read(1024 * 1024): # 1MB chunks
                        yield chunk
            finally:
                # Cleanup temp directory after streaming
                import shutil
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)

        return StreamingResponse(
            iterfile(), 
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error downloading backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/drive/backups/index")
async def get_project_drive_backup_index(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = None
):
    """
    Return Drive backup index grouped by environment and timestamp.
    Handles per-environment folder overrides.
    """
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 1. Configuration & Overrides
    config = get_dashboard_config()
    remote_name = getattr(config, "gdrive_rclone_remote", "gdrive")
    base_path = (getattr(config, "gdrive_base_path", "WebDev/Projects") or "").strip("/")

    # Default Project Root
    default_backup_root = (project.gdrive_backups_folder_id or "").strip("/")
    if not default_backup_root:
        project_name = project.name or project.slug
        if not project_name:
             # Should not happen for valid project
             project_name = f"project-{project.id}"
        default_backup_root = f"{base_path}/{project_name}/Backups".strip("/")

    # Fetch Environment Overrides
    stmt = select(ProjectServer).where(ProjectServer.project_id == project_id)
    project_envs = (await db.execute(stmt)).scalars().all()
    
    env_overrides = {
        ps.environment.value: ps.gdrive_backups_folder_id 
        for ps in project_envs 
        if ps.gdrive_backups_folder_id
    }

    # 2. Storage Setup
    # We use a default storage initialized at root (or base path)
    # Note: We initialize at base_folder="" to allow full path manipulation
    default_storage = GoogleDriveStorage(remote_name=remote_name, base_folder="")
    
    # Check if configured
    is_configured, msg = await default_storage.check_configured()
    if not is_configured:
         # Only fail if we strictly rely on default storage?
         # If using overrides solely, maybe we can proceed?
         # But usually global config is required for rclone to work at all.
         raise HTTPException(status_code=400, detail=msg)

    # 3. Discover Environment Folders
    found_envs = set()

    # A) Check Default Root
    try:
        paths = await default_storage.list_directories(
            prefix=default_backup_root, 
            max_results=200,
            recursive=False
        )
        for p in paths:
            # p is full path e.g. "Root/Backups/staging"
            # Extract just the env name
            if p.startswith(default_backup_root + "/"):
                name = p[len(default_backup_root)+1:]
                found_envs.add(name)
            elif default_backup_root == "" and "/" not in p:
                found_envs.add(p)
    except:
        pass # Path might not exist yet

    # B) Add Overrides
    for e in env_overrides.keys():
        found_envs.add(e)
    
    # Filter targets
    targets = sorted(list(found_envs))
    if environment:
        targets = [t for t in targets if t == environment]
    
    # Helper to scan a folder
    async def _first_file(storage_backend, path: str) -> Optional[Dict[str, Any]]:
        files = await storage_backend.list_files(prefix=path, max_results=1)
        if not files:
            return None
        
        file_data = files[0]
        file_id = file_data.get("id")
        web_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing" if file_id else None
        
        return {
            "path": file_data["path"],
            "name": file_data["name"],
            "size": file_data.get("size", 0),
            "mod_time": file_data.get("mod_time"),
            "id": file_id,
            "link": web_link,
        }

    index: Dict[str, List[Dict[str, Any]]] = {}

    for env_name in targets:
        # Determine context
        if env_name in env_overrides:
            folder_id = env_overrides[env_name]
            # Storage rooted at the override ID
            env_storage = GoogleDriveStorage(remote_name=remote_name, base_folder=folder_id)
            search_prefix = "" # Root of ID
            folder_link = f"https://drive.google.com/drive/folders/{folder_id}"
        else:
            env_storage = default_storage
            search_prefix = f"{default_backup_root}/{env_name}".strip("/")
            folder_link = None # We'd need to fetch ID to link it, complex for now

        # List Timestamps
        try:
            # Note: with base_folder=ID, list_directories returns names inside it
            # With base_folder="", list_directories returns names inside search_prefix, prepended with search_prefix
            logger.info(f"Scanning env '{env_name}': folder_id={env_overrides.get(env_name)}, prefix='{search_prefix}'")
            ts_paths = await env_storage.list_directories(
                prefix=search_prefix,
                max_results=50, # Limit history
                recursive=False
            )
            logger.info(f"Found {len(ts_paths)} timestamp folders for '{env_name}': {ts_paths[:5] if ts_paths else 'none'}")
        except Exception as e:
            logger.error(f"Error listing directories for env '{env_name}': {e}")
            ts_paths = []

        entries = []
        # Sort paths (lexicographically usually works for timestamps like YYYYMMDD)
        ts_paths.sort(reverse=True)

        for ts_path in ts_paths:
            # Extract simple timestamp name
            # If search_prefix="", ts_path="2024..." -> name="2024..."
            # If search_prefix="A/B", ts_path="A/B/2024..." -> name="2024..."
            if search_prefix and ts_path.startswith(search_prefix + "/"):
                ts_name = ts_path[len(search_prefix)+1:]
            else:
                ts_name = ts_path

            # Get metadata for DB and Files
            # Paths are relative to storage root
            db_meta = await _first_file(env_storage, f"{ts_path}/db")
            files_meta = await _first_file(env_storage, f"{ts_path}/files")
            
            if db_meta or files_meta:
                 entries.append({
                     "timestamp": ts_name,
                     "db": db_meta,
                     "files": files_meta,
                     "folder_link": folder_link 
                 })
        
        index[env_name] = entries

    if environment:
        return {"environments": {environment: index.get(environment, [])}}

    return {"environments": index, "backup_root": default_backup_root}


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
    gdrive_global_configured: bool = False
    gdrive_global_remote: Optional[str] = None
    gdrive_folder_id: Optional[str] = None
    gdrive_backups_folder_id: Optional[str] = None
    gdrive_assets_folder_id: Optional[str] = None
    gdrive_docs_folder_id: Optional[str] = None
    gdrive_last_sync: Optional[datetime] = None


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
        
        # Check global status
        config = get_dashboard_config()
        remote_name = getattr(config, "gdrive_rclone_remote", "gdrive")
        base_path = getattr(config, "gdrive_base_path", "WebDev/Projects")
        storage = GoogleDriveStorage(remote_name=remote_name, base_folder=base_path)
        global_configured, _ = await storage.check_configured()
        
        return DriveSettingsRead(
            gdrive_connected=project.gdrive_connected,
            gdrive_global_configured=global_configured,
            gdrive_global_remote=remote_name if global_configured else None,
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


@router.post("/{project_id}/whois/refresh")
async def refresh_project_whois(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Refresh WHOIS data for the project's primary domain."""
    try:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.owner_id == current_user.id
            )
        )
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        service = DomainService(db)

        result = await db.execute(
            select(Domain).where(Domain.project_id == project.id)
        )
        domain = result.scalars().first()

        if not domain:
            candidate_url = project.wp_home or project.name
            domain_name = service.extract_domain_from_url(candidate_url) if candidate_url else None
            if not domain_name or not project.client_id:
                raise HTTPException(
                    status_code=404,
                    detail="No domain record found for this project"
                )

            domain = await service.sync_domain_from_url(
                domain_name,
                client_id=project.client_id,
                project_id=project.id,
                check_whois=False
            )

        domain = await service.fetch_whois(domain.id, force=True, raise_on_error=True)
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")

        return {
            "status": "success",
            "domain_id": domain.id,
            "domain_name": domain.domain_name,
            "expiry_date": domain.expiry_date.isoformat() if domain.expiry_date else None,
            "registration_date": domain.registration_date.isoformat() if domain.registration_date else None,
            "registrar_name": domain.registrar_name,
            "last_whois_check": domain.last_whois_check.isoformat() if domain.last_whois_check else None,
        }
    except RuntimeError as e:
        logger.error(f"WHOIS refresh unavailable for project {project_id}: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"WHOIS refresh failed for project {project_id}: {e}")
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
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Get plugins for a project (supports both local DDEV and remote servers)."""
    try:
        def _dedupe_plugins(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            seen: dict[str, Dict[str, Any]] = {}
            for plugin in items:
                key = (
                    plugin.get("name")
                    or plugin.get("plugin")
                    or plugin.get("slug")
                    or ""
                ).strip().lower()
                if not key:
                    key = json.dumps(plugin, sort_keys=True)
                if key not in seen:
                    seen[key] = plugin
            return [seen[k] for k in sorted(seen.keys())]

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
                return {"plugins": _dedupe_plugins(plugins), "source": "local"}
            error_msg = (result.stderr or "Plugin list failed").strip()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch plugins: {error_msg[:200]}"
            )
        
        # Try database project (remote server)
        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")
        
        # Get project-server link
        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(
                status_code=400,
                detail="No server linked to this project. Link a server first."
            )
        
        # Get server details
        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        # Run WP-CLI remotely via SSH using centralized client
        result = await _run_remote_wp_cli(
            server, 
            project_server.wp_path, 
            "plugin list --format=json --allow-root",
            current_user.id,
            db,
            project_server  # Pass environment for SSH credential overrides
        )
        
        if result['success']:
            try:
                plugins = json.loads(result['output'])
                return {"plugins": _dedupe_plugins(plugins), "source": "remote"}
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=502,
                    detail="Invalid JSON response from server"
                )

        error_msg = (result.get('error') or "Failed to fetch plugins").strip()
        raise HTTPException(status_code=502, detail=error_msg[:200])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting plugins for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/plugins/{plugin_name}/update")
async def update_project_plugin(
    project_name: str,
    plugin_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Update a specific plugin (local or remote)."""
    try:
        project = _get_project(project_name)
        if project:
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

        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(status_code=400, detail="No server linked to this project")

        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        result = await _run_remote_wp_cli(
            server,
            project_server.wp_path,
            f"plugin update {plugin_name} --allow-root",
            current_user.id,
            db,
            project_server
        )

        if result["success"]:
            return {"status": "success", "message": f"Plugin {plugin_name} updated"}
        return {"status": "error", "message": result.get("error") or "Plugin update failed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plugin {plugin_name} for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/plugins/update-all")
async def update_all_project_plugins(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Update all plugins (local or remote)."""
    try:
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            result = subprocess.run(
                ["ddev", "wp", "plugin", "update", "--all"],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=300
            )
            
            if result.returncode == 0:
                return {"status": "success", "message": "All plugins updated"}
            else:
                return {"status": "error", "message": result.stderr}

        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(status_code=400, detail="No server linked to this project")

        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        result = await _run_remote_wp_cli(
            server,
            project_server.wp_path,
            "plugin update --all --allow-root",
            current_user.id,
            db,
            project_server
        )

        if result["success"]:
            return {"status": "success", "message": "All plugins updated"}
        return {"status": "error", "message": result.get("error") or "Plugin update failed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plugins for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Theme Management
@router.get("/{project_name}/themes")
async def get_project_themes(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
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
        project_server = await _get_project_server(db_project.id, db, environment=environment)
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
            "theme list --format=json --allow-root",
            current_user.id,
            db,
            project_server  # Pass environment for SSH credential overrides
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


@router.post("/{project_name}/themes/{theme_name}/update")
async def update_project_theme(
    project_name: str,
    theme_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Update a specific theme (local or remote)."""
    try:
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            result = subprocess.run(
                ["ddev", "wp", "theme", "update", theme_name],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=60
            )
            
            if result.returncode == 0:
                return {"status": "success", "message": f"Theme {theme_name} updated"}
            else:
                return {"status": "error", "message": result.stderr}

        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(status_code=400, detail="No server linked to this project")

        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        result = await _run_remote_wp_cli(
            server,
            project_server.wp_path,
            f"theme update {theme_name} --allow-root",
            current_user.id,
            db,
            project_server
        )

        if result["success"]:
            return {"status": "success", "message": f"Theme {theme_name} updated"}
        return {"status": "error", "message": result.get("error") or "Theme update failed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating theme {theme_name} for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/themes/update-all")
async def update_all_project_themes(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Update all themes (local or remote)."""
    try:
        project = _get_project(project_name)
        if project:
            project_dir = Path(project.directory)
            result = subprocess.run(
                ["ddev", "wp", "theme", "update", "--all"],
                cwd=str(project_dir),
                capture_output=True, text=True, timeout=300
            )
            
            if result.returncode == 0:
                return {"status": "success", "message": "All themes updated"}
            else:
                return {"status": "error", "message": result.stderr}

        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(status_code=400, detail="No server linked to this project")

        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        result = await _run_remote_wp_cli(
            server,
            project_server.wp_path,
            "theme update --all --allow-root",
            current_user.id,
            db,
            project_server
        )

        if result["success"]:
            return {"status": "success", "message": "All themes updated"}
        return {"status": "error", "message": result.get("error") or "Theme update failed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating themes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# WordPress Core
@router.post("/{project_name}/wordpress/update")
async def update_wordpress_core(
    project_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[str] = Query(None, description="Environment to target (production/staging/development)")
):
    """Update WordPress core (local or remote)."""
    try:
        project = _get_project(project_name)
        if project:
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

        db_project = await _get_db_project(project_name, db)
        if not db_project:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        project_server = await _get_project_server(db_project.id, db, environment=environment)
        if not project_server:
            raise HTTPException(status_code=400, detail="No server linked to this project")

        server_result = await db.execute(
            select(Server).where(Server.id == project_server.server_id)
        )
        server = server_result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        result = await _run_remote_wp_cli(
            server,
            project_server.wp_path,
            "core update --allow-root",
            current_user.id,
            db,
            project_server
        )

        if result["success"]:
            return {"status": "success", "message": "WordPress core updated"}
        return {"status": "error", "message": result.get("error") or "Core update failed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating WordPress for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Task status
@router.get("/tasks/{task_id}")
async def get_background_task_status(
    task_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get status of a background task."""
    return get_task_status(task_id)


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


# ==============================================================================
# Environment Management
# ==============================================================================

@router.put("/{project_id}/environments/{env_id}", response_model=Dict[str, Any])
async def update_environment(
    project_id: int,
    env_id: int,
    env_update: ProjectServerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Update an existing environment link.
    """
    # Verify environment exists and belongs to project
    result = await db.execute(
        select(ProjectServer).where(
            ProjectServer.id == env_id,
            ProjectServer.project_id == project_id
        )
    )
    project_server = result.scalar_one_or_none()
    
    if not project_server:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    # Update fields
    update_data = env_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project_server, field, value)

    await db.commit()
    await db.refresh(project_server)
    
    return {
        "status": "success", 
        "data": ProjectServerRead.model_validate(project_server)
    }


# ==============================================================================
# WordPress User Management
# ==============================================================================

async def _get_wp_service(
    project_id: int, 
    env_id: int, 
    db: AsyncSession, 
    user: User
) -> WordPressService:
    """Helper to get initialized WordPressService."""
    from ....services.ssh_service import SSHKeyService
    # Get environment
    result = await db.execute(
        select(ProjectServer, Server).join(Server).where(
            ProjectServer.id == env_id,
            ProjectServer.project_id == project_id,
            Server.owner_id == user.id
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Environment or server not found")
        
    project_server, server = row

    system_key = await SSHKeyService.get_system_key(db)
    system_private_key = system_key.get("private_key") if system_key else None
    return WordPressService(
        server,
        project_server.wp_path,
        db,
        system_private_key=system_private_key,
    )


@router.get("/{project_id}/environments/{env_id}/users", response_model=List[WPUser])
async def list_environment_users(
    project_id: int,
    env_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List WordPress users for an environment."""
    service = await _get_wp_service(project_id, env_id, db, current_user)
    try:
        return await service.list_users()
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")


@router.post("/{project_id}/environments/{env_id}/users", response_model=WPUser)
async def create_environment_user(
    project_id: int,
    env_id: int,
    user_data: WPUserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new WordPress user in an environment."""
    service = await _get_wp_service(project_id, env_id, db, current_user)
    try:
        return await service.create_user(
            user_data.user_login,
            user_data.user_email,
            user_data.role,
            user_data.send_email
        )
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/environments/{env_id}/users/{user_id}/login", response_model=MagicLoginResponse)
async def magic_login(
    project_id: int,
    env_id: int,
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Generate a magic login URL for a user."""
    service = await _get_wp_service(project_id, env_id, db, current_user)
    try:
        url = await service.get_magic_login_url(user_id)
        return MagicLoginResponse(url=url)
    except Exception as e:
        logger.error(f"Failed to generate magic login: {e}")
        raise HTTPException(status_code=500, detail=str(e))


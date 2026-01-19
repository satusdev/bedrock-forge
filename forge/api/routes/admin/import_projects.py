"""
Import projects from CyberPanel servers.

Provides endpoints to list websites on a server and import them as projects.
"""
from typing import Annotated, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db
from ....db.models import Project, Server, User
from ....db.models.project_server import ProjectServer, ServerEnvironment
from ....db.models.monitor import Monitor, MonitorType
from ....services.cyberpanel_service import CyberPanelService
from ....utils.logging import logger
from ...deps import get_current_active_user

router = APIRouter()


# ==============================================================================
# Schemas
# ==============================================================================

class WebsiteInfo(BaseModel):
    """Information about a website on the server."""
    domain: str
    document_root: str
    admin_email: str | None = None
    php_version: str | None = None
    ssl_enabled: bool = False
    
    # WordPress detection
    is_wordpress: bool = False
    wp_type: str | None = None  # "bedrock" | "standard" | None
    wp_version: str | None = None
    site_title: str | None = None
    
    # Import status
    already_imported: bool = False
    project_id: int | None = None


class ImportWebsiteRequest(BaseModel):
    """Request to import a website as a project."""
    domain: str
    project_name: str | None = None  # Auto from domain if blank
    environment: str = "production"  # "staging" | "production" | "development"
    create_monitor: bool = True


class ImportResult(BaseModel):
    """Result of importing a website."""
    success: bool
    project_id: int | None = None
    project_name: str | None = None
    message: str
    monitor_created: bool = False


# ==============================================================================
# Endpoints
# ==============================================================================

@router.get("/{server_id}/websites", response_model=List[WebsiteInfo])
async def list_server_websites(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    List all websites on a CyberPanel server.
    
    Detects WordPress installations (Bedrock or standard) and checks
    if they're already imported as projects.
    """
    # Get server
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Get CyberPanel service
    try:
        service = CyberPanelService.from_server(server, db)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not connect to CyberPanel: {str(e)}"
        )
    
    # List websites from CyberPanel
    try:
        websites_data = await service.list_websites()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list websites: {str(e)}"
        )
    
    # Get existing project servers on this server
    existing_result = await db.execute(
        select(ProjectServer).where(ProjectServer.server_id == server_id)
    )
    existing_project_servers = existing_result.scalars().all()
    existing_domains = {ps.wp_url.replace("https://", "").replace("http://", "").rstrip("/").lower() 
                        for ps in existing_project_servers}
    existing_paths = {ps.wp_path.lower() for ps in existing_project_servers}

    websites = []
    for site in websites_data:
        domain = site.get("domain", "")
        doc_root = site.get("documentRoot", site.get("path", f"/home/{domain}/public_html"))
        
        # Check if already imported
        domain_clean = domain.lower().rstrip("/")
        already_imported = domain_clean in existing_domains or doc_root.lower() in existing_paths
        
        # Find project_id if already imported
        project_id = None
        if already_imported:
            for ps in existing_project_servers:
                if ps.wp_path.lower() == doc_root.lower():
                    project_id = ps.project_id
                    break
        
        # Detect WordPress
        wp_info = await _detect_wordpress(service, doc_root)
        
        websites.append(WebsiteInfo(
            domain=domain,
            document_root=doc_root,
            admin_email=site.get("adminEmail"),
            php_version=site.get("phpVersion"),
            ssl_enabled=site.get("ssl", False),
            is_wordpress=wp_info.get("is_wordpress", False),
            wp_type=wp_info.get("wp_type"),
            wp_version=wp_info.get("wp_version"),
            site_title=wp_info.get("site_title"),
            already_imported=already_imported,
            project_id=project_id
        ))
    
    return websites


async def _detect_wordpress(service: CyberPanelService, doc_root: str) -> dict:
    """
    Detect WordPress installation type and version.
    
    Returns dict with is_wordpress, wp_type, wp_version, site_title.
    """
    try:
        # Check for Bedrock (web/wp directory structure)
        check_bedrock = f"test -d '{doc_root}/web/wp' && echo 'bedrock' || echo 'standard'"
        bedrock_result = await service._run_ssh_command(check_bedrock)
        
        is_bedrock = "bedrock" in bedrock_result.lower()
        
        # Check for wp-config.php
        if is_bedrock:
            config_path = f"{doc_root}/config/application.php"
            wp_path = f"{doc_root}/web/wp"
        else:
            config_path = f"{doc_root}/wp-config.php"
            wp_path = doc_root
        
        check_config = f"test -f '{config_path}' && echo 'exists' || echo 'missing'"
        config_result = await service._run_ssh_command(check_config)
        
        if "missing" in config_result:
            return {"is_wordpress": False}
        
        # Get WordPress version
        version_file = f"{wp_path}/wp-includes/version.php"
        get_version = f"grep '\\$wp_version' '{version_file}' 2>/dev/null | head -1 | sed \"s/.*'\\(.*\\)'.*/\\1/\""
        version_result = await service._run_ssh_command(get_version)
        wp_version = version_result.strip() if version_result else None
        
        # Get site title using wp-cli if available
        site_title = None
        try:
            get_title = f"cd '{doc_root}' && wp option get blogname --allow-root 2>/dev/null || echo ''"
            title_result = await service._run_ssh_command(get_title)
            if title_result and not title_result.startswith("Error"):
                site_title = title_result.strip()
        except:
            pass
        
        return {
            "is_wordpress": True,
            "wp_type": "bedrock" if is_bedrock else "standard",
            "wp_version": wp_version if wp_version else None,
            "site_title": site_title if site_title else None
        }
        
    except Exception as e:
        logger.warning(f"Failed to detect WordPress in {doc_root}: {e}")
        return {"is_wordpress": False}


@router.post("/{server_id}/import", response_model=ImportResult)
async def import_website(
    server_id: int,
    request: ImportWebsiteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Import a CyberPanel website as a project.
    
    Creates a Project, links it to the server as a ProjectServer environment,
    and optionally creates an uptime monitor.
    """
    # Get server
    result = await db.execute(
        select(Server).where(
            Server.id == server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Get website info from CyberPanel
    try:
        service = CyberPanelService.from_server(server, db)
        websites_data = await service.list_websites()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CyberPanel connection failed: {e}")
    
    # Find the requested website
    target_site = None
    for site in websites_data:
        if site.get("domain", "").lower() == request.domain.lower():
            target_site = site
            break
    
    if not target_site:
        raise HTTPException(
            status_code=404,
            detail=f"Website '{request.domain}' not found on server"
        )
    
    doc_root = target_site.get("documentRoot", f"/home/{request.domain}/public_html")
    
    # Check if already imported
    existing = await db.execute(
        select(ProjectServer).where(
            ProjectServer.server_id == server_id,
            ProjectServer.wp_path == doc_root
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="This website is already imported as a project"
        )
    
    # Detect WordPress
    wp_info = await _detect_wordpress(service, doc_root)
    
    # Generate project name
    project_name = request.project_name or request.domain.split(".")[0].replace("-", " ").title()
    slug = request.domain.replace(".", "-").lower()
    
    # Check for existing project with same slug
    existing_project = await db.execute(select(Project).where(Project.slug == slug))
    if existing_project.scalar_one_or_none():
        slug = f"{slug}-{server_id}"
    
    # Create Project
    project = Project(
        name=project_name,
        slug=slug,
        description=f"Imported from {server.name}: {request.domain}",
        path=doc_root,
        server_id=server.id,
        owner_id=current_user.id
    )
    db.add(project)
    await db.flush()
    
    # Map environment string to enum
    env_map = {
        "staging": ServerEnvironment.STAGING,
        "production": ServerEnvironment.PRODUCTION,
        "development": ServerEnvironment.DEVELOPMENT
    }
    environment = env_map.get(request.environment.lower(), ServerEnvironment.PRODUCTION)
    
    # Create ProjectServer link
    wp_url = f"https://{request.domain}"
    project_server = ProjectServer(
        project_id=project.id,
        server_id=server.id,
        environment=environment,
        wp_path=doc_root,
        wp_url=wp_url,
        is_primary=True
    )
    db.add(project_server)
    
    # Create uptime monitor if requested
    monitor_created = False
    if request.create_monitor:
        try:
            monitor = Monitor(
                name=f"{project_name} - {environment.value.capitalize()}",
                url=wp_url,
                monitor_type=MonitorType.UPTIME,
                project_id=project.id,
                created_by_id=current_user.id,
                interval_seconds=300,
                timeout_seconds=30,
                is_active=True
            )
            db.add(monitor)
            monitor_created = True
        except Exception as e:
            logger.warning(f"Failed to create monitor for {request.domain}: {e}")
    
    await db.commit()
    await db.refresh(project)
    
    logger.info(f"Imported website {request.domain} as project '{project.name}' by {current_user.email}")
    
    return ImportResult(
        success=True,
        project_id=project.id,
        project_name=project.name,
        message=f"Successfully imported {request.domain} as '{project.name}'",
        monitor_created=monitor_created
    )


@router.post("/{server_id}/import-all")
async def import_all_websites(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: str = "production",
    create_monitors: bool = True,
    wordpress_only: bool = True
):
    """
    Import all websites from a CyberPanel server as projects.
    
    Args:
        environment: Default environment for all imports
        create_monitors: Create uptime monitors for each
        wordpress_only: Only import WordPress sites
    """
    # Get websites first
    websites = await list_server_websites(server_id, db, current_user)
    
    results = []
    imported = 0
    skipped = 0
    
    for site in websites:
        # Skip already imported
        if site.already_imported:
            skipped += 1
            continue
        
        # Skip non-WordPress if filter enabled
        if wordpress_only and not site.is_wordpress:
            skipped += 1
            continue
        
        try:
            result = await import_website(
                server_id,
                ImportWebsiteRequest(
                    domain=site.domain,
                    environment=environment,
                    create_monitor=create_monitors
                ),
                db,
                current_user
            )
            results.append(result)
            if result.success:
                imported += 1
        except Exception as e:
            results.append(ImportResult(
                success=False,
                message=f"Failed to import {site.domain}: {str(e)}"
            ))
    
    return {
        "total_websites": len(websites),
        "imported": imported,
        "skipped": skipped,
        "results": results
    }

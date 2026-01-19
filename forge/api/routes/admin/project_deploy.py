"""
Project deployment routes.

Provides endpoints for deploying projects from various sources.
Wired to Celery tasks for async execution.
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Annotated, Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db
from ....db.models.user import User
from ....db.models.project import Project
from ...deps import get_current_active_user
from ....utils.logging import logger

router = APIRouter()


class GitHubDeployRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    run_composer: bool = True


class CloneDeployRequest(BaseModel):
    source_project: str
    include_uploads: bool = False
    include_database: bool = False


class BlankDeployRequest(BaseModel):
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    site_url: Optional[str] = None


class DeploymentResponse(BaseModel):
    status: str
    message: str
    task_id: Optional[str] = None
    project: str


@router.post("/{project_name}/deploy/github", response_model=DeploymentResponse)
async def deploy_from_github(
    project_name: str,
    data: GitHubDeployRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Deploy project from a GitHub repository.
    
    This will:
    1. Clone the repo to the server
    2. Run composer install
    3. Set up .env file
    
    Returns a task_id for polling status.
    """
    # Find project
    result = await db.execute(
        select(Project).where(Project.slug == project_name)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update project with GitHub info
    project.github_repo_url = data.repo_url
    project.github_branch = data.branch
    await db.commit()
    
    # Queue Celery task
    try:
        from ....tasks.deploy_tasks import deploy_from_github as deploy_task
        
        task = deploy_task.delay(
            project_id=project.id,
            repo_url=data.repo_url,
            branch=data.branch,
            target_directory=project.directory,
            run_composer=data.run_composer,
            setup_env=True
        )
        
        logger.info(f"GitHub deploy task {task.id} queued for {project_name}")
        
        return DeploymentResponse(
            status="queued",
            message=f"Deployment from {data.repo_url}:{data.branch} queued",
            task_id=task.id,
            project=project_name
        )
    except Exception as e:
        logger.error(f"Failed to queue GitHub deploy: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to queue deployment: {str(e)}")


@router.post("/{project_name}/deploy/clone", response_model=DeploymentResponse)
async def deploy_from_clone(
    project_name: str,
    data: CloneDeployRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Clone an existing project to a new one.
    
    This will:
    1. Copy all files from source project
    2. Update database credentials
    3. Generate new salts
    
    Returns a task_id for polling status.
    """
    # Find target project
    result = await db.execute(
        select(Project).where(Project.slug == project_name)
    )
    target_project = result.scalar_one_or_none()
    if not target_project:
        raise HTTPException(status_code=404, detail="Target project not found")
    
    # Find source project
    result = await db.execute(
        select(Project).where(Project.slug == data.source_project)
    )
    source_project = result.scalar_one_or_none()
    if not source_project:
        raise HTTPException(status_code=404, detail="Source project not found")
    
    # Queue Celery task
    try:
        from ....tasks.deploy_tasks import clone_project as clone_task
        
        task = clone_task.delay(
            source_project_id=source_project.id,
            target_project_id=target_project.id,
            source_directory=source_project.directory,
            target_directory=target_project.directory,
            include_uploads=data.include_uploads,
            include_database=data.include_database
        )
        
        logger.info(f"Clone task {task.id} queued: {data.source_project} -> {project_name}")
        
        return DeploymentResponse(
            status="queued",
            message=f"Cloning from {data.source_project} queued",
            task_id=task.id,
            project=project_name
        )
    except Exception as e:
        logger.error(f"Failed to queue clone: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to queue clone: {str(e)}")


@router.post("/{project_name}/deploy/blank", response_model=DeploymentResponse)
async def deploy_blank_bedrock(
    project_name: str,
    data: BlankDeployRequest = BlankDeployRequest(),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    current_user: Annotated[User, Depends(get_current_active_user)] = None
):
    """
    Deploy a fresh Bedrock WordPress installation.
    
    This will:
    1. Clone roots/bedrock
    2. Run composer install
    3. Generate .env with database credentials
    
    Returns a task_id for polling status.
    """
    # Find project
    result = await db.execute(
        select(Project).where(Project.slug == project_name)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Queue Celery task
    try:
        from ....tasks.deploy_tasks import install_blank_bedrock as install_task
        
        task = install_task.delay(
            project_id=project.id,
            target_directory=project.directory,
            project_name=project.name,
            db_name=data.db_name,
            db_user=data.db_user,
            db_password=data.db_password,
            site_url=data.site_url
        )
        
        logger.info(f"Blank Bedrock task {task.id} queued for {project_name}")
        
        return DeploymentResponse(
            status="queued",
            message="Fresh Bedrock installation queued",
            task_id=task.id,
            project=project_name
        )
    except Exception as e:
        logger.error(f"Failed to queue Bedrock install: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to queue installation: {str(e)}")


@router.get("/{project_name}/deploy/status/{task_id}")
async def get_deploy_status(
    project_name: str,
    task_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Get the status of a deployment task.
    """
    try:
        from ....tasks.deploy_tasks import get_deployment_status
        
        status = get_deployment_status(task_id)
        
        return {
            "project": project_name,
            **status
        }
    except Exception as e:
        logger.error(f"Failed to get deploy status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")

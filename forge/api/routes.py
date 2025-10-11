"""
Bedrock Forge API Routes.

This module defines all API routes for the Bedrock Forge REST API.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import subprocess
import asyncio
from pathlib import Path
import uuid
from datetime import datetime

# Import utilities
from ..utils.logging import logger

# Defer plugin manager import to avoid circular imports
def get_plugin_manager_safe():
    try:
        from ..plugins.base import get_plugin_manager
        return get_plugin_manager()
    except ImportError:
        logger.warning("Plugin system not available")
        return None

# Create API router
api_router = APIRouter()

# Pydantic models for API requests/responses
class ServerInfo(BaseModel):
    server_ip: str
    ssh_user: str
    ssh_key: str
    ssh_port: int = 22
    domain: Optional[str] = None

class ProvisionRequest(BaseModel):
    server_info: ServerInfo
    ssl: bool = False
    hardening: bool = False
    dry_run: bool = False
    verbose: bool = False

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str

class TaskStatus(BaseModel):
    task_id: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

class BackupRequest(BaseModel):
    db: bool = True
    uploads: bool = True
    gdrive: bool = True
    gdrive_folder: str = "forge-backups"

class DeploymentRequest(BaseModel):
    environment: str = "staging"
    dry_run: bool = False
    verbose: bool = False

class PluginInfo(BaseModel):
    name: str
    version: str
    description: str
    author: str
    plugin_type: str
    enabled: bool = True

class PluginAction(BaseModel):
    plugin_name: str
    action: str
    parameters: Optional[Dict[str, Any]] = {}

# In-memory task storage (in production, use Redis or database)
task_storage: Dict[str, Dict] = {}

# Health endpoint
@api_router.get("/health", response_model=Dict[str, str])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "bedrock-forge-api",
        "version": "1.0.0"
    }

# Server provisioning endpoints
@api_router.post("/provision", response_model=TaskResponse)
async def start_provisioning(request: ProvisionRequest, background_tasks: BackgroundTasks):
    """Start server provisioning in background."""
    task_id = str(uuid.uuid4())

    # Store task info
    task_storage[task_id] = {
        "status": "pending",
        "message": "Provisioning task created",
        "created_at": datetime.now(),
        "completed_at": None,
        "result": None,
        "error": None
    }

    # Start background task
    background_tasks.add_task(
        provision_server_task,
        task_id,
        request.dict()
    )

    return TaskResponse(
        task_id=task_id,
        status="pending",
        message="Provisioning started"
    )

@api_router.get("/provision/{task_id}", response_model=TaskStatus)
async def get_provision_status(task_id: str):
    """Get provisioning task status."""
    if task_id not in task_storage:
        raise HTTPException(status_code=404, detail="Task not found")

    task = task_storage[task_id]
    return TaskStatus(**task)

# Backup endpoints
@api_router.post("/backup", response_model=TaskResponse)
async def start_backup(request: BackupRequest, background_tasks: BackgroundTasks):
    """Start backup process in background."""
    task_id = str(uuid.uuid4())

    task_storage[task_id] = {
        "status": "pending",
        "message": "Backup task created",
        "created_at": datetime.now(),
        "completed_at": None,
        "result": None,
        "error": None
    }

    background_tasks.add_task(
        backup_task,
        task_id,
        request.dict()
    )

    return TaskResponse(
        task_id=task_id,
        status="pending",
        message="Backup started"
    )

@api_router.get("/backup/{task_id}", response_model=TaskStatus)
async def get_backup_status(task_id: str):
    """Get backup task status."""
    if task_id not in task_storage:
        raise HTTPException(status_code=404, detail="Task not found")

    task = task_storage[task_id]
    return TaskStatus(**task)

# Deployment endpoints
@api_router.post("/deploy", response_model=TaskResponse)
async def start_deployment(request: DeploymentRequest, background_tasks: BackgroundTasks):
    """Start deployment process in background."""
    task_id = str(uuid.uuid4())

    task_storage[task_id] = {
        "status": "pending",
        "message": "Deployment task created",
        "created_at": datetime.now(),
        "completed_at": None,
        "result": None,
        "error": None
    }

    background_tasks.add_task(
        deployment_task,
        task_id,
        request.dict()
    )

    return TaskResponse(
        task_id=task_id,
        status="pending",
        message="Deployment started"
    )

@api_router.get("/deploy/{task_id}", response_model=TaskStatus)
async def get_deployment_status(task_id: str):
    """Get deployment task status."""
    if task_id not in task_storage:
        raise HTTPException(status_code=404, detail="Task not found")

    task = task_storage[task_id]
    return TaskStatus(**task)

# Plugin management endpoints
@api_router.get("/plugins", response_model=List[PluginInfo])
async def list_plugins(plugin_type: Optional[str] = None):
    """List available plugins."""
    try:
        manager = get_plugin_manager_safe()
        if not manager:
            raise HTTPException(status_code=503, detail="Plugin system not available")

        plugins = manager.discover_plugins()

        if plugin_type:
            plugins = [p for p in plugins if p.plugin_type == plugin_type]

        return [
            PluginInfo(
                name=p.name,
                version=p.version,
                description=p.description,
                author=p.author,
                plugin_type=p.plugin_type,
                enabled=p.enabled
            )
            for p in plugins
        ]
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/plugins/{plugin_name}/load", response_model=Dict[str, str])
async def load_plugin(plugin_name: str):
    """Load a plugin."""
    try:
        manager = get_plugin_manager_safe()
        if not manager:
            raise HTTPException(status_code=503, detail="Plugin system not available")

        plugins = manager.discover_plugins()
        plugin_info = next((p for p in plugins if p.name == plugin_name), None)

        if not plugin_info:
            raise HTTPException(status_code=404, detail="Plugin not found")

        success = manager.load_plugin(plugin_info)
        if success:
            return {"message": f"Plugin '{plugin_name}' loaded successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to load plugin")
    except Exception as e:
        logger.error(f"Error loading plugin {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/plugins/{plugin_name}/action", response_model=Dict[str, Any])
async def execute_plugin_action(plugin_name: str, action: PluginAction):
    """Execute an action on a plugin."""
    try:
        manager = get_plugin_manager_safe()
        if not manager:
            raise HTTPException(status_code=503, detail="Plugin system not available")

        plugin = manager.get_plugin(plugin_name)

        if not plugin:
            raise HTTPException(status_code=404, detail="Plugin not loaded")

        # Execute the method if it exists
        if hasattr(plugin, action.action):
            method = getattr(plugin, action.action)
            if callable(method):
                result = method(**action.parameters)
                return {"result": result}
            else:
                raise HTTPException(status_code=400, detail=f"'{action.action}' is not callable")
        else:
            raise HTTPException(status_code=404, detail=f"Action '{action.action}' not found")
    except Exception as e:
        logger.error(f"Error executing plugin action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Background task implementations
async def provision_server_task(task_id: str, request_data: Dict[str, Any]):
    """Background task for server provisioning."""
    try:
        task_storage[task_id]["status"] = "running"
        task_storage[task_id]["message"] = "Provisioning server..."

        # This would implement the actual provisioning logic
        # For now, simulate with existing functionality
        logger.info(f"Starting provisioning for task {task_id}")

        # Simulate work
        await asyncio.sleep(5)

        task_storage[task_id].update({
            "status": "completed",
            "message": "Provisioning completed successfully",
            "completed_at": datetime.now(),
            "result": {"server_ip": request_data["server_info"]["server_ip"]}
        })

    except Exception as e:
        task_storage[task_id].update({
            "status": "failed",
            "message": f"Provisioning failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Provisioning task {task_id} failed: {e}")

async def backup_task(task_id: str, request_data: Dict[str, Any]):
    """Background task for backup."""
    try:
        task_storage[task_id]["status"] = "running"
        task_storage[task_id]["message"] = "Creating backup..."

        # Build backup command
        cmd_parts = ["python3", "-m", "forge", "sync", "backup"]
        if request_data.get("db", True):
            cmd_parts.append("--db=true")
        if request_data.get("uploads", True):
            cmd_parts.append("--uploads=true")
        if request_data.get("gdrive", True):
            cmd_parts.append("--gdrive=true")
        cmd_parts.append(f"--gdrive-folder={request_data.get('gdrive_folder', 'forge-backups')}")

        # Run backup command
        result = subprocess.run(cmd_parts, capture_output=True, text=True)

        if result.returncode == 0:
            task_storage[task_id].update({
                "status": "completed",
                "message": "Backup completed successfully",
                "completed_at": datetime.now(),
                "result": {"output": result.stdout}
            })
        else:
            raise Exception(f"Backup command failed: {result.stderr}")

    except Exception as e:
        task_storage[task_id].update({
            "status": "failed",
            "message": f"Backup failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Backup task {task_id} failed: {e}")

async def deployment_task(task_id: str, request_data: Dict[str, Any]):
    """Background task for deployment."""
    try:
        task_storage[task_id]["status"] = "running"
        task_storage[task_id]["message"] = "Starting deployment..."

        # Build deployment command
        cmd_parts = ["python3", "-m", "forge", "deploy"]
        if request_data.get("environment", "staging"):
            cmd_parts.extend(["--env", request_data["environment"]])
        if request_data.get("dry_run", False):
            cmd_parts.append("--dry-run")
        if request_data.get("verbose", False):
            cmd_parts.append("--verbose")

        # Run deployment command
        result = subprocess.run(cmd_parts, capture_output=True, text=True)

        if result.returncode == 0:
            task_storage[task_id].update({
                "status": "completed",
                "message": "Deployment completed successfully",
                "completed_at": datetime.now(),
                "result": {"output": result.stdout}
            })
        else:
            raise Exception(f"Deployment command failed: {result.stderr}")

    except Exception as e:
        task_storage[task_id].update({
            "status": "failed",
            "message": f"Deployment failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Deployment task {task_id} failed: {e}")
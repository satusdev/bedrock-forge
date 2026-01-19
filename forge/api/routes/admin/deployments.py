"""
Deployments API routes.

Handles staging->production promotion, deployment history, and rollbacks.
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
import subprocess
import uuid
import json
from datetime import datetime
from pathlib import Path

from ....utils.logging import logger
from ....utils.local_config import LocalConfigManager
from ....db import get_db, User
from ...deps import get_current_active_user, update_task_status

router = APIRouter()

class PromoteRequest(BaseModel):
    staging_host: str
    staging_user: str
    prod_host: str
    prod_user: str
    staging_url: str
    prod_url: str
    project_path: Optional[str] = None

class RollbackRequest(BaseModel):
    target_release: Optional[str] = None

class DeploymentLog(BaseModel):
    id: str  # task_id
    timestamp: str
    action: str
    status: str
    details: str

# Mock database (in-memory for now, ideally strictly DB backed)
# We will read logs from the forge logs directory or task status
DEPLOYMENT_LOGS = [] 

@router.post("/promote")
async def promote_staging_to_production(
    request: PromoteRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user)
):
    """
    Promote Staging to Production.
    
    Triggers `forge deploy promote` CLI command in background.
    """
    task_id = str(uuid.uuid4())
    update_task_status(task_id, "pending", "Initiating promotion...")
    
    # Construct CLI command
    cmd = [
        "forge", "deploy", "promote",
        "--staging-host", request.staging_host,
        "--staging-user", request.staging_user,
        "--prod-host", request.prod_host,
        "--prod-user", request.prod_user,
        "--staging-url", request.staging_url,
        "--prod-url", request.prod_url,
        "--yes" # Assume non-interactive
    ]
    
    if request.project_path:
         cmd.extend(["--project-path", request.project_path])

    def run_promotion():
        try:
            update_task_status(task_id, "running", "Running deployment process...")
            logger.info(f"Running promotion: {' '.join(cmd)}")
            
            # Use subprocess to run the CLI command
            # Note: dependent on 'forge' being in PATH or using full path
            # We'll try running it as a python module to be safer if 'forge' isn't in path
            # But 'forge' entrypoint is installed. Let's try direct command first.
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate()
            
            if process.returncode == 0:
                update_task_status(task_id, "completed", "Promotion successful!")
                DEPLOYMENT_LOGS.append({
                    "id": task_id,
                    "timestamp": datetime.now().isoformat(),
                    "action": "Promote Staging->Prod",
                    "status": "success",
                    "details": stdout
                })
            else:
                update_task_status(task_id, "failed", f"Promotion failed: {stderr}")
                DEPLOYMENT_LOGS.append({
                    "id": task_id,
                    "timestamp": datetime.now().isoformat(),
                    "action": "Promote Staging->Prod",
                    "status": "failed",
                    "details": stderr
                })
                
        except Exception as e:
            logger.error(f"Promotion error: {e}")
            update_task_status(task_id, "failed", str(e))

    background_tasks.add_task(run_promotion)

    return {
        "status": "accepted",
        "task_id": task_id,
        "message": "Promotion process started background"
    }

@router.get("/history")
async def get_deployment_history(
    current_user: User = Depends(get_current_active_user)
):
    """Get deployment history log."""
    # Return in reverse chronological order
    return sorted(DEPLOYMENT_LOGS, key=lambda x: x['timestamp'], reverse=True)

@router.post("/{project_name}/rollback")
async def rollback_deployment(
    project_name: str,
    request: RollbackRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user)
):
    """
    Rollback to a previous release.
    """
    task_id = str(uuid.uuid4())
    update_task_status(task_id, "pending", f"Rolling back {project_name}...")
    
    # Placeholder logic - needing specific rollback CLI command
    # cmd = ["forge", "deploy", "rollback", project_name, ...]
    
    async def run_rollback():
         update_task_status(task_id, "completed", "Rollback simulated (CLI not fully wired yet)")
         
    background_tasks.add_task(run_rollback)
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "message": "Rollback started"
    }

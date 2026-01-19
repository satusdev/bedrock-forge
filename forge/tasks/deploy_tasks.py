"""
Deploy Tasks for Celery

This module provides Celery tasks for project deployment:
- Deploy from GitHub repository
- Clone existing project
- Install blank Bedrock

These tasks run asynchronously and report progress via task state.
"""

import os
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from celery import shared_task, current_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


# =================================
# DEPLOY FROM GITHUB
# =================================

@shared_task(bind=True, name="forge.tasks.deploy_tasks.deploy_from_github")
def deploy_from_github(
    self,
    project_id: int,
    repo_url: str,
    branch: str = "main",
    target_directory: str = None,
    run_composer: bool = True,
    setup_env: bool = True
) -> Dict[str, Any]:
    """
    Clone or pull from GitHub repository and set up the project.
    
    Args:
        project_id: Database ID of the project
        repo_url: GitHub repository URL
        branch: Branch to checkout (default: main)
        target_directory: Where to clone the project
        run_composer: Run composer install after clone
        setup_env: Generate .env file if not exists
        
    Returns:
        Dict with deployment result
    """
    result = {
        "project_id": project_id,
        "status": "pending",
        "started_at": datetime.utcnow().isoformat(),
        "steps": []
    }
    
    def update_progress(step: str, status: str, message: str = ""):
        """Update task progress"""
        result["steps"].append({
            "step": step,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.update_state(state="PROGRESS", meta=result)
        logger.info(f"[{project_id}] {step}: {status} - {message}")
    
    try:
        update_progress("init", "started", f"Deploying from {repo_url}")
        
        # Determine target directory
        if not target_directory:
            # Extract repo name from URL
            repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
            target_directory = f"/var/www/{repo_name}"
        
        target_path = Path(target_directory)
        
        # Check if directory exists (update vs fresh clone)
        if target_path.exists() and (target_path / ".git").exists():
            # Git pull
            update_progress("git", "started", "Pulling latest changes")
            
            result_cmd = subprocess.run(
                ["git", "fetch", "origin"],
                cwd=target_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            if result_cmd.returncode != 0:
                raise Exception(f"Git fetch failed: {result_cmd.stderr}")
            
            result_cmd = subprocess.run(
                ["git", "checkout", branch],
                cwd=target_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result_cmd.returncode != 0:
                raise Exception(f"Git checkout failed: {result_cmd.stderr}")
            
            result_cmd = subprocess.run(
                ["git", "pull", "origin", branch],
                cwd=target_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            if result_cmd.returncode != 0:
                raise Exception(f"Git pull failed: {result_cmd.stderr}")
            
            update_progress("git", "completed", "Pulled latest changes")
        else:
            # Fresh clone
            update_progress("git", "started", f"Cloning repository to {target_directory}")
            
            # Ensure parent directory exists
            target_path.parent.mkdir(parents=True, exist_ok=True)
            
            result_cmd = subprocess.run(
                ["git", "clone", "--branch", branch, repo_url, str(target_path)],
                capture_output=True,
                text=True,
                timeout=300
            )
            if result_cmd.returncode != 0:
                raise Exception(f"Git clone failed: {result_cmd.stderr}")
            
            update_progress("git", "completed", "Repository cloned successfully")
        
        # Run composer install
        if run_composer:
            update_progress("composer", "started", "Installing dependencies")
            
            # Check if composer.json exists
            if (target_path / "composer.json").exists():
                result_cmd = subprocess.run(
                    ["composer", "install", "--no-dev", "--optimize-autoloader"],
                    cwd=target_path,
                    capture_output=True,
                    text=True,
                    timeout=600
                )
                if result_cmd.returncode != 0:
                    logger.warning(f"Composer install failed: {result_cmd.stderr}")
                    update_progress("composer", "warning", "Composer install had issues")
                else:
                    update_progress("composer", "completed", "Dependencies installed")
            else:
                update_progress("composer", "skipped", "No composer.json found")
        
        # Setup .env file
        if setup_env:
            update_progress("env", "started", "Setting up environment")
            
            env_file = target_path / ".env"
            env_example = target_path / ".env.example"
            
            if not env_file.exists() and env_example.exists():
                shutil.copy(env_example, env_file)
                update_progress("env", "completed", "Created .env from .env.example")
            elif env_file.exists():
                update_progress("env", "skipped", ".env already exists")
            else:
                update_progress("env", "warning", "No .env.example found")
        
        # Final status
        result["status"] = "completed"
        result["completed_at"] = datetime.utcnow().isoformat()
        result["directory"] = str(target_path)
        
        update_progress("deploy", "completed", "Deployment successful")
        
        return result
        
    except Exception as e:
        logger.error(f"Deploy from GitHub failed: {e}")
        result["status"] = "failed"
        result["error"] = str(e)
        update_progress("deploy", "failed", str(e))
        raise


# =================================
# CLONE EXISTING PROJECT
# =================================

@shared_task(bind=True, name="forge.tasks.deploy_tasks.clone_project")
def clone_project(
    self,
    source_project_id: int,
    target_project_id: int,
    source_directory: str,
    target_directory: str,
    include_uploads: bool = False,
    include_database: bool = False
) -> Dict[str, Any]:
    """
    Clone an existing project to a new location.
    
    Args:
        source_project_id: ID of source project
        target_project_id: ID of target project
        source_directory: Path to source project
        target_directory: Path for new project
        include_uploads: Copy uploads directory
        include_database: Export and import database
        
    Returns:
        Dict with clone result
    """
    result = {
        "source_project_id": source_project_id,
        "target_project_id": target_project_id,
        "status": "pending",
        "started_at": datetime.utcnow().isoformat(),
        "steps": []
    }
    
    def update_progress(step: str, status: str, message: str = ""):
        result["steps"].append({
            "step": step,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.update_state(state="PROGRESS", meta=result)
        logger.info(f"[{target_project_id}] {step}: {status} - {message}")
    
    try:
        update_progress("init", "started", f"Cloning project from {source_directory}")
        
        source_path = Path(source_directory)
        target_path = Path(target_directory)
        
        if not source_path.exists():
            raise Exception(f"Source directory does not exist: {source_directory}")
        
        if target_path.exists():
            raise Exception(f"Target directory already exists: {target_directory}")
        
        # Create target directory
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Define what to exclude
        exclude_patterns = [
            ".git",
            "node_modules",
            "vendor",
            ".env",
            ".env.local",
            "wp-content/cache",
            "wp-content/upgrade",
        ]
        
        if not include_uploads:
            exclude_patterns.append("wp-content/uploads")
        
        # Use rsync for efficient copying
        update_progress("copy", "started", "Copying project files")
        
        exclude_args = []
        for pattern in exclude_patterns:
            exclude_args.extend(["--exclude", pattern])
        
        result_cmd = subprocess.run(
            ["rsync", "-av", "--progress"] + exclude_args + [
                str(source_path) + "/",
                str(target_path) + "/"
            ],
            capture_output=True,
            text=True,
            timeout=1800  # 30 minutes
        )
        
        if result_cmd.returncode != 0:
            raise Exception(f"File copy failed: {result_cmd.stderr}")
        
        update_progress("copy", "completed", "Files copied successfully")
        
        # Copy .env.example and create new .env
        update_progress("env", "started", "Setting up environment")
        
        env_example = source_path / ".env.example"
        if env_example.exists():
            shutil.copy(env_example, target_path / ".env")
            update_progress("env", "completed", "Created new .env file")
        else:
            update_progress("env", "warning", "No .env.example found")
        
        # Run composer install
        update_progress("composer", "started", "Installing dependencies")
        
        if (target_path / "composer.json").exists():
            result_cmd = subprocess.run(
                ["composer", "install"],
                cwd=target_path,
                capture_output=True,
                text=True,
                timeout=600
            )
            if result_cmd.returncode == 0:
                update_progress("composer", "completed", "Dependencies installed")
            else:
                update_progress("composer", "warning", "Composer install had issues")
        else:
            update_progress("composer", "skipped", "No composer.json found")
        
        # Database clone (if requested)
        if include_database:
            update_progress("database", "started", "Cloning database")
            # Database cloning would require wp-cli or direct DB access
            # This is a placeholder for that functionality
            update_progress("database", "skipped", "Database cloning not implemented yet")
        
        result["status"] = "completed"
        result["completed_at"] = datetime.utcnow().isoformat()
        result["directory"] = str(target_path)
        
        update_progress("clone", "completed", "Project cloned successfully")
        
        return result
        
    except Exception as e:
        logger.error(f"Clone project failed: {e}")
        result["status"] = "failed"
        result["error"] = str(e)
        update_progress("clone", "failed", str(e))
        raise


# =================================
# INSTALL BLANK BEDROCK
# =================================

@shared_task(bind=True, name="forge.tasks.deploy_tasks.install_blank_bedrock")
def install_blank_bedrock(
    self,
    project_id: int,
    target_directory: str,
    project_name: str,
    db_name: Optional[str] = None,
    db_user: Optional[str] = None,
    db_password: Optional[str] = None,
    db_host: str = "localhost",
    site_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Install a fresh Bedrock WordPress installation.
    
    Args:
        project_id: Database ID of the project
        target_directory: Where to install
        project_name: Name for the project
        db_name: Database name (generated if not provided)
        db_user: Database user (generated if not provided)
        db_password: Database password (generated if not provided)
        db_host: Database host
        site_url: Site URL for .env
        
    Returns:
        Dict with installation result
    """
    result = {
        "project_id": project_id,
        "status": "pending",
        "started_at": datetime.utcnow().isoformat(),
        "steps": []
    }
    
    def update_progress(step: str, status: str, message: str = ""):
        result["steps"].append({
            "step": step,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.update_state(state="PROGRESS", meta=result)
        logger.info(f"[{project_id}] {step}: {status} - {message}")
    
    try:
        import secrets
        
        update_progress("init", "started", f"Installing Bedrock to {target_directory}")
        
        target_path = Path(target_directory)
        
        if target_path.exists():
            raise Exception(f"Target directory already exists: {target_directory}")
        
        # Create project with Composer
        update_progress("composer", "started", "Creating Bedrock project")
        
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        result_cmd = subprocess.run(
            ["composer", "create-project", "roots/bedrock", str(target_path)],
            capture_output=True,
            text=True,
            timeout=600
        )
        
        if result_cmd.returncode != 0:
            raise Exception(f"Composer create-project failed: {result_cmd.stderr}")
        
        update_progress("composer", "completed", "Bedrock installed")
        
        # Generate credentials if not provided
        if not db_name:
            db_name = project_name.lower().replace("-", "_").replace(" ", "_")[:32]
        if not db_user:
            db_user = db_name[:16]
        if not db_password:
            db_password = secrets.token_urlsafe(16)
        
        # Generate salts
        update_progress("env", "started", "Generating environment configuration")
        
        salts = {}
        salt_keys = [
            "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
            "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"
        ]
        for key in salt_keys:
            salts[key] = secrets.token_urlsafe(48)
        
        # Create .env file
        env_content = f"""# Generated by Bedrock Forge
# Project: {project_name}
# Created: {datetime.utcnow().isoformat()}

DB_NAME='{db_name}'
DB_USER='{db_user}'
DB_PASSWORD='{db_password}'
DB_HOST='{db_host}'
DB_PREFIX='wp_'

WP_ENV='development'
WP_HOME='{site_url or f"http://{project_name.lower()}.local"}'
WP_SITEURL="${{WP_HOME}}/wp"

# Authentication Keys and Salts
AUTH_KEY='{salts["AUTH_KEY"]}'
SECURE_AUTH_KEY='{salts["SECURE_AUTH_KEY"]}'
LOGGED_IN_KEY='{salts["LOGGED_IN_KEY"]}'
NONCE_KEY='{salts["NONCE_KEY"]}'
AUTH_SALT='{salts["AUTH_SALT"]}'
SECURE_AUTH_SALT='{salts["SECURE_AUTH_SALT"]}'
LOGGED_IN_SALT='{salts["LOGGED_IN_SALT"]}'
NONCE_SALT='{salts["NONCE_SALT"]}'
"""
        
        env_file = target_path / ".env"
        env_file.write_text(env_content)
        
        update_progress("env", "completed", ".env file created with generated credentials")
        
        # Final result
        result["status"] = "completed"
        result["completed_at"] = datetime.utcnow().isoformat()
        result["directory"] = str(target_path)
        result["credentials"] = {
            "db_name": db_name,
            "db_user": db_user,
            "db_password": db_password,
            "db_host": db_host,
        }
        
        update_progress("install", "completed", "Bedrock installation complete")
        
        return result
        
    except Exception as e:
        logger.error(f"Install blank Bedrock failed: {e}")
        result["status"] = "failed"
        result["error"] = str(e)
        update_progress("install", "failed", str(e))
        raise


# =================================
# HELPER FUNCTION
# =================================

def get_deployment_status(task_id: str) -> Dict[str, Any]:
    """
    Get the status of a deployment task.
    
    Args:
        task_id: Celery task ID
        
    Returns:
        Dict with task status and result
    """
    from forge.tasks.celery_tasks import celery_app
    
    result = celery_app.AsyncResult(task_id)
    
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
        "info": result.info if result.status == "PROGRESS" else None
    }

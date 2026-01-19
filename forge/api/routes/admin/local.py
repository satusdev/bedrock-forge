"""
Local development API routes.

System-level endpoints for local development environment management.
"""
from fastapi import APIRouter, HTTPException
from pathlib import Path
from typing import Dict, Any, List
import subprocess
import os

from ....utils.logging import logger
from ....utils.local_config import LocalConfigManager
from ...schemas.dashboard import LocalAvailability

router = APIRouter()

# Default base directory for local projects
DEFAULT_BASE_DIR = Path.home() / "Work" / "Wordpress"


@router.get("/available", response_model=LocalAvailability)
async def check_local_availability():
    """Check if local development tools are available on the system."""
    try:
        availability = LocalAvailability()
        
        # Check DDEV
        try:
            result = subprocess.run(
                ["ddev", "--version"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                availability.ddev_installed = True
                availability.ddev_version = result.stdout.strip()
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        
        # Check Docker
        try:
            result = subprocess.run(
                ["docker", "--version"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                availability.docker_installed = True
                
                # Check if Docker is running
                result = subprocess.run(
                    ["docker", "info"],
                    capture_output=True, text=True, timeout=10
                )
                availability.docker_running = result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        
        # Check Git
        try:
            result = subprocess.run(
                ["git", "--version"],
                capture_output=True, text=True, timeout=5
            )
            availability.git_installed = result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        
        # Check base directory
        availability.base_directory = str(DEFAULT_BASE_DIR)
        availability.base_directory_exists = DEFAULT_BASE_DIR.exists()
        
        return availability
        
    except Exception as e:
        logger.error(f"Error checking local availability: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/base-directory")
async def get_base_directory():
    """Get the base directory for local WordPress projects."""
    try:
        local_config = LocalConfigManager()
        return {
            "base_directory": str(local_config.base_dir),
            "exists": local_config.base_dir.exists()
        }
    except Exception as e:
        logger.error(f"Error getting base directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/base-directory/ensure")
async def ensure_base_directory():
    """Ensure the base directory exists, create if necessary."""
    try:
        if not DEFAULT_BASE_DIR.exists():
            DEFAULT_BASE_DIR.mkdir(parents=True, exist_ok=True)
            return {
                "status": "created",
                "base_directory": str(DEFAULT_BASE_DIR)
            }
        return {
            "status": "exists",
            "base_directory": str(DEFAULT_BASE_DIR)
        }
    except Exception as e:
        logger.error(f"Error ensuring base directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discover")
async def discover_local_projects():
    """
    Scan base directory for WordPress/Bedrock projects not yet tracked.
    
    Looks for directories containing:
    - composer.json with roots/bedrock
    - wp-config.php or web/wp-config.php
    - .ddev/config.yaml
    """
    try:
        local_config = LocalConfigManager()
        tracked_projects = {p.project_name for p in local_config.load_projects()}
        
        discovered = []
        
        if not local_config.base_dir.exists():
            return {"discovered": [], "tracked_count": len(tracked_projects)}
        
        for item in local_config.base_dir.iterdir():
            if not item.is_dir():
                continue
            
            project_name = item.name
            
            # Skip already tracked
            if project_name in tracked_projects:
                continue
            
            # Check if it's a WordPress/Bedrock project
            is_bedrock = False
            is_wordpress = False
            has_ddev = False
            
            # Check for Bedrock (composer.json with roots/bedrock)
            composer_json = item / "composer.json"
            if composer_json.exists():
                try:
                    import json
                    with open(composer_json) as f:
                        composer_data = json.load(f)
                        requires = composer_data.get("require", {})
                        if "roots/bedrock" in requires or "roots/wordpress" in requires:
                            is_bedrock = True
                except Exception:
                    pass
            
            # Check for wp-config.php
            if (item / "wp-config.php").exists() or (item / "web" / "wp-config.php").exists():
                is_wordpress = True
            
            # Check for DDEV
            if (item / ".ddev" / "config.yaml").exists():
                has_ddev = True
            
            if is_bedrock or is_wordpress:
                discovered.append({
                    "name": project_name,
                    "path": str(item),
                    "is_bedrock": is_bedrock,
                    "has_ddev": has_ddev,
                    "wp_url": f"https://{project_name}.ddev.site" if has_ddev else None
                })
        
        return {
            "discovered": discovered,
            "tracked_count": len(tracked_projects)
        }
        
    except Exception as e:
        logger.error(f"Error discovering local projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/{project_name}")
async def import_discovered_project(project_name: str):
    """Import a discovered project into the tracking system."""
    try:
        local_config = LocalConfigManager()
        project_path = local_config.base_dir / project_name
        
        if not project_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Project directory not found: {project_path}"
            )
        
        # Check if already tracked
        existing = local_config.get_project(project_name)
        if existing:
            return {
                "status": "already_tracked",
                "project_name": project_name
            }
        
        # Determine WP URL
        has_ddev = (project_path / ".ddev" / "config.yaml").exists()
        wp_url = f"https://{project_name}.ddev.site" if has_ddev else f"http://localhost/{project_name}"
        
        # Import into tracking
        from ....utils.local_config import GlobalProject
        global_project = GlobalProject(
            project_name=project_name,
            directory=str(project_path),
            wp_home=wp_url
        )
        local_config.add_project(global_project)
        
        return {
            "status": "imported",
            "project_name": project_name,
            "directory": str(project_path),
            "wp_url": wp_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing project {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/composer/update")
async def run_composer_update(project_name: str):
    """
    Run composer update on a local DDEV project.
    
    Updates all Composer dependencies to their latest allowed versions
    according to composer.json constraints.
    """
    try:
        local_config = LocalConfigManager()
        project = local_config.get_project(project_name)
        
        if not project:
            # Try to find in base directory
            project_path = local_config.base_dir / project_name
            if not project_path.exists():
                raise HTTPException(
                    status_code=404,
                    detail=f"Project {project_name} not found"
                )
        else:
            project_path = Path(project.directory)
        
        if not project_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Project directory not found"
            )
        
        # Check if DDEV is configured
        ddev_config = project_path / ".ddev" / "config.yaml"
        if not ddev_config.exists():
            raise HTTPException(
                status_code=400,
                detail="DDEV not configured for this project"
            )
        
        # Check if composer.json exists
        composer_json = project_path / "composer.json"
        if not composer_json.exists():
            raise HTTPException(
                status_code=400,
                detail="composer.json not found in project"
            )
        
        logger.info(f"Running composer update for {project_name}")
        
        # Run ddev composer update
        result = subprocess.run(
            ["ddev", "composer", "update", "--no-interaction"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            timeout=600  # 10 minutes timeout for large projects
        )
        
        if result.returncode != 0:
            # Try to extract useful error message
            error_msg = result.stderr or result.stdout
            logger.error(f"Composer update failed for {project_name}: {error_msg}")
            return {
                "status": "error",
                "project_name": project_name,
                "message": "Composer update failed",
                "error": error_msg[:500] if error_msg else "Unknown error",
                "stdout": result.stdout[:500] if result.stdout else None
            }
        
        # Parse output for package updates
        packages_updated = []
        for line in result.stdout.split('\n'):
            if '- Updating' in line or '- Installing' in line or '- Upgrading' in line:
                packages_updated.append(line.strip())
        
        logger.info(f"Composer update completed for {project_name}: {len(packages_updated)} packages updated")
        
        return {
            "status": "success",
            "project_name": project_name,
            "message": "Composer update completed successfully",
            "packages_updated": len(packages_updated),
            "update_details": packages_updated[:20],  # Limit to first 20
            "stdout": result.stdout[-1000:] if result.stdout else None  # Last 1000 chars
        }
        
    except subprocess.TimeoutExpired:
        logger.error(f"Composer update timed out for {project_name}")
        raise HTTPException(
            status_code=504,
            detail="Composer update timed out after 10 minutes"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running composer update for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/composer/install")
async def run_composer_install(project_name: str):
    """
    Run composer install on a local DDEV project.
    
    Installs dependencies exactly as specified in composer.lock.
    """
    try:
        local_config = LocalConfigManager()
        project = local_config.get_project(project_name)
        
        if not project:
            project_path = local_config.base_dir / project_name
            if not project_path.exists():
                raise HTTPException(
                    status_code=404,
                    detail=f"Project {project_name} not found"
                )
        else:
            project_path = Path(project.directory)
        
        if not project_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Project directory not found"
            )
        
        # Check if DDEV is configured
        ddev_config = project_path / ".ddev" / "config.yaml"
        if not ddev_config.exists():
            raise HTTPException(
                status_code=400,
                detail="DDEV not configured for this project"
            )
        
        logger.info(f"Running composer install for {project_name}")
        
        # Run ddev composer install
        result = subprocess.run(
            ["ddev", "composer", "install", "--no-interaction"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            timeout=600
        )
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            logger.error(f"Composer install failed for {project_name}: {error_msg}")
            return {
                "status": "error",
                "project_name": project_name,
                "message": "Composer install failed",
                "error": error_msg[:500] if error_msg else "Unknown error"
            }
        
        logger.info(f"Composer install completed for {project_name}")
        
        return {
            "status": "success",
            "project_name": project_name,
            "message": "Composer install completed successfully",
            "stdout": result.stdout[-1000:] if result.stdout else None
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="Composer install timed out after 10 minutes"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running composer install for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

"""
Rclone configuration API routes.

Provides endpoints to configure rclone remotes for Google Drive integration
without requiring interactive terminal access inside Docker containers.
"""
import os
import json
import shutil
import asyncio
import configparser
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

from ....utils.logging import logger

router = APIRouter()

# Default rclone config path (can be overridden by RCLONE_CONFIG env)
DEFAULT_RCLONE_CONFIG = os.path.expanduser("~/.config/rclone/rclone.conf")
RCLONE_CONFIG_PATH = os.getenv("RCLONE_CONFIG", DEFAULT_RCLONE_CONFIG)


class RcloneAuthorizeRequest(BaseModel):
    """Request body for authorizing rclone with a token."""
    token: str = Field(..., description="JSON token from 'rclone authorize drive' command")
    remote_name: str = Field(default="gdrive", description="Name for the rclone remote")
    scope: str = Field(default="drive", description="Google Drive scope")


class RcloneRemoteInfo(BaseModel):
    """Info about a configured rclone remote."""
    name: str
    type: str
    configured: bool


async def _run_rclone(*args: str) -> tuple[bool, str, str]:
    """Run rclone command and return success, stdout, stderr."""
    rclone_path = shutil.which("rclone") or "rclone"
    cmd = [rclone_path]
    
    if RCLONE_CONFIG_PATH:
        cmd.extend(["--config", RCLONE_CONFIG_PATH])
    
    cmd.extend(args)
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return process.returncode == 0, stdout.decode(), stderr.decode()
    except Exception as e:
        return False, "", str(e)


@router.get("/remotes")
async def list_rclone_remotes():
    """List all configured rclone remotes."""
    try:
        # Check if rclone is installed
        if not shutil.which("rclone"):
            return {
                "remotes": [],
                "rclone_installed": False,
                "config_path": RCLONE_CONFIG_PATH,
                "message": "rclone is not installed in the container",
            }
        
        success, stdout, stderr = await _run_rclone("listremotes")
        
        if not success:
            return {
                "remotes": [],
                "rclone_installed": True,
                "config_path": RCLONE_CONFIG_PATH,
                "message": f"Failed to list remotes: {stderr}",
            }
        
        # Parse remotes (format: "remotename:")
        remotes = []
        for line in stdout.strip().split("\n"):
            name = line.strip().rstrip(":")
            if name:
                # Get remote type
                success, type_stdout, _ = await _run_rclone("config", "show", f"{name}:")
                remote_type = "unknown"
                if success:
                    for config_line in type_stdout.split("\n"):
                        if config_line.strip().startswith("type"):
                            remote_type = config_line.split("=")[1].strip() if "=" in config_line else "unknown"
                            break
                
                remotes.append({
                    "name": name,
                    "type": remote_type,
                    "configured": True,
                })
        
        return {
            "remotes": remotes,
            "rclone_installed": True,
            "config_path": RCLONE_CONFIG_PATH,
            "message": f"Found {len(remotes)} remote(s)",
        }
        
    except Exception as e:
        logger.error(f"Error listing rclone remotes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/authorize")
async def authorize_rclone(request: RcloneAuthorizeRequest):
    """
    Authorize rclone with a token from 'rclone authorize drive'.
    
    The token should be the JSON output that looks like:
    {"access_token":"...", "token_type":"Bearer", "refresh_token":"...", "expiry":"..."}
    """
    try:
        # Validate token is valid JSON
        try:
            token_data = json.loads(request.token)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Invalid token format. Please paste the entire JSON output from 'rclone authorize drive'"
            )
        
        # Ensure required fields are present
        required_fields = ["access_token", "refresh_token"]
        missing = [f for f in required_fields if f not in token_data]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Token missing required fields: {', '.join(missing)}"
            )
        
        # Create config directory if it doesn't exist
        config_path = Path(RCLONE_CONFIG_PATH)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Read existing config or create new
        config = configparser.ConfigParser()
        if config_path.exists():
            config.read(str(config_path))
        
        # Add/update the remote section
        section = request.remote_name
        if not config.has_section(section):
            config.add_section(section)
        
        config.set(section, "type", "drive")
        config.set(section, "scope", request.scope)
        config.set(section, "token", request.token)
        config.set(section, "team_drive", "")
        
        # Write config file
        with open(config_path, "w") as f:
            config.write(f)
        
        logger.info(f"Wrote rclone config for remote '{request.remote_name}' to {config_path}")
        
        # Verify the configuration works by listing root
        success, stdout, stderr = await _run_rclone("lsd", f"{request.remote_name}:", "--max-depth", "1")
        
        if not success:
            # Config was written but verification failed
            return {
                "success": True,
                "verified": False,
                "remote_name": request.remote_name,
                "config_path": str(config_path),
                "message": f"Config saved but verification failed: {stderr}. Token may have expired.",
            }
        
        return {
            "success": True,
            "verified": True,
            "remote_name": request.remote_name,
            "config_path": str(config_path),
            "message": f"Successfully configured and verified '{request.remote_name}' remote",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authorizing rclone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remotes/s3")
async def configure_s3_remote(
    access_key_id: str = Body(..., embed=True),
    secret_access_key: str = Body(..., embed=True),
    region: str = Body("us-east-1", embed=True),
    endpoint: Optional[str] = Body(None, embed=True),
    provider: str = Body("AWS", embed=True),
    name: str = Body("s3", embed=True),
):
    """Configure an S3 remote in rclone."""
    try:
        config_path = Path(RCLONE_CONFIG_PATH)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        config = configparser.ConfigParser()
        if config_path.exists():
            config.read(str(config_path))
            
        section = name
        if not config.has_section(section):
            config.add_section(section)
            
        config.set(section, "type", "s3")
        config.set(section, "provider", provider)
        config.set(section, "env_auth", "false")
        config.set(section, "access_key_id", access_key_id)
        config.set(section, "secret_access_key", secret_access_key)
        config.set(section, "region", region)
        
        if endpoint:
            config.set(section, "endpoint", endpoint)
            
        with open(config_path, "w") as f:
            config.write(f)
            
        # Verify
        success, stdout, stderr = await _run_rclone("lsd", f"{name}:", "--max-depth", "1")
        
        if not success:
             # Even if lsd fails (bucket might not exist or be private root), we defined the remote.
             # But usually lsd works if creds are good.
             return {
                "success": True,
                "verified": False,
                "remote_name": name,
                "message": f"Remote configured but list failed: {stderr}"
             }
             
        return {
            "success": True,
            "verified": True,
            "remote_name": name,
            "message": f"S3 remote '{name}' configured successfully"
        }
    except Exception as e:
        logger.error(f"Error configuring S3 remote: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/remotes/{remote_name}")
async def delete_rclone_remote(remote_name: str):
    """Delete a configured rclone remote."""
    try:
        config_path = Path(RCLONE_CONFIG_PATH)
        
        if not config_path.exists():
            raise HTTPException(status_code=404, detail="No rclone config file found")
        
        config = configparser.ConfigParser()
        config.read(str(config_path))
        
        if not config.has_section(remote_name):
            raise HTTPException(status_code=404, detail=f"Remote '{remote_name}' not found")
        
        config.remove_section(remote_name)
        
        with open(config_path, "w") as f:
            config.write(f)
        
        logger.info(f"Removed rclone remote '{remote_name}'")
        
        return {
            "success": True,
            "message": f"Remote '{remote_name}' deleted successfully",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting rclone remote: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/install-instructions")
async def get_install_instructions():
    """Get rclone installation instructions for the user's local machine."""
    return {
        "instructions": {
            "linux": "curl https://rclone.org/install.sh | sudo bash",
            "macos": "brew install rclone",
            "windows": "Download from https://rclone.org/downloads/",
        },
        "authorize_command": 'rclone authorize "drive"',
        "description": (
            "Run the authorize command on a machine with a web browser. "
            "After authentication, copy the JSON token and paste it here."
        ),
    }

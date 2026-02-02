"""
Google Drive (rclone) API routes.

Provides rclone-only status, folder listing, and storage usage endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict

from ....utils.logging import logger
from ...dashboard_config import get_dashboard_config
from ....services.backup.storage.gdrive import GoogleDriveStorage

router = APIRouter()


def _normalize_path(value: Optional[str]) -> str:
    return (value or "").strip("/")


def _get_drive_config() -> tuple[str, str]:
    config = get_dashboard_config()
    remote_name = getattr(config, "gdrive_rclone_remote", "gdrive")
    base_path = getattr(config, "gdrive_base_path", "WebDev/Projects")
    return remote_name, _normalize_path(base_path)


@router.get("/status")
async def get_drive_status():
    """Get rclone Google Drive status."""
    try:
        remote_name, base_path = _get_drive_config()
        storage = GoogleDriveStorage(remote_name=remote_name, base_folder=base_path)
        configured, message = await storage.check_configured()

        return {
            "configured": configured,
            "message": message,
            "remote_name": remote_name,
            "base_path": base_path,
            "config_path": storage.rclone_config_path,
        }
    except Exception as e:
        logger.error(f"Error getting Drive status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage")
async def get_drive_storage_usage():
    """Get Google Drive storage usage information via rclone."""
    try:
        remote_name, base_path = _get_drive_config()
        storage = GoogleDriveStorage(remote_name=remote_name, base_folder=base_path)
        usage = await storage.get_quota()
        return {"storage_usage": usage or {}}
    except Exception as e:
        logger.error(f"Error getting Drive storage usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/folders")
async def list_drive_folders(
    query: Optional[str] = Query(None, description="Folder search query"),
    path: Optional[str] = Query(None, description="Path to list under"),
    shared_with_me: bool = Query(True, description="Include shared-with-me"),
    max_results: int = Query(200, ge=1, le=1000),
):
    """List or search Google Drive folders using rclone."""
    try:
        remote_name, base_path = _get_drive_config()
        storage = GoogleDriveStorage(remote_name=remote_name, base_folder=base_path)

        base_path_norm = _normalize_path(base_path)
        path_norm = _normalize_path(path)
        use_base_path = True
        base_prefix = ""

        if path_norm:
            if base_path_norm and path_norm.startswith(f"{base_path_norm}/"):
                base_prefix = path_norm[len(base_path_norm) + 1 :]
                use_base_path = True
            elif base_path_norm and path_norm == base_path_norm:
                base_prefix = ""
                use_base_path = True
            else:
                base_prefix = path_norm
                use_base_path = False

        if query:
            base_results = await storage.search_directories(
                query=query,
                prefix=base_prefix,
                max_results=max_results,
                shared_with_me=False,
                use_base_path=use_base_path,
            )
        else:
            base_results = await storage.list_directories(
                prefix=base_prefix,
                max_results=max_results,
                shared_with_me=False,
                recursive=False,
                use_base_path=use_base_path,
            )

        if use_base_path and base_path_norm:
            base_full = [
                f"{base_path_norm}/{entry}".strip("/") if entry else base_path_norm
                for entry in base_results
            ]
        else:
            base_full = base_results

        shared_full: List[str] = []
        if shared_with_me:
            # If we have a path, we want to see shared items INSIDE that path using the same prefix
            # If no path (root), we want to see shared items at the account root
            shared_prefix = base_prefix if path_norm else ""
            
            if query:
                shared_full = await storage.search_directories(
                    query=query,
                    prefix=shared_prefix,
                    max_results=max_results,
                    shared_with_me=True,
                    use_base_path=use_base_path if path_norm else False, # Only use base path relative logic if we are deep
                )
            else:
                shared_full = await storage.list_directories(
                    prefix=shared_prefix,
                    max_results=max_results,
                    shared_with_me=True,
                    recursive=False,
                    use_base_path=use_base_path if path_norm else False,
                )

        merged: List[Dict[str, str]] = []
        seen = set()
        base_set = set(base_full)
        for entry in base_full + shared_full:
            if entry in seen:
                continue
            seen.add(entry)
            merged.append({
                "path": entry,
                "source": "base" if entry in base_set else "shared",
            })

        return {
            "folders": merged,
            "count": len(merged),
            "remote_name": remote_name,
            "base_path": base_path_norm,
        }
    except Exception as e:
        logger.error(f"Error listing Drive folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

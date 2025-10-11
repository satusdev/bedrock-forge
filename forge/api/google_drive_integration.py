"""
Google Drive Integration Service for Bedrock Forge Dashboard.

This module provides comprehensive Google Drive API integration for backup
management, file synchronization, and storage management.
"""

import os
import json
import io
from typing import Dict, List, Optional, Any, BinaryIO
from datetime import datetime, timedelta
from pathlib import Path

try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    GOOGLE_DRIVE_AVAILABLE = True
except ImportError:
    GOOGLE_DRIVE_AVAILABLE = False

from ..utils.logging import logger
from ..models.dashboard_project import GoogleDriveIntegration


class GoogleDriveService:
    """Google Drive integration service."""

    SCOPES = ['https://www.googleapis.com/auth/drive']
    TOKEN_FILE = 'token.json'
    CREDENTIALS_FILE = 'credentials.json'

    def __init__(self, credentials_path: Optional[str] = None, token_path: Optional[str] = None):
        """
        Initialize Google Drive service.

        Args:
            credentials_path: Path to OAuth2 credentials file
            token_path: Path to token file for stored credentials
        """
        self.credentials_path = credentials_path or os.getenv('GOOGLE_DRIVE_CREDENTIALS_FILE', self.CREDENTIALS_FILE)
        self.token_path = token_path or os.getenv('GOOGLE_DRIVE_TOKEN_FILE', self.TOKEN_FILE)
        self.service = None
        self.credentials = None

        if GOOGLE_DRIVE_AVAILABLE:
            self._authenticate()
        else:
            logger.warning("Google Drive libraries not available. Install with: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib")

    def _authenticate(self) -> bool:
        """
        Authenticate with Google Drive API.

        Returns:
            True if authentication successful, False otherwise
        """
        try:
            # Check if we have existing credentials
            if os.path.exists(self.token_path):
                self.credentials = Credentials.from_authorized_user_file(self.token_path, self.SCOPES)

            # If there are no (valid) credentials available, let the user log in
            if not self.credentials or not self.credentials.valid:
                if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                    self.credentials.refresh(Request())
                else:
                    if not os.path.exists(self.credentials_path):
                        logger.error(f"Google Drive credentials file not found: {self.credentials_path}")
                        logger.info("Please create credentials from Google Cloud Console and save as credentials.json")
                        return False

                    flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, self.SCOPES)
                    self.credentials = flow.run_local_server(port=0)

                # Save the credentials for the next run
                with open(self.token_path, 'w') as token:
                    token.write(self.credentials.to_json())

            # Build the service
            self.service = build('drive', 'v3', credentials=self.credentials)
            logger.info("Google Drive API authenticated successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to authenticate with Google Drive: {e}")
            return False

    def is_authenticated(self) -> bool:
        """Check if Google Drive API is authenticated."""
        return self.service is not None

    def create_folder(self, folder_name: str, parent_folder_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Create a folder in Google Drive.

        Args:
            folder_name: Name of the folder to create
            parent_folder_id: ID of parent folder (optional)

        Returns:
            Folder information or None if failed
        """
        if not self.is_authenticated():
            return None

        try:
            file_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'
            }

            if parent_folder_id:
                file_metadata['parents'] = [parent_folder_id]

            folder = self.service.files().create(body=file_metadata, fields='id,name,size,createdTime').execute()

            logger.info(f"Created folder: {folder_name} (ID: {folder.get('id')})")
            return {
                'id': folder.get('id'),
                'name': folder.get('name'),
                'size': folder.get('size'),
                'created_time': folder.get('createdTime'),
                'url': f"https://drive.google.com/drive/folders/{folder.get('id')}"
            }

        except Exception as e:
            logger.error(f"Failed to create folder {folder_name}: {e}")
            return None

    def find_folder(self, folder_name: str, parent_folder_id: Optional[str] = None) -> Optional[str]:
        """
        Find a folder by name.

        Args:
            folder_name: Name of the folder to find
            parent_folder_id: ID of parent folder to search in (optional)

        Returns:
            Folder ID or None if not found
        """
        if not self.is_authenticated():
            return None

        try:
            query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
            if parent_folder_id:
                query += f" and '{parent_folder_id}' in parents"

            results = self.service.files().list(
                q=query,
                fields="files(id,name,size,createdTime)"
            ).execute()

            files = results.get('files', [])
            if files:
                return files[0]['id']

        except Exception as e:
            logger.error(f"Failed to find folder {folder_name}: {e}")

        return None

    def upload_file(self, file_path: Path, folder_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Upload a file to Google Drive.

        Args:
            file_path: Path to the file to upload
            folder_id: ID of folder to upload to (optional)

        Returns:
            File information or None if failed
        """
        if not self.is_authenticated():
            return None

        try:
            if not file_path.exists():
                logger.error(f"File not found: {file_path}")
                return None

            file_metadata = {'name': file_path.name}
            if folder_id:
                file_metadata['parents'] = [folder_id]

            media = MediaIoBaseUpload(io.BytesIO(file_path.read_bytes()), resumable=True)

            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id,name,size,createdTime,md5Checksum'
            ).execute()

            logger.info(f"Uploaded file: {file_path.name} (ID: {file.get('id')})")
            return {
                'id': file.get('id'),
                'name': file.get('name'),
                'size': file.get('size'),
                'created_time': file.get('createdTime'),
                'md5_checksum': file.get('md5Checksum'),
                'url': f"https://drive.google.com/file/d/{file.get('id')}/view"
            }

        except Exception as e:
            logger.error(f"Failed to upload file {file_path}: {e}")
            return None

    def download_file(self, file_id: str, output_path: Path) -> bool:
        """
        Download a file from Google Drive.

        Args:
            file_id: ID of the file to download
            output_path: Path to save the downloaded file

        Returns:
            True if successful, False otherwise
        """
        if not self.is_authenticated():
            return False

        try:
            request = self.service.files().get_media(fileId=file_id)

            # Ensure output directory exists
            output_path.parent.mkdir(parents=True, exist_ok=True)

            with open(output_path, 'wb') as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while done is False:
                    status, done = downloader.next_chunk()
                    logger.info(f"Download {int(status.progress() * 100)}%.")

            logger.info(f"Downloaded file to: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to download file {file_id}: {e}")
            return False

    def list_files(self, folder_id: Optional[str] = None, file_types: List[str] = None) -> List[Dict[str, Any]]:
        """
        List files in a folder or root directory.

        Args:
            folder_id: ID of folder to list (optional, defaults to root)
            file_types: List of MIME types to filter by (optional)

        Returns:
            List of file information
        """
        if not self.is_authenticated():
            return []

        try:
            query = "trashed=false"
            if folder_id:
                query += f" and '{folder_id}' in parents"

            if file_types:
                type_query = " or ".join([f"mimeType='{mimeType}'" for mimeType in file_types])
                query += f" and ({type_query})"

            results = self.service.files().list(
                q=query,
                fields="files(id,name,size,mimeType,createdTime,modifiedTime,parents)"
            ).execute()

            files = []
            for file in results.get('files', []):
                files.append({
                    'id': file.get('id'),
                    'name': file.get('name'),
                    'size': int(file.get('size', 0)),
                    'mime_type': file.get('mimeType'),
                    'created_time': file.get('createdTime'),
                    'modified_time': file.get('modifiedTime'),
                    'parents': file.get('parents', []),
                    'url': f"https://drive.google.com/file/d/{file.get('id')}/view"
                })

            return sorted(files, key=lambda x: x.get('modified_time', ''), reverse=True)

        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            return []

    def delete_file(self, file_id: str) -> bool:
        """
        Delete a file from Google Drive.

        Args:
            file_id: ID of the file to delete

        Returns:
            True if successful, False otherwise
        """
        if not self.is_authenticated():
            return False

        try:
            self.service.files().delete(fileId=file_id).execute()
            logger.info(f"Deleted file: {file_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {e}")
            return False

    def get_storage_usage(self) -> Dict[str, Any]:
        """
        Get storage usage information.

        Returns:
            Storage usage information
        """
        if not self.is_authenticated():
            return {}

        try:
            about = self.service.about().get(fields='storageQuota').execute()
            quota = about.get('storageQuota', {})

            return {
                'limit': int(quota.get('limit', 0)),
                'usage': int(quota.get('usage', 0)),
                'usage_in_drive': int(quota.get('usageInDrive', 0)),
                'usage_in_drive_trash': int(quota.get('usageInDriveTrash', 0)),
                'usage_percent': (int(quota.get('usage', 0)) / int(quota.get('limit', 1))) * 100 if quota.get('limit') else 0
            }

        except Exception as e:
            logger.error(f"Failed to get storage usage: {e}")
            return {}

    def create_project_backup_structure(self, project_name: str) -> Optional[GoogleDriveIntegration]:
        """
        Create backup folder structure for a project.

        Args:
            project_name: Name of the project

        Returns:
            GoogleDriveIntegration object with folder information
        """
        if not self.is_authenticated():
            return None

        try:
            # Create main project folder
            main_folder = self.create_folder(project_name)
            if not main_folder:
                return None

            # Create subfolders
            backups_folder = self.create_folder("Backups", main_folder['id'])
            database_folder = self.create_folder("Database", main_folder['id'])
            media_folder = self.create_folder("Media", main_folder['id'])
            config_folder = self.create_folder("Config", main_folder['id'])

            integration = GoogleDriveIntegration(
                backup_folder_id=main_folder['id'],
                backup_folder_url=main_folder['url'],
                auto_backup=True,
                backup_schedule="daily",
                last_backup=datetime.now(),
                storage_used=0
            )

            logger.info(f"Created backup structure for project: {project_name}")
            return integration

        except Exception as e:
            logger.error(f"Failed to create project backup structure: {e}")
            return None

    def backup_project_files(self, project_path: Path, backup_folder_id: str) -> List[Dict[str, Any]]:
        """
        Backup project files to Google Drive.

        Args:
            project_path: Local path to project files
            backup_folder_id: Google Drive folder ID for backups

        Returns:
            List of uploaded file information
        """
        if not self.is_authenticated():
            return []

        uploaded_files = []

        try:
            # Create timestamped backup folder
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_folder = self.create_folder(f"backup_{timestamp}", backup_folder_id)

            if not backup_folder:
                return []

            # Backup key directories and files
            backup_patterns = [
                "wp-content/themes",
                "wp-content/plugins",
                "wp-content/uploads",
                ".env",
                "composer.json",
                "composer.lock"
            ]

            for pattern in backup_patterns:
                source_path = project_path / pattern
                if source_path.exists():
                    if source_path.is_file():
                        # Backup single file
                        result = self.upload_file(source_path, backup_folder['id'])
                        if result:
                            uploaded_files.append(result)
                    else:
                        # Backup directory
                        for file_path in source_path.rglob('*'):
                            if file_path.is_file():
                                # Create relative path structure
                                relative_path = file_path.relative_to(source_path)
                                subfolder_name = str(relative_path.parent) if relative_path.parent else ""

                                # Create subfolder if needed
                                subfolder_id = backup_folder['id']
                                if subfolder_name:
                                    subfolder = self.create_folder(subfolder_name, subfolder_id)
                                    if subfolder:
                                        subfolder_id = subfolder['id']

                                result = self.upload_file(file_path, subfolder_id)
                                if result:
                                    uploaded_files.append(result)

            logger.info(f"Backed up {len(uploaded_files)} files for project")
            return uploaded_files

        except Exception as e:
            logger.error(f"Failed to backup project files: {e}")
            return uploaded_files

    def get_backup_history(self, backup_folder_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get backup history from Google Drive.

        Args:
            backup_folder_id: Google Drive folder ID for backups
            limit: Maximum number of backups to return

        Returns:
            List of backup information
        """
        if not self.is_authenticated():
            return []

        try:
            # Get backup folders (sorted by creation time)
            backup_folders = self.list_files(backup_folder_id, ['application/vnd.google-apps.folder'])

            backup_history = []
            for folder in backup_folders[:limit]:
                if folder['name'].startswith('backup_'):
                    # Get files in backup folder
                    files = self.list_files(folder['id'])

                    total_size = sum(f['size'] for f in files)

                    backup_history.append({
                        'backup_id': folder['id'],
                        'name': folder['name'],
                        'created_time': folder['created_time'],
                        'file_count': len(files),
                        'total_size': total_size,
                        'url': f"https://drive.google.com/drive/folders/{folder['id']}"
                    })

            return backup_history

        except Exception as e:
            logger.error(f"Failed to get backup history: {e}")
            return []

    def cleanup_old_backups(self, backup_folder_id: str, retention_days: int = 30) -> int:
        """
        Clean up old backups beyond retention period.

        Args:
            backup_folder_id: Google Drive folder ID for backups
            retention_days: Number of days to retain backups

        Returns:
            Number of backups deleted
        """
        if not self.is_authenticated():
            return 0

        try:
            cutoff_date = datetime.now() - timedelta(days=retention_days)
            backup_folders = self.list_files(backup_folder_id, ['application/vnd.google-apps.folder'])

            deleted_count = 0
            for folder in backup_folders:
                if folder['name'].startswith('backup_'):
                    # Parse timestamp from folder name
                    try:
                        timestamp_str = folder['name'].replace('backup_', '')
                        backup_date = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")

                        if backup_date < cutoff_date:
                            if self.delete_file(folder['id']):
                                deleted_count += 1
                                logger.info(f"Deleted old backup: {folder['name']}")

                    except ValueError:
                        # Skip folders with invalid timestamp format
                        continue

            logger.info(f"Cleaned up {deleted_count} old backups")
            return deleted_count

        except Exception as e:
            logger.error(f"Failed to cleanup old backups: {e}")
            return 0


# Global Google Drive service instance
_google_drive_service = None

def get_google_drive_service(credentials_path: str = None, token_path: str = None) -> GoogleDriveService:
    """Get or create Google Drive service instance."""
    global _google_drive_service
    if _google_drive_service is None or credentials_path or token_path:
        _google_drive_service = GoogleDriveService(credentials_path, token_path)
    return _google_drive_service
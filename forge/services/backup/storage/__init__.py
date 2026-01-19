"""
Storage backends package.

Provides abstract storage interface and implementations for
local filesystem, Google Drive, and S3 storage.
"""
from .base import BackupStorage, StorageConfig, StorageResult
from .gdrive import GoogleDriveStorage
from .local import LocalStorage
from .s3 import S3Storage

__all__ = [
    "BackupStorage",
    "GoogleDriveStorage",
    "LocalStorage",
    "S3Storage",
    "StorageConfig",
    "StorageResult",
]

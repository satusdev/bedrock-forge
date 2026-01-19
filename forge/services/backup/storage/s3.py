"""
Amazon S3 storage backend.

Stores backups in S3-compatible object storage using AWS CLI.
"""
import asyncio
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import BackupStorage, StorageConfig, StorageResult


class S3Storage(BackupStorage):
    """
    Amazon S3 storage backend using AWS CLI.
    
    Supports S3 and S3-compatible storage (MinIO, DigitalOcean Spaces, etc.).
    """
    
    def __init__(
        self,
        bucket: str,
        prefix: str = "forge-backups",
        region: str = "us-east-1",
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        config: Optional[StorageConfig] = None,
    ):
        """
        Initialize S3 storage.
        
        Args:
            bucket: S3 bucket name
            prefix: Prefix (folder) within the bucket
            region: AWS region
            endpoint_url: Custom endpoint for S3-compatible storage
            access_key_id: AWS access key (or use env/credentials file)
            secret_access_key: AWS secret key (or use env/credentials file)
            config: Storage configuration
        """
        super().__init__(config)
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.region = region
        self.endpoint_url = endpoint_url
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self._aws_path: Optional[str] = None
    
    @property
    def aws_path(self) -> str:
        """Get path to AWS CLI binary."""
        if self._aws_path is None:
            self._aws_path = shutil.which("aws") or "aws"
        return self._aws_path
    
    def _get_s3_uri(self, path: str) -> str:
        """Build full S3 URI."""
        full_path = f"{self.prefix}/{path}".strip("/")
        return f"s3://{self.bucket}/{full_path}"
    
    def _get_env(self) -> dict:
        """Get environment variables for AWS CLI."""
        env = os.environ.copy()
        
        if self.access_key_id:
            env["AWS_ACCESS_KEY_ID"] = self.access_key_id
        if self.secret_access_key:
            env["AWS_SECRET_ACCESS_KEY"] = self.secret_access_key
        if self.region:
            env["AWS_DEFAULT_REGION"] = self.region
        
        return env
    
    def _get_endpoint_args(self) -> list[str]:
        """Get endpoint URL arguments if configured."""
        if self.endpoint_url:
            return ["--endpoint-url", self.endpoint_url]
        return []
    
    async def _run_aws(
        self,
        *args: str,
        check: bool = True,
    ) -> tuple[bool, str, str]:
        """
        Run AWS CLI command asynchronously.
        
        Returns:
            Tuple of (success, stdout, stderr)
        """
        cmd = [self.aws_path, *self._get_endpoint_args(), *args]
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._get_env(),
            )
            stdout, stderr = await process.communicate()
            
            success = process.returncode == 0
            if check and not success:
                return False, stdout.decode(), stderr.decode()
            
            return True, stdout.decode(), stderr.decode()
            
        except Exception as e:
            return False, "", str(e)
    
    async def upload(
        self,
        local_path: Path,
        remote_path: str,
        metadata: Optional[dict] = None,
    ) -> StorageResult:
        """Upload file to S3."""
        try:
            s3_uri = self._get_s3_uri(remote_path)
            
            # Build metadata args
            metadata_args = []
            if metadata:
                metadata_str = ",".join(f"{k}={v}" for k, v in metadata.items())
                metadata_args = ["--metadata", metadata_str]
            
            success, stdout, stderr = await self._run_aws(
                "s3", "cp",
                str(local_path),
                s3_uri,
                *metadata_args,
            )
            
            if not success:
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"S3 upload failed: {stderr}",
                )
            
            size = local_path.stat().st_size
            
            return StorageResult(
                success=True,
                path=remote_path,
                size_bytes=size,
                metadata={
                    **(metadata or {}),
                    "s3_bucket": self.bucket,
                    "s3_uri": s3_uri,
                    "uploaded_at": datetime.utcnow().isoformat(),
                },
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=str(local_path),
                error=str(e),
            )
    
    async def download(
        self,
        remote_path: str,
        local_path: Path,
    ) -> StorageResult:
        """Download file from S3."""
        try:
            s3_uri = self._get_s3_uri(remote_path)
            
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            success, stdout, stderr = await self._run_aws(
                "s3", "cp",
                s3_uri,
                str(local_path),
            )
            
            if not success:
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"S3 download failed: {stderr}",
                )
            
            return StorageResult(
                success=True,
                path=str(local_path),
                size_bytes=local_path.stat().st_size if local_path.exists() else 0,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=remote_path,
                error=str(e),
            )
    
    async def delete(self, remote_path: str) -> StorageResult:
        """Delete file from S3."""
        try:
            s3_uri = self._get_s3_uri(remote_path)
            
            success, stdout, stderr = await self._run_aws(
                "s3", "rm",
                s3_uri,
            )
            
            if not success:
                # Check if file didn't exist (not an error for delete)
                if "does not exist" in stderr.lower():
                    return StorageResult(
                        success=True,
                        path=remote_path,
                    )
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"S3 delete failed: {stderr}",
                )
            
            return StorageResult(
                success=True,
                path=remote_path,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=remote_path,
                error=str(e),
            )
    
    async def list_files(
        self,
        prefix: str = "",
        max_results: int = 100,
    ) -> list[str]:
        """List files in S3 bucket/prefix."""
        try:
            search_prefix = f"{self.prefix}/{prefix}".strip("/")
            s3_uri = f"s3://{self.bucket}/{search_prefix}"
            
            success, stdout, stderr = await self._run_aws(
                "s3", "ls",
                s3_uri,
                "--recursive",
            )
            
            if not success:
                return []
            
            # Parse output - format: "2024-01-01 12:00:00 1234 path/to/file"
            files = []
            base_prefix = f"{self.prefix}/" if self.prefix else ""
            
            for line in stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    # Path is everything after date, time, size
                    file_path = " ".join(parts[3:])
                    # Remove base prefix to get relative path
                    if file_path.startswith(base_prefix):
                        file_path = file_path[len(base_prefix):]
                    files.append(file_path)
                    if len(files) >= max_results:
                        break
            
            return sorted(files, reverse=True)
            
        except Exception:
            return []
    
    async def exists(self, remote_path: str) -> bool:
        """Check if file exists in S3."""
        try:
            s3_uri = self._get_s3_uri(remote_path)
            
            success, stdout, stderr = await self._run_aws(
                "s3", "ls",
                s3_uri,
                check=False,
            )
            
            return success and bool(stdout.strip())
            
        except Exception:
            return False
    
    async def get_size(self, remote_path: str) -> int:
        """Get file size from S3."""
        try:
            s3_uri = self._get_s3_uri(remote_path)
            
            success, stdout, stderr = await self._run_aws(
                "s3", "ls",
                s3_uri,
            )
            
            if not success or not stdout.strip():
                return 0
            
            # Parse output - format: "2024-01-01 12:00:00 1234 filename"
            parts = stdout.strip().split()
            if len(parts) >= 3:
                return int(parts[2])
            return 0
            
        except Exception:
            return 0
    
    async def check_configured(self) -> tuple[bool, str]:
        """
        Check if AWS CLI is configured and bucket is accessible.
        
        Returns:
            Tuple of (is_configured, message)
        """
        try:
            # Check if AWS CLI is installed
            if not shutil.which("aws"):
                return False, "AWS CLI is not installed"
            
            # Check if we can access the bucket
            success, stdout, stderr = await self._run_aws(
                "s3", "ls",
                f"s3://{self.bucket}",
                "--max-items", "1",
            )
            
            if not success:
                if "NoSuchBucket" in stderr:
                    return False, f"Bucket '{self.bucket}' does not exist"
                if "AccessDenied" in stderr:
                    return False, f"Access denied to bucket '{self.bucket}'"
                return False, f"Failed to access bucket: {stderr}"
            
            return True, f"S3 bucket '{self.bucket}' is accessible"
            
        except Exception as e:
            return False, str(e)
    
    async def get_bucket_info(self) -> Optional[dict]:
        """
        Get S3 bucket information.
        
        Returns:
            Dict with bucket info or None if unavailable
        """
        try:
            # Get bucket location
            success, stdout, stderr = await self._run_aws(
                "s3api", "get-bucket-location",
                "--bucket", self.bucket,
                "--output", "json",
            )
            
            if not success:
                return None
            
            location = json.loads(stdout)
            
            return {
                "bucket": self.bucket,
                "region": location.get("LocationConstraint") or "us-east-1",
                "prefix": self.prefix,
            }
            
        except Exception:
            return None
    
    async def set_lifecycle_policy(
        self,
        days_to_expire: int,
        prefix: Optional[str] = None,
    ) -> bool:
        """
        Set S3 lifecycle policy for automatic deletion.
        
        Args:
            days_to_expire: Days until objects are deleted
            prefix: Optional prefix to limit policy scope
            
        Returns:
            True if policy was set successfully
        """
        try:
            policy_prefix = f"{self.prefix}/{prefix}".strip("/") if prefix else self.prefix
            
            lifecycle_config = {
                "Rules": [
                    {
                        "ID": "forge-backup-retention",
                        "Status": "Enabled",
                        "Filter": {
                            "Prefix": policy_prefix,
                        },
                        "Expiration": {
                            "Days": days_to_expire,
                        },
                    }
                ]
            }
            
            # Write config to temp file
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(lifecycle_config, f)
                config_file = f.name
            
            try:
                success, stdout, stderr = await self._run_aws(
                    "s3api", "put-bucket-lifecycle-configuration",
                    "--bucket", self.bucket,
                    "--lifecycle-configuration", f"file://{config_file}",
                )
                
                return success
                
            finally:
                # Clean up temp file
                Path(config_file).unlink(missing_ok=True)
            
        except Exception:
            return False

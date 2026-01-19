import paramiko
import os
from typing import Optional, Tuple
from pathlib import Path
from .logging import logger
from .errors import ForgeError
from io import StringIO

class SSHConnection:
    """
    Wrapper around paramiko SSHClient for simplified remote operations.
    """
    def __init__(self, host: str, user: str, key_path: Optional[str] = None, port: int = 22, password: Optional[str] = None, private_key: Optional[str] = None):
        self.host = host
        self.user = user
        self.key_path = key_path
        self.private_key = private_key
        # Removed default fallback to ~/.ssh/id_rsa to prevent FileNotFoundError in container environments
        self.password = password
        self.port = port
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self._connected = False

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def connect(self):
        """Establish SSH connection."""
        if self._connected:
            return
        try:
            logger.info(f"Connecting to {self.user}@{self.host}:{self.port}...")
            connect_kwargs = {
                "hostname": self.host,
                "username": self.user,
                "port": self.port,
                "timeout": 10
            }
            
            if self.key_path:
                connect_kwargs["key_filename"] = self.key_path
            
            if self.password:
                connect_kwargs["password"] = self.password

            if self.private_key:
                # Try to load as Ed25519 then RSA
                pkey = None
                try:
                    pkey = paramiko.Ed25519Key.from_private_key(StringIO(self.private_key))
                except:
                    try:
                        pkey = paramiko.RSAKey.from_private_key(StringIO(self.private_key))
                    except Exception as e:
                        logger.warning(f"Failed to parse provided private key: {e}")
                
                if pkey:
                    connect_kwargs["pkey"] = pkey
                
            self.client.connect(**connect_kwargs)
            self._connected = True
            logger.info("SSH connection established.")
        except Exception as e:
            raise ForgeError(f"Failed to connect to {self.host}: {e}")

    def close(self):
        """Close SSH connection."""
        if self._connected:
            self.client.close()
            self._connected = False
            logger.info("SSH connection closed.")

    def run(self, command: str, warn: bool = False) -> paramiko.ChannelFile:
        """
        Execute a command on the remote server.
        Returns a simplified result object with stdout/stderr.
        """
        if not self._connected:
            self.connect()
        
        logger.debug(f"SSH executing: {command}")
        stdin, stdout, stderr = self.client.exec_command(command)
        
        exit_status = stdout.channel.recv_exit_status()
        out_str = stdout.read().decode('utf-8').strip()
        err_str = stderr.read().decode('utf-8').strip()

        if exit_status != 0 and not warn:
            raise ForgeError(f"Command failed ({exit_status}): {command}\nStderr: {err_str}")
        
        # Mocking a result object for compatibility
        class Result:
            def __init__(self, out, err, code):
                self.stdout = out
                self.stderr = err
                self.returncode = code
        
        return Result(out_str, err_str, exit_status)

    def download(self, remote_path: str, local_path: str):
        """Download a file from remote to local."""
        if not self._connected:
            self.connect()
        
        try:
            sftp = self.client.open_sftp()
            logger.info(f"Downloading {remote_path} -> {local_path}...")
            sftp.get(remote_path, local_path)
            sftp.close()
        except Exception as e:
            raise ForgeError(f"Download failed: {e}")

    def upload(self, local_path: str, remote_path: str):
        """Upload a file from local to remote."""
        if not self._connected:
            self.connect()
        
        try:
            sftp = self.client.open_sftp()
            logger.info(f"Uploading {local_path} -> {remote_path}...")
            sftp.put(local_path, remote_path)
            sftp.close()
        except Exception as e:
            raise ForgeError(f"Upload failed: {e}")

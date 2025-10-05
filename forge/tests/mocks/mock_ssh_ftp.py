"""
Mock SSH and FTP servers for testing.

Provides mock SSH clients and FTP connections for testing deployment
functionality without actual server connections.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class MockSSHCommand:
    """Mock SSH command result."""
    command: str
    returncode: int
    stdout: str
    stderr: str


class MockSSHConnection:
    """Mock SSH connection."""

    def __init__(self):
        self.connected = False
        self.host = None
        self.port = None
        self.username = None
        self.executed_commands: List[MockSSHCommand] = []
        self.files = {}  # Simulated remote files
        self.directories = set()  # Simulated remote directories

    def connect(self, host, port=22, username=None, password=None, key_filename=None):
        """Mock SSH connection."""
        self.host = host
        self.port = port
        self.username = username
        self.connected = True

    def disconnect(self):
        """Mock SSH disconnection."""
        self.connected = False

    def exec_command(self, command):
        """Mock SSH command execution."""
        # Simulate common commands
        if "echo" in command:
            output = command.split("echo ")[1].strip('"\'')
            return Mock(stdin=None, stdout=Mock(read=lambda: output.encode()), stderr=Mock(read=lambda: b""))

        elif "ls" in command:
            files = "\n".join(self.files.keys()) if self.files else ""
            return Mock(stdin=None, stdout=Mock(read=lambda: files.encode()), stderr=Mock(read=lambda: b""))

        elif "pwd" in command:
            return Mock(stdin=None, stdout=Mock(read=lambda: b"/home/user"), stderr=Mock(read=lambda: b""))

        elif "mkdir" in command:
            dir_name = command.split("mkdir ")[1].strip()
            self.directories.add(dir_name)
            return Mock(stdin=None, stdout=Mock(read=lambda: b""), stderr=Mock(read=lambda: b""))

        elif "test -d" in command:
            path = command.split("test -d ")[1].strip()
            exists = path in self.directories
            returncode = 0 if exists else 1
            return Mock(stdin=None, stdout=Mock(read=lambda: b""), stderr=Mock(read=lambda: b""))

        elif "cp" in command:
            return Mock(stdin=None, stdout=Mock(read=lambda: b""), stderr=Mock(read=lambda: b""))

        elif command == "exit":
            return Mock(stdin=None, stdout=Mock(read=lambda: b""), stderr=Mock(read=lambda: b""))

        else:
            # Default successful command
            self.executed_commands.append(MockSSHCommand(command, 0, "", ""))
            return Mock(stdin=None, stdout=Mock(read=lambda: b"Command executed"), stderr=Mock(read=lambda: b""))

    def add_file(self, path, content="test content"):
        """Add a simulated remote file."""
        self.files[path] = content

    def add_directory(self, path):
        """Add a simulated remote directory."""
        self.directories.add(path)


class MockFTPConnection:
    """Mock FTP connection."""

    def __init__(self):
        self.connected = False
        self.host = None
        self.port = None
        self.username = None
        self.password = None
        self.current_directory = "/"
        self.files = {}  # Simulated remote files
        self.directories = ["/", "/home", "/var/www"]

    def connect(self, host, port=21):
        """Mock FTP connection."""
        self.host = host
        self.port = port
        return "220 Welcome to Mock FTP Server"

    def login(self, username, password):
        """Mock FTP login."""
        self.username = username
        self.password = password
        self.connected = True
        return "230 Login successful"

    def quit(self):
        """Mock FTP quit."""
        self.connected = False
        return "221 Goodbye"

    def pwd(self):
        """Mock print working directory."""
        return self.current_directory

    def cwd(self, path):
        """Mock change working directory."""
        if path in self.directories:
            self.current_directory = path
            return f"250 Directory changed to {path}"
        else:
            return "550 Directory not found"

    def mkdir(self, dirname):
        """Mock make directory."""
        full_path = f"{self.current_directory}/{dirname}".replace("//", "/")
        self.directories.append(full_path)
        return f"257 {dirname} created"

    def nlst(self, path=None):
        """Mock name list."""
        if path:
            return [f.split("/")[-1] for f in self.files.keys() if path in f]
        else:
            return [f.split("/")[-1] for f in self.files.keys()]

    def list(self, path=None):
        """Mock detailed list."""
        files = []
        for file_path, content in self.files.items():
            filename = file_path.split("/")[-1]
            size = len(content)
            files.append(f"-rw-r--r-- 1 user user {size:>8} Jan 1 12:00 {filename}")
        return files

    def size(self, filename):
        """Mock file size."""
        for file_path, content in self.files.items():
            if filename in file_path:
                return len(content)
        return -1

    def storbinary(self, command, fileobj, blocksize=8192, callback=None):
        """Mock store binary file."""
        # Extract filename from command
        filename = command.split(" ")[-1]
        content = fileobj.read()
        self.files[f"{self.current_directory}/{filename}"] = content
        if callback:
            callback(len(content))

    def retrbinary(self, command, callback, blocksize=8192, rest=None):
        """Mock retrieve binary file."""
        filename = command.split(" ")[-1]
        for file_path, content in self.files.items():
            if filename in file_path:
                callback(content)
                return "226 Transfer complete"
        return "550 File not found"

    def delete(self, filename):
        """Mock delete file."""
        for file_path in list(self.files.keys()):
            if filename in file_path:
                del self.files[file_path]
                return "250 Delete successful"
        return "550 File not found"

    def rename(self, oldname, newname):
        """Mock rename file."""
        old_path = f"{self.current_directory}/{oldname}"
        new_path = f"{self.current_directory}/{newname}"
        if old_path in self.files:
            self.files[new_path] = self.files.pop(old_path)
            return "250 Rename successful"
        return "550 File not found"

    def add_file(self, path, content):
        """Add a simulated remote file."""
        self.files[path] = content

    def add_directory(self, path):
        """Add a simulated remote directory."""
        self.directories.append(path)


class MockRsyncOperation:
    """Mock rsync operation."""

    def __init__(self):
        self.success = True
        self.files_transferred = 0
        self.bytes_transferred = 0
        self.duration = 0.0
        self.error_message = None

    def simulate_success(self, files_transferred=10, bytes_transferred=1048576, duration=30.0):
        """Simulate successful rsync operation."""
        self.success = True
        self.files_transferred = files_transferred
        self.bytes_transferred = bytes_transferred
        self.duration = duration
        self.error_message = None

    def simulate_failure(self, error_message="Connection failed"):
        """Simulate failed rsync operation."""
        self.success = False
        self.error_message = error_message
        self.files_transferred = 0
        self.bytes_transferred = 0
        self.duration = 0.0

    def get_result(self):
        """Get operation result."""
        return {
            "success": self.success,
            "files_transferred": self.files_transferred,
            "bytes_transferred": self.bytes_transferred,
            "duration": self.duration,
            "error": self.error_message
        }


class MockSSHServer:
    """Mock SSH server for testing."""

    def __init__(self):
        self.connections = {}
        self.default_connection = MockSSHConnection()

    def get_connection(self, host, port=22):
        """Get or create connection for host."""
        key = f"{host}:{port}"
        if key not in self.connections:
            self.connections[key] = MockSSHConnection()
        return self.connections[key]

    def simulate_connection_failure(self, host, port=22):
        """Simulate connection failure for host."""
        key = f"{host}:{port}"
        if key in self.connections:
            del self.connections[key]

    def simulate_command_failure(self, host, command, error="Command failed"):
        """Simulate command failure."""
        connection = self.get_connection(host)
        # This would be used to customize exec_command behavior


class MockFTPServer:
    """Mock FTP server for testing."""

    def __init__(self):
        self.connections = {}
        self.default_connection = MockFTPConnection()

    def get_connection(self, host, port=21):
        """Get or create connection for host."""
        key = f"{host}:{port}"
        if key not in self.connections:
            self.connections[key] = MockFTPConnection()
        return self.connections[key]

    def simulate_login_failure(self, host, port=21):
        """Simulate login failure."""
        connection = self.get_connection(host, port)
        connection.login = lambda u, p: "530 Login incorrect"

    def simulate_connection_failure(self, host, port=21):
        """Simulate connection failure."""
        connection = self.get_connection(host, port)
        connection.connect = lambda h, p=21: Exception("Connection refused")


# Context managers for patching
class SSHMockPatcher:
    """Context manager for patching SSH connections."""

    def __init__(self, ssh_server=None):
        self.ssh_server = ssh_server or MockSSHServer()
        self.patcher = None

    def __enter__(self):
        self.patcher = patch('paramiko.SSHClient')
        mock_client_class = self.patcher.start()

        def create_client():
            mock_client = Mock()
            mock_client.connect = lambda **kwargs: None
            mock_client.exec_command = lambda cmd: self.ssh_server.default_connection.exec_command(cmd)
            mock_client.close = lambda: None
            return mock_client

        mock_client_class.side_effect = create_client
        return self.ssh_server

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.patcher:
            self.patcher.stop()


class FTPMockPatcher:
    """Context manager for patching FTP connections."""

    def __init__(self, ftp_server=None):
        self.ftp_server = ftp_server or MockFTPServer()
        self.patcher = None

    def __enter__(self):
        self.patcher = patch('ftplib.FTP')
        mock_ftp_class = self.patcher.start()

        def create_ftp():
            return self.ftp_server.default_connection

        mock_ftp_class.side_effect = create_ftp
        return self.ftp_server

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.patcher:
            self.patcher.stop()


class RsyncMockPatcher:
    """Context manager for patching rsync operations."""

    def __init__(self, operation=None):
        self.operation = operation or MockRsyncOperation()
        self.patcher = None

    def __enter__(self):
        def mock_run_command(cmd, **kwargs):
            if self.operation.success:
                return Mock(returncode=0, stdout="rsync completed successfully")
            else:
                return Mock(returncode=1, stderr=self.operation.error_message)

        self.patcher = patch('subprocess.run', side_effect=mock_run_command)
        self.patcher.start()
        return self.operation

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.patcher:
            self.patcher.stop()


# Utility functions for common test scenarios
def setup_successful_ssh_connection():
    """Set up mocks for successful SSH connection."""
    return SSHMockPatcher()


def setup_ssh_connection_failure():
    """Set up mocks for SSH connection failure."""
    server = MockSSHServer()
    server.default_connection.connect = lambda **kwargs: Exception("Connection refused")
    return SSHMockPatcher(server)


def setup_successful_ftp_connection():
    """Set up mocks for successful FTP connection."""
    return FTPMockPatcher()


def setup_ftp_login_failure():
    """Set up mocks for FTP login failure."""
    server = MockFTPServer()
    server.default_connection.login = lambda u, p: "530 Login incorrect"
    return FTPMockPatcher(server)


def setup_successful_rsync_operation():
    """Set up mocks for successful rsync operation."""
    operation = MockRsyncOperation()
    operation.simulate_success()
    return RsyncMockPatcher(operation)


def setup_rsync_operation_failure():
    """Set up mocks for failed rsync operation."""
    operation = MockRsyncOperation()
    operation.simulate_failure("rsync: connection failed")
    return RsyncMockPatcher(operation)
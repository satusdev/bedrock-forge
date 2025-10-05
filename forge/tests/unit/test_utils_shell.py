"""
Unit tests for forge.utils.shell module.

Tests shell command execution utilities.
"""

import pytest
import asyncio
import subprocess
from unittest.mock import Mock, patch, call
from pathlib import Path

from forge.utils.shell import run_shell, run_shell_async, ShellCommandResult


class TestShellCommandResult:
    """Test ShellCommandResult dataclass."""

    def test_shell_command_result_success(self):
        """Test successful command result."""
        result = ShellCommandResult(
            success=True,
            command="echo hello",
            returncode=0,
            stdout="hello\n",
            stderr="",
            duration=0.05
        )

        assert result.success is True
        assert result.command == "echo hello"
        assert result.returncode == 0
        assert result.stdout == "hello\n"
        assert result.stderr == ""
        assert result.duration == 0.05

    def test_shell_command_result_failure(self):
        """Test failed command result."""
        result = ShellCommandResult(
            success=False,
            command="false",
            returncode=1,
            stdout="",
            stderr="",
            duration=0.01
        )

        assert result.success is False
        assert result.returncode == 1


class TestRunShell:
    """Test synchronous shell command execution."""

    def test_run_shell_basic(self):
        """Test basic shell command execution."""
        result = run_shell("echo 'hello world'", dry_run=False)

        assert result.success is True
        assert result.returncode == 0
        assert "hello world" in result.stdout
        assert result.stderr == ""

    def test_run_shell_with_dry_run(self):
        """Test shell command in dry run mode."""
        result = run_shell("echo 'test'", dry_run=True)

        assert result.success is True
        assert result.returncode == 0
        assert "Dry run" in result.stdout
        assert "echo 'test'" in result.stdout

    def test_run_shell_failing_command(self):
        """Test execution of failing command."""
        result = run_shell("false", dry_run=False)

        assert result.success is False
        assert result.returncode == 1

    def test_run_shell_command_with_stderr(self):
        """Test command that outputs to stderr."""
        result = run_shell("python3 -c 'import sys; sys.stderr.write(\"error message\")'", dry_run=False)

        assert result.success is True
        assert result.returncode == 0
        assert "error message" in result.stderr

    def test_run_shell_nonexistent_command(self):
        """Test execution of non-existent command."""
        result = run_shell("nonexistent_command_12345", dry_run=False)

        assert result.success is False
        assert result.returncode != 0
        assert "not found" in result.stderr.lower() or "command" in result.stderr.lower()

    def test_run_shell_with_timeout(self):
        """Test command execution with timeout."""
        # Test with reasonable timeout
        result = run_shell("sleep 0.1", timeout=1, dry_run=False)

        assert result.success is True
        assert result.returncode == 0

    def test_run_shell_timeout_exceeded(self):
        """Test command execution when timeout is exceeded."""
        result = run_shell("sleep 5", timeout=0.1, dry_run=False)

        assert result.success is False
        assert "timeout" in result.stderr.lower()

    def test_run_shell_with_working_directory(self, temp_dir):
        """Test command execution with custom working directory."""
        # Create a file in temp directory
        test_file = temp_dir / "test.txt"
        test_file.write_text("test content")

        # Run command that should find the file
        result = run_shell("ls test.txt", cwd=str(temp_dir), dry_run=False)

        assert result.success is True
        assert "test.txt" in result.stdout

    def test_run_shell_with_environment_variables(self):
        """Test command execution with custom environment variables."""
        env = {"TEST_VAR": "test_value"}
        result = run_shell("echo $TEST_VAR", env=env, dry_run=False)

        assert result.success is True
        assert "test_value" in result.stdout

    def test_run_shell_with_input(self):
        """Test command execution with input."""
        result = run_shell("cat", input="test input", dry_run=False)

        assert result.success is True
        assert "test input" in result.stdout

    def test_run_shell_verbose_mode(self):
        """Test shell command execution in verbose mode."""
        with patch('forge.utils.shell.logger') as mock_logger:
            result = run_shell("echo 'test'", verbose=True, dry_run=False)

            assert result.success is True
            mock_logger.info.assert_called()

    def test_run_shell_complex_command(self):
        """Test execution of more complex shell command."""
        result = run_shell("python3 -c 'print(\"Complex output\")'", dry_run=False)

        assert result.success is True
        assert "Complex output" in result.stdout

    def test_run_shell_with_shell_false(self):
        """Test command execution with shell=False."""
        result = run_shell(["echo", "hello"], shell=False, dry_run=False)

        assert result.success is True
        assert "hello" in result.stdout

    @patch('subprocess.run')
    def test_run_shell_subprocess_exception(self, mock_subprocess_run):
        """Test handling of subprocess exceptions."""
        mock_subprocess_run.side_effect = OSError("Permission denied")

        result = run_shell("ls", dry_run=False)

        assert result.success is False
        assert "Permission denied" in result.stderr

    def test_run_shell_with_list_command(self):
        """Test shell command execution with list command."""
        result = run_shell(["echo", "hello", "world"], dry_run=False)

        assert result.success is True
        assert "hello world" in result.stdout


class TestRunShellAsync:
    """Test asynchronous shell command execution."""

    @pytest.mark.asyncio
    async def test_run_shell_async_basic(self):
        """Test basic async shell command execution."""
        result = await run_shell_async("echo 'hello async'", dry_run=False)

        assert result.success is True
        assert result.returncode == 0
        assert "hello async" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_dry_run(self):
        """Test async shell command in dry run mode."""
        result = await run_shell_async("echo 'test'", dry_run=True)

        assert result.success is True
        assert "Dry run" in result.stdout
        assert "echo 'test'" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_failing_command(self):
        """Test async execution of failing command."""
        result = await run_shell_async("false", dry_run=False)

        assert result.success is False
        assert result.returncode == 1

    @pytest.mark.asyncio
    async def test_run_shell_async_with_timeout(self):
        """Test async command execution with timeout."""
        result = await run_shell_async("sleep 0.1", timeout=1, dry_run=False)

        assert result.success is True
        assert result.returncode == 0

    @pytest.mark.asyncio
    async def test_run_shell_async_timeout_exceeded(self):
        """Test async command execution when timeout is exceeded."""
        result = await run_shell_async("sleep 5", timeout=0.1, dry_run=False)

        assert result.success is False
        assert "timeout" in result.stderr.lower()

    @pytest.mark.asyncio
    async def test_run_shell_async_with_working_directory(self, temp_dir):
        """Test async command execution with custom working directory."""
        test_file = temp_dir / "test_async.txt"
        test_file.write_text("async test content")

        result = await run_shell_async("ls test_async.txt", cwd=str(temp_dir), dry_run=False)

        assert result.success is True
        assert "test_async.txt" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_with_environment_variables(self):
        """Test async command execution with custom environment variables."""
        env = {"ASYNC_TEST_VAR": "async_test_value"}
        result = await run_shell_async("echo $ASYNC_TEST_VAR", env=env, dry_run=False)

        assert result.success is True
        assert "async_test_value" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_with_input(self):
        """Test async command execution with input."""
        result = await run_shell_async("cat", input="async test input", dry_run=False)

        assert result.success is True
        assert "async test input" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_verbose_mode(self):
        """Test async shell command execution in verbose mode."""
        with patch('forge.utils.shell.logger') as mock_logger:
            result = await run_shell_async("echo 'test'", verbose=True, dry_run=False)

            assert result.success is True
            mock_logger.info.assert_called()

    @pytest.mark.asyncio
    async def test_run_shell_async_with_list_command(self):
        """Test async shell command execution with list command."""
        result = await run_shell_async(["echo", "hello", "async"], dry_run=False)

        assert result.success is True
        assert "hello async" in result.stdout

    @pytest.mark.asyncio
    async def test_run_shell_async_nonexistent_command(self):
        """Test async execution of non-existent command."""
        result = await run_shell_async("nonexistent_async_command_12345", dry_run=False)

        assert result.success is False
        assert result.returncode != 0


class TestShellUtilities:
    """Test additional shell utility functions."""

    def test_command_quoting(self):
        """Test command quoting for safe execution."""
        # This tests that commands with spaces are handled correctly
        result = run_shell('echo "hello world"', dry_run=False)

        assert result.success is True
        assert "hello world" in result.stdout

    def test_command_with_pipes(self):
        """Test command execution with pipes."""
        result = run_shell("echo 'hello' | grep 'hello'", dry_run=False)

        assert result.success is True
        assert "hello" in result.stdout

    def test_command_with_redirection(self):
        """Test command execution with output redirection."""
        result = run_shell("echo 'test' > /dev/null && echo 'success'", dry_run=False)

        assert result.success is True
        assert "success" in result.stdout

    def test_multiline_command(self):
        """Test execution of multiline command."""
        cmd = '''
        echo "line1"
        echo "line2"
        '''
        result = run_shell(cmd, dry_run=False)

        assert result.success is True
        assert "line1" in result.stdout
        assert "line2" in result.stdout

    def test_command_with_special_characters(self):
        """Test command execution with special characters."""
        result = run_shell('echo "test with $VAR and \\"quotes\\""', dry_run=False)

        assert result.success is True
        assert "test with $VAR and" in result.stdout

    def test_long_running_command(self):
        """Test execution of longer running command."""
        result = run_shell("python3 -c 'import time; time.sleep(0.2); print(\"done\")'", dry_run=False)

        assert result.success is True
        assert "done" in result.stdout
        assert result.duration >= 0.2

    @patch('forge.utils.shell.logger')
    def test_error_logging(self, mock_logger):
        """Test that errors are properly logged."""
        result = run_shell("false", dry_run=False, verbose=True)

        assert result.success is False
        # Check that error was logged
        mock_logger.error.assert_called()

    def test_command_with_unicode_output(self):
        """Test command execution with unicode output."""
        result = run_shell('python3 -c "print(\"Unicode: 🚀 Test\")"', dry_run=False)

        assert result.success is True
        assert "🚀" in result.stdout
        assert "Test" in result.stdout
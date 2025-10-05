"""
Unit tests for forge.commands.sync module.

Tests backup, sync, and restore functionality.
"""

import pytest
import json
import tempfile
from pathlib import Path
from datetime import datetime
from unittest.mock import Mock, patch, call, MagicMock
from typer.testing import CliRunner

from forge.commands.sync import app
from forge.utils.errors import ForgeError


class TestSyncCommands:
    """Test sync command functionality."""

    def setup_method(self):
        """Set up test environment."""
        self.runner = CliRunner()
        self.temp_dir = Path(tempfile.mkdtemp())
        self.backup_dir = self.temp_dir / "backups"
        self.backup_dir.mkdir()

    def test_backup_command_basic(self):
        """Test basic backup command."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            mock_upload.return_value = {
                "success": True,
                "files_transferred": 10,
                "bytes": 1048576,
                "duration": 30.5
            }

            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket'
            ])

            assert result.exit_code == 0
            assert "Backup completed successfully" in result.stdout
            mock_upload.assert_called_once()

    def test_backup_command_with_dry_run(self):
        """Test backup command with dry run."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--dry-run'
            ])

            assert result.exit_code == 0
            assert "Dry run" in result.stdout
            mock_upload.assert_not_called()

    def test_backup_command_failure(self):
        """Test backup command failure."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            mock_upload.side_effect = ForgeError("Upload failed")

            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket'
            ])

            assert result.exit_code != 0
            assert "Backup failed" in result.stdout

    def test_backup_command_with_excludes(self):
        """Test backup command with exclude patterns."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            mock_upload.return_value = {"success": True}

            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--exclude', 'node_modules',
                '--exclude', '*.log',
                '--exclude', '.env'
            ])

            assert result.exit_code == 0
            # Verify excludes were passed correctly
            args, kwargs = mock_upload.call_args
            assert 'exclude' in kwargs
            assert 'node_modules' in kwargs['exclude']
            assert '*.log' in kwargs['exclude']

    def test_backup_command_with_compression(self):
        """Test backup command with compression."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            mock_upload.return_value = {"success": True}

            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--compress'
            ])

            assert result.exit_code == 0
            args, kwargs = mock_upload.call_args
            assert kwargs.get('compress') is True

    def test_backup_command_with_bandwidth_limit(self):
        """Test backup command with bandwidth limit."""
        with patch('forge.commands.sync.upload_via_rclone') as mock_upload:
            mock_upload.return_value = {"success": True}

            result = self.runner.invoke(app, [
                'backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--bandwidth-limit', '1000'
            ])

            assert result.exit_code == 0
            args, kwargs = mock_upload.call_args
            assert kwargs.get('bandwidth_limit') == 1000

    def test_restore_command_basic(self):
        """Test basic restore command."""
        with patch('forge.commands.sync.download_via_rclone') as mock_download:
            mock_download.return_value = {
                "success": True,
                "files_transferred": 10,
                "bytes": 1048576,
                "duration": 25.0
            }

            result = self.runner.invoke(app, [
                'restore',
                'test_remote:test_bucket/test-backup',
                str(self.temp_dir),
                '--target', 'test-site'
            ])

            assert result.exit_code == 0
            assert "Restore completed successfully" in result.stdout
            mock_download.assert_called_once()

    def test_restore_command_with_dry_run(self):
        """Test restore command with dry run."""
        with patch('forge.commands.sync.download_via_rclone') as mock_download:
            result = self.runner.invoke(app, [
                'restore',
                'test_remote:test_bucket/test-backup',
                str(self.temp_dir),
                '--target', 'test-site',
                '--dry-run'
            ])

            assert result.exit_code == 0
            assert "Dry run" in result.stdout
            mock_download.assert_not_called()

    def test_restore_command_failure(self):
        """Test restore command failure."""
        with patch('forge.commands.sync.download_via_rclone') as mock_download:
            mock_download.side_effect = ForgeError("Download failed")

            result = self.runner.invoke(app, [
                'restore',
                'test_remote:test_bucket/test-backup',
                str(self.temp_dir),
                '--target', 'test-site'
            ])

            assert result.exit_code != 0
            assert "Restore failed" in result.stdout

    def test_list_backups_command(self):
        """Test listing backups."""
        mock_backups = [
            {
                "Path": "backups/site1_20240101_120000",
                "Size": 1048576,
                "ModTime": "2024-01-01T12:00:00Z"
            },
            {
                "Path": "backups/site1_20240102_120000",
                "Size": 2097152,
                "ModTime": "2024-01-02T12:00:00Z"
            }
        ]

        with patch('forge.commands.sync.list_rclone_backups') as mock_list:
            mock_list.return_value = mock_backups

            result = self.runner.invoke(app, [
                'list-backups',
                'test_remote:test_bucket'
            ])

            assert result.exit_code == 0
            assert "site1_20240101_120000" in result.stdout
            assert "site1_20240102_120000" in result.stdout
            assert "1.0 MB" in result.stdout
            assert "2.0 MB" in result.stdout

    def test_list_backups_command_empty(self):
        """Test listing backups when none exist."""
        with patch('forge.commands.sync.list_rclone_backups') as mock_list:
            mock_list.return_value = []

            result = self.runner.invoke(app, [
                'list-backups',
                'test_remote:test_bucket'
            ])

            assert result.exit_code == 0
            assert "No backups found" in result.stdout

    def test_list_backups_command_failure(self):
        """Test listing backups failure."""
        with patch('forge.commands.sync.list_rclone_backups') as mock_list:
            mock_list.side_effect = ForgeError("Failed to list backups")

            result = self.runner.invoke(app, [
                'list-backups',
                'test_remote:test_bucket'
            ])

            assert result.exit_code != 0
            assert "Failed to list backups" in result.stdout

    def test_sync_command_basic(self):
        """Test basic sync command."""
        with patch('forge.commands.sync.sync_with_rclone') as mock_sync:
            mock_sync.return_value = {
                "success": True,
                "files_synced": 5,
                "bytes": 512000,
                "duration": 15.0
            }

            result = self.runner.invoke(app, [
                'sync',
                str(self.temp_dir),
                'test_remote:test_bucket/site-sync'
            ])

            assert result.exit_code == 0
            assert "Sync completed successfully" in result.stdout
            mock_sync.assert_called_once()

    def test_sync_command_with_direction(self):
        """Test sync command with direction."""
        with patch('forge.commands.sync.sync_with_rclone') as mock_sync:
            mock_sync.return_value = {"success": True}

            # Test download direction
            result = self.runner.invoke(app, [
                'sync',
                str(self.temp_dir),
                'test_remote:test_bucket/site-sync',
                '--direction', 'download'
            ])

            assert result.exit_code == 0
            args, kwargs = mock_sync.call_args
            assert kwargs.get('direction') == 'download'

    def test_sync_command_with_dry_run(self):
        """Test sync command with dry run."""
        with patch('forge.commands.sync.sync_with_rclone') as mock_sync:
            result = self.runner.invoke(app, [
                'sync',
                str(self.temp_dir),
                'test_remote:test_bucket/site-sync',
                '--dry-run'
            ])

            assert result.exit_code == 0
            assert "Dry run" in result.stdout
            mock_sync.assert_not_called()

    def test_sync_command_with_delete(self):
        """Test sync command with delete option."""
        with patch('forge.commands.sync.sync_with_rclone') as mock_sync:
            mock_sync.return_value = {"success": True}

            result = self.runner.invoke(app, [
                'sync',
                str(self.temp_dir),
                'test_remote:test_bucket/site-sync',
                '--delete'
            ])

            assert result.exit_code == 0
            args, kwargs = mock_sync.call_args
            assert kwargs.get('delete') is True

    def test_cleanup_command_basic(self):
        """Test basic cleanup command."""
        mock_backups = [
            {"Path": "backup1", "ModTime": "2024-01-01T12:00:00Z"},
            {"Path": "backup2", "ModTime": "2024-01-02T12:00:00Z"},
            {"Path": "backup3", "ModTime": "2024-01-03T12:00:00Z"}
        ]

        with patch('forge.commands.sync.list_rclone_backups') as mock_list, \
             patch('forge.commands.sync.delete_rclone_backup') as mock_delete:

            mock_list.return_value = mock_backups

            result = self.runner.invoke(app, [
                'cleanup',
                'test_remote:test_bucket',
                '--keep', '2'
            ])

            assert result.exit_code == 0
            assert "Cleanup completed" in result.stdout
            # Should delete oldest backup
            assert mock_delete.call_count == 1
            mock_delete.assert_called_with('test_remote:test_bucket', 'backup1')

    def test_cleanup_command_dry_run(self):
        """Test cleanup command with dry run."""
        mock_backups = [
            {"Path": "backup1", "ModTime": "2024-01-01T12:00:00Z"},
            {"Path": "backup2", "ModTime": "2024-01-02T12:00:00Z"}
        ]

        with patch('forge.commands.sync.list_rclone_backups') as mock_list, \
             patch('forge.commands.sync.delete_rclone_backup') as mock_delete:

            mock_list.return_value = mock_backups

            result = self.runner.invoke(app, [
                'cleanup',
                'test_remote:test_bucket',
                '--keep', '1',
                '--dry-run'
            ])

            assert result.exit_code == 0
            assert "Dry run" in result.stdout
            assert "Would delete" in result.stdout
            mock_delete.assert_not_called()

    def test_cleanup_command_nothing_to_delete(self):
        """Test cleanup command when nothing to delete."""
        mock_backups = [
            {"Path": "backup1", "ModTime": "2024-01-01T12:00:00Z"}
        ]

        with patch('forge.commands.sync.list_rclone_backups') as mock_list, \
             patch('forge.commands.sync.delete_rclone_backup') as mock_delete:

            mock_list.return_value = mock_backups

            result = self.runner.invoke(app, [
                'cleanup',
                'test_remote:test_bucket',
                '--keep', '5'
            ])

            assert result.exit_code == 0
            assert "No backups to delete" in result.stdout
            mock_delete.assert_not_called()

    def test_status_command_basic(self):
        """Test backup status command."""
        with patch('forge.commands.sync.get_backup_status') as mock_status:
            mock_status.return_value = {
                "last_backup": "2024-01-01T12:00:00Z",
                "total_backups": 5,
                "total_size": 10485760,
                "last_size": 2097152
            }

            result = self.runner.invoke(app, [
                'status',
                'test_remote:test_bucket'
            ])

            assert result.exit_code == 0
            assert "Last backup" in result.stdout
            assert "Total backups: 5" in result.stdout
            assert "10.0 MB" in result.stdout

    def test_status_command_no_backups(self):
        """Test status command when no backups exist."""
        with patch('forge.commands.sync.get_backup_status') as mock_status:
            mock_status.return_value = {
                "last_backup": None,
                "total_backups": 0,
                "total_size": 0,
                "last_size": 0
            }

            result = self.runner.invoke(app, [
                'status',
                'test_remote:test_bucket'
            ])

            assert result.exit_code == 0
            assert "No backups found" in result.stdout

    def test_schedule_backup_command_basic(self):
        """Test schedule backup command."""
        with patch('forge.commands.sync.schedule_celery_backup') as mock_schedule:
            mock_schedule.return_value = {"task_id": "task_123", "scheduled": True}

            result = self.runner.invoke(app, [
                'schedule-backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--schedule', '0 2 * * *'  # Daily at 2 AM
            ])

            assert result.exit_code == 0
            assert "Backup scheduled successfully" in result.stdout
            assert "task_123" in result.stdout
            mock_schedule.assert_called_once()

    def test_schedule_backup_command_invalid_schedule(self):
        """Test schedule backup command with invalid cron schedule."""
        result = self.runner.invoke(app, [
            'schedule-backup',
            str(self.temp_dir),
            'test-backup',
            '--remote', 'test_remote:test_bucket',
            '--schedule', 'invalid cron'
        ])

        assert result.exit_code != 0
        assert "Invalid cron schedule" in result.stdout

    def test_schedule_backup_command_failure(self):
        """Test schedule backup command failure."""
        with patch('forge.commands.sync.schedule_celery_backup') as mock_schedule:
            mock_schedule.side_effect = ForgeError("Failed to schedule backup")

            result = self.runner.invoke(app, [
                'schedule-backup',
                str(self.temp_dir),
                'test-backup',
                '--remote', 'test_remote:test_bucket',
                '--schedule', '0 2 * * *'
            ])

            assert result.exit_code != 0
            assert "Failed to schedule backup" in result.stdout

    def test_verify_backup_command_basic(self):
        """Test verify backup command."""
        with patch('forge.commands.sync.verify_rclone_backup') as mock_verify:
            mock_verify.return_value = {
                "valid": True,
                "files_checked": 100,
                "errors": [],
                "checksum_passed": True
            }

            result = self.runner.invoke(app, [
                'verify-backup',
                'test_remote:test_bucket/test-backup'
            ])

            assert result.exit_code == 0
            assert "Backup verification passed" in result.stdout
            assert "100 files checked" in result.stdout

    def test_verify_backup_command_failure(self):
        """Test verify backup command with errors."""
        with patch('forge.commands.sync.verify_rclone_backup') as mock_verify:
            mock_verify.return_value = {
                "valid": False,
                "files_checked": 100,
                "errors": ["Checksum mismatch for file1.txt"],
                "checksum_passed": False
            }

            result = self.runner.invoke(app, [
                'verify-backup',
                'test_remote:test_bucket/test-backup'
            ])

            assert result.exit_code != 0
            assert "Backup verification failed" in result.stdout
            assert "Checksum mismatch" in result.stdout

    def test_backup_with_local_path_validation(self):
        """Test backup command validates local path."""
        # Test with non-existent path
        result = self.runner.invoke(app, [
            'backup',
            '/non/existent/path',
            'test-backup',
            '--remote', 'test_remote:test_bucket'
        ])

        assert result.exit_code != 0
        assert "does not exist" in result.stdout

    def test_backup_with_remote_validation(self):
        """Test backup command validates remote format."""
        result = self.runner.invoke(app, [
            'backup',
            str(self.temp_dir),
            'test-backup',
            '--remote', 'invalid_remote_format'
        ])

        assert result.exit_code != 0
        assert "Invalid remote format" in result.stdout

    def test_restore_with_target_validation(self):
        """Test restore command validates target."""
        result = self.runner.invoke(app, [
            'restore',
            'test_remote:test_bucket/test-backup',
            str(self.temp_dir)
            # Missing --target
        ])

        assert result.exit_code != 0
        assert "Target site name is required" in result.stdout


class TestSyncUtilities:
    """Test sync utility functions."""

    def test_format_bytes(self):
        """Test byte formatting function."""
        from forge.commands.sync import format_bytes

        assert format_bytes(0) == "0 B"
        assert format_bytes(1024) == "1.0 KB"
        assert format_bytes(1048576) == "1.0 MB"
        assert format_bytes(1073741824) == "1.0 GB"

    def test_parse_remote(self):
        """Test remote parsing function."""
        from forge.commands.sync import parse_remote

        result = parse_remote("remote:bucket/path")
        assert result["remote"] == "remote"
        assert result["bucket"] == "bucket"
        assert result["path"] == "path"

        result = parse_remote("remote:bucket")
        assert result["remote"] == "remote"
        assert result["bucket"] == "bucket"
        assert result["path"] == ""

    def test_validate_cron_schedule(self):
        """Test cron schedule validation."""
        from forge.commands.sync import validate_cron_schedule

        # Valid schedules
        assert validate_cron_schedule("0 2 * * *") is True  # Daily at 2 AM
        assert validate_cron_schedule("*/15 * * * *") is True  # Every 15 minutes
        assert validate_cron_schedule("0 0 1 * *") is True  # Monthly

        # Invalid schedules
        assert validate_cron_schedule("invalid") is False
        assert validate_cron_schedule("60 * * * *") is False  # Invalid minute
        assert validate_cron_schedule("0 25 * * *") is False  # Invalid hour

    def test_generate_backup_name(self):
        """Test backup name generation."""
        from forge.commands.sync import generate_backup_name

        # Test with specific datetime
        test_time = datetime(2024, 1, 15, 14, 30, 0)
        name = generate_backup_name("test-site", test_time)
        assert "test-site" in name
        assert "20240115_143000" in name

        # Test with current time
        name = generate_backup_name("test-site")
        assert "test-site" in name
        assert len(name) > len("test-site")  # Should have timestamp

    def test_filter_backups_by_site(self):
        """Test filtering backups by site name."""
        from forge.commands.sync import filter_backups_by_site

        backups = [
            {"Path": "site1_20240101_120000"},
            {"Path": "site2_20240101_120000"},
            {"Path": "site1_20240102_120000"},
            {"Path": "other_backup"}
        ]

        filtered = filter_backups_by_site(backups, "site1")
        assert len(filtered) == 2
        assert all("site1_" in backup["Path"] for backup in filtered)

    def test_sort_backups_by_date(self):
        """Test sorting backups by date."""
        from forge.commands.sync import sort_backups_by_date

        backups = [
            {"Path": "site_20240103_120000", "ModTime": "2024-01-03T12:00:00Z"},
            {"Path": "site_20240101_120000", "ModTime": "2024-01-01T12:00:00Z"},
            {"Path": "site_20240102_120000", "ModTime": "2024-01-02T12:00:00Z"}
        ]

        sorted_backups = sort_backups_by_date(backups)
        assert sorted_backups[0]["Path"] == "site_20240101_120000"
        assert sorted_backups[1]["Path"] == "site_20240102_120000"
        assert sorted_backups[2]["Path"] == "site_20240103_120000"
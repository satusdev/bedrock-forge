"""
Unit tests for forge.utils.config module.

Tests configuration management and loading utilities.
"""

import pytest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, mock_open
from dataclasses import asdict

from forge.utils.config import load_config, save_config, ForgeConfig
from forge.utils.errors import ForgeError


class TestForgeConfig:
    """Test ForgeConfig dataclass functionality."""

    def test_forge_config_creation(self):
        """Test creating a forge configuration."""
        config = ForgeConfig(
            admin_user="test_admin",
            admin_email="test@example.com",
            site_name="test_site",
            php_version="8.1",
            mysql_version="8.0",
            github_token="test_token"
        )

        assert config.admin_user == "test_admin"
        assert config.admin_email == "test@example.com"
        assert config.site_name == "test_site"
        assert config.php_version == "8.1"
        assert config.mysql_version == "8.0"
        assert config.github_token == "test_token"

    def test_forge_config_defaults(self):
        """Test forge configuration with default values."""
        config = ForgeConfig()

        assert config.admin_user == "admin"
        assert config.admin_email == "admin@example.com"
        assert config.site_name == "my-site"
        assert config.php_version == "8.1"
        assert config.mysql_version == "8.0"
        assert config.github_token is None

    def test_forge_config_to_dict(self):
        """Test converting forge config to dictionary."""
        config = ForgeConfig(
            admin_user="test_admin",
            site_name="test_site",
            additional_config={"theme": "test-theme"}
        )

        config_dict = asdict(config)

        assert config_dict["admin_user"] == "test_admin"
        assert config_dict["site_name"] == "test_site"
        assert config_dict["additional_config"] == {"theme": "test-theme"}

    def test_forge_config_from_dict(self):
        """Test creating forge config from dictionary."""
        data = {
            "admin_user": "test_admin",
            "admin_email": "test@example.com",
            "site_name": "test_site",
            "php_version": "8.2",
            "mysql_version": "8.0",
            "github_token": "test_token",
            "additional_config": {"theme": "test-theme"}
        }

        config = ForgeConfig(**data)

        assert config.admin_user == "test_admin"
        assert config.admin_email == "test@example.com"
        assert config.site_name == "test_site"
        assert config.php_version == "8.2"
        assert config.mysql_version == "8.0"
        assert config.github_token == "test_token"
        assert config.additional_config == {"theme": "test-theme"}


class TestLoadConfig:
    """Test configuration loading functionality."""

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_from_file(self, mock_read_text, mock_exists):
        """Test loading configuration from file."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "file_admin",
            "admin_email": "file@example.com",
            "site_name": "file_site"
        }
        mock_read_text.return_value = json.dumps(config_data)

        config = load_config(site_name="testsite", env="local")

        assert config.admin_user == "file_admin"
        assert config.admin_email == "file@example.com"
        assert config.site_name == "file_site"

    @patch('forge.utils.config.Path.exists')
    def test_load_config_file_not_found(self, mock_exists):
        """Test loading configuration when file doesn't exist."""
        mock_exists.return_value = False

        with pytest.raises(ForgeError, match="Configuration file not found"):
            load_config(site_name="testsite", env="local")

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_invalid_json(self, mock_read_text, mock_exists):
        """Test loading configuration with invalid JSON."""
        mock_exists.return_value = True
        mock_read_text.return_value = "invalid json content"

        with pytest.raises(ForgeError, match="Invalid JSON in configuration file"):
            load_config(site_name="testsite", env="local")

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_with_defaults(self, mock_read_text, mock_exists):
        """Test loading configuration with default values."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "custom_admin"
            # Other fields should use defaults
        }
        mock_read_text.return_value = json.dumps(config_data)

        config = load_config(site_name="testsite", env="local")

        assert config.admin_user == "custom_admin"
        assert config.admin_email == "admin@example.com"  # Default
        assert config.php_version == "8.1"  # Default

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_with_additional_config(self, mock_read_text, mock_exists):
        """Test loading configuration with additional configuration."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "test_admin",
            "additional_config": {
                "theme": "custom-theme",
                "plugins": ["plugin1", "plugin2"]
            }
        }
        mock_read_text.return_value = json.dumps(config_data)

        config = load_config(site_name="testsite", env="local")

        assert config.admin_user == "test_admin"
        assert config.additional_config == {
            "theme": "custom-theme",
            "plugins": ["plugin1", "plugin2"]
        }

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_different_environments(self, mock_read_text, mock_exists):
        """Test loading configuration for different environments."""
        # Test staging environment
        mock_exists.return_value = True
        config_data = {
            "admin_user": "staging_admin",
            "site_name": "staging_site"
        }
        mock_read_text.return_value = json.dumps(config_data)

        config = load_config(site_name="testsite", env="staging")

        assert config.admin_user == "staging_admin"
        assert config.site_name == "staging_site"

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_with_overrides(self, mock_read_text, mock_exists):
        """Test loading configuration with environment variable overrides."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "file_admin",
            "admin_email": "file@example.com"
        }
        mock_read_text.return_value = json.dumps(config_data)

        with patch.dict(os.environ, {
            'FORGE_ADMIN_USER': 'env_admin',
            'FORGE_PHP_VERSION': '8.2'
        }):
            config = load_config(site_name="testsite", env="local")

            assert config.admin_user == "env_admin"  # Overridden by env
            assert config.admin_email == "file@example.com"  # From file
            assert config.php_version == "8.2"  # Overridden by env

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    @patch('forge.utils.config.keyring')
    def test_load_config_with_keyring_token(self, mock_keyring, mock_read_text, mock_exists):
        """Test loading configuration with GitHub token from keyring."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "test_admin"
        }
        mock_read_text.return_value = json.dumps(config_data)
        mock_keyring.get_password.return_value = "keyring_token"

        config = load_config(site_name="testsite", env="local")

        assert config.github_token == "keyring_token"
        mock_keyring.get_password.assert_called_once_with("forge", "github_token")

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    @patch('forge.utils.config.keyring')
    def test_load_config_keyring_priority_over_env(self, mock_keyring, mock_read_text, mock_exists):
        """Test that keyring token takes priority over environment variable."""
        mock_exists.return_value = True
        config_data = {"admin_user": "test_admin"}
        mock_read_text.return_value = json.dumps(config_data)
        mock_keyring.get_password.return_value = "keyring_token"

        with patch.dict(os.environ, {'GITHUB_TOKEN': 'env_token'}):
            config = load_config(site_name="testsite", env="local")

            assert config.github_token == "keyring_token"  # Keyring should win

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    @patch('forge.utils.config.keyring')
    def test_load_config_env_token_as_fallback(self, mock_keyring, mock_read_text, mock_exists):
        """Test environment variable as fallback when keyring has no token."""
        mock_exists.return_value = True
        config_data = {"admin_user": "test_admin"}
        mock_read_text.return_value = json.dumps(config_data)
        mock_keyring.get_password.return_value = None  # No token in keyring

        with patch.dict(os.environ, {'GITHUB_TOKEN': 'env_token'}):
            config = load_config(site_name="testsite", env="local")

            assert config.github_token == "env_token"

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_with_validation_errors(self, mock_read_text, mock_exists):
        """Test loading configuration with validation errors."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "",  # Invalid empty username
            "admin_email": "invalid-email"  # Invalid email format
        }
        mock_read_text.return_value = json.dumps(config_data)

        with pytest.raises(ForgeError, match="Invalid configuration"):
            load_config(site_name="testsite", env="local")

    @patch('forge.utils.config.Path.exists')
    @patch('forge.utils.config.Path.read_text')
    def test_load_config_with_unknown_fields(self, mock_read_text, mock_exists):
        """Test loading configuration with unknown fields."""
        mock_exists.return_value = True
        config_data = {
            "admin_user": "test_admin",
            "unknown_field": "value",
            "another_unknown": {"nested": "value"}
        }
        mock_read_text.return_value = json.dumps(config_data)

        # Should not raise error, just ignore unknown fields
        config = load_config(site_name="testsite", env="local")
        assert config.admin_user == "test_admin"
        assert not hasattr(config, 'unknown_field')


class TestSaveConfig:
    """Test configuration saving functionality."""

    def test_save_config_new_file(self, temp_dir):
        """Test saving configuration to new file."""
        config = ForgeConfig(
            admin_user="save_test_admin",
            admin_email="save@example.com",
            site_name="save_test_site"
        )

        config_path = temp_dir / "test_config.json"
        save_config(config, config_path)

        assert config_path.exists()
        saved_data = json.loads(config_path.read_text())
        assert saved_data["admin_user"] == "save_test_admin"
        assert saved_data["admin_email"] == "save@example.com"
        assert saved_data["site_name"] == "save_test_site"

    def test_save_config_existing_file(self, temp_dir):
        """Test saving configuration to existing file."""
        # Create existing config
        existing_config = {
            "admin_user": "old_admin",
            "admin_email": "old@example.com"
        }
        config_path = temp_dir / "existing_config.json"
        config_path.write_text(json.dumps(existing_config))

        # Save new config
        new_config = ForgeConfig(
            admin_user="new_admin",
            admin_email="new@example.com",
            site_name="new_site"
        )
        save_config(new_config, config_path)

        # Verify file was updated
        saved_data = json.loads(config_path.read_text())
        assert saved_data["admin_user"] == "new_admin"
        assert saved_data["admin_email"] == "new@example.com"
        assert saved_data["site_name"] == "new_site"

    def test_save_config_creates_directory(self, temp_dir):
        """Test that save_config creates parent directories."""
        config = ForgeConfig(admin_user="test_admin")
        config_path = temp_dir / "subdir" / "nested" / "config.json"

        save_config(config, config_path)

        assert config_path.exists()
        assert config_path.parent.exists()

    def test_save_config_with_additional_config(self, temp_dir):
        """Test saving configuration with additional configuration."""
        config = ForgeConfig(
            admin_user="test_admin",
            additional_config={
                "theme": "custom-theme",
                "plugins": ["plugin1", "plugin2"],
                "settings": {"option1": "value1"}
            }
        )

        config_path = temp_dir / "config_with_additional.json"
        save_config(config, config_path)

        saved_data = json.loads(config_path.read_text())
        assert saved_data["additional_config"] == {
            "theme": "custom-theme",
            "plugins": ["plugin1", "plugin2"],
            "settings": {"option1": "value1"}
        }

    def test_save_config_permission_error(self, temp_dir):
        """Test saving configuration with permission error."""
        config = ForgeConfig(admin_user="test_admin")
        config_path = temp_dir / "config.json"

        # Make parent directory read-only
        temp_dir.chmod(0o444)

        with pytest.raises(ForgeError, match="Failed to save configuration"):
            save_config(config, config_path)

        # Restore permissions for cleanup
        temp_dir.chmod(0o755)


class TestConfigValidation:
    """Test configuration validation functionality."""

    def test_validate_valid_config(self):
        """Test validation of valid configuration."""
        config = ForgeConfig(
            admin_user="valid_admin",
            admin_email="valid@example.com",
            site_name="valid-site",
            php_version="8.1",
            mysql_version="8.0"
        )

        # Should not raise any errors
        config.validate()  # Assuming this method exists

    def test_validate_invalid_admin_user(self):
        """Test validation with invalid admin username."""
        with pytest.raises(ForgeError, match="Invalid admin username"):
            ForgeConfig(admin_user="").validate()

    def test_validate_invalid_admin_email(self):
        """Test validation with invalid admin email."""
        with pytest.raises(ForgeError, match="Invalid admin email"):
            ForgeConfig(admin_email="invalid-email").validate()

    def test_validate_invalid_site_name(self):
        """Test validation with invalid site name."""
        with pytest.raises(ForgeError, match="Invalid site name"):
            ForgeConfig(site_name="").validate()

    def test_validate_invalid_php_version(self):
        """Test validation with invalid PHP version."""
        with pytest.raises(ForgeError, match="Invalid PHP version"):
            ForgeConfig(php_version="invalid").validate()

    def test_validate_invalid_mysql_version(self):
        """Test validation with invalid MySQL version."""
        with pytest.raises(ForgeError, match="Invalid MySQL version"):
            ForgeConfig(mysql_version="invalid").validate()


class TestConfigUtilities:
    """Test configuration utility functions."""

    @patch('forge.utils.config.Path.home')
    @patch('forge.utils.config.Path.exists')
    def test_get_default_config_path(self, mock_exists, mock_home):
        """Test getting default configuration path."""
        mock_home.return_value = Path("/home/user")
        mock_exists.return_value = True

        from forge.utils.config import get_default_config_path
        config_path = get_default_config_path()

        assert config_path == Path("/home/user/.forge/config.json")

    def test_get_config_path_for_site(self):
        """Test getting configuration path for specific site."""
        from forge.utils.config import get_config_path_for_site

        config_path = get_config_path_for_site("testsite", "local")
        expected = Path.cwd() / ".forge" / "config" / "testsite" / "local.json"
        assert config_path == expected

    @patch('forge.utils.config.load_config')
    @patch('forge.utils.config.save_config')
    def test_update_config(self, mock_save_config, mock_load_config):
        """Test updating existing configuration."""
        existing_config = ForgeConfig(
            admin_user="old_admin",
            admin_email="old@example.com"
        )
        mock_load_config.return_value = existing_config

        from forge.utils.config import update_config
        updated_config = update_config(
            site_name="testsite",
            env="local",
            updates={"admin_email": "new@example.com", "php_version": "8.2"}
        )

        assert updated_config.admin_user == "old_admin"  # Unchanged
        assert updated_config.admin_email == "new@example.com"  # Updated
        assert updated_config.php_version == "8.2"  # Updated
        mock_save_config.assert_called_once()

    @patch('forge.utils.config.Path.exists')
    def test_list_available_sites(self, mock_exists):
        """Test listing available configured sites."""
        mock_exists.return_value = True

        with patch('forge.utils.config.Path.iterdir') as mock_iterdir:
            mock_iterdir.return_value = [
                Path("site1"),
                Path("site2"),
                Path("site3")
            ]

            from forge.utils.config import list_available_sites
            sites = list_available_sites()

            assert set(sites) == {"site1", "site2", "site3"}

    def test_merge_configurations(self):
        """Test merging two configurations."""
        from forge.utils.config import merge_configurations

        base_config = ForgeConfig(
            admin_user="base_admin",
            admin_email="base@example.com",
            php_version="8.1"
        )

        override_config = {
            "admin_email": "override@example.com",
            "php_version": "8.2",
            "additional_config": {"theme": "new-theme"}
        }

        merged = merge_configurations(base_config, override_config)

        assert merged.admin_user == "base_admin"  # From base
        assert merged.admin_email == "override@example.com"  # From override
        assert merged.php_version == "8.2"  # From override
        assert merged.additional_config == {"theme": "new-theme"}  # From override
"""
Plugin system for Bedrock Forge.

This module provides a flexible plugin architecture that allows users to extend
Forge functionality with custom providers, deployment strategies, and workflows.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Type
from pathlib import Path
import importlib.util
import inspect
import json
from dataclasses import dataclass

from ..utils.logging import logger
from ..utils.errors import ForgeError

_ = lambda x: x  # Placeholder for gettext


@dataclass
class PluginInfo:
    """Information about a plugin."""
    name: str
    version: str
    description: str
    author: str
    module_path: str
    class_name: str
    plugin_type: str
    enabled: bool = True


class BasePlugin(ABC):
    """Base class for all Forge plugins."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Plugin name."""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """Plugin version."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Plugin description."""
        pass

    @property
    @abstractmethod
    def author(self) -> str:
        """Plugin author."""
        pass

    @abstractmethod
    def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize the plugin with configuration."""
        pass

    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        return True

    def cleanup(self) -> None:
        """Cleanup resources when plugin is unloaded."""
        pass


class ProviderPlugin(BasePlugin):
    """Base class for provider plugins."""

    @abstractmethod
    def provision_server(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Provision a new server."""
        pass

    @abstractmethod
    def get_server_info(self, server_id: str) -> Dict[str, Any]:
        """Get server information."""
        pass

    @abstractmethod
    def delete_server(self, server_id: str) -> bool:
        """Delete a server."""
        pass

    def list_servers(self) -> List[Dict[str, Any]]:
        """List all servers."""
        return []


class DeploymentPlugin(BasePlugin):
    """Base class for deployment plugins."""

    @abstractmethod
    def deploy(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute deployment."""
        pass

    @abstractmethod
    def rollback(self, deployment_id: str) -> Dict[str, Any]:
        """Rollback deployment."""
        pass

    @abstractmethod
    def get_deployment_status(self, deployment_id: str) -> Dict[str, Any]:
        """Get deployment status."""
        pass


class BackupPlugin(BasePlugin):
    """Base class for backup plugins."""

    @abstractmethod
    def create_backup(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create backup."""
        pass

    @abstractmethod
    def restore_backup(self, backup_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Restore backup."""
        pass

    @abstractmethod
    def list_backups(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """List available backups."""
        pass


class NotificationPlugin(BasePlugin):
    """Base class for notification plugins."""

    @abstractmethod
    def send_notification(self, message: str, config: Dict[str, Any]) -> bool:
        """Send notification."""
        pass


class PluginManager:
    """Manages plugin loading, unloading, and execution."""

    def __init__(self, plugin_dir: Optional[Path] = None):
        self.plugin_dir = plugin_dir or Path(__file__).parent
        self.plugins: Dict[str, BasePlugin] = {}
        self.plugin_info: Dict[str, PluginInfo] = {}
        self.loaded_modules: Dict[str, Any] = {}

    def discover_plugins(self) -> List[PluginInfo]:
        """Discover available plugins in the plugin directory."""
        plugins = []

        if not self.plugin_dir.exists():
            logger.warning(f"Plugin directory {self.plugin_dir} does not exist")
            return plugins

        for plugin_file in self.plugin_dir.glob("*.py"):
            if plugin_file.name.startswith("__"):
                continue

            try:
                info = self._extract_plugin_info(plugin_file)
                if info:
                    plugins.append(info)
            except Exception as e:
                logger.warning(f"Failed to extract info from {plugin_file}: {e}")

        return plugins

    def _extract_plugin_info(self, plugin_file: Path) -> Optional[PluginInfo]:
        """Extract plugin information from a Python file."""
        try:
            # Setup proper Python path and package context
            import sys
            original_path = sys.path[:]

            # Add project root to sys.path
            project_root = self.plugin_dir.parent.parent
            sys.path.insert(0, str(project_root))

            # Create spec with full module path
            module_name = f"forge.plugins.{plugin_file.stem}"
            spec = importlib.util.spec_from_file_location(module_name, plugin_file)
            if not spec or not spec.loader:
                logger.warning(f"Cannot create spec for {plugin_file}")
                sys.path[:] = original_path
                return None

            module = importlib.util.module_from_spec(spec)

            # Add module to sys.modules before execution
            sys.modules[module_name] = module
            module.__package__ = "forge.plugins"
            module.__name__ = module_name

            # Execute the module
            spec.loader.exec_module(module)

            # Find plugin classes in the module
            plugin_classes = []
            for name, obj in inspect.getmembers(module, inspect.isclass):
                # Check if it's a concrete plugin class (not abstract base class)
                if (hasattr(obj, '__bases__') and any(base.__name__ == 'BasePlugin' for base in obj.__bases__) and
                    obj.__name__ != 'BasePlugin' and
                    obj.__module__ == module.__name__ and
                    not hasattr(obj, '__abstractmethods__')):  # Exclude abstract classes
                    plugin_classes.append(obj)

            if not plugin_classes:
                logger.warning(f"No plugin classes found in {plugin_file}")
                return None

            # Use the first plugin class found
            plugin_class = plugin_classes[0]

            # Create instance to get properties
            try:
                temp_instance = plugin_class()
                name = temp_instance.name
                version = temp_instance.version
                description = temp_instance.description
                author = temp_instance.author
            except Exception as e:
                logger.warning(f"Cannot create instance of {plugin_class.__name__}: {e}")
                # Fallback to class attributes
                name = getattr(plugin_class, 'name', plugin_class.__name__)
                version = getattr(plugin_class, 'version', '1.0.0')
                description = getattr(plugin_class, 'description', 'No description')
                author = getattr(plugin_class, 'author', 'Unknown')

            # Determine plugin type
            plugin_type = "base"
            if issubclass(plugin_class, ProviderPlugin):
                plugin_type = "provider"
            elif issubclass(plugin_class, DeploymentPlugin):
                plugin_type = "deployment"
            elif issubclass(plugin_class, BackupPlugin):
                plugin_type = "backup"
            elif issubclass(plugin_class, NotificationPlugin):
                plugin_type = "notification"

            logger.info(f"Found plugin: {name} ({plugin_type}) from {plugin_file}")

            # Restore sys.path
            sys.path[:] = original_path

            return PluginInfo(
                name=name,
                version=version,
                description=description,
                author=author,
                module_path=str(plugin_file),
                class_name=plugin_class.__name__,
                plugin_type=plugin_type
            )

        except Exception as e:
            # Restore sys.path on error
            sys.path[:] = original_path
            logger.error(f"Error extracting plugin info from {plugin_file}: {e}")
            return None

    def load_plugin(self, plugin_info: PluginInfo, config: Dict[str, Any] = None) -> bool:
        """Load a plugin."""
        try:
            if plugin_info.name in self.plugins:
                logger.warning(f"Plugin '{plugin_info.name}' is already loaded")
                return True

            # Load the module
            spec = importlib.util.spec_from_file_location(
                plugin_info.name, plugin_info.module_path
            )
            if not spec or not spec.loader:
                raise ForgeError(f"Cannot load plugin from {plugin_info.module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self.loaded_modules[plugin_info.name] = module

            # Find the plugin class
            plugin_class = getattr(module, plugin_info.class_name)
            plugin_instance = plugin_class()

            # Initialize the plugin
            plugin_config = config or {}
            if plugin_instance.validate_config(plugin_config):
                plugin_instance.initialize(plugin_config)
                self.plugins[plugin_info.name] = plugin_instance
                self.plugin_info[plugin_info.name] = plugin_info
                logger.info(f"Loaded plugin: {plugin_info.name} v{plugin_info.version}")
                return True
            else:
                raise ForgeError(f"Invalid configuration for plugin '{plugin_info.name}'")

        except Exception as e:
            logger.error(f"Failed to load plugin '{plugin_info.name}': {e}")
            return False

    def unload_plugin(self, plugin_name: str) -> bool:
        """Unload a plugin."""
        try:
            if plugin_name not in self.plugins:
                logger.warning(f"Plugin '{plugin_name}' is not loaded")
                return False

            plugin = self.plugins[plugin_name]
            plugin.cleanup()

            del self.plugins[plugin_name]
            del self.plugin_info[plugin_name]

            if plugin_name in self.loaded_modules:
                del self.loaded_modules[plugin_name]

            logger.info(f"Unloaded plugin: {plugin_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to unload plugin '{plugin_name}': {e}")
            return False

    def get_plugin(self, plugin_name: str) -> Optional[BasePlugin]:
        """Get a loaded plugin by name."""
        return self.plugins.get(plugin_name)

    def list_plugins(self, plugin_type: Optional[str] = None) -> List[PluginInfo]:
        """List all loaded plugins, optionally filtered by type."""
        plugins = list(self.plugin_info.values())
        if plugin_type:
            plugins = [p for p in plugins if p.plugin_type == plugin_type]
        return plugins

    def reload_plugin(self, plugin_name: str, config: Dict[str, Any] = None) -> bool:
        """Reload a plugin."""
        if plugin_name in self.plugins:
            plugin_info = self.plugin_info[plugin_name]
            self.unload_plugin(plugin_name)
            return self.load_plugin(plugin_info, config)
        return False

    def execute_plugin_method(self, plugin_name: str, method_name: str, *args, **kwargs) -> Any:
        """Execute a method on a loaded plugin."""
        plugin = self.get_plugin(plugin_name)
        if not plugin:
            raise ForgeError(f"Plugin '{plugin_name}' is not loaded")

        if not hasattr(plugin, method_name):
            raise ForgeError(f"Plugin '{plugin_name}' does not have method '{method_name}'")

        method = getattr(plugin, method_name)
        if not callable(method):
            raise ForgeError(f"'{method_name}' is not a callable method on plugin '{plugin_name}'")

        try:
            return method(*args, **kwargs)
        except Exception as e:
            raise ForgeError(f"Error executing {method_name} on plugin '{plugin_name}': {e}")

    def save_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> bool:
        """Save plugin configuration."""
        try:
            config_dir = Path.home() / ".forge" / "plugins"
            config_dir.mkdir(parents=True, exist_ok=True)

            config_file = config_dir / f"{plugin_name}.json"
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)

            logger.info(f"Saved configuration for plugin '{plugin_name}'")
            return True

        except Exception as e:
            logger.error(f"Failed to save config for plugin '{plugin_name}': {e}")
            return False

    def load_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """Load plugin configuration."""
        try:
            config_file = Path.home() / ".forge" / "plugins" / f"{plugin_name}.json"
            if config_file.exists():
                with open(config_file, 'r') as f:
                    return json.load(f)
            return {}

        except Exception as e:
            logger.error(f"Failed to load config for plugin '{plugin_name}': {e}")
            return {}


# Global plugin manager instance
_plugin_manager = None

def get_plugin_manager() -> PluginManager:
    """Get the global plugin manager instance."""
    global _plugin_manager
    if _plugin_manager is None:
        plugin_dir = Path(__file__).parent
        _plugin_manager = PluginManager(plugin_dir)
    return _plugin_manager
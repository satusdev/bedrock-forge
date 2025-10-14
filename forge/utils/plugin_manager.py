"""
Enhanced Plugin Manager for Bedrock Forge.

Provides comprehensive plugin management functionality including presets,
categories, dependencies, and automatic configuration.
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..constants import (
    PLUGIN_PRESETS_CONFIG_PATH,
    DEFAULT_PLUGIN_PRESET,
    PLUGIN_CATEGORIES,
    PLUGIN_INSTALL_PATTERN,
    PLUGIN_UNINSTALL_PATTERN,
    PLUGIN_LIST_PATTERN,
    PLUGIN_INFO_PATTERN,
    PLUGIN_UPDATE_PATTERN
)


@dataclass
class PluginInfo:
    """Information about a WordPress plugin."""
    slug: str
    name: str
    description: str
    type: str  # free, freemium, premium
    priority: int
    category: str
    alternative: Optional[str] = None
    installed: bool = False
    active: bool = False
    version: Optional[str] = None


@dataclass
class PluginPreset:
    """A preset collection of plugins for specific site types."""
    id: str
    name: str
    description: str
    categories: List[str]
    plugins: List[str]
    plugins_info: List[PluginInfo]


class PluginManager:
    """Enhanced plugin management with presets and categories."""

    def __init__(self, config_path: Optional[str] = None):
        """Initialize plugin manager with configuration."""
        self.config_path = config_path or PLUGIN_PRESETS_CONFIG_PATH
        self.presets_config: Dict = {}
        self.presets: Dict[str, PluginPreset] = {}
        self.categories: Dict[str, Dict] = {}
        self.dependencies: Dict[str, List[str]] = {}
        self.conflicts: Dict[str, List[str]] = {}
        self.plugin_settings: Dict[str, Dict] = {}
        self._load_configuration()

    def _load_configuration(self) -> None:
        """Load plugin presets and configuration from JSON file."""
        try:
            config_path = Path(self.config_path)
            if config_path.exists():
                with open(config_path, 'r') as f:
                    self.presets_config = json.load(f)

                self._parse_configuration()
            else:
                logger.warning(f"Plugin presets config not found at {self.config_path}")
                self._create_default_configuration()
        except Exception as e:
            logger.error(f"Failed to load plugin configuration: {e}")
            self._create_default_configuration()

    def _parse_configuration(self) -> None:
        """Parse the loaded configuration into structured data."""
        # Parse presets
        presets_data = self.presets_config.get("presets", {})
        for preset_id, preset_data in presets_data.items():
            plugins_info = []
            for plugin_slug in preset_data.get("plugins", []):
                plugin_info = self._get_plugin_info(plugin_slug)
                if plugin_info:
                    plugins_info.append(plugin_info)

            preset = PluginPreset(
                id=preset_id,
                name=preset_data.get("name", preset_id.title()),
                description=preset_data.get("description", ""),
                categories=preset_data.get("categories", []),
                plugins=preset_data.get("plugins", []),
                plugins_info=plugins_info
            )
            self.presets[preset_id] = preset

        # Parse categories
        self.categories = self.presets_config.get("categories", {})

        # Parse dependencies and conflicts
        self.dependencies = self.presets_config.get("dependencies", {})
        self.conflicts = self.presets_config.get("conflicts", {})

        # Parse plugin settings
        self.plugin_settings = self.presets_config.get("plugin_settings", {})

    def _get_plugin_info(self, plugin_slug: str) -> Optional[PluginInfo]:
        """Get plugin information from categories configuration."""
        for category_data in self.categories.values():
            plugins = category_data.get("plugins", {})
            if plugin_slug in plugins:
                plugin_data = plugins[plugin_slug]
                return PluginInfo(
                    slug=plugin_slug,
                    name=plugin_data.get("name", plugin_slug),
                    description=plugin_data.get("description", ""),
                    type=plugin_data.get("type", "free"),
                    priority=plugin_data.get("priority", 10),
                    category=self._find_plugin_category(plugin_slug),
                    alternative=plugin_data.get("alternative")
                )
        return None

    def _find_plugin_category(self, plugin_slug: str) -> str:
        """Find the category for a given plugin slug."""
        for category_id, category_data in self.categories.items():
            if plugin_slug in category_data.get("plugins", {}):
                return category_id
        return "other"

    def _create_default_configuration(self) -> None:
        """Create minimal default configuration when config file is missing."""
        logger.info("Creating default plugin configuration")
        self.presets = {
            DEFAULT_PLUGIN_PRESET: PluginPreset(
                id=DEFAULT_PLUGIN_PRESET,
                name="Business Website",
                description="Default business website plugin collection",
                categories=["essential", "seo", "security"],
                plugins=["wordpress-seo", "wordfence", "contact-form-7"],
                plugins_info=[]
            )
        }

    def list_presets(self) -> List[PluginPreset]:
        """Get list of available plugin presets."""
        return list(self.presets.values())

    def get_preset(self, preset_id: str) -> Optional[PluginPreset]:
        """Get a specific plugin preset by ID."""
        return self.presets.get(preset_id)

    def list_categories(self) -> List[str]:
        """Get list of available plugin categories."""
        return list(self.categories.keys())

    def get_category_plugins(self, category: str) -> List[PluginInfo]:
        """Get all plugins in a specific category."""
        if category not in self.categories:
            return []

        plugins_info = []
        for plugin_slug, plugin_data in self.categories[category].get("plugins", {}).items():
            plugin_info = PluginInfo(
                slug=plugin_slug,
                name=plugin_data.get("name", plugin_slug),
                description=plugin_data.get("description", ""),
                type=plugin_data.get("type", "free"),
                priority=plugin_data.get("priority", 10),
                category=category,
                alternative=plugin_data.get("alternative")
            )
            plugins_info.append(plugin_info)

        # Sort by priority
        plugins_info.sort(key=lambda x: x.priority)
        return plugins_info

    def resolve_dependencies(self, plugins: List[str]) -> List[str]:
        """Resolve plugin dependencies and return complete plugin list."""
        resolved_plugins = set(plugins)
        to_process = list(plugins)

        while to_process:
            plugin = to_process.pop()
            if plugin in self.dependencies:
                for dependency in self.dependencies[plugin]:
                    if dependency not in resolved_plugins:
                        resolved_plugins.add(dependency)
                        to_process.append(dependency)

        return list(resolved_plugins)

    def check_conflicts(self, plugins: List[str]) -> List[Tuple[str, str]]:
        """Check for plugin conflicts and return list of (plugin, conflicting_plugin) tuples."""
        conflicts = []
        for plugin in plugins:
            if plugin in self.conflicts:
                for conflicting_plugin in self.conflicts[plugin]:
                    if conflicting_plugin in plugins:
                        conflicts.append((plugin, conflicting_plugin))
        return conflicts

    def get_recommended_plugins(self, site_type: str = "business", custom_categories: Optional[List[str]] = None) -> List[PluginInfo]:
        """Get recommended plugins based on site type and custom categories."""
        if site_type in self.presets:
            preset = self.presets[site_type]
            plugins = preset.plugins
        else:
            # Default to essential plugins if site type not found
            plugins = ["wordpress-seo", "wordfence", "contact-form-7"]

        # Add plugins from custom categories
        if custom_categories:
            for category in custom_categories:
                category_plugins = self.get_category_plugins(category)
                plugins.extend([p.slug for p in category_plugins])

        # Remove duplicates and resolve dependencies
        unique_plugins = list(set(plugins))
        resolved_plugins = self.resolve_dependencies(unique_plugins)

        # Get plugin info
        plugins_info = []
        for plugin_slug in resolved_plugins:
            plugin_info = self._get_plugin_info(plugin_slug)
            if plugin_info:
                plugins_info.append(plugin_info)

        return sorted(plugins_info, key=lambda x: x.priority)

    def install_plugins(self, project_path: str, plugins: List[str], dry_run: bool = False,
                       max_workers: int = 3, verbose: bool = False) -> Dict[str, bool]:
        """Install multiple plugins with parallel processing and error handling."""
        results = {}

        # Check for conflicts first
        conflicts = self.check_conflicts(plugins)
        if conflicts:
            for plugin, conflicting in conflicts:
                logger.warning(f"Plugin conflict detected: {plugin} conflicts with {conflicting}")

        # Resolve dependencies
        resolved_plugins = self.resolve_dependencies(plugins)
        logger.info(f"Installing {len(resolved_plugins)} plugins (including dependencies)")

        if dry_run:
            logger.info(f"Dry run: Would install plugins: {resolved_plugins}")
            return {plugin: True for plugin in resolved_plugins}

        # Install plugins in parallel
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_plugin = {
                executor.submit(self._install_single_plugin, project_path, plugin, verbose): plugin
                for plugin in resolved_plugins
            }

            for future in as_completed(future_to_plugin):
                plugin = future_to_plugin[future]
                try:
                    success = future.result()
                    results[plugin] = success
                    if success:
                        logger.info(f"✅ Successfully installed and activated: {plugin}")
                    else:
                        logger.error(f"❌ Failed to install: {plugin}")
                except Exception as e:
                    logger.error(f"❌ Error installing {plugin}: {e}")
                    results[plugin] = False

        # Configure plugins with auto-configuration
        self._configure_plugins(project_path, list(results.keys()), dry_run, verbose)

        return results

    def _install_single_plugin(self, project_path: str, plugin: str, verbose: bool) -> bool:
        """Install a single plugin."""
        try:
            command = PLUGIN_INSTALL_PATTERN.format(plugin=plugin)
            full_command = f"cd {project_path} && {command}"

            if verbose:
                logger.info(f"Installing plugin: {plugin}")
                logger.debug(f"Running: {full_command}")

            result = run_shell(full_command, dry_run=False)
            return result is not None
        except Exception as e:
            logger.error(f"Failed to install plugin {plugin}: {e}")
            return False

    def _configure_plugins(self, project_path: str, plugins: List[str], dry_run: bool, verbose: bool) -> None:
        """Configure plugins with automatic settings."""
        for plugin in plugins:
            if plugin in self.plugin_settings:
                settings = self.plugin_settings[plugin]
                if settings.get("auto_configure", False):
                    self._apply_plugin_settings(project_path, plugin, settings, dry_run, verbose)

    def _apply_plugin_settings(self, project_path: str, plugin: str, settings: Dict, dry_run: bool, verbose: bool) -> None:
        """Apply settings to a specific plugin."""
        if dry_run:
            logger.info(f"Dry run: Would configure {plugin} with settings: {settings.get('settings', {})}")
            return

        try:
            # This would implement WordPress CLI option setting
            # For now, we'll just log what would be configured
            plugin_settings = settings.get("settings", {})
            if plugin_settings and verbose:
                logger.info(f"Configuring {plugin} with settings: {plugin_settings}")

            # TODO: Implement actual WordPress CLI configuration
            # Example: ddev wp option update {plugin}_settings '{"key":"value"}' --format=json

        except Exception as e:
            logger.error(f"Failed to configure plugin {plugin}: {e}")

    def get_installed_plugins(self, project_path: str, active_only: bool = True) -> List[PluginInfo]:
        """Get list of installed plugins from a WordPress project."""
        try:
            command = PLUGIN_LIST_PATTERN
            full_command = f"cd {project_path} && {command}"
            result = run_shell(full_command, dry_run=False)

            if not result:
                return []

            installed_plugins = []
            # Parse the command output to extract plugin information
            lines = result.strip().split('\n')
            for line in lines[1:]:  # Skip header line
                if line.strip():
                    parts = line.split('\t')
                    if len(parts) >= 2:
                        plugin_slug = parts[0].strip()
                        status = parts[1].strip() if len(parts) > 1 else ""

                        plugin_info = self._get_plugin_info(plugin_slug)
                        if plugin_info:
                            plugin_info.installed = True
                            plugin_info.active = (status.lower() == "active")
                            installed_plugins.append(plugin_info)
                        else:
                            # Create basic plugin info if not in presets
                            plugin_info = PluginInfo(
                                slug=plugin_slug,
                                name=plugin_slug.replace('-', ' ').title(),
                                description="",
                                type="unknown",
                                priority=10,
                                category="other",
                                installed=True,
                                active=(status.lower() == "active")
                            )
                            installed_plugins.append(plugin_info)

            return installed_plugins
        except Exception as e:
            logger.error(f"Failed to get installed plugins: {e}")
            return []

    def uninstall_plugins(self, project_path: str, plugins: List[str], dry_run: bool = False, verbose: bool = False) -> Dict[str, bool]:
        """Uninstall multiple plugins."""
        results = {}

        for plugin in plugins:
            try:
                if dry_run:
                    logger.info(f"Dry run: Would uninstall plugin: {plugin}")
                    results[plugin] = True
                    continue

                command = PLUGIN_UNINSTALL_PATTERN.format(plugin=plugin)
                full_command = f"cd {project_path} && {command}"

                if verbose:
                    logger.info(f"Uninstalling plugin: {plugin}")

                result = run_shell(full_command, dry_run=False)
                success = result is not None
                results[plugin] = success

                if success:
                    logger.info(f"✅ Successfully uninstalled: {plugin}")
                else:
                    logger.error(f"❌ Failed to uninstall: {plugin}")

            except Exception as e:
                logger.error(f"❌ Error uninstalling {plugin}: {e}")
                results[plugin] = False

        return results

    def update_plugins(self, project_path: str, plugins: Optional[List[str]] = None, dry_run: bool = False, verbose: bool = False) -> Dict[str, bool]:
        """Update plugins. If no plugins specified, update all."""
        results = {}

        if plugins is None:
            # Get all installed plugins
            installed = self.get_installed_plugins(project_path, active_only=False)
            plugins = [p.slug for p in installed]

        for plugin in plugins:
            try:
                if dry_run:
                    logger.info(f"Dry run: Would update plugin: {plugin}")
                    results[plugin] = True
                    continue

                command = PLUGIN_UPDATE_PATTERN.format(plugin=plugin)
                full_command = f"cd {project_path} && {command}"

                if verbose:
                    logger.info(f"Updating plugin: {plugin}")

                result = run_shell(full_command, dry_run=False)
                success = result is not None
                results[plugin] = success

                if success:
                    logger.info(f"✅ Successfully updated: {plugin}")
                else:
                    logger.error(f"❌ Failed to update: {plugin}")

            except Exception as e:
                logger.error(f"❌ Error updating {plugin}: {e}")
                results[plugin] = False

        return results
import typer
from typing import Optional, Dict, Any
from pathlib import Path
import json
from ..plugins.base import get_plugin_manager, PluginInfo
from ..utils.plugin_manager import PluginManager, PluginInfo as WPPluginInfo, PluginPreset
from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.local_config import LocalConfigManager
from ..utils.project_helpers import ProjectSelector
from tqdm import tqdm
import gettext

_ = gettext.gettext

app = typer.Typer()

@app.command()
def list(
    plugin_type: Optional[str] = typer.Option(None, "--type", help=_("Filter by plugin type")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """List available and loaded plugins."""
    manager = get_plugin_manager()

    # Discover available plugins
    available_plugins = manager.discover_plugins()
    loaded_plugins = manager.list_plugins()

    if plugin_type:
        available_plugins = [p for p in available_plugins if p.plugin_type == plugin_type]
        loaded_plugins = [p for p in loaded_plugins if p.plugin_type == plugin_type]

    logger.info("=== Available Plugins ===")
    if not available_plugins:
        logger.info("No plugins found.")
        return

    for plugin_info in tqdm(available_plugins, desc="Listing plugins", disable=not verbose):
        status = "✅ Loaded" if plugin_info.name in [p.name for p in loaded_plugins] else "❌ Not loaded"
        logger.info(f"{plugin_info.name} v{plugin_info.version} ({plugin_info.plugin_type}) - {status}")
        logger.info(f"  Description: {plugin_info.description}")
        logger.info(f"  Author: {plugin_info.author}")
        if verbose:
            logger.info(f"  Module: {plugin_info.module_path}")
            logger.info(f"  Class: {plugin_info.class_name}")
        logger.info("")

@app.command()
def load(
    plugin_name: str = typer.Argument(..., help=_("Plugin name to load")),
    config_file: Optional[str] = typer.Option(None, "--config", help=_("Configuration file path")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Load a plugin."""
    manager = get_plugin_manager()

    # Find plugin info
    available_plugins = manager.discover_plugins()
    plugin_info = next((p for p in available_plugins if p.name == plugin_name), None)

    if not plugin_info:
        raise ForgeError(f"Plugin '{plugin_name}' not found")

    # Load configuration
    config = {}
    if config_file:
        config_path = Path(config_file)
        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
        else:
            logger.warning(f"Config file {config_file} not found, using empty config")
    else:
        # Try to load saved config
        config = manager.load_plugin_config(plugin_name)

    # Load the plugin
    if manager.load_plugin(plugin_info, config):
        logger.info(f"✅ Successfully loaded plugin '{plugin_name}'")

        # Save configuration for future use
        if config:
            manager.save_plugin_config(plugin_name, config)
    else:
        raise ForgeError(f"Failed to load plugin '{plugin_name}'")

@app.command()
def unload(
    plugin_name: str = typer.Argument(..., help=_("Plugin name to unload"))
):
    """Unload a plugin."""
    manager = get_plugin_manager()

    if manager.unload_plugin(plugin_name):
        logger.info(f"✅ Successfully unloaded plugin '{plugin_name}'")
    else:
        raise ForgeError(f"Failed to unload plugin '{plugin_name}'")

@app.command()
def reload(
    plugin_name: str = typer.Argument(..., help=_("Plugin name to reload")),
    config_file: Optional[str] = typer.Option(None, "--config", help=_("Configuration file path"))
):
    """Reload a plugin."""
    manager = get_plugin_manager()

    # Load configuration
    config = {}
    if config_file:
        config_path = Path(config_file)
        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
    else:
        # Use saved config
        config = manager.load_plugin_config(plugin_name)

    if manager.reload_plugin(plugin_name, config):
        logger.info(f"✅ Successfully reloaded plugin '{plugin_name}'")
    else:
        raise ForgeError(f"Failed to reload plugin '{plugin_name}'")

@app.command()
def info(
    plugin_name: str = typer.Argument(..., help=_("Plugin name")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Show detailed information about a plugin."""
    manager = get_plugin_manager()

    # Check if plugin is loaded
    plugin = manager.get_plugin(plugin_name)
    loaded_plugin_info = manager.plugin_info.get(plugin_name)

    # Get available plugin info
    available_plugins = manager.discover_plugins()
    available_plugin_info = next((p for p in available_plugins if p.name == plugin_name), None)

    if not available_plugin_info:
        raise ForgeError(f"Plugin '{plugin_name}' not found")

    plugin_info = available_plugin_info
    logger.info(f"=== Plugin Information: {plugin_info.name} ===")
    logger.info(f"Name: {plugin_info.name}")
    logger.info(f"Version: {plugin_info.version}")
    logger.info(f"Type: {plugin_info.plugin_type}")
    logger.info(f"Description: {plugin_info.description}")
    logger.info(f"Author: {plugin_info.author}")
    logger.info(f"Module: {plugin_info.module_path}")
    logger.info(f"Class: {plugin_info.class_name}")
    logger.info(f"Status: {'✅ Loaded' if plugin else '❌ Not loaded'}")

    if verbose and plugin:
        # Show available methods
        logger.info("\nAvailable Methods:")
        import inspect
        for name, method in inspect.getmembers(plugin, predicate=inspect.ismethod):
            if not name.startswith('_'):
                logger.info(f"  - {name}()")

        # Show current configuration
        config = manager.load_plugin_config(plugin_name)
        if config:
            logger.info("\nCurrent Configuration:")
            for key, value in config.items():
                logger.info(f"  {key}: {value}")

@app.command()
def execute(
    plugin_name: str = typer.Argument(..., help=_("Plugin name")),
    method: str = typer.Argument(..., help=_("Method name to execute")),
    args: Optional[str] = typer.Option(None, "--args", help=_("Arguments as JSON string")),
    kwargs: Optional[str] = typer.Option(None, "--kwargs", help=_("Keyword arguments as JSON string"))
):
    """Execute a method on a loaded plugin."""
    manager = get_plugin_manager()

    # Parse arguments
    method_args = []
    method_kwargs = {}

    if args:
        try:
            method_args = json.loads(args)
            if not isinstance(method_args, list):
                method_args = [method_args]
        except json.JSONDecodeError:
            raise ForgeError(f"Invalid JSON in --args: {args}")

    if kwargs:
        try:
            method_kwargs = json.loads(kwargs)
            if not isinstance(method_kwargs, dict):
                raise ForgeError("--kwargs must be a JSON object")
        except json.JSONDecodeError:
            raise ForgeError(f"Invalid JSON in --kwargs: {kwargs}")

    try:
        result = manager.execute_plugin_method(plugin_name, method, *method_args, **method_kwargs)
        logger.info(f"✅ Method '{method}' executed successfully")
        logger.info(f"Result: {result}")
    except Exception as e:
        raise ForgeError(f"Failed to execute method: {e}")

@app.command()
def configure(
    plugin_name: str = typer.Argument(..., help=_("Plugin name")),
    key: str = typer.Argument(..., help=_("Configuration key")),
    value: str = typer.Argument(..., help=_("Configuration value"))
):
    """Set a configuration value for a plugin."""
    manager = get_plugin_manager()

    # Load current config
    config = manager.load_plugin_config(plugin_name)
    config[key] = value

    # Save config
    if manager.save_plugin_config(plugin_name, config):
        logger.info(f"✅ Set {plugin_name} config: {key} = {value}")
    else:
        raise ForgeError(f"Failed to save configuration for '{plugin_name}'")

@app.command()
def config_show(
    plugin_name: str = typer.Argument(..., help=_("Plugin name"))
):
    """Show configuration for a plugin."""
    manager = get_plugin_manager()

    config = manager.load_plugin_config(plugin_name)

    logger.info(f"=== Configuration for {plugin_name} ===")
    if config:
        for key, value in config.items():
            logger.info(f"{key}: {value}")
    else:
        logger.info("No configuration found.")

@app.command()
def config_clear(
    plugin_name: str = typer.Argument(..., help=_("Plugin name"))
):
    """Clear configuration for a plugin."""
    manager = get_plugin_manager()

    config_file = Path.home() / ".forge" / "plugins" / f"{plugin_name}.json"
    if config_file.exists():
        config_file.unlink()
        logger.info(f"✅ Cleared configuration for '{plugin_name}'")
    else:
        logger.warning(f"No configuration file found for '{plugin_name}'")

@app.command()
def presets(
    verbose: bool = typer.Option(False, "--verbose")
):
    """List available plugin presets for different site types."""
    manager = PluginManager()
    available_presets = manager.list_presets()

    logger.info("=== Available Plugin Presets ===")
    for preset in available_presets:
        logger.info(f"\n📦 {preset.name} ({preset.id})")
        logger.info(f"   Description: {preset.description}")
        logger.info(f"   Categories: {', '.join(preset.categories)}")
        logger.info(f"   Plugins: {len(preset.plugins)}")

        if verbose:
            logger.info("   Plugins included:")
            for plugin_slug in preset.plugins:
                plugin_info = manager._get_plugin_info(plugin_slug)
                if plugin_info:
                    logger.info(f"     • {plugin_info.name} ({plugin_info.type}) - {plugin_info.description[:60]}...")
                else:
                    logger.info(f"     • {plugin_slug}")

@app.command()
def install_category(
    category: str = typer.Argument(..., help=_("Plugin category to install")),
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Target project name")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Install all plugins from a specific category."""
    # Get project
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        raise ForgeError(_("No project selected"))

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Get plugins for category
    plugin_manager = PluginManager()
    category_plugins = plugin_manager.get_category_plugins(category)

    if not category_plugins:
        logger.info(f"No plugins found in category '{category}'")
        return

    logger.info(f"Installing {len(category_plugins)} plugins from category '{category}'")

    # Install plugins
    plugin_slugs = [p.slug for p in category_plugins]
    results = plugin_manager.install_plugins(
        project_path=project.directory,
        plugins=plugin_slugs,
        dry_run=dry_run,
        verbose=verbose
    )

    # Show results
    successful = sum(1 for success in results.values() if success)
    total = len(results)

    logger.info(f"\nInstallation complete: {successful}/{total} plugins installed successfully")

    if verbose:
        for plugin, success in results.items():
            status = "✅" if success else "❌"
            logger.info(f"  {status} {plugin}")

@app.command()
def recommend(
    site_type: str = typer.Option("business", "--type", help=_("Site type (blog, business, ecommerce, portfolio, minimal, performance)")),
    categories: Optional[str] = typer.Option(None, "--categories", help=_("Additional categories (comma-separated)")),
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Target project name")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Get and install recommended plugins based on site type."""
    # Parse categories
    custom_categories = []
    if categories:
        custom_categories = [cat.strip() for cat in categories.split(",")]

    # Get recommended plugins
    plugin_manager = PluginManager()
    recommended_plugins = plugin_manager.get_recommended_plugins(site_type, custom_categories)

    logger.info(f"\n🎯 Recommended plugins for {site_type} site:")
    logger.info(f"Found {len(recommended_plugins)} recommended plugins")

    if verbose:
        for plugin in recommended_plugins:
            logger.info(f"\n📦 {plugin.name} ({plugin.type})")
            logger.info(f"   Category: {plugin.category}")
            logger.info(f"   Description: {plugin.description}")
            logger.info(f"   Priority: {plugin.priority}")

    # Get project for installation
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        logger.info("No project selected - recommendations only")
        return

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Install recommended plugins
    plugin_slugs = [p.slug for p in recommended_plugins]
    logger.info(f"\nInstalling recommended plugins to project '{selected_project_name}'...")

    results = plugin_manager.install_plugins(
        project_path=project.directory,
        plugins=plugin_slugs,
        dry_run=dry_run,
        verbose=verbose
    )

    # Show results
    successful = sum(1 for success in results.values() if success)
    total = len(results)

    logger.info(f"\nInstallation complete: {successful}/{total} plugins installed successfully")

@app.command()
def install_preset(
    preset_name: str = typer.Argument(..., help=_("Plugin preset to install")),
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Target project name")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Install a complete plugin preset to a project."""
    # Get project
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        raise ForgeError(_("No project selected"))

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Get preset
    plugin_manager = PluginManager()
    preset = plugin_manager.get_preset(preset_name)

    if not preset:
        available_presets = list(plugin_manager.presets.keys())
        raise ForgeError(f"Preset '{preset_name}' not found. Available presets: {available_presets}")

    logger.info(f"Installing preset '{preset.name}' to project '{selected_project_name}'")
    logger.info(f"Description: {preset.description}")
    logger.info(f"Plugins to install: {len(preset.plugins)}")

    # Check for conflicts
    conflicts = plugin_manager.check_conflicts(preset.plugins)
    if conflicts:
        logger.warning("⚠️  Plugin conflicts detected:")
        for plugin, conflicting in conflicts:
            logger.warning(f"   • {plugin} conflicts with {conflicting}")

    # Install plugins
    results = plugin_manager.install_plugins(
        project_path=project.directory,
        plugins=preset.plugins,
        dry_run=dry_run,
        verbose=verbose
    )

    # Show results
    successful = sum(1 for success in results.values() if success)
    total = len(results)

    logger.info(f"\nPreset installation complete: {successful}/{total} plugins installed successfully")

@app.command()
def status(
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Project name to check")),
    category: Optional[str] = typer.Option(None, "--category", help=_("Filter by category")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Show status of installed plugins in a project."""
    # Get project
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        raise ForgeError(_("No project selected"))

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Get installed plugins
    plugin_manager = PluginManager()
    installed_plugins = plugin_manager.get_installed_plugins(project.directory, active_only=False)

    if not installed_plugins:
        logger.info(f"No plugins found in project '{selected_project_name}'")
        return

    logger.info(f"\n=== Plugin Status for '{selected_project_name}' ===")

    # Group by status
    active_plugins = [p for p in installed_plugins if p.active]
    inactive_plugins = [p for p in installed_plugins if p.installed and not p.active]

    logger.info(f"\n🟢 Active Plugins ({len(active_plugins)}):")
    for plugin in active_plugins:
        if category and plugin.category != category:
            continue
        logger.info(f"  • {plugin.name} ({plugin.type}) - {plugin.category}")

    if inactive_plugins:
        logger.info(f"\n⚪ Inactive Plugins ({len(inactive_plugins)}):")
        for plugin in inactive_plugins:
            if category and plugin.category != category:
                continue
            logger.info(f"  • {plugin.name} ({plugin.type}) - {plugin.category}")

    if verbose:
        logger.info(f"\n📊 Plugin Summary:")
        logger.info(f"  Total installed: {len(installed_plugins)}")
        logger.info(f"  Active: {len(active_plugins)}")
        logger.info(f"  Inactive: {len(inactive_plugins)}")

        # Show categories breakdown
        categories = {}
        for plugin in installed_plugins:
            cat = plugin.category
            categories[cat] = categories.get(cat, 0) + 1

        logger.info(f"\n📂 By Category:")
        for cat, count in sorted(categories.items()):
            logger.info(f"  {cat}: {count} plugins")

@app.command()
def update(
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Project name")),
    plugins: Optional[str] = typer.Option(None, "--plugins", help=_("Specific plugins to update (comma-separated)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Update plugins in a project."""
    # Get project
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        raise ForgeError(_("No project selected"))

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Parse plugins to update
    plugin_list = None
    if plugins:
        plugin_list = [p.strip() for p in plugins.split(",")]

    # Update plugins
    plugin_manager = PluginManager()
    logger.info(f"Updating plugins in project '{selected_project_name}'...")

    if plugin_list:
        logger.info(f"Updating specific plugins: {plugin_list}")
    else:
        logger.info("Updating all installed plugins")

    results = plugin_manager.update_plugins(
        project_path=project.directory,
        plugins=plugin_list,
        dry_run=dry_run,
        verbose=verbose
    )

    # Show results
    successful = sum(1 for success in results.values() if success)
    total = len(results)

    logger.info(f"\nUpdate complete: {successful}/{total} plugins updated successfully")

    if verbose:
        for plugin, success in results.items():
            status = "✅" if success else "❌"
            logger.info(f"  {status} {plugin}")

@app.command()
def uninstall(
    plugins: str = typer.Argument(..., help=_("Plugins to uninstall (comma-separated)")),
    project_name: Optional[str] = typer.Option(None, "--project", help=_("Target project name")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Uninstall plugins from a project."""
    # Parse plugins
    plugin_list = [p.strip() for p in plugins.split(",")]

    # Get project
    config_manager = LocalConfigManager()
    project_selector = ProjectSelector(config_manager)

    if project_name:
        selected_project_name = project_name
    else:
        selected_project_name = project_selector.select_project()

    if not selected_project_name:
        raise ForgeError(_("No project selected"))

    project = config_manager.get_project(selected_project_name)
    if not project:
        raise ForgeError(f"Project '{selected_project_name}' not found")

    # Uninstall plugins
    plugin_manager = PluginManager()
    logger.info(f"Uninstalling {len(plugin_list)} plugins from project '{selected_project_name}'...")

    results = plugin_manager.uninstall_plugins(
        project_path=project.directory,
        plugins=plugin_list,
        dry_run=dry_run,
        verbose=verbose
    )

    # Show results
    successful = sum(1 for success in results.values() if success)
    total = len(results)

    logger.info(f"\nUninstall complete: {successful}/{total} plugins uninstalled successfully")

    if verbose:
        for plugin, success in results.items():
            status = "✅" if success else "❌"
            logger.info(f"  {status} {plugin}")


if __name__ == "__main__":
    app()
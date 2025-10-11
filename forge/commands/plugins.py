import typer
from typing import Optional, Dict, Any
from pathlib import Path
import json
from ..plugins.base import get_plugin_manager, PluginInfo
from ..utils.logging import logger
from ..utils.errors import ForgeError
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

if __name__ == "__main__":
    app()
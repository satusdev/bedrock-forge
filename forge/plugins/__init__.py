"""
Bedrock Forge Plugin System.

This module provides the plugin system for extending Bedrock Forge functionality.
"""

from .base import (
    BasePlugin,
    ProviderPlugin,
    DeploymentPlugin,
    BackupPlugin,
    NotificationPlugin,
    PluginManager,
    get_plugin_manager,
    PluginInfo
)

__all__ = [
    'BasePlugin',
    'ProviderPlugin',
    'DeploymentPlugin',
    'BackupPlugin',
    'NotificationPlugin',
    'PluginManager',
    'get_plugin_manager',
    'PluginInfo'
]
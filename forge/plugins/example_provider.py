"""
Example provider plugin for Bedrock Forge.

This is an example implementation of a provider plugin that demonstrates
how to extend Forge with custom server providers.
"""

import time
import uuid
from typing import Dict, Any, List
from forge.plugins.base import ProviderPlugin, PluginManager
from forge.utils.logging import logger


class ExampleProviderPlugin(ProviderPlugin):
    """Example provider plugin that simulates server provisioning."""

    @property
    def name(self) -> str:
        return "example_provider"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def description(self) -> str:
        return "Example provider plugin for demonstration purposes"

    @property
    def author(self) -> str:
        return "Bedrock Forge Team"

    def __init__(self):
        self.config = {}
        self.servers = {}  # Simulated server storage

    def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize the plugin with configuration."""
        self.config = config
        logger.info(f"Initialized {self.name} plugin with config: {config}")

    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        required_keys = ["api_url", "api_token"]
        for key in required_keys:
            if key not in config:
                logger.error(f"Missing required config key: {key}")
                return False
        return True

    def provision_server(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Provision a new server."""
        logger.info(f"Provisioning server with config: {config}")

        # Simulate server creation
        server_id = str(uuid.uuid4())
        server_info = {
            "id": server_id,
            "name": config.get("name", f"server-{server_id[:8]}"),
            "status": "creating",
            "ip_address": f"192.168.1.{len(self.servers) + 100}",
            "region": config.get("region", "us-east-1"),
            "server_type": config.get("server_type", "medium"),
            "created_at": time.time(),
            "provider": self.name
        }

        # Simulate provisioning time
        time.sleep(2)
        server_info["status"] = "active"

        # Store server
        self.servers[server_id] = server_info

        logger.info(f"Successfully provisioned server: {server_id}")
        return server_info

    def get_server_info(self, server_id: str) -> Dict[str, Any]:
        """Get server information."""
        if server_id not in self.servers:
            raise Exception(f"Server {server_id} not found")
        return self.servers[server_id]

    def delete_server(self, server_id: str) -> bool:
        """Delete a server."""
        logger.info(f"Deleting server: {server_id}")

        if server_id not in self.servers:
            logger.error(f"Server {server_id} not found")
            return False

        # Simulate deletion time
        time.sleep(1)
        del self.servers[server_id]

        logger.info(f"Successfully deleted server: {server_id}")
        return True

    def list_servers(self) -> List[Dict[str, Any]]:
        """List all servers."""
        return list(self.servers.values())

    def restart_server(self, server_id: str) -> Dict[str, Any]:
        """Restart a server (additional custom method)."""
        logger.info(f"Restarting server: {server_id}")

        if server_id not in self.servers:
            raise Exception(f"Server {server_id} not found")

        # Simulate restart
        self.servers[server_id]["status"] = "restarting"
        time.sleep(3)
        self.servers[server_id]["status"] = "active"

        logger.info(f"Successfully restarted server: {server_id}")
        return self.servers[server_id]

    def get_server_logs(self, server_id: str, lines: int = 100) -> List[str]:
        """Get server logs (additional custom method)."""
        if server_id not in self.servers:
            raise Exception(f"Server {server_id} not found")

        # Simulate log retrieval
        logs = [
            f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Server {server_id} is running",
            f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] All services operational",
            f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Monitoring active"
        ]

        return logs[-lines:]
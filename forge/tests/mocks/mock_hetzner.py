"""
Mock Hetzner Cloud API for testing.

Provides mock responses and utilities for testing Hetzner Cloud integration
without making actual API calls.
"""

import json
from unittest.mock import Mock, MagicMock
from datetime import datetime, timedelta


class MockHetznerServer:
    """Mock Hetzner Cloud server."""

    def __init__(self, server_id=12345, name="test-server", status="running"):
        self.id = server_id
        self.name = name
        self.status = status
        self.created = datetime.now() - timedelta(days=30)
        self.public_net = Mock()
        self.public_net.ipv4 = Mock()
        self.public_net.ipv4.ip = "192.168.1.100"
        self.public_net.ipv6 = "2001:db8::1"
        self.server_type = Mock()
        self.server_type.name = "cpx11"
        self.server_type.cores = 4
        self.server_type.memory = 8
        self.server_type.disk = 80
        self.image = Mock()
        self.image.name = "ubuntu-22.04"
        self.image.description = "Ubuntu 22.04"
        self.datacenter = Mock()
        self.datacenter.location = Mock()
        self.datacenter.location.name = "Nuremberg 1 DC 3"
        self.datacenter.location.description = "Nuremberg 1 DC 3"

    def to_dict(self):
        """Convert server to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "created": self.created.isoformat(),
            "public_net": {
                "ipv4": {"ip": self.public_net.ipv4.ip},
                "ipv6": self.public_net.ipv6
            },
            "server_type": {
                "name": self.server_type.name,
                "cores": self.server_type.cores,
                "memory": self.server_type.memory,
                "disk": self.server_type.disk
            },
            "image": {
                "name": self.image.name,
                "description": self.image.description
            },
            "datacenter": {
                "location": {
                    "name": self.datacenter.location.name,
                    "description": self.datacenter.location.description
                }
            }
        }


class MockHetznerAction:
    """Mock Hetzner Cloud action."""

    def __init__(self, action_id=67890, command="create_server", status="success"):
        self.id = action_id
        self.command = command
        self.status = status
        self.started = datetime.now() - timedelta(minutes=5)
        self.finished = datetime.now()
        self.progress = 100

    def to_dict(self):
        """Convert action to dictionary."""
        return {
            "id": self.id,
            "command": self.command,
            "status": self.status,
            "started": self.started.isoformat(),
            "finished": self.finished.isoformat(),
            "progress": self.progress
        }


class MockHetznerClient:
    """Mock Hetzner Cloud client."""

    def __init__(self):
        self.servers = Mock()
        self.server_types = Mock()
        self.images = Mock()
        self.locations = Mock()
        self.datacenters = Mock()
        self.actions = Mock()

        # Set up default mock responses
        self._setup_server_mocks()
        self._setup_server_type_mocks()
        self._setup_image_mocks()
        self._setup_location_mocks()

    def _setup_server_mocks(self):
        """Set up server-related mocks."""
        # Create mock server
        self.mock_server = MockHetznerServer()

        # Mock server creation
        self.mock_create_action = MockHetznerAction(command="create_server")
        self.servers.create.return_value = (self.mock_server, self.mock_create_action)

        # Mock server retrieval
        self.servers.get_by_id.return_value = self.mock_server
        self.servers.get_list.return_value = [self.mock_server]

        # Mock server actions
        self.mock_power_action = MockHetznerAction(command="server_poweron")
        self.servers.power_on.return_value = self.mock_power_action

        self.mock_rescue_action = MockHetznerAction(command="enable_rescue")
        self.servers.enable_rescue.return_value = self.mock_rescue_action

        self.mock_reboot_action = MockHetznerAction(command="server_reboot")
        self.servers.reboot.return_value = self.mock_reboot_action

        self.mock_delete_action = MockHetznerAction(command="delete_server")
        self.servers.delete.return_value = self.mock_delete_action

    def _setup_server_type_mocks(self):
        """Set up server type mocks."""
        mock_cpx11 = Mock()
        mock_cpx11.name = "cpx11"
        mock_cpx11.description = "CX11"
        mock_cpx11.cores = 4
        mock_cpx11.memory = 8
        mock_cpx11.disk = 80
        mock_cpx11.prices = [{"location": "nbg1", "price_monthly": {"gross": "5.00"}}]

        mock_cpx21 = Mock()
        mock_cpx21.name = "cpx21"
        mock_cpx21.description = "CX21"
        mock_cpx21.cores = 6
        mock_cpx21.memory = 16
        mock_cpx21.disk = 160
        mock_cpx21.prices = [{"location": "nbg1", "price_monthly": {"gross": "10.00"}}]

        self.server_types.get_by_name.side_effect = lambda name: {
            "cpx11": mock_cpx11,
            "cpx21": mock_cpx21
        }.get(name)

        self.server_types.get_list.return_value = [mock_cpx11, mock_cpx21]

    def _setup_image_mocks(self):
        """Set up image mocks."""
        mock_ubuntu = Mock()
        mock_ubuntu.id = 1
        mock_ubuntu.name = "ubuntu-22.04"
        mock_ubuntu.description = "Ubuntu 22.04"
        mock_ubuntu.type = "system"

        mock_debian = Mock()
        mock_debian.id = 2
        mock_debian.name = "debian-12"
        mock_debian.description = "Debian 12"
        mock_debian.type = "system"

        self.images.get_by_name.side_effect = lambda name: {
            "ubuntu-22.04": mock_ubuntu,
            "debian-12": mock_debian
        }.get(name)

        self.images.get_list.return_value = [mock_ubuntu, mock_debian]

    def _setup_location_mocks(self):
        """Set up location mocks."""
        mock_nbg1 = Mock()
        mock_nbg1.name = "nbg1"
        mock_nbg1.description = "Nuremberg 1 DC 3"
        mock_nbg1.country = "DEU"
        mock_nbg1.city = "Nuremberg"

        mock_hel1 = Mock()
        mock_hel1.name = "hel1"
        mock_hel1.description = "Helsinki 1 DC 1"
        mock_hel1.country = "FIN"
        mock_hel1.city = "Helsinki"

        self.locations.get_by_name.side_effect = lambda name: {
            "nbg1": mock_nbg1,
            "hel1": mock_hel1
        }.get(name)

        self.locations.get_list.return_value = [mock_nbg1, mock_hel1]

    def set_server_status(self, status):
        """Set the mock server status."""
        self.mock_server.status = status

    def set_server_power_state(self, powered_on=True):
        """Set the mock server power state."""
        if powered_on:
            self.mock_server.status = "running"
        else:
            self.mock_server.status = "off"

    def simulate_server_creation_failure(self):
        """Simulate server creation failure."""
        from hcloud import APIException
        self.servers.create.side_effect = APIException("Server creation failed", 400)

    def simulate_server_not_found(self):
        """Simulate server not found."""
        from hcloud import APIException
        self.servers.get_by_id.side_effect = APIException("Server not found", 404)

    def simulate_action_failure(self):
        """Simulate action failure."""
        from hcloud import APIException
        self.mock_power_action.status = "error"
        self.mock_power_action.error = {"message": "Action failed"}
        self.servers.power_on.return_value = self.mock_power_action


def create_mock_hetzner_client():
    """Create and return a mock Hetzner client."""
    return MockHetznerClient()


def mock_hetzner_responses():
    """Return mock Hetzner API responses for testing."""
    return {
        "create_server": {
            "server": MockHetznerServer().to_dict(),
            "action": MockHetznerAction().to_dict()
        },
        "get_server": {
            "server": MockHetznerServer().to_dict()
        },
        "list_servers": {
            "servers": [MockHetznerServer().to_dict()]
        },
        "server_types": {
            "server_types": [
                {
                    "name": "cpx11",
                    "description": "CX11",
                    "cores": 4,
                    "memory": 8,
                    "disk": 80
                }
            ]
        },
        "images": {
            "images": [
                {
                    "id": 1,
                    "name": "ubuntu-22.04",
                    "description": "Ubuntu 22.04",
                    "type": "system"
                }
            ]
        },
        "locations": {
            "locations": [
                {
                    "name": "nbg1",
                    "description": "Nuremberg 1 DC 3",
                    "country": "DEU",
                    "city": "Nuremberg"
                }
            ]
        }
    }


class HetznerMockPatcher:
    """Context manager for patching Hetzner client."""

    def __init__(self, custom_client=None):
        self.custom_client = custom_client
        self.patcher = None

    def __enter__(self):
        import forge.provision.hetzner
        mock_client = self.custom_client or create_mock_hetzner_client()
        self.patcher = patch('forge.provision.hetzner.Client', return_value=mock_client)
        self.patcher.start()
        return mock_client

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.patcher:
            self.patcher.stop()


# Utility functions for common test scenarios
def setup_successful_server_creation():
    """Set up mocks for successful server creation scenario."""
    return HetznerMockPatcher()


def setup_server_creation_failure():
    """Set up mocks for server creation failure scenario."""
    client = create_mock_hetzner_client()
    client.simulate_server_creation_failure()
    return HetznerMockPatcher(client)


def setup_server_not_found():
    """Set up mocks for server not found scenario."""
    client = create_mock_hetzner_client()
    client.simulate_server_not_found()
    return HetznerMockPatcher(client)


def setup_server_power_failure():
    """Set up mocks for server power operation failure."""
    client = create_mock_hetzner_client()
    client.simulate_action_failure()
    return HetznerMockPatcher(client)
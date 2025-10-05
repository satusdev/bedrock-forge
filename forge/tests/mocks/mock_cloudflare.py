"""
Mock Cloudflare API for testing.

Provides mock responses and utilities for testing Cloudflare integration
without making actual API calls.
"""

import json
from unittest.mock import Mock, MagicMock
from datetime import datetime, timedelta


class MockCloudflareZone:
    """Mock Cloudflare zone."""

    def __init__(self, zone_id="zone123", name="example.com", status="active"):
        self.id = zone_id
        self.name = name
        self.status = status
        self.name_servers = [
            "ns1.cloudflare.com",
            "ns2.cloudflare.com",
            "ns3.cloudflare.com",
            "ns4.cloudflare.com"
        ]
        self.plan = Mock()
        self.plan.name = "Free"
        self.permissions = ["#zone:edit", "#zone:read"]

    def to_dict(self):
        """Convert zone to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "name_servers": self.name_servers,
            "plan": {"name": self.plan.name},
            "permissions": self.permissions
        }


class MockCloudflareDNSRecord:
    """Mock Cloudflare DNS record."""

    def __init__(self, record_id="record123", name="test", content="192.168.1.100",
                 record_type="A", ttl=300, proxied=False):
        self.id = record_id
        self.name = name
        self.content = content
        self.type = record_type
        self.ttl = ttl
        self.proxied = proxied
        self.zone_id = "zone123"
        self.zone_name = "example.com"
        self.created_on = datetime.now() - timedelta(days=30)
        self.modified_on = datetime.now()

    def to_dict(self):
        """Convert DNS record to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "content": self.content,
            "type": self.type,
            "ttl": self.ttl,
            "proxied": self.proxied,
            "zone_id": self.zone_id,
            "zone_name": self.zone_name,
            "created_on": self.created_on.isoformat(),
            "modified_on": self.modified_on.isoformat()
        }


class MockCloudflareSSL:
    """Mock Cloudflare SSL certificate."""

    def __init__(self, cert_id="cert123", status="active"):
        self.id = cert_id
        self.status = status
        self.type = "universal"
        self.ssl_method = "strict"
        self.certificate_authority = "digicert"
        self.created_on = datetime.now() - timedelta(days=30)
        self.expires_on = datetime.now() + timedelta(days=365)

    def to_dict(self):
        """Convert SSL certificate to dictionary."""
        return {
            "id": self.id,
            "status": self.status,
            "type": self.type,
            "ssl_method": self.ssl_method,
            "certificate_authority": self.certificate_authority,
            "created_on": self.created_on.isoformat(),
            "expires_on": self.expires_on.isoformat()
        }


class MockCloudflareClient:
    """Mock Cloudflare client."""

    def __init__(self):
        self.zones = Mock()
        self.dns = Mock()
        self.ssl = Mock()
        self.user = Mock()

        # Set up default mock responses
        self._setup_zone_mocks()
        self._setup_dns_mocks()
        self._setup_ssl_mocks()
        self._setup_user_mocks()

    def _setup_zone_mocks(self):
        """Set up zone-related mocks."""
        # Create mock zones
        self.mock_zone1 = MockCloudflareZone("zone123", "example.com", "active")
        self.mock_zone2 = MockCloudflareZone("zone456", "test.com", "active")

        # Mock zone listing
        self.zones.list.return_value = [self.mock_zone1, self.mock_zone2]

        # Mock zone retrieval by ID
        self.zones.get.side_effect = lambda zone_id: {
            "zone123": self.mock_zone1,
            "zone456": self.mock_zone2
        }.get(zone_id)

        # Mock zone creation
        self.mock_new_zone = MockCloudflareZone("zone789", "newsite.com", "pending")
        self.zones.create.return_value = self.mock_new_zone

    def _setup_dns_mocks(self):
        """Set up DNS record mocks."""
        # Create mock DNS records
        self.mock_a_record = MockCloudflareDNSRecord(
            "record123", "test", "192.168.1.100", "A"
        )
        self.mock_cname_record = MockCloudflareDNSRecord(
            "record456", "www", "example.com", "CNAME"
        )
        self.mock_mx_record = MockCloudflareDNSRecord(
            "record789", "example.com", "mail.example.com", "MX"
        )

        # Mock DNS record listing
        self.dns.records.list.return_value = [
            self.mock_a_record, self.mock_cname_record, self.mock_mx_record
        ]

        # Mock DNS record creation
        self.mock_new_record = MockCloudflareDNSRecord(
            "record999", "api", "192.168.1.101", "A"
        )
        self.dns.records.create.return_value = self.mock_new_record

        # Mock DNS record retrieval by ID
        self.dns.records.get.side_effect = lambda record_id: {
            "record123": self.mock_a_record,
            "record456": self.mock_cname_record,
            "record789": self.mock_mx_record,
            "record999": self.mock_new_record
        }.get(record_id)

    def _setup_ssl_mocks(self):
        """Set up SSL certificate mocks."""
        # Create mock SSL certificates
        self.mock_ssl_cert = MockCloudflareSSL("cert123", "active")

        # Mock SSL certificate listing
        self.ssl.certificate_packs.list.return_value = [self.mock_ssl_cert]

        # Mock SSL certificate creation
        self.mock_new_ssl_cert = MockCloudflareSSL("cert456", "pending_validation")
        self.ssl.certificate_packs.create.return_value = self.mock_new_ssl_cert

    def _setup_user_mocks(self):
        """Set up user-related mocks."""
        self.mock_user = Mock()
        self.mock_user.id = "user123"
        self.mock_user.email = "test@example.com"
        self.mock_user.status = "active"

        self.user.get.return_value = self.mock_user

    def add_dns_record(self, name, content, record_type="A", ttl=300, proxied=False):
        """Add a DNS record to the mock client."""
        record = MockCloudflareDNSRecord(
            f"record_{len(self.dns.records.list.return_value) + 1}",
            name, content, record_type, ttl, proxied
        )
        self.dns.records.list.return_value.append(record)
        return record

    def remove_dns_record(self, record_id):
        """Remove a DNS record from the mock client."""
        records = self.dns.records.list.return_value
        self.dns.records.list.return_value = [
            r for r in records if r.id != record_id
        ]

    def set_zone_status(self, zone_id, status):
        """Set zone status."""
        if zone_id == "zone123":
            self.mock_zone1.status = status
        elif zone_id == "zone456":
            self.mock_zone2.status = status

    def simulate_zone_not_found(self):
        """Simulate zone not found error."""
        from cloudflare.exceptions import CloudflareException
        self.zones.get.side_effect = CloudflareException("Zone not found", 404)

    def simulate_dns_record_not_found(self):
        """Simulate DNS record not found error."""
        from cloudflare.exceptions import CloudflareException
        self.dns.records.get.side_effect = CloudflareException("DNS record not found", 404)

    def simulate_api_error(self):
        """Simulate general API error."""
        from cloudflare.exceptions import CloudflareException
        self.zones.list.side_effect = CloudflareException("API Error", 500)

    def simulate_rate_limit(self):
        """Simulate rate limit error."""
        from cloudflare.exceptions import CloudflareException
        error = CloudflareException("Rate limit exceeded", 429)
        error.errors = [{"code": 1001, "message": "Rate limit exceeded"}]
        self.zones.list.side_effect = error


def create_mock_cloudflare_client():
    """Create and return a mock Cloudflare client."""
    return MockCloudflareClient()


def mock_cloudflare_responses():
    """Return mock Cloudflare API responses for testing."""
    return {
        "list_zones": {
            "result": [
                MockCloudflareZone().to_dict(),
                MockCloudflareZone("zone456", "test.com").to_dict()
            ]
        },
        "get_zone": {
            "result": MockCloudflareZone().to_dict()
        },
        "create_zone": {
            "result": MockCloudflareZone("zone789", "newsite.com").to_dict()
        },
        "list_dns_records": {
            "result": [
                MockCloudflareDNSRecord().to_dict(),
                MockCloudflareDNSRecord("record456", "www", "example.com", "CNAME").to_dict()
            ]
        },
        "create_dns_record": {
            "result": MockCloudflareDNSRecord().to_dict()
        },
        "update_dns_record": {
            "result": MockCloudflareDNSRecord(content="192.168.1.101").to_dict()
        },
        "delete_dns_record": {
            "result": {"id": "record123"}
        },
        "list_ssl_certs": {
            "result": [MockCloudflareSSL().to_dict()]
        },
        "create_ssl_cert": {
            "result": MockCloudflareSSL("cert456", "pending_validation").to_dict()
        }
    }


class CloudflareMockPatcher:
    """Context manager for patching Cloudflare client."""

    def __init__(self, custom_client=None):
        self.custom_client = custom_client
        self.patcher = None

    def __enter__(self):
        import forge.provision.cloudflare
        mock_client = self.custom_client or create_mock_cloudflare_client()
        self.patcher = patch('forge.provision.cloudflare.Client', return_value=mock_client)
        self.patcher.start()
        return mock_client

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.patcher:
            self.patcher.stop()


# Utility functions for common test scenarios
def setup_successful_zone_operations():
    """Set up mocks for successful zone operations."""
    return CloudflareMockPatcher()


def setup_zone_not_found():
    """Set up mocks for zone not found scenario."""
    client = create_mock_cloudflare_client()
    client.simulate_zone_not_found()
    return CloudflareMockPatcher(client)


def setup_dns_record_operations():
    """Set up mocks for DNS record operations."""
    return CloudflareMockPatcher()


def setup_dns_record_not_found():
    """Set up mocks for DNS record not found scenario."""
    client = create_mock_cloudflare_client()
    client.simulate_dns_record_not_found()
    return CloudflareMockPatcher(client)


def setup_api_errors():
    """Set up mocks for API error scenarios."""
    client = create_mock_cloudflare_client()
    client.simulate_api_error()
    return CloudflareMockPatcher(client)


def setup_rate_limit():
    """Set up mocks for rate limit scenario."""
    client = create_mock_cloudflare_client()
    client.simulate_rate_limit()
    return CloudflareMockPatcher(client)
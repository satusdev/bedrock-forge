"""
Cloudflare API service for domain and SSL management.

Provides functionality to:
- Connect to Cloudflare API
- List zones (domains)
- Get SSL certificate info
- Sync domain/SSL data to database
"""
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel

from ..utils.logging import logger


class CloudflareZone(BaseModel):
    """Cloudflare zone data."""
    id: str
    name: str
    status: str
    name_servers: List[str]
    created_on: Optional[datetime] = None
    modified_on: Optional[datetime] = None


class CloudflareSSL(BaseModel):
    """Cloudflare SSL certificate data."""
    id: str
    type: str
    status: str
    issuer: Optional[str] = None
    expires_on: Optional[date] = None
    hosts: List[str] = []


class CloudflareService:
    """Service for interacting with Cloudflare API."""
    
    BASE_URL = "https://api.cloudflare.com/client/v4"
    
    def __init__(self, api_token: str):
        """Initialize with API token."""
        self.api_token = api_token
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
    
    async def verify_token(self) -> bool:
        """Verify the API token is valid."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/user/tokens/verify",
                    headers=self.headers,
                    timeout=10.0
                )
                data = response.json()
                return data.get("success", False)
        except Exception as e:
            logger.error(f"Cloudflare token verification failed: {e}")
            return False
    
    async def list_zones(self) -> List[CloudflareZone]:
        """List all zones (domains) in the account."""
        zones = []
        page = 1
        per_page = 50
        
        try:
            async with httpx.AsyncClient() as client:
                while True:
                    response = await client.get(
                        f"{self.BASE_URL}/zones",
                        headers=self.headers,
                        params={"page": page, "per_page": per_page},
                        timeout=30.0
                    )
                    data = response.json()
                    
                    if not data.get("success"):
                        logger.error(f"Cloudflare zones error: {data.get('errors')}")
                        break
                    
                    result = data.get("result", [])
                    for zone in result:
                        zones.append(CloudflareZone(
                            id=zone["id"],
                            name=zone["name"],
                            status=zone["status"],
                            name_servers=zone.get("name_servers", []),
                            created_on=zone.get("created_on"),
                            modified_on=zone.get("modified_on")
                        ))
                    
                    # Check pagination
                    result_info = data.get("result_info", {})
                    total_pages = result_info.get("total_pages", 1)
                    if page >= total_pages:
                        break
                    page += 1
                    
        except Exception as e:
            logger.error(f"Error listing Cloudflare zones: {e}")
        
        return zones
    
    async def get_zone_ssl(self, zone_id: str) -> Optional[CloudflareSSL]:
        """Get SSL certificate info for a zone."""
        try:
            async with httpx.AsyncClient() as client:
                # Get Universal SSL settings
                response = await client.get(
                    f"{self.BASE_URL}/zones/{zone_id}/ssl/certificate_packs",
                    headers=self.headers,
                    timeout=10.0
                )
                data = response.json()
                
                if data.get("success") and data.get("result"):
                    cert = data["result"][0] if data["result"] else None
                    if cert:
                        # Parse expiry date
                        expires_on = None
                        if cert.get("certificates"):
                            for c in cert["certificates"]:
                                if c.get("expires_on"):
                                    expires_on = datetime.fromisoformat(
                                        c["expires_on"].replace("Z", "+00:00")
                                    ).date()
                                    break
                        
                        return CloudflareSSL(
                            id=cert.get("id", ""),
                            type=cert.get("type", "universal"),
                            status=cert.get("status", "active"),
                            issuer="Cloudflare",
                            expires_on=expires_on,
                            hosts=cert.get("hosts", [])
                        )
        except Exception as e:
            logger.error(f"Error getting SSL for zone {zone_id}: {e}")
        
        return None
    
    async def get_all_ssl_certificates(self) -> List[Dict[str, Any]]:
        """Get SSL certificates for all zones."""
        zones = await self.list_zones()
        results = []
        
        for zone in zones:
            ssl = await self.get_zone_ssl(zone.id)
            results.append({
                "zone": zone,
                "ssl": ssl
            })
        
        return results

"""
Cloudflare API routes for domain and SSL synchronization.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated, Optional, List
from pydantic import BaseModel
from datetime import datetime
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db
from ....db.models import User
from ....db.models.domain import Domain, Registrar, DomainStatus
from ....db.models.ssl_certificate import SSLCertificate, SSLProvider
from ....db.models.app_setting import AppSetting
from ...deps import get_current_active_user
from ....utils.logging import logger
from ....services.cloudflare import CloudflareService

router = APIRouter()


# Keys for AppSetting
CLOUDFLARE_TOKEN_KEY = "cloudflare_api_token"
CLOUDFLARE_LAST_SYNC_KEY = "cloudflare_last_sync"
CLOUDFLARE_ZONE_COUNT_KEY = "cloudflare_zone_count"


async def get_setting(db: AsyncSession, key: str) -> Optional[str]:
    """Get a setting value from database."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.get_value() if setting else None


async def set_setting(db: AsyncSession, key: str, value: str, sensitive: bool = False, description: str = None):
    """Set a setting value in database."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.set_value(value, sensitive)
    else:
        setting = AppSetting(key=key, description=description)
        setting.set_value(value, sensitive)
        db.add(setting)


async def delete_setting(db: AsyncSession, key: str):
    """Delete a setting from database."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        await db.delete(setting)


class CloudflareConnect(BaseModel):
    """Request to connect Cloudflare."""
    api_token: str


class CloudflareStatus(BaseModel):
    """Cloudflare connection status."""
    connected: bool
    last_sync: Optional[datetime] = None
    zone_count: int = 0


class CloudflareZoneResponse(BaseModel):
    """Zone info response."""
    id: str
    name: str
    status: str
    name_servers: List[str]


class SyncResult(BaseModel):
    """Result of sync operation."""
    domains_synced: int
    ssl_synced: int
    errors: List[str] = []


@router.post("/connect")
async def connect_cloudflare(
    data: CloudflareConnect,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Connect Cloudflare by saving API token."""
    try:
        service = CloudflareService(data.api_token)
        is_valid = await service.verify_token()
        
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid Cloudflare API token")
        
        # Store token in database (encrypted)
        await set_setting(db, CLOUDFLARE_TOKEN_KEY, data.api_token, sensitive=True, 
                         description="Cloudflare API Token")
        await db.commit()
        
        return {"success": True, "message": "Cloudflare connected successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error connecting Cloudflare: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/disconnect")
async def disconnect_cloudflare(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Disconnect Cloudflare."""
    await delete_setting(db, CLOUDFLARE_TOKEN_KEY)
    await delete_setting(db, CLOUDFLARE_LAST_SYNC_KEY)
    await delete_setting(db, CLOUDFLARE_ZONE_COUNT_KEY)
    await db.commit()
    return {"success": True, "message": "Cloudflare disconnected"}


@router.get("/status", response_model=CloudflareStatus)
async def get_cloudflare_status(db: Annotated[AsyncSession, Depends(get_db)]):
    """Get Cloudflare connection status."""
    token = await get_setting(db, CLOUDFLARE_TOKEN_KEY)
    last_sync_str = await get_setting(db, CLOUDFLARE_LAST_SYNC_KEY)
    zone_count_str = await get_setting(db, CLOUDFLARE_ZONE_COUNT_KEY)
    
    return CloudflareStatus(
        connected=token is not None,
        last_sync=datetime.fromisoformat(last_sync_str) if last_sync_str else None,
        zone_count=int(zone_count_str) if zone_count_str else 0
    )


@router.get("/zones", response_model=List[CloudflareZoneResponse])
async def list_cloudflare_zones(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List all Cloudflare zones."""
    api_token = await get_setting(db, CLOUDFLARE_TOKEN_KEY)
    if not api_token:
        raise HTTPException(status_code=400, detail="Cloudflare not connected")
    
    try:
        service = CloudflareService(api_token)
        zones = await service.list_zones()
        
        await set_setting(db, CLOUDFLARE_ZONE_COUNT_KEY, str(len(zones)))
        await db.commit()
        
        return [
            CloudflareZoneResponse(
                id=z.id,
                name=z.name,
                status=z.status,
                name_servers=z.name_servers
            )
            for z in zones
        ]
    except Exception as e:
        logger.error(f"Error listing zones: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync", response_model=SyncResult)
async def sync_cloudflare_data(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Sync domains and SSL certificates from Cloudflare to database."""
    api_token = await get_setting(db, CLOUDFLARE_TOKEN_KEY)
    if not api_token:
        raise HTTPException(status_code=400, detail="Cloudflare not connected")
    
    try:
        service = CloudflareService(api_token)
        data = await service.get_all_ssl_certificates()
        
        domains_synced = 0
        ssl_synced = 0
        errors = []
        
        for item in data:
            zone = item["zone"]
            ssl = item["ssl"]
            
            try:
                # Check if domain exists
                result = await db.execute(
                    select(Domain).where(Domain.domain_name == zone.name)
                )
                domain = result.scalar_one_or_none()
                
                if not domain:
                    # Create new domain (requires client_id, skip for now)
                    # In real implementation, would create or update domain
                    pass
                else:
                    # Update existing domain
                    domain.registrar = Registrar.CLOUDFLARE
                    domain.dns_provider = "cloudflare"
                    domain.dns_zone_id = zone.id
                    domain.nameservers = json.dumps(zone.name_servers)
                    domains_synced += 1
                
                # Update SSL if we have domain
                if domain and ssl and ssl.expires_on:
                    # Check for existing SSL
                    ssl_result = await db.execute(
                        select(SSLCertificate).where(SSLCertificate.domain_id == domain.id)
                    )
                    cert = ssl_result.scalar_one_or_none()
                    
                    if cert:
                        cert.expiry_date = ssl.expires_on
                        cert.provider = SSLProvider.CLOUDFLARE
                        ssl_synced += 1
                    
            except Exception as e:
                errors.append(f"Error syncing {zone.name}: {str(e)}")
        
        await db.commit()
        
        await set_setting(db, CLOUDFLARE_LAST_SYNC_KEY, datetime.utcnow().isoformat())
        await db.commit()
        
        return SyncResult(
            domains_synced=domains_synced,
            ssl_synced=ssl_synced,
            errors=errors
        )
    except Exception as e:
        logger.error(f"Error syncing Cloudflare data: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/expiring")
async def get_expiring_items(
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30
):
    """Get domains and SSL certificates expiring within specified days."""
    from datetime import date, timedelta
    
    expiry_threshold = date.today() + timedelta(days=days)
    
    # Get expiring domains
    domains_result = await db.execute(
        select(Domain).where(Domain.expiry_date <= expiry_threshold)
    )
    expiring_domains = domains_result.scalars().all()
    
    # Get expiring SSL
    ssl_result = await db.execute(
        select(SSLCertificate).where(SSLCertificate.expiry_date <= expiry_threshold)
    )
    expiring_ssl = ssl_result.scalars().all()
    
    return {
        "domains": [
            {
                "id": d.id,
                "name": d.domain_name,
                "expiry_date": d.expiry_date.isoformat(),
                "days_left": (d.expiry_date - date.today()).days
            }
            for d in expiring_domains
        ],
        "ssl_certificates": [
            {
                "id": s.id,
                "common_name": s.common_name,
                "expiry_date": s.expiry_date.isoformat(),
                "days_left": (s.expiry_date - date.today()).days
            }
            for s in expiring_ssl
        ]
    }

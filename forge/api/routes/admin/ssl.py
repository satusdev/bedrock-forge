"""
SSL Certificate API routes.

Manages SSL certificate tracking, expiry dates, and renewal status.
"""
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload
from typing import Dict, Any, List, Optional, Annotated
from pydantic import BaseModel

from ....utils.logging import logger
from ....db import get_db
from ....db.models import SSLCertificate, SSLProvider, CertificateType, Domain, Project

router = APIRouter()


# Pydantic models
class SSLCertificateCreate(BaseModel):
    common_name: str
    domain_id: Optional[int] = None
    project_id: Optional[int] = None
    provider: SSLProvider = SSLProvider.LETS_ENCRYPT
    certificate_type: CertificateType = CertificateType.DV
    issue_date: date
    expiry_date: date
    auto_renew: bool = True
    is_wildcard: bool = False
    annual_cost: float = 0.0
    san_domains: Optional[List[str]] = None


class SSLCertificateUpdate(BaseModel):
    provider: Optional[SSLProvider] = None
    expiry_date: Optional[date] = None
    auto_renew: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


@router.get("/")
async def list_certificates(
    provider: Optional[SSLProvider] = None,
    is_active: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List all SSL certificates."""
    try:
        stmt = select(SSLCertificate)
        
        if provider:
            stmt = stmt.where(SSLCertificate.provider == provider)
        if is_active is not None:
            stmt = stmt.where(SSLCertificate.is_active == is_active)
        
        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        
        # Get results
        stmt = stmt.order_by(SSLCertificate.expiry_date).offset(offset).limit(limit)
        result = await db.execute(stmt)
        certs = result.scalars().all()
        
        return {
            "certificates": [
                {
                    "id": c.id,
                    "common_name": c.common_name,
                    "domain_id": c.domain_id,
                    "provider": c.provider.value if c.provider else "lets_encrypt",
                    "type": c.certificate_type.value if c.certificate_type else "dv",
                    "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,
                    "days_until_expiry": c.days_until_expiry,
                    "is_active": c.is_active,
                    "auto_renew": c.auto_renew,
                    "is_free": c.is_free
                }
                for c in certs
            ],
            "total": total
        }
    except Exception as e:
        logger.error(f"Error listing SSL certificates: {e}")
        return {"certificates": [], "total": 0}


@router.get("/expiring")
async def list_expiring_certificates(
    days: int = 14,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List SSL certificates expiring soon."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        stmt = select(SSLCertificate).where(
            SSLCertificate.is_active == True,
            SSLCertificate.expiry_date <= cutoff_date,
            SSLCertificate.expiry_date >= date.today()
        ).order_by(SSLCertificate.expiry_date)
        
        result = await db.execute(stmt)
        certs = result.scalars().all()
        
        return {
            "expiring_within_days": days,
            "count": len(certs),
            "certificates": [
                {
                    "id": c.id,
                    "common_name": c.common_name,
                    "provider": c.provider.value if c.provider else "lets_encrypt",
                    "expiry_date": c.expiry_date.isoformat(),
                    "days_until_expiry": c.days_until_expiry,
                    "auto_renew": c.auto_renew,
                    "is_free": c.is_free
                }
                for c in certs
            ]
        }
    except Exception as e:
        logger.error(f"Error listing expiring certificates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cert_id}")
async def get_certificate(cert_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get SSL certificate details."""
    try:
        stmt = select(SSLCertificate).where(SSLCertificate.id == cert_id)
        result = await db.execute(stmt)
        cert = result.scalar_one_or_none()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        import json
        san_list = []
        if cert.san_domains:
            try:
                san_list = json.loads(cert.san_domains)
            except json.JSONDecodeError:
                pass
        
        return {
            "id": cert.id,
            "common_name": cert.common_name,
            "san_domains": san_list,
            "domain_id": cert.domain_id,
            "project_id": cert.project_id,
            "provider": cert.provider.value if cert.provider else "lets_encrypt",
            "certificate_type": cert.certificate_type.value if cert.certificate_type else "dv",
            "issue_date": cert.issue_date.isoformat() if cert.issue_date else None,
            "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,
            "days_until_expiry": cert.days_until_expiry,
            "validity_days": cert.validity_days,
            "is_active": cert.is_active,
            "auto_renew": cert.auto_renew,
            "is_wildcard": cert.is_wildcard,
            "is_free": cert.is_free,
            "serial_number": cert.serial_number,
            "issuer": cert.issuer,
            "annual_cost": cert.annual_cost,
            "last_renewal_attempt": cert.last_renewal_attempt.isoformat() if cert.last_renewal_attempt else None,
            "renewal_failure_count": cert.renewal_failure_count,
            "notes": cert.notes,
            "created_at": cert.created_at.isoformat() if cert.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_certificate(data: SSLCertificateCreate, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Add an SSL certificate to track."""
    try:
        import json
        san_json = json.dumps(data.san_domains) if data.san_domains else None
        
        cert = SSLCertificate(
            common_name=data.common_name.lower(),
            domain_id=data.domain_id,
            project_id=data.project_id,
            provider=data.provider,
            certificate_type=data.certificate_type,
            issue_date=data.issue_date,
            expiry_date=data.expiry_date,
            auto_renew=data.auto_renew,
            is_wildcard=data.is_wildcard,
            annual_cost=data.annual_cost,
            san_domains=san_json,
            is_active=True
        )
        
        db.add(cert)
        await db.commit()
        await db.refresh(cert)
        
        return {
            "status": "success",
            "message": f"SSL certificate for {cert.common_name} added",
            "certificate_id": cert.id
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating certificate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{cert_id}")
async def update_certificate(
    cert_id: int,
    updates: SSLCertificateUpdate,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Update SSL certificate."""
    try:
        stmt = select(SSLCertificate).where(SSLCertificate.id == cert_id)
        result = await db.execute(stmt)
        cert = result.scalar_one_or_none()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(cert, field, value)
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate {cert.common_name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{cert_id}")
async def delete_certificate(cert_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Remove SSL certificate."""
    try:
        stmt = select(SSLCertificate).where(SSLCertificate.id == cert_id)
        result = await db.execute(stmt)
        cert = result.scalar_one_or_none()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        await db.delete(cert)
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate {cert.common_name} removed"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cert_id}/renew")
async def mark_certificate_renewed(
    cert_id: int,
    new_expiry: Optional[date] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Mark certificate as renewed with new expiry date."""
    try:
        stmt = select(SSLCertificate).where(SSLCertificate.id == cert_id)
        result = await db.execute(stmt)
        cert = result.scalar_one_or_none()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        # Default: 90 days for Let's Encrypt, 1 year for others
        if new_expiry:
            cert.expiry_date = new_expiry
        elif cert.is_free:
            cert.expiry_date = date.today() + timedelta(days=90)
        else:
            cert.expiry_date = date.today() + timedelta(days=365)
        
        cert.issue_date = date.today()
        cert.is_active = True
        cert.renewal_failure_count = 0
        cert.last_renewal_error = None
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate renewed until {cert.expiry_date.isoformat()}",
            "new_expiry_date": cert.expiry_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renewing certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_ssl_stats(db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get SSL certificate statistics."""
    try:
        stmt = select(SSLCertificate).where(SSLCertificate.is_active == True)
        result = await db.execute(stmt)
        all_certs = result.scalars().all()
        
        by_provider = {}
        free_count = 0
        paid_cost = 0
        
        for c in all_certs:
            prov_key = c.provider.value if c.provider else "lets_encrypt"
            if prov_key not in by_provider:
                by_provider[prov_key] = 0
            by_provider[prov_key] += 1
            
            if c.is_free:
                free_count += 1
            else:
                paid_cost += c.annual_cost or 0
        
        expiring_14 = len([c for c in all_certs if c.days_until_expiry <= 14])
        expiring_7 = len([c for c in all_certs if c.days_until_expiry <= 7])
        
        return {
            "total_certificates": len(all_certs),
            "free_certificates": free_count,
            "paid_certificates": len(all_certs) - free_count,
            "annual_cost_paid": round(paid_cost, 2),
            "expiring_in_14_days": expiring_14,
            "expiring_in_7_days": expiring_7,
            "by_provider": by_provider
        }
    except Exception as e:
        logger.error(f"Error getting SSL stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

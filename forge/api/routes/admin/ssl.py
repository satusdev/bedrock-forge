"""
SSL Certificate API routes.

Manages SSL certificate tracking, expiry dates, and renewal status.
"""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
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
    db: Session = Depends(get_db)
):
    """List all SSL certificates."""
    try:
        query = db.query(SSLCertificate)
        
        if provider:
            query = query.filter(SSLCertificate.provider == provider)
        if is_active is not None:
            query = query.filter(SSLCertificate.is_active == is_active)
        
        total = query.count()
        certs = query.order_by(SSLCertificate.expiry_date).offset(offset).limit(limit).all()
        
        return {
            "certificates": [
                {
                    "id": c.id,
                    "common_name": c.common_name,
                    "domain_id": c.domain_id,
                    "provider": c.provider.value,
                    "type": c.certificate_type.value,
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
        logger.warning(f"Error listing SSL certificates (returning empty): {e}")
        return {"certificates": [], "total": 0}


@router.get("/expiring")
async def list_expiring_certificates(
    days: int = 14,
    db: Session = Depends(get_db)
):
    """List SSL certificates expiring soon."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        certs = db.query(SSLCertificate).filter(
            SSLCertificate.is_active == True,
            SSLCertificate.expiry_date <= cutoff_date,
            SSLCertificate.expiry_date >= date.today()
        ).order_by(SSLCertificate.expiry_date).all()
        
        return {
            "expiring_within_days": days,
            "count": len(certs),
            "certificates": [
                {
                    "id": c.id,
                    "common_name": c.common_name,
                    "provider": c.provider.value,
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
async def get_certificate(cert_id: int, db: Session = Depends(get_db)):
    """Get SSL certificate details."""
    try:
        cert = db.query(SSLCertificate).filter(SSLCertificate.id == cert_id).first()
        
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
            "provider": cert.provider.value,
            "certificate_type": cert.certificate_type.value,
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
async def create_certificate(data: SSLCertificateCreate, db: Session = Depends(get_db)):
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
        db.commit()
        db.refresh(cert)
        
        return {
            "status": "success",
            "message": f"SSL certificate for {cert.common_name} added",
            "certificate_id": cert.id
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating certificate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{cert_id}")
async def update_certificate(
    cert_id: int,
    updates: SSLCertificateUpdate,
    db: Session = Depends(get_db)
):
    """Update SSL certificate."""
    try:
        cert = db.query(SSLCertificate).filter(SSLCertificate.id == cert_id).first()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(cert, field, value)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate {cert.common_name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{cert_id}")
async def delete_certificate(cert_id: int, db: Session = Depends(get_db)):
    """Remove SSL certificate."""
    try:
        cert = db.query(SSLCertificate).filter(SSLCertificate.id == cert_id).first()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        db.delete(cert)
        db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate {cert.common_name} removed"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cert_id}/renew")
async def mark_certificate_renewed(
    cert_id: int,
    new_expiry: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Mark certificate as renewed with new expiry date."""
    try:
        cert = db.query(SSLCertificate).filter(SSLCertificate.id == cert_id).first()
        
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
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Certificate renewed until {cert.expiry_date.isoformat()}",
            "new_expiry_date": cert.expiry_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error renewing certificate {cert_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_ssl_stats(db: Session = Depends(get_db)):
    """Get SSL certificate statistics."""
    try:
        all_certs = db.query(SSLCertificate).filter(
            SSLCertificate.is_active == True
        ).all()
        
        by_provider = {}
        free_count = 0
        paid_cost = 0
        
        for c in all_certs:
            prov_key = c.provider.value
            if prov_key not in by_provider:
                by_provider[prov_key] = 0
            by_provider[prov_key] += 1
            
            if c.is_free:
                free_count += 1
            else:
                paid_cost += c.annual_cost
        
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

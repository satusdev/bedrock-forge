"""
Domain API routes.

Manages domain registration tracking, expiry dates, and WHOIS data.
"""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from ....utils.logging import logger
from ....db import get_db
from ....db.models import Domain, DomainStatus, Registrar, Client, Project

router = APIRouter()


# Pydantic models
class DomainCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    domain_name: str
    registrar: Registrar = Registrar.OTHER
    registrar_name: Optional[str] = None
    expiry_date: date
    registration_date: Optional[date] = None
    annual_cost: float = 0.0
    currency: str = "USD"
    auto_renew: bool = True
    privacy_protection: bool = True
    nameservers: Optional[List[str]] = None
    dns_provider: Optional[str] = None


class DomainUpdate(BaseModel):
    registrar: Optional[Registrar] = None
    registrar_name: Optional[str] = None
    expiry_date: Optional[date] = None
    annual_cost: Optional[float] = None
    auto_renew: Optional[bool] = None
    privacy_protection: Optional[bool] = None
    transfer_lock: Optional[bool] = None
    nameservers: Optional[List[str]] = None
    dns_provider: Optional[str] = None
    status: Optional[DomainStatus] = None
    notes: Optional[str] = None


def extract_tld(domain_name: str) -> str:
    """Extract TLD from domain name."""
    parts = domain_name.split(".")
    if len(parts) >= 2:
        return f".{parts[-1]}"
    return ".com"


@router.get("/")
async def list_domains(
    status: Optional[DomainStatus] = None,
    client_id: Optional[int] = None,
    registrar: Optional[Registrar] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List all domains with optional filters."""
    try:
        query = db.query(Domain)
        
        if status:
            query = query.filter(Domain.status == status)
        if client_id:
            query = query.filter(Domain.client_id == client_id)
        if registrar:
            query = query.filter(Domain.registrar == registrar)
        
        total = query.count()
        domains = query.order_by(Domain.expiry_date).offset(offset).limit(limit).all()
        
        return {
            "domains": [
                {
                    "id": d.id,
                    "domain_name": d.domain_name,
                    "tld": d.tld,
                    "client_id": d.client_id,
                    "registrar": d.registrar.value,
                    "status": d.status.value,
                    "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
                    "days_until_expiry": d.days_until_expiry,
                    "auto_renew": d.auto_renew,
                    "annual_cost": d.annual_cost
                }
                for d in domains
            ],
            "total": total
        }
    except Exception as e:
        logger.warning(f"Error listing domains (returning empty): {e}")
        return {"domains": [], "total": 0}


@router.get("/expiring")
async def list_expiring_domains(
    days: int = 60,
    db: Session = Depends(get_db)
):
    """List domains expiring within specified days."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        domains = db.query(Domain).filter(
            Domain.status == DomainStatus.ACTIVE,
            Domain.expiry_date <= cutoff_date,
            Domain.expiry_date >= date.today()
        ).order_by(Domain.expiry_date).all()
        
        return {
            "expiring_within_days": days,
            "count": len(domains),
            "domains": [
                {
                    "id": d.id,
                    "domain_name": d.domain_name,
                    "client_id": d.client_id,
                    "expiry_date": d.expiry_date.isoformat(),
                    "days_until_expiry": d.days_until_expiry,
                    "registrar": d.registrar.value,
                    "auto_renew": d.auto_renew,
                    "annual_cost": d.annual_cost
                }
                for d in domains
            ]
        }
    except Exception as e:
        logger.error(f"Error listing expiring domains: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{domain_id}")
async def get_domain(domain_id: int, db: Session = Depends(get_db)):
    """Get domain details."""
    try:
        domain = db.query(Domain).filter(Domain.id == domain_id).first()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        import json
        nameservers = []
        if domain.nameservers:
            try:
                nameservers = json.loads(domain.nameservers)
            except json.JSONDecodeError:
                pass
        
        return {
            "id": domain.id,
            "domain_name": domain.domain_name,
            "tld": domain.tld,
            "client_id": domain.client_id,
            "project_id": domain.project_id,
            "registrar": domain.registrar.value,
            "registrar_name": domain.registrar_name,
            "registrar_url": domain.registrar_url,
            "status": domain.status.value,
            "registration_date": domain.registration_date.isoformat() if domain.registration_date else None,
            "expiry_date": domain.expiry_date.isoformat() if domain.expiry_date else None,
            "last_renewed": domain.last_renewed.isoformat() if domain.last_renewed else None,
            "days_until_expiry": domain.days_until_expiry,
            "is_expiring_soon": domain.is_expiring_soon,
            "nameservers": nameservers,
            "dns_provider": domain.dns_provider,
            "auto_renew": domain.auto_renew,
            "privacy_protection": domain.privacy_protection,
            "transfer_lock": domain.transfer_lock,
            "annual_cost": domain.annual_cost,
            "currency": domain.currency,
            "notes": domain.notes,
            "ssl_certificates": [
                {
                    "id": cert.id,
                    "provider": cert.provider.value,
                    "expiry_date": cert.expiry_date.isoformat(),
                    "is_active": cert.is_active
                }
                for cert in domain.ssl_certificates
            ] if domain.ssl_certificates else [],
            "created_at": domain.created_at.isoformat() if domain.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_domain(data: DomainCreate, db: Session = Depends(get_db)):
    """Add a new domain to track."""
    try:
        # Verify client exists
        client = db.query(Client).filter(Client.id == data.client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Check for duplicate domain
        existing = db.query(Domain).filter(Domain.domain_name == data.domain_name.lower()).first()
        if existing:
            raise HTTPException(status_code=400, detail="Domain already exists")
        
        import json
        nameservers_json = json.dumps(data.nameservers) if data.nameservers else None
        
        domain = Domain(
            client_id=data.client_id,
            project_id=data.project_id,
            domain_name=data.domain_name.lower(),
            tld=extract_tld(data.domain_name),
            registrar=data.registrar,
            registrar_name=data.registrar_name,
            registration_date=data.registration_date,
            expiry_date=data.expiry_date,
            annual_cost=data.annual_cost,
            currency=data.currency,
            auto_renew=data.auto_renew,
            privacy_protection=data.privacy_protection,
            nameservers=nameservers_json,
            dns_provider=data.dns_provider,
            status=DomainStatus.ACTIVE
        )
        
        db.add(domain)
        db.commit()
        db.refresh(domain)
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} added",
            "domain_id": domain.id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating domain: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{domain_id}")
async def update_domain(
    domain_id: int,
    updates: DomainUpdate,
    db: Session = Depends(get_db)
):
    """Update domain information."""
    try:
        domain = db.query(Domain).filter(Domain.id == domain_id).first()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        
        # Handle nameservers specially
        if "nameservers" in update_data:
            import json
            update_data["nameservers"] = json.dumps(update_data["nameservers"])
        
        for field, value in update_data.items():
            setattr(domain, field, value)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{domain_id}")
async def delete_domain(domain_id: int, db: Session = Depends(get_db)):
    """Remove domain from tracking."""
    try:
        domain = db.query(Domain).filter(Domain.id == domain_id).first()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        db.delete(domain)
        db.commit()
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} removed"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{domain_id}/renew")
async def mark_domain_renewed(
    domain_id: int,
    years: int = 1,
    db: Session = Depends(get_db)
):
    """Mark domain as renewed."""
    try:
        domain = db.query(Domain).filter(Domain.id == domain_id).first()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        # Extend expiry date
        new_expiry = domain.expiry_date + timedelta(days=365 * years)
        domain.expiry_date = new_expiry
        domain.last_renewed = date.today()
        domain.status = DomainStatus.ACTIVE
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Domain renewed for {years} year(s)",
            "new_expiry_date": new_expiry.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error renewing domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_domain_stats(db: Session = Depends(get_db)):
    """Get domain statistics."""
    try:
        all_domains = db.query(Domain).filter(
            Domain.status == DomainStatus.ACTIVE
        ).all()
        
        # Calculate by registrar
        by_registrar = {}
        total_cost = 0
        for d in all_domains:
            reg_key = d.registrar.value
            if reg_key not in by_registrar:
                by_registrar[reg_key] = {"count": 0, "annual_cost": 0}
            by_registrar[reg_key]["count"] += 1
            by_registrar[reg_key]["annual_cost"] += d.annual_cost
            total_cost += d.annual_cost
        
        expiring_60 = len([d for d in all_domains if d.days_until_expiry <= 60])
        expiring_30 = len([d for d in all_domains if d.days_until_expiry <= 30])
        
        return {
            "total_domains": len(all_domains),
            "total_annual_cost": round(total_cost, 2),
            "expiring_in_60_days": expiring_60,
            "expiring_in_30_days": expiring_30,
            "by_registrar": by_registrar
        }
    except Exception as e:
        logger.error(f"Error getting domain stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

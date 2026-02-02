"""
Domain API routes.

Manages domain registration tracking, expiry dates, and WHOIS data.
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
from ....db.models import Domain, DomainStatus, Registrar, Client, Project
from ....services.domain_service import DomainService

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
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List all domains with optional filters."""
    try:
        stmt = select(Domain)
        
        if status:
            stmt = stmt.where(Domain.status == status)
        if client_id:
            stmt = stmt.where(Domain.client_id == client_id)
        if registrar:
            stmt = stmt.where(Domain.registrar == registrar)
        
        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        
        # Get results
        stmt = stmt.order_by(Domain.expiry_date).offset(offset).limit(limit)
        result = await db.execute(stmt)
        domains = result.scalars().all()
        
        return {
            "domains": [
                {
                    "id": d.id,
                    "domain_name": d.domain_name,
                    "tld": d.tld,
                    "client_id": d.client_id,
                    "registrar": d.registrar.value if d.registrar else "other",
                    "status": d.status.value if d.status else "active",
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
        logger.error(f"Error listing domains: {e}")
        import traceback
        traceback.print_exc()
        return {"domains": [], "total": 0}


@router.get("/expiring")
async def list_expiring_domains(
    days: int = 60,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List domains expiring within specified days."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        stmt = select(Domain).where(
            Domain.status == DomainStatus.ACTIVE,
            Domain.expiry_date <= cutoff_date,
            Domain.expiry_date >= date.today()
        ).order_by(Domain.expiry_date)
        
        result = await db.execute(stmt)
        domains = result.scalars().all()
        
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
                    "registrar": d.registrar.value if d.registrar else "other",
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
async def get_domain(domain_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get domain details."""
    try:
        stmt = select(Domain).where(Domain.id == domain_id).options(selectinload(Domain.ssl_certificates))
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        
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
            "registrar": domain.registrar.value if domain.registrar else "other",
            "registrar_name": domain.registrar_name,
            "registrar_url": domain.registrar_url,
            "status": domain.status.value if domain.status else "active",
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
                    "provider": cert.provider.value if cert.provider else "other",
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


@router.post("/{domain_id}/whois/refresh")
async def refresh_domain_whois(
    domain_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Refresh WHOIS data on demand."""
    try:
        service = DomainService(db)
        domain = await service.fetch_whois(domain_id, force=True, raise_on_error=True)

        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")

        return {
            "status": "success",
            "domain_id": domain.id,
            "domain_name": domain.domain_name,
            "expiry_date": domain.expiry_date.isoformat() if domain.expiry_date else None,
            "registration_date": domain.registration_date.isoformat() if domain.registration_date else None,
            "registrar_name": domain.registrar_name,
            "last_whois_check": domain.last_whois_check.isoformat() if domain.last_whois_check else None,
        }
    except RuntimeError as e:
        logger.error(f"WHOIS refresh unavailable for domain {domain_id}: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"WHOIS refresh failed for domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_domain(data: DomainCreate, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Add a new domain to track."""
    try:
        # Verify client exists
        client_stmt = select(Client).where(Client.id == data.client_id)
        client_result = await db.execute(client_stmt)
        client = client_result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Check for duplicate domain
        existing_stmt = select(Domain).where(Domain.domain_name == data.domain_name.lower())
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
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
        await db.commit()
        await db.refresh(domain)
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} added",
            "domain_id": domain.id
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating domain: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{domain_id}")
async def update_domain(
    domain_id: int,
    updates: DomainUpdate,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Update domain information."""
    try:
        stmt = select(Domain).where(Domain.id == domain_id)
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        
        # Handle nameservers specially
        if "nameservers" in update_data:
            import json
            update_data["nameservers"] = json.dumps(update_data["nameservers"])
        
        for field, value in update_data.items():
            setattr(domain, field, value)
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{domain_id}")
async def delete_domain(domain_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Remove domain from tracking."""
    try:
        stmt = select(Domain).where(Domain.id == domain_id)
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        await db.delete(domain)
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Domain {domain.domain_name} removed"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{domain_id}/renew")
async def mark_domain_renewed(
    domain_id: int,
    years: int = 1,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Mark domain as renewed."""
    try:
        stmt = select(Domain).where(Domain.id == domain_id)
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found")
        
        # Extend expiry date
        new_expiry = domain.expiry_date + timedelta(days=365 * years)
        domain.expiry_date = new_expiry
        domain.last_renewed = date.today()
        domain.status = DomainStatus.ACTIVE
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Domain renewed for {years} year(s)",
            "new_expiry_date": new_expiry.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renewing domain {domain_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_domain_stats(db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get domain statistics."""
    try:
        stmt = select(Domain).where(Domain.status == DomainStatus.ACTIVE)
        result = await db.execute(stmt)
        all_domains = result.scalars().all()
        
        # Calculate by registrar
        by_registrar = {}
        total_cost = 0
        for d in all_domains:
            reg_key = d.registrar.value if d.registrar else "other"
            if reg_key not in by_registrar:
                by_registrar[reg_key] = {"count": 0, "annual_cost": 0}
            by_registrar[reg_key]["count"] += 1
            by_registrar[reg_key]["annual_cost"] += d.annual_cost or 0
            total_cost += d.annual_cost or 0
        
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

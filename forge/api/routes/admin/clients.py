"""
Clients API routes.

This module contains client management endpoints with database integration.
"""
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, EmailStr

from ....utils.logging import logger
from ....db import get_db
from ....db.models import Client, Invoice, Project, BillingStatus
from ...dashboard_config import get_config_manager, UserPreferences

router = APIRouter()


# Pydantic models
class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    company: Optional[str] = None
    phone: Optional[str] = None
    billing_email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: int = 30
    currency: str = "USD"
    tax_rate: float = 0.0


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    billing_email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[int] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None
    billing_status: Optional[BillingStatus] = None
    contract_start: Optional[datetime] = None
    contract_end: Optional[datetime] = None
    monthly_rate: Optional[float] = None


@router.get("/")
async def get_all_clients(
    search: Optional[str] = None,
    status: Optional[BillingStatus] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get all clients with optional filtering."""
    try:
        stmt = select(Client)
        
        if search:
            search_term = f"%{search}%"
            stmt = stmt.where(
                (Client.name.ilike(search_term)) |
                (Client.company.ilike(search_term)) |
                (Client.email.ilike(search_term))
            )
        
        if status:
            stmt = stmt.where(Client.billing_status == status)
        
        # Get total count (simple approximate count or separate query)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        
        # Get paginated results with eager loading for counts
        stmt = stmt.order_by(Client.name).offset(offset).limit(limit)
        stmt = stmt.options(selectinload(Client.projects), selectinload(Client.invoices))
        
        result = await db.execute(stmt)
        clients = result.scalars().all()
        
        return {
            "clients": [
                {
                    "id": c.id,
                    "name": c.name,
                    "company": c.company,
                    "email": c.email,
                    "phone": c.phone,
                    "billing_status": c.billing_status.value if c.billing_status else None,
                    "project_count": len(c.projects) if c.projects else 0,
                    "invoice_count": len(c.invoices) if c.invoices else 0,
                    "monthly_retainer": c.monthly_rate,
                    "currency": c.currency,
                    "projects": [{"id": p.id, "project_name": p.name} for p in (c.projects or [])],
                    "created_at": c.created_at.isoformat() if c.created_at else None
                }
                for c in clients
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error getting all clients: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}")
async def get_client(client_id: int, db: AsyncSession = Depends(get_db)):
    """Get client by ID with full details."""
    try:
        stmt = select(Client).where(Client.id == client_id).options(
            selectinload(Client.projects),
            selectinload(Client.invoices)
        )
        result = await db.execute(stmt)
        client = result.scalars().first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        return {
            "id": client.id,
            "name": client.name,
            "company": client.company,
            "email": client.email,
            "phone": client.phone,
            "billing_email": client.billing_email,
            "address": client.address,
            "website": client.website,
            "notes": client.notes,
            "billing_status": client.billing_status.value if client.billing_status else None,
            "payment_terms": client.payment_terms,
            "currency": client.currency,
            "tax_rate": client.tax_rate,
            "auto_billing": client.auto_billing,
            "contract_start": client.contract_start.isoformat() if client.contract_start else None,
            "contract_end": client.contract_end.isoformat() if client.contract_end else None,
            "contract_terms": client.contract_terms,
            "monthly_retainer": client.monthly_rate,
            "invoice_prefix": client.invoice_prefix,
            "created_at": client.created_at.isoformat() if client.created_at else None,
            "updated_at": client.updated_at.isoformat() if client.updated_at else None,
            "projects": [
                {"id": p.id, "project_name": p.name, "status": p.status.value}
                for p in (client.projects or [])
            ],
            "recent_invoices": [
                {
                    "id": inv.id,
                    "invoice_number": inv.invoice_number,
                    "status": inv.status.value,
                    "total": inv.total
                }
                for inv in (client.invoices or [])[:5]
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_client(client_data: ClientCreate, db: AsyncSession = Depends(get_db)):
    """Create a new client."""
    try:
        # Check for duplicate email
        result = await db.execute(select(Client).where(Client.email == client_data.email))
        existing = result.scalars().first()
        if existing:
            raise HTTPException(status_code=400, detail="Client with this email already exists")
        
        client = Client(
            name=client_data.name,
            email=client_data.email,
            company=client_data.company,
            phone=client_data.phone,
            billing_email=client_data.billing_email or client_data.email,
            address=client_data.address,
            website=client_data.website,
            notes=client_data.notes,
            payment_terms=str(client_data.payment_terms),
            currency=client_data.currency,
            tax_rate=client_data.tax_rate,
            billing_status=BillingStatus.ACTIVE,
            owner_id=1  # Default to admin user 1, as authentication is not fully wired for owner assignment yet
        )
        
        db.add(client)
        await db.commit()
        await db.refresh(client)
        
        return {
            "status": "success",
            "message": "Client created successfully",
            "client_id": client.id
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating client: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{client_id}")
async def update_client(
    client_id: int, 
    updates: ClientUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """Update an existing client."""
    try:
        result = await db.execute(select(Client).where(Client.id == client_id))
        client = result.scalars().first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Update fields
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(client, field, value)
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Client {client.name} updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{client_id}")
async def delete_client(client_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a client (soft delete by setting inactive)."""
    try:
        stmt = select(Client).where(Client.id == client_id).options(selectinload(Client.projects))
        result = await db.execute(stmt)
        client = result.scalars().first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Check for active projects
        if client.projects and len(client.projects) > 0:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete client with active projects"
            )
        
        # Soft delete - set to inactive
        client.billing_status = BillingStatus.INACTIVE
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Client {client.name} deactivated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/projects")
async def get_client_projects(client_id: int, db: AsyncSession = Depends(get_db)):
    """Get all projects for a client."""
    try:
        stmt = select(Client).where(Client.id == client_id).options(selectinload(Client.projects))
        result = await db.execute(stmt)
        client = result.scalars().first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        return {
            "client_id": client_id,
            "client_name": client.name,
            "projects": [
                {
                    "id": p.id,
                    "name": p.name,
                    "slug": p.slug,
                    "status": p.status.value,
                    "environment": p.environment.value,
                    "wp_home": p.wp_home
                }
                for p in (client.projects or [])
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting projects for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/invoices")
async def get_client_invoices(client_id: int, db: AsyncSession = Depends(get_db)):
    """Get all invoices for a client."""
    try:
        result = await db.execute(select(Client).where(Client.id == client_id))
        client = result.scalars().first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        stmt = select(Invoice).where(Invoice.client_id == client_id).order_by(Invoice.issue_date.desc())
        result = await db.execute(stmt)
        invoices = result.scalars().all()
        
        return {
            "client_id": client_id,
            "client_name": client.name,
            "invoices": [
                {
                    "id": inv.id,
                    "invoice_number": inv.invoice_number,
                    "status": inv.status.value,
                    "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                    "due_date": inv.due_date.isoformat() if inv.due_date else None,
                    "total": inv.total,
                    "balance_due": inv.balance_due
                }
                for inv in invoices
            ],
            "total_invoiced": sum(inv.total for inv in invoices),
            "total_paid": sum(inv.amount_paid for inv in invoices)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invoices for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/assign-project/{project_id}")
async def assign_project_to_client(
    client_id: int, 
    project_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """Assign a project to a client."""
    try:
        result = await db.execute(select(Client).where(Client.id == client_id))
        client = result.scalars().first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalars().first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project.client_id = client_id
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Project {project.name} assigned to client {client.name}"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error assigning project to client: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{client_id}/unassign-project/{project_id}")
async def unassign_project_from_client(
    client_id: int, 
    project_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """Remove project from client."""
    try:
        result = await db.execute(select(Project).where(
            Project.id == project_id, 
            Project.client_id == client_id
        ))
        project = result.scalars().first()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found for this client")
        
        project.client_id = None
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Project {project.name} unassigned from client"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error unassigning project from client: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# User preferences endpoints (kept from original)
@router.get("/users/{user_id}/preferences", response_model=UserPreferences)
async def get_user_preferences(user_id: str):
    """Get user preferences."""
    try:
        config_mgr = get_config_manager()
        preferences = config_mgr.get_user_preferences(user_id)
        return preferences
    except Exception as e:
        logger.error(f"Error getting user preferences for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/preferences")
async def update_user_preferences(user_id: str, preferences: UserPreferences):
    """Update user preferences."""
    try:
        config_mgr = get_config_manager()
        success = config_mgr.update_user_preferences(user_id, preferences)

        if success:
            return {"status": "success", "message": "User preferences updated"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update preferences")

    except Exception as e:
        logger.error(f"Error updating user preferences for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

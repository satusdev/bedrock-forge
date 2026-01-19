"""
Client Portal API routes.

Provides endpoints for clients to view their projects, invoices, and tickets.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ....db import get_db
from ....db.models.client import Client
from ....db.models.client_user import ClientUser
from ....db.models.project import Project
from ....db.models.invoice import Invoice
from ....db.models.ticket import Ticket, TicketMessage, TicketStatus, TicketPriority, SenderType
from .client_auth import get_current_client_user
from ....utils.logging import logger

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class ProjectSummary(BaseModel):
    """Client view of a project."""
    id: int
    name: str
    status: str
    environments: List[str]


class InvoiceSummary(BaseModel):
    """Client view of an invoice."""
    id: int
    invoice_number: str
    amount: float
    status: str
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None


class TicketSummary(BaseModel):
    """Client view of a ticket."""
    id: int
    subject: str
    status: str
    priority: str
    created_at: datetime
    last_reply_at: Optional[datetime] = None


class TicketDetail(BaseModel):
    """Full ticket with messages."""
    id: int
    subject: str
    status: str
    priority: str
    project_id: Optional[int] = None
    created_at: datetime
    messages: List[dict]


class CreateTicketRequest(BaseModel):
    """Request to create a ticket."""
    subject: str
    message: str
    project_id: Optional[int] = None
    priority: str = "medium"


class TicketReplyRequest(BaseModel):
    """Request to reply to a ticket."""
    message: str


# ============================================================================
# Dependencies
# ============================================================================

async def get_client_from_token(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db)
) -> ClientUser:
    """Extract client user from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )
    token = authorization.replace("Bearer ", "")
    return await get_current_client_user(token, db)


# ============================================================================
# Project Endpoints
# ============================================================================

@router.get("/projects", response_model=List[ProjectSummary])
async def get_client_projects(
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get all projects for the current client."""
    result = await db.execute(
        select(Project)
        .where(Project.client_id == client_user.client_id)
        .options(selectinload(Project.project_servers))
    )
    projects = result.scalars().all()
    
    return [
        ProjectSummary(
            id=p.id,
            name=p.name,
            status=p.status.value if p.status else "unknown",
            environments=[ps.environment.value for ps in p.project_servers]
        )
        for p in projects
    ]


# ============================================================================
# Invoice Endpoints
# ============================================================================

@router.get("/invoices", response_model=List[InvoiceSummary])
async def get_client_invoices(
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get all invoices for the current client."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.client_id == client_user.client_id)
        .order_by(Invoice.created_at.desc())
    )
    invoices = result.scalars().all()
    
    return [
        InvoiceSummary(
            id=inv.id,
            invoice_number=inv.invoice_number,
            amount=inv.total_amount,
            status=inv.status.value if inv.status else "unknown",
            due_date=inv.due_date,
            paid_date=inv.paid_date
        )
        for inv in invoices
    ]


# ============================================================================
# Ticket Endpoints
# ============================================================================

@router.get("/tickets", response_model=List[TicketSummary])
async def get_client_tickets(
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get all tickets for the current client."""
    result = await db.execute(
        select(Ticket)
        .where(Ticket.client_id == client_user.client_id)
        .order_by(Ticket.created_at.desc())
    )
    tickets = result.scalars().all()
    
    return [
        TicketSummary(
            id=t.id,
            subject=t.subject,
            status=t.status.value,
            priority=t.priority.value,
            created_at=t.created_at,
            last_reply_at=t.last_reply_at
        )
        for t in tickets
    ]


@router.post("/tickets", response_model=TicketSummary)
async def create_ticket(
    request: CreateTicketRequest,
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Create a new support ticket."""
    # Validate priority
    try:
        priority = TicketPriority(request.priority)
    except ValueError:
        priority = TicketPriority.MEDIUM
    
    # Create ticket
    ticket = Ticket(
        client_id=client_user.client_id,
        project_id=request.project_id,
        subject=request.subject,
        status=TicketStatus.OPEN,
        priority=priority
    )
    db.add(ticket)
    await db.flush()
    
    # Add initial message
    message = TicketMessage(
        ticket_id=ticket.id,
        sender_type=SenderType.CLIENT,
        sender_id=client_user.id,
        sender_name=client_user.full_name or client_user.email,
        message=request.message
    )
    db.add(message)
    
    await db.commit()
    
    logger.info(f"Ticket created: {ticket.id} by client {client_user.client_id}")
    
    return TicketSummary(
        id=ticket.id,
        subject=ticket.subject,
        status=ticket.status.value,
        priority=ticket.priority.value,
        created_at=ticket.created_at,
        last_reply_at=None
    )


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
async def get_ticket_detail(
    ticket_id: int,
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get ticket details with all messages."""
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .where(Ticket.client_id == client_user.client_id)
        .options(selectinload(Ticket.messages))
    )
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    return TicketDetail(
        id=ticket.id,
        subject=ticket.subject,
        status=ticket.status.value,
        priority=ticket.priority.value,
        project_id=ticket.project_id,
        created_at=ticket.created_at,
        messages=[
            {
                "id": m.id,
                "sender_type": m.sender_type.value,
                "sender_name": m.sender_name or "Unknown",
                "message": m.message,
                "created_at": m.created_at
            }
            for m in sorted(ticket.messages, key=lambda x: x.created_at)
        ]
    )


@router.post("/tickets/{ticket_id}/reply", response_model=dict)
async def reply_to_ticket(
    ticket_id: int,
    request: TicketReplyRequest,
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Add a reply to a ticket."""
    # Verify ticket belongs to client
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .where(Ticket.client_id == client_user.client_id)
    )
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    if ticket.status == TicketStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reply to a closed ticket"
        )
    
    # Add message
    message = TicketMessage(
        ticket_id=ticket.id,
        sender_type=SenderType.CLIENT,
        sender_id=client_user.id,
        sender_name=client_user.full_name or client_user.email,
        message=request.message
    )
    db.add(message)
    
    # Update ticket
    ticket.last_reply_at = datetime.utcnow()
    if ticket.status == TicketStatus.WAITING_REPLY:
        ticket.status = TicketStatus.OPEN
    
    await db.commit()
    
    return {"message": "Reply added successfully"}

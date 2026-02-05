"""
Client Portal API routes.

Provides endpoints for clients to view their projects, invoices, and tickets.
"""
from datetime import datetime, date
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
from ....db.models.subscription import Subscription
from ....db.models.backup import Backup
from ....db.models.user import User
from ....db.models.notification_channel import NotificationChannel
from ....db.models.ticket import Ticket, TicketMessage, TicketStatus, TicketPriority, SenderType
from .client_auth import get_current_client_user
from ....utils.logging import logger
from ....services.notification_service import notification_service

router = APIRouter()

# Role permissions matrix
ROLE_PERMISSIONS = {
    "admin": {"view_portal", "create_ticket", "reply_ticket"},
    "member": {"view_portal", "create_ticket", "reply_ticket"},
    "viewer": {"view_portal"},
}


def require_permission(client_user: ClientUser, permission: str) -> None:
    role = client_user.role.value if client_user.role else "viewer"
    if permission not in ROLE_PERMISSIONS.get(role, set()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )


async def notify_admins(db: AsyncSession, title: str, message: str) -> None:
    try:
        result = await db.execute(
            select(User)
            .where(User.is_superuser == True)
            .options(selectinload(User.notification_channels))
        )
        admins = result.scalars().all()

        for admin in admins:
            for channel in admin.notification_channels:
                await notification_service.send(
                    channel=channel,
                    title=title,
                    message=message,
                    level="info",
                )
    except Exception as exc:
        logger.error(f"Ticket notification failed: {exc}")


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


class InvoiceItemDetail(BaseModel):
    id: int
    description: str
    quantity: float
    unit_price: float
    total: float
    item_type: Optional[str] = None
    project_id: Optional[int] = None


class InvoiceDetail(BaseModel):
    id: int
    invoice_number: str
    status: str
    issue_date: datetime
    due_date: datetime
    paid_date: Optional[datetime] = None
    subtotal: float
    tax_rate: float
    tax_amount: float
    discount_amount: float
    total: float
    amount_paid: float
    currency: str
    notes: Optional[str] = None
    terms: Optional[str] = None
    items: List[InvoiceItemDetail]


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


class SubscriptionSummary(BaseModel):
    """Client view of a subscription."""
    id: int
    name: str
    subscription_type: str
    status: str
    amount: float
    currency: str
    next_billing_date: Optional[date] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None


class BackupSummary(BaseModel):
    """Client view of a backup."""
    id: int
    name: str
    project_id: int
    project_name: str
    backup_type: str
    storage_type: str
    status: str
    size_bytes: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


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


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetail)
async def get_client_invoice_detail(
    invoice_id: int,
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get invoice detail for current client."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .where(Invoice.client_id == client_user.client_id)
        .options(selectinload(Invoice.items))
    )
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )

    return InvoiceDetail(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        status=invoice.status.value if invoice.status else "unknown",
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        paid_date=invoice.paid_date,
        subtotal=invoice.subtotal,
        tax_rate=invoice.tax_rate,
        tax_amount=invoice.tax_amount,
        discount_amount=invoice.discount_amount,
        total=invoice.total,
        amount_paid=invoice.amount_paid,
        currency=invoice.currency,
        notes=invoice.notes,
        terms=invoice.terms,
        items=[
            InvoiceItemDetail(
                id=item.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total=item.total,
                item_type=item.item_type,
                project_id=item.project_id,
            )
            for item in invoice.items
        ],
    )


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
    require_permission(client_user, "create_ticket")
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

    await notify_admins(
        db,
        title=f"New ticket from {client_user.email}",
        message=f"Ticket #{ticket.id}: {ticket.subject}",
    )
    
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
    require_permission(client_user, "reply_ticket")
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

    await notify_admins(
        db,
        title=f"Ticket reply from {client_user.email}",
        message=f"Ticket #{ticket.id}: new reply added",
    )
    
    return {"message": "Reply added successfully"}


# ==========================================================================
# Subscription Endpoints
# ==========================================================================

@router.get("/subscriptions", response_model=List[SubscriptionSummary])
async def get_client_subscriptions(
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get all subscriptions for the current client."""
    result = await db.execute(
        select(Subscription)
        .where(Subscription.client_id == client_user.client_id)
        .options(selectinload(Subscription.project))
        .order_by(Subscription.next_billing_date.asc())
    )
    subscriptions = result.scalars().all()

    return [
        SubscriptionSummary(
            id=sub.id,
            name=sub.name,
            subscription_type=sub.subscription_type.value,
            status=sub.status.value,
            amount=sub.amount,
            currency=sub.currency,
            next_billing_date=sub.next_billing_date,
            project_id=sub.project_id,
            project_name=sub.project.name if sub.project else None,
        )
        for sub in subscriptions
    ]


# ==========================================================================
# Backup Endpoints
# ==========================================================================

@router.get("/backups", response_model=List[BackupSummary])
async def get_client_backups(
    client_user: ClientUser = Depends(get_client_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get backups for projects owned by the current client."""
    result = await db.execute(
        select(Backup)
        .join(Project, Backup.project_id == Project.id)
        .where(Project.client_id == client_user.client_id)
        .options(selectinload(Backup.project))
        .order_by(Backup.started_at.desc())
    )
    backups = result.scalars().all()

    return [
        BackupSummary(
            id=backup.id,
            name=backup.name,
            project_id=backup.project_id,
            project_name=backup.project.name if backup.project else "Unknown",
            backup_type=backup.backup_type.value,
            storage_type=backup.storage_type.value,
            status=backup.status.value,
            size_bytes=backup.size_bytes,
            started_at=backup.started_at,
            completed_at=backup.completed_at,
        )
        for backup in backups
    ]

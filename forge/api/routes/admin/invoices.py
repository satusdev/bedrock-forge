"""
Invoice API routes.

This module contains invoice management endpoints with database integration.
"""
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload, joinedload
from typing import Dict, Any, List, Optional, Annotated
from pydantic import BaseModel

from ....utils.logging import logger
from ....db import get_db
from ....db.models import Client, Invoice, InvoiceItem, InvoiceStatus

router = APIRouter()


# Pydantic models for request/response
class InvoiceItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    item_type: Optional[str] = None
    project_id: Optional[int] = None


class InvoiceCreate(BaseModel):
    client_id: int
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    items: List[InvoiceItemCreate]
    tax_rate: float = 0.0
    discount_amount: float = 0.0
    notes: Optional[str] = None
    terms: Optional[str] = None
    currency: str = "USD"


class InvoiceUpdate(BaseModel):
    status: Optional[InvoiceStatus] = None
    due_date: Optional[date] = None
    tax_rate: Optional[float] = None
    discount_amount: Optional[float] = None
    notes: Optional[str] = None
    terms: Optional[str] = None


class PaymentRecord(BaseModel):
    amount: float
    payment_method: str
    payment_reference: Optional[str] = None


async def generate_invoice_number(db: AsyncSession) -> str:
    """Generate unique invoice number."""
    prefix = datetime.now().strftime("INV-%Y%m-")
    
    # Get the count of invoices this month
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    stmt = select(func.count()).select_from(Invoice).where(Invoice.created_at >= month_start)
    count = (await db.execute(stmt)).scalar() or 0
    
    return f"{prefix}{count + 1:04d}"


@router.get("/")
async def list_invoices(
    status: Optional[InvoiceStatus] = None,
    client_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List all invoices with optional filters."""
    try:
        stmt = select(Invoice)
        
        if status:
            stmt = stmt.where(Invoice.status == status)
        if client_id:
            stmt = stmt.where(Invoice.client_id == client_id)
        
        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        
        # Get results
        stmt = stmt.order_by(Invoice.created_at.desc()).offset(offset).limit(limit)
        result = await db.execute(stmt)
        invoices = result.scalars().all()
        
        return {
            "invoices": [
                {
                    "id": inv.id,
                    "invoice_number": inv.invoice_number,
                    "client_id": inv.client_id,
                    "status": inv.status.value if inv.status else "draft",
                    "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                    "due_date": inv.due_date.isoformat() if inv.due_date else None,
                    "total": inv.total,
                    "balance_due": inv.balance_due,
                    "currency": inv.currency
                }
                for inv in invoices
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get detailed invoice by ID."""
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.items))
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        return {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "client_id": invoice.client_id,
            "status": invoice.status.value if invoice.status else "draft",
            "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            "paid_date": invoice.paid_date.isoformat() if invoice.paid_date else None,
            "subtotal": invoice.subtotal,
            "tax_rate": invoice.tax_rate,
            "tax_amount": invoice.tax_amount,
            "discount_amount": invoice.discount_amount,
            "total": invoice.total,
            "amount_paid": invoice.amount_paid,
            "balance_due": invoice.balance_due,
            "payment_method": invoice.payment_method,
            "payment_reference": invoice.payment_reference,
            "notes": invoice.notes,
            "terms": invoice.terms,
            "currency": invoice.currency,
            "items": [
                {
                    "id": item.id,
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total": item.total,
                    "item_type": item.item_type,
                    "project_id": item.project_id
                }
                for item in invoice.items
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_invoice(invoice_data: InvoiceCreate, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Create a new invoice."""
    try:
        # Verify client exists
        client_stmt = select(Client).where(Client.id == invoice_data.client_id)
        client_result = await db.execute(client_stmt)
        client = client_result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Generate invoice number
        invoice_number = await generate_invoice_number(db)
        
        # Set dates
        issue_date = invoice_data.issue_date or date.today()
        due_date = invoice_data.due_date or (issue_date + timedelta(days=client.payment_terms or 30))
        
        # Create invoice
        invoice = Invoice(
            invoice_number=invoice_number,
            client_id=invoice_data.client_id,
            status=InvoiceStatus.DRAFT,
            issue_date=issue_date,
            due_date=due_date,
            tax_rate=invoice_data.tax_rate,
            discount_amount=invoice_data.discount_amount,
            notes=invoice_data.notes,
            terms=invoice_data.terms or client.contract_terms,
            currency=invoice_data.currency
        )
        
        db.add(invoice)
        await db.flush()  # Get the invoice ID
        
        # Add line items
        for item_data in invoice_data.items:
            item = InvoiceItem(
                invoice_id=invoice.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total=item_data.quantity * item_data.unit_price,
                item_type=item_data.item_type,
                project_id=item_data.project_id
            )
            db.add(item)
            # Relationship append might trigger lazy load in some cases, so just add to DB
            # and let calculate_totals handle it if it uses the loaded items
        
        # Ensure items are available for calculation
        await db.flush()
        
        # Reload invoice with items for calculation
        stmt = select(Invoice).where(Invoice.id == invoice.id).options(selectinload(Invoice.items))
        invoice_result = await db.execute(stmt)
        invoice = invoice_result.scalar_one()
        
        # Calculate totals
        invoice.calculate_totals()
        
        await db.commit()
        await db.refresh(invoice)
        
        return {
            "status": "success",
            "message": "Invoice created successfully",
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "total": invoice.total
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: int, 
    updates: InvoiceUpdate, 
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Update an invoice."""
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.items))
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Only allow updates on draft/pending invoices
        if invoice.status in [InvoiceStatus.PAID, InvoiceStatus.CANCELLED]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot update {invoice.status.value} invoice"
            )
        
        # Update fields
        if updates.status is not None:
            invoice.status = updates.status
        if updates.due_date is not None:
            invoice.due_date = updates.due_date
        if updates.tax_rate is not None:
            invoice.tax_rate = updates.tax_rate
            invoice.calculate_totals()
        if updates.discount_amount is not None:
            invoice.discount_amount = updates.discount_amount
            invoice.calculate_totals()
        if updates.notes is not None:
            invoice.notes = updates.notes
        if updates.terms is not None:
            invoice.terms = updates.terms
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Invoice {invoice.invoice_number} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Delete a draft invoice."""
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id)
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice.status != InvoiceStatus.DRAFT:
            raise HTTPException(
                status_code=400, 
                detail="Only draft invoices can be deleted"
            )
        
        await db.delete(invoice)
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Invoice {invoice.invoice_number} deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{invoice_id}/send")
async def send_invoice(invoice_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Mark invoice as sent/pending."""
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id)
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice.status != InvoiceStatus.DRAFT:
            raise HTTPException(
                status_code=400, 
                detail="Only draft invoices can be sent"
            )
        
        invoice.status = InvoiceStatus.PENDING
        await db.commit()
        
        # TODO: Send email notification to client
        
        return {
            "status": "success",
            "message": f"Invoice {invoice.invoice_number} marked as sent"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error sending invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{invoice_id}/payment")
async def record_payment(
    invoice_id: int, 
    payment: PaymentRecord, 
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Record a payment against an invoice."""
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id)
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice.status in [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot record payment on {invoice.status.value} invoice"
            )
        
        # Record payment
        invoice.amount_paid += payment.amount
        invoice.payment_method = payment.payment_method
        invoice.payment_reference = payment.payment_reference
        
        # Check if fully paid
        if invoice.is_paid:
            invoice.status = InvoiceStatus.PAID
            invoice.paid_date = date.today()
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Payment of {payment.amount} recorded",
            "balance_due": invoice.balance_due,
            "is_paid": invoice.is_paid
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error recording payment for invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Generate PDF for invoice."""
    from fastapi.responses import Response
    from ....services.invoice_pdf import invoice_pdf_generator
    
    try:
        stmt = select(Invoice).where(Invoice.id == invoice_id).options(
            joinedload(Invoice.client),
            selectinload(Invoice.items)
        )
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Get client info
        client = invoice.client
        client_name = client.name if client else "Unknown"
        client_address = None
        if client:
            parts = [client.address, client.city, client.state, client.postal_code, client.country]
            client_address = "\n".join([p for p in parts if p])
        
        # Prepare items for PDF
        items = [
            {
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total": item.total
            }
            for item in invoice.items
        ]
        
        # Generate PDF
        pdf_content = invoice_pdf_generator.generate(
            invoice_number=invoice.invoice_number,
            client_name=client_name,
            client_address=client_address,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            items=items,
            subtotal=invoice.subtotal,
            tax_rate=invoice.tax_rate,
            tax_amount=invoice.tax_amount,
            discount_amount=invoice.discount_amount,
            total=invoice.total,
            currency=invoice.currency,
            notes=invoice.notes,
            terms=invoice.terms
        )
        
        filename = f"invoice_{invoice.invoice_number}.pdf"
        
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF for invoice {invoice_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_invoice_stats(
    period_days: int = 30,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Get invoice statistics summary."""
    try:
        period_start = datetime.now() - timedelta(days=period_days)
        
        # Get invoices in period
        stmt = select(Invoice).where(Invoice.created_at >= period_start)
        result = await db.execute(stmt)
        invoices = result.scalars().all()
        
        total_invoiced = sum(inv.total for inv in invoices)
        total_paid = sum(inv.amount_paid for inv in invoices)
        total_pending = sum(inv.balance_due for inv in invoices if inv.status == InvoiceStatus.PENDING)
        total_overdue = sum(
            inv.balance_due for inv in invoices 
            if inv.status == InvoiceStatus.PENDING and inv.due_date < date.today()
        )
        
        return {
            "period_days": period_days,
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_pending": total_pending,
            "total_overdue": total_overdue,
            "invoice_count": len(invoices),
            "paid_count": len([inv for inv in invoices if inv.status == InvoiceStatus.PAID]),
            "pending_count": len([inv for inv in invoices if inv.status == InvoiceStatus.PENDING])
        }
    except Exception as e:
        logger.error(f"Error getting invoice stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

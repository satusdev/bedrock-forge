"""
Subscription API routes.

Manages recurring subscriptions for hosting, domains, SSL, maintenance, etc.
"""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from ....utils.logging import logger
from ....db import get_db
from ....db.models import (
    Subscription, SubscriptionType, BillingCycle, SubscriptionStatus,
    Client, Project, Invoice, InvoiceItem, InvoiceStatus
)

router = APIRouter()


# Pydantic models
class SubscriptionCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    subscription_type: SubscriptionType
    name: str
    description: Optional[str] = None
    billing_cycle: BillingCycle = BillingCycle.YEARLY
    amount: float
    currency: str = "USD"
    start_date: Optional[date] = None
    auto_renew: bool = True
    reminder_days: int = 30
    provider: Optional[str] = None
    external_id: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    billing_cycle: Optional[BillingCycle] = None
    amount: Optional[float] = None
    auto_renew: Optional[bool] = None
    reminder_days: Optional[int] = None
    status: Optional[SubscriptionStatus] = None
    notes: Optional[str] = None


def calculate_next_billing_date(start: date, cycle: BillingCycle) -> date:
    """Calculate next billing date based on cycle."""
    days = {
        BillingCycle.MONTHLY: 30,
        BillingCycle.QUARTERLY: 90,
        BillingCycle.BIANNUAL: 180,
        BillingCycle.YEARLY: 365,
        BillingCycle.BIENNIAL: 730,
        BillingCycle.TRIENNIAL: 1095,
    }
    return start + timedelta(days=days.get(cycle, 365))


@router.get("/")
async def list_subscriptions(
    subscription_type: Optional[SubscriptionType] = None,
    status: Optional[SubscriptionStatus] = None,
    client_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List all subscriptions with optional filters."""
    try:
        query = db.query(Subscription)
        
        if subscription_type:
            query = query.filter(Subscription.subscription_type == subscription_type)
        if status:
            query = query.filter(Subscription.status == status)
        if client_id:
            query = query.filter(Subscription.client_id == client_id)
        
        total = query.count()
        subscriptions = query.order_by(Subscription.next_billing_date).offset(offset).limit(limit).all()
        
        return {
            "subscriptions": [
                {
                    "id": s.id,
                    "name": s.name,
                    "type": s.subscription_type.value,
                    "client_id": s.client_id,
                    "billing_cycle": s.billing_cycle.value,
                    "amount": s.amount,
                    "currency": s.currency,
                    "status": s.status.value,
                    "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
                    "days_until_renewal": s.days_until_renewal,
                    "auto_renew": s.auto_renew
                }
                for s in subscriptions
            ],
            "total": total
        }
    except Exception as e:
        logger.warning(f"Error listing subscriptions (returning empty): {e}")
        return {"subscriptions": [], "total": 0}


@router.get("/expiring")
async def list_expiring_subscriptions(
    days: int = 30,
    db: Session = Depends(get_db)
):
    """List subscriptions expiring within specified days."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        subscriptions = db.query(Subscription).filter(
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.next_billing_date <= cutoff_date,
            Subscription.next_billing_date >= date.today()
        ).order_by(Subscription.next_billing_date).all()
        
        return {
            "expiring_within_days": days,
            "count": len(subscriptions),
            "subscriptions": [
                {
                    "id": s.id,
                    "name": s.name,
                    "type": s.subscription_type.value,
                    "client_id": s.client_id,
                    "next_billing_date": s.next_billing_date.isoformat(),
                    "days_until_renewal": s.days_until_renewal,
                    "amount": s.amount,
                    "auto_renew": s.auto_renew
                }
                for s in subscriptions
            ]
        }
    except Exception as e:
        logger.error(f"Error listing expiring subscriptions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{subscription_id}")
async def get_subscription(subscription_id: int, db: Session = Depends(get_db)):
    """Get subscription details."""
    try:
        subscription = db.query(Subscription).filter(
            Subscription.id == subscription_id
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        return {
            "id": subscription.id,
            "name": subscription.name,
            "description": subscription.description,
            "type": subscription.subscription_type.value,
            "client_id": subscription.client_id,
            "project_id": subscription.project_id,
            "billing_cycle": subscription.billing_cycle.value,
            "amount": subscription.amount,
            "currency": subscription.currency,
            "status": subscription.status.value,
            "auto_renew": subscription.auto_renew,
            "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
            "next_billing_date": subscription.next_billing_date.isoformat() if subscription.next_billing_date else None,
            "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
            "days_until_renewal": subscription.days_until_renewal,
            "yearly_cost": subscription.get_yearly_cost(),
            "provider": subscription.provider,
            "external_id": subscription.external_id,
            "reminder_days": subscription.reminder_days,
            "total_invoiced": subscription.total_invoiced,
            "total_paid": subscription.total_paid,
            "notes": subscription.notes,
            "created_at": subscription.created_at.isoformat() if subscription.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_subscription(
    data: SubscriptionCreate,
    db: Session = Depends(get_db)
):
    """Create a new subscription."""
    try:
        # Verify client exists
        client = db.query(Client).filter(Client.id == data.client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Verify project if provided
        if data.project_id:
            project = db.query(Project).filter(Project.id == data.project_id).first()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
        
        start = data.start_date or date.today()
        next_billing = calculate_next_billing_date(start, data.billing_cycle)
        
        subscription = Subscription(
            client_id=data.client_id,
            project_id=data.project_id,
            subscription_type=data.subscription_type,
            name=data.name,
            description=data.description,
            billing_cycle=data.billing_cycle,
            amount=data.amount,
            currency=data.currency,
            start_date=start,
            next_billing_date=next_billing,
            auto_renew=data.auto_renew,
            reminder_days=data.reminder_days,
            provider=data.provider,
            external_id=data.external_id,
            status=SubscriptionStatus.ACTIVE
        )
        
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        
        return {
            "status": "success",
            "message": "Subscription created successfully",
            "subscription_id": subscription.id,
            "next_billing_date": subscription.next_billing_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{subscription_id}")
async def update_subscription(
    subscription_id: int,
    updates: SubscriptionUpdate,
    db: Session = Depends(get_db)
):
    """Update subscription."""
    try:
        subscription = db.query(Subscription).filter(
            Subscription.id == subscription_id
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(subscription, field, value)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription {subscription.name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{subscription_id}")
async def cancel_subscription(
    subscription_id: int,
    db: Session = Depends(get_db)
):
    """Cancel a subscription."""
    try:
        subscription = db.query(Subscription).filter(
            Subscription.id == subscription_id
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        subscription.status = SubscriptionStatus.CANCELLED
        subscription.cancelled_at = datetime.now()
        subscription.auto_renew = False
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription {subscription.name} cancelled"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{subscription_id}/renew")
async def renew_subscription(
    subscription_id: int,
    db: Session = Depends(get_db)
):
    """Manually renew a subscription."""
    try:
        subscription = db.query(Subscription).filter(
            Subscription.id == subscription_id
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        # Calculate new billing date from current next_billing_date
        new_billing_date = calculate_next_billing_date(
            subscription.next_billing_date or date.today(),
            subscription.billing_cycle
        )
        
        subscription.next_billing_date = new_billing_date
        subscription.status = SubscriptionStatus.ACTIVE
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription renewed until {new_billing_date.isoformat()}",
            "next_billing_date": new_billing_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error renewing subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{subscription_id}/invoice")
async def generate_renewal_invoice(
    subscription_id: int,
    db: Session = Depends(get_db)
):
    """Generate an invoice for subscription renewal."""
    try:
        subscription = db.query(Subscription).filter(
            Subscription.id == subscription_id
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        client = subscription.client
        
        # Generate invoice number
        invoice_number = client.generate_invoice_number()
        
        # Create invoice
        invoice = Invoice(
            invoice_number=invoice_number,
            client_id=subscription.client_id,
            status=InvoiceStatus.DRAFT,
            issue_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            period_start=subscription.next_billing_date,
            period_end=calculate_next_billing_date(
                subscription.next_billing_date,
                subscription.billing_cycle
            ),
            currency=subscription.currency
        )
        
        db.add(invoice)
        db.flush()
        
        # Add subscription line item
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=f"{subscription.name} - {subscription.billing_cycle.value.title()} Renewal",
            quantity=1,
            unit_price=subscription.amount,
            total=subscription.amount,
            item_type=subscription.subscription_type.value,
            project_id=subscription.project_id
        )
        
        db.add(item)
        invoice.items.append(item)
        invoice.calculate_totals()
        
        # Link invoice to subscription
        subscription.last_invoice_id = invoice.id
        subscription.total_invoiced += invoice.total
        
        db.commit()
        
        return {
            "status": "success",
            "message": "Renewal invoice generated",
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "total": invoice.total
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating invoice for subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_subscription_stats(db: Session = Depends(get_db)):
    """Get subscription statistics."""
    try:
        all_subs = db.query(Subscription).filter(
            Subscription.status == SubscriptionStatus.ACTIVE
        ).all()
        
        # Calculate by type
        by_type = {}
        for sub in all_subs:
            type_key = sub.subscription_type.value
            if type_key not in by_type:
                by_type[type_key] = {"count": 0, "yearly_revenue": 0}
            by_type[type_key]["count"] += 1
            by_type[type_key]["yearly_revenue"] += sub.get_yearly_cost()
        
        total_yearly = sum(sub.get_yearly_cost() for sub in all_subs)
        expiring_30 = len([s for s in all_subs if s.days_until_renewal <= 30])
        expiring_7 = len([s for s in all_subs if s.days_until_renewal <= 7])
        
        return {
            "total_active": len(all_subs),
            "total_yearly_revenue": round(total_yearly, 2),
            "total_monthly_revenue": round(total_yearly / 12, 2),
            "expiring_in_30_days": expiring_30,
            "expiring_in_7_days": expiring_7,
            "by_type": by_type
        }
    except Exception as e:
        logger.error(f"Error getting subscription stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

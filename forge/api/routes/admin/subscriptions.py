"""
Subscription API routes.

Manages recurring subscriptions for hosting, domains, SSL, maintenance, etc.
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
from ....db.models import (
    Subscription, SubscriptionType, BillingCycle, SubscriptionStatus,
    Client, Project, Invoice, InvoiceItem, InvoiceStatus, HostingPackage
)

router = APIRouter()


# Pydantic models
class SubscriptionCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    subscription_type: Optional[SubscriptionType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    billing_cycle: Optional[BillingCycle] = None
    amount: Optional[float] = None
    currency: str = "USD"
    start_date: Optional[date] = None
    auto_renew: bool = True
    reminder_days: int = 30
    provider: Optional[str] = None
    external_id: Optional[str] = None
    package_id: Optional[int] = None
    create_hosting: bool = True
    create_support: bool = True


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
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List all subscriptions with optional filters."""
    try:
        stmt = select(Subscription)
        
        if subscription_type:
            stmt = stmt.where(Subscription.subscription_type == subscription_type)
        if status:
            stmt = stmt.where(Subscription.status == status)
        if client_id:
            stmt = stmt.where(Subscription.client_id == client_id)
        
        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        
        # Get results
        stmt = stmt.order_by(Subscription.next_billing_date).offset(offset).limit(limit)
        result = await db.execute(stmt)
        subscriptions = result.scalars().all()
        
        return {
            "subscriptions": [
                {
                    "id": s.id,
                    "name": s.name,
                    "type": s.subscription_type.value if s.subscription_type else "other",
                    "client_id": s.client_id,
                    "billing_cycle": s.billing_cycle.value if s.billing_cycle else "yearly",
                    "amount": s.amount,
                    "currency": s.currency,
                    "status": s.status.value if s.status else "active",
                    "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
                    "days_until_renewal": s.days_until_renewal,
                    "auto_renew": s.auto_renew
                }
                for s in subscriptions
            ],
            "total": total
        }
    except Exception as e:
        logger.error(f"Error listing subscriptions: {e}")
        return {"subscriptions": [], "total": 0}


@router.get("/expiring")
async def list_expiring_subscriptions(
    days: int = 30,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List subscriptions expiring within specified days."""
    try:
        cutoff_date = date.today() + timedelta(days=days)
        
        stmt = select(Subscription).where(
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.next_billing_date <= cutoff_date,
            Subscription.next_billing_date >= date.today()
        ).order_by(Subscription.next_billing_date)
        
        result = await db.execute(stmt)
        subscriptions = result.scalars().all()
        
        return {
            "expiring_within_days": days,
            "count": len(subscriptions),
            "subscriptions": [
                {
                    "id": s.id,
                    "name": s.name,
                    "type": s.subscription_type.value if s.subscription_type else "other",
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
async def get_subscription(subscription_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get subscription details."""
    try:
        stmt = select(Subscription).where(Subscription.id == subscription_id)
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        return {
            "id": subscription.id,
            "name": subscription.name,
            "description": subscription.description,
            "type": subscription.subscription_type.value if subscription.subscription_type else "other",
            "client_id": subscription.client_id,
            "project_id": subscription.project_id,
            "billing_cycle": subscription.billing_cycle.value if subscription.billing_cycle else "yearly",
            "amount": subscription.amount,
            "currency": subscription.currency,
            "status": subscription.status.value if subscription.status else "active",
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
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Create a new subscription."""
    try:
        # Verify client exists
        client_stmt = select(Client).where(Client.id == data.client_id)
        client_result = await db.execute(client_stmt)
        client = client_result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Verify project if provided
        if data.project_id:
            project_stmt = select(Project).where(Project.id == data.project_id)
            project_result = await db.execute(project_stmt)
            if not project_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Project not found")
        
        start = data.start_date or date.today()

        if data.package_id:
            package_stmt = select(HostingPackage).where(HostingPackage.id == data.package_id)
            package_result = await db.execute(package_stmt)
            package = package_result.scalar_one_or_none()
            if not package:
                raise HTTPException(status_code=404, detail="Package not found")

            created: list[Subscription] = []

            if data.create_hosting and package.hosting_yearly_price > 0:
                next_billing = calculate_next_billing_date(start, BillingCycle.YEARLY)
                hosting_subscription = Subscription(
                    client_id=data.client_id,
                    project_id=data.project_id,
                    subscription_type=SubscriptionType.HOSTING,
                    name=f"{package.name} Hosting",
                    description=package.description,
                    billing_cycle=BillingCycle.YEARLY,
                    amount=package.hosting_yearly_price,
                    currency=package.currency or data.currency,
                    start_date=start,
                    next_billing_date=next_billing,
                    auto_renew=data.auto_renew,
                    reminder_days=data.reminder_days,
                    provider=data.provider,
                    external_id=data.external_id,
                    status=SubscriptionStatus.ACTIVE
                )
                db.add(hosting_subscription)
                created.append(hosting_subscription)

            if data.create_support and package.support_monthly_price > 0:
                next_billing = calculate_next_billing_date(start, BillingCycle.MONTHLY)
                support_subscription = Subscription(
                    client_id=data.client_id,
                    project_id=data.project_id,
                    subscription_type=SubscriptionType.SUPPORT,
                    name=f"{package.name} Support",
                    description=package.description,
                    billing_cycle=BillingCycle.MONTHLY,
                    amount=package.support_monthly_price,
                    currency=package.currency or data.currency,
                    start_date=start,
                    next_billing_date=next_billing,
                    auto_renew=data.auto_renew,
                    reminder_days=data.reminder_days,
                    provider=data.provider,
                    external_id=data.external_id,
                    status=SubscriptionStatus.ACTIVE
                )
                db.add(support_subscription)
                created.append(support_subscription)

            await db.commit()
            for sub in created:
                await db.refresh(sub)

            return {
                "status": "success",
                "message": f"Created {len(created)} subscription(s)",
                "subscriptions": [
                    {
                        "id": s.id,
                        "name": s.name,
                        "type": s.subscription_type.value if s.subscription_type else "other",
                        "amount": s.amount,
                        "currency": s.currency,
                        "billing_cycle": s.billing_cycle.value if s.billing_cycle else "yearly",
                        "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None
                    }
                    for s in created
                ]
            }

        if not data.subscription_type or not data.name or data.amount is None:
            raise HTTPException(
                status_code=400,
                detail="subscription_type, name, and amount are required when package_id is not provided"
            )

        billing_cycle = data.billing_cycle or BillingCycle.YEARLY
        next_billing = calculate_next_billing_date(start, billing_cycle)

        subscription = Subscription(
            client_id=data.client_id,
            project_id=data.project_id,
            subscription_type=data.subscription_type,
            name=data.name,
            description=data.description,
            billing_cycle=billing_cycle,
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
        await db.commit()
        await db.refresh(subscription)

        return {
            "status": "success",
            "message": "Subscription created successfully",
            "subscription_id": subscription.id,
            "next_billing_date": subscription.next_billing_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{subscription_id}")
async def update_subscription(
    subscription_id: int,
    updates: SubscriptionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Update subscription."""
    try:
        stmt = select(Subscription).where(Subscription.id == subscription_id)
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(subscription, field, value)
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription {subscription.name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{subscription_id}")
async def cancel_subscription(
    subscription_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Cancel a subscription."""
    try:
        stmt = select(Subscription).where(Subscription.id == subscription_id)
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        subscription.status = SubscriptionStatus.CANCELLED
        subscription.cancelled_at = datetime.now()
        subscription.auto_renew = False
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription {subscription.name} cancelled"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error cancelling subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{subscription_id}/renew")
async def renew_subscription(
    subscription_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Manually renew a subscription."""
    try:
        stmt = select(Subscription).where(Subscription.id == subscription_id)
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        # Calculate new billing date from current next_billing_date
        new_billing_date = calculate_next_billing_date(
            subscription.next_billing_date or date.today(),
            subscription.billing_cycle
        )
        
        subscription.next_billing_date = new_billing_date
        subscription.status = SubscriptionStatus.ACTIVE
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Subscription renewed until {new_billing_date.isoformat()}",
            "next_billing_date": new_billing_date.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renewing subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{subscription_id}/invoice")
async def generate_renewal_invoice(
    subscription_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Generate an invoice for subscription renewal."""
    try:
        stmt = select(Subscription).where(Subscription.id == subscription_id).options(joinedload(Subscription.client))
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
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
        await db.flush()
        
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
        # In async mode, we might need to handle invoice.items carefully
        # But for now, adding the item should work if relationship is set up correctly
        
        invoice.calculate_totals()
        
        # Link invoice to subscription
        subscription.last_invoice_id = invoice.id
        subscription.total_invoiced += invoice.total
        
        await db.commit()
        
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
        await db.rollback()
        logger.error(f"Error generating invoice for subscription {subscription_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_subscription_stats(db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get subscription statistics."""
    try:
        stmt = select(Subscription).where(Subscription.status == SubscriptionStatus.ACTIVE)
        result = await db.execute(stmt)
        all_subs = result.scalars().all()
        
        # Calculate by type
        by_type = {}
        for sub in all_subs:
            type_key = sub.subscription_type.value if sub.subscription_type else "other"
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

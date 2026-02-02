"""
Expiry check tasks for domains and SSL certificates.

Runs daily to check for expiring items and send notifications.
"""
from celery import shared_task
from datetime import date, timedelta
from typing import List, Dict, Any

from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


@shared_task(name="check_expiring_domains_ssl")
def check_expiring_domains_ssl():
    """
    Check for domains and SSL certificates expiring soon.
    Sends notifications for items within their reminder_days threshold.
    
    This task should be scheduled to run daily via Celery Beat.
    """
    from ..db.sync_session import get_sync_session
    from ..db.models.domain import Domain
    from ..db.models.ssl_certificate import SSLCertificate
    from ..services.notification_service import NotificationService
    from sqlalchemy import select
    from datetime import datetime
    
    logger.info("Starting expiry check for domains and SSL certificates")
    
    notifications_sent = 0
    errors = []
    
    try:
        with get_sync_session() as db:
            today = date.today()
            
            # Check domains
            domains = db.execute(
                select(Domain).where(Domain.status != 'expired')
            ).scalars().all()
            
            for domain in domains:
                try:
                    if domain.is_expiring_soon:
                        # Check if we already sent a reminder recently
                        should_notify = True
                        if domain.last_reminder_sent:
                            days_since_reminder = (datetime.utcnow() - domain.last_reminder_sent).days
                            # Don't spam - wait at least 7 days between reminders
                            should_notify = days_since_reminder >= 7
                        
                        if should_notify:
                            # Send notification
                            NotificationService.send_expiry_alert(
                                item_type="domain",
                                item_name=domain.domain_name,
                                expiry_date=domain.expiry_date,
                                days_left=domain.days_until_expiry
                            )
                            
                            # Update last reminder sent
                            domain.last_reminder_sent = datetime.utcnow()
                            notifications_sent += 1
                            
                            logger.info(f"Sent expiry alert for domain: {domain.domain_name}")
                except Exception as e:
                    errors.append(f"Domain {domain.domain_name}: {str(e)}")
            
            # Check SSL certificates
            certificates = db.execute(
                select(SSLCertificate).where(SSLCertificate.is_active == True)
            ).scalars().all()
            
            for cert in certificates:
                try:
                    if cert.is_expiring_soon:
                        should_notify = True
                        if cert.last_reminder_sent:
                            days_since_reminder = (datetime.utcnow() - cert.last_reminder_sent).days
                            should_notify = days_since_reminder >= 3  # SSL is more urgent
                        
                        if should_notify:
                            NotificationService.send_expiry_alert(
                                item_type="ssl",
                                item_name=cert.common_name,
                                expiry_date=cert.expiry_date,
                                days_left=cert.days_until_expiry
                            )
                            
                            cert.last_reminder_sent = datetime.utcnow()
                            notifications_sent += 1
                            
                            logger.info(f"Sent expiry alert for SSL: {cert.common_name}")
                except Exception as e:
                    errors.append(f"SSL {cert.common_name}: {str(e)}")
            
            db.commit()
            
    except Exception as e:
        logger.error(f"Error in expiry check task: {e}")
        errors.append(str(e))
    
    logger.info(f"Expiry check complete. Notifications sent: {notifications_sent}, Errors: {len(errors)}")
    
    return {
        "notifications_sent": notifications_sent,
        "errors": errors
    }


@shared_task(name="get_expiry_summary")
def get_expiry_summary(days: int = 30) -> Dict[str, Any]:
    """
    Get a summary of items expiring within the specified days.
    Useful for dashboard widgets.
    """
    from ..db.sync_session import get_sync_session
    from ..db.models.domain import Domain
    from ..db.models.ssl_certificate import SSLCertificate
    from sqlalchemy import select
    
    threshold = date.today() + timedelta(days=days)
    
    result = {
        "domains": [],
        "ssl_certificates": [],
        "total_expiring": 0
    }
    
    try:
        with get_sync_session() as db:
            # Expiring domains
            domains = db.execute(
                select(Domain).where(Domain.expiry_date <= threshold)
            ).scalars().all()
            
            for d in domains:
                result["domains"].append({
                    "id": d.id,
                    "name": d.domain_name,
                    "expiry_date": d.expiry_date.isoformat(),
                    "days_left": d.days_until_expiry,
                    "auto_renew": d.auto_renew
                })
            
            # Expiring SSL
            certificates = db.execute(
                select(SSLCertificate).where(SSLCertificate.expiry_date <= threshold)
            ).scalars().all()
            
            for s in certificates:
                result["ssl_certificates"].append({
                    "id": s.id,
                    "common_name": s.common_name,
                    "expiry_date": s.expiry_date.isoformat(),
                    "days_left": s.days_until_expiry,
                    "auto_renew": s.auto_renew
                })
            
            result["total_expiring"] = len(result["domains"]) + len(result["ssl_certificates"])
            
    except Exception as e:
        logger.error(f"Error getting expiry summary: {e}")
    
    return result


# ============================================================================
# WHOIS Sync Tasks
# ============================================================================

@shared_task(name="forge.tasks.expiry_tasks.sync_domain_whois")
def sync_domain_whois():
    """
    Sync WHOIS data for all active domains.
    Updates expiry dates, registrars, and nameservers.
    """
    logger.info("Starting automatic domain WHOIS sync")
    return run_async(_sync_domain_whois())


async def _sync_domain_whois():
    """Async worker for domain sync."""
    from ..db import AsyncSessionLocal
    from ..services.domain_service import DomainService
    from ..db.models.domain import Domain
    from sqlalchemy import select
    
    async with AsyncSessionLocal() as db:
        service = DomainService(db)
        
        # Get all domains
        result = await db.execute(select(Domain))
        domains = result.scalars().all()
        
        synced = 0
        failed = 0
        
        for domain in domains:
            try:
                # We reuse the same service/session
                await service.fetch_whois(domain.id)
                synced += 1
            except Exception as e:
                logger.error(f"Failed to sync domain {domain.domain_name}: {e}")
                failed += 1
                
        return {"synced": synced, "failed": failed}

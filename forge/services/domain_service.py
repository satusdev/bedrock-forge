"""
Domain Service for managing domain registrations and WHOIS tracking.
"""
import logging
import json
from datetime import datetime, date, timezone
from urllib.parse import urlparse
from typing import Optional, List
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models.domain import Domain, DomainStatus
from ..db.models.client import Client

try:
    import whois
    WHOIS_AVAILABLE = True
except ImportError:
    whois = None
    WHOIS_AVAILABLE = False

logger = logging.getLogger(__name__)


class DomainService:
    """Service for managing domains and syncing WHOIS data."""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    def extract_domain_from_url(self, url: str) -> Optional[str]:
        """Extract root domain from URL."""
        try:
            parsed = urlparse(url if "://" in url else f"http://{url}")
            hostname = parsed.hostname
            if not hostname:
                return None
                
            # Naive TLD stripping, good enough for most standard cases
            # Ideally use tldextract for robust handling
            parts = hostname.split('.')
            if len(parts) >= 2:
                return ".".join(parts[-2:])
            return hostname
        except Exception:
            return None

    async def sync_domain_from_url(
        self,
        url: str,
        client_id: int,
        project_id: Optional[int] = None,
        check_whois: bool = True
    ) -> Optional[Domain]:
        """
        Ensure domain exists in DB from a URL.
        If it doesn't exist, create it.
        If check_whois is True, queue a WHOIS check.
        """
        domain_name = self.extract_domain_from_url(url)
        if not domain_name:
            return None
            
        # Check if exists
        result = await self.session.execute(
            select(Domain).where(Domain.domain_name == domain_name)
        )
        domain = result.scalar_one_or_none()
        
        if not domain:
            tld = domain_name.split('.')[-1]
            domain = Domain(
                domain_name=domain_name,
                tld=tld,
                client_id=client_id,
                project_id=project_id,
                expiry_date=date.today(), # Placeholder until WHOIS
                status=DomainStatus.ACTIVE
            )
            self.session.add(domain)
            await self.session.commit()
            await self.session.refresh(domain)
            
        if check_whois:
            try:
                await self.fetch_whois(domain.id)
            except Exception as e:
                logger.error(f"Immediate WHOIS fetch failed for {domain.domain_name}: {e}")
            
        return domain

    async def fetch_whois(
        self,
        domain_id: int,
        force: bool = False,
        raise_on_error: bool = False,
    ) -> Optional[Domain]:
        """Fetch WHOIS data for a domain."""
        result = await self.session.execute(
            select(Domain).where(Domain.id == domain_id)
        )
        domain = result.scalar_one_or_none()
        if not domain:
            return None

        if not WHOIS_AVAILABLE:
            msg = "WHOIS lookup unavailable: python-whois is not installed."
            logger.warning(msg)
            if force or raise_on_error:
                raise RuntimeError(msg)
            return domain

        import asyncio
        
        try:
            # Sync call, run in executor to avoid blocking
            loop = asyncio.get_running_loop()
            w = await loop.run_in_executor(None, lambda: whois.whois(domain.domain_name))
            
            if w.expiration_date:
                 # Handle list of dates (common with some registrars)
                exp = w.expiration_date
                if isinstance(exp, list):
                    exp = exp[0]
                if isinstance(exp, datetime):
                    domain.expiry_date = exp.date()
            
            if w.creation_date:
                creat = w.creation_date
                if isinstance(creat, list):
                    creat = creat[0]
                if isinstance(creat, datetime):
                    domain.registration_date = creat.date()
                    
            if w.registrar:
                domain.registrar_name = str(w.registrar)
                
            if w.name_servers:
                domain.nameservers = json.dumps(w.name_servers)
                
            domain.whois_data = str(w)
            domain.last_whois_check = datetime.now(timezone.utc)
            
            self.session.add(domain)
            await self.session.commit()
            
        except Exception as e:
            logger.error(f"WHOIS lookup failed for {domain.domain_name}: {e}")
            if force or raise_on_error:
                raise
            
        return domain

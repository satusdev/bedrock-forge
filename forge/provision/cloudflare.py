from cloudflare import Cloudflare
from ..utils.errors import ForgeError
from ..utils.logging import logger

def validate_domain(domain: str, cloudflare_token: str, dry_run: bool, verbose: bool) -> bool:
    """Validate domain ownership in Cloudflare."""
    if dry_run:
        logger.info(f"Dry run: Would validate domain {domain} in Cloudflare")
        return True
    
    try:
        client = Cloudflare(api_token=cloudflare_token)
        zones = client.zones.get(params={"name": domain})
        if not zones:
            raise ForgeError(f"Domain {domain} not found in Cloudflare account")
        if verbose:
            logger.info(f"Validated domain {domain}")
        return True
    except Exception as e:
        raise ForgeError(f"Failed to validate domain {domain}: {str(e)}")

def configure_cloudflare_domain(domain: str, server_ip: str, cloudflare_token: str, dry_run: bool, verbose: bool) -> None:
    """Configure Cloudflare DNS and SSL for the domain."""
    if verbose:
        logger.info(f"Configuring Cloudflare for domain {domain}")
    
    if dry_run:
        logger.info(f"Dry run: Would configure Cloudflare DNS and SSL for {domain} with IP {server_ip}")
        return
    
    try:
        client = Cloudflare(api_token=cloudflare_token)
        zones = client.zones.get(params={"name": domain})
        if not zones:
            raise ForgeError(f"Domain {domain} not found in Cloudflare account")
        zone_id = zones[0]["id"]
        
        # Check for existing A record
        dns_records = client.dns.records.get(zone_id)
        existing_record = next((r for r in dns_records if r["name"] == domain and r["type"] == "A"), None)
        if existing_record:
            client.dns.records.update(
                dns_record_id=existing_record["id"],
                zone_id=zone_id,
                type="A",
                name=domain,
                content=server_ip,
                ttl=120,
                proxied=False
            )
        else:
            client.dns.records.create(
                zone_id=zone_id,
                type="A",
                name=domain,
                content=server_ip,
                ttl=120,
                proxied=False
            )
        
        # Configure SSL
        client.zones.settings.ssl.edit(zone_id=zone_id, value="flexible")
        if verbose:
            logger.info(f"Configured A record for {domain} to {server_ip} and enabled Flexible SSL")
    except Exception as e:
        raise ForgeError(f"Failed to configure Cloudflare DNS for {domain}: {str(e)}")
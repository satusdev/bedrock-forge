import asyncio
import logging
from typing import Dict, List, Optional
from datetime import datetime
from ..utils.shell import run_shell
from ..utils.ssh import SSHConnection

logger = logging.getLogger(__name__)

class ServiceHealer:
    """
    Self-healing system for checking and recovering services.
    """
    
    def __init__(self, connection: Optional[SSHConnection] = None):
        self.connection = connection

    async def check_service_status(self, service_name: str) -> bool:
        """Check if a systemd service is active."""
        cmd = f"systemctl is-active {service_name}"
        if self.connection:
            result = self.connection.run(cmd, warn=True)
            return result.stdout.strip() == "active"
        else:
            # Local check (or via ddev if applicable, but usually services are on server)
            # Assuming local for this context implies checking local dev environment or mapped server
            result = run_shell(cmd)
            return result.strip() == "active"

    async def restart_service(self, service_name: str) -> bool:
        """Restart a systemd service."""
        logger.info(f"Attempting to restart service: {service_name}")
        cmd = f"sudo systemctl restart {service_name}"
        try:
            if self.connection:
                self.connection.run(cmd)
            else:
                run_shell(cmd)
            
            # Verify it came back up
            if await self.check_service_status(service_name):
                logger.info(f"Service {service_name} successfully restarted.")
                return True
            else:
                logger.error(f"Failed to restart service {service_name}.")
                return False
        except Exception as e:
            logger.error(f"Error restarting service {service_name}: {e}")
            return False

    async def heal_services(self, services: List[str] = ["nginx", "php8.2-fpm", "mysql", "redis-server"]):
        """Check list of services and restart if down."""
        report = {}
        for service in services:
            is_active = await self.check_service_status(service)
            if not is_active:
                logger.warning(f"Service {service} is DOWN. Initiating healing...")
                recovered = await self.restart_service(service)
                report[service] = "Recovered" if recovered else "Failed to Recover"
            else:
                report[service] = "Healthy"
        return report

    async def check_disk_space(self, threshold_percent: int = 90) -> Optional[str]:
        """Check disk usage and return warning if above threshold."""
        cmd = "df -h / | tail -1 | awk '{print $5}'"
        # Output example: 45%
        try:
            if self.connection:
                output = self.connection.run(cmd).stdout.strip()
            else:
                output = run_shell(cmd).strip()
            
            usage = int(output.rstrip('%'))
            if usage > threshold_percent:
                return f"Disk usage is high: {usage}%"
        except Exception as e:
            logger.error(f"Failed to check disk space: {e}")
        return None

    async def clear_logs(self):
        """Clear old logs if disk space is critical (Simple implementation)."""
        # This is a drastic measure, usually we'd rotate.
        # Just creating the hook for now.
        pass

async def run_healing_routine(connection: Optional[SSHConnection] = None):
    healer = ServiceHealer(connection)
    logger.info("Starting self-healing routine...")
    report = await healer.heal_services()
    
    disk_warning = await healer.check_disk_space()
    if disk_warning:
        report['disk'] = disk_warning
        # POTENTIAL: Trigger cleanup if disk is full
    
    return report

"""
Server health monitoring tasks for Celery.

Background tasks for server ping, SSH connectivity, and resource monitoring.
"""
from datetime import datetime
from typing import Optional
import asyncio
import subprocess
import socket

from celery import shared_task

from ..db import AsyncSessionLocal, Server
from ..db.models.server import ServerStatus
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


def ping_host(hostname: str, count: int = 3, timeout: int = 5) -> dict:
    """
    Ping a host and return results.
    
    Returns:
        dict with keys: success, avg_ms, packet_loss
    """
    try:
        # Use ping command (works on Linux)
        result = subprocess.run(
            ["ping", "-c", str(count), "-W", str(timeout), hostname],
            capture_output=True,
            text=True,
            timeout=timeout * count + 5
        )
        
        if result.returncode == 0:
            # Parse average ping time from output
            # Example line: rtt min/avg/max/mdev = 0.123/0.456/0.789/0.111 ms
            lines = result.stdout.split('\n')
            for line in lines:
                if 'avg' in line.lower() and '/' in line:
                    parts = line.split('=')[-1].strip().split('/')
                    if len(parts) >= 2:
                        avg_ms = float(parts[1])
                        return {
                            "success": True,
                            "avg_ms": round(avg_ms, 2),
                            "packet_loss": 0.0
                        }
            
            # Fallback if parsing fails
            return {"success": True, "avg_ms": None, "packet_loss": 0.0}
        else:
            return {"success": False, "avg_ms": None, "packet_loss": 100.0}
            
    except subprocess.TimeoutExpired:
        return {"success": False, "avg_ms": None, "packet_loss": 100.0, "error": "Ping timeout"}
    except Exception as e:
        logger.error(f"Ping error for {hostname}: {e}")
        return {"success": False, "avg_ms": None, "packet_loss": 100.0, "error": str(e)}


def check_ssh_port(hostname: str, port: int = 22, timeout: int = 10) -> dict:
    """
    Check if SSH port is open on the host.
    
    Returns:
        dict with keys: success, response_time_ms
    """
    try:
        start_time = datetime.now()
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        
        result = sock.connect_ex((hostname, port))
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        
        sock.close()
        
        if result == 0:
            return {
                "success": True,
                "response_time_ms": round(response_time, 2),
                "port": port
            }
        else:
            return {
                "success": False,
                "response_time_ms": None,
                "port": port,
                "error": f"Port {port} closed"
            }
            
    except socket.timeout:
        return {"success": False, "response_time_ms": None, "error": "Connection timeout"}
    except socket.gaierror as e:
        return {"success": False, "response_time_ms": None, "error": f"DNS resolution failed: {e}"}
    except Exception as e:
        logger.error(f"SSH port check error for {hostname}:{port}: {e}")
        return {"success": False, "response_time_ms": None, "error": str(e)}


async def _check_server_health(server_id: int) -> dict:
    """Check server via ping and SSH port connectivity."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        
        result = await db.execute(select(Server).where(Server.id == server_id))
        server = result.scalar_one_or_none()
        
        if not server:
            return {"success": False, "error": "Server not found"}
        
        hostname = server.hostname
        ssh_port = server.ssh_port
        
        # Run ping check
        ping_result = ping_host(hostname)
        
        # Run SSH port check
        ssh_result = check_ssh_port(hostname, ssh_port)
        
        # Determine overall status
        if ping_result["success"] and ssh_result["success"]:
            new_status = ServerStatus.ONLINE
        elif ping_result["success"]:
            new_status = ServerStatus.MAINTENANCE  # Server responds to ping but SSH is down
        else:
            new_status = ServerStatus.OFFLINE
        
        # Update server record
        server.status = new_status
        server.last_health_check = datetime.utcnow()
        
        await db.commit()
        
        logger.info(
            f"Server {server.name} health check: ping={ping_result['success']}, "
            f"ssh={ssh_result['success']}, status={new_status.value}"
        )
        
        return {
            "server_id": server_id,
            "server_name": server.name,
            "hostname": hostname,
            "ping": ping_result,
            "ssh": ssh_result,
            "status": new_status.value,
            "checked_at": datetime.utcnow().isoformat()
        }


@shared_task
def check_server_health(server_id: int):
    """Check a single server's health (Celery task)."""
    return run_async(_check_server_health(server_id))


async def _run_all_server_health_checks():
    """Check all servers' health."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        
        result = await db.execute(select(Server))
        servers = result.scalars().all()
        
        results = []
        for server in servers:
            try:
                check_result = await _check_server_health(server.id)
                results.append(check_result)
            except Exception as e:
                logger.error(f"Health check failed for server {server.id}: {e}")
                results.append({
                    "server_id": server.id,
                    "server_name": server.name,
                    "success": False,
                    "error": str(e)
                })
        
        return results


@shared_task
def run_all_server_health_checks():
    """Run health checks for all servers (Celery task, scheduled by Beat)."""
    logger.info("Starting server health checks for all servers")
    results = run_async(_run_all_server_health_checks())
    
    # Log summary
    online_count = sum(1 for r in results if r.get("status") == "online")
    offline_count = sum(1 for r in results if r.get("status") == "offline")
    
    logger.info(f"Server health check complete: {online_count} online, {offline_count} offline")
    
    return {
        "checked": len(results),
        "online": online_count,
        "offline": offline_count,
        "results": results
    }


# ============================================================================
# CyberPanel Health Check
# ============================================================================

def check_panel_url(url: str, timeout: int = 10) -> dict:
    """
    Check if a control panel URL is accessible.
    
    Returns:
        dict with keys: success, status_code, response_time_ms
    """
    import urllib.request
    import ssl
    
    try:
        start_time = datetime.now()
        
        # Create SSL context that ignores certificate errors (common for panel URLs)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url, method='HEAD')
        req.add_header('User-Agent', 'BedrockForge/1.0 HealthCheck')
        
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as response:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            return {
                "success": True,
                "status_code": response.getcode(),
                "response_time_ms": round(response_time, 2)
            }
            
    except urllib.error.HTTPError as e:
        # HTTP errors (4xx, 5xx) still mean the server is responding
        return {
            "success": True,
            "status_code": e.code,
            "response_time_ms": None,
            "note": "HTTP error but server is responding"
        }
    except urllib.error.URLError as e:
        return {
            "success": False,
            "status_code": None,
            "response_time_ms": None,
            "error": str(e.reason)
        }
    except Exception as e:
        return {
            "success": False,
            "status_code": None,
            "response_time_ms": None,
            "error": str(e)
        }


async def _check_panel_health(server_id: int) -> dict:
    """Check if the server's control panel is accessible."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        
        result = await db.execute(select(Server).where(Server.id == server_id))
        server = result.scalar_one_or_none()
        
        if not server:
            return {"success": False, "error": "Server not found"}
        
        if not server.panel_url:
            return {"success": False, "error": "No panel URL configured"}
        
        panel_result = check_panel_url(server.panel_url)
        
        # Update panel verification status
        server.panel_verified = panel_result["success"]
        await db.commit()
        
        return {
            "server_id": server_id,
            "server_name": server.name,
            "panel_url": server.panel_url,
            "panel_type": server.panel_type.value if server.panel_type else None,
            **panel_result
        }


@shared_task
def check_panel_health(server_id: int):
    """Check a server's control panel health (Celery task)."""
    return run_async(_check_panel_health(server_id))

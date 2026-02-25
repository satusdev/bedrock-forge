"""
Server health monitoring tasks for Celery.

Background tasks for server ping, SSH connectivity, and resource monitoring.
"""
from datetime import datetime
from typing import Optional
import asyncio
import subprocess
import socket
import os
import requests

from celery import shared_task

from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


def _nest_api_base() -> str:
    base_url = (os.getenv("NEST_API_URL") or "http://localhost:8100").rstrip("/")
    api_prefix = (os.getenv("NEST_API_PREFIX") or "/api/v1").strip()
    if not api_prefix.startswith("/"):
        api_prefix = f"/{api_prefix}"
    api_prefix = api_prefix.rstrip("/")
    return f"{base_url}{api_prefix}"


def _get_server(server_id: int) -> Optional[dict]:
    response = requests.get(f"{_nest_api_base()}/servers/{server_id}", timeout=5)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _list_servers(limit: int = 100) -> list[dict]:
    rows: list[dict] = []
    skip = 0

    while True:
        response = requests.get(
            f"{_nest_api_base()}/servers",
            params={"skip": skip, "limit": limit},
            timeout=5,
        )
        response.raise_for_status()
        batch = response.json() or []
        rows.extend(batch)
        if len(batch) < limit:
            break
        skip += limit

    return rows


def _trigger_server_health(server_id: int) -> None:
    try:
        requests.post(
            f"{_nest_api_base()}/servers/{server_id}/health/trigger",
            timeout=5,
        ).raise_for_status()
    except Exception as e:
        logger.warning(f"Health trigger failed for server {server_id}: {e}")


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
    server = _get_server(server_id)
    if not server:
        return {"success": False, "error": "Server not found"}

    hostname = server.get("hostname")
    ssh_port = int(server.get("ssh_port") or 22)
    server_name = server.get("name") or f"server-{server_id}"

    ping_result = ping_host(hostname)
    ssh_result = check_ssh_port(hostname, ssh_port)

    if ping_result["success"] and ssh_result["success"]:
        status = "online"
    elif ping_result["success"]:
        status = "maintenance"
    else:
        status = "offline"

    _trigger_server_health(server_id)

    logger.info(
        f"Server {server_name} health check: ping={ping_result['success']}, "
        f"ssh={ssh_result['success']}, status={status}"
    )

    return {
        "server_id": server_id,
        "server_name": server_name,
        "hostname": hostname,
        "ping": ping_result,
        "ssh": ssh_result,
        "status": status,
        "checked_at": datetime.utcnow().isoformat()
    }


@shared_task
def check_server_health(server_id: int):
    """Check a single server's health (Celery task)."""
    return run_async(_check_server_health(server_id))


async def _run_all_server_health_checks():
    """Check all servers' health."""
    servers = _list_servers(limit=100)

    results = []
    for server in servers:
        server_id = int(server.get("id"))
        server_name = server.get("name") or f"server-{server_id}"
        try:
            check_result = await _check_server_health(server_id)
            results.append(check_result)
        except Exception as e:
            logger.error(f"Health check failed for server {server_id}: {e}")
            results.append({
                "server_id": server_id,
                "server_name": server_name,
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
    server = _get_server(server_id)
    if not server:
        return {"success": False, "error": "Server not found"}

    panel_url = server.get("panel_url")
    if not panel_url:
        return {"success": False, "error": "No panel URL configured"}

    panel_result = check_panel_url(panel_url)

    return {
        "server_id": server_id,
        "server_name": server.get("name") or f"server-{server_id}",
        "panel_url": panel_url,
        "panel_type": server.get("panel_type"),
        **panel_result
    }


@shared_task
def check_panel_health(server_id: int):
    """Check a server's control panel health (Celery task)."""
    return run_async(_check_panel_health(server_id))

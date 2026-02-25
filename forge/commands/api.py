"""
API command for Bedrock Forge.

This module provides commands to start and manage the REST API server.
"""

import typer
import subprocess
import sys
from pathlib import Path
from typing import Optional

app = typer.Typer(help="Manage Bedrock Forge REST API server")

@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind to"),
    port: int = typer.Option(8000, "--port", help="Port to bind to"),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload"),
    log_level: str = typer.Option("info", "--log-level", help="Log level"),
    daemon: bool = typer.Option(False, "--daemon", help="Run as daemon")
):
    """Start the REST API server."""
    from ..utils.logging import logger

    try:
        typer.echo("ℹ️ API runtime is NestJS; use Docker Compose services.")
        if daemon:
            # Run as daemon (background process)
            cmd = [
                "docker", "compose", "up", "-d", "api"
            ]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            logger.info(f"API service start command launched (PID: {process.pid})")
            typer.echo(f"✅ API server running on http://{host}:{port}")
            typer.echo(f"📚 API docs: http://{host}:{port}/api/v1/docs")
        else:
            typer.echo("🚀 Starting Nest API service with Docker Compose")
            typer.echo("Press Ctrl+C to stop attached logs")
            subprocess.run(["docker", "compose", "up", "-d", "api"], check=True)
            subprocess.run(["docker", "compose", "logs", "-f", "api"], check=True)

    except KeyboardInterrupt:
        typer.echo("\n👋 API server stopped")
    except Exception as e:
        logger.error(f"Failed to start API server: {e}")
        typer.echo(f"❌ Failed to start API server: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def status():
    """Check API server status."""
    import requests

    try:
        response = requests.get("http://127.0.0.1:8000/api/v1/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            typer.echo(f"✅ API server is healthy")
            typer.echo(f"   Service: {data.get('service', 'unknown')}")
            typer.echo(f"   Version: {data.get('version', 'unknown')}")
        else:
            typer.echo(f"❌ API server responded with status {response.status_code}")
    except requests.exceptions.ConnectionError:
        typer.echo("❌ API server is not running or not accessible")
    except Exception as e:
        typer.echo(f"❌ Error checking API status: {e}")

@app.command()
def docs():
    """Open API documentation in browser."""
    import webbrowser

    try:
        webbrowser.open("http://127.0.0.1:8000/api/v1/docs")
        typer.echo("📖 Opening API documentation in browser...")
    except Exception as e:
        typer.echo(f"❌ Failed to open browser: {e}")
        typer.echo("📖 API docs are available at: http://127.0.0.1:8000/api/v1/docs")

if __name__ == "__main__":
    app()
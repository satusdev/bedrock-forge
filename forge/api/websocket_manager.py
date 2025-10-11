"""
WebSocket manager for real-time dashboard updates.
"""

import asyncio
import json
from typing import Dict, List, Set
from datetime import datetime
import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.project_subscribers: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Connect a new WebSocket client."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WebSocket client connected: {client_id}")

        # Send initial connection confirmation
        await self.send_personal_message({
            "type": "connection",
            "status": "connected",
            "client_id": client_id,
            "timestamp": datetime.utcnow().isoformat()
        }, client_id)

    def disconnect(self, client_id: str):
        """Disconnect a WebSocket client."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]

        # Remove from all project subscriptions
        for project_name in list(self.project_subscribers.keys()):
            if client_id in self.project_subscribers[project_name]:
                self.project_subscribers[project_name].remove(client_id)
                if not self.project_subscribers[project_name]:
                    del self.project_subscribers[project_name]

        logger.info(f"WebSocket client disconnected: {client_id}")

    async def send_personal_message(self, message: dict, client_id: str):
        """Send a message to a specific client."""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                self.disconnect(client_id)

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        disconnected_clients = []
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {e}")
                disconnected_clients.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)

    async def send_project_update(self, project_name: str, update_data: dict):
        """Send project-specific updates to subscribed clients."""
        if project_name not in self.project_subscribers:
            return

        message = {
            "type": "project_update",
            "project_name": project_name,
            "data": update_data,
            "timestamp": datetime.utcnow().isoformat()
        }

        disconnected_clients = []
        for client_id in self.project_subscribers[project_name]:
            try:
                websocket = self.active_connections[client_id]
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending project update to {client_id}: {e}")
                disconnected_clients.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)

    def subscribe_to_project(self, client_id: str, project_name: str):
        """Subscribe a client to project-specific updates."""
        if project_name not in self.project_subscribers:
            self.project_subscribers[project_name] = set()
        self.project_subscribers[project_name].add(client_id)
        logger.info(f"Client {client_id} subscribed to project {project_name}")

    def unsubscribe_from_project(self, client_id: str, project_name: str):
        """Unsubscribe a client from project-specific updates."""
        if project_name in self.project_subscribers:
            self.project_subscribers[project_name].discard(client_id)
            if not self.project_subscribers[project_name]:
                del self.project_subscribers[project_name]
        logger.info(f"Client {client_id} unsubscribed from project {project_name}")


# Global connection manager instance
manager = ConnectionManager()
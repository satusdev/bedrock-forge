"""
WebSocket API routes.

This module contains WebSocket endpoints for real-time dashboard updates.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime
import json

from ....utils.logging import logger
from ...websocket_manager import manager

router = APIRouter()


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "subscribe_project":
                project_name = message.get("project_name")
                if project_name:
                    manager.subscribe_to_project(client_id, project_name)
                    await manager.send_personal_message({
                        "type": "subscription_confirmed",
                        "project_name": project_name,
                        "status": "subscribed"
                    }, client_id)

            elif message.get("type") == "unsubscribe_project":
                project_name = message.get("project_name")
                if project_name:
                    manager.unsubscribe_from_project(client_id, project_name)
                    await manager.send_personal_message({
                        "type": "unsubscription_confirmed",
                        "project_name": project_name,
                        "status": "unsubscribed"
                    }, client_id)

            elif message.get("type") == "ping":
                await manager.send_personal_message({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat()
                }, client_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"WebSocket client {client_id} disconnected")


async def notify_project_update(project_name: str, update_type: str, data: dict):
    """Send project update to all subscribed clients."""
    await manager.send_project_update(project_name, {
        "type": update_type,
        "data": data
    })


async def broadcast_dashboard_update(update_type: str, data: dict):
    """Broadcast dashboard update to all connected clients."""
    await manager.broadcast({
        "type": update_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    })

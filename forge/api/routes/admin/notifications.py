"""
Notification channels API routes.

Manages notification channels (Slack, Email, etc.) for alerts.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import json

from ....utils.logging import logger
from ....db import get_db
from ....db.models import User
from ....db.models.notification_channel import NotificationChannel, ChannelType
from ...deps import get_current_user
from ....services.notification_service import notification_service

router = APIRouter()


# Pydantic models
class NotificationChannelCreate(BaseModel):
    name: str
    channel_type: ChannelType
    config: Dict[str, Any]
    is_active: bool = True


class NotificationChannelUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class TestNotificationRequest(BaseModel):
    channel_id: Optional[int] = None
    # For testing without saving
    channel_type: Optional[ChannelType] = None
    config: Optional[Dict[str, Any]] = None


@router.get("/")
async def list_notification_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all notification channels for the current user."""
    try:
        query = db.query(NotificationChannel).filter(
            NotificationChannel.owner_id == current_user.id
        )
        channels = query.order_by(NotificationChannel.created_at.desc()).all()
        
        return {
            "channels": [
                {
                    "id": ch.id,
                    "name": ch.name,
                    "channel_type": ch.channel_type.value,
                    "config": json.loads(ch.config) if ch.config else {},
                    "is_active": ch.is_active,
                    "last_sent_at": ch.last_sent_at.isoformat() if ch.last_sent_at else None,
                    "last_error": ch.last_error,
                    "created_at": ch.created_at.isoformat() if ch.created_at else None
                }
                for ch in channels
            ],
            "total": len(channels)
        }
    except Exception as e:
        logger.error(f"Error listing notification channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{channel_id}")
async def get_notification_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific notification channel."""
    try:
        channel = db.query(NotificationChannel).filter(
            NotificationChannel.id == channel_id,
            NotificationChannel.owner_id == current_user.id
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        # Mask sensitive config values
        config = json.loads(channel.config) if channel.config else {}
        masked_config = mask_sensitive_config(config, channel.channel_type)
        
        return {
            "id": channel.id,
            "name": channel.name,
            "channel_type": channel.channel_type.value,
            "config": masked_config,
            "is_active": channel.is_active,
            "last_sent_at": channel.last_sent_at.isoformat() if channel.last_sent_at else None,
            "last_error": channel.last_error,
            "created_at": channel.created_at.isoformat() if channel.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting notification channel {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_notification_channel(
    channel_data: NotificationChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new notification channel."""
    try:
        # Validate config based on channel type
        validate_channel_config(channel_data.channel_type, channel_data.config)
        
        channel = NotificationChannel(
            name=channel_data.name,
            channel_type=channel_data.channel_type,
            config=json.dumps(channel_data.config),
            is_active=channel_data.is_active,
            owner_id=current_user.id
        )
        
        db.add(channel)
        db.commit()
        db.refresh(channel)
        
        return {
            "status": "success",
            "message": "Notification channel created",
            "channel_id": channel.id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating notification channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{channel_id}")
async def update_notification_channel(
    channel_id: int,
    updates: NotificationChannelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a notification channel."""
    try:
        channel = db.query(NotificationChannel).filter(
            NotificationChannel.id == channel_id,
            NotificationChannel.owner_id == current_user.id
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        if updates.name is not None:
            channel.name = updates.name
        
        if updates.config is not None:
            validate_channel_config(channel.channel_type, updates.config)
            channel.config = json.dumps(updates.config)
        
        if updates.is_active is not None:
            channel.is_active = updates.is_active
        
        db.commit()
        
        return {
            "status": "success",
            "message": "Notification channel updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating notification channel {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{channel_id}")
async def delete_notification_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a notification channel."""
    try:
        channel = db.query(NotificationChannel).filter(
            NotificationChannel.id == channel_id,
            NotificationChannel.owner_id == current_user.id
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        db.delete(channel)
        db.commit()
        
        return {
            "status": "success",
            "message": "Notification channel deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting notification channel {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test")
async def test_notification(
    request: TestNotificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Test a notification channel."""
    try:
        if request.channel_id:
            # Test existing channel
            channel = db.query(NotificationChannel).filter(
                NotificationChannel.id == request.channel_id,
                NotificationChannel.owner_id == current_user.id
            ).first()
            
            if not channel:
                raise HTTPException(status_code=404, detail="Channel not found")
        else:
            # Test with provided config without saving
            if not request.channel_type or not request.config:
                raise HTTPException(
                    status_code=400, 
                    detail="Either channel_id or both channel_type and config required"
                )
            
            validate_channel_config(request.channel_type, request.config)
            
            # Create temporary channel object for testing
            channel = NotificationChannel(
                name="Test Channel",
                channel_type=request.channel_type,
                config=json.dumps(request.config),
                is_active=True,
                owner_id=current_user.id
            )
        
        # Send test notification
        success = await notification_service.send(
            channel=channel,
            title="Bedrock Forge Test Notification",
            message="This is a test notification from Bedrock Forge. If you received this, your notification channel is configured correctly!",
            level="info"
        )
        
        if success:
            return {
                "status": "success",
                "message": "Test notification sent successfully"
            }
        else:
            return {
                "status": "error",
                "message": "Failed to send test notification. Check the channel configuration."
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def validate_channel_config(channel_type: ChannelType, config: Dict[str, Any]):
    """Validate channel configuration based on type."""
    if channel_type == ChannelType.SLACK:
        if "webhook_url" not in config:
            raise HTTPException(
                status_code=400,
                detail="Slack channel requires webhook_url in config"
            )
        if not config["webhook_url"].startswith("https://hooks.slack.com/"):
            raise HTTPException(
                status_code=400,
                detail="Invalid Slack webhook URL"
            )
    
    elif channel_type == ChannelType.EMAIL:
        if "to" not in config:
            raise HTTPException(
                status_code=400,
                detail="Email channel requires 'to' address in config"
            )
    
    elif channel_type == ChannelType.TELEGRAM:
        if "bot_token" not in config or "chat_id" not in config:
            raise HTTPException(
                status_code=400,
                detail="Telegram channel requires bot_token and chat_id in config"
            )
    
    elif channel_type == ChannelType.WEBHOOK:
        if "url" not in config:
            raise HTTPException(
                status_code=400,
                detail="Webhook channel requires url in config"
            )
    
    elif channel_type == ChannelType.DISCORD:
        if "webhook_url" not in config:
            raise HTTPException(
                status_code=400,
                detail="Discord channel requires webhook_url in config"
            )


def mask_sensitive_config(config: Dict[str, Any], channel_type: ChannelType) -> Dict[str, Any]:
    """Mask sensitive values in config for display."""
    masked = config.copy()
    
    sensitive_keys = ["webhook_url", "bot_token", "api_key", "password", "secret"]
    
    for key in sensitive_keys:
        if key in masked and masked[key]:
            value = str(masked[key])
            if len(value) > 8:
                masked[key] = value[:4] + "..." + value[-4:]
            else:
                masked[key] = "****"
    
    return masked

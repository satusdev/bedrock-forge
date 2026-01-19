"""
Notification Service for sending alerts.

Supports email, Slack webhooks, Telegram, Discord, and generic webhooks.
"""
import json
from datetime import datetime
from typing import Optional
import aiohttp

from ..db.models.notification_channel import NotificationChannel, ChannelType
from ..utils.logging import logger


class NotificationService:
    """Service for sending notifications through various channels."""
    
    async def send(
        self,
        channel: NotificationChannel,
        title: str,
        message: str,
        level: str = "info"  # info, warning, error, success
    ) -> dict:
        """
        Send notification through the specified channel.
        
        Returns: {"success": bool, "error": str | None}
        """
        try:
            config = json.loads(channel.config) if channel.config else {}
            
            if channel.channel_type == ChannelType.EMAIL:
                return await self._send_email(config, title, message)
            elif channel.channel_type == ChannelType.SLACK:
                return await self._send_slack(config, title, message, level)
            elif channel.channel_type == ChannelType.DISCORD:
                return await self._send_discord(config, title, message, level)
            elif channel.channel_type == ChannelType.TELEGRAM:
                return await self._send_telegram(config, title, message)
            elif channel.channel_type == ChannelType.WEBHOOK:
                return await self._send_webhook(config, title, message, level)
            else:
                return {"success": False, "error": f"Unknown channel type: {channel.channel_type}"}
                
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid channel config JSON"}
        except Exception as e:
            logger.error(f"Notification error: {e}")
            return {"success": False, "error": str(e)[:200]}
    
    async def _send_email(
        self,
        config: dict,
        subject: str,
        body: str
    ) -> dict:
        """Send email notification via SMTP."""
        # Email config: {"to": "...", "smtp_host": "...", "smtp_port": 587, "smtp_user": "...", "smtp_pass": "..."}
        to_email = config.get("to")
        if not to_email:
            return {"success": False, "error": "No recipient email configured"}
        
        try:
            # Try to use aiosmtplib if available
            import aiosmtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            smtp_host = config.get("smtp_host", "localhost")
            smtp_port = config.get("smtp_port", 587)
            smtp_user = config.get("smtp_user")
            smtp_pass = config.get("smtp_pass")
            from_email = config.get("from", smtp_user or "noreply@localhost")
            
            msg = MIMEMultipart()
            msg["Subject"] = f"[Forge Alert] {subject}"
            msg["From"] = from_email
            msg["To"] = to_email
            msg.attach(MIMEText(body, "plain"))
            
            await aiosmtplib.send(
                msg,
                hostname=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_pass,
                start_tls=True
            )
            
            logger.info(f"Email sent to {to_email}")
            return {"success": True}
            
        except ImportError:
            logger.warning("aiosmtplib not installed, email not sent")
            return {"success": False, "error": "Email library (aiosmtplib) not installed"}
        except Exception as e:
            return {"success": False, "error": f"SMTP error: {str(e)[:100]}"}
    
    async def _send_slack(
        self,
        config: dict,
        title: str,
        message: str,
        level: str
    ) -> dict:
        """Send Slack webhook notification."""
        # Config: {"webhook_url": "https://hooks.slack.com/..."}
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            return {"success": False, "error": "No Slack webhook URL configured"}
        
        # Color based on level
        colors = {
            "info": "#2196F3",
            "warning": "#FF9800",
            "error": "#F44336",
            "success": "#4CAF50"
        }
        
        payload = {
            "attachments": [
                {
                    "color": colors.get(level, "#2196F3"),
                    "title": title,
                    "text": message,
                    "footer": "Bedrock Forge",
                    "ts": int(datetime.utcnow().timestamp())
                }
            ]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=payload) as resp:
                if resp.status == 200:
                    logger.info("Slack notification sent")
                    return {"success": True}
                else:
                    body = await resp.text()
                    return {"success": False, "error": f"Slack error: {resp.status} - {body[:100]}"}
    
    async def _send_discord(
        self,
        config: dict,
        title: str,
        message: str,
        level: str
    ) -> dict:
        """Send Discord webhook notification."""
        # Config: {"webhook_url": "https://discord.com/api/webhooks/..."}
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            return {"success": False, "error": "No Discord webhook URL configured"}
        
        # Color based on level (Discord uses decimal)
        colors = {
            "info": 2201331,     # Blue
            "warning": 16750848,  # Orange
            "error": 15158332,   # Red
            "success": 3066993   # Green
        }
        
        payload = {
            "embeds": [
                {
                    "title": title,
                    "description": message,
                    "color": colors.get(level, 2201331),
                    "footer": {"text": "Bedrock Forge"},
                    "timestamp": datetime.utcnow().isoformat()
                }
            ]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=payload) as resp:
                if resp.status in [200, 204]:
                    logger.info("Discord notification sent")
                    return {"success": True}
                else:
                    body = await resp.text()
                    return {"success": False, "error": f"Discord error: {resp.status} - {body[:100]}"}
    
    async def _send_telegram(
        self,
        config: dict,
        title: str,
        message: str
    ) -> dict:
        """Send Telegram bot notification."""
        # Config: {"bot_token": "...", "chat_id": "..."}
        bot_token = config.get("bot_token")
        chat_id = config.get("chat_id")
        
        if not bot_token or not chat_id:
            return {"success": False, "error": "Telegram bot_token and chat_id required"}
        
        text = f"*{title}*\n\n{message}"
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown"
            }) as resp:
                if resp.status == 200:
                    logger.info("Telegram notification sent")
                    return {"success": True}
                else:
                    body = await resp.text()
                    return {"success": False, "error": f"Telegram error: {resp.status} - {body[:100]}"}
    
    async def _send_webhook(
        self,
        config: dict,
        title: str,
        message: str,
        level: str
    ) -> dict:
        """Send generic webhook notification."""
        # Config: {"url": "...", "method": "POST", "headers": {...}}
        url = config.get("url")
        if not url:
            return {"success": False, "error": "No webhook URL configured"}
        
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        
        payload = {
            "title": title,
            "message": message,
            "level": level,
            "timestamp": datetime.utcnow().isoformat(),
            "source": "bedrock-forge"
        }
        
        async with aiohttp.ClientSession() as session:
            if method == "POST":
                async with session.post(url, json=payload, headers=headers) as resp:
                    if resp.status < 400:
                        logger.info(f"Webhook notification sent to {url}")
                        return {"success": True}
                    else:
                        return {"success": False, "error": f"Webhook error: {resp.status}"}
            else:
                return {"success": False, "error": f"Unsupported method: {method}"}
    
    @staticmethod
    def send_expiry_alert(
        item_type: str,  # "domain" or "ssl"
        item_name: str,
        expiry_date,
        days_left: int
    ):
        """
        Send expiry alert notification (sync version for Celery tasks).
        
        This logs the alert and could be extended to send emails/webhooks.
        """
        level = "error" if days_left <= 7 else "warning"
        
        if item_type == "domain":
            title = f"Domain Expiring: {item_name}"
            message = f"Domain {item_name} expires on {expiry_date} ({days_left} days left)"
        else:
            title = f"SSL Certificate Expiring: {item_name}"
            message = f"SSL certificate for {item_name} expires on {expiry_date} ({days_left} days left)"
        
        # Log the alert
        if level == "error":
            logger.error(f"EXPIRY ALERT: {message}")
        else:
            logger.warning(f"EXPIRY WARNING: {message}")
        
        # TODO: In production, send via configured notification channels
        # This would require async context or queuing

        return {"success": True, "logged": True}


# Singleton instance
notification_service = NotificationService()

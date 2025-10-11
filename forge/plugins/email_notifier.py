"""
Email notification plugin for Bedrock Forge.

This plugin provides email notifications for deployment events,
backup completions, and other Forge activities.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, List
from forge.plugins.base import NotificationPlugin
from forge.utils.logging import logger


class EmailNotifierPlugin(NotificationPlugin):
    """Email notification plugin."""

    @property
    def name(self) -> str:
        return "email_notifier"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def description(self) -> str:
        return "Send email notifications for Forge events"

    @property
    def author(self) -> str:
        return "Bedrock Forge Team"

    def __init__(self):
        self.config = {}

    def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize the plugin with configuration."""
        self.config = config
        logger.info(f"Initialized {self.name} plugin with SMTP server: {config.get('smtp_host')}")

    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        required_keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "from_email"]
        for key in required_keys:
            if key not in config:
                logger.error(f"Missing required config key: {key}")
                return False
        return True

    def send_notification(self, message: str, config: Dict[str, Any]) -> bool:
        """Send notification."""
        try:
            # Get recipients
            to_emails = config.get("to_emails", [])
            if not to_emails:
                logger.warning("No recipients specified for email notification")
                return False

            # Get subject
            subject = config.get("subject", "Bedrock Forge Notification")

            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.config["from_email"]
            msg['To'] = ", ".join(to_emails)
            msg['Subject'] = subject

            # Add message body
            msg.attach(MIMEText(message, 'plain'))

            # Connect to SMTP server
            smtp_host = self.config["smtp_host"]
            smtp_port = self.config["smtp_port"]
            smtp_user = self.config["smtp_user"]
            smtp_password = self.config["smtp_password"]

            server = smtplib.SMTP(smtp_host, smtp_port)
            if config.get("use_tls", True):
                server.starttls()
            server.login(smtp_user, smtp_password)

            # Send email
            server.send_message(msg)
            server.quit()

            logger.info(f"Email notification sent to {len(to_emails)} recipients")
            return True

        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False

    def send_deployment_notification(self, project_name: str, status: str, details: Dict[str, Any]) -> bool:
        """Send deployment-specific notification."""
        subject = f"Deployment {status.title()}: {project_name}"

        message = f"""
Deployment Status: {status.title()}
Project: {project_name}
Environment: {details.get('environment', 'Unknown')}
Deployment ID: {details.get('deployment_id', 'Unknown')}
Timestamp: {details.get('timestamp', 'Unknown')}

Additional Details:
{details.get('message', 'No additional details available')}

---
This notification was sent by Bedrock Forge Email Notifier Plugin
        """.strip()

        config = {
            "subject": subject,
            "to_emails": self.config.get("deployment_recipients", [self.config["from_email"]])
        }

        return self.send_notification(message, config)

    def send_backup_notification(self, project_name: str, backup_type: str, status: str, details: Dict[str, Any]) -> bool:
        """Send backup-specific notification."""
        if status == "success":
            subject = f"Backup Successful: {project_name}"
        else:
            subject = f"Backup Failed: {project_name}"

        message = f"""
Backup Status: {status.title()}
Project: {project_name}
Backup Type: {backup_type}
Timestamp: {details.get('timestamp', 'Unknown')}

Additional Details:
{details.get('message', 'No additional details available')}
        """.strip()

        config = {
            "subject": subject,
            "to_emails": self.config.get("backup_recipients", [self.config["from_email"]])
        }

        return self.send_notification(message, config)

    def send_alert_notification(self, alert_type: str, message: str, severity: str = "warning") -> bool:
        """Send alert notification."""
        subject = f"Bedrock Forge Alert: {alert_type}"

        formatted_message = f"""
Alert Type: {alert_type}
Severity: {severity.upper()}
Timestamp: {__import__('time').strftime('%Y-%m-%d %H:%M:%S')}

Message:
{message}
        """.strip()

        config = {
            "subject": subject,
            "to_emails": self.config.get("alert_recipients", [self.config["from_email"]])
        }

        return self.send_notification(formatted_message, config)

    def test_configuration(self) -> Dict[str, Any]:
        """Test email configuration."""
        try:
            test_message = "This is a test email from Bedrock Forge Email Notifier Plugin."
            test_config = {
                "subject": "Bedrock Forge - Email Test",
                "to_emails": [self.config["from_email"]]
            }

            success = self.send_notification(test_message, test_config)

            return {
                "success": success,
                "message": "Test email sent successfully" if success else "Failed to send test email"
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Test failed: {str(e)}"
            }
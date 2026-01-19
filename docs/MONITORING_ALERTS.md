# Monitoring & Alerts Guide

Guide for setting up monitoring, notifications, and status pages.

## Overview

Built-in Uptime Kuma-style monitoring:
- HTTP, TCP, DNS, SSL, Ping checks
- Heartbeat history
- Incident tracking
- Multi-channel notifications
- Public status pages

## Heartbeat System

Every monitor check creates a heartbeat record:

```python
Heartbeat(
    monitor_id=1,
    status="up",        # up, down, degraded
    response_time_ms=245,
    checked_at="2026-01-10T12:00:00Z"
)
```

Heartbeats are retained for 90 days (configurable).

## Incident Tracking

When a monitor fails 3+ consecutive times, an incident is created:

```python
Incident(
    monitor_id=1,
    title="Production is DOWN",
    status="ongoing",
    started_at="2026-01-10T12:00:00Z"
)
```

When recovered, the incident is resolved with duration calculated.

## Notification Channels

### Channel Types

| Type | Config |
|------|--------|
| Email | `{"to": "admin@example.com", "smtp_host": "...", "smtp_user": "...", "smtp_pass": "..."}` |
| Slack | `{"webhook_url": "https://hooks.slack.com/..."}` |
| Discord | `{"webhook_url": "https://discord.com/api/webhooks/..."}` |
| Telegram | `{"bot_token": "...", "chat_id": "..."}` |
| Webhook | `{"url": "https://...", "method": "POST"}` |

### Create Channel

```python
from forge.db.models import NotificationChannel, ChannelType

channel = NotificationChannel(
    name="Slack Alerts",
    channel_type=ChannelType.SLACK,
    config='{"webhook_url": "https://hooks.slack.com/..."}',
    owner_id=1
)
```

## Status Page

### Public Endpoint (No Auth)

```bash
# Get current status
curl http://localhost:8000/api/status/{project_id}

# Get 30-day history
curl http://localhost:8000/api/status/{project_id}/history?days=30
```

### Response
```json
{
  "project_name": "My Site",
  "overall_status": "operational",
  "monitors": [
    {
      "name": "Production",
      "status": "up",
      "uptime_24h": 100.0,
      "uptime_30d": 99.9,
      "response_time_ms": 245
    }
  ],
  "recent_incidents": []
}
```

## Celery Beat Schedules

Automatic scheduled tasks:

| Task | Schedule | Description |
|------|----------|-------------|
| `run_all_monitors` | Every 5 min | Check all monitors |
| `check_ssl_certificates` | Daily 6 AM | Check SSL expiry |
| `calculate_uptime_stats` | Daily midnight | Update uptime % |
| `cleanup_old_heartbeats` | Weekly Sun 4 AM | Delete 90+ day old |

## Configuration

```bash
# .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=app_password
```

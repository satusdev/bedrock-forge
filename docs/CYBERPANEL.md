# CyberPanel Integration

Complete integration with CyberPanel for website and server management via API.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [API Reference](#api-reference)
- [Dashboard Component](#dashboard-component)

---

## 🎯 Overview

The CyberPanel integration provides full control over CyberPanel-managed servers, including website creation, SSL management, database operations, and server monitoring.

### Server Configuration

Servers using CyberPanel require the following configuration:

| Field | Description |
|-------|-------------|
| `panel_port` | CyberPanel port (default: 8090) |
| `panel_api_user` | API username |
| `panel_api_token` | API token (encrypted) |
| `panel_verified` | Connection verified status |

---

## ✨ Features

### Website Management

| Feature | Description |
|---------|-------------|
| Create website | New website with domain and PHP version |
| Delete website | Remove website and all data |
| List websites | Get all websites on server |
| Change PHP | Switch PHP version for website |

### SSL Certificates

| Feature | Description |
|---------|-------------|
| Issue SSL | Generate Let's Encrypt certificate |
| Auto-SSL | Automatic SSL for new websites |

### Database Operations

| Feature | Description |
|---------|-------------|
| List databases | Get all MySQL databases |
| Create database | New database with user |
| Delete database | Remove database |

### Server Monitoring

| Metric | Description |
|--------|-------------|
| CPU usage | Current CPU percentage |
| Memory usage | RAM utilization |
| Disk usage | Storage consumption |
| Website count | Total websites hosted |

---

## 📡 API Reference

### Endpoints

```
GET    /api/v1/cyberpanel/servers/{id}/websites
POST   /api/v1/cyberpanel/servers/{id}/websites
DELETE /api/v1/cyberpanel/servers/{id}/websites/{domain}
POST   /api/v1/cyberpanel/servers/{id}/ssl/{domain}
PUT    /api/v1/cyberpanel/servers/{id}/php/{domain}
GET    /api/v1/cyberpanel/servers/{id}/databases
POST   /api/v1/cyberpanel/servers/{id}/databases
GET    /api/v1/cyberpanel/servers/{id}/info
GET    /api/v1/cyberpanel/servers/{id}/wordpress
```

### Create Website

```bash
POST /api/v1/cyberpanel/servers/1/websites
Content-Type: application/json

{
  "domain": "example.com",
  "php_version": "8.2"
}
```

### Issue SSL

```bash
POST /api/v1/cyberpanel/servers/1/ssl/example.com
```

### Get Server Info

```bash
GET /api/v1/cyberpanel/servers/1/info
```

Response:
```json
{
  "cpu_usage": 23.5,
  "memory_usage": 45.2,
  "disk_usage": 67.8,
  "websites_count": 12,
  "uptime": "45 days"
}
```

---

## 🖥️ Dashboard Component

The `CyberPanelTab` component provides a visual interface for CyberPanel management.

### Features

- Server stats overview (CPU, RAM, Disk)
- Website list with PHP version
- SSL status indicators
- Create website modal
- Database list view
- Quick actions (Issue SSL, Delete)

### Usage

```tsx
import CyberPanelTab from '@/components/CyberPanelTab';

<CyberPanelTab 
  serverId={1} 
  serverName="Production Server" 
/>
```

---

## 🔗 Related Documentation

- [Server Provisioning](COMMANDS.md#server-provisioning) - Server setup
- [API Reference](API.md) - Complete API docs
- [Architecture](ARCHITECTURE.md) - System design

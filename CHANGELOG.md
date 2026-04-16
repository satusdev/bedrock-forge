# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-16

### Added

- **Server Management** — SSH key vault with AES-256-GCM encryption, CyberPanel
  auto-login, server scanning to bulk-import WordPress environments
- **Project & Client Management** — Clients, projects, tags, hosting packages,
  and support packages with full CRUD
- **Environment Management** — Production / staging per project, DB credential
  vault, environment scanning
- **Backup & Restore** — Full / DB-only / files-only backups via BullMQ queue,
  Google Drive upload via rclone, scheduled backups, restore from any backup
- **Plugin Scanning** — On-demand WordPress plugin scan, enable/disable/delete
  actions
- **Environment Sync** — Cross-server file + database sync via rsync / mysqldump
- **Uptime Monitoring** — Configurable interval, response time tracking, uptime
  percentage, alert logs
- **Domain WHOIS** — Expiry tracking, cached WHOIS data
- **Bedrock Provisioning** — Create fresh Bedrock WordPress + CyberPanel site
  via background job
- **Invoices & Billing** — Yearly invoice generation per project, status
  tracking
- **Slack Notifications** — Per-event channel subscriptions, delivery logs
- **Activity & Audit Logs** — BullMQ job trail + user action audit log
- **Dashboard** — Stats summary, recent job feed via WebSocket
- **Auth & RBAC** — JWT with refresh token rotation, 3-tier role system
  (admin/manager/client)
- **Reports** — Weekly summary report generation
- **Real-time Updates** — WebSocket gateway for live job progress streaming
- **Docker Deployment** — Single-command install via `install.sh`, Docker
  Compose with PostgreSQL + Redis

[0.1.0]: https://github.com/satusdev/bedrock-forge/releases/tag/v0.1.0

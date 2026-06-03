# Usage Guide

This guide explains what each part of Bedrock Forge is for, how common
workflows fit together, and where the current limits are.

## Operating Model

Bedrock Forge is an operations dashboard, not a WordPress plugin. You add
servers and site environments, then trigger jobs from the UI. Jobs run in the
worker, connect to remote servers over SSH, and stream progress into the
execution log.

Use the execution log whenever an operation looks stuck or failed. It shows the
exact remote step, command label, exit code, and worker message.

## First Setup Flow

1. **Add a server**
   - Go to **Servers -> Add Server**.
   - Enter host, port, SSH user, and private key.
   - Save and confirm SSH connectivity.

2. **Add a client**
   - Go to **Clients -> Add Client**.
   - Add contact details and tags if useful.

3. **Add a project**
   - Go to **Projects -> Add Project**.
   - Link the client and optional hosting/support packages.

4. **Add environments**
   - Open the project and use **Environments -> Add Environment**.
   - Configure type, URL, server, root path, and backup path.
   - Forge will attempt to discover WordPress DB credentials from the remote
     site.

5. **Run baseline checks**
   - Run a backup.
   - Run plugin and theme scans.
   - Check WordPress core.
   - Add a monitor.
   - Run a security scan.

## Projects

Projects group one or more WordPress environments for the same site. Typical
environment names are `production`, `staging`, and `development`, but the label
is free text.

Project tabs:

| Tab          | Use it for                                                                            |
| ------------ | ------------------------------------------------------------------------------------- |
| Environments | Server/path/URL config, DB credential discovery, protected tables, tags.              |
| Backups      | Create backups and manage backup schedules.                                           |
| Plugins      | Scan, install, update, activate, deactivate, remove, and manage Composer constraints. |
| Sync         | Clone or push files/database between environments.                                    |
| Restore      | Restore backups to the originating environment.                                       |
| Tools        | Cleanup, WP logs, debug mode, cron listing, cache and operational tools.              |
| Drift        | Compare environment config against stored baseline/committed config.                  |
| Themes       | Scan, install, update, activate, and delete themes.                                   |
| WP Core      | Check WordPress core version and run core updates.                                    |

## Plugins

Plugin management supports three source types:

| Source        | Meaning                                                             | Supported actions                                                     |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Composer      | Plugin is managed by `composer.json` as `wpackagist-plugin/<slug>`. | Add, remove, update, update all, change constraint, schedule updates. |
| Manual        | Plugin exists in WordPress files but is not Composer-managed.       | Scan, activate/deactivate, update via WP-CLI when public, remove.     |
| GitHub custom | Plugin comes from the custom plugin catalog.                        | Install, update, remove, version check.                               |

Important notes:

- Composer add/update/remove runs on Bedrock layouts.
- Manual public plugin update uses WP-CLI.
- Custom GitHub plugins must be added to **Settings -> Plugins -> Custom
  Catalog** before they can be installed on an environment.
- **Settings -> Plugins -> Installed Plugins** is a cross-environment inventory
  based on the latest plugin scans.

## Backups and Restore

Backup types:

- **Full**: database and files.
- **Database only**: mysqldump output only.
- **Files only**: site files only.

Schedules can run daily, weekly, or monthly. Retention can prune old backup
records by count or age depending on schedule settings.

Current restore boundary:

- Restore targets the same environment that produced the backup.
- Cross-server restore is not implemented.
- Incremental backups are not implemented.

Google Drive upload is supported through rclone configuration. Other rclone
targets are not wired into the UI yet.

## Sync

Sync is for moving data between project environments.

Supported scopes:

- **Database only**
- **Files only**
- **Database + files**

Forge can replace source URLs with target URLs in database and text assets,
clear common cache locations, handle Bedrock paths, and preserve configured
protected tables during database sync.

Files sync uses rsync when available and falls back to a tar relay if rsync is
missing. Protected/root-owned files such as `wp-config.php` are expected to
remain protected; Forge avoids treating permission reconciliation noise as a
failed sync.

## Security

The Security page keeps the main operational security views:

| View      | Use it for                                                      |
| --------- | --------------------------------------------------------------- |
| Overview  | High-level scan status and security score.                      |
| Servers   | Server hardening and SSH/security scan results.                 |
| Projects  | WordPress environment security scans.                           |
| Findings  | Flat list of current findings with acknowledgement workflow.    |
| Schedules | Automated server/environment scan schedules and alert settings. |

Security scans can check server posture, SSH activity, WordPress configuration,
file patterns, suspicious scripts, and related hardening items. Some hardening
actions can be applied from the UI, but review each action before running it on
production.

Current limits:

- SSH host key verification is not implemented.
- External vulnerability intelligence feed sync is not production-wired.
- Security notification delivery is Slack/in-app focused.

## Monitoring and Lighthouse

Monitoring supports:

- HTTP availability.
- Response time history.
- SSL expiry checks.
- DNS resolution checks.
- Keyword/content checks.
- Incident logs and notifications.

Lighthouse audits are separate from uptime monitors. Use **Lighthouse** to run
performance audits for environments and review historical mobile/desktop scores.

## Billing and Packages

Packages define recurring hosting/support prices for projects. Invoices are
generated from project package assignments and can be tracked through draft,
sent, paid, overdue, and cancelled statuses.

Settings:

- Use **Settings -> Billing** to configure currency code and locale.
- Currency affects display formatting in packages and invoices.

Current limits:

- No payment gateway.
- No invoice PDF export.
- No tax engine or accounting integration.

## Settings

Key settings areas:

| Tab          | Use it for                                                             |
| ------------ | ---------------------------------------------------------------------- |
| Account      | Your profile and password.                                             |
| Integrations | Slack, Google Drive/rclone, GitHub token, and related external config. |
| Automation   | Scheduled/platform automation settings.                                |
| Plugins      | Custom plugin catalog and installed plugin inventory.                  |
| Billing      | Currency and locale for billing display.                               |
| Backup       | Forge system backup settings.                                          |
| Advanced     | Low-level app settings.                                                |

Only admins can change global settings.

## Activity, Problems, and Audit Logs

- **Activity** shows background job history and failures.
- **Problems** aggregates attention items such as down monitors, expiring
  domains, outdated plugins, drift, and other issues.
- **Audit Logs** show user actions and operational changes.

Use these pages for triage before rerunning failed operations.

## Current Product Boundaries

Bedrock Forge currently does not provide:

- Multi-tenant workspace isolation.
- Payment processing.
- 2FA/MFA or SSO.
- Email notification delivery.
- Cross-server backup restore.
- Incremental backups.
- S3/B2/Wasabi backup target UI.
- cPanel/Plesk/DirectAdmin/CloudPanel/RunCloud automation.
- Tested WordPress Multisite workflows.

Treat it as an operator tool for a trusted internal team, not a hosted SaaS
platform for multiple unrelated customer workspaces.

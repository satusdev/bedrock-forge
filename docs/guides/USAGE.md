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
| Files & Config | Remote `.env`, safe file browser, downloads, uploads archive, log tail, notes.     |
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

- **Database only**: Generates a database dump on the source server, transfers it to the target, imports it, runs protection steps, and performs URL replacement.
- **Files only**: Syncs site files (excluding configurations like `.env`, `wp-config.php`, `.htaccess`) using `rsync` (or a tar-relay fallback).
- **Database + files**: Performs the database sync first, followed by the file sync.

### Data Protection & Sanitization

When syncing databases between environments (such as cloning from `production` to `staging` or pushing from `staging` to `production`), it is critical to prevent overwriting environment-specific data or leaking sensitive user information. Forge provides three levels of database protection, all configured per target environment.

> **Which should I use?**
> | Goal | Use |
> |---|---|
> | Keep an entire plugin's table intact on target | **Protected Tables** |
> | Delete/sanitize data after import (e.g. wipe orders on staging) | **SQL Protection Queries** |
> | Keep target post type content untouched during sync | **Protected Custom Post Types** |

#### 1. Protected Tables
Protected tables are specific database tables on the target environment that are **completely skipped** during the database import.
* **How it works**: The source `mysqldump` is generated without those tables. The target's existing table data is never touched or overwritten. They are also excluded from URL search-replace.
* **When to use**: Plugin-owned tables that are environment-specific and should never be overwritten — e.g. local SMTP settings, Wordfence scan logs, or WP Super Cache config.
* **Configuration**: Enter the exact table names (e.g. `wp_smtp_settings, wp_wflogs`) in the **Protected Tables** field of the Environment settings modal.

#### 2. SQL Protection Queries
SQL Protection Queries are custom SQL commands executed on the **target** database **immediately after** the dump is imported but **before** URL search-replace runs.
* **How it works**: Forge pushes the queries to the target server, auto-detects the WordPress table prefix (via `information_schema`), substitutes `{prefix}` / `%prefix%` with the real prefix (e.g. `wp_` or `mysite_`), and runs all queries in sequence.
* **When to use**: Sanitizing production data when pushing to staging or dev — delete orders, anonymize emails, clear API keys, etc.
* **Configuration**: Enter one SQL query per line in the **SQL Protection Queries** text area of the Environment settings modal.

##### Use case: Delete a custom post type on import (e.g. wipe 'project' from staging)
Use this when you do **not** want a post type to exist on the target after sync. The queries must be entered in dependency order (children before parents):

```sql
-- 1. Delete comment metadata for project post comments
DELETE cm FROM {prefix}commentmeta cm
  INNER JOIN {prefix}comments c ON cm.comment_id = c.comment_ID
  INNER JOIN {prefix}posts p ON c.comment_post_ID = p.ID
  WHERE p.post_type = 'project';

-- 2. Delete comments on project posts
DELETE c FROM {prefix}comments c
  INNER JOIN {prefix}posts p ON c.comment_post_ID = p.ID
  WHERE p.post_type = 'project';

-- 3. Delete postmeta for project revisions
DELETE pm FROM {prefix}postmeta pm
  INNER JOIN {prefix}posts r ON pm.post_id = r.ID
  INNER JOIN {prefix}posts p ON r.post_parent = p.ID
  WHERE r.post_type = 'revision' AND p.post_type = 'project';

-- 4. Delete project revisions
DELETE r FROM {prefix}posts r
  INNER JOIN {prefix}posts p ON r.post_parent = p.ID
  WHERE r.post_type = 'revision' AND p.post_type = 'project';

-- 5. Delete term relationships (category/tag links) for projects
DELETE tr FROM {prefix}term_relationships tr
  INNER JOIN {prefix}posts p ON tr.object_id = p.ID
  WHERE p.post_type = 'project';

-- 6. Delete custom fields / ACF metadata for projects
DELETE pm FROM {prefix}postmeta pm
  INNER JOIN {prefix}posts p ON pm.post_id = p.ID
  WHERE p.post_type = 'project';

-- 7. Finally delete the project posts themselves
DELETE FROM {prefix}posts WHERE post_type = 'project';
```

##### Use case: Sanitize WooCommerce orders & customer data on staging
```sql
-- Remove WooCommerce orders & shop logs
DELETE FROM {prefix}posts WHERE post_type IN ('shop_order', 'shop_order_refund', 'wc_user_membership', 'wc_membership_plan');
DELETE pm FROM {prefix}postmeta pm LEFT JOIN {prefix}posts p ON pm.post_id = p.ID WHERE p.ID IS NULL;

-- Anonymize user email addresses and clear session tokens
UPDATE {prefix}users SET user_email = CONCAT(user_login, '@staging.local'), user_pass = '$P$B7yO3s4Z2iA5hS7gX9wQ1R0tU6vY2o.' WHERE ID > 1;
DELETE FROM {prefix}usermeta WHERE meta_key = 'session_tokens';
```

#### 3. Protected Custom Post Types
Use this when you want to **keep** the target's existing content for a custom post type untouched — so that whatever is in production doesn't overwrite staging/dev data for that post type.

* **When to use**: You have staging-specific projects, courses, lessons, or test content that you never want wiped out by a production sync.
* **How it works** (full lifecycle):
  1. **Pre-import backup**: Before the dump is imported, Forge connects to the target DB, auto-detects the table prefix, and copies all rows for the protected post types from `posts`, `postmeta`, `term_relationships`, `term_taxonomy`, `terms`, `comments`, and `commentmeta` — including their revisions and directly attached media — into temporary `_forge_backup_*` tables.
  2. **Safe import**: Forge skips the `DROP DATABASE` step so the backup tables survive the incoming dump.
  3. **Post-import restore**: After import, Forge deletes all rows for the protected post types that arrived from the source (posts, revisions, directly attached media, taxonomy links, comments, and metadata), then re-inserts the original target rows from the backup tables, and finally drops the backup tables.
  4. **File sync protection**: During database+files sync, Forge excludes upload files referenced by the protected post type's directly attached media from rsync/tar overwrite and deletion.
* **Configuration**: Enter a comma-separated list of custom post type slugs in the **Protected Custom Post Types** field of the Environment settings modal.

```
project, course, lesson
```

> **Important**: This preserves post type **content** on the target. The post type **registration** (code / plugin) must still exist on both environments. Media protection is based on WordPress attachment rows directly attached to the protected posts; arbitrary URLs embedded in builder content are not guaranteed unless they resolve to those attachments.

> **Note**: Protected Custom Post Types and SQL Protection Queries are not mutually exclusive. You could protect `course` posts on staging while also running sanitization queries for WooCommerce orders in the same sync.

## Files & Config


Use **Project -> Files & Config** to reduce routine SSH usage.

Available workflows:

- Edit remote `.env` with secret masking, checksum conflict checks, required
  variable validation, and backup-before-write.
- Compare `.env` variables between staging and production.
- Browse safe remote roots: site root, uploads, logs, downloads, and backups.
- Quick-edit small text files and tail selected log files.
- Download small files directly from safe roots.
- Create a remote uploads archive under the Downloads folder.
- Keep persistent project notes.

The file browser is intentionally scoped. It does not expose arbitrary server
paths such as `/etc`, `/root`, or SSH key directories.

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
performance audits for environments and review historical mobile/desktop scores
and trends.

Forge runs local Chromium-based Lighthouse by default to avoid Google PageSpeed
daily query quotas. PageSpeed API is optional fallback/configurable behavior.
If a PageSpeed quota error appears, set `LIGHTHOUSE_PROVIDER=local` or wait for
the Google quota reset.

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

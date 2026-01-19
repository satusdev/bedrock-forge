# Bedrock Forge - Complete Project Management Enhancement Plan

> **Version:** 1.0  
> **Date:** January 17, 2026  
> **Status:** Draft for Review

---

## Executive Summary

This document outlines a comprehensive enhancement plan to transform Bedrock
Forge into a fully-featured WordPress project lifecycle management platform. The
plan addresses gaps in:

- **Project Management:** Importing existing sites, cloning projects
- **Backup Automation:** Scheduled backups with daily/weekly/monthly presets
- **Retention Policies:** Configurable auto-deletion for local and Google Drive
- **CyberPanel Integration:** Complete provisioning with user and database
  creation
- **Dashboard UI:** Functional backup manager, schedule configurator, Google
  Drive browser

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Feature Gap Summary](#feature-gap-summary)
3. [Implementation Plan](#implementation-plan)
   - [Phase 1: Database & Core](#phase-1-database--core)
   - [Phase 2: CyberPanel & Import](#phase-2-cyberpanel--import)
   - [Phase 3: Clone & Dashboard](#phase-3-clone--dashboard)
4. [Default Configuration Values](#default-configuration-values)
5. [Technical Specifications](#technical-specifications)
6. [Future Considerations](#future-considerations)

---

## Current State Analysis

### What Exists Today

#### ✅ Fully Implemented

| Feature                       | CLI |   API   | Dashboard | Notes                                     |
| ----------------------------- | :-: | :-----: | :-------: | ----------------------------------------- |
| Local project CRUD            | ✅  |   ✅    |    ✅     | Create, start, stop, delete DDEV projects |
| CyberPanel website management | ✅  |   ✅    |    ✅     | Create, delete, list websites via SSH     |
| CyberPanel SSL management     | ✅  |   ✅    |    ✅     | Issue Let's Encrypt certificates          |
| CyberPanel PHP version        | ✅  |   ✅    |    ✅     | Change PHP version per site               |
| Local backup (DB + uploads)   | ✅  |   ✅    |    ❌     | `forge sync backup` works                 |
| Remote backup via SSH         | ✅  |   ❌    |    ❌     | `--remote-host` flag works                |
| Google Drive upload           | ✅  | Partial |    ❌     | rclone integration works                  |
| Google Drive restore          | ✅  | Partial |    ❌     | CLI restore works                         |
| Local retention cleanup       | ✅  |   ❌    |    ❌     | `--retention N` keeps N files             |
| Backup status tracking        | ✅  |   ✅    |    ❌     | JSON status file per project              |

#### 🔶 Partially Implemented

| Feature                      | What Exists                          | What's Missing                           |
| ---------------------------- | ------------------------------------ | ---------------------------------------- |
| Import existing projects     | API endpoint in `import_projects.py` | No CLI command, no Dashboard UI          |
| CyberPanel database creation | Method in `cyberpanel_service.py`    | Not exposed in provisioning flow         |
| Backup schedules             | Mock storage in `schedules.py`       | No database model, no Celery integration |
| Dashboard Backups page       | UI shell in `Backups.tsx`            | Not connected to API, empty state only   |
| Dashboard Schedules page     | UI shell in `Schedules.tsx`          | Not connected to API, empty state only   |

#### ❌ Not Implemented

| Feature                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| CyberPanel user creation    | Cannot create CyberPanel users via CLI/API        |
| Clone projects              | No way to duplicate projects locally or to remote |
| Google Drive retention      | No auto-cleanup of old GDrive backups             |
| Scheduled backup execution  | No Celery Beat integration                        |
| Google Drive browser        | No UI to browse/select backups for restore        |
| Per-project backup settings | No configuration UI in dashboard                  |

---

## Feature Gap Summary

### Critical Gaps (Blocking Complete Workflow)

1. **No scheduled backup execution** - Schedules exist in mock form but don't
   run
2. **No Google Drive retention** - Old backups accumulate indefinitely
3. **No CyberPanel user creation** - Cannot fully provision new sites
4. **Dashboard backup/schedule pages non-functional** - UI exists but doesn't
   work

### Important Gaps (Significant UX Improvement)

5. **No import CLI command** - Must use API directly
6. **No clone functionality** - Cannot duplicate projects
7. **No Google Drive browser** - Cannot see/select backups in UI

### Nice-to-Have Gaps

8. **No backup settings UI per project** - Must configure via CLI

---

## Implementation Plan

### Phase 1: Database & Core

**Duration:** Week 1-2  
**Goal:** Establish foundation for scheduled backups with retention

---

#### Step 1.1: Create Backup Schedules Database Model

**New File:** `forge/db/models/backup_schedule.py`

```python
class BackupFrequency(str, PyEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"

class BackupSchedule(Base, TimestampMixin):
    __tablename__ = "backup_schedules"

    id: int (PK)
    project_id: int (FK → projects.id)
    name: str                          # "Daily Backup", "Weekly Full"
    frequency: BackupFrequency         # daily, weekly, monthly, custom
    cron_expression: str               # "0 2 * * *"

    # What to backup
    backup_type: BackupType            # full, database, files
    storage_type: BackupStorageType    # local, google_drive, both
    gdrive_folder: str                 # "forge-backups/{project}"

    # Retention settings
    local_retention_count: int         # Keep N most recent locally
    gdrive_retention_count: int        # Keep N most recent on GDrive

    # State
    enabled: bool                      # Default: True
    last_run_at: datetime | None
    last_run_status: str | None        # success, failed
    next_run_at: datetime | None

    # Relationships
    project: Project
    backups: List[Backup]              # Backups created by this schedule
```

**Modify:** `forge/db/models/__init__.py` - Export new model

**Create:** Alembic migration in `forge/db/alembic/versions/`

---

#### Step 1.2: Implement Backup Schedule API

**Rewrite:** `forge/api/routes/admin/schedules.py`

Replace mock `SCHEDULES` list with real database operations:

| Method   | Endpoint                           | Description                               |
| -------- | ---------------------------------- | ----------------------------------------- |
| `GET`    | `/api/admin/schedules`             | List all schedules for user's projects    |
| `GET`    | `/api/admin/schedules/{id}`        | Get schedule details                      |
| `POST`   | `/api/admin/schedules`             | Create custom schedule                    |
| `POST`   | `/api/admin/schedules/preset`      | Create from preset (daily/weekly/monthly) |
| `PUT`    | `/api/admin/schedules/{id}`        | Update schedule                           |
| `DELETE` | `/api/admin/schedules/{id}`        | Delete schedule                           |
| `POST`   | `/api/admin/schedules/{id}/run`    | Trigger immediate execution               |
| `POST`   | `/api/admin/schedules/{id}/toggle` | Enable/disable schedule                   |

**Request Schema for Preset:**

```json
{
	"project_id": 1,
	"preset": "daily", // "daily" | "weekly" | "monthly"
	"storage_type": "both", // "local" | "google_drive" | "both"
	"backup_type": "full" // "full" | "database" | "files"
}
```

Defaults applied automatically based on preset (see
[Default Configuration Values](#default-configuration-values)).

---

#### Step 1.3: Implement Celery Beat Database Scheduler

**New File:** `forge/api/celery_schedule_loader.py`

Use DatabaseScheduler pattern to load schedules from `backup_schedules` table:

```python
class DatabaseScheduleLoader:
    """
    Loads backup schedules from database and registers with Celery Beat.
    Called on worker startup and periodically refreshed.
    """

    def load_schedules(self) -> Dict[str, ScheduleEntry]:
        # Query enabled schedules from DB
        # Convert to Celery schedule entries
        # Return dict for CELERYBEAT_SCHEDULE

    def refresh_schedules(self):
        # Called every 60 seconds to pick up changes
        # Compare DB schedules with current Beat schedules
        # Add/remove/update as needed
```

**Modify:** `forge/api/celery_worker.py`

- Initialize DatabaseScheduleLoader on startup
- Register periodic refresh task
- Connect backup execution task

**Modify:** `forge/api/backup_tasks.py`

Enhance `scheduled_backup` task:

```python
@celery_app.task(bind=True)
def execute_scheduled_backup(self, schedule_id: int):
    """
    Execute a scheduled backup.

    1. Load schedule from DB
    2. Execute backup using forge.commands.sync.backup()
    3. Apply local retention policy
    4. Apply Google Drive retention policy (NEW)
    5. Update schedule last_run_at, next_run_at
    6. Create Backup record in DB
    """
```

---

#### Step 1.4: Implement Google Drive Retention Cleanup

**Modify:** `forge/api/google_drive_integration.py`

Add new method:

```python
async def cleanup_old_backups(
    self,
    folder_path: str,           # "forge-backups/mysite"
    retention_count: int,       # Keep N most recent
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Delete old backup folders from Google Drive.

    1. List all date folders in folder_path (YYYY-MM-DD format)
    2. Sort by date descending
    3. Delete folders beyond retention_count
    4. Return deletion summary
    """
```

**Modify:** `forge/commands/sync.py`

Add `--gdrive-retention` flag to backup command:

```python
@app.command()
def backup_command(
    # ... existing params ...
    gdrive_retention: int = typer.Option(
        None,
        "--gdrive-retention",
        help="Number of backups to keep on Google Drive"
    ),
):
```

Add standalone cleanup command:

```python
@app.command()
def cleanup_gdrive(
    project_dir: str = typer.Option(".", "--project-dir"),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder"),
    retention: int = typer.Option(7, "--retention"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Remove old backups from Google Drive based on retention policy."""
```

---

### Phase 2: CyberPanel & Import

**Duration:** Week 2-3  
**Goal:** Complete CyberPanel provisioning and expose import functionality

---

#### Step 2.1: Add CyberPanel User Management

**Modify:** `forge/services/cyberpanel_service.py`

Add methods:

```python
async def create_user(
    self,
    username: str,
    email: str,
    password: str,
    first_name: str = "",
    last_name: str = "",
    package: str = "Default",
    websites_limit: int = 0,      # 0 = unlimited
    disk_limit: int = 0           # 0 = unlimited (MB)
) -> Dict[str, Any]:
    """Create CyberPanel user via CLI."""
    cmd = f'$PY /usr/local/CyberCP/bin/cyberpanel createUser ' \
          f'--userName {username} --email {email} --password {password} ' \
          f'--packageName {package} --firstName "{first_name}" ' \
          f'--lastName "{last_name}"'
    # Execute and return result

async def list_users(self) -> List[Dict[str, Any]]:
    """List all CyberPanel users via Django shell."""

async def delete_user(self, username: str) -> Dict[str, Any]:
    """Delete CyberPanel user."""
```

**New File:** `forge/api/routes/admin/cyberpanel_users.py`

| Method   | Endpoint                                              | Description |
| -------- | ----------------------------------------------------- | ----------- |
| `GET`    | `/api/admin/servers/{id}/cyberpanel/users`            | List users  |
| `POST`   | `/api/admin/servers/{id}/cyberpanel/users`            | Create user |
| `DELETE` | `/api/admin/servers/{id}/cyberpanel/users/{username}` | Delete user |

**Modify:** `forge/commands/provision.py`

Add CLI commands:

```bash
# User management
forge provision cyberpanel-user create \
  --server myserver \
  --username newuser \
  --email user@example.com \
  --password secret123 \
  --package Default

forge provision cyberpanel-user list --server myserver
forge provision cyberpanel-user delete --server myserver --username olduser
```

---

#### Step 2.2: Add Full Site Provisioning Command

**Modify:** `forge/commands/provision.py`

Add one-click full provisioning:

```bash
forge provision site-full \
  --server myserver \
  --domain example.com \
  --admin-email admin@example.com \
  --db-name example_db \
  --db-user example_user \
  --db-password secret123 \
  --php 8.2 \
  --ssl \
  --deploy-wordpress
```

**Execution Flow:**

1. Create CyberPanel user (optional, if `--create-user`)
2. Create website via `cyberpanel createWebsite`
3. Create database via `cyberpanel createDatabase`
4. Issue SSL certificate
5. Deploy Bedrock WordPress (optional, if `--deploy-wordpress`)
6. Configure wp-config with database credentials
7. Register project in Forge database

---

#### Step 2.3: Add Import Existing Projects CLI

**Modify:** `forge/commands/provision.py`

Add import commands:

```bash
# List importable sites on server
forge provision import list --server myserver

# Output:
# Domain              Type      WP Version  Status
# example.com         Bedrock   6.4.2       Not imported
# shop.example.com    Standard  6.4.1       Already imported (ID: 5)
# blog.example.com    Bedrock   6.4.2       Not imported

# Import single site
forge provision import site \
  --server myserver \
  --domain example.com \
  --project-name "Example Site" \
  --create-monitor

# Import all WordPress sites
forge provision import all \
  --server myserver \
  --create-monitors \
  --skip-existing
```

**Implementation:**

- Call existing API logic from `forge/api/routes/admin/import_projects.py`
- Reuse `_detect_wordpress()` helper
- Create Project + ProjectServer records
- Optionally create uptime Monitor

---

### Phase 3: Clone & Dashboard

**Duration:** Week 3-4  
**Goal:** Add clone functionality and complete Dashboard UI

---

#### Step 3.1: Implement Clone Functionality

**New File:** `forge/commands/clone.py`

```python
app = typer.Typer()

@app.command()
def local(
    source_project: str,
    new_name: str,
    target_dir: str = typer.Option(None, help="Target directory"),
    include_uploads: bool = typer.Option(True),
    include_db: bool = typer.Option(True),
):
    """Clone a local project to a new directory."""
    # 1. Copy project files
    # 2. Update .ddev/config.yaml with new name
    # 3. Export and import database with new prefix
    # 4. Run search-replace for URLs
    # 5. Register new project in Forge

@app.command()
def remote(
    source_server: str,
    target_server: str,
    domain: str,
    new_domain: str = typer.Option(None, help="New domain (default: same)"),
):
    """Clone a project from one server to another."""
    # 1. Backup from source server (DB + uploads)
    # 2. Create website on target server
    # 3. Transfer backup files
    # 4. Restore on target server
    # 5. Run search-replace if domain changed
    # 6. Issue SSL on target

@app.command()
def from_backup(
    backup_path: str,           # Local path or GDrive path
    new_name: str,
    from_gdrive: bool = typer.Option(False),
    gdrive_folder: str = typer.Option("forge-backups"),
):
    """Create a new project from an existing backup."""
    # 1. Download backup if from GDrive
    # 2. Create new DDEV project
    # 3. Restore database
    # 4. Extract uploads
    # 5. Run search-replace for new local URL
```

**New File:** `forge/api/routes/admin/clone.py`

| Method | Endpoint                                | Description                |
| ------ | --------------------------------------- | -------------------------- |
| `POST` | `/api/admin/projects/{id}/clone/local`  | Clone locally              |
| `POST` | `/api/admin/projects/{id}/clone/remote` | Clone to another server    |
| `POST` | `/api/admin/backups/{id}/clone`         | Create project from backup |

---

#### Step 3.2: Complete Dashboard Backups Page

**Rewrite:** `dashboard/src/pages/Backups.tsx`

**Features:**

- Fetch backups from `GET /api/admin/backups`
- Display in table with columns: Name, Project, Type, Size, Date, Storage,
  Status
- Filter by: Project, Type (full/db/files), Storage (local/gdrive), Date range
- Actions per backup:
  - Download (local or from GDrive)
  - Restore to current project
  - Clone to new project
  - Delete
- "Create Backup" button → modal with:
  - Project selector
  - Backup type (Full / Database / Files)
  - Storage (Local / Google Drive / Both)
  - Submit → calls `POST /api/admin/backups`
  - Progress indicator via WebSocket

**New Component:** `dashboard/src/components/CreateBackupModal.tsx`

**New Component:** `dashboard/src/components/RestoreBackupModal.tsx`

---

#### Step 3.3: Complete Dashboard Schedules Page

**Rewrite:** `dashboard/src/pages/Schedules.tsx`

**Features:**

- Fetch schedules from `GET /api/admin/schedules`
- Display cards with: Name, Project, Frequency, Next Run, Status, Last Run
  Result
- Quick preset buttons: "Add Daily" / "Add Weekly" / "Add Monthly"
- Actions per schedule:
  - Enable/Disable toggle
  - Run Now
  - Edit → modal
  - Delete
- Create/Edit modal with:
  - Project selector
  - Preset selector (Daily/Weekly/Monthly/Custom)
  - If Custom: cron expression input with helper
  - Backup type selector
  - Storage selector
  - Local retention count (default from preset)
  - GDrive retention count (default from preset)
  - Enable/disable toggle

**New Component:** `dashboard/src/components/ScheduleModal.tsx`

---

#### Step 3.4: Add Google Drive Browser Component

**New Component:** `dashboard/src/components/GDriveBrowser.tsx`

**Features:**

- Check GDrive connection status (`GET /api/admin/gdrive/status`)
- If not connected: Show "Connect Google Drive" button
- Folder tree navigation starting from `forge-backups/`
- List backup folders by date (YYYY-MM-DD)
- List files within selected date folder
- Preview backup metadata (size, contents)
- Actions:
  - Download file
  - Restore backup
  - Delete folder/file
- Search/filter by date range

**Usage:**

- Embedded in Backups page as collapsible panel
- Opened from "Restore from Google Drive" action

---

#### Step 3.5: Add Import Projects Dashboard UI

**New Page:** `dashboard/src/pages/ImportProjects.tsx`

**Features:**

- Server selector dropdown
- "Scan Server" button → calls `GET /api/admin/import/{server_id}/websites`
- Display table:
  - Domain
  - Document Root
  - WordPress Type (Bedrock/Standard/None)
  - WP Version
  - Status (Not imported / Already imported)
- Bulk select checkboxes
- "Import Selected" button
- Options:
  - Create uptime monitor (toggle, default: on)
  - Set environment (production/staging/development)
- Progress indicator for bulk import
- Success summary with links to imported projects

---

## Default Configuration Values

### Backup Schedule Presets

| Preset      | Cron Expression | Time    | Day          | Local Retention | GDrive Retention |
| ----------- | --------------- | ------- | ------------ | --------------- | ---------------- |
| **Daily**   | `0 2 * * *`     | 2:00 AM | Every day    | 7 backups       | 7 backups        |
| **Weekly**  | `0 3 * * 0`     | 3:00 AM | Sunday       | 4 backups       | 4 backups        |
| **Monthly** | `0 4 1 * *`     | 4:00 AM | 1st of month | 3 backups       | 3 backups        |

### Backup Defaults

| Setting           | Default Value                  |
| ----------------- | ------------------------------ |
| Backup type       | `full` (database + uploads)    |
| Storage type      | `both` (local + Google Drive)  |
| GDrive folder     | `forge-backups/{project_name}` |
| Compression level | 6 (gzip)                       |

### Retention Behavior

- **Local retention:** Keeps N most recent backup files per type (db/uploads)
- **GDrive retention:** Keeps N most recent date folders
- **Cleanup timing:** Runs immediately after successful backup upload
- **Dry-run:** Always log what would be deleted before actual deletion

---

## Technical Specifications

### Database Schema Changes

```sql
-- New table
CREATE TABLE backup_schedules (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    frequency VARCHAR(20) NOT NULL,  -- daily, weekly, monthly, custom
    cron_expression VARCHAR(100) NOT NULL,
    backup_type VARCHAR(20) NOT NULL DEFAULT 'full',
    storage_type VARCHAR(20) NOT NULL DEFAULT 'both',
    gdrive_folder VARCHAR(500),
    local_retention_count INTEGER NOT NULL DEFAULT 7,
    gdrive_retention_count INTEGER NOT NULL DEFAULT 7,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backup_schedules_project ON backup_schedules(project_id);
CREATE INDEX idx_backup_schedules_enabled ON backup_schedules(enabled);
CREATE INDEX idx_backup_schedules_next_run ON backup_schedules(next_run_at);

-- Add schedule reference to backups table
ALTER TABLE backups ADD COLUMN schedule_id INTEGER REFERENCES backup_schedules(id);
```

### Celery Configuration

```python
# forge/api/celery_config.py

CELERY_CONFIG = {
    "broker_url": "redis://localhost:6379/0",
    "result_backend": "redis://localhost:6379/0",
    "beat_scheduler": "forge.api.celery_schedule_loader:DatabaseScheduler",
    "beat_schedule_filename": "/tmp/celerybeat-schedule",
    "beat_sync_every": 1,  # Sync schedule to DB every task
    "beat_max_loop_interval": 60,  # Check for schedule changes every 60s
    "task_serializer": "json",
    "result_serializer": "json",
    "accept_content": ["json"],
    "timezone": "UTC",
    "enable_utc": True,
}
```

### API Response Schemas

**BackupSchedule Response:**

```json
{
	"id": 1,
	"project_id": 5,
	"project_name": "My Site",
	"name": "Daily Backup",
	"frequency": "daily",
	"cron_expression": "0 2 * * *",
	"backup_type": "full",
	"storage_type": "both",
	"gdrive_folder": "forge-backups/my-site",
	"local_retention_count": 7,
	"gdrive_retention_count": 7,
	"enabled": true,
	"last_run_at": "2026-01-16T02:00:00Z",
	"last_run_status": "success",
	"next_run_at": "2026-01-17T02:00:00Z",
	"created_at": "2026-01-10T10:30:00Z"
}
```

**GDrive Folder Listing:**

```json
{
	"path": "forge-backups/my-site",
	"folders": [
		{
			"name": "2026-01-17",
			"path": "forge-backups/my-site/2026-01-17",
			"modified_at": "2026-01-17T02:05:00Z",
			"size_bytes": 52428800,
			"file_count": 2
		},
		{
			"name": "2026-01-16",
			"path": "forge-backups/my-site/2026-01-16",
			"modified_at": "2026-01-16T02:04:30Z",
			"size_bytes": 51380224,
			"file_count": 2
		}
	],
	"files": []
}
```

---

## Future Considerations

> These items are intentionally excluded from the current plan for future
> implementation.

1. **Backup notification system** - Email/Slack/webhook alerts on backup
   success/failure
2. **Multi-cloud storage** - AWS S3, Backblaze B2 support
3. **Backup encryption** - Optional GPG encryption before upload
4. **Backup verification** - Integrity checks and test restores
5. **Concurrent backup limits** - Max 2 simultaneous backups per server
6. **Non-CyberPanel import** - Support for cPanel, Plesk, bare metal servers

---

## Files Summary

### New Files to Create

| File                                                    | Description              |
| ------------------------------------------------------- | ------------------------ |
| `forge/db/models/backup_schedule.py`                    | Database model           |
| `forge/db/alembic/versions/xxx_add_backup_schedules.py` | Migration                |
| `forge/api/celery_schedule_loader.py`                   | Celery Beat DB scheduler |
| `forge/api/routes/admin/cyberpanel_users.py`            | User management API      |
| `forge/api/routes/admin/clone.py`                       | Clone API endpoints      |
| `forge/commands/clone.py`                               | Clone CLI commands       |
| `dashboard/src/pages/ImportProjects.tsx`                | Import UI                |
| `dashboard/src/components/CreateBackupModal.tsx`        | Backup creation modal    |
| `dashboard/src/components/RestoreBackupModal.tsx`       | Restore modal            |
| `dashboard/src/components/ScheduleModal.tsx`            | Schedule create/edit     |
| `dashboard/src/components/GDriveBrowser.tsx`            | Google Drive browser     |

### Files to Modify

| File                                    | Changes                                 |
| --------------------------------------- | --------------------------------------- |
| `forge/db/models/__init__.py`           | Export BackupSchedule                   |
| `forge/api/routes/admin/schedules.py`   | Replace mock with DB                    |
| `forge/api/backup_tasks.py`             | Add schedule execution logic            |
| `forge/api/celery_worker.py`            | Initialize scheduler                    |
| `forge/api/google_drive_integration.py` | Add cleanup_old_backups()               |
| `forge/commands/sync.py`                | Add --gdrive-retention, cleanup command |
| `forge/services/cyberpanel_service.py`  | Add user management methods             |
| `forge/commands/provision.py`           | Add user, import, site-full commands    |
| `dashboard/src/pages/Backups.tsx`       | Connect to API                          |
| `dashboard/src/pages/Schedules.tsx`     | Connect to API                          |

---

## Approval Checklist

- [ ] Database schema approved
- [ ] API endpoints approved
- [ ] CLI commands approved
- [ ] Dashboard UI mockups approved
- [ ] Default values approved
- [ ] Implementation phases approved

---

_Document prepared for review. Please provide feedback on any section requiring
changes._

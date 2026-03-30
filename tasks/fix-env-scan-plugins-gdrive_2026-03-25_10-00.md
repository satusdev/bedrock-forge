# Fix: Environment Scan Flow, Plugin Scans, GDrive Backup ID

**Date:** 2026-03-25  
**Status:** PASSED

---

## Task

1. **Add Environment** must scan a server for WordPress sites instead of forcing
   manual form entry. Filter servers by `(server_id, type)` combo — same server
   can have production + staging.
2. **Plugin scan results** never reach the frontend because the `plugin-scans`
   queue is not wired into the WebSocket gateway. The frontend also blindly
   waits 5s and re-fetches.
3. **`PluginInfo` type is misaligned** with the PHP script output: `active`
   field expected by TS but never produced by PHP; `latest_version`,
   `update_available`, `plugin_uri` produced by PHP but absent from TS type.
4. **Environment model** needs a `google_drive_folder_id` field (optional) for
   per-environment Google Drive backup folder override.
5. **Edit Environment form** needs the `google_drive_folder_id` field exposed.

---

## Plan

### Step 1: Prisma — add `google_drive_folder_id` to `Environment`

### Step 2: Shared types — align `PluginInfo` with PHP script output

### Step 3: Backend — Update Environment DTOs + Repository to include new field

### Step 4: Backend — Add `POST /projects/:projectId/environments/scan-server` endpoint

### Step 5: Backend — Wire `plugin-scans` queue into WebSocket gateway

### Step 6: Worker — RcloneService + BackupProcessor use per-env GDrive folder ID

### Step 7: Frontend — Rewrite "Add Environment" as 2-step scan wizard

### Step 8: Frontend — Update "Edit Environment" form with GDrive field

### Step 9: Frontend — Fix PluginsTab (WebSocket + updated columns)

---

## Risks

- `ServersService` must be importable from `EnvironmentsModule` without circular
  deps
- Prisma migration must run cleanly against existing data (nullable column,
  safe)
- `PluginInfo` type change affects worker, API, and frontend — update all
  consumers together

---

## Verification

- `pnpm prisma migrate dev` succeeds
- `pnpm build` passes across all apps/packages
- Add Env: scan wizard works end-to-end
- Plugin scan: WebSocket delivers completion notification
- Edit Env: google_drive_folder_id saves and displays correctly

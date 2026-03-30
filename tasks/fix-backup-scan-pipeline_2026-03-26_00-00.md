# Fix Backup & Plugin Scan Pipeline

**Status:** IN PROGRESS  
**Date:** 2026-03-26

---

## Task

Backup and plugin scan jobs are enqueued but never produce results. The UI shows
"No backups for this environment yet." and scans never complete.

## Root Causes

1. **CRITICAL — `scriptsPath` wrong default**: `worker.config.ts` defaults to
   `/app/scripts` but the PHP scripts are at `/app/apps/worker/scripts`. Every
   backup and scan job crashes with `ENOENT` on `readFileSync`, retries 3×,
   dies. `Backup` DB row is only created on success → UI shows nothing.

2. **MAJOR — No Backup row for pending/failed jobs**: `Backup` row is created
   only on worker success. Users see zero feedback for in-progress or failed
   attempts.

3. **MODERATE — Plugin scan missing SSH key fallback**: Directly calls
   `this.enc.decrypt(server.ssh_private_key_encrypted)` without fallback to
   `AppSetting('global_ssh_private_key')`. Servers using global key → scan
   fails.

4. **MODERATE — Plugin scan crashes on wp-config pull**: Unconditional
   `pullFile('/.../wp-config.php')` crashes for Bedrock sites. The result is
   unused (void'd). Should be removed.

5. **MINOR — BackupsPage missing JOB_FAILED handler**: Progress bar sticks on
   failure. No destructive toast shown.

6. **MINOR — error_message not displayed**: Fetched but never rendered in table
   rows.

7. **MINOR — Plugin scan failure toast missing error detail**: Toast title only,
   no description.

## Plan

- [x] Step 1: Fix `scriptsPath` default in `worker.config.ts`
- [x] Step 2: Create `Backup` row at enqueue time + worker updates existing row
- [x] Step 3: Add `resolvePrivateKey()` to plugin scan processor
- [x] Step 4: Remove unused wp-config pull from plugin scan processor
- [x] Step 5: Add `JOB_FAILED` handler + env room subscription to BackupsPage
- [x] Step 6: Display `error_message` in backup table rows (both pages)
- [x] Step 7: Include error detail in plugin scan failure toast
- [x] Step 8: Update `BackupCreatePayload` schema to include `backupId`
- [x] Step 9: Add `SCRIPTS_PATH` to `.env.example`

## Verification

- All 4 packages build cleanly (shared, remote-executor, api, worker, web)
- `scriptsPath` resolves to `/app/apps/worker/scripts` in prod and
  `apps/worker/scripts` in dev (verified via node eval)

**Status: PASSED (Round 2 — 2026-03-26)**

## Round 2 — Follow-up fixes applied

### Root causes identified and fixed

**1. UI showed stale "pending" status (primary complaint)**

- Backup and scan `JobExecution` rows were being set to `failed` in the DB by
  the worker catch block, but the frontend never learned about it because
  WebSocket `job:failed` events were missed and no polling fallback existed.
- Fix: Added `refetchInterval: 15_000` to backups and plugin-scan queries in
  `BackupsPage.tsx`, `BackupsTab.tsx`, `PluginsTab.tsx`.
- `MonitorsPage.tsx`: Added `refetchInterval: 30_000` +
  `useWebSocketEvent(MONITOR_RESULT)` listener.

**2. `JobExecution → active` update was outside try/catch in both processors**

- If that DB call threw (any reason), the catch block (which sets `failed`) was
  bypassed, leaving rows stuck at `queued`/`pending` permanently.
- Fix: Moved `jobExecution.update({ status: 'active' })` inside the try block in
  both `backup.processor.ts` and `plugin-scan.processor.ts`.
- Also wrapped catch-block `jobExecution.update({ status: 'failed' })` with
  `.catch(e => logger.error(...))` so secondary Prisma errors don't swallow the
  original error.

**3. Monitor `last_status` / `last_response_ms` never written to DB**

- Monitor processor wrote only `last_checked_at` and `uptime_pct`. `last_status`
  was always `null`, rendered as "pending" in the UI.
- Fix: Added `last_status: statusCode` and `last_response_ms: responseTimeMs` to
  the `monitor.update()` call.

**4. Gateway had no `monitors` queue bridge**

- No `QueueEvents` listener for `QUEUES.MONITORS`, so completed monitor jobs
  never emitted WS events.
- Fix: Added `monitorsQueueEvents` bridge that emits `MONITOR_RESULT` to
  subscribed rooms on job completion.

### Outstanding operational issue (not a code bug)

`Cannot parse privateKey: Unsupported key format` — the SSH private key stored
in the server settings is not in a format the ssh2 library can parse. Likely
causes:

- Key was pasted in PuTTY PPK format instead of OpenSSH/PEM format
- Key has missing newlines or header corruption
- ENCRYPTION_KEY mismatch between when the key was stored and when it is
  decrypted

**Action required**: In the app Settings, navigate to the server whose SSH key
fails, delete the current SSH key, and re-paste a valid OpenSSH private key
(`-----BEGIN OPENSSH PRIVATE KEY-----` or RSA PEM format).

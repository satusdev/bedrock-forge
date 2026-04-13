# Task: Reports Management Page

**Status:** IN PROGRESS  
**Date:** 2026-04-08

## Context

The report schedule config lives buried in the Settings page with no history, no
channel picker, and no date range flexibility. Users need a proper `/reports`
page.

## Plan

### Phase 1: Backend

- Add `GenerateReportDto` (channelIds, period) to DTO file
- `POST /reports/generate` → accept DTO, forward to job payload
- `GET /reports/history` → return JobExecution rows for QUEUES.REPORTS
- `GET /reports/channels` → return sanitised NotificationChannel[] subscribed to
  'report.weekly'
- `ReportsService`: add getHistory(), getAvailableChannels(), update
  generateNow(dto)

### Phase 2: Worker

- Read `period` from job payload, compute startDate/endDate from preset
- Read `channelIds` from job payload, filter channels if present
- Update PDF header to show actual date range label

### Phase 3: Frontend

- Create `ReportsPage.tsx` with 3 sections: Generate, History, Schedule
- Add `/reports` route in App.tsx (lazy, AdminRoute)
- Add "Reports" sidebar nav item (FileBarChart icon, minRole: admin)
- Remove Weekly Reports section from SettingsPage.tsx

## Verification

- [ ] pnpm --filter @bedrock-forge/api build
- [ ] pnpm --filter @bedrock-forge/worker test
- [ ] pnpm --filter @bedrock-forge/web build

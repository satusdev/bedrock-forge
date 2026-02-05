# Bedrock Forge – Focus List (What’s Next)

This file keeps the open gaps visible and de‑clutters completed work.

---

## ✅ Done (recently completed)

- Invoices UI (list, view, PDF, mark paid)
- Client Portal shell (token entry + basic lists)
- Analytics: GA4 + Lighthouse UI
- Restore UI (backup restore + Drive restore flow)

---

## Phase 1 – Stability + Core UX (now)

### Public Status Page UI

- Public `/status` route, no auth
- Health + incident history

#### Tasks

Dependencies: API contract, incident history endpoint

- [x] Define API contract for public status + incident history
- [x] Hook incident history to API + pagination
- [x] Build `/status` page UI + state handling
- [x] Add SEO metadata + caching headers

### Client Portal hardening

- Authentication flow + role separation
- Real client views: subscriptions, invoices, backups
- Ticketing for clients (create/track/respond + notifications)

#### Tasks

Dependencies: portal auth, billing/subscriptions endpoints

- [x] Define portal auth roles + permissions matrix
- [x] Implement portal session + token refresh flow
- [x] Add portal API endpoints for subscriptions/invoices/backups
- [x] Build subscriptions view + invoice detail pages
- [x] Ticketing: schema + routes + notification events
- [x] Ticketing UI: list, detail, respond, attachments

### Docs accuracy + scope alignment

- Audit README + CHANGELOG
- Tag features as ✅ / 🚧 / 🗺
- SEO suite MVP scope (beyond Lighthouse) and remove overstated claims

#### Tasks

Dependencies: implementation status audit

- [x] Reconcile feature list with implementation status
- [x] Update README + CHANGELOG tags
- [x] Define SEO MVP checklist + roadmap

---

## Phase 2 – WP‑CLI Remote Runner + Environment Management

### WP‑CLI without per‑site plugin

- Remote runner service to execute WP‑CLI against a site (SSH/WP‑CLI) without
  installing a companion plugin per site
- Credential vaulting for per‑site access (SSH keys + optional app creds)
- Safe command allowlist + audit logs
- UI flow: open site → verify creds → run tasks

#### Tasks

Dependencies: credential storage, audit logging, SSH access model

- [x] Define remote runner architecture + queue model
- [x] Implement secure command allowlist + validation
- [x] Add credentials vaulting (SSH keys, optional app creds)
- [x] Build runner execution + output capture
- [x] Audit logging for all WP‑CLI runs
- [x] UI: site‑level runner panel + history

### Environment handling (Bedrock: dev/staging/prod)

- Formalize env types and rules for deploy, backups, and monitoring
- UI: environment selector + visibility filter
- Config: enforce environment‑specific defaults (e.g., staging email
  suppression)

#### Tasks

Dependencies: environment model update

- [ ] Extend environment model + config defaults
- [ ] Propagate env type to deploy/backup/monitor workflows
- [ ] UI filters + badges for env types
- [ ] Document env behavior and safe defaults

---

## Phase 3 – Plugins + Billing + Dev Tooling

### Vendor plugin handling

- Plugin discovery + install policy (trusted lists + version pins)
- Support for site‑specific and global plugins
- Health checks: expected plugins + drift detection

#### Tasks

Dependencies: policy/trust model

- [x] Define plugin policy + trust model
- [x] Implement plugin inventory + drift checks
- [x] UI: per‑site plugin status + remediation actions
- [x] Support vendor bundle definitions + pinning

### Billing + support packages

- Support packages page + purchase flow
- Subscription management + renewal UX
- Usage‑based or tiered add‑ons

#### Tasks

Dependencies: billing tiers + support packages defined

- [x] Define billing tiers + support packages
- [x] Add API endpoints + subscription status events
- [x] Implement billing UI flow + purchase
- [x] Add invoices/receipts UX for support add‑ons

### Dev tooling & management

- Migration safety: auto‑stamp detection + smoke test in CI
- Better error surfacing in docker startup and scripts
- Diagnostic toolkit (env checks, DB health, queue health)

#### Tasks

Dependencies: CI pipeline + diagnostics framework

- [x] Add migration smoke test in CI
- [x] Add health diagnostics command (`forge-doctor`)
- [x] Improve runtime logging for migration failures

### Codebase modularization + reusable components

- Break UI and backend logic into smaller, reusable components/services
- Standardize patterns to simplify edits and maintenance

#### Tasks

Dependencies: shared design patterns + code ownership areas

- [x] Audit current UI components for duplication
- [x] Extract shared UI components + hooks
- [x] Define backend service boundaries + shared utilities
- [x] Create refactor checklist for new features

---

## Phase 4 – Quality + Scale (later)

- Performance optimization suite expansion
- Frontend tests (Vitest/Jest)
- Type safety (OpenAPI → TS types)
- API docs exposure strategy (`/docs`/`/redoc`)
- Database strategy + migration guidance (long‑term)

#### Tasks

Dependencies: performance metrics + OpenAPI stability

- [ ] Establish performance baselines + budgets
- [ ] Add CI test suite + coverage gates
- [ ] Generate typed API client from OpenAPI

---

## Notes / Open Questions

- WP‑CLI remote runner: SSH only vs SSH + API credentials
- Multi‑tenant plugin strategy: vendor bundles vs per‑site custom
- Client ticketing: SLA + escalation rules

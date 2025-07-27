# Project/Site Creation & Automation TODO

## 1. Project Creation & Structure (Detailed Steps)

### 1.1: Parent Directory Support

- 1.1.1: Refactor `site-init.sh` to accept a `--parent-dir` or similar argument.
- 1.1.2: Validate the parent directory exists and is writable.
- 1.1.3: Create the new project folder in the specified parent directory.
- 1.1.4: Commit: "feat(site-init): add parent directory support for project
  creation"

### 1.2: Copy Support Scripts

- 1.2.1: Identify all required support scripts (server, kuma, backup, etc.).
- 1.2.2: Refactor `site-init.sh` to copy these scripts into the new project
  folder.
- 1.2.3: Ensure copied scripts are executable.
- 1.2.4: Commit: "feat(site-init): copy support scripts into new project"

### 1.3: Self-Contained Project

- 1.3.1: Update all script paths/configs to be relative to the new project
  folder.
- 1.3.2: Test running scripts from the new project location.
- 1.3.3: Add a README or usage doc to the new project folder.
- 1.3.4: Commit: "fix(site-init): make new project self-contained and runnable"

### 1.4: Per-Site DB/User & Compose/.env

- 1.4.1: Refactor site creation to always generate a unique DB/user for each
  site.
- 1.4.2: Generate a dedicated Docker Compose file for the site's DB and app.
- 1.4.3: Generate a `.env` file with only the site's DB/user credentials.
- 1.4.4: Remove any references to shared DBs unless explicitly requested.
- 1.4.5: Commit: "feat(site-init): per-site DB/user and isolated compose/env"

## 2. Hetzner & hcloud CLI Integration (Detailed Steps)

### 2.1: hcloud CLI Documentation

- 2.1.1: Write a section in the docs for installing hcloud CLI (Linux, macOS,
  Windows).
- 2.1.2: Add instructions for creating and using an hcloud context and API
  token.
- 2.1.3: Add troubleshooting tips for common hcloud CLI issues.
- 2.1.4: Commit: "docs(hcloud): add install/configure instructions for hcloud
  CLI"

### 2.2: Example Workflow Update

- 2.2.1: Update the example workflow to show server provisioning with hcloud
  CLI.
- 2.2.2: Add step-by-step CLI commands for server creation, SSH key, image,
  type, and location selection.
- 2.2.3: Commit: "docs(workflow): update example workflow for hcloud-driven
  provisioning"

### 2.3: Store Hetzner Server Info in Project

- 2.3.1: Update provisioning script to fetch and save server info (IP, ID, etc.)
  after creation.
- 2.3.2: Store this info in a project-local file (e.g., `server-info.json` or
  `.env.server`).
- 2.3.3: Add a script/command to display this info for the user.
- 2.3.4: Commit: "feat(provision): store and display Hetzner server info in
  project"

### 2.4: hcloud CLI Usage Documentation

- 2.4.1: Document how to use hcloud CLI for server management (list, describe,
  delete, etc.).
- 2.4.2: Add usage examples for common hcloud CLI commands.
- 2.4.3: Commit: "docs(hcloud): add server management usage and examples"

## 3. Cloudflare CLI Integration (Detailed Steps)

### 3.1: Cloudflare CLI Setup & Documentation

- 3.1.1: Add documentation for installing and authenticating the Cloudflare CLI
  (cfcli or cloudflare-go, etc.).
- 3.1.2: Document how to obtain and securely store Cloudflare API tokens.
- 3.1.3: Commit: "docs(cloudflare): add install/auth instructions for Cloudflare
  CLI"

### 3.2: DNS Automation Scripts & Docs

- 3.2.1: Refactor or create scripts to use Cloudflare CLI for adding/removing
  DNS records (A, CNAME, etc.).
- 3.2.2: Update existing DNS automation scripts to use Cloudflare CLI instead of
  manual API calls or curl.
- 3.2.3: Add documentation and usage examples for DNS automation scripts.
- 3.2.4: Commit: "feat(dns): automate DNS with Cloudflare CLI and update docs"

### 3.3: Workflow Integration for Domain Setup

- 3.3.1: Update the project workflow to include domain and subdomain setup
  immediately after server creation.
- 3.3.2: Add a step to verify DNS propagation and provide user feedback.
- 3.3.3: Document the full flow from server creation to DNS setup.
- 3.3.4: Commit: "docs(workflow): add domain setup steps after server creation"

## 4. Workflow & Documentation (Detailed Steps)

### 4.1: Update Core Documentation

- 4.1.1: Rewrite the main README to reflect the new project creation flow,
  hcloud, and Cloudflare CLI usage.
- 4.1.2: Add a "Quick Start" section for new users.
- 4.1.3: Commit: "docs: update README for new project flow and tools"

### 4.2: Update Example Workflow

- 4.2.1: Rewrite `docs/example-workflow.md` to show the new, automated, modular
  process step-by-step.
- 4.2.2: Include CLI commands, expected outputs, and screenshots/diagrams if
  helpful.
- 4.2.3: Commit: "docs(workflow): update example workflow for new automation"

### 4.3: Troubleshooting & FAQ

- 4.3.1: Add a dedicated troubleshooting section for common issues (DB, DNS,
  server, etc.).
- 4.3.2: Add an FAQ section for recurring questions and edge cases.
- 4.3.3: Commit: "docs: add troubleshooting and FAQ sections"

### 4.4: Usage Docs for All Scripts

- 4.4.1: For each included script (server, kuma, backup, etc.), add a usage
  section or dedicated doc.
- 4.4.2: Link these docs from the main README and workflow.
- 4.4.3: Commit: "docs: add usage docs for all included scripts"

## 5. Project Metadata & Automation (Detailed Steps)

### 5.1: Collect & Store Project Info After Provisioning

- 5.1.1: Update provisioning scripts to collect all relevant info (server IP,
  DNS, DB creds, etc.) after each step.
- 5.1.2: Define a standard format for the project info file (e.g.,
  `project-info.json` or `.env.project`).
- 5.1.3: Write/update the info file after each provisioning step.
- 5.1.4: Commit: "feat(provision): collect and store project info after
  provisioning"

### 5.2: Make Project Info Available to Other Scripts

- 5.2.1: Refactor deploy, backup, monitoring, and other scripts to read from the
  project info file.
- 5.2.2: Add error handling if info is missing or outdated.
- 5.2.3: Commit: "feat(scripts): use project info file for all automation
  scripts"

### 5.3: Human-Friendly Project Info Display

- 5.3.1: Add a script (e.g., `show-project-info.sh`) to print all project info
  in a readable format.
- 5.3.2: Optionally, add a summary command to the main Makefile or CLI.
- 5.3.3: Document usage in the README and workflow.
- 5.3.4: Commit: "feat(info): add script to display project info"

## 6. Recommendations & Further Improvements (Detailed Steps)

### 6.1: Automated SSL (Let's Encrypt)

- 6.1.1: Add a script to request and install SSL certificates via Let's Encrypt
  (e.g., using certbot or acme.sh).
- 6.1.2: Integrate SSL setup into the workflow after DNS is verified.
- 6.1.3: Document usage and troubleshooting for SSL automation.
- 6.1.4: Commit: "feat(ssl): add automated Let's Encrypt SSL setup script"

### 6.2: Automated Backup Scheduling

- 6.2.1: Add a script to set up scheduled backups using cron or systemd timers.
- 6.2.2: Allow configuration of backup frequency and retention.
- 6.2.3: Document how to enable/disable and monitor scheduled backups.
- 6.2.4: Commit: "feat(backup): add automated backup scheduling script"

### 6.3: Automated Kuma Monitor Registration

- 6.3.1: Add a script to register new servers/services with Kuma monitoring
  automatically.
- 6.3.2: Integrate this step into the provisioning or deployment workflow.
- 6.3.3: Document Kuma integration and monitoring best practices.
- 6.3.4: Commit: "feat(monitor): add automated Kuma monitor registration script"

### 6.4: Automated Cloudflare DNS Checks

- 6.4.1: Add a script to verify DNS records and propagation using Cloudflare
  CLI/API.
- 6.4.2: Integrate DNS checks into the workflow after record creation.
- 6.4.3: Document DNS validation and troubleshooting.
- 6.4.4: Commit: "feat(dns): add automated Cloudflare DNS check script"

### 6.5: Automated Server Teardown

- 6.5.1: Add a script to destroy servers, clean up DNS records, and remove
  project metadata.
- 6.5.2: Add safety checks and confirmations before destructive actions.
- 6.5.3: Document teardown process and recovery options.
- 6.5.4: Commit: "feat(teardown): add automated server teardown script"

### 6.6: Integration Tests for Full Workflow

- 6.6.1: Write integration tests covering the full workflow (local → server →
  DNS → deploy).
- 6.6.2: Automate test execution and reporting.
- 6.6.3: Document how to run and interpret integration tests.
- 6.6.4: Commit: "test: add integration tests for full workflow"

### 6.7: Project Generator Script

- 6.7.1: Add a script to bootstrap a new project with all required configs,
  scripts, and docs in one command.
- 6.7.2: Allow customization of project name, location, and initial settings.
- 6.7.3: Document usage and options for the project generator.
- 6.7.4: Commit: "feat(generator): add project generator script"

# Project/Site Creation & Automation TODO

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

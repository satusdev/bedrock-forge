<div align="center">
    <h1>Site WordPress Docker/Bedrock Environment</h1>
    <!-- Add a relevant logo/icon if available, otherwise omit or use a generic one -->
    <!-- <img src="./assets/images/icon.png" alt="logo"/> -->
</div>

## Modular Workflow 🚀

This project now uses a modular script workflow for all local, deployment, sync,
and provisioning tasks:

- `scripts/local/site-init.sh` — Create a new local Bedrock site
- `scripts/local/env-switch.sh` — Switch active .env for a site
- `scripts/provision/provision-cyberpanel.sh` — Provision CyberPanel/Hetzner
  server
- `scripts/deploy/deploy.sh` — Deploy code to remote server
- `scripts/sync/sync-db.sh` — Sync database (push/pull)
- `scripts/sync/sync-uploads.sh` — Sync uploads (push/pull)
- `scripts/sync/rclone-gui.sh` — Launch rclone web GUI
- `scripts/provision/kuma-monitor.sh` — Kuma monitoring integration
- `scripts/deploy/jenkins/Jenkinsfile` — Jenkins CI/CD pipeline

**Usage Examples:**

```sh
# Create a new local site
./scripts/local/site-init.sh mysite --port=8001

# Switch environment
./scripts/local/env-switch.sh mysite staging

# Provision server
./scripts/provision/provision-cyberpanel.sh mysite.com

# Deploy code
./scripts/deploy/deploy.sh mysite staging

# Sync database
./scripts/sync/sync-db.sh mysite staging push   # push local → remote
./scripts/sync/sync-db.sh mysite staging pull   # pull remote → local

# Sync uploads
./scripts/sync/sync-uploads.sh mysite staging push
./scripts/sync/sync-uploads.sh mysite staging pull

# Launch rclone GUI
./scripts/sync/rclone-gui.sh

# Kuma monitoring
./scripts/provision/kuma-monitor.sh add mysite.com
```

## Overview ⏩️

This project provides a Docker-based development environment designed to manage
multiple WordPress sites using the Bedrock boilerplate. It features:

- **Shared Database:** A single MySQL container serves all local sites.
- **Site Template:** Easily create new Bedrock sites using a pre-configured
  template.
- **Unified Management Script (`scripts/manage-site.sh`):** A powerful script to
  handle:
  - Initial remote site setup (WordPress installation, `.env` configuration).
  - Code deployment from local to remote servers (using `rsync`).
  - Database synchronization (push/pull) between local and remote.
  - Uploads synchronization (push/pull) using `rclone` and a configured cloud
    storage remote.
- **Makefile:** Simplifies common local Docker operations (start/stop sites, run
  commands).

**High-Level Workflow:**

```mermaid
graph LR
    subgraph Local Machine
        A[Developer] --> B(Edit Code / Run Make Commands)
        B --> C{Local Docker Environment - Bedrock Site}
        B --> D[manage-site.sh Script]
    end

    subgraph Remote Infrastructure
        E[Remote Server - Staging/Production]
        F[Cloud Storage - rclone Remote]
    end

    D -- "deploy / setup-new-site (rsync)" --> E
    D -- "pull-db / push-db (wp-cli, scp)" --> E
    D -- "push-uploads / pull-uploads (rclone)" --> F

    style Local Machine fill:#ccf,stroke:#333,stroke-width:2px
    style Remote Infrastructure fill:#f9f,stroke:#333,stroke-width:2px
```

This README aims to be comprehensive, guiding you through setup, usage, and the
underlying concepts.

## Table of Contents 📄

- [Project Structure](#project-structure-)
- [Requirements](#requirements-%EF%B8%8F)
- [Documentation](#documentation-)
- [Migration from Legacy Scripts](#migration-from-legacy-scripts)
- [Further Automation Ideas](#further-automation-ideas-)
- [Getting Help](#getting-help-) ------- ADD AFTER

## Documentation 📖

Detailed documentation is available in the `docs/` directory:

## Migration from Legacy Scripts

If you previously used this project with monolithic scripts (e.g.,
`manage-site.sh`, `create-site.sh`, `switch-env.sh`), please note:

**Legacy scripts removed:**

- `manage-site.sh` → replaced by modular scripts in `scripts/local/`,
  `scripts/provision/`, `scripts/deploy/`, `scripts/sync/`
- `create-site.sh` → replaced by `scripts/local/site-init.sh`
- `switch-env.sh` → replaced by `scripts/local/env-switch.sh`
- `sync-config.sample.json` → replaced by `config/sync-config.json`

**Migration checklist:**

1. Use the new modular scripts for all local, provisioning, deployment, sync,
   and backup tasks.
2. Update any automation or CI/CD jobs to use the modular scripts.
3. Review and update your `config/sync-config.json` as needed.
4. Remove any custom scripts based on the old monolithic workflow.
5. Refer to the updated docs and usage examples below.

For a full mapping of old commands to new modular equivalents, see the
[docs/migration.md](docs/migration.md) (to be created).

## Documentation 📖

Detailed documentation is available in the `docs/` directory:

- **[Core Concepts & Tools Explained](./docs/concepts.md):** Understand Docker,
  Bedrock, Composer, WP-CLI, Make, rsync/rclone/jq, and the project scripts.
- **[Local Development](./docs/local-development.md):** Covers initial setup,
  creating new local sites (`create-site.sh`), and using the Makefile for common
  tasks.
- **[Deployment & Remote Management](./docs/deployment.md):** Details remote
  server setup, the full deployment workflow example, and using the
  `manage-site.sh` script for deployment and data synchronization.
- **[Automated Provisioning](./docs/provisioning.md):** Explains the
  `scripts/provision-cyberpanel-bedrock.sh` script for setting up
  CyberPanel/Cloudflare infrastructure.
- **[Configuration Details](./docs/configuration.md):** Describes the core
  configuration, site template structure, and container naming conventions.
- **[Default Installed Plugins](./docs/plugins.md):** Lists the plugins included
  in the site template.
- **[Security Best Practices](./docs/security.md):** Recommendations for
  securing your environment and sites.
- **[Troubleshooting Guide](./docs/troubleshooting.md):** Solutions for common
  problems.
- **[Automated CI/CD](./docs/deployment.md#automated-cicd-with-github-actions-️):**
  Explains the GitHub Actions workflow for automated testing and deployment.

## Project Structure 🏗️

```
.
├── core/                     # Shared Docker configs (DB, Base Image)
│   ├── .env.example
│   ├── docker-compose-db.yml
│   └── Dockerfile
├── config/                   # Central config (sync-config.json, envs)
│   ├── .env.local
│   ├── .env.production
│   └── sync-config.json
├── scripts/
│   ├── local/                # Local site management (site-init, env-switch, etc.)
│   ├── provision/            # Provisioning (server, DNS, hardening, rclone, etc.)
│   ├── deploy/               # Deployment (deploy.sh, Jenkinsfile, etc.)
│   ├── sync/                 # Sync/backup (db, uploads, backup, restore, rclone GUI)
│   ├── ci/                   # Jenkins pipeline registration
│   ├── monitoring/           # Kuma monitor registration
│   ├── common/               # Shared helpers (logging, config, utils)
│   └── logs/                 # Log files (rotated by logrotate)
├── docs/                     # Documentation (concepts, usage, migration, workflow)
├── websites/
│   └── template/             # Template for creating new sites
│       ├── .env.*.tpl        # Template env files
│       ├── .env.example
│       ├── docker-compose.yml.tpl
│       ├── nginx.conf.tpl
│       ├── uploads.ini
│       └── www/              # Base Bedrock install (run composer install here first)
├── .env.example
├── .gitignore
├── Makefile                  # Shortcuts for local Docker tasks
├── nginx.conf                # Default Nginx config (referenced by site configs)
└── README.md
```

## Requirements ⏸️

**Local Machine:**

- [Docker](https://docs.docker.com/get-docker/) &
  [Docker Compose](https://docs.docker.com/compose/install/)
- [Composer](https://getcomposer.org/)
- `git`
- `curl` (Used by `create-site.sh` for salts)
- `openssl` (Used by `create-site.sh` for passwords/salts)
- `make` (Optional, for using the Makefile shortcuts)
- `jq` (Required by `manage-site.sh`)
- `rclone` (Required by `manage-site.sh` for uploads sync)
- `rsync` (Required by `manage-site.sh` for deployment)
- `ssh` & `scp` clients (Required by `manage-site.sh`)
- Scripts should be executable: `chmod +x *.sh scripts/*.sh`

**Remote Server (for Deployment/Sync):**

- SSH access (key-based authentication highly recommended)
- `sudo` access (often needed for setting permissions, running commands as web
  user)
- `git`
- `composer`
- `wp-cli` (Installed globally, e.g., in `/usr/local/bin/wp`)
- `rsync`
- `rclone` (If syncing uploads directly to/from the server filesystem via cloud)
- Correct PHP version (matching your Bedrock requirements, e.g., PHP 8.1+)
- Web server (Nginx/Apache/OpenLiteSpeed) configured to serve the Bedrock site
  (document root should be `<remote_path>/web/`)
- Database server (MySQL/MariaDB)

## Getting Help 🆘

- Run `./scripts/local/site-init.sh --help` for local site creation options.
- Run `./scripts/local/env-switch.sh --help` for environment switching.
- Refer to documentation for Bedrock, Docker, WP-CLI, rclone, jq.
- Check the Roots Discourse for Bedrock questions: https://discourse.roots.io/

# Bedrock CLI Implementation Plan

This document outlines the step-by-step plan to build the **Bedrock CLI**, a Python command-line interface for orchestrating Bedrock-based WordPress workflows. It covers local project setup with DDEV, server provisioning, synchronization/backups, deployment, monitoring, CI/CD, and workflow orchestration. The plan is divided into phases for gradual implementation, with a checklist to track progress.

## Table of Contents

- [Overview](#overview)
- [Goals and Principles](#goals-and-principles)
- [Project Structure](#project-structure)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Setup and Core Structure](#phase-1-setup-and-core-structure)
  - [Phase 2: Local Project Management](#phase-2-local-project-management)
  - [Phase 3: Provisioning Commands](#phase-3-provisioning-commands)
  - [Phase 4: Sync and Backup Commands](#phase-4-sync-and-backup-commands)
  - [Phase 5: Deployment and CI/CD](#phase-5-deployment-and-cicd)
  - [Phase 6: Monitoring and Workflows](#phase-6-monitoring-and-workflows)
  - [Phase 7: Testing and Optimization](#phase-7-testing-and-optimization)
- [Checklist](#checklist)

## Overview

The Bedrock CLI consolidates tasks for Bedrock WordPress projects into a single Python CLI (`python -m cli`). It replaces legacy Bash scripts with modular, cross-platform Python code, supporting local development (DDEV), server provisioning (Hetzner, CyberPanel), sync/backups (`rclone`), deployment (`rsync`), monitoring (Uptime Kuma), and CI/CD (Jenkins). This plan ensures a maintainable, extensible solution with clear steps for implementation.

## Goals and Principles

### Goals
- Create a unified CLI with subcommands: `local`, `provision`, `sync`, `deploy`, `monitor`, `ci`, `workflow`.
- Support local project creation/management with DDEV.
- Automate server provisioning, deployment, backups, and monitoring.
- Ensure cross-platform compatibility (Windows/Linux/macOS).
- Centralize configuration and logging.
- Enable extensibility via plugins.
- Include tests and documentation.

### Principles
- **Modularity**: Organize commands in `commands/` (e.g., `local.py`, `sync.py`).
- **Phased Approach**: Start with core structure, then add commands incrementally.
- **Security**: Use `pydantic` for config validation, `python-dotenv` for env vars.
- **User-Friendly**: Support `--dry-run`, `--verbose`, interactive prompts.
- **Maintainability**: Use `pytest` for testing, `structlog` for logging.

## Project Structure

```plaintext
bedrock-cli/
├── cli/                     # CLI source code
│   ├── main.py              # CLI entrypoint
│   ├── commands/            # Subcommands
│   │   ├── __init__.py
│   │   ├── local.py         # DDEV project management
│   │   ├── provision.py     # Server provisioning
│   │   ├── sync.py          # Sync and backups
│   │   ├── deploy.py        # Code deployment
│   │   ├── ci.py            # CI/CD integration
│   │   ├── monitor.py       # Monitoring setup
│   │   ├── info.py          # Project/server info
│   │   ├── workflow.py      # Workflow orchestration
│   ├── utils/               # Shared utilities
│   │   ├── __init__.py
│   │   ├── config.py        # Configuration loading
│   │   ├── logging.py       # Structured logging
│   │   ├── shell.py         # Shell command wrapper
│   │   ├── errors.py        # Custom exceptions
│   │   ├── api.py           # API clients (GitHub, Hetzner, etc.)
│   │   ├── ssh.py           # SSH operations
│   ├── config/              # Configuration files
│   │   ├── default.json     # Centralized config
│   │   ├── example.*.json   # Config templates
│   │   ├── .env.local      # Local env variables
│   │   ├── .env.*          # Other env variables
│   ├── tests/               # Unit/integration tests
│   ├── docs/                # Documentation
│   │   ├── cli-usage.md
│   │   ├── cli-architecture.md
│   ├── plugins/             # Custom extensions
│   │   ├── __init__.py
│   │   ├── custom.py
│   └── logs/                # Log files
├── scripts/                 # Legacy Bash scripts (optional)
├── LICENSE                  # MIT License
├── README.md                # Project overview
└── PLAN.md                  # This file
```

## Implementation Phases

### Phase 1: Setup and Core Structure

**Goal**: Establish foundation with CLI entrypoint, utilities, and configuration.

**Steps**:
- Create directory structure (see [Project Structure](#project-structure)).
- Set up `pyproject.toml` and `requirements.txt` (install deps with `pip install -r requirements.txt`).
- Implement `main.py`, `utils/logging.py`, `utils/errors.py`, `utils/config.py`, `utils/shell.py`.
- Create `config/example.default.json` and env examples.
- Test: `python -m cli --help`.

### Phase 2: Local Project Management

**Goal**: Implement `local` subcommand for DDEV project creation/management.

**Steps**:
- Implement `commands/local.py` (create-project, manage).
- Add `utils/api.py` for GitHub repo creation (using `requests`).
- Test: `python -m cli local create-project myproject --dry-run`.

### Phase 3: Provisioning Commands

**Goal**: Implement `provision` subcommand for server setup.

**Steps**:
- Implement `commands/provision.py` (hetzner-create, cyberpanel-provision, dns-add, etc.).
- Use `utils/api.py` for Hetzner/Cloudflare APIs; `utils/ssh.py` for SSH operations.
- Test: `python -m cli provision hetzner-create myserver --dry-run`.

### Phase 4: Sync and Backup Commands

**Goal**: Implement `sync` subcommand for backups, restores, DB/uploads sync.

**Steps**:
- Implement `commands/sync.py` (backup, restore, db, uploads, pull).
- Use `subprocess` for DDEV/`rclone`; `utils/ssh.py` for remote operations.
- Test: `python -m cli sync backup myproject production --dry-run`.

### Phase 5: Deployment and CI/CD

**Goal**: Implement `deploy` and `ci` subcommands.

**Steps**:
- Implement `commands/deploy.py` (deploy code via SSH/rsync).
- Implement `commands/ci.py` (Jenkins integration with `requests`).
- Test: `python -m cli deploy myproject production --dry-run`.

### Phase 6: Monitoring and Workflows

**Goal**: Implement `monitor` and `workflow` subcommands.

**Steps**:
- Implement `commands/monitor.py` (kuma-monitor, logrotate-setup).
- Implement `commands/workflow.py` (full-project, etc.).
- Test: `python -m cli workflow full-project myproject production example.com --dry-run`.

### Phase 7: Testing and Optimization

**Goal**: Add tests and polish the CLI.

**Steps**:
- Implement tests in `tests/` (use `pytest-mock` for APIs/SSH).
- Add plugins in `plugins/custom.py`.
- Update `docs/cli-usage.md` with examples.
- Optimize performance and security (e.g., `keyring` for tokens).

## Checklist

Use this checklist to track progress. Copy it to a tracking tool or Markdown file.

### Phase 1: Setup and Core Structure
- [ ] Create directory structure
- [ ] Set up `pyproject.toml` and `requirements.txt`
- [ ] Implement `main.py`
- [ ] Implement `utils/logging.py`
- [ ] Implement `utils/errors.py`
- [ ] Implement `utils/config.py`
- [ ] Implement `utils/shell.py`
- [ ] Create `config/example.default.json` and env examples
- [ ] Test CLI help

### Phase 2: Local Project Management
- [ ] Implement `commands/local.py` (create-project, manage)
- [ ] Implement `utils/api.py` (GitHub repo creation)
- [ ] Test local subcommands

### Phase 3: Provisioning Commands
- [ ] Implement `commands/provision.py`
- [ ] Enhance `utils/api.py` (Hetzner, Cloudflare)
- [ ] Implement `utils/ssh.py`
- [ ] Test provision subcommands

### Phase 4: Sync and Backup Commands
- [ ] Implement `commands/sync.py`
- [ ] Integrate DDEV and `rclone`
- [ ] Test sync subcommands

### Phase 5: Deployment and CI/CD
- [ ] Implement `commands/deploy.py`
- [ ] Implement `commands/ci.py`
- [ ] Test deploy and ci subcommands

### Phase 6: Monitoring and Workflows
- [ ] Implement `commands/monitor.py`
- [ ] Implement `commands/workflow.py`
- [ ] Test monitor and workflow subcommands

### Phase 7: Testing and Optimization
- [ ] Implement tests in `tests/`
- [ ] Enhance plugins
- [ ] Update docs
- [ ] Optimize performance/security
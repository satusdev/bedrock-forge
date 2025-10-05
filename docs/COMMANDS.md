# Command Reference

Complete reference for all Bedrock Forge commands, organized by module.

## 📋 Table of Contents

- [Global Options](#global-options)
- [Local Development Commands](#local-development-commands)
- [Provisioning Commands](#provisioning-commands)
- [Deployment Commands](#deployment-commands)
- [Sync & Backup Commands](#sync--backup-commands)
- [CI/CD Commands](#cicd-commands)
- [Monitoring Commands](#monitoring-commands)
- [Info Commands](#info-commands)
- [Workflow Commands](#workflow-commands)
- [Configuration Commands](#configuration-commands)

## 🌍 Global Options

These options can be used with any command:

```bash
# Environment selection
--env <environment>        # Target environment (local/staging/production)
                          # Default: local

# Dry run mode
--dry-run                  # Show what would be done without executing
                          # Useful for testing and validation

# Verbose output
--verbose                  # Enable detailed logging and debug information

# Help
--help                     # Show command help
-h                         # Short help flag
```

### Examples

```bash
# Dry run deployment to staging
python3 -m forge deploy mysite staging --dry-run

# Verbose local project creation
python3 -m forge local create-project mysite --verbose

# Production environment deployment
python3 -m forge sync backup mysite production --env production
```

## 🏠 Local Development Commands

### `forge local`

Manage local WordPress projects with DDEV integration.

#### `create-project`

Create a new Bedrock WordPress project.

```bash
python3 -m forge local create-project <name> [options]
```

**Arguments:**
- `name` - Project name (required)

**Options:**
- `--template <template>` - Project template (default: basic)
- `--domain <domain>` - Custom domain (default: `<name>.ddev.site`)
- `--php-version <version>` - PHP version (default: 8.2)
- `--wordpress-version <version>` - WordPress version (default: latest)
- `--database-type <type>` - Database type (default: mysql)
- `--no-github` - Skip GitHub repository creation
- `--github-private` - Create private GitHub repository
- `--github-org <org>` - Create repository in organization

**Examples:**
```bash
# Basic project
python3 -m forge local create-project mysite

# With custom template
python3 -m forge local create-project agency-site --template=agency

# With specific PHP version
python3 -m forge local create-project mysite --php-version=8.1

# Skip GitHub
python3 -m forge local create-project mysite --no-github

# Private repository
python3 -m forge local create-project mysite --github-private
```

#### `list`

List all local projects.

```bash
python3 -m forge local list [options]
```

**Options:**
- `--format <format>` - Output format (table/json) (default: table)
- `--filter <filter>` - Filter projects by status or type

**Examples:**
```bash
# Table format (default)
python3 -m forge local list

# JSON format
python3 -m forge local list --format=json

# Filter active projects
python3 -m forge local list --filter=active
```

#### `switch`

Switch to a different project.

```bash
python3 -m forge local switch <name>
```

**Arguments:**
- `name` - Project name to switch to

**Examples:**
```bash
python3 -m forge local switch mysite
```

#### `info`

Display detailed information about current or specified project.

```bash
python3 -m forge local info [name] [options]
```

**Arguments:**
- `name` - Project name (optional, defaults to current project)

**Options:**
- `--format <format>` - Output format (table/json) (default: table)
- `--section <section>` - Show specific section (config/env/status)

**Examples:**
```bash
# Current project info
python3 -m forge local info

# Specific project
python3 -m forge local info mysite

# JSON format
python3 -m forge local info --format=json

# Only configuration
python3 -m forge local info --section=config
```

#### `config`

Manage project configuration.

```bash
python3 -m forge local config [subcommand] [options]
```

**Subcommands:**

- `show` - Show project configuration
- `edit` - Edit configuration in default editor
- `set <key> <value>` - Set configuration value
- `get <key>` - Get configuration value
- `add-environment <name>` - Add new environment
- `remove-environment <name>` - Remove environment
- `validate` - Validate configuration
- `export [file]` - Export configuration to file
- `import <file>` - Import configuration from file

**Examples:**
```bash
# Show configuration
python3 -m forge local config show

# Edit configuration
python3 -m forge local config edit

# Set value
python3 -m forge local config set wordpress.site_title "My Site"

# Add environment
python3 -m forge local config add-environment staging

# Validate configuration
python3 -m forge local config validate

# Export configuration
python3 -m forge local config export > my-config.json
```

#### `delete`

Delete a local project.

```bash
python3 -m forge local delete <name> [options]
```

**Arguments:**
- `name` - Project name to delete

**Options:**
- `--force` - Skip confirmation prompt
- `--backup` - Create backup before deletion
- `--remove-from-github` - Also delete GitHub repository

**Examples:**
```bash
# Delete with confirmation
python3 -m forge local delete mysite

# Force delete
python3 -m forge local delete mysite --force

# Delete with backup
python3 -m forge local delete mysite --backup
```

#### `import`

Import existing WordPress project into Forge.

```bash
python3 -m forge local import <path> [options]
```

**Arguments:**
- `path` - Path to existing WordPress project

**Options:**
- `--name <name>` - Project name (default: directory name)
- `--type <type>` - Project type (wordpress/bedrock) (default: auto-detect)
- `--no-ddev` - Skip DDEV setup

**Examples:**
```bash
# Import existing project
python3 -m forge local import /path/to/existing-site

# Import with custom name
python3 -m forge local import /path/to/site --name=mysite

# Import without DDEV setup
python3 -m forge local import /path/to/site --no-ddev
```

## 🖥️ Provisioning Commands

### `forge provision`

Provision servers and services for WordPress hosting.

#### `hetzner-create`

Create a new server on Hetzner Cloud.

```bash
python3 -m forge provision hetzner-create <name> [options]
```

**Arguments:**
- `name` - Server name

**Options:**
- `--plan <plan>` - Server plan (default: cpx11)
- `--location <location>` - Server location (default: hel1)
- `--image <image>` - Server image (default: ubuntu-22.04)
- `--ssh-key <key>` - SSH key name
- `--firewall` - Apply firewall rules
- `-- backups` - Enable automatic backups

**Examples:**
```bash
# Basic server
python3 -m forge provision hetzner-create myserver

# With specific plan
python3 -m forge provision hetzner-create myserver --plan=cpx21

# With firewall
python3 -m forge provision hetzner-create myserver --firewall
```

#### `cyberpanel-provision`

Provision CyberPanel on existing server.

```bash
python3 -m forge provision cyberpanel-provision <server> [options]
```

**Arguments:**
- `server` - Server name or IP

**Options:**
- `--domain <domain>` - Primary domain
- `--email <email>` - Admin email
- `--password <password>` - Admin password
- `--mysql-version <version>` - MySQL version (default: 8.0)

**Examples:**
```bash
# Basic provisioning
python3 -m forge provision cyberpanel-provision 192.168.1.100

# With domain
python3 -m forge provision cyberpanel-provision 192.168.1.100 --domain=mysite.com
```

#### `libyanspider-setup`

Setup LibyanSpider hosting.

```bash
python3 -m forge provision libyanspider-setup <domain> [options]
```

**Arguments:**
- `domain` - Domain name

**Options:**
- `--package <package>` - Hosting package
- `--billing-cycle <cycle>` - Billing cycle (monthly/yearly)

#### `ssl-setup`

Setup SSL certificate for domain.

```bash
python3 -m forge provision ssl-setup <domain> [options]
```

**Arguments:**
- `domain` - Domain name

**Options:**
- `--provider <provider>` - SSL provider (letsencrypt/cloudflare) (default: letsencrypt)
- `--email <email>` - Email for certificate
- `--wildcard` - Request wildcard certificate
- `--dns-provider <provider>` - DNS provider for validation (cloudflare)

**Examples:**
```bash
# Basic Let's Encrypt certificate
python3 -m forge provision ssl-setup mysite.com

# Wildcard certificate
python3 -m forge provision ssl-setup mysite.com --wildcard --dns-provider=cloudflare
```

#### `dns-add`

Add DNS record for domain.

```bash
python3 -m forge provision dns-add <domain> [options]
```

**Arguments:**
- `domain` - Domain name

**Options:**
- `--type <type>` - Record type (A/CNAME/TXT/MX) (default: A)
- `--value <value>` - Record value
- `--ttl <ttl>` - TTL value (default: 3600)
- `--provider <provider>` - DNS provider (cloudflare/route53)

**Examples:**
```bash
# A record
python3 -m forge provision dns-add mysite.com --type=A --value=192.168.1.100

# CNAME record
python3 -m forge provision dns-add www.mysite.com --type=CNAME --value=mysite.com
```

## 📦 Deployment Commands

### `forge deploy`

Deploy code to remote servers.

#### `push`

Push code to remote server.

```bash
python3 -m forge deploy push <project> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `environment` - Target environment

**Options:**
- `--method <method>` - Deployment method (rsync/sftp/ftp) (default: rsync)
- `--exclude <patterns>` - Files to exclude (comma-separated)
- `--dry-run` - Show what would be deployed
- `--build` - Build assets before deployment
- `--migrate` - Run database migrations after deployment
- `--clear-cache` - Clear cache after deployment

**Examples:**
```bash
# Basic deployment
python3 -m forge deploy push mysite production

# With build and migrations
python3 -m forge deploy push mysite production --build --migrate

# Dry run
python3 -m forge deploy push mysite production --dry-run

# Exclude specific files
python3 -m forge deploy push mysite production --exclude="node_modules,.git"
```

#### `rollback`

Rollback to previous deployment.

```bash
python3 -m forge deploy rollback <project> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `environment` - Target environment

**Options:**
- `--version <version>` - Specific version to rollback to
- `--force` - Skip confirmation
- `--backup-current` - Backup current version before rollback

**Examples:**
```bash
# Rollback to previous version
python3 -m forge deploy rollback mysite production

# Rollback to specific version
python3 -m forge deploy rollback mysite production --version=20240115_143022

# Force rollback
python3 -m forge deploy rollback mysite production --force
```

#### `status`

Check deployment status.

```bash
python3 -m forge deploy status <project> [environment]
```

**Arguments:**
- `project` - Project name
- `environment` - Target environment (optional)

**Examples:**
```bash
# All environments
python3 -m forge deploy status mysite

# Specific environment
python3 -m forge deploy status mysite production
```

#### `list`

List deployment history.

```bash
python3 -m forge deploy list <project> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `environment` - Target environment

**Options:**
- `--limit <number>` - Number of deployments to show (default: 10)
- `--format <format>` - Output format (table/json) (default: table)

**Examples:**
```bash
# List deployments
python3 -m forge deploy list mysite production

# Show last 5 deployments
python3 -m forge deploy list mysite production --limit=5
```

## 💾 Sync & Backup Commands

### `forge sync`

Synchronize data between environments and create backups.

#### `backup`

Create backup of project.

```bash
python3 -m forge sync backup <project> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `environment` - Source environment

**Options:**
- `--type <type>` - Backup type (full/database/files) (default: full)
- `--destination <dest>` - Backup destination (local/gdrive/s3)
- `--compress` - Compress backup files
- `--encrypt` - Encrypt backup files
- `--description <desc>` - Backup description

**Examples:**
```bash
# Full backup to Google Drive
python3 -m forge sync backup mysite production --destination=gdrive

# Database only backup
python3 -m forge sync backup mysite production --type=database

# Compressed and encrypted backup
python3 -m forge sync backup mysite production --compress --encrypt
```

#### `restore`

Restore from backup.

```bash
python3 -m forge sync restore <project> <backup-id> [options]
```

**Arguments:**
- `project` - Project name
- `backup-id` - Backup ID or timestamp

**Options:**
- `--environment <env>` - Target environment
- `--type <type>` - Restore type (full/database/files)
- `--force` - Skip confirmation
- `--backup-current` - Backup current state before restore

**Examples:**
```bash
# Restore latest backup
python3 -m forge sync restore mysite latest

# Restore specific backup
python3 -m forge sync restore mysite 20240115_143022

# Restore database only
python3 -m forge sync restore mysite latest --type=database
```

#### `database`

Synchronize database between environments.

```bash
python3 -m forge sync database <project> <direction> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `direction` - Direction (push/pull)
- `environment` - Target environment

**Options:**
- `--exclude-tables <tables>` - Tables to exclude
- `--include-tables <tables>` - Tables to include only
- `--compress` - Compress during transfer
- `--replace` - Replace existing data

**Examples:**
```bash
# Pull production database to local
python3 -m forge sync database mysite pull production

# Push local database to staging
python3 -m forge sync database mysite push staging

# Pull excluding specific tables
python3 -m forge sync database mysite pull production --exclude-tables="wp_options,wp_users"
```

#### `files`

Synchronize files between environments.

```bash
python3 -m forge sync files <project> <direction> <environment> [options]
```

**Arguments:**
- `project` - Project name
- `direction` - Direction (push/pull)
- `environment` - Target environment

**Options:**
- `--path <path>` - Specific path to sync
- `--exclude <patterns>` - Files to exclude
- `--delete` - Delete files not present in source
- `--dry-run` - Show what would be synced

**Examples:**
```bash
# Pull uploads from production
python3 -m forge sync files mysite pull production

# Push local plugins to staging
python3 -m forge sync files mysite push staging --path=web/app/plugins

# Pull excluding node_modules
python3 -m forge sync files mysite pull production --exclude="node_modules"
```

#### `list-backups`

List available backups.

```bash
python3 -m forge sync list-backups <project> [options]
```

**Arguments:**
- `project` - Project name

**Options:**
- `--environment <env>` - Filter by environment
- `--type <type>` - Filter by type
- `--limit <number>` - Number of backups to show
- `--format <format>` - Output format (table/json)

**Examples:**
```bash
# List all backups
python3 -m forge sync list-backups mysite

# List production backups only
python3 -m forge sync list-backups mysite --environment=production

# List database backups only
python3 -m forge sync list-backups mysite --type=database
```

## 🔄 CI/CD Commands

### `forge ci`

Manage CI/CD integrations.

#### `setup`

Setup CI/CD pipeline.

```bash
python3 -m forge ci setup <project> [options]
```

**Arguments:**
- `project` - Project name

**Options:**
- `--provider <provider>` - CI/CD provider (github/jenkins/gitlab)
- `--trigger <trigger>` - Deployment trigger (push/manual/scheduled)
- `--environment <env>` - Deployment environment

**Examples:**
```bash
# Setup GitHub Actions
python3 -m forge ci setup mysite --provider=github

# Setup Jenkins with manual trigger
python3 -m forge ci setup mysite --provider=jenkins --trigger=manual
```

#### `status`

Check CI/CD status.

```bash
python3 -m forge ci status <project> [options]
```

**Arguments:**
- `project` - Project name

**Options:**
- `--pipeline <pipeline>` - Specific pipeline name

## 📊 Monitoring Commands

### `forge monitor`

Monitor site health and performance.

#### `add`

Add site to monitoring.

```bash
python3 -m forge monitor add <name> <url> [options]
```

**Arguments:**
- `name` - Site name
- `url` - Site URL

**Options:**
- `--interval <seconds>` - Check interval (default: 300)
- `--timeout <seconds>` - Request timeout (default: 30)
- `--alert-email <email>` - Email for alerts

**Examples:**
```bash
# Add basic monitoring
python3 -m forge monitor add mysite https://mysite.com

# Add with custom interval and alerts
python3 -m forge monitor add mysite https://mysite.com --interval=60 --alert-email=admin@example.com
```

#### `list`

List monitored sites.

```bash
python3 -m forge monitor list [options]
```

**Options:**
- `--status <status>` - Filter by status (up/down/unknown)
- `--format <format>` - Output format (table/json)

#### `health`

Check site health.

```bash
python3 -m forge monitor health <name> [options]
```

**Arguments:**
- `name` - Site name

**Options:**
- `--detailed` - Show detailed health information
- `--check-all` - Check all health metrics

#### `remove`

Remove site from monitoring.

```bash
python3 -m forge monitor remove <name>
```

**Arguments:**
- `name` - Site name

## ℹ️ Info Commands

### `forge info`

Display system and project information.

#### `system`

Show system information.

```bash
python3 -m forge info system [options]
```

**Options:**
- `--format <format>` - Output format (table/json)
- `--section <section>` - Show specific section

#### `project`

Show project information.

```bash
python3 -m forge info project [name] [options]
```

**Arguments:**
- `name` - Project name (optional)

**Options:**
- `--environment <env>` - Show environment-specific info
- `--format <format>` - Output format

#### `server`

Show server information.

```bash
python3 -m forge info server <server> [options]
```

**Arguments:**
- `server` - Server name or IP

**Options:**
- `--detailed` - Show detailed information

## 🔄 Workflow Commands

### `forge workflow`

Run predefined workflows.

#### `list`

List available workflows.

```bash
python3 -m forge workflow list [options]
```

**Options:**
- `--format <format>` - Output format (table/json)

#### `run`

Run workflow.

```bash
python3 -m forge workflow run <workflow> <project> [options]
```

**Arguments:**
- `workflow` - Workflow name
- `project` - Project name

**Options:**
- `--environment <env>` - Target environment
- `--dry-run` - Show workflow steps without executing
- `--step <step>` - Run specific step only

**Examples:**
```bash
# Run full project workflow
python3 -m forge workflow run full-project mysite --environment=production

# Dry run workflow
python3 -m forge workflow run full-project mysite --dry-run

# Run specific step
python3 -m forge workflow run full-project mysite --step=deploy
```

#### `create`

Create custom workflow.

```bash
python3 -m forge workflow create <name> [options]
```

**Arguments:**
- `name` - Workflow name

**Options:**
- `--description <desc>` - Workflow description
- `--template <template>` - Start from template

## ⚙️ Configuration Commands

### `forge config`

Manage global Forge configuration.

#### `init`

Initialize global configuration.

```bash
python3 -m forge config init [options]
```

**Options:**
- `--interactive` - Interactive setup wizard
- `--template <template>` - Start from template

#### `show`

Show configuration.

```bash
python3 -m forge config show [options]
```

**Options:**
- `--format <format>` - Output format (table/json/yaml)
- `--section <section>` - Show specific section

#### `set`

Set configuration value.

```bash
python3 -m forge config set <key> <value>
```

**Arguments:**
- `key` - Configuration key (dot notation)
- `value` - Configuration value

#### `get`

Get configuration value.

```bash
python3 -m forge config get <key> [options]
```

**Arguments:**
- `key` - Configuration key

**Options:**
- `--format <format>` - Output format (raw/json)

#### `edit`

Edit configuration in editor.

```bash
python3 -m forge config edit [options]
```

**Options:**
- `--editor <editor>` - Use specific editor

#### `validate`

Validate configuration.

```bash
python3 -m forge config validate [options]
```

**Options:**
- `--fix` - Attempt to fix issues automatically
- `--strict` - Enable strict validation

#### `export`

Export configuration.

```bash
python3 -m forge config export [file] [options]
```

**Arguments:**
- `file` - Output file (optional, defaults to stdout)

**Options:**
- `--format <format>` - Export format (json/yaml)
- `--include-secrets` - Include sensitive data

#### `import`

Import configuration.

```bash
python3 -m forge config import <file> [options]
```

**Arguments:**
- `file` - Configuration file to import

**Options:**
- `--merge` - Merge with existing configuration
- `--force` - Overwrite existing values

## 🔍 Command Examples by Use Case

### New Project Setup

```bash
# 1. Create project
python3 -m forge local create-project mysite --template=agency

# 2. Configure environments
python3 -m forge local config add-environment staging
python3 -m forge local config add-environment production

# 3. Setup server
python3 -m forge provision hetzner-create myserver
python3 -m forge provision cyberpanel-provision myserver --domain=mysite.com
python3 -m forge provision ssl-setup mysite.com

# 4. Setup CI/CD
python3 -m forge ci setup mysite --provider=github

# 5. Setup monitoring
python3 -m forge monitor add mysite https://mysite.com --alert-email=admin@example.com
```

### Daily Development Workflow

```bash
# Start development
python3 -m forge local switch mysite
ddev start

# Pull latest changes from production
python3 -m forge sync database mysite pull production
python3 -m forge sync files mysite pull production --path=web/app/uploads

# Make changes, then deploy to staging
python3 -m forge deploy push mysite staging --build --migrate

# Create backup before production deployment
python3 -m forge sync backup mysite production --description="Pre-deployment backup"
python3 -m forge deploy push mysite production --build --migrate
```

### Emergency Recovery

```bash
# Check what's deployed
python3 -m forge deploy status mysite production

# Rollback if needed
python3 -m forge deploy rollback mysite production --backup-current

# Or restore from backup
python3 -m forge sync restore mysite latest --environment=production
```

For more detailed information about specific features, see:
- [Configuration Guide](CONFIGURATION.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Backup Guide](BACKUP_GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
# Environment Variables Reference

This guide provides a comprehensive reference for all environment variables used by Bedrock Forge.

## Overview

Environment variables in Bedrock Forge control configuration, secrets, deployment settings, and runtime behavior across different environments.

## Configuration Hierarchy

1. **Environment Variables** (highest priority)
2. **Command-line arguments**
3. **Configuration files** (forge.yaml)
4. **Default values** (lowest priority)

## Core Variables

### Application Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FORGE_ENV` | string | `development` | Current environment (development, testing, staging, production) |
| `FORGE_DEBUG` | boolean | `false` | Enable debug mode |
| `FORGE_LOG_LEVEL` | string | `info` | Logging level (debug, info, warn, error) |
| `FORGE_CONFIG_PATH` | string | `.forge/` | Configuration directory path |
| `FORGE_CACHE_PATH` | string | `.forge/cache/` | Cache directory path |
| `FORGE_TEMP_PATH` | string | `.forge/tmp/` | Temporary files path |

### Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_HOST` | string | `localhost` | Database hostname |
| `DB_PORT` | integer | `3306` | Database port |
| `DB_NAME` | string | `forge_db` | Database name |
| `DB_USER` | string | `forge_user` | Database username |
| `DB_PASSWORD` | string | - | Database password |
| `DB_CHARSET` | string | `utf8mb4` | Database character set |
| `DB_COLLATE` | string | `utf8mb4_unicode_ci` | Database collation |
| `DB_PREFIX` | string | `wp_` | WordPress table prefix |

### Web Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WEB_SERVER` | string | `nginx` | Web server type (nginx, apache, litespeed) |
| `WEB_ROOT` | string | `web/` | Web root directory |
| `WEB_PORT` | integer | `80` | HTTP port |
| `WEB_SSL_PORT` | integer | `443` | HTTPS port |
| `WEB_SSL_ENABLED` | boolean | `true` | Enable SSL/TLS |
| `WEB_SSL_CERT_PATH` | string | - | SSL certificate path |
| `WEB_SSL_KEY_PATH` | string | - | SSL private key path |

### PHP Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PHP_VERSION` | string | `8.1` | PHP version |
| `PHP_MEMORY_LIMIT` | string | `256M` | PHP memory limit |
| `PHP_MAX_EXECUTION_TIME` | integer | `300` | Maximum execution time (seconds) |
| `PHP_UPLOAD_MAX_FILESIZE` | string | `64M` | Maximum upload file size |
| `PHP_POST_MAX_SIZE` | string | `64M` | Maximum POST size |
| `PHP_DISPLAY_ERRORS` | boolean | `false` | Display PHP errors |
| `PHP_ERROR_REPORTING` | string | `E_ALL & ~E_DEPRECATED` | Error reporting level |

## WordPress Configuration

### WordPress Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WP_HOME` | string | - | WordPress home URL |
| `WP_SITEURL` | string | - | WordPress site URL |
| `WP_ENVIRONMENT_TYPE` | string | `production` | WordPress environment type |
| `WP_DEBUG` | boolean | `false` | Enable WordPress debug |
| `WP_DEBUG_LOG` | boolean | `true` | Enable debug logging |
| `WP_DEBUG_DISPLAY` | boolean | `false` | Display debug errors |
| `WP_DISABLE_WP_CRON` | boolean | `true` | Disable WordPress cron |
| `WP_ALLOW_REPAIR` | boolean | `false` | Allow database repair |

### Authentication Keys

| Variable | Type | Description |
|----------|------|-------------|
| `AUTH_KEY` | string | Authentication key |
| `SECURE_AUTH_KEY` | string | Secure authentication key |
| `LOGGED_IN_KEY` | string | Logged in key |
| `NONCE_KEY` | string | Nonce key |
| `AUTH_SALT` | string | Authentication salt |
| `SECURE_AUTH_SALT` | string | Secure authentication salt |
| `LOGGED_IN_SALT` | string | Logged in salt |
| `NONCE_SALT` | string | Nonce salt |

### Content and Media

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WP_CONTENT_URL` | string | `${WP_HOME}/wp-content` | Content URL |
| `WP_CONTENT_DIR` | string | `wp-content` | Content directory |
| `UPLOADS` | string | `wp-content/uploads` | Uploads directory |
| `WP_DEFAULT_THEME` | string | `twentytwentyfour` | Default theme |
| `WP_AUTO_UPDATE_CORE` | boolean | `false` | Auto-update WordPress core |

## Server Providers

### Hetzner

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `HETZNER_API_TOKEN` | string | Yes | Hetzner Cloud API token |
| `HETZNER_SSH_KEY_ID` | string | Yes | SSH key ID |
| `HETZNER_DEFAULT_REGION` | string | No | Default region (nbg1, fsn1, hel1) |
| `HETZNER_DEFAULT_SERVER_TYPE` | string | No | Default server type |
| `HETZNER_FIREWALL_ID` | string | No | Default firewall ID |

### CyberPanel

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CYBERPANEL_HOST` | string | Yes | CyberPanel hostname |
| `CYBERPANEL_PORT` | integer | Yes | CyberPanel port (usually 8083) |
| `CYBERPANEL_USERNAME` | string | Yes | Admin username |
| `CYBERPANEL_PASSWORD` | string | Yes | Admin password |
| `CYBERPANEL_API_TOKEN` | string | No | API token (alternative to password) |

### LibyanSpider

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `LIBYANSPIDER_API_KEY` | string | Yes | LibyanSpider API key |
| `LIBYANSPIDER_API_SECRET` | string | Yes | LibyanSpider API secret |
| `LIBYANSPIDER_REGION` | string | No | Service region |
| `LIBYANSPIDER_LANGUAGE` | string | No | Language preference (ar, en) |

## Deployment Variables

### General Deployment

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DEPLOY_STRATEGY` | string | `rolling` | Deployment strategy (rolling, blue-green, atomic) |
| `DEPLOY_BACKUP` | boolean | `true` | Create backup before deployment |
| `DEPLOY_HEALTH_CHECK` | boolean | `true` | Run health checks after deployment |
| `DEPLOY_ROLLBACK_ON_FAILURE` | boolean | `true` | Auto-rollback on deployment failure |
| `DEPLOY_TIMEOUT` | integer | `600` | Deployment timeout (seconds) |
| `DEPLOY_VERIFY_SSL` | boolean | `true` | Verify SSL certificates |

### SSH Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SSH_HOST` | string | - | SSH hostname |
| `SSH_PORT` | integer | `22` | SSH port |
| `SSH_USER` | string | `root` | SSH username |
| `SSH_KEY_PATH` | string | `~/.ssh/id_rsa` | SSH private key path |
| `SSH_KEY_PASSWORD` | string | - | SSH key password |
| `SSH_TIMEOUT` | integer | `30` | SSH connection timeout |
| `SSH_STRICT_HOST_KEY_CHECKING` | boolean | `true` | Strict host key checking |

### Remote Directories

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REMOTE_PATH` | string | `/var/www/html` | Remote deployment path |
| `REMOTE_BACKUP_PATH` | string | `/var/backups/forge` | Remote backup path |
| `REMOTE_SHARED_PATH` | string | `shared/` | Shared files path |
| `REMOTE_RELEASES_PATH` | string | `releases/` | Releases directory |

## Backup Variables

### Backup Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BACKUP_ENABLED` | boolean | `true` | Enable automatic backups |
| `BACKUP_SCHEDULE` | string | `daily` | Backup schedule (daily, weekly, monthly) |
| `BACKUP_RETENTION_DAYS` | integer | `30` | Local backup retention |
| `BACKUP_REMOTE_RETENTION_DAYS` | integer | `90` | Remote backup retention |
| `BACKUP_COMPRESSION` | boolean | `true` | Compress backups |
| `BACKUP_ENCRYPTION` | boolean | `false` | Encrypt backups |
| `BACKUP_ENCRYPTION_KEY` | string | - | Backup encryption key |

### Backup Storage

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BACKUP_STORAGE_TYPE` | string | `local` | Storage type (local, google_drive, s3) |
| `BACKUP_LOCAL_PATH` | string | `.forge/backups/` | Local backup path |
| `BACKUP_MAX_SIZE_GB` | integer | `5` | Maximum backup size (GB) |

### Google Drive Integration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `GOOGLE_DRIVE_CREDENTIALS_JSON` | string | Yes | Google Drive credentials file path |
| `GOOGLE_DRIVE_FOLDER_ID` | string | Yes | Google Drive folder ID |
| `GOOGLE_DRIVE_TEAM_DRIVE_ID` | string | No | Team Drive ID |

### S3 Integration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | string | Yes | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | string | Yes | AWS secret key |
| `AWS_REGION` | string | No | AWS region |
| `S3_BUCKET` | string | Yes | S3 bucket name |
| `S3_PREFIX` | string | No | S3 key prefix |

## Monitoring and Logging

### Monitoring Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MONITORING_ENABLED` | boolean | `true` | Enable monitoring |
| `MONITORING_PROVIDER` | string | `internal` | Monitoring provider |
| `MONITORING_INTERVAL` | integer | `60` | Monitoring interval (seconds) |
| `MONITORING_ALERT_EMAIL` | string | - | Alert email address |
| `MONITORING_SLACK_WEBHOOK` | string | - | Slack webhook URL |

### Logging Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Log level |
| `LOG_FORMAT` | string | `json` | Log format (json, text) |
| `LOG_FILE_PATH` | string | `.forge/logs/forge.log` | Log file path |
| `LOG_MAX_SIZE_MB` | integer | `100` | Maximum log file size |
| `LOG_MAX_FILES` | integer | `10` | Maximum number of log files |
| `LOG_SYSLOG_ENABLED` | boolean | `false` | Enable syslog logging |

## Security Variables

### Security Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SECURITY_ENABLED` | boolean | `true` | Enable security features |
| `SECURITY_FIREWALL` | boolean | `true` | Enable firewall rules |
| `SECURITY_FAIL2BAN` | boolean | `true` | Enable fail2ban |
| `SECURITY_SSL_FORCE` | boolean | `true` | Force SSL |
| `SECURITY_HEADERS` | boolean | `true` | Enable security headers |
| `SECURITY_HSTS_MAX_AGE` | integer | `31536000` | HSTS max age |

### SSL/TLS Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SSL_PROVIDER` | string | `letsencrypt` | SSL provider |
| `SSL_EMAIL` | string | - | Email for SSL certificates |
| `SSL_STAGING` | boolean | `false` | Use staging environment |
| `SSL_RENEWAL_DAYS` | integer | `30` | Renewal notification days |
| `SSL_AUTO_RENEW` | boolean | `true` | Auto-renew certificates |

## Cache and Performance

### Cache Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CACHE_ENABLED` | boolean | `true` | Enable caching |
| `CACHE_TYPE` | string | `redis` | Cache type (redis, memcached, apc) |
| `CACHE_HOST` | string | `localhost` | Cache host |
| `CACHE_PORT` | integer | `6379` | Cache port |
| `CACHE_PASSWORD` | string | - | Cache password |
| `CACHE_TTL` | integer | `3600` | Cache TTL (seconds) |

### Redis Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_HOST` | string | `localhost` | Redis host |
| `REDIS_PORT` | integer | `6379` | Redis port |
| `REDIS_PASSWORD` | string | - | Redis password |
| `REDIS_DB` | integer | `0` | Redis database number |
| `REDIS_PREFIX` | string | `forge_` | Redis key prefix |

## CI/CD Variables

### Continuous Integration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CI_ENABLED` | boolean | `false` | Enable CI mode |
| `CI_PLATFORM` | string | - | CI platform (github, gitlab, jenkins) |
| `CI_BUILD_NUMBER` | string | - | Build number |
| `CI_BRANCH` | string | - | Git branch |
| `CI_COMMIT_SHA` | string | - | Commit SHA |
| `CI_TAG` | string | - | Git tag |

### GitHub Actions

| Variable | Type | Description |
|----------|------|-------------|
| `GITHUB_TOKEN` | string | GitHub token |
| `GITHUB_REPOSITORY` | string | Repository name |
| `GITHUB_REF` | string | Git reference |
| `GITHUB_SHA` | string | Commit SHA |
| `GITHUB_RUN_ID` | string | Run ID |

### GitLab CI

| Variable | Type | Description |
|----------|------|-------------|
| `CI_PROJECT_ID` | string | Project ID |
| `CI_COMMIT_REF_NAME` | string | Branch or tag name |
| `CI_PIPELINE_ID` | string | Pipeline ID |
| `CI_JOB_ID` | string | Job ID |

## Notification Variables

### Slack Integration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SLACK_WEBHOOK_URL` | string | Yes | Slack webhook URL |
| `SLACK_CHANNEL` | string | No | Slack channel (default: #general) |
| `SLACK_USERNAME` | string | No | Slack username |
| `SLACK_ICON_EMOJI` | string | No | Slack icon emoji |

### Email Notifications

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMAIL_SMTP_HOST` | string | - | SMTP host |
| `EMAIL_SMTP_PORT` | integer | `587` | SMTP port |
| `EMAIL_SMTP_USERNAME` | string | - | SMTP username |
| `EMAIL_SMTP_PASSWORD` | string | - | SMTP password |
| `EMAIL_FROM` | string | - | From email address |
| `EMAIL_TO` | string | - | To email addresses (comma-separated) |

## Development Variables

### Development Tools

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DEV_XDEBUG_ENABLED` | boolean | `false` | Enable Xdebug |
| `DEV_XDEBUG_HOST` | string | `localhost` | Xdebug host |
| `DEV_XDEBUG_PORT` | integer | `9003` | Xdebug port |
| `DEV_PROFILING_ENABLED` | boolean | `false` | Enable profiling |
| `DEV_QUERY_MONITOR` | boolean | `false` | Enable query monitor |

### Testing Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TESTING_DB_HOST` | string | `localhost` | Test database host |
| `TESTING_DB_NAME` | string | `forge_test` | Test database name |
| `TESTING_DB_USER` | string | `test` | Test database user |
| `TESTING_DB_PASSWORD` | string | - | Test database password |
| `TESTING_PARALLEL` | integer | `1` | Parallel test processes |
| `TESTING_COVERAGE_ENABLED` | boolean | `true` | Enable test coverage |

## Utility Variables

### System Information

| Variable | Type | Description |
|----------|------|-------------|
| `PATH` | string | System PATH |
| `HOME` | string | Home directory |
| `USER` | string | Current user |
| `SHELL` | string | Current shell |

### Bedrock Forge Specific

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FORGE_VERSION` | string | - | Forge version |
| `FORGE_CONFIG_VERSION` | string | - | Configuration file version |
| `FORGE_PLUGIN_PATH` | string | `plugins/` | Plugin directory |
| `FORGE_WORKFLOW_PATH` | string | `workflows/` | Workflow directory |

## Environment Files

### `.env` Example

```bash
# Environment
FORGE_ENV=production
FORGE_DEBUG=false
FORGE_LOG_LEVEL=info

# Database
DB_HOST=prod-db.example.com
DB_NAME=forge_production
DB_USER=forge_user
DB_PASSWORD=secure_password_here

# WordPress
WP_HOME=https://example.com
WP_SITEURL=https://example.com/wp
WP_ENVIRONMENT_TYPE=production

# Server
WEB_SERVER=nginx
PHP_VERSION=8.1

# SSH
SSH_HOST=prod.example.com
SSH_USER=deploy
SSH_KEY_PATH=~/.ssh/deploy_key

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
GOOGLE_DRIVE_CREDENTIALS_JSON=/path/to/credentials.json
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Cache
CACHE_TYPE=redis
REDIS_HOST=redis.example.com
REDIS_PASSWORD=redis_password

# Monitoring
MONITORING_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# SSL
SSL_PROVIDER=letsencrypt
SSL_EMAIL=admin@example.com
```

### Environment-specific Files

- `.env` - Default environment file
- `.env.development` - Development overrides
- `.env.testing` - Testing environment
- `.env.staging` - Staging environment
- `.env.production` - Production overrides
- `.env.local` - Local overrides (not committed)

## Security Best Practices

1. **Never commit secrets**: Use environment files in `.gitignore`
2. **Use strong passwords**: Generate secure passwords for all services
3. **Rotate secrets**: Regularly update passwords and API keys
4. **Use encryption**: Enable backup encryption with strong keys
5. **Limit access**: Grant minimum necessary permissions
6. **Audit regularly**: Review environment variables periodically

## Template Generation

```bash
# Generate environment template
forge env generate --template --output .env.template

# Generate specific environment
forge env generate --environment production --output .env.production

# Validate environment
forge env validate --environment production

# Show missing variables
forge env check --missing
```

This comprehensive environment variables reference ensures proper configuration and security across all Bedrock Forge deployments.
# Configuration Guide

Complete guide to configuring Bedrock Forge for your WordPress development workflow.

## 📋 Table of Contents

- [Overview](#overview)
- [Configuration Files](#configuration-files)
- [Global Configuration](#global-configuration)
- [Project Configuration](#project-configuration)
- [Environment Variables](#environment-variables)
- [Provider Configuration](#provider-configuration)
- [Security Configuration](#security-configuration)
- [Advanced Configuration](#advanced-configuration)
- [Configuration Examples](#configuration-examples)

## 🎯 Overview

Bedrock Forge uses a hierarchical configuration system:

1. **Global Configuration** - System-wide settings
2. **Project Configuration** - Project-specific settings
3. **Environment Configuration** - Environment-specific overrides
4. **Runtime Configuration** - Command-line arguments

Configuration is stored in JSON format with environment variable support for secrets.

## 📁 Configuration Files

### File Locations

```
~/.forge/
├── config.json              # Global configuration
├── environments/            # Environment-specific configs
│   ├── local.json
│   ├── staging.json
│   └── production.json
├── credentials/             # Encrypted credentials
│   ├── github.json
│   ├── hetzner.json
│   └── cloudflare.json
└── logs/                    # Configuration change logs

project/
├── .forge/
│   ├── config.json          # Project configuration
│   ├── environments.json    # Project environments
│   └── secrets.json         # Project secrets
```

### Configuration Priority

1. Command-line arguments (`--flag`)
2. Environment variables (`FORGE_*`)
3. Project configuration (`.forge/config.json`)
4. Environment configuration (`.forge/environments/*.json`)
5. Global configuration (`~/.forge/config.json`)
6. Default values

## 🌍 Global Configuration

### Initialize Global Configuration

```bash
# Create global configuration
python3 -m forge config init

# Set global values
python3 -m forge config set default_editor "code"
python3 -m forge config set backup_path "~/backups"
python3 -m forge config set log_level "INFO"
```

### Global Configuration Structure

```json
{
  "version": "1.0.0",
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "default_editor": "code"
  },
  "paths": {
    "base_dir": "~/Projects",
    "backup_path": "~/backups",
    "temp_dir": "/tmp/forge"
  },
  "defaults": {
    "provider": "hetzner",
    "php_version": "8.2",
    "wordpress_version": "latest",
    "database_engine": "mysql"
  },
  "logging": {
    "level": "INFO",
    "format": "json",
    "rotation": "daily",
    "retention": 30
  },
  "security": {
    "credential_store": "keyring",
    "encryption_algorithm": "AES-256-GCM",
    "require_2fa": false
  }
}
```

### Common Global Settings

```bash
# Editor preferences
python3 -m forge config set user.default_editor "code"        # VS Code
python3 -m forge config set user.default_editor "vim"         # Vim
python3 -m forge config set user.default_editor "subl"        # Sublime Text

# Path configuration
python3 -m forge config set paths.base_dir "/path/to/projects"
python3 -m forge config set paths.backup_path "/path/to/backups"

# Default values
python3 -m forge config set defaults.provider "hetzner"
python3 -m forge config set defaults.php_version "8.2"
python3 -m forge config set defaults.wordpress_version "latest"
```

## 🏗️ Project Configuration

### Create Project Configuration

```bash
# Initialize project configuration
python3 -m forge local config init

# Add environments
python3 -m forge local config add-environment staging
python3 -m forge local config add-environment production

# Edit project configuration
python3 -m forge local config edit
```

### Project Configuration Structure

```json
{
  "project": {
    "name": "my-awesome-site",
    "type": "bedrock",
    "version": "1.0.0",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  },
  "wordpress": {
    "site_title": "My Awesome Site",
    "admin_email": "admin@example.com",
    "admin_user": "admin",
    "description": "A WordPress site built with Bedrock",
    "lang": "en_US"
  },
  "environments": {
    "local": {
      "url": "https://my-awesome-site.ddev.site",
      "wp_home": "https://my-awesome-site.ddev.site",
      "wp_siteurl": "https://my-awesome-site.ddev.site/wp",
      "db_name": "db",
      "db_user": "db",
      "db_password": "db",
      "db_host": "db"
    },
    "production": {
      "url": "https://my-awesome-site.com",
      "wp_home": "https://my-awesome-site.com",
      "wp_siteurl": "https://my-awesome-site.com/wp",
      "db_name": "my_awesome_prod",
      "db_user": "${PROD_DB_USER}",
      "db_password": "${PROD_DB_PASSWORD}",
      "db_host": "localhost"
    }
  },
  "deployment": {
    "method": "rsync",
    "repository": "git@github.com:user/my-awesome-site.git",
    "branch": "main",
    "shared_paths": [
      "web/app/uploads",
      "web/app/mu-plugins"
    ],
    "exclude_paths": [
      ".git",
      "node_modules",
      ".ddev",
      ".forge"
    ]
  },
  "backup": {
    "enabled": true,
    "remote": "gdrive",
    "schedule": "daily",
    "retention": 30,
    "include_database": true,
    "include_uploads": true,
    "compression": true
  }
}
```

## 🔧 Environment Variables

### Required Environment Variables

```bash
# GitHub Integration
export FORGE_GITHUB_TOKEN="ghp_your_github_token"
export FORGE_GITHUB_USERNAME="your_username"

# Hetzner Cloud
export FORGE_HETZNER_TOKEN="your_hetzner_api_token"

# Cloudflare
export FORGE_CLOUDFLARE_TOKEN="your_cloudflare_api_token"
export FORGE_CLOUDFLARE_EMAIL="your_cloudflare_email"

# Google Drive (Backups)
export FORGE_GDRIVE_CLIENT_ID="your_google_client_id"
export FORGE_GDRIVE_CLIENT_SECRET="your_google_client_secret"
export FORGE_GDRIVE_REFRESH_TOKEN="your_google_refresh_token"

# Database Credentials
export FORGE_PROD_DB_USER="production_db_user"
export FORGE_PROD_DB_PASSWORD="production_db_password"
export FORGE_STAGING_DB_USER="staging_db_user"
export FORGE_STAGING_DB_PASSWORD="staging_db_password"
```

### Optional Environment Variables

```bash
# Debugging
export FORGE_DEBUG=true
export FORGE_LOG_LEVEL="DEBUG"
export FORGE_VERBOSE=true

# Paths
export FORGE_CONFIG_PATH="/custom/path/to/config"
export FORGE_BASE_DIR="/custom/projects/path"

# Behavior
export FORGE_DRY_RUN=true
export FORGE_DEFAULT_ENVIRONMENT="staging"
export FORGE_TIMEOUT=300

# Security
export FORGE_REQUIRE_2FA=true
export FORGE_ENCRYPTION_KEY="your_custom_encryption_key"
```

### Environment File Setup

Create `.env` files for different environments:

```bash
# .env.local (development)
FORGE_DEBUG=true
FORGE_LOG_LEVEL=DEBUG
FORGE_DEFAULT_ENVIRONMENT=local

# .env.staging
FORGE_DEFAULT_ENVIRONMENT=staging
FORGE_LOG_LEVEL=INFO
FORGE_STAGING_DB_USER=staging_user
FORGE_STAGING_DB_PASSWORD=staging_password

# .env.production
FORGE_DEFAULT_ENVIRONMENT=production
FORGE_LOG_LEVEL=WARNING
FORGE_REQUIRE_2FA=true
FORGE_PROD_DB_USER=prod_user
FORGE_PROD_DB_PASSWORD=prod_password
```

## 🌐 Provider Configuration

### Hetzner Cloud

```json
{
  "hetzner": {
    "api_token": "${FORGE_HETZNER_TOKEN}",
    "default_location": "hel1",
    "default_server_type": "cpx11",
    "default_image": "ubuntu-22.04",
    "ssh_keys": [
      "my-key-pair"
    ],
    "firewall": {
      "enabled": true,
      "rules": [
        {
          "direction": "in",
          "protocol": "tcp",
          "port": "22",
          "source_ips": ["0.0.0.0/0"]
        },
        {
          "direction": "in",
          "protocol": "tcp",
          "port": "80,443",
          "source_ips": ["0.0.0.0/0"]
        }
      ]
    }
  }
}
```

### Cloudflare

```json
{
  "cloudflare": {
    "api_token": "${FORGE_CLOUDFLARE_TOKEN}",
    "email": "${FORGE_CLOUDFLARE_EMAIL}",
    "default_zone_id": "your_default_zone_id",
    "dns": {
      "ttl": 3600,
      "proxied": true
    },
    "ssl": {
      "certificate_authority": "lets_encrypt",
      "validation_method": "txt"
    }
  }
}
```

### GitHub

```json
{
  "github": {
    "token": "${FORGE_GITHUB_TOKEN}",
    "username": "${FORGE_GITHUB_USERNAME}",
    "default_visibility": "private",
    "auto_init": true,
    "gitignore_template": "WordPress",
    "license_template": "mit"
  }
}
```

## 🔒 Security Configuration

### Credential Management

```json
{
  "security": {
    "credential_store": "keyring",
    "encryption_algorithm": "AES-256-GCM",
    "require_2fa": false,
    "session_timeout": 3600,
    "max_login_attempts": 5,
    "password_policy": {
      "min_length": 12,
      "require_uppercase": true,
      "require_lowercase": true,
      "require_numbers": true,
      "require_symbols": true
    }
  }
}
```

### SSH Configuration

```json
{
  "ssh": {
    "default_port": 22,
    "timeout": 30,
    "key_paths": [
      "~/.ssh/id_rsa",
      "~/.ssh/id_ed25519"
    ],
    "known_hosts_file": "~/.ssh/known_hosts",
    "strict_host_key_checking": true,
    "compression": true,
    "connection_attempts": 3
  }
}
```

### Backup Encryption

```json
{
  "backup": {
    "encryption": {
      "enabled": true,
      "algorithm": "AES-256-GCM",
      "key_source": "environment",
      "key_rotation_days": 90
    },
    "retention": {
      "daily": 7,
      "weekly": 4,
      "monthly": 12,
      "yearly": 3
    }
  }
}
```

## ⚙️ Advanced Configuration

### Custom Hooks

```json
{
  "hooks": {
    "pre_deploy": [
      "npm run build",
      "php artisan cache:clear"
    ],
    "post_deploy": [
      "php artisan migrate",
      "php artisan config:cache",
      "curl -X POST https://hooks.slack.com/your-webhook"
    ],
    "pre_backup": [
      "php artisan db:backup --path=/tmp/pre-backup.sql"
    ],
    "post_restore": [
      "php artisan migrate",
      "php artisan cache:clear"
    ]
  }
}
```

### Custom Templates

```json
{
  "templates": {
    "agency": {
      "name": "Agency Template",
      "description": "Full-featured agency site template",
      "repository": "https://github.com/your-org/agency-template.git",
      "required_plugins": [
        "advanced-custom-fields-pro",
        "gravity-forms",
        "wp-all-import-pro"
      ],
      "theme": "agency-theme",
      "default_pages": [
        "Home",
        "About",
        "Services",
        "Contact"
      ]
    },
    "ecommerce": {
      "name": "E-commerce Template",
      "description": "WooCommerce ready template",
      "repository": "https://github.com/your-org/ecommerce-template.git",
      "required_plugins": [
        "woocommerce",
        "woocommerce-subscriptions",
        "stripe-for-woocommerce"
      ],
      "theme": "storefront",
      "default_pages": [
        "Shop",
        "Cart",
        "Checkout",
        "My Account"
      ]
    }
  }
}
```

### Workflow Configuration

```json
{
  "workflows": {
    "full-project": {
      "description": "Complete project setup from scratch",
      "steps": [
        "create-project",
        "setup-github",
        "provision-server",
        "setup-dns",
        "setup-ssl",
        "deploy",
        "setup-backups",
        "setup-monitoring"
      ]
    },
    "quick-deploy": {
      "description": "Fast deployment for existing projects",
      "steps": [
        "build-assets",
        "deploy",
        "health-check"
      ]
    }
  }
}
```

## 📚 Configuration Examples

### Development Environment

```json
{
  "project": {
    "name": "dev-site",
    "type": "bedrock"
  },
  "environments": {
    "local": {
      "url": "https://dev-site.ddev.site",
      "wp_debug": true,
      "wp_debug_log": true,
      "wp_debug_display": false,
      "save_queries": true,
      "script_debug": true
    }
  },
  "development": {
    "hot_reload": true,
    "live_reload": true,
    "debug_toolbar": true,
    "query_monitor": true
  }
}
```

### Production Environment

```json
{
  "environments": {
    "production": {
      "url": "https://mysite.com",
      "wp_debug": false,
      "wp_debug_log": false,
      "wp_debug_display": false,
      "disallow_file_mods": true,
      "automatic_updater_disabled": true,
      "wp_cache": true,
      "wp_post_revisions": 3
    }
  },
  "security": {
    "force_ssl": true,
    "disable_file_edit": true,
    "disable_xml_rpc": true,
    "limit_login_attempts": true,
    "hide_wp_version": true
  },
  "performance": {
    "cache_enabled": true,
    "cache_plugin": "wp-rocket",
    "cdn_enabled": true,
    "image_optimization": true,
    "minify_html": true,
    "minify_css": true,
    "minify_js": true
  }
}
```

### Multi-Site Configuration

```json
{
  "wordpress": {
    "multisite": true,
    "subdomain_install": false,
    "domain_current_site": "mysite.com",
    "path_current_site": "/",
    "site_id": 1,
    "blog_id": 1
  },
  "environments": {
    "production": {
      "sites": {
        "main": {
          "domain": "mysite.com",
          "path": "/",
          "title": "Main Site"
        },
        "blog": {
          "domain": "mysite.com",
          "path": "/blog/",
          "title": "Blog"
        },
        "shop": {
          "domain": "shop.mysite.com",
          "path": "/",
          "title": "Shop"
        }
      }
    }
  }
}
```

## 🔧 Configuration Management

### View Configuration

```bash
# View global configuration
python3 -m forge config show

# View project configuration
python3 -m forge local config show

# View specific environment
python3 -m forge local config show --environment=production

# View effective configuration (with all overrides)
python3 -m forge local config show --effective
```

### Modify Configuration

```bash
# Set configuration values
python3 -m forge config set user.email "new-email@example.com"
python3 -m forge local config set wordpress.site_title "New Site Title"

# Edit configuration in editor
python3 -m forge config edit
python3 -m forge local config edit

# Reset configuration
python3 -m forge config reset
python3 -m forge local config reset --environment=production
```

### Import/Export Configuration

```bash
# Export configuration
python3 -m forge config export > my-config.json
python3 -m forge local config export --environment=production > prod-config.json

# Import configuration
python3 -m forge config import my-config.json
python3 -m forge local config import prod-config.json --environment=production

# Share configuration with team
python3 -m forge local config export --include-secrets > team-config.json
```

### Validate Configuration

```bash
# Validate global configuration
python3 -m forge config validate

# Validate project configuration
python3 -m forge local config validate

# Validate specific environment
python3 -m forge local config validate --environment=production

# Check for missing configuration
python3 -m forge local config check
```

---

## 🎯 Best Practices

1. **Use Environment Variables** for sensitive data
2. **Version Control** your configuration (except secrets)
3. **Document** custom configuration values
4. **Validate** configuration before deployment
5. **Backup** configuration regularly
6. **Use Templates** for consistent project setup

For more advanced topics, see:
- [Environment Variables Reference](ENVIRONMENT_VARIABLES.md)
- [Security Configuration](SECURITY.md)
- [Provider Guides](PROVIDER_GUIDE.md)
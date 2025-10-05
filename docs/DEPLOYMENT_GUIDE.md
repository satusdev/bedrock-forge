# Deployment Guide

Comprehensive guide to deploying WordPress sites with Bedrock Forge, including strategies, workflows, and best practices.

## 📋 Table of Contents

- [Overview](#overview)
- [Deployment Strategies](#deployment-strategies)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Basic Deployment](#basic-deployment)
- [Advanced Deployment](#advanced-deployment)
- [Zero-Downtime Deployment](#zero-downtime-deployment)
- [Multi-Environment Deployment](#multi-environment-deployment)
- [Deployment Hooks](#deployment-hooks)
- [Monitoring and Rollback](#monitoring-and-rollback)
- [Performance Optimization](#performance-optimization)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

Bedrock Forge provides robust deployment capabilities for WordPress sites with multiple strategies, automatic rollback, and comprehensive monitoring. This guide covers everything from basic deployments to advanced multi-environment workflows.

### Key Features

- **Multiple Deployment Methods**: SSH, SFTP, FTP, rsync
- **Deployment Strategies**: Atomic, rolling, blue-green
- **Automatic Rollback**: Instant rollback on failure
- **Health Checks**: Post-deployment verification
- **Asset Optimization**: Automatic asset building and optimization
- **Database Migrations**: Safe database schema updates

## 🚀 Deployment Strategies

### 1. Atomic Deployment

```yaml
# Atomic deployment - all files updated at once
strategy: atomic
backup_before: true
health_check: true
rollback_on_failure: true
```

**Characteristics:**
- All files updated simultaneously
- Automatic backup before deployment
- Instant rollback on failure
- Health checks after deployment
- Minimal downtime (few seconds)

**Use Cases:**
- Small to medium sites
- Frequent deployments
- High availability requirements

### 2. Rolling Deployment

```yaml
# Rolling deployment - gradual update
strategy: rolling
batch_size: 2
health_check_interval: 30
max_failure_rate: 10
```

**Characteristics:**
- Gradual server updates
- Continuous availability
- Batch-based deployment
- Load balancer integration
- Can handle partial failures

**Use Cases:**
- Large sites with multiple servers
- High traffic sites
- Load balanced environments

### 3. Blue-Green Deployment

```yaml
# Blue-green deployment - zero downtime
strategy: blue-green
switch_method: dns
health_check_grace_period: 300
keep_old_version: true
```

**Characteristics:**
- Complete replica deployment
- Zero downtime deployment
- Instant traffic switching
- Previous version kept for rollback
- DNS or load balancer switching

**Use Cases:**
- Enterprise applications
- Mission-critical sites
- Zero tolerance for downtime

## ✅ Pre-Deployment Checklist

### 1. Environment Configuration

```bash
# Verify environment configuration
python3 -m forge local config show --environment=production

# Check SSH connectivity
python3 -m forge deploy test-connection mysite production

# Verify database access
python3 -m forge sync database mysite test-connection production
```

### 2. Application Readiness

```bash
# Run local tests
pytest forge/tests/ -m "unit and not slow"

# Build assets
npm run build
npm run test

# Check database migrations
ddev exec wp db check
ddev exec wp cli version
```

### 3. Backup Preparation

```bash
# Create pre-deployment backup
python3 -m forge sync backup mysite production \
  --description="Pre-deployment backup" \
  --type=full

# Verify backup exists
python3 -m forge sync list-backups mysite --environment=production
```

### 4. Deployment Configuration

```bash
# Configure deployment settings
python3 -m forge local config set deployment.method rsync
python3 -m forge local config set deployment.strategy atomic
python3 -m forge local config set deployment.rollback_on_failure true

# Add deployment hooks
python3 -m forge local config set deployment.hooks.pre_deploy "npm run build"
python3 -m forge local config set deployment.hooks.post_deploy "wp cache flush"
```

## 🚀 Basic Deployment

### Simple File Deployment

```bash
# Deploy current directory to production
python3 -m forge deploy push mysite production

# Deploy with custom options
python3 -m forge deploy push mysite production \
  --method=rsync \
  --exclude="node_modules,.git,*.log" \
  --build \
  --migrate \
  --dry-run
```

### Database Migration

```bash
# Deploy with database migrations
python3 -m forge deploy push mysite production \
  --migrate \
  --migration-safe-mode

# Run specific migration
python3 -m forge deploy push mysite production \
  --migration-command="wp migrate up 20240115000000"
```

### Asset Management

```bash
# Deploy with asset building
python3 -m forge deploy push mysite production \
  --build \
  --build-command="npm run build" \
  --asset-compression=true

# Optimize assets during deployment
python3 -m forge deploy push mysite production \
  --optimize-images \
  --minify-css \
  --minify-js
```

## 🔧 Advanced Deployment

### Custom Deployment Strategies

```yaml
# .forge/config.json - Custom deployment configuration
{
  "deployment": {
    "strategy": "custom",
    "backup": {
      "enabled": true,
      "type": "full",
      "retention": 3
    },
    "health_checks": [
      {
        "type": "http",
        "url": "https://mysite.com/health",
        "timeout": 30,
        "expected_status": 200
      },
      {
        "type": "database",
        "query": "SELECT 1",
        "timeout": 10
      }
    ],
    "hooks": {
      "pre_deploy": [
        "npm run build",
        "php artisan config:cache"
      ],
      "post_deploy": [
        "wp cache flush",
        "wp search-index rebuild",
        "curl -X POST https://hooks.slack.com/your-webhook"
      ]
    },
    "rollback": {
      "enabled": true,
      "automatic": true,
      "backup_current": true
    }
  }
}
```

### Multi-Server Deployment

```bash
# Deploy to multiple servers simultaneously
python3 -m forge deploy push mysite production \
  --servers="web1,web2,web3" \
  --parallel=true \
  --max_parallel=3

# Deploy with load balancer integration
python3 -m forge deploy push mysite production \
  --load-balancer=nginx \
  --drain-timeout=60 \
  --health-check-interval=10
```

### Staged Rollout

```bash
# Deploy to subset of servers first
python3 -m forge deploy push mysite production \
  --staged-rollout \
  --initial-percentage=10 \
  --increment-percentage=10 \
  --increment-interval=300 \
  --health-check=true

# Monitor staged rollout
python3 -m forge deploy status mysite production \
  --watch \
  --interval=30
```

## ⚡ Zero-Downtime Deployment

### Blue-Green Setup

```yaml
# .forge/environments/production.json
{
  "deployment": {
    "strategy": "blue-green",
    "blue_environment": "production-blue",
    "green_environment": "production-green",
    "switch_method": "dns",
    "health_check_grace_period": 300,
    "keep_old_version": 86400,
    "dns_provider": "cloudflare",
    "load_balancer": {
      "type": "nginx",
      "health_check_path": "/health",
      "timeout": 30
    }
  }
}
```

### Deployment Process

```bash
# Execute zero-downtime deployment
python3 -m forge deploy push mysite production \
  --strategy=blue-green \
  --health-checks \
  --grace-period=300

# Monitor deployment status
python3 -m forge deploy status mysite production \
  --detailed \
  --watch
```

### Traffic Switching

```bash
# Switch traffic to new deployment
python3 -m forge deploy switch-traffic mysite production \
  --to=green \
  --percentage=100

# Gradual traffic switch
python3 -m forge deploy switch-traffic mysite production \
  --to=green \
  --percentage=10 \
  --increment=10 \
  --interval=60
```

## 🌍 Multi-Environment Deployment

### Environment Chain

```bash
# Deploy through environment chain
python3 -m forge deploy chain mysite \
  --environments=staging,production \
  --promote-artifacts \
  --sequential=true

# Deploy with environment-specific configurations
python3 -m forge deploy push mysite production \
  --config=production-config.json \
  --environment-specific
```

### Environment Configuration

```yaml
# Environment-specific deployment settings
{
  "environments": {
    "staging": {
      "deployment": {
        "strategy": "atomic",
        "backup": false,
        "health_checks": false,
        "hooks": {
          "post_deploy": [
            "wp search-index rebuild"
          ]
        }
      }
    },
    "production": {
      "deployment": {
        "strategy": "blue-green",
        "backup": true,
        "health_checks": [
          {
            "type": "http",
            "url": "https://mysite.com/health"
          }
        ],
        "hooks": {
          "pre_deploy": [
            "npm run build:production"
          ],
          "post_deploy": [
            "wp cache flush",
            "curl -X POST https://hooks.slack.com/production-webhook"
          ]
        }
      }
    }
  }
}
```

### Configuration Promotion

```bash
# Promote configuration from staging to production
python3 -m forge config promote staging production

# Deploy with promoted configuration
python3 -m forge deploy push mysite production \
  --config-promotion \
  --config-validation
```

## 🔗 Deployment Hooks

### Pre-Deployment Hooks

```yaml
# .forge/config.json
{
  "deployment": {
    "hooks": {
      "pre_deploy": [
        {
          "name": "Build Assets",
          "command": "npm run build",
          "timeout": 300,
          "continue_on_error": false
        },
        {
          "name": "Clear Caches",
          "command": "wp cache flush",
          "environment": "local"
        },
        {
          "name": "Database Backup",
          "command": "wp db export /tmp/pre-deploy.sql",
          "backup_required": true
        }
      ]
    }
  }
}
```

### Post-Deployment Hooks

```yaml
{
  "deployment": {
    "hooks": {
      "post_deploy": [
        {
          "name": "Run Migrations",
          "command": "wp migrate up",
          "timeout": 600,
          "rollback_on_error": true
        },
        {
          "name": "Update Search Index",
          "command": "wp search-index rebuild",
          "async": true
        },
        {
          "name": "Performance Test",
          "command": "python3 -m forge monitor performance mysite",
          "async": true,
          "timeout": 1800
        },
        {
          "name": "Notification",
          "command": "curl -X POST https://hooks.slack.com/your-webhook",
          "async": true,
          "continue_on_error": true
        }
      ]
    }
  }
}
```

### Custom Hook Scripts

```bash
#!/bin/bash
# .forge/hooks/pre-deploy.sh

set -e

echo "Starting pre-deployment hooks..."

# Build assets
echo "Building assets..."
npm run build

# Run tests
echo "Running tests..."
npm test

# Optimize images
echo "Optimizing images..."
find web/app/uploads -name "*.jpg" -exec jpegoptim {} \;
find web/app/uploads -name "*.png" -exec optipng {} \;

echo "Pre-deployment hooks completed successfully"
```

## 📊 Monitoring and Rollback

### Health Checks

```yaml
{
  "deployment": {
    "health_checks": [
      {
        "name": "HTTP Health Check",
        "type": "http",
        "url": "https://mysite.com/health",
        "method": "GET",
        "expected_status": 200,
        "timeout": 30,
        "attempts": 3,
        "interval": 10
      },
      {
        "name": "Database Health Check",
        "type": "database",
        "query": "SELECT 1",
        "timeout": 10,
        "expected_result": "1"
      },
      {
        "name": "WordPress Health Check",
        "type": "wordpress",
        "endpoint": "/wp-json/wp/v2",
        "expected_plugins": ["cache-enabler", "seo-tool"]
      },
      {
        "name": "Performance Check",
        "type": "performance",
        "max_load_time": 5,
        "max_memory_usage": 256
      }
    ]
  }
}
```

### Rollback Strategies

```bash
# Automatic rollback on failure
python3 -m forge deploy push mysite production \
  --rollback-on-failure \
  --backup-before=true

# Manual rollback to specific version
python3 -m forge deploy rollback mysite production \
  --version=20240115_143022 \
  --backup-current=true

# Rollback to previous version
python3 -m forge deploy rollback mysite production \
  --previous \
  --reason="Performance issues detected"

# Emergency rollback with health check bypass
python3 -m forge deploy rollback mysite production \
  --version=20240115_143022 \
  --skip-health-checks \
  --force
```

### Deployment Monitoring

```bash
# Monitor deployment in real-time
python3 -m forge deploy monitor mysite production \
  --watch \
  --interval=10 \
  --notifications=slack,email

# Check deployment history
python3 -m forge deploy history mysite production \
  --limit=10 \
  --format=table

# Get deployment metrics
python3 -m forge deploy metrics mysite production \
  --period=24h \
  --format=json
```

## ⚡ Performance Optimization

### Asset Optimization

```yaml
{
  "deployment": {
    "assets": {
      "optimization": {
        "enabled": true,
        "images": {
          "compress": true,
          "formats": ["webp", "avif"],
          "quality": 85,
          "progressive": true
        },
        "css": {
          "minify": true,
          "combine": true,
          "critical": true
        },
        "js": {
          "minify": true,
          "combine": true,
          "es6": true
        }
      }
    }
  }
}
```

### Caching Strategy

```yaml
{
  "deployment": {
    "caching": {
      "enabled": true,
      "strategies": {
        "page_cache": {
          "enabled": true,
          "provider": "redis",
          "ttl": 3600
        },
        "object_cache": {
          "enabled": true,
          "provider": "redis",
          "persistent": true
        },
        "cdn": {
          "enabled": true,
          "provider": "cloudflare",
          "purge_on_deploy": true
        }
      },
      "purge": {
        "on_deploy": true,
        "urls": [
          "/",
          "/wp-json/",
          "/sitemap.xml"
        ]
      }
    }
  }
}
```

### Database Optimization

```bash
# Deploy with database optimization
python3 -m forge deploy push mysite production \
  --optimize-database \
  --analyze-tables \
  --repair-tables

# Database maintenance hooks
{
  "deployment": {
    "hooks": {
      "post_deploy": [
        {
          "name": "Database Optimization",
          "command": "wp db optimize",
          "async": true,
          "schedule": "0 2 * * 0"
        }
      ]
    }
  }
}
```

## 🔒 Security Best Practices

### Secure Deployment Configuration

```yaml
{
  "deployment": {
    "security": {
      "file_permissions": {
        "files": 644,
        "directories": 755,
        "wp-config": 600
      },
      "access_control": {
        "restrict_admin_ip": true,
        "allowed_ips": ["192.168.1.0/24"],
        "disable_xml_rpc": true,
        "disable_file_edit": true
      },
      "ssl": {
        "force_ssl": true,
        "hsts": true,
        "certificate_check": true
      },
      "backup": {
        "encryption": true,
        "retention": 30,
        "offsite": true
      }
    }
  }
}
```

### Security Hooks

```bash
# Security scan before deployment
python3 -m forge deploy push mysite production \
  --security-scan \
  --vulnerability-check

# Security hooks configuration
{
  "deployment": {
    "hooks": {
      "pre_deploy": [
        {
          "name": "Security Scan",
          "command": "bandit -r web/app/plugins/",
          "continue_on_error": false
        },
        {
          "name": "Vulnerability Check",
          "command": "wp plugin vuln status",
          "continue_on_error": false
        }
      ]
    }
  }
}
```

## 🐛 Troubleshooting

### Common Deployment Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Permission Denied | File permissions incorrect | Set proper file permissions |
| Database Connection Failed | Wrong credentials | Verify database configuration |
| SSL Certificate Error | Certificate expired/invalid | Renew SSL certificate |
| Health Check Failed | Application not ready | Check application logs |
| Timeout During Deployment | Network issues or large files | Increase timeout or optimize deployment |

### Debug Deployment

```bash
# Debug deployment with verbose output
python3 -m forge deploy push mysite production \
  --verbose \
  --debug \
  --log-level=DEBUG

# Test deployment connectivity
python3 -m forge deploy test-connection mysite production

# Check deployment prerequisites
python3 -m forge deploy check-prerequisites mysite production

# Validate deployment configuration
python3 -m forge deploy validate-config mysite production
```

### Performance Debugging

```bash
# Profile deployment performance
python3 -m forge deploy push mysite production \
  --profile \
  --profile-output=deployment-profile.json

# Monitor resource usage during deployment
python3 -m forge deploy push mysite production \
  --monitor-resources \
  --resource-thresholds="cpu:80,memory:90,disk:85"
```

### Emergency Recovery

```bash
# Emergency rollback
python3 -m forge deploy emergency-rollback mysite production

# Restore from backup
python3 -m forge sync restore mysite latest \
  --environment=production \
  --force

# Deployment repair mode
python3 -m forge deploy repair mysite production \
  --skip-health-checks \
  --skip-hooks \
  --force
```

---

## 📚 Advanced Topics

### Custom Deployment Scripts

```python
#!/usr/bin/env python3
# .forge/scripts/custom_deployment.py

import os
import sys
from pathlib import Path

def custom_deployment_strategy(project, environment):
    """Custom deployment strategy implementation."""

    # 1. Pre-deployment checks
    if not pre_deployment_checks():
        sys.exit(1)

    # 2. Build assets
    build_assets()

    # 3. Deploy files
    deploy_files()

    # 4. Run migrations
    run_migrations()

    # 5. Health checks
    if not health_checks():
        rollback()
        sys.exit(1)

    # 6. Post-deployment tasks
    post_deployment_tasks()

    print("Deployment completed successfully!")

if __name__ == "__main__":
    project = sys.argv[1]
    environment = sys.argv[2]
    custom_deployment_strategy(project, environment)
```

### Deployment Templates

```yaml
# .forge/templates/e-commerce-deployment.yaml
name: "E-commerce Deployment"
description: "Optimized deployment for e-commerce sites"

strategy: blue-green
backup:
  enabled: true
  type: full
  retention: 7

health_checks:
  - type: http
    url: "${url}/health"
    expected_status: 200
  - type: e-commerce
    check_cart_functionality: true
    check_payment_gateway: true

hooks:
  pre_deploy:
    - command: "npm run build:production"
      timeout: 600
    - command: "wp cache flush"
  post_deploy:
    - command: "wp e-commerce flush-caches"
    - command: "wp search-index rebuild"
    - command: "curl -X POST ${SLACK_WEBHOOK}"

security:
  ssl: true
  force_ssl: true
  disable_file_edit: true
  restrict_admin_ip: true

performance:
  asset_optimization: true
  database_optimization: true
  caching:
    page_cache: true
    object_cache: true
    cdn: true
```

### Integration with External Systems

```python
# Integrate with CI/CD systems
class CICDIntegration:
    def __init__(self, provider: str):
        self.provider = provider

    def trigger_deployment(self, environment: str) -> DeploymentResult:
        """Trigger deployment from external system."""
        if self.provider == "github":
            return self._github_deployment(environment)
        elif self.provider == "jenkins":
            return self._jenkins_deployment(environment)

    def monitor_deployment(self, deployment_id: str) -> DeploymentStatus:
        """Monitor deployment progress."""
        pass

    def get_deployment_logs(self, deployment_id: str) -> List[str]:
        """Get deployment logs."""
        pass
```

---

For more information:
- [Configuration Guide](CONFIGURATION.md)
- [Command Reference](COMMANDS.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [API Documentation](API.md)
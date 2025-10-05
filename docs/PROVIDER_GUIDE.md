# Server Provider Setup Guide

This guide provides detailed setup instructions for all supported server providers in Bedrock Forge.

## Overview

Bedrock Forge supports multiple hosting providers, each with specific configuration requirements and optimization strategies.

## Supported Providers

| Provider | Status | Recommended For | Key Features |
|----------|--------|-----------------|--------------|
| **Hetzner** | ✅ Production | High-performance sites | Excellent price/performance |
| **CyberPanel** | ✅ Production | User-friendly management | Web-based control panel |
| **LibyanSpider** | ✅ Production | Regional hosting | Local support and compliance |

## Hetzner Setup

### Prerequisites

- Hetzner Cloud Account
- API Token (from Cloud Console)
- SSH Key configured
- Ubuntu 22.04 LTS preferred

### 1. Configure Hetzner Credentials

```bash
# Set environment variables
export HETZNER_API_TOKEN="your_api_token_here"
export HETZNER_SSH_KEY_ID="your_ssh_key_id"

# Or add to forge.yaml
providers:
  hetzner:
    api_token: "${HETZNER_API_TOKEN}"
    ssh_key_id: "${HETZNER_SSH_KEY_ID}"
    default_region: "nbg1"
    default_server_type: "cpx31"
```

### 2. Provision Server

```bash
# Interactive setup
forge provision hetzner

# With custom parameters
forge provision hetzner \
  --server-type "cpx41" \
  --region "fsn1" \
  --name "my-wp-server" \
  --ssh-keys "my-key"

# Quick setup with defaults
forge provision hetzner --quick
```

### 3. Server Configuration

```yaml
# forge.yaml configuration
server:
  provider: "hetzner"
  server_id: "12345678"
  ip_address: "1.2.3.4"
  ssh_key: "~/.ssh/hetzner_key"

  # Server specs
  server_type: "cpx31"
  region: "nbg1"
  image: "ubuntu-22.04"

# Provisioning settings
provisioning:
  firewall:
    enabled: true
    rules:
      - port: 22
        source: "0.0.0.0/0"
      - port: 80
        source: "0.0.0.0/0"
      - port: 443
        source: "0.0.0.0/0"

  backups:
    enabled: true
    schedule: "daily"
    retention: 7
```

### 4. Optimization for Hetzner

```bash
# Optimize for Hetzner infrastructure
forge provision hetzner --optimize

# Configure Hetzner-specific features
forge server configure --feature "hetzner-cloud-network"
forge server configure --feature "hetzner-floating-ip"
forge server configure --feature "hetzner-load-balancer"
```

## CyberPanel Setup

### Prerequisites

- CyberPanel Account (Free or Enterprise)
- Server access credentials
- OpenLiteSpeed or LiteSpeed Web Server

### 1. Configure CyberPanel

```bash
# Set CyberPanel credentials
forge provision cyberpanel --setup

# Interactive configuration
forge provision cyberpanel \
  --host "your-server.com" \
  --port "8083" \
  --username "admin" \
  --password "your_password"
```

### 2. Server Configuration

```yaml
# forge.yaml for CyberPanel
server:
  provider: "cyberpanel"
  host: "your-server.com"
  port: 8083
  username: "admin"
  password: "${CYBERPANEL_PASSWORD}"

  # Panel settings
  panel_type: "openlitespeed"  # or "litespeed"
  php_version: "8.1"

cyberpanel:
  # Website configuration
  website:
    domain: "your-domain.com"
    php_version: "8.1"
    ssl: true
    email: "admin@your-domain.com"

  # Database settings
  database:
    name: "wordpress_db"
    user: "wordpress_user"
    password: "${DB_PASSWORD}"

  # Optimization settings
  optimization:
    cache_enabled: true
    page_cache: true
    object_cache: "redis"
    cdn: false
```

### 3. Provision CyberPanel

```bash
# Full setup
forge provision cyberpanel --full-setup

# Create WordPress site
forge provision cyberpanel --create-site --domain "example.com"

# Configure SSL
forge provision cyberpanel --ssl --domain "example.com"

# Setup staging
forge provision cyberpanel --staging --domain "staging.example.com"
```

### 4. CyberPanel Optimization

```bash
# Enable caching
forge cyberpanel optimize --cache --page-cache

# Configure Redis
forge cyberpanel setup --redis

# SSL certificate setup
forge cyberpanel ssl --install --domain "example.com"

# Security hardening
forge cyberpanel security --harden
```

## LibyanSpider Setup

### Prerequisites

- LibyanSpider Account
- API credentials
- Regional compliance requirements

### 1. Configure LibyanSpider

```bash
# Setup credentials
forge provision libyanspider --configure

# Regional setup
forge provision libyanspider \
  --region "libya" \
  --compliance "local" \
  --language "ar"
```

### 2. Server Configuration

```yaml
# forge.yaml for LibyanSpider
server:
  provider: "libyanspider"
  region: "libya"
  compliance_level: "local"

libyanspider:
  # Regional settings
  localization:
    language: "ar"
    timezone: "Africa/Tripoli"
    currency: "LYD"

  # Compliance settings
  compliance:
    data_localization: true
    privacy_regulations: "libyan"
    audit_logging: true

  # Support settings
  support:
    language: "ar"
    local_hours: true
    emergency_contact: "+218 21-xxx-xxxx"
```

### 3. Provision with Compliance

```bash
# Compliant provisioning
forge provision libyanspider --compliant --audit

# Localized setup
forge provision libyanspider --arabic --local-support

# Security configuration
forge provision libyanspider --security --compliance
```

## Generic Provider Setup

### Custom Provider Configuration

```yaml
# Generic provider setup
server:
  provider: "generic"
  type: "vps"  # vps, dedicated, cloud

  # Connection details
  host: "your-server.com"
  port: 22
  username: "root"
  ssh_key: "~/.ssh/server_key"

  # Server specifications
  specs:
    cpu: "4 cores"
    ram: "8GB"
    storage: "100GB SSD"
    bandwidth: "Unlimited"

# Generic provisioning
provisioning:
  method: "ssh"
  os: "ubuntu-22.04"
  web_server: "nginx"  # nginx, apache, litespeed

  # Custom scripts
  scripts:
    pre_install: "scripts/pre_install.sh"
    post_install: "scripts/post_install.sh"
    custom_config: "scripts/custom.sh"
```

### Manual Server Setup

```bash
# Prepare server manually
ssh root@your-server.com

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y nginx mysql-server php8.1-fpm php8.1-mysql

# Secure MySQL
mysql_secure_installation

# Create database
mysql -u root -p
CREATE DATABASE wordpress;
CREATE USER 'wp_user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON wordpress.* TO 'wp_user'@'localhost';
FLUSH PRIVILEGES;

# Configure Nginx
# (Copy Nginx configuration)

# Configure PHP
# (Configure php.ini)

# Setup SSL
# (Install SSL certificates)
```

## Provider-Specific Features

### Hetzner Features

**Cloud Networks**:
```bash
# Setup private network
forge hetzner network create --name "wp-network" --ip-range "10.0.0.0/16"
forge hetzner server attach-network --server-id 123456 --network-id 98765
```

**Floating IPs**:
```bash
# Allocate floating IP
forge hetzner floating-ip create --type "ipv4"
forge hetzner floating-ip assign --server-id 123456
```

**Load Balancers**:
```bash
# Setup load balancer
forge hetzner loadbalancer create --name "wp-lb" --algorithm "round_robin"
forge hetzner loadbalancer add-server --lb-id 11111 --server-id 123456
```

**Snapshots**:
```bash
# Create snapshot
forge hetzner snapshot create --server-id 123456 --description "Pre-update backup"

# Restore snapshot
forge hetzner snapshot restore --snapshot-id 99999 --server-id 123456
```

### CyberPanel Features

**Website Management**:
```bash
# Create website
forge cyberpanel site create --domain "example.com" --php "8.1"

# Manage domains
forge cyberpanel domain add --website "example.com" --domain "www.example.com"

# Email accounts
forge cyberpanel email create --domain "example.com" --user "info" --password "password"
```

**SSL Management**:
```bash
# Install SSL
forge cyberpanel ssl install --domain "example.com"

# Wildcard SSL
forge cyberpanel ssl wildcard --domain "*.example.com"

# SSL renewal
forge cyberpanel ssl renew --domain "example.com"
```

**Database Management**:
```bash
# Create database
forge cyberpanel database create --name "wordpress_db"

# Database user
forge cyberpanel db-user create --name "wp_user" --password "password"

# PhpMyAdmin access
forge cyberpanel phpmyadmin enable
```

### LibyanSpider Features

**Compliance Management**:
```bash
# Enable compliance features
forge libyanspider compliance enable --data-localization

# Generate compliance report
forge libyanspider compliance report --format pdf

# Audit logging
forge libyanspider audit enable --all-events
```

**Regional Optimization**:
```bash
# Configure for local market
forge libyanspider optimize --region libya --language ar

# Local payment gateway
forge libyanspider payment gateway --local

# Local CDN
forge libyanspider cdn setup --local
```

## Security Configuration

### Common Security Settings

```yaml
# Security configuration
security:
  # Firewall rules
  firewall:
    enabled: true
    default_policy: "deny"
    rules:
      - port: 22
        source: "your_ip/32"
        action: "allow"
      - port: 80
        source: "0.0.0.0/0"
        action: "allow"
      - port: 443
        source: "0.0.0.0/0"
        action: "allow"

  # SSH configuration
  ssh:
    disable_root: true
    key_only: true
    change_port: 2222
    fail2ban: true

  # SSL/TLS
  ssl:
    force_https: true
    hsts: true
    certificates: "letsencrypt"

  # WordPress security
  wordpress:
    disable_xmlrpc: true
    hide_version: true
    limit_login_attempts: true
    security_headers: true
```

### Provider-Specific Security

**Hetzner Security**:
```bash
# Configure firewall
forge hetzner firewall create --name "wp-firewall" --rules "22,80,443"
forge hetzner firewall apply --server-id 123456 --firewall-id 55555

# Backup encryption
forge hetzner backup encrypt --server-id 123456

# Monitoring setup
forge hetzner monitoring enable --server-id 123456
```

**CyberPanel Security**:
```bash
# ModSecurity rules
forge cyberpanel security modsecurity enable

# CSF firewall
forge cyberpanel security csf enable

# Hardening
forge cyberpanel security harden --wordpress
```

## Performance Optimization

### General Optimization

```bash
# Server optimization
forge server optimize --provider <provider> --wordpress

# Database optimization
forge database optimize --mysql

# Caching setup
forge cache setup --redis --object-cache

# CDN configuration
forge cdn setup --cloudflare
```

### Provider-Specific Optimization

**Hetzner Optimization**:
```bash
# Use local SSD storage
forge hetzner storage optimize --ssd

# Network optimization
forge hetzner network optimize --private-ip

# CPU optimization
forge hetzner cpu optimize --performance
```

**CyberPanel Optimization**:
```bash
# LiteSpeed optimization
forge cyberpanel optimize litespeed --cache

# PHP optimization
forge cyberpanel optimize php --opcache

# MySQL optimization
forge cyberpanel optimize mysql --innodb
```

## Migration Between Providers

### Backup Current Server

```bash
# Create full backup
forge backup create --type full --name "pre-migration"

# Export configuration
forge config export --file migration-config.yaml
```

### Migrate to New Provider

```bash
# Provision new server
forge provision <new-provider> --import-config migration-config.yaml

# Transfer data
forge migrate transfer --from <old-provider> --to <new-provider>

# Test migration
forge migrate test --environment staging
```

### DNS and Configuration Update

```bash
# Update DNS records
forge dns update --provider <dns-provider> --new-ip <new_server_ip>

# Update configuration
forge config update --server-ip <new_server_ip>

# Verify functionality
forge health check --full --environment production
```

## Troubleshooting

### Common Provider Issues

**Connection Issues**:
```bash
# Test provider connection
forge provision <provider> --test-connection

# Verify credentials
forge provision <provider> --verify-credentials

# Check server status
forge server status --provider <provider>
```

**Configuration Issues**:
```bash
# Validate configuration
forge config validate --provider <provider>

# Check logs
forge logs fetch --provider <provider> --service all

# Diagnose issues
forge diagnose --provider <provider>
```

**Performance Issues**:
```bash
# Performance test
forge benchmark --provider <provider>

# Resource usage
forge monitor resources --provider <provider>

# Optimization suggestions
forge optimize suggest --provider <provider>
```

## Provider Comparison

### Decision Matrix

| Feature | Hetzner | CyberPanel | LibyanSpider |
|---------|---------|------------|--------------|
| **Price** | Low | Medium | Medium |
| **Performance** | Excellent | Good | Good |
| **Ease of Use** | Medium | Easy | Easy |
| **Control Panel** | No | Yes | Yes |
| **Support** | Good | Good | Excellent (Local) |
| **Compliance** | GDPR | Basic | Local Laws |
| **Backup** | Included | Manual | Manual |
| **SSL** | Manual | Auto | Manual |

### Recommendations

**Choose Hetzner if**:
- You want best price/performance
- You're comfortable with command line
- You need high performance
- You prefer manual control

**Choose CyberPanel if**:
- You want a control panel
- You're new to server management
- You need easy SSL management
- You prefer graphical interface

**Choose LibyanSpider if**:
- You need local compliance
- You're targeting Libyan market
- You want local support
- You need Arabic language support

This comprehensive provider guide helps you choose and configure the right hosting provider for your WordPress projects.
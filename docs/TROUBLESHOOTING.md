# Troubleshooting Guide

Solutions to common issues and problems when using Bedrock Forge.

## 📋 Table of Contents

- [Installation Issues](#installation-issues)
- [Local Development Issues](#local-development-issues)
- [Configuration Issues](#configuration-issues)
- [Deployment Issues](#deployment-issues)
- [Backup & Sync Issues](#backup--sync-issues)
- [Provisioning Issues](#provisioning-issues)
- [Performance Issues](#performance-issues)
- [Security Issues](#security-issues)
- [Debugging Tools](#debugging-tools)
- [Getting Help](#getting-help)

## 🚀 Installation Issues

### Python Version Incompatible

**Problem**: `python3 -m forge --help` fails with syntax errors

**Solution**:
```bash
# Check Python version
python3 --version

# Must be Python 3.9+
# If older, upgrade Python:
# Ubuntu/Debian:
sudo apt update
sudo apt install python3.9 python3.9-pip python3.9-venv

# macOS (using Homebrew):
brew install python@3.9

# Create virtual environment
python3.9 -m venv forge-env
source forge-env/bin/activate
pip install -r forge/requirements.txt
```

### Module Import Errors

**Problem**: `ModuleNotFoundError: No module named 'forge'`

**Solutions**:

```bash
# 1. Install dependencies properly
cd /path/to/bedrock-forge
pip install -r forge/requirements.txt

# 2. Add to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:/path/to/bedrock-forge"
echo 'export PYTHONPATH="${PYTHONPATH}:/path/to/bedrock-forge"' >> ~/.bashrc

# 3. Run from correct directory
cd /path/to/bedrock-forge
python3 -m forge --help

# 4. Install in development mode
pip install -e .
```

### Permission Denied

**Problem**: Permission errors when running commands

**Solution**:
```bash
# Check file permissions
ls -la forge/

# Fix permissions if needed
chmod +x forge/scripts/*.sh
chmod -R 755 forge/

# Don't use sudo with pip unless necessary
# If you must, use user install:
pip install --user -r forge/requirements.txt
```

## 🏠 Local Development Issues

### DDEV Not Starting

**Problem**: `ddev start` fails

**Solutions**:

```bash
# 1. Check Docker is running
docker --version
docker info

# 2. Restart Docker
sudo systemctl restart docker  # Linux
# Or restart Docker Desktop (macOS/Windows)

# 3. Check DDEV installation
ddev version

# 4. Clear DDEV cache
ddev poweroff
ddev start

# 5. Check port conflicts
ddev describe
# Kill processes using ports 80, 443, 8025, 8037
sudo lsof -i :80
sudo kill -9 <PID>

# 6. Recreate project
ddev delete --omit-snapshot
ddev config --auto
ddev start
```

### Database Connection Issues

**Problem**: Cannot connect to database

**Solutions**:

```bash
# 1. Check database status
ddev exec mysql -e "SHOW DATABASES;"

# 2. Restart database container
ddev exec mysqladmin shutdown
ddev start

# 3. Check database configuration
ddev exec cat /etc/mysql/my.cnf

# 4. Reset database (WARNING: deletes all data)
ddev delete --omit-snapshot --yes
ddev start
```

### Composer Timeout Issues

**Problem**: Composer operations timeout

**Solutions**:

```bash
# 1. Increase timeout
export COMPOSER_PROCESS_TIMEOUT=600

# 2. Use different mirrors
ddev exec composer config -g repo.packagist composer https://packagist.org

# 3. Clear composer cache
ddev exec composer clear-cache

# 4. Install without dev dependencies
ddev exec composer install --no-dev --optimize-autoloader
```

### WordPress Installation Fails

**Problem**: `wp core install` fails

**Solutions**:

```bash
# 1. Check WordPress configuration
ddev exec wp config list

# 2. Check database connection
ddev exec wp db check

# 3. Reset WordPress installation
ddev exec wp db reset --yes
ddev exec wp core install --url=https://mysite.ddev.site --title="My Site" --admin_user=admin --admin_password=password --admin_email=admin@example.com

# 4. Check file permissions
ddev exec ls -la web/wp/
ddev exec chmod 755 web/wp/
```

## ⚙️ Configuration Issues

### Invalid Configuration JSON

**Problem**: Configuration file has JSON syntax errors

**Solutions**:

```bash
# 1. Validate JSON
python3 -m forge config validate

# 2. Check JSON syntax
python3 -m json.tool ~/.forge/config.json

# 3. Fix common issues
# Missing commas
# Trailing commas
# Incorrect quotes
# Nested object structure

# 4. Reset configuration if needed
python3 -m forge config reset
```

### Environment Variables Not Working

**Problem**: Environment variables not being recognized

**Solutions**:

```bash
# 1. Check if variables are set
env | grep FORGE_

# 2. Load environment file
source .env

# 3. Set variables permanently
echo 'export FORGE_GITHUB_TOKEN="your_token"' >> ~/.bashrc
source ~/.bashrc

# 4. Check configuration interpolation
python3 -m forge config show --format=json | jq '.environments.production.db_password'

# 5. Test with explicit environment
FORGE_GITHUB_TOKEN="token" python3 -m forge local create-project test
```

### Missing Credentials

**Problem**: Credentials not found in keyring

**Solutions**:

```bash
# 1. Check keyring status
python3 -c "import keyring; print(keyring.get_keyring())"

# 2. Set credentials manually
python3 -c "import keyring; keyring.set_password('forge', 'github_token', 'your_token')"

# 3. Use environment variables instead
export FORGE_GITHUB_TOKEN="your_token"

# 4. Check credential storage
python3 -m forge config get security.credential_store

# 5. Reset credentials
python3 -c "import keyring; keyring.delete_password('forge', 'github_token')"
```

## 📦 Deployment Issues

### SSH Connection Failed

**Problem**: Cannot connect to server via SSH

**Solutions**:

```bash
# 1. Test SSH connection manually
ssh -i ~/.ssh/id_rsa user@server

# 2. Check SSH key permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub

# 3. Add SSH key to agent
ssh-add ~/.ssh/id_rsa

# 4. Check server SSH config
ssh user@server "cat /etc/ssh/sshd_config"

# 5. Test with verbose output
ssh -v -i ~/.ssh/id_rsa user@server

# 6. Check firewall rules
python3 -m forge provision firewall-list server_name
```

### Rsync Permission Denied

**Problem**: Rsync fails with permission errors

**Solutions**:

```bash
# 1. Check remote directory permissions
ssh user@server "ls -la /var/www/html/"

# 2. Fix ownership
ssh user@server "sudo chown -R www-data:www-data /var/www/html/"

# 3. Check user groups
ssh user@server "groups"
ssh user@server "sudo usermod -a -G www-data user"

# 4. Test rsync with verbose output
rsync -avz --dry-run -e "ssh -i ~/.ssh/id_rsa" local/ user@server:/remote/path/

# 5. Use different user or sudo
python3 -m forge deploy push mysite production --ssh-user=deploy
```

### Database Migration Failed

**Problem**: Database migrations fail during deployment

**Solutions**:

```bash
# 1. Check database connection
python3 -m forge info server myserver --detailed

# 2. Test migration manually
ssh user@server "cd /var/www/html && wp cli version"
ssh user@server "cd /var/www/html && wp db check"

# 3. Check migration files
ssh user@server "cd /var/www/html && wp migration status"

# 4. Run migrations manually
ssh user@server "cd /var/www/html && wp migration run"

# 5. Skip migrations if not needed
python3 -m forge deploy push mysite production --no-migrate
```

### Out of Memory During Deployment

**Problem**: Deployment fails due to memory issues

**Solutions**:

```bash
# 1. Check server memory
python3 -m forge info server myserver --section=memory

# 2. Increase PHP memory limit
ssh user@server "php -i | grep memory_limit"
ssh user@server "sudo nano /etc/php/8.2/fpm/php.ini"
# Set memory_limit = 512M

# 3. Restart services
ssh user@server "sudo systemctl restart php8.2-fpm"

# 4. Use deployment strategies
python3 -m forge deploy push mysite production --strategy=atomic

# 5. Exclude large files temporarily
python3 -m forge deploy push mysite production --exclude="node_modules,*.zip,backup*"
```

## 💾 Backup & Sync Issues

### Google Drive Authentication Failed

**Problem**: Cannot authenticate with Google Drive

**Solutions**:

```bash
# 1. Check rclone configuration
rclone config show

# 2. Reconfigure Google Drive
rclone config
# Choose existing remote or create new one
# Select Google Drive
# Follow authentication flow

# 3. Test connection
rclone lsd gdrive: --dry-run

# 4. Check service account credentials
python3 -c "import keyring; print(keyring.get_password('forge', 'gdrive_service_account_json'))"

# 5. Use interactive authentication
python3 -m forge sync backup mysite production --destination=gdrive --auth-interactive
```

### Database Sync Fails

**Problem**: Database synchronization fails

**Solutions**:

```bash
# 1. Check database credentials
python3 -m forge local config show --environment=production

# 2. Test database connection
mysql -h host -u user -p database

# 3. Check MySQL version compatibility
mysql --version
# Target and source should have compatible versions

# 4. Use compression for large databases
python3 -m forge sync database mysite pull production --compress

# 5. Exclude large tables
python3 -m forge sync database mysite pull production --exclude-tables="wp_posts,wp_postmeta"

# 6. Export/import manually
ddev exec wp db export /tmp/db.sql
scp user@server:/path/to/db.sql /tmp/
ddev exec wp db import /tmp/db.sql
```

### File Sync Timeout

**Problem**: File synchronization times out

**Solutions**:

```bash
# 1. Increase timeout
python3 -m forge sync files mysite pull production --timeout=600

# 2. Sync in smaller chunks
python3 -m forge sync files mysite pull production --path=web/app/plugins
python3 -m forge sync files mysite pull production --path=web/app/themes

# 3. Exclude unnecessary files
python3 -m forge sync files mysite pull production --exclude="node_modules,*.log,cache"

# 4. Use rsync directly
rsync -avz --progress user@server:/var/www/html/web/app/uploads/ web/app/uploads/

# 5. Check network connection
ping server.com
traceroute server.com
```

## 🖥️ Provisioning Issues

### Hetzner API Errors

**Problem**: Hetzner Cloud API calls fail

**Solutions**:

```bash
# 1. Check API token
export HETZNER_TOKEN="your_token"
curl -H "Authorization: Bearer $HETZNER_TOKEN" https://api.hetzner.cloud/v1/servers

# 2. Verify token permissions
# Token must have read/write permissions

# 3. Check rate limits
curl -I https://api.hetzner.cloud/v1/servers

# 4. Use alternative endpoint
python3 -m forge config set hetzner.api_endpoint="https://api.hetzner.cloud/v1"

# 5. Test with dry run
python3 -m forge provision hetzner-create test --dry-run
```

### CyberPanel Installation Fails

**Problem**: CyberPanel installation fails

**Solutions**:

```bash
# 1. Check system requirements
python3 -m forge info server myserver --section=system

# 2. Verify Ubuntu version
ssh root@server "lsb_release -a"
# Must be Ubuntu 18.04, 20.04, or 22.04

# 3. Check available disk space
ssh root@server "df -h"

# 4. Install prerequisites
ssh root@server "apt update && apt install -y curl wget"

# 5. Run installation manually
ssh root@server "bash <(curl -s https://cyberpanel.net/install.sh)"

# 6. Check firewall
ssh root@server "ufw status"
ssh root@server "ufw allow 8097/tcp"
```

### SSL Certificate Issues

**Problem**: SSL certificate generation fails

**Solutions**:

```bash
# 1. Check DNS propagation
dig mysite.com
nslookup mysite.com

# 2. Verify domain points to server
curl -I http://mysite.com

# 3. Check Let's Encrypt rate limits
curl https://letsencrypt.org/docs/rate-limits/

# 4. Use DNS validation
python3 -m forge provision ssl-setup mysite.com --dns-provider=cloudflare

# 5. Check certificate manually
ssh root@server "certbot certificates"

# 6. Force renewal
ssh root@server "certbot renew --force-renewal"
```

## ⚡ Performance Issues

### Slow Deployment

**Problem**: Deployment takes too long

**Solutions**:

```bash
# 1. Use rsync efficiently
python3 -m forge deploy push mysite production --exclude="node_modules,.git,cache"

# 2. Enable compression
python3 -m forge deploy push mysite production --compress

# 3. Use deployment strategies
python3 -m forge deploy push mysite production --strategy=atomic

# 4. Optimize rsync options
python3 -m forge config set deployment.rsync_options="--partial --progress"

# 5. Use parallel processing
python3 -m forge deploy push mysite production --parallel=4
```

### High Memory Usage

**Problem**: High memory consumption during operations

**Solutions**:

```bash
# 1. Monitor memory usage
python3 -m forge monitor health mysite --detailed

# 2. Limit concurrent operations
python3 -m forge config set deployment.max_concurrent_uploads=2

# 3. Use streaming for large files
python3 -m forge sync backup mysite production --stream

# 4. Clear caches regularly
python3 -m forge local cache clear

# 5. Optimize PHP settings
ssh user@server "sudo nano /etc/php/8.2/fpm/php.ini"
# Set appropriate memory limits
```

### Network Timeout Issues

**Problem**: Operations timeout due to network issues

**Solutions**:

```bash
# 1. Increase timeout values
python3 -m forge config set network.timeout=300
python3 -m forge config set network.retry_attempts=5

# 2. Use connection pooling
python3 -m forge config set network.connection_pooling=true

# 3. Test network connectivity
ping -c 4 server.com
traceroute server.com

# 4. Use different network protocols
python3 -m forge deploy push mysite production --protocol=ftp

# 5. Enable compression
python3 -m forge sync backup mysite production --compress
```

## 🔒 Security Issues

### Permission Denied Errors

**Problem**: Permission denied for file operations

**Solutions**:

```bash
# 1. Check file permissions
ls -la web/app/

# 2. Fix WordPress permissions
sudo chown -R www-data:www-data web/app/
sudo find web/app/ -type d -exec chmod 755 {} \;
sudo find web/app/ -type f -exec chmod 644 {} \;

# 3. Check user groups
groups
sudo usermod -a -G www-data $USER

# 4. Use proper deployment user
python3 -m forge config set deployment.user="deploy"

# 5. Verify SSH key permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
```

### Credential Security

**Problem**: Credentials exposed in logs or configuration

**Solutions**:

```bash
# 1. Use keyring for sensitive data
python3 -c "import keyring; keyring.set_password('forge', 'db_password', 'secret')"

# 2. Use environment variables
export FORGE_DB_PASSWORD="secret"
echo 'export FORGE_DB_PASSWORD="secret"' >> ~/.bashrc

# 3. Encrypt configuration files
python3 -m forge config encrypt

# 4. Check log levels
python3 -m forge config set logging.level="WARNING"

# 5. Audit credentials
python3 -m forge security audit
```

### SSL/TLS Issues

**Problem**: SSL certificate errors

**Solutions**:

```bash
# 1. Check certificate validity
openssl s_client -connect mysite.com:443

# 2. Verify certificate chain
curl -I https://mysite.com

# 3. Check certificate expiration
ssh root@server "certbot certificates"

# 4. Force certificate renewal
ssh root@server "certbot renew"

# 5. Update SSL configuration
ssh root@server "nano /etc/nginx/sites-available/mysite.com"
```

## 🔧 Debugging Tools

### Enable Debug Mode

```bash
# Set debug environment variables
export FORGE_DEBUG=true
export FORGE_LOG_LEVEL=DEBUG
export FORGE_VERBOSE=true

# Or use command line flags
python3 -m forge --verbose --debug command

# Check debug configuration
python3 -m forge config show --section=logging
```

### Log Files

```bash
# View Forge logs
tail -f ~/.forge/logs/forge.log
tail -f ~/.forge/logs/error.log

# View DDEV logs
ddev logs -f

# View web server logs
ssh user@server "tail -f /var/log/nginx/error.log"
ssh user@server "tail -f /var/log/php8.2-fpm.log"

# View system logs
journalctl -u nginx -f
journalctl -u php8.2-fpm -f
```

### Health Checks

```bash
# Check system health
python3 -m forge info system

# Check project health
python3 -m forge local info --section=health

# Check server health
python3 -m forge info server myserver --detailed

# Check monitoring status
python3 -m forge monitor list --status=down
```

### Network Diagnostics

```bash
# Test connectivity
python3 -m forge network test --host=server.com --port=22

# Trace network path
python3 -m forge network traceroute server.com

# Test DNS resolution
python3 -m forge network dns mysite.com

# Check SSL certificate
python3 -m forge network ssl mysite.com
```

## 🆘 Getting Help

### Generate Debug Information

```bash
# Create debug bundle
python3 -m forge debug create-bundle

# This creates a zip file with:
# - Configuration files
# - Log files
# - System information
# - Error traces
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ModuleNotFoundError` | Missing dependencies | `pip install -r forge/requirements.txt` |
| `Permission denied` | File permissions | `chmod 755 forge/` |
| `Connection refused` | Service not running | `ddev start` or `sudo systemctl start nginx` |
| `Authentication failed` | Invalid credentials | Check API tokens and SSH keys |
| `JSON decode error` | Invalid configuration | `python3 -m forge config validate` |
| `Database connection failed` | Wrong DB credentials | Verify database configuration |
| `SSL handshake failed` | Certificate issues | Check SSL setup and domain |

### Community Support

- **GitHub Issues**: [Report bugs](https://github.com/your-org/bedrock-forge/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/your-org/bedrock-forge/discussions)
- **Documentation**: [Complete docs](IMPLEMENTATION_STATUS.md)
- **Discord**: [Live chat support](https://discord.gg/bedrock-forge)

### Professional Support

For enterprise support:
- **Email**: support@bedrock-forge.com
- **Documentation**: [Enterprise Support](https://bedrock-forge.com/enterprise)
- **Consulting**: [Expert help](https://bedrock-forge.com/consulting)

### Bug Reporting

When reporting bugs, include:

1. **Forge version**: `python3 -m forge --version`
2. **System information**: `python3 -m forge info system`
3. **Error message**: Full error traceback
4. **Steps to reproduce**: Detailed reproduction steps
5. **Expected behavior**: What should have happened
6. **Configuration**: (sanitized) configuration files
7. **Debug bundle**: `python3 -m forge debug create-bundle`

---

## 🔍 Quick Diagnostic Commands

```bash
# Quick system check
python3 -m forge doctor

# Check all services
python3 -m forge local check

# Test configuration
python3 -m forge config validate --strict

# Network diagnostics
python3 -m forge network check-all

# Create support bundle
python3 -m forge debug support-bundle
```

These commands will help diagnose most common issues and provide specific recommendations for fixes.
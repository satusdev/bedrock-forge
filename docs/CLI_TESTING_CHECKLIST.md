# Bedrock Forge CLI - Comprehensive Testing Checklist

## 📋 Overview

This checklist provides comprehensive testing scenarios for all Bedrock Forge
CLI features to ensure smooth operation and identify potential issues before
release.

## 🎯 Testing Objectives

- **Functionality**: Verify all commands execute without errors
- **Integration**: Test external API and system integrations
- **Performance**: Validate command execution speed and resource usage
- **User Experience**: Ensure intuitive command structure and helpful error
  messages
- **Edge Cases**: Test error handling and invalid inputs

---

## 🏗️ 1. Core CLI Functionality

### 1.1 Basic Commands (Priority: Critical)

#### Global Commands

```bash
# Test version command
forge version
# Expected: Show "Bedrock Forge CLI v0.1.0" and Python version

# Test help command
forge --help
# Expected: Display all available command groups

# Test verbose output
forge --verbose --help
# Expected: Display help with verbose logging enabled

# Test dry-run mode
forge --dry-run info --help
# Expected: Display help with dry-run notice
```

#### Installation Health Check

```bash
# Run comprehensive health check
forge config doctor
# Expected: Detailed installation status report
# Check for:
# ✅ Installation directory exists
# ✅ Virtual environment is valid
# ✅ Global command is available
# ✅ Python and pip are working
# ✅ Git is installed
# ⚠️ DDEV status (optional)
```

### 1.2 Configuration Management (Priority: Critical)

#### Configuration Setup

```bash
# Interactive configuration setup
forge config setup --interactive
# Expected: Step-by-step configuration prompts
# Should ask for:
# - Hetzner API token
# - Cloudflare API token
# - Default SSH key path
# - Default SSH user

# Manual configuration
forge config setup --hetzner-token="test_token" --cloudflare-token="test_token"
# Expected: Success confirmation for each configured token

# Show configuration
forge config show
# Expected: Display current configuration with masked credentials
```

#### Configuration Operations

```bash
# List providers
forge config list-providers
# Expected: Show available providers and their capabilities

# Set individual credentials
forge config set-credential hetzner_token "test_value"
# Expected: Success confirmation

# Get credentials (masked)
forge config get-credential hetzner_token
# Expected: Display masked value (****)

# Export configuration
forge config export --output config.json
# Expected: Export configuration to JSON file

# Import configuration
forge config import config.json
# Expected: Import and merge configuration

# Reset configuration
forge config reset
# Expected: Confirmation prompt and complete reset
```

---

## 🏠 2. Local Development Management

### 2.1 DDEV Integration (Priority: High)

#### Local Project Management

```bash
# Initialize local project
forge local init --name "test-project"
# Expected: Create DDEV configuration

# Start local environment
forge local start
# Expected: Start DDEV containers

# Check local status
forge local status
# Expected: Show container status and URLs

# Stop local environment
forge local stop
# Expected: Stop DDEV containers

# Destroy local environment
forge local destroy
# Expected: Remove containers and configuration
```

#### Local Development Features

```bash
# Install WordPress
forge local install-wordpress --version="6.4"
# Expected: Install specified WordPress version

# Local sync operations
forge local sync --from="production" --to="local"
# Expected: Sync data from production to local

# Local performance testing
forge local performance-test
# Expected: Run performance tests against local site
```

---

## 🚀 3. Infrastructure & Deployment

### 3.1 Server Provisioning (Priority: High)

#### Hetzner Integration

```bash
# List available servers
forge provision list-servers --provider hetzner
# Expected: Display available server types and pricing

# Create server
forge provision create-server \
  --name "test-server" \
  --provider hetzner \
  --type "cpx11" \
  --region "nbg1"
# Expected: Create server and return credentials

# List created servers
forge provision list-servers
# Expected: Show all provisioned servers

# Delete server
forge provision delete-server --name "test-server"
# Expected: Remove server and confirm deletion
```

#### SSH Configuration

```bash
# Test SSH connectivity
forge provision test-ssh --server "test-server"
# Expected: Successful SSH connection test

# Setup SSH keys
forge provision setup-ssh --server "test-server"
# Expected: Configure SSH key authentication
```

### 3.2 Deployment Automation (Priority: High)

#### Basic Deployment

```bash
# Deploy to staging
forge deploy --env staging --dry-run
# Expected: Show deployment plan without executing

# Execute deployment
forge deploy --env staging
# Expected: Deploy code to staging environment

# Deploy with specific branch
forge deploy --env production --branch "main"
# Expected: Deploy specific branch to production
```

#### Rollback Operations

```bash
# List deployment history
forge deploy --history
# Expected: Show recent deployments

# Rollback to previous version
forge deploy rollback --env production --version "previous"
# Expected: Rollback to specified version
```

---

## ⚡ 4. Performance & Optimization

### 4.1 Performance Testing (Priority: Medium)

#### Lighthouse Integration

```bash
# Run performance audit
forge performance audit --url "https://example.com"
# Expected: Comprehensive Lighthouse audit results

# Compare performance
forge performance compare --before="v1.0" --after="v1.1"
# Expected: Performance comparison report

# Continuous monitoring
forge performance monitor --duration="1h"
# Expected: Real-time performance monitoring for specified duration
```

#### Database Optimization

```bash
# Analyze database
forge database analyze
# Expected: Database size and optimization recommendations

# Optimize database
forge database optimize
# Expected: Execute database optimization operations

# Database backup
forge database backup --compress
# Expected: Create compressed database backup
```

### 4.2 Caching Strategies (Priority: Medium)

#### Cache Management

```bash
# Clear all caches
forge cache clear --all
# Expected: Clear application and object caches

# Clear specific cache type
forge cache clear --type "object"
# Expected: Clear only object cache

# Cache statistics
forge cache stats
# Expected: Display cache hit rates and sizes
```

### 4.3 CDN Integration (Priority: Medium)

#### Cloudflare Integration

```bash
# Setup CDN
forge cdn setup --provider cloudflare --domain "example.com"
# Expected: Configure Cloudflare CDN

# Purge CDN cache
forge cdn purge --all
# Expected: Clear all CDN cache

# CDN analytics
forge cdn analytics --period="7d"
# Expected: Display CDN usage statistics
```

### 4.4 Image Optimization (Priority: Low)

#### Image Processing

```bash
# Optimize images
forge image optimize --directory "/var/www/html/wp-content/uploads"
# Expected: Compress and optimize images

# Generate webp versions
forge image convert --to="webp" --directory "/path/to/images"
# Expected: Create WebP versions of images

# Image analysis
forge image analyze --directory "/path/to/images"
# Expected: Report image sizes and optimization potential
```

---

## 📊 5. Monitoring & Analytics

### 5.1 Real-time Monitoring (Priority: Medium)

#### System Monitoring

```bash
# Start monitoring
forge monitoring start --services "web,db,cache"
# Expected: Begin monitoring specified services

# Monitor status
forge monitoring status
# Expected: Show current monitoring status and alerts

# Generate monitoring report
forge monitoring report --period="24h"
# Expected: Comprehensive monitoring report
```

#### Alert Configuration

```bash
# Setup alerts
forge monitoring setup-alerts --email "admin@example.com"
# Expected: Configure email alerts

# Test alerts
forge monitoring test-alerts
# Expected: Send test alert notifications
```

### 5.2 Analytics Integration (Priority: Low)

#### Google Analytics

```bash
# Connect Google Analytics
forge analytics connect --provider google --property-id "123456789"
# Expected: Authenticate and connect to GA property

# Generate traffic report
forge analytics traffic --period="30d"
# Expected: Traffic analysis report

# Conversion tracking
forge analytics conversions --period="30d"
# Expected: Conversion analysis and funnel reports
```

#### WordPress Stats

```bash
# WordPress analytics
forge analytics wordpress --period="7d"
# Expected: Built-in WordPress statistics report
```

### 5.3 SEO Monitoring (Priority: Low)

#### SEO Analysis (Experimental)

> Note: SEO CLI uses simulated data unless Google Search Console is configured.

```bash
# SEO performance analysis
forge seo analyze --project "mysite" --days 30
# Expected: SEO metrics output (simulated if no GSC)

# Keyword list and rankings
forge seo keywords --project "mysite" --days 30 --limit 20
# Expected: Keyword table (simulated if no GSC)

# Track a specific keyword
forge seo track --project "mysite" "bedrock wordpress"
# Expected: Tracking summary (simulated if no GSC)

# Competitor analysis
forge seo competitors --project "mysite" --days 30
# Expected: Competitor summary (simulated if no GSC)

# Backlink profile
forge seo backlinks --project "mysite" --days 30
# Expected: Backlink summary (simulated if no GSC)
```

---

## 🔧 6. Data Management

### 6.1 Database Operations (Priority: Medium)

#### Database Backup & Restore

```bash
# Create backup
forge database backup --compress --encrypt
# Expected: Create encrypted compressed backup

# List backups
forge database list-backups
# Expected: Show available backups

# Restore backup
forge database restore --backup "backup_2024_01_15.sql.gz"
# Expected: Restore database from backup
```

#### Database Migration

```bash
# Migration check
forge database migration-check
# Expected: Check for pending migrations

# Run migrations
forge database migrate
# Expected: Execute pending migrations
```

### 6.2 Sync Operations (Priority: High)

#### Data Synchronization

```bash
# Sync files to staging
forge sync files --from local --to staging
# Expected: Sync files between environments

# Database sync
forge sync database --from production --to staging --sample
# Expected: Sync sample data from production to staging

# Full sync
forge sync full --from production --to staging
# Expected: Complete environment sync
```

#### Backup Operations

```bash
# Create backup
forge sync backup --env production --full
# Expected: Create full backup of production

# Restore backup
forge sync restore --backup "backup_2024_01_15.tar.gz"
# Expected: Restore from backup
```

---

## 🔗 7. System Integration

### 7.1 CI/CD Integration (Priority: Medium)

#### GitHub Actions

```bash
# Setup CI/CD
forge ci setup --platform github
# Expected: Configure GitHub Actions workflow

# Test CI pipeline
forge ci test --branch "feature/test"
# Expected: Run CI pipeline test
```

#### API Server

```bash
# Start API server
forge api start --port 8080
# Expected: Start REST API server

# API status
forge api status
# Expected: Show API server status

# Stop API server
forge api stop
# Expected: Stop API server
```

### 7.2 Plugin Management (Priority: Low)

#### Plugin Operations

```bash
# List plugins
forge plugins list
# Expected: Show available plugins

# Install plugin
forge plugins install --name "performance-monitor"
# Expected: Install specified plugin

# Update plugins
forge plugins update --all
# Expected: Update all installed plugins
```

### 7.3 Workflow Automation (Priority: Medium)

#### Workflow Management

```bash
# List workflows
forge workflow list
# Expected: Show available workflows

# Run workflow
forge workflow run --name "deploy-and-test"
# Expected: Execute specified workflow

# Create custom workflow
forge workflow create --name "custom" --steps "backup,deploy,test"
# Expected: Create custom workflow
```

---

## 🧪 8. Error Handling & Edge Cases

### 8.1 Input Validation (Priority: High)

#### Invalid Commands

```bash
# Test invalid command
forge invalid-command
# Expected: Helpful error message with command suggestions

# Test invalid options
forge deploy --invalid-option
# Expected: Clear error message about invalid option

# Test missing required arguments
forge provision create-server
# Expected: Prompt for required arguments or show usage
```

#### Network Issues

```bash
# Test without internet connection
# Disconnect network and run:
forge provision list-servers
# Expected: Graceful handling of network errors

# Test invalid credentials
forge config setup --hetzner-token="invalid"
# Expected: Clear authentication error message
```

### 8.2 Permission Issues (Priority: High)

#### File Permissions

```bash
# Test with insufficient permissions
# Create read-only directory and run:
forge local init
# Expected: Clear permission error message

# Test SSH key permissions
# Create incorrectly permissioned SSH key and run:
forge provision test-ssh
# Expected: SSH permission error with fix suggestion
```

---

## 📋 9. Testing Environment Setup

### 9.1 Prerequisites Checklist

#### System Requirements

- [ ] Python 3.9+ installed
- [ ] pip package manager available
- [ ] Git installed and configured
- [ ] Docker installed (for local development)
- [ ] DDEV installed (for local WordPress)
- [ ] SSH keys generated and configured
- [ ] Internet connectivity for external APIs

#### API Credentials

- [ ] Hetzner API token (for server provisioning)
- [ ] Cloudflare API token (for CDN management)
- [ ] Google Analytics credentials (for analytics)
- [ ] Test WordPress site with admin access

#### Test Environment

- [ ] Clean development environment
- [ ] Backup of existing configurations
- [ ] Test domains available (optional)
- [ ] Isolated network for testing (optional)

### 9.2 Test Data Preparation

#### WordPress Test Site

```bash
# Create test WordPress installation with:
- Sample content (posts, pages, media)
- Various plugins installed
- Theme configured
- Users with different roles
- Performance testing data
```

#### Server Test Environment

```bash
# Prepare test server with:
- SSH key authentication
- Basic web server setup
- Database access
- SSL certificate
- Monitoring tools
```

---

## 🔍 10. Troubleshooting Guide

### 10.1 Common Issues

#### Installation Problems

```bash
# CLI not found in PATH
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# Permission denied
chmod +x ~/.local/bin/forge

# Virtual environment issues
python -m venv ~/.bedrock-forge/venv
source ~/.bedrock-forge/venv/bin/activate
pip install -e .
```

#### Configuration Issues

```bash
# Reset corrupted configuration
forge config reset

# Verify API credentials
forge config show --provider hetzner

# Test connectivity
forge provision test-ssh --server test-server
```

#### Deployment Issues

```bash
# Check deployment logs
forge deploy --env staging --verbose

# Verify server access
forge provision test-ssh --server target-server

# Check git status
git status
git log --oneline -5
```

### 10.2 Debug Mode

#### Enable Debug Logging

```bash
# Run with verbose output
forge --verbose command-name

# Enable debug logging
export FORGE_LOG_LEVEL=DEBUG
forge command-name

# Check log files
tail -f ~/.bedrock-forge/logs/forge.log
```

---

## ✅ 11. Test Results Tracking

### 11.1 Testing Log

#### Test Execution Template

```
Date: [Date]
Tester: [Name]
Environment: [Local/Staging/Production]

Core CLI Tests:
- [ ] Version command: PASS/FAIL - [Notes]
- [ ] Help system: PASS/FAIL - [Notes]
- [ ] Configuration: PASS/FAIL - [Notes]

Local Development:
- [ ] DDEV integration: PASS/FAIL - [Notes]
- [ ] WordPress install: PASS/FAIL - [Notes]

Deployment:
- [ ] Server provisioning: PASS/FAIL - [Notes]
- [ ] Deployment execution: PASS/FAIL - [Notes]

Performance:
- [ ] Lighthouse audit: PASS/FAIL - [Notes]
- [ ] Database optimization: PASS/FAIL - [Notes]

Monitoring:
- [ ] Real-time monitoring: PASS/FAIL - [Notes]
- [ ] Analytics integration: PASS/FAIL - [Notes]

Issues Found:
1. [Issue description]
2. [Issue description]

Recommendations:
1. [Recommendation]
2. [Recommendation]
```

### 11.2 Performance Benchmarks

#### Command Execution Times

```
Expected Performance:
- forge version: < 1 second
- forge config show: < 2 seconds
- forge local status: < 3 seconds
- forge deploy --dry-run: < 5 seconds
- forge performance audit: < 60 seconds
```

---

## 🎯 12. Success Criteria

### 12.1 Release Readiness

#### Must Pass (Critical)

- [ ] All core commands execute without errors
- [ ] Configuration management works correctly
- [ ] Help system is comprehensive and accessible
- [ ] Error messages are clear and helpful
- [ ] Installation and setup work smoothly

#### Should Pass (High Priority)

- [ ] Local development integration works
- [ ] Basic deployment functionality works
- [ ] Configuration import/export works
- [ ] Monitoring and logging work correctly
- [ ] Performance testing executes successfully

#### Nice to Have (Medium Priority)

- [ ] All external API integrations work
- [ ] Advanced features work correctly
- [ ] Performance benchmarks are met
- [ ] Edge cases are handled gracefully

### 12.2 Quality Gates

#### Functionality Gates

- [ ] 95% of commands execute successfully
- [ ] All critical paths work end-to-end
- [ ] Configuration system is robust
- [ ] Error handling covers common scenarios

#### Performance Gates

- [ ] Commands execute within expected time limits
- [ ] Memory usage stays within acceptable limits
- [ ] Resource cleanup works correctly
- [ ] Concurrent operations don't interfere

#### Usability Gates

- [ ] Commands are discoverable and intuitive
- [ ] Help documentation is comprehensive
- [ ] Error messages guide users to solutions
- [ ] Workflow follows logical patterns

---

## 📞 13. Support Resources

### 13.1 Documentation

- [ ] User Guide: `docs/USER_GUIDE.md`
- [ ] API Reference: `docs/API_REFERENCE.md`
- [ ] Troubleshooting: `docs/TROUBLESHOOTING.md`
- [ ] Frequently Asked Questions: `docs/FAQ.md`

### 13.2 Community Support

- [ ] GitHub Issues: [Repository Issues Link]
- [ ] Discord Community: [Discord Link]
- [ ] Documentation Site: [Documentation URL]

### 13.3 Escalation Process

1. Check troubleshooting guide
2. Search existing GitHub issues
3. Create new issue with detailed information
4. Contact maintainers directly for critical issues

---

## 📝 14. Notes & Observations

### 14.1 Testing Environment Notes

- Record specific environment setup details
- Note any special configurations required
- Document any workarounds used

### 14.2 Known Limitations

- List any features not fully tested
- Document any known issues
- Note any platform-specific limitations

### 14.3 Improvement Suggestions

- Record ideas for CLI improvements
- Note areas where user experience could be enhanced
- Suggest additional testing scenarios

---

**Last Updated**: [Date] **Next Review**: [Date] **Maintainer**: [Name]

_This checklist should be updated regularly as new features are added and
existing ones are modified._

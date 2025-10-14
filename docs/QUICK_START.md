# Quick Start Guide

Get started with Bedrock Forge in 5 minutes. This guide will walk you through installation, setup, and your first Bedrock WordPress project.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Initial Setup](#initial-setup)
- [Create Your First Project](#create-your-first-project)
- [Local Development](#local-development)
- [Deploy to Production](#deploy-to-production)
- [Next Steps](#next-steps)

## 🚀 Prerequisites

### Required Software

1. **Python 3.9+**
   ```bash
   # Check your Python version
   python3 --version
   ```

2. **Git**
   ```bash
   # Check if Git is installed
   git --version
   ```

3. **DDEV** (for local development)
   ```bash
   # Install DDEV (macOS/Linux)
   curl -L https://ddev.com/install.sh | bash

   # Or via Homebrew
   brew install ddev
   ```

### Optional (but Recommended)

- **Docker** - Required by DDEV
- **Node.js 16+** - For frontend build tools
- **SSH Client** - For server operations

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/bedrock-forge.git
cd bedrock-forge
```

### 2. Install Dependencies

```bash
# Install Python dependencies
pip install -r forge/requirements.txt

# Verify installation
python3 -m forge --help
```

### 3. Initial Configuration

```bash
# Create your configuration file
python3 -m forge config init

# Set up your first environment
python3 -m forge config set-environment local
```

## ⚙️ Initial Setup

### Configure Global Settings

```bash
# Set your default editor
python3 -m forge config set editor "code"

# Configure backup location
python3 -m forge config set backup.path "~/backups"

# Set up GitHub token (optional, for repo creation)
python3 -m forge config set github.token "your_github_token"
```

### Verify Setup

```bash
# Check system requirements
python3 -m forge info system

# List available commands
python3 -m forge --help
```

## 🏗️ Create Your First Project

### Step 1: Create a New Bedrock Project

```bash
# Create a new project called "my-awesome-site"
python3 -m forge local create-project my-awesome-site

# With custom template
python3 -m forge local create-project my-awesome-site --template=agency

# With plugin preset for specific use cases
python3 -m forge local create-project myblog --plugin-preset=blog
python3 -m forge local create-project mystore --plugin-preset=ecommerce
python3 -m forge local create-project mybusiness --plugin-preset=business
```

### Step 2: Configure Your Project

```bash
# Navigate to your project
cd my-awesome-site

# View project configuration
python3 -m forge local info

# Edit project settings
python3 -m forge local config edit
```

### Step 3: Initialize Local Development

```bash
# Start DDEV (this will take a few minutes)
ddev start

# Install WordPress and Bedrock
ddev exec composer install
ddev exec wp core install --url=https://my-awesome-site.ddev.site --title="My Awesome Site" --admin_user=admin --admin_password=password --admin_email=admin@example.com

# Access your site
open https://my-awesome-site.ddev.site
```

**Plugin Preset Examples:**

If you created a project with a plugin preset, your site will come with pre-configured plugins:

```bash
# Blog project example
python3 -m forge local create-project myblog --plugin-preset=blog --admin-user=admin --admin-email=admin@myblog.com

# Expected output
Creating Bedrock project: myblog
Project directory: ~/Work/Wordpress/myblog
Installing blog plugin preset...
✅ Successfully installed: jetpack, wordpress-seo, w3-total-cache, wordfence, akismet, google-site-kit, wp-statistics, duplicate-post

🚀 Project created successfully!
🌐 Local URL: https://myblog.ddev.site
👤 Admin URL: https://myblog.ddev.site/wp/wp-admin
```

**Available Plugin Presets:**
- **blog** - Content sites with SEO and engagement plugins
- **business** - Professional sites with forms and marketing
- **ecommerce** - Online stores with WooCommerce and payments
- **portfolio** - Creative sites with galleries and media
- **minimal** - Basic setup for custom development
- **performance** - Maximum speed optimization

## 🛠️ Local Development

### Common Development Tasks

```bash
# List all your projects
python3 -m forge local list

# Switch to a different project
python3 -m forge local switch another-project

# Start development
ddev start

# View logs
ddev logs -f

# Stop development
ddev stop
```

### Useful DDEV Commands

```bash
# Access WordPress CLI
ddev wp plugin list
ddev wp theme activate my-theme

# Access database
ddev mysql

# Access shell
ddev ssh

# Composer operations
ddev composer require some/package
```

### Plugin Management

```bash
# Check installed plugins
ddev wp plugin list --status=active

# Install additional plugins
ddev wp plugin install elementor --activate

# Update plugins
ddev wp plugin update --all

# Manage plugin presets
python3 -m forge plugins status --project=myblog
python3 -m forge plugins install-preset business --project=mybusiness
```

## 🚀 Deploy to Production

### Step 1: Provision a Server

```bash
# Create a Hetzner server (example)
python3 -m forge provision hetzner-create my-server --plan=cpx11 --location=hel1

# Setup CyberPanel for WordPress hosting
python3 -m forge provision cyberpanel-provision my-server --domain=my-awesome-site.com

# Configure SSL certificate
python3 -m forge provision ssl-setup my-server --domain=my-awesome-site.com
```

### Step 2: Deploy Your Project

```bash
# Add production environment to your project
python3 -m forge local config add-environment production

# Deploy to production
python3 -m forge deploy my-awesome-site production

# Monitor deployment status
python3 -m forge deploy status my-awesome-site
```

### Step 3: Setup Backups

```bash
# Configure Google Drive for backups
python3 -m forge sync configure-remote gdrive --type=drive

# Create your first backup
python3 -m forge sync backup my-awesome-site production

# Schedule automatic backups
python3 -m forge sync schedule my-awesome-site production --frequency=daily
```

## 📊 Monitor Your Site

```bash
# Add site monitoring
python3 -m forge monitor add my-awesome-site https://my-awesome-site.com

# Check site health
python3 -m forge monitor health my-awesome-site

# View monitoring status
python3 -m forge monitor list-sites
```

## 🔄 Common Workflows

### Database Synchronization

```bash
# Pull production database to local
python3 -m forge sync db my-awesome-site pull production

# Push local database to production
python3 -m forge sync db my-awesome-site push production

# Sync files (uploads, plugins)
python3 -m forge sync files my-awesome-site pull production
```

### Team Collaboration

```bash
# Share project configuration
python3 -m forge config export > team-config.json

# Import team configuration
python3 -m forge config import team-config.json

# Set up team member access
python3 -m forge provision add-user my-server --email=team@example.com --role=developer
```

## 🎯 Next Steps

### Explore More Features

1. **[Plugin System Guide](PLUGIN_SYSTEM.md)** - Complete plugin management
2. **[Configuration Guide](CONFIGURATION.md)** - Advanced configuration options
3. **[Command Reference](COMMANDS.md)** - Complete command documentation
4. **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Advanced deployment strategies
5. **[Backup Guide](BACKUP_GUIDE.md)** - Complete backup and restore procedures
6. **[Workflow Tutorials](workflows/)** - Step-by-step site creation guides

### Common Next Steps

```bash
# Set up CI/CD pipeline
python3 -m forge ci setup my-awesome-site --provider=github

# Configure advanced monitoring
python3 -m forge monitor setup-alerts my-awesome-site --email=admin@example.com

# Explore workflows
python3 -m forge workflow list
python3 -m forge workflow run full-project my-awesome-site production

# Try different project types
python3 -m forge local create-project portfolio-site --plugin-preset=portfolio
python3 -m forge local create-project speed-demo --plugin-preset=performance
```

### Complete Site Tutorials

Ready to build specific types of websites? Check out our comprehensive tutorials:

- **[Blog Site Tutorial](workflows/BLOG_SITE_TUTORIAL.md)** - Create a professional blog
- **[E-commerce Site Tutorial](workflows/ECOMMERCE_SITE_TUTORIAL.md)** - Build an online store
- **[Business Site Tutorial](workflows/BUSINESS_SITE_TUTORIAL.md)** - Launch a business website

Each tutorial includes:
- Step-by-step instructions
- Real command examples with expected outputs
- Best practices and optimization tips
- Complete setup from development to production

### Join the Community

- 📖 **Documentation**: [Complete docs](IMPLEMENTATION_STATUS.md)
- 🐛 **Issues**: [GitHub Issues](https://github.com/your-org/bedrock-forge/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-org/bedrock-forge/discussions)
- 🎮 **Discord**: [Join our Discord](https://discord.gg/bedrock-forge)

## ❓ Need Help?

### Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| `ddev start` fails | Check Docker is running: `docker --version` |
| Composer timeouts | Increase timeout: `export COMPOSER_PROCESS_TIMEOUT=600` |
| Permission denied | Check file permissions: `chmod +x forge/scripts/*` |
| Module not found | Reinstall dependencies: `pip install -r forge/requirements.txt` |

### Get Support

- 📚 **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common issues and solutions
- 💬 **Community Support** - Ask in GitHub Discussions
- 🎯 **Professional Support** - [Enterprise Support](https://bedrock-forge.com/enterprise)

---

## 🎉 Congratulations!

You've successfully:
- ✅ Installed Bedrock Forge
- ✅ Created your first Bedrock project
- ✅ Set up local development with DDEV
- ✅ Deployed to production
- ✅ Configured backups and monitoring

**You're ready to streamline your WordPress workflow!** 🚀

For more advanced topics, check out our [complete documentation](IMPLEMENTATION_STATUS.md).
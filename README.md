<div align="center">
  <h1>Bedrock Forge 🚀</h1>
  <p>A unified Python CLI for orchestrating Bedrock-based WordPress workflows</p>
  <img src="https://img.icons8.com/fluency/96/000000/server.png" alt="Bedrock Forge logo"/>
</div>

<div align="center">

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/your-org/bedrock-forge/actions)
[![Coverage](https://img.shields.io/badge/coverage-80%25+-brightgreen.svg)](https://github.com/your-org/bedrock-forge/actions)

</div>

## 📋 Table of Contents

- [Status](#-current-status)
- [Quick Start](#-quick-start)
- [Features](#-key-features)
- [Commands](#-command-examples)
- [Documentation](#-documentation)
- [Project Structure](#-project-structure)
- [Roadmap](#-whats-next)
- [Contributing](#-contributing)
- [Help](#-getting-help)

---

## ✅ Current Status

**Core Implementation: Active Development**

> 🚧 **In Progress**: Core workflows are implemented, with ongoing polish and
> documentation alignment

| Feature                    | Status      | Description                                           |
| -------------------------- | ----------- | ----------------------------------------------------- |
| 🏠 **Local Development**   | ✅ Complete | DDEV project creation and management                  |
| 🖥️ **Server Provisioning** | ✅ Complete | Hetzner, CyberPanel, LibyanSpider integration         |
| 📦 **Deployment**          | ✅ Complete | Atomic deployments with rollback capabilities         |
| 💾 **Backup & Sync**       | ✅ Complete | Automated backups to Google Drive, rclone integration |
| 🔄 **CI/CD Integration**   | ✅ Complete | Jenkins, GitHub Actions support                       |
| 📊 **Monitoring**          | ✅ Complete | Uptime monitoring, incidents, and alerting            |
| 🧪 **Testing Suite**       | ✅ Complete | Comprehensive unit and integration tests              |
| 👥 **Client Management**   | ✅ Complete | Clients, invoices, billing, subscriptions             |
| 🧭 **Client Portal**       | ✅ Complete | Portal auth, tickets, subscriptions, invoice views    |
| 📣 **Public Status Page**  | ✅ Complete | Public `/status` page with incidents                  |
| 🌐 **Domain Tracking**     | ✅ Complete | Registrar, expiry dates, renewal alerts               |
| 🔒 **SSL Management**      | ✅ Complete | Certificate monitoring and expiry alerts              |
| 🖥️ **CyberPanel**          | ✅ Complete | Website, database, and SSL management                 |

---

## 🧰 Tech Stack

**Backend**

- NestJS
- Prisma
- PostgreSQL
- Redis

**Dashboard**

- React + TypeScript
- Vite
- Tailwind CSS

**Infrastructure**

- Docker + Docker Compose

---

## 🚀 Quick Start

### Installation

#### 🎯 Super Easy Installation (Recommended)

```bash
# One-command installation
curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash

# Start using immediately
forge --help
```

#### 📦 Alternative Installation Methods

**Method 1: Direct pip install from GitHub**

```bash
pip install git+https://github.com/bedrock-forge/bedrock-forge.git
```

**Method 2: Clone and install manually**

```bash
# Clone the repository
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge

# Create virtual environment and install
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .

# Create global command (optional)
ln -sf $(pwd)/.venv/bin/forge ~/.local/bin/forge

# Verify installation
forge --help
```

> 💡 **Tip**: After installation, you can use either `forge` or
> `python -m forge` to run commands.

### 🔧 Installation Management

```bash
# Check installation health
forge config doctor

# Update to latest version
forge update

# Uninstall completely
forge uninstall
```

### 5-Minute Setup with Plugins

```bash
# 1. Create a new blog project with optimized plugins
forge local create-project myblog --plugin-preset=blog

# 2. Create an e-commerce store
forge local create-project mystore --plugin-preset=ecommerce

# 3. Create a business website
forge local create-project mybusiness --plugin-preset=business

# 4. Start local development
cd myproject
ddev start

# 5. Check installed plugins
forge plugins status --project myproject

# 6. Provision a server (optional)
forge provision hetzner-create myserver

# 7. Deploy to production
forge deploy myproject production

# 8. Backup your project
forge sync backup myproject production
```

**Plugin Presets Available:**

- **blog** - Blog/content sites with SEO and engagement plugins
- **business** - Professional business websites with forms and marketing
- **ecommerce** - Complete e-commerce stores with WooCommerce and payments
- **portfolio** - Creative sites with galleries and media optimization
- **minimal** - Basic setup for development or custom builds
- **performance** - Maximum speed optimization

---

## 🐳 Docker Quick Start

Run the full stack (API, Dashboard, Database, Redis) with Docker in under 5
minutes.

### Development Setup

```bash
# Clone and start
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge
cp .env.local.example .env
docker compose up -d

# Run Prisma schema sync + seed
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:seed"

# Access the application
# Dashboard: http://localhost:3000
# API: http://localhost:8000
# Health: http://localhost:8000/api/v1/health
```

### Production Setup

```bash
cp .env.production.example .env
# Edit .env with your real values before launch
docker compose build && docker compose up -d

# Run Prisma schema sync + seed
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:seed"
```

```bash
./reset-seed.sh
```

```bash
# Local smoke test for deploy + seed + health
./scripts/local-docker-smoke.sh
```

```bash
# Server tarball update (preserves DB/Redis volumes)
./server-deploy --mode update

# Optional seed during update
./server-deploy --mode update --seed

# Full reset (wipes volumes, migrates, and re-seeds)
./server-deploy --mode reset

# End-to-end wrapper: creates local tar archive, uploads via SSH, runs remote deploy,
# streams output locally, and writes local logs under logs/deploy/
./forge-deploy update
./forge-deploy update --seed
./forge-deploy reset

# Optional SSH overrides
./forge-deploy reset --host 49.13.65.81 --user root --port 22
```

> 📖 **Full Docker documentation**:
> [Docker Quick Start Guide](docs/DOCKER_QUICKSTART.md)

---

## 🎯 Key Features

### 🏠 **Local Development**

- Create and manage Bedrock projects with DDEV
- Automatic WordPress and Bedrock setup
- Integrated development environment
- Project switching and management

### 🖥️ **Server Provisioning**

- **Hetzner Cloud**: Automated server creation and setup
- **CyberPanel**: One-click WordPress hosting setup
- **LibyanSpider**: cPanel-based hosting automation
- **SSL Certificates**: Automatic Let's Encrypt integration
- **DNS Management**: Cloudflare integration

### 📦 **Deployment**

- **Atomic Deployments**: Zero-downtime deployments
- **Version Management**: Track and rollback deployments
- **Multiple Methods**: SSH, SFTP, FTP, rsync support
- **Health Checks**: Post-deployment verification
- **Rollback Safety**: Automatic rollback on failure

### 💾 **Backup & Sync**

- **Google Drive Integration**: Automated cloud backups
- **Scheduled Backups**: Celery-based task scheduling
- **Database Sync**: Pull/push database changes
- **File Sync**: Uploads and media synchronization
- **Point-in-Time Recovery**: Restore any backup version

### 🔄 **CI/CD Integration**

- **Jenkins**: Pipeline automation
- **GitHub Actions**: Workflow integration
- **Webhook Support**: Automated deployments
- **Build Monitoring**: Track deployment status

### 📊 **Monitoring**

- **Uptime Monitoring**: Site health checks
- **Log Management**: Centralized logging
- **Performance Metrics**: Track site performance
- **Alert System**: Get notified on issues

### 👥 **Client & Billing**

- **Client Management**: Full CRM with contact and billing info
- **Invoice System**: Create, send, and track invoices
- **Subscriptions**: Recurring billing (monthly to triennial)
- **Domain Tracking**: Registrar, expiry dates, renewal alerts
- **SSL Monitoring**: Certificate expiry and auto-renewal status
- **Hosting Packages**: Tiered pricing with resource limits

### 🖥️ **CyberPanel Management**

- **Website CRUD**: Create, configure, and delete websites
- **PHP Management**: Change PHP versions per site
- **SSL Issuance**: One-click Let's Encrypt certificates
- **Database Operations**: Create and manage MySQL databases
- **Server Stats**: CPU, RAM, disk usage monitoring

---

## 🛠️ Command Examples

### Local Development

```bash
# Create new project
forge local create-project mysite

# List projects
forge local list-projects

# Switch to project
forge local switch mysite
```

### Server Provisioning

```bash
# Create Hetzner server
forge provision hetzner-create myserver

# Setup CyberPanel
forge provision cyberpanel myserver

# Configure SSL
forge provision ssl-cert myserver example.com
```

### Deployment

```bash
# Deploy to production
forge deploy mysite production

# Deploy with rollback
forge deploy mysite staging --rollback

# Check deployment status
forge deploy status mysite
```

### Backup & Sync

```bash
# Backup project
forge sync backup mysite production

# Restore backup
forge sync restore mysite production --version=2024-01-15

# Sync database
forge sync db mysite production --pull
```

### Monitoring

```bash
# List monitored sites
forge monitor list-monitors

# Add site monitoring
forge monitor add mysite https://mysite.com

# Check site health
forge monitor health mysite
```

---

## 📚 Documentation

### User Guides

- **[Quick Start Guide](docs/QUICK_START.md)** - Get started in 5 minutes
- **[Docker Quick Start](docs/DOCKER_QUICKSTART.md)** - Local and production
  Docker setup
- **[Configuration Guide](docs/CONFIGURATION.md)** - Setup and configuration
- **[Command Reference](docs/COMMANDS.md)** - Complete command documentation
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

### Technical Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - System architecture and
  design
- **[Service Boundaries](docs/SERVICE_BOUNDARIES.md)** - API/runtime boundaries
  and migration context
- **[Testing Suite](docs/TESTING.md)** - Running and writing tests
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing guidelines

---

## 🏗️ Project Structure

```
bedrock-forge/
├── forge/                    # Main CLI source code
│   ├── main.py              # CLI entrypoint
│   ├── commands/            # Subcommands (local, deploy, etc.)
│   ├── utils/               # Shared utilities
│   ├── provision/           # Server provisioning modules
│   ├── tests/               # Test suite
│   └── workflows/           # Workflow definitions
├── docs/                    # Documentation
│   ├── QUICK_START.md       # Quick start guide
│   ├── DOCKER_QUICKSTART.md # Docker setup guide
│   ├── COMMANDS.md          # Command reference
│   ├── CONFIGURATION.md     # Configuration guide
│   └── ARCHITECTURE.md      # Technical docs
└── README.md               # This file
```

---

## 🚀 What's Next

### Currently in Development 🔄

- [ ] Enhanced monitoring dashboard
- [ ] GUI interface for backup/restore
- [ ] Additional hosting providers (DigitalOcean, Vultr)
- [ ] Advanced deployment strategies (blue-green, canary)

### Planned Features 📋

- [ ] Multi-site management
- [ ] Performance optimization tools
- [ ] Security scanning integration
- [ ] Mobile companion app
- [ ] WordPress plugin manager

### Long-term Vision 🔮

- [ ] Visual workflow builder
- [ ] Team collaboration features
- [ ] Enterprise SSO integration
- [ ] Advanced analytics dashboard

---

## 🤝 Contributing

We welcome contributions! Please see our
[Development Guide](docs/DEVELOPMENT.md) for details.

### Quick Contribution Steps

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Contribution Areas

- 🐛 **Bug Reports**: Found an issue? Please report it
- 💡 **Feature Requests**: Have an idea? We'd love to hear it
- 📝 **Documentation**: Help improve our docs
- 🧪 **Testing**: Write tests for new features
- 🌍 **Translations**: Help translate the CLI

---

## 📋 Requirements

### System Requirements

- **Python 3.9+** - Modern Python with type hints
- **Git** - For version control
- **SSH Client** - For server operations

### Optional Dependencies

- **DDEV** - For local WordPress development
- **Docker** - For containerized environments
- **Node.js** - For frontend build tools
- **Cloud Accounts** - Hetzner, Cloudflare, Google Drive

---

## 🆘 Getting Help

### Documentation

- **[Quick Start](docs/QUICK_START.md)** - New to Bedrock Forge?
- **[Command Reference](docs/COMMANDS.md)** - Need command help?
- **[Configuration](docs/CONFIGURATION.md)** - Setup questions?
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Having issues?

### Community

- **[GitHub Issues](https://github.com/your-org/bedrock-forge/issues)** - Bug
  reports and feature requests
- **[GitHub Discussions](https://github.com/your-org/bedrock-forge/discussions)** -
  General questions and discussions
- **[Discord Community](https://discord.gg/bedrock-forge)** - Real-time chat
  (coming soon)

### Professional Support

- **[Enterprise Support](https://bedrock-forge.com/enterprise)** - 24/7 support
  for teams
- **[Consulting](https://bedrock-forge.com/consulting)** - Expert WordPress
  deployment help
- **[Training](https://bedrock-forge.com/training)** - Team training and
  workshops

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

---

<div align="center">
  <p><strong>Ready to streamline your WordPress workflow?</strong></p>
  <p><a href="#-quick-start">🚀 Get started now!</a> | <a href="docs/QUICK_START.md">📖 Read the docs</a> | <a href="https://github.com/your-org/bedrock-forge/issues">🐛 Report an issue</a></p>
  <br>
</div>

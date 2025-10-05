# Dependencies Reference

This guide provides a comprehensive list of all dependencies used by Bedrock Forge, including Python packages, system dependencies, and optional components.

## Overview

Bedrock Forge manages its dependencies through Python's package management system, with clear separation between core dependencies, optional components, and development requirements.

## Core Dependencies

### Python Requirements (`requirements.txt`)

```txt
# Core Framework
click>=8.1.0                 # CLI framework
pyyaml>=6.0                  # YAML configuration parsing
pydantic>=2.0.0              # Data validation and settings
jinja2>=3.1.0                # Template engine
rich>=13.0.0                 # Rich text and beautiful formatting
typer>=0.9.0                 # Modern CLI framework

# HTTP and API
requests>=2.31.0             # HTTP library
httpx>=0.24.0                # Async HTTP client
aiohttp>=3.8.0               # Async HTTP framework
urllib3>=2.0.0               # URL handling

# Database
pymysql>=1.0.2               # MySQL connector
psycopg2-binary>=2.9.0       # PostgreSQL connector
sqlalchemy>=2.0.0            # SQL toolkit and ORM
alembic>=1.11.0              # Database migrations

# SSH and Remote Operations
paramiko>=3.2.0              # SSH library
fabric>=3.2.0                # Remote execution
invoke>=2.2.0                # Task execution

# Cloud Providers
hcloud>=1.24.0               # Hetzner Cloud API
boto3>=1.28.0                # AWS SDK (for S3 backups)
google-cloud-storage>=2.10.0 # Google Cloud Storage
digitalocean>=1.35.0         # DigitalOcean API

# File Operations
pathlib2>=2.3.7              # Path operations (Python < 3.4 compatibility)
watchdog>=3.0.0              # File system events

# Security
cryptography>=41.0.0         # Cryptographic functions
passlib>=1.7.4               # Password handling
bcrypt>=4.0.0                # Password hashing

# Data Processing
pandas>=2.0.0                # Data analysis
jsonschema>=4.17.0           # JSON schema validation
toml>=0.10.2                 # TOML file parsing

# Logging and Monitoring
structlog>=23.1.0            # Structured logging
prometheus-client>=0.17.0    # Prometheus metrics
psutil>=5.9.0                # System and process utilities

# Utilities
python-dotenv>=1.0.0         # Environment variable management
click-completion>=0.5.2      # CLI completion
 packaging>=23.0             # Package utilities
```

### Development Dependencies (`requirements-dev.txt`)

```txt
# Testing
pytest>=7.4.0                # Testing framework
pytest-asyncio>=0.21.0       # Async testing support
pytest-cov>=4.1.0            # Coverage reporting
pytest-mock>=3.11.0          # Mock objects
pytest-xdist>=3.3.0          # Parallel testing
factory-boy>=3.3.0           # Test factories
faker>=19.0.0                # Fake data generation

# Code Quality
black>=23.7.0                # Code formatting
isort>=5.12.0                # Import sorting
flake8>=6.0.0                # Linting
mypy>=1.5.0                  # Static type checking
bandit>=1.7.5                 # Security linting
pylint>=2.17.0               # Advanced linting

# Documentation
sphinx>=7.1.0                # Documentation generation
sphinx-rtd-theme>=1.3.0      # ReadTheDocs theme
myst-parser>=2.0.0           # Markdown parser for Sphinx

# Development Tools
pre-commit>=3.3.0            # Git hooks
tox>=4.6.0                   # Testing automation
ipython>=8.14.0              # Interactive Python
jupyter>=1.0.0               # Jupyter notebooks

# Profiling and Debugging
memory-profiler>=0.61.0      # Memory profiling
line-profiler>=4.1.0         # Line profiling
py-spy>=0.3.14               # Python profiler
```

## Optional Dependencies

### Provider-specific Dependencies

```txt
# Hetzner Cloud (forge[hetzner])
hcloud>=1.24.0               # Hetzner Cloud API

# CyberPanel (forge[cyberpanel])
xmlrpc>=0.2.0                # XML-RPC client

# LibyanSpider (forge[libyanspider]
requests>=2.31.0             # HTTP library (already in core)

# AWS Integration (forge[aws])
boto3>=1.28.0                # AWS SDK
botocore>=1.31.0             # AWS core library

# Google Cloud (forge[gcp])
google-cloud-storage>=2.10.0 # Google Cloud Storage
google-auth>=2.22.0          # Google Authentication
google-cloud-logging>=3.5.0  # Google Cloud Logging

# Azure (forge[azure])
azure-storage-blob>=12.17.0  # Azure Blob Storage
azure-identity>=1.13.0       # Azure Identity

# DigitalOcean (forge[digitalocean])
digitalocean>=1.35.0         # DigitalOcean API
```

### Monitoring and Observability (forge[monitoring])

```txt
# Metrics and Monitoring
prometheus-client>=0.17.0    # Prometheus metrics
statsd>=3.3.0                # StatsD client
datadog>=0.47.0              # DataDog client

# Logging
structlog>=23.1.0            # Structured logging
sentry-sdk>=1.29.0           # Sentry error tracking
loguru>=0.7.0                # Advanced logging

# Tracing
opentelemetry-api>=1.20.0    # OpenTelemetry API
opentelemetry-sdk>=1.20.0    # OpenTelemetry SDK
```

### Performance Optimization (forge[performance])

```txt
# Async Support
uvicorn>=0.23.0              # ASGI server
fastapi>=0.101.0             # FastAPI framework
asyncio>=3.4.3               # Async utilities

# Caching
redis>=4.6.0                 # Redis client
memcached>=1.1.0             # Memcached client
aiocache>=0.12.0             # Async caching

# Database Optimization
asyncpg>=0.28.0              # Async PostgreSQL
aiomysql>=0.2.0              # Async MySQL
```

### Security Extensions (forge[security])

```txt
# Advanced Security
cryptography>=41.0.0         # Cryptographic functions
passlib>=1.7.4               # Password handling
bcrypt>=4.0.0                # Password hashing
python-jose>=3.3.0           # JWT handling

# Compliance
pydantic-settings>=2.0.0     # Secure settings management
keyring>=24.2.0              # System keyring access
```

## System Dependencies

### Ubuntu/Debian

```bash
# Essential system packages
sudo apt-get update
sudo apt-get install -y \
    python3-dev \
    python3-pip \
    python3-venv \
    build-essential \
    git \
    curl \
    wget \
    unzip \
    jq \
    rsync \
    ssh-client \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Database development headers
sudo apt-get install -y \
    libmysqlclient-dev \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    libyaml-dev

# Node.js (for asset building)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker (optional)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### CentOS/RHEL/Fedora

```bash
# Essential system packages
sudo dnf update -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y \
    python3-devel \
    python3-pip \
    python3-virtualenv \
    git \
    curl \
    wget \
    unzip \
    jq \
    rsync \
    openssh-clients

# Database development headers
sudo dnf install -y \
    mysql-devel \
    postgresql-devel \
    openssl-devel \
    libffi-devel \
    libyaml-devel

# Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Docker (optional)
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### macOS

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install system dependencies
brew install \
    python@3.11 \
    git \
    curl \
    wget \
    jq \
    rsync \
    mysql \
    postgresql \
    openssl \
    libffi \
    libyaml

# Install Node.js
brew install node@18

# Install Docker Desktop (optional)
brew install --cask docker
```

## Development Environment Dependencies

### Docker Development Environment

```dockerfile
# Dockerfile.dev
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    jq \
    rsync \
    openssh-client \
    libmysqlclient-dev \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    libyaml-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Create non-root user
RUN useradd -m -s /bin/bash forge
USER forge
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install --user -r requirements.txt -r requirements-dev.txt

# Set PATH
ENV PATH="/home/forge/.local/bin:$PATH"

# Default command
CMD ["python", "-m", "forge.main"]
```

### Docker Compose Development

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  forge:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - ~/.gitconfig:/home/forge/.gitconfig:ro
    environment:
      - FORGE_ENV=development
      - DB_HOST=mysql
      - DB_PASSWORD=dev_password
    depends_on:
      - mysql
      - redis
    command: tail -f /dev/null

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: forge_dev
      MYSQL_USER: forge_user
      MYSQL_PASSWORD: dev_password
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    volumes:
      - ./tests/fixtures/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "8080:80"
    depends_on:
      - forge

volumes:
  mysql_data:
```

## Version Constraints

### Semantic Versioning Policy

- **Major versions**: Breaking changes
- **Minor versions**: New features, backward compatible
- **Patch versions**: Bug fixes, security updates

### Recommended Version Ranges

```python
# pyproject.toml
[tool.poetry.dependencies]
python = "^3.11"

# Core dependencies with compatible ranges
click = ">=8.1.0,<9.0.0"
pyyaml = ">=6.0.0,<7.0.0"
pydantic = ">=2.0.0,<3.0.0"
requests = ">=2.31.0,<3.0.0"

# Provider APIs often have specific version requirements
hcloud = "~1.24.0"  # API compatibility
boto3 = ">=1.28.0,<2.0.0"

[tool.poetry.group.dev.dependencies]
pytest = ">=7.4.0,<8.0.0"
black = ">=23.7.0,<24.0.0"
mypy = ">=1.5.0,<2.0.0"
```

## Dependency Management

### Poetry Configuration (Preferred)

```toml
# pyproject.toml
[tool.poetry]
name = "bedrock-forge"
version = "1.0.0"
description = "WordPress workflow automation tool"
authors = ["Your Name <your.email@example.com>"]
readme = "README.md"
license = "MIT"
packages = [{include = "forge"}]

[tool.poetry.dependencies]
python = "^3.11"
click = ">=8.1.0,<9.0.0"
# ... other dependencies

[tool.poetry.group.dev.dependencies]
pytest = ">=7.4.0,<8.0.0"
black = ">=23.7.0,<24.0.0"
# ... other dev dependencies

[tool.poetry.extras]
hetzner = ["hcloud"]
cyberpanel = ["xmlrpc"]
aws = ["boto3", "botocore"]
monitoring = ["prometheus-client", "structlog"]
security = ["cryptography", "passlib"]

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### Pip-tools Configuration

```bash
# requirements.in
click>=8.1.0
pyyaml>=6.0.0
pydantic>=2.0.0
requests>=2.31.0
# ... other dependencies

# requirements-dev.in
-r requirements.in
pytest>=7.4.0
black>=23.7.0
mypy>=1.5.0
# ... other dev dependencies

# Generate compiled requirements
pip-compile requirements.in
pip-compile requirements-dev.in
```

## Security Considerations

### Vulnerability Scanning

```bash
# Check for known vulnerabilities
pip-audit

# Bandit security linting
bandit -r forge/

# Safety check
safety check

# Snyk (if configured)
snyk test
```

### Dependency Updates

```bash
# Update all dependencies
poetry update

# Update specific package
poetry update requests

# Check for outdated packages
poetry show --outdated

# Interactive dependency update
pip-upgrade-interactive
```

### Dependency Locking

```bash
# Generate lock file
poetry lock

# Install from lock file
poetry install

# Verify lock file
poetry check

# Export requirements
poetry export -f requirements.txt --output requirements.txt
```

## Performance Impact

### Dependency Size Analysis

```bash
# Analyze package sizes
pipdeptree --packages-only | wc -l

# Check total size
du -sh ~/.local/lib/python3.11/site-packages/

# Find largest packages
pip show --files | grep -E 'Location:|Files:' | \
  paste - - | sort -k2 -nr | head -10
```

### Optimization Strategies

1. **Use optional extras**: Install only what you need
2. **Regular cleanup**: Remove unused dependencies
3. **Lightweight alternatives**: Choose lighter packages when possible
4. **Conditional imports**: Import only when needed

```python
# Example of conditional import
try:
    import boto3  # Heavy AWS dependency
    AWS_AVAILABLE = True
except ImportError:
    AWS_AVAILABLE = False

def upload_to_s3(data):
    if not AWS_AVAILABLE:
        raise ImportError("boto3 is required for S3 uploads")
    # ... upload logic
```

## Troubleshooting Dependencies

### Common Issues

**Import Errors**:
```bash
# Check installed packages
pip list | grep package_name

# Verify package integrity
pip show package_name

# Reinstall problematic package
pip uninstall package_name && pip install package_name
```

**Version Conflicts**:
```bash
# Check dependency tree
pipdeptree

# Find conflicting packages
pip check

# Force reinstall
pip install --force-reinstall package_name
```

**Build Failures**:
```bash
# Install build dependencies
sudo apt-get install build-essential python3-dev

# Use precompiled wheels
pip install --only-binary=:all: package_name

# Clear pip cache
pip cache purge
```

### Environment Isolation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Export environment
pip freeze > requirements.txt
```

This comprehensive dependencies reference ensures proper management of all packages and system requirements for Bedrock Forge.
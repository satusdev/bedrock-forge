# Project Structure Guide

This guide provides a comprehensive overview of the Bedrock Forge project structure and organization.

## Overview

Bedrock Forge follows a well-organized structure that separates concerns, maintains clean architecture, and supports scalable development.

## Root Directory Structure

```
bedrock-forge/
├── README.md                    # Main project README
├── LICENSE                      # MIT License
├── PLAN.markdown               # Implementation plan and status
├── forge.yaml                  # Main configuration file
├── requirements.txt            # Python dependencies
├── pyproject.toml             # Python project configuration
├── setup.py                   # Package setup script
├── .gitignore                 # Git ignore rules
├── .github/                   # GitHub configuration
│   ├── workflows/             # GitHub Actions workflows
│   ├── ISSUE_TEMPLATE/        # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/                      # Documentation
│   ├── QUICK_START.md
│   ├── CONFIGURATION.md
│   ├── COMMANDS.md
│   ├── TROUBLESHOOTING.md
│   ├── ARCHITECTURE.md
│   ├── TESTING.md
│   ├── DEVELOPMENT.md
│   ├── API.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── BACKUP_GUIDE.md
│   ├── PROVIDER_GUIDE.md
│   ├── CI_CD_GUIDE.md
│   ├── ENVIRONMENT_VARIABLES.md
│   ├── PROJECT_STRUCTURE.md
│   ├── DEPENDENCIES.md
│   ├── CHANGELOG.md
│   └── IMPLEMENTATION_STATUS.md
├── forge/                     # Main source code
│   ├── __init__.py
│   ├── main.py               # CLI entry point
│   ├── cli/                  # CLI commands
│   ├── provision/            # Server provisioning
│   ├── deployment/           # Deployment strategies
│   ├── models/               # Data models
│   ├── utils/                # Utility functions
│   ├── workflows/            # Workflow definitions
│   ├── templates/            # Configuration templates
│   ├── plugins/              # Plugin system
│   └── constants.py          # Constants and enums
├── tests/                    # Test suite
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── fixtures/             # Test fixtures
│   └── conftest.py          # pytest configuration
├── scripts/                  # Build and utility scripts
├── config/                   # Configuration examples
└── examples/                 # Usage examples
```

## Source Code Structure (`forge/`)

### Core Files

#### `forge/main.py`
- **Purpose**: CLI entry point and command routing
- **Key Features**:
  - Argument parsing with Click
  - Command registration
  - Error handling
  - Version information

#### `forge/__init__.py`
- **Purpose**: Package initialization and exports
- **Content**:
  - Version definition
  - Public API exports
  - Package metadata

#### `forge/constants.py`
- **Purpose**: Constants, enums, and configuration defaults
- **Content**:
  - Default paths and settings
  - Provider constants
  - Status enums
  - Error codes

### CLI Commands (`forge/cli/`)

```
forge/cli/
├── __init__.py
├── base.py                   # Base command class
├── local.py                  # Local development commands
├── provision.py              # Server provisioning commands
├── deploy.py                 # Deployment commands
├── backup.py                 # Backup and restore commands
├── sync.py                   # Synchronization commands
├── ci.py                     # CI/CD commands
├── monitor.py                # Monitoring commands
├── info.py                   # Information commands
├── workflow.py               # Workflow management
├── config.py                 # Configuration commands
└── utils/                    # CLI utilities
    ├── __init__.py
    ├── helpers.py            # Helper functions
    ├── formatters.py         # Output formatters
    └── validators.py         # Input validators
```

#### Command Structure

Each command module follows this pattern:

```python
# Example: forge/cli/local.py
import click
from .base import BaseCommand

@click.group()
def local():
    """Local development commands."""
    pass

@local.command()
@click.option('--environment', default='development')
def setup(environment):
    """Setup local development environment."""
    # Implementation

@local.command()
def start():
    """Start local development servers."""
    # Implementation
```

### Server Provisioning (`forge/provision/`)

```
forge/provision/
├── __init__.py
├── base.py                   # Base provisioning class
├── hetzner.py                # Hetzner Cloud provisioning
├── cyberpanel.py             # CyberPanel provisioning
├── libyanspider.py           # LibyanSpider provisioning
├── generic.py                # Generic server provisioning
├── core.py                   # Core provisioning logic
├── templates/                # Configuration templates
│   ├── nginx.conf.j2
│   ├── apache.conf.j2
│   ├── php.ini.j2
│   ├── mysql.conf.j2
│   └── wordpress.conf.j2
└── scripts/                  # Provisioning scripts
    ├── ubuntu_setup.sh
    ├── centos_setup.sh
    ├── security_hardening.sh
    └── performance_optimization.sh
```

### Deployment Strategies (`forge/deployment/`)

```
forge/deployment/
├── __init__.py
├── base.py                   # Base deployment class
├── strategies.py             # Deployment strategies
│   ├── rolling.py            # Rolling deployment
│   ├── blue_green.py         # Blue-green deployment
│   ├── atomic.py             # Atomic deployment
│   └── canary.py             # Canary deployment
├── core.py                   # Core deployment logic
├── health_checks.py          # Health check implementations
├── rollback.py               # Rollback mechanisms
├── hooks.py                  # Deployment hooks
└── utils/                    # Deployment utilities
    ├── __init__.py
    ├── file_sync.py          # File synchronization
    ├── database.py           # Database operations
    ├── ssl.py                # SSL certificate management
    └── verification.py       # Deployment verification
```

### Data Models (`forge/models/`)

```
forge/models/
├── __init__.py
├── base.py                   # Base model class
├── server.py                 # Server model
├── project.py                # Project model
├── deployment.py             # Deployment model
├── backup.py                 # Backup model
├── config.py                 # Configuration model
├── environment.py            # Environment model
├── provider.py               # Provider model
└── workflow.py               # Workflow model
```

#### Model Example

```python
# forge/models/server.py
from dataclasses import dataclass
from typing import Optional, Dict, Any
from .base import BaseModel

@dataclass
class Server(BaseModel):
    """Server model representing a provisioned server."""

    id: str
    name: str
    provider: str
    host: str
    status: str
    specs: Dict[str, Any]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Server':
        """Create model from dictionary."""
        return cls(**data)
```

### Utility Functions (`forge/utils/`)

```
forge/utils/
├── __init__.py
├── config_manager.py         # Configuration management
├── file_operations.py        # File operations
├── ssh.py                    # SSH operations
├── database.py               # Database utilities
├── security.py               # Security utilities
├── encryption.py             # Encryption utilities
├── retry.py                  # Retry mechanisms
├── resilience.py             # Resilience patterns
├── project_helpers.py        # Project-specific helpers
├── exceptions.py             # Custom exceptions
├── local_config.py           # Local configuration
├── validators.py             # Input validation
├── formatters.py             # Output formatting
├── logger.py                 # Logging utilities
└── helpers.py                # General helpers
```

### Workflows (`forge/workflows/`)

```
forge/workflows/
├── __init__.py
├── base.py                   # Base workflow class
├── setup_project.py          # Project setup workflow
├── deploy_project.py         # Deployment workflow
├── backup_workflow.py        # Backup workflow
├── migration_workflow.py     # Migration workflow
├── ci_workflow.py            # CI/CD workflow
├── monitoring_workflow.py    # Monitoring workflow
└── definitions/              # Workflow definitions
    ├── project_setup.yaml
    ├── deployment.yaml
    ├── backup.yaml
    └── monitoring.yaml
```

### Templates (`forge/templates/`)

```
forge/templates/
├── config/                   # Configuration templates
│   ├── forge.yaml.j2
│   ├── nginx.conf.j2
│   ├── apache.conf.j2
│   ├── php.ini.j2
│   ├── mysql.conf.j2
│   └── wordpress.conf.j2
├── ci/                       # CI/CD templates
│   ├── github-actions.yml.j2
│   ├── gitlab-ci.yml.j2
│   ├── jenkinsfile.j2
│   └── circleci.yml.j2
├── docker/                   # Docker templates
│   ├── Dockerfile.j2
│   ├── docker-compose.yml.j2
│   └── docker-entrypoint.sh.j2
└── scripts/                  # Script templates
    ├── setup.sh.j2
    ├── deploy.sh.j2
    ├── backup.sh.j2
    └── health-check.sh.j2
```

### Plugin System (`forge/plugins/`)

```
forge/plugins/
├── __init__.py
├── base.py                   # Base plugin class
├── manager.py                # Plugin manager
├── registry.py               # Plugin registry
├── loader.py                 # Plugin loader
├── examples/                 # Example plugins
│   ├── custom_provider.py
│   ├── custom_deployment.py
│   └── custom_notifier.py
└── interfaces/               # Plugin interfaces
    ├── provider.py
    ├── deployment.py
    ├── backup.py
    └── notification.py
```

## Test Structure (`tests/`)

### Test Organization

```
tests/
├── __init__.py
├── conftest.py               # pytest configuration and fixtures
├── unit/                     # Unit tests
│   ├── __init__.py
│   ├── test_models/
│   │   ├── __init__.py
│   │   ├── test_server.py
│   │   ├── test_project.py
│   │   └── test_deployment.py
│   ├── test_utils/
│   │   ├── __init__.py
│   │   ├── test_config_manager.py
│   │   ├── test_ssh.py
│   │   └── test_security.py
│   ├── test_cli/
│   │   ├── __init__.py
│   │   ├── test_local.py
│   │   ├── test_provision.py
│   │   └── test_deploy.py
│   └── test_provision/
│       ├── __init__.py
│       ├── test_hetzner.py
│       ├── test_cyberpanel.py
│       └── test_generic.py
├── integration/              # Integration tests
│   ├── __init__.py
│   ├── test_deployment_flow.py
│   ├── test_backup_restore.py
│   ├── test_provisioning.py
│   └── test_cli_integration.py
├── fixtures/                 # Test fixtures
│   ├── __init__.py
│   ├── config_files/
│   │   ├── valid_forge.yaml
│   │   ├── minimal_forge.yaml
│   │   └── invalid_forge.yaml
│   ├── test_data/
│   │   ├── servers.json
│   │   ├── projects.json
│   │   └── deployments.json
│   └── mocks/
│       ├── hetzner_responses.json
│       ├── cyberpanel_responses.json
│       └── database_responses.json
└── utils/                    # Test utilities
    ├── __init__.py
    ├── helpers.py
    ├── mocks.py
    └── fixtures.py
```

### Test Configuration (`conftest.py`)

```python
# tests/conftest.py
import pytest
import tempfile
from pathlib import Path
from forge.models import Server, Project
from forge.utils.config_manager import ConfigManager

@pytest.fixture
def temp_dir():
    """Temporary directory for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)

@pytest.fixture
def config_manager(temp_dir):
    """Config manager fixture."""
    return ConfigManager(temp_dir / "test_config.yaml")

@pytest.fixture
def sample_server():
    """Sample server fixture."""
    return Server(
        id="test-server-1",
        name="Test Server",
        provider="hetzner",
        host="test.example.com",
        status="active",
        specs={"cpu": 4, "ram": "8GB", "storage": "100GB"}
    )

@pytest.fixture
def mock_hetzner_responses():
    """Mock Hetzner API responses."""
    return {
        "create_server": {"id": "123456", "status": "running"},
        "list_servers": [{"id": "123456", "name": "test-server"}],
        "delete_server": {"success": True}
    }
```

## Documentation Structure (`docs/`)

### Documentation Organization

Each documentation file serves a specific purpose:

- **`QUICK_START.md`**: 5-minute setup guide for new users
- **`CONFIGURATION.md`**: Comprehensive configuration management
- **`COMMANDS.md`**: Complete command reference
- **`TROUBLESHOOTING.md`**: Common issues and solutions
- **`ARCHITECTURE.md`**: System architecture and design patterns
- **`TESTING.md`**: Testing guide and procedures
- **`DEVELOPMENT.md`**: Contributing guidelines
- **`API.md`**: Internal API documentation
- **`DEPLOYMENT_GUIDE.md`**: Deployment workflows and strategies
- **`BACKUP_GUIDE.md`**: Backup and restore procedures
- **`PROVIDER_GUIDE.md`**: Server provider setup guides
- **`CI_CD_GUIDE.md`**: CI/CD integration guide
- **`ENVIRONMENT_VARIABLES.md`**: Environment variables reference
- **`PROJECT_STRUCTURE.md`**: Detailed project structure (this file)
- **`DEPENDENCIES.md`**: Complete dependency list
- **`CHANGELOG.md`**: Version history and changes

## Configuration Structure

### Main Configuration (`forge.yaml`)

```yaml
# Project information
project:
  name: "my-wordpress-site"
  description: "WordPress site powered by Bedrock Forge"
  version: "1.0.0"

# Environment configuration
environments:
  development:
    database:
      host: "localhost"
      name: "forge_dev"
      user: "dev"
      password: "${DB_PASSWORD_DEV}"

  production:
    database:
      host: "prod-db.example.com"
      name: "forge_production"
      user: "prod"
      password: "${DB_PASSWORD_PROD}"

# Server configuration
server:
  provider: "hetzner"
  # ... other settings

# Build and deployment
build:
  assets:
    command: "npm run build"
  deploy:
    strategy: "rolling"
    backup: true
```

### Environment-specific Configuration

Environment variables override configuration file settings:

```bash
# .env.production
DB_PASSWORD_PROD=secure_password_here
SERVER_HOST=prod.example.com
DEPLOY_KEY_PATH=~/.ssh/prod_key
```

## Script Structure (`scripts/`)

### Build and Utility Scripts

```
scripts/
├── build.sh                  # Build script
├── test.sh                   # Test script
├── lint.sh                   # Linting script
├── install.sh                # Installation script
├── release.sh                # Release script
├── setup_dev.sh              # Development setup
├── docker/
│   ├── build.sh              # Docker build
│   ├── run.sh                # Docker run
│   └── compose.sh            # Docker Compose
└── utils/
    ├── generate_docs.py      # Documentation generator
    ├── update_version.py     # Version updater
    └── validate_config.py    # Configuration validator
```

## Configuration Examples (`config/`)

### Example Configurations

```
config/
├── examples/
│   ├── minimal_forge.yaml    # Minimal configuration
│   ├── production_forge.yaml # Production configuration
│   ├── multi_site_forge.yaml # Multi-site configuration
│   └── development_forge.yaml # Development configuration
├── templates/
│   ├── hetzner.yaml.j2       # Hetzner template
│   ├── cyberpanel.yaml.j2    # CyberPanel template
│   └── libyanspider.yaml.j2  # LibyanSpider template
└── schemas/
    ├── forge_schema.json     # Configuration schema
    └── validation_rules.json # Validation rules
```

## Usage Examples (`examples/`)

### Real-world Examples

```
examples/
├── basic_usage/              # Basic usage examples
│   ├── project_setup.py
│   ├── deployment.py
│   └── backup.py
├── advanced_usage/           # Advanced examples
│   ├── custom_provider.py
│   ├── custom_workflow.py
│   └── multi_environment.py
├── integrations/             # Integration examples
│   ├── github_actions/
│   ├── gitlab_ci/
│   └── jenkins/
└── plugins/                  # Plugin examples
    ├── custom_deployment.py
    ├── custom_backup.py
    └── custom_notifier.py
```

## File Naming Conventions

### Python Files
- **Modules**: `snake_case.py` (e.g., `config_manager.py`)
- **Classes**: `PascalCase` (e.g., `ConfigManager`)
- **Functions**: `snake_case` (e.g., `create_server`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PORT`)

### Configuration Files
- **Main config**: `forge.yaml`
- **Environment configs**: `.env.<environment>`
- **Templates**: `<name>.j2`
- **Examples**: `<description>_example.yaml`

### Documentation Files
- **Markdown**: `TITLE_CASE.md` (e.g., `CONFIGURATION.md`)
- **Sections**: `## Title Case`
- **Code blocks**: Triple backticks with language

## Import Structure

### Package Imports

```python
# Standard imports first
import os
import sys
from pathlib import Path

# Third-party imports
import click
import yaml
from pydantic import BaseModel

# Local imports
from forge.models.server import Server
from forge.utils.config_manager import ConfigManager
from forge.provision.base import BaseProvider
```

### Relative Imports

```python
# Within same package
from .base import BaseCommand
from ..models import Server
from ..utils import config_manager

# Cross-package
from forge.models import Server
from forge.utils import config_manager
from forge.provision.hetzner import HetznerProvider
```

## Best Practices

### Code Organization

1. **Single Responsibility**: Each module has one clear purpose
2. **Separation of Concerns**: Separate business logic from infrastructure
3. **Dependency Injection**: Use dependency injection for testability
4. **Configuration Management**: Centralize configuration handling
5. **Error Handling**: Implement consistent error handling patterns

### File Organization

1. **Logical Grouping**: Group related files together
2. **Clear Naming**: Use descriptive, consistent naming
3. **Documentation**: Document all public interfaces
4. **Testing**: Mirror source structure in tests
5. **Configuration**: Separate configuration from code

This comprehensive project structure guide ensures maintainability, scalability, and clarity across the Bedrock Forge codebase.
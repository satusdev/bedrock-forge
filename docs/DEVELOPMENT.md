# Development Guide

Complete guide for contributing to Bedrock Forge, including development setup, coding standards, and contribution workflow.

## 📋 Table of Contents

- [Overview](#overview)
- [Development Setup](#development-setup)
- [Code Organization](#code-organization)
- [Coding Standards](#coding-standards)
- [Contribution Workflow](#contribution-workflow)
- [Git Guidelines](#git-guidelines)
- [Code Review Process](#code-review-process)
- [Release Process](#release-process)
- [Debugging](#debugging)
- [Performance Guidelines](#performance-guidelines)
- [Security Guidelines](#security-guidelines)

## 🎯 Overview

Bedrock Forge is an open-source project that welcomes contributions from the community. This guide covers everything you need to know to start contributing effectively.

### Our Mission

Create a unified, reliable, and user-friendly CLI tool for WordPress development workflows that simplifies the complexity of modern WordPress development and deployment.

### Core Values

- **Developer Experience**: Make WordPress development enjoyable
- **Reliability**: Build tools that just work
- **Community**: Foster an inclusive and helpful community
- **Innovation**: Embrace modern development practices
- **Simplicity**: Complex problems, simple solutions

## 🛠️ Development Setup

### Prerequisites

- Python 3.9 or higher
- Git
- Docker and Docker Compose
- Make (optional, for convenience commands)
- Code editor (VS Code recommended)

### Initial Setup

```bash
# 1. Fork the repository
# Visit https://github.com/your-org/bedrock-forge and click "Fork"

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/bedrock-forge.git
cd bedrock-forge

# 3. Add upstream remote
git remote add upstream https://github.com/your-org/bedrock-forge.git

# 4. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 5. Install dependencies
pip install -r forge/requirements.txt
pip install -r forge/requirements-dev.txt

# 6. Install in development mode
pip install -e .

# 7. Run initial setup
python forge/tests/run_tests.py setup

# 8. Verify installation
python3 -m forge --help
pytest forge/tests/ -m "unit and not slow"
```

### Development Environment

```bash
# Set up development environment
export FORGE_ENV=development
export FORGE_LOG_LEVEL=DEBUG

# Create development configuration
python3 -m forge config init --template=development

# Enable auto-reloading for development
export FORGE_AUTO_RELOAD=true
```

### IDE Setup

#### VS Code

Install recommended extensions:

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.flake8",
    "ms-python.black-formatter",
    "ms-python.isort",
    "ms-python.mypy-type-checker",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml"
  ]
}
```

Configure VS Code settings:

```json
// .vscode/settings.json
{
  "python.defaultInterpreterPath": "./venv/bin/python",
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.linting.mypyEnabled": true,
  "python.sortImports.args": ["--profile", "black"],
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

#### PyCharm

1. Open project directory
2. Configure Python interpreter to use venv
3. Enable code style: Black
4. Enable inspections: Flake8, MyPy
5. Configure code completion and type checking

## 📁 Code Organization

### Directory Structure

```
bedrock-forge/
├── forge/                           # Main source code
│   ├── main.py                     # CLI entry point
│   ├── commands/                   # Command modules
│   │   ├── __init__.py
│   │   ├── local.py               # Local development commands
│   │   ├── provision.py           # Server provisioning commands
│   │   ├── deploy.py              # Deployment commands
│   │   ├── sync.py                # Backup and sync commands
│   │   ├── ci.py                  # CI/CD commands
│   │   ├── monitor.py             # Monitoring commands
│   │   ├── info.py                # Information commands
│   │   ├── workflow.py            # Workflow commands
│   │   └── config.py              # Configuration commands
│   ├── utils/                      # Utility modules
│   │   ├── __init__.py
│   │   ├── config.py              # Configuration management
│   │   ├── logging.py             # Logging utilities
│   │   ├── shell.py               # Shell command wrapper
│   │   ├── errors.py              # Custom exceptions
│   │   ├── api.py                 # API client utilities
│   │   ├── ssh.py                 # SSH operations
│   │   ├── security.py            # Security utilities
│   │   ├── retry.py               # Retry mechanisms
│   │   ├── resilience.py          # Resilience patterns
│   │   └── exceptions.py          # Exception classes
│   ├── provision/                 # Server provisioning modules
│   │   ├── __init__.py
│   │   ├── core.py                # Core provisioning logic
│   │   ├── hetzner.py             # Hetzner Cloud provider
│   │   ├── cyberpanel.py          # CyberPanel provider
│   │   ├── libyanspider.py        # LibyanSpider provider
│   │   ├── cloudflare.py          # Cloudflare integration
│   │   ├── ssl_certificates.py    # SSL certificate management
│   │   ├── enhanced_deployment.py # Advanced deployment logic
│   │   └── deployment_strategies.py # Deployment strategies
│   ├── models/                     # Data models
│   │   ├── __init__.py
│   │   ├── project.py             # Project model
│   │   ├── server.py              # Server model
│   │   ├── deployment.py          # Deployment model
│   │   └── backup.py              # Backup model
│   ├── workflows/                  # Workflow definitions
│   │   ├── __init__.py
│   │   └── project_creation.py    # Project creation workflow
│   ├── constants.py                # Application constants
│   ├── exceptions.py               # Custom exceptions
│   └── tests/                      # Test suite
│       ├── __init__.py
│       ├── conftest.py            # Pytest configuration
│       ├── run_tests.py           # Test runner
│       ├── fixtures/              # Test fixtures
│       ├── unit/                  # Unit tests
│       ├── integration/           # Integration tests
│       ├── mocks/                 # Mock utilities
│       └── e2e/                   # End-to-end tests
├── docs/                           # Documentation
├── scripts/                        # Utility scripts
├── .github/                        # GitHub workflows
│   └── workflows/
│       ├── test.yml               # CI/CD pipeline
│       ├── release.yml            # Release automation
│       └── security.yml           # Security scanning
├── .vscode/                        # VS Code configuration
├── requirements.txt                # Production dependencies
├── requirements-dev.txt            # Development dependencies
├── pyproject.toml                  # Project configuration
├── pytest.ini                     # Pytest configuration
├── .flake8                         # Flake8 configuration
├── .pre-commit-config.yaml         # Pre-commit hooks
├── CHANGELOG.md                    # Version history
├── LICENSE                         # MIT License
└── README.md                       # Project documentation
```

### Module Guidelines

#### Command Modules (`forge/commands/`)

```python
# Standard command module structure
import typer
from forge.utils.logging import logger
from forge.utils.errors import ForgeError

app = typer.Typer()

@app.command()
def command_name(
    required_arg: str = typer.Argument(..., help="Required argument"),
    optional_arg: str = typer.Option("default", help="Optional argument"),
    flag: bool = typer.Option(False, "--flag", help="Boolean flag")
):
    """
    Command description that appears in help text.

    More detailed description explaining what the command does.
    """
    try:
        logger.info(f"Executing command with {required_arg}")

        # Command logic here
        result = perform_operation(required_arg, optional_arg, flag)

        if result.success:
            typer.echo(f"✅ Success: {result.message}")
        else:
            typer.echo(f"❌ Error: {result.message}", err=True)
            raise typer.Exit(1)

    except ForgeError as e:
        logger.error(f"Command failed: {e}")
        typer.echo(f"❌ {e}", err=True)
        raise typer.Exit(1)
    except Exception as e:
        logger.exception("Unexpected error")
        typer.echo("❌ An unexpected error occurred", err=True)
        raise typer.Exit(1)
```

#### Utility Modules (`forge/utils/`)

```python
# Standard utility module structure
import logging
from typing import Optional, Dict, Any
from forge.utils.errors import ForgeError

logger = logging.getLogger(__name__)

class UtilityClass:
    """Utility class description."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._validate_config()

    def _validate_config(self) -> None:
        """Validate configuration parameters."""
        required_keys = ['key1', 'key2']
        for key in required_keys:
            if key not in self.config:
                raise ForgeError(f"Missing required config key: {key}")

    def perform_operation(self, input_data: str) -> Result:
        """
        Perform the main utility operation.

        Args:
            input_data: Input data for the operation

        Returns:
            Result object with operation outcome

        Raises:
            ForgeError: If operation fails
        """
        try:
            logger.debug(f"Performing operation with {input_data}")

            # Operation logic here
            result = self._execute_operation(input_data)

            logger.info(f"Operation completed successfully")
            return Result(success=True, data=result)

        except Exception as e:
            logger.error(f"Operation failed: {e}")
            raise ForgeError(f"Operation failed: {e}")

    def _execute_operation(self, input_data: str) -> Any:
        """Internal operation implementation."""
        # Implementation details
        pass
```

## 📝 Coding Standards

### Python Style Guide

We follow PEP 8 with some modifications enforced by our tooling:

#### Formatting

```bash
# Format code with Black
black forge/ tests/

# Sort imports with isort
isort forge/ tests/

# Check formatting
black --check forge/ tests/
isort --check-only forge/ tests/
```

#### Linting

```bash
# Run linting
flake8 forge/ tests/

# Type checking
mypy forge/

# Security scanning
bandit -r forge/
```

#### Code Style Examples

```python
# Good: Clear naming and type hints
from typing import Optional, List, Dict
from dataclasses import dataclass

@dataclass
class ServerConfig:
    """Configuration for server provisioning."""
    name: str
    ip_address: str
    domain: str
    ssh_port: int = 22
    web_server: WebServer = WebServer.NGINX

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            'name': self.name,
            'ip_address': self.ip_address,
            'domain': self.domain,
            'ssh_port': self.ssh_port,
            'web_server': self.web_server.value
        }

# Good: Clear function with docstring
def create_server(config: ServerConfig, provider: str = "hetzner") -> Server:
    """
    Create a new server with the given configuration.

    Args:
        config: Server configuration
        provider: Cloud provider to use

    Returns:
        Created server instance

    Raises:
        ProvisioningError: If server creation fails
    """
    logger.info(f"Creating server {config.name} using {provider}")

    try:
        provider_client = get_provider_client(provider)
        server = provider_client.create_server(config)

        logger.info(f"Server {server.id} created successfully")
        return server

    except Exception as e:
        logger.error(f"Failed to create server: {e}")
        raise ProvisioningError(f"Server creation failed: {e}")

# Bad: Unclear naming, no type hints, no docstring
def svr(cfg, prov="hetzner"):
    # create server
    client = get_client(prov)
    return client.create(cfg)
```

### Error Handling

```python
# Good: Specific exceptions with context
from forge.utils.errors import ForgeError, ConfigurationError, ProvisioningError

def deploy_project(project_name: str, environment: str) -> DeploymentResult:
    """Deploy project to specified environment."""
    try:
        config = load_project_config(project_name)
        if not config:
            raise ConfigurationError(f"Project {project_name} not found")

        env_config = config.get_environment(environment)
        if not env_config:
            raise ConfigurationError(f"Environment {environment} not configured")

        return execute_deployment(config, env_config)

    except ConfigurationError:
        raise  # Re-raise configuration errors
    except Exception as e:
        logger.exception(f"Deployment failed for {project_name}")
        raise ProvisioningError(f"Deployment failed: {e}")

# Bad: Generic exception handling
def deploy_project(project_name, environment):
    try:
        # deployment logic
        pass
    except:
        print("Something went wrong")
        return None
```

### Logging

```python
# Good: Structured logging with appropriate levels
import logging

logger = logging.getLogger(__name__)

class DeploymentService:
    def deploy(self, config: DeploymentConfig) -> DeploymentResult:
        logger.info(f"Starting deployment for {config.project_name}")

        try:
            logger.debug(f"Deployment config: {config.to_dict()}")

            # Pre-deployment checks
            logger.debug("Running pre-deployment checks")
            self._validate_environment(config)

            # Execute deployment
            logger.info("Executing deployment steps")
            result = self._execute_deployment(config)

            if result.success:
                logger.info(f"Deployment completed successfully for {config.project_name}")
            else:
                logger.error(f"Deployment failed: {result.error}")

            return result

        except Exception as e:
            logger.exception(f"Deployment failed with exception")
            raise

# Bad: Print statements for logging
def deploy(config):
    print("Starting deployment...")
    # deployment logic
    print("Deployment complete")
```

### Documentation

```python
# Good: Comprehensive docstrings
class BackupManager:
    """
    Manages backup operations for WordPress projects.

    This class provides functionality to create, restore, and manage
    backups of WordPress sites including database and files.

    Attributes:
        config: Backup configuration
        storage: Storage backend for backups
        encryption_manager: Handles backup encryption

    Example:
        >>> config = BackupConfig(project_name="mysite", destination="gdrive")
        >>> manager = BackupManager(config)
        >>> result = manager.create_backup()
        >>> print(f"Backup created: {result.backup_id}")
    """

    def create_backup(
        self,
        backup_type: BackupType = BackupType.FULL,
        description: Optional[str] = None
    ) -> BackupResult:
        """
        Create a new backup of the project.

        Creates a complete backup including database and files, with optional
        encryption and compression based on configuration.

        Args:
            backup_type: Type of backup to create (FULL/DATABASE/FILES)
            description: Optional description for the backup

        Returns:
            BackupResult containing backup ID and metadata

        Raises:
            BackupError: If backup creation fails
            InsufficientSpaceError: If insufficient storage space
            ConfigurationError: If backup configuration is invalid

        Example:
            >>> result = manager.create_backup(
            ...     backup_type=BackupType.DATABASE,
            ...     description="Pre-deployment backup"
            ... )
            >>> print(f"Backup ID: {result.backup_id}")
        """
        pass
```

## 🔄 Contribution Workflow

### 1. Choose an Issue

- Look for issues with `good first issue` or `help wanted` labels
- Comment on the issue to claim it
- Ask questions if anything is unclear

### 2. Create a Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git rebase upstream/main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-number-description
```

### 3. Make Changes

```bash
# Make your changes
# Follow coding standards
# Add tests for new functionality
# Update documentation

# Run tests locally
pytest forge/tests/
python forge/tests/run_tests.py lint
python forge/tests/run_tests.py security

# Format code
black forge/ tests/
isort forge/ tests/
```

### 4. Commit Changes

```bash
# Stage changes
git add .

# Commit with conventional commit message
git commit -m "feat: add new deployment strategy"

# Or for bug fixes
git commit -m "fix: resolve configuration validation error"

# Or for docs
git commit -m "docs: update deployment guide examples"
```

### 5. Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create pull request on GitHub
# Use descriptive title and description
# Link to relevant issues
# Request code review
```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Maintenance tasks

**Examples:**
```
feat(deployment): add blue-green deployment strategy

Implement blue-green deployment strategy for zero-downtime
deployments with automatic rollback on failure.

Closes #123
```

```
fix(config): resolve environment variable interpolation

Fix issue where environment variables in configuration files
were not being properly interpolated, causing deployment
failures.

Closes #456
```

## 🌿 Git Guidelines

### Branch Naming

```bash
# Features
feature/description-of-feature
feature/123-add-new-command

# Bug fixes
fix/short-description
fix/456-resolve-config-error

# Hotfixes (from main)
hotfix/urgent-fix-description

# Releases
release/v1.2.0
```

### Branch Management

```bash
# Keep your branch updated with main
git fetch upstream
git checkout feature/your-feature
git rebase upstream/main

# Resolve conflicts if any
# Continue rebase
git rebase --continue

# Force push if rebased (careful!)
git push --force-with-lease origin feature/your-feature
```

### Merge vs Rebase

```bash
# Use rebase for feature branches (keeps history clean)
git checkout main
git merge --ff-only feature/your-feature

# Or use squash and merge (clean single commit)
# Via GitHub UI: "Squash and merge"
```

### Commit Best Practices

```bash
# Good: Atomic commits with clear messages
git add forge/commands/new_command.py
git commit -m "feat(commands): add new server monitoring command"

git add tests/unit/test_new_command.py
git commit -m "test: add unit tests for monitoring command"

git add docs/COMMANDS.md
git commit -m "docs: update command reference with monitoring"

# Bad: Large commits with mixed changes
git add .
git commit -m "add lots of stuff"
```

## 👀 Code Review Process

### Reviewer Guidelines

1. **Code Quality**
   - Follows coding standards
   - Proper error handling
   - Adequate test coverage
   - Clear documentation

2. **Functionality**
   - Works as intended
   - Handles edge cases
   - No breaking changes
   - Backward compatibility

3. **Security**
   - No security vulnerabilities
   - Proper input validation
   - Secure credential handling
   - No sensitive data exposure

4. **Performance**
   - Efficient algorithms
   - No memory leaks
   - Proper resource management
   - Scalable implementation

### Review Checklist

```markdown
- [ ] Code follows project style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No breaking changes (or clearly documented)
- [ ] Security considerations addressed
- [ ] Performance implications considered
- [ ] Error handling is appropriate
- [ ] Logging is sufficient but not excessive
- [ ] Configuration is handled properly
- [ ] Backward compatibility maintained
```

### Responding to Reviews

```bash
# Make requested changes
git add .
git commit -m "fix: address code review feedback"

# Or if multiple changes
git commit -m "fix: resolve reviewer suggestions"

# Push updated branch
git push origin feature/your-feature

# Comment on PR to request another review
```

## 🚀 Release Process

### Version Management

We follow [Semantic Versioning](https://semver.org/):

- `MAJOR.MINOR.PATCH`
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

### Release Steps

```bash
# 1. Update version
# Edit forge/constants.py
VERSION = "1.2.3"

# 2. Update CHANGELOG.md
# Add release notes with changes

# 3. Create release branch
git checkout -b release/v1.2.3

# 4. Final testing
python forge/tests/run_tests.py all
python forge/tests/run_tests.py security

# 5. Tag release
git tag -a v1.2.3 -m "Release version 1.2.3"

# 6. Push to main
git checkout main
git merge --ff-only release/v1.2.3
git push upstream main
git push upstream v1.2.3

# 7. Create GitHub Release
# Go to GitHub Releases page
# Create new release with tag v1.2.3
# Add release notes
```

### Automation

Release process is automated via GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: Set up Python
      uses: actions/setup-python@v3
      with:
        python-version: '3.10'

    - name: Build package
      run: |
        python -m pip install --upgrade pip
        pip install build
        python -m build

    - name: Publish to PyPI
      uses: pypa/gh-action-pypi-publish@release/v1
      with:
        password: ${{ secrets.PYPI_API_TOKEN }}
```

## 🐛 Debugging

### Local Debugging

```bash
# Enable debug logging
export FORGE_DEBUG=true
export FORGE_LOG_LEVEL=DEBUG

# Run with verbose output
python3 -m forge --verbose command arguments

# Use Python debugger
python3 -m pdb -c continue forge/main.py command arguments

# Set breakpoints in code
import pdb; pdb.set_trace()
```

### Remote Debugging

```python
# Add debug endpoint for development
@app.command()
def debug_info():
    """Show debug information for troubleshooting."""
    info = {
        "version": VERSION,
        "python_version": sys.version,
        "environment": os.getenv("FORGE_ENV", "unknown"),
        "config_path": get_config_path(),
        "log_level": logger.level
    }
    typer.echo(json.dumps(info, indent=2))
```

### Performance Profiling

```python
import cProfile
import pstats

def profile_function(func):
    """Profile function performance."""
    profiler = cProfile.Profile()
    profiler.enable()

    result = func()

    profiler.disable()
    stats = pstats.Stats(profiler)
    stats.sort_stats('cumulative')
    stats.print_stats(10)

    return result
```

## ⚡ Performance Guidelines

### Optimization Principles

1. **Measure First**: Profile before optimizing
2. **Focus on Hotspots**: Optimize critical paths
3. **Consider Trade-offs**: Speed vs readability vs maintainability
4. **Test Optimizations**: Verify improvements work

### Performance Best Practices

```python
# Good: Efficient file operations
def read_config_file(config_path: Path) -> Dict[str, Any]:
    """Read configuration file efficiently."""
    if not config_path.exists():
        return {}

    # Use context manager for proper file handling
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Good: Lazy loading for expensive operations
class ExpensiveResource:
    def __init__(self):
        self._resource = None

    @property
    def resource(self):
        if self._resource is None:
            self._resource = self._create_resource()
        return self._resource

# Good: Use generators for large datasets
def process_large_file(file_path: Path) -> Iterator[str]:
    """Process large file line by line."""
    with open(file_path, 'r') as f:
        for line in f:
            yield process_line(line)

# Bad: Inefficient operations
def read_config_file_bad(config_path):
    # Loads entire file into memory unnecessarily
    with open(config_path, 'r') as f:
        content = f.read()
    return json.loads(content)

def process_large_file_bad(file_path):
    # Loads entire file into memory
    with open(file_path, 'r') as f:
        lines = f.readlines()
    for line in lines:
        process_line(line)
```

## 🔒 Security Guidelines

### Security Principles

1. **Principle of Least Privilege**: Minimal necessary permissions
2. **Defense in Depth**: Multiple layers of security
3. **Secure by Default**: Secure configurations out of the box
4. **Input Validation**: Validate all inputs
5. **Error Handling**: Don't leak sensitive information

### Secure Coding Practices

```python
# Good: Secure credential handling
class CredentialManager:
    def __init__(self):
        self.keyring = keyring.get_keyring()

    def store_credential(self, service: str, username: str, password: str):
        """Store credential securely."""
        # Encrypt before storing
        encrypted_password = self._encrypt(password)
        self.keyring.set_password(service, username, encrypted_password)

    def get_credential(self, service: str, username: str) -> Optional[str]:
        """Retrieve credential securely."""
        encrypted_password = self.keyring.get_password(service, username)
        if encrypted_password:
            return self._decrypt(encrypted_password)
        return None

# Good: Input validation
def validate_project_name(name: str) -> str:
    """Validate and sanitize project name."""
    if not name:
        raise ValueError("Project name cannot be empty")

    # Remove dangerous characters
    sanitized = re.sub(r'[^\w\-_.]', '', name)

    if len(sanitized) < 3:
        raise ValueError("Project name too short")

    return sanitized

# Good: Secure file operations
def write_config_file(config_path: Path, data: Dict[str, Any]):
    """Write configuration file securely."""
    # Ensure directory exists with proper permissions
    config_path.parent.mkdir(mode=0o700, exist_ok=True)

    # Write with restricted permissions
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    # Set file permissions
    config_path.chmod(0o600)

# Bad: Insecure practices
def store_password_insecure(password):
    # Never log passwords
    logger.info(f"Storing password: {password}")

    # Never store passwords in plain text
    with open('passwords.txt', 'w') as f:
        f.write(password)
```

### Security Testing

```bash
# Run security scans
bandit -r forge/
safety check
semgrep --config=auto forge/

# Check for vulnerabilities in dependencies
pip-audit

# Run security-focused tests
pytest forge/tests/ -m security
```

---

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions
- Maintain professional communication

### Getting Help

- **Documentation**: Read the docs first
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our community Discord (link in README)

### Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Annual contributor highlights

Thank you for contributing to Bedrock Forge! 🚀

For more information:
- [Testing Guide](TESTING.md)
- [API Documentation](API.md)
- [Architecture Guide](ARCHITECTURE.md)
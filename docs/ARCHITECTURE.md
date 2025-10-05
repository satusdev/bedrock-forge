# Architecture Guide

System architecture, design patterns, and technical implementation details of Bedrock Forge.

## 📋 Table of Contents

- [Overview](#overview)
- [Design Principles](#design-principles)
- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Command Architecture](#command-architecture)
- [Data Flow](#data-flow)
- [Plugin System](#plugin-system)
- [Security Architecture](#security-architecture)
- [Performance Architecture](#performance-architecture)
- [Extensibility](#extensibility)

## 🎯 Overview

Bedrock Forge is built using a modular, plugin-based architecture that emphasizes:

- **Modularity**: Clear separation of concerns with well-defined interfaces
- **Extensibility**: Plugin system for adding new functionality
- **Reliability**: Error handling, retry mechanisms, and resilience patterns
- **Security**: Secure credential management and encrypted communications
- **Performance**: Efficient resource usage and parallel processing

## 🏛️ Design Principles

### 1. Single Responsibility Principle
Each module and class has a single, well-defined responsibility:
- Commands handle CLI interface
- Utilities provide reusable functionality
- Provisioning modules manage server operations
- Models define data structures

### 2. Dependency Injection
Dependencies are injected rather than hardcoded:
```python
# Instead of: HetznerClient()
# Use: provider_factory.create("hetzner", config)
```

### 3. Configuration-Driven
Behavior is controlled through configuration rather than code:
```python
# Configuration determines providers, settings, and behavior
config = load_config()
strategy = create_deployment_strategy(config.deployment.method)
```

### 4. Fail-Fast Philosophy
Errors are detected and reported early:
```python
# Validate configuration before operations
validate_deployment_config(config)
# Check connectivity before deployment
check_server_connectivity(server_config)
```

### 5. Immutable State
Where possible, state is immutable to prevent side effects:
```python
# Return new configuration objects
new_config = config.with_environment("production")
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                        │
│                    (forge/main.py)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Command Layer                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Local   │ │Deploy   │ │Sync     │ │Provision│          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Service Layer                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │Deploy   │ │Backup   │ │Monitor  │ │Provider │          │
│  │Service  │ │Service  │ │Service  │ │Factory  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Utility Layer                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │Config   │ │SSH      │ │API      │ │Security │          │
│  │Manager  │ │Client   │ │Client   │ │Manager  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Infrastructure                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │Storage  │ │Network  │ │External │ │Logging  │          │
│  │(Files)  │ │(SSH/FTP)│ │APIs     │ │System   │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### 1. CLI Entry Point (`forge/main.py`)

The main CLI module uses Typer for command-line interface generation:

```python
import typer
from .commands import local, provision, sync, deploy, ci, monitor, info, workflow, config

app = typer.Typer(rich_markup_mode="rich", help="Unified CLI for Bedrock WordPress workflows")

# Register command modules
app.add_typer(local.app, name="local", help="Manage local projects with DDEV")
app.add_typer(provision.app, name="provision", help="Provision servers and services")
# ... other commands
```

**Features:**
- Automatic help generation
- Rich markup support
- Subcommand organization
- Global option handling

### 2. Configuration System (`forge/utils/config.py`)

Hierarchical configuration management with environment interpolation:

```python
class ConfigManager:
    def __init__(self):
        self.config_hierarchy = [
            "command_line_args",
            "environment_variables",
            "project_config",
            "environment_config",
            "global_config",
            "defaults"
        ]

    def load_config(self, env: str = None) -> Config:
        # Merge configurations from all sources
        # Interpolate environment variables
        # Validate final configuration
        pass
```

**Features:**
- JSON-based configuration
- Environment variable interpolation
- Validation and schema checking
- Configuration inheritance
- Encryption for sensitive values

### 3. Command Architecture

Each command module follows a consistent pattern:

```python
# forge/commands/deploy.py
import typer
from forge.utils.logging import logger
from forge.provision.enhanced_deployment import EnhancedDeployment

app = typer.Typer()

@app.command()
def push(
    project: str = typer.Argument(...),
    environment: str = typer.Argument(...),
    dry_run: bool = typer.Option(False),
    build: bool = typer.Option(False)
):
    """Deploy project to environment."""
    config = load_project_config(project, environment)
    deployment = EnhancedDeployment(config)

    if dry_run:
        logger.info(f"Would deploy {project} to {environment}")
        return

    result = deployment.deploy(build_assets=build)
    handle_result(result)
```

**Pattern:**
- Command-line argument parsing
- Configuration loading
- Service instantiation
- Business logic execution
- Result handling

### 4. Provider System (`forge/provision/`)

Abstract provider system for different hosting providers:

```python
# forge/provision/core.py
from abc import ABC, abstractmethod

class Provider(ABC):
    @abstractmethod
    def create_server(self, config: ServerConfig) -> Server:
        pass

    @abstractmethod
    def delete_server(self, server: Server) -> bool:
        pass

class HetznerProvider(Provider):
    def create_server(self, config: ServerConfig) -> Server:
        # Hetzner-specific implementation
        client = self._get_client()
        response = client.servers.create(config.to_hetzner_format())
        return Server.from_hetzner_response(response)

class ProviderFactory:
    @staticmethod
    def create(provider_type: str, config: dict) -> Provider:
        providers = {
            "hetzner": HetznerProvider,
            "cyberpanel": CyberPanelProvider,
            "libyanspider": LibyanSpiderProvider
        }
        return providers[provider_type](config)
```

**Benefits:**
- Consistent interface across providers
- Easy addition of new providers
- Provider-specific optimizations
- Configuration-driven provider selection

### 5. Deployment System (`forge/provision/enhanced_deployment.py`)

Advanced deployment system with multiple strategies:

```python
class EnhancedDeployment:
    def __init__(self, config: DeploymentConfig):
        self.config = config
        self.strategy = self._create_strategy()
        self.version_manager = VersionManager()
        self.health_checker = HealthChecker()

    def deploy(self, **kwargs) -> DeploymentResult:
        # 1. Pre-deployment checks
        self._validate_environment()
        self._create_backup()

        # 2. Execute deployment strategy
        result = self.strategy.deploy(self.config, **kwargs)

        # 3. Post-deployment verification
        if result.success:
            self._run_health_checks()
            self._update_version()

        return result

    def _create_strategy(self) -> DeploymentStrategy:
        strategies = {
            "atomic": AtomicDeploymentStrategy,
            "rolling": RollingDeploymentStrategy,
            "blue-green": BlueGreenDeploymentStrategy
        }
        return strategies[self.config.strategy](self.config)
```

**Features:**
- Multiple deployment strategies
- Automatic rollback on failure
- Health checks and verification
- Version management
- Zero-downtime deployments

## 🌊 Data Flow

### 1. Command Execution Flow

```
User Input → CLI Parser → Command Handler → Service Layer → Infrastructure → Result → User
```

### 2. Configuration Loading Flow

```
CLI Args → Environment Variables → Project Config → Environment Config → Global Config → Defaults → Merged Config
```

### 3. Deployment Flow

```
Project Config → Deployment Strategy → Build Assets → Transfer Files → Run Migrations → Health Checks → Update Version → Result
```

### 4. Backup Flow

```
Backup Request → Database Dump → File Collection → Compression → Encryption → Upload → Verification → Result
```

## 🔌 Plugin System

### Plugin Architecture

```python
# forge/plugins/base.py
from abc import ABC, abstractmethod

class Plugin(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        pass

    @abstractmethod
    def initialize(self, config: dict) -> None:
        pass

    @abstractmethod
    def register_commands(self, app: typer.Typer) -> None:
        pass

# forge/plugins/custom_plugin.py
class CustomPlugin(Plugin):
    @property
    def name(self) -> str:
        return "custom-plugin"

    def register_commands(self, app: typer.Typer) -> None:
        @app.command()
        def custom_command():
            print("Custom command from plugin!")

# forge/plugin_manager.py
class PluginManager:
    def __init__(self):
        self.plugins = {}

    def load_plugins(self, plugin_dir: Path) -> None:
        for plugin_path in plugin_dir.glob("*.py"):
            plugin = self._load_plugin(plugin_path)
            self.plugins[plugin.name] = plugin

    def register_plugin_commands(self, app: typer.Typer) -> None:
        for plugin in self.plugins.values():
            plugin.register_commands(app)
```

**Plugin Features:**
- Dynamic command registration
- Configuration integration
- Lifecycle hooks
- Dependency management
- Version compatibility checking

## 🔒 Security Architecture

### 1. Credential Management

```python
# forge/utils/security.py
class CredentialManager:
    def __init__(self):
        self.keyring = keyring.get_keyring()
        self.encryption_key = self._get_or_create_key()

    def store_credential(self, service: str, username: str, password: str) -> None:
        encrypted_password = self._encrypt(password)
        self.keyring.set_password(service, username, encrypted_password)

    def get_credential(self, service: str, username: str) -> str:
        encrypted_password = self.keyring.get_password(service, username)
        return self._decrypt(encrypted_password) if encrypted_password else None

    def _encrypt(self, data: str) -> str:
        # AES-256-GCM encryption
        cipher = AESGCM(self.encryption_key)
        nonce = os.urandom(12)
        encrypted = cipher.encrypt(nonce, data.encode(), None)
        return base64.b64encode(nonce + encrypted).decode()
```

### 2. SSH Security

```python
# forge/utils/ssh.py
class SecureSSHClient:
    def __init__(self, config: SSHConfig):
        self.config = config
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.RejectPolicy())

    def connect(self) -> None:
        # Use key-based authentication only
        self.client.connect(
            hostname=self.config.host,
            username=self.config.user,
            key_filename=self.config.key_path,
            port=self.config.port,
            timeout=self.config.timeout,
            banner_timeout=self.config.banner_timeout
        )

    def execute_secure_command(self, command: str) -> SSHResult:
        # Sanitize command
        sanitized_command = self._sanitize_command(command)

        # Execute with timeout
        stdin, stdout, stderr = self.client.exec_command(
            sanitized_command,
            timeout=self.config.command_timeout
        )

        return SSHResult(
            exit_code=stdout.channel.recv_exit_status(),
            stdout=stdout.read().decode(),
            stderr=stderr.read().decode()
        )
```

### 3. Configuration Security

```python
# Security features in configuration:
# 1. Sensitive value encryption
# 2. Environment variable interpolation
# 3. Access control and permissions
# 4. Audit logging
# 5. Configuration validation
```

## ⚡ Performance Architecture

### 1. Parallel Processing

```python
# forge/utils/parallel.py
import asyncio
from concurrent.futures import ThreadPoolExecutor

class ParallelProcessor:
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers

    def process_files_parallel(self, files: List[Path], operation: callable) -> List[Result]:
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [executor.submit(operation, file) for file in files]
            return [future.result() for future in futures]

    async def process_async(self, tasks: List[Task]) -> List[Result]:
        return await asyncio.gather(*[task.execute() for task in tasks])
```

### 2. Caching System

```python
# forge/utils/cache.py
class CacheManager:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.memory_cache = {}

    def get(self, key: str, ttl: int = 3600) -> Any:
        # Check memory cache first
        if key in self.memory_cache:
            item = self.memory_cache[key]
            if time.time() - item['timestamp'] < ttl:
                return item['data']

        # Check file cache
        cache_file = self.cache_dir / f"{key}.cache"
        if cache_file.exists():
            with open(cache_file, 'rb') as f:
                item = pickle.load(f)
                if time.time() - item['timestamp'] < ttl:
                    self.memory_cache[key] = item
                    return item['data']

        return None

    def set(self, key: str, data: Any) -> None:
        item = {
            'data': data,
            'timestamp': time.time()
        }

        # Store in memory
        self.memory_cache[key] = item

        # Store in file
        cache_file = self.cache_dir / f"{key}.cache"
        with open(cache_file, 'wb') as f:
            pickle.dump(item, f)
```

### 3. Resource Management

```python
# forge/utils/resources.py
class ResourceManager:
    def __init__(self):
        self.connections = {}
        self.temp_files = []

    @contextmanager
    def get_ssh_connection(self, config: SSHConfig):
        key = f"{config.host}:{config.port}"
        if key not in self.connections:
            self.connections[key] = SecureSSHClient(config)
            self.connections[key].connect()

        try:
            yield self.connections[key]
        finally:
            # Keep connection alive for reuse
            pass

    @contextmanager
    def temp_file(self, content: str = None, suffix: str = '.tmp'):
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        self.temp_files.append(temp_file.name)

        if content:
            temp_file.write(content.encode())
            temp_file.flush()

        try:
            yield temp_file.name
        finally:
            temp_file.close()

    def cleanup(self):
        # Close all connections
        for connection in self.connections.values():
            connection.close()
        self.connections.clear()

        # Remove temp files
        for temp_file in self.temp_files:
            try:
                os.unlink(temp_file)
            except FileNotFoundError:
                pass
        self.temp_files.clear()
```

## 🔧 Extensibility

### 1. Adding New Commands

```python
# forge/commands/new_command.py
import typer
from forge.utils.logging import logger

app = typer.Typer()

@app.command()
def new_feature(
    project: str = typer.Argument(...),
    option: str = typer.Option("default")
):
    """New feature command."""
    logger.info(f"Running new feature on {project} with {option}")
    # Implementation here

# Register in main.py
app.add_typer(new_command.app, name="new-command", help="New feature commands")
```

### 2. Adding New Providers

```python
# forge/provision/new_provider.py
from forge.provision.core import Provider, ServerConfig, Server

class NewProvider(Provider):
    def create_server(self, config: ServerConfig) -> Server:
        # Implementation specific to new provider
        client = NewProviderClient(config.api_key)
        response = client.create_server(config.to_provider_format())
        return Server.from_provider_response(response)

    def delete_server(self, server: Server) -> bool:
        # Implementation for server deletion
        pass

# Register in provider factory
providers["new_provider"] = NewProvider
```

### 3. Adding New Deployment Strategies

```python
# forge/provision/strategies/new_strategy.py
from forge.provision.enhanced_deployment import DeploymentStrategy

class NewDeploymentStrategy(DeploymentStrategy):
    def deploy(self, config: DeploymentConfig, **kwargs) -> DeploymentResult:
        # Implementation of new deployment strategy
        try:
            # Pre-deployment steps
            self.prepare_deployment(config)

            # Deployment steps
            self.execute_deployment(config)

            # Post-deployment steps
            self.verify_deployment(config)

            return DeploymentResult(success=True)
        except Exception as e:
            return DeploymentResult(success=False, error=str(e))

# Register in strategy factory
strategies["new_strategy"] = NewDeploymentStrategy
```

### 4. Custom Workflow Steps

```python
# forge/workflows/custom_steps.py
class CustomWorkflowStep:
    def __init__(self, config: dict):
        self.config = config

    def execute(self, context: WorkflowContext) -> StepResult:
        # Custom workflow logic
        try:
            # Do something custom
            result = self.custom_operation(context)

            # Update context
            context.add_data("custom_result", result)

            return StepResult(success=True, data=result)
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def custom_operation(self, context: WorkflowContext) -> Any:
        # Implementation of custom operation
        pass

# Register in workflow system
workflow_registry.register_step("custom_step", CustomWorkflowStep)
```

## 📊 Monitoring and Observability

### 1. Metrics Collection

```python
# forge/utils/metrics.py
class MetricsCollector:
    def __init__(self):
        self.counters = defaultdict(int)
        self.timers = {}
        self.gauges = {}

    def increment_counter(self, name: str, value: int = 1) -> None:
        self.counters[name] += value

    def start_timer(self, name: str) -> None:
        self.timers[name] = time.time()

    def end_timer(self, name: str) -> float:
        if name in self.timers:
            duration = time.time() - self.timers[name]
            del self.timers[name]
            return duration
        return 0.0

    def set_gauge(self, name: str, value: float) -> None:
        self.gauges[name] = value
```

### 2. Health Checks

```python
# forge/utils/health.py
class HealthChecker:
    def __init__(self):
        self.checks = {}

    def register_check(self, name: str, check_func: callable) -> None:
        self.checks[name] = check_func

    def run_health_checks(self) -> HealthStatus:
        results = {}
        overall_healthy = True

        for name, check_func in self.checks.items():
            try:
                result = check_func()
                results[name] = result
                if not result.is_healthy:
                    overall_healthy = False
            except Exception as e:
                results[name] = HealthCheckResult(
                    is_healthy=False,
                    message=str(e)
                )
                overall_healthy = False

        return HealthStatus(
            is_healthy=overall_healthy,
            checks=results
        )
```

## 🎯 Design Patterns Used

### 1. Factory Pattern
- Provider creation
- Deployment strategy selection
- Service instantiation

### 2. Strategy Pattern
- Deployment strategies
- Backup methods
- Authentication methods

### 3. Observer Pattern
- Event system
- Logging and monitoring
- Notification system

### 4. Command Pattern
- CLI command execution
- Workflow step execution
- Undo/redo functionality

### 5. Builder Pattern
- Configuration building
- Query building
- Deployment planning

### 6. Singleton Pattern
- Configuration manager
- Logging system
- Cache manager

---

## 🔍 Future Architecture Improvements

1. **Microservices Architecture**: Split into separate services for scalability
2. **Event-Driven Architecture**: Use message queues for async operations
3. **GraphQL API**: Provide flexible API for integrations
4. **Kubernetes Integration**: Container-based deployments
5. **AI/ML Integration**: Intelligent optimization and recommendations

For implementation details, see:
- [API Documentation](API.md)
- [Development Guide](DEVELOPMENT.md)
- [Testing Guide](TESTING.md)
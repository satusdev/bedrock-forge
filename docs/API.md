# API Documentation

Internal API documentation for Bedrock Forge modules, utilities, and interfaces.

## 📋 Table of Contents

- [Overview](#overview)
- [Core APIs](#core-apis)
- [Utility APIs](#utility-apis)
- [Provider APIs](#provider-apis)
- [Model APIs](#model-apis)
- [Workflow APIs](#workflow-apis)
- [Plugin APIs](#plugin-apis)
- [Extensibility](#extensibility)
- [Examples](#examples)

## 🎯 Overview

This document provides detailed API documentation for internal modules and interfaces. It's intended for developers who want to extend or integrate with Bedrock Forge functionality.

### API Design Principles

- **Consistency**: Uniform interfaces across modules
- **Type Safety**: Comprehensive type hints
- **Error Handling**: Clear exception hierarchy
- **Documentation**: Comprehensive docstrings
- **Testability**: Dependency injection and mocking support

## 🔧 Core APIs

### Configuration Management

#### `forge.utils.config.ConfigManager`

```python
class ConfigManager:
    """Manages hierarchical configuration with environment interpolation."""

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize configuration manager.

        Args:
            config_path: Path to configuration directory
        """

    def load_config(self, env: Optional[str] = None) -> Config:
        """
        Load configuration from all sources.

        Args:
            env: Target environment (local/staging/production)

        Returns:
            Merged configuration object

        Raises:
            ConfigurationError: If configuration is invalid
        """

    def save_config(self, config: Config, env: Optional[str] = None) -> None:
        """
        Save configuration to appropriate file.

        Args:
            config: Configuration to save
            env: Target environment (None for global config)
        """

    def validate_config(self, config: Config) -> ValidationResult:
        """
        Validate configuration against schema.

        Args:
            config: Configuration to validate

        Returns:
            Validation result with any errors
        """

    def interpolate_env_vars(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Interpolate environment variables in configuration.

        Args:
            config: Configuration dictionary

        Returns:
            Configuration with interpolated values
        """
```

#### `forge.utils.config.Config`

```python
@dataclass
class Config:
    """Main configuration object."""

    project: ProjectConfig
    environments: Dict[str, EnvironmentConfig]
    deployment: DeploymentConfig
    backup: BackupConfig
    monitoring: MonitoringConfig

    def get_environment(self, name: str) -> Optional[EnvironmentConfig]:
        """Get environment configuration by name."""

    def merge_with(self, other: 'Config') -> 'Config':
        """Merge with another configuration."""

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Config':
        """Create configuration from dictionary."""
```

### Logging System

#### `forge.utils.logging.Logger`

```python
class ForgeLogger:
    """Enhanced logger with structured logging support."""

    def __init__(self, name: str, level: str = "INFO"):
        """
        Initialize logger.

        Args:
            name: Logger name
            level: Logging level
        """

    def debug(self, message: str, **kwargs) -> None:
        """Log debug message with optional structured data."""

    def info(self, message: str, **kwargs) -> None:
        """Log info message with optional structured data."""

    def warning(self, message: str, **kwargs) -> None:
        """Log warning message with optional structured data."""

    def error(self, message: str, error: Optional[Exception] = None, **kwargs) -> None:
        """Log error message with optional exception and structured data."""

    def audit(self, action: str, user: Optional[str] = None, **kwargs) -> None:
        """Log audit event for security and compliance."""

    def performance(self, operation: str, duration: float, **kwargs) -> None:
        """Log performance metrics."""

    def with_context(self, **context) -> 'ForgeLogger':
        """Create logger with additional context."""
```

### Error Handling

#### `forge.utils.exceptions`

```python
class ForgeError(Exception):
    """Base exception for all Forge errors."""

    def __init__(self, message: str, error_code: Optional[str] = None, context: Optional[Dict[str, Any]] = None):
        """
        Initialize exception.

        Args:
            message: Error message
            error_code: Machine-readable error code
            context: Additional context information
        """

class ConfigurationError(ForgeError):
    """Configuration-related errors."""

class ProvisioningError(ForgeError):
    """Server provisioning errors."""

class DeploymentError(ForgeError):
    """Deployment-related errors."""

class BackupError(ForgeError):
    """Backup and restore errors."""

class ValidationError(ForgeError):
    """Data validation errors."""

class AuthenticationError(ForgeError):
    """Authentication and authorization errors."""

class NetworkError(ForgeError):
    """Network and connectivity errors."""
```

## 🛠️ Utility APIs

### Shell Operations

#### `forge.utils.shell.ShellResult`

```python
@dataclass
class ShellResult:
    """Result of shell command execution."""

    success: bool
    returncode: int
    stdout: str
    stderr: str
    command: str
    duration: float
    start_time: datetime
    end_time: datetime

    @property
    def failed(self) -> bool:
        """Check if command failed."""

    def raise_for_status(self) -> None:
        """Raise exception if command failed."""

    def json_output(self) -> Dict[str, Any]:
        """Parse stdout as JSON."""
```

#### `forge.utils.shell.Shell`

```python
class Shell:
    """Enhanced shell command execution with retry and timeout support."""

    def __init__(self, timeout: int = 300, retries: int = 3):
        """
        Initialize shell executor.

        Args:
            timeout: Command timeout in seconds
            retries: Number of retry attempts
        """

    def run(self, command: Union[str, List[str]], **kwargs) -> ShellResult:
        """
        Execute shell command.

        Args:
            command: Command to execute
            **kwargs: Additional execution options

        Returns:
            ShellResult with execution details

        Raises:
            ShellError: If command execution fails
        """

    def run_async(self, command: Union[str, List[str]], **kwargs) -> AsyncShellResult:
        """Execute command asynchronously."""

    def interactive(self, command: Union[str, List[str]], **kwargs) -> ShellResult:
        """Execute command with interactive terminal."""

    def pipeline(self, commands: List[Union[str, List[str]]], **kwargs) -> ShellResult:
        """Execute commands as a pipeline."""
```

### SSH Operations

#### `forge.utils.ssh.SSHClient`

```python
class SSHClient:
    """Secure SSH client with key management and connection pooling."""

    def __init__(self, config: SSHConfig):
        """
        Initialize SSH client.

        Args:
            config: SSH configuration
        """

    def connect(self) -> None:
        """Establish SSH connection."""

    def disconnect(self) -> None:
        """Close SSH connection."""

    def execute_command(self, command: str, timeout: Optional[int] = None) -> SSHResult:
        """
        Execute command on remote server.

        Args:
            command: Command to execute
            timeout: Command timeout

        Returns:
            SSHResult with execution details

        Raises:
            SSHError: If command execution fails
        """

    def upload_file(self, local_path: Path, remote_path: Path) -> TransferResult:
        """
        Upload file to remote server.

        Args:
            local_path: Local file path
            remote_path: Remote file path

        Returns:
            TransferResult with upload details
        """

    def download_file(self, remote_path: Path, local_path: Path) -> TransferResult:
        """Download file from remote server."""

    def port_forward(self, local_port: int, remote_host: str, remote_port: int) -> PortForwardResult:
        """Set up SSH port forwarding."""

    @contextmanager
    def tunnel(self, local_port: int, remote_host: str, remote_port: int):
        """Context manager for SSH tunneling."""
```

### API Client

#### `forge.utils.api.APIClient`

```python
class APIClient:
    """Generic HTTP API client with retry and authentication support."""

    def __init__(self, base_url: str, auth: Optional[Auth] = None, timeout: int = 30):
        """
        Initialize API client.

        Args:
            base_url: Base URL for API
            auth: Authentication method
            timeout: Request timeout
        """

    def request(self, method: str, endpoint: str, **kwargs) -> APIResponse:
        """
        Make HTTP request.

        Args:
            method: HTTP method
            endpoint: API endpoint
            **kwargs: Additional request parameters

        Returns:
            APIResponse with response data

        Raises:
        APIError: If request fails
        """

    def get(self, endpoint: str, **kwargs) -> APIResponse:
        """Make GET request."""

    def post(self, endpoint: str, **kwargs) -> APIResponse:
        """Make POST request."""

    def put(self, endpoint: str, **kwargs) -> APIResponse:
        """Make PUT request."""

    def delete(self, endpoint: str, **kwargs) -> APIResponse:
        """Make DELETE request."""

    @contextmanager
    def session(self) -> Iterator['APIClient']:
        """Context manager for session management."""
```

## 🖥️ Provider APIs

### Base Provider Interface

#### `forge.provision.core.Provider`

```python
class Provider(ABC):
    """Abstract base class for all providers."""

    def __init__(self, config: ProviderConfig):
        """
        Initialize provider.

        Args:
            config: Provider-specific configuration
        """

    @abstractmethod
    def authenticate(self) -> AuthResult:
        """
        Authenticate with provider.

        Returns:
            Authentication result

        Raises:
            AuthenticationError: If authentication fails
        """

    @abstractmethod
    def create_server(self, config: ServerConfig) -> Server:
        """
        Create new server.

        Args:
            config: Server configuration

        Returns:
            Created server instance

        Raises:
            ProvisioningError: If server creation fails
        """

    @abstractmethod
    def delete_server(self, server: Server) -> bool:
        """
        Delete server.

        Args:
            server: Server to delete

        Returns:
            True if deletion successful

        Raises:
            ProvisioningError: If deletion fails
        """

    @abstractmethod
    def get_server(self, server_id: str) -> Optional[Server]:
        """Get server by ID."""

    @abstractmethod
    def list_servers(self) -> List[Server]:
        """List all servers."""

    def get_provider_info(self) -> ProviderInfo:
        """Get provider information and capabilities."""
```

### Hetzner Provider

#### `forge.provision.hetzner.HetznerProvider`

```python
class HetznerProvider(Provider):
    """Hetzner Cloud provider implementation."""

    def __init__(self, config: HetznerConfig):
        """
        Initialize Hetzner provider.

        Args:
            config: Hetzner-specific configuration
        """

    def create_server(self, config: ServerConfig) -> Server:
        """
        Create Hetzner Cloud server.

        Args:
            config: Server configuration

        Returns:
            Created Hetzner server

        Example:
            >>> config = ServerConfig(
            ...     name="my-server",
            ...     server_type="cpx11",
            ...     image="ubuntu-22.04",
            ...     location="hel1"
            ... )
            >>> provider = HetznerProvider(hetzner_config)
            >>> server = provider.create_server(config)
            >>> print(f"Server created: {server.id}")
        """

    def create_ssh_key(self, name: str, public_key: str) -> SSHKey:
        """Create SSH key in Hetzner."""

    def create_firewall(self, config: FirewallConfig) -> Firewall:
        """Create firewall rules."""

    def attach_server_to_network(self, server: Server, network: Network) -> None:
        """Attach server to private network."""

    def create_volume(self, config: VolumeConfig) -> Volume:
        """Create storage volume."""

    def attach_volume(self, server: Server, volume: Volume) -> None:
        """Attach volume to server."""
```

### Deployment System

#### `forge.provision.enhanced_deployment.EnhancedDeployment`

```python
class EnhancedDeployment:
    """Advanced deployment system with multiple strategies."""

    def __init__(self, config: DeploymentConfig):
        """
        Initialize deployment manager.

        Args:
            config: Deployment configuration
        """

    def deploy(self, **kwargs) -> DeploymentResult:
        """
        Execute deployment with configured strategy.

        Args:
            **kwargs: Additional deployment options

        Returns:
            DeploymentResult with deployment details

        Raises:
            DeploymentError: If deployment fails
        """

    def rollback(self, version: Optional[str] = None) -> RollbackResult:
        """
        Rollback to previous deployment version.

        Args:
            version: Specific version to rollback to (None for previous)

        Returns:
            RollbackResult with rollback details
        """

    def get_deployment_history(self, limit: int = 10) -> List[Deployment]:
        """Get deployment history."""

    def validate_deployment(self) -> ValidationResult:
        """Validate deployment configuration and prerequisites."""

    def preview_deployment(self) -> DeploymentPreview:
        """Preview deployment changes without executing."""

    def set_deployment_strategy(self, strategy: DeploymentStrategy) -> None:
        """Change deployment strategy."""

    def add_pre_deployment_hook(self, hook: DeploymentHook) -> None:
        """Add pre-deployment hook."""

    def add_post_deployment_hook(self, hook: DeploymentHook) -> None:
        """Add post-deployment hook."""
```

## 📊 Model APIs

### Project Model

#### `forge.models.project.Project`

```python
@dataclass
class Project:
    """WordPress project model."""

    name: str
    path: Path
    type: ProjectType
    config: ProjectConfig
    environments: Dict[str, Environment]
    created_at: datetime
    updated_at: datetime

    def get_environment(self, name: str) -> Optional[Environment]:
        """Get environment by name."""

    def add_environment(self, environment: Environment) -> None:
        """Add new environment to project."""

    def remove_environment(self, name: str) -> bool:
        """Remove environment from project."""

    def get_active_environment(self) -> Optional[Environment]:
        """Get currently active environment."""

    def to_dict(self) -> Dict[str, Any]:
        """Convert project to dictionary."""

    @classmethod
    def from_directory(cls, directory: Path) -> Optional['Project']:
        """Create project from directory."""

    def validate(self) -> ValidationResult:
        """Validate project configuration."""
```

#### `forge.models.project.Environment`

```python
@dataclass
class Environment:
    """Project environment model."""

    name: str
    url: str
    wp_home: str
    wp_siteurl: str
    database: DatabaseConfig
    ssh: Optional[SSHConfig]
    deployment: Optional[DeploymentConfig]
    backup: Optional[BackupConfig]

    def is_local(self) -> bool:
        """Check if environment is local."""

    def is_remote(self) -> bool:
        """Check if environment is remote."""

    def get_database_connection(self) -> DatabaseConnection:
        """Get database connection for environment."""

    def validate(self) -> ValidationResult:
        """Validate environment configuration."""
```

### Server Model

#### `forge.models.server.Server`

```python
@dataclass
class Server:
    """Server model."""

    id: str
    name: str
    provider: str
    ip_address: str
    domain: Optional[str]
    status: ServerStatus
    config: ServerConfig
    created_at: datetime
    updated_at: datetime

    def is_running(self) -> bool:
        """Check if server is running."""

    def get_ssh_connection(self) -> SSHClient:
        """Get SSH connection to server."""

    def wait_for_status(self, target_status: ServerStatus, timeout: int = 300) -> bool:
        """Wait for server to reach target status."""

    def reboot(self) -> bool:
        """Reboot server."""

    def shutdown(self) -> bool:
        """Shutdown server."""

    def get_metrics(self) -> ServerMetrics:
        """Get server performance metrics."""

    def to_dict(self) -> Dict[str, Any]:
        """Convert server to dictionary."""
```

### Backup Model

#### `forge.models.backup.Backup`

```python
@dataclass
class Backup:
    """Backup model."""

    id: str
    project_name: str
    environment: str
    backup_type: BackupType
    size_bytes: int
    created_at: datetime
    expires_at: Optional[datetime]
    location: str
    checksum: str
    metadata: Dict[str, Any]

    def is_expired(self) -> bool:
        """Check if backup has expired."""

    def get_age_days(self) -> int:
        """Get backup age in days."""

    def verify_integrity(self) -> bool:
        """Verify backup integrity using checksum."""

    def restore(self, target_environment: str) -> RestoreResult:
        """Restore backup to target environment."""

    def delete(self) -> bool:
        """Delete backup."""

    def to_dict(self) -> Dict[str, Any]:
        """Convert backup to dictionary."""
```

## 🔄 Workflow APIs

### Workflow Engine

#### `forge.workflows.base.Workflow`

```python
class Workflow:
    """Base workflow class."""

    def __init__(self, name: str, config: WorkflowConfig):
        """
        Initialize workflow.

        Args:
            name: Workflow name
            config: Workflow configuration
        """

    def add_step(self, step: WorkflowStep) -> None:
        """Add step to workflow."""

    def remove_step(self, step_name: str) -> bool:
        """Remove step from workflow."""

    def execute(self, context: WorkflowContext) -> WorkflowResult:
        """
        Execute workflow.

        Args:
            context: Workflow execution context

        Returns:
            WorkflowResult with execution details

        Raises:
            WorkflowError: If workflow execution fails
        """

    def validate(self) -> ValidationResult:
        """Validate workflow configuration."""

    def preview(self, context: WorkflowContext) -> WorkflowPreview:
        """Preview workflow execution without running."""

    def get_execution_plan(self, context: WorkflowContext) -> ExecutionPlan:
        """Get detailed execution plan."""
```

#### `forge.workflows.base.WorkflowStep`

```python
class WorkflowStep(ABC):
    """Abstract base class for workflow steps."""

    def __init__(self, name: str, config: StepConfig):
        """
        Initialize workflow step.

        Args:
            name: Step name
            config: Step configuration
        """

    @abstractmethod
    def execute(self, context: WorkflowContext) -> StepResult:
        """
        Execute workflow step.

        Args:
            context: Workflow execution context

        Returns:
            StepResult with execution details

        Raises:
            StepError: If step execution fails
        """

    @abstractmethod
    def validate(self, context: WorkflowContext) -> ValidationResult:
        """Validate step prerequisites."""

    def rollback(self, context: WorkflowContext) -> StepResult:
        """Rollback step execution."""

    def get_dependencies(self) -> List[str]:
        """Get list of step dependencies."""

    def get_outputs(self) -> List[str]:
        """Get list of step outputs."""
```

## 🔌 Plugin APIs

### Plugin System

#### `forge.plugins.base.Plugin`

```python
class Plugin(ABC):
    """Base plugin interface."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Plugin name."""

    @property
    @abstractmethod
    def version(self) -> str:
        """Plugin version."""

    @property
    @abstractmethod
    def dependencies(self) -> List[str]:
        """Plugin dependencies."""

    @abstractmethod
    def initialize(self, app: typer.Typer, config: Dict[str, Any]) -> None:
        """
        Initialize plugin.

        Args:
            app: Typer application instance
            config: Plugin configuration
        """

    @abstractmethod
    def register_commands(self, app: typer.Typer) -> None:
        """Register plugin commands."""

    def register_hooks(self, hook_manager: HookManager) -> None:
        """Register plugin hooks."""

    def cleanup(self) -> None:
        """Cleanup plugin resources."""
```

#### `forge.plugins.manager.PluginManager`

```python
class PluginManager:
    """Plugin discovery and management."""

    def __init__(self, plugin_dirs: List[Path]):
        """
        Initialize plugin manager.

        Args:
            plugin_dirs: Directories to search for plugins
        """

    def discover_plugins(self) -> List[Plugin]:
        """Discover available plugins."""

    def load_plugin(self, plugin_name: str) -> Plugin:
        """Load specific plugin."""

    def unload_plugin(self, plugin_name: str) -> None:
        """Unload plugin."""

    def get_loaded_plugins(self) -> Dict[str, Plugin]:
        """Get all loaded plugins."""

    def validate_plugin(self, plugin: Plugin) -> ValidationResult:
        """Validate plugin compatibility."""

    def enable_plugin(self, plugin_name: str) -> None:
        """Enable plugin."""

    def disable_plugin(self, plugin_name: str) -> None:
        """Disable plugin."""

    def get_plugin_info(self, plugin_name: str) -> PluginInfo:
        """Get plugin information."""
```

### Hook System

#### `forge.plugins.hooks.HookManager`

```python
class HookManager:
    """Hook management system."""

    def __init__(self):
        """Initialize hook manager."""

    def register_hook(self, hook_name: str, callback: Callable) -> None:
        """Register hook callback."""

    def unregister_hook(self, hook_name: str, callback: Callable) -> None:
        """Unregister hook callback."""

    def execute_hooks(self, hook_name: str, *args, **kwargs) -> List[Any]:
        """Execute all registered hooks for given hook name."""

    def has_hooks(self, hook_name: str) -> bool:
        """Check if hooks are registered for given hook name."""

    def clear_hooks(self, hook_name: str) -> None:
        """Clear all hooks for given hook name."""

    def get_hook_names(self) -> List[str]:
        """Get all registered hook names."""
```

## 🔧 Extensibility

### Custom Provider Example

```python
class CustomProvider(Provider):
    """Custom provider implementation."""

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.client = CustomAPIClient(config.api_key)

    def authenticate(self) -> AuthResult:
        """Authenticate with custom provider."""
        try:
            response = self.client.authenticate()
            return AuthResult(success=True, token=response.token)
        except CustomAPIError as e:
            raise AuthenticationError(f"Authentication failed: {e}")

    def create_server(self, config: ServerConfig) -> Server:
        """Create server with custom provider."""
        try:
            response = self.client.create_server({
                'name': config.name,
                'size': config.server_type,
                'image': config.image,
                'region': config.location
            })
            return Server.from_custom_response(response)
        except CustomAPIError as e:
            raise ProvisioningError(f"Server creation failed: {e}")

# Register custom provider
ProviderFactory.register('custom', CustomProvider)
```

### Custom Workflow Step Example

```python
class CustomDeploymentStep(WorkflowStep):
    """Custom deployment step."""

    def execute(self, context: WorkflowContext) -> StepResult:
        """Execute custom deployment logic."""
        try:
            # Custom deployment logic
            project = context.get_data('project')
            environment = context.get_data('environment')

            # Perform custom operations
            result = self.perform_custom_deployment(project, environment)

            return StepResult(success=True, data=result)
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def validate(self, context: WorkflowContext) -> ValidationResult:
        """Validate custom step prerequisites."""
        project = context.get_data('project')
        if not project:
            return ValidationResult(success=False, errors=["Project not found in context"])
        return ValidationResult(success=True)

    def perform_custom_deployment(self, project: Project, environment: Environment) -> Any:
        """Implement custom deployment logic."""
        # Custom implementation
        pass
```

## 📚 Examples

### Basic Usage

```python
from forge.utils.config import ConfigManager
from forge.provision.enhanced_deployment import EnhancedDeployment
from forge.models.deployment import DeploymentConfig

# Load configuration
config_manager = ConfigManager()
config = config_manager.load_config('production')

# Create deployment
deployment_config = DeploymentConfig.from_config(config)
deployment = EnhancedDeployment(deployment_config)

# Execute deployment
result = deployment.deploy(build_assets=True, migrate=True)

if result.success:
    print(f"Deployment completed: {result.deployment_id}")
else:
    print(f"Deployment failed: {result.error}")
```

### Provider Usage

```python
from forge.provision.core import ProviderFactory
from forge.models.server import ServerConfig

# Create provider
provider_config = {
    'api_token': 'your-api-token',
    'default_location': 'hel1'
}
provider = ProviderFactory.create('hetzner', provider_config)

# Create server
server_config = ServerConfig(
    name='my-server',
    server_type='cpx11',
    image='ubuntu-22.04',
    location='hel1'
)

server = provider.create_server(server_config)
print(f"Server created: {server.id} ({server.ip_address})")
```

### Custom Workflow

```python
from forge.workflows.base import Workflow, WorkflowContext
from forge.models.project import Project

# Create custom workflow
workflow = Workflow('custom-deployment', workflow_config)

# Add steps
workflow.add_step(CustomDeploymentStep())
workflow.add_step(HealthCheckStep())
workflow.add_step(NotificationStep())

# Execute workflow
context = WorkflowContext()
context.set_data('project', project)
context.set_data('environment', 'production')

result = workflow.execute(context)

if result.success:
    print("Workflow completed successfully")
else:
    print(f"Workflow failed: {result.error}")
```

### Plugin Development

```python
from forge.plugins.base import Plugin
import typer

class MyPlugin(Plugin):
    @property
    def name(self) -> str:
        return "my-plugin"

    @property
    def version(self) -> str:
        return "1.0.0"

    def initialize(self, app: typer.Typer, config: Dict[str, Any]) -> None:
        """Initialize plugin."""
        self.config = config

    def register_commands(self, app: typer.Typer) -> None:
        """Register plugin commands."""

        @app.command()
        def my_command():
            """Custom plugin command."""
            typer.echo("Hello from my plugin!")

    def register_hooks(self, hook_manager: HookManager) -> None:
        """Register plugin hooks."""
        hook_manager.register_hook('pre-deployment', self.pre_deployment_hook)

    def pre_deployment_hook(self, deployment_context: Dict[str, Any]) -> None:
        """Pre-deployment hook."""
        print("Running pre-deployment hook from my plugin")

# Plugin would be discovered and loaded automatically
```

---

For more information:
- [Development Guide](DEVELOPMENT.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Testing Guide](TESTING.md)
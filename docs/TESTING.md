# Testing Guide

Comprehensive testing guide for the Bedrock Forge project, including running tests, writing tests, and understanding the test architecture.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Writing Tests](#writing-tests)
- [Mocking and Fixtures](#mocking-and-fixtures)
- [Test Coverage](#test-coverage)
- [Continuous Integration](#continuous-integration)
- [Test Best Practices](#test-best-practices)
- [Debugging Tests](#debugging-tests)

## 🎯 Overview

Bedrock Forge uses a comprehensive testing strategy with:

- **Unit Tests**: Test individual modules and functions
- **Integration Tests**: Test complete workflows and interactions
- **End-to-End Tests**: Test real-world scenarios
- **Performance Tests**: Test system performance under load
- **Security Tests**: Test security controls and vulnerabilities

### Test Statistics

- **Total Tests**: 150+ test cases
- **Coverage Target**: 80%+ line coverage
- **Test Framework**: pytest with plugins
- **CI/CD**: Automated testing on GitHub Actions

## 🏗️ Test Architecture

```
forge/tests/
├── conftest.py                 # Pytest configuration and shared fixtures
├── run_tests.py               # Test runner script
├── fixtures/                   # Test data and fixtures
│   ├── test_config.json
│   ├── sample_wordpress_project.json
│   ├── mock_server_responses.json
│   └── sample_wordpress_files.php
├── unit/                       # Unit tests
│   ├── test_provision_core.py
│   ├── test_utils_shell.py
│   ├── test_utils_config.py
│   ├── test_enhanced_deployment.py
│   ├── test_sync_commands.py
│   └── test_local_commands.py
├── integration/                # Integration tests
│   ├── test_deployment_workflow.py
│   ├── test_backup_workflow.py
│   ├── test_provisioning_workflow.py
│   └── test_full_project_workflow.py
├── mocks/                      # Mock utilities
│   ├── mock_hetzner.py
│   ├── mock_cloudflare.py
│   ├── mock_ssh_ftp.py
│   └── mock_apis.py
└── e2e/                        # End-to-end tests
    ├── test_complete_user_journey.py
    └── test_real_scenarios.py
```

## 🚀 Running Tests

### Quick Start

```bash
# Run all tests with coverage
python forge/tests/run_tests.py all

# Run only unit tests
python forge/tests/run_tests.py unit

# Run only integration tests
python forge/tests/run_tests.py integration

# Run tests with verbose output
python forge/tests/run_tests.py all --verbose
```

### Using pytest Directly

```bash
# Navigate to forge directory
cd forge

# Run all tests
pytest tests/

# Run unit tests only
pytest tests/unit/ -m "not integration"

# Run integration tests only
pytest tests/integration/ -m "integration"

# Run with coverage
pytest tests/ --cov=forge --cov-report=html --cov-report=term-missing

# Run specific test file
pytest tests/unit/test_provision_core.py

# Run specific test function
pytest tests/unit/test_provision_core.py::TestServerConfig::test_server_config_creation

# Run with markers
pytest tests/ -m "unit and not slow"
pytest tests/ -m "integration and external"
```

### Test Runner Script

The `run_tests.py` script provides convenient test running options:

```bash
#!/usr/bin/env python3
# Usage examples:

# Run all test types
python forge/tests/run_tests.py all

# Run specific test type
python forge/tests/run_tests.py unit
python forge/tests/run_tests.py integration
python forge/tests/run_tests.py e2e

# Run with options
python forge/tests/run_tests.py all --verbose --coverage
python forge/tests/run_tests.py unit --parallel

# Run linting
python forge/tests/run_tests.py lint

# Run security tests
python forge/tests/run_tests.py security
```

### Environment Setup for Testing

```bash
# Set test environment
export FORGE_ENV=test
export FORGE_LOG_LEVEL=DEBUG

# Install test dependencies
pip install -r forge/requirements-test.txt

# Set up test database (if needed)
mysql -u root -e "CREATE DATABASE test_forge;"

# Run test setup
python forge/tests/run_tests.py setup
```

## 📊 Test Categories

### 1. Unit Tests (`tests/unit/`)

Test individual functions and classes in isolation.

**Characteristics:**
- Fast execution (milliseconds)
- No external dependencies
- Mock external services
- Test specific functionality

**Example:**
```python
# tests/unit/test_provision_core.py
import pytest
from forge.provision.core import ServerConfig, WebServer

class TestServerConfig:
    def test_server_config_creation(self):
        config = ServerConfig(
            name="test-server",
            ip_address="192.168.1.100",
            domain="test.example.com"
        )

        assert config.name == "test-server"
        assert config.ip_address == "192.168.1.100"
        assert config.domain == "test.example.com"
        assert config.web_server == WebServer.NGINX  # Default value

    def test_server_config_validation(self):
        with pytest.raises(ValueError, match="Server name is required"):
            ServerConfig(name="", ip_address="192.168.1.100")

    def test_server_config_serialization(self):
        config = ServerConfig(
            name="test-server",
            ip_address="192.168.1.100",
            domain="test.example.com"
        )

        data = config.to_dict()
        assert data["name"] == "test-server"
        assert data["ip_address"] == "192.168.1.100"
```

### 2. Integration Tests (`tests/integration/`)

Test interactions between multiple components.

**Characteristics:**
- Slower execution (seconds)
- Test component interactions
- May use external services (mocked)
- Test complete workflows

**Example:**
```python
# tests/integration/test_deployment_workflow.py
import pytest
from forge.provision.enhanced_deployment import EnhancedDeployment, DeploymentConfig
from tests.mocks.mock_hetzner import HetznerMockPatcher
from tests.mocks.mock_ssh_ftp import SSHMockPatcher

class TestDeploymentWorkflow:
    @pytest.mark.integration
    def test_complete_deployment_workflow(self):
        config = DeploymentConfig(
            project_name="test-project",
            environment="production",
            method="rsync"
        )

        with HetznerMockPatcher() as hetzner_mock, \
             SSHMockPatcher() as ssh_mock:

            # Set up mocks
            hetzner_mock.mock_server.status = "running"
            ssh_mock.mock_connection.connected = True

            # Execute deployment
            deployment = EnhancedDeployment(config)
            result = deployment.deploy()

            # Assertions
            assert result.success is True
            assert "Deployment completed successfully" in result.message
            assert hetzner_mock.mock_server.was_called
            assert ssh_mock.mock_connection.was_called
```

### 3. End-to-End Tests (`tests/e2e/`)

Test complete user scenarios.

**Characteristics:**
- Slowest execution (minutes)
- Test real user workflows
- Use real services when possible
- Test complete application behavior

**Example:**
```python
# tests/e2e/test_complete_user_journey.py
import pytest
import tempfile
from pathlib import Path

class TestCompleteUserJourney:
    @pytest.mark.e2e
    @pytest.mark.slow
    def test_project_creation_to_deployment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 1. Create project
            result = run_command([
                "python3", "-m", "forge", "local", "create-project",
                "test-site", "--template=basic"
            ])
            assert result.returncode == 0

            # 2. Start development
            project_dir = Path(temp_dir) / "test-site"
            os.chdir(project_dir)

            result = run_command(["ddev", "start"])
            assert result.returncode == 0

            # 3. Configure environment
            result = run_command([
                "python3", "-m", "forge", "local", "config",
                "add-environment", "staging"
            ])
            assert result.returncode == 0

            # 4. Create backup
            result = run_command([
                "python3", "-m", "forge", "sync", "backup",
                "test-site", "local", "--dry-run"
            ])
            assert result.returncode == 0

            # Verify project structure
            assert (project_dir / "web" / "wp").exists()
            assert (project_dir / ".forge" / "config.json").exists()
```

## ✏️ Writing Tests

### Test Structure

```python
# Standard test file structure
import pytest
from forge.module import ClassToTest

class TestClassToTest:
    def setup_method(self):
        """Run before each test method."""
        self.instance = ClassToTest()

    def teardown_method(self):
        """Run after each test method."""
        # Cleanup code
        pass

    def test_method_success_case(self):
        """Test successful case."""
        # Arrange
        input_data = "test input"

        # Act
        result = self.instance.method(input_data)

        # Assert
        assert result == "expected output"

    def test_method_error_case(self):
        """Test error case."""
        # Arrange
        invalid_input = None

        # Act & Assert
        with pytest.raises(ValueError, match="Input cannot be None"):
            self.instance.method(invalid_input)
```

### Parameterized Tests

```python
import pytest

class TestParameterizedExamples:
    @pytest.mark.parametrize("input_value,expected_output", [
        ("test", "TEST"),
        ("Hello", "HELLO"),
        ("", ""),
        ("123", "123"),
    ])
    def test_upper_case_function(self, input_value, expected_output):
        result = upper_case_function(input_value)
        assert result == expected_output

    @pytest.mark.parametrize("server_type,expected_method", [
        ("hetzner", "create_hetzner_server"),
        ("cyberpanel", "setup_cyberpanel"),
        ("libyanspider", "configure_libyanspider"),
    ])
    def test_provider_factory(self, server_type, expected_method):
        provider = ProviderFactory.create(server_type, {})
        assert provider.create_method == expected_method
```

### Async Tests

```python
import pytest
import asyncio

class TestAsyncFunctionality:
    @pytest.mark.asyncio
    async def test_async_operation(self):
        # Arrange
        async_client = AsyncClient()

        # Act
        result = await async_client.fetch_data()

        # Assert
        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_concurrent_operations(self):
        # Arrange
        tasks = [
            async_operation(i) for i in range(5)
        ]

        # Act
        results = await asyncio.gather(*tasks)

        # Assert
        assert len(results) == 5
        assert all(r is not None for r in results)
```

### Test Markers

```python
# Custom markers for different test types
@pytest.mark.unit          # Unit test
@pytest.mark.integration   # Integration test
@pytest.mark.e2e          # End-to-end test
@pytest.mark.slow         # Slow running test
@pytest.mark.external     # Requires external services
@pytest.mark.database     # Requires database
@pytest.mark.network      # Requires network access

# Usage examples
@pytest.mark.integration
@pytest.mark.external
def test_api_integration():
    pass

@pytest.mark.slow
@pytest.mark.e2e
def test_full_workflow():
    pass
```

## 🎭 Mocking and Fixtures

### Mocking External Services

```python
# tests/mocks/mock_hetzner.py
from unittest.mock import Mock, patch
import pytest

class HetznerMockPatcher:
    def __init__(self):
        self.mock_server = Mock()
        self.mock_client = Mock()
        self.patches = []

    def __enter__(self):
        # Patch Hetzner client
        patcher = patch('forge.provision.hetzner.HetznerClient')
        self.mock_client = patcher.start()
        self.patches.append(patcher)

        # Configure mock behavior
        self.mock_client.return_value.create_server.return_value = self.mock_server
        self.mock_server.status = "running"
        self.mock_server.id = 12345
        self.mock_server.public_ip = "192.168.1.100"

        return self.mock_client

    def __exit__(self, exc_type, exc_val, exc_tb):
        for patcher in self.patches:
            patcher.stop()

# Usage in tests
def test_hetzner_server_creation():
    with HetznerMockPatcher() as mock_client:
        # Test code that uses HetznerClient
        result = create_server_via_hetzner(config)

        # Assertions
        mock_client.create_server.assert_called_once()
        assert result.server_id == 12345
```

### Pytest Fixtures

```python
# tests/conftest.py
import pytest
import tempfile
from pathlib import Path

@pytest.fixture
def temp_project_dir():
    """Create a temporary project directory."""
    with tempfile.TemporaryDirectory() as temp_dir:
        project_dir = Path(temp_dir) / "test-project"
        project_dir.mkdir()

        # Create basic project structure
        (project_dir / "web").mkdir()
        (project_dir / ".forge").mkdir()

        yield project_dir

@pytest.fixture
def sample_config():
    """Provide sample configuration data."""
    return {
        "project": {
            "name": "test-project",
            "type": "bedrock"
        },
        "environments": {
            "local": {
                "url": "https://test-project.ddev.site"
            }
        }
    }

@pytest.fixture
def mock_ssh_server():
    """Mock SSH server for testing."""
    server = Mock()
    server.connect.return_value = True
    server.execute_command.return_value = ("output", "", 0)
    return server

@pytest.fixture
def database_connection():
    """Provide test database connection."""
    # Setup test database
    connection = create_test_database()

    yield connection

    # Cleanup
    connection.close()
    drop_test_database()
```

### Using Fixtures in Tests

```python
# tests/unit/test_config.py
def test_config_loading(temp_project_dir, sample_config):
    # Write config to temporary directory
    config_file = temp_project_dir / ".forge" / "config.json"
    config_file.write_text(json.dumps(sample_config))

    # Load and test configuration
    config = load_config(temp_project_dir)

    assert config.project.name == "test-project"
    assert config.environments.local.url == "https://test-project.ddev.site"

def test_ssh_operations(mock_ssh_server):
    # Test SSH operations using mock
    ssh_client = SSHClient(mock_ssh_server)

    result = ssh_client.execute_command("ls -la")

    mock_ssh_server.execute_command.assert_called_once_with("ls -la")
    assert result == "output"
```

## 📈 Test Coverage

### Coverage Requirements

- **Minimum Coverage**: 80% line coverage
- **Target Coverage**: 90%+ line coverage for critical modules
- **Branch Coverage**: 70%+ for complex logic

### Running Coverage Reports

```bash
# Generate HTML coverage report
pytest tests/ --cov=forge --cov-report=html

# Generate terminal coverage report
pytest tests/ --cov=forge --cov-report=term-missing

# Generate XML coverage report (for CI)
pytest tests/ --cov=forge --cov-report=xml

# Coverage with minimum threshold
pytest tests/ --cov=forge --cov-fail-under=80
```

### Coverage Configuration

```ini
# .coveragerc
[run]
source = forge
omit =
    */tests/*
    */migrations/*
    */venv/*
    setup.py

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    if self.debug:
    if settings.DEBUG
    raise AssertionError
    raise NotImplementedError
    if 0:
    if __name__ == .__main__.:
    class .*\bProtocol\):
    @(abc\.)?abstractmethod

[html]
directory = htmlcov
```

### Interpreting Coverage Reports

```bash
# View HTML report
open htmlcov/index.html

# Check missing lines
pytest tests/ --cov=forge --cov-report=term-missing

# Coverage by module
pytest tests/ --cov=forge.commands --cov-report=term-missing
pytest tests/ --cov=forge.provision --cov-report=term-missing
pytest tests/ --cov=forge.utils --cov-report=term-missing
```

## 🔄 Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: [3.9, "3.10", 3.11]

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: test_forge
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

    steps:
    - uses: actions/checkout@v3

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v3
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r forge/requirements.txt
        pip install -r forge/requirements-test.txt

    - name: Run linting
      run: |
        python forge/tests/run_tests.py lint

    - name: Run security tests
      run: |
        python forge/tests/run_tests.py security

    - name: Run tests
      env:
        FORGE_ENV: test
        FORGE_DB_HOST: localhost
        FORGE_DB_NAME: test_forge
        FORGE_DB_USER: root
        FORGE_DB_PASSWORD: root
      run: |
        python forge/tests/run_tests.py all --coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
        flags: unittests
        name: codecov-umbrella
```

### Local CI Testing

```bash
# Run the same checks as CI
python forge/tests/run_tests.py lint
python forge/tests/run_tests.py security
python forge/tests/run_tests.py all --verbose

# Run with specific Python versions
python3.9 -m pytest tests/
python3.10 -m pytest tests/
python3.11 -m pytest tests/
```

## 🎯 Test Best Practices

### 1. Test Organization

```python
# Good: Clear test organization
class TestServerConfig:
    def test_creation_with_valid_data(self):
        pass

    def test_creation_with_invalid_data(self):
        pass

    def test_serialization(self):
        pass

# Bad: Unclear test names and organization
def test_1(self):
    pass

def test_config_stuff(self):
    pass
```

### 2. Test Naming Conventions

```python
# Good: Descriptive test names
def test_server_config_creation_with_minimal_parameters(self):
    pass

def test_server_config_raises_error_when_name_is_empty(self):
    pass

def test_server_config_serialization_includes_all_fields(self):
    pass

# Bad: Vague test names
def test_config(self):
    pass

def test_error(self):
    pass
```

### 3. Arrange-Act-Assert Pattern

```python
def test_deployment_with_backup_rollback_on_failure(self):
    # Arrange
    config = create_deployment_config()
    deployment = EnhancedDeployment(config)
    mock_backup = Mock()
    mock_deploy = Mock(side_effect=Exception("Deployment failed"))

    # Act
    with pytest.raises(DeploymentError):
        deployment.deploy(backup_strategy=mock_backup, deploy_strategy=mock_deploy)

    # Assert
    mock_backup.create.assert_called_once()
    mock_deploy.execute.assert_called_once()
    mock_backup.restore.assert_called_once()
```

### 4. Test Independence

```python
# Good: Tests don't depend on each other
def test_create_project_initializes_config(self):
    project = create_project("test")
    assert project.config is not None

def test_add_environment_adds_to_existing_config(self):
    project = create_project("test")
    project.add_environment("staging")
    assert "staging" in project.config.environments

# Bad: Tests depend on execution order
def test_step_1_create_project(self):
    global project
    project = create_project("test")

def test_step_2_add_environment(self):
    project.add_environment("staging")  # Depends on previous test
```

### 5. Proper Error Testing

```python
# Good: Test specific exceptions and messages
def test_config_validation_raises_specific_error(self):
    with pytest.raises(ValidationError, match="Database host is required"):
        validate_config({"database": {"host": ""}})

# Bad: Generic exception testing
def test_config_validation(self):
    try:
        validate_config(invalid_config)
    except Exception:
        assert True  # Too generic
```

### 6. Effective Mocking

```python
# Good: Specific mock behavior
def test_api_client_handles_timeout(self):
    with patch('forge.utils.api.requests.get') as mock_get:
        mock_get.side_effect = requests.exceptions.Timeout()

        client = APIClient()
        result = client.fetch_data("https://api.example.com")

        assert result is None
        mock_get.assert_called_once()

# Bad: Over-mocking
def test_api_client_with_everything_mocked(self):
    with patch('forge.utils.api.requests.get'), \
         patch('forge.utils.api.requests.post'), \
         patch('forge.utils.api.time.sleep'):
        # What are we actually testing?
        pass
```

## 🐛 Debugging Tests

### Running Tests in Debug Mode

```bash
# Stop on first failure
pytest tests/ -x

# Run with Python debugger
pytest tests/ --pdb

# Show local variables on failure
pytest tests/ -l

# Run specific test with debug output
pytest tests/unit/test_config.py::TestConfig::test_load_config -v -s
```

### Debugging Failed Tests

```bash
# Run only failed tests
pytest --lf

# Run tests with output
pytest tests/ -v -s

# Run with Python debugger on failure
pytest tests/ --pdb -x

# Print debugging information
pytest tests/ --capture=no
```

### Test Debugging Techniques

```python
# Add debug prints
def test_complex_operation(self):
    config = load_config()
    print(f"Config loaded: {config}")

    result = perform_operation(config)
    print(f"Operation result: {result}")

    assert result.success

# Use breakpoint() (Python 3.7+)
def test_deployment_workflow(self):
    deployment = create_deployment()
    breakpoint()  # Execution stops here
    result = deployment.execute()
    assert result.success

# Use pytest's built-in debugging
def test_with_debugging(self):
    import pdb; pdb.set_trace()
    # Test code here
```

### Common Test Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `ImportError` | Python path issues | Run from project root or set PYTHONPATH |
| `ModuleNotFoundError` | Missing dependencies | `pip install -r forge/requirements-test.txt` |
| `AssertionError` | Incorrect expectations | Review test logic and actual behavior |
| `TimeoutError` | Test takes too long | Increase timeout or optimize test |
| `ConnectionError` | Network dependency | Mock network calls or skip in CI |
| `PermissionError` | File permission issues | Run with appropriate permissions |
| `DatabaseError` | Database not available | Use test database or mock |

---

## 🚀 Advanced Testing Topics

### Property-Based Testing

```python
import hypothesis
from hypothesis import given, strategies as st

@given(st.text(min_size=1, max_size=50))
def test_upper_case_property(text):
    result = upper_case(text)
    assert len(result) == len(text)
    assert result.isupper()
    assert result.lower() == text

@given(st.lists(st.integers()))
def test_sort_property(numbers):
    result = sorted(numbers)
    assert len(result) == len(numbers)
    assert all(result[i] <= result[i+1] for i in range(len(result)-1))
```

### Performance Testing

```python
import time
import pytest

@pytest.mark.performance
def test_deployment_performance():
    start_time = time.time()

    deployment = create_deployment()
    result = deployment.execute()

    end_time = time.time()
    duration = end_time - start_time

    assert result.success
    assert duration < 30.0  # Should complete within 30 seconds
```

### Load Testing

```python
import asyncio
import pytest

@pytest.mark.load
async def test_concurrent_deployments():
    tasks = [
        deploy_project_async(f"project-{i}")
        for i in range(10)
    ]

    results = await asyncio.gather(*tasks)

    assert len(results) == 10
    assert all(r.success for r in results)
```

For more information about testing tools and techniques, see:
- [Development Guide](DEVELOPMENT.md)
- [API Documentation](API.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
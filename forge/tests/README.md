# Bedrock Forge Testing Suite

This directory contains the comprehensive testing suite for the bedrock-forge project.

## Overview

The testing suite includes:
- **Unit tests**: Test individual modules and functions
- **Integration tests**: Test complete workflows and interactions
- **Mock utilities**: Mock external services and APIs
- **Test fixtures**: Sample data and configurations
- **CI/CD configuration**: GitHub Actions workflow

## Structure

```
tests/
├── README.md                     # This file
├── conftest.py                   # Pytest configuration and shared fixtures
├── run_tests.py                  # Test runner script
├── fixtures/                     # Test data and fixtures
│   ├── test_config.json
│   ├── sample_wordpress_project.json
│   ├── mock_server_responses.json
│   └── sample_wordpress_files.php
├── unit/                         # Unit tests
│   ├── test_provision_core.py
│   ├── test_utils_shell.py
│   ├── test_utils_config.py
│   ├── test_enhanced_deployment.py
│   └── test_sync_commands.py
├── integration/                  # Integration tests
│   └── test_deployment_workflow.py
└── mocks/                        # Mock utilities
    ├── mock_hetzner.py
    ├── mock_cloudflare.py
    └── mock_ssh_ftp.py
```

## Running Tests

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

### Using pytest directly

```bash
# Run all tests
cd forge
pytest tests/

# Run unit tests only
pytest tests/unit/ -m "not integration"

# Run integration tests only
pytest tests/integration/ -m "integration"

# Run with coverage
pytest tests/ --cov=forge --cov-report=html

# Run specific test file
pytest tests/unit/test_provision_core.py

# Run specific test function
pytest tests/unit/test_provision_core.py::TestServerConfig::test_server_config_creation
```

### Test Categories

- **unit**: Tests for individual functions and classes
- **integration**: Tests for complete workflows
- **cli**: Tests for command-line interface
- **provisioning**: Tests related to server provisioning
- **deployment**: Tests related to deployment functionality
- **backup**: Tests related to backup operations
- **slow**: Tests that take longer to run
- **external**: Tests requiring external services (mocked in CI)

## Configuration

### Pytest Configuration

The `pytest.ini` file in the project root configures:
- Test paths and patterns
- Coverage settings (80% minimum)
- Custom markers
- Warning filters
- Output formatting

### Environment Variables

Tests use these environment variables:
- `FORGE_ENV=test`: Set test environment
- `FORGE_LOG_LEVEL=DEBUG`: Enable debug logging
- `CI`: Indicates running in CI environment

## Mocking

### External Services

The test suite includes comprehensive mocks for:
- **Hetzner Cloud API**: Server creation and management
- **Cloudflare API**: DNS and SSL management
- **SSH/FTP servers**: Remote server connections
- **rclone operations**: Cloud storage operations

### Usage Examples

```python
from tests.mocks.mock_hetzner import HetznerMockPatcher

# Use mock Hetzner client
with HetznerMockPatcher() as hetzner_client:
    # Your test code here
    hetzner_client.mock_server.status = "running"
    # ... test code
```

## Test Fixtures

### Sample Data

- `test_config.json`: Sample configuration
- `sample_wordpress_project.json`: Sample WordPress project metadata
- `mock_server_responses.json`: Mock API responses
- `sample_wordpress_files.php`: Sample WordPress file contents

### Shared Fixtures

`conftest.py` provides shared fixtures:
- `temp_dir`: Temporary directory for tests
- `temp_project_dir`: Temporary WordPress project structure
- `sample_server_config`: Sample server configuration
- `mock_ssh_client`: Mock SSH connection
- `mock_ftp_connection`: Mock FTP connection

## Coverage

### Target Coverage

- **Minimum**: 80% line coverage
- **Goal**: 90%+ line coverage for critical modules

### Coverage Reports

Coverage reports are generated in:
- `htmlcov/index.html`: Interactive HTML report
- `coverage.xml`: Machine-readable XML report
- Terminal output: Summary with missing lines

### Exclusions

The following are excluded from coverage:
- Test files themselves
- Mock and fixture files
- Configuration files
- Migration scripts

## CI/CD Integration

### GitHub Actions

The `.github/workflows/test.yml` workflow:
- Runs tests on Python 3.9, 3.10, 3.11
- Includes MySQL service for database tests
- Uploads coverage to Codecov
- Runs linting and security checks
- Caches pip dependencies

### Local CI Testing

```bash
# Run the same checks as CI
python forge/tests/run_tests.py lint
python forge/tests/run_tests.py security
python forge/tests/run_tests.py all --verbose
```

## Writing Tests

### Unit Test Example

```python
import pytest
from unittest.mock import Mock, patch
from forge.provision.core import ServerConfig

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

    def test_server_config_with_defaults(self):
        config = ServerConfig(
            name="test-server",
            ip_address="192.168.1.100",
            domain="test.example.com"
        )

        assert config.ssh_port == 22  # Default value
        assert config.web_server == WebServer.NGINX  # Default value
```

### Integration Test Example

```python
def test_complete_deployment_workflow(self):
    with HetznerMockPatcher() as hetzner_client, \
         SSHMockPatcher() as ssh_server, \
         RsyncMockPatcher() as rsync_op:

        # Set up mocks
        hetzner_client.mock_server.status = "running"
        ssh_server.default_connection.connected = True
        rsync_op.simulate_success()

        # Test deployment workflow
        deployment = EnhancedDeployment(server_config, deployment_config)
        result = deployment.deploy()

        assert result.success is True
        assert "Deployment completed successfully" in result.message
```

## Debugging Tests

### Running Tests in Debug Mode

```bash
# Stop on first failure
pytest tests/ -x

# Run with Python debugger
pytest tests/ --pdb

# Show local variables on failure
pytest tests/ -l

# Run specific test with debug output
pytest tests/unit/test_provision_core.py::TestServerConfig::test_server_config_creation -v -s
```

### Common Issues

1. **Import errors**: Ensure you're running from the project root
2. **Missing fixtures**: Check `conftest.py` for available fixtures
3. **Mock not applied**: Use proper context managers for mocks
4. **Async tests**: Use `@pytest.mark.asyncio` decorator

## Best Practices

### General Guidelines

1. **Test one thing**: Each test should verify one specific behavior
2. **Use descriptive names**: Test function names should describe what they test
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock external dependencies**: Don't make real network calls
5. **Clean up after tests**: Use fixtures for setup/teardown

### Naming Conventions

```python
# Good test names
def test_server_config_creation_with_default_values():
def test_deployment_fails_when_ssh_connection_is_lost():
def test_backup_excludes_node_modules_directory():

# Bad test names
def test_config():
def test_deployment():
def test_backup():
```

### Test Organization

- Group related tests in classes
- Use markers to categorize tests
- Keep test files focused on specific modules
- Use descriptive docstrings for complex tests

## Performance

### Test Speed

- Unit tests should run in milliseconds
- Integration tests may take seconds
- Mark slow tests with `@pytest.mark.slow`
- Use mocks to avoid expensive operations

### Parallel Testing

```bash
# Run tests in parallel
pytest tests/ -n auto

# Run specific tests in parallel
pytest tests/unit/ -n 4
```

## Troubleshooting

### Common Test Failures

1. **Coverage below threshold**: Add tests for uncovered code
2. **Import errors**: Check Python path and dependencies
3. **Mock failures**: Verify mock setup and usage
4. **Timeout errors**: Increase timeout or optimize tests

### Getting Help

- Check existing test examples
- Review pytest documentation
- Look at similar test files
- Use debug output to understand failures

## Contributing

When adding new features:

1. Write tests before or alongside implementation
2. Ensure 80%+ coverage for new code
3. Add appropriate mocks for external dependencies
4. Update fixtures if needed
5. Document complex test scenarios

Run the full test suite before submitting:

```bash
python forge/tests/run_tests.py all --verbose
python forge/tests/run_tests.py lint
python forge/tests/run_tests.py security
```
"""
Legacy error handling for Forge CLI.

This module maintains backward compatibility while transitioning to the new exception hierarchy.
New code should import from forge.utils.exceptions instead.
"""

from .exceptions import (
    ForgeException,
    ConfigurationError,
    CredentialError,
    ProviderError,
    ConnectionError,
    DeploymentError,
    ValidationError,
    AuthenticationError,
    PermissionError,
    ResourceNotFoundError,
    TimeoutError,
    DependencyError,
    RetryableError,
    TemporaryNetworkError,
    ServiceUnavailableError,
    FatalError,
    wrap_exception,
    suggest_fix,
    format_error_for_display,
    ErrorSeverity
)

# Legacy alias for backward compatibility
ForgeError = ForgeException

__all__ = [
    'ForgeError',  # Legacy alias
    'ForgeException',
    'ConfigurationError',
    'CredentialError',
    'ProviderError',
    'ConnectionError',
    'DeploymentError',
    'ValidationError',
    'AuthenticationError',
    'PermissionError',
    'ResourceNotFoundError',
    'TimeoutError',
    'DependencyError',
    'RetryableError',
    'TemporaryNetworkError',
    'ServiceUnavailableError',
    'FatalError',
    'wrap_exception',
    'suggest_fix',
    'format_error_for_display',
    'ErrorSeverity'
]
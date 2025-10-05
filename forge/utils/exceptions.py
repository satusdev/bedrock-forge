"""
Custom exception hierarchy for Forge CLI.

This module defines a comprehensive exception hierarchy for different types of errors
that can occur during server provisioning and deployment operations.
"""

from typing import Optional, Dict, Any, List
from enum import Enum


class ErrorSeverity(Enum):
    """Error severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ForgeException(Exception):
    """Base exception for all Forge-related errors."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
        suggestions: Optional[List[str]] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.severity = severity
        self.details = details or {}
        self.cause = cause
        self.suggestions = suggestions or []

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for logging/serialization."""
        return {
            'type': self.__class__.__name__,
            'message': self.message,
            'error_code': self.error_code,
            'severity': self.severity.value,
            'details': self.details,
            'suggestions': self.suggestions,
            'cause': str(self.cause) if self.cause else None
        }


class ConfigurationError(ForgeException):
    """Raised when there's a configuration issue."""

    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        config_file: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if config_key:
            details['config_key'] = config_key
        if config_file:
            details['config_file'] = config_file

        super().__init__(message, error_code="CONFIG_ERROR", **kwargs)


class CredentialError(ForgeException):
    """Raised when there's an issue with credentials."""

    def __init__(
        self,
        message: str,
        provider: Optional[str] = None,
        credential_type: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if provider:
            details['provider'] = provider
        if credential_type:
            details['credential_type'] = credential_type

        super().__init__(message, error_code="CREDENTIAL_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class ProviderError(ForgeException):
    """Raised when there's an issue with a cloud provider."""

    def __init__(
        self,
        message: str,
        provider: Optional[str] = None,
        operation: Optional[str] = None,
        resource_id: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if provider:
            details['provider'] = provider
        if operation:
            details['operation'] = operation
        if resource_id:
            details['resource_id'] = resource_id

        super().__init__(message, error_code="PROVIDER_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class ConnectionError(ForgeException):
    """Raised when there's a connection issue (SSH, FTP, etc.)."""

    def __init__(
        self,
        message: str,
        host: Optional[str] = None,
        port: Optional[int] = None,
        protocol: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if host:
            details['host'] = host
        if port:
            details['port'] = port
        if protocol:
            details['protocol'] = protocol

        super().__init__(message, error_code="CONNECTION_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class DeploymentError(ForgeException):
    """Raised when there's an issue during deployment."""

    def __init__(
        self,
        message: str,
        deployment_method: Optional[str] = None,
        stage: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if deployment_method:
            details['deployment_method'] = deployment_method
        if stage:
            details['stage'] = stage

        super().__init__(message, error_code="DEPLOYMENT_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class ValidationError(ForgeException):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        value: Optional[Any] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if field:
            details['field'] = field
        if value is not None:
            details['value'] = str(value)

        super().__init__(message, error_code="VALIDATION_ERROR", severity=ErrorSeverity.LOW, **kwargs)


class AuthenticationError(ForgeException):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str,
        service: Optional[str] = None,
        username: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if service:
            details['service'] = service
        if username:
            details['username'] = username

        super().__init__(message, error_code="AUTH_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class PermissionError(ForgeException):
    """Raised when there's a permission issue."""

    def __init__(
        self,
        message: str,
        resource: Optional[str] = None,
        action: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if resource:
            details['resource'] = resource
        if action:
            details['action'] = action

        super().__init__(message, error_code="PERMISSION_ERROR", severity=ErrorSeverity.HIGH, **kwargs)


class ResourceNotFoundError(ForgeException):
    """Raised when a required resource is not found."""

    def __init__(
        self,
        message: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if resource_type:
            details['resource_type'] = resource_type
        if resource_id:
            details['resource_id'] = resource_id

        super().__init__(message, error_code="RESOURCE_NOT_FOUND", severity=ErrorSeverity.MEDIUM, **kwargs)


class TimeoutError(ForgeException):
    """Raised when an operation times out."""

    def __init__(
        self,
        message: str,
        timeout_seconds: Optional[int] = None,
        operation: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if timeout_seconds:
            details['timeout_seconds'] = timeout_seconds
        if operation:
            details['operation'] = operation

        super().__init__(message, error_code="TIMEOUT_ERROR", severity=ErrorSeverity.MEDIUM, **kwargs)


class DependencyError(ForgeException):
    """Raised when there's a missing dependency."""

    def __init__(
        self,
        message: str,
        dependency: Optional[str] = None,
        version: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.get('details', {})
        if dependency:
            details['dependency'] = dependency
        if version:
            details['version'] = version

        suggestions = kwargs.get('suggestions', [])
        if dependency:
            suggestions.append(f"Install {dependency}")
            if version:
                suggestions.append(f"Required version: {version}")

        kwargs['suggestions'] = suggestions
        super().__init__(message, error_code="DEPENDENCY_ERROR", severity=ErrorSeverity.MEDIUM, **kwargs)


class RetryableError(ForgeException):
    """Base class for errors that can be retried."""

    def __init__(
        self,
        message: str,
        max_retries: int = 3,
        retry_delay: int = 5,
        **kwargs
    ):
        details = kwargs.get('details', {})
        details['max_retries'] = max_retries
        details['retry_delay'] = retry_delay

        suggestions = kwargs.get('suggestions', [])
        suggestions.append(f"Retry the operation (max {max_retries} times)")
        suggestions.append(f"Wait {retry_delay} seconds between retries")

        kwargs['details'] = details
        kwargs['suggestions'] = suggestions
        super().__init__(message, **kwargs)


class TemporaryNetworkError(RetryableError):
    """Raised for temporary network issues."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            error_code="TEMPORARY_NETWORK_ERROR",
            max_retries=5,
            retry_delay=10,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )


class ServiceUnavailableError(RetryableError):
    """Raised when a service is temporarily unavailable."""

    def __init__(self, message: str, service: Optional[str] = None, **kwargs):
        details = kwargs.get('details', {})
        if service:
            details['service'] = service

        kwargs['details'] = details
        super().__init__(
            message,
            error_code="SERVICE_UNAVAILABLE",
            max_retries=3,
            retry_delay=30,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )


class FatalError(ForgeException):
    """Raised for unrecoverable errors that should stop execution."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            error_code="FATAL_ERROR",
            severity=ErrorSeverity.CRITICAL,
            **kwargs
        )


def wrap_exception(
    original_exception: Exception,
    message: str,
    error_type: type = ForgeException,
    **kwargs
) -> ForgeException:
    """Wrap a generic exception in a Forge exception."""
    if isinstance(original_exception, ForgeException):
        return original_exception

    return error_type(
        message,
        cause=original_exception,
        **kwargs
    )


def suggest_fix(error_type: str) -> List[str]:
    """Get suggested fixes for common error types."""
    suggestions = {
        'CONNECTION_ERROR': [
            "Check network connectivity",
            "Verify the host and port are correct",
            "Check firewall settings",
            "Ensure the service is running"
        ],
        'AUTH_ERROR': [
            "Verify credentials are correct",
            "Check if the account is active",
            "Ensure proper permissions are set",
            "Try regenerating API tokens"
        ],
        'CREDENTIAL_ERROR': [
            "Set the required environment variables",
            "Run 'forge config setup --interactive'",
            "Check credential file permissions",
            "Verify API token validity"
        ],
        'DEPENDENCY_ERROR': [
            "Install the missing dependency using pip",
            "Check the requirements.txt file",
            "Ensure you're using the correct Python environment",
            "Update package indexes"
        ],
        'VALIDATION_ERROR': [
            "Check the input format",
            "Verify all required fields are provided",
            "Check the help text for correct usage",
            "Ensure values are within allowed ranges"
        ],
        'TIMEOUT_ERROR': [
            "Increase timeout values",
            "Check network stability",
            "Try the operation again",
            "Verify the service is not overloaded"
        ]
    }

    return suggestions.get(error_type, ["Check the error details and try again"])


def format_error_for_display(exception: ForgeException) -> str:
    """Format an exception for user-friendly display."""
    output = [f"❌ {exception.message}"]

    if exception.error_code:
        output.append(f"Error Code: {exception.error_code}")

    if exception.details:
        output.append("\nDetails:")
        for key, value in exception.details.items():
            output.append(f"  {key}: {value}")

    if exception.suggestions:
        output.append("\nSuggestions:")
        for suggestion in exception.suggestions:
            output.append(f"  • {suggestion}")

    if exception.cause and exception.severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]:
        output.append(f"\nCaused by: {exception.cause}")

    return "\n".join(output)
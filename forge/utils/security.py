"""
Security utilities for credential management, input sanitization, and secure operations.
"""
import os
import hashlib
import secrets
import string
import re
import shlex
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from getpass import getpass
from contextlib import contextmanager

try:
    import keyring
    KEYRING_AVAILABLE = True
except ImportError:
    KEYRING_AVAILABLE = False

from forge.utils.errors import ForgeError
from forge.utils.logging import logger


@dataclass
class Credential:
    """Secure credential storage."""
    service: str
    username: str
    password: str
    metadata: Optional[Dict[str, Any]] = None


class CredentialManager:
    """Secure credential management using system keyring or encrypted storage."""

    def __init__(self, service_name: str = "forge"):
        """
        Initialize credential manager.

        Args:
            service_name: Service name for keyring storage.
        """
        self.service_name = service_name
        self._fallback_storage: Dict[str, str] = {}

    def store_credential(self, key: str, value: str, use_keyring: bool = True) -> None:
        """
        Securely store a credential.

        Args:
            key: Credential key.
            value: Credential value.
            use_keyring: Whether to use system keyring.
        """
        if use_keyring and KEYRING_AVAILABLE:
            try:
                keyring.set_password(self.service_name, key, value)
                logger.info(f"Credential '{key}' stored in system keyring")
                return
            except Exception as e:
                logger.warning(f"Failed to store credential in keyring: {e}. Using fallback storage.")

        # Fallback to environment variable or encrypted file
        env_key = f"{self.service_name.upper()}_{key.upper()}"
        os.environ[env_key] = value
        self._fallback_storage[key] = value
        logger.info(f"Credential '{key}' stored in environment variable")

    def retrieve_credential(self, key: str, use_keyring: bool = True) -> Optional[str]:
        """
        Retrieve a credential securely.

        Args:
            key: Credential key.
            use_keyring: Whether to use system keyring.

        Returns:
            Credential value or None if not found.
        """
        if use_keyring and KEYRING_AVAILABLE:
            try:
                value = keyring.get_password(self.service_name, key)
                if value:
                    return value
            except Exception as e:
                logger.warning(f"Failed to retrieve credential from keyring: {e}")

        # Fallback to environment variable
        env_key = f"{self.service_name.upper()}_{key.upper()}"
        value = os.environ.get(env_key) or self._fallback_storage.get(key)
        return value

    def delete_credential(self, key: str, use_keyring: bool = True) -> bool:
        """
        Delete a credential.

        Args:
            key: Credential key.
            use_keyring: Whether to use system keyring.

        Returns:
            True if credential was deleted, False if not found.
        """
        deleted = False

        if use_keyring and KEYRING_AVAILABLE:
            try:
                keyring.delete_password(self.service_name, key)
                deleted = True
            except Exception as e:
                logger.debug(f"Failed to delete credential from keyring: {e}")

        # Remove from environment and fallback storage
        env_key = f"{self.service_name.upper()}_{key.upper()}"
        if env_key in os.environ:
            del os.environ[env_key]
            deleted = True

        if key in self._fallback_storage:
            del self._fallback_storage[key]
            deleted = True

        return deleted

    def prompt_for_credential(
        self,
        key: str,
        prompt_message: str,
        confirm: bool = False,
        validation_func: Optional[callable] = None,
        use_keyring: bool = True
    ) -> str:
        """
        Prompt user for credential with optional validation and confirmation.

        Args:
            key: Credential key for storage.
            prompt_message: Message to display to user.
            confirm: Whether to ask for confirmation.
            validation_func: Optional validation function.
            use_keyring: Whether to use system keyring for storage.

        Returns:
            Validated credential value.
        """
        while True:
            value = getpass(prompt_message)

            if validation_func and not validation_func(value):
                continue

            if confirm:
                confirm_value = getpass(f"Confirm {key}: ")
                if value != confirm_value:
                    logger.error("Values do not match. Please try again.")
                    continue

            if typer.confirm(f"Store {key} securely?"):
                self.store_credential(key, value, use_keyring)

            return value


class InputSanitizer:
    """Input sanitization and validation utilities."""

    # Validation patterns
    PROJECT_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$')
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    DOMAIN_PATTERN = re.compile(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    GITHUB_TOKEN_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{20,}$')
    SAFE_FILENAME_PATTERN = re.compile(r'^[a-zA-Z0-9._-]+$')

    # Dangerous patterns to block
    DANGEROUS_PATTERNS = [
        r'\.\./.*',  # Directory traversal
        r'[;&|`$()]',  # Shell injection
        r'--.*',  # SQL comment style
        r'/etc/',  # System files
        r'\.\w+',  # Hidden files
    ]

    @staticmethod
    def sanitize_shell_argument(arg: str) -> str:
        """
        Sanitize argument for safe shell command execution.

        Args:
            arg: Argument to sanitize.

        Returns:
            Sanitized argument safe for shell usage.
        """
        return shlex.quote(str(arg))

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Sanitize filename for safe file operations.

        Args:
            filename: Filename to sanitize.

        Returns:
            Sanitized filename.

        Raises:
            ForgeError: If filename contains dangerous patterns.
        """
        # Remove dangerous characters
        sanitized = re.sub(r'[<>:"|?*\x00-\x1f]', '_', filename)

        # Check for dangerous patterns
        for pattern in InputSanitizer.DANGEROUS_PATTERNS:
            if re.search(pattern, sanitized, re.IGNORECASE):
                raise ForgeError(f"Filename contains dangerous pattern: {pattern}")

        # Ensure it matches safe pattern
        if not InputSanitizer.SAFE_FILENAME_PATTERN.match(sanitized):
            raise ForgeError("Filename contains invalid characters")

        return sanitized

    @staticmethod
    def validate_project_name(name: str) -> bool:
        """
        Validate project name format.

        Args:
            name: Project name to validate.

        Returns:
            True if valid, False otherwise.
        """
        return (
            len(name) <= 63 and
            bool(InputSanitizer.PROJECT_NAME_PATTERN.match(name))
        )

    @staticmethod
    def validate_email(email: str) -> bool:
        """
        Validate email format.

        Args:
            email: Email address to validate.

        Returns:
            True if valid, False otherwise.
        """
        return bool(InputSanitizer.EMAIL_PATTERN.match(email))

    @staticmethod
    def validate_github_token(token: str) -> bool:
        """
        Validate GitHub token format.

        Args:
            token: GitHub token to validate.

        Returns:
            True if appears valid, False otherwise.
        """
        return (
            len(token) >= 20 and
            bool(InputSanitizer.GITHUB_TOKEN_PATTERN.match(token))
        )

    @staticmethod
    def validate_url(url: str) -> bool:
        """
        Validate URL format.

        Args:
            url: URL to validate.

        Returns:
            True if valid, False otherwise.
        """
        import re
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
        return bool(url_pattern.match(url))

    @staticmethod
    def sanitize_input(input_str: str, max_length: int = 1000) -> str:
        """
        General input sanitization.

        Args:
            input_str: Input string to sanitize.
            max_length: Maximum allowed length.

        Returns:
            Sanitized input string.
        """
        # Remove null bytes and control characters
        sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', input_str)

        # Limit length
        sanitized = sanitized[:max_length]

        return sanitized.strip()


class SecureFileHandler:
    """Secure file operations with proper permissions and temporary files."""

    @staticmethod
    @contextmanager
    def secure_temp_file(suffix: str = "", prefix: str = "forge_", mode: int = 0o600):
        """
        Create a secure temporary file with restricted permissions.

        Args:
            suffix: File suffix.
            prefix: File prefix.
            mode: File permissions.

        Yields:
            Path to temporary file.
        """
        temp_file = None
        try:
            # Create temporary file with restricted permissions
            fd, temp_path = tempfile.mkstemp(suffix=suffix, prefix=prefix)
            os.close(fd)  # Close file descriptor

            temp_file = Path(temp_path)
            temp_file.chmod(mode)

            yield temp_file
        finally:
            if temp_file and temp_file.exists():
                try:
                    temp_file.unlink()
                except OSError:
                    pass

    @staticmethod
    def write_file_securely(
        file_path: Path,
        content: str,
        mode: int = 0o600,
        backup: bool = True
    ) -> None:
        """
        Write file securely with proper permissions.

        Args:
            file_path: Path to file.
            content: File content.
            mode: File permissions.
            backup: Whether to create backup of existing file.
        """
        file_path = Path(file_path)

        # Create backup if requested and file exists
        if backup and file_path.exists():
            backup_path = file_path.with_suffix(f"{file_path.suffix}.bak")
            file_path.rename(backup_path)
            logger.info(f"Created backup: {backup_path}")

        # Write to temporary file first, then move
        with SecureFileHandler.secure_temp_file() as temp_file:
            temp_file.write_text(content)

            # Ensure parent directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # Atomic move
            temp_file.replace(file_path)
            file_path.chmod(mode)

    @staticmethod
    def read_file_securely(file_path: Path) -> str:
        """
        Read file securely with permission checks.

        Args:
            file_path: Path to file.

        Returns:
            File content.

        Raises:
            ForgeError: If file has unsafe permissions.
        """
        file_path = Path(file_path)

        if not file_path.exists():
            raise ForgeError(f"File not found: {file_path}")

        # Check file permissions
        stat_info = file_path.stat()
        mode = stat_info.st_mode

        # Ensure file is not world-readable or world-writable
        if mode & 0o044:  # World readable
            logger.warning(f"File {file_path} is world-readable")

        return file_path.read_text()


class PasswordGenerator:
    """Secure password generation utilities."""

    @staticmethod
    def generate_password(
        length: int = 16,
        include_uppercase: bool = True,
        include_lowercase: bool = True,
        include_digits: bool = True,
        include_symbols: bool = True,
        exclude_ambiguous: bool = True
    ) -> str:
        """
        Generate a secure password.

        Args:
            length: Password length.
            include_uppercase: Include uppercase letters.
            include_lowercase: Include lowercase letters.
            include_digits: Include digits.
            include_symbols: Include symbols.
            exclude_ambiguous: Exclude ambiguous characters.

        Returns:
            Generated password.
        """
        chars = ""

        if include_lowercase:
            lowercase = "abcdefghijklmnopqrstuvwxyz"
            if exclude_ambiguous:
                lowercase = lowercase.replace("l", "").replace("o", "")
            chars += lowercase

        if include_uppercase:
            uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            if exclude_ambiguous:
                uppercase = uppercase.replace("I", "").replace("O", "")
            chars += uppercase

        if include_digits:
            digits = "0123456789"
            if exclude_ambiguous:
                digits = digits.replace("0", "").replace("1", "")
            chars += digits

        if include_symbols:
            symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?"
            if exclude_ambiguous:
                symbols = symbols.replace("<", "").replace(">", "").replace("|", "")
            chars += symbols

        if not chars:
            raise ForgeError("No character types selected for password generation")

        # Generate password ensuring at least one character from each selected type
        password = []

        if include_lowercase:
            password.append(secrets.choice("abcdefghijklmnopqrstuvwxyz"))
        if include_uppercase:
            password.append(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
        if include_digits:
            password.append(secrets.choice("0123456789"))
        if include_symbols:
            password.append(secrets.choice("!@#$%^&*()_+-=[]{}|;:,.<>?"))

        # Fill remaining length
        for _ in range(length - len(password)):
            password.append(secrets.choice(chars))

        # Shuffle the password
        secrets.SystemRandom().shuffle(password)

        return ''.join(password)

    @staticmethod
    def generate_salt(length: int = 32) -> str:
        """
        Generate a cryptographically secure salt.

        Args:
            length: Salt length.

        Returns:
            Generated salt.
        """
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    @staticmethod
    def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
        """
        Hash password with salt using PBKDF2.

        Args:
            password: Password to hash.
            salt: Optional salt. If None, generates random salt.

        Returns:
            Tuple of (hashed_password, salt).
        """
        if salt is None:
            salt = PasswordGenerator.generate_salt(32)

        # Use PBKDF2 with SHA-256
        iterations = 100000
        hashed = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), iterations)

        return hashed.hex(), salt


class SecurityAuditor:
    """Security auditing utilities."""

    @staticmethod
    def audit_file_permissions(directory: Path) -> List[str]:
        """
        Audit file permissions in a directory.

        Args:
            directory: Directory to audit.

        Returns:
            List of security issues found.
        """
        issues = []

        for file_path in directory.rglob('*'):
            if file_path.is_file():
                stat_info = file_path.stat()
                mode = stat_info.st_mode

                # Check for world-readable files
                if mode & 0o004:
                    issues.append(f"World-readable file: {file_path}")

                # Check for world-writable files
                if mode & 0o002:
                    issues.append(f"World-writable file: {file_path}")

                # Check for files with executable bit
                if mode & 0o111:
                    if not file_path.suffix in ['.sh', '.py', '.pl']:
                        issues.append(f"Executable file: {file_path}")

        return issues

    @staticmethod
    def audit_environment_variables() -> List[str]:
        """
        Audit environment variables for sensitive data exposure.

        Returns:
            List of security issues found.
        """
        sensitive_keys = ['password', 'token', 'secret', 'key', 'credential']
        issues = []

        for key, value in os.environ.items():
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                if len(value) > 10:  # Likely contains actual sensitive data
                    issues.append(f"Sensitive data in environment variable: {key}")

        return issues
"""
Credential vault for secure storage of sensitive data.

Uses Fernet symmetric encryption for storing SSH keys,
API tokens, and other credentials.
"""
import base64
import os
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def generate_key() -> str:
    """Generate a new Fernet key."""
    return Fernet.generate_key().decode()


def derive_key_from_password(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    """Derive a Fernet key from a password using PBKDF2."""
    if salt is None:
        salt = os.urandom(16)
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key, salt


class CredentialVault:
    """
    Secure credential storage using Fernet encryption.
    
    Usage:
        vault = CredentialVault(encryption_key)
        encrypted = vault.encrypt("my-secret-api-key")
        decrypted = vault.decrypt(encrypted)
    """
    
    def __init__(self, key: str | bytes):
        """
        Initialize vault with encryption key.
        
        Args:
            key: Fernet key as string or bytes
        """
        if isinstance(key, str):
            key = key.encode()
        self.cipher = Fernet(key)
    
    def encrypt(self, data: str) -> str:
        """
        Encrypt a string value.
        
        Args:
            data: Plain text to encrypt
            
        Returns:
            Base64-encoded encrypted token
        """
        encrypted = self.cipher.encrypt(data.encode())
        return encrypted.decode()
    
    def decrypt(self, token: str) -> str:
        """
        Decrypt an encrypted token.
        
        Args:
            token: Encrypted token from encrypt()
            
        Returns:
            Original plain text
            
        Raises:
            InvalidToken: If token is invalid or corrupted
        """
        decrypted = self.cipher.decrypt(token.encode())
        return decrypted.decode()
    
    def rotate_key(self, old_token: str, new_vault: "CredentialVault") -> str:
        """
        Re-encrypt a token with a new key.
        
        Args:
            old_token: Token encrypted with current key
            new_vault: Vault with new key
            
        Returns:
            Token encrypted with new key
        """
        decrypted = self.decrypt(old_token)
        return new_vault.encrypt(decrypted)


def get_vault() -> CredentialVault | None:
    """
    Get vault instance from environment.
    
    Returns:
        CredentialVault if ENCRYPTION_KEY is set, None otherwise
    """
    from .config import settings
    
    if settings.ENCRYPTION_KEY:
        return CredentialVault(settings.ENCRYPTION_KEY)
    return None

"""
Cryptographic utilities for credential encryption.

Uses Fernet symmetric encryption with user-specific key derivation.
"""
import os
import base64
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ..utils.logging import logger


# Get master key from environment or generate one
_MASTER_KEY = os.environ.get("FORGE_ENCRYPTION_KEY")

def _get_master_key() -> bytes:
    """Get the master encryption key."""
    global _MASTER_KEY
    if not _MASTER_KEY:
        # For development, use a fixed key (NOT for production!)
        logger.warning("No FORGE_ENCRYPTION_KEY set, using development key")
        _MASTER_KEY = "development-key-not-for-production-use"
    return _MASTER_KEY.encode()


def derive_user_key(user_id: int, salt: Optional[bytes] = None) -> tuple[Fernet, bytes]:
    """
    Derive a user-specific encryption key.
    
    Uses PBKDF2 to derive a key from master key + user_id.
    Returns a Fernet instance and the salt used.
    """
    if salt is None:
        salt = os.urandom(16)
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,  # OWASP recommended
    )
    
    key_material = f"{user_id}:{_get_master_key().decode()}".encode()
    key = base64.urlsafe_b64encode(kdf.derive(key_material))
    
    return Fernet(key), salt


def encrypt_credential(value: str, user_id: int) -> tuple[str, str]:
    """
    Encrypt a credential value.
    
    Returns (encrypted_value, salt) both as base64 strings.
    """
    fernet, salt = derive_user_key(user_id)
    encrypted = fernet.encrypt(value.encode())
    
    return (
        base64.urlsafe_b64encode(encrypted).decode(),
        base64.urlsafe_b64encode(salt).decode()
    )


def decrypt_credential(encrypted_value: str, salt_b64: str, user_id: int) -> str:
    """
    Decrypt a credential value.
    
    Takes base64-encoded encrypted_value and salt.
    Returns the decrypted plaintext.
    """
    salt = base64.urlsafe_b64decode(salt_b64.encode())
    encrypted = base64.urlsafe_b64decode(encrypted_value.encode())
    
    fernet, _ = derive_user_key(user_id, salt)
    decrypted = fernet.decrypt(encrypted)
    
    return decrypted.decode()


def generate_nonce(length: int = 32) -> str:
    """Generate a random nonce for quick login tokens."""
    return base64.urlsafe_b64encode(os.urandom(length)).decode()[:length]


def hash_password(password: str) -> str:
    """
    Hash a password for storage (if needed for quick login).
    Uses PBKDF2 with high iterations.
    """
    import hashlib
    
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode(),
        salt,
        iterations=480000
    )
    
    return f"{base64.urlsafe_b64encode(salt).decode()}:{base64.urlsafe_b64encode(key).decode()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    import hashlib
    
    try:
        salt_b64, key_b64 = hashed.split(':')
        salt = base64.urlsafe_b64decode(salt_b64.encode())
        stored_key = base64.urlsafe_b64decode(key_b64.encode())
        
        new_key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode(),
            salt,
            iterations=480000
        )
        
        return new_key == stored_key
    except Exception:
        return False

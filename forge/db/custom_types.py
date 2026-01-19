from sqlalchemy.types import TypeDecorator, String
from cryptography.fernet import Fernet
from ..core.config import settings

# Initialize Fernet suite if key is available
fernet = None
if hasattr(settings, 'ENCRYPTION_KEY') and settings.ENCRYPTION_KEY:
    try:
        fernet = Fernet(settings.ENCRYPTION_KEY)
    except Exception:
        # Fallback for invalid keys or dev environments without keys
        pass

class EncryptedString(TypeDecorator):
    """Encrypted string type for storing sensitive data."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value and fernet:
            return fernet.encrypt(value.encode()).decode()
        return value

    def process_result_value(self, value, dialect):
        if value and fernet:
            try:
                return fernet.decrypt(value.encode()).decode()
            except Exception:
                # Return raw value if decryption fails (e.g. key changed or legacy data)
                return value
        return value

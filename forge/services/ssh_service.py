import paramiko
from io import StringIO
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Tuple
import logging

from forge.db.models.app_setting import AppSetting
from forge.utils.errors import ForgeError

logger = logging.getLogger(__name__)

class SSHKeyService:
    """Service for managing the system-wide SSH identity."""

    KEY_PRIVATE = "system.ssh.private_key"
    KEY_PUBLIC = "system.ssh.public_key"

    @classmethod
    async def set_system_key(cls, db: AsyncSession, private_key_content: str) -> dict:
        """
        Validate and store the system SSH private key.
        Derives and stores the public key as well.
        """
        try:
            # Validate and derive public key
            pkey = None
            try:
                pkey = paramiko.Ed25519Key.from_private_key(StringIO(private_key_content))
            except:
                try:
                    pkey = paramiko.RSAKey.from_private_key(StringIO(private_key_content))
                except Exception as e:
                    raise ForgeError(f"Invalid private key format: {e}")
            
            if not pkey:
                raise ForgeError("Could not load private key (supports Ed25519 and RSA)")

            # Get public key string (e.g., "ssh-ed25519 AAAA...")
            public_key = f"{pkey.get_name()} {pkey.get_base64()}"
            
            # Store Private Key (Securely)
            await cls._save_setting(db, cls.KEY_PRIVATE, private_key_content, sensitive=True)
            
            # Store Public Key (Plain)
            await cls._save_setting(db, cls.KEY_PUBLIC, public_key, sensitive=False)
            
            await db.commit()
            
            return {
                "public_key": public_key,
                "type": pkey.get_name()
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to set system SSH key: {e}")
            raise e

    @classmethod
    async def get_system_key(cls, db: AsyncSession) -> Optional[dict]:
        """
        Retrieve the system SSH keys. 
        Returns dict with private_key and public_key if they exist, else None.
        """
        private_key = await cls._get_setting(db, cls.KEY_PRIVATE)
        public_key = await cls._get_setting(db, cls.KEY_PUBLIC)
        
        if private_key:
            return {
                "private_key": private_key,
                "public_key": public_key
            }
        return None

    @classmethod
    async def _save_setting(cls, db: AsyncSession, key: str, value: str, sensitive: bool = False):
        query = select(AppSetting).where(AppSetting.key == key)
        result = await db.execute(query)
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.set_value(value, sensitive=sensitive)
        else:
            setting = AppSetting(key=key)
            setting.set_value(value, sensitive=sensitive)
            db.add(setting)

    @classmethod
    async def _get_setting(cls, db: AsyncSession, key: str) -> Optional[str]:
        query = select(AppSetting).where(AppSetting.key == key)
        result = await db.execute(query)
        setting = result.scalar_one_or_none()
        if setting:
            return setting.get_value()
        return None

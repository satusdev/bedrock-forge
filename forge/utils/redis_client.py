"""
Redis client utility.

Provides a configured Redis client for caching and IPC.
"""
import ssl
from typing import Optional
from redis import Redis
from ..core.config import settings
from ..utils.logging import logger

_redis_client: Optional[Redis] = None


def get_redis_client() -> Redis:
    """Get or create the Redis client."""
    global _redis_client
    
    if _redis_client is None:
        try:
            # Parse Redis URL
            # redis-py handles redis:// and rediss:// URLs natively
            _redis_client = Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            
            # Test connection
            _redis_client.ping()
            logger.info("Connected to Redis")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            # Re-raise or return None? For now, let it fail loud if Redis is critical
            raise e
            
    return _redis_client

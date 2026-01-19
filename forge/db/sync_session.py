"""
Synchronous database session for Celery tasks.

Celery tasks run outside of async context, so they need synchronous sessions.
"""
import os
from contextlib import contextmanager
from sqlalchemy import create_engine as create_sync_engine
from sqlalchemy.orm import sessionmaker, Session
from .base import Base


def get_sync_database_url() -> str:
    """Get synchronous database URL from environment."""
    url = os.getenv("DATABASE_URL", "sqlite:///./forge.db")
    
    # Convert async URLs to sync
    if "aiosqlite" in url:
        url = url.replace("sqlite+aiosqlite", "sqlite")
    if "asyncpg" in url:
        url = url.replace("postgresql+asyncpg", "postgresql")
    
    return url


# Sync engine for Celery tasks
sync_engine = create_sync_engine(
    get_sync_database_url(),
    echo=os.getenv("DATABASE_ECHO", "false").lower() == "true",
    pool_pre_ping=True
)

# Sync session factory
SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False
)


@contextmanager
def get_sync_session():
    """
    Context manager for synchronous database session.
    
    Usage in Celery tasks:
        with get_sync_session() as db:
            domains = db.execute(select(Domain)).scalars().all()
            db.commit()
    """
    session = SyncSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

"""
Database session management.

This module provides async engine creation, session factory,
and dependency injection for FastAPI routes.
"""
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
    AsyncEngine
)
from .base import Base


def get_database_url() -> str:
    """Get database URL from environment or use default SQLite."""
    return os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./forge.db"
    )


def create_engine(database_url: str | None = None) -> AsyncEngine:
    """Create async database engine."""
    url = database_url or get_database_url()
    
    # PostgreSQL requires asyncpg schema
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    return create_async_engine(
        url,
        echo=os.getenv("DATABASE_ECHO", "false").lower() == "true",
        pool_pre_ping=True
    )


# Default engine instance
engine = create_engine()

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a database session.
    
    Usage:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize database tables from models."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database engine connections."""
    await engine.dispose()

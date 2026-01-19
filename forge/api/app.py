"""
Bedrock Forge API Application.

This module creates and configures the FastAPI application for Bedrock Forge.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..core.config import settings
from ..db import init_db, close_db
from ..utils.logging import logger
from .routes import api_router

# Try to import slowapi for rate limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    RATE_LIMITING_AVAILABLE = False
    Limiter = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    # Startup
    logger.info("Bedrock Forge API starting up...")
    await init_db()
    logger.info("Database initialized")
    
    # Log Celery Beat info
    logger.info(
        "Backup schedules will be loaded from database by Celery Beat DatabaseScheduler. "
        "Start Celery Beat with: celery -A forge.api.celery_worker beat --loglevel=info"
    )
    
    yield
    # Shutdown
    logger.info("Bedrock Forge API shutting down...")
    await close_db()
    logger.info("Database connections closed")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    app = FastAPI(
        title=settings.APP_NAME,
        description="REST API for Bedrock Forge WordPress workflow automation",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )

    # Add CORS middleware with settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )

    # Add rate limiting if available and enabled
    if RATE_LIMITING_AVAILABLE and settings.RATE_LIMIT_ENABLED:
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        logger.info(f"Rate limiting enabled: {settings.RATE_LIMIT_REQUESTS}/{settings.RATE_LIMIT_PERIOD}")

    # Include API routes (dashboard is included in api_router via routes/__init__.py)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # Root endpoint
    @app.get("/")
    async def root():
        return {
            "message": settings.APP_NAME,
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/health"
        }

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "service": "bedrock-forge-api",
            "version": "1.0.0",
            "debug": settings.DEBUG
        }

    # Global exception handler for cleaner error responses
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        
        # Include CORS headers in error responses to prevent CORS errors on 500s
        origin = request.headers.get("origin", "")
        headers = {}
        if origin and (origin in settings.CORS_ORIGINS or "*" in settings.CORS_ORIGINS):
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=headers if headers else None
        )

    return app


# Create the main app instance
app = create_app()
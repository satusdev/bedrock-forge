"""
Bedrock Forge API Application.

This module creates and configures the FastAPI application for Bedrock Forge.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .routes import api_router
from .dashboard_routes import dashboard_router
from ..utils.logging import logger


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    app = FastAPI(
        title="Bedrock Forge API",
        description="REST API for Bedrock Forge WordPress workflow automation",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc"
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(dashboard_router, prefix="/api/v1/dashboard")

    # Root endpoint
    @app.get("/")
    async def root():
        return {
            "message": "Bedrock Forge API",
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
            "version": "1.0.0"
        }

    # Startup event
    @app.on_event("startup")
    async def startup_event():
        logger.info("Bedrock Forge API started successfully")

    # Shutdown event
    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Bedrock Forge API shutting down")

    return app


# Create the main app instance
app = create_app()
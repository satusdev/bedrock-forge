"""
Application configuration using Pydantic Settings.

This module provides centralized configuration management with
environment variable support and validation.
"""
import json
import secrets
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    APP_NAME: str = "Bedrock Forge"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    APP_TIMEZONE: str = "UTC"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./forge.db"
    DATABASE_ECHO: bool = False
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Encryption key for vault (Fernet)
    ENCRYPTION_KEY: str = ""
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: str = "minute"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    
    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse CORS_ORIGINS from JSON string or list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # Handle comma-separated string
                return [origin.strip() for origin in v.split(',')]
        return v
    
    # Redis (for rate limiting and caching)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Environment defaults
    NOTIFICATION_SUPPRESS_ENVIRONMENTS: List[str] = ["development", "staging"]
    
    # First user (optional - for initial setup)
    FIRST_SUPERUSER_EMAIL: str = ""
    FIRST_SUPERUSER_PASSWORD: str = ""


# Global settings instance
settings = Settings()


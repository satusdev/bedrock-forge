"""Legacy API package shim.

The active backend runtime is `nest-api` (NestJS + Prisma).
This module only re-exports the old FastAPI app object for compatibility.
"""

from .app import app

__all__ = ["app"]

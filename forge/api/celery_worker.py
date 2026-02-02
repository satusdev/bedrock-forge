"""Unified Celery app entrypoint for API/worker/beat."""

from forge.core.celery_app import celery_app

__all__ = ["celery_app"]

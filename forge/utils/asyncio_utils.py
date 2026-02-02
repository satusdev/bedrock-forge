"""
Asyncio helpers for Celery tasks.

Provides a single event loop per worker process to avoid
"Future attached to a different loop" errors with async DB sessions.
"""
from __future__ import annotations

import asyncio
from typing import Any, Coroutine


_celery_loop: asyncio.AbstractEventLoop | None = None


def _get_or_create_loop() -> asyncio.AbstractEventLoop:
    global _celery_loop
    if _celery_loop is None or _celery_loop.is_closed():
        _celery_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_celery_loop)
    return _celery_loop


def run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    """Run async code in Celery sync context using a shared loop."""
    loop = _get_or_create_loop()
    if loop.is_running():
        # Should not happen in Celery workers; fail fast to avoid loop mismatch.
        raise RuntimeError("Async event loop is already running in this process")
    return loop.run_until_complete(coro)

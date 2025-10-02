import pytest
import asyncio
from forge.utils.shell import run_shell, run_shell_async

def test_run_shell_sync():
    output = run_shell("echo hello", dry_run=False)
    assert "hello" in output

@pytest.mark.asyncio
async def test_run_shell_async():
    output = await run_shell_async("echo async_hello", dry_run=False)
    assert "async_hello" in output

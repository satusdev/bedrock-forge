import subprocess
import asyncio
from forge.utils.errors import ForgeError

def run_shell(command: str, dry_run: bool) -> str:
    """Run a shell command and handle errors (sync)."""
    import typer
    if dry_run:
        typer.secho(f"Dry run: {command}", fg=typer.colors.BLUE)
        return ""
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        error_message = f"Command failed: {e}\nStderr: {e.stderr}"
        raise ForgeError(error_message)

async def run_shell_async(command: str, dry_run: bool) -> str:
    """Run a shell command asynchronously and handle errors."""
    import typer
    if dry_run:
        typer.secho(f"Dry run: {command}", fg=typer.colors.BLUE)
        return ""
    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        error_message = f"Command failed: {command}\nStderr: {stderr.decode()}"
        raise ForgeError(error_message)
    return stdout.decode()

import subprocess
import typer
from .errors import ForgeError

def run_shell(command: str, dry_run: bool = False) -> None:
    if dry_run:
        typer.echo(f"Dry run: {command}")
        return
    try:
        result = subprocess.run(command, shell=True, check=True, text=True, capture_output=True)
        typer.echo(result.stdout)
    except subprocess.CalledProcessError as e:
        raise ForgeError(f"Command failed: {e.stderr}")

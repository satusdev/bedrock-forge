import typer
import json
from forge.utils.logging import logger

app = typer.Typer(help="Display project/server info")

def show_project_info(
    project_name: str,
    output: str = "text",
    verbose: bool = False
):
    """Show detailed project and server info. (Exposed for API)"""
    from forge.commands.local import load_project_info
    info = load_project_info(project_name, verbose)
    if output == "json":
        return json.dumps(info, indent=2)  # Return for API
    else:
        for k, v in info.items():
            if verbose or k not in ["ddev_docker_info", "wp_info"]:
                logger.info(f"{k}: {v}")
            else:
                logger.debug(json.dumps(v, indent=2))

@app.command(help="Show detailed project and server information")
def show(
    project_name: str = typer.Argument(..., help="Project name"),
    output: str = typer.Option("text", "--output", help="Output format: text or json"),
    verbose: bool = typer.Option(False, "--verbose")
):
    result = show_project_info(project_name, output, verbose)
    if output == "json":
        print(result)
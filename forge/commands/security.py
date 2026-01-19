import typer
from typing import Optional
from pathlib import Path
import json
import logging
from forge.security.wpscan import WPScanWrapper, WPScanParams
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Security management commands")
console = Console()
logger = logging.getLogger(__name__)

@app.command()
def scan(
    url: str = typer.Argument(..., help="Target URL to scan"),
    token: Optional[str] = typer.Option(None, "--token", "-t", help="WPScan API Token"),
    detection_mode: str = typer.Option("mixed", "--detection-mode", help="Detection mode (mixed, passive, aggressive)"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Path to save JSON output"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable verbose output")
):
    """Run a WPScan against a target WordPress site."""
    wrapper = WPScanWrapper()
    
    if not wrapper.check_installation():
        console.print("[red]Error: wpscan executable not found. Please install wpscan first.[/red]")
        raise typer.Exit(code=1)

    console.print(f"[bold blue]Starting scan for {url}...[/bold blue]")
    
    params = WPScanParams(
        url=url,
        token=token,
        detection_mode=detection_mode
    )
    
    result = wrapper.scan(params)
    
    if "error" in result:
        console.print(f"[bold red]Scan failed:[/bold red] {result['error']}")
        if verbose and "details" in result:
            console.print(result["details"])
        raise typer.Exit(code=1)

    # Basic vulnerability summary
    vulns_found = 0
    
    # Check core
    core_vulns = result.get("version", {}).get("vulnerabilities", [])
    vulns_found += len(core_vulns)
    
    # Check plugins
    plugins = result.get("plugins", {})
    plugin_vulns = 0
    for p in plugins.values():
        plugin_vulns += len(p.get("vulnerabilities", []))
    vulns_found += plugin_vulns

    # Check themes
    themes = result.get("themes", {})
    theme_vulns = 0
    for t in themes.values():
        theme_vulns += len(t.get("vulnerabilities", []))
    vulns_found += theme_vulns

    # Display summary table
    table = Table(title="Scan Summary")
    table.add_column("Component", style="cyan")
    table.add_column("Vulnerabilities", style="magenta")
    
    table.add_row("WordPress Core", str(len(core_vulns)))
    table.add_row("Plugins", str(plugin_vulns))
    table.add_row("Themes", str(theme_vulns))
    table.add_row("Total", str(vulns_found), style="bold red" if vulns_found > 0 else "green")
    
    console.print(table)

    if vulns_found > 0:
        console.print("\n[bold red]Vulnerabilities Found![/bold red]")
        # TODO: Print detailed list of vulnerabilities if verbose

    if output:
        try:
            with open(output, 'w') as f:
                json.dump(result, f, indent=2)
            console.print(f"[green]Full report saved to {output}[/green]")
        except Exception as e:
            console.print(f"[red]Failed to save report: {e}[/red]")

@app.command()
def audit_log(
    limit: int = typer.Option(50, "--limit", "-l", help="Number of log entries to show"),
    user: Optional[str] = typer.Option(None, "--user", "-u", help="Filter by user")
):
    """View security audit logs."""
    console.print("[yellow]Audit log feature coming soon...[/yellow]")

"""
Reports Command

Provides CLI interface for custom report generation, template management,
automated scheduling, and multi-format export.
"""

import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.tree import Tree
from rich.text import Text
from rich.filesize import decimal

from forge.utils.report_generator import ReportGenerator
from forge.utils.project import get_project_config

app = typer.Typer(help="Custom report generation and management commands")
console = Console()


@app.command()
def generate(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    template: str = typer.Argument(..., help="Report template name"),
    format: str = typer.Option("html", "--format", "-f", help="Output format (html|json|pdf|csv)"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path"),
    period: str = typer.Option("30", "--period", help="Analysis period (e.g., 30, 7d, 1m)"),
    custom_params: Optional[str] = typer.Option(None, "--params", help="Custom parameters as JSON")
):
    """Generate a custom report"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        console.print(f"[blue]📊 Generating report...[/blue]")
        console.print(f"  Template: {template}")
        console.print(f"  Format: {format}")
        console.print(f"  Period: {period}")

        # Parse custom parameters
        parameters = {}
        if custom_params:
            try:
                parameters = json.loads(custom_params)
            except json.JSONDecodeError:
                console.print("[red]❌ Invalid JSON in custom parameters[/red]")
                raise typer.Exit(1)

        parameters['period'] = period

        async def run_generation():
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console
            ) as progress:
                task = progress.add_task("Generating report...", total=None)

                report_file = await generator.generate_report(
                    template_name=template,
                    format_type=format,
                    parameters=parameters,
                    output_file=output
                )

                progress.update(task, completed=True)
                return report_file

        report_file = asyncio.run(run_generation())

        # Display file info
        if report_file:
            file_path = Path(report_file)
            file_size = file_path.stat().st_size if file_path.exists() else 0

            console.print(Panel(
                f"[bold green]✅ Report Generated Successfully[/bold green]\n\n"
                f"File: {file_path.name}\n"
                f"Path: {file_path}\n"
                f"Size: {decimal(file_size)}\n"
                f"Format: {format.upper()}",
                title="Report Generation Complete",
                border_style="green"
            ))

            # Open the file if possible
            try:
                import webbrowser
                if format.lower() in ['html']:
                    webbrowser.open(f"file://{file_path.absolute()}")
            except ImportError:
                console.print(f"[dim]💡 Tip: Open the report file: {file_path}[/dim]")

    except Exception as e:
        console.print(f"[red]❌ Report generation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def templates(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    list: bool = typer.Option(True, "--list", "-l", help="List available templates"),
    show: Optional[str] = typer.Option(None, "--show", "-s", help="Show template details"),
    create: Optional[str] = typer.Option(None, "--create", "-c", help="Create new template"),
    template_type: Optional[str] = typer.Option(None, "--type", "-t", help="Template type")
):
    """Manage report templates"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        if show:
            # Show template details
            async def get_template():
                return await generator._get_template(show)

            template = asyncio.run(get_template())
            if template:
                _display_template_details(template)
            else:
                console.print(f"[red]❌ Template '{show}' not found[/red]")
                raise typer.Exit(1)

        elif create:
            console.print(f"[blue]📋 Creating new report template: {create}[/blue]")
            # In a real implementation, this would collect template details
            console.print("[yellow]Template creation not implemented in CLI[/yellow]")
            console.print("Please modify the report_templates.json file directly.")

        elif list:
            # List available templates
            asyncio.run(_display_template_list(generator))

    except Exception as e:
        console.print(f"[red]❌ Template management failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def history(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to show"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export history to file")
):
    """Show report generation history"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        console.print(f"[blue]📚 Loading report history...[/blue]")
        console.print(f"  Period: Last {days} days")

        async def load_history():
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console
            ) as progress:
                task = progress.add_task("Loading history...", total=None)

                history = await generator.get_report_history(days)

                progress.update(task, completed=True)
                return history

        history = asyncio.run(load_history())

        if not history:
            console.print("[yellow]📭 No report history found[/yellow]")
            return

        # Display history
        _display_report_history(history)

        # Export if requested
        if export:
            with open(export, 'w') as f:
                json.dump(history, f, indent=2, default=str)
            console.print(f"[green]✅ History exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ History loading failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def schedule(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    template: str = typer.Argument(..., help="Report template name"),
    name: str = typer.Option(None, "--name", "-n", help="Schedule name"),
    cron: str = typer.Option("0 9 * * 1", "--cron", "-c", help="Cron expression"),
    recipients: str = typer.Option("", "--recipients", "-r", help="Email recipients (comma-separated)"),
    period: str = typer.Option("30", "--period", help="Analysis period"),
    params: Optional[str] = typer.Option(None, "--params", help="Custom parameters as JSON")
):
    """Schedule automated report generation"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        schedule_name = name or f"{template}_daily"

        # Parse recipients
        if recipients:
            recipient_list = [email.strip() for email in recipients.split(",")]
        else:
            recipient_list = []

        # Parse custom parameters
        parameters = {"period": period}
        if params:
            try:
                custom_params = json.loads(params)
                parameters.update(custom_params)
            except json.JSONDecodeError:
                console.print("[red]❌ Invalid JSON in custom parameters[/red]")
                raise typer.Exit(1)

        console.print(f"[blue]⏰ Scheduling report...[/blue]")
        console.print(f"  Template: {template}")
        console.print(f"  Schedule: {schedule_name}")
        console.print(f"  Cron: {cron}")
        console.print(f"  Recipients: {len(recipient_list)} emails")

        async def run_schedule():
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console
            ) as progress:
                task = progress.add_task("Scheduling report...", total=None)

                success = await generator.schedule_report(
                    template_name=template,
                    schedule_name=schedule_name,
                    cron_expression=cron,
                    recipients=recipient_list,
                    parameters=parameters
                )

                progress.update(task, completed=True)
                return success

        success = asyncio.run(run_schedule())

        if success:
            console.print(Panel(
                f"[bold green]✅ Report Scheduled Successfully[/bold green]\n\n"
                f"Schedule Name: {schedule_name}\n"
                f"Template: {template}\n"
                f"Next Run: {cron}\n"
                f"Recipients: {len(recipient_list)}",
                title="Report Scheduling Complete",
                border_style="green"
            ))
        else:
            console.print("[red]❌ Failed to schedule report[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]❌ Report scheduling failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def schedules(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    list: bool = typer.Option(True, "--list", "-l", help="List scheduled reports"),
    delete: Optional[str] = typer.Option(None, "--delete", "-d", help="Delete scheduled report"),
    export: Optional[str] = typer.Option(None, "--export", "-e", help="Export schedules to file")
):
    """Manage scheduled reports"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        if delete:
            console.print(f"[red]🗑️ Deleting scheduled report: {delete}[/red]")
            console.print("[yellow]Report deletion not implemented in CLI[/yellow]")
            console.print("Please remove directly from the database if needed.")
            return

        if list:
            console.print(f"[blue]📅 Loading scheduled reports...[/blue]")

            async def load_schedules():
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    console=console
                ) as progress:
                    task = progress.add_task("Loading schedules...", total=None)

                    schedules = await generator.get_scheduled_reports()

                    progress.update(task, completed=True)
                    return schedules

            schedules = asyncio.run(load_schedules())

            if not schedules:
                console.print("[yellow]📭 No scheduled reports found[/yellow]")
                return

            # Display schedules
            _display_scheduled_reports(schedules)

            # Export if requested
            if export:
                with open(export, 'w') as f:
                    json.dump(schedules, f, indent=2, default=str)
                console.print(f"[green]✅ Schedules exported to: {export}[/green]")

    except Exception as e:
        console.print(f"[red]❌ Schedule management failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    show: bool = typer.Option(True, "--show", help="Show current configuration"),
    reports_dir: Optional[str] = typer.Option(None, "--reports-dir", help="Reports directory path"),
    templates_file: Optional[str] = typer.Option(None, "--templates-file", help="Templates file path")
):
    """Configure report generation settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = project_config['path']
        generator = ReportGenerator(project_path)

        # Update configuration if needed
        updated = False

        # Display current configuration
        console.print(Panel(
            f"[bold blue]Report Generation Configuration[/bold blue]\n\n"
            f"Reports Directory: {generator.reports_dir}\n"
            f"Templates File: {generator.templates_path}\n"
            f"Database: {generator.reports_db}",
            title="Configuration",
            border_style="blue"
        ))

        # Show available templates
        console.print(f"\n[bold]Available Templates:[/bold]")
        asyncio.run(_display_template_list(generator))

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


async def _display_template_list(generator):
    """Display available report templates"""
    try:
        # Get available templates from file
        if generator.templates_path.exists():
            with open(generator.templates_path, 'r') as f:
                templates = json.load(f)
        else:
            templates = generator._get_default_templates()

        if not templates:
            console.print("[yellow]No templates available[/yellow]")
            return

        # Create templates table
        templates_table = Table()
        templates_table.add_column("Template Name", style="cyan")
        templates_table.add_column("Type", style="green")
        templates_table.add_column("Description", style="blue")
        templates_table.add_column("Sections", justify="right", style="magenta")

        for name, template in templates.items():
            template_type = template.get('template_type', 'unknown')
            description = template.get('description', 'No description')
            sections = len(template.get('sections', []))

            templates_table.add_row(
                name,
                template_type.title(),
                description[:50] + "..." if len(description) > 50 else description,
                str(sections)
            )

        console.print(templates_table)

    except Exception as e:
        console.print(f"[red]❌ Failed to display templates: {e}[/red]")


def _display_template_details(template):
    """Display detailed template information"""
    console.print(Panel(
        f"[bold blue]Template Details[/bold blue]\n\n"
        f"Name: {template.name}\n"
        f"Type: {template.template_type}\n"
        f"Description: {template.config.get('description', 'No description')}",
        title=f"{template.name} Template",
        border_style="blue"
    ))

    # Display sections
    sections = template.config.get('sections', [])
    if sections:
        console.print(f"\n[bold]Sections:[/bold]")

        for i, section in enumerate(sections, 1):
            section_name = section.get('name', f"Section {i}")
            section_title = section.get('title', section_name)
            section_type = section.get('type', 'unknown')
            metrics = section.get('metrics', [])

            console.print(f"\n  [cyan]{i}. {section_title}[/cyan]")
            console.print(f"     Type: {section_type}")
            if metrics:
                console.print(f"     Metrics: {', '.join(metrics)}")


def _display_report_history(history):
    """Display report generation history"""
    console.print(Panel(
        f"[bold blue]Report Generation History[/bold blue]\n\n"
        f"Total Reports: {len(history)}",
        title="Recent Reports",
        border_style="blue"
    ))

    # Create history table
    history_table = Table()
    history_table.add_column("Report ID", style="cyan")
    history_table.add_column("Template", style="green")
    history_table.add_column("Type", style="blue")
    history_table.add_column("Generated", style="magenta")
    history_table.add_column("Format", style="yellow")
    history_table.add_column("Status", style="red")

    for report in history:
        generated_at = datetime.fromisoformat(report['generated_at'])
        status_color = "green" if report['status'] == 'completed' else "red"

        history_table.add_row(
            report['report_id'][:8] + "...",
            report['template_name'],
            report['report_type'],
            generated_at.strftime("%Y-%m-%d %H:%M"),
            report['format_type'].upper(),
            f"[{status_color}]{report['status']}[/{status_color}]"
        )

    console.print(history_table)

    # Show recent files
    console.print(f"\n[bold]Recent Files:[/bold]")
    for report in history[:5]:
        file_path = Path(report['file_path'])
        if file_path.exists():
            file_size = file_path.stat().st_size
            console.print(f"  • {file_path.name} ({decimal(file_size)}) - {file_path}")


def _display_scheduled_reports(schedules):
    """Display scheduled reports"""
    console.print(Panel(
        f"[bold green]Scheduled Reports[/bold green]\n\n"
        f"Active Schedules: {len(schedules)}",
        title="Automated Reports",
        border_style="green"
    ))

    # Create schedules table
    schedules_table = Table()
    schedules_table.add_column("Schedule Name", style="cyan")
    schedules_table.add_column("Template", style="green")
    schedules_table.add_column("Recipients", justify="right", style="blue")
    schedules_table.add_column("Next Run", style="magenta")
    schedules_table.add_column("Last Run", style="yellow")

    for schedule in schedules:
        next_run = datetime.fromisoformat(schedule['next_run'])
        last_run = schedule['last_run']

        schedules_table.add_row(
            schedule['schedule_name'],
            schedule['template_name'],
            f"{len(schedule['recipients'])} emails",
            next_run.strftime("%Y-%m-%d %H:%M"),
            last_run or "Never"
        )

    console.print(schedules_table)


if __name__ == "__main__":
    app()
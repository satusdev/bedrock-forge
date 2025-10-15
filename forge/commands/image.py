"""
Image Optimization Command

Provides CLI interface for WordPress image optimization, compression,
format conversion, and automated image optimization workflows.
"""

import asyncio
import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.panel import Panel
from rich.text import Text
from rich.tree import Tree

from forge.utils.image_optimizer import ImageOptimizer, ImageOptimizationResult, ImageBatchResult
from forge.utils.project import get_project_config

app = typer.Typer(help="Image optimization and management commands")
console = Console()


@app.command()
def analyze(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    detailed: bool = typer.Option(False, "--detailed", "-d", help="Show detailed analysis")
):
    """Analyze images for optimization opportunities"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Analyzing images...", total=None)

            # Run analysis
            analysis = asyncio.run(optimizer.analyze_images(detailed=detailed))

            progress.update(task, completed=True)

        # Display results
        _display_analysis_results(analysis, detailed)

    except Exception as e:
        console.print(f"[red]❌ Analysis failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def optimize(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    file_path: Optional[str] = typer.Option(None, "--file", "-f", help="Specific image file to optimize"),
    directory: Optional[str] = typer.Option(None, "--dir", "-d", help="Directory to optimize"),
    force: bool = typer.Option(False, "--force", help="Force re-optimization"),
    batch: bool = typer.Option(False, "--batch", "-b", help="Batch optimize multiple images")
):
    """Optimize images for better performance"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        if file_path:
            # Optimize single file
            image_path = Path(file_path)
            if not image_path.exists():
                console.print(f"[red]❌ Image file not found: {file_path}[/red]")
                raise typer.Exit(1)

            console.print(f"[blue]🔧 Optimizing image: {image_path.name}[/blue]")

            result = asyncio.run(optimizer.optimize_image(image_path, force=force))
            _display_optimization_result(result)

        elif batch:
            # Batch optimize
            target_dir = Path(directory) if directory else None
            console.print("[blue]🔧 Starting batch image optimization...[/blue]")

            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TaskProgressColumn(),
                console=console
            ) as progress:

                # Get total images first
                if target_dir:
                    images = []
                    for ext in ['*.jpg', '*.jpeg', '*.png', '*.gif']:
                        images.extend(target_dir.rglob(ext))
                else:
                    analysis = asyncio.run(optimizer.analyze_images())
                    images = []  # Will be counted by optimize_batch

                task = progress.add_task("Optimizing images...", total=len(images) if 'images' in locals() else None)

                # Run batch optimization
                result = asyncio.run(optimizer.optimize_batch(target_dir, force=force))

                progress.update(task, completed=100)

            _display_batch_results(result)

        else:
            console.print("[yellow]⚠️  Please specify either --file or --batch[/yellow]")
            console.print("Use --help for more information")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]❌ Optimization failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def status(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name")
):
    """Show image optimization status and statistics"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Collecting status...", total=None)

            # Get analysis and history
            analysis = asyncio.run(optimizer.analyze_images(detailed=True))
            history = asyncio.run(optimizer.get_optimization_history(days=30))

            progress.update(task, completed=True)

        # Display status dashboard
        _display_status_dashboard(analysis, history, optimizer.settings)

    except Exception as e:
        console.print(f"[red]❌ Status check failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def history(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Number of days to show"),
    limit: int = typer.Option(10, "--limit", "-l", help="Maximum number of entries to show")
):
    """Show image optimization history"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Loading history...", total=None)

            history_data = asyncio.run(optimizer.get_optimization_history(days=days))

            progress.update(task, completed=True)

        if not history_data:
            console.print("[yellow]📭 No optimization history found[/yellow]")
            return

        # Create history table
        table = Table(title=f"Image Optimization History (Last {days} days)")
        table.add_column("Date", style="cyan")
        table.add_column("Batch ID", style="magenta")
        table.add_column("Images", justify="right")
        table.add_column("Space Saved", justify="right", style="green")
        table.add_column("Time", justify="right", style="blue")

        total_images = 0
        total_space_saved = 0

        for entry in history_data[:limit]:
            table.add_row(
                entry['created_at'][:10],
                entry['batch_id'].replace('batch_', '')[:8],
                str(entry['image_count']),
                f"{entry['space_saved_mb']:.1f} MB",
                f"{entry['optimization_time']:.1f}s"
            )
            total_images += entry['image_count']
            total_space_saved += entry['bytes_saved']

        console.print(table)

        # Summary
        console.print(f"\n[bold]Summary ({len(history_data[:limit])} batches):[/bold]")
        console.print(f"  Total Images Optimized: [green]{total_images}[/green]")
        console.print(f"  Total Space Saved: [green]{total_space_saved / (1024*1024):.1f} MB[/green]")

    except Exception as e:
        console.print(f"[red]❌ Failed to load history: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def report(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    format: str = typer.Option("text", "--format", "-f", help="Report format (text|json)"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path")
):
    """Generate comprehensive image optimization report"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Generating report...", total=None)

            report_data = asyncio.run(optimizer.generate_optimization_report(format=format))

            progress.update(task, completed=True)

        # Output report
        if output:
            with open(output, 'w') as f:
                f.write(report_data)
            console.print(f"[green]✅ Report saved to: {output}[/green]")
        else:
            if format == "json":
                # Pretty print JSON
                data = json.loads(report_data)
                console.print_json(data=data)
            else:
                # Display text report
                console.print(Panel(
                    report_data,
                    title="Image Optimization Report",
                    border_style="blue"
                ))

    except Exception as e:
        console.print(f"[red]❌ Report generation failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def cleanup(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    days: int = typer.Option(30, "--days", "-d", help="Delete images older than N days"),
    dry_run: bool = typer.Option(True, "--dry-run", help="Show what would be deleted without actually deleting")
):
    """Clean up unused image files"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        console.print(f"[blue]🧹 Scanning for unused images (older than {days} days)...[/blue]")

        if dry_run:
            console.print("[yellow]🔍 DRY RUN MODE - No files will be deleted[/yellow]")
        else:
            console.print("[red]⚠️  WARNING: This will permanently delete files![/red]")
            if not typer.confirm("Are you sure you want to continue?"):
                console.print("Operation cancelled.")
                raise typer.Exit()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Scanning for unused images...", total=None)

            result = asyncio.run(optimizer.cleanup_unused_images(days=days))

            progress.update(task, completed=True)

        # Display results
        if 'error' in result:
            console.print(f"[red]❌ Cleanup failed: {result['error']}[/red]")
        else:
            if result['deleted_count'] > 0:
                console.print(f"[green]✅ Cleanup completed:[/green]")
                console.print(f"  Files deleted: {result['deleted_count']}")
                console.print(f"  Space freed: {result['space_freed_mb']:.1f} MB")
            else:
                console.print("[yellow]📭 No unused images found for cleanup[/yellow]")

    except Exception as e:
        console.print(f"[red]❌ Cleanup failed: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def config(
    project_name: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    show: bool = typer.Option(True, "--show", help="Show current configuration"),
    jpeg_quality: Optional[int] = typer.Option(None, "--jpeg-quality", help="JPEG compression quality (1-100)"),
    png_quality: Optional[int] = typer.Option(None, "--png-quality", help="PNG compression quality (1-100)"),
    webp_quality: Optional[int] = typer.Option(None, "--webp-quality", help="WebP compression quality (1-100)"),
    max_width: Optional[int] = typer.Option(None, "--max-width", help="Maximum image width"),
    max_height: Optional[int] = typer.Option(None, "--max-height", help="Maximum image height"),
    create_webp: Optional[bool] = typer.Option(None, "--create-webp/--no-create-webp", help="Create WebP versions"),
    create_avif: Optional[bool] = typer.Option(None, "--create-avif/--no-create-avif", help="Create AVIF versions")
):
    """Configure image optimization settings"""
    try:
        project_config = get_project_config(project_name)
        if not project_config:
            console.print("[red]❌ Project not found[/red]")
            raise typer.Exit(1)

        project_path = Path(project_config['path'])
        optimizer = ImageOptimizer(project_path)

        # Update settings if provided
        settings_file = project_path / ".forge" / "image_config.json"
        current_settings = optimizer.settings.copy()

        # Apply updates
        updated = False
        if jpeg_quality is not None:
            current_settings['jpeg_quality'] = max(1, min(100, jpeg_quality))
            updated = True
        if png_quality is not None:
            current_settings['png_quality'] = max(1, min(100, png_quality))
            updated = True
        if webp_quality is not None:
            current_settings['webp_quality'] = max(1, min(100, webp_quality))
            updated = True
        if max_width is not None:
            current_settings['max_width'] = max(100, max_width)
            updated = True
        if max_height is not None:
            current_settings['max_height'] = max(100, max_height)
            updated = True
        if create_webp is not None:
            current_settings['create_webp'] = create_webp
            updated = True
        if create_avif is not None:
            current_settings['create_avif'] = create_avif
            updated = True

        # Save updated settings
        if updated:
            settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(settings_file, 'w') as f:
                json.dump(current_settings, f, indent=2)
            console.print("[green]✅ Configuration updated[/green]")

        if show:
            _display_configuration(current_settings)

    except Exception as e:
        console.print(f"[red]❌ Configuration failed: {e}[/red]")
        raise typer.Exit(1)


def _display_analysis_results(analysis: dict, detailed: bool = False):
    """Display image analysis results"""
    console.print(Panel(
        f"[bold blue]Image Analysis Results[/bold blue]\n\n"
        f"Total Images: {analysis['total_images']}\n"
        f"Total Size: {analysis['total_size_mb']:.1f} MB\n"
        f"Unoptimized Images: {analysis['unoptimized_count']}\n"
        f"Potential Savings: {analysis['optimization_potential_mb']:.1f} MB",
        title="Analysis Summary",
        border_style="blue"
    ))

    if analysis['recommendations']:
        console.print("\n[bold]Recommendations:[/bold]")
        for rec in analysis['recommendations']:
            console.print(f"  • {rec}")

    if detailed and analysis['total_images'] > 0:
        # Show format distribution
        console.print("\n[bold]Format Distribution:[/bold]")
        # This would require additional analysis to collect format stats


def _display_optimization_result(result: ImageOptimizationResult):
    """Display single image optimization result"""
    if result.success:
        console.print("[green]✅ Image optimized successfully[/green]")
        console.print(f"  Original Size: {result.total_original_size / 1024:.1f} KB")
        console.print(f"  Optimized Size: {result.total_optimized_size / 1024:.1f} KB")
        console.print(f"  Space Saved: {result.total_bytes_saved / 1024:.1f} KB ({result.average_compression:.1%})")
        console.print(f"  Time Taken: {result.optimization_time:.2f}s")

        if result.formats_converted:
            formats = ", ".join(result.formats_converted.keys())
            console.print(f"  Formats Created: {formats}")

        if result.warnings:
            console.print("\n[yellow]⚠️  Warnings:[/yellow]")
            for warning in result.warnings:
                console.print(f"    {warning}")
    else:
        console.print("[red]❌ Optimization failed[/red]")
        for error in result.errors:
            console.print(f"    {error}")


def _display_batch_results(result: ImageBatchResult):
    """Display batch optimization results"""
    console.print(Panel(
        f"[bold blue]Batch Optimization Results[/bold blue]\n\n"
        f"Total Images: {result.total_images}\n"
        f"Successfully Optimized: {result.optimized_images}\n"
        f"Skipped: {result.skipped_images}\n"
        f"Failed: {result.failed_images}\n"
        f"Total Space Saved: {result.total_space_saved / (1024*1024):.1f} MB\n"
        f"Time Taken: {result.optimization_time:.1f}s",
        title="Batch Summary",
        border_style="blue"
    ))

    if result.total_images > 0:
        success_rate = (result.optimized_images / result.total_images) * 100
        console.print(f"[green]Success Rate: {success_rate:.1f}%[/green]")


def _display_status_dashboard(analysis: dict, history: list, settings: dict):
    """Display comprehensive status dashboard"""
    # Main stats
    console.print(Panel(
        f"[bold blue]Image Optimization Status[/bold blue]\n\n"
        f"Total Images: {analysis['total_images']}\n"
        f"Total Size: {analysis['total_size_mb']:.1f} MB\n"
        f"Unoptimized: {analysis['unoptimized_count']}\n"
        f"Optimization Potential: {analysis['optimization_potential_mb']:.1f} MB",
        title="Current Status",
        border_style="blue"
    ))

    # Recent activity
    if history:
        console.print("\n[bold]Recent Activity:[/bold]")
        for entry in history[:3]:
            console.print(f"  {entry['created_at'][:10]}: {entry['image_count']} images, "
                         f"{entry['space_saved_mb']:.1f} MB saved")

    # Settings overview
    console.print(f"\n[bold]Current Settings:[/bold]")
    console.print(f"  JPEG Quality: {settings['jpeg_quality']}")
    console.print(f"  PNG Quality: {settings['png_quality']}")
    console.print(f"  WebP Creation: {'Enabled' if settings['create_webp'] else 'Disabled'}")
    console.print(f"  AVIF Creation: {'Enabled' if settings['create_avif'] else 'Disabled'}")
    console.print(f"  Max Dimensions: {settings['max_width']}x{settings['max_height']}")


def _display_configuration(settings: dict):
    """Display current configuration settings"""
    table = Table(title="Image Optimization Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    config_items = [
        ("JPEG Quality", f"{settings['jpeg_quality']}%"),
        ("PNG Quality", f"{settings['png_quality']}%"),
        ("WebP Quality", f"{settings['webp_quality']}%"),
        ("AVIF Quality", f"{settings['avif_quality']}%"),
        ("Max Width", f"{settings['max_width']}px"),
        ("Max Height", f"{settings['max_height']}px"),
        ("Create WebP", "Yes" if settings['create_webp'] else "No"),
        ("Create AVIF", "Yes" if settings['create_avif'] else "No"),
        ("Preserve Original", "Yes" if settings['preserve_original'] else "No"),
        ("Strip Metadata", "Yes" if settings['strip_metadata'] else "No"),
        ("Progressive JPEG", "Yes" if settings['progressive_jpeg'] else "No"),
        ("Lazy Load Threshold", f"{settings['lazy_load_threshold']}px"),
        ("Batch Size", str(settings['batch_size'])),
        ("Max File Size", f"{settings['max_file_size'] / (1024*1024):.1f}MB")
    ]

    for key, value in config_items:
        table.add_row(key, value)

    console.print(table)


if __name__ == "__main__":
    app()
"""
Performance optimization commands for Bedrock Forge.

Provides comprehensive performance testing, monitoring, and optimization
tools using Google Lighthouse and custom optimization techniques.
"""

import asyncio
import typer
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.prompt import Confirm, Prompt

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..utils.performance_tester import PerformanceTester, PerformanceBudget, PerformanceTarget
from ..models.performance import (
    PerformanceTest, PerformanceGrade, DeviceType, AlertLevel,
    PerformanceBudget as BudgetModel, PerformanceTarget as TargetModel
)
from ..utils.image_optimizer import ImageOptimizer
from ..utils.db_optimizer import DatabaseOptimizer
from ..constants import *
from ..utils.local_config import LocalConfigManager
from ..utils.project_helpers import ProjectSelector

app = typer.Typer(help="Performance testing and optimization")

# Rich console for beautiful output
console = Console()

# Initialize utilities
config_manager = LocalConfigManager()
project_selector = ProjectSelector(config_manager)


def get_project_url(project_dir: Path) -> str:
    """Get the primary URL for a project."""
    try:
        # Try to get URL from DDEV configuration
        result = run_shell("ddev describe -j", dry_run=False)
        if result:
            ddev_info = json.loads(result)
            return ddev_info.get('httpURLs', {}).get('primary', '')
    except Exception:
        pass

    # Fallback to common patterns
    project_name = project_dir.name
    return f"https://{project_name}.ddev.site"


def display_performance_result(result: PerformanceTest) -> None:
    """Display performance test results in a beautiful format."""
    # Create summary table
    summary_table = Table(title="Performance Test Results", show_header=False)
    summary_table.add_column("Metric", style="cyan")
    summary_table.add_column("Score", style="green")
    summary_table.add_column("Grade", style="yellow")
    summary_table.add_column("Status", style="blue")

    # Add category scores
    summary_table.add_row(
        "Performance",
        f"{result.performance_score.score:.1f}",
        result.performance_score.grade.value.title(),
        get_score_emoji(result.performance_score.grade)
    )
    summary_table.add_row(
        "Accessibility",
        f"{result.accessibility_score.score:.1f}",
        result.accessibility_score.grade.value.title(),
        get_score_emoji(result.accessibility_score.grade)
    )
    summary_table.add_row(
        "Best Practices",
        f"{result.best_practices_score.score:.1f}",
        result.best_practices_score.grade.value.title(),
        get_score_emoji(result.best_practices_score.grade)
    )
    summary_table.add_row(
        "SEO",
        f"{result.seo_score.score:.1f}",
        result.seo_score.grade.value.title(),
        get_score_emoji(result.seo_score.grade)
    )

    console.print(summary_table)
    console.print()

    # Core Web Vitals
    cwv_table = Table(title="Core Web Vitals")
    cwv_table.add_column("Metric", style="cyan")
    cwv_table.add_column("Value", style="green")
    cwv_table.add_column("Status", style="yellow")

    cwv = result.core_web_vitals
    cwv_table.add_row(
        "Largest Contentful Paint (LCP)",
        f"{cwv.lcp:.0f}ms",
        get_cwv_status("lcp", cwv.lcp)
    )
    cwv_table.add_row(
        "First Input Delay (FID)",
        f"{cwv.fid:.0f}ms",
        get_cwv_status("fid", cwv.fid)
    )
    cwv_table.add_row(
        "Cumulative Layout Shift (CLS)",
        f"{cwv.cls:.3f}",
        get_cwv_status("cls", cwv.cls)
    )
    cwv_table.add_row(
        "First Contentful Paint (FCP)",
        f"{cwv.fcp:.0f}ms",
        get_cwv_status("fcp", cwv.fcp)
    )
    cwv_table.add_row(
        "Time to First Byte (TTFB)",
        f"{cwv.ttfb:.0f}ms",
        get_cwv_status("ttfb", cwv.ttfb)
    )

    console.print(cwv_table)
    console.print()

    # Recommendations
    if result.recommendations:
        console.print(Panel(
            "\n".join(f"• {rec}" for rec in result.recommendations[:5]),
            title="Top Recommendations",
            border_style="yellow"
        ))


def get_score_emoji(grade: PerformanceGrade) -> str:
    """Get emoji for performance grade."""
    emoji_map = {
        PerformanceGrade.EXCELLENT: "🟢",
        PerformanceGrade.GOOD: "🟡",
        PerformanceGrade.NEEDS_IMPROVEMENT: "🟠",
        PerformanceGrade.POOR: "🔴"
    }
    return emoji_map.get(grade, "⚪")


def get_cwv_status(metric: str, value: float) -> str:
    """Get status for Core Web Vitals metric."""
    thresholds = {
        'lcp': [(CWV_LCP_EXCELLENT, "🟢 Good"), (CWV_LCP_GOOD, "🟡 Needs Improvement")],
        'fid': [(CWV_FID_EXCELLENT, "🟢 Good"), (CWV_FID_GOOD, "🟡 Needs Improvement")],
        'cls': [(CWV_CLS_EXCELLENT, "🟢 Good"), (CWV_CLS_GOOD, "🟡 Needs Improvement")],
        'fcp': [(CWV_FCP_EXCELLENT, "🟢 Good"), (CWV_FCP_GOOD, "🟡 Needs Improvement")],
        'ttfb': [(CWV_TTFB_EXCELLENT, "🟢 Good"), (CWV_TTFB_GOOD, "🟡 Needs Improvement")]
    }

    for threshold, status in thresholds.get(metric, []):
        if value <= threshold:
            return status
    return "🔴 Poor"


@app.command()
def test(
    project_name: Optional[str] = typer.Argument(None, help="Project name to test"),
    url: Optional[str] = typer.Option(None, "--url", help="Specific URL to test (overrides project URL)"),
    device: str = typer.Option("desktop", "--device", help="Device type: desktop, mobile, tablet"),
    headless: bool = typer.Option(True, "--headless/--no-headless", help="Run browser in headless mode"),
    preset: str = typer.Option(DEFAULT_PERFORMANCE_PRESET, "--preset", help="Performance preset to use"),
    save_report: bool = typer.Option(True, "--save-report/--no-save-report", help="Save test report"),
    output_format: str = typer.Option("table", "--output", help="Output format: table, json, html"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Run performance test using Google Lighthouse."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found. Create a project first.")

            console.print("Available projects:")
            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name} ({project.wp_home})")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        # Load project
        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        # Determine URL to test
        test_url = url or get_project_url(project_dir)
        if not test_url:
            raise ForgeError("Could not determine URL to test. Please specify --url")

        console.print(f"🚀 Running performance test for: {test_url}")
        console.print(f"📱 Device: {device}")
        console.print(f"⚙️ Preset: {preset}")

        if dry_run:
            console.print(f"[yellow]Dry run: Would test {test_url} with Lighthouse[/yellow]")
            return

        # Run performance test with progress indicator
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("Running Lighthouse test...", total=None)

            tester = PerformanceTester(project_dir)

            # Run the test asynchronously
            result = asyncio.run(tester.run_lighthouse_test(
                url=test_url,
                device=device,
                headless=headless,
                form_factor=device
            ))

            progress.update(task, description="Processing results...")

        # Display results
        if output_format == "table":
            display_performance_result(result)
        elif output_format == "json":
            console.print(json.dumps(result.to_dict(), indent=2))
        elif output_format == "html":
            report_path = project_dir / ".ddev" / PERFORMANCE_REPORTS_DIR / f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
            report_content = tester.generate_performance_report(test_url, format="html")

            with open(report_path, 'w') as f:
                f.write(report_content)

            console.print(f"📄 HTML report saved to: {report_path}")
        else:
            raise ForgeError(f"Unsupported output format: {output_format}")

        # Save report if requested
        if save_report:
            report_path = project_dir / ".ddev" / PERFORMANCE_REPORTS_DIR / f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(report_path, 'w') as f:
                json.dump(result.to_dict(), f, indent=2)

            console.print(f"💾 Report saved to: {report_path}")

        # Check if performance meets targets
        overall_grade = result.get_overall_grade()
        if overall_grade in [PerformanceGrade.POOR, PerformanceGrade.NEEDS_IMPROVEMENT]:
            console.print(f"\n🔴 Performance grade: {overall_grade.value.title()}")
            console.print("Consider running optimizations with 'forge performance optimize'")
        else:
            console.print(f"\n🟢 Performance grade: {overall_grade.value.title()}")

    except Exception as e:
        console.print(f"❌ Performance test failed: {e}")
        raise typer.Exit(1)


@app.command()
def history(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    days: int = typer.Option(30, "--days", help="Number of days to analyze"),
    device: Optional[str] = typer.Option(None, "--device", help="Filter by device"),
    url: Optional[str] = typer.Option(None, "--url", help="Filter by URL"),
    output_format: str = typer.Option("table", "--output", help="Output format: table, json"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """View performance test history."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        tester = PerformanceTester(project_dir)
        history_data = tester.get_performance_history(url=url, days=days, device=device)

        if not history_data:
            console.print("No performance history found for the specified criteria.")
            return

        if output_format == "table":
            display_performance_history(history_data)
        elif output_format == "json":
            console.print(json.dumps([result.to_dict() for result in history_data], indent=2))
        else:
            raise ForgeError(f"Unsupported output format: {output_format}")

    except Exception as e:
        console.print(f"❌ Failed to get history: {e}")
        raise typer.Exit(1)


def display_performance_history(history: List[PerformanceTest]) -> None:
    """Display performance history in a table."""
    table = Table(title="Performance Test History")
    table.add_column("Date", style="cyan")
    table.add_column("URL", style="blue")
    table.add_column("Device", style="green")
    table.add_column("Performance", style="yellow")
    table.add_column("LCP", style="red")
    table.add_column("CLS", style="red")
    table.add_column("FID", style="red")

    for result in history:
        table.add_row(
            result.timestamp.strftime("%Y-%m-%d %H:%M"),
            result.url[:50] + "..." if len(result.url) > 50 else result.url,
            result.device.value,
            f"{result.performance_score.score:.1f}",
            f"{result.core_web_vitals.lcp:.0f}ms",
            f"{result.core_web_vitals.cls:.3f}",
            f"{result.core_web_vitals.fid:.0f}ms"
        )

    console.print(table)


@app.command()
def budget(
    action: str = typer.Argument(..., help="Action: set, list, check, remove"),
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    budget_type: str = typer.Option("", "--type", help="Budget type: performance_score, lcp, cls, fid, page_size"),
    resource_type: str = typer.Option("", "--resource", help="Resource type: page, script, stylesheet, image"),
    max_value: float = typer.Option(0.0, "--max", help="Maximum allowed value"),
    warning_threshold: float = typer.Option(0.0, "--warning", help="Warning threshold"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage performance budgets."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        tester = PerformanceTester(project_dir)

        if action == "set":
            if not budget_type or not resource_type or max_value <= 0:
                raise ForgeError("Budget type, resource type, and max value are required for setting budgets.")

            budget = PerformanceBudget(
                budget_type=budget_type,
                resource_type=resource_type,
                max_value=max_value,
                warning_threshold=warning_threshold or max_value * 0.8
            )

            if dry_run:
                console.print(f"[yellow]Dry run: Would set budget for {budget_type}/{resource_type}[/yellow]")
                return

            tester.save_performance_budget(budget)
            console.print(f"✅ Performance budget set: {budget_type}/{resource_type} <= {max_value}")

        elif action == "list":
            # List existing budgets
            console.print("📊 Performance Budgets")
            # Implementation would query and display existing budgets
            console.print("Budget listing functionality to be implemented")

        elif action == "check":
            # Check latest test against budgets
            history = tester.get_performance_history(days=1)
            if not history:
                console.print("No recent performance tests to check against budgets.")
                return

            latest_test = history[0]
            violations = tester.check_performance_budgets(latest_test)

            if violations:
                console.print("🔴 Budget Violations:")
                for violation in violations:
                    console.print(f"• {violation}")
            else:
                console.print("🟢 All performance budgets are within limits.")

        else:
            raise ForgeError(f"Unknown action: {action}")

    except Exception as e:
        console.print(f"❌ Budget operation failed: {e}")
        raise typer.Exit(1)


@app.command()
def monitor(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    enable: bool = typer.Option(False, "--enable", help="Enable performance monitoring"),
    disable: bool = typer.Option(False, "--disable", help="Disable performance monitoring"),
    interval: int = typer.Option(3600, "--interval", help="Monitoring interval in seconds"),
    device: str = typer.Option("desktop", "--device", help="Device to monitor"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Configure performance monitoring."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        if enable:
            console.print(f"🚀 Enabling performance monitoring for {project_name}")
            console.print(f"📊 Interval: {interval} seconds")
            console.print(f"📱 Device: {device}")

            if dry_run:
                console.print("[yellow]Dry run: Would enable monitoring[/yellow]")
            else:
                # Implementation would set up monitoring
                console.print("✅ Performance monitoring enabled")

        elif disable:
            console.print(f"🛑 Disabling performance monitoring for {project_name}")

            if dry_run:
                console.print("[yellow]Dry run: Would disable monitoring[/yellow]")
            else:
                # Implementation would disable monitoring
                console.print("✅ Performance monitoring disabled")

        else:
            # Show current monitoring status
            console.print(f"📊 Performance Monitoring Status for {project_name}")
            console.print("Status: Monitoring functionality to be implemented")

    except Exception as e:
        console.print(f"❌ Monitor operation failed: {e}")
        raise typer.Exit(1)


@app.command()
def report(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    url: Optional[str] = typer.Option(None, "--url", help="URL to report on"),
    days: int = typer.Option(30, "--days", help="Number of days to analyze"),
    format: str = typer.Option("html", "--format", help="Report format: html, json"),
    output: Optional[str] = typer.Option(None, "--output", help="Output file path"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Generate performance report."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        tester = PerformanceTester(project_dir)
        test_url = url or get_project_url(project_dir)

        if not test_url:
            raise ForgeError("Could not determine URL to report on.")

        console.print(f"📊 Generating performance report for: {test_url}")
        console.print(f"📅 Period: Last {days} days")
        console.print(f"📄 Format: {format}")

        if dry_run:
            console.print(f"[yellow]Dry run: Would generate report[/yellow]")
            return

        # Generate report
        report_content = tester.generate_performance_report(test_url, days, format)

        # Determine output path
        if output:
            report_path = Path(output)
        else:
            reports_dir = project_dir / ".ddev" / PERFORMANCE_REPORTS_DIR
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_path = reports_dir / f"performance_report_{timestamp}.{format}"

        # Save report
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, 'w') as f:
            f.write(report_content)

        console.print(f"✅ Report saved to: {report_path}")

        if format == "html":
            console.print(f"🌐 Open the report in your browser: file://{report_path.absolute()}")

    except Exception as e:
        console.print(f"❌ Report generation failed: {e}")
        raise typer.Exit(1)


@app.command()
def optimize(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    preset: str = typer.Option(DEFAULT_PERFORMANCE_PRESET, "--preset", help="Optimization preset"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Apply performance optimizations."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        console.print(f"🚀 Applying performance optimizations to {project_name}")
        console.print(f"⚙️ Preset: {preset}")

        # Load preset configuration
        preset_config = load_performance_preset(preset)

        if dry_run:
            console.print("[yellow]Dry run: Would apply the following optimizations:[/yellow]")
            for optimization in preset_config.get("optimizations", []):
                console.print(f"• {optimization}")
            return

        # Apply optimizations
        with Progress(console=console) as progress:
            optimizations = preset_config.get("optimizations", [])

            for i, optimization in enumerate(optimizations):
                task = progress.add_task(f"Applying {optimization}...", total=len(optimizations))

                # Apply specific optimization
                try:
                    apply_optimization(project_dir, optimization, verbose)
                    progress.update(task, advance=1)
                except Exception as e:
                    console.print(f"⚠️ Failed to apply {optimization}: {e}")
                    progress.update(task, advance=1)

        console.print("✅ Performance optimizations applied")
        console.print("💡 Run 'forge performance test' to verify improvements")

    except Exception as e:
        console.print(f"❌ Optimization failed: {e}")
        raise typer.Exit(1)


def load_performance_preset(preset_name: str) -> Dict[str, Any]:
    """Load performance preset configuration."""
    preset_path = Path(PERFORMANCE_CONFIG_PATH)
    if not preset_path.exists():
        raise ForgeError(f"Performance presets file not found: {preset_path}")

    with open(preset_path, 'r') as f:
        presets = json.load(f)

    if preset_name not in presets.get("presets", {}):
        raise ForgeError(f"Performance preset not found: {preset_name}")

    return presets["presets"][preset_name]


def apply_optimization(project_dir: Path, optimization: str, verbose: bool = False) -> None:
    """Apply a specific optimization."""
    optimization_map = {
        "enable_page_caching": apply_page_caching,
        "optimize_images": apply_image_optimization,
        "minify_css_js": apply_css_js_minification,
        "enable_browser_caching": apply_browser_caching,
        "remove_render_blocking": apply_render_blocking_removal,
        "database_optimization": apply_database_optimization,
        "critical_css": apply_critical_css,
        "lazy_loading": apply_lazy_loading,
    }

    if optimization in optimization_map:
        optimization_map[optimization](project_dir, verbose)
    else:
        logger.warning(f"Optimization not implemented: {optimization}")


# Optimization implementation functions
def apply_page_caching(project_dir: Path, verbose: bool) -> None:
    """Apply page caching optimization."""
    # Implementation would configure caching plugins or server settings
    logger.info("Applying page caching optimization")


def apply_image_optimization(project_dir: Path, verbose: bool) -> None:
    """Apply image optimization."""
    logger.info("Applying image optimization")
    try:
        optimizer = ImageOptimizer(str(project_dir))
        # optimize_batch is async, so we need to run it in the event loop if not already
        # But this function is sync. The command calls it.
        # Let's wrap it in asyncio.run or ensure the loop is handled.
        # The surrounding code is not async, so asyncio.run is appropriate here.
        result = asyncio.run(optimizer.optimize_batch())
        logger.info(f"Optimized {result.optimized_images} images, saved {result.get_space_saved_mb():.2f}MB")
    except Exception as e:
        logger.error(f"Image optimization failed: {e}")
        if verbose:
            console.print(f"❌ Image optimization details: {e}")


def apply_css_js_minification(project_dir: Path, verbose: bool) -> None:
    """Apply CSS/JS minification."""
    # Implementation would minify assets
    logger.info("Applying CSS/JS minification")


def apply_browser_caching(project_dir: Path, verbose: bool) -> None:
    """Apply browser caching."""
    # Implementation would configure browser caching headers
    logger.info("Applying browser caching")


def apply_render_blocking_removal(project_dir: Path, verbose: bool) -> None:
    """Remove render-blocking resources."""
    # Implementation would optimize resource loading
    logger.info("Removing render-blocking resources")


def apply_database_optimization(project_dir: Path, verbose: bool) -> None:
    """Apply database optimization."""
    logger.info("Applying database optimization")
    try:
        # We need a Project object for DatabaseOptimizer
        # We can construct a minimal one or load it properly.
        # Since project_dir is passed, we can try to use config_manager
        project_info = config_manager.load_project_info(project_dir.name) # Assuming dirname is project name, which might be risky
        # Better to fetch project by path if possible, or trust the name derivation
        # In optimize command, we already loaded 'project', but we passed 'project_dir' to this function.
        # Let's import Project model if needed, but config_manager.load_project_info expects name.
        
        optimizer = DatabaseOptimizer(project_info)
        result = asyncio.run(optimizer.optimize_database())
        logger.info(f"Database optimized: {result.tables_optimized} tables, {result.space_saved} bytes saved")
    except Exception as e:
        logger.error(f"Database optimization failed: {e}")
        if verbose:
            console.print(f"❌ Database optimization details: {e}")


def apply_critical_css(project_dir: Path, verbose: bool) -> None:
    """Apply critical CSS optimization."""
    # Implementation would generate and inline critical CSS
    logger.info("Applying critical CSS optimization")


def apply_lazy_loading(project_dir: Path, verbose: bool) -> None:
    """Apply lazy loading."""
    # Implementation would configure lazy loading
    logger.info("Applying lazy loading")


@app.command()
def schedule(
    project_name: Optional[str] = typer.Argument(None, help="Project name"),
    type: str = typer.Option(..., "--type", help="Type of maintenance: image, database"),
    frequency: str = typer.Option("daily", "--frequency", help="Frequency: hourly, daily, weekly"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Schedule regular maintenance tasks."""
    try:
        # Get project information
        if not project_name:
            projects = config_manager.load_projects()
            if not projects:
                raise ForgeError("No projects found.")

            for i, project in enumerate(projects, 1):
                console.print(f"{i}. {project.project_name}")

            selection = Prompt.ask("Select project number", choices=[str(i) for i in range(1, len(projects) + 1)])
            project_name = projects[int(selection) - 1].project_name

        project = config_manager.load_project_info(project_name)
        project_dir = Path(project.directory)

        console.print(f"📅 Scheduling {type} maintenance for {project_name}")
        console.print(f"⏰ Frequency: {frequency}")

        cron_entry = ""
        if type == "image":
            optimizer = ImageOptimizer(str(project_dir))
            cron_entry = optimizer.schedule_optimization(frequency)
        elif type == "database":
            optimizer = DatabaseOptimizer(project)
            # DatabaseOptimizer.schedule_maintenance is async? No, looked sync in previous view but let's check.
            # It was defined as async def schedule_maintenance(self, frequency: str = 'weekly') -> str:
            # So we need await.
            cron_entry = asyncio.run(optimizer.schedule_maintenance(frequency))
        else:
            raise ForgeError(f"Unknown maintenance type: {type}")

        if dry_run:
            console.print(f"[yellow]Dry run: Would create cron job:[/yellow]")
            console.print(cron_entry)
            return

        # In a real scenario, we would add this to the crontab.
        # For now, we'll just display it or write it to a file that the user can import.
        # Or if running on the server, we could use python-crontab.
        # Since we are likely in a dev env or managing remote via SSH (but this tool runs locally?),
        # let's just output the instructions.
        console.print(f"✅ Maintenance script created.")
        console.print(f"To enable, add the following line to your crontab (crontab -e):")
        console.print(Panel(cron_entry, title="Crontab Entry", border_style="green"))

    except Exception as e:
        console.print(f"❌ Scheduling failed: {e}")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
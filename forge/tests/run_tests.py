#!/usr/bin/env python3
"""
Comprehensive test runner for bedrock-forge.

This script provides a convenient way to run different types of tests
with appropriate configurations and reporting.
"""

import os
import sys
import argparse
import subprocess
from pathlib import Path


def run_command(cmd, cwd=None, check=True):
    """Run a command and return the result."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)
    return result


def run_unit_tests(coverage=True, verbose=False, marker=None):
    """Run unit tests."""
    cmd = ["python", "-m", "pytest", "tests/unit/"]

    if verbose:
        cmd.append("-v")

    if coverage:
        cmd.extend([
            "--cov=forge",
            "--cov-report=html",
            "--cov-report=term-missing",
            "--cov-report=xml",
            "--cov-fail-under=80"
        ])

    if marker:
        cmd.extend(["-m", marker])
    else:
        cmd.extend(["-m", "not integration and not external"])

    result = run_command(cmd, cwd="forge")
    return result.returncode == 0


def run_integration_tests(verbose=False):
    """Run integration tests."""
    cmd = [
        "python", "-m", "pytest", "tests/integration/",
        "-v",
        "--timeout=60",
        "--cov=forge",
        "--cov-report=html",
        "--cov-report=term-missing",
        "--cov-append",
        "-m", "integration"
    ]

    if verbose:
        cmd.append("-vv")

    result = run_command(cmd, cwd="forge")
    return result.returncode == 0


def run_all_tests(coverage=True, verbose=False):
    """Run all tests."""
    print("Running all tests...")

    # Run unit tests first
    unit_success = run_unit_tests(coverage=coverage, verbose=verbose)
    if not unit_success:
        print("❌ Unit tests failed!")
        return False

    # Run integration tests
    integration_success = run_integration_tests(verbose=verbose)
    if not integration_success:
        print("❌ Integration tests failed!")
        return False

    print("✅ All tests passed!")
    return True


def run_specific_tests(test_path, verbose=False):
    """Run specific tests."""
    cmd = ["python", "-m", "pytest", test_path]

    if verbose:
        cmd.append("-v")

    result = run_command(cmd, cwd="forge")
    return result.returncode == 0


def run_performance_tests():
    """Run performance tests."""
    cmd = [
        "python", "-m", "pytest", "tests/",
        "-v",
        "-m", "slow",
        "--timeout=300"
    ]

    result = run_command(cmd, cwd="forge")
    return result.returncode == 0


def generate_coverage_report():
    """Generate detailed coverage report."""
    cmd = [
        "python", "-m", "pytest", "tests/",
        "--cov=forge",
        "--cov-report=html",
        "--cov-report=xml",
        "--cov-report=annotate"
    ]

    result = run_command(cmd, cwd="forge")

    if result.returncode == 0:
        print("📊 Coverage report generated:")
        print("  - HTML: forge/htmlcov/index.html")
        print("  - XML: forge/coverage.xml")
        print("  - Annotated: forge/forge_cover.html")

    return result.returncode == 0


def lint_code():
    """Run code linting."""
    print("Running code linting...")

    linters = [
        (["flake8", "--count", "--select=E9,F63,F7,F82", "--show-source", "--statistics"], "flake8 strict"),
        (["flake8", "--count", "--exit-zero", "--max-complexity=10", "--max-line-length=127", "--statistics"], "flake8"),
        (["black", "--check", "--diff", "."], "black"),
        (["isort", "--check-only", "--diff", "."], "isort")
    ]

    all_passed = True

    for cmd, name in linters:
        try:
            result = run_command(cmd, cwd="forge", check=False)
            if result.returncode != 0:
                print(f"❌ {name} failed")
                all_passed = False
            else:
                print(f"✅ {name} passed")
        except Exception as e:
            print(f"❌ {name} error: {e}")
            all_passed = False

    return all_passed


def run_security_tests():
    """Run security tests."""
    print("Running security tests...")

    security_tools = [
        (["bandit", "-r", ".", "-f", "json", "-o", "bandit-report.json"], "bandit"),
        (["safety", "check", "--json", "--output", "safety-report.json"], "safety")
    ]

    all_passed = True

    for cmd, name in security_tools:
        try:
            result = run_command(cmd, cwd="forge", check=False)
            if result.returncode != 0:
                print(f"⚠️ {name} found issues")
            else:
                print(f"✅ {name} passed")
        except Exception as e:
            print(f"❌ {name} error: {e}")
            all_passed = False

    return all_passed


def clean_test_artifacts():
    """Clean up test artifacts."""
    print("Cleaning test artifacts...")

    artifacts = [
        ".coverage",
        "coverage.xml",
        "htmlcov/",
        ".pytest_cache/",
        "bandit-report.json",
        "safety-report.json",
        "**/__pycache__/",
        "**/*.pyc"
    ]

    for pattern in artifacts:
        if pattern.endswith("/"):
            # Directory
            for path in Path("forge").glob(pattern):
                if path.is_dir():
                    import shutil
                    shutil.rmtree(path)
                    print(f"Removed directory: {path}")
        else:
            # File pattern
            for path in Path("forge").glob(pattern):
                if path.is_file():
                    path.unlink()
                    print(f"Removed file: {path}")


def main():
    """Main test runner."""
    parser = argparse.ArgumentParser(description="Test runner for bedrock-forge")
    parser.add_argument("command", choices=[
        "unit", "integration", "all", "specific", "coverage", "lint",
        "security", "performance", "clean"
    ], help="Command to run")

    parser.add_argument("--path", help="Specific test path (for 'specific' command)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--no-coverage", action="store_true", help="Skip coverage reporting")
    parser.add_argument("--marker", "-m", help="Pytest marker filter")

    args = parser.parse_args()

    # Ensure we're in the right directory
    if not Path("forge").exists():
        print("❌ Error: forge directory not found. Run from project root.")
        sys.exit(1)

    success = True

    if args.command == "unit":
        success = run_unit_tests(
            coverage=not args.no_coverage,
            verbose=args.verbose,
            marker=args.marker
        )

    elif args.command == "integration":
        success = run_integration_tests(verbose=args.verbose)

    elif args.command == "all":
        success = run_all_tests(
            coverage=not args.no_coverage,
            verbose=args.verbose
        )

    elif args.command == "specific":
        if not args.path:
            print("❌ Error: --path required for 'specific' command")
            sys.exit(1)
        success = run_specific_tests(args.path, verbose=args.verbose)

    elif args.command == "coverage":
        success = generate_coverage_report()

    elif args.command == "lint":
        success = lint_code()

    elif args.command == "security":
        success = run_security_tests()

    elif args.command == "performance":
        success = run_performance_tests()

    elif args.command == "clean":
        clean_test_artifacts()
        success = True

    if success:
        print("\n✅ Command completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Command failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
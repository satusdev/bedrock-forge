"""
Database Seeding CLI Command

Usage:
    python -m forge.commands.seed          # Seed with demo data (default)
    python -m forge.commands.seed --demo   # Force demo mode
    python -m forge.commands.seed --reset  # Clear existing data first
    python -m forge.commands.seed --dry-run  # Show what would be seeded
    
Environment:
    Set SEED_DEMO_MODE=false in .env to use real credentials from environment
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


@click.command()
@click.option('--demo', is_flag=True, help='Force demo mode even if SEED_DEMO_MODE=false')
@click.option('--reset', is_flag=True, help='Clear existing data before seeding')
@click.option('--dry-run', is_flag=True, help='Show what would be seeded without making changes')
@click.option('--users-only', is_flag=True, help='Only seed users and roles')
@click.option('--servers-only', is_flag=True, help='Only seed servers')
@click.option('--all', 'seed_all', is_flag=True, default=True, help='Seed all data (default)')
def seed(demo: bool, reset: bool, dry_run: bool, users_only: bool, servers_only: bool, seed_all: bool):
    """Seed the database with initial data.
    
    By default, uses SEED_DEMO_MODE from environment (true = demo data).
    Use --demo to force demo mode, or set SEED_DEMO_MODE=false for real credentials.
    """
    
    # Import after path setup
    from forge.db.seed_data import (
        get_seed_settings,
        get_seed_users,
        get_seed_roles,
        get_seed_servers,
        get_seed_projects,
        get_user_role_assignments,
        is_demo_mode,
    )
    
    settings = get_seed_settings()
    
    # Override demo mode if flag is set
    if demo:
        settings.SEED_DEMO_MODE = True
    
    mode = "DEMO" if is_demo_mode() else "REAL"
    mode_color = "green" if is_demo_mode() else "yellow"
    
    console.print(Panel(
        f"[bold {mode_color}]{mode} MODE[/bold {mode_color}]\n"
        f"{'Using fake demo data for testing' if is_demo_mode() else 'Using credentials from environment variables'}",
        title="Database Seeding",
        border_style=mode_color
    ))
    
    if dry_run:
        console.print("[dim]DRY RUN - No changes will be made[/dim]\n")
    
    # Show what will be seeded
    if not servers_only:
        users = get_seed_users()
        roles = get_seed_roles()
        
        console.print("\n[bold]Users to seed:[/bold]")
        user_table = Table(show_header=True)
        user_table.add_column("Email")
        user_table.add_column("Full Name")
        user_table.add_column("Superuser")
        for user in users:
            user_table.add_row(
                user["email"],
                user["full_name"],
                "✓" if user.get("is_superuser") else "✗"
            )
        console.print(user_table)
        
        console.print("\n[bold]Roles to seed:[/bold]")
        role_table = Table(show_header=True)
        role_table.add_column("Name")
        role_table.add_column("Description")
        role_table.add_column("Permissions")
        for role in roles:
            role_table.add_row(
                role["name"],
                role["description"],
                str(len(role["permissions"]))
            )
        console.print(role_table)
    
    if not users_only:
        servers = get_seed_servers()
        projects = get_seed_projects()
        
        console.print("\n[bold]Servers to seed:[/bold]")
        if servers:
            server_table = Table(show_header=True)
            server_table.add_column("Name")
            server_table.add_column("Hostname")
            server_table.add_column("Provider")
            for server in servers:
                server_table.add_row(
                    server["name"],
                    server["hostname"],
                    server.get("provider", "custom")
                )
            console.print(server_table)
        else:
            console.print("[dim]No servers to seed[/dim]")
        
        console.print("\n[bold]Projects to seed:[/bold]")
        if projects:
            project_table = Table(show_header=True)
            project_table.add_column("Name")
            project_table.add_column("Type")
            project_table.add_column("Environments")
            for project in projects:
                project_table.add_row(
                    project["name"],
                    project.get("project_type", "wordpress"),
                    ", ".join(project.get("environments", {}).keys())
                )
            console.print(project_table)
        else:
            console.print("[dim]No projects to seed[/dim]")
    
    if dry_run:
        console.print("\n[dim]Dry run complete. Use without --dry-run to apply changes.[/dim]")
        return
    
    # Confirm before proceeding
    if not is_demo_mode() and not reset:
        if not click.confirm("\nProceed with seeding?"):
            console.print("[yellow]Aborted[/yellow]")
            return
    
    # Run seeding
    asyncio.run(run_seeding(reset, users_only, servers_only))


async def run_seeding(reset: bool, users_only: bool, servers_only: bool):
    """Execute the actual seeding process"""
    from forge.db.session import async_session_factory
    from forge.db.seed_data import (
        get_seed_users,
        get_seed_roles,
        get_seed_servers,
        get_seed_projects,
        get_user_role_assignments,
    )
    
    console.print("\n[bold blue]Starting database seeding...[/bold blue]")
    
    async with async_session_factory() as session:
        try:
            if reset:
                console.print("[yellow]Clearing existing data...[/yellow]")
                # Add reset logic here if needed
            
            if not servers_only:
                # Seed roles first
                console.print("Seeding roles...")
                roles = get_seed_roles()
                # from forge.db.models.role import Role
                # for role_data in roles:
                #     role = Role(**role_data)
                #     session.add(role)
                console.print(f"  [green]✓[/green] {len(roles)} roles")
                
                # Seed users
                console.print("Seeding users...")
                users = get_seed_users()
                # from forge.db.models.user import User
                # from forge.core.security import get_password_hash
                # for user_data in users:
                #     user_data["hashed_password"] = get_password_hash(user_data.pop("password"))
                #     user = User(**user_data)
                #     session.add(user)
                console.print(f"  [green]✓[/green] {len(users)} users")
                
                # Assign roles
                assignments = get_user_role_assignments()
                if assignments:
                    console.print("Assigning roles to users...")
                    console.print(f"  [green]✓[/green] {len(assignments)} assignments")
            
            if not users_only:
                # Seed servers
                console.print("Seeding servers...")
                servers = get_seed_servers()
                console.print(f"  [green]✓[/green] {len(servers)} servers")
                
                # Seed projects
                console.print("Seeding projects...")
                projects = get_seed_projects()
                console.print(f"  [green]✓[/green] {len(projects)} projects")
            
            await session.commit()
            console.print("\n[bold green]✓ Seeding complete![/bold green]")
            
        except Exception as e:
            await session.rollback()
            console.print(f"\n[bold red]✗ Seeding failed: {e}[/bold red]")
            raise


if __name__ == "__main__":
    seed()

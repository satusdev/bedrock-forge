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
    from sqlalchemy import select
    from forge.db.session import AsyncSessionLocal
    from forge.db.seed_data import (
        get_seed_users,
        get_seed_roles,
        get_seed_servers,
        get_seed_projects,
        get_user_role_assignments,
    )
    from forge.api.security import hash_password
    from forge.db.models import (
        User,
        Role,
        Permission,
        Server,
        ServerProvider,
        ServerStatus,
        PanelType,
        Project,
        ProjectStatus,
        EnvironmentType,
    )
    from forge.db.models.role import DEFAULT_PERMISSIONS, role_permissions, user_roles

    def parse_enum(enum_cls, raw_value, default):
        if raw_value is None:
            return default
        if isinstance(raw_value, enum_cls):
            return raw_value
        if isinstance(raw_value, str):
            value = raw_value.strip()
            if not value:
                return default
            normalized = value.lower()
            try:
                return enum_cls(normalized)
            except ValueError:
                try:
                    return enum_cls(value)
                except ValueError:
                    return default
        return default
    
    console.print("\n[bold blue]Starting database seeding...[/bold blue]")
    
    async with AsyncSessionLocal() as session:
        try:
            if reset:
                console.print("[yellow]Clearing existing data...[/yellow]")
                # Add reset logic here if needed
            
            permission_defaults = {p["code"]: p for p in DEFAULT_PERMISSIONS}

            async def get_or_create_permission(code: str) -> Permission:
                result = await session.execute(select(Permission).where(Permission.code == code))
                permission = result.scalar_one_or_none()
                if permission:
                    return permission

                meta = permission_defaults.get(code, {})
                permission = Permission(
                    code=code,
                    name=meta.get("name", code),
                    description=meta.get("description"),
                    category=meta.get("category", "custom")
                )
                session.add(permission)
                await session.flush()
                return permission

            async def generate_unique_username(base: str) -> str:
                candidate = base
                suffix = 1
                while True:
                    result = await session.execute(
                        select(User).where(User.username == candidate)
                    )
                    if result.scalar_one_or_none() is None:
                        return candidate
                    candidate = f"{base}{suffix}"
                    suffix += 1

            if not servers_only:
                # Seed roles first
                console.print("Seeding roles...")
                roles = get_seed_roles()
                role_map: dict[str, Role] = {}

                for role_data in roles:
                    result = await session.execute(
                        select(Role).where(Role.name == role_data["name"])
                    )
                    role = result.scalar_one_or_none()
                    if role is None:
                        role = Role(
                            name=role_data["name"],
                            display_name=role_data.get("display_name") or role_data["name"].title(),
                            description=role_data.get("description"),
                            color=role_data.get("color", "#6366f1"),
                            is_system=role_data.get("is_system", True)
                        )
                        session.add(role)
                    await session.flush()

                    permissions: list[Permission] = []
                    for perm_code in role_data.get("permissions", []):
                        permission = await get_or_create_permission(perm_code)
                        permissions.append(permission)

                    if permissions:
                        await session.flush()
                        await session.execute(
                            role_permissions.delete().where(
                                role_permissions.c.role_id == role.id
                            )
                        )
                        await session.execute(
                            role_permissions.insert(),
                            [
                                {"role_id": role.id, "permission_id": perm.id}
                                for perm in permissions
                            ]
                        )
                    role_map[role.name] = role

                console.print(f"  [green]✓[/green] {len(roles)} roles")

                # Seed users
                console.print("Seeding users...")
                users = get_seed_users()
                user_map: dict[str, User] = {}

                for user_data in users:
                    email = user_data["email"]
                    result = await session.execute(select(User).where(User.email == email))
                    user = result.scalar_one_or_none()

                    if user is None:
                        username_base = email.split("@", 1)[0]
                        username = await generate_unique_username(username_base)
                        user = User(
                            email=email,
                            username=username,
                            hashed_password=hash_password(user_data["password"]),
                            full_name=user_data.get("full_name"),
                            is_active=user_data.get("is_active", True),
                            is_superuser=user_data.get("is_superuser", False)
                        )
                        session.add(user)
                        await session.flush()
                    else:
                        user.full_name = user_data.get("full_name", user.full_name)
                        user.is_active = user_data.get("is_active", user.is_active)
                        user.is_superuser = user_data.get("is_superuser", user.is_superuser)
                        if user_data.get("password"):
                            user.hashed_password = hash_password(user_data["password"])

                    user_map[email] = user

                console.print(f"  [green]✓[/green] {len(users)} users")

                # Assign roles
                assignments = get_user_role_assignments()
                if assignments:
                    console.print("Assigning roles to users...")
                    for assignment in assignments:
                        user = user_map.get(assignment["email"])
                        role = role_map.get(assignment["role"])
                        if user and role:
                            await session.execute(
                                user_roles.delete().where(
                                    user_roles.c.user_id == user.id
                                )
                            )
                            await session.execute(
                                user_roles.insert().values(
                                    user_id=user.id,
                                    role_id=role.id
                                )
                            )
                    console.print(f"  [green]✓[/green] {len(assignments)} assignments")

            if not users_only:
                # Seed servers
                console.print("Seeding servers...")
                servers = get_seed_servers()
                owner = None
                if "user_map" in locals() and user_map:
                    owner = next(iter(user_map.values()))
                else:
                    result = await session.execute(select(User).order_by(User.id.asc()))
                    owner = result.scalars().first()

                for server_data in servers:
                    result = await session.execute(
                        select(Server).where(Server.hostname == server_data["hostname"])
                    )
                    server = result.scalar_one_or_none()
                    if server is None:
                        server = Server(
                            name=server_data["name"],
                            hostname=server_data["hostname"],
                            provider=parse_enum(
                                ServerProvider,
                                server_data.get("provider"),
                                ServerProvider.CUSTOM,
                            ),
                            status=parse_enum(
                                ServerStatus,
                                server_data.get("status"),
                                ServerStatus.OFFLINE,
                            ),
                            ssh_user=server_data.get("ssh_user", "root"),
                            ssh_port=server_data.get("ssh_port", 22),
                            ssh_key_path=server_data.get("ssh_key_path"),
                            panel_type=parse_enum(
                                PanelType,
                                server_data.get("panel_type"),
                                PanelType.NONE,
                            ),
                            panel_url=server_data.get("panel_url"),
                            owner_id=owner.id if owner else None,
                        )
                        session.add(server)

                console.print(f"  [green]✓[/green] {len(servers)} servers")

                # Seed projects
                console.print("Seeding projects...")
                projects = get_seed_projects()
                for project_data in projects:
                    result = await session.execute(
                        select(Project).where(Project.slug == project_data["slug"])
                    )
                    project = result.scalar_one_or_none()
                    if project is None:
                        project = Project(
                            name=project_data["name"],
                            slug=project_data["slug"],
                            description=project_data.get("description"),
                            path=project_data.get("directory", project_data.get("path", "/var/www")),
                            status=ProjectStatus(project_data.get("status", "active")),
                            environment=EnvironmentType(project_data.get("environment", "development")),
                            owner_id=owner.id if owner else None,
                        )
                        session.add(project)
                console.print(f"  [green]✓[/green] {len(projects)} projects")
            
            await session.commit()
            console.print("\n[bold green]✓ Seeding complete![/bold green]")
            
        except Exception as e:
            await session.rollback()
            console.print(f"\n[bold red]✗ Seeding failed: {e}[/bold red]")
            raise


if __name__ == "__main__":
    seed()

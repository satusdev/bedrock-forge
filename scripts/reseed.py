#!/usr/bin/env python3
"""
Quick Reseed Script

Deletes existing database, runs migrations, and seeds with demo data.

Usage:
    python scripts/reseed.py
    python scripts/reseed.py --keep-users  # Keep existing users
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Change to project root for relative paths
os.chdir(project_root)


async def reseed_database(keep_users: bool = False):
    """Delete and recreate database with seed data"""
    from rich.console import Console
    from rich.panel import Panel
    
    console = Console()
    
    console.print(Panel(
        "[bold yellow]Database Reseed[/bold yellow]\n"
        "This will delete the existing database and create a new one with demo data.",
        border_style="yellow"
    ))
    
    # Import after path setup
    from forge.db.seed_data import (
        get_seed_users, 
        get_seed_roles, 
        get_seed_servers,
        get_seed_projects,
        is_demo_mode
    )
    from forge.db.session import AsyncSessionLocal, engine
    from forge.db.base import Base
    from forge.db.models.user import User
    from forge.db.models.role import Role
    from forge.db.models.server import Server, ServerProvider, ServerStatus, PanelType
    from forge.db.models.project import Project, ProjectStatus
    from passlib.context import CryptContext
    
    # Password hashing
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)
    
    db_path = Path("forge/db/forge.db")
    
    # Step 1: Delete existing database
    if db_path.exists() and not keep_users:
        console.print(f"[yellow]Deleting {db_path}...[/yellow]")
        db_path.unlink()
        console.print("[green]✓[/green] Database deleted")
    
    # Step 2: Create tables
    console.print("[blue]Creating database tables...[/blue]")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    console.print("[green]✓[/green] Tables created")
    
    # Step 3: Seed data
    console.print("[blue]Seeding data...[/blue]")
    
    async with AsyncSessionLocal() as session:
        try:
            # Create roles (simplified - no permissions relationship for now)
            roles_data = get_seed_roles()
            roles = {}
            for role_data in roles_data:
                role = Role(
                    name=role_data["name"],
                    display_name=role_data["name"].title(),
                    description=role_data["description"],
                    is_system=True
                )
                session.add(role)
                roles[role_data["name"]] = role
            await session.flush()
            console.print(f"  [green]✓[/green] {len(roles_data)} roles created")
            
            # Create users
            users_data = get_seed_users()
            users = {}
            for user_data in users_data:
                # Generate username from email prefix
                username = user_data["email"].split("@")[0]
                user = User(
                    email=user_data["email"],
                    username=username,
                    hashed_password=get_password_hash(user_data["password"]),
                    full_name=user_data["full_name"],
                    is_superuser=user_data.get("is_superuser", False),
                    is_active=user_data.get("is_active", True)
                )
                session.add(user)
                users[user_data["email"]] = user
            await session.flush()
            console.print(f"  [green]✓[/green] {len(users_data)} users created")
            
            # Get first user as owner for servers/projects
            first_user = list(users.values())[0]
            
            # Create servers
            servers_data = get_seed_servers()
            for server_data in servers_data:
                # Map string to enum
                provider = ServerProvider.CUSTOM
                if server_data.get("provider"):
                    try:
                        provider = ServerProvider(server_data["provider"])
                    except ValueError:
                        provider = ServerProvider.CUSTOM
                
                panel_type = PanelType.NONE
                if server_data.get("panel_type"):
                    try:
                        panel_type = PanelType(server_data["panel_type"])
                    except ValueError:
                        panel_type = PanelType.NONE
                
                status = ServerStatus.OFFLINE
                if server_data.get("status"):
                    try:
                        status = ServerStatus(server_data["status"])
                    except ValueError:
                        status = ServerStatus.OFFLINE
                
                server = Server(
                    name=server_data["name"],
                    hostname=server_data["hostname"],
                    provider=provider,
                    status=status,
                    ssh_user=server_data.get("ssh_user", "root"),
                    ssh_port=server_data.get("ssh_port", 22),
                    ssh_key_path=server_data.get("ssh_key_path"),
                    panel_type=panel_type,
                    panel_url=server_data.get("panel_url"),
                    panel_api_user=server_data.get("panel_user"),
                    panel_api_token=server_data.get("panel_password"),
                    owner_id=first_user.id
                )
                session.add(server)
            await session.flush()
            console.print(f"  [green]✓[/green] {len(servers_data)} servers created")
            
            # Create projects
            projects_data = get_seed_projects()
            for project_data in projects_data:
                project = Project(
                    name=project_data["name"],
                    slug=project_data["slug"],
                    description=project_data.get("description", ""),
                    status=ProjectStatus.ACTIVE,
                    path=project_data.get("directory", "/var/www/default"),
                    owner_id=first_user.id
                )
                session.add(project)
            await session.flush()
            console.print(f"  [green]✓[/green] {len(projects_data)} projects created")
            
            await session.commit()
            
            console.print(Panel(
                "[bold green]✓ Database reseeded successfully![/bold green]\n\n"
                f"[bold]Login credentials (demo mode):[/bold]\n"
                f"  Email: admin@example.com\n"
                f"  Password: demo123456",
                border_style="green"
            ))
            
        except Exception as e:
            await session.rollback()
            console.print(f"[bold red]✗ Error: {e}[/bold red]")
            raise


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Reseed database")
    parser.add_argument("--keep-users", action="store_true", help="Keep existing users")
    args = parser.parse_args()
    
    asyncio.run(reseed_database(keep_users=args.keep_users))

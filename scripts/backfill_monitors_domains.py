import asyncio
import sys
import os
from pathlib import Path

# Add project root to path
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
sys.path.append(str(project_root))

from sqlalchemy import select
from forge.db import AsyncSessionLocal
from forge.db.models.project_server import ProjectServer
from forge.db.models.project import Project
from forge.db.models.monitor import Monitor
from forge.db.models.domain import Domain
from forge.services.monitor_service import MonitorService
from forge.services.domain_service import DomainService

async def backfill():
    print("Starting backfill of Monitors and Domains...")
    
    async with AsyncSessionLocal() as db:
        # Fetch all project environments
        result = await db.execute(
            select(ProjectServer, Project)
            .join(Project, ProjectServer.project_id == Project.id)
        )
        envs = result.all()
        
        print(f"Found {len(envs)} environments.")
        
        for row in envs:
            env = row[0]
            project = row[1]
            
            print(f"Checking {project.name} [{env.environment.value}] ({env.wp_url})...")
            
            # 1. Backfill Monitor
            # Check if monitor exists for this URL
            monitor_query = await db.execute(
                select(Monitor).where(
                    Monitor.project_id == project.id,
                    Monitor.url == env.wp_url
                )
            )
            existing_monitor = monitor_query.scalar_one_or_none()
            
            if not existing_monitor:
                print(f"  - Creating missing monitor for {env.wp_url}...")
                try:
                    ms = MonitorService(db)
                    # We need a user_id, defaulting to project owner or 1
                    user_id = project.owner_id or 1 
                    
                    await ms.create_monitor(
                        name=f"{project.name} - {env.environment.value.capitalize()}",
                        url=env.wp_url,
                        user_id=user_id,
                        project_id=project.id
                    )
                    print("  - Monitor created.")
                except Exception as e:
                    print(f"  - Failed to create monitor: {e}")
            else:
                print("  - Monitor already exists.")

            # 2. Backfill Domain
            # Check if domain exists
            # Extract domain from URL first as sync_domain_from_url does
            from urllib.parse import urlparse
            parsed = urlparse(env.wp_url if '://' in env.wp_url else f'http://{env.wp_url}')
            domain_name = parsed.netloc
            
            domain_query = await db.execute(
                select(Domain).where(Domain.domain_name == domain_name)
            )
            existing_domain = domain_query.scalar_one_or_none()
            
            if not existing_domain:
                target_client_id = project.client_id
                
                if not target_client_id:
                    # Find or create Lamah Internal client
                    from forge.db.models.client import Client, BillingStatus
                    from sqlalchemy import or_
                    
                    # Search by name OR email to catch duplicates
                    client_query = await db.execute(select(Client).where(
                        or_(
                            Client.name == "Lamah Internal",
                            Client.email == "internal@lamah.com"
                        )
                    ))
                    internal_client = client_query.scalar_one_or_none()
                    
                    if not internal_client:
                        print("  - Creating 'Lamah Internal' client via RAW SQL...")
                        try:
                            # Verify owner exists? Just try with 1 or project owner
                            owner_id = project.owner_id or 1
                            
                            # Use raw SQL to bypass SQLAlchemy Enum serialization issues causing 'ACTIVE' vs 'active'
                            from sqlalchemy import text
                            
                            # Insert and return ID
                            result = await db.execute(
                                text("""
                                    INSERT INTO clients (name, email, owner_id, billing_status, created_at, updated_at)
                                    VALUES (:name, :email, :owner_id, 'ACTIVE', NOW(), NOW())
                                    RETURNING id, name, email
                                """),
                                {
                                    "name": "Internal Fallback",
                                    "email": "fallback@lamah.com",
                                    "owner_id": 1 
                                }
                            )
                            row = result.fetchone()
                            await db.commit()
                            
                            if row:
                                print(f"  - Created client ID: {row.id}")
                                # Re-fetch via ORM to get full object if needed, or just use ID
                                target_client_id = row.id
                            
                        except Exception as e:
                            print(f"  - Failed to create client: {str(e)}") # explicit str(e)
                            import traceback
                            traceback.print_exc()
                            await db.rollback()
                            # Try fetch again
                            client_query = await db.execute(select(Client).where(Client.name.like("%Internal%")))
                            internal_client = client_query.scalar_one_or_none()
                            if internal_client:
                                target_client_id = internal_client.id
                    
                    if internal_client:
                        target_client_id = internal_client.id
                
                if target_client_id:
                    print(f"  - Creating missing domain for {domain_name}...")
                    try:
                        ds = DomainService(db)
                        await ds.sync_domain_from_url(
                            url=env.wp_url,
                            client_id=target_client_id,
                            project_id=project.id
                        )
                        print("  - Domain created.")
                    except Exception as e:
                        print(f"  - Failed to create domain: {e}")
                else:
                    print(f"  - Skipping domain: No client assigned and failed to create internal.")
            else:
                print("  - Domain already exists.")
                
    print("Backfill complete.")

if __name__ == "__main__":
    asyncio.run(backfill())

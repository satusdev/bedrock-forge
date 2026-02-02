import asyncio
import sys
from pathlib import Path

# Add project root to path
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
sys.path.append(str(project_root))

from sqlalchemy import select
from forge.db import AsyncSessionLocal
from forge.db.models.client import Client
from forge.db.models.user import User

async def debug():
    async with AsyncSessionLocal() as db:
        print("--- USERS ---")
        result = await db.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"ID: {u.id}, Email: {u.email}")
            
        print("\n--- CLIENTS ---")
        result = await db.execute(select(Client))
        clients = result.scalars().all()
        for c in clients:
            print(f"ID: {c.id}, Name: {c.name}, Email: {c.email}, OwnerID: {c.owner_id}")

if __name__ == "__main__":
    asyncio.run(debug())

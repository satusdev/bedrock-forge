import asyncio
import sys
from pathlib import Path

# Add project root to path
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
sys.path.append(str(project_root))

from sqlalchemy import text
from forge.db import AsyncSessionLocal

async def inspect():
    async with AsyncSessionLocal() as db:
        print("--- ENUM VALUES ---")
        # Query pg_enum
        result = await db.execute(text("""
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = 'billingstatus'
        """))
        rows = result.fetchall()
        for r in rows:
            print(f"Enum: {r[0]}, Label: {r[1]}")

if __name__ == "__main__":
    asyncio.run(inspect())

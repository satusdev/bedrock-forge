#!/bin/bash
set -euo pipefail

trap 'echo "✗ Startup failed. Check migration logs above."' ERR

echo "========================================"
echo "Bedrock Forge API Entrypoint"
echo "========================================"

# Run database migrations
BASELINE_REV="dbe90fcb9778"
echo "Running database migrations..."
cd /app

needs_stamp=$(python - <<'PY'
import asyncio
import os
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

async def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("0")
        return
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        def check(sync_conn):
            inspector = sa.inspect(sync_conn)
            tables = set(inspector.get_table_names())
            return ("alembic_version" in tables, "users" in tables)

        has_alembic, has_users = await conn.run_sync(check)
    await engine.dispose()
    print("1" if (not has_alembic and has_users) else "0")

asyncio.run(main())
PY
)

if [[ "$needs_stamp" == "1" ]]; then
    echo "Detected existing schema without alembic_version; stamping baseline ${BASELINE_REV}..."
    alembic -c forge/db/alembic.ini stamp "${BASELINE_REV}"
fi

alembic -c forge/db/alembic.ini upgrade head
echo "✓ Database migrations completed successfully"

echo "----------------------------------------"
echo "Starting API server..."
echo "========================================"

# If a specific command was provided (e.g., celery), run it directly.
if [[ $# -gt 0 ]]; then
    if [[ "$1" == "celery" || "$1" == "bash" || "$1" == "sh" ]]; then
        exec "$@"
    fi
fi

# Execute the main command (uvicorn)
exec uvicorn forge.api.app:app --host 0.0.0.0 --port 8000 "$@"

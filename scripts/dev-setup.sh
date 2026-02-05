#!/bin/bash
# Bedrock Forge Development Setup
# Quick start script for local development with Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔨 Bedrock Forge Development Setup"
echo "=================================="

cd "$PROJECT_ROOT"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker."
    exit 1
fi

echo "✅ Docker is available"

# Start services
echo ""
echo "📦 Starting development containers..."
docker compose -f deploy/docker-compose.dev.yml up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Run migrations
echo ""
echo "📊 Running database migrations..."
needs_stamp=$(docker compose -f deploy/docker-compose.dev.yml exec -T api bash -lc "python - <<'PY'
import asyncio
import os
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

async def main() -> None:
    url = os.getenv('DATABASE_URL')
    if not url:
        print('0')
        return
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        def check(sync_conn):
            inspector = sa.inspect(sync_conn)
            tables = set(inspector.get_table_names())
            return ('alembic_version' in tables, 'users' in tables)
        has_alembic, has_users = await conn.run_sync(check)
    await engine.dispose()
    print('1' if (not has_alembic and has_users) else '0')

asyncio.run(main())
PY")

if [[ "$needs_stamp" == "1" ]]; then
  echo "Detected existing schema without alembic_version; stamping head..."
  docker compose -f deploy/docker-compose.dev.yml exec -T api alembic -c forge/db/alembic.ini stamp head
fi

docker compose -f deploy/docker-compose.dev.yml exec -T api alembic -c forge/db/alembic.ini upgrade head

# Create test user (if not exists)
echo ""
echo "👤 Setting up test user..."
docker compose -f deploy/docker-compose.dev.yml exec -T api python -c "
import asyncio
from forge.db import AsyncSessionLocal
from forge.db.models import User
from sqlalchemy import select
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

async def create_test_user():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == 'admin@localhost'))
        if not result.scalar_one_or_none():
            user = User(
                email='admin@localhost',
                username='admin',
                hashed_password=pwd_context.hash('admin'),
                full_name='Admin User',
                is_active=True,
                is_superuser=True
            )
            db.add(user)
            await db.commit()
            print('✅ Test user created: admin@localhost / admin')
        else:
            print('ℹ️  Test user already exists')

asyncio.run(create_test_user())
" 2>/dev/null || echo "ℹ️  User setup skipped (may need manual setup)"

echo ""
echo "=================================="
echo "🚀 Development environment ready!"
echo ""
echo "  API:       http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Dashboard: http://localhost:3000"
echo "  Database:  localhost:5432 (forge/forge)"
echo "  Redis:     localhost:6379"
echo ""
echo "  Test Login: admin@localhost / admin"
echo ""
echo "📋 Useful commands:"
echo "  docker compose -f deploy/docker-compose.dev.yml logs -f api"
echo "  docker compose -f deploy/docker-compose.dev.yml exec api bash"
echo "  docker compose -f deploy/docker-compose.dev.yml down"
echo ""

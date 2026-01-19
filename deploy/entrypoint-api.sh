#!/bin/bash
set -e

echo "========================================"
echo "Bedrock Forge API Entrypoint"
echo "========================================"

# Run database migrations
echo "Running database migrations..."
cd /app

if alembic -c forge/db/alembic.ini upgrade head; then
    echo "✓ Database migrations completed successfully"
else
    echo "✗ Migration failed, but continuing startup..."
    # Don't exit - allow API to start even if migrations fail
    # This handles cases where DB is already up to date
fi

echo "----------------------------------------"
echo "Starting API server..."
echo "========================================"

# Execute the main command (uvicorn)
exec uvicorn forge.api.app:app --host 0.0.0.0 --port 8000 "$@"

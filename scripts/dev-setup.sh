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
docker compose up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Run Prisma migrations + seed
echo ""
echo "📊 Running Prisma migrations..."
docker compose --profile seed run --rm --no-deps --build nest-api sh -c "npm run prisma:push"

echo ""
echo "🌱 Running Prisma seed..."
docker compose --profile seed run --rm --no-deps --build nest-api sh -c "npm run prisma:seed"

echo ""
echo "=================================="
echo "🚀 Development environment ready!"
echo ""
echo "  API:       http://localhost:8000"
echo "  Health:    http://localhost:8000/api/v1/health"
echo "  Dashboard: http://localhost:3000"
echo "  Database:  localhost:5432 (forge/forge)"
echo "  Redis:     localhost:6379"
echo ""
echo "📋 Useful commands:"
echo "  docker compose logs -f api"
echo "  docker compose --profile seed run --rm --no-deps nest-api sh"
echo "  docker compose down"
echo ""

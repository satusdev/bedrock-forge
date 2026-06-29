#!/bin/bash
# Bedrock Forge — First-Time Setup
set -euo pipefail

# Source helper routines
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/tools/setup-helpers.sh"

# Run Setup Doctor to validate environment prerequisites
"$SCRIPT_DIR/doctor.sh"

echo "╔════════════════════════════════════════╗"
echo "║    Bedrock Forge — First-Time Setup    ║"
echo "╚════════════════════════════════════════╝"

# Generate environment configuration file (.env) with secure tokens
generate_env_file

# ── Build & start services ────────────────────────────────────────────────────
echo "Building Docker images…"
docker compose build

echo "Starting all Docker containers…"
docker compose up -d

# ── Wait for backend API to become ready ──────────────────────────────────────
wait_for_api_healthy 3001 30

# ── Run database seed ─────────────────────────────────────────────────────────
echo "Seeding database with default configuration and admin user…"
docker compose exec forge node prisma/seed.js

echo ""
echo "Setup complete!"
echo "   → http://localhost:3002"
echo "   Admin: admin@bedrockforge.local / admin123"
echo ""
echo "   Logs:    docker compose logs -f forge"
echo "   Update:  ./update.sh"
echo "   Reset:   ./reset.sh"
echo "   Stop:    docker compose down"

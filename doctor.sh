#!/bin/bash
# Bedrock Forge — Setup Doctor
# Validates system prerequisites (Docker, Node, ports, env) before running the application.

set -euo pipefail

echo "========================================="
echo "   Bedrock Forge — Setup Doctor"
echo "========================================="

errors=0
warnings=0

check_node_version() {
  if command -v node >/dev/null 2>&1; then
    local version
    version=$(node -v | cut -d'v' -f2)
    local major
    major=$(echo "$version" | cut -d'.' -f1)
    if [ "$major" -lt 22 ]; then
      echo "✗ ERROR: Node.js version must be >= 22 (found v$version)."
      errors=$((errors + 1))
    else
      echo "✓ Node.js v$version detected (>= 22)"
    fi
  else
    echo "✗ ERROR: Node.js is not installed."
    errors=$((errors + 1))
  fi
}

check_openssl() {
  if command -v openssl >/dev/null 2>&1; then
    echo "✓ openssl is installed"
  else
    echo "✗ ERROR: openssl is required for generating security credentials but is not installed."
    errors=$((errors + 1))
  fi
}

check_docker_daemon() {
  if command -v docker >/dev/null 2>&1; then
    if ! docker info >/dev/null 2>&1; then
      echo "✗ ERROR: Docker CLI is installed, but the Docker daemon is not running."
      errors=$((errors + 1))
    else
      echo "✓ Docker daemon is running"
    fi
  else
    echo "✗ ERROR: Docker is not installed."
    errors=$((errors + 1))
  fi
}

check_port() {
  local port="$1"
  local service_name="$2"
  if command -v node >/dev/null 2>&1; then
    if ! node -e "require('net').createServer().listen($port, '127.0.0.1', () => process.exit(0)).on('error', () => process.exit(1))" >/dev/null 2>&1; then
      echo "✗ WARNING: Port $port ($service_name) is already in use by another process."
      warnings=$((warnings + 1))
      return 1
    fi
  else
    # Fallback to python3
    if command -v python3 >/dev/null 2>&1; then
      if ! python3 -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', $port))" >/dev/null 2>&1; then
        echo "✗ WARNING: Port $port ($service_name) is already in use by another process."
        warnings=$((warnings + 1))
        return 1
      fi
    else
      # Fallback to ss
      if command -v ss >/dev/null 2>&1; then
        if ss -tln | grep -qE ":$port\b"; then
          echo "✗ WARNING: Port $port ($service_name) is already in use by another process."
          warnings=$((warnings + 1))
          return 1
        fi
      fi
    fi
  fi
  echo "✓ Port $port ($service_name) is available"
  return 0
}

# 1. Check tool dependencies
echo ""
echo "--- Checking Dependencies ---"
check_node_version || true
check_openssl || true
check_docker_daemon || true

# 2. Check port availability
echo ""
echo "--- Checking Port Conflicts ---"
check_port 3001 "Forge API" || true
check_port 3002 "Forge Web Client" || true
check_port 5432 "PostgreSQL Database" || true
check_port 6379 "Redis Queue" || true

# 3. Summary
echo ""
echo "========================================="
if [ "$errors" -gt 0 ]; then
  echo "   Doctor found $errors error(s) and $warnings warning(s)."
  echo "   Please fix the errors above before running Bedrock Forge."
  echo "========================================="
  exit 1
elif [ "$warnings" -gt 0 ]; then
  echo "   Doctor found 0 errors and $warnings warning(s)."
  echo "   System meets all core requirements, but review warnings above."
  echo "========================================="
  exit 0
else
  echo "   Doctor found no issues! System is ready."
  echo "========================================="
  exit 0
fi

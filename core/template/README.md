# New Bedrock Project

This project was generated with bedrock-forge.

## Structure

- `websites/` — Your Bedrock WordPress site(s)
- `scripts/` — All management scripts (provisioning, backup, monitoring, etc.)

## Usage

- Run scripts from the project root, e.g.:
  ```
  ./scripts/provision/provision-hetzner.sh
  ./scripts/sync/backup.sh
  ```
- See each script's `--help` for options.

## Quick Start

1. Copy `.env.example` files and fill in required values.
2. Start the database and app containers:
   ```
   docker compose -f websites/<site>/docker-compose.yml up -d
   ```
3. Use the scripts in `scripts/` for server, DNS, backup, and monitoring tasks.

## Documentation

- See the main bedrock-forge repo for full documentation and workflow examples.

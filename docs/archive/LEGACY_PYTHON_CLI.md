# Legacy Python CLI Archive

This project now defaults to the Nest API + Dashboard + Prisma stack.

Legacy Python CLI (`python -m forge` / `forge ...`) is removed from this
workspace and is not part of onboarding, testing, or deployment.

## What was removed in cleanup

- Orphan seed command module: `forge/commands/seed.py`
- Orphan seed data module: `forge/db/seed_data.py`

## Current state

- Python package scaffolding has been removed.
- Runtime is Docker + Nest API + Dashboard only.

## Current default docs

- [Quick Start](../QUICK_START.md)
- [Commands](../COMMANDS.md)
- [Testing](../TESTING.md)
- [Configuration](../CONFIGURATION.md)
- [Deployment Guide](../DEPLOYMENT_GUIDE.md)

## Recovery of older Python-first docs

If you need historical Python CLI instructions, retrieve them from git history
on this repository before the Nest-first docs cleanup commit.

# Contributing to Bedrock Forge

Thank you for considering a contribution to Bedrock Forge. This guide explains
how to get started.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-fork>/bedrock-forge.git
   cd bedrock-forge
   ```
3. Follow the development setup in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
4. Create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Workflow

- **Backend:** `apps/api/` (NestJS REST API) and `apps/worker/` (BullMQ
  processors)
- **Frontend:** `apps/web/` (React + Vite)
- **Shared:** `packages/shared/` (types, queue definitions, Zod schemas)

See [PROJECT.md](PROJECT.md) for architecture conventions and module structure.

## Code Style

- ESLint + Prettier are configured at the workspace level.
- Run `pnpm lint` and `pnpm format` before committing.
- Follow the existing patterns in each module (controller → service →
  repository).

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(backups): add incremental backup support
fix(auth): prevent refresh token reuse after rotation
docs: update QUICK_START with GDrive setup
chore: bump dependencies
```

## Pull Requests

1. Ensure `pnpm build` and `pnpm test` pass locally.
2. Keep PRs focused on a single concern.
3. Reference any related issue in the PR description (e.g. `Closes #42`).
4. Add tests for new business logic in services and processors.

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs.
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
  for new ideas.
- Search existing issues before opening a duplicate.

## Security Vulnerabilities

**Do not open public issues for security vulnerabilities.** See
[SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).

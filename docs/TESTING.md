# Testing Guide

Primary backend testing is Jest in `nest-api`.

## Run tests

```bash
cd nest-api
npm test
npm run test:cov
```

## Targeted suites

```bash
cd nest-api
npm test -- projects.service.spec.ts import-projects.service.spec.ts backups.service.spec.ts
npm test -- packages.controller.spec.ts servers.controller.spec.ts
```

## Contract tests

Contract tests are included in the Jest run and validate API behavior around
modules such as projects, backups, subscriptions, and servers.

## CI expectation

- Test suites must pass before merge.
- Coverage reports come from `npm run test:cov`.

## Legacy note

Legacy Python/pytest material is archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)

# Migration from Legacy Scripts to Modular Workflow

This guide helps users transition from the old monolithic scripts (e.g.,
manage-site.sh, create-site.sh, switch-env.sh) to the new modular script
workflow.

## Legacy Script → Modular Replacement Mapping

| Legacy Script           | Modular Replacement(s)                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| manage-site.sh          | scripts/local/_, scripts/provision/_, scripts/deploy/_, scripts/sync/_ |
| create-site.sh          | scripts/local/site-init.sh                                             |
| switch-env.sh           | scripts/local/env-switch.sh                                            |
| sync-config.sample.json | config/sync-config.json                                                |

## Migration Checklist

1. Use modular scripts for all local, provisioning, deployment, sync, and backup
   tasks.
2. Update any automation or CI/CD jobs to use the modular scripts.
3. Review and update your config/sync-config.json as needed.
4. Remove any custom scripts based on the old monolithic workflow.
5. Refer to updated docs and usage examples.

## Example: Old vs New

**Old:**

```sh
./create-site.sh mysite
./switch-env.sh mysite staging
./manage-site.sh mysite deploy production
```

**New:**

```sh
./scripts/local/site-init.sh mysite --port=8001
./scripts/local/env-switch.sh mysite staging
./scripts/deploy/deploy.sh mysite production
```

## Troubleshooting Migration

- If you encounter missing functionality, check the modular scripts for
  equivalent options.
- If you have custom logic in old scripts, consider splitting it into new
  modular helpers.
- For help, see the updated README and docs, or open an issue.

# GitHub Actions Workflows

This document explains the CI/CD workflow for this project and provides guidance
on how to expand it.

## CI/CD Workflow

### File: `.github/workflows/ci-cd.yml`

The CI/CD workflow combines Continuous Integration (CI) and Continuous
Deployment (CD) into a single pipeline.

### Steps:

#### Continuous Integration (CI)

1. **Checkout Code**: Fetches the repository code.
2. **Setup PHP**: Installs PHP 8.1 and required extensions.
3. **Cache Composer Dependencies**: Speeds up dependency installation by caching
   Composer files.
4. **Install Dependencies**: Installs project dependencies using Composer.
5. **Lint Code**: Runs Pint to check code style.

#### Continuous Deployment (CD)

1. **Checkout Code**: Fetches the repository code.
2. **Setup SSH**: Configures SSH access to the remote server.
3. **Deploy**: Executes deployment commands to update the production
   environment.

### Trigger:

- On push to `main` or pull request targeting `main`.

### Required Secrets:

- `SSH_HOST`: Remote server hostname or IP.
- `SSH_USER`: SSH username.
- `SSH_KEY`: Private SSH key for authentication.
- `SSH_PORT`: (Optional) SSH port (default: 22).

---

## Future Enhancements

### Adding Tests to CI

- Integrate PHPUnit or Codeception for automated testing.
- Add a step to run tests after installing dependencies.

### Supporting Multiple Environments

- Use conditional logic to deploy to staging or production based on the branch.
- Update deployment commands dynamically for different environments.

### Artifact Sharing

- Use GitHub Actions artifacts to share data (e.g., build outputs) between jobs.

### Monitoring and Alerts

- Integrate with tools like Slack or email for build and deployment
  notifications.

### Security Enhancements

- Implement secret rotation and validation.
- Use environment-specific secrets for better isolation.

### Documentation Updates

- Keep this file updated as workflows evolve and new features are added.

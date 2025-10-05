# CI/CD Integration Guide

This guide covers continuous integration and continuous deployment (CI/CD) integration for Bedrock Forge projects.

## Overview

Bedrock Forge provides native CI/CD capabilities with support for popular platforms including GitHub Actions, GitLab CI, Jenkins, and custom workflows.

## Supported CI/CD Platforms

| Platform | Integration Type | Status | Features |
|----------|------------------|--------|----------|
| **GitHub Actions** | Native | ✅ Production | Pre-built workflows |
| **GitLab CI** | Native | ✅ Production | Auto-devops integration |
| **Jenkins** | Plugin/CLI | ✅ Production | Pipeline as code |
| **CircleCI** | CLI | ✅ Production | Docker-based workflows |
| **Bitbucket Pipelines** | CLI | ✅ Production | Git integration |

## GitHub Actions Integration

### Pre-built Workflows

Bedrock Forge provides GitHub Actions workflows in `.github/workflows/`:

**Continuous Integration (`.github/workflows/ci.yml`)**:
```yaml
name: Continuous Integration

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: forge_test
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3

    steps:
    - uses: actions/checkout@v3

    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'

    - name: Install Bedrock Forge
      run: |
        pip install bedrock-forge
        forge --version

    - name: Setup Environment
      run: |
        cp .github/workflows/test.env .env
        forge env generate --environment testing

    - name: Run Tests
      run: |
        forge test --all --coverage
        forge lint --all

    - name: Security Scan
      run: |
        forge security scan --all
        forge security audit --dependencies

    - name: Build Assets
      run: |
        forge assets build --production

    - name: Upload Coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

**Continuous Deployment (`.github/workflows/deploy.yml`)**:
```yaml
name: Continuous Deployment

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging

    steps:
    - uses: actions/checkout@v3

    - name: Setup Bedrock Forge
      run: |
        pip install bedrock-forge
        forge --version

    - name: Configure Secrets
      run: |
        echo "DB_PASSWORD=${{ secrets.DB_PASSWORD_STAGING }}" >> .env
        echo "SERVER_HOST=${{ secrets.SERVER_HOST_STAGING }}" >> .env
        echo "DEPLOY_KEY=${{ secrets.DEPLOY_KEY_STAGING }}" >> .env

    - name: Deploy to Staging
      run: |
        forge deploy --environment staging --strategy rolling

    - name: Run Health Checks
      run: |
        forge health check --environment staging --wait-for-ready

    - name: Run Integration Tests
      run: |
        forge test --integration --environment staging

  deploy-production:
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    needs: deploy-staging
    environment: production

    steps:
    - uses: actions/checkout@v3

    - name: Setup Bedrock Forge
      run: |
        pip install bedrock-forge
        forge --version

    - name: Create Backup
      run: |
        forge backup create --type full --name "pre-deploy-${{ github.sha }}"

    - name: Configure Production Secrets
      run: |
        echo "DB_PASSWORD=${{ secrets.DB_PASSWORD_PRODUCTION }}" >> .env
        echo "SERVER_HOST=${{ secrets.SERVER_HOST_PRODUCTION }}" >> .env
        echo "DEPLOY_KEY=${{ secrets.DEPLOY_KEY_PRODUCTION }}" >> .env

    - name: Deploy to Production
      run: |
        forge deploy --environment production --strategy blue-green

    - name: Post-deployment Verification
      run: |
        forge health check --environment production --comprehensive
        forge monitor performance --baseline --environment production

    - name: Notify Deployment
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        text: "Production deployment ${{ job.status }}"
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Repository Setup

1. **Enable GitHub Actions**:
   ```bash
   mkdir -p .github/workflows
   cp forge/templates/github-actions/* .github/workflows/
   git add .github/workflows/
   git commit -m "Add GitHub Actions workflows"
   ```

2. **Configure Secrets**:
   ```bash
   # Required secrets for GitHub Actions
   DB_PASSWORD_STAGING=your_staging_db_password
   DB_PASSWORD_PRODUCTION=your_production_db_password
   SERVER_HOST_STAGING=staging.yourdomain.com
   SERVER_HOST_PRODUCTION=yourdomain.com
   DEPLOY_KEY_STAGING=-----BEGIN RSA PRIVATE KEY-----...
   DEPLOY_KEY_PRODUCTION=-----BEGIN RSA PRIVATE KEY-----...
   SLACK_WEBHOOK=https://hooks.slack.com/services/...
   ```

3. **Environments Setup**:
   ```bash
   # Create environments in GitHub repository settings
   - staging: Protected branch = main
   - production: Protected branch = main, Required reviewers = 2
   ```

## GitLab CI Integration

### GitLab CI Configuration (`.gitlab-ci.yml`)

```yaml
# GitLab CI/CD Pipeline for Bedrock Forge
stages:
  - validate
  - test
  - build
  - security
  - deploy-staging
  - deploy-production

variables:
  PYTHON_VERSION: "3.11"
  NODE_VERSION: "18"
  MYSQL_VERSION: "8.0"

# Cache configuration
cache:
  paths:
    - .cache/pip
    - .cache/npm
    - vendor/

# Templates
.template_base: &template_base
  image: python:$PYTHON_VERSION
  before_script:
    - pip install bedrock-forge
    - forge --version
    - forge env generate --environment ci

.template_mysql: &template_mysql
  services:
    - name: mysql:$MYSQL_VERSION
      alias: mysql
  variables:
    MYSQL_ROOT_PASSWORD: root
    MYSQL_DATABASE: forge_test
    DB_HOST: mysql

# Jobs
validate:
  <<: *template_base
  stage: validate
  script:
    - forge config validate
    - forge lint --config
    - forge security check-config
  only:
    - merge_requests
    - main
    - develop

unit_tests:
  <<: [*template_base, *template_mysql]
  stage: test
  script:
    - forge test --unit --coverage
    - forge test --integration
  coverage: '/TOTAL.*\s+(\d+%)$/'
  artifacts:
    reports:
      junit: tests/results/junit.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/
    expire_in: 1 week
  only:
    - merge_requests
    - main
    - develop

build_assets:
  stage: build
  image: node:$NODE_VERSION
  script:
    - npm ci --cache .cache/npm
    - npm run build:production
  artifacts:
    paths:
      - web/dist/
    expire_in: 1 hour
  only:
    - main
    - develop

security_scan:
  <<: *template_base
  stage: security
  script:
    - forge security scan --all
    - forge security audit --dependencies
    - forge security check-secrets
  artifacts:
    reports:
      sast: gl-sast-report.json
    paths:
      - security-reports/
    expire_in: 1 week
  only:
    - main
    - develop

deploy_staging:
  <<: *template_base
  stage: deploy-staging
  environment:
    name: staging
    url: https://staging.yourdomain.com
  script:
    - forge backup create --type full --name "pre-staging-${CI_COMMIT_SHORT_SHA}"
    - forge deploy --environment staging --strategy rolling
    - forge health check --environment staging
    - forge test --smoke --environment staging
  only:
    - main
  when: manual

deploy_production:
  <<: *template_base
  stage: deploy-production
  environment:
    name: production
    url: https://yourdomain.com
  before_script:
    - echo "DB_PASSWORD=$DB_PASSWORD_PRODUCTION" >> .env
    - echo "DEPLOY_KEY=$DEPLOY_KEY_PRODUCTION" >> .env
  script:
    - forge backup create --type full --name "pre-prod-${CI_COMMIT_SHORT_SHA}"
    - forge deploy --environment production --strategy blue-green
    - forge health check --environment production --comprehensive
    - forge monitor performance --baseline --environment production
  only:
    - tags
    - main
  when: manual
  dependencies:
    - deploy_staging
```

## Jenkins Integration

### Jenkinsfile (Declarative Pipeline)

```groovy
pipeline {
    agent any

    environment {
        PYTHON_VERSION = '3.11'
        NODE_VERSION = '18'
        FORGE_HOME = "${WORKSPACE}/.forge"
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    python3 -m venv venv
                    source venv/bin/activate
                    pip install bedrock-forge
                    forge --version
                    forge env generate --environment jenkins
                '''
            }
        }

        stage('Validate') {
            parallel {
                stage('Config Validation') {
                    steps {
                        sh 'forge config validate'
                    }
                }
                stage('Linting') {
                    steps {
                        sh 'forge lint --all'
                    }
                }
            }
        }

        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh '''
                            forge test --unit --coverage
                            forge test --integration
                        '''
                    }
                }
                stage('Security Scan') {
                    steps {
                        sh '''
                            forge security scan --all
                            forge security audit --dependencies
                        '''
                    }
                }
            }
        }

        stage('Build') {
            steps {
                sh '''
                    forge assets build --production
                    forge package create --environment production
                '''
            }
            post {
                success {
                    archiveArtifacts artifacts: '*.tar.gz', fingerprint: true
                }
            }
        }

        stage('Deploy Staging') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([
                    string(credentialsId: 'DB_PASSWORD_STAGING', variable: 'DB_PASSWORD'),
                    string(credentialsId: 'DEPLOY_KEY_STAGING', variable: 'DEPLOY_KEY')
                ]) {
                    sh '''
                        echo "DB_PASSWORD=$DB_PASSWORD" >> .env
                        echo "DEPLOY_KEY=$DEPLOY_KEY" >> .env
                        forge backup create --type full --name "pre-staging-${BUILD_NUMBER}"
                        forge deploy --environment staging --strategy rolling
                        forge health check --environment staging
                    '''
                }
            }
        }

        stage('Deploy Production') {
            when {
                tag pattern: "v\\d+\\.\\d+\\.\\d+", comparator: "REGEXP"
            }
            steps {
                withCredentials([
                    string(credentialsId: 'DB_PASSWORD_PRODUCTION', variable: 'DB_PASSWORD'),
                    string(credentialsId: 'DEPLOY_KEY_PRODUCTION', variable: 'DEPLOY_KEY'),
                    string(credentialsId: 'SLACK_WEBHOOK', variable: 'SLACK_WEBHOOK_URL')
                ]) {
                    sh '''
                        echo "DB_PASSWORD=$DB_PASSWORD" >> .env
                        echo "DEPLOY_KEY=$DEPLOY_KEY" >> .env
                        forge backup create --type full --name "pre-prod-${BUILD_NUMBER}"
                        forge deploy --environment production --strategy blue-green
                        forge health check --environment production --comprehensive
                        forge monitor performance --baseline --environment production

                        # Notify Slack
                        curl -X POST -H 'Content-type: application/json' \
                        --data '{"text":"🚀 Production deployment successful! Build #'${BUILD_NUMBER}'"}' \
                        $SLACK_WEBHOOK_URL
                    '''
                }
            }
        }
    }

    post {
        always {
            junit 'tests/results/*.xml'
            publishCoverage adapters: [coberturaAdapter('coverage/cobertura-coverage.xml')]
        }

        success {
            cleanWs()
        }

        failure {
            mail to: 'dev-team@yourcompany.com',
                 subject: "Jenkins Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                 body: """
                 Build failed for ${env.JOB_NAME} - ${env.BUILD_NUMBER}

                 Check console output at: ${env.BUILD_URL}
                 """
        }
    }
}
```

## Custom CI/CD Integration

### Bedrock Forge CI/CD CLI Commands

```bash
# CI-specific commands
forge ci setup                    # Initialize CI configuration
forge ci validate                 # Validate CI configuration
forge ci test                     # Run CI-specific tests
forge ci build                    # Build for CI
forge ci package                  # Package for deployment

# Environment management
forge ci env create               # Create CI environment
forge ci env update               # Update CI environment
forge ci env test                 # Test CI environment

# Integration commands
forge ci integrate github         # GitHub Actions setup
forge ci integrate gitlab         # GitLab CI setup
forge ci integrate jenkins        # Jenkins setup
forge ci integrate circleci       # CircleCI setup
```

### Docker-based CI

```dockerfile
# Dockerfile.ci
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    mysql-client \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Bedrock Forge
RUN pip install bedrock-forge

# Setup work directory
WORKDIR /app

# Copy configuration
COPY forge.yaml .forge/ ./

# Setup environment
RUN forge env generate --environment ci

# Default command
CMD ["forge", "ci", "test"]
```

### CI Configuration Template

```yaml
# .forge/ci.yaml
ci:
  platform: "github"  # github, gitlab, jenkins, circleci

  environments:
    - name: "testing"
      type: "unit"
      database: "mysql"
      cache: "redis"

    - name: "integration"
      type: "integration"
      database: "mysql"
      cache: "redis"

  testing:
    unit:
      command: "forge test --unit --coverage"
      coverage: true
      threshold: 80

    integration:
      command: "forge test --integration"
      database: true
      cache: true

    security:
      command: "forge security scan --all"
      fail_fast: true

  building:
    assets:
      command: "forge assets build --production"

    package:
      command: "forge package create --environment production"

  deployment:
    staging:
      environment: "staging"
      strategy: "rolling"
      backup: true

    production:
      environment: "production"
      strategy: "blue-green"
      backup: true
      approval: true

  notifications:
    slack:
      webhook: "${SLACK_WEBHOOK}"
      channels: ["#deployments", "#alerts"]

    email:
      recipients: ["dev-team@yourcompany.com"]
```

## Environment Management

### Multi-Environment CI/CD

```yaml
# forge.yaml environments
environments:
  development:
    database:
      host: "localhost"
      name: "forge_dev"
      user: "dev"
      password: "${DB_PASSWORD_DEV}"

  testing:
    database:
      host: "mysql-test"
      name: "forge_test"
      user: "test"
      password: "${DB_PASSWORD_TEST}"

  staging:
    database:
      host: "staging-db.yourdomain.com"
      name: "forge_staging"
      user: "staging"
      password: "${DB_PASSWORD_STAGING}"

  production:
    database:
      host: "prod-db.yourdomain.com"
      name: "forge_production"
      user: "prod"
      password: "${DB_PASSWORD_PRODUCTION}"
```

### Environment-specific CI/CD

```bash
# Environment-specific deployment
forge deploy --environment staging --branch main
forge deploy --environment production --tag v1.2.3

# Rollback strategies
forge deploy rollback --environment production --version previous
forge deploy rollback --environment production --backup-id latest

# Blue-Green deployment
forge deploy --environment production --strategy blue-green --health-check
```

## Quality Gates and Policies

### Pre-deployment Checks

```yaml
# .forge/gates.yaml
gates:
  code_quality:
    linting:
      enabled: true
      fail_on_error: true

    coverage:
      enabled: true
      minimum: 80

    complexity:
      enabled: true
      maximum: 10

  security:
    vulnerability_scan:
      enabled: true
      fail_on_high: true
      fail_on_critical: true

    secret_scan:
      enabled: true
      fail_on_found: true

  performance:
    load_test:
      enabled: false  # Optional for staging
      threshold: "1000 req/s"

  dependencies:
    outdated_check:
      enabled: true
      fail_on_major: true

    license_check:
      enabled: true
      forbidden: ["GPL-3.0", "AGPL-3.0"]
```

### Automated Testing Pipeline

```bash
# Comprehensive test pipeline
forge pipeline run --name "full-ci" --stages [
  "validate",
  "unit-tests",
  "integration-tests",
  "security-scan",
  "build",
  "package"
]

# Stage-specific pipelines
forge pipeline run --name "deploy-staging" --stages [
  "backup",
  "deploy",
  "health-check",
  "smoke-tests"
]
```

## Monitoring and Observability

### CI/CD Metrics

```bash
# Track CI/CD performance
forge metrics ci --days 30 --format json

# Deployment success rate
forge metrics deployment --success-rate --environment production

# Pipeline performance
forge metrics pipeline --average-duration --name "full-ci"
```

### Notifications and Alerts

```yaml
# Notification configuration
notifications:
  slack:
    webhook: "${SLACK_WEBHOOK}"
    events:
      - deployment_success
      - deployment_failure
      - test_failure
      - security_alert

  email:
    smtp_server: "smtp.yourcompany.com"
    recipients:
      - "dev-team@yourcompany.com"
      - "ops-team@yourcompany.com"
    events:
      - deployment_failure
      - security_alert

  pagerduty:
    integration_key: "${PAGERDUTY_KEY}"
    events:
      - production_failure
      - security_critical
```

## Best Practices

### CI/CD Pipeline Design

1. **Fast Feedback**: Keep unit tests under 5 minutes
2. **Parallel Execution**: Run independent tests in parallel
3. **Fail Fast**: Stop pipeline on first failure
4. **Security First**: Integrate security scanning early
5. **Rollback Ready**: Always have rollback strategy

### Deployment Strategies

**GitFlow Integration**:
```bash
# Feature branch testing
forge deploy --environment feature --branch feature/new-feature

# Development branch deployment
forge deploy --environment development --branch develop

# Production deployment from main
forge deploy --environment production --branch main --strategy blue-green
```

**Trunk-based Development**:
```bash
# Main branch always deployable
forge deploy --environment production --branch main --strategy rolling

# Feature flags for new features
forge feature enable --name "new-feature" --environment production
```

### Security Integration

```bash
# Security in CI/CD
forge security scan --pre-commit
forge security audit --dependencies --fail-on-critical
forge security check-secrets --pre-push
forge security compliance --check --standard "SOC2"
```

This comprehensive CI/CD guide ensures robust, automated deployment pipelines for your Bedrock Forge projects.
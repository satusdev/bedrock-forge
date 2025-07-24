# Full Example Workflow: Bedrock Site Creation to Production

This guide walks you through the entire process of creating, provisioning,
deploying, syncing, backing up, and monitoring a new Bedrock-based WordPress
site using the modular scripts.

---

## 1. Create a New Local Site

```sh
# Create a new site 'myblog' on port 8005
./scripts/local/site-init.sh myblog --port=8005

# Generate .env files (if needed)
./scripts/local/generate-env.sh myblog

# Switch to development environment
./scripts/local/env-switch.sh myblog development

# Start containers
cd websites/myblog && docker-compose up -d

# Access at http://localhost:8005
```

---

## 2. Initialize Git and Push to GitHub

```sh
cd websites/myblog
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub (manually or with script)
../../scripts/local/create-github-repo.sh myblog
git remote add origin <github-repo-url>
git push -u origin main
```

---

## 3. Provision the Remote Server

```sh
# Provision CyberPanel/Hetzner server, DNS, DB, OLS, hardening, rclone, logrotate
./scripts/provision/provision-cyberpanel.sh myblog.com
```

---

## 4. Update Sync Config

- Edit `config/sync-config.json` and add your new site and remote environments
  (staging, production).
- Fill in SSH, DB, rclone, and path details as output by the provisioning
  script.

---

## 5. Deploy Code to Remote

```sh
# Deploy code to staging
./scripts/deploy/deploy.sh myblog staging

# Or to production
./scripts/deploy/deploy.sh myblog production
```

---

## 6. Sync Database and Uploads

```sh
# Push local DB to remote
./scripts/sync/sync-db.sh myblog staging push

# Pull remote DB to local
./scripts/sync/sync-db.sh myblog staging pull

# Push uploads to remote/cloud
./scripts/sync/sync-uploads.sh myblog staging push

# Pull uploads from remote/cloud
./scripts/sync/sync-uploads.sh myblog staging pull
```

---

## 7. Set Up Backups

```sh
# Backup DB and uploads to rclone remote
./scripts/sync/backup.sh myblog production

# Restore from backup
./scripts/sync/restore.sh myblog production --date=YYYYMMDD-HHMMSS
```

---

## 8. Set Up CI/CD and Monitoring

- Register Jenkins pipeline: `./scripts/ci/jenkins-connect.sh ...`
- Register Kuma monitor: `./scripts/monitoring/kuma-register.sh ...`
- Jenkins pipeline will notify Kuma after deploy.

---

## 9. Troubleshooting

- See [docs/troubleshooting.md](./troubleshooting.md) for common issues and
  solutions.

---

## Mermaid Workflow Diagram

```mermaid
graph TD
    A[Local Site Creation] --> B[GitHub Repo Init & Push]
    B --> C[Provision Remote Server]
    C --> D[Update config/sync-config.json]
    D --> E[Deploy Code to Remote]
    E --> F[Sync DB & Uploads]
    F --> G[Set Up Backups]
    G --> H[CI/CD & Monitoring]
    H --> I[Troubleshooting]
```

---

**You now have a fully automated, modular workflow from local development to
production, with backups and monitoring!**

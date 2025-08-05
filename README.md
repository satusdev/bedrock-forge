<div align="center">
    <h1>Site WordPress Bedrock Environment (DDEV Edition)</h1>
</div>

## Quick Start ⚡

**Note:** Local site creation, provisioning, and automation now use
[DDEV](https://ddev.readthedocs.io/en/latest/).

```sh
git clone git@github.com:satusdev/bedrock-forge.git
cd bedrock-forge

# Create a new site directory
cd /home/nadbad/Work/Wordpress
mkdir site
cd site

# Configure DDEV for WordPress with Bedrock's docroot
ddev config --project-type=wordpress --docroot=web --create-docroot

# Install Bedrock via Composer
composer create-project roots/bedrock .

# Start the DDEV project
ddev start

# Provision WordPress with WP-CLI
ddev wp core install --url=https://site.ddev.site --title="My Site" --admin_user=admin --admin_email=admin@example.com --admin_password=securepassword

# Launch the site in your browser
ddev launch

# Copy automation scripts, Jenkinsfile, and config files into your project
bash ../scripts/local/ddev-post-create-setup.sh $PWD
```

See [docs/example-workflow.md](docs/example-workflow.md) for a full step-by-step
guide.

## Modular Workflow 🚀

- **Local Site Creation:** DDEV-based workflow (see above)
- **Automation:** Use the post-create setup script to copy deployment, sync,
  backup, CI/CD, and monitoring scripts into your project.
- **Sync, Backup, Restore:** Use DDEV-based scripts for DB and uploads
  management.
- **CI/CD:** Jenkinsfile template included for automated deployment.
- **Monitoring:** Kuma integration script included.

## Requirements ⏸️

- [DDEV](https://ddev.readthedocs.io/en/latest/)
- [Composer](https://getcomposer.org/)
- `git`
- `rclone` (for uploads/backup sync)
- `rsync` (for deployment)
- `ssh` & `scp` clients (for deployment/sync)

## Getting Help 🆘

- Refer to [docs/example-workflow.md](docs/example-workflow.md) for the full
  workflow.
- Refer to documentation for Bedrock, DDEV, WP-CLI, rclone, jq.
- Check the Roots Discourse for Bedrock questions: https://discourse.roots.io/

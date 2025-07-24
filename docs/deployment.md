# Deployment & Remote Management ☁️🌍

This document covers preparing remote servers and using the modular scripts for
deployment and data synchronization. ------- ADD AFTER

## Real-World Usage Examples

### Example: Deploy a Site to Staging

```sh
# Deploy code to staging
./scripts/deploy/deploy.sh mysite staging

# Sync database from local to staging
./scripts/sync/sync-db.sh mysite staging push

# Sync uploads from local to staging
./scripts/sync/sync-uploads.sh mysite staging push
```

### Example: Restore Production Backup

```sh
# List available backups (using rclone or backup.sh output)
rclone lsf gdrive:backups/mysite/production/

# Restore a specific backup
./scripts/sync/restore.sh mysite production --date=20250723-120000
```

### Example: Pull Production Data for Local Debugging

```sh
# Pull production DB to local
./scripts/sync/sync-db.sh mysite production pull

# Pull production uploads to local
./scripts/sync/sync-uploads.sh mysite production pull
```

## Troubleshooting Tips

- **SSH errors:** Ensure your SSH key is set up and the remote server allows
  your user.
- **Permission denied:** The SSH user may need sudo or write permissions to the
  site directory.
- **rclone errors:** Check your rclone config and remote names; test with
  `rclone lsf <remote>:`.
- **Database import/export errors:** Check DB credentials in
  `config/sync-config.json` and ensure the DB server is running.
- **File sync issues:** Ensure rsync and rclone are installed on both local and
  remote.

## Remote Server Setup (One-Time) ✈️

Before you can use `manage-site.sh` to deploy or set up a site remotely, you
need to prepare the server environment. This often involves using a control
panel like CyberPanel or manual configuration.

**Automated Provisioning for CyberPanel/OpenLiteSpeed:**

If you are using a CyberPanel server with OpenLiteSpeed, the
`scripts/provision-cyberpanel-bedrock.sh` script can automate much of the
infrastructure setup (Cloudflare DNS, CyberPanel site/DB creation, OLS vHost
configuration). See the
[Provisioning Script Documentation](../docs/provisioning.md) for details on
using it. You will still need to ensure the prerequisites listed in that script
(like `scripts/.env.provision`) are met.

**Manual Steps (Adapt as needed):**

1.  **Server Provisioning:**
    - Create the website/domain in your control panel or configure the web
      server (Nginx/Apache) manually. Note the **document root** path (e.g.,
      `/home/yourdomain.com/public_html`). This path should point to the `web`
      subdirectory of your future Bedrock installation (i.e.,
      `<remote_path>/web`).
    - Create the database and database user. **Record the database name,
      username, and password.**
    - Ensure the correct PHP version is assigned/installed.
    - Set up SSL (e.g., Let's Encrypt).
2.  **Install Server Tools:**
    - Connect via SSH.
    - Install necessary tools (if missing): `git`, `composer`, `rsync`,
      `wp-cli`, `rclone`.
    - Example (Debian/Ubuntu):
      `sudo apt update && sudo apt install -y git composer rsync rclone`
    - Install WP-CLI: Follow official instructions at
      [wp-cli.org](https://wp-cli.org/#installing).
    - Install rclone:
      `sudo -v ; curl https://rclone.org/install.sh | sudo bash`.
3.  **Configure `rclone` on Server:** Run `rclone config` on the server to set
    up the _same_ cloud storage remote as configured locally if you intend to
    sync uploads directly involving the server filesystem (less common than
    syncing local <-> cloud).
4.  **Create Project Directory:** Create the main directory on the server where
    Bedrock will reside (e.g., `mkdir -p /home/yourdomain.com/public_html`).
    This path corresponds to `remote_path` in `sync-config.json`. Ensure the SSH
    user specified in `sync-config.json` has write permissions here initially.
    The `manage-site.sh` script will handle permissions later.
5.  **(Optional) Initial Code Checkout:** You _can_ manually clone your repo
    here (`git clone <url> .`), but the `manage-site.sh setup-new-site` command
    can handle the initial code transfer via `rsync`.

**Now you are ready to use `manage-site.sh` for the initial setup or subsequent
deployments.**

## Full Workflow Example: Local -> CyberPanel/Cloudflare -> Deploy 🚀➡️☁️➡️🌍

This section outlines the complete process from creating a site locally to
deploying it on a CyberPanel/OpenLiteSpeed server using the provided scripts.

**Prerequisites (Local Machine):**

_(Verify tools are installed: `git --version`, `jq --version`, `rclone version`,
`rsync --version`, `ssh -V`, `composer --version`, `docker --version`)_

- Core local requirements met (Docker, Composer, git, jq, rclone, rsync, ssh
  client). See
  [Local Development Setup](../docs/local-development.md#initial-setup-☣️).
- `scripts/sync-config.json` created from the example and filled in (will be
  updated later). See
  [Configuration (`scripts/sync-config.json`)](#configuration-scriptssync-configjson-)
  below. **Add to `.gitignore`**.
- `rclone` configured locally (`rclone config`) matching `rclone_remote` in
  `sync-config.json`.
- SSH key authentication configured for accessing the remote server without
  passwords.
- Scripts made executable (`chmod +x *.sh scripts/*.sh`).

**Prerequisites (Remote Server - CyberPanel/OLS Example):**

_(Verify tools are installed remotely via SSH:
`ssh <user>@<host> 'git --version'`, `ssh <user>@<host> 'composer --version'`,
`ssh <user>@<host> 'rsync --version'`, `ssh <user>@<host> 'wp --info'`,
`ssh <user>@<host> 'rclone version'`)_

- CyberPanel/OpenLiteSpeed installed and running.
- Correct PHP version (e.g., 8.1+) available (Check via CyberPanel or
  `ssh <user>@<host> 'php -v'`).
- SSH access enabled for `ssh_user` (preferably key-based).
- `sudo` access configured for `ssh_user` (see
  [Security Best Practices](../docs/security.md#secure-sudo-for-manage-sitesh-)).
- `git`, `composer`, `rsync`, `wp-cli`, `rclone` installed.
- Cloudflare account (if using `provision-cyberpanel-bedrock.sh`).
- `scripts/.env.provision` created and filled (if using
  `provision-cyberpanel-bedrock.sh`). See
  [Provisioning Script Documentation](../docs/provisioning.md). **Add to
  `.gitignore`**.

**Steps:**

1.  **Create Local Site:**

    - Use `./scripts/local/site-init.sh` to generate the local site directory
      and configuration.
    - Example:
      ```bash
      ./scripts/local/site-init.sh mynewsite --port=8010
      ```
    - This creates `websites/mynewsite` and sets it up for local development at
      `http://localhost:8010`. See
      [Creating a New Local Site](../docs/local-development.md#creating-a-new-local-site-🚀).

2.  **Provision Remote Infrastructure (CyberPanel/Cloudflare):**

    - Run the provisioning script, providing the domain name.
    - Example:
      ```bash
      ./scripts/provision-cyberpanel-bedrock.sh mynewsite.com
      ```
    - This script performs:
      - Cloudflare DNS A record creation/verification.
      - CyberPanel website creation.
      - CyberPanel database and user creation (outputs credentials if newly
        created).
      - OpenLiteSpeed vHost configuration for Bedrock (sets document root to
        `/web`, adds rewrite rules).
      - OpenLiteSpeed restart.
    - **Important:** Note the database credentials (name, user, password) output
      by the script if the database was newly created. See
      [Provisioning Script Documentation](../docs/provisioning.md).

3.  **Update Sync Configuration:**

    - Edit `scripts/sync-config.json`.
    - Add or update the entry for your new site (`mynewsite` in this example).
    - Fill in the `production` (or `staging`) environment details:
      - `ssh_host`: Your server IP or hostname.
      - `ssh_user`: Your SSH username (e.g., `root` or another user with sudo).
      - `web_user`: The web server user (often `lsadm` for CyberPanel/OLS, check
        `/etc/passwd` or CyberPanel settings).
      - `remote_path`: The absolute path to the site's root on the server (e.g.,
        `/home/mynewsite.com/public_html`).
      - `domain`: The domain name (`mynewsite.com`).
      - `db_name`, `db_user`, `db_pass`: The database credentials obtained from
        Step 2 (or existing ones if the DB wasn't created).
      - `db_host`: Usually `localhost`.
      - `rclone_remote`: The name of your configured rclone remote (e.g.,
        `s3_backup:`).
      - `rclone_uploads_path`: The path within your rclone remote for this
        site/environment's uploads (e.g., `production/mynewsite/uploads`).
    - Also, ensure the `local` section has the correct `uploads_path` and
      `db_dump_path`.
    - **Remember to add `scripts/sync-config.json` to your `.gitignore`!** See
      [Configuration (`scripts/sync-config.json`)](#configuration-scriptssync-configjson-)
      below for the full structure.

4.  **Initial Deployment & WordPress Setup:**

    - Run the `manage-site.sh` script with the `setup-new-site` action.
    - Provide the site name, environment, and desired WordPress admin
      credentials.
    - Example:
      ```bash
      ./scripts/manage-site.sh mynewsite setup-new-site production wp_admin_user admin@mynewsite.com StrongRemotePassword --site-title="My New Live Site"
      ```
    - This script performs:
      - Local `composer install --no-dev`.
      - `rsync` of project files (excluding `.env`, `.git`) to the
        `remote_path`.
      - Creation and upload of the remote `.env` file using details from
        `sync-config.json` and generated salts.
      - Setting correct file/directory permissions on the remote server.
      - Running `wp core install` remotely using the provided admin credentials.
        See [Actions Overview](#actions-overview) below.

5.  **Verify Site:**

    - Access your live site at `https://mynewsite.com`.
    - Log in to the admin area at `https://mynewsite.com/wp/wp-admin/` using the
      credentials provided in Step 4.

6.  **Subsequent Deployments:**

    - For future code changes:
      ```bash
      ./scripts/manage-site.sh mynewsite deploy production
      ```
    - See [Usage Examples & Scenarios](#usage-examples--scenarios) below.

7.  **Data Synchronization (Optional):**
    - To pull the production database to local:
      ```bash
      ./scripts/manage-site.sh mynewsite pull-db production
      ```
    - To push local uploads to cloud storage:
      ```bash
      ./scripts/manage-site.sh mynewsite push-uploads production
      ```
    - (Use `push-db` and `pull-uploads` with caution, especially for
      production). See [Usage Examples & Scenarios](#usage-examples--scenarios)
      below.

This workflow leverages the scripts to automate the setup and deployment process
significantly.

## Automated CI/CD with GitHub Actions 🤖⚙️

This project includes a GitHub Actions workflow (`.github/workflows/ci-cd.yml`)
to automate testing and deployment.

**Workflow Overview:**

1.  **Trigger:** The workflow runs automatically on:
    - Pushes to the `main` branch.
    - Pull requests targeting the `main` branch.
2.  **Continuous Integration (CI) Job (`ci`):**
    - Runs on both pushes and pull requests.
    - Checks out the code.
    - Sets up the required PHP version (>=8.1).
    - Caches and installs Composer dependencies (`composer install`).
    - Runs PHP linting using Pint (`composer run-script lint`).
3.  **Continuous Deployment (CD) Job (`cd`):**
    - Runs **only** on pushes to the `main` branch, after the `ci` job succeeds.
    - Checks out the code.
    - Connects to the production server via SSH using secrets.
    - Executes deployment commands on the server:
      - Navigates to the site directory (`/path/to/your/live/site` - **needs
        configuration in the workflow file**).
      - Pulls the latest changes (`git pull origin main`).
      - Installs production Composer dependencies
        (`composer install --no-dev --optimize-autoloader`).
      - _(Optional)_ Can be extended with commands for cache clearing,
        permissions, etc.

**Required Secrets:**

For the deployment (`cd`) job to work, you must configure the following secrets
in your GitHub repository settings (`Settings` > `Secrets and variables` >
`Actions`):

- `SSH_HOST`: The hostname or IP address of your production server.
- `SSH_USER`: The username for SSH login.
- `SSH_KEY`: The private SSH key corresponding to a public key authorized on the
  server for `SSH_USER`.
- `SSH_PORT`: (Optional) The SSH port if it's not the default (22).

**Important:**

- You **must** edit the `.github/workflows/ci-cd.yml` file and replace
  `/path/to/your/live/site` in the `cd` job's script section with the actual
  absolute path to your Bedrock project root on the production server.
- Ensure the `SSH_USER` has the necessary permissions on the server to pull the
  repository and run `composer install` in the deployment directory.

This automated workflow helps ensure code quality through linting and
streamlines the deployment process to your production server.

## Modular Deployment & Sync Scripts 🛠️

Deployment and synchronization between your local environment and remote servers
(staging, production) are handled by modular scripts in `scripts/deploy/` and
`scripts/sync/`.

### Configuration (`config/sync-config.json`)

This file is **essential** for all modular scripts. It stores all connection
details, paths, and credentials needed to interact with your remote
environments.

- **Create:** Create `config/sync-config.json` and fill in your site and
  environment details.
- **Security:** **Add `config/sync-config.json` to your `.gitignore` file.**
  Never commit sensitive credentials.
- **Structure:** See the sample in the README or above.

### Actions Overview

**Usage Format:**

```bash
# Deploy code
./scripts/deploy/deploy.sh <site_name> <environment>

# Sync database (push/pull)
./scripts/sync/sync-db.sh <site_name> <environment> push
./scripts/sync/sync-db.sh <site_name> <environment> pull

# Sync uploads (push/pull)
./scripts/sync/sync-uploads.sh <site_name> <environment> push
./scripts/sync/sync-uploads.sh <site_name> <environment> pull

# Backup/restore
./scripts/sync/backup.sh <site_name> <environment>
./scripts/sync/restore.sh <site_name> <environment> --date=YYYYMMDD-HHMMSS
```

- **deploy.sh**: Deploys code changes from local to remote.
- **sync-db.sh**: Pushes or pulls the database between local and remote.
- **sync-uploads.sh**: Pushes or pulls uploads between local and remote/cloud.
- **backup.sh**: Backs up DB and uploads to rclone remote with retention policy.
- **restore.sh**: Restores DB and uploads from a selected backup.

### Usage Examples & Scenarios

**(Remember to replace placeholders like `myblog`, `staging`, `production`, etc.
with your actual values from `config/sync-config.json`)**

1.  **Scenario: Initial Deployment of 'myblog' to Staging Server**

    - **Prerequisites:** Remote server prepared, `config/sync-config.json`
      filled for `myblog`/`staging`, local site `myblog` created.
    - **Command:**
      ```bash
      ./scripts/deploy/deploy.sh myblog staging
      ```
    - **Outcome:** Code synced to `/var/www/staging.myblog.com` (as per
      `config/sync-config.json`), remote permissions set.

2.  **Scenario: Deploying Latest Code Changes for 'myblog' to Production**

    - **Prerequisites:** `config/sync-config.json` configured for
      `myblog`/`production`. Code changes committed locally.
    - **Command:**
      ```bash
      ./scripts/deploy/deploy.sh myblog production
      ```
    - **Outcome:** Local `composer install --no-dev` runs in
      `websites/myblog/www`, code changes are synced via `rsync` to
      `/var/www/myblog.com` (as per `config/sync-config.json`), remote file
      permissions are updated.

3.  **Scenario: Pulling Production Database & Uploads to Local 'myblog' for
    Debugging**

    - **Prerequisites:** `config/sync-config.json` configured for
      `myblog`/`production` and `myblog`/`local`. `rclone` configured locally.
      Local Docker containers for `myblog` are running:
      ```bash
      cd websites/myblog && docker-compose up -d
      ```
    - **Commands:**

      ```bash
      ./scripts/sync/sync-db.sh myblog production pull
      ./scripts/sync/sync-uploads.sh myblog production pull
      ```

    - **Outcome:** Local `myblog` database and uploads now mirror the production
      environment's data.

4.  **Scenario: Pushing Local Database Changes from 'myblog' to Staging for
    Review**

    - **Prerequisites:** `config/sync-config.json` configured for
      `myblog`/`staging`. Local changes made. **Understand this overwrites the
      staging DB.**
    - **Command:**
      ```bash
      ./scripts/sync/sync-db.sh myblog staging push
      ```
    - **Outcome:** The database `staging_db_name` on the staging server is
      replaced with the content from the local `myblog_db` database.

5.  **Scenario: Pushing Local Uploads for 'myblog' to Cloud Storage (Staging)**
    - **Prerequisites:** `config/sync-config.json` configured for
      `myblog`/`staging`. `rclone` configured locally. New uploads added
      locally.
    - **Command:**
      ```bash
      ./scripts/sync/sync-uploads.sh myblog staging push
      ```
    - **Outcome:** Files from the local uploads directory are copied to the
      `rclone` remote path defined for staging in `config/sync-config.json`.

**Important Warnings:**

- **push and pull operations are destructive on the target environment.** Use
  extreme caution, especially with `production`. Double-check the site name and
  environment before running.
- Ensure your `config/sync-config.json` is accurate and kept secure (use
  `.gitignore`).
- Verify SSH user permissions and `sudoers` configuration on the remote server
  for reliable script execution.

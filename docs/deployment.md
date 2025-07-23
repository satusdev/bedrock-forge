# Deployment & Remote Management ☁️🌍

This document covers preparing remote servers and using the `manage-site.sh`
script for deployment and data synchronization.

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

    - Use `create-site.sh` or `make create-site` to generate the local site
      directory, configuration, and optionally install WordPress locally.
    - Example:
      ```bash
      make create-site site=mynewsite port=8010 create-db=yes install-wp=yes run-composer=yes switch-dev=yes wp-admin-pass=localpassword
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

## The `manage-site.sh` Script (Deployment & Sync) 🛠️

This is the core script for managing interactions between your local environment
and remote servers (staging, production). **Run this script from your local
project root.**

### Configuration (`scripts/sync-config.json`)

This file is **essential** for `manage-site.sh`. It stores all connection
details, paths, and credentials needed to interact with your remote
environments.

- **Create:** Copy `scripts/sync-config.sample.json` to
  `scripts/sync-config.json`.
- **Security:** **Add `scripts/sync-config.json` to your `.gitignore` file.**
  Never commit sensitive credentials.
- **Structure:**
  ```json
  {
  	"my_site_name": {
  		// Top-level key is the site name (must match websites/my_site_name)
  		"local": {
  			// Settings specific to the local environment
  			"uploads_path": "websites/my_site_name/www/web/app/uploads/", // Relative path to local uploads
  			"db_dump_path": "scripts/dumps/" // Directory for temporary DB dumps
  		},
  		"staging": {
  			// Settings for the 'staging' environment
  			"ssh_host": "your_staging_server_ip_or_hostname", // SSH Hostname or IP
  			"ssh_user": "ssh_username", // User for SSH connection (needs sudo NOPASSWD for web_user often)
  			"web_user": "www-data", // The user the web server runs as (e.g., www-data, nobody, lsadm)
  			"remote_path": "/var/www/staging.mysite.com", // Absolute path to Bedrock root on remote server
  			"domain": "staging.mysite.com", // Domain used for WP URLs and .env setup
  			"db_name": "staging_db_name",
  			"db_user": "staging_db_user",
  			"db_pass": "staging_db_password",
  			"db_host": "localhost", // Usually localhost if DB is on the same server
  			"rclone_remote": "myCloudStorage:", // Name of rclone remote (e.g., s3_backup:)
  			"rclone_uploads_path": "staging/my_site_name/uploads" // Path *within* the rclone remote
  		},
  		"production": {
  			// Settings for the 'production' environment
  			"ssh_host": "your_prod_server_ip_or_hostname",
  			"ssh_user": "ssh_username",
  			"web_user": "www-data",
  			"remote_path": "/var/www/mysite.com",
  			"domain": "mysite.com",
  			"db_name": "prod_db_name",
  			"db_user": "prod_db_user",
  			"db_pass": "prod_db_password",
  			"db_host": "localhost",
  			"rclone_remote": "myCloudStorage:",
  			"rclone_uploads_path": "production/my_site_name/uploads"
  		}
  		// Add more environments if needed (e.g., "development_remote")
  	}
  	// Add more sites as top-level keys
  }
  ```
- **`ssh_user` Permissions:** This user needs to be able to connect via SSH,
  write to the `remote_path`, and ideally run commands as the `web_user` via
  `sudo` (often without a password prompt for script automation). Configure
  `sudoers` carefully on the remote server (e.g.,
  `ssh_user ALL=(web_user) NOPASSWD: /usr/local/bin/wp *`,
  `ssh_user ALL=(ALL) NOPASSWD: /usr/bin/chown *`, etc. - consult security best
  practices).

### Actions Overview

**Usage Format:**

```bash
./scripts/manage-site.sh <site_name> <action> <environment> [additional_args...]
```

- **`setup-new-site`**: Performs the initial setup on a remote server.

  **`setup-new-site` Flowchart:**

  ```mermaid
  graph TD
      A[Start: ./manage-site.sh site setup-new-site env user email pass] --> B{Read sync-config.json for site/env};
      B --> C[Run 'composer install --no-dev' locally];
      C --> D[Generate WP Salts locally];
      D --> E[rsync code to remote_path - exclude .env, .git-];
      E --> F[Create remote .env content - DB creds, domain, salts];
      F --> G[Upload remote .env via scp];
      G --> H[SSH: Set file permissions/ownership on remote];
      H --> I{SSH: Check if WP installed?};
      I -- No --> J[SSH: Run 'wp core install' with args];
      J --> K{SSH: Activate default theme? - optional flag};
      K -- Yes --> L[SSH: Run 'wp theme activate ...'];
      I -- Yes --> M[End];
      L --> M;
      K -- No --> M;
  ```

  - Builds local production composer dependencies.
  - Syncs project files (excluding `.env`, `.git`, etc.) using `rsync`.
  - Generates salts locally.
  - Creates and uploads a `.env` file configured with remote DB credentials,
    domain, and salts from `sync-config.json`.
  - Sets appropriate file/directory permissions remotely via SSH.
  - Checks if WordPress is installed; if not, runs `wp core install` remotely
    using credentials provided as arguments.
  - Optionally activates a default theme.
  - **Required Args:** `<admin_user> <admin_email> <admin_password>`
  - **Optional Args:** `--site-title="Your Title"` `--activate-defaults`

- **`deploy`**: Deploys code changes from local to remote.

  **`deploy` Flowchart:**

  ```mermaid
  graph TD
      A[Start: ./manage-site.sh site deploy env] --> B{Read sync-config.json for site/env};
      B --> C[Run 'composer install --no-dev' locally];
      C --> D[rsync code to remote_path - exclude .env, .git];
      D --> E[SSH: Set file permissions/ownership on remote];
      E --> F[End];
  ```

  - Builds local production composer dependencies (`composer install --no-dev`).
  - Syncs project files using `rsync` (respecting excludes like `.env`).
  - Sets file/directory permissions remotely.

- **`push-db`**: Exports local Docker DB and imports it on the remote server.
  **(DANGEROUS - Overwrites remote DB)**.

- **`pull-db`**: Exports remote DB and imports it into the local Docker
  container. **(Overwrites local DB)**.

  **Database Sync Data Flow (`push-db` / `pull-db`):**

  ```mermaid
  graph LR
      subgraph Local Machine
          A[Local Docker DB - bedrock_shared_db_1]
          B(Local Dump File - scripts/dumps/*.sql)
      end
      subgraph Remote Server
          C[Remote DB - e.g., staging_db]
          D(Remote Temp Dump File - /tmp/*.sql)
      end

      subgraph Push DB Action
          direction TB
          A -- 1. wp db export (local) --> B;
          B -- 2. scp --> D;
          D -- 3. wp db import (remote) --> C;
      end
      subgraph Pull DB Action
          direction TB
          C -- 1. wp db export (remote) --> D;
          D -- 2. scp --> B;
          B -- 3. wp db import (local) --> A;
      end

      style Push DB Action fill:#f9f,stroke:#333,stroke-width:1px,color:#000
      style Pull DB Action fill:#ccf,stroke:#333,stroke-width:1px,color:#000
  ```

  - Requires confirmation for production (`push-db`).
  - Uses `wp db export`, `scp`, and `wp db import` via Docker exec (local) and
    SSH (remote).

- **`push-uploads`**: Syncs local uploads directory to the configured `rclone`
  cloud remote path. **(Overwrites cloud files)**.

- **`pull-uploads`**: Syncs the `rclone` cloud remote path _to_ your local
  uploads directory. **(Overwrites local files)**.

  **Uploads Sync Data Flow (`push-uploads` / `pull-uploads`):**

  ```mermaid
  graph TD
      A[Local Uploads Directory - websites/site/www/web/app/uploads/]
      B[Cloud Storage - rclone Remote Path - e.g., myCloud:env/site/uploads]

      subgraph Push Uploads Action
          A -- "rclone copy local cloud:path" --> B
      end
      subgraph Pull Uploads Action
          B -- "rclone copy cloud:path local" --> A
      end

      style Push Uploads Action fill:#f9f,stroke:#333,stroke-width:1px,color:#000
      style Pull Uploads Action fill:#ccf,stroke:#333,stroke-width:1px,color:#000
  ```

  - Requires confirmation for production (`push-uploads`).
  - Uses `rclone copy`.
  - **Note:** This syncs between the **local machine** and **cloud storage**. It
    does _not_ automatically sync between cloud storage and the remote server's
    filesystem. That requires separate server-side `rclone` commands or
    configuration if needed.

### Usage Examples & Scenarios

**(Remember to replace placeholders like `myblog`, `staging`, `production`, etc.
with your actual values from `sync-config.json`)**

1.  **Scenario: Initial Setup of 'myblog' on Staging Server**

    - **Prerequisites:** Remote server prepared, `sync-config.json` filled for
      `myblog`/`staging`, local site `myblog` created.
    - **Command:**
      ```bash
      # Example: Setup 'myblog' on staging server
      ./scripts/manage-site.sh myblog setup-new-site staging stage_admin stage_admin@example.com StrongP@ssw0rd --site-title="My Blog (Staging)" --activate-defaults
      ```
    - **Outcome:** Code synced to `/var/www/staging.myblog.com` (as per
      `sync-config.json`), remote `.env` created, permissions set (e.g.,
      `chown www-data:www-data`), WordPress installed with user `stage_admin`,
      default theme activated on `staging.myblog.com`.

2.  **Scenario: Deploying Latest Code Changes for 'myblog' to Production**

    - **Prerequisites:** `sync-config.json` configured for
      `myblog`/`production`. Code changes committed locally.
    - **Command:**
      ```bash
      # Example: Deploy 'myblog' to production
      ./scripts/manage-site.sh myblog deploy production
      ```
    - **Outcome:** Local `composer install --no-dev` runs in
      `websites/myblog/www`, code changes are synced via `rsync` to
      `/var/www/myblog.com` (as per `sync-config.json`), remote file permissions
      are updated (e.g., `chown www-data:www-data`).

3.  **Scenario: Pulling Production Database & Uploads to Local 'myblog' for
    Debugging**

    - **Prerequisites:** `sync-config.json` configured for `myblog`/`production`
      and `myblog`/`local`. `rclone` configured locally. Local Docker containers
      for `myblog` are running (`make start site=myblog`).
    - **Commands:**

      ```bash
      # Example: Pull production DB for 'myblog' to local Docker DB
      # (Overwrites local 'myblog_db' database!)
      ./scripts/manage-site.sh myblog pull-db production

      # Example: Pull production uploads for 'myblog' from cloud to local
      # (Overwrites local 'websites/myblog/www/web/app/uploads/'!)
      ./scripts/manage-site.sh myblog pull-uploads production
      ```

    - **Outcome:** Local `myblog` database (in the `bedrock_shared_db_1`
      container) and `websites/myblog/www/web/app/uploads/` directory now mirror
      the production environment's data (DB from server, uploads from cloud
      storage defined in `sync-config.json`).

4.  **Scenario: Pushing Local Database Changes from 'myblog' to Staging for
    Review**

    - **Prerequisites:** `sync-config.json` configured for `myblog`/`staging`.
      Local changes made. **Understand this overwrites the staging DB.**
    - **Command:**
      ```bash
      # Example: Push local 'myblog' DB to staging
      # (Overwrites staging DB!)
      ./scripts/manage-site.sh myblog push-db staging
      ```
    - **Outcome:** The database `staging_db_name` on the staging server is
      replaced with the content from the local `myblog_db` database (in the
      `bedrock_shared_db_1` container).

5.  **Scenario: Pushing Local Uploads for 'myblog' to Cloud Storage (Staging)**
    - **Prerequisites:** `sync-config.json` configured for `myblog`/`staging`.
      `rclone` configured locally. New uploads added locally.
    - **Command:**
      ```bash
      # Example: Push local 'myblog' uploads to staging cloud path
      # (Overwrites files in cloud storage!)
      ./scripts/manage-site.sh myblog push-uploads staging
      ```
    - **Outcome:** Files from the local `websites/myblog/www/web/app/uploads/`
      directory are copied to the `rclone` remote path defined for staging in
      `sync-config.json` (e.g., `myCloudStorage:staging/myblog/uploads`).

**Important Warnings:**

- **`push-db` and `push-uploads` are destructive operations on the target
  environment.** Use extreme caution, especially with `production`. Double-check
  the site name and environment before running.
- Ensure your `sync-config.json` is accurate and kept secure (use `.gitignore`).
- Verify SSH user permissions and `sudoers` configuration on the remote server
  for reliable script execution.

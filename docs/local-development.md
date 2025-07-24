# Local Development 💻

This document covers setting up the project locally and managing your local
WordPress sites. ------- ADD AFTER

## Real-World Usage Examples

### Example: Create, Configure, and Start a New Site

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

### Example: Clone a Site for Staging

```sh
# Create a new site 'myblog-staging' on port 8006
./scripts/local/site-init.sh myblog-staging --port=8006

# Copy .env.production to .env.staging and adjust URLs
cp websites/myblog/.env.production websites/myblog-staging/.env.staging
nano websites/myblog-staging/.env.staging  # Update URLs and DB creds

# Switch to staging environment
./scripts/local/env-switch.sh myblog-staging staging

# Start containers
cd websites/myblog-staging && docker-compose up -d
```

## Troubleshooting Tips

- **Containers won't start:** Check `docker ps -a` and `docker logs <container>`
  for errors.
- **Port already in use:** Choose a different port with `--port=XXXX` when
  creating the site.
- **.env not switching:** Make sure to restart containers after switching env:
  ```bash
  cd websites/mysite && docker-compose restart
  ```
- **Composer errors:** Run `composer install` manually in `websites/<site>/www/`
  to debug.
- **Database connection issues:** Check DB credentials in `.env.*` files and
  ensure the shared DB container is running.

## Initial Setup ☣️

**Prerequisites (Local Machine):**

_(You can check if most tools are installed by running `toolname --version` or
`which toolname` in your terminal, e.g., `git --version`, `docker --version`,
`composer --version`, `jq --version`, `rclone version`, `rsync --version`,
`ssh -V`)_

- `git`
- [Docker](https://docs.docker.com/get-docker/) &
  [Docker Compose](https://docs.docker.com/compose/install/) (Verify with
  `docker --version` and `docker compose version`)
- [Composer](https://getcomposer.org/) (Verify with `composer --version`)
- `curl` & `openssl` (Usually pre-installed on Linux/macOS; used by
  `create-site.sh`)
- `make` (Optional, for Makefile shortcuts; verify with `make --version`)
- `jq` (Required by `manage-site.sh`; verify with `jq --version`)
- `rclone` (Required by `manage-site.sh`; verify with `rclone version`)
- `rsync` (Required by `manage-site.sh`; verify with `rsync --version`)
- `ssh` & `scp` clients (Usually pre-installed; required by `manage-site.sh`;
  verify with `ssh -V`)

**Setup Steps:**

1.  **Clone Repository:**
    ```bash
    git clone <your-repo-url> wordpress-with-docker-bedrock
    cd wordpress-with-docker-bedrock
    ```
2.  **Install Bedrock Dependencies in Template:** ```bash cd core/template/www
    composer install cd ../../..

````
_(Customize `core/template/www/composer.json` first if needed)._
3.  **Configure Core DB Password:**
    ```bash
    cp core/.env.example core/.env
    ```
    - Edit `core/.env` and set a secure `MYSQL_ROOT_PASSWORD`.
    - **Add `core/.env` to your main `.gitignore` file.**
4.  **Start Shared DB:**
    ```bash
    make start-db
    ```
    _(Run once initially. Needed before creating/running local sites)._
5.  **Configure Deployment/Sync Script (`manage-site.sh`):**
    ```bash
    cp scripts/sync-config.sample.json scripts/sync-config.json
    ```
    - **Crucially, edit `scripts/sync-config.json`** with the correct details
      for _each_ site and _each_ remote environment (staging, production). See
      [Deployment Configuration](../docs/deployment.md#configuration-scriptssync-configjson)
      for details.
    - **Add `scripts/sync-config.json` to your main `.gitignore` file.**
    - Configure `rclone` locally (`rclone config`) so the remote name(s) match
      those used in `sync-config.json`. See
      [rclone docs](https://rclone.org/docs/).
    - Ensure scripts are executable: `chmod +x scripts/*.sh *.sh`.
    - (Highly Recommended) Set up SSH key-based authentication from your local
      machine to your remote servers for passwordless script execution. See
      [Security Best Practices](../docs/security.md#ssh-hardening-).

## Creating a New Local Site 🚀

Use the `create-site.sh` script (or the `make create-site` shortcut) to set up a
new site directory locally based on the template.

**`create-site.sh` Local Setup Flowchart:**

```mermaid
graph TD
    A[Start: ./create-site.sh site port flags...] --> B{Parse Arguments};
    B --> C[Create Directory: websites/site];
    C --> D[Copy files from core/template/ to websites/site/];
    D --> E[Replace placeholders in .tpl files - site, port];
    E --> F[Generate WP Salts];
    F --> G[Populate .env.* files with salts, defaults];
    G --> H{--create-db flag set?};
    H -- Yes --> I[Connect to Shared DB - core/.env];
    I --> J[Create DB 'site_db' & User 'site_user'];
    H -- No --> K;
    J --> K{--run-composer flag set?};
    K -- Yes --> L[Run 'composer install' in websites/site/www/];
    K -- No --> M;
    L --> M{--install-wp flag set?};
    M -- Yes --> N[Run 'wp core install' via Docker];
    M -- No --> O;
    N --> O{--switch-dev flag set?};
    O -- Yes --> P[Copy .env.development to .env];
    O -- No --> Q[End];
    P --> Q;

    style A fill:#fff
    style Q fill:#fff
````

**Example using the script:**

```bash
# Create 'myblog', access at http://localhost:8005
./scripts/local/site-init.sh myblog --port=8005 --create-db --install-wp --run-composer --switch-dev --wp-admin-pass=securepassword
```

**Explanation of Common Options (for `./scripts/local/site-init.sh`):**

- `<name>`: (Required) Name for the site directory (e.g., `myblog`).
- `--port=<number>`: (Required) Local port for Nginx (e.g., `8005`).
- `--create-db`: Auto-create local database & user (uses root pass from
  `core/.env`).
- `--install-wp`: Auto-run `wp core install` locally (requires `--create-db`).
- `--run-composer`: Auto-run `composer install` locally.
- `--switch-dev`: Auto-switch to `.env.development`.
- `--wp-admin-pass=<pass>`: Set local WP admin password if `--install-wp`.

_Run `./scripts/local/site-init.sh --help` for all options._ The script
generates unique salts for `.env.development`, `.env.staging`,
`.env.production`.

**After Local Site Creation:**

1.  **Review `.env.*` Files:** Check `websites/<new_site_name>/.env.*`. You'll
    need accurate DB credentials and URLs for staging/production before using
    deployment or sync scripts.
2.  **Start Containers (if needed):** If you didn't use options that start
    containers, run:
    ```bash
    cd websites/<new_site_name> && docker-compose up -d
    ```
3.  **Access Site:** Visit `http://localhost:<port>` and
    `http://localhost:<port>/wp-admin`.
4.  **Update `sync-config.json`:** Add entries for your new site and its remote
    environments if you plan to deploy/sync it. See
    [Deployment Configuration](../docs/deployment.md#configuration-scriptssync-configjson).

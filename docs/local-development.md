# Local Development 💻

This document covers setting up the project locally and managing your local
WordPress sites using DDEV.

---

## Prerequisites

- [DDEV](https://ddev.readthedocs.io/en/latest/) (verify with `ddev --version`)
- [Composer](https://getcomposer.org/) (verify with `composer --version`)
- `git` (verify with `git --version`)

---

## Example: Create, Configure, and Start a New Site (DDEV)

```sh
# 1. Create a new site directory
cd /home/nadbad/Work/Wordpress
mkdir site
cd site

# 2. Configure DDEV for WordPress with Bedrock's docroot
ddev config --project-type=wordpress --docroot=web --create-docroot

# 3. Install Bedrock via Composer
composer create-project roots/bedrock .

# 4. Start the DDEV project
ddev start

# 5. Install WordPress with WP-CLI
ddev wp core install --url=https://site.ddev.site --title="My Site" --admin_user=admin --admin_email=admin@example.com --admin_password=securepassword

# 6. Launch the site in your browser
ddev launch

# Access WP-Admin at https://site.ddev.site/wp/wp-admin
```

---

## Example: Clone a Site for Staging (DDEV)

```sh
# Clone your site directory and configure DDEV
cp -r /home/nadbad/Work/Wordpress/site /home/nadbad/Work/Wordpress/site-staging
cd /home/nadbad/Work/Wordpress/site-staging

# Update DDEV project name and config
ddev config --project-name=site-staging --project-type=wordpress --docroot=web

# Start the DDEV project
ddev start

# Update environment variables in .ddev/config.yaml if needed
nano .ddev/config.yaml

# Install WordPress with WP-CLI (adjust URL and credentials)
ddev wp core install --url=https://site-staging.ddev.site --title="Staging Site" --admin_user=admin --admin_email=admin@example.com --admin_password=securepassword

# Launch the staging site
ddev launch
```

---

## Troubleshooting Tips (DDEV)

- **Port conflicts:**  
  Use `ddev config --webserver-port=8010` to change the default port if needed.
- **.env management:**  
  DDEV manages environment variables internally. Customize them in
  `.ddev/config.yaml`.
- **Database import/export:**  
  Use `ddev import-db --file=dump.sql` and `ddev export-db --file=dump.sql`.
- **Site not loading:**  
  Run `ddev restart` to restart containers. Check `ddev logs` for errors.
- **WP-CLI issues:**  
  Use `ddev wp <command>` for all WordPress CLI operations.
- **Composer errors:**  
  Run `composer install` in your site directory if dependencies are missing.
- **General DDEV help:**  
  Run `ddev help` for command reference.

---

## Initial Setup

1. **Clone Repository:**
   ```sh
   git clone <your-repo-url> wordpress-with-ddev-bedrock
   cd wordpress-with-ddev-bedrock
   ```
2. **Install Bedrock Dependencies:**
   ```sh
   cd site
   composer install
   ```
3. **Configure and Start DDEV:**
   ```sh
   ddev config --project-type=wordpress --docroot=web --create-docroot
   ddev start
   ```
4. **Provision WordPress:**
   ```sh
   ddev wp core install --url=https://site.ddev.site --title="My Site" --admin_user=admin --admin_email=admin@example.com --admin_password=securepassword
   ddev launch
   ```

---

**All local site creation and management is now handled by DDEV. Legacy scripts
and Docker Compose are no longer required for local development.**

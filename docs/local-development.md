# Local Development 💻

This document covers setting up and managing your local WordPress Bedrock sites
using DDEV.

---

## Prerequisites

- [DDEV](https://ddev.readthedocs.io/en/latest/) (`ddev --version`)
- [Composer](https://getcomposer.org/) (`composer --version`)
- `git`

---

## Example: Create, Configure, and Start a New Site (DDEV)

```sh
cd /home/nadbad/Work/Wordpress
mkdir site
cd site

ddev config --project-type=wordpress --docroot=web --create-docroot
composer create-project roots/bedrock .
ddev start
ddev wp core install --url=https://site.ddev.site --title="My Site" --admin_user=admin --admin_email=admin@example.com --admin_password=securepassword
ddev launch

# Copy automation scripts, Jenkinsfile, and config files into your project
bash ../scripts/local/ddev-post-create-setup.sh $PWD
```

---

## Common DDEV Commands

- `ddev wp <command>` — Run any WP-CLI command inside the container.
- `ddev composer install` — Install PHP dependencies.
- `ddev import-db --file=<file.sql>` — Import a database dump.
- `ddev export-db --file=<file.sql>` — Export the database.
- `ddev exec <command>` — Run any CLI tool inside the container.
- `ddev launch` — Open your site in the browser.
- `ddev launch -d` — Open database admin tools (phpMyAdmin/Adminer).

---

## Troubleshooting Tips

- **Port conflicts:** Use `ddev config --webserver-port=8010` to change the
  default port.
- **.env management:** DDEV manages environment variables internally; customize
  in `.ddev/config.yaml`.
- **Database import/export:** Use `ddev import-db` and `ddev export-db`.
- **Site not loading:** Run `ddev restart` and check `ddev logs`.
- **WP-CLI issues:** Use `ddev wp <command>`.
- **Composer errors:** Use `ddev composer install`.
- **General DDEV help:** Run `ddev help`.

---

**All local site creation and management is now handled by DDEV. Legacy scripts
and Docker Compose are no longer required for local development.**

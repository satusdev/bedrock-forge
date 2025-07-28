# Troubleshooting Guide 🛠️

This guide covers common issues encountered during setup and usage of the
multi-site environment.

## Table of Contents

- [Docker Issues](#docker-issues-)
- [Database Connection Errors](#database-connection-errors-)
- [SSH Connection Issues (`manage-site.sh`)](#ssh-connection-issues-manage-sitesh-)
- [`rsync` / `rclone` Errors](#rsync--rclone-errors-)
- [Remote Server Permission Errors](#remote-server-permission-errors-)
- [WP-CLI Command Failures](#wp-cli-command-failures-)

---

## Docker Issues 🐳

### Shared DB (`bedrock_shared_db_1`) Fails to Start

- **Symptom:** Starting the shared DB container fails, or the container exits
  immediately.
- **Possible Causes:**
  - **Port Conflict:** Another service (like a local MySQL server) might be
    using port 3306 on your host machine.
    - **Solution:** Stop the conflicting service or change the host port mapping
      in `core/docker-compose-db.yml` (e.g., `"3307:3306"`) and update your
      local `.env.development` files accordingly (`DB_HOST=db:3306` remains the
      same inside the Docker network).
  - **Missing `core/.env`:** The `MYSQL_ROOT_PASSWORD` is required. Ensure you
    copied `core/.env.example` to `core/.env` and set the password.
  - **Volume Issues:** Docker might have issues accessing or creating the
    `dbdata` volume. Check Docker daemon logs for errors. Try
    `docker volume rm dbdata` ( **Warning:** This deletes local database data!)
    and then run:
    ```bash
    docker-compose -f core/docker-compose-db.yml up -d
    ```
  - **Insufficient Resources:** Docker might not have enough RAM/CPU allocated.
    Check Docker Desktop settings.

### Site Containers (`<site_name>_app_1`, `<site_name>_webserver_1`) Fail to Start

- **Symptom:** Starting site containers fails, or containers exit.
- **Possible Causes:**
  - **Port Conflict:** The Nginx port specified (`port=<number>` during creation
    or in `docker-compose.yml`) might be in use by another site container or
    local service.
    - **Solution:** Stop the conflicting service or choose a different port for
      the site:
      ```bash
      cd websites/<name> && docker-compose down
      ```
      Edit `websites/<name>/docker-compose.yml`, then:
      ```bash
      cd websites/<name> && docker-compose up -d
      ```
  - **Shared DB Not Running:** Site containers depend on the shared DB. Ensure
    the shared DB container is running:
    ```bash
    docker-compose -f core/docker-compose-db.yml up -d
    ```
    and the `bedrock_shared_db_1` container is running (`docker ps`).
  - **Network Issues:** The `bedrock_shared_network` might not exist or have
    problems. Try `docker network inspect bedrock_shared_network`. If missing,
    run:
    ```bash
    docker-compose -f core/docker-compose-db.yml down
    docker-compose -f core/docker-compose-db.yml up -d
    ```
    to recreate it.
  - **Missing `.env` File:** The site needs an active `.env` file (usually a
    copy of `.env.development`). Use:
    ```bash
    ./scripts/local/env-switch.sh <name> development
    ```
    if needed.
  - **Syntax Errors:** Check `docker-compose.yml` or `nginx.conf` for syntax
    errors. Run `docker-compose config` within the site directory
    (`cd websites/<name> && docker-compose config`) to validate.
  - **Build Issues:** If you modified `core/Dockerfile`, the image build might
    have failed. Try rebuilding:
    ```bash
    docker-compose -f core/docker-compose-db.yml build
    ```

### Logs Show Errors

- **Analyze Logs:** Carefully read the output from the `app` and `webserver`
  containers for specific PHP, Nginx, or WordPress errors. To view logs, run:
  ```bash
  cd websites/<name> && docker-compose logs
  ```

---

## Database Connection Errors 💾

### Local Site Cannot Connect ("Error establishing a database connection")

- **Check `.env`:** Verify `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_HOST` in
  `websites/<name>/.env` match the details used/created. For local development,
  `DB_HOST` should typically be `db` (the service name from
  `core/docker-compose-db.yml`).
- **DB Container Running?** Ensure `bedrock_shared_db_1` is running
  (`docker ps`).
- **Network:** Confirm site containers and the DB container are on the
  `bedrock_shared_network`.
- **User/DB Exists?** If you used `create-db=yes`, the script should have
  created them. You can verify by connecting to the DB container: Run:
  ```bash
  docker-compose -f core/docker-compose-db.yml exec db bash
  ```
  then `mysql -u root -p` (use root password from `core/.env`), then
  `SHOW DATABASES;` and `SELECT user, host FROM mysql.user;`.
- **Credentials Correct?** Double-check the password in `.env` against the one
  set for the user.

### Remote Site Cannot Connect (After `setup-new-site` or `deploy`)

- **Check Remote `.env`:** SSH into the server (`ssh <user>@<host>`), navigate
  to `<remote_path>`, and check the `.env` file. Verify `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`, `DB_HOST` match the actual remote database credentials.
- **Database Server Running?** Ensure MySQL/MariaDB is running on the remote
  server.
- **Firewall?** Check if a firewall on the remote server is blocking connections
  (usually port 3306) if the DB is hosted elsewhere or if `DB_HOST` is not
  `localhost`.
- **User Permissions:** Ensure the remote DB user has the correct permissions
  (host, privileges) to access the database.

---

## SSH Connection Issues (`manage-site.sh`) 🌐

- **Symptom:** `manage-site.sh` fails with SSH connection errors (timeout,
  permission denied).
- **Check `sync-config.json`:** Verify `ssh_host` and `ssh_user` are correct for
  the target site/environment.
- **Network/Firewall:** Ensure your local machine can reach the `ssh_host` on
  port 22 (or the configured SSH port). Check server-side firewalls (like `ufw`
  or security groups).
- **SSH Key Authentication:**
  - Is your public key (`~/.ssh/id_rsa.pub` or similar) added to the
    `~/.ssh/authorized_keys` file for the `ssh_user` on the remote server?
  - Are the permissions correct on the remote server (`chmod 700 ~/.ssh`,
    `chmod 600 ~/.ssh/authorized_keys`)?
  - Is your local SSH agent running and holding the key (`ssh-add -l`)? Try
    `ssh-add` if needed.
- **Password Authentication:** If not using keys, ensure you can manually SSH
  using the password. The script relies on passwordless access (keys or agent)
  for automation.
- **`ssh_user` Exists?** Confirm the user exists on the remote system.

---

## `rsync` / `rclone` Errors 💾☁️

### `rsync` Errors (During `deploy` or `setup-new-site`)

- **Symptom:** Permission denied, connection refused, file transfer errors.
- **SSH Issues:** `rsync` often uses SSH. Resolve SSH connection issues first.
- **Remote Path (`remote_path`):** Does the directory exist on the remote
  server? Does the `ssh_user` have write permissions to it? The script tries to
  set permissions later, but initial write access might be needed.
- **`rsync` Installed?** Ensure `rsync` is installed on both local and remote
  machines.

### `rclone` Errors (During `push-uploads` or `pull-uploads`)

- **Symptom:** Authentication errors, path not found, sync failures.
- **`rclone` Configuration:**
  - Is `rclone` installed locally (and remotely if syncing server-side)?
  - Did you run `rclone config` locally to set up the remote specified in
    `sync-config.json` (`rclone_remote`)?
  - Does the configuration name exactly match the `rclone_remote` value (e.g.,
    `myS3:` vs `myS3`)?
  - Are the credentials (API keys, tokens) in your `rclone` config still valid?
- **Paths:**
  - Does the local `uploads_path` in `sync-config.json` point correctly to
    `websites/<name>/www/web/app/uploads/`?
  - Does the `rclone_uploads_path` exist or is it creatable within your cloud
    storage remote? Check for typos.
- **Permissions (Cloud):** Ensure the credentials used by `rclone` have the
  necessary read/write permissions for the target bucket/folder in your cloud
  storage.

---

## Remote Server Permission Errors 📁

- **Symptom:** Errors during `deploy` or `setup-new-site` related to `chown` or
  `chmod`, or the live site shows permission-related errors (e.g., cannot write
  to `uploads`).
- **`ssh_user` Sudo Access:** The `ssh_user` specified in `sync-config.json`
  needs `sudo` privileges to run `chown` and `chmod` commands as root or the
  `web_user`.
- **`sudoers` Configuration:** Ensure the `ssh_user` can run necessary commands
  (like `chown`, `chmod`, potentially `wp`) as the `web_user` without a password
  prompt. This requires careful `sudoers` configuration on the remote server.
  Consult security best practices.
- **`web_user` Correctness:** Double-check the `web_user` value in
  `sync-config.json`. It must match the actual user the web server (Nginx,
  Apache, OLS) runs as (e.g., `www-data`, `nginx`, `nobody`, `lsadm`). Check
  server process lists (`ps aux | grep nginx`) or configuration files.
- **SELinux/AppArmor:** If enabled on the remote server, security modules like
  SELinux or AppArmor might be blocking file access or modifications, even if
  standard permissions seem correct. Check audit logs
  (`/var/log/audit/audit.log` or `/var/log/syslog`).

---

## WP-CLI Command Failures ⚙️

- **Symptom:** Errors during `setup-new-site`, `push-db`, `pull-db` related to
  `wp` commands.
- **WP-CLI Installation:** Is `wp-cli` installed globally and accessible in the
  `PATH` on the **remote** server? Try running `ssh <user>@<host> 'which wp'`
  and `ssh <user>@<host> 'wp --info'`.
- **Database Connection:** WP-CLI needs to connect to the database. Ensure the
  remote `.env` file has correct DB credentials and the database is running.
- **Permissions:** The user executing the `wp` command (usually done via
  `sudo -u <web_user> wp ...` by the script) needs read/write access to the
  WordPress files (`<remote_path>`) and potentially execute permissions.
- **PHP Version/Extensions:** Ensure the PHP version used by the command line
  (`php -v` on remote) matches WordPress requirements and has necessary
  extensions (e.g., `mysqli`, `curl`, `gd`).
- **Specific WP-CLI Error:** Look at the exact error message provided by WP-CLI
  for clues (e.g., "Error establishing a database connection", "Table doesn't
  exist", specific plugin/theme errors).

---

# FAQ ❓

## How do I reset a site and start over?

- Remove the site directory under `websites/`, clean up related DB entries, and
  re-run `./scripts/local/site-init.sh`.
- See [Docker Issues](#docker-issues-) and
  [Database Connection Errors](#database-connection-errors-) for cleanup tips.

## What if my DB password changes?

- Update the `.env` file for your site and the relevant config in `core/.env` or
  remote `.env`.
- Restart containers to apply changes. See
  [Database Connection Errors](#database-connection-errors-).

## How do I update Cloudflare DNS records?

- Use `./scripts/provision/cloudflare-dns.sh` with `add` or `remove` commands.
- See
  [Set Up Domain and Subdomain DNS (Cloudflare CLI)](../docs/example-workflow.md#c-set-up-domain-and-subdomain-dns-cloudflare-cli).

## How do I backup and restore my site?

- Use `./scripts/sync/backup.sh` to backup and `./scripts/sync/restore.sh` to
  restore.
- See [Set Up Backups](../docs/example-workflow.md#7-set-up-backups).

## What if my server IP changes?

- Update DNS records using Cloudflare CLI and update `config/sync-config.json`
  with the new IP.
- See [SSH Connection Issues](#ssh-connection-issues-manage-sitesh-) and
  [Remote Server Permission Errors](#remote-server-permission-errors-).

## How do I troubleshoot failed deployments?

- Check logs in `scripts/local/scripts/logs/bedrock-workflow.log` and container
  logs.
- See [Deployment & Remote Management](../docs/deployment.md) and
  [Troubleshooting Guide](#troubleshooting-guide-).

## How do I update or reinstall hcloud/Cloudflare CLI?

- Follow install instructions in [README.md](../README.md#requirements-) and
  [docs/cloudflare.md](../docs/cloudflare.md).

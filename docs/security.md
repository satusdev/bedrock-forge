# Security Best Practices 🔒

Securing your development environment, deployment process, and WordPress sites
is crucial. This document outlines key recommendations.

## Table of Contents

- [Protecting Credentials](#protecting-credentials-)
- [Secure `sudo` for `manage-site.sh`](#secure-sudo-for-manage-sitesh-)
- [SSH Hardening](#ssh-hardening-)
- [WordPress Hardening](#wordpress-hardening-)
- [Dependency Management](#dependency-management-)
- [Regular Backups](#regular-backups-)

---

## Protecting Credentials 🛡️

Sensitive information like database passwords, API keys, and SSH details should
never be committed to version control (Git).

- **`.gitignore`:** Ensure the following files/patterns are in your main
  `.gitignore` file:

  ```
  # Core DB password
  core/.env

  # Site-specific environment files (contain DB creds, salts, etc.)
  websites/*/.env
  websites/*/.env.development
  websites/*/.env.production
  websites/*/.env.staging

  # Deployment and Provisioning configuration
  scripts/sync-config.json
  scripts/.env.provision

  # Composer vendor directory
  websites/*/www/vendor/

  # Local DB dumps
  scripts/dumps/*.sql
  ```

- **`sync-config.json`:** This file contains critical SSH and database
  credentials. Protect it carefully. Consider file permissions locally if
  sharing the machine.
- **`core/.env` & `scripts/.env.provision`:** These contain the root DB password
  and Cloudflare/CyberPanel credentials respectively. Keep them secure.
- **Secrets Management (Advanced):** For enhanced security, consider using a
  dedicated secrets management tool (e.g., HashiCorp Vault, Doppler, AWS Secrets
  Manager, GCP Secret Manager) instead of storing secrets in plain text files.
  This involves modifying scripts to fetch credentials from the manager at
  runtime.

---

## Secure `sudo` for `manage-site.sh` 🔑

The `manage-site.sh` script needs to perform actions on the remote server that
typically require elevated privileges. These include:

- **Setting File Ownership:** Changing the owner of deployed files (`chown`) to
  the user the web server runs as (e.g., `www-data`, `lsadm`). This is crucial
  for WordPress to manage files (like uploads) correctly. This often requires
  running `chown` as `root`.
- **Setting File Permissions:** Adjusting file and directory permissions
  (`chmod`) for security and functionality (e.g., making directories writable by
  the web server). This often requires running `chmod` as `root`.
- **Running WP-CLI:** Executing `wp` commands (like `wp core install`,
  `wp db import/export`) as the web server user (`web_user`) to ensure commands
  run with the correct context and permissions relative to the WordPress
  installation.

Granting the `ssh_user` full, unrestricted `sudo` access is a significant
security risk. Instead, we configure `sudo` to allow the `ssh_user` to run
_only_ the specific commands needed by the script, and often only as a specific
target user (like `web_user` or `root`), without requiring a password.

- **Principle of Least Privilege:** Grant only the permissions absolutely
  necessary for the script to function.
- **Passwordless `sudo`:** The script executes commands non-interactively via
  SSH. It cannot handle password prompts, so the specific `sudo` rules must
  include the `NOPASSWD` tag.
- **Example `sudoers` Configuration:** Edit the remote server's sudoers file
  using `sudo visudo`. Add lines **specific to the commands, users, and paths
  needed**. This is an **example** and needs careful adaptation and testing for
  your specific `web_user` and paths. **Consult security documentation for your
  OS.**

  ```sudoers
  # Allow ssh_user to run chown/chmod on the web root as root
  # Adjust /usr/bin/chown and /usr/bin/chmod paths if necessary
  ssh_user ALL=(root) NOPASSWD: /usr/bin/chown -R web_user:web_user /var/www/mysite.com/*
  ssh_user ALL=(root) NOPASSWD: /usr/bin/chmod -R * /var/www/mysite.com/*

  # Allow ssh_user to run WP-CLI commands as web_user
  # Adjust /usr/local/bin/wp path if necessary
  ssh_user ALL=(web_user) NOPASSWD: /usr/local/bin/wp * --path=/var/www/mysite.com
  ```

  **Important Considerations:**

  - Replace `ssh_user`, `web_user`, and `/var/www/mysite.com` with your actual
    values.
  - Be as specific as possible with paths and commands. Avoid overly broad
    wildcards (`*`) if possible.
  - Test thoroughly after making changes. Incorrect `sudoers` syntax can lock
    you out.
  - This configuration needs to be applied for **each site's path** if they
    differ.

  **Conceptual Diagram of Restricted Sudo:**

  ```mermaid
  graph TD
      subgraph Local Machine
          A[Developer] -- Runs --> B(manage-site.sh)
      end

      subgraph Remote Server
          C(SSH Connection as 'ssh_user')
          D{sudo /etc/sudoers check}
          E[Run 'chown web_user:web_user /path/*' as root]
          F[Run 'wp command --path=/path/*' as web_user]
          G[Run other commands as 'ssh_user']
          H{Attempt 'sudo rm -rf /' as root} --> I((DENIED by sudoers))
      end

      B -- "ssh ssh_user@host 'sudo ...'" --> C
      C -- "sudo chown ..." --> D
      C -- "sudo -u web_user wp ..." --> D
      C -- "ls /path/" --> G
      C -- "sudo rm -rf /" --> D

      D -- "Rule allows chown as root? YES" --> E
      D -- "Rule allows wp as web_user? YES" --> F
      D -- "Rule allows rm as root? NO" --> H

      style Local Machine fill:#ccf,stroke:#333,stroke-width:1px
      style Remote Server fill:#eef,stroke:#333,stroke-width:1px
      style I fill:#f99,stroke:#f00,stroke-width:2px
  ```

---

## SSH Hardening 🚪

Secure the SSH access to your remote server.

- **Use SSH Keys:** Disable password authentication and rely solely on SSH key
  pairs. Edit `/etc/ssh/sshd_config` on the server:
  ```
  PasswordAuthentication no
  PubkeyAuthentication yes
  ChallengeResponseAuthentication no
  ```
  Restart the SSH service (`sudo systemctl restart sshd`).
- **Strong Key Passphrases:** Protect your private SSH keys with strong
  passphrases. Use `ssh-agent` to avoid typing the passphrase repeatedly.
- **Limit SSH Access:**
  - Use firewalls (`ufw`, `iptables`, cloud security groups) to allow SSH access
    (port 22) only from trusted IP addresses.
  - Consider changing the default SSH port (though this is security through
    obscurity). If changed, update `scripts/.env.provision` (`SSH_PORT`) and any
    manual SSH commands.
- **Restrict Root Login:** Disable direct root login via SSH. Edit
  `/etc/ssh/sshd_config`:
  ```
  PermitRootLogin no
  ```
  Log in as a regular user and use `sudo` when needed.
- **Regularly Audit Keys:** Remove `authorized_keys` for users or systems that
  no longer need access.

---

## WordPress Hardening 🛡️

Beyond the security plugins (like Wordfence) included by default:

- **Strong Admin Credentials:** Use strong, unique passwords for all WordPress
  admin accounts.
- **Limit Login Attempts:** Configure Wordfence or use other plugins to limit
  login attempts and block malicious IPs.
- **Two-Factor Authentication (2FA):** Enable 2FA for admin accounts using
  Wordfence or dedicated 2FA plugins.
- **Keep WordPress Core, Themes, and Plugins Updated:** Regularly update all
  components to patch vulnerabilities. Use `composer update` locally and deploy,
  or use WP-CLI/WordPress admin updates.
- **Disable File Editing:** Prevent editing themes/plugins from the WordPress
  admin area. Add to `wp-config.php` (managed via `.env` and
  `config/application.php` in Bedrock):
  ```php
  Config::define('DISALLOW_FILE_EDIT', true);
  ```
- **Secure `wp-config.php`:** Bedrock moves sensitive details to `.env`, which
  improves security. Ensure the web server cannot serve `.env` files directly.
  The Nginx/Apache configurations should prevent this.
- **Check File Permissions:** Ensure file permissions are not overly permissive
  on the remote server. The `manage-site.sh` script attempts to set reasonable
  permissions (directories 755, files 644), but verify them. The `uploads`
  directory needs to be writable by the web server user.
- **Disable XML-RPC if Unused:** If you don't need XML-RPC (used by some apps
  like the WordPress mobile app or Jetpack), consider disabling it via plugins
  or server rules to reduce the attack surface.
- **Use HTTPS:** Ensure SSL/TLS is correctly configured and enforced.

---

## Dependency Management 📦

- **Regular Updates:** Keep PHP, Composer, Node.js, Docker, and OS packages
  updated on both local and remote machines.
- **Composer Security:**
  - Run `composer update` regularly to get security patches for PHP
    dependencies.
  - The `roave/security-advisories` package (in `require-dev`) prevents
    installing dependencies with known vulnerabilities during `composer install`
    or `update`. Keep it updated.
  - Audit dependencies periodically. Remove unused packages.
- **Review Plugin/Theme Sources:** Use reputable sources like the official
  WordPress repository or well-maintained commercial providers. Be cautious with
  unverified code.

---

## Regular Backups 💾

Even with strong security, issues can happen. Regular backups are essential.

- **Database:** Use `manage-site.sh pull-db` to get local copies, or implement
  server-side automated MySQL dumps (e.g., using `mysqldump` and `cron`).
- **Uploads:** Use `manage-site.sh pull-uploads` (syncs from cloud to local) or
  ensure your `rclone` setup includes versioning or separate backup targets.
  Consider server-side backups of the `uploads` directory as well.
- **Code:** Your Git repository serves as a backup for your custom code. Ensure
  you commit and push changes regularly.
- **Configuration:** Back up critical configuration files like
  `sync-config.json`, `.env` files (securely!), Nginx/Apache configs, and
  `sudoers` files.
- **Test Restores:** Periodically test your backup restoration process to ensure
  it works correctly.

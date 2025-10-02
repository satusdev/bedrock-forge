# Bedrock Forge CLI Usage Guide

This guide explains how to use the **Bedrock Forge** CLI to manage Bedrock-based
WordPress projects locally with DDEV on Linux or macOS. The `local` subcommand
is interactive, prompting for missing arguments, and includes commands to
create, manage, remove, and open projects in VS Code, using HTTP for site
access.

## Prerequisites

- **Python 3.10+**: Install Python and use a virtual environment.
- **DDEV**: Install via `sudo apt install ddev` (Linux) or
  `brew install ddev/ddev/ddev` (macOS).
- **Docker**: Required for DDEV. Install via your package manager or
  [Docker’s site](https://docs.docker.com/get-docker/).
- **Git**: For version control and GitHub integration.
- **VS Code**: Optional, for `open-vscode` command. Install via
  `sudo snap install code --classic` (Linux) or
  `brew install --cask visual-studio-code` (macOS).
- **GitHub Personal Access Token**: Required for `--repo` option (needs `repo`
  scope).

## Setup

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/your-org/bedrock-forge.git
   cd bedrock-forge
   ```

2. **Set Up Virtual Environment**:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies**:

   ```bash
   pip install -r forge/requirements.txt
   ```

4. **Configure Environment**:

   - Copy example configs:
     ```bash
     cp forge/config/example.default.json forge/config/default.json
     cp forge/config/example.env.local forge/config/.env.local
     ```
   - Add `GITHUB_TOKEN` to `forge/config/.env.local`:
     ```env
     GITHUB_TOKEN=your-actual-github-token
     ```
   - Update `forge/config/default.json` with your GitHub username:
     ```json
     {
     	"admin_user": "myadmin",
     	"admin_email": "me@example.com",
     	"github_user": "your-username",
     	"hetzner_token": null,
     	"cloudflare_token": null,
     	"server_type": "cx11",
     	"region": "fsn1"
     }
     ```

5. **Install DDEV**:
   - Linux:
     ```bash
     curl -fsSL https://apt.fury.io/drud/gpg.key | sudo apt-key add -
     echo "deb https://apt.fury.io/drud/ * *" | sudo tee /etc/apt/sources.list.d/ddev.list
     sudo apt update
     sudo apt install ddev
     ```
   - macOS:
     ```bash
     brew install ddev/ddev/ddev
     ```
   - Verify: `ddev --version`, `docker --version`.

## Using the `local` Subcommand

The `local` subcommand manages local Bedrock projects with DDEV. It’s
interactive, prompting for missing arguments, and supports creating, managing,
removing, and opening projects in VS Code.

### Create a New Project

The `create-project` command sets up a Bedrock project, configures the database,
installs WordPress with secure salts, and optionally creates a GitHub
repository. It prompts for missing arguments.

```bash
python3 -m forge local create-project
```

- **What it does**:

  - Prompts for `project_name`, `admin_user`, `admin_email`, `admin_password`,
    `site_title`, `db_name`, `db_user`, `db_password`, `db_host`, and `repo`.
  - If `--repo`, prompts for `github_org`, `github_user`, and `GITHUB_TOKEN`,
    with options to save to `default.json` and `.env.local`.
  - Creates and cleans `~/Work/Wordpress/<project_name>`.
  - Configures DDEV for WordPress.
  - Installs Bedrock via Composer with retries.
  - Writes `.env` with DDEV credentials and secure salts.
  - Installs WordPress with specified admin settings.
  - Starts the DDEV project.
  - Initializes a Git repository and pushes to GitHub if `--repo`.

- **Options**:

  - `--repo`: Creates a private GitHub repository:
    ```bash
    python3 -m forge local create-project myproject --repo
    ```
  - `--github-org <org>`: Uses a GitHub organization:
    ```bash
    python3 -m forge local create-project myproject --repo --github-org my-org
    ```
  - `--admin-user <user>`: WordPress admin username (default: `myadmin` from
    `default.json` or `admin`):
    ```bash
    python3 -m forge local create-project myproject --admin-user myadmin
    ```
  - `--admin-email <email>`: WordPress admin email (default: `me@example.com`
    from `default.json` or `admin@example.com`):
    ```bash
    python3 -m forge local create-project myproject --admin-email me@example.com
    ```
  - `--admin-password <pass>`: WordPress admin password (default: `admin`):
    ```bash
    python3 -m forge local create-project myproject --admin-password securepass
    ```
  - `--site-title <title>`: WordPress site title (default: project name):
    ```bash
    python3 -m forge local create-project myproject --site-title "My Site"
    ```
  - `--db-name <name>`, `--db-user <user>`, `--db-password <pass>`,
    `--db-host <host>`: Database settings (default: `db`):
    ```bash
    python3 -m forge local create-project myproject --db-name mydb
    ```
  - `--dry-run`: Previews commands:
    ```bash
    python3 -m forge local create-project myproject --dry-run
    ```
  - `--verbose`: Shows detailed output:
    ```bash
    python3 -m forge local create-project myproject --verbose
    ```

- **Interactive Example**:

  ```bash
  python3 -m forge local create-project
  Project name [myproject]: myproject
  WordPress admin username [admin]: myadmin
  WordPress admin email [admin@example.com]: me@example.com
  WordPress admin password [admin]: securepass
  WordPress site title [myproject]: My Site
  Database name [db]: db
  Database username [db]: db
  Database password [db]: db
  Database host [db]: db
  Create GitHub repository? [y/N]: y
  GitHub organization (leave empty for personal account) []:
  GitHub username [your-username]: myuser
  GitHub Personal Access Token (with repo scope): ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  Save GITHUB_TOKEN to forge/config/.env.local? [y/N]: y
  Update github_user to myuser in forge/config/default.json? [y/N]: y
  ```

- **Accessing the Site**:
  - Open `http://myproject.ddev.site`.
  - Log in to WordPress at `http://myproject.ddev.site/wp/wp-admin`.

### Manage a DDEV Project

The `manage` command starts, stops, or checks the status of a DDEV project,
prompting for missing arguments.

```bash
python3 -m forge local manage
```

- **Prompts**:

  - `project_name`: Defaults to `myproject`.
  - `action`: Defaults to `status`.

- **Example**:
  ```bash
  python3 -m forge local manage
  Project name [myproject]: myproject
  Action (start/stop/status) [status]: start
  ```

### Remove a Project

The `remove-project` command deletes a project’s directory and DDEV
configuration.

```bash
python3 -m forge local remove-project
```

- **Prompts**:

  - `project_name`: Defaults to `myproject`.

- **Example**:
  ```bash
  python3 -m forge local remove-project
  Project name to remove [myproject]: myproject
  ```

### Open in VS Code

The `open-vscode` command opens a project in VS Code.

```bash
python3 -m forge local open-vscode
```

- **Prompts**:

  - `project_name`: Defaults to `myproject`.

- **Example**:
  ```bash
  python3 -m forge local open-vscode
  Project name to open in VS Code [myproject]: myproject
  ```

## Troubleshooting

- **ModuleNotFoundError**: Ensure `requirements.txt` includes `typer==0.12.5`,
  `hcloud==1.18.2`, `cloudflare>=4.3.1`, `paramiko==3.4.0` and run
  `pip install -r forge/requirements.txt`.
- **GitHub 401 Error**: Verify `GITHUB_TOKEN` has `repo` scope. Use interactive
  prompts to update.
- **DDEV/Docker/Git Not Found**: Install and verify: `ddev --version`,
  `docker --version`, `git --version`.
- **VS Code Not Found**: Install VS Code and ensure `code` is in PATH.
- **Composer Errors**: Run `rm -rf ~/Work/Wordpress/myproject` to start fresh.
- **Logs**: Check `forge/logs/forge.log`.

## Plugin & Monorepo-Fetcher Defaults

### Default Plugins

When you create a new project, the CLI will automatically install and activate
plugins listed in `forge/config/default.json` under the `"default_plugins"` key.
Example:

```json
"default_plugins": [
  "wp-worker",
  "woocommerce",
  "advanced-access-manager",
  "delete-all-products",
  "online-active-users",
  "woo-order-export-lite"
]
```

To customize, edit the list in `default.json`.

### Monorepo-Fetcher

The CLI supports a `"monorepo_fetcher"` config in `default.json`:

```json
"monorepo_fetcher": {
  "require": []
}
```

This section is reserved for future automation of plugin/theme fetching from
monorepos.

## Next Steps

- Test `provision` subcommands for remote deployment (Phase 3).
- Customize `default.json` for defaults.
- Secure admin credentials for production.

For advanced usage, see `forge/docs/cli-architecture.md`.

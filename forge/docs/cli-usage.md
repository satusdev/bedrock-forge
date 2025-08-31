# Bedrock Forge CLI Usage Guide

This guide explains how to use the **Bedrock Forge** CLI to manage Bedrock-based WordPress projects. It’s designed for beginners and focuses on the `local` subcommand for creating and managing local projects with DDEV on macOS or Linux. The setup is fully automated, including secure WordPress salt generation, database configuration, and robust error handling, using HTTP for site access.

## Prerequisites

- **Python 3.10+**: Ensure Python is installed. Use a virtual environment for dependency isolation.
- **DDEV**: Required for WordPress project management. Install via `sudo apt install ddev` (Linux) or `brew install ddev/ddev/ddev` (macOS).
- **Docker**: Required for DDEV. Install via your package manager or Docker’s official site.
- **Git**: For version control and GitHub integration.
- **GitHub Personal Access Token** (optional): For creating repositories, needed for `--repo` option.

## Setup

1. **Clone the Repository**:
   Clone the Bedrock Forge repository to your local machine:
   ```bash
   git clone https://github.com/your-org/bedrock-forge.git
   cd bedrock-forge
   ```

2. **Set Up Virtual Environment**:
   Activate the virtual environment to isolate dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies**:
   Install required Python packages:
   ```bash
   pip install -r forge/requirements.txt
   ```

4. **Configure Environment**:
   - Copy example configuration files:
     ```bash
     cp forge/config/example.default.json forge/config/default.json
     cp forge/config/example.env.local forge/config/.env.local
     ```
   - For GitHub repository creation, add your GitHub Personal Access Token (with `repo` scope) to `forge/config/.env.local`:
     ```env
     GITHUB_TOKEN=your-actual-github-token
     ```
   - Optionally, customize `forge/config/default.json` to override defaults:
     ```json
     {
         "admin_user": "myadmin",
         "admin_email": "me@example.com",
         "github_user": "your-username"
     }
     ```

5. **Install DDEV**:
   - On **Linux** (e.g., Ubuntu):
     ```bash
     curl -fsSL https://apt.fury.io/drud/gpg.key | sudo apt-key add -
     echo "deb https://apt.fury.io/drud/ * *" | sudo tee /etc/apt/sources.list.d/ddev.list
     sudo apt update
     sudo apt install ddev
     ```
   - On **macOS**:
     ```bash
     brew install ddev/ddev/ddev
     ```
   - Verify installation: `ddev --version`.
   - Ensure Docker is running: `docker --version`.

## Using the `local` Subcommand

The `local` subcommand manages Bedrock-based WordPress projects locally using DDEV. It automates project creation, database setup, WordPress installation with secure salts, and retries for Composer commands, using HTTP for site access.

### Create a New Project

The `create-project` command sets up a new Bedrock project with DDEV, configures the database, installs WordPress with secure salts, and optionally creates a GitHub repository.

```bash
python3 -m forge local create-project myproject
```

- **What it does**:
  - Creates and cleans a directory at `~/Work/Wordpress/myproject`.
  - Configures a DDEV WordPress project with `web` docroot.
  - Installs Bedrock via Composer (`roots/bedrock`) with retries for reliability.
  - Creates a `.env` file with DDEV’s default database credentials (`db:db:db:db`) and auto-generated secure WordPress salts.
  - Installs WordPress with customizable admin credentials and site title.
  - Starts the DDEV project.
  - Outputs the site URL (e.g., `http://myproject.ddev.site`) and admin details.

- **Options**:
  - `--repo`: Creates a private GitHub repository and initializes Git:
    ```bash
    python3 -m forge local create-project myproject --repo
    ```
  - `--github-org <org>`: Creates the repository under a GitHub organization:
    ```bash
    python3 -m forge local create-project myproject --repo --github-org my-org
    ```
  - `--admin-user <user>`: Sets the WordPress admin username (default: `admin` or `default.json`):
    ```bash
    python3 -m forge local create-project myproject --admin-user myadmin
    ```
  - `--admin-email <email>`: Sets the WordPress admin email (default: `admin@example.com` or `default.json`):
    ```bash
    python3 -m forge local create-project myproject --admin-email me@example.com
    ```
  - `--admin-password <pass>`: Sets the WordPress admin password (default: `admin`):
    ```bash
    python3 -m forge local create-project myproject --admin-password securepass
    ```
  - `--site-title <title>`: Sets the WordPress site title (default: project name):
    ```bash
    python3 -m forge local create-project myproject --site-title "My Site"
    ```
  - `--db-name <name>`: Sets the database name (default: `db`):
    ```bash
    python3 -m forge local create-project myproject --db-name mydb
    ```
  - `--db-user <user>`: Sets the database username (default: `db`):
    ```bash
    python3 -m forge local create-project myproject --db-user myuser
    ```
  - `--db-password <pass>`: Sets the database password (default: `db`):
    ```bash
    python3 -m forge local create-project myproject --db-password mypass
    ```
  - `--db-host <host>`: Sets the database host (default: `db`):
    ```bash
    python3 -m forge local create-project myproject --db-host db
    ```
  - `--dry-run`: Previews commands without executing them:
    ```bash
    python3 -m forge local create-project myproject --dry-run
    ```
  - `--verbose`: Shows detailed output for each command:
    ```bash
    python3 -m forge local create-project myproject --verbose
    ```

- **Example** (full setup):
  ```bash
  python3 -m forge local create-project myproject --admin-user myadmin --admin-email me@example.com --admin-password securepass --site-title "My Site" --repo
  ```

- **Example Output** (dry-run):
  ```
  Running in local mode (dry-run: True)
  Dry run: cd ~/Work/Wordpress/myproject && ddev config --project-type=wordpress --docroot=web --project-name=myproject --auto
  Dry run: cd ~/Work/Wordpress/myproject && ddev composer create-project roots/bedrock --no-interaction
  Dry run: Would write .env to ~/Work/Wordpress/myproject/.env
  DB_NAME=db
  DB_USER=db
  DB_PASSWORD=db
  DB_HOST=db
  WP_ENV=development
  WP_HOME=http://myproject.ddev.site
  WP_SITEURL=${WP_HOME}/wp
  AUTH_KEY=[random-salt]
  SECURE_AUTH_KEY=[random-salt]
  LOGGED_IN_KEY=[random-salt]
  NONCE_KEY=[random-salt]
  AUTH_SALT=[random-salt]
  SECURE_AUTH_SALT=[random-salt]
  LOGGED_IN_SALT=[random-salt]
  NONCE_SALT=[random-salt]
  Dry run: cd ~/Work/Wordpress/myproject && ddev wp core install --url=http://myproject.ddev.site --title='myproject' --admin_user=admin --admin_password=admin --admin_email=admin@example.com --skip-email
  Dry run: cd ~/Work/Wordpress/myproject && ddev start
  ```

- **Accessing the Site**:
  - Open `http://myproject.ddev.site` in your browser.
  - Log in to WordPress at `http://myproject.ddev.site/wp/wp-admin` with your specified admin user and password.

### Manage a DDEV Project

The `manage` command starts, stops, or checks the status of a DDEV project.

```bash
python3 -m forge local manage myproject start
```

- **Actions**:
  - `start`: Starts the DDEV project.
  - `stop`: Stops the DDEV project.
  - `status`: Displays the project’s status.

- **Options**:
  - `--dry-run`: Previews the command.
  - `--verbose`: Shows detailed output.

- **Example**:
  ```bash
  python3 -m forge local manage myproject status
  ```

## Troubleshooting

- **Command Not Found**: Ensure the virtual environment is active (`source .venv/bin/activate`).
- **DDEV/Docker/Git Not Found**: Install DDEV (`sudo apt install ddev` or `brew install ddev`), Docker, and Git. Verify with `ddev --version`, `docker --version`, `git --version`.
- **Composer Errors**: Ensure the project directory (`~/Work/Wordpress/myproject`) is clean before running `ddev composer create-project`. Run `rm -rf ~/Work/Wordpress/myproject` to start fresh if needed.
- **Database Not Found**: Verify `~/Work/Wordpress/myproject/.env` has correct credentials (`DB_NAME=db`, `DB_USER=db`, `DB_PASSWORD=db`, `DB_HOST=db`).
- **Dotenv Parsing Errors**: Ensure `.env` file salts do not contain single quotes, double quotes, or whitespace. Delete and recreate the project if needed.
- **GitHub Errors**: Ensure `GITHUB_TOKEN` in `forge/config/.env.local` is valid with `repo` scope.
- **Permission Issues**: Run `chmod +r forge/*.py forge/*/*.py`.
- **Logs**: Check `forge/logs/forge.log` for errors.
- **ModuleNotFoundError**: Verify `forge/main.py` exists (`ls forge/main.py`).

## Next Steps

- Explore other subcommands (`provision`, `sync`, etc.) as implemented.
- Customize `forge/config/default.json` for project settings (e.g., admin user).
- Update admin credentials and database settings in production for security.
- Provide feedback to improve this guide!

For advanced usage, see `forge/docs/cli-architecture.md` or contact the project maintainer.
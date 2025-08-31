<div align="center">
  <h1>Bedrock Forge 🚀</h1>
  <p>A unified Python CLI for orchestrating Bedrock-based WordPress workflows</p>
  <img src="https://img.icons8.com/fluency/96/000000/server.png" alt="Bedrock Forge logo"/>
</div>

<div align="center">

[![Build Status](https://img.shields.io/github/actions/workflow/status/your-org/bedrock-forge/lint.yml?branch=main)](https://github.com/your-org/bedrock-forge/actions)
[![PyPI version](https://img.shields.io/pypi/v/bedrock-forge.svg)](https://pypi.org/project/bedrock-forge/)
[![License](https://img.shields.io/pypi/l/bedrock-forge.svg)](https://opensource.org/licenses/MIT)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white)](https://conventionalcommits.org)
[![Release Please](https://img.shields.io/badge/release-please-blue.svg)](https://github.com/googleapis/release-please)

</div>

## Overview

The **Bedrock Forge** is a production-ready Python command-line interface
designed to streamline development and deployment for
[Bedrock](https://roots.io/bedrock/)-based WordPress projects. It consolidates
tasks such as local project setup with [DDEV](https://ddev.readthedocs.io/),
server provisioning (Hetzner, CyberPanel, Cloudflare DNS, SSL), code deployment,
database/uploads synchronization, automated backups, monitoring, and CI/CD
integration into a single entrypoint (`python -m cli`).

Built for developers and teams, the Bedrock Forge ensures consistency, reduces
errors, and saves time by replacing scattered scripts with a modular,
cross-platform tool. Whether you’re creating a local development environment,
provisioning a production server, or automating backups, this CLI provides a
robust, extensible solution for modern WordPress workflows.

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Usage Examples](#usage-examples)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Future Enhancements](#future-enhancements)
- [Getting Help](#getting-help)
- [License](#license)

## Core Features

- **Unified CLI Interface**: Run all tasks via `python -m cli` with subcommands
  (`local`, `provision`, `sync`, `deploy`, `monitor`, `ci`, `workflow`).
- **Local Development with DDEV**: Create and manage Bedrock projects locally,
  including GitHub repository setup.
- **Server Provisioning**: Automate Hetzner server creation, CyberPanel setup,
  Cloudflare DNS, SSL certificates (Certbot), SSH, FTP, and server hardening.
- **Sync and Backups**: Synchronize databases and uploads; automate backups with
  retention policies using `rclone`.
- **Code Deployment**: Deploy Bedrock code to remote servers via SSH/`rsync`.
- **Monitoring and Logging**: Integrate with Uptime Kuma and configure log
  rotation.
- **CI/CD Integration**: Connect to Jenkins and use GitHub Actions for linting,
  testing, and releases.
- **Centralized Configuration**: Manage settings in `config/default.json` with
  environment overrides (`.env.local`, `.env.production`).
- **Cross-Platform Support**: Compatible with Windows, Linux, and macOS.
- **Extensibility**: Add custom commands via `plugins/`.
- **Robust Tooling**:
  - Structured logging with `structlog`.
  - Config validation with `pydantic`.
  - Custom error handling.
  - Automated testing with `pytest`.

## Prerequisites

- **Python 3.10+**: For running the CLI.
- **DDEV**: For local WordPress/Bedrock development.
- **External Tools** (optional for specific tasks):
  - `rclone`: For backups/sync.
  - `jq`: For JSON parsing (legacy scripts).
  - `cloudflared`: For Cloudflare DNS.
  - `hcloud`: For Hetzner API.
  - `certbot`: For SSL certificates.
  - `rsync`, `ssh`, `scp`: For deployment.
- **API Keys** (store in `.env` files):
  - GitHub token (`GITHUB_TOKEN`).
  - Hetzner Cloud token (`HETZNER_TOKEN`).
  - Cloudflare API key (`CLOUDFLARE_TOKEN`).
  - Uptime Kuma API key (`KUMA_API_KEY`, optional).
  - Jenkins credentials (`JENKINS_USER`, `JENKINS_TOKEN`, optional).
- **Git**: For version control.

Install dependencies on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install python3 python3-pip git jq rclone rsync
```

For DDEV, see the
[official installation guide](https://ddev.readthedocs.io/en/stable/users/install/ddev-installation/).

## Getting Started

1. **Clone the repository**:

   ```bash
   git clone https://github.com/satusdev/bedrock-forge.git
   cd bedrock-forge
   ```

2. **Install Python dependencies**:

   ```bash
   pip install -r cli/requirements.txt
   ```

3. **Configure the CLI**:

   - Copy `config/example.default.json` to `config/default.json` and update with
     your project details (e.g., site names, SSH hosts).
   - Create environment files:
     ```bash
     cp cli/config/example.env.local cli/config/.env.local
     cp cli/config/example.env.production cli/config/.env.production
     cp cli/config/example.env.provision cli/config/.env.provision
     ```
     Update these with API tokens.

4. **Verify setup**:

   ```bash
   cd cli
   python -m cli --help
   ```

5. **Start using the CLI**: Create a local project:
   ```bash
   python -m cli local create-project myproject --repo
   ```

## Usage Examples

- **Create a local Bedrock project**:

  ```bash
  python -m cli local create-project myproject --repo
  ```

- **Manage a DDEV project**:

  ```bash
  python -m cli local manage start myproject
  ```

- **Provision a Hetzner server**:

  ```bash
  python -m cli provision hetzner-create myserver --type=cx21 --image=ubuntu-22.04
  ```

- **Set up a CyberPanel website**:

  ```bash
  python -m cli provision cyberpanel-provision example.com
  ```

- **Deploy code**:

  ```bash
  python -m cli deploy myproject production
  ```

- **Backup database/uploads**:

  ```bash
  python -m cli sync backup myproject production --retention=7
  ```

- **Sync database**:

  ```bash
  python -m cli sync db myproject production pull
  ```

- **Run full workflow**:
  ```bash
  python -m cli workflow full-project myproject production example.com
  ```

Use `--dry-run` to preview:

```bash
python -m cli sync backup myproject production --dry-run
```

See `cli/docs/cli-usage.md` for more examples.

## Project Structure

```plaintext
bedrock-forge/
├── cli/                     # CLI source code
│   ├── main.py              # CLI entrypoint
│   ├── commands/            # Subcommands (local, provision, sync, etc.)
│   ├── utils/               # Utilities (config, logging, SSH)
│   ├── config/              # Configuration files
│   │   ├── default.json     # Project config
│   │   ├── .env.local      # Local env variables
│   │   ├── .env.*          # Other env variables
│   ├── tests/               # Unit/integration tests
│   ├── docs/                # Documentation
│   ├── plugins/             # Custom command extensions
│   └── logs/                # Log files
├── scripts/                 # Legacy Bash scripts (optional)
├── LICENSE                  # MIT License
├── README.md                # Project overview
└── PLAN.md                  # Implementation plan
```

## Contributing

Contributions are welcome! Follow these steps:

1. **Fork the repository**.
2. **Create a branch**:
   ```bash
   git checkout -b feat/my-feature
   ```
3. **Make changes** and commit with
   [Conventional Commits](https://conventionalcommits.org):
   ```bash
   git commit -m "feat: add database sync command"
   ```
4. **Run tests**:
   ```bash
   pytest cli/tests/
   ```
5. **Submit a pull request**.

### Contributors

<a href="https://github.com/your-org/bedrock-forge/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=your-org/bedrock-forge" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## Future Enhancements

- [ ] Add `pytest` tests with 80%+ coverage.
- [ ] Enhance `plugins/` for custom subcommands.
- [ ] Support staging environment workflows.
- [ ] Replace `curl` with `requests` for APIs.
- [ ] Optimize SSH/`rclone` for large datasets.
- [ ] Ensure Windows compatibility without WSL.
- [ ] Add tutorials to `cli/docs/cli-usage.md`.
- [ ] Use `keyring` for secure API token storage.

Suggest features by opening an issue!

## Getting Help

Check `cli/docs/cli-usage.md` or
[open an issue](https://github.com/your-org/bedrock-forge/issues) for support.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

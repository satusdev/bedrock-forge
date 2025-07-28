# Hetzner hcloud CLI Usage & Setup

## Installation

### Linux/macOS

```sh
curl -O https://github.com/hetznercloud/cli/releases/latest/download/hcloud-linux-amd64.tar.gz
tar -xzf hcloud-linux-amd64.tar.gz
sudo mv hcloud /usr/local/bin/
hcloud version
```

Or via Homebrew (macOS/Linux):

```sh
brew install hcloud
```

### Windows

Download the latest release from
[Hetzner Cloud CLI Releases](https://github.com/hetznercloud/cli/releases).

## API Token Creation

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/projects).
2. Navigate to **Security > API Tokens**.
3. Click **Generate API Token**.
4. Copy and save the token securely.

![Hetzner Cloud API Token Screenshot](https://docs.hetzner.com/_images/api-token.png)

## hcloud Context Setup

```sh
hcloud context create my-hcloud
# Paste your API token when prompted
hcloud context use my-hcloud
```

You can list contexts with:

```sh
hcloud context list
```

## Common Usage

- List servers: `hcloud server list`
- Describe server: `hcloud server describe <name>`
- Delete server: `hcloud server delete <name>`
- List SSH keys: `hcloud ssh-key list`

## Troubleshooting

- **Invalid token:** Double-check your API token and context.
- **Context not set:** Run `hcloud context use <name>`.
- **Network issues:** Check your internet connection and firewall.
- **Permission errors:** Ensure your API token has write permissions.

See [Hetzner Cloud CLI Docs](https://github.com/hetznercloud/cli) for more.

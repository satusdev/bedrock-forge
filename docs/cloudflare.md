# Cloudflare CLI Usage & Setup

## Installation (cloudflared)

### Linux/macOS

```sh
curl -LO https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
cloudflared --version
```

Or via Homebrew (macOS/Linux):

```sh
brew install cloudflare/cloudflare/cloudflared
```

### Windows

Download the latest release from
[Cloudflare cloudflared Releases](https://github.com/cloudflare/cloudflared/releases).

## API Token Creation

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Use the **Edit DNS Zone** template or customize permissions.
4. Copy and save the token securely.

![Cloudflare API Token Screenshot](https://developers.cloudflare.com/api/images/api-token-create.png)

## Authentication

cloudflared uses your API token for authentication.  
You can set it as an environment variable:

```sh
export CLOUDFLARE_API_TOKEN=<your_token>
```

Or pass it directly to commands.

## DNS Management Example

List DNS records:

```sh
cloudflared dns list --zone <your-zone>
```

Add an A record:

```sh
cloudflared dns create --zone <your-zone> --type A --name subdomain --content <ip-address>
```

Delete a record:

```sh
cloudflared dns delete --zone <your-zone> --name subdomain
```

## Troubleshooting

- **Invalid token:** Double-check your API token and permissions.
- **Zone not found:** Ensure you have the correct zone name and permissions.
- **Network issues:** Check your internet connection and firewall.

See
[Cloudflare cloudflared Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
for more.

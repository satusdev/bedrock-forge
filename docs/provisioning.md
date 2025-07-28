...

**Cloudflare CLI:**

- Install the official Cloudflare CLI (`cloudflared`) for DNS automation and
  management.
- See [docs/cloudflare.md](./cloudflare.md) for full installation,
  authentication, and usage instructions.
- Typical install (Linux/macOS):

  ```sh
  curl -LO https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
  sudo chmod +x /usr/local/bin/cloudflared
  cloudflared --version
  ```

- Create a Cloudflare API token with DNS edit permissions
  ([screenshot](https://developers.cloudflare.com/api/images/api-token-create.png)).
- Authenticate by setting `CLOUDFLARE_API_TOKEN` as an environment variable:

  ```sh
  export CLOUDFLARE_API_TOKEN=<your_token>
  ```

- Use `cloudflared dns` commands for DNS record management (see
  [docs/cloudflare.md](./cloudflare.md) for examples).

...

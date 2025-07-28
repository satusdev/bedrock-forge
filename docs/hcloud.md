...

## Server Management with hcloud CLI

### List Servers

```sh
hcloud server list
```

### Describe a Server

```sh
hcloud server describe <server-name>
```

### Delete a Server

```sh
hcloud server delete <server-name>
```

### Power Actions

```sh
hcloud server poweron <server-name>
hcloud server poweroff <server-name>
hcloud server reboot <server-name>
```

### SSH Key Management

```sh
hcloud ssh-key list
hcloud ssh-key describe <key-name>
hcloud ssh-key delete <key-name>
```

### Resize Server

```sh
hcloud server resize <server-name> --type <new-type>
```

### Change Server Name

```sh
hcloud server update <server-name> --name <new-name>
```

### More

See [Hetzner Cloud CLI Docs](https://github.com/hetznercloud/cli) for full
command reference and advanced usage.

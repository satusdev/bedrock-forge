...

## DNS Automation Script Usage

### Add a DNS Record (A or CNAME)

```sh
./scripts/provision/cloudflare-dns.sh add --zone example.com --type A --name www --content 1.2.3.4
./scripts/provision/cloudflare-dns.sh add --zone example.com --type CNAME --name blog --content target.example.com
```

### Remove a DNS Record

```sh
./scripts/provision/cloudflare-dns.sh remove --zone example.com --type A --name www
./scripts/provision/cloudflare-dns.sh remove --zone example.com --type CNAME --name blog
```

### Interactive Mode

Just run without arguments and follow the prompts:

```sh
./scripts/provision/cloudflare-dns.sh
```

# Troubleshooting

Primary runtime troubleshooting now targets Docker + Nest API + Prisma +
Dashboard.

## Stack won’t start

```bash
cp .env.local.example .env
docker compose up -d
docker compose logs -f
```

## API not healthy

```bash
docker compose ps
curl http://localhost:8000/api/v1/health
docker compose logs -f api
```

## Database/schema drift

```bash
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:seed"
```

## Tests failing in Nest API

```bash
cd nest-api
npm test
npm run test:cov
```

## Dashboard issues

```bash
cd dashboard
npm install
npm run dev
```

## Google Drive backup/folder issues

If backup logs show `didn't find section in config file ("<remote>")` or the
folder picker cannot load folders:

```bash
docker compose exec api printenv FORGE_BACKUP_GDRIVE_REMOTE RCLONE_CONFIG
docker compose exec api sh -lc 'test -f "${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}" && echo "rclone config present" || echo "rclone config missing"'
docker compose exec api sh -lc 'rclone --config "${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}" listremotes'
curl -s http://localhost:8000/api/v1/gdrive/status
```

Expected:

- `/gdrive/status` reports `configured: true`.
- The remote in status matches `FORGE_BACKUP_GDRIVE_REMOTE` when that env var is
  set, otherwise `app_settings.gdrive_rclone_remote`.
- `listremotes` includes `<remote>:` for the resolved remote.

## Deploy helper issues

```bash
./scripts/local-docker-smoke.sh
./server-deploy --mode update
./forge-deploy update
```

## Legacy note

Python CLI troubleshooting and command history are archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)

# Deploy the backend on a VPS

This guide runs one Node API process and PostgreSQL with Docker Compose. Nginx runs on the VPS host and terminates HTTPS. The existing `docker-compose.yml` and `docker/server.Dockerfile` remain the local development setup; production uses `docker-compose.production.yml` and `docker/server.production.Dockerfile`.

## Requirements

- Docker Engine with the Compose v2 plugin
- A DNS name such as `api.example.com` pointed at the VPS
- Nginx and a TLS certificate for that name
- PostgreSQL storage and a backup destination
- A verified SMTP sender for password recovery

The production Compose file keeps PostgreSQL off published host ports and binds the API to `127.0.0.1`, where host Nginx can reach it. The API and database communicate on a private Compose network.

## Configure secrets and public URLs

Create the runtime environment file on the VPS. Do not commit it or copy it into the application image:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
```

Use separate random values for `POSTGRES_PASSWORD`, `JWT_SECRET`, and `AUTH_SECRET`. The hex database password contains no URL-reserved characters, so use the same value in `POSTGRES_PASSWORD` and the password portion of `DATABASE_URL`. Use a different value for each secret.

Set these values in `.env.production` before starting services:

- `AUTH_BASE_URL=https://api.example.com`
- `CLIENT_BASE_URL=https://app.example.com`
- `CORS_ORIGINS=https://app.example.com` (comma-separated exact origins if there is more than one)
- `DATABASE_URL` with the Compose database host `database`, database name and credentials matching `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and provider credentials where required
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only when Google sign-in is configured with its callback URL

The auth and client URLs must be the final HTTPS origins. `TRUST_PROXY=true` is required because Nginx terminates TLS before forwarding requests. Do not expose `.env.production` in logs, support bundles, or source control.

## Configure and validate Compose

Compose reads `${...}` interpolation from the shell or the file passed with `--env-file`. The `env_file` entries also inject runtime values into the containers, but do not replace the `--env-file` option for Compose interpolation.

```sh
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

The migration service waits for PostgreSQL health and exits after applying pending migrations. The API starts only when the database is healthy and the migration service exits successfully. On later releases, the same service checks/applies pending migrations before the API starts. To run the migration job separately during a controlled release:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
```

The API listens on port 4000 inside the Compose network and is bound to `127.0.0.1:${API_HOST_PORT:-4000}` on the host. PostgreSQL has no host port mapping. Keep both private; do not add public port mappings to the production Compose file.

## Configure Nginx and TLS

The template at `deploy/nginx-api.conf.template` must be included from Nginx's `http` context because it defines a `map` and a rate-limit zone. Replace `api.example.com` and certificate paths with the real hostname and certificate. Install the server blocks in the Nginx configuration, then validate and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

It redirects HTTP to HTTPS, forwards credentialed API traffic to the loopback API, preserves WebSocket upgrade headers for `/ws/...`, and allows long-lived sockets. Its 1 MiB request-body limit matches `API_BODY_LIMIT=1mb`; WebSocket payloads are capped separately by `WS_MAX_PAYLOAD_BYTES`. Nginx rate limiting is applied at the proxy to limit bursts reaching the API; adjust it only after observing real traffic and the API's own limits.

## Verify service health and inspect logs

```sh
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 database migrate server
curl --fail https://api.example.com/health
curl --fail https://api.example.com/ready
```

The image health check calls `/ready`. Also verify the real frontend can sign in with cookies, complete password recovery, and connect to a collaborative document over `wss://api.example.com/ws/...`. A plain health response does not validate browser CORS/cookie behavior or WebSocket upgrades.

## Back up and recover PostgreSQL

Schedule encrypted off-host backups and test restores before public launch. The [operations runbook](ops-runbook.md) describes the backup and disposable restore helpers, release restart order, log/health checks, and rollback constraints. For a one-off SQL dump:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml exec -T database \
  sh -c 'pg_dump --format=custom --username="$POSTGRES_USER" "$POSTGRES_DB"' > collabit-$(date -u +%Y%m%dT%H%M%SZ).dump
```

The database volume survives ordinary service restarts and `docker compose down`. **Do not use `docker compose down -v` for routine deploys or recovery**; it removes the database volume. Restore into a separate disposable database first, then follow the release rollback procedure before replacing production data.

## Current verification boundary

The production packaging files are prepared, but they still require an actual Docker image build/inspection, migration run, and proxy-backed API/cookie/WebSocket smoke test on a Docker-capable host before C14 can be marked verified. This repository's existing development Docker configuration is preserved.

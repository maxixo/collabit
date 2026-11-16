# Backend operations and recovery runbook

This runbook covers the single-process VPS backend in [deployment-vps.md](deployment-vps.md). Keep an encrypted backup off the VPS; the Compose database volume alone is not a backup. Never rehearse restores against the live `collabit` database.

## Signals and logs

The API exposes:

- `GET /health`: process-level liveness response.
- `GET /ready`: database-backed readiness response; returns 503 while draining or when PostgreSQL cannot answer.

Backend logs are JSON lines on stdout/stderr. The logger redacts common credential, email, SQL, request-body, and document-content fields and secret-like values in strings. Compose rotates each service's local logs at 10 MiB with five files retained. Logs are useful for diagnosing restarts and failing operations, but they are not durable monitoring or an alerting system.

Configure an external uptime monitor against `/health` and `/ready`, and alert on repeated 5xx responses, container restarts, and disk usage. A future log collector can ingest the container JSON stream. No error-reporting vendor or credentials are configured in this repository; choose and activate one before relying on external error alerts. Never attach document contents, cookies, auth headers, SMTP credentials, or database connection strings to reports.

```sh
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --since=15m server database migrate
curl --fail https://api.example.com/health
curl --fail https://api.example.com/ready
```

## Backup

Schedule `scripts/backup-production-db.sh` from the VPS with a destination mounted from encrypted off-host storage. The script writes a custom-format `pg_dump` and SHA-256 sidecar outside the repository, uses restrictive file permissions, and does not remove old backups. Set a retention policy on the backup destination and monitor job exit status, free space, and backup age.

```sh
sudo -u collabit /path/to/repo/scripts/backup-production-db.sh /mnt/encrypted-backups/collabit
```

Copy the dump and `.sha256` sidecar to a second protected location. Verify the checksum after transfer. Test restore after creating a fresh, disposable PostgreSQL database inside the Compose database container. Its database name must contain `restore`, `disposable`, or `test`; the restore helper only connects to localhost and refuses a non-empty target.

```sh
docker compose --env-file .env.production -f docker-compose.production.yml exec database \
  sh -ec 'createdb --username="$POSTGRES_USER" "collabit_restore_$(date -u +%Y%m%d%H%M%S)"'

RESTORE_DATABASE_URL='postgresql://collabit:REPLACE_WITH_DB_PASSWORD@localhost:5432/collabit_restore_YYYYMMDDHHMMSS' \
RESTORE_CONFIRM=restore-to-disposable-database \
  ./scripts/restore-disposable-db.sh /mnt/encrypted-backups/collabit/collabit-YYYYMMDDTHHMMSSZ.dump
```

Replace the placeholder password using a protected shell environment and use the exact database name created in the first command. Keep the restore target separate from production. After restore, inspect migrations and verify documents, members, versions, suggestions, and collaborative state through the app or database checks. Drop the disposable database only after recording the rehearsal result.

## Restart and release

Use one API replica because WebSocket rooms and the rate-limit window are process-local. Before each release:

1. Check current health, disk space, backup age, and available VPS memory.
2. Create a fresh backup and verify its checksum.
3. Deploy the reviewed backend commit and build its production image.
4. Run the one-shot migration service and confirm it exits successfully.
5. Restart the single API service and confirm `/ready` is healthy.
6. Check logs, authenticated browser requests, password recovery, and an actual collaborative `wss://` session.
7. Promote the matching Vercel deployment only after the backend is ready.

```sh
docker compose --env-file .env.production -f docker-compose.production.yml build server migrate
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps server
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Compose shuts the Node process down with SIGTERM and allows 30 seconds for graceful drain. Do not start a second API container or use cluster mode.

## Rollback and database compatibility

Frontend changes can be rolled back by promoting the previous Vercel deployment. Backend code can be rolled back only to a release that understands the schema already installed. Migrations are forward-only; this repository does not automatically reverse them. If a release fails after an additive migration, first restore a compatible backend version and verify readiness. If that version cannot read the migrated schema, stop writes and restore the pre-release backup into a separate database for a reviewed recovery. Do not run `docker compose down -v`, delete migration rows, or restore over production as an improvised rollback.

Record each rehearsal's date, code commit, backup checksum, restore target, migration status, and verification outcome in the operator's private release log.

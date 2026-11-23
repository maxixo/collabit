#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
DUMP_FILE="${1:?Usage: RESTORE_DATABASE_URL=... RESTORE_CONFIRM=restore-to-disposable-database restore-disposable-db.sh /path/to/backup.dump}"

if [[ ! -f "$ENV_FILE" || ! -f "$DUMP_FILE" || ! -f "$DUMP_FILE.sha256" ]]; then
  echo "Production env file, dump, and adjacent .sha256 file are required." >&2
  exit 1
fi
if [[ "${RESTORE_CONFIRM:-}" != "restore-to-disposable-database" ]]; then
  echo "Set RESTORE_CONFIRM=restore-to-disposable-database after creating a separate empty database." >&2
  exit 1
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL must point to the disposable database." >&2
  exit 1
fi

python3 - "$RESTORE_DATABASE_URL" <<'PY'
import sys
from urllib.parse import urlparse

parsed = urlparse(sys.argv[1])
database = parsed.path.lstrip("/").split("?", 1)[0]
if parsed.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("RESTORE_DATABASE_URL must use PostgreSQL.")
if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
    raise SystemExit("Restore is limited to localhost inside the Compose database container.")
if not any(marker in database.lower() for marker in ("restore", "disposable", "test")):
    raise SystemExit("Disposable database name must contain restore, disposable, or test.")
PY

(cd -- "$(dirname -- "$DUMP_FILE")" && sha256sum --check "$(basename -- "$DUMP_FILE").sha256")
TABLE_COUNT="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
  sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname="$1" -c "SELECT count(*) FROM pg_tables WHERE schemaname = '\''public'\''"' \
  restore "$RESTORE_DATABASE_URL" | tr -d '[:space:]')"
if [[ "$TABLE_COUNT" != "0" ]]; then
  echo "Restore target is not empty; refusing to modify it." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
  sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$1" -' \
  restore "$RESTORE_DATABASE_URL" < "$DUMP_FILE"
printf 'Restored into the disposable database only: %s\n' "$RESTORE_DATABASE_URL"

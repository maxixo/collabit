#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
DESTINATION_INPUT="${1:?Usage: backup-production-db.sh /path/to/off-host-staging-directory}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

DESTINATION="$(realpath -m -- "$DESTINATION_INPUT")"
case "$DESTINATION/" in
  "$ROOT_DIR/"*) echo "Backup destination must be outside the repository." >&2; exit 1 ;;
esac

mkdir -p -- "$DESTINATION"
chmod 700 "$DESTINATION"
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DESTINATION/collabit-$STAMP.dump"
TEMP="$DESTINATION/.collabit-$STAMP.dump.tmp"

if [[ -e "$FINAL" || -e "$TEMP" ]]; then
  echo "Backup already exists for timestamp $STAMP" >&2
  exit 1
fi

cleanup() { rm -f -- "$TEMP"; }
trap cleanup EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
  sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$TEMP"
test -s "$TEMP"
mv -- "$TEMP" "$FINAL"
(cd -- "$DESTINATION" && sha256sum "$(basename -- "$FINAL")") > "$FINAL.sha256"
chmod 600 "$FINAL" "$FINAL.sha256"
trap - EXIT
printf 'Created database backup: %s\n' "$FINAL"
printf 'Copy this file and checksum to encrypted off-host storage and verify it there.\n'

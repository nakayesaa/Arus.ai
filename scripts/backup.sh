#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"

for command in pg_dump openssl sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command" >&2
    exit 1
  fi
done

backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_name="arus-ai-${timestamp}.dump.enc"
backup_path="${backup_dir}/${backup_name}"
temporary_dump="$(mktemp "${TMPDIR:-/tmp}/arus-ai-backup.XXXXXX")"

cleanup() {
  rm -f -- "$temporary_dump"
}

trap cleanup EXIT INT TERM

mkdir -p -- "$backup_dir"

PGDATABASE="$DATABASE_URL" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$temporary_dump"

openssl enc \
  -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -iter 200000 \
  -in "$temporary_dump" \
  -out "$backup_path" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

checksum="$(sha256sum "$backup_path" | cut -d ' ' -f 1)"
printf '%s  %s\n' "$checksum" "$backup_name" >"${backup_path}.sha256"

echo "Encrypted backup created: $backup_path"
echo "Upload the encrypted file and checksum to approved private object storage."

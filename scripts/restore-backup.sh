#!/usr/bin/env bash

# This script restores one encrypted logical backup into an isolated database.
# It refuses implicit targets and requires a deliberate one-time confirmation flag.
# The encrypted checksum is verified before any decryption or database connection.
# Plaintext exists only in a restrictive temporary file removed by the exit trap.
# Post-restore reconciliation remains mandatory before the environment is trusted.

set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

if [[ "${ALLOW_ISOLATED_RESTORE:-false}" != "true" ]]; then
  echo "Set ALLOW_ISOLATED_RESTORE=true after verifying the isolated target." >&2
  exit 1
fi
if [[ -n "${DATABASE_URL:-}" && "$RESTORE_DATABASE_URL" == "$DATABASE_URL" ]]; then
  echo "Restore target must not equal the active application database." >&2
  exit 1
fi
for command in openssl pg_restore sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command unavailable: $command" >&2; exit 1; }
done

checksum_file="${BACKUP_FILE}.sha256"
[[ -f "$checksum_file" ]] || { echo "Checksum file missing: $checksum_file" >&2; exit 1; }
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$checksum_file")"
)

temporary_dump="$(mktemp "${TMPDIR:-/tmp}/arus-ai-restore.XXXXXX")"
trap 'rm -f -- "$temporary_dump"' EXIT INT TERM

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$BACKUP_FILE" \
  -out "$temporary_dump" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

PGDATABASE="$RESTORE_DATABASE_URL" pg_restore \
  --clean --if-exists --no-owner --no-privileges --exit-on-error \
  "$temporary_dump"

echo "Restore completed. Run migrations, reconciliation, tenant checks, and evidence inventory next."

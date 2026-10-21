#!/usr/bin/env bash
#
# Backup restore check (IMPLEMENTATION_PLAN.md Phase 10, RUNBOOK.md "Backups").
#
#   scripts/backup-restore-check.sh <postgres-url>
#
# Dumps the database with pg_dump (custom format) and restores the dump into a
# new scratch database on the same server. It then compares every table's row
# count and the number of applied migrations with the source, drops the
# scratch database and exits non-zero on any difference.
#
# The source is only read: pg_dump and SELECT count(*). The server must let
# this role create databases. Rows written while the check runs show up as
# differences, so run it at a quiet time or against a replica.
#
# Needs pg_dump, pg_restore, createdb, dropdb and psql of the server's major
# version, and python3 (to build the scratch URL).

set -euo pipefail

SOURCE_URL="${1:?usage: $0 <postgres-url>}"
SCRATCH_DB="qup_restore_check_$(date +%s)_$$"
WORK_DIR="$(mktemp -d)"
SCRATCH_CREATED=false

cleanup() {
  if [ "$SCRATCH_CREATED" = true ]; then
    dropdb --maintenance-db="$SOURCE_URL" --if-exists "$SCRATCH_DB" || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# The same server and credentials, another database name.
SCRATCH_URL="$(python3 -c '
import sys
from urllib.parse import urlsplit, urlunsplit
parts = urlsplit(sys.argv[1])
print(urlunsplit(parts._replace(path="/" + sys.argv[2])))
' "$SOURCE_URL" "$SCRATCH_DB")"
if [ "$SCRATCH_URL" = "$SOURCE_URL" ]; then
  echo "refusing: the scratch database would be the source" >&2
  exit 2
fi

# One line per table: "schema.table|rows", sorted. Tables of every schema the
# application owns, including drizzle's migration journal.
row_counts() {
  psql "$1" --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 <<'SQL'
SELECT format('SELECT %L || ''|'' || count(*) FROM %I.%I', table_schema || '.' || table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'drizzle')
ORDER BY table_schema, table_name
\gexec
SQL
}

started=$(date +%s)
echo "Dumping..."
pg_dump --format=custom --no-owner --no-privileges --file="$WORK_DIR/backup.dump" "$SOURCE_URL"
dump_size=$(du -h "$WORK_DIR/backup.dump" | cut -f1)

echo "Restoring into ${SCRATCH_DB}..."
createdb --maintenance-db="$SOURCE_URL" "$SCRATCH_DB"
SCRATCH_CREATED=true
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$WORK_DIR/backup.dump"

echo "Comparing..."
row_counts "$SOURCE_URL" | sort > "$WORK_DIR/source.txt"
row_counts "$SCRATCH_URL" | sort > "$WORK_DIR/restored.txt"

tables=$(wc -l < "$WORK_DIR/source.txt" | tr -d ' ')
rows=$(awk -F'|' '{ total += $2 } END { print total + 0 }' "$WORK_DIR/source.txt")
migrations=$(grep '^drizzle.__drizzle_migrations|' "$WORK_DIR/restored.txt" | cut -d'|' -f2 || true)

if ! diff -u "$WORK_DIR/source.txt" "$WORK_DIR/restored.txt"; then
  echo "FAILED: the restored database differs from the source (see above)." >&2
  exit 1
fi

echo "OK: dump ${dump_size}, ${tables} tables, ${rows} rows, ${migrations:-0} migrations restored identically in $(( $(date +%s) - started ))s."

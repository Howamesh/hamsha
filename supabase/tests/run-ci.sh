#!/usr/bin/env bash
# Same RLS attack suite as run-local.sh, against whatever Postgres the PG* env vars point to (CI service container).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$HERE/..
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres} PGPASSWORD=${PGPASSWORD:-postgres}
Q() { psql -v ON_ERROR_STOP=1 -q "$@"; }
Q -d postgres -c "drop database if exists hamsha_rls" -c "create database hamsha_rls" >/dev/null
Q -d hamsha_rls -f "$HERE/00_local_shim.sql" >/dev/null 2>&1
for m in "$ROOT"/migrations/*.sql; do Q -d hamsha_rls -f "$m"; done
Q -d hamsha_rls -f "$HERE/10_seed.sql"
Q -d hamsha_rls -f "$HERE/20_harness.sql"
OUT=$(Q -d hamsha_rls -f "$HERE/rls.sql")
echo "$OUT" | grep -E "^ (PASS|FAIL)" || true
FAILS=$(echo "$OUT" | grep -A2 "failures" | tail -1 | awk '{print $1}')
echo "failures: $FAILS"
[[ "$FAILS" == "0" ]]

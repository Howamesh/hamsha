#!/bin/zsh
# Runs the RLS attack tests on a throwaway local PostgreSQL (brew postgresql@16), no Supabase needed.
#   supabase/tests/run-local.sh            → applies 0001 + 0002 + seed, runs rls.sql, prints PASS/FAIL per line
# Every line must PASS before any migration is applied to the real project. On Supabase itself,
# run 10_seed.sql + 20_harness.sql + rls.sql in the SQL editor of a fresh project (skip 00_local_shim.sql).
set -e
export LC_ALL=C
HERE=${0:a:h}; ROOT=$HERE/..
PGBIN=/opt/homebrew/opt/postgresql@16/bin
DATA=${TMPDIR:-/tmp}/hamsha-rls-pg; PORT=54329
if ! $PGBIN/pg_isready -h 127.0.0.1 -p $PORT >/dev/null 2>&1; then
  rm -rf "$DATA"; $PGBIN/initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
  printf "\nport = $PORT\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n" >> "$DATA/postgresql.conf"
  $PGBIN/pg_ctl -D "$DATA" -l "$DATA/pg.log" start >/dev/null
  STARTED=1
fi
Q() { $PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
Q -c "drop database if exists hamsha_rls" -c "create database hamsha_rls" >/dev/null 2>&1
Q -d hamsha_rls -f $HERE/00_local_shim.sql >/dev/null 2>&1
for m in $ROOT/migrations/*.sql; do Q -d hamsha_rls -f $m; done
Q -d hamsha_rls -f $HERE/10_seed.sql
Q -d hamsha_rls -f $HERE/20_harness.sql
OUT=$(Q -d hamsha_rls -f $HERE/rls.sql)
echo "$OUT" | grep -E "^ (PASS|FAIL)|failures|^\s+[0-9]+ \|"
[[ -n "$STARTED" ]] && $PGBIN/pg_ctl -D "$DATA" stop >/dev/null
FAILS=$(echo "$OUT" | grep -A2 "failures" | tail -1 | awk '{print $1}')
[[ "$FAILS" == "0" ]]   # non-zero exit on any FAIL

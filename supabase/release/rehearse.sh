#!/bin/zsh
# Rehearses the production release on a PRIVATE Postgres shaped like production (councils 1 Nov 2026):
#   0001–0006 + the production seed + realistic old rows → release-prod.sql (one transaction) → checks → run it AGAIN
#   (must refuse and change nothing). Own port 54342 + own data dir; never touches any real database.
set -u
export LC_ALL=C LANG=C   # postgres refuses to start with a non-C locale on this Mac ("became multithreaded")
ROOT=${0:A:h:h}; PGBIN=/opt/homebrew/opt/postgresql@16/bin; PORT=54342
DIR=$(mktemp -d /tmp/hamsha-rehearse-XXXX); trap '$PGBIN/pg_ctl -D $DIR/pg stop -m fast >/dev/null 2>&1' EXIT
$PGBIN/initdb -D $DIR/pg -U postgres --auth=trust -E UTF8 >/dev/null || exit 2
$PGBIN/pg_ctl -D $DIR/pg -o "-p $PORT -k $DIR" -l $DIR/pg.log -w start >/dev/null || { echo "postgres did not start"; exit 2; }
Q() { $PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
Q -c "create database prod" && Q -d prod -f $ROOT/tests/00_local_shim.sql >/dev/null
for m in $ROOT/migrations/000[1-6]*.sql; do Q -d prod -f $m >/dev/null || { echo "FAILED base $m"; exit 1; }; done
sed -e 's/<ADMIN-EMAIL>/admin@prod.test/' -e 's/<ADMIN-NAME>/يوسف/' $ROOT/seed/production.sql | Q -d prod >/dev/null || { echo "seed failed"; exit 1; }
# realistic old data, as production has it today and soon after the manager joins
Q -d prod <<'SQL' >/dev/null || { echo "old data failed"; exit 1; }
insert into auth.users (id, email, email_confirmed_at, encrypted_password) values ('00000000-0000-0000-0000-0000000000a1', 'admin@prod.test', now(), 'x');
insert into clients (id, org_id, name, color) values ('20000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001', 'عميل قديم', '#d9b600');
insert into projects (org_id, client_id, name) values ('10000000-0000-0000-0000-00000000a001', '20000000-0000-0000-0000-00000000c001', 'مشروع قديم');
SQL
Q -d prod -At -c "select 'before: profiles='||(select count(*) from profiles)||' clients='||(select count(*) from clients)||' projects='||(select count(*) from projects)||' invitations='||(select count(*) from invitations)"
echo "--- release (1st run) ---"
Q -d prod -f $ROOT/release/release-prod.sql -At 2>&1 | tail -3; rc=$?
Q -d prod -At -c "select 'after: profiles='||(select count(*) from profiles)||' clients='||(select count(*) from clients)||' projects='||(select count(*) from projects)||' contract_block='||(select bool_and(not contract_block) from clients)||' posts table='||(to_regclass('public.posts') is not null)||' contracts table='||(to_regclass('public.contracts') is not null)"
echo "--- release (2nd run: must refuse, change nothing) ---"
Q -d prod -f $ROOT/release/release-prod.sql -At 2>&1 | grep -o "RELEASE ABORTED[^\"]*" | head -1
Q -d prod -At -c "select 'still: clients='||(select count(*) from clients)||' projects='||(select count(*) from projects)"

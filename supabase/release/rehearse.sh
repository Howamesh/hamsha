#!/bin/zsh
# Rehearses the production release on a PRIVATE Postgres shaped like production (councils 1 Nov 2026):
#   0001–0006 + the production seed + realistic old rows → release-prod.sql (one transaction) → checks → run it AGAIN
#   (must refuse and change nothing). Own port 54342 + own data dir; never touches any real database.
set -u -o pipefail
# 2 Nov (council: «a green exit alone proves nothing»): every step is ASSERTED; any miss → exit 1 with the reason
fail() { echo "REHEARSAL FAILED: $*"; exit 1; }
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
OUT1=$(Q -d prod -f $ROOT/release/release-prod.sql -At 2>&1); rc=$?
echo "$OUT1" | tail -3
(( rc == 0 )) || fail "1st run exited $rc"
echo "$OUT1" | grep -q "Hamsha release 0007–.* OK" || fail "1st run did not print its OK line"
AFTER=$(Q -d prod -At -c "select (select count(*) from clients)||'|'||(select count(*) from projects)||'|'||(to_regclass('public.posts') is not null)||'|'||(to_regclass('public.contracts') is not null)||'|'||(select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='contract_kind' and e.enumlabel='employment')||'|'||(to_regprocedure('public.contract_content_missing(jsonb)') is not null)")
echo "after: clients|projects|posts|contracts|employment|integrity = $AFTER"
[[ $AFTER == "1|1|true|true|1|true" ]] || fail "unexpected state after the 1st run: $AFTER"
echo "--- release (2nd run: must refuse, change nothing) ---"
OUT2=$(Q -d prod -f $ROOT/release/release-prod.sql -At 2>&1); rc2=$?
echo "$OUT2" | grep -o "RELEASE ABORTED[^\"]*" | head -1
(( rc2 != 0 )) || fail "2nd run did not fail"
echo "$OUT2" | grep -q "RELEASE ABORTED" || fail "2nd run failed for another reason"
STILL=$(Q -d prod -At -c "select (select count(*) from clients)||'|'||(select count(*) from projects)")
echo "still: clients|projects = $STILL"
[[ $STILL == "1|1" ]] || fail "data changed after the refused 2nd run: $STILL"
echo "--- sabotage: a broken copy of the release must roll back COMPLETELY ---"
Q -c "create database sab" && Q -d sab -f $ROOT/tests/00_local_shim.sql >/dev/null
for m in $ROOT/migrations/000[1-6]*.sql; do Q -d sab -f $m >/dev/null || fail "base $m (sabotage db)"; done
sed -e 's/<ADMIN-EMAIL>/admin@prod.test/' -e 's/<ADMIN-NAME>/يوسف/' $ROOT/seed/production.sql | Q -d sab >/dev/null || fail "seed (sabotage db)"
sed 's/^commit;$/select 1\/0; commit;/' $ROOT/release/release-prod.sql > $DIR/broken.sql
Q -d sab -f $DIR/broken.sql -At >/dev/null 2>&1 && fail "the broken release did not fail"
SAB=$(Q -d sab -At -c "select (to_regclass('public.posts') is null)||'|'||(to_regclass('public.contracts') is null)")
[[ $SAB == "true|true" ]] || fail "the broken release left partial objects: $SAB"
echo "sabotage: nothing left behind ✓"
echo "REHEARSAL OK"

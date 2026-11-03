#!/bin/zsh
# Rehearses release 2 (0015 → 0016) on a PRIVATE Postgres shaped like production after release 1:
#   0001–0014 + the production seed + old rows (incl. messages) → release-prod-2.sql → checks → run AGAIN (must refuse)
#   → a sabotaged copy must roll back completely. Own port 54343; never touches a real database.
set -u -o pipefail
fail() { echo "REHEARSAL FAILED: $*"; exit 1; }
export LC_ALL=C LANG=C
ROOT=${0:A:h:h}; PGBIN=/opt/homebrew/opt/postgresql@16/bin; PORT=54343
DIR=$(mktemp -d /tmp/hamsha-rehearse2-XXXX); trap '$PGBIN/pg_ctl -D $DIR/pg stop -m fast >/dev/null 2>&1' EXIT
$PGBIN/initdb -D $DIR/pg -U postgres --auth=trust -E UTF8 >/dev/null || exit 2
$PGBIN/pg_ctl -D $DIR/pg -o "-p $PORT -k $DIR" -l $DIR/pg.log -w start >/dev/null || { echo "postgres did not start"; exit 2; }
Q() { $PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
Q -c "create database prod" && Q -d prod -f $ROOT/tests/00_local_shim.sql >/dev/null
# production does NOT grant new tables to «authenticated» by itself (3 Nov staging lesson): drop the shim's default grants
Q -d prod -c "alter default privileges in schema public revoke all on tables from anon, authenticated" >/dev/null
for m in $ROOT/migrations/00{0[1-9],1[0-4]}*.sql; do Q -d prod -f $m >/dev/null || fail "base $m"; done
sed -e 's/<ADMIN-EMAIL>/admin@prod.test/' -e 's/<ADMIN-NAME>/يوسف/' $ROOT/seed/production.sql | Q -d prod >/dev/null || fail "seed"
Q -d prod <<'SQL' >/dev/null || fail "old data"
insert into auth.users (id, email, email_confirmed_at, encrypted_password) values ('00000000-0000-0000-0000-0000000000a1', 'admin@prod.test', now(), 'x');
insert into clients (id, org_id, name, color) values ('20000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001', 'عميل قديم', '#d9b600');
insert into messages (org_id, channel, sender_id, body) select '10000000-0000-0000-0000-00000000a001', 'team', id, 'رسالة قديمة' from profiles limit 1;
SQL
BEFORE=$(Q -d prod -At -c "select (select count(*) from clients)||'|'||(select count(*) from messages)||'|'||(select count(*) from profiles)")
echo "before: clients|messages|profiles = $BEFORE"
echo "--- release 2 (1st run) ---"
OUT1=$(Q -d prod -f $ROOT/release/release-prod-2.sql -At 2>&1); rc=$?
echo "$OUT1" | tail -2
(( rc == 0 )) || fail "1st run exited $rc"
echo "$OUT1" | grep -q "Hamsha release 0015–0016 OK" || fail "no OK line"
AFTER=$(Q -d prod -At -c "select (select count(*) from clients)||'|'||(select count(*) from messages)||'|'||(select count(*) from profiles)")
[[ $AFTER == $BEFORE ]] || fail "rows changed: $BEFORE → $AFTER"
G=$(Q -d prod -At -c "select has_table_privilege('authenticated','public.client_chat_members','select')::text||'|'||has_table_privilege('authenticated','public.chat_reads','select')::text||'|'||(select count(*) from pg_proc where proname in ('inbox_summary','mark_channel_read','chat_people','dm_open','is_png_data_url'))")
echo "grants + functions: $G"
[[ $G == "true|true|5" ]] || fail "grants/functions: $G"
echo "--- 2nd run: must refuse, change nothing ---"
OUT2=$(Q -d prod -f $ROOT/release/release-prod-2.sql -At 2>&1); rc2=$?
echo "$OUT2" | grep -o "RELEASE ABORTED[^\"]*" | head -1
(( rc2 != 0 )) && echo "$OUT2" | grep -q "RELEASE ABORTED" || fail "2nd run did not refuse"
echo "--- sabotage: an error in the middle must roll back EVERYTHING ---"
Q -d prod -c "drop database if exists prod2" -c "create database prod2" >/dev/null
Q -d prod2 -f $ROOT/tests/00_local_shim.sql >/dev/null
Q -d prod2 -c "alter default privileges in schema public revoke all on tables from anon, authenticated" >/dev/null
for m in $ROOT/migrations/00{0[1-9],1[0-4]}*.sql; do Q -d prod2 -f $m >/dev/null || fail "base2 $m"; done
sed 's/^create or replace function mark_channel_read/select 1\/0; create or replace function mark_channel_read/' $ROOT/release/release-prod-2.sql > $DIR/broken.sql
Q -d prod2 -f $DIR/broken.sql >/dev/null 2>&1 && fail "the sabotaged copy succeeded"
S=$(Q -d prod2 -At -c "select (to_regclass('public.client_chat_members') is null)::text||'|'||(to_regprocedure('public.is_png_data_url(text)') is null)::text")
[[ $S == "true|true" ]] || fail "sabotage left changes behind: $S"
echo "sabotage rolled back completely ✓"
echo "REHEARSAL OK"

#!/bin/zsh
# «تحقق قبل التسليم» — one gate for Hamsha. It CALLS the project's own checks (never copies their logic):
#   npx tsc -b · npm run lint · npm test (unit + 6 smoke via HAMSHA_URL) · npm run build · supabase/tests/run-ci.sh
#
#   verify.sh --quick     types + lint + unit + test-integrity (seconds, no browser, no database)
#   verify.sh --full      quick + SQL/RLS on a private Postgres + production build + smoke on the BUILT app
#   verify.sh --baseline [--allow-remove]  re-approve the tests: SQL names from rls.sql + checksums of every
#                         test file (refuses to drop a name without --allow-remove; say so in the delivery)
#
# Isolation: own Postgres (port 54339, own data dir) and own preview port (5198) — never 54329/hamsha_rls
# or 5173, which other chats/projects use. Evidence is tied to a fingerprint of the working tree taken
# before and after; if the code changed during the run the result is INVALID.
# Exit: 0 pass · 1 fail · 2 unavailable (missing tool / another run) · 3 pass but smoke was flaky · 4 invalid.
emulate -L zsh; setopt pipefail
export LC_ALL=C
SKILL=${0:a:h}
ROOT=$(git -C "$SKILL" rev-parse --show-toplevel) || exit 2
MODE=${1:---full}
PGBIN=/opt/homebrew/opt/postgresql@16/bin
PGPORT_V=54339; WEBPORT=5198
OUT=${TMPDIR:-/tmp}/hamsha-verify; LOCK=/tmp/hamsha-verify.lock   # fixed path: one lock for every session
FLAKY=
BASE=$SKILL/sql-baseline.txt
cd "$ROOT"

names_from_sql() {   # test labels from rls.sql (commented-out lines ignored); SQL escapes a quote as '' inside a label
  sed 's/--.*$//' supabase/tests/rls.sql | grep -oE "t\.run(_su)?\('([^']|'')*'" | sed -E "s/^t\.run(_su)?\('//; s/'\$//; s/''/'/g"; }

# every file that decides what "pass" means: the tests, the SQL harness/seed/shim and the runners
test_sums() {
  shasum supabase/tests/* tests/*.mjs | sed 's/^/# /'
  echo "# $(node -e 'const s=require("./package.json").scripts;console.log(JSON.stringify([s.lint,s.build,s["test:unit"],s["test:smoke"],s.test]))' | shasum | cut -d' ' -f1)  package.json:scripts"
}
if [[ $MODE == --baseline ]]; then
  NEWN=$(names_from_sql); [[ -n $NEWN ]] || { echo "⛔ ما لقيت ولا اختبار في rls.sql — القائمة ما تتغير"; exit 1; }
  if [[ -s $BASE ]]; then
    GONE=$(grep -v '^#' "$BASE" | grep -vxFf <(echo "$NEWN"))
    if [[ -n $GONE && ${2:-} != --allow-remove ]]; then echo "⛔ هذي الاختبارات انحذفت — ما أعتمد بدون --allow-remove (وموافقة يوسف):"; echo "$GONE"; exit 1; fi
    echo "ملفات اختبار تغيّرت/انضافت/انحذفت منذ آخر اعتماد:"; diff <(grep '^#' "$BASE") <(test_sums) | grep -E '^[<>]' | awk '{print "  " $NF}' | sort -u
  fi
  { test_sums; echo "$NEWN"; } > "$BASE"
  echo "sql-baseline.txt ← $(echo "$NEWN" | wc -l | tr -d ' ') SQL names + checksums of $(test_sums | wc -l | tr -d ' ') test files — اذكر هذا في التسليم"; exit 0
fi
[[ $MODE == --quick || $MODE == --full ]] || { echo "usage: verify.sh --quick | --full | --baseline"; exit 2; }

mkdir "$LOCK" 2>/dev/null || { echo "⛔ متعذر: فيه تشغيل ثاني للفحص شغّال ($LOCK)"; exit 2; }
rm -rf "$OUT"; mkdir -p "$OUT"
PIDS=()
cleanup() {
  for p in $PIDS; do pkill -P $p 2>/dev/null; kill $p 2>/dev/null; done
  [[ -f $OUT/pg/postmaster.pid ]] && $PGBIN/pg_ctl -D "$OUT/pg" stop -m fast >/dev/null 2>&1
  rmdir "$LOCK" 2>/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT TERM   # Ctrl-C ends the run (EXIT trap cleans up) instead of continuing without the lock
ours() {   # is this PID a descendant of this script?
  local p=$1; while [[ -n $p && $p != 1 && $p != 0 ]]; do [[ $p == $$ ]] && return 0; p=$(ps -o ppid= -p $p | tr -d ' '); done; return 1; }

fingerprint() {
  { git rev-parse HEAD; git diff HEAD --binary; git ls-files -o --exclude-standard -z | xargs -0 shasum 2>/dev/null; cat .env* 2>/dev/null; } | shasum | cut -c1-12
}
FP0=$(fingerprint)
T0=$SECONDS
typeset -a LINE FAILS WARNS
step() { echo "\n── $1"; }
ok()   { LINE+=("$1 ✅"); echo "   ✅ $1"; }
bad()  { LINE+=("$1 ❌"); FAILS+=("$1: $2"); echo "   ❌ $1 — $2"; }

# 0) tools
for t in node npm git; do command -v $t >/dev/null || { echo "⛔ متعذر: $t غير موجود"; exit 2; }; done
if [[ $MODE == --full ]]; then
  [[ -x $PGBIN/psql ]] || { echo "⛔ متعذر: postgresql@16 غير مثبت (brew)"; exit 2; }
  [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]] || { echo "⛔ متعذر: Chrome غير موجود"; exit 2; }
  for p in $PGPORT_V $WEBPORT; do lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && { echo "⛔ متعذر: المنفذ $p مشغول"; exit 2; }; done
fi

# 1) types
step "tsc"
if npx tsc -b > $OUT/tsc.log 2>&1; then ok "tsc"; else bad "tsc" "$(grep -c 'error TS' $OUT/tsc.log) أخطاء (tsc.log)"; fi

# 2) lint
step "oxlint"
npm run -s lint > $OUT/lint.log 2>&1; rc=$?
LW=$(grep -c ': warning ' $OUT/lint.log); LE=$(grep -c ': error ' $OUT/lint.log)   # count diagnostics, the summary line is not printed with -s
if (( rc == 0 )); then ok "lint (${LE:-0} أخطاء · ${LW:-0} تحذيرات)"; else bad "lint" "${LE:-?} أخطاء (lint.log)"; fi

# 3) unit
step "unit"
if npm run -s test:unit > $OUT/unit.log 2>&1; then ok "unit"; else bad "unit" "(unit.log)"; fi

# 4) integrity: no test removed or weakened just to get green
step "integrity"
INT_OK=1
if [[ ! -s $BASE ]] || ! grep -qv '^#' "$BASE"; then bad "integrity" "قائمة الاختبارات المعتمدة مفقودة أو فاضية — شغّل --baseline"; INT_OK=
else
names_from_sql > $OUT/sql-names-now.txt
grep -v '^#' "$BASE" > $OUT/sql-names-base.txt
CHANGED=$(diff <(grep '^#' "$BASE") <(test_sums) | grep -E '^[<>]' | awk '{print $NF}' | sort -u | tr '\n' ' ')
[[ -n $CHANGED ]] && { bad "integrity" "ملفات الاختبار تغيّرت عن آخر اعتماد: $CHANGED— راجع إن ما في شرط انضعف، ثم --baseline واذكره في التسليم"; INT_OK=; }
fi
MISSING=$(grep -vxFf $OUT/sql-names-now.txt $OUT/sql-names-base.txt 2>/dev/null)
NEW=$(grep -vxFf $OUT/sql-names-base.txt $OUT/sql-names-now.txt 2>/dev/null)
if [[ -n $MISSING ]]; then bad "integrity" "اختبارات SQL انحذفت أو انعلّقت في rls.sql: $(echo $MISSING | tr '\n' ';')"; INT_OK=; fi
[[ -n $NEW ]] && WARNS+=("اختبارات SQL جديدة غير مسجلة في القائمة ($(echo "$NEW" | wc -l | tr -d ' ')) — شغّل --baseline واذكرها في التسليم")
SMOKES=(${(f)"$(node -e 'const s=require("./package.json").scripts["test:smoke"];console.log((s.match(/tests\/[\w-]+\.mjs/g)||[]).join("\n"))')"})
(( ${#SMOKES} >= 6 )) || { bad "integrity" "test:smoke فيه ${#SMOKES} اختبارات بدل ٦"; INT_OK=; }
for f in tests/*.mjs; do [[ " ${SMOKES[*]} " == *" $f "* || $f == tests/unit-validate.mjs ]] || WARNS+=("$f موجود لكنه مو داخل npm test"); done
git diff HEAD -U0 -- tests supabase/tests src > $OUT/diff.txt 2>/dev/null
SUS=$(grep -nE "^\+.*(@ts-ignore|@ts-expect-error|oxlint-disable|eslint-disable|\.skip\(|process\.exit\(0\))" $OUT/diff.txt | head -5)
DEL=$(grep -nE "^-[^-].*(CHECKS|t\.run\(|errors\.length|FAILED|expect)" $OUT/diff.txt | head -5)
[[ -n $SUS ]] && WARNS+=("أسطر جديدة تتجاوز فحصاً — لازم تبرير: $(echo $SUS | tr '\n' ' ')")
[[ -n $DEL ]] && WARNS+=("أسطر شروط/اختبارات انحذفت من الاختبارات — راجعها: $(echo $DEL | tr '\n' ' ' | cut -c1-300)")
[[ -n $INT_OK ]] && ok "integrity ($(wc -l < $OUT/sql-names-base.txt | tr -d ' ') اسم SQL + ملفات الاختبار مطابقة للمعتمد)"

if [[ $MODE == --full ]]; then
  # 5) SQL/RLS — the project's own run-ci.sh against a private throwaway Postgres
  step "SQL/RLS (Postgres خاص على $PGPORT_V)"
  $PGBIN/initdb -D "$OUT/pg" -U postgres --auth=trust -E UTF8 >/dev/null
  printf "\nport = $PGPORT_V\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n" >> "$OUT/pg/postgresql.conf"
  if ! $PGBIN/pg_ctl -D "$OUT/pg" -l "$OUT/pg.log" -w start >/dev/null; then bad "SQL" "Postgres الخاص ما اشتغل (pg.log)"
  else
  PATH=$PGBIN:$PATH PGHOST=127.0.0.1 PGPORT=$PGPORT_V PGUSER=postgres PGPASSWORD=x supabase/tests/run-ci.sh > $OUT/sql.log 2>&1; rc=$?
  PASSN=$(grep -cE '^ *PASS *\|' $OUT/sql.log); FAILN=$(grep -cE '^ *FAIL *\|' $OUT/sql.log)
  grep -E '^ *PASS *\|' $OUT/sql.log | awk -F'|' '{gsub(/^ +| +$/,"",$2); print $2}' > $OUT/sql-passed.txt
  NOTRUN=$(grep -vxFf $OUT/sql-passed.txt <(grep -v '^#' "$BASE"))
  TOTAL=$(grep -cv '^#' "$BASE")
  if (( rc == 0 && FAILN == 0 )) && [[ -z $NOTRUN ]]; then ok "SQL $PASSN/$TOTAL"
  else bad "SQL" "نجح $PASSN · فشل $FAILN · خروج $rc · ناقص من القائمة: ${NOTRUN:-لا شيء} (sql.log)"; fi
  fi
  $PGBIN/pg_ctl -D "$OUT/pg" stop -m fast >/dev/null 2>&1

  # 6) production build (same settings as CI) + demo build that smoke runs against
  step "build"
  if VITE_BACKEND=mock VITE_DEMO=false npm run -s build -- --outDir $OUT/dist-prod --emptyOutDir > $OUT/build.log 2>&1 \
     && VITE_BACKEND=supabase VITE_DEMO=false VITE_SUPABASE_URL=https://placeholder.invalid VITE_SUPABASE_ANON_KEY=placeholder npx vite build --outDir $OUT/dist-supabase --emptyOutDir >> $OUT/build.log 2>&1 \
     && VITE_BACKEND=mock VITE_DEMO=true npx vite build --outDir $OUT/dist-demo --emptyOutDir >> $OUT/build.log 2>&1; then ok "build (mock + supabase)"
  else bad "build" "(build.log)"; fi

  # 7) smoke on the BUILT app (vite preview of dist-demo), every one of the 6 tests fails on a console error or exception
  step "smoke (npm test على http://localhost:$WEBPORT)"
  npx vite preview --outDir $OUT/dist-demo --port $WEBPORT --strictPort > $OUT/preview.log 2>&1 &
  PIDS+=($!)
  for i in {1..50}; do curl -s -m 1 http://localhost:$WEBPORT/ | grep -q '<title>همشة' && break; sleep 0.2; done
  LP=$(lsof -t -iTCP:$WEBPORT -sTCP:LISTEN 2>/dev/null | head -1)
  if [[ -z $LP ]] || ! ours $LP; then bad "smoke" "اللي يسمع على $WEBPORT مو خادم هذا الفحص (pid ${LP:-لا شيء})"
  elif ! curl -s -m 2 http://localhost:$WEBPORT/login | grep -q '<title>همشة'; then bad "smoke" "اللي يرد على $WEBPORT مو همشة"
  else
    FLAKY=""
    if HAMSHA_URL=http://localhost:$WEBPORT npm test > $OUT/smoke.log 2>&1; then :
    elif HAMSHA_URL=http://localhost:$WEBPORT npm test > $OUT/smoke-retry.log 2>&1; then FLAKY=1
    else FLAKY=x; fi
    LOGP=$OUT/smoke.log; [[ $FLAKY == 1 ]] && LOGP=$OUT/smoke-retry.log
    grep -oE '^PASS [a-z0-9-]+\.mjs' $LOGP | sed 's/^PASS //' | sort -u > $OUT/smoke-passed.txt
    printf '%s\n' ${SMOKES:t} | sort -u > $OUT/smoke-expected.txt
    SP=$(wc -l < $OUT/smoke-passed.txt | tr -d ' '); SMISS=$(comm -23 $OUT/smoke-expected.txt $OUT/smoke-passed.txt | tr '\n' ' ')
    if [[ $FLAKY != x && -n $SMISS ]]; then bad "smoke" "npm test رجع نجاح لكن هذي ما طبعت PASS: $SMISS(smoke.log)"
    elif [[ -z $FLAKY ]]; then ok "smoke $SP/${#SMOKES}"
    elif [[ $FLAKY == 1 ]]; then LINE+=("smoke $SP/${#SMOKES} ⚠️متذبذب"); WARNS+=("smoke فشل مرة ونجح بالإعادة (smoke.log) — اذكره في التسليم")
    else bad "smoke" "$(grep -m1 -E 'FAILED|Error|timeout' $OUT/smoke-retry.log | cut -c1-160) (smoke-retry.log)"; fi
  fi
  CE=$(grep -hoE '"errors": *\[[^]]+' $OUT/smoke*.log 2>/dev/null | head -3)
  [[ -n $CE ]] && WARNS+=("أخطاء كونسول ظهرت أثناء smoke: $CE")
fi

FP1=$(fingerprint)
SECS=$(( SECONDS - T0 ))
echo "\n════════ النتيجة ($MODE · ${SECS} ث · نسخة الكود $FP0) ════════"
echo "${(j: · :)LINE}"
for w in $WARNS; do echo "⚠️ $w"; done
for f in $FAILS; do echo "❌ $f"; done
echo "ما تحققنا منه: كل اختبارات الواجهة على البيانات الوهمية (mock) — Supabase الحقيقي (الدخول، createSupabaseRepo، Realtime، الدعوات بالبريد) غير مختبر · الجوال وSafari$([[ $MODE == --quick ]] && echo ' · وضع سريع: بدون SQL وبناء وsmoke')"
echo "السجلات: $OUT"
{ echo "$(date '+%F %T') $MODE fp=$FP0 ${SECS}s"; echo "${(j: · :)LINE}"; } > $OUT/evidence.txt
if [[ $FP0 != $FP1 ]]; then echo "⛔ غير صالح: الكود تغيّر أثناء الفحص ($FP0 → $FP1) — أعد التشغيل"; exit 4; fi
(( ${#FAILS} )) && exit 1
[[ ${FLAKY:-} == 1 ]] && exit 3
exit 0

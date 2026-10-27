-- Tiny RLS test harness: run one statement as a given user and compare with the expectation.
--   expect 'rows:N'  → statement succeeds and touches exactly N rows
--   expect 'rows>0'  → succeeds with at least one row
--   expect 'none'    → 0 rows OR an error (the row is invisible / rejected either way)
--   expect 'error'   → must raise (RLS with-check, trigger, privilege)
create schema if not exists t;
create table if not exists t.results (seq serial, label text, who text, outcome text, expect text, pass boolean);

create or replace function t.run(label text, who uuid, q text, expect text) returns void
language plpgsql as $$
declare n int; outcome text; ok boolean;
begin
  if who is null then
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute q; get diagnostics n = row_count;
    outcome := 'rows:' || n;
  exception when others then
    outcome := 'error:' || sqlstate || ' ' || left(sqlerrm, 60);
  end;
  execute 'reset role';
  ok := case
    when expect = 'rows>0' then outcome like 'rows:%' and n > 0
    when expect = 'none'   then outcome = 'rows:0' or outcome like 'error:%'
    when expect = 'error'  then outcome like 'error:%'
    else outcome = expect end;
  insert into t.results (label, who, outcome, expect, pass) values (label, coalesce(who::text, 'anon'), outcome, expect, ok);
end $$;

create or replace function t.report() returns table (status text, label text, outcome text, expect text)
language sql as $$
  select case when pass then 'PASS' else 'FAIL' end, label, outcome, expect from t.results order by seq
$$;

-- Run a statement as the database owner (stands in for Supabase Auth writing auth.users).
create or replace function t.run_su(label text, q text, expect text) returns void
language plpgsql as $$
declare n int; outcome text; ok boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    execute q; get diagnostics n = row_count;
    outcome := 'rows:' || n;
  exception when others then
    outcome := 'error:' || sqlstate || ' ' || left(sqlerrm, 60);
  end;
  ok := case
    when expect = 'rows>0' then outcome like 'rows:%' and n > 0
    when expect = 'none'   then outcome = 'rows:0' or outcome like 'error:%'
    when expect = 'error'  then outcome like 'error:%'
    else outcome = expect end;
  insert into t.results (label, who, outcome, expect, pass) values (label, 'owner', outcome, expect, ok);
end $$;

-- ============================================================================
-- Hamsha — Row Level Security (RLS)
-- Every exposed table has RLS ON. Rules:
--   admin    : everything inside their organization
--   creative : read org data they are involved in; may only mark their own parts done
--              and edit their own profile/presence; may post in team/task chat
--   client   : NEVER reads the raw tasks/task_parts tables — only the two client_* views
--              below (title, type, dates, steps as done/not-done); may post in client chat only
-- Helper functions current_org(), current_role_(), current_client() come from 0001.
-- Hardened 2026-10-27 (LAB-249, LAB-250 + review): see supabase/tests/rls.sql for the proof.
-- ============================================================================

alter table organizations enable row level security;
alter table profiles      enable row level security;
alter table user_settings enable row level security;
alter table clients       enable row level security;
alter table projects      enable row level security;
alter table tasks         enable row level security;
alter table task_parts    enable row level security;
alter table attachments   enable row level security;
alter table messages      enable row level security;
alter table audit_events  enable row level security;

-- ---------- table grants (explicit since Supabase stopped granting new tables automatically:
-- changelog 2026-04-28, enforced on existing projects 2026-10-30). anon gets nothing; RLS below decides rows. ----------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on organizations, profiles, user_settings, clients, projects, tasks, task_parts, attachments, messages to authenticated;
grant select on audit_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- helpers are for policies only: no anonymous / RPC access ----------
revoke execute on function current_org(), current_role_(), current_client(), can_read_task(uuid) from public, anon;
grant  execute on function current_org(), current_role_(), current_client(), can_read_task(uuid) to authenticated;

create or replace function is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_() in ('admin', 'creative')
$$;
revoke execute on function is_team() from public, anon;
grant  execute on function is_team() to authenticated;

-- ---------- organizations ----------
create policy org_read on organizations for select
  using (id = current_org());

-- ---------- profiles ----------
-- team sees the whole org; a client sees only admins (their contacts) and users of their own client
create policy profiles_read on profiles for select
  using (
    org_id = current_org()
    and (
      is_team()
      or role = 'admin'
      or client_id = current_client()
    )
  );
create policy profiles_self_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and org_id = current_org() and role = current_role_() and client_id is not distinct from current_client());
-- WITH CHECK must repeat the admin condition: permissive policies are OR-ed, so a check that only
-- tests org_id would let any user pass their own row through it (privilege escalation).
create policy profiles_admin_update on profiles for update
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
create policy profiles_admin_delete on profiles for delete
  using (org_id = current_org() and current_role_() = 'admin' and id <> auth.uid());
-- inserts happen through the invite function (security definer), not directly

-- identity fields never change from the client side (email must stay equal to auth.users)
create or replace function profiles_identity_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.email is distinct from old.email then
    raise exception 'profile identity cannot change';
  end if;
  if current_role_() <> 'admin' and (new.role is distinct from old.role or new.client_id is distinct from old.client_id) then
    raise exception 'only admins change roles';
  end if;
  return new;
end $$;
create trigger profiles_identity_guard before update on profiles
  for each row execute function profiles_identity_guard();

-- ---------- user_settings (private) ----------
create policy settings_self on user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- clients ----------
-- admin: all · creative: only clients they have a task with · client: own row
create policy clients_read on clients for select
  using (
    org_id = current_org()
    and (
      current_role_() = 'admin'
      or (current_role_() = 'creative' and exists (select 1 from tasks t where t.client_id = clients.id and can_read_task(t.id)))
      or id = current_client()
    )
  );
create policy clients_admin_write on clients for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

-- ---------- projects ----------
create policy projects_read on projects for select
  using (
    org_id = current_org()
    and (
      current_role_() = 'admin'
      or (current_role_() = 'creative' and exists (select 1 from tasks t where t.project_id = projects.id and can_read_task(t.id)))
      or client_id = current_client()
    )
  );
create policy projects_admin_write on projects for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

-- ---------- tasks (team only — clients use the client_tasks view) ----------
create policy tasks_read on tasks for select
  using (is_team() and can_read_task(id));
create policy tasks_admin_write on tasks for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
-- creatives may request approval only (draft -> pending) on tasks they are involved in; fields enforced by trigger below
create policy tasks_creative_update on tasks for update
  using (org_id = current_org() and current_role_() = 'creative' and can_read_task(id))
  with check (org_id = current_org() and current_role_() = 'creative' and can_read_task(id));

-- Allow-list (not a deny-list): a creative may change nothing but `approval`; version/updated_at are set by tasks_touch.
create or replace function tasks_creative_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() = 'creative' then
    if (to_jsonb(new) - array['approval', 'version', 'updated_at'])
       is distinct from (to_jsonb(old) - array['approval', 'version', 'updated_at']) then
      raise exception 'creatives cannot change task fields';
    end if;
    if not (old.approval = 'draft' and new.approval = 'pending') and new.approval is distinct from old.approval then
      raise exception 'creatives can only send a task for approval';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_creative_guard before update on tasks
  for each row execute function tasks_creative_guard();

-- ---------- task_parts (team only — clients use the client_task_parts view) ----------
create policy parts_read on task_parts for select
  using (is_team() and can_read_task(task_id));
create policy parts_admin_write on task_parts for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
create policy parts_creative_update on task_parts for update
  using (org_id = current_org() and current_role_() = 'creative' and assignee_id = auth.uid())
  with check (org_id = current_org() and current_role_() = 'creative' and assignee_id = auth.uid());
-- (task_parts_guard trigger in 0001 limits creatives to the `done` flag)

-- ---------- client views: the ONLY way a client reads tasks ----------
-- Owner-rights views (no security_invoker): they bypass the table RLS on purpose and carry
-- their own filter, exposing exactly the fields of the client task summary (design S12) —
-- no people, hours, description, reference or hand-off times.
create view client_tasks with (security_invoker = false) as
  select id, client_id, project_id, title, type, start_date, end_date, approval, version, updated_at
  from tasks
  where current_role_() = 'client' and client_id = current_client();

create view client_task_parts with (security_invoker = false) as
  select p.id, p.task_id, p.label, p.done, p.position
  from task_parts p
  join tasks t on t.id = p.task_id
  where current_role_() = 'client' and t.client_id = current_client();

revoke all on client_tasks, client_task_parts from public, anon;
grant select on client_tasks, client_task_parts to authenticated;

-- ---------- attachments (team only in phase 1; client deliverables come with their own view later) ----------
create policy attachments_read on attachments for select
  using (is_team() and can_read_task(task_id));
create policy attachments_team_insert on attachments for insert
  with check (org_id = current_org() and is_team() and created_by = auth.uid()
              and can_read_task(task_id));
create policy attachments_delete on attachments for delete
  using (org_id = current_org() and (current_role_() = 'admin' or created_by = auth.uid()));

-- ---------- messages ----------
-- channel access: 'team' (admin+creative) · 'client:<id>' (admin + that client's users)
--                 · 'task:<id>' (admin + creatives involved in the task — never clients)
create or replace function can_access_channel(ch text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r user_role := current_role_();
begin
  if ch = 'team' then return r in ('admin', 'creative'); end if;
  if ch like 'client:%' then
    return r = 'admin' or (r = 'client' and current_client()::text = substring(ch from 8));
  end if;
  if ch like 'task:%' then
    return r in ('admin', 'creative') and can_read_task(substring(ch from 6)::uuid);
  end if;
  return false;
end $$;
revoke execute on function can_access_channel(text) from public, anon;
grant  execute on function can_access_channel(text) to authenticated;

create policy messages_read on messages for select
  using (org_id = current_org() and can_access_channel(channel));
create policy messages_insert on messages for insert
  with check (org_id = current_org() and sender_id = auth.uid() and can_access_channel(channel));
create policy messages_delete on messages for delete
  using (org_id = current_org() and (sender_id = auth.uid() or current_role_() = 'admin'));

-- ---------- audit ----------
create policy audit_admin_read on audit_events for select
  using (org_id = current_org() and current_role_() = 'admin');

-- ---------- realtime ----------
-- Realtime respects RLS for postgres_changes; publish the tables the app subscribes to.
-- Clients get no task/part events (they cannot read the tables): the client repo refetches the
-- client_* views on open and on an interval instead.
alter publication supabase_realtime add table messages, tasks, task_parts, profiles, clients, projects;
-- user_settings is private and never published.

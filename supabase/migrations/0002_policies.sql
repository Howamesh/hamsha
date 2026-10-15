-- ============================================================================
-- Hamsha — Row Level Security (RLS)
-- Every exposed table has RLS ON. Rules:
--   admin    : everything inside their organization
--   creative : read org data they are involved in; may only mark their own parts done
--              and edit their own profile/presence; may post in team/task chat
--   client   : read-only on their own client calendar; may post in client chat
-- Helper functions current_org(), current_role_(), current_client() come from 0001.
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

-- ---------- organizations ----------
create policy org_read on organizations for select
  using (id = current_org());

-- ---------- profiles ----------
-- team sees the whole org; a client sees only admins (their contacts) and users of their own client
create policy profiles_read on profiles for select
  using (
    org_id = current_org()
    and (
      current_role_() in ('admin', 'creative')
      or role = 'admin'
      or client_id = current_client()
    )
  );
create policy profiles_self_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and org_id = current_org() and role = current_role_() and client_id is not distinct from current_client());

-- ---------- user_settings (private) ----------
create policy settings_self on user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy profiles_admin_update on profiles for update
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org());
create policy profiles_admin_delete on profiles for delete
  using (org_id = current_org() and current_role_() = 'admin' and id <> auth.uid());
-- inserts happen through the invite function (security definer), not directly

-- ---------- clients ----------
create policy clients_read on clients for select
  using (
    org_id = current_org()
    and (current_role_() in ('admin', 'creative') or id = current_client())
  );
create policy clients_admin_write on clients for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

-- ---------- projects ----------
create policy projects_read on projects for select
  using (
    org_id = current_org()
    and (current_role_() in ('admin', 'creative') or client_id = current_client())
  );
create policy projects_admin_write on projects for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

-- ---------- tasks ----------
create policy tasks_read on tasks for select
  using (can_read_task(id));
create policy tasks_admin_write on tasks for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
-- creatives may request approval only (draft -> pending) on tasks they can read; enforced by trigger below
create policy tasks_creative_update on tasks for update
  using (org_id = current_org() and current_role_() = 'creative')
  with check (org_id = current_org() and current_role_() = 'creative');

create or replace function tasks_creative_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() = 'creative' then
    if new.title       is distinct from old.title
    or new.type        is distinct from old.type
    or new.start_date  is distinct from old.start_date
    or new.end_date    is distinct from old.end_date
    or new.owner_id    is distinct from old.owner_id
    or new.project_id  is distinct from old.project_id
    or new.client_id   is distinct from old.client_id
    or new.org_id      is distinct from old.org_id
    or new.description is distinct from old.description
    or new.reference   is distinct from old.reference
    or new.milestone   is distinct from old.milestone then
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

-- ---------- task_parts ----------
create policy parts_read on task_parts for select
  using (can_read_task(task_id));
create policy parts_admin_write on task_parts for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
create policy parts_creative_update on task_parts for update
  using (org_id = current_org() and current_role_() = 'creative' and assignee_id = auth.uid())
  with check (org_id = current_org() and current_role_() = 'creative' and assignee_id = auth.uid());
-- (task_parts_guard trigger in 0001 limits creatives to the `done` flag)

-- ---------- attachments ----------
create policy attachments_read on attachments for select
  using (can_read_task(task_id));
create policy attachments_team_insert on attachments for insert
  with check (org_id = current_org() and current_role_() in ('admin', 'creative') and created_by = auth.uid()
              and can_read_task(task_id));
create policy attachments_delete on attachments for delete
  using (org_id = current_org() and (current_role_() = 'admin' or created_by = auth.uid()));

-- ---------- messages ----------
-- channel access: 'team' (admin+creative) · 'client:<id>' (admin + that client's users) · 'task:<id>' (anyone who can read the task)
create or replace function can_access_channel(ch text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r user_role := current_role_();
begin
  if ch = 'team' then return r in ('admin', 'creative'); end if;
  if ch like 'client:%' then
    return r = 'admin' or (r = 'client' and current_client()::text = substring(ch from 8));
  end if;
  if ch like 'task:%' then
    return can_read_task(substring(ch from 6)::uuid);
  end if;
  return false;
end $$;

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
alter publication supabase_realtime add table messages, tasks, task_parts, profiles, clients, projects;
-- user_settings is private and never published.

-- ============================================================================
-- Hamsha (همشة) — schema v1
-- Postgres / Supabase. Every table carries org_id; access is enforced by RLS
-- (see 0002_policies.sql). Progress is never stored — it is derived from parts.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type user_role       as enum ('admin', 'creative', 'client');
create type task_type       as enum ('reel', 'static', 'carousel', 'logo', 'ui', 'call');
create type approval_status as enum ('draft', 'pending', 'approved');
create type contract_status as enum ('draft', 'sent', 'signed');
create type presence_state  as enum ('live', 'away');

-- ---------- organizations ----------
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------- profiles (1:1 with auth.users) ----------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       user_role not null default 'creative',
  name       text not null,
  email      text not null,
  title      text,                      -- job title shown under a creative's name
  color      text not null default '#4E9BFA',
  client_id  uuid,                      -- for role = 'client' (FK added below)
  presence   presence_state not null default 'away',
  last_seen  timestamptz,
  created_at timestamptz not null default now()
);
create index on profiles (org_id);

-- ---------- private per-user settings (only the user can read/write) ----------
create table user_settings (
  user_id    uuid primary key references profiles(id) on delete cascade,
  city       text not null default 'riyadh',
  wh_start   smallint not null default 9,
  wh_end     smallint not null default 17,
  notes      text not null default '',
  theme      text not null default 'light',
  lang       text not null default 'ar',
  week_start text not null default 'monday'
);

-- ---------- clients (each client = one calendar) ----------
create table clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  color      text not null default '#D9B600',
  logo_path  text,                      -- storage path or URL
  owner_id   uuid references profiles(id) on delete set null,   -- producer in charge
  start_date date not null default current_date,
  end_date   date not null default current_date + 60,
  contract   contract_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index on clients (org_id);
alter table profiles add constraint profiles_client_fk
  foreign key (client_id) references clients(id) on delete set null;

-- ---------- projects ----------
create table projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  lead_id    uuid references profiles(id) on delete set null,
  color      text not null default '#9B7BF2',
  created_at timestamptz not null default now()
);
create index on projects (client_id);

-- ---------- tasks ----------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  type        task_type not null default 'static',
  start_date  date not null,
  end_date    date not null,            -- client delivery; creative deadline = end_date - 1
  owner_id    uuid references profiles(id) on delete set null,
  description text,
  reference   text,
  milestone   text,
  approval    approval_status not null default 'draft',
  version     integer not null default 1,   -- optimistic concurrency
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on tasks (client_id, start_date, end_date);
create index on tasks (owner_id);

-- ---------- task parts (hand-off steps) ----------
create table task_parts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  label       text not null,
  assignee_id uuid references profiles(id) on delete set null,
  hours       numeric(5,1) not null default 4,
  day         date not null,
  hand_off    time,                   -- optional hand-off time within the day
  done        boolean not null default false,
  done_at     timestamptz,
  position    integer not null default 0
);
create index on task_parts (task_id);
create index on task_parts (assignee_id, done);

-- ---------- attachments (phase 2, table exists from day 1) ----------
create table attachments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  name        text not null,
  storage_path text,
  url         text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- messages ----------
-- channel: 'team' | 'client:<client uuid>' | 'task:<task uuid>'
create table messages (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  channel    text not null,
  sender_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on messages (org_id, channel, created_at);

-- ---------- audit log (who changed what) ----------
create table audit_events (
  id         bigserial primary key,
  org_id     uuid not null,
  actor_id   uuid,
  table_name text not null,
  row_id     uuid,
  action     text not null,             -- insert | update | delete
  diff       jsonb,
  created_at timestamptz not null default now()
);
create index on audit_events (org_id, created_at desc);

-- ---------- helpers ----------
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function current_role_() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_client() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from profiles where id = auth.uid()
$$;

-- updated_at + version bump on tasks
create or replace function tasks_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
create trigger tasks_touch before update on tasks
  for each row execute function tasks_touch();

-- Creatives may update only part completion on their own parts (dates are locked in the DB)
create or replace function task_parts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.task_id is distinct from old.task_id or new.org_id is distinct from old.org_id then
    raise exception 'part identity cannot change';
  end if;
  if current_role_() = 'creative' then
    if old.assignee_id is distinct from auth.uid() then
      raise exception 'not your part';
    end if;
    if new.label       is distinct from old.label
    or new.assignee_id is distinct from old.assignee_id
    or new.hours       is distinct from old.hours
    or new.day         is distinct from old.day
    or new.hand_off    is distinct from old.hand_off
    or new.position    is distinct from old.position then
      raise exception 'creatives can only mark parts done';
    end if;
  end if;
  if new.done and not old.done then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
create trigger task_parts_guard before update on task_parts
  for each row execute function task_parts_guard();

-- Referential consistency across the hierarchy (org ↔ client ↔ project ↔ task ↔ part)
create or replace function tasks_consistency() returns trigger
language plpgsql as $$
declare p record; c record;
begin
  select org_id, client_id into p from projects where id = new.project_id;
  select org_id into c from clients where id = new.client_id;
  if p is null or c is null then raise exception 'unknown project or client'; end if;
  if p.client_id <> new.client_id then raise exception 'project belongs to another client'; end if;
  if p.org_id <> new.org_id or c.org_id <> new.org_id then raise exception 'organization mismatch'; end if;
  if new.owner_id is not null and not exists (select 1 from profiles where id = new.owner_id and org_id = new.org_id) then
    raise exception 'owner outside organization';
  end if;
  return new;
end $$;
create trigger tasks_consistency before insert or update on tasks
  for each row execute function tasks_consistency();

create or replace function projects_consistency() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  return new;
end $$;
create trigger projects_consistency before insert or update on projects
  for each row execute function projects_consistency();

create or replace function task_parts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select org_id, start_date, end_date into t from tasks where id = new.task_id;
  if t is null then raise exception 'unknown task'; end if;
  if t.org_id <> new.org_id then raise exception 'organization mismatch'; end if;
  if (tg_op = 'INSERT' or new.day is distinct from old.day)
     and (new.day < t.start_date or new.day > t.end_date) then
    raise exception 'part day outside task range';
  end if;
  if new.assignee_id is not null and not exists (select 1 from profiles where id = new.assignee_id and org_id = new.org_id) then
    raise exception 'assignee outside organization';
  end if;
  return new;
end $$;
create trigger task_parts_consistency before insert or update on task_parts
  for each row execute function task_parts_consistency();

-- When a task's dates change, keep its parts inside the new range (mirrors the app)
create or replace function tasks_clamp_parts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    update task_parts set day = greatest(new.start_date, least(new.end_date, day))
      where task_id = new.id and (day < new.start_date or day > new.end_date);
  end if;
  return new;
end $$;
create trigger tasks_clamp_parts after update on tasks
  for each row execute function tasks_clamp_parts();

-- Task visibility in ONE security-definer helper (used by every policy → no RLS recursion)
create or replace function can_read_task(tid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare t record; r user_role := current_role_();
begin
  select org_id, client_id, owner_id into t from tasks where id = tid;
  if t is null or t.org_id is distinct from current_org() then return false; end if;
  if r = 'admin' then return true; end if;
  if r = 'client' then return t.client_id = current_client(); end if;
  if r = 'creative' then
    return t.owner_id = auth.uid()
        or exists (select 1 from task_parts p where p.task_id = tid and p.assignee_id = auth.uid());
  end if;
  return false;
end $$;

-- generic audit trigger
create or replace function audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (org_id, actor_id, table_name, row_id, action, diff)
  values (
    coalesce(new.org_id, old.org_id), auth.uid(), tg_table_name,
    coalesce(new.id, old.id), lower(tg_op),
    case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
create trigger tasks_audit      after insert or update or delete on tasks      for each row execute function audit();
create trigger task_parts_audit after insert or update or delete on task_parts for each row execute function audit();
create trigger clients_audit    after insert or update or delete on clients    for each row execute function audit();

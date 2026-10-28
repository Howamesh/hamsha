-- ============================================================================
-- 0007 — «السوشل» phase 1 (2026-10-28, council 20261028-032546-200e, Yousef's pick ٤):
-- a social post goes  draft → sent (to the client) → approved | changes → published.
--   • Every upload is a FROZEN version (image + caption). The client's decision is bound to ONE version
--     number; a new version puts the post back to `draft` and needs to be sent again (approval never carries over).
--   • The client NEVER reads the raw tables: two owner-rights views (client_posts, client_post_versions)
--     expose exactly what the approval screen shows — no people, no internal notes — and the ONLY write a
--     client has is decide_post() (security definer, checks everything itself).
--   • Team (admin / creative) read posts they are involved in; creatives may create posts + versions for
--     clients they have a task with; status transitions are admin-only and enforced by posts_status_guard.
--   • Media lives in the private bucket `post-media` under <org>/<client>/<post>/<n>.<ext> (applied on
--     Supabase only — the plain-Postgres CI has no storage schema).
-- Phase 1 publishes MANUALLY: the admin pastes the live link («تم النشر»). Auto-publish, video, per-second
-- notes, a backup approver and the 5-hour reminder are deliberately NOT here.
-- ============================================================================

create type post_platform as enum ('instagram', 'tiktok', 'snapchat', 'linkedin', 'x');
create type post_format   as enum ('square', 'portrait', 'story');          -- 1:1 · 4:5 · 9:16
create type post_status   as enum ('draft', 'sent', 'approved', 'changes', 'published');
create type post_decision as enum ('approved', 'changes');

create table posts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  task_id         uuid references tasks(id) on delete set null,
  title           text not null check (length(title) between 1 and 200),
  platform        post_platform not null default 'instagram',
  format          post_format not null default 'square',
  status          post_status not null default 'draft',
  current_version integer not null default 0,
  sent_at         timestamptz,
  published_url   text check (published_url is null or published_url ~ '^https?://'),
  published_at    timestamptz,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on posts (client_id, status);
create index on posts (org_id, updated_at desc);

create table post_versions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  post_id       uuid not null references posts(id) on delete cascade,
  number        integer not null,
  image_path    text not null check (length(image_path) between 1 and 500),
  caption       text not null default '' check (length(caption) <= 4000),
  note          text check (note is null or length(note) <= 2000),          -- team → client, shown with the version
  decision      post_decision,
  decision_note text check (decision_note is null or length(decision_note) <= 4000),
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (post_id, number)
);
create index on post_versions (post_id, number desc);

-- ---------- visibility helper (security definer → no RLS recursion) ----------
create or replace function can_read_post(pid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p record; r user_role := current_role_();
begin
  select org_id, client_id, task_id, created_by into p from posts where id = pid;
  if p is null or p.org_id is distinct from current_org() then return false; end if;
  if r = 'admin' then return true; end if;
  if r = 'client' then return p.client_id = current_client(); end if;
  if r = 'creative' then
    return p.created_by = auth.uid()
        or (p.task_id is not null and can_read_task(p.task_id))
        or exists (select 1 from tasks t where t.client_id = p.client_id and can_read_task(t.id));
  end if;
  return false;
end $$;
revoke execute on function can_read_post(uuid) from public, anon;
grant  execute on function can_read_post(uuid) to authenticated;

-- a creative may work on a client they have a task with (owner or assignee)
create or replace function works_with_client(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_() = 'admin'
      or (current_role_() = 'creative' and exists (select 1 from tasks t where t.client_id = cid and can_read_task(t.id)))
$$;
revoke execute on function works_with_client(uuid) from public, anon;
grant  execute on function works_with_client(uuid) to authenticated;

-- ---------- consistency + the state machine ----------
create or replace function posts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and client_id = new.client_id and org_id = new.org_id) then
    raise exception 'task belongs to another client';
  end if;
  if tg_op = 'INSERT' then
    -- a post is born as an empty draft; versions and status come later, never from the insert
    new.status := 'draft'; new.current_version := 0; new.sent_at := null; new.published_url := null; new.published_at := null;
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger posts_consistency before insert or update on posts
  for each row execute function posts_consistency();

-- Allowed transitions (admin only; everything else raises). Internal trigger writes carry hamsha.sys = '1'.
create or replace function posts_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare sys boolean := coalesce(current_setting('hamsha.sys', true), '') = '1';
begin
  new.updated_at := now();
  if sys then return new; end if;
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.client_id is distinct from old.client_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'post identity cannot change';
  end if;
  if new.current_version is distinct from old.current_version then
    raise exception 'current_version is set by uploading a version';
  end if;
  if current_role_() <> 'admin' then
    raise exception 'only admins change posts';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'sent' then
      if old.current_version = 0 then raise exception 'upload a version before sending'; end if;
      new.sent_at := now();
    elsif old.status = 'sent' and new.status = 'draft' then
      new.sent_at := null;                                   -- withdrawn before the client decided
    elsif old.status = 'approved' and new.status = 'published' then
      if new.published_url is null then raise exception 'published_url is required'; end if;
      new.published_at := now();
    else
      raise exception 'transition % → % is not allowed', old.status, new.status;
    end if;
  elsif new.published_url is distinct from old.published_url and old.status <> 'published' then
    raise exception 'published_url only on a published post';
  end if;
  if new.sent_at is distinct from old.sent_at and new.status = old.status then raise exception 'sent_at is derived'; end if;
  if new.published_at is distinct from old.published_at and new.status = old.status then raise exception 'published_at is derived'; end if;
  return new;
end $$;
create trigger posts_status_guard before update on posts
  for each row execute function posts_status_guard();

-- A new version: number is assigned here, the post returns to draft (the old approval never carries over).
create or replace function post_versions_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select org_id, status, current_version into p from posts where id = new.post_id;
  if p is null then raise exception 'unknown post'; end if;
  if p.org_id <> new.org_id then raise exception 'organization mismatch'; end if;
  if p.status = 'published' then raise exception 'a published post cannot change'; end if;
  new.number := p.current_version + 1;
  new.created_by := auth.uid();
  new.decision := null; new.decision_note := null; new.decided_by := null; new.decided_at := null;
  perform set_config('hamsha.sys', '1', true);
  update posts set current_version = new.number, status = 'draft', sent_at = null where id = new.post_id;
  perform set_config('hamsha.sys', '', true);
  return new;
end $$;
create trigger post_versions_insert before insert on post_versions
  for each row execute function post_versions_insert();

-- Versions are frozen: nothing changes after the insert except through decide_post().
create or replace function post_versions_frozen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('hamsha.sys', true), '') = '1' then return new; end if;
  raise exception 'versions are frozen';
end $$;
create trigger post_versions_frozen before update on post_versions
  for each row execute function post_versions_frozen();

-- ---------- the client's ONLY write ----------
create or replace function decide_post(p_version uuid, p_decision post_decision, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; p record;
begin
  if current_role_() <> 'client' then raise exception 'only clients decide'; end if;
  select id, post_id, number, decision into v from post_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select id, org_id, client_id, status, current_version into p from posts where id = v.post_id;
  if p.org_id <> current_org() or p.client_id <> current_client() then raise exception 'not your post'; end if;
  if p.status <> 'sent' then raise exception 'post is not awaiting your decision'; end if;
  if v.number <> p.current_version then raise exception 'only the current version can be decided'; end if;
  if v.decision is not null then raise exception 'already decided'; end if;
  if p_decision = 'changes' and length(trim(coalesce(p_note, ''))) = 0 then raise exception 'say what to change'; end if;
  perform set_config('hamsha.sys', '1', true);
  update post_versions set decision = p_decision, decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now() where id = v.id;
  update posts set status = p_decision::text::post_status where id = p.id;
  perform set_config('hamsha.sys', '', true);
end $$;
revoke execute on function decide_post(uuid, post_decision, text) from public, anon;
grant  execute on function decide_post(uuid, post_decision, text) to authenticated;

-- ---------- RLS ----------
alter table posts         enable row level security;
alter table post_versions enable row level security;
revoke all on posts, post_versions from anon;
grant select, insert, update, delete on posts, post_versions to authenticated;

create policy posts_read on posts for select
  using (is_team() and can_read_post(id));
create policy posts_admin_write on posts for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
create policy posts_creative_insert on posts for insert
  with check (org_id = current_org() and current_role_() = 'creative' and works_with_client(client_id));

create policy versions_read on post_versions for select
  using (is_team() and can_read_post(post_id));
create policy versions_team_insert on post_versions for insert
  with check (org_id = current_org() and is_team() and can_read_post(post_id));
create policy versions_admin_delete on post_versions for delete
  using (org_id = current_org() and current_role_() = 'admin');
-- no update policy: versions are frozen (decide_post is security definer)

-- ---------- client views: the ONLY way a client reads posts (no people, no internal fields) ----------
create view client_posts with (security_invoker = false) as
  select id, client_id, task_id, title, platform, format, status, current_version, sent_at, published_url, published_at, created_at, updated_at
  from posts
  where current_role_() = 'client' and client_id = current_client();

create view client_post_versions with (security_invoker = false) as
  select v.id, v.post_id, v.number, v.image_path, v.caption, v.note, v.decision, v.decision_note, v.decided_at, v.created_at
  from post_versions v
  join posts p on p.id = v.post_id
  where current_role_() = 'client' and p.client_id = current_client();

revoke all on client_posts, client_post_versions from public, anon;
grant select on client_posts, client_post_versions to authenticated;

-- ---------- audit + realtime ----------
create trigger posts_audit    after insert or update or delete on posts         for each row execute function audit();
create trigger versions_audit after insert or update or delete on post_versions for each row execute function audit();
alter publication supabase_realtime add table posts, post_versions;

-- ---------- storage: private bucket `post-media` (<org>/<client>/<post>/<n>.<ext>) ----------
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema absent (local CI) — skipping post-media policies';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('post-media', 'post-media', false, 10 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists hamsha_post_media_read on storage.objects';
  execute $p$create policy hamsha_post_media_read on storage.objects for select to authenticated
    using (bucket_id = 'post-media' and (storage.foldername(name))[1] = current_org()::text
           and (current_role_() in ('admin', 'creative') or (storage.foldername(name))[2] = current_client()::text))$p$;
  execute 'drop policy if exists hamsha_post_media_write on storage.objects';
  execute $p$create policy hamsha_post_media_write on storage.objects for insert to authenticated
    with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = current_org()::text and current_role_() in ('admin', 'creative'))$p$;
  execute 'drop policy if exists hamsha_post_media_delete on storage.objects';
  execute $p$create policy hamsha_post_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'post-media' and (storage.foldername(name))[1] = current_org()::text and current_role_() = 'admin')$p$;
end $$;

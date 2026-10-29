-- ============================================================================
-- 0008 — «السوشل» ١.٥ (2026-10-29, council 20261029-021136-0526 after Yousef's staging test of phase 1):
--   1. SECURITY — the client saw unsent drafts: client_posts now hides `draft` posts, and client_post_versions
--      shows ONLY versions that were actually sent (server-set post_versions.sent_at, stamped by the status
--      guard when the admin sends). A new, not-yet-sent version of an already-sent post never leaks (Codex).
--      decide_post() additionally requires the version to carry sent_at.
--   2. CAROUSEL — a version holds an ORDERED set of images: post_versions.image_paths text[] (index 0 = cover),
--      1..20 items (Instagram's limit since Aug 2024; the UI caps per platform, e.g. X = 4). The whole set is
--      frozen with the version; files are never overwritten (every upload gets a new path).
--   3. CLIENT ACCOUNTS — client_accounts (one row per platform account: handle, display name, avatar, bio)
--      so the preview shows the real account; posts.account_id links a post to one of them (same client,
--      same platform — enforced). Avatars live in the public bucket `client-logos` under
--      <org>/<client>/accounts/<rnd>.<ext> (0006 policies already cover that prefix).
-- No official platform logos anywhere (Meta / TikTok brand rules); no fake likes, comments or followers.
-- ============================================================================

-- ---------- 2. carousel: image_path → image_paths[] ----------
alter table post_versions add column image_paths text[] not null default '{}';
-- backfill existing rows (versions are frozen: the trigger lets only internal writes through)
do $$
begin
  perform set_config('hamsha.sys', '1', true);
  update post_versions set image_paths = array[image_path];
  perform set_config('hamsha.sys', '', true);
end $$;
alter table post_versions add column sent_at timestamptz;                      -- 1. stamped by the status guard, never by a client
-- versions that were already in front of a client before 0008: any decided version, and the current version
-- of a post that left draft (sent / approved / changes / published) — the client must keep seeing them
do $$
begin
  perform set_config('hamsha.sys', '1', true);
  update post_versions v set sent_at = coalesce(v.decided_at, p.sent_at, p.published_at, v.created_at)
    from posts p where p.id = v.post_id and v.sent_at is null
      and (v.decision is not null or (p.status <> 'draft' and v.number = p.current_version));
  perform set_config('hamsha.sys', '', true);
end $$;
alter table post_versions add constraint post_versions_media_count check (cardinality(image_paths) between 1 and 20);
alter table post_versions alter column image_paths drop default;

-- the client views depend on image_path: rebuild them further down
drop view if exists client_post_versions;
drop view if exists client_posts;
alter table post_versions drop column image_path;

-- every path is a non-empty storage key
create or replace function post_versions_check_paths(paths text[]) returns boolean
language sql immutable as $$
  select paths is not null and cardinality(paths) between 1 and 20
     and not exists (select 1 from unnest(paths) p where p is null or length(p) not between 1 and 500)
$$;
alter table post_versions add constraint post_versions_media_paths check (post_versions_check_paths(image_paths));

-- ---------- 3. client accounts ----------
create table client_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  platform      post_platform not null,
  handle        text not null check (handle ~ '^[A-Za-z0-9._-]{1,60}$'),      -- without the @
  display_name  text not null check (length(display_name) between 1 and 80),
  avatar_path   text check (avatar_path is null or length(avatar_path) between 1 and 500),
  bio           text check (bio is null or length(bio) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, platform, handle)
);
create index on client_accounts (client_id, platform);

create or replace function client_accounts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.client_id is distinct from old.client_id or new.created_at is distinct from old.created_at) then
    raise exception 'account identity cannot change';
  end if;
  new.handle := ltrim(trim(new.handle), '@');
  new.updated_at := now();
  return new;
end $$;
create trigger client_accounts_consistency before insert or update on client_accounts
  for each row execute function client_accounts_consistency();

alter table posts add column account_id uuid references client_accounts(id) on delete set null;
create index on posts (account_id);

-- the account must belong to the post's client and platform
create or replace function posts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and client_id = new.client_id and org_id = new.org_id) then
    raise exception 'task belongs to another client';
  end if;
  if new.account_id is not null and not exists (select 1 from client_accounts a where a.id = new.account_id and a.client_id = new.client_id and a.platform = new.platform) then
    raise exception 'account belongs to another client or platform';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.current_version := 0; new.sent_at := null; new.published_url := null; new.published_at := null;
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

alter table client_accounts enable row level security;
revoke all on client_accounts from anon;
grant select, insert, update, delete on client_accounts to authenticated;
create policy accounts_team_read on client_accounts for select
  using (org_id = current_org() and (current_role_() = 'admin' or (current_role_() = 'creative' and works_with_client(client_id))));
create policy accounts_client_read on client_accounts for select
  using (org_id = current_org() and current_role_() = 'client' and client_id = current_client());
create policy accounts_admin_write on client_accounts for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

create trigger accounts_audit after insert or update or delete on client_accounts for each row execute function audit();
alter publication supabase_realtime add table client_accounts;

-- ---------- 1. sending stamps the CURRENT version; everything else as in 0007 ----------
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
      perform set_config('hamsha.sys', '1', true);
      update post_versions set sent_at = coalesce(sent_at, now()) where post_id = new.id and number = old.current_version;
      perform set_config('hamsha.sys', '', true);
    elsif old.status = 'sent' and new.status = 'draft' then
      new.sent_at := null;                                   -- withdrawn before the client decided (the post hides again)
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

-- a new version is never "sent" at birth
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
  new.sent_at := null;
  new.decision := null; new.decision_note := null; new.decided_by := null; new.decided_at := null;
  perform set_config('hamsha.sys', '1', true);
  update posts set current_version = new.number, status = 'draft', sent_at = null where id = new.post_id;
  perform set_config('hamsha.sys', '', true);
  return new;
end $$;

create or replace function decide_post(p_version uuid, p_decision post_decision, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; p record;
begin
  if current_role_() <> 'client' then raise exception 'only clients decide'; end if;
  select id, post_id, number, decision, sent_at into v from post_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select id, org_id, client_id, status, current_version into p from posts where id = v.post_id;
  if p.org_id <> current_org() or p.client_id <> current_client() then raise exception 'not your post'; end if;
  if p.status <> 'sent' then raise exception 'post is not awaiting your decision'; end if;
  if v.number <> p.current_version or v.sent_at is null then raise exception 'only the current sent version can be decided'; end if;
  if v.decision is not null then raise exception 'already decided'; end if;
  if p_decision = 'changes' and length(trim(coalesce(p_note, ''))) = 0 then raise exception 'say what to change'; end if;
  perform set_config('hamsha.sys', '1', true);
  update post_versions set decision = p_decision, decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now() where id = v.id;
  update posts set status = p_decision::text::post_status where id = p.id;
  perform set_config('hamsha.sys', '', true);
end $$;

-- ---------- client views: no drafts, no unsent versions ----------
create view client_posts with (security_invoker = false) as
  select id, client_id, task_id, account_id, title, platform, format, status, current_version, sent_at, published_url, published_at, created_at, updated_at
  from posts
  where current_role_() = 'client' and client_id = current_client() and status <> 'draft';

create view client_post_versions with (security_invoker = false) as
  select v.id, v.post_id, v.number, v.image_paths, v.caption, v.note, v.sent_at, v.decision, v.decision_note, v.decided_at, v.created_at
  from post_versions v
  join posts p on p.id = v.post_id
  where current_role_() = 'client' and p.client_id = current_client() and p.status <> 'draft' and v.sent_at is not null;

revoke all on client_posts, client_post_versions from public, anon;
grant select on client_posts, client_post_versions to authenticated;

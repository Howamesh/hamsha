-- =====================================================================================================
-- 0010 — hardening after the full pre-release review (council 20261101-162105-f800, 1 Nov 2026)
--   1. post-media storage: a file is readable only by who may read the VERSION that holds it
--      (before: every creative read every file of the org, and a client could list/download unsent drafts
--      in their folder straight from the Storage API — the client views hid them, the bucket did not).
--   2. decide_post / new versions: the post row is locked first and the version re-read under the lock,
--      like the contract functions (a decision racing a new version could mark the post «approved»
--      while its current version was never approved).
--   3. a version may only reference files inside ITS OWN post folder <org>/<client>/<post>/ (verify round
--      20261101-163636-3a11: a creative could put another client's known path in a version of an allowed post and
--      thereby gain read access to it through can_read_post_media).
-- Safe to re-run.
-- =====================================================================================================

-- ---------- 1. who may read a post-media object ----------
create index if not exists post_versions_image_paths_gin on post_versions using gin (image_paths);

create or replace function can_read_post_media(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from post_versions v
    join posts p on p.id = v.post_id
    where v.org_id = current_org()
      and v.image_paths @> array[obj]
      and case current_role_()
            when 'admin' then true
            when 'creative' then can_read_post(p.id)
            -- the client sees exactly what client_post_versions shows: sent versions of its own, non-draft posts
            when 'client' then p.client_id = current_client() and p.status <> 'draft' and v.sent_at is not null
            else false
          end
  )
$$;
revoke execute on function can_read_post_media(text) from public, anon;
grant  execute on function can_read_post_media(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema absent (local CI) — skipping the post-media read policy';
    return;
  end if;
  execute 'drop policy if exists hamsha_post_media_read on storage.objects';
  -- owner_id (not the deprecated `owner`) = the uploader may read what they just uploaded (the version row is inserted right after the upload)
  execute $p$create policy hamsha_post_media_read on storage.objects for select to authenticated
    using (bucket_id = 'post-media' and (storage.foldername(name))[1] = current_org()::text
           and (current_role_() = 'admin' or owner_id = (select auth.uid())::text or can_read_post_media(name)))$p$;
end $$;

-- ---------- 2. decisions and new versions serialise on the post row ----------
create or replace function decide_post(p_version uuid, p_decision post_decision, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; p record; vid uuid;
begin
  if current_role_() <> 'client' then raise exception 'only clients decide'; end if;
  select post_id into vid from post_versions where id = p_version;
  if vid is null then raise exception 'unknown version'; end if;
  -- post first (a new version takes the same lock in post_versions_insert) …
  select id, org_id, client_id, status, current_version into p from posts where id = vid for update;
  -- … then the version, re-read after the lock
  select id, post_id, number, decision, sent_at into v from post_versions where id = p_version for update;
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

create or replace function post_versions_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  -- locked: two uploads never get the same number, and a decision in flight finishes before the post moves on
  select org_id, client_id, status, current_version into p from posts where id = new.post_id for update;
  if p is null then raise exception 'unknown post'; end if;
  if p.org_id <> new.org_id then raise exception 'organization mismatch'; end if;
  if p.status = 'published' then raise exception 'a published post cannot change'; end if;
  -- every file must live in this post's own folder (the app uploads to <org>/<client>/<post>/…; kept images of
  -- earlier versions are in the same folder): no borrowing another post's or client's files
  if exists (select 1 from unnest(new.image_paths) x where x not like p.org_id::text || '/' || p.client_id::text || '/' || new.post_id::text || '/%') then
    raise exception 'image path outside this post''s folder';
  end if;
  new.number := p.current_version + 1;
  new.created_by := auth.uid();
  new.sent_at := null;
  new.decision := null; new.decision_note := null; new.decided_by := null; new.decided_at := null;
  perform set_config('hamsha.sys', '1', true);
  update posts set current_version = new.number, status = 'draft', sent_at = null where id = new.post_id;
  perform set_config('hamsha.sys', '', true);
  return new;
end $$;

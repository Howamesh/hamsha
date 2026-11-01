-- =====================================================================================================
-- 0011 — second hardening pass (councils 20261101-180258-a198 Codex·production, 20261101-180259-4872 Gemini·code,
--        cross-review 20261101-181336-*; every item verified against the code by Claude before it went in)
--   1. decide_post: an UNLINKED client (role client, client_id NULL — e.g. after its client was deleted) passed the
--      ownership check because «x <> NULL» is NULL, not true. Now null-safe and the caller must be a linked client. (Codex)
--   2. storage 0006 (live in production today): any creative could read every file of the «attachments» bucket and
--      overwrite client logos. Attachments now follow the task (can_read_task via the attachments row); logos and
--      attachments are written by admins only (the app never uploads them as a creative). (Codex)
--   3. post-media: the uploader may delete their OWN file while no version references it — the cleanup after a failed
--      «new version» insert was silently refused for creatives and left orphans. (Gemini)
--   4. profiles: a member can only be linked to a client of the SAME organization. (Codex)
--   5. can_access_channel: a malformed «task:…» channel name returns false instead of a uuid cast error. (Gemini)
--   6. clients.contract follows the latest contract the client can SEE (sent/opened/signed/completed); an unsent draft
--      (a renewal being prepared) no longer flips a signed client back to «draft» and trips the block banner. (both)
-- Safe to re-run. Runs after 0010.
-- =====================================================================================================

-- ---------- 1. decide_post: linked clients only, null-safe ownership ----------
create or replace function decide_post(p_version uuid, p_decision post_decision, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; p record; vid uuid;
begin
  if auth.uid() is null or current_role_() is distinct from 'client' or current_org() is null or current_client() is null then
    raise exception 'only linked clients decide' using errcode = '42501';
  end if;
  select post_id into vid from post_versions where id = p_version;
  if vid is null then raise exception 'unknown version'; end if;
  select id, org_id, client_id, status, current_version into p from posts where id = vid for update;
  select id, post_id, number, decision, sent_at into v from post_versions where id = p_version for update;
  if p.org_id is distinct from current_org() or p.client_id is distinct from current_client() then
    raise exception 'not your post' using errcode = '42501';
  end if;
  if p.status <> 'sent' then raise exception 'post is not awaiting your decision'; end if;
  if v.number <> p.current_version or v.sent_at is null then raise exception 'only the current sent version can be decided'; end if;
  if v.decision is not null then raise exception 'already decided'; end if;
  if p_decision = 'changes' and length(trim(coalesce(p_note, ''))) = 0 then raise exception 'say what to change'; end if;
  perform set_config('hamsha.sys', '1', true);
  update post_versions set decision = p_decision, decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now() where id = v.id;
  update posts set status = p_decision::text::post_status where id = p.id;
  perform set_config('hamsha.sys', '', true);
end $$;

-- ---------- 2 + 3. storage ----------
create or replace function can_read_attachment(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from attachments a where a.org_id = current_org() and a.storage_path = obj and can_read_task(a.task_id))
$$;
revoke execute on function can_read_attachment(text) from public, anon;
grant  execute on function can_read_attachment(text) to authenticated;

-- an object no version points at (a failed upload's leftovers)
create or replace function post_media_unreferenced(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from post_versions v where v.image_paths @> array[obj])
$$;
revoke execute on function post_media_unreferenced(text) from public, anon;
grant  execute on function post_media_unreferenced(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema absent (local CI) — skipping storage policies';
    return;
  end if;
  -- client-logos stays a PUBLIC bucket (logos and account avatars are shown by URL); attachments follow their task
  execute 'drop policy if exists hamsha_storage_read on storage.objects';
  execute $p$create policy hamsha_storage_read on storage.objects for select to authenticated
    using ((storage.foldername(name))[1] = current_org()::text
           and (bucket_id = 'client-logos'
                or (bucket_id = 'attachments' and (current_role_() = 'admin' or can_read_attachment(name)))))$p$;
  execute 'drop policy if exists hamsha_storage_write on storage.objects';
  execute $p$create policy hamsha_storage_write on storage.objects for insert to authenticated
    with check (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() = 'admin')$p$;
  execute 'drop policy if exists hamsha_storage_update on storage.objects';
  execute $p$create policy hamsha_storage_update on storage.objects for update to authenticated
    using (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() = 'admin')
    with check (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() = 'admin')$p$;

  execute 'drop policy if exists hamsha_post_media_delete on storage.objects';
  execute $p$create policy hamsha_post_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'post-media' and (storage.foldername(name))[1] = current_org()::text
           and (current_role_() = 'admin' or (owner_id = (select auth.uid())::text and post_media_unreferenced(name))))$p$;
end $$;

-- ---------- 4. a member is linked only to a client of the same organization ----------
create or replace function profiles_identity_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.email is distinct from old.email then
    raise exception 'profile identity cannot change';
  end if;
  if current_role_() <> 'admin' and (new.role is distinct from old.role or new.client_id is distinct from old.client_id) then
    raise exception 'only admins change roles';
  end if;
  if new.client_id is not null and new.client_id is distinct from old.client_id
     and not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  return new;
end $$;

-- ---------- 5. channel names are validated before any cast (exact 8-4-4-4-12 uuid shape — cross-review) ----------
create or replace function can_access_channel(ch text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r user_role := current_role_();
begin
  if ch = 'team' then return r in ('admin', 'creative'); end if;
  if ch ~ '^client:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return r = 'admin' or (r = 'client' and current_client()::text = substring(ch from 8));
  end if;
  if ch ~ '^task:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return r in ('admin', 'creative') and can_read_task(substring(ch from 6)::uuid);
  end if;
  return false;
end $$;

-- ---------- 6. the client's contract state comes from what the client can see ----------
create or replace function contracts_sync_client() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.client_id, old.client_id); st contract_state;
begin
  if cid is null then return null; end if;
  -- sent/opened/signed/completed first (newest of those); only when every contract is still a draft → draft
  select status into st from contracts where client_id = cid and party = 'client'
    order by (status <> 'draft') desc, updated_at desc, id desc limit 1;   -- id: a stable tie-break
  update clients set contract = case when st in ('signed', 'completed') then 'signed' when st in ('sent', 'opened') then 'sent' else 'draft' end::contract_status where id = cid;
  return null;
end $$;

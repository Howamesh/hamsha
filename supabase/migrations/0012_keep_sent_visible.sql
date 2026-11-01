-- =====================================================================================================
-- 0012 — what was SENT stays visible while the team works on a new version (Yousef's decision, 1 Nov 2026,
--        after council 20261101-180259-4872 raised it and 20261101-181336-d8a6 called it a design choice)
-- Before: a new version (or a withdraw) sent the post/contract back to «draft», and the client/creative lost the
--         whole thing — earlier versions, their own decision and note — until it was re-sent: it felt deleted.
-- Now:    anything the counterparty has ever RECEIVED (a version with sent_at) stays in their list with its sent
--         versions; the app shows it as «قيد التعديل». Nothing that was never sent becomes visible: unsent versions
--         and never-sent contracts/posts stay hidden exactly as before. Decisions still need status «sent».
-- Safe to re-run. Runs after 0011.
-- =====================================================================================================

-- ---------- posts ----------
create or replace view client_posts with (security_invoker = false) as
  select p.id, p.client_id, p.task_id, p.account_id, p.title, p.platform, p.format, p.status, p.current_version, p.sent_at,
         p.published_url, p.published_at, p.created_at, p.updated_at
  from posts p
  where current_role_() = 'client' and p.client_id = current_client()
    and (p.status <> 'draft' or exists (select 1 from post_versions v where v.post_id = p.id and v.sent_at is not null));

create or replace view client_post_versions with (security_invoker = false) as
  select v.id, v.post_id, v.number, v.image_paths, v.caption, v.note, v.sent_at, v.decision, v.decision_note, v.decided_at, v.created_at
  from post_versions v
  join posts p on p.id = v.post_id
  where current_role_() = 'client' and p.client_id = current_client() and v.sent_at is not null;

-- the images follow the same rule: a client reads the files of its SENT versions, whatever the post's state now
create or replace function can_read_post_media(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from post_versions v
    join posts p on p.id = v.post_id
    where v.org_id = current_org()
      and v.image_paths @> array[obj]
      and obj like v.org_id::text || '/' || p.client_id::text || '/' || p.id::text || '/%'
      and case current_role_()
            when 'admin' then true
            when 'creative' then can_read_post(p.id)
            when 'client' then p.client_id = current_client() and v.sent_at is not null
            else false
          end
  )
$$;

-- ---------- contracts ----------
create or replace view client_contracts with (security_invoker = false) as
  select c.id, c.client_id, c.number, c.kind, c.title, c.accent, c.status, c.current_version, c.sent_at, c.decided_at, c.created_at, c.updated_at
  from contracts c
  where current_role_() = 'client' and c.party = 'client' and c.client_id = current_client()
    and (c.status <> 'draft' or exists (select 1 from contract_versions v where v.contract_id = c.id and v.sent_at is not null));

create or replace view client_contract_versions with (security_invoker = false) as
  select v.id, v.contract_id, v.number, v.content, v.content_hash, v.note, v.first_signature, v.first_signer, v.first_capacity, v.first_signed_at,
         v.sent_at, v.opened_at, v.decision, v.decision_note, v.signature, v.signer_name, v.signer_capacity, v.decided_at, v.created_at
  from contract_versions v
  join contracts c on c.id = v.contract_id
  where current_role_() = 'client' and c.party = 'client' and c.client_id = current_client() and v.sent_at is not null;

-- a creative counterparty: same rule through the table policies (contract readable once something was sent to them)
create or replace function can_read_contract(cid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c record; r user_role := current_role_();
begin
  if auth.uid() is null or r is null or current_org() is null then return false; end if;
  select org_id, party, creative_id, status into c from contracts where id = cid;
  if c is null or c.org_id is distinct from current_org() then return false; end if;
  if r = 'admin' then return true; end if;
  if r = 'creative' then
    return c.party = 'creative' and c.creative_id = auth.uid()
       and (c.status <> 'draft' or exists (select 1 from contract_versions v where v.contract_id = cid and v.sent_at is not null));
  end if;
  return false;
end $$;

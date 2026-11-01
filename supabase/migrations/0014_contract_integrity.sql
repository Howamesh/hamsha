-- 0014 contract + activity integrity (overnight council 20261101-233827-bff0, Codex findings 1, 2, 5; 2 Nov 2026)
-- 1. The database itself refuses to SIGN or SEND a contract whose essential fields are empty (the app's «ناقص» bar
--    was only checked in the editor; the contract panel's «وقّع هوامش» / «إرسال» skipped it). Drafts may stay incomplete.
-- 2. A version that already reached the other side can never be re-signed: after «سحب» a new signature needs a NEW
--    version, so the copy the client/creative already saw keeps its signature and date.
-- 3. posts.sent_by / posts.published_by: who clicked «أرسل للعميل» / «تم النشر», so a second admin's alerts can show
--    the other admin's moves (never exposed to clients: client_posts lists its columns explicitly).

/** NULL when the frozen content has what the paper must print; otherwise the first missing thing (Arabic label). */
create or replace function contract_content_missing(c jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare k text := coalesce(c ->> 'kind', '');
  t text := '';
begin
  if c is null then return 'المحتوى'; end if;
  if length(trim(coalesce(c ->> 'title', ''))) = 0 then return 'عنوان العقد'; end if;
  if coalesce(c ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'تاريخ العقد'; end if;
  if length(trim(coalesce(c #>> '{counterparty,name}', ''))) = 0 then return 'اسم الطرف الآخر'; end if;
  if length(trim(coalesce(c #>> '{hawamish,name}', ''))) = 0 then return 'اسم هوامش'; end if;
  if length(trim(coalesce(c #>> '{signers,hawamish,name}', ''))) = 0 then return 'اسم موقّع هوامش'; end if;
  if k = 'employment' then
    if length(trim(coalesce(c ->> 'jobTitle', ''))) = 0 then return 'الوظيفة'; end if;
    if length(trim(coalesce(c #>> '{counterparty,nationalId}', ''))) = 0 then return 'رقم هوية الموظف'; end if;
    if length(trim(coalesce(c #>> '{bank,iban}', ''))) = 0 then return 'آيبان الموظف'; end if;
  else
    if length(trim(coalesce(c #>> '{counterparty,cr}', '') || coalesce(c #>> '{counterparty,nationalId}', ''))) = 0 then return 'السجل التجاري أو الهوية'; end if;
    if length(trim(coalesce(c #>> '{bank,iban}', ''))) = 0 then return 'الآيبان'; end if;
  end if;
  return null;
end $$;

create or replace function contracts_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare sys boolean := coalesce(current_setting('hamsha.sys', true), '') = '1'; v record; miss text;
begin
  new.updated_at := now();
  if sys then return new; end if;
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.party is distinct from old.party
     or new.client_id is distinct from old.client_id or new.creative_id is distinct from old.creative_id
     or new.number is distinct from old.number or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'contract identity cannot change';
  end if;
  if new.current_version is distinct from old.current_version then raise exception 'current_version is set by saving a version'; end if;
  if auth.uid() is null or current_role_() is distinct from 'admin' then raise exception 'only admins change contracts'; end if;
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'sent' then
      if old.current_version = 0 then raise exception 'save a version before sending'; end if;
      select first_signature, sent_at, content into v from contract_versions where contract_id = new.id and number = old.current_version;
      if v.first_signature is null then raise exception 'Hawamish must sign the version before sending'; end if;
      miss := contract_content_missing(v.content);                                    -- 0014: never send an incomplete contract
      if miss is not null then raise exception 'contract incomplete: %', miss; end if;
      new.sent_at := now();
      perform set_config('hamsha.sys', '1', true);
      update contract_versions set sent_at = coalesce(sent_at, now()) where contract_id = new.id and number = old.current_version;
      perform set_config('hamsha.sys', '', true);
      perform log_contract_event(new.id, old.current_version, 'sent');
    elsif old.status in ('sent', 'opened') and new.status = 'draft' then
      new.sent_at := null;
      perform log_contract_event(new.id, old.current_version, 'withdrawn');
    elsif old.status = 'signed' and new.status = 'completed' then
      perform log_contract_event(new.id, old.current_version, 'completed');
    else
      raise exception 'transition % → % is not allowed', old.status, new.status;
    end if;
  end if;
  if new.sent_at is distinct from old.sent_at and new.status = old.status then raise exception 'sent_at is derived'; end if;
  if new.decided_at is distinct from old.decided_at then raise exception 'decided_at is derived'; end if;
  return new;
end $$;

/** Admin: Hawamish signs the CURRENT draft version (before sending) — never one already sent, never an incomplete one. */
create or replace function sign_contract_first(p_version uuid, p_signature text, p_name text, p_capacity text)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; c record; miss text;
begin
  if auth.uid() is null or current_role_() is distinct from 'admin' then raise exception 'only admins sign for Hawamish'; end if;
  select id, contract_id, number, sent_at into v from contract_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select org_id, status, current_version into c from contracts where id = v.contract_id for update;   -- contract first, then the version
  perform 1 from contract_versions where id = v.id for update;
  select sent_at into v.sent_at from contract_versions where id = v.id;                               -- re-read under the lock
  if c.org_id is distinct from current_org() then raise exception 'not your contract'; end if;
  if c.status <> 'draft' or v.number <> c.current_version then raise exception 'only the current draft version can be signed'; end if;
  if v.sent_at is not null then raise exception 'this version was already sent — save a new version to sign again'; end if;
  select contract_content_missing(content) into miss from contract_versions where id = v.id;
  if miss is not null then raise exception 'contract incomplete: %', miss; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then raise exception 'bad signature'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'signer name required'; end if;
  perform set_config('hamsha.sys', '1', true);
  update contract_versions set first_signature = p_signature, first_signer = trim(p_name), first_capacity = nullif(trim(coalesce(p_capacity, '')), ''), first_signed_at = now() where id = v.id;
  perform set_config('hamsha.sys', '', true);
  perform log_contract_event(v.contract_id, v.number, 'first_signed', jsonb_build_object('signer', trim(p_name)));
end $$;
revoke execute on function sign_contract_first(uuid, text, text, text) from public, anon;
grant  execute on function sign_contract_first(uuid, text, text, text) to authenticated;

-- ---------- 3. who sent / published a post ----------
alter table posts add column if not exists sent_by uuid;
alter table posts add column if not exists published_by uuid;
create or replace function posts_actor_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.sent_by := null; new.published_by := null;
    return new;
  end if;
  -- only this trigger writes them: whatever a request sends is replaced by the real actor of the status change
  new.sent_by := case when new.status = 'sent' and old.status is distinct from 'sent' then auth.uid() else old.sent_by end;
  new.published_by := case when new.status = 'published' and old.status is distinct from 'published' then auth.uid() else old.published_by end;
  return new;
end $$;
drop trigger if exists posts_actor_stamp on posts;
create trigger posts_actor_stamp before insert or update on posts
  for each row execute function posts_actor_stamp();

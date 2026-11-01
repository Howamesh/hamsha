-- 0014 contract + activity integrity (overnight council 20261101-233827-bff0, Codex findings 1, 2, 5; 2 Nov 2026)
-- 1. The database itself refuses to SIGN or SEND a contract whose essential fields are empty (the app's «ناقص» bar
--    was only checked in the editor; the contract panel's «وقّع هوامش» / «إرسال» skipped it). Drafts may stay incomplete.
-- 2. A version that already reached the other side can never be re-signed: after «سحب» a new signature needs a NEW
--    version, so the copy the client/creative already saw keeps its signature and date.
-- 3. posts.sent_by / posts.published_by: who clicked «أرسل للعميل» / «تم النشر», so a second admin's alerts can show
--    the other admin's moves (never exposed to clients: client_posts lists its columns explicitly).

-- small helpers: an empty text at a path / a positive number at a path (JSON numbers only)
create or replace function _c_empty(c jsonb, path text[]) returns boolean
language sql immutable set search_path = public as $$ select length(trim(coalesce(c #>> path, ''))) = 0 $$;
create or replace function _c_pos(c jsonb, path text[]) returns boolean
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(c #> path) = 'number' then (c #>> path)::numeric > 0 else false end $$;

/** NULL when the frozen content has what the paper must print; otherwise the first missing thing (Arabic label).
 *  Mirrors missingFields() in src/lib/contracts.ts (council verify round 2 Nov: amounts, durations, contacts too). */
create or replace function contract_content_missing(c jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare k text := coalesce(c ->> 'kind', '');
  txt text;
  side text; who text;
  i int;
begin
  if c is null then return 'المحتوى'; end if;
  if _c_empty(c, '{title}') then return 'عنوان العقد'; end if;
  if coalesce(c ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'تاريخ العقد'; end if;
  if k = 'employment' then
    if _c_empty(c, '{jobTitle}') then return 'الوظيفة'; end if;
    if _c_empty(c, '{counterparty,name}') then return 'اسم الموظف'; end if;
    if _c_empty(c, '{counterparty,nationalId}') then return 'رقم هوية الموظف'; end if;
    if _c_empty(c, '{counterparty,phone}') then return 'رقم التواصل (الموظف)'; end if;
    if _c_empty(c, '{counterparty,email}') then return 'إيميل التواصل (الموظف)'; end if;
    if _c_empty(c, '{hawamish,name}') then return 'اسم هوامش'; end if;
    if _c_empty(c, '{hawamish,cr}') then return 'السجل التجاري (هوامش)'; end if;
    if _c_empty(c, '{hawamish,repName}') then return 'ممثل هوامش'; end if;
    if _c_empty(c, '{hawamish,phone}') then return 'رقم التواصل (هوامش)'; end if;
    if _c_empty(c, '{hawamish,email}') then return 'إيميل التواصل (هوامش)'; end if;
    if _c_empty(c, '{bank,owner}') then return 'صاحب الحساب (الموظف)'; end if;
    if _c_empty(c, '{bank,account}') then return 'رقم الحساب (الموظف)'; end if;
    if _c_empty(c, '{bank,iban}') then return 'آيبان الموظف'; end if;
  else
    -- the words the contract TEXT uses must be filled (unused counts stay optional), like the editor's bar
    if k = 'full' then
      select coalesce(string_agg(x ->> 'body', E'\n'), '') into txt from jsonb_array_elements(coalesce(c -> 'sections', '[]'::jsonb)) x;
    else
      txt := coalesce(c ->> 'scope', '');
    end if;
    if position('{الهدف}' in txt) > 0 and _c_empty(c, '{project}') then return 'المشروع'; end if;
    foreach side in array array['counterparty', 'hawamish'] loop
      who := case side when 'counterparty' then 'الطرف الآخر' else 'هوامش' end;
      if _c_empty(c, array[side, 'name']) then return 'اسم ' || who; end if;
      if _c_empty(c, array[side, 'cr']) and _c_empty(c, array[side, 'nationalId']) then return 'السجل التجاري أو الهوية (' || who || ')'; end if;
      if k <> 'short' and _c_empty(c, array[side, 'city']) then return 'المدينة (' || who || ')'; end if;
      if _c_empty(c, array[side, 'repName']) then return 'الممثل (' || who || ')'; end if;
      if _c_empty(c, array[side, 'phone']) then return 'رقم التواصل (' || who || ')'; end if;
      if _c_empty(c, array[side, 'email']) then return 'إيميل التواصل (' || who || ')'; end if;
    end loop;
    if position('{المنصات}' in txt) > 0 and _c_empty(c, '{vars,platforms}') then return 'المنصات'; end if;
    if position('{المنشورات}' in txt) > 0 and not _c_pos(c, '{vars,posts}') then return 'عدد المنشورات شهرياً'; end if;
    if position('{التصاميم}' in txt) > 0 and not _c_pos(c, '{vars,designs}') then return 'عدد التصاميم شهرياً'; end if;
    if position('{الفيديوهات}' in txt) > 0 and not _c_pos(c, '{vars,videos}') then return 'عدد الفيديوهات شهرياً'; end if;
    if k = 'short' then
      if jsonb_array_length(coalesce(c -> 'tracks', '[]'::jsonb)) = 0 then return 'المسار'; end if;
      for i in 0 .. jsonb_array_length(c -> 'tracks') - 1 loop
        if not _c_pos(c, array['tracks', i::text, 'monthly']) then return 'المبلغ الشهري للمسار ' || (i + 1); end if;
        if not _c_pos(c, array['tracks', i::text, 'months']) then return 'مدة المسار ' || (i + 1); end if;
      end loop;
    elsif k = 'offer' then
      for i in 0 .. jsonb_array_length(coalesce(c -> 'packages', '[]'::jsonb)) - 1 loop
        if not _c_pos(c, array['packages', i::text, 'price']) then return 'سعر الباقة ' || (i + 1); end if;
      end loop;
    elsif coalesce(c #>> '{pricing,mode}', 'monthly') = 'monthly' then
      if not _c_pos(c, '{pricing,monthly}') then return 'المبلغ الشهري'; end if;
      if not _c_pos(c, '{pricing,months}') then return 'عدد الأشهر'; end if;
    else
      if not (_c_pos(c, '{pricing,projectTotal}') or exists (
              select 1 from jsonb_array_elements(coalesce(c #> '{pricing,installments}', '[]'::jsonb)) x
              where jsonb_typeof(x -> 'amount') = 'number' and (x ->> 'amount')::numeric > 0)) then return 'إجمالي المشروع'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(c #> '{pricing,installments}', '[]'::jsonb)) x
                 where not (jsonb_typeof(x -> 'amount') = 'number' and (x ->> 'amount')::numeric > 0)) then return 'مبالغ الدفعات'; end if;
    end if;
    if _c_empty(c, '{bank,iban}') then return 'الآيبان (الحساب البنكي)'; end if;
  end if;
  if _c_empty(c, '{signers,hawamish,name}') then return 'اسم موقّع هوامش'; end if;
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
      -- 0014: never send an incomplete contract. Checked on the FIRST send only: a version that already went out once
      -- (re-sent after «سحب») keeps the content it was sent with (council verify round, 2 Nov)
      if v.sent_at is null then
        miss := contract_content_missing(v.content);
        if miss is not null then raise exception 'contract incomplete: %', miss; end if;
      end if;
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

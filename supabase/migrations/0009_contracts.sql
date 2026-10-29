-- ============================================================================
-- 0009 — «العقود» phase 1 (2026-10-29, built from the manager's own Figma contracts; councils 2026-10-20 + 2026-10-28):
--   • A contract belongs to ONE counterparty: a client (clients.id) or a creative (profiles.id, role creative).
--   • Everything the paper shows lives in a FROZEN version (contracts_versions.content jsonb — parties, sections,
--     pricing, timeline, packages, bank, signers, accent, copyright 1448) with a server-computed sha256 hash.
--     A new version returns the contract to `draft`; the counterparty's decision binds to ONE version number.
--   • Hawamish signs first (admin, on the version), then sends. States (contracts_status_guard, admin only
--     except the two counterparty RPCs): draft → sent → opened → signed | changes | rejected → completed.
--   • Counterparty writes: mark_contract_opened(version) and decide_contract(version, decision, note,
--     signature, signer name + capacity). Signatures are small PNG data URLs stored in the row (no bucket).
--   • Audit: contract_events (who / what / when / user agent) written by the triggers + RPCs; admins read.
--   • Clients never read the raw tables (views client_contracts / client_contract_versions: no drafts, no
--     unsent versions, no internal fields). Creatives read their own contracts through RLS (no drafts).
--   • clients.contract (0001: draft / sent / signed, used by the calendar) is now DERIVED from the latest
--     client contract; clients.contract_block lets the admin block the client's view until signed.
-- Not here (phase 2): e-mail OTP before signing, server-side PDF, licensed signature provider, renewals.
-- ============================================================================

create type contract_kind  as enum ('short', 'full', 'offer');
create type contract_party as enum ('client', 'creative');
create type contract_state as enum ('draft', 'sent', 'opened', 'signed', 'changes', 'rejected', 'completed');
create type contract_decision as enum ('signed', 'changes', 'rejected');

create table contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  number           integer not null,                                  -- «مسودة #2612», sequential per org
  kind             contract_kind not null default 'full',
  party            contract_party not null default 'client',
  client_id        uuid references clients(id) on delete cascade,
  creative_id      uuid references profiles(id) on delete cascade,
  title            text not null check (length(title) between 1 and 200),
  accent           text not null default '#D9B600' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  status           contract_state not null default 'draft',
  current_version  integer not null default 0,
  sent_at          timestamptz,
  decided_at       timestamptz,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, number),
  check ((party = 'client' and client_id is not null and creative_id is null) or (party = 'creative' and creative_id is not null and client_id is null))
);
create index on contracts (org_id, updated_at desc);
create index on contracts (client_id);
create index on contracts (creative_id);

create table contract_versions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  contract_id      uuid not null references contracts(id) on delete cascade,
  number           integer not null,
  content          jsonb not null,
  content_hash     text not null,                                      -- sha256(content) — set by the DB
  note             text check (note is null or length(note) <= 2000), -- team → counterparty
  first_signature  text check (first_signature is null or (first_signature like 'data:image/png;base64,%' and length(first_signature) <= 400000)),
  first_signer     text check (first_signer is null or length(first_signer) <= 120),
  first_capacity   text check (first_capacity is null or length(first_capacity) <= 120),
  first_signed_at  timestamptz,
  sent_at          timestamptz,
  opened_at        timestamptz,
  decision         contract_decision,
  decision_note    text check (decision_note is null or length(decision_note) <= 4000),
  signature        text check (signature is null or (signature like 'data:image/png;base64,%' and length(signature) <= 400000)),
  signer_name      text check (signer_name is null or length(signer_name) <= 120),
  signer_capacity  text check (signer_capacity is null or length(signer_capacity) <= 120),
  decided_by       uuid references profiles(id) on delete set null,
  decided_at       timestamptz,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (contract_id, number)
);
create index on contract_versions (contract_id, number desc);

create table contract_events (
  id           bigserial primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  contract_id  uuid not null references contracts(id) on delete cascade,
  version      integer,
  actor        uuid,
  actor_role   text,
  event        text not null check (event in ('created', 'version', 'first_signed', 'sent', 'withdrawn', 'opened', 'signed', 'changes', 'rejected', 'completed', 'deleted')),
  meta         jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now()
);
create index on contract_events (contract_id, at desc);

alter table clients add column contract_block boolean not null default false;

-- Hawamish's own legal identity for the contract header (CR, address, representative, bank accounts, stamp):
-- typed ONCE by an admin in Settings, never hard-coded in the app (the repository is public).
create table org_legal (
  org_id      uuid primary key references organizations(id) on delete cascade,
  legal       jsonb not null default '{}'::jsonb,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table org_legal enable row level security;
revoke all on org_legal from anon;
grant select, insert, update on org_legal to authenticated;
create policy org_legal_admin on org_legal for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
create or replace function org_legal_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.legal) <> 'object' or length(new.legal::text) > 400000 then raise exception 'bad legal profile'; end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
create trigger org_legal_touch before insert or update on org_legal for each row execute function org_legal_touch();

-- ---------- helpers ----------
create or replace function contract_hash(c jsonb) returns text
language sql immutable as $$ select encode(sha256(convert_to(c::text, 'UTF8')), 'hex') $$;

create or replace function log_contract_event(cid uuid, ver integer, ev text, m jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from contracts where id = cid;
  insert into contract_events (org_id, contract_id, version, actor, actor_role, event, meta)
    values (o, cid, ver, auth.uid(), current_role_()::text, ev, coalesce(m, '{}'::jsonb) || jsonb_build_object('ua', left(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', ''), 300)));
end $$;
-- internal only: triggers and the RPCs below call it; nobody calls it from the API
revoke execute on function log_contract_event(uuid, integer, text, jsonb) from public, anon, authenticated;

/** May this user see the contract at all? Admin: org. Creative: own contracts that left draft. Client: never the table. */
create or replace function can_read_contract(cid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c record; r user_role := current_role_();
begin
  if auth.uid() is null or r is null or current_org() is null then return false; end if;
  select org_id, party, creative_id, status into c from contracts where id = cid;
  if c is null or c.org_id is distinct from current_org() then return false; end if;
  if r = 'admin' then return true; end if;
  if r = 'creative' then return c.party = 'creative' and c.creative_id = auth.uid() and c.status <> 'draft'; end if;
  return false;
end $$;
revoke execute on function can_read_contract(uuid) from public, anon;
grant  execute on function can_read_contract(uuid) to authenticated;

-- ---------- consistency + the state machine ----------
create or replace function contracts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  if new.creative_id is not null and not exists (select 1 from profiles where id = new.creative_id and org_id = new.org_id and role = 'creative') then
    raise exception 'counterparty must be a creative of this organization';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is null or current_role_() is distinct from 'admin' then raise exception 'only admins create contracts'; end if;
    new.status := 'draft'; new.current_version := 0; new.sent_at := null; new.decided_at := null;
    new.created_by := auth.uid();
    perform 1 from organizations where id = new.org_id for update;   -- one number at a time per organization
    select coalesce(max(number), 2611) + 1 into new.number from contracts where org_id = new.org_id;
  end if;
  return new;
end $$;
create trigger contracts_consistency before insert or update on contracts
  for each row execute function contracts_consistency();

-- (0008 follow-up, Codex review 2026-10-29) a client account linked to posts keeps its platform
create or replace function client_accounts_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.org_id is distinct from old.org_id or new.client_id is distinct from old.client_id or new.created_at is distinct from old.created_at) then
    raise exception 'account identity cannot change';
  end if;
  if tg_op = 'UPDATE' and new.platform is distinct from old.platform and exists (select 1 from posts where account_id = new.id) then
    raise exception 'the platform of an account that posts use cannot change';
  end if;
  new.handle := ltrim(trim(new.handle), '@');
  new.updated_at := now();
  return new;
end $$;

create or replace function contracts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_contract_event(new.id, 0, 'created', jsonb_build_object('kind', new.kind, 'party', new.party));
  return new;
end $$;
create trigger contracts_after_insert after insert on contracts
  for each row execute function contracts_after_insert();

-- Allowed transitions (admin only; the counterparty goes through the RPCs which set hamsha.sys).
create or replace function contracts_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare sys boolean := coalesce(current_setting('hamsha.sys', true), '') = '1'; v record;
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
      select first_signature, sent_at into v from contract_versions where contract_id = new.id and number = old.current_version;
      if v.first_signature is null then raise exception 'Hawamish must sign the version before sending'; end if;
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
create trigger contracts_status_guard before update on contracts
  for each row execute function contracts_status_guard();

create or replace function contracts_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('signed', 'completed') then raise exception 'a signed contract cannot be deleted'; end if;
  return old;
end $$;
create trigger contracts_before_delete before delete on contracts
  for each row execute function contracts_before_delete();

-- A new version: number + hash assigned here; the contract returns to draft (no decision carries over).
create or replace function contract_versions_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null or current_role_() is distinct from 'admin' then raise exception 'only admins write contract versions'; end if;
  select org_id, status, current_version into c from contracts where id = new.contract_id for update;   -- serialises version numbers
  if c is null then raise exception 'unknown contract'; end if;
  if c.org_id <> new.org_id then raise exception 'organization mismatch'; end if;
  if c.status in ('signed', 'completed') then raise exception 'a signed contract cannot change — make a new contract'; end if;
  if jsonb_typeof(new.content) <> 'object' or length(new.content::text) > 400000 then raise exception 'bad content'; end if;
  new.number := c.current_version + 1;
  new.content_hash := contract_hash(new.content);
  new.created_by := auth.uid();
  new.sent_at := null; new.opened_at := null;
  new.first_signature := null; new.first_signer := null; new.first_capacity := null; new.first_signed_at := null;
  new.decision := null; new.decision_note := null; new.signature := null; new.signer_name := null; new.signer_capacity := null; new.decided_by := null; new.decided_at := null;
  perform set_config('hamsha.sys', '1', true);
  update contracts set current_version = new.number, status = 'draft', sent_at = null, decided_at = null where id = new.contract_id;
  perform set_config('hamsha.sys', '', true);
  perform log_contract_event(new.contract_id, new.number, 'version', jsonb_build_object('hash', new.content_hash));
  return new;
end $$;
create trigger contract_versions_insert before insert on contract_versions
  for each row execute function contract_versions_insert();

-- Versions are frozen: only the internal RPCs may touch them.
create or replace function contract_versions_frozen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('hamsha.sys', true), '') = '1' then return new; end if;
  raise exception 'contract versions are frozen';
end $$;
create trigger contract_versions_frozen before update on contract_versions
  for each row execute function contract_versions_frozen();

-- A sent, signed or current version is part of the record: it cannot be deleted (the contract itself can,
-- while unsigned, and takes its versions with it).
create or replace function contract_versions_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if coalesce(current_setting('hamsha.sys', true), '') = '1' then return old; end if;
  if old.sent_at is not null or old.first_signature is not null or old.signature is not null then raise exception 'a sent or signed version cannot be deleted'; end if;
  select current_version, status into c from contracts where id = old.contract_id;
  if c is not null and c.current_version = old.number then raise exception 'the current version cannot be deleted'; end if;
  return old;
end $$;
create trigger contract_versions_before_delete before delete on contract_versions
  for each row execute function contract_versions_before_delete();
-- deleting the whole (unsigned) contract still cascades: the FK cascade runs as the system
create or replace function contracts_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('signed', 'completed') then raise exception 'a signed contract cannot be deleted'; end if;
  perform set_config('hamsha.sys', '1', true);
  delete from contract_versions where contract_id = old.id;
  perform set_config('hamsha.sys', '', true);
  return old;
end $$;

-- ---------- RPCs ----------
/** Admin: Hawamish signs the CURRENT draft version (before sending). */
create or replace function sign_contract_first(p_version uuid, p_signature text, p_name text, p_capacity text)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; c record;
begin
  if auth.uid() is null or current_role_() is distinct from 'admin' then raise exception 'only admins sign for Hawamish'; end if;
  select id, contract_id, number, sent_at into v from contract_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select org_id, status, current_version into c from contracts where id = v.contract_id for update;   -- contract first, then the version
  perform 1 from contract_versions where id = v.id for update;
  if c.org_id is distinct from current_org() then raise exception 'not your contract'; end if;
  if c.status <> 'draft' or v.number <> c.current_version then raise exception 'only the current draft version can be signed'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then raise exception 'bad signature'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'signer name required'; end if;
  perform set_config('hamsha.sys', '1', true);
  update contract_versions set first_signature = p_signature, first_signer = trim(p_name), first_capacity = nullif(trim(coalesce(p_capacity, '')), ''), first_signed_at = now() where id = v.id;
  perform set_config('hamsha.sys', '', true);
  perform log_contract_event(v.contract_id, v.number, 'first_signed', jsonb_build_object('signer', trim(p_name)));
end $$;
revoke execute on function sign_contract_first(uuid, text, text, text) from public, anon;
grant  execute on function sign_contract_first(uuid, text, text, text) to authenticated;

/** Is the caller the counterparty of this contract? */
create or replace function is_counterparty(p_party contract_party, p_client uuid, p_creative uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
         (p_party = 'client' and current_role_() = 'client' and p_client is not null and p_client = current_client())
      or (p_party = 'creative' and current_role_() = 'creative' and p_creative is not null and p_creative = auth.uid()))
$$;
revoke execute on function is_counterparty(contract_party, uuid, uuid) from public, anon;

/** Counterparty: «فتحت العقد» — first look at the current sent version. */
create or replace function mark_contract_opened(p_version uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record; c record;
begin
  select id, contract_id into v from contract_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select * into c from contracts where id = v.contract_id for update;                      -- contract first …
  select id, contract_id, number, sent_at, opened_at into v from contract_versions where id = p_version for update;   -- … then the version, re-read after the lock
  if c.org_id is distinct from current_org() or is_counterparty(c.party, c.client_id, c.creative_id) is not true then raise exception 'not your contract'; end if;
  if c.status <> 'sent' or v.number <> c.current_version or v.sent_at is null then return; end if;
  perform set_config('hamsha.sys', '1', true);
  update contract_versions set opened_at = coalesce(opened_at, now()) where id = v.id;
  update contracts set status = 'opened' where id = c.id;
  perform set_config('hamsha.sys', '', true);
  perform log_contract_event(c.id, v.number, 'opened');
end $$;
revoke execute on function mark_contract_opened(uuid) from public, anon;
grant  execute on function mark_contract_opened(uuid) to authenticated;

/** Counterparty's ONLY decision: sign (with signature + name + capacity), ask for changes (note required) or reject. */
create or replace function decide_contract(p_version uuid, p_decision contract_decision, p_note text default null, p_signature text default null, p_name text default null, p_capacity text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v record; c record;
begin
  select id, contract_id into v from contract_versions where id = p_version;
  if v is null then raise exception 'unknown version'; end if;
  select * into c from contracts where id = v.contract_id for update;                      -- contract first …
  select id, contract_id, number, sent_at, decision into v from contract_versions where id = p_version for update;   -- … then the version, re-read after the lock
  if c.org_id is distinct from current_org() or is_counterparty(c.party, c.client_id, c.creative_id) is not true then raise exception 'not your contract'; end if;
  if c.status not in ('sent', 'opened') then raise exception 'contract is not awaiting your decision'; end if;
  if v.number <> c.current_version or v.sent_at is null then raise exception 'only the current sent version can be decided'; end if;
  if v.decision is not null then raise exception 'already decided'; end if;
  if p_decision = 'signed' then
    if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then raise exception 'signature required'; end if;
    if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'signer name required'; end if;
  elsif p_decision = 'changes' and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'say what to change';
  end if;
  perform set_config('hamsha.sys', '1', true);
  update contract_versions
     set decision = p_decision, decision_note = nullif(trim(coalesce(p_note, '')), ''),
         signature = case when p_decision = 'signed' then p_signature end,
         signer_name = case when p_decision = 'signed' then trim(p_name) end,
         signer_capacity = case when p_decision = 'signed' then nullif(trim(coalesce(p_capacity, '')), '') end,
         decided_by = auth.uid(), decided_at = now()
   where id = v.id;
  update contracts set status = p_decision::text::contract_state, decided_at = now() where id = c.id;
  perform set_config('hamsha.sys', '', true);
  perform log_contract_event(c.id, v.number, p_decision::text, jsonb_build_object('signer', trim(coalesce(p_name, ''))));
end $$;
revoke execute on function decide_contract(uuid, contract_decision, text, text, text, text) from public, anon;
grant  execute on function decide_contract(uuid, contract_decision, text, text, text, text) to authenticated;

-- ---------- clients.contract is derived from the latest client contract ----------
create or replace function contracts_sync_client() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.client_id, old.client_id); st contract_state;
begin
  if cid is null then return null; end if;
  select status into st from contracts where client_id = cid and party = 'client' order by updated_at desc limit 1;
  update clients set contract = case when st in ('signed', 'completed') then 'signed' when st in ('sent', 'opened') then 'sent' else 'draft' end::contract_status where id = cid;
  return null;
end $$;
create trigger contracts_sync_client after insert or update of status or delete on contracts
  for each row execute function contracts_sync_client();

-- ---------- RLS ----------
alter table contracts         enable row level security;
alter table contract_versions enable row level security;
alter table contract_events   enable row level security;
revoke all on contracts, contract_versions, contract_events from anon;
grant select, insert, update, delete on contracts, contract_versions to authenticated;
grant select on contract_events to authenticated;

create policy contracts_read on contracts for select
  using (can_read_contract(id));
create policy contracts_admin_write on contracts for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

create policy cversions_read on contract_versions for select
  using (can_read_contract(contract_id) and (current_role_() = 'admin' or sent_at is not null));
create policy cversions_admin_insert on contract_versions for insert
  with check (org_id = current_org() and current_role_() = 'admin');
create policy cversions_admin_delete on contract_versions for delete
  using (org_id = current_org() and current_role_() = 'admin');

create policy cevents_admin_read on contract_events for select
  using (org_id = current_org() and current_role_() = 'admin');

-- ---------- client views: no drafts, no unsent versions, no internal fields ----------
create view client_contracts with (security_invoker = false) as
  select id, client_id, number, kind, title, accent, status, current_version, sent_at, decided_at, created_at, updated_at
  from contracts
  where current_role_() = 'client' and party = 'client' and client_id = current_client() and status <> 'draft';

create view client_contract_versions with (security_invoker = false) as
  select v.id, v.contract_id, v.number, v.content, v.content_hash, v.note, v.first_signature, v.first_signer, v.first_capacity, v.first_signed_at,
         v.sent_at, v.opened_at, v.decision, v.decision_note, v.signature, v.signer_name, v.signer_capacity, v.decided_at, v.created_at
  from contract_versions v
  join contracts c on c.id = v.contract_id
  where current_role_() = 'client' and c.party = 'client' and c.client_id = current_client() and c.status <> 'draft' and v.sent_at is not null;

revoke all on client_contracts, client_contract_versions from public, anon;
grant select on client_contracts, client_contract_versions to authenticated;

-- ---------- audit + realtime ----------
create trigger contracts_audit  after insert or update or delete on contracts         for each row execute function audit();
create trigger cversions_audit  after insert or update or delete on contract_versions for each row execute function audit();
alter publication supabase_realtime add table contracts, contract_versions;

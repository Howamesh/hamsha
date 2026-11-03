-- ============================================================================================
-- Hamsha PRODUCTION — finish release 2 (3 Nov 2026). The first paste ran statement by statement (Supabase incident),
-- so its final check could not see its own temp table. Everything below is SAFE TO RE-RUN (create if not exists /
-- create or replace / drop … if exists): it completes 0015 + 0016 and then checks every object and grant.
-- Success = the row «Hamsha release 0015–0016 OK».
-- ============================================================================================
-- 0015 — trust fixes from the full council of 2 Nov 2026 (20261102-155139-d549)
-- 1. A message's time is the SERVER's time: a sender could choose created_at (e.g. far in the future) and pin their
--    message at the top of the order. The client never needs to send it.
-- 2. A stored signature must really be a PNG: the old check only looked at the «data:image/png;base64,» prefix, so a
--    direct API call could store text that no screen can show and the contract still read «signed». (A tap without
--    any stroke is stopped in the app — SignaturePad only emits after a real stroke.)
-- Front-end safe: nothing the app sends today changes. NOT VALID = old rows are not re-checked.

create or replace function messages_server_time() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  return new;
end $$;

drop trigger if exists messages_server_time on messages;
create trigger messages_server_time before insert on messages for each row execute function messages_server_time();

create or replace function is_png_data_url(t text) returns boolean
language plpgsql immutable set search_path = public as $$
declare b bytea;
begin
  if t is null or t not like 'data:image/png;base64,%' or length(t) > 400000 then return false; end if;
  b := decode(substr(t, 23), 'base64');
  -- starts like a PNG AND ends with the IEND chunk (full test 2 Nov: header + garbage passed before)
  return length(b) > 20 and substr(b, 1, 8) = '\x89504e470d0a1a0a'::bytea and substr(b, length(b) - 7, 4) = 'IEND'::bytea;
exception when others then
  return false;   -- not base64 at all
end $$;

alter table contract_versions drop constraint if exists contract_versions_first_signature_png;
alter table contract_versions add constraint contract_versions_first_signature_png check (first_signature is null or is_png_data_url(first_signature)) not valid;
alter table contract_versions drop constraint if exists contract_versions_signature_png;
alter table contract_versions add constraint contract_versions_signature_png check (signature is null or is_png_data_url(signature)) not valid;

-- =====================================================================================================
-- 0016 — «الرسائل» as an inbox (Yousef 2 Nov 2026: «المبدع يتواصل معي ومع المبدعين الثانين… وأحياناً أخلي
--        المبدع يتواصل مع أحد العملاء لو أعطيته صلاحية»). Council 🔴 20261102-213612-1eb3 (Codex corrections applied).
--   1. Private chats between two team members: channel «dm:<smaller uuid>:<larger uuid>» (lower-case, ordered).
--   2. The admin can let a creative into ONE client's chat: client_chat_members (admin writes; the creative then sees
--      that chat's whole history; removing the row closes it again).
--   3. «Read» lives on the server: chat_reads keeps, per person and chat, the time of the last message that was on
--      screen (mark_channel_read takes a MESSAGE id, never «now», and never moves back).
--   4. inbox_summary(): one row per chat the caller may open — last message, its sender, time, unread count —
--      computed by the server, so the list and the numbers never depend on what this device happened to load.
--   5. chat_people(channel): names + colours of a chat's senders (a client may not read the team's profiles).
--   6. Deleting: only your own message, or the admin in a NON-private chat. Deleting a member keeps the history.
--   7. (full test 2 Nov, Codex + Gemini) explicit grants; a client id in any letter case; a private chat whose other
--      member was deleted stays READABLE for the one left (sending is closed); inbox_summary also returns each chat's
--      title + colour and lists a client chat the creative was let into even before its first message (a creative may
--      not read that client's row in «clients»).
-- Safe to re-run. Runs after 0015.
-- =====================================================================================================

-- ---------- 2. who of the team may talk in a client's chat ----------
create table if not exists client_chat_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  granted_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, user_id)
);
alter table client_chat_members enable row level security;
grant select, insert, update, delete on client_chat_members to authenticated;   -- RLS decides who (Codex: no reliance on default grants)

create or replace function client_chat_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then raise exception 'client not in this organization'; end if;
  if not exists (select 1 from profiles where id = new.user_id and org_id = new.org_id and role = 'creative') then raise exception 'only a creative of this organization'; end if;
  new.granted_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists client_chat_members_guard on client_chat_members;
create trigger client_chat_members_guard before insert or update on client_chat_members for each row execute function client_chat_members_guard();

drop policy if exists ccm_admin on client_chat_members;
create policy ccm_admin on client_chat_members for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');
drop policy if exists ccm_self_read on client_chat_members;
create policy ccm_self_read on client_chat_members for select
  using (org_id = current_org() and user_id = auth.uid());

-- ---------- 1 + 2. channel access ----------
create or replace function can_access_channel(ch text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r user_role := current_role_(); a uuid; b uuid;
begin
  if ch = 'team' then return r in ('admin', 'creative'); end if;
  if ch ~ '^client:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return r = 'admin'
        or (r = 'client' and current_client()::text = lower(substring(ch from 8)))
        or (r = 'creative' and exists (select 1 from client_chat_members m where m.client_id = lower(substring(ch from 8))::uuid and m.user_id = auth.uid() and m.org_id = current_org()));
  end if;
  if ch ~ '^task:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return r in ('admin', 'creative') and can_read_task(substring(ch from 6)::uuid);
  end if;
  -- private: exactly «dm:<a>:<b>», lower-case, a < b, the caller is one of them, both are team of this organization
  if ch ~ '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    a := substring(ch from 4 for 36)::uuid; b := substring(ch from 41 for 36)::uuid;
    if a::text >= b::text or r not in ('admin', 'creative') or auth.uid() not in (a, b) then return false; end if;
    -- the other one is team of this organization — or was deleted (the one left keeps reading the history; dm_open() closes sending)
    return not exists (select 1 from profiles p where p.id = (case when a = auth.uid() then b else a end)
                       and not (p.org_id = current_org() and p.role in ('admin', 'creative')))
       and exists (select 1 from messages m where m.channel = ch and m.org_id = current_org()
                   union all select 1 from profiles p where p.id = (case when a = auth.uid() then b else a end));
  end if;
  return false;
end $$;
revoke execute on function can_access_channel(text) from public, anon;
grant  execute on function can_access_channel(text) to authenticated;

-- a private chat accepts NEW messages only while both members exist (a deleted member's chat is read-only)
create or replace function dm_open(ch text) returns boolean
language sql stable security definer set search_path = public as $$
  select ch not like 'dm:%' or (select count(*) from profiles p where p.id in (substring(ch from 4 for 36)::uuid, substring(ch from 41 for 36)::uuid)) = 2
$$;
revoke execute on function dm_open(text) from public, anon;
grant  execute on function dm_open(text) to authenticated;
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (org_id = current_org() and sender_id = auth.uid() and can_access_channel(channel) and dm_open(channel));

-- ---------- 6. deleting + history that outlives a deleted member ----------
drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete
  using (org_id = current_org() and can_access_channel(channel)
         and (sender_id = auth.uid() or (current_role_() = 'admin' and channel not like 'dm:%')));
alter table messages drop constraint if exists messages_sender_id_fkey;
alter table messages alter column sender_id drop not null;
alter table messages add constraint messages_sender_id_fkey foreign key (sender_id) references profiles(id) on delete set null;
create index if not exists messages_channel_time on messages (org_id, channel, created_at desc);

-- ---------- 3. read markers (server time of the last message that was on screen) ----------
create table if not exists chat_reads (
  user_id  uuid not null references profiles(id) on delete cascade,
  org_id   uuid not null references organizations(id) on delete cascade,
  channel  text not null,
  read_at  timestamptz not null,
  primary key (user_id, channel)
);
alter table chat_reads enable row level security;
grant select on chat_reads to authenticated;   -- written only by mark_channel_read()
drop policy if exists chat_reads_own on chat_reads;
create policy chat_reads_own on chat_reads for select using (user_id = auth.uid());

create or replace function mark_channel_read(p_message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null or current_org() is null then raise exception 'sign in' using errcode = '42501'; end if;
  select channel, created_at, org_id into m from messages where id = p_message;
  if m is null or m.org_id <> current_org() or not can_access_channel(m.channel) then raise exception 'not your chat' using errcode = '42501'; end if;
  insert into chat_reads (user_id, org_id, channel, read_at) values (auth.uid(), m.org_id, m.channel, m.created_at)
  on conflict (user_id, channel) do update set read_at = greatest(chat_reads.read_at, excluded.read_at);   -- never back
end $$;
revoke execute on function mark_channel_read(uuid) from public, anon;
grant  execute on function mark_channel_read(uuid) to authenticated;

-- ---------- 4. the inbox, computed by the server ----------
-- (full test 2 Nov: the first version checked access for EVERY message — 350 ms on 20,000 messages; this one lists
--  the chats by skipping through an index and checks access once per CHAT — 15 ms on the same data)
create index if not exists messages_org_channel on messages (org_id, channel);
drop function if exists inbox_summary();   -- the row shape grew (title, colour)
create or replace function inbox_summary()
returns table (channel text, last_body text, last_sender uuid, last_at timestamptz, unread int, title text, color text)
language sql stable security definer set search_path = public as $$
  with recursive chans(ch) as (
    (select m.channel from messages m where m.org_id = current_org() order by m.channel limit 1)
    union all
    select (select m.channel from messages m where m.org_id = current_org() and m.channel > c.ch order by m.channel limit 1) from chans c where c.ch is not null
  ), mine as (
    select ch from chans where ch is not null and ch not like 'task:%' and can_access_channel(ch)
    union   -- a client chat the creative was let into, before anyone wrote in it
    select 'client:' || g.client_id::text from client_chat_members g where g.user_id = auth.uid() and g.org_id = current_org()
  )
  select c.ch, left(l.body, 140), l.sender_id, l.created_at,
         (select count(*)::int from messages x where x.org_id = current_org() and x.channel = c.ch
            and x.sender_id is distinct from auth.uid()
            and x.created_at > coalesce((select r.read_at from chat_reads r where r.user_id = auth.uid() and r.channel = c.ch), '-infinity')),
         case when c.ch like 'client:%' then (select k.name from clients k where k.id::text = substring(c.ch from 8))
              when c.ch like 'dm:%' then (select p.name from profiles p where p.id::text = case when substring(c.ch from 4 for 36) = auth.uid()::text then substring(c.ch from 41 for 36) else substring(c.ch from 4 for 36) end) end,
         case when c.ch like 'client:%' then (select k.color from clients k where k.id::text = substring(c.ch from 8)) end
  from mine c
  left join lateral (select m.body, m.sender_id, m.created_at from messages m where m.org_id = current_org() and m.channel = c.ch order by m.created_at desc, m.id desc limit 1) l on true
$$;
revoke execute on function inbox_summary() from public, anon;
grant  execute on function inbox_summary() to authenticated;

-- ---------- 5. names in a chat (without opening the team's profiles to clients) ----------
create or replace function chat_people(p_channel text)
returns table (id uuid, name text, color text, role user_role)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.color, p.role from profiles p
  where can_access_channel(p_channel) and p.org_id = current_org()
    and p.id in (select distinct m.sender_id from messages m where m.org_id = current_org() and m.channel = p_channel)
$$;
revoke execute on function chat_people(text) from public, anon;
grant  execute on function chat_people(text) to authenticated;

-- realtime: a grant / removal must reach the creative's screen (Codex: a revoked chat may not stay open)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'client_chat_members') then
    alter publication supabase_realtime add table client_chat_members;
  end if;
end $$;

do $$
declare miss text := '';
begin
  if to_regclass('public.client_chat_members') is null then miss := miss || ' client_chat_members'; end if;
  if to_regclass('public.chat_reads') is null then miss := miss || ' chat_reads'; end if;
  if to_regprocedure('public.inbox_summary()') is null then miss := miss || ' inbox_summary'; end if;
  if to_regprocedure('public.mark_channel_read(uuid)') is null then miss := miss || ' mark_channel_read'; end if;
  if to_regprocedure('public.chat_people(text)') is null then miss := miss || ' chat_people'; end if;
  if to_regprocedure('public.dm_open(text)') is null then miss := miss || ' dm_open'; end if;
  if to_regprocedure('public.is_png_data_url(text)') is null then miss := miss || ' is_png_data_url'; end if;
  if not has_table_privilege('authenticated', 'public.client_chat_members', 'select') then miss := miss || ' grant:client_chat_members'; end if;
  if not has_table_privilege('authenticated', 'public.chat_reads', 'select') then miss := miss || ' grant:chat_reads'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'messages_server_time') then miss := miss || ' messages_server_time'; end if;
  if not exists (select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_insert') then miss := miss || ' messages_insert'; end if;
  if miss <> '' then raise exception 'RELEASE CHECK FAILED — missing:%', miss; end if;
end $$;
select 'Hamsha release 0015–0016 OK' as result, (select count(*) from messages) as messages, (select count(*) from profiles) as profiles, (select count(*) from clients) as clients;

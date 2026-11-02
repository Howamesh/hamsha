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
        or (r = 'client' and current_client()::text = substring(ch from 8))
        or (r = 'creative' and exists (select 1 from client_chat_members m where m.client_id = substring(ch from 8)::uuid and m.user_id = auth.uid() and m.org_id = current_org()));
  end if;
  if ch ~ '^task:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return r in ('admin', 'creative') and can_read_task(substring(ch from 6)::uuid);
  end if;
  -- private: exactly «dm:<a>:<b>», lower-case, a < b, the caller is one of them, both are team of this organization
  if ch ~ '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    a := substring(ch from 4 for 36)::uuid; b := substring(ch from 41 for 36)::uuid;
    if a::text >= b::text or r not in ('admin', 'creative') or auth.uid() not in (a, b) then return false; end if;
    return (select count(*) from profiles p where p.id in (a, b) and p.org_id = current_org() and p.role in ('admin', 'creative')) = 2;
  end if;
  return false;
end $$;
revoke execute on function can_access_channel(text) from public, anon;
grant  execute on function can_access_channel(text) to authenticated;

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
create or replace function inbox_summary()
returns table (channel text, last_body text, last_sender uuid, last_at timestamptz, unread int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct m.channel from messages m where m.org_id = current_org() and can_access_channel(m.channel) and m.channel not like 'task:%'
  ), last as (
    select distinct on (m.channel) m.channel, m.body, m.sender_id, m.created_at
    from messages m join mine using (channel) where m.org_id = current_org()
    order by m.channel, m.created_at desc, m.id desc
  )
  select l.channel, left(l.body, 140), l.sender_id, l.created_at,
         (select count(*)::int from messages x where x.org_id = current_org() and x.channel = l.channel
            and x.sender_id is distinct from auth.uid()
            and x.created_at > coalesce((select r.read_at from chat_reads r where r.user_id = auth.uid() and r.channel = l.channel), '-infinity'))
  from last l
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

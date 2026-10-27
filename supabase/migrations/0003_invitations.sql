-- ============================================================================
-- Hamsha — invitations (invite-only membership)
-- Nobody gets a profile by signing up: an admin records an invitation (invite_user), the person is
-- invited through Supabase Auth (dashboard "Invite user" today, an Edge Function later), and when
-- auth.users receives the new row the trigger below creates profiles + user_settings FROM THE
-- INVITATION ONLY. No open invitation → the sign-up is rejected (fail closed).
-- Public sign-ups must also be disabled in the Supabase dashboard (Authentication → Providers).
-- ============================================================================

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),  -- shape only; Supabase Auth validates the address
  role        user_role not null,
  client_id   uuid references clients(id) on delete cascade,   -- required for role = client, forbidden otherwise
  name        text,
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  check ((role = 'client') = (client_id is not null))
);
-- one OPEN invitation per e-mail, across organizations (an auth user = one e-mail = one profile)
create unique index invitations_open_email on invitations (email) where accepted_at is null;
-- one member per e-mail, across organizations
create unique index profiles_email on profiles (lower(email));

create or replace function invitations_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not exists (select 1 from clients where id = new.client_id and org_id = new.org_id) then
    raise exception 'client outside organization';
  end if;
  return new;
end $$;
create trigger invitations_consistency before insert or update on invitations
  for each row execute function invitations_consistency();

-- ---------- access: admins of the organization only ----------
alter table invitations enable row level security;
revoke all on invitations from anon;
grant select, insert, update, delete on invitations to authenticated;
create policy invitations_admin on invitations for all
  using (org_id = current_org() and current_role_() = 'admin')
  with check (org_id = current_org() and current_role_() = 'admin');

-- ---------- invite_user(): the validated way to record an invitation ----------
create or replace function invite_user(p_email text, p_role user_role, p_client_id uuid default null, p_name text default null)
returns invitations
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); inv invitations;
begin
  if current_role_() is distinct from 'admin' then
    raise exception 'only admins can invite' using errcode = '42501';
  end if;
  if (p_role = 'client') <> (p_client_id is not null) then
    raise exception 'a client invitation needs a client; team invitations must not have one';
  end if;
  if p_client_id is not null and not exists (select 1 from clients where id = p_client_id and org_id = current_org()) then
    raise exception 'client outside organization';
  end if;
  if exists (select 1 from profiles where lower(email) = v_email) then
    raise exception 'already a member';
  end if;
  -- an open invitation from ANOTHER organization is never silently taken over
  if exists (select 1 from invitations where email = v_email and accepted_at is null and org_id <> current_org()) then
    raise exception 'already invited by another organization';
  end if;
  insert into invitations (org_id, email, role, client_id, name, invited_by)
  values (current_org(), v_email, p_role, p_client_id, nullif(trim(p_name), ''), auth.uid())
  on conflict (email) where accepted_at is null do update
    set role = excluded.role, client_id = excluded.client_id, name = excluded.name,
        invited_by = excluded.invited_by, expires_at = now() + interval '7 days'
  returning * into inv;
  return inv;
end $$;
revoke execute on function invite_user(text, user_role, uuid, text) from public, anon;
grant  execute on function invite_user(text, user_role, uuid, text) to authenticated;

-- ---------- handle_new_user(): auth.users → profiles + user_settings, from the invitation only ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  select * into inv from invitations
    where email = lower(new.email) and accepted_at is null and expires_at > now()
    order by created_at desc limit 1
    for update;
  if inv.id is null then
    raise exception 'no open invitation for %', new.email;
  end if;
  insert into profiles (id, org_id, role, name, email, client_id)
    values (new.id, inv.org_id, inv.role, coalesce(inv.name, split_part(new.email, '@', 1)), lower(new.email), inv.client_id);
  insert into user_settings (user_id) values (new.id);
  update invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;
-- Only the auth system fires this (Supabase runs auth.users triggers as supabase_auth_admin).
revoke execute on function handle_new_user() from public, anon, authenticated;
grant  execute on function handle_new_user() to supabase_auth_admin;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

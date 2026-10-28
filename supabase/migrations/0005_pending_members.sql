-- 0005 — «الدعوات المعلّقة»: members who were invited but have not set a password yet (2026-10-28).
-- Supabase Auth creates the auth.users row at invitation time; the profile is created by handle_new_user()
-- right then. "Pending" = invited AND no password chosen yet (opening the e-mail link already confirms the
-- e-mail, so email_confirmed_at is NOT the signal — the password is; Codex review 2026-10-28).
-- Admins only, own organization only; the function is the only way the app reads auth.users.
create or replace function pending_members()
returns table (id uuid, email text, name text, role user_role, client_id uuid, invited_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.email, p.name, p.role, p.client_id, u.invited_at
  from profiles p
  join auth.users u on u.id = p.id
  where current_role_() = 'admin'
    and p.org_id = current_org()
    and u.invited_at is not null
    and coalesce(u.encrypted_password, '') = ''
  order by u.invited_at desc nulls last, p.email
$$;
revoke execute on function pending_members() from public, anon;
grant  execute on function pending_members() to authenticated;

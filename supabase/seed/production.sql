-- Production seed — run ONCE in the SQL editor of the real project, after the migrations.
-- 1. Replace <ADMIN-EMAIL> and <ADMIN-NAME> below (the manager's / Yousef's work e-mail).
-- 2. Run this file.
-- 3. Supabase dashboard → Authentication → Users → "Invite user" with the SAME e-mail.
--    The on_auth_user_created trigger turns that invitation into the first admin profile.
-- 4. Every later member: select invite_user('<email>', '<role>', '<client-id or null>', '<name>') in the SQL editor
--    (the admin UI for it comes later) + the same dashboard "Invite user" step.
insert into organizations (id, name) values ('10000000-0000-0000-0000-00000000a001', 'هوامش');

insert into invitations (org_id, email, role, name, expires_at)
values ('10000000-0000-0000-0000-00000000a001', lower('<ADMIN-EMAIL>'), 'admin', '<ADMIN-NAME>', now() + interval '30 days');

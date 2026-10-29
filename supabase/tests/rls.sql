-- Expectations describe the SECURE behaviour. Running this on the ORIGINAL policies must FAIL the lines marked [LAB-249]/[LAB-250]/[extra].
truncate t.results;
\set A 00000000-0000-0000-0000-00000000000a
\set C1 00000000-0000-0000-0000-0000000000c1
\set C2 00000000-0000-0000-0000-0000000000c2
\set K1 00000000-0000-0000-0000-0000000000e1
\set K2 00000000-0000-0000-0000-0000000000e2
\set T1 40000000-0000-0000-0000-000000000001
\set T2 40000000-0000-0000-0000-000000000002
\set ORG 10000000-0000-0000-0000-000000000001

-- ===== admin: sees everything in the org =====
select t.run('admin reads all tasks', :'A', 'select * from tasks', 'rows:2');
select t.run('admin reads all parts', :'A', 'select * from task_parts', 'rows:3');
select t.run('admin reads task chat', :'A', 'select * from messages where channel like ''task:%''', 'rows:1');
select t.run('admin updates task dates', :'A', 'update tasks set end_date = ''2026-10-26'' where id = ' || quote_literal(:'T1'), 'rows:1');

-- ===== creative 1 (owner of T1) =====
select t.run('creative1 sees only T1', :'C1', 'select * from tasks', 'rows:1');
select t.run('creative1 cannot see T2', :'C1', 'select * from tasks where id = ' || quote_literal(:'T2'), 'none');
select t.run('creative1 marks own part done', :'C1', 'update task_parts set done = true where id = ''50000000-0000-0000-0000-000000000001''', 'rows:1');
select t.run('creative1 cannot change part hours', :'C1', 'update task_parts set hours = 9 where id = ''50000000-0000-0000-0000-000000000001''', 'error');
select t.run('creative1 cannot move task dates', :'C1', 'update tasks set start_date = ''2026-10-19'' where id = ' || quote_literal(:'T1'), 'error');
select t.run('creative1 sends T1 for approval', :'C1', 'update tasks set approval = ''pending'' where id = ' || quote_literal(:'T1'), 'rows:1');
select t.run('creative1 reads T1 task chat', :'C1', 'select * from messages where channel = ''task:'' || ' || quote_literal(:'T1'), 'rows:1');
select t.run('creative1 posts in team chat', :'C1', 'insert into messages (org_id, channel, sender_id, body) values (' || quote_literal(:'ORG') || ', ''team'', ' || quote_literal(:'C1') || ', ''x'')', 'rows:1');
select t.run('creative1 cannot post in client chat', :'C1', 'insert into messages (org_id, channel, sender_id, body) values (' || quote_literal(:'ORG') || ', ''client:20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'C1') || ', ''x'')', 'error');

select t.run('[extra] creative1 cannot change task created_at', :'C1', 'update tasks set created_at = ''2000-01-01'' where id = ' || quote_literal(:'T1'), 'error');
select t.run('[extra] creative1 forging done_at is ignored (update accepted)', :'C1', 'update task_parts set done_at = ''2000-01-01'' where id = ''50000000-0000-0000-0000-000000000001''', 'rows:1');
select t.run('[extra] forged done_at was not stored', :'A', 'select 1 from task_parts where id = ''50000000-0000-0000-0000-000000000001'' and done_at = ''2000-01-01''', 'none');
select t.run('[extra] creative1 reads only clients of own tasks', :'C1', 'select * from clients', 'rows:1');
select t.run('[extra] creative1 reads only projects of own tasks', :'C1', 'select * from projects', 'rows:1');

-- ===== creative 2 (not involved in T1) =====
select t.run('[extra] creative2 cannot send T1 for approval', :'C2', 'update tasks set approval = ''pending'' where id = ' || quote_literal(:'T1'), 'none');
select t.run('creative2 cannot mark T1 part done', :'C2', 'update task_parts set done = true where id = ''50000000-0000-0000-0000-000000000002''', 'none');

-- ===== client 1 =====
select t.run('[LAB-249] client cannot read tasks table at all', :'K1', 'select * from tasks', 'none');
select t.run('[LAB-249] client cannot read task description', :'K1', 'select description from tasks where description is not null', 'none');
select t.run('[LAB-249] client cannot read task_parts table (hours/people)', :'K1', 'select hours, assignee_id from task_parts', 'none');
select t.run('[LAB-249] client reads own task summary view', :'K1', 'select title, type, end_date from client_tasks', 'rows:1');
select t.run('[LAB-249] client reads own steps view (label/done only)', :'K1', 'select label, done from client_task_parts', 'rows:2');
select t.run('client view hides other clients', :'K1', 'select * from client_tasks where id = ' || quote_literal(:'T2'), 'none');
select t.run('[LAB-250] client cannot read task chat', :'K1', 'select * from messages where channel like ''task:%''', 'none');
select t.run('[LAB-250] client cannot post in task chat', :'K1', 'insert into messages (org_id, channel, sender_id, body) values (' || quote_literal(:'ORG') || ', ''task:'' || ' || quote_literal(:'T1') || ', ' || quote_literal(:'K1') || ', ''x'')', 'error');
select t.run('client cannot read team chat', :'K1', 'select * from messages where channel = ''team''', 'none');
select t.run('client cannot post in team chat', :'K1', 'insert into messages (org_id, channel, sender_id, body) values (' || quote_literal(:'ORG') || ', ''team'', ' || quote_literal(:'K1') || ', ''x'')', 'error');
select t.run('client reads own client chat', :'K1', 'select * from messages where channel = ''client:20000000-0000-0000-0000-000000000001''', 'rows:1');
select t.run('client posts in own client chat', :'K1', 'insert into messages (org_id, channel, sender_id, body) values (' || quote_literal(:'ORG') || ', ''client:20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'K1') || ', ''x'')', 'rows:1');
select t.run('client cannot read other client chat', :'K1', 'select * from messages where channel = ''client:20000000-0000-0000-0000-000000000002''', 'none');
select t.run('client reads own client row only', :'K1', 'select * from clients', 'rows:1');
select t.run('client reads own projects only', :'K1', 'select * from projects', 'rows:1');
select t.run('client sees admins but not creatives', :'K1', 'select * from profiles where role = ''creative''', 'none');
select t.run('client cannot update a task', :'K1', 'update tasks set title = ''x'' where id = ' || quote_literal(:'T1'), 'none');
select t.run('client cannot insert a task', :'K1', 'insert into tasks (org_id, client_id, project_id, title, start_date, end_date) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''x'', ''2026-10-20'', ''2026-10-21'')', 'error');
select t.run('client cannot read audit log', :'K1', 'select * from audit_events', 'none');
select t.run('[extra] client cannot change own email', :'K1', 'update profiles set email = ''hacker@evil'' where id = ' || quote_literal(:'K1'), 'error');
select t.run('[extra] client cannot change own role', :'K1', 'update profiles set role = ''admin'' where id = ' || quote_literal(:'K1'), 'error');
select t.run('client cannot read attachments', :'K1', 'select * from attachments', 'none');

-- ===== client 2 cannot see client 1 anything =====
select t.run('client2 view shows only own tasks', :'K2', 'select * from client_tasks', 'rows:1');
select t.run('client2 cannot read client1 chat', :'K2', 'select * from messages where channel = ''client:20000000-0000-0000-0000-000000000001''', 'none');

-- ===== anonymous =====
select t.run('anon reads nothing from tasks', null, 'select * from tasks', 'none');
select t.run('anon reads nothing from client view', null, 'select * from client_tasks', 'none');
select t.run('anon reads nothing from profiles', null, 'select * from profiles', 'none');
select t.run('[extra] anon cannot call can_read_task()', null, 'select can_read_task(' || quote_literal(:'T1') || ')', 'error');


-- ===== invitations (0003): invite-only membership =====
select t.run('[inv] admin invites a creative', :'A', 'select invite_user(''New.Creative@Test'', ''creative'', null, ''مبدع جديد'')', 'rows:1');
select t.run('[inv] admin invites a client user for client 1', :'A', 'select invite_user(''newclient@test'', ''client'', ''20000000-0000-0000-0000-000000000001'', null)', 'rows:1');
select t.run('[inv] client invitation without a client is rejected', :'A', 'select invite_user(''x@test'', ''client'', null, null)', 'error');
select t.run('[inv] team invitation with a client is rejected', :'A', 'select invite_user(''y@test'', ''creative'', ''20000000-0000-0000-0000-000000000001'', null)', 'error');
select t.run('[inv] inviting an existing member is rejected', :'A', 'select invite_user(''c1@test'', ''creative'', null, null)', 'error');
select t.run('[inv] bad e-mail is rejected', :'A', 'select invite_user(''not-an-email'', ''creative'', null, null)', 'error');
select t.run('[inv] re-inviting the same e-mail updates the open invitation (still one row)', :'A', 'select invite_user(''new.creative@test'', ''creative'', null, ''اسم محدث'')', 'rows:1');
select t.run('[inv] admin sees the org invitations', :'A', 'select * from invitations', 'rows:2');
select t.run('[inv] creative cannot invite', :'C1', 'select invite_user(''z@test'', ''creative'', null, null)', 'error');
select t.run('[inv] client cannot invite', :'K1', 'select invite_user(''z@test'', ''creative'', null, null)', 'error');
select t.run('[inv] creative cannot read invitations', :'C1', 'select * from invitations', 'none');
select t.run('[inv] client cannot read invitations', :'K1', 'select * from invitations', 'none');
select t.run('[inv] creative cannot insert an invitation directly', :'C1', 'insert into invitations (org_id, email, role) values (' || quote_literal(:'ORG') || ', ''w@test'', ''admin'')', 'error');
select t.run('[inv] anon cannot call invite_user', null, 'select invite_user(''z@test'', ''creative'', null, null)', 'error');
-- the auth system creates users: only invited e-mails get a profile
select t.run_su('[inv] invited e-mail signs up → accepted', 'insert into auth.users (id, email, invited_at) values (''00000000-0000-0000-0000-0000000000d1'', ''New.Creative@test'', now())', 'rows:1');
select t.run('[inv] …and gets a creative profile with the invited name', :'A', 'select 1 from profiles where id = ''00000000-0000-0000-0000-0000000000d1'' and role = ''creative'' and name = ''اسم محدث'' and email = ''new.creative@test''', 'rows:1');
select t.run_su('[inv] …and private settings (owner check: settings are private even from admins)', 'select 1 from user_settings where user_id = ''00000000-0000-0000-0000-0000000000d1''', 'rows:1');
select t.run('[inv] admin cannot read another user''s private settings', :'A', 'select 1 from user_settings where user_id = ''00000000-0000-0000-0000-0000000000d1''', 'none');
select t.run('[inv] …and the invitation is marked accepted', :'A', 'select 1 from invitations where email = ''new.creative@test'' and accepted_at is not null', 'rows:1');
select t.run_su('[inv] uninvited e-mail cannot sign up', 'insert into auth.users (id, email) values (''00000000-0000-0000-0000-0000000000d2'', ''stranger@test'')', 'error');
select t.run('[inv] …and has no profile', :'A', 'select 1 from profiles where id = ''00000000-0000-0000-0000-0000000000d2''', 'none');
select t.run_su('[inv] an accepted invitation cannot be reused', 'insert into auth.users (id, email) values (''00000000-0000-0000-0000-0000000000d3'', ''new.creative@test'')', 'error');
select t.run_su('[inv] (setup) expire the client invitation', 'update invitations set expires_at = now() - interval ''1 minute'' where email = ''newclient@test''', 'rows:1');
select t.run_su('[inv] expired invitation cannot sign up', 'insert into auth.users (id, email) values (''00000000-0000-0000-0000-0000000000d4'', ''newclient@test'')', 'error');
select t.run('[inv] admin re-invites (resets expiry)', :'A', 'select invite_user(''newclient@test'', ''client'', ''20000000-0000-0000-0000-000000000001'', ''عميل جديد'')', 'rows:1');
select t.run_su('[inv] client user signs up after re-invite', 'insert into auth.users (id, email, invited_at) values (''00000000-0000-0000-0000-0000000000d5'', ''newclient@test'', now())', 'rows:1');
select t.run('[inv] …linked to client 1 as role client', :'A', 'select 1 from profiles where id = ''00000000-0000-0000-0000-0000000000d5'' and role = ''client'' and client_id = ''20000000-0000-0000-0000-000000000001''', 'rows:1');
select t.run('[inv] new client user sees only own task view', '00000000-0000-0000-0000-0000000000d5', 'select * from client_tasks', 'rows:1');
select t.run('[inv] new creative sees no tasks yet', '00000000-0000-0000-0000-0000000000d1', 'select * from tasks', 'none');


-- ===== social posts (0007): frozen versions, client decides only the current one =====
\set P1 60000000-0000-0000-0000-000000000001
\set P2 60000000-0000-0000-0000-000000000002
\set V1 70000000-0000-0000-0000-000000000001
\set V2 70000000-0000-0000-0000-000000000002
\set V3 70000000-0000-0000-0000-000000000003
select t.run('[soc] admin creates post P1 for client 1', :'A', 'insert into posts (id, org_id, client_id, task_id, title, platform, format) values (' || quote_literal(:'P1') || ', ' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'T1') || ', ''بوست الصدقة'', ''instagram'', ''portrait'')', 'rows:1');
select t.run('[soc] …born as an empty draft even if the insert claims otherwise', :'A', 'insert into posts (id, org_id, client_id, title, status, current_version) values (' || quote_literal(:'P2') || ', ' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''بوست ثاني'', ''approved'', 9) returning 1', 'rows:1');
select t.run('[soc] …status draft / version 0 were forced', :'A', 'select 1 from posts where id = ' || quote_literal(:'P2') || ' and status = ''draft'' and current_version = 0', 'rows:1');
select t.run('[soc] post for a task of another client is rejected', :'A', 'insert into posts (org_id, client_id, task_id, title) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'T2') || ', ''x'')', 'error');
select t.run('[soc] creative1 (works with client 1) creates a post', :'C1', 'insert into posts (org_id, client_id, title) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''بوست المبدع'')', 'rows:1');
select t.run('[soc] creative2 (no task with client 1) cannot', :'C2', 'insert into posts (org_id, client_id, title) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''x'')', 'error');
select t.run('[soc] client cannot insert a post', :'K1', 'insert into posts (org_id, client_id, title) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''x'')', 'error');
select t.run('[soc] admin cannot send a post with no version', :'A', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'error');
select t.run('[soc] admin uploads version 1 of P1 (number is assigned by the DB)', :'A', 'insert into post_versions (id, org_id, post_id, number, image_paths, caption, note) values (' || quote_literal(:'V1') || ', ' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', 77, array[''org/c1/p1/1.png''], ''نص المنشور'', ''ملاحظة داخلية للعميل'')', 'rows:1');
select t.run('[soc] …it is number 1 and the post points at it', :'A', 'select 1 from post_versions v join posts p on p.id = v.post_id where v.id = ' || quote_literal(:'V1') || ' and v.number = 1 and p.current_version = 1 and p.status = ''draft''', 'rows:1');
select t.run('[soc] creative1 uploads a version to P1 (involved via T1)', :'C1', 'insert into post_versions (org_id, post_id, image_paths, caption) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''org/c1/p1/2a.png'', ''org/c1/p1/2b.png''], ''v2'')', 'rows:1');
select t.run('[soc] creative2 cannot upload to P1', :'C2', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''x.png''])', 'error');
select t.run('[soc] client cannot upload a version', :'K1', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''x.png''])', 'error');
select t.run('[soc2] a version with no image is rejected', :'A', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', ''{}'')', 'error');
select t.run('[soc2] a version with 21 images is rejected (carousel max 20)', :'A', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', (select array_agg(''org/c1/p1/'' || g || ''.png'') from generate_series(1, 21) g))', 'error');
select t.run('[soc2] a version with an empty path is rejected', :'A', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''ok.png'', ''''])', 'error');
select t.run('[soc] creative1 cannot send to the client', :'C1', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'none');
select t.run('[soc] creative1 cannot edit a frozen version', :'C1', 'update post_versions set caption = ''x'' where post_id = ' || quote_literal(:'P1'), 'none');
select t.run('[soc] admin cannot edit a frozen version either (no update policy)', :'A', 'update post_versions set caption = ''x'' where id = ' || quote_literal(:'V1'), 'none');
select t.run('[soc] admin cannot forge current_version', :'A', 'update posts set current_version = 1 where id = ' || quote_literal(:'P1'), 'error');
select t.run('[soc] creative2 sees no posts', :'C2', 'select * from posts', 'none');
select t.run('[soc] creative1 sees the client-1 posts', :'C1', 'select * from posts', 'rows:3');
select t.run('[soc] client cannot read the posts table', :'K1', 'select * from posts', 'none');
select t.run('[soc] client cannot read the versions table', :'K1', 'select * from post_versions', 'none');
select t.run('[soc2] client sees NO drafts in the posts view (3 drafts exist)', :'K1', 'select * from client_posts', 'none');
select t.run('[soc2] client sees NO unsent versions', :'K1', 'select * from client_post_versions', 'none');
select t.run('[soc] client view has no people column', :'K1', 'select created_by from client_post_versions', 'error');
select t.run('[soc] client2 sees nothing of client 1', :'K2', 'select * from client_posts', 'none');
select t.run('[soc] client cannot decide a draft', :'K1', 'select decide_post(' || quote_literal(:'V1') || ', ''approved'')', 'error');
select t.run('[soc] admin sends P1 (v2) to the client', :'A', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'rows:1');
select t.run('[soc] …sent_at was stamped', :'A', 'select 1 from posts where id = ' || quote_literal(:'P1') || ' and sent_at is not null', 'rows:1');
select t.run('[soc2] …and version 2 carries sent_at, version 1 does not', :'A', 'select 1 from post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2 and sent_at is not null and exists (select 1 from post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 1 and sent_at is null)', 'rows:1');
select t.run('[soc2] client now sees exactly the sent post', :'K1', 'select * from client_posts', 'rows:1');
select t.run('[soc2] client sees only the sent version (v2), never v1', :'K1', 'select 1 from client_post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2 and exists (select 1 from client_post_versions where post_id = ' || quote_literal(:'P1') || ') and not exists (select 1 from client_post_versions where number = 1)', 'rows:1');
select t.run('[soc2] client version view carries the ordered image set', :'K1', 'select 1 from client_post_versions where number = 2 and image_paths = array[''org/c1/p1/2a.png'', ''org/c1/p1/2b.png'']', 'rows:1');
select t.run('[soc2] admin withdraws P1 → the post hides from the client again', :'A', 'update posts set status = ''draft'' where id = ' || quote_literal(:'P1'), 'rows:1');
select t.run('[soc2] …client sees nothing while withdrawn', :'K1', 'select * from client_posts', 'none');
select t.run('[soc2] …nor its versions', :'K1', 'select * from client_post_versions', 'none');
select t.run('[soc2] admin re-sends P1', :'A', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'rows:1');
select t.run('[soc] admin cannot jump sent → published', :'A', 'update posts set status = ''published'', published_url = ''https://x'' where id = ' || quote_literal(:'P1'), 'error');
select t.run('[soc] client2 cannot decide client-1 post', :'K2', 'select decide_post((select id from post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2), ''approved'')', 'error');
select t.run('[soc] admin cannot decide for the client', :'A', 'select decide_post((select id from post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2), ''approved'')', 'error');
select t.run('[soc] client cannot decide the OLD version 1', :'K1', 'select decide_post(' || quote_literal(:'V1') || ', ''approved'')', 'error');
select t.run('[soc] «يبي تعديل» without a note is rejected', :'K1', 'select decide_post((select id from client_post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2), ''changes'', ''  '')', 'error');
select t.run('[soc] client asks for changes with a note', :'K1', 'select decide_post((select id from client_post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2), ''changes'', ''كبّر الشعار'')', 'rows:1');
select t.run('[soc] …post is in «changes» and the note is on version 2', :'A', 'select 1 from posts p join post_versions v on v.post_id = p.id and v.number = 2 where p.id = ' || quote_literal(:'P1') || ' and p.status = ''changes'' and v.decision = ''changes'' and v.decision_note = ''كبّر الشعار'' and v.decided_by = ' || quote_literal(:'K1'), 'rows:1');
select t.run('[soc] client cannot decide twice', :'K1', 'select decide_post((select id from client_post_versions where post_id = ' || quote_literal(:'P1') || ' and number = 2), ''approved'')', 'error');
select t.run('[soc] admin cannot resend the same version after changes', :'A', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'error');
select t.run('[soc] admin uploads version 3', :'A', 'insert into post_versions (id, org_id, post_id, image_paths, caption) values (' || quote_literal(:'V3') || ', ' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''org/c1/p1/3.png''], ''v3'')', 'rows:1');
select t.run('[soc] …post back to draft at version 3, old decision untouched', :'A', 'select 1 from posts p where p.id = ' || quote_literal(:'P1') || ' and p.status = ''draft'' and p.current_version = 3 and p.sent_at is null and exists (select 1 from post_versions where post_id = p.id and number = 2 and decision = ''changes'')', 'rows:1');
select t.run('[soc2] new unsent version 3: the client sees nothing of P1 again', :'K1', 'select * from client_post_versions where post_id = ' || quote_literal(:'P1'), 'none');
select t.run('[soc2] client cannot decide the unsent version 3', :'K1', 'select decide_post(' || quote_literal(:'V3') || ', ''approved'')', 'error');
select t.run('[soc] admin sends version 3', :'A', 'update posts set status = ''sent'' where id = ' || quote_literal(:'P1'), 'rows:1');
select t.run('[soc2] client sees the sent versions 2 and 3, still not v1', :'K1', 'select * from client_post_versions where post_id = ' || quote_literal(:'P1'), 'rows:2');
select t.run('[soc] client approves version 3', :'K1', 'select decide_post(' || quote_literal(:'V3') || ', ''approved'')', 'rows:1');
select t.run('[soc] admin cannot publish without a link', :'A', 'update posts set status = ''published'' where id = ' || quote_literal(:'P1'), 'error');
select t.run('[soc] admin publishes with the live link', :'A', 'update posts set status = ''published'', published_url = ''https://instagram.com/p/abc'' where id = ' || quote_literal(:'P1'), 'rows:1');
select t.run('[soc] client sees the published link in the archive view', :'K1', 'select 1 from client_posts where id = ' || quote_literal(:'P1') || ' and status = ''published'' and published_url = ''https://instagram.com/p/abc'' and published_at is not null', 'rows:1');
select t.run('[soc] a published post cannot get a new version', :'A', 'insert into post_versions (org_id, post_id, image_paths) values (' || quote_literal(:'ORG') || ', ' || quote_literal(:'P1') || ', array[''x.png''])', 'error');
select t.run('[soc] creative cannot delete a post', :'C1', 'delete from posts where id = ' || quote_literal(:'P2'), 'none');
select t.run('[soc] client cannot delete a post', :'K1', 'delete from posts where id = ' || quote_literal(:'P2'), 'none');
select t.run('[soc] anon reads nothing from client_posts', null, 'select * from client_posts', 'none');
select t.run('[soc] anon cannot call decide_post', null, 'select decide_post(' || quote_literal(:'V3') || ', ''approved'')', 'error');
select t.run('[soc] admin deletes P2 (versions cascade)', :'A', 'delete from posts where id = ' || quote_literal(:'P2'), 'rows:1');

-- ===== client accounts (0008): the real account behind the preview =====
\set AC1 80000000-0000-0000-0000-000000000001
\set AC2 80000000-0000-0000-0000-000000000002
select t.run('[acc] admin adds an Instagram account for client 1 (@ is stripped)', :'A', 'insert into client_accounts (id, org_id, client_id, platform, handle, display_name, bio) values (' || quote_literal(:'AC1') || ', ' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''instagram'', ''@sana.sa'', ''سنا'', ''بطاقات أعمال ذكية'')', 'rows:1');
select t.run('[acc] …stored without the @', :'A', 'select 1 from client_accounts where id = ' || quote_literal(:'AC1') || ' and handle = ''sana.sa''', 'rows:1');
select t.run('[acc] admin adds an X account for client 2', :'A', 'insert into client_accounts (id, org_id, client_id, platform, handle, display_name) values (' || quote_literal(:'AC2') || ', ' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000002'', ''x'', ''client2'', ''عميل ٢'')', 'rows:1');
select t.run('[acc] a handle with spaces is rejected', :'A', 'insert into client_accounts (org_id, client_id, platform, handle, display_name) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''tiktok'', ''bad handle'', ''x'')', 'error');
select t.run('[acc] the same handle twice on one platform is rejected', :'A', 'insert into client_accounts (org_id, client_id, platform, handle, display_name) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''instagram'', ''sana.sa'', ''x'')', 'error');
select t.run('[acc] creative1 (works with client 1) reads its accounts', :'C1', 'select * from client_accounts', 'rows:1');
select t.run('[acc] creative1 cannot add an account', :'C1', 'insert into client_accounts (org_id, client_id, platform, handle, display_name) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''tiktok'', ''c1'', ''x'')', 'error');
select t.run('[acc] creative2 sees nothing of client 1', :'C2', 'select * from client_accounts where client_id = ''20000000-0000-0000-0000-000000000001''', 'none');
select t.run('[acc] client 1 reads own account only', :'K1', 'select * from client_accounts', 'rows:1');
select t.run('[acc] client cannot change own handle', :'K1', 'update client_accounts set handle = ''hacked'' where id = ' || quote_literal(:'AC1'), 'none');
select t.run('[acc] client cannot add an account', :'K1', 'insert into client_accounts (org_id, client_id, platform, handle, display_name) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ''tiktok'', ''k1'', ''x'')', 'error');
select t.run('[acc] anon reads nothing', null, 'select * from client_accounts', 'none');
select t.run('[acc] a post may use an account of its client + platform', :'A', 'insert into posts (org_id, client_id, account_id, title, platform) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'AC1') || ', ''بوست بحساب'', ''instagram'')', 'rows:1');
select t.run('[acc] a post cannot use another client''s account', :'A', 'insert into posts (org_id, client_id, account_id, title, platform) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'AC2') || ', ''x'', ''x'')', 'error');
select t.run('[acc] a post cannot use an account of another platform', :'A', 'insert into posts (org_id, client_id, account_id, title, platform) values (' || quote_literal(:'ORG') || ', ''20000000-0000-0000-0000-000000000001'', ' || quote_literal(:'AC1') || ', ''x'', ''tiktok'')', 'error');
select t.run('[acc] admin deletes the account → the post keeps living without one', :'A', 'delete from client_accounts where id = ' || quote_literal(:'AC1'), 'rows:1');
select t.run('[acc] …account_id was cleared', :'A', 'select 1 from posts where title = ''بوست بحساب'' and account_id is null', 'rows:1');
select t.run('[acc] admin deletes the test post', :'A', 'delete from posts where title = ''بوست بحساب''', 'rows:1');

-- ===== 0004: atomic RPCs + chat cleanup =====
select t.run('[rpc] admin creates client + first project in one call', :'A', 'select create_client(''عميل ٣'', ''مشروع افتتاحي'', ''#4CB782'')', 'rows:1');
select t.run('[rpc] …the project exists', :'A', 'select 1 from projects p join clients c on c.id = p.client_id where c.name = ''عميل ٣'' and p.name = ''مشروع افتتاحي''', 'rows:1');
select t.run('[rpc] creative cannot create a client', :'C1', 'select create_client(''x'', ''y'')', 'error');
select t.run('[rpc] client cannot create a client', :'K1', 'select create_client(''x'', ''y'')', 'error');
select t.run('[rpc] anon cannot call create_client', null, 'select create_client(''x'', ''y'')', 'error');
select t.run('[rpc] admin creates task + first part', :'A', 'select create_task(''20000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''مهمة جديدة'', ''reel'', ''2026-11-01'', ''2026-11-03'', ' || quote_literal(:'C1') || ', null, null, null, ''كتابة'', 3, ''14:00'')', 'rows:1');
select t.run('[rpc] …its first part is on the start day for the owner', :'A', 'select 1 from task_parts p join tasks t on t.id = p.task_id where t.title = ''مهمة جديدة'' and p.day = ''2026-11-01'' and p.assignee_id = ' || quote_literal(:'C1') || ' and p.hand_off = ''14:00''', 'rows:1');
select t.run('[rpc] creative cannot create a task', :'C1', 'select create_task(''20000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''x'', ''reel'', ''2026-11-01'', ''2026-11-03'', ' || quote_literal(:'C1') || ', null, null, null, ''y'')', 'error');
select t.run('[rpc] task for a project of another client is rejected', :'A', 'select create_task(''20000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000002'', ''x'', ''reel'', ''2026-11-01'', ''2026-11-03'', null, null, null, null, ''y'')', 'error');
select t.run('[rpc] (setup) T1 has chat messages', :'A', 'select * from messages where channel = ''task:'' || ' || quote_literal(:'T1'), 'rows>0');
select t.run('[rpc] admin deletes T1', :'A', 'delete from tasks where id = ' || quote_literal(:'T1'), 'rows:1');
select t.run('[rpc] …its chat is gone with it', :'A', 'select * from messages where channel = ''task:'' || ' || quote_literal(:'T1'), 'none');
select t.run('[rpc] admin deletes client 2 (cascades T2)', :'A', 'delete from clients where id = ''20000000-0000-0000-0000-000000000002''', 'rows:1');
select t.run('[rpc] …client 2 chat and T2 chat are gone', :'A', 'select * from messages where channel in (''client:20000000-0000-0000-0000-000000000002'', ''task:'' || ' || quote_literal(:'T2') || ')', 'none');

-- ===== pending members (0005): invited but no password yet =====
select t.run('[pend] admin sees the invited-not-confirmed member', :'A', 'select 1 from pending_members() where email = ''new.creative@test'' and role = ''creative''', 'rows:1');
select t.run('[pend] …and the invited client user; nobody else', :'A', 'select * from pending_members()', 'rows:2');
select t.run('[pend] creative sees nothing', :'C1', 'select * from pending_members()', 'none');
select t.run('[pend] client sees nothing', :'K1', 'select * from pending_members()', 'none');
select t.run('[pend] anon cannot call it', null, 'select * from pending_members()', 'error');
select t.run_su('[pend] (setup) opening the link confirms the e-mail but is NOT enough', 'update auth.users set email_confirmed_at = now() where id = ''00000000-0000-0000-0000-0000000000d1''', 'rows:1');
select t.run('[pend] …still pending without a password', :'A', 'select 1 from pending_members() where email = ''new.creative@test''', 'rows:1');
select t.run_su('[pend] (setup) the member chooses a password', 'update auth.users set encrypted_password = ''x'' where id = ''00000000-0000-0000-0000-0000000000d1''', 'rows:1');
select t.run('[pend] …and leaves the pending list (only the client user remains)', :'A', 'select 1 from pending_members() where email = ''newclient@test''', 'rows:1');
select t.run('[pend] …the confirmed creative is gone', :'A', 'select 1 from pending_members() where email = ''new.creative@test''', 'none');

select * from t.report();
select count(*) filter (where not pass) as failures, count(*) as total from t.results;

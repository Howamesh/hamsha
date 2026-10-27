-- ============================================================================
-- Hamsha — atomic operations the app needs as ONE transaction, plus chat cleanup.
-- All functions here run as the caller (security invoker) so RLS still decides what is allowed.
-- ============================================================================

-- ---------- chat cleanup: a deleted task/client takes its channel with it ----------
-- (messages have no FK to tasks/clients on purpose: channels are text). Cascading deletes of
-- tasks under a client/project fire this row trigger too.
create or replace function messages_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from messages where channel = tg_argv[0] || old.id::text;
  return old;
end $$;
create trigger tasks_messages_cleanup   after delete on tasks   for each row execute function messages_cleanup('task:');
create trigger clients_messages_cleanup after delete on clients for each row execute function messages_cleanup('client:');

-- ---------- create_client: client + its first project in one transaction ----------
create or replace function create_client(p_name text, p_project_name text, p_color text default '#D9B600')
returns clients
language plpgsql security invoker set search_path = public as $$
declare c clients;
begin
  insert into clients (org_id, name, color, owner_id)
    values (current_org(), p_name, p_color, auth.uid())
    returning * into c;
  insert into projects (org_id, client_id, name, lead_id, color)
    values (c.org_id, c.id, p_project_name, auth.uid(), p_color);
  return c;
end $$;

-- ---------- create_task: task + its first part in one transaction ----------
create or replace function create_task(
  p_client_id uuid, p_project_id uuid, p_title text, p_type task_type, p_start date, p_end date,
  p_owner_id uuid, p_description text, p_reference text, p_milestone text,
  p_part_label text, p_part_hours numeric default 4, p_part_time time default null
) returns tasks
language plpgsql security invoker set search_path = public as $$
declare t tasks;
begin
  insert into tasks (org_id, client_id, project_id, title, type, start_date, end_date, owner_id, description, reference, milestone, created_by)
    values (current_org(), p_client_id, p_project_id, p_title, p_type, p_start, p_end, p_owner_id, p_description, p_reference, p_milestone, auth.uid())
    returning * into t;
  insert into task_parts (org_id, task_id, label, assignee_id, hours, day, hand_off, position)
    values (t.org_id, t.id, p_part_label, p_owner_id, p_part_hours, p_start, p_part_time, 0);
  return t;
end $$;

revoke execute on function create_client(text, text, text) from public, anon;
revoke execute on function create_task(uuid, uuid, text, task_type, date, date, uuid, text, text, text, text, numeric, time) from public, anon;
grant  execute on function create_client(text, text, text) to authenticated;
grant  execute on function create_task(uuid, uuid, text, task_type, date, date, uuid, text, text, text, text, numeric, time) to authenticated;
revoke execute on function messages_cleanup() from public, anon, authenticated;

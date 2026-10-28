-- 0006 — Storage policies BEFORE the first attachment is ever uploaded (council 2026-10-28, item 4).
-- Buckets: `client-logos` (public read: logos show on calendar cards) and `attachments` (private).
-- Object path convention: <org_id>/<anything> — the first folder is the organization.
-- Team (admin/creative) reads + writes `attachments`; clients get NO attachment access until a per-task
-- design exists (Codex review 2026-10-28). `client-logos` is public (shown to everyone on the cards).
-- Wrapped so the plain-Postgres CI (no storage schema) skips it; Supabase applies it fully.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema absent (local CI) — skipping storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-logos', 'client-logos', true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('attachments', 'attachments', false, 25 * 1024 * 1024, null)
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists hamsha_storage_read on storage.objects';
  execute $p$create policy hamsha_storage_read on storage.objects for select to authenticated
    using ((storage.foldername(name))[1] = current_org()::text
           and (bucket_id = 'client-logos' or (bucket_id = 'attachments' and current_role_() in ('admin', 'creative'))))$p$;

  execute 'drop policy if exists hamsha_storage_write on storage.objects';
  execute $p$create policy hamsha_storage_write on storage.objects for insert to authenticated
    with check (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() in ('admin', 'creative'))$p$;

  execute 'drop policy if exists hamsha_storage_update on storage.objects';
  execute $p$create policy hamsha_storage_update on storage.objects for update to authenticated
    using (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() in ('admin', 'creative'))
    with check (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() in ('admin', 'creative'))$p$;

  execute 'drop policy if exists hamsha_storage_delete on storage.objects';
  execute $p$create policy hamsha_storage_delete on storage.objects for delete to authenticated
    using (bucket_id in ('client-logos', 'attachments') and (storage.foldername(name))[1] = current_org()::text and current_role_() = 'admin')$p$;
end $$;

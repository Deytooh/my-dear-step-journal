-- Provision only if absent. Existing bucket privacy must be verified before release.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Owner RLS policies are defined in 0000_migration.sql.
-- Verify: select id, public, file_size_limit from storage.buckets where id = 'photos';

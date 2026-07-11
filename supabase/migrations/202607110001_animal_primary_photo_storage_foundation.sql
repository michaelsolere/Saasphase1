alter table public.media
  add column is_primary boolean not null default false,
  add column width_px integer,
  add column height_px integer;

alter table public.media
  add constraint media_dimensions_positive_check
    check (
      (width_px is null or width_px > 0)
      and (height_px is null or height_px > 0)
    ),
  add constraint media_primary_photo_animal_check
    check (not is_primary or animal_id is not null),
  add constraint media_primary_photo_type_check
    check (not is_primary or media_type = 'photo'),
  add constraint media_primary_photo_mime_type_check
    check (not is_primary or mime_type = 'image/webp'),
  add constraint media_primary_photo_file_metadata_check
    check (
      not is_primary
      or (
        file_size_bytes is not null
        and file_size_bytes > 0
        and width_px is not null
        and width_px > 0
        and height_px is not null
        and height_px > 0
      )
    );

create unique index media_one_active_primary_photo_per_animal_idx
  on public.media (organization_id, animal_id)
  where is_primary = true
    and deleted_at is null;

create unique index media_active_file_path_key
  on public.media (file_path)
  where deleted_at is null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'animal-media',
  'animal-media',
  false,
  2097152,
  array['image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy animal_media_objects_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'animal-media'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/animals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/primary/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  )
);

create policy animal_media_objects_insert_writer
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'animal-media'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/animals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/primary/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

create policy animal_media_objects_update_writer
on storage.objects
for update
to authenticated
using (
  bucket_id = 'animal-media'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/animals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/primary/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
)
with check (
  bucket_id = 'animal-media'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/animals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/primary/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

create policy animal_media_objects_delete_writer
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'animal-media'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/animals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/primary/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

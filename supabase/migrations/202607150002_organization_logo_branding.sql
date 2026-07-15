create table public.organization_brand_assets (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  asset_type text not null default 'logo',
  file_path text not null,
  file_sha256 text not null,
  file_size_bytes bigint not null,
  mime_type text not null,
  width_px integer not null,
  height_px integer not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  retired_at timestamptz,
  retired_by uuid references public.profiles(id),
  constraint organization_brand_assets_type_check check (asset_type = 'logo'),
  constraint organization_brand_assets_sha256_check check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint organization_brand_assets_size_check check (file_size_bytes between 1 and 524288),
  constraint organization_brand_assets_mime_check check (mime_type in ('image/png', 'image/jpeg')),
  constraint organization_brand_assets_dimensions_check check (
    width_px between 16 and 2000 and height_px between 16 and 2000
  ),
  constraint organization_brand_assets_retirement_check check (
    (retired_at is null and retired_by is null)
    or (retired_at is not null and retired_by is not null)
  ),
  constraint organization_brand_assets_path_check check (
    file_path = format(
      'organizations/%s/branding/logos/%s/%s.%s',
      organization_id,
      id,
      file_sha256,
      case mime_type when 'image/png' then 'png' else 'jpg' end
    )
  ),
  unique (file_path),
  unique (organization_id, file_sha256)
);

create unique index organization_brand_assets_one_active_logo_idx
  on public.organization_brand_assets (organization_id, asset_type)
  where retired_at is null;

create index organization_brand_assets_history_idx
  on public.organization_brand_assets (organization_id, created_at desc);

alter table public.organization_brand_assets enable row level security;

create policy organization_brand_assets_select_member
on public.organization_brand_assets
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member', 'viewer']
  )
);

revoke all on table public.organization_brand_assets from anon, authenticated;
grant select on table public.organization_brand_assets to authenticated;

create or replace function public.activate_organization_logo(
  p_organization_id uuid,
  p_asset_id uuid,
  p_file_path text,
  p_file_sha256 text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_width_px integer,
  p_height_px integer
)
returns table(outcome text, asset_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_extension text;
  v_expected_path text;
  v_existing public.organization_brand_assets%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null or not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin']
  ) then
    raise exception 'Insufficient organization permissions' using errcode = '42501';
  end if;

  if p_asset_id is null
    or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_file_size_bytes is null or p_file_size_bytes not between 1 and 524288
    or p_mime_type not in ('image/png', 'image/jpeg')
    or p_width_px is null or p_width_px not between 16 and 2000
    or p_height_px is null or p_height_px not between 16 and 2000
  then
    raise exception 'Invalid organization logo metadata' using errcode = '23514';
  end if;

  v_extension := case p_mime_type when 'image/png' then 'png' else 'jpg' end;
  v_expected_path := format(
    'organizations/%s/branding/logos/%s/%s.%s',
    p_organization_id,
    p_asset_id,
    p_file_sha256,
    v_extension
  );

  if p_file_path is distinct from v_expected_path then
    raise exception 'Organization logo path does not match metadata' using errcode = '23514';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'organization-assets' and o.name = p_file_path
  ) then
    raise exception 'Organization logo object is missing' using errcode = 'P0002';
  end if;

  select a.* into v_existing
  from public.organization_brand_assets a
  where a.id = p_asset_id;

  if found then
    if v_existing.organization_id = p_organization_id
      and v_existing.asset_type = 'logo'
      and v_existing.file_path = p_file_path
      and v_existing.file_sha256 = p_file_sha256
      and v_existing.file_size_bytes = p_file_size_bytes
      and v_existing.mime_type = p_mime_type
      and v_existing.width_px = p_width_px
      and v_existing.height_px = p_height_px
      and v_existing.created_by = v_user_id
      and v_existing.retired_at is null
    then
      return query select 'existing'::text, v_existing.id;
      return;
    end if;
    raise exception 'Organization logo intention conflicts with existing version' using errcode = '23514';
  end if;

  perform 1 from public.organizations o
  where o.id = p_organization_id and o.deleted_at is null
  for update;
  if not found then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  update public.organization_brand_assets
  set retired_at = v_now, retired_by = v_user_id
  where organization_id = p_organization_id
    and asset_type = 'logo'
    and retired_at is null;

  insert into public.organization_brand_assets (
    id, organization_id, asset_type, file_path, file_sha256,
    file_size_bytes, mime_type, width_px, height_px, created_by
  ) values (
    p_asset_id, p_organization_id, 'logo', p_file_path, p_file_sha256,
    p_file_size_bytes, p_mime_type, p_width_px, p_height_px, v_user_id
  );

  return query select 'activated'::text, p_asset_id;
end;
$$;

create or replace function public.retire_active_organization_logo(
  p_organization_id uuid
)
returns table(outcome text, asset_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset_id uuid;
begin
  if v_user_id is null or not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin']
  ) then
    raise exception 'Insufficient organization permissions' using errcode = '42501';
  end if;

  perform 1 from public.organizations o
  where o.id = p_organization_id and o.deleted_at is null
  for update;
  if not found then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  update public.organization_brand_assets
  set retired_at = statement_timestamp(), retired_by = v_user_id
  where organization_id = p_organization_id
    and asset_type = 'logo'
    and retired_at is null
  returning id into v_asset_id;

  if v_asset_id is null then
    return query select 'already_absent'::text, null::uuid;
  else
    return query select 'retired'::text, v_asset_id;
  end if;
end;
$$;

revoke all on function public.activate_organization_logo(
  uuid, uuid, text, text, bigint, text, integer, integer
) from public;
revoke all on function public.retire_active_organization_logo(uuid) from public;
grant execute on function public.activate_organization_logo(
  uuid, uuid, text, text, bigint, text, integer, integer
) to authenticated;
grant execute on function public.retire_active_organization_logo(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  false,
  524288,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy organization_assets_objects_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-assets'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/branding/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(png|jpg)$'
  and public.has_organization_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin', 'member', 'viewer']
  )
);

create policy organization_assets_objects_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-assets'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/branding/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(png|jpg)$'
  and public.has_organization_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
);

create policy organization_assets_objects_delete_unreferenced_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-assets'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/branding/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(png|jpg)$'
  and public.has_organization_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
  and not exists (
    select 1 from public.organization_brand_assets a where a.file_path = name
  )
);

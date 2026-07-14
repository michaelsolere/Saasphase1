create or replace function public.create_document_template_family_with_draft(
  p_organization_id uuid,
  p_name text,
  p_document_type text,
  p_species text,
  p_breed text,
  p_template_format text,
  p_template_content text,
  p_description text default null
)
returns table (
  family_id uuid,
  template_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid := gen_random_uuid();
  v_template_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  insert into public.document_template_families (
    id,
    organization_id,
    name,
    description,
    document_type,
    species,
    breed,
    created_by,
    updated_by
  ) values (
    v_family_id,
    p_organization_id,
    p_name,
    p_description,
    p_document_type,
    p_species,
    p_breed,
    v_user_id,
    v_user_id
  );

  insert into public.document_templates (
    id,
    organization_id,
    family_id,
    name,
    description,
    document_type,
    species,
    breed,
    template_format,
    template_content,
    version,
    lifecycle_status,
    is_active,
    created_by,
    updated_by
  ) values (
    v_template_id,
    p_organization_id,
    v_family_id,
    p_name,
    p_description,
    p_document_type,
    p_species,
    p_breed,
    p_template_format,
    p_template_content,
    1,
    'draft',
    false,
    v_user_id,
    v_user_id
  );

  return query select v_family_id, v_template_id, 1;
end
$$;

revoke all on function public.create_document_template_family_with_draft(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function public.create_document_template_family_with_draft(
  uuid, text, text, text, text, text, text, text
) to authenticated;

revoke insert on public.document_template_families from authenticated;

revoke all on function public.publish_document_template_version(uuid) from public;
drop function public.publish_document_template_version(uuid);

create function public.publish_document_template_version(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_template_format text,
  p_expected_template_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_family public.document_template_families%rowtype;
  v_template public.document_templates%rowtype;
begin
  select family.* into v_family
  from public.document_template_families family
  where family.id = (
    select dt.family_id
    from public.document_templates dt
    where dt.id = p_template_id
  )
  for update;

  if not found or v_family.deleted_at is not null then
    raise exception 'Document template family not found'
      using errcode = 'P0002';
  end if;

  if v_user_id is null or not public.has_organization_role(
    v_family.organization_id,
    array['owner', 'admin']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  select dt.* into v_template
  from public.document_templates dt
  where dt.organization_id = v_family.organization_id
    and dt.id = p_template_id
    and dt.family_id = v_family.id
  for update;

  if not found or v_template.deleted_at is not null then
    raise exception 'Document template draft not found'
      using errcode = 'P0002';
  end if;

  if v_template.updated_at is distinct from p_expected_updated_at
    or v_template.template_format is distinct from p_expected_template_format
    or v_template.template_content is distinct from p_expected_template_content
  then
    raise exception 'Document template draft is stale'
      using errcode = 'P0001';
  end if;

  if v_template.lifecycle_status <> 'draft'
    or v_template.is_active
    or (v_template.template_format = 'json' and (
      v_template.template_content is null
      or jsonb_typeof(v_template.template_content::jsonb) <> 'object'
    ))
  then
    raise exception 'Document template draft is not publishable'
      using errcode = '23514';
  end if;

  update public.document_templates
  set
    lifecycle_status = 'retired',
    is_active = false,
    updated_at = statement_timestamp(),
    updated_by = v_user_id
  where organization_id = v_family.organization_id
    and family_id = v_family.id
    and lifecycle_status = 'published'
    and deleted_at is null;

  update public.document_templates
  set
    lifecycle_status = 'published',
    is_active = true,
    published_at = statement_timestamp(),
    published_by = v_user_id,
    publication_metadata_is_legacy = false,
    updated_at = statement_timestamp(),
    updated_by = v_user_id
  where organization_id = v_family.organization_id
    and id = v_template.id;

  return v_template.id;
end
$$;

revoke all on function public.publish_document_template_version(
  uuid, timestamptz, text, text
) from public;
grant execute on function public.publish_document_template_version(
  uuid, timestamptz, text, text
) to authenticated;

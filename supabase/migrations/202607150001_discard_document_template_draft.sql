create or replace function public.protect_document_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_internal boolean := current_user in ('postgres', 'supabase_admin');
  v_is_family_sync boolean := current_user in ('postgres', 'supabase_admin')
    and coalesce(
      current_setting('app.document_template_family_sync', true),
      'off'
    ) = 'on';
  v_user_id uuid := auth.uid();
  v_is_used boolean;
begin
  if tg_op = 'DELETE' then
    v_is_used := exists (
      select 1
      from public.documents d
      where d.organization_id = old.organization_id
        and d.template_id = old.id
    );

    if not v_is_internal
      and (old.lifecycle_status in ('published', 'retired') or v_is_used)
    then
      raise exception using
        message = 'published, retired or used document template versions cannot be deleted';
    end if;

    return old;
  end if;

  v_is_used := exists (
    select 1
    from public.documents d
    where d.organization_id = old.organization_id
      and d.template_id = old.id
  );

  if v_is_family_sync then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;

  if not v_is_internal and (
    new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      message = 'document template identity and creation audit are immutable';
  end if;

  if not v_is_internal
    and new.deleted_at is distinct from old.deleted_at
  then
    raise exception using
      message = 'document template deletion state requires a lifecycle function';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and (old.lifecycle_status in ('published', 'retired') or v_is_used)
  then
    raise exception using
      message = 'published, retired or used document template versions cannot be soft-deleted';
  end if;

  if not v_is_internal
    and (old.lifecycle_status in ('published', 'retired') or v_is_used)
  then
    raise exception using
      message = 'published, retired or used document template versions are immutable to direct authenticated updates';
  end if;

  if old.lifecycle_status in ('published', 'retired') or v_is_used then
    if new.template_content is distinct from old.template_content
      or new.template_format is distinct from old.template_format
      or new.version is distinct from old.version
      or new.family_id is distinct from old.family_id
      or new.organization_id is distinct from old.organization_id
      or new.document_type is distinct from old.document_type
      or new.species is distinct from old.species
      or new.breed is distinct from old.breed
    then
      raise exception using
        message = 'published, retired or used document template versions are immutable';
    end if;
  end if;

  if not v_is_internal and (
    new.lifecycle_status is distinct from old.lifecycle_status
    or new.is_active is distinct from old.is_active
    or new.version is distinct from old.version
    or new.family_id is distinct from old.family_id
    or new.organization_id is distinct from old.organization_id
    or new.document_type is distinct from old.document_type
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.published_at is distinct from old.published_at
    or new.published_by is distinct from old.published_by
    or new.publication_metadata_is_legacy is distinct from old.publication_metadata_is_legacy
  ) then
    raise exception using
      message = 'document template lifecycle, version, family and taxonomy require a lifecycle function';
  end if;

  if not v_is_internal then
    if v_user_id is null then
      raise exception using
        message = 'authenticated document template updates require an author';
    end if;

    new.updated_by := v_user_id;
  end if;

  return new;
end
$$;

create or replace function public.protect_document_template_family_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_internal boolean := current_user in ('postgres', 'supabase_admin');
  v_user_id uuid := auth.uid();
begin
  if not v_is_internal
    and new.deleted_at is distinct from old.deleted_at
  then
    raise exception using
      message = 'document template family deletion state requires a lifecycle function';
  end if;

  if not v_is_internal and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      message = 'document template family identity and creation audit are immutable';
  end if;

  if (
    new.document_type is distinct from old.document_type
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
  ) and exists (
    select 1
    from public.document_templates dt
    where dt.organization_id = old.organization_id
      and dt.family_id = old.id
  ) then
    raise exception using
      message = 'document template family taxonomy is immutable once versions exist';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and new.deleted_at is not null
    and exists (
      select 1
      from public.document_templates dt
      where dt.organization_id = old.organization_id
        and dt.family_id = old.id
        and dt.lifecycle_status in ('draft', 'published')
        and dt.deleted_at is null
    )
  then
    raise exception using
      message = 'document template family can only be archived after all active versions are removed or retired';
  end if;

  if not v_is_internal then
    if v_user_id is null then
      raise exception using
        message = 'authenticated document template family updates require an author';
    end if;

    new.updated_by := v_user_id;
  end if;

  return new;
end
$$;

create or replace function public.discard_document_template_draft(
  p_organization_id uuid,
  p_family_id uuid,
  p_template_id uuid,
  p_expected_updated_at timestamptz
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_family public.document_template_families%rowtype;
  v_template public.document_templates%rowtype;
  v_deleted_at timestamptz := statement_timestamp();
  v_has_history boolean;
  v_active_version_count integer;
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

  select family.* into v_family
  from public.document_template_families family
  where family.organization_id = p_organization_id
    and family.id = p_family_id
  for update;

  if not found or v_family.deleted_at is not null then
    raise exception 'Document template draft not found'
      using errcode = 'P0002';
  end if;

  select template.* into v_template
  from public.document_templates template
  where template.organization_id = p_organization_id
    and template.family_id = p_family_id
    and template.id = p_template_id
  for update;

  if not found
    or v_template.deleted_at is not null
    or v_template.lifecycle_status <> 'draft'
    or v_template.is_active
  then
    raise exception 'Document template draft not found'
      using errcode = 'P0002';
  end if;

  if v_template.updated_at is distinct from p_expected_updated_at then
    raise exception 'Document template draft is stale'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.documents document
    where document.organization_id = p_organization_id
      and document.template_id = p_template_id
  ) then
    raise exception 'Document template family is protected'
      using errcode = '23503';
  end if;

  select exists (
    select 1
    from public.document_templates template
    where template.organization_id = p_organization_id
      and template.family_id = p_family_id
      and template.lifecycle_status in ('published', 'retired')
  ) into v_has_history;

  if v_has_history then
    update public.document_templates
    set
      deleted_at = v_deleted_at,
      updated_at = v_deleted_at,
      updated_by = v_user_id
    where organization_id = p_organization_id
      and family_id = p_family_id
      and id = p_template_id
      and lifecycle_status = 'draft'
      and deleted_at is null;

    if not found then
      raise exception 'Document template draft not found'
        using errcode = 'P0002';
    end if;

    return query select 'draft_discarded'::text;
    return;
  end if;

  if exists (
    select 1
    from public.documents document
    join public.document_templates template
      on template.organization_id = document.organization_id
     and template.id = document.template_id
    where template.organization_id = p_organization_id
      and template.family_id = p_family_id
  ) then
    raise exception 'Document template family is protected'
      using errcode = '23503';
  end if;

  select count(*) into v_active_version_count
  from public.document_templates template
  where template.organization_id = p_organization_id
    and template.family_id = p_family_id
    and template.deleted_at is null;

  if v_active_version_count <> 1 then
    raise exception 'Document template family is protected'
      using errcode = '23503';
  end if;

  update public.document_templates
  set
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at,
    updated_by = v_user_id
  where organization_id = p_organization_id
    and family_id = p_family_id
    and id = p_template_id
    and lifecycle_status = 'draft'
    and deleted_at is null;

  if not found then
    raise exception 'Document template draft not found'
      using errcode = 'P0002';
  end if;

  update public.document_template_families
  set
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at,
    updated_by = v_user_id
  where organization_id = p_organization_id
    and id = p_family_id
    and deleted_at is null;

  if not found then
    raise exception 'Document template family is protected'
      using errcode = '23503';
  end if;

  return query select 'family_deleted'::text;
end
$$;

revoke all on function public.discard_document_template_draft(
  uuid, uuid, uuid, timestamptz
) from public;
revoke all on function public.discard_document_template_draft(
  uuid, uuid, uuid, timestamptz
) from anon;
grant execute on function public.discard_document_template_draft(
  uuid, uuid, uuid, timestamptz
) to authenticated;

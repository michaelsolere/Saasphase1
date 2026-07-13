create or replace function public.store_document_pdf_version(
  p_organization_id uuid,
  p_document_id uuid,
  p_replaces_document_id uuid,
  p_version integer,
  p_document_type text,
  p_title text,
  p_file_path text,
  p_file_sha256 text,
  p_file_size_bytes bigint,
  p_contact_id uuid default null,
  p_application_id uuid default null,
  p_reservation_id uuid default null,
  p_litter_id uuid default null,
  p_litter_group_id uuid default null,
  p_animal_id uuid default null,
  p_payment_id uuid default null,
  p_template_id uuid default null,
  p_generated_from_template boolean default false,
  p_generated_at timestamptz default null,
  p_source_template_version integer default null,
  p_generation_data jsonb default '{}'::jsonb,
  p_signature_required boolean default false
)
returns table(outcome text, document_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.documents%rowtype;
  v_previous public.documents%rowtype;
  v_expected_path text;
  v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin', 'member']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  if p_document_id is null
    or p_version is null or p_version < 1
    or p_file_sha256 is null
    or p_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_file_size_bytes is null or p_file_size_bytes < 5
    or nullif(btrim(p_title), '') is null
  then
    raise exception 'Invalid PDF document metadata'
      using errcode = '23514';
  end if;

  v_expected_path := format(
    'organizations/%s/documents/%s/v%s/%s.pdf',
    p_organization_id,
    p_document_id,
    p_version,
    p_file_sha256
  );

  if p_file_path is distinct from v_expected_path then
    raise exception 'PDF file path does not match its metadata'
      using errcode = '23514';
  end if;

  select d.* into v_existing
  from public.documents d
  where d.id = p_document_id;

  if found then
    if v_existing.organization_id = p_organization_id
      and v_existing.replaces_document_id is not distinct from p_replaces_document_id
      and v_existing.document_type = p_document_type
      and v_existing.title = btrim(p_title)
      and v_existing.file_path = p_file_path
      and v_existing.file_sha256 = p_file_sha256
      and v_existing.file_size_bytes = p_file_size_bytes
      and v_existing.mime_type = 'application/pdf'
      and v_existing.contact_id is not distinct from p_contact_id
      and v_existing.application_id is not distinct from p_application_id
      and v_existing.reservation_id is not distinct from p_reservation_id
      and v_existing.litter_id is not distinct from p_litter_id
      and v_existing.litter_group_id is not distinct from p_litter_group_id
      and v_existing.animal_id is not distinct from p_animal_id
      and v_existing.payment_id is not distinct from p_payment_id
      and v_existing.template_id is not distinct from p_template_id
      and v_existing.generated_from_template = p_generated_from_template
      and v_existing.generated_at is not distinct from p_generated_at
      and v_existing.source_template_version is not distinct from p_source_template_version
      and v_existing.generation_data = coalesce(p_generation_data, '{}'::jsonb)
      and v_existing.signature_required = p_signature_required
      and v_existing.deleted_at is null
    then
      return query select 'existing'::text, v_existing.id;
      return;
    end if;

    raise exception 'Document intention conflicts with existing metadata'
      using errcode = '23514';
  end if;

  if p_replaces_document_id is null then
    if p_version <> 1 then
      raise exception 'An initial PDF document must use version 1'
        using errcode = '23514';
    end if;
  else
    select d.* into v_previous
    from public.documents d
    where d.organization_id = p_organization_id
      and d.id = p_replaces_document_id
    for update;

    if not found then
      raise exception 'Previous PDF document not found'
        using errcode = 'P0002';
    end if;

    if v_previous.deleted_at is not null
      or v_previous.superseded_at is not null
      or v_previous.document_type <> p_document_type
      or v_previous.contact_id is distinct from p_contact_id
      or v_previous.application_id is distinct from p_application_id
      or v_previous.reservation_id is distinct from p_reservation_id
      or v_previous.litter_id is distinct from p_litter_id
      or v_previous.litter_group_id is distinct from p_litter_group_id
      or v_previous.animal_id is distinct from p_animal_id
      or v_previous.payment_id is distinct from p_payment_id
    then
      raise exception 'Previous PDF document is not the current matching scope'
        using errcode = '23514';
    end if;

    if v_previous.file_path !~ format(
      '^organizations/%s/documents/%s/v%s/[0-9a-f]{64}\.pdf$',
      p_organization_id,
      p_replaces_document_id,
      p_version - 1
    ) or p_version <= 1 then
      raise exception 'PDF replacement version is not consecutive'
        using errcode = '23514';
    end if;

    update public.documents
    set superseded_at = v_now, updated_at = v_now, updated_by = auth.uid()
    where organization_id = p_organization_id and id = p_replaces_document_id;
  end if;

  begin
    insert into public.documents (
      id, organization_id, template_id, generated_from_template, generated_at,
      generation_data, source_template_version, contact_id, application_id,
      reservation_id, litter_id, litter_group_id, animal_id, payment_id,
      document_type, status, title, file_path, file_name, mime_type,
      file_size_bytes, file_sha256, signature_required, replaces_document_id,
      created_by, updated_by
    ) values (
      p_document_id, p_organization_id, p_template_id,
      p_generated_from_template, p_generated_at,
      coalesce(p_generation_data, '{}'::jsonb), p_source_template_version,
      p_contact_id, p_application_id, p_reservation_id, p_litter_id,
      p_litter_group_id, p_animal_id, p_payment_id, p_document_type,
      case when p_generated_from_template then 'generated' else 'uploaded' end,
      btrim(p_title), p_file_path, p_file_sha256 || '.pdf', 'application/pdf',
      p_file_size_bytes, p_file_sha256, p_signature_required,
      p_replaces_document_id, auth.uid(), auth.uid()
    );
  exception when unique_violation then
    select d.* into v_existing
    from public.documents d
    where d.id = p_document_id;

    if found
      and v_existing.organization_id = p_organization_id
      and v_existing.replaces_document_id is not distinct from p_replaces_document_id
      and v_existing.document_type = p_document_type
      and v_existing.title = btrim(p_title)
      and v_existing.file_path = p_file_path
      and v_existing.file_sha256 = p_file_sha256
      and v_existing.file_size_bytes = p_file_size_bytes
      and v_existing.mime_type = 'application/pdf'
      and v_existing.contact_id is not distinct from p_contact_id
      and v_existing.application_id is not distinct from p_application_id
      and v_existing.reservation_id is not distinct from p_reservation_id
      and v_existing.litter_id is not distinct from p_litter_id
      and v_existing.litter_group_id is not distinct from p_litter_group_id
      and v_existing.animal_id is not distinct from p_animal_id
      and v_existing.payment_id is not distinct from p_payment_id
      and v_existing.template_id is not distinct from p_template_id
      and v_existing.generated_from_template = p_generated_from_template
      and v_existing.generated_at is not distinct from p_generated_at
      and v_existing.source_template_version is not distinct from p_source_template_version
      and v_existing.generation_data = coalesce(p_generation_data, '{}'::jsonb)
      and v_existing.signature_required = p_signature_required
      and v_existing.deleted_at is null
    then
      return query select 'existing'::text, v_existing.id;
      return;
    end if;

    raise;
  end;

  return query select 'created'::text, p_document_id;
end;
$$;

revoke all on function public.store_document_pdf_version(
  uuid, uuid, uuid, integer, text, text, text, text, bigint,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean,
  timestamptz, integer, jsonb, boolean
) from public;

grant execute on function public.store_document_pdf_version(
  uuid, uuid, uuid, integer, text, text, text, text, bigint,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean,
  timestamptz, integer, jsonb, boolean
) to authenticated;

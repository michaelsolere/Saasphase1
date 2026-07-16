alter table public.documents
  add column reservation_document_variant_version_id uuid,
  add constraint documents_reservation_document_variant_version_organization_fk
    foreign key (organization_id, reservation_document_variant_version_id)
    references public.reservation_document_variant_versions (organization_id, id)
    on delete restrict;

create index documents_reservation_document_variant_version_idx
  on public.documents (organization_id, reservation_document_variant_version_id)
  where reservation_document_variant_version_id is not null;

create or replace function public.validate_document_variant_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_template_id uuid;
  v_source_template_version integer;
  v_version_lifecycle_status text;
  v_version_deleted_at timestamptz;
  v_variant_reservation_id uuid;
  v_variant_document_type text;
  v_variant_deleted_at timestamptz;
begin
  if new.reservation_document_variant_version_id is null then
    return new;
  end if;

  if not new.generated_from_template
    or new.document_type not in ('reservation_contract', 'commitment_certificate')
    or new.reservation_id is null
  then
    raise exception 'Document variant origin requires a generated reservation document'
      using errcode = '23514';
  end if;

  select
    variant_version.source_template_id,
    variant_version.source_template_version,
    variant_version.lifecycle_status,
    variant_version.deleted_at,
    variant.reservation_id,
    variant.document_type,
    variant.deleted_at
  into
    v_source_template_id,
    v_source_template_version,
    v_version_lifecycle_status,
    v_version_deleted_at,
    v_variant_reservation_id,
    v_variant_document_type,
    v_variant_deleted_at
  from public.reservation_document_variant_versions variant_version
  join public.reservation_document_variants variant
    on variant.organization_id = variant_version.organization_id
   and variant.id = variant_version.variant_id
  where variant_version.organization_id = new.organization_id
    and variant_version.id = new.reservation_document_variant_version_id;

  if not found then
    raise exception 'Document variant origin must belong to the document organization'
      using errcode = '23514';
  end if;

  if v_variant_reservation_id is distinct from new.reservation_id
    or v_variant_document_type is distinct from new.document_type
  then
    raise exception 'Document variant origin must match the reservation and document type'
      using errcode = '23514';
  end if;

  if new.template_id is distinct from v_source_template_id
    or new.source_template_version is distinct from v_source_template_version
  then
    raise exception 'Document template origin must match the exact variant source'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT'
    or new.reservation_document_variant_version_id is distinct from old.reservation_document_variant_version_id
  then
    if v_version_lifecycle_status <> 'published'
      or v_version_deleted_at is not null
      or v_variant_deleted_at is not null
    then
      raise exception 'Document variant origin must be a published non-deleted version'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger documents_15_validate_variant_origin
before insert or update of
  organization_id,
  reservation_document_variant_version_id,
  generated_from_template,
  document_type,
  reservation_id,
  template_id,
  source_template_version
on public.documents
for each row execute function public.validate_document_variant_origin();

create or replace function public.reservation_document_variant_version_is_used(
  p_organization_id uuid,
  p_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents document
    where document.organization_id = p_organization_id
      and document.reservation_document_variant_version_id = p_version_id
  );
$$;

create or replace function public.protect_sent_document_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.status = 'sent' or old.sent_at is not null)
    and new.status not in ('sent', 'signed')
  then
    raise exception using message = 'sent document status cannot be downgraded';
  end if;

  if old.sent_at is not null
    and new.sent_at is distinct from old.sent_at
  then
    raise exception using message = 'sent document proof cannot be removed or changed';
  end if;

  if (old.status = 'signed' or old.signed_at is not null)
    and new.status <> 'signed'
  then
    raise exception using message = 'signed document status cannot be downgraded';
  end if;

  if old.signed_at is not null
    and new.signed_at is distinct from old.signed_at
  then
    raise exception using message = 'signed document proof cannot be removed or changed';
  end if;

  if new.signed_at is not null and new.status <> 'signed'
  then
    raise exception using message = 'signed_at requires signed document status';
  end if;

  if new.status = 'signed' and new.sent_at is null
  then
    raise exception using message = 'signed document status requires sent_at proof';
  end if;

  if old.superseded_at is not null
    and new.superseded_at is distinct from old.superseded_at
  then
    raise exception using message = 'document replacement proof cannot be removed or changed';
  end if;

  if (old.status in ('sent', 'signed') or old.sent_at is not null or old.signed_at is not null)
    and new.deleted_at is distinct from old.deleted_at
  then
    raise exception using message = 'sent or signed document cannot be soft-deleted';
  end if;

  if (old.status in ('sent', 'signed') or old.sent_at is not null or old.signed_at is not null)
    and (
      new.file_path is distinct from old.file_path
      or new.file_name is distinct from old.file_name
      or new.mime_type is distinct from old.mime_type
      or new.file_size_bytes is distinct from old.file_size_bytes
      or new.file_sha256 is distinct from old.file_sha256
      or new.generation_data is distinct from old.generation_data
      or new.generated_at is distinct from old.generated_at
      or new.generated_from_template is distinct from old.generated_from_template
      or new.template_id is distinct from old.template_id
      or new.source_template_version is distinct from old.source_template_version
      or new.reservation_document_variant_version_id is distinct from old.reservation_document_variant_version_id
      or new.reservation_id is distinct from old.reservation_id
      or new.contact_id is distinct from old.contact_id
      or new.application_id is distinct from old.application_id
      or new.animal_id is distinct from old.animal_id
      or new.litter_id is distinct from old.litter_id
      or new.litter_group_id is distinct from old.litter_group_id
      or new.replaces_document_id is distinct from old.replaces_document_id
    )
  then
    raise exception using message = 'sent or signed document content and origin are immutable';
  end if;

  return new;
end
$$;

drop function public.store_document_pdf_version(
  uuid, uuid, uuid, integer, text, text, text, text, bigint,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean,
  timestamptz, integer, jsonb, boolean
);

create function public.store_document_pdf_version(
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
  p_signature_required boolean default false,
  p_reservation_document_variant_version_id uuid default null
)
returns table(outcome text, document_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.documents%rowtype;
  v_previous public.documents%rowtype;
  v_expected_path text;
  v_previous_is_pdf boolean;
  v_previous_is_legacy boolean;
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

  if p_replaces_document_id is null then
    select d.* into v_existing
    from public.documents d
    where d.id = p_document_id;
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

    select d.* into v_existing
    from public.documents d
    where d.id = p_document_id;
  end if;

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
      and v_existing.reservation_document_variant_version_id
        is not distinct from p_reservation_document_variant_version_id
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

    v_previous_is_pdf :=
      v_previous.file_path is not null
      and v_previous.file_sha256 is not null
      and v_previous.file_sha256 ~ '^[0-9a-f]{64}$'
      and v_previous.file_size_bytes is not null
      and v_previous.file_size_bytes >= 5
      and v_previous.mime_type = 'application/pdf'
      and p_version > 1
      and v_previous.file_path = format(
        'organizations/%s/documents/%s/v%s/%s.pdf',
        p_organization_id,
        p_replaces_document_id,
        p_version - 1,
        v_previous.file_sha256
      );

    v_previous_is_legacy :=
      v_previous.file_path is null
      and v_previous.file_sha256 is null
      and v_previous.file_size_bytes is null
      and p_version = 1;

    if not coalesce(v_previous_is_pdf, false)
      and not coalesce(v_previous_is_legacy, false)
    then
      raise exception 'Previous PDF document metadata is incoherent or replacement version is invalid'
        using errcode = '23514';
    end if;

    update public.documents
    set superseded_at = v_now
    where organization_id = p_organization_id and id = p_replaces_document_id;
  end if;

  begin
    insert into public.documents (
      id, organization_id, template_id, generated_from_template, generated_at,
      generation_data, source_template_version,
      reservation_document_variant_version_id,
      contact_id, application_id, reservation_id, litter_id, litter_group_id,
      animal_id, payment_id, document_type, status, title, file_path, file_name,
      mime_type, file_size_bytes, file_sha256, signature_required,
      replaces_document_id, created_by, updated_by
    ) values (
      p_document_id, p_organization_id, p_template_id,
      p_generated_from_template, p_generated_at,
      coalesce(p_generation_data, '{}'::jsonb), p_source_template_version,
      p_reservation_document_variant_version_id,
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
      and v_existing.reservation_document_variant_version_id
        is not distinct from p_reservation_document_variant_version_id
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

revoke all on function public.validate_document_variant_origin() from public;
revoke all on function public.store_document_pdf_version(
  uuid, uuid, uuid, integer, text, text, text, text, bigint,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean,
  timestamptz, integer, jsonb, boolean, uuid
) from public;

grant execute on function public.store_document_pdf_version(
  uuid, uuid, uuid, integer, text, text, text, text, bigint,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean,
  timestamptz, integer, jsonb, boolean, uuid
) to authenticated;

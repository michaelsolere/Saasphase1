create or replace function public.mark_birth_documents_deposit_documents_sent(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_commitment_document_id uuid,
  p_contract_document_id uuid,
  p_commitment_file_sha256 text,
  p_contract_file_sha256 text,
  p_commitment_file_size_bytes bigint,
  p_contract_file_size_bytes bigint,
  p_commitment_version integer,
  p_contract_version integer,
  p_sent_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = p_organization_id
      and membership.profile_id = v_user_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'member')
      and membership.deleted_at is null
  ) then
    raise exception 'write membership required' using errcode = '42501';
  end if;

  if p_organization_id is null
    or p_reservation_id is null
    or p_commitment_document_id is null
    or p_contract_document_id is null
    or p_commitment_document_id = p_contract_document_id
    or p_commitment_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_contract_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_commitment_file_size_bytes < 5
    or p_contract_file_size_bytes < 5
    or p_commitment_version < 1
    or p_contract_version < 1
    or p_sent_at is null
  then
    raise exception 'invalid document delivery input' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.reservations reservation
    where reservation.organization_id = p_organization_id
      and reservation.id = p_reservation_id
      and reservation.deleted_at is null
  ) then
    raise exception 'reservation mismatch' using errcode = '23514';
  end if;

  for v_document in
    select document.*
    from public.documents document
    where document.organization_id = p_organization_id
      and document.id in (p_commitment_document_id, p_contract_document_id)
    order by document.id
    for update
  loop
    if v_document.reservation_id is distinct from p_reservation_id
      or v_document.deleted_at is not null
      or v_document.status <> 'to_generate'
      or not v_document.generated_from_template
      or v_document.generated_at is null
      or v_document.template_id is null
      or v_document.source_template_version is null
      or v_document.mime_type <> 'application/pdf'
      or v_document.file_name is distinct from v_document.file_sha256 || '.pdf'
      or v_document.file_size_bytes is null
      or v_document.generation_data #>> '{sources,organizationId}' is distinct from p_organization_id::text
      or v_document.generation_data #>> '{sources,reservationId}' is distinct from p_reservation_id::text
    then
      raise exception 'document is not sendable' using errcode = '23514';
    end if;

    if v_document.id = p_commitment_document_id then
      if v_document.document_type <> 'commitment_certificate'
        or v_document.file_sha256 is distinct from p_commitment_file_sha256
        or v_document.file_size_bytes is distinct from p_commitment_file_size_bytes
        or v_document.file_path is distinct from format(
          'organizations/%s/documents/%s/v%s/%s.pdf',
          p_organization_id,
          p_commitment_document_id,
          p_commitment_version,
          p_commitment_file_sha256
        )
      then
        raise exception 'commitment certificate manifest mismatch' using errcode = '23514';
      end if;
    elsif v_document.id = p_contract_document_id then
      if v_document.document_type <> 'reservation_contract'
        or v_document.file_sha256 is distinct from p_contract_file_sha256
        or v_document.file_size_bytes is distinct from p_contract_file_size_bytes
        or v_document.file_path is distinct from format(
          'organizations/%s/documents/%s/v%s/%s.pdf',
          p_organization_id,
          p_contract_document_id,
          p_contract_version,
          p_contract_file_sha256
        )
      then
        raise exception 'reservation contract manifest mismatch' using errcode = '23514';
      end if;
    end if;
  end loop;

  if not found then
    raise exception 'documents not found' using errcode = '23514';
  end if;

  update public.documents
  set
    status = 'sent',
    sent_at = p_sent_at,
    updated_at = p_sent_at,
    updated_by = v_user_id
  where organization_id = p_organization_id
    and reservation_id = p_reservation_id
    and id in (p_commitment_document_id, p_contract_document_id)
    and status = 'to_generate'
    and deleted_at is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 2 then
    raise exception 'atomic document delivery failed' using errcode = '40001';
  end if;

  return 'sent';
end;
$$;

revoke all on function public.mark_birth_documents_deposit_documents_sent(
  uuid, uuid, uuid, uuid, text, text, bigint, bigint, integer, integer, timestamptz
) from public;

grant execute on function public.mark_birth_documents_deposit_documents_sent(
  uuid, uuid, uuid, uuid, text, text, bigint, bigint, integer, integer, timestamptz
) to authenticated;

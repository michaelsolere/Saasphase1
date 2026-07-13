create table public.document_signed_returns (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null,
  file_path text not null,
  file_sha256 text not null,
  file_size_bytes bigint not null,
  mime_type text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint document_signed_returns_organization_id_id_key
    unique (organization_id, id),
  constraint document_signed_returns_document_organization_fk
    foreign key (organization_id, document_id)
    references public.documents (organization_id, id) on delete restrict,
  constraint document_signed_returns_one_per_document_key
    unique (document_id),
  constraint document_signed_returns_file_path_key
    unique (file_path),
  constraint document_signed_returns_file_sha256_check
    check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint document_signed_returns_file_size_check
    check (file_size_bytes > 0 and file_size_bytes <= 10 * 1024 * 1024),
  constraint document_signed_returns_mime_type_check
    check (mime_type = 'application/pdf')
);

alter table public.document_signed_returns enable row level security;

create policy document_signed_returns_select_member
on public.document_signed_returns
for select
to authenticated
using (public.is_member_of(organization_id));

revoke all on table public.document_signed_returns from anon, authenticated;
grant select on table public.document_signed_returns to authenticated;

create or replace function public.archive_document_signed_return(
  p_organization_id uuid,
  p_document_id uuid,
  p_signed_return_id uuid,
  p_file_path text,
  p_file_sha256 text,
  p_file_size_bytes bigint,
  p_mime_type text
)
returns table(outcome text, signed_return_id uuid)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_original public.documents%rowtype;
  v_existing public.document_signed_returns%rowtype;
  v_expected_path text;
  v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin', 'member']
  ) then
    raise exception 'Signed return cannot be archived'
      using errcode = '42501';
  end if;

  if p_document_id is null
    or p_signed_return_id is null
    or p_file_sha256 is null
    or p_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_file_size_bytes is null
    or p_file_size_bytes <= 0
    or p_file_size_bytes > 10 * 1024 * 1024
    or p_mime_type is distinct from 'application/pdf'
  then
    raise exception 'Signed return cannot be archived'
      using errcode = '23514';
  end if;

  v_expected_path := format(
    'organizations/%s/documents/%s/signed-returns/%s/%s.pdf',
    p_organization_id,
    p_document_id,
    p_signed_return_id,
    p_file_sha256
  );

  if p_file_path is distinct from v_expected_path then
    raise exception 'Signed return cannot be archived'
      using errcode = '23514';
  end if;

  select d.* into v_original
  from public.documents d
  where d.organization_id = p_organization_id
    and d.id = p_document_id
  for update;

  if not found
    or v_original.deleted_at is not null
    or v_original.document_type not in ('reservation_contract', 'commitment_certificate')
    or v_original.status not in ('sent', 'signed')
    or v_original.sent_at is null
    or v_original.file_path is null
    or v_original.file_sha256 is null
    or v_original.file_sha256 !~ '^[0-9a-f]{64}$'
    or v_original.file_size_bytes is null
    or v_original.file_size_bytes < 5
    or v_original.mime_type is distinct from 'application/pdf'
    or v_original.file_path !~ format(
      '^organizations/%s/documents/%s/v[1-9][0-9]*/%s\.pdf$',
      p_organization_id,
      p_document_id,
      v_original.file_sha256
    )
    or not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'documents'
        and o.name = v_original.file_path
        and o.metadata ->> 'mimetype' = 'application/pdf'
        and o.metadata ->> 'size' = v_original.file_size_bytes::text
    )
  then
    raise exception 'Signed return cannot be archived'
      using errcode = 'P0001';
  end if;

  select r.* into v_existing
  from public.document_signed_returns r
  where r.id = p_signed_return_id;

  if found then
    if v_existing.organization_id = p_organization_id
      and v_existing.document_id = p_document_id
      and v_existing.file_path = p_file_path
      and v_existing.file_sha256 = p_file_sha256
      and v_existing.file_size_bytes = p_file_size_bytes
      and v_existing.mime_type = p_mime_type
    then
      return query select 'existing'::text, v_existing.id;
      return;
    end if;

    raise exception 'Signed return cannot be archived'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.document_signed_returns r
    where r.document_id = p_document_id
  ) or not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'documents'
      and o.name = p_file_path
      and o.metadata ->> 'mimetype' = 'application/pdf'
      and o.metadata ->> 'size' = p_file_size_bytes::text
  ) then
    raise exception 'Signed return cannot be archived'
      using errcode = '23514';
  end if;

  begin
    insert into public.document_signed_returns (
      id,
      organization_id,
      document_id,
      file_path,
      file_sha256,
      file_size_bytes,
      mime_type,
      received_at,
      created_at,
      created_by
    ) values (
      p_signed_return_id,
      p_organization_id,
      p_document_id,
      p_file_path,
      p_file_sha256,
      p_file_size_bytes,
      p_mime_type,
      v_now,
      v_now,
      auth.uid()
    );
  exception when unique_violation then
    select r.* into v_existing
    from public.document_signed_returns r
    where r.id = p_signed_return_id;

    if found
      and v_existing.organization_id = p_organization_id
      and v_existing.document_id = p_document_id
      and v_existing.file_path = p_file_path
      and v_existing.file_sha256 = p_file_sha256
      and v_existing.file_size_bytes = p_file_size_bytes
      and v_existing.mime_type = p_mime_type
    then
      return query select 'existing'::text, v_existing.id;
      return;
    end if;

    raise exception 'Signed return cannot be archived'
      using errcode = '23514';
  end;

  if v_original.status = 'sent' then
    update public.documents
    set
      status = 'signed',
      signed_at = v_now,
      updated_at = v_now,
      updated_by = auth.uid()
    where organization_id = p_organization_id
      and id = p_document_id;
  end if;

  return query select 'created'::text, p_signed_return_id;
end;
$$;

revoke all on function public.archive_document_signed_return(
  uuid, uuid, uuid, text, text, bigint, text
) from public;
grant execute on function public.archive_document_signed_return(
  uuid, uuid, uuid, text, text, bigint, text
) to authenticated;

create policy document_signed_returns_objects_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signed-returns/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$'
  and public.is_member_of(split_part(name, '/', 2)::uuid)
);

create policy document_signed_returns_objects_insert_writer
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signed-returns/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$'
  and public.has_organization_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin', 'member']
  )
);

create policy document_signed_returns_objects_delete_compensation
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signed-returns/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$'
  and public.has_organization_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin', 'member']
  )
  and not exists (
    select 1
    from public.document_signed_returns r
    where r.file_path = name
  )
);

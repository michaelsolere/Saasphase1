alter table public.documents
  add column litter_group_id uuid,
  add column source_template_version integer,
  add column file_sha256 text,
  add column replaces_document_id uuid,
  add column superseded_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.documents
    where generated_from_template
      and (template_id is null or generated_at is null)
  ) then
    raise exception using
      message = 'documents audit failed: generated_from_template rows require both template_id and generated_at';
  end if;

  if exists (
    select 1
    from public.documents d
    left join public.litters l
      on l.organization_id = d.organization_id and l.id = d.litter_id
    left join public.litter_groups lg
      on lg.organization_id = d.organization_id and lg.id = d.litter_group_id
    where d.document_type = 'welcome_booklet'
      and (
        (d.litter_id is null) = (d.litter_group_id is null)
        or d.reservation_id is not null
        or d.application_id is not null
        or d.contact_id is not null
        or d.animal_id is not null
        or (d.litter_id is not null and (
          l.id is null or l.deleted_at is not null or l.status in ('cancelled', 'archived')
        ))
        or (d.litter_group_id is not null and (
          lg.id is null or lg.deleted_at is not null or lg.status in ('cancelled', 'archived')
        ))
      )
  ) or exists (
    select 1
    from public.documents
    where document_type in ('reservation_contract', 'commitment_certificate')
      and (reservation_id is null or contact_id is null or litter_group_id is not null)
  ) then
    raise exception using
      message = 'documents audit failed: invalid document scope attachment';
  end if;

  if exists (
    select 1
    from public.documents
    where replaces_document_id = id
  ) or exists (
    select replaces_document_id
    from public.documents
    where replaces_document_id is not null and deleted_at is null
    group by replaces_document_id
    having count(*) > 1
  ) or exists (
    select 1
    from public.documents successor
    left join public.documents predecessor
      on predecessor.organization_id = successor.organization_id
     and predecessor.id = successor.replaces_document_id
    where successor.replaces_document_id is not null
      and predecessor.id is null
  ) then
    raise exception using
      message = 'documents audit failed: incoherent replacement chain';
  end if;

  if exists (
    select organization_id, litter_id
    from public.documents
    where document_type = 'welcome_booklet'
      and litter_id is not null
      and deleted_at is null
      and superseded_at is null
    group by organization_id, litter_id
    having count(*) > 1
  ) or exists (
    select organization_id, litter_group_id
    from public.documents
    where document_type = 'welcome_booklet'
      and litter_group_id is not null
      and deleted_at is null
      and superseded_at is null
    group by organization_id, litter_group_id
    having count(*) > 1
  ) or exists (
    select organization_id, reservation_id, document_type
    from public.documents
    where document_type in ('reservation_contract', 'commitment_certificate')
      and deleted_at is null
      and superseded_at is null
    group by organization_id, reservation_id, document_type
    having count(*) > 1
  ) then
    raise exception using
      message = 'documents audit failed: duplicate current document versions';
  end if;
end
$$;

alter table public.documents
  add constraint documents_litter_group_organization_fk
    foreign key (organization_id, litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  add constraint documents_replaces_document_organization_fk
    foreign key (organization_id, replaces_document_id)
    references public.documents (organization_id, id) on delete restrict,
  add constraint documents_not_self_replacement_check
    check (replaces_document_id is null or replaces_document_id <> id),
  add constraint documents_source_template_version_check
    check (source_template_version is null or source_template_version > 0),
  add constraint documents_file_sha256_check
    check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint documents_welcome_booklet_scope_check
    check (
      document_type <> 'welcome_booklet'
      or (
        (litter_id is not null) <> (litter_group_id is not null)
        and reservation_id is null
        and application_id is null
        and contact_id is null
        and animal_id is null
      )
    ),
  add constraint documents_individual_pdf_scope_check
    check (
      document_type not in ('reservation_contract', 'commitment_certificate')
      or (
        reservation_id is not null
        and contact_id is not null
        and litter_group_id is null
      )
    );

alter table public.documents drop constraint documents_generation_check;
alter table public.documents
  add constraint documents_generation_check
    check (
      not generated_from_template
      or (template_id is not null and generated_at is not null)
    );

create unique index documents_one_active_successor_idx
  on public.documents (replaces_document_id)
  where replaces_document_id is not null and deleted_at is null;

create unique index documents_current_welcome_booklet_litter_idx
  on public.documents (organization_id, litter_id)
  where document_type = 'welcome_booklet'
    and litter_id is not null
    and deleted_at is null
    and superseded_at is null;

create unique index documents_current_welcome_booklet_group_idx
  on public.documents (organization_id, litter_group_id)
  where document_type = 'welcome_booklet'
    and litter_group_id is not null
    and deleted_at is null
    and superseded_at is null;

create unique index documents_current_reservation_contract_idx
  on public.documents (organization_id, reservation_id)
  where document_type = 'reservation_contract'
    and deleted_at is null
    and superseded_at is null;

create unique index documents_current_commitment_certificate_idx
  on public.documents (organization_id, reservation_id)
  where document_type = 'commitment_certificate'
    and deleted_at is null
    and superseded_at is null;

create or replace function public.validate_document_active_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.litter_id is not null and not exists (
    select 1 from public.litters l
    where l.organization_id = new.organization_id
      and l.id = new.litter_id
      and l.deleted_at is null
      and l.status not in ('cancelled', 'archived')
  ) then
    raise exception using message = 'document litter scope must reference an active litter';
  end if;

  if new.litter_group_id is not null and not exists (
    select 1 from public.litter_groups lg
    where lg.organization_id = new.organization_id
      and lg.id = new.litter_group_id
      and lg.deleted_at is null
      and lg.status not in ('cancelled', 'archived')
  ) then
    raise exception using message = 'document litter group scope must reference an active litter group';
  end if;

  return new;
end
$$;

create trigger documents_validate_active_scope
before insert or update of organization_id, litter_id, litter_group_id
on public.documents
for each row execute function public.validate_document_active_scope();

create or replace function public.protect_sent_document_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

create trigger documents_protect_sent_content
before update on public.documents
for each row execute function public.protect_sent_document_content();

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update
set name = excluded.name, public = excluded.public;

create policy documents_objects_select_member
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/v[1-9][0-9]*/[0-9a-f]{64}\.pdf$'
  and exists (
    select 1 from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  )
);

create policy documents_objects_insert_writer
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/v[1-9][0-9]*/[0-9a-f]{64}\.pdf$'
  and exists (
    select 1 from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

create policy documents_objects_update_writer
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid() and m.status = 'active' and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
)
with check (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/v[1-9][0-9]*/[0-9a-f]{64}\.pdf$'
  and exists (
    select 1 from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid() and m.status = 'active' and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

create policy documents_objects_delete_writer
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and name ~ '^organizations/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/v[1-9][0-9]*/[0-9a-f]{64}\.pdf$'
  and exists (
    select 1 from public.memberships m
    where m.organization_id::text = split_part(name, '/', 2)
      and m.profile_id = auth.uid() and m.status = 'active' and m.deleted_at is null
      and m.role = any(array['owner', 'admin', 'member'])
  )
);

revoke all on function public.validate_document_active_scope() from public;
revoke all on function public.protect_sent_document_content() from public;

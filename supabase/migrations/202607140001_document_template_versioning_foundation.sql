do $$
begin
  if exists (
    select 1
    from public.documents
    where (template_id is null) <> (source_template_version is null)
  ) then
    raise exception using
      message = 'document template lifecycle audit failed: document template and source version must be provided together';
  end if;

  if exists (
    select 1
    from public.document_templates
    where deleted_at is not null
  ) then
    raise exception using
      message = 'document template lifecycle audit failed: legacy templates must not be soft-deleted';
  end if;

  if exists (
    select 1
    from public.documents d
    left join public.document_templates dt
      on dt.organization_id = d.organization_id
     and dt.id = d.template_id
    where d.template_id is not null
      and (
        dt.id is null
        or d.source_template_version is null
        or d.source_template_version <> dt.version
      )
  ) then
    raise exception using
      message = 'document template lifecycle audit failed: document template references must identify the exact version';
  end if;

  if exists (
    select 1
    from public.documents
    where generated_from_template
      and (
        template_id is null
        or source_template_version is null
        or generated_at is null
      )
  ) then
    raise exception using
      message = 'document template lifecycle audit failed: generated documents require a template, version and generation date';
  end if;
end
$$;

create table public.document_template_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  description text,
  document_type text not null,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint document_template_families_organization_id_id_key
    unique (organization_id, id),
  constraint document_template_families_taxonomy_key
    unique (organization_id, id, document_type, species, breed),
  constraint document_template_families_name_check
    check (length(btrim(name)) > 0),
  constraint document_template_families_type_check
    check (document_type in (
      'phone_call_summary', 'plaud_transcript', 'application_form',
      'reservation_contract', 'commitment_certificate', 'payment_receipt',
      'invoice', 'sale_certificate', 'welcome_booklet',
      'photo_use_authorization', 'other'
    )),
  constraint document_template_families_species_check
    check (length(btrim(species)) > 0),
  constraint document_template_families_breed_check
    check (length(btrim(breed)) > 0)
);

create index document_template_families_organization_id_idx
  on public.document_template_families (organization_id);

create trigger document_template_families_set_updated_at
before update on public.document_template_families
for each row execute function public.set_updated_at();

alter table public.document_template_families enable row level security;

create policy document_template_families_select_member
on public.document_template_families
for select to authenticated
using (public.is_member_of(organization_id));

create policy document_template_families_insert_admin
on public.document_template_families
for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy document_template_families_update_admin
on public.document_template_families
for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

grant select, insert, update on public.document_template_families to authenticated;

alter table public.document_templates
  add column family_id uuid,
  add column lifecycle_status text,
  add column published_at timestamptz,
  add column published_by uuid references public.profiles(id) on delete restrict,
  add column publication_metadata_is_legacy boolean not null default false;

insert into public.document_template_families (
  id,
  organization_id,
  name,
  description,
  document_type,
  species,
  breed,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  dt.id,
  dt.organization_id,
  dt.name,
  dt.description,
  dt.document_type,
  dt.species,
  dt.breed,
  dt.created_at,
  dt.updated_at,
  dt.created_by,
  dt.updated_by
from public.document_templates dt;

update public.document_templates dt
set
  family_id = dt.id,
  publication_metadata_is_legacy = true,
  is_active = (
    dt.is_active
    or exists (
      select 1
      from public.documents d
      where d.organization_id = dt.organization_id
        and d.template_id = dt.id
    )
  ),
  lifecycle_status = case
    when dt.is_active
      or exists (
        select 1
        from public.documents d
        where d.organization_id = dt.organization_id
          and d.template_id = dt.id
      )
    then 'published'
    else 'retired'
  end;

alter table public.document_templates
  alter column family_id set not null,
  alter column lifecycle_status set default 'draft',
  alter column lifecycle_status set not null,
  add constraint document_templates_family_taxonomy_fk
    foreign key (organization_id, family_id, document_type, species, breed)
    references public.document_template_families (
      organization_id, id, document_type, species, breed
    ) on delete restrict,
  add constraint document_templates_family_version_key
    unique (family_id, version),
  add constraint document_templates_exact_version_key
    unique (organization_id, id, version),
  add constraint document_templates_lifecycle_status_check
    check (lifecycle_status in ('draft', 'published', 'retired')),
  add constraint document_templates_lifecycle_active_check
    check (
      (lifecycle_status = 'published' and is_active)
      or (lifecycle_status in ('draft', 'retired') and not is_active)
    ),
  add constraint document_templates_publication_metadata_check
    check (
      (
        lifecycle_status = 'draft'
        and not publication_metadata_is_legacy
        and published_at is null
        and published_by is null
      )
      or (
        lifecycle_status in ('published', 'retired')
        and (
          (
            publication_metadata_is_legacy
            and published_at is null
            and published_by is null
          )
          or (
            not publication_metadata_is_legacy
            and published_at is not null
            and published_by is not null
          )
        )
      )
    );

create unique index document_templates_one_draft_per_family_idx
  on public.document_templates (family_id)
  where lifecycle_status = 'draft' and deleted_at is null;

create unique index document_templates_one_published_per_family_idx
  on public.document_templates (family_id)
  where lifecycle_status = 'published' and deleted_at is null;

create index documents_template_exact_idx
  on public.documents (organization_id, template_id, source_template_version)
  where template_id is not null;

alter table public.documents
  drop constraint documents_template_organization_fk,
  drop constraint documents_generation_check;

alter table public.documents
  add constraint documents_template_reference_pair_check
    check ((template_id is null) = (source_template_version is null)),
  add constraint documents_template_exact_fk
    foreign key (organization_id, template_id, source_template_version)
    references public.document_templates (organization_id, id, version)
    on delete restrict,
  add constraint documents_generation_check
    check (
      not generated_from_template
      or (
        template_id is not null
        and source_template_version is not null
        and generated_at is not null
      )
    );

create or replace function public.protect_document_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_internal boolean := current_user in ('postgres', 'supabase_admin');
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

  if new.deleted_at is distinct from old.deleted_at
    and (old.lifecycle_status in ('published', 'retired') or v_is_used)
  then
    raise exception using
      message = 'published, retired or used document template versions cannot be soft-deleted';
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

  return new;
end
$$;

create trigger document_templates_10_protect_version
before update or delete on public.document_templates
for each row execute function public.protect_document_template_version();

create or replace function public.validate_document_template_family_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_family public.document_template_families%rowtype;
begin
  select family.* into v_family
  from public.document_template_families family
  where family.organization_id = new.organization_id
    and family.id = new.family_id;

  if not found or v_family.deleted_at is not null then
    raise exception using message = 'document template family must be active';
  end if;

  if new.document_type is distinct from v_family.document_type
    or new.species is distinct from v_family.species
    or new.breed is distinct from v_family.breed
  then
    raise exception using message = 'document template taxonomy must match its family';
  end if;

  new.name := v_family.name;
  new.description := v_family.description;
  return new;
end
$$;

create trigger document_templates_20_validate_family
before insert or update on public.document_templates
for each row execute function public.validate_document_template_family_consistency();

create or replace function public.protect_and_sync_document_template_family()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
    )
  then
    raise exception using
      message = 'document template family can only be archived after all versions are retired';
  end if;

  if new.name is distinct from old.name
    or new.description is distinct from old.description
  then
    update public.document_templates
    set name = new.name, description = new.description
    where organization_id = new.organization_id
      and family_id = new.id;
  end if;

  return new;
end
$$;

create trigger document_template_families_protect_and_sync
after update on public.document_template_families
for each row execute function public.protect_and_sync_document_template_family();

create or replace function public.validate_generated_document_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lifecycle_status text;
  v_is_active boolean;
  v_template_deleted_at timestamptz;
  v_family_deleted_at timestamptz;
begin
  if new.template_id is null then
    return new;
  end if;

  select
    dt.lifecycle_status,
    dt.is_active,
    dt.deleted_at,
    family.deleted_at
    into
      v_lifecycle_status,
      v_is_active,
      v_template_deleted_at,
      v_family_deleted_at
  from public.document_templates dt
  join public.document_template_families family
    on family.organization_id = dt.organization_id
   and family.id = dt.family_id
  where dt.organization_id = new.organization_id
    and dt.id = new.template_id
    and dt.version = new.source_template_version;

  if not found then
    raise exception using message = 'document must reference an exact document template version';
  end if;

  if new.generated_from_template and (
    v_lifecycle_status <> 'published'
    or not v_is_active
    or v_template_deleted_at is not null
    or v_family_deleted_at is not null
  ) then
    raise exception using
      message = 'generated documents require an active published document template version';
  end if;

  return new;
end
$$;

create trigger documents_validate_generated_template_version
before insert or update of organization_id, template_id, source_template_version, generated_from_template
on public.documents
for each row execute function public.validate_generated_document_template_version();

create or replace function public.create_document_template_draft(
  p_family_id uuid,
  p_template_format text default 'json',
  p_template_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_family public.document_template_families%rowtype;
  v_template_id uuid := gen_random_uuid();
  v_next_version integer;
begin
  select family.* into v_family
  from public.document_template_families family
  where family.id = p_family_id
  for update;

  if not found or v_family.deleted_at is not null then
    raise exception 'Document template family not found'
      using errcode = 'P0002';
  end if;

  if v_user_id is null or not public.has_organization_role(
    v_family.organization_id,
    array['owner', 'admin', 'member']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.document_templates dt
    where dt.family_id = v_family.id
      and dt.lifecycle_status = 'draft'
      and dt.deleted_at is null
  ) then
    raise exception 'A draft already exists for this document template family'
      using errcode = '23505';
  end if;

  select coalesce(max(dt.version), 0) + 1
    into v_next_version
  from public.document_templates dt
  where dt.family_id = v_family.id;

  insert into public.document_templates (
    id, organization_id, family_id, name, description, document_type,
    species, breed, template_format, template_content, version,
    lifecycle_status, is_active, created_by, updated_by
  ) values (
    v_template_id, v_family.organization_id, v_family.id, v_family.name,
    v_family.description, v_family.document_type, v_family.species,
    v_family.breed, p_template_format, p_template_content, v_next_version,
    'draft', false, v_user_id, v_user_id
  );

  return v_template_id;
end
$$;

create or replace function public.publish_document_template_version(
  p_template_id uuid
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

revoke all on function public.create_document_template_draft(uuid, text, text) from public;
revoke all on function public.publish_document_template_version(uuid) from public;
grant execute on function public.create_document_template_draft(uuid, text, text) to authenticated;
grant execute on function public.publish_document_template_version(uuid) to authenticated;

revoke insert on public.document_templates from authenticated;

create table public.reservation_document_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null,
  template_family_id uuid not null,
  document_type text not null,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint reservation_document_variants_organization_id_id_key
    unique (organization_id, id),
  constraint reservation_document_variants_taxonomy_key
    unique (organization_id, id, template_family_id, document_type, species, breed),
  constraint reservation_document_variants_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint reservation_document_variants_family_taxonomy_fk
    foreign key (organization_id, template_family_id, document_type, species, breed)
    references public.document_template_families (
      organization_id, id, document_type, species, breed
    ) on delete restrict,
  constraint reservation_document_variants_type_check
    check (document_type in (
      'phone_call_summary', 'plaud_transcript', 'application_form',
      'reservation_contract', 'commitment_certificate', 'payment_receipt',
      'invoice', 'sale_certificate', 'welcome_booklet',
      'photo_use_authorization', 'other'
    )),
  constraint reservation_document_variants_species_check
    check (length(btrim(species)) > 0),
  constraint reservation_document_variants_breed_check
    check (length(btrim(breed)) > 0)
);

create unique index reservation_document_variants_active_identity_idx
  on public.reservation_document_variants (
    organization_id, reservation_id, template_family_id
  )
  where deleted_at is null;

create index reservation_document_variants_reservation_idx
  on public.reservation_document_variants (organization_id, reservation_id)
  where deleted_at is null;

create index reservation_document_variants_family_idx
  on public.reservation_document_variants (organization_id, template_family_id)
  where deleted_at is null;

create table public.reservation_document_variant_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null,
  version integer not null,
  source_template_id uuid not null,
  source_template_version integer not null,
  template_format text not null,
  template_content text,
  lifecycle_status text not null default 'draft',
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint reservation_document_variant_versions_organization_id_id_key
    unique (organization_id, id),
  constraint reservation_document_variant_versions_variant_version_key
    unique (variant_id, version),
  constraint reservation_document_variant_versions_variant_organization_fk
    foreign key (organization_id, variant_id)
    references public.reservation_document_variants (organization_id, id)
    on delete restrict,
  constraint reservation_document_variant_versions_source_exact_fk
    foreign key (organization_id, source_template_id, source_template_version)
    references public.document_templates (organization_id, id, version)
    on delete restrict,
  constraint reservation_document_variant_versions_version_check
    check (version > 0),
  constraint reservation_document_variant_versions_source_version_check
    check (source_template_version > 0),
  constraint reservation_document_variant_versions_format_check
    check (template_format in (
      'html', 'markdown', 'docx', 'pdf_form', 'other', 'json'
    )),
  constraint reservation_document_variant_versions_lifecycle_status_check
    check (lifecycle_status in ('draft', 'published', 'retired')),
  constraint reservation_variant_versions_publication_metadata_check
    check (
      (lifecycle_status = 'draft' and published_at is null and published_by is null)
      or
      (lifecycle_status in ('published', 'retired')
        and published_at is not null and published_by is not null)
    )
);

create unique index reservation_document_variant_versions_one_draft_idx
  on public.reservation_document_variant_versions (variant_id)
  where lifecycle_status = 'draft' and deleted_at is null;

create unique index reservation_document_variant_versions_one_published_idx
  on public.reservation_document_variant_versions (variant_id)
  where lifecycle_status = 'published' and deleted_at is null;

create index reservation_document_variant_versions_source_idx
  on public.reservation_document_variant_versions (
    organization_id, source_template_id, source_template_version
  );

create trigger reservation_document_variants_05_set_updated_at
before update on public.reservation_document_variants
for each row execute function public.set_updated_at();

create trigger reservation_document_variant_versions_05_set_updated_at
before update on public.reservation_document_variant_versions
for each row execute function public.set_updated_at();

create or replace function public.validate_reservation_document_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
  v_family public.document_template_families%rowtype;
begin
  select reservation.* into v_reservation
  from public.reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id;

  if not found or v_reservation.deleted_at is not null then
    raise exception 'Reservation document variant requires an active reservation'
      using errcode = '23514';
  end if;

  select family.* into v_family
  from public.document_template_families family
  where family.organization_id = new.organization_id
    and family.id = new.template_family_id;

  if not found or v_family.deleted_at is not null then
    raise exception 'Reservation document variant requires an active template family'
      using errcode = '23514';
  end if;

  if new.document_type is distinct from v_family.document_type
    or new.species is distinct from v_family.species
    or new.breed is distinct from v_family.breed
    or new.species is distinct from v_reservation.species
    or new.breed is distinct from v_reservation.breed
  then
    raise exception 'Reservation document variant taxonomy must match its reservation and family'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger reservation_document_variants_20_validate
before insert or update on public.reservation_document_variants
for each row execute function public.validate_reservation_document_variant();

create or replace function public.protect_reservation_document_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_internal boolean := current_user in ('postgres', 'supabase_admin');
begin
  if tg_op = 'DELETE' then
    if not v_is_internal then
      raise exception 'Reservation document variants require a lifecycle function'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not v_is_internal and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.reservation_id is distinct from old.reservation_id
    or new.template_family_id is distinct from old.template_family_id
    or new.document_type is distinct from old.document_type
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.updated_by is distinct from old.updated_by
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'Reservation document variant identity, taxonomy and audits are immutable'
      using errcode = '42501';
  end if;

  return new;
end
$$;

create trigger reservation_document_variants_10_protect
before update or delete on public.reservation_document_variants
for each row execute function public.protect_reservation_document_variant();

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
  -- No document relation exists yet. The future exact-version usage check belongs here.
  select false
  from (select p_organization_id, p_version_id) inputs;
$$;

create or replace function public.validate_reservation_document_variant_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_variant public.reservation_document_variants%rowtype;
  v_source public.document_templates%rowtype;
begin
  select variant.* into v_variant
  from public.reservation_document_variants variant
  where variant.organization_id = new.organization_id
    and variant.id = new.variant_id;

  if not found
    or v_variant.deleted_at is not null
    or not exists (
      select 1
      from public.reservations reservation
      join public.document_template_families family
        on family.organization_id = v_variant.organization_id
       and family.id = v_variant.template_family_id
      where reservation.organization_id = v_variant.organization_id
        and reservation.id = v_variant.reservation_id
        and reservation.deleted_at is null
        and family.deleted_at is null
    )
  then
    raise exception 'Reservation document variant version requires an active variant'
      using errcode = '23514';
  end if;

  select template.* into v_source
  from public.document_templates template
  where template.organization_id = new.organization_id
    and template.id = new.source_template_id
    and template.version = new.source_template_version;

  if not found
    or v_source.family_id is distinct from v_variant.template_family_id
    or v_source.document_type is distinct from v_variant.document_type
    or v_source.species is distinct from v_variant.species
    or v_source.breed is distinct from v_variant.breed
  then
    raise exception 'Reservation document variant source must match the exact family and taxonomy'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger reservation_document_variant_versions_20_validate
before insert or update on public.reservation_document_variant_versions
for each row execute function public.validate_reservation_document_variant_version();

create or replace function public.protect_reservation_document_variant_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_internal boolean := current_user in ('postgres', 'supabase_admin');
  v_user_id uuid := auth.uid();
  v_is_used boolean;
begin
  if tg_op = 'DELETE' then
    v_is_used := public.reservation_document_variant_version_is_used(
      old.organization_id, old.id
    );

    if not v_is_internal
      and (old.lifecycle_status in ('published', 'retired') or v_is_used)
    then
      raise exception 'Published, retired or used reservation document variant versions cannot be deleted'
        using errcode = '42501';
    end if;

    return old;
  end if;

  v_is_used := public.reservation_document_variant_version_is_used(
    old.organization_id, old.id
  );

  if not v_is_internal and old.deleted_at is not null then
    raise exception 'Deleted reservation document variant versions are immutable'
      using errcode = '42501';
  end if;

  if not v_is_internal and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.variant_id is distinct from old.variant_id
    or new.version is distinct from old.version
    or new.source_template_id is distinct from old.source_template_id
    or new.source_template_version is distinct from old.source_template_version
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.updated_by is distinct from old.updated_by
    or new.published_at is distinct from old.published_at
    or new.published_by is distinct from old.published_by
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'Reservation document variant version identity and audits are immutable'
      using errcode = '42501';
  end if;

  if not v_is_internal and (
    new.lifecycle_status is distinct from old.lifecycle_status
  ) then
    raise exception 'Reservation document variant lifecycle requires a lifecycle function'
      using errcode = '42501';
  end if;

  if not v_is_internal
    and (old.lifecycle_status in ('published', 'retired') or v_is_used)
  then
    raise exception 'Published, retired or used reservation document variant versions are immutable to direct authenticated updates'
      using errcode = '42501';
  end if;

  if old.lifecycle_status in ('published', 'retired') or v_is_used then
    if new.template_format is distinct from old.template_format
      or new.template_content is distinct from old.template_content
      or new.version is distinct from old.version
      or new.variant_id is distinct from old.variant_id
      or new.organization_id is distinct from old.organization_id
      or new.source_template_id is distinct from old.source_template_id
      or new.source_template_version is distinct from old.source_template_version
    then
      raise exception 'Published, retired or used reservation document variant versions are immutable'
        using errcode = '42501';
    end if;
  end if;

  if not v_is_internal then
    if v_user_id is null then
      raise exception 'Authenticated reservation document variant updates require an author'
        using errcode = '42501';
    end if;
    new.updated_by := v_user_id;
  end if;

  return new;
end
$$;

create trigger reservation_document_variant_versions_10_protect
before update or delete on public.reservation_document_variant_versions
for each row execute function public.protect_reservation_document_variant_version();

create or replace function public.create_reservation_document_variant_draft(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_template_family_id uuid,
  p_source_template_id uuid,
  p_source_template_version integer,
  p_document_type text,
  p_species text,
  p_breed text,
  p_variant_id uuid default null,
  p_version_id uuid default null
)
returns table (variant_id uuid, version_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_family public.document_template_families%rowtype;
  v_source public.document_templates%rowtype;
  v_variant public.reservation_document_variants%rowtype;
  v_version public.reservation_document_variant_versions%rowtype;
  v_variant_id uuid := coalesce(p_variant_id, gen_random_uuid());
  v_version_id uuid := coalesce(p_version_id, gen_random_uuid());
begin
  if v_user_id is null or not public.has_organization_role(
    p_organization_id, array['owner', 'admin', 'member']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  select reservation.* into v_reservation
  from public.reservations reservation
  where reservation.organization_id = p_organization_id
    and reservation.id = p_reservation_id
  for update;

  if not found or v_reservation.deleted_at is not null then
    raise exception 'Active reservation not found'
      using errcode = 'P0002';
  end if;

  select family.* into v_family
  from public.document_template_families family
  where family.organization_id = p_organization_id
    and family.id = p_template_family_id
  for share;

  if not found or v_family.deleted_at is not null then
    raise exception 'Active document template family not found'
      using errcode = 'P0002';
  end if;

  if p_document_type is distinct from v_family.document_type
    or p_species is distinct from v_family.species
    or p_breed is distinct from v_family.breed
    or p_species is distinct from v_reservation.species
    or p_breed is distinct from v_reservation.breed
  then
    raise exception 'Reservation, family and requested taxonomy must match exactly'
      using errcode = '23514';
  end if;

  select variant.* into v_variant
  from public.reservation_document_variants variant
  where variant.organization_id = p_organization_id
    and variant.reservation_id = p_reservation_id
    and variant.template_family_id = p_template_family_id
    and variant.deleted_at is null;

  if found then
    select variant_version.* into v_version
    from public.reservation_document_variant_versions variant_version
    where variant_version.organization_id = p_organization_id
      and variant_version.variant_id = v_variant.id
      and variant_version.version = 1;

    if not found
      or v_version.source_template_id is distinct from p_source_template_id
      or v_version.source_template_version is distinct from p_source_template_version
    then
      raise exception 'Reservation document variant already exists with a different origin'
        using errcode = '23505';
    end if;

    return query select v_variant.id, v_version.id, v_version.version;
    return;
  end if;

  select template.* into v_source
  from public.document_templates template
  where template.organization_id = p_organization_id
    and template.id = p_source_template_id
    and template.version = p_source_template_version
  for key share;

  if not found
    or v_source.family_id is distinct from p_template_family_id
    or v_source.document_type is distinct from p_document_type
    or v_source.species is distinct from p_species
    or v_source.breed is distinct from p_breed
    or v_source.lifecycle_status <> 'published'
    or not v_source.is_active
    or v_source.deleted_at is not null
  then
    raise exception 'Initial variant origin must be an active published matching template version'
      using errcode = '23514';
  end if;

  insert into public.reservation_document_variants (
    id, organization_id, reservation_id, template_family_id,
    document_type, species, breed, created_by, updated_by
  ) values (
    v_variant_id, p_organization_id, p_reservation_id, p_template_family_id,
    p_document_type, p_species, p_breed, v_user_id, v_user_id
  );

  insert into public.reservation_document_variant_versions (
    id, organization_id, variant_id, version,
    source_template_id, source_template_version,
    template_format, template_content, lifecycle_status,
    created_by, updated_by
  ) values (
    v_version_id, p_organization_id, v_variant_id, 1,
    v_source.id, v_source.version,
    v_source.template_format, v_source.template_content, 'draft',
    v_user_id, v_user_id
  );

  return query select v_variant_id, v_version_id, 1;
end
$$;

create or replace function public.create_reservation_document_variant_version(
  p_organization_id uuid,
  p_variant_id uuid,
  p_version_id uuid default null
)
returns table (version_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant public.reservation_document_variants%rowtype;
  v_publication public.reservation_document_variant_versions%rowtype;
  v_next_version integer;
  v_version_id uuid := coalesce(p_version_id, gen_random_uuid());
begin
  select variant.* into v_variant
  from public.reservation_document_variants variant
  where variant.organization_id = p_organization_id
    and variant.id = p_variant_id
  for update;

  if not found or v_variant.deleted_at is not null then
    raise exception 'Active reservation document variant not found'
      using errcode = 'P0002';
  end if;

  if v_user_id is null or not public.has_organization_role(
    v_variant.organization_id, array['owner', 'admin', 'member']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.reservation_document_variant_versions variant_version
    where variant_version.variant_id = v_variant.id
      and variant_version.lifecycle_status = 'draft'
      and variant_version.deleted_at is null
  ) then
    raise exception 'A draft already exists for this reservation document variant'
      using errcode = '23505';
  end if;

  select variant_version.* into v_publication
  from public.reservation_document_variant_versions variant_version
  where variant_version.organization_id = v_variant.organization_id
    and variant_version.variant_id = v_variant.id
    and variant_version.lifecycle_status = 'published'
    and variant_version.deleted_at is null;

  if not found then
    raise exception 'A current variant publication is required'
      using errcode = '23514';
  end if;

  select coalesce(max(variant_version.version), 0) + 1
    into v_next_version
  from public.reservation_document_variant_versions variant_version
  where variant_version.variant_id = v_variant.id;

  insert into public.reservation_document_variant_versions (
    id, organization_id, variant_id, version,
    source_template_id, source_template_version,
    template_format, template_content, lifecycle_status,
    created_by, updated_by
  ) values (
    v_version_id, v_variant.organization_id, v_variant.id, v_next_version,
    v_publication.source_template_id, v_publication.source_template_version,
    v_publication.template_format, v_publication.template_content, 'draft',
    v_user_id, v_user_id
  );

  return query select v_version_id, v_next_version;
end
$$;

create or replace function public.publish_reservation_document_variant_version(
  p_organization_id uuid,
  p_variant_id uuid,
  p_version_id uuid,
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
  v_variant public.reservation_document_variants%rowtype;
  v_draft public.reservation_document_variant_versions%rowtype;
  v_published_at timestamptz := statement_timestamp();
begin
  select variant.* into v_variant
  from public.reservation_document_variants variant
  where variant.organization_id = p_organization_id
    and variant.id = p_variant_id
  for update;

  if not found or v_variant.deleted_at is not null then
    raise exception 'Active reservation document variant not found'
      using errcode = 'P0002';
  end if;

  if v_user_id is null or not public.has_organization_role(
    v_variant.organization_id, array['owner', 'admin']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  select variant_version.* into v_draft
  from public.reservation_document_variant_versions variant_version
  where variant_version.organization_id = v_variant.organization_id
    and variant_version.variant_id = v_variant.id
    and variant_version.id = p_version_id
  for update;

  if not found or v_draft.deleted_at is not null then
    raise exception 'Reservation document variant draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.updated_at is distinct from p_expected_updated_at
    or v_draft.template_format is distinct from p_expected_template_format
    or v_draft.template_content is distinct from p_expected_template_content
  then
    raise exception 'Reservation document variant draft is stale'
      using errcode = 'P0001';
  end if;

  if v_draft.lifecycle_status <> 'draft'
    or (v_draft.template_format = 'json' and (
      v_draft.template_content is null
      or jsonb_typeof(v_draft.template_content::jsonb) <> 'object'
    ))
  then
    raise exception 'Reservation document variant draft is not publishable'
      using errcode = '23514';
  end if;

  update public.reservation_document_variant_versions
  set
    lifecycle_status = 'retired',
    updated_at = v_published_at,
    updated_by = v_user_id
  where organization_id = v_variant.organization_id
    and variant_id = v_variant.id
    and lifecycle_status = 'published'
    and deleted_at is null;

  update public.reservation_document_variant_versions
  set
    lifecycle_status = 'published',
    published_at = v_published_at,
    published_by = v_user_id,
    updated_at = v_published_at,
    updated_by = v_user_id
  where organization_id = v_variant.organization_id
    and variant_id = v_variant.id
    and id = v_draft.id;

  return v_draft.id;
end
$$;

alter table public.reservation_document_variants enable row level security;
alter table public.reservation_document_variant_versions enable row level security;

create policy reservation_document_variants_select_member
on public.reservation_document_variants
for select to authenticated
using (public.is_member_of(organization_id));

create policy reservation_document_variant_versions_select_member
on public.reservation_document_variant_versions
for select to authenticated
using (public.is_member_of(organization_id));

create policy reservation_document_variant_versions_update_writer
on public.reservation_document_variant_versions
for update to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

revoke all on public.reservation_document_variants from anon, authenticated;
revoke all on public.reservation_document_variant_versions from anon, authenticated;
grant select on public.reservation_document_variants to authenticated;
grant select on public.reservation_document_variant_versions to authenticated;
grant update (template_format, template_content)
  on public.reservation_document_variant_versions to authenticated;

revoke all on function public.validate_reservation_document_variant() from public;
revoke all on function public.protect_reservation_document_variant() from public;
revoke all on function public.reservation_document_variant_version_is_used(uuid, uuid) from public;
revoke all on function public.validate_reservation_document_variant_version() from public;
revoke all on function public.protect_reservation_document_variant_version() from public;
revoke all on function public.create_reservation_document_variant_draft(
  uuid, uuid, uuid, uuid, integer, text, text, text, uuid, uuid
) from public;
revoke all on function public.create_reservation_document_variant_version(
  uuid, uuid, uuid
) from public;
revoke all on function public.publish_reservation_document_variant_version(
  uuid, uuid, uuid, timestamptz, text, text
) from public;

grant execute on function public.create_reservation_document_variant_draft(
  uuid, uuid, uuid, uuid, integer, text, text, text, uuid, uuid
) to authenticated;
grant execute on function public.reservation_document_variant_version_is_used(uuid, uuid)
  to authenticated;
grant execute on function public.create_reservation_document_variant_version(
  uuid, uuid, uuid
) to authenticated;
grant execute on function public.publish_reservation_document_variant_version(
  uuid, uuid, uuid, timestamptz, text, text
) to authenticated;

alter table public.organizations
  add column legal_form text,
  add constraint organizations_legal_form_check
    check (legal_form is null or legal_form in (
      'individual', 'earl', 'company', 'association', 'other'
    ));

create table public.organization_representatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text,
  last_name text,
  display_name text not null,
  representative_role text,
  email text,
  phone text,
  is_default_signatory boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint organization_representatives_organization_id_id_key unique (organization_id, id),
  constraint organization_representatives_display_name_check
    check (btrim(display_name) <> '')
);

create index organization_representatives_organization_id_idx
  on public.organization_representatives (organization_id);

create unique index organization_representatives_one_default_signatory_idx
  on public.organization_representatives (organization_id)
  where is_default_signatory and is_active and deleted_at is null;

create trigger organization_representatives_set_updated_at
before update on public.organization_representatives
for each row execute function public.set_updated_at();

create table public.organization_document_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  mediator_name text,
  mediator_contact text,
  mediator_website_url text,
  deposit_terms text,
  refund_terms text,
  postponement_terms text,
  credit_terms text,
  withholding_terms text,
  reservation_contract_terms text,
  commitment_certificate_text text,
  legal_mentions text,
  signature_city_default text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint organization_document_settings_organization_id_key unique (organization_id),
  constraint organization_document_settings_organization_id_id_key unique (organization_id, id)
);

create index organization_document_settings_organization_id_idx
  on public.organization_document_settings (organization_id);

create trigger organization_document_settings_set_updated_at
before update on public.organization_document_settings
for each row execute function public.set_updated_at();

alter table public.organization_representatives enable row level security;
alter table public.organization_document_settings enable row level security;

create policy organization_representatives_select_member
on public.organization_representatives
for select
to authenticated
using (public.is_member_of(organization_id));

create policy organization_representatives_insert_admin
on public.organization_representatives
for insert
to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy organization_representatives_update_admin
on public.organization_representatives
for update
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy organization_document_settings_select_member
on public.organization_document_settings
for select
to authenticated
using (public.is_member_of(organization_id));

create policy organization_document_settings_insert_admin
on public.organization_document_settings
for insert
to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy organization_document_settings_update_admin
on public.organization_document_settings
for update
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

grant select, insert, update on table
  public.organization_representatives,
  public.organization_document_settings
to authenticated;

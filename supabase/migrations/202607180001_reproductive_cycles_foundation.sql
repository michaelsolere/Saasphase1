create table public.reproductive_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  mother_id uuid not null,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  status text not null default 'planned',
  started_on date not null,
  ended_on date,
  litter_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint reproductive_cycles_organization_id_id_key
    unique (organization_id, id),
  constraint reproductive_cycles_mother_organization_fk
    foreign key (organization_id, mother_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint reproductive_cycles_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint reproductive_cycles_litter_unique
    unique (organization_id, litter_id),
  constraint reproductive_cycles_species_check
    check (species in ('dog', 'cat')),
  constraint reproductive_cycles_status_check
    check (status in ('planned', 'in_progress', 'mated', 'closed', 'cancelled')),
  constraint reproductive_cycles_dates_check
    check (ended_on is null or ended_on >= started_on),
  constraint reproductive_cycles_litter_reserved_check
    check (litter_id is null)
);

create unique index reproductive_cycles_one_active_per_mother_idx
  on public.reproductive_cycles (organization_id, mother_id)
  where deleted_at is null
    and status in ('planned', 'in_progress', 'mated');

create index reproductive_cycles_mother_started_on_idx
  on public.reproductive_cycles (organization_id, mother_id, started_on desc)
  where deleted_at is null;

create index reproductive_cycles_status_idx
  on public.reproductive_cycles (organization_id, status)
  where deleted_at is null;

create or replace function public.validate_reproductive_cycle_mother()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_mother public.animals%rowtype;
begin
  select animal.*
  into v_mother
  from public.animals animal
  where animal.organization_id = new.organization_id
    and animal.id = new.mother_id
    and animal.deleted_at is null;

  if not found then
    raise exception 'reproductive cycle mother not found in organization'
      using errcode = '23514';
  end if;

  if v_mother.sex <> 'female' then
    raise exception 'reproductive cycle mother must be female'
      using errcode = '23514';
  end if;

  if v_mother.species <> new.species then
    raise exception 'reproductive cycle species must match mother species'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger reproductive_cycles_validate_mother
before insert or update of organization_id, mother_id, species
on public.reproductive_cycles
for each row execute function public.validate_reproductive_cycle_mother();

create trigger reproductive_cycles_set_updated_at
before update on public.reproductive_cycles
for each row execute function public.set_updated_at();

create table public.progesterone_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cycle_id uuid not null,
  measured_at timestamptz not null,
  resulted_at timestamptz,
  value numeric(12, 4) not null,
  unit text not null,
  laboratory_name text,
  sample_reference text,
  method text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint progesterone_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint progesterone_measurements_cycle_organization_fk
    foreign key (organization_id, cycle_id)
    references public.reproductive_cycles (organization_id, id) on delete restrict,
  constraint progesterone_measurements_value_check
    check (value > 0),
  constraint progesterone_measurements_unit_check
    check (unit in ('ng_ml', 'nmol_l'))
);

create index progesterone_measurements_cycle_measured_at_idx
  on public.progesterone_measurements (
    organization_id,
    cycle_id,
    measured_at desc,
    created_at desc
  )
  where deleted_at is null;

create trigger progesterone_measurements_set_updated_at
before update on public.progesterone_measurements
for each row execute function public.set_updated_at();

alter table public.reproductive_cycles enable row level security;
alter table public.progesterone_measurements enable row level security;

create policy reproductive_cycles_select_member
on public.reproductive_cycles
for select
to authenticated
using (public.is_member_of(organization_id));

create policy reproductive_cycles_insert_writer
on public.reproductive_cycles
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
);

create policy reproductive_cycles_update_writer
on public.reproductive_cycles
for update
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
);

create policy progesterone_measurements_select_member
on public.progesterone_measurements
for select
to authenticated
using (public.is_member_of(organization_id));

create policy progesterone_measurements_insert_writer
on public.progesterone_measurements
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
);

create policy progesterone_measurements_update_writer
on public.progesterone_measurements
for update
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin', 'member']
  )
);

revoke all on public.reproductive_cycles from anon, authenticated;
revoke all on public.progesterone_measurements from anon, authenticated;

grant select, insert, update on public.reproductive_cycles to authenticated;
grant select, insert, update on public.progesterone_measurements to authenticated;

revoke all on function public.validate_reproductive_cycle_mother() from public;

comment on column public.reproductive_cycles.litter_id is
  'Reserved for a later cycle-to-litter linking lot; constrained to null in this foundation.';

comment on column public.progesterone_measurements.unit is
  'Stored exactly as measured: ng_ml or nmol_l. No implicit unit conversion.';

create table public.maternal_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  mother_id uuid not null,
  observation_type text not null,
  observed_at timestamptz not null,
  timezone_name text not null,
  numeric_value numeric(12, 4),
  unit text,
  severity text not null default 'routine',
  note text,
  client_command_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint maternal_observations_organization_id_id_key
    unique (organization_id, id),
  constraint maternal_observations_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint maternal_observations_mother_organization_fk
    foreign key (organization_id, mother_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint maternal_observations_client_command_key
    unique (organization_id, client_command_id),
  constraint maternal_observations_type_check
    check (
      observation_type in (
        'temperature', 'appetite', 'behavior', 'discharge',
        'contractions', 'lactation', 'health', 'other'
      )
    ),
  constraint maternal_observations_severity_check
    check (severity in ('routine', 'watch', 'concern', 'urgent')),
  constraint maternal_observations_values_check
    check (
      (
        observation_type = 'temperature'
        and numeric_value is not null
        and numeric_value > 0
        and unit in ('celsius', 'fahrenheit')
      )
      or (
        observation_type <> 'temperature'
        and numeric_value is null
        and unit is null
        and nullif(btrim(note), '') is not null
      )
    )
);

create index maternal_observations_litter_observed_at_idx
  on public.maternal_observations (
    organization_id,
    litter_id,
    observed_at desc,
    created_at desc
  );

create index maternal_observations_mother_observed_at_idx
  on public.maternal_observations (
    organization_id,
    mother_id,
    observed_at desc,
    created_at desc
  );

create or replace function public.validate_maternal_observation_mother()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_litter_mother_id uuid;
  v_mother public.animals%rowtype;
begin
  select litter.mother_id
  into v_litter_mother_id
  from public.litters litter
  where litter.organization_id = new.organization_id
    and litter.id = new.litter_id
    and litter.deleted_at is null
  for share;

  if not found then
    raise exception 'maternal observation litter not found in organization'
      using errcode = '23514';
  end if;

  if v_litter_mother_id is distinct from new.mother_id then
    raise exception 'maternal observation mother must match litter mother'
      using errcode = '23514';
  end if;

  select animal.*
  into v_mother
  from public.animals animal
  where animal.organization_id = new.organization_id
    and animal.id = new.mother_id
    and animal.deleted_at is null
  for share;

  if not found then
    raise exception 'maternal observation mother not found in organization'
      using errcode = '23514';
  end if;

  if v_mother.sex <> 'female' then
    raise exception 'maternal observation mother must be female'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger maternal_observations_validate_mother
before insert on public.maternal_observations
for each row execute function public.validate_maternal_observation_mother();

create or replace function public.prevent_maternal_observation_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'recorded maternal observations are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger maternal_observations_immutable
before update or delete
on public.maternal_observations
for each row execute function public.prevent_maternal_observation_mutation();

alter table public.maternal_observations enable row level security;

create policy maternal_observations_select_member
on public.maternal_observations
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.record_maternal_observation(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_observed_at timestamptz,
  p_timezone_name text,
  p_observation_type text,
  p_numeric_value numeric,
  p_unit text,
  p_severity text,
  p_note text
)
returns table (
  outcome text,
  observation_id uuid,
  litter_id uuid,
  mother_id uuid,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_litter_organization_id uuid;
  v_membership_role text;
  v_litter public.litters%rowtype;
  v_mother public.animals%rowtype;
  v_existing_observation public.maternal_observations%rowtype;
begin
  outcome := 'error';
  observation_id := null;
  litter_id := p_litter_id;
  mother_id := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_observed_at is null
    or p_timezone_name is null
    or p_observation_type is null
    or p_severity is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select litter.organization_id
  into v_litter_organization_id
  from public.litters litter
  where litter.id = p_litter_id
    and litter.deleted_at is null;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_litter_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_litter_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_existing_observation
  from public.maternal_observations observation
  where observation.organization_id = v_litter_organization_id
    and observation.client_command_id = p_client_command_id;

  if found then
    if v_existing_observation.litter_id <> p_litter_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    observation_id := v_existing_observation.id;
    litter_id := v_existing_observation.litter_id;
    mother_id := v_existing_observation.mother_id;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_litter
  from public.litters litter
  where litter.organization_id = v_litter_organization_id
    and litter.id = p_litter_id
    and litter.deleted_at is null
  for update;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  select *
  into v_mother
  from public.animals animal
  where animal.organization_id = v_litter.organization_id
    and animal.id = v_litter.mother_id
    and animal.deleted_at is null
  for update;

  if not found or v_mother.sex <> 'female' then
    reason := 'mother_ineligible';
    return next;
    return;
  end if;

  if v_litter.status not in (
    'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed',
    'birth_expected', 'birth_in_progress', 'born', 'puppies_created',
    'choice_period', 'ready_to_leave'
  ) then
    reason := 'litter_not_open';
    return next;
    return;
  end if;

  if p_observation_type not in (
    'temperature', 'appetite', 'behavior', 'discharge',
    'contractions', 'lactation', 'health', 'other'
  ) then
    reason := 'invalid_observation_type';
    return next;
    return;
  end if;

  if p_severity not in ('routine', 'watch', 'concern', 'urgent') then
    reason := 'invalid_severity';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = p_timezone_name
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  if p_observation_type = 'temperature' then
    if p_numeric_value is null
      or p_numeric_value <= 0
      or p_unit not in ('celsius', 'fahrenheit') then
      reason := 'invalid_temperature';
      return next;
      return;
    end if;
  elsif p_numeric_value is not null
    or p_unit is not null
    or nullif(btrim(p_note), '') is null then
    reason := 'invalid_observation_values';
    return next;
    return;
  end if;

  insert into public.maternal_observations (
    organization_id,
    litter_id,
    mother_id,
    observation_type,
    observed_at,
    timezone_name,
    numeric_value,
    unit,
    severity,
    note,
    client_command_id,
    created_by,
    updated_by
  ) values (
    v_litter.organization_id,
    v_litter.id,
    v_mother.id,
    p_observation_type,
    p_observed_at,
    p_timezone_name,
    p_numeric_value,
    p_unit,
    p_severity,
    nullif(btrim(p_note), ''),
    p_client_command_id,
    v_user_id,
    v_user_id
  )
  returning id into observation_id;

  outcome := 'success';
  litter_id := v_litter.id;
  mother_id := v_mother.id;
  return next;
end;
$$;

revoke all on table public.maternal_observations from anon, authenticated;
grant select on table public.maternal_observations to authenticated;

revoke all on function public.validate_maternal_observation_mother() from public;
revoke all on function public.prevent_maternal_observation_mutation() from public;
revoke all on function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
) from public;
grant execute on function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
) to authenticated;

comment on table public.maternal_observations is
  'Append-only maternal observations recorded exclusively by record_maternal_observation.';

comment on column public.maternal_observations.numeric_value is
  'Temperature value stored exactly in the user-entered unit; no implicit conversion.';

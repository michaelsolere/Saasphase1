do $$
declare
  v_duplicate_groups integer;
begin
  select count(*)::integer
  into v_duplicate_groups
  from (
    select animal.organization_id, animal.litter_id, animal.birth_order
    from public.animals animal
    where animal.deleted_at is null
      and animal.litter_id is not null
      and animal.birth_order is not null
    group by animal.organization_id, animal.litter_id, animal.birth_order
    having count(*) > 1
  ) duplicates;

  if v_duplicate_groups > 0 then
    raise exception
      'whelping birth migration blocked: % active litter birth-order duplicate group(s) found',
      v_duplicate_groups
      using errcode = '23505';
  end if;
end;
$$;

create unique index animals_active_litter_birth_order_key
  on public.animals (organization_id, litter_id, birth_order)
  where deleted_at is null
    and litter_id is not null
    and birth_order is not null;

alter table public.whelping_events
  add constraint whelping_events_organization_session_id_key
  unique (organization_id, session_id, id);

create table public.whelping_births (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  session_id uuid not null,
  event_id uuid not null unique,
  animal_id uuid not null unique,
  birth_order integer not null,
  sex text not null,
  viability text not null,
  initial_collar_color text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint whelping_births_organization_id_id_key
    unique (organization_id, id),
  constraint whelping_births_session_organization_fk
    foreign key (organization_id, session_id)
    references public.whelping_sessions (organization_id, id) on delete restrict,
  constraint whelping_births_event_session_organization_fk
    foreign key (organization_id, session_id, event_id)
    references public.whelping_events (organization_id, session_id, id) on delete restrict,
  constraint whelping_births_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict
    deferrable initially deferred,
  constraint whelping_births_session_order_key
    unique (organization_id, session_id, birth_order),
  constraint whelping_births_birth_order_positive_check
    check (birth_order > 0),
  constraint whelping_births_sex_check
    check (sex in ('male', 'female', 'unknown')),
  constraint whelping_births_viability_check
    check (viability in ('alive', 'stillborn', 'unknown')),
  constraint whelping_births_initial_collar_color_check
    check (
      initial_collar_color is null
      or char_length(initial_collar_color) between 1 and 255
    )
);

create index whelping_births_session_order_idx
  on public.whelping_births (organization_id, session_id, birth_order);

create table public.animal_weight_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  animal_id uuid not null,
  measured_at timestamptz not null,
  grams integer not null,
  measurement_kind text not null,
  source_birth_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint animal_weight_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint animal_weight_measurements_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint animal_weight_measurements_source_birth_organization_fk
    foreign key (organization_id, source_birth_id)
    references public.whelping_births (organization_id, id) on delete restrict,
  constraint animal_weight_measurements_source_birth_key
    unique (source_birth_id),
  constraint animal_weight_measurements_grams_check
    check (grams between 1 and 100000),
  constraint animal_weight_measurements_kind_check
    check (measurement_kind in ('birth', 'routine', 'clinical')),
  constraint animal_weight_measurements_birth_source_check
    check (
      (measurement_kind = 'birth' and source_birth_id is not null)
      or (measurement_kind in ('routine', 'clinical') and source_birth_id is null)
    ),
  constraint animal_weight_measurements_note_check
    check (note is null or char_length(note) <= 5000)
);

create index animal_weight_measurements_animal_measured_at_idx
  on public.animal_weight_measurements (
    organization_id,
    animal_id,
    measured_at,
    created_at
  );

alter table public.whelping_commands
  add column birth_id uuid,
  add column animal_id uuid,
  add column weight_measurement_id uuid,
  add column sex text,
  add column viability text,
  add column initial_collar_color text,
  add column weight_grams integer,
  add column measured_at timestamptz,
  add column result_birth_order integer;

alter table public.whelping_commands
  add constraint whelping_commands_birth_organization_fk
    foreign key (organization_id, birth_id)
    references public.whelping_births (organization_id, id) on delete restrict,
  add constraint whelping_commands_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  add constraint whelping_commands_weight_measurement_organization_fk
    foreign key (organization_id, weight_measurement_id)
    references public.animal_weight_measurements (organization_id, id) on delete restrict;

alter table public.whelping_commands
  drop constraint whelping_commands_type_check,
  drop constraint whelping_commands_event_type_check,
  drop constraint whelping_commands_values_check;

alter table public.whelping_commands
  add constraint whelping_commands_type_check
    check (command_type in (
      'open_session', 'record_event', 'close_session', 'record_birth'
    )),
  add constraint whelping_commands_event_type_check
    check (
      event_type is null
      or event_type in (
        'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
        'vet_called', 'intervention', 'observation', 'birth', 'session_closed'
      )
    ),
  add constraint whelping_commands_birth_values_check
    check (
      (sex is null or sex in ('male', 'female', 'unknown'))
      and (viability is null or viability in ('alive', 'stillborn', 'unknown'))
      and (
        initial_collar_color is null
        or char_length(initial_collar_color) between 1 and 255
      )
      and (weight_grams is null or weight_grams between 1 and 100000)
      and (result_birth_order is null or result_birth_order > 0)
    ),
  add constraint whelping_commands_values_check
    check (
      (
        command_type = 'open_session'
        and event_id is null
        and started_at is not null
        and ended_at is null
        and occurred_at is null
        and timezone_name is not null
        and event_type is null
        and result_sequence_no is null
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'record_event'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type in (
          'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
          'vet_called', 'intervention', 'observation'
        )
        and result_sequence_no > 0
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'close_session'
        and event_id is not null
        and started_at is null
        and ended_at is not null
        and occurred_at is null
        and timezone_name is null
        and event_type = 'session_closed'
        and result_sequence_no > 0
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'record_birth'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type = 'birth'
        and result_sequence_no > 0
        and birth_id is not null
        and animal_id is not null
        and sex is not null
        and viability is not null
        and result_birth_order > 0
        and (
          (
            weight_grams is null
            and measured_at is null
            and weight_measurement_id is null
          )
          or (
            weight_grams is not null
            and measured_at is not null
            and weight_measurement_id is not null
          )
        )
      )
    );

create or replace function public.prevent_whelping_birth_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on' then
    raise exception 'whelping births are inserted exclusively by the dedicated command'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger whelping_births_guard_insert
before insert on public.whelping_births
for each row execute function public.prevent_whelping_birth_insert();

create or replace function public.prevent_whelping_birth_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'recorded whelping births are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger whelping_births_immutable
before update or delete on public.whelping_births
for each row execute function public.prevent_whelping_birth_mutation();

create or replace function public.prevent_animal_weight_measurement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on' then
    raise exception 'animal weight measurements are inserted exclusively by dedicated commands'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger animal_weight_measurements_guard_insert
before insert on public.animal_weight_measurements
for each row execute function public.prevent_animal_weight_measurement_insert();

create or replace function public.prevent_animal_weight_measurement_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'animal weight measurements are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger animal_weight_measurements_immutable
before update or delete on public.animal_weight_measurements
for each row execute function public.prevent_animal_weight_measurement_mutation();

create or replace function public.validate_birth_weight_measurement_link()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.measurement_kind = 'birth' and not exists (
    select 1
    from public.whelping_births birth
    where birth.organization_id = new.organization_id
      and birth.id = new.source_birth_id
      and birth.animal_id = new.animal_id
  ) then
    raise exception 'birth weight measurement links are inconsistent'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger animal_weight_measurements_validate_birth_link
before insert or update on public.animal_weight_measurements
for each row execute function public.validate_birth_weight_measurement_link();

create or replace function public.validate_whelping_birth_links()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_session public.whelping_sessions%rowtype;
  v_event public.whelping_events%rowtype;
  v_litter public.litters%rowtype;
  v_animal public.animals%rowtype;
begin
  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = new.organization_id
    and session.id = new.session_id;

  select event.*
  into v_event
  from public.whelping_events event
  where event.organization_id = new.organization_id
    and event.session_id = new.session_id
    and event.id = new.event_id;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = new.organization_id
    and litter.id = v_session.litter_id;

  select animal.*
  into v_animal
  from public.animals animal
  where animal.organization_id = new.organization_id
    and animal.id = new.animal_id;

  if v_event.event_type is distinct from 'birth'
    or v_animal.litter_id is distinct from v_litter.id
    or v_animal.mother_id is distinct from v_litter.mother_id
    or v_animal.father_id is distinct from v_litter.father_id
    or v_animal.species is distinct from v_litter.species
    or v_animal.breed is distinct from v_litter.breed
    or v_animal.sex is distinct from new.sex
    or v_animal.birth_order is distinct from new.birth_order
    or v_animal.ownership_status is distinct from 'produced' then
    raise exception 'whelping birth links are inconsistent'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger whelping_births_validate_links
after insert or update on public.whelping_births
deferrable initially deferred
for each row execute function public.validate_whelping_birth_links();

create or replace function public.prevent_mixed_mode_produced_animal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.ownership_status <> 'produced'
    or new.litter_id is null
    or current_setting('app.whelping_birth_rpc', true) = 'on' then
    return new;
  end if;

  perform 1
  from public.litters litter
  where litter.organization_id = new.organization_id
    and litter.id = new.litter_id
  for update;

  if exists (
    select 1
    from public.whelping_sessions session
    where session.organization_id = new.organization_id
      and session.litter_id = new.litter_id
      and session.status = 'open'
  ) or exists (
    select 1
    from public.whelping_births birth
    join public.whelping_sessions session
      on session.organization_id = birth.organization_id
     and session.id = birth.session_id
    where birth.organization_id = new.organization_id
      and session.litter_id = new.litter_id
  ) then
    raise exception 'administrative offspring creation is unavailable for this litter'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger animals_prevent_mixed_mode_produced_insert
before insert on public.animals
for each row execute function public.prevent_mixed_mode_produced_animal_insert();

create or replace function public.protect_whelping_birth_animal_projections()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if exists (
    select 1
    from public.whelping_births birth
    where birth.organization_id = old.organization_id
      and birth.animal_id = old.id
  ) and (
    new.organization_id is distinct from old.organization_id
    or new.litter_id is distinct from old.litter_id
    or new.mother_id is distinct from old.mother_id
    or new.father_id is distinct from old.father_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.sex is distinct from old.sex
    or new.birth_date is distinct from old.birth_date
    or new.birth_time is distinct from old.birth_time
    or new.birth_order is distinct from old.birth_order
    or new.birth_weight_grams is distinct from old.birth_weight_grams
    or new.collar_color_initial is distinct from old.collar_color_initial
  ) then
    raise exception 'journal birth projections on the animal are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger animals_protect_whelping_birth_projections
before update on public.animals
for each row execute function public.protect_whelping_birth_animal_projections();

create or replace function public.protect_whelping_litter_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_has_open_session boolean;
  v_has_birth boolean;
begin
  select exists (
    select 1
    from public.whelping_sessions session
    where session.organization_id = old.organization_id
      and session.litter_id = old.id
      and session.status = 'open'
  ) into v_has_open_session;

  select exists (
    select 1
    from public.whelping_births birth
    join public.whelping_sessions session
      on session.organization_id = birth.organization_id
     and session.id = birth.session_id
    where session.organization_id = old.organization_id
      and session.litter_id = old.id
  ) into v_has_birth;

  if (v_has_open_session or v_has_birth) and (
    new.mother_id is distinct from old.mother_id
    or new.father_id is distinct from old.father_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
  ) then
    raise exception 'litter parentage and taxonomy are locked by the whelping journal'
      using errcode = '55000';
  end if;

  if v_has_birth
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on'
    and (
      new.actual_birth_date is distinct from old.actual_birth_date
      or new.born_total_count is distinct from old.born_total_count
      or new.born_male_count is distinct from old.born_male_count
      or new.born_female_count is distinct from old.born_female_count
      or new.alive_count is distinct from old.alive_count
    ) then
    raise exception 'journal birth projections on the litter are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger litters_protect_whelping_fields
before update on public.litters
for each row execute function public.protect_whelping_litter_fields();

alter table public.whelping_births enable row level security;
alter table public.animal_weight_measurements enable row level security;

create policy whelping_births_select_member
on public.whelping_births
for select
to authenticated
using (public.is_member_of(organization_id));

create policy animal_weight_measurements_select_member
on public.animal_weight_measurements
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.record_whelping_birth(
  p_session_id uuid,
  p_client_command_id uuid,
  p_occurred_at timestamptz,
  p_sex text,
  p_viability text,
  p_initial_collar_color text default null,
  p_weight_grams integer default null,
  p_measured_at timestamptz default null,
  p_note text default null
)
returns table (
  outcome text,
  birth_id uuid,
  event_id uuid,
  animal_id uuid,
  weight_measurement_id uuid,
  event_sequence_no integer,
  birth_order integer,
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
  v_session_organization_id uuid;
  v_membership_role text;
  v_session public.whelping_sessions%rowtype;
  v_litter public.litters%rowtype;
  v_mother public.animals%rowtype;
  v_father public.animals%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_initial_collar_color text := nullif(btrim(p_initial_collar_color), '');
  v_note text := nullif(btrim(p_note), '');
  v_local_birth_date date;
  v_local_birth_time time;
  v_existing_birth_count integer;
  v_first_birth_date date;
  v_born_total integer;
  v_born_male integer;
  v_born_female integer;
  v_alive integer;
begin
  outcome := 'error';
  birth_id := null;
  event_id := null;
  animal_id := null;
  weight_measurement_id := null;
  event_sequence_no := null;
  birth_order := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_session_id is null
    or p_client_command_id is null
    or p_occurred_at is null
    or not pg_catalog.isfinite(p_occurred_at)
    or p_sex is null
    or p_sex not in ('male', 'female', 'unknown')
    or p_viability is null
    or p_viability not in ('alive', 'stillborn', 'unknown')
    or (v_initial_collar_color is not null and char_length(v_initial_collar_color) > 255)
    or (v_note is not null and char_length(v_note) > 5000)
    or (p_weight_grams is not null and p_weight_grams not between 1 and 100000)
    or (p_weight_grams is not null and p_measured_at is null)
    or (p_weight_grams is null and p_measured_at is not null)
    or (p_measured_at is not null and not pg_catalog.isfinite(p_measured_at)) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select session.organization_id
  into v_session_organization_id
  from public.whelping_sessions session
  where session.id = p_session_id;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_session_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'session_not_found';
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
      'whelping_commands:' || v_session_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = v_session_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_session.organization_id
    and litter.id = v_session.litter_id
    and litter.deleted_at is null
  for update;

  if not found then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_session.organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'record_birth'
      or v_existing_command.session_id <> p_session_id
      or v_existing_command.occurred_at <> p_occurred_at
      or v_existing_command.sex is distinct from p_sex
      or v_existing_command.viability is distinct from p_viability
      or v_existing_command.initial_collar_color is distinct from v_initial_collar_color
      or v_existing_command.weight_grams is distinct from p_weight_grams
      or v_existing_command.measured_at is distinct from p_measured_at
      or v_existing_command.note is distinct from v_note then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    birth_id := v_existing_command.birth_id;
    event_id := v_existing_command.event_id;
    animal_id := v_existing_command.animal_id;
    weight_measurement_id := v_existing_command.weight_measurement_id;
    event_sequence_no := v_existing_command.result_sequence_no;
    birth_order := v_existing_command.result_birth_order;
    replayed := true;
    return next;
    return;
  end if;

  if v_session.status <> 'open' or v_session.ended_at is not null then
    reason := 'session_closed';
    return next;
    return;
  end if;

  if v_session.mother_id is distinct from v_litter.mother_id
    or v_litter.mother_id is null then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  select mother.*
  into v_mother
  from public.animals mother
  where mother.organization_id = v_litter.organization_id
    and mother.id = v_litter.mother_id
    and mother.deleted_at is null
  for share;

  if not found
    or v_mother.sex <> 'female'
    or v_mother.species is distinct from v_litter.species
    or v_mother.breed is distinct from v_litter.breed then
    reason := 'invalid_parent';
    return next;
    return;
  end if;

  if v_litter.father_id is not null then
    select father.*
    into v_father
    from public.animals father
    where father.organization_id = v_litter.organization_id
      and father.id = v_litter.father_id
      and father.deleted_at is null
    for share;

    if not found
      or v_father.sex <> 'male'
      or v_father.species is distinct from v_litter.species
      or v_father.breed is distinct from v_litter.breed
      or v_father.id = v_mother.id then
      reason := 'invalid_parent';
      return next;
      return;
    end if;
  end if;

  if p_occurred_at < v_session.started_at then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  v_local_birth_date := (p_occurred_at at time zone v_session.timezone_name)::date;
  v_local_birth_time := (p_occurred_at at time zone v_session.timezone_name)::time;

  select count(*)::integer
  into v_existing_birth_count
  from public.whelping_births birth
  join public.whelping_sessions session
    on session.organization_id = birth.organization_id
   and session.id = birth.session_id
  where session.organization_id = v_litter.organization_id
    and session.litter_id = v_litter.id;

  if exists (
    select 1
    from public.animals animal
    where animal.organization_id = v_litter.organization_id
      and animal.litter_id = v_litter.id
      and animal.ownership_status = 'produced'
      and animal.deleted_at is null
      and not exists (
        select 1
        from public.whelping_births birth
        where birth.organization_id = animal.organization_id
          and birth.animal_id = animal.id
      )
  ) then
    reason := 'administrative_offspring_exists';
    return next;
    return;
  end if;

  if v_existing_birth_count = 0
    and v_litter.actual_birth_date is not null
    and v_litter.actual_birth_date <> v_local_birth_date then
    reason := 'actual_birth_date_conflict';
    return next;
    return;
  end if;

  select coalesce(max(event.sequence_no), 0) + 1
  into event_sequence_no
  from public.whelping_events event
  where event.organization_id = v_session.organization_id
    and event.session_id = v_session.id;

  select coalesce(max(birth.birth_order), 0) + 1
  into birth_order
  from public.whelping_births birth
  join public.whelping_sessions session
    on session.organization_id = birth.organization_id
   and session.id = birth.session_id
  where session.organization_id = v_litter.organization_id
    and session.litter_id = v_litter.id;

  birth_id := gen_random_uuid();
  event_id := gen_random_uuid();
  animal_id := gen_random_uuid();
  if p_weight_grams is not null then
    weight_measurement_id := gen_random_uuid();
  end if;

  perform pg_catalog.set_config('app.whelping_birth_rpc', 'on', true);

  insert into public.whelping_events (
    id,
    organization_id,
    session_id,
    sequence_no,
    occurred_at,
    event_type,
    note,
    author_id
  ) values (
    event_id,
    v_session.organization_id,
    v_session.id,
    event_sequence_no,
    p_occurred_at,
    'birth',
    v_note,
    v_user_id
  );

  insert into public.whelping_births (
    id,
    organization_id,
    session_id,
    event_id,
    animal_id,
    birth_order,
    sex,
    viability,
    initial_collar_color,
    created_by
  ) values (
    birth_id,
    v_session.organization_id,
    v_session.id,
    event_id,
    animal_id,
    birth_order,
    p_sex,
    p_viability,
    v_initial_collar_color,
    v_user_id
  );

  insert into public.animals (
    id,
    organization_id,
    litter_id,
    mother_id,
    father_id,
    species,
    breed,
    sex,
    birth_date,
    birth_time,
    birth_order,
    birth_weight_grams,
    collar_color_initial,
    collar_color_current,
    ownership_status,
    status,
    death_date,
    created_by,
    updated_by
  ) values (
    animal_id,
    v_litter.organization_id,
    v_litter.id,
    v_litter.mother_id,
    v_litter.father_id,
    v_litter.species,
    v_litter.breed,
    p_sex,
    v_local_birth_date,
    v_local_birth_time,
    birth_order,
    p_weight_grams,
    v_initial_collar_color,
    v_initial_collar_color,
    'produced',
    case when p_viability = 'stillborn' then 'stillborn' else 'born' end,
    case when p_viability = 'stillborn' then v_local_birth_date else null end,
    v_user_id,
    v_user_id
  );

  if p_weight_grams is not null then
    insert into public.animal_weight_measurements (
      id,
      organization_id,
      animal_id,
      measured_at,
      grams,
      measurement_kind,
      source_birth_id,
      created_by
    ) values (
      weight_measurement_id,
      v_litter.organization_id,
      animal_id,
      p_measured_at,
      p_weight_grams,
      'birth',
      birth_id,
      v_user_id
    );
  end if;

  select
    first_birth.local_date,
    aggregates.born_total,
    aggregates.born_male,
    aggregates.born_female,
    aggregates.alive
  into
    v_first_birth_date,
    v_born_total,
    v_born_male,
    v_born_female,
    v_alive
  from lateral (
    select (event.occurred_at at time zone session.timezone_name)::date as local_date
    from public.whelping_births birth
    join public.whelping_sessions session
      on session.organization_id = birth.organization_id
     and session.id = birth.session_id
    join public.whelping_events event
      on event.organization_id = birth.organization_id
     and event.id = birth.event_id
    where session.organization_id = v_litter.organization_id
      and session.litter_id = v_litter.id
    order by birth.birth_order, event.sequence_no
    limit 1
  ) first_birth
  cross join lateral (
    select
      count(*)::integer as born_total,
      count(*) filter (where birth.sex = 'male')::integer as born_male,
      count(*) filter (where birth.sex = 'female')::integer as born_female,
      count(*) filter (where birth.viability = 'alive')::integer as alive
    from public.whelping_births birth
    join public.whelping_sessions session
      on session.organization_id = birth.organization_id
     and session.id = birth.session_id
    where session.organization_id = v_litter.organization_id
      and session.litter_id = v_litter.id
  ) aggregates;

  update public.litters
  set
    actual_birth_date = v_first_birth_date,
    born_total_count = v_born_total,
    born_male_count = v_born_male,
    born_female_count = v_born_female,
    alive_count = v_alive,
    updated_by = v_user_id
  where organization_id = v_litter.organization_id
    and id = v_litter.id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    event_id,
    occurred_at,
    event_type,
    note,
    result_sequence_no,
    birth_id,
    animal_id,
    weight_measurement_id,
    sex,
    viability,
    initial_collar_color,
    weight_grams,
    measured_at,
    result_birth_order,
    created_by
  ) values (
    v_session.organization_id,
    p_client_command_id,
    'record_birth',
    v_litter.id,
    v_session.id,
    event_id,
    p_occurred_at,
    'birth',
    v_note,
    event_sequence_no,
    birth_id,
    animal_id,
    weight_measurement_id,
    p_sex,
    p_viability,
    v_initial_collar_color,
    p_weight_grams,
    p_measured_at,
    birth_order,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on table public.whelping_births from anon, authenticated;
revoke all on table public.animal_weight_measurements from anon, authenticated;

grant select on table public.whelping_births to authenticated;
grant select on table public.animal_weight_measurements to authenticated;

revoke all on function public.prevent_whelping_birth_insert() from public;
revoke all on function public.prevent_whelping_birth_mutation() from public;
revoke all on function public.prevent_animal_weight_measurement_insert() from public;
revoke all on function public.prevent_animal_weight_measurement_mutation() from public;
revoke all on function public.validate_birth_weight_measurement_link() from public;
revoke all on function public.validate_whelping_birth_links() from public;
revoke all on function public.prevent_mixed_mode_produced_animal_insert() from public;
revoke all on function public.protect_whelping_birth_animal_projections() from public;
revoke all on function public.protect_whelping_litter_fields() from public;
revoke all on function public.record_whelping_birth(
  uuid, uuid, timestamptz, text, text, text, integer, timestamptz, text
) from public;

grant execute on function public.record_whelping_birth(
  uuid, uuid, timestamptz, text, text, text, integer, timestamptz, text
) to authenticated;

comment on table public.whelping_births is
  'Append-only structured births recorded atomically inside an open whelping session.';

comment on table public.animal_weight_measurements is
  'Append-only source of truth for animal weights; birth measurements are created by the birth command.';

comment on column public.whelping_births.event_id is
  'The linked birth event owns the observed birth timestamp.';

comment on column public.animals.birth_weight_grams is
  'Compatibility projection of the birth measurement; animal_weight_measurements is the source of truth.';

comment on table public.whelping_events is
  'Append-only whelping timeline; birth events are created exclusively by record_whelping_birth.';

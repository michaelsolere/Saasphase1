alter table public.whelping_commands
  drop constraint whelping_commands_type_check,
  drop constraint whelping_commands_values_check;

alter table public.whelping_commands
  add constraint whelping_commands_type_check
    check (command_type in (
      'open_session', 'record_event', 'close_session', 'record_birth',
      'record_birth_weight'
    )),
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
      or (
        command_type = 'record_birth_weight'
        and event_id is null
        and started_at is null
        and ended_at is null
        and occurred_at is null
        and timezone_name is null
        and event_type is null
        and result_sequence_no is null
        and birth_id is not null
        and animal_id is not null
        and weight_measurement_id is not null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is not null
        and measured_at is not null
        and result_birth_order is null
      )
    );

create or replace function public.prevent_animal_weight_measurement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on'
    and current_setting('app.whelping_birth_weight_rpc', true) is distinct from 'on' then
    raise exception 'animal weight measurements are inserted exclusively by dedicated commands'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_whelping_birth_animal_projections()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not exists (
    select 1
    from public.whelping_births birth
    where birth.organization_id = old.organization_id
      and birth.animal_id = old.id
  ) then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.litter_id is distinct from old.litter_id
    or new.mother_id is distinct from old.mother_id
    or new.father_id is distinct from old.father_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.sex is distinct from old.sex
    or new.birth_date is distinct from old.birth_date
    or new.birth_time is distinct from old.birth_time
    or new.birth_order is distinct from old.birth_order
    or new.collar_color_initial is distinct from old.collar_color_initial then
    raise exception 'journal birth projections on the animal are immutable'
      using errcode = '55000';
  end if;

  if new.birth_weight_grams is distinct from old.birth_weight_grams
    and (
      current_setting('app.whelping_birth_weight_rpc', true) is distinct from 'on'
      or old.birth_weight_grams is not null
      or new.birth_weight_grams is null
    ) then
    raise exception 'journal birth weight projection is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.record_whelping_birth_weight(
  p_birth_id uuid,
  p_client_command_id uuid,
  p_weight_grams integer,
  p_measured_at timestamptz,
  p_note text default null
)
returns table (
  outcome text,
  birth_id uuid,
  animal_id uuid,
  weight_measurement_id uuid,
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
  v_birth_organization_id uuid;
  v_membership_role text;
  v_birth public.whelping_births%rowtype;
  v_session public.whelping_sessions%rowtype;
  v_event public.whelping_events%rowtype;
  v_animal public.animals%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_existing_measurement public.animal_weight_measurements%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  outcome := 'error';
  birth_id := p_birth_id;
  animal_id := null;
  weight_measurement_id := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_birth_id is null
    or p_client_command_id is null
    or p_weight_grams is null
    or p_weight_grams not between 1 and 100000
    or p_measured_at is null
    or not pg_catalog.isfinite(p_measured_at)
    or (v_note is not null and char_length(v_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select birth.organization_id
  into v_birth_organization_id
  from public.whelping_births birth
  where birth.id = p_birth_id;

  if not found then
    reason := 'birth_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_birth_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'birth_not_found';
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
      'whelping_commands:' || v_birth_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select birth.*
  into v_birth
  from public.whelping_births birth
  where birth.organization_id = v_birth_organization_id
    and birth.id = p_birth_id
  for update;

  if not found then
    reason := 'birth_not_found';
    return next;
    return;
  end if;

  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = v_birth.organization_id
    and session.id = v_birth.session_id
  for update;

  select event.*
  into v_event
  from public.whelping_events event
  where event.organization_id = v_birth.organization_id
    and event.id = v_birth.event_id
  for update;

  select animal.*
  into v_animal
  from public.animals animal
  where animal.organization_id = v_birth.organization_id
    and animal.id = v_birth.animal_id
  for update;

  if v_session.id is null
    or v_session.status not in ('open', 'closed')
    or v_event.id is null
    or v_event.session_id is distinct from v_session.id
    or v_event.event_type is distinct from 'birth'
    or v_animal.id is null
    or v_animal.deleted_at is not null
    or v_animal.litter_id is distinct from v_session.litter_id
    or v_animal.birth_order is distinct from v_birth.birth_order
    or v_animal.sex is distinct from v_birth.sex then
    reason := 'birth_relations_inconsistent';
    return next;
    return;
  end if;

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_birth.organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'record_birth_weight'
      or v_existing_command.birth_id is distinct from p_birth_id
      or v_existing_command.weight_grams is distinct from p_weight_grams
      or v_existing_command.measured_at is distinct from p_measured_at
      or v_existing_command.note is distinct from v_note then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    animal_id := v_existing_command.animal_id;
    weight_measurement_id := v_existing_command.weight_measurement_id;
    replayed := true;
    return next;
    return;
  end if;

  if p_measured_at < v_event.occurred_at then
    reason := 'measured_before_birth';
    return next;
    return;
  end if;

  select measurement.*
  into v_existing_measurement
  from public.animal_weight_measurements measurement
  where measurement.organization_id = v_birth.organization_id
    and measurement.measurement_kind = 'birth'
    and (
      measurement.source_birth_id = v_birth.id
      or measurement.animal_id = v_birth.animal_id
    )
  limit 1
  for update;

  if found then
    reason := 'birth_weight_already_recorded';
    return next;
    return;
  end if;

  if v_animal.birth_weight_grams is not null then
    reason := 'birth_weight_inconsistent';
    return next;
    return;
  end if;

  animal_id := v_birth.animal_id;
  weight_measurement_id := gen_random_uuid();

  perform pg_catalog.set_config('app.whelping_birth_weight_rpc', 'on', true);

  insert into public.animal_weight_measurements (
    id,
    organization_id,
    animal_id,
    measured_at,
    grams,
    measurement_kind,
    source_birth_id,
    note,
    created_by
  ) values (
    weight_measurement_id,
    v_birth.organization_id,
    animal_id,
    p_measured_at,
    p_weight_grams,
    'birth',
    v_birth.id,
    v_note,
    v_user_id
  );

  update public.animals
  set birth_weight_grams = p_weight_grams
  where organization_id = v_birth.organization_id
    and id = animal_id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    birth_id,
    animal_id,
    weight_measurement_id,
    weight_grams,
    measured_at,
    note,
    created_by
  ) values (
    v_birth.organization_id,
    p_client_command_id,
    'record_birth_weight',
    v_session.litter_id,
    v_session.id,
    v_birth.id,
    animal_id,
    weight_measurement_id,
    p_weight_grams,
    p_measured_at,
    v_note,
    v_user_id
  );

  outcome := 'success';
  return next;
exception when others then
  outcome := 'error';
  birth_id := p_birth_id;
  animal_id := null;
  weight_measurement_id := null;
  replayed := false;
  reason := 'technical_error';
  return next;
  return;
end;
$$;

revoke all on function public.record_whelping_birth_weight(
  uuid, uuid, integer, timestamptz, text
) from public;

grant execute on function public.record_whelping_birth_weight(
  uuid, uuid, integer, timestamptz, text
) to authenticated;

comment on function public.record_whelping_birth_weight(
  uuid, uuid, integer, timestamptz, text
) is
  'Idempotently completes one missing birth weight without changing the whelping timeline.';

comment on table public.animal_weight_measurements is
  'Append-only source of truth for animal weights; birth measurements are created by dedicated birth commands.';

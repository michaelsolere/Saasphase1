alter table public.organization_settings
  add column litter_weighing_schedule_policy jsonb;

alter table public.litters
  add column litter_weighing_schedule_policy_snapshot jsonb,
  add column litter_weighing_schedule_policy_source text,
  add column litter_weighing_schedule_policy_frozen_at timestamptz;

create or replace function public.is_valid_litter_weighing_schedule_policy(
  p_policy jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phases jsonb;
  v_phase jsonb;
  v_start numeric;
  v_end numeric;
  v_interval numeric;
  v_previous_start numeric := -1;
  v_previous_end numeric := -1;
  v_scheduled_count numeric := 0;
begin
  if p_policy is null or jsonb_typeof(p_policy) is distinct from 'object' then
    return false;
  end if;

  if not (p_policy ? 'phases') or p_policy - 'phases' <> '{}'::jsonb then
    return false;
  end if;

  v_phases := p_policy -> 'phases';
  if jsonb_typeof(v_phases) is distinct from 'array'
    or jsonb_array_length(v_phases) not between 1 and 12 then
    return false;
  end if;

  for v_phase in
    select phase.value
    from jsonb_array_elements(v_phases) with ordinality phase(value, position)
    order by phase.position
  loop
    if jsonb_typeof(v_phase) is distinct from 'object'
      or not (v_phase ?& array['startAgeDay', 'endAgeDay', 'intervalDays'])
      or v_phase - 'startAgeDay' - 'endAgeDay' - 'intervalDays' <> '{}'::jsonb
      or jsonb_typeof(v_phase -> 'startAgeDay') is distinct from 'number'
      or jsonb_typeof(v_phase -> 'endAgeDay') is distinct from 'number'
      or jsonb_typeof(v_phase -> 'intervalDays') is distinct from 'number' then
      return false;
    end if;

    v_start := (v_phase ->> 'startAgeDay')::numeric;
    v_end := (v_phase ->> 'endAgeDay')::numeric;
    v_interval := (v_phase ->> 'intervalDays')::numeric;

    if v_start <> trunc(v_start)
      or v_end <> trunc(v_end)
      or v_interval <> trunc(v_interval)
      or v_start < 0
      or v_end < v_start
      or v_end > 365
      or v_interval < 1
      or (v_previous_start >= 0 and v_start < v_previous_start)
      or (v_previous_end >= 0 and v_start <= v_previous_end) then
      return false;
    end if;

    v_scheduled_count := v_scheduled_count
      + floor((v_end - v_start) / v_interval) + 1;
    if v_scheduled_count > 400 then
      return false;
    end if;

    v_previous_start := v_start;
    v_previous_end := v_end;
  end loop;

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function public.recommended_litter_weighing_schedule_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'phases',
    jsonb_build_array(
      jsonb_build_object(
        'startAgeDay', 0,
        'endAgeDay', 30,
        'intervalDays', 1
      ),
      jsonb_build_object(
        'startAgeDay', 31,
        'endAgeDay', 60,
        'intervalDays', 3
      )
    )
  );
$$;

alter table public.organization_settings
  add constraint organization_settings_litter_weighing_schedule_policy_check
    check (
      litter_weighing_schedule_policy is null
      or public.is_valid_litter_weighing_schedule_policy(
        litter_weighing_schedule_policy
      )
    );

alter table public.litters
  add constraint litters_litter_weighing_schedule_policy_source_check
    check (
      litter_weighing_schedule_policy_source is null
      or litter_weighing_schedule_policy_source in ('organization', 'recommended')
    ),
  add constraint litters_litter_weighing_schedule_policy_snapshot_check
    check (
      litter_weighing_schedule_policy_snapshot is null
      or public.is_valid_litter_weighing_schedule_policy(
        litter_weighing_schedule_policy_snapshot
      )
    );

create or replace function public.lock_litter_weighing_policy_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_organization_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.organization_id is distinct from old.organization_id then
    raise exception 'organization settings organization is immutable'
      using errcode = '55000';
  end if;

  v_organization_id := case when tg_op = 'DELETE'
    then old.organization_id
    else new.organization_id
  end;

  if tg_op = 'INSERT' then
    perform settings.id
    from public.organization_settings settings
    where settings.organization_id = v_organization_id
    for update;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_weighing_schedule_policy:' || v_organization_id::text,
      0
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organization_settings_lock_litter_weighing_policy
before insert or update or delete on public.organization_settings
for each row execute function public.lock_litter_weighing_policy_settings();

create or replace function public.resolve_litter_weighing_policy_for_freeze(
  p_organization_id uuid
)
returns table (
  policy jsonb,
  source text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_policy jsonb;
begin
  perform settings.id
  from public.organization_settings settings
  where settings.organization_id = p_organization_id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_weighing_schedule_policy:' || p_organization_id::text,
      0
    )
  );

  select settings.litter_weighing_schedule_policy
  into v_policy
  from public.organization_settings settings
  where settings.organization_id = p_organization_id
    and settings.deleted_at is null
  for update;

  if found and v_policy is not null then
    return query select v_policy, 'organization'::text;
  else
    return query select
      public.recommended_litter_weighing_schedule_policy(),
      'recommended'::text;
  end if;
end;
$$;

update public.litters
set
  litter_weighing_schedule_policy_snapshot =
    public.recommended_litter_weighing_schedule_policy(),
  litter_weighing_schedule_policy_source = 'recommended',
  litter_weighing_schedule_policy_frozen_at = statement_timestamp()
where actual_birth_date is not null;

alter table public.litters
  add constraint litters_litter_weighing_schedule_policy_state_check
    check (
      (
        actual_birth_date is null
        and litter_weighing_schedule_policy_snapshot is null
        and litter_weighing_schedule_policy_source is null
        and litter_weighing_schedule_policy_frozen_at is null
      )
      or
      (
        actual_birth_date is not null
        and litter_weighing_schedule_policy_snapshot is not null
        and litter_weighing_schedule_policy_source is not null
        and litter_weighing_schedule_policy_frozen_at is not null
      )
    );

create or replace function public.freeze_litter_weighing_schedule_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_policy jsonb;
  v_source text;
  v_has_postnatal_data boolean;
begin
  if tg_op = 'INSERT' then
    if new.actual_birth_date is null then
      new.litter_weighing_schedule_policy_snapshot := null;
      new.litter_weighing_schedule_policy_source := null;
      new.litter_weighing_schedule_policy_frozen_at := null;
      return new;
    end if;

    select resolved.policy, resolved.source
    into strict v_policy, v_source
    from public.resolve_litter_weighing_policy_for_freeze(
      new.organization_id
    ) resolved;

    new.litter_weighing_schedule_policy_snapshot := v_policy;
    new.litter_weighing_schedule_policy_source := v_source;
    new.litter_weighing_schedule_policy_frozen_at := statement_timestamp();
    return new;
  end if;

  if old.actual_birth_date is null and new.actual_birth_date is not null then
    select resolved.policy, resolved.source
    into strict v_policy, v_source
    from public.resolve_litter_weighing_policy_for_freeze(
      new.organization_id
    ) resolved;

    new.litter_weighing_schedule_policy_snapshot := v_policy;
    new.litter_weighing_schedule_policy_source := v_source;
    new.litter_weighing_schedule_policy_frozen_at := statement_timestamp();
    return new;
  end if;

  if old.actual_birth_date is not null and new.actual_birth_date is null then
    select
      exists (
        select 1
        from public.animals animal
        where animal.organization_id = old.organization_id
          and animal.litter_id = old.id
          and animal.ownership_status = 'produced'
      )
      or exists (
        select 1
        from public.whelping_births birth
        join public.whelping_sessions session
          on session.organization_id = birth.organization_id
         and session.id = birth.session_id
        where session.organization_id = old.organization_id
          and session.litter_id = old.id
      )
      or exists (
        select 1
        from public.litter_weighing_sessions session
        where session.organization_id = old.organization_id
          and session.litter_id = old.id
      )
      or exists (
        select 1
        from public.animal_weight_measurements measurement
        join public.animals animal
          on animal.organization_id = measurement.organization_id
         and animal.id = measurement.animal_id
        where animal.organization_id = old.organization_id
          and animal.litter_id = old.id
      )
    into v_has_postnatal_data;

    if v_has_postnatal_data then
      raise exception 'actual birth date cannot be cleared after postnatal data exists'
        using errcode = '55000';
    end if;

    new.litter_weighing_schedule_policy_snapshot := null;
    new.litter_weighing_schedule_policy_source := null;
    new.litter_weighing_schedule_policy_frozen_at := null;
    return new;
  end if;

  if old.actual_birth_date is not null then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'a born litter cannot change organization'
        using errcode = '55000';
    end if;

    if new.litter_weighing_schedule_policy_snapshot is distinct from
        old.litter_weighing_schedule_policy_snapshot
      or new.litter_weighing_schedule_policy_source is distinct from
        old.litter_weighing_schedule_policy_source
      or new.litter_weighing_schedule_policy_frozen_at is distinct from
        old.litter_weighing_schedule_policy_frozen_at then
      raise exception 'litter weighing schedule policy snapshot is immutable'
        using errcode = '55000';
    end if;

    return new;
  end if;

  if new.litter_weighing_schedule_policy_snapshot is not null
    or new.litter_weighing_schedule_policy_source is not null
    or new.litter_weighing_schedule_policy_frozen_at is not null then
    raise exception 'an unborn litter cannot have a weighing schedule policy snapshot'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger litters_freeze_weighing_schedule_policy
before insert or update on public.litters
for each row execute function public.freeze_litter_weighing_schedule_policy();

revoke all on function public.is_valid_litter_weighing_schedule_policy(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_litter_weighing_schedule_policy(jsonb)
  to authenticated;
revoke all on function public.recommended_litter_weighing_schedule_policy()
  from public, anon, authenticated;
revoke all on function public.resolve_litter_weighing_policy_for_freeze(uuid)
  from public, anon, authenticated;
revoke all on function public.lock_litter_weighing_policy_settings()
  from public, anon, authenticated;
revoke all on function public.freeze_litter_weighing_schedule_policy()
  from public, anon, authenticated;

comment on column public.organization_settings.litter_weighing_schedule_policy is
  'Optional canonical weighing cadence used when a litter first receives an actual birth date.';
comment on column public.litters.litter_weighing_schedule_policy_snapshot is
  'Immutable canonical cadence frozen when actual_birth_date first becomes non-null.';
comment on function public.recommended_litter_weighing_schedule_policy() is
  'Internal canonical fallback. Application code must keep its contract equal to DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY.';

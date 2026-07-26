-- GESTATION-AUTO-APPLY-01B: historical first-mating replay must keep ovulation null
-- even when litters.estimated_ovulation_date was filled later.

-- ---------------------------------------------------------------------------
-- Mating core: authoritative payload comparison on historical replay
-- ---------------------------------------------------------------------------
create or replace function public.record_reproductive_cycle_mating_core(
  p_cycle_id uuid,
  p_client_command_id uuid,
  p_father_id uuid,
  p_occurred_at timestamptz,
  p_timezone_name text,
  p_method text,
  p_location text default null,
  p_note text default null,
  p_litter_name text default null,
  p_estimated_ovulation_date date default null
)
returns table (
  outcome text,
  cycle_id uuid,
  mating_id uuid,
  litter_id uuid,
  sequence_no integer,
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
  v_access record;
  v_cycle public.reproductive_cycles%rowtype;
  v_mother public.animals%rowtype;
  v_father public.animals%rowtype;
  v_litter public.litters%rowtype;
  v_existing_mating public.reproductive_cycle_matings%rowtype;
  v_sequence_no integer;
  v_litter_name text := nullif(btrim(coalesce(p_litter_name, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_local_mating_date date;
begin
  outcome := 'error';
  cycle_id := p_cycle_id;
  mating_id := null;
  litter_id := null;
  sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_cycle_id is null or p_client_command_id is null or p_father_id is null
    or p_occurred_at is null or p_timezone_name is null or p_method is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select access.*
  into v_access
  from public.resolve_reproductive_cycle_mating_writer(p_cycle_id) access;

  if v_access.denial_reason is not null then
    reason := v_access.denial_reason;
    return next;
    return;
  end if;

  select *
  into v_cycle
  from public.reproductive_cycles cycle
  where cycle.id = p_cycle_id
    and cycle.organization_id = v_access.organization_id
    and cycle.deleted_at is null
  for update;

  if not found then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_existing_mating
  from public.reproductive_cycle_matings mating
  where mating.organization_id = v_cycle.organization_id
    and mating.client_command_id = p_client_command_id;

  if found then
    if v_existing_mating.cycle_id is distinct from v_cycle.id
      or v_existing_mating.father_id is distinct from p_father_id
      or v_existing_mating.occurred_at is distinct from p_occurred_at
      or v_existing_mating.timezone_name is distinct from p_timezone_name
      or v_existing_mating.method is distinct from p_method
      or v_existing_mating.location is distinct from v_location
      or v_existing_mating.note is distinct from v_note
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    if v_existing_mating.sequence_no = 1 then
      select *
      into v_litter
      from public.litters litter
      where litter.organization_id = v_cycle.organization_id
        and litter.id = v_cycle.litter_id;

      -- Historical commands predate ovulation support: payload ovulation must stay null.
      -- Do not compare against litters.estimated_ovulation_date (may have been set later).
      if not found
        or nullif(btrim(coalesce(v_litter.name, '')), '') is distinct from v_litter_name
        or p_estimated_ovulation_date is not null
      then
        reason := 'client_command_conflict';
        return next;
        return;
      end if;
    else
      if p_estimated_ovulation_date is not null or v_litter_name is not null then
        reason := 'client_command_conflict';
        return next;
        return;
      end if;

      select *
      into v_litter
      from public.litters litter
      where litter.organization_id = v_cycle.organization_id
        and litter.id = v_cycle.litter_id;
    end if;

    outcome := 'success';
    mating_id := v_existing_mating.id;
    litter_id := v_litter.id;
    sequence_no := v_existing_mating.sequence_no;
    replayed := true;
    return next;
    return;
  end if;

  if v_cycle.status in ('closed', 'cancelled') then
    reason := 'cycle_not_open';
    return next;
    return;
  end if;

  if p_method not in ('natural', 'ai_fresh', 'ai_chilled', 'ai_frozen', 'other') then
    reason := 'invalid_method';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names tz
    where tz.name = p_timezone_name
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  select *
  into v_mother
  from public.animals animal
  where animal.organization_id = v_cycle.organization_id
    and animal.id = v_cycle.mother_id
    and animal.deleted_at is null
  for share;

  if not found
    or v_mother.sex <> 'female'
    or v_mother.species <> v_cycle.species
    or not v_mother.is_breeder
    or v_mother.is_retired
    or v_mother.status in ('adopted', 'archived', 'deceased', 'retired')
    or v_mother.ownership_status = 'adopted_out'
    or (
      v_mother.is_external
      and v_mother.ownership_status <> 'external_female'
    )
    or (
      not v_mother.is_external
      and v_mother.ownership_status not in ('owned', 'co_owned', 'produced')
    ) then
    reason := 'mother_ineligible';
    return next;
    return;
  end if;

  select *
  into v_father
  from public.animals animal
  where animal.organization_id = v_cycle.organization_id
    and animal.id = p_father_id
    and animal.deleted_at is null
  for share;

  if not found
    or v_father.id = v_mother.id
    or v_father.sex <> 'male'
    or v_father.species <> v_cycle.species
    or not v_father.is_breeder
    or v_father.is_retired
    or v_father.status in ('adopted', 'archived', 'deceased', 'retired')
    or v_father.ownership_status = 'adopted_out'
    or (
      v_father.is_external
      and v_father.ownership_status <> 'external_stud'
    )
    or (
      not v_father.is_external
      and v_father.ownership_status not in ('owned', 'co_owned', 'produced')
    ) then
    reason := 'father_ineligible';
    return next;
    return;
  end if;

  select coalesce(max(mating.sequence_no), 0) + 1
  into v_sequence_no
  from public.reproductive_cycle_matings mating
  where mating.organization_id = v_cycle.organization_id
    and mating.cycle_id = v_cycle.id;

  if v_sequence_no > 1 and p_estimated_ovulation_date is not null then
    reason := 'estimated_ovulation_not_allowed';
    return next;
    return;
  end if;

  v_local_mating_date := (p_occurred_at at time zone p_timezone_name)::date;

  if v_sequence_no = 1 then
    if v_litter_name is null or char_length(v_litter_name) > 255 then
      reason := 'litter_name_required';
      return next;
      return;
    end if;

    if v_cycle.litter_id is not null then
      reason := 'cycle_litter_conflict';
      return next;
      return;
    end if;

    insert into public.litters (
      organization_id,
      name,
      species,
      breed,
      mother_id,
      father_id,
      status,
      mating_date,
      estimated_ovulation_date,
      created_by,
      updated_by
    ) values (
      v_cycle.organization_id,
      v_litter_name,
      v_cycle.species,
      v_cycle.breed,
      v_mother.id,
      v_father.id,
      'mating_done',
      v_local_mating_date,
      p_estimated_ovulation_date,
      v_user_id,
      v_user_id
    )
    returning * into v_litter;

    perform set_config('app.reproductive_cycle_mating_rpc', 'on', true);

    update public.reproductive_cycles
    set
      litter_id = v_litter.id,
      status = 'mated',
      updated_at = now(),
      updated_by = v_user_id
    where organization_id = v_cycle.organization_id
      and id = v_cycle.id;
  else
    if v_cycle.litter_id is null then
      reason := 'cycle_litter_missing';
      return next;
      return;
    end if;

    select *
    into v_litter
    from public.litters litter
    where litter.organization_id = v_cycle.organization_id
      and litter.id = v_cycle.litter_id
      and litter.deleted_at is null
    for update;

    if not found then
      reason := 'linked_litter_not_found';
      return next;
      return;
    end if;

    if v_litter.father_id is distinct from v_father.id then
      reason := 'father_mismatch';
      return next;
      return;
    end if;

    if v_sequence_no = 2 then
      update public.litters
      set
        mating_date_2 = v_local_mating_date,
        updated_at = now(),
        updated_by = v_user_id
      where organization_id = v_cycle.organization_id
        and id = v_litter.id;
    end if;
  end if;

  insert into public.reproductive_cycle_matings (
    organization_id,
    cycle_id,
    father_id,
    sequence_no,
    occurred_at,
    timezone_name,
    method,
    location,
    note,
    client_command_id,
    created_by,
    updated_by
  ) values (
    v_cycle.organization_id,
    v_cycle.id,
    v_father.id,
    v_sequence_no,
    p_occurred_at,
    p_timezone_name,
    p_method,
    v_location,
    v_note,
    p_client_command_id,
    v_user_id,
    v_user_id
  )
  returning id into mating_id;

  outcome := 'success';
  litter_id := v_litter.id;
  sequence_no := v_sequence_no;
  return next;
end;
$$;

revoke all on function public.record_reproductive_cycle_mating_core(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) from public, anon, authenticated;


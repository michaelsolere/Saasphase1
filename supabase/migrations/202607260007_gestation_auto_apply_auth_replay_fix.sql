-- GESTATION-AUTO-APPLY-01A: early write-auth gate + historical mating replay payload checks.

-- ---------------------------------------------------------------------------
-- Private helper: resolve write access without exposing foreign registry rows
-- ---------------------------------------------------------------------------
create or replace function public.resolve_reproductive_cycle_mating_writer(
  p_cycle_id uuid
)
returns table (
  organization_id uuid,
  membership_role text,
  denial_reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_role text;
begin
  organization_id := null;
  membership_role := null;
  denial_reason := null;

  if v_user_id is null then
    denial_reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_cycle_id is null then
    denial_reason := 'cycle_not_found';
    return next;
    return;
  end if;

  -- Resolve organization without locking a foreign row.
  select cycle.organization_id
  into v_org
  from public.reproductive_cycles cycle
  where cycle.id = p_cycle_id;

  if not found then
    denial_reason := 'cycle_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_role
  from public.memberships membership
  where membership.organization_id = v_org
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    -- Same neutral denial as a missing cycle: no foreign leakage.
    denial_reason := 'cycle_not_found';
    return next;
    return;
  end if;

  if v_role not in ('owner', 'admin', 'member') then
    denial_reason := 'membership_required';
    return next;
    return;
  end if;

  organization_id := v_org;
  membership_role := v_role;
  return next;
end;
$$;

revoke all on function public.resolve_reproductive_cycle_mating_writer(uuid)
  from public, anon, authenticated;

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

      if not found
        or nullif(btrim(coalesce(v_litter.name, '')), '') is distinct from v_litter_name
        or v_litter.estimated_ovulation_date is distinct from p_estimated_ovulation_date
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

-- ---------------------------------------------------------------------------
-- Orchestrator: membership gate before registry read / write / private returns
-- ---------------------------------------------------------------------------
create or replace function public.record_reproductive_cycle_mating_with_gestation_plan(
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
  reason text,
  gestation_planning_outcome text,
  gestation_model_title text,
  gestation_variant_code text,
  litter_plan_id uuid,
  litter_plan_revision integer,
  snapshot_count integer,
  materialized_count integer,
  pending_anchor_count integer
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_access record;
  v_org uuid;
  v_payload jsonb;
  v_command public.reproductive_cycle_mating_gestation_plan_commands%rowtype;
  v_mating record;
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_litter_name text := nullif(btrim(coalesce(p_litter_name, '')), '');
  v_settings public.organization_settings%rowtype;
  v_model public.litter_planning_models%rowtype;
  v_library public.litter_planning_model_library_models%rowtype;
  v_plan public.litter_plans%rowtype;
  v_existing_family_model_id uuid;
  v_existing_family_code text;
  v_apply_command_id uuid;
  v_apply record;
  v_plan_revision integer;
  v_gestation_outcome text;
  v_gestation_title text;
  v_gestation_variant text;
  v_plan_id uuid;
  v_snap integer := 0;
  v_mat integer := 0;
  v_pend integer := 0;
begin
  outcome := 'error';
  cycle_id := p_cycle_id;
  mating_id := null;
  litter_id := null;
  sequence_no := null;
  replayed := false;
  reason := null;
  gestation_planning_outcome := null;
  gestation_model_title := null;
  gestation_variant_code := null;
  litter_plan_id := null;
  litter_plan_revision := null;
  snapshot_count := 0;
  materialized_count := 0;
  pending_anchor_count := 0;

  perform pg_catalog.set_config('statement_timeout', '120s', true);
  perform pg_catalog.set_config('lock_timeout', '30s', true);

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

  -- Write-auth gate: resolve org + membership BEFORE any registry touch.
  select access.*
  into v_access
  from public.resolve_reproductive_cycle_mating_writer(p_cycle_id) access;

  if v_access.denial_reason is not null then
    reason := v_access.denial_reason;
    return next;
    return;
  end if;

  v_org := v_access.organization_id;

  v_payload := jsonb_build_object(
    'cycleId', p_cycle_id,
    'fatherId', p_father_id,
    'occurredAt', p_occurred_at,
    'timezoneName', p_timezone_name,
    'method', p_method,
    'location', to_jsonb(v_location),
    'note', to_jsonb(v_note),
    'litterName', to_jsonb(v_litter_name),
    'estimatedOvulationDate', to_jsonb(p_estimated_ovulation_date)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reproductive_cycle_mating_gestation_plan_commands:'
        || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.* into v_command
  from public.reproductive_cycle_mating_gestation_plan_commands command
  where command.organization_id = v_org
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_command.payload <> v_payload then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := v_command.mating_outcome;
    cycle_id := v_command.cycle_id;
    mating_id := v_command.mating_id;
    litter_id := v_command.litter_id;
    sequence_no := v_command.sequence_no;
    reason := v_command.mating_reason;
    gestation_planning_outcome := v_command.gestation_planning_outcome;
    gestation_model_title := v_command.gestation_model_title;
    gestation_variant_code := v_command.gestation_variant_code;
    litter_plan_id := v_command.litter_plan_id;
    litter_plan_revision := v_command.litter_plan_revision;
    snapshot_count := v_command.snapshot_count;
    materialized_count := v_command.materialized_count;
    pending_anchor_count := v_command.pending_anchor_count;
    replayed := true;
    return next;
    return;
  end if;

  select mating.*
  into v_mating
  from public.record_reproductive_cycle_mating_core(
    p_cycle_id,
    p_client_command_id,
    p_father_id,
    p_occurred_at,
    p_timezone_name,
    p_method,
    v_location,
    v_note,
    v_litter_name,
    p_estimated_ovulation_date
  ) mating;

  if v_mating.outcome <> 'success' then
    -- Historical payload mismatch must not create an orchestration registry row.
    if v_mating.reason = 'client_command_conflict' then
      outcome := v_mating.outcome;
      reason := v_mating.reason;
      replayed := false;
      return next;
      return;
    end if;

    insert into public.reproductive_cycle_mating_gestation_plan_commands (
      organization_id, cycle_id, client_command_id, father_id, occurred_at,
      timezone_name, method, location, note, litter_name, estimated_ovulation_date,
      mating_outcome, mating_id, litter_id, sequence_no, mating_reason, payload, created_by
    ) values (
      v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
      p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
      v_mating.outcome, v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no,
      v_mating.reason, v_payload, v_user_id
    );

    outcome := v_mating.outcome;
    mating_id := v_mating.mating_id;
    litter_id := v_mating.litter_id;
    sequence_no := v_mating.sequence_no;
    reason := v_mating.reason;
    replayed := v_mating.replayed;
    return next;
    return;
  end if;

  -- Second+ mating: never auto-apply.
  if v_mating.sequence_no > 1 then
    v_gestation_outcome := 'not_applicable';

    insert into public.reproductive_cycle_mating_gestation_plan_commands (
      organization_id, cycle_id, client_command_id, father_id, occurred_at,
      timezone_name, method, location, note, litter_name, estimated_ovulation_date,
      mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
      gestation_planning_outcome, payload, created_by
    ) values (
      v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
      p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
      'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
      v_gestation_outcome, v_payload, v_user_id
    );

    outcome := 'success';
    mating_id := v_mating.mating_id;
    litter_id := v_mating.litter_id;
    sequence_no := v_mating.sequence_no;
    replayed := v_mating.replayed;
    gestation_planning_outcome := v_gestation_outcome;
    return next;
    return;
  end if;

  -- Optional test hook for full rollback of mating + plan.
  if current_setting('app.gestation_auto_apply_inject_error', true) = 'on' then
    raise exception 'gestation_auto_apply_injected_error' using errcode = 'P0001';
  end if;

  select settings.* into v_settings
  from public.organization_settings settings
  where settings.organization_id = v_org
    and settings.deleted_at is null
  for share;

  if not found or v_settings.default_gestation_planning_model_id is null then
    v_gestation_outcome := 'not_configured';

    insert into public.reproductive_cycle_mating_gestation_plan_commands (
      organization_id, cycle_id, client_command_id, father_id, occurred_at,
      timezone_name, method, location, note, litter_name, estimated_ovulation_date,
      mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
      gestation_planning_outcome, payload, created_by
    ) values (
      v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
      p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
      'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
      v_gestation_outcome, v_payload, v_user_id
    );

    outcome := 'success';
    mating_id := v_mating.mating_id;
    litter_id := v_mating.litter_id;
    sequence_no := v_mating.sequence_no;
    replayed := v_mating.replayed;
    gestation_planning_outcome := v_gestation_outcome;
    return next;
    return;
  end if;

  select model.* into v_model
  from public.litter_planning_models model
  where model.organization_id = v_org
    and model.id = v_settings.default_gestation_planning_model_id
  for share;

  if not found
    or not v_model.is_active
    or v_model.library_model_code is null
    or v_model.library_model_version is null
  then
    v_gestation_outcome := 'default_model_unavailable';

    insert into public.reproductive_cycle_mating_gestation_plan_commands (
      organization_id, cycle_id, client_command_id, father_id, occurred_at,
      timezone_name, method, location, note, litter_name, estimated_ovulation_date,
      mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
      gestation_planning_outcome, gestation_model_id, payload, created_by
    ) values (
      v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
      p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
      'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
      v_gestation_outcome, v_settings.default_gestation_planning_model_id, v_payload, v_user_id
    );

    outcome := 'success';
    mating_id := v_mating.mating_id;
    litter_id := v_mating.litter_id;
    sequence_no := v_mating.sequence_no;
    replayed := v_mating.replayed;
    gestation_planning_outcome := v_gestation_outcome;
    return next;
    return;
  end if;

  select library.* into v_library
  from public.litter_planning_model_library_models library
  where library.code = v_model.library_model_code
    and library.version = v_model.library_model_version
  for share;

  if not found
    or not v_library.is_available
    or v_library.family_code <> 'dog-gestation'
    or v_library.code not in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
    or (v_model.species is not null and exists (
      select 1 from public.litters l
      where l.id = v_mating.litter_id and l.species is distinct from v_model.species
    ))
    or exists (
      select 1
      from public.litter_planning_model_items i
      join public.litter_care_task_templates t
        on t.organization_id = i.organization_id
       and t.id = i.organization_template_id
      join public.litters l on l.id = v_mating.litter_id
      where i.organization_id = v_org
        and i.model_id = v_model.id
        and (
          not t.is_active
          or t.species <> l.species
          or (
            t.breed is not null
            and lower(btrim(t.breed)) <> lower(btrim(l.breed))
          )
        )
    )
  then
    v_gestation_outcome := 'default_model_unavailable';

    insert into public.reproductive_cycle_mating_gestation_plan_commands (
      organization_id, cycle_id, client_command_id, father_id, occurred_at,
      timezone_name, method, location, note, litter_name, estimated_ovulation_date,
      mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
      gestation_planning_outcome, gestation_model_id, gestation_model_title,
      gestation_variant_code, payload, created_by
    ) values (
      v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
      p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
      'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
      v_gestation_outcome, v_model.id, v_model.title, v_library.variant_code, v_payload, v_user_id
    );

    outcome := 'success';
    mating_id := v_mating.mating_id;
    litter_id := v_mating.litter_id;
    sequence_no := v_mating.sequence_no;
    replayed := v_mating.replayed;
    gestation_planning_outcome := v_gestation_outcome;
    gestation_model_title := v_model.title;
    gestation_variant_code := v_library.variant_code;
    return next;
    return;
  end if;

  select plan.* into v_plan
  from public.litter_plans plan
  where plan.organization_id = v_org
    and plan.litter_id = v_mating.litter_id
    and plan.status = 'active'
  for update;

  if found then
    v_plan_revision := v_plan.revision;

    select pi.source_planning_model_id, library.family_code
    into v_existing_family_model_id, v_existing_family_code
    from public.litter_plan_items pi
    join public.litter_planning_models org_model
      on org_model.organization_id = pi.organization_id
     and org_model.id = pi.source_planning_model_id
    join public.litter_planning_model_library_models library
      on library.code = org_model.library_model_code
     and library.version = org_model.library_model_version
    where pi.organization_id = v_org
      and pi.litter_plan_id = v_plan.id
      and library.family_code = 'dog-gestation'
    order by pi.display_order
    limit 1;

    if found then
      if v_existing_family_model_id = v_model.id then
        v_gestation_outcome := 'already_applied';
      else
        v_gestation_outcome := 'variant_conflict';
      end if;

      insert into public.reproductive_cycle_mating_gestation_plan_commands (
        organization_id, cycle_id, client_command_id, father_id, occurred_at,
        timezone_name, method, location, note, litter_name, estimated_ovulation_date,
        mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
        gestation_planning_outcome, gestation_model_id, gestation_model_title,
        gestation_variant_code, litter_plan_id, litter_plan_revision, payload, created_by
      ) values (
        v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
        p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
        'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
        v_gestation_outcome, v_model.id, v_model.title, v_library.variant_code,
        v_plan.id, v_plan.revision, v_payload, v_user_id
      );

      outcome := 'success';
      mating_id := v_mating.mating_id;
      litter_id := v_mating.litter_id;
      sequence_no := v_mating.sequence_no;
      replayed := v_mating.replayed;
      gestation_planning_outcome := v_gestation_outcome;
      gestation_model_title := v_model.title;
      gestation_variant_code := v_library.variant_code;
      litter_plan_id := v_plan.id;
      litter_plan_revision := v_plan.revision;
      return next;
      return;
    end if;
  else
    v_plan_revision := null;
  end if;

  v_apply_command_id := gen_random_uuid();

  select applied.*
  into v_apply
  from public.apply_litter_planning_model(
    v_mating.litter_id,
    v_model.id,
    v_apply_command_id,
    v_model.revision,
    v_plan_revision,
    null,
    p_timezone_name
  ) applied;

  if v_apply.outcome = 'success' then
    v_gestation_outcome := 'applied';
    v_plan_id := v_apply.litter_plan_id;
    v_plan_revision := v_apply.revision;

    select command.snapshot_count, command.materialized_count, command.pending_anchor_count
    into v_snap, v_mat, v_pend
    from public.litter_plan_application_commands command
    where command.organization_id = v_org
      and command.client_command_id = v_apply_command_id;
  elsif v_apply.reason = 'model_already_applied' then
    v_gestation_outcome := 'already_applied';
    v_plan_id := v_apply.litter_plan_id;
    v_plan_revision := v_apply.revision;
  elsif v_apply.reason in (
    'stale_model', 'invalid_selection', 'invalid_litter', 'not_found', 'stale_plan'
  ) then
    v_gestation_outcome := 'default_model_unavailable';
    v_plan_id := v_apply.litter_plan_id;
    v_plan_revision := v_apply.revision;
  else
    raise exception 'gestation_auto_apply_failed:%', coalesce(v_apply.reason, 'unknown')
      using errcode = 'P0001';
  end if;

  insert into public.reproductive_cycle_mating_gestation_plan_commands (
    organization_id, cycle_id, client_command_id, father_id, occurred_at,
    timezone_name, method, location, note, litter_name, estimated_ovulation_date,
    mating_outcome, mating_id, litter_id, sequence_no, mating_reason,
    gestation_planning_outcome, gestation_model_id, gestation_model_title,
    gestation_variant_code, litter_plan_id, litter_plan_revision, apply_client_command_id,
    snapshot_count, materialized_count, pending_anchor_count, payload, created_by
  ) values (
    v_org, p_cycle_id, p_client_command_id, p_father_id, p_occurred_at,
    p_timezone_name, p_method, v_location, v_note, v_litter_name, p_estimated_ovulation_date,
    'success', v_mating.mating_id, v_mating.litter_id, v_mating.sequence_no, null,
    v_gestation_outcome, v_model.id, v_model.title, v_library.variant_code,
    v_plan_id, v_plan_revision, v_apply_command_id, coalesce(v_snap, 0), coalesce(v_mat, 0),
    coalesce(v_pend, 0), v_payload, v_user_id
  );

  outcome := 'success';
  mating_id := v_mating.mating_id;
  litter_id := v_mating.litter_id;
  sequence_no := v_mating.sequence_no;
  replayed := v_mating.replayed;
  gestation_planning_outcome := v_gestation_outcome;
  gestation_model_title := v_model.title;
  gestation_variant_code := v_library.variant_code;
  litter_plan_id := v_plan_id;
  litter_plan_revision := v_plan_revision;
  snapshot_count := coalesce(v_snap, 0);
  materialized_count := coalesce(v_mat, 0);
  pending_anchor_count := coalesce(v_pend, 0);
  return next;
end;
$$;

revoke all on function public.record_reproductive_cycle_mating_with_gestation_plan(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) from public;
grant execute on function public.record_reproductive_cycle_mating_with_gestation_plan(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) to authenticated;

comment on function public.resolve_reproductive_cycle_mating_writer(uuid) is
  'Private helper: resolves cycle organization and active write membership before mating orchestration.';

comment on function public.record_reproductive_cycle_mating_with_gestation_plan(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) is
  'Records a mating and atomically auto-applies the organization default dog-gestation plan on first mating.';

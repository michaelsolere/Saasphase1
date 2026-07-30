-- LITTER-ACTUAL-BIRTH-PLAN-ACTIVATION-01
-- Atomically react to the first recorded birth without changing the historical
-- birth implementation or introducing a trigger on litters.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guard and rename the historical public implementation without copying it
-- ---------------------------------------------------------------------------
do $guard$
declare
  v_function_count integer;
  v_function_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_default_count integer;
begin
  select count(*)
  into v_function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'record_whelping_birth';

  if v_function_count <> 1 then
    raise exception
      'record_whelping_birth migration guard failed: expected one overload, found %',
      v_function_count;
  end if;

  select
    procedure.oid,
    pg_catalog.pg_get_userbyid(procedure.proowner),
    procedure.prosecdef,
    procedure.proconfig,
    procedure.pronargdefaults
  into
    v_function_oid,
    v_owner,
    v_security_definer,
    v_config,
    v_default_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where procedure.oid = 'public.record_whelping_birth(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure;

  if v_function_oid is null then
    raise exception 'record_whelping_birth migration guard failed: historical signature not found';
  end if;

  if v_owner <> 'postgres'
    or not v_security_definer
    or v_default_count <> 4
    or not coalesce('search_path=""' = any(v_config), false)
    or not coalesce('row_security=off' = any(v_config), false)
  then
    raise exception
      'record_whelping_birth migration guard failed: historical properties changed';
  end if;

  if not pg_catalog.has_function_privilege(
      'authenticated',
      v_function_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          (
            select procedure.proacl
            from pg_catalog.pg_proc procedure
            where procedure.oid = v_function_oid
          ),
          pg_catalog.acldefault(
            'f',
            (
              select procedure.proowner
              from pg_catalog.pg_proc procedure
              where procedure.oid = v_function_oid
            )
          )
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
  then
    raise exception
      'record_whelping_birth migration guard failed: historical ACL changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'record_whelping_birth_core_internal',
        'activate_litter_plan_on_first_birth_internal'
      )
  ) then
    raise exception 'litter actual birth activation internal function name already exists';
  end if;

  execute $rename$
    alter function public.record_whelping_birth(
      uuid,
      uuid,
      timestamptz,
      text,
      text,
      text,
      integer,
      timestamptz,
      text
    )
    rename to record_whelping_birth_core_internal
  $rename$;

  if 'public.record_whelping_birth_core_internal(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure::oid
    is distinct from v_function_oid
  then
    raise exception 'record_whelping_birth migration guard failed: historical OID changed';
  end if;
end;
$guard$;

revoke all on function public.record_whelping_birth_core_internal(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private append-only activation registry
-- ---------------------------------------------------------------------------
create table public.litter_plan_actual_birth_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid,
  whelping_client_command_id uuid not null,
  actual_birth_date date not null,
  previous_plan_revision integer,
  result_plan_revision integer,
  materialized_item_count integer not null default 0,
  created_task_count integer not null default 0,
  created_series_occurrence_count integer not null default 0,
  reconciled_series_count integer not null default 0,
  not_applicable_occurrence_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_actual_birth_activations_org_id_key
    unique (organization_id, id),
  constraint litter_plan_actual_birth_activations_org_litter_key
    unique (organization_id, litter_id),
  constraint litter_plan_actual_birth_activations_org_command_key
    unique (organization_id, whelping_client_command_id),
  constraint litter_plan_actual_birth_activations_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_plan_actual_birth_activations_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans (organization_id, litter_id, id) on delete restrict,
  constraint litter_plan_actual_birth_activations_command_fk
    foreign key (organization_id, whelping_client_command_id)
    references public.whelping_commands (organization_id, client_command_id) on delete restrict,
  constraint litter_plan_actual_birth_activations_revision_check check (
    (litter_plan_id is null
      and previous_plan_revision is null
      and result_plan_revision is null)
    or (
      litter_plan_id is not null
      and previous_plan_revision > 0
      and result_plan_revision >= previous_plan_revision
    )
  ),
  constraint litter_plan_actual_birth_activations_counts_check check (
    materialized_item_count >= 0
    and created_task_count >= 0
    and created_series_occurrence_count >= 0
    and reconciled_series_count >= 0
    and not_applicable_occurrence_count >= 0
  ),
  constraint litter_plan_actual_birth_activations_result_check
    check (jsonb_typeof(result) = 'object')
);

create or replace function public.litter_plan_actual_birth_activations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  raise exception 'litter plan actual birth activations are append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_plan_actual_birth_activations_append_only
before update or delete on public.litter_plan_actual_birth_activations
for each row
execute function public.litter_plan_actual_birth_activations_immutable();

alter table public.litter_plan_actual_birth_activations enable row level security;

revoke all on table public.litter_plan_actual_birth_activations
from public, anon, authenticated;

revoke all on function public.litter_plan_actual_birth_activations_immutable()
from public, anon, authenticated;

-- The recurring helper historically increments the plan when it resolves a
-- pending anchor. During first-birth activation the orchestrator owns the
-- single plan revision increment, so this private guard suppresses only that
-- intermediate increment in the same transaction.
create or replace function public.preserve_litter_plan_revision_during_birth_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if pg_catalog.current_setting(
      'app.litter_actual_birth_plan_activation',
      true
    ) = 'on'
  then
    new.revision := old.revision;
  end if;

  return new;
end;
$function$;

create trigger litter_plans_preserve_revision_during_birth_activation
before update of revision on public.litter_plans
for each row
execute function public.preserve_litter_plan_revision_during_birth_activation();

revoke all on function public.preserve_litter_plan_revision_during_birth_activation()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private first-birth planning activation
-- ---------------------------------------------------------------------------
create or replace function public.activate_litter_plan_on_first_birth_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_actual_birth_date date,
  p_actor_id uuid,
  p_whelping_client_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_existing public.litter_plan_actual_birth_activations%rowtype;
  v_plan public.litter_plans%rowtype;
  v_item public.litter_plan_items%rowtype;
  v_series public.litter_plan_series%rowtype;
  v_materialization record;
  v_previous_plan_revision integer;
  v_result_plan_revision integer;
  v_materialized_item_count integer := 0;
  v_created_task_count integer := 0;
  v_created_series_occurrence_count integer := 0;
  v_reconciled_series_count integer := 0;
  v_not_applicable_occurrence_count integer := 0;
  v_series_count integer;
  v_existing_occurrence_count integer;
  v_previous_not_applicable_count integer;
  v_result_not_applicable_count integer;
  v_requested_through date;
  v_result jsonb;
  v_plan_changed boolean := false;
begin
  if p_organization_id is null
    or p_litter_id is null
    or p_actual_birth_date is null
    or p_actor_id is null
    or p_whelping_client_command_id is null
  then
    raise exception 'invalid first-birth planning activation input'
      using errcode = '22023';
  end if;

  select activation.*
  into v_existing
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = p_organization_id
    and activation.litter_id = p_litter_id;

  if found then
    if v_existing.actual_birth_date is distinct from p_actual_birth_date then
      raise exception 'first-birth planning activation date conflict'
        using errcode = '23514';
    end if;
    return v_existing.result;
  end if;

  if not exists (
    select 1
    from public.litters litter
    where litter.organization_id = p_organization_id
      and litter.id = p_litter_id
      and litter.deleted_at is null
      and litter.actual_birth_date = p_actual_birth_date
  ) then
    raise exception 'first-birth planning activation litter invariant failed'
      using errcode = '23514';
  end if;

  select plan.*
  into v_plan
  from public.litter_plans plan
  where plan.organization_id = p_organization_id
    and plan.litter_id = p_litter_id
    and plan.status = 'active'
  for update;

  if not found then
    v_result := jsonb_build_object(
      'outcome', 'success',
      'planChanged', false,
      'materializedItemCount', 0,
      'createdTaskCount', 0,
      'createdSeriesOccurrenceCount', 0,
      'reconciledSeriesCount', 0,
      'notApplicableOccurrenceCount', 0
    );

    insert into public.litter_plan_actual_birth_activations (
      organization_id,
      litter_id,
      litter_plan_id,
      whelping_client_command_id,
      actual_birth_date,
      previous_plan_revision,
      result_plan_revision,
      materialized_item_count,
      created_task_count,
      created_series_occurrence_count,
      reconciled_series_count,
      not_applicable_occurrence_count,
      result,
      created_by
    ) values (
      p_organization_id,
      p_litter_id,
      null,
      p_whelping_client_command_id,
      p_actual_birth_date,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      v_result,
      p_actor_id
    );

    return v_result;
  end if;

  v_previous_plan_revision := v_plan.revision;

  -- Advisory lock is already held by the public wrapper. Lock all dependent
  -- rows in the canonical deterministic order before invoking shared helpers.
  perform item.id
  from public.litter_plan_items item
  where item.organization_id = p_organization_id
    and item.litter_plan_id = v_plan.id
  order by item.id
  for update;

  perform series.id
  from public.litter_plan_series series
  where series.organization_id = p_organization_id
    and series.litter_plan_id = v_plan.id
  order by series.id
  for update;

  perform task.id
  from public.litter_care_tasks task
  where task.organization_id = p_organization_id
    and task.litter_id = p_litter_id
    and task.litter_plan_item_id in (
      select item.id
      from public.litter_plan_items item
      where item.organization_id = p_organization_id
        and item.litter_plan_id = v_plan.id
    )
  order by task.id
  for update;

  perform pg_catalog.set_config(
    'app.litter_actual_birth_plan_activation',
    'on',
    true
  );

  for v_item in
    select item.*
    from public.litter_plan_items item
    where item.organization_id = p_organization_id
      and item.litter_plan_id = v_plan.id
      and item.materialization_state = 'pending_anchor'
      and item.anchor_type in ('actual_birth', 'offspring_age')
    order by item.id
  loop
    if exists (
      select 1
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_id = p_litter_id
        and task.litter_plan_item_id = v_item.id
    ) then
      raise exception 'pending first-birth plan item already has tasks'
        using errcode = '23514';
    end if;

    if v_item.item_kind = 'recurring_task' then
      select count(*)
      into v_series_count
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.litter_plan_id = v_plan.id
        and series.litter_plan_item_id = v_item.id;

      if v_series_count <> 1 then
        raise exception 'pending recurring first-birth item must have exactly one series'
          using errcode = '23514';
      end if;

      select series.*
      into v_series
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.litter_plan_id = v_plan.id
        and series.litter_plan_item_id = v_item.id
      for update;

      select count(*)
      into v_existing_occurrence_count
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_plan_series_id = v_series.id;

      if v_existing_occurrence_count <> 0
        or v_series.materialized_occurrence_count <> 0
        or v_series.starts_on is not null
        or v_series.materialized_through is not null
      then
        raise exception 'pending recurring first-birth series is not empty'
          using errcode = '23514';
      end if;

      v_requested_through :=
        p_actual_birth_date
        + v_item.recurrence_starts_offset_days
        + v_item.initial_materialization_horizon_days
        - 1;

      select *
      into v_materialization
      from public.materialize_litter_plan_series_occurrences(
        v_series.id,
        v_requested_through,
        p_actor_id,
        p_whelping_client_command_id,
        false
      );

      if not exists (
        select 1
        from public.litter_plan_items item
        where item.id = v_item.id
          and item.materialization_state = 'materialized'
          and item.anchor_resolution_source = 'actual_birth'
          and item.anchor_source_date_snapshot = p_actual_birth_date
          and item.anchor_adjustment_days = 0
          and item.anchor_date_snapshot = p_actual_birth_date
      ) then
        raise exception 'recurring first-birth anchor materialization invariant failed'
          using errcode = '23514';
      end if;

      v_materialized_item_count := v_materialized_item_count + 1;
      v_created_series_occurrence_count :=
        v_created_series_occurrence_count
        + coalesce(v_materialization.inserted_count, 0);
      v_created_task_count :=
        v_created_task_count
        + coalesce(v_materialization.inserted_count, 0);
      v_plan_changed := true;
      continue;
    end if;

    update public.litter_plan_items item
    set
      anchor_resolution_source = 'actual_birth',
      anchor_source_date_snapshot = p_actual_birth_date,
      anchor_adjustment_days = 0,
      anchor_date_snapshot = p_actual_birth_date,
      materialization_state = 'materialized',
      materialized_at = statement_timestamp(),
      revision_no = item.revision_no + 1,
      updated_by = p_actor_id
    where item.id = v_item.id;

    if v_item.item_kind = 'window' then
      insert into public.litter_care_tasks (
        organization_id,
        litter_id,
        litter_plan_item_id,
        source,
        organization_template_id,
        occurrence_no,
        category,
        target_scope,
        title,
        description,
        anchor_type,
        anchor_date,
        offset_days,
        planned_for,
        item_kind,
        priority,
        suggested_starts_on,
        suggested_starts_local_time,
        suggested_ends_on,
        suggested_ends_local_time,
        retained_starts_on,
        retained_starts_local_time,
        retained_ends_on,
        retained_ends_local_time,
        schedule_timezone_name,
        schedule_source,
        is_schedule_locked,
        creation_command_id,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        p_litter_id,
        v_item.id,
        'organization_template',
        v_item.organization_template_id,
        1,
        v_item.category,
        v_item.target_scope,
        v_item.title,
        v_item.description,
        v_item.anchor_type,
        p_actual_birth_date,
        null,
        null,
        'window',
        v_item.priority,
        p_actual_birth_date + v_item.window_starts_offset_days,
        v_item.window_starts_local_time,
        p_actual_birth_date + v_item.window_ends_offset_days,
        v_item.window_ends_local_time,
        p_actual_birth_date + v_item.window_starts_offset_days,
        v_item.window_starts_local_time,
        p_actual_birth_date + v_item.window_ends_offset_days,
        v_item.window_ends_local_time,
        v_plan.timezone_name,
        'suggested',
        false,
        gen_random_uuid(),
        p_actor_id,
        p_actor_id
      );
    elsif v_item.item_kind in ('milestone', 'task') then
      insert into public.litter_care_tasks (
        organization_id,
        litter_id,
        litter_plan_item_id,
        source,
        organization_template_id,
        occurrence_no,
        category,
        target_scope,
        title,
        description,
        anchor_type,
        anchor_date,
        offset_days,
        planned_for,
        item_kind,
        priority,
        suggested_for,
        suggested_local_time,
        scheduled_local_time,
        schedule_timezone_name,
        schedule_source,
        is_schedule_locked,
        creation_command_id,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        p_litter_id,
        v_item.id,
        'organization_template',
        v_item.organization_template_id,
        1,
        v_item.category,
        v_item.target_scope,
        v_item.title,
        v_item.description,
        v_item.anchor_type,
        p_actual_birth_date,
        v_item.point_offset_days,
        p_actual_birth_date + v_item.point_offset_days,
        v_item.item_kind,
        v_item.priority,
        p_actual_birth_date + v_item.point_offset_days,
        v_item.point_local_time,
        v_item.point_local_time,
        v_plan.timezone_name,
        'suggested',
        false,
        gen_random_uuid(),
        p_actor_id,
        p_actor_id
      );
    else
      raise exception 'unsupported pending first-birth plan item kind'
        using errcode = '23514';
    end if;

    v_materialized_item_count := v_materialized_item_count + 1;
    v_created_task_count := v_created_task_count + 1;
    v_plan_changed := true;
  end loop;

  for v_series in
    select series.*
    from public.litter_plan_series series
    where series.organization_id = p_organization_id
      and series.litter_plan_id = v_plan.id
      and series.end_kind = 'actual_birth'
      and series.state in ('active', 'suspended', 'completed')
      and public.litter_plan_series_needs_actual_birth_reconciliation(
        series.organization_id,
        series.id,
        series.end_kind,
        series.state,
        series.ends_on,
        p_actual_birth_date
      )
    order by series.id
  loop
    select count(*)
    into v_previous_not_applicable_count
    from public.litter_care_tasks task
    where task.organization_id = p_organization_id
      and task.litter_plan_series_id = v_series.id
      and task.status = 'not_applicable'
      and task.resolution_note = 'actual_birth_reached';

    select *
    into v_materialization
    from public.materialize_litter_plan_series_occurrences(
      v_series.id,
      p_actual_birth_date,
      p_actor_id,
      p_whelping_client_command_id,
      true
    );

    if not exists (
      select 1
      from public.litter_plan_series series
      where series.id = v_series.id
        and series.ends_on = p_actual_birth_date
        and series.state = 'completed'
        and series.completion_reason = 'actual_birth_reached'
    ) then
      raise exception 'actual-birth series reconciliation invariant failed'
        using errcode = '23514';
    end if;

    select count(*)
    into v_result_not_applicable_count
    from public.litter_care_tasks task
    where task.organization_id = p_organization_id
      and task.litter_plan_series_id = v_series.id
      and task.status = 'not_applicable'
      and task.resolution_note = 'actual_birth_reached';

    v_not_applicable_occurrence_count :=
      v_not_applicable_occurrence_count
      + greatest(
        v_result_not_applicable_count - v_previous_not_applicable_count,
        0
      );
    v_reconciled_series_count := v_reconciled_series_count + 1;
    v_plan_changed := true;
  end loop;

  perform pg_catalog.set_config(
    'app.litter_actual_birth_plan_activation',
    'off',
    true
  );

  if v_plan_changed then
    update public.litter_plans plan
    set
      revision = v_previous_plan_revision + 1,
      updated_by = p_actor_id
    where plan.id = v_plan.id
    returning plan.revision into v_result_plan_revision;
  else
    v_result_plan_revision := v_previous_plan_revision;
  end if;

  v_result := jsonb_build_object(
    'outcome', 'success',
    'planChanged', v_plan_changed,
    'materializedItemCount', v_materialized_item_count,
    'createdTaskCount', v_created_task_count,
    'createdSeriesOccurrenceCount', v_created_series_occurrence_count,
    'reconciledSeriesCount', v_reconciled_series_count,
    'notApplicableOccurrenceCount', v_not_applicable_occurrence_count
  );

  insert into public.litter_plan_actual_birth_activations (
    organization_id,
    litter_id,
    litter_plan_id,
    whelping_client_command_id,
    actual_birth_date,
    previous_plan_revision,
    result_plan_revision,
    materialized_item_count,
    created_task_count,
    created_series_occurrence_count,
    reconciled_series_count,
    not_applicable_occurrence_count,
    result,
    created_by
  ) values (
    p_organization_id,
    p_litter_id,
    v_plan.id,
    p_whelping_client_command_id,
    p_actual_birth_date,
    v_previous_plan_revision,
    v_result_plan_revision,
    v_materialized_item_count,
    v_created_task_count,
    v_created_series_occurrence_count,
    v_reconciled_series_count,
    v_not_applicable_occurrence_count,
    v_result,
    p_actor_id
  );

  return v_result;
end;
$function$;

revoke all on function public.activate_litter_plan_on_first_birth_internal(
  uuid,
  uuid,
  date,
  uuid,
  uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public transactional wrapper with the historical contract
-- ---------------------------------------------------------------------------
create function public.record_whelping_birth(
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_litter_id uuid;
  v_membership_role text;
  v_initial_collar_color text := nullif(btrim(p_initial_collar_color), '');
  v_note text := nullif(btrim(p_note), '');
  v_actual_birth_date date;
  v_result record;
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
    or (p_measured_at is not null and not pg_catalog.isfinite(p_measured_at))
  then
    select *
    into v_result
    from public.record_whelping_birth_core_internal(
      p_session_id,
      p_client_command_id,
      p_occurred_at,
      p_sex,
      p_viability,
      p_initial_collar_color,
      p_weight_grams,
      p_measured_at,
      p_note
    );

    outcome := v_result.outcome;
    birth_id := v_result.birth_id;
    event_id := v_result.event_id;
    animal_id := v_result.animal_id;
    weight_measurement_id := v_result.weight_measurement_id;
    event_sequence_no := v_result.event_sequence_no;
    birth_order := v_result.birth_order;
    replayed := v_result.replayed;
    reason := v_result.reason;
    return next;
    return;
  end if;

  select session.organization_id, session.litter_id
  into v_organization_id, v_litter_id
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
  where membership.organization_id = v_organization_id
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

  perform public.acquire_litter_plan_mutation_lock(
    v_organization_id,
    v_litter_id
  );

  select *
  into v_result
  from public.record_whelping_birth_core_internal(
    p_session_id,
    p_client_command_id,
    p_occurred_at,
    p_sex,
    p_viability,
    p_initial_collar_color,
    p_weight_grams,
    p_measured_at,
    p_note
  );

  outcome := v_result.outcome;
  birth_id := v_result.birth_id;
  event_id := v_result.event_id;
  animal_id := v_result.animal_id;
  weight_measurement_id := v_result.weight_measurement_id;
  event_sequence_no := v_result.event_sequence_no;
  birth_order := v_result.birth_order;
  replayed := v_result.replayed;
  reason := v_result.reason;

  if outcome = 'success' and birth_order = 1 then
    select litter.actual_birth_date
    into v_actual_birth_date
    from public.litters litter
    where litter.organization_id = v_organization_id
      and litter.id = v_litter_id;

    perform public.activate_litter_plan_on_first_birth_internal(
      v_organization_id,
      v_litter_id,
      v_actual_birth_date,
      auth.uid(),
      p_client_command_id
    );
  end if;

  return next;
end;
$function$;

alter function public.record_whelping_birth(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) owner to postgres;

revoke all on function public.record_whelping_birth(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function public.record_whelping_birth(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) to authenticated;

comment on function public.record_whelping_birth_core_internal(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) is
  'Historical birth command implementation, renamed without body replacement and callable only by the postgres-owned wrapper.';

comment on function public.record_whelping_birth(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) is
  'Public birth command preserving the historical contract while serializing and activating first-birth litter planning atomically.';

comment on table public.litter_plan_actual_birth_activations is
  'Private append-only audit of the one-time litter planning reaction to the first recorded birth.';

commit;

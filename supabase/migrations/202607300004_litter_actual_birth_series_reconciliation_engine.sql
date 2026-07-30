-- LITTER-ACTUAL-BIRTH-SERIES-RECONCILIATION-ENGINE-01
-- Private, audited reconciliation of terminal actual-birth series after an
-- authoritative correction moved the litter's actual birth date.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guard the shared helper before changing its definition
-- ---------------------------------------------------------------------------

create temporary table helper_definition_guard (
  function_oid oid not null,
  owner_name text not null,
  security_definer boolean not null,
  function_config text[],
  function_acl aclitem[],
  normalized_fingerprint text not null
) on commit drop;

do $guard$
declare
  v_function_count integer;
  v_function_oid oid;
  v_definition text;
  v_fingerprint text;
begin
  select count(*)
  into v_function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'materialize_litter_plan_series_occurrences';

  if v_function_count <> 1 then
    raise exception
      'materialize helper guard failed: expected one signature, found %',
      v_function_count;
  end if;

  v_function_oid :=
    'public.materialize_litter_plan_series_occurrences(uuid,date,uuid,uuid,boolean)'::regprocedure::oid;
  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
  v_fingerprint := md5(
    pg_catalog.regexp_replace(v_definition, '[[:space:]]+', '', 'g')
  );

  if v_fingerprint <> '130549724bfc9277e10ca2f718ba6a67' then
    raise exception
      'materialize helper guard failed: normalized fingerprint changed (%)',
      v_fingerprint;
  end if;

  insert into helper_definition_guard (
    function_oid,
    owner_name,
    security_definer,
    function_config,
    function_acl,
    normalized_fingerprint
  )
  select
    procedure.oid,
    pg_catalog.pg_get_userbyid(procedure.proowner),
    procedure.prosecdef,
    procedure.proconfig,
    procedure.proacl,
    v_fingerprint
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_function_oid;

  if not exists (
    select 1
    from helper_definition_guard guard
    where guard.owner_name = 'postgres'
      and guard.security_definer
      and coalesce('search_path=""' = any(guard.function_config), false)
      and coalesce('row_security=off' = any(guard.function_config), false)
  ) then
    raise exception 'materialize helper guard failed: historical properties changed';
  end if;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- 2. Private append-only audit
-- ---------------------------------------------------------------------------

create table public.litter_plan_series_actual_birth_reconciliation_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid not null,
  litter_plan_item_id uuid not null,
  series_id uuid not null,
  birth_id uuid not null,
  birth_adjustment_client_command_id uuid not null,
  previous_actual_birth_date date not null,
  result_actual_birth_date date not null,
  expected_series_revision_no integer not null check (expected_series_revision_no > 0),
  previous_series_revision_no integer not null check (previous_series_revision_no > 0),
  result_series_revision_no integer not null check (
    result_series_revision_no = previous_series_revision_no + 1
  ),
  previous_ends_on date not null,
  result_ends_on date not null,
  previous_materialized_through date,
  result_materialized_through date not null,
  previous_occurrence_count integer not null check (previous_occurrence_count >= 0),
  result_occurrence_count integer not null check (result_occurrence_count >= 0),
  restored_occurrence_count integer not null check (restored_occurrence_count >= 0),
  inserted_occurrence_count integer not null check (inserted_occurrence_count >= 0),
  not_applicable_occurrence_count integer not null check (
    not_applicable_occurrence_count >= 0
  ),
  skipped_identical_count integer not null check (skipped_identical_count >= 0),
  outcome text not null check (outcome = 'success'),
  reason text,
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_org_id_key
    unique (organization_id, id),
  constraint litter_plan_series_birth_reconciliation_identity_key
    unique (
      organization_id,
      series_id,
      birth_adjustment_client_command_id
    ),
  constraint litter_plan_series_birth_reconciliation_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans (organization_id, litter_id, id) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_item_fk
    foreign key (organization_id, litter_id, litter_plan_id, litter_plan_item_id)
    references public.litter_plan_items (
      organization_id,
      litter_id,
      litter_plan_id,
      id
    ) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_series_fk
    foreign key (organization_id, litter_id, series_id)
    references public.litter_plan_series (organization_id, litter_id, id)
    on delete restrict,
  constraint litter_plan_series_birth_reconciliation_birth_fk
    foreign key (organization_id, birth_id)
    references public.whelping_births (organization_id, id) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_adjustment_fk
    foreign key (organization_id, birth_adjustment_client_command_id)
    references public.whelping_birth_adjustment_commands (
      organization_id,
      client_command_id
    ) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_dates_check check (
    previous_actual_birth_date = previous_ends_on
    and result_actual_birth_date = result_ends_on
    and previous_actual_birth_date is distinct from result_actual_birth_date
  )
);

create table public.litter_plan_series_actual_birth_reconciliation_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  task_id uuid not null,
  change_type text not null check (
    change_type in ('restored', 'inserted', 'marked_not_applicable')
  ),
  previous_revision_no integer,
  result_revision_no integer not null check (result_revision_no >= 0),
  snapshot_before jsonb,
  snapshot_after jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint litter_plan_series_birth_reconciliation_changes_org_id_key
    unique (organization_id, id),
  constraint litter_series_birth_reconciliation_changes_command_task_key
    unique (organization_id, command_id, task_id),
  constraint litter_plan_series_birth_reconciliation_changes_command_fk
    foreign key (organization_id, command_id)
    references public.litter_plan_series_actual_birth_reconciliation_commands (
      organization_id,
      id
    ) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_changes_task_fk
    foreign key (organization_id, task_id)
    references public.litter_care_tasks (organization_id, id) on delete restrict,
  constraint litter_plan_series_birth_reconciliation_changes_shape_check check (
    (
      change_type = 'inserted'
      and previous_revision_no is null
      and snapshot_before is null
    )
    or (
      change_type in ('restored', 'marked_not_applicable')
      and previous_revision_no is not null
      and snapshot_before is not null
      and result_revision_no = previous_revision_no + 1
    )
  )
);

create or replace function public.prevent_litter_plan_series_birth_reconciliation_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if tg_op = 'DELETE'
    and auth.uid() is null
    and current_setting('app.fixture_cleanup', true) = 'on'
  then
    return old;
  end if;

  raise exception 'litter actual-birth series reconciliation audit is append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_plan_series_birth_reconciliation_commands_append_only
before update or delete
on public.litter_plan_series_actual_birth_reconciliation_commands
for each row
execute function public.prevent_litter_plan_series_birth_reconciliation_mutation();

create trigger litter_plan_series_birth_reconciliation_changes_append_only
before update or delete
on public.litter_plan_series_actual_birth_reconciliation_changes
for each row
execute function public.prevent_litter_plan_series_birth_reconciliation_mutation();

alter table public.litter_plan_series_actual_birth_reconciliation_commands
  enable row level security;
alter table public.litter_plan_series_actual_birth_reconciliation_changes
  enable row level security;

revoke all on table
  public.litter_plan_series_actual_birth_reconciliation_commands,
  public.litter_plan_series_actual_birth_reconciliation_changes
from public, anon, authenticated;

revoke all on function
  public.prevent_litter_plan_series_birth_reconciliation_mutation()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private orchestrator
-- ---------------------------------------------------------------------------

create function public.reconcile_completed_actual_birth_series_internal(
  p_series_id uuid,
  p_birth_id uuid,
  p_birth_adjustment_client_command_id uuid,
  p_previous_actual_birth_date date,
  p_result_actual_birth_date date,
  p_actor_id uuid,
  p_expected_series_revision_no integer
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  series_id uuid,
  revision_no integer,
  restored_occurrence_count integer,
  inserted_occurrence_count integer,
  not_applicable_occurrence_count integer,
  skipped_identical_count integer,
  ends_on date,
  materialized_through date,
  materialized_occurrence_count integer,
  result jsonb
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_probe public.litter_plan_series%rowtype;
  v_series public.litter_plan_series%rowtype;
  v_litter public.litters%rowtype;
  v_plan public.litter_plans%rowtype;
  v_item public.litter_plan_items%rowtype;
  v_adjustment public.whelping_birth_adjustment_commands%rowtype;
  v_existing_command
    public.litter_plan_series_actual_birth_reconciliation_commands%rowtype;
  v_task public.litter_care_tasks%rowtype;
  v_task_after public.litter_care_tasks%rowtype;
  v_materialization record;
  v_command_id uuid := gen_random_uuid();
  v_slot_count integer;
  v_real_occurrence_count integer;
  v_expected_day_count integer;
  v_expected_occurrence_count integer;
  v_missing_count integer;
  v_restored_count integer;
  v_marked_count integer;
  v_skipped_count integer;
  v_result_occurrence_count integer;
  v_existing_task_ids uuid[];
  v_marked_before jsonb;
  v_before jsonb;
  v_payload jsonb;
  v_error_message text;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  series_id := p_series_id;
  revision_no := null;
  restored_occurrence_count := 0;
  inserted_occurrence_count := 0;
  not_applicable_occurrence_count := 0;
  skipped_identical_count := 0;
  ends_on := null;
  materialized_through := null;
  materialized_occurrence_count := null;
  result := '{}'::jsonb;

  if p_series_id is null
    or p_birth_id is null
    or p_birth_adjustment_client_command_id is null
    or p_previous_actual_birth_date is null
    or p_result_actual_birth_date is null
    or p_previous_actual_birth_date is not distinct from p_result_actual_birth_date
    or p_actor_id is null
    or p_expected_series_revision_no is null
    or p_expected_series_revision_no <= 0
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select series.*
  into v_probe
  from public.litter_plan_series series
  where series.id = p_series_id;

  if not found then
    reason := 'invariant_failed';
    return next;
    return;
  end if;

  perform public.acquire_litter_plan_mutation_lock(
    v_probe.organization_id,
    v_probe.litter_id
  );

  -- Canonical row-lock order: litter → plan → item → series → occurrences.
  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_probe.organization_id
    and litter.id = v_probe.litter_id
  for update;

  select plan.*
  into v_plan
  from public.litter_plans plan
  where plan.organization_id = v_probe.organization_id
    and plan.id = v_probe.litter_plan_id
  for update;

  select item.*
  into v_item
  from public.litter_plan_items item
  where item.organization_id = v_probe.organization_id
    and item.id = v_probe.litter_plan_item_id
  for update;

  select series.*
  into v_series
  from public.litter_plan_series series
  where series.organization_id = v_probe.organization_id
    and series.id = p_series_id
  for update;

  perform task.id
  from public.litter_care_tasks task
  where task.organization_id = v_probe.organization_id
    and task.litter_plan_series_id = p_series_id
  order by task.id
  for update;

  select command.*
  into v_existing_command
  from public.litter_plan_series_actual_birth_reconciliation_commands command
  where command.organization_id = v_series.organization_id
    and command.series_id = v_series.id
    and command.birth_adjustment_client_command_id =
      p_birth_adjustment_client_command_id
  for update;

  if found then
    if v_existing_command.birth_id is distinct from p_birth_id
      or v_existing_command.previous_actual_birth_date
        is distinct from p_previous_actual_birth_date
      or v_existing_command.result_actual_birth_date
        is distinct from p_result_actual_birth_date
      or v_existing_command.expected_series_revision_no
        is distinct from p_expected_series_revision_no
      or v_existing_command.created_by is distinct from p_actor_id
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := v_existing_command.outcome;
    reason := v_existing_command.reason;
    replayed := true;
    revision_no := v_existing_command.result_series_revision_no;
    restored_occurrence_count := v_existing_command.restored_occurrence_count;
    inserted_occurrence_count := v_existing_command.inserted_occurrence_count;
    not_applicable_occurrence_count :=
      v_existing_command.not_applicable_occurrence_count;
    skipped_identical_count := v_existing_command.skipped_identical_count;
    ends_on := v_existing_command.result_ends_on;
    materialized_through := v_existing_command.result_materialized_through;
    materialized_occurrence_count := v_existing_command.result_occurrence_count;
    result := v_existing_command.result;
    return next;
    return;
  end if;

  if v_series.revision_no is distinct from p_expected_series_revision_no then
    reason := 'stale_revision';
    revision_no := v_series.revision_no;
    return next;
    return;
  end if;

  select adjustment.*
  into v_adjustment
  from public.whelping_birth_adjustment_commands adjustment
  where adjustment.organization_id = v_series.organization_id
    and adjustment.client_command_id = p_birth_adjustment_client_command_id
    and adjustment.command_type = 'correct_birth'
    and adjustment.litter_id = v_series.litter_id
    and adjustment.birth_id = p_birth_id;

  if not found
    or v_adjustment.created_by is distinct from p_actor_id
    or (v_adjustment.snapshot_before #>> '{litter,actual_birth_date}')::date
      is distinct from p_previous_actual_birth_date
    or (v_adjustment.snapshot_after #>> '{litter,actual_birth_date}')::date
      is distinct from p_result_actual_birth_date
    or (v_adjustment.snapshot_before #>> '{litter,actual_birth_date}')::date
      is not distinct from
      (v_adjustment.snapshot_after #>> '{litter,actual_birth_date}')::date
    or v_litter.actual_birth_date is distinct from p_result_actual_birth_date
    or not exists (
      select 1
      from public.whelping_births birth
      join public.whelping_sessions session
        on session.organization_id = birth.organization_id
       and session.id = birth.session_id
      where birth.organization_id = v_series.organization_id
        and birth.id = p_birth_id
        and session.litter_id = v_series.litter_id
    )
  then
    reason := 'birth_adjustment_not_authorized';
    return next;
    return;
  end if;

  select count(*)
  into v_slot_count
  from public.litter_plan_series_time_slots slot
  where slot.organization_id = v_series.organization_id
    and slot.series_id = v_series.id;

  select count(*)
  into v_real_occurrence_count
  from public.litter_care_tasks task
  where task.organization_id = v_series.organization_id
    and task.litter_plan_series_id = v_series.id;

  if v_litter.id is null
    or v_plan.id is null
    or v_item.id is null
    or v_series.id is null
    or v_litter.organization_id is distinct from v_series.organization_id
    or v_plan.organization_id is distinct from v_series.organization_id
    or v_item.organization_id is distinct from v_series.organization_id
    or v_plan.litter_id is distinct from v_series.litter_id
    or v_item.litter_id is distinct from v_series.litter_id
    or v_item.litter_plan_id is distinct from v_series.litter_plan_id
    or v_series.litter_plan_item_id is distinct from v_item.id
    or v_series.end_kind is distinct from 'actual_birth'
    or v_series.state is distinct from 'completed'
    or v_series.completion_reason is distinct from 'actual_birth_reached'
    or v_series.ends_on is distinct from p_previous_actual_birth_date
    or v_series.recurrence_kind is distinct from 'daily_interval'
    or v_series.recurrence_interval_days not between 1 and 365
    or v_series.starts_on is null
    or v_item.anchor_date_snapshot is null
    or v_series.starts_on is distinct from (
      v_item.anchor_date_snapshot + v_item.recurrence_starts_offset_days
    )
    or p_result_actual_birth_date < v_series.starts_on
    or v_slot_count not between 1 and 8
    or v_series.materialized_occurrence_count is distinct from v_real_occurrence_count
    or not exists (
      select 1
      from public.litter_plan_series_time_slots slot
      where slot.organization_id = v_series.organization_id
        and slot.series_id = v_series.id
      having min(slot.slot_no) = 1
        and max(slot.slot_no) = count(*)
        and count(distinct slot.slot_no) = count(*)
    )
    or exists (
      select 1
      from public.litter_care_tasks task
      where task.organization_id = v_series.organization_id
        and task.litter_plan_series_id = v_series.id
        and (
          task.litter_id is distinct from v_series.litter_id
          or task.litter_plan_item_id is distinct from v_item.id
          or task.item_kind is distinct from 'recurring_task'
          or task.recurrence_day_no is null
          or task.recurrence_day_no <= 0
          or task.slot_no is null
          or task.slot_no <= 0
          or task.slot_no > v_slot_count
          or task.occurrence_no is distinct from (
            ((task.recurrence_day_no - 1) * v_slot_count) + task.slot_no
          )
          or (
            task.status = 'planned'
            and task.schedule_source = 'suggested'
            and task.is_schedule_locked = false
            and task.planned_for is distinct from (
              v_series.starts_on
              + (
                (task.recurrence_day_no - 1)
                * v_series.recurrence_interval_days
              )
            )
          )
        )
    )
  then
    reason := 'invariant_failed';
    return next;
    return;
  end if;

  v_expected_day_count :=
    ((p_result_actual_birth_date - v_series.starts_on)
      / v_series.recurrence_interval_days) + 1;
  v_expected_occurrence_count := v_expected_day_count * v_slot_count;

  with expected as (
    select
      day_no,
      slot_no,
      ((day_no - 1) * v_slot_count) + slot_no as occurrence_no
    from generate_series(1, v_expected_day_count) day_no
    cross join generate_series(1, v_slot_count) slot_no
  )
  select count(*)::integer
  into v_missing_count
  from expected
  left join public.litter_care_tasks task
    on task.organization_id = v_series.organization_id
   and task.litter_plan_series_id = v_series.id
   and task.recurrence_day_no = expected.day_no
   and task.slot_no = expected.slot_no
  where task.id is null;

  if exists (
    with expected as (
      select
        day_no,
        slot_no,
        ((day_no - 1) * v_slot_count) + slot_no as occurrence_no
      from generate_series(1, v_expected_day_count) day_no
      cross join generate_series(1, v_slot_count) slot_no
    )
    select 1
    from expected
    join public.litter_care_tasks task
      on task.organization_id = v_series.organization_id
     and task.litter_id = v_series.litter_id
     and task.litter_plan_item_id = v_item.id
     and task.occurrence_no = expected.occurrence_no
    where task.litter_plan_series_id is distinct from v_series.id
       or task.recurrence_day_no is distinct from expected.day_no
       or task.slot_no is distinct from expected.slot_no
  ) then
    reason := 'invariant_failed';
    return next;
    return;
  end if;

  select count(*)::integer
  into v_restored_count
  from public.litter_care_tasks task
  where task.organization_id = v_series.organization_id
    and task.litter_id = v_series.litter_id
    and task.litter_plan_series_id = v_series.id
    and task.status = 'not_applicable'
    and task.resolution_note = 'actual_birth_reached'
    and task.planned_for > p_previous_actual_birth_date
    and task.planned_for <= p_result_actual_birth_date
    and not exists (
      select 1
      from public.maternal_observation_task_links fact
      where fact.organization_id = task.organization_id
        and fact.litter_care_task_id = task.id
    );

  select count(*)::integer
  into v_marked_count
  from public.litter_care_tasks task
  where task.organization_id = v_series.organization_id
    and task.litter_id = v_series.litter_id
    and task.litter_plan_series_id = v_series.id
    and task.status = 'planned'
    and task.planned_for > p_result_actual_birth_date;

  v_result_occurrence_count := v_real_occurrence_count + v_missing_count;
  v_skipped_count := case
    when p_result_actual_birth_date > p_previous_actual_birth_date
      then v_expected_occurrence_count - v_missing_count
    else 0
  end;

  if v_expected_occurrence_count > v_series.absolute_max_occurrences
    or v_result_occurrence_count > v_series.absolute_max_occurrences
  then
    reason := 'absolute_max_insufficient';
    revision_no := v_series.revision_no;
    return next;
    return;
  end if;

  select coalesce(array_agg(task.id order by task.id), '{}'::uuid[])
  into v_existing_task_ids
  from public.litter_care_tasks task
  where task.organization_id = v_series.organization_id
    and task.litter_plan_series_id = v_series.id;

  select coalesce(
    jsonb_agg(to_jsonb(task) order by task.id),
    '[]'::jsonb
  )
  into v_marked_before
  from public.litter_care_tasks task
  where task.organization_id = v_series.organization_id
    and task.litter_id = v_series.litter_id
    and task.litter_plan_series_id = v_series.id
    and task.status = 'planned'
    and task.planned_for > p_result_actual_birth_date;

  v_payload := jsonb_build_object(
    'seriesId', v_series.id,
    'birthId', p_birth_id,
    'birthAdjustmentClientCommandId', p_birth_adjustment_client_command_id,
    'previousActualBirthDate', p_previous_actual_birth_date,
    'resultActualBirthDate', p_result_actual_birth_date,
    'expectedSeriesRevisionNo', p_expected_series_revision_no,
    'previousSeriesRevisionNo', v_series.revision_no,
    'resultSeriesRevisionNo', v_series.revision_no + 1,
    'previousEndsOn', v_series.ends_on,
    'resultEndsOn', p_result_actual_birth_date,
    'previousMaterializedThrough', v_series.materialized_through,
    'resultMaterializedThrough', p_result_actual_birth_date,
    'previousOccurrenceCount', v_real_occurrence_count,
    'resultOccurrenceCount', v_result_occurrence_count,
    'restoredOccurrenceCount', v_restored_count,
    'insertedOccurrenceCount', v_missing_count,
    'notApplicableOccurrenceCount', v_marked_count,
    'skippedIdenticalCount', v_skipped_count,
    'state', 'completed',
    'completionReason', 'actual_birth_reached'
  );

  begin
    insert into public.litter_plan_series_actual_birth_reconciliation_commands (
      id,
      organization_id,
      litter_id,
      litter_plan_id,
      litter_plan_item_id,
      series_id,
      birth_id,
      birth_adjustment_client_command_id,
      previous_actual_birth_date,
      result_actual_birth_date,
      expected_series_revision_no,
      previous_series_revision_no,
      result_series_revision_no,
      previous_ends_on,
      result_ends_on,
      previous_materialized_through,
      result_materialized_through,
      previous_occurrence_count,
      result_occurrence_count,
      restored_occurrence_count,
      inserted_occurrence_count,
      not_applicable_occurrence_count,
      skipped_identical_count,
      outcome,
      result,
      created_by
    ) values (
      v_command_id,
      v_series.organization_id,
      v_series.litter_id,
      v_series.litter_plan_id,
      v_series.litter_plan_item_id,
      v_series.id,
      p_birth_id,
      p_birth_adjustment_client_command_id,
      p_previous_actual_birth_date,
      p_result_actual_birth_date,
      p_expected_series_revision_no,
      v_series.revision_no,
      v_series.revision_no + 1,
      v_series.ends_on,
      p_result_actual_birth_date,
      v_series.materialized_through,
      p_result_actual_birth_date,
      v_real_occurrence_count,
      v_result_occurrence_count,
      v_restored_count,
      v_missing_count,
      v_marked_count,
      v_skipped_count,
      'success',
      v_payload,
      p_actor_id
    );

    for v_task in
      select task.*
      from public.litter_care_tasks task
      where task.organization_id = v_series.organization_id
        and task.litter_id = v_series.litter_id
        and task.litter_plan_series_id = v_series.id
        and task.status = 'not_applicable'
        and task.resolution_note = 'actual_birth_reached'
        and task.planned_for > p_previous_actual_birth_date
        and task.planned_for <= p_result_actual_birth_date
        and not exists (
          select 1
          from public.maternal_observation_task_links fact
          where fact.organization_id = task.organization_id
            and fact.litter_care_task_id = task.id
        )
      order by task.id
      for update
    loop
      v_before := to_jsonb(v_task);

      update public.litter_care_tasks task
      set
        status = 'planned',
        resolution_command_id = null,
        resolved_at = null,
        resolved_timezone_name = null,
        resolved_by = null,
        resolution_note = null,
        revision_no = task.revision_no + 1,
        updated_by = p_actor_id
      where task.id = v_task.id
      returning task.* into v_task_after;

      insert into public.litter_plan_series_actual_birth_reconciliation_changes (
        organization_id,
        command_id,
        task_id,
        change_type,
        previous_revision_no,
        result_revision_no,
        snapshot_before,
        snapshot_after
      ) values (
        v_series.organization_id,
        v_command_id,
        v_task.id,
        'restored',
        v_task.revision_no,
        v_task_after.revision_no,
        v_before,
        to_jsonb(v_task_after)
      );
    end loop;

    select *
    into v_materialization
    from public.materialize_litter_plan_series_occurrences(
      v_series.id,
      p_result_actual_birth_date,
      p_actor_id,
      v_command_id,
      true
    );

    select series.*
    into v_series
    from public.litter_plan_series series
    where series.id = p_series_id;

    if v_materialization.inserted_count is distinct from v_missing_count
      or v_materialization.skipped_identical_count is distinct from v_skipped_count
      or v_series.revision_no is distinct from p_expected_series_revision_no + 1
      or v_series.ends_on is distinct from p_result_actual_birth_date
      or v_series.materialized_through is distinct from p_result_actual_birth_date
      or v_series.materialized_occurrence_count
        is distinct from v_result_occurrence_count
      or v_series.state is distinct from 'completed'
      or v_series.completion_reason is distinct from 'actual_birth_reached'
    then
      raise exception 'reconciliation_postcondition_failed'
        using errcode = '23514';
    end if;

    for v_task_after in
      select task.*
      from public.litter_care_tasks task
      where task.organization_id = v_series.organization_id
        and task.litter_plan_series_id = v_series.id
        and task.id <> all(v_existing_task_ids)
      order by task.id
    loop
      insert into public.litter_plan_series_actual_birth_reconciliation_changes (
        organization_id,
        command_id,
        task_id,
        change_type,
        previous_revision_no,
        result_revision_no,
        snapshot_before,
        snapshot_after
      ) values (
        v_series.organization_id,
        v_command_id,
        v_task_after.id,
        'inserted',
        null,
        v_task_after.revision_no,
        null,
        to_jsonb(v_task_after)
      );
    end loop;

    for v_before in
      select value
      from jsonb_array_elements(v_marked_before)
    loop
      select task.*
      into v_task_after
      from public.litter_care_tasks task
      where task.id = (v_before ->> 'id')::uuid;

      if v_task_after.status is distinct from 'not_applicable'
        or v_task_after.resolution_note is distinct from 'actual_birth_reached'
        or v_task_after.revision_no
          is distinct from ((v_before ->> 'revision_no')::integer + 1)
      then
        raise exception 'reconciliation_occurrence_postcondition_failed'
          using errcode = '23514';
      end if;

      insert into public.litter_plan_series_actual_birth_reconciliation_changes (
        organization_id,
        command_id,
        task_id,
        change_type,
        previous_revision_no,
        result_revision_no,
        snapshot_before,
        snapshot_after
      ) values (
        v_series.organization_id,
        v_command_id,
        v_task_after.id,
        'marked_not_applicable',
        (v_before ->> 'revision_no')::integer,
        v_task_after.revision_no,
        v_before,
        to_jsonb(v_task_after)
      );
    end loop;

    if (
      select count(*)
      from public.litter_plan_series_actual_birth_reconciliation_changes change
      where change.organization_id = v_series.organization_id
        and change.command_id = v_command_id
        and change.change_type = 'restored'
    ) is distinct from v_restored_count
      or (
        select count(*)
        from public.litter_plan_series_actual_birth_reconciliation_changes change
        where change.organization_id = v_series.organization_id
          and change.command_id = v_command_id
          and change.change_type = 'inserted'
      ) is distinct from v_missing_count
      or (
        select count(*)
        from public.litter_plan_series_actual_birth_reconciliation_changes change
        where change.organization_id = v_series.organization_id
          and change.command_id = v_command_id
          and change.change_type = 'marked_not_applicable'
      ) is distinct from v_marked_count
    then
      raise exception 'reconciliation_audit_postcondition_failed'
        using errcode = '23514';
    end if;
  exception
    when others then
      get stacked diagnostics v_error_message = message_text;
      reason := case v_error_message
        when 'absolute_max_insufficient' then 'absolute_max_insufficient'
        when 'birth_adjustment_not_authorized' then 'birth_adjustment_not_authorized'
        else 'invariant_failed'
      end;
      revision_no := p_expected_series_revision_no;
      result := jsonb_build_object('rolledBack', true);
      return next;
      return;
  end;

  outcome := 'success';
  reason := null;
  replayed := false;
  revision_no := v_series.revision_no;
  restored_occurrence_count := v_restored_count;
  inserted_occurrence_count := v_missing_count;
  not_applicable_occurrence_count := v_marked_count;
  skipped_identical_count := v_skipped_count;
  ends_on := v_series.ends_on;
  materialized_through := v_series.materialized_through;
  materialized_occurrence_count := v_series.materialized_occurrence_count;
  result := v_payload;
  return next;
end;
$function$;

alter function public.reconcile_completed_actual_birth_series_internal(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  integer
) owner to postgres;

revoke all on function public.reconcile_completed_actual_birth_series_internal(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  integer
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Minimal guarded evolution of the shared materialization helper
-- ---------------------------------------------------------------------------

do $replace_helper$
declare
  v_function_oid oid :=
    'public.materialize_litter_plan_series_occurrences(uuid,date,uuid,uuid,boolean)'::regprocedure::oid;
  v_definition text;
  v_needle text;
  v_replacement text;
  v_occurrences integer;
begin
  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);

  v_needle := $needle$  v_allow_through_update boolean;
$needle$;
  v_replacement := $replacement$  v_allow_through_update boolean;
  v_private_birth_reconciliation boolean := false;
$replacement$;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_needle, ''))
  ) / length(v_needle);
  if v_occurrences <> 1 then
    raise exception 'materialize helper declaration patch guard failed (%)', v_occurrences;
  end if;
  v_definition := replace(v_definition, v_needle, v_replacement);

  v_needle := $needle$  v_series_revision_before := v_series.revision_no;

  v_needs_reconcile := public.litter_plan_series_needs_actual_birth_reconciliation(
$needle$;
  v_replacement := $replacement$  v_series_revision_before := v_series.revision_no;

  if p_reconciliation_only and p_command_id is not null then
    select true
    into v_private_birth_reconciliation
    from public.litter_plan_series_actual_birth_reconciliation_commands reconciliation
    join public.whelping_birth_adjustment_commands adjustment
      on adjustment.organization_id = reconciliation.organization_id
     and adjustment.client_command_id =
       reconciliation.birth_adjustment_client_command_id
    where reconciliation.id = p_command_id
      and reconciliation.organization_id = v_series.organization_id
      and reconciliation.litter_id = v_series.litter_id
      and reconciliation.litter_plan_id = v_series.litter_plan_id
      and reconciliation.litter_plan_item_id = v_series.litter_plan_item_id
      and reconciliation.series_id = v_series.id
      and reconciliation.created_at = statement_timestamp()
      and reconciliation.created_by = p_actor
      and reconciliation.outcome = 'success'
      and reconciliation.previous_series_revision_no = v_series.revision_no
      and reconciliation.expected_series_revision_no = v_series.revision_no
      and reconciliation.previous_ends_on = v_series.ends_on
      and reconciliation.previous_actual_birth_date = v_series.ends_on
      and reconciliation.result_actual_birth_date = v_litter.actual_birth_date
      and reconciliation.result_ends_on = v_litter.actual_birth_date
      and adjustment.command_type = 'correct_birth'
      and adjustment.organization_id = v_series.organization_id
      and adjustment.litter_id = v_series.litter_id
      and adjustment.birth_id = reconciliation.birth_id
      and adjustment.created_by = p_actor
      and (adjustment.snapshot_before #>> '{litter,actual_birth_date}')::date
        = reconciliation.previous_actual_birth_date
      and (adjustment.snapshot_after #>> '{litter,actual_birth_date}')::date
        = reconciliation.result_actual_birth_date
      and reconciliation.previous_actual_birth_date is distinct from
        reconciliation.result_actual_birth_date;
  end if;

  v_private_birth_reconciliation :=
    coalesce(v_private_birth_reconciliation, false);

  v_needs_reconcile := public.litter_plan_series_needs_actual_birth_reconciliation(
$replacement$;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_needle, ''))
  ) / length(v_needle);
  if v_occurrences <> 1 then
    raise exception 'materialize helper authority patch guard failed (%)', v_occurrences;
  end if;
  v_definition := replace(v_definition, v_needle, v_replacement);

  v_needle := $needle$          resolution_note = 'actual_birth_reached',
          updated_by = p_actor
$needle$;
  v_replacement := $replacement$          resolution_note = 'actual_birth_reached',
          revision_no = public.litter_care_tasks.revision_no
            + case when v_private_birth_reconciliation then 1 else 0 end,
          updated_by = p_actor
$replacement$;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_needle, ''))
  ) / length(v_needle);
  if v_occurrences <> 1 then
    raise exception 'materialize helper occurrence revision patch guard failed (%)', v_occurrences;
  end if;
  v_definition := replace(v_definition, v_needle, v_replacement);

  v_needle := $needle$  v_allow_inserts := v_series.state = 'active' and not p_reconciliation_only;
$needle$;
  v_replacement := $replacement$  v_allow_inserts :=
    (v_series.state = 'active' and not p_reconciliation_only)
    or (
      v_private_birth_reconciliation
      and v_series.state = 'completed'
      and v_series.completion_reason = 'actual_birth_reached'
      and v_series.end_kind = 'actual_birth'
    );
$replacement$;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_needle, ''))
  ) / length(v_needle);
  if v_occurrences <> 1 then
    raise exception 'materialize helper insertion patch guard failed (%)', v_occurrences;
  end if;
  v_definition := replace(v_definition, v_needle, v_replacement);

  execute v_definition;
end;
$replace_helper$;

do $post_guard$
declare
  v_current pg_catalog.pg_proc%rowtype;
  v_guard helper_definition_guard%rowtype;
begin
  select *
  into v_guard
  from helper_definition_guard;

  select procedure.*
  into v_current
  from pg_catalog.pg_proc procedure
  where procedure.oid =
    'public.materialize_litter_plan_series_occurrences(uuid,date,uuid,uuid,boolean)'::regprocedure::oid;

  if v_current.oid is distinct from v_guard.function_oid
    or pg_catalog.pg_get_userbyid(v_current.proowner)
      is distinct from v_guard.owner_name
    or v_current.prosecdef is distinct from v_guard.security_definer
    or v_current.proconfig is distinct from v_guard.function_config
    or v_current.proacl is distinct from v_guard.function_acl
  then
    raise exception 'materialize helper post-replacement properties changed';
  end if;
end;
$post_guard$;

revoke all on function public.materialize_litter_plan_series_occurrences(
  uuid,
  date,
  uuid,
  uuid,
  boolean
) from public, anon, authenticated;

comment on table
  public.litter_plan_series_actual_birth_reconciliation_commands is
  'Private append-only command audit for terminal actual-birth series reconciliation after an authoritative birth correction.';

comment on table
  public.litter_plan_series_actual_birth_reconciliation_changes is
  'Private append-only occurrence-level audit for restored, inserted, or biologically inapplicable series tasks.';

comment on function public.reconcile_completed_actual_birth_series_internal(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  integer
) is
  'Private audited orchestrator for completed/actual_birth_reached series; not connected to correct_whelping_birth yet.';

comment on function public.materialize_litter_plan_series_occurrences(
  uuid,
  date,
  uuid,
  uuid,
  boolean
) is
  'Private shared helper: historical behavior preserved; terminal insertion is authorized only by a same-statement private reconciliation audit backed by correct_birth snapshots.';

commit;

begin;

-- ---------------------------------------------------------------------------
-- 1. Harden the existing private series audit
-- ---------------------------------------------------------------------------

alter table public.litter_plan_series_actual_birth_reconciliation_commands
  add constraint litter_plan_series_birth_reconciliation_result_object_check
  check (jsonb_typeof(result) = 'object');

-- ---------------------------------------------------------------------------
-- 2. Private append-only plan reconciliation audit
-- ---------------------------------------------------------------------------

create table public.litter_plan_actual_birth_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid,
  birth_id uuid not null,
  birth_adjustment_client_command_id uuid not null,
  previous_actual_birth_date date not null,
  result_actual_birth_date date not null,
  previous_plan_revision integer,
  result_plan_revision integer,
  recalculated_item_count integer not null check (recalculated_item_count >= 0),
  changed_task_count integer not null check (changed_task_count >= 0),
  moved_automatic_schedule_count integer not null
    check (moved_automatic_schedule_count >= 0),
  preserved_manual_schedule_count integer not null
    check (preserved_manual_schedule_count >= 0),
  preserved_locked_schedule_count integer not null
    check (preserved_locked_schedule_count >= 0),
  preserved_terminal_count integer not null check (preserved_terminal_count >= 0),
  unchanged_task_count integer not null check (unchanged_task_count >= 0),
  recalculated_series_count integer not null check (recalculated_series_count >= 0),
  prebirth_series_reconciliation_count integer not null
    check (prebirth_series_reconciliation_count >= 0),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_birth_reconciliations_org_id_key
    unique (organization_id, id),
  constraint litter_plan_birth_reconciliations_command_key
    unique (organization_id, birth_adjustment_client_command_id),
  constraint litter_plan_birth_reconciliations_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_plan_birth_reconciliations_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans (organization_id, litter_id, id)
    on delete restrict,
  constraint litter_plan_birth_reconciliations_birth_fk
    foreign key (organization_id, birth_id)
    references public.whelping_births (organization_id, id) on delete restrict,
  constraint litter_plan_birth_reconciliations_adjustment_fk
    foreign key (organization_id, birth_adjustment_client_command_id)
    references public.whelping_birth_adjustment_commands (
      organization_id,
      client_command_id
    ) on delete restrict,
  constraint litter_plan_birth_reconciliations_dates_check
    check (
      previous_actual_birth_date is distinct from result_actual_birth_date
    ),
  constraint litter_plan_birth_reconciliations_revisions_check
    check (
      (
        litter_plan_id is null
        and previous_plan_revision is null
        and result_plan_revision is null
      )
      or (
        litter_plan_id is not null
        and previous_plan_revision > 0
        and result_plan_revision between
          previous_plan_revision and previous_plan_revision + 1
      )
    ),
  constraint litter_plan_birth_reconciliations_task_counts_check
    check (
      changed_task_count =
        moved_automatic_schedule_count
        + preserved_manual_schedule_count
        + preserved_locked_schedule_count
        + preserved_terminal_count
    )
);

create table public.litter_plan_actual_birth_reconciliation_task_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  task_id uuid not null,
  classification text not null check (
    classification in (
      'automatic_moved',
      'manual_preserved',
      'locked_preserved',
      'terminal_preserved'
    )
  ),
  previous_revision_no integer not null check (previous_revision_no >= 0),
  result_revision_no integer not null check (
    result_revision_no = previous_revision_no + 1
  ),
  snapshot_before jsonb not null check (jsonb_typeof(snapshot_before) = 'object'),
  snapshot_after jsonb not null check (jsonb_typeof(snapshot_after) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint litter_plan_birth_task_changes_org_id_key
    unique (organization_id, id),
  constraint litter_plan_birth_task_changes_command_task_key
    unique (organization_id, command_id, task_id),
  constraint litter_plan_birth_task_changes_command_fk
    foreign key (organization_id, command_id)
    references public.litter_plan_actual_birth_reconciliations (
      organization_id,
      id
    ) on delete restrict,
  constraint litter_plan_birth_task_changes_task_fk
    foreign key (organization_id, task_id)
    references public.litter_care_tasks (organization_id, id) on delete restrict
);

create index litter_plan_birth_reconciliations_litter_created_idx
  on public.litter_plan_actual_birth_reconciliations (
    organization_id,
    litter_id,
    created_at,
    id
  );

create index litter_plan_birth_task_changes_task_created_idx
  on public.litter_plan_actual_birth_reconciliation_task_changes (
    organization_id,
    task_id,
    created_at,
    id
  );

create or replace function public.prevent_litter_plan_actual_birth_reconciliation_mutation()
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

  raise exception 'litter actual-birth plan reconciliation audit is append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_plan_actual_birth_reconciliations_append_only
before update or delete
on public.litter_plan_actual_birth_reconciliations
for each row
execute function public.prevent_litter_plan_actual_birth_reconciliation_mutation();

create trigger litter_plan_actual_birth_task_changes_append_only
before update or delete
on public.litter_plan_actual_birth_reconciliation_task_changes
for each row
execute function public.prevent_litter_plan_actual_birth_reconciliation_mutation();

alter table public.litter_plan_actual_birth_reconciliations
  enable row level security;
alter table public.litter_plan_actual_birth_reconciliation_task_changes
  enable row level security;

revoke all on table
  public.litter_plan_actual_birth_reconciliations,
  public.litter_plan_actual_birth_reconciliation_task_changes
from public, anon, authenticated;

alter function public.prevent_litter_plan_actual_birth_reconciliation_mutation()
  owner to postgres;

revoke all on function
  public.prevent_litter_plan_actual_birth_reconciliation_mutation()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rename the historical correction implementation without copying its body
-- ---------------------------------------------------------------------------

do $rename_core$
declare
  v_signature regprocedure :=
    'public.correct_whelping_birth(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text)'::regprocedure;
  v_oid oid := v_signature::oid;
  v_owner oid;
  v_security_definer boolean;
  v_config text[];
  v_acl aclitem[];
  v_defaults text;
  v_body_sha256 text;
  v_after pg_proc%rowtype;
begin
  if (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'correct_whelping_birth'
  ) <> 1 then
    raise exception 'correct_whelping_birth guard failed: expected one overload';
  end if;

  if to_regprocedure(
    'public.correct_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text)'
  ) is not null then
    raise exception 'correct_whelping_birth guard failed: core name already exists';
  end if;

  select
    procedure.proowner,
    procedure.prosecdef,
    procedure.proconfig,
    procedure.proacl,
    pg_get_expr(procedure.proargdefaults, 0),
    encode(
      digest(
        convert_to(
          regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_owner,
    v_security_definer,
    v_config,
    v_acl,
    v_defaults,
    v_body_sha256
  from pg_proc procedure
  where procedure.oid = v_oid;

  execute
    'alter function public.correct_whelping_birth('
    || 'uuid,uuid,integer,timestamptz,text,text,text,text,'
    || 'integer,timestamptz,text,text'
    || ') rename to correct_whelping_birth_core_internal';

  select *
  into v_after
  from pg_proc procedure
  where procedure.oid =
    'public.correct_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text)'::regprocedure;

  if v_after.oid is distinct from v_oid
    or v_after.proowner is distinct from v_owner
    or v_after.prosecdef is distinct from v_security_definer
    or v_after.proconfig is distinct from v_config
    or v_after.proacl is distinct from v_acl
    or pg_get_expr(v_after.proargdefaults, 0) is distinct from v_defaults
    or encode(
      digest(
        convert_to(
          regexp_replace(v_after.prosrc, '\s+', ' ', 'g'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) is distinct from v_body_sha256
  then
    raise exception 'correct_whelping_birth guard failed: rename changed definition properties';
  end if;
end;
$rename_core$;

revoke all on function public.correct_whelping_birth_core_internal(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Private actual-birth plan reconciliation
-- ---------------------------------------------------------------------------

create function public.reconcile_litter_plan_actual_birth_date_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_birth_id uuid,
  p_birth_adjustment_client_command_id uuid,
  p_previous_actual_birth_date date,
  p_result_actual_birth_date date,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_adjustment public.whelping_birth_adjustment_commands%rowtype;
  v_existing public.litter_plan_actual_birth_reconciliations%rowtype;
  v_litter public.litters%rowtype;
  v_plan public.litter_plans%rowtype;
  v_item public.litter_plan_items%rowtype;
  v_series public.litter_plan_series%rowtype;
  v_task public.litter_care_tasks%rowtype;
  v_after public.litter_care_tasks%rowtype;
  v_series_result record;
  v_audit_id uuid := gen_random_uuid();
  v_previous_plan_revision integer;
  v_result_plan_revision integer;
  v_series_count integer;
  v_slot_count integer;
  v_slot_min integer;
  v_slot_max integer;
  v_slot_distinct integer;
  v_expected_day_count integer;
  v_expected_occurrence_count integer;
  v_actual_occurrence_count integer;
  v_new_starts_on date;
  v_new_ends_on date;
  v_old_starts_on date;
  v_old_ends_on date;
  v_new_suggested date;
  v_new_start date;
  v_new_end date;
  v_slot_time time;
  v_classification text;
  v_task_changed boolean;
  v_plan_changed boolean := false;
  v_recalculated_item_count integer := 0;
  v_changed_task_count integer := 0;
  v_moved_automatic_count integer := 0;
  v_preserved_manual_count integer := 0;
  v_preserved_locked_count integer := 0;
  v_preserved_terminal_count integer := 0;
  v_unchanged_task_count integer := 0;
  v_recalculated_series_count integer := 0;
  v_prebirth_series_count integer := 0;
  v_task_changes jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_organization_id is null
    or p_litter_id is null
    or p_birth_id is null
    or p_birth_adjustment_client_command_id is null
    or p_previous_actual_birth_date is null
    or p_result_actual_birth_date is null
    or p_previous_actual_birth_date is not distinct from p_result_actual_birth_date
    or p_actor_id is null
  then
    raise exception 'invalid actual-birth plan reconciliation input'
      using errcode = '22023';
  end if;

  select adjustment.*
  into v_adjustment
  from public.whelping_birth_adjustment_commands adjustment
  where adjustment.organization_id = p_organization_id
    and adjustment.client_command_id = p_birth_adjustment_client_command_id
    and adjustment.command_type = 'correct_birth'
    and adjustment.litter_id = p_litter_id
    and adjustment.birth_id = p_birth_id
    and adjustment.created_by = p_actor_id;

  if not found
    or (v_adjustment.snapshot_before #>> '{litter,actual_birth_date}')::date
      is distinct from p_previous_actual_birth_date
    or (v_adjustment.snapshot_after #>> '{litter,actual_birth_date}')::date
      is distinct from p_result_actual_birth_date
  then
    raise exception 'actual-birth adjustment authority mismatch'
      using errcode = '23514';
  end if;

  select reconciliation.*
  into v_existing
  from public.litter_plan_actual_birth_reconciliations reconciliation
  where reconciliation.organization_id = p_organization_id
    and reconciliation.birth_adjustment_client_command_id =
      p_birth_adjustment_client_command_id;

  if found then
    if v_existing.litter_id is distinct from p_litter_id
      or v_existing.birth_id is distinct from p_birth_id
      or v_existing.previous_actual_birth_date is distinct from
        p_previous_actual_birth_date
      or v_existing.result_actual_birth_date is distinct from
        p_result_actual_birth_date
      or v_existing.created_by is distinct from p_actor_id
    then
      raise exception 'actual-birth plan reconciliation command conflict'
        using errcode = '23505';
    end if;
    return;
  end if;

  perform public.acquire_litter_plan_mutation_lock(
    p_organization_id,
    p_litter_id
  );

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = p_organization_id
    and litter.id = p_litter_id
    and litter.deleted_at is null
  for update;

  if not found
    or v_litter.actual_birth_date is distinct from p_result_actual_birth_date
  then
    raise exception 'actual-birth litter invariant failed'
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
      'recalculatedItemCount', 0,
      'changedTaskCount', 0,
      'movedAutomaticScheduleCount', 0,
      'preservedManualScheduleCount', 0,
      'preservedLockedScheduleCount', 0,
      'preservedTerminalCount', 0,
      'unchangedTaskCount', 0,
      'recalculatedSeriesCount', 0,
      'prebirthSeriesReconciliationCount', 0
    );

    insert into public.litter_plan_actual_birth_reconciliations (
      id,
      organization_id,
      litter_id,
      litter_plan_id,
      birth_id,
      birth_adjustment_client_command_id,
      previous_actual_birth_date,
      result_actual_birth_date,
      previous_plan_revision,
      result_plan_revision,
      recalculated_item_count,
      changed_task_count,
      moved_automatic_schedule_count,
      preserved_manual_schedule_count,
      preserved_locked_schedule_count,
      preserved_terminal_count,
      unchanged_task_count,
      recalculated_series_count,
      prebirth_series_reconciliation_count,
      result,
      created_by
    ) values (
      v_audit_id,
      p_organization_id,
      p_litter_id,
      null,
      p_birth_id,
      p_birth_adjustment_client_command_id,
      p_previous_actual_birth_date,
      p_result_actual_birth_date,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      v_result,
      p_actor_id
    );
    return;
  end if;

  v_previous_plan_revision := v_plan.revision;

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

  -- Complete preflight before the first planning write.
  for v_item in
    select item.*
    from public.litter_plan_items item
    where item.organization_id = p_organization_id
      and item.litter_plan_id = v_plan.id
      and item.materialization_state = 'materialized'
      and item.anchor_type in ('actual_birth', 'offspring_age')
    order by item.id
  loop
    if v_item.item_kind = 'recurring_task' then
      select count(*)
      into v_series_count
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.litter_plan_id = v_plan.id
        and series.litter_plan_item_id = v_item.id;

      if v_series_count <> 1
        or v_item.recurrence_interval_days is null
        or v_item.recurrence_interval_days <= 0
        or v_item.recurrence_starts_offset_days is null
        or v_item.recurrence_end_kind not in (
          'fixed_end_offset',
          'fixed_recurrence_day_count'
        )
      then
        raise exception 'postnatal recurring item invariant failed'
          using errcode = '23514';
      end if;

      select series.*
      into v_series
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.litter_plan_id = v_plan.id
        and series.litter_plan_item_id = v_item.id;

      select
        count(*),
        min(slot.slot_no),
        max(slot.slot_no),
        count(distinct slot.slot_no)
      into
        v_slot_count,
        v_slot_min,
        v_slot_max,
        v_slot_distinct
      from public.litter_plan_series_time_slots slot
      where slot.organization_id = p_organization_id
        and slot.series_id = v_series.id;

      if v_slot_count not between 1 and 8
        or v_slot_min <> 1
        or v_slot_max <> v_slot_count
        or v_slot_distinct <> v_slot_count
      then
        raise exception 'postnatal recurring slot invariant failed'
          using errcode = '23514';
      end if;

      v_old_starts_on :=
        p_previous_actual_birth_date
        + v_item.recurrence_starts_offset_days;
      v_new_starts_on :=
        p_result_actual_birth_date
        + v_item.recurrence_starts_offset_days;

      if v_item.recurrence_end_kind = 'fixed_recurrence_day_count' then
        if v_item.recurrence_day_count is null
          or v_item.recurrence_day_count <= 0
        then
          raise exception 'postnatal recurrence day count invariant failed'
            using errcode = '23514';
        end if;
        v_expected_day_count := v_item.recurrence_day_count;
        v_old_ends_on :=
          v_old_starts_on
          + (
            (v_expected_day_count - 1)
            * v_item.recurrence_interval_days
          );
      else
        if v_item.recurrence_ends_offset_days is null then
          raise exception 'postnatal recurrence end invariant failed'
            using errcode = '23514';
        end if;
        v_old_ends_on :=
          p_previous_actual_birth_date
          + v_item.recurrence_ends_offset_days;
        if v_old_ends_on < v_old_starts_on
          or (v_old_ends_on - v_old_starts_on)
            % v_item.recurrence_interval_days <> 0
        then
          raise exception 'postnatal recurrence interval invariant failed'
            using errcode = '23514';
        end if;
        v_expected_day_count :=
          ((v_old_ends_on - v_old_starts_on)
            / v_item.recurrence_interval_days)
          + 1;
      end if;

      v_expected_occurrence_count := v_expected_day_count * v_slot_count;

      select count(*)
      into v_actual_occurrence_count
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_plan_series_id = v_series.id;

      if v_series.starts_on is distinct from v_old_starts_on
        or v_series.ends_on is distinct from v_old_ends_on
        or v_series.materialized_through is distinct from v_old_ends_on
        or v_series.materialized_occurrence_count is distinct from
          v_actual_occurrence_count
        or v_actual_occurrence_count <> v_expected_occurrence_count
        or v_series.absolute_max_occurrences < v_expected_occurrence_count
        or v_series.state <> 'completed'
        or v_series.completion_reason is distinct from (
          case
            when v_actual_occurrence_count >=
              v_series.absolute_max_occurrences
              then 'absolute_max_reached'
            when v_item.recurrence_end_kind = 'fixed_recurrence_day_count'
              then 'recurrence_day_count_reached'
            else 'end_offset_reached'
          end
        )
        or exists (
          select 1
          from public.litter_care_tasks task
          left join public.litter_plan_series_time_slots slot
            on slot.organization_id = task.organization_id
           and slot.series_id = task.litter_plan_series_id
           and slot.slot_no = task.slot_no
          where task.organization_id = p_organization_id
            and task.litter_plan_series_id = v_series.id
            and (
              task.litter_id is distinct from p_litter_id
              or task.litter_plan_item_id is distinct from v_item.id
              or task.item_kind is distinct from 'recurring_task'
              or task.recurrence_day_no not between 1 and v_expected_day_count
              or slot.id is null
              or task.occurrence_no is distinct from (
                ((task.recurrence_day_no - 1) * v_slot_count)
                + task.slot_no
              )
            )
        )
      then
        raise exception 'postnatal recurring series invariant failed'
          using errcode = '23514';
      end if;
    elsif v_item.item_kind in ('milestone', 'task', 'window') then
      select count(*)
      into v_actual_occurrence_count
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_id = p_litter_id
        and task.litter_plan_item_id = v_item.id;

      if v_actual_occurrence_count <> 1 then
        raise exception 'postnatal point/window task invariant failed'
          using errcode = '23514';
      end if;
    else
      raise exception 'unsupported actual-birth plan item kind'
        using errcode = '23514';
    end if;
  end loop;

  perform pg_catalog.set_config(
    'app.litter_plan_actual_birth_reconciliation',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'app.litter_care_task_schedule_rpc',
    'on',
    true
  );

  for v_item in
    select item.*
    from public.litter_plan_items item
    where item.organization_id = p_organization_id
      and item.litter_plan_id = v_plan.id
      and item.materialization_state = 'materialized'
      and item.anchor_type in ('actual_birth', 'offspring_age')
    order by item.id
  loop
    if v_item.anchor_resolution_source is distinct from 'actual_birth'
      or v_item.anchor_source_date_snapshot is distinct from
        p_result_actual_birth_date
      or v_item.anchor_adjustment_days is distinct from 0
      or v_item.anchor_date_snapshot is distinct from
        p_result_actual_birth_date
    then
      update public.litter_plan_items item
      set
        anchor_resolution_source = 'actual_birth',
        anchor_source_date_snapshot = p_result_actual_birth_date,
        anchor_adjustment_days = 0,
        anchor_date_snapshot = p_result_actual_birth_date,
        revision_no = item.revision_no + 1,
        updated_by = p_actor_id
      where item.id = v_item.id
      returning * into v_item;

      v_recalculated_item_count := v_recalculated_item_count + 1;
      v_plan_changed := true;
    end if;

    v_new_starts_on := null;
    v_new_ends_on := null;

    if v_item.item_kind = 'recurring_task' then
      select series.*
      into v_series
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.litter_plan_id = v_plan.id
        and series.litter_plan_item_id = v_item.id;

      v_new_starts_on :=
        p_result_actual_birth_date
        + v_item.recurrence_starts_offset_days;

      if v_item.recurrence_end_kind = 'fixed_recurrence_day_count' then
        v_new_ends_on :=
          v_new_starts_on
          + (
            (v_item.recurrence_day_count - 1)
            * v_item.recurrence_interval_days
          );
      elsif v_item.recurrence_end_kind = 'fixed_end_offset' then
        v_new_ends_on :=
          p_result_actual_birth_date
          + v_item.recurrence_ends_offset_days;
      else
        raise exception 'unsupported postnatal recurring end kind'
          using errcode = '23514';
      end if;

      if v_series.starts_on is distinct from v_new_starts_on
        or v_series.ends_on is distinct from v_new_ends_on
        or v_series.materialized_through is distinct from v_new_ends_on
      then
        update public.litter_plan_series series
        set
          starts_on = v_new_starts_on,
          ends_on = v_new_ends_on,
          materialized_through = v_new_ends_on,
          revision_no = series.revision_no + 1,
          updated_by = p_actor_id
        where series.id = v_series.id
        returning * into v_series;

        v_recalculated_series_count := v_recalculated_series_count + 1;
        v_plan_changed := true;
      end if;
    end if;

    for v_task in
      select task.*
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_id = p_litter_id
        and task.litter_plan_item_id = v_item.id
      order by task.id
    loop
      if v_task.status in ('done', 'cancelled', 'not_applicable') then
        v_classification := 'terminal_preserved';
      elsif v_task.is_schedule_locked then
        v_classification := 'locked_preserved';
      elsif v_task.schedule_source = 'manual' then
        v_classification := 'manual_preserved';
      elsif v_task.status = 'planned'
        and v_task.schedule_source = 'suggested'
        and not v_task.is_schedule_locked
      then
        v_classification := 'automatic_moved';
      else
        raise exception 'unsupported postnatal task schedule state'
          using errcode = '23514';
      end if;

      v_task_changed := false;

      if v_task.item_kind = 'window' then
        v_new_start :=
          p_result_actual_birth_date
          + v_item.window_starts_offset_days;
        v_new_end :=
          p_result_actual_birth_date
          + v_item.window_ends_offset_days;

        v_task_changed :=
          v_task.anchor_date is distinct from p_result_actual_birth_date
          or v_task.suggested_starts_on is distinct from v_new_start
          or v_task.suggested_starts_local_time is distinct from
            v_item.window_starts_local_time
          or v_task.suggested_ends_on is distinct from v_new_end
          or v_task.suggested_ends_local_time is distinct from
            v_item.window_ends_local_time
          or (
            v_classification = 'automatic_moved'
            and (
              v_task.retained_starts_on is distinct from v_new_start
              or v_task.retained_starts_local_time is distinct from
                v_item.window_starts_local_time
              or v_task.retained_ends_on is distinct from v_new_end
              or v_task.retained_ends_local_time is distinct from
                v_item.window_ends_local_time
            )
          );

        if v_task_changed then
          update public.litter_care_tasks task
          set
            anchor_date = p_result_actual_birth_date,
            suggested_starts_on = v_new_start,
            suggested_starts_local_time = v_item.window_starts_local_time,
            suggested_ends_on = v_new_end,
            suggested_ends_local_time = v_item.window_ends_local_time,
            retained_starts_on = case
              when v_classification = 'automatic_moved'
                then v_new_start
              else task.retained_starts_on
            end,
            retained_starts_local_time = case
              when v_classification = 'automatic_moved'
                then v_item.window_starts_local_time
              else task.retained_starts_local_time
            end,
            retained_ends_on = case
              when v_classification = 'automatic_moved'
                then v_new_end
              else task.retained_ends_on
            end,
            retained_ends_local_time = case
              when v_classification = 'automatic_moved'
                then v_item.window_ends_local_time
              else task.retained_ends_local_time
            end,
            revision_no = task.revision_no + 1,
            updated_by = p_actor_id
          where task.id = v_task.id
          returning * into v_after;
        end if;
      elsif v_task.item_kind = 'recurring_task' then
        v_new_suggested :=
          v_new_starts_on
          + (
            (v_task.recurrence_day_no - 1)
            * v_item.recurrence_interval_days
          );

        select slot.local_time
        into v_slot_time
        from public.litter_plan_series_time_slots slot
        where slot.organization_id = p_organization_id
          and slot.series_id = v_task.litter_plan_series_id
          and slot.slot_no = v_task.slot_no;

        if not found then
          raise exception 'postnatal recurring task slot invariant failed'
            using errcode = '23514';
        end if;

        v_task_changed :=
          v_task.anchor_date is distinct from p_result_actual_birth_date
          or v_task.offset_days is distinct from (
            v_new_suggested - p_result_actual_birth_date
          )
          or v_task.suggested_for is distinct from v_new_suggested
          or v_task.suggested_local_time is distinct from v_slot_time
          or (
            v_classification = 'automatic_moved'
            and (
              v_task.planned_for is distinct from v_new_suggested
              or v_task.scheduled_local_time is distinct from v_slot_time
            )
          );

        if v_task_changed then
          update public.litter_care_tasks task
          set
            anchor_date = p_result_actual_birth_date,
            offset_days = v_new_suggested - p_result_actual_birth_date,
            suggested_for = v_new_suggested,
            suggested_local_time = v_slot_time,
            planned_for = case
              when v_classification = 'automatic_moved'
                then v_new_suggested
              else task.planned_for
            end,
            scheduled_local_time = case
              when v_classification = 'automatic_moved'
                then v_slot_time
              else task.scheduled_local_time
            end,
            revision_no = task.revision_no + 1,
            updated_by = p_actor_id
          where task.id = v_task.id
          returning * into v_after;
        end if;
      else
        v_new_suggested :=
          p_result_actual_birth_date
          + v_item.point_offset_days;

        v_task_changed :=
          v_task.anchor_date is distinct from p_result_actual_birth_date
          or v_task.offset_days is distinct from v_item.point_offset_days
          or v_task.suggested_for is distinct from v_new_suggested
          or v_task.suggested_local_time is distinct from
            v_item.point_local_time
          or (
            v_classification = 'automatic_moved'
            and (
              v_task.planned_for is distinct from v_new_suggested
              or v_task.scheduled_local_time is distinct from
                v_item.point_local_time
            )
          );

        if v_task_changed then
          update public.litter_care_tasks task
          set
            anchor_date = p_result_actual_birth_date,
            offset_days = v_item.point_offset_days,
            suggested_for = v_new_suggested,
            suggested_local_time = v_item.point_local_time,
            planned_for = case
              when v_classification = 'automatic_moved'
                then v_new_suggested
              else task.planned_for
            end,
            scheduled_local_time = case
              when v_classification = 'automatic_moved'
                then v_item.point_local_time
              else task.scheduled_local_time
            end,
            revision_no = task.revision_no + 1,
            updated_by = p_actor_id
          where task.id = v_task.id
          returning * into v_after;
        end if;
      end if;

      if not v_task_changed then
        v_unchanged_task_count := v_unchanged_task_count + 1;
        continue;
      end if;

      v_changed_task_count := v_changed_task_count + 1;
      v_plan_changed := true;

      if v_classification = 'automatic_moved' then
        v_moved_automatic_count := v_moved_automatic_count + 1;
      elsif v_classification = 'manual_preserved' then
        v_preserved_manual_count := v_preserved_manual_count + 1;
      elsif v_classification = 'locked_preserved' then
        v_preserved_locked_count := v_preserved_locked_count + 1;
      else
        v_preserved_terminal_count := v_preserved_terminal_count + 1;
      end if;

      v_task_changes :=
        v_task_changes
        || jsonb_build_array(
          jsonb_build_object(
            'taskId', v_after.id,
            'classification', v_classification,
            'previousRevisionNo', v_task.revision_no,
            'resultRevisionNo', v_after.revision_no,
            'snapshotBefore', to_jsonb(v_task),
            'snapshotAfter', to_jsonb(v_after)
          )
        );
    end loop;
  end loop;

  for v_series in
    select series.*
    from public.litter_plan_series series
    where series.organization_id = p_organization_id
      and series.litter_plan_id = v_plan.id
      and series.end_kind = 'actual_birth'
      and series.state = 'completed'
      and series.completion_reason = 'actual_birth_reached'
      and series.ends_on = p_previous_actual_birth_date
    order by series.id
  loop
    select *
    into v_series_result
    from public.reconcile_completed_actual_birth_series_internal(
      v_series.id,
      p_birth_id,
      p_birth_adjustment_client_command_id,
      p_previous_actual_birth_date,
      p_result_actual_birth_date,
      p_actor_id,
      v_series.revision_no
    );

    if v_series_result.outcome is distinct from 'success' then
      raise exception 'prebirth actual-birth series reconciliation failed: %',
        coalesce(v_series_result.reason, 'unknown')
        using errcode = '23514';
    end if;

    v_prebirth_series_count := v_prebirth_series_count + 1;
    if v_series_result.replayed is not true then
      v_plan_changed := true;
    end if;
  end loop;

  if v_plan_changed then
    if not exists (
      select 1
      from public.litter_plans plan
      where plan.id = v_plan.id
        and plan.revision = v_previous_plan_revision
    ) then
      raise exception 'actual-birth plan revision invariant failed'
        using errcode = '23514';
    end if;

    update public.litter_plans plan
    set
      revision = v_previous_plan_revision + 1,
      last_recalculated_at = statement_timestamp(),
      last_recalculated_by = p_actor_id,
      updated_by = p_actor_id
    where plan.id = v_plan.id
    returning plan.revision into v_result_plan_revision;
  else
    v_result_plan_revision := v_previous_plan_revision;
  end if;

  v_result := jsonb_build_object(
    'outcome', 'success',
    'planChanged', v_plan_changed,
    'recalculatedItemCount', v_recalculated_item_count,
    'changedTaskCount', v_changed_task_count,
    'movedAutomaticScheduleCount', v_moved_automatic_count,
    'preservedManualScheduleCount', v_preserved_manual_count,
    'preservedLockedScheduleCount', v_preserved_locked_count,
    'preservedTerminalCount', v_preserved_terminal_count,
    'unchangedTaskCount', v_unchanged_task_count,
    'recalculatedSeriesCount', v_recalculated_series_count,
    'prebirthSeriesReconciliationCount', v_prebirth_series_count
  );

  insert into public.litter_plan_actual_birth_reconciliations (
    id,
    organization_id,
    litter_id,
    litter_plan_id,
    birth_id,
    birth_adjustment_client_command_id,
    previous_actual_birth_date,
    result_actual_birth_date,
    previous_plan_revision,
    result_plan_revision,
    recalculated_item_count,
    changed_task_count,
    moved_automatic_schedule_count,
    preserved_manual_schedule_count,
    preserved_locked_schedule_count,
    preserved_terminal_count,
    unchanged_task_count,
    recalculated_series_count,
    prebirth_series_reconciliation_count,
    result,
    created_by
  ) values (
    v_audit_id,
    p_organization_id,
    p_litter_id,
    v_plan.id,
    p_birth_id,
    p_birth_adjustment_client_command_id,
    p_previous_actual_birth_date,
    p_result_actual_birth_date,
    v_previous_plan_revision,
    v_result_plan_revision,
    v_recalculated_item_count,
    v_changed_task_count,
    v_moved_automatic_count,
    v_preserved_manual_count,
    v_preserved_locked_count,
    v_preserved_terminal_count,
    v_unchanged_task_count,
    v_recalculated_series_count,
    v_prebirth_series_count,
    v_result,
    p_actor_id
  );

  insert into public.litter_plan_actual_birth_reconciliation_task_changes (
    organization_id,
    command_id,
    task_id,
    classification,
    previous_revision_no,
    result_revision_no,
    snapshot_before,
    snapshot_after
  )
  select
    p_organization_id,
    v_audit_id,
    (change.value->>'taskId')::uuid,
    change.value->>'classification',
    (change.value->>'previousRevisionNo')::integer,
    (change.value->>'resultRevisionNo')::integer,
    change.value->'snapshotBefore',
    change.value->'snapshotAfter'
  from jsonb_array_elements(v_task_changes) change(value);
end;
$function$;

alter function public.reconcile_litter_plan_actual_birth_date_internal(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid
) owner to postgres;

revoke all on function public.reconcile_litter_plan_actual_birth_date_internal(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public transactional wrapper preserving the historical contract
-- ---------------------------------------------------------------------------

create function public.correct_whelping_birth(
  p_birth_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_occurred_at timestamptz,
  p_sex text,
  p_viability text,
  p_initial_collar_color text,
  p_birth_note text,
  p_weight_grams integer,
  p_weight_measured_at timestamptz,
  p_weight_note text,
  p_reason text
)
returns table (
  outcome text,
  birth_id uuid,
  animal_id uuid,
  event_id uuid,
  weight_measurement_id uuid,
  revision_no integer,
  event_sequence_no integer,
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
  v_initial_collar_color text :=
    nullif(btrim(p_initial_collar_color), '');
  v_birth_note text := nullif(btrim(p_birth_note), '');
  v_weight_note text := nullif(btrim(p_weight_note), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_core_result record;
  v_adjustment public.whelping_birth_adjustment_commands%rowtype;
  v_previous_actual_birth_date date;
  v_result_actual_birth_date date;
begin
  outcome := 'error';
  birth_id := p_birth_id;
  animal_id := null;
  event_id := null;
  weight_measurement_id := null;
  revision_no := null;
  event_sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_birth_id is null
    or p_client_command_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 0
    or p_occurred_at is null
    or not pg_catalog.isfinite(p_occurred_at)
    or p_sex not in ('male', 'female', 'unknown')
    or p_viability not in ('alive', 'stillborn', 'unknown')
    or (
      v_initial_collar_color is not null
      and char_length(v_initial_collar_color) > 255
    )
    or (
      v_birth_note is not null
      and char_length(v_birth_note) > 5000
    )
    or v_reason is null
    or char_length(v_reason) > 500
    or (
      p_weight_grams is not null
      and p_weight_grams not between 1 and 100000
    )
    or (
      p_weight_grams is null
      and (
        p_weight_measured_at is not null
        or v_weight_note is not null
      )
    )
    or (
      p_weight_grams is not null
      and (
        p_weight_measured_at is null
        or not pg_catalog.isfinite(p_weight_measured_at)
      )
    )
  then
    select *
    into v_core_result
    from public.correct_whelping_birth_core_internal(
      p_birth_id,
      p_client_command_id,
      p_expected_revision_no,
      p_occurred_at,
      p_sex,
      p_viability,
      p_initial_collar_color,
      p_birth_note,
      p_weight_grams,
      p_weight_measured_at,
      p_weight_note,
      p_reason
    );

    outcome := v_core_result.outcome;
    birth_id := v_core_result.birth_id;
    animal_id := v_core_result.animal_id;
    event_id := v_core_result.event_id;
    weight_measurement_id := v_core_result.weight_measurement_id;
    revision_no := v_core_result.revision_no;
    event_sequence_no := v_core_result.event_sequence_no;
    replayed := v_core_result.replayed;
    reason := v_core_result.reason;
    return next;
    return;
  end if;

  select birth.organization_id, session.litter_id
  into v_organization_id, v_litter_id
  from public.whelping_births birth
  join public.whelping_sessions session
    on session.organization_id = birth.organization_id
   and session.id = birth.session_id
  where birth.id = p_birth_id;

  if not found then
    reason := 'birth_not_found';
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
    reason := 'birth_not_found';
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

  begin
    select *
    into v_core_result
    from public.correct_whelping_birth_core_internal(
      p_birth_id,
      p_client_command_id,
      p_expected_revision_no,
      p_occurred_at,
      p_sex,
      p_viability,
      p_initial_collar_color,
      p_birth_note,
      p_weight_grams,
      p_weight_measured_at,
      p_weight_note,
      p_reason
    );

    outcome := v_core_result.outcome;
    birth_id := v_core_result.birth_id;
    animal_id := v_core_result.animal_id;
    event_id := v_core_result.event_id;
    weight_measurement_id := v_core_result.weight_measurement_id;
    revision_no := v_core_result.revision_no;
    event_sequence_no := v_core_result.event_sequence_no;
    replayed := v_core_result.replayed;
    reason := v_core_result.reason;

    if outcome = 'success' and not replayed then
      select adjustment.*
      into v_adjustment
      from public.whelping_birth_adjustment_commands adjustment
      where adjustment.organization_id = v_organization_id
        and adjustment.client_command_id = p_client_command_id
        and adjustment.command_type = 'correct_birth'
        and adjustment.birth_id = p_birth_id
        and adjustment.litter_id = v_litter_id
        and adjustment.created_by = v_user_id;

      if not found then
        raise exception 'fresh birth correction audit is missing'
          using errcode = '23514';
      end if;

      v_previous_actual_birth_date :=
        (v_adjustment.snapshot_before #>> '{litter,actual_birth_date}')::date;
      v_result_actual_birth_date :=
        (v_adjustment.snapshot_after #>> '{litter,actual_birth_date}')::date;

      if v_previous_actual_birth_date is not null
        and v_result_actual_birth_date is not null
        and v_previous_actual_birth_date is distinct from
          v_result_actual_birth_date
      then
        perform public.reconcile_litter_plan_actual_birth_date_internal(
          v_organization_id,
          v_litter_id,
          p_birth_id,
          p_client_command_id,
          v_previous_actual_birth_date,
          v_result_actual_birth_date,
          v_user_id
        );
      end if;
    end if;
  exception
    when others then
      outcome := 'error';
      birth_id := p_birth_id;
      animal_id := null;
      event_id := null;
      weight_measurement_id := null;
      revision_no := null;
      event_sequence_no := null;
      replayed := false;
      reason := 'technical_error';
  end;

  return next;
end;
$function$;

alter function public.correct_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) owner to postgres;

revoke all on function public.correct_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.correct_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) to authenticated;

comment on function public.correct_whelping_birth_core_internal(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) is
  'Historical birth correction implementation, renamed without body replacement and callable only by the postgres-owned wrapper.';

comment on function public.correct_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  text
) is
  'Public historical-contract wrapper that serializes and atomically reconciles litter planning when the authoritative first-birth civil date changes.';

comment on function public.reconcile_litter_plan_actual_birth_date_internal(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid
) is
  'Private actual-birth plan reconciler authorized by correct_birth snapshots; preserves retained user schedules and delegates prebirth series changes to the specialized engine.';

comment on table public.litter_plan_actual_birth_reconciliations is
  'Private append-only parent audit for atomic litter plan reconciliation after an authoritative first-birth date correction.';

comment on table public.litter_plan_actual_birth_reconciliation_task_changes is
  'Private append-only task snapshots for automatic moves and preserved manual, locked, or terminal schedules.';

commit;

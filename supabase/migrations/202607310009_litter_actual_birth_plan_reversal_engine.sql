-- LITTER-ACTUAL-BIRTH-PLAN-REVERSAL-ENGINE-01
-- Atomically restore planning after the already-authorized cancellation of
-- the source birth of the current first-birth activation.

begin;

-- ---------------------------------------------------------------------------
-- 1. Private append-only reversal audit
-- ---------------------------------------------------------------------------

create table public.litter_plan_actual_birth_plan_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  activation_id uuid not null,
  snapshot_id uuid not null,
  activation_deactivation_id uuid not null,
  birth_id uuid not null,
  birth_adjustment_client_command_id uuid not null,
  litter_plan_id uuid,
  previous_actual_birth_date date not null,
  result_actual_birth_date date,
  previous_plan_revision integer,
  result_plan_revision integer,
  deleted_task_count integer not null default 0,
  restored_task_count integer not null default 0,
  restored_series_count integer not null default 0,
  restored_item_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  constraint litter_birth_plan_reversals_org_id_key
    unique (organization_id, id),
  constraint litter_birth_plan_reversals_lineage_key
    unique (organization_id, litter_id, activation_id, id),
  constraint litter_birth_plan_reversals_activation_key
    unique (organization_id, litter_id, activation_id),
  constraint litter_birth_plan_reversals_command_key
    unique (organization_id, birth_adjustment_client_command_id),
  constraint litter_birth_plan_reversals_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters(organization_id, id) on delete restrict,
  constraint litter_birth_plan_reversals_activation_fk
    foreign key (organization_id, litter_id, activation_id)
    references public.litter_plan_actual_birth_activations(
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_birth_plan_reversals_snapshot_fk
    foreign key (organization_id, litter_id, activation_id, snapshot_id)
    references public.litter_plan_actual_birth_activation_reversal_snapshots(
      organization_id,
      litter_id,
      activation_id,
      id
    )
    on delete restrict,
  constraint litter_birth_plan_reversals_deactivation_fk
    foreign key (organization_id, activation_deactivation_id)
    references public.litter_plan_actual_birth_activation_deactivations(
      organization_id,
      id
    )
    on delete restrict,
  constraint litter_birth_plan_reversals_birth_fk
    foreign key (organization_id, birth_id)
    references public.whelping_births(organization_id, id) on delete restrict,
  constraint litter_birth_plan_reversals_command_fk
    foreign key (organization_id, birth_adjustment_client_command_id)
    references public.whelping_birth_adjustment_commands(
      organization_id,
      client_command_id
    )
    on delete restrict,
  constraint litter_birth_plan_reversals_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans(organization_id, litter_id, id)
    on delete restrict,
  constraint litter_birth_plan_reversals_dates_check
    check (
      previous_actual_birth_date is not null
      and result_actual_birth_date is null
    ),
  constraint litter_birth_plan_reversals_revisions_check
    check (
      (
        litter_plan_id is null
        and previous_plan_revision is null
        and result_plan_revision is null
      )
      or (
        litter_plan_id is not null
        and previous_plan_revision > 0
        and result_plan_revision = previous_plan_revision + 1
      )
    ),
  constraint litter_birth_plan_reversals_counts_check
    check (
      deleted_task_count >= 0
      and restored_task_count >= 0
      and restored_series_count >= 0
      and restored_item_count >= 0
    ),
  constraint litter_birth_plan_reversals_result_check
    check (jsonb_typeof(result) = 'object')
);

create table public.litter_plan_actual_birth_plan_reversal_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  reversal_id uuid not null,
  activation_id uuid not null,
  snapshot_change_id uuid not null,
  sequence_no integer not null,
  entity_kind text not null,
  entity_id uuid not null,
  reversal_action text not null,
  snapshot_before_reversal jsonb not null,
  snapshot_target jsonb not null,
  snapshot_after_reversal jsonb,
  previous_revision_no integer,
  result_revision_no integer,
  created_at timestamptz not null default statement_timestamp(),
  constraint litter_birth_plan_reversal_changes_org_id_key
    unique (organization_id, id),
  constraint litter_birth_plan_reversal_changes_sequence_key
    unique (organization_id, reversal_id, sequence_no),
  constraint litter_birth_plan_reversal_changes_snapshot_change_key
    unique (organization_id, reversal_id, snapshot_change_id),
  constraint litter_birth_plan_reversal_changes_reversal_fk
    foreign key (organization_id, litter_id, activation_id, reversal_id)
    references public.litter_plan_actual_birth_plan_reversals(
      organization_id,
      litter_id,
      activation_id,
      id
    )
    on delete restrict,
  constraint litter_birth_plan_reversal_changes_snapshot_change_fk
    foreign key (organization_id, snapshot_change_id)
    references public.litter_plan_actual_birth_activation_reversal_changes(
      organization_id,
      id
    )
    on delete restrict,
  constraint litter_birth_plan_reversal_changes_sequence_check
    check (sequence_no > 0),
  constraint litter_birth_plan_reversal_changes_entity_kind_check
    check (
      entity_kind in (
        'litter_plan_item',
        'litter_plan_series',
        'litter_care_task'
      )
    ),
  constraint litter_birth_plan_reversal_changes_action_check
    check (reversal_action in ('delete_inserted', 'restore_updated')),
  constraint litter_birth_plan_reversal_changes_snapshots_check
    check (
      jsonb_typeof(snapshot_before_reversal) = 'object'
      and jsonb_typeof(snapshot_target) = 'object'
      and (
        (
          reversal_action = 'delete_inserted'
          and snapshot_after_reversal is null
          and previous_revision_no is null
          and result_revision_no is null
        )
        or (
          reversal_action = 'restore_updated'
          and jsonb_typeof(snapshot_after_reversal) = 'object'
          and (
            (
              entity_kind in (
                'litter_plan_item',
                'litter_plan_series',
                'litter_care_task'
              )
              and previous_revision_no is not null
              and result_revision_no = previous_revision_no + 1
            )
          )
        )
      )
    )
);

create index litter_birth_plan_reversals_litter_created_idx
  on public.litter_plan_actual_birth_plan_reversals(
    organization_id,
    litter_id,
    created_at,
    id
  );

create index litter_birth_plan_reversal_changes_entity_idx
  on public.litter_plan_actual_birth_plan_reversal_changes(
    organization_id,
    entity_kind,
    entity_id,
    created_at,
    id
  );

create or replace function public.prevent_litter_birth_plan_reversal_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if tg_op = 'DELETE'
    and auth.uid() is null
    and pg_catalog.current_setting('app.fixture_cleanup', true) = 'on'
  then
    return old;
  end if;

  raise exception 'litter actual-birth plan reversal audit is append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_birth_plan_reversals_append_only
before update or delete
on public.litter_plan_actual_birth_plan_reversals
for each row
execute function public.prevent_litter_birth_plan_reversal_mutation();

create trigger litter_birth_plan_reversal_changes_append_only
before update or delete
on public.litter_plan_actual_birth_plan_reversal_changes
for each row
execute function public.prevent_litter_birth_plan_reversal_mutation();

alter table public.litter_plan_actual_birth_plan_reversals
  enable row level security;

alter table public.litter_plan_actual_birth_plan_reversal_changes
  enable row level security;

revoke all on table
  public.litter_plan_actual_birth_plan_reversals,
  public.litter_plan_actual_birth_plan_reversal_changes
from public, anon, authenticated;

revoke all on function public.prevent_litter_birth_plan_reversal_mutation()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Permit only the private reversal to clear the frozen birth-date policy.
--    Preserve the historical function OID, owner, config and ACL.
-- ---------------------------------------------------------------------------

do $adapt_weighing_policy_guard$
declare
  v_signature regprocedure :=
    'public.freeze_litter_weighing_schedule_policy()'::regprocedure;
  v_oid oid := v_signature::oid;
  v_owner oid;
  v_acl aclitem[];
  v_config text[];
  v_security_definer boolean;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_fragment text;
  v_replacement text;
  v_occurrences integer;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'freeze_litter_weighing_schedule_policy'
  ) <> 1 then
    raise exception 'weighing policy reversal guard overload mismatch';
  end if;

  select
    procedure.proowner,
    procedure.proacl,
    procedure.proconfig,
    procedure.prosecdef
  into v_owner, v_acl, v_config, v_security_definer
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_oid;

  if pg_catalog.pg_get_userbyid(v_owner) is distinct from 'postgres'
    or not v_security_definer
    or not coalesce('search_path=""' = any(v_config), false)
    or not coalesce('row_security=off' = any(v_config), false)
  then
    raise exception 'weighing policy reversal guard contract mismatch';
  end if;

  v_fragment := $fragment$  if old.actual_birth_date is not null and new.actual_birth_date is null then
    select
$fragment$;
  v_replacement := $replacement$  if old.actual_birth_date is not null and new.actual_birth_date is null then
    if pg_catalog.current_setting(
        'app.litter_actual_birth_plan_reversal',
        true
      ) = 'on'
    then
      new.litter_weighing_schedule_policy_snapshot := null;
      new.litter_weighing_schedule_policy_source := null;
      new.litter_weighing_schedule_policy_frozen_at := null;
      return new;
    end if;

    select
$replacement$;
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);

  if v_occurrences <> 1 then
    raise exception
      'weighing policy reversal guard fragment mismatch: %',
      v_occurrences;
  end if;

  execute replace(v_definition, v_fragment, v_replacement);

  if v_signature::oid is distinct from v_oid
    or (select proowner from pg_catalog.pg_proc where oid = v_oid)
      is distinct from v_owner
    or (select proacl from pg_catalog.pg_proc where oid = v_oid)
      is distinct from v_acl
    or (select proconfig from pg_catalog.pg_proc where oid = v_oid)
      is distinct from v_config
    or (select prosecdef from pg_catalog.pg_proc where oid = v_oid)
      is distinct from v_security_definer
  then
    raise exception 'weighing policy reversal adaptation changed contract';
  end if;
end;
$adapt_weighing_policy_guard$;

-- ---------------------------------------------------------------------------
-- 3. Private atomic reversal engine
-- ---------------------------------------------------------------------------

create or replace function public.reverse_litter_plan_after_cancelled_first_birth_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_activation_id uuid,
  p_birth_adjustment_client_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_existing public.litter_plan_actual_birth_plan_reversals%rowtype;
  v_litter public.litters%rowtype;
  v_state public.litter_plan_actual_birth_activation_states%rowtype;
  v_activation public.litter_plan_actual_birth_activations%rowtype;
  v_snapshot
    public.litter_plan_actual_birth_activation_reversal_snapshots%rowtype;
  v_source_command public.whelping_commands%rowtype;
  v_adjustment public.whelping_birth_adjustment_commands%rowtype;
  v_birth public.whelping_births%rowtype;
  v_plan public.litter_plans%rowtype;
  v_deactivation
    public.litter_plan_actual_birth_activation_deactivations%rowtype;
  v_change record;
  v_current jsonb;
  v_after jsonb;
  v_previous_revision integer;
  v_result_revision integer;
  v_reversal_id uuid := gen_random_uuid();
  v_deleted_task_count integer := 0;
  v_restored_task_count integer := 0;
  v_restored_series_count integer := 0;
  v_restored_item_count integer := 0;
  v_previous_plan_revision integer;
  v_result_plan_revision integer;
  v_result jsonb;
begin
  if p_organization_id is null
    or p_litter_id is null
    or p_activation_id is null
    or p_birth_adjustment_client_command_id is null
  then
    raise exception 'invalid first-birth plan reversal input'
      using errcode = '22023';
  end if;

  -- Exact replay is intentionally resolved before current-state checks.
  select reversal.*
  into v_existing
  from public.litter_plan_actual_birth_plan_reversals reversal
  where reversal.organization_id = p_organization_id
    and reversal.birth_adjustment_client_command_id =
      p_birth_adjustment_client_command_id;

  if found then
    if v_existing.litter_id is distinct from p_litter_id
      or v_existing.activation_id is distinct from p_activation_id
    then
      raise exception 'client_command_conflict'
        using errcode = '23514';
    end if;

    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  if exists (
    select 1
    from public.litter_plan_actual_birth_plan_reversals reversal
    where reversal.organization_id = p_organization_id
      and reversal.activation_id = p_activation_id
  ) then
    raise exception 'first-birth activation already reversed'
      using errcode = '23514';
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
  for update;

  if not found or v_litter.deleted_at is not null then
    raise exception 'first-birth plan reversal litter not found'
      using errcode = '23503';
  end if;

  perform birth.id
  from public.whelping_births birth
  join public.whelping_sessions session
    on session.organization_id = birth.organization_id
   and session.id = birth.session_id
  where session.organization_id = p_organization_id
    and session.litter_id = p_litter_id
  order by birth.id
  for update of birth;

  select state.*
  into v_state
  from public.litter_plan_actual_birth_activation_states state
  where state.organization_id = p_organization_id
    and state.litter_id = p_litter_id
  for update;

  if not found
    or v_state.current_activation_id is distinct from p_activation_id
    or v_state.last_activation_id is distinct from p_activation_id
  then
    raise exception 'first-birth activation is not current'
      using errcode = '23514';
  end if;

  select activation.*
  into v_activation
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = p_organization_id
    and activation.litter_id = p_litter_id
    and activation.id = p_activation_id
  for share;

  if not found
    or v_litter.actual_birth_date is distinct from
      v_activation.actual_birth_date
    or exists (
      select 1
      from public.litter_plan_actual_birth_activation_deactivations deactivation
      where deactivation.organization_id = p_organization_id
        and deactivation.activation_id = p_activation_id
    )
  then
    raise exception 'first-birth activation reversal invariant failed'
      using errcode = '23514';
  end if;

  select snapshot.*
  into v_snapshot
  from public.litter_plan_actual_birth_activation_reversal_snapshots snapshot
  where snapshot.organization_id = p_organization_id
    and snapshot.litter_id = p_litter_id
    and snapshot.activation_id = p_activation_id
    and snapshot.snapshot_version = 1
  for share;

  if not found then
    raise exception 'first-birth reversal snapshot missing'
      using errcode = '23514';
  end if;

  if v_snapshot.litter_plan_id is distinct from v_activation.litter_plan_id
    or not coalesce((
      select
        count(*) filter (
          where change.entity_kind = 'litter_plan_item'
        ) = v_snapshot.item_change_count
        and count(*) filter (
          where change.entity_kind = 'litter_plan_series'
        ) = v_snapshot.series_change_count
        and count(*) filter (
          where change.entity_kind = 'litter_care_task'
            and change.change_kind = 'insert'
        ) = v_snapshot.task_insert_count
        and count(*) filter (
          where change.entity_kind = 'litter_care_task'
            and change.change_kind = 'update'
        ) = v_snapshot.task_update_count
      from public.litter_plan_actual_birth_activation_reversal_changes change
      where change.organization_id = p_organization_id
        and change.snapshot_id = v_snapshot.id
    ), false)
  then
    raise exception 'first-birth reversal snapshot counters disagree'
      using errcode = '23514';
  end if;

  select command.*
  into v_source_command
  from public.whelping_commands command
  where command.organization_id = p_organization_id
    and command.litter_id = p_litter_id
    and command.client_command_id = v_activation.whelping_client_command_id
  for share;

  if not found
    or v_source_command.command_type is distinct from 'record_birth'
    or v_source_command.birth_id is null
  then
    raise exception 'first-birth activation source command invariant failed'
      using errcode = '23514';
  end if;

  select adjustment.*
  into v_adjustment
  from public.whelping_birth_adjustment_commands adjustment
  where adjustment.organization_id = p_organization_id
    and adjustment.client_command_id =
      p_birth_adjustment_client_command_id
  for update;

  if not found
    or v_adjustment.command_type is distinct from 'cancel_birth'
    or v_adjustment.litter_id is distinct from p_litter_id
    or v_adjustment.birth_id is distinct from v_source_command.birth_id
    or v_adjustment.requested_cancelled_at is null
    or v_adjustment.reason is null
    or v_adjustment.created_by is null
  then
    raise exception 'cancel-birth adjustment command invariant failed'
      using errcode = '23514';
  end if;

  select birth.*
  into v_birth
  from public.whelping_births birth
  where birth.organization_id = p_organization_id
    and birth.id = v_adjustment.birth_id
  for update;

  if not found
    or v_birth.cancelled_at is distinct from
      v_adjustment.requested_cancelled_at
    or v_birth.cancelled_by is distinct from v_adjustment.created_by
    or v_birth.cancellation_reason is distinct from v_adjustment.reason
    or to_jsonb(v_birth) is distinct from
      (v_adjustment.snapshot_after -> 'birth')
    or (v_adjustment.snapshot_after #>> '{birth,cancelled_at}')::timestamptz
      is distinct from v_adjustment.requested_cancelled_at
    or (v_adjustment.snapshot_after #>> '{birth,cancelled_by}')::uuid
      is distinct from v_adjustment.created_by
    or v_adjustment.snapshot_after #>> '{birth,cancellation_reason}'
      is distinct from v_adjustment.reason
  then
    raise exception 'cancelled source birth state invariant failed'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.whelping_births birth
    join public.whelping_sessions session
      on session.organization_id = birth.organization_id
     and session.id = birth.session_id
    where session.organization_id = p_organization_id
      and session.litter_id = p_litter_id
      and birth.cancelled_at is null
  ) then
    raise exception 'active birth remains after source cancellation'
      using errcode = '23514';
  end if;

  if v_activation.litter_plan_id is null then
    if v_snapshot.item_change_count <> 0
      or v_snapshot.series_change_count <> 0
      or v_snapshot.task_insert_count <> 0
      or v_snapshot.task_update_count <> 0
    then
      raise exception 'no-plan first-birth reversal snapshot is not empty'
        using errcode = '23514';
    end if;
  else
    select plan.*
    into v_plan
    from public.litter_plans plan
    where plan.organization_id = p_organization_id
      and plan.litter_id = p_litter_id
      and plan.id = v_activation.litter_plan_id
    for update;

    if not found
      or v_plan.status is distinct from 'active'
      or v_plan.revision is distinct from v_activation.result_plan_revision
    then
      raise exception 'first-birth reversal plan revision diverged'
        using errcode = '23514';
    end if;

    v_previous_plan_revision := v_plan.revision;
    v_result_plan_revision := v_plan.revision + 1;

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

    if exists (
      select 1
      from public.litter_plan_items item
      where item.organization_id = p_organization_id
        and item.litter_plan_id = v_plan.id
        and item.created_at > v_activation.created_at
    )
      or exists (
        select 1
        from public.litter_plan_series series
        where series.organization_id = p_organization_id
          and series.litter_plan_id = v_plan.id
          and series.created_at > v_activation.created_at
      )
      or exists (
        select 1
        from public.litter_care_tasks task
        where task.organization_id = p_organization_id
          and task.litter_id = p_litter_id
          and task.litter_plan_item_id in (
            select item.id
            from public.litter_plan_items item
            where item.organization_id = p_organization_id
              and item.litter_plan_id = v_plan.id
          )
          and task.created_at > v_activation.created_at
      )
    then
      raise exception 'post-activation planning data is not reversible'
        using errcode = '23514';
    end if;
  end if;

  -- Full-row equality and all deletion dependencies are checked before the
  -- transaction performs its first write.
  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
    order by change.sequence_no
  loop
    v_current := null;
    v_previous_revision := null;

    if v_change.entity_kind = 'litter_plan_item' then
      select to_jsonb(item), item.revision_no
      into v_current, v_previous_revision
      from public.litter_plan_items item
      where item.organization_id = p_organization_id
        and item.id = v_change.entity_id;
    elsif v_change.entity_kind = 'litter_plan_series' then
      select to_jsonb(series), series.revision_no
      into v_current, v_previous_revision
      from public.litter_plan_series series
      where series.organization_id = p_organization_id
        and series.id = v_change.entity_id;
    elsif v_change.entity_kind = 'litter_care_task' then
      select to_jsonb(task), task.revision_no
      into v_current, v_previous_revision
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.id = v_change.entity_id;
    else
      raise exception 'unsupported first-birth reversal entity kind'
        using errcode = '23514';
    end if;

    if v_current is null
      or v_current is distinct from v_change.snapshot_after
    then
      raise exception
        'first-birth reversal entity state diverged: % %',
        v_change.entity_kind,
        v_change.entity_id
        using errcode = '23514';
    end if;

    if v_change.change_kind = 'insert' then
      if v_change.entity_kind is distinct from 'litter_care_task' then
        raise exception 'only activation-created tasks can be deleted'
          using errcode = '23514';
      end if;

      if exists (
          select 1
          from public.calendar_reminders row
          where row.organization_id = p_organization_id
            and row.litter_care_task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.litter_care_task_schedule_changes row
          where row.organization_id = p_organization_id
            and row.task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.litter_care_task_schedule_commands row
          where row.organization_id = p_organization_id
            and row.task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.litter_plan_actual_birth_reconciliation_task_changes row
          where row.organization_id = p_organization_id
            and row.task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.litter_plan_ad_hoc_commands row
          where row.organization_id = p_organization_id
            and row.task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.litter_plan_series_actual_birth_reconciliation_changes row
          where row.organization_id = p_organization_id
            and row.task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.maternal_observation_commands row
          where row.organization_id = p_organization_id
            and row.litter_care_task_id = v_change.entity_id
        )
        or exists (
          select 1
          from public.maternal_observation_task_links row
          where row.organization_id = p_organization_id
            and row.litter_care_task_id = v_change.entity_id
        )
      then
        raise exception
          'activation-created task has an external dependency: %',
          v_change.entity_id
          using errcode = '23514';
      end if;
    elsif v_change.change_kind is distinct from 'update' then
      raise exception 'unsupported first-birth reversal change kind'
        using errcode = '23514';
    end if;
  end loop;

  perform pg_catalog.set_config(
    'app.litter_actual_birth_plan_reversal',
    'on',
    true
  );

  -- Delete only tasks proved to be activation insertions.
  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
      and change.entity_kind = 'litter_care_task'
      and change.change_kind = 'insert'
    order by change.sequence_no desc
  loop
    delete from public.litter_care_tasks task
    where task.organization_id = p_organization_id
      and task.id = v_change.entity_id;
    v_deleted_task_count := v_deleted_task_count + 1;
  end loop;

  -- Restore task business state while keeping identity and technical history.
  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
      and change.entity_kind = 'litter_care_task'
      and change.change_kind = 'update'
    order by change.sequence_no
  loop
    update public.litter_care_tasks task
    set
      source = v_change.snapshot_before ->> 'source',
      organization_template_id =
        (v_change.snapshot_before ->> 'organization_template_id')::uuid,
      system_template_code =
        v_change.snapshot_before ->> 'system_template_code',
      occurrence_no =
        (v_change.snapshot_before ->> 'occurrence_no')::integer,
      category = v_change.snapshot_before ->> 'category',
      target_scope = v_change.snapshot_before ->> 'target_scope',
      title = v_change.snapshot_before ->> 'title',
      description = v_change.snapshot_before ->> 'description',
      anchor_type = v_change.snapshot_before ->> 'anchor_type',
      anchor_date =
        (v_change.snapshot_before ->> 'anchor_date')::date,
      offset_days =
        (v_change.snapshot_before ->> 'offset_days')::integer,
      planned_for =
        (v_change.snapshot_before ->> 'planned_for')::date,
      status = v_change.snapshot_before ->> 'status',
      resolution_command_id =
        (v_change.snapshot_before ->> 'resolution_command_id')::uuid,
      resolved_at =
        (v_change.snapshot_before ->> 'resolved_at')::timestamptz,
      resolved_timezone_name =
        v_change.snapshot_before ->> 'resolved_timezone_name',
      resolved_by =
        (v_change.snapshot_before ->> 'resolved_by')::uuid,
      resolution_note = v_change.snapshot_before ->> 'resolution_note',
      item_kind = v_change.snapshot_before ->> 'item_kind',
      priority = v_change.snapshot_before ->> 'priority',
      suggested_for =
        (v_change.snapshot_before ->> 'suggested_for')::date,
      suggested_local_time =
        (v_change.snapshot_before ->> 'suggested_local_time')::time,
      scheduled_local_time =
        (v_change.snapshot_before ->> 'scheduled_local_time')::time,
      schedule_timezone_name =
        v_change.snapshot_before ->> 'schedule_timezone_name',
      suggested_starts_on =
        (v_change.snapshot_before ->> 'suggested_starts_on')::date,
      suggested_starts_local_time =
        (v_change.snapshot_before ->> 'suggested_starts_local_time')::time,
      suggested_ends_on =
        (v_change.snapshot_before ->> 'suggested_ends_on')::date,
      suggested_ends_local_time =
        (v_change.snapshot_before ->> 'suggested_ends_local_time')::time,
      retained_starts_on =
        (v_change.snapshot_before ->> 'retained_starts_on')::date,
      retained_starts_local_time =
        (v_change.snapshot_before ->> 'retained_starts_local_time')::time,
      retained_ends_on =
        (v_change.snapshot_before ->> 'retained_ends_on')::date,
      retained_ends_local_time =
        (v_change.snapshot_before ->> 'retained_ends_local_time')::time,
      schedule_source = v_change.snapshot_before ->> 'schedule_source',
      is_schedule_locked =
        (v_change.snapshot_before ->> 'is_schedule_locked')::boolean,
      schedule_locked_at =
        (v_change.snapshot_before ->> 'schedule_locked_at')::timestamptz,
      schedule_locked_by =
        (v_change.snapshot_before ->> 'schedule_locked_by')::uuid,
      litter_plan_item_id =
        (v_change.snapshot_before ->> 'litter_plan_item_id')::uuid,
      litter_plan_series_id =
        (v_change.snapshot_before ->> 'litter_plan_series_id')::uuid,
      recurrence_day_no =
        (v_change.snapshot_before ->> 'recurrence_day_no')::integer,
      slot_no = (v_change.snapshot_before ->> 'slot_no')::integer,
      revision_no = task.revision_no + 1,
      updated_by = v_adjustment.created_by
    where task.organization_id = p_organization_id
      and task.id = v_change.entity_id;
    v_restored_task_count := v_restored_task_count + 1;
  end loop;

  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
      and change.entity_kind = 'litter_plan_series'
      and change.change_kind = 'update'
    order by change.sequence_no
  loop
    update public.litter_plan_series series
    set
      recurrence_kind = v_change.snapshot_before ->> 'recurrence_kind',
      recurrence_interval_days =
        (v_change.snapshot_before ->> 'recurrence_interval_days')::integer,
      starts_on = (v_change.snapshot_before ->> 'starts_on')::date,
      end_kind = v_change.snapshot_before ->> 'end_kind',
      ends_on = (v_change.snapshot_before ->> 'ends_on')::date,
      recurrence_day_count =
        (v_change.snapshot_before ->> 'recurrence_day_count')::integer,
      initial_materialization_horizon_days =
        (v_change.snapshot_before
          ->> 'initial_materialization_horizon_days')::integer,
      materialized_through =
        (v_change.snapshot_before ->> 'materialized_through')::date,
      absolute_max_occurrences =
        (v_change.snapshot_before ->> 'absolute_max_occurrences')::integer,
      materialized_occurrence_count =
        (v_change.snapshot_before
          ->> 'materialized_occurrence_count')::integer,
      timezone_name = v_change.snapshot_before ->> 'timezone_name',
      state = v_change.snapshot_before ->> 'state',
      completion_reason =
        v_change.snapshot_before ->> 'completion_reason',
      revision_no = series.revision_no + 1,
      updated_by = v_adjustment.created_by
    where series.organization_id = p_organization_id
      and series.id = v_change.entity_id;
    v_restored_series_count := v_restored_series_count + 1;
  end loop;

  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
      and change.entity_kind = 'litter_plan_item'
      and change.change_kind = 'update'
    order by change.sequence_no
  loop
    update public.litter_plan_items item
    set
      anchor_resolution_source =
        v_change.snapshot_before ->> 'anchor_resolution_source',
      anchor_source_date_snapshot =
        (v_change.snapshot_before ->> 'anchor_source_date_snapshot')::date,
      anchor_adjustment_days =
        (v_change.snapshot_before ->> 'anchor_adjustment_days')::integer,
      anchor_date_snapshot =
        (v_change.snapshot_before ->> 'anchor_date_snapshot')::date,
      materialization_state =
        v_change.snapshot_before ->> 'materialization_state',
      materialized_at =
        (v_change.snapshot_before ->> 'materialized_at')::timestamptz,
      revision_no = item.revision_no + 1,
      updated_by = v_adjustment.created_by
    where item.organization_id = p_organization_id
      and item.id = v_change.entity_id;
    v_restored_item_count := v_restored_item_count + 1;
  end loop;

  if v_activation.litter_plan_id is not null then
    update public.litter_plans plan
    set
      revision = plan.revision + 1,
      updated_by = v_adjustment.created_by
    where plan.organization_id = p_organization_id
      and plan.id = v_activation.litter_plan_id;
  end if;

  update public.litters litter
  set
    actual_birth_date = null,
    updated_by = v_adjustment.created_by
  where litter.organization_id = p_organization_id
    and litter.id = p_litter_id;

  perform public.deactivate_litter_plan_actual_birth_activation_internal(
    p_organization_id,
    p_litter_id,
    p_activation_id,
    p_birth_adjustment_client_command_id
  );

  select deactivation.*
  into strict v_deactivation
  from public.litter_plan_actual_birth_activation_deactivations deactivation
  where deactivation.organization_id = p_organization_id
    and deactivation.activation_id = p_activation_id;

  perform pg_catalog.set_config(
    'app.litter_actual_birth_plan_reversal',
    'off',
    true
  );

  v_result := jsonb_build_object(
    'outcome', 'success',
    'replayed', false,
    'activationId', p_activation_id,
    'snapshotId', v_snapshot.id,
    'reversalId', v_reversal_id,
    'deactivationId', v_deactivation.id,
    'birthId', v_birth.id,
    'litterPlanId', v_activation.litter_plan_id,
    'previousActualBirthDate', v_activation.actual_birth_date,
    'resultActualBirthDate', null,
    'previousPlanRevision', v_previous_plan_revision,
    'resultPlanRevision', v_result_plan_revision,
    'deletedTaskCount', v_deleted_task_count,
    'restoredTaskCount', v_restored_task_count,
    'restoredSeriesCount', v_restored_series_count,
    'restoredItemCount', v_restored_item_count
  );

  insert into public.litter_plan_actual_birth_plan_reversals (
    id,
    organization_id,
    litter_id,
    activation_id,
    snapshot_id,
    activation_deactivation_id,
    birth_id,
    birth_adjustment_client_command_id,
    litter_plan_id,
    previous_actual_birth_date,
    result_actual_birth_date,
    previous_plan_revision,
    result_plan_revision,
    deleted_task_count,
    restored_task_count,
    restored_series_count,
    restored_item_count,
    result,
    created_by
  ) values (
    v_reversal_id,
    p_organization_id,
    p_litter_id,
    p_activation_id,
    v_snapshot.id,
    v_deactivation.id,
    v_birth.id,
    p_birth_adjustment_client_command_id,
    v_activation.litter_plan_id,
    v_activation.actual_birth_date,
    null,
    v_previous_plan_revision,
    v_result_plan_revision,
    v_deleted_task_count,
    v_restored_task_count,
    v_restored_series_count,
    v_restored_item_count,
    v_result,
    v_adjustment.created_by
  );

  for v_change in
    select change.*
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = p_organization_id
      and change.snapshot_id = v_snapshot.id
    order by change.sequence_no
  loop
    v_after := null;
    v_result_revision := null;

    if v_change.change_kind = 'update' then
      if v_change.entity_kind = 'litter_plan_item' then
        select to_jsonb(item), item.revision_no
        into strict v_after, v_result_revision
        from public.litter_plan_items item
        where item.organization_id = p_organization_id
          and item.id = v_change.entity_id;
      elsif v_change.entity_kind = 'litter_plan_series' then
        select to_jsonb(series), series.revision_no
        into strict v_after, v_result_revision
        from public.litter_plan_series series
        where series.organization_id = p_organization_id
          and series.id = v_change.entity_id;
      else
        select to_jsonb(task), task.revision_no
        into strict v_after, v_result_revision
        from public.litter_care_tasks task
        where task.organization_id = p_organization_id
          and task.id = v_change.entity_id;
      end if;
      v_previous_revision :=
        (v_change.snapshot_after ->> 'revision_no')::integer;
    else
      v_previous_revision := null;
    end if;

    insert into public.litter_plan_actual_birth_plan_reversal_changes (
      organization_id,
      litter_id,
      reversal_id,
      activation_id,
      snapshot_change_id,
      sequence_no,
      entity_kind,
      entity_id,
      reversal_action,
      snapshot_before_reversal,
      snapshot_target,
      snapshot_after_reversal,
      previous_revision_no,
      result_revision_no
    ) values (
      p_organization_id,
      p_litter_id,
      v_reversal_id,
      p_activation_id,
      v_change.id,
      v_change.sequence_no,
      v_change.entity_kind,
      v_change.entity_id,
      case
        when v_change.change_kind = 'insert' then 'delete_inserted'
        else 'restore_updated'
      end,
      v_change.snapshot_after,
      case
        when v_change.change_kind = 'insert' then v_change.snapshot_after
        else v_change.snapshot_before
      end,
      v_after,
      v_previous_revision,
      v_result_revision
    );
  end loop;

  return v_result;
end;
$function$;

alter function public.reverse_litter_plan_after_cancelled_first_birth_internal(
  uuid,
  uuid,
  uuid,
  uuid
) owner to postgres;

revoke all on function public.reverse_litter_plan_after_cancelled_first_birth_internal(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

comment on table public.litter_plan_actual_birth_plan_reversals is
  'Private append-only audit header for an atomic restoration after cancellation of the source birth of a current first-birth activation.';

comment on table public.litter_plan_actual_birth_plan_reversal_changes is
  'Private append-only per-entity audit. entity_id deliberately has no business FK so deleted activation-created tasks remain auditable.';

comment on function public.reverse_litter_plan_after_cancelled_first_birth_internal(
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Private atomic engine. It requires an already-persisted cancel_birth command in the same transaction and is intentionally not wired to the public cancellation RPC.';

commit;

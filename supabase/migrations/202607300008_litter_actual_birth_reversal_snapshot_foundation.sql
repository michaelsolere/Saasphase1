-- LITTER-ACTUAL-BIRTH-REVERSAL-SNAPSHOT-FOUNDATION-01
-- Persist exact before/after evidence for every new first-birth planning
-- activation. Historical activations are intentionally left without a
-- reconstructed snapshot.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guard the three historical contracts before adapting the private
--    activation function.
-- ---------------------------------------------------------------------------

do $contract_guard$
declare
  v_record regprocedure :=
    'public.record_whelping_birth(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure;
  v_activate regprocedure :=
    'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure;
  v_cancel regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_procedure record;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'record_whelping_birth'
  ) <> 1 then
    raise exception 'record_whelping_birth overload guard failed';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'activate_litter_plan_on_first_birth_internal'
  ) <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal overload guard failed';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'cancel_whelping_birth'
  ) <> 1 then
    raise exception 'cancel_whelping_birth overload guard failed';
  end if;

  for v_procedure in
    select
      procedure.oid,
      procedure.proname,
      pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
      procedure.prosecdef,
      procedure.proconfig,
      procedure.pronargdefaults,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments,
      pg_catalog.pg_get_function_result(procedure.oid) as result_type,
      procedure.proacl
    from pg_catalog.pg_proc procedure
    where procedure.oid in (v_record::oid, v_activate::oid, v_cancel::oid)
  loop
    if v_procedure.owner_name <> 'postgres'
      or not v_procedure.prosecdef
      or not coalesce('search_path=""' = any(v_procedure.proconfig), false)
      or not coalesce('row_security=off' = any(v_procedure.proconfig), false)
    then
      raise exception '% property guard failed', v_procedure.proname;
    end if;
  end loop;

  if (
      select procedure.pronargdefaults
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_record::oid
    ) <> 4
    or pg_catalog.pg_get_function_identity_arguments(v_record::oid) <>
      'p_session_id uuid, p_client_command_id uuid, p_occurred_at timestamp with time zone, p_sex text, p_viability text, p_initial_collar_color text, p_weight_grams integer, p_measured_at timestamp with time zone, p_note text'
    or pg_catalog.pg_get_function_result(v_record::oid) <>
      'TABLE(outcome text, birth_id uuid, event_id uuid, animal_id uuid, weight_measurement_id uuid, event_sequence_no integer, birth_order integer, replayed boolean, reason text)'
    or not pg_catalog.has_function_privilege(
      'authenticated',
      v_record::oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_record::oid, 'EXECUTE')
  then
    raise exception 'record_whelping_birth contract guard failed';
  end if;

  if (
      select procedure.pronargdefaults
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_activate::oid
    ) <> 0
    or pg_catalog.pg_get_function_identity_arguments(v_activate::oid) <>
      'p_organization_id uuid, p_litter_id uuid, p_actual_birth_date date, p_actor_id uuid, p_whelping_client_command_id uuid'
    or pg_catalog.pg_get_function_result(v_activate::oid) <> 'jsonb'
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_activate::oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_activate::oid, 'EXECUTE')
  then
    raise exception
      'activate_litter_plan_on_first_birth_internal contract guard failed';
  end if;

  if (
      select procedure.pronargdefaults
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_cancel::oid
    ) <> 0
    or pg_catalog.pg_get_function_identity_arguments(v_cancel::oid) <>
      'p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text'
    or pg_catalog.pg_get_function_result(v_cancel::oid) <>
      'TABLE(outcome text, birth_id uuid, animal_id uuid, event_id uuid, weight_measurement_id uuid, revision_no integer, event_sequence_no integer, replayed boolean, reason text)'
    or not pg_catalog.has_function_privilege(
      'authenticated',
      v_cancel::oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_cancel::oid, 'EXECUTE')
  then
    raise exception 'cancel_whelping_birth contract guard failed';
  end if;

  if exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        (select procedure.proacl
         from pg_catalog.pg_proc procedure
         where procedure.oid = v_activate::oid),
        pg_catalog.acldefault(
          'f',
          (select procedure.proowner
           from pg_catalog.pg_proc procedure
           where procedure.oid = v_activate::oid)
        )
      )
    ) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception
      'activate_litter_plan_on_first_birth_internal PUBLIC ACL guard failed';
  end if;
end;
$contract_guard$;

-- ---------------------------------------------------------------------------
-- 2. Private append-only reversal evidence
-- ---------------------------------------------------------------------------

create table public.litter_plan_actual_birth_activation_reversal_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  activation_id uuid not null,
  litter_plan_id uuid,
  snapshot_version integer not null default 1,
  item_change_count integer not null default 0,
  series_change_count integer not null default 0,
  task_insert_count integer not null default 0,
  task_update_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  constraint litter_birth_reversal_snapshots_org_id_key
    unique (organization_id, id),
  constraint litter_birth_reversal_snapshots_activation_key
    unique (organization_id, activation_id),
  constraint litter_birth_reversal_snapshots_org_lineage_key
    unique (organization_id, litter_id, activation_id, id),
  constraint litter_birth_reversal_snapshots_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters(organization_id, id) on delete restrict,
  constraint litter_birth_reversal_snapshots_activation_fk
    foreign key (organization_id, litter_id, activation_id)
    references public.litter_plan_actual_birth_activations(
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_birth_reversal_snapshots_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans(organization_id, litter_id, id)
    on delete restrict,
  constraint litter_birth_reversal_snapshots_version_check
    check (snapshot_version = 1),
  constraint litter_birth_reversal_snapshots_counts_check
    check (
      item_change_count >= 0
      and series_change_count >= 0
      and task_insert_count >= 0
      and task_update_count >= 0
    ),
  constraint litter_birth_reversal_snapshots_result_check
    check (jsonb_typeof(result) = 'object')
);

create table public.litter_plan_actual_birth_activation_reversal_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  activation_id uuid not null,
  snapshot_id uuid not null,
  sequence_no integer not null,
  entity_kind text not null,
  entity_id uuid not null,
  change_kind text not null,
  snapshot_before jsonb,
  snapshot_after jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint litter_birth_reversal_changes_org_id_key
    unique (organization_id, id),
  constraint litter_birth_reversal_changes_sequence_key
    unique (organization_id, snapshot_id, sequence_no),
  constraint litter_birth_reversal_changes_entity_key
    unique (organization_id, snapshot_id, entity_kind, entity_id),
  constraint litter_birth_reversal_changes_snapshot_fk
    foreign key (
      organization_id,
      litter_id,
      activation_id,
      snapshot_id
    )
    references public.litter_plan_actual_birth_activation_reversal_snapshots(
      organization_id,
      litter_id,
      activation_id,
      id
    )
    on delete restrict,
  constraint litter_birth_reversal_changes_activation_fk
    foreign key (organization_id, litter_id, activation_id)
    references public.litter_plan_actual_birth_activations(
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_birth_reversal_changes_sequence_check
    check (sequence_no > 0),
  constraint litter_birth_reversal_changes_entity_kind_check
    check (
      entity_kind in (
        'litter_plan_item',
        'litter_plan_series',
        'litter_care_task'
      )
    ),
  constraint litter_birth_reversal_changes_change_kind_check
    check (change_kind in ('insert', 'update')),
  constraint litter_birth_reversal_changes_snapshots_check
    check (
      jsonb_typeof(snapshot_after) = 'object'
      and (
        (
          change_kind = 'insert'
          and snapshot_before is null
        )
        or (
          change_kind = 'update'
          and jsonb_typeof(snapshot_before) = 'object'
          and snapshot_before <> snapshot_after
        )
      )
    )
);

create index litter_birth_reversal_snapshots_litter_created_idx
  on public.litter_plan_actual_birth_activation_reversal_snapshots(
    organization_id,
    litter_id,
    created_at,
    id
  );

create index litter_birth_reversal_changes_activation_sequence_idx
  on public.litter_plan_actual_birth_activation_reversal_changes(
    organization_id,
    activation_id,
    sequence_no
  );

create index litter_birth_reversal_changes_entity_history_idx
  on public.litter_plan_actual_birth_activation_reversal_changes(
    organization_id,
    entity_kind,
    entity_id,
    created_at,
    id
  );

create or replace function public.prevent_litter_birth_reversal_registry_mutation()
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

  raise exception 'litter actual-birth reversal evidence is append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_birth_reversal_snapshots_append_only
before update or delete
on public.litter_plan_actual_birth_activation_reversal_snapshots
for each row
execute function public.prevent_litter_birth_reversal_registry_mutation();

create trigger litter_birth_reversal_changes_append_only
before update or delete
on public.litter_plan_actual_birth_activation_reversal_changes
for each row
execute function public.prevent_litter_birth_reversal_registry_mutation();

alter table public.litter_plan_actual_birth_activation_reversal_snapshots
  enable row level security;

alter table public.litter_plan_actual_birth_activation_reversal_changes
  enable row level security;

revoke all on table
  public.litter_plan_actual_birth_activation_reversal_snapshots,
  public.litter_plan_actual_birth_activation_reversal_changes
from public, anon, authenticated;

revoke all on function public.prevent_litter_birth_reversal_registry_mutation()
from public, anon, authenticated;

-- entity_id deliberately has no foreign key. A later reversal engine may
-- physically delete an entity inserted by an activation while this immutable
-- evidence must continue to identify it.

-- ---------------------------------------------------------------------------
-- 3. Let the authoritative first-birth reconciliation fill a bounded gap
-- ---------------------------------------------------------------------------

do $adapt_materialization_for_first_birth$
declare
  v_signature regprocedure :=
    'public.materialize_litter_plan_series_occurrences(uuid,date,uuid,uuid,boolean)'::regprocedure;
  v_oid oid := v_signature::oid;
  v_owner oid;
  v_acl aclitem[];
  v_config text[];
  v_security_definer boolean;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_fragment text;
  v_replacement text;
  v_occurrences integer;
  v_overload_count integer;
begin
  select count(*)
  into v_overload_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'materialize_litter_plan_series_occurrences';

  if v_overload_count <> 1 then
    raise exception
      'materialize helper first-birth guard found % overloads',
      v_overload_count;
  end if;

  select
    procedure.proowner,
    procedure.proacl,
    procedure.proconfig,
    procedure.prosecdef
  into
    v_owner,
    v_acl,
    v_config,
    v_security_definer
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_oid;

  if pg_catalog.pg_get_userbyid(v_owner) is distinct from 'postgres'
    or not v_security_definer
    or not coalesce('search_path=""' = any(v_config), false)
    or not coalesce('row_security=off' = any(v_config), false)
  then
    raise exception
      'materialize helper first-birth guard found an unexpected contract';
  end if;

  v_fragment := $fragment$  v_allow_inserts :=
    (v_series.state = 'active' and not p_reconciliation_only)
    or (
      v_private_birth_reconciliation
      and v_series.state = 'completed'
      and v_series.completion_reason = 'actual_birth_reached'
      and v_series.end_kind = 'actual_birth'
    );
$fragment$;
  v_replacement := $replacement$  v_allow_inserts :=
    (v_series.state = 'active' and not p_reconciliation_only)
    or (
      p_reconciliation_only
      and pg_catalog.current_setting(
        'app.litter_actual_birth_plan_activation',
        true
      ) = 'on'
      and p_command_id is not null
      and v_series.state in ('active', 'suspended', 'completed')
      and v_series.end_kind = 'actual_birth'
    )
    or (
      v_private_birth_reconciliation
      and v_series.state = 'completed'
      and v_series.completion_reason = 'actual_birth_reached'
      and v_series.end_kind = 'actual_birth'
    );
$replacement$;
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);

  if v_occurrences <> 1 then
    raise exception
      'materialize helper first-birth insertion guard failed: %',
      v_occurrences;
  end if;

  v_definition := replace(v_definition, v_fragment, v_replacement);
  execute v_definition;

  if v_signature::oid is distinct from v_oid
    or (
      select procedure.proowner
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_owner
    or (
      select procedure.proacl
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_acl
    or (
      select procedure.proconfig
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_config
    or (
      select procedure.prosecdef
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_security_definer
  then
    raise exception
      'materialize helper first-birth replacement changed its contract';
  end if;
end;
$adapt_materialization_for_first_birth$;

revoke all on function public.materialize_litter_plan_series_occurrences(
  uuid,
  date,
  uuid,
  uuid,
  boolean
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Private exact-diff writer
-- ---------------------------------------------------------------------------

create or replace function public.capture_litter_birth_reversal_snapshot_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_activation_id uuid,
  p_litter_plan_id uuid,
  p_items_before jsonb,
  p_series_before jsonb,
  p_tasks_before jsonb,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_activation public.litter_plan_actual_birth_activations%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_items_after jsonb := '{}'::jsonb;
  v_series_after jsonb := '{}'::jsonb;
  v_tasks_after jsonb := '{}'::jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_item_change_count integer := 0;
  v_series_change_count integer := 0;
  v_task_insert_count integer := 0;
  v_task_update_count integer := 0;
  v_result jsonb;
begin
  if p_organization_id is null
    or p_litter_id is null
    or p_activation_id is null
    or p_actor_id is null
    or jsonb_typeof(p_items_before) is distinct from 'object'
    or jsonb_typeof(p_series_before) is distinct from 'object'
    or jsonb_typeof(p_tasks_before) is distinct from 'object'
  then
    raise exception 'invalid first-birth reversal snapshot input'
      using errcode = '22023';
  end if;

  select activation.*
  into strict v_activation
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = p_organization_id
    and activation.litter_id = p_litter_id
    and activation.id = p_activation_id
  for share;

  if v_activation.litter_plan_id is distinct from p_litter_plan_id
    or v_activation.created_by is distinct from p_actor_id
  then
    raise exception 'first-birth reversal activation invariant failed'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.litter_plan_actual_birth_activation_reversal_snapshots snapshot
    where snapshot.organization_id = p_organization_id
      and snapshot.activation_id = p_activation_id
  ) then
    raise exception 'first-birth reversal snapshot already exists'
      using errcode = '23505';
  end if;

  if p_litter_plan_id is null then
    if p_items_before <> '{}'::jsonb
      or p_series_before <> '{}'::jsonb
      or p_tasks_before <> '{}'::jsonb
    then
      raise exception 'no-plan first-birth reversal snapshot is not empty'
        using errcode = '23514';
    end if;
  else
    select coalesce(
      jsonb_object_agg(
        item.id::text,
        to_jsonb(item)
        order by item.id
      ),
      '{}'::jsonb
    )
    into v_items_after
    from public.litter_plan_items item
    where item.organization_id = p_organization_id
      and item.litter_plan_id = p_litter_plan_id;

    select coalesce(
      jsonb_object_agg(
        series.id::text,
        to_jsonb(series)
        order by series.id
      ),
      '{}'::jsonb
    )
    into v_series_after
    from public.litter_plan_series series
    where series.organization_id = p_organization_id
      and series.litter_plan_id = p_litter_plan_id;

    select coalesce(
      jsonb_object_agg(
        task.id::text,
        to_jsonb(task)
        order by task.id
      ),
      '{}'::jsonb
    )
    into v_tasks_after
    from public.litter_care_tasks task
    where task.organization_id = p_organization_id
      and task.litter_id = p_litter_id
      and task.litter_plan_item_id in (
        select item.id
        from public.litter_plan_items item
        where item.organization_id = p_organization_id
          and item.litter_plan_id = p_litter_plan_id
      );

    if exists (
        select 1
        from jsonb_object_keys(p_items_before) key
        where not v_items_after ? key
      )
      or exists (
        select 1
        from jsonb_object_keys(v_items_after) key
        where not p_items_before ? key
      )
    then
      raise exception 'first-birth reversal item set changed'
        using errcode = '23514';
    end if;

    if exists (
        select 1
        from jsonb_object_keys(p_series_before) key
        where not v_series_after ? key
      )
      or exists (
        select 1
        from jsonb_object_keys(v_series_after) key
        where not p_series_before ? key
      )
    then
      raise exception 'first-birth reversal series set changed'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(p_tasks_before) key
      where not v_tasks_after ? key
    ) then
      raise exception 'first-birth reversal task disappeared'
        using errcode = '23514';
    end if;
  end if;

  with item_changes as (
    select
      1 as entity_order,
      'litter_plan_item'::text as entity_kind,
      after_item.key::uuid as entity_id,
      'update'::text as change_kind,
      before_item.value as snapshot_before,
      after_item.value as snapshot_after,
      null::text as task_series_id,
      null::integer as task_occurrence_no
    from jsonb_each(v_items_after) after_item
    join jsonb_each(p_items_before) before_item
      on before_item.key = after_item.key
    where before_item.value is distinct from after_item.value
  ),
  series_changes as (
    select
      2 as entity_order,
      'litter_plan_series'::text as entity_kind,
      after_series.key::uuid as entity_id,
      'update'::text as change_kind,
      before_series.value as snapshot_before,
      after_series.value as snapshot_after,
      null::text as task_series_id,
      null::integer as task_occurrence_no
    from jsonb_each(v_series_after) after_series
    join jsonb_each(p_series_before) before_series
      on before_series.key = after_series.key
    where before_series.value is distinct from after_series.value
  ),
  task_changes as (
    select
      3 as entity_order,
      'litter_care_task'::text as entity_kind,
      after_task.key::uuid as entity_id,
      case
        when before_task.key is null then 'insert'
        else 'update'
      end::text as change_kind,
      before_task.value as snapshot_before,
      after_task.value as snapshot_after,
      after_task.value ->> 'litter_plan_series_id' as task_series_id,
      (after_task.value ->> 'occurrence_no')::integer
        as task_occurrence_no
    from jsonb_each(v_tasks_after) after_task
    left join jsonb_each(p_tasks_before) before_task
      on before_task.key = after_task.key
    where before_task.key is null
      or before_task.value is distinct from after_task.value
  ),
  raw_changes as (
    select * from item_changes
    union all
    select * from series_changes
    union all
    select * from task_changes
  ),
  ordered_changes as (
    select
      row_number() over (
        order by
          entity_order,
          task_series_id nulls first,
          task_occurrence_no nulls first,
          entity_id
      )::integer as sequence_no,
      entity_kind,
      entity_id,
      change_kind,
      snapshot_before,
      snapshot_after
    from raw_changes
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sequenceNo', sequence_no,
        'entityKind', entity_kind,
        'entityId', entity_id,
        'changeKind', change_kind,
        'snapshotBefore', snapshot_before,
        'snapshotAfter', snapshot_after
      )
      order by sequence_no
    ),
    '[]'::jsonb
  )
  into v_changes
  from ordered_changes;

  select
    count(*) filter (
      where change_entry ->> 'entityKind' = 'litter_plan_item'
    ),
    count(*) filter (
      where change_entry ->> 'entityKind' = 'litter_plan_series'
    ),
    count(*) filter (
      where change_entry ->> 'entityKind' = 'litter_care_task'
        and change_entry ->> 'changeKind' = 'insert'
    ),
    count(*) filter (
      where change_entry ->> 'entityKind' = 'litter_care_task'
        and change_entry ->> 'changeKind' = 'update'
    )
  into
    v_item_change_count,
    v_series_change_count,
    v_task_insert_count,
    v_task_update_count
  from jsonb_array_elements(v_changes) change_entry;

  v_result := jsonb_build_object(
    'outcome', 'success',
    'snapshotVersion', 1,
    'itemChangeCount', v_item_change_count,
    'seriesChangeCount', v_series_change_count,
    'taskInsertCount', v_task_insert_count,
    'taskUpdateCount', v_task_update_count,
    'activationResult', v_activation.result,
    'activationCounters', jsonb_build_object(
      'materializedItemCount', v_activation.materialized_item_count,
      'createdTaskCount', v_activation.created_task_count,
      'createdSeriesOccurrenceCount',
        v_activation.created_series_occurrence_count,
      'reconciledSeriesCount', v_activation.reconciled_series_count,
      'notApplicableOccurrenceCount',
        v_activation.not_applicable_occurrence_count
    )
  );

  insert into public.litter_plan_actual_birth_activation_reversal_snapshots (
    id,
    organization_id,
    litter_id,
    activation_id,
    litter_plan_id,
    snapshot_version,
    item_change_count,
    series_change_count,
    task_insert_count,
    task_update_count,
    result,
    created_by
  ) values (
    v_snapshot_id,
    p_organization_id,
    p_litter_id,
    p_activation_id,
    p_litter_plan_id,
    1,
    v_item_change_count,
    v_series_change_count,
    v_task_insert_count,
    v_task_update_count,
    v_result,
    p_actor_id
  );

  insert into public.litter_plan_actual_birth_activation_reversal_changes (
    organization_id,
    litter_id,
    activation_id,
    snapshot_id,
    sequence_no,
    entity_kind,
    entity_id,
    change_kind,
    snapshot_before,
    snapshot_after
  )
  select
    p_organization_id,
    p_litter_id,
    p_activation_id,
    v_snapshot_id,
    (change_entry ->> 'sequenceNo')::integer,
    change_entry ->> 'entityKind',
    (change_entry ->> 'entityId')::uuid,
    change_entry ->> 'changeKind',
    nullif(change_entry -> 'snapshotBefore', 'null'::jsonb),
    change_entry -> 'snapshotAfter'
  from jsonb_array_elements(v_changes) change_entry
  order by (change_entry ->> 'sequenceNo')::integer;

  if not coalesce((
    select
      count(*) filter (
        where change.entity_kind = 'litter_plan_item'
      ) = v_item_change_count
      and count(*) filter (
        where change.entity_kind = 'litter_plan_series'
      ) = v_series_change_count
      and count(*) filter (
        where change.entity_kind = 'litter_care_task'
          and change.change_kind = 'insert'
      ) = v_task_insert_count
      and count(*) filter (
        where change.entity_kind = 'litter_care_task'
          and change.change_kind = 'update'
      ) = v_task_update_count
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.snapshot_id = v_snapshot_id
  ), false) then
    raise exception 'first-birth reversal persisted counters disagree'
      using errcode = '23514';
  end if;

  return v_snapshot_id;
end;
$function$;

revoke all on function public.capture_litter_birth_reversal_snapshot_internal(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Inject exact pre-state capture and the atomic snapshot write into the
--    established activation function. Its signature, OID and ACL are retained.
-- ---------------------------------------------------------------------------

do $adapt_activation$
declare
  v_signature regprocedure :=
    'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure;
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
  select
    procedure.proowner,
    procedure.proacl,
    procedure.proconfig,
    procedure.prosecdef
  into
    v_owner,
    v_acl,
    v_config,
    v_security_definer
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_oid;

  v_fragment :=
    E'  v_result jsonb;\n  v_plan_changed boolean := false;\nbegin';
  v_replacement :=
    E'  v_result jsonb;\n  v_plan_changed boolean := false;\n  v_activation_id uuid;\n  v_reversal_items_before jsonb := ''{}''::jsonb;\n  v_reversal_series_before jsonb := ''{}''::jsonb;\n  v_reversal_tasks_before jsonb := ''{}''::jsonb;\nbegin';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activation reversal declaration guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment :=
    E'      p_actor_id\n    );\n\n    perform public.advance_litter_plan_actual_birth_activation_state_internal(';
  v_replacement :=
    E'      p_actor_id\n    )\n    returning id into v_activation_id;\n\n    perform public.capture_litter_birth_reversal_snapshot_internal(\n      p_organization_id,\n      p_litter_id,\n      v_activation_id,\n      null,\n      v_reversal_items_before,\n      v_reversal_series_before,\n      v_reversal_tasks_before,\n      p_actor_id\n    );\n\n    perform public.advance_litter_plan_actual_birth_activation_state_internal(';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activation reversal no-plan insert guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment :=
    E'  perform pg_catalog.set_config(\n    ''app.litter_actual_birth_plan_activation'',\n    ''on'',\n    true\n  );';
  v_replacement :=
    E'  select coalesce(\n    jsonb_object_agg(item.id::text, to_jsonb(item) order by item.id),\n    ''{}''::jsonb\n  )\n  into v_reversal_items_before\n  from public.litter_plan_items item\n  where item.organization_id = p_organization_id\n    and item.litter_plan_id = v_plan.id;\n\n  select coalesce(\n    jsonb_object_agg(series.id::text, to_jsonb(series) order by series.id),\n    ''{}''::jsonb\n  )\n  into v_reversal_series_before\n  from public.litter_plan_series series\n  where series.organization_id = p_organization_id\n    and series.litter_plan_id = v_plan.id;\n\n  select coalesce(\n    jsonb_object_agg(task.id::text, to_jsonb(task) order by task.id),\n    ''{}''::jsonb\n  )\n  into v_reversal_tasks_before\n  from public.litter_care_tasks task\n  where task.organization_id = p_organization_id\n    and task.litter_id = p_litter_id\n    and task.litter_plan_item_id in (\n      select item.id\n      from public.litter_plan_items item\n      where item.organization_id = p_organization_id\n        and item.litter_plan_id = v_plan.id\n    );\n\n  perform pg_catalog.set_config(\n    ''app.litter_actual_birth_plan_activation'',\n    ''on'',\n    true\n  );';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activation reversal pre-state capture guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment :=
    E'    p_actor_id\n  );\n\n  perform public.advance_litter_plan_actual_birth_activation_state_internal(';
  v_replacement :=
    E'    p_actor_id\n  )\n  returning id into v_activation_id;\n\n  perform public.capture_litter_birth_reversal_snapshot_internal(\n    p_organization_id,\n    p_litter_id,\n    v_activation_id,\n    v_plan.id,\n    v_reversal_items_before,\n    v_reversal_series_before,\n    v_reversal_tasks_before,\n    p_actor_id\n  );\n\n  perform public.advance_litter_plan_actual_birth_activation_state_internal(';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activation reversal plan insert guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  execute v_definition;

  if v_signature::oid is distinct from v_oid
    or (
      select procedure.proowner
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_owner
    or (
      select procedure.proacl
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_acl
    or (
      select procedure.proconfig
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_config
    or (
      select procedure.prosecdef
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_oid
    ) is distinct from v_security_definer
  then
    raise exception
      'activate_litter_plan_on_first_birth_internal replacement changed its contract';
  end if;
end;
$adapt_activation$;

revoke all on function public.activate_litter_plan_on_first_birth_internal(
  uuid,
  uuid,
  date,
  uuid,
  uuid
) from public, anon, authenticated;

comment on table
  public.litter_plan_actual_birth_activation_reversal_snapshots is
  'Private append-only versioned header for exact first-birth activation reversal evidence. Missing rows on historical activations mean legacy and not automatically reversible.';

comment on table
  public.litter_plan_actual_birth_activation_reversal_changes is
  'Private append-only full-row before/after evidence. entity_id intentionally has no business-table foreign key so evidence survives later deletion of activation-created entities.';

comment on function public.capture_litter_birth_reversal_snapshot_internal(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  uuid
) is
  'Private exact-diff writer called atomically after activation insertion and before current-state projection advancement.';

commit;

-- LITTER-ANCHOR-RECALCULATION-01
-- Recalculate active litter plan anchors after correcting gestation dates.
-- Additive only: no backfill, no automatic recalculation at deploy.

-- ---------------------------------------------------------------------------
-- 1. Shared private anchor resolution (used by apply + recalculation)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_litter_plan_anchor(
  p_anchor_type text,
  p_estimated_ovulation_date date,
  p_expected_birth_date date,
  p_mating_date date,
  p_actual_birth_date date
)
returns table (
  resolution_source text,
  source_date date,
  adjustment_days integer,
  anchor_date date
)
language plpgsql
immutable
set search_path = ''
as $fn$
begin
  -- Never uses mating_date_2.
  if p_anchor_type = 'first_mating' and p_mating_date is not null then
    resolution_source := 'first_mating';
    source_date := p_mating_date;
    adjustment_days := 0;
    anchor_date := p_mating_date;
    return next;
    return;
  end if;

  if p_anchor_type = 'estimated_ovulation' then
    if p_estimated_ovulation_date is not null then
      resolution_source := 'estimated_ovulation';
      source_date := p_estimated_ovulation_date;
      adjustment_days := 0;
      anchor_date := p_estimated_ovulation_date;
      return next;
      return;
    end if;
    if p_mating_date is not null then
      resolution_source := 'first_mating_minus_24h';
      source_date := p_mating_date;
      adjustment_days := -1;
      anchor_date := p_mating_date - 1;
      return next;
      return;
    end if;
    return;
  end if;

  if p_anchor_type = 'expected_birth' then
    if p_expected_birth_date is not null then
      resolution_source := 'expected_birth';
      source_date := p_expected_birth_date;
      adjustment_days := 0;
      anchor_date := p_expected_birth_date;
      return next;
      return;
    end if;
    if p_estimated_ovulation_date is not null then
      resolution_source := 'estimated_ovulation';
      source_date := p_estimated_ovulation_date;
      adjustment_days := 63;
      anchor_date := p_estimated_ovulation_date + 63;
      return next;
      return;
    end if;
    if p_mating_date is not null then
      resolution_source := 'first_mating';
      source_date := p_mating_date;
      adjustment_days := 62;
      anchor_date := p_mating_date + 62;
      return next;
      return;
    end if;
    return;
  end if;

  if p_anchor_type in ('actual_birth', 'offspring_age') and p_actual_birth_date is not null then
    resolution_source := 'actual_birth';
    source_date := p_actual_birth_date;
    adjustment_days := 0;
    anchor_date := p_actual_birth_date;
    return next;
    return;
  end if;

  return;
end;
$fn$;

revoke all on function public.resolve_litter_plan_anchor(text, date, date, date, date) from public;

comment on function public.resolve_litter_plan_anchor(text, date, date, date, date) is
  'Private canonical litter plan anchor resolution. Never uses mating_date_2.';


-- Ensure expected_birth fallback adjustments remain allowed (idempotent).
alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_resolution_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_resolution_check check (
    (
      materialization_state = 'pending_anchor'
      and materialized_at is null
      and anchor_resolution_source is null
      and anchor_source_date_snapshot is null
      and anchor_adjustment_days is null
      and anchor_date_snapshot is null
    )
    or (
      materialization_state = 'materialized'
      and materialized_at is not null
      and anchor_resolution_source in (
        'first_mating', 'estimated_ovulation', 'first_mating_minus_24h',
        'expected_birth', 'actual_birth'
      )
      and anchor_source_date_snapshot is not null
      and anchor_adjustment_days is not null
      and anchor_date_snapshot is not null
      and anchor_date_snapshot = anchor_source_date_snapshot + anchor_adjustment_days
      and (
        (
          anchor_type = 'estimated_ovulation'
          and anchor_resolution_source = 'first_mating_minus_24h'
          and anchor_adjustment_days = -1
        )
        or (
          anchor_type = 'expected_birth'
          and anchor_resolution_source = 'estimated_ovulation'
          and anchor_adjustment_days = 63
        )
        or (
          anchor_type = 'expected_birth'
          and anchor_resolution_source = 'first_mating'
          and anchor_adjustment_days = 62
        )
        or (
          anchor_type = 'expected_birth'
          and anchor_resolution_source = 'expected_birth'
          and anchor_adjustment_days = 0
        )
        or (
          not (
            (anchor_type = 'estimated_ovulation' and anchor_resolution_source = 'first_mating_minus_24h')
            or (
              anchor_type = 'expected_birth'
              and anchor_resolution_source in ('estimated_ovulation', 'first_mating', 'expected_birth')
            )
          )
          and anchor_adjustment_days = 0
        )
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 2. Wire apply_litter_planning_model onto shared resolver
-- ---------------------------------------------------------------------------
create or replace function public.apply_litter_planning_model(
  p_litter_id uuid,
  p_planning_model_id uuid,
  p_client_command_id uuid,
  p_expected_model_revision integer,
  p_expected_plan_revision integer,
  p_selected_model_item_ids uuid[],
  p_timezone_name text
)
returns table(outcome text, litter_plan_id uuid, revision integer, result jsonb, replayed boolean, reason text)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_litter public.litters%rowtype;
  v_model public.litter_planning_models%rowtype;
  v_plan public.litter_plans%rowtype;
  v_command public.litter_plan_application_commands%rowtype;
  v_payload jsonb;
  v_item public.litter_planning_model_items%rowtype;
  v_template public.litter_care_task_templates%rowtype;
  v_plan_item_id uuid;
  v_anchor date;
  v_source_date date;
  v_source text;
  v_adjust integer;
  v_suggested date;
  v_start date;
  v_end date;
  v_selected uuid[];
  v_next_display_order integer;
  v_materialized integer := 0;
  v_pending integer := 0;
  v_result jsonb := '[]'::jsonb;
begin
  outcome := 'error';
  litter_plan_id := null;
  revision := null;
  result := '[]'::jsonb;
  replayed := false;
  reason := null;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_planning_model_id is null
    or p_client_command_id is null
    or p_expected_model_revision is null
    or p_expected_model_revision <= 0
    or p_timezone_name is null
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone_name)
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select l.organization_id into v_org from public.litters l where l.id = p_litter_id;
  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = v_org
    and m.profile_id = v_user
    and m.status = 'active'
    and m.deleted_at is null
  for share;

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  v_payload := jsonb_build_object(
    'litterId', p_litter_id,
    'planningModelId', p_planning_model_id,
    'expectedModelRevision', p_expected_model_revision,
    'expectedPlanRevision', p_expected_plan_revision,
    'selectedModelItemIds', coalesce(to_jsonb(p_selected_model_item_ids), 'null'::jsonb),
    'timezoneName', p_timezone_name
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_plan_application_commands:' || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select * into v_command
  from public.litter_plan_application_commands c
  where c.organization_id = v_org
    and c.client_command_id = p_client_command_id
  for update;

  if found then
    if v_command.payload <> v_payload then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;
    outcome := v_command.outcome;
    litter_plan_id := v_command.litter_plan_id;
    revision := v_command.result_plan_revision;
    result := v_command.result;
    reason := v_command.reason;
    replayed := true;
    return next;
    return;
  end if;

  select * into v_litter
  from public.litters l
  where l.organization_id = v_org
    and l.id = p_litter_id
  for update;

  if not found
    or v_litter.deleted_at is not null
    or v_litter.status not in (
      'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed', 'birth_expected',
      'birth_in_progress', 'born', 'puppies_created', 'choice_period', 'ready_to_leave'
    )
  then
    insert into public.litter_plan_application_commands (
      organization_id, litter_id, planning_model_id, client_command_id, payload,
      outcome, reason, result, created_by
    ) values (
      v_org, p_litter_id, p_planning_model_id, p_client_command_id, v_payload,
      'error', 'invalid_litter', '[]', v_user
    );
    reason := 'invalid_litter';
    return next;
    return;
  end if;

  select * into v_model
  from public.litter_planning_models m
  where m.organization_id = v_org
    and m.id = p_planning_model_id
  for update;

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  if not v_model.is_active
    or v_model.revision <> p_expected_model_revision
    or (v_model.species is not null and v_model.species <> v_litter.species)
    or (
      v_model.breed is not null
      and lower(btrim(v_model.breed)) <> lower(btrim(v_litter.breed))
    )
  then
    insert into public.litter_plan_application_commands (
      organization_id, litter_id, planning_model_id, client_command_id, payload,
      outcome, reason, result, created_by
    ) values (
      v_org, p_litter_id, p_planning_model_id, p_client_command_id, v_payload,
      'error', 'stale_model', '[]', v_user
    );
    reason := 'stale_model';
    return next;
    return;
  end if;

  select array_agg(i.id order by i.display_order) into v_selected
  from public.litter_planning_model_items i
  where i.organization_id = v_org
    and i.model_id = v_model.id
    and (
      p_selected_model_item_ids is null and (i.is_required or i.is_selected_by_default)
      or p_selected_model_item_ids is not null and i.id = any (p_selected_model_item_ids)
    );

  if p_selected_model_item_ids is not null
    and (
      cardinality(p_selected_model_item_ids)
        <> cardinality(array(select distinct x from unnest(p_selected_model_item_ids) x))
      or cardinality(v_selected) <> cardinality(p_selected_model_item_ids)
      or exists (
        select 1
        from public.litter_planning_model_items i
        where i.organization_id = v_org
          and i.model_id = v_model.id
          and i.is_required
          and not i.id = any (p_selected_model_item_ids)
      )
    )
  then
    v_selected := null;
  end if;

  if coalesce(cardinality(v_selected), 0) = 0 then
    insert into public.litter_plan_application_commands (
      organization_id, litter_id, planning_model_id, client_command_id, payload,
      outcome, reason, result, created_by
    ) values (
      v_org, p_litter_id, p_planning_model_id, p_client_command_id, v_payload,
      'error', 'invalid_selection', '[]', v_user
    );
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  perform i.id
  from public.litter_planning_model_items i
  where i.id = any (v_selected)
  order by i.id
  for update;

  perform t.id
  from public.litter_care_task_templates t
  join public.litter_planning_model_items i
    on i.organization_template_id = t.id
   and i.organization_id = t.organization_id
  where i.id = any (v_selected)
  order by t.id
  for update;

  if exists (
    select 1
    from public.litter_planning_model_items i
    join public.litter_care_task_templates t
      on t.organization_id = i.organization_id
     and t.id = i.organization_template_id
    where i.id = any (v_selected)
      and (
        not t.is_active
        or t.species <> v_litter.species
        or (
          t.breed is not null
          and lower(btrim(t.breed)) <> lower(btrim(v_litter.breed))
        )
      )
  ) then
    reason := 'stale_model';
    return next;
    return;
  end if;

  select * into v_plan
  from public.litter_plans p
  where p.organization_id = v_org
    and p.litter_id = p_litter_id
    and p.status = 'active'
  for update;

  if found
    and (p_expected_plan_revision is null or p_expected_plan_revision <> v_plan.revision)
  then
    insert into public.litter_plan_application_commands (
      organization_id, litter_id, litter_plan_id, planning_model_id, client_command_id,
      payload, outcome, reason, result, result_plan_revision, created_by
    ) values (
      v_org, p_litter_id, v_plan.id, p_planning_model_id, p_client_command_id,
      v_payload, 'error', 'stale_plan', '[]', v_plan.revision, v_user
    );
    reason := 'stale_plan';
    litter_plan_id := v_plan.id;
    revision := v_plan.revision;
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.litter_plan_items pi
    where pi.organization_id = v_org
      and pi.litter_plan_id = v_plan.id
      and pi.source_planning_model_id = v_model.id
  ) then
    insert into public.litter_plan_application_commands (
      organization_id, litter_id, litter_plan_id, planning_model_id, client_command_id,
      payload, outcome, reason, result, result_plan_revision, created_by
    ) values (
      v_org, p_litter_id, v_plan.id, p_planning_model_id, p_client_command_id,
      v_payload, 'error', 'model_already_applied', '[]', v_plan.revision, v_user
    );
    reason := 'model_already_applied';
    litter_plan_id := v_plan.id;
    revision := v_plan.revision;
    return next;
    return;
  end if;

  if not found then
    insert into public.litter_plans (
      organization_id, litter_id, title, timezone_name, created_by, updated_by
    ) values (
      v_org, p_litter_id, v_litter.name, p_timezone_name, v_user, v_user
    )
    returning * into v_plan;
  else
    update public.litter_plans as lp
    set revision = lp.revision + 1,
        timezone_name = p_timezone_name,
        updated_by = v_user
    where lp.id = v_plan.id
    returning * into v_plan;
  end if;

  select coalesce(max(pi.display_order), -1) + 1
  into v_next_display_order
  from public.litter_plan_items pi
  where pi.organization_id = v_org
    and pi.litter_plan_id = v_plan.id;

  for v_item in
    select *
    from public.litter_planning_model_items i
    where i.id = any (v_selected)
    order by i.display_order
  loop
    select * into v_template
    from public.litter_care_task_templates t
    where t.organization_id = v_org
      and t.id = v_item.organization_template_id;

    v_source := null;
    v_source_date := null;
    v_adjust := null;
    v_anchor := null;

    select r.resolution_source, r.source_date, r.adjustment_days, r.anchor_date
    into v_source, v_source_date, v_adjust, v_anchor
    from public.resolve_litter_plan_anchor(
      v_item.anchor_type,
      v_litter.estimated_ovulation_date,
      v_litter.expected_birth_date,
      v_litter.mating_date,
      v_litter.actual_birth_date
    ) r;

    insert into public.litter_plan_items (
      organization_id, litter_plan_id, litter_id, source_planning_model_id,
      source_planning_model_revision, source_model_item_id, source_model_display_order,
      organization_template_id, item_kind, priority, category, target_scope, title, description,
      anchor_type, anchor_resolution_source, anchor_source_date_snapshot, anchor_adjustment_days,
      anchor_date_snapshot, point_offset_days, point_local_time, window_starts_offset_days,
      window_starts_local_time, window_ends_offset_days, window_ends_local_time,
      is_required_snapshot, is_selected_by_default_snapshot, display_order, materialization_state,
      materialized_at, created_by, updated_by
    ) values (
      v_org, v_plan.id, p_litter_id, v_model.id, v_model.revision, v_item.id, v_item.display_order,
      v_template.id, v_item.item_kind, v_item.priority, v_template.category, v_template.target_scope,
      v_template.title, v_template.description, v_item.anchor_type, v_source, v_source_date, v_adjust,
      v_anchor, v_item.point_offset_days, v_item.point_local_time, v_item.window_starts_offset_days,
      v_item.window_starts_local_time, v_item.window_ends_offset_days, v_item.window_ends_local_time,
      v_item.is_required, v_item.is_selected_by_default, v_next_display_order,
      case when v_anchor is null then 'pending_anchor' else 'materialized' end,
      case when v_anchor is null then null else now() end,
      v_user, v_user
    )
    returning id into v_plan_item_id;

    v_next_display_order := v_next_display_order + 1;

    if v_anchor is null then
      v_pending := v_pending + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'planItemId', v_plan_item_id,
        'state', 'pending_anchor'
      ));
      continue;
    end if;

    begin
      if v_item.item_kind = 'window' then
        v_start := v_anchor + v_item.window_starts_offset_days;
        v_end := v_anchor + v_item.window_ends_offset_days;
        insert into public.litter_care_tasks (
          organization_id, litter_id, litter_plan_item_id, source, organization_template_id,
          occurrence_no, category, target_scope, title, description, anchor_type, anchor_date,
          offset_days, planned_for, item_kind, priority, suggested_starts_on,
          suggested_starts_local_time, suggested_ends_on, suggested_ends_local_time,
          retained_starts_on, retained_starts_local_time, retained_ends_on, retained_ends_local_time,
          schedule_timezone_name, schedule_source, creation_command_id, created_by, updated_by
        ) values (
          v_org, p_litter_id, v_plan_item_id, 'organization_template', v_template.id, 1,
          v_template.category, v_template.target_scope, v_template.title, v_template.description,
          v_item.anchor_type, v_anchor, null, null, 'window', v_item.priority, v_start,
          v_item.window_starts_local_time, v_end, v_item.window_ends_local_time, v_start,
          v_item.window_starts_local_time, v_end, v_item.window_ends_local_time,
          v_plan.timezone_name, 'suggested', gen_random_uuid(), v_user, v_user
        );
      else
        v_suggested := v_anchor + v_item.point_offset_days;
        insert into public.litter_care_tasks (
          organization_id, litter_id, litter_plan_item_id, source, organization_template_id,
          occurrence_no, category, target_scope, title, description, anchor_type, anchor_date,
          offset_days, planned_for, item_kind, priority, suggested_for, suggested_local_time,
          scheduled_local_time, schedule_timezone_name, schedule_source, creation_command_id,
          created_by, updated_by
        ) values (
          v_org, p_litter_id, v_plan_item_id, 'organization_template', v_template.id, 1,
          v_template.category, v_template.target_scope, v_template.title, v_template.description,
          v_item.anchor_type, v_anchor, v_item.point_offset_days, v_suggested, v_item.item_kind,
          v_item.priority, v_suggested, v_item.point_local_time, v_item.point_local_time,
          v_plan.timezone_name, 'suggested', gen_random_uuid(), v_user, v_user
        );
      end if;
    exception
      when datetime_field_overflow then
        raise exception 'schedule_out_of_range' using errcode = '22008';
    end;

    v_materialized := v_materialized + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'planItemId', v_plan_item_id,
      'state', 'materialized'
    ));
  end loop;

  insert into public.litter_plan_application_commands (
    organization_id, litter_id, litter_plan_id, planning_model_id, client_command_id, payload,
    outcome, result, snapshot_count, materialized_count, pending_anchor_count,
    result_plan_revision, created_by
  ) values (
    v_org, p_litter_id, v_plan.id, v_model.id, p_client_command_id, v_payload, 'success',
    v_result, cardinality(v_selected), v_materialized, v_pending, v_plan.revision, v_user
  );

  outcome := 'success';
  litter_plan_id := v_plan.id;
  revision := v_plan.revision;
  result := v_result;
  return next;
exception
  when datetime_field_overflow then
    reason := 'schedule_out_of_range';
    raise;
end;
$$;

revoke all on function public.apply_litter_planning_model(uuid, uuid, uuid, integer, integer, uuid[], text) from public;
grant execute on function public.apply_litter_planning_model(uuid, uuid, uuid, integer, integer, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. litter_plans recalculation metadata
-- ---------------------------------------------------------------------------
alter table public.litter_plans
  add column if not exists last_recalculated_at timestamptz,
  add column if not exists last_recalculated_by uuid references public.profiles(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 4. Append-only recalculation command registry
-- ---------------------------------------------------------------------------
create table public.litter_plan_anchor_recalculation_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid,
  client_command_id uuid not null,
  payload jsonb not null,
  expected_litter_updated_at timestamptz not null,
  expected_plan_revision integer,
  previous_estimated_ovulation_date date,
  result_estimated_ovulation_date date,
  previous_expected_birth_date date,
  result_expected_birth_date date,
  outcome text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  previous_plan_revision integer,
  result_plan_revision integer,
  recalculated_item_count integer not null default 0,
  changed_task_count integer not null default 0,
  moved_automatic_schedule_count integer not null default 0,
  preserved_manual_schedule_count integer not null default 0,
  preserved_locked_schedule_count integer not null default 0,
  preserved_terminal_count integer not null default 0,
  unchanged_task_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_anchor_recalculation_commands_org_id_key
    unique (organization_id, id),
  constraint litter_plan_anchor_recalculation_commands_org_client_command_key
    unique (organization_id, client_command_id),
  constraint litter_plan_anchor_recalculation_commands_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_plan_anchor_recalculation_commands_plan_fk
    foreign key (organization_id, litter_plan_id)
    references public.litter_plans (organization_id, id) on delete restrict,
  constraint litter_plan_anchor_recalculation_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint litter_plan_anchor_recalculation_commands_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint litter_plan_anchor_recalculation_commands_outcome_check
    check (
      (
        outcome in ('updated_without_plan', 'recalculated', 'unchanged')
        and reason is null
      )
      or (
        outcome = 'error'
        and reason in (
          'stale_litter', 'stale_plan', 'anchor_unavailable',
          'client_command_conflict', 'invalid_input',
          'membership_required', 'not_found', 'not_authenticated'
        )
      )
    ),
  constraint litter_plan_anchor_recalculation_commands_counts_check
    check (
      recalculated_item_count >= 0
      and changed_task_count >= 0
      and moved_automatic_schedule_count >= 0
      and preserved_manual_schedule_count >= 0
      and preserved_locked_schedule_count >= 0
      and preserved_terminal_count >= 0
      and unchanged_task_count >= 0
    ),
  constraint litter_plan_anchor_recalculation_commands_revision_check
    check (
      (expected_plan_revision is null or expected_plan_revision > 0)
      and (previous_plan_revision is null or previous_plan_revision > 0)
      and (result_plan_revision is null or result_plan_revision > 0)
    )
);

create or replace function public.litter_plan_anchor_recalculation_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  raise exception 'litter_plan_anchor_recalculation_commands is append-only'
    using errcode = '55000';
end;
$fn$;

create trigger litter_plan_anchor_recalculation_commands_append_only
before update or delete on public.litter_plan_anchor_recalculation_commands
for each row execute function public.litter_plan_anchor_recalculation_commands_immutable();

alter table public.litter_plan_anchor_recalculation_commands enable row level security;

revoke all on table public.litter_plan_anchor_recalculation_commands from anon, authenticated;
revoke all on function public.litter_plan_anchor_recalculation_commands_immutable() from public;

-- ---------------------------------------------------------------------------
-- 5. Extend schedule history for anchor_recalculation
-- ---------------------------------------------------------------------------
alter table public.litter_care_task_schedule_commands
  drop constraint if exists litter_care_task_schedule_commands_type_check;

alter table public.litter_care_task_schedule_commands
  add constraint litter_care_task_schedule_commands_type_check
  check (command_type in (
    'reschedule_point', 'replace_locked_point',
    'reschedule_window', 'replace_locked_window',
    'lock', 'unlock', 'reapply_suggestion',
    'anchor_recalculation'
  ));

alter table public.litter_care_task_schedule_changes
  drop constraint if exists litter_care_task_schedule_changes_type_check;

alter table public.litter_care_task_schedule_changes
  add constraint litter_care_task_schedule_changes_type_check
  check (change_type in (
    'reschedule_point', 'replace_locked_point',
    'reschedule_window', 'replace_locked_window',
    'lock', 'unlock', 'reapply_suggestion',
    'anchor_recalculation'
  ));

alter table public.litter_care_task_schedule_commands
  add column if not exists anchor_recalculation_command_id uuid;

alter table public.litter_care_task_schedule_commands
  drop constraint if exists litter_care_task_schedule_commands_anchor_recalc_fk;

alter table public.litter_care_task_schedule_commands
  add constraint litter_care_task_schedule_commands_anchor_recalc_fk
  foreign key (organization_id, anchor_recalculation_command_id)
  references public.litter_plan_anchor_recalculation_commands (organization_id, id)
  on delete restrict;

create or replace function public.litter_care_task_schedule_snapshot(
  p_task public.litter_care_tasks
)
returns jsonb
language sql
stable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'itemKind', p_task.item_kind,
    'priority', p_task.priority,
    'anchorType', p_task.anchor_type,
    'anchorDate', p_task.anchor_date,
    'suggestedFor', p_task.suggested_for,
    'suggestedLocalTime', p_task.suggested_local_time,
    'plannedFor', p_task.planned_for,
    'scheduledLocalTime', p_task.scheduled_local_time,
    'timezoneName', p_task.schedule_timezone_name,
    'suggestedStartsOn', p_task.suggested_starts_on,
    'suggestedStartsLocalTime', p_task.suggested_starts_local_time,
    'suggestedEndsOn', p_task.suggested_ends_on,
    'suggestedEndsLocalTime', p_task.suggested_ends_local_time,
    'retainedStartsOn', p_task.retained_starts_on,
    'retainedStartsLocalTime', p_task.retained_starts_local_time,
    'retainedEndsOn', p_task.retained_ends_on,
    'retainedEndsLocalTime', p_task.retained_ends_local_time,
    'scheduleSource', p_task.schedule_source,
    'isScheduleLocked', p_task.is_schedule_locked,
    'scheduleLockedAt', p_task.schedule_locked_at,
    'scheduleLockedBy', p_task.schedule_locked_by,
    'status', p_task.status,
    'revisionNo', p_task.revision_no
  );
$fn$;

revoke all on function public.litter_care_task_schedule_snapshot(public.litter_care_tasks) from public;

-- ---------------------------------------------------------------------------
-- 6. Protect authenticated direct writes to gestation anchor columns
-- ---------------------------------------------------------------------------
create or replace function public.protect_litter_gestation_anchor_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  if auth.uid() is not null
    and (
      new.estimated_ovulation_date is distinct from old.estimated_ovulation_date
      or new.expected_birth_date is distinct from old.expected_birth_date
    )
    and current_setting('app.litter_plan_anchor_recalculation_rpc', true) is distinct from 'on'
    and current_setting('app.reproductive_cycle_mating_rpc', true) is distinct from 'on'
  then
    raise exception 'litter gestation anchor fields are writable only through the dedicated RPC'
      using errcode = '55000';
  end if;
  return new;
end;
$fn$;

drop trigger if exists litters_protect_gestation_anchor_fields on public.litters;
create trigger litters_protect_gestation_anchor_fields
before update on public.litters
for each row execute function public.protect_litter_gestation_anchor_fields();

revoke all on function public.protect_litter_gestation_anchor_fields() from public;

-- ---------------------------------------------------------------------------
-- 7. Public RPC
-- ---------------------------------------------------------------------------
create or replace function public.update_litter_gestation_anchors_and_recalculate_plan(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_expected_litter_updated_at timestamptz,
  p_expected_plan_revision integer,
  p_estimated_ovulation_date date,
  p_expected_birth_date date
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  litter_id uuid,
  litter_plan_id uuid,
  result_plan_revision integer,
  recalculated_item_count integer,
  changed_task_count integer,
  moved_automatic_schedule_count integer,
  preserved_manual_schedule_count integer,
  preserved_locked_schedule_count integer,
  preserved_terminal_count integer,
  unchanged_task_count integer,
  result jsonb
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_litter public.litters%rowtype;
  v_plan public.litter_plans%rowtype;
  v_command public.litter_plan_anchor_recalculation_commands%rowtype;
  v_payload jsonb;
  v_item public.litter_plan_items%rowtype;
  v_task public.litter_care_tasks%rowtype;
  v_after public.litter_care_tasks%rowtype;
  v_resolved record;
  v_command_id uuid := gen_random_uuid();
  v_schedule_command_id uuid;
  v_change_id uuid;
  v_schedule_client_command_id uuid;
  v_prev_ovulation date;
  v_prev_expected date;
  v_dates_changed boolean;
  v_plan_changed boolean := false;
  v_item_changed boolean;
  v_new_suggested date;
  v_new_start date;
  v_new_end date;
  v_cnt_items integer := 0;
  v_cnt_changed_tasks integer := 0;
  v_cnt_moved_auto integer := 0;
  v_cnt_manual integer := 0;
  v_cnt_locked integer := 0;
  v_cnt_terminal integer := 0;
  v_cnt_unchanged integer := 0;
  v_business_outcome text;
  v_result jsonb;
  v_has_plan boolean := false;
  v_history jsonb := '[]'::jsonb;
  v_hist jsonb;
  v_found boolean;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  litter_id := p_litter_id;
  litter_plan_id := null;
  result_plan_revision := null;
  recalculated_item_count := 0;
  changed_task_count := 0;
  moved_automatic_schedule_count := 0;
  preserved_manual_schedule_count := 0;
  preserved_locked_schedule_count := 0;
  preserved_terminal_count := 0;
  unchanged_task_count := 0;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next; return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_expected_litter_updated_at is null
  then
    reason := 'invalid_input';
    return next; return;
  end if;

  select l.organization_id into v_org
  from public.litters l
  where l.id = p_litter_id and l.deleted_at is null;
  if not found then
    reason := 'not_found';
    return next; return;
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = v_org
    and m.profile_id = v_user
    and m.status = 'active'
    and m.deleted_at is null
  for share;
  if not found then
    reason := 'not_found';
    return next; return;
  end if;
  if v_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next; return;
  end if;

  v_payload := jsonb_build_object(
    'litterId', p_litter_id,
    'expectedLitterUpdatedAt', p_expected_litter_updated_at,
    'expectedPlanRevision', to_jsonb(p_expected_plan_revision),
    'estimatedOvulationDate', to_jsonb(p_estimated_ovulation_date),
    'expectedBirthDate', to_jsonb(p_expected_birth_date)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_plan_anchor_recalculation_commands:' || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select * into v_command
  from public.litter_plan_anchor_recalculation_commands c
  where c.organization_id = v_org and c.client_command_id = p_client_command_id
  for update;

  if found then
    if v_command.payload is distinct from v_payload then
      reason := 'client_command_conflict';
      return next; return;
    end if;
    outcome := v_command.outcome;
    reason := v_command.reason;
    replayed := true;
    litter_id := v_command.litter_id;
    litter_plan_id := v_command.litter_plan_id;
    result_plan_revision := v_command.result_plan_revision;
    recalculated_item_count := v_command.recalculated_item_count;
    changed_task_count := v_command.changed_task_count;
    moved_automatic_schedule_count := v_command.moved_automatic_schedule_count;
    preserved_manual_schedule_count := v_command.preserved_manual_schedule_count;
    preserved_locked_schedule_count := v_command.preserved_locked_schedule_count;
    preserved_terminal_count := v_command.preserved_terminal_count;
    unchanged_task_count := v_command.unchanged_task_count;
    result := v_command.result;
    return next; return;
  end if;

  select * into v_litter
  from public.litters l
  where l.organization_id = v_org and l.id = p_litter_id and l.deleted_at is null
  for update;
  if not found then
    reason := 'not_found';
    return next; return;
  end if;

  if v_litter.updated_at is distinct from p_expected_litter_updated_at then
    insert into public.litter_plan_anchor_recalculation_commands (
      organization_id, litter_id, client_command_id, payload,
      expected_litter_updated_at, expected_plan_revision,
      previous_estimated_ovulation_date, previous_expected_birth_date,
      outcome, reason, result, created_by
    ) values (
      v_org, p_litter_id, p_client_command_id, v_payload,
      p_expected_litter_updated_at, p_expected_plan_revision,
      v_litter.estimated_ovulation_date, v_litter.expected_birth_date,
      'error', 'stale_litter', '{}'::jsonb, v_user
    );
    reason := 'stale_litter';
    return next; return;
  end if;

  select * into v_plan
  from public.litter_plans p
  where p.organization_id = v_org and p.litter_id = p_litter_id and p.status = 'active'
  for update;
  v_has_plan := found;

  if v_has_plan then
    if p_expected_plan_revision is null or p_expected_plan_revision <> v_plan.revision then
      insert into public.litter_plan_anchor_recalculation_commands (
        organization_id, litter_id, litter_plan_id, client_command_id, payload,
        expected_litter_updated_at, expected_plan_revision,
        previous_estimated_ovulation_date, previous_expected_birth_date,
        outcome, reason, result, previous_plan_revision, result_plan_revision, created_by
      ) values (
        v_org, p_litter_id, v_plan.id, p_client_command_id, v_payload,
        p_expected_litter_updated_at, p_expected_plan_revision,
        v_litter.estimated_ovulation_date, v_litter.expected_birth_date,
        'error', 'stale_plan', '{}'::jsonb, v_plan.revision, v_plan.revision, v_user
      );
      reason := 'stale_plan';
      litter_plan_id := v_plan.id;
      result_plan_revision := v_plan.revision;
      return next; return;
    end if;
  elsif p_expected_plan_revision is not null then
    reason := 'invalid_input';
    return next; return;
  end if;

  v_prev_ovulation := v_litter.estimated_ovulation_date;
  v_prev_expected := v_litter.expected_birth_date;
  v_dates_changed :=
    p_estimated_ovulation_date is distinct from v_prev_ovulation
    or p_expected_birth_date is distinct from v_prev_expected;

  if v_has_plan then
    perform pi.id from public.litter_plan_items pi
    where pi.organization_id = v_org and pi.litter_plan_id = v_plan.id
    order by pi.id for update;

    perform t.id from public.litter_care_tasks t
    where t.organization_id = v_org and t.litter_id = p_litter_id
      and t.litter_plan_item_id is not null
    order by t.id for update;

    for v_item in
      select * from public.litter_plan_items pi
      where pi.organization_id = v_org
        and pi.litter_plan_id = v_plan.id
        and pi.materialization_state = 'materialized'
        and pi.anchor_type in ('estimated_ovulation', 'expected_birth')
      order by pi.id
    loop
      select * into v_resolved
      from public.resolve_litter_plan_anchor(
        v_item.anchor_type,
        p_estimated_ovulation_date,
        p_expected_birth_date,
        v_litter.mating_date,
        v_litter.actual_birth_date
      );
      v_found := found;
      if not v_found or v_resolved.anchor_date is null then
        insert into public.litter_plan_anchor_recalculation_commands (
          organization_id, litter_id, litter_plan_id, client_command_id, payload,
          expected_litter_updated_at, expected_plan_revision,
          previous_estimated_ovulation_date, previous_expected_birth_date,
          outcome, reason, result, previous_plan_revision, result_plan_revision, created_by
        ) values (
          v_org, p_litter_id, v_plan.id, p_client_command_id, v_payload,
          p_expected_litter_updated_at, p_expected_plan_revision,
          v_prev_ovulation, v_prev_expected,
          'error', 'anchor_unavailable', jsonb_build_object('planItemId', v_item.id),
          v_plan.revision, v_plan.revision, v_user
        );
        reason := 'anchor_unavailable';
        litter_plan_id := v_plan.id;
        result_plan_revision := v_plan.revision;
        return next; return;
      end if;
    end loop;
  end if;

  perform pg_catalog.set_config('app.litter_plan_anchor_recalculation_rpc', 'on', true);
  perform pg_catalog.set_config('app.litter_care_task_schedule_rpc', 'on', true);

  if v_dates_changed then
    update public.litters
    set estimated_ovulation_date = p_estimated_ovulation_date,
        expected_birth_date = p_expected_birth_date,
        updated_by = v_user
    where organization_id = v_org and id = p_litter_id
    returning * into v_litter;
  end if;

  if not v_has_plan then
    v_business_outcome := case when v_dates_changed then 'updated_without_plan' else 'unchanged' end;
    v_result := jsonb_build_object('businessOutcome', v_business_outcome, 'datesChanged', v_dates_changed);
    insert into public.litter_plan_anchor_recalculation_commands (
      id, organization_id, litter_id, client_command_id, payload,
      expected_litter_updated_at, expected_plan_revision,
      previous_estimated_ovulation_date, result_estimated_ovulation_date,
      previous_expected_birth_date, result_expected_birth_date,
      outcome, result, created_by
    ) values (
      v_command_id, v_org, p_litter_id, p_client_command_id, v_payload,
      p_expected_litter_updated_at, p_expected_plan_revision,
      v_prev_ovulation, v_litter.estimated_ovulation_date,
      v_prev_expected, v_litter.expected_birth_date,
      v_business_outcome, v_result, v_user
    );
    outcome := v_business_outcome;
    result := v_result;
    return next; return;
  end if;

  for v_item in
    select * from public.litter_plan_items pi
    where pi.organization_id = v_org
      and pi.litter_plan_id = v_plan.id
      and pi.materialization_state = 'materialized'
      and pi.anchor_type in ('estimated_ovulation', 'expected_birth')
    order by pi.id
  loop
    select * into v_resolved
    from public.resolve_litter_plan_anchor(
      v_item.anchor_type,
      v_litter.estimated_ovulation_date,
      v_litter.expected_birth_date,
      v_litter.mating_date,
      v_litter.actual_birth_date
    );

    v_item_changed :=
      v_item.anchor_resolution_source is distinct from v_resolved.resolution_source
      or v_item.anchor_source_date_snapshot is distinct from v_resolved.source_date
      or v_item.anchor_adjustment_days is distinct from v_resolved.adjustment_days
      or v_item.anchor_date_snapshot is distinct from v_resolved.anchor_date;

    if v_item_changed then
      update public.litter_plan_items
      set anchor_resolution_source = v_resolved.resolution_source,
          anchor_source_date_snapshot = v_resolved.source_date,
          anchor_adjustment_days = v_resolved.adjustment_days,
          anchor_date_snapshot = v_resolved.anchor_date,
          revision_no = public.litter_plan_items.revision_no + 1,
          updated_by = v_user
      where id = v_item.id
      returning * into v_item;
      v_cnt_items := v_cnt_items + 1;
      v_plan_changed := true;
    end if;

    for v_task in
      select * from public.litter_care_tasks t
      where t.organization_id = v_org
        and t.litter_id = p_litter_id
        and t.litter_plan_item_id = v_item.id
      order by t.id
    loop
      v_after := null;
      if v_task.item_kind = 'window' then
        v_new_start := v_item.anchor_date_snapshot + v_item.window_starts_offset_days;
        v_new_end := v_item.anchor_date_snapshot + v_item.window_ends_offset_days;
        if v_task.status in ('done', 'cancelled', 'not_applicable')
          or v_task.schedule_source = 'manual'
          or v_task.is_schedule_locked
        then
          update public.litter_care_tasks set
            suggested_starts_on = v_new_start,
            suggested_starts_local_time = coalesce(v_item.window_starts_local_time, suggested_starts_local_time),
            suggested_ends_on = v_new_end,
            suggested_ends_local_time = coalesce(v_item.window_ends_local_time, suggested_ends_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_starts_on is distinct from v_new_start
              or suggested_ends_on is distinct from v_new_end
              or anchor_date is distinct from v_item.anchor_date_snapshot
              or suggested_starts_local_time is distinct from coalesce(v_item.window_starts_local_time, suggested_starts_local_time)
              or suggested_ends_local_time is distinct from coalesce(v_item.window_ends_local_time, suggested_ends_local_time)
            )
          returning * into v_after;
        elsif v_task.status = 'planned' and v_task.schedule_source = 'suggested' and not v_task.is_schedule_locked then
          update public.litter_care_tasks set
            suggested_starts_on = v_new_start,
            suggested_starts_local_time = coalesce(v_item.window_starts_local_time, suggested_starts_local_time),
            suggested_ends_on = v_new_end,
            suggested_ends_local_time = coalesce(v_item.window_ends_local_time, suggested_ends_local_time),
            retained_starts_on = v_new_start,
            retained_starts_local_time = coalesce(v_item.window_starts_local_time, retained_starts_local_time),
            retained_ends_on = v_new_end,
            retained_ends_local_time = coalesce(v_item.window_ends_local_time, retained_ends_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_starts_on is distinct from v_new_start
              or suggested_ends_on is distinct from v_new_end
              or retained_starts_on is distinct from v_new_start
              or retained_ends_on is distinct from v_new_end
              or anchor_date is distinct from v_item.anchor_date_snapshot
            )
          returning * into v_after;
        end if;
      else
        v_new_suggested := v_item.anchor_date_snapshot + v_item.point_offset_days;
        if v_task.status in ('done', 'cancelled', 'not_applicable')
          or v_task.schedule_source = 'manual'
          or v_task.is_schedule_locked
        then
          update public.litter_care_tasks set
            suggested_for = v_new_suggested,
            suggested_local_time = coalesce(v_item.point_local_time, suggested_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_for is distinct from v_new_suggested
              or suggested_local_time is distinct from coalesce(v_item.point_local_time, suggested_local_time)
              or anchor_date is distinct from v_item.anchor_date_snapshot
            )
          returning * into v_after;
        elsif v_task.status = 'planned' and v_task.schedule_source = 'suggested' and not v_task.is_schedule_locked then
          update public.litter_care_tasks set
            suggested_for = v_new_suggested,
            suggested_local_time = coalesce(v_item.point_local_time, suggested_local_time),
            planned_for = v_new_suggested,
            scheduled_local_time = coalesce(v_item.point_local_time, scheduled_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_for is distinct from v_new_suggested
              or planned_for is distinct from v_new_suggested
              or suggested_local_time is distinct from coalesce(v_item.point_local_time, suggested_local_time)
              or scheduled_local_time is distinct from coalesce(v_item.point_local_time, scheduled_local_time)
              or anchor_date is distinct from v_item.anchor_date_snapshot
            )
          returning * into v_after;
        end if;
      end if;

      if v_after.id is null then
        v_cnt_unchanged := v_cnt_unchanged + 1;
        continue;
      end if;

      update public.litter_care_tasks
      set revision_no = public.litter_care_tasks.revision_no + 1
      where id = v_after.id
      returning * into v_after;

      v_cnt_changed_tasks := v_cnt_changed_tasks + 1;
      v_plan_changed := true;

      if v_task.status in ('done', 'cancelled', 'not_applicable') then
        v_cnt_terminal := v_cnt_terminal + 1;
      elsif v_task.is_schedule_locked then
        v_cnt_locked := v_cnt_locked + 1;
      elsif v_task.schedule_source = 'manual' then
        v_cnt_manual := v_cnt_manual + 1;
      else
        v_cnt_moved_auto := v_cnt_moved_auto + 1;
      end if;

      v_schedule_command_id := gen_random_uuid();
      v_change_id := gen_random_uuid();
      v_schedule_client_command_id := gen_random_uuid();

      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'scheduleCommandId', v_schedule_command_id,
        'changeId', v_change_id,
        'scheduleClientCommandId', v_schedule_client_command_id,
        'taskId', v_after.id,
        'expectedRevisionNo', v_task.revision_no,
        'previousRevisionNo', v_task.revision_no,
        'resultRevisionNo', v_after.revision_no,
        'before', public.litter_care_task_schedule_snapshot(v_task),
        'after', public.litter_care_task_schedule_snapshot(v_after),
        'previousSuggestedFor', v_task.suggested_for,
        'resultSuggestedFor', v_after.suggested_for,
        'previousSuggestedLocalTime', v_task.suggested_local_time,
        'resultSuggestedLocalTime', v_after.suggested_local_time,
        'previousPlannedFor', v_task.planned_for,
        'resultPlannedFor', v_after.planned_for,
        'previousScheduledLocalTime', v_task.scheduled_local_time,
        'resultScheduledLocalTime', v_after.scheduled_local_time,
        'previousTimezoneName', v_task.schedule_timezone_name,
        'resultTimezoneName', v_after.schedule_timezone_name,
        'previousSuggestedStartsOn', v_task.suggested_starts_on,
        'resultSuggestedStartsOn', v_after.suggested_starts_on,
        'previousSuggestedStartsLocalTime', v_task.suggested_starts_local_time,
        'resultSuggestedStartsLocalTime', v_after.suggested_starts_local_time,
        'previousSuggestedEndsOn', v_task.suggested_ends_on,
        'resultSuggestedEndsOn', v_after.suggested_ends_on,
        'previousSuggestedEndsLocalTime', v_task.suggested_ends_local_time,
        'resultSuggestedEndsLocalTime', v_after.suggested_ends_local_time,
        'previousRetainedStartsOn', v_task.retained_starts_on,
        'resultRetainedStartsOn', v_after.retained_starts_on,
        'previousRetainedStartsLocalTime', v_task.retained_starts_local_time,
        'resultRetainedStartsLocalTime', v_after.retained_starts_local_time,
        'previousRetainedEndsOn', v_task.retained_ends_on,
        'resultRetainedEndsOn', v_after.retained_ends_on,
        'previousRetainedEndsLocalTime', v_task.retained_ends_local_time,
        'resultRetainedEndsLocalTime', v_after.retained_ends_local_time,
        'previousScheduleSource', v_task.schedule_source,
        'resultScheduleSource', v_after.schedule_source,
        'previousIsScheduleLocked', v_task.is_schedule_locked,
        'resultIsScheduleLocked', v_after.is_schedule_locked
      ));
    end loop;
  end loop;

  if v_plan_changed then
    update public.litter_plans
    set revision = public.litter_plans.revision + 1,
        last_recalculated_at = statement_timestamp(),
        last_recalculated_by = v_user,
        updated_by = v_user
    where id = v_plan.id
    returning * into v_plan;
  end if;

  if not v_dates_changed and not v_plan_changed then
    v_business_outcome := 'unchanged';
  else
    v_business_outcome := 'recalculated';
  end if;

  v_result := jsonb_build_object(
    'businessOutcome', v_business_outcome,
    'datesChanged', v_dates_changed,
    'planChanged', v_plan_changed,
    'recalculatedItemCount', v_cnt_items,
    'changedTaskCount', v_cnt_changed_tasks,
    'movedAutomaticScheduleCount', v_cnt_moved_auto,
    'preservedManualScheduleCount', v_cnt_manual,
    'preservedLockedScheduleCount', v_cnt_locked,
    'preservedTerminalCount', v_cnt_terminal,
    'unchangedTaskCount', v_cnt_unchanged,
    'resultPlanRevision', v_plan.revision
  );

  insert into public.litter_plan_anchor_recalculation_commands (
    id, organization_id, litter_id, litter_plan_id, client_command_id, payload,
    expected_litter_updated_at, expected_plan_revision,
    previous_estimated_ovulation_date, result_estimated_ovulation_date,
    previous_expected_birth_date, result_expected_birth_date,
    outcome, result, previous_plan_revision, result_plan_revision,
    recalculated_item_count, changed_task_count, moved_automatic_schedule_count,
    preserved_manual_schedule_count, preserved_locked_schedule_count,
    preserved_terminal_count, unchanged_task_count, created_by
  ) values (
    v_command_id, v_org, p_litter_id, v_plan.id, p_client_command_id, v_payload,
    p_expected_litter_updated_at, p_expected_plan_revision,
    v_prev_ovulation, v_litter.estimated_ovulation_date,
    v_prev_expected, v_litter.expected_birth_date,
    v_business_outcome, v_result, p_expected_plan_revision, v_plan.revision,
    v_cnt_items, v_cnt_changed_tasks, v_cnt_moved_auto,
    v_cnt_manual, v_cnt_locked, v_cnt_terminal, v_cnt_unchanged, v_user
  );

  for v_hist in select * from jsonb_array_elements(v_history)
  loop
    insert into public.litter_care_task_schedule_commands (
      id, organization_id, task_id, litter_id, client_command_id,
      command_type, payload, outcome, result, reason, created_by,
      anchor_recalculation_command_id
    ) values (
      (v_hist->>'scheduleCommandId')::uuid,
      v_org,
      (v_hist->>'taskId')::uuid,
      p_litter_id,
      (v_hist->>'scheduleClientCommandId')::uuid,
      'anchor_recalculation',
      jsonb_build_object(
        'taskId', (v_hist->>'taskId')::uuid,
        'anchorRecalculationCommandId', v_command_id,
        'expectedRevisionNo', (v_hist->>'expectedRevisionNo')::integer
      ),
      'success',
      jsonb_build_object(
        'taskId', (v_hist->>'taskId')::uuid,
        'litterId', p_litter_id,
        'revisionNo', (v_hist->>'resultRevisionNo')::integer,
        'changeId', (v_hist->>'changeId')::uuid
      ),
      null, v_user, v_command_id
    );

    insert into public.litter_care_task_schedule_changes (
      id, organization_id, task_id, litter_id, command_id, change_type,
      expected_revision_no, previous_revision_no, result_revision_no,
      previous_suggested_for, result_suggested_for,
      previous_suggested_local_time, result_suggested_local_time,
      previous_planned_for, result_planned_for,
      previous_scheduled_local_time, result_scheduled_local_time,
      previous_timezone_name, result_timezone_name,
      previous_suggested_starts_on, result_suggested_starts_on,
      previous_suggested_starts_local_time, result_suggested_starts_local_time,
      previous_suggested_ends_on, result_suggested_ends_on,
      previous_suggested_ends_local_time, result_suggested_ends_local_time,
      previous_retained_starts_on, result_retained_starts_on,
      previous_retained_starts_local_time, result_retained_starts_local_time,
      previous_retained_ends_on, result_retained_ends_on,
      previous_retained_ends_local_time, result_retained_ends_local_time,
      previous_schedule_source, result_schedule_source,
      previous_is_schedule_locked, result_is_schedule_locked,
      locked_override_confirmed, reason, before_snapshot, after_snapshot, changed_by
    ) values (
      (v_hist->>'changeId')::uuid, v_org, (v_hist->>'taskId')::uuid, p_litter_id,
      (v_hist->>'scheduleCommandId')::uuid, 'anchor_recalculation',
      (v_hist->>'expectedRevisionNo')::integer,
      (v_hist->>'previousRevisionNo')::integer,
      (v_hist->>'resultRevisionNo')::integer,
      nullif(v_hist->>'previousSuggestedFor', '')::date,
      nullif(v_hist->>'resultSuggestedFor', '')::date,
      nullif(v_hist->>'previousSuggestedLocalTime', '')::time,
      nullif(v_hist->>'resultSuggestedLocalTime', '')::time,
      nullif(v_hist->>'previousPlannedFor', '')::date,
      nullif(v_hist->>'resultPlannedFor', '')::date,
      nullif(v_hist->>'previousScheduledLocalTime', '')::time,
      nullif(v_hist->>'resultScheduledLocalTime', '')::time,
      v_hist->>'previousTimezoneName',
      v_hist->>'resultTimezoneName',
      nullif(v_hist->>'previousSuggestedStartsOn', '')::date,
      nullif(v_hist->>'resultSuggestedStartsOn', '')::date,
      nullif(v_hist->>'previousSuggestedStartsLocalTime', '')::time,
      nullif(v_hist->>'resultSuggestedStartsLocalTime', '')::time,
      nullif(v_hist->>'previousSuggestedEndsOn', '')::date,
      nullif(v_hist->>'resultSuggestedEndsOn', '')::date,
      nullif(v_hist->>'previousSuggestedEndsLocalTime', '')::time,
      nullif(v_hist->>'resultSuggestedEndsLocalTime', '')::time,
      nullif(v_hist->>'previousRetainedStartsOn', '')::date,
      nullif(v_hist->>'resultRetainedStartsOn', '')::date,
      nullif(v_hist->>'previousRetainedStartsLocalTime', '')::time,
      nullif(v_hist->>'resultRetainedStartsLocalTime', '')::time,
      nullif(v_hist->>'previousRetainedEndsOn', '')::date,
      nullif(v_hist->>'resultRetainedEndsOn', '')::date,
      nullif(v_hist->>'previousRetainedEndsLocalTime', '')::time,
      nullif(v_hist->>'resultRetainedEndsLocalTime', '')::time,
      v_hist->>'previousScheduleSource',
      v_hist->>'resultScheduleSource',
      (v_hist->>'previousIsScheduleLocked')::boolean,
      (v_hist->>'resultIsScheduleLocked')::boolean,
      false, null, v_hist->'before', v_hist->'after', v_user
    );
  end loop;

  outcome := v_business_outcome;
  litter_plan_id := v_plan.id;
  result_plan_revision := v_plan.revision;
  recalculated_item_count := v_cnt_items;
  changed_task_count := v_cnt_changed_tasks;
  moved_automatic_schedule_count := v_cnt_moved_auto;
  preserved_manual_schedule_count := v_cnt_manual;
  preserved_locked_schedule_count := v_cnt_locked;
  preserved_terminal_count := v_cnt_terminal;
  unchanged_task_count := v_cnt_unchanged;
  result := v_result;
  return next;
end;
$fn$;

revoke all on function public.update_litter_gestation_anchors_and_recalculate_plan(
  uuid, uuid, timestamptz, integer, date, date
) from public;
grant execute on function public.update_litter_gestation_anchors_and_recalculate_plan(
  uuid, uuid, timestamptz, integer, date, date
) to authenticated;

comment on function public.update_litter_gestation_anchors_and_recalculate_plan(
  uuid, uuid, timestamptz, integer, date, date
) is
  'Atomically updates litter estimated_ovulation_date / expected_birth_date and recalculates active plan anchors.';

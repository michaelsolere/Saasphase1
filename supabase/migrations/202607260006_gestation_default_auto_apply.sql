-- GESTATION-AUTO-APPLY-01: default gestation model setting + auto-apply on first mating.

-- ---------------------------------------------------------------------------
-- 1. Organization setting column (nullable, no backfill)
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column if not exists default_gestation_planning_model_id uuid;

alter table public.organization_settings
  drop constraint if exists organization_settings_default_gestation_planning_model_fk;

alter table public.organization_settings
  add constraint organization_settings_default_gestation_planning_model_fk
  foreign key (organization_id, default_gestation_planning_model_id)
  references public.litter_planning_models (organization_id, id)
  on delete restrict;

create index if not exists organization_settings_default_gestation_model_idx
  on public.organization_settings (organization_id, default_gestation_planning_model_id)
  where default_gestation_planning_model_id is not null;

comment on column public.organization_settings.default_gestation_planning_model_id is
  'Organization-owned gestation planning model copy applied automatically on first mating; null means no auto-apply.';

-- ---------------------------------------------------------------------------
-- 2. Protect direct client writes to the setting column
-- ---------------------------------------------------------------------------
create or replace function public.protect_default_gestation_planning_model_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.default_gestation_planning_model_rpc', true) is distinct from 'on'
  then
    if tg_op = 'INSERT'
      and new.default_gestation_planning_model_id is not null then
      raise exception 'default gestation planning model must be set by its dedicated command'
        using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and new.default_gestation_planning_model_id
        is distinct from old.default_gestation_planning_model_id then
      raise exception 'default gestation planning model must be set by its dedicated command'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists organization_settings_protect_default_gestation_model
  on public.organization_settings;

create trigger organization_settings_protect_default_gestation_model
before insert or update of default_gestation_planning_model_id
on public.organization_settings
for each row execute function public.protect_default_gestation_planning_model_settings();

revoke all on function public.protect_default_gestation_planning_model_settings() from public;

-- ---------------------------------------------------------------------------
-- 3. Append-only command registry for default model changes
-- ---------------------------------------------------------------------------
create table if not exists public.default_gestation_planning_model_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  requested_library_model_code text,
  requested_library_model_version integer,
  previous_planning_model_id uuid,
  new_planning_model_id uuid,
  outcome text not null,
  reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint default_gestation_planning_model_commands_org_command_key
    unique (organization_id, client_command_id),
  constraint default_gestation_planning_model_commands_payload_pair_check
    check (
      (requested_library_model_code is null and requested_library_model_version is null)
      or (
        requested_library_model_code is not null
        and requested_library_model_version is not null
        and requested_library_model_version > 0
        and char_length(requested_library_model_code) between 1 and 100
        and requested_library_model_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      )
    ),
  constraint default_gestation_planning_model_commands_outcome_check
    check (outcome in ('success', 'error'))
);

alter table public.default_gestation_planning_model_commands enable row level security;

create or replace function public.default_gestation_planning_model_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'default gestation planning model commands are private'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'default gestation planning model commands are immutable'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists default_gestation_planning_model_commands_append_only
  on public.default_gestation_planning_model_commands;

create trigger default_gestation_planning_model_commands_append_only
before update or delete on public.default_gestation_planning_model_commands
for each row execute function public.default_gestation_planning_model_commands_immutable();

revoke all on table public.default_gestation_planning_model_commands from anon, authenticated;
revoke all on function public.default_gestation_planning_model_commands_immutable() from public;

-- ---------------------------------------------------------------------------
-- 4. Append-only orchestration registry for mating + gestation plan
-- ---------------------------------------------------------------------------
create table if not exists public.reproductive_cycle_mating_gestation_plan_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cycle_id uuid not null,
  client_command_id uuid not null,
  father_id uuid not null,
  occurred_at timestamptz not null,
  timezone_name text not null,
  method text not null,
  location text,
  note text,
  litter_name text,
  estimated_ovulation_date date,
  mating_outcome text not null,
  mating_id uuid,
  litter_id uuid,
  sequence_no integer,
  mating_reason text,
  gestation_planning_outcome text,
  gestation_model_id uuid,
  gestation_model_title text,
  gestation_variant_code text,
  litter_plan_id uuid,
  litter_plan_revision integer,
  apply_client_command_id uuid,
  snapshot_count integer not null default 0,
  materialized_count integer not null default 0,
  pending_anchor_count integer not null default 0,
  payload jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint reproductive_cycle_mating_gestation_plan_commands_org_command_key
    unique (organization_id, client_command_id),
  constraint reproductive_cycle_mating_gestation_plan_commands_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.reproductive_cycles (organization_id, id) on delete restrict,
  constraint reproductive_cycle_mating_gestation_plan_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint reproductive_cycle_mating_gestation_plan_commands_counts_check
    check (
      snapshot_count >= 0
      and materialized_count >= 0
      and pending_anchor_count >= 0
    ),
  constraint reproductive_cycle_mating_gestation_plan_commands_gestation_outcome_check
    check (
      gestation_planning_outcome is null
      or gestation_planning_outcome in (
        'applied',
        'already_applied',
        'not_configured',
        'default_model_unavailable',
        'variant_conflict',
        'not_applicable'
      )
    )
);

alter table public.reproductive_cycle_mating_gestation_plan_commands enable row level security;

create or replace function public.reproductive_cycle_mating_gestation_plan_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'reproductive cycle mating gestation plan commands are private'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'reproductive cycle mating gestation plan commands are immutable'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists reproductive_cycle_mating_gestation_plan_commands_append_only
  on public.reproductive_cycle_mating_gestation_plan_commands;

create trigger reproductive_cycle_mating_gestation_plan_commands_append_only
before update or delete on public.reproductive_cycle_mating_gestation_plan_commands
for each row execute function public.reproductive_cycle_mating_gestation_plan_commands_immutable();

revoke all on table public.reproductive_cycle_mating_gestation_plan_commands from anon, authenticated;
revoke all on function public.reproductive_cycle_mating_gestation_plan_commands_immutable() from public;

-- ---------------------------------------------------------------------------
-- 5. Extend litter_plan_items resolution constraint for expected_birth fallbacks
-- ---------------------------------------------------------------------------
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
        'first_mating',
        'estimated_ovulation',
        'first_mating_minus_24h',
        'expected_birth',
        'actual_birth'
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
              and anchor_resolution_source in (
                'estimated_ovulation', 'first_mating', 'expected_birth'
              )
            )
          )
          and anchor_adjustment_days = 0
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Extend expected_birth resolution in apply_litter_planning_model
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

    if v_item.anchor_type = 'first_mating' and v_litter.mating_date is not null then
      v_source := 'first_mating';
      v_source_date := v_litter.mating_date;
      v_adjust := 0;
    elsif v_item.anchor_type = 'estimated_ovulation' and v_litter.estimated_ovulation_date is not null then
      v_source := 'estimated_ovulation';
      v_source_date := v_litter.estimated_ovulation_date;
      v_adjust := 0;
    elsif v_item.anchor_type = 'estimated_ovulation' and v_litter.mating_date is not null then
      v_source := 'first_mating_minus_24h';
      v_source_date := v_litter.mating_date;
      v_adjust := -1;
    elsif v_item.anchor_type = 'expected_birth' and v_litter.expected_birth_date is not null then
      v_source := 'expected_birth';
      v_source_date := v_litter.expected_birth_date;
      v_adjust := 0;
    elsif v_item.anchor_type = 'expected_birth' and v_litter.estimated_ovulation_date is not null then
      v_source := 'estimated_ovulation';
      v_source_date := v_litter.estimated_ovulation_date;
      v_adjust := 63;
    elsif v_item.anchor_type = 'expected_birth' and v_litter.mating_date is not null then
      v_source := 'first_mating';
      v_source_date := v_litter.mating_date;
      v_adjust := 62;
    elsif v_item.anchor_type in ('actual_birth', 'offspring_age') and v_litter.actual_birth_date is not null then
      v_source := 'actual_birth';
      v_source_date := v_litter.actual_birth_date;
      v_adjust := 0;
    end if;

    if v_source_date is not null then
      v_anchor := v_source_date + v_adjust;
    end if;

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
-- 7. Private helper: ensure one library planning model is imported/reactivated
-- ---------------------------------------------------------------------------
create or replace function public.ensure_organization_litter_planning_library_model(
  p_organization_id uuid,
  p_library_model_code text,
  p_library_model_version integer,
  p_user_id uuid,
  p_reactivate boolean
)
returns table (
  outcome text,
  organization_model_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_library_model public.litter_planning_model_library_models%rowtype;
  v_library_template public.litter_care_task_library_templates%rowtype;
  v_library_item public.litter_planning_model_library_items%rowtype;
  v_organization_model_id uuid;
  v_organization_template_id uuid;
  v_elementary_key text;
  v_elementary_map jsonb := '{}'::jsonb;
  v_distinct_elementary_count integer;
  v_available_elementary_count integer;
  v_model_active boolean;
begin
  outcome := 'error';
  organization_model_id := null;
  reason := null;

  if p_organization_id is null
    or p_library_model_code is null
    or p_library_model_version is null
    or p_library_model_version <= 0
    or p_user_id is null
    or p_reactivate is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select library_model.*
  into v_library_model
  from public.litter_planning_model_library_models library_model
  where library_model.code = p_library_model_code
    and library_model.version = p_library_model_version
  for share;

  if not found
    or not v_library_model.is_available
    or v_library_model.family_code <> 'dog-gestation'
    or v_library_model.code not in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
  then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_distinct_elementary_count
  from public.litter_planning_model_library_items library_item
  where library_item.library_model_code = v_library_model.code
    and library_item.library_model_version = v_library_model.version;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_available_elementary_count
  from public.litter_planning_model_library_items library_item
  join public.litter_care_task_library_templates library_template
    on library_template.code = library_item.library_template_code
   and library_template.version = library_item.library_template_version
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  where library_item.library_model_code = v_library_model.code
    and library_item.library_model_version = v_library_model.version
    and library_template.is_available
    and pack.is_available;

  if v_available_elementary_count <> v_distinct_elementary_count
    or v_distinct_elementary_count = 0
  then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  for v_library_template in
    select distinct library_template.*
    from public.litter_planning_model_library_items library_item
    join public.litter_care_task_library_templates library_template
      on library_template.code = library_item.library_template_code
     and library_template.version = library_item.library_template_version
    where library_item.library_model_code = v_library_model.code
      and library_item.library_model_version = v_library_model.version
    order by library_template.code, library_template.version
  loop
    v_elementary_key := v_library_template.code || ':' || v_library_template.version::text;

    select organization_template.id, organization_template.is_active
    into v_organization_template_id, v_model_active
    from public.litter_care_task_templates organization_template
    where organization_template.organization_id = p_organization_id
      and organization_template.library_template_code = v_library_template.code
      and organization_template.library_template_version = v_library_template.version
    for update;

    if found then
      if p_reactivate and not v_model_active then
        update public.litter_care_task_templates
        set is_active = true,
            updated_at = now(),
            updated_by = p_user_id
        where organization_id = p_organization_id
          and id = v_organization_template_id;
      end if;
    else
      insert into public.litter_care_task_templates (
        organization_id, title, description, category, target_scope, anchor_type,
        offset_days, species, breed, is_active, sort_order, revision,
        library_template_code, library_template_version, created_by, updated_by
      ) values (
        p_organization_id, v_library_template.title, v_library_template.description,
        v_library_template.category, v_library_template.target_scope,
        v_library_template.anchor_type, v_library_template.offset_days,
        v_library_template.species, v_library_template.breed, true,
        v_library_template.sort_order, 1, v_library_template.code,
        v_library_template.version, p_user_id, p_user_id
      )
      returning litter_care_task_templates.id into v_organization_template_id;
    end if;

    v_elementary_map := v_elementary_map || jsonb_build_object(
      v_elementary_key,
      v_organization_template_id::text
    );
  end loop;

  select organization_model.id, organization_model.is_active
  into v_organization_model_id, v_model_active
  from public.litter_planning_models organization_model
  where organization_model.organization_id = p_organization_id
    and organization_model.library_model_code = v_library_model.code
    and organization_model.library_model_version = v_library_model.version
  for update;

  if found then
    if p_reactivate and not v_model_active then
      update public.litter_planning_models
      set is_active = true,
          updated_at = now(),
          updated_by = p_user_id
      where organization_id = p_organization_id
        and id = v_organization_model_id;
    end if;
  else
    insert into public.litter_planning_models (
      organization_id, title, description, species, breed, is_active, revision,
      library_model_code, library_model_version, created_by, updated_by
    ) values (
      p_organization_id, v_library_model.title, v_library_model.description,
      v_library_model.species, v_library_model.breed, true, 1,
      v_library_model.code, v_library_model.version, p_user_id, p_user_id
    )
    returning litter_planning_models.id into v_organization_model_id;

    for v_library_item in
      select library_item.*
      from public.litter_planning_model_library_items library_item
      where library_item.library_model_code = v_library_model.code
        and library_item.library_model_version = v_library_model.version
      order by library_item.display_order
    loop
      v_elementary_key := v_library_item.library_template_code
        || ':' || v_library_item.library_template_version::text;

      insert into public.litter_planning_model_items (
        organization_id, model_id, organization_template_id, item_kind, priority,
        anchor_type, point_offset_days, point_local_time, window_starts_offset_days,
        window_starts_local_time, window_ends_offset_days, window_ends_local_time,
        display_order, is_required, is_selected_by_default, created_by, updated_by
      ) values (
        p_organization_id, v_organization_model_id,
        (v_elementary_map ->> v_elementary_key)::uuid,
        v_library_item.item_kind, v_library_item.priority, v_library_item.anchor_type,
        v_library_item.point_offset_days, v_library_item.point_local_time,
        v_library_item.window_starts_offset_days, v_library_item.window_starts_local_time,
        v_library_item.window_ends_offset_days, v_library_item.window_ends_local_time,
        v_library_item.display_order, v_library_item.is_required,
        v_library_item.is_selected_by_default, p_user_id, p_user_id
      );
    end loop;
  end if;

  -- Final readiness: active model + active elementary templates from origin.
  if exists (
    select 1
    from public.litter_planning_models m
    where m.organization_id = p_organization_id
      and m.id = v_organization_model_id
      and not m.is_active
  )
  or exists (
    select 1
    from public.litter_planning_model_items i
    join public.litter_care_task_templates t
      on t.organization_id = i.organization_id
     and t.id = i.organization_template_id
    where i.organization_id = p_organization_id
      and i.model_id = v_organization_model_id
      and not t.is_active
  ) then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  outcome := 'success';
  organization_model_id := v_organization_model_id;
  return next;
end;
$$;

revoke all on function public.ensure_organization_litter_planning_library_model(
  uuid, text, integer, uuid, boolean
) from public;

-- ---------------------------------------------------------------------------
-- 8. RPC: set_default_gestation_planning_model
-- ---------------------------------------------------------------------------
create or replace function public.set_default_gestation_planning_model(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_library_model_code text default null,
  p_library_model_version integer default null
)
returns table (
  outcome text,
  organization_model_id uuid,
  library_model_code text,
  library_model_version integer,
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
  v_role text;
  v_command public.default_gestation_planning_model_commands%rowtype;
  v_settings public.organization_settings%rowtype;
  v_previous_model_id uuid;
  v_new_model_id uuid;
  v_ensure_outcome text;
  v_ensure_reason text;
  v_library public.litter_planning_model_library_models%rowtype;
begin
  outcome := 'error';
  organization_model_id := null;
  library_model_code := p_library_model_code;
  library_model_version := p_library_model_version;
  replayed := false;
  reason := null;

  perform pg_catalog.set_config('statement_timeout', '120s', true);
  perform pg_catalog.set_config('lock_timeout', '30s', true);

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_organization_id is null or p_client_command_id is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if (p_library_model_code is null) <> (p_library_model_version is null) then
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  if p_library_model_code is not null then
    if p_library_model_version is null
      or p_library_model_version <= 0
      or char_length(p_library_model_code) not between 1 and 100
      or p_library_model_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or p_library_model_code not in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
    then
      reason := 'invalid_selection';
      return next;
      return;
    end if;
  end if;

  perform 1
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.deleted_at is null;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  select membership.role into v_role
  from public.memberships membership
  where membership.organization_id = p_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  if v_role not in ('owner', 'admin') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'default_gestation_planning_model_commands:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.* into v_command
  from public.default_gestation_planning_model_commands command
  where command.organization_id = p_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_command.requested_library_model_code is distinct from p_library_model_code
      or v_command.requested_library_model_version is distinct from p_library_model_version
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := v_command.outcome;
    organization_model_id := v_command.new_planning_model_id;
    library_model_code := v_command.requested_library_model_code;
    library_model_version := v_command.requested_library_model_version;
    reason := v_command.reason;
    replayed := true;
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'default_gestation_planning_model:' || p_organization_id::text,
      0
    )
  );

  select settings.* into v_settings
  from public.organization_settings settings
  where settings.organization_id = p_organization_id
    and settings.deleted_at is null
  for update;

  if not found then
    reason := 'organization_settings_not_found';
    insert into public.default_gestation_planning_model_commands (
      organization_id, client_command_id, requested_library_model_code,
      requested_library_model_version, previous_planning_model_id, new_planning_model_id,
      outcome, reason, created_by
    ) values (
      p_organization_id, p_client_command_id, p_library_model_code, p_library_model_version,
      null, null, 'error', reason, v_user_id
    );
    return next;
    return;
  end if;

  v_previous_model_id := v_settings.default_gestation_planning_model_id;

  if p_library_model_code is null then
    v_new_model_id := null;
  else
    select library_model.* into v_library
    from public.litter_planning_model_library_models library_model
    where library_model.code = p_library_model_code
      and library_model.version = p_library_model_version
    for share;

    if not found
      or not v_library.is_available
      or v_library.family_code <> 'dog-gestation'
    then
      reason := 'selection_unavailable';
      insert into public.default_gestation_planning_model_commands (
        organization_id, client_command_id, requested_library_model_code,
        requested_library_model_version, previous_planning_model_id, new_planning_model_id,
        outcome, reason, created_by
      ) values (
        p_organization_id, p_client_command_id, p_library_model_code, p_library_model_version,
        v_previous_model_id, null, 'error', reason, v_user_id
      );
      return next;
      return;
    end if;

    select ensure.outcome, ensure.organization_model_id, ensure.reason
    into v_ensure_outcome, v_new_model_id, v_ensure_reason
    from public.ensure_organization_litter_planning_library_model(
      p_organization_id,
      p_library_model_code,
      p_library_model_version,
      v_user_id,
      true
    ) ensure;

    if v_ensure_outcome <> 'success' or v_new_model_id is null then
      reason := coalesce(v_ensure_reason, 'selection_unavailable');
      insert into public.default_gestation_planning_model_commands (
        organization_id, client_command_id, requested_library_model_code,
        requested_library_model_version, previous_planning_model_id, new_planning_model_id,
        outcome, reason, created_by
      ) values (
        p_organization_id, p_client_command_id, p_library_model_code, p_library_model_version,
        v_previous_model_id, null, 'error', reason, v_user_id
      );
      return next;
      return;
    end if;
  end if;

  perform pg_catalog.set_config('app.default_gestation_planning_model_rpc', 'on', true);

  update public.organization_settings
  set default_gestation_planning_model_id = v_new_model_id,
      updated_at = now(),
      updated_by = v_user_id
  where organization_id = p_organization_id
    and id = v_settings.id;

  insert into public.default_gestation_planning_model_commands (
    organization_id, client_command_id, requested_library_model_code,
    requested_library_model_version, previous_planning_model_id, new_planning_model_id,
    outcome, reason, created_by
  ) values (
    p_organization_id, p_client_command_id, p_library_model_code, p_library_model_version,
    v_previous_model_id, v_new_model_id, 'success', null, v_user_id
  );

  outcome := 'success';
  organization_model_id := v_new_model_id;
  return next;
end;
$$;

revoke all on function public.set_default_gestation_planning_model(uuid, uuid, text, integer) from public;
grant execute on function public.set_default_gestation_planning_model(uuid, uuid, text, integer) to authenticated;

comment on function public.set_default_gestation_planning_model(uuid, uuid, text, integer) is
  'Owner/admin command to choose or clear the organization default dog-gestation planning model.';

-- ---------------------------------------------------------------------------
-- 9. Private mating helper (old public RPC becomes non-executable by clients)
-- ---------------------------------------------------------------------------
drop function if exists public.record_reproductive_cycle_mating(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text
);

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
  v_cycle_organization_id uuid;
  v_membership_role text;
  v_cycle public.reproductive_cycles%rowtype;
  v_mother public.animals%rowtype;
  v_father public.animals%rowtype;
  v_litter public.litters%rowtype;
  v_existing_mating public.reproductive_cycle_matings%rowtype;
  v_sequence_no integer;
  v_litter_name text;
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

  select cycle.organization_id
  into v_cycle_organization_id
  from public.reproductive_cycles cycle
  where cycle.id = p_cycle_id;

  if not found then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_cycle_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  select *
  into v_cycle
  from public.reproductive_cycles cycle
  where cycle.id = p_cycle_id
    and cycle.organization_id = v_cycle_organization_id
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
    if v_existing_mating.cycle_id <> v_cycle.id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    select *
    into v_litter
    from public.litters litter
    where litter.organization_id = v_cycle.organization_id
      and litter.id = v_cycle.litter_id;

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
    v_litter_name := nullif(btrim(p_litter_name), '');

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
    nullif(btrim(p_location), ''),
    nullif(btrim(p_note), ''),
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
) from public;

comment on function public.record_reproductive_cycle_mating_core(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) is
  'Private helper that records a reproductive cycle mating. Not executable by authenticated clients.';

-- ---------------------------------------------------------------------------
-- 10. Public orchestrator: mating + automatic gestation plan on first mating
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

  select cycle.organization_id into v_org
  from public.reproductive_cycles cycle
  where cycle.id = p_cycle_id;

  if not found then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

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
    -- Unexpected technical/business failure: abort the whole mating transaction.
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

comment on function public.record_reproductive_cycle_mating_with_gestation_plan(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date
) is
  'Records a mating and atomically auto-applies the organization default dog-gestation plan on first mating.';

-- Compatibility stub: old RPC name is no longer executable by clients.
create or replace function public.record_reproductive_cycle_mating(
  p_cycle_id uuid,
  p_client_command_id uuid,
  p_father_id uuid,
  p_occurred_at timestamptz,
  p_timezone_name text,
  p_method text,
  p_location text default null,
  p_note text default null,
  p_litter_name text default null
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
begin
  raise exception 'record_reproductive_cycle_mating is retired; use record_reproductive_cycle_mating_with_gestation_plan'
    using errcode = '42501';
end;
$$;

revoke all on function public.record_reproductive_cycle_mating(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text
) from public;

comment on function public.record_reproductive_cycle_mating(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text
) is
  'Retired public mating RPC. Clients must call record_reproductive_cycle_mating_with_gestation_plan.';

comment on table public.default_gestation_planning_model_commands is
  'Append-only private registry of default gestation planning model setting changes.';

comment on table public.reproductive_cycle_mating_gestation_plan_commands is
  'Append-only private registry of mating recordings orchestrated with gestation auto-apply.';

comment on column public.reproductive_cycles.litter_id is
  'Linked exactly once by record_reproductive_cycle_mating_core when the first mating is recorded.';

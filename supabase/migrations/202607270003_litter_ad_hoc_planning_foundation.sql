-- LITTER-AD-HOC-PLANNING-01
-- Direct ad-hoc programming into a litter plan (foundation: schema + RPC).
-- Additive: no fake models/templates; snapshots may originate from planning_model or ad_hoc.

-- ---------------------------------------------------------------------------
-- 1. origin_kind on litter_plan_items
-- ---------------------------------------------------------------------------
alter table public.litter_plan_items
  add column if not exists origin_kind text;

update public.litter_plan_items
set origin_kind = 'planning_model'
where origin_kind is null;

alter table public.litter_plan_items
  alter column origin_kind set default 'planning_model';

alter table public.litter_plan_items
  alter column origin_kind set not null;

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_origin_kind_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_origin_kind_check
  check (origin_kind in ('planning_model', 'ad_hoc'));

comment on column public.litter_plan_items.origin_kind is
  'Snapshot provenance: planning_model (from a reusable model) or ad_hoc (direct litter programming).';

-- ---------------------------------------------------------------------------
-- 2. Relax source / anchor nullability; conditional invariants by origin
-- ---------------------------------------------------------------------------
alter table public.litter_plan_items
  alter column source_planning_model_id drop not null,
  alter column source_planning_model_revision drop not null,
  alter column source_model_item_id drop not null,
  alter column source_model_display_order drop not null,
  alter column organization_template_id drop not null,
  alter column anchor_type drop not null;

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_origin_source_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_origin_source_check check (
    (
      origin_kind = 'planning_model'
      and source_planning_model_id is not null
      and source_planning_model_revision is not null
      and source_planning_model_revision > 0
      and source_model_item_id is not null
      and source_model_display_order is not null
      and source_model_display_order >= 0
      and organization_template_id is not null
      and anchor_type is not null
    )
    or (
      origin_kind = 'ad_hoc'
      and source_planning_model_id is null
      and source_planning_model_revision is null
      and source_model_item_id is null
      and source_model_display_order is null
      and organization_template_id is null
      and anchor_type is null
    )
  );

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_anchor_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_anchor_check check (
    anchor_type is null
    or anchor_type in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth', 'offspring_age'
    )
  );

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_order_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_order_check check (
    display_order >= 0
    and revision_no > 0
  );

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
      and origin_kind = 'planning_model'
    )
    or (
      materialization_state = 'materialized'
      and materialized_at is not null
      and anchor_resolution_source = 'manual_absolute'
      and origin_kind = 'ad_hoc'
      and anchor_type is null
      and anchor_source_date_snapshot is not null
      and anchor_adjustment_days = 0
      and anchor_date_snapshot is not null
      and anchor_date_snapshot = anchor_source_date_snapshot
    )
    or (
      materialization_state = 'materialized'
      and materialized_at is not null
      and origin_kind = 'planning_model'
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

-- Partial unique identity: model-sourced snapshots only
drop index if exists public.litter_plan_items_source_identity_key;
create unique index litter_plan_items_source_identity_key
  on public.litter_plan_items (
    organization_id,
    litter_plan_id,
    source_planning_model_id,
    source_model_item_id
  )
  where origin_kind = 'planning_model';

-- ---------------------------------------------------------------------------
-- 3. litter_care_tasks: allow plan-linked manual (ad_hoc) rows
-- ---------------------------------------------------------------------------
alter table public.litter_care_tasks
  drop constraint if exists litter_care_tasks_source_values_check;

alter table public.litter_care_tasks
  add constraint litter_care_tasks_source_values_check check (
    (
      litter_plan_item_id is not null
      and source = 'organization_template'
      and organization_template_id is not null
      and system_template_code is null
      and anchor_type is not null
      and anchor_date is not null
      and (
        (item_kind in ('milestone', 'task') and offset_days is not null)
        or (item_kind = 'window' and offset_days is null)
        or (item_kind = 'recurring_task' and offset_days is not null)
      )
    )
    or (
      litter_plan_item_id is not null
      and source = 'manual'
      and organization_template_id is null
      and system_template_code is null
      and anchor_type is null
      and anchor_date is null
      and offset_days is null
      and (
        item_kind in ('milestone', 'task', 'window', 'recurring_task')
      )
    )
    or (
      litter_plan_item_id is null
      and (
        (
          source = 'manual'
          and organization_template_id is null
          and system_template_code is null
          and anchor_type is null
          and anchor_date is null
          and offset_days is null
        )
        or (
          source = 'organization_template'
          and organization_template_id is not null
          and system_template_code is null
          and anchor_type is not null
          and anchor_date is not null
          and offset_days is not null
        )
        or (
          source = 'system_template'
          and organization_template_id is null
          and system_template_code is not null
          and anchor_type is not null
          and anchor_date is not null
          and offset_days is not null
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Append-only command registry
-- ---------------------------------------------------------------------------
create table if not exists public.litter_plan_ad_hoc_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid,
  litter_plan_item_id uuid,
  task_id uuid,
  series_id uuid,
  client_command_id uuid not null,
  payload jsonb not null,
  outcome text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  result_plan_revision integer,
  materialized_occurrence_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_org_id_key
    unique (organization_id, id),
  constraint litter_plan_ad_hoc_commands_org_client_key
    unique (organization_id, client_command_id),
  constraint litter_plan_ad_hoc_commands_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_plan_fk
    foreign key (organization_id, litter_plan_id)
    references public.litter_plans (organization_id, id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_item_fk
    foreign key (organization_id, litter_plan_item_id)
    references public.litter_plan_items (organization_id, id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_task_fk
    foreign key (organization_id, task_id)
    references public.litter_care_tasks (organization_id, id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_series_fk
    foreign key (organization_id, series_id)
    references public.litter_plan_series (organization_id, id) on delete restrict,
  constraint litter_plan_ad_hoc_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint litter_plan_ad_hoc_commands_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint litter_plan_ad_hoc_commands_outcome_check
    check (outcome in ('success', 'error')),
  constraint litter_plan_ad_hoc_commands_counts_check
    check (materialized_occurrence_count >= 0),
  constraint litter_plan_ad_hoc_commands_revision_check
    check (result_plan_revision is null or result_plan_revision > 0)
);

comment on table public.litter_plan_ad_hoc_commands is
  'Append-only registry for direct ad-hoc litter plan programming commands.';

create or replace function public.litter_plan_ad_hoc_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  raise exception 'litter_plan_ad_hoc_commands is append-only'
    using errcode = '55000';
end;
$fn$;

drop trigger if exists litter_plan_ad_hoc_commands_append_only on public.litter_plan_ad_hoc_commands;
create trigger litter_plan_ad_hoc_commands_append_only
  before update or delete on public.litter_plan_ad_hoc_commands
  for each row execute function public.litter_plan_ad_hoc_commands_immutable();

alter table public.litter_plan_ad_hoc_commands enable row level security;

revoke all on table public.litter_plan_ad_hoc_commands from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Patch materialize for ad_hoc series occurrences
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 6. Patch materialize for ad_hoc series occurrences
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_litter_plan_series_occurrences(p_series_id uuid, p_requested_through date, p_actor uuid, p_command_id uuid DEFAULT NULL::uuid, p_reconciliation_only boolean DEFAULT false)
 RETURNS TABLE(inserted_count integer, skipped_identical_count integer, result_materialized_through date, result_materialized_occurrence_count integer, series_completed boolean, completion_reason text, data_changed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_series public.litter_plan_series%rowtype;
  v_item public.litter_plan_items%rowtype;
  v_litter public.litters%rowtype;
  v_plan public.litter_plans%rowtype;
  v_template public.litter_care_task_templates%rowtype;
  v_slots time[] := '{}'::time[];
  v_slot_count integer;
  v_starts_on date;
  v_ends_on date;
  v_effective_through date;
  v_day_no integer;
  v_occurrence_date date;
  v_occurrence_no integer;
  v_slot_no integer;
  v_local_time time;
  v_offset_days integer;
  v_existing public.litter_care_tasks%rowtype;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_max_day_from_count integer;
  v_completed boolean := false;
  v_completion text := null;
  v_resolved_at timestamptz := statement_timestamp();
  v_na_count integer := 0;
  v_data_changed boolean := false;
  v_series_revision_before integer;
  v_source text;
  v_source_date date;
  v_adjust integer;
  v_anchor date;
  v_allow_inserts boolean;
  v_new_occurrence_count integer;
  v_needs_reconcile boolean;
  v_terminal_day_no integer;
  v_absolute_max_date date;
  v_coverage_through date;
  v_previous_through date;
  v_allow_through_update boolean;
begin
  select * into v_series
  from public.litter_plan_series s
  where s.id = p_series_id;

  if not found then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;

  select * into v_litter
  from public.litters l
  where l.organization_id = v_series.organization_id
    and l.id = v_series.litter_id
  for update;

  select * into v_plan
  from public.litter_plans p
  where p.organization_id = v_series.organization_id
    and p.id = v_series.litter_plan_id
  for update;

  select * into v_item
  from public.litter_plan_items i
  where i.organization_id = v_series.organization_id
    and i.id = v_series.litter_plan_item_id
  for update;

  if v_item.organization_template_id is not null then
    select * into v_template
    from public.litter_care_task_templates t
    where t.organization_id = v_item.organization_id
      and t.id = v_item.organization_template_id;
  end if;

  select * into v_series
  from public.litter_plan_series s
  where s.id = p_series_id
  for update;

  v_series_revision_before := v_series.revision_no;

  v_needs_reconcile := public.litter_plan_series_needs_actual_birth_reconciliation(
    v_series.organization_id,
    v_series.id,
    v_series.end_kind,
    v_series.state,
    v_series.ends_on,
    v_litter.actual_birth_date
  );

  if p_reconciliation_only then
    if v_series.state not in ('active', 'suspended', 'completed') then
      raise exception 'series_not_active' using errcode = 'P0001';
    end if;
    if not v_needs_reconcile then
      raise exception 'series_not_active' using errcode = 'P0001';
    end if;
  elsif v_series.state <> 'active' then
    raise exception 'series_not_active' using errcode = 'P0001';
  end if;

  if p_requested_through is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select array_agg(s.local_time order by s.slot_no), count(*)
  into v_slots, v_slot_count
  from public.litter_plan_series_time_slots s
  where s.organization_id = v_series.organization_id
    and s.series_id = v_series.id;

  if v_slot_count is null or v_slot_count < 1 or v_slot_count > 8 then
    raise exception 'invalid_slot_count' using errcode = '23514';
  end if;

  if v_item.anchor_date_snapshot is null then
    select r.resolution_source, r.source_date, r.adjustment_days, r.anchor_date
    into v_source, v_source_date, v_adjust, v_anchor
    from public.resolve_litter_plan_anchor(
      v_item.anchor_type,
      v_litter.estimated_ovulation_date,
      v_litter.expected_birth_date,
      v_litter.mating_date,
      v_litter.actual_birth_date
    ) r;

    if v_anchor is null then
      raise exception 'anchor_unavailable' using errcode = 'P0001';
    end if;

    update public.litter_plan_items i
    set anchor_resolution_source = v_source,
        anchor_source_date_snapshot = v_source_date,
        anchor_adjustment_days = v_adjust,
        anchor_date_snapshot = v_anchor,
        materialization_state = 'materialized',
        materialized_at = coalesce(i.materialized_at, v_resolved_at),
        revision_no = i.revision_no + 1,
        updated_by = p_actor
    where i.id = v_item.id
    returning * into v_item;

    update public.litter_plans p
    set revision = p.revision + 1,
        updated_by = p_actor
    where p.id = v_plan.id
    returning * into v_plan;

    v_data_changed := true;
  end if;

  if v_item.anchor_date_snapshot is null then
    raise exception 'anchor_unavailable' using errcode = 'P0001';
  end if;

  v_starts_on := v_item.anchor_date_snapshot + v_item.recurrence_starts_offset_days;

  if v_series.end_kind = 'fixed_end_offset' then
    v_ends_on := v_item.anchor_date_snapshot + v_item.recurrence_ends_offset_days;
  elsif v_series.end_kind = 'fixed_recurrence_day_count' then
    v_max_day_from_count := v_series.recurrence_day_count;
    v_ends_on := v_starts_on + ((v_max_day_from_count - 1) * v_series.recurrence_interval_days);
  elsif v_series.end_kind = 'actual_birth' then
    v_ends_on := v_litter.actual_birth_date;
  else
    raise exception 'invalid_end_kind' using errcode = '23514';
  end if;

  update public.litter_plan_series
  set starts_on = v_starts_on,
      ends_on = v_ends_on,
      updated_by = p_actor
  where id = v_series.id
    and (
      starts_on is distinct from v_starts_on
      or ends_on is distinct from v_ends_on
    )
  returning * into v_series;

  if found then
    v_data_changed := true;
  else
    select * into v_series from public.litter_plan_series s where s.id = p_series_id;
  end if;

  if v_series.end_kind = 'actual_birth' and v_litter.actual_birth_date is not null then
    for v_existing in
      select *
      from public.litter_care_tasks t
      where t.organization_id = v_series.organization_id
        and t.litter_plan_series_id = v_series.id
        and t.status = 'planned'
        and t.planned_for > v_litter.actual_birth_date
      order by t.id
      for update
    loop
      update public.litter_care_tasks
      set status = 'not_applicable',
          resolution_command_id = gen_random_uuid(),
          resolved_at = v_resolved_at,
          resolved_timezone_name = v_series.timezone_name,
          resolved_by = p_actor,
          resolution_note = 'actual_birth_reached',
          updated_by = p_actor
      where id = v_existing.id;
      v_na_count := v_na_count + 1;
    end loop;
    if v_na_count > 0 then
      v_data_changed := true;
    end if;
  end if;

  -- Insertion window: requested date capped by known ends_on.
  v_effective_through := p_requested_through;
  if v_ends_on is not null and v_effective_through > v_ends_on then
    v_effective_through := v_ends_on;
  end if;

  v_terminal_day_no := ceil(
    v_series.absolute_max_occurrences::numeric / v_slot_count::numeric
  )::integer;
  v_absolute_max_date := v_starts_on
    + ((v_terminal_day_no - 1) * v_series.recurrence_interval_days);

  v_allow_inserts := v_series.state = 'active' and not p_reconciliation_only;
  v_previous_through := v_series.materialized_through;

  inserted_count := 0;
  skipped_identical_count := 0;
  result_materialized_through := v_series.materialized_through;
  result_materialized_occurrence_count := v_series.materialized_occurrence_count;

  if v_allow_inserts
    and (
      v_series.materialized_through is null
      or v_effective_through > v_series.materialized_through
    )
  then
    v_day_no := 1;
    loop
      v_occurrence_date := v_starts_on + ((v_day_no - 1) * v_series.recurrence_interval_days);
      exit when v_occurrence_date > v_effective_through;
      exit when v_ends_on is not null and v_occurrence_date > v_ends_on;

      if v_series.end_kind = 'fixed_recurrence_day_count'
        and v_day_no > v_series.recurrence_day_count
      then
        exit;
      end if;

      for v_slot_no in 1..v_slot_count loop
        v_local_time := v_slots[v_slot_no];
        v_occurrence_no := ((v_day_no - 1) * v_slot_count) + v_slot_no;

        if v_occurrence_no > v_series.absolute_max_occurrences then
          v_completed := true;
          v_completion := 'absolute_max_reached';
          exit;
        end if;

        v_offset_days := v_occurrence_date - v_item.anchor_date_snapshot;

        select * into v_existing
        from public.litter_care_tasks t
        where t.organization_id = v_series.organization_id
          and t.litter_plan_series_id = v_series.id
          and t.recurrence_day_no = v_day_no
          and t.slot_no = v_slot_no;

        if found then
          if v_existing.occurrence_no is distinct from v_occurrence_no
            or v_existing.litter_plan_item_id is distinct from v_item.id
            or v_existing.item_kind is distinct from 'recurring_task'
          then
            raise exception 'schedule_collision' using errcode = '23505';
          end if;
          v_skipped := v_skipped + 1;
        else
          if exists (
            select 1
            from public.litter_care_tasks t
            where t.organization_id = v_series.organization_id
              and t.litter_id = v_series.litter_id
              and t.litter_plan_item_id = v_item.id
              and t.occurrence_no = v_occurrence_no
              and (
                t.litter_plan_series_id is distinct from v_series.id
                or t.recurrence_day_no is distinct from v_day_no
                or t.slot_no is distinct from v_slot_no
              )
          ) then
            raise exception 'schedule_collision' using errcode = '23505';
          end if;

          if v_series.materialized_occurrence_count + v_inserted >= v_series.absolute_max_occurrences then
            v_completed := true;
            v_completion := 'absolute_max_reached';
            exit;
          end if;

          begin
            if coalesce(v_item.origin_kind, 'planning_model') = 'ad_hoc'
              or v_item.organization_template_id is null
            then
              insert into public.litter_care_tasks (
                organization_id, litter_id, litter_plan_item_id, litter_plan_series_id,
                source, organization_template_id, occurrence_no, recurrence_day_no, slot_no,
                category, target_scope, title, description, anchor_type, anchor_date,
                offset_days, planned_for, item_kind, priority, suggested_for, suggested_local_time,
                scheduled_local_time, schedule_timezone_name, schedule_source,
                creation_command_id, created_by, updated_by
              ) values (
                v_series.organization_id, v_series.litter_id, v_item.id, v_series.id,
                'manual', null, v_occurrence_no, v_day_no, v_slot_no,
                v_item.category, v_item.target_scope, v_item.title, v_item.description,
                null, null, null, v_occurrence_date,
                'recurring_task', v_item.priority, null, null, v_local_time,
                v_series.timezone_name, 'manual',
                gen_random_uuid(), p_actor, p_actor
              );
            else
              insert into public.litter_care_tasks (
                organization_id, litter_id, litter_plan_item_id, litter_plan_series_id,
                source, organization_template_id, occurrence_no, recurrence_day_no, slot_no,
                category, target_scope, title, description, anchor_type, anchor_date,
                offset_days, planned_for, item_kind, priority, suggested_for, suggested_local_time,
                scheduled_local_time, schedule_timezone_name, schedule_source,
                creation_command_id, created_by, updated_by
              ) values (
                v_series.organization_id, v_series.litter_id, v_item.id, v_series.id,
                'organization_template', v_template.id, v_occurrence_no, v_day_no, v_slot_no,
                v_template.category, v_template.target_scope, v_template.title, v_template.description,
                v_item.anchor_type, v_item.anchor_date_snapshot, v_offset_days, v_occurrence_date,
                'recurring_task', v_item.priority, v_occurrence_date, v_local_time, v_local_time,
                v_series.timezone_name, 'suggested',
                gen_random_uuid(), p_actor, p_actor
              );
            end if;
          exception
            when datetime_field_overflow then
              raise exception 'schedule_out_of_range' using errcode = '22008';
          end;
          v_inserted := v_inserted + 1;
          v_data_changed := true;
        end if;
      end loop;

      exit when v_completed;
      v_day_no := v_day_no + 1;
      exit when v_day_no > 5000;
    end loop;

    inserted_count := v_inserted;
    skipped_identical_count := v_skipped;
  end if;

  select count(*) into v_new_occurrence_count
  from public.litter_care_tasks t
  where t.organization_id = v_series.organization_id
    and t.litter_plan_series_id = v_series.id;

  if v_series.end_kind = 'actual_birth' and v_litter.actual_birth_date is not null then
    v_completed := true;
    v_completion := 'actual_birth_reached';
  elsif v_new_occurrence_count >= v_series.absolute_max_occurrences
    or v_completion = 'absolute_max_reached'
  then
    v_completed := true;
    v_completion := 'absolute_max_reached';
  elsif v_ends_on is not null
    and (
      (v_previous_through is not null and v_previous_through >= v_ends_on)
      or v_effective_through >= v_ends_on
    )
  then
    v_completed := true;
    v_completion := case
      when v_series.end_kind = 'fixed_recurrence_day_count' then 'recurrence_day_count_reached'
      else 'end_offset_reached'
    end;
  elsif v_series.end_kind = 'fixed_recurrence_day_count'
    and exists (
      select 1 from public.litter_care_tasks t
      where t.litter_plan_series_id = v_series.id
        and t.recurrence_day_no = v_series.recurrence_day_count
    )
    and (
      select count(distinct t.recurrence_day_no)
      from public.litter_care_tasks t
      where t.litter_plan_series_id = v_series.id
    ) >= v_series.recurrence_day_count
  then
    v_completed := true;
    v_completion := 'recurrence_day_count_reached';
  end if;

  -- Coverage horizon: last civil day fully evaluated by the engine.
  v_coverage_through := v_effective_through;

  if v_needs_reconcile
    and v_series.end_kind = 'actual_birth'
    and v_litter.actual_birth_date is not null
    and v_ends_on is not distinct from v_litter.actual_birth_date
  then
    -- Authoritative biological contraction (or snap) to the birth date.
    v_coverage_through := v_litter.actual_birth_date;
  end if;

  if v_completion = 'absolute_max_reached' then
    v_coverage_through := least(v_coverage_through, v_absolute_max_date);
  end if;

  if v_ends_on is not null
    and not (
      v_needs_reconcile
      and v_series.end_kind = 'actual_birth'
      and v_litter.actual_birth_date is not null
    )
  then
    v_coverage_through := least(v_coverage_through, v_ends_on);
  end if;

  v_allow_through_update := false;
  if v_coverage_through is distinct from v_previous_through then
    if v_previous_through is null or v_coverage_through > v_previous_through then
      v_allow_through_update := true;
    elsif v_needs_reconcile
      and v_litter.actual_birth_date is not null
      and v_coverage_through = v_litter.actual_birth_date
      and v_coverage_through < v_previous_through
    then
      -- Only authoritative terminal contraction may retreat coverage.
      v_allow_through_update := true;
    end if;
  end if;

  if v_allow_through_update then
    update public.litter_plan_series
    set materialized_through = v_coverage_through,
        updated_by = p_actor
    where id = v_series.id
      and materialized_through is distinct from v_coverage_through
    returning * into v_series;
    if found then
      v_data_changed := true;
    else
      select * into v_series from public.litter_plan_series s where s.id = p_series_id;
    end if;
  end if;

  if v_new_occurrence_count is distinct from v_series.materialized_occurrence_count then
    update public.litter_plan_series
    set materialized_occurrence_count = v_new_occurrence_count,
        updated_by = p_actor
    where id = v_series.id
      and materialized_occurrence_count is distinct from v_new_occurrence_count
    returning * into v_series;
    if found then
      v_data_changed := true;
    else
      select * into v_series from public.litter_plan_series s where s.id = p_series_id;
    end if;
  end if;

  result_materialized_through := v_series.materialized_through;
  result_materialized_occurrence_count := v_series.materialized_occurrence_count;

  if v_completed and v_series.state in ('active', 'suspended') then
    update public.litter_plan_series as s
    set state = 'completed',
        completion_reason = v_completion,
        updated_by = p_actor
    where s.id = v_series.id
      and (
        s.state is distinct from 'completed'
        or s.completion_reason is distinct from v_completion
      )
    returning * into v_series;
    if found then
      v_data_changed := true;
    else
      select * into v_series from public.litter_plan_series s where s.id = p_series_id;
    end if;
  elsif v_completed
    and v_series.state = 'completed'
    and v_series.end_kind = 'actual_birth'
    and v_series.completion_reason is distinct from v_completion
  then
    update public.litter_plan_series as s
    set completion_reason = v_completion,
        updated_by = p_actor
    where s.id = v_series.id
      and s.completion_reason is distinct from v_completion
    returning * into v_series;
    if found then
      v_data_changed := true;
    else
      select * into v_series from public.litter_plan_series s where s.id = p_series_id;
    end if;
  end if;

  if v_data_changed and v_series.revision_no = v_series_revision_before then
    update public.litter_plan_series
    set revision_no = public.litter_plan_series.revision_no + 1,
        updated_by = p_actor
    where id = v_series.id
    returning * into v_series;
  end if;

  series_completed := v_completed;
  completion_reason := v_completion;
  data_changed := v_data_changed;
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Patch biological recalculation to ignore ad_hoc / manual_absolute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_litter_gestation_anchors_and_recalculate_plan(p_litter_id uuid, p_client_command_id uuid, p_expected_litter_updated_at timestamp with time zone, p_expected_plan_revision integer, p_estimated_ovulation_date date, p_expected_birth_date date)
 RETURNS TABLE(outcome text, reason text, replayed boolean, litter_id uuid, litter_plan_id uuid, result_plan_revision integer, recalculated_item_count integer, changed_task_count integer, moved_automatic_schedule_count integer, preserved_manual_schedule_count integer, preserved_locked_schedule_count integer, preserved_terminal_count integer, unchanged_task_count integer, result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
  v_cnt_series integer := 0;
  v_cnt_series_changed integer := 0;
  v_cnt_series_moved_auto integer := 0;
  v_cnt_series_manual integer := 0;
  v_cnt_series_locked integer := 0;
  v_cnt_series_terminal integer := 0;
  v_cnt_series_unchanged integer := 0;
  v_series public.litter_plan_series%rowtype;
  v_new_starts_on date;
  v_new_ends_on date;
  v_max_day_no integer;
  v_slot_time time;
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
  -- series counters live in result jsonb (additive; return signature unchanged)

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

  perform public.acquire_litter_plan_mutation_lock(v_org, p_litter_id);

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

    perform s.id from public.litter_plan_series s
    where s.organization_id = v_org and s.litter_plan_id = v_plan.id
    order by s.id for update;

    perform t.id from public.litter_care_tasks t
    where t.organization_id = v_org and t.litter_id = p_litter_id
      and t.litter_plan_item_id is not null
    order by t.id for update;

    for v_item in
      select * from public.litter_plan_items pi
      where pi.organization_id = v_org
        and pi.litter_plan_id = v_plan.id
        and pi.materialization_state = 'materialized'
        and pi.origin_kind = 'planning_model'
        and pi.anchor_resolution_source is distinct from 'manual_absolute'
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
      and pi.origin_kind = 'planning_model'
      and pi.anchor_resolution_source is distinct from 'manual_absolute'
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

    v_new_starts_on := null;
    v_new_ends_on := null;
    if v_item.item_kind = 'recurring_task' then
      select * into v_series
      from public.litter_plan_series s
      where s.organization_id = v_org
        and s.litter_plan_item_id = v_item.id
      for update;

      v_new_starts_on := v_item.anchor_date_snapshot + v_item.recurrence_starts_offset_days;
      if v_item.recurrence_end_kind = 'fixed_end_offset' then
        v_new_ends_on := v_item.anchor_date_snapshot + v_item.recurrence_ends_offset_days;
      elsif v_item.recurrence_end_kind = 'fixed_recurrence_day_count' then
        v_new_ends_on := v_new_starts_on + ((v_item.recurrence_day_count - 1) * v_item.recurrence_interval_days);
      elsif v_item.recurrence_end_kind = 'actual_birth' then
        v_new_ends_on := v_litter.actual_birth_date;
      end if;

      if v_series.starts_on is distinct from v_new_starts_on
        or v_series.ends_on is distinct from v_new_ends_on
      then
        select coalesce(max(t.recurrence_day_no), 0) into v_max_day_no
        from public.litter_care_tasks t
        where t.organization_id = v_org
          and t.litter_plan_series_id = v_series.id;

        update public.litter_plan_series
        set starts_on = v_new_starts_on,
            ends_on = v_new_ends_on,
            materialized_through = case
              when v_max_day_no > 0 then
                v_new_starts_on + ((v_max_day_no - 1) * v_series.recurrence_interval_days)
              else materialized_through
            end,
            revision_no = public.litter_plan_series.revision_no + 1,
            updated_by = v_user
        where id = v_series.id
        returning * into v_series;
        v_cnt_series := v_cnt_series + 1;
        v_plan_changed := true;
      else
        -- keep starts for task math even if unchanged
        v_new_starts_on := coalesce(v_series.starts_on, v_new_starts_on);
      end if;
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
      elsif v_task.item_kind = 'recurring_task' then
        -- NEVER treat recurring as point with point_offset_days
        v_new_suggested := v_new_starts_on + ((v_task.recurrence_day_no - 1) * v_item.recurrence_interval_days);
        select s.local_time into v_slot_time
        from public.litter_plan_series_time_slots s
        where s.organization_id = v_org
          and s.series_id = v_task.litter_plan_series_id
          and s.slot_no = v_task.slot_no;
        if v_task.status in ('done', 'cancelled', 'not_applicable')
          or v_task.schedule_source = 'manual'
          or v_task.is_schedule_locked
        then
          update public.litter_care_tasks set
            suggested_for = v_new_suggested,
            suggested_local_time = coalesce(v_slot_time, suggested_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            offset_days = v_new_suggested - v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_for is distinct from v_new_suggested
              or suggested_local_time is distinct from coalesce(v_slot_time, suggested_local_time)
              or anchor_date is distinct from v_item.anchor_date_snapshot
            )
          returning * into v_after;
        elsif v_task.status = 'planned' and v_task.schedule_source = 'suggested' and not v_task.is_schedule_locked then
          update public.litter_care_tasks set
            suggested_for = v_new_suggested,
            suggested_local_time = coalesce(v_slot_time, suggested_local_time),
            planned_for = v_new_suggested,
            scheduled_local_time = coalesce(v_slot_time, scheduled_local_time),
            anchor_date = v_item.anchor_date_snapshot,
            offset_days = v_new_suggested - v_item.anchor_date_snapshot,
            updated_by = v_user
          where id = v_task.id
            and (
              suggested_for is distinct from v_new_suggested
              or planned_for is distinct from v_new_suggested
              or suggested_local_time is distinct from coalesce(v_slot_time, suggested_local_time)
              or scheduled_local_time is distinct from coalesce(v_slot_time, scheduled_local_time)
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
        if v_task.item_kind = 'recurring_task' then
          v_cnt_series_unchanged := v_cnt_series_unchanged + 1;
        else
          v_cnt_unchanged := v_cnt_unchanged + 1;
        end if;
        continue;
      end if;

      update public.litter_care_tasks
      set revision_no = public.litter_care_tasks.revision_no + 1
      where id = v_after.id
      returning * into v_after;

      v_cnt_changed_tasks := v_cnt_changed_tasks + 1;
      v_plan_changed := true;

      if v_task.item_kind = 'recurring_task' then
        v_cnt_series_changed := v_cnt_series_changed + 1;
        if v_task.status in ('done', 'cancelled', 'not_applicable') then
          v_cnt_series_terminal := v_cnt_series_terminal + 1;
        elsif v_task.is_schedule_locked then
          v_cnt_series_locked := v_cnt_series_locked + 1;
        elsif v_task.schedule_source = 'manual' then
          v_cnt_series_manual := v_cnt_series_manual + 1;
        else
          v_cnt_series_moved_auto := v_cnt_series_moved_auto + 1;
        end if;
      elsif v_task.status in ('done', 'cancelled', 'not_applicable') then
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
    'recalculatedSeriesCount', v_cnt_series,
    'changedSeriesOccurrenceCount', v_cnt_series_changed,
    'movedSeriesAutomaticScheduleCount', v_cnt_series_moved_auto,
    'preservedSeriesManualScheduleCount', v_cnt_series_manual,
    'preservedSeriesLockedScheduleCount', v_cnt_series_locked,
    'preservedSeriesTerminalCount', v_cnt_series_terminal,
    'unchangedSeriesOccurrenceCount', v_cnt_series_unchanged,
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
    preserved_terminal_count, unchanged_task_count,
    recalculated_series_count, changed_series_occurrence_count,
    moved_series_automatic_schedule_count, preserved_series_manual_schedule_count,
    preserved_series_locked_schedule_count, preserved_series_terminal_count,
    unchanged_series_occurrence_count, created_by
  ) values (
    v_command_id, v_org, p_litter_id, v_plan.id, p_client_command_id, v_payload,
    p_expected_litter_updated_at, p_expected_plan_revision,
    v_prev_ovulation, v_litter.estimated_ovulation_date,
    v_prev_expected, v_litter.expected_birth_date,
    v_business_outcome, v_result, p_expected_plan_revision, v_plan.revision,
    v_cnt_items, v_cnt_changed_tasks, v_cnt_moved_auto,
    v_cnt_manual, v_cnt_locked, v_cnt_terminal, v_cnt_unchanged,
    v_cnt_series, v_cnt_series_changed, v_cnt_series_moved_auto,
    v_cnt_series_manual, v_cnt_series_locked, v_cnt_series_terminal,
    v_cnt_series_unchanged, v_user
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. Atomic RPC create_litter_plan_ad_hoc_item
-- ---------------------------------------------------------------------------
create or replace function public.create_litter_plan_ad_hoc_item(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_expected_plan_revision integer,
  p_timezone_name text,
  p_item jsonb
)
returns table (
  outcome text,
  litter_plan_id uuid,
  plan_revision integer,
  litter_plan_item_id uuid,
  task_id uuid,
  series_id uuid,
  materialized_occurrence_count integer,
  replayed boolean,
  reason text,
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
  v_command public.litter_plan_ad_hoc_commands%rowtype;
  v_payload jsonb;
  v_item jsonb;
  v_kind text;
  v_title text;
  v_description text;
  v_category text;
  v_target_scope text;
  v_priority text;
  v_lock boolean;
  v_version numeric;
  v_keys text[];
  v_allowed text[];
  v_required_key text;
  v_date date;
  v_time time;
  v_starts date;
  v_ends date;
  v_starts_time time;
  v_ends_time time;
  v_interval integer;
  v_interval_num numeric;
  v_end_kind text;
  v_recurrence_day_count integer;
  v_recurrence_day_count_num numeric;
  v_slot_elem jsonb;
  v_slot_raw text;
  v_slot_times time[] := '{}'::time[];
  v_slot_time time;
  v_slot_no integer;
  v_slot_count integer;
  v_recurrence_days integer;
  v_absolute_max integer;
  v_horizon integer;
  v_civil_span integer;
  v_db_end_kind text;
  v_ends_offset integer;
  v_plan_item_id uuid;
  v_task_id uuid := null;
  v_series_id uuid := null;
  v_occ_count integer := 0;
  v_display_order integer;
  v_created_plan boolean := false;
  v_mat record;
  v_horizon_through date;
  v_membership_id uuid;
  v_lock_at timestamptz;
  v_result jsonb := '{}'::jsonb;
  v_time_text text;
  v_date_text text;
begin
  outcome := 'error';
  litter_plan_id := null;
  plan_revision := null;
  litter_plan_item_id := null;
  task_id := null;
  series_id := null;
  materialized_occurrence_count := 0;
  replayed := false;
  reason := null;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_timezone_name is null
    or not public.is_iana_timezone(p_timezone_name)
    or p_item is null
    or jsonb_typeof(p_item) <> 'object'
    or (
      p_expected_plan_revision is not null
      and p_expected_plan_revision <= 0
    )
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

  select m.role, m.profile_id into v_role, v_membership_id
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

  -- ------------------------------------------------------------------
  -- Authoritative payload validation (exact keys + jsonb_typeof)
  -- ------------------------------------------------------------------
  if not (p_item ? 'version')
    or jsonb_typeof(p_item->'version') <> 'number'
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_version := (p_item->>'version')::numeric;
  if v_version is distinct from 1
    or trunc(v_version) <> v_version
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not (p_item ? 'kind')
    or jsonb_typeof(p_item->'kind') <> 'string'
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_kind := p_item->>'kind';
  if v_kind is null
    or v_kind not in ('milestone', 'task', 'window', 'recurring_task')
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if v_kind in ('milestone', 'task') then
    v_allowed := array[
      'version','kind','title','description','category','targetScope','priority','lockSchedule',
      'scheduledDate','localTime'
    ];
  elsif v_kind = 'window' then
    v_allowed := array[
      'version','kind','title','description','category','targetScope','priority','lockSchedule',
      'startsOn','startsLocalTime','endsOn','endsLocalTime'
    ];
  else
    v_allowed := array[
      'version','kind','title','description','category','targetScope','priority','lockSchedule',
      'startsOn','intervalDays','endKind','endsOn','recurrenceDayCount','timeSlots'
    ];
  end if;

  select coalesce(array_agg(k order by k), '{}'::text[])
  into v_keys
  from jsonb_object_keys(p_item) k;

  if cardinality(v_keys) is distinct from cardinality(v_allowed) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  foreach v_required_key in array v_allowed loop
    if not (p_item ? v_required_key) then
      reason := 'invalid_input';
      return next;
      return;
    end if;
  end loop;

  foreach v_required_key in array v_keys loop
    if not (v_required_key = any (v_allowed)) then
      reason := 'invalid_input';
      return next;
      return;
    end if;
  end loop;

  if jsonb_typeof(p_item->'title') <> 'string' then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_title := btrim(p_item->>'title');
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 255 then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if jsonb_typeof(p_item->'description') = 'null' then
    v_description := null;
  elsif jsonb_typeof(p_item->'description') = 'string' then
    v_description := btrim(p_item->>'description');
    if v_description = '' then
      v_description := null;
    elsif char_length(v_description) > 5000 then
      reason := 'invalid_input';
      return next;
      return;
    end if;
  else
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if jsonb_typeof(p_item->'category') <> 'string' then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_category := p_item->>'category';
  if v_category is null or v_category not in (
    'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
    'offspring_weight', 'offspring_health', 'offspring_feeding',
    'socialization', 'veterinary', 'identification', 'vaccination', 'other'
  ) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if jsonb_typeof(p_item->'targetScope') <> 'string' then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_target_scope := p_item->>'targetScope';
  if v_target_scope is null
    or v_target_scope not in ('mother', 'litter', 'all_offspring', 'organization')
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if jsonb_typeof(p_item->'priority') <> 'string' then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_priority := p_item->>'priority';
  if v_priority is null
    or v_priority not in ('normal', 'important', 'organization_critical')
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if jsonb_typeof(p_item->'lockSchedule') <> 'boolean' then
    reason := 'invalid_input';
    return next;
    return;
  end if;
  v_lock := (p_item->>'lockSchedule')::boolean;

  if v_kind in ('milestone', 'task') then
    if jsonb_typeof(p_item->'scheduledDate') <> 'string' then
      reason := 'invalid_input';
      return next;
      return;
    end if;
    v_date_text := p_item->>'scheduledDate';
    begin
      v_date := v_date_text::date;
    exception when others then
      reason := 'invalid_input';
      return next;
      return;
    end;
    if v_date_text is distinct from to_char(v_date, 'YYYY-MM-DD') then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    if jsonb_typeof(p_item->'localTime') = 'null' then
      v_time := null;
    elsif jsonb_typeof(p_item->'localTime') = 'string' then
      v_time_text := btrim(p_item->>'localTime');
      if v_time_text !~ '^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      begin
        v_time := v_time_text::time;
      exception when others then
        reason := 'invalid_input';
        return next;
        return;
      end;
    else
      reason := 'invalid_input';
      return next;
      return;
    end if;

    v_item := jsonb_build_object(
      'version', 1,
      'kind', v_kind,
      'title', v_title,
      'description', to_jsonb(v_description),
      'category', v_category,
      'targetScope', v_target_scope,
      'priority', v_priority,
      'lockSchedule', v_lock,
      'scheduledDate', to_char(v_date, 'YYYY-MM-DD'),
      'localTime', case when v_time is null then null else to_jsonb(to_char(v_time, 'HH24:MI:SS')) end
    );

  elsif v_kind = 'window' then
    if jsonb_typeof(p_item->'startsOn') <> 'string'
      or jsonb_typeof(p_item->'endsOn') <> 'string'
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;
    begin
      v_starts := (p_item->>'startsOn')::date;
      v_ends := (p_item->>'endsOn')::date;
    exception when others then
      reason := 'invalid_input';
      return next;
      return;
    end;
    if p_item->>'startsOn' is distinct from to_char(v_starts, 'YYYY-MM-DD')
      or p_item->>'endsOn' is distinct from to_char(v_ends, 'YYYY-MM-DD')
      or v_starts > v_ends
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    if jsonb_typeof(p_item->'startsLocalTime') = 'null' then
      v_starts_time := null;
    elsif jsonb_typeof(p_item->'startsLocalTime') = 'string' then
      v_time_text := btrim(p_item->>'startsLocalTime');
      if v_time_text !~ '^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      begin
        v_starts_time := v_time_text::time;
      exception when others then
        reason := 'invalid_input';
        return next;
        return;
      end;
    else
      reason := 'invalid_input';
      return next;
      return;
    end if;

    if jsonb_typeof(p_item->'endsLocalTime') = 'null' then
      v_ends_time := null;
    elsif jsonb_typeof(p_item->'endsLocalTime') = 'string' then
      v_time_text := btrim(p_item->>'endsLocalTime');
      if v_time_text !~ '^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      begin
        v_ends_time := v_time_text::time;
      exception when others then
        reason := 'invalid_input';
        return next;
        return;
      end;
    else
      reason := 'invalid_input';
      return next;
      return;
    end if;

    if v_starts = v_ends
      and v_starts_time is not null
      and v_ends_time is not null
      and v_starts_time > v_ends_time
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    v_item := jsonb_build_object(
      'version', 1,
      'kind', 'window',
      'title', v_title,
      'description', to_jsonb(v_description),
      'category', v_category,
      'targetScope', v_target_scope,
      'priority', v_priority,
      'lockSchedule', v_lock,
      'startsOn', to_char(v_starts, 'YYYY-MM-DD'),
      'endsOn', to_char(v_ends, 'YYYY-MM-DD'),
      'startsLocalTime', case when v_starts_time is null then null else to_jsonb(to_char(v_starts_time, 'HH24:MI:SS')) end,
      'endsLocalTime', case when v_ends_time is null then null else to_jsonb(to_char(v_ends_time, 'HH24:MI:SS')) end
    );

  else
    if jsonb_typeof(p_item->'startsOn') <> 'string'
      or jsonb_typeof(p_item->'intervalDays') <> 'number'
      or jsonb_typeof(p_item->'endKind') <> 'string'
      or jsonb_typeof(p_item->'timeSlots') <> 'array'
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    begin
      v_starts := (p_item->>'startsOn')::date;
    exception when others then
      reason := 'invalid_input';
      return next;
      return;
    end;
    if p_item->>'startsOn' is distinct from to_char(v_starts, 'YYYY-MM-DD') then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    v_interval_num := (p_item->>'intervalDays')::numeric;
    if trunc(v_interval_num) <> v_interval_num
      or v_interval_num < 1
      or v_interval_num > 365
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;
    v_interval := v_interval_num::integer;

    v_end_kind := p_item->>'endKind';
    if v_end_kind is null
      or v_end_kind not in ('fixed_end_date', 'fixed_recurrence_day_count')
    then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    if v_end_kind = 'fixed_end_date' then
      if jsonb_typeof(p_item->'endsOn') <> 'string'
        or jsonb_typeof(p_item->'recurrenceDayCount') <> 'null'
      then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      begin
        v_ends := (p_item->>'endsOn')::date;
      exception when others then
        reason := 'invalid_input';
        return next;
        return;
      end;
      if p_item->>'endsOn' is distinct from to_char(v_ends, 'YYYY-MM-DD')
        or v_ends < v_starts
      then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      v_recurrence_day_count := null;
      v_recurrence_days := ((v_ends - v_starts) / v_interval) + 1;
      if v_starts + ((v_recurrence_days - 1) * v_interval) > v_ends then
        v_recurrence_days := v_recurrence_days - 1;
      end if;
      if v_recurrence_days < 1 then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      v_db_end_kind := 'fixed_end_offset';
      v_ends_offset := v_ends - v_starts;
      v_civil_span := (v_ends - v_starts) + 1;
    else
      if jsonb_typeof(p_item->'endsOn') <> 'null'
        or jsonb_typeof(p_item->'recurrenceDayCount') <> 'number'
      then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      v_recurrence_day_count_num := (p_item->>'recurrenceDayCount')::numeric;
      if trunc(v_recurrence_day_count_num) <> v_recurrence_day_count_num
        or v_recurrence_day_count_num < 1
        or v_recurrence_day_count_num > 500
      then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      v_recurrence_day_count := v_recurrence_day_count_num::integer;
      v_ends := v_starts + ((v_recurrence_day_count - 1) * v_interval);
      v_recurrence_days := v_recurrence_day_count;
      v_db_end_kind := 'fixed_recurrence_day_count';
      v_ends_offset := null;
      v_civil_span := ((v_recurrence_day_count - 1) * v_interval) + 1;
    end if;

    v_slot_times := '{}'::time[];
    for v_slot_elem in
      select value
      from jsonb_array_elements(p_item->'timeSlots')
    loop
      if jsonb_typeof(v_slot_elem) <> 'string' then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      v_slot_raw := btrim(v_slot_elem #>> '{}');
      if v_slot_raw !~ '^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then
        reason := 'invalid_input';
        return next;
        return;
      end if;
      begin
        v_slot_time := v_slot_raw::time;
      exception when others then
        reason := 'invalid_input';
        return next;
        return;
      end;
      v_slot_times := array_append(v_slot_times, v_slot_time);
    end loop;

    v_slot_count := coalesce(cardinality(v_slot_times), 0);
    if v_slot_count < 1 or v_slot_count > 8 then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    -- Duplicates detected after normalization (08:00 vs 08:00:00).
    if (
      select count(*) from unnest(v_slot_times) s(t)
    ) <> (
      select count(distinct s.t) from unnest(v_slot_times) s(t)
    ) then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    -- Deterministic ascending sort for slot_no assignment.
    select coalesce(array_agg(s.t order by s.t), '{}'::time[])
    into v_slot_times
    from unnest(v_slot_times) s(t);

    v_absolute_max := v_recurrence_days * v_slot_count;
    if v_absolute_max < 1 or v_absolute_max > 500 then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    v_horizon := least(30, greatest(1, v_civil_span));

    v_item := jsonb_build_object(
      'version', 1,
      'kind', 'recurring_task',
      'title', v_title,
      'description', to_jsonb(v_description),
      'category', v_category,
      'targetScope', v_target_scope,
      'priority', v_priority,
      'lockSchedule', v_lock,
      'startsOn', to_char(v_starts, 'YYYY-MM-DD'),
      'intervalDays', v_interval,
      'endKind', v_end_kind,
      'endsOn', case when v_end_kind = 'fixed_end_date' then to_jsonb(to_char(v_ends, 'YYYY-MM-DD')) else 'null'::jsonb end,
      'recurrenceDayCount', case when v_end_kind = 'fixed_recurrence_day_count' then to_jsonb(v_recurrence_day_count) else 'null'::jsonb end,
      'timeSlots', (
        select jsonb_agg(to_char(t, 'HH24:MI:SS') order by ord)
        from unnest(v_slot_times) with ordinality as u(t, ord)
      )
    );
  end if;

  v_payload := jsonb_build_object(
    'litterId', p_litter_id,
    'expectedPlanRevision', p_expected_plan_revision,
    'timezoneName', p_timezone_name,
    'item', v_item
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_plan_ad_hoc_commands:' || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select * into v_command
  from public.litter_plan_ad_hoc_commands c
  where c.organization_id = v_org
    and c.client_command_id = p_client_command_id
  for update;

  if found then
    if v_command.payload is distinct from v_payload then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;
    outcome := v_command.outcome;
    litter_plan_id := v_command.litter_plan_id;
    plan_revision := v_command.result_plan_revision;
    litter_plan_item_id := v_command.litter_plan_item_id;
    task_id := v_command.task_id;
    series_id := v_command.series_id;
    materialized_occurrence_count := v_command.materialized_occurrence_count;
    reason := v_command.reason;
    result := v_command.result;
    replayed := true;
    return next;
    return;
  end if;

  perform public.acquire_litter_plan_mutation_lock(v_org, p_litter_id);

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
    insert into public.litter_plan_ad_hoc_commands (
      organization_id, litter_id, client_command_id, payload,
      outcome, reason, result, created_by
    ) values (
      v_org, p_litter_id, p_client_command_id, v_payload,
      'error', 'invalid_litter', '{}'::jsonb, v_user
    );
    reason := 'invalid_litter';
    return next;
    return;
  end if;

  select * into v_plan
  from public.litter_plans p
  where p.organization_id = v_org
    and p.litter_id = p_litter_id
    and p.status = 'active'
  for update;

  if found then
    if p_expected_plan_revision is null or p_expected_plan_revision <> v_plan.revision then
      insert into public.litter_plan_ad_hoc_commands (
        organization_id, litter_id, litter_plan_id, client_command_id, payload,
        outcome, reason, result, result_plan_revision, created_by
      ) values (
        v_org, p_litter_id, v_plan.id, p_client_command_id, v_payload,
        'error', 'stale_revision', '{}'::jsonb, v_plan.revision, v_user
      );
      reason := 'stale_revision';
      litter_plan_id := v_plan.id;
      plan_revision := v_plan.revision;
      return next;
      return;
    end if;

    update public.litter_plans as lp
    set revision = lp.revision + 1,
        updated_by = v_user
    where lp.id = v_plan.id
    returning * into v_plan;
  else
    if p_expected_plan_revision is not null then
      insert into public.litter_plan_ad_hoc_commands (
        organization_id, litter_id, client_command_id, payload,
        outcome, reason, result, created_by
      ) values (
        v_org, p_litter_id, p_client_command_id, v_payload,
        'error', 'stale_revision', '{}'::jsonb, v_user
      );
      reason := 'stale_revision';
      return next;
      return;
    end if;

    insert into public.litter_plans (
      organization_id, litter_id, title, timezone_name, created_by, updated_by
    ) values (
      v_org, p_litter_id, 'Planning personnalisé', p_timezone_name, v_user, v_user
    )
    returning * into v_plan;
    v_created_plan := true;
  end if;

  select coalesce(max(pi.display_order), -1) + 1
  into v_display_order
  from public.litter_plan_items pi
  where pi.organization_id = v_org
    and pi.litter_plan_id = v_plan.id;

  v_lock_at := statement_timestamp();

  if v_kind in ('milestone', 'task') then
    insert into public.litter_plan_items (
      organization_id, litter_plan_id, litter_id, origin_kind,
      source_planning_model_id, source_planning_model_revision, source_model_item_id,
      source_model_display_order, organization_template_id,
      item_kind, priority, category, target_scope, title, description,
      anchor_type, anchor_resolution_source, anchor_source_date_snapshot,
      anchor_adjustment_days, anchor_date_snapshot,
      point_offset_days, point_local_time,
      is_required_snapshot, is_selected_by_default_snapshot,
      display_order, materialization_state, materialized_at,
      created_by, updated_by
    ) values (
      v_org, v_plan.id, p_litter_id, 'ad_hoc',
      null, null, null, null, null,
      v_kind, v_priority, v_category, v_target_scope, v_title, v_description,
      null, 'manual_absolute', v_date, 0, v_date,
      0, v_time,
      false, false,
      v_display_order, 'materialized', v_lock_at,
      v_user, v_user
    )
    returning id into v_plan_item_id;

    insert into public.litter_care_tasks (
      organization_id, litter_id, litter_plan_item_id, source,
      occurrence_no, category, target_scope, title, description,
      anchor_type, anchor_date, offset_days, planned_for, item_kind, priority,
      suggested_for, suggested_local_time, scheduled_local_time,
      schedule_timezone_name, schedule_source,
      is_schedule_locked, schedule_locked_at, schedule_locked_by,
      creation_command_id, created_by, updated_by
    ) values (
      v_org, p_litter_id, v_plan_item_id, 'manual',
      1, v_category, v_target_scope, v_title, v_description,
      null, null, null, v_date, v_kind, v_priority,
      null, null, v_time,
      v_plan.timezone_name, 'manual',
      case when v_lock then true else false end,
      case when v_lock then v_lock_at else null end,
      case when v_lock then v_user else null end,
      p_client_command_id, v_user, v_user
    )
    returning id into v_task_id;

    v_occ_count := 0;
    v_result := jsonb_build_object(
      'planItemId', v_plan_item_id,
      'taskId', v_task_id,
      'kind', v_kind,
      'createdPlan', v_created_plan
    );

  elsif v_kind = 'window' then
    insert into public.litter_plan_items (
      organization_id, litter_plan_id, litter_id, origin_kind,
      source_planning_model_id, source_planning_model_revision, source_model_item_id,
      source_model_display_order, organization_template_id,
      item_kind, priority, category, target_scope, title, description,
      anchor_type, anchor_resolution_source, anchor_source_date_snapshot,
      anchor_adjustment_days, anchor_date_snapshot,
      window_starts_offset_days, window_starts_local_time,
      window_ends_offset_days, window_ends_local_time,
      is_required_snapshot, is_selected_by_default_snapshot,
      display_order, materialization_state, materialized_at,
      created_by, updated_by
    ) values (
      v_org, v_plan.id, p_litter_id, 'ad_hoc',
      null, null, null, null, null,
      'window', v_priority, v_category, v_target_scope, v_title, v_description,
      null, 'manual_absolute', v_starts, 0, v_starts,
      0, v_starts_time,
      (v_ends - v_starts), v_ends_time,
      false, false,
      v_display_order, 'materialized', v_lock_at,
      v_user, v_user
    )
    returning id into v_plan_item_id;

    insert into public.litter_care_tasks (
      organization_id, litter_id, litter_plan_item_id, source,
      occurrence_no, category, target_scope, title, description,
      anchor_type, anchor_date, offset_days, planned_for, item_kind, priority,
      suggested_starts_on, suggested_starts_local_time, suggested_ends_on, suggested_ends_local_time,
      retained_starts_on, retained_starts_local_time, retained_ends_on, retained_ends_local_time,
      schedule_timezone_name, schedule_source,
      is_schedule_locked, schedule_locked_at, schedule_locked_by,
      creation_command_id, created_by, updated_by
    ) values (
      v_org, p_litter_id, v_plan_item_id, 'manual',
      1, v_category, v_target_scope, v_title, v_description,
      null, null, null, null, 'window', v_priority,
      null, null, null, null,
      v_starts, v_starts_time, v_ends, v_ends_time,
      v_plan.timezone_name, 'manual',
      case when v_lock then true else false end,
      case when v_lock then v_lock_at else null end,
      case when v_lock then v_user else null end,
      p_client_command_id, v_user, v_user
    )
    returning id into v_task_id;

    v_result := jsonb_build_object(
      'planItemId', v_plan_item_id,
      'taskId', v_task_id,
      'kind', 'window',
      'createdPlan', v_created_plan
    );

  else
    -- recurring
    insert into public.litter_plan_items (
      organization_id, litter_plan_id, litter_id, origin_kind,
      source_planning_model_id, source_planning_model_revision, source_model_item_id,
      source_model_display_order, organization_template_id,
      item_kind, priority, category, target_scope, title, description,
      anchor_type, anchor_resolution_source, anchor_source_date_snapshot,
      anchor_adjustment_days, anchor_date_snapshot,
      recurrence_kind, recurrence_interval_days, recurrence_starts_offset_days,
      recurrence_end_kind, recurrence_ends_offset_days, recurrence_day_count,
      initial_materialization_horizon_days, absolute_max_occurrences,
      is_required_snapshot, is_selected_by_default_snapshot,
      display_order, materialization_state, materialized_at,
      created_by, updated_by
    ) values (
      v_org, v_plan.id, p_litter_id, 'ad_hoc',
      null, null, null, null, null,
      'recurring_task', v_priority, v_category, v_target_scope, v_title, v_description,
      null, 'manual_absolute', v_starts, 0, v_starts,
      'daily_interval', v_interval, 0,
      v_db_end_kind, v_ends_offset, v_recurrence_day_count,
      v_horizon, v_absolute_max,
      false, false,
      v_display_order, 'materialized', v_lock_at,
      v_user, v_user
    )
    returning id into v_plan_item_id;

    insert into public.litter_plan_series (
      organization_id, litter_id, litter_plan_id, litter_plan_item_id,
      recurrence_kind, recurrence_interval_days, starts_on, end_kind, ends_on,
      recurrence_day_count, initial_materialization_horizon_days, absolute_max_occurrences,
      timezone_name, state, created_by, updated_by
    ) values (
      v_org, p_litter_id, v_plan.id, v_plan_item_id,
      'daily_interval', v_interval, v_starts, v_db_end_kind, v_ends,
      v_recurrence_day_count, v_horizon, v_absolute_max,
      v_plan.timezone_name, 'active', v_user, v_user
    )
    returning id into v_series_id;

    for v_slot_no in 1..v_slot_count loop
      insert into public.litter_plan_series_time_slots (
        organization_id, series_id, slot_no, local_time, created_by
      ) values (
        v_org, v_series_id, v_slot_no, v_slot_times[v_slot_no], v_user
      );
    end loop;

    v_horizon_through := v_starts + (v_horizon - 1);

    select * into v_mat
    from public.materialize_litter_plan_series_occurrences(
      v_series_id, v_horizon_through, v_user, p_client_command_id, false
    );

    select s.materialized_occurrence_count into v_occ_count
    from public.litter_plan_series s where s.id = v_series_id;

    if v_lock then
      update public.litter_care_tasks t
      set is_schedule_locked = true,
          schedule_locked_at = v_lock_at,
          schedule_locked_by = v_user,
          updated_by = v_user
      where t.organization_id = v_org
        and t.litter_plan_series_id = v_series_id
        and t.is_schedule_locked = false;
    end if;

    v_result := jsonb_build_object(
      'planItemId', v_plan_item_id,
      'seriesId', v_series_id,
      'kind', 'recurring_task',
      'createdPlan', v_created_plan,
      'materializedOccurrenceCount', coalesce(v_occ_count, 0),
      'insertedCount', coalesce(v_mat.inserted_count, 0),
      'absoluteMaxOccurrences', v_absolute_max,
      'initialHorizonDays', v_horizon
    );
  end if;

  insert into public.litter_plan_ad_hoc_commands (
    organization_id, litter_id, litter_plan_id, litter_plan_item_id, task_id, series_id,
    client_command_id, payload, outcome, result, result_plan_revision,
    materialized_occurrence_count, created_by
  ) values (
    v_org, p_litter_id, v_plan.id, v_plan_item_id, v_task_id, v_series_id,
    p_client_command_id, v_payload, 'success', v_result, v_plan.revision,
    coalesce(v_occ_count, 0), v_user
  );

  outcome := 'success';
  litter_plan_id := v_plan.id;
  plan_revision := v_plan.revision;
  litter_plan_item_id := v_plan_item_id;
  task_id := v_task_id;
  series_id := v_series_id;
  materialized_occurrence_count := coalesce(v_occ_count, 0);
  reason := null;
  result := v_result;
  replayed := false;
  return next;
  return;
end;
$fn$;

revoke all on function public.create_litter_plan_ad_hoc_item(uuid, uuid, integer, text, jsonb) from public;
grant execute on function public.create_litter_plan_ad_hoc_item(uuid, uuid, integer, text, jsonb) to authenticated;

comment on function public.create_litter_plan_ad_hoc_item(uuid, uuid, integer, text, jsonb) is
  'Atomically create an ad-hoc litter plan snapshot (milestone/task/window/recurring) with command registry idempotence.';


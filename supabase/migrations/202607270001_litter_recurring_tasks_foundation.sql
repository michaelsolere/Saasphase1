-- LITTER-RECURRING-TASKS-01
-- Finite daily-interval recurring tasks for litter planning (V1 foundation).
-- Additive only: no canonical library model changes, no backfill of historical tasks.

-- ---------------------------------------------------------------------------
-- 0. Restore canonical IANA timezone validation (pg_timezone_names membership)
-- ---------------------------------------------------------------------------
create or replace function public.is_iana_timezone(p_timezone_name text)
returns boolean language sql stable security definer set search_path = '' set row_security = off as $$
  select p_timezone_name = btrim(p_timezone_name)
    and exists (
      select 1
      from pg_catalog.pg_timezone_names z
      where z.name = p_timezone_name
    );
$$;

create or replace function public.validate_litter_care_task_schedule_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  if new.schedule_timezone_name is not null
    and not public.is_iana_timezone(new.schedule_timezone_name)
  then
    raise exception 'litter care task schedule timezone must be an IANA timezone'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Extend litter_planning_model_items for recurring_task
-- ---------------------------------------------------------------------------
alter table public.litter_planning_model_items
  add column if not exists recurrence_kind text,
  add column if not exists recurrence_interval_days integer,
  add column if not exists recurrence_starts_offset_days integer,
  add column if not exists recurrence_end_kind text,
  add column if not exists recurrence_ends_offset_days integer,
  add column if not exists recurrence_day_count integer,
  add column if not exists initial_materialization_horizon_days integer,
  add column if not exists absolute_max_occurrences integer;

alter table public.litter_planning_model_items
  drop constraint if exists litter_planning_model_items_kind_check;

alter table public.litter_planning_model_items
  add constraint litter_planning_model_items_kind_check
  check (item_kind in ('milestone', 'task', 'window', 'recurring_task'));

alter table public.litter_planning_model_items
  drop constraint if exists litter_planning_model_items_schedule_shape_check;

alter table public.litter_planning_model_items
  add constraint litter_planning_model_items_schedule_shape_check check (
    (
      item_kind in ('milestone', 'task')
      and point_offset_days is not null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind is null
      and recurrence_interval_days is null
      and recurrence_starts_offset_days is null
      and recurrence_end_kind is null
      and recurrence_ends_offset_days is null
      and recurrence_day_count is null
      and initial_materialization_horizon_days is null
      and absolute_max_occurrences is null
    )
    or (
      item_kind = 'window'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is not null and window_ends_offset_days is not null
      and (
        window_starts_offset_days < window_ends_offset_days
        or (
          window_starts_offset_days = window_ends_offset_days
          and (
            window_starts_local_time is null
            or window_ends_local_time is null
            or window_starts_local_time <= window_ends_local_time
          )
        )
      )
      and recurrence_kind is null
      and recurrence_interval_days is null
      and recurrence_starts_offset_days is null
      and recurrence_end_kind is null
      and recurrence_ends_offset_days is null
      and recurrence_day_count is null
      and initial_materialization_horizon_days is null
      and absolute_max_occurrences is null
    )
    or (
      item_kind = 'recurring_task'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind = 'daily_interval'
      and recurrence_interval_days between 1 and 365
      and recurrence_starts_offset_days is not null
      and recurrence_end_kind in (
        'fixed_end_offset', 'fixed_recurrence_day_count', 'actual_birth'
      )
      and initial_materialization_horizon_days between 1 and 365
      and absolute_max_occurrences between 1 and 500
      and (
        (
          recurrence_end_kind = 'fixed_end_offset'
          and recurrence_ends_offset_days is not null
          and recurrence_day_count is null
        )
        or (
          recurrence_end_kind = 'fixed_recurrence_day_count'
          and recurrence_day_count between 1 and 500
          and recurrence_ends_offset_days is null
        )
        or (
          recurrence_end_kind = 'actual_birth'
          and recurrence_ends_offset_days is null
          and recurrence_day_count is null
        )
      )
      and (
        recurrence_end_kind <> 'fixed_end_offset'
        or recurrence_ends_offset_days >= recurrence_starts_offset_days
      )
    )
  );

comment on column public.litter_planning_model_items.recurrence_kind is
  'Recurrence engine for recurring_task items. V1 supports daily_interval only.';
comment on column public.litter_planning_model_items.recurrence_interval_days is
  'Cadence in calendar days for daily_interval recurring tasks (1..365).';
comment on column public.litter_planning_model_items.recurrence_starts_offset_days is
  'Civil-day offset from the item anchor to the first recurrence day.';
comment on column public.litter_planning_model_items.recurrence_end_kind is
  'End rule: fixed_end_offset, fixed_recurrence_day_count, or actual_birth.';
comment on column public.litter_planning_model_items.recurrence_ends_offset_days is
  'For fixed_end_offset: last allowed civil day = anchor + this offset.';
comment on column public.litter_planning_model_items.recurrence_day_count is
  'For fixed_recurrence_day_count: number of recurrence days (not slot occurrences).';
comment on column public.litter_planning_model_items.initial_materialization_horizon_days is
  'Civil days covered on first materialization: through = starts_on + (horizon - 1) calendar days.';
comment on column public.litter_planning_model_items.absolute_max_occurrences is
  'Hard ceiling on total occurrences for the series (1..500).';

-- ---------------------------------------------------------------------------
-- 2. Model item time slots
-- ---------------------------------------------------------------------------
create table public.litter_planning_model_item_time_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_item_id uuid not null,
  slot_no integer not null,
  local_time time without time zone not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_planning_model_item_time_slots_org_id_key unique (organization_id, id),
  constraint litter_planning_model_item_time_slots_item_fk
    foreign key (organization_id, model_item_id)
    references public.litter_planning_model_items (organization_id, id) on delete cascade,
  constraint litter_planning_model_item_time_slots_slot_no_check check (slot_no > 0),
  constraint litter_planning_model_item_time_slots_org_item_slot_key
    unique (organization_id, model_item_id, slot_no),
  constraint litter_planning_model_item_time_slots_org_item_time_key
    unique (organization_id, model_item_id, local_time)
);

create index litter_planning_model_item_time_slots_item_idx
  on public.litter_planning_model_item_time_slots (organization_id, model_item_id, slot_no);

comment on table public.litter_planning_model_item_time_slots is
  'Ordered local-time slots (1..8) for recurring_task planning model items.';

alter table public.litter_planning_model_item_time_slots enable row level security;

create policy litter_planning_model_item_time_slots_select_member
  on public.litter_planning_model_item_time_slots
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = litter_planning_model_item_time_slots.organization_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
        and m.deleted_at is null
    )
  );

revoke all on table public.litter_planning_model_item_time_slots from anon, authenticated;
grant select on table public.litter_planning_model_item_time_slots to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Extend litter_plan_items with immutable recurrence snapshot columns
-- ---------------------------------------------------------------------------
alter table public.litter_plan_items
  add column if not exists recurrence_kind text,
  add column if not exists recurrence_interval_days integer,
  add column if not exists recurrence_starts_offset_days integer,
  add column if not exists recurrence_end_kind text,
  add column if not exists recurrence_ends_offset_days integer,
  add column if not exists recurrence_day_count integer,
  add column if not exists initial_materialization_horizon_days integer,
  add column if not exists absolute_max_occurrences integer;

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_kind_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_kind_check
  check (item_kind in ('milestone', 'task', 'window', 'recurring_task'));

alter table public.litter_plan_items
  drop constraint if exists litter_plan_items_shape_check;

alter table public.litter_plan_items
  add constraint litter_plan_items_shape_check check (
    (
      item_kind in ('milestone', 'task')
      and point_offset_days is not null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind is null
      and recurrence_interval_days is null
      and recurrence_starts_offset_days is null
      and recurrence_end_kind is null
      and recurrence_ends_offset_days is null
      and recurrence_day_count is null
      and initial_materialization_horizon_days is null
      and absolute_max_occurrences is null
    )
    or (
      item_kind = 'window'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is not null and window_ends_offset_days is not null
      and (
        window_starts_offset_days < window_ends_offset_days
        or (
          window_starts_offset_days = window_ends_offset_days
          and (
            window_starts_local_time is null
            or window_ends_local_time is null
            or window_starts_local_time <= window_ends_local_time
          )
        )
      )
      and recurrence_kind is null
      and recurrence_interval_days is null
      and recurrence_starts_offset_days is null
      and recurrence_end_kind is null
      and recurrence_ends_offset_days is null
      and recurrence_day_count is null
      and initial_materialization_horizon_days is null
      and absolute_max_occurrences is null
    )
    or (
      item_kind = 'recurring_task'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind = 'daily_interval'
      and recurrence_interval_days between 1 and 365
      and recurrence_starts_offset_days is not null
      and recurrence_end_kind in (
        'fixed_end_offset', 'fixed_recurrence_day_count', 'actual_birth'
      )
      and initial_materialization_horizon_days between 1 and 365
      and absolute_max_occurrences between 1 and 500
      and (
        (
          recurrence_end_kind = 'fixed_end_offset'
          and recurrence_ends_offset_days is not null
          and recurrence_day_count is null
        )
        or (
          recurrence_end_kind = 'fixed_recurrence_day_count'
          and recurrence_day_count between 1 and 500
          and recurrence_ends_offset_days is null
        )
        or (
          recurrence_end_kind = 'actual_birth'
          and recurrence_ends_offset_days is null
          and recurrence_day_count is null
        )
      )
      and (
        recurrence_end_kind <> 'fixed_end_offset'
        or recurrence_ends_offset_days >= recurrence_starts_offset_days
      )
    )
  );

comment on column public.litter_plan_items.recurrence_kind is
  'Immutable snapshot of the model recurrence engine for recurring_task plan items.';
comment on column public.litter_plan_items.recurrence_interval_days is
  'Immutable snapshot of daily_interval cadence in calendar days.';
comment on column public.litter_plan_items.recurrence_starts_offset_days is
  'Immutable snapshot: first recurrence day = anchor + this offset.';
comment on column public.litter_plan_items.recurrence_end_kind is
  'Immutable snapshot of the series end rule.';
comment on column public.litter_plan_items.recurrence_ends_offset_days is
  'Immutable snapshot for fixed_end_offset end days.';
comment on column public.litter_plan_items.recurrence_day_count is
  'Immutable snapshot for fixed_recurrence_day_count.';
comment on column public.litter_plan_items.initial_materialization_horizon_days is
  'Immutable snapshot: civil days covered on first materialization (through = starts_on + horizon - 1).';
comment on column public.litter_plan_items.absolute_max_occurrences is
  'Immutable snapshot of the absolute occurrence ceiling.';

-- ---------------------------------------------------------------------------
-- 4. litter_plan_series + time slots
-- ---------------------------------------------------------------------------
create table public.litter_plan_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid not null,
  litter_plan_item_id uuid not null,
  recurrence_kind text not null,
  recurrence_interval_days integer not null,
  starts_on date,
  end_kind text not null,
  ends_on date,
  recurrence_day_count integer,
  initial_materialization_horizon_days integer not null,
  materialized_through date,
  absolute_max_occurrences integer not null,
  materialized_occurrence_count integer not null default 0,
  timezone_name text not null,
  state text not null default 'active',
  completion_reason text,
  revision_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_series_org_id_key unique (organization_id, id),
  constraint litter_plan_series_org_litter_id_key unique (organization_id, litter_id, id),
  constraint litter_plan_series_org_plan_item_key unique (organization_id, litter_plan_item_id),
  constraint litter_plan_series_plan_fk
    foreign key (organization_id, litter_id, litter_plan_id)
    references public.litter_plans (organization_id, litter_id, id) on delete cascade,
  constraint litter_plan_series_plan_item_fk
    foreign key (organization_id, litter_id, litter_plan_id, litter_plan_item_id)
    references public.litter_plan_items (organization_id, litter_id, litter_plan_id, id)
    on delete cascade,
  constraint litter_plan_series_recurrence_kind_check
    check (recurrence_kind = 'daily_interval'),
  constraint litter_plan_series_interval_check
    check (recurrence_interval_days between 1 and 365),
  constraint litter_plan_series_end_kind_check
    check (end_kind in ('fixed_end_offset', 'fixed_recurrence_day_count', 'actual_birth')),
  constraint litter_plan_series_end_shape_check check (
    (
      end_kind = 'fixed_end_offset'
      and recurrence_day_count is null
    )
    or (
      end_kind = 'fixed_recurrence_day_count'
      and recurrence_day_count between 1 and 500
    )
    or (
      end_kind = 'actual_birth'
      and recurrence_day_count is null
    )
  ),
  constraint litter_plan_series_horizon_check
    check (initial_materialization_horizon_days between 1 and 365),
  constraint litter_plan_series_max_check
    check (absolute_max_occurrences between 1 and 500),
  constraint litter_plan_series_count_check
    check (materialized_occurrence_count >= 0 and materialized_occurrence_count <= absolute_max_occurrences),
  constraint litter_plan_series_revision_check check (revision_no > 0),
  constraint litter_plan_series_state_check
    check (state in ('active', 'suspended', 'completed', 'cancelled', 'not_applicable')),
  constraint litter_plan_series_timezone_check
    check (public.is_iana_timezone(timezone_name)),
  constraint litter_plan_series_completion_reason_check check (
    (
      state in ('active', 'suspended')
      and completion_reason is null
    )
    or (
      state in ('completed', 'cancelled', 'not_applicable')
    )
  ),
  constraint litter_plan_series_bounds_check check (
    ends_on is null or starts_on is null or starts_on <= ends_on
  )
);

create trigger litter_plan_series_set_updated_at
before update on public.litter_plan_series
for each row execute function public.set_updated_at();

create index litter_plan_series_litter_idx
  on public.litter_plan_series (organization_id, litter_id, state);

comment on table public.litter_plan_series is
  'Immutable-rule series snapshot for a recurring_task litter_plan_item. One series per plan item.';
comment on column public.litter_plan_series.starts_on is
  'First recurrence day = anchor + recurrence_starts_offset_days when the start anchor is known; null while pending.';
comment on column public.litter_plan_series.ends_on is
  'Last civil day allowed for occurrences when known (fixed_end_offset or actual_birth).';
comment on column public.litter_plan_series.materialized_through is
  'Last recurrence day already covered by materialization.';
comment on column public.litter_plan_series.state is
  'Series lifecycle: active|suspended|completed|cancelled|not_applicable. Distinct from occurrence status.';

create table public.litter_plan_series_time_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  series_id uuid not null,
  slot_no integer not null,
  local_time time without time zone not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_series_time_slots_org_id_key unique (organization_id, id),
  constraint litter_plan_series_time_slots_series_fk
    foreign key (organization_id, series_id)
    references public.litter_plan_series (organization_id, id) on delete cascade,
  constraint litter_plan_series_time_slots_slot_no_check check (slot_no > 0),
  constraint litter_plan_series_time_slots_org_series_slot_key
    unique (organization_id, series_id, slot_no),
  constraint litter_plan_series_time_slots_org_series_time_key
    unique (organization_id, series_id, local_time)
);

create index litter_plan_series_time_slots_series_idx
  on public.litter_plan_series_time_slots (organization_id, series_id, slot_no);

comment on table public.litter_plan_series_time_slots is
  'Immutable local-time slot snapshot for a litter_plan_series (1..8 slots).';

alter table public.litter_plan_series enable row level security;
alter table public.litter_plan_series_time_slots enable row level security;

create policy litter_plan_series_select_member
  on public.litter_plan_series for select to authenticated
  using (public.is_member_of(organization_id));

create policy litter_plan_series_time_slots_select_member
  on public.litter_plan_series_time_slots for select to authenticated
  using (public.is_member_of(organization_id));

revoke all on table public.litter_plan_series from anon, authenticated;
revoke all on table public.litter_plan_series_time_slots from anon, authenticated;
grant select on table public.litter_plan_series to authenticated;
grant select on table public.litter_plan_series_time_slots to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Extend litter_care_tasks for series occurrences
-- ---------------------------------------------------------------------------
alter table public.litter_care_tasks
  add column if not exists litter_plan_series_id uuid,
  add column if not exists recurrence_day_no integer,
  add column if not exists slot_no integer;

alter table public.litter_care_tasks
  drop constraint if exists litter_care_tasks_series_fk;

alter table public.litter_care_tasks
  add constraint litter_care_tasks_series_fk
  foreign key (organization_id, litter_id, litter_plan_series_id)
  references public.litter_plan_series (organization_id, litter_id, id)
  on delete restrict;

alter table public.litter_care_tasks
  drop constraint if exists litter_care_tasks_series_shape_check;

alter table public.litter_care_tasks
  add constraint litter_care_tasks_series_shape_check check (
    (
      litter_plan_series_id is null
      and recurrence_day_no is null
      and slot_no is null
    )
    or (
      litter_plan_series_id is not null
      and item_kind = 'recurring_task'
      and litter_plan_item_id is not null
      and recurrence_day_no is not null
      and recurrence_day_no > 0
      and slot_no is not null
      and slot_no > 0
    )
  );

create unique index if not exists litter_care_tasks_series_occurrence_key
  on public.litter_care_tasks (
    organization_id,
    litter_plan_series_id,
    recurrence_day_no,
    slot_no
  )
  where litter_plan_series_id is not null;

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

comment on column public.litter_care_tasks.litter_plan_series_id is
  'Series owning this recurring occurrence; null for non-series tasks.';
comment on column public.litter_care_tasks.recurrence_day_no is
  '1-based recurrence day index within the series cadence.';
comment on column public.litter_care_tasks.slot_no is
  '1-based local-time slot index within a recurrence day.';

-- ---------------------------------------------------------------------------
-- 6. Append-only command registries for series materialization / state
-- ---------------------------------------------------------------------------
create table public.litter_plan_series_materialization_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid not null,
  series_id uuid not null,
  client_command_id uuid not null,
  payload jsonb not null,
  expected_revision_no integer not null,
  requested_through date not null,
  outcome text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  previous_revision_no integer,
  result_revision_no integer,
  inserted_count integer not null default 0,
  skipped_identical_count integer not null default 0,
  previous_materialized_through date,
  result_materialized_through date,
  previous_materialized_occurrence_count integer,
  result_materialized_occurrence_count integer,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_series_materialization_commands_org_id_key
    unique (organization_id, id),
  constraint litter_plan_series_materialization_commands_org_client_key
    unique (organization_id, client_command_id),
  constraint litter_plan_series_materialization_commands_series_fk
    foreign key (organization_id, series_id)
    references public.litter_plan_series (organization_id, id) on delete restrict,
  constraint litter_plan_series_materialization_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint litter_plan_series_materialization_commands_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint litter_plan_series_materialization_commands_outcome_check
    check (
      (outcome = 'success' and reason is null)
      or (
        outcome = 'error'
        and reason in (
          'not_authenticated', 'not_found', 'membership_required', 'invalid_input',
          'client_command_conflict', 'stale_revision', 'series_not_active',
          'anchor_unavailable', 'schedule_collision', 'schedule_out_of_range'
        )
      )
    ),
  constraint litter_plan_series_materialization_commands_counts_check
    check (inserted_count >= 0 and skipped_identical_count >= 0)
);

create or replace function public.litter_plan_series_materialization_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  raise exception 'litter_plan_series_materialization_commands is append-only'
    using errcode = '55000';
end;
$fn$;

create trigger litter_plan_series_materialization_commands_append_only
before update or delete on public.litter_plan_series_materialization_commands
for each row execute function public.litter_plan_series_materialization_commands_immutable();

alter table public.litter_plan_series_materialization_commands enable row level security;
revoke all on table public.litter_plan_series_materialization_commands from anon, authenticated;
revoke all on function public.litter_plan_series_materialization_commands_immutable() from public;

create table public.litter_plan_series_state_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  litter_plan_id uuid not null,
  series_id uuid not null,
  client_command_id uuid not null,
  payload jsonb not null,
  expected_revision_no integer not null,
  previous_state text not null,
  result_state text,
  reason_text text,
  outcome text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  previous_revision_no integer,
  result_revision_no integer,
  resolved_occurrence_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_series_state_commands_org_id_key unique (organization_id, id),
  constraint litter_plan_series_state_commands_org_client_key
    unique (organization_id, client_command_id),
  constraint litter_plan_series_state_commands_series_fk
    foreign key (organization_id, series_id)
    references public.litter_plan_series (organization_id, id) on delete restrict,
  constraint litter_plan_series_state_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint litter_plan_series_state_commands_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint litter_plan_series_state_commands_outcome_check
    check (
      (outcome = 'success' and reason is null)
      or (
        outcome = 'error'
        and reason in (
          'not_authenticated', 'not_found', 'membership_required', 'invalid_input',
          'client_command_conflict', 'stale_revision', 'invalid_transition'
        )
      )
    ),
  constraint litter_plan_series_state_commands_counts_check
    check (resolved_occurrence_count >= 0)
);

create or replace function public.litter_plan_series_state_commands_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
begin
  raise exception 'litter_plan_series_state_commands is append-only'
    using errcode = '55000';
end;
$fn$;

create trigger litter_plan_series_state_commands_append_only
before update or delete on public.litter_plan_series_state_commands
for each row execute function public.litter_plan_series_state_commands_immutable();

alter table public.litter_plan_series_state_commands enable row level security;
revoke all on table public.litter_plan_series_state_commands from anon, authenticated;
revoke all on function public.litter_plan_series_state_commands_immutable() from public;

comment on table public.litter_plan_series_materialization_commands is
  'Append-only idempotency registry for materialize_litter_plan_series.';
comment on table public.litter_plan_series_state_commands is
  'Append-only idempotency registry for set_litter_plan_series_state.';

-- ---------------------------------------------------------------------------
-- 7. Private materialization helper
-- ---------------------------------------------------------------------------
create or replace function public.litter_plan_series_needs_actual_birth_reconciliation(
  p_organization_id uuid,
  p_series_id uuid,
  p_end_kind text,
  p_series_state text,
  p_ends_on date,
  p_actual_birth_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_end_kind = 'actual_birth'
    and p_actual_birth_date is not null
    and (
      p_series_state not in ('completed', 'cancelled', 'not_applicable')
      or p_ends_on is distinct from p_actual_birth_date
      or exists (
        select 1
        from public.litter_care_tasks t
        where t.organization_id = p_organization_id
          and t.litter_plan_series_id = p_series_id
          and t.status = 'planned'
          and t.planned_for > p_actual_birth_date
      )
    );
$$;

revoke all on function public.litter_plan_series_needs_actual_birth_reconciliation(
  uuid, uuid, text, text, date, date
) from public;

create or replace function public.materialize_litter_plan_series_occurrences(
  p_series_id uuid,
  p_requested_through date,
  p_actor uuid,
  p_command_id uuid default null
)
returns table (
  inserted_count integer,
  skipped_identical_count integer,
  result_materialized_through date,
  result_materialized_occurrence_count integer,
  series_completed boolean,
  completion_reason text,
  data_changed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_series public.litter_plan_series%rowtype;
  v_item public.litter_plan_items%rowtype;
  v_litter public.litters%rowtype;
  v_plan public.litter_plans%rowtype;
  v_template public.litter_care_task_templates%rowtype;
  v_slot record;
  v_slots time[] := '{}'::time[];
  v_slot_count integer;
  v_starts_on date;
  v_ends_on date;
  v_through date;
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
  v_task_id uuid;
  v_resolved_at timestamptz := statement_timestamp();
  v_na_count integer := 0;
  v_data_changed boolean := false;
  v_series_revision_before integer;
  v_series_state_before text;
  v_series_ends_on_before date;
  v_source text;
  v_source_date date;
  v_adjust integer;
  v_anchor date;
begin
  -- 1. Lock series
  select * into v_series
  from public.litter_plan_series s
  where s.id = p_series_id
  for update;

  if not found then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;

  v_series_revision_before := v_series.revision_no;
  v_series_state_before := v_series.state;
  v_series_ends_on_before := v_series.ends_on;

  -- 2. Reread revision (already locked row)
  -- 3. Reread litter + plan item + plan
  select * into v_item
  from public.litter_plan_items i
  where i.organization_id = v_series.organization_id
    and i.id = v_series.litter_plan_item_id
  for update;

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

  select * into v_template
  from public.litter_care_task_templates t
  where t.organization_id = v_item.organization_id
    and t.id = v_item.organization_template_id;

  if v_series.state <> 'active' then
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

  -- 4. Resolve start/end (activate pending anchor when litter anchor becomes available)
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

  if v_starts_on is distinct from v_series.starts_on
    or v_ends_on is distinct from v_series.ends_on
  then
    v_data_changed := true;
  end if;

  update public.litter_plan_series
  set starts_on = v_starts_on,
      ends_on = v_ends_on,
      updated_by = p_actor
  where id = v_series.id
  returning * into v_series;

  -- When actual_birth becomes known, mark planned tasks after birth as not_applicable
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

  -- 5-8. Finite list bound by requested_through, ends_on, absolute_max
  v_through := p_requested_through;
  if v_ends_on is not null and v_through > v_ends_on then
    v_through := v_ends_on;
  end if;

  if v_series.materialized_through is not null
    and v_through <= v_series.materialized_through
    and not public.litter_plan_series_needs_actual_birth_reconciliation(
      v_series.organization_id,
      v_series.id,
      v_series.end_kind,
      v_series.state,
      v_series.ends_on,
      v_litter.actual_birth_date
    )
  then
    -- already covered; still may complete below
    inserted_count := 0;
    skipped_identical_count := 0;
    result_materialized_through := v_series.materialized_through;
    result_materialized_occurrence_count := v_series.materialized_occurrence_count;
  else
    v_day_no := 1;
    loop
      v_occurrence_date := v_starts_on + ((v_day_no - 1) * v_series.recurrence_interval_days);
      exit when v_occurrence_date > v_through;
      exit when v_ends_on is not null and v_occurrence_date > v_ends_on;

      if v_series.end_kind = 'fixed_recurrence_day_count'
        and v_day_no > v_series.recurrence_day_count
      then
        exit;
      end if;

      for v_slot_no in 1..v_slot_count loop
        v_local_time := v_slots[v_slot_no];
        -- 9. Deterministic occurrence_no
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
          -- 11. Never modify existing; 12. refuse inconsistent identity collisions only.
          -- Manual/locked/terminal date changes must not block rematerialization of missing days.
          if v_existing.occurrence_no is distinct from v_occurrence_no
            or v_existing.litter_plan_item_id is distinct from v_item.id
            or v_existing.item_kind is distinct from 'recurring_task'
          then
            raise exception 'schedule_collision' using errcode = '23505';
          end if;
          v_skipped := v_skipped + 1;
        else
          -- Also refuse if the deterministic occurrence_no is already used by another identity.
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

          -- 10. Insert only missing. creation_command_id is unique per org — never reuse the
          -- parent client command id across occurrences.
          begin
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
      -- safety against unbounded loops
      exit when v_day_no > 5000;
    end loop;

    select count(*) into result_materialized_occurrence_count
    from public.litter_care_tasks t
    where t.organization_id = v_series.organization_id
      and t.litter_plan_series_id = v_series.id;

    select max(t.planned_for) into result_materialized_through
    from public.litter_care_tasks t
    where t.organization_id = v_series.organization_id
      and t.litter_plan_series_id = v_series.id
      and t.status <> 'not_applicable';

    if result_materialized_through is null then
      result_materialized_through := v_series.materialized_through;
    end if;

    -- Prefer the last intended recurrence day covered (including NA after birth)
    if v_through is not null then
      -- materialized_through tracks last recurrence day attempted/covered
      if v_series.materialized_through is null or v_through > v_series.materialized_through then
        -- compute last day actually inserted or already present up to through
        select max(v_starts_on + ((t.recurrence_day_no - 1) * v_series.recurrence_interval_days))
        into result_materialized_through
        from public.litter_care_tasks t
        where t.organization_id = v_series.organization_id
          and t.litter_plan_series_id = v_series.id
          and v_starts_on + ((t.recurrence_day_no - 1) * v_series.recurrence_interval_days) <= v_through;
      end if;
    end if;

    update public.litter_plan_series
    set materialized_through = coalesce(result_materialized_through, materialized_through),
        materialized_occurrence_count = result_materialized_occurrence_count,
        updated_by = p_actor
    where id = v_series.id
    returning * into v_series;

    inserted_count := v_inserted;
    skipped_identical_count := v_skipped;
    result_materialized_through := v_series.materialized_through;
    result_materialized_occurrence_count := v_series.materialized_occurrence_count;
    if v_inserted > 0 or v_skipped > 0 then
      v_data_changed := true;
    end if;
  end if;

  -- Complete when end/max prevents further extension
  if v_series.end_kind = 'actual_birth' and v_litter.actual_birth_date is not null then
    v_completed := true;
    v_completion := 'actual_birth_reached';
  elsif v_series.materialized_occurrence_count >= v_series.absolute_max_occurrences then
    v_completed := true;
    v_completion := 'absolute_max_reached';
  elsif v_ends_on is not null
    and v_series.materialized_through is not null
    and v_series.materialized_through >= v_ends_on
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

  if v_completed and v_series.state = 'active' then
    update public.litter_plan_series
    set state = 'completed',
        completion_reason = v_completion,
        updated_by = p_actor
    where id = v_series.id
    returning * into v_series;
    v_data_changed := true;
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
$fn$;

revoke all on function public.materialize_litter_plan_series_occurrences(uuid, date, uuid, uuid) from public;

comment on function public.materialize_litter_plan_series_occurrences(uuid, date, uuid, uuid) is
  'Private helper: lock series, resolve bounds, insert missing occurrences only, never mutate existing rows.';

-- ---------------------------------------------------------------------------
-- 8. Extend assert_litter_planning_model_items + mutate_litter_planning_model
-- ---------------------------------------------------------------------------
create or replace function public.assert_litter_planning_model_items(
  p_organization_id uuid,
  p_species text,
  p_breed text,
  p_items jsonb
)
returns boolean language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_item jsonb;
  v_count integer := 0;
  v_orders integer[] := '{}'::integer[];
  v_keys text[];
  v_kind text;
  v_display_order integer;
  v_starts integer;
  v_ends integer;
  v_slots jsonb;
  v_slot_count integer;
  v_prev_time text;
  v_slot text;
  v_i integer;
  v_end_kind text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    if v_count > 100 or jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;

    if not (
      v_item ? 'organizationTemplateId'
      and v_item ? 'itemKind'
      and v_item ? 'priority'
      and v_item ? 'anchorType'
      and v_item ? 'displayOrder'
      and v_item ? 'isRequired'
      and v_item ? 'isSelectedByDefault'
    ) then
      return false;
    end if;

    if (
      jsonb_typeof(v_item->'organizationTemplateId') <> 'string'
      or jsonb_typeof(v_item->'itemKind') <> 'string'
      or jsonb_typeof(v_item->'priority') <> 'string'
      or jsonb_typeof(v_item->'anchorType') <> 'string'
      or jsonb_typeof(v_item->'displayOrder') <> 'number'
      or jsonb_typeof(v_item->'isRequired') <> 'boolean'
      or jsonb_typeof(v_item->'isSelectedByDefault') <> 'boolean'
    ) then
      return false;
    end if;

    if (
      coalesce(v_item->>'itemKind', '') not in ('milestone', 'task', 'window', 'recurring_task')
      or coalesce(v_item->>'priority', '') not in (
        'normal', 'important', 'organization_critical'
      )
      or coalesce(v_item->>'anchorType', '') not in (
        'first_mating', 'estimated_ovulation', 'expected_birth',
        'actual_birth', 'offspring_age'
      )
      or (v_item->>'organizationTemplateId') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (v_item->>'displayOrder') !~ '^(0|[1-9][0-9]{0,9})$'
    ) then
      return false;
    end if;

    if (v_item->>'displayOrder')::numeric > 2147483647 then
      return false;
    end if;

    if (
      (v_item->>'isRequired')::boolean
      and not (v_item->>'isSelectedByDefault')::boolean
    ) then
      return false;
    end if;

    v_display_order := (v_item->>'displayOrder')::integer;
    if v_display_order = any(v_orders) then
      return false;
    end if;
    v_orders := array_append(v_orders, v_display_order);
    v_kind := v_item->>'itemKind';

    select array_agg(key order by key)
    into v_keys
    from jsonb_object_keys(v_item) as keys(key);

    if v_kind in ('milestone', 'task') then
      if not (
        v_keys <@ array[
          'anchorType', 'displayOrder', 'isRequired', 'isSelectedByDefault',
          'itemKind', 'organizationTemplateId', 'pointLocalTime',
          'pointOffsetDays', 'priority'
        ]
        and v_item ? 'pointOffsetDays'
      ) then
        return false;
      end if;

      if (
        jsonb_typeof(v_item->'pointOffsetDays') <> 'number'
        or (v_item->>'pointOffsetDays') !~ '^-?(0|[1-9][0-9]{0,9})$'
      ) then
        return false;
      end if;

      if (v_item->>'pointOffsetDays')::numeric not between -2147483648 and 2147483647 then
        return false;
      end if;
      if (
        v_item ? 'pointLocalTime'
        and (
          jsonb_typeof(v_item->'pointLocalTime') <> 'string'
          or (v_item->>'pointLocalTime') !~
            '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        )
      ) then
        return false;
      end if;
    elsif v_kind = 'window' then
      if not (
        v_keys <@ array[
          'anchorType', 'displayOrder', 'isRequired', 'isSelectedByDefault',
          'itemKind', 'organizationTemplateId', 'priority',
          'windowEndsLocalTime', 'windowEndsOffsetDays',
          'windowStartsLocalTime', 'windowStartsOffsetDays'
        ]
        and v_item ? 'windowStartsOffsetDays'
        and v_item ? 'windowEndsOffsetDays'
      ) then
        return false;
      end if;

      if (
        jsonb_typeof(v_item->'windowStartsOffsetDays') <> 'number'
        or jsonb_typeof(v_item->'windowEndsOffsetDays') <> 'number'
        or (v_item->>'windowStartsOffsetDays') !~ '^-?(0|[1-9][0-9]{0,9})$'
        or (v_item->>'windowEndsOffsetDays') !~ '^-?(0|[1-9][0-9]{0,9})$'
      ) then
        return false;
      end if;

      if (
        (v_item->>'windowStartsOffsetDays')::numeric
          not between -2147483648 and 2147483647
        or (v_item->>'windowEndsOffsetDays')::numeric
          not between -2147483648 and 2147483647
      ) then
        return false;
      end if;

      if (
        (
          v_item ? 'windowStartsLocalTime'
          and (
            jsonb_typeof(v_item->'windowStartsLocalTime') <> 'string'
            or (v_item->>'windowStartsLocalTime') !~
              '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          )
        )
        or (
          v_item ? 'windowEndsLocalTime'
          and (
            jsonb_typeof(v_item->'windowEndsLocalTime') <> 'string'
            or (v_item->>'windowEndsLocalTime') !~
              '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          )
        )
      ) then
        return false;
      end if;

      v_starts := (v_item->>'windowStartsOffsetDays')::integer;
      v_ends := (v_item->>'windowEndsOffsetDays')::integer;
      if (
        v_starts > v_ends
        or (
          v_starts = v_ends
          and v_item ? 'windowStartsLocalTime'
          and v_item ? 'windowEndsLocalTime'
          and (v_item->>'windowStartsLocalTime')::time
            > (v_item->>'windowEndsLocalTime')::time
        )
      ) then
        return false;
      end if;
    else
      -- recurring_task
      if not (
        v_keys <@ array[
          'absoluteMaxOccurrences', 'anchorType', 'displayOrder',
          'initialMaterializationHorizonDays', 'isRequired', 'isSelectedByDefault',
          'itemKind', 'organizationTemplateId', 'priority',
          'recurrenceDayCount', 'recurrenceEndKind', 'recurrenceEndsOffsetDays',
          'recurrenceIntervalDays', 'recurrenceKind', 'recurrenceStartsOffsetDays',
          'timeSlots'
        ]
        and v_item ? 'recurrenceKind'
        and v_item ? 'recurrenceIntervalDays'
        and v_item ? 'recurrenceStartsOffsetDays'
        and v_item ? 'recurrenceEndKind'
        and v_item ? 'initialMaterializationHorizonDays'
        and v_item ? 'absoluteMaxOccurrences'
        and v_item ? 'timeSlots'
      ) then
        return false;
      end if;

      if (
        coalesce(v_item->>'recurrenceKind', '') <> 'daily_interval'
        or jsonb_typeof(v_item->'recurrenceIntervalDays') <> 'number'
        or jsonb_typeof(v_item->'recurrenceStartsOffsetDays') <> 'number'
        or jsonb_typeof(v_item->'initialMaterializationHorizonDays') <> 'number'
        or jsonb_typeof(v_item->'absoluteMaxOccurrences') <> 'number'
        or (v_item->>'recurrenceIntervalDays') !~ '^(0|[1-9][0-9]{0,9})$'
        or (v_item->>'recurrenceStartsOffsetDays') !~ '^-?(0|[1-9][0-9]{0,9})$'
        or (v_item->>'initialMaterializationHorizonDays') !~ '^(0|[1-9][0-9]{0,9})$'
        or (v_item->>'absoluteMaxOccurrences') !~ '^(0|[1-9][0-9]{0,9})$'
      ) then
        return false;
      end if;

      if (
        (v_item->>'recurrenceIntervalDays')::integer not between 1 and 365
        or (v_item->>'recurrenceStartsOffsetDays')::numeric not between -2147483648 and 2147483647
        or (v_item->>'initialMaterializationHorizonDays')::integer not between 1 and 365
        or (v_item->>'absoluteMaxOccurrences')::integer not between 1 and 500
      ) then
        return false;
      end if;

      v_end_kind := v_item->>'recurrenceEndKind';
      if v_end_kind = 'fixed_end_offset' then
        if (
          not (v_item ? 'recurrenceEndsOffsetDays')
          or v_item ? 'recurrenceDayCount'
          or jsonb_typeof(v_item->'recurrenceEndsOffsetDays') <> 'number'
          or (v_item->>'recurrenceEndsOffsetDays') !~ '^-?(0|[1-9][0-9]{0,9})$'
          or (v_item->>'recurrenceEndsOffsetDays')::numeric not between -2147483648 and 2147483647
          or (v_item->>'recurrenceEndsOffsetDays')::integer
            < (v_item->>'recurrenceStartsOffsetDays')::integer
        ) then
          return false;
        end if;
      elsif v_end_kind = 'fixed_recurrence_day_count' then
        if (
          not (v_item ? 'recurrenceDayCount')
          or v_item ? 'recurrenceEndsOffsetDays'
          or jsonb_typeof(v_item->'recurrenceDayCount') <> 'number'
          or (v_item->>'recurrenceDayCount') !~ '^(0|[1-9][0-9]{0,9})$'
          or (v_item->>'recurrenceDayCount')::integer not between 1 and 500
        ) then
          return false;
        end if;
      elsif v_end_kind = 'actual_birth' then
        if v_item ? 'recurrenceEndsOffsetDays' or v_item ? 'recurrenceDayCount' then
          return false;
        end if;
      else
        return false;
      end if;

      v_slots := v_item->'timeSlots';
      if jsonb_typeof(v_slots) <> 'array' then
        return false;
      end if;
      v_slot_count := jsonb_array_length(v_slots);
      if v_slot_count < 1 or v_slot_count > 8 then
        return false;
      end if;

      v_prev_time := null;
      for v_i in 0..(v_slot_count - 1) loop
        if jsonb_typeof(v_slots->v_i) <> 'string' then
          return false;
        end if;
        v_slot := v_slots->>v_i;
        if v_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
          return false;
        end if;
        if v_prev_time is not null and v_slot::time <= v_prev_time::time then
          return false;
        end if;
        v_prev_time := v_slot;
      end loop;

      if (
        v_end_kind = 'fixed_recurrence_day_count'
        and (v_item->>'recurrenceDayCount')::integer * v_slot_count
          > (v_item->>'absoluteMaxOccurrences')::integer
      ) then
        return false;
      end if;
    end if;

    if not exists (
      select 1
      from public.litter_care_task_templates template
      where template.organization_id = p_organization_id
        and template.id = (v_item->>'organizationTemplateId')::uuid
        and (
          p_species is null
          or template.species = p_species
        )
        and (
          p_breed is null
          or template.breed is null
          or lower(btrim(template.breed)) = lower(btrim(p_breed))
        )
    ) then
      return false;
    end if;
  end loop;

  return true;
end; $$;

revoke all on function public.assert_litter_planning_model_items(uuid, text, text, jsonb) from public;

create or replace function public.mutate_litter_planning_model(
  p_operation text, p_model_id uuid, p_organization_id uuid, p_client_command_id uuid, p_expected_revision integer,
  p_title text, p_description text, p_species text, p_breed text, p_is_active boolean, p_items jsonb
) returns table(outcome text, model_id uuid, revision integer, is_active boolean, replayed boolean, reason text)
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_model public.litter_planning_models%rowtype;
  v_command public.litter_planning_model_commands%rowtype;
  v_payload jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_slot text;
  v_slot_no integer;
  v_slots jsonb;
begin
  outcome := 'error'; model_id := p_model_id; revision := null; is_active := null; replayed := false; reason := null;
  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_operation not in ('create','replace','set_active') or p_client_command_id is null then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then
    select organization.id
    into v_org
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.deleted_at is null;
  else
    select planning_model.organization_id
    into v_org
    from public.litter_planning_models planning_model
    join public.organizations organization
      on organization.id = planning_model.organization_id
     and organization.deleted_at is null
    where planning_model.id = p_model_id;
  end if;
  if not found or v_org is null then reason := 'model_not_found'; return next; return; end if;
  select membership.role
  into v_role
  from public.memberships membership
  where membership.organization_id = v_org
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;
  if not found then reason := 'model_not_found'; return next; return; end if;
  if v_role not in ('owner','admin') then reason := 'membership_required'; return next; return; end if;
  v_payload := jsonb_build_object('operation',p_operation,'modelId',p_model_id,'organizationId',case when p_operation='create' then v_org else null end,'expectedRevision',p_expected_revision,'title',p_title,'description',p_description,'species',p_species,'breed',p_breed,'isActive',p_is_active,'items',coalesce(p_items,'null'::jsonb));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_planning_model_commands:'||v_org::text||':'||p_client_command_id::text,0));
  select * into v_command from public.litter_planning_model_commands where organization_id=v_org and client_command_id=p_client_command_id;
  if found then
    if v_command.operation <> p_operation or v_command.payload <> v_payload then reason := 'client_command_conflict'; return next; return; end if;
    outcome := v_command.outcome; model_id := v_command.model_id; revision := v_command.result_revision; is_active := v_command.result_is_active; reason := v_command.reason; replayed := true; return next; return;
  end if;
  if p_operation in ('create','replace') and (
    p_title is null
    or char_length(btrim(p_title)) not between 1 and 255
    or (p_description is not null and char_length(btrim(p_description)) > 5000)
    or (p_species is not null and p_species not in ('dog','cat'))
    or (p_breed is not null and char_length(btrim(p_breed)) not between 1 and 255)
    or (p_breed is not null and p_species is null)
    or not public.assert_litter_planning_model_items(
      v_org,
      p_species,
      p_breed,
      p_items
    )
  ) then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then
    insert into public.litter_planning_models(organization_id,title,description,species,breed,is_active,revision,created_by,updated_by) values(v_org,btrim(p_title),nullif(btrim(p_description),''),p_species,case when p_breed is null then null else btrim(p_breed) end,coalesce(p_is_active,true),1,v_user_id,v_user_id) returning * into v_model;
  else
    select * into v_model from public.litter_planning_models where organization_id=v_org and id=p_model_id for update;
    if not found then reason := 'model_not_found'; return next; return; end if;
    if p_expected_revision is null or p_expected_revision <= 0 then reason := 'invalid_input'; return next; return; end if;
    if v_model.revision <> p_expected_revision then
      insert into public.litter_planning_model_commands(
        organization_id,model_id,client_command_id,operation,payload,outcome,reason,result_revision,result_is_active,created_by
      ) values (
        v_org,v_model.id,p_client_command_id,p_operation,v_payload,'error','stale_revision',v_model.revision,v_model.is_active,v_user_id
      );
      reason := 'stale_revision'; revision := v_model.revision; is_active := v_model.is_active; return next; return;
    end if;
    if p_operation='replace' then
      update public.litter_planning_models as planning_model set title=btrim(p_title),description=nullif(btrim(p_description),''),species=p_species,breed=case when p_breed is null then null else btrim(p_breed) end,revision=planning_model.revision+1,updated_by=v_user_id where planning_model.id=v_model.id returning planning_model.* into v_model;
      delete from public.litter_planning_model_items as planning_item
      where planning_item.organization_id=v_org
        and planning_item.model_id=v_model.id;
    elsif v_model.is_active is distinct from p_is_active then
      update public.litter_planning_models as planning_model set is_active=p_is_active,revision=planning_model.revision+1,updated_by=v_user_id where planning_model.id=v_model.id returning planning_model.* into v_model;
    end if;
  end if;
  if p_operation in ('create','replace') then
    for v_item in select value from jsonb_array_elements(p_items) loop
      insert into public.litter_planning_model_items(
        organization_id, model_id, organization_template_id, item_kind, priority, anchor_type,
        point_offset_days, point_local_time,
        window_starts_offset_days, window_starts_local_time, window_ends_offset_days, window_ends_local_time,
        recurrence_kind, recurrence_interval_days, recurrence_starts_offset_days, recurrence_end_kind,
        recurrence_ends_offset_days, recurrence_day_count, initial_materialization_horizon_days,
        absolute_max_occurrences, display_order, is_required, is_selected_by_default, created_by, updated_by
      ) values (
        v_org, v_model.id, (v_item->>'organizationTemplateId')::uuid, v_item->>'itemKind', v_item->>'priority', v_item->>'anchorType',
        case when v_item ? 'pointOffsetDays' then (v_item->>'pointOffsetDays')::integer end,
        case when v_item ? 'pointLocalTime' then (v_item->>'pointLocalTime')::time end,
        case when v_item ? 'windowStartsOffsetDays' then (v_item->>'windowStartsOffsetDays')::integer end,
        case when v_item ? 'windowStartsLocalTime' then (v_item->>'windowStartsLocalTime')::time end,
        case when v_item ? 'windowEndsOffsetDays' then (v_item->>'windowEndsOffsetDays')::integer end,
        case when v_item ? 'windowEndsLocalTime' then (v_item->>'windowEndsLocalTime')::time end,
        case when v_item ? 'recurrenceKind' then v_item->>'recurrenceKind' end,
        case when v_item ? 'recurrenceIntervalDays' then (v_item->>'recurrenceIntervalDays')::integer end,
        case when v_item ? 'recurrenceStartsOffsetDays' then (v_item->>'recurrenceStartsOffsetDays')::integer end,
        case when v_item ? 'recurrenceEndKind' then v_item->>'recurrenceEndKind' end,
        case when v_item ? 'recurrenceEndsOffsetDays' then (v_item->>'recurrenceEndsOffsetDays')::integer end,
        case when v_item ? 'recurrenceDayCount' then (v_item->>'recurrenceDayCount')::integer end,
        case when v_item ? 'initialMaterializationHorizonDays' then (v_item->>'initialMaterializationHorizonDays')::integer end,
        case when v_item ? 'absoluteMaxOccurrences' then (v_item->>'absoluteMaxOccurrences')::integer end,
        (v_item->>'displayOrder')::integer, (v_item->>'isRequired')::boolean, (v_item->>'isSelectedByDefault')::boolean,
        v_user_id, v_user_id
      )
      returning id into v_item_id;

      if v_item->>'itemKind' = 'recurring_task' then
        v_slots := v_item->'timeSlots';
        v_slot_no := 0;
        for v_slot in select jsonb_array_elements_text(v_slots) loop
          v_slot_no := v_slot_no + 1;
          insert into public.litter_planning_model_item_time_slots (
            organization_id, model_item_id, slot_no, local_time, created_by
          ) values (
            v_org, v_item_id, v_slot_no, v_slot::time, v_user_id
          );
        end loop;
      end if;
    end loop;
  end if;
  insert into public.litter_planning_model_commands(organization_id,model_id,client_command_id,operation,payload,outcome,result_revision,result_is_active,created_by) values(v_org,v_model.id,p_client_command_id,p_operation,v_payload,'success',v_model.revision,v_model.is_active,v_user_id);
  outcome := 'success'; model_id := v_model.id; revision := v_model.revision; is_active := v_model.is_active; return next;
end; $$;

revoke all on function public.mutate_litter_planning_model(text,uuid,uuid,uuid,integer,text,text,text,text,boolean,jsonb) from public;

-- ---------------------------------------------------------------------------
-- 9. Replace apply_litter_planning_model (FINAL) with recurring support
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
  v_series_id uuid;
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
  v_slot record;
  v_slot_no integer;
  v_mat record;
  v_horizon_through date;
  v_starts_on date;
  v_ends_on date;
  v_occ_count integer;
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
    or not public.is_iana_timezone(p_timezone_name)
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

  -- Recurring items must have 1..8 slots
  if exists (
    select 1
    from public.litter_planning_model_items i
    where i.id = any (v_selected)
      and i.item_kind = 'recurring_task'
      and (
        select count(*) from public.litter_planning_model_item_time_slots s
        where s.organization_id = i.organization_id and s.model_item_id = i.id
      ) not between 1 and 8
  ) then
    reason := 'invalid_selection';
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
      recurrence_kind, recurrence_interval_days, recurrence_starts_offset_days, recurrence_end_kind,
      recurrence_ends_offset_days, recurrence_day_count, initial_materialization_horizon_days,
      absolute_max_occurrences,
      is_required_snapshot, is_selected_by_default_snapshot, display_order, materialization_state,
      materialized_at, created_by, updated_by
    ) values (
      v_org, v_plan.id, p_litter_id, v_model.id, v_model.revision, v_item.id, v_item.display_order,
      v_template.id, v_item.item_kind, v_item.priority, v_template.category, v_template.target_scope,
      v_template.title, v_template.description, v_item.anchor_type, v_source, v_source_date, v_adjust,
      v_anchor, v_item.point_offset_days, v_item.point_local_time, v_item.window_starts_offset_days,
      v_item.window_starts_local_time, v_item.window_ends_offset_days, v_item.window_ends_local_time,
      v_item.recurrence_kind, v_item.recurrence_interval_days, v_item.recurrence_starts_offset_days,
      v_item.recurrence_end_kind, v_item.recurrence_ends_offset_days, v_item.recurrence_day_count,
      v_item.initial_materialization_horizon_days, v_item.absolute_max_occurrences,
      v_item.is_required, v_item.is_selected_by_default, v_next_display_order,
      case when v_anchor is null then 'pending_anchor' else 'materialized' end,
      case when v_anchor is null then null else now() end,
      v_user, v_user
    )
    returning id into v_plan_item_id;

    v_next_display_order := v_next_display_order + 1;

    if v_item.item_kind = 'recurring_task' then
      v_starts_on := case when v_anchor is null then null else v_anchor + v_item.recurrence_starts_offset_days end;
      if v_anchor is null then
        v_ends_on := null;
      elsif v_item.recurrence_end_kind = 'fixed_end_offset' then
        v_ends_on := v_anchor + v_item.recurrence_ends_offset_days;
      elsif v_item.recurrence_end_kind = 'fixed_recurrence_day_count' then
        v_ends_on := v_starts_on + ((v_item.recurrence_day_count - 1) * v_item.recurrence_interval_days);
      elsif v_item.recurrence_end_kind = 'actual_birth' then
        v_ends_on := v_litter.actual_birth_date;
      else
        v_ends_on := null;
      end if;

      insert into public.litter_plan_series (
        organization_id, litter_id, litter_plan_id, litter_plan_item_id,
        recurrence_kind, recurrence_interval_days, starts_on, end_kind, ends_on,
        recurrence_day_count, initial_materialization_horizon_days, absolute_max_occurrences,
        timezone_name, state, created_by, updated_by
      ) values (
        v_org, p_litter_id, v_plan.id, v_plan_item_id,
        v_item.recurrence_kind, v_item.recurrence_interval_days, v_starts_on,
        v_item.recurrence_end_kind, v_ends_on, v_item.recurrence_day_count,
        v_item.initial_materialization_horizon_days, v_item.absolute_max_occurrences,
        v_plan.timezone_name, 'active', v_user, v_user
      )
      returning id into v_series_id;

      v_slot_no := 0;
      for v_slot in
        select s.local_time
        from public.litter_planning_model_item_time_slots s
        where s.organization_id = v_org and s.model_item_id = v_item.id
        order by s.slot_no
      loop
        v_slot_no := v_slot_no + 1;
        insert into public.litter_plan_series_time_slots (
          organization_id, series_id, slot_no, local_time, created_by
        ) values (
          v_org, v_series_id, v_slot_no, v_slot.local_time, v_user
        );
      end loop;

      if v_anchor is null then
        v_pending := v_pending + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'planItemId', v_plan_item_id,
          'state', 'pending_anchor',
          'seriesId', v_series_id,
          'materializedOccurrenceCount', 0
        ));
        continue;
      end if;

      -- Anchor present: materialize initial horizon; do NOT insert a single point task
      v_horizon_through := v_starts_on
        + (v_item.initial_materialization_horizon_days - 1);

      select * into v_mat
      from public.materialize_litter_plan_series_occurrences(
        v_series_id, v_horizon_through, v_user, p_client_command_id
      );

      select s.materialized_occurrence_count into v_occ_count
      from public.litter_plan_series s where s.id = v_series_id;

      v_materialized := v_materialized + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'planItemId', v_plan_item_id,
        'state', 'materialized',
        'seriesId', v_series_id,
        'materializedOccurrenceCount', coalesce(v_occ_count, 0),
        'insertedCount', coalesce(v_mat.inserted_count, 0)
      ));
      continue;
    end if;

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

comment on function public.apply_litter_planning_model(uuid, uuid, uuid, integer, integer, uuid[], text) is
  'Applies a planning model to a litter plan. Recurring items create a series (+ slots) and materialize the initial horizon when the start anchor is known.';

-- ---------------------------------------------------------------------------
-- 10. Public RPC materialize_litter_plan_series
-- ---------------------------------------------------------------------------
create or replace function public.materialize_litter_plan_series(
  p_series_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_requested_through date
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  series_id uuid,
  revision_no integer,
  inserted_count integer,
  skipped_identical_count integer,
  materialized_through date,
  materialized_occurrence_count integer,
  series_state text,
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
  v_series public.litter_plan_series%rowtype;
  v_command public.litter_plan_series_materialization_commands%rowtype;
  v_payload jsonb;
  v_mat record;
  v_command_id uuid := gen_random_uuid();
  v_actual_birth date;
  v_needs_reconcile boolean;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  series_id := p_series_id;
  revision_no := null;
  inserted_count := 0;
  skipped_identical_count := 0;
  materialized_through := null;
  materialized_occurrence_count := null;
  series_state := null;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next; return;
  end if;

  if p_series_id is null
    or p_client_command_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no <= 0
    or p_requested_through is null
  then
    reason := 'invalid_input';
    return next; return;
  end if;

  select s.organization_id into v_org
  from public.litter_plan_series s
  where s.id = p_series_id;
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
    'seriesId', p_series_id,
    'expectedRevisionNo', p_expected_revision_no,
    'requestedThrough', p_requested_through
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_plan_series_materialization_commands:' || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select * into v_command
  from public.litter_plan_series_materialization_commands c
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
    series_id := v_command.series_id;
    revision_no := v_command.result_revision_no;
    inserted_count := v_command.inserted_count;
    skipped_identical_count := v_command.skipped_identical_count;
    materialized_through := v_command.result_materialized_through;
    materialized_occurrence_count := v_command.result_materialized_occurrence_count;
    result := v_command.result;
    select s.state into series_state from public.litter_plan_series s where s.id = v_command.series_id;
    return next; return;
  end if;

  select * into v_series
  from public.litter_plan_series s
  where s.organization_id = v_org and s.id = p_series_id
  for update;
  if not found then
    reason := 'not_found';
    return next; return;
  end if;

  if v_series.revision_no <> p_expected_revision_no then
    insert into public.litter_plan_series_materialization_commands (
      id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
      expected_revision_no, requested_through, outcome, reason, result,
      previous_revision_no, result_revision_no, created_by
    ) values (
      v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
      p_client_command_id, v_payload, p_expected_revision_no, p_requested_through,
      'error', 'stale_revision', jsonb_build_object('revisionNo', v_series.revision_no),
      v_series.revision_no, v_series.revision_no, v_user
    );
    reason := 'stale_revision';
    revision_no := v_series.revision_no;
    series_state := v_series.state;
    return next; return;
  end if;

  if v_series.state <> 'active' then
    insert into public.litter_plan_series_materialization_commands (
      id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
      expected_revision_no, requested_through, outcome, reason, result,
      previous_revision_no, result_revision_no, created_by
    ) values (
      v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
      p_client_command_id, v_payload, p_expected_revision_no, p_requested_through,
      'error', 'series_not_active', jsonb_build_object('state', v_series.state),
      v_series.revision_no, v_series.revision_no, v_user
    );
    reason := 'series_not_active';
    revision_no := v_series.revision_no;
    series_state := v_series.state;
    return next; return;
  end if;

  select l.actual_birth_date into v_actual_birth
  from public.litters l
  where l.organization_id = v_org
    and l.id = v_series.litter_id
  for share;

  v_needs_reconcile := public.litter_plan_series_needs_actual_birth_reconciliation(
    v_org,
    v_series.id,
    v_series.end_kind,
    v_series.state,
    v_series.ends_on,
    v_actual_birth
  );

  -- No-op if already covered (do not bump revision) unless actual_birth reconciliation is required
  if v_series.materialized_through is not null
    and p_requested_through <= v_series.materialized_through
    and not v_needs_reconcile
  then
    result := jsonb_build_object(
      'noop', true,
      'materializedThrough', v_series.materialized_through,
      'materializedOccurrenceCount', v_series.materialized_occurrence_count,
      'seriesState', v_series.state
    );

    insert into public.litter_plan_series_materialization_commands (
      id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
      expected_revision_no, requested_through, outcome, result,
      previous_revision_no, result_revision_no, inserted_count, skipped_identical_count,
      previous_materialized_through, result_materialized_through,
      previous_materialized_occurrence_count, result_materialized_occurrence_count, created_by
    ) values (
      v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
      p_client_command_id, v_payload, p_expected_revision_no, p_requested_through,
      'success', result, p_expected_revision_no, v_series.revision_no, 0, 0,
      v_series.materialized_through, v_series.materialized_through,
      v_series.materialized_occurrence_count, v_series.materialized_occurrence_count, v_user
    );

    outcome := 'success';
    revision_no := v_series.revision_no;
    materialized_through := v_series.materialized_through;
    materialized_occurrence_count := v_series.materialized_occurrence_count;
    series_state := v_series.state;
    return next; return;
  end if;

  begin
    select * into v_mat
    from public.materialize_litter_plan_series_occurrences(
      v_series.id, p_requested_through, v_user, p_client_command_id
    );
  exception
    when others then
      if sqlerrm = 'anchor_unavailable' then reason := 'anchor_unavailable';
      elsif sqlerrm = 'schedule_collision' then reason := 'schedule_collision';
      elsif sqlerrm = 'schedule_out_of_range' then reason := 'schedule_out_of_range';
      elsif sqlerrm = 'series_not_active' then reason := 'series_not_active';
      else reason := 'invalid_input';
      end if;
      insert into public.litter_plan_series_materialization_commands (
        id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
        expected_revision_no, requested_through, outcome, reason, result,
        previous_revision_no, result_revision_no, created_by
      ) values (
        v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
        p_client_command_id, v_payload, p_expected_revision_no, p_requested_through,
        'error', reason, jsonb_build_object('error', sqlerrm),
        v_series.revision_no, v_series.revision_no, v_user
      );
      revision_no := v_series.revision_no;
      series_state := v_series.state;
      return next; return;
  end;

  select * into v_series from public.litter_plan_series s where s.id = p_series_id for update;

  result := jsonb_build_object(
    'insertedCount', v_mat.inserted_count,
    'skippedIdenticalCount', v_mat.skipped_identical_count,
    'materializedThrough', v_series.materialized_through,
    'materializedOccurrenceCount', v_series.materialized_occurrence_count,
    'seriesState', v_series.state,
    'seriesCompleted', v_mat.series_completed,
    'completionReason', v_mat.completion_reason,
    'dataChanged', coalesce(v_mat.data_changed, false)
  );

  insert into public.litter_plan_series_materialization_commands (
    id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
    expected_revision_no, requested_through, outcome, result,
    previous_revision_no, result_revision_no, inserted_count, skipped_identical_count,
    previous_materialized_through, result_materialized_through,
    previous_materialized_occurrence_count, result_materialized_occurrence_count, created_by
  ) values (
    v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
    p_client_command_id, v_payload, p_expected_revision_no, p_requested_through,
    'success', result, p_expected_revision_no, v_series.revision_no,
    v_mat.inserted_count, v_mat.skipped_identical_count,
    null, v_series.materialized_through,
    null, v_series.materialized_occurrence_count, v_user
  );

  outcome := 'success';
  revision_no := v_series.revision_no;
  inserted_count := v_mat.inserted_count;
  skipped_identical_count := v_mat.skipped_identical_count;
  materialized_through := v_series.materialized_through;
  materialized_occurrence_count := v_series.materialized_occurrence_count;
  series_state := v_series.state;
  return next;
end;
$fn$;

revoke all on function public.materialize_litter_plan_series(uuid, uuid, integer, date) from public;
grant execute on function public.materialize_litter_plan_series(uuid, uuid, integer, date) to authenticated;

comment on function public.materialize_litter_plan_series(uuid, uuid, integer, date) is
  'Idempotent RPC: extend materialization of an active litter_plan_series through a requested civil date.';

-- ---------------------------------------------------------------------------
-- 11. Public RPC set_litter_plan_series_state
-- ---------------------------------------------------------------------------
create or replace function public.set_litter_plan_series_state(
  p_series_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_new_state text,
  p_reason text default null
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  series_id uuid,
  revision_no integer,
  series_state text,
  resolved_occurrence_count integer,
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
  v_series public.litter_plan_series%rowtype;
  v_command public.litter_plan_series_state_commands%rowtype;
  v_payload jsonb;
  v_command_id uuid := gen_random_uuid();
  v_prev_state text;
  v_resolved integer := 0;
  v_task public.litter_care_tasks%rowtype;
  v_resolution_status text;
  v_now timestamptz := statement_timestamp();
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  series_id := p_series_id;
  revision_no := null;
  series_state := null;
  resolved_occurrence_count := 0;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next; return;
  end if;

  if p_series_id is null
    or p_client_command_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no <= 0
    or p_new_state is null
    or p_new_state not in ('active', 'suspended', 'completed', 'cancelled', 'not_applicable')
    or (p_reason is not null and char_length(p_reason) > 5000)
  then
    reason := 'invalid_input';
    return next; return;
  end if;

  select s.organization_id into v_org
  from public.litter_plan_series s where s.id = p_series_id;
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
    'seriesId', p_series_id,
    'expectedRevisionNo', p_expected_revision_no,
    'newState', p_new_state,
    'reason', to_jsonb(p_reason)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_plan_series_state_commands:' || v_org::text || ':' || p_client_command_id::text,
      0
    )
  );

  select * into v_command
  from public.litter_plan_series_state_commands c
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
    series_id := v_command.series_id;
    revision_no := v_command.result_revision_no;
    series_state := v_command.result_state;
    resolved_occurrence_count := v_command.resolved_occurrence_count;
    result := v_command.result;
    return next; return;
  end if;

  select * into v_series
  from public.litter_plan_series s
  where s.organization_id = v_org and s.id = p_series_id
  for update;
  if not found then
    reason := 'not_found';
    return next; return;
  end if;

  if v_series.revision_no <> p_expected_revision_no then
    insert into public.litter_plan_series_state_commands (
      id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
      expected_revision_no, previous_state, outcome, reason, result,
      previous_revision_no, result_revision_no, created_by
    ) values (
      v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
      p_client_command_id, v_payload, p_expected_revision_no, v_series.state,
      'error', 'stale_revision', jsonb_build_object('revisionNo', v_series.revision_no),
      v_series.revision_no, v_series.revision_no, v_user
    );
    reason := 'stale_revision';
    revision_no := v_series.revision_no;
    series_state := v_series.state;
    return next; return;
  end if;

  v_prev_state := v_series.state;

  -- Transitions: active↔suspended; active/suspended → completed|cancelled|not_applicable
  -- Terminals not reactivable
  if not (
    (v_prev_state = 'active' and p_new_state in ('suspended', 'completed', 'cancelled', 'not_applicable'))
    or (v_prev_state = 'suspended' and p_new_state in ('active', 'completed', 'cancelled', 'not_applicable'))
  ) then
    insert into public.litter_plan_series_state_commands (
      id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
      expected_revision_no, previous_state, outcome, reason, result,
      previous_revision_no, result_revision_no, created_by
    ) values (
      v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
      p_client_command_id, v_payload, p_expected_revision_no, v_prev_state,
      'error', 'invalid_transition', jsonb_build_object('previousState', v_prev_state, 'newState', p_new_state),
      v_series.revision_no, v_series.revision_no, v_user
    );
    reason := 'invalid_transition';
    revision_no := v_series.revision_no;
    series_state := v_series.state;
    return next; return;
  end if;

  -- suspend / resume / complete: no occurrence changes (complete: no new materialize, don't resolve existing)
  -- cancel: planned → cancelled; not_applicable: planned → not_applicable
  if p_new_state in ('cancelled', 'not_applicable') then
    v_resolution_status := p_new_state;
    for v_task in
      select * from public.litter_care_tasks t
      where t.organization_id = v_org
        and t.litter_plan_series_id = v_series.id
        and t.status = 'planned'
      order by t.id
      for update
    loop
      update public.litter_care_tasks
      set status = v_resolution_status,
          resolution_command_id = gen_random_uuid(),
          resolved_at = v_now,
          resolved_timezone_name = v_series.timezone_name,
          resolved_by = v_user,
          resolution_note = nullif(btrim(p_reason), ''),
          updated_by = v_user
      where id = v_task.id;
      v_resolved := v_resolved + 1;
    end loop;
  end if;

  update public.litter_plan_series
  set state = p_new_state,
      completion_reason = case
        when p_new_state in ('completed', 'cancelled', 'not_applicable')
          then coalesce(nullif(btrim(p_reason), ''), p_new_state)
        else null
      end,
      revision_no = public.litter_plan_series.revision_no + 1,
      updated_by = v_user
  where id = v_series.id
  returning * into v_series;

  result := jsonb_build_object(
    'previousState', v_prev_state,
    'seriesState', v_series.state,
    'resolvedOccurrenceCount', v_resolved
  );

  insert into public.litter_plan_series_state_commands (
    id, organization_id, litter_id, litter_plan_id, series_id, client_command_id, payload,
    expected_revision_no, previous_state, result_state, reason_text, outcome, result,
    previous_revision_no, result_revision_no, resolved_occurrence_count, created_by
  ) values (
    v_command_id, v_org, v_series.litter_id, v_series.litter_plan_id, v_series.id,
    p_client_command_id, v_payload, p_expected_revision_no, v_prev_state, v_series.state,
    nullif(btrim(p_reason), ''), 'success', result,
    p_expected_revision_no, v_series.revision_no, v_resolved, v_user
  );

  outcome := 'success';
  revision_no := v_series.revision_no;
  series_state := v_series.state;
  resolved_occurrence_count := v_resolved;
  return next;
end;
$fn$;

revoke all on function public.set_litter_plan_series_state(uuid, uuid, integer, text, text) from public;
grant execute on function public.set_litter_plan_series_state(uuid, uuid, integer, text, text) to authenticated;

comment on function public.set_litter_plan_series_state(uuid, uuid, integer, text, text) is
  'Idempotent RPC: transition litter_plan_series state. Cancel/not_applicable resolve planned occurrences with audit fields.';

-- ---------------------------------------------------------------------------
-- 12. Extend update_litter_gestation_anchors_and_recalculate_plan for recurring
-- ---------------------------------------------------------------------------
alter table public.litter_plan_anchor_recalculation_commands
  add column if not exists recalculated_series_count integer not null default 0,
  add column if not exists changed_series_occurrence_count integer not null default 0,
  add column if not exists moved_series_automatic_schedule_count integer not null default 0,
  add column if not exists preserved_series_manual_schedule_count integer not null default 0,
  add column if not exists preserved_series_locked_schedule_count integer not null default 0,
  add column if not exists preserved_series_terminal_count integer not null default 0,
  add column if not exists unchanged_series_occurrence_count integer not null default 0;

alter table public.litter_plan_anchor_recalculation_commands
  drop constraint if exists litter_plan_anchor_recalculation_commands_counts_check;

alter table public.litter_plan_anchor_recalculation_commands
  add constraint litter_plan_anchor_recalculation_commands_counts_check
  check (
    recalculated_item_count >= 0
    and changed_task_count >= 0
    and moved_automatic_schedule_count >= 0
    and preserved_manual_schedule_count >= 0
    and preserved_locked_schedule_count >= 0
    and preserved_terminal_count >= 0
    and unchanged_task_count >= 0
    and recalculated_series_count >= 0
    and changed_series_occurrence_count >= 0
    and moved_series_automatic_schedule_count >= 0
    and preserved_series_manual_schedule_count >= 0
    and preserved_series_locked_schedule_count >= 0
    and preserved_series_terminal_count >= 0
    and unchanged_series_occurrence_count >= 0
  );

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

    perform s.id from public.litter_plan_series s
    where s.organization_id = v_org and s.litter_plan_id = v_plan.id
    order by s.id for update;

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
  'Atomically updates litter estimated_ovulation_date / expected_birth_date and recalculates active plan anchors, including recurring series schedules.';


-- ---------------------------------------------------------------------------
-- Patch resolve_litter_care_task to use fast IANA timezone validation
-- ---------------------------------------------------------------------------
create or replace function public.resolve_litter_care_task(
  p_task_id uuid,
  p_client_command_id uuid,
  p_resolution_status text,
  p_resolved_at timestamptz,
  p_timezone_name text,
  p_resolution_note text
)
returns table (
  outcome text,
  task_id uuid,
  litter_id uuid,
  status text,
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
  v_task_organization_id uuid;
  v_membership_role text;
  v_task public.litter_care_tasks%rowtype;
  v_replayed_task public.litter_care_tasks%rowtype;
begin
  outcome := 'error';
  task_id := p_task_id;
  litter_id := null;
  status := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_task_id is null
    or p_client_command_id is null
    or p_resolution_status is null
    or p_resolved_at is null
    or p_timezone_name is null
    or (p_resolution_note is not null and char_length(p_resolution_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select task.organization_id
  into v_task_organization_id
  from public.litter_care_tasks task
  where task.id = p_task_id;

  if not found then
    reason := 'task_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_task_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'task_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_task_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_replayed_task
  from public.litter_care_tasks task
  where task.organization_id = v_task_organization_id
    and task.resolution_command_id = p_client_command_id;

  if found then
    if v_replayed_task.id <> p_task_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    task_id := v_replayed_task.id;
    litter_id := v_replayed_task.litter_id;
    status := v_replayed_task.status;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_task
  from public.litter_care_tasks task
  where task.organization_id = v_task_organization_id
    and task.id = p_task_id
  for update;

  if not found then
    reason := 'task_not_found';
    return next;
    return;
  end if;

  if v_task.status <> 'planned' then
    reason := 'task_not_planned';
    return next;
    return;
  end if;

  if p_resolution_status not in ('done', 'cancelled', 'not_applicable') then
    reason := 'invalid_resolution_status';
    return next;
    return;
  end if;

  if not public.is_iana_timezone(p_timezone_name) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  update public.litter_care_tasks
  set
    status = p_resolution_status,
    resolution_command_id = p_client_command_id,
    resolved_at = p_resolved_at,
    resolved_timezone_name = p_timezone_name,
    resolved_by = v_user_id,
    resolution_note = nullif(btrim(p_resolution_note), ''),
    updated_by = v_user_id
  where id = v_task.id
  returning
    litter_care_tasks.id,
    litter_care_tasks.litter_id,
    litter_care_tasks.status
  into task_id, litter_id, status;

  outcome := 'success';
  return next;
end;
$$;

revoke all on function public.resolve_litter_care_task(
  uuid, uuid, text, timestamptz, text, text
) from public;
grant execute on function public.resolve_litter_care_task(
  uuid, uuid, text, timestamptz, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Patch execute_litter_care_task_schedule_command timezone validation
-- ---------------------------------------------------------------------------
create or replace function public.execute_litter_care_task_schedule_command(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_command_type text,
  p_planned_for date default null,
  p_scheduled_local_time time without time zone default null,
  p_retained_starts_on date default null,
  p_retained_starts_local_time time without time zone default null,
  p_retained_ends_on date default null,
  p_retained_ends_local_time time without time zone default null,
  p_schedule_timezone_name text default null,
  p_reason text default null
)
returns table (
  outcome text,
  task_id uuid,
  litter_id uuid,
  revision_no integer,
  change_id uuid,
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
  v_organization_id uuid;
  v_role text;
  v_task public.litter_care_tasks%rowtype;
  v_after public.litter_care_tasks%rowtype;
  v_command public.litter_care_task_schedule_commands%rowtype;
  v_command_id uuid;
  v_payload jsonb;
  v_result jsonb;
  v_reason text := nullif(btrim(p_reason), '');
  v_timezone_name text := nullif(btrim(p_schedule_timezone_name), '');
  v_failure text;
  v_locked_override boolean := p_command_type in (
    'replace_locked_point', 'replace_locked_window'
  );
begin
  outcome := 'error';
  task_id := p_task_id;
  litter_id := null;
  revision_no := null;
  change_id := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated'; return next; return;
  end if;

  if p_task_id is null
    or p_client_command_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 0
    or p_command_type not in (
      'reschedule_point', 'replace_locked_point',
      'reschedule_window', 'replace_locked_window',
      'lock', 'unlock', 'reapply_suggestion'
    )
    or (v_reason is not null and char_length(v_reason) > 500) then
    reason := 'invalid_input'; return next; return;
  end if;

  if p_command_type in ('reschedule_point', 'replace_locked_point')
    and (
      p_planned_for is null
      or p_retained_starts_on is not null
      or p_retained_starts_local_time is not null
      or p_retained_ends_on is not null
      or p_retained_ends_local_time is not null
    ) then
    reason := 'invalid_input'; return next; return;
  end if;

  if p_command_type in ('reschedule_window', 'replace_locked_window')
    and (
      p_planned_for is not null
      or p_scheduled_local_time is not null
      or p_retained_starts_on is null
      or p_retained_ends_on is null
      or p_retained_starts_on > p_retained_ends_on
      or (
        p_retained_starts_on = p_retained_ends_on
        and p_retained_starts_local_time is not null
        and p_retained_ends_local_time is not null
        and p_retained_starts_local_time > p_retained_ends_local_time
      )
    ) then
    reason := 'invalid_input'; return next; return;
  end if;

  if p_command_type in ('lock', 'unlock', 'reapply_suggestion')
    and (
      p_planned_for is not null
      or p_scheduled_local_time is not null
      or p_retained_starts_on is not null
      or p_retained_starts_local_time is not null
      or p_retained_ends_on is not null
      or p_retained_ends_local_time is not null
      or v_timezone_name is not null
    ) then
    reason := 'invalid_input'; return next; return;
  end if;

  if (
    p_scheduled_local_time is not null
    or p_retained_starts_local_time is not null
    or p_retained_ends_local_time is not null
  ) and v_timezone_name is null then
    reason := 'invalid_timezone'; return next; return;
  end if;

  if v_timezone_name is not null and not public.is_iana_timezone(v_timezone_name) then
    reason := 'invalid_timezone'; return next; return;
  end if;

  select task.organization_id
  into v_organization_id
  from public.litter_care_tasks task
  where task.id = p_task_id;
  if not found then
    reason := 'task_not_found'; return next; return;
  end if;

  select membership.role
  into v_role
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;
  if not found then
    reason := 'task_not_found'; return next; return;
  end if;
  if v_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required'; return next; return;
  end if;

  v_payload := jsonb_build_object(
    'taskId', p_task_id,
    'expectedRevisionNo', p_expected_revision_no,
    'commandType', p_command_type,
    'plannedFor', p_planned_for,
    'scheduledLocalTime', p_scheduled_local_time,
    'retainedStartsOn', p_retained_starts_on,
    'retainedStartsLocalTime', p_retained_starts_local_time,
    'retainedEndsOn', p_retained_ends_on,
    'retainedEndsLocalTime', p_retained_ends_local_time,
    'timezoneName', v_timezone_name,
    'reason', v_reason
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_schedule:' || v_organization_id::text
      || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_command
  from public.litter_care_task_schedule_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id
  for update;
  if found then
    if v_command.payload is distinct from v_payload then
      reason := 'client_command_conflict'; return next; return;
    end if;
    outcome := v_command.outcome;
    litter_id := v_command.litter_id;
    revision_no := nullif(v_command.result ->> 'revisionNo', '')::integer;
    change_id := nullif(v_command.result ->> 'changeId', '')::uuid;
    replayed := true;
    reason := v_command.reason;
    return next; return;
  end if;

  select task.*
  into v_task
  from public.litter_care_tasks task
  join public.litters litter
    on litter.organization_id = task.organization_id
   and litter.id = task.litter_id
  where task.organization_id = v_organization_id
    and task.id = p_task_id
    and litter.deleted_at is null
  for update of task;
  if not found then
    reason := 'task_not_found'; return next; return;
  end if;
  litter_id := v_task.litter_id;

  if v_task.revision_no <> p_expected_revision_no then
    v_failure := 'stale_revision';
  elsif v_task.status <> 'planned' then
    v_failure := 'task_not_planned';
  elsif p_command_type in ('reschedule_point', 'replace_locked_point')
    and v_task.item_kind not in ('milestone', 'task', 'recurring_task') then
    v_failure := 'invalid_item_kind';
  elsif p_command_type in ('reschedule_window', 'replace_locked_window')
    and v_task.item_kind <> 'window' then
    v_failure := 'invalid_item_kind';
  elsif p_command_type in ('reschedule_point', 'reschedule_window', 'reapply_suggestion')
    and v_task.is_schedule_locked then
    v_failure := 'schedule_locked';
  elsif v_locked_override and not v_task.is_schedule_locked then
    v_failure := 'schedule_not_locked';
  elsif p_command_type = 'lock' and v_task.is_schedule_locked then
    v_failure := 'schedule_locked';
  elsif p_command_type = 'unlock' and not v_task.is_schedule_locked then
    v_failure := 'schedule_not_locked';
  elsif p_command_type = 'reapply_suggestion'
    and (
      (v_task.item_kind in ('milestone', 'task', 'recurring_task')
       and v_task.suggested_for is null)
      or (
        v_task.item_kind = 'window'
        and (
          v_task.suggested_starts_on is null
          or v_task.suggested_ends_on is null
        )
      )
    ) then
    v_failure := 'suggestion_missing';
  end if;

  if v_failure is not null then
    v_result := jsonb_build_object(
      'taskId', v_task.id,
      'litterId', v_task.litter_id,
      'revisionNo', v_task.revision_no
    );
    insert into public.litter_care_task_schedule_commands (
      organization_id, task_id, litter_id, client_command_id,
      command_type, payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_task.id, v_task.litter_id, p_client_command_id,
      p_command_type, v_payload, 'error', v_result, v_failure, v_user_id
    );
    revision_no := v_task.revision_no;
    reason := v_failure;
    return next; return;
  end if;

  perform pg_catalog.set_config('app.litter_care_task_schedule_rpc', 'on', true);

  if p_command_type in ('reschedule_point', 'replace_locked_point') then
    update public.litter_care_tasks
    set
      planned_for = p_planned_for,
      scheduled_local_time = p_scheduled_local_time,
      schedule_timezone_name = case
        when p_scheduled_local_time is not null then v_timezone_name
        when suggested_local_time is not null then schedule_timezone_name
        else null
      end,
      schedule_source = 'manual',
      revision_no = public.litter_care_tasks.revision_no + 1,
      updated_by = v_user_id
    where id = v_task.id
    returning * into v_after;
  elsif p_command_type in ('reschedule_window', 'replace_locked_window') then
    update public.litter_care_tasks
    set
      retained_starts_on = p_retained_starts_on,
      retained_starts_local_time = p_retained_starts_local_time,
      retained_ends_on = p_retained_ends_on,
      retained_ends_local_time = p_retained_ends_local_time,
      schedule_timezone_name = case
        when p_retained_starts_local_time is not null
          or p_retained_ends_local_time is not null
          then v_timezone_name
        when suggested_starts_local_time is not null
          or suggested_ends_local_time is not null
          then schedule_timezone_name
        else null
      end,
      schedule_source = 'manual',
      revision_no = public.litter_care_tasks.revision_no + 1,
      updated_by = v_user_id
    where id = v_task.id
    returning * into v_after;
  elsif p_command_type = 'lock' then
    update public.litter_care_tasks
    set
      is_schedule_locked = true,
      schedule_locked_at = statement_timestamp(),
      schedule_locked_by = v_user_id,
      revision_no = public.litter_care_tasks.revision_no + 1,
      updated_by = v_user_id
    where id = v_task.id
    returning * into v_after;
  elsif p_command_type = 'unlock' then
    update public.litter_care_tasks
    set
      is_schedule_locked = false,
      schedule_locked_at = null,
      schedule_locked_by = null,
      revision_no = public.litter_care_tasks.revision_no + 1,
      updated_by = v_user_id
    where id = v_task.id
    returning * into v_after;
  elsif p_command_type = 'reapply_suggestion' then
    if v_task.item_kind = 'window' then
      update public.litter_care_tasks
      set
        retained_starts_on = suggested_starts_on,
        retained_starts_local_time = suggested_starts_local_time,
        retained_ends_on = suggested_ends_on,
        retained_ends_local_time = suggested_ends_local_time,
        schedule_timezone_name = case
          when suggested_starts_local_time is not null
            or suggested_ends_local_time is not null
            then schedule_timezone_name
          else null
        end,
        schedule_source = 'suggested',
        revision_no = public.litter_care_tasks.revision_no + 1,
        updated_by = v_user_id
      where id = v_task.id
      returning * into v_after;
    else
      update public.litter_care_tasks
      set
        planned_for = suggested_for,
        scheduled_local_time = suggested_local_time,
        schedule_timezone_name = case
          when suggested_local_time is not null then schedule_timezone_name
          else null
        end,
        schedule_source = 'suggested',
        revision_no = public.litter_care_tasks.revision_no + 1,
        updated_by = v_user_id
      where id = v_task.id
      returning * into v_after;
    end if;
  end if;

  v_result := jsonb_build_object(
    'taskId', v_after.id,
    'litterId', v_after.litter_id,
    'revisionNo', v_after.revision_no
  );
  v_command_id := gen_random_uuid();
  change_id := gen_random_uuid();
  v_result := v_result || jsonb_build_object('changeId', change_id);

  insert into public.litter_care_task_schedule_commands (
    id,
    organization_id, task_id, litter_id, client_command_id,
    command_type, payload, outcome, result, reason, created_by
  ) values (
    v_command_id,
    v_organization_id, v_after.id, v_after.litter_id, p_client_command_id,
    p_command_type, v_payload, 'success', v_result, null, v_user_id
  );

  insert into public.litter_care_task_schedule_changes (
    id,
    organization_id, task_id, litter_id, command_id, change_type,
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
    locked_override_confirmed, reason, before_snapshot, after_snapshot,
    changed_by
  ) values (
    change_id,
    v_organization_id, v_after.id, v_after.litter_id, v_command_id, p_command_type,
    p_expected_revision_no, v_task.revision_no, v_after.revision_no,
    v_task.suggested_for, v_after.suggested_for,
    v_task.suggested_local_time, v_after.suggested_local_time,
    v_task.planned_for, v_after.planned_for,
    v_task.scheduled_local_time, v_after.scheduled_local_time,
    v_task.schedule_timezone_name, v_after.schedule_timezone_name,
    v_task.suggested_starts_on, v_after.suggested_starts_on,
    v_task.suggested_starts_local_time, v_after.suggested_starts_local_time,
    v_task.suggested_ends_on, v_after.suggested_ends_on,
    v_task.suggested_ends_local_time, v_after.suggested_ends_local_time,
    v_task.retained_starts_on, v_after.retained_starts_on,
    v_task.retained_starts_local_time, v_after.retained_starts_local_time,
    v_task.retained_ends_on, v_after.retained_ends_on,
    v_task.retained_ends_local_time, v_after.retained_ends_local_time,
    v_task.schedule_source, v_after.schedule_source,
    v_task.is_schedule_locked, v_after.is_schedule_locked,
    v_locked_override, v_reason,
    public.litter_care_task_schedule_snapshot(v_task),
    public.litter_care_task_schedule_snapshot(v_after),
    v_user_id
  );

  outcome := 'success';
  task_id := v_after.id;
  litter_id := v_after.litter_id;
  revision_no := v_after.revision_no;
  replayed := false;
  reason := null;
  return next;
end;
$$;

revoke all on function public.execute_litter_care_task_schedule_command(
  uuid, uuid, integer, text, date, time without time zone,
  date, time without time zone, date, time without time zone, text, text
) from public;

comment on function public.execute_litter_care_task_schedule_command(
  uuid, uuid, integer, text, date, time without time zone,
  date, time without time zone, date, time without time zone, text, text
) is
  'Internal schedule command executor. Recurring occurrences use the same point schedule path as milestone/task.';

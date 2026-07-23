alter table public.litter_care_tasks
  alter column planned_for drop not null,
  add column item_kind text not null default 'task',
  add column priority text not null default 'normal',
  add column suggested_for date,
  add column suggested_local_time time without time zone,
  add column scheduled_local_time time without time zone,
  add column schedule_timezone_name text,
  add column suggested_starts_on date,
  add column suggested_starts_local_time time without time zone,
  add column suggested_ends_on date,
  add column suggested_ends_local_time time without time zone,
  add column retained_starts_on date,
  add column retained_starts_local_time time without time zone,
  add column retained_ends_on date,
  add column retained_ends_local_time time without time zone,
  add column schedule_source text not null default 'manual',
  add column is_schedule_locked boolean not null default false,
  add column schedule_locked_at timestamptz,
  add column schedule_locked_by uuid,
  add column revision_no integer not null default 0;

alter table public.litter_care_tasks
  disable trigger litter_care_tasks_set_updated_at;

update public.litter_care_tasks
set
  item_kind = 'task',
  priority = 'normal',
  suggested_for = case when source = 'manual' then null else planned_for end,
  suggested_local_time = null,
  scheduled_local_time = null,
  schedule_timezone_name = null,
  suggested_starts_on = null,
  suggested_starts_local_time = null,
  suggested_ends_on = null,
  suggested_ends_local_time = null,
  retained_starts_on = null,
  retained_starts_local_time = null,
  retained_ends_on = null,
  retained_ends_local_time = null,
  schedule_source = case when source = 'manual' then 'manual' else 'suggested' end,
  is_schedule_locked = false,
  schedule_locked_at = null,
  schedule_locked_by = null,
  revision_no = 0;

alter table public.litter_care_tasks
  enable trigger litter_care_tasks_set_updated_at;

alter table public.litter_care_tasks
  add constraint litter_care_tasks_item_kind_check
    check (item_kind in ('milestone', 'task', 'window', 'recurring_task')),
  add constraint litter_care_tasks_priority_check
    check (priority in ('normal', 'important', 'organization_critical')),
  add constraint litter_care_tasks_schedule_source_check
    check (schedule_source in ('suggested', 'manual')),
  add constraint litter_care_tasks_revision_no_check
    check (revision_no >= 0),
  add constraint litter_care_tasks_schedule_timezone_name_check
    check (
      schedule_timezone_name is null
      or (
        schedule_timezone_name = btrim(schedule_timezone_name)
        and char_length(schedule_timezone_name) between 1 and 255
      )
    ),
  add constraint litter_care_tasks_schedule_time_timezone_check
    check (
      (
        suggested_local_time is null
        and scheduled_local_time is null
        and suggested_starts_local_time is null
        and suggested_ends_local_time is null
        and retained_starts_local_time is null
        and retained_ends_local_time is null
      )
      or schedule_timezone_name is not null
    ),
  add constraint litter_care_tasks_point_schedule_check
    check (
      (
        item_kind in ('milestone', 'task', 'recurring_task')
        and planned_for is not null
        and (suggested_local_time is null or suggested_for is not null)
        and suggested_starts_on is null
        and suggested_starts_local_time is null
        and suggested_ends_on is null
        and suggested_ends_local_time is null
        and retained_starts_on is null
        and retained_starts_local_time is null
        and retained_ends_on is null
        and retained_ends_local_time is null
      )
      or (
        item_kind = 'window'
        and planned_for is null
        and suggested_for is null
        and suggested_local_time is null
        and scheduled_local_time is null
        and retained_starts_on is not null
        and retained_ends_on is not null
        and (
          retained_starts_on < retained_ends_on
          or (
            retained_starts_on = retained_ends_on
            and (
              retained_starts_local_time is null
              or retained_ends_local_time is null
              or retained_starts_local_time <= retained_ends_local_time
            )
          )
        )
        and (
          (
            suggested_starts_on is null
            and suggested_starts_local_time is null
            and suggested_ends_on is null
            and suggested_ends_local_time is null
          )
          or (
            suggested_starts_on is not null
            and suggested_ends_on is not null
            and (
              suggested_starts_on < suggested_ends_on
              or (
                suggested_starts_on = suggested_ends_on
                and (
                  suggested_starts_local_time is null
                  or suggested_ends_local_time is null
                  or suggested_starts_local_time <= suggested_ends_local_time
                )
              )
            )
          )
        )
      )
    ),
  add constraint litter_care_tasks_schedule_lock_check
    check (
      (
        is_schedule_locked = false
        and schedule_locked_at is null
        and schedule_locked_by is null
      )
      or (
        is_schedule_locked = true
        and schedule_locked_at is not null
        and pg_catalog.isfinite(schedule_locked_at)
        and schedule_locked_by is not null
      )
    ),
  add constraint litter_care_tasks_schedule_locked_by_membership_fk
    foreign key (organization_id, schedule_locked_by)
    references public.memberships (organization_id, profile_id) on delete restrict;

comment on column public.litter_care_tasks.priority is
  'Organizational priority only; it carries no medical or clinical meaning.';

create or replace function public.initialize_litter_care_task_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  new.item_kind := coalesce(new.item_kind, 'task');
  new.priority := coalesce(new.priority, 'normal');
  new.revision_no := coalesce(new.revision_no, 0);
  new.is_schedule_locked := coalesce(new.is_schedule_locked, false);

  if new.source = 'manual' then
    new.schedule_source := 'manual';
    new.suggested_for := null;
  elsif new.item_kind in ('milestone', 'task', 'recurring_task') then
    new.schedule_source := 'suggested';
    new.suggested_for := coalesce(new.suggested_for, new.planned_for);
  end if;

  return new;
end;
$$;

create trigger litter_care_tasks_initialize_schedule
before insert on public.litter_care_tasks
for each row execute function public.initialize_litter_care_task_schedule();

create or replace function public.validate_litter_care_task_schedule_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.schedule_timezone_name is not null
    and not exists (
      select 1
      from pg_catalog.pg_timezone_names timezone
      where timezone.name = new.schedule_timezone_name
    ) then
    raise exception 'litter care task schedule timezone must be an IANA timezone'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_care_tasks_validate_schedule_timezone
before insert or update of schedule_timezone_name
on public.litter_care_tasks
for each row execute function public.validate_litter_care_task_schedule_timezone();

create table public.litter_care_task_schedule_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null,
  litter_id uuid not null,
  client_command_id uuid not null,
  command_type text not null,
  payload jsonb not null,
  outcome text not null,
  result jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_care_task_schedule_commands_organization_id_id_key
    unique (organization_id, id),
  constraint litter_care_task_schedule_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint litter_care_task_schedule_commands_task_organization_fk
    foreign key (organization_id, task_id)
    references public.litter_care_tasks (organization_id, id) on delete restrict,
  constraint litter_care_task_schedule_commands_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_care_task_schedule_commands_type_check
    check (command_type in (
      'reschedule_point', 'replace_locked_point',
      'reschedule_window', 'replace_locked_window',
      'lock', 'unlock', 'reapply_suggestion'
    )),
  constraint litter_care_task_schedule_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint litter_care_task_schedule_commands_outcome_check
    check (
      (outcome = 'success' and reason is null)
      or (
        outcome = 'error'
        and reason in (
          'stale_revision', 'task_not_planned', 'schedule_locked',
          'schedule_not_locked', 'invalid_item_kind', 'suggestion_missing'
        )
      )
    ),
  constraint litter_care_task_schedule_commands_result_check
    check (jsonb_typeof(result) = 'object')
);

create table public.litter_care_task_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null,
  litter_id uuid not null,
  command_id uuid not null,
  change_type text not null,
  expected_revision_no integer not null,
  previous_revision_no integer not null,
  result_revision_no integer not null,
  previous_suggested_for date,
  result_suggested_for date,
  previous_suggested_local_time time without time zone,
  result_suggested_local_time time without time zone,
  previous_planned_for date,
  result_planned_for date,
  previous_scheduled_local_time time without time zone,
  result_scheduled_local_time time without time zone,
  previous_timezone_name text,
  result_timezone_name text,
  previous_suggested_starts_on date,
  result_suggested_starts_on date,
  previous_suggested_starts_local_time time without time zone,
  result_suggested_starts_local_time time without time zone,
  previous_suggested_ends_on date,
  result_suggested_ends_on date,
  previous_suggested_ends_local_time time without time zone,
  result_suggested_ends_local_time time without time zone,
  previous_retained_starts_on date,
  result_retained_starts_on date,
  previous_retained_starts_local_time time without time zone,
  result_retained_starts_local_time time without time zone,
  previous_retained_ends_on date,
  result_retained_ends_on date,
  previous_retained_ends_local_time time without time zone,
  result_retained_ends_local_time time without time zone,
  previous_schedule_source text not null,
  result_schedule_source text not null,
  previous_is_schedule_locked boolean not null,
  result_is_schedule_locked boolean not null,
  locked_override_confirmed boolean not null default false,
  reason text,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_care_task_schedule_changes_organization_id_id_key
    unique (organization_id, id),
  constraint litter_care_task_schedule_changes_command_key unique (command_id),
  constraint litter_care_task_schedule_changes_command_organization_fk
    foreign key (organization_id, command_id)
    references public.litter_care_task_schedule_commands (organization_id, id) on delete restrict,
  constraint litter_care_task_schedule_changes_task_organization_fk
    foreign key (organization_id, task_id)
    references public.litter_care_tasks (organization_id, id) on delete restrict,
  constraint litter_care_task_schedule_changes_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_care_task_schedule_changes_type_check
    check (change_type in (
      'reschedule_point', 'replace_locked_point',
      'reschedule_window', 'replace_locked_window',
      'lock', 'unlock', 'reapply_suggestion'
    )),
  constraint litter_care_task_schedule_changes_revision_check
    check (
      expected_revision_no >= 0
      and previous_revision_no >= 0
      and expected_revision_no = previous_revision_no
      and result_revision_no = previous_revision_no + 1
    ),
  constraint litter_care_task_schedule_changes_source_check
    check (
      previous_schedule_source in ('suggested', 'manual')
      and result_schedule_source in ('suggested', 'manual')
    ),
  constraint litter_care_task_schedule_changes_override_check
    check (
      locked_override_confirmed
      = (change_type in ('replace_locked_point', 'replace_locked_window'))
    ),
  constraint litter_care_task_schedule_changes_reason_check
    check (
      reason is null
      or (
        reason = btrim(reason)
        and char_length(reason) between 1 and 500
      )
    ),
  constraint litter_care_task_schedule_changes_snapshots_check
    check (
      jsonb_typeof(before_snapshot) = 'object'
      and jsonb_typeof(after_snapshot) = 'object'
    )
);

create index litter_care_task_schedule_commands_task_created_at_idx
  on public.litter_care_task_schedule_commands (
    organization_id, task_id, created_at, id
  );

create index litter_care_task_schedule_changes_task_changed_at_idx
  on public.litter_care_task_schedule_changes (
    organization_id, task_id, changed_at, id
  );

alter table public.litter_care_task_schedule_commands enable row level security;
alter table public.litter_care_task_schedule_changes enable row level security;

revoke all on table public.litter_care_task_schedule_commands from anon, authenticated;
revoke all on table public.litter_care_task_schedule_changes from anon, authenticated;

create or replace function public.prevent_litter_care_task_schedule_registry_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'litter care task schedule registries are append-only'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger litter_care_task_schedule_commands_append_only
before update or delete on public.litter_care_task_schedule_commands
for each row execute function public.prevent_litter_care_task_schedule_registry_mutation();

create trigger litter_care_task_schedule_changes_append_only
before update or delete on public.litter_care_task_schedule_changes
for each row execute function public.prevent_litter_care_task_schedule_registry_mutation();

create or replace function public.litter_care_task_schedule_snapshot(
  p_task public.litter_care_tasks
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'itemKind', p_task.item_kind,
    'priority', p_task.priority,
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
    'revisionNo', p_task.revision_no
  );
$$;

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

  if v_timezone_name is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names timezone
    where timezone.name = v_timezone_name
  ) then
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

create or replace function public.reschedule_litter_care_task_point(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_planned_for date,
  p_scheduled_local_time time without time zone,
  p_schedule_timezone_name text,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    'reschedule_point', p_planned_for, p_scheduled_local_time,
    null, null, null, null, p_schedule_timezone_name, p_reason
  );
$$;

create or replace function public.replace_locked_litter_care_task_point_schedule(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_planned_for date,
  p_scheduled_local_time time without time zone,
  p_schedule_timezone_name text,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    'replace_locked_point', p_planned_for, p_scheduled_local_time,
    null, null, null, null, p_schedule_timezone_name, p_reason
  );
$$;

create or replace function public.reschedule_litter_care_task_window(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_retained_starts_on date,
  p_retained_starts_local_time time without time zone,
  p_retained_ends_on date,
  p_retained_ends_local_time time without time zone,
  p_schedule_timezone_name text,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    'reschedule_window', null, null,
    p_retained_starts_on, p_retained_starts_local_time,
    p_retained_ends_on, p_retained_ends_local_time,
    p_schedule_timezone_name, p_reason
  );
$$;

create or replace function public.replace_locked_litter_care_task_window_schedule(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_retained_starts_on date,
  p_retained_starts_local_time time without time zone,
  p_retained_ends_on date,
  p_retained_ends_local_time time without time zone,
  p_schedule_timezone_name text,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    'replace_locked_window', null, null,
    p_retained_starts_on, p_retained_starts_local_time,
    p_retained_ends_on, p_retained_ends_local_time,
    p_schedule_timezone_name, p_reason
  );
$$;

create or replace function public.set_litter_care_task_schedule_lock(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_is_locked boolean,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    case
      when p_is_locked is true then 'lock'
      when p_is_locked is false then 'unlock'
      else '__invalid__'
    end,
    null, null, null, null, null, null, null, p_reason
  );
$$;

create or replace function public.reapply_litter_care_task_schedule_suggestion(
  p_task_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_reason text
)
returns table (
  outcome text, task_id uuid, litter_id uuid, revision_no integer,
  change_id uuid, replayed boolean, reason text
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select * from public.execute_litter_care_task_schedule_command(
    p_task_id, p_client_command_id, p_expected_revision_no,
    'reapply_suggestion', null, null, null, null, null, null, null, p_reason
  );
$$;

revoke all on function public.initialize_litter_care_task_schedule() from public;
revoke all on function public.validate_litter_care_task_schedule_timezone() from public;
revoke all on function public.prevent_litter_care_task_schedule_registry_mutation() from public;
revoke all on function public.litter_care_task_schedule_snapshot(public.litter_care_tasks) from public;
revoke all on function public.execute_litter_care_task_schedule_command(
  uuid, uuid, integer, text, date, time without time zone,
  date, time without time zone, date, time without time zone, text, text
) from public;

revoke all on function public.reschedule_litter_care_task_point(
  uuid, uuid, integer, date, time without time zone, text, text
) from public;
grant execute on function public.reschedule_litter_care_task_point(
  uuid, uuid, integer, date, time without time zone, text, text
) to authenticated;

revoke all on function public.replace_locked_litter_care_task_point_schedule(
  uuid, uuid, integer, date, time without time zone, text, text
) from public;
grant execute on function public.replace_locked_litter_care_task_point_schedule(
  uuid, uuid, integer, date, time without time zone, text, text
) to authenticated;

revoke all on function public.reschedule_litter_care_task_window(
  uuid, uuid, integer, date, time without time zone,
  date, time without time zone, text, text
) from public;
grant execute on function public.reschedule_litter_care_task_window(
  uuid, uuid, integer, date, time without time zone,
  date, time without time zone, text, text
) to authenticated;

revoke all on function public.replace_locked_litter_care_task_window_schedule(
  uuid, uuid, integer, date, time without time zone,
  date, time without time zone, text, text
) from public;
grant execute on function public.replace_locked_litter_care_task_window_schedule(
  uuid, uuid, integer, date, time without time zone,
  date, time without time zone, text, text
) to authenticated;

revoke all on function public.set_litter_care_task_schedule_lock(
  uuid, uuid, integer, boolean, text
) from public;
grant execute on function public.set_litter_care_task_schedule_lock(
  uuid, uuid, integer, boolean, text
) to authenticated;

revoke all on function public.reapply_litter_care_task_schedule_suggestion(
  uuid, uuid, integer, text
) from public;
grant execute on function public.reapply_litter_care_task_schedule_suggestion(
  uuid, uuid, integer, text
) to authenticated;

comment on table public.litter_care_task_schedule_commands is
  'Private idempotency registry for litter care task scheduling intentions.';
comment on table public.litter_care_task_schedule_changes is
  'Private append-only history of successfully applied litter care task scheduling changes.';

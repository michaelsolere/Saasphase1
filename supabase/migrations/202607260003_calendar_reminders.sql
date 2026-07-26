-- REMINDER-FOUNDATION-01 — internal shared calendar reminders

create table public.calendar_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_care_task_id uuid,
  reproductive_cycle_id uuid,
  adopter_event_id uuid,
  days_before smallint not null,
  local_time time without time zone not null,
  timezone_name text not null,
  revision_no integer not null default 1,
  acknowledged_trigger_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  constraint calendar_reminders_organization_id_id_key
    unique (organization_id, id),
  constraint calendar_reminders_exactly_one_source_check
    check (
      pg_catalog.num_nonnulls(
        litter_care_task_id,
        reproductive_cycle_id,
        adopter_event_id
      ) = 1
    ),
  constraint calendar_reminders_days_before_check
    check (days_before between 0 and 365),
  constraint calendar_reminders_revision_positive_check
    check (revision_no > 0),
  constraint calendar_reminders_timezone_name_check
    check (
      timezone_name = btrim(timezone_name)
      and char_length(timezone_name) between 1 and 255
    ),
  constraint calendar_reminders_ack_consistency_check
    check (
      (
        acknowledged_trigger_at is null
        and acknowledged_at is null
        and acknowledged_by is null
      )
      or (
        acknowledged_trigger_at is not null
        and acknowledged_at is not null
        and acknowledged_by is not null
      )
    ),
  constraint calendar_reminders_deletion_consistency_check
    check (
      (deleted_at is null and deleted_by is null)
      or (deleted_at is not null and deleted_by is not null)
    ),
  constraint calendar_reminders_litter_care_task_fk
    foreign key (organization_id, litter_care_task_id)
    references public.litter_care_tasks (organization_id, id)
    on delete cascade,
  constraint calendar_reminders_reproductive_cycle_fk
    foreign key (organization_id, reproductive_cycle_id)
    references public.reproductive_cycles (organization_id, id)
    on delete cascade,
  constraint calendar_reminders_adopter_event_fk
    foreign key (organization_id, adopter_event_id)
    references public.events (organization_id, id)
    on delete cascade
);

create unique index calendar_reminders_litter_care_active_uidx
  on public.calendar_reminders (
    organization_id,
    litter_care_task_id,
    days_before,
    local_time,
    timezone_name
  )
  where litter_care_task_id is not null and deleted_at is null;

create unique index calendar_reminders_reproductive_cycle_active_uidx
  on public.calendar_reminders (
    organization_id,
    reproductive_cycle_id,
    days_before,
    local_time,
    timezone_name
  )
  where reproductive_cycle_id is not null and deleted_at is null;

create unique index calendar_reminders_adopter_event_active_uidx
  on public.calendar_reminders (
    organization_id,
    adopter_event_id,
    days_before,
    local_time,
    timezone_name
  )
  where adopter_event_id is not null and deleted_at is null;

create index calendar_reminders_organization_active_idx
  on public.calendar_reminders (organization_id, created_at desc)
  where deleted_at is null;

create index calendar_reminders_litter_care_task_idx
  on public.calendar_reminders (organization_id, litter_care_task_id)
  where litter_care_task_id is not null and deleted_at is null;

create index calendar_reminders_reproductive_cycle_idx
  on public.calendar_reminders (organization_id, reproductive_cycle_id)
  where reproductive_cycle_id is not null and deleted_at is null;

create index calendar_reminders_adopter_event_idx
  on public.calendar_reminders (organization_id, adopter_event_id)
  where adopter_event_id is not null and deleted_at is null;

create trigger calendar_reminders_set_updated_at
before update on public.calendar_reminders
for each row execute function public.set_updated_at();

create table public.calendar_reminder_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reminder_id uuid,
  client_command_id uuid not null,
  command_type text not null,
  payload jsonb not null,
  outcome text not null,
  result jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint calendar_reminder_commands_organization_id_id_key
    unique (organization_id, id),
  constraint calendar_reminder_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint calendar_reminder_commands_reminder_fk
    foreign key (organization_id, reminder_id)
    references public.calendar_reminders (organization_id, id)
    on delete cascade,
  constraint calendar_reminder_commands_type_check
    check (command_type in ('create', 'update', 'acknowledge', 'delete')),
  constraint calendar_reminder_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint calendar_reminder_commands_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint calendar_reminder_commands_outcome_check
    check (
      (outcome = 'success' and reason is null)
      or (
        outcome = 'error'
        and reason is not null
        and reason in (
          'invalid_input',
          'source_not_found',
          'source_not_admissible',
          'duplicate_reminder',
          'reminder_not_found',
          'stale_revision',
          'stale_trigger',
          'client_command_conflict',
          'membership_required',
          'forbidden'
        )
      )
    )
);

create index calendar_reminder_commands_reminder_idx
  on public.calendar_reminder_commands (organization_id, reminder_id, created_at desc);

alter table public.calendar_reminders enable row level security;
alter table public.calendar_reminder_commands enable row level security;

revoke all on table public.calendar_reminders from public;
revoke all on table public.calendar_reminders from anon;
revoke all on table public.calendar_reminders from authenticated;

revoke all on table public.calendar_reminder_commands from public;
revoke all on table public.calendar_reminder_commands from anon;
revoke all on table public.calendar_reminder_commands from authenticated;

grant select on table public.calendar_reminders to authenticated;

create policy calendar_reminders_select_member
on public.calendar_reminders
for select
to authenticated
using (public.is_member_of(organization_id));

-- No insert/update/delete policies: writes go through SECURITY DEFINER RPCs only.
-- Commands table is RPC-internal only (no SELECT grant to authenticated).

-- Canonical local civil wall-time → timestamptz (IANA).
-- Ambiguous DST fall-back: latest matching UTC instant.
-- Spring gap / unknown zone: null.
create or replace function public.calendar_reminder_canonical_trigger_at(
  p_local timestamp without time zone,
  p_timezone_name text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text := nullif(btrim(p_timezone_name), '');
  v_local_text text;
  v_baseline timestamptz;
  v_candidate timestamptz;
  v_latest timestamptz := null;
  v_minute integer;
begin
  if p_local is null or v_timezone is null then
    return null;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = v_timezone
  ) then
    return null;
  end if;

  v_local_text := pg_catalog.to_char(p_local, 'YYYY-MM-DD HH24:MI:SS');
  -- Treat the civil digits as if they were UTC, then scan nearby offsets.
  v_baseline := p_local at time zone 'UTC';

  for v_minute in -840..840 loop
    v_candidate := v_baseline + pg_catalog.make_interval(mins => v_minute);
    if pg_catalog.to_char(
      v_candidate at time zone v_timezone,
      'YYYY-MM-DD HH24:MI:SS'
    ) = v_local_text then
      if v_latest is null or v_candidate > v_latest then
        v_latest := v_candidate;
      end if;
    end if;
  end loop;

  return v_latest;
end;
$$;

revoke all on function public.calendar_reminder_canonical_trigger_at(
  timestamp without time zone,
  text
) from public;
revoke all on function public.calendar_reminder_canonical_trigger_at(
  timestamp without time zone,
  text
) from anon;
revoke all on function public.calendar_reminder_canonical_trigger_at(
  timestamp without time zone,
  text
) from authenticated;

comment on function public.calendar_reminder_canonical_trigger_at(
  timestamp without time zone,
  text
) is
  'Maps a civil local timestamp in an IANA zone to the canonical UTC instant '
  '(latest match on DST fall-back overlap; null on spring gap). '
  'Internal helper for calendar reminder RPCs.';

create or replace function public.create_calendar_reminder(
  p_source_type text,
  p_source_record_id uuid,
  p_days_before smallint,
  p_local_time time without time zone,
  p_timezone_name text,
  p_client_command_id uuid
)
returns table (
  outcome text,
  reason text,
  reminder_id uuid,
  organization_id uuid,
  source_type text,
  source_record_id uuid,
  days_before smallint,
  local_time time without time zone,
  timezone_name text,
  revision_no integer,
  acknowledged_trigger_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_timezone text := nullif(btrim(p_timezone_name), '');
  v_command public.calendar_reminder_commands%rowtype;
  v_reminder public.calendar_reminders%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_litter_care_task_id uuid := null;
  v_reproductive_cycle_id uuid := null;
  v_adopter_event_id uuid := null;
  v_task public.litter_care_tasks%rowtype;
  v_cycle public.reproductive_cycles%rowtype;
  v_event public.events%rowtype;
  v_source_date date;
begin
  outcome := 'error';
  reason := null;
  reminder_id := null;
  organization_id := null;
  source_type := p_source_type;
  source_record_id := p_source_record_id;
  days_before := p_days_before;
  local_time := p_local_time;
  timezone_name := v_timezone;
  revision_no := null;
  acknowledged_trigger_at := null;
  acknowledged_at := null;
  acknowledged_by := null;
  created_at := null;
  updated_at := null;
  replayed := false;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_source_type is null
    or p_source_type not in ('litter_care_task', 'reproductive_cycle', 'adopter_event')
    or p_source_record_id is null
    or p_days_before is null
    or p_days_before < 0
    or p_days_before > 365
    or p_local_time is null
    or v_timezone is null
    or char_length(v_timezone) > 255
    or p_client_command_id is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = v_timezone
  ) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select membership.organization_id, membership.role
  into v_organization_id, v_membership_role
  from public.memberships membership
  where membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  order by membership.created_at asc
  limit 1
  for share;

  if not found then
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  organization_id := v_organization_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'calendar_reminder:' || v_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_command
  from public.calendar_reminder_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id;

  v_payload := jsonb_build_object(
    'sourceType', p_source_type,
    'sourceRecordId', p_source_record_id,
    'daysBefore', p_days_before,
    'localTime', p_local_time::text,
    'timezoneName', v_timezone
  );

  if found then
    if v_command.command_type <> 'create'
      or v_command.payload is distinct from v_payload
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    if v_command.outcome = 'error' then
      reason := v_command.reason;
      return next;
      return;
    end if;

    select *
    into v_reminder
    from public.calendar_reminders reminder
    where reminder.organization_id = v_organization_id
      and reminder.id = v_command.reminder_id;

    if not found then
      reason := 'reminder_not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    reason := null;
    reminder_id := v_reminder.id;
    source_type := case
      when v_reminder.litter_care_task_id is not null then 'litter_care_task'
      when v_reminder.reproductive_cycle_id is not null then 'reproductive_cycle'
      else 'adopter_event'
    end;
    source_record_id := coalesce(
      v_reminder.litter_care_task_id,
      v_reminder.reproductive_cycle_id,
      v_reminder.adopter_event_id
    );
    days_before := v_reminder.days_before;
    local_time := v_reminder.local_time;
    timezone_name := v_reminder.timezone_name;
    revision_no := v_reminder.revision_no;
    acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
    acknowledged_at := v_reminder.acknowledged_at;
    acknowledged_by := v_reminder.acknowledged_by;
    created_at := v_reminder.created_at;
    updated_at := v_reminder.updated_at;
    replayed := true;
    return next;
    return;
  end if;

  if p_source_type = 'litter_care_task' then
    select *
    into v_task
    from public.litter_care_tasks task
    where task.organization_id = v_organization_id
      and task.id = p_source_record_id
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_task.status <> 'planned' then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    if v_task.item_kind = 'window' then
      v_source_date := v_task.retained_starts_on;
    else
      v_source_date := v_task.planned_for;
    end if;

    if v_source_date is null then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_litter_care_task_id := v_task.id;
  elsif p_source_type = 'reproductive_cycle' then
    select *
    into v_cycle
    from public.reproductive_cycles cycle
    where cycle.organization_id = v_organization_id
      and cycle.id = p_source_record_id
      and cycle.deleted_at is null
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_cycle.status not in ('planned', 'in_progress') then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_reproductive_cycle_id := v_cycle.id;
  else
    select *
    into v_event
    from public.events event
    where event.organization_id = v_organization_id
      and event.id = p_source_record_id
      and event.deleted_at is null
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_event.event_type not in ('puppy_choice', 'adoption')
      or v_event.status <> 'planned'
      or v_event.reservation_id is null
      or v_event.planned_at is null
    then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_adopter_event_id := v_event.id;
  end if;

  begin
    insert into public.calendar_reminders (
      organization_id,
      litter_care_task_id,
      reproductive_cycle_id,
      adopter_event_id,
      days_before,
      local_time,
      timezone_name,
      revision_no,
      created_by,
      updated_by
    ) values (
      v_organization_id,
      v_litter_care_task_id,
      v_reproductive_cycle_id,
      v_adopter_event_id,
      p_days_before,
      p_local_time,
      v_timezone,
      1,
      v_user_id,
      v_user_id
    )
    returning * into v_reminder;
  exception
    when unique_violation then
      reason := 'duplicate_reminder';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, null, p_client_command_id, 'create',
        v_payload, 'error', '{}'::jsonb, 'duplicate_reminder', v_user_id
      );
      return next;
      return;
  end;

  v_result := jsonb_build_object(
    'reminderId', v_reminder.id,
    'revisionNo', v_reminder.revision_no
  );

  insert into public.calendar_reminder_commands (
    organization_id, reminder_id, client_command_id, command_type,
    payload, outcome, result, reason, created_by
  ) values (
    v_organization_id, v_reminder.id, p_client_command_id, 'create',
    v_payload, 'success', v_result, null, v_user_id
  );

  outcome := 'success';
  reason := null;
  reminder_id := v_reminder.id;
  days_before := v_reminder.days_before;
  local_time := v_reminder.local_time;
  timezone_name := v_reminder.timezone_name;
  revision_no := v_reminder.revision_no;
  created_at := v_reminder.created_at;
  updated_at := v_reminder.updated_at;
  return next;
end;
$$;

create or replace function public.update_calendar_reminder(
  p_reminder_id uuid,
  p_expected_revision_no integer,
  p_days_before smallint,
  p_local_time time without time zone,
  p_timezone_name text,
  p_client_command_id uuid
)
returns table (
  outcome text,
  reason text,
  reminder_id uuid,
  organization_id uuid,
  source_type text,
  source_record_id uuid,
  days_before smallint,
  local_time time without time zone,
  timezone_name text,
  revision_no integer,
  acknowledged_trigger_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_timezone text := nullif(btrim(p_timezone_name), '');
  v_command public.calendar_reminder_commands%rowtype;
  v_reminder public.calendar_reminders%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_source_type text;
  v_source_record_id uuid;
  v_schedule_changed boolean;
begin
  outcome := 'error';
  reason := null;
  reminder_id := p_reminder_id;
  organization_id := null;
  source_type := null;
  source_record_id := null;
  days_before := p_days_before;
  local_time := p_local_time;
  timezone_name := v_timezone;
  revision_no := null;
  acknowledged_trigger_at := null;
  acknowledged_at := null;
  acknowledged_by := null;
  created_at := null;
  updated_at := null;
  replayed := false;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reminder_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 1
    or p_days_before is null
    or p_days_before < 0
    or p_days_before > 365
    or p_local_time is null
    or v_timezone is null
    or char_length(v_timezone) > 255
    or p_client_command_id is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = v_timezone
  ) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select membership.organization_id, membership.role
  into v_organization_id, v_membership_role
  from public.memberships membership
  where membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  order by membership.created_at asc
  limit 1
  for share;

  if not found then
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  organization_id := v_organization_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'calendar_reminder:' || v_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_command
  from public.calendar_reminder_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id;

  v_payload := jsonb_build_object(
    'reminderId', p_reminder_id,
    'expectedRevisionNo', p_expected_revision_no,
    'daysBefore', p_days_before,
    'localTime', p_local_time::text,
    'timezoneName', v_timezone
  );

  if found then
    if v_command.command_type <> 'update'
      or v_command.payload is distinct from v_payload
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    if v_command.outcome = 'error' then
      reason := v_command.reason;
      return next;
      return;
    end if;

    select *
    into v_reminder
    from public.calendar_reminders reminder
    where reminder.organization_id = v_organization_id
      and reminder.id = v_command.reminder_id;

    if not found then
      reason := 'reminder_not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    reason := null;
    reminder_id := v_reminder.id;
    source_type := case
      when v_reminder.litter_care_task_id is not null then 'litter_care_task'
      when v_reminder.reproductive_cycle_id is not null then 'reproductive_cycle'
      else 'adopter_event'
    end;
    source_record_id := coalesce(
      v_reminder.litter_care_task_id,
      v_reminder.reproductive_cycle_id,
      v_reminder.adopter_event_id
    );
    days_before := v_reminder.days_before;
    local_time := v_reminder.local_time;
    timezone_name := v_reminder.timezone_name;
    revision_no := v_reminder.revision_no;
    acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
    acknowledged_at := v_reminder.acknowledged_at;
    acknowledged_by := v_reminder.acknowledged_by;
    created_at := v_reminder.created_at;
    updated_at := v_reminder.updated_at;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_reminder
  from public.calendar_reminders reminder
  where reminder.organization_id = v_organization_id
    and reminder.id = p_reminder_id
    and reminder.deleted_at is null
  for update;

  if not found then
    reason := 'reminder_not_found';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, null, p_client_command_id, 'update',
      v_payload, 'error', '{}'::jsonb, 'reminder_not_found', v_user_id
    );
    return next;
    return;
  end if;

  if v_reminder.revision_no is distinct from p_expected_revision_no then
    reason := 'stale_revision';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_reminder.id, p_client_command_id, 'update',
      v_payload, 'error', '{}'::jsonb, 'stale_revision', v_user_id
    );
    return next;
    return;
  end if;

  v_schedule_changed :=
    v_reminder.days_before is distinct from p_days_before
    or v_reminder.local_time is distinct from p_local_time
    or v_reminder.timezone_name is distinct from v_timezone;

  begin
    if v_schedule_changed then
      update public.calendar_reminders as reminder
      set
        days_before = p_days_before,
        local_time = p_local_time,
        timezone_name = v_timezone,
        revision_no = reminder.revision_no + 1,
        acknowledged_trigger_at = null,
        acknowledged_at = null,
        acknowledged_by = null,
        updated_by = v_user_id
      where reminder.organization_id = v_organization_id
        and reminder.id = v_reminder.id
      returning * into v_reminder;
    else
      update public.calendar_reminders as reminder
      set
        days_before = p_days_before,
        local_time = p_local_time,
        timezone_name = v_timezone,
        revision_no = reminder.revision_no + 1,
        updated_by = v_user_id
      where reminder.organization_id = v_organization_id
        and reminder.id = v_reminder.id
      returning * into v_reminder;
    end if;
  exception
    when unique_violation then
      reason := 'duplicate_reminder';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, p_reminder_id, p_client_command_id, 'update',
        v_payload, 'error', '{}'::jsonb, 'duplicate_reminder', v_user_id
      );
      return next;
      return;
  end;

  v_source_type := case
    when v_reminder.litter_care_task_id is not null then 'litter_care_task'
    when v_reminder.reproductive_cycle_id is not null then 'reproductive_cycle'
    else 'adopter_event'
  end;
  v_source_record_id := coalesce(
    v_reminder.litter_care_task_id,
    v_reminder.reproductive_cycle_id,
    v_reminder.adopter_event_id
  );

  v_result := jsonb_build_object(
    'reminderId', v_reminder.id,
    'revisionNo', v_reminder.revision_no
  );

  insert into public.calendar_reminder_commands (
    organization_id, reminder_id, client_command_id, command_type,
    payload, outcome, result, reason, created_by
  ) values (
    v_organization_id, v_reminder.id, p_client_command_id, 'update',
    v_payload, 'success', v_result, null, v_user_id
  );

  outcome := 'success';
  reason := null;
  reminder_id := v_reminder.id;
  source_type := v_source_type;
  source_record_id := v_source_record_id;
  days_before := v_reminder.days_before;
  local_time := v_reminder.local_time;
  timezone_name := v_reminder.timezone_name;
  revision_no := v_reminder.revision_no;
  acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
  acknowledged_at := v_reminder.acknowledged_at;
  acknowledged_by := v_reminder.acknowledged_by;
  created_at := v_reminder.created_at;
  updated_at := v_reminder.updated_at;
  return next;
end;
$$;

create or replace function public.acknowledge_calendar_reminder(
  p_reminder_id uuid,
  p_expected_revision_no integer,
  p_expected_trigger_at timestamptz,
  p_client_command_id uuid
)
returns table (
  outcome text,
  reason text,
  reminder_id uuid,
  organization_id uuid,
  source_type text,
  source_record_id uuid,
  days_before smallint,
  local_time time without time zone,
  timezone_name text,
  revision_no integer,
  acknowledged_trigger_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_command public.calendar_reminder_commands%rowtype;
  v_reminder public.calendar_reminders%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_source_type text;
  v_source_record_id uuid;
  v_task public.litter_care_tasks%rowtype;
  v_cycle public.reproductive_cycles%rowtype;
  v_event public.events%rowtype;
  v_source_date date;
  v_expected_local timestamp without time zone;
  v_canonical_trigger_at timestamptz;
begin
  outcome := 'error';
  reason := null;
  reminder_id := p_reminder_id;
  organization_id := null;
  source_type := null;
  source_record_id := null;
  days_before := null;
  local_time := null;
  timezone_name := null;
  revision_no := null;
  acknowledged_trigger_at := null;
  acknowledged_at := null;
  acknowledged_by := null;
  created_at := null;
  updated_at := null;
  replayed := false;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reminder_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 1
    or p_expected_trigger_at is null
    or p_client_command_id is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select membership.organization_id, membership.role
  into v_organization_id, v_membership_role
  from public.memberships membership
  where membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  order by membership.created_at asc
  limit 1
  for share;

  if not found then
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  organization_id := v_organization_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'calendar_reminder:' || v_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_command
  from public.calendar_reminder_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id;

  v_payload := jsonb_build_object(
    'reminderId', p_reminder_id,
    'expectedRevisionNo', p_expected_revision_no,
    'expectedTriggerAt', p_expected_trigger_at
  );

  if found then
    if v_command.command_type <> 'acknowledge'
      or v_command.payload is distinct from v_payload
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    if v_command.outcome = 'error' then
      reason := v_command.reason;
      return next;
      return;
    end if;

    select *
    into v_reminder
    from public.calendar_reminders reminder
    where reminder.organization_id = v_organization_id
      and reminder.id = v_command.reminder_id;

    if not found then
      reason := 'reminder_not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    reason := null;
    reminder_id := v_reminder.id;
    source_type := case
      when v_reminder.litter_care_task_id is not null then 'litter_care_task'
      when v_reminder.reproductive_cycle_id is not null then 'reproductive_cycle'
      else 'adopter_event'
    end;
    source_record_id := coalesce(
      v_reminder.litter_care_task_id,
      v_reminder.reproductive_cycle_id,
      v_reminder.adopter_event_id
    );
    days_before := v_reminder.days_before;
    local_time := v_reminder.local_time;
    timezone_name := v_reminder.timezone_name;
    revision_no := v_reminder.revision_no;
    acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
    acknowledged_at := v_reminder.acknowledged_at;
    acknowledged_by := v_reminder.acknowledged_by;
    created_at := v_reminder.created_at;
    updated_at := v_reminder.updated_at;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_reminder
  from public.calendar_reminders reminder
  where reminder.organization_id = v_organization_id
    and reminder.id = p_reminder_id
    and reminder.deleted_at is null
  for update;

  if not found then
    reason := 'reminder_not_found';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, null, p_client_command_id, 'acknowledge',
      v_payload, 'error', '{}'::jsonb, 'reminder_not_found', v_user_id
    );
    return next;
    return;
  end if;

  -- Resolve and lock the current source before any idempotent success.
  if v_reminder.litter_care_task_id is not null then
    select *
    into v_task
    from public.litter_care_tasks task
    where task.organization_id = v_organization_id
      and task.id = v_reminder.litter_care_task_id
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_task.status <> 'planned' then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    if v_task.item_kind = 'window' then
      v_source_date := v_task.retained_starts_on;
    else
      v_source_date := v_task.planned_for;
    end if;

    if v_source_date is null then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_source_type := 'litter_care_task';
    v_source_record_id := v_task.id;
  elsif v_reminder.reproductive_cycle_id is not null then
    select *
    into v_cycle
    from public.reproductive_cycles cycle
    where cycle.organization_id = v_organization_id
      and cycle.id = v_reminder.reproductive_cycle_id
      and cycle.deleted_at is null
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_cycle.status not in ('planned', 'in_progress') then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_source_date := v_cycle.started_on;
    v_source_type := 'reproductive_cycle';
    v_source_record_id := v_cycle.id;
  else
    select *
    into v_event
    from public.events event
    where event.organization_id = v_organization_id
      and event.id = v_reminder.adopter_event_id
      and event.deleted_at is null
    for share;

    if not found then
      reason := 'source_not_found';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_found', v_user_id
      );
      return next;
      return;
    end if;

    if v_event.event_type not in ('puppy_choice', 'adoption')
      or v_event.status <> 'planned'
      or v_event.reservation_id is null
      or v_event.planned_at is null
    then
      reason := 'source_not_admissible';
      insert into public.calendar_reminder_commands (
        organization_id, reminder_id, client_command_id, command_type,
        payload, outcome, result, reason, created_by
      ) values (
        v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
        v_payload, 'error', '{}'::jsonb, 'source_not_admissible', v_user_id
      );
      return next;
      return;
    end if;

    v_source_date := (v_event.planned_at at time zone v_reminder.timezone_name)::date;
    v_source_type := 'adopter_event';
    v_source_record_id := v_event.id;
  end if;

  v_expected_local :=
    ((v_source_date - v_reminder.days_before)::timestamp + v_reminder.local_time);

  v_canonical_trigger_at := public.calendar_reminder_canonical_trigger_at(
    v_expected_local,
    v_reminder.timezone_name
  );

  -- Reject spring-gap / non-existent local times and non-canonical UTC picks
  -- for an ambiguous fall-back wall time (civil equality alone is insufficient).
  if v_canonical_trigger_at is null
    or (v_canonical_trigger_at at time zone v_reminder.timezone_name)
      is distinct from v_expected_local
    or p_expected_trigger_at is distinct from v_canonical_trigger_at
  then
    reason := 'stale_trigger';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
      v_payload, 'error', '{}'::jsonb, 'stale_trigger', v_user_id
    );
    return next;
    return;
  end if;

  -- Same current occurrence already acknowledged: idempotent success.
  if v_reminder.acknowledged_trigger_at is not distinct from p_expected_trigger_at
    and v_reminder.acknowledged_at is not null
    and v_reminder.acknowledged_by is not null
  then
    v_result := jsonb_build_object(
      'reminderId', v_reminder.id,
      'revisionNo', v_reminder.revision_no,
      'alreadyAcknowledged', true
    );

    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
      v_payload, 'success', v_result, null, v_user_id
    );

    outcome := 'success';
    reason := null;
    reminder_id := v_reminder.id;
    source_type := v_source_type;
    source_record_id := v_source_record_id;
    days_before := v_reminder.days_before;
    local_time := v_reminder.local_time;
    timezone_name := v_reminder.timezone_name;
    revision_no := v_reminder.revision_no;
    acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
    acknowledged_at := v_reminder.acknowledged_at;
    acknowledged_by := v_reminder.acknowledged_by;
    created_at := v_reminder.created_at;
    updated_at := v_reminder.updated_at;
    replayed := true;
    return next;
    return;
  end if;

  if v_reminder.revision_no is distinct from p_expected_revision_no then
    reason := 'stale_revision';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
      v_payload, 'error', '{}'::jsonb, 'stale_revision', v_user_id
    );
    return next;
    return;
  end if;

  update public.calendar_reminders as reminder
  set
    acknowledged_trigger_at = p_expected_trigger_at,
    acknowledged_at = pg_catalog.statement_timestamp(),
    acknowledged_by = v_user_id,
    revision_no = reminder.revision_no + 1,
    updated_by = v_user_id
  where reminder.organization_id = v_organization_id
    and reminder.id = v_reminder.id
  returning * into v_reminder;

  v_result := jsonb_build_object(
    'reminderId', v_reminder.id,
    'revisionNo', v_reminder.revision_no,
    'alreadyAcknowledged', false
  );

  insert into public.calendar_reminder_commands (
    organization_id, reminder_id, client_command_id, command_type,
    payload, outcome, result, reason, created_by
  ) values (
    v_organization_id, v_reminder.id, p_client_command_id, 'acknowledge',
    v_payload, 'success', v_result, null, v_user_id
  );

  outcome := 'success';
  reason := null;
  reminder_id := v_reminder.id;
  source_type := v_source_type;
  source_record_id := v_source_record_id;
  days_before := v_reminder.days_before;
  local_time := v_reminder.local_time;
  timezone_name := v_reminder.timezone_name;
  revision_no := v_reminder.revision_no;
  acknowledged_trigger_at := v_reminder.acknowledged_trigger_at;
  acknowledged_at := v_reminder.acknowledged_at;
  acknowledged_by := v_reminder.acknowledged_by;
  created_at := v_reminder.created_at;
  updated_at := v_reminder.updated_at;
  return next;
end;
$$;

create or replace function public.delete_calendar_reminder(
  p_reminder_id uuid,
  p_expected_revision_no integer,
  p_client_command_id uuid
)
returns table (
  outcome text,
  reason text,
  reminder_id uuid,
  organization_id uuid,
  revision_no integer,
  deleted_at timestamptz,
  deleted_by uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_command public.calendar_reminder_commands%rowtype;
  v_reminder public.calendar_reminders%rowtype;
  v_payload jsonb;
  v_result jsonb;
begin
  outcome := 'error';
  reason := null;
  reminder_id := p_reminder_id;
  organization_id := null;
  revision_no := null;
  deleted_at := null;
  deleted_by := null;
  replayed := false;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reminder_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 1
    or p_client_command_id is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select membership.organization_id, membership.role
  into v_organization_id, v_membership_role
  from public.memberships membership
  where membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  order by membership.created_at asc
  limit 1
  for share;

  if not found then
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  organization_id := v_organization_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'calendar_reminder:' || v_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_command
  from public.calendar_reminder_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id;

  v_payload := jsonb_build_object(
    'reminderId', p_reminder_id,
    'expectedRevisionNo', p_expected_revision_no
  );

  if found then
    if v_command.command_type <> 'delete'
      or v_command.payload is distinct from v_payload
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    if v_command.outcome = 'error' then
      reason := v_command.reason;
      return next;
      return;
    end if;

    select *
    into v_reminder
    from public.calendar_reminders reminder
    where reminder.organization_id = v_organization_id
      and reminder.id = v_command.reminder_id;

    if not found then
      reason := 'reminder_not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    reason := null;
    reminder_id := v_reminder.id;
    revision_no := v_reminder.revision_no;
    deleted_at := v_reminder.deleted_at;
    deleted_by := v_reminder.deleted_by;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_reminder
  from public.calendar_reminders reminder
  where reminder.organization_id = v_organization_id
    and reminder.id = p_reminder_id
    and reminder.deleted_at is null
  for update;

  if not found then
    reason := 'reminder_not_found';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, null, p_client_command_id, 'delete',
      v_payload, 'error', '{}'::jsonb, 'reminder_not_found', v_user_id
    );
    return next;
    return;
  end if;

  if v_reminder.revision_no is distinct from p_expected_revision_no then
    reason := 'stale_revision';
    insert into public.calendar_reminder_commands (
      organization_id, reminder_id, client_command_id, command_type,
      payload, outcome, result, reason, created_by
    ) values (
      v_organization_id, v_reminder.id, p_client_command_id, 'delete',
      v_payload, 'error', '{}'::jsonb, 'stale_revision', v_user_id
    );
    return next;
    return;
  end if;

  update public.calendar_reminders as reminder
  set
    deleted_at = pg_catalog.statement_timestamp(),
    deleted_by = v_user_id,
    revision_no = reminder.revision_no + 1,
    updated_by = v_user_id
  where reminder.organization_id = v_organization_id
    and reminder.id = v_reminder.id
  returning * into v_reminder;

  v_result := jsonb_build_object(
    'reminderId', v_reminder.id,
    'revisionNo', v_reminder.revision_no,
    'deletedAt', v_reminder.deleted_at
  );

  insert into public.calendar_reminder_commands (
    organization_id, reminder_id, client_command_id, command_type,
    payload, outcome, result, reason, created_by
  ) values (
    v_organization_id, v_reminder.id, p_client_command_id, 'delete',
    v_payload, 'success', v_result, null, v_user_id
  );

  outcome := 'success';
  reason := null;
  reminder_id := v_reminder.id;
  revision_no := v_reminder.revision_no;
  deleted_at := v_reminder.deleted_at;
  deleted_by := v_reminder.deleted_by;
  return next;
end;
$$;

revoke all on function public.create_calendar_reminder(
  text, uuid, smallint, time without time zone, text, uuid
) from public;
revoke all on function public.create_calendar_reminder(
  text, uuid, smallint, time without time zone, text, uuid
) from anon;
grant execute on function public.create_calendar_reminder(
  text, uuid, smallint, time without time zone, text, uuid
) to authenticated;

revoke all on function public.update_calendar_reminder(
  uuid, integer, smallint, time without time zone, text, uuid
) from public;
revoke all on function public.update_calendar_reminder(
  uuid, integer, smallint, time without time zone, text, uuid
) from anon;
grant execute on function public.update_calendar_reminder(
  uuid, integer, smallint, time without time zone, text, uuid
) to authenticated;

revoke all on function public.acknowledge_calendar_reminder(
  uuid, integer, timestamptz, uuid
) from public;
revoke all on function public.acknowledge_calendar_reminder(
  uuid, integer, timestamptz, uuid
) from anon;
grant execute on function public.acknowledge_calendar_reminder(
  uuid, integer, timestamptz, uuid
) to authenticated;

revoke all on function public.delete_calendar_reminder(
  uuid, integer, uuid
) from public;
revoke all on function public.delete_calendar_reminder(
  uuid, integer, uuid
) from anon;
grant execute on function public.delete_calendar_reminder(
  uuid, integer, uuid
) to authenticated;

comment on table public.calendar_reminders is
  'Shared internal calendar reminders projected from litter care, reproductive cycles, and adopter appointments.';
comment on table public.calendar_reminder_commands is
  'Idempotent command log for calendar reminder create/update/acknowledge/delete.';
comment on function public.create_calendar_reminder(
  text, uuid, smallint, time without time zone, text, uuid
) is
  'Creates an org-shared calendar reminder on an admissible source with writer role checks.';
comment on function public.update_calendar_reminder(
  uuid, integer, smallint, time without time zone, text, uuid
) is
  'Updates reminder schedule fields with optimistic concurrency and clears prior acknowledgement.';
comment on function public.acknowledge_calendar_reminder(
  uuid, integer, timestamptz, uuid
) is
  'Acknowledges the current reminder occurrence for the whole organization.';
comment on function public.delete_calendar_reminder(
  uuid, integer, uuid
) is
  'Soft-deletes a calendar reminder with optimistic concurrency.';

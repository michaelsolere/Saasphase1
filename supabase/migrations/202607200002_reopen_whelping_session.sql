alter table public.whelping_events
  drop constraint whelping_events_type_check;

alter table public.whelping_events
  add constraint whelping_events_type_check
    check (event_type in (
      'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
      'vet_called', 'intervention', 'observation', 'birth', 'session_closed',
      'session_reopened'
    )),
  add constraint whelping_events_reopen_reason_check
    check (
      event_type <> 'session_reopened'
      or (note is not null and char_length(btrim(note)) between 1 and 500)
    );

alter table public.whelping_commands
  drop constraint whelping_commands_type_check,
  drop constraint whelping_commands_event_type_check,
  drop constraint whelping_commands_values_check;

alter table public.whelping_commands
  add constraint whelping_commands_type_check
    check (command_type in (
      'open_session', 'record_event', 'close_session', 'record_birth',
      'record_birth_weight', 'reopen_session'
    )),
  add constraint whelping_commands_event_type_check
    check (
      event_type is null
      or event_type in (
        'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
        'vet_called', 'intervention', 'observation', 'birth', 'session_closed',
        'session_reopened'
      )
    ),
  add constraint whelping_commands_values_check
    check (
      (
        command_type = 'open_session'
        and event_id is null
        and started_at is not null
        and ended_at is null
        and occurred_at is null
        and timezone_name is not null
        and event_type is null
        and result_sequence_no is null
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'record_event'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type in (
          'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
          'vet_called', 'intervention', 'observation'
        )
        and result_sequence_no > 0
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'close_session'
        and event_id is not null
        and started_at is null
        and ended_at is not null
        and occurred_at is null
        and timezone_name is null
        and event_type = 'session_closed'
        and result_sequence_no > 0
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
      or (
        command_type = 'record_birth'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type = 'birth'
        and result_sequence_no > 0
        and birth_id is not null
        and animal_id is not null
        and sex is not null
        and viability is not null
        and result_birth_order > 0
        and (
          (
            weight_grams is null
            and measured_at is null
            and weight_measurement_id is null
          )
          or (
            weight_grams is not null
            and measured_at is not null
            and weight_measurement_id is not null
          )
        )
      )
      or (
        command_type = 'record_birth_weight'
        and event_id is null
        and started_at is null
        and ended_at is null
        and occurred_at is null
        and timezone_name is null
        and event_type is null
        and result_sequence_no is null
        and birth_id is not null
        and animal_id is not null
        and weight_measurement_id is not null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is not null
        and measured_at is not null
        and result_birth_order is null
      )
      or (
        command_type = 'reopen_session'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type = 'session_reopened'
        and note is not null
        and char_length(btrim(note)) between 1 and 500
        and result_sequence_no > 0
        and birth_id is null
        and animal_id is null
        and weight_measurement_id is null
        and sex is null
        and viability is null
        and initial_collar_color is null
        and weight_grams is null
        and measured_at is null
        and result_birth_order is null
      )
    );

create or replace function public.prevent_whelping_session_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE'
      and old.status = 'closed'
      and new.status = 'open'
      and current_setting('app.whelping_reopen_rpc', true) is distinct from 'on' then
      raise exception 'closed whelping sessions are reopened exclusively by the dedicated command'
        using errcode = '42501';
    end if;

    if not (
      tg_op = 'UPDATE'
      and old.status = 'closed'
      and new.status = 'open'
    ) and current_setting('app.whelping_session_rpc', true) is distinct from 'on' then
      raise exception 'whelping sessions are mutated exclusively by dedicated commands'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.reopen_whelping_session(
  p_session_id uuid,
  p_client_command_id uuid,
  p_reopened_at timestamptz,
  p_reason text
)
returns table (
  outcome text,
  session_id uuid,
  event_id uuid,
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
  v_session_organization_id uuid;
  v_membership_role text;
  v_session public.whelping_sessions%rowtype;
  v_litter public.litters%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_reopen_reason text := nullif(btrim(p_reason), '');
begin
  outcome := 'error';
  session_id := p_session_id;
  event_id := null;
  sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_session_id is null or p_client_command_id is null or p_reopened_at is null
    or v_reopen_reason is null
    or char_length(v_reopen_reason) > 500 then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select session.organization_id
  into v_session_organization_id
  from public.whelping_sessions session
  where session.id = p_session_id;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_session_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'session_not_found';
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
      'whelping_commands:' || v_session_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_session_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'reopen_session'
      or v_existing_command.session_id <> p_session_id
      or v_existing_command.occurred_at <> p_reopened_at
      or v_existing_command.note is distinct from v_reopen_reason then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    session_id := v_existing_command.session_id;
    event_id := v_existing_command.event_id;
    sequence_no := v_existing_command.result_sequence_no;
    replayed := true;
    return next;
    return;
  end if;

  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = v_session_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_session.organization_id
    and litter.id = v_session.litter_id
    and litter.deleted_at is null
  for update;

  if not found or v_litter.mother_id is distinct from v_session.mother_id then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  if v_session.status <> 'closed' then
    reason := 'session_already_open';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.whelping_sessions other_session
    where other_session.organization_id = v_session.organization_id
      and other_session.litter_id = v_session.litter_id
      and other_session.status = 'open'
      and other_session.id <> v_session.id
  ) then
    reason := 'session_already_open';
    return next;
    return;
  end if;

  select coalesce(max(event.sequence_no), 0) + 1
  into sequence_no
  from public.whelping_events event
  where event.organization_id = v_session.organization_id
    and event.session_id = v_session.id;

  perform pg_catalog.set_config('app.whelping_reopen_rpc', 'on', true);

  update public.whelping_sessions
  set
    status = 'open',
    ended_at = null,
    updated_by = v_user_id
  where organization_id = v_session.organization_id
    and id = v_session.id;

  insert into public.whelping_events (
    organization_id,
    session_id,
    sequence_no,
    occurred_at,
    event_type,
    note,
    author_id
  ) values (
    v_session.organization_id,
    v_session.id,
    sequence_no,
    p_reopened_at,
    'session_reopened',
    v_reopen_reason,
    v_user_id
  )
  returning id into event_id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    event_id,
    occurred_at,
    event_type,
    note,
    result_sequence_no,
    created_by
  ) values (
    v_session.organization_id,
    p_client_command_id,
    'reopen_session',
    v_session.litter_id,
    v_session.id,
    event_id,
    p_reopened_at,
    'session_reopened',
    v_reopen_reason,
    sequence_no,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on function public.reopen_whelping_session(
  uuid, uuid, timestamptz, text
) from public;

grant execute on function public.reopen_whelping_session(
  uuid, uuid, timestamptz, text
) to authenticated;

comment on function public.reopen_whelping_session(
  uuid, uuid, timestamptz, text
) is 'Idempotently reopens the same closed whelping session and appends its reason to the immutable timeline.';

comment on table public.whelping_events is
  'Append-only whelping timeline; birth, session closure and session reopening are created exclusively by dedicated commands.';

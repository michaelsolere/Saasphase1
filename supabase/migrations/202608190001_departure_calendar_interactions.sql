-- Departure calendar interaction corrections.
-- Enforce visible business hours and keep appointment adjustments in one command-owned audit event.

begin;

create or replace function public.enforce_departure_slot_calendar_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local_start timestamp;
  v_local_end timestamp;
begin
  v_local_start := new.starts_at at time zone 'Europe/Paris';
  v_local_end := (new.starts_at + make_interval(mins => new.duration_minutes)) at time zone 'Europe/Paris';

  if v_local_start::time < time '08:00'
     or v_local_end::date <> v_local_start::date
     or v_local_end::time > time '20:00' then
    raise exception 'departure_slot_outside_calendar_window' using errcode = '22023';
  end if;

  return new;
end;
$$;

lock table public.departure_slots in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.departure_slots slot
    where (slot.starts_at at time zone 'Europe/Paris')::time < time '08:00'
       or ((slot.starts_at + make_interval(mins => slot.duration_minutes)) at time zone 'Europe/Paris')::date
          <> (slot.starts_at at time zone 'Europe/Paris')::date
       or ((slot.starts_at + make_interval(mins => slot.duration_minutes)) at time zone 'Europe/Paris')::time > time '20:00'
  ) then
    raise exception 'departure_existing_slots_outside_calendar_window' using errcode = '22023';
  end if;
end;
$$;

create trigger departure_slots_calendar_window_guard
  before insert or update of starts_at, duration_minutes on public.departure_slots
  for each row
  execute function public.enforce_departure_slot_calendar_window();

revoke all on function public.enforce_departure_slot_calendar_window()
  from public, anon, authenticated, service_role;

create or replace function public.move_departure_appointment(
  p_slot_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_expected_version integer,
  p_reason text,
  p_client_command_id uuid
)
returns table(outcome text, slot_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.departure_slots%rowtype;
  v_plan public.departure_plans%rowtype;
  v_user uuid := auth.uid();
  v_role text;
  v_previous_start timestamptz;
  v_previous_duration integer;
  v_event_type text;
  v_existing public.departure_commands%rowtype;
  v_hash text;
begin
  select slot.* into v_slot from public.departure_slots slot where slot.id = p_slot_id;
  select plan.* into v_plan from public.departure_plans plan where plan.id = v_slot.plan_id for update;
  v_role := public.departure_owner_admin_role(v_plan.organization_id);
  select * into v_slot from public.departure_slots where id = p_slot_id for update;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'slotId', p_slot_id,
    'startsAt', p_starts_at,
    'durationMinutes', p_duration_minutes,
    'expectedVersion', p_expected_version,
    'reason', btrim(coalesce(p_reason, ''))
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing
  from public.departure_commands command
  where command.organization_id = v_plan.organization_id
    and command.client_command_id = p_client_command_id;

  if found then
    if v_existing.command_type = 'move_appointment'
       and v_existing.target_id = p_slot_id
       and v_existing.payload_hash = v_hash then
      outcome := v_existing.outcome;
      slot_id := p_slot_id;
      return next;
      return;
    end if;
    outcome := 'conflict';
    reason := 'command_payload_mismatch';
    return next;
    return;
  end if;

  if v_slot.version <> p_expected_version then
    outcome := 'conflict';
    reason := 'slot_stale';
    return next;
    return;
  end if;

  if v_slot.status not in ('booked', 'to_review', 'late', 'no_show')
     or length(btrim(coalesce(p_reason, ''))) < 3 then
    outcome := 'not_eligible';
    reason := 'appointment_not_movable';
    return next;
    return;
  end if;

  perform public.departure_assert_no_overlap(v_plan.id, v_slot.id, p_starts_at, p_duration_minutes);
  v_previous_start := v_slot.starts_at;
  v_previous_duration := v_slot.duration_minutes;

  if v_previous_start is not distinct from p_starts_at
     and v_previous_duration is not distinct from p_duration_minutes then
    outcome := 'conflict';
    reason := 'appointment_unchanged';
    return next;
    return;
  elsif v_previous_start is not distinct from p_starts_at then
    v_event_type := 'appointment_duration_changed';
  elsif v_previous_duration is not distinct from p_duration_minutes then
    v_event_type := 'appointment_moved';
  else
    v_event_type := 'appointment_adjusted';
  end if;

  update public.departure_slots
  set starts_at = p_starts_at,
      duration_minutes = p_duration_minutes,
      reason = btrim(p_reason),
      version = version + 1,
      updated_at = now(),
      updated_by = v_user
  where id = v_slot.id
  returning * into v_slot;

  perform public.departure_write_calendar_projection(v_slot, v_user);

  insert into public.departure_commands(
    organization_id, client_command_id, command_type, target_id,
    payload_hash, outcome, result, actor_profile_id
  ) values (
    v_plan.organization_id, p_client_command_id, 'move_appointment', v_slot.id,
    v_hash, 'moved', jsonb_build_object(
      'slotId', v_slot.id,
      'startsAt', v_slot.starts_at,
      'durationMinutes', v_slot.duration_minutes
    ), v_user
  );

  insert into public.departure_events(
    organization_id, plan_id, slot_id, reservation_id, event_type,
    actor_kind, actor_profile_id, actor_role, details, client_command_id
  ) values (
    v_plan.organization_id, v_plan.id, v_slot.id, v_slot.reservation_id, v_event_type,
    'member', v_user, v_role, jsonb_build_object(
      'previousStartsAt', v_previous_start,
      'startsAt', v_slot.starts_at,
      'previousDurationMinutes', v_previous_duration,
      'durationMinutes', v_slot.duration_minutes,
      'reason', btrim(p_reason)
    ), p_client_command_id
  );

  outcome := 'moved';
  slot_id := v_slot.id;
  return next;
end;
$$;

commit;

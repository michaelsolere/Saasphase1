create or replace function public.update_reproductive_cycle(
  p_cycle_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_started_on date,
  p_ended_on date default null,
  p_notes text default null
)
returns table (
  outcome text,
  reason text,
  cycle_id uuid,
  mother_id uuid,
  litter_id uuid,
  status text,
  started_on date,
  ended_on date,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
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
  v_has_mating boolean;
  v_notes text;
  v_transition_allowed boolean := false;
begin
  outcome := 'error';
  reason := null;
  cycle_id := p_cycle_id;
  mother_id := null;
  litter_id := null;
  status := null;
  started_on := null;
  ended_on := null;
  notes := null;
  created_at := null;
  updated_at := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_cycle_id is null
    or p_expected_updated_at is null
    or p_status is null
    or p_started_on is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if p_status not in ('planned', 'in_progress', 'mated', 'closed', 'cancelled') then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if p_ended_on is not null and p_ended_on < p_started_on then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if p_status = 'closed' and p_ended_on is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  v_notes := nullif(btrim(p_notes), '');
  if v_notes is not null and char_length(v_notes) > 5000 then
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

  if v_cycle.updated_at is distinct from p_expected_updated_at then
    reason := 'stale_cycle';
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.reproductive_cycle_matings mating
    where mating.organization_id = v_cycle.organization_id
      and mating.cycle_id = v_cycle.id
  )
  into v_has_mating;

  if v_cycle.status = 'planned' and p_status in ('planned', 'in_progress', 'cancelled') then
    v_transition_allowed := true;
  elsif v_cycle.status = 'in_progress' and p_status in ('in_progress', 'closed', 'cancelled') then
    v_transition_allowed := true;
  elsif v_cycle.status = 'mated' and p_status in ('mated', 'closed') then
    v_transition_allowed := true;
  end if;

  if not v_transition_allowed then
    reason := 'invalid_transition';
    return next;
    return;
  end if;

  if p_status = 'cancelled' and (v_has_mating or v_cycle.litter_id is not null) then
    reason := 'cancellation_blocked';
    return next;
    return;
  end if;

  update public.reproductive_cycles
  set
    status = p_status,
    started_on = p_started_on,
    ended_on = p_ended_on,
    notes = v_notes,
    updated_by = v_user_id
  where organization_id = v_cycle.organization_id
    and id = v_cycle.id
  returning
    reproductive_cycles.id,
    reproductive_cycles.mother_id,
    reproductive_cycles.litter_id,
    reproductive_cycles.status,
    reproductive_cycles.started_on,
    reproductive_cycles.ended_on,
    reproductive_cycles.notes,
    reproductive_cycles.created_at,
    reproductive_cycles.updated_at
  into
    cycle_id,
    mother_id,
    litter_id,
    status,
    started_on,
    ended_on,
    notes,
    created_at,
    updated_at;

  outcome := 'success';
  reason := null;
  return next;
end;
$$;

revoke all on function public.update_reproductive_cycle(
  uuid, timestamptz, text, date, date, text
) from public;
revoke all on function public.update_reproductive_cycle(
  uuid, timestamptz, text, date, date, text
) from anon;
grant execute on function public.update_reproductive_cycle(
  uuid, timestamptz, text, date, date, text
) to authenticated;

comment on function public.update_reproductive_cycle(
  uuid, timestamptz, text, date, date, text
) is
  'Updates a reproductive cycle with role checks, concurrency control, and allowed status transitions.';

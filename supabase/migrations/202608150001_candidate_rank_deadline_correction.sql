begin;

alter table public.applications
  add column rank_payment_accepted_at timestamptz,
  add column rank_payment_late boolean not null default false,
  add column rank_override_value integer,
  add column rank_override_reason text,
  add column rank_override_at timestamptz,
  add column rank_override_by uuid references public.profiles(id);

alter table public.applications
  add constraint applications_rank_override_check check (
    (rank_override_value is null and rank_override_reason is null and rank_override_at is null and rank_override_by is null)
    or (
      rank_override_value > 0
      and length(btrim(rank_override_reason)) >= 10
      and rank_override_at is not null
      and rank_override_by is not null
    )
  );

create or replace function public.candidate_historical_initial_rank(p_application_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 1 + count(*)::integer
  from public.applications candidate
  join public.applications target on target.id = p_application_id
  left join public.form_submissions candidate_submission
    on candidate_submission.organization_id = candidate.organization_id
   and candidate_submission.id = candidate.form_submission_id
  left join public.form_submissions target_submission
    on target_submission.organization_id = target.organization_id
   and target_submission.id = target.form_submission_id
  where candidate.organization_id = target.organization_id
    and candidate.species = target.species
    and candidate.breed = target.breed
    and candidate.deleted_at is null
    and (
      coalesce(candidate_submission.submitted_at, candidate.submitted_at, candidate.created_at)
        < coalesce(target_submission.submitted_at, target.submitted_at, target.created_at)
      or (
        coalesce(candidate_submission.submitted_at, candidate.submitted_at, candidate.created_at)
          = coalesce(target_submission.submitted_at, target.submitted_at, target.created_at)
        and candidate.id::text < target.id::text
      )
    );
$$;

revoke all on function public.candidate_historical_initial_rank(uuid) from public, anon, authenticated;

create or replace function public.resolve_candidate_payment_rank(
  p_application_id uuid,
  p_accepted_at timestamptz
)
returns table (initial_rank integer, active_rank integer, is_late boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
  v_reservation public.reservations%rowtype;
  v_initial integer;
  v_base integer;
  v_late_position integer;
begin
  select * into v_application
  from public.applications application_row
  where application_row.id = p_application_id
    and application_row.deleted_at is null
  for update;
  if not found then
    raise exception 'application_not_found';
  end if;

  select * into v_reservation
  from public.reservations reservation
  where reservation.organization_id = v_application.organization_id
    and reservation.application_id = v_application.id
    and reservation.deleted_at is null
  order by reservation.created_at
  limit 1
  for update;
  if not found then
    raise exception 'reservation_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_application.organization_id::text || ':' ||
      coalesce(v_reservation.litter_group_id::text, '-') || ':' ||
      coalesce(v_reservation.litter_id::text, '-'),
      0
    )
  );

  v_initial := coalesce(
    v_application.initial_rank,
    public.candidate_historical_initial_rank(v_application.id)
  );
  is_late := v_reservation.pre_reservation_deadline is not null
    and p_accepted_at > v_reservation.pre_reservation_deadline;

  if not is_late then
    active_rank := v_initial;
  else
    select coalesce(max(coalesce(candidate.initial_rank, reservation.rank_initial)), 0)
    into v_base
    from public.reservations reservation
    join public.applications candidate
      on candidate.organization_id = reservation.organization_id
     and candidate.id = reservation.application_id
     and candidate.deleted_at is null
    where reservation.organization_id = v_reservation.organization_id
      and reservation.litter_group_id is not distinct from v_reservation.litter_group_id
      and reservation.litter_id is not distinct from v_reservation.litter_id
      and reservation.deleted_at is null;

    select 1 + count(*)::integer
    into v_late_position
    from public.applications candidate
    join public.reservations reservation
      on reservation.organization_id = candidate.organization_id
     and reservation.application_id = candidate.id
     and reservation.deleted_at is null
    where candidate.organization_id = v_application.organization_id
      and candidate.id <> v_application.id
      and candidate.deleted_at is null
      and candidate.rank_payment_late
      and reservation.litter_group_id is not distinct from v_reservation.litter_group_id
      and reservation.litter_id is not distinct from v_reservation.litter_id
      and (
        candidate.rank_payment_accepted_at < p_accepted_at
        or (
          candidate.rank_payment_accepted_at = p_accepted_at
          and candidate.id::text < v_application.id::text
        )
      );
    active_rank := v_base + v_late_position;
  end if;

  initial_rank := v_initial;
  return next;
end;
$$;

revoke all on function public.resolve_candidate_payment_rank(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.apply_candidate_payment_rank_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_resolved record;
begin
  if new.event_type <> 'candidate_first_payment_accepted' or new.reservation_id is null then
    return new;
  end if;

  select reservation.application_id into v_application_id
  from public.reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id;
  if v_application_id is null then
    raise exception 'rank_projection_application_missing';
  end if;

  select * into v_resolved
  from public.resolve_candidate_payment_rank(v_application_id, new.occurred_at);

  perform set_config('app.candidate_rank_sync', 'on', true);
  update public.applications application_row
  set initial_rank = v_resolved.initial_rank,
      active_rank = coalesce(application_row.rank_override_value, v_resolved.active_rank),
      rank_payment_accepted_at = new.occurred_at,
      rank_payment_late = v_resolved.is_late,
      updated_at = clock_timestamp(),
      updated_by = new.actor_profile_id
  where application_row.id = v_application_id;

  perform set_config('app.candidate_rank_sync', 'on', true);
  update public.reservations reservation
  set rank_initial = v_resolved.initial_rank,
      rank_active = coalesce(
        (select application_row.rank_override_value from public.applications application_row where application_row.id = v_application_id),
        v_resolved.active_rank
      ),
      rank_assigned_at = coalesce(reservation.rank_assigned_at, new.occurred_at),
      rank_priority_override = exists (
        select 1 from public.applications application_row
        where application_row.id = v_application_id and application_row.rank_override_value is not null
      ),
      rank_priority_reason = (
        select application_row.rank_override_reason from public.applications application_row
        where application_row.id = v_application_id
      ),
      updated_at = clock_timestamp(),
      updated_by = new.actor_profile_id
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id;

  perform set_config('app.candidate_rank_sync', 'off', true);
  new.current_state := jsonb_set(
    jsonb_set(coalesce(new.current_state, '{}'::jsonb), '{activeRank}', to_jsonb(coalesce(
      (select application_row.rank_override_value from public.applications application_row where application_row.id = v_application_id),
      v_resolved.active_rank
    )), true),
    '{initialRank}', to_jsonb(v_resolved.initial_rank), true
  ) || jsonb_build_object('latePayment', v_resolved.is_late);
  return new;
end;
$$;

create trigger candidate_journey_payment_rank_projection
before insert on public.candidate_journey_events
for each row execute function public.apply_candidate_payment_rank_projection();

create or replace function public.guard_reservation_rank_projection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.candidate_rank_sync', true) = 'on' then return new; end if;
  if new.rank_initial is distinct from old.rank_initial
     or new.rank_active is distinct from old.rank_active
     or new.rank_assigned_at is distinct from old.rank_assigned_at
     or new.rank_priority_override is distinct from old.rank_priority_override
     or new.rank_priority_reason is distinct from old.rank_priority_reason then
    raise exception 'reservation_rank_is_projection';
  end if;
  return new;
end;
$$;

create trigger reservations_rank_projection_guard
before update of rank_initial, rank_active, rank_assigned_at,
  rank_priority_override, rank_priority_reason
on public.reservations
for each row execute function public.guard_reservation_rank_projection();

create or replace function public.guard_application_rank_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.candidate_rank_sync', true) = 'on' then return new; end if;
  if new.active_rank is distinct from old.active_rank
     and new.initial_rank is not distinct from old.initial_rank
     and new.rank_payment_accepted_at is not distinct from old.rank_payment_accepted_at
     and new.rank_payment_late is not distinct from old.rank_payment_late
     and new.rank_override_value is not distinct from old.rank_override_value
     and exists(
       select 1 from public.reservations reservation_row
       join public.payments payment on payment.reservation_id=reservation_row.id
       where reservation_row.application_id=new.id and payment.status='paid'
         and payment.payment_type in('arrhes','pre_reservation_deposit_refundable')
     )
     and not exists(
       select 1 from public.candidate_journey_events event_row
       where event_row.application_id=new.id and event_row.event_type='candidate_first_payment_accepted'
     ) then return new;
  end if;
  raise exception 'application_rank_requires_central_command';
end;
$$;

create trigger applications_rank_source_guard
before update of initial_rank,active_rank,rank_payment_accepted_at,rank_payment_late,
  rank_override_value,rank_override_reason,rank_override_at,rank_override_by
on public.applications
for each row execute function public.guard_application_rank_source();

create or replace function public.override_candidate_active_rank(
  p_application_id uuid,
  p_rank integer,
  p_reason text,
  p_client_command_id uuid
)
returns table (outcome text, application_id uuid, active_rank integer, event_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_application public.applications%rowtype;
  v_reservation public.reservations%rowtype;
  v_role text;
  v_event_id uuid;
begin
  application_id := p_application_id;
  active_rank := null;
  event_id := null;
  reason := null;
  if v_user_id is null then outcome := 'not_eligible'; reason := 'not_authenticated'; return next; return; end if;
  if p_rank is null or p_rank < 1 then outcome := 'not_eligible'; reason := 'rank_invalid'; return next; return; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then outcome := 'not_eligible'; reason := 'reason_required'; return next; return; end if;

  select * into v_application from public.applications where id = p_application_id and deleted_at is null for update;
  if not found then outcome := 'not_eligible'; reason := 'application_not_found'; return next; return; end if;
  select membership.role into v_role from public.memberships membership
  where membership.organization_id = v_application.organization_id
    and membership.profile_id = v_user_id and membership.status = 'active' and membership.deleted_at is null;
  if v_role not in ('owner', 'admin') then outcome := 'not_eligible'; reason := 'admin_required'; return next; return; end if;

  select candidate_event.id into v_event_id
  from public.candidate_journey_events candidate_event
  where candidate_event.organization_id = v_application.organization_id
    and candidate_event.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_applied'; active_rank := v_application.active_rank; event_id := v_event_id; return next; return;
  end if;

  select * into v_reservation from public.reservations reservation
  where reservation.organization_id = v_application.organization_id
    and reservation.application_id = v_application.id and reservation.deleted_at is null
  order by reservation.created_at limit 1 for update;
  if not found then outcome := 'not_eligible'; reason := 'reservation_not_found'; return next; return; end if;

  perform set_config('app.candidate_rank_sync', 'on', true);
  update public.applications application_row
  set rank_override_value = p_rank,
      rank_override_reason = btrim(p_reason),
      rank_override_at = clock_timestamp(),
      rank_override_by = v_user_id,
      active_rank = p_rank,
      rank_notes = btrim(p_reason),
      updated_at = clock_timestamp(),
      updated_by = v_user_id
  where application_row.id = v_application.id;

  perform set_config('app.candidate_rank_sync', 'on', true);
  update public.reservations reservation
  set rank_active = p_rank,
      rank_priority_override = true,
      rank_priority_reason = btrim(p_reason),
      updated_at = clock_timestamp(),
      updated_by = v_user_id
  where reservation.id = v_reservation.id;

  perform set_config('app.candidate_rank_sync', 'off', true);
  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, reservation_id, event_type,
    actor_profile_id, actor_role, reason, previous_state, current_state, client_command_id
  ) values (
    v_application.organization_id, v_application.id, v_application.contact_id,
    v_reservation.id, 'candidate_rank_overridden', v_user_id, v_role, btrim(p_reason),
    jsonb_build_object('activeRank', v_application.active_rank),
    jsonb_build_object('activeRank', p_rank, 'initialRank', v_application.initial_rank),
    p_client_command_id
  ) returning id into v_event_id;

  outcome := 'updated'; active_rank := p_rank; event_id := v_event_id; return next;
end;
$$;

revoke all on function public.override_candidate_active_rank(uuid, integer, text, uuid) from public, anon;
grant execute on function public.override_candidate_active_rank(uuid, integer, text, uuid) to authenticated;

create or replace view public.candidate_rank_diagnostics
with (security_invoker = true)
as
select
  application_row.organization_id,
  application_row.id as application_id,
  reservation.id as reservation_id,
  application_row.initial_rank as application_initial_rank,
  reservation.rank_initial as reservation_initial_rank,
  application_row.active_rank as application_active_rank,
  reservation.rank_active as reservation_active_rank,
  application_row.rank_payment_accepted_at,
  application_row.rank_payment_late,
  application_row.rank_override_value,
  (
    application_row.initial_rank is distinct from reservation.rank_initial
    or application_row.active_rank is distinct from reservation.rank_active
  ) as has_divergence
from public.applications application_row
join public.reservations reservation
  on reservation.organization_id = application_row.organization_id
 and reservation.application_id = application_row.id
where application_row.deleted_at is null and reservation.deleted_at is null;

grant select on public.candidate_rank_diagnostics to authenticated;

commit;

-- ADOPTER-FINANCIAL-RESOLUTION-01
-- Atomic negative journey exits with an immutable financial-resolution ledger.

begin;

create table private.adopter_financial_resolution_write_contexts (
  backend_pid integer not null,
  transaction_id bigint not null,
  token uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (backend_pid, transaction_id, token)
);

revoke all on table private.adopter_financial_resolution_write_contexts
from public, anon, authenticated, service_role;

create or replace function private.is_adopter_financial_resolution_managed_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.adopter_financial_resolution_write_contexts context
    where context.backend_pid = pg_catalog.pg_backend_pid()
      and context.transaction_id = pg_catalog.txid_current()
      and context.token::text = coalesce(
        current_setting('app.adopter_financial_resolution_managed_write', true),
        ''
      )
  );
$$;

revoke all on function private.is_adopter_financial_resolution_managed_write()
from public, anon, authenticated, service_role;

create table public.adopter_financial_resolution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null,
  contact_id uuid not null,
  event_type text not null,
  client_command_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_role text not null,
  financial_resolution text not null,
  previous_financial_resolution text,
  paid_cents bigint not null default 0,
  refunded_cents bigint not null default 0,
  refundable_cents bigint not null default 0,
  retained_cents bigint not null default 0,
  refund_payment_id uuid,
  voided_payment_id uuid,
  reason text,
  previous_event_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint adopter_financial_resolution_events_organization_id_id_key
    unique (organization_id, id),
  constraint adopter_financial_resolution_events_current_link_key
    unique (organization_id, reservation_id, id),
  constraint adopter_financial_resolution_events_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint adopter_financial_resolution_events_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint adopter_financial_resolution_events_refund_payment_fk
    foreign key (organization_id, refund_payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint adopter_financial_resolution_events_voided_payment_fk
    foreign key (organization_id, voided_payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint adopter_financial_resolution_events_previous_event_fk
    foreign key (organization_id, reservation_id, previous_event_id)
    references public.adopter_financial_resolution_events (
      organization_id,
      reservation_id,
      id
    )
    on delete restrict,
  constraint adopter_financial_resolution_events_type_check
    check (event_type in ('opened', 'not_required', 'resolved', 'rectified', 'reconciled')),
  constraint adopter_financial_resolution_events_actor_role_check
    check (actor_role in ('owner', 'admin', 'member', 'system')),
  constraint adopter_financial_resolution_events_resolution_check
    check (financial_resolution in (
      'none', 'pending', 'full_refund', 'partial_refund', 'no_refund',
      'credit_issued', 'transfer_to_future_reservation',
      'withholding_applied', 'other'
    )),
  constraint adopter_financial_resolution_events_previous_resolution_check
    check (
      previous_financial_resolution is null
      or previous_financial_resolution in (
        'none', 'pending', 'full_refund', 'partial_refund', 'no_refund',
        'credit_issued', 'transfer_to_future_reservation',
        'withholding_applied', 'other'
      )
    ),
  constraint adopter_financial_resolution_events_amounts_check
    check (
      paid_cents >= 0
      and refunded_cents >= 0
      and refundable_cents >= 0
      and retained_cents >= 0
    ),
  constraint adopter_financial_resolution_events_reason_check
    check (reason is null or char_length(btrim(reason)) between 1 and 5000),
  constraint adopter_financial_resolution_events_terminal_reason_check
    check (event_type not in ('resolved', 'rectified') or reason is not null),
  constraint adopter_financial_resolution_events_details_check
    check (jsonb_typeof(details) = 'object')
);

create unique index adopter_financial_resolution_events_command_key
  on public.adopter_financial_resolution_events (client_command_id);
create index adopter_financial_resolution_events_reservation_history_idx
  on public.adopter_financial_resolution_events (
    organization_id,
    reservation_id,
    occurred_at desc,
    id desc
  );

alter table public.reservations
  add column current_financial_resolution_event_id uuid;

alter table public.reservations
  add constraint reservations_current_financial_resolution_event_fk
  foreign key (organization_id, id, current_financial_resolution_event_id)
  references public.adopter_financial_resolution_events (
    organization_id,
    reservation_id,
    id
  )
  on delete restrict;

create or replace function public.adopter_financial_resolution_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE'
    and session_user = 'postgres'
    and pg_catalog.current_setting('app.qa_hard_delete', true) = 'on'
  then
    return old;
  end if;

  raise exception 'adopter financial-resolution history is immutable'
    using errcode = '55000';
end;
$function$;

create trigger adopter_financial_resolution_events_immutable
before update or delete on public.adopter_financial_resolution_events
for each row execute function public.adopter_financial_resolution_event_append_only();

alter table public.adopter_financial_resolution_events enable row level security;

revoke all on table public.adopter_financial_resolution_events
  from public, anon, authenticated, service_role;
grant select on table public.adopter_financial_resolution_events to authenticated;

create policy adopter_financial_resolution_events_select_member
on public.adopter_financial_resolution_events
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.transition_adopter_journey_exit(
  p_reservation_id uuid,
  p_client_command_id uuid,
  p_target_status text,
  p_expected_reservation_updated_at timestamptz
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  event_id uuid,
  reservation_id uuid,
  target_status text,
  financial_resolution text,
  paid_cents bigint,
  refunded_cents bigint,
  refundable_cents bigint,
  result jsonb
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_reservation public.reservations%rowtype;
  v_existing_event public.adopter_financial_resolution_events%rowtype;
  v_actor_role text;
  v_event_id uuid := gen_random_uuid();
  v_paid_cents bigint := 0;
  v_refunded_cents bigint := 0;
  v_refundable_cents bigint := 0;
  v_resolution text;
  v_event_type text;
  v_request jsonb;
  v_write_token uuid;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  event_id := null;
  reservation_id := p_reservation_id;
  target_status := p_target_status;
  financial_resolution := null;
  paid_cents := 0;
  refunded_cents := 0;
  refundable_cents := 0;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reservation_id is null
    or p_client_command_id is null
    or p_expected_reservation_updated_at is null
    or p_target_status not in ('withdrawn', 'cancelled', 'expired')
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  v_request := jsonb_build_object(
    'reservationId', p_reservation_id,
    'targetStatus', p_target_status,
    'expectedReservationUpdatedAt', p_expected_reservation_updated_at
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'adopter_financial_exit_command:' || p_client_command_id::text,
      0
    )
  );

  select event.*
  into v_existing_event
  from public.adopter_financial_resolution_events event
  where event.client_command_id = p_client_command_id;

  if found then
    if v_existing_event.reservation_id <> p_reservation_id
      or v_existing_event.actor_profile_id is distinct from v_user
      or v_existing_event.event_type not in ('opened', 'not_required')
      or v_existing_event.details->'request' is distinct from v_request
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    perform 1
    from public.memberships membership
    where membership.organization_id = v_existing_event.organization_id
      and membership.profile_id = v_user
      and membership.status = 'active'
      and membership.deleted_at is null
      and membership.role in ('owner', 'admin', 'member');

    if not found then
      reason := 'not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    replayed := true;
    event_id := v_existing_event.id;
    reservation_id := v_existing_event.reservation_id;
    target_status := v_existing_event.details->>'targetStatus';
    financial_resolution := v_existing_event.financial_resolution;
    paid_cents := v_existing_event.paid_cents;
    refunded_cents := v_existing_event.refunded_cents;
    refundable_cents := v_existing_event.refundable_cents;
    result := jsonb_build_object(
      'reservationId', v_existing_event.reservation_id,
      'eventId', v_existing_event.id
    );
    return next;
    return;
  end if;

  select reservation.*
  into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id
    and reservation.deleted_at is null
  for no key update;

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_reservation.organization_id
    and membership.profile_id = v_user
    and membership.status = 'active'
    and membership.deleted_at is null
    and membership.role in ('owner', 'admin', 'member');

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.status <> 'active' then
    outcome := 'blocked';
    reason := 'invalid_state';
    return next;
    return;
  end if;

  if v_reservation.updated_at is distinct from p_expected_reservation_updated_at then
    outcome := 'blocked';
    reason := 'reservation_stale';
    return next;
    return;
  end if;

  if v_reservation.financial_resolution <> 'none'
    or v_reservation.current_financial_resolution_event_id is not null
  then
    outcome := 'blocked';
    reason := 'financial_state_invalid';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.organization_id = v_reservation.organization_id
      and payment.reservation_id = v_reservation.id
      and payment.deleted_at is null
      and payment.currency <> v_reservation.currency
  ) then
    outcome := 'blocked';
    reason := 'currency_mismatch';
    return next;
    return;
  end if;

  select
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type not in ('refund', 'partial_refund')
        and payment.status in (
          'partially_paid', 'paid', 'partially_refunded',
          'converted_to_credit', 'transferred'
        )
    ), 0)::bigint,
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type in ('refund', 'partial_refund')
        and payment.status in ('paid', 'partially_refunded', 'refunded')
    ), 0)::bigint
  into v_paid_cents, v_refunded_cents
  from public.payments payment
  where payment.organization_id = v_reservation.organization_id
    and payment.reservation_id = v_reservation.id
    and payment.deleted_at is null;

  v_refundable_cents := greatest(v_paid_cents - v_refunded_cents, 0);
  v_resolution := case when v_refundable_cents > 0 then 'pending' else 'none' end;
  v_event_type := case when v_refundable_cents > 0 then 'opened' else 'not_required' end;

  v_write_token := gen_random_uuid();
  insert into private.adopter_financial_resolution_write_contexts (
    backend_pid,
    transaction_id,
    token
  ) values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    v_write_token
  );
  perform pg_catalog.set_config(
    'app.adopter_financial_resolution_managed_write',
    v_write_token::text,
    true
  );

  insert into public.adopter_financial_resolution_events (
    id,
    organization_id,
    reservation_id,
    contact_id,
    event_type,
    client_command_id,
    actor_profile_id,
    actor_role,
    financial_resolution,
    previous_financial_resolution,
    paid_cents,
    refunded_cents,
    refundable_cents,
    retained_cents,
    previous_event_id,
    details
  ) values (
    v_event_id,
    v_reservation.organization_id,
    v_reservation.id,
    v_reservation.contact_id,
    v_event_type,
    p_client_command_id,
    v_user,
    v_actor_role,
    v_resolution,
    v_reservation.financial_resolution,
    v_paid_cents,
    v_refunded_cents,
    v_refundable_cents,
    case when v_resolution = 'none' then 0 else v_refundable_cents end,
    v_reservation.current_financial_resolution_event_id,
    jsonb_build_object(
      'request', v_request,
      'targetStatus', p_target_status
    )
  );

  update public.reservations reservation
  set status = p_target_status,
      withdrawn_at = case
        when p_target_status = 'withdrawn' then v_now
        else reservation.withdrawn_at
      end,
      financial_resolution = v_resolution,
      financial_resolution_notes = null,
      current_financial_resolution_event_id = v_event_id,
      updated_at = v_now,
      updated_by = v_user
  where reservation.organization_id = v_reservation.organization_id
    and reservation.id = v_reservation.id;

  delete from private.adopter_financial_resolution_write_contexts context
  where context.backend_pid = pg_catalog.pg_backend_pid()
    and context.transaction_id = pg_catalog.txid_current()
    and context.token = v_write_token;
  perform pg_catalog.set_config(
    'app.adopter_financial_resolution_managed_write',
    '',
    true
  );

  outcome := 'success';
  replayed := false;
  event_id := v_event_id;
  reservation_id := v_reservation.id;
  target_status := p_target_status;
  financial_resolution := v_resolution;
  paid_cents := v_paid_cents;
  refunded_cents := v_refunded_cents;
  refundable_cents := v_refundable_cents;
  result := jsonb_build_object(
    'reservationId', v_reservation.id,
    'eventId', v_event_id
  );
  return next;
end;
$function$;

revoke all on function public.transition_adopter_journey_exit(uuid, uuid, text, timestamptz)
  from public, anon;
grant execute on function public.transition_adopter_journey_exit(uuid, uuid, text, timestamptz)
  to authenticated;

do $$
declare
  v_mixed_currency_reservations integer;
begin
  select count(distinct reservation.id)::integer
  into v_mixed_currency_reservations
  from public.reservations reservation
  join public.payments payment
    on payment.organization_id = reservation.organization_id
    and payment.reservation_id = reservation.id
    and payment.deleted_at is null
  where reservation.status in ('withdrawn', 'cancelled', 'expired')
    and reservation.deleted_at is null
    and payment.currency <> reservation.currency;

  if v_mixed_currency_reservations > 0 then
    raise exception '% final adopter journeys contain mixed payment currencies',
      v_mixed_currency_reservations
      using errcode = '23514';
  end if;
end;
$$;

with candidates as (
  select
    reservation.organization_id,
    reservation.id as reservation_id,
    reservation.contact_id,
    reservation.financial_resolution as previous_financial_resolution,
    coalesce(payment_totals.paid_cents, 0)::bigint as paid_cents,
    coalesce(payment_totals.refunded_cents, 0)::bigint as refunded_cents,
    greatest(
      coalesce(payment_totals.paid_cents, 0) - coalesce(payment_totals.refunded_cents, 0),
      0
    )::bigint as refundable_cents
  from public.reservations reservation
  left join lateral (
    select
      coalesce(sum(payment.amount_cents) filter (
        where payment.payment_type not in ('refund', 'partial_refund')
          and payment.status in (
            'partially_paid', 'paid', 'partially_refunded',
            'converted_to_credit', 'transferred'
          )
      ), 0)::bigint as paid_cents,
      coalesce(sum(payment.amount_cents) filter (
        where payment.payment_type in ('refund', 'partial_refund')
          and payment.status in ('paid', 'partially_refunded', 'refunded')
      ), 0)::bigint as refunded_cents
    from public.payments payment
    where payment.organization_id = reservation.organization_id
      and payment.reservation_id = reservation.id
      and payment.deleted_at is null
  ) payment_totals on true
  where reservation.status in ('withdrawn', 'cancelled', 'expired')
    and reservation.deleted_at is null
    and reservation.current_financial_resolution_event_id is null
), inserted as (
  insert into public.adopter_financial_resolution_events (
    organization_id,
    reservation_id,
    contact_id,
    event_type,
    client_command_id,
    actor_profile_id,
    actor_role,
    financial_resolution,
    previous_financial_resolution,
    paid_cents,
    refunded_cents,
    refundable_cents,
    retained_cents,
    details
  )
  select
    candidate.organization_id,
    candidate.reservation_id,
    candidate.contact_id,
    'reconciled',
    gen_random_uuid(),
    null,
    'system',
    case
      when candidate.previous_financial_resolution not in ('none', 'pending')
        then candidate.previous_financial_resolution
      when candidate.refundable_cents > 0 then 'pending'
      else 'none'
    end,
    candidate.previous_financial_resolution,
    candidate.paid_cents,
    candidate.refunded_cents,
    candidate.refundable_cents,
    case when candidate.refundable_cents > 0 then candidate.refundable_cents else 0 end,
    jsonb_build_object(
      'source', 'migration_reconciliation',
      'decisionInferred', false,
      'historicalFinancialResolution', candidate.previous_financial_resolution
    )
  from candidates candidate
  returning id, organization_id, reservation_id, financial_resolution
)
update public.reservations reservation
set financial_resolution = inserted.financial_resolution,
    financial_resolution_notes = case
      when inserted.financial_resolution = 'pending'
        then 'Résolution financière ouverte lors de la réconciliation initiale.'
      else reservation.financial_resolution_notes
    end,
    current_financial_resolution_event_id = inserted.id
from inserted
where reservation.organization_id = inserted.organization_id
  and reservation.id = inserted.reservation_id;

create or replace function public.guard_adopter_financial_resolution_reservation_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_managed boolean :=
    private.is_adopter_financial_resolution_managed_write()
    or (
      session_user = 'postgres'
      and coalesce(current_setting('app.qa_hard_delete', true), '') = 'on'
    );
begin
  if v_managed then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.financial_resolution <> 'none'
      or new.financial_resolution_notes is not null
      or new.current_financial_resolution_event_id is not null
    then
      raise exception 'financial resolution managed fields require the dedicated RPC'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.financial_resolution is distinct from new.financial_resolution
      or old.financial_resolution_notes is distinct from new.financial_resolution_notes
      or old.current_financial_resolution_event_id is distinct from new.current_financial_resolution_event_id
      or (
        old.current_financial_resolution_event_id is not null
        and (
          old.status is distinct from new.status
          or old.withdrawn_at is distinct from new.withdrawn_at
          or old.deleted_at is distinct from new.deleted_at
        )
      )
    then
      raise exception 'financial resolution managed fields require the dedicated RPC'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.current_financial_resolution_event_id is not null then
    raise exception 'financial resolution managed fields require the dedicated RPC'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_adopter_financial_resolution_reservation_write()
from public, anon, authenticated, service_role;

drop trigger if exists guard_adopter_financial_resolution_reservation_write
on public.reservations;
create trigger guard_adopter_financial_resolution_reservation_write
before insert or update or delete on public.reservations
for each row execute function public.guard_adopter_financial_resolution_reservation_write();

create or replace function public.guard_adopter_financial_resolution_payment_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_managed boolean :=
    private.is_adopter_financial_resolution_managed_write()
    or (
      session_user = 'postgres'
      and coalesce(current_setting('app.qa_hard_delete', true), '') = 'on'
    );
  v_managed_reservation boolean := false;
begin
  if v_managed then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform 1
    from public.reservations reservation
    where reservation.organization_id = new.organization_id
      and reservation.id = new.reservation_id
    for update;

    select exists (
      select 1
      from public.reservations reservation
      where reservation.organization_id = new.organization_id
        and reservation.id = new.reservation_id
        and reservation.current_financial_resolution_event_id is not null
    ) into v_managed_reservation;
  elsif tg_op = 'DELETE' then
    perform 1
    from public.reservations reservation
    where reservation.organization_id = old.organization_id
      and reservation.id = old.reservation_id
    for update;

    select exists (
      select 1
      from public.reservations reservation
      where reservation.organization_id = old.organization_id
        and reservation.id = old.reservation_id
        and reservation.current_financial_resolution_event_id is not null
    ) into v_managed_reservation;
  else
    perform 1
    from public.reservations reservation
    where (
      reservation.organization_id = old.organization_id
      and reservation.id = old.reservation_id
    ) or (
      reservation.organization_id = new.organization_id
      and reservation.id = new.reservation_id
    )
    order by reservation.organization_id, reservation.id
    for update;

    select exists (
      select 1
      from public.reservations reservation
      where reservation.current_financial_resolution_event_id is not null
        and (
          (
            reservation.organization_id = old.organization_id
            and reservation.id = old.reservation_id
          )
          or (
            reservation.organization_id = new.organization_id
            and reservation.id = new.reservation_id
          )
        )
    ) into v_managed_reservation;
  end if;

  if v_managed_reservation then
    raise exception 'financial resolution managed payment requires the dedicated RPC'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_adopter_financial_resolution_payment_write()
from public, anon, authenticated, service_role;

drop trigger if exists guard_adopter_financial_resolution_payment_write
on public.payments;
create trigger guard_adopter_financial_resolution_payment_write
before insert or update or delete on public.payments
for each row execute function public.guard_adopter_financial_resolution_payment_write();

commit;

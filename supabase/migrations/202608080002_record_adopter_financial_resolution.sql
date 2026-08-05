-- ADOPTER-FINANCIAL-RESOLUTION-01
-- Responsible-role resolution and append-only rectification of negative exits.

begin;

create or replace function public.record_adopter_financial_resolution(
  p_reservation_id uuid,
  p_client_command_id uuid,
  p_financial_resolution text,
  p_refund_amount_cents integer,
  p_payment_method text,
  p_paid_at timestamptz,
  p_reason text,
  p_expected_event_id uuid,
  p_void_refund_payment_id uuid
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  event_id uuid,
  payment_id uuid,
  reservation_id uuid,
  financial_resolution text,
  paid_cents bigint,
  refunded_cents bigint,
  refundable_cents bigint,
  retained_cents bigint,
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
  v_void_payment public.payments%rowtype;
  v_actor_role text;
  v_event_id uuid := gen_random_uuid();
  v_payment_id uuid;
  v_event_type text;
  v_trimmed_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_amount integer := coalesce(p_refund_amount_cents, 0);
  v_paid_cents bigint := 0;
  v_refunded_before_cents bigint := 0;
  v_refunded_after_void_cents bigint := 0;
  v_refunded_after_cents bigint := 0;
  v_refundable_before_cents bigint := 0;
  v_refundable_after_void_cents bigint := 0;
  v_refundable_after_cents bigint := 0;
  v_request jsonb;
  v_write_token uuid;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  event_id := null;
  payment_id := null;
  reservation_id := p_reservation_id;
  financial_resolution := p_financial_resolution;
  paid_cents := 0;
  refunded_cents := 0;
  refundable_cents := 0;
  retained_cents := 0;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reservation_id is null
    or p_client_command_id is null
    or p_expected_event_id is null
    or p_financial_resolution not in ('full_refund', 'partial_refund', 'no_refund')
    or v_amount < 0
    or v_amount > 100000000
    or v_trimmed_reason is null
    or char_length(v_trimmed_reason) > 5000
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if v_amount > 0 then
    if p_payment_method is null
      or p_payment_method not in ('bank_transfer', 'cash', 'card', 'cheque', 'other')
      or p_paid_at is null
      or p_paid_at < timestamptz '2000-01-01 00:00:00+00'
      or p_paid_at::date > v_now::date
    then
      reason := 'invalid_refund_details';
      return next;
      return;
    end if;
  elsif p_payment_method is not null or p_paid_at is not null then
    reason := 'unexpected_refund_details';
    return next;
    return;
  end if;

  v_request := jsonb_build_object(
    'reservationId', p_reservation_id,
    'financialResolution', p_financial_resolution,
    'refundAmountCents', v_amount,
    'paymentMethod', p_payment_method,
    'paidAt', p_paid_at,
    'reason', v_trimmed_reason,
    'expectedEventId', p_expected_event_id,
    'voidRefundPaymentId', p_void_refund_payment_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'adopter_financial_resolution_command:' || p_client_command_id::text,
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
      or v_existing_event.event_type not in ('resolved', 'rectified')
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
      and membership.role in ('owner', 'admin');

    if not found then
      reason := 'not_found';
      return next;
      return;
    end if;

    outcome := 'success';
    replayed := true;
    event_id := v_existing_event.id;
    payment_id := v_existing_event.refund_payment_id;
    reservation_id := v_existing_event.reservation_id;
    financial_resolution := v_existing_event.financial_resolution;
    paid_cents := v_existing_event.paid_cents;
    refunded_cents := v_existing_event.refunded_cents;
    refundable_cents := v_existing_event.refundable_cents;
    retained_cents := v_existing_event.retained_cents;
    result := jsonb_build_object(
      'reservationId', v_existing_event.reservation_id,
      'eventId', v_existing_event.id,
      'paymentId', v_existing_event.refund_payment_id
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
    and membership.role in ('owner', 'admin');

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.status not in ('withdrawn', 'cancelled', 'expired') then
    outcome := 'blocked';
    reason := 'invalid_state';
    return next;
    return;
  end if;

  if v_reservation.current_financial_resolution_event_id is distinct from p_expected_event_id then
    outcome := 'blocked';
    reason := 'resolution_stale';
    return next;
    return;
  end if;

  if v_reservation.financial_resolution not in (
    'pending', 'full_refund', 'partial_refund', 'no_refund'
  ) then
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

  v_event_type := case
    when v_reservation.financial_resolution = 'pending' then 'resolved'
    else 'rectified'
  end;

  if v_event_type = 'resolved' and p_void_refund_payment_id is not null then
    outcome := 'blocked';
    reason := 'void_requires_rectification';
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
  into v_paid_cents, v_refunded_before_cents
  from public.payments payment
  where payment.organization_id = v_reservation.organization_id
    and payment.reservation_id = v_reservation.id
    and payment.deleted_at is null;

  v_refundable_before_cents := greatest(v_paid_cents - v_refunded_before_cents, 0);
  v_refunded_after_void_cents := v_refunded_before_cents;

  if p_void_refund_payment_id is not null then
    select payment.*
    into v_void_payment
    from public.payments payment
    where payment.organization_id = v_reservation.organization_id
      and payment.reservation_id = v_reservation.id
      and payment.id = p_void_refund_payment_id
      and payment.payment_type in ('refund', 'partial_refund')
      and payment.status in ('paid', 'partially_refunded', 'refunded')
      and payment.deleted_at is null
      and exists (
        select 1
        from public.adopter_financial_resolution_events event
        where event.organization_id = payment.organization_id
          and event.reservation_id = payment.reservation_id
          and event.refund_payment_id = payment.id
      )
    for no key update;

    if not found then
      outcome := 'blocked';
      reason := 'void_payment_not_found';
      return next;
      return;
    end if;

    v_refunded_after_void_cents := greatest(
      v_refunded_before_cents - v_void_payment.amount_cents,
      0
    );
  end if;

  v_refundable_after_void_cents := greatest(
    v_paid_cents - v_refunded_after_void_cents,
    0
  );

  if v_amount > v_refundable_after_void_cents then
    outcome := 'blocked';
    reason := 'amount_exceeds_refundable';
    refunded_cents := v_refunded_after_void_cents;
    refundable_cents := v_refundable_after_void_cents;
    return next;
    return;
  end if;

  v_refunded_after_cents := v_refunded_after_void_cents + v_amount;
  v_refundable_after_cents := greatest(v_paid_cents - v_refunded_after_cents, 0);

  if p_financial_resolution = 'full_refund' then
    if v_refundable_after_cents <> 0 or v_refunded_after_cents <= 0 then
      outcome := 'blocked';
      reason := 'resolution_amount_mismatch';
      return next;
      return;
    end if;
  elsif p_financial_resolution = 'partial_refund' then
    if v_refundable_after_cents <= 0 or v_refunded_after_cents <= 0 then
      outcome := 'blocked';
      reason := 'resolution_amount_mismatch';
      return next;
      return;
    end if;
  elsif p_financial_resolution = 'no_refund' then
    if v_refundable_after_cents <= 0 or v_refunded_after_cents <> 0 then
      outcome := 'blocked';
      reason := 'resolution_amount_mismatch';
      return next;
      return;
    end if;
  end if;

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

  if p_void_refund_payment_id is not null then
    update public.payments payment
    set status = 'cancelled',
        updated_at = v_now,
        updated_by = v_user
    where payment.organization_id = v_void_payment.organization_id
      and payment.id = v_void_payment.id;
  end if;

  if v_amount > 0 then
    insert into public.payments (
      organization_id,
      contact_id,
      reservation_id,
      amount_cents,
      currency,
      payment_type,
      status,
      payment_method,
      paid_at,
      notes,
      created_by,
      updated_by
    ) values (
      v_reservation.organization_id,
      v_reservation.contact_id,
      v_reservation.id,
      v_amount,
      v_reservation.currency,
      'refund',
      'paid',
      p_payment_method,
      p_paid_at,
      v_trimmed_reason,
      v_user,
      v_user
    ) returning id into v_payment_id;
  end if;

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
    refund_payment_id,
    voided_payment_id,
    reason,
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
    p_financial_resolution,
    v_reservation.financial_resolution,
    v_paid_cents,
    v_refunded_after_cents,
    v_refundable_after_cents,
    v_refundable_after_cents,
    v_payment_id,
    p_void_refund_payment_id,
    v_trimmed_reason,
    v_reservation.current_financial_resolution_event_id,
    jsonb_build_object(
      'request', v_request,
      'before', jsonb_build_object(
        'paidCents', v_paid_cents,
        'refundedCents', v_refunded_before_cents,
        'refundableCents', v_refundable_before_cents
      ),
      'after', jsonb_build_object(
        'paidCents', v_paid_cents,
        'refundedCents', v_refunded_after_cents,
        'refundableCents', v_refundable_after_cents
      )
    )
  );

  update public.reservations reservation
  set financial_resolution = p_financial_resolution,
      financial_resolution_notes = v_trimmed_reason,
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
  payment_id := v_payment_id;
  reservation_id := v_reservation.id;
  financial_resolution := p_financial_resolution;
  paid_cents := v_paid_cents;
  refunded_cents := v_refunded_after_cents;
  refundable_cents := v_refundable_after_cents;
  retained_cents := v_refundable_after_cents;
  result := jsonb_build_object(
    'reservationId', v_reservation.id,
    'eventId', v_event_id,
    'paymentId', v_payment_id,
    'voidedPaymentId', p_void_refund_payment_id
  );
  return next;
end;
$function$;

revoke all on function public.record_adopter_financial_resolution(
  uuid, uuid, text, integer, text, timestamptz, text, uuid, uuid
) from public, anon;
grant execute on function public.record_adopter_financial_resolution(
  uuid, uuid, text, integer, text, timestamptz, text, uuid, uuid
) to authenticated;

commit;

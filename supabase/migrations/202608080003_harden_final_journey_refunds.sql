-- ADOPTER-FINANCIAL-RESOLUTION-01
-- Final journeys must use the attributed financial-resolution command.

begin;

create or replace function public.create_reservation_refund(
  p_reservation_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_paid_at timestamptz,
  p_notes text default null
)
returns table (
  outcome text,
  payment_id uuid,
  reservation_id uuid,
  contact_id uuid,
  amount_cents integer,
  paid_cents bigint,
  refunded_cents bigint,
  refundable_cents bigint,
  reason text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_paid_cents bigint := 0;
  v_refunded_cents bigint := 0;
  v_refundable_cents bigint := 0;
  v_payment_id uuid;
  v_notes text := null;
  v_amount_label text;
  v_refundable_label text;
begin
  payment_id := null;
  reservation_id := p_reservation_id;
  contact_id := null;
  amount_cents := p_amount_cents;
  paid_cents := 0;
  refunded_cents := 0;
  refundable_cents := 0;
  reason := null;
  message := null;

  if v_user_id is null then
    outcome := 'ineligible';
    reason := 'not_authenticated';
    message := 'Vous devez être connecté pour enregistrer un remboursement.';
    return next;
    return;
  end if;

  if p_reservation_id is null then
    outcome := 'ineligible';
    reason := 'missing_reservation';
    message := 'La réservation est introuvable.';
    return next;
    return;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    outcome := 'ineligible';
    reason := 'invalid_amount';
    message := 'Le montant du remboursement doit être strictement positif.';
    return next;
    return;
  end if;

  if p_amount_cents > 100000000 then
    outcome := 'ineligible';
    reason := 'invalid_amount';
    message := 'Le montant du remboursement dépasse la limite autorisée.';
    return next;
    return;
  end if;

  if p_payment_method is null or p_payment_method not in (
    'bank_transfer', 'cash', 'card', 'cheque', 'other'
  ) then
    outcome := 'ineligible';
    reason := 'invalid_payment_method';
    message := 'Le moyen de remboursement n’est pas valide.';
    return next;
    return;
  end if;

  if p_paid_at is null
    or p_paid_at < timestamptz '2000-01-01 00:00:00+00'
    or p_paid_at > now() + interval '1 day' then
    outcome := 'ineligible';
    reason := 'invalid_paid_at';
    message := 'La date du remboursement n’est pas valide.';
    return next;
    return;
  end if;

  if p_notes is not null then
    v_notes := nullif(btrim(p_notes), '');
    if v_notes is not null and char_length(v_notes) > 2000 then
      outcome := 'ineligible';
      reason := 'invalid_notes';
      message := 'La note du remboursement est trop longue.';
      return next;
      return;
    end if;
  end if;

  select *
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id
    and r.deleted_at is null
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = r.organization_id
        and m.profile_id = v_user_id
        and m.status = 'active'
        and m.deleted_at is null
    )
  for update of r;

  if not found then
    outcome := 'ineligible';
    reason := 'reservation_not_found_or_forbidden';
    message := 'La réservation est introuvable.';
    return next;
    return;
  end if;

  reservation_id := v_reservation.id;
  contact_id := v_reservation.contact_id;

  if v_reservation.status in (
    'withdrawn', 'cancelled', 'expired', 'adopted', 'archived'
  ) then
    outcome := 'ineligible';
    reason := 'reservation_final';
    message := 'Utilisez la résolution financière du parcours adoptant pour enregistrer ce remboursement.';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.payments pay
    where pay.organization_id = v_reservation.organization_id
      and pay.reservation_id = v_reservation.id
      and pay.deleted_at is null
      and pay.currency <> v_reservation.currency
  ) then
    outcome := 'ineligible';
    reason := 'currency_mismatch';
    message := 'Les paiements du parcours utilisent plusieurs devises.';
    return next;
    return;
  end if;

  select
    coalesce(sum(pay.amount_cents) filter (
      where pay.payment_type not in ('refund', 'partial_refund')
        and pay.status in (
          'partially_paid', 'paid', 'partially_refunded',
          'converted_to_credit', 'transferred'
        )
    ), 0)::bigint,
    coalesce(sum(pay.amount_cents) filter (
      where pay.payment_type in ('refund', 'partial_refund')
        and pay.status in ('paid', 'partially_refunded', 'refunded')
    ), 0)::bigint
  into v_paid_cents, v_refunded_cents
  from public.payments pay
  where pay.reservation_id = v_reservation.id
    and pay.organization_id = v_reservation.organization_id
    and pay.deleted_at is null;

  v_refundable_cents := greatest(v_paid_cents - v_refunded_cents, 0);
  paid_cents := v_paid_cents;
  refunded_cents := v_refunded_cents;
  refundable_cents := v_refundable_cents;

  if p_amount_cents > v_refundable_cents then
    v_amount_label := replace(trim(to_char(p_amount_cents / 100.0, 'FM999999990.00')), '.', ',');
    v_refundable_label := replace(trim(to_char(v_refundable_cents / 100.0, 'FM999999990.00')), '.', ',');
    outcome := 'exceeds_refundable';
    reason := 'amount_exceeds_refundable';
    message := format(
      'Le montant du remboursement (%s €) dépasse le solde encore remboursable (%s €).',
      v_amount_label,
      v_refundable_label
    );
    return next;
    return;
  end if;

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
    requested_at,
    due_date,
    refunded_at,
    notes,
    created_by,
    updated_by
  ) values (
    v_reservation.organization_id,
    v_reservation.contact_id,
    v_reservation.id,
    p_amount_cents,
    v_reservation.currency,
    'refund',
    'paid',
    p_payment_method,
    p_paid_at,
    null,
    null,
    null,
    v_notes,
    v_user_id,
    v_user_id
  )
  returning id into v_payment_id;

  payment_id := v_payment_id;
  amount_cents := p_amount_cents;
  refunded_cents := v_refunded_cents + p_amount_cents;
  refundable_cents := greatest(v_paid_cents - (v_refunded_cents + p_amount_cents), 0);
  outcome := 'created';
  reason := null;
  message := null;
  return next;
end;
$$;

revoke all on function public.create_reservation_refund(uuid, integer, text, timestamptz, text)
  from public;
revoke all on function public.create_reservation_refund(uuid, integer, text, timestamptz, text)
  from anon;
grant execute on function public.create_reservation_refund(uuid, integer, text, timestamptz, text)
  to authenticated;

commit;

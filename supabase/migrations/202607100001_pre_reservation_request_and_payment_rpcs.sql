create or replace function public.create_pre_reservation_request_for_application(
  p_application_id uuid,
  p_target_litter_id uuid default null,
  p_target_litter_group_id uuid default null
)
returns table (
  outcome text,
  application_id uuid,
  reservation_id uuid,
  payment_id uuid,
  reservation_created boolean,
  payment_created boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_application public.applications%rowtype;
  v_litter public.litters%rowtype;
  v_group public.litter_groups%rowtype;
  v_reservation public.reservations%rowtype;
  v_reservation_count integer;
  v_payment public.payments%rowtype;
  v_amount_cents integer;
  v_currency text;
  v_delay_days integer;
  v_due_date date;
  v_now timestamptz := now();
  v_effective_litter_id uuid := p_target_litter_id;
  v_effective_group_id uuid := p_target_litter_group_id;
begin
  application_id := p_application_id;
  reservation_id := null;
  payment_id := null;
  reservation_created := false;
  payment_created := false;
  reason := null;

  if v_user_id is null then
    outcome := 'ineligible';
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  select *
  into v_application
  from public.applications
  where id = p_application_id
    and deleted_at is null
  for update;

  if not found then
    outcome := 'ineligible';
    reason := 'application_not_found';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.organization_id = v_application.organization_id
      and m.profile_id = v_user_id
      and m.status = 'active'
      and m.deleted_at is null
  ) then
    outcome := 'ineligible';
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_application.status <> 'qualified' then
    outcome := 'ineligible';
    reason := 'application_not_qualified';
    return next;
    return;
  end if;

  if v_application.contact_id is null then
    outcome := 'ineligible';
    reason := 'missing_contact';
    return next;
    return;
  end if;

  if v_effective_litter_id is null then
    v_effective_litter_id := v_application.desired_litter_id;
  end if;

  if v_effective_group_id is null then
    v_effective_group_id := v_application.desired_litter_group_id;
  end if;

  if v_effective_litter_id is not null then
    select *
    into v_litter
    from public.litters
    where id = v_effective_litter_id
      and organization_id = v_application.organization_id
      and deleted_at is null;

    if not found then
      outcome := 'ineligible';
      reason := 'litter_not_found';
      return next;
      return;
    end if;

    if v_effective_group_id is null then
      v_effective_group_id := v_litter.litter_group_id;
    elsif v_litter.litter_group_id is not null
      and v_litter.litter_group_id <> v_effective_group_id then
      outcome := 'ineligible';
      reason := 'litter_group_mismatch';
      return next;
      return;
    end if;
  end if;

  if v_effective_group_id is not null then
    select *
    into v_group
    from public.litter_groups
    where id = v_effective_group_id
      and organization_id = v_application.organization_id
      and deleted_at is null;

    if not found then
      outcome := 'ineligible';
      reason := 'litter_group_not_found';
      return next;
      return;
    end if;
  end if;

  select count(*)::integer
  into v_reservation_count
  from public.reservations r
  where r.organization_id = v_application.organization_id
    and r.application_id = v_application.id
    and r.deleted_at is null;

  if v_reservation_count > 1 then
    outcome := 'conflict';
    reason := 'multiple_reservations';
    return next;
    return;
  end if;

  if v_reservation_count = 1 then
    select *
    into v_reservation
    from public.reservations r
    where r.organization_id = v_application.organization_id
      and r.application_id = v_application.id
      and r.deleted_at is null
    for update;

    if v_reservation.status = 'draft' then
      outcome := 'conflict';
      reservation_id := v_reservation.id;
      reason := 'draft_reservation_exists';
      return next;
      return;
    end if;

    if v_reservation.status <> 'pre_reservation_requested' then
      outcome := 'conflict';
      reservation_id := v_reservation.id;
      reason := 'reservation_already_started';
      return next;
      return;
    end if;

    if v_effective_litter_id is not null then
      if not (
        v_reservation.litter_id = v_effective_litter_id
        or (
          v_reservation.litter_id is null
          and v_reservation.litter_group_id is not distinct from v_effective_group_id
        )
      ) then
        outcome := 'conflict';
        reservation_id := v_reservation.id;
        reason := 'reservation_scope_mismatch';
        return next;
        return;
      end if;
    elsif v_reservation.litter_group_id is distinct from v_effective_group_id then
      outcome := 'conflict';
      reservation_id := v_reservation.id;
      reason := 'reservation_scope_mismatch';
      return next;
      return;
    end if;

    reservation_id := v_reservation.id;
  else
    select
      coalesce(os.default_pre_reservation_deposit_cents, 25000),
      coalesce(os.default_currency, 'EUR'),
      coalesce(os.pre_reservation_response_delay_days, 15)
    into v_amount_cents, v_currency, v_delay_days
    from public.organization_settings os
    where os.organization_id = v_application.organization_id
      and os.deleted_at is null;

    v_amount_cents := coalesce(v_amount_cents, 25000);
    v_currency := coalesce(v_currency, 'EUR');
    v_delay_days := coalesce(v_delay_days, 15);
    v_due_date := current_date + v_delay_days;

    insert into public.reservations (
      organization_id,
      contact_id,
      application_id,
      litter_group_id,
      litter_id,
      species,
      breed,
      reserved_sex_preference,
      rank_initial,
      rank_active,
      rank_assigned_at,
      status,
      pre_reservation_deadline,
      currency,
      created_by,
      updated_by
    )
    values (
      v_application.organization_id,
      v_application.contact_id,
      v_application.id,
      v_effective_group_id,
      v_effective_litter_id,
      coalesce(v_application.species, 'dog'),
      coalesce(v_application.breed, 'Golden Retriever'),
      coalesce(v_application.desired_sex_preference, 'unknown'),
      v_application.initial_rank,
      v_application.active_rank,
      v_now,
      'pre_reservation_requested',
      v_due_date::timestamptz + time '12:00:00',
      v_currency,
      v_user_id,
      v_user_id
    )
    returning * into v_reservation;

    reservation_id := v_reservation.id;
    reservation_created := true;
  end if;

  select *
  into v_payment
  from public.payments p
  where p.organization_id = v_application.organization_id
    and p.reservation_id = v_reservation.id
    and p.payment_type in ('arrhes', 'pre_reservation_deposit_refundable')
    and p.status in ('requested', 'pending', 'partially_paid', 'paid')
    and p.deleted_at is null
  order by p.created_at asc
  limit 1
  for update;

  if found then
    payment_id := v_payment.id;
    outcome := case when reservation_created then 'created' else 'already_exists' end;
    return next;
    return;
  end if;

  select
    coalesce(os.default_pre_reservation_deposit_cents, 25000),
    coalesce(os.default_currency, 'EUR'),
    coalesce(os.pre_reservation_response_delay_days, 15)
  into v_amount_cents, v_currency, v_delay_days
  from public.organization_settings os
  where os.organization_id = v_application.organization_id
    and os.deleted_at is null;

  v_amount_cents := coalesce(v_amount_cents, 25000);
  v_currency := coalesce(v_currency, 'EUR');
  v_delay_days := coalesce(v_delay_days, 15);
  v_due_date := current_date + v_delay_days;

  insert into public.payments (
    organization_id,
    contact_id,
    reservation_id,
    amount_cents,
    currency,
    payment_type,
    status,
    requested_at,
    due_date,
    payment_method,
    notes,
    created_by,
    updated_by
  )
  values (
    v_application.organization_id,
    v_application.contact_id,
    v_reservation.id,
    v_amount_cents,
    v_currency,
    'arrhes',
    'requested',
    v_now,
    v_due_date,
    'bank_transfer',
    'Demande 1/2 — avance sur arrhes de pré-réservation. Aucun e-mail réel envoyé automatiquement.',
    v_user_id,
    v_user_id
  )
  returning * into v_payment;

  payment_id := v_payment.id;
  payment_created := true;
  outcome := 'created';
  return next;
end;
$$;

create or replace function public.mark_pre_reservation_payment_paid(
  p_payment_id uuid,
  p_paid_at timestamptz default now(),
  p_payment_method text default 'bank_transfer'
)
returns table (
  outcome text,
  payment_id uuid,
  reservation_id uuid,
  contact_id uuid,
  reservation_updated boolean,
  candidate_role_deactivated boolean,
  pre_reservation_holder_activated boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.payments%rowtype;
  v_reservation public.reservations%rowtype;
  v_required_amount_cents integer;
  v_holder_role public.contact_roles%rowtype;
  v_active_holder_exists boolean;
  v_other_active_journey_count integer;
  v_deactivated_role_count integer;
  v_now timestamptz := now();
  v_journey_roles text[] := array[
    'candidate',
    'pre_reservation_holder',
    'reservation_holder',
    'adopter',
    'former_adopter'
  ];
begin
  payment_id := p_payment_id;
  reservation_id := null;
  contact_id := null;
  reservation_updated := false;
  candidate_role_deactivated := false;
  pre_reservation_holder_activated := false;
  reason := null;

  if v_user_id is null then
    outcome := 'ineligible';
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_payment_method not in (
    'bank_transfer', 'cash', 'card', 'cheque', 'paypal', 'stripe',
    'other', 'unknown'
  ) then
    outcome := 'ineligible';
    reason := 'invalid_payment_method';
    return next;
    return;
  end if;

  if p_paid_at is null
    or p_paid_at < timestamptz '2000-01-01 00:00:00+00'
    or p_paid_at > now() + interval '1 day' then
    outcome := 'ineligible';
    reason := 'invalid_paid_at';
    return next;
    return;
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
    and deleted_at is null
  for update;

  if not found then
    outcome := 'ineligible';
    reason := 'payment_not_found';
    return next;
    return;
  end if;

  payment_id := v_payment.id;
  reservation_id := v_payment.reservation_id;
  contact_id := v_payment.contact_id;

  if v_payment.reservation_id is null then
    outcome := 'ineligible';
    reason := 'missing_reservation';
    return next;
    return;
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = v_payment.reservation_id
    and organization_id = v_payment.organization_id
    and deleted_at is null
  for update;

  if not found then
    outcome := 'ineligible';
    reason := 'reservation_not_found';
    return next;
    return;
  end if;

  reservation_id := v_reservation.id;
  contact_id := v_reservation.contact_id;

  if not exists (
    select 1
    from public.memberships m
    where m.organization_id = v_payment.organization_id
      and m.profile_id = v_user_id
      and m.status = 'active'
      and m.deleted_at is null
  ) then
    outcome := 'ineligible';
    reason := 'membership_required';
    return next;
    return;
  end if;

  if v_payment.organization_id <> v_reservation.organization_id
    or v_payment.contact_id <> v_reservation.contact_id then
    outcome := 'conflict';
    reason := 'payment_reservation_mismatch';
    return next;
    return;
  end if;

  if v_payment.payment_type not in ('arrhes', 'pre_reservation_deposit_refundable') then
    outcome := 'ineligible';
    reason := 'invalid_payment_type';
    return next;
    return;
  end if;

  select coalesce(os.default_pre_reservation_deposit_cents, 25000)
  into v_required_amount_cents
  from public.organization_settings os
  where os.organization_id = v_payment.organization_id
    and os.deleted_at is null;

  v_required_amount_cents := coalesce(v_required_amount_cents, 25000);

  if v_payment.amount_cents < v_required_amount_cents then
    outcome := 'ineligible';
    reason := 'insufficient_amount';
    return next;
    return;
  end if;

  if v_payment.status = 'paid' then
    select exists (
      select 1
      from public.contact_roles cr
      where cr.organization_id = v_reservation.organization_id
        and cr.contact_id = v_reservation.contact_id
        and cr.role = 'pre_reservation_holder'
        and cr.is_active
        and cr.deleted_at is null
    )
    into v_active_holder_exists;

    select count(*)::integer
    into v_other_active_journey_count
    from public.contact_roles cr
    where cr.organization_id = v_reservation.organization_id
      and cr.contact_id = v_reservation.contact_id
      and cr.role = any(v_journey_roles)
      and cr.role <> 'pre_reservation_holder'
      and cr.is_active
      and cr.deleted_at is null;

    if v_reservation.status = 'pre_reservation_paid'
      and v_active_holder_exists
      and v_other_active_journey_count = 0 then
      outcome := 'already_paid';
      return next;
      return;
    end if;

    outcome := 'conflict';
    reason := 'paid_state_incoherent';
    return next;
    return;
  end if;

  if v_payment.status not in ('requested', 'pending', 'partially_paid') then
    outcome := 'ineligible';
    reason := 'invalid_payment_status';
    return next;
    return;
  end if;

  if v_reservation.status <> 'pre_reservation_requested' then
    outcome := 'conflict';
    reason := 'invalid_reservation_status';
    return next;
    return;
  end if;

  update public.payments
  set
    status = 'paid',
    paid_at = p_paid_at,
    payment_method = p_payment_method,
    updated_at = v_now,
    updated_by = v_user_id
  where id = v_payment.id
    and organization_id = v_payment.organization_id
    and status in ('requested', 'pending', 'partially_paid')
    and deleted_at is null;

  update public.reservations
  set
    status = 'pre_reservation_paid',
    updated_at = v_now,
    updated_by = v_user_id
  where id = v_reservation.id
    and organization_id = v_reservation.organization_id
    and status = 'pre_reservation_requested'
    and deleted_at is null;

  reservation_updated := true;

  update public.contact_roles cr
  set
    is_active = false,
    ended_at = p_paid_at::date,
    updated_at = v_now,
    updated_by = v_user_id
  where cr.organization_id = v_reservation.organization_id
    and cr.contact_id = v_reservation.contact_id
    and cr.role = any(v_journey_roles)
    and cr.role <> 'pre_reservation_holder'
    and cr.is_active
    and cr.deleted_at is null;

  get diagnostics v_deactivated_role_count = row_count;
  candidate_role_deactivated := v_deactivated_role_count > 0;

  select *
  into v_holder_role
  from public.contact_roles cr
  where cr.organization_id = v_reservation.organization_id
    and cr.contact_id = v_reservation.contact_id
    and cr.role = 'pre_reservation_holder'
    and cr.deleted_at is null
  order by cr.is_active desc, cr.created_at desc
  limit 1
  for update;

  if found then
    if not v_holder_role.is_active then
      update public.contact_roles cr
      set
        is_active = true,
        started_at = coalesce(started_at, p_paid_at::date),
        ended_at = null,
        updated_at = v_now,
        updated_by = v_user_id
      where cr.id = v_holder_role.id
        and cr.organization_id = v_reservation.organization_id
        and cr.deleted_at is null;

      pre_reservation_holder_activated := true;
    end if;
  else
    insert into public.contact_roles (
      organization_id,
      contact_id,
      role,
      started_at,
      is_active,
      notes,
      created_by,
      updated_by
    )
    values (
      v_reservation.organization_id,
      v_reservation.contact_id,
      'pre_reservation_holder',
      p_paid_at::date,
      true,
      'Pré-réservation réglée.',
      v_user_id,
      v_user_id
    );

    pre_reservation_holder_activated := true;
  end if;

  select count(*)::integer
  into v_other_active_journey_count
  from public.contact_roles cr
  where cr.organization_id = v_reservation.organization_id
    and cr.contact_id = v_reservation.contact_id
    and cr.role = any(v_journey_roles)
    and cr.role <> 'pre_reservation_holder'
    and cr.is_active
    and cr.deleted_at is null;

  if v_other_active_journey_count > 0 then
    outcome := 'conflict';
    reason := 'journey_role_conflict';
    return next;
    return;
  end if;

  outcome := 'paid';
  return next;
end;
$$;

create or replace view public.application_overview
with (security_invoker = true)
as
select
  a.id,
  a.organization_id,
  a.contact_id,
  c.display_name as contact_display_name,
  c.email as contact_email,
  c.phone as contact_phone,
  a.species,
  a.breed,
  a.desired_sex_preference,
  a.project_description,
  a.status,
  pf.id as public_form_id,
  pf.name as public_form_name,
  pf.slug as public_form_slug,
  coalesce(a.submitted_at, fs.submitted_at, a.created_at) as submitted_at,
  a.reviewed_at,
  case
    when a.reviewed_at is not null then 'reviewed'
    else 'to_review'
  end as review_status,
  a.initial_rank,
  a.active_rank,
  a.created_at,
  a.updated_at,
  exists (
    select 1
    from public.reservations r
    where r.organization_id = a.organization_id
      and r.application_id = a.id
      and r.deleted_at is null
      and r.status not in ('draft', 'pre_reservation_requested')
  ) as has_started_adopter_journey
from public.applications a
join public.contacts c
  on c.id = a.contact_id
  and c.organization_id = a.organization_id
left join public.form_submissions fs
  on fs.id = a.form_submission_id
  and fs.organization_id = a.organization_id
left join public.public_forms pf
  on pf.id = fs.public_form_id
  and pf.organization_id = a.organization_id
where a.deleted_at is null
  and c.deleted_at is null;

revoke all on function public.create_pre_reservation_request_for_application(uuid, uuid, uuid)
  from public;
revoke all on function public.create_pre_reservation_request_for_application(uuid, uuid, uuid)
  from anon;
grant execute on function public.create_pre_reservation_request_for_application(uuid, uuid, uuid)
  to authenticated;

revoke all on function public.mark_pre_reservation_payment_paid(uuid, timestamptz, text)
  from public;
revoke all on function public.mark_pre_reservation_payment_paid(uuid, timestamptz, text)
  from anon;
grant execute on function public.mark_pre_reservation_payment_paid(uuid, timestamptz, text)
  to authenticated;

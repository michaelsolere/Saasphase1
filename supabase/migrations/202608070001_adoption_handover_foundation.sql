-- ADOPTION-HANDOVER-SAFETY-01
-- Atomic adoption finalization with graded authorization and immutable audit.

begin;

create table public.adoption_handover_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null,
  contact_id uuid not null,
  animal_id uuid not null,
  event_type text not null,
  client_command_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  adoption_completed_at timestamptz,
  previous_adoption_completed_at timestamptz,
  checks jsonb not null default '{}'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  reason text,
  previous_event_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint adoption_handover_events_organization_id_id_key
    unique (organization_id, id),
  constraint adoption_handover_events_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint adoption_handover_events_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint adoption_handover_events_animal_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint adoption_handover_events_previous_event_fk
    foreign key (organization_id, previous_event_id)
    references public.adoption_handover_events (organization_id, id) on delete restrict,
  constraint adoption_handover_events_type_check
    check (event_type in ('finalized', 'date_corrected', 'reversed', 'incident_opened')),
  constraint adoption_handover_events_actor_role_check
    check (actor_role in ('owner', 'admin', 'member')),
  constraint adoption_handover_events_checks_check
    check (jsonb_typeof(checks) = 'object'),
  constraint adoption_handover_events_exceptions_check
    check (jsonb_typeof(exceptions) = 'array'),
  constraint adoption_handover_events_details_check
    check (jsonb_typeof(details) = 'object'),
  constraint adoption_handover_events_reason_check
    check (
      reason is null
      or char_length(btrim(reason)) between 1 and 5000
    ),
  constraint adoption_handover_events_event_reason_check
    check (
      (event_type = 'finalized' and (jsonb_array_length(exceptions) = 0 or reason is not null))
      or (event_type <> 'finalized' and reason is not null)
    )
);

create unique index adoption_handover_events_command_key
  on public.adoption_handover_events (client_command_id);
create index adoption_handover_events_reservation_history_idx
  on public.adoption_handover_events (
    organization_id,
    reservation_id,
    occurred_at desc,
    id desc
  );

create or replace function public.adoption_handover_event_append_only()
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

  raise exception 'adoption handover history is immutable'
    using errcode = '55000';
end;
$function$;

create trigger adoption_handover_events_immutable
before update or delete on public.adoption_handover_events
for each row execute function public.adoption_handover_event_append_only();

alter table public.adoption_handover_events enable row level security;

revoke all on table public.adoption_handover_events
  from public, anon, authenticated, service_role;
grant select on table public.adoption_handover_events to authenticated;

create policy adoption_handover_events_select_member
on public.adoption_handover_events
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.finalize_adoption_handover(
  p_reservation_id uuid,
  p_client_command_id uuid,
  p_adoption_completed_at timestamptz,
  p_expected_reservation_updated_at timestamptz,
  p_acknowledged_exception_codes text[],
  p_exception_reason text
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  event_id uuid,
  blocker_codes text[],
  exception_codes text[],
  adoption_completed_at timestamptz,
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
  v_animal public.animals%rowtype;
  v_actor_role text;
  v_existing_event public.adoption_handover_events%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_blockers text[] := array[]::text[];
  v_exceptions text[] := array[]::text[];
  v_acknowledged text[] := array[]::text[];
  v_paid_cents bigint := 0;
  v_refunded_cents bigint := 0;
  v_balance_remaining_cents bigint;
  v_commitment_status text;
  v_contract_status text;
  v_request jsonb;
  v_checks jsonb;
  v_trimmed_reason text := nullif(btrim(coalesce(p_exception_reason, '')), '');
  v_role_id uuid;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  event_id := null;
  blocker_codes := array[]::text[];
  exception_codes := array[]::text[];
  adoption_completed_at := null;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reservation_id is null
    or p_client_command_id is null
    or p_adoption_completed_at is null
    or p_expected_reservation_updated_at is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select coalesce(array_agg(code order by code), array[]::text[])
  into v_acknowledged
  from (
    select distinct btrim(value) as code
    from unnest(coalesce(p_acknowledged_exception_codes, array[]::text[])) value
    where nullif(btrim(value), '') is not null
  ) normalized;

  v_request := jsonb_build_object(
    'reservationId', p_reservation_id,
    'adoptionCompletedAt', p_adoption_completed_at,
    'expectedReservationUpdatedAt', p_expected_reservation_updated_at,
    'acknowledgedExceptionCodes', to_jsonb(v_acknowledged),
    'exceptionReason', v_trimmed_reason
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'adoption_handover_command:' || p_client_command_id::text,
      0
    )
  );

  select event.*
  into v_existing_event
  from public.adoption_handover_events event
  where event.client_command_id = p_client_command_id;

  if found then
    if v_existing_event.reservation_id <> p_reservation_id
      or v_existing_event.actor_profile_id <> v_user
      or v_existing_event.event_type <> 'finalized'
      or v_existing_event.details->'request' is distinct from v_request
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    select membership.role
    into v_actor_role
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

    select coalesce(array_agg(value order by value), array[]::text[])
    into v_exceptions
    from jsonb_array_elements_text(v_existing_event.exceptions) value;

    outcome := 'success';
    replayed := true;
    event_id := v_existing_event.id;
    exception_codes := v_exceptions;
    adoption_completed_at := v_existing_event.adoption_completed_at;
    result := jsonb_build_object(
      'reservationId', v_existing_event.reservation_id,
      'animalId', v_existing_event.animal_id,
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

  if v_reservation.contact_id is null then
    v_blockers := array_append(v_blockers, 'contact_missing');
  else
    perform 1
    from public.contacts contact
    where contact.organization_id = v_reservation.organization_id
      and contact.id = v_reservation.contact_id
      and contact.deleted_at is null
    for no key update;
    if not found then
      v_blockers := array_append(v_blockers, 'contact_missing');
    end if;
  end if;

  if v_reservation.animal_id is null then
    v_blockers := array_append(v_blockers, 'animal_missing');
  else
    select animal.*
    into v_animal
    from public.animals animal
    where animal.organization_id = v_reservation.organization_id
      and animal.id = v_reservation.animal_id
      and animal.deleted_at is null
    for no key update;

    if not found then
      v_blockers := array_append(v_blockers, 'animal_missing');
    elsif v_animal.status <> 'reserved'
      or v_animal.ownership_status <> 'produced'
      or v_animal.is_breeder
      or v_animal.is_external
      or v_animal.is_retired
      or v_animal.species is distinct from v_reservation.species
      or v_animal.breed is distinct from v_reservation.breed
      or exists (
        select 1
        from public.reservations other_reservation
        where other_reservation.organization_id = v_reservation.organization_id
          and other_reservation.animal_id = v_animal.id
          and other_reservation.id <> v_reservation.id
          and other_reservation.deleted_at is null
          and other_reservation.status in (
            'animal_assigned', 'adoption_ready', 'adopted'
          )
      )
    then
      v_blockers := array_append(v_blockers, 'animal_inconsistent');
    end if;
  end if;

  if v_reservation.status <> 'animal_assigned' then
    v_blockers := array_append(v_blockers, 'reservation_not_ready');
  end if;

  if exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id
      and instance.reservation_id = v_reservation.id
      and (
        instance.status <> 'suspended'
        or instance.invited_at is not null
        or instance.suspension_reason <> 'Adoption finalization reversed.'
      )
  ) then
    v_blockers := array_append(v_blockers, 'post_adoption_state_inconsistent');
  end if;

  if v_reservation.updated_at is distinct from p_expected_reservation_updated_at then
    v_blockers := array_append(v_blockers, 'reservation_stale');
  end if;

  if p_adoption_completed_at > v_now then
    v_blockers := array_append(v_blockers, 'adoption_in_future');
  elsif v_animal.birth_date is not null
    and (p_adoption_completed_at at time zone 'UTC')::date < v_animal.birth_date
  then
    v_blockers := array_append(v_blockers, 'adoption_before_birth');
  end if;

  if v_animal.id is not null
    and nullif(btrim(coalesce(v_animal.identification_number, '')), '') is null
  then
    v_exceptions := array_append(v_exceptions, 'animal_identification_missing');
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

  if v_reservation.price_cents is null then
    v_exceptions := array_append(v_exceptions, 'price_missing');
    v_balance_remaining_cents := null;
  else
    v_balance_remaining_cents :=
      v_reservation.price_cents::bigint - v_paid_cents + v_refunded_cents;
    if v_balance_remaining_cents > 0 then
      v_exceptions := array_append(v_exceptions, 'balance_remaining');
    end if;
  end if;

  select document.status
  into v_commitment_status
  from public.documents document
  where document.organization_id = v_reservation.organization_id
    and document.reservation_id = v_reservation.id
    and document.document_type = 'commitment_certificate'
    and document.deleted_at is null
  order by
    case when document.status = 'signed' then 0 else 1 end,
    document.created_at desc,
    document.id desc
  limit 1;

  if v_commitment_status is null then
    v_exceptions := array_append(v_exceptions, 'commitment_certificate_missing');
  elsif v_commitment_status <> 'signed' then
    v_exceptions := array_append(v_exceptions, 'commitment_certificate_not_signed');
  end if;

  select document.status
  into v_contract_status
  from public.documents document
  where document.organization_id = v_reservation.organization_id
    and document.reservation_id = v_reservation.id
    and document.document_type = 'reservation_contract'
    and document.deleted_at is null
  order by
    case when document.status = 'signed' then 0 else 1 end,
    document.created_at desc,
    document.id desc
  limit 1;

  if v_contract_status is null then
    v_exceptions := array_append(v_exceptions, 'reservation_contract_missing');
  elsif v_contract_status <> 'signed' then
    v_exceptions := array_append(v_exceptions, 'reservation_contract_not_signed');
  end if;

  select coalesce(array_agg(code order by code), array[]::text[])
  into v_blockers
  from (select distinct unnest(v_blockers) as code) codes;
  select coalesce(array_agg(code order by code), array[]::text[])
  into v_exceptions
  from (select distinct unnest(v_exceptions) as code) codes;

  blocker_codes := v_blockers;
  exception_codes := v_exceptions;

  if cardinality(v_blockers) > 0 then
    outcome := 'blocked';
    reason := v_blockers[1];
    result := jsonb_build_object('blockerCodes', to_jsonb(v_blockers));
    return next;
    return;
  end if;

  if cardinality(v_exceptions) > 0 then
    if v_actor_role not in ('owner', 'admin') then
      outcome := 'blocked';
      reason := 'exception_authorization_required';
      result := jsonb_build_object('exceptionCodes', to_jsonb(v_exceptions));
      return next;
      return;
    end if;
    if v_acknowledged is distinct from v_exceptions
      or v_trimmed_reason is null
    then
      outcome := 'blocked';
      reason := 'exceptions_require_confirmation';
      result := jsonb_build_object('exceptionCodes', to_jsonb(v_exceptions));
      return next;
      return;
    end if;
  elsif cardinality(v_acknowledged) > 0 or v_trimmed_reason is not null then
    outcome := 'blocked';
    reason := 'unexpected_exception_confirmation';
    return next;
    return;
  end if;

  v_checks := jsonb_build_object(
    'reservationStatus', v_reservation.status,
    'reservationUpdatedAt', v_reservation.updated_at,
    'animalStatus', v_animal.status,
    'animalIdentificationPresent',
      nullif(btrim(coalesce(v_animal.identification_number, '')), '') is not null,
    'priceCents', v_reservation.price_cents,
    'paidCents', v_paid_cents,
    'refundedCents', v_refunded_cents,
    'balanceRemainingCents', v_balance_remaining_cents,
    'commitmentCertificateStatus', v_commitment_status,
    'reservationContractStatus', v_contract_status
  );

  if exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id
      and instance.reservation_id = v_reservation.id
  ) then
    perform pg_catalog.set_config('app.adoption_handover_correction', 'on', true);
  end if;

  update public.reservations
  set status = 'adopted',
      adoption_completed_at = p_adoption_completed_at,
      updated_at = v_now,
      updated_by = v_user
  where organization_id = v_reservation.organization_id
    and id = v_reservation.id;

  update public.animals
  set status = 'adopted',
      ownership_status = 'adopted_out',
      updated_at = v_now,
      updated_by = v_user
  where organization_id = v_reservation.organization_id
    and id = v_animal.id;

  insert into public.contact_roles (
    organization_id,
    contact_id,
    role,
    started_at,
    is_active,
    created_by,
    updated_by
  ) values (
    v_reservation.organization_id,
    v_reservation.contact_id,
    'adopter',
    (p_adoption_completed_at at time zone 'UTC')::date,
    true,
    v_user,
    v_user
  )
  on conflict (organization_id, contact_id, role)
    where is_active and deleted_at is null
  do update set
    started_at = least(contact_roles.started_at, excluded.started_at),
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning id into v_role_id;

  update public.contact_roles role
  set is_active = false,
      ended_at = greatest(
        role.started_at,
        (p_adoption_completed_at at time zone 'UTC')::date
      ),
      updated_at = v_now,
      updated_by = v_user
  where role.organization_id = v_reservation.organization_id
    and role.contact_id = v_reservation.contact_id
    and role.is_active
    and role.deleted_at is null
    and role.role in (
      'candidate', 'pre_reservation_holder', 'reservation_holder', 'former_adopter'
    )
    and (
      role.role = 'former_adopter'
      or (
        role.role = 'candidate'
        and not exists (
          select 1
          from public.applications application
          where application.organization_id = v_reservation.organization_id
            and application.contact_id = v_reservation.contact_id
            and application.id is distinct from v_reservation.application_id
            and application.deleted_at is null
            and application.status in (
              'new', 'to_review', 'to_call', 'qualified', 'waiting_litter'
            )
        )
      )
      or (
        role.role = 'pre_reservation_holder'
        and not exists (
          select 1
          from public.reservations other_reservation
          where other_reservation.organization_id = v_reservation.organization_id
            and other_reservation.contact_id = v_reservation.contact_id
            and other_reservation.id <> v_reservation.id
            and other_reservation.deleted_at is null
            and other_reservation.status in (
              'pre_reservation_requested', 'pre_reservation_paid'
            )
        )
      )
      or (
        role.role = 'reservation_holder'
        and not exists (
          select 1
          from public.reservations other_reservation
          where other_reservation.organization_id = v_reservation.organization_id
            and other_reservation.contact_id = v_reservation.contact_id
            and other_reservation.id <> v_reservation.id
            and other_reservation.deleted_at is null
            and other_reservation.status in (
              'active', 'confirmed_after_birth', 'waiting_for_available_sex',
              'postponed', 'animal_assigned', 'adoption_ready'
            )
        )
      )
    );

  insert into public.adoption_handover_events (
    id,
    organization_id,
    reservation_id,
    contact_id,
    animal_id,
    event_type,
    client_command_id,
    actor_profile_id,
    actor_role,
    adoption_completed_at,
    checks,
    exceptions,
    reason,
    details,
    occurred_at
  ) values (
    v_event_id,
    v_reservation.organization_id,
    v_reservation.id,
    v_reservation.contact_id,
    v_animal.id,
    'finalized',
    p_client_command_id,
    v_user,
    v_actor_role,
    p_adoption_completed_at,
    v_checks,
    to_jsonb(v_exceptions),
    v_trimmed_reason,
    jsonb_build_object(
      'request', v_request,
      'previousAnimalStatus', v_animal.status,
      'previousAnimalOwnershipStatus', v_animal.ownership_status,
      'activatedAdopterRoleId', v_role_id
    ),
    v_now
  );

  outcome := 'success';
  replayed := false;
  event_id := v_event_id;
  adoption_completed_at := p_adoption_completed_at;
  result := jsonb_build_object(
    'reservationId', v_reservation.id,
    'contactId', v_reservation.contact_id,
    'animalId', v_animal.id,
    'eventId', v_event_id
  );
  return next;
end;
$function$;

revoke all on function public.adoption_handover_event_append_only()
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_adoption_handover(
  uuid, uuid, timestamptz, timestamptz, text[], text
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_adoption_handover(
  uuid, uuid, timestamptz, timestamptz, text[], text
) to authenticated;

commit;

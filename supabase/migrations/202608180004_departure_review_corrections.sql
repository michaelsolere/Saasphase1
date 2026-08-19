-- DEPARTURE-ORGANIZATION-01 review corrections
-- Global capacity, atomic handover, authoritative balance and trusted signature evidence.

begin;

create extension if not exists btree_gist;

create or replace function public.departure_slot_epoch_range(p_starts_at timestamptz, p_duration_minutes integer)
returns int8range language sql immutable strict set search_path='' as $$
  select int8range(
    floor(extract(epoch from p_starts_at) * 1000)::bigint,
    floor(extract(epoch from p_starts_at) * 1000)::bigint + p_duration_minutes::bigint * 60000,
    '[)'
  )
$$;

alter table public.departure_slots
  add constraint departure_slots_no_organization_overlap
  exclude using gist (
    organization_id with =,
    public.departure_slot_epoch_range(starts_at, duration_minutes) with &&
  ) where (status <> 'cancelled');

create or replace function public.departure_assert_no_overlap(
  p_plan_id uuid,
  p_slot_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select plan.organization_id
  into v_organization_id
  from public.departure_plans plan
  where plan.id = p_plan_id;

  if v_organization_id is null then
    raise exception 'departure_plan_not_found' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.departure_slots slot
    where slot.organization_id = v_organization_id
      and slot.id is distinct from p_slot_id
      and slot.status <> 'cancelled'
      and tstzrange(slot.starts_at, slot.starts_at + make_interval(mins => slot.duration_minutes), '[)')
          && tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), '[)')
  ) then
    raise exception 'departure_slot_overlap' using errcode = '23P01';
  end if;
end;
$$;

create or replace function public.enforce_departure_slot_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_litter_id uuid;
  v_earliest timestamptz;
begin
  if new.organization_id is distinct from (
    select plan.organization_id from public.departure_plans plan where plan.id = new.plan_id
  ) then
    raise exception 'departure_plan_organization_mismatch' using errcode = '23514';
  end if;

  if new.reservation_id is null then
    if new.status not in ('open', 'cancelled') or new.visibility = 'exceptional' then
      raise exception 'departure_reservation_required' using errcode = '23514';
    end if;
    return new;
  end if;

  select reservation.litter_id
  into v_litter_id
  from public.reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id
    and (
      (new.status = 'completed' and reservation.status = 'adopted')
      or (reservation.status = 'animal_assigned' and reservation.animal_id is not null)
    )
    and reservation.deleted_at is null;

  if v_litter_id is null then
    raise exception 'departure_reservation_not_ready' using errcode = '23514';
  end if;

  select link.earliest_departure_at
  into v_earliest
  from public.departure_plan_litters link
  where link.organization_id = new.organization_id
    and link.plan_id = new.plan_id
    and link.litter_id = v_litter_id;

  if v_earliest is null then
    raise exception 'reservation_litter_not_in_plan' using errcode = '23514';
  end if;
  if new.starts_at < v_earliest then
    raise exception 'departure_before_litter_release' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger departure_slots_eligibility_guard
before insert or update of organization_id, plan_id, reservation_id, starts_at, status, visibility
on public.departure_slots
for each row execute function public.enforce_departure_slot_eligibility();

alter table public.departure_public_sessions
  drop constraint departure_public_sessions_access_id_fkey;
alter table public.departure_public_sessions
  add constraint departure_public_sessions_access_fk
  foreign key (organization_id, access_id)
  references public.departure_public_accesses (organization_id, id)
  on delete cascade;

alter table public.departure_commands
  drop constraint departure_commands_public_session_id_fkey;
alter table public.departure_commands
  add constraint departure_commands_public_session_fk
  foreign key (organization_id, public_session_id)
  references public.departure_public_sessions (organization_id, id)
  on delete restrict;
create unique index departure_public_sessions_one_active_access_idx
  on public.departure_public_sessions(access_id)
  where revoked_at is null;

create unique index departure_commands_public_session_command_idx
  on public.departure_commands(public_session_id, client_command_id)
  where public_session_id is not null;

revoke insert, update, delete on public.departure_plans, public.departure_slots from service_role;
revoke truncate on public.departure_plans, public.departure_slots, public.departure_commands, public.departure_events from service_role;

alter table public.departure_public_accesses
  add column move_confirmation_delivery_attempt_id uuid references public.email_delivery_attempts(id) on delete restrict,
  add column move_confirmation_sent_at timestamptz,
  add column move_confirmation_required_at timestamptz,
  add column move_confirmation_retry_after timestamptz;

create or replace function public.reset_departure_move_confirmation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.reservation_id is not null and (new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes) then
    update public.departure_public_accesses
    set move_confirmation_delivery_attempt_id=null, move_confirmation_sent_at=null, move_confirmation_required_at=now(), move_confirmation_retry_after=null
    where organization_id=new.organization_id and plan_id=new.plan_id and reservation_id=new.reservation_id and revoked_at is null;
  end if;
  return new;
end;$$;
create trigger departure_slots_reset_move_confirmation
after update of starts_at,duration_minutes on public.departure_slots
for each row execute function public.reset_departure_move_confirmation();

create or replace function public.guard_departure_calendar_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.departure_slot_id is null
      or current_setting('app.departure_calendar_projection', true) = 'on' then
      return old;
    end if;
    raise exception 'departure_calendar_projection_rpc_required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and old.departure_slot_id is not null
    and new.departure_slot_id is distinct from old.departure_slot_id
    and coalesce(current_setting('app.departure_calendar_projection', true), '') <> 'on' then
    raise exception 'departure_calendar_projection_rpc_required' using errcode = '42501';
  end if;

  if new.departure_slot_id is null
    or current_setting('app.departure_calendar_projection', true) = 'on' then
    return new;
  end if;
  raise exception 'departure_calendar_projection_rpc_required' using errcode = '42501';
end;
$$;

create or replace function public.departure_write_calendar_projection(
  p_slot public.departure_slots,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_status text;
  v_actual_at timestamptz;
begin
  perform set_config('app.departure_calendar_projection', 'on', true);
  v_status := case
    when p_slot.status in ('cancelled', 'no_show') then 'cancelled'
    when p_slot.status = 'completed' then 'done'
    else 'planned'
  end;
  v_actual_at := case when p_slot.status = 'completed' then p_slot.updated_at else null end;

  select event.id into v_event
  from public.events event
  where event.organization_id = p_slot.organization_id
    and event.departure_slot_id = p_slot.id;

  if v_event is null then
    insert into public.events(
      organization_id, reservation_id, event_type, title, planned_at, actual_at,
      status, priority, is_task, departure_slot_id, created_by, updated_by
    ) values (
      p_slot.organization_id, p_slot.reservation_id, 'adoption',
      'Rendez-vous d’adoption / départ', p_slot.starts_at, v_actual_at,
      v_status, 'normal', false, p_slot.id, p_user, p_user
    ) returning id into v_event;
  else
    update public.events
    set reservation_id = p_slot.reservation_id,
        planned_at = p_slot.starts_at,
        actual_at = v_actual_at,
        status = v_status,
        updated_at = now(),
        updated_by = p_user
    where id = v_event;
  end if;
  perform set_config('app.departure_calendar_projection', '', true);
  return v_event;
end;
$$;

create or replace function public.sync_departure_calendar_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reservation_id is not null then
    perform public.departure_write_calendar_projection(new, new.updated_by);
  end if;
  return new;
end;
$$;
create trigger departure_slots_calendar_projection_sync
after insert or update of reservation_id, starts_at, duration_minutes, status
on public.departure_slots
for each row execute function public.sync_departure_calendar_projection();

create table public.departure_finalization_contexts (
  transaction_id bigint primary key,
  organization_id uuid not null,
  reservation_id uuid not null,
  actor_profile_id uuid not null,
  adoption_completed_at timestamptz not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint departure_finalization_contexts_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint departure_finalization_contexts_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id)
    on delete cascade
);
alter table public.departure_finalization_contexts enable row level security;
revoke all on public.departure_finalization_contexts from public, anon, authenticated, service_role;

create or replace function public.enforce_departure_finalization_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status or new.status <> 'adopted' then
    return new;
  end if;
  if not exists (
    select 1
    from public.departure_finalization_contexts context
    where context.transaction_id = txid_current()
      and context.organization_id = new.organization_id
      and context.reservation_id = new.id
      and context.actor_profile_id = auth.uid()
      and context.adoption_completed_at is not distinct from new.adoption_completed_at
  ) then
    raise exception 'departure_finalization_context_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger reservations_departure_finalization_authorization on public.reservations;
create trigger reservations_departure_finalization_authorization
before update of status, adoption_completed_at on public.reservations
for each row execute function public.enforce_departure_finalization_authorization();

create or replace function public.finalize_departure_adoption_handover(
  p_reservation_id uuid,
  p_client_command_id uuid,
  p_adoption_completed_at timestamptz,
  p_expected_reservation_updated_at timestamptz,
  p_physical_documents_handed_over boolean,
  p_acknowledged_exception_codes text[],
  p_exception_reason text
)
returns table(outcome text, event_id uuid, reason text, exception_codes text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_slot public.departure_slots%rowtype;
  v_user uuid := auth.uid();
  v_role text;
  v_paid bigint := 0;
  v_refunded bigint := 0;
  v_balance bigint;
  v_payload_hash text;
  v_result record;
begin
  outcome := 'blocked';
  event_id := null;
  reason := null;
  exception_codes := '{}'::text[];

  if v_user is null or p_client_command_id is null or p_adoption_completed_at is null
     or p_adoption_completed_at > now() or not p_physical_documents_handed_over then
    reason := 'invalid_input'; return next; return;
  end if;

  if exists (
    select 1 from public.adoption_handover_events event
    where event.organization_id in (
      select reservation.organization_id from public.reservations reservation where reservation.id = p_reservation_id
    ) and event.client_command_id = p_client_command_id
  ) then
    select finalized.outcome, finalized.event_id, finalized.reason, finalized.exception_codes
    into v_result
    from public.finalize_adoption_handover(
      p_reservation_id, p_client_command_id, p_adoption_completed_at,
      p_expected_reservation_updated_at, p_acknowledged_exception_codes, p_exception_reason
    ) finalized;
    outcome := v_result.outcome; event_id := v_result.event_id;
    reason := v_result.reason; exception_codes := v_result.exception_codes;
    return next; return;
  end if;

  select * into v_res
  from public.reservations reservation
  where reservation.id = p_reservation_id
    and reservation.status = 'animal_assigned'
    and reservation.animal_id is not null
    and reservation.deleted_at is null
  for update;
  if not found then reason := 'reservation_not_ready'; return next; return; end if;

  v_role := public.departure_owner_admin_role(v_res.organization_id);
  if v_role not in ('owner', 'admin') then reason := 'forbidden'; return next; return; end if;
  if v_res.updated_at is distinct from p_expected_reservation_updated_at then
    reason := 'reservation_stale'; return next; return;
  end if;

  select * into v_animal
  from public.animals animal
  where animal.organization_id = v_res.organization_id
    and animal.id = v_res.animal_id
    and animal.deleted_at is null
  for no key update;
  if not found or nullif(btrim(coalesce(v_animal.identification_number, '')), '') is null then
    reason := 'identification_missing'; return next; return;
  end if;

  select * into v_slot
  from public.departure_slots slot
  where slot.organization_id = v_res.organization_id
    and slot.reservation_id = v_res.id
    and slot.status in ('booked', 'late')
  order by slot.booked_at desc
  limit 1
  for update;
  if not found or v_slot.confirmed_at is null then
    reason := 'appointment_not_confirmed'; return next; return;
  end if;

  if exists (
    select 1 from public.post_birth_incidents incident
    where incident.organization_id = v_res.organization_id
      and incident.litter_id = v_res.litter_id
      and incident.status = 'open'
  ) then reason := 'sensitive_incident_open'; return next; return; end if;

  select
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type not in ('refund', 'partial_refund')
        and payment.status in ('partially_paid', 'paid', 'partially_refunded', 'converted_to_credit', 'transferred')
    ), 0),
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type in ('refund', 'partial_refund')
        and payment.status in ('paid', 'partially_refunded', 'refunded')
    ), 0)
  into v_paid, v_refunded
  from public.payments payment
  where payment.organization_id = v_res.organization_id
    and payment.reservation_id = v_res.id
    and payment.deleted_at is null;

  if v_res.price_cents is null then reason := 'price_missing'; return next; return; end if;
  v_balance := v_res.price_cents - v_paid + v_refunded;
  if v_balance is distinct from 0 then
    reason := case when v_balance > 0 then 'balance_remaining' else 'balance_overpaid' end;
    return next; return;
  end if;

  if not exists (
    select 1
    from public.documents document
    join public.document_signed_returns signed_return
      on signed_return.organization_id = document.organization_id
     and signed_return.document_id = document.id
    join public.departure_signature_events signature
      on signature.organization_id = document.organization_id
     and signature.document_id = document.id
     and signature.signed_return_id = signed_return.id
    where document.organization_id = v_res.organization_id
      and document.reservation_id = v_res.id
      and document.animal_id = v_res.animal_id
      and document.document_type = 'sale_certificate'
      and document.status = 'signed'
      and document.deleted_at is null
      and document.superseded_at is null
  ) then reason := 'sale_certificate_not_signed'; return next; return; end if;

  v_payload_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'reservationId', p_reservation_id,
      'commandId', p_client_command_id,
      'adoptionCompletedAt', p_adoption_completed_at,
      'expectedUpdatedAt', p_expected_reservation_updated_at,
      'exceptions', coalesce(p_acknowledged_exception_codes, '{}'::text[]),
      'exceptionReason', nullif(btrim(coalesce(p_exception_reason, '')), '')
    )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.departure_finalization_contexts(
    transaction_id, organization_id, reservation_id, actor_profile_id,
    adoption_completed_at, payload_hash
  ) values (
    txid_current(), v_res.organization_id, v_res.id, v_user,
    p_adoption_completed_at, v_payload_hash
  );

  select finalized.outcome, finalized.event_id, finalized.reason, finalized.exception_codes
  into v_result
  from public.finalize_adoption_handover(
    p_reservation_id, p_client_command_id, p_adoption_completed_at,
    p_expected_reservation_updated_at, p_acknowledged_exception_codes, p_exception_reason
  ) finalized;

  if v_result.outcome = 'success' then
    update public.departure_slots
    set physical_documents_handed_over_at = now(),
        physical_documents_handed_over_by = v_user,
        updated_at = now(), updated_by = v_user
    where id = v_slot.id;
  end if;

  delete from public.departure_finalization_contexts
  where transaction_id = txid_current();

  outcome := v_result.outcome; event_id := v_result.event_id;
  reason := v_result.reason; exception_codes := v_result.exception_codes;
  return next;
end;
$$;

revoke execute on function public.finalize_adoption_handover(uuid,uuid,timestamptz,timestamptz,text[],text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_departure_adoption_handover(uuid,uuid,timestamptz,timestamptz,boolean,text[],text) from public, anon;
grant execute on function public.finalize_departure_adoption_handover(uuid,uuid,timestamptz,timestamptz,boolean,text[],text) to authenticated;

create or replace function public.reopen_departure_slot_after_adoption_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'adopted' and new.status = 'animal_assigned' then
    update public.departure_slots
    set status = 'booked', version = version + 1,
        updated_at = now(), updated_by = new.updated_by
    where organization_id = new.organization_id
      and reservation_id = new.id
      and status = 'completed';
  end if;
  return new;
end;
$$;
create trigger reservations_reopen_departure_slot_after_reversal
after update of status on public.reservations
for each row execute function public.reopen_departure_slot_after_adoption_reversal();

create or replace function public.record_departure_final_balance(
  p_reservation_id uuid,
  p_payment_method text,
  p_reference text,
  p_expected_reservation_updated_at timestamptz,
  p_client_command_id uuid
)
returns table(outcome text, payment_id uuid, amount_cents bigint, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_user uuid := auth.uid();
  v_paid bigint := 0;
  v_refunded bigint := 0;
  v_balance bigint;
  v_existing public.departure_commands%rowtype;
  v_payload_hash text;
begin
  outcome := 'blocked'; payment_id := null; amount_cents := null; reason := null;
  if v_user is null or p_client_command_id is null
     or p_payment_method not in ('bank_transfer', 'cash', 'card', 'cheque', 'other') then
    reason := 'invalid_input'; return next; return;
  end if;

  select * into v_res from public.reservations reservation
  where reservation.id = p_reservation_id
    and reservation.deleted_at is null
  for update;
  if not found then reason := 'reservation_not_ready'; return next; return; end if;
  perform public.departure_owner_admin_role(v_res.organization_id);

  v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'reservationId', p_reservation_id,
    'paymentMethod', p_payment_method,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'expectedUpdatedAt', p_expected_reservation_updated_at
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing from public.departure_commands command
  where command.organization_id = v_res.organization_id
    and command.client_command_id = p_client_command_id;
  if found then
    if v_existing.command_type <> 'record_final_balance'
       or v_existing.target_id <> v_res.id
       or v_existing.payload_hash is distinct from v_payload_hash then
      outcome := 'conflict'; reason := 'command_payload_mismatch'; return next; return;
    end if;
    outcome := 'existing';
    payment_id := nullif(v_existing.result->>'paymentId', '')::uuid;
    amount_cents := nullif(v_existing.result->>'amountCents', '')::bigint;
    return next; return;
  end if;

  if v_res.status <> 'animal_assigned' then reason := 'reservation_not_ready'; return next; return; end if;

  if v_res.updated_at is distinct from p_expected_reservation_updated_at then
    reason := 'reservation_stale'; return next; return;
  end if;

  select
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type not in ('refund', 'partial_refund')
        and payment.status in ('partially_paid', 'paid', 'partially_refunded', 'converted_to_credit', 'transferred')
    ), 0),
    coalesce(sum(payment.amount_cents) filter (
      where payment.payment_type in ('refund', 'partial_refund')
        and payment.status in ('paid', 'partially_refunded', 'refunded')
    ), 0)
  into v_paid, v_refunded
  from public.payments payment
  where payment.organization_id = v_res.organization_id
    and payment.reservation_id = v_res.id
    and payment.deleted_at is null;

  if v_res.price_cents is null then reason := 'price_missing'; return next; return; end if;
  v_balance := v_res.price_cents - v_paid + v_refunded;
  if v_balance <= 0 then reason := 'final_balance_already_recorded'; return next; return; end if;

  payment_id := gen_random_uuid(); amount_cents := v_balance;
  insert into public.payments(
    id, organization_id, contact_id, reservation_id, amount_cents,
    payment_type, status, payment_method, external_reference, paid_at, created_by, updated_by
  ) values (
    payment_id, v_res.organization_id, v_res.contact_id, v_res.id, v_balance,
    'balance', 'paid', p_payment_method,
    nullif(btrim(coalesce(p_reference, '')), ''), now(), v_user, v_user
  );

  insert into public.departure_commands(
    organization_id, client_command_id, command_type, target_id,
    payload_hash, outcome, result, actor_profile_id
  ) values (
    v_res.organization_id, p_client_command_id, 'record_final_balance', v_res.id,
    v_payload_hash, 'recorded',
    jsonb_build_object('paymentId', payment_id, 'amountCents', amount_cents), v_user
  );
  outcome := 'recorded'; return next;
end;
$$;
revoke all on function public.record_departure_final_balance(uuid,text,text,timestamptz,uuid) from public, anon;
grant execute on function public.record_departure_final_balance(uuid,text,text,timestamptz,uuid) to authenticated;

create or replace function public.archive_sale_certificate_signature_service(
  p_actor_profile_id uuid,
  p_document_id uuid, p_signed_return_id uuid, p_file_path text,
  p_file_sha256 text, p_file_size_bytes bigint, p_source_pdf_sha256 text,
  p_signature_sha256 text, p_signer_name text, p_consent_text text,
  p_consent_sha256 text, p_client_command_id uuid
)
returns table(outcome text, signed_return_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_res public.reservations%rowtype;
  v_role text;
  v_expected text;
  v_existing public.departure_signature_events%rowtype;
  v_computed_consent_sha text;
begin
  outcome := 'error'; signed_return_id := null; reason := null;
  if p_actor_profile_id is null or p_file_sha256 !~ '^[0-9a-f]{64}$'
     or p_source_pdf_sha256 !~ '^[0-9a-f]{64}$'
     or p_signature_sha256 !~ '^[0-9a-f]{64}$'
     or p_consent_sha256 !~ '^[0-9a-f]{64}$'
     or p_file_size_bytes <= 0 or p_file_size_bytes > 10 * 1024 * 1024
     or length(btrim(coalesce(p_signer_name, ''))) < 2
     or length(btrim(coalesce(p_consent_text, ''))) < 10 then
    reason := 'invalid_input'; return next; return;
  end if;

  v_computed_consent_sha := encode(extensions.digest(convert_to(btrim(p_consent_text), 'UTF8'), 'sha256'), 'hex');
  if v_computed_consent_sha is distinct from p_consent_sha256 then
    reason := 'consent_hash_mismatch'; return next; return;
  end if;

  select * into v_document from public.documents document
  where document.id = p_document_id
    and document.document_type = 'sale_certificate'
    and document.deleted_at is null
  for update;
  if not found then reason := 'document_not_found'; return next; return; end if;

  select membership.role into v_role
  from public.memberships membership
  where membership.organization_id = v_document.organization_id
    and membership.profile_id = p_actor_profile_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_role not in ('owner', 'admin') then reason := 'forbidden'; return next; return; end if;

  select * into v_existing from public.departure_signature_events signature
  where signature.organization_id = v_document.organization_id
    and signature.client_command_id = p_client_command_id;
  if found then
    if v_existing.document_id is not distinct from p_document_id
       and v_existing.signed_return_id is not distinct from p_signed_return_id
       and v_existing.actor_profile_id is not distinct from p_actor_profile_id
       and v_existing.signer_name is not distinct from btrim(p_signer_name)
       and v_existing.consent_text is not distinct from btrim(p_consent_text)
       and v_existing.consent_sha256 is not distinct from p_consent_sha256
       and v_existing.source_pdf_sha256 is not distinct from p_source_pdf_sha256
       and v_existing.signature_sha256 is not distinct from p_signature_sha256
       and v_existing.signed_pdf_sha256 is not distinct from p_file_sha256
       and exists(select 1 from public.document_signed_returns signed_return where signed_return.organization_id=v_existing.organization_id and signed_return.id=v_existing.signed_return_id and signed_return.file_path=p_file_path and signed_return.file_size_bytes=p_file_size_bytes) then
      outcome := 'existing'; signed_return_id := v_existing.signed_return_id; return next; return;
    end if;
    outcome := 'conflict'; reason := 'command_payload_mismatch'; return next; return;
  end if;

  select * into v_res from public.reservations reservation
  where reservation.organization_id = v_document.organization_id
    and reservation.id = v_document.reservation_id
    and reservation.animal_id = v_document.animal_id
    and reservation.status = 'animal_assigned'
    and reservation.deleted_at is null
  for update;
  if not found or v_document.status not in ('generated', 'sent')
     or v_document.file_sha256 is distinct from p_source_pdf_sha256
     or v_document.file_path is null or v_document.animal_id is null then
    reason := 'document_not_eligible'; return next; return;
  end if;

  v_expected := format(
    'organizations/%s/documents/%s/signed-returns/%s/%s.pdf',
    v_document.organization_id, v_document.id, p_signed_return_id, p_file_sha256
  );
  if p_file_path is distinct from v_expected or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'documents'
      and object.name = p_file_path
      and object.metadata->>'mimetype' = 'application/pdf'
      and object.metadata->>'size' = p_file_size_bytes::text
  ) then reason := 'stored_pdf_not_verified'; return next; return; end if;

  insert into public.document_signed_returns(
    id, organization_id, document_id, file_path, file_sha256,
    file_size_bytes, mime_type, received_at, created_at, created_by
  ) values (
    p_signed_return_id, v_document.organization_id, v_document.id, p_file_path,
    p_file_sha256, p_file_size_bytes, 'application/pdf', now(), now(), p_actor_profile_id
  );
  update public.documents
  set status = 'signed', sent_at = coalesce(sent_at, now()), signed_at = now(),
      updated_at = now(), updated_by = p_actor_profile_id
  where id = v_document.id;
  insert into public.departure_signature_events(
    organization_id, reservation_id, animal_id, document_id, signed_return_id,
    client_command_id, actor_profile_id, actor_role, signer_name, consent_text,
    consent_sha256, source_pdf_sha256, signature_sha256, signed_pdf_sha256
  ) values (
    v_document.organization_id, v_res.id, v_res.animal_id, v_document.id,
    p_signed_return_id, p_client_command_id, p_actor_profile_id, v_role,
    btrim(p_signer_name), btrim(p_consent_text), p_consent_sha256,
    p_source_pdf_sha256, p_signature_sha256, p_file_sha256
  );
  outcome := 'created'; signed_return_id := p_signed_return_id; return next;
exception when unique_violation then
  outcome := 'conflict'; reason := 'signature_already_archived'; return next;
end;
$$;

revoke all on function public.archive_sale_certificate_signature(uuid,uuid,text,text,bigint,text,text,text,text,text,uuid), public.authorize_departure_finalization(uuid,timestamptz,timestamptz,boolean,text) from public, anon, authenticated, service_role;
revoke all on function public.archive_sale_certificate_signature_service(uuid,uuid,uuid,text,text,bigint,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.archive_sale_certificate_signature_service(uuid,uuid,uuid,text,text,bigint,text,text,text,text,text,uuid) to service_role;

create or replace function public.finalize_departure_email_delivery(
  p_access_id uuid,
  p_kind text,
  p_attempt_id uuid,
  p_sent_at timestamptz
)
returns table(outcome text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.departure_public_accesses%rowtype;
  v_existing_attempt uuid;
  v_event_type text;
begin
  outcome := 'error'; reason := null;
  if p_kind not in ('invitation','booking_confirmation','exceptional_confirmation','move_confirmation','response_reminder','appointment_reminder')
     or p_attempt_id is null or p_sent_at is null then
    reason := 'invalid_input'; return next; return;
  end if;
  select * into v_access from public.departure_public_accesses access where access.id = p_access_id for update;
  if not found then reason := 'departure_access_missing'; return next; return; end if;

  v_existing_attempt := case p_kind
    when 'invitation' then v_access.invitation_delivery_attempt_id
    when 'response_reminder' then v_access.response_reminder_delivery_attempt_id
    when 'appointment_reminder' then v_access.appointment_reminder_delivery_attempt_id
    when 'move_confirmation' then v_access.move_confirmation_delivery_attempt_id
    else v_access.confirmation_delivery_attempt_id
  end;
  if v_existing_attempt is not null and v_existing_attempt <> p_attempt_id then
    reason := 'delivery_marker_conflict'; return next; return;
  end if;

  update public.departure_public_accesses
  set invitation_delivery_attempt_id = case when p_kind='invitation' then p_attempt_id else invitation_delivery_attempt_id end,
      invitation_sent_at = case when p_kind='invitation' then p_sent_at else invitation_sent_at end,
      response_reminder_delivery_attempt_id = case when p_kind='response_reminder' then p_attempt_id else response_reminder_delivery_attempt_id end,
      response_reminder_sent_at = case when p_kind='response_reminder' then p_sent_at else response_reminder_sent_at end,
      appointment_reminder_delivery_attempt_id = case when p_kind='appointment_reminder' then p_attempt_id else appointment_reminder_delivery_attempt_id end,
      appointment_reminder_sent_at = case when p_kind='appointment_reminder' then p_sent_at else appointment_reminder_sent_at end,
      confirmation_delivery_attempt_id = case when p_kind in('booking_confirmation','exceptional_confirmation') then p_attempt_id else confirmation_delivery_attempt_id end,
      confirmation_sent_at = case when p_kind in('booking_confirmation','exceptional_confirmation') then p_sent_at else confirmation_sent_at end,
      move_confirmation_delivery_attempt_id = case when p_kind='move_confirmation' then p_attempt_id else move_confirmation_delivery_attempt_id end,
      move_confirmation_sent_at = case when p_kind='move_confirmation' then p_sent_at else move_confirmation_sent_at end,
      move_confirmation_retry_after = case when p_kind='move_confirmation' then null else move_confirmation_retry_after end
  where id = v_access.id;

  v_event_type := p_kind || '_sent';
  insert into public.departure_events(
    organization_id, plan_id, reservation_id, event_type, actor_kind,
    details, client_command_id
  ) values (
    v_access.organization_id, v_access.plan_id, v_access.reservation_id,
    v_event_type, 'system', jsonb_build_object('attemptId', p_attempt_id), p_attempt_id
  ) on conflict (organization_id, client_command_id) do nothing;

  outcome := case when v_existing_attempt is null then 'recorded' else 'existing' end;
  return next;
end;
$$;
revoke all on function public.finalize_departure_email_delivery(uuid,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_departure_email_delivery(uuid,text,uuid,timestamptz) to service_role;

revoke all on function public.enforce_departure_slot_eligibility(), public.sync_departure_calendar_projection(),
  public.enforce_departure_finalization_authorization(), public.reopen_departure_slot_after_adoption_reversal(),
  public.reset_departure_move_confirmation(), public.departure_slot_epoch_range(timestamptz,integer)
from public, anon, authenticated, service_role;

commit;

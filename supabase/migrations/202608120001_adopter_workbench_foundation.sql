-- ADOPTER-WORKBENCH-01
-- Read projection and guarded quick actions for the family journey workbench.

begin;

-- Business mutations are owner/admin only. Members keep read access; notes retain
-- their existing member writer policy and manual contacts use the RPC below.
drop policy if exists payments_insert_writer on public.payments;
drop policy if exists payments_update_writer on public.payments;
create policy payments_insert_admin on public.payments
for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy payments_update_admin on public.payments
for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

drop policy if exists events_insert_writer on public.events;
drop policy if exists events_update_writer on public.events;
create policy events_insert_admin on public.events
for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner', 'admin']));
create policy events_update_admin on public.events
for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create table public.adopter_manual_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reservation_id uuid not null,
  contact_id uuid not null,
  channel text not null,
  summary text not null,
  contacted_at timestamptz not null,
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  client_command_id uuid not null,
  created_at timestamptz not null default now(),
  constraint adopter_manual_contacts_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id),
  constraint adopter_manual_contacts_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts(organization_id, id),
  constraint adopter_manual_contacts_channel_check
    check (channel in ('phone', 'sms', 'external_email', 'visit', 'video', 'other')),
  constraint adopter_manual_contacts_summary_check
    check (length(btrim(summary)) between 3 and 1000),
  constraint adopter_manual_contacts_actor_role_check
    check (actor_role in ('owner', 'admin', 'member')),
  constraint adopter_manual_contacts_command_unique
    unique (organization_id, client_command_id),
  constraint adopter_manual_contacts_org_id_unique
    unique (organization_id, id)
);

create index adopter_manual_contacts_reservation_idx
  on public.adopter_manual_contacts (organization_id, reservation_id, contacted_at desc);

alter table public.adopter_manual_contacts enable row level security;
create policy adopter_manual_contacts_select_member
on public.adopter_manual_contacts for select to authenticated
using (public.is_member_of(organization_id));
revoke insert, update, delete on public.adopter_manual_contacts from anon, authenticated;
grant select on public.adopter_manual_contacts to authenticated;

create or replace view public.adopter_manual_contact_events
with (security_invoker = true)
as
select
  manual_contact.id,
  manual_contact.organization_id,
  manual_contact.reservation_id,
  manual_contact.channel as event_type,
  'Contact manuel'::text as title,
  manual_contact.summary as description,
  manual_contact.contacted_at as created_at
from public.adopter_manual_contacts manual_contact;

grant select on public.adopter_manual_contact_events to authenticated;

create or replace function public.guard_adopter_manual_contact_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.qa_hard_delete', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'adopter manual contacts are append-only';
end;
$$;

create trigger adopter_manual_contacts_immutable
before update or delete on public.adopter_manual_contacts
for each row execute function public.guard_adopter_manual_contact_immutability();

create or replace function public.record_adopter_manual_contact(
  p_reservation_id uuid,
  p_expected_reservation_updated_at timestamptz,
  p_channel text,
  p_summary text,
  p_contacted_at timestamptz,
  p_client_command_id uuid
)
returns table (outcome text, manual_contact_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_actor_role text;
  v_existing public.adopter_manual_contacts%rowtype;
begin
  outcome := null; manual_contact_id := null; reason := null;
  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;
  if p_channel not in ('phone', 'sms', 'external_email', 'visit', 'video', 'other') then
    outcome := 'ineligible'; reason := 'channel_invalid'; return next; return;
  end if;
  if length(btrim(coalesce(p_summary, ''))) not between 3 and 1000 then
    outcome := 'ineligible'; reason := 'summary_invalid'; return next; return;
  end if;
  if p_contacted_at is null or p_contacted_at > clock_timestamp() + interval '5 minutes' then
    outcome := 'ineligible'; reason := 'contacted_at_invalid'; return next; return;
  end if;

  select * into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id and reservation.deleted_at is null
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'reservation_not_found'; return next; return;
  end if;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_reservation.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null
    or not public.has_organization_role(
      v_reservation.organization_id,
      array['owner', 'admin', 'member']
    ) then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  select * into v_existing
  from public.adopter_manual_contacts manual_contact
  where manual_contact.organization_id = v_reservation.organization_id
    and manual_contact.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_recorded'; manual_contact_id := v_existing.id; return next; return;
  end if;

  if v_reservation.updated_at is distinct from p_expected_reservation_updated_at then
    outcome := 'conflict'; reason := 'reservation_changed'; return next; return;
  end if;

  insert into public.adopter_manual_contacts (
    organization_id, reservation_id, contact_id, channel, summary,
    contacted_at, actor_profile_id, actor_role, client_command_id
  ) values (
    v_reservation.organization_id, v_reservation.id, v_reservation.contact_id,
    p_channel, btrim(p_summary), p_contacted_at, v_user_id, v_actor_role,
    p_client_command_id
  ) returning id into manual_contact_id;

  outcome := 'recorded';
  return next;
end;
$$;

revoke all on function public.record_adopter_manual_contact(uuid, timestamptz, text, text, timestamptz, uuid) from public;
grant execute on function public.record_adopter_manual_contact(uuid, timestamptz, text, text, timestamptz, uuid) to authenticated;

create or replace view public.adopter_workbench_overview
with (security_invoker = true)
as
select
  overview.*,
  contact.email as contact_email,
  contact.phone as contact_phone,
  animal.identification_number,
  application.desired_sex_preference as application_sex_preference,
  opening.accepted_at as opening_event_at,
  coalesce(historical_payment.opening_paid_cents, 0)::bigint as historical_paid_opening_cents,
  coalesce(document_summary.document_count, 0)::integer as document_count,
  coalesce(document_summary.signed_document_count, 0)::integer as signed_document_count,
  coalesce(note_summary.note_count, 0)::integer as note_count,
  choice_event.planned_at as choice_appointment_at,
  choice_event.status as choice_appointment_status,
  departure_event.planned_at as departure_appointment_at,
  departure_event.status as departure_appointment_status
from public.reservation_overview overview
join public.contacts contact
  on contact.organization_id = overview.organization_id and contact.id = overview.contact_id
left join public.applications application
  on application.organization_id = overview.organization_id and application.id = overview.application_id
left join public.animals animal
  on animal.organization_id = overview.organization_id and animal.id = overview.animal_id
left join lateral (
  select max(event.occurred_at) as accepted_at
  from public.candidate_journey_events event
  where event.organization_id = overview.organization_id
    and event.reservation_id = overview.id
    and event.event_type = 'candidate_first_payment_accepted'
) opening on true
left join lateral (
  select coalesce(sum(payment.applied_amount_cents), sum(payment.amount_cents), 0) as opening_paid_cents
  from public.payments payment
  where payment.organization_id = overview.organization_id
    and payment.reservation_id = overview.id
    and payment.payment_type in ('arrhes', 'pre_reservation_deposit_refundable')
    and payment.status in ('paid', 'partially_paid', 'partially_refunded', 'converted_to_credit', 'transferred')
    and payment.deleted_at is null
) historical_payment on true
left join lateral (
  select count(*) as document_count,
    count(*) filter (where document.status in ('signed', 'received', 'validated')) as signed_document_count
  from public.documents document
  where document.organization_id = overview.organization_id
    and document.reservation_id = overview.id and document.deleted_at is null
) document_summary on true
left join lateral (
  select count(*) as note_count
  from public.notes note
  where note.organization_id = overview.organization_id
    and note.reservation_id = overview.id and note.deleted_at is null
) note_summary on true
left join lateral (
  select event.planned_at, event.status
  from public.events event
  where event.organization_id = overview.organization_id
    and event.reservation_id = overview.id and event.event_type = 'puppy_choice'
    and event.deleted_at is null
  order by event.created_at desc limit 1
) choice_event on true
left join lateral (
  select event.planned_at, event.status
  from public.events event
  where event.organization_id = overview.organization_id
    and event.reservation_id = overview.id and event.event_type = 'adoption'
    and event.deleted_at is null
  order by event.created_at desc limit 1
) departure_event on true
where opening.accepted_at is not null
   or coalesce(historical_payment.opening_paid_cents, 0) > 0;

grant select on public.adopter_workbench_overview to authenticated;

commit;

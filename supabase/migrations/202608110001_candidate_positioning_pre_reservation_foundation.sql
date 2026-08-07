alter table public.applications
  add column desired_timing_mode text not null default 'unknown',
  add column desired_season text,
  add column desired_season_year integer,
  add column desired_not_before_date date,
  add column positioning_revision integer not null default 0;

alter table public.applications
  add constraint applications_desired_timing_mode_check
    check (desired_timing_mode in ('unknown', 'earliest', 'season', 'not_before', 'no_preference')),
  add constraint applications_desired_timing_details_check
    check (
      (desired_timing_mode = 'season'
        and desired_season in ('spring', 'summer', 'autumn', 'winter')
        and desired_season_year between 2000 and 2200
        and desired_not_before_date is null)
      or (desired_timing_mode = 'not_before'
        and desired_not_before_date is not null
        and desired_season is null
        and desired_season_year is null)
      or (desired_timing_mode in ('unknown', 'earliest', 'no_preference')
        and desired_season is null
        and desired_season_year is null
        and desired_not_before_date is null)
    ),
  add constraint applications_positioning_revision_check
    check (positioning_revision >= 0);

alter table public.payments
  add column received_amount_cents integer not null default 0,
  add column applied_amount_cents integer not null default 0,
  add column unapplied_amount_cents integer not null default 0;

update public.payments
set received_amount_cents = amount_cents,
    applied_amount_cents = amount_cents
where status = 'paid';

alter table public.payments
  add constraint payments_received_allocation_check
  check (
    received_amount_cents >= 0
    and applied_amount_cents >= 0
    and unapplied_amount_cents >= 0
    and received_amount_cents = applied_amount_cents + unapplied_amount_cents
    and applied_amount_cents <= amount_cents
  );

create table public.pre_reservation_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  application_id uuid not null,
  contact_id uuid not null,
  version integer not null,
  status text not null default 'ready',
  entry_mode text not null default 'pre_reservation_before_birth',
  target_litter_group_id uuid,
  target_litter_id uuid,
  desired_timing_snapshot jsonb not null default '{}'::jsonb,
  recipient_email text not null,
  recipient_name text,
  expected_amount_cents integer not null,
  complete_deposit_cents integer not null,
  currency text not null default 'EUR',
  due_date date not null,
  email_template_id uuid,
  brevo_template_id bigint,
  delivery_attempt_id uuid,
  reservation_id uuid,
  payment_id uuid,
  variables_snapshot jsonb not null default '{}'::jsonb,
  application_updated_at_snapshot timestamptz not null,
  positioning_revision_snapshot integer not null,
  supersedes_proposal_id uuid,
  client_command_id uuid not null,
  stale_reason text,
  send_claimed_at timestamptz,
  send_claimed_by uuid,
  prepared_at timestamptz not null default now(),
  prepared_by uuid not null,
  sent_at timestamptz,
  sent_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pre_reservation_proposals_application_fk
    foreign key (organization_id, application_id)
    references public.applications(organization_id, id),
  constraint pre_reservation_proposals_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts(organization_id, id),
  constraint pre_reservation_proposals_group_fk
    foreign key (organization_id, target_litter_group_id)
    references public.litter_groups(organization_id, id),
  constraint pre_reservation_proposals_litter_fk
    foreign key (organization_id, target_litter_id)
    references public.litters(organization_id, id),
  constraint pre_reservation_proposals_template_fk
    foreign key (organization_id, email_template_id)
    references public.email_templates(organization_id, id),
  constraint pre_reservation_proposals_delivery_attempt_fk
    foreign key (organization_id, delivery_attempt_id)
    references public.email_delivery_attempts(organization_id, id),
  constraint pre_reservation_proposals_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id),
  constraint pre_reservation_proposals_payment_fk
    foreign key (organization_id, payment_id)
    references public.payments(organization_id, id),
  constraint pre_reservation_proposals_prepared_by_fkey
    foreign key (prepared_by) references public.profiles(id),
  constraint pre_reservation_proposals_sent_by_fkey
    foreign key (sent_by) references public.profiles(id),
  constraint pre_reservation_proposals_cancelled_by_fkey
    foreign key (cancelled_by) references public.profiles(id),
  constraint pre_reservation_proposals_send_claimed_by_fkey
    foreign key (send_claimed_by) references public.profiles(id),
  constraint pre_reservation_proposals_supersedes_fkey
    foreign key (organization_id, supersedes_proposal_id)
    references public.pre_reservation_proposals(organization_id, id),
  constraint pre_reservation_proposals_status_check
    check (status in ('draft', 'ready', 'stale', 'cancelled', 'expired', 'sending', 'sent', 'failed', 'uncertain')),
  constraint pre_reservation_proposals_entry_mode_check
    check (entry_mode = 'pre_reservation_before_birth'),
  constraint pre_reservation_proposals_version_check
    check (version > 0),
  constraint pre_reservation_proposals_amounts_check
    check (
      expected_amount_cents > 0
      and complete_deposit_cents >= expected_amount_cents
    ),
  constraint pre_reservation_proposals_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint pre_reservation_proposals_recipient_check
    check (recipient_email = lower(btrim(recipient_email)) and recipient_email like '%@%'),
  constraint pre_reservation_proposals_command_unique
    unique (organization_id, client_command_id),
  constraint pre_reservation_proposals_version_unique
    unique (organization_id, application_id, version),
  constraint pre_reservation_proposals_org_id_unique
    unique (organization_id, id)
);

create unique index pre_reservation_proposals_one_open_idx
  on public.pre_reservation_proposals (organization_id, application_id)
  where status in ('draft', 'ready', 'sending', 'uncertain');

create index pre_reservation_proposals_application_idx
  on public.pre_reservation_proposals (organization_id, application_id, prepared_at desc);

create table public.candidate_journey_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  application_id uuid not null,
  contact_id uuid not null,
  proposal_id uuid,
  reservation_id uuid,
  payment_id uuid,
  delivery_attempt_id uuid,
  event_type text not null,
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  reason text,
  previous_state jsonb not null default '{}'::jsonb,
  current_state jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint candidate_journey_events_application_fk
    foreign key (organization_id, application_id)
    references public.applications(organization_id, id),
  constraint candidate_journey_events_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts(organization_id, id),
  constraint candidate_journey_events_proposal_fk
    foreign key (organization_id, proposal_id)
    references public.pre_reservation_proposals(organization_id, id),
  constraint candidate_journey_events_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id),
  constraint candidate_journey_events_payment_fk
    foreign key (organization_id, payment_id)
    references public.payments(organization_id, id),
  constraint candidate_journey_events_delivery_attempt_fk
    foreign key (organization_id, delivery_attempt_id)
    references public.email_delivery_attempts(organization_id, id),
  constraint candidate_journey_events_actor_role_check
    check (actor_role in ('owner', 'admin', 'member')),
  constraint candidate_journey_events_command_unique
    unique (organization_id, client_command_id),
  constraint candidate_journey_events_org_id_unique
    unique (organization_id, id)
);

create index candidate_journey_events_application_idx
  on public.candidate_journey_events (organization_id, application_id, occurred_at desc);

alter table public.pre_reservation_proposals enable row level security;
alter table public.candidate_journey_events enable row level security;

create policy pre_reservation_proposals_select_organization_members
  on public.pre_reservation_proposals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships membership
      where membership.organization_id = pre_reservation_proposals.organization_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
        and membership.deleted_at is null
    )
  );

create policy candidate_journey_events_select_organization_members
  on public.candidate_journey_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships membership
      where membership.organization_id = candidate_journey_events.organization_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
        and membership.deleted_at is null
    )
  );

revoke insert, update, delete on public.pre_reservation_proposals from anon, authenticated;
revoke insert, update, delete on public.candidate_journey_events from anon, authenticated;
grant select on public.pre_reservation_proposals to authenticated;
grant select on public.candidate_journey_events to authenticated;

create or replace function public.guard_candidate_journey_event_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.qa_hard_delete', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'candidate_journey_events are append-only';
end;
$$;

create trigger candidate_journey_events_immutable
before update or delete on public.candidate_journey_events
for each row execute function public.guard_candidate_journey_event_immutability();

create or replace function public.guard_candidate_positioning_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.desired_timing_mode is distinct from old.desired_timing_mode
    or new.desired_season is distinct from old.desired_season
    or new.desired_season_year is distinct from old.desired_season_year
    or new.desired_not_before_date is distinct from old.desired_not_before_date
    or new.desired_litter_group_id is distinct from old.desired_litter_group_id
    or new.desired_litter_id is distinct from old.desired_litter_id
    or new.positioning_revision is distinct from old.positioning_revision
  ) and current_user <> pg_catalog.pg_get_userbyid(
    (
      select relation.relowner
      from pg_catalog.pg_class relation
      where relation.oid = 'public.applications'::pg_catalog.regclass
    )
  ) then
    raise exception 'candidate positioning must be changed through update_candidate_positioning';
  end if;
  return new;
end;
$$;

create trigger applications_candidate_positioning_guard
before update on public.applications
for each row execute function public.guard_candidate_positioning_write();

create or replace function public.guard_payment_received_allocation_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.received_amount_cents is distinct from old.received_amount_cents
    or new.applied_amount_cents is distinct from old.applied_amount_cents
    or new.unapplied_amount_cents is distinct from old.unapplied_amount_cents
  ) and current_user <> pg_catalog.pg_get_userbyid(
    (
      select relation.relowner
      from pg_catalog.pg_class relation
      where relation.oid = 'public.payments'::pg_catalog.regclass
    )
  ) then
    raise exception 'received payment allocation must be changed through record_candidate_journey_payment_receipt';
  end if;
  return new;
end;
$$;

create trigger payments_received_allocation_guard
before update on public.payments
for each row execute function public.guard_payment_received_allocation_write();

create or replace function public.update_candidate_positioning(
  p_application_id uuid,
  p_expected_application_updated_at timestamptz,
  p_expected_positioning_revision integer,
  p_desired_timing_mode text,
  p_desired_season text,
  p_desired_season_year integer,
  p_desired_not_before_date date,
  p_target_litter_id uuid,
  p_target_litter_group_id uuid,
  p_client_command_id uuid
)
returns table (
  outcome text,
  application_id uuid,
  positioning_revision integer,
  reason text,
  event_id uuid
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
  v_actor_role text;
  v_group_id uuid := p_target_litter_group_id;
  v_previous_state jsonb;
  v_current_state jsonb;
  v_event_id uuid;
  v_existing_event public.candidate_journey_events%rowtype;
begin
  application_id := p_application_id;
  positioning_revision := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'application_not_found'; return next; return;
  end if;

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_application.organization_id
    and m.profile_id = v_user_id
    and m.status = 'active'
    and m.deleted_at is null;
  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  select * into v_existing_event
  from public.candidate_journey_events event
  where event.organization_id = v_application.organization_id
    and event.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_applied';
    positioning_revision := v_application.positioning_revision;
    event_id := v_existing_event.id;
    return next; return;
  end if;

  if v_application.updated_at is distinct from p_expected_application_updated_at
    or v_application.positioning_revision <> p_expected_positioning_revision then
    outcome := 'conflict'; reason := 'application_changed'; return next; return;
  end if;
  if exists (
    select 1 from public.reservations reservation
    where reservation.organization_id = v_application.organization_id
      and reservation.application_id = v_application.id
      and reservation.deleted_at is null
  ) then
    outcome := 'conflict'; reason := 'journey_already_started'; return next; return;
  end if;
  if exists (
    select 1 from public.pre_reservation_proposals proposal
    where proposal.organization_id = v_application.organization_id
      and proposal.application_id = v_application.id
      and proposal.status = 'sending'
  ) then
    outcome := 'conflict'; reason := 'proposal_sending'; return next; return;
  end if;

  if p_desired_timing_mode not in ('unknown', 'earliest', 'season', 'not_before', 'no_preference') then
    outcome := 'ineligible'; reason := 'desired_timing_invalid'; return next; return;
  end if;
  if p_desired_timing_mode = 'season' and (
    p_desired_season not in ('spring', 'summer', 'autumn', 'winter')
    or p_desired_season_year is null
    or p_desired_season_year not between 2000 and 2200
    or p_desired_not_before_date is not null
  ) then
    outcome := 'ineligible'; reason := 'desired_timing_invalid'; return next; return;
  end if;
  if p_desired_timing_mode = 'not_before' and (
    p_desired_not_before_date is null
    or p_desired_season is not null
    or p_desired_season_year is not null
  ) then
    outcome := 'ineligible'; reason := 'desired_timing_invalid'; return next; return;
  end if;
  if p_desired_timing_mode in ('unknown', 'earliest', 'no_preference') and (
    p_desired_season is not null
    or p_desired_season_year is not null
    or p_desired_not_before_date is not null
  ) then
    outcome := 'ineligible'; reason := 'desired_timing_invalid'; return next; return;
  end if;

  if p_target_litter_id is not null then
    select * into v_litter
    from public.litters litter
    where litter.organization_id = v_application.organization_id
      and litter.id = p_target_litter_id
      and litter.deleted_at is null;
    if not found then
      outcome := 'ineligible'; reason := 'litter_not_found'; return next; return;
    end if;
    if v_litter.species is distinct from v_application.species
      or v_litter.breed is distinct from v_application.breed then
      outcome := 'ineligible'; reason := 'target_litter_incompatible'; return next; return;
    end if;
    v_group_id := v_litter.litter_group_id;
    if p_target_litter_group_id is not null
      and v_group_id is distinct from p_target_litter_group_id then
      outcome := 'conflict'; reason := 'litter_group_mismatch'; return next; return;
    end if;
  elsif p_target_litter_group_id is not null then
    select * into v_group
    from public.litter_groups group_row
    where group_row.organization_id = v_application.organization_id
      and group_row.id = p_target_litter_group_id
      and group_row.deleted_at is null;
    if not found then
      outcome := 'ineligible'; reason := 'litter_group_not_found'; return next; return;
    end if;
    if v_group.species is distinct from v_application.species then
      outcome := 'ineligible'; reason := 'target_group_incompatible'; return next; return;
    end if;
  end if;

  v_previous_state := jsonb_build_object(
    'desiredTimingMode', v_application.desired_timing_mode,
    'desiredSeason', v_application.desired_season,
    'desiredSeasonYear', v_application.desired_season_year,
    'desiredNotBeforeDate', v_application.desired_not_before_date,
    'targetLitterId', v_application.desired_litter_id,
    'targetLitterGroupId', v_application.desired_litter_group_id,
    'positioningRevision', v_application.positioning_revision
  );

  update public.applications as application_row
  set desired_timing_mode = p_desired_timing_mode,
      desired_season = case when p_desired_timing_mode = 'season' then p_desired_season else null end,
      desired_season_year = case when p_desired_timing_mode = 'season' then p_desired_season_year else null end,
      desired_not_before_date = case when p_desired_timing_mode = 'not_before' then p_desired_not_before_date else null end,
      desired_litter_id = p_target_litter_id,
      desired_litter_group_id = v_group_id,
      positioning_revision = application_row.positioning_revision + 1,
      updated_at = clock_timestamp(),
      updated_by = v_user_id
  where application_row.id = v_application.id
  returning application_row.* into v_application;

  update public.pre_reservation_proposals proposal
  set status = 'stale',
      stale_reason = 'positioning_changed',
      updated_at = clock_timestamp()
  where proposal.organization_id = v_application.organization_id
    and proposal.application_id = v_application.id
    and proposal.status in ('draft', 'ready');

  v_current_state := jsonb_build_object(
    'desiredTimingMode', v_application.desired_timing_mode,
    'desiredSeason', v_application.desired_season,
    'desiredSeasonYear', v_application.desired_season_year,
    'desiredNotBeforeDate', v_application.desired_not_before_date,
    'targetLitterId', v_application.desired_litter_id,
    'targetLitterGroupId', v_application.desired_litter_group_id,
    'positioningRevision', v_application.positioning_revision
  );

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, event_type,
    actor_profile_id, actor_role, previous_state, current_state,
    client_command_id
  ) values (
    v_application.organization_id, v_application.id, v_application.contact_id,
    'candidate_positioning_updated', v_user_id, v_actor_role,
    v_previous_state, v_current_state, p_client_command_id
  ) returning id into v_event_id;

  outcome := 'updated';
  positioning_revision := v_application.positioning_revision;
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.update_candidate_positioning(uuid, timestamptz, integer, text, text, integer, date, uuid, uuid, uuid) from public;
grant execute on function public.update_candidate_positioning(uuid, timestamptz, integer, text, text, integer, date, uuid, uuid, uuid) to authenticated;

create or replace function public.prepare_pre_reservation_proposal(
  p_application_id uuid,
  p_expected_application_updated_at timestamptz,
  p_client_command_id uuid
)
returns table (
  outcome text,
  proposal_id uuid,
  application_id uuid,
  status text,
  reason text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_application public.applications%rowtype;
  v_contact public.contacts%rowtype;
  v_litter public.litters%rowtype;
  v_group public.litter_groups%rowtype;
  v_existing public.pre_reservation_proposals%rowtype;
  v_proposal public.pre_reservation_proposals%rowtype;
  v_event_id uuid;
  v_actor_role text;
  v_confirmed_count integer := 0;
  v_version integer;
  v_expected_amount integer := 25000;
  v_second_amount integer := 25000;
  v_complete_amount integer := 50000;
  v_currency text := 'EUR';
  v_delay_days integer := 15;
  v_due_date date;
  v_group_id uuid;
  v_timing jsonb;
  v_variables jsonb;
begin
  application_id := p_application_id;
  proposal_id := null;
  status := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and deleted_at is null
  for update;

  if not found then
    outcome := 'ineligible'; reason := 'application_not_found'; return next; return;
  end if;

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_application.organization_id
    and m.profile_id = v_user_id
    and m.status = 'active'
    and m.deleted_at is null;

  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  select * into v_existing
  from public.pre_reservation_proposals p
  where p.organization_id = v_application.organization_id
    and p.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_exists';
    proposal_id := v_existing.id;
    status := v_existing.status;
    return next; return;
  end if;

  if v_application.updated_at is distinct from p_expected_application_updated_at then
    outcome := 'conflict'; reason := 'application_changed'; return next; return;
  end if;
  if v_application.status <> 'qualified' then
    outcome := 'ineligible'; reason := 'application_not_qualified'; return next; return;
  end if;
  if exists (
    select 1 from public.reservations r
    where r.organization_id = v_application.organization_id
      and r.application_id = v_application.id
      and r.deleted_at is null
  ) then
    outcome := 'conflict'; reason := 'journey_already_started'; return next; return;
  end if;

  select * into v_contact
  from public.contacts c
  where c.organization_id = v_application.organization_id
    and c.id = v_application.contact_id
    and c.deleted_at is null;
  if not found then
    outcome := 'ineligible'; reason := 'contact_not_found'; return next; return;
  end if;
  v_contact.email := lower(btrim(coalesce(v_contact.email, '')));
  if v_contact.email = '' or v_contact.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    outcome := 'ineligible'; reason := 'recipient_email_invalid'; return next; return;
  end if;

  if v_application.desired_litter_id is not null then
    select * into v_litter
    from public.litters l
    where l.organization_id = v_application.organization_id
      and l.id = v_application.desired_litter_id
      and l.deleted_at is null;
    if not found then
      outcome := 'ineligible'; reason := 'litter_not_found'; return next; return;
    end if;
    if v_litter.actual_birth_date is not null or v_litter.status <> 'pregnancy_confirmed' then
      outcome := 'ineligible'; reason := 'target_litter_not_confirmed'; return next; return;
    end if;
    if v_litter.species is distinct from v_application.species
      or v_litter.breed is distinct from v_application.breed then
      outcome := 'ineligible'; reason := 'target_litter_incompatible'; return next; return;
    end if;
    v_group_id := v_litter.litter_group_id;
    if v_application.desired_litter_group_id is not null
      and v_group_id is distinct from v_application.desired_litter_group_id then
      outcome := 'conflict'; reason := 'litter_group_mismatch'; return next; return;
    end if;
  elsif v_application.desired_litter_group_id is not null then
    select * into v_group
    from public.litter_groups g
    where g.organization_id = v_application.organization_id
      and g.id = v_application.desired_litter_group_id
      and g.deleted_at is null;
    if not found then
      outcome := 'ineligible'; reason := 'litter_group_not_found'; return next; return;
    end if;
    if v_group.species is distinct from v_application.species then
      outcome := 'ineligible'; reason := 'target_group_incompatible'; return next; return;
    end if;
    v_group_id := v_group.id;
    select count(*)::integer into v_confirmed_count
    from public.litters l
    where l.organization_id = v_application.organization_id
      and l.litter_group_id = v_group.id
      and l.deleted_at is null
      and l.actual_birth_date is null
      and l.status = 'pregnancy_confirmed'
      and l.species = v_application.species
      and l.breed = v_application.breed;
    if v_confirmed_count < 1 then
      outcome := 'ineligible'; reason := 'confirmed_scope_required'; return next; return;
    end if;
  else
    outcome := 'ineligible'; reason := 'confirmed_scope_required'; return next; return;
  end if;

  select
    coalesce(os.default_pre_reservation_deposit_cents, 25000),
    coalesce(os.default_arrhes_second_payment_cents, 25000),
    coalesce(os.default_currency, 'EUR'),
    coalesce(os.pre_reservation_response_delay_days, 15)
  into v_expected_amount, v_second_amount, v_currency, v_delay_days
  from public.organization_settings os
  where os.organization_id = v_application.organization_id and os.deleted_at is null;
  v_expected_amount := coalesce(v_expected_amount, 25000);
  v_second_amount := coalesce(v_second_amount, 25000);
  v_complete_amount := v_expected_amount + v_second_amount;
  v_currency := coalesce(v_currency, 'EUR');
  v_delay_days := coalesce(v_delay_days, 15);
  v_due_date := current_date + v_delay_days;

  select coalesce(max(p.version), 0) + 1 into v_version
  from public.pre_reservation_proposals p
  where p.organization_id = v_application.organization_id
    and p.application_id = v_application.id;

  v_timing := jsonb_build_object(
    'mode', v_application.desired_timing_mode,
    'season', v_application.desired_season,
    'seasonYear', v_application.desired_season_year,
    'notBeforeDate', v_application.desired_not_before_date
  );
  v_variables := jsonb_build_object(
    'contact_first_name', coalesce(v_contact.first_name, ''),
    'contact_last_name', coalesce(v_contact.last_name, ''),
    'contact_full_name', v_contact.display_name,
    'target_litter_id', v_application.desired_litter_id,
    'target_litter_group_id', v_group_id,
    'expected_amount_cents', v_expected_amount,
    'complete_deposit_cents', v_complete_amount,
    'currency', v_currency,
    'due_date', v_due_date
  );

  insert into public.pre_reservation_proposals (
    organization_id, application_id, contact_id, version, status,
    target_litter_group_id, target_litter_id, desired_timing_snapshot,
    recipient_email, recipient_name, expected_amount_cents, complete_deposit_cents,
    currency, due_date, variables_snapshot, application_updated_at_snapshot,
    positioning_revision_snapshot, client_command_id, prepared_by
  ) values (
    v_application.organization_id, v_application.id, v_application.contact_id,
    v_version, 'ready', v_group_id, v_application.desired_litter_id, v_timing,
    v_contact.email, v_contact.display_name, v_expected_amount, v_complete_amount,
    v_currency, v_due_date, v_variables, v_application.updated_at,
    v_application.positioning_revision, p_client_command_id, v_user_id
  ) returning * into v_proposal;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, proposal_id, event_type,
    actor_profile_id, actor_role, current_state, details, client_command_id
  ) values (
    v_application.organization_id, v_application.id, v_application.contact_id,
    v_proposal.id, 'pre_reservation_proposal_prepared', v_user_id, v_actor_role,
    jsonb_build_object('proposalId', v_proposal.id, 'status', v_proposal.status),
    jsonb_build_object('version', v_proposal.version), p_client_command_id
  ) returning id into v_event_id;

  outcome := 'created';
  proposal_id := v_proposal.id;
  status := v_proposal.status;
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.prepare_pre_reservation_proposal(uuid, timestamptz, uuid) from public;
grant execute on function public.prepare_pre_reservation_proposal(uuid, timestamptz, uuid) to authenticated;

create or replace function public.claim_pre_reservation_proposal_send(
  p_proposal_id uuid,
  p_client_command_id uuid
)
returns table (
  outcome text,
  proposal_id uuid,
  application_id uuid,
  status text,
  reason text,
  event_id uuid,
  recipient_email text,
  target_litter_id uuid,
  target_litter_group_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.pre_reservation_proposals%rowtype;
  v_application public.applications%rowtype;
  v_contact public.contacts%rowtype;
  v_litter public.litters%rowtype;
  v_actor_role text;
  v_event_id uuid;
  v_confirmed_count integer;
begin
  proposal_id := p_proposal_id;
  application_id := null;
  status := null;
  reason := null;
  event_id := null;
  recipient_email := null;
  target_litter_id := null;
  target_litter_group_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;

  select * into v_proposal
  from public.pre_reservation_proposals proposal
  where proposal.id = p_proposal_id
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'proposal_not_found'; return next; return;
  end if;

  application_id := v_proposal.application_id;
  status := v_proposal.status;
  recipient_email := v_proposal.recipient_email;
  target_litter_id := v_proposal.target_litter_id;
  target_litter_group_id := v_proposal.target_litter_group_id;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_proposal.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  if v_proposal.status = 'sent' then
    outcome := 'already_sent'; return next; return;
  end if;
  if v_proposal.status = 'sending' then
    if v_proposal.send_claimed_at is not null
      and v_proposal.send_claimed_at > clock_timestamp() - interval '15 minutes' then
      outcome := 'in_progress'; return next; return;
    end if;

    update public.pre_reservation_proposals proposal
    set status = 'uncertain',
        stale_reason = 'send_claim_expired',
        updated_at = clock_timestamp()
    where proposal.id = v_proposal.id;

    insert into public.candidate_journey_events (
      organization_id, application_id, contact_id, proposal_id, event_type,
      actor_profile_id, actor_role, previous_state, current_state,
      client_command_id
    ) values (
      v_proposal.organization_id, v_proposal.application_id, v_proposal.contact_id,
      v_proposal.id, 'pre_reservation_proposal_reconciliation_required',
      v_user_id, v_actor_role, jsonb_build_object('status', 'sending'),
      jsonb_build_object('status', 'uncertain', 'reason', 'send_claim_expired'),
      p_client_command_id
    ) returning id into v_event_id;

    status := 'uncertain';
    outcome := 'reconciliation_required';
    reason := 'send_claim_expired';
    event_id := v_event_id;
    return next; return;
  end if;
  if v_proposal.status <> 'ready' then
    outcome := 'ineligible'; reason := 'proposal_not_ready'; return next; return;
  end if;

  select * into v_application
  from public.applications application_row
  where application_row.organization_id = v_proposal.organization_id
    and application_row.id = v_proposal.application_id
    and application_row.deleted_at is null
  for update;
  if not found or v_application.status <> 'qualified' then
    outcome := 'ineligible'; reason := 'application_not_qualified'; return next; return;
  end if;
  if v_application.updated_at is distinct from v_proposal.application_updated_at_snapshot
    or v_application.positioning_revision <> v_proposal.positioning_revision_snapshot then
    update public.pre_reservation_proposals proposal
    set status = 'stale', stale_reason = 'application_changed', updated_at = clock_timestamp()
    where proposal.id = v_proposal.id;
    status := 'stale'; outcome := 'stale'; reason := 'application_changed'; return next; return;
  end if;
  if exists (
    select 1 from public.reservations reservation
    where reservation.organization_id = v_proposal.organization_id
      and reservation.application_id = v_proposal.application_id
      and reservation.deleted_at is null
  ) then
    outcome := 'conflict'; reason := 'journey_already_started'; return next; return;
  end if;

  select * into v_contact
  from public.contacts contact
  where contact.organization_id = v_proposal.organization_id
    and contact.id = v_proposal.contact_id
    and contact.deleted_at is null;
  if not found or lower(btrim(coalesce(v_contact.email, ''))) <> v_proposal.recipient_email then
    update public.pre_reservation_proposals proposal
    set status = 'stale', stale_reason = 'recipient_changed', updated_at = clock_timestamp()
    where proposal.id = v_proposal.id;
    status := 'stale'; outcome := 'stale'; reason := 'recipient_changed'; return next; return;
  end if;

  if v_proposal.target_litter_id is not null then
    select * into v_litter
    from public.litters litter
    where litter.organization_id = v_proposal.organization_id
      and litter.id = v_proposal.target_litter_id
      and litter.deleted_at is null;
    if not found
      or v_litter.status <> 'pregnancy_confirmed'
      or v_litter.actual_birth_date is not null then
      update public.pre_reservation_proposals proposal
      set status = 'stale', stale_reason = 'target_unavailable', updated_at = clock_timestamp()
      where proposal.id = v_proposal.id;
      status := 'stale'; outcome := 'stale'; reason := 'target_unavailable'; return next; return;
    end if;
  else
    select count(*)::integer into v_confirmed_count
    from public.litters litter
    where litter.organization_id = v_proposal.organization_id
      and litter.litter_group_id = v_proposal.target_litter_group_id
      and litter.status = 'pregnancy_confirmed'
      and litter.actual_birth_date is null
      and litter.deleted_at is null
      and litter.species = v_application.species
      and litter.breed = v_application.breed;
    if v_confirmed_count < 1 then
      update public.pre_reservation_proposals proposal
      set status = 'stale', stale_reason = 'target_unavailable', updated_at = clock_timestamp()
      where proposal.id = v_proposal.id;
      status := 'stale'; outcome := 'stale'; reason := 'target_unavailable'; return next; return;
    end if;
  end if;

  if v_proposal.due_date < current_date then
    update public.pre_reservation_proposals proposal
    set status = 'expired', stale_reason = 'due_date_passed', updated_at = clock_timestamp()
    where proposal.id = v_proposal.id;
    status := 'expired'; outcome := 'ineligible'; reason := 'proposal_expired'; return next; return;
  end if;

  update public.pre_reservation_proposals proposal
  set status = 'sending',
      send_claimed_at = clock_timestamp(),
      send_claimed_by = v_user_id,
      stale_reason = null,
      updated_at = clock_timestamp()
  where proposal.id = v_proposal.id;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, proposal_id, event_type,
    actor_profile_id, actor_role, previous_state, current_state,
    client_command_id
  ) values (
    v_proposal.organization_id, v_proposal.application_id, v_proposal.contact_id,
    v_proposal.id, 'pre_reservation_proposal_send_claimed', v_user_id,
    v_actor_role, jsonb_build_object('status', 'ready'),
    jsonb_build_object('status', 'sending'), p_client_command_id
  ) returning id into v_event_id;

  outcome := 'claimed';
  status := 'sending';
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.claim_pre_reservation_proposal_send(uuid, uuid) from public;
grant execute on function public.claim_pre_reservation_proposal_send(uuid, uuid) to authenticated;

create or replace function public.resolve_uncertain_pre_reservation_proposal_send(
  p_proposal_id uuid,
  p_reason text,
  p_client_command_id uuid
)
returns table (
  outcome text,
  proposal_id uuid,
  status text,
  reason text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.pre_reservation_proposals%rowtype;
  v_actor_role text;
  v_event_id uuid;
  v_existing_event public.candidate_journey_events%rowtype;
begin
  proposal_id := p_proposal_id;
  status := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    outcome := 'ineligible'; reason := 'resolution_reason_required'; return next; return;
  end if;

  select * into v_proposal
  from public.pre_reservation_proposals proposal
  where proposal.id = p_proposal_id
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'proposal_not_found'; return next; return;
  end if;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_proposal.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    outcome := 'ineligible'; reason := 'admin_required'; return next; return;
  end if;

  select * into v_existing_event
  from public.candidate_journey_events event
  where event.organization_id = v_proposal.organization_id
    and event.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_resolved';
    status := v_proposal.status;
    event_id := v_existing_event.id;
    return next; return;
  end if;

  if v_proposal.status <> 'uncertain' then
    outcome := 'conflict'; status := v_proposal.status;
    reason := 'proposal_not_uncertain'; return next; return;
  end if;

  update public.pre_reservation_proposals proposal
  set status = 'ready',
      stale_reason = null,
      send_claimed_at = null,
      send_claimed_by = null,
      updated_at = clock_timestamp()
  where proposal.id = v_proposal.id;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, proposal_id, event_type,
    actor_profile_id, actor_role, reason, previous_state, current_state,
    client_command_id
  ) values (
    v_proposal.organization_id, v_proposal.application_id, v_proposal.contact_id,
    v_proposal.id, 'pre_reservation_proposal_confirmed_not_sent',
    v_user_id, v_actor_role, btrim(p_reason),
    jsonb_build_object('status', 'uncertain'),
    jsonb_build_object('status', 'ready'), p_client_command_id
  ) returning id into v_event_id;

  outcome := 'resolved';
  status := 'ready';
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.resolve_uncertain_pre_reservation_proposal_send(uuid, text, uuid) from public;
grant execute on function public.resolve_uncertain_pre_reservation_proposal_send(uuid, text, uuid) to authenticated;

create or replace function public.complete_pre_reservation_proposal_send(
  p_proposal_id uuid,
  p_delivery_state text,
  p_delivery_attempt_id uuid,
  p_reservation_id uuid,
  p_payment_id uuid,
  p_client_command_id uuid
)
returns table (
  outcome text,
  proposal_id uuid,
  status text,
  reason text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.pre_reservation_proposals%rowtype;
  v_actor_role text;
  v_event_id uuid;
  v_next_status text;
  v_event_type text;
begin
  proposal_id := p_proposal_id;
  status := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;
  if p_delivery_state not in ('sent', 'not_sent', 'uncertain') then
    outcome := 'ineligible'; reason := 'delivery_state_invalid'; return next; return;
  end if;

  select * into v_proposal
  from public.pre_reservation_proposals proposal
  where proposal.id = p_proposal_id
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'proposal_not_found'; return next; return;
  end if;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_proposal.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  if v_proposal.status = 'sent' and p_delivery_state = 'sent' then
    outcome := 'already_completed'; status := 'sent'; return next; return;
  end if;
  if v_proposal.status not in ('sending', 'uncertain') then
    outcome := 'conflict'; status := v_proposal.status;
    reason := 'proposal_not_sending'; return next; return;
  end if;
  if v_proposal.status = 'uncertain' and p_delivery_state <> 'sent' then
    outcome := 'conflict'; status := v_proposal.status;
    reason := 'manual_reconciliation_required'; return next; return;
  end if;

  if p_delivery_state = 'sent' then
    if p_reservation_id is null or p_payment_id is null then
      outcome := 'ineligible'; status := v_proposal.status;
      reason := 'sent_resources_required'; return next; return;
    end if;
    if not exists (
      select 1
      from public.reservations reservation
      join public.payments payment
        on payment.organization_id = reservation.organization_id
       and payment.reservation_id = reservation.id
       and payment.id = p_payment_id
       and payment.contact_id = v_proposal.contact_id
       and payment.deleted_at is null
      where reservation.organization_id = v_proposal.organization_id
        and reservation.id = p_reservation_id
        and reservation.application_id = v_proposal.application_id
        and reservation.contact_id = v_proposal.contact_id
        and reservation.litter_id is not distinct from v_proposal.target_litter_id
        and reservation.litter_group_id is not distinct from v_proposal.target_litter_group_id
        and reservation.status = 'pre_reservation_requested'
        and reservation.deleted_at is null
    ) then
      outcome := 'ineligible'; status := v_proposal.status;
      reason := 'sent_resources_inconsistent'; return next; return;
    end if;
    if p_delivery_attempt_id is not null and not exists (
      select 1 from public.email_delivery_attempts attempt
      where attempt.organization_id = v_proposal.organization_id
        and attempt.id = p_delivery_attempt_id
        and attempt.contact_id = v_proposal.contact_id
        and attempt.reservation_id = p_reservation_id
        and attempt.message_type = 'pre_reservation'
        and attempt.status = 'sent'
        and attempt.deleted_at is null
    ) then
      outcome := 'ineligible'; status := v_proposal.status;
      reason := 'delivery_attempt_inconsistent'; return next; return;
    end if;
    v_next_status := 'sent';
    v_event_type := 'pre_reservation_proposal_sent';
  elsif p_delivery_state = 'uncertain' then
    v_next_status := 'uncertain';
    v_event_type := 'pre_reservation_proposal_send_uncertain';
  else
    v_next_status := 'ready';
    v_event_type := 'pre_reservation_proposal_send_failed';
  end if;

  update public.pre_reservation_proposals proposal
  set status = v_next_status,
      delivery_attempt_id = p_delivery_attempt_id,
      reservation_id = case when p_delivery_state = 'sent' then p_reservation_id else proposal.reservation_id end,
      payment_id = case when p_delivery_state = 'sent' then p_payment_id else proposal.payment_id end,
      sent_at = case when p_delivery_state = 'sent' then clock_timestamp() else proposal.sent_at end,
      sent_by = case when p_delivery_state = 'sent' then v_user_id else proposal.sent_by end,
      updated_at = clock_timestamp()
  where proposal.id = v_proposal.id;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, proposal_id, reservation_id,
    payment_id, delivery_attempt_id, event_type, actor_profile_id, actor_role,
    previous_state, current_state, client_command_id
  ) values (
    v_proposal.organization_id, v_proposal.application_id, v_proposal.contact_id,
    v_proposal.id, p_reservation_id, p_payment_id, p_delivery_attempt_id,
    v_event_type, v_user_id, v_actor_role,
    jsonb_build_object('status', v_proposal.status),
    jsonb_build_object('status', v_next_status, 'deliveryState', p_delivery_state),
    p_client_command_id
  ) returning id into v_event_id;

  outcome := 'completed';
  status := v_next_status;
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.complete_pre_reservation_proposal_send(uuid, text, uuid, uuid, uuid, uuid) from public;
grant execute on function public.complete_pre_reservation_proposal_send(uuid, text, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.create_direct_candidate_reservation_after_birth(
  p_application_id uuid,
  p_expected_application_updated_at timestamptz,
  p_reason text,
  p_client_command_id uuid
)
returns table (
  outcome text,
  reservation_id uuid,
  payment_id uuid,
  expected_amount_cents integer,
  reason text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_application public.applications%rowtype;
  v_litter public.litters%rowtype;
  v_reservation public.reservations%rowtype;
  v_payment public.payments%rowtype;
  v_existing_event public.candidate_journey_events%rowtype;
  v_actor_role text;
  v_first_amount integer := 25000;
  v_second_amount integer := 25000;
  v_complete_amount integer;
  v_currency text := 'EUR';
  v_event_id uuid;
begin
  reservation_id := null;
  payment_id := null;
  expected_amount_cents := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    outcome := 'ineligible'; reason := 'direct_reservation_reason_required'; return next; return;
  end if;

  select * into v_application
  from public.applications application_row
  where application_row.id = p_application_id
    and application_row.deleted_at is null
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'application_not_found'; return next; return;
  end if;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_application.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  select * into v_existing_event
  from public.candidate_journey_events event
  where event.organization_id = v_application.organization_id
    and event.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_created';
    reservation_id := v_existing_event.reservation_id;
    payment_id := v_existing_event.payment_id;
    event_id := v_existing_event.id;
    return next; return;
  end if;

  if v_application.updated_at is distinct from p_expected_application_updated_at then
    outcome := 'conflict'; reason := 'application_changed'; return next; return;
  end if;
  if v_application.status <> 'qualified' then
    outcome := 'ineligible'; reason := 'application_not_qualified'; return next; return;
  end if;
  if v_application.desired_litter_id is null then
    outcome := 'ineligible'; reason := 'born_litter_required'; return next; return;
  end if;
  if exists (
    select 1 from public.reservations reservation
    where reservation.organization_id = v_application.organization_id
      and reservation.application_id = v_application.id
      and reservation.deleted_at is null
  ) then
    outcome := 'conflict'; reason := 'journey_already_started'; return next; return;
  end if;

  select * into v_litter
  from public.litters litter
  where litter.organization_id = v_application.organization_id
    and litter.id = v_application.desired_litter_id
    and litter.deleted_at is null;
  if not found or v_litter.actual_birth_date is null then
    outcome := 'ineligible'; reason := 'born_litter_required'; return next; return;
  end if;
  if v_litter.species is distinct from v_application.species
    or v_litter.breed is distinct from v_application.breed then
    outcome := 'ineligible'; reason := 'target_litter_incompatible'; return next; return;
  end if;

  select
    coalesce(settings.default_pre_reservation_deposit_cents, 25000),
    coalesce(settings.default_arrhes_second_payment_cents, 25000),
    coalesce(settings.default_currency, 'EUR')
  into v_first_amount, v_second_amount, v_currency
  from public.organization_settings settings
  where settings.organization_id = v_application.organization_id
    and settings.deleted_at is null;
  v_first_amount := coalesce(v_first_amount, 25000);
  v_second_amount := coalesce(v_second_amount, 25000);
  v_complete_amount := v_first_amount + v_second_amount;
  v_currency := coalesce(v_currency, 'EUR');

  insert into public.reservations (
    organization_id, contact_id, application_id, litter_group_id, litter_id,
    species, breed, reserved_sex_preference, status, currency,
    created_by, updated_by
  ) values (
    v_application.organization_id, v_application.contact_id, v_application.id,
    v_litter.litter_group_id, v_litter.id, coalesce(v_application.species, 'dog'),
    coalesce(v_application.breed, 'Golden Retriever'),
    coalesce(v_application.desired_sex_preference, 'unknown'),
    'pre_reservation_requested', v_currency, v_user_id, v_user_id
  ) returning * into v_reservation;

  insert into public.payments (
    organization_id, contact_id, reservation_id, amount_cents, currency,
    payment_type, status, requested_at, payment_method, notes,
    created_by, updated_by
  ) values (
    v_application.organization_id, v_application.contact_id, v_reservation.id,
    v_complete_amount, v_currency, 'arrhes', 'requested', now(),
    'bank_transfer',
    'Réservation directe après naissance — arrhes totales attendues avant ouverture du parcours.',
    v_user_id, v_user_id
  ) returning * into v_payment;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, reservation_id, payment_id,
    event_type, actor_profile_id, actor_role, reason, current_state, details,
    client_command_id
  ) values (
    v_application.organization_id, v_application.id, v_application.contact_id,
    v_reservation.id, v_payment.id, 'direct_reservation_after_birth_created',
    v_user_id, v_actor_role, btrim(p_reason),
    jsonb_build_object(
      'reservationId', v_reservation.id,
      'paymentId', v_payment.id,
      'expectedAmountCents', v_complete_amount,
      'journeyOpened', false
    ),
    jsonb_build_object('litterId', v_litter.id), p_client_command_id
  ) returning id into v_event_id;

  outcome := 'created';
  reservation_id := v_reservation.id;
  payment_id := v_payment.id;
  expected_amount_cents := v_complete_amount;
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.create_direct_candidate_reservation_after_birth(uuid, timestamptz, text, uuid) from public;
grant execute on function public.create_direct_candidate_reservation_after_birth(uuid, timestamptz, text, uuid) to authenticated;

create or replace function public.record_candidate_journey_payment_receipt(
  p_proposal_id uuid,
  p_payment_id uuid,
  p_received_amount_cents integer,
  p_received_at timestamptz,
  p_payment_method text,
  p_reference text,
  p_exception_reason text,
  p_client_command_id uuid
)
returns table (
  outcome text,
  payment_id uuid,
  reservation_id uuid,
  received_amount_cents integer,
  applied_amount_cents integer,
  unapplied_amount_cents integer,
  journey_opened boolean,
  active_rank integer,
  reason text,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.payments%rowtype;
  v_reservation public.reservations%rowtype;
  v_proposal public.pre_reservation_proposals%rowtype;
  v_actor_role text;
  v_total_received integer;
  v_applied integer;
  v_unapplied integer;
  v_transition_outcome text;
  v_event_id uuid;
  v_existing_event public.candidate_journey_events%rowtype;
  v_active_rank integer;
  v_event_type text;
begin
  payment_id := p_payment_id;
  reservation_id := null;
  received_amount_cents := null;
  applied_amount_cents := null;
  unapplied_amount_cents := null;
  journey_opened := false;
  active_rank := null;
  reason := null;
  event_id := null;

  if v_user_id is null then
    outcome := 'ineligible'; reason := 'not_authenticated'; return next; return;
  end if;
  if p_received_amount_cents is null or p_received_amount_cents <= 0 then
    outcome := 'ineligible'; reason := 'received_amount_invalid'; return next; return;
  end if;
  if p_received_at is null
    or p_received_at < timestamptz '2000-01-01 00:00:00+00'
    or p_received_at > now() + interval '1 day' then
    outcome := 'ineligible'; reason := 'received_at_invalid'; return next; return;
  end if;
  if p_payment_method not in (
    'bank_transfer', 'cash', 'card', 'cheque', 'paypal', 'stripe',
    'other', 'unknown'
  ) then
    outcome := 'ineligible'; reason := 'payment_method_invalid'; return next; return;
  end if;

  select * into v_payment
  from public.payments payment
  where payment.id = p_payment_id and payment.deleted_at is null
  for update;
  if not found or v_payment.reservation_id is null then
    outcome := 'ineligible'; reason := 'payment_not_found'; return next; return;
  end if;

  select * into v_reservation
  from public.reservations reservation
  where reservation.organization_id = v_payment.organization_id
    and reservation.id = v_payment.reservation_id
    and reservation.deleted_at is null
  for update;
  if not found then
    outcome := 'ineligible'; reason := 'reservation_not_found'; return next; return;
  end if;
  reservation_id := v_reservation.id;

  select membership.role into v_actor_role
  from public.memberships membership
  where membership.organization_id = v_payment.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null;
  if v_actor_role is null then
    outcome := 'ineligible'; reason := 'membership_required'; return next; return;
  end if;

  select * into v_existing_event
  from public.candidate_journey_events event
  where event.organization_id = v_payment.organization_id
    and event.client_command_id = p_client_command_id;
  if found then
    outcome := 'already_recorded';
    received_amount_cents := v_payment.received_amount_cents;
    applied_amount_cents := v_payment.applied_amount_cents;
    unapplied_amount_cents := v_payment.unapplied_amount_cents;
    journey_opened := v_reservation.status = 'pre_reservation_paid';
    event_id := v_existing_event.id;
    return next; return;
  end if;

  if v_payment.organization_id <> v_reservation.organization_id
    or v_payment.contact_id <> v_reservation.contact_id
    or v_payment.payment_type not in ('arrhes', 'pre_reservation_deposit_refundable')
    or v_payment.status not in ('requested', 'pending', 'partially_paid')
    or v_reservation.status <> 'pre_reservation_requested' then
    outcome := 'conflict'; reason := 'payment_state_invalid'; return next; return;
  end if;

  if p_proposal_id is not null then
    select * into v_proposal
    from public.pre_reservation_proposals proposal
    where proposal.organization_id = v_payment.organization_id
      and proposal.id = p_proposal_id
    for update;
    if not found
      or v_proposal.status <> 'sent'
      or v_proposal.payment_id is distinct from v_payment.id
      or v_proposal.reservation_id is distinct from v_reservation.id then
      outcome := 'conflict'; reason := 'proposal_payment_mismatch'; return next; return;
    end if;
  elsif length(btrim(coalesce(p_exception_reason, ''))) < 10 then
    outcome := 'ineligible'; reason := 'exception_reason_required'; return next; return;
  end if;

  v_total_received := v_payment.received_amount_cents + p_received_amount_cents;
  v_applied := least(v_total_received, v_payment.amount_cents);
  v_unapplied := greatest(0, v_total_received - v_payment.amount_cents);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_reservation.organization_id::text || ':' ||
      coalesce(v_reservation.litter_group_id::text, '-') || ':' ||
      coalesce(v_reservation.litter_id::text, '-'),
      0
    )
  );

  update public.payments payment
  set received_amount_cents = v_total_received,
      applied_amount_cents = v_applied,
      unapplied_amount_cents = v_unapplied,
      status = case
        when v_total_received < payment.amount_cents then 'partially_paid'
        else payment.status
      end,
      payment_method = p_payment_method,
      updated_at = clock_timestamp(),
      updated_by = v_user_id
  where payment.id = v_payment.id;

  if v_total_received < v_payment.amount_cents then
    outcome := 'partial';
    v_event_type := 'candidate_payment_partially_received';
  else
    select transition.outcome
    into v_transition_outcome
    from public.mark_pre_reservation_payment_paid(
      v_payment.id,
      p_received_at,
      p_payment_method
    ) transition;
    if v_transition_outcome not in ('paid', 'already_paid') then
      raise exception 'payment transition failed: %', coalesce(v_transition_outcome, 'missing');
    end if;

    select 1 + count(*)::integer into v_active_rank
    from public.reservations other_reservation
    join public.payments other_payment
      on other_payment.organization_id = other_reservation.organization_id
     and other_payment.reservation_id = other_reservation.id
     and other_payment.status = 'paid'
     and other_payment.payment_type in ('arrhes', 'pre_reservation_deposit_refundable')
     and other_payment.deleted_at is null
    where other_reservation.organization_id = v_reservation.organization_id
      and other_reservation.id <> v_reservation.id
      and other_reservation.litter_id is not distinct from v_reservation.litter_id
      and other_reservation.litter_group_id is not distinct from v_reservation.litter_group_id
      and other_reservation.deleted_at is null
      and (
        other_payment.paid_at < p_received_at
        or (other_payment.paid_at = p_received_at and other_reservation.id::text < v_reservation.id::text)
      );

    update public.applications application_row
    set active_rank = v_active_rank,
        updated_at = clock_timestamp(),
        updated_by = v_user_id
    where application_row.organization_id = v_reservation.organization_id
      and application_row.id = v_reservation.application_id
      and application_row.deleted_at is null;

    outcome := 'accepted';
    journey_opened := true;
    active_rank := v_active_rank;
    v_event_type := 'candidate_first_payment_accepted';
  end if;

  insert into public.candidate_journey_events (
    organization_id, application_id, contact_id, proposal_id, reservation_id,
    payment_id, event_type, actor_profile_id, actor_role, reason,
    previous_state, current_state, details, client_command_id, occurred_at
  ) values (
    v_payment.organization_id, v_reservation.application_id,
    v_payment.contact_id, p_proposal_id, v_reservation.id, v_payment.id,
    v_event_type, v_user_id, v_actor_role, p_exception_reason,
    jsonb_build_object('receivedAmountCents', v_payment.received_amount_cents),
    jsonb_build_object(
      'receivedAmountCents', v_total_received,
      'appliedAmountCents', v_applied,
      'unappliedAmountCents', v_unapplied,
      'journeyOpened', journey_opened,
      'activeRank', active_rank
    ),
    jsonb_build_object(
      'receiptAmountCents', p_received_amount_cents,
      'paymentMethod', p_payment_method,
      'reference', nullif(btrim(coalesce(p_reference, '')), '')
    ),
    p_client_command_id, p_received_at
  ) returning id into v_event_id;

  received_amount_cents := v_total_received;
  applied_amount_cents := v_applied;
  unapplied_amount_cents := v_unapplied;
  event_id := v_event_id;
  return next;
end;
$$;

revoke all on function public.record_candidate_journey_payment_receipt(uuid, uuid, integer, timestamptz, text, text, text, uuid) from public;
grant execute on function public.record_candidate_journey_payment_receipt(uuid, uuid, integer, timestamptz, text, text, text, uuid) to authenticated;

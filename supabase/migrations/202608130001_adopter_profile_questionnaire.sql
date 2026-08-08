-- PROFILE-REVIEW-01
-- One immutable family profile response per adopter journey, with secure public access.

begin;

create table public.adopter_profile_questionnaire_definitions (
  code text not null,
  version integer not null,
  definition_json jsonb not null,
  content_hash text not null,
  published_at timestamptz not null default now(),
  primary key (code, version),
  constraint adopter_profile_definition_code_check check (btrim(code) <> ''),
  constraint adopter_profile_definition_version_check check (version > 0),
  constraint adopter_profile_definition_json_check check (jsonb_typeof(definition_json) = 'object'),
  constraint adopter_profile_definition_hash_check check (content_hash ~ '^[0-9a-f]{64}$')
);

create table public.adopter_profile_questionnaire_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reservation_id uuid not null,
  contact_id uuid not null,
  application_id uuid,
  questionnaire_code text not null default 'adopter-profile',
  questionnaire_version integer not null default 1,
  initial_sex_preference text not null,
  relevant_litters_snapshot jsonb not null default '[]'::jsonb,
  due_at timestamptz not null,
  automatic_invitation_allowed boolean not null default true,
  draft_answers jsonb not null default '{}'::jsonb,
  draft_revision integer not null default 0,
  draft_updated_at timestamptz,
  final_answers jsonb,
  final_submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  proposed_sex_preference text,
  sex_preference_decision text,
  sex_preference_decided_at timestamptz,
  sex_preference_decided_by uuid references public.profiles(id),
  waived_at timestamptz,
  waived_by uuid references public.profiles(id),
  waiver_reason text,
  waiver_manual_contact_id uuid,
  invitation_delivery_attempt_id uuid,
  reminder_delivery_attempt_id uuid,
  invitation_last_failed_at timestamptz,
  reminder_last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adopter_profile_instances_org_id_unique unique (organization_id, id),
  constraint adopter_profile_instances_reservation_unique unique (organization_id, reservation_id),
  constraint adopter_profile_instances_reservation_fk foreign key (organization_id, reservation_id) references public.reservations(organization_id, id),
  constraint adopter_profile_instances_contact_fk foreign key (organization_id, contact_id) references public.contacts(organization_id, id),
  constraint adopter_profile_instances_application_fk foreign key (organization_id, application_id) references public.applications(organization_id, id),
  constraint adopter_profile_instances_definition_fk foreign key (questionnaire_code, questionnaire_version) references public.adopter_profile_questionnaire_definitions(code, version),
  constraint adopter_profile_instances_waiver_contact_fk foreign key (organization_id, waiver_manual_contact_id) references public.adopter_manual_contacts(organization_id, id),
  constraint adopter_profile_instances_invitation_attempt_fk foreign key (organization_id, invitation_delivery_attempt_id) references public.email_delivery_attempts(organization_id, id),
  constraint adopter_profile_instances_reminder_attempt_fk foreign key (organization_id, reminder_delivery_attempt_id) references public.email_delivery_attempts(organization_id, id),
  constraint adopter_profile_instances_revision_check check (draft_revision >= 0),
  constraint adopter_profile_instances_draft_check check (jsonb_typeof(draft_answers) = 'object' and pg_column_size(draft_answers) <= 131072),
  constraint adopter_profile_instances_final_check check (
    (final_answers is null and final_submitted_at is null)
    or (jsonb_typeof(final_answers) = 'object' and final_submitted_at is not null and pg_column_size(final_answers) <= 131072)
  ),
  constraint adopter_profile_instances_review_check check (
    (reviewed_at is null and reviewed_by is null)
    or (reviewed_at is not null and reviewed_by is not null and final_submitted_at is not null)
  ),
  constraint adopter_profile_instances_waiver_check check (
    (waived_at is null and waived_by is null and waiver_reason is null and waiver_manual_contact_id is null)
    or (waived_at is not null and waived_by is not null and length(btrim(waiver_reason)) between 3 and 1000 and waiver_manual_contact_id is not null and final_submitted_at is null)
  ),
  constraint adopter_profile_instances_completion_exclusive check (reviewed_at is null or waived_at is null),
  constraint adopter_profile_instances_sex_decision_check check (sex_preference_decision is null or sex_preference_decision in ('keep', 'update')),
  constraint adopter_profile_instances_sex_preference_check check (
    initial_sex_preference in ('male_only', 'female_only', 'male_preferred_female_possible', 'female_preferred_male_possible', 'no_preference', 'unknown')
    and (proposed_sex_preference is null or proposed_sex_preference in ('male_only', 'female_only', 'male_preferred_female_possible', 'female_preferred_male_possible', 'no_preference'))
  )
);

create index adopter_profile_instances_due_idx on public.adopter_profile_questionnaire_instances (due_at) where final_submitted_at is null and waived_at is null;
create index adopter_profile_instances_contact_idx on public.adopter_profile_questionnaire_instances (organization_id, contact_id, created_at desc);

create table public.adopter_profile_questionnaire_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  constraint adopter_profile_accesses_instance_fk foreign key (organization_id, instance_id) references public.adopter_profile_questionnaire_instances(organization_id, id),
  constraint adopter_profile_accesses_token_unique unique (token_hash),
  constraint adopter_profile_accesses_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint adopter_profile_accesses_dates_check check (expires_at is null or expires_at > created_at)
);

create index adopter_profile_accesses_instance_idx on public.adopter_profile_questionnaire_accesses (organization_id, instance_id, created_at desc);
create unique index adopter_profile_single_active_access_idx
  on public.adopter_profile_questionnaire_accesses (instance_id)
  where revoked_at is null;

create table public.adopter_profile_questionnaire_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid not null,
  access_id uuid not null references public.adopter_profile_questionnaire_accesses(id),
  session_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint adopter_profile_sessions_instance_fk foreign key (organization_id, instance_id) references public.adopter_profile_questionnaire_instances(organization_id, id),
  constraint adopter_profile_sessions_hash_unique unique (session_hash),
  constraint adopter_profile_sessions_hash_check check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint adopter_profile_sessions_dates_check check (expires_at > created_at)
);

create index adopter_profile_sessions_instance_idx on public.adopter_profile_questionnaire_sessions (organization_id, instance_id, expires_at desc);

create table public.adopter_profile_questionnaire_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid not null,
  command_type text not null,
  client_command_id uuid not null,
  outcome text not null,
  result_revision integer,
  created_at timestamptz not null default now(),
  constraint adopter_profile_commands_instance_fk foreign key (organization_id, instance_id) references public.adopter_profile_questionnaire_instances(organization_id, id),
  constraint adopter_profile_commands_unique unique (instance_id, command_type, client_command_id),
  constraint adopter_profile_commands_type_check check (command_type in ('save_draft', 'submit_final', 'review', 'waive', 'renew_access', 'revoke_access')),
  constraint adopter_profile_commands_outcome_check check (btrim(outcome) <> '')
);

create table public.adopter_profile_questionnaire_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid not null,
  reservation_id uuid not null,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id),
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid,
  occurred_at timestamptz not null default now(),
  constraint adopter_profile_events_instance_fk foreign key (organization_id, instance_id) references public.adopter_profile_questionnaire_instances(organization_id, id),
  constraint adopter_profile_events_reservation_fk foreign key (organization_id, reservation_id) references public.reservations(organization_id, id),
  constraint adopter_profile_events_command_unique unique (organization_id, client_command_id),
  constraint adopter_profile_events_role_check check (actor_role is null or actor_role in ('owner', 'admin', 'member')),
  constraint adopter_profile_events_details_check check (jsonb_typeof(details) = 'object')
);

create index adopter_profile_events_reservation_idx on public.adopter_profile_questionnaire_events (organization_id, reservation_id, occurred_at desc);
create unique index adopter_profile_single_delivery_event_idx
  on public.adopter_profile_questionnaire_events (instance_id, event_type, (details ->> 'attemptId'))
  where event_type in ('profile_questionnaire_sent', 'profile_questionnaire_reminder_sent');

create table public.adopter_profile_questionnaire_rate_limits (
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (key_hash, window_started_at),
  constraint adopter_profile_rate_limit_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint adopter_profile_rate_limit_count_check check (request_count > 0)
);

create table public.adopter_profile_questionnaire_reconciliation_attempts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid,
  outcome text not null,
  error_code text,
  details jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  constraint adopter_profile_reconciliation_reservation_fk foreign key (reservation_id) references public.reservations(id),
  constraint adopter_profile_reconciliation_details_check check (jsonb_typeof(details) = 'object')
);

alter table public.adopter_profile_questionnaire_definitions enable row level security;
alter table public.adopter_profile_questionnaire_instances enable row level security;
alter table public.adopter_profile_questionnaire_accesses enable row level security;
alter table public.adopter_profile_questionnaire_sessions enable row level security;
alter table public.adopter_profile_questionnaire_commands enable row level security;
alter table public.adopter_profile_questionnaire_events enable row level security;
alter table public.adopter_profile_questionnaire_rate_limits enable row level security;
alter table public.adopter_profile_questionnaire_reconciliation_attempts enable row level security;

create policy adopter_profile_definitions_read on public.adopter_profile_questionnaire_definitions for select to authenticated using (true);
create policy adopter_profile_instances_read on public.adopter_profile_questionnaire_instances for select to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member', 'viewer'])
);
create policy adopter_profile_events_read on public.adopter_profile_questionnaire_events for select to authenticated using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member', 'viewer'])
);

revoke all on public.adopter_profile_questionnaire_definitions from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_instances from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_accesses from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_sessions from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_commands from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_events from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_rate_limits from anon, authenticated;
revoke all on public.adopter_profile_questionnaire_reconciliation_attempts from anon, authenticated;
revoke insert, update, delete, truncate on public.adopter_profile_questionnaire_definitions from service_role;
revoke update, delete, truncate on public.adopter_profile_questionnaire_events from service_role;
revoke insert, update, delete, truncate on public.adopter_profile_questionnaire_commands from service_role;
revoke insert, update, delete, truncate on public.adopter_profile_questionnaire_reconciliation_attempts from service_role;
grant select on public.adopter_profile_questionnaire_definitions to authenticated;
grant select on public.adopter_profile_questionnaire_instances to authenticated;
grant select on public.adopter_profile_questionnaire_events to authenticated;
grant select on public.adopter_profile_questionnaire_definitions to service_role;
grant select on public.adopter_profile_questionnaire_instances to service_role;
grant select, insert, update on public.adopter_profile_questionnaire_accesses to service_role;
grant select, insert, update on public.adopter_profile_questionnaire_sessions to service_role;
grant select, insert, update, delete on public.adopter_profile_questionnaire_rate_limits to service_role;

create or replace function public.guard_adopter_profile_questionnaire_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if session_user = 'postgres'
     and current_setting('app.qa_hard_delete', true) = 'on'
     and tg_op = 'DELETE'
  then return old; end if;
  raise exception 'adopter profile questionnaire records are immutable';
end;
$$;

create trigger adopter_profile_definitions_immutable before update or delete on public.adopter_profile_questionnaire_definitions for each row execute function public.guard_adopter_profile_questionnaire_immutability();
create trigger adopter_profile_commands_immutable before update or delete on public.adopter_profile_questionnaire_commands for each row execute function public.guard_adopter_profile_questionnaire_immutability();
create trigger adopter_profile_reconciliation_immutable before update or delete on public.adopter_profile_questionnaire_reconciliation_attempts for each row execute function public.guard_adopter_profile_questionnaire_immutability();

create or replace function public.guard_adopter_profile_questionnaire_event_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if session_user = 'postgres'
     and current_setting('app.qa_hard_delete', true) = 'on'
     and tg_op = 'DELETE'
  then return old; end if;
  raise exception 'adopter profile questionnaire events are append-only';
end;
$$;

create trigger adopter_profile_events_immutable before update or delete on public.adopter_profile_questionnaire_events for each row execute function public.guard_adopter_profile_questionnaire_event_immutability();

create trigger adopter_profile_instances_set_updated_at before update on public.adopter_profile_questionnaire_instances for each row execute function public.set_updated_at();

with profile_definition as (
  select jsonb_build_object(
    'schemaVersion', 1,
    'code', 'adopter-profile',
    'version', 1,
    'title', 'Questionnaire d’accompagnement',
    'sections', jsonb_build_array(
      'sex_preference', 'litter_preference', 'household', 'animals', 'experience',
      'daily_organization', 'housing', 'environment', 'walks_activities',
      'education_support', 'desired_qualities', 'anticipated_difficulties', 'free_comment'
    ),
    'questionKeys', jsonb_build_array(
      'sex_preference_confirmation', 'sex_preference_proposal', 'litter_preference',
      'adults_count', 'children_present', 'children_ages', 'animals_present', 'animals',
      'dog_experience', 'dog_experience_details', 'daily_organization', 'daily_organization_other',
      'usual_alone_duration', 'first_weeks_organization', 'first_weeks_organization_other',
      'housing', 'home_environment', 'home_environment_other', 'urban_exposure',
      'walk_environments', 'walk_environments_other', 'adult_walk_rhythm', 'walk_freedom',
      'planned_activities', 'planned_activities_other', 'education_support', 'education_support_other',
      'advice_topics', 'advice_topics_other', 'desired_qualities', 'desired_quality_ranking',
      'indispensable_quality_present', 'indispensable_quality', 'indispensable_quality_reason',
      'anticipated_difficulties', 'anticipated_difficulties_other',
      'incompatible_situation_present', 'incompatible_situations',
      'incompatible_situation_reason', 'free_comment'
    ),
    'rules', jsonb_build_object('maxQualities', 4, 'singleFinalSubmission', true, 'scoring', false)
  ) as value
)
insert into public.adopter_profile_questionnaire_definitions (code, version, definition_json, content_hash, published_at)
select 'adopter-profile', 1, value,
  encode(digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex'), now()
from profile_definition;

create or replace function public.ensure_adopter_profile_questionnaire_instance(
  p_reservation_id uuid,
  p_opened_at timestamptz default now(),
  p_automatic_invitation_allowed boolean default true
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_instance_id uuid;
  v_previous_answers jsonb := '{}'::jsonb;
  v_litter_context jsonb := '[]'::jsonb;
begin
  select * into v_reservation from public.reservations reservation
  where reservation.id = p_reservation_id and reservation.deleted_at is null
  for update;
  if not found or v_reservation.status in ('draft', 'adopted', 'withdrawn', 'expired', 'cancelled', 'archived') then return null; end if;

  select instance.final_answers - 'litter_preference' - 'sex_preference_confirmation' - 'sex_preference_proposal'
  into v_previous_answers
  from public.adopter_profile_questionnaire_instances instance
  where instance.organization_id = v_reservation.organization_id
    and instance.contact_id = v_reservation.contact_id
    and instance.reviewed_at is not null
    and instance.reservation_id <> v_reservation.id
  order by instance.reviewed_at desc limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', litter.id, 'label', litter.name)
    order by litter.expected_birth_date nulls last, litter.name
  ), '[]'::jsonb)
  into v_litter_context
  from public.litters litter
  where litter.organization_id = v_reservation.organization_id
    and litter.deleted_at is null
    and litter.status not in ('not_pregnant', 'pregnancy_lost', 'closed', 'cancelled', 'archived')
    and (
      (v_reservation.litter_group_id is not null and litter.litter_group_id = v_reservation.litter_group_id)
      or (v_reservation.litter_group_id is null and v_reservation.litter_id is not null and litter.id = v_reservation.litter_id)
    );

  insert into public.adopter_profile_questionnaire_instances (
    organization_id, reservation_id, contact_id, application_id,
    initial_sex_preference, relevant_litters_snapshot, due_at, automatic_invitation_allowed, draft_answers
  ) values (
    v_reservation.organization_id, v_reservation.id, v_reservation.contact_id,
    v_reservation.application_id, v_reservation.reserved_sex_preference, v_litter_context,
    coalesce(p_opened_at, now()) + interval '14 days', p_automatic_invitation_allowed,
    coalesce(v_previous_answers, '{}'::jsonb)
  ) on conflict (organization_id, reservation_id) do nothing
  returning id into v_instance_id;

  if v_instance_id is null then
    select instance.id into v_instance_id from public.adopter_profile_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id and instance.reservation_id = v_reservation.id;
  else
    insert into public.adopter_profile_questionnaire_events (
      organization_id, instance_id, reservation_id, event_type, details
    ) values (
      v_reservation.organization_id, v_instance_id, v_reservation.id, 'profile_questionnaire_created',
      jsonb_build_object('automaticInvitationAllowed', p_automatic_invitation_allowed)
    );
  end if;
  return v_instance_id;
end;
$$;
revoke all on function public.ensure_adopter_profile_questionnaire_instance(uuid, timestamptz, boolean) from public;
grant execute on function public.ensure_adopter_profile_questionnaire_instance(uuid, timestamptz, boolean) to service_role;

create or replace function public.provision_adopter_profile_from_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reservation_id is not null
     and new.deleted_at is null
     and new.payment_type in ('arrhes', 'pre_reservation_deposit_refundable')
     and new.status in ('paid', 'partially_paid', 'partially_refunded', 'converted_to_credit', 'transferred') then
    begin
      perform public.ensure_adopter_profile_questionnaire_instance(new.reservation_id, coalesce(new.paid_at, now()), true);
    exception when others then
      insert into public.adopter_profile_questionnaire_reconciliation_attempts (
        reservation_id, outcome, error_code, details
      ) values (
        new.reservation_id, 'failed', sqlstate,
        jsonb_build_object('source', 'payment', 'paymentId', new.id)
      );
    end;
  end if;
  return new;
end;
$$;
create trigger adopter_profile_questionnaire_payment_provisioning
after insert or update of status, paid_at on public.payments
for each row execute function public.provision_adopter_profile_from_payment();

create or replace function public.provision_adopter_profile_from_journey_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type = 'candidate_first_payment_accepted' and new.reservation_id is not null then
    begin
      perform public.ensure_adopter_profile_questionnaire_instance(new.reservation_id, new.occurred_at, true);
    exception when others then
      insert into public.adopter_profile_questionnaire_reconciliation_attempts (
        reservation_id, outcome, error_code, details
      ) values (
        new.reservation_id, 'failed', sqlstate,
        jsonb_build_object('source', 'journey_event', 'journeyEventId', new.id)
      );
    end;
  end if;
  return new;
end;
$$;
create trigger adopter_profile_questionnaire_journey_event_provisioning
after insert on public.candidate_journey_events
for each row execute function public.provision_adopter_profile_from_journey_event();

create or replace function public.reconcile_adopter_profile_questionnaire_instances()
returns table (reservation_id uuid, instance_id uuid, outcome text)
language plpgsql security definer set search_path = '' as $$
declare v_reservation record; v_instance uuid;
begin
  for v_reservation in
    select reservation.id,
      coalesce(
        (select max(event.occurred_at) from public.candidate_journey_events event where event.reservation_id = reservation.id and event.event_type = 'candidate_first_payment_accepted'),
        (select max(payment.paid_at) from public.payments payment where payment.reservation_id = reservation.id and payment.deleted_at is null and payment.payment_type in ('arrhes', 'pre_reservation_deposit_refundable') and payment.status in ('paid', 'partially_paid', 'partially_refunded', 'converted_to_credit', 'transferred'))
      ) as opened_at
    from public.reservations reservation
    where reservation.deleted_at is null
      and reservation.status not in ('draft', 'adopted', 'withdrawn', 'expired', 'cancelled', 'archived')
      and not exists (select 1 from public.adopter_profile_questionnaire_instances instance where instance.organization_id = reservation.organization_id and instance.reservation_id = reservation.id)
      and (
        exists (select 1 from public.candidate_journey_events event where event.reservation_id = reservation.id and event.event_type = 'candidate_first_payment_accepted')
        or exists (select 1 from public.payments payment where payment.reservation_id = reservation.id and payment.deleted_at is null and payment.payment_type in ('arrhes', 'pre_reservation_deposit_refundable') and payment.status in ('paid', 'partially_paid', 'partially_refunded', 'converted_to_credit', 'transferred'))
      )
  loop
    begin
      v_instance := null;
      -- false -- historical activation never sends automatically
      v_instance := public.ensure_adopter_profile_questionnaire_instance(v_reservation.id, v_reservation.opened_at, false);
      insert into public.adopter_profile_questionnaire_reconciliation_attempts (reservation_id, outcome)
      values (v_reservation.id, case when v_instance is null then 'ineligible' else 'created' end);
      reservation_id := v_reservation.id; instance_id := v_instance; outcome := case when v_instance is null then 'ineligible' else 'created' end;
      return next;
    exception when others then
      insert into public.adopter_profile_questionnaire_reconciliation_attempts (reservation_id, outcome, error_code, details)
      values (v_reservation.id, 'failed', sqlstate, jsonb_build_object('source', 'reconciliation'));
      reservation_id := v_reservation.id; instance_id := null; outcome := 'failed';
      return next;
    end;
  end loop;
end;
$$;
revoke all on function public.reconcile_adopter_profile_questionnaire_instances() from public;
grant execute on function public.reconcile_adopter_profile_questionnaire_instances() to service_role;

create or replace function public.finalize_adopter_profile_questionnaire_delivery(
  p_instance_id uuid,
  p_attempt_id uuid,
  p_kind text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_instance public.adopter_profile_questionnaire_instances%rowtype;
  v_attempt public.email_delivery_attempts%rowtype;
  v_expected_message_type text;
  v_event_type text;
begin
  if p_kind not in ('invitation', 'reminder') then return 'invalid_kind'; end if;
  v_expected_message_type := case when p_kind = 'invitation' then 'adopter_profile_invitation' else 'adopter_profile_reminder' end;
  v_event_type := case when p_kind = 'invitation' then 'profile_questionnaire_sent' else 'profile_questionnaire_reminder_sent' end;

  select * into v_instance
  from public.adopter_profile_questionnaire_instances
  where id = p_instance_id
  for update;
  if not found then return 'not_found'; end if;

  select * into v_attempt
  from public.email_delivery_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.organization_id = v_instance.organization_id
    and attempt.contact_id = v_instance.contact_id
    and attempt.reservation_id = v_instance.reservation_id
    and attempt.message_type = v_expected_message_type
    and attempt.status = 'sent'
    and attempt.deleted_at is null;
  if not found then return 'invalid_attempt'; end if;

  if p_kind = 'invitation' then
    update public.adopter_profile_questionnaire_instances
    set invitation_delivery_attempt_id = p_attempt_id,
        invitation_last_failed_at = null
    where id = v_instance.id;
  else
    update public.adopter_profile_questionnaire_instances
    set reminder_delivery_attempt_id = p_attempt_id,
        reminder_last_failed_at = null
    where id = v_instance.id;
  end if;

  insert into public.adopter_profile_questionnaire_events (
    organization_id, instance_id, reservation_id, event_type, details
  ) values (
    v_instance.organization_id, v_instance.id, v_instance.reservation_id,
    v_event_type, jsonb_build_object('attemptId', p_attempt_id)
  ) on conflict do nothing;

  return 'finalized';
end;
$$;
revoke all on function public.finalize_adopter_profile_questionnaire_delivery(uuid, uuid, text) from public;
grant execute on function public.finalize_adopter_profile_questionnaire_delivery(uuid, uuid, text) to service_role;

create or replace function public.record_adopter_profile_questionnaire_delivery_failure(
  p_instance_id uuid,
  p_kind text,
  p_error_code text,
  p_attempt_id uuid default null
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_instance public.adopter_profile_questionnaire_instances%rowtype;
begin
  if p_kind not in ('invitation', 'reminder') then return 'invalid_kind'; end if;
  if length(btrim(coalesce(p_error_code, ''))) not between 1 and 200 then return 'invalid_error_code'; end if;

  select * into v_instance
  from public.adopter_profile_questionnaire_instances
  where id = p_instance_id
  for update;
  if not found then return 'not_found'; end if;

  if p_kind = 'invitation' then
    update public.adopter_profile_questionnaire_instances
    set invitation_last_failed_at = now()
    where id = v_instance.id;
  else
    update public.adopter_profile_questionnaire_instances
    set reminder_last_failed_at = now()
    where id = v_instance.id;
  end if;

  insert into public.adopter_profile_questionnaire_events (
    organization_id, instance_id, reservation_id, event_type, details
  ) values (
    v_instance.organization_id, v_instance.id, v_instance.reservation_id,
    'profile_questionnaire_send_failed',
    jsonb_build_object('kind', p_kind, 'code', btrim(p_error_code), 'attemptId', p_attempt_id)
  );
  return 'recorded';
end;
$$;
revoke all on function public.record_adopter_profile_questionnaire_delivery_failure(uuid, text, text, uuid) from public;
grant execute on function public.record_adopter_profile_questionnaire_delivery_failure(uuid, text, text, uuid) to service_role;

create or replace function public.read_adopter_profile_questionnaire_delivery_context(
  p_instance_id uuid,
  p_kind text
)
returns table (
  contact_first_name text,
  contact_display_name text,
  contact_email text,
  organization_name text,
  email_template_id uuid,
  brevo_template_id bigint,
  subject text,
  actor_profile_id uuid
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('invitation', 'reminder') then return; end if;
  return query
  select contact.first_name,
    contact.display_name,
    contact.email,
    coalesce(organization.dog_affix_name, organization.affix_name, organization.name),
    template.id,
    template.brevo_template_id,
    template.subject,
    actor.profile_id
  from public.adopter_profile_questionnaire_instances instance
  join public.contacts contact
    on contact.organization_id = instance.organization_id
   and contact.id = instance.contact_id
   and contact.deleted_at is null
  join public.organizations organization
    on organization.id = instance.organization_id
   and organization.deleted_at is null
  left join lateral (
    select candidate.id, candidate.brevo_template_id, candidate.subject
    from public.email_templates candidate
    where candidate.organization_id = instance.organization_id
      and candidate.template_key = case when p_kind = 'invitation' then 'adopter_profile_invitation' else 'adopter_profile_reminder' end
      and candidate.is_active = true
      and candidate.deleted_at is null
    order by candidate.created_at desc
    limit 1
  ) template on true
  left join lateral (
    select membership.profile_id
    from public.memberships membership
    where membership.organization_id = instance.organization_id
      and membership.role in ('owner', 'admin')
      and membership.status = 'active'
      and membership.deleted_at is null
    order by case when membership.role = 'owner' then 0 else 1 end, membership.created_at
    limit 1
  ) actor on true
  where instance.id = p_instance_id;
end;
$$;
revoke all on function public.read_adopter_profile_questionnaire_delivery_context(uuid, text) from public;
grant execute on function public.read_adopter_profile_questionnaire_delivery_context(uuid, text) to service_role;

create or replace function public.list_due_adopter_profile_questionnaire_deliveries(
  p_limit integer default 4
)
returns table (instance_id uuid, delivery_kind text)
language sql security definer set search_path = '' as $$
  select instance.id,
    case when instance.invitation_delivery_attempt_id is null then 'invitation' else 'reminder' end
  from public.adopter_profile_questionnaire_instances instance
  left join public.email_delivery_attempts invitation
    on invitation.id = instance.invitation_delivery_attempt_id
   and invitation.organization_id = instance.organization_id
   and invitation.deleted_at is null
  where instance.final_submitted_at is null
    and instance.waived_at is null
    and (
      (
        instance.automatic_invitation_allowed = true
        and instance.invitation_delivery_attempt_id is null
        and instance.invitation_last_failed_at is null
      )
      or (
        instance.invitation_delivery_attempt_id is not null
        and invitation.sent_at <= now() - interval '7 days'
        and instance.reminder_delivery_attempt_id is null
        and instance.reminder_last_failed_at is null
      )
    )
  order by
    case when instance.invitation_delivery_attempt_id is null then instance.created_at else invitation.sent_at + interval '7 days' end,
    instance.id
  limit greatest(1, least(coalesce(p_limit, 4), 20));
$$;
revoke all on function public.list_due_adopter_profile_questionnaire_deliveries(integer) from public;
grant execute on function public.list_due_adopter_profile_questionnaire_deliveries(integer) to service_role;

create or replace function public.exchange_adopter_profile_questionnaire_token(
  p_token_hash text,
  p_session_hash text
)
returns table (outcome text, session_expires_at timestamptz, instance_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_access public.adopter_profile_questionnaire_accesses%rowtype;
begin
  outcome := null; session_expires_at := null; instance_id := null;
  select * into v_access
  from public.adopter_profile_questionnaire_accesses access
  where access.token_hash = p_token_hash
    and access.revoked_at is null
    and (access.expires_at is null or access.expires_at > now())
  for update;
  if not found then outcome := 'unavailable'; return next; return; end if;
  session_expires_at := now() + interval '7 days';
  instance_id := v_access.instance_id;
  insert into public.adopter_profile_questionnaire_sessions (
    organization_id, instance_id, access_id, session_hash, expires_at
  ) values (
    v_access.organization_id, v_access.instance_id, v_access.id,
    p_session_hash, session_expires_at
  );
  outcome := 'success'; return next;
end;
$$;
revoke all on function public.exchange_adopter_profile_questionnaire_token(text, text) from public;
grant execute on function public.exchange_adopter_profile_questionnaire_token(text, text) to service_role;

create or replace function public.read_adopter_profile_questionnaire_public_context(
  p_session_hash text
)
returns table (
  instance_id uuid,
  family_name text,
  organization_name text,
  initial_sex_preference text,
  relevant_litters_snapshot jsonb,
  due_at timestamptz,
  draft_answers jsonb,
  draft_revision integer,
  final_submitted_at timestamptz,
  waived_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  select instance.id,
    contact.display_name,
    coalesce(organization.dog_affix_name, organization.affix_name, organization.name),
    instance.initial_sex_preference,
    instance.relevant_litters_snapshot,
    instance.due_at,
    instance.draft_answers,
    instance.draft_revision,
    instance.final_submitted_at,
    instance.waived_at
  from public.adopter_profile_questionnaire_sessions session
  join public.adopter_profile_questionnaire_accesses access
    on access.id = session.access_id
   and access.revoked_at is null
   and (access.expires_at is null or access.expires_at > now())
  join public.adopter_profile_questionnaire_instances instance
    on instance.id = session.instance_id
   and instance.organization_id = session.organization_id
  join public.contacts contact
    on contact.id = instance.contact_id
   and contact.organization_id = instance.organization_id
   and contact.deleted_at is null
  join public.organizations organization
    on organization.id = instance.organization_id
   and organization.deleted_at is null
  where session.session_hash = p_session_hash
    and session.revoked_at is null
    and session.expires_at > now();

  update public.adopter_profile_questionnaire_sessions
  set last_seen_at = now()
  where session_hash = p_session_hash
    and revoked_at is null
    and expires_at > now();
end;
$$;
revoke all on function public.read_adopter_profile_questionnaire_public_context(text) from public;
grant execute on function public.read_adopter_profile_questionnaire_public_context(text) to service_role;

create or replace function public.save_adopter_profile_questionnaire_draft(
  p_session_hash text,
  p_expected_revision integer,
  p_answers jsonb,
  p_client_command_id uuid
)
returns table (outcome text, revision integer)
language plpgsql security definer set search_path = '' as $$
declare v_session public.adopter_profile_questionnaire_sessions%rowtype; v_instance public.adopter_profile_questionnaire_instances%rowtype; v_existing public.adopter_profile_questionnaire_commands%rowtype;
begin
  outcome := null; revision := null;
  select session.* into v_session from public.adopter_profile_questionnaire_sessions session
  join public.adopter_profile_questionnaire_accesses access on access.id = session.access_id
  where session.session_hash = p_session_hash and session.revoked_at is null and session.expires_at > now()
    and access.revoked_at is null and (access.expires_at is null or access.expires_at > now()) for update of session;
  if not found then outcome := 'unavailable'; return next; return; end if;
  select * into v_instance from public.adopter_profile_questionnaire_instances where id = v_session.instance_id for update;
  select * into v_existing from public.adopter_profile_questionnaire_commands command where command.instance_id = v_instance.id and command.command_type = 'save_draft' and command.client_command_id = p_client_command_id;
  if found then outcome := v_existing.outcome; revision := v_existing.result_revision; return next; return; end if;
  if v_instance.final_submitted_at is not null or v_instance.waived_at is not null then outcome := 'locked'; return next; return; end if;
  if p_expected_revision <> v_instance.draft_revision then outcome := 'conflict'; revision := v_instance.draft_revision; return next; return; end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 131072 then outcome := 'invalid'; return next; return; end if;
  update public.adopter_profile_questionnaire_instances set draft_answers = p_answers, draft_revision = draft_revision + 1, draft_updated_at = now() where id = v_instance.id returning draft_revision into revision;
  outcome := 'saved';
  insert into public.adopter_profile_questionnaire_commands (organization_id, instance_id, command_type, client_command_id, outcome, result_revision) values (v_instance.organization_id, v_instance.id, 'save_draft', p_client_command_id, outcome, revision);
  return next;
end;
$$;
revoke all on function public.save_adopter_profile_questionnaire_draft(text, integer, jsonb, uuid) from public;
grant execute on function public.save_adopter_profile_questionnaire_draft(text, integer, jsonb, uuid) to service_role;

create or replace function public.submit_adopter_profile_questionnaire(
  p_session_hash text,
  p_expected_revision integer,
  p_answers jsonb,
  p_client_command_id uuid
)
returns table (outcome text, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_session public.adopter_profile_questionnaire_sessions%rowtype; v_instance public.adopter_profile_questionnaire_instances%rowtype; v_existing public.adopter_profile_questionnaire_commands%rowtype;
begin
  outcome := null; submitted_at := null;
  select session.* into v_session from public.adopter_profile_questionnaire_sessions session
  join public.adopter_profile_questionnaire_accesses access on access.id = session.access_id
  where session.session_hash = p_session_hash and session.revoked_at is null and session.expires_at > now()
    and access.revoked_at is null and (access.expires_at is null or access.expires_at > now()) for update of session;
  if not found then outcome := 'unavailable'; return next; return; end if;
  select * into v_instance from public.adopter_profile_questionnaire_instances where id = v_session.instance_id for update;
  select * into v_existing from public.adopter_profile_questionnaire_commands command where command.instance_id = v_instance.id and command.command_type = 'submit_final' and command.client_command_id = p_client_command_id;
  if found then outcome := v_existing.outcome; select instance.final_submitted_at into submitted_at from public.adopter_profile_questionnaire_instances instance where instance.id = v_instance.id; return next; return; end if;
  if v_instance.final_submitted_at is not null then outcome := 'already_submitted'; submitted_at := v_instance.final_submitted_at; return next; return; end if;
  if v_instance.waived_at is not null then outcome := 'locked'; return next; return; end if;
  if p_expected_revision <> v_instance.draft_revision then outcome := 'conflict'; return next; return; end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 131072 then outcome := 'invalid'; return next; return; end if;
  update public.adopter_profile_questionnaire_instances
  set final_answers = p_answers,
      final_submitted_at = now(),
      draft_answers = p_answers,
      proposed_sex_preference = case
        when p_answers ->> 'sex_preference_confirmation' = 'changed'
          then p_answers ->> 'sex_preference_proposal'
        else initial_sex_preference
      end,
      draft_revision = draft_revision + 1
  where id = v_instance.id returning final_submitted_at into submitted_at;
  outcome := 'submitted';
  insert into public.adopter_profile_questionnaire_commands (organization_id, instance_id, command_type, client_command_id, outcome, result_revision) values (v_instance.organization_id, v_instance.id, 'submit_final', p_client_command_id, outcome, v_instance.draft_revision);
  insert into public.adopter_profile_questionnaire_events (organization_id, instance_id, reservation_id, event_type, details, client_command_id) values (v_instance.organization_id, v_instance.id, v_instance.reservation_id, 'profile_questionnaire_received', '{}'::jsonb, p_client_command_id);
  return next;
end;
$$;
revoke all on function public.submit_adopter_profile_questionnaire(text, integer, jsonb, uuid) from public;
grant execute on function public.submit_adopter_profile_questionnaire(text, integer, jsonb, uuid) to service_role;

create or replace function public.review_adopter_profile_questionnaire(
  p_instance_id uuid,
  p_sex_preference_decision text,
  p_client_command_id uuid
)
returns table (outcome text, reviewed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_instance public.adopter_profile_questionnaire_instances%rowtype; v_role text;
begin
  outcome := null; reviewed_at := null;
  select * into v_instance from public.adopter_profile_questionnaire_instances where id = p_instance_id for update;
  if not found or v_user is null then outcome := 'ineligible'; return next; return; end if;
  select membership.role into v_role from public.memberships membership where membership.organization_id = v_instance.organization_id and membership.profile_id = v_user and membership.status = 'active' and membership.deleted_at is null;
  if not public.has_organization_role(v_instance.organization_id, array['owner', 'admin']) then outcome := 'forbidden'; return next; return; end if;
  if v_instance.final_submitted_at is null or v_instance.waived_at is not null then outcome := 'ineligible'; return next; return; end if;
  if v_instance.reviewed_at is not null then outcome := 'already_reviewed'; reviewed_at := v_instance.reviewed_at; return next; return; end if;
  if v_instance.proposed_sex_preference is distinct from null and v_instance.proposed_sex_preference is distinct from v_instance.initial_sex_preference and p_sex_preference_decision not in ('keep', 'update') then outcome := 'sex_decision_required'; return next; return; end if;
  if p_sex_preference_decision = 'update' then update public.reservations set reserved_sex_preference = v_instance.proposed_sex_preference, updated_by = v_user where id = v_instance.reservation_id; end if;
  update public.adopter_profile_questionnaire_instances set reviewed_at = now(), reviewed_by = v_user, sex_preference_decision = p_sex_preference_decision, sex_preference_decided_at = case when p_sex_preference_decision is null then null else now() end, sex_preference_decided_by = case when p_sex_preference_decision is null then null else v_user end where id = v_instance.id returning adopter_profile_questionnaire_instances.reviewed_at into reviewed_at;
  outcome := 'reviewed';
  insert into public.adopter_profile_questionnaire_events (organization_id, instance_id, reservation_id, event_type, actor_profile_id, actor_role, details, client_command_id) values (v_instance.organization_id, v_instance.id, v_instance.reservation_id, 'profile_questionnaire_reviewed', v_user, v_role, jsonb_build_object('sexPreferenceDecision', p_sex_preference_decision), p_client_command_id);
  return next;
end;
$$;
revoke all on function public.review_adopter_profile_questionnaire(uuid, text, uuid) from public;
grant execute on function public.review_adopter_profile_questionnaire(uuid, text, uuid) to authenticated;

create or replace function public.waive_adopter_profile_questionnaire(
  p_instance_id uuid,
  p_reason text,
  p_manual_contact_id uuid,
  p_client_command_id uuid
)
returns table (outcome text, waived_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_instance public.adopter_profile_questionnaire_instances%rowtype; v_role text;
begin
  outcome := null; waived_at := null;
  select * into v_instance from public.adopter_profile_questionnaire_instances where id = p_instance_id for update;
  if not found or v_user is null then outcome := 'ineligible'; return next; return; end if;
  select membership.role into v_role from public.memberships membership where membership.organization_id = v_instance.organization_id and membership.profile_id = v_user and membership.status = 'active' and membership.deleted_at is null;
  if not public.has_organization_role(v_instance.organization_id, array['owner', 'admin']) then outcome := 'forbidden'; return next; return; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then outcome := 'reason_required'; return next; return; end if;
  if not exists (select 1 from public.adopter_manual_contacts contact where contact.organization_id = v_instance.organization_id and contact.reservation_id = v_instance.reservation_id and contact.id = p_manual_contact_id) then outcome := 'manual_contact_required'; return next; return; end if;
  if v_instance.final_submitted_at is not null or v_instance.reviewed_at is not null then outcome := 'ineligible'; return next; return; end if;
  if v_instance.waived_at is not null then outcome := 'already_waived'; waived_at := v_instance.waived_at; return next; return; end if;
  update public.adopter_profile_questionnaire_instances set waived_at = now(), waived_by = v_user, waiver_reason = btrim(p_reason), waiver_manual_contact_id = p_manual_contact_id where id = v_instance.id returning adopter_profile_questionnaire_instances.waived_at into waived_at;
  outcome := 'waived';
  insert into public.adopter_profile_questionnaire_events (organization_id, instance_id, reservation_id, event_type, actor_profile_id, actor_role, details, client_command_id) values (v_instance.organization_id, v_instance.id, v_instance.reservation_id, 'profile_questionnaire_waived', v_user, v_role, jsonb_build_object('reason', btrim(p_reason), 'manualContactId', p_manual_contact_id), p_client_command_id);
  return next;
end;
$$;
revoke all on function public.waive_adopter_profile_questionnaire(uuid, text, uuid, uuid) from public;
grant execute on function public.waive_adopter_profile_questionnaire(uuid, text, uuid, uuid) to authenticated;

create or replace function public.revoke_adopter_profile_questionnaire_access(
  p_instance_id uuid,
  p_reason text,
  p_client_command_id uuid
)
returns table (outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_instance public.adopter_profile_questionnaire_instances%rowtype;
  v_existing public.adopter_profile_questionnaire_commands%rowtype;
  v_role text;
  v_revoked_count integer := 0;
begin
  outcome := null;
  if p_reason not in ('manual', 'renewal') then outcome := 'invalid_reason'; return next; return; end if;
  if p_client_command_id is null then outcome := 'invalid_command'; return next; return; end if;

  select * into v_instance
  from public.adopter_profile_questionnaire_instances
  where id = p_instance_id
  for update;
  if not found or v_user is null then outcome := 'ineligible'; return next; return; end if;

  select membership.role into v_role
  from public.memberships membership
  where membership.organization_id = v_instance.organization_id
    and membership.profile_id = v_user
    and membership.status = 'active'
    and membership.deleted_at is null;
  if not public.has_organization_role(v_instance.organization_id, array['owner', 'admin']) then outcome := 'forbidden'; return next; return; end if;

  select * into v_existing
  from public.adopter_profile_questionnaire_commands command
  where command.instance_id = v_instance.id
    and command.command_type = 'revoke_access'
    and command.client_command_id = p_client_command_id;
  if found then outcome := v_existing.outcome; return next; return; end if;

  update public.adopter_profile_questionnaire_accesses
  set revoked_at = now(), revoked_by = v_user
  where instance_id = v_instance.id and revoked_at is null;
  get diagnostics v_revoked_count = row_count;

  update public.adopter_profile_questionnaire_sessions
  set revoked_at = coalesce(revoked_at, now())
  where instance_id = v_instance.id and revoked_at is null;

  outcome := case when v_revoked_count > 0 then 'revoked' else 'already_revoked' end;
  insert into public.adopter_profile_questionnaire_commands (
    organization_id, instance_id, command_type, client_command_id, outcome
  ) values (
    v_instance.organization_id, v_instance.id, 'revoke_access', p_client_command_id, outcome
  );

  if v_revoked_count > 0 then
    insert into public.adopter_profile_questionnaire_events (
      organization_id, instance_id, reservation_id, event_type,
      actor_profile_id, actor_role, details, client_command_id
    ) values (
      v_instance.organization_id, v_instance.id, v_instance.reservation_id,
      'profile_questionnaire_access_revoked', v_user, v_role,
      jsonb_build_object('reason', p_reason), p_client_command_id
    );
  end if;
  return next;
end;
$$;
revoke all on function public.revoke_adopter_profile_questionnaire_access(uuid, text, uuid) from public;
grant execute on function public.revoke_adopter_profile_questionnaire_access(uuid, text, uuid) to authenticated;

-- Activation backfill: create missing historical instances without sending any communication.
select count(*) from public.reconcile_adopter_profile_questionnaire_instances();

commit;

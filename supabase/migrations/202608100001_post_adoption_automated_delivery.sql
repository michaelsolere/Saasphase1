begin;

alter table public.organization_settings
  add column post_adoption_automation_activated_at timestamptz,
  add column post_adoption_automation_timezone text not null default 'Europe/Paris',
  add column post_adoption_automation_activated_by uuid references public.profiles(id) on delete restrict;

alter table public.organization_settings
  add constraint organization_settings_post_adoption_automation_check
  check (
    (post_adoption_automation_activated_at is null and post_adoption_automation_activated_by is null)
    or (post_adoption_automation_activated_at is not null and post_adoption_automation_activated_by is not null)
  );

alter table public.post_adoption_questionnaire_public_accesses
  alter column created_by drop not null,
  add column created_by_kind text not null default 'member',
  add column token_ciphertext text,
  add column token_iv text,
  add column token_auth_tag text,
  add column token_key_version text,
  add column encrypted_token_purged_at timestamptz,
  add constraint post_adoption_public_accesses_creator_check check (
    (created_by_kind = 'member' and created_by is not null)
    or (created_by_kind = 'system' and created_by is null)
  ),
  add constraint post_adoption_public_accesses_encrypted_token_check check (
    (
      token_ciphertext is null and token_iv is null and token_auth_tag is null
      and token_key_version is null
    ) or (
      token_ciphertext is not null and token_iv is not null and token_auth_tag is not null
      and token_key_version ~ '^[A-Za-z0-9._-]{1,32}$'
      and encrypted_token_purged_at is null
    )
  );

create table public.post_adoption_questionnaire_automation (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  cohort text not null,
  state text not null,
  reason_code text,
  timezone text not null,
  initial_scheduled_at timestamptz,
  automatic_until timestamptz,
  override_authorized_at timestamptz,
  override_authorized_by uuid references public.profiles(id) on delete restrict,
  override_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, instance_id),
  constraint post_adoption_automation_instance_fk foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_automation_cohort_check check (cohort in ('automatic','legacy')),
  constraint post_adoption_automation_state_check check (
    state in ('scheduled','active','suspended','non_applicable','completed','legacy_access_preserved')
  ),
  constraint post_adoption_automation_reason_check check (
    (state in ('suspended','non_applicable','legacy_access_preserved') and reason_code is not null)
    or (state not in ('suspended','non_applicable','legacy_access_preserved'))
  ),
  constraint post_adoption_automation_override_check check (
    (override_authorized_at is null and override_authorized_by is null and override_reason is null)
    or (
      override_authorized_at is not null and override_authorized_by is not null
      and char_length(btrim(override_reason)) between 10 and 2000
    )
  )
);
create index post_adoption_automation_queue_idx
  on public.post_adoption_questionnaire_automation(organization_id, state, initial_scheduled_at);
create trigger post_adoption_questionnaire_automation_set_updated_at
before update on public.post_adoption_questionnaire_automation
for each row execute function public.set_updated_at();

create table public.post_adoption_questionnaire_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  message_kind text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  lease_token uuid,
  claimed_at timestamptz,
  provider_call_started_at timestamptz,
  next_attempt_at timestamptz,
  attempt_count integer not null default 0,
  recipient_email_snapshot text,
  recipient_name_snapshot text,
  template_id_snapshot uuid,
  brevo_template_id_snapshot bigint,
  variables_snapshot jsonb not null default '{}'::jsonb,
  brevo_message_id text,
  accepted_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint post_adoption_dispatches_org_id_key unique (organization_id, id),
  constraint post_adoption_dispatches_instance_fk foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_dispatches_template_fk foreign key (organization_id, template_id_snapshot)
    references public.email_templates(organization_id, id) on delete restrict,
  constraint post_adoption_dispatches_kind_check check (message_kind in ('initial','reminder_7','reminder_14')),
  constraint post_adoption_dispatches_status_check check (
    status in ('pending','claimed','accepted','retryable','uncertain','cancelled')
  ),
  constraint post_adoption_dispatches_attempt_count_check check (attempt_count >= 0),
  constraint post_adoption_dispatches_variables_check check (jsonb_typeof(variables_snapshot) = 'object'),
  constraint post_adoption_dispatches_claim_check check (
    (status = 'claimed' and lease_token is not null and claimed_at is not null)
    or (status <> 'claimed' and lease_token is null and claimed_at is null)
  ),
  constraint post_adoption_dispatches_acceptance_check check (
    (status = 'accepted' and accepted_at is not null and brevo_message_id is not null)
    or status <> 'accepted'
  ),
  unique (organization_id, instance_id, message_kind)
);
create index post_adoption_dispatches_due_idx
  on public.post_adoption_questionnaire_dispatches(status, scheduled_at, next_attempt_at);
create trigger post_adoption_questionnaire_dispatches_set_updated_at
before update on public.post_adoption_questionnaire_dispatches
for each row execute function public.set_updated_at();

alter table public.email_delivery_attempts
  add column post_adoption_questionnaire_instance_id uuid,
  add column post_adoption_questionnaire_dispatch_id uuid,
  add constraint email_delivery_attempts_post_adoption_instance_fk
    foreign key (organization_id, post_adoption_questionnaire_instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  add constraint email_delivery_attempts_post_adoption_dispatch_fk
    foreign key (organization_id, post_adoption_questionnaire_dispatch_id)
    references public.post_adoption_questionnaire_dispatches(organization_id, id) on delete restrict;
create unique index email_delivery_attempts_post_adoption_dispatch_key
  on public.email_delivery_attempts(organization_id, post_adoption_questionnaire_dispatch_id)
  where post_adoption_questionnaire_dispatch_id is not null and deleted_at is null;

create table public.post_adoption_questionnaire_automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  dispatch_id uuid,
  event_type text not null,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint post_adoption_automation_events_org_id_key unique (organization_id, id),
  constraint post_adoption_automation_events_instance_fk foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_automation_events_dispatch_fk foreign key (organization_id, dispatch_id)
    references public.post_adoption_questionnaire_dispatches(organization_id, id) on delete restrict,
  constraint post_adoption_automation_events_actor_check check (
    actor_kind in ('member','system')
    and ((actor_kind = 'member' and actor_profile_id is not null)
      or (actor_kind = 'system' and actor_profile_id is null))
  ),
  constraint post_adoption_automation_events_details_check check (jsonb_typeof(details) = 'object')
);
create index post_adoption_automation_events_instance_idx
  on public.post_adoption_questionnaire_automation_events(organization_id, instance_id, occurred_at, id);

create or replace function public.post_adoption_questionnaire_automation_events_immutable()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' and session_user = 'postgres'
    and pg_catalog.current_setting('app.qa_hard_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'post-adoption automation history is immutable' using errcode = '55000';
end;
$fn$;
create trigger post_adoption_questionnaire_automation_events_immutable
before update or delete on public.post_adoption_questionnaire_automation_events
for each row execute function public.post_adoption_questionnaire_automation_events_immutable();

create or replace function public.post_adoption_delivery_scheduled_at(p_date date, p_timezone text)
returns timestamptz language plpgsql stable set search_path = '' as $fn$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid organization timezone' using errcode = '22023';
  end if;
  return (p_date + time '10:00') at time zone p_timezone;
end;
$fn$;

create or replace function public.schedule_post_adoption_questionnaire_automation()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_settings public.organization_settings%rowtype;
  v_reservation public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_milestone text;
  v_due_date date;
  v_limit_date date;
  v_scheduled_at timestamptz;
  v_state text := 'scheduled';
  v_reason text;
begin
  select * into v_settings from public.organization_settings where organization_id = new.organization_id;
  if v_settings.post_adoption_automation_activated_at is null then return new; end if;
  select * into v_reservation from public.reservations
    where organization_id = new.organization_id and id = new.reservation_id;
  if v_reservation.adoption_completed_at < v_settings.post_adoption_automation_activated_at then return new; end if;
  select * into v_animal from public.animals
    where organization_id = new.organization_id and id = new.animal_id;
  v_milestone := case when new.questionnaire_code = 'post-adoption-t1' then 't1' else 't2' end;
  if v_animal.birth_date is null then
    v_state := 'suspended'; v_reason := 'birth_date_missing';
  elsif v_milestone = 't1' then
    v_due_date := (v_reservation.adoption_completed_at at time zone v_settings.post_adoption_automation_timezone)::date + 60;
    v_limit_date := (v_animal.birth_date + interval '5 months')::date;
    if v_due_date > v_limit_date then v_state := 'suspended'; v_reason := 't1_age_limit_exceeded'; end if;
  else
    v_due_date := (v_animal.birth_date + interval '15 months')::date;
    if v_due_date < (v_reservation.adoption_completed_at at time zone v_settings.post_adoption_automation_timezone)::date then
      v_state := 'suspended'; v_reason := 't2_due_before_adoption';
    end if;
  end if;
  if v_due_date is not null then
    v_scheduled_at := greatest(
      public.post_adoption_delivery_scheduled_at(v_due_date, v_settings.post_adoption_automation_timezone),
      new.due_at
    );
  end if;
  insert into public.post_adoption_questionnaire_automation(
    organization_id, instance_id, cohort, state, reason_code, timezone,
    initial_scheduled_at, automatic_until
  ) values (
    new.organization_id, new.id, 'automatic', v_state, v_reason,
    v_settings.post_adoption_automation_timezone, v_scheduled_at,
    case
      when v_milestone = 't2' and v_due_date is not null
        then ((v_due_date + 31)::timestamp at time zone v_settings.post_adoption_automation_timezone) - interval '1 microsecond'
      when v_milestone = 't1' and v_limit_date is not null
        then ((v_limit_date + 1)::timestamp at time zone v_settings.post_adoption_automation_timezone) - interval '1 microsecond'
      else v_scheduled_at
    end
  );
  if v_state = 'scheduled' then
    insert into public.post_adoption_questionnaire_dispatches(
      organization_id, instance_id, message_kind, scheduled_at, next_attempt_at
    ) values (new.organization_id, new.id, 'initial', v_scheduled_at, v_scheduled_at);
  end if;
  insert into public.post_adoption_questionnaire_automation_events(
    organization_id, instance_id, event_type, actor_kind, details
  ) values (
    new.organization_id, new.id,
    case when v_state = 'scheduled' then 'automation_scheduled' else 'automation_suspended' end,
    'system', jsonb_build_object('reason_code', v_reason, 'scheduled_at', v_scheduled_at)
  );
  return new;
end;
$fn$;
create trigger post_adoption_questionnaire_schedule_automation
after insert on public.post_adoption_questionnaire_instances
for each row execute function public.schedule_post_adoption_questionnaire_automation();

create or replace function public.activate_post_adoption_questionnaire_automation(
  p_organization_id uuid,
  p_timezone text
)
returns table(outcome text, activated_at timestamptz, legacy_closed integer, legacy_access_preserved integer)
language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_closed integer := 0;
  v_preserved integer := 0;
begin
  if v_user_id is null then return query select 'not_authenticated'::text, null::timestamptz, 0, 0; return; end if;
  if not public.has_organization_role(p_organization_id, array['owner','admin']) then
    return query select 'forbidden'::text, null::timestamptz, 0, 0; return;
  end if;
  perform public.post_adoption_delivery_scheduled_at(current_date, p_timezone);
  insert into public.organization_settings(organization_id, post_adoption_automation_activated_at, post_adoption_automation_timezone, post_adoption_automation_activated_by)
  values (p_organization_id, v_now, p_timezone, v_user_id)
  on conflict (organization_id) do update set
    post_adoption_automation_activated_at = coalesce(public.organization_settings.post_adoption_automation_activated_at, excluded.post_adoption_automation_activated_at),
    post_adoption_automation_timezone = excluded.post_adoption_automation_timezone,
    post_adoption_automation_activated_by = coalesce(public.organization_settings.post_adoption_automation_activated_by, excluded.post_adoption_automation_activated_by)
  returning post_adoption_automation_activated_at into v_now;

  insert into public.post_adoption_questionnaire_automation(
    organization_id, instance_id, cohort, state, reason_code, timezone
  )
  select instance.organization_id, instance.id, 'legacy',
    case when access.id is null then 'non_applicable' else 'legacy_access_preserved' end,
    case when access.id is null then 'legacy_not_automated' else 'legacy_access_preserved' end,
    p_timezone
  from public.post_adoption_questionnaire_instances instance
  left join public.post_adoption_questionnaire_public_accesses access
    on access.organization_id = instance.organization_id and access.instance_id = instance.id and access.revoked_at is null
  where instance.organization_id = p_organization_id
  on conflict (organization_id, instance_id) do nothing;
  get diagnostics v_closed = row_count;
  select count(*) into v_preserved from public.post_adoption_questionnaire_automation
    where organization_id = p_organization_id and state = 'legacy_access_preserved';
  insert into public.post_adoption_questionnaire_automation_events(
    organization_id, instance_id, event_type, actor_kind, actor_profile_id, details
  )
  select automation.organization_id, automation.instance_id, 'legacy_classified', 'member', v_user_id,
    jsonb_build_object('reason_code', automation.reason_code, 'activation_at', v_now)
  from public.post_adoption_questionnaire_automation automation
  where automation.organization_id = p_organization_id and automation.cohort = 'legacy'
    and not exists (
      select 1 from public.post_adoption_questionnaire_automation_events event
      where event.organization_id = automation.organization_id and event.instance_id = automation.instance_id
        and event.event_type = 'legacy_classified'
    );
  return query select 'success'::text, v_now, greatest(v_closed - v_preserved, 0), v_preserved;
end;
$fn$;

create or replace function public.claim_post_adoption_questionnaire_dispatches(
  p_lease_token uuid,
  p_limit integer default 20,
  p_now timestamptz default statement_timestamp(),
  p_organization_id uuid default null
)
returns setof public.post_adoption_questionnaire_dispatches
language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_reservation_id uuid;
  v_expired record;
begin
  if p_lease_token is null or p_limit not between 1 and 100 then return; end if;
  for v_reservation_id in
    select reservation.id
    from public.reservations reservation
    join public.organization_settings settings
      on settings.organization_id = reservation.organization_id
    join public.animals animal
      on animal.organization_id = reservation.organization_id and animal.id = reservation.animal_id
    where settings.post_adoption_automation_activated_at is not null
      and reservation.status = 'adopted'
      and reservation.adoption_completed_at >= settings.post_adoption_automation_activated_at
      and reservation.deleted_at is null
      and animal.deleted_at is null
      and animal.birth_date is not null
      and (p_organization_id is null or reservation.organization_id = p_organization_id)
      and (
        select count(*)
        from public.post_adoption_questionnaire_instances instance
        where instance.organization_id = reservation.organization_id
          and instance.reservation_id = reservation.id
      ) < 2
    order by reservation.adoption_completed_at, reservation.id
    limit 50
  loop
    perform public.reconcile_post_adoption_questionnaire_reservation_internal(
      v_reservation_id, 'manual_retry', null, null, p_now
    );
  end loop;
  for v_expired in
    select automation.organization_id, automation.instance_id, instance.questionnaire_code
    from public.post_adoption_questionnaire_automation automation
    join public.post_adoption_questionnaire_instances instance
      on instance.organization_id = automation.organization_id and instance.id = automation.instance_id
    where automation.state = 'scheduled'
      and automation.override_authorized_at is null
      and automation.automatic_until < p_now
      and (p_organization_id is null or automation.organization_id = p_organization_id)
    for update of automation skip locked
  loop
    update public.post_adoption_questionnaire_automation
    set state = 'suspended',
        reason_code = case when v_expired.questionnaire_code = 'post-adoption-t1'
          then 't1_age_limit_exceeded' else 't2_automatic_catchup_expired' end
    where organization_id = v_expired.organization_id and instance_id = v_expired.instance_id;
    insert into public.post_adoption_questionnaire_automation_events(
      organization_id, instance_id, event_type, actor_kind, details
    ) values(
      v_expired.organization_id, v_expired.instance_id, 'automation_suspended', 'system',
      jsonb_build_object('reason_code', case when v_expired.questionnaire_code = 'post-adoption-t1'
        then 't1_age_limit_exceeded' else 't2_automatic_catchup_expired' end)
    );
  end loop;
  insert into public.post_adoption_questionnaire_events(
    organization_id, instance_id, event_type, from_status, to_status,
    actor_kind, details, occurred_at
  )
  select instance.organization_id, instance.id, 'expired', instance.status, 'expired',
    'system', jsonb_build_object('source','automated_delivery'), p_now
  from public.post_adoption_questionnaire_instances instance
  where instance.status in ('invited','in_progress')
    and instance.response_deadline_at < p_now;
  update public.post_adoption_questionnaire_dispatches dispatch
  set status = 'cancelled', lease_token = null, claimed_at = null,
      failed_at = p_now,
      last_error_code = case when instance.status = 'suspended'
        then 'questionnaire_suspended' else 'response_or_window_closed' end
  from public.post_adoption_questionnaire_instances instance
  where instance.organization_id = dispatch.organization_id
    and instance.id = dispatch.instance_id
    and dispatch.message_kind in ('reminder_7','reminder_14')
    and dispatch.status in ('pending','retryable','claimed')
    and instance.status not in ('invited','in_progress');
  update public.post_adoption_questionnaire_dispatches dispatch
  set status = 'pending', next_attempt_at = greatest(dispatch.scheduled_at, p_now),
      failed_at = null, last_error_code = null, last_error_message = null,
      provider_call_started_at = null
  from public.post_adoption_questionnaire_instances instance
  where instance.organization_id = dispatch.organization_id and instance.id = dispatch.instance_id
    and instance.status in ('invited','in_progress')
    and dispatch.status = 'cancelled' and dispatch.last_error_code = 'questionnaire_suspended'
    and instance.response_deadline_at >= p_now;
  update public.post_adoption_questionnaire_public_accesses
  set token_ciphertext = null, token_iv = null, token_auth_tag = null,
      token_key_version = null, encrypted_token_purged_at = p_now
  where public_read_until < p_now and token_ciphertext is not null;
  update public.post_adoption_questionnaire_dispatches
  set status = case when provider_call_started_at is null then 'retryable' else 'uncertain' end,
      lease_token = null, claimed_at = null,
      next_attempt_at = case when provider_call_started_at is null
        then least(coalesce(next_attempt_at, p_now), p_now) else next_attempt_at end,
      last_error_code = case when provider_call_started_at is null
        then 'lease_expired_before_provider' else 'lease_expired_after_provider_started' end
  where status = 'claimed' and claimed_at < p_now - interval '15 minutes';
  return query
  with candidates as (
    select dispatch.id
    from public.post_adoption_questionnaire_dispatches dispatch
    join public.post_adoption_questionnaire_automation automation
      on automation.organization_id = dispatch.organization_id and automation.instance_id = dispatch.instance_id
    join public.post_adoption_questionnaire_instances instance
      on instance.organization_id = dispatch.organization_id and instance.id = dispatch.instance_id
    where dispatch.status in ('pending','retryable')
      and (p_organization_id is null or dispatch.organization_id = p_organization_id)
      and dispatch.scheduled_at <= p_now
      and coalesce(dispatch.next_attempt_at, dispatch.scheduled_at) <= p_now
      and automation.state in ('scheduled','active')
      and (
        dispatch.message_kind <> 'initial'
        or automation.automatic_until is null
        or p_now <= automation.automatic_until
        or automation.override_authorized_at is not null
      )
      and (
        (dispatch.message_kind = 'initial' and (
          instance.status = 'due' or (instance.status = 'planned' and instance.due_at <= p_now)
        ))
        or (dispatch.message_kind in ('reminder_7','reminder_14') and instance.status in ('invited','in_progress'))
      )
    order by dispatch.scheduled_at, dispatch.id
    limit p_limit
    for update of dispatch skip locked
  )
  update public.post_adoption_questionnaire_dispatches dispatch
  set status = 'claimed', lease_token = p_lease_token, claimed_at = p_now,
      attempt_count = dispatch.attempt_count + 1
  from candidates where dispatch.id = candidates.id
  returning dispatch.*;
end;
$fn$;

create or replace function public.mark_post_adoption_questionnaire_dispatch_provider_started(
  p_dispatch_id uuid,
  p_lease_token uuid,
  p_recipient_email text,
  p_recipient_name text,
  p_template_id uuid,
  p_brevo_template_id bigint,
  p_variables_snapshot jsonb
)
returns boolean language sql security definer set search_path = '' set row_security = off as $fn$
  update public.post_adoption_questionnaire_dispatches dispatch
  set provider_call_started_at = statement_timestamp(),
      recipient_email_snapshot = p_recipient_email,
      recipient_name_snapshot = p_recipient_name,
      template_id_snapshot = p_template_id,
      brevo_template_id_snapshot = p_brevo_template_id,
      variables_snapshot = coalesce(p_variables_snapshot, '{}'::jsonb)
  from public.post_adoption_questionnaire_instances instance
  where dispatch.id = p_dispatch_id and dispatch.lease_token = p_lease_token
    and dispatch.status = 'claimed' and dispatch.provider_call_started_at is null
    and p_recipient_email is not null and p_template_id is not null and p_brevo_template_id is not null
    and coalesce(p_variables_snapshot->>'lien_questionnaire', '') !~ '^https?://'
    and instance.organization_id = dispatch.organization_id and instance.id = dispatch.instance_id
    and (
      (dispatch.message_kind = 'initial' and (
        instance.status = 'due' or (instance.status = 'planned' and instance.due_at <= statement_timestamp())
      ))
      or (dispatch.message_kind in ('reminder_7','reminder_14') and instance.status in ('invited','in_progress'))
    )
  returning true;
$fn$;

create or replace function public.prepare_post_adoption_questionnaire_dispatch_access(
  p_dispatch_id uuid,
  p_lease_token uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_auth_tag text,
  p_token_key_version text
)
returns table(outcome text, access_id uuid, public_read_until timestamptz)
language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_dispatch public.post_adoption_questionnaire_dispatches%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_replaced_access_id uuid;
  v_now timestamptz := statement_timestamp();
begin
  select * into v_dispatch from public.post_adoption_questionnaire_dispatches
    where id = p_dispatch_id and lease_token = p_lease_token and status = 'claimed' for update;
  if not found or v_dispatch.message_kind <> 'initial' then return query select 'invalid_claim'::text, null::uuid, null::timestamptz; return; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or char_length(p_token_hint) not between 4 and 12
    or p_token_ciphertext is null or p_token_iv is null or p_token_auth_tag is null
    or p_token_key_version !~ '^[A-Za-z0-9._-]{1,32}$' then
    return query select 'invalid_input'::text, null::uuid, null::timestamptz; return;
  end if;
  select * into v_access from public.post_adoption_questionnaire_public_accesses
    where organization_id = v_dispatch.organization_id and instance_id = v_dispatch.instance_id and revoked_at is null for update;
  if found and v_access.token_ciphertext is not null then
    return query select 'existing'::text, v_access.id, v_access.public_read_until; return;
  elsif found then
    v_replaced_access_id := v_access.id;
    update public.post_adoption_questionnaire_public_accesses
    set revoked_at = v_now,
        revoked_by = (
          select settings.post_adoption_automation_activated_by
          from public.organization_settings settings
          where settings.organization_id = v_dispatch.organization_id
        ),
        token_ciphertext = null, token_iv = null, token_auth_tag = null,
        token_key_version = null, encrypted_token_purged_at = v_now
    where id = v_access.id;
    update public.post_adoption_questionnaire_public_sessions session
    set invalidated_at = v_now
    where session.organization_id = v_dispatch.organization_id
      and session.access_id = v_access.id and session.invalidated_at is null;
  end if;
  insert into public.post_adoption_questionnaire_public_accesses(
    organization_id, instance_id, token_hash, token_hint, activated_at, public_read_until,
    created_by, created_by_kind, token_ciphertext, token_iv, token_auth_tag, token_key_version
  ) values (
    v_dispatch.organization_id, v_dispatch.instance_id, p_token_hash, p_token_hint, v_now,
    v_now + interval '60 days', null, 'system', p_token_ciphertext, p_token_iv, p_token_auth_tag, p_token_key_version
  ) returning * into v_access;
  if v_replaced_access_id is not null then
    update public.post_adoption_questionnaire_public_accesses
    set replaced_by_access_id = v_access.id
    where id = v_replaced_access_id;
  end if;
  return query select 'success'::text, v_access.id, v_access.public_read_until;
end;
$fn$;

create or replace function public.seal_post_adoption_questionnaire_public_access(
  p_access_id uuid,
  p_token_hash text,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_auth_tag text,
  p_token_key_version text
)
returns boolean language sql security definer set search_path = '' set row_security = off as $fn$
  update public.post_adoption_questionnaire_public_accesses
  set token_ciphertext = p_token_ciphertext,
      token_iv = p_token_iv,
      token_auth_tag = p_token_auth_tag,
      token_key_version = p_token_key_version,
      encrypted_token_purged_at = null
  where id = p_access_id and token_hash = p_token_hash and revoked_at is null
    and created_by is not null and token_ciphertext is null
    and p_token_ciphertext is not null and p_token_iv is not null
    and p_token_auth_tag is not null
    and p_token_key_version ~ '^[A-Za-z0-9._-]{1,32}$'
  returning true;
$fn$;

create or replace function public.reencrypt_post_adoption_questionnaire_public_access(
  p_access_id uuid,
  p_expected_key_version text,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_auth_tag text,
  p_token_key_version text
)
returns boolean language sql security definer set search_path = '' set row_security = off as $fn$
  update public.post_adoption_questionnaire_public_accesses
  set token_ciphertext = p_token_ciphertext,
      token_iv = p_token_iv,
      token_auth_tag = p_token_auth_tag,
      token_key_version = p_token_key_version,
      encrypted_token_purged_at = null
  where id = p_access_id and revoked_at is null
    and token_key_version = p_expected_key_version
    and p_expected_key_version is distinct from p_token_key_version
    and p_token_ciphertext is not null and p_token_iv is not null
    and p_token_auth_tag is not null
    and p_token_key_version ~ '^[A-Za-z0-9._-]{1,32}$'
  returning true;
$fn$;

create or replace function public.complete_post_adoption_questionnaire_dispatch(
  p_dispatch_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_recipient_email text default null,
  p_recipient_name text default null,
  p_template_id uuid default null,
  p_brevo_template_id bigint default null,
  p_variables jsonb default '{}'::jsonb,
  p_brevo_message_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_at timestamptz default null
)
returns text language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_dispatch public.post_adoption_questionnaire_dispatches%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_now timestamptz := statement_timestamp();
  v_attempt_status text;
  v_timezone text;
begin
  select * into v_dispatch from public.post_adoption_questionnaire_dispatches
    where id = p_dispatch_id and lease_token = p_lease_token and status = 'claimed' for update;
  if not found then return 'invalid_claim'; end if;
  select * into v_instance from public.post_adoption_questionnaire_instances
    where organization_id = v_dispatch.organization_id and id = v_dispatch.instance_id for update;
  if not found then return 'invalid_instance_state'; end if;
  select timezone into v_timezone from public.post_adoption_questionnaire_automation
    where organization_id = v_dispatch.organization_id and instance_id = v_dispatch.instance_id;
  if coalesce(p_variables->>'lien_questionnaire', '') ~ '^https?://' then
    return 'sensitive_snapshot_rejected';
  end if;
  if p_outcome = 'accepted' then
    if p_brevo_message_id is null or p_recipient_email is null or p_template_id is null or p_brevo_template_id is null then return 'invalid_input'; end if;
    if v_dispatch.message_kind = 'initial'
      and not (v_instance.status = 'due' or (v_instance.status = 'planned' and v_instance.due_at <= v_now)) then
      return 'invalid_instance_state';
    elsif v_dispatch.message_kind in ('reminder_7','reminder_14')
      and v_instance.status not in ('invited','in_progress') then
      return 'invalid_instance_state';
    end if;
    if v_dispatch.message_kind = 'initial' and v_instance.status = 'planned' then
      insert into public.post_adoption_questionnaire_events(organization_id, instance_id, event_type, from_status, to_status, actor_kind, details, occurred_at)
      values(v_instance.organization_id, v_instance.id, 'became_due', 'planned', 'due', 'system', jsonb_build_object('source','automated_delivery'), v_now);
      v_instance.status := 'due';
    end if;
    update public.post_adoption_questionnaire_dispatches set
      status = 'accepted', lease_token = null, claimed_at = null, accepted_at = v_now,
      recipient_email_snapshot = p_recipient_email, recipient_name_snapshot = p_recipient_name,
      template_id_snapshot = p_template_id, brevo_template_id_snapshot = p_brevo_template_id,
      variables_snapshot = coalesce(p_variables, '{}'::jsonb), brevo_message_id = p_brevo_message_id,
      failed_at = null, last_error_code = null, last_error_message = null
    where id = v_dispatch.id;
    if v_dispatch.message_kind = 'initial' then
      insert into public.post_adoption_questionnaire_events(organization_id, instance_id, event_type, from_status, to_status, actor_kind, details, occurred_at)
      values(v_instance.organization_id, v_instance.id, 'invitation_sent', 'due', 'invited', 'system', jsonb_build_object('source','automated_delivery','dispatch_id',v_dispatch.id), v_now);
      insert into public.post_adoption_questionnaire_dispatches(organization_id, instance_id, message_kind, scheduled_at, next_attempt_at)
      values
        (v_dispatch.organization_id, v_dispatch.instance_id, 'reminder_7',
          public.post_adoption_delivery_scheduled_at((v_now at time zone v_timezone)::date + 7, v_timezone),
          public.post_adoption_delivery_scheduled_at((v_now at time zone v_timezone)::date + 7, v_timezone)),
        (v_dispatch.organization_id, v_dispatch.instance_id, 'reminder_14',
          public.post_adoption_delivery_scheduled_at((v_now at time zone v_timezone)::date + 14, v_timezone),
          public.post_adoption_delivery_scheduled_at((v_now at time zone v_timezone)::date + 14, v_timezone))
      on conflict (organization_id, instance_id, message_kind) do nothing;
      update public.post_adoption_questionnaire_automation set state = 'active'
        where organization_id = v_dispatch.organization_id and instance_id = v_dispatch.instance_id;
    else
      insert into public.post_adoption_questionnaire_events(organization_id, instance_id, event_type, actor_kind, details, occurred_at)
      values(v_instance.organization_id, v_instance.id, 'reminder_sent', 'system', jsonb_build_object('source','automated_delivery','dispatch_id',v_dispatch.id,'message_kind',v_dispatch.message_kind), v_now);
    end if;
    v_attempt_status := 'sent';
  elsif p_outcome = 'retryable' then
    update public.post_adoption_questionnaire_dispatches set status = 'retryable', lease_token = null, claimed_at = null,
      provider_call_started_at = null,
      next_attempt_at = coalesce(p_retry_at, v_now + interval '1 day'), failed_at = v_now,
      last_error_code = p_error_code, last_error_message = left(p_error_message, 2000)
    where id = v_dispatch.id;
    v_attempt_status := 'failed';
  elsif p_outcome = 'uncertain' then
    update public.post_adoption_questionnaire_dispatches set status = 'uncertain', lease_token = null, claimed_at = null,
      brevo_message_id = coalesce(p_brevo_message_id, brevo_message_id),
      failed_at = v_now, last_error_code = p_error_code, last_error_message = left(p_error_message, 2000)
    where id = v_dispatch.id;
    v_attempt_status := case when p_brevo_message_id is not null then 'sent' else 'failed' end;
  elsif p_outcome = 'cancelled' then
    update public.post_adoption_questionnaire_dispatches set status = 'cancelled', lease_token = null, claimed_at = null,
      failed_at = v_now, last_error_code = p_error_code, last_error_message = left(p_error_message, 2000)
    where id = v_dispatch.id;
    v_attempt_status := 'failed';
  else return 'invalid_outcome'; end if;
  if p_recipient_email is not null then
    insert into public.email_delivery_attempts(
      organization_id, contact_id, reservation_id, email_template_id, message_type,
      recipient_email, recipient_name, variables_snapshot, idempotency_key, status,
      attempt_count, brevo_message_id, last_attempt_at, sent_at, failed_at,
      last_error_code, brevo_template_id, post_adoption_questionnaire_instance_id,
      post_adoption_questionnaire_dispatch_id
    ) values (
      v_dispatch.organization_id, v_instance.contact_id, v_instance.reservation_id, p_template_id,
      'post_adoption_' || v_dispatch.message_kind, p_recipient_email, p_recipient_name,
      coalesce(p_variables, '{}'::jsonb), 'post-adoption:' || v_dispatch.id::text,
      v_attempt_status, v_dispatch.attempt_count, p_brevo_message_id, v_now,
      case when v_attempt_status = 'sent' then v_now end,
      case when v_attempt_status = 'failed' then v_now end, p_error_code, p_brevo_template_id,
      v_instance.id, v_dispatch.id
    ) on conflict (organization_id, idempotency_key) do update set
      status = excluded.status, attempt_count = excluded.attempt_count,
      brevo_message_id = coalesce(excluded.brevo_message_id, public.email_delivery_attempts.brevo_message_id),
      last_attempt_at = excluded.last_attempt_at, sent_at = excluded.sent_at,
      failed_at = excluded.failed_at, last_error_code = excluded.last_error_code,
      variables_snapshot = excluded.variables_snapshot;
  end if;
  insert into public.post_adoption_questionnaire_automation_events(
    organization_id, instance_id, dispatch_id, event_type, actor_kind, details
  ) values (
    v_dispatch.organization_id, v_dispatch.instance_id, v_dispatch.id,
    'dispatch_' || p_outcome, 'system', jsonb_build_object('error_code', p_error_code, 'brevo_message_id', p_brevo_message_id)
  );
  return 'success';
end;
$fn$;

create or replace function public.decide_post_adoption_questionnaire_automation_exception(
  p_instance_id uuid,
  p_decision text,
  p_reason text
)
returns text language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_user_id uuid := auth.uid();
  v_automation public.post_adoption_questionnaire_automation%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then return 'not_authenticated'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then return 'reason_required'; end if;
  select * into v_automation from public.post_adoption_questionnaire_automation
    where instance_id = p_instance_id for update;
  if not found then return 'not_found'; end if;
  if not public.has_organization_role(v_automation.organization_id, array['owner','admin']) then return 'forbidden'; end if;
  select * into v_instance from public.post_adoption_questionnaire_instances
    where organization_id = v_automation.organization_id and id = v_automation.instance_id for update;
  if p_decision = 'suspend' then
    if v_instance.status not in ('planned','due','invited','in_progress') then return 'invalid_state'; end if;
    insert into public.post_adoption_questionnaire_events(
      organization_id, instance_id, event_type, from_status, to_status,
      actor_kind, actor_profile_id, details, occurred_at
    ) values(
      v_automation.organization_id, v_automation.instance_id, 'suspended',
      v_instance.status, 'suspended', 'member', v_user_id,
      jsonb_build_object('reason',btrim(p_reason),'source','automated_delivery_dashboard'), v_now
    );
    update public.post_adoption_questionnaire_automation
    set state = 'suspended', reason_code = 'member_suspended'
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id;
    update public.post_adoption_questionnaire_dispatches
    set status = 'cancelled', lease_token = null, claimed_at = null,
        failed_at = v_now, last_error_code = 'member_suspended', last_error_message = btrim(p_reason)
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id
      and (status in ('pending','retryable') or (status = 'claimed' and provider_call_started_at is null));
    update public.post_adoption_questionnaire_dispatches
    set status = 'uncertain', lease_token = null, claimed_at = null,
        failed_at = v_now, last_error_code = 'suspended_during_provider_call',
        last_error_message = 'La suspension est intervenue pendant l’appel à Brevo.'
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id
      and status = 'claimed' and provider_call_started_at is not null;
  elsif p_decision = 'resume' then
    if v_instance.status <> 'suspended' or v_automation.reason_code <> 'member_suspended' then return 'invalid_state'; end if;
    insert into public.post_adoption_questionnaire_events(
      organization_id, instance_id, event_type, from_status, to_status,
      actor_kind, actor_profile_id, details, occurred_at
    ) values(
      v_automation.organization_id, v_automation.instance_id, 'resumed',
      'suspended', v_instance.suspended_from_status, 'member', v_user_id,
      jsonb_build_object('reason',btrim(p_reason),'source','automated_delivery_dashboard'), v_now
    );
    update public.post_adoption_questionnaire_automation
    set state = case when v_instance.suspended_from_status in ('planned','due') then 'scheduled' else 'active' end,
        reason_code = null
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id;
    update public.post_adoption_questionnaire_dispatches
    set status = 'pending', next_attempt_at = greatest(scheduled_at, v_now),
        failed_at = null, last_error_code = null, last_error_message = null,
        provider_call_started_at = null
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id
      and status = 'cancelled' and last_error_code = 'member_suspended';
  elsif p_decision = 'authorize_late_send' then
    update public.post_adoption_questionnaire_automation set state = 'scheduled', reason_code = null,
      override_authorized_at = v_now, override_authorized_by = v_user_id, override_reason = btrim(p_reason),
      initial_scheduled_at = v_now, automatic_until = null
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id;
    insert into public.post_adoption_questionnaire_dispatches(organization_id, instance_id, message_kind, scheduled_at, next_attempt_at)
    values(v_automation.organization_id, v_automation.instance_id, 'initial', v_now, v_now)
    on conflict (organization_id, instance_id, message_kind) do update set
      status = case when public.post_adoption_questionnaire_dispatches.status in ('pending','retryable','cancelled') then 'pending' else public.post_adoption_questionnaire_dispatches.status end,
      scheduled_at = least(public.post_adoption_questionnaire_dispatches.scheduled_at, excluded.scheduled_at),
      next_attempt_at = excluded.next_attempt_at;
  elsif p_decision = 'authorize_retry' then
    update public.post_adoption_questionnaire_automation set
      override_authorized_at = v_now, override_authorized_by = v_user_id,
      override_reason = btrim(p_reason)
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id;
    update public.post_adoption_questionnaire_dispatches set
      status = 'pending', lease_token = null, claimed_at = null,
      provider_call_started_at = null, next_attempt_at = v_now,
      failed_at = null, last_error_code = null, last_error_message = null
    where id = (
      select dispatch.id
      from public.post_adoption_questionnaire_dispatches dispatch
      where dispatch.organization_id = v_automation.organization_id
        and dispatch.instance_id = v_automation.instance_id
        and dispatch.status = 'uncertain'
      order by dispatch.scheduled_at desc, dispatch.id desc
      limit 1
      for update
    );
    if not found then return 'invalid_state'; end if;
  elsif p_decision = 'non_applicable' then
    update public.post_adoption_questionnaire_automation set state = 'non_applicable', reason_code = 'member_decision',
      override_authorized_at = v_now, override_authorized_by = v_user_id, override_reason = btrim(p_reason)
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id;
    update public.post_adoption_questionnaire_dispatches set status = 'cancelled', lease_token = null, claimed_at = null,
      failed_at = v_now, last_error_code = 'non_applicable', last_error_message = btrim(p_reason)
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id
      and (status in ('pending','retryable') or (status = 'claimed' and provider_call_started_at is null));
    update public.post_adoption_questionnaire_dispatches
    set status = 'uncertain', lease_token = null, claimed_at = null,
        failed_at = v_now, last_error_code = 'closed_during_provider_call',
        last_error_message = 'Le classement est intervenu pendant l’appel à Brevo.'
    where organization_id = v_automation.organization_id and instance_id = v_automation.instance_id
      and status = 'claimed' and provider_call_started_at is not null;
    update public.post_adoption_questionnaire_public_accesses
    set revoked_at = v_now, revoked_by = v_user_id,
        token_ciphertext = null, token_iv = null, token_auth_tag = null,
        token_key_version = null, encrypted_token_purged_at = v_now
    where organization_id = v_automation.organization_id
      and instance_id = v_automation.instance_id and revoked_at is null;
    update public.post_adoption_questionnaire_public_sessions session
    set invalidated_at = v_now
    where session.organization_id = v_automation.organization_id
      and session.invalidated_at is null
      and exists (
        select 1 from public.post_adoption_questionnaire_public_accesses access
        where access.organization_id = session.organization_id
          and access.id = session.access_id
          and access.instance_id = v_automation.instance_id
      );
  else return 'invalid_decision'; end if;
  insert into public.post_adoption_questionnaire_automation_events(
    organization_id, instance_id, event_type, actor_kind, actor_profile_id, details
  ) values(v_automation.organization_id, v_automation.instance_id, p_decision, 'member', v_user_id, jsonb_build_object('reason',btrim(p_reason)));
  return 'success';
end;
$fn$;

create or replace function public.list_post_adoption_questionnaire_automation_overview(
  p_organization_id uuid
)
returns table(
  organization_id uuid, instance_id uuid, reservation_id uuid, animal_id uuid,
  animal_name text, contact_name text, milestone text, instance_status text,
  automation_state text, reason_code text, scheduled_at timestamptz,
  last_dispatch_status text, last_error_code text
)
language sql security definer stable set search_path = '' set row_security = off as $fn$
  select automation.organization_id, instance.id, instance.reservation_id, instance.animal_id,
    coalesce(animal.call_name, animal.official_name, 'Animal'), contact.display_name,
    case when instance.questionnaire_code = 'post-adoption-t1' then 't1' else 't2' end,
    instance.status,
    case when instance.status = 'suspended' then 'suspended' else automation.state end,
    case when instance.status = 'suspended' and automation.state <> 'suspended'
      then 'questionnaire_incident' else automation.reason_code end,
    automation.initial_scheduled_at,
    latest.status, latest.last_error_code
  from public.post_adoption_questionnaire_automation automation
  join public.post_adoption_questionnaire_instances instance
    on instance.organization_id = automation.organization_id and instance.id = automation.instance_id
  join public.animals animal on animal.organization_id = instance.organization_id and animal.id = instance.animal_id
  join public.contacts contact on contact.organization_id = instance.organization_id and contact.id = instance.contact_id
  left join lateral (
    select dispatch.status, dispatch.last_error_code
    from public.post_adoption_questionnaire_dispatches dispatch
    where dispatch.organization_id = instance.organization_id and dispatch.instance_id = instance.id
    order by dispatch.scheduled_at desc, dispatch.id desc limit 1
  ) latest on true
  where automation.organization_id = p_organization_id
    and public.is_member_of(automation.organization_id)
  order by automation.initial_scheduled_at nulls last, instance.id;
$fn$;

create or replace function public.list_post_adoption_results_for_organization(
  p_organization_id uuid,
  p_litter_id uuid default null
)
returns table (
  litter_id uuid, litter_name text, litter_date timestamptz,
  reservation_id uuid, reservation_litter_id uuid,
  animal_id uuid, animal_litter_id uuid, animal_name text,
  animal_birth_date date, animal_sex text,
  instance_id uuid, milestone text, questionnaire_code text,
  questionnaire_version integer, instance_status text,
  due_at timestamptz, response_deadline_at timestamptz,
  latest_revision_no integer, latest_submitted_at timestamptz,
  definition_valid boolean
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
  select overview.*
  from public.list_post_adoption_questionnaire_results_overview(p_litter_id) overview
  where p_organization_id is not null
    and exists (
      select 1
      from public.litters selected_litter
      join public.memberships membership
        on membership.organization_id = selected_litter.organization_id
       and membership.profile_id = auth.uid()
       and membership.status = 'active'
       and membership.deleted_at is null
      where selected_litter.id = overview.litter_id
        and selected_litter.organization_id = p_organization_id
        and selected_litter.deleted_at is null
    );
$fn$;

alter table public.post_adoption_questionnaire_automation enable row level security;
alter table public.post_adoption_questionnaire_dispatches enable row level security;
alter table public.post_adoption_questionnaire_automation_events enable row level security;
create policy post_adoption_automation_select_member on public.post_adoption_questionnaire_automation
  for select to authenticated using (public.is_member_of(organization_id));
create policy post_adoption_dispatches_select_member on public.post_adoption_questionnaire_dispatches
  for select to authenticated using (public.is_member_of(organization_id));
create policy post_adoption_automation_events_select_member on public.post_adoption_questionnaire_automation_events
  for select to authenticated using (public.is_member_of(organization_id));

revoke all on table public.post_adoption_questionnaire_automation,
  public.post_adoption_questionnaire_dispatches,
  public.post_adoption_questionnaire_automation_events from public, anon, authenticated;
grant select on table public.post_adoption_questionnaire_automation,
  public.post_adoption_questionnaire_dispatches,
  public.post_adoption_questionnaire_automation_events to authenticated;
revoke insert, update on table public.organization_settings from authenticated;
grant insert (
  id, organization_id, default_species, default_dog_breed, default_currency,
  default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents,
  default_puppy_price_cents, pre_reservation_response_delay_days,
  dog_gestation_average_days, dog_ultrasound_min_day, dog_ultrasound_max_day,
  dog_xray_day, puppy_choice_age_weeks, puppy_adoption_age_weeks,
  post_adoption_follow_up_1_days, post_adoption_follow_up_2_months,
  settings_json, created_at, updated_at, created_by, updated_by, deleted_at,
  default_male_puppy_price_cents, default_female_puppy_price_cents,
  litter_weighing_schedule_policy, maternal_temperature_drop_policy,
  default_gestation_planning_model_id
) on public.organization_settings to authenticated;
grant update (
  id, organization_id, default_species, default_dog_breed, default_currency,
  default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents,
  default_puppy_price_cents, pre_reservation_response_delay_days,
  dog_gestation_average_days, dog_ultrasound_min_day, dog_ultrasound_max_day,
  dog_xray_day, puppy_choice_age_weeks, puppy_adoption_age_weeks,
  post_adoption_follow_up_1_days, post_adoption_follow_up_2_months,
  settings_json, created_at, updated_at, created_by, updated_by, deleted_at,
  default_male_puppy_price_cents, default_female_puppy_price_cents,
  litter_weighing_schedule_policy, maternal_temperature_drop_policy,
  default_gestation_planning_model_id
) on public.organization_settings to authenticated;
revoke insert, update, delete, truncate on table public.post_adoption_questionnaire_automation,
  public.post_adoption_questionnaire_dispatches,
  public.post_adoption_questionnaire_automation_events from authenticated, service_role;

revoke all on function public.activate_post_adoption_questionnaire_automation(uuid,text) from public, anon, authenticated;
grant execute on function public.activate_post_adoption_questionnaire_automation(uuid,text) to authenticated;
revoke all on function public.decide_post_adoption_questionnaire_automation_exception(uuid,text,text) from public, anon, authenticated;
grant execute on function public.decide_post_adoption_questionnaire_automation_exception(uuid,text,text) to authenticated;
revoke all on function public.list_post_adoption_questionnaire_automation_overview(uuid) from public, anon, authenticated;
grant execute on function public.list_post_adoption_questionnaire_automation_overview(uuid) to authenticated;
revoke all on function public.list_post_adoption_results_for_organization(uuid,uuid) from public, anon, authenticated;
grant execute on function public.list_post_adoption_results_for_organization(uuid,uuid) to authenticated;

revoke all on function public.claim_post_adoption_questionnaire_dispatches(uuid,integer,timestamptz,uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_post_adoption_questionnaire_dispatches(uuid,integer,timestamptz,uuid) to service_role;
revoke all on function public.prepare_post_adoption_questionnaire_dispatch_access(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.prepare_post_adoption_questionnaire_dispatch_access(uuid,uuid,text,text,text,text,text,text) to service_role;
revoke all on function public.mark_post_adoption_questionnaire_dispatch_provider_started(uuid,uuid,text,text,uuid,bigint,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.mark_post_adoption_questionnaire_dispatch_provider_started(uuid,uuid,text,text,uuid,bigint,jsonb) to service_role;
revoke all on function public.seal_post_adoption_questionnaire_public_access(uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.seal_post_adoption_questionnaire_public_access(uuid,text,text,text,text,text) to service_role;
revoke all on function public.reencrypt_post_adoption_questionnaire_public_access(uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.reencrypt_post_adoption_questionnaire_public_access(uuid,text,text,text,text,text) to service_role;
revoke all on function public.complete_post_adoption_questionnaire_dispatch(uuid,uuid,text,text,text,uuid,bigint,jsonb,text,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.complete_post_adoption_questionnaire_dispatch(uuid,uuid,text,text,text,uuid,bigint,jsonb,text,text,text,timestamptz) to service_role;

revoke execute on function public.schedule_post_adoption_questionnaire_automation() from public, anon, authenticated, service_role;
revoke execute on function public.post_adoption_questionnaire_automation_events_immutable() from public, anon, authenticated, service_role;
revoke execute on function public.post_adoption_delivery_scheduled_at(date,text) from public, anon, authenticated;
grant execute on function public.post_adoption_delivery_scheduled_at(date,text) to service_role;

commit;

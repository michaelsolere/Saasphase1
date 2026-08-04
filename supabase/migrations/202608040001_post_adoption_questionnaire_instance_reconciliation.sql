-- POST-ADOPTION-QUESTIONNAIRE-INSTANCE-RECONCILIATION-01
-- Idempotent provisioning for future adoptions and bounded historical reconciliation.

begin;

-- ---------------------------------------------------------------------------
-- 1. Immutable applicability calendar
-- ---------------------------------------------------------------------------

create table public.post_adoption_questionnaire_releases (
  questionnaire_code text not null,
  questionnaire_version integer not null,
  effective_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (questionnaire_code, questionnaire_version),
  constraint post_adoption_questionnaire_releases_definition_fk
    foreign key (questionnaire_code, questionnaire_version)
    references public.post_adoption_questionnaire_definitions (code, version)
    on delete restrict,
  constraint post_adoption_questionnaire_releases_code_effective_key
    unique (questionnaire_code, effective_at)
);

create or replace function public.assert_post_adoption_questionnaire_release()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
begin
  select definition.*
  into v_definition
  from public.post_adoption_questionnaire_definitions definition
  where definition.code = new.questionnaire_code
    and definition.version = new.questionnaire_version;

  if not found then
    raise exception 'post-adoption questionnaire release definition does not exist'
      using errcode = '23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'post_adoption_questionnaire_release_scope:'
        || v_definition.milestone || ':'
        || v_definition.species || ':'
        || coalesce(v_definition.breed, '<all-breeds>'),
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'post_adoption_questionnaire_release_code:' || new.questionnaire_code,
      0
    )
  );

  if new.questionnaire_version = 1 then
    if new.effective_at <> '-infinity'::timestamptz then
      raise exception 'post-adoption questionnaire version 1 must cover historical adoptions'
        using errcode = '23514';
    end if;
  elsif not pg_catalog.isfinite(new.effective_at)
    or new.effective_at < v_definition.published_at
  then
    raise exception 'post-adoption questionnaire future release must not predate publication'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.post_adoption_questionnaire_releases release
    join public.post_adoption_questionnaire_definitions definition
      on definition.code = release.questionnaire_code
     and definition.version = release.questionnaire_version
    where release.questionnaire_code = new.questionnaire_code
      and (
        definition.milestone <> v_definition.milestone
        or definition.species <> v_definition.species
        or definition.breed is distinct from v_definition.breed
      )
  ) then
    raise exception 'post-adoption questionnaire release lineage scope is immutable'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.post_adoption_questionnaire_releases release
    join public.post_adoption_questionnaire_definitions definition
      on definition.code = release.questionnaire_code
     and definition.version = release.questionnaire_version
    where definition.milestone = v_definition.milestone
      and definition.species = v_definition.species
      and definition.breed is not distinct from v_definition.breed
      and release.questionnaire_code <> new.questionnaire_code
  ) then
    raise exception 'post-adoption questionnaire release scope has competing code lineages'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.post_adoption_questionnaire_releases release
    where release.questionnaire_code = new.questionnaire_code
      and (
        (release.questionnaire_version < new.questionnaire_version
          and release.effective_at >= new.effective_at)
        or (release.questionnaire_version > new.questionnaire_version
          and release.effective_at <= new.effective_at)
      )
  ) then
    raise exception 'post-adoption questionnaire release calendar is not chronological'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger post_adoption_questionnaire_releases_validate
before insert on public.post_adoption_questionnaire_releases
for each row execute function public.assert_post_adoption_questionnaire_release();

create or replace function public.post_adoption_questionnaire_release_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'post-adoption questionnaire release calendar is immutable'
    using errcode = '55000';
end;
$function$;

create trigger post_adoption_questionnaire_releases_immutable
before update or delete on public.post_adoption_questionnaire_releases
for each row execute function public.post_adoption_questionnaire_release_immutable();

insert into public.post_adoption_questionnaire_releases (
  questionnaire_code,
  questionnaire_version,
  effective_at
)
values
  ('post-adoption-t1', 1, '-infinity'::timestamptz),
  ('post-adoption-t2', 1, '-infinity'::timestamptz);

alter table public.post_adoption_questionnaire_instances
  add column milestone text;

update public.post_adoption_questionnaire_instances instance
set milestone = definition.milestone
from public.post_adoption_questionnaire_definitions definition
where definition.code = instance.questionnaire_code
  and definition.version = instance.questionnaire_version;

alter table public.post_adoption_questionnaire_instances
  alter column milestone set not null,
  add constraint post_adoption_questionnaire_instances_milestone_check
    check (milestone in ('t1', 't2'));

create or replace function public.assign_post_adoption_questionnaire_instance_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_milestone text;
begin
  select definition.milestone
  into v_milestone
  from public.post_adoption_questionnaire_definitions definition
  where definition.code = new.questionnaire_code
    and definition.version = new.questionnaire_version;

  if v_milestone is null then
    raise exception 'post-adoption questionnaire instance definition does not exist'
      using errcode = '23503';
  end if;

  if new.milestone is not null and new.milestone <> v_milestone then
    raise exception 'post-adoption questionnaire instance milestone does not match definition'
      using errcode = '23514';
  end if;

  new.milestone := v_milestone;
  return new;
end;
$function$;

create trigger post_adoption_questionnaire_instances_assign_milestone
before insert or update of questionnaire_code, questionnaire_version, milestone
on public.post_adoption_questionnaire_instances
for each row execute function public.assign_post_adoption_questionnaire_instance_milestone();

create unique index paq_instances_reservation_milestone_uidx
  on public.post_adoption_questionnaire_instances (
    organization_id,
    reservation_id,
    milestone
  );

-- ---------------------------------------------------------------------------
-- 2. Private append-only operational audit
-- ---------------------------------------------------------------------------

create table public.post_adoption_questionnaire_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  source text not null default 'historical_reconciliation',
  payload jsonb not null,
  after_adoption_completed_at timestamptz,
  after_reservation_id uuid,
  until_adoption_completed_at timestamptz,
  until_reservation_id uuid,
  batch_size integer not null,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint paqr_runs_org_id_key
    unique (organization_id, id),
  constraint paqr_runs_command_key
    unique (organization_id, client_command_id),
  constraint paqr_runs_source_check
    check (source in ('historical_reconciliation', 'manual_retry')),
  constraint paqr_runs_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint paqr_runs_cursor_check
    check (
      (after_adoption_completed_at is null and after_reservation_id is null)
      or (after_adoption_completed_at is not null and after_reservation_id is not null)
    ),
  constraint paqr_runs_boundary_check
    check (
      (until_adoption_completed_at is null and until_reservation_id is null)
      or (until_adoption_completed_at is not null and until_reservation_id is not null)
    ),
  constraint paqr_runs_batch_check
    check (batch_size between 1 and 100)
);

create table public.post_adoption_questionnaire_reconciliation_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id uuid,
  reservation_id uuid not null,
  milestone text not null,
  questionnaire_code text,
  questionnaire_version integer,
  instance_id uuid,
  source text not null,
  outcome text not null,
  reason text,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  error_sqlstate text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint paqr_attempts_org_id_key
    unique (organization_id, id),
  constraint paqr_attempts_run_fk
    foreign key (organization_id, run_id)
    references public.post_adoption_questionnaire_reconciliation_runs (organization_id, id)
    on delete restrict,
  constraint paqr_attempts_reservation_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id)
    on delete restrict,
  constraint paqr_attempts_definition_fk
    foreign key (questionnaire_code, questionnaire_version)
    references public.post_adoption_questionnaire_definitions (code, version)
    on delete restrict,
  constraint paqr_attempts_instance_fk
    foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances (organization_id, id)
    on delete restrict,
  constraint paqr_attempts_milestone_check
    check (milestone in ('t1', 't2')),
  constraint paqr_attempts_source_check
    check (source in ('adoption_trigger', 'historical_reconciliation', 'manual_retry')),
  constraint paqr_attempts_outcome_check
    check (outcome in (
      'created', 'already_present', 'not_eligible',
      'missing_data', 'inconsistent_data', 'error'
    )),
  constraint paqr_attempts_definition_shape_check
    check (
      (questionnaire_code is null and questionnaire_version is null)
      or (questionnaire_code is not null and questionnaire_version is not null)
    ),
  constraint paqr_attempts_error_shape_check
    check (
      (outcome = 'error' and error_sqlstate is not null and error_message is not null)
      or (outcome <> 'error' and error_sqlstate is null and error_message is null)
    ),
  constraint paqr_attempts_details_check
    check (jsonb_typeof(details) = 'object'),
  constraint paqr_attempts_error_length_check
    check (error_message is null or char_length(error_message) <= 1000)
);

create table public.post_adoption_questionnaire_reconciliation_run_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id uuid not null,
  processed_reservation_count integer not null,
  created_count integer not null,
  already_present_count integer not null,
  not_eligible_count integer not null,
  missing_data_count integer not null,
  inconsistent_data_count integer not null,
  error_count integer not null,
  next_adoption_completed_at timestamptz,
  next_reservation_id uuid,
  until_adoption_completed_at timestamptz,
  until_reservation_id uuid,
  has_more boolean not null,
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint paqr_results_org_id_key
    unique (organization_id, id),
  constraint paqr_results_run_key
    unique (organization_id, run_id),
  constraint paqr_results_run_fk
    foreign key (organization_id, run_id)
    references public.post_adoption_questionnaire_reconciliation_runs (organization_id, id)
    on delete restrict,
  constraint paqr_results_counts_check
    check (
      processed_reservation_count >= 0
      and created_count >= 0
      and already_present_count >= 0
      and not_eligible_count >= 0
      and missing_data_count >= 0
      and inconsistent_data_count >= 0
      and error_count >= 0
      and created_count + already_present_count + not_eligible_count
        + missing_data_count + inconsistent_data_count + error_count
        = processed_reservation_count * 2
    ),
  constraint paqr_results_cursor_check
    check (
      (processed_reservation_count = 0
        and next_adoption_completed_at is null
        and next_reservation_id is null)
      or (processed_reservation_count > 0
        and next_adoption_completed_at is not null
        and next_reservation_id is not null)
    ),
  constraint paqr_results_boundary_check
    check (
      (until_adoption_completed_at is null and until_reservation_id is null)
      or (until_adoption_completed_at is not null and until_reservation_id is not null)
    ),
  constraint paqr_results_result_check
    check (jsonb_typeof(result) = 'object')
);

create index paqr_attempts_reservation_idx
  on public.post_adoption_questionnaire_reconciliation_attempts (
    organization_id,
    reservation_id,
    occurred_at,
    id
  );

create index paqr_attempts_errors_idx
  on public.post_adoption_questionnaire_reconciliation_attempts (
    organization_id,
    occurred_at,
    id
  )
  where outcome = 'error';

create or replace function public.post_adoption_questionnaire_reconciliation_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE'
    and session_user = 'postgres'
    and current_setting('app.qa_hard_delete', true) = 'on'
  then
    return old;
  end if;

  raise exception 'post-adoption questionnaire reconciliation audit is append-only'
    using errcode = '55000';
end;
$function$;

create trigger post_adoption_questionnaire_reconciliation_runs_immutable
before update or delete on public.post_adoption_questionnaire_reconciliation_runs
for each row execute function public.post_adoption_questionnaire_reconciliation_audit_immutable();

create trigger post_adoption_questionnaire_reconciliation_attempts_immutable
before update or delete on public.post_adoption_questionnaire_reconciliation_attempts
for each row execute function public.post_adoption_questionnaire_reconciliation_audit_immutable();

create trigger post_adoption_questionnaire_reconciliation_results_immutable
before update or delete on public.post_adoption_questionnaire_reconciliation_run_results
for each row execute function public.post_adoption_questionnaire_reconciliation_audit_immutable();

create unique index post_adoption_questionnaire_events_one_instance_created_idx
  on public.post_adoption_questionnaire_events (organization_id, instance_id)
  where event_type = 'instance_created';

create unique index post_adoption_questionnaire_events_one_became_due_idx
  on public.post_adoption_questionnaire_events (organization_id, instance_id)
  where event_type = 'became_due';

-- ---------------------------------------------------------------------------
-- 3. Canonical per-reservation reconciliation engine
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_post_adoption_questionnaire_reservation_internal(
  p_reservation_id uuid,
  p_source text,
  p_run_id uuid,
  p_actor_profile_id uuid,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_contact public.contacts%rowtype;
  v_animal public.animals%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_definition_code text;
  v_definition_version integer;
  v_release_effective_at timestamptz;
  v_milestone text;
  v_outcome text;
  v_reason text;
  v_instance_id uuid;
  v_existing_instance public.post_adoption_questionnaire_instances%rowtype;
  v_due_at timestamptz;
  v_actor_profile_id uuid;
  v_actor_kind text;
  v_error_sqlstate text;
  v_error_message text;
begin
  if p_reservation_id is null
    or p_source not in ('adoption_trigger', 'historical_reconciliation', 'manual_retry')
    or p_occurred_at is null
  then
    raise exception 'invalid post-adoption questionnaire reconciliation input'
      using errcode = '22023';
  end if;

  select reservation.*
  into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then
    raise exception 'post-adoption questionnaire reconciliation reservation not found'
      using errcode = 'P0002';
  end if;

  if p_run_id is not null and not exists (
    select 1
    from public.post_adoption_questionnaire_reconciliation_runs run
    where run.organization_id = v_reservation.organization_id
      and run.id = p_run_id
  ) then
    raise exception 'post-adoption questionnaire reconciliation run does not exist'
      using errcode = '23503';
  end if;

  if p_actor_profile_id is not null and exists (
    select 1
    from public.memberships membership
    where membership.organization_id = v_reservation.organization_id
      and membership.profile_id = p_actor_profile_id
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    v_actor_profile_id := p_actor_profile_id;
    v_actor_kind := 'member';
  else
    v_actor_profile_id := null;
    v_actor_kind := 'system';
  end if;

  if v_reservation.contact_id is not null then
    select contact.*
    into v_contact
    from public.contacts contact
    where contact.organization_id = v_reservation.organization_id
      and contact.id = v_reservation.contact_id
    for key share;
  end if;

  if v_reservation.animal_id is not null then
    select animal.*
    into v_animal
    from public.animals animal
    where animal.organization_id = v_reservation.organization_id
      and animal.id = v_reservation.animal_id
    for key share;
  end if;

  foreach v_milestone in array array['t1', 't2']
  loop
    v_outcome := null;
    v_reason := null;
    v_definition.code := null;
    v_definition.version := null;
    v_definition_code := null;
    v_definition_version := null;
    v_release_effective_at := null;
    v_instance_id := null;
    v_existing_instance.id := null;
    v_due_at := null;

    if v_reservation.deleted_at is not null then
      v_outcome := 'not_eligible';
      v_reason := 'reservation_deleted';
    elsif v_reservation.status = 'adopted'
      and v_reservation.adoption_completed_at is null
    then
      v_outcome := 'missing_data';
      v_reason := 'adoption_completed_at_missing';
    elsif v_reservation.status <> 'adopted'
      and v_reservation.adoption_completed_at is not null
    then
      v_outcome := 'inconsistent_data';
      v_reason := 'status_date_mismatch';
    elsif v_reservation.status <> 'adopted' then
      v_outcome := 'not_eligible';
      v_reason := 'adoption_not_effective';
    elsif v_reservation.adoption_completed_at > p_occurred_at then
      v_outcome := 'inconsistent_data';
      v_reason := 'adoption_in_future';
    elsif v_contact.id is null then
      v_outcome := 'missing_data';
      v_reason := 'contact_missing';
    elsif v_contact.deleted_at is not null then
      v_outcome := 'not_eligible';
      v_reason := 'contact_deleted';
    elsif v_reservation.animal_id is null or v_animal.id is null then
      v_outcome := 'missing_data';
      v_reason := 'animal_missing';
    elsif v_animal.deleted_at is not null then
      v_outcome := 'not_eligible';
      v_reason := 'animal_deleted';
    elsif v_reservation.species is distinct from v_animal.species then
      v_outcome := 'inconsistent_data';
      v_reason := 'species_mismatch';
    elsif v_reservation.breed is distinct from v_animal.breed then
      v_outcome := 'inconsistent_data';
      v_reason := 'breed_mismatch';
    elsif v_animal.birth_date is not null
      and v_animal.birth_date > (v_reservation.adoption_completed_at at time zone 'UTC')::date
    then
      v_outcome := 'inconsistent_data';
      v_reason := 'birth_after_adoption';
    elsif v_milestone = 't2' and v_animal.birth_date is null then
      v_outcome := 'missing_data';
      v_reason := 'animal_birth_date_missing';
    end if;

    if v_outcome is null then
      select definition.code, definition.version, release.effective_at
      into v_definition_code, v_definition_version, v_release_effective_at
      from public.post_adoption_questionnaire_releases release
      join public.post_adoption_questionnaire_definitions definition
        on definition.code = release.questionnaire_code
       and definition.version = release.questionnaire_version
      where definition.milestone = v_milestone
        and definition.species = v_animal.species
        and (definition.breed is null or definition.breed = v_animal.breed)
        and release.effective_at <= v_reservation.adoption_completed_at
      order by
        (definition.breed is not null) desc,
        release.effective_at desc,
        definition.version desc,
        definition.code
      limit 1;

      if v_definition_code is null then
        v_outcome := 'not_eligible';
        v_reason := 'no_applicable_published_definition';
      else
        select definition.*
        into v_definition
        from public.post_adoption_questionnaire_definitions definition
        where definition.code = v_definition_code
          and definition.version = v_definition_version;
      end if;
    end if;

    if v_outcome is null then
      v_due_at := case v_definition.anchor_type
        when 'adoption_completed_at'
          then v_reservation.adoption_completed_at + v_definition.anchor_offset
        when 'animal_birth_date'
          then (v_animal.birth_date::timestamp at time zone 'UTC')
            + v_definition.anchor_offset
        else null
      end;

      if v_due_at is null then
        v_outcome := 'missing_data';
        v_reason := 'definition_anchor_missing';
      end if;
    end if;

    if v_outcome is null then
      begin
        insert into public.post_adoption_questionnaire_instances (
          organization_id,
          questionnaire_code,
          questionnaire_version,
          contact_id,
          reservation_id,
          animal_id,
          due_at,
          status,
          created_by,
          updated_by
        ) values (
          v_reservation.organization_id,
          v_definition.code,
          v_definition.version,
          v_reservation.contact_id,
          v_reservation.id,
          v_reservation.animal_id,
          v_due_at,
          'planned',
          v_actor_profile_id,
          v_actor_profile_id
        )
        on conflict do nothing
        returning id into v_instance_id;

        if v_instance_id is not null then
          insert into public.post_adoption_questionnaire_events (
            organization_id,
            instance_id,
            event_type,
            from_status,
            to_status,
            actor_kind,
            actor_profile_id,
            details,
            occurred_at
          ) values (
            v_reservation.organization_id,
            v_instance_id,
            'instance_created',
            null,
            null,
            v_actor_kind,
            v_actor_profile_id,
            jsonb_build_object(
              'source', p_source,
              'releaseEffectiveAt', v_release_effective_at,
              'adoptionCompletedAt', v_reservation.adoption_completed_at
            ),
            p_occurred_at
          );
          v_outcome := 'created';
          v_reason := 'instance_created';
        else
          select instance.*
          into v_existing_instance
          from public.post_adoption_questionnaire_instances instance
          where instance.organization_id = v_reservation.organization_id
            and instance.reservation_id = v_reservation.id
            and instance.milestone = v_milestone
          for update;

          if not found then
            raise exception 'post-adoption questionnaire instance conflict without existing row'
              using errcode = '40001';
          end if;

          v_instance_id := v_existing_instance.id;
          v_outcome := 'already_present';
          v_reason := case
            when v_existing_instance.questionnaire_version = v_definition.version
              then 'instance_already_present'
            else 'existing_version_preserved'
          end;
        end if;

        select instance.*
        into v_existing_instance
        from public.post_adoption_questionnaire_instances instance
        where instance.organization_id = v_reservation.organization_id
          and instance.id = v_instance_id
        for update;

        if v_existing_instance.status = 'planned'
          and v_existing_instance.due_at <= p_occurred_at
        then
          insert into public.post_adoption_questionnaire_events (
            organization_id,
            instance_id,
            event_type,
            from_status,
            to_status,
            actor_kind,
            actor_profile_id,
            details,
            occurred_at
          ) values (
            v_reservation.organization_id,
            v_instance_id,
            'became_due',
            'planned',
            'due',
            'system',
            null,
            jsonb_build_object('source', p_source),
            greatest(v_existing_instance.due_at, p_occurred_at)
          )
          on conflict (organization_id, instance_id)
            where event_type = 'became_due'
          do nothing;
        end if;
      exception
        when others then
          get stacked diagnostics
            v_error_sqlstate = returned_sqlstate,
            v_error_message = message_text;
          v_outcome := 'error';
          v_reason := 'instance_creation_failed';
          v_instance_id := null;
      end;
    end if;

    insert into public.post_adoption_questionnaire_reconciliation_attempts (
      organization_id,
      run_id,
      reservation_id,
      milestone,
      questionnaire_code,
      questionnaire_version,
      instance_id,
      source,
      outcome,
      reason,
      actor_profile_id,
      error_sqlstate,
      error_message,
      details,
      occurred_at
    ) values (
      v_reservation.organization_id,
      p_run_id,
      v_reservation.id,
      v_milestone,
      v_definition.code,
      v_definition.version,
      v_instance_id,
      p_source,
      v_outcome,
      v_reason,
      v_actor_profile_id,
      case when v_outcome = 'error' then v_error_sqlstate else null end,
      case when v_outcome = 'error' then left(v_error_message, 1000) else null end,
      jsonb_build_object(
        'adoptionCompletedAt', v_reservation.adoption_completed_at,
        'animalBirthDate', v_animal.birth_date,
        'dueAt', v_due_at
      ),
      p_occurred_at
    );
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Future-adoption trigger
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_post_adoption_questionnaires_after_reservation_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_relevant_change boolean;
begin
  if tg_op = 'INSERT' then
    v_relevant_change := true;
  else
    v_relevant_change := new.status is distinct from old.status
      or new.adoption_completed_at is distinct from old.adoption_completed_at
      or new.contact_id is distinct from old.contact_id
      or new.animal_id is distinct from old.animal_id
      or new.species is distinct from old.species
      or new.breed is distinct from old.breed
      or new.deleted_at is distinct from old.deleted_at;
  end if;

  if v_relevant_change
    and (new.status = 'adopted' or new.adoption_completed_at is not null)
  then
    perform public.reconcile_post_adoption_questionnaire_reservation_internal(
      new.id,
      'adoption_trigger',
      null,
      auth.uid(),
      statement_timestamp()
    );
  end if;

  return new;
end;
$function$;

create trigger reservations_reconcile_post_adoption_questionnaires
after insert or update of
  status,
  adoption_completed_at,
  contact_id,
  animal_id,
  species,
  breed,
  deleted_at
on public.reservations
for each row execute function public.reconcile_post_adoption_questionnaires_after_reservation_write();

-- ---------------------------------------------------------------------------
-- 5. Parent-side drift guards after materialization
-- ---------------------------------------------------------------------------

create or replace function public.protect_post_adoption_questionnaire_reservation_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if ((
    new.organization_id is distinct from old.organization_id
    or new.contact_id is distinct from old.contact_id
    or new.animal_id is distinct from old.animal_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.status is distinct from old.status
    or new.deleted_at is distinct from old.deleted_at
  ) and exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = old.organization_id
      and instance.reservation_id = old.id
  )) or (
    new.adoption_completed_at is distinct from old.adoption_completed_at
    and exists (
      select 1
      from public.post_adoption_questionnaire_instances instance
      join public.post_adoption_questionnaire_definitions definition
        on definition.code = instance.questionnaire_code
       and definition.version = instance.questionnaire_version
      where instance.organization_id = old.organization_id
        and instance.reservation_id = old.id
        and definition.anchor_type = 'adoption_completed_at'
    )
  ) then
    raise exception 'post-adoption questionnaire reservation anchor requires an explicit correction workflow'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

create trigger reservations_protect_post_adoption_questionnaire_anchor
before update of
  organization_id,
  contact_id,
  animal_id,
  species,
  breed,
  status,
  adoption_completed_at,
  deleted_at
on public.reservations
for each row execute function public.protect_post_adoption_questionnaire_reservation_anchor();

create or replace function public.protect_post_adoption_questionnaire_animal_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if ((
    new.organization_id is distinct from old.organization_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.deleted_at is distinct from old.deleted_at
  ) and exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = old.organization_id
      and instance.animal_id = old.id
  )) or (
    new.birth_date is distinct from old.birth_date
    and exists (
      select 1
      from public.post_adoption_questionnaire_instances instance
      join public.post_adoption_questionnaire_definitions definition
        on definition.code = instance.questionnaire_code
       and definition.version = instance.questionnaire_version
      where instance.organization_id = old.organization_id
        and instance.animal_id = old.id
        and definition.anchor_type = 'animal_birth_date'
    )
  ) then
    raise exception 'post-adoption questionnaire animal anchor requires an explicit correction workflow'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

create trigger animals_protect_post_adoption_questionnaire_anchor
before update of organization_id, species, breed, birth_date, deleted_at
on public.animals
for each row execute function public.protect_post_adoption_questionnaire_animal_anchor();

create or replace function public.protect_post_adoption_questionnaire_contact_link()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if (
    new.organization_id is distinct from old.organization_id
    or new.deleted_at is distinct from old.deleted_at
  ) and exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = old.organization_id
      and instance.contact_id = old.id
  ) then
    raise exception 'post-adoption questionnaire contact link requires an explicit correction workflow'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

create trigger contacts_protect_post_adoption_questionnaire_link
before update of organization_id, deleted_at
on public.contacts
for each row execute function public.protect_post_adoption_questionnaire_contact_link();

-- ---------------------------------------------------------------------------
-- 6. Bounded, organization-scoped operator RPC
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_post_adoption_questionnaire_instances(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_batch_size integer,
  p_after_adoption_completed_at timestamptz,
  p_after_reservation_id uuid,
  p_until_adoption_completed_at timestamptz,
  p_until_reservation_id uuid
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  processed_reservation_count integer,
  created_count integer,
  already_present_count integer,
  not_eligible_count integer,
  missing_data_count integer,
  inconsistent_data_count integer,
  error_count integer,
  next_adoption_completed_at timestamptz,
  next_reservation_id uuid,
  until_adoption_completed_at timestamptz,
  until_reservation_id uuid,
  has_more boolean,
  result jsonb
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_run public.post_adoption_questionnaire_reconciliation_runs%rowtype;
  v_stored_result public.post_adoption_questionnaire_reconciliation_run_results%rowtype;
  v_reservation record;
  v_processed integer := 0;
  v_run_id uuid := gen_random_uuid();
  v_last_completed_at timestamptz;
  v_last_reservation_id uuid;
  v_until_completed_at timestamptz;
  v_until_reservation_id uuid;
  v_has_more boolean := false;
  v_created integer := 0;
  v_already integer := 0;
  v_not_eligible integer := 0;
  v_missing integer := 0;
  v_inconsistent integer := 0;
  v_errors integer := 0;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  processed_reservation_count := 0;
  created_count := 0;
  already_present_count := 0;
  not_eligible_count := 0;
  missing_data_count := 0;
  inconsistent_data_count := 0;
  error_count := 0;
  next_adoption_completed_at := null;
  next_reservation_id := null;
  until_adoption_completed_at := null;
  until_reservation_id := null;
  has_more := false;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_organization_id is null
    or p_client_command_id is null
    or p_batch_size is null
    or p_batch_size not between 1 and 100
    or ((p_after_adoption_completed_at is null) <> (p_after_reservation_id is null))
    or ((p_until_adoption_completed_at is null) <> (p_until_reservation_id is null))
    or ((p_after_adoption_completed_at is null) <> (p_until_adoption_completed_at is null))
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = p_organization_id
      and membership.profile_id = v_user
      and membership.role in ('owner', 'admin')
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    reason := 'not_found';
    return next;
    return;
  end if;

  v_payload := jsonb_build_object(
    'organizationId', p_organization_id,
    'batchSize', p_batch_size,
    'afterAdoptionCompletedAt', p_after_adoption_completed_at,
    'afterReservationId', p_after_reservation_id,
    'untilAdoptionCompletedAt', p_until_adoption_completed_at,
    'untilReservationId', p_until_reservation_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'post_adoption_questionnaire_reconciliation:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select run.*
  into v_run
  from public.post_adoption_questionnaire_reconciliation_runs run
  where run.organization_id = p_organization_id
    and run.client_command_id = p_client_command_id;

  if found then
    if v_run.payload <> v_payload then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    select stored.*
    into v_stored_result
    from public.post_adoption_questionnaire_reconciliation_run_results stored
    where stored.organization_id = p_organization_id
      and stored.run_id = v_run.id;

    if not found then
      raise exception 'post-adoption questionnaire reconciliation result is missing'
        using errcode = '23514';
    end if;

    outcome := 'success';
    replayed := true;
    processed_reservation_count := v_stored_result.processed_reservation_count;
    created_count := v_stored_result.created_count;
    already_present_count := v_stored_result.already_present_count;
    not_eligible_count := v_stored_result.not_eligible_count;
    missing_data_count := v_stored_result.missing_data_count;
    inconsistent_data_count := v_stored_result.inconsistent_data_count;
    error_count := v_stored_result.error_count;
    next_adoption_completed_at := v_stored_result.next_adoption_completed_at;
    next_reservation_id := v_stored_result.next_reservation_id;
    until_adoption_completed_at := v_stored_result.until_adoption_completed_at;
    until_reservation_id := v_stored_result.until_reservation_id;
    has_more := v_stored_result.has_more;
    result := v_stored_result.result;
    return next;
    return;
  end if;

  if p_until_adoption_completed_at is null then
    select
      coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
      reservation.id
    into v_until_completed_at, v_until_reservation_id
    from public.reservations reservation
    where reservation.organization_id = p_organization_id
      and (reservation.status = 'adopted' or reservation.adoption_completed_at is not null)
    order by
      coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz) desc,
      reservation.id desc
    limit 1;
  else
    v_until_completed_at := p_until_adoption_completed_at;
    v_until_reservation_id := p_until_reservation_id;
  end if;

  if p_after_adoption_completed_at is not null
    and v_until_completed_at is not null
    and (p_after_adoption_completed_at, p_after_reservation_id)
      > (v_until_completed_at, v_until_reservation_id)
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  insert into public.post_adoption_questionnaire_reconciliation_runs (
    id,
    organization_id,
    client_command_id,
    source,
    payload,
    after_adoption_completed_at,
    after_reservation_id,
    until_adoption_completed_at,
    until_reservation_id,
    batch_size,
    created_by
  ) values (
    v_run_id,
    p_organization_id,
    p_client_command_id,
    'historical_reconciliation',
    v_payload,
    p_after_adoption_completed_at,
    p_after_reservation_id,
    v_until_completed_at,
    v_until_reservation_id,
    p_batch_size,
    v_user
  );

  for v_reservation in
    select
      reservation.id,
      coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz)
        as cursor_completed_at
    from public.reservations reservation
    where reservation.organization_id = p_organization_id
      and (reservation.status = 'adopted' or reservation.adoption_completed_at is not null)
      and (
        p_after_adoption_completed_at is null
        or (
          coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
          reservation.id
        ) > (p_after_adoption_completed_at, p_after_reservation_id)
      )
      and (
        v_until_completed_at is null
        or (
          coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
          reservation.id
        ) <= (v_until_completed_at, v_until_reservation_id)
      )
    order by
      coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
      reservation.id
    limit p_batch_size
  loop
    perform public.reconcile_post_adoption_questionnaire_reservation_internal(
      v_reservation.id,
      'historical_reconciliation',
      v_run_id,
      v_user,
      statement_timestamp()
    );
    v_processed := v_processed + 1;
    v_last_completed_at := v_reservation.cursor_completed_at;
    v_last_reservation_id := v_reservation.id;
  end loop;

  if v_processed > 0 then
    select exists (
      select 1
      from public.reservations reservation
      where reservation.organization_id = p_organization_id
        and (reservation.status = 'adopted' or reservation.adoption_completed_at is not null)
        and (
          coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
          reservation.id
        ) > (v_last_completed_at, v_last_reservation_id)
        and (
          v_until_completed_at is null
          or (
            coalesce(reservation.adoption_completed_at, '-infinity'::timestamptz),
            reservation.id
          ) <= (v_until_completed_at, v_until_reservation_id)
        )
    ) into v_has_more;
  end if;

  select
    count(*) filter (where attempt.outcome = 'created'),
    count(*) filter (where attempt.outcome = 'already_present'),
    count(*) filter (where attempt.outcome = 'not_eligible'),
    count(*) filter (where attempt.outcome = 'missing_data'),
    count(*) filter (where attempt.outcome = 'inconsistent_data'),
    count(*) filter (where attempt.outcome = 'error')
  into
    v_created,
    v_already,
    v_not_eligible,
    v_missing,
    v_inconsistent,
    v_errors
  from public.post_adoption_questionnaire_reconciliation_attempts attempt
  where attempt.organization_id = p_organization_id
    and attempt.run_id = v_run_id;

  result := jsonb_build_object(
    'processedReservationCount', v_processed,
    'createdCount', v_created,
    'alreadyPresentCount', v_already,
    'notEligibleCount', v_not_eligible,
    'missingDataCount', v_missing,
    'inconsistentDataCount', v_inconsistent,
    'errorCount', v_errors,
    'nextAdoptionCompletedAt', v_last_completed_at,
    'nextReservationId', v_last_reservation_id,
    'untilAdoptionCompletedAt', v_until_completed_at,
    'untilReservationId', v_until_reservation_id,
    'hasMore', v_has_more
  );

  insert into public.post_adoption_questionnaire_reconciliation_run_results (
    organization_id,
    run_id,
    processed_reservation_count,
    created_count,
    already_present_count,
    not_eligible_count,
    missing_data_count,
    inconsistent_data_count,
    error_count,
    next_adoption_completed_at,
    next_reservation_id,
    until_adoption_completed_at,
    until_reservation_id,
    has_more,
    result
  ) values (
    p_organization_id,
    v_run_id,
    v_processed,
    v_created,
    v_already,
    v_not_eligible,
    v_missing,
    v_inconsistent,
    v_errors,
    v_last_completed_at,
    v_last_reservation_id,
    v_until_completed_at,
    v_until_reservation_id,
    v_has_more,
    result
  );

  outcome := 'success';
  replayed := false;
  processed_reservation_count := v_processed;
  created_count := v_created;
  already_present_count := v_already;
  not_eligible_count := v_not_eligible;
  missing_data_count := v_missing;
  inconsistent_data_count := v_inconsistent;
  error_count := v_errors;
  next_adoption_completed_at := v_last_completed_at;
  next_reservation_id := v_last_reservation_id;
  until_adoption_completed_at := v_until_completed_at;
  until_reservation_id := v_until_reservation_id;
  has_more := v_has_more;
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. RLS and privileges
-- ---------------------------------------------------------------------------

alter table public.post_adoption_questionnaire_releases enable row level security;
alter table public.post_adoption_questionnaire_reconciliation_runs enable row level security;
alter table public.post_adoption_questionnaire_reconciliation_attempts enable row level security;
alter table public.post_adoption_questionnaire_reconciliation_run_results enable row level security;

revoke all on table
  public.post_adoption_questionnaire_releases,
  public.post_adoption_questionnaire_reconciliation_runs,
  public.post_adoption_questionnaire_reconciliation_attempts,
  public.post_adoption_questionnaire_reconciliation_run_results
from public, anon, authenticated;

grant select on table public.post_adoption_questionnaire_releases to authenticated;
grant select on table
  public.post_adoption_questionnaire_reconciliation_runs,
  public.post_adoption_questionnaire_reconciliation_attempts,
  public.post_adoption_questionnaire_reconciliation_run_results
to authenticated;

create policy post_adoption_questionnaire_releases_select_authenticated
on public.post_adoption_questionnaire_releases
for select to authenticated
using (true);

create policy post_adoption_questionnaire_reconciliation_runs_select_admin
on public.post_adoption_questionnaire_reconciliation_runs
for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy paqr_attempts_select_admin
on public.post_adoption_questionnaire_reconciliation_attempts
for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy post_adoption_questionnaire_reconciliation_results_select_admin
on public.post_adoption_questionnaire_reconciliation_run_results
for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']));

revoke execute on function public.assert_post_adoption_questionnaire_release()
  from public, anon, authenticated;
revoke execute on function public.assign_post_adoption_questionnaire_instance_milestone()
  from public, anon, authenticated;
revoke execute on function public.post_adoption_questionnaire_release_immutable()
  from public, anon, authenticated;
revoke execute on function public.post_adoption_questionnaire_reconciliation_audit_immutable()
  from public, anon, authenticated;
revoke execute on function public.reconcile_post_adoption_questionnaire_reservation_internal(
  uuid, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke execute on function public.reconcile_post_adoption_questionnaires_after_reservation_write()
  from public, anon, authenticated;
revoke execute on function public.protect_post_adoption_questionnaire_reservation_anchor()
  from public, anon, authenticated;
revoke execute on function public.protect_post_adoption_questionnaire_animal_anchor()
  from public, anon, authenticated;
revoke execute on function public.protect_post_adoption_questionnaire_contact_link()
  from public, anon, authenticated;
revoke execute on function public.reconcile_post_adoption_questionnaire_instances(
  uuid, uuid, integer, timestamptz, uuid, timestamptz, uuid
) from public, anon;
grant execute on function public.reconcile_post_adoption_questionnaire_instances(
  uuid, uuid, integer, timestamptz, uuid, timestamptz, uuid
) to authenticated;

commit;

-- ADOPTION-HANDOVER-SAFETY-01
-- Controlled correction and reversal before family follow-up has started.

begin;

create or replace function public.protect_post_adoption_questionnaire_reservation_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if pg_catalog.current_setting('app.adoption_handover_correction', true) = 'on' then
    return new;
  end if;

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

create or replace function public.protect_effective_adoption_questionnaire_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if pg_catalog.current_setting('app.adoption_handover_correction', true) = 'on' then
    return new;
  end if;

  if old.status = 'adopted'
    and old.adoption_completed_at is not null
    and (
      new.organization_id is distinct from old.organization_id
      or new.contact_id is distinct from old.contact_id
      or new.animal_id is distinct from old.animal_id
      or new.species is distinct from old.species
      or new.breed is distinct from old.breed
      or new.status is distinct from old.status
      or new.adoption_completed_at is distinct from old.adoption_completed_at
      or new.deleted_at is distinct from old.deleted_at
    )
  then
    raise exception 'effective adoption questionnaire anchor requires an explicit correction workflow'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

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
  if pg_catalog.current_setting('app.adoption_handover_correction', true) = 'on' then
    return new;
  end if;

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

create or replace function public.assert_post_adoption_questionnaire_instance_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_expected_due_at timestamptz;
  v_correction boolean :=
    pg_catalog.current_setting('app.adoption_handover_correction', true) = 'on';
begin
  if tg_op = 'UPDATE'
    and not v_correction
    and (
      new.organization_id is distinct from old.organization_id
      or new.questionnaire_code is distinct from old.questionnaire_code
      or new.questionnaire_version is distinct from old.questionnaire_version
      or new.contact_id is distinct from old.contact_id
      or new.reservation_id is distinct from old.reservation_id
      or new.animal_id is distinct from old.animal_id
      or new.due_at is distinct from old.due_at
      or (old.invited_at is not null and new.invited_at is distinct from old.invited_at)
      or (old.response_deadline_at is not null and new.response_deadline_at is distinct from old.response_deadline_at)
    )
  then
    raise exception 'post-adoption questionnaire instance linkage is immutable'
      using errcode = '55000';
  end if;

  select reservation.*
  into v_reservation
  from public.reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id
    and reservation.deleted_at is null;
  select animal.*
  into v_animal
  from public.animals animal
  where animal.organization_id = new.organization_id
    and animal.id = new.animal_id
    and animal.deleted_at is null;
  select definition.*
  into v_definition
  from public.post_adoption_questionnaire_definitions definition
  where definition.code = new.questionnaire_code
    and definition.version = new.questionnaire_version;

  if v_reservation.id is null
    or v_reservation.status <> 'adopted'
    or v_reservation.adoption_completed_at is null
    or v_reservation.contact_id is distinct from new.contact_id
    or v_reservation.animal_id is distinct from new.animal_id
    or v_animal.id is null
    or v_reservation.species is distinct from v_animal.species
    or v_reservation.breed is distinct from v_animal.breed
    or v_definition.code is null
    or v_definition.species is distinct from v_animal.species
    or (v_definition.breed is not null and v_definition.breed is distinct from v_animal.breed)
  then
    raise exception 'post-adoption questionnaire instance linkage is invalid'
      using errcode = '23514';
  end if;

  v_expected_due_at := case v_definition.anchor_type
    when 'adoption_completed_at'
      then v_reservation.adoption_completed_at + v_definition.anchor_offset
    when 'animal_birth_date'
      then (v_animal.birth_date::timestamp at time zone 'UTC')
        + v_definition.anchor_offset
    else null
  end;

  if new.due_at is distinct from v_expected_due_at then
    raise exception 'post-adoption questionnaire due date does not match its published anchor'
      using errcode = '23514';
  end if;
  if new.invited_at is not null
    and new.response_deadline_at is distinct from new.invited_at + v_definition.response_window
  then
    raise exception 'post-adoption questionnaire response deadline does not match its published window'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function public.reanchor_uninvited_post_adoption_questionnaires(
  p_reservation_id uuid,
  p_actor_profile_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_definition_code text;
  v_definition_version integer;
  v_due_at timestamptz;
  v_changes jsonb := '[]'::jsonb;
begin
  select reservation.*
  into v_reservation
  from public.reservations reservation
  where reservation.id = p_reservation_id
    and reservation.status = 'adopted'
    and reservation.adoption_completed_at is not null
    and reservation.deleted_at is null
  for no key update;

  if not found then
    raise exception 'effective adoption does not exist for questionnaire reanchoring'
      using errcode = '23514';
  end if;

  select animal.*
  into v_animal
  from public.animals animal
  where animal.organization_id = v_reservation.organization_id
    and animal.id = v_reservation.animal_id
    and animal.deleted_at is null
  for no key update;

  if not found then
    raise exception 'effective adoption animal does not exist for questionnaire reanchoring'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id
      and instance.reservation_id = v_reservation.id
      and (
        instance.invited_at is not null
        or exists (
          select 1
          from public.post_adoption_questionnaire_response_revisions revision
          where revision.organization_id = instance.organization_id
            and revision.instance_id = instance.id
        )
      )
  ) then
    raise exception 'started post-adoption follow-up cannot be reanchored'
      using errcode = '55000';
  end if;

  for v_instance in
    select instance.*
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id
      and instance.reservation_id = v_reservation.id
    order by instance.milestone, instance.id
    for update
  loop
    v_definition_code := null;
    v_definition_version := null;

    select definition.code, definition.version
    into v_definition_code, v_definition_version
    from public.post_adoption_questionnaire_releases release
    join public.post_adoption_questionnaire_definitions definition
      on definition.code = release.questionnaire_code
     and definition.version = release.questionnaire_version
    where definition.milestone = v_instance.milestone
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
      raise exception 'no published questionnaire definition matches corrected adoption'
        using errcode = '23514';
    end if;

    select definition.*
    into v_definition
    from public.post_adoption_questionnaire_definitions definition
    where definition.code = v_definition_code
      and definition.version = v_definition_version;

    v_due_at := case v_definition.anchor_type
      when 'adoption_completed_at'
        then v_reservation.adoption_completed_at + v_definition.anchor_offset
      when 'animal_birth_date'
        then (v_animal.birth_date::timestamp at time zone 'UTC')
          + v_definition.anchor_offset
      else null
    end;

    if v_due_at is null then
      raise exception 'corrected questionnaire anchor is missing'
        using errcode = '23514';
    end if;

    perform pg_catalog.set_config('app.adoption_handover_correction', 'on', true);
    update public.post_adoption_questionnaire_instances instance
    set questionnaire_code = v_definition.code,
        questionnaire_version = v_definition.version,
        due_at = v_due_at,
        updated_at = p_occurred_at,
        updated_by = p_actor_profile_id
    where instance.organization_id = v_instance.organization_id
      and instance.id = v_instance.id;

    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'instanceId', v_instance.id,
      'milestone', v_instance.milestone,
      'previousQuestionnaireCode', v_instance.questionnaire_code,
      'previousQuestionnaireVersion', v_instance.questionnaire_version,
      'previousDueAt', v_instance.due_at,
      'questionnaireCode', v_definition.code,
      'questionnaireVersion', v_definition.version,
      'dueAt', v_due_at
    ));
  end loop;

  return v_changes;
end;
$function$;

create or replace function public.restore_reversed_post_adoption_questionnaires()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_changes jsonb;
begin
  if new.event_type <> 'finalized' then
    return new;
  end if;

  if not exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = new.organization_id
      and instance.reservation_id = new.reservation_id
      and instance.status = 'suspended'
      and instance.invited_at is null
      and instance.suspension_reason = 'Adoption finalization reversed.'
  ) then
    return new;
  end if;

  v_changes := public.reanchor_uninvited_post_adoption_questionnaires(
    new.reservation_id,
    new.actor_profile_id,
    new.occurred_at
  );

  for v_instance in
    select instance.*
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = new.organization_id
      and instance.reservation_id = new.reservation_id
      and instance.status = 'suspended'
      and instance.invited_at is null
      and instance.suspension_reason = 'Adoption finalization reversed.'
    order by instance.milestone, instance.id
    for update
  loop
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
      new.organization_id,
      v_instance.id,
      'resumed',
      'suspended',
      v_instance.suspended_from_status,
      'member',
      new.actor_profile_id,
      jsonb_build_object(
        'source', 'adoption_handover_refinalization',
        'adoptionHandoverEventId', new.id,
        'anchorChanges', v_changes
      ),
      new.occurred_at
    );

    if v_instance.suspended_from_status = 'planned'
      and v_instance.due_at <= new.occurred_at
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
        new.organization_id,
        v_instance.id,
        'became_due',
        'planned',
        'due',
        'system',
        null,
        jsonb_build_object(
          'source', 'adoption_handover_refinalization',
          'adoptionHandoverEventId', new.id
        ),
        new.occurred_at
      )
      on conflict (organization_id, instance_id)
        where event_type = 'became_due'
      do nothing;
    end if;
  end loop;

  return new;
end;
$function$;

create trigger adoption_handover_events_restore_reversed_questionnaires
after insert on public.adoption_handover_events
for each row execute function public.restore_reversed_post_adoption_questionnaires();

create or replace function public.correct_adoption_handover(
  p_reservation_id uuid,
  p_client_command_id uuid,
  p_correction_type text,
  p_new_adoption_completed_at timestamptz,
  p_expected_adoption_completed_at timestamptz,
  p_reason text
)
returns table (
  outcome text,
  reason text,
  replayed boolean,
  event_id uuid,
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
  v_trimmed_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_request jsonb;
  v_reservation public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_actor_role text;
  v_existing_event public.adoption_handover_events%rowtype;
  v_previous_event public.adoption_handover_events%rowtype;
  v_finalization_event public.adoption_handover_events%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_started boolean := false;
  v_anchor_changes jsonb := '[]'::jsonb;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_event_type text;
  v_previous_animal_status text;
  v_previous_ownership_status text;
  v_role_id uuid;
begin
  outcome := 'error';
  reason := null;
  replayed := false;
  event_id := null;
  adoption_completed_at := null;
  result := '{}'::jsonb;

  if v_user is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_reservation_id is null
    or p_client_command_id is null
    or p_expected_adoption_completed_at is null
    or p_correction_type not in ('date', 'reverse')
    or v_trimmed_reason is null
    or char_length(v_trimmed_reason) > 5000
    or (p_correction_type = 'date' and p_new_adoption_completed_at is null)
    or (p_correction_type = 'reverse' and p_new_adoption_completed_at is not null)
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  v_request := jsonb_build_object(
    'reservationId', p_reservation_id,
    'correctionType', p_correction_type,
    'newAdoptionCompletedAt', p_new_adoption_completed_at,
    'expectedAdoptionCompletedAt', p_expected_adoption_completed_at,
    'reason', v_trimmed_reason
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
      and membership.role in ('owner', 'admin');

    if not found then
      reason := 'not_found';
      return next;
      return;
    end if;

    outcome := case
      when v_existing_event.event_type = 'incident_opened'
        then 'incident_opened'
      else 'success'
    end;
    replayed := true;
    event_id := v_existing_event.id;
    adoption_completed_at := v_existing_event.adoption_completed_at;
    result := jsonb_build_object(
      'reservationId', v_existing_event.reservation_id,
      'eventType', v_existing_event.event_type,
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
    and membership.role in ('owner', 'admin');

  if not found then
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.status <> 'adopted'
    or v_reservation.adoption_completed_at is null
    or v_reservation.animal_id is null
  then
    reason := 'adoption_not_effective';
    return next;
    return;
  end if;

  if v_reservation.adoption_completed_at
    is distinct from p_expected_adoption_completed_at
  then
    reason := 'correction_stale';
    return next;
    return;
  end if;

  select animal.*
  into v_animal
  from public.animals animal
  where animal.organization_id = v_reservation.organization_id
    and animal.id = v_reservation.animal_id
    and animal.deleted_at is null
  for no key update;

  if not found then
    reason := 'animal_missing';
    return next;
    return;
  end if;

  select event.*
  into v_previous_event
  from public.adoption_handover_events event
  where event.organization_id = v_reservation.organization_id
    and event.reservation_id = v_reservation.id
  order by event.occurred_at desc, event.id desc
  limit 1;

  if not found then
    reason := 'finalization_history_missing';
    return next;
    return;
  end if;

  select event.*
  into v_finalization_event
  from public.adoption_handover_events event
  where event.organization_id = v_reservation.organization_id
    and event.reservation_id = v_reservation.id
    and event.event_type = 'finalized'
  order by event.occurred_at desc, event.id desc
  limit 1;

  if not found then
    reason := 'finalization_history_missing';
    return next;
    return;
  end if;

  v_started := exists (
    select 1
    from public.post_adoption_questionnaire_instances instance
    where instance.organization_id = v_reservation.organization_id
      and instance.reservation_id = v_reservation.id
      and (
        instance.invited_at is not null
        or exists (
          select 1
          from public.post_adoption_questionnaire_response_revisions revision
          where revision.organization_id = instance.organization_id
            and revision.instance_id = instance.id
        )
      )
  );

  if v_started then
    update public.post_adoption_questionnaire_public_sessions session
    set invalidated_at = v_now
    where session.organization_id = v_reservation.organization_id
      and session.invalidated_at is null
      and exists (
        select 1
        from public.post_adoption_questionnaire_public_accesses access
        join public.post_adoption_questionnaire_instances instance
          on instance.organization_id = access.organization_id
         and instance.id = access.instance_id
        where access.organization_id = session.organization_id
          and access.id = session.access_id
          and instance.reservation_id = v_reservation.id
      );

    update public.post_adoption_questionnaire_public_accesses access
    set revoked_at = v_now,
        revoked_by = v_user
    where access.organization_id = v_reservation.organization_id
      and access.revoked_at is null
      and exists (
        select 1
        from public.post_adoption_questionnaire_instances instance
        where instance.organization_id = access.organization_id
          and instance.id = access.instance_id
          and instance.reservation_id = v_reservation.id
      );

    for v_instance in
      select instance.*
      from public.post_adoption_questionnaire_instances instance
      where instance.organization_id = v_reservation.organization_id
        and instance.reservation_id = v_reservation.id
        and instance.status in (
          'planned', 'due', 'invited', 'in_progress', 'submitted', 'under_review'
        )
      order by instance.milestone, instance.id
      for update
    loop
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
        v_instance.id,
        'suspended',
        v_instance.status,
        'suspended',
        'member',
        v_user,
        jsonb_build_object(
          'reason', 'Adoption correction requires internal review.',
          'source', 'adoption_handover_incident',
          'correctionType', p_correction_type
        ),
        v_now
      );
    end loop;

    insert into public.adoption_handover_events (
      id, organization_id, reservation_id, contact_id, animal_id,
      event_type, client_command_id, actor_profile_id, actor_role,
      adoption_completed_at, previous_adoption_completed_at,
      checks, exceptions, reason, previous_event_id, details, occurred_at
    ) values (
      v_event_id,
      v_reservation.organization_id,
      v_reservation.id,
      v_reservation.contact_id,
      v_animal.id,
      'incident_opened',
      p_client_command_id,
      v_user,
      v_actor_role,
      v_reservation.adoption_completed_at,
      v_reservation.adoption_completed_at,
      jsonb_build_object('postAdoptionFollowUpStarted', true),
      '[]'::jsonb,
      v_trimmed_reason,
      v_previous_event.id,
      jsonb_build_object('request', v_request),
      v_now
    );

    outcome := 'incident_opened';
    event_id := v_event_id;
    adoption_completed_at := v_reservation.adoption_completed_at;
    result := jsonb_build_object(
      'reservationId', v_reservation.id,
      'eventId', v_event_id,
      'postAdoptionFollowUpStarted', true
    );
    return next;
    return;
  end if;

  if p_correction_type = 'date' then
    if p_new_adoption_completed_at > v_now
      or (
        v_animal.birth_date is not null
        and (p_new_adoption_completed_at at time zone 'UTC')::date < v_animal.birth_date
      )
      or p_new_adoption_completed_at = v_reservation.adoption_completed_at
    then
      reason := 'invalid_adoption_date';
      return next;
      return;
    end if;

    perform pg_catalog.set_config('app.adoption_handover_correction', 'on', true);
    update public.reservations
    set adoption_completed_at = p_new_adoption_completed_at,
        updated_at = v_now,
        updated_by = v_user
    where organization_id = v_reservation.organization_id
      and id = v_reservation.id;

    update public.contact_roles role
    set started_at = adopted_reservations.started_at,
        updated_at = v_now,
        updated_by = v_user
    from (
      select min(
        (reservation.adoption_completed_at at time zone 'UTC')::date
      ) as started_at
      from public.reservations reservation
      where reservation.organization_id = v_reservation.organization_id
        and reservation.contact_id = v_reservation.contact_id
        and reservation.status = 'adopted'
        and reservation.adoption_completed_at is not null
        and reservation.deleted_at is null
    ) adopted_reservations
    where role.organization_id = v_reservation.organization_id
      and role.contact_id = v_reservation.contact_id
      and role.role = 'adopter'
      and role.is_active
      and role.deleted_at is null
      and adopted_reservations.started_at is not null;

    v_anchor_changes := public.reanchor_uninvited_post_adoption_questionnaires(
      v_reservation.id,
      v_user,
      v_now
    );
    v_event_type := 'date_corrected';
  else
    for v_instance in
      select instance.*
      from public.post_adoption_questionnaire_instances instance
      where instance.organization_id = v_reservation.organization_id
        and instance.reservation_id = v_reservation.id
        and instance.status in ('planned', 'due')
      order by instance.milestone, instance.id
      for update
    loop
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
        v_instance.id,
        'suspended',
        v_instance.status,
        'suspended',
        'member',
        v_user,
        jsonb_build_object(
          'reason', 'Adoption finalization reversed.',
          'source', 'adoption_handover_reversal'
        ),
        v_now
      );
    end loop;

    v_previous_animal_status := coalesce(
      v_finalization_event.details->>'previousAnimalStatus',
      'reserved'
    );
    v_previous_ownership_status := coalesce(
      v_finalization_event.details->>'previousAnimalOwnershipStatus',
      'produced'
    );

    perform pg_catalog.set_config('app.adoption_handover_correction', 'on', true);
    update public.reservations
    set status = 'animal_assigned',
        adoption_completed_at = null,
        updated_at = v_now,
        updated_by = v_user
    where organization_id = v_reservation.organization_id
      and id = v_reservation.id;

    update public.animals
    set status = v_previous_animal_status,
        ownership_status = v_previous_ownership_status,
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
      'reservation_holder',
      v_now::date,
      true,
      v_user,
      v_user
    )
    on conflict (organization_id, contact_id, role)
      where is_active and deleted_at is null
    do update set
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    returning id into v_role_id;

    if not exists (
      select 1
      from public.reservations other_reservation
      where other_reservation.organization_id = v_reservation.organization_id
        and other_reservation.contact_id = v_reservation.contact_id
        and other_reservation.id <> v_reservation.id
        and other_reservation.status = 'adopted'
        and other_reservation.adoption_completed_at is not null
        and other_reservation.deleted_at is null
    ) then
      update public.contact_roles role
      set is_active = false,
          ended_at = v_now::date,
          updated_at = v_now,
          updated_by = v_user
      where role.organization_id = v_reservation.organization_id
        and role.contact_id = v_reservation.contact_id
        and role.role = 'adopter'
        and role.is_active
        and role.deleted_at is null;
    else
      update public.contact_roles role
      set started_at = adopted_reservations.started_at,
          updated_at = v_now,
          updated_by = v_user
      from (
        select min(
          (reservation.adoption_completed_at at time zone 'UTC')::date
        ) as started_at
        from public.reservations reservation
        where reservation.organization_id = v_reservation.organization_id
          and reservation.contact_id = v_reservation.contact_id
          and reservation.id <> v_reservation.id
          and reservation.status = 'adopted'
          and reservation.adoption_completed_at is not null
          and reservation.deleted_at is null
      ) adopted_reservations
      where role.organization_id = v_reservation.organization_id
        and role.contact_id = v_reservation.contact_id
        and role.role = 'adopter'
        and role.is_active
        and role.deleted_at is null
        and adopted_reservations.started_at is not null;
    end if;

    v_event_type := 'reversed';
  end if;

  insert into public.adoption_handover_events (
    id, organization_id, reservation_id, contact_id, animal_id,
    event_type, client_command_id, actor_profile_id, actor_role,
    adoption_completed_at, previous_adoption_completed_at,
    checks, exceptions, reason, previous_event_id, details, occurred_at
  ) values (
    v_event_id,
    v_reservation.organization_id,
    v_reservation.id,
    v_reservation.contact_id,
    v_animal.id,
    v_event_type,
    p_client_command_id,
    v_user,
    v_actor_role,
    case when p_correction_type = 'date' then p_new_adoption_completed_at else null end,
    v_reservation.adoption_completed_at,
    jsonb_build_object('postAdoptionFollowUpStarted', false),
    '[]'::jsonb,
    v_trimmed_reason,
    v_previous_event.id,
    jsonb_build_object(
      'request', v_request,
      'anchorChanges', v_anchor_changes,
      'restoredReservationHolderRoleId', v_role_id
    ),
    v_now
  );

  outcome := 'success';
  event_id := v_event_id;
  adoption_completed_at := case
    when p_correction_type = 'date' then p_new_adoption_completed_at
    else null
  end;
  result := jsonb_build_object(
    'reservationId', v_reservation.id,
    'contactId', v_reservation.contact_id,
    'eventType', v_event_type,
    'eventId', v_event_id,
    'anchorChanges', v_anchor_changes
  );
  return next;
end;
$function$;

revoke all on function public.reanchor_uninvited_post_adoption_questionnaires(
  uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.restore_reversed_post_adoption_questionnaires()
  from public, anon, authenticated, service_role;
revoke all on function public.correct_adoption_handover(
  uuid, uuid, text, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public.correct_adoption_handover(
  uuid, uuid, text, timestamptz, timestamptz, text
) to authenticated;

commit;

begin;

-- Wire the historical public cancellation contract to the private reversal
-- engine without changing the historical core or either public/private
-- signature.

do $guard$
declare
  v_public regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_core regprocedure :=
    'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_reversal regprocedure :=
    'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure;
  v_expected_result text :=
    'TABLE(outcome text, birth_id uuid, animal_id uuid, event_id uuid, weight_measurement_id uuid, revision_no integer, event_sequence_no integer, replayed boolean, reason text)';
  v_public_source text;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'cancel_whelping_birth'
  ) <> 1
    or (
      select count(*)
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'cancel_whelping_birth_core_internal'
    ) <> 1
    or (
      select count(*)
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname =
          'reverse_litter_plan_after_cancelled_first_birth_internal'
    ) <> 1
  then
    raise exception 'birth cancellation wiring overload contract diverged';
  end if;

  if v_public::oid <> 23891
    or v_core::oid <> 21411
    or v_reversal::oid <> 25110
  then
    raise exception 'birth cancellation wiring OID contract diverged';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid in (v_public, v_core)
      and (
        pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
        or not procedure.prosecdef
        or procedure.proconfig is distinct from
          array['search_path=""', 'row_security=off']
        or pg_catalog.pg_get_function_identity_arguments(procedure.oid) <>
          'p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text'
        or pg_catalog.pg_get_function_arguments(procedure.oid) <>
          'p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text'
        or pg_catalog.pg_get_function_result(procedure.oid) <>
          v_expected_result
        or pg_catalog.pg_get_expr(procedure.proargdefaults, 0) is not null
      )
  ) then
    raise exception 'birth cancellation wiring public/core contract diverged';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
      or not procedure.prosecdef
      or procedure.proconfig is distinct from
        array['search_path=""', 'row_security=off']
      or pg_catalog.pg_get_function_identity_arguments(procedure.oid) <>
        'p_organization_id uuid, p_litter_id uuid, p_activation_id uuid, p_birth_adjustment_client_command_id uuid'
      or pg_catalog.pg_get_function_result(procedure.oid) <> 'jsonb'
      or pg_catalog.pg_get_expr(procedure.proargdefaults, 0) is not null
    from pg_catalog.pg_proc procedure
    where procedure.oid = v_reversal
  ) then
    raise exception 'birth cancellation wiring reversal contract diverged';
  end if;

  if (
    select encode(
      digest(
        convert_to(
          regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from pg_catalog.pg_proc procedure
    where procedure.oid = v_public
  ) <> '2f1378118a1402d6539b83d1009ea79530f827413801d023144443b07def21b0'
    or (
      select encode(
        digest(
          convert_to(
            regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_core
    ) <> '96d670397313a8322b3c1c1053369235ba9a74425a088205055a5638f9fe6516'
    or (
      select encode(
        digest(
          convert_to(
            regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_reversal
    ) <> 'baf917516c89e61414b61a4f1d14c4aa536803636af62263536f73c05640d61b'
  then
    raise exception 'birth cancellation wiring body fingerprint diverged';
  end if;

  select procedure.prosrc
  into v_public_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_public;

  if (
    length(v_public_source) -
    length(replace(
      v_public_source,
      'perform public.acquire_litter_plan_mutation_lock(',
      ''
    ))
  ) / length('perform public.acquire_litter_plan_mutation_lock(') <> 1
    or (
      length(v_public_source) -
      length(replace(
        v_public_source,
        'from public.cancel_whelping_birth_core_internal(',
        ''
      ))
    ) / length('from public.cancel_whelping_birth_core_internal(') <> 2
    or (
      length(v_public_source) -
      length(replace(
        v_public_source,
        'from public.litter_plan_actual_birth_activation_states state',
        ''
      ))
    ) / length(
      'from public.litter_plan_actual_birth_activation_states state'
    ) <> 1
  then
    raise exception 'birth cancellation wiring historical fragments diverged';
  end if;

  if not pg_catalog.has_function_privilege(
      'authenticated',
      v_public,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_public, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select procedure.proacl
         from pg_catalog.pg_proc procedure
         where procedure.oid = v_public),
        pg_catalog.acldefault(
          'f',
          (select procedure.proowner
           from pg_catalog.pg_proc procedure
           where procedure.oid = v_public)
        )
      )) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('authenticated', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_reversal,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_reversal, 'EXECUTE')
  then
    raise exception 'birth cancellation wiring ACL contract diverged';
  end if;
end;
$guard$;

create or replace function public.cancel_whelping_birth(
  p_birth_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_cancelled_at timestamptz,
  p_reason text
)
returns table (
  outcome text,
  birth_id uuid,
  animal_id uuid,
  event_id uuid,
  weight_measurement_id uuid,
  revision_no integer,
  event_sequence_no integer,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_litter_id uuid;
  v_membership_role text;
  v_reason text := nullif(btrim(p_reason), '');
  v_core_result record;
  v_reversal_result jsonb;
  v_state public.litter_plan_actual_birth_activation_states%rowtype;
  v_activation public.litter_plan_actual_birth_activations%rowtype;
  v_source_command public.whelping_commands%rowtype;
  v_source_birth_id uuid;
  v_other_active_birth_count integer := 0;
  v_target_is_active boolean := false;
  v_target_is_source_birth boolean := false;
  v_reversal_required boolean := false;
  v_phase text := 'preflight';
  v_error_state text;
begin
  outcome := 'error';
  birth_id := p_birth_id;
  animal_id := null;
  event_id := null;
  weight_measurement_id := null;
  revision_no := null;
  event_sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_birth_id is null
    or p_client_command_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no < 0
    or p_cancelled_at is null
    or not pg_catalog.isfinite(p_cancelled_at)
    or v_reason is null
    or char_length(v_reason) > 500
  then
    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal(
      p_birth_id,
      p_client_command_id,
      p_expected_revision_no,
      p_cancelled_at,
      p_reason
    );

    outcome := v_core_result.outcome;
    birth_id := v_core_result.birth_id;
    animal_id := v_core_result.animal_id;
    event_id := v_core_result.event_id;
    weight_measurement_id := v_core_result.weight_measurement_id;
    revision_no := v_core_result.revision_no;
    event_sequence_no := v_core_result.event_sequence_no;
    replayed := v_core_result.replayed;
    reason := v_core_result.reason;
    return next;
    return;
  end if;

  select birth.organization_id, session.litter_id
  into v_organization_id, v_litter_id
  from public.whelping_births birth
  join public.whelping_sessions session
    on session.organization_id = birth.organization_id
   and session.id = birth.session_id
  where birth.id = p_birth_id;

  if not found then
    reason := 'birth_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'birth_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform public.acquire_litter_plan_mutation_lock(
    v_organization_id,
    v_litter_id
  );

  -- Canonical order shared with activation/reconciliation/reversal paths:
  -- litter → all litter births → activation state → activation → source command.
  perform litter.id
  from public.litters litter
  where litter.organization_id = v_organization_id
    and litter.id = v_litter_id
  for update;

  perform litter_birth.id
  from public.whelping_births litter_birth
  join public.whelping_sessions session
    on session.organization_id = litter_birth.organization_id
   and session.id = litter_birth.session_id
  where session.organization_id = v_organization_id
    and session.litter_id = v_litter_id
  order by litter_birth.id
  for update of litter_birth;

  select
    count(*) filter (
      where active_birth.cancelled_at is null
        and active_birth.id <> p_birth_id
    )::integer,
    coalesce(
      bool_or(
        active_birth.id = p_birth_id
        and active_birth.cancelled_at is null
      ),
      false
    )
  into v_other_active_birth_count, v_target_is_active
  from public.whelping_births active_birth
  join public.whelping_sessions session
    on session.organization_id = active_birth.organization_id
   and session.id = active_birth.session_id
  where session.organization_id = v_organization_id
    and session.litter_id = v_litter_id;

  select state.*
  into v_state
  from public.litter_plan_actual_birth_activation_states state
  where state.organization_id = v_organization_id
    and state.litter_id = v_litter_id
  for update;

  if v_state.current_activation_id is not null then
    if v_state.last_activation_id is distinct from
      v_state.current_activation_id
    then
      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    select activation.*
    into v_activation
    from public.litter_plan_actual_birth_activations activation
    where activation.organization_id = v_organization_id
      and activation.litter_id = v_litter_id
      and activation.id = v_state.current_activation_id
    for share;

    if not found then
      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    select command.*
    into v_source_command
    from public.whelping_commands command
    where command.organization_id = v_organization_id
      and command.litter_id = v_litter_id
      and command.client_command_id =
        v_activation.whelping_client_command_id
    for share;

    if not found
      or v_source_command.command_type is distinct from 'record_birth'
      or v_source_command.birth_id is null
      or v_activation.id is distinct from v_state.current_activation_id
      or v_activation.id is distinct from v_state.last_activation_id
    then
      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    v_source_birth_id := v_source_command.birth_id;
    v_target_is_source_birth :=
      p_birth_id is not distinct from v_source_birth_id;

    if v_other_active_birth_count = 0
      and not v_target_is_source_birth
    then
      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    v_reversal_required :=
      v_target_is_source_birth
      and v_other_active_birth_count = 0;
  end if;

  begin
    v_phase := 'core_cancellation';

    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal(
      p_birth_id,
      p_client_command_id,
      p_expected_revision_no,
      p_cancelled_at,
      p_reason
    );

    if v_core_result.outcome = 'success' and v_reversal_required then
      v_phase := 'plan_reversal';
      v_reversal_result :=
        public.reverse_litter_plan_after_cancelled_first_birth_internal(
          v_organization_id,
          v_litter_id,
          v_state.current_activation_id,
          p_client_command_id
        );

      if v_reversal_result ->> 'outcome' is distinct from 'success' then
        raise exception 'first-birth plan reversal did not succeed'
          using errcode = '23514';
      end if;
    end if;

    outcome := v_core_result.outcome;
    birth_id := v_core_result.birth_id;
    animal_id := v_core_result.animal_id;
    event_id := v_core_result.event_id;
    weight_measurement_id := v_core_result.weight_measurement_id;
    revision_no := v_core_result.revision_no;
    event_sequence_no := v_core_result.event_sequence_no;
    replayed := v_core_result.replayed;
    reason := v_core_result.reason;
  exception
    when others then
      get stacked diagnostics v_error_state = returned_sqlstate;

      outcome := 'error';
      birth_id := p_birth_id;
      animal_id := null;
      event_id := null;
      weight_measurement_id := null;
      revision_no := null;
      event_sequence_no := null;
      replayed := false;
      reason := case
        when v_phase = 'plan_reversal'
          and v_error_state in ('22023', '23503', '23514')
        then 'birth_has_downstream_data'
        else 'technical_error'
      end;
  end;

  return next;
exception
  when others then
    outcome := 'error';
    birth_id := p_birth_id;
    animal_id := null;
    event_id := null;
    weight_measurement_id := null;
    revision_no := null;
    event_sequence_no := null;
    replayed := false;
    reason := 'technical_error';
    return next;
end;
$function$;

alter function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) owner to postgres;

revoke all on function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) to authenticated;

revoke all on function public.cancel_whelping_birth_core_internal(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) from public, anon, authenticated;

revoke all on function
  public.reverse_litter_plan_after_cancelled_first_birth_internal(
    uuid,
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated;

do $verify$
declare
  v_public regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_core regprocedure :=
    'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_reversal regprocedure :=
    'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure;
begin
  if v_public::oid <> 23891
    or (
      select pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
        or not procedure.prosecdef
        or procedure.proconfig is distinct from
          array['search_path=""', 'row_security=off']
        or pg_catalog.pg_get_function_identity_arguments(procedure.oid) <>
          'p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text'
        or pg_catalog.pg_get_function_arguments(procedure.oid) <>
          'p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text'
        or pg_catalog.pg_get_function_result(procedure.oid) <>
          'TABLE(outcome text, birth_id uuid, animal_id uuid, event_id uuid, weight_measurement_id uuid, revision_no integer, event_sequence_no integer, replayed boolean, reason text)'
        or pg_catalog.pg_get_expr(procedure.proargdefaults, 0) is not null
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_public
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      v_public,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_public, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.aclexplode(
        (select procedure.proacl
         from pg_catalog.pg_proc procedure
         where procedure.oid = v_public)
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('authenticated', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_reversal,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_reversal, 'EXECUTE')
  then
    raise exception 'birth cancellation wiring postcondition failed';
  end if;
end;
$verify$;

comment on function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) is
  'Public historical cancellation contract. Atomically composes cancellation of the sole source birth with private first-birth planning reversal.';

commit;

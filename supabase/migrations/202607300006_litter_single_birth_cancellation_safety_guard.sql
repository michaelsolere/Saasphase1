begin;

-- ---------------------------------------------------------------------------
-- 1. Rename the historical cancellation implementation without copying it
-- ---------------------------------------------------------------------------

do $rename_core$
declare
  v_signature regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_oid oid := v_signature::oid;
  v_owner oid;
  v_security_definer boolean;
  v_config text[];
  v_acl aclitem[];
  v_defaults text;
  v_result text;
  v_identity_arguments text;
  v_arguments text;
  v_body_sha256 text;
  v_after pg_proc%rowtype;
begin
  if (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'cancel_whelping_birth'
  ) <> 1 then
    raise exception 'cancel_whelping_birth guard failed: expected one overload';
  end if;

  if to_regprocedure(
    'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'
  ) is not null then
    raise exception 'cancel_whelping_birth guard failed: core name already exists';
  end if;

  select
    procedure.proowner,
    procedure.prosecdef,
    procedure.proconfig,
    procedure.proacl,
    pg_get_expr(procedure.proargdefaults, 0),
    pg_get_function_result(procedure.oid),
    pg_get_function_identity_arguments(procedure.oid),
    pg_get_function_arguments(procedure.oid),
    encode(
      digest(
        convert_to(
          regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_owner,
    v_security_definer,
    v_config,
    v_acl,
    v_defaults,
    v_result,
    v_identity_arguments,
    v_arguments,
    v_body_sha256
  from pg_proc procedure
  where procedure.oid = v_oid;

  execute
    'alter function public.cancel_whelping_birth('
    || 'uuid,uuid,integer,timestamptz,text'
    || ') rename to cancel_whelping_birth_core_internal';

  select *
  into v_after
  from pg_proc procedure
  where procedure.oid =
    'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'::regprocedure;

  if v_after.oid is distinct from v_oid
    or v_after.proowner is distinct from v_owner
    or v_after.prosecdef is distinct from v_security_definer
    or v_after.proconfig is distinct from v_config
    or v_after.proacl is distinct from v_acl
    or pg_get_expr(v_after.proargdefaults, 0) is distinct from v_defaults
    or pg_get_function_result(v_after.oid) is distinct from v_result
    or pg_get_function_identity_arguments(v_after.oid)
      is distinct from v_identity_arguments
    or pg_get_function_arguments(v_after.oid) is distinct from v_arguments
    or encode(
      digest(
        convert_to(
          regexp_replace(v_after.prosrc, '\s+', ' ', 'g'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) is distinct from v_body_sha256
  then
    raise exception 'cancel_whelping_birth guard failed: rename changed definition properties';
  end if;
end;
$rename_core$;

revoke all on function public.cancel_whelping_birth_core_internal(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Public transactional wrapper preserving the historical contract
-- ---------------------------------------------------------------------------

create function public.cancel_whelping_birth(
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
  v_active_birth_count integer;
  v_only_active_birth_id uuid;
  v_activation_id uuid;
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

  -- Canonical deterministic row-lock order for this guard:
  -- litter → active births → optional activation.
  perform litter.id
  from public.litters litter
  where litter.organization_id = v_organization_id
    and litter.id = v_litter_id
  for update;

  perform active_birth.id
  from public.whelping_births active_birth
  join public.whelping_sessions session
    on session.organization_id = active_birth.organization_id
   and session.id = active_birth.session_id
  where session.organization_id = v_organization_id
    and session.litter_id = v_litter_id
    and active_birth.cancelled_at is null
  order by active_birth.id
  for update of active_birth;

  select
    count(*)::integer,
    (array_agg(active_birth.id order by active_birth.id))[1]
  into v_active_birth_count, v_only_active_birth_id
  from public.whelping_births active_birth
  join public.whelping_sessions session
    on session.organization_id = active_birth.organization_id
   and session.id = active_birth.session_id
  where session.organization_id = v_organization_id
    and session.litter_id = v_litter_id
    and active_birth.cancelled_at is null;

  select activation.id
  into v_activation_id
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = v_organization_id
    and activation.litter_id = v_litter_id
  for update;

  if v_active_birth_count = 1
    and v_only_active_birth_id = p_birth_id
    and v_activation_id is not null
  then
    reason := 'birth_has_downstream_data';
    return next;
    return;
  end if;

  begin
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

comment on function public.cancel_whelping_birth_core_internal(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) is
  'Historical birth cancellation implementation, renamed without body replacement and callable only by the postgres-owned wrapper.';

comment on function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) is
  'Atomically rejects cancellation of the sole active birth when first-birth planning activation is append-only.';

commit;

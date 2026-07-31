begin;

-- Persist the authoritative effect of a successful birth cancellation in the
-- existing immutable command snapshot. Public and private signatures, OIDs,
-- metadata and the historical nine-field DTO remain unchanged.

create temporary table pg_temp.whelping_birth_cancellation_success_contracts (
  function_name text primary key,
  function_oid oid not null,
  owner_name name not null,
  security_definer boolean not null,
  function_config text[],
  function_acl aclitem[],
  identity_arguments text not null,
  all_arguments text not null,
  function_result text not null,
  argument_defaults text,
  normalized_body_fingerprint text not null
) on commit drop;

insert into pg_temp.whelping_birth_cancellation_success_contracts (
  function_name,
  function_oid,
  owner_name,
  security_definer,
  function_config,
  function_acl,
  identity_arguments,
  all_arguments,
  function_result,
  argument_defaults,
  normalized_body_fingerprint
)
select
  procedure.proname,
  procedure.oid,
  pg_catalog.pg_get_userbyid(procedure.proowner),
  procedure.prosecdef,
  procedure.proconfig,
  procedure.proacl,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid),
  pg_catalog.pg_get_function_arguments(procedure.oid),
  pg_catalog.pg_get_function_result(procedure.oid),
  pg_catalog.pg_get_expr(procedure.proargdefaults, 0),
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
from pg_catalog.pg_proc procedure
where procedure.oid in (
  'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure,
  'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'::regprocedure,
  'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure
);

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
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'cancel_whelping_birth',
        'cancel_whelping_birth_core_internal',
        'reverse_litter_plan_after_cancelled_first_birth_internal'
      )
  ) <> 3
    or (
      select count(*)
      from pg_temp.whelping_birth_cancellation_success_contracts
    ) <> 3
  then
    raise exception 'whelping birth cancellation success overload contract diverged';
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
  )
    or (
      select pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
        or not procedure.prosecdef
        or procedure.proconfig is distinct from
          array['search_path=""', 'row_security=off']
        or pg_catalog.pg_get_function_identity_arguments(procedure.oid) <>
          'p_organization_id uuid, p_litter_id uuid, p_activation_id uuid, p_birth_adjustment_client_command_id uuid'
        or pg_catalog.pg_get_function_arguments(procedure.oid) <>
          'p_organization_id uuid, p_litter_id uuid, p_activation_id uuid, p_birth_adjustment_client_command_id uuid'
        or pg_catalog.pg_get_function_result(procedure.oid) <> 'jsonb'
        or pg_catalog.pg_get_expr(procedure.proargdefaults, 0) is not null
      from pg_catalog.pg_proc procedure
      where procedure.oid = v_reversal
    )
  then
    raise exception 'whelping birth cancellation success function contract diverged';
  end if;

  if (
    select normalized_body_fingerprint <>
      '50a727382bfcfc9fafdfaffb72fd05f5332f8eb3bc104ca2319ed1fd941a7568'
    from pg_temp.whelping_birth_cancellation_success_contracts
    where function_name = 'cancel_whelping_birth'
  )
    or (
      select normalized_body_fingerprint <>
        '96d670397313a8322b3c1c1053369235ba9a74425a088205055a5638f9fe6516'
      from pg_temp.whelping_birth_cancellation_success_contracts
      where function_name = 'cancel_whelping_birth_core_internal'
    )
    or (
      select normalized_body_fingerprint <>
        'b894fea8da207adaf938e1d01aaa4e9481dac7ec8e51ffe235d12a0af270cb74'
      from pg_temp.whelping_birth_cancellation_success_contracts
      where function_name =
        'reverse_litter_plan_after_cancelled_first_birth_internal'
    )
  then
    raise exception 'whelping birth cancellation success body fingerprint diverged';
  end if;

  if not pg_catalog.has_function_privilege(
      'authenticated', v_public, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_public, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_public, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated', v_reversal, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_reversal, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_reversal, 'EXECUTE')
  then
    raise exception 'whelping birth cancellation success ACL contract diverged';
  end if;
end;
$guard$;

create function pg_temp.replace_whelping_success_fragment(
  p_source text,
  p_old text,
  p_new text,
  p_label text
)
returns text
language plpgsql
as $helper$
declare
  v_count integer;
begin
  if p_old = '' then
    raise exception 'empty success replacement fragment: %', p_label;
  end if;

  v_count := (
    length(p_source) - length(replace(p_source, p_old, ''))
  ) / length(p_old);

  if v_count <> 1 then
    raise exception
      'success replacement fragment % expected once, found %',
      p_label,
      v_count;
  end if;

  return replace(p_source, p_old, p_new);
end;
$helper$;

do $rewrite_core$
declare
  v_function regprocedure :=
    'public.cancel_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(v_function)
  into v_definition;

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  v_reason text:=nullif(btrim(p_reason),''); v_before jsonb; v_after jsonb; v_litter_after jsonb;
begin$old$,
    $new$  v_reason text:=nullif(btrim(p_reason),''); v_before jsonb; v_after jsonb; v_litter_after jsonb;
  v_cancellation_success_reason text := nullif(
    pg_catalog.current_setting(
      'app.whelping_birth_cancellation_success_reason',
      true
    ),
    ''
  );
begin
  if v_cancellation_success_reason not in (
    'birth_cancellation_planning_restored',
    'birth_cancellation_planning_preserved',
    'birth_cancellation_no_planning_change'
  ) or v_cancellation_success_reason is null then
    v_cancellation_success_reason :=
      'birth_cancellation_no_planning_change';
  end if;$new$,
    'core success context'
  );

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$    outcome:='success'; animal_id:=v_command.animal_id; event_id:=v_command.event_id;
    weight_measurement_id:=v_command.weight_measurement_id; revision_no:=v_command.resulting_revision_no;
    event_sequence_no:=v_command.event_sequence_no; replayed:=true; return next; return;$old$,
    $new$    if v_command.snapshot_after ->> 'cancellation_success_reason' in (
      'birth_cancellation_planning_restored',
      'birth_cancellation_planning_preserved',
      'birth_cancellation_no_planning_change'
    ) then
      v_cancellation_success_reason :=
        v_command.snapshot_after ->> 'cancellation_success_reason';
    end if;
    outcome:='success'; animal_id:=v_command.animal_id; event_id:=v_command.event_id;
    weight_measurement_id:=v_command.weight_measurement_id; revision_no:=v_command.resulting_revision_no;
    event_sequence_no:=v_command.event_sequence_no; replayed:=true;
    reason:=v_cancellation_success_reason; return next; return;$new$,
    'core replay reason'
  );

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  where b.organization_id=v_org_id and b.id=v_birth.id;
  revision_no:=v_birth.revision_no+1; animal_id:=v_birth.animal_id;$old$,
    $new$  where b.organization_id=v_org_id and b.id=v_birth.id;
  v_after := v_after || jsonb_build_object(
    'cancellation_success_reason',
    v_cancellation_success_reason
  );
  revision_no:=v_birth.revision_no+1; animal_id:=v_birth.animal_id;$new$,
    'core snapshot metadata'
  );

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  outcome:='success'; return next;
exception when others then$old$,
    $new$  outcome:='success'; reason:=v_cancellation_success_reason; return next;
exception when others then$new$,
    'core initial success reason'
  );

  execute v_definition;
end;
$rewrite_core$;

do $rewrite_public$
declare
  v_function regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(v_function)
  into v_definition;

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  v_error_state text;
  v_error_detail text;
begin$old$,
    $new$  v_error_state text;
  v_error_detail text;
  v_cancellation_success_reason text :=
    'birth_cancellation_no_planning_change';
begin$new$,
    'public success variable'
  );

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  then
    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal($old$,
    $new$  then
    perform pg_catalog.set_config(
      'app.whelping_birth_cancellation_success_reason',
      'birth_cancellation_no_planning_change',
      true
    );
    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal($new$,
    'public invalid-input context'
  );

  v_definition := pg_temp.replace_whelping_success_fragment(
    v_definition,
    $old$  end if;

  begin
    v_phase := 'core_cancellation';

    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal($old$,
    $new$  end if;

  if v_reversal_required then
    v_cancellation_success_reason :=
      'birth_cancellation_planning_restored';
  elsif v_state.current_activation_id is not null
    and v_target_is_active
    and not v_target_is_source_birth
    and v_other_active_birth_count > 0
  then
    v_cancellation_success_reason :=
      'birth_cancellation_planning_preserved';
  else
    v_cancellation_success_reason :=
      'birth_cancellation_no_planning_change';
  end if;

  begin
    v_phase := 'core_cancellation';

    perform pg_catalog.set_config(
      'app.whelping_birth_cancellation_success_reason',
      v_cancellation_success_reason,
      true
    );
    select *
    into v_core_result
    from public.cancel_whelping_birth_core_internal($new$,
    'public authoritative reason'
  );

  execute v_definition;
end;
$rewrite_public$;

-- Preserve the historical public grant and make the private boundary explicit.
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
  v_public_source text;
  v_core_source text;
begin
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_temp.whelping_birth_cancellation_success_contracts captured
      on captured.function_name = procedure.proname
    where procedure.oid in (v_public, v_core, v_reversal)
      and (
        procedure.oid is distinct from captured.function_oid
        or pg_catalog.pg_get_userbyid(procedure.proowner) is distinct from
          captured.owner_name
        or procedure.prosecdef is distinct from captured.security_definer
        or procedure.proconfig is distinct from captured.function_config
        or procedure.proacl is distinct from captured.function_acl
        or pg_catalog.pg_get_function_identity_arguments(procedure.oid)
          is distinct from captured.identity_arguments
        or pg_catalog.pg_get_function_arguments(procedure.oid)
          is distinct from captured.all_arguments
        or pg_catalog.pg_get_function_result(procedure.oid)
          is distinct from captured.function_result
        or pg_catalog.pg_get_expr(procedure.proargdefaults, 0)
          is distinct from captured.argument_defaults
        or (
          procedure.oid = v_reversal
          and encode(
            digest(
              convert_to(
                regexp_replace(procedure.prosrc, '\s+', ' ', 'g'),
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          ) is distinct from captured.normalized_body_fingerprint
        )
      )
  )
  then
    raise exception 'whelping birth cancellation success metadata changed';
  end if;

  select procedure.prosrc
  into v_public_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_public;

  select procedure.prosrc
  into v_core_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_core;

  if position('birth_cancellation_planning_restored' in v_public_source) = 0
    or position('birth_cancellation_planning_preserved' in v_public_source) = 0
    or position('birth_cancellation_no_planning_change' in v_public_source) = 0
    or position(
      'app.whelping_birth_cancellation_success_reason'
      in v_public_source
    ) = 0
    or position('birth_cancellation_planning_restored' in v_core_source) = 0
    or position('birth_cancellation_planning_preserved' in v_core_source) = 0
    or position('birth_cancellation_no_planning_change' in v_core_source) = 0
    or position(
      'v_command.snapshot_after ->> ''cancellation_success_reason'''
      in v_core_source
    ) = 0
    or position(
      '''cancellation_success_reason'', v_cancellation_success_reason'
      in regexp_replace(v_core_source, '\s+', ' ', 'g')
    ) = 0
  then
    raise exception 'whelping birth cancellation success verification failed';
  end if;

  if not pg_catalog.has_function_privilege(
      'authenticated', v_public, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_public, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_public, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_core, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated', v_reversal, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_reversal, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_reversal, 'EXECUTE')
  then
    raise exception 'whelping birth cancellation success ACL postcondition failed';
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
  'Public historical nine-field cancellation contract. Successful cancellations expose a stable planning effect code through reason; private details remain hidden.';

commit;

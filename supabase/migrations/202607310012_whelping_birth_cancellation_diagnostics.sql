begin;

-- Enrich the historical cancellation reason without changing any public or
-- private signature. The installed definitions are rewritten only through
-- strictly counted fragments so a divergent predecessor fails atomically.

create temporary table pg_temp.whelping_birth_cancellation_diagnostic_contracts (
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

insert into pg_temp.whelping_birth_cancellation_diagnostic_contracts (
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
      from pg_temp.whelping_birth_cancellation_diagnostic_contracts
    ) <> 3
  then
    raise exception 'whelping birth cancellation diagnostic overload contract diverged';
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
    raise exception 'whelping birth cancellation diagnostic function contract diverged';
  end if;

  if (
    select normalized_body_fingerprint <>
      'bf6d4d6f00ed357f9b0ead21e96780353d6f833aab0e231549451ec082eec18f'
    from pg_temp.whelping_birth_cancellation_diagnostic_contracts
    where function_name = 'cancel_whelping_birth'
  )
    or (
      select normalized_body_fingerprint <>
        '96d670397313a8322b3c1c1053369235ba9a74425a088205055a5638f9fe6516'
      from pg_temp.whelping_birth_cancellation_diagnostic_contracts
      where function_name = 'cancel_whelping_birth_core_internal'
    )
    or (
      select normalized_body_fingerprint <>
        'baf917516c89e61414b61a4f1d14c4aa536803636af62263536f73c05640d61b'
      from pg_temp.whelping_birth_cancellation_diagnostic_contracts
      where function_name =
        'reverse_litter_plan_after_cancelled_first_birth_internal'
    )
  then
    raise exception 'whelping birth cancellation diagnostic body fingerprint diverged';
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
    raise exception 'whelping birth cancellation diagnostic ACL contract diverged';
  end if;
end;
$guard$;

create function pg_temp.replace_whelping_diagnostic_fragment(
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
    raise exception 'empty diagnostic replacement fragment: %', p_label;
  end if;

  v_count := (
    length(p_source) - length(replace(p_source, p_old, ''))
  ) / length(p_old);

  if v_count <> 1 then
    raise exception
      'diagnostic replacement fragment % expected once, found %',
      p_label,
      v_count;
  end if;

  return replace(p_source, p_old, p_new);
end;
$helper$;

do $rewrite_reversal$
declare
  v_function regprocedure :=
    'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(v_function)
  into v_definition;

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'invalid first-birth plan reversal input'
      using errcode = '22023';$old$,
    $new$raise exception 'invalid first-birth plan reversal input'
      using
        errcode = '22023',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'invalid input'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'client_command_conflict'
        using errcode = '23514';$old$,
    $new$raise exception 'client_command_conflict'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'replay conflict'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth activation already reversed'
      using errcode = '23514';$old$,
    $new$raise exception 'first-birth activation already reversed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'activation already reversed'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth plan reversal litter not found'
      using errcode = '23503';$old$,
    $new$raise exception 'first-birth plan reversal litter not found'
      using
        errcode = '23503',
        detail = 'WHELPING_REVERSAL_ENTITY_MISSING';$new$,
    'litter missing'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth activation is not current'
      using errcode = '23514';$old$,
    $new$raise exception 'first-birth activation is not current'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'activation state'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$  if not found
    or v_litter.actual_birth_date is distinct from
      v_activation.actual_birth_date
    or exists (
      select 1
      from public.litter_plan_actual_birth_activation_deactivations deactivation
      where deactivation.organization_id = p_organization_id
        and deactivation.activation_id = p_activation_id
    )
  then
    raise exception 'first-birth activation reversal invariant failed'
      using errcode = '23514';
  end if;$old$,
    $new$  if not found then
    raise exception 'first-birth activation reversal invariant failed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';
  end if;

  if v_litter.actual_birth_date is distinct from
    v_activation.actual_birth_date
  then
    raise exception 'first-birth activation date diverged'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_BIRTH_DATE_CHANGED';
  end if;

  if exists (
    select 1
    from public.litter_plan_actual_birth_activation_deactivations deactivation
    where deactivation.organization_id = p_organization_id
      and deactivation.activation_id = p_activation_id
  ) then
    raise exception 'first-birth activation reversal invariant failed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';
  end if;$new$,
    'activation invariant split'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth reversal snapshot missing'
      using errcode = '23514';$old$,
    $new$raise exception 'first-birth reversal snapshot missing'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'snapshot missing'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth reversal snapshot counters disagree'
      using errcode = '23514';$old$,
    $new$raise exception 'first-birth reversal snapshot counters disagree'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'snapshot counters'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'first-birth activation source command invariant failed'
      using errcode = '23514';$old$,
    $new$raise exception 'first-birth activation source command invariant failed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'source command'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'cancel-birth adjustment command invariant failed'
      using errcode = '23514';$old$,
    $new$raise exception 'cancel-birth adjustment command invariant failed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'cancellation command'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'cancelled source birth state invariant failed'
      using errcode = '23514';$old$,
    $new$raise exception 'cancelled source birth state invariant failed'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'cancelled birth snapshot'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'active birth remains after source cancellation'
      using errcode = '23514';$old$,
    $new$raise exception 'active birth remains after source cancellation'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT';$new$,
    'active birth remains'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'no-plan first-birth reversal snapshot is not empty'
        using errcode = '23514';$old$,
    $new$raise exception 'no-plan first-birth reversal snapshot is not empty'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'no-plan snapshot'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$    if not found
      or v_plan.status is distinct from 'active'
      or v_plan.revision is distinct from v_activation.result_plan_revision
    then
      raise exception 'first-birth reversal plan revision diverged'
        using errcode = '23514';
    end if;$old$,
    $new$    if not found then
      raise exception 'first-birth reversal plan missing'
        using
          errcode = '23503',
          detail = 'WHELPING_REVERSAL_ENTITY_MISSING';
    end if;

    if v_plan.status is distinct from 'active'
      or v_plan.revision is distinct from v_activation.result_plan_revision
    then
      raise exception 'first-birth reversal plan revision diverged'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_PLANNING_MODIFIED';
    end if;$new$,
    'plan missing versus modified'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$    if exists (
      select 1
      from public.litter_plan_items item
      where item.organization_id = p_organization_id
        and item.litter_plan_id = v_plan.id
        and item.created_at > v_activation.created_at
    )
      or exists (
        select 1
        from public.litter_plan_series series
        where series.organization_id = p_organization_id
          and series.litter_plan_id = v_plan.id
          and series.created_at > v_activation.created_at
      )
      or exists (
        select 1
        from public.litter_care_tasks task
        where task.organization_id = p_organization_id
          and task.litter_id = p_litter_id
          and task.created_at > v_activation.created_at
          and not exists (
            select 1
            from public.litter_plan_actual_birth_activation_reversal_changes change
            where change.organization_id = p_organization_id
              and change.snapshot_id = v_snapshot.id
              and change.entity_kind = 'litter_care_task'
              and change.entity_id = task.id
          )
      )
    then
      raise exception 'post-activation planning data is not reversible'
        using errcode = '23514';
    end if;$old$,
    $new$    if exists (
      select 1
      from public.litter_plan_items item
      where item.organization_id = p_organization_id
        and item.litter_plan_id = v_plan.id
        and item.created_at > v_activation.created_at
    )
      or exists (
        select 1
        from public.litter_plan_series series
        where series.organization_id = p_organization_id
          and series.litter_plan_id = v_plan.id
          and series.created_at > v_activation.created_at
      )
    then
      raise exception 'post-activation planning structure is not reversible'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_PLANNING_MODIFIED';
    end if;

    if exists (
      select 1
      from public.litter_care_tasks task
      where task.organization_id = p_organization_id
        and task.litter_id = p_litter_id
        and task.created_at > v_activation.created_at
        and not exists (
          select 1
          from public.litter_plan_actual_birth_activation_reversal_changes change
          where change.organization_id = p_organization_id
            and change.snapshot_id = v_snapshot.id
            and change.entity_kind = 'litter_care_task'
            and change.entity_id = task.id
        )
    ) then
      raise exception 'post-activation planning task is not reversible'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_TASK_ADDED';
    end if;$new$,
    'post-activation structure and task split'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'post-activation planning data is not reversible'
      using errcode = '23514';$old$,
    $new$raise exception 'post-activation planning task is not reversible'
      using
        errcode = '23514',
        detail = 'WHELPING_REVERSAL_TASK_ADDED';$new$,
    'global post-activation task'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'unsupported first-birth reversal entity kind'
        using errcode = '23514';$old$,
    $new$raise exception 'unsupported first-birth reversal entity kind'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'unsupported entity kind'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$    if v_current is null
      or v_current is distinct from v_change.snapshot_after
    then
      raise exception
        'first-birth reversal entity state diverged: % %',
        v_change.entity_kind,
        v_change.entity_id
        using errcode = '23514';
    end if;$old$,
    $new$    if v_current is null then
      raise exception 'first-birth reversal entity is missing'
        using
          errcode = '23503',
          detail = 'WHELPING_REVERSAL_ENTITY_MISSING';
    end if;

    if v_current is distinct from v_change.snapshot_after then
      raise exception 'first-birth reversal entity state diverged'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_PLANNING_MODIFIED';
    end if;$new$,
    'entity missing versus modified'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'only activation-created tasks can be deleted'
          using errcode = '23514';$old$,
    $new$raise exception 'only activation-created tasks can be deleted'
          using
            errcode = '23514',
            detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'invalid inserted entity'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception
          'activation-created task has an external dependency: %',
          v_change.entity_id
          using errcode = '23514';$old$,
    $new$raise exception 'activation-created task has an external dependency'
          using
            errcode = '23514',
            detail = 'WHELPING_REVERSAL_DEPENDENCY_EXISTS';$new$,
    'protected dependency'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$raise exception 'unsupported first-birth reversal change kind'
        using errcode = '23514';$old$,
    $new$raise exception 'unsupported first-birth reversal change kind'
        using
          errcode = '23514',
          detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE';$new$,
    'unsupported change kind'
  );

  execute v_definition;
end;
$rewrite_reversal$;

do $rewrite_public$
declare
  v_function regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(v_function)
  into v_definition;

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$  v_error_state text;
begin$old$,
    $new$  v_error_state text;
  v_error_detail text;
begin$new$,
    'public diagnostic variable'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$    if v_state.last_activation_id is distinct from
      v_state.current_activation_id
    then
      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;$old$,
    $new$    if v_state.last_activation_id is distinct from
      v_state.current_activation_id
    then
      reason := 'birth_planning_state_inconsistent';
      return next;
      return;
    end if;$new$,
    'public inconsistent activation projection'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    select command.*$old$,
    $new$      reason := 'birth_planning_state_inconsistent';
      return next;
      return;
    end if;

    select command.*$new$,
    'public missing activation'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    v_source_birth_id$old$,
    $new$      reason := 'birth_planning_state_inconsistent';
      return next;
      return;
    end if;

    v_source_birth_id$new$,
    'public invalid source command'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$      reason := 'birth_has_downstream_data';
      return next;
      return;
    end if;

    v_reversal_required$old$,
    $new$      reason := 'birth_planning_state_inconsistent';
      return next;
      return;
    end if;

    v_reversal_required$new$,
    'public incompatible source birth'
  );

  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$      get stacked diagnostics v_error_state = returned_sqlstate;$old$,
    $new$      get stacked diagnostics
        v_error_state = returned_sqlstate,
        v_error_detail = pg_exception_detail;$new$,
    'stacked diagnostic transport'
  );
  v_definition := pg_temp.replace_whelping_diagnostic_fragment(
    v_definition,
    $old$      reason := case
        when v_phase = 'plan_reversal'
          and v_error_state in ('22023', '23503', '23514')
        then 'birth_has_downstream_data'
        else 'technical_error'
      end;$old$,
    $new$      reason := case
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_PLANNING_MODIFIED'
        then 'birth_planning_modified'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_TASK_ADDED'
        then 'birth_planning_task_added'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_DEPENDENCY_EXISTS'
        then 'birth_planning_dependency_exists'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_BIRTH_DATE_CHANGED'
        then 'birth_date_changed_after_activation'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_HISTORY_INCOMPLETE'
        then 'birth_planning_history_incomplete'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_ENTITY_MISSING'
        then 'birth_planning_entity_missing'
        when v_phase = 'plan_reversal'
          and v_error_detail = 'WHELPING_REVERSAL_STATE_INCONSISTENT'
        then 'birth_planning_state_inconsistent'
        when v_phase = 'plan_reversal'
          and v_error_state in ('22023', '23503', '23514')
        then 'birth_has_downstream_data'
        else 'technical_error'
      end;$new$,
    'public diagnostic whitelist'
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
  v_reversal_source text;
begin
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_temp.whelping_birth_cancellation_diagnostic_contracts captured
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
          procedure.oid = v_core
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
    raise exception 'whelping birth cancellation diagnostic metadata changed';
  end if;

  select procedure.prosrc
  into v_public_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_public;

  select procedure.prosrc
  into v_reversal_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_reversal;

  if position('v_error_detail = pg_exception_detail' in v_public_source) = 0
    or position('birth_planning_modified' in v_public_source) = 0
    or position('birth_planning_task_added' in v_public_source) = 0
    or position('birth_planning_dependency_exists' in v_public_source) = 0
    or position('birth_date_changed_after_activation' in v_public_source) = 0
    or position('birth_planning_history_incomplete' in v_public_source) = 0
    or position('birth_planning_entity_missing' in v_public_source) = 0
    or position('birth_planning_state_inconsistent' in v_public_source) = 0
    or position('then ''birth_has_downstream_data''' in v_public_source) = 0
    or position('else ''technical_error''' in v_public_source) = 0
    or position('reason := v_error_detail' in v_public_source) > 0
  then
    raise exception 'whelping birth cancellation public whitelist verification failed';
  end if;

  if position('WHELPING_REVERSAL_PLANNING_MODIFIED' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_TASK_ADDED' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_DEPENDENCY_EXISTS' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_BIRTH_DATE_CHANGED' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_HISTORY_INCOMPLETE' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_ENTITY_MISSING' in v_reversal_source) = 0
    or position('WHELPING_REVERSAL_STATE_INCONSISTENT' in v_reversal_source) = 0
  then
    raise exception 'whelping birth cancellation private diagnostic verification failed';
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
    raise exception 'whelping birth cancellation diagnostic ACL postcondition failed';
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
  'Public historical nine-field cancellation contract. Returns safe planning refusal reasons from the authoritative private reversal branch without exposing internal diagnostics.';

commit;

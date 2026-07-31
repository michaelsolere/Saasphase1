-- Refuse a first-birth planning reversal when any litter task created after
-- activation is absent from the activation snapshot. A task can be manual,
-- generated, ad hoc, or series-derived without belonging to the activated
-- plan, so plan-item membership is not a safe boundary.

do $migration$
declare
  v_function regprocedure :=
    'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure;
  v_definition text;
  v_updated_definition text;
  v_old_fragment text := $old$
      or exists (
        select 1
        from public.litter_care_tasks task
        where task.organization_id = p_organization_id
          and task.litter_id = p_litter_id
          and task.litter_plan_item_id in (
            select item.id
            from public.litter_plan_items item
            where item.organization_id = p_organization_id
              and item.litter_plan_id = v_plan.id
          )
          and task.created_at > v_activation.created_at
      )
$old$;
  v_new_fragment text := $new$
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
$new$;
  v_preflight_marker text := $marker$
  end if;

  -- Full-row equality and all deletion dependencies are checked before the
$marker$;
  v_preflight_replacement text := $replacement$
  end if;

  -- A litter task does not have to belong to a plan or plan item. Refuse every
  -- post-activation task that the activation snapshot does not represent,
  -- including manual, generic, generated, ad hoc, and series-derived rows.
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
    raise exception 'post-activation planning data is not reversible'
      using errcode = '23514';
  end if;

  -- Full-row equality and all deletion dependencies are checked before the
$replacement$;
  v_oid oid;
  v_owner oid;
  v_security_definer boolean;
  v_config text[];
  v_acl aclitem[];
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'reverse_litter_plan_after_cancelled_first_birth_internal'
  ) <> 1 then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal overload contract diverged';
  end if;

  select
    procedure.oid,
    procedure.proowner,
    procedure.prosecdef,
    procedure.proconfig,
    procedure.proacl,
    pg_catalog.pg_get_functiondef(procedure.oid)
  into
    v_oid,
    v_owner,
    v_security_definer,
    v_config,
    v_acl,
    v_definition
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_function;

  if pg_catalog.pg_get_function_identity_arguments(v_function) <>
    'p_organization_id uuid, p_litter_id uuid, p_activation_id uuid, p_birth_adjustment_client_command_id uuid'
  then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal signature diverged';
  end if;

  if pg_catalog.pg_get_function_result(v_function) <> 'jsonb'
    or pg_catalog.pg_get_userbyid(v_owner) <> 'postgres'
    or not v_security_definer
    or v_config is distinct from array['search_path=""', 'row_security=off']
  then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal contract diverged';
  end if;

  if (
    (
      length(v_definition) -
      length(replace(v_definition, v_old_fragment, ''))
    ) / length(v_old_fragment)
    +
    (
      length(v_definition) -
      length(replace(v_definition, v_new_fragment, ''))
    ) / length(v_new_fragment)
  ) <> 1 then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal guard source diverged';
  end if;

  v_updated_definition := case
    when position(v_old_fragment in v_definition) > 0
      then replace(v_definition, v_old_fragment, v_new_fragment)
    else v_definition
  end;

  if (
    length(v_updated_definition) -
    length(replace(v_updated_definition, v_preflight_marker, ''))
  ) / length(v_preflight_marker) <> 1 then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal preflight marker diverged';
  end if;

  v_updated_definition := replace(
    v_updated_definition,
    v_preflight_marker,
    v_preflight_replacement
  );
  execute v_updated_definition;

  if (
    select procedure.oid <> v_oid
      or procedure.proowner <> v_owner
      or procedure.prosecdef is distinct from v_security_definer
      or procedure.proconfig is distinct from v_config
      or procedure.proacl is distinct from v_acl
    from pg_catalog.pg_proc procedure
    where procedure.oid = v_function
  ) then
    raise exception
      'reverse_litter_plan_after_cancelled_first_birth_internal metadata changed';
  end if;
end;
$migration$;

revoke all on function
  public.reverse_litter_plan_after_cancelled_first_birth_internal(
    uuid,
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated;

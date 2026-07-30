-- LITTER-ACTUAL-BIRTH-ACTIVATION-LIFECYCLE-01
-- Preserve every historical first-birth activation while introducing an
-- audited activation/deactivation lineage and a private current-state
-- projection. Public cancellation remains guarded and does not deactivate.

begin;

-- ---------------------------------------------------------------------------
-- 1. Evolve the append-only activation registry into a lineage
-- ---------------------------------------------------------------------------

alter table public.litter_plan_actual_birth_activations
  drop constraint litter_plan_actual_birth_activations_org_litter_key,
  add column previous_activation_id uuid,
  add constraint litter_plan_actual_birth_activations_org_litter_id_key
    unique (organization_id, litter_id, id),
  add constraint litter_plan_actual_birth_activations_previous_fk
    foreign key (organization_id, litter_id, previous_activation_id)
    references public.litter_plan_actual_birth_activations (
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  add constraint litter_plan_actual_birth_activations_one_successor_key
    unique (organization_id, litter_id, previous_activation_id),
  add constraint litter_plan_actual_birth_activations_previous_not_self_check
    check (previous_activation_id is null or previous_activation_id <> id);

-- ---------------------------------------------------------------------------
-- 2. Private operational projection of the current activation
-- ---------------------------------------------------------------------------

create table public.litter_plan_actual_birth_activation_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  current_activation_id uuid,
  last_activation_id uuid not null,
  revision integer not null default 0,
  modified_at timestamptz not null default statement_timestamp(),
  modified_by uuid not null
    references public.profiles(id) on delete restrict,
  constraint litter_plan_actual_birth_activation_states_org_litter_key
    unique (organization_id, litter_id),
  constraint litter_plan_actual_birth_activation_states_org_litter_id_key
    unique (organization_id, litter_id, id),
  constraint litter_plan_actual_birth_activation_states_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters(organization_id, id) on delete restrict,
  constraint litter_plan_actual_birth_activation_states_current_fk
    foreign key (organization_id, litter_id, current_activation_id)
    references public.litter_plan_actual_birth_activations (
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_plan_actual_birth_activation_states_last_fk
    foreign key (organization_id, litter_id, last_activation_id)
    references public.litter_plan_actual_birth_activations (
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_plan_actual_birth_activation_states_revision_check
    check (revision >= 0),
  constraint litter_plan_actual_birth_activation_states_current_last_check
    check (
      current_activation_id is null
      or current_activation_id = last_activation_id
    )
);

alter table public.litter_plan_actual_birth_activation_states
  enable row level security;

revoke all on table public.litter_plan_actual_birth_activation_states
from public, anon, authenticated;

-- Existing activation rows are neither updated nor rewritten. The projection
-- is created separately and points to each historical activation as current.
insert into public.litter_plan_actual_birth_activation_states (
  organization_id,
  litter_id,
  current_activation_id,
  last_activation_id,
  revision,
  modified_at,
  modified_by
)
select
  activation.organization_id,
  activation.litter_id,
  activation.id,
  activation.id,
  0,
  activation.created_at,
  activation.created_by
from public.litter_plan_actual_birth_activations activation;

-- ---------------------------------------------------------------------------
-- 3. Private append-only deactivation registry
-- ---------------------------------------------------------------------------

create table public.litter_plan_actual_birth_activation_deactivations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  activation_id uuid not null,
  birth_adjustment_client_command_id uuid not null,
  deactivated_at timestamptz not null,
  reason text not null,
  previous_state_revision integer not null,
  resulting_state_revision integer not null,
  result jsonb not null default '{}'::jsonb,
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint litter_plan_actual_birth_activation_deactivations_org_id_key
    unique (organization_id, id),
  constraint litter_plan_birth_deactivations_activation_key
    unique (organization_id, litter_id, activation_id),
  constraint litter_plan_actual_birth_activation_deactivations_command_key
    unique (organization_id, birth_adjustment_client_command_id),
  constraint litter_plan_actual_birth_activation_deactivations_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters(organization_id, id) on delete restrict,
  constraint litter_plan_actual_birth_activation_deactivations_activation_fk
    foreign key (organization_id, litter_id, activation_id)
    references public.litter_plan_actual_birth_activations (
      organization_id,
      litter_id,
      id
    )
    on delete restrict,
  constraint litter_plan_actual_birth_activation_deactivations_command_fk
    foreign key (organization_id, birth_adjustment_client_command_id)
    references public.whelping_birth_adjustment_commands (
      organization_id,
      client_command_id
    )
    on delete restrict,
  constraint litter_plan_actual_birth_activation_deactivations_date_check
    check (pg_catalog.isfinite(deactivated_at)),
  constraint litter_plan_actual_birth_activation_deactivations_reason_check
    check (
      reason = btrim(reason)
      and char_length(reason) between 1 and 500
    ),
  constraint litter_plan_birth_deactivations_revision_check
    check (
      previous_state_revision >= 0
      and resulting_state_revision = previous_state_revision + 1
    ),
  constraint litter_plan_actual_birth_activation_deactivations_result_check
    check (jsonb_typeof(result) = 'object')
);

create or replace function public.litter_plan_actual_birth_activation_deactivations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  raise exception 'litter plan actual birth activation deactivations are append-only'
    using errcode = '55000';
end;
$function$;

create trigger litter_plan_actual_birth_activation_deactivations_append_only
before update or delete
on public.litter_plan_actual_birth_activation_deactivations
for each row
execute function public.litter_plan_actual_birth_activation_deactivations_immutable();

alter table public.litter_plan_actual_birth_activation_deactivations
  enable row level security;

revoke all on table public.litter_plan_actual_birth_activation_deactivations
from public, anon, authenticated;

revoke all on function public.litter_plan_actual_birth_activation_deactivations_immutable()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Narrow private lifecycle helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_litter_plan_actual_birth_activation_id_internal(
  p_organization_id uuid,
  p_litter_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select state.current_activation_id
  from public.litter_plan_actual_birth_activation_states state
  where state.organization_id = p_organization_id
    and state.litter_id = p_litter_id;
$function$;

revoke all on function public.current_litter_plan_actual_birth_activation_id_internal(
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function public.advance_litter_plan_actual_birth_activation_state_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_whelping_client_command_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_activation public.litter_plan_actual_birth_activations%rowtype;
  v_state public.litter_plan_actual_birth_activation_states%rowtype;
begin
  select activation.*
  into strict v_activation
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = p_organization_id
    and activation.litter_id = p_litter_id
    and activation.whelping_client_command_id =
      p_whelping_client_command_id;

  select state.*
  into v_state
  from public.litter_plan_actual_birth_activation_states state
  where state.organization_id = p_organization_id
    and state.litter_id = p_litter_id
  for update;

  if found then
    if v_state.current_activation_id is not null
      or v_state.last_activation_id
        is distinct from v_activation.previous_activation_id
    then
      raise exception 'first-birth activation state progression conflict'
        using errcode = '23514';
    end if;

    update public.litter_plan_actual_birth_activation_states state
    set
      current_activation_id = v_activation.id,
      last_activation_id = v_activation.id,
      revision = state.revision + 1,
      modified_at = statement_timestamp(),
      modified_by = p_actor_id
    where state.id = v_state.id;
  else
    if v_activation.previous_activation_id is not null then
      raise exception 'first-birth activation predecessor state missing'
        using errcode = '23514';
    end if;

    insert into public.litter_plan_actual_birth_activation_states (
      organization_id,
      litter_id,
      current_activation_id,
      last_activation_id,
      revision,
      modified_by
    ) values (
      p_organization_id,
      p_litter_id,
      v_activation.id,
      v_activation.id,
      0,
      p_actor_id
    );
  end if;
end;
$function$;

revoke all on function public.advance_litter_plan_actual_birth_activation_state_internal(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function public.deactivate_litter_plan_actual_birth_activation_internal(
  p_organization_id uuid,
  p_litter_id uuid,
  p_activation_id uuid,
  p_birth_adjustment_client_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_state public.litter_plan_actual_birth_activation_states%rowtype;
  v_activation public.litter_plan_actual_birth_activations%rowtype;
  v_adjustment public.whelping_birth_adjustment_commands%rowtype;
  v_existing
    public.litter_plan_actual_birth_activation_deactivations%rowtype;
  v_result jsonb;
begin
  if p_organization_id is null
    or p_litter_id is null
    or p_activation_id is null
    or p_birth_adjustment_client_command_id is null
  then
    raise exception 'invalid first-birth activation deactivation input'
      using errcode = '22023';
  end if;

  perform public.acquire_litter_plan_mutation_lock(
    p_organization_id,
    p_litter_id
  );

  perform litter.id
  from public.litters litter
  where litter.organization_id = p_organization_id
    and litter.id = p_litter_id
  for update;

  if not found then
    raise exception 'first-birth activation deactivation litter not found'
      using errcode = '23503';
  end if;

  select state.*
  into v_state
  from public.litter_plan_actual_birth_activation_states state
  where state.organization_id = p_organization_id
    and state.litter_id = p_litter_id
  for update;

  select deactivation.*
  into v_existing
  from public.litter_plan_actual_birth_activation_deactivations deactivation
  where deactivation.organization_id = p_organization_id
    and deactivation.birth_adjustment_client_command_id =
      p_birth_adjustment_client_command_id;

  if found then
    if v_existing.litter_id is distinct from p_litter_id
      or v_existing.activation_id is distinct from p_activation_id
    then
      raise exception 'client_command_conflict'
        using errcode = '23514';
    end if;

    return v_existing.result;
  end if;

  if v_state.id is null
    or v_state.current_activation_id is null
    or v_state.current_activation_id is distinct from p_activation_id
    or v_state.last_activation_id is distinct from p_activation_id
  then
    raise exception 'first-birth activation is not current'
      using errcode = '23514';
  end if;

  select activation.*
  into v_activation
  from public.litter_plan_actual_birth_activations activation
  where activation.organization_id = p_organization_id
    and activation.litter_id = p_litter_id
    and activation.id = p_activation_id
  for share;

  if not found then
    raise exception 'current first-birth activation invariant failed'
      using errcode = '23514';
  end if;

  select adjustment.*
  into v_adjustment
  from public.whelping_birth_adjustment_commands adjustment
  where adjustment.organization_id = p_organization_id
    and adjustment.client_command_id =
      p_birth_adjustment_client_command_id
  for update;

  if not found
    or v_adjustment.litter_id is distinct from p_litter_id
    or v_adjustment.command_type is distinct from 'cancel_birth'
    or v_adjustment.requested_cancelled_at is null
    or v_adjustment.reason is null
    or v_adjustment.created_by is null
    or (v_adjustment.snapshot_after #>> '{birth,cancelled_at}')::timestamptz
      is distinct from v_adjustment.requested_cancelled_at
    or (v_adjustment.snapshot_after #>> '{birth,cancelled_by}')::uuid
      is distinct from v_adjustment.created_by
    or v_adjustment.snapshot_after #>> '{birth,cancellation_reason}'
      is distinct from v_adjustment.reason
  then
    raise exception 'cancel-birth adjustment command invariant failed'
      using errcode = '23514';
  end if;

  v_result := jsonb_build_object(
    'outcome', 'success',
    'activationId', p_activation_id,
    'currentActivationId', null,
    'lastActivationId', p_activation_id,
    'previousStateRevision', v_state.revision,
    'resultingStateRevision', v_state.revision + 1
  );

  insert into public.litter_plan_actual_birth_activation_deactivations (
    organization_id,
    litter_id,
    activation_id,
    birth_adjustment_client_command_id,
    deactivated_at,
    reason,
    previous_state_revision,
    resulting_state_revision,
    result,
    created_by
  ) values (
    p_organization_id,
    p_litter_id,
    p_activation_id,
    p_birth_adjustment_client_command_id,
    v_adjustment.requested_cancelled_at,
    v_adjustment.reason,
    v_state.revision,
    v_state.revision + 1,
    v_result,
    v_adjustment.created_by
  );

  update public.litter_plan_actual_birth_activation_states state
  set
    current_activation_id = null,
    revision = state.revision + 1,
    modified_at = statement_timestamp(),
    modified_by = v_adjustment.created_by
  where state.id = v_state.id;

  return v_result;
end;
$function$;

revoke all on function public.deactivate_litter_plan_actual_birth_activation_internal(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Adapt first-birth activation while preserving its historical signature
-- ---------------------------------------------------------------------------

do $adapt_activation$
declare
  v_signature regprocedure :=
    'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure;
  v_oid oid := v_signature::oid;
  v_definition text := pg_get_functiondef(v_signature);
  v_fragment text;
  v_replacement text;
  v_occurrences integer;
begin
  v_fragment := E'declare\n  v_existing public.litter_plan_actual_birth_activations%rowtype;\n  v_plan public.litter_plans%rowtype;';
  v_replacement := E'declare\n  v_existing public.litter_plan_actual_birth_activations%rowtype;\n  v_state public.litter_plan_actual_birth_activation_states%rowtype;\n  v_previous_activation_id uuid;\n  v_plan public.litter_plans%rowtype;';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal declaration guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'  select activation.*\n  into v_existing\n  from public.litter_plan_actual_birth_activations activation\n  where activation.organization_id = p_organization_id\n    and activation.litter_id = p_litter_id;\n\n  if found then\n    if v_existing.actual_birth_date is distinct from p_actual_birth_date then\n      raise exception ''first-birth planning activation date conflict''\n        using errcode = ''23514'';\n    end if;\n    return v_existing.result;\n  end if;\n\n  if not exists (\n    select 1\n    from public.litters litter\n    where litter.organization_id = p_organization_id\n      and litter.id = p_litter_id\n      and litter.deleted_at is null\n      and litter.actual_birth_date = p_actual_birth_date\n  ) then\n    raise exception ''first-birth planning activation litter invariant failed''\n      using errcode = ''23514'';\n  end if;\n\n';
  v_replacement := E'  -- Replays are resolved by the immutable birth command before any lock.\n  select activation.*\n  into v_existing\n  from public.litter_plan_actual_birth_activations activation\n  where activation.organization_id = p_organization_id\n    and activation.whelping_client_command_id =\n      p_whelping_client_command_id;\n\n  if found then\n    if v_existing.litter_id is distinct from p_litter_id then\n      raise exception ''client_command_conflict''\n        using errcode = ''23514'';\n    end if;\n    return v_existing.result;\n  end if;\n\n  perform public.acquire_litter_plan_mutation_lock(\n    p_organization_id,\n    p_litter_id\n  );\n\n  perform litter.id\n  from public.litters litter\n  where litter.organization_id = p_organization_id\n    and litter.id = p_litter_id\n    and litter.deleted_at is null\n    and litter.actual_birth_date = p_actual_birth_date\n  for update;\n\n  if not found then\n    raise exception ''first-birth planning activation litter invariant failed''\n      using errcode = ''23514'';\n  end if;\n\n  select state.*\n  into v_state\n  from public.litter_plan_actual_birth_activation_states state\n  where state.organization_id = p_organization_id\n    and state.litter_id = p_litter_id\n  for update;\n\n  if found then\n    v_previous_activation_id := v_state.last_activation_id;\n\n    if v_state.current_activation_id is not null then\n      select activation.*\n      into v_existing\n      from public.litter_plan_actual_birth_activations activation\n      where activation.organization_id = p_organization_id\n        and activation.litter_id = p_litter_id\n        and activation.id = v_state.current_activation_id\n      for share;\n\n      if not found then\n        raise exception ''current first-birth activation invariant failed''\n          using errcode = ''23514'';\n      end if;\n\n      raise exception ''first-birth planning activation conflict''\n        using errcode = ''23514'';\n    end if;\n  else\n    if exists (\n      select 1\n      from public.litter_plan_actual_birth_activations activation\n      where activation.organization_id = p_organization_id\n        and activation.litter_id = p_litter_id\n    ) then\n      raise exception ''first-birth activation state projection missing''\n        using errcode = ''23514'';\n    end if;\n\n    v_previous_activation_id := null;\n  end if;\n\n';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal lookup guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'      whelping_client_command_id,\n      actual_birth_date,';
  v_replacement := E'      whelping_client_command_id,\n      previous_activation_id,\n      actual_birth_date,';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal no-plan insert-column guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'    whelping_client_command_id,\n    actual_birth_date,';
  v_replacement := E'    whelping_client_command_id,\n    previous_activation_id,\n    actual_birth_date,';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal plan insert-column guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'      p_whelping_client_command_id,\n      p_actual_birth_date,';
  v_replacement := E'      p_whelping_client_command_id,\n      v_previous_activation_id,\n      p_actual_birth_date,';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal no-plan insert-value guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'    p_whelping_client_command_id,\n    p_actual_birth_date,';
  v_replacement := E'    p_whelping_client_command_id,\n    v_previous_activation_id,\n    p_actual_birth_date,';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal plan insert-value guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'      p_actor_id\n    );\n\n    return v_result;\n  end if;';
  v_replacement := E'      p_actor_id\n    );\n\n    perform public.advance_litter_plan_actual_birth_activation_state_internal(\n      p_organization_id,\n      p_litter_id,\n      p_whelping_client_command_id,\n      p_actor_id\n    );\n\n    return v_result;\n  end if;';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal no-plan state guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  v_fragment := E'    p_actor_id\n  );\n\n  return v_result;\nend;';
  v_replacement := E'    p_actor_id\n  );\n\n  perform public.advance_litter_plan_actual_birth_activation_state_internal(\n    p_organization_id,\n    p_litter_id,\n    p_whelping_client_command_id,\n    p_actor_id\n  );\n\n  return v_result;\nend;';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'activate_litter_plan_on_first_birth_internal plan state guard failed: %',
      v_occurrences;
  end if;
  v_definition := replace(v_definition, v_fragment, v_replacement);

  execute v_definition;

  if
    'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure::oid
    is distinct from v_oid
  then
    raise exception
      'activate_litter_plan_on_first_birth_internal OID changed';
  end if;
end;
$adapt_activation$;

revoke all on function public.activate_litter_plan_on_first_birth_internal(
  uuid,
  uuid,
  date,
  uuid,
  uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Make the public cancellation guard consult only the current projection
-- ---------------------------------------------------------------------------

do $adapt_cancellation_guard$
declare
  v_signature regprocedure :=
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure;
  v_oid oid := v_signature::oid;
  v_definition text := pg_get_functiondef(v_signature);
  v_fragment text;
  v_replacement text;
  v_occurrences integer;
begin
  v_fragment := E'  select activation.id\n  into v_activation_id\n  from public.litter_plan_actual_birth_activations activation\n  where activation.organization_id = v_organization_id\n    and activation.litter_id = v_litter_id\n  for update;';
  v_replacement := E'  select state.current_activation_id\n  into v_activation_id\n  from public.litter_plan_actual_birth_activation_states state\n  where state.organization_id = v_organization_id\n    and state.litter_id = v_litter_id\n  for update;';
  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_fragment, '')))
    / length(v_fragment);
  if v_occurrences <> 1 then
    raise exception
      'cancel_whelping_birth current-activation guard failed: %',
      v_occurrences;
  end if;

  execute replace(v_definition, v_fragment, v_replacement);

  if
    'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure::oid
    is distinct from v_oid
  then
    raise exception 'cancel_whelping_birth OID changed';
  end if;
end;
$adapt_cancellation_guard$;

-- Defensive ACL restatement for every private lifecycle function.
revoke all on function public.current_litter_plan_actual_birth_activation_id_internal(
  uuid,
  uuid
) from public, anon, authenticated;

revoke all on function public.advance_litter_plan_actual_birth_activation_state_internal(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

revoke all on function public.deactivate_litter_plan_actual_birth_activation_internal(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

comment on table public.litter_plan_actual_birth_activations is
  'Private append-only lineage of each litter planning activation caused by a first recorded birth.';

comment on table public.litter_plan_actual_birth_activation_states is
  'Private mutable operational projection of the current and last first-birth planning activation for a litter.';

comment on table public.litter_plan_actual_birth_activation_deactivations is
  'Private append-only audit of explicit first-birth planning activation deactivations authorized by cancel_birth adjustment commands.';

comment on function public.deactivate_litter_plan_actual_birth_activation_internal(
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Private audited lifecycle transition that deactivates the current activation without reverting litter planning.';

comment on function public.cancel_whelping_birth(
  uuid,
  uuid,
  integer,
  timestamptz,
  text
) is
  'Public historical cancellation contract; temporarily rejects the sole active birth only while a current first-birth planning activation exists.';

commit;

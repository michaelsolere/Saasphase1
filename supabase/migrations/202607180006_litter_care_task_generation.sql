create table public.litter_care_task_generation_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  litter_id uuid not null,
  plan jsonb not null,
  outcome text not null,
  reason text,
  result jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_care_task_generation_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint litter_care_task_generation_commands_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_care_task_generation_commands_plan_check
    check (jsonb_typeof(plan) = 'array'),
  constraint litter_care_task_generation_commands_outcome_check
    check (outcome in ('success', 'error')),
  constraint litter_care_task_generation_commands_reason_check
    check (
      (outcome = 'success' and reason is null)
      or (outcome = 'error' and reason in ('invalid_litter', 'stale_plan'))
    ),
  constraint litter_care_task_generation_commands_result_check
    check (jsonb_typeof(result) = 'array')
);

create index litter_care_task_generation_commands_litter_created_at_idx
  on public.litter_care_task_generation_commands (
    organization_id,
    litter_id,
    created_at
  );

alter table public.litter_care_task_generation_commands enable row level security;

create or replace function public.generate_litter_care_tasks_from_plan(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_plan jsonb
)
returns table (
  outcome text,
  litter_id uuid,
  created_count integer,
  already_generated_count integer,
  result jsonb,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_litter_organization_id uuid;
  v_membership_role text;
  v_litter public.litters%rowtype;
  v_existing_command public.litter_care_task_generation_commands%rowtype;
  v_plan_item jsonb;
  v_plan_item_count integer;
  v_distinct_template_count integer;
  v_plan_item_key_count integer;
  v_template_id uuid;
  v_template public.litter_care_task_templates%rowtype;
  v_anchor_date date;
  v_planned_for date;
  v_task_id uuid;
  v_stale boolean := false;
begin
  outcome := 'error';
  litter_id := p_litter_id;
  created_count := 0;
  already_generated_count := 0;
  result := '[]'::jsonb;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_plan is null
    or jsonb_typeof(p_plan) <> 'array' then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select litter.organization_id
  into v_litter_organization_id
  from public.litters litter
  where litter.id = p_litter_id;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_litter_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_generation_commands:'
        || v_litter_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_care_task_generation_commands command
  where command.organization_id = v_litter_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.litter_id <> p_litter_id
      or v_existing_command.plan <> p_plan then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := v_existing_command.outcome;
    litter_id := v_existing_command.litter_id;
    result := v_existing_command.result;
    reason := v_existing_command.reason;
    replayed := true;

    select count(*) filter (where item.value ->> 'state' = 'created'),
      count(*) filter (where item.value ->> 'state' = 'already_generated')
    into created_count, already_generated_count
    from jsonb_array_elements(v_existing_command.result) item(value);

    return next;
    return;
  end if;

  for v_plan_item in
    select item.value
    from jsonb_array_elements(p_plan) item(value)
  loop
    if jsonb_typeof(v_plan_item) <> 'object' then
      reason := 'invalid_input';
      return next;
      return;
    end if;

    select count(*)
    into v_plan_item_key_count
    from jsonb_object_keys(v_plan_item);

    if v_plan_item_key_count <> 5
      or not (v_plan_item ? 'templateId')
      or not (v_plan_item ? 'revision')
      or not (v_plan_item ? 'anchorType')
      or not (v_plan_item ? 'anchorDate')
      or not (v_plan_item ? 'plannedFor')
      or jsonb_typeof(v_plan_item -> 'templateId') <> 'string'
      or jsonb_typeof(v_plan_item -> 'revision') <> 'number'
      or jsonb_typeof(v_plan_item -> 'anchorType') <> 'string'
      or jsonb_typeof(v_plan_item -> 'anchorDate') <> 'string'
      or jsonb_typeof(v_plan_item -> 'plannedFor') <> 'string'
      or (v_plan_item ->> 'templateId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_plan_item ->> 'revision') !~ '^[1-9][0-9]*$'
      or (v_plan_item ->> 'revision')::numeric > 2147483647
      or (v_plan_item ->> 'anchorType') not in (
        'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
        'offspring_age'
      )
      or (v_plan_item ->> 'anchorDate') !~ '^\d{4}-\d{2}-\d{2}$'
      or (v_plan_item ->> 'plannedFor') !~ '^\d{4}-\d{2}-\d{2}$'
      or not pg_input_is_valid(v_plan_item ->> 'anchorDate', 'date')
      or not pg_input_is_valid(v_plan_item ->> 'plannedFor', 'date') then
      reason := 'invalid_input';
      return next;
      return;
    end if;
  end loop;

  select count(*), count(distinct item.value ->> 'templateId')
  into v_plan_item_count, v_distinct_template_count
  from jsonb_array_elements(p_plan) item(value);

  if v_plan_item_count <> v_distinct_template_count then
    v_stale := true;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_litter_organization_id
    and litter.id = p_litter_id
  for update;

  if not found
    or v_litter.deleted_at is not null
    or v_litter.status not in (
      'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed',
      'birth_expected', 'birth_in_progress', 'born', 'puppies_created',
      'choice_period', 'ready_to_leave'
    ) then
    insert into public.litter_care_task_generation_commands (
      organization_id,
      client_command_id,
      litter_id,
      plan,
      outcome,
      reason,
      result,
      created_by
    ) values (
      v_litter_organization_id,
      p_client_command_id,
      p_litter_id,
      p_plan,
      'error',
      'invalid_litter',
      '[]'::jsonb,
      v_user_id
    );

    reason := 'invalid_litter';
    return next;
    return;
  end if;

  perform template.id
  from public.litter_care_task_templates template
  where template.organization_id = v_litter.organization_id
    and template.id in (
      select (item.value ->> 'templateId')::uuid
      from jsonb_array_elements(p_plan) item(value)
    )
  order by template.id
  for update;

  if not v_stale then
    for v_plan_item in
      select item.value
      from jsonb_array_elements(p_plan) item(value)
    loop
      v_template_id := (v_plan_item ->> 'templateId')::uuid;

      select template.*
      into v_template
      from public.litter_care_task_templates template
      where template.organization_id = v_litter.organization_id
        and template.id = v_template_id;

      if not found
        or not v_template.is_active
        or v_template.revision <> (v_plan_item ->> 'revision')::integer
        or v_template.species <> v_litter.species
        or (
          v_template.breed is not null
          and lower(btrim(v_template.breed)) <> lower(btrim(v_litter.breed))
        )
        or v_template.anchor_type <> (v_plan_item ->> 'anchorType') then
        v_stale := true;
        exit;
      end if;

      v_anchor_date := case v_template.anchor_type
        when 'first_mating' then v_litter.mating_date
        when 'estimated_ovulation' then v_litter.estimated_ovulation_date
        when 'expected_birth' then v_litter.expected_birth_date
        when 'actual_birth' then v_litter.actual_birth_date
        when 'offspring_age' then v_litter.actual_birth_date
        else null
      end;

      if v_anchor_date is null
        or v_anchor_date <> (v_plan_item ->> 'anchorDate')::date then
        v_stale := true;
        exit;
      end if;

      begin
        v_planned_for := v_anchor_date + v_template.offset_days;
      exception
        when datetime_field_overflow then
          v_stale := true;
      end;

      if v_stale
        or v_planned_for <> (v_plan_item ->> 'plannedFor')::date then
        v_stale := true;
        exit;
      end if;
    end loop;
  end if;

  if v_stale then
    insert into public.litter_care_task_generation_commands (
      organization_id,
      client_command_id,
      litter_id,
      plan,
      outcome,
      reason,
      result,
      created_by
    ) values (
      v_litter.organization_id,
      p_client_command_id,
      v_litter.id,
      p_plan,
      'error',
      'stale_plan',
      '[]'::jsonb,
      v_user_id
    );

    reason := 'stale_plan';
    return next;
    return;
  end if;

  for v_plan_item in
    select item.value
    from jsonb_array_elements(p_plan) item(value)
  loop
    v_template_id := (v_plan_item ->> 'templateId')::uuid;

    select task.id
    into v_task_id
    from public.litter_care_tasks task
    where task.organization_id = v_litter.organization_id
      and task.litter_id = v_litter.id
      and task.organization_template_id = v_template_id
      and task.occurrence_no = 1;

    if found then
      already_generated_count := already_generated_count + 1;
      result := result || jsonb_build_array(jsonb_build_object(
        'templateId', v_template_id,
        'taskId', v_task_id,
        'state', 'already_generated'
      ));
      continue;
    end if;

    select template.*
    into v_template
    from public.litter_care_task_templates template
    where template.organization_id = v_litter.organization_id
      and template.id = v_template_id;

    v_anchor_date := (v_plan_item ->> 'anchorDate')::date;
    v_planned_for := (v_plan_item ->> 'plannedFor')::date;

    insert into public.litter_care_tasks (
      organization_id,
      litter_id,
      source,
      organization_template_id,
      system_template_code,
      occurrence_no,
      category,
      target_scope,
      title,
      description,
      anchor_type,
      anchor_date,
      offset_days,
      planned_for,
      status,
      creation_command_id,
      created_by,
      updated_by
    ) values (
      v_litter.organization_id,
      v_litter.id,
      'organization_template',
      v_template.id,
      null,
      1,
      v_template.category,
      v_template.target_scope,
      v_template.title,
      v_template.description,
      v_template.anchor_type,
      v_anchor_date,
      v_template.offset_days,
      v_planned_for,
      'planned',
      gen_random_uuid(),
      v_user_id,
      v_user_id
    )
    returning litter_care_tasks.id into v_task_id;

    created_count := created_count + 1;
    result := result || jsonb_build_array(jsonb_build_object(
      'templateId', v_template_id,
      'taskId', v_task_id,
      'state', 'created'
    ));
  end loop;

  insert into public.litter_care_task_generation_commands (
    organization_id,
    client_command_id,
    litter_id,
    plan,
    outcome,
    reason,
    result,
    created_by
  ) values (
    v_litter.organization_id,
    p_client_command_id,
    v_litter.id,
    p_plan,
    'success',
    null,
    result,
    v_user_id
  );

  outcome := 'success';
  reason := null;
  return next;
end;
$$;

revoke all on table public.litter_care_task_generation_commands from anon, authenticated;

revoke all on function public.generate_litter_care_tasks_from_plan(
  uuid, uuid, jsonb
) from public;
grant execute on function public.generate_litter_care_tasks_from_plan(
  uuid, uuid, jsonb
) to authenticated;

comment on table public.litter_care_task_generation_commands is
  'Private exact-plan and result registry for explicit litter care task generation.';

comment on function public.generate_litter_care_tasks_from_plan(uuid, uuid, jsonb) is
  'Atomically revalidates an exact server plan and creates only its missing organization-template tasks.';

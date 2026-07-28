-- LITTER-PLANNING-LIBRARY-RECURRENCE-01
-- Add recurring-task support to the read-only global planning-model library.

alter table public.litter_planning_model_library_items
  add column recurrence_kind text,
  add column recurrence_interval_days integer,
  add column recurrence_starts_offset_days integer,
  add column recurrence_end_kind text,
  add column recurrence_ends_offset_days integer,
  add column recurrence_day_count integer,
  add column initial_materialization_horizon_days integer,
  add column absolute_max_occurrences integer;

alter table public.litter_planning_model_library_items
  drop constraint litter_planning_model_library_items_kind_check,
  add constraint litter_planning_model_library_items_kind_check
    check (item_kind in ('milestone', 'task', 'window', 'recurring_task')),
  drop constraint litter_planning_model_library_items_schedule_shape_check,
  add constraint litter_planning_model_library_items_schedule_shape_check check (
    (item_kind in ('milestone', 'task')
      and point_offset_days is not null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind is null and recurrence_interval_days is null
      and recurrence_starts_offset_days is null and recurrence_end_kind is null
      and recurrence_ends_offset_days is null and recurrence_day_count is null
      and initial_materialization_horizon_days is null and absolute_max_occurrences is null)
    or (item_kind = 'window'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is not null and window_ends_offset_days is not null
      and (window_starts_offset_days < window_ends_offset_days
        or (window_starts_offset_days = window_ends_offset_days and (
          window_starts_local_time is null or window_ends_local_time is null
          or window_starts_local_time <= window_ends_local_time)))
      and recurrence_kind is null and recurrence_interval_days is null
      and recurrence_starts_offset_days is null and recurrence_end_kind is null
      and recurrence_ends_offset_days is null and recurrence_day_count is null
      and initial_materialization_horizon_days is null and absolute_max_occurrences is null)
    or (item_kind = 'recurring_task'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null
      and recurrence_kind = 'daily_interval'
      and recurrence_interval_days between 1 and 365
      and recurrence_starts_offset_days is not null
      and recurrence_end_kind in ('fixed_end_offset', 'fixed_recurrence_day_count', 'actual_birth')
      and initial_materialization_horizon_days between 1 and 365
      and absolute_max_occurrences between 1 and 500
      and ((recurrence_end_kind = 'fixed_end_offset'
            and recurrence_ends_offset_days is not null and recurrence_day_count is null)
        or (recurrence_end_kind = 'fixed_recurrence_day_count'
            and recurrence_day_count between 1 and 500 and recurrence_ends_offset_days is null)
        or (recurrence_end_kind = 'actual_birth'
            and recurrence_ends_offset_days is null and recurrence_day_count is null))
      and (recurrence_end_kind <> 'fixed_end_offset'
        or recurrence_ends_offset_days >= recurrence_starts_offset_days))
  );

create table public.litter_planning_model_library_item_time_slots (
  id uuid primary key default gen_random_uuid(),
  library_model_item_id uuid not null references public.litter_planning_model_library_items(id) on delete restrict,
  slot_no integer not null,
  local_time time without time zone not null,
  created_at timestamptz not null default now(),
  constraint litter_planning_model_library_item_time_slots_slot_no_check check (slot_no > 0),
  constraint litter_planning_model_library_item_time_slots_item_slot_key unique (library_model_item_id, slot_no),
  constraint litter_planning_model_library_item_time_slots_item_time_key unique (library_model_item_id, local_time)
);

create index litter_planning_model_library_item_time_slots_item_idx
  on public.litter_planning_model_library_item_time_slots (library_model_item_id, slot_no);

create or replace function public.assert_litter_planning_model_library_item_slots(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' set row_security = off as $$
  select not exists (
    select 1 from public.litter_planning_model_library_items item where item.id = p_item_id
  ) or exists (
    select 1 from public.litter_planning_model_library_items item where item.id = p_item_id
      and ((item.item_kind = 'recurring_task' and (
        select count(*) from public.litter_planning_model_library_item_time_slots slot
        where slot.library_model_item_id = item.id
      ) between 1 and 8) or (item.item_kind <> 'recurring_task' and not exists (
        select 1 from public.litter_planning_model_library_item_time_slots slot
        where slot.library_model_item_id = item.id
      )))
  );
$$;

create or replace function public.enforce_litter_planning_model_library_item_slots()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_old_item_id uuid;
  v_new_item_id uuid;
begin
  if tg_table_name = 'litter_planning_model_library_items' then
    if tg_op = 'INSERT' then
      v_new_item_id := new.id;
    elsif tg_op = 'DELETE' then
      v_old_item_id := old.id;
    else
      v_old_item_id := old.id;
      v_new_item_id := new.id;
    end if;

    if v_old_item_id is not null
      and not public.assert_litter_planning_model_library_item_slots(v_old_item_id) then
      raise exception 'litter planning model library item time slots are invalid' using errcode = '23514';
    end if;

    if not public.assert_litter_planning_model_library_item_slots(v_new_item_id) then
      raise exception 'litter planning model library item time slots are invalid' using errcode = '23514';
    end if;
    return null;
  end if;

  -- A moved slot has two affected parents.  Both checks are deliberately
  -- deferred so an item and its first slots can be created atomically.
  if tg_op = 'INSERT' then
    v_new_item_id := new.library_model_item_id;
  elsif tg_op = 'DELETE' then
    v_old_item_id := old.library_model_item_id;
  else
    v_old_item_id := old.library_model_item_id;
    v_new_item_id := new.library_model_item_id;
  end if;
  if v_old_item_id is not null
    and not public.assert_litter_planning_model_library_item_slots(v_old_item_id) then
    raise exception 'litter planning model library item time slots are invalid' using errcode = '23514';
  end if;
  if v_new_item_id is not null
    and v_new_item_id is distinct from v_old_item_id
    and not public.assert_litter_planning_model_library_item_slots(v_new_item_id) then
    raise exception 'litter planning model library item time slots are invalid' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger litter_planning_model_library_items_slots_check
after insert or update of item_kind on public.litter_planning_model_library_items
deferrable initially deferred for each row execute function public.enforce_litter_planning_model_library_item_slots();
create constraint trigger litter_planning_model_library_item_time_slots_check
after insert or update or delete on public.litter_planning_model_library_item_time_slots
deferrable initially deferred for each row execute function public.enforce_litter_planning_model_library_item_slots();

alter table public.litter_planning_model_library_item_time_slots enable row level security;
create policy litter_planning_model_library_item_time_slots_select_authenticated
  on public.litter_planning_model_library_item_time_slots for select to authenticated using (true);
revoke all on table public.litter_planning_model_library_item_time_slots from anon, authenticated;
grant select on table public.litter_planning_model_library_item_time_slots to authenticated;

create or replace function public.import_litter_planning_model_library_models(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_selection jsonb,
  p_is_active boolean
)
returns table (
  outcome text,
  imported_count integer,
  already_imported_count integer,
  elementary_imported_count integer,
  elementary_already_imported_count integer,
  result jsonb,
  elementary_result jsonb,
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
  v_membership_role text;
  v_existing_command public.litter_planning_model_library_import_commands%rowtype;
  v_selection_item jsonb;
  v_selection_count integer;
  v_distinct_selection_count integer;
  v_key_count integer;
  v_library_model public.litter_planning_model_library_models%rowtype;
  v_library_template public.litter_care_task_library_templates%rowtype;
  v_organization_model_id uuid;
  v_organization_template_id uuid;
  v_elementary_key text;
  v_elementary_map jsonb := '{}'::jsonb;
  v_distinct_elementary_count integer;
  v_available_elementary_count integer;
  v_library_item public.litter_planning_model_library_items%rowtype;
  v_organization_item_id uuid;
  v_library_slot record;
begin
  outcome := 'error';
  imported_count := 0;
  already_imported_count := 0;
  elementary_imported_count := 0;
  elementary_already_imported_count := 0;
  result := '[]'::jsonb;
  elementary_result := '[]'::jsonb;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_organization_id is null
    or p_client_command_id is null
    or p_selection is null
    or p_is_active is null
    or jsonb_typeof(p_selection) <> 'array' then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform 1
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.deleted_at is null;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = p_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_planning_model_library_import_commands:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_planning_model_library_import_commands command
  where command.organization_id = p_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.selection <> p_selection
      or v_existing_command.initial_is_active is distinct from p_is_active then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    imported_count := v_existing_command.imported_count;
    already_imported_count := v_existing_command.already_imported_count;
    elementary_imported_count := v_existing_command.elementary_imported_count;
    elementary_already_imported_count := v_existing_command.elementary_already_imported_count;
    result := v_existing_command.result;
    elementary_result := v_existing_command.elementary_result;
    replayed := true;
    return next;
    return;
  end if;

  select count(*)
  into v_selection_count
  from jsonb_array_elements(p_selection);

  if v_selection_count not between 1 and 30 then
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  for v_selection_item in
    select item.value
    from jsonb_array_elements(p_selection) with ordinality item(value, position)
    order by item.position
  loop
    if jsonb_typeof(v_selection_item) <> 'object' then
      reason := 'invalid_selection';
      return next;
      return;
    end if;

    select count(*)
    into v_key_count
    from jsonb_object_keys(v_selection_item);

    if v_key_count <> 2
      or not (v_selection_item ? 'code')
      or not (v_selection_item ? 'version')
      or jsonb_typeof(v_selection_item -> 'code') <> 'string'
      or jsonb_typeof(v_selection_item -> 'version') <> 'number'
      or char_length(v_selection_item ->> 'code') not between 1 and 100
      or (v_selection_item ->> 'code') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or (v_selection_item ->> 'version') !~ '^[1-9][0-9]*$'
      or (v_selection_item ->> 'version')::numeric > 2147483647 then
      reason := 'invalid_selection';
      return next;
      return;
    end if;
  end loop;

  select count(distinct concat_ws(
    ':',
    item.value ->> 'code',
    item.value ->> 'version'
  ))
  into v_distinct_selection_count
  from jsonb_array_elements(p_selection) item(value);

  if v_distinct_selection_count <> v_selection_count then
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_planning_model_library_imports:' || p_organization_id::text,
      0
    )
  );

  perform library_model.code
  from public.litter_planning_model_library_models library_model
  join jsonb_array_elements(p_selection) item(value)
    on library_model.code = item.value ->> 'code'
   and library_model.version = (item.value ->> 'version')::integer
  where library_model.is_available
  order by library_model.code, library_model.version
  for share of library_model;

  if (
    select count(*)
    from public.litter_planning_model_library_models library_model
    join jsonb_array_elements(p_selection) item(value)
      on library_model.code = item.value ->> 'code'
     and library_model.version = (item.value ->> 'version')::integer
    where library_model.is_available
  ) <> v_selection_count then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_distinct_elementary_count
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer;

  perform library_template.code
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer
  join public.litter_care_task_library_templates library_template
    on library_template.code = library_item.library_template_code
   and library_template.version = library_item.library_template_version
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  where library_template.is_available
    and pack.is_available
  order by library_template.code, library_template.version
  for share of library_template, pack;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_available_elementary_count
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer
  join public.litter_care_task_library_templates library_template
    on library_template.code = library_item.library_template_code
   and library_template.version = library_item.library_template_version
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  where library_template.is_available
    and pack.is_available;

  if v_available_elementary_count <> v_distinct_elementary_count then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  -- A global recurring item is only importable with its complete ordered
  -- slot set.  This happens before any organization template/model write.
  if exists (
    select 1
    from public.litter_planning_model_library_items library_item
    join jsonb_array_elements(p_selection) item(value)
      on library_item.library_model_code = item.value ->> 'code'
     and library_item.library_model_version = (item.value ->> 'version')::integer
    where not public.assert_litter_planning_model_library_item_slots(
      library_item.id
    )
  ) then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  for v_library_template in
    select distinct library_template.*
    from public.litter_planning_model_library_items library_item
    join jsonb_array_elements(p_selection) item(value)
      on library_item.library_model_code = item.value ->> 'code'
     and library_item.library_model_version = (item.value ->> 'version')::integer
    join public.litter_care_task_library_templates library_template
      on library_template.code = library_item.library_template_code
     and library_template.version = library_item.library_template_version
    order by library_template.code, library_template.version
  loop
    v_elementary_key := v_library_template.code || ':' || v_library_template.version::text;

    select organization_template.id
    into v_organization_template_id
    from public.litter_care_task_templates organization_template
    where organization_template.organization_id = p_organization_id
      and organization_template.library_template_code = v_library_template.code
      and organization_template.library_template_version = v_library_template.version;

    if found then
      elementary_already_imported_count := elementary_already_imported_count + 1;
      v_elementary_map := v_elementary_map || jsonb_build_object(
        v_elementary_key,
        v_organization_template_id::text
      );
      elementary_result := elementary_result || jsonb_build_array(jsonb_build_object(
        'code', v_library_template.code,
        'version', v_library_template.version,
        'templateId', v_organization_template_id,
        'state', 'already_imported'
      ));
      continue;
    end if;

    insert into public.litter_care_task_templates (
      organization_id,
      title,
      description,
      category,
      target_scope,
      anchor_type,
      offset_days,
      species,
      breed,
      is_active,
      sort_order,
      revision,
      library_template_code,
      library_template_version,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      v_library_template.title,
      v_library_template.description,
      v_library_template.category,
      v_library_template.target_scope,
      v_library_template.anchor_type,
      v_library_template.offset_days,
      v_library_template.species,
      v_library_template.breed,
      p_is_active,
      v_library_template.sort_order,
      1,
      v_library_template.code,
      v_library_template.version,
      v_user_id,
      v_user_id
    )
    returning litter_care_task_templates.id
    into v_organization_template_id;

    elementary_imported_count := elementary_imported_count + 1;
    v_elementary_map := v_elementary_map || jsonb_build_object(
      v_elementary_key,
      v_organization_template_id::text
    );
    elementary_result := elementary_result || jsonb_build_array(jsonb_build_object(
      'code', v_library_template.code,
      'version', v_library_template.version,
      'templateId', v_organization_template_id,
      'state', 'imported'
    ));
  end loop;

  for v_selection_item in
    select item.value
    from jsonb_array_elements(p_selection) with ordinality item(value, position)
    order by item.position
  loop
    select library_model.*
    into strict v_library_model
    from public.litter_planning_model_library_models library_model
    where library_model.code = v_selection_item ->> 'code'
      and library_model.version = (v_selection_item ->> 'version')::integer;

    select organization_model.id
    into v_organization_model_id
    from public.litter_planning_models organization_model
    where organization_model.organization_id = p_organization_id
      and organization_model.library_model_code = v_library_model.code
      and organization_model.library_model_version = v_library_model.version;

    if found then
      already_imported_count := already_imported_count + 1;
      result := result || jsonb_build_array(jsonb_build_object(
        'code', v_library_model.code,
        'version', v_library_model.version,
        'modelId', v_organization_model_id,
        'state', 'already_imported'
      ));
      continue;
    end if;

    insert into public.litter_planning_models (
      organization_id,
      title,
      description,
      species,
      breed,
      is_active,
      revision,
      library_model_code,
      library_model_version,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      v_library_model.title,
      v_library_model.description,
      v_library_model.species,
      v_library_model.breed,
      p_is_active,
      1,
      v_library_model.code,
      v_library_model.version,
      v_user_id,
      v_user_id
    )
    returning litter_planning_models.id
    into v_organization_model_id;

    for v_library_item in
      select library_item.*
      from public.litter_planning_model_library_items library_item
      where library_item.library_model_code = v_library_model.code
        and library_item.library_model_version = v_library_model.version
      order by library_item.display_order
    loop
      v_elementary_key := v_library_item.library_template_code
        || ':' || v_library_item.library_template_version::text;

      insert into public.litter_planning_model_items (
        organization_id,
        model_id,
        organization_template_id,
        item_kind,
        priority,
        anchor_type,
        point_offset_days,
        point_local_time,
        window_starts_offset_days,
        window_starts_local_time,
        window_ends_offset_days,
        window_ends_local_time,
        recurrence_kind,
        recurrence_interval_days,
        recurrence_starts_offset_days,
        recurrence_end_kind,
        recurrence_ends_offset_days,
        recurrence_day_count,
        initial_materialization_horizon_days,
        absolute_max_occurrences,
        display_order,
        is_required,
        is_selected_by_default,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        v_organization_model_id,
        (v_elementary_map ->> v_elementary_key)::uuid,
        v_library_item.item_kind,
        v_library_item.priority,
        v_library_item.anchor_type,
        v_library_item.point_offset_days,
        v_library_item.point_local_time,
        v_library_item.window_starts_offset_days,
        v_library_item.window_starts_local_time,
        v_library_item.window_ends_offset_days,
        v_library_item.window_ends_local_time,
        v_library_item.recurrence_kind,
        v_library_item.recurrence_interval_days,
        v_library_item.recurrence_starts_offset_days,
        v_library_item.recurrence_end_kind,
        v_library_item.recurrence_ends_offset_days,
        v_library_item.recurrence_day_count,
        v_library_item.initial_materialization_horizon_days,
        v_library_item.absolute_max_occurrences,
        v_library_item.display_order,
        v_library_item.is_required,
        v_library_item.is_selected_by_default,
        v_user_id,
        v_user_id
      )
      returning id
      into v_organization_item_id;

      for v_library_slot in
        select slot.slot_no, slot.local_time
        from public.litter_planning_model_library_item_time_slots slot
        where slot.library_model_item_id = v_library_item.id
        order by slot.slot_no
      loop
        insert into public.litter_planning_model_item_time_slots (
          organization_id,
          model_item_id,
          slot_no,
          local_time,
          created_by
        ) values (
          p_organization_id,
          v_organization_item_id,
          v_library_slot.slot_no,
          v_library_slot.local_time,
          v_user_id
        );
      end loop;
    end loop;

    imported_count := imported_count + 1;
    result := result || jsonb_build_array(jsonb_build_object(
      'code', v_library_model.code,
      'version', v_library_model.version,
      'modelId', v_organization_model_id,
      'state', 'imported'
    ));
  end loop;

  insert into public.litter_planning_model_library_import_commands (
    organization_id,
    client_command_id,
    selection,
    initial_is_active,
    imported_count,
    already_imported_count,
    elementary_imported_count,
    elementary_already_imported_count,
    result,
    elementary_result,
    created_by
  ) values (
    p_organization_id,
    p_client_command_id,
    p_selection,
    p_is_active,
    imported_count,
    already_imported_count,
    elementary_imported_count,
    elementary_already_imported_count,
    result,
    elementary_result,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on function public.assert_litter_planning_model_library_item_slots(uuid) from public;
revoke all on function public.enforce_litter_planning_model_library_item_slots() from public;
comment on table public.litter_planning_model_library_item_time_slots is 'Ordered local-time slots (1..8) for recurring_task global planning model items.';

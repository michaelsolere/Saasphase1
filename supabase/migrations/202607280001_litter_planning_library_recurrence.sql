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
declare v_item_id uuid := coalesce(
  (to_jsonb(new) ->> 'library_model_item_id')::uuid,
  (to_jsonb(old) ->> 'library_model_item_id')::uuid,
  (to_jsonb(new) ->> 'id')::uuid,
  (to_jsonb(old) ->> 'id')::uuid
);
begin
  if not public.assert_litter_planning_model_library_item_slots(v_item_id) then
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

-- Keep this RPC as the only import entrypoint.  Its writes remain within one
-- PL/pgSQL transaction; an invalid library item aborts every earlier copy.
create or replace function public.import_litter_planning_model_library_models(
  p_organization_id uuid, p_client_command_id uuid, p_selection jsonb, p_is_active boolean
) returns table (outcome text, imported_count integer, already_imported_count integer,
  elementary_imported_count integer, elementary_already_imported_count integer,
  result jsonb, elementary_result jsonb, replayed boolean, reason text)
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_user_id uuid := auth.uid(); v_role text; v_command public.litter_planning_model_library_import_commands%rowtype;
  v_selection_item jsonb; v_library_model public.litter_planning_model_library_models%rowtype;
  v_library_item public.litter_planning_model_library_items%rowtype; v_template public.litter_care_task_library_templates%rowtype;
  v_model_id uuid; v_template_id uuid; v_item_id uuid; v_slot record; v_key text; v_templates jsonb := '{}'::jsonb;
  v_count integer; v_distinct integer; v_available integer;
begin
  outcome := 'error'; imported_count := 0; already_imported_count := 0;
  elementary_imported_count := 0; elementary_already_imported_count := 0;
  result := '[]'::jsonb; elementary_result := '[]'::jsonb; replayed := false; reason := null;
  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_organization_id is null or p_client_command_id is null or p_selection is null or p_is_active is null or jsonb_typeof(p_selection) <> 'array' then reason := 'invalid_input'; return next; return; end if;
  select role into v_role from public.memberships where organization_id=p_organization_id and profile_id=v_user_id and status='active' and deleted_at is null for share;
  if not found then reason := 'organization_not_found'; return next; return; end if;
  if v_role not in ('owner','admin') then reason := 'membership_required'; return next; return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_planning_model_library_import_commands:'||p_organization_id::text||':'||p_client_command_id::text,0));
  select * into v_command from public.litter_planning_model_library_import_commands where organization_id=p_organization_id and client_command_id=p_client_command_id for update;
  if found then
    if v_command.selection <> p_selection or v_command.initial_is_active is distinct from p_is_active then reason := 'client_command_conflict'; return next; return; end if;
    outcome := 'success'; imported_count:=v_command.imported_count; already_imported_count:=v_command.already_imported_count; elementary_imported_count:=v_command.elementary_imported_count; elementary_already_imported_count:=v_command.elementary_already_imported_count; result:=v_command.result; elementary_result:=v_command.elementary_result; replayed:=true; return next; return;
  end if;
  select count(*) into v_count from jsonb_array_elements(p_selection);
  if v_count not between 1 and 30 then reason := 'invalid_selection'; return next; return; end if;
  for v_selection_item in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(v_selection_item)<>'object' or (select count(*) from jsonb_object_keys(v_selection_item))<>2
      or jsonb_typeof(v_selection_item->'code')<>'string' or jsonb_typeof(v_selection_item->'version')<>'number'
      or char_length(v_selection_item->>'code') not between 1 and 100 or (v_selection_item->>'code') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or (v_selection_item->>'version') !~ '^[1-9][0-9]*$' or (v_selection_item->>'version')::numeric>2147483647 then reason:='invalid_selection'; return next; return; end if;
  end loop;
  select count(distinct concat_ws(':',value->>'code',value->>'version')) into v_distinct from jsonb_array_elements(p_selection);
  if v_distinct<>v_count then reason:='invalid_selection'; return next; return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_planning_model_library_imports:'||p_organization_id::text,0));
  select count(*) into v_available from public.litter_planning_model_library_models m join jsonb_array_elements(p_selection) s(value) on m.code=s.value->>'code' and m.version=(s.value->>'version')::integer where m.is_available;
  if v_available<>v_count then reason:='selection_unavailable'; return next; return; end if;
  -- Validate every selected global line, including the deferred slot invariant, before any organization write.
  if exists (select 1 from public.litter_planning_model_library_items i join jsonb_array_elements(p_selection) s(value) on i.library_model_code=s.value->>'code' and i.library_model_version=(s.value->>'version')::integer where not public.assert_litter_planning_model_library_item_slots(i.id)) then reason:='selection_unavailable'; return next; return; end if;
  for v_template in select distinct t.* from public.litter_planning_model_library_items i join jsonb_array_elements(p_selection) s(value) on i.library_model_code=s.value->>'code' and i.library_model_version=(s.value->>'version')::integer join public.litter_care_task_library_templates t on t.code=i.library_template_code and t.version=i.library_template_version join public.litter_care_task_library_packs p on p.code=t.pack_code and p.species=t.species where t.is_available and p.is_available order by t.code,t.version loop
    v_key:=v_template.code||':'||v_template.version; select id into v_template_id from public.litter_care_task_templates where organization_id=p_organization_id and library_template_code=v_template.code and library_template_version=v_template.version;
    if found then elementary_already_imported_count:=elementary_already_imported_count+1; elementary_result:=elementary_result||jsonb_build_array(jsonb_build_object('code',v_template.code,'version',v_template.version,'templateId',v_template_id,'state','already_imported'));
    else insert into public.litter_care_task_templates(organization_id,title,description,category,target_scope,anchor_type,offset_days,species,breed,is_active,sort_order,revision,library_template_code,library_template_version,created_by,updated_by) values(p_organization_id,v_template.title,v_template.description,v_template.category,v_template.target_scope,v_template.anchor_type,v_template.offset_days,v_template.species,v_template.breed,p_is_active,v_template.sort_order,1,v_template.code,v_template.version,v_user_id,v_user_id) returning id into v_template_id; elementary_imported_count:=elementary_imported_count+1; elementary_result:=elementary_result||jsonb_build_array(jsonb_build_object('code',v_template.code,'version',v_template.version,'templateId',v_template_id,'state','imported')); end if;
    v_templates:=v_templates||jsonb_build_object(v_key,v_template_id::text);
  end loop;
  -- Any unavailable elementary template means no partial organization import.
  select count(distinct i.library_template_code||':'||i.library_template_version) into v_count from public.litter_planning_model_library_items i join jsonb_array_elements(p_selection) s(value) on i.library_model_code=s.value->>'code' and i.library_model_version=(s.value->>'version')::integer;
  if (select count(*) from jsonb_object_keys(v_templates))<>v_count then raise exception 'library elementary templates are unavailable' using errcode='23514'; end if;
  for v_selection_item in select value from jsonb_array_elements(p_selection) with ordinality x(value,pos) order by pos loop
    select * into strict v_library_model from public.litter_planning_model_library_models where code=v_selection_item->>'code' and version=(v_selection_item->>'version')::integer;
    select id into v_model_id from public.litter_planning_models where organization_id=p_organization_id and library_model_code=v_library_model.code and library_model_version=v_library_model.version;
    if found then already_imported_count:=already_imported_count+1; result:=result||jsonb_build_array(jsonb_build_object('code',v_library_model.code,'version',v_library_model.version,'modelId',v_model_id,'state','already_imported')); continue; end if;
    insert into public.litter_planning_models(organization_id,title,description,species,breed,is_active,revision,library_model_code,library_model_version,created_by,updated_by) values(p_organization_id,v_library_model.title,v_library_model.description,v_library_model.species,v_library_model.breed,p_is_active,1,v_library_model.code,v_library_model.version,v_user_id,v_user_id) returning id into v_model_id;
    for v_library_item in select * from public.litter_planning_model_library_items where library_model_code=v_library_model.code and library_model_version=v_library_model.version order by display_order loop
      v_key:=v_library_item.library_template_code||':'||v_library_item.library_template_version;
      insert into public.litter_planning_model_items(organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,point_offset_days,point_local_time,window_starts_offset_days,window_starts_local_time,window_ends_offset_days,window_ends_local_time,recurrence_kind,recurrence_interval_days,recurrence_starts_offset_days,recurrence_end_kind,recurrence_ends_offset_days,recurrence_day_count,initial_materialization_horizon_days,absolute_max_occurrences,display_order,is_required,is_selected_by_default,created_by,updated_by) values(p_organization_id,v_model_id,(v_templates->>v_key)::uuid,v_library_item.item_kind,v_library_item.priority,v_library_item.anchor_type,v_library_item.point_offset_days,v_library_item.point_local_time,v_library_item.window_starts_offset_days,v_library_item.window_starts_local_time,v_library_item.window_ends_offset_days,v_library_item.window_ends_local_time,v_library_item.recurrence_kind,v_library_item.recurrence_interval_days,v_library_item.recurrence_starts_offset_days,v_library_item.recurrence_end_kind,v_library_item.recurrence_ends_offset_days,v_library_item.recurrence_day_count,v_library_item.initial_materialization_horizon_days,v_library_item.absolute_max_occurrences,v_library_item.display_order,v_library_item.is_required,v_library_item.is_selected_by_default,v_user_id,v_user_id) returning id into v_item_id;
      for v_slot in select slot_no,local_time from public.litter_planning_model_library_item_time_slots where library_model_item_id=v_library_item.id order by slot_no loop insert into public.litter_planning_model_item_time_slots(organization_id,model_item_id,slot_no,local_time,created_by) values(p_organization_id,v_item_id,v_slot.slot_no,v_slot.local_time,v_user_id); end loop;
    end loop;
    imported_count:=imported_count+1; result:=result||jsonb_build_array(jsonb_build_object('code',v_library_model.code,'version',v_library_model.version,'modelId',v_model_id,'state','imported'));
  end loop;
  insert into public.litter_planning_model_library_import_commands(organization_id,client_command_id,selection,initial_is_active,imported_count,already_imported_count,elementary_imported_count,elementary_already_imported_count,result,elementary_result,created_by) values(p_organization_id,p_client_command_id,p_selection,p_is_active,imported_count,already_imported_count,elementary_imported_count,elementary_already_imported_count,result,elementary_result,v_user_id);
  outcome:='success'; return next;
end;
$$;

revoke all on function public.assert_litter_planning_model_library_item_slots(uuid) from public;
revoke all on function public.enforce_litter_planning_model_library_item_slots() from public;
comment on table public.litter_planning_model_library_item_time_slots is 'Ordered local-time slots (1..8) for recurring_task global planning model items.';

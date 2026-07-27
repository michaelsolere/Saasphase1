-- LITTER-PLANNING-MODEL-EDITOR-01
-- Refuse replace on imported organization models (library origin set).
-- Canonical mutator baseline: 202607270001_litter_recurring_tasks_foundation
-- (recurring items + time slots). Activation of imported models remains allowed.

alter table public.litter_planning_model_commands
  drop constraint litter_planning_model_commands_outcome_check;

alter table public.litter_planning_model_commands
  add constraint litter_planning_model_commands_outcome_check check (
    (
      outcome = 'success'
      and reason is null
      and result_revision > 0
      and result_is_active is not null
    )
    or (
      outcome = 'error'
      and reason in ('stale_revision', 'imported_model_immutable')
      and result_revision is not null
      and result_is_active is not null
    )
  );

create or replace function public.mutate_litter_planning_model(
  p_operation text, p_model_id uuid, p_organization_id uuid, p_client_command_id uuid, p_expected_revision integer,
  p_title text, p_description text, p_species text, p_breed text, p_is_active boolean, p_items jsonb
) returns table(outcome text, model_id uuid, revision integer, is_active boolean, replayed boolean, reason text)
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_model public.litter_planning_models%rowtype;
  v_command public.litter_planning_model_commands%rowtype;
  v_payload jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_slot text;
  v_slot_no integer;
  v_slots jsonb;
begin
  outcome := 'error'; model_id := p_model_id; revision := null; is_active := null; replayed := false; reason := null;
  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_operation not in ('create','replace','set_active') or p_client_command_id is null then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then
    select organization.id
    into v_org
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.deleted_at is null;
  else
    select planning_model.organization_id
    into v_org
    from public.litter_planning_models planning_model
    join public.organizations organization
      on organization.id = planning_model.organization_id
     and organization.deleted_at is null
    where planning_model.id = p_model_id;
  end if;
  if not found or v_org is null then reason := 'model_not_found'; return next; return; end if;
  select membership.role
  into v_role
  from public.memberships membership
  where membership.organization_id = v_org
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;
  if not found then reason := 'model_not_found'; return next; return; end if;
  if v_role not in ('owner','admin') then reason := 'membership_required'; return next; return; end if;
  v_payload := jsonb_build_object('operation',p_operation,'modelId',p_model_id,'organizationId',case when p_operation='create' then v_org else null end,'expectedRevision',p_expected_revision,'title',p_title,'description',p_description,'species',p_species,'breed',p_breed,'isActive',p_is_active,'items',coalesce(p_items,'null'::jsonb));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_planning_model_commands:'||v_org::text||':'||p_client_command_id::text,0));
  select * into v_command from public.litter_planning_model_commands where organization_id=v_org and client_command_id=p_client_command_id;
  if found then
    if v_command.operation <> p_operation or v_command.payload <> v_payload then reason := 'client_command_conflict'; return next; return; end if;
    outcome := v_command.outcome; model_id := v_command.model_id; revision := v_command.result_revision; is_active := v_command.result_is_active; reason := v_command.reason; replayed := true; return next; return;
  end if;
  if p_operation in ('create','replace') and (
    p_title is null
    or char_length(btrim(p_title)) not between 1 and 255
    or (p_description is not null and char_length(btrim(p_description)) > 5000)
    or (p_species is not null and p_species not in ('dog','cat'))
    or (p_breed is not null and char_length(btrim(p_breed)) not between 1 and 255)
    or (p_breed is not null and p_species is null)
    or not public.assert_litter_planning_model_items(
      v_org,
      p_species,
      p_breed,
      p_items
    )
  ) then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then
    insert into public.litter_planning_models(organization_id,title,description,species,breed,is_active,revision,created_by,updated_by) values(v_org,btrim(p_title),nullif(btrim(p_description),''),p_species,case when p_breed is null then null else btrim(p_breed) end,coalesce(p_is_active,true),1,v_user_id,v_user_id) returning * into v_model;
  else
    select * into v_model from public.litter_planning_models where organization_id=v_org and id=p_model_id for update;
    if not found then reason := 'model_not_found'; return next; return; end if;
    if p_expected_revision is null or p_expected_revision <= 0 then reason := 'invalid_input'; return next; return; end if;
    if v_model.revision <> p_expected_revision then
      insert into public.litter_planning_model_commands(
        organization_id,model_id,client_command_id,operation,payload,outcome,reason,result_revision,result_is_active,created_by
      ) values (
        v_org,v_model.id,p_client_command_id,p_operation,v_payload,'error','stale_revision',v_model.revision,v_model.is_active,v_user_id
      );
      reason := 'stale_revision'; revision := v_model.revision; is_active := v_model.is_active; return next; return;
    end if;
    if p_operation='replace' then
      if v_model.library_model_code is not null and v_model.library_model_version is not null then
        insert into public.litter_planning_model_commands(
          organization_id,model_id,client_command_id,operation,payload,outcome,reason,result_revision,result_is_active,created_by
        ) values (
          v_org,v_model.id,p_client_command_id,p_operation,v_payload,'error','imported_model_immutable',v_model.revision,v_model.is_active,v_user_id
        );
        reason := 'imported_model_immutable'; revision := v_model.revision; is_active := v_model.is_active; return next; return;
      end if;
      update public.litter_planning_models as planning_model set title=btrim(p_title),description=nullif(btrim(p_description),''),species=p_species,breed=case when p_breed is null then null else btrim(p_breed) end,revision=planning_model.revision+1,updated_by=v_user_id where planning_model.id=v_model.id returning planning_model.* into v_model;
      delete from public.litter_planning_model_items as planning_item
      where planning_item.organization_id=v_org
        and planning_item.model_id=v_model.id;
    elsif v_model.is_active is distinct from p_is_active then
      update public.litter_planning_models as planning_model set is_active=p_is_active,revision=planning_model.revision+1,updated_by=v_user_id where planning_model.id=v_model.id returning planning_model.* into v_model;
    end if;
  end if;
  if p_operation in ('create','replace') then
    for v_item in select value from jsonb_array_elements(p_items) loop
      insert into public.litter_planning_model_items(
        organization_id, model_id, organization_template_id, item_kind, priority, anchor_type,
        point_offset_days, point_local_time,
        window_starts_offset_days, window_starts_local_time, window_ends_offset_days, window_ends_local_time,
        recurrence_kind, recurrence_interval_days, recurrence_starts_offset_days, recurrence_end_kind,
        recurrence_ends_offset_days, recurrence_day_count, initial_materialization_horizon_days,
        absolute_max_occurrences, display_order, is_required, is_selected_by_default, created_by, updated_by
      ) values (
        v_org, v_model.id, (v_item->>'organizationTemplateId')::uuid, v_item->>'itemKind', v_item->>'priority', v_item->>'anchorType',
        case when v_item ? 'pointOffsetDays' then (v_item->>'pointOffsetDays')::integer end,
        case when v_item ? 'pointLocalTime' then (v_item->>'pointLocalTime')::time end,
        case when v_item ? 'windowStartsOffsetDays' then (v_item->>'windowStartsOffsetDays')::integer end,
        case when v_item ? 'windowStartsLocalTime' then (v_item->>'windowStartsLocalTime')::time end,
        case when v_item ? 'windowEndsOffsetDays' then (v_item->>'windowEndsOffsetDays')::integer end,
        case when v_item ? 'windowEndsLocalTime' then (v_item->>'windowEndsLocalTime')::time end,
        case when v_item ? 'recurrenceKind' then v_item->>'recurrenceKind' end,
        case when v_item ? 'recurrenceIntervalDays' then (v_item->>'recurrenceIntervalDays')::integer end,
        case when v_item ? 'recurrenceStartsOffsetDays' then (v_item->>'recurrenceStartsOffsetDays')::integer end,
        case when v_item ? 'recurrenceEndKind' then v_item->>'recurrenceEndKind' end,
        case when v_item ? 'recurrenceEndsOffsetDays' then (v_item->>'recurrenceEndsOffsetDays')::integer end,
        case when v_item ? 'recurrenceDayCount' then (v_item->>'recurrenceDayCount')::integer end,
        case when v_item ? 'initialMaterializationHorizonDays' then (v_item->>'initialMaterializationHorizonDays')::integer end,
        case when v_item ? 'absoluteMaxOccurrences' then (v_item->>'absoluteMaxOccurrences')::integer end,
        (v_item->>'displayOrder')::integer, (v_item->>'isRequired')::boolean, (v_item->>'isSelectedByDefault')::boolean,
        v_user_id, v_user_id
      )
      returning id into v_item_id;

      if v_item->>'itemKind' = 'recurring_task' then
        v_slots := v_item->'timeSlots';
        v_slot_no := 0;
        for v_slot in select jsonb_array_elements_text(v_slots) loop
          v_slot_no := v_slot_no + 1;
          insert into public.litter_planning_model_item_time_slots (
            organization_id, model_item_id, slot_no, local_time, created_by
          ) values (
            v_org, v_item_id, v_slot_no, v_slot::time, v_user_id
          );
        end loop;
      end if;
    end loop;
  end if;
  insert into public.litter_planning_model_commands(organization_id,model_id,client_command_id,operation,payload,outcome,result_revision,result_is_active,created_by) values(v_org,v_model.id,p_client_command_id,p_operation,v_payload,'success',v_model.revision,v_model.is_active,v_user_id);
  outcome := 'success'; model_id := v_model.id; revision := v_model.revision; is_active := v_model.is_active; return next;
end; $$;

revoke all on function public.mutate_litter_planning_model(text,uuid,uuid,uuid,integer,text,text,text,text,boolean,jsonb) from public;

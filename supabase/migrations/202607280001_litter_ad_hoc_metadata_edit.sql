create or replace function public.update_litter_plan_ad_hoc_item_metadata(
  p_litter_id uuid, p_litter_plan_item_id uuid, p_client_command_id uuid,
  p_expected_plan_revision integer, p_expected_item_revision integer,
  p_expected_task_revision integer, p_metadata jsonb
)
returns table(outcome text, reason text, litter_plan_id uuid, plan_revision integer,
  litter_plan_item_id uuid, item_revision integer, task_id uuid, task_revision integer,
  replayed boolean, result jsonb)
language plpgsql security definer set search_path = '' set row_security = off
as $fn$
declare
  v_user uuid := auth.uid(); v_org uuid; v_command public.litter_plan_ad_hoc_commands%rowtype;
  v_plan public.litter_plans%rowtype; v_item public.litter_plan_items%rowtype;
  v_task public.litter_care_tasks%rowtype; v_payload jsonb; v_result jsonb;
  v_title text; v_description text; v_category text; v_target_scope text; v_priority text;
  v_task_count integer;
begin
  outcome := 'error'; reason := 'invalid_input'; replayed := false; result := '{}'::jsonb;
  if v_user is null then reason := 'not_authenticated'; return next; return; end if;
  if p_litter_id is null or p_litter_plan_item_id is null or p_client_command_id is null
    or p_expected_plan_revision is null or p_expected_item_revision is null or p_expected_task_revision is null
    or p_expected_plan_revision < 1 or p_expected_item_revision < 1 or p_expected_task_revision < 0
    or p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 7
    or not (p_metadata ?& array['version','operation','title','description','category','targetScope','priority'])
    or jsonb_typeof(p_metadata->'version') <> 'number' or p_metadata->>'version' <> '1'
    or jsonb_typeof(p_metadata->'operation') <> 'string' or p_metadata->>'operation' <> 'update_metadata'
    or jsonb_typeof(p_metadata->'title') <> 'string'
    or jsonb_typeof(p_metadata->'description') not in ('string','null')
    or jsonb_typeof(p_metadata->'category') <> 'string' or jsonb_typeof(p_metadata->'targetScope') <> 'string'
    or jsonb_typeof(p_metadata->'priority') <> 'string'
  then return next; return; end if;
  v_title := btrim(p_metadata->>'title'); v_description := case when jsonb_typeof(p_metadata->'description')='null' then null else nullif(btrim(p_metadata->>'description'),'') end;
  v_category := p_metadata->>'category'; v_target_scope := p_metadata->>'targetScope'; v_priority := p_metadata->>'priority';
  if char_length(v_title) not between 1 and 255 or char_length(coalesce(v_description,'')) > 5000
    or v_category not in ('reproduction','maternal_health','maternal_feeding','preparation','offspring_weight','offspring_health','offspring_feeding','socialization','veterinary','identification','vaccination','other')
    or v_target_scope not in ('mother','litter','all_offspring','organization') or v_priority not in ('normal','important','organization_critical')
  then return next; return; end if;
  select organization_id into v_org from public.litters where id=p_litter_id and deleted_at is null;
  if v_org is null then reason:='not_found'; return next; return; end if;
  if not public.has_organization_role(v_org,array['owner','admin','member']) then reason:='membership_required'; return next; return; end if;
  v_payload := jsonb_build_object('operation','update_metadata','litterId',p_litter_id,'litterPlanItemId',p_litter_plan_item_id,'expectedPlanRevision',p_expected_plan_revision,'expectedItemRevision',p_expected_item_revision,'expectedTaskRevision',p_expected_task_revision,'metadata',jsonb_build_object('version',1,'operation','update_metadata','title',v_title,'description',v_description,'category',v_category,'targetScope',v_target_scope,'priority',v_priority));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_plan_ad_hoc_metadata:'||v_org::text||':'||p_client_command_id::text,0));
  select * into v_command from public.litter_plan_ad_hoc_commands where organization_id=v_org and client_command_id=p_client_command_id;
  if found then
    if v_command.payload is distinct from v_payload then reason:='client_command_conflict'; return next; return; end if;
    outcome:=v_command.outcome; reason:=v_command.reason; litter_plan_id:=v_command.litter_plan_id; plan_revision:=v_command.result_plan_revision; litter_plan_item_id:=v_command.litter_plan_item_id; task_id:=v_command.task_id; result:=v_command.result; replayed:=true;
    item_revision:=nullif(v_command.result->>'itemRevision','')::integer; task_revision:=nullif(v_command.result->>'taskRevision','')::integer; return next; return;
  end if;
  perform public.acquire_litter_plan_mutation_lock(v_org,p_litter_id);
  select * into v_plan from public.litter_plans where organization_id=v_org and litter_id=p_litter_id and status='active' for update;
  select * into v_item from public.litter_plan_items where organization_id=v_org and litter_id=p_litter_id and id=p_litter_plan_item_id for update;
  if v_plan.id is null or v_item.id is null or v_item.litter_plan_id<>v_plan.id or v_item.origin_kind<>'ad_hoc' or v_item.item_kind not in ('milestone','task','window') or v_item.materialization_state<>'materialized' or v_item.source_planning_model_id is not null or v_item.organization_template_id is not null then reason:='not_found'; return next; return; end if;
  if v_plan.revision<>p_expected_plan_revision or v_item.revision_no<>p_expected_item_revision then reason:='stale_revision'; litter_plan_id:=v_plan.id; plan_revision:=v_plan.revision; litter_plan_item_id:=v_item.id; item_revision:=v_item.revision_no; return next; return; end if;
  select count(*) into v_task_count from public.litter_care_tasks t where t.organization_id=v_org and t.litter_plan_item_id=v_item.id;
  select * into v_task from public.litter_care_tasks t where t.organization_id=v_org and t.litter_plan_item_id=v_item.id for update;
  if v_task_count<>1 or v_task.id is null or v_task.litter_id<>v_item.litter_id or v_task.source<>'manual' or v_task.status<>'planned' or v_task.litter_plan_series_id is not null or v_task.item_kind<>v_item.item_kind or v_task.title is distinct from v_item.title or v_task.description is distinct from v_item.description or v_task.category is distinct from v_item.category or v_task.target_scope is distinct from v_item.target_scope or v_task.priority is distinct from v_item.priority then reason:='not_found'; return next; return; end if;
  if v_task.revision_no<>p_expected_task_revision then reason:='stale_revision'; litter_plan_id:=v_plan.id; plan_revision:=v_plan.revision; litter_plan_item_id:=v_item.id; item_revision:=v_item.revision_no; task_id:=v_task.id; task_revision:=v_task.revision_no; return next; return; end if;
  update public.litter_plan_items set title=v_title,description=v_description,category=v_category,target_scope=v_target_scope,priority=v_priority,revision_no=revision_no+1,updated_by=v_user where id=v_item.id returning * into v_item;
  update public.litter_care_tasks set title=v_title,description=v_description,category=v_category,target_scope=v_target_scope,priority=v_priority,revision_no=revision_no+1,updated_by=v_user where id=v_task.id returning * into v_task;
  update public.litter_plans set revision=revision+1,updated_by=v_user where id=v_plan.id returning * into v_plan;
  v_result:=jsonb_build_object('litterPlanId',v_plan.id,'litterPlanItemId',v_item.id,'taskId',v_task.id,'kind',v_item.item_kind,'planRevision',v_plan.revision,'itemRevision',v_item.revision_no,'taskRevision',v_task.revision_no);
  insert into public.litter_plan_ad_hoc_commands(organization_id,litter_id,litter_plan_id,litter_plan_item_id,task_id,client_command_id,payload,outcome,result,result_plan_revision,created_by) values(v_org,p_litter_id,v_plan.id,v_item.id,v_task.id,p_client_command_id,v_payload,'success',v_result,v_plan.revision,v_user);
  outcome:='success'; reason:=null; litter_plan_id:=v_plan.id; plan_revision:=v_plan.revision; litter_plan_item_id:=v_item.id; item_revision:=v_item.revision_no; task_id:=v_task.id; task_revision:=v_task.revision_no; result:=v_result; return next;
end;
$fn$;

revoke all on function public.update_litter_plan_ad_hoc_item_metadata(uuid,uuid,uuid,integer,integer,integer,jsonb) from public;
grant execute on function public.update_litter_plan_ad_hoc_item_metadata(uuid,uuid,uuid,integer,integer,integer,jsonb) to authenticated;

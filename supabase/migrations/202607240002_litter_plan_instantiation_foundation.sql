-- Immutable litter-level snapshots created from composite planning models.
create or replace function public.is_iana_timezone(p_timezone_name text)
returns boolean language sql stable security definer set search_path='' set row_security=off as $$
  select p_timezone_name=btrim(p_timezone_name)
    and exists (select 1 from pg_catalog.pg_timezone_names z where z.name=p_timezone_name);
$$;

create table public.litter_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  title text not null,
  status text not null default 'active',
  timezone_name text not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plans_org_id_key unique (organization_id,id),
  constraint litter_plans_org_litter_id_key unique (organization_id,litter_id,id),
  constraint litter_plans_litter_org_fk foreign key (organization_id,litter_id) references public.litters(organization_id,id) on delete restrict,
  constraint litter_plans_title_check check (char_length(btrim(title)) between 1 and 255),
  constraint litter_plans_status_check check (status in ('active','completed','cancelled')),
  constraint litter_plans_revision_check check (revision > 0),
  constraint litter_plans_timezone_check check (public.is_iana_timezone(timezone_name))
);
create unique index litter_plans_one_active_per_litter on public.litter_plans(organization_id,litter_id) where status='active';
create trigger litter_plans_set_updated_at before update on public.litter_plans for each row execute function public.set_updated_at();

create table public.litter_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_plan_id uuid not null, litter_id uuid not null,
  source_planning_model_id uuid not null, source_planning_model_revision integer not null,
  source_model_item_id uuid not null, source_model_display_order integer not null,
  organization_template_id uuid not null,
  item_kind text not null, priority text not null, category text not null, target_scope text not null,
  title text not null, description text,
  anchor_type text not null, anchor_resolution_source text, anchor_source_date_snapshot date,
  anchor_adjustment_days integer, anchor_date_snapshot date,
  point_offset_days integer, point_local_time time without time zone,
  window_starts_offset_days integer, window_starts_local_time time without time zone,
  window_ends_offset_days integer, window_ends_local_time time without time zone,
  is_required_snapshot boolean not null, is_selected_by_default_snapshot boolean not null,
  display_order integer not null, materialization_state text not null, materialized_at timestamptz,
  revision_no integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_plan_items_org_id_key unique(organization_id,id),
  constraint litter_plan_items_org_litter_id_key unique(organization_id,litter_id,id),
  constraint litter_plan_items_org_litter_plan_litter_key unique(organization_id,litter_id,litter_plan_id,id),
  constraint litter_plan_items_plan_fk foreign key(organization_id,litter_id,litter_plan_id) references public.litter_plans(organization_id,litter_id,id) on delete cascade,
  constraint litter_plan_items_model_fk foreign key(organization_id,source_planning_model_id) references public.litter_planning_models(organization_id,id) on delete restrict,
  constraint litter_plan_items_model_item_fk foreign key(organization_id,source_model_item_id) references public.litter_planning_model_items(organization_id,id) on delete restrict,
  constraint litter_plan_items_template_fk foreign key(organization_id,organization_template_id) references public.litter_care_task_templates(organization_id,id) on delete restrict,
  constraint litter_plan_items_kind_check check(item_kind in ('milestone','task','window')),
  constraint litter_plan_items_priority_check check(priority in ('normal','important','organization_critical')),
  constraint litter_plan_items_anchor_check check(anchor_type in ('first_mating','estimated_ovulation','expected_birth','actual_birth','offspring_age')),
  constraint litter_plan_items_resolution_check check(
    (materialization_state='pending_anchor' and materialized_at is null and anchor_resolution_source is null and anchor_source_date_snapshot is null and anchor_adjustment_days is null and anchor_date_snapshot is null)
    or (materialization_state='materialized' and materialized_at is not null and anchor_resolution_source in ('first_mating','estimated_ovulation','first_mating_minus_24h','expected_birth','actual_birth') and anchor_source_date_snapshot is not null and anchor_adjustment_days is not null and anchor_date_snapshot is not null and anchor_date_snapshot=anchor_source_date_snapshot+anchor_adjustment_days and ((anchor_type='estimated_ovulation' and anchor_resolution_source='first_mating_minus_24h' and anchor_adjustment_days=-1) or (not (anchor_type='estimated_ovulation' and anchor_resolution_source='first_mating_minus_24h') and anchor_adjustment_days=0)))
  ),
  constraint litter_plan_items_shape_check check(
    (item_kind in ('milestone','task') and point_offset_days is not null and window_starts_offset_days is null and window_starts_local_time is null and window_ends_offset_days is null and window_ends_local_time is null)
    or (item_kind='window' and point_offset_days is null and point_local_time is null and window_starts_offset_days is not null and window_ends_offset_days is not null and (window_starts_offset_days<window_ends_offset_days or (window_starts_offset_days=window_ends_offset_days and (window_starts_local_time is null or window_ends_local_time is null or window_starts_local_time<=window_ends_local_time))))
  ),
  constraint litter_plan_items_materialization_state_check check(materialization_state in ('pending_anchor','materialized')),
  constraint litter_plan_items_order_check check(display_order>=0 and source_model_display_order>=0 and source_planning_model_revision>0 and revision_no>0),
  constraint litter_plan_items_title_check check(char_length(btrim(title)) between 1 and 255),
  constraint litter_plan_items_description_check check(description is null or char_length(description)<=5000)
);
create unique index litter_plan_items_plan_display_order_key on public.litter_plan_items(organization_id,litter_plan_id,display_order);
create unique index litter_plan_items_source_identity_key on public.litter_plan_items(organization_id,litter_plan_id,source_planning_model_id,source_model_item_id);
create trigger litter_plan_items_set_updated_at before update on public.litter_plan_items for each row execute function public.set_updated_at();

alter table public.litter_care_tasks add column litter_plan_item_id uuid;
alter table public.litter_care_tasks add constraint litter_care_tasks_plan_item_fk foreign key(organization_id,litter_id,litter_plan_item_id) references public.litter_plan_items(organization_id,litter_id,id) on delete restrict;
drop index public.litter_care_tasks_template_occurrence_key;
create unique index litter_care_tasks_template_occurrence_key on public.litter_care_tasks(organization_id,litter_id,organization_template_id,occurrence_no) where organization_template_id is not null and litter_plan_item_id is null;
create unique index litter_care_tasks_plan_item_occurrence_key on public.litter_care_tasks(organization_id,litter_id,litter_plan_item_id,occurrence_no) where litter_plan_item_id is not null;
alter table public.litter_care_tasks drop constraint litter_care_tasks_source_values_check;
alter table public.litter_care_tasks add constraint litter_care_tasks_source_values_check check (
  (litter_plan_item_id is not null and source='organization_template' and organization_template_id is not null and system_template_code is null and anchor_type is not null and anchor_date is not null and ((item_kind in ('milestone','task') and offset_days is not null) or (item_kind='window' and offset_days is null)))
  or (litter_plan_item_id is null and ((source='manual' and organization_template_id is null and system_template_code is null and anchor_type is null and anchor_date is null and offset_days is null) or (source='organization_template' and organization_template_id is not null and system_template_code is null and anchor_type is not null and anchor_date is not null and offset_days is not null) or (source='system_template' and organization_template_id is null and system_template_code is not null and anchor_type is not null and anchor_date is not null and offset_days is not null)))
);

create table public.litter_plan_application_commands (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null, litter_plan_id uuid, planning_model_id uuid not null, client_command_id uuid not null,
  payload jsonb not null, outcome text not null, reason text, result jsonb not null,
  snapshot_count integer not null default 0, materialized_count integer not null default 0, pending_anchor_count integer not null default 0,
  result_plan_revision integer, created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  constraint litter_plan_application_commands_org_command_key unique(organization_id,client_command_id),
  constraint litter_plan_application_commands_litter_fk foreign key(organization_id,litter_id) references public.litters(organization_id,id) on delete restrict,
  constraint litter_plan_application_commands_model_fk foreign key(organization_id,planning_model_id) references public.litter_planning_models(organization_id,id) on delete restrict,
  constraint litter_plan_application_commands_plan_fk foreign key(organization_id,litter_plan_id) references public.litter_plans(organization_id,id) on delete restrict,
  constraint litter_plan_application_commands_payload_check check(jsonb_typeof(payload)='object'),
  constraint litter_plan_application_commands_outcome_check check(outcome in ('success','error')),
  constraint litter_plan_application_commands_counts_check check(snapshot_count>=0 and materialized_count>=0 and pending_anchor_count>=0)
);
alter table public.litter_plans enable row level security;
alter table public.litter_plan_items enable row level security;
alter table public.litter_plan_application_commands enable row level security;
create policy litter_plans_select_member on public.litter_plans for select to authenticated using(public.is_member_of(organization_id));
create policy litter_plan_items_select_member on public.litter_plan_items for select to authenticated using(public.is_member_of(organization_id));

create or replace function public.litter_plan_application_commands_immutable() returns trigger language plpgsql security definer set search_path='' set row_security=off as $$ begin if auth.uid() is not null then raise exception 'litter plan application commands are private' using errcode='42501'; end if; if tg_op='UPDATE' then raise exception 'litter plan application commands are immutable' using errcode='42501'; end if; return old; end; $$;
create trigger litter_plan_application_commands_append_only before update or delete on public.litter_plan_application_commands for each row execute function public.litter_plan_application_commands_immutable();

create or replace function public.apply_litter_planning_model(p_litter_id uuid,p_planning_model_id uuid,p_client_command_id uuid,p_expected_model_revision integer,p_expected_plan_revision integer,p_selected_model_item_ids uuid[],p_timezone_name text)
returns table(outcome text,litter_plan_id uuid,revision integer,result jsonb,replayed boolean,reason text)
language plpgsql security definer set search_path='' set row_security=off as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_role text; v_litter public.litters%rowtype; v_model public.litter_planning_models%rowtype; v_plan public.litter_plans%rowtype; v_command public.litter_plan_application_commands%rowtype; v_payload jsonb; v_item public.litter_planning_model_items%rowtype; v_template public.litter_care_task_templates%rowtype; v_plan_item_id uuid; v_anchor date; v_source_date date; v_source text; v_adjust integer; v_suggested date; v_start date; v_end date; v_selected uuid[]; v_count integer; v_materialized integer:=0; v_pending integer:=0; v_result jsonb:='[]'::jsonb;
begin
 outcome:='error'; litter_plan_id:=null; revision:=null; result:='[]'::jsonb; replayed:=false; reason:=null;
 if v_user is null then reason:='not_authenticated'; return next; return; end if;
 if p_litter_id is null or p_planning_model_id is null or p_client_command_id is null or p_expected_model_revision is null or p_expected_model_revision<=0 or p_timezone_name is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_timezone_name) then reason:='invalid_input'; return next; return; end if;
 select l.organization_id into v_org from public.litters l where l.id=p_litter_id; if not found then reason:='not_found'; return next; return; end if;
 select m.role into v_role from public.memberships m where m.organization_id=v_org and m.profile_id=v_user and m.status='active' and m.deleted_at is null for share; if not found then reason:='not_found'; return next; return; end if; if v_role not in ('owner','admin','member') then reason:='membership_required'; return next; return; end if;
 v_payload:=jsonb_build_object('litterId',p_litter_id,'planningModelId',p_planning_model_id,'expectedModelRevision',p_expected_model_revision,'expectedPlanRevision',p_expected_plan_revision,'selectedModelItemIds',coalesce(to_jsonb(p_selected_model_item_ids),'null'::jsonb),'timezoneName',p_timezone_name);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_plan_application_commands:'||v_org::text||':'||p_client_command_id::text,0));
 select * into v_command from public.litter_plan_application_commands c where c.organization_id=v_org and c.client_command_id=p_client_command_id for update;
 if found then if v_command.payload<>v_payload then reason:='client_command_conflict'; return next; return; end if; outcome:=v_command.outcome;litter_plan_id:=v_command.litter_plan_id;revision:=v_command.result_plan_revision;result:=v_command.result;reason:=v_command.reason;replayed:=true;return next;return;end if;
 select * into v_litter from public.litters l where l.organization_id=v_org and l.id=p_litter_id for update;
 if not found or v_litter.deleted_at is not null or v_litter.status not in ('mating_done','pregnancy_unconfirmed','pregnancy_confirmed','birth_expected','birth_in_progress','born','puppies_created','choice_period','ready_to_leave') then insert into public.litter_plan_application_commands(organization_id,litter_id,planning_model_id,client_command_id,payload,outcome,reason,result,created_by) values(v_org,p_litter_id,p_planning_model_id,p_client_command_id,v_payload,'error','invalid_litter','[]',v_user);reason:='invalid_litter';return next;return;end if;
 select * into v_model from public.litter_planning_models m where m.organization_id=v_org and m.id=p_planning_model_id for update;
 if not found then reason:='not_found';return next;return;end if;
 if not v_model.is_active or v_model.revision<>p_expected_model_revision or (v_model.species is not null and v_model.species<>v_litter.species) or (v_model.breed is not null and lower(btrim(v_model.breed))<>lower(btrim(v_litter.breed))) then insert into public.litter_plan_application_commands(organization_id,litter_id,planning_model_id,client_command_id,payload,outcome,reason,result,created_by) values(v_org,p_litter_id,p_planning_model_id,p_client_command_id,v_payload,'error','stale_model','[]',v_user);reason:='stale_model';return next;return;end if;
 select array_agg(i.id order by i.display_order) into v_selected from public.litter_planning_model_items i where i.organization_id=v_org and i.model_id=v_model.id and (p_selected_model_item_ids is null and (i.is_required or i.is_selected_by_default) or p_selected_model_item_ids is not null and i.id=any(p_selected_model_item_ids));
 if p_selected_model_item_ids is not null and (cardinality(p_selected_model_item_ids)<>cardinality(array(select distinct x from unnest(p_selected_model_item_ids) x)) or cardinality(v_selected)<>cardinality(p_selected_model_item_ids) or exists(select 1 from public.litter_planning_model_items i where i.organization_id=v_org and i.model_id=v_model.id and i.is_required and not i.id=any(p_selected_model_item_ids))) then v_selected:=null; end if;
 if coalesce(cardinality(v_selected),0)=0 then insert into public.litter_plan_application_commands(organization_id,litter_id,planning_model_id,client_command_id,payload,outcome,reason,result,created_by) values(v_org,p_litter_id,p_planning_model_id,p_client_command_id,v_payload,'error','invalid_selection','[]',v_user);reason:='invalid_selection';return next;return;end if;
 perform i.id from public.litter_planning_model_items i where i.id=any(v_selected) order by i.id for update;
 perform t.id from public.litter_care_task_templates t join public.litter_planning_model_items i on i.organization_template_id=t.id and i.organization_id=t.organization_id where i.id=any(v_selected) order by t.id for update;
 if exists(select 1 from public.litter_planning_model_items i join public.litter_care_task_templates t on t.organization_id=i.organization_id and t.id=i.organization_template_id where i.id=any(v_selected) and (not t.is_active or t.species<>v_litter.species or (t.breed is not null and lower(btrim(t.breed))<>lower(btrim(v_litter.breed))))) then reason:='stale_model';return next;return;end if;
 select * into v_plan from public.litter_plans p where p.organization_id=v_org and p.litter_id=p_litter_id and p.status='active' for update;
 if found and (p_expected_plan_revision is null or p_expected_plan_revision<>v_plan.revision) then insert into public.litter_plan_application_commands(organization_id,litter_id,litter_plan_id,planning_model_id,client_command_id,payload,outcome,reason,result,result_plan_revision,created_by) values(v_org,p_litter_id,v_plan.id,p_planning_model_id,p_client_command_id,v_payload,'error','stale_plan','[]',v_plan.revision,v_user);reason:='stale_plan';litter_plan_id:=v_plan.id;revision:=v_plan.revision;return next;return;end if;
 if exists(select 1 from public.litter_plan_items pi where pi.organization_id=v_org and pi.litter_plan_id=v_plan.id and pi.source_planning_model_id=v_model.id) then insert into public.litter_plan_application_commands(organization_id,litter_id,litter_plan_id,planning_model_id,client_command_id,payload,outcome,reason,result,result_plan_revision,created_by) values(v_org,p_litter_id,v_plan.id,p_planning_model_id,p_client_command_id,v_payload,'error','model_already_applied','[]',v_plan.revision,v_user);reason:='model_already_applied';litter_plan_id:=v_plan.id;revision:=v_plan.revision;return next;return;end if;
 if not found then insert into public.litter_plans(organization_id,litter_id,title,timezone_name,created_by,updated_by) values(v_org,p_litter_id,v_litter.name,p_timezone_name,v_user,v_user) returning * into v_plan; else update public.litter_plans as lp set revision=lp.revision+1,timezone_name=p_timezone_name,updated_by=v_user where lp.id=v_plan.id returning * into v_plan; end if;
 for v_item in select * from public.litter_planning_model_items i where i.id=any(v_selected) order by i.display_order loop
  select * into v_template from public.litter_care_task_templates t where t.organization_id=v_org and t.id=v_item.organization_template_id;
  v_source:=null;v_source_date:=null;v_adjust:=null;v_anchor:=null;
  if v_item.anchor_type='first_mating' and v_litter.mating_date is not null then v_source:='first_mating';v_source_date:=v_litter.mating_date;v_adjust:=0;
  elsif v_item.anchor_type='estimated_ovulation' and v_litter.estimated_ovulation_date is not null then v_source:='estimated_ovulation';v_source_date:=v_litter.estimated_ovulation_date;v_adjust:=0;
  elsif v_item.anchor_type='estimated_ovulation' and v_litter.mating_date is not null then v_source:='first_mating_minus_24h';v_source_date:=v_litter.mating_date;v_adjust:=-1;
  elsif v_item.anchor_type='expected_birth' and v_litter.expected_birth_date is not null then v_source:='expected_birth';v_source_date:=v_litter.expected_birth_date;v_adjust:=0;
  elsif v_item.anchor_type in ('actual_birth','offspring_age') and v_litter.actual_birth_date is not null then v_source:='actual_birth';v_source_date:=v_litter.actual_birth_date;v_adjust:=0; end if;
  if v_source_date is not null then v_anchor:=v_source_date+v_adjust; end if;
  insert into public.litter_plan_items(organization_id,litter_plan_id,litter_id,source_planning_model_id,source_planning_model_revision,source_model_item_id,source_model_display_order,organization_template_id,item_kind,priority,category,target_scope,title,description,anchor_type,anchor_resolution_source,anchor_source_date_snapshot,anchor_adjustment_days,anchor_date_snapshot,point_offset_days,point_local_time,window_starts_offset_days,window_starts_local_time,window_ends_offset_days,window_ends_local_time,is_required_snapshot,is_selected_by_default_snapshot,display_order,materialization_state,materialized_at,created_by,updated_by) values(v_org,v_plan.id,p_litter_id,v_model.id,v_model.revision,v_item.id,v_item.display_order,v_template.id,v_item.item_kind,v_item.priority,v_template.category,v_template.target_scope,v_template.title,v_template.description,v_item.anchor_type,v_source,v_source_date,v_adjust,v_anchor,v_item.point_offset_days,v_item.point_local_time,v_item.window_starts_offset_days,v_item.window_starts_local_time,v_item.window_ends_offset_days,v_item.window_ends_local_time,v_item.is_required,v_item.is_selected_by_default,v_item.display_order,case when v_anchor is null then 'pending_anchor' else 'materialized' end,case when v_anchor is null then null else now() end,v_user,v_user) returning id into v_plan_item_id;
  if v_anchor is null then v_pending:=v_pending+1;v_result:=v_result||jsonb_build_array(jsonb_build_object('planItemId',v_plan_item_id,'state','pending_anchor'));continue;end if;
  begin
   if v_item.item_kind='window' then v_start:=v_anchor+v_item.window_starts_offset_days;v_end:=v_anchor+v_item.window_ends_offset_days; insert into public.litter_care_tasks(organization_id,litter_id,litter_plan_item_id,source,organization_template_id,occurrence_no,category,target_scope,title,description,anchor_type,anchor_date,offset_days,planned_for,item_kind,priority,suggested_starts_on,suggested_starts_local_time,suggested_ends_on,suggested_ends_local_time,retained_starts_on,retained_starts_local_time,retained_ends_on,retained_ends_local_time,schedule_timezone_name,schedule_source,creation_command_id,created_by,updated_by) values(v_org,p_litter_id,v_plan_item_id,'organization_template',v_template.id,1,v_template.category,v_template.target_scope,v_template.title,v_template.description,v_item.anchor_type,v_anchor,null,null,'window',v_item.priority,v_start,v_item.window_starts_local_time,v_end,v_item.window_ends_local_time,v_start,v_item.window_starts_local_time,v_end,v_item.window_ends_local_time,v_plan.timezone_name,'suggested',gen_random_uuid(),v_user,v_user);
   else v_suggested:=v_anchor+v_item.point_offset_days; insert into public.litter_care_tasks(organization_id,litter_id,litter_plan_item_id,source,organization_template_id,occurrence_no,category,target_scope,title,description,anchor_type,anchor_date,offset_days,planned_for,item_kind,priority,suggested_for,suggested_local_time,scheduled_local_time,schedule_timezone_name,schedule_source,creation_command_id,created_by,updated_by) values(v_org,p_litter_id,v_plan_item_id,'organization_template',v_template.id,1,v_template.category,v_template.target_scope,v_template.title,v_template.description,v_item.anchor_type,v_anchor,v_item.point_offset_days,v_suggested,v_item.item_kind,v_item.priority,v_suggested,v_item.point_local_time,v_item.point_local_time,v_plan.timezone_name,'suggested',gen_random_uuid(),v_user,v_user); end if;
  exception when datetime_field_overflow then raise exception 'schedule_out_of_range' using errcode='22008'; end;
  v_materialized:=v_materialized+1;v_result:=v_result||jsonb_build_array(jsonb_build_object('planItemId',v_plan_item_id,'state','materialized'));
 end loop;
 insert into public.litter_plan_application_commands(organization_id,litter_id,litter_plan_id,planning_model_id,client_command_id,payload,outcome,result,snapshot_count,materialized_count,pending_anchor_count,result_plan_revision,created_by) values(v_org,p_litter_id,v_plan.id,v_model.id,p_client_command_id,v_payload,'success',v_result,cardinality(v_selected),v_materialized,v_pending,v_plan.revision,v_user);
 outcome:='success';litter_plan_id:=v_plan.id;revision:=v_plan.revision;result:=v_result;return next;
exception when datetime_field_overflow then reason:='schedule_out_of_range';raise; end $$;

grant select on public.litter_plans, public.litter_plan_items to authenticated;
revoke all on public.litter_plan_application_commands from anon,authenticated;
revoke all on function public.litter_plan_application_commands_immutable() from public;
revoke all on function public.apply_litter_planning_model(uuid,uuid,uuid,integer,integer,uuid[],text) from public;
grant execute on function public.apply_litter_planning_model(uuid,uuid,uuid,integer,integer,uuid[],text) to authenticated;

create table public.litter_planning_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  description text,
  species text,
  breed text,
  is_active boolean not null default true,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_planning_models_organization_id_id_key unique (organization_id, id),
  constraint litter_planning_models_title_check check (char_length(btrim(title)) between 1 and 255),
  constraint litter_planning_models_description_check check (description is null or char_length(description) <= 5000),
  constraint litter_planning_models_species_check check (species is null or species in ('dog', 'cat')),
  constraint litter_planning_models_breed_check check (breed is null or char_length(btrim(breed)) between 1 and 255),
  constraint litter_planning_models_revision_check check (revision > 0)
);

create index litter_planning_models_active_org_order_idx
  on public.litter_planning_models (organization_id, title) where is_active;

create trigger litter_planning_models_set_updated_at
before update on public.litter_planning_models
for each row execute function public.set_updated_at();

create table public.litter_planning_model_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_id uuid not null,
  organization_template_id uuid not null,
  item_kind text not null,
  priority text not null default 'normal',
  anchor_type text not null,
  point_offset_days integer,
  point_local_time time without time zone,
  window_starts_offset_days integer,
  window_starts_local_time time without time zone,
  window_ends_offset_days integer,
  window_ends_local_time time without time zone,
  display_order integer not null,
  is_required boolean not null default true,
  is_selected_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_planning_model_items_organization_id_id_key unique (organization_id, id),
  constraint litter_planning_model_items_model_organization_fk foreign key (organization_id, model_id)
    references public.litter_planning_models (organization_id, id) on delete cascade,
  constraint litter_planning_model_items_template_organization_fk foreign key (organization_id, organization_template_id)
    references public.litter_care_task_templates (organization_id, id) on delete restrict,
  constraint litter_planning_model_items_kind_check check (item_kind in ('milestone', 'task', 'window')),
  constraint litter_planning_model_items_priority_check check (priority in ('normal', 'important', 'organization_critical')),
  constraint litter_planning_model_items_anchor_check check (anchor_type in ('first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth', 'offspring_age')),
  constraint litter_planning_model_items_display_order_check check (display_order >= 0),
  constraint litter_planning_model_items_required_selection_check check (not is_required or is_selected_by_default),
  constraint litter_planning_model_items_schedule_shape_check check (
    (item_kind in ('milestone', 'task')
      and point_offset_days is not null
      and window_starts_offset_days is null and window_starts_local_time is null
      and window_ends_offset_days is null and window_ends_local_time is null)
    or
    (item_kind = 'window'
      and point_offset_days is null and point_local_time is null
      and window_starts_offset_days is not null and window_ends_offset_days is not null
      and (window_starts_offset_days < window_ends_offset_days
        or (window_starts_offset_days = window_ends_offset_days and (
          window_starts_local_time is null or window_ends_local_time is null
          or window_starts_local_time <= window_ends_local_time))))
  )
);

create unique index litter_planning_model_items_display_order_key
  on public.litter_planning_model_items (organization_id, model_id, display_order);
create index litter_planning_model_items_model_order_idx
  on public.litter_planning_model_items (organization_id, model_id, display_order);

create trigger litter_planning_model_items_set_updated_at
before update on public.litter_planning_model_items
for each row execute function public.set_updated_at();

create table public.litter_planning_model_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_id uuid not null,
  client_command_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result_revision integer not null,
  result_is_active boolean not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_planning_model_commands_organization_id_id_key unique (organization_id, id),
  constraint litter_planning_model_commands_org_command_key unique (organization_id, client_command_id),
  constraint litter_planning_model_commands_model_organization_fk foreign key (organization_id, model_id)
    references public.litter_planning_models (organization_id, id) on delete restrict,
  constraint litter_planning_model_commands_operation_check check (operation in ('create', 'replace', 'set_active')),
  constraint litter_planning_model_commands_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint litter_planning_model_commands_result_revision_check check (result_revision > 0)
);

create index litter_planning_model_commands_model_created_at_idx
  on public.litter_planning_model_commands (organization_id, model_id, created_at);

alter table public.litter_planning_models enable row level security;
alter table public.litter_planning_model_items enable row level security;
alter table public.litter_planning_model_commands enable row level security;

create policy litter_planning_models_select_member on public.litter_planning_models for select using (
  exists (select 1 from public.memberships m where m.organization_id = litter_planning_models.organization_id and m.profile_id = auth.uid() and m.status = 'active' and m.deleted_at is null)
);
create policy litter_planning_model_items_select_member on public.litter_planning_model_items for select using (
  exists (select 1 from public.memberships m where m.organization_id = litter_planning_model_items.organization_id and m.profile_id = auth.uid() and m.status = 'active' and m.deleted_at is null)
);

create or replace function public.litter_planning_model_commands_immutable()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin raise exception 'litter planning model commands are append-only' using errcode = '42501'; end;
$$;
create trigger litter_planning_model_commands_append_only before update or delete on public.litter_planning_model_commands for each row execute function public.litter_planning_model_commands_immutable();

create or replace function public.assert_litter_planning_model_items(p_items jsonb)
returns boolean language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_item jsonb; v_count integer := 0; v_orders integer[] := '{}';
begin
  if jsonb_typeof(p_items) <> 'array' then return false; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'organizationTemplateId' and v_item ? 'itemKind' and v_item ? 'priority' and v_item ? 'anchorType' and v_item ? 'displayOrder' and v_item ? 'isRequired' and v_item ? 'isSelectedByDefault')
      or coalesce(v_item->>'itemKind','') not in ('milestone','task','window')
      or coalesce(v_item->>'priority','') not in ('normal','important','organization_critical')
      or coalesce(v_item->>'anchorType','') not in ('first_mating','estimated_ovulation','expected_birth','actual_birth','offspring_age')
      or (v_item->>'organizationTemplateId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (v_item->>'displayOrder') !~ '^[0-9]+$'
      or jsonb_typeof(v_item->'isRequired') <> 'boolean' or jsonb_typeof(v_item->'isSelectedByDefault') <> 'boolean'
    then return false; end if;
    v_orders := array_append(v_orders, (v_item->>'displayOrder')::integer);
    if v_item->>'itemKind' in ('milestone','task') then
      if not (v_item ? 'pointOffsetDays') or (v_item->>'pointOffsetDays') !~ '^-?[0-9]+$'
        or v_item ? 'windowStartsOffsetDays' or v_item ? 'windowStartsLocalTime' or v_item ? 'windowEndsOffsetDays' or v_item ? 'windowEndsLocalTime' then return false; end if;
    else
      if v_item ? 'pointOffsetDays' or v_item ? 'pointLocalTime' or not (v_item ? 'windowStartsOffsetDays' and v_item ? 'windowEndsOffsetDays')
        or (v_item->>'windowStartsOffsetDays') !~ '^-?[0-9]+$' or (v_item->>'windowEndsOffsetDays') !~ '^-?[0-9]+$' then return false; end if;
    end if;
  end loop;
  return v_count <= 100 and cardinality(v_orders) = cardinality(array(select distinct unnest(v_orders)));
end; $$;

create or replace function public.mutate_litter_planning_model(
  p_operation text, p_model_id uuid, p_organization_id uuid, p_client_command_id uuid, p_expected_revision integer,
  p_title text, p_description text, p_species text, p_breed text, p_is_active boolean, p_items jsonb
) returns table(outcome text, model_id uuid, revision integer, is_active boolean, replayed boolean, reason text)
language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_user_id uuid := auth.uid(); v_org uuid; v_role text; v_model public.litter_planning_models%rowtype; v_command public.litter_planning_model_commands%rowtype;
  v_payload jsonb; v_item jsonb;
begin
  outcome := 'error'; model_id := p_model_id; revision := null; is_active := null; replayed := false; reason := null;
  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_operation not in ('create','replace','set_active') or p_client_command_id is null then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then v_org := p_organization_id; else select organization_id into v_org from public.litter_planning_models where id = p_model_id; end if;
  if v_org is null or not exists(select 1 from public.organizations where id=v_org and deleted_at is null) then reason := 'model_not_found'; return next; return; end if;
  select role into v_role from public.memberships where organization_id=v_org and profile_id=v_user_id and status='active' and deleted_at is null for share;
  if not found or v_role not in ('owner','admin') then reason := 'membership_required'; return next; return; end if;
  v_payload := jsonb_build_object('operation',p_operation,'modelId',p_model_id,'organizationId',case when p_operation='create' then v_org else null end,'expectedRevision',p_expected_revision,'title',p_title,'description',p_description,'species',p_species,'breed',p_breed,'isActive',p_is_active,'items',coalesce(p_items,'null'::jsonb));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('litter_planning_model_commands:'||v_org::text||':'||p_client_command_id::text,0));
  select * into v_command from public.litter_planning_model_commands where organization_id=v_org and client_command_id=p_client_command_id;
  if found then
    if v_command.operation <> p_operation or v_command.payload <> v_payload then reason := 'client_command_conflict'; return next; return; end if;
    outcome := 'success'; model_id := v_command.model_id; revision := v_command.result_revision; is_active := v_command.result_is_active; replayed := true; return next; return;
  end if;
  if p_operation in ('create','replace') and (p_title is null or char_length(btrim(p_title)) not between 1 and 255 or (p_description is not null and char_length(btrim(p_description)) > 5000) or p_species is not null and p_species not in ('dog','cat') or p_breed is not null and char_length(btrim(p_breed)) not between 1 and 255 or not public.assert_litter_planning_model_items(p_items)) then reason := 'invalid_input'; return next; return; end if;
  if p_operation = 'create' then
    insert into public.litter_planning_models(organization_id,title,description,species,breed,is_active,revision,created_by,updated_by) values(v_org,btrim(p_title),nullif(btrim(p_description),''),p_species,case when p_breed is null then null else btrim(p_breed) end,coalesce(p_is_active,true),1,v_user_id,v_user_id) returning * into v_model;
  else
    select * into v_model from public.litter_planning_models where organization_id=v_org and id=p_model_id for update;
    if not found then reason := 'model_not_found'; return next; return; end if;
    if p_expected_revision is null or p_expected_revision <= 0 then reason := 'invalid_input'; return next; return; end if;
    if v_model.revision <> p_expected_revision then reason := 'stale_revision'; return next; return; end if;
    if p_operation='replace' then
      update public.litter_planning_models set title=btrim(p_title),description=nullif(btrim(p_description),''),species=p_species,breed=case when p_breed is null then null else btrim(p_breed) end,revision=revision+1,updated_by=v_user_id where id=v_model.id returning * into v_model;
      delete from public.litter_planning_model_items where organization_id=v_org and model_id=v_model.id;
    elsif v_model.is_active is distinct from p_is_active then
      update public.litter_planning_models set is_active=p_is_active,revision=revision+1,updated_by=v_user_id where id=v_model.id returning * into v_model;
    end if;
  end if;
  if p_operation in ('create','replace') then
    for v_item in select value from jsonb_array_elements(p_items) loop
      insert into public.litter_planning_model_items(organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,point_offset_days,point_local_time,window_starts_offset_days,window_starts_local_time,window_ends_offset_days,window_ends_local_time,display_order,is_required,is_selected_by_default,created_by,updated_by)
      values(v_org,v_model.id,(v_item->>'organizationTemplateId')::uuid,v_item->>'itemKind',v_item->>'priority',v_item->>'anchorType',case when v_item ? 'pointOffsetDays' then (v_item->>'pointOffsetDays')::integer end,case when v_item ? 'pointLocalTime' then (v_item->>'pointLocalTime')::time end,case when v_item ? 'windowStartsOffsetDays' then (v_item->>'windowStartsOffsetDays')::integer end,case when v_item ? 'windowStartsLocalTime' then (v_item->>'windowStartsLocalTime')::time end,case when v_item ? 'windowEndsOffsetDays' then (v_item->>'windowEndsOffsetDays')::integer end,case when v_item ? 'windowEndsLocalTime' then (v_item->>'windowEndsLocalTime')::time end,(v_item->>'displayOrder')::integer,(v_item->>'isRequired')::boolean,(v_item->>'isSelectedByDefault')::boolean,v_user_id,v_user_id);
    end loop;
  end if;
  insert into public.litter_planning_model_commands(organization_id,model_id,client_command_id,operation,payload,result_revision,result_is_active,created_by) values(v_org,v_model.id,p_client_command_id,p_operation,v_payload,v_model.revision,v_model.is_active,v_user_id);
  outcome := 'success'; model_id := v_model.id; revision := v_model.revision; is_active := v_model.is_active; return next;
end; $$;

create or replace function public.create_litter_planning_model(p_organization_id uuid,p_client_command_id uuid,p_title text,p_description text,p_species text,p_breed text,p_is_active boolean,p_items jsonb)
returns table(outcome text,model_id uuid,revision integer,is_active boolean,replayed boolean,reason text) language sql security definer set search_path = '' as $$ select * from public.mutate_litter_planning_model('create',null,p_organization_id,p_client_command_id,null,p_title,p_description,p_species,p_breed,p_is_active,p_items); $$;
create or replace function public.replace_litter_planning_model(p_model_id uuid,p_client_command_id uuid,p_expected_revision integer,p_title text,p_description text,p_species text,p_breed text,p_items jsonb)
returns table(outcome text,model_id uuid,revision integer,is_active boolean,replayed boolean,reason text) language sql security definer set search_path = '' as $$ select * from public.mutate_litter_planning_model('replace',p_model_id,null,p_client_command_id,p_expected_revision,p_title,p_description,p_species,p_breed,null,p_items); $$;
create or replace function public.set_litter_planning_model_active(p_model_id uuid,p_client_command_id uuid,p_expected_revision integer,p_is_active boolean)
returns table(outcome text,model_id uuid,revision integer,is_active boolean,replayed boolean,reason text) language sql security definer set search_path = '' as $$ select * from public.mutate_litter_planning_model('set_active',p_model_id,null,p_client_command_id,p_expected_revision,null,null,null,null,p_is_active,null); $$;

revoke all on table public.litter_planning_model_commands from anon, authenticated;
revoke all on function public.litter_planning_model_commands_immutable() from public;
revoke all on function public.assert_litter_planning_model_items(jsonb) from public;
revoke all on function public.mutate_litter_planning_model(text,uuid,uuid,uuid,integer,text,text,text,text,boolean,jsonb) from public;
revoke all on function public.create_litter_planning_model(uuid,uuid,text,text,text,text,boolean,jsonb) from public;
grant execute on function public.create_litter_planning_model(uuid,uuid,text,text,text,text,boolean,jsonb) to authenticated;
revoke all on function public.replace_litter_planning_model(uuid,uuid,integer,text,text,text,text,jsonb) from public;
grant execute on function public.replace_litter_planning_model(uuid,uuid,integer,text,text,text,text,jsonb) to authenticated;
revoke all on function public.set_litter_planning_model_active(uuid,uuid,integer,boolean) from public;
grant execute on function public.set_litter_planning_model_active(uuid,uuid,integer,boolean) to authenticated;

comment on table public.litter_planning_model_commands is 'Private idempotency registry for composed litter planning model mutations.';

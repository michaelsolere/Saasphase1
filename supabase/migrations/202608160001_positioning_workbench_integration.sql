begin;

alter table public.post_birth_positioning_lines
  add column active_order integer,
  add column has_order_override boolean not null default false,
  add column preference_exception_active boolean not null default false,
  add column preference_exception_reason text,
  add column preference_exception_manual_contact_id uuid references public.adopter_manual_contacts(id);

alter table public.post_birth_positioning_lines
  add constraint post_birth_line_active_order_check check (active_order is null or active_order > 0),
  add constraint post_birth_line_preference_exception_check check (
    (not preference_exception_active and preference_exception_reason is null and preference_exception_manual_contact_id is null)
    or (preference_exception_active and length(btrim(preference_exception_reason)) >= 5 and preference_exception_manual_contact_id is not null)
  );

with ranked as (
  select line.id,
    row_number() over (
      partition by line.wave_id, line.proposed_sex
      order by line.rank_snapshot, line.id
    )::integer as active_order
  from public.post_birth_positioning_lines line
  where line.proposed_outcome='place' and line.proposed_sex is not null
)
update public.post_birth_positioning_lines line
set active_order=ranked.active_order
from ranked where ranked.id=line.id;

create index post_birth_line_active_file_idx
  on public.post_birth_positioning_lines(organization_id,wave_id,proposed_sex,active_order)
  where proposed_outcome='place';

create or replace function public.assign_post_birth_line_active_order()
returns trigger language plpgsql set search_path='' as $$
declare v_order integer;
begin
  if current_setting('app.post_birth_file_mutation',true)='on' then return new;end if;
  if tg_op='UPDATE' and old.proposed_outcome='place' and old.proposed_sex is not null and old.active_order is not null then
    perform set_config('app.post_birth_file_mutation','on',true);
    update public.post_birth_positioning_lines line set active_order=line.active_order-1
    where line.wave_id=old.wave_id and line.proposed_sex=old.proposed_sex and line.proposed_outcome='place' and line.id<>new.id and line.active_order>old.active_order;
  end if;
  if new.proposed_outcome='place' and new.proposed_sex is not null and (tg_op='INSERT' or old.proposed_outcome<>'place' or old.proposed_sex is distinct from new.proposed_sex) then
    perform set_config('app.post_birth_file_mutation','on',true);
    select count(*)+1 into v_order from public.post_birth_positioning_lines line
    where line.wave_id=new.wave_id and line.proposed_sex=new.proposed_sex and line.proposed_outcome='place' and line.id<>new.id
      and (line.rank_snapshot<new.rank_snapshot or (line.rank_snapshot=new.rank_snapshot and line.id<new.id));
    update public.post_birth_positioning_lines line set active_order=line.active_order+1
    where line.wave_id=new.wave_id and line.proposed_sex=new.proposed_sex and line.proposed_outcome='place' and line.id<>new.id and line.active_order>=v_order;
    update public.post_birth_positioning_lines set active_order=v_order,has_order_override=false where id=new.id;
  end if;
  perform set_config('app.post_birth_file_mutation','off',true);return new;
end;
$$;
create trigger post_birth_line_active_order_assignment after insert or update of wave_id,proposed_sex,proposed_outcome on public.post_birth_positioning_lines for each row execute function public.assign_post_birth_line_active_order();

create or replace function public.override_post_birth_active_order(
  p_line_id uuid,
  p_target_order integer,
  p_reason text,
  p_expected_wave_version integer,
  p_client_command_id uuid
)
returns table(outcome text,line_id uuid,version integer,active_order integer,reason text)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();v_line public.post_birth_positioning_lines%rowtype;
  v_wave public.post_birth_positioning_waves%rowtype;v_role text;v_before integer;
  v_total integer;v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  line_id:=p_line_id;version:=null;active_order:=null;reason:=null;
  select * into v_line from public.post_birth_positioning_lines where id=p_line_id for update;
  if not found then outcome:='not_eligible';reason:='line_not_found';return next;return;end if;
  select * into v_wave from public.post_birth_positioning_waves where id=v_line.wave_id for update;
  v_role:=public.post_birth_owner_admin_role(v_line.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_line.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';version:=(v_command.result->>'version')::integer;active_order:=(v_command.result->>'activeOrder')::integer;return next;return;end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then outcome:='not_eligible';reason:='reason_required';return next;return;end if;
  if v_wave.status<>'open' or v_wave.version<>p_expected_wave_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
  if v_line.proposed_outcome<>'place' or v_line.proposed_sex is null or v_line.active_order is null then outcome:='not_eligible';reason:='active_file_required';return next;return;end if;
  perform 1 from public.post_birth_positioning_lines line where line.wave_id=v_line.wave_id and line.proposed_sex=v_line.proposed_sex and line.proposed_outcome='place' for update;
  select count(*) into v_total from public.post_birth_positioning_lines line where line.wave_id=v_line.wave_id and line.proposed_sex=v_line.proposed_sex and line.proposed_outcome='place';
  if p_target_order<1 or p_target_order>v_total then outcome:='not_eligible';reason:='target_order_invalid';return next;return;end if;
  v_before:=v_line.active_order;
  if p_target_order<v_before then
    update public.post_birth_positioning_lines line set active_order=line.active_order+1,updated_at=clock_timestamp(),updated_by=v_user
    where line.wave_id=v_line.wave_id and line.proposed_sex=v_line.proposed_sex and line.proposed_outcome='place' and line.id<>v_line.id and line.active_order>=p_target_order and line.active_order<v_before;
  elsif p_target_order>v_before then
    update public.post_birth_positioning_lines line set active_order=line.active_order-1,updated_at=clock_timestamp(),updated_by=v_user
    where line.wave_id=v_line.wave_id and line.proposed_sex=v_line.proposed_sex and line.proposed_outcome='place' and line.id<>v_line.id and line.active_order>v_before and line.active_order<=p_target_order;
  end if;
  update public.post_birth_positioning_lines set active_order=p_target_order,has_order_override=true,version=post_birth_positioning_lines.version+1,updated_at=clock_timestamp(),updated_by=v_user where id=v_line.id;
  update public.post_birth_positioning_waves wave set version=wave.version+1 where wave.id=v_wave.id returning wave.version into version;
  insert into public.post_birth_positioning_events(organization_id,litter_id,reservation_id,wave_id,event_type,actor_profile_id,actor_role,reason,details,client_command_id)
  values(v_line.organization_id,v_wave.litter_id,v_line.reservation_id,v_wave.id,'post_birth_active_order_overridden',v_user,v_role,btrim(p_reason),jsonb_build_object('beforeOrder',v_before,'afterOrder',p_target_order,'historicalRank',v_line.rank_snapshot,'sex',v_line.proposed_sex),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
  values(v_line.organization_id,p_client_command_id,'override_active_order',v_line.id,jsonb_build_object('outcome','updated','lineId',v_line.id,'version',version,'activeOrder',p_target_order),array[v_event],v_user);
  outcome:='updated';active_order:=p_target_order;return next;
end;
$$;

create or replace function public.move_post_birth_proposal(
  p_line_id uuid,
  p_destination_litter_id uuid,
  p_destination_sex text,
  p_reason text,
  p_manual_contact_id uuid,
  p_expected_wave_version integer,
  p_client_command_id uuid
)
returns table(outcome text,line_id uuid,version integer,active_order integer,preference_exception boolean,reason text)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();v_line public.post_birth_positioning_lines%rowtype;v_source public.post_birth_positioning_waves%rowtype;
  v_destination public.post_birth_positioning_waves%rowtype;v_reservation public.reservations%rowtype;v_role text;v_preference text;
  v_incompatible boolean;v_new_order integer;v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  line_id:=p_line_id;version:=null;active_order:=null;preference_exception:=false;reason:=null;
  select * into v_line from public.post_birth_positioning_lines where id=p_line_id for update;
  if not found then outcome:='not_eligible';reason:='line_not_found';return next;return;end if;
  select * into v_source from public.post_birth_positioning_waves where id=v_line.wave_id;
  v_role:=public.post_birth_owner_admin_role(v_line.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_line.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';version:=(v_command.result->>'version')::integer;active_order:=(v_command.result->>'activeOrder')::integer;preference_exception:=coalesce((v_command.result->>'preferenceException')::boolean,false);return next;return;end if;
  if v_source.status<>'open' or v_source.version<>p_expected_wave_version then outcome:='conflict';version:=v_source.version;reason:='version_conflict';return next;return;end if;
  if p_destination_sex not in('male','female') then outcome:='not_eligible';reason:='proposal_invalid';return next;return;end if;
  select * into v_destination from public.post_birth_positioning_waves wave where wave.draft_id=v_source.draft_id and wave.litter_id=p_destination_litter_id and wave.wave_kind=v_source.wave_kind and wave.status='open';
  if not found then outcome:='not_eligible';reason:='destination_wave_required';return next;return;end if;
  perform 1 from public.post_birth_positioning_waves wave where wave.id in(v_source.id,v_destination.id) order by wave.id for update;
  select * into v_source from public.post_birth_positioning_waves where id=v_source.id;
  select * into v_destination from public.post_birth_positioning_waves where id=v_destination.id;
  if v_source.status<>'open' or v_source.version<>p_expected_wave_version or v_destination.status<>'open' then outcome:='conflict';version:=v_source.version;reason:='version_conflict';return next;return;end if;
  if not exists(select 1 from public.post_birth_capacity_states state where state.organization_id=v_line.organization_id and state.litter_id=p_destination_litter_id) then outcome:='not_eligible';reason:='published_capacity_required';return next;return;end if;
  select * into v_reservation from public.reservations where id=v_line.reservation_id and organization_id=v_line.organization_id for update;
  v_preference:=v_reservation.reserved_sex_preference;
  v_incompatible:=(v_preference='male_only' and p_destination_sex='female') or (v_preference='female_only' and p_destination_sex='male');
  if v_incompatible and length(btrim(coalesce(p_reason, ''))) < 5 then outcome:='not_eligible';reason:='reason_required';return next;return;end if;
  if v_incompatible and not exists(select 1 from public.adopter_manual_contacts contact_event where contact_event.id=p_manual_contact_id and contact_event.organization_id=v_line.organization_id and contact_event.reservation_id=v_line.reservation_id) then outcome:='not_eligible';reason:='manual_contact_required';return next;return;end if;
  perform 1 from public.post_birth_positioning_lines line where line.wave_id in(v_source.id,v_destination.id) and line.proposed_outcome='place' for update;
  if v_line.active_order is not null then
    update public.post_birth_positioning_lines line set active_order=line.active_order-1,updated_at=clock_timestamp(),updated_by=v_user where line.wave_id=v_source.id and line.proposed_sex=v_line.proposed_sex and line.proposed_outcome='place' and line.id<>v_line.id and line.active_order>v_line.active_order;
  end if;
  select count(*)+1 into v_new_order from public.post_birth_positioning_lines line where line.wave_id=v_destination.id and line.proposed_sex=p_destination_sex and line.proposed_outcome='place' and line.id<>v_line.id and (line.rank_snapshot<v_line.rank_snapshot or (line.rank_snapshot=v_line.rank_snapshot and line.id<v_line.id));
  update public.post_birth_positioning_lines line set active_order=line.active_order+1,updated_at=clock_timestamp(),updated_by=v_user where line.wave_id=v_destination.id and line.proposed_sex=p_destination_sex and line.proposed_outcome='place' and line.id<>v_line.id and line.active_order>=v_new_order;
  perform set_config('app.post_birth_file_mutation','on',true);
  update public.post_birth_positioning_lines set wave_id=v_destination.id,proposed_sex=p_destination_sex,proposed_outcome='place',blocker_code=null,active_order=v_new_order,has_order_override=false,preference_exception_active=v_incompatible,preference_exception_reason=case when v_incompatible then btrim(p_reason) else null end,preference_exception_manual_contact_id=case when v_incompatible then p_manual_contact_id else null end,version=post_birth_positioning_lines.version+1,stale_at=null,stale_reason=null,updated_at=clock_timestamp(),updated_by=v_user where id=v_line.id;
  perform set_config('app.post_birth_file_mutation','off',true);
  update public.post_birth_positioning_waves wave set version=wave.version+1 where wave.id=v_source.id;
  if v_destination.id<>v_source.id then update public.post_birth_positioning_waves wave set version=wave.version+1 where wave.id=v_destination.id returning wave.version into version; else select wave.version into version from public.post_birth_positioning_waves wave where wave.id=v_destination.id;end if;
  insert into public.post_birth_positioning_events(organization_id,litter_id,reservation_id,wave_id,event_type,actor_profile_id,actor_role,reason,details,client_command_id)
  values(v_line.organization_id,p_destination_litter_id,v_line.reservation_id,v_destination.id,case when v_incompatible then 'post_birth_preference_exception_recorded' else 'post_birth_proposal_moved' end,v_user,v_role,case when v_incompatible then btrim(p_reason) else null end,jsonb_build_object('fromLitterId',v_source.litter_id,'fromSex',v_line.proposed_sex,'toLitterId',p_destination_litter_id,'toSex',p_destination_sex,'historicalRank',v_line.rank_snapshot,'activeOrder',v_new_order,'manualContactId',case when v_incompatible then p_manual_contact_id else null end),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
  values(v_line.organization_id,p_client_command_id,'move_proposal',v_line.id,jsonb_build_object('outcome','updated','lineId',v_line.id,'version',version,'activeOrder',v_new_order,'preferenceException',v_incompatible),array[v_event],v_user);
  outcome:='updated';active_order:=v_new_order;preference_exception:=v_incompatible;return next;
end;
$$;

create or replace function public.complete_post_birth_wave(
 p_wave_id uuid,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_wave public.post_birth_positioning_waves%rowtype;v_role text;v_unresolved integer;v_event uuid;v_capacity public.post_birth_capacity_states%rowtype;
begin
 version:=null;reason:=null;select * into v_wave from public.post_birth_positioning_waves where id=p_wave_id for update;
 if not found then outcome:='not_eligible';reason:='wave_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_wave.organization_id);
 if v_wave.status='completed' then outcome:='already_applied';version:=v_wave.version;return next;return;end if;
 if v_wave.version<>p_expected_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
 select * into v_capacity from public.post_birth_capacity_states state where state.organization_id=v_wave.organization_id and state.litter_id=v_wave.litter_id;
 if (select count(*) from public.post_birth_positioning_lines line where line.wave_id=v_wave.id and line.proposed_outcome='place' and line.proposed_sex='male')>v_capacity.male_total-v_capacity.male_preserved-v_capacity.male_uncertain
 or (select count(*) from public.post_birth_positioning_lines line where line.wave_id=v_wave.id and line.proposed_outcome='place' and line.proposed_sex='female')>v_capacity.female_total-v_capacity.female_preserved-v_capacity.female_uncertain then outcome:='not_eligible';reason:='capacity_overflow';return next;return;end if;
 select count(*) into v_unresolved from public.post_birth_positioning_lines line where line.wave_id=v_wave.id and (line.stale_at is not null or line.proposed_outcome in('to_decide','blocked'));
 if v_unresolved>0 then outcome:='not_eligible';reason:='wave_has_unresolved_lines';return next;return;end if;
 update public.post_birth_positioning_waves wave set status='completed',completed_at=now(),version=wave.version+1 where wave.id=v_wave.id returning wave.version into version;
 insert into public.post_birth_positioning_events(organization_id,litter_id,wave_id,event_type,actor_profile_id,actor_role,client_command_id) values(v_wave.organization_id,v_wave.litter_id,v_wave.id,'post_birth_wave_completed',v_user,v_role,p_client_command_id) returning id into v_event;
 outcome:='updated';return next;
end;
$$;

revoke all on function public.override_post_birth_active_order(uuid,integer,text,integer,uuid) from public,anon;
revoke all on function public.move_post_birth_proposal(uuid,uuid,text,text,uuid,integer,uuid) from public,anon;
grant execute on function public.override_post_birth_active_order(uuid,integer,text,integer,uuid) to authenticated;
grant execute on function public.move_post_birth_proposal(uuid,uuid,text,text,uuid,integer,uuid) to authenticated;

commit;

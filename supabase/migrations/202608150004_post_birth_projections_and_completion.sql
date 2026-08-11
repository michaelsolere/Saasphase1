begin;

create or replace function public.post_birth_has_owner_admin_access(p_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships membership where membership.organization_id=p_organization_id and membership.profile_id=auth.uid() and membership.status='active' and membership.deleted_at is null and membership.role in('owner','admin'))
$$;

-- Operational detail is private to owner/admin. Limited roles use the snapshot RPC below.
drop policy post_birth_capacity_revision_select on public.post_birth_capacity_revisions;
drop policy post_birth_draft_select on public.post_birth_positioning_drafts;
drop policy post_birth_wave_select on public.post_birth_positioning_waves;
drop policy post_birth_line_select on public.post_birth_positioning_lines;
drop policy post_birth_decision_select on public.post_birth_position_decisions;
drop policy post_birth_incident_select on public.post_birth_incidents;
drop policy post_birth_event_select on public.post_birth_positioning_events;
drop policy direct_late_sales_select on public.direct_late_sales;
drop policy direct_late_sale_email_select on public.direct_late_sale_email_drafts;
drop policy direct_late_sale_events_select on public.direct_late_sale_events;
create policy post_birth_capacity_revision_select on public.post_birth_capacity_revisions for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_draft_select on public.post_birth_positioning_drafts for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_wave_select on public.post_birth_positioning_waves for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_line_select on public.post_birth_positioning_lines for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_decision_select on public.post_birth_position_decisions for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_incident_select on public.post_birth_incidents for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy post_birth_event_select on public.post_birth_positioning_events for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy direct_late_sales_select on public.direct_late_sales for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy direct_late_sale_email_select on public.direct_late_sale_email_drafts for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));
create policy direct_late_sale_events_select on public.direct_late_sale_events for select to authenticated using(public.post_birth_has_owner_admin_access(organization_id));

create or replace function public.refresh_post_birth_positioning_lines(
 p_wave_id uuid,p_expected_wave_version integer,p_client_command_id uuid
)
returns table(outcome text,stale_line_ids uuid[],version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_wave public.post_birth_positioning_waves%rowtype;v_role text;v_capacity integer;v_stale uuid[];v_event uuid;
begin
 stale_line_ids:='{}';version:=null;reason:=null;select * into v_wave from public.post_birth_positioning_waves where id=p_wave_id for update;
 if not found then outcome:='not_eligible';reason:='wave_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_wave.organization_id);
 if v_wave.version<>p_expected_wave_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
 select state.version into v_capacity from public.post_birth_capacity_states state where state.organization_id=v_wave.organization_id and state.litter_id=v_wave.litter_id;
 with changed as (
  update public.post_birth_positioning_lines line set stale_at=now(),stale_reason=concat_ws(',',case when reservation.updated_at<>line.reservation_updated_at_snapshot then 'reservation_changed' end,case when v_capacity<>line.capacity_version_snapshot then 'capacity_changed' end),updated_at=now(),updated_by=v_user
  from public.reservations reservation where line.wave_id=v_wave.id and line.reservation_id=reservation.id and line.stale_at is null and (reservation.updated_at<>line.reservation_updated_at_snapshot or v_capacity<>line.capacity_version_snapshot) returning line.id
 ) select coalesce(array_agg(id),'{}') into v_stale from changed;
 if cardinality(v_stale)>0 then update public.post_birth_positioning_waves as wave_row set version=wave_row.version+1 where wave_row.id=v_wave.id returning wave_row.version into version; else version:=v_wave.version;end if;
 insert into public.post_birth_positioning_events(organization_id,litter_id,wave_id,event_type,actor_profile_id,actor_role,details,client_command_id) values(v_wave.organization_id,v_wave.litter_id,v_wave.id,'post_birth_lines_refreshed',v_user,v_role,jsonb_build_object('staleLineIds',to_jsonb(v_stale)),p_client_command_id) returning id into v_event;
 outcome:='updated';stale_line_ids:=v_stale;return next;
end;
$$;

create or replace function public.complete_post_birth_wave(
 p_wave_id uuid,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_wave public.post_birth_positioning_waves%rowtype;v_role text;v_unresolved integer;v_event uuid;
begin
 version:=null;reason:=null;select * into v_wave from public.post_birth_positioning_waves where id=p_wave_id for update;
 if not found then outcome:='not_eligible';reason:='wave_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_wave.organization_id);
 if v_wave.status='completed' then outcome:='already_applied';version:=v_wave.version;return next;return;end if;
 if v_wave.version<>p_expected_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
 select count(*) into v_unresolved from public.post_birth_positioning_lines line where line.wave_id=v_wave.id and (line.stale_at is not null or line.proposed_outcome in('to_decide','blocked'));
 if v_unresolved>0 then outcome:='not_eligible';reason:='wave_has_unresolved_lines';return next;return;end if;
 update public.post_birth_positioning_waves as wave_row set status='completed',completed_at=now(),version=wave_row.version+1 where wave_row.id=v_wave.id returning wave_row.version into version;
 insert into public.post_birth_positioning_events(organization_id,litter_id,wave_id,event_type,actor_profile_id,actor_role,client_command_id) values(v_wave.organization_id,v_wave.litter_id,v_wave.id,'post_birth_wave_completed',v_user,v_role,p_client_command_id) returning id into v_event;
 outcome:='updated';return next;
 end;
 $$;

 create or replace function public.resolve_post_birth_incident(
 p_incident_id uuid,p_resolution text,p_client_command_id uuid
 )
 returns table(outcome text,incident_id uuid,reason text)
 language plpgsql security definer set search_path='' as $$
 declare v_user uuid:=auth.uid();v_incident public.post_birth_incidents%rowtype;v_role text;v_event uuid;
 begin
 incident_id:=p_incident_id;reason:=null;select * into v_incident from public.post_birth_incidents where id=p_incident_id for update;
 if not found then outcome:='not_eligible';reason:='incident_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_incident.organization_id);
 if v_incident.status='resolved' then outcome:='already_applied';return next;return;end if;
 if length(btrim(coalesce(p_resolution,'')))<10 then outcome:='not_eligible';reason:='resolution_required';return next;return;end if;
 update public.post_birth_incidents set status='resolved',resolved_at=now(),resolved_by=v_user,resolution=btrim(p_resolution) where id=v_incident.id;
 insert into public.post_birth_positioning_events(organization_id,litter_id,incident_id,event_type,actor_profile_id,actor_role,reason,client_command_id)
 values(v_incident.organization_id,v_incident.litter_id,v_incident.id,'post_birth_incident_resolved',v_user,v_role,btrim(p_resolution),p_client_command_id) returning id into v_event;
 outcome:='updated';return next;
 end;
 $$;

 create or replace function public.complete_post_birth_positioning_draft(
 p_draft_id uuid,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_draft public.post_birth_positioning_drafts%rowtype;v_role text;v_unresolved integer;v_event uuid;
begin
 version:=null;reason:=null;select * into v_draft from public.post_birth_positioning_drafts where id=p_draft_id for update;
 if not found then outcome:='not_eligible';reason:='draft_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_draft.organization_id);
 if v_draft.status='completed' then outcome:='already_applied';version:=v_draft.version;return next;return;end if;
 if v_draft.version<>p_expected_version then outcome:='conflict';version:=v_draft.version;reason:='version_conflict';return next;return;end if;
 select count(*) into v_unresolved from public.litters litter where litter.organization_id=v_draft.organization_id and litter.litter_group_id=v_draft.litter_group_id and litter.actual_birth_date is not null and litter.deleted_at is null and not exists(select 1 from public.post_birth_positioning_waves wave where wave.draft_id=v_draft.id and wave.litter_id=litter.id and wave.wave_kind='ordinary' and wave.status='completed');
 if v_unresolved>0 then outcome:='not_eligible';reason:='ordinary_waves_incomplete';return next;return;end if;
 select count(*) into v_unresolved
 from public.reservations reservation_row
 join public.applications application_row on application_row.id=reservation_row.application_id
 where reservation_row.organization_id=v_draft.organization_id
   and reservation_row.litter_group_id=v_draft.litter_group_id
   and reservation_row.deleted_at is null
   and not application_row.rank_payment_late
   and reservation_row.status not in('withdrawn','postponed','cancelled','archived')
   and not exists(select 1 from public.post_birth_positions position_row where position_row.reservation_id=reservation_row.id);
 if v_unresolved>0 then outcome:='not_eligible';reason:='priority_families_unresolved';return next;return;end if;
 if exists(select 1 from public.post_birth_positioning_waves wave where wave.draft_id=v_draft.id and wave.status='open') then outcome:='not_eligible';reason:='waves_still_open';return next;return;end if;
 update public.post_birth_positioning_drafts as draft_row set status='completed',completed_at=now(),version=draft_row.version+1,updated_at=now() where draft_row.id=v_draft.id returning draft_row.version into version;
 insert into public.post_birth_positioning_events(organization_id,litter_group_id,event_type,actor_profile_id,actor_role,client_command_id) values(v_draft.organization_id,v_draft.litter_group_id,'post_birth_draft_completed',v_user,v_role,p_client_command_id) returning id into v_event;
 outcome:='updated';return next;
end;
$$;

create or replace function public.read_post_birth_positioning_snapshot(p_litter_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_group public.litter_groups%rowtype;v_role text;v_owner boolean;v_result jsonb;
begin
 select * into v_group from public.litter_groups where id=p_litter_group_id and deleted_at is null;
 if not found then return jsonb_build_object('outcome','not_found');end if;
 select membership.role into v_role from public.memberships membership where membership.organization_id=v_group.organization_id and membership.profile_id=v_user and membership.status='active' and membership.deleted_at is null;
 if v_role is null then return jsonb_build_object('outcome','forbidden');end if;v_owner:=v_role in('owner','admin');
 select jsonb_build_object(
  'outcome','ok','role',v_role,'canMutate',v_owner,'group',jsonb_build_object('id',v_group.id,'name',v_group.name),
  'litters',coalesce((select jsonb_agg(jsonb_build_object('id',litter.id,'name',litter.name,'maleBorn',coalesce(litter.born_male_count,0),'femaleBorn',coalesce(litter.born_female_count,0),'capacity',case when state.id is null then null else jsonb_build_object('id',state.id,'version',state.version,'malePreserved',state.male_preserved,'femalePreserved',state.female_preserved,'maleUncertain',state.male_uncertain,'femaleUncertain',state.female_uncertain) end) order by litter.actual_birth_date,litter.name) from public.litters litter left join public.post_birth_capacity_states state on state.organization_id=litter.organization_id and state.litter_id=litter.id where litter.organization_id=v_group.organization_id and litter.litter_group_id=v_group.id and litter.deleted_at is null),'[]'::jsonb),
  'drafts',case when v_owner then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',draft.id,'status',draft.status,'version',draft.version,
      'waves',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',wave.id,'litterId',wave.litter_id,'kind',wave.wave_kind,'status',wave.status,'version',wave.version,
          'lines',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',line.id,'reservationId',line.reservation_id,'sex',line.proposed_sex,
              'outcome',line.proposed_outcome,'rank',line.rank_snapshot,'blocker',line.blocker_code,
              'staleReason',line.stale_reason,'family',concat_ws(' ',contact.first_name,contact.last_name)
            ) order by line.rank_snapshot)
            from public.post_birth_positioning_lines line
            join public.reservations reservation_row on reservation_row.id=line.reservation_id
            join public.contacts contact on contact.id=reservation_row.contact_id
            where line.wave_id=wave.id
          ),'[]'::jsonb)
        ) order by wave.sequence_no)
        from public.post_birth_positioning_waves wave where wave.draft_id=draft.id
      ),'[]'::jsonb)
    ) order by draft.opened_at desc)
    from public.post_birth_positioning_drafts draft
    where draft.organization_id=v_group.organization_id and draft.litter_group_id=v_group.id
  ),'[]'::jsonb) else '[]'::jsonb end,
  'positions',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',position_row.id,'reservationId',position_row.reservation_id,'litterId',position_row.litter_id,'sex',position_row.sex,'status',position_row.status,'rank',position_row.historical_rank,'family',concat_ws(' ',contact.first_name,contact.last_name)) order by position_row.historical_rank) from public.post_birth_positions position_row join public.reservations reservation_row on reservation_row.id=position_row.reservation_id join public.contacts contact on contact.id=reservation_row.contact_id where position_row.organization_id=v_group.organization_id and position_row.litter_id in(select id from public.litters where litter_group_id=v_group.id)),'[]'::jsonb) else '[]'::jsonb end,
  'incidents',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',incident.id,'litterId',incident.litter_id,'type',incident.incident_type,'status',incident.status,'summary',incident.summary,'details',incident.details,'openedAt',incident.opened_at) order by incident.opened_at desc) from public.post_birth_incidents incident where incident.organization_id=v_group.organization_id and incident.litter_id in(select id from public.litters where litter_group_id=v_group.id)),'[]'::jsonb) else '[]'::jsonb end,
  'candidates',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('reservationId',reservation_row.id,'family',concat_ws(' ',contact.first_name,contact.last_name),'litterId',reservation_row.litter_id,'rank',coalesce(reservation_row.rank_active,reservation_row.rank_initial),'late',application.rank_payment_late,'preference',reservation_row.reserved_sex_preference) order by coalesce(reservation_row.rank_active,reservation_row.rank_initial),reservation_row.id) from public.reservations reservation_row join public.applications application on application.id=reservation_row.application_id join public.contacts contact on contact.id=reservation_row.contact_id where reservation_row.organization_id=v_group.organization_id and reservation_row.litter_group_id=v_group.id and reservation_row.deleted_at is null and reservation_row.status in('pre_reservation_paid','active','confirmed_after_birth','waiting_for_available_sex')),'[]'::jsonb) else '[]'::jsonb end,
  'directCandidates',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',application.id,'family',concat_ws(' ',contact.first_name,contact.last_name)) order by application.created_at) from public.applications application join public.contacts contact on contact.id=application.contact_id where application.organization_id=v_group.organization_id and application.status='qualified' and application.deleted_at is null and not exists(select 1 from public.reservations existing_reservation where existing_reservation.application_id=application.id and existing_reservation.deleted_at is null) and not exists(select 1 from public.direct_late_sales existing_sale where existing_sale.application_id=application.id and existing_sale.status not in('cancelled','expired')) and (application.desired_litter_group_id=v_group.id or application.desired_litter_id in(select id from public.litters where litter_group_id=v_group.id))),'[]'::jsonb) else '[]'::jsonb end,
  'availableAnimals',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',animal.id,'litterId',animal.litter_id,'name',coalesce(animal.call_name,animal.official_name,'Chiot '||left(animal.id::text,8)),'sex',animal.sex) order by animal.birth_order,animal.id) from public.animals animal where animal.organization_id=v_group.organization_id and animal.litter_id in(select id from public.litters where litter_group_id=v_group.id) and animal.status='available' and animal.ownership_status='produced' and animal.is_breeder=false and animal.is_external=false and animal.is_retired=false and animal.deleted_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'limitedSummary',case when v_owner then null else jsonb_build_object('confirmedPlaces',(select count(*) from public.post_birth_positions position_row where position_row.organization_id=v_group.organization_id and position_row.litter_id in(select id from public.litters where litter_group_id=v_group.id) and position_row.status='confirmed'),'openIncidents',(select count(*) from public.post_birth_incidents incident where incident.organization_id=v_group.organization_id and incident.litter_id in(select id from public.litters where litter_group_id=v_group.id) and incident.status='open')) end
 ) into v_result;return v_result;
end;
$$;

create or replace function public.read_direct_late_sales_snapshot(p_litter_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_litter public.litters%rowtype;v_role text;
begin
 select * into v_litter from public.litters where id=p_litter_id and deleted_at is null;if not found then return jsonb_build_object('outcome','not_found');end if;
 select membership.role into v_role from public.memberships membership where membership.organization_id=v_litter.organization_id and membership.profile_id=auth.uid() and membership.status='active' and membership.deleted_at is null;
 if v_role is null then return jsonb_build_object('outcome','forbidden');end if;
 if v_role not in('owner','admin') then return jsonb_build_object('outcome','ok','role',v_role,'canMutate',false,'sales','[]'::jsonb,'count',(select count(*) from public.direct_late_sales sale where sale.organization_id=v_litter.organization_id and sale.litter_id=v_litter.id));end if;
 return jsonb_build_object('outcome','ok','role',v_role,'canMutate',true,'sales',coalesce((select jsonb_agg(jsonb_build_object('id',sale.id,'version',sale.version,'status',sale.status,'holdStatus',sale.hold_status,'holdDeadline',sale.hold_deadline,'overdue',sale.hold_status='active' and sale.hold_deadline<now(),'reservationId',sale.reservation_id,'applicationId',sale.application_id,'animal',jsonb_build_object('id',animal.id,'name',coalesce(animal.call_name,animal.official_name,'Chiot '||left(animal.id::text,8)),'sex',animal.sex),'family',concat_ws(' ',contact.first_name,contact.last_name),'payment',jsonb_build_object('id',payment.id,'status',payment.status,'amountCents',payment.amount_cents),'contract',jsonb_build_object('id',contract.id,'status',contract.status),'certificate',jsonb_build_object('id',certificate.id,'status',certificate.status),'email',jsonb_build_object('id',email.id,'status',email.status,'version',email.version,'recipient',email.recipient_email,'subject',email.subject,'bodyPreview',email.body_preview)) order by sale.created_at desc) from public.direct_late_sales sale join public.animals animal on animal.id=sale.animal_id join public.contacts contact on contact.id=sale.contact_id join public.payments payment on payment.id=sale.payment_id join public.documents contract on contract.id=sale.reservation_contract_id join public.documents certificate on certificate.id=sale.commitment_certificate_id left join public.direct_late_sale_email_drafts email on email.id=sale.email_draft_id where sale.organization_id=v_litter.organization_id and sale.litter_id=v_litter.id),'[]'::jsonb));
end;
$$;

-- Cover inserts as well as updates: no alternate assignment path can bypass the strict guard.
drop trigger reservations_strict_animal_assignment on public.reservations;
create or replace function public.guard_strict_animal_assignment()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.animal_id is null then return new;end if;
 if tg_op='UPDATE' and new.animal_id is not distinct from old.animal_id then return new;end if;
 if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'')='' then return new;end if;
 if current_setting('app.direct_late_sale_assignment',true)='on' then return new;end if;
 if exists(select 1 from public.direct_late_sales sale where sale.animal_id=new.animal_id and sale.hold_status='active' and sale.reservation_id<>new.id) then raise exception 'animal_temporarily_held_for_direct_sale';end if;
 if exists(select 1 from public.post_birth_positions position_row join public.animals animal on animal.id=new.animal_id where position_row.organization_id=new.organization_id and position_row.reservation_id=new.id and position_row.litter_id=animal.litter_id and position_row.sex=animal.sex and position_row.status='confirmed') then return new;end if;
 raise exception 'post_birth_place_or_direct_late_sale_required';
end;
$$;
create trigger reservations_strict_animal_assignment before insert or update of animal_id on public.reservations for each row execute function public.guard_strict_animal_assignment();

create or replace function public.guard_direct_late_sale_departure_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='adoption' and new.status='done' and new.reservation_id is not null
    and exists(select 1 from public.direct_late_sales sale where sale.reservation_id=new.reservation_id)
    and not exists(
      select 1 from public.adopter_profile_questionnaire_instances instance
      where instance.reservation_id=new.reservation_id
        and (instance.reviewed_at is not null or instance.waived_at is not null)
    ) then
   raise exception 'profile_review_required_before_departure';
 end if;
 return new;
end;
$$;

create trigger direct_late_sale_departure_profile_guard
before insert or update of status on public.events
for each row execute function public.guard_direct_late_sale_departure_profile();

revoke all on function public.refresh_post_birth_positioning_lines(uuid,integer,uuid) from public,anon;
revoke all on function public.resolve_post_birth_incident(uuid,text,uuid) from public,anon;
revoke all on function public.complete_post_birth_wave(uuid,integer,uuid) from public,anon;
revoke all on function public.complete_post_birth_positioning_draft(uuid,integer,uuid) from public,anon;
revoke all on function public.read_post_birth_positioning_snapshot(uuid) from public,anon;
revoke all on function public.read_direct_late_sales_snapshot(uuid) from public,anon;
grant execute on function public.refresh_post_birth_positioning_lines(uuid,integer,uuid) to authenticated;
grant execute on function public.resolve_post_birth_incident(uuid,text,uuid) to authenticated;
grant execute on function public.complete_post_birth_wave(uuid,integer,uuid) to authenticated;
grant execute on function public.complete_post_birth_positioning_draft(uuid,integer,uuid) to authenticated;
grant execute on function public.read_post_birth_positioning_snapshot(uuid) to authenticated;
grant execute on function public.read_direct_late_sales_snapshot(uuid) to authenticated;

commit;

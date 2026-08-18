-- CHOICE-APPOINTMENTS-AND-ASSIGNMENT-01
-- Versioned litter planning, secure family response, ranked pre-choice,
-- atomic animal assignment and private multi-photo gallery.

begin;

create table public.choice_appointment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  litter_id uuid not null,
  status text not null default 'draft',
  starts_at timestamptz not null,
  duration_minutes integer not null,
  version integer not null default 1,
  validated_at timestamptz,
  validated_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  constraint choice_appointment_plans_org_id_key unique(organization_id,id),
  constraint choice_appointment_plans_litter_fk foreign key(organization_id,litter_id) references public.litters(organization_id,id),
  constraint choice_appointment_plans_status_check check(status in('draft','validated','sending','sent','completed','cancelled')),
  constraint choice_appointment_plans_duration_check check(duration_minutes between 5 and 480),
  constraint choice_appointment_plans_version_check check(version>0),
  constraint choice_appointment_plans_validation_check check(status='draft' or (validated_at is not null and validated_by is not null))
);
create unique index choice_appointment_one_open_plan_per_litter_idx
  on public.choice_appointment_plans(organization_id,litter_id)
  where status in('draft','validated','sending','sent');

create table public.choice_appointment_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  plan_id uuid not null,
  reservation_id uuid not null,
  position_id uuid not null references public.post_birth_positions(id),
  sex text not null,
  historical_rank integer not null,
  active_order integer not null,
  original_sequence integer not null,
  sequence integer not null,
  planned_at timestamptz not null,
  response_kind text,
  responded_at timestamptz,
  invitation_delivery_attempt_id uuid,
  invitation_sent_at timestamptz,
  reminder_due_at timestamptz,
  reminder_delivery_attempt_id uuid,
  reminder_sent_at timestamptz,
  status text not null default 'planned',
  report_reason text,
  assignment_event_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint choice_appointment_slots_org_id_key unique(organization_id,id),
  constraint choice_appointment_slots_plan_fk foreign key(organization_id,plan_id) references public.choice_appointment_plans(organization_id,id),
  constraint choice_appointment_slots_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id),
  constraint choice_appointment_slots_invitation_attempt_fk foreign key(organization_id,invitation_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id),
  constraint choice_appointment_slots_reminder_attempt_fk foreign key(organization_id,reminder_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id),
  constraint choice_appointment_slots_plan_reservation_key unique(organization_id,plan_id,reservation_id),
  constraint choice_appointment_slots_plan_sequence_key unique(organization_id,plan_id,sequence),
  constraint choice_appointment_slots_sex_check check(sex in('male','female')),
  constraint choice_appointment_slots_order_check check(historical_rank>0 and active_order>0 and original_sequence>0 and sequence>0 and version>0),
  constraint choice_appointment_slots_response_check check(response_kind is null or response_kind in('in_person','video','prechoice')),
  constraint choice_appointment_slots_delivery_check check(
    (invitation_sent_at is null or invitation_delivery_attempt_id is not null)
    and (reminder_sent_at is null or reminder_delivery_attempt_id is not null)
    and (reminder_due_at is null or invitation_sent_at is not null)
  ),
  constraint choice_appointment_slots_status_check check(status in('planned','responded','in_progress','assigned','reported','cancelled')),
  constraint choice_appointment_slots_report_check check(status<>'reported' or length(btrim(coalesce(report_reason,'')))>=5)
);
create index choice_appointment_slots_due_idx on public.choice_appointment_slots(organization_id,planned_at) where status in('planned','responded');

create table public.choice_appointment_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slot_id uuid not null,
  token_hash text not null,
  token_hint text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  constraint choice_appointment_accesses_org_id_key unique(organization_id,id),
  constraint choice_appointment_accesses_slot_fk foreign key(organization_id,slot_id) references public.choice_appointment_slots(organization_id,id),
  constraint choice_appointment_accesses_token_key unique(token_hash),
  constraint choice_appointment_accesses_hash_check check(token_hash~'^[0-9a-f]{64}$' and length(token_hint) between 4 and 12),
  constraint choice_appointment_accesses_dates_check check(expires_at>created_at)
);
create unique index choice_appointment_one_active_access_idx on public.choice_appointment_accesses(slot_id) where revoked_at is null;

create table public.choice_appointment_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slot_id uuid not null,
  access_id uuid not null references public.choice_appointment_accesses(id),
  session_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint choice_appointment_sessions_org_id_key unique(organization_id,id),
  constraint choice_appointment_sessions_slot_fk foreign key(organization_id,slot_id) references public.choice_appointment_slots(organization_id,id),
  constraint choice_appointment_sessions_hash_key unique(session_hash),
  constraint choice_appointment_sessions_hash_check check(session_hash~'^[0-9a-f]{64}$'),
  constraint choice_appointment_sessions_dates_check check(expires_at>created_at and expires_at<=created_at+interval '2 hours')
);

create table public.choice_appointment_ranked_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slot_id uuid not null,
  animal_id uuid not null,
  rank integer not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  constraint choice_ranked_preferences_org_id_key unique(organization_id,id),
  constraint choice_ranked_preferences_slot_fk foreign key(organization_id,slot_id) references public.choice_appointment_slots(organization_id,id),
  constraint choice_ranked_preferences_animal_fk foreign key(organization_id,animal_id) references public.animals(organization_id,id),
  constraint choice_ranked_preferences_slot_rank_key unique(organization_id,slot_id,revision,rank),
  constraint choice_ranked_preferences_slot_animal_key unique(organization_id,slot_id,revision,animal_id),
  constraint choice_ranked_preferences_values_check check(rank>0 and revision>0)
);

create table public.choice_appointment_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_command_id uuid not null,
  command_type text not null,
  target_id uuid,
  payload_hash text,
  outcome text not null,
  result jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint choice_appointment_commands_unique unique(organization_id,client_command_id),
  constraint choice_appointment_commands_payload_check check(payload_hash is null or payload_hash~'^[0-9a-f]{64}$')
);

create table public.choice_appointment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  plan_id uuid,
  slot_id uuid,
  reservation_id uuid,
  event_type text not null,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(id),
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint choice_appointment_events_org_id_key unique(organization_id,id),
  constraint choice_appointment_events_plan_fk foreign key(organization_id,plan_id) references public.choice_appointment_plans(organization_id,id),
  constraint choice_appointment_events_slot_fk foreign key(organization_id,slot_id) references public.choice_appointment_slots(organization_id,id),
  constraint choice_appointment_events_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id),
  constraint choice_appointment_events_command_key unique(organization_id,client_command_id),
  constraint choice_appointment_events_actor_check check(actor_kind in('member','family','system')),
  constraint choice_appointment_events_details_check check(jsonb_typeof(details)='object')
);

create table public.animal_assignment_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_command_id uuid not null,
  payload_hash text not null,
  outcome text not null,
  result jsonb not null default '{}'::jsonb,
  actor_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint animal_assignment_commands_unique unique(organization_id,client_command_id),
  constraint animal_assignment_commands_hash_check check(payload_hash~'^[0-9a-f]{64}$')
);

create table public.animal_assignment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reservation_id uuid not null,
  slot_id uuid,
  previous_animal_id uuid,
  animal_id uuid not null,
  presentation_media_id uuid,
  preference_id uuid,
  event_type text not null,
  reason text,
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint animal_assignment_events_org_id_key unique(organization_id,id),
  constraint animal_assignment_events_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id),
  constraint animal_assignment_events_slot_fk foreign key(organization_id,slot_id) references public.choice_appointment_slots(organization_id,id),
  constraint animal_assignment_events_previous_fk foreign key(organization_id,previous_animal_id) references public.animals(organization_id,id),
  constraint animal_assignment_events_animal_fk foreign key(organization_id,animal_id) references public.animals(organization_id,id),
  constraint animal_assignment_events_media_fk foreign key(organization_id,presentation_media_id) references public.media(organization_id,id),
  constraint animal_assignment_events_preference_fk foreign key(organization_id,preference_id) references public.choice_appointment_ranked_preferences(organization_id,id),
  constraint animal_assignment_events_command_key unique(organization_id,client_command_id),
  constraint animal_assignment_events_type_check check(event_type in('assigned','changed')),
  constraint animal_assignment_events_role_check check(actor_role in('owner','admin'))
);

alter table public.choice_appointment_slots add constraint choice_appointment_slots_assignment_event_fk foreign key(organization_id,assignment_event_id) references public.animal_assignment_events(organization_id,id) deferrable initially deferred;

create unique index reservations_one_active_assignment_per_animal_idx
  on public.reservations(organization_id,animal_id)
  where animal_id is not null and deleted_at is null;

create or replace function public.guard_choice_appointment_append_only()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and session_user='postgres' and current_setting('app.qa_hard_delete',true)='on' then return old;end if;
  raise exception '% is append-only',tg_table_name;
end;$$;
create trigger choice_appointment_events_immutable before update or delete on public.choice_appointment_events for each row execute function public.guard_choice_appointment_append_only();
create trigger choice_appointment_commands_immutable before update or delete on public.choice_appointment_commands for each row execute function public.guard_choice_appointment_append_only();
create trigger animal_assignment_events_immutable before update or delete on public.animal_assignment_events for each row execute function public.guard_choice_appointment_append_only();
create trigger animal_assignment_commands_immutable before update or delete on public.animal_assignment_commands for each row execute function public.guard_choice_appointment_append_only();

alter table public.choice_appointment_plans enable row level security;
alter table public.choice_appointment_slots enable row level security;
alter table public.choice_appointment_accesses enable row level security;
alter table public.choice_appointment_sessions enable row level security;
alter table public.choice_appointment_ranked_preferences enable row level security;
alter table public.choice_appointment_commands enable row level security;
alter table public.choice_appointment_events enable row level security;
alter table public.animal_assignment_commands enable row level security;
alter table public.animal_assignment_events enable row level security;

create policy choice_appointment_plans_select on public.choice_appointment_plans for select to authenticated using(public.is_member_of(organization_id));
create policy choice_appointment_slots_select on public.choice_appointment_slots for select to authenticated using(public.is_member_of(organization_id));
create policy choice_appointment_preferences_select on public.choice_appointment_ranked_preferences for select to authenticated using(public.is_member_of(organization_id));
create policy choice_appointment_events_select on public.choice_appointment_events for select to authenticated using(public.is_member_of(organization_id));
create policy animal_assignment_events_select on public.animal_assignment_events for select to authenticated using(public.is_member_of(organization_id));

revoke all on public.choice_appointment_plans,public.choice_appointment_slots,public.choice_appointment_ranked_preferences,public.choice_appointment_commands,public.choice_appointment_events,public.animal_assignment_commands,public.animal_assignment_events from anon,authenticated;
revoke all on public.choice_appointment_accesses from anon, authenticated;
revoke all on public.choice_appointment_sessions from anon, authenticated;
grant select on public.choice_appointment_plans,public.choice_appointment_slots,public.choice_appointment_ranked_preferences,public.choice_appointment_events,public.animal_assignment_events to authenticated;
grant select,insert,update on public.choice_appointment_accesses,public.choice_appointment_sessions to service_role;
grant select,update on public.choice_appointment_plans,public.choice_appointment_slots to service_role;
grant select,insert on public.choice_appointment_events to service_role;

create or replace function public.choice_appointment_owner_admin_role(p_organization_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_role text;begin
 select membership.role into v_role from public.memberships membership where membership.organization_id=p_organization_id and membership.profile_id=auth.uid() and membership.status='active' and membership.deleted_at is null;
 if v_role not in('owner','admin') then raise exception 'owner_or_admin_required' using errcode='42501';end if;return v_role;
end;$$;
revoke all on function public.choice_appointment_owner_admin_role(uuid) from public,anon,authenticated;

create or replace function public.create_choice_appointment_plan(p_litter_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_slots jsonb,p_client_command_id uuid)
returns table(outcome text,plan_id uuid,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_litter public.litters%rowtype;v_role text;v_plan uuid;v_slot jsonb;v_res public.reservations%rowtype;v_position public.post_birth_positions%rowtype;v_line public.post_birth_positioning_lines%rowtype;v_required integer;v_paid bigint;v_event uuid;v_existing public.choice_appointment_commands%rowtype;v_male_preserved integer;v_female_preserved integer;v_male_designated integer;v_female_designated integer;
begin
 outcome:=null;plan_id:=null;version:=null;reason:=null;
 if v_user is null or p_starts_at is null or p_duration_minutes not between 5 and 480 or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots)=0 then outcome:='not_eligible';reason:='invalid_input';return next;return;end if;
 select * into v_litter from public.litters where id=p_litter_id and deleted_at is null for update;if not found then outcome:='not_eligible';reason:='litter_not_found';return next;return;end if;
 v_role:=public.choice_appointment_owner_admin_role(v_litter.organization_id);
 select * into v_existing from public.choice_appointment_commands where organization_id=v_litter.organization_id and client_command_id=p_client_command_id;
 if found then outcome:=v_existing.outcome;plan_id=nullif(v_existing.result->>'planId','')::uuid;version=nullif(v_existing.result->>'version','')::integer;return next;return;end if;
 select coalesce(state.male_preserved,0),coalesce(state.female_preserved,0) into v_male_preserved,v_female_preserved from public.post_birth_capacity_states state where state.organization_id=v_litter.organization_id and state.litter_id=v_litter.id;
 select count(*) filter(where animal.sex='male'),count(*) filter(where animal.sex='female') into v_male_designated,v_female_designated from public.animals animal where animal.organization_id=v_litter.organization_id and animal.litter_id=v_litter.id and animal.is_breeder and animal.deleted_at is null;
 if coalesce(v_male_designated,0)<coalesce(v_male_preserved,0) or coalesce(v_female_designated,0)<coalesce(v_female_preserved,0) then outcome:='not_eligible';reason:='preserved_animals_not_designated';return next;return;end if;
 if exists(select 1 from public.choice_appointment_plans plan where plan.organization_id=v_litter.organization_id and plan.litter_id=v_litter.id and plan.status in('draft','validated','sending','sent')) then outcome:='conflict';reason:='active_plan_exists';return next;return;end if;
 insert into public.choice_appointment_plans(organization_id,litter_id,starts_at,duration_minutes,created_by,updated_by) values(v_litter.organization_id,v_litter.id,p_starts_at,p_duration_minutes,v_user,v_user) returning id,choice_appointment_plans.version into v_plan,version;
 for v_slot in select value from jsonb_array_elements(p_slots) loop
   select * into v_res from public.reservations reservation_row where reservation_row.id=(v_slot->>'reservationId')::uuid and reservation_row.organization_id=v_litter.organization_id and reservation_row.litter_id=v_litter.id and reservation_row.deleted_at is null for update of reservation_row;
   if not found then raise exception 'reservation_not_eligible';end if;
   select * into v_position from public.post_birth_positions position_row where position_row.organization_id=v_litter.organization_id and position_row.reservation_id=v_res.id and position_row.litter_id=v_litter.id and position_row.status='confirmed' for update;
   if not found then raise exception 'position_not_confirmed';end if;
   select line.* into v_line from public.post_birth_position_decisions decision join public.post_birth_positioning_lines line on line.wave_id=decision.wave_id and line.reservation_id=decision.reservation_id where decision.id=v_position.current_decision_id and line.proposed_outcome='place' and line.proposed_sex=v_position.sex and line.active_order is not null order by line.updated_at desc limit 1;
   if not found or v_line.active_order<>(v_slot->>'activeOrder')::integer or v_position.historical_rank<>(v_slot->>'historicalRank')::integer or v_position.sex<>(v_slot->>'sex') then raise exception 'position_snapshot_mismatch';end if;
   if (select count(distinct document.document_type) from public.documents document where document.organization_id=v_litter.organization_id and document.reservation_id=v_res.id and document.document_type in('commitment_certificate','reservation_contract') and document.status='signed' and document.deleted_at is null and document.superseded_at is null)<>2 then raise exception 'required_documents_not_signed';end if;
   select coalesce(settings.default_pre_reservation_deposit_cents,25000)+coalesce(settings.default_arrhes_second_payment_cents,25000) into v_required from public.organization_settings settings where settings.organization_id=v_litter.organization_id and settings.deleted_at is null;
   v_required:=coalesce(v_required,50000);
   select coalesce(sum(payment.amount_cents),0) into v_paid from public.payments payment where payment.organization_id=v_litter.organization_id and payment.reservation_id=v_res.id and payment.payment_type in('arrhes','pre_reservation_deposit_refundable') and payment.status='paid' and payment.deleted_at is null;
   if v_paid<v_required then raise exception 'deposit_incomplete';end if;
   insert into public.choice_appointment_slots(organization_id,plan_id,reservation_id,position_id,sex,historical_rank,active_order,original_sequence,sequence,planned_at) values(v_litter.organization_id,v_plan,v_res.id,v_position.id,v_position.sex,v_position.historical_rank,(v_slot->>'activeOrder')::integer,(v_slot->>'sequence')::integer,(v_slot->>'sequence')::integer,(v_slot->>'plannedAt')::timestamptz);
 end loop;
 insert into public.choice_appointment_events(organization_id,plan_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_litter.organization_id,v_plan,'plan_created','member',v_user,v_role,jsonb_build_object('slotCount',jsonb_array_length(p_slots)),p_client_command_id) returning id into v_event;
 insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result,actor_profile_id) values(v_litter.organization_id,p_client_command_id,'create_plan',v_plan,'created',jsonb_build_object('planId',v_plan,'version',version),v_user);
 plan_id:=v_plan;outcome:='created';return next;
exception when others then if sqlerrm in('reservation_not_eligible','position_not_confirmed','position_snapshot_mismatch','required_documents_not_signed','deposit_incomplete') then outcome:='not_eligible';reason:=sqlerrm;return next;else raise;end if;end;$$;

create or replace function public.validate_choice_appointment_plan(p_plan_id uuid,p_expected_version integer,p_client_command_id uuid)
returns table(outcome text,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_plan public.choice_appointment_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_event uuid;begin
 select * into v_plan from public.choice_appointment_plans where id=p_plan_id for update;if not found then outcome:='not_eligible';reason:='plan_not_found';return next;return;end if;v_role:=public.choice_appointment_owner_admin_role(v_plan.organization_id);
 if exists(select 1 from public.choice_appointment_commands where organization_id=v_plan.organization_id and client_command_id=p_client_command_id) then outcome:='already_applied';version:=v_plan.version;return next;return;end if;
 if v_plan.status<>'draft' or v_plan.version<>p_expected_version then outcome:='conflict';version:=v_plan.version;reason:='version_conflict';return next;return;end if;
 update public.choice_appointment_plans plan set status='validated',validated_at=now(),validated_by=v_user,version=plan.version+1,updated_at=now(),updated_by=v_user where id=v_plan.id returning plan.version into version;
 insert into public.choice_appointment_events(organization_id,plan_id,event_type,actor_kind,actor_profile_id,actor_role,client_command_id) values(v_plan.organization_id,v_plan.id,'plan_validated','member',v_user,v_role,p_client_command_id) returning id into v_event;
 insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'validate_plan',v_plan.id,'validated',jsonb_build_object('version',version),v_user);outcome:='validated';return next;end;$$;

create or replace function public.update_choice_appointment_slot(p_slot_id uuid,p_planned_at timestamptz,p_expected_plan_version integer,p_client_command_id uuid)
returns table(outcome text,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.choice_appointment_slots%rowtype;v_plan public.choice_appointment_plans%rowtype;v_user uuid:=auth.uid();v_role text;begin
 select * into v_slot from public.choice_appointment_slots where id=p_slot_id;if not found then outcome:='not_eligible';reason:='slot_not_found';return next;return;end if;
 select * into v_plan from public.choice_appointment_plans where id=v_slot.plan_id for update;select * into v_slot from public.choice_appointment_slots where id=p_slot_id for update;v_role:=public.choice_appointment_owner_admin_role(v_slot.organization_id);
 if exists(select 1 from public.choice_appointment_commands where organization_id=v_slot.organization_id and client_command_id=p_client_command_id) then outcome:='already_applied';version:=v_plan.version;return next;return;end if;
 if p_planned_at is null then outcome:='not_eligible';reason:='planned_at_required';return next;return;end if;
 if v_plan.status<>'draft' or v_plan.version<>p_expected_plan_version then outcome:='conflict';version:=v_plan.version;reason:='version_conflict';return next;return;end if;
 update public.choice_appointment_slots set planned_at=p_planned_at,version=choice_appointment_slots.version+1,updated_at=clock_timestamp() where id=v_slot.id;
 update public.choice_appointment_plans plan set version=plan.version+1,updated_at=clock_timestamp(),updated_by=v_user where id=v_plan.id returning plan.version into version;
 insert into public.choice_appointment_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_slot.organization_id,v_plan.id,v_slot.id,v_slot.reservation_id,'slot_adjusted','member',v_user,v_role,jsonb_build_object('previousPlannedAt',v_slot.planned_at,'plannedAt',p_planned_at),p_client_command_id);
 insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result,actor_profile_id) values(v_slot.organization_id,p_client_command_id,'adjust_slot',v_slot.id,'updated',jsonb_build_object('version',version),v_user);outcome:='updated';return next;end;$$;

create or replace function public.exchange_choice_appointment_public_token(p_token_hash text,p_session_hash text)
returns table(outcome text,slot_id uuid,session_expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare v_access public.choice_appointment_accesses%rowtype;begin
 outcome:='unavailable';slot_id:=null;session_expires_at:=null;if p_token_hash!~'^[0-9a-f]{64}$' or p_session_hash!~'^[0-9a-f]{64}$' then return next;return;end if;
 select * into v_access from public.choice_appointment_accesses access where access.token_hash=p_token_hash and access.revoked_at is null and access.expires_at>now() for update;if not found then return next;return;end if;
 slot_id:=v_access.slot_id;session_expires_at:=now()+interval '2 hours';insert into public.choice_appointment_sessions(organization_id,slot_id,access_id,session_hash,expires_at) values(v_access.organization_id,v_access.slot_id,v_access.id,p_session_hash,session_expires_at);outcome:='opened';return next;end;$$;

create or replace function public.read_choice_appointment_public_session(p_session_hash text)
returns table(outcome text,slot_id uuid,planned_at timestamptz,response_kind text) language plpgsql security definer set search_path='' as $$
begin return query select 'available'::text,slot.id,slot.planned_at,slot.response_kind from public.choice_appointment_sessions session join public.choice_appointment_accesses access on access.id=session.access_id and access.revoked_at is null and access.expires_at>now() join public.choice_appointment_slots slot on slot.id=session.slot_id where session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now() and slot.status in('planned','responded');if not found then outcome:='unavailable';slot_id:=null;planned_at:=null;response_kind:=null;return next;end if;end;$$;

create or replace function public.respond_choice_appointment_public_session(p_session_hash text,p_response_kind text,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,response_kind text) language plpgsql security definer set search_path='' as $$
declare v_session public.choice_appointment_sessions%rowtype;v_slot public.choice_appointment_slots%rowtype;v_command public.choice_appointment_commands%rowtype;begin
 outcome:='unavailable';slot_id:=null;response_kind:=null;if p_response_kind not in('in_person','video','prechoice') then return next;return;end if;
 select session.* into v_session from public.choice_appointment_sessions session join public.choice_appointment_accesses access on access.id=session.access_id and access.revoked_at is null and access.expires_at>now() where session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now() for update of session;if not found then return next;return;end if;
 select * into v_slot from public.choice_appointment_slots where id=v_session.slot_id for update;
 select * into v_command from public.choice_appointment_commands where organization_id=v_session.organization_id and client_command_id=p_client_command_id;if found then outcome:=v_command.outcome;slot_id:=v_slot.id;response_kind:=v_slot.response_kind;return next;return;end if;
 if v_slot.status not in('planned','responded') then return next;return;end if;
 update public.choice_appointment_slots set response_kind=p_response_kind,responded_at=coalesce(responded_at,now()),status='responded',version=version+1,updated_at=now() where id=v_slot.id;
 insert into public.choice_appointment_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,details,client_command_id) values(v_slot.organization_id,v_slot.plan_id,v_slot.id,v_slot.reservation_id,'family_response_recorded','family',jsonb_build_object('responseKind',p_response_kind),p_client_command_id);
 insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result) values(v_slot.organization_id,p_client_command_id,'family_response',v_slot.id,'recorded',jsonb_build_object('slotId',v_slot.id,'responseKind',p_response_kind));outcome:='recorded';slot_id:=v_slot.id;response_kind:=p_response_kind;return next;end;$$;

create or replace function public.save_choice_appointment_ranked_preferences(p_slot_id uuid,p_animal_ids uuid[],p_client_command_id uuid)
returns table(outcome text,revision integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.choice_appointment_slots%rowtype;v_plan public.choice_appointment_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_animal uuid;v_rank integer:=0;v_event uuid;begin
 select * into v_slot from public.choice_appointment_slots where id=p_slot_id for update;if not found then outcome:='not_eligible';reason:='slot_not_found';return next;return;end if;select * into v_plan from public.choice_appointment_plans where id=v_slot.plan_id;v_role:=public.choice_appointment_owner_admin_role(v_slot.organization_id);
 if exists(select 1 from public.choice_appointment_commands where organization_id=v_slot.organization_id and client_command_id=p_client_command_id) then outcome:='already_applied';select coalesce(max(p.revision),0) into revision from public.choice_appointment_ranked_preferences p where p.slot_id=v_slot.id;return next;return;end if;
 if coalesce(array_length(p_animal_ids,1),0)=0 or cardinality(p_animal_ids)<>(select count(distinct value) from unnest(p_animal_ids) value) then outcome:='not_eligible';reason:='ranking_invalid';return next;return;end if;
 select coalesce(max(p.revision),0)+1 into revision from public.choice_appointment_ranked_preferences p where p.slot_id=v_slot.id;
 foreach v_animal in array p_animal_ids loop v_rank:=v_rank+1;if not exists(select 1 from public.animals animal where animal.organization_id=v_slot.organization_id and animal.id=v_animal and animal.litter_id=v_plan.litter_id and animal.sex=v_slot.sex and animal.status='available' and animal.ownership_status='produced' and not animal.is_breeder and not animal.is_external and not animal.is_retired and animal.deleted_at is null) then raise exception 'ranked_animal_not_eligible';end if;insert into public.choice_appointment_ranked_preferences(organization_id,slot_id,animal_id,rank,revision,created_by) values(v_slot.organization_id,v_slot.id,v_animal,v_rank,revision,v_user);end loop;
 insert into public.choice_appointment_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_slot.organization_id,v_slot.plan_id,v_slot.id,v_slot.reservation_id,'ranked_preferences_saved','member',v_user,v_role,jsonb_build_object('revision',revision,'count',v_rank),p_client_command_id) returning id into v_event;
 insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result,actor_profile_id) values(v_slot.organization_id,p_client_command_id,'save_preferences',v_slot.id,'saved',jsonb_build_object('revision',revision),v_user);outcome:='saved';return next;
exception when others then if sqlerrm='ranked_animal_not_eligible' then outcome:='not_eligible';reason:=sqlerrm;return next;else raise;end if;end;$$;

create or replace function public.assign_choice_appointment_animal(p_slot_id uuid,p_animal_id uuid,p_presentation_media_id uuid,p_reason text,p_payload_hash text,p_client_command_id uuid)
returns table(outcome text,assignment_event_id uuid,replayed boolean,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.choice_appointment_slots%rowtype;v_plan public.choice_appointment_plans%rowtype;v_res public.reservations%rowtype;v_animal public.animals%rowtype;v_previous public.animals%rowtype;v_user uuid:=auth.uid();v_role text;v_command public.animal_assignment_commands%rowtype;v_preference uuid;v_event uuid;v_now timestamptz:=clock_timestamp();begin
 outcome:=null;assignment_event_id:=null;replayed:=false;reason:=null;if p_payload_hash!~'^[0-9a-f]{64}$' then outcome:='not_eligible';reason:='payload_hash_invalid';return next;return;end if;
 select * into v_slot from public.choice_appointment_slots where id=p_slot_id;if not found then outcome:='not_eligible';reason:='slot_not_found';return next;return;end if;select * into v_plan from public.choice_appointment_plans where id=v_slot.plan_id for update;select * into v_slot from public.choice_appointment_slots where id=p_slot_id for update;v_role:=public.choice_appointment_owner_admin_role(v_slot.organization_id);
 if v_plan.status not in('sent','completed') then outcome:='not_eligible';reason:='plan_not_sent';return next;return;end if;
 if v_slot.response_kind is null then outcome:='not_eligible';reason:='family_response_required';return next;return;end if;
 select * into v_command from public.animal_assignment_commands where organization_id=v_slot.organization_id and client_command_id=p_client_command_id;if found then if v_command.payload_hash<>p_payload_hash then outcome:='conflict';reason:='client_command_conflict';return next;return;end if;outcome:=v_command.outcome;assignment_event_id=nullif(v_command.result->>'assignmentEventId','')::uuid;replayed:=true;return next;return;end if;
 select * into v_res from public.reservations reservation_row where reservation_row.id=v_slot.reservation_id and reservation_row.organization_id=v_slot.organization_id and reservation_row.deleted_at is null for update of reservation_row;
 if v_res.animal_assignment_locked then outcome:='not_eligible';reason:='assignment_locked';return next;return;end if;
 perform 1 from public.animals animal_row where animal_row.organization_id=v_slot.organization_id and animal_row.id in(p_animal_id,v_res.animal_id) order by animal_row.id for update of animal_row;
 select * into v_animal from public.animals where organization_id=v_slot.organization_id and id=p_animal_id and deleted_at is null;
 if not found or v_animal.litter_id<>v_plan.litter_id or v_animal.sex<>v_slot.sex or v_animal.status<>'available' or v_animal.ownership_status<>'produced' or v_animal.is_breeder or v_animal.is_external or v_animal.is_retired then outcome:='not_eligible';reason:='animal_not_eligible';return next;return;end if;
 if not exists(select 1 from public.post_birth_positions position_row where position_row.id=v_slot.position_id and position_row.reservation_id=v_res.id and position_row.litter_id=v_animal.litter_id and position_row.sex=v_animal.sex and position_row.status='confirmed') then outcome:='not_eligible';reason:='position_incompatible';return next;return;end if;
 if exists(select 1 from public.reservations holder where holder.organization_id=v_slot.organization_id and holder.animal_id=p_animal_id and holder.id<>v_res.id and holder.deleted_at is null) then outcome:='conflict';reason:='animal_unavailable';return next;return;end if;
 if exists(select 1 from public.direct_late_sales sale where sale.organization_id=v_slot.organization_id and sale.animal_id=p_animal_id and sale.hold_status='active' and sale.reservation_id<>v_res.id) then outcome:='conflict';reason:='animal_held';return next;return;end if;
 if p_presentation_media_id is not null and not exists(select 1 from public.media media where media.organization_id=v_slot.organization_id and media.id=p_presentation_media_id and media.animal_id=p_animal_id and media.media_type='photo' and media.deleted_at is null) then outcome:='not_eligible';reason:='presentation_photo_invalid';return next;return;end if;
 select preference.id into v_preference from public.choice_appointment_ranked_preferences preference where preference.organization_id=v_slot.organization_id and preference.slot_id=v_slot.id and preference.animal_id=p_animal_id order by preference.revision desc limit 1;
 if v_res.animal_id is not null then select * into v_previous from public.animals where organization_id=v_slot.organization_id and id=v_res.animal_id;end if;
 update public.reservations set animal_id=p_animal_id,animal_assigned_at=v_now,status='animal_assigned',updated_at=v_now,updated_by=v_user where id=v_res.id;
 if v_previous.id is not null and v_previous.id<>p_animal_id then update public.animals set status='available',updated_at=v_now,updated_by=v_user where id=v_previous.id and status='reserved';end if;
 update public.animals set status='reserved',updated_at=v_now,updated_by=v_user where id=p_animal_id;
 if p_presentation_media_id is not null then update public.media set is_primary=(id=p_presentation_media_id),updated_at=v_now,updated_by=v_user where organization_id=v_slot.organization_id and animal_id=p_animal_id and media_type='photo' and deleted_at is null;end if;
 insert into public.animal_assignment_events(organization_id,reservation_id,slot_id,previous_animal_id,animal_id,presentation_media_id,preference_id,event_type,reason,actor_profile_id,actor_role,client_command_id) values(v_slot.organization_id,v_res.id,v_slot.id,v_res.animal_id,p_animal_id,p_presentation_media_id,v_preference,case when v_res.animal_id is null then 'assigned' else 'changed' end,nullif(btrim(coalesce(p_reason,'')),''),v_user,v_role,p_client_command_id) returning id into v_event;
 update public.choice_appointment_slots set status='assigned',assignment_event_id=v_event,version=version+1,updated_at=v_now where id=v_slot.id;
 insert into public.animal_assignment_commands(organization_id,client_command_id,payload_hash,outcome,result,actor_profile_id) values(v_slot.organization_id,p_client_command_id,p_payload_hash,'assigned',jsonb_build_object('assignmentEventId',v_event,'animalId',p_animal_id),v_user);
 outcome:='assigned';assignment_event_id:=v_event;return next;end;$$;

create or replace function public.report_choice_appointment_slot(p_slot_id uuid,p_reason text,p_client_command_id uuid)
returns table(outcome text,sequence integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.choice_appointment_slots%rowtype;v_plan public.choice_appointment_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_next integer;begin select * into v_slot from public.choice_appointment_slots where id=p_slot_id;if not found then outcome:='not_eligible';reason:='slot_not_found';return next;return;end if;select * into v_plan from public.choice_appointment_plans where id=v_slot.plan_id for update;perform 1 from public.choice_appointment_slots s where s.plan_id=v_plan.id order by s.id for update;select * into v_slot from public.choice_appointment_slots where id=p_slot_id;if v_slot.status='assigned' then outcome:='not_eligible';reason:='slot_finalized';return next;return;end if;v_role:=public.choice_appointment_owner_admin_role(v_slot.organization_id);if length(btrim(coalesce(p_reason,'')))<5 then outcome:='not_eligible';reason:='reason_required';return next;return;end if;if exists(select 1 from public.choice_appointment_commands where organization_id=v_slot.organization_id and client_command_id=p_client_command_id) then outcome:='already_applied';sequence:=v_slot.sequence;return next;return;end if;select coalesce(max(s.sequence),0)+1 into v_next from public.choice_appointment_slots s where s.plan_id=v_slot.plan_id;update public.choice_appointment_slots set sequence=v_next,status='reported',report_reason=btrim(p_reason),version=version+1,updated_at=now() where id=v_slot.id;insert into public.choice_appointment_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_slot.organization_id,v_slot.plan_id,v_slot.id,v_slot.reservation_id,'slot_reported','member',v_user,v_role,jsonb_build_object('previousSequence',v_slot.sequence,'newSequence',v_next,'historicalRank',v_slot.historical_rank,'reason',btrim(p_reason)),p_client_command_id);insert into public.choice_appointment_commands(organization_id,client_command_id,command_type,target_id,outcome,result,actor_profile_id) values(v_slot.organization_id,p_client_command_id,'report_slot',v_slot.id,'reported',jsonb_build_object('sequence',v_next),v_user);outcome:='reported';sequence:=v_next;return next;end;$$;

-- Replace the permissive assignment guard: browser roles cannot mutate the managed link directly.
create or replace function public.guard_strict_animal_assignment()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.animal_id is not distinct from old.animal_id then return new;end if;
 if tg_op='INSERT' and new.animal_id is null then return new;end if;
 if current_user in('postgres','supabase_admin') then return new;end if;
 raise exception 'animal_assignment_rpc_required' using errcode='42501';
end;$$;

create or replace function public.guard_animal_assignment_lock()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.animal_assignment_locked is not distinct from old.animal_assignment_locked then return new;end if;
 if current_user in('postgres','supabase_admin') then return new;end if;
 raise exception 'animal_assignment_lock_managed' using errcode='42501';
end;$$;
create trigger reservations_animal_assignment_lock_guard
before update of animal_assignment_locked on public.reservations
for each row execute function public.guard_animal_assignment_lock();

create or replace function public.lock_assignment_on_first_individual_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is null
    and new.reservation_id is not null
    and new.animal_id is not null
 then
   update public.reservations reservation
   set animal_assignment_locked=true,updated_at=clock_timestamp(),updated_by=coalesce(new.updated_by,new.created_by)
   where reservation.organization_id=new.organization_id
     and reservation.id=new.reservation_id
     and reservation.animal_id=new.animal_id
     and not reservation.animal_assignment_locked;
 end if;
 return new;
end;$$;
create trigger documents_lock_animal_assignment
after insert or update of animal_id,reservation_id,document_type,deleted_at on public.documents
for each row execute function public.lock_assignment_on_first_individual_document();

update public.reservations reservation
set animal_assignment_locked=true,
    updated_at=clock_timestamp()
where reservation.animal_id is not null
  and not reservation.animal_assignment_locked
  and reservation.deleted_at is null
  and exists(
    select 1 from public.documents document
    where document.organization_id=reservation.organization_id
      and document.reservation_id=reservation.id
      and document.animal_id=reservation.animal_id
      and document.deleted_at is null
  );

-- Multi-photo private gallery. Existing /primary/ objects remain readable.
drop policy if exists animal_media_objects_select_member on storage.objects;
create policy animal_media_objects_select_member on storage.objects for select to authenticated using(
  bucket_id='animal-media'
  and name~'^organizations/[0-9a-f-]{36}/animals/[0-9a-f-]{36}/(primary|photos)/[0-9a-f-]{36}\.webp$'
  and public.is_member_of(split_part(name,'/',2)::uuid)
  and exists(
    select 1 from public.animals animal
    where animal.organization_id=split_part(name,'/',2)::uuid
      and animal.id=split_part(name,'/',4)::uuid
      and animal.deleted_at is null
  )
);
drop policy if exists animal_media_objects_insert_writer on storage.objects;
create policy animal_media_objects_insert_writer on storage.objects for insert to authenticated with check(
  bucket_id='animal-media'
  and name~'^organizations/[0-9a-f-]{36}/animals/[0-9a-f-]{36}/(primary|photos)/[0-9a-f-]{36}\.webp$'
  and public.has_organization_role(split_part(name,'/',2)::uuid,array['owner','admin'])
  and exists(
    select 1 from public.animals animal
    where animal.organization_id=split_part(name,'/',2)::uuid
      and animal.id=split_part(name,'/',4)::uuid
      and animal.deleted_at is null
  )
);
drop policy if exists animal_media_objects_update_writer on storage.objects;
create policy animal_media_objects_update_writer on storage.objects for update to authenticated
using(
  bucket_id='animal-media'
  and public.has_organization_role(split_part(name,'/',2)::uuid,array['owner','admin'])
  and exists(
    select 1 from public.animals animal
    where animal.organization_id=split_part(name,'/',2)::uuid
      and animal.id=split_part(name,'/',4)::uuid
      and animal.deleted_at is null
  )
)
with check(
  bucket_id='animal-media'
  and name~'^organizations/[0-9a-f-]{36}/animals/[0-9a-f-]{36}/(primary|photos)/[0-9a-f-]{36}\.webp$'
  and public.has_organization_role(split_part(name,'/',2)::uuid,array['owner','admin'])
  and exists(
    select 1 from public.animals animal
    where animal.organization_id=split_part(name,'/',2)::uuid
      and animal.id=split_part(name,'/',4)::uuid
      and animal.deleted_at is null
  )
);
drop policy if exists animal_media_objects_delete_writer on storage.objects;
create policy animal_media_objects_delete_writer on storage.objects for delete to authenticated using(
  bucket_id='animal-media'
  and public.has_organization_role(split_part(name,'/',2)::uuid,array['owner','admin'])
  and exists(
    select 1 from public.animals animal
    where animal.organization_id=split_part(name,'/',2)::uuid
      and animal.id=split_part(name,'/',4)::uuid
      and animal.deleted_at is null
  )
);

create or replace function public.select_animal_presentation_photo(p_animal_id uuid,p_media_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_animal public.animals%rowtype;begin select * into v_animal from public.animals where id=p_animal_id and deleted_at is null for update;if not found then return 'not_found';end if;perform public.choice_appointment_owner_admin_role(v_animal.organization_id);if not exists(select 1 from public.media media where media.organization_id=v_animal.organization_id and media.id=p_media_id and media.animal_id=v_animal.id and media.media_type='photo' and media.deleted_at is null) then return 'not_eligible';end if;update public.media set is_primary=(id=p_media_id),updated_at=now(),updated_by=auth.uid() where organization_id=v_animal.organization_id and animal_id=v_animal.id and media_type='photo' and deleted_at is null;return 'selected';end;$$;

revoke all on function public.create_choice_appointment_plan(uuid,timestamptz,integer,jsonb,uuid) from public,anon;
revoke all on function public.validate_choice_appointment_plan(uuid,integer,uuid) from public,anon;
revoke all on function public.update_choice_appointment_slot(uuid,timestamptz,integer,uuid) from public,anon;
revoke all on function public.exchange_choice_appointment_public_token(text,text) from public,anon,authenticated;
revoke all on function public.read_choice_appointment_public_session(text) from public,anon,authenticated;
revoke all on function public.respond_choice_appointment_public_session(text,text,uuid) from public,anon,authenticated;
revoke all on function public.save_choice_appointment_ranked_preferences(uuid,uuid[],uuid) from public,anon;
revoke all on function public.assign_choice_appointment_animal(uuid,uuid,uuid,text,text,uuid) from public,anon;
revoke all on function public.report_choice_appointment_slot(uuid,text,uuid) from public,anon;
revoke all on function public.select_animal_presentation_photo(uuid,uuid) from public,anon;
grant execute on function public.create_choice_appointment_plan(uuid,timestamptz,integer,jsonb,uuid),public.validate_choice_appointment_plan(uuid,integer,uuid),public.update_choice_appointment_slot(uuid,timestamptz,integer,uuid),public.save_choice_appointment_ranked_preferences(uuid,uuid[],uuid),public.assign_choice_appointment_animal(uuid,uuid,uuid,text,text,uuid),public.report_choice_appointment_slot(uuid,text,uuid),public.select_animal_presentation_photo(uuid,uuid) to authenticated;
grant execute on function public.exchange_choice_appointment_public_token(text,text),public.read_choice_appointment_public_session(text),public.respond_choice_appointment_public_session(text,text,uuid) to service_role;

insert into public.email_templates(organization_id,template_key,title,category,subject,body,is_active)
select organization.id,'choice_appointment_adoption_booklet','Invitation au rendez-vous de choix','adopter_journey','Votre rendez-vous de choix','Modèle transactionnel géré dans Brevo : prenom, portee, date_rendez_vous, lien_hermes, type_message.',true
from public.organizations organization where organization.deleted_at is null
on conflict(organization_id,template_key) do nothing;

insert into public.email_templates(organization_id,template_key,title,category,subject,body,is_active)
select organization.id,'choice_assignment_confirmation','Confirmation du chiot attribué','adopter_journey','Votre chiot est attribué','Modèle transactionnel géré dans Brevo : prenom, portee, nom_chiot, photo_chiot.',true
from public.organizations organization where organization.deleted_at is null
on conflict(organization_id,template_key) do nothing;

commit;

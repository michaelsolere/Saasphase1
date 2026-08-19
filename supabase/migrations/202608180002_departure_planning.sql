-- DEPARTURE-ORGANIZATION-01
-- Versioned multi-litter departure planning and atomic family booking.

begin;

create table public.departure_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'draft',
  title text not null default 'Départs',
  default_duration_minutes integer not null default 75,
  response_deadline_at timestamptz,
  version integer not null default 1,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint departure_plans_org_id_key unique(organization_id,id),
  constraint departure_plans_status_check check(status in('draft','published','closed','cancelled')),
  constraint departure_plans_duration_check check(default_duration_minutes between 5 and 480),
  constraint departure_plans_version_check check(version>0),
  constraint departure_plans_publish_check check(status='draft' or (response_deadline_at is not null and published_at is not null and published_by is not null))
);

create table public.departure_plan_litters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  litter_id uuid not null,
  earliest_departure_at timestamptz not null,
  added_after_publish boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint departure_plan_litters_org_id_key unique(organization_id,id),
  constraint departure_plan_litters_plan_fk foreign key(organization_id,plan_id) references public.departure_plans(organization_id,id) on delete restrict,
  constraint departure_plan_litters_litter_fk foreign key(organization_id,litter_id) references public.litters(organization_id,id) on delete restrict,
  constraint departure_plan_litters_unique unique(organization_id,plan_id,litter_id)
);

create table public.departure_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes integer not null,
  visibility text not null default 'public',
  status text not null default 'open',
  reservation_id uuid,
  booked_at timestamptz,
  booked_by_kind text,
  confirmed_at timestamptz,
  previous_slot_id uuid,
  reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint departure_slots_org_id_key unique(organization_id,id),
  constraint departure_slots_plan_fk foreign key(organization_id,plan_id) references public.departure_plans(organization_id,id) on delete restrict,
  constraint departure_slots_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id) on delete restrict,
  constraint departure_slots_previous_fk foreign key(organization_id,previous_slot_id) references public.departure_slots(organization_id,id) on delete restrict,
  constraint departure_slots_duration_check check(duration_minutes between 5 and 480),
  constraint departure_slots_visibility_check check(visibility in('public','exceptional')),
  constraint departure_slots_status_check check(status in('open','booked','to_review','cancelled','completed','late','no_show')),
  constraint departure_slots_booking_check check(
    (status='open' and reservation_id is null and booked_at is null)
    or (status<>'open' and (status='cancelled' or reservation_id is not null))
  ),
  constraint departure_slots_kind_check check(booked_by_kind is null or booked_by_kind in('family','member','exceptional')),
  constraint departure_slots_exceptional_check check(visibility<>'exceptional' or reservation_id is not null),
  constraint departure_slots_reason_check check(reason is null or char_length(btrim(reason)) between 3 and 5000),
  constraint departure_slots_version_check check(version>0)
);
create unique index departure_slots_one_active_reservation_idx
  on public.departure_slots(organization_id,reservation_id)
  where reservation_id is not null and status in('booked','to_review','completed','late','no_show');
create index departure_slots_plan_time_idx on public.departure_slots(organization_id,plan_id,starts_at,id);

create table public.departure_public_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  reservation_id uuid not null,
  token_hash text not null,
  token_hint text not null,
  expires_at timestamptz not null,
  response_kind text,
  responded_at timestamptz,
  invitation_delivery_attempt_id uuid,
  invitation_sent_at timestamptz,
  confirmation_delivery_attempt_id uuid,
  confirmation_sent_at timestamptz,
  response_reminder_delivery_attempt_id uuid,
  response_reminder_sent_at timestamptz,
  appointment_reminder_delivery_attempt_id uuid,
  appointment_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  constraint departure_public_accesses_org_id_key unique(organization_id,id),
  constraint departure_public_accesses_plan_fk foreign key(organization_id,plan_id) references public.departure_plans(organization_id,id) on delete restrict,
  constraint departure_public_accesses_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id) on delete restrict,
  constraint departure_public_accesses_token_key unique(token_hash),
  constraint departure_public_accesses_hash_check check(token_hash~'^[0-9a-f]{64}$' and length(token_hint) between 4 and 12),
  constraint departure_public_accesses_response_check check(response_kind is null or response_kind in('booked','none_fit')),
  constraint departure_public_accesses_dates_check check(expires_at>created_at)
);
alter table public.departure_public_accesses
  add constraint departure_public_accesses_invitation_attempt_fk foreign key(organization_id,invitation_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id) on delete restrict,
  add constraint departure_public_accesses_confirmation_attempt_fk foreign key(organization_id,confirmation_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id) on delete restrict,
  add constraint departure_public_accesses_response_reminder_attempt_fk foreign key(organization_id,response_reminder_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id) on delete restrict,
  add constraint departure_public_accesses_appointment_reminder_attempt_fk foreign key(organization_id,appointment_reminder_delivery_attempt_id) references public.email_delivery_attempts(organization_id,id) on delete restrict;
create unique index departure_public_one_active_access_idx on public.departure_public_accesses(organization_id,plan_id,reservation_id) where revoked_at is null;

create table public.departure_public_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  access_id uuid not null references public.departure_public_accesses(id) on delete restrict,
  session_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint departure_public_sessions_org_id_key unique(organization_id,id),
  constraint departure_public_sessions_hash_key unique(session_hash),
  constraint departure_public_sessions_hash_check check(session_hash~'^[0-9a-f]{64}$'),
  constraint departure_public_sessions_dates_check check(expires_at>created_at and expires_at<=created_at+interval '2 hours')
);

create table public.departure_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  command_type text not null,
  target_id uuid,
  payload_hash text,
  outcome text not null,
  result jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  public_session_id uuid references public.departure_public_sessions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint departure_commands_unique unique(organization_id,client_command_id),
  constraint departure_commands_hash_check check(payload_hash is null or payload_hash~'^[0-9a-f]{64}$'),
  constraint departure_commands_result_check check(jsonb_typeof(result)='object')
);

create table public.departure_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  slot_id uuid,
  reservation_id uuid,
  event_type text not null,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint departure_events_org_id_key unique(organization_id,id),
  constraint departure_events_plan_fk foreign key(organization_id,plan_id) references public.departure_plans(organization_id,id) on delete restrict,
  constraint departure_events_slot_fk foreign key(organization_id,slot_id) references public.departure_slots(organization_id,id) on delete restrict,
  constraint departure_events_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id) on delete restrict,
  constraint departure_events_command_key unique(organization_id,client_command_id),
  constraint departure_events_actor_check check(actor_kind in('member','family','system')),
  constraint departure_events_details_check check(jsonb_typeof(details)='object')
);
create index departure_events_history_idx on public.departure_events(organization_id,plan_id,occurred_at,id);

create or replace function public.guard_departure_append_only()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and session_user='postgres' and current_setting('app.qa_hard_delete',true)='on' then return old;end if;
  raise exception '% is append-only',tg_table_name using errcode='55000';
end;$$;
create trigger departure_commands_immutable before update or delete on public.departure_commands for each row execute function public.guard_departure_append_only();
create trigger departure_events_immutable before update or delete on public.departure_events for each row execute function public.guard_departure_append_only();

alter table public.departure_plans enable row level security;
alter table public.departure_plan_litters enable row level security;
alter table public.departure_slots enable row level security;
alter table public.departure_public_accesses enable row level security;
alter table public.departure_public_sessions enable row level security;
alter table public.departure_commands enable row level security;
alter table public.departure_events enable row level security;

create policy departure_plans_select on public.departure_plans for select to authenticated using(public.is_member_of(organization_id));
create policy departure_plan_litters_select on public.departure_plan_litters for select to authenticated using(public.is_member_of(organization_id));
create policy departure_slots_select on public.departure_slots for select to authenticated using(public.is_member_of(organization_id));
create policy departure_events_select on public.departure_events for select to authenticated using(public.is_member_of(organization_id));

revoke all on public.departure_plans,public.departure_plan_litters,public.departure_slots,public.departure_commands,public.departure_events from public,anon,authenticated;
revoke all on public.departure_public_accesses,public.departure_public_sessions from public,anon,authenticated;
grant select on public.departure_plans,public.departure_plan_litters,public.departure_slots,public.departure_events to authenticated;
grant select,insert,update on public.departure_public_accesses,public.departure_public_sessions to service_role;
grant select,update on public.departure_plans,public.departure_slots to service_role;
grant select,insert on public.departure_commands,public.departure_events to service_role;

create or replace function public.departure_owner_admin_role(p_organization_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_role text;begin
  select membership.role into v_role from public.memberships membership where membership.organization_id=p_organization_id and membership.profile_id=auth.uid() and membership.status='active' and membership.deleted_at is null;
  if v_role not in('owner','admin') then raise exception 'owner_or_admin_required' using errcode='42501';end if;
  return v_role;
end;$$;

create or replace function public.departure_assert_no_overlap(p_plan_id uuid,p_slot_id uuid,p_starts_at timestamptz,p_duration_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.departure_slots slot where slot.plan_id=p_plan_id and slot.id is distinct from p_slot_id and slot.status<>'cancelled' and tstzrange(slot.starts_at,slot.starts_at+make_interval(mins=>slot.duration_minutes),'[)') && tstzrange(p_starts_at,p_starts_at+make_interval(mins=>p_duration_minutes),'[)')) then
    raise exception 'departure_slot_overlap' using errcode='23P01';
  end if;
end;$$;

create or replace function public.create_departure_plan(p_title text,p_default_duration_minutes integer,p_litters jsonb,p_client_command_id uuid)
returns table(outcome text,plan_id uuid,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_litter jsonb;v_org uuid;v_plan uuid;v_role text;v_existing public.departure_commands%rowtype;v_hash text;begin
  if v_user is null or p_client_command_id is null or p_default_duration_minutes not between 5 and 480 or jsonb_typeof(p_litters)<>'array' or jsonb_array_length(p_litters)=0 then outcome:='not_eligible';reason:='invalid_input';return next;return;end if;
  select litter.organization_id into v_org from public.litters litter where litter.id=(p_litters->0->>'litterId')::uuid and litter.deleted_at is null;
  if v_org is null then outcome:='not_eligible';reason:='litter_not_found';return next;return;end if;
  v_role:=public.departure_owner_admin_role(v_org);v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('title',coalesce(nullif(btrim(p_title),''),'Départs'),'duration',p_default_duration_minutes,'litters',p_litters)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.departure_commands command where command.organization_id=v_org and command.client_command_id=p_client_command_id;
  if found then if v_existing.command_type<>'create_plan' or v_existing.payload_hash is distinct from v_hash then outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;outcome:=v_existing.outcome;plan_id=nullif(v_existing.result->>'planId','')::uuid;version=nullif(v_existing.result->>'version','')::integer;return next;return;end if;
  insert into public.departure_plans(organization_id,title,default_duration_minutes,created_by,updated_by) values(v_org,coalesce(nullif(btrim(p_title),''),'Départs'),p_default_duration_minutes,v_user,v_user) returning id,departure_plans.version into v_plan,version;
  for v_litter in select value from jsonb_array_elements(p_litters) loop
    if not exists(select 1 from public.litters litter where litter.id=(v_litter->>'litterId')::uuid and litter.organization_id=v_org and litter.deleted_at is null) then raise exception 'litter_not_found';end if;
    insert into public.departure_plan_litters(organization_id,plan_id,litter_id,earliest_departure_at,created_by) values(v_org,v_plan,(v_litter->>'litterId')::uuid,(v_litter->>'earliestDepartureAt')::timestamptz,v_user);
  end loop;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_org,p_client_command_id,'create_plan',v_plan,v_hash,'created',jsonb_build_object('planId',v_plan,'version',version),v_user);
  insert into public.departure_events(organization_id,plan_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_org,v_plan,'plan_created','member',v_user,v_role,jsonb_build_object('litterCount',jsonb_array_length(p_litters)),p_client_command_id);
  outcome:='created';plan_id:=v_plan;return next;
exception when others then if sqlerrm='litter_not_found' then outcome:='not_eligible';reason:=sqlerrm;return next;else raise;end if;end;$$;

create or replace function public.upsert_departure_slot(p_plan_id uuid,p_slot_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_visibility text,p_reservation_id uuid,p_expected_version integer,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_plan public.departure_plans%rowtype;v_slot public.departure_slots%rowtype;v_user uuid:=auth.uid();v_role text;v_event text;v_existing public.departure_commands%rowtype;v_hash text;begin
  select * into v_plan from public.departure_plans plan where plan.id=p_plan_id for update;if not found then outcome:='not_eligible';reason:='plan_not_found';return next;return;end if;
  v_role:=public.departure_owner_admin_role(v_plan.organization_id);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('planId',p_plan_id,'slotId',p_slot_id,'startsAt',p_starts_at,'durationMinutes',p_duration_minutes,'visibility',p_visibility,'reservationId',p_reservation_id,'expectedVersion',p_expected_version)::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type<>'upsert_slot' or v_existing.payload_hash is distinct from v_hash then outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;outcome:='already_applied';slot_id:=nullif(v_existing.result->>'slotId','')::uuid;version:=nullif(v_existing.result->>'version','')::integer;return next;return;end if;
  if v_plan.status<>'draft' or v_plan.version<>p_expected_version or p_duration_minutes not between 5 and 480 or p_visibility not in('public','exceptional') or (p_visibility='exceptional' and p_reservation_id is null) then outcome:='conflict';reason:='invalid_or_stale_plan';version:=v_plan.version;return next;return;end if;
  perform public.departure_assert_no_overlap(v_plan.id,p_slot_id,p_starts_at,p_duration_minutes);
  if p_slot_id is null then
    insert into public.departure_slots(organization_id,plan_id,starts_at,duration_minutes,visibility,status,reservation_id,booked_at,booked_by_kind,confirmed_at,created_by,updated_by) values(v_plan.organization_id,v_plan.id,p_starts_at,p_duration_minutes,p_visibility,case when p_reservation_id is null then 'open' else 'booked' end,p_reservation_id,case when p_reservation_id is null then null else now() end,case when p_reservation_id is null then null else 'exceptional' end,case when p_reservation_id is null then null else now() end,v_user,v_user) returning id into slot_id;v_event:='slot_created';
  else
    select * into v_slot from public.departure_slots where organization_id=v_plan.organization_id and id=p_slot_id and plan_id=v_plan.id for update;
    if not found or v_slot.status<>'open' then outcome:='conflict';reason:='slot_not_editable';return next;return;end if;
    update public.departure_slots set starts_at=p_starts_at,duration_minutes=p_duration_minutes,visibility=p_visibility,version=departure_slots.version+1,updated_at=now(),updated_by=v_user where id=v_slot.id returning id into slot_id;v_event:='slot_adjusted';
  end if;
  update public.departure_plans plan set version=plan.version+1,updated_at=now(),updated_by=v_user where id=v_plan.id returning plan.version into version;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'upsert_slot',slot_id,v_hash,'updated',jsonb_build_object('slotId',slot_id,'version',version),v_user);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,client_command_id) values(v_plan.organization_id,v_plan.id,slot_id,p_reservation_id,v_event,'member',v_user,v_role,p_client_command_id);
  outcome:='updated';return next;end;$$;

create or replace function public.publish_departure_plan(p_plan_id uuid,p_response_deadline_at timestamptz,p_expected_version integer,p_client_command_id uuid)
returns table(outcome text,version integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_plan public.departure_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_needed integer;v_free integer;v_link record;v_cumulative integer:=0;v_existing public.departure_commands%rowtype;v_hash text;begin
  select * into v_plan from public.departure_plans plan where plan.id=p_plan_id for update;if not found then outcome:='not_eligible';reason:='plan_not_found';return next;return;end if;v_role:=public.departure_owner_admin_role(v_plan.organization_id);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('planId',p_plan_id,'deadline',p_response_deadline_at,'expectedVersion',p_expected_version)::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type<>'publish_plan' or v_existing.target_id<>p_plan_id or v_existing.payload_hash is distinct from v_hash then outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;outcome:='already_applied';version:=nullif(v_existing.result->>'version','')::integer;return next;return;end if;
  if v_plan.status<>'draft' or v_plan.version<>p_expected_version or p_response_deadline_at<=now() then outcome:='conflict';reason:='invalid_or_stale_plan';version:=v_plan.version;return next;return;end if;
  select count(*) into v_needed from public.reservations reservation where reservation.organization_id=v_plan.organization_id and reservation.litter_id in(select link.litter_id from public.departure_plan_litters link where link.plan_id=v_plan.id) and reservation.animal_id is not null and reservation.status='animal_assigned' and reservation.deleted_at is null and not exists(select 1 from public.departure_slots slot where slot.plan_id=v_plan.id and slot.reservation_id=reservation.id and slot.status in('booked','to_review'));
  select count(*) into v_free from public.departure_slots slot where slot.plan_id=v_plan.id and slot.visibility='public' and slot.status='open';
  if v_free<v_needed then outcome:='not_eligible';reason:='insufficient_public_slots';return next;return;end if;
  for v_link in select link.litter_id,link.earliest_departure_at from public.departure_plan_litters link where link.plan_id=v_plan.id order by link.earliest_departure_at desc,link.litter_id loop
    select v_cumulative+count(*) into v_cumulative from public.reservations reservation where reservation.organization_id=v_plan.organization_id and reservation.litter_id=v_link.litter_id and reservation.animal_id is not null and reservation.status='animal_assigned' and reservation.deleted_at is null and not exists(select 1 from public.departure_slots slot where slot.plan_id=v_plan.id and slot.reservation_id=reservation.id and slot.status in('booked','to_review'));
    select count(*) into v_free from public.departure_slots slot where slot.plan_id=v_plan.id and slot.visibility='public' and slot.status='open' and slot.starts_at>=v_link.earliest_departure_at;
    if v_free<v_cumulative then outcome:='not_eligible';reason:='insufficient_eligible_public_slots';return next;return;end if;
  end loop;
  update public.departure_plans plan set status='published',response_deadline_at=p_response_deadline_at,published_at=now(),published_by=v_user,version=plan.version+1,updated_at=now(),updated_by=v_user where id=v_plan.id returning plan.version into version;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'publish_plan',v_plan.id,v_hash,'published',jsonb_build_object('version',version),v_user);
  insert into public.departure_events(organization_id,plan_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_plan.organization_id,v_plan.id,'plan_published','member',v_user,v_role,jsonb_build_object('responseDeadlineAt',p_response_deadline_at,'invitedCount',v_needed),p_client_command_id);
  outcome:='published';return next;end;$$;

create or replace function public.exchange_departure_public_token(p_token_hash text,p_session_hash text)
returns table(outcome text,session_expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare v_access public.departure_public_accesses%rowtype;begin
  outcome:='unavailable';session_expires_at:=null;if p_token_hash!~'^[0-9a-f]{64}$' or p_session_hash!~'^[0-9a-f]{64}$' then return next;return;end if;
  select * into v_access from public.departure_public_accesses access where access.token_hash=p_token_hash and access.revoked_at is null and access.expires_at>now() for update;if not found then return next;return;end if;
  update public.departure_public_sessions set revoked_at=now() where organization_id=v_access.organization_id and access_id=v_access.id and revoked_at is null;session_expires_at:=now()+interval '2 hours';insert into public.departure_public_sessions(organization_id,access_id,session_hash,expires_at) values(v_access.organization_id,v_access.id,p_session_hash,session_expires_at);outcome:='opened';return next;end;$$;

create or replace function public.read_departure_public_session(p_session_hash text)
returns table(outcome text,response_deadline_at timestamptz,confirmed_slot_id uuid,confirmed_starts_at timestamptz,confirmed_duration_minutes integer,available_slots jsonb) language plpgsql security definer set search_path='' as $$
declare v_session public.departure_public_sessions%rowtype;v_access public.departure_public_accesses%rowtype;v_plan public.departure_plans%rowtype;v_res public.reservations%rowtype;v_earliest timestamptz;begin
  outcome:='unavailable';available_slots:='[]'::jsonb;
  select session.* into v_session from public.departure_public_sessions session where session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now();if not found then return next;return;end if;
  select * into v_access from public.departure_public_accesses where organization_id=v_session.organization_id and id=v_session.access_id and revoked_at is null and expires_at>now();if not found then return next;return;end if;select * into v_plan from public.departure_plans where organization_id=v_access.organization_id and id=v_access.plan_id;if not found then return next;return;end if;select * into v_res from public.reservations where organization_id=v_access.organization_id and id=v_access.reservation_id and deleted_at is null;if not found then return next;return;end if;
  if v_plan.status not in('published','closed') then return next;return;end if;
  select link.earliest_departure_at into v_earliest from public.departure_plan_litters link where link.plan_id=v_plan.id and link.litter_id=v_res.litter_id;
  select slot.id,slot.starts_at,slot.duration_minutes into confirmed_slot_id,confirmed_starts_at,confirmed_duration_minutes from public.departure_slots slot where slot.plan_id=v_plan.id and slot.reservation_id=v_res.id and slot.status in('booked','to_review','completed','late','no_show') order by slot.booked_at desc limit 1;
  response_deadline_at:=v_plan.response_deadline_at;
  if confirmed_slot_id is null and v_access.response_kind is null and v_plan.status='published' and v_plan.response_deadline_at>now() then select coalesce(jsonb_agg(jsonb_build_object('id',slot.id,'startsAt',slot.starts_at,'durationMinutes',slot.duration_minutes) order by slot.starts_at),'[]'::jsonb) into available_slots from public.departure_slots slot where slot.plan_id=v_plan.id and slot.visibility='public' and slot.status='open' and slot.starts_at>=v_earliest;end if;
  outcome:='available';return next;end;$$;

create or replace function public.departure_write_calendar_projection(p_slot public.departure_slots,p_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_event uuid;begin
  perform set_config('app.departure_calendar_projection','on',true);
  select event.id into v_event from public.events event where event.organization_id=p_slot.organization_id and event.departure_slot_id=p_slot.id;
  if v_event is null then
    insert into public.events(organization_id,reservation_id,event_type,title,planned_at,status,priority,is_task,departure_slot_id,created_by,updated_by) values(p_slot.organization_id,p_slot.reservation_id,'adoption','Rendez-vous d’adoption / départ',p_slot.starts_at,'done','normal',false,p_slot.id,p_user,p_user) returning id into v_event;
  else
    update public.events set reservation_id=p_slot.reservation_id,planned_at=p_slot.starts_at,status='done',updated_at=now(),updated_by=p_user where id=v_event;
  end if;return v_event;end;$$;

create or replace function public.book_departure_public_session(p_session_hash text,p_slot_id uuid,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,starts_at timestamptz,reason text) language plpgsql security definer set search_path='' as $$
declare v_session public.departure_public_sessions%rowtype;v_access public.departure_public_accesses%rowtype;v_plan public.departure_plans%rowtype;v_slot public.departure_slots%rowtype;v_res public.reservations%rowtype;v_earliest timestamptz;v_command public.departure_commands%rowtype;v_event_id uuid;v_hash text;begin
  outcome:='unavailable';slot_id:=null;starts_at:=null;reason:=null;
  select session.* into v_session from public.departure_public_sessions session where session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now();if not found then return next;return;end if;
  select * into v_access from public.departure_public_accesses where organization_id=v_session.organization_id and id=v_session.access_id and revoked_at is null and expires_at>now() for update;if not found then return next;return;end if;select session.* into v_session from public.departure_public_sessions session where session.id=v_session.id and session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now() for update;if not found then return next;return;end if;select * into v_plan from public.departure_plans where id=v_access.plan_id for update;v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('slotId',p_slot_id)::text,'UTF8'),'sha256'),'hex');
  select * into v_command from public.departure_commands command where command.public_session_id=v_session.id and command.client_command_id=p_client_command_id;if found then if v_command.command_type<>'public_booking' or v_command.target_id<>p_slot_id or v_command.payload_hash is distinct from v_hash then outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;outcome:=v_command.outcome;slot_id=nullif(v_command.result->>'slotId','')::uuid;starts_at=nullif(v_command.result->>'startsAt','')::timestamptz;return next;return;end if;
  if v_plan.status<>'published' or v_plan.response_deadline_at<=now() or v_access.response_kind is not null then reason:='booking_closed';return next;return;end if;
  select * into v_res from public.reservations where organization_id=v_access.organization_id and id=v_access.reservation_id and status='animal_assigned' and animal_id is not null and deleted_at is null for update;if not found then reason:='reservation_not_eligible';return next;return;end if;
  if exists(select 1 from public.departure_slots existing where existing.organization_id=v_access.organization_id and existing.plan_id=v_plan.id and existing.reservation_id=v_res.id and existing.status in('booked','to_review','completed','late','no_show')) then reason:='already_booked';return next;return;end if;
  select link.earliest_departure_at into v_earliest from public.departure_plan_litters link where link.plan_id=v_plan.id and link.litter_id=v_res.litter_id;
  select * into v_slot from public.departure_slots slot where slot.organization_id=v_access.organization_id and slot.id=p_slot_id and slot.plan_id=v_plan.id for update;
  if not found or v_slot.visibility<>'public' or v_slot.status<>'open' or v_slot.reservation_id is not null or v_slot.starts_at<v_earliest then reason:='slot_unavailable';return next;return;end if;
  update public.departure_slots set status='booked',reservation_id=v_res.id,booked_at=now(),booked_by_kind='family',confirmed_at=now(),version=version+1,updated_at=now() where id=v_slot.id returning * into v_slot;
  update public.departure_public_accesses set response_kind='booked',responded_at=now() where id=v_access.id;
  v_event_id:=public.departure_write_calendar_projection(v_slot,null);
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,public_session_id) values(v_access.organization_id,p_client_command_id,'public_booking',v_slot.id,v_hash,'booked',jsonb_build_object('slotId',v_slot.id,'startsAt',v_slot.starts_at,'calendarEventId',v_event_id),v_session.id);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,details,client_command_id) values(v_access.organization_id,v_plan.id,v_slot.id,v_res.id,'appointment_booked','family',jsonb_build_object('startsAt',v_slot.starts_at,'durationMinutes',v_slot.duration_minutes),p_client_command_id);
  outcome:='booked';slot_id:=v_slot.id;starts_at:=v_slot.starts_at;return next;end;$$;

create or replace function public.decline_departure_public_session(p_session_hash text,p_client_command_id uuid)
returns table(outcome text,reason text) language plpgsql security definer set search_path='' as $$
declare v_session public.departure_public_sessions%rowtype;v_access public.departure_public_accesses%rowtype;v_plan public.departure_plans%rowtype;v_command public.departure_commands%rowtype;v_hash text;begin
  outcome:='unavailable';reason:=null;
  select session.* into v_session from public.departure_public_sessions session where session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now();if not found then return next;return;end if;
  select * into v_access from public.departure_public_accesses where organization_id=v_session.organization_id and id=v_session.access_id and revoked_at is null and expires_at>now() for update;if not found then return next;return;end if;select session.* into v_session from public.departure_public_sessions session where session.id=v_session.id and session.session_hash=p_session_hash and session.revoked_at is null and session.expires_at>now() for update;if not found then return next;return;end if;select * into v_plan from public.departure_plans where id=v_access.plan_id for update;v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('reservationId',v_access.reservation_id)::text,'UTF8'),'sha256'),'hex');
  select * into v_command from public.departure_commands command where command.public_session_id=v_session.id and command.client_command_id=p_client_command_id;if found then if v_command.command_type<>'none_fit' or v_command.target_id<>v_access.reservation_id or v_command.payload_hash is distinct from v_hash then outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;outcome:='recorded';return next;return;end if;
  if v_plan.status<>'published' or v_plan.response_deadline_at<=now() or v_access.response_kind is not null then reason:='response_closed';return next;return;end if;
  update public.departure_public_accesses set response_kind='none_fit',responded_at=now() where id=v_access.id;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,public_session_id) values(v_access.organization_id,p_client_command_id,'none_fit',v_access.reservation_id,v_hash,'recorded',jsonb_build_object('reservationId',v_access.reservation_id),v_session.id);
  insert into public.departure_events(organization_id,plan_id,reservation_id,event_type,actor_kind,details,client_command_id) values(v_access.organization_id,v_plan.id,v_access.reservation_id,'no_slot_suitable','family','{}'::jsonb,p_client_command_id);
  outcome:='recorded';return next;end;$$;

create or replace function public.assign_departure_slot(p_slot_id uuid,p_reservation_id uuid,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.departure_slots%rowtype;v_plan public.departure_plans%rowtype;v_res public.reservations%rowtype;v_user uuid:=auth.uid();v_role text;v_existing public.departure_commands%rowtype;v_hash text;begin
  select slot.* into v_slot from public.departure_slots slot where slot.id=p_slot_id;select plan.* into v_plan from public.departure_plans plan where plan.id=v_slot.plan_id for update;v_role:=public.departure_owner_admin_role(v_plan.organization_id);select * into v_slot from public.departure_slots where id=p_slot_id for update;select * into v_res from public.reservations where organization_id=v_plan.organization_id and id=p_reservation_id and status='animal_assigned' and animal_id is not null and deleted_at is null for update;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('slotId',p_slot_id,'reservationId',p_reservation_id)::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type='assign_slot' and v_existing.target_id=p_slot_id and v_existing.payload_hash=v_hash then outcome:=v_existing.outcome;slot_id:=p_slot_id;return next;return;end if;outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;
  if v_res.id is null or v_slot.status<>'open' or v_slot.visibility<>'public' then outcome:='not_eligible';reason:='slot_unavailable';return next;return;end if;
  update public.departure_slots set status='booked',reservation_id=v_res.id,booked_at=now(),booked_by_kind='member',confirmed_at=now(),version=version+1,updated_at=now(),updated_by=v_user where id=v_slot.id returning * into v_slot;perform public.departure_write_calendar_projection(v_slot,v_user);
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'assign_slot',v_slot.id,v_hash,'booked',jsonb_build_object('slotId',v_slot.id),v_user);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,client_command_id) values(v_plan.organization_id,v_plan.id,v_slot.id,v_res.id,'appointment_booked','member',v_user,v_role,p_client_command_id);outcome:='booked';slot_id:=v_slot.id;return next;end;$$;

create or replace function public.move_departure_appointment(p_slot_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_expected_version integer,p_reason text,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.departure_slots%rowtype;v_plan public.departure_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_previous timestamptz;v_existing public.departure_commands%rowtype;v_hash text;begin
  select slot.* into v_slot from public.departure_slots slot where slot.id=p_slot_id;select plan.* into v_plan from public.departure_plans plan where plan.id=v_slot.plan_id for update;v_role:=public.departure_owner_admin_role(v_plan.organization_id);select * into v_slot from public.departure_slots where id=p_slot_id for update;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('slotId',p_slot_id,'startsAt',p_starts_at,'durationMinutes',p_duration_minutes,'expectedVersion',p_expected_version,'reason',btrim(coalesce(p_reason,'')))::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type='move_appointment' and v_existing.target_id=p_slot_id and v_existing.payload_hash=v_hash then outcome:=v_existing.outcome;slot_id:=p_slot_id;return next;return;end if;outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;
  if v_slot.version<>p_expected_version then outcome:='conflict';reason:='slot_stale';return next;return;end if;
  if v_slot.status not in('booked','to_review','late','no_show') or length(btrim(coalesce(p_reason,'')))<3 then outcome:='not_eligible';reason:='appointment_not_movable';return next;return;end if;perform public.departure_assert_no_overlap(v_plan.id,v_slot.id,p_starts_at,p_duration_minutes);v_previous:=v_slot.starts_at;
  update public.departure_slots set starts_at=p_starts_at,duration_minutes=p_duration_minutes,reason=btrim(p_reason),version=version+1,updated_at=now(),updated_by=v_user where id=v_slot.id returning * into v_slot;perform public.departure_write_calendar_projection(v_slot,v_user);
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'move_appointment',v_slot.id,v_hash,'moved',jsonb_build_object('slotId',v_slot.id,'startsAt',v_slot.starts_at),v_user);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_plan.organization_id,v_plan.id,v_slot.id,v_slot.reservation_id,'appointment_moved','member',v_user,v_role,jsonb_build_object('previousStartsAt',v_previous,'startsAt',v_slot.starts_at,'reason',btrim(p_reason)),p_client_command_id);outcome:='moved';slot_id:=v_slot.id;return next;end;$$;

create or replace function public.mark_departure_appointment_status(p_slot_id uuid,p_status text,p_reason text,p_client_command_id uuid)
returns table(outcome text,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.departure_slots%rowtype;v_plan public.departure_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_existing public.departure_commands%rowtype;v_hash text;begin
  select * into v_slot from public.departure_slots where id=p_slot_id;select * into v_plan from public.departure_plans where id=v_slot.plan_id for update;v_role:=public.departure_owner_admin_role(v_plan.organization_id);select * into v_slot from public.departure_slots where id=p_slot_id for update;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('slotId',p_slot_id,'status',p_status,'reason',nullif(btrim(coalesce(p_reason,'')),''))::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type='mark_status' and v_existing.target_id=p_slot_id and v_existing.payload_hash=v_hash then outcome:=v_existing.outcome;return next;return;end if;outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;
  if v_slot.status not in('booked','to_review','late','no_show') or p_status not in('booked','to_review','late','no_show','cancelled') or (p_status in('to_review','no_show','cancelled') and length(btrim(coalesce(p_reason,'')))<3) then outcome:='not_eligible';reason:='invalid_status_transition';return next;return;end if;
  update public.departure_slots set status=p_status,reason=nullif(btrim(coalesce(p_reason,'')),''),version=version+1,updated_at=now(),updated_by=v_user where id=v_slot.id;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'mark_status',v_slot.id,v_hash,'updated',jsonb_build_object('slotId',v_slot.id,'status',p_status),v_user);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_plan.organization_id,v_plan.id,v_slot.id,v_slot.reservation_id,'appointment_'||p_status,'member',v_user,v_role,jsonb_build_object('previousStatus',v_slot.status,'status',p_status,'reason',nullif(btrim(coalesce(p_reason,'')),'')),p_client_command_id);outcome:='updated';return next;end;$$;

create or replace function public.departure_shift_paris_days(p_value timestamptz,p_days integer)
returns timestamptz language sql immutable set search_path='' as $$
  select ((p_value at time zone 'Europe/Paris') + make_interval(days=>p_days)) at time zone 'Europe/Paris'
$$;

create or replace function public.shift_departure_litter_appointments(p_plan_id uuid,p_litter_id uuid,p_day_delta integer,p_reason text,p_client_command_id uuid)
returns table(outcome text,moved_count integer,reason text) language plpgsql security definer set search_path='' as $$
declare v_plan public.departure_plans%rowtype;v_user uuid:=auth.uid();v_role text;v_slot public.departure_slots%rowtype;v_count integer:=0;v_existing public.departure_commands%rowtype;v_hash text;begin
  select * into v_plan from public.departure_plans where id=p_plan_id for update;if not found then outcome:='not_eligible';reason:='plan_not_found';return next;return;end if;v_role:=public.departure_owner_admin_role(v_plan.organization_id);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('planId',p_plan_id,'litterId',p_litter_id,'dayDelta',p_day_delta,'reason',btrim(coalesce(p_reason,'')))::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type='collective_shift' and v_existing.target_id=p_plan_id and v_existing.payload_hash=v_hash then outcome:=v_existing.outcome;moved_count:=coalesce((v_existing.result->>'movedCount')::integer,0);return next;return;end if;outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;
  if p_day_delta=0 or abs(p_day_delta)>60 or length(btrim(coalesce(p_reason,'')))<3 then outcome:='not_eligible';reason:='invalid_shift';return next;return;end if;
  perform 1 from public.departure_slots slot where slot.plan_id=v_plan.id order by slot.id for update;
  if exists(select 1 from public.departure_slots affected join public.reservations reservation on reservation.organization_id=affected.organization_id and reservation.id=affected.reservation_id join public.departure_slots other on other.plan_id=affected.plan_id and other.id<>affected.id and other.status<>'cancelled' where affected.plan_id=v_plan.id and affected.status in('booked','to_review','late','no_show') and reservation.litter_id=p_litter_id and not exists(select 1 from public.reservations other_reservation where other_reservation.id=other.reservation_id and other_reservation.litter_id=p_litter_id) and tstzrange(public.departure_shift_paris_days(affected.starts_at,p_day_delta),public.departure_shift_paris_days(affected.starts_at,p_day_delta)+make_interval(mins=>affected.duration_minutes),'[)') && tstzrange(other.starts_at,other.starts_at+make_interval(mins=>other.duration_minutes),'[)')) then outcome:='conflict';reason:='shift_overlap';return next;return;end if;
  for v_slot in select slot.* from public.departure_slots slot join public.reservations reservation on reservation.organization_id=slot.organization_id and reservation.id=slot.reservation_id where slot.plan_id=v_plan.id and reservation.litter_id=p_litter_id and slot.status in('booked','to_review','late','no_show') order by slot.id for update of slot loop
    update public.departure_slots set starts_at=public.departure_shift_paris_days(v_slot.starts_at,p_day_delta),reason=btrim(p_reason),version=version+1,updated_at=now(),updated_by=v_user where id=v_slot.id returning * into v_slot;perform public.departure_write_calendar_projection(v_slot,v_user);v_count:=v_count+1;
  end loop;
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'collective_shift',v_plan.id,v_hash,'shifted',jsonb_build_object('litterId',p_litter_id,'dayDelta',p_day_delta,'movedCount',v_count),v_user);
  insert into public.departure_events(organization_id,plan_id,event_type,actor_kind,actor_profile_id,actor_role,details,client_command_id) values(v_plan.organization_id,v_plan.id,'collective_shift_confirmed','member',v_user,v_role,jsonb_build_object('litterId',p_litter_id,'dayDelta',p_day_delta,'movedCount',v_count,'reason',btrim(p_reason)),p_client_command_id);outcome:='shifted';moved_count:=v_count;return next;end;$$;

alter table public.events add column departure_slot_id uuid;
alter table public.events add constraint events_departure_slot_fk foreign key(organization_id,departure_slot_id) references public.departure_slots(organization_id,id) on delete restrict;
create unique index events_one_departure_projection_idx on public.events(organization_id,departure_slot_id) where departure_slot_id is not null and deleted_at is null;

create or replace function public.guard_departure_calendar_projection()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.departure_slot_id is null or current_setting('app.departure_calendar_projection',true)='on' then return old;end if;
    raise exception 'departure_projection_rpc_required' using errcode='42501';
  end if;
  if new.departure_slot_id is null then return new;end if;
  if current_setting('app.departure_calendar_projection',true)='on' then return new;end if;
  raise exception 'departure_projection_rpc_required' using errcode='42501';
end;$$;
create trigger events_departure_projection_guard before insert or update or delete on public.events for each row execute function public.guard_departure_calendar_projection();

revoke all on function public.departure_owner_admin_role(uuid),public.departure_assert_no_overlap(uuid,uuid,timestamptz,integer),public.departure_write_calendar_projection(public.departure_slots,uuid),public.departure_shift_paris_days(timestamptz,integer) from public,anon,authenticated,service_role;
revoke all on function public.create_departure_plan(text,integer,jsonb,uuid),public.upsert_departure_slot(uuid,uuid,timestamptz,integer,text,uuid,integer,uuid),public.publish_departure_plan(uuid,timestamptz,integer,uuid),public.assign_departure_slot(uuid,uuid,uuid),public.move_departure_appointment(uuid,timestamptz,integer,integer,text,uuid),public.mark_departure_appointment_status(uuid,text,text,uuid),public.shift_departure_litter_appointments(uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.create_departure_plan(text,integer,jsonb,uuid),public.upsert_departure_slot(uuid,uuid,timestamptz,integer,text,uuid,integer,uuid),public.publish_departure_plan(uuid,timestamptz,integer,uuid),public.assign_departure_slot(uuid,uuid,uuid),public.move_departure_appointment(uuid,timestamptz,integer,integer,text,uuid),public.mark_departure_appointment_status(uuid,text,text,uuid),public.shift_departure_litter_appointments(uuid,uuid,integer,text,uuid) to authenticated;
revoke all on function public.exchange_departure_public_token(text,text),public.read_departure_public_session(text),public.book_departure_public_session(text,uuid,uuid),public.decline_departure_public_session(text,uuid) from public,anon,authenticated;
grant execute on function public.exchange_departure_public_token(text,text),public.read_departure_public_session(text),public.book_departure_public_session(text,uuid,uuid),public.decline_departure_public_session(text,uuid) to service_role;

insert into public.email_templates(organization_id,template_key,title,category,subject,body,is_active)
select organization.id,source.template_key,source.title,'adopter_journey',source.subject,'Modèle transactionnel géré dans Brevo : prenom, portee, date_rendez_vous, duree_rendez_vous, date_limite, lien_rendez_vous, type_message.',true
from public.organizations organization
cross join (values
  ('departure_appointment_invitation','Invitation au rendez-vous de départ','Choisissez votre rendez-vous de départ'),
  ('departure_appointment_confirmation','Confirmation du rendez-vous de départ','Votre rendez-vous de départ est confirmé'),
  ('departure_response_reminder','Relance du choix du rendez-vous de départ','Choisissez votre rendez-vous avant la date limite'),
  ('departure_appointment_reminder','Rappel du rendez-vous de départ','Rappel de votre rendez-vous de départ'),
  ('departure_exceptional_confirmation','Confirmation du rendez-vous exceptionnel','Votre rendez-vous de départ est confirmé'),
  ('departure_move_confirmation','Déplacement du rendez-vous de départ','Votre rendez-vous de départ a été déplacé')
) source(template_key,title,subject)
where organization.deleted_at is null
on conflict(organization_id,template_key) do nothing;

commit;

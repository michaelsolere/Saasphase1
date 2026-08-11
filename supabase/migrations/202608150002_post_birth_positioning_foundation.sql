begin;

create table public.post_birth_capacity_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  litter_id uuid not null,
  male_total integer not null,
  female_total integer not null,
  male_preserved integer not null default 0,
  female_preserved integer not null default 0,
  male_uncertain integer not null default 0,
  female_uncertain integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  constraint post_birth_capacity_litter_fk foreign key (organization_id, litter_id)
    references public.litters(organization_id, id),
  constraint post_birth_capacity_litter_unique unique (organization_id, litter_id),
  constraint post_birth_capacity_numbers_check check (
    male_total >= 0 and female_total >= 0 and male_preserved >= 0 and female_preserved >= 0
    and male_uncertain >= 0 and female_uncertain >= 0
    and male_preserved + male_uncertain <= male_total
    and female_preserved + female_uncertain <= female_total
    and version > 0
  )
);

create table public.post_birth_capacity_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  capacity_state_id uuid not null references public.post_birth_capacity_states(id),
  litter_id uuid not null,
  version integer not null,
  male_total integer not null,
  female_total integer not null,
  male_preserved integer not null,
  female_preserved integer not null,
  male_uncertain integer not null,
  female_uncertain integer not null,
  reason text not null,
  actor_profile_id uuid not null references public.profiles(id),
  client_command_id uuid not null,
  created_at timestamptz not null default now(),
  constraint post_birth_capacity_revision_unique unique (organization_id, capacity_state_id, version),
  constraint post_birth_capacity_revision_command_unique unique (organization_id, client_command_id),
  constraint post_birth_capacity_revision_values_check check (
    version > 0 and length(btrim(reason)) >= 5
  )
);

create table public.post_birth_positioning_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  litter_group_id uuid not null,
  status text not null default 'open',
  version integer not null default 1,
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint post_birth_draft_group_fk foreign key (organization_id, litter_group_id)
    references public.litter_groups(organization_id, id),
  constraint post_birth_draft_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint post_birth_draft_version_check check (version > 0)
);

create unique index post_birth_one_open_draft_per_group
  on public.post_birth_positioning_drafts(organization_id, litter_group_id)
  where status = 'open';

create table public.post_birth_positioning_waves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  draft_id uuid not null references public.post_birth_positioning_drafts(id),
  litter_id uuid not null,
  wave_kind text not null default 'ordinary',
  status text not null default 'open',
  sequence_no integer not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  constraint post_birth_wave_litter_fk foreign key (organization_id, litter_id)
    references public.litters(organization_id, id),
  constraint post_birth_wave_kind_check check (wave_kind in ('ordinary', 'complementary')),
  constraint post_birth_wave_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint post_birth_wave_sequence_unique unique (organization_id, litter_id, sequence_no),
  constraint post_birth_wave_version_check check (version > 0)
);

create unique index post_birth_one_open_wave_kind_per_litter
  on public.post_birth_positioning_waves(organization_id, litter_id, wave_kind)
  where status = 'open';

create table public.post_birth_positioning_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  wave_id uuid not null references public.post_birth_positioning_waves(id),
  reservation_id uuid not null,
  proposed_sex text,
  proposed_outcome text not null default 'to_decide',
  blocker_code text,
  rank_snapshot integer not null,
  reservation_updated_at_snapshot timestamptz not null,
  capacity_version_snapshot integer not null,
  version integer not null default 1,
  stale_at timestamptz,
  stale_reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  constraint post_birth_line_reservation_fk foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id),
  constraint post_birth_line_wave_reservation_unique unique (organization_id, wave_id, reservation_id),
  constraint post_birth_line_sex_check check (proposed_sex is null or proposed_sex in ('male', 'female')),
  constraint post_birth_line_outcome_check check (proposed_outcome in ('to_decide', 'place', 'postponed', 'withdrawn', 'blocked')),
  constraint post_birth_line_place_check check (
    (proposed_outcome = 'place' and proposed_sex is not null and blocker_code is null)
    or proposed_outcome <> 'place'
  ),
  constraint post_birth_line_version_check check (version > 0)
);

create table public.post_birth_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reservation_id uuid not null,
  litter_id uuid not null,
  sex text not null,
  status text not null default 'confirmed',
  historical_rank integer not null,
  current_decision_id uuid,
  version integer not null default 1,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_birth_position_reservation_fk foreign key (organization_id, reservation_id)
    references public.reservations(organization_id, id),
  constraint post_birth_position_litter_fk foreign key (organization_id, litter_id)
    references public.litters(organization_id, id),
  constraint post_birth_position_one_current unique (organization_id, reservation_id),
  constraint post_birth_position_sex_check check (sex in ('male', 'female')),
  constraint post_birth_position_status_check check (status in ('confirmed', 'postponed', 'withdrawn', 'rectified')),
  constraint post_birth_position_rank_check check (historical_rank > 0 and version > 0)
);

create table public.post_birth_position_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  position_id uuid not null references public.post_birth_positions(id),
  reservation_id uuid not null,
  litter_id uuid not null,
  wave_id uuid references public.post_birth_positioning_waves(id),
  decision_type text not null,
  sex text,
  historical_rank integer not null,
  reason text,
  supersedes_decision_id uuid references public.post_birth_position_decisions(id),
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  client_command_id uuid not null,
  created_at timestamptz not null default now(),
  constraint post_birth_decision_command_unique unique (organization_id, client_command_id),
  constraint post_birth_decision_type_check check (decision_type in ('confirmed', 'rectified', 'postponed', 'withdrawn')),
  constraint post_birth_decision_sex_check check (sex is null or sex in ('male', 'female')),
  constraint post_birth_decision_actor_role_check check (actor_role in ('owner', 'admin')),
  constraint post_birth_decision_rank_check check (historical_rank > 0)
);

alter table public.post_birth_positions
  add constraint post_birth_position_current_decision_fk foreign key (current_decision_id)
  references public.post_birth_position_decisions(id);

create table public.post_birth_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  litter_id uuid not null,
  incident_type text not null,
  status text not null default 'open',
  sex text,
  capacity_version integer,
  summary text not null,
  details text not null,
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles(id),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution text,
  constraint post_birth_incident_litter_fk foreign key (organization_id, litter_id)
    references public.litters(organization_id, id),
  constraint post_birth_incident_type_check check (incident_type in ('death', 'capacity_reduction', 'positioning_error', 'other')),
  constraint post_birth_incident_status_check check (status in ('open', 'resolved')),
  constraint post_birth_incident_sex_check check (sex is null or sex in ('male', 'female')),
  constraint post_birth_incident_summary_check check (length(btrim(summary)) >= 5 and length(btrim(details)) >= 10)
);

create table public.post_birth_positioning_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_command_id uuid not null,
  command_type text not null,
  target_id uuid,
  result jsonb not null default '{}'::jsonb,
  event_ids uuid[] not null default '{}',
  actor_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint post_birth_command_unique unique (organization_id, client_command_id)
);

create table public.post_birth_positioning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  litter_group_id uuid,
  litter_id uuid,
  reservation_id uuid,
  wave_id uuid,
  incident_id uuid,
  event_type text not null,
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint post_birth_event_actor_role_check check (actor_role in ('owner', 'admin')),
  constraint post_birth_event_command_unique unique (organization_id, client_command_id)
);

create or replace function public.guard_post_birth_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.qa_hard_delete', true) = 'on' then return old; end if;
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger post_birth_capacity_revisions_immutable before update or delete on public.post_birth_capacity_revisions for each row execute function public.guard_post_birth_append_only();
create trigger post_birth_decisions_immutable before update or delete on public.post_birth_position_decisions for each row execute function public.guard_post_birth_append_only();
create trigger post_birth_events_immutable before update or delete on public.post_birth_positioning_events for each row execute function public.guard_post_birth_append_only();

alter table public.post_birth_capacity_states enable row level security;
alter table public.post_birth_capacity_revisions enable row level security;
alter table public.post_birth_positioning_drafts enable row level security;
alter table public.post_birth_positioning_waves enable row level security;
alter table public.post_birth_positioning_lines enable row level security;
alter table public.post_birth_positions enable row level security;
alter table public.post_birth_position_decisions enable row level security;
alter table public.post_birth_incidents enable row level security;
alter table public.post_birth_positioning_commands enable row level security;
alter table public.post_birth_positioning_events enable row level security;

create or replace function public.is_active_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships membership
    where membership.organization_id = p_organization_id and membership.profile_id = auth.uid()
      and membership.status = 'active' and membership.deleted_at is null)
$$;

create policy post_birth_capacity_select on public.post_birth_capacity_states for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_capacity_revision_select on public.post_birth_capacity_revisions for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_draft_select on public.post_birth_positioning_drafts for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_wave_select on public.post_birth_positioning_waves for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_line_select on public.post_birth_positioning_lines for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_position_select on public.post_birth_positions for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_decision_select on public.post_birth_position_decisions for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_incident_select on public.post_birth_incidents for select to authenticated using (public.is_active_organization_member(organization_id));
create policy post_birth_event_select on public.post_birth_positioning_events for select to authenticated using (public.is_active_organization_member(organization_id));

revoke insert, update, delete on public.post_birth_capacity_states, public.post_birth_capacity_revisions,
  public.post_birth_positioning_drafts, public.post_birth_positioning_waves,
  public.post_birth_positioning_lines, public.post_birth_positions,
  public.post_birth_position_decisions, public.post_birth_incidents,
  public.post_birth_positioning_commands, public.post_birth_positioning_events
  from anon, authenticated;
grant select on public.post_birth_capacity_states, public.post_birth_capacity_revisions,
  public.post_birth_positioning_drafts, public.post_birth_positioning_waves,
  public.post_birth_positioning_lines, public.post_birth_positions,
  public.post_birth_position_decisions, public.post_birth_incidents,
  public.post_birth_positioning_events to authenticated;

create or replace function public.post_birth_owner_admin_role(p_organization_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select membership.role into v_role from public.memberships membership
  where membership.organization_id = p_organization_id and membership.profile_id = auth.uid()
    and membership.status = 'active' and membership.deleted_at is null;
  if v_role not in ('owner', 'admin') then raise exception 'owner_admin_required'; end if;
  return v_role;
end;
$$;
revoke all on function public.post_birth_owner_admin_role(uuid) from public, anon, authenticated;

create or replace function public.open_post_birth_positioning_draft(
  p_litter_group_id uuid,
  p_exception_reason text,
  p_client_command_id uuid
)
returns table (outcome text, draft_id uuid, version integer, reason text)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_group public.litter_groups%rowtype; v_existing public.post_birth_positioning_drafts%rowtype; v_role text; v_event uuid; v_closed integer; v_born integer;
begin
  draft_id := null; version := null; reason := null;
  if v_user is null then outcome := 'not_eligible'; reason := 'not_authenticated'; return next; return; end if;
  select * into v_group from public.litter_groups where id = p_litter_group_id and deleted_at is null for update;
  if not found then outcome := 'not_eligible'; reason := 'group_not_found'; return next; return; end if;
  v_role := public.post_birth_owner_admin_role(v_group.organization_id);
  select command.result->>'outcome', (command.result->>'draftId')::uuid, (command.result->>'version')::integer
    into outcome, draft_id, version from public.post_birth_positioning_commands command
    where command.organization_id = v_group.organization_id and command.client_command_id = p_client_command_id;
  if found then outcome := 'already_applied'; return next; return; end if;
  select count(*) filter (where session.status = 'closed'), count(*) filter (where litter.actual_birth_date is not null and coalesce(litter.alive_count, 0) > 0)
    into v_closed, v_born from public.litters litter left join public.whelping_sessions session
      on session.organization_id = litter.organization_id and session.litter_id = litter.id
    where litter.organization_id = v_group.organization_id and litter.litter_group_id = v_group.id and litter.deleted_at is null;
  if v_born < 1 then outcome := 'not_eligible'; reason := 'active_birth_required'; return next; return; end if;
  if v_closed < 1 and length(btrim(coalesce(p_exception_reason, ''))) < 10 then outcome := 'not_eligible'; reason := 'whelping_closure_or_exception_required'; return next; return; end if;
  select * into v_existing from public.post_birth_positioning_drafts draft
    where draft.organization_id = v_group.organization_id and draft.litter_group_id = v_group.id and draft.status = 'open' for update;
  if found then outcome := 'already_open'; draft_id := v_existing.id; version := v_existing.version; return next; return; end if;
  insert into public.post_birth_positioning_drafts(organization_id,litter_group_id,opened_by)
    values(v_group.organization_id,v_group.id,v_user) returning * into v_existing;
  insert into public.post_birth_positioning_events(organization_id,litter_group_id,event_type,actor_profile_id,actor_role,reason,client_command_id)
    values(v_group.organization_id,v_group.id,'post_birth_draft_opened',v_user,v_role,nullif(btrim(coalesce(p_exception_reason,'')),''),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_group.organization_id,p_client_command_id,'open_draft',v_existing.id,jsonb_build_object('outcome','created','draftId',v_existing.id,'version',v_existing.version),array[v_event],v_user);
  outcome := 'created'; draft_id := v_existing.id; version := v_existing.version; return next;
end;
$$;

create or replace function public.publish_post_birth_capacity(
  p_litter_id uuid,
  p_expected_version integer,
  p_male_preserved integer,
  p_female_preserved integer,
  p_male_uncertain integer,
  p_female_uncertain integer,
  p_reason text,
  p_client_command_id uuid
)
returns table (outcome text, capacity_id uuid, version integer, incident_id uuid, reason text)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_litter public.litters%rowtype; v_state public.post_birth_capacity_states%rowtype; v_role text; v_revision uuid; v_event uuid; v_male_committed integer; v_female_committed integer; v_incident uuid; v_command public.post_birth_positioning_commands%rowtype;
begin
  capacity_id := null; version := null; incident_id := null; reason := null;
  if v_user is null then outcome := 'not_eligible'; reason := 'not_authenticated'; return next; return; end if;
  select * into v_litter from public.litters where id = p_litter_id and deleted_at is null for update;
  if not found then outcome := 'not_eligible'; reason := 'litter_not_found'; return next; return; end if;
  v_role := public.post_birth_owner_admin_role(v_litter.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_litter.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';capacity_id:=(v_command.result->>'capacityId')::uuid;version:=(v_command.result->>'version')::integer;incident_id:=nullif(v_command.result->>'incidentId','')::uuid;return next;return;end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then outcome := 'not_eligible'; reason := 'reason_required'; return next; return; end if;
  if v_litter.actual_birth_date is null or coalesce(v_litter.alive_count,0) < 1 then outcome := 'not_eligible'; reason := 'active_birth_required'; return next; return; end if;
  select * into v_state from public.post_birth_capacity_states state where state.organization_id=v_litter.organization_id and state.litter_id=v_litter.id for update;
  if found and v_state.version <> p_expected_version then outcome := 'conflict'; capacity_id := v_state.id; version := v_state.version; reason := 'version_conflict'; return next; return; end if;
  if not found and p_expected_version <> 0 then outcome := 'conflict'; reason := 'version_conflict'; return next; return; end if;
  if least(p_male_preserved,p_female_preserved,p_male_uncertain,p_female_uncertain) < 0
    or p_male_preserved+p_male_uncertain > coalesce(v_litter.born_male_count,0)
    or p_female_preserved+p_female_uncertain > coalesce(v_litter.born_female_count,0)
  then outcome := 'not_eligible'; reason := 'capacity_invalid'; return next; return; end if;
  select count(*) filter(where sex='male'), count(*) filter(where sex='female') into v_male_committed,v_female_committed
    from public.post_birth_positions position_row where position_row.organization_id=v_litter.organization_id and position_row.litter_id=v_litter.id and position_row.status='confirmed';
  if coalesce(v_litter.born_male_count,0)-p_male_preserved-p_male_uncertain < v_male_committed
    or coalesce(v_litter.born_female_count,0)-p_female_preserved-p_female_uncertain < v_female_committed then
    insert into public.post_birth_incidents(organization_id,litter_id,incident_type,sex,capacity_version,summary,details,opened_by)
      values(v_litter.organization_id,v_litter.id,'capacity_reduction',
        case when coalesce(v_litter.born_male_count,0)-p_male_preserved-p_male_uncertain < v_male_committed then 'male' else 'female' end,
        coalesce(v_state.version,0)+1,'Capacité réduite sous les places confirmées',btrim(p_reason),v_user) returning id into v_incident;
  end if;
  if v_state.id is null then
    insert into public.post_birth_capacity_states(organization_id,litter_id,male_total,female_total,male_preserved,female_preserved,male_uncertain,female_uncertain,version,updated_by)
      values(v_litter.organization_id,v_litter.id,coalesce(v_litter.born_male_count,0),coalesce(v_litter.born_female_count,0),p_male_preserved,p_female_preserved,p_male_uncertain,p_female_uncertain,1,v_user) returning * into v_state;
  else
    update public.post_birth_capacity_states state set male_total=coalesce(v_litter.born_male_count,0),female_total=coalesce(v_litter.born_female_count,0),male_preserved=p_male_preserved,female_preserved=p_female_preserved,male_uncertain=p_male_uncertain,female_uncertain=p_female_uncertain,version=state.version+1,updated_at=clock_timestamp(),updated_by=v_user
      where state.id=v_state.id returning * into v_state;
  end if;
  insert into public.post_birth_capacity_revisions(organization_id,capacity_state_id,litter_id,version,male_total,female_total,male_preserved,female_preserved,male_uncertain,female_uncertain,reason,actor_profile_id,client_command_id)
    values(v_state.organization_id,v_state.id,v_state.litter_id,v_state.version,v_state.male_total,v_state.female_total,v_state.male_preserved,v_state.female_preserved,v_state.male_uncertain,v_state.female_uncertain,btrim(p_reason),v_user,p_client_command_id) returning id into v_revision;
  insert into public.post_birth_positioning_events(organization_id,litter_id,incident_id,event_type,actor_profile_id,actor_role,reason,details,client_command_id)
    values(v_state.organization_id,v_state.litter_id,v_incident,'post_birth_capacity_published',v_user,v_role,btrim(p_reason),jsonb_build_object('version',v_state.version,'revisionId',v_revision),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_state.organization_id,p_client_command_id,'publish_capacity',v_state.id,jsonb_build_object('outcome','updated','capacityId',v_state.id,'version',v_state.version,'incidentId',v_incident),array[v_event],v_user);
  outcome := 'updated'; capacity_id := v_state.id; version := v_state.version; incident_id := v_incident; return next;
end;
$$;

create or replace function public.open_post_birth_wave(
  p_draft_id uuid, p_litter_id uuid, p_wave_kind text, p_expected_draft_version integer, p_client_command_id uuid
)
returns table(outcome text,wave_id uuid,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_draft public.post_birth_positioning_drafts%rowtype; v_litter public.litters%rowtype; v_wave public.post_birth_positioning_waves%rowtype; v_role text; v_sequence integer; v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  wave_id:=null; version:=null; reason:=null;
  select * into v_draft from public.post_birth_positioning_drafts where id=p_draft_id for update;
  if not found then outcome:='not_eligible';reason:='draft_not_found';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_draft.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_draft.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';wave_id:=(v_command.result->>'waveId')::uuid;version:=(v_command.result->>'version')::integer;return next;return;end if;
  if v_draft.status<>'open' then outcome:='not_eligible';reason:='draft_not_open';return next;return;end if;
  if v_draft.version<>p_expected_draft_version then outcome:='conflict';version:=v_draft.version;reason:='version_conflict';return next;return;end if;
  if p_wave_kind not in('ordinary','complementary') then outcome:='not_eligible';reason:='wave_kind_invalid';return next;return;end if;
  select * into v_litter from public.litters where organization_id=v_draft.organization_id and id=p_litter_id and litter_group_id=v_draft.litter_group_id and deleted_at is null;
  if not found then outcome:='not_eligible';reason:='litter_scope_mismatch';return next;return;end if;
  select * into v_wave from public.post_birth_positioning_waves where organization_id=v_draft.organization_id and litter_id=p_litter_id and wave_kind=p_wave_kind and status='open' for update;
  if found then outcome:='already_open';wave_id:=v_wave.id;version:=v_wave.version;return next;return;end if;
  select coalesce(max(sequence_no),0)+1 into v_sequence from public.post_birth_positioning_waves where organization_id=v_draft.organization_id and litter_id=p_litter_id;
  insert into public.post_birth_positioning_waves(organization_id,draft_id,litter_id,wave_kind,sequence_no,created_by)
    values(v_draft.organization_id,v_draft.id,p_litter_id,p_wave_kind,v_sequence,v_user) returning * into v_wave;
  update public.post_birth_positioning_drafts as draft_row set version=draft_row.version+1,updated_at=clock_timestamp() where draft_row.id=v_draft.id;
  insert into public.post_birth_positioning_events(organization_id,litter_group_id,litter_id,wave_id,event_type,actor_profile_id,actor_role,client_command_id)
    values(v_draft.organization_id,v_draft.litter_group_id,p_litter_id,v_wave.id,'post_birth_wave_opened',v_user,v_role,p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_draft.organization_id,p_client_command_id,'open_wave',v_wave.id,jsonb_build_object('outcome','created','waveId',v_wave.id,'version',v_wave.version),array[v_event],v_user);
  outcome:='created';wave_id:=v_wave.id;version:=v_wave.version;return next;
end;
$$;

create or replace function public.upsert_post_birth_proposal(
  p_wave_id uuid,p_reservation_id uuid,p_proposed_sex text,p_proposed_outcome text,p_blocker_code text,p_expected_wave_version integer,p_client_command_id uuid
)
returns table(outcome text,line_id uuid,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_wave public.post_birth_positioning_waves%rowtype;v_res public.reservations%rowtype;v_capacity public.post_birth_capacity_states%rowtype;v_line public.post_birth_positioning_lines%rowtype;v_role text;v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  line_id:=null;version:=null;reason:=null;
  select * into v_wave from public.post_birth_positioning_waves where id=p_wave_id for update;
  if not found then outcome:='not_eligible';reason:='wave_not_found';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_wave.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_wave.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';line_id:=(v_command.result->>'lineId')::uuid;version:=(v_command.result->>'version')::integer;return next;return;end if;
  if v_wave.version<>p_expected_wave_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
  select * into v_res from public.reservations where organization_id=v_wave.organization_id and id=p_reservation_id and deleted_at is null for update;
  if not found or (
    v_res.litter_id is distinct from v_wave.litter_id
    and not (
      v_res.litter_id is null
      and exists(select 1 from public.litters litter where litter.id=v_wave.litter_id and litter.litter_group_id=v_res.litter_group_id)
    )
  ) then outcome:='not_eligible';reason:='reservation_scope_mismatch';return next;return;end if;
  if v_wave.wave_kind='complementary' and not exists(select 1 from public.applications a where a.id=v_res.application_id and a.rank_payment_late) then outcome:='not_eligible';reason:='late_payment_required';return next;return;end if;
  if v_wave.wave_kind='ordinary' and exists(select 1 from public.applications a where a.id=v_res.application_id and a.rank_payment_late) then outcome:='not_eligible';reason:='complementary_wave_required';return next;return;end if;
  select * into v_capacity from public.post_birth_capacity_states where organization_id=v_wave.organization_id and litter_id=v_wave.litter_id;
  if not found then outcome:='not_eligible';reason:='capacity_required';return next;return;end if;
  if p_proposed_outcome not in('to_decide','place','postponed','withdrawn','blocked') or (p_proposed_outcome='place' and p_proposed_sex not in('male','female')) then outcome:='not_eligible';reason:='proposal_invalid';return next;return;end if;
  insert into public.post_birth_positioning_lines(organization_id,wave_id,reservation_id,proposed_sex,proposed_outcome,blocker_code,rank_snapshot,reservation_updated_at_snapshot,capacity_version_snapshot,updated_by)
    values(v_wave.organization_id,v_wave.id,v_res.id,p_proposed_sex,p_proposed_outcome,p_blocker_code,coalesce(v_res.rank_active,v_res.rank_initial),v_res.updated_at,v_capacity.version,v_user)
    on conflict(organization_id,wave_id,reservation_id) do update set proposed_sex=excluded.proposed_sex,proposed_outcome=excluded.proposed_outcome,blocker_code=excluded.blocker_code,rank_snapshot=excluded.rank_snapshot,reservation_updated_at_snapshot=excluded.reservation_updated_at_snapshot,capacity_version_snapshot=excluded.capacity_version_snapshot,version=post_birth_positioning_lines.version+1,stale_at=null,stale_reason=null,updated_at=clock_timestamp(),updated_by=v_user returning * into v_line;
  update public.post_birth_positioning_waves as wave_row set version=wave_row.version+1 where wave_row.id=v_wave.id returning wave_row.version into version;
  insert into public.post_birth_positioning_events(organization_id,litter_id,reservation_id,wave_id,event_type,actor_profile_id,actor_role,details,client_command_id)
    values(v_wave.organization_id,v_wave.litter_id,v_res.id,v_wave.id,'post_birth_proposal_updated',v_user,v_role,jsonb_build_object('lineId',v_line.id,'outcome',p_proposed_outcome,'sex',p_proposed_sex),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_wave.organization_id,p_client_command_id,'upsert_proposal',v_line.id,jsonb_build_object('outcome','updated','lineId',v_line.id,'version',version),array[v_event],v_user);
  outcome:='updated';line_id:=v_line.id;return next;
end;
$$;

create or replace function public.confirm_post_birth_places(
  p_wave_id uuid,p_line_ids uuid[],p_expected_wave_version integer,p_client_command_id uuid
)
returns table(outcome text,confirmed_ids uuid[],version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_wave public.post_birth_positioning_waves%rowtype;v_capacity public.post_birth_capacity_states%rowtype;v_role text;v_line public.post_birth_positioning_lines%rowtype;v_position public.post_birth_positions%rowtype;v_decision uuid;v_events uuid[]:='{}';v_confirmed uuid[]:='{}';v_male integer;v_female integer;v_available_male integer;v_available_female integer;v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  confirmed_ids:='{}';version:=null;reason:=null;
  select * into v_wave from public.post_birth_positioning_waves where id=p_wave_id for update;
  if not found then outcome:='not_eligible';reason:='wave_not_found';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_wave.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_wave.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';confirmed_ids:=array(select jsonb_array_elements_text(v_command.result->'confirmedIds')::uuid);version:=(v_command.result->>'version')::integer;return next;return;end if;
  if v_wave.version<>p_expected_wave_version then outcome:='conflict';version:=v_wave.version;reason:='version_conflict';return next;return;end if;
  if coalesce(array_length(p_line_ids,1),0)=0 then outcome:='not_eligible';reason:='selection_required';return next;return;end if;
  select * into v_capacity from public.post_birth_capacity_states where organization_id=v_wave.organization_id and litter_id=v_wave.litter_id for update;
  select count(*) filter(where sex='male'),count(*) filter(where sex='female') into v_male,v_female from public.post_birth_positions where organization_id=v_wave.organization_id and litter_id=v_wave.litter_id and status='confirmed';
  v_available_male:=v_capacity.male_total-v_capacity.male_preserved-v_capacity.male_uncertain-v_male;
  v_available_female:=v_capacity.female_total-v_capacity.female_preserved-v_capacity.female_uncertain-v_female;
  for v_line in select * from public.post_birth_positioning_lines line where line.organization_id=v_wave.organization_id and line.wave_id=v_wave.id and line.id=any(p_line_ids) order by line.rank_snapshot,line.id for update loop
    if v_line.proposed_outcome<>'place' or v_line.blocker_code is not null or v_line.stale_at is not null then raise exception 'selected_line_not_ready:%',v_line.id;end if;
    if not exists(select 1 from public.reservations r where r.id=v_line.reservation_id and r.updated_at=v_line.reservation_updated_at_snapshot and r.deleted_at is null) or v_capacity.version<>v_line.capacity_version_snapshot then raise exception 'selected_line_stale:%',v_line.id;end if;
    if v_line.proposed_sex='male' then if v_available_male<1 then raise exception 'male_capacity_exhausted';end if;v_available_male:=v_available_male-1;else if v_available_female<1 then raise exception 'female_capacity_exhausted';end if;v_available_female:=v_available_female-1;end if;
    insert into public.post_birth_positions(organization_id,reservation_id,litter_id,sex,historical_rank)
      values(v_wave.organization_id,v_line.reservation_id,v_wave.litter_id,v_line.proposed_sex,v_line.rank_snapshot) returning * into v_position;
    insert into public.post_birth_position_decisions(organization_id,position_id,reservation_id,litter_id,wave_id,decision_type,sex,historical_rank,actor_profile_id,actor_role,client_command_id)
      values(v_wave.organization_id,v_position.id,v_line.reservation_id,v_wave.litter_id,v_wave.id,'confirmed',v_line.proposed_sex,v_line.rank_snapshot,v_user,v_role,gen_random_uuid()) returning id into v_decision;
    update public.post_birth_positions set current_decision_id=v_decision where id=v_position.id;
    update public.reservations set litter_id=v_wave.litter_id,status='confirmed_after_birth',updated_at=clock_timestamp(),updated_by=v_user where id=v_line.reservation_id;
    insert into public.post_birth_positioning_events(organization_id,litter_id,reservation_id,wave_id,event_type,actor_profile_id,actor_role,details,client_command_id)
      values(v_wave.organization_id,v_wave.litter_id,v_line.reservation_id,v_wave.id,'post_birth_place_confirmed',v_user,v_role,jsonb_build_object('positionId',v_position.id,'sex',v_line.proposed_sex,'rank',v_line.rank_snapshot),gen_random_uuid()) returning id into v_event;
    v_events:=array_append(v_events,v_event);v_confirmed:=array_append(v_confirmed,v_line.reservation_id);
  end loop;
  if cardinality(v_confirmed)<>cardinality(p_line_ids) then raise exception 'selected_line_missing';end if;
  update public.post_birth_positioning_waves as wave_row set version=wave_row.version+1 where wave_row.id=v_wave.id returning wave_row.version into version;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_wave.organization_id,p_client_command_id,'confirm_places',v_wave.id,jsonb_build_object('outcome','updated','confirmedIds',to_jsonb(v_confirmed),'version',version),v_events,v_user);
  outcome:='updated';confirmed_ids:=v_confirmed;return next;
end;
$$;

create or replace function public.open_post_birth_incident(
  p_litter_id uuid,p_incident_type text,p_sex text,p_summary text,p_details text,p_client_command_id uuid
)
returns table(outcome text,incident_id uuid,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_litter public.litters%rowtype;v_role text;v_event uuid;v_command public.post_birth_positioning_commands%rowtype;
begin
  incident_id:=null;reason:=null;select * into v_litter from public.litters where id=p_litter_id and deleted_at is null;
  if not found then outcome:='not_eligible';reason:='litter_not_found';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_litter.organization_id);
  select * into v_command from public.post_birth_positioning_commands where organization_id=v_litter.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';incident_id:=v_command.target_id;return next;return;end if;
  if p_incident_type not in('death','capacity_reduction','positioning_error','other') or length(btrim(coalesce(p_summary,'')))<5 or length(btrim(coalesce(p_details,'')))<10 then outcome:='not_eligible';reason:='incident_invalid';return next;return;end if;
  insert into public.post_birth_incidents(organization_id,litter_id,incident_type,sex,summary,details,opened_by)
    values(v_litter.organization_id,v_litter.id,p_incident_type,p_sex,btrim(p_summary),btrim(p_details),v_user) returning id into incident_id;
  insert into public.post_birth_positioning_events(organization_id,litter_id,incident_id,event_type,actor_profile_id,actor_role,reason,client_command_id)
    values(v_litter.organization_id,v_litter.id,incident_id,'post_birth_incident_opened',v_user,v_role,btrim(p_details),p_client_command_id) returning id into v_event;
  insert into public.post_birth_positioning_commands(organization_id,client_command_id,command_type,target_id,result,event_ids,actor_profile_id)
    values(v_litter.organization_id,p_client_command_id,'open_incident',incident_id,jsonb_build_object('outcome','created','incidentId',incident_id),array[v_event],v_user);
  outcome:='created';return next;
end;
$$;

revoke all on function public.open_post_birth_positioning_draft(uuid,text,uuid) from public,anon;
revoke all on function public.publish_post_birth_capacity(uuid,integer,integer,integer,integer,integer,text,uuid) from public,anon;
revoke all on function public.open_post_birth_wave(uuid,uuid,text,integer,uuid) from public,anon;
revoke all on function public.upsert_post_birth_proposal(uuid,uuid,text,text,text,integer,uuid) from public,anon;
revoke all on function public.confirm_post_birth_places(uuid,uuid[],integer,uuid) from public,anon;
revoke all on function public.open_post_birth_incident(uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.open_post_birth_positioning_draft(uuid,text,uuid) to authenticated;
grant execute on function public.publish_post_birth_capacity(uuid,integer,integer,integer,integer,integer,text,uuid) to authenticated;
grant execute on function public.open_post_birth_wave(uuid,uuid,text,integer,uuid) to authenticated;
grant execute on function public.upsert_post_birth_proposal(uuid,uuid,text,text,text,integer,uuid) to authenticated;
grant execute on function public.confirm_post_birth_places(uuid,uuid[],integer,uuid) to authenticated;
grant execute on function public.open_post_birth_incident(uuid,text,text,text,text,uuid) to authenticated;

commit;

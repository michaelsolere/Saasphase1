-- Audited, idempotent correction and cancellation of journal births.

alter table public.whelping_births
  add column revision_no integer not null default 0,
  add column occurred_at timestamptz,
  add column note text,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text;

update public.whelping_births birth
set occurred_at = event.occurred_at,
    note = nullif(btrim(event.note), '')
from public.whelping_events event
where event.organization_id = birth.organization_id
  and event.id = birth.event_id
  and event.event_type = 'birth';

set constraints all immediate;

alter table public.whelping_births
  alter column occurred_at set not null,
  add constraint whelping_births_revision_nonnegative_check
    check (revision_no >= 0),
  add constraint whelping_births_occurred_at_finite_check
    check (pg_catalog.isfinite(occurred_at)),
  add constraint whelping_births_note_check
    check (note is null or (
      note = btrim(note) and char_length(note) between 1 and 5000
    )),
  add constraint whelping_births_cancellation_values_check
    check (
      (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
      or (
        cancelled_at is not null and pg_catalog.isfinite(cancelled_at)
        and cancelled_by is not null
        and cancellation_reason is not null
        and cancellation_reason = btrim(cancellation_reason)
        and char_length(cancellation_reason) between 1 and 500
      )
    ),
  add constraint whelping_births_cancelled_by_membership_fk
    foreign key (organization_id, cancelled_by)
    references public.memberships (organization_id, profile_id)
    on delete restrict;

alter table public.whelping_births
  drop constraint whelping_births_session_order_key;

create unique index whelping_births_active_session_order_key
  on public.whelping_births (organization_id, session_id, birth_order)
  where cancelled_at is null;

alter table public.whelping_events
  drop constraint whelping_events_type_check,
  add constraint whelping_events_type_check check (event_type in (
    'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
    'vet_called', 'intervention', 'observation', 'birth', 'session_closed',
    'session_reopened', 'birth_corrected', 'birth_cancelled'
  ));

create or replace function public.prevent_direct_whelping_birth_adjustment_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.event_type in ('birth_corrected','birth_cancelled')
    and current_setting('app.whelping_birth_adjustment_rpc', true) is distinct from 'on' then
    raise exception 'birth adjustment events are created exclusively by dedicated RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger whelping_events_guard_birth_adjustments
before insert on public.whelping_events
for each row execute function public.prevent_direct_whelping_birth_adjustment_event_insert();

alter table public.animal_weight_measurements
  drop constraint animal_weight_measurements_cancellation_values_check,
  add constraint animal_weight_measurements_cancellation_values_check check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (
      cancelled_at is not null and pg_catalog.isfinite(cancelled_at)
      and cancelled_by is not null
      and cancellation_reason is not null
      and cancellation_reason = btrim(cancellation_reason)
      and char_length(cancellation_reason) between 1 and 500
      and measurement_kind in ('routine', 'birth')
    )
  );

create table public.whelping_birth_adjustment_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  command_type text not null check (command_type in ('correct_birth', 'cancel_birth')),
  litter_id uuid not null,
  session_id uuid not null,
  birth_id uuid not null,
  animal_id uuid not null,
  event_id uuid not null,
  weight_measurement_id uuid,
  expected_revision_no integer not null check (expected_revision_no >= 0),
  previous_revision_no integer not null check (previous_revision_no >= 0),
  resulting_revision_no integer not null check (resulting_revision_no = previous_revision_no + 1),
  reason text not null check (reason = btrim(reason) and char_length(reason) between 1 and 500),
  requested_occurred_at timestamptz,
  requested_sex text,
  requested_viability text,
  requested_initial_collar_color text,
  requested_birth_note text,
  requested_weight_grams integer,
  requested_weight_measured_at timestamptz,
  requested_weight_note text,
  requested_cancelled_at timestamptz,
  snapshot_before jsonb not null,
  snapshot_after jsonb not null,
  event_sequence_no integer not null check (event_sequence_no > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint whelping_birth_adjustment_commands_org_command_key
    unique (organization_id, client_command_id),
  constraint whelping_birth_adjustment_commands_litter_fk
    foreign key (organization_id, litter_id)
    references public.litters(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_session_fk
    foreign key (organization_id, session_id)
    references public.whelping_sessions(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_birth_fk
    foreign key (organization_id, birth_id)
    references public.whelping_births(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_animal_fk
    foreign key (organization_id, animal_id)
    references public.animals(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_event_fk
    foreign key (organization_id, event_id)
    references public.whelping_events(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_weight_fk
    foreign key (organization_id, weight_measurement_id)
    references public.animal_weight_measurements(organization_id, id) on delete restrict,
  constraint whelping_birth_adjustment_commands_typed_check check (
    (command_type = 'correct_birth'
      and requested_occurred_at is not null
      and requested_sex in ('male', 'female', 'unknown')
      and requested_viability in ('alive', 'stillborn', 'unknown')
      and requested_cancelled_at is null)
    or
    (command_type = 'cancel_birth'
      and requested_occurred_at is null
      and requested_sex is null
      and requested_viability is null
      and requested_initial_collar_color is null
      and requested_birth_note is null
      and requested_weight_grams is null
      and requested_weight_measured_at is null
      and requested_weight_note is null
      and requested_cancelled_at is not null
      and pg_catalog.isfinite(requested_cancelled_at))
  )
);

alter table public.whelping_birth_adjustment_commands enable row level security;
revoke all on table public.whelping_birth_adjustment_commands from public, anon, authenticated;

create or replace function public.prevent_whelping_birth_adjustment_command_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null and current_setting('app.fixture_cleanup', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
  end if;
  raise exception 'whelping birth adjustment commands are append-only'
    using errcode = '55000';
end;
$$;

create trigger whelping_birth_adjustment_commands_append_only
before update or delete on public.whelping_birth_adjustment_commands
for each row execute function public.prevent_whelping_birth_adjustment_command_mutation();

create or replace function public.initialize_whelping_birth_effective_state()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_event public.whelping_events%rowtype;
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on' then
    raise exception 'whelping births can only be created by the dedicated RPC'
      using errcode = '55000';
  end if;
  select event.* into strict v_event
  from public.whelping_events event
  where event.organization_id = new.organization_id and event.id = new.event_id;
  new.occurred_at := v_event.occurred_at;
  new.note := nullif(btrim(v_event.note), '');
  return new;
end;
$$;

create trigger whelping_births_initialize_effective_state
before insert on public.whelping_births
for each row execute function public.initialize_whelping_birth_effective_state();

create or replace function public.prevent_whelping_birth_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'recorded whelping births cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.whelping_birth_adjustment_rpc', true) is distinct from 'on'
    or new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.session_id is distinct from old.session_id
    or new.event_id is distinct from old.event_id
    or new.animal_id is distinct from old.animal_id
    or new.birth_order is distinct from old.birth_order
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.revision_no is distinct from old.revision_no + 1 then
    raise exception 'recorded whelping birth adjustment is invalid' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_animal_weight_measurement_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_routine_operation text := current_setting('app.litter_weight_adjustment_operation', true);
  v_birth_operation text := current_setting('app.whelping_birth_adjustment_operation', true);
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'animal weight measurements cannot be deleted' using errcode = '55000';
  end if;
  if current_setting('app.whelping_birth_adjustment_rpc', true) = 'on'
    and old.measurement_kind = 'birth'
    and v_birth_operation in ('correct_birth', 'cancel_birth') then
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.animal_id is distinct from old.animal_id
      or new.measurement_kind is distinct from old.measurement_kind
      or new.source_birth_id is distinct from old.source_birth_id
      or new.litter_weighing_session_id is distinct from old.litter_weighing_session_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
      or new.revision_no is distinct from old.revision_no + 1 then
      raise exception 'birth weight adjustment is invalid' using errcode = '55000';
    end if;
    return new;
  end if;
  if current_setting('app.litter_weight_adjustment_rpc', true) is distinct from 'on'
    or v_routine_operation not in ('correct_measurement', 'cancel_measurement', 'cancel_session')
    or old.measurement_kind <> 'routine'
    or new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.animal_id is distinct from old.animal_id
    or new.litter_weighing_session_id is distinct from old.litter_weighing_session_id
    or new.measurement_kind is distinct from old.measurement_kind
    or new.source_birth_id is distinct from old.source_birth_id
    or new.measured_at is distinct from old.measured_at
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.revision_no is distinct from old.revision_no + 1 then
    raise exception 'animal weight measurements are immutable' using errcode = '55000';
  end if;
  if v_routine_operation = 'correct_measurement' then
    if old.cancelled_at is not null
      or new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
      or (new.grams is not distinct from old.grams and new.note is not distinct from old.note) then
      raise exception 'routine weight correction is invalid' using errcode = '55000';
    end if;
  elsif old.cancelled_at is not null
    or new.cancelled_at is null or new.cancelled_by is null or new.cancellation_reason is null
    or new.grams is distinct from old.grams or new.note is distinct from old.note then
    raise exception 'routine weight cancellation is invalid' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_animal_weight_measurement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on'
    and current_setting('app.whelping_birth_weight_rpc', true) is distinct from 'on'
    and not (
      current_setting('app.whelping_birth_adjustment_rpc', true) = 'on'
      and current_setting('app.whelping_birth_adjustment_operation', true) = 'correct_birth'
      and new.measurement_kind = 'birth'
      and new.source_birth_id is not null
    ) then
    raise exception 'animal weight measurements are inserted exclusively by dedicated commands'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.protect_whelping_birth_animal_projections()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not exists (select 1 from public.whelping_births b where b.organization_id=old.organization_id and b.animal_id=old.id) then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.litter_id is distinct from old.litter_id
    or new.mother_id is distinct from old.mother_id
    or new.father_id is distinct from old.father_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.birth_order is distinct from old.birth_order
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'journal birth structural projections are immutable' using errcode='55000';
  end if;
  if current_setting('app.whelping_birth_adjustment_rpc', true) = 'on' then
    return new;
  end if;
  if new.sex is distinct from old.sex
    or new.birth_date is distinct from old.birth_date
    or new.birth_time is distinct from old.birth_time
    or new.collar_color_initial is distinct from old.collar_color_initial
    or new.status is distinct from old.status
    or new.death_date is distinct from old.death_date
    or new.deleted_at is distinct from old.deleted_at
    or (new.birth_weight_grams is distinct from old.birth_weight_grams
      and (current_setting('app.whelping_birth_weight_rpc', true) is distinct from 'on'
        or old.birth_weight_grams is not null or new.birth_weight_grams is null)) then
    raise exception 'journal birth projections on the animal are immutable' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function public.protect_whelping_litter_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_has_open_session boolean; v_has_active_birth boolean;
begin
  select exists(select 1 from public.whelping_sessions s where s.organization_id=old.organization_id and s.litter_id=old.id and s.status='open') into v_has_open_session;
  select exists(
    select 1 from public.whelping_births b join public.whelping_sessions s
      on s.organization_id=b.organization_id and s.id=b.session_id
    where s.organization_id=old.organization_id and s.litter_id=old.id and b.cancelled_at is null
  ) into v_has_active_birth;
  if (v_has_open_session or v_has_active_birth) and (
    new.mother_id is distinct from old.mother_id or new.father_id is distinct from old.father_id
    or new.species is distinct from old.species or new.breed is distinct from old.breed
  ) then raise exception 'litter parentage and taxonomy are locked by the whelping journal' using errcode='55000'; end if;
  if v_has_active_birth
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on'
    and current_setting('app.whelping_birth_adjustment_rpc', true) is distinct from 'on'
    and (new.actual_birth_date is distinct from old.actual_birth_date
      or new.born_total_count is distinct from old.born_total_count
      or new.born_male_count is distinct from old.born_male_count
      or new.born_female_count is distinct from old.born_female_count
      or new.alive_count is distinct from old.alive_count) then
    raise exception 'journal birth projections on the litter are immutable' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function public.recalculate_whelping_litter_birth_projections(
  p_organization_id uuid, p_litter_id uuid, p_user_id uuid
) returns void
language plpgsql security definer set search_path='' set row_security=off
as $$
declare v_count integer; v_date date; v_male integer; v_female integer; v_alive integer;
begin
  select count(*)::integer,
    count(*) filter(where b.sex='male')::integer,
    count(*) filter(where b.sex='female')::integer,
    count(*) filter(where b.viability='alive')::integer
  into v_count,v_male,v_female,v_alive
  from public.whelping_births b join public.whelping_sessions s
    on s.organization_id=b.organization_id and s.id=b.session_id
  where s.organization_id=p_organization_id and s.litter_id=p_litter_id and b.cancelled_at is null;
  select (b.occurred_at at time zone s.timezone_name)::date into v_date
  from public.whelping_births b join public.whelping_sessions s
    on s.organization_id=b.organization_id and s.id=b.session_id
  where s.organization_id=p_organization_id and s.litter_id=p_litter_id and b.cancelled_at is null
  order by b.birth_order,b.occurred_at,b.id limit 1;
  update public.litters set
    actual_birth_date=case when v_count=0 then actual_birth_date else v_date end,
    born_total_count=v_count,born_male_count=v_male,born_female_count=v_female,
    alive_count=v_alive,updated_by=p_user_id
  where organization_id=p_organization_id and id=p_litter_id;
end;
$$;

revoke all on function public.recalculate_whelping_litter_birth_projections(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.whelping_birth_has_downstream_data(
  p_organization_id uuid, p_birth_id uuid, p_animal_id uuid
) returns boolean
language sql security definer set search_path='' set row_security=off
as $$
  select exists(select 1 from public.animal_weight_measurements m where m.organization_id=p_organization_id and m.animal_id=p_animal_id and (m.measurement_kind <> 'birth' or m.source_birth_id is distinct from p_birth_id))
    or exists(select 1 from public.reservations r where r.organization_id=p_organization_id and r.animal_id=p_animal_id)
    or exists(select 1 from public.media m where m.organization_id=p_organization_id and m.animal_id=p_animal_id and m.deleted_at is null)
    or exists(select 1 from public.notes n where n.organization_id=p_organization_id and n.animal_id=p_animal_id and n.deleted_at is null)
    or exists(select 1 from public.documents d where d.organization_id=p_organization_id and d.animal_id=p_animal_id)
    or exists(select 1 from public.events e where e.organization_id=p_organization_id and e.animal_id=p_animal_id)
    or exists(select 1 from public.litter_weight_adjustment_commands c where c.organization_id=p_organization_id and c.animal_id=p_animal_id)
    or exists(select 1 from public.animals a where a.organization_id=p_organization_id and (a.mother_id=p_animal_id or a.father_id=p_animal_id))
    or exists(select 1 from public.litters l where l.organization_id=p_organization_id and (l.mother_id=p_animal_id or l.father_id=p_animal_id))
    or exists(select 1 from public.whelping_sessions s where s.organization_id=p_organization_id and s.mother_id=p_animal_id)
    or exists(select 1 from public.maternal_observations o where o.organization_id=p_organization_id and o.mother_id=p_animal_id)
    or exists(select 1 from public.reproductive_cycles c where c.organization_id=p_organization_id and c.mother_id=p_animal_id)
    or exists(select 1 from public.reproductive_cycle_matings m where m.organization_id=p_organization_id and m.father_id=p_animal_id)
    or exists(
      select 1 from public.animals a where a.organization_id=p_organization_id and a.id=p_animal_id and (
        a.deleted_at is not null or a.call_name is not null or a.official_name is not null
        or a.identification_number is not null or a.lof_number is not null or a.pedigree_url is not null
        or a.color is not null or a.coat_color is not null or a.collar_color_note is not null or a.notes is not null
        or a.collar_color_current is distinct from a.collar_color_initial
        or a.ownership_status <> 'produced' or a.is_breeder or a.is_external or a.is_retired
        or a.status not in ('born','stillborn')
        or (a.status='born' and a.death_date is not null)
        or (a.status='stillborn' and a.death_date is distinct from a.birth_date)
        or a.birth_weight_grams is distinct from (
          select m.grams from public.animal_weight_measurements m
          where m.organization_id=p_organization_id and m.animal_id=p_animal_id
            and m.measurement_kind='birth' and m.source_birth_id=p_birth_id and m.cancelled_at is null
        )
      )
    );
$$;

revoke all on function public.whelping_birth_has_downstream_data(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.correct_whelping_birth(
  p_birth_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_occurred_at timestamptz,
  p_sex text,
  p_viability text,
  p_initial_collar_color text,
  p_birth_note text,
  p_weight_grams integer,
  p_weight_measured_at timestamptz,
  p_weight_note text,
  p_reason text
) returns table (
  outcome text, birth_id uuid, animal_id uuid, event_id uuid,
  weight_measurement_id uuid, revision_no integer,
  event_sequence_no integer, replayed boolean, reason text
)
language plpgsql security definer set search_path='' set row_security=off
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid; v_role text; v_litter_id uuid;
  v_birth public.whelping_births%rowtype;
  v_session public.whelping_sessions%rowtype;
  v_animal public.animals%rowtype;
  v_weight public.animal_weight_measurements%rowtype;
  v_command public.whelping_birth_adjustment_commands%rowtype;
  v_initial_color text := nullif(btrim(p_initial_collar_color),'');
  v_birth_note text := nullif(btrim(p_birth_note),'');
  v_weight_note text := nullif(btrim(p_weight_note),'');
  v_reason text := nullif(btrim(p_reason),'');
  v_previous_time timestamptz; v_next_time timestamptz;
  v_local_date date; v_local_time time;
  v_before jsonb; v_after jsonb; v_litter_after jsonb;
  v_changed boolean := false;
begin
  outcome:='error'; birth_id:=p_birth_id; animal_id:=null; event_id:=null;
  weight_measurement_id:=null; revision_no:=null; event_sequence_no:=null;
  replayed:=false; reason:=null;
  if v_user_id is null then reason:='not_authenticated'; return next; return; end if;
  if p_birth_id is null or p_client_command_id is null or p_expected_revision_no is null or p_expected_revision_no < 0
    or p_occurred_at is null or not pg_catalog.isfinite(p_occurred_at)
    or p_sex not in ('male','female','unknown') or p_viability not in ('alive','stillborn','unknown')
    or (v_initial_color is not null and char_length(v_initial_color)>255)
    or (v_birth_note is not null and char_length(v_birth_note)>5000)
    or v_reason is null or char_length(v_reason)>500
    or (p_weight_grams is not null and p_weight_grams not between 1 and 100000)
    or (p_weight_grams is null and (p_weight_measured_at is not null or v_weight_note is not null))
    or (p_weight_grams is not null and (p_weight_measured_at is null or not pg_catalog.isfinite(p_weight_measured_at))) then
    reason:='invalid_input'; return next; return;
  end if;
  select b.organization_id into v_org_id from public.whelping_births b where b.id=p_birth_id;
  if not found then reason:='birth_not_found'; return next; return; end if;
  select m.role into v_role from public.memberships m
  where m.organization_id=v_org_id and m.profile_id=v_user_id and m.status='active' and m.deleted_at is null for share;
  if not found then reason:='birth_not_found'; return next; return; end if;
  if v_role not in ('owner','admin','member') then reason:='membership_required'; return next; return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whelping_birth_adjustments:'||v_org_id::text||':'||p_client_command_id::text,0));
  select c.* into v_command from public.whelping_birth_adjustment_commands c
  where c.organization_id=v_org_id and c.client_command_id=p_client_command_id for update;
  if found then
    if v_command.command_type<>'correct_birth' or v_command.birth_id<>p_birth_id
      or v_command.expected_revision_no<>p_expected_revision_no
      or v_command.requested_occurred_at<>p_occurred_at
      or v_command.requested_sex<>p_sex or v_command.requested_viability<>p_viability
      or v_command.requested_initial_collar_color is distinct from v_initial_color
      or v_command.requested_birth_note is distinct from v_birth_note
      or v_command.requested_weight_grams is distinct from p_weight_grams
      or v_command.requested_weight_measured_at is distinct from p_weight_measured_at
      or v_command.requested_weight_note is distinct from v_weight_note
      or v_command.reason<>v_reason then reason:='client_command_conflict'; return next; return; end if;
    outcome:='success'; animal_id:=v_command.animal_id; event_id:=v_command.event_id;
    weight_measurement_id:=v_command.weight_measurement_id; revision_no:=v_command.resulting_revision_no;
    event_sequence_no:=v_command.event_sequence_no; replayed:=true; return next; return;
  end if;
  select b.* into v_birth from public.whelping_births b where b.organization_id=v_org_id and b.id=p_birth_id for update;
  if v_birth.cancelled_at is not null then reason:='birth_cancelled'; return next; return; end if;
  if v_birth.revision_no<>p_expected_revision_no then reason:='stale_revision'; return next; return; end if;
  select s.* into v_session from public.whelping_sessions s
  where s.organization_id=v_org_id and s.id=v_birth.session_id for update;
  select a.* into v_animal from public.animals a
  where a.organization_id=v_org_id and a.id=v_birth.animal_id for update;
  if v_session.id is null or v_animal.id is null or v_animal.deleted_at is not null
    or v_animal.litter_id is distinct from v_session.litter_id or v_animal.birth_order is distinct from v_birth.birth_order then
    reason:='birth_weight_inconsistent'; return next; return;
  end if;
  v_litter_id:=v_session.litter_id;
  perform 1 from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id for update;
  perform 1 from public.whelping_births b join public.whelping_sessions s
    on s.organization_id=b.organization_id and s.id=b.session_id
    where s.organization_id=v_org_id and s.litter_id=v_litter_id for update of b;
  if p_occurred_at<v_session.started_at or (v_session.ended_at is not null and p_occurred_at>v_session.ended_at) then
    reason:='birth_time_out_of_order'; return next; return;
  end if;
  select max(b.occurred_at) into v_previous_time
  from public.whelping_births b join public.whelping_sessions s on s.organization_id=b.organization_id and s.id=b.session_id
  where s.organization_id=v_org_id and s.litter_id=v_litter_id and b.cancelled_at is null and b.birth_order<v_birth.birth_order;
  select min(b.occurred_at) into v_next_time
  from public.whelping_births b join public.whelping_sessions s on s.organization_id=b.organization_id and s.id=b.session_id
  where s.organization_id=v_org_id and s.litter_id=v_litter_id and b.cancelled_at is null and b.birth_order>v_birth.birth_order;
  if (v_previous_time is not null and p_occurred_at<v_previous_time)
    or (v_next_time is not null and p_occurred_at>v_next_time) then
    reason:='birth_time_out_of_order'; return next; return;
  end if;
  if p_weight_grams is not null and p_weight_measured_at<p_occurred_at then
    reason:='birth_weight_inconsistent'; return next; return;
  end if;
  select m.* into v_weight from public.animal_weight_measurements m
  where m.organization_id=v_org_id and m.measurement_kind='birth'
    and (m.source_birth_id=v_birth.id or m.animal_id=v_birth.animal_id)
  order by (m.source_birth_id=v_birth.id) desc limit 1 for update;
  if found and (v_weight.source_birth_id is distinct from v_birth.id or v_weight.animal_id is distinct from v_birth.animal_id) then
    reason:='birth_weight_inconsistent'; return next; return;
  end if;
  if (
      p_viability is distinct from v_birth.viability
      or (
        p_viability='stillborn'
        and (p_occurred_at at time zone v_session.timezone_name)::date is distinct from v_animal.birth_date
      )
    )
    and public.whelping_birth_has_downstream_data(v_org_id,v_birth.id,v_birth.animal_id) then
    reason:='birth_has_downstream_data'; return next; return;
  end if;
  v_changed := p_occurred_at is distinct from v_birth.occurred_at or p_sex is distinct from v_birth.sex
    or p_viability is distinct from v_birth.viability or v_initial_color is distinct from v_birth.initial_collar_color
    or v_birth_note is distinct from v_birth.note
    or (p_weight_grams is null and v_weight.id is not null and v_weight.cancelled_at is null)
    or (p_weight_grams is not null and (v_weight.id is null or v_weight.cancelled_at is not null
      or v_weight.grams is distinct from p_weight_grams or v_weight.measured_at is distinct from p_weight_measured_at
      or v_weight.note is distinct from v_weight_note));
  if not v_changed then reason:='no_change'; return next; return; end if;
  select jsonb_build_object('birth',to_jsonb(v_birth),'animal',to_jsonb(v_animal),
    'birth_weight',case when v_weight.id is null then null else to_jsonb(v_weight) end,
    'litter',to_jsonb(l)) into v_before from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id;
  perform pg_catalog.set_config('app.whelping_birth_adjustment_rpc','on',true);
  perform pg_catalog.set_config('app.whelping_birth_adjustment_operation','correct_birth',true);
  update public.whelping_births adjusted_birth set occurred_at=p_occurred_at,sex=p_sex,viability=p_viability,
    initial_collar_color=v_initial_color,note=v_birth_note,revision_no=adjusted_birth.revision_no+1
  where organization_id=v_org_id and id=v_birth.id;
  v_local_date:=(p_occurred_at at time zone v_session.timezone_name)::date;
  v_local_time:=(p_occurred_at at time zone v_session.timezone_name)::time;
  update public.animals set sex=p_sex,birth_date=v_local_date,birth_time=v_local_time,
    collar_color_initial=v_initial_color,
    collar_color_current=case when collar_color_current is null or collar_color_current is not distinct from v_birth.initial_collar_color then v_initial_color else collar_color_current end,
    status=case when p_viability='stillborn' then 'stillborn' when v_birth.viability='stillborn' and status='stillborn' then 'born' else status end,
    death_date=case when p_viability='stillborn' then v_local_date when v_birth.viability='stillborn' and status='stillborn' then null else death_date end,
    updated_by=v_user_id where organization_id=v_org_id and id=v_birth.animal_id;
  if p_weight_grams is null then
    if v_weight.id is not null and v_weight.cancelled_at is null then
      update public.animal_weight_measurements adjusted_weight set revision_no=adjusted_weight.revision_no+1,
        cancelled_at=statement_timestamp(),cancelled_by=v_user_id,cancellation_reason=v_reason
      where organization_id=v_org_id and id=v_weight.id;
    end if;
    update public.animals set birth_weight_grams=null,updated_by=v_user_id where organization_id=v_org_id and id=v_birth.animal_id;
  elsif v_weight.id is null then
    insert into public.animal_weight_measurements(organization_id,animal_id,measured_at,grams,measurement_kind,source_birth_id,note,created_by)
    values(v_org_id,v_birth.animal_id,p_weight_measured_at,p_weight_grams,'birth',v_birth.id,v_weight_note,v_user_id)
    returning id into weight_measurement_id;
    update public.animals set birth_weight_grams=p_weight_grams,updated_by=v_user_id where organization_id=v_org_id and id=v_birth.animal_id;
  else
    update public.animal_weight_measurements adjusted_weight set measured_at=p_weight_measured_at,grams=p_weight_grams,note=v_weight_note,
      revision_no=adjusted_weight.revision_no+1,cancelled_at=null,cancelled_by=null,cancellation_reason=null
    where organization_id=v_org_id and id=v_weight.id;
    weight_measurement_id:=v_weight.id;
    update public.animals set birth_weight_grams=p_weight_grams,updated_by=v_user_id where organization_id=v_org_id and id=v_birth.animal_id;
  end if;
  if weight_measurement_id is null and p_weight_grams is null and v_weight.id is not null then weight_measurement_id:=v_weight.id; end if;
  select coalesce(max(e.sequence_no),0)+1 into event_sequence_no from public.whelping_events e
    where e.organization_id=v_org_id and e.session_id=v_birth.session_id;
  event_id:=gen_random_uuid();
  insert into public.whelping_events(id,organization_id,session_id,sequence_no,occurred_at,event_type,note,author_id)
  values(event_id,v_org_id,v_birth.session_id,event_sequence_no,statement_timestamp(),'birth_corrected',v_reason,v_user_id);
  perform public.recalculate_whelping_litter_birth_projections(v_org_id,v_litter_id,v_user_id);
  select to_jsonb(l) into v_litter_after from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id;
  select jsonb_build_object('birth',to_jsonb(b),'animal',to_jsonb(a),
    'birth_weight',case when m.id is null then null else to_jsonb(m) end,'litter',v_litter_after)
  into v_after from public.whelping_births b join public.animals a on a.organization_id=b.organization_id and a.id=b.animal_id
  left join public.animal_weight_measurements m on m.organization_id=b.organization_id and m.source_birth_id=b.id
  where b.organization_id=v_org_id and b.id=v_birth.id;
  revision_no:=v_birth.revision_no+1; animal_id:=v_birth.animal_id;
  insert into public.whelping_birth_adjustment_commands(
    organization_id,client_command_id,command_type,litter_id,session_id,birth_id,animal_id,event_id,weight_measurement_id,
    expected_revision_no,previous_revision_no,resulting_revision_no,reason,requested_occurred_at,requested_sex,
    requested_viability,requested_initial_collar_color,requested_birth_note,requested_weight_grams,
    requested_weight_measured_at,requested_weight_note,snapshot_before,snapshot_after,event_sequence_no,created_by
  ) values(v_org_id,p_client_command_id,'correct_birth',v_litter_id,v_birth.session_id,v_birth.id,v_birth.animal_id,event_id,
    weight_measurement_id,p_expected_revision_no,v_birth.revision_no,revision_no,v_reason,p_occurred_at,p_sex,p_viability,
    v_initial_color,v_birth_note,p_weight_grams,p_weight_measured_at,v_weight_note,v_before,v_after,event_sequence_no,v_user_id);
  outcome:='success'; return next;
exception when others then
  outcome:='error'; birth_id:=p_birth_id; animal_id:=null; event_id:=null; weight_measurement_id:=null;
  revision_no:=null; event_sequence_no:=null; replayed:=false; reason:='technical_error'; return next;
end;
$$;

revoke all on function public.correct_whelping_birth(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text) from public;
grant execute on function public.correct_whelping_birth(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text) to authenticated;

create or replace function public.cancel_whelping_birth(
  p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer,
  p_cancelled_at timestamptz, p_reason text
) returns table (
  outcome text, birth_id uuid, animal_id uuid, event_id uuid,
  weight_measurement_id uuid, revision_no integer,
  event_sequence_no integer, replayed boolean, reason text
)
language plpgsql security definer set search_path='' set row_security=off
as $$
declare
  v_user_id uuid:=auth.uid(); v_org_id uuid; v_role text; v_litter_id uuid;
  v_birth public.whelping_births%rowtype; v_session public.whelping_sessions%rowtype;
  v_animal public.animals%rowtype; v_weight public.animal_weight_measurements%rowtype;
  v_command public.whelping_birth_adjustment_commands%rowtype;
  v_reason text:=nullif(btrim(p_reason),''); v_before jsonb; v_after jsonb; v_litter_after jsonb;
begin
  outcome:='error'; birth_id:=p_birth_id; animal_id:=null; event_id:=null; weight_measurement_id:=null;
  revision_no:=null; event_sequence_no:=null; replayed:=false; reason:=null;
  if v_user_id is null then reason:='not_authenticated'; return next; return; end if;
  if p_birth_id is null or p_client_command_id is null or p_expected_revision_no is null or p_expected_revision_no<0
    or p_cancelled_at is null or not pg_catalog.isfinite(p_cancelled_at)
    or v_reason is null or char_length(v_reason)>500 then reason:='invalid_input'; return next; return; end if;
  select b.organization_id into v_org_id from public.whelping_births b where b.id=p_birth_id;
  if not found then reason:='birth_not_found'; return next; return; end if;
  select m.role into v_role from public.memberships m where m.organization_id=v_org_id and m.profile_id=v_user_id
    and m.status='active' and m.deleted_at is null for share;
  if not found then reason:='birth_not_found'; return next; return; end if;
  if v_role not in ('owner','admin','member') then reason:='membership_required'; return next; return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whelping_birth_adjustments:'||v_org_id::text||':'||p_client_command_id::text,0));
  select c.* into v_command from public.whelping_birth_adjustment_commands c
    where c.organization_id=v_org_id and c.client_command_id=p_client_command_id for update;
  if found then
    if v_command.command_type<>'cancel_birth' or v_command.birth_id<>p_birth_id
      or v_command.expected_revision_no<>p_expected_revision_no
      or v_command.requested_cancelled_at<>p_cancelled_at or v_command.reason<>v_reason then
      reason:='client_command_conflict'; return next; return;
    end if;
    outcome:='success'; animal_id:=v_command.animal_id; event_id:=v_command.event_id;
    weight_measurement_id:=v_command.weight_measurement_id; revision_no:=v_command.resulting_revision_no;
    event_sequence_no:=v_command.event_sequence_no; replayed:=true; return next; return;
  end if;
  select b.* into v_birth from public.whelping_births b where b.organization_id=v_org_id and b.id=p_birth_id for update;
  if v_birth.cancelled_at is not null then reason:='birth_cancelled'; return next; return; end if;
  if v_birth.revision_no<>p_expected_revision_no then reason:='stale_revision'; return next; return; end if;
  select s.* into v_session from public.whelping_sessions s where s.organization_id=v_org_id and s.id=v_birth.session_id for update;
  select a.* into v_animal from public.animals a where a.organization_id=v_org_id and a.id=v_birth.animal_id for update;
  if v_session.id is null or v_animal.id is null or v_animal.deleted_at is not null
    or v_animal.litter_id is distinct from v_session.litter_id or v_animal.birth_order is distinct from v_birth.birth_order then
    reason:='birth_has_downstream_data'; return next; return;
  end if;
  v_litter_id:=v_session.litter_id;
  perform 1 from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id for update;
  perform 1 from public.whelping_births b join public.whelping_sessions s on s.organization_id=b.organization_id and s.id=b.session_id
    where s.organization_id=v_org_id and s.litter_id=v_litter_id for update of b;
  if exists(
    select 1 from public.whelping_births b join public.whelping_sessions s on s.organization_id=b.organization_id and s.id=b.session_id
    where s.organization_id=v_org_id and s.litter_id=v_litter_id and b.cancelled_at is null and b.birth_order>v_birth.birth_order
  ) then reason:='later_active_birth_exists'; return next; return; end if;
  if public.whelping_birth_has_downstream_data(v_org_id,v_birth.id,v_birth.animal_id) then
    reason:='birth_has_downstream_data'; return next; return;
  end if;
  select m.* into v_weight from public.animal_weight_measurements m
    where m.organization_id=v_org_id and m.measurement_kind='birth'
      and (m.source_birth_id=v_birth.id or m.animal_id=v_birth.animal_id)
    order by (m.source_birth_id=v_birth.id) desc limit 1 for update;
  if found and (v_weight.source_birth_id is distinct from v_birth.id or v_weight.animal_id is distinct from v_birth.animal_id) then
    reason:='birth_has_downstream_data'; return next; return;
  end if;
  select jsonb_build_object('birth',to_jsonb(v_birth),'animal',to_jsonb(v_animal),
    'birth_weight',case when v_weight.id is null then null else to_jsonb(v_weight) end,'litter',to_jsonb(l))
  into v_before from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id;
  perform pg_catalog.set_config('app.whelping_birth_adjustment_rpc','on',true);
  perform pg_catalog.set_config('app.whelping_birth_adjustment_operation','cancel_birth',true);
  update public.whelping_births adjusted_birth set revision_no=adjusted_birth.revision_no+1,cancelled_at=p_cancelled_at,
    cancelled_by=v_user_id,cancellation_reason=v_reason where organization_id=v_org_id and id=v_birth.id;
  update public.animals set deleted_at=p_cancelled_at,updated_by=v_user_id where organization_id=v_org_id and id=v_birth.animal_id;
  if v_weight.id is not null and v_weight.cancelled_at is null then
    update public.animal_weight_measurements adjusted_weight set revision_no=adjusted_weight.revision_no+1,cancelled_at=p_cancelled_at,
      cancelled_by=v_user_id,cancellation_reason=v_reason where organization_id=v_org_id and id=v_weight.id;
  end if;
  weight_measurement_id:=v_weight.id;
  select coalesce(max(e.sequence_no),0)+1 into event_sequence_no from public.whelping_events e
    where e.organization_id=v_org_id and e.session_id=v_birth.session_id;
  event_id:=gen_random_uuid();
  insert into public.whelping_events(id,organization_id,session_id,sequence_no,occurred_at,event_type,note,author_id)
  values(event_id,v_org_id,v_birth.session_id,event_sequence_no,p_cancelled_at,'birth_cancelled',v_reason,v_user_id);
  perform public.recalculate_whelping_litter_birth_projections(v_org_id,v_litter_id,v_user_id);
  select to_jsonb(l) into v_litter_after from public.litters l where l.organization_id=v_org_id and l.id=v_litter_id;
  select jsonb_build_object('birth',to_jsonb(b),'animal',to_jsonb(a),
    'birth_weight',case when m.id is null then null else to_jsonb(m) end,'litter',v_litter_after)
  into v_after from public.whelping_births b join public.animals a on a.organization_id=b.organization_id and a.id=b.animal_id
  left join public.animal_weight_measurements m on m.organization_id=b.organization_id and m.source_birth_id=b.id
  where b.organization_id=v_org_id and b.id=v_birth.id;
  revision_no:=v_birth.revision_no+1; animal_id:=v_birth.animal_id;
  insert into public.whelping_birth_adjustment_commands(
    organization_id,client_command_id,command_type,litter_id,session_id,birth_id,animal_id,event_id,weight_measurement_id,
    expected_revision_no,previous_revision_no,resulting_revision_no,reason,requested_cancelled_at,
    snapshot_before,snapshot_after,event_sequence_no,created_by
  ) values(v_org_id,p_client_command_id,'cancel_birth',v_litter_id,v_birth.session_id,v_birth.id,v_birth.animal_id,event_id,
    weight_measurement_id,p_expected_revision_no,v_birth.revision_no,revision_no,v_reason,p_cancelled_at,
    v_before,v_after,event_sequence_no,v_user_id);
  outcome:='success'; return next;
exception when others then
  outcome:='error'; birth_id:=p_birth_id; animal_id:=null; event_id:=null; weight_measurement_id:=null;
  revision_no:=null; event_sequence_no:=null; replayed:=false; reason:='technical_error'; return next;
end;
$$;

revoke all on function public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text) from public;
grant execute on function public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text) to authenticated;

-- Keep the creation RPC compatible with cancelled births without duplicating it.
do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.record_whelping_birth(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure);
  v_definition:=replace(v_definition,
    E'  if found then\n    if v_existing_command.command_type',
    E'  if found then\n    if v_existing_command.command_type');
  v_definition:=replace(v_definition,
    E'    outcome := ''success'';\n    birth_id := v_existing_command.birth_id;',
    E'    if exists (select 1 from public.whelping_births replay_birth where replay_birth.organization_id = v_session.organization_id and replay_birth.id = v_existing_command.birth_id and replay_birth.cancelled_at is not null) then\n      reason := ''birth_cancelled'';\n      return next;\n      return;\n    end if;\n\n    outcome := ''success'';\n    birth_id := v_existing_command.birth_id;');
  v_definition:=replace(v_definition,
    E'    and session.litter_id = v_litter.id;',
    E'    and session.litter_id = v_litter.id\n    and birth.cancelled_at is null;');
  v_definition:=replace(v_definition,
    E'    and session.litter_id = v_litter.id\n    order by birth.birth_order, event.sequence_no',
    E'    and session.litter_id = v_litter.id\n      and birth.cancelled_at is null\n    order by birth.birth_order, event.sequence_no');
  v_definition:=replace(v_definition,
    E'  if v_existing_birth_count = 0\n    and v_litter.actual_birth_date is not null',
    E'  if v_existing_birth_count = 0\n    and not exists (select 1 from public.whelping_births historical_birth join public.whelping_sessions historical_session on historical_session.organization_id=historical_birth.organization_id and historical_session.id=historical_birth.session_id where historical_session.organization_id=v_litter.organization_id and historical_session.litter_id=v_litter.id)\n    and v_litter.actual_birth_date is not null');
  v_definition:=replace(v_definition,
    E'    select (event.occurred_at at time zone session.timezone_name)::date as local_date',
    E'    select (birth.occurred_at at time zone session.timezone_name)::date as local_date');
  v_definition:=replace(v_definition,
    E'    join public.whelping_events event\n      on event.organization_id = birth.organization_id\n     and event.id = birth.event_id\n', E'');
  v_definition:=replace(v_definition,E'    order by birth.birth_order, event.sequence_no',E'    order by birth.birth_order, birth.occurred_at, birth.id');
  execute v_definition;

  v_definition:=pg_get_functiondef('public.record_whelping_birth_weight(uuid,uuid,integer,timestamptz,text)'::regprocedure);
  v_definition:=replace(v_definition,
    E'  if p_measured_at < v_event.occurred_at then',
    E'  if v_birth.cancelled_at is not null then\n    reason := ''birth_cancelled'';\n    return next;\n    return;\n  end if;\n\n  if p_measured_at < v_birth.occurred_at then');
  execute v_definition;
end;
$$;

comment on table public.whelping_birth_adjustment_commands is
  'Private append-only idempotency and audit registry for birth corrections and cancellations.';
comment on function public.correct_whelping_birth(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text) is
  'Atomically corrects the effective birth state while preserving the original birth event.';
comment on function public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text) is
  'Atomically cancels only the last active litter birth without physically deleting business rows.';

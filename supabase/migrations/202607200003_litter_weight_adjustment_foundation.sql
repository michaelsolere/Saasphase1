alter table public.litter_weighing_sessions
  add column revision_no integer not null default 0,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add constraint litter_weighing_sessions_revision_nonnegative_check
    check (revision_no >= 0),
  add constraint litter_weighing_sessions_cancellation_values_check
    check (
      (
        cancelled_at is null
        and cancelled_by is null
        and cancellation_reason is null
      )
      or (
        cancelled_at is not null
        and pg_catalog.isfinite(cancelled_at)
        and cancelled_by is not null
        and cancellation_reason is not null
        and cancellation_reason = btrim(cancellation_reason)
        and char_length(cancellation_reason) between 1 and 500
      )
    ),
  add constraint litter_weighing_sessions_cancelled_by_membership_fk
    foreign key (organization_id, cancelled_by)
    references public.memberships (organization_id, profile_id) on delete restrict;

alter table public.animal_weight_measurements
  add column revision_no integer not null default 0,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add constraint animal_weight_measurements_revision_nonnegative_check
    check (revision_no >= 0),
  add constraint animal_weight_measurements_cancellation_values_check
    check (
      (
        cancelled_at is null
        and cancelled_by is null
        and cancellation_reason is null
      )
      or (
        cancelled_at is not null
        and pg_catalog.isfinite(cancelled_at)
        and cancelled_by is not null
        and cancellation_reason is not null
        and cancellation_reason = btrim(cancellation_reason)
        and char_length(cancellation_reason) between 1 and 500
        and measurement_kind = 'routine'
      )
    ),
  add constraint animal_weight_measurements_cancelled_by_membership_fk
    foreign key (organization_id, cancelled_by)
    references public.memberships (organization_id, profile_id) on delete restrict;

drop index public.animal_weight_measurements_routine_exact_key;

create unique index animal_weight_measurements_routine_exact_key
  on public.animal_weight_measurements (organization_id, animal_id, measured_at)
  where measurement_kind = 'routine' and cancelled_at is null;

create index litter_weighing_sessions_active_litter_measured_at_idx
  on public.litter_weighing_sessions (
    organization_id,
    litter_id,
    measured_at desc,
    created_at desc
  )
  where cancelled_at is null;

create index animal_weight_measurements_active_litter_session_idx
  on public.animal_weight_measurements (
    organization_id,
    litter_weighing_session_id,
    animal_id
  )
  where measurement_kind = 'routine' and cancelled_at is null;

do $$
declare
  v_definition text;
  v_old_fragment text := 'and measurement.measured_at = p_measured_at';
  v_new_fragment text := 'and measurement.measured_at = p_measured_at'
    || E'\n        and measurement.cancelled_at is null';
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_litter_routine_weights(uuid,uuid,timestamptz,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if v_definition is null or pg_catalog.strpos(v_definition, v_old_fragment) = 0 then
    raise exception 'record_litter_routine_weights duplicate check not found';
  end if;

  execute pg_catalog.replace(v_definition, v_old_fragment, v_new_fragment);
end;
$$;

create table public.litter_weight_adjustment_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  command_type text not null,
  litter_id uuid not null,
  litter_weighing_session_id uuid not null,
  measurement_id uuid,
  animal_id uuid,
  expected_revision_no integer not null,
  previous_revision_no integer not null,
  result_revision_no integer not null,
  input_grams integer,
  input_note text,
  cancelled_at timestamptz,
  reason text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  affected_measurement_count integer not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_weight_adjustment_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint litter_weight_adjustment_commands_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_weight_adjustment_commands_session_organization_fk
    foreign key (organization_id, litter_weighing_session_id)
    references public.litter_weighing_sessions (organization_id, id) on delete restrict,
  constraint litter_weight_adjustment_commands_measurement_organization_fk
    foreign key (organization_id, measurement_id)
    references public.animal_weight_measurements (organization_id, id) on delete restrict,
  constraint litter_weight_adjustment_commands_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint litter_weight_adjustment_commands_type_check
    check (command_type in (
      'correct_measurement', 'cancel_measurement', 'cancel_session'
    )),
  constraint litter_weight_adjustment_commands_revision_check
    check (
      expected_revision_no >= 0
      and previous_revision_no >= 0
      and result_revision_no = previous_revision_no + 1
    ),
  constraint litter_weight_adjustment_commands_reason_check
    check (
      reason = btrim(reason)
      and char_length(reason) between 1 and 500
    ),
  constraint litter_weight_adjustment_commands_snapshot_check
    check (
      jsonb_typeof(before_snapshot) = 'object'
      and jsonb_typeof(after_snapshot) = 'object'
    ),
  constraint litter_weight_adjustment_commands_values_check
    check (
      (
        command_type = 'correct_measurement'
        and measurement_id is not null
        and animal_id is not null
        and input_grams between 1 and 100000
        and cancelled_at is null
        and affected_measurement_count = 1
      )
      or (
        command_type = 'cancel_measurement'
        and measurement_id is not null
        and animal_id is not null
        and input_grams is null
        and input_note is null
        and cancelled_at is not null
        and pg_catalog.isfinite(cancelled_at)
        and affected_measurement_count = 1
      )
      or (
        command_type = 'cancel_session'
        and measurement_id is null
        and animal_id is null
        and input_grams is null
        and input_note is null
        and cancelled_at is not null
        and pg_catalog.isfinite(cancelled_at)
        and affected_measurement_count >= 1
      )
    )
);

create index litter_weight_adjustment_commands_session_created_at_idx
  on public.litter_weight_adjustment_commands (
    organization_id,
    litter_weighing_session_id,
    created_at
  );

alter table public.litter_weight_adjustment_commands enable row level security;

create or replace function public.prevent_litter_weight_adjustment_command_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'litter weight adjustment commands are append-only'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.cancel_litter_weighing_session(
  p_session_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_cancelled_at timestamptz,
  p_reason text
)
returns table (
  outcome text,
  litter_weighing_session_id uuid,
  revision_no integer,
  affected_measurement_count integer,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_session public.litter_weighing_sessions%rowtype;
  v_after_session public.litter_weighing_sessions%rowtype;
  v_command public.litter_weight_adjustment_commands%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
begin
  outcome := 'error'; litter_weighing_session_id := p_session_id;
  revision_no := null; affected_measurement_count := null; replayed := false; reason := null;

  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_session_id is null or p_client_command_id is null
    or p_expected_revision_no is null or p_expected_revision_no < 0
    or p_cancelled_at is null or not pg_catalog.isfinite(p_cancelled_at)
    or v_reason is null or char_length(v_reason) > 500 then
    reason := 'invalid_input'; return next; return;
  end if;

  select session.organization_id into v_organization_id
  from public.litter_weighing_sessions session where session.id = p_session_id;
  if not found then reason := 'session_not_found'; return next; return; end if;
  select membership.role into v_membership_role from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id and membership.status = 'active'
    and membership.deleted_at is null for share;
  if not found then reason := 'session_not_found'; return next; return; end if;
  if v_membership_role not in ('owner', 'admin', 'member') then reason := 'membership_required'; return next; return; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'litter_weight_adjustments:' || v_organization_id::text || ':' || p_client_command_id::text, 0
  ));
  select command.* into v_command from public.litter_weight_adjustment_commands command
  where command.organization_id = v_organization_id and command.client_command_id = p_client_command_id
  for update;
  if found then
    if v_command.command_type <> 'cancel_session'
      or v_command.litter_weighing_session_id is distinct from p_session_id
      or v_command.expected_revision_no is distinct from p_expected_revision_no
      or v_command.cancelled_at is distinct from p_cancelled_at
      or v_command.reason is distinct from v_reason then
      reason := 'client_command_conflict'; return next; return;
    end if;
    outcome := 'success'; revision_no := v_command.result_revision_no;
    affected_measurement_count := v_command.affected_measurement_count;
    replayed := true; return next; return;
  end if;

  select session.* into v_session from public.litter_weighing_sessions session
  where session.organization_id = v_organization_id and session.id = p_session_id for update;
  if not found then reason := 'session_not_found'; return next; return; end if;
  if v_session.cancelled_at is not null then reason := 'session_cancelled'; return next; return; end if;
  if v_session.revision_no <> p_expected_revision_no then reason := 'stale_revision'; return next; return; end if;
  if not exists (select 1 from public.litters litter
    where litter.organization_id = v_organization_id and litter.id = v_session.litter_id
      and litter.deleted_at is null) then
    reason := 'relations_inconsistent'; return next; return;
  end if;

  perform 1 from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.litter_weighing_session_id = v_session.id
    and measurement.measurement_kind = 'routine'
  order by measurement.id for update;

  select count(*) into affected_measurement_count
  from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.litter_weighing_session_id = v_session.id
    and measurement.measurement_kind = 'routine'
    and measurement.cancelled_at is null;
  if affected_measurement_count < 1 then reason := 'session_empty'; return next; return; end if;

  select jsonb_build_object(
    'session', to_jsonb(v_session),
    'measurements', coalesce(jsonb_agg(to_jsonb(measurement) order by measurement.id), '[]'::jsonb)
  ) into v_before_snapshot
  from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.litter_weighing_session_id = v_session.id
    and measurement.measurement_kind = 'routine';

  perform pg_catalog.set_config('app.litter_weight_adjustment_rpc', 'on', true);
  perform pg_catalog.set_config('app.litter_weight_adjustment_operation', 'cancel_session', true);
  update public.litter_weighing_sessions
  set cancelled_at = p_cancelled_at, cancelled_by = v_user_id,
      cancellation_reason = v_reason,
      revision_no = public.litter_weighing_sessions.revision_no + 1
  where organization_id = v_organization_id and id = p_session_id
  returning * into v_after_session;

  update public.animal_weight_measurements
  set cancelled_at = p_cancelled_at, cancelled_by = v_user_id,
      cancellation_reason = v_reason,
      revision_no = public.animal_weight_measurements.revision_no + 1
  where public.animal_weight_measurements.organization_id = v_organization_id
    and public.animal_weight_measurements.litter_weighing_session_id = p_session_id
    and public.animal_weight_measurements.measurement_kind = 'routine'
    and public.animal_weight_measurements.cancelled_at is null;

  select jsonb_build_object(
    'session', to_jsonb(v_after_session),
    'measurements', coalesce(jsonb_agg(to_jsonb(measurement) order by measurement.id), '[]'::jsonb)
  ) into v_after_snapshot
  from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.litter_weighing_session_id = v_session.id
    and measurement.measurement_kind = 'routine';

  insert into public.litter_weight_adjustment_commands (
    organization_id, client_command_id, command_type, litter_id,
    litter_weighing_session_id, expected_revision_no, previous_revision_no,
    result_revision_no, cancelled_at, reason, before_snapshot, after_snapshot,
    affected_measurement_count, created_by
  ) values (
    v_organization_id, p_client_command_id, 'cancel_session', v_session.litter_id,
    v_session.id, p_expected_revision_no, v_session.revision_no,
    v_after_session.revision_no, p_cancelled_at, v_reason,
    v_before_snapshot, v_after_snapshot, affected_measurement_count, v_user_id
  );
  outcome := 'success'; revision_no := v_after_session.revision_no; return next; return;
exception when others then
  outcome := 'error'; litter_weighing_session_id := p_session_id; revision_no := null;
  affected_measurement_count := null; replayed := false; reason := 'technical_error'; return next; return;
end;
$$;

create trigger litter_weight_adjustment_commands_immutable
before update or delete on public.litter_weight_adjustment_commands
for each row execute function public.prevent_litter_weight_adjustment_command_mutation();

create or replace function public.prevent_litter_weighing_session_mutation()
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

  if tg_op = 'DELETE'
    or current_setting('app.litter_weight_adjustment_rpc', true) is distinct from 'on'
    or current_setting('app.litter_weight_adjustment_operation', true) is distinct from 'cancel_session' then
    raise exception 'litter weighing sessions are immutable'
      using errcode = '55000';
  end if;

  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.litter_id is distinct from old.litter_id
    or new.measured_at is distinct from old.measured_at
    or new.timezone_name is distinct from old.timezone_name
    or new.note is distinct from old.note
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or old.cancelled_at is not null
    or new.cancelled_at is null
    or new.cancelled_by is null
    or new.cancellation_reason is null
    or new.revision_no is distinct from old.revision_no + 1 then
    raise exception 'litter weighing session adjustment is invalid'
      using errcode = '55000';
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
  v_operation text := current_setting('app.litter_weight_adjustment_operation', true);
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE'
    or current_setting('app.litter_weight_adjustment_rpc', true) is distinct from 'on'
    or v_operation not in ('correct_measurement', 'cancel_measurement', 'cancel_session') then
    raise exception 'animal weight measurements are immutable'
      using errcode = '55000';
  end if;

  if old.measurement_kind <> 'routine'
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
    raise exception 'animal weight measurement adjustment is invalid'
      using errcode = '55000';
  end if;

  if v_operation = 'correct_measurement' then
    if old.cancelled_at is not null
      or new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
      or (new.grams is not distinct from old.grams and new.note is not distinct from old.note) then
      raise exception 'routine weight correction is invalid'
        using errcode = '55000';
    end if;
  else
    if old.cancelled_at is not null
      or new.cancelled_at is null
      or new.cancelled_by is null
      or new.cancellation_reason is null
      or new.grams is distinct from old.grams
      or new.note is distinct from old.note then
      raise exception 'routine weight cancellation is invalid'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

revoke all on table public.litter_weight_adjustment_commands from anon, authenticated;
revoke all on function public.prevent_litter_weight_adjustment_command_mutation() from public;

create or replace function public.correct_litter_routine_weight(
  p_measurement_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_grams integer,
  p_note text,
  p_reason text
)
returns table (
  outcome text,
  measurement_id uuid,
  litter_weighing_session_id uuid,
  revision_no integer,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_session public.litter_weighing_sessions%rowtype;
  v_measurement public.animal_weight_measurements%rowtype;
  v_after public.animal_weight_measurements%rowtype;
  v_command public.litter_weight_adjustment_commands%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_reason text := nullif(btrim(p_reason), '');
begin
  outcome := 'error';
  measurement_id := p_measurement_id;
  litter_weighing_session_id := null;
  revision_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_measurement_id is null or p_client_command_id is null
    or p_expected_revision_no is null or p_expected_revision_no < 0
    or p_grams is null or p_grams not between 1 and 100000
    or (v_note is not null and char_length(v_note) > 5000)
    or v_reason is null or char_length(v_reason) > 500 then
    reason := 'invalid_input'; return next; return;
  end if;

  select measurement.organization_id
  into v_organization_id
  from public.animal_weight_measurements measurement
  where measurement.id = p_measurement_id;
  if not found then reason := 'measurement_not_found'; return next; return; end if;

  select membership.role into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;
  if not found then reason := 'measurement_not_found'; return next; return; end if;
  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required'; return next; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'litter_weight_adjustments:' || v_organization_id::text || ':' || p_client_command_id::text, 0
  ));

  select command.* into v_command
  from public.litter_weight_adjustment_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id
  for update;
  if found then
    if v_command.command_type <> 'correct_measurement'
      or v_command.measurement_id is distinct from p_measurement_id
      or v_command.expected_revision_no is distinct from p_expected_revision_no
      or v_command.input_grams is distinct from p_grams
      or v_command.input_note is distinct from v_note
      or v_command.reason is distinct from v_reason then
      reason := 'client_command_conflict'; return next; return;
    end if;
    outcome := 'success';
    litter_weighing_session_id := v_command.litter_weighing_session_id;
    revision_no := v_command.result_revision_no;
    replayed := true;
    return next; return;
  end if;

  select session.* into v_session
  from public.litter_weighing_sessions session
  where session.organization_id = v_organization_id
    and session.id = (
      select measurement.litter_weighing_session_id
      from public.animal_weight_measurements measurement
      where measurement.organization_id = v_organization_id
        and measurement.id = p_measurement_id
    )
  for update;
  if not found then reason := 'session_not_found'; return next; return; end if;

  select measurement.* into v_measurement
  from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.id = p_measurement_id
  for update;
  if not found then reason := 'measurement_not_found'; return next; return; end if;
  litter_weighing_session_id := v_session.id;

  if v_session.cancelled_at is not null then reason := 'session_cancelled'; return next; return; end if;
  if v_measurement.cancelled_at is not null then reason := 'measurement_cancelled'; return next; return; end if;
  if v_measurement.measurement_kind <> 'routine'
    or v_measurement.litter_weighing_session_id is distinct from v_session.id
    or not exists (
      select 1 from public.animals animal
      where animal.organization_id = v_organization_id
        and animal.id = v_measurement.animal_id
        and animal.litter_id = v_session.litter_id
    ) then
    reason := 'relations_inconsistent'; return next; return;
  end if;
  if v_measurement.revision_no <> p_expected_revision_no then
    reason := 'stale_revision'; return next; return;
  end if;
  if v_measurement.grams = p_grams and v_measurement.note is not distinct from v_note then
    reason := 'no_change'; return next; return;
  end if;

  perform pg_catalog.set_config('app.litter_weight_adjustment_rpc', 'on', true);
  perform pg_catalog.set_config('app.litter_weight_adjustment_operation', 'correct_measurement', true);

  update public.animal_weight_measurements
  set grams = p_grams, note = v_note,
      revision_no = public.animal_weight_measurements.revision_no + 1
  where organization_id = v_organization_id and id = p_measurement_id
  returning * into v_after;

  insert into public.litter_weight_adjustment_commands (
    organization_id, client_command_id, command_type, litter_id,
    litter_weighing_session_id, measurement_id, animal_id,
    expected_revision_no, previous_revision_no, result_revision_no,
    input_grams, input_note, cancelled_at, reason,
    before_snapshot, after_snapshot, affected_measurement_count, created_by
  ) values (
    v_organization_id, p_client_command_id, 'correct_measurement', v_session.litter_id,
    v_session.id, v_measurement.id, v_measurement.animal_id,
    p_expected_revision_no, v_measurement.revision_no, v_after.revision_no,
    p_grams, v_note, null, v_reason,
    jsonb_build_object('measurement', to_jsonb(v_measurement)),
    jsonb_build_object('measurement', to_jsonb(v_after)), 1, v_user_id
  );

  outcome := 'success';
  revision_no := v_after.revision_no;
  return next; return;
exception when others then
  outcome := 'error'; measurement_id := p_measurement_id;
  litter_weighing_session_id := null; revision_no := null; replayed := false;
  reason := 'technical_error'; return next; return;
end;
$$;

create or replace function public.cancel_litter_routine_weight(
  p_measurement_id uuid,
  p_client_command_id uuid,
  p_expected_revision_no integer,
  p_cancelled_at timestamptz,
  p_reason text
)
returns table (
  outcome text,
  measurement_id uuid,
  litter_weighing_session_id uuid,
  revision_no integer,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_membership_role text;
  v_session public.litter_weighing_sessions%rowtype;
  v_measurement public.animal_weight_measurements%rowtype;
  v_after public.animal_weight_measurements%rowtype;
  v_command public.litter_weight_adjustment_commands%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_active_count integer;
begin
  outcome := 'error'; measurement_id := p_measurement_id;
  litter_weighing_session_id := null; revision_no := null; replayed := false; reason := null;

  if v_user_id is null then reason := 'not_authenticated'; return next; return; end if;
  if p_measurement_id is null or p_client_command_id is null
    or p_expected_revision_no is null or p_expected_revision_no < 0
    or p_cancelled_at is null or not pg_catalog.isfinite(p_cancelled_at)
    or v_reason is null or char_length(v_reason) > 500 then
    reason := 'invalid_input'; return next; return;
  end if;

  select measurement.organization_id into v_organization_id
  from public.animal_weight_measurements measurement where measurement.id = p_measurement_id;
  if not found then reason := 'measurement_not_found'; return next; return; end if;
  select membership.role into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id and membership.status = 'active'
    and membership.deleted_at is null for share;
  if not found then reason := 'measurement_not_found'; return next; return; end if;
  if v_membership_role not in ('owner', 'admin', 'member') then reason := 'membership_required'; return next; return; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'litter_weight_adjustments:' || v_organization_id::text || ':' || p_client_command_id::text, 0
  ));
  select command.* into v_command from public.litter_weight_adjustment_commands command
  where command.organization_id = v_organization_id and command.client_command_id = p_client_command_id
  for update;
  if found then
    if v_command.command_type <> 'cancel_measurement'
      or v_command.measurement_id is distinct from p_measurement_id
      or v_command.expected_revision_no is distinct from p_expected_revision_no
      or v_command.cancelled_at is distinct from p_cancelled_at
      or v_command.reason is distinct from v_reason then
      reason := 'client_command_conflict'; return next; return;
    end if;
    outcome := 'success'; litter_weighing_session_id := v_command.litter_weighing_session_id;
    revision_no := v_command.result_revision_no; replayed := true; return next; return;
  end if;

  select session.* into v_session from public.litter_weighing_sessions session
  where session.organization_id = v_organization_id and session.id = (
    select measurement.litter_weighing_session_id from public.animal_weight_measurements measurement
    where measurement.organization_id = v_organization_id and measurement.id = p_measurement_id
  ) for update;
  if not found then reason := 'session_not_found'; return next; return; end if;
  select measurement.* into v_measurement from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id and measurement.id = p_measurement_id for update;
  if not found then reason := 'measurement_not_found'; return next; return; end if;
  litter_weighing_session_id := v_session.id;

  if v_session.cancelled_at is not null then reason := 'session_cancelled'; return next; return; end if;
  if v_measurement.cancelled_at is not null then reason := 'measurement_cancelled'; return next; return; end if;
  if v_measurement.measurement_kind <> 'routine'
    or v_measurement.litter_weighing_session_id is distinct from v_session.id
    or not exists (select 1 from public.animals animal
      where animal.organization_id = v_organization_id and animal.id = v_measurement.animal_id
        and animal.litter_id = v_session.litter_id) then
    reason := 'relations_inconsistent'; return next; return;
  end if;
  if v_measurement.revision_no <> p_expected_revision_no then reason := 'stale_revision'; return next; return; end if;

  select count(*) into v_active_count from public.animal_weight_measurements measurement
  where measurement.organization_id = v_organization_id
    and measurement.litter_weighing_session_id = v_session.id
    and measurement.measurement_kind = 'routine' and measurement.cancelled_at is null;
  if v_active_count <= 1 then reason := 'last_measurement_requires_session_cancellation'; return next; return; end if;

  perform pg_catalog.set_config('app.litter_weight_adjustment_rpc', 'on', true);
  perform pg_catalog.set_config('app.litter_weight_adjustment_operation', 'cancel_measurement', true);
  update public.animal_weight_measurements
  set cancelled_at = p_cancelled_at, cancelled_by = v_user_id,
      cancellation_reason = v_reason,
      revision_no = public.animal_weight_measurements.revision_no + 1
  where organization_id = v_organization_id and id = p_measurement_id
  returning * into v_after;

  insert into public.litter_weight_adjustment_commands (
    organization_id, client_command_id, command_type, litter_id,
    litter_weighing_session_id, measurement_id, animal_id,
    expected_revision_no, previous_revision_no, result_revision_no,
    cancelled_at, reason, before_snapshot, after_snapshot,
    affected_measurement_count, created_by
  ) values (
    v_organization_id, p_client_command_id, 'cancel_measurement', v_session.litter_id,
    v_session.id, v_measurement.id, v_measurement.animal_id,
    p_expected_revision_no, v_measurement.revision_no, v_after.revision_no,
    p_cancelled_at, v_reason,
    jsonb_build_object('measurement', to_jsonb(v_measurement)),
    jsonb_build_object('measurement', to_jsonb(v_after)), 1, v_user_id
  );
  outcome := 'success'; revision_no := v_after.revision_no; return next; return;
exception when others then
  outcome := 'error'; measurement_id := p_measurement_id; litter_weighing_session_id := null;
  revision_no := null; replayed := false; reason := 'technical_error'; return next; return;
end;
$$;

revoke all on function public.correct_litter_routine_weight(
  uuid, uuid, integer, integer, text, text
) from public;
revoke all on function public.cancel_litter_routine_weight(
  uuid, uuid, integer, timestamptz, text
) from public;
revoke all on function public.cancel_litter_weighing_session(
  uuid, uuid, integer, timestamptz, text
) from public;

grant execute on function public.correct_litter_routine_weight(
  uuid, uuid, integer, integer, text, text
) to authenticated;
grant execute on function public.cancel_litter_routine_weight(
  uuid, uuid, integer, timestamptz, text
) to authenticated;
grant execute on function public.cancel_litter_weighing_session(
  uuid, uuid, integer, timestamptz, text
) to authenticated;

comment on table public.litter_weight_adjustment_commands is
  'Private append-only audit and idempotency registry for routine weight corrections and cancellations.';
comment on function public.correct_litter_routine_weight(uuid, uuid, integer, integer, text, text) is
  'Corrects only grams and note on one active routine measurement with optimistic revision control.';
comment on function public.cancel_litter_routine_weight(uuid, uuid, integer, timestamptz, text) is
  'Cancels one active routine measurement without deleting it.';
comment on function public.cancel_litter_weighing_session(uuid, uuid, integer, timestamptz, text) is
  'Atomically cancels one routine weighing session and all of its active measurements without deleting them.';

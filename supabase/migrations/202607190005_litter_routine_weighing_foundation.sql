create table public.litter_weighing_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  measured_at timestamptz not null,
  timezone_name text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_weighing_sessions_organization_id_id_key
    unique (organization_id, id),
  constraint litter_weighing_sessions_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_weighing_sessions_measured_at_finite_check
    check (pg_catalog.isfinite(measured_at)),
  constraint litter_weighing_sessions_timezone_name_check
    check (
      timezone_name = btrim(timezone_name)
      and char_length(timezone_name) between 1 and 255
    ),
  constraint litter_weighing_sessions_note_check
    check (
      note is null
      or (
        note = btrim(note)
        and char_length(note) between 1 and 5000
      )
    )
);

create index litter_weighing_sessions_litter_measured_at_idx
  on public.litter_weighing_sessions (
    organization_id,
    litter_id,
    measured_at desc,
    created_at desc
  );

create or replace function public.validate_litter_weighing_session_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = new.timezone_name
  ) then
    raise exception 'litter weighing session timezone must be an IANA timezone'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_weighing_sessions_validate_timezone
before insert or update of timezone_name
on public.litter_weighing_sessions
for each row execute function public.validate_litter_weighing_session_timezone();

create or replace function public.prevent_litter_weighing_session_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.litter_routine_weight_rpc', true) is distinct from 'on' then
    raise exception 'litter weighing sessions are inserted exclusively by the dedicated command'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger litter_weighing_sessions_guard_insert
before insert on public.litter_weighing_sessions
for each row execute function public.prevent_litter_weighing_session_insert();

create or replace function public.prevent_litter_weighing_session_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'litter weighing sessions are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger litter_weighing_sessions_immutable
before update or delete on public.litter_weighing_sessions
for each row execute function public.prevent_litter_weighing_session_mutation();

alter table public.animal_weight_measurements
  add column litter_weighing_session_id uuid;

alter table public.animal_weight_measurements
  add constraint animal_weight_measurements_litter_session_organization_fk
    foreign key (organization_id, litter_weighing_session_id)
    references public.litter_weighing_sessions (organization_id, id) on delete restrict,
  add constraint animal_weight_measurements_litter_session_animal_key
    unique (litter_weighing_session_id, animal_id);

alter table public.animal_weight_measurements
  drop constraint animal_weight_measurements_birth_source_check,
  add constraint animal_weight_measurements_source_check
    check (
      (
        measurement_kind = 'birth'
        and source_birth_id is not null
        and litter_weighing_session_id is null
      )
      or (
        measurement_kind = 'routine'
        and source_birth_id is null
        and litter_weighing_session_id is not null
      )
      or (
        measurement_kind = 'clinical'
        and source_birth_id is null
        and litter_weighing_session_id is null
      )
    ),
  add constraint animal_weight_measurements_routine_note_check
    check (
      measurement_kind <> 'routine'
      or note is null
      or (
        note = btrim(note)
        and char_length(note) between 1 and 5000
      )
    );

create unique index animal_weight_measurements_routine_exact_key
  on public.animal_weight_measurements (organization_id, animal_id, measured_at)
  where measurement_kind = 'routine';

create index animal_weight_measurements_litter_session_idx
  on public.animal_weight_measurements (
    organization_id,
    litter_weighing_session_id,
    animal_id
  )
  where litter_weighing_session_id is not null;

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
    and current_setting('app.litter_routine_weight_rpc', true) is distinct from 'on' then
    raise exception 'animal weight measurements are inserted exclusively by dedicated commands'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.validate_animal_weight_measurement_links()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_animal public.animals%rowtype;
  v_session public.litter_weighing_sessions%rowtype;
begin
  if new.measurement_kind = 'birth' then
    if not exists (
      select 1
      from public.whelping_births birth
      where birth.organization_id = new.organization_id
        and birth.id = new.source_birth_id
        and birth.animal_id = new.animal_id
    ) then
      raise exception 'birth weight measurement links are inconsistent'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.measurement_kind = 'routine' then
    select animal.*
    into v_animal
    from public.animals animal
    where animal.organization_id = new.organization_id
      and animal.id = new.animal_id;

    select session.*
    into v_session
    from public.litter_weighing_sessions session
    where session.organization_id = new.organization_id
      and session.id = new.litter_weighing_session_id;

    if v_animal.id is null
      or v_session.id is null
      or v_animal.litter_id is distinct from v_session.litter_id
      or new.measured_at is distinct from v_session.measured_at then
      raise exception 'routine weight measurement links are inconsistent'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger animal_weight_measurements_validate_birth_link
  on public.animal_weight_measurements;
drop function public.validate_birth_weight_measurement_link();

create trigger animal_weight_measurements_validate_links
before insert or update on public.animal_weight_measurements
for each row execute function public.validate_animal_weight_measurement_links();

create or replace function public.protect_routine_weight_animal_litter()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (
    new.organization_id is distinct from old.organization_id
    or new.litter_id is distinct from old.litter_id
  ) and exists (
    select 1
    from public.animal_weight_measurements measurement
    where measurement.organization_id = old.organization_id
      and measurement.animal_id = old.id
      and measurement.measurement_kind = 'routine'
  ) then
    raise exception 'routine weight animal organization and litter are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger animals_protect_routine_weight_litter
before update of organization_id, litter_id on public.animals
for each row execute function public.protect_routine_weight_animal_litter();

create table public.litter_weight_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  litter_id uuid not null,
  litter_weighing_session_id uuid not null,
  measured_at timestamptz not null,
  timezone_name text not null,
  note text,
  items_snapshot jsonb not null,
  measurement_count integer not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_weight_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint litter_weight_commands_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_weight_commands_session_organization_fk
    foreign key (organization_id, litter_weighing_session_id)
    references public.litter_weighing_sessions (organization_id, id) on delete restrict,
  constraint litter_weight_commands_measured_at_finite_check
    check (pg_catalog.isfinite(measured_at)),
  constraint litter_weight_commands_timezone_name_check
    check (
      timezone_name = btrim(timezone_name)
      and char_length(timezone_name) between 1 and 255
    ),
  constraint litter_weight_commands_note_check
    check (
      note is null
      or (
        note = btrim(note)
        and char_length(note) between 1 and 5000
      )
    ),
  constraint litter_weight_commands_snapshot_check
    check (
      jsonb_typeof(items_snapshot) = 'array'
      and measurement_count between 1 and 30
      and jsonb_array_length(items_snapshot) = measurement_count
    )
);

create index litter_weight_commands_litter_created_at_idx
  on public.litter_weight_commands (organization_id, litter_id, created_at);

alter table public.litter_weighing_sessions enable row level security;
alter table public.litter_weight_commands enable row level security;

create policy litter_weighing_sessions_select_member
on public.litter_weighing_sessions
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.record_litter_routine_weights(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_measured_at timestamptz,
  p_timezone_name text,
  p_note text,
  p_items jsonb
)
returns table (
  outcome text,
  litter_id uuid,
  litter_weighing_session_id uuid,
  measurement_ids uuid[],
  measurement_count integer,
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
  v_litter public.litters%rowtype;
  v_existing_command public.litter_weight_commands%rowtype;
  v_animal public.animals%rowtype;
  v_item jsonb;
  v_note text := nullif(btrim(p_note), '');
  v_timezone_name text := btrim(p_timezone_name);
  v_items_snapshot jsonb;
  v_item_count integer;
  v_animal_id uuid;
  v_grams integer;
  v_item_note text;
  v_local_birth_at timestamp;
begin
  outcome := 'error';
  litter_id := p_litter_id;
  litter_weighing_session_id := null;
  measurement_ids := null;
  measurement_count := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_measured_at is null
    or not pg_catalog.isfinite(p_measured_at)
    or p_timezone_name is null
    or char_length(v_timezone_name) not between 1 and 255
    or (v_note is not null and char_length(v_note) > 5000)
    or p_items is null
    or jsonb_typeof(p_items) is distinct from 'array' then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if v_item_count > 30 then
    reason := 'too_many_animals';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = v_timezone_name
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) is distinct from 'object'
      or not (item ? 'animal_id')
      or not (item ? 'grams')
      or item - 'animal_id' - 'grams' - 'note' <> '{}'::jsonb
      or jsonb_typeof(item -> 'animal_id') is distinct from 'string'
      or (item ->> 'animal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(item -> 'grams') is distinct from 'number'
      or (item ->> 'grams') !~ '^[0-9]+$'
      or case
        when (item ->> 'grams') ~ '^[0-9]+$'
          then (item ->> 'grams')::numeric not between 1 and 100000
        else false
      end
      or (
        item ? 'note'
        and jsonb_typeof(item -> 'note') not in ('string', 'null')
      )
      or (
        jsonb_typeof(item -> 'note') = 'string'
        and char_length(btrim(item ->> 'note')) > 5000
      )
  ) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'animal_id', lower(item ->> 'animal_id'),
      'grams', (item ->> 'grams')::integer,
      'note', nullif(btrim(item ->> 'note'), '')
    )
    order by lower(item ->> 'animal_id')
  )
  into v_items_snapshot
  from jsonb_array_elements(p_items) item;

  if exists (
    select 1
    from jsonb_array_elements(v_items_snapshot) item
    group by item ->> 'animal_id'
    having count(*) > 1
  ) then
    reason := 'duplicate_animal';
    return next;
    return;
  end if;

  select litter.organization_id
  into v_organization_id
  from public.litters litter
  where litter.id = p_litter_id
    and litter.deleted_at is null;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin', 'member') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_weight_commands:' || v_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_organization_id
    and litter.id = p_litter_id
    and litter.deleted_at is null
  for update;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  select command.*
  into v_existing_command
  from public.litter_weight_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.litter_id is distinct from p_litter_id
      or v_existing_command.measured_at is distinct from p_measured_at
      or v_existing_command.timezone_name is distinct from v_timezone_name
      or v_existing_command.note is distinct from v_note
      or v_existing_command.items_snapshot is distinct from v_items_snapshot then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    litter_weighing_session_id := v_existing_command.litter_weighing_session_id;
    select array_agg(measurement.id order by measurement.animal_id)
    into measurement_ids
    from public.animal_weight_measurements measurement
    where measurement.organization_id = v_organization_id
      and measurement.litter_weighing_session_id =
        v_existing_command.litter_weighing_session_id;
    measurement_count := v_existing_command.measurement_count;
    replayed := true;
    return next;
    return;
  end if;

  perform 1
  from public.animals animal
  where animal.organization_id = v_organization_id
    and animal.id in (
      select (item ->> 'animal_id')::uuid
      from jsonb_array_elements(v_items_snapshot) item
    )
  order by animal.id
  for update;

  for v_item in
    select item
    from jsonb_array_elements(v_items_snapshot) item
    order by item ->> 'animal_id'
  loop
    v_animal_id := (v_item ->> 'animal_id')::uuid;
    v_grams := (v_item ->> 'grams')::integer;
    v_item_note := v_item ->> 'note';

    select animal.*
    into v_animal
    from public.animals animal
    where animal.organization_id = v_organization_id
      and animal.id = v_animal_id;

    if not found or v_animal.litter_id is distinct from p_litter_id then
      reason := 'animal_not_found';
      return next;
      return;
    end if;

    if v_animal.deleted_at is not null
      or v_animal.ownership_status is distinct from 'produced'
      or v_animal.birth_date is null
      or v_animal.status = 'stillborn' then
      reason := 'animal_ineligible';
      return next;
      return;
    end if;

    v_local_birth_at := v_animal.birth_date
      + coalesce(v_animal.birth_time, time '00:00:00');

    if p_measured_at < (v_local_birth_at at time zone v_timezone_name) then
      reason := 'measured_before_birth';
      return next;
      return;
    end if;

    if v_animal.death_date is not null
      and (p_measured_at at time zone v_timezone_name)::date > v_animal.death_date then
      reason := 'measured_after_death';
      return next;
      return;
    end if;

    if exists (
      select 1
      from public.animal_weight_measurements measurement
      where measurement.organization_id = v_organization_id
        and measurement.animal_id = v_animal_id
        and measurement.measurement_kind = 'routine'
        and measurement.measured_at = p_measured_at
    ) then
      reason := 'measurement_already_recorded';
      return next;
      return;
    end if;
  end loop;

  litter_weighing_session_id := gen_random_uuid();
  measurement_ids := array[]::uuid[];

  perform pg_catalog.set_config('app.litter_routine_weight_rpc', 'on', true);

  insert into public.litter_weighing_sessions (
    id,
    organization_id,
    litter_id,
    measured_at,
    timezone_name,
    note,
    created_by
  ) values (
    litter_weighing_session_id,
    v_organization_id,
    p_litter_id,
    p_measured_at,
    v_timezone_name,
    v_note,
    v_user_id
  );

  for v_item in
    select item
    from jsonb_array_elements(v_items_snapshot) item
    order by item ->> 'animal_id'
  loop
    v_animal_id := (v_item ->> 'animal_id')::uuid;
    v_grams := (v_item ->> 'grams')::integer;
    v_item_note := v_item ->> 'note';
    measurement_ids := array_append(measurement_ids, gen_random_uuid());

    insert into public.animal_weight_measurements (
      id,
      organization_id,
      animal_id,
      measured_at,
      grams,
      measurement_kind,
      source_birth_id,
      litter_weighing_session_id,
      note,
      created_by
    ) values (
      measurement_ids[array_length(measurement_ids, 1)],
      v_organization_id,
      v_animal_id,
      p_measured_at,
      v_grams,
      'routine',
      null,
      litter_weighing_session_id,
      v_item_note,
      v_user_id
    );
  end loop;

  measurement_count := v_item_count;

  insert into public.litter_weight_commands (
    organization_id,
    client_command_id,
    litter_id,
    litter_weighing_session_id,
    measured_at,
    timezone_name,
    note,
    items_snapshot,
    measurement_count,
    created_by
  ) values (
    v_organization_id,
    p_client_command_id,
    p_litter_id,
    litter_weighing_session_id,
    p_measured_at,
    v_timezone_name,
    v_note,
    v_items_snapshot,
    measurement_count,
    v_user_id
  );

  outcome := 'success';
  return next;
exception
  when unique_violation then
    outcome := 'error';
    litter_id := p_litter_id;
    litter_weighing_session_id := null;
    measurement_ids := null;
    measurement_count := null;
    replayed := false;
    reason := 'measurement_already_recorded';
    return next;
    return;
  when foreign_key_violation or check_violation then
    outcome := 'error';
    litter_id := p_litter_id;
    litter_weighing_session_id := null;
    measurement_ids := null;
    measurement_count := null;
    replayed := false;
    reason := 'relations_inconsistent';
    return next;
    return;
  when others then
    outcome := 'error';
    litter_id := p_litter_id;
    litter_weighing_session_id := null;
    measurement_ids := null;
    measurement_count := null;
    replayed := false;
    reason := 'technical_error';
    return next;
    return;
end;
$$;

revoke all on table public.litter_weighing_sessions from anon, authenticated;
revoke all on table public.litter_weight_commands from anon, authenticated;

grant select on table public.litter_weighing_sessions to authenticated;

revoke all on function public.validate_litter_weighing_session_timezone() from public;
revoke all on function public.prevent_litter_weighing_session_insert() from public;
revoke all on function public.prevent_litter_weighing_session_mutation() from public;
revoke all on function public.validate_animal_weight_measurement_links() from public;
revoke all on function public.protect_routine_weight_animal_litter() from public;
revoke all on function public.record_litter_routine_weights(
  uuid, uuid, timestamptz, text, text, jsonb
) from public;

grant execute on function public.record_litter_routine_weights(
  uuid, uuid, timestamptz, text, text, jsonb
) to authenticated;

comment on table public.litter_weighing_sessions is
  'Immutable collective routine weighing sessions for one litter.';

comment on table public.litter_weight_commands is
  'Private idempotency registry for collective litter routine weighing commands.';

comment on column public.animal_weight_measurements.litter_weighing_session_id is
  'Collective litter weighing session for routine measurements; null for birth and clinical measurements.';

comment on function public.record_litter_routine_weights(
  uuid, uuid, timestamptz, text, text, jsonb
) is
  'Atomically and idempotently records one routine weighing session for one to thirty litter animals.';

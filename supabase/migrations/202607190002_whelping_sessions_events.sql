alter table public.litters
  add constraint litters_organization_id_id_mother_id_key
  unique (organization_id, id, mother_id);

create table public.whelping_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  mother_id uuid not null,
  status text not null default 'open',
  started_at timestamptz not null,
  ended_at timestamptz,
  timezone_name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint whelping_sessions_organization_id_id_key
    unique (organization_id, id),
  constraint whelping_sessions_litter_mother_organization_fk
    foreign key (organization_id, litter_id, mother_id)
    references public.litters (organization_id, id, mother_id) on delete restrict,
  constraint whelping_sessions_mother_organization_fk
    foreign key (organization_id, mother_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint whelping_sessions_status_check
    check (status in ('open', 'closed')),
  constraint whelping_sessions_dates_check
    check (ended_at is null or ended_at >= started_at),
  constraint whelping_sessions_status_dates_check
    check (
      (status = 'open' and ended_at is null)
      or (status = 'closed' and ended_at is not null)
    ),
  constraint whelping_sessions_timezone_name_check
    check (char_length(btrim(timezone_name)) between 1 and 255),
  constraint whelping_sessions_note_check
    check (note is null or char_length(note) <= 5000)
);

create unique index whelping_sessions_one_open_per_litter_key
  on public.whelping_sessions (organization_id, litter_id)
  where status = 'open';

create index whelping_sessions_litter_started_at_idx
  on public.whelping_sessions (
    organization_id,
    litter_id,
    started_at desc,
    created_at desc
  );

create trigger whelping_sessions_set_updated_at
before update on public.whelping_sessions
for each row execute function public.set_updated_at();

create table public.whelping_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  session_id uuid not null,
  sequence_no integer not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  event_type text not null,
  note text,
  author_id uuid not null references public.profiles(id) on delete restrict,
  constraint whelping_events_organization_id_id_key
    unique (organization_id, id),
  constraint whelping_events_session_organization_fk
    foreign key (organization_id, session_id)
    references public.whelping_sessions (organization_id, id) on delete restrict,
  constraint whelping_events_session_sequence_key
    unique (organization_id, session_id, sequence_no),
  constraint whelping_events_sequence_positive_check
    check (sequence_no > 0),
  constraint whelping_events_type_check
    check (event_type in (
      'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
      'vet_called', 'intervention', 'observation', 'birth', 'session_closed'
    )),
  constraint whelping_events_note_check
    check (note is null or char_length(note) <= 5000)
);

create index whelping_events_session_sequence_idx
  on public.whelping_events (organization_id, session_id, sequence_no);

create index whelping_events_session_occurred_at_idx
  on public.whelping_events (
    organization_id,
    session_id,
    occurred_at,
    sequence_no
  );

create table public.whelping_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  command_type text not null,
  litter_id uuid not null,
  session_id uuid not null,
  event_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  occurred_at timestamptz,
  timezone_name text,
  event_type text,
  note text,
  result_sequence_no integer,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint whelping_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint whelping_commands_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint whelping_commands_session_organization_fk
    foreign key (organization_id, session_id)
    references public.whelping_sessions (organization_id, id) on delete restrict,
  constraint whelping_commands_event_organization_fk
    foreign key (organization_id, event_id)
    references public.whelping_events (organization_id, id) on delete restrict,
  constraint whelping_commands_type_check
    check (command_type in ('open_session', 'record_event', 'close_session')),
  constraint whelping_commands_event_type_check
    check (
      event_type is null
      or event_type in (
        'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
        'vet_called', 'intervention', 'observation', 'session_closed'
      )
    ),
  constraint whelping_commands_note_check
    check (note is null or char_length(note) <= 5000),
  constraint whelping_commands_values_check
    check (
      (
        command_type = 'open_session'
        and event_id is null
        and started_at is not null
        and ended_at is null
        and occurred_at is null
        and timezone_name is not null
        and event_type is null
        and result_sequence_no is null
      )
      or (
        command_type = 'record_event'
        and event_id is not null
        and started_at is null
        and ended_at is null
        and occurred_at is not null
        and timezone_name is null
        and event_type in (
          'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
          'vet_called', 'intervention', 'observation'
        )
        and result_sequence_no > 0
      )
      or (
        command_type = 'close_session'
        and event_id is not null
        and started_at is null
        and ended_at is not null
        and occurred_at is null
        and timezone_name is null
        and event_type = 'session_closed'
        and result_sequence_no > 0
      )
    )
);

create index whelping_commands_session_created_at_idx
  on public.whelping_commands (organization_id, session_id, created_at);

create or replace function public.validate_whelping_session_timezone()
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
    raise exception 'whelping session timezone must be an IANA timezone'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger whelping_sessions_validate_timezone
before insert or update of timezone_name
on public.whelping_sessions
for each row execute function public.validate_whelping_session_timezone();

create or replace function public.prevent_whelping_session_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_session_rpc', true) is distinct from 'on' then
    raise exception 'whelping sessions are mutated exclusively by dedicated commands'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger whelping_sessions_protect_mutation
before update or delete
on public.whelping_sessions
for each row execute function public.prevent_whelping_session_mutation();

create or replace function public.prevent_whelping_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'recorded whelping events are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger whelping_events_immutable
before update or delete
on public.whelping_events
for each row execute function public.prevent_whelping_event_mutation();

alter table public.whelping_sessions enable row level security;
alter table public.whelping_events enable row level security;
alter table public.whelping_commands enable row level security;

create policy whelping_sessions_select_member
on public.whelping_sessions
for select
to authenticated
using (public.is_member_of(organization_id));

create policy whelping_events_select_member
on public.whelping_events
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.open_whelping_session(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_started_at timestamptz,
  p_timezone_name text,
  p_note text default null
)
returns table (
  outcome text,
  session_id uuid,
  litter_id uuid,
  mother_id uuid,
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
  v_litter_organization_id uuid;
  v_membership_role text;
  v_litter public.litters%rowtype;
  v_mother public.animals%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  outcome := 'error';
  session_id := null;
  litter_id := p_litter_id;
  mother_id := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null or p_client_command_id is null
    or p_started_at is null or p_timezone_name is null
    or char_length(btrim(p_timezone_name)) not between 1 and 255
    or (v_note is not null and char_length(v_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select litter.organization_id
  into v_litter_organization_id
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
  where membership.organization_id = v_litter_organization_id
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
      'whelping_commands:' || v_litter_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_litter_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'open_session'
      or v_existing_command.litter_id <> p_litter_id
      or v_existing_command.started_at <> p_started_at
      or v_existing_command.timezone_name <> btrim(p_timezone_name)
      or v_existing_command.note is distinct from v_note then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    session_id := v_existing_command.session_id;
    litter_id := v_existing_command.litter_id;

    select session.mother_id
    into mother_id
    from public.whelping_sessions session
    where session.organization_id = v_litter_organization_id
      and session.id = v_existing_command.session_id;

    replayed := true;
    return next;
    return;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_litter_organization_id
    and litter.id = p_litter_id
    and litter.deleted_at is null
  for update;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  if v_litter.status not in (
    'pregnancy_confirmed', 'birth_expected', 'birth_in_progress'
  ) then
    reason := 'litter_not_open';
    return next;
    return;
  end if;

  if v_litter.mother_id is null then
    reason := 'mother_ineligible';
    return next;
    return;
  end if;

  select animal.*
  into v_mother
  from public.animals animal
  where animal.organization_id = v_litter.organization_id
    and animal.id = v_litter.mother_id
    and animal.deleted_at is null
  for share;

  if not found or v_mother.sex <> 'female' then
    reason := 'mother_ineligible';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = btrim(p_timezone_name)
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.whelping_sessions session
    where session.organization_id = v_litter.organization_id
      and session.litter_id = v_litter.id
      and session.status = 'open'
  ) then
    reason := 'session_already_open';
    return next;
    return;
  end if;

  insert into public.whelping_sessions (
    organization_id,
    litter_id,
    mother_id,
    status,
    started_at,
    timezone_name,
    note,
    created_by,
    updated_by
  ) values (
    v_litter.organization_id,
    v_litter.id,
    v_mother.id,
    'open',
    p_started_at,
    btrim(p_timezone_name),
    v_note,
    v_user_id,
    v_user_id
  )
  returning id into session_id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    started_at,
    timezone_name,
    note,
    created_by
  ) values (
    v_litter.organization_id,
    p_client_command_id,
    'open_session',
    v_litter.id,
    session_id,
    p_started_at,
    btrim(p_timezone_name),
    v_note,
    v_user_id
  );

  outcome := 'success';
  litter_id := v_litter.id;
  mother_id := v_mother.id;
  return next;
end;
$$;

create or replace function public.record_whelping_event(
  p_session_id uuid,
  p_client_command_id uuid,
  p_occurred_at timestamptz,
  p_event_type text,
  p_note text default null
)
returns table (
  outcome text,
  event_id uuid,
  session_id uuid,
  sequence_no integer,
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
  v_session_organization_id uuid;
  v_membership_role text;
  v_session public.whelping_sessions%rowtype;
  v_litter public.litters%rowtype;
  v_mother public.animals%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  outcome := 'error';
  event_id := null;
  session_id := p_session_id;
  sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_session_id is null or p_client_command_id is null
    or p_occurred_at is null or p_event_type is null
    or (v_note is not null and char_length(v_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select session.organization_id
  into v_session_organization_id
  from public.whelping_sessions session
  where session.id = p_session_id;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_session_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'session_not_found';
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
      'whelping_commands:' || v_session_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_session_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'record_event'
      or v_existing_command.session_id <> p_session_id
      or v_existing_command.occurred_at <> p_occurred_at
      or v_existing_command.event_type <> p_event_type
      or v_existing_command.note is distinct from v_note then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    event_id := v_existing_command.event_id;
    session_id := v_existing_command.session_id;
    sequence_no := v_existing_command.result_sequence_no;
    replayed := true;
    return next;
    return;
  end if;

  if p_event_type not in (
    'labor_started', 'contractions', 'water_broke', 'placenta', 'nursing',
    'vet_called', 'intervention', 'observation'
  ) then
    reason := 'invalid_event_type';
    return next;
    return;
  end if;

  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = v_session_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_session.organization_id
    and litter.id = v_session.litter_id
    and litter.deleted_at is null
  for share;

  if not found or v_litter.mother_id is distinct from v_session.mother_id then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  select animal.*
  into v_mother
  from public.animals animal
  where animal.organization_id = v_session.organization_id
    and animal.id = v_session.mother_id
    and animal.deleted_at is null
  for share;

  if not found or v_mother.sex <> 'female' then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  if v_session.status <> 'open' then
    reason := 'session_closed';
    return next;
    return;
  end if;

  select coalesce(max(event.sequence_no), 0) + 1
  into sequence_no
  from public.whelping_events event
  where event.organization_id = v_session.organization_id
    and event.session_id = v_session.id;

  insert into public.whelping_events (
    organization_id,
    session_id,
    sequence_no,
    occurred_at,
    event_type,
    note,
    author_id
  ) values (
    v_session.organization_id,
    v_session.id,
    sequence_no,
    p_occurred_at,
    p_event_type,
    v_note,
    v_user_id
  )
  returning id into event_id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    event_id,
    occurred_at,
    event_type,
    note,
    result_sequence_no,
    created_by
  ) values (
    v_session.organization_id,
    p_client_command_id,
    'record_event',
    v_session.litter_id,
    v_session.id,
    event_id,
    p_occurred_at,
    p_event_type,
    v_note,
    sequence_no,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

create or replace function public.close_whelping_session(
  p_session_id uuid,
  p_client_command_id uuid,
  p_ended_at timestamptz,
  p_note text default null
)
returns table (
  outcome text,
  session_id uuid,
  event_id uuid,
  sequence_no integer,
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
  v_session_organization_id uuid;
  v_membership_role text;
  v_session public.whelping_sessions%rowtype;
  v_litter public.litters%rowtype;
  v_mother public.animals%rowtype;
  v_existing_command public.whelping_commands%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  outcome := 'error';
  session_id := p_session_id;
  event_id := null;
  sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_session_id is null or p_client_command_id is null or p_ended_at is null
    or (v_note is not null and char_length(v_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select session.organization_id
  into v_session_organization_id
  from public.whelping_sessions session
  where session.id = p_session_id;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_session_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'session_not_found';
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
      'whelping_commands:' || v_session_organization_id::text
        || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.whelping_commands command
  where command.organization_id = v_session_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.command_type <> 'close_session'
      or v_existing_command.session_id <> p_session_id
      or v_existing_command.ended_at <> p_ended_at
      or v_existing_command.note is distinct from v_note then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    session_id := v_existing_command.session_id;
    event_id := v_existing_command.event_id;
    sequence_no := v_existing_command.result_sequence_no;
    replayed := true;
    return next;
    return;
  end if;

  select session.*
  into v_session
  from public.whelping_sessions session
  where session.organization_id = v_session_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    reason := 'session_not_found';
    return next;
    return;
  end if;

  select litter.*
  into v_litter
  from public.litters litter
  where litter.organization_id = v_session.organization_id
    and litter.id = v_session.litter_id
    and litter.deleted_at is null
  for share;

  if not found or v_litter.mother_id is distinct from v_session.mother_id then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  select animal.*
  into v_mother
  from public.animals animal
  where animal.organization_id = v_session.organization_id
    and animal.id = v_session.mother_id
    and animal.deleted_at is null
  for share;

  if not found or v_mother.sex <> 'female' then
    reason := 'invalid_session';
    return next;
    return;
  end if;

  if v_session.status <> 'open' then
    reason := 'session_closed';
    return next;
    return;
  end if;

  if p_ended_at < v_session.started_at then
    reason := 'invalid_end_time';
    return next;
    return;
  end if;

  select coalesce(max(event.sequence_no), 0) + 1
  into sequence_no
  from public.whelping_events event
  where event.organization_id = v_session.organization_id
    and event.session_id = v_session.id;

  perform set_config('app.whelping_session_rpc', 'on', true);

  update public.whelping_sessions
  set
    status = 'closed',
    ended_at = p_ended_at,
    updated_by = v_user_id
  where organization_id = v_session.organization_id
    and id = v_session.id;

  insert into public.whelping_events (
    organization_id,
    session_id,
    sequence_no,
    occurred_at,
    event_type,
    note,
    author_id
  ) values (
    v_session.organization_id,
    v_session.id,
    sequence_no,
    p_ended_at,
    'session_closed',
    v_note,
    v_user_id
  )
  returning id into event_id;

  insert into public.whelping_commands (
    organization_id,
    client_command_id,
    command_type,
    litter_id,
    session_id,
    event_id,
    ended_at,
    event_type,
    note,
    result_sequence_no,
    created_by
  ) values (
    v_session.organization_id,
    p_client_command_id,
    'close_session',
    v_session.litter_id,
    v_session.id,
    event_id,
    p_ended_at,
    'session_closed',
    v_note,
    sequence_no,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on table public.whelping_sessions from anon, authenticated;
revoke all on table public.whelping_events from anon, authenticated;
revoke all on table public.whelping_commands from anon, authenticated;

grant select on table public.whelping_sessions to authenticated;
grant select on table public.whelping_events to authenticated;

revoke all on function public.validate_whelping_session_timezone() from public;
revoke all on function public.prevent_whelping_session_mutation() from public;
revoke all on function public.prevent_whelping_event_mutation() from public;
revoke all on function public.open_whelping_session(
  uuid, uuid, timestamptz, text, text
) from public;
revoke all on function public.record_whelping_event(
  uuid, uuid, timestamptz, text, text
) from public;
revoke all on function public.close_whelping_session(
  uuid, uuid, timestamptz, text
) from public;

grant execute on function public.open_whelping_session(
  uuid, uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.record_whelping_event(
  uuid, uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.close_whelping_session(
  uuid, uuid, timestamptz, text
) to authenticated;

comment on table public.whelping_sessions is
  'Whelping sessions opened and closed exclusively through dedicated commands.';

comment on table public.whelping_events is
  'Append-only generic whelping timeline; birth is reserved for a future command.';

comment on table public.whelping_commands is
  'Private typed registry for idempotent whelping commands; inaccessible to clients.';

comment on column public.whelping_events.occurred_at is
  'Business observation time supplied by the user.';

comment on column public.whelping_events.recorded_at is
  'Technical server time assigned when the event is persisted.';

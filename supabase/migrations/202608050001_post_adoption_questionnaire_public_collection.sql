-- POST-ADOPTION-QUESTIONNAIRE-PUBLIC-COLLECTION-01
-- Opaque public access, short sessions, idempotent immutable submissions and revisions.

begin;

create table public.post_adoption_questionnaire_public_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  token_hash text not null,
  token_hint text not null,
  activated_at timestamptz not null default statement_timestamp(),
  public_read_until timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  replaced_by_access_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint post_adoption_questionnaire_public_accesses_org_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_public_accesses_instance_fk
    foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id)
    on delete restrict,
  constraint post_adoption_questionnaire_public_accesses_replacement_fk
    foreign key (organization_id, replaced_by_access_id)
    references public.post_adoption_questionnaire_public_accesses(organization_id, id)
    on delete restrict deferrable initially deferred,
  constraint post_adoption_questionnaire_public_accesses_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint post_adoption_questionnaire_public_accesses_hint_check
    check (char_length(token_hint) between 4 and 12),
  constraint post_adoption_questionnaire_public_accesses_dates_check
    check (public_read_until > activated_at),
  constraint post_adoption_questionnaire_public_accesses_revocation_check
    check (
      (revoked_at is null and revoked_by is null and replaced_by_access_id is null)
      or (revoked_at is not null and revoked_by is not null)
    )
);
create unique index post_adoption_questionnaire_public_accesses_token_key
  on public.post_adoption_questionnaire_public_accesses(token_hash);
create unique index post_adoption_questionnaire_public_accesses_active_instance_key
  on public.post_adoption_questionnaire_public_accesses(organization_id, instance_id)
  where revoked_at is null;
create index post_adoption_questionnaire_public_accesses_instance_idx
  on public.post_adoption_questionnaire_public_accesses(organization_id, instance_id, activated_at desc);

create table public.post_adoption_questionnaire_public_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  access_id uuid not null,
  session_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  constraint post_adoption_questionnaire_public_sessions_org_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_public_sessions_org_id_access_key
    unique (organization_id, id, access_id),
  constraint post_adoption_questionnaire_public_sessions_access_fk
    foreign key (organization_id, access_id)
    references public.post_adoption_questionnaire_public_accesses(organization_id, id)
    on delete restrict,
  constraint post_adoption_questionnaire_public_sessions_hash_key unique (session_hash),
  constraint post_adoption_questionnaire_public_sessions_hash_check
    check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint post_adoption_questionnaire_public_sessions_dates_check
    check (expires_at > created_at and expires_at <= created_at + interval '2 hours')
);
create index post_adoption_questionnaire_public_sessions_access_idx
  on public.post_adoption_questionnaire_public_sessions(organization_id, access_id, expires_at desc);

create table public.post_adoption_questionnaire_public_submission_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  access_id uuid not null,
  session_id uuid not null,
  instance_id uuid not null,
  client_command_id uuid not null,
  payload_sha256 text not null,
  base_revision_no integer not null,
  revision_no integer,
  outcome text not null,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint post_adoption_questionnaire_public_commands_org_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_public_commands_session_fk
    foreign key (organization_id, session_id, access_id)
    references public.post_adoption_questionnaire_public_sessions(organization_id, id, access_id)
    on delete restrict,
  constraint post_adoption_questionnaire_public_commands_instance_fk
    foreign key (organization_id, instance_id)
    references public.post_adoption_questionnaire_instances(organization_id, id)
    on delete restrict,
  constraint post_adoption_questionnaire_public_commands_revision_fk
    foreign key (organization_id, instance_id, revision_no)
    references public.post_adoption_questionnaire_response_revisions(organization_id, instance_id, revision_no)
    on delete restrict deferrable initially deferred,
  constraint post_adoption_questionnaire_public_commands_client_key
    unique (organization_id, session_id, client_command_id),
  constraint post_adoption_questionnaire_public_commands_hash_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint post_adoption_questionnaire_public_commands_base_check
    check (base_revision_no >= 0),
  constraint post_adoption_questionnaire_public_commands_outcome_check
    check (
      (outcome = 'pending' and revision_no is null and completed_at is null)
      or (outcome = 'success' and revision_no is not null and completed_at is not null)
    )
);
create index post_adoption_questionnaire_public_commands_instance_idx
  on public.post_adoption_questionnaire_public_submission_commands(organization_id, instance_id, created_at, id);

create table public.post_adoption_questionnaire_public_rate_limits (
  bucket_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  updated_at timestamptz not null,
  constraint post_adoption_questionnaire_public_rate_limits_hash_check
    check (bucket_hash ~ '^[0-9a-f]{64}$'),
  constraint post_adoption_questionnaire_public_rate_limits_count_check
    check (attempt_count > 0)
);
create index post_adoption_questionnaire_public_rate_limits_updated_idx
  on public.post_adoption_questionnaire_public_rate_limits(updated_at);

alter table public.post_adoption_questionnaire_public_accesses enable row level security;
alter table public.post_adoption_questionnaire_public_sessions enable row level security;
alter table public.post_adoption_questionnaire_public_submission_commands enable row level security;
alter table public.post_adoption_questionnaire_public_rate_limits enable row level security;

revoke all on table
  public.post_adoption_questionnaire_public_accesses,
  public.post_adoption_questionnaire_public_sessions,
  public.post_adoption_questionnaire_public_submission_commands,
  public.post_adoption_questionnaire_public_rate_limits
from public, anon, authenticated;

revoke all on table
  public.post_adoption_questionnaire_public_accesses,
  public.post_adoption_questionnaire_public_sessions,
  public.post_adoption_questionnaire_public_submission_commands,
  public.post_adoption_questionnaire_public_rate_limits
from service_role;

-- The gateway is restricted to the SECURITY DEFINER API. Direct DML would
-- bypass the immutable response/event contract and must remain unavailable.
revoke insert, update, delete, truncate on table
  public.post_adoption_questionnaire_definitions,
  public.post_adoption_questionnaire_instances,
  public.post_adoption_questionnaire_drafts,
  public.post_adoption_questionnaire_response_revisions,
  public.post_adoption_questionnaire_events
from service_role;

create or replace function public.post_adoption_questionnaire_public_history_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' and (
    (session_user = 'postgres' and pg_catalog.current_setting('app.qa_hard_delete', true) = 'on')
    or (current_user = 'postgres' and pg_catalog.current_setting('app.post_adoption_public_cleanup', true) = 'on')
  ) then
    return old;
  end if;
  raise exception 'post-adoption questionnaire public history is immutable' using errcode = '55000';
end;
$fn$;

create trigger post_adoption_questionnaire_public_accesses_no_delete
before delete on public.post_adoption_questionnaire_public_accesses
for each row execute function public.post_adoption_questionnaire_public_history_immutable();
create trigger post_adoption_questionnaire_public_commands_immutable
before update or delete on public.post_adoption_questionnaire_public_submission_commands
for each row execute function public.post_adoption_questionnaire_public_history_immutable();

create or replace function public.allow_post_adoption_questionnaire_public_request(
  p_bucket_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_now timestamptz := statement_timestamp();
  v_count integer;
begin
  if p_bucket_hash is null
    or p_bucket_hash !~ '^[0-9a-f]{64}$'
    or p_max_attempts < 1 or p_max_attempts > 1000
    or p_window_seconds < 1 or p_window_seconds > 3600
  then
    return false;
  end if;

  insert into public.post_adoption_questionnaire_public_rate_limits (
    bucket_hash,
    window_started_at,
    attempt_count,
    updated_at
  ) values (
    p_bucket_hash,
    v_now,
    1,
    v_now
  )
  on conflict (bucket_hash) do update
  set window_started_at = case
        when public.post_adoption_questionnaire_public_rate_limits.window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds) <= v_now
        then v_now
        else public.post_adoption_questionnaire_public_rate_limits.window_started_at
      end,
      attempt_count = case
        when public.post_adoption_questionnaire_public_rate_limits.window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds) <= v_now
        then 1
        else public.post_adoption_questionnaire_public_rate_limits.attempt_count + 1
      end,
      updated_at = v_now
  returning attempt_count into v_count;

  -- Keep storage bounded without introducing a broad unindexed sweep.
  delete from public.post_adoption_questionnaire_public_rate_limits
  where bucket_hash in (
    select stale.bucket_hash
    from public.post_adoption_questionnaire_public_rate_limits stale
    where stale.updated_at < v_now - interval '1 day'
    order by stale.updated_at
    limit 100
    for update skip locked
  );

  return v_count <= p_max_attempts;
end;
$fn$;

create or replace function public.create_or_rotate_post_adoption_questionnaire_public_access(
  p_instance_id uuid,
  p_token_hash text,
  p_token_hint text
)
returns table (
  outcome text,
  access_id uuid,
  activated_at timestamptz,
  response_deadline_at timestamptz,
  public_read_until timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_previous public.post_adoption_questionnaire_public_accesses%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_hint is null or char_length(p_token_hint) not between 4 and 12 then
    return query select 'invalid_input'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_instance
  from public.post_adoption_questionnaire_instances
  where id = p_instance_id
  for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if not public.has_organization_role(v_instance.organization_id, array['owner','admin']) then
    return query select 'forbidden'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_instance.status = 'due' then
    insert into public.post_adoption_questionnaire_events (
      organization_id, instance_id, event_type, from_status, to_status,
      actor_kind, actor_profile_id, details, occurred_at
    ) values (
      v_instance.organization_id, v_instance.id, 'invitation_sent', 'due', 'invited',
      'member', v_user_id, jsonb_build_object('activation', 'public_access'), v_now
    );
    select * into v_instance
    from public.post_adoption_questionnaire_instances
    where organization_id = v_instance.organization_id and id = v_instance.id;
  elsif v_instance.status not in ('invited','in_progress','submitted','under_review','expired') then
    return query select 'invalid_state'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_instance.response_deadline_at is null then
    return query select 'invalid_state'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_now >= v_instance.response_deadline_at + interval '30 days' then
    return query select 'invalid_state'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_previous
  from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_instance.organization_id
    and instance_id = v_instance.id
    and revoked_at is null
  for update;

  begin
    if v_previous.id is not null then
      update public.post_adoption_questionnaire_public_accesses
      set revoked_at = v_now, revoked_by = v_user_id
      where organization_id = v_previous.organization_id and id = v_previous.id;
      update public.post_adoption_questionnaire_public_sessions session
      set invalidated_at = v_now
      where session.organization_id = v_previous.organization_id
        and session.access_id = v_previous.id
        and session.invalidated_at is null;
    end if;

    insert into public.post_adoption_questionnaire_public_accesses (
      organization_id, instance_id, token_hash, token_hint, activated_at,
      public_read_until, created_by
    ) values (
      v_instance.organization_id, v_instance.id, p_token_hash, p_token_hint, v_now,
      v_instance.response_deadline_at + interval '30 days', v_user_id
    ) returning * into v_access;
  exception when unique_violation then
    return query select 'conflict'::text, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end;

  if v_previous.id is not null then
    update public.post_adoption_questionnaire_public_accesses
    set replaced_by_access_id = v_access.id
    where organization_id = v_previous.organization_id and id = v_previous.id;
  end if;

  return query select 'success'::text, v_access.id, v_access.activated_at,
    v_instance.response_deadline_at, v_access.public_read_until;
end;
$fn$;

create or replace function public.revoke_post_adoption_questionnaire_public_access(
  p_instance_id uuid
)
returns table (outcome text, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then return query select 'not_authenticated'::text, null::timestamptz; return; end if;
  select * into v_instance from public.post_adoption_questionnaire_instances where id = p_instance_id;
  if not found then return query select 'not_found'::text, null::timestamptz; return; end if;
  if not public.has_organization_role(v_instance.organization_id, array['owner','admin']) then
    return query select 'forbidden'::text, null::timestamptz; return;
  end if;
  select * into v_instance
  from public.post_adoption_questionnaire_instances
  where id = p_instance_id and organization_id = v_instance.organization_id
  for update;
  if not found then return query select 'not_found'::text, null::timestamptz; return; end if;
  select * into v_access
  from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_instance.organization_id and instance_id = v_instance.id and revoked_at is null
  for update;
  if not found then return query select 'already_revoked'::text, null::timestamptz; return; end if;
  update public.post_adoption_questionnaire_public_accesses
  set revoked_at = v_now, revoked_by = v_user_id
  where organization_id = v_access.organization_id and id = v_access.id;
  update public.post_adoption_questionnaire_public_sessions
  set invalidated_at = v_now
  where organization_id = v_access.organization_id and access_id = v_access.id and invalidated_at is null;
  return query select 'success'::text, v_now;
end;
$fn$;

create or replace function public.exchange_post_adoption_questionnaire_public_token(
  p_token_hash text,
  p_session_hash text
)
returns table (
  outcome text,
  session_id uuid,
  session_created_at timestamptz,
  session_expires_at timestamptz,
  animal_name text,
  milestone text,
  questionnaire_title text,
  definition jsonb,
  instance_status text,
  response_deadline_at timestamptz,
  public_read_until timestamptz,
  latest_revision_no integer,
  latest_submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_session public.post_adoption_questionnaire_public_sessions%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_animal_name text;
  v_latest_revision integer;
  v_latest_submitted timestamptz;
  v_now timestamptz := statement_timestamp();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    return query select 'unavailable'::text, null::uuid, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::jsonb, null::text, null::timestamptz,
      null::timestamptz, null::integer, null::timestamptz;
    return;
  end if;
  select * into v_access
  from public.post_adoption_questionnaire_public_accesses
  where token_hash = p_token_hash and revoked_at is null
  for update;
  if not found or v_now >= v_access.public_read_until then
    return query select 'unavailable'::text, null::uuid, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::jsonb, null::text, null::timestamptz,
      null::timestamptz, null::integer, null::timestamptz;
    return;
  end if;
  select * into v_instance
  from public.post_adoption_questionnaire_instances
  where organization_id = v_access.organization_id and id = v_access.instance_id;
  if not found or v_instance.status = 'suspended' then
    return query select 'unavailable'::text, null::uuid, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::jsonb, null::text, null::timestamptz,
      null::timestamptz, null::integer, null::timestamptz;
    return;
  end if;
  select * into v_definition
  from public.post_adoption_questionnaire_definitions
  where code = v_instance.questionnaire_code and version = v_instance.questionnaire_version;
  select nullif(btrim(animal.call_name), '') into v_animal_name
  from public.animals animal
  where animal.organization_id = v_instance.organization_id and animal.id = v_instance.animal_id;
  select revision_no, submitted_at into v_latest_revision, v_latest_submitted
  from public.post_adoption_questionnaire_response_revisions
  where organization_id = v_instance.organization_id and instance_id = v_instance.id
  order by revision_no desc limit 1;
  begin
    insert into public.post_adoption_questionnaire_public_sessions (
      organization_id, access_id, session_hash, created_at, expires_at
    ) values (
      v_access.organization_id, v_access.id, p_session_hash, v_now,
      least(v_now + interval '2 hours', v_access.public_read_until)
    ) returning * into v_session;
  exception when unique_violation then
    return query select 'unavailable'::text, null::uuid, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::jsonb, null::text, null::timestamptz,
      null::timestamptz, null::integer, null::timestamptz;
    return;
  end;
  return query select 'success'::text, v_session.id, v_session.created_at, v_session.expires_at,
    v_animal_name, v_definition.milestone, v_definition.title, v_definition.definition,
    v_instance.status, v_instance.response_deadline_at, v_access.public_read_until,
    v_latest_revision, v_latest_submitted;
end;
$fn$;

create or replace function public.read_post_adoption_questionnaire_public_session(
  p_session_hash text
)
returns table (
  outcome text,
  session_expires_at timestamptz,
  animal_name text,
  milestone text,
  questionnaire_title text,
  definition jsonb,
  instance_status text,
  response_deadline_at timestamptz,
  public_read_until timestamptz,
  latest_revision_no integer,
  latest_submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_session public.post_adoption_questionnaire_public_sessions%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_animal_name text;
  v_latest_revision integer;
  v_latest_submitted timestamptz;
  v_now timestamptz := statement_timestamp();
begin
  select * into v_session from public.post_adoption_questionnaire_public_sessions
  where session_hash = p_session_hash and invalidated_at is null;
  if not found or v_now >= v_session.expires_at then
    return query select 'unavailable'::text, null::timestamptz, null::text, null::text,
      null::text, null::jsonb, null::text, null::timestamptz, null::timestamptz,
      null::integer, null::timestamptz; return;
  end if;
  select * into v_access from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_session.organization_id and id = v_session.access_id and revoked_at is null;
  if not found or v_now >= v_access.public_read_until then
    return query select 'unavailable'::text, null::timestamptz, null::text, null::text,
      null::text, null::jsonb, null::text, null::timestamptz, null::timestamptz,
      null::integer, null::timestamptz; return;
  end if;
  select * into v_instance from public.post_adoption_questionnaire_instances
  where organization_id = v_access.organization_id and id = v_access.instance_id;
  if not found or v_instance.status = 'suspended' then
    return query select 'unavailable'::text, null::timestamptz, null::text, null::text,
      null::text, null::jsonb, null::text, null::timestamptz, null::timestamptz,
      null::integer, null::timestamptz; return;
  end if;
  select * into v_definition from public.post_adoption_questionnaire_definitions
  where code = v_instance.questionnaire_code and version = v_instance.questionnaire_version;
  select nullif(btrim(animal.call_name), '') into v_animal_name
  from public.animals animal where animal.organization_id = v_instance.organization_id and animal.id = v_instance.animal_id;
  select revision_no, submitted_at into v_latest_revision, v_latest_submitted
  from public.post_adoption_questionnaire_response_revisions
  where organization_id = v_instance.organization_id and instance_id = v_instance.id
  order by revision_no desc limit 1;
  return query select 'success'::text, v_session.expires_at, v_animal_name,
    v_definition.milestone, v_definition.title, v_definition.definition, v_instance.status,
    v_instance.response_deadline_at, v_access.public_read_until, v_latest_revision, v_latest_submitted;
end;
$fn$;

-- A public revision may supersede the current submitted or under-review version directly.
create or replace function public.apply_post_adoption_questionnaire_event_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_response_window interval;
begin
  if (new.from_status is null) <> (new.to_status is null) then
    raise exception 'questionnaire event must provide both transition states or neither' using errcode = '23514';
  end if;
  select * into v_instance from public.post_adoption_questionnaire_instances
  where organization_id = new.organization_id and id = new.instance_id for update;
  if v_instance.id is null then raise exception 'questionnaire event instance does not exist' using errcode = '23503'; end if;
  if not (
    (new.event_type = 'instance_created' and new.from_status is null and new.to_status is null and new.response_revision_no is null and v_instance.status = 'planned')
    or (new.event_type = 'became_due' and new.from_status = 'planned' and new.to_status = 'due' and new.response_revision_no is null)
    or (new.event_type = 'invitation_sent' and new.from_status = 'due' and new.to_status = 'invited' and new.response_revision_no is null)
    or (new.event_type = 'reminder_sent' and new.from_status is null and new.to_status is null and new.response_revision_no is null and v_instance.status in ('invited','in_progress'))
    or (new.event_type = 'draft_started' and new.from_status = 'invited' and new.to_status = 'in_progress' and new.response_revision_no is null)
    or (new.event_type = 'response_submitted' and new.from_status in ('invited','in_progress') and new.to_status = 'submitted' and new.response_revision_no is not null)
    or (new.event_type = 'revision_submitted' and new.from_status in ('in_progress','submitted','under_review') and new.to_status = 'submitted' and new.response_revision_no is not null)
    or (new.event_type = 'review_started' and new.from_status = 'submitted' and new.to_status = 'under_review' and new.response_revision_no is not null)
    or (new.event_type = 'changes_requested' and new.from_status in ('submitted','under_review') and new.to_status = 'in_progress' and new.response_revision_no is not null)
    or (new.event_type = 'validated' and new.from_status in ('submitted','under_review') and new.to_status = 'validated' and new.response_revision_no is not null)
    or (new.event_type = 'expired' and new.from_status in ('invited','in_progress') and new.to_status = 'expired' and new.response_revision_no is null)
    or (new.event_type = 'suspended' and new.from_status in ('planned','due','invited','in_progress','submitted','under_review') and new.to_status = 'suspended' and new.response_revision_no is null)
    or (new.event_type = 'resumed' and new.from_status = 'suspended' and new.to_status = v_instance.suspended_from_status)
  ) then raise exception 'questionnaire event type does not match its lifecycle transition' using errcode = '23514'; end if;
  if new.to_status is null then return new; end if;
  if v_instance.status <> new.from_status then raise exception 'questionnaire event transition is stale or inconsistent' using errcode = '40001'; end if;
  if not (
    (new.from_status = 'planned' and new.to_status in ('due','suspended'))
    or (new.from_status = 'due' and new.to_status in ('invited','suspended'))
    or (new.from_status = 'invited' and new.to_status in ('in_progress','submitted','expired','suspended'))
    or (new.from_status = 'in_progress' and new.to_status in ('submitted','expired','suspended'))
    or (new.from_status = 'submitted' and new.to_status in ('submitted','under_review','in_progress','validated','suspended'))
    or (new.from_status = 'under_review' and new.to_status in ('submitted','in_progress','validated','suspended'))
    or (new.from_status = 'suspended' and new.to_status in ('planned','due','invited','in_progress','submitted','under_review','expired'))
  ) then raise exception 'questionnaire event transition is not allowed' using errcode = '23514'; end if;
  if new.to_status in ('submitted','under_review','validated') and new.response_revision_no is null then
    raise exception 'questionnaire response revision is required for this transition' using errcode = '23514';
  end if;
  if new.to_status = 'suspended' and length(btrim(coalesce(new.details->>'reason',''))) = 0 then
    raise exception 'questionnaire suspension requires a reason' using errcode = '23514';
  end if;
  if new.to_status = 'validated' and (new.actor_kind <> 'member' or new.actor_profile_id is null) then
    raise exception 'questionnaire validation requires a member actor' using errcode = '23514';
  end if;
  select response_window into v_response_window from public.post_adoption_questionnaire_definitions
  where code = v_instance.questionnaire_code and version = v_instance.questionnaire_version;
  perform pg_catalog.set_config('app.post_adoption_event_transition', 'on', true);
  update public.post_adoption_questionnaire_instances
  set status = new.to_status,
      invited_at = case when new.to_status = 'invited' and v_instance.invited_at is null then new.occurred_at else v_instance.invited_at end,
      response_deadline_at = case when new.to_status = 'invited' and v_instance.invited_at is null then new.occurred_at + v_response_window else v_instance.response_deadline_at end,
      validated_response_revision_no = case when new.to_status = 'validated' then new.response_revision_no else null end,
      validated_at = case when new.to_status = 'validated' then new.occurred_at else null end,
      validated_by = case when new.to_status = 'validated' then new.actor_profile_id else null end,
      suspension_reason = case when new.to_status = 'suspended' then new.details->>'reason' else null end,
      suspended_from_status = case when new.to_status = 'suspended' then new.from_status else null end,
      updated_by = new.actor_profile_id
  where organization_id = new.organization_id and id = new.instance_id;
  return new;
end;
$fn$;

create or replace function public.submit_post_adoption_questionnaire_public_response(
  p_session_hash text,
  p_client_command_id uuid,
  p_payload_hash text,
  p_base_revision_no integer,
  p_answers jsonb,
  p_completion_started_at timestamptz default null,
  p_completion_duration_seconds integer default null
)
returns table (outcome text, revision_no integer, submitted_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_session public.post_adoption_questionnaire_public_sessions%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_command public.post_adoption_questionnaire_public_submission_commands%rowtype;
  v_definition_hash text;
  v_payload_hash text;
  v_current_revision integer;
  v_next_revision integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_client_command_id is null or p_base_revision_no is null or p_base_revision_no < 0
    or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
    or ((p_completion_started_at is null) <> (p_completion_duration_seconds is null))
    or p_completion_duration_seconds < 0
    or p_completion_duration_seconds > 7200 then
    return query select 'invalid'::text, null::integer, null::timestamptz, false; return;
  end if;
  v_payload_hash := encode(extensions.digest(convert_to(p_answers::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_session from public.post_adoption_questionnaire_public_sessions
  where session_hash = p_session_hash and invalidated_at is null;
  if not found or v_now >= v_session.expires_at then
    return query select 'unavailable'::text, null::integer, null::timestamptz, false; return;
  end if;
  select * into v_access from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_session.organization_id and id = v_session.access_id;
  if not found then
    return query select 'unavailable'::text, null::integer, null::timestamptz, false; return;
  end if;
  -- Internal rotation takes the instance lock before the access lock. Keep the
  -- same order here so a submission racing with replacement cannot deadlock.
  select * into v_instance from public.post_adoption_questionnaire_instances
  where organization_id = v_access.organization_id and id = v_access.instance_id for update;
  if not found then
    return query select 'unavailable'::text, null::integer, null::timestamptz, false; return;
  end if;
  select * into v_access from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_session.organization_id and id = v_session.access_id for update;
  if not found or v_access.revoked_at is not null or v_now >= v_access.public_read_until then
    return query select 'unavailable'::text, null::integer, null::timestamptz, false; return;
  end if;
  if v_instance.status = 'suspended' then
    return query select 'unavailable'::text, null::integer, null::timestamptz, false; return;
  end if;
  select * into v_command from public.post_adoption_questionnaire_public_submission_commands
  where organization_id = v_session.organization_id and session_id = v_session.id
    and client_command_id = p_client_command_id;
  if found then
    if v_command.payload_sha256 = v_payload_hash and v_command.base_revision_no = p_base_revision_no and v_command.outcome = 'success' then
      return query select 'success'::text, v_command.revision_no, v_command.completed_at, true; return;
    end if;
    return query select 'conflict'::text, v_command.revision_no, v_command.completed_at, true; return;
  end if;
  if v_instance.status in ('planned','due','validated','expired')
    or v_instance.response_deadline_at is null or v_now >= v_instance.response_deadline_at then
    return query select case when v_instance.status = 'validated' then 'validated' else 'expired' end,
      null::integer, null::timestamptz, false; return;
  end if;
  select coalesce(max(response.revision_no), 0) into v_current_revision
  from public.post_adoption_questionnaire_response_revisions response
  where response.organization_id = v_instance.organization_id and response.instance_id = v_instance.id;
  if v_current_revision <> p_base_revision_no then
    return query select 'conflict'::text, v_current_revision, null::timestamptz, false; return;
  end if;
  v_next_revision := v_current_revision + 1;
  select definition_sha256 into v_definition_hash from public.post_adoption_questionnaire_definitions
  where code = v_instance.questionnaire_code and version = v_instance.questionnaire_version;

  insert into public.post_adoption_questionnaire_response_revisions (
    organization_id, instance_id, revision_no, definition_sha256, answers,
    submitted_at, submission_source, supersedes_revision_no,
    completion_started_at, completion_duration_seconds
  ) values (
    v_instance.organization_id, v_instance.id, v_next_revision, v_definition_hash, p_answers,
    v_now, 'family', nullif(v_current_revision, 0),
    case
      when p_completion_started_at is null then null
      else least(p_completion_started_at, v_now)
    end,
    p_completion_duration_seconds
  );
  insert into public.post_adoption_questionnaire_events (
    organization_id, instance_id, event_type, from_status, to_status,
    response_revision_no, actor_kind, details, occurred_at
  ) values (
    v_instance.organization_id, v_instance.id,
    case when v_current_revision = 0 then 'response_submitted' else 'revision_submitted' end,
    v_instance.status, 'submitted', v_next_revision, 'family',
    jsonb_build_object('base_revision_no', v_current_revision), v_now
  );
  insert into public.post_adoption_questionnaire_public_submission_commands (
    organization_id, access_id, session_id, instance_id, client_command_id, payload_sha256,
    base_revision_no, revision_no, outcome, created_at, completed_at
  ) values (
    v_instance.organization_id, v_access.id, v_session.id, v_instance.id, p_client_command_id, v_payload_hash,
    p_base_revision_no, v_next_revision, 'success', v_now, v_now
  );
  return query select 'success'::text, v_next_revision, v_now, false;
end;
$fn$;

create or replace function public.read_post_adoption_questionnaire_public_submission_result(
  p_session_hash text,
  p_client_command_id uuid
)
returns table (outcome text, revision_no integer, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_session public.post_adoption_questionnaire_public_sessions%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_command public.post_adoption_questionnaire_public_submission_commands%rowtype;
begin
  select * into v_session from public.post_adoption_questionnaire_public_sessions
  where session_hash = p_session_hash and invalidated_at is null and expires_at > statement_timestamp();
  if not found then return query select 'unavailable'::text, null::integer, null::timestamptz; return; end if;
  select * into v_access from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_session.organization_id and id = v_session.access_id
    and revoked_at is null and statement_timestamp() < public_read_until;
  if not found then return query select 'unavailable'::text, null::integer, null::timestamptz; return; end if;
  select * into v_instance from public.post_adoption_questionnaire_instances
  where organization_id = v_access.organization_id and id = v_access.instance_id;
  if not found or v_instance.status = 'suspended' then
    return query select 'unavailable'::text, null::integer, null::timestamptz; return;
  end if;
  select * into v_command from public.post_adoption_questionnaire_public_submission_commands
  where organization_id = v_session.organization_id and session_id = v_session.id
    and client_command_id = p_client_command_id;
  if not found then return query select 'not_found'::text, null::integer, null::timestamptz; return; end if;
  return query select v_command.outcome, v_command.revision_no, v_command.completed_at;
end;
$fn$;

create or replace function public.list_post_adoption_questionnaire_public_access_summary(
  p_reservation_id uuid
)
returns table (
  instance_id uuid,
  questionnaire_code text,
  milestone text,
  instance_status text,
  due_at timestamptz,
  response_deadline_at timestamptz,
  access_id uuid,
  token_hint text,
  activated_at timestamptz,
  public_read_until timestamptz,
  revoked_at timestamptz,
  latest_revision_no integer,
  latest_submitted_at timestamptz,
  latest_answers jsonb,
  definition jsonb
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
  select
    instance.id,
    instance.questionnaire_code,
    definition.milestone,
    instance.status,
    instance.due_at,
    instance.response_deadline_at,
    access.id,
    access.token_hint,
    access.activated_at,
    access.public_read_until,
    access.revoked_at,
    revision.revision_no,
    revision.submitted_at,
    revision.answers,
    definition.definition
  from public.post_adoption_questionnaire_instances instance
  join public.post_adoption_questionnaire_definitions definition
    on definition.code = instance.questionnaire_code and definition.version = instance.questionnaire_version
  left join lateral (
    select candidate.* from public.post_adoption_questionnaire_public_accesses candidate
    where candidate.organization_id = instance.organization_id and candidate.instance_id = instance.id
    order by candidate.activated_at desc, candidate.id desc limit 1
  ) access on true
  left join lateral (
    select candidate.* from public.post_adoption_questionnaire_response_revisions candidate
    where candidate.organization_id = instance.organization_id and candidate.instance_id = instance.id
    order by candidate.revision_no desc limit 1
  ) revision on true
  where instance.reservation_id = p_reservation_id
    and public.is_member_of(instance.organization_id)
  order by definition.milestone;
$fn$;

create or replace function public.cleanup_post_adoption_questionnaire_public_sessions(
  p_batch_size integer default 500,
  p_retention interval default interval '90 days'
)
returns table (commands_deleted integer, sessions_deleted integer)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_limit integer := least(greatest(coalesce(p_batch_size, 500), 1), 500);
  v_retention interval := coalesce(p_retention, interval '90 days');
  v_session_ids uuid[];
  v_commands_deleted integer := 0;
  v_sessions_deleted integer := 0;
begin
  if v_retention < interval '1 day' then
    raise exception 'public questionnaire retention must be at least one day' using errcode = '22023';
  end if;

  select array_agg(candidate.id) into v_session_ids
  from (
    select candidate_session.id
    from public.post_adoption_questionnaire_public_sessions candidate_session
    where candidate_session.expires_at < statement_timestamp() - v_retention
    order by candidate_session.expires_at, candidate_session.id
    for update skip locked
    limit v_limit
  ) candidate;

  if coalesce(array_length(v_session_ids, 1), 0) = 0 then
    return query select 0, 0;
    return;
  end if;

  perform pg_catalog.set_config('app.post_adoption_public_cleanup', 'on', true);
  delete from public.post_adoption_questionnaire_public_submission_commands command
  where command.session_id = any(v_session_ids);
  get diagnostics v_commands_deleted = row_count;

  delete from public.post_adoption_questionnaire_public_sessions candidate_session
  where candidate_session.id = any(v_session_ids);
  get diagnostics v_sessions_deleted = row_count;

  return query select v_commands_deleted, v_sessions_deleted;
end;
$fn$;

revoke execute on function public.post_adoption_questionnaire_public_history_immutable() from public, anon, authenticated;
revoke execute on function public.allow_post_adoption_questionnaire_public_request(text,integer,integer) from public, anon, authenticated;
revoke execute on function public.create_or_rotate_post_adoption_questionnaire_public_access(uuid,text,text) from public, anon;
revoke execute on function public.revoke_post_adoption_questionnaire_public_access(uuid) from public, anon;
revoke execute on function public.exchange_post_adoption_questionnaire_public_token(text,text) from public, anon, authenticated;
revoke execute on function public.read_post_adoption_questionnaire_public_session(text) from public, anon, authenticated;
revoke execute on function public.submit_post_adoption_questionnaire_public_response(text,uuid,text,integer,jsonb,timestamptz,integer) from public, anon, authenticated;
revoke execute on function public.read_post_adoption_questionnaire_public_submission_result(text,uuid) from public, anon, authenticated;
revoke execute on function public.list_post_adoption_questionnaire_public_access_summary(uuid) from public, anon;
revoke execute on function public.cleanup_post_adoption_questionnaire_public_sessions(integer,interval) from public, anon, authenticated;

grant execute on function public.create_or_rotate_post_adoption_questionnaire_public_access(uuid,text,text) to authenticated;
grant execute on function public.revoke_post_adoption_questionnaire_public_access(uuid) to authenticated;
grant execute on function public.list_post_adoption_questionnaire_public_access_summary(uuid) to authenticated;
grant execute on function public.allow_post_adoption_questionnaire_public_request(text,integer,integer) to service_role;
grant execute on function public.exchange_post_adoption_questionnaire_public_token(text,text) to service_role;
grant execute on function public.read_post_adoption_questionnaire_public_session(text) to service_role;
grant execute on function public.submit_post_adoption_questionnaire_public_response(text,uuid,text,integer,jsonb,timestamptz,integer) to service_role;
grant execute on function public.read_post_adoption_questionnaire_public_submission_result(text,uuid) to service_role;
grant execute on function public.cleanup_post_adoption_questionnaire_public_sessions(integer,interval) to service_role;

commit;

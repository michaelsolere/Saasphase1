-- CALENDAR-FEED-01 — private revocable iCalendar subscription feeds

create table public.organization_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  token_hash text not null,
  token_hint text not null,
  include_litter_care boolean not null default true,
  include_reproductive_cycle boolean not null default true,
  include_adopter_appointment boolean not null default true,
  revision_no integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  constraint organization_calendar_feeds_token_hash_format_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint organization_calendar_feeds_token_hint_check
    check (char_length(token_hint) between 4 and 16),
  constraint organization_calendar_feeds_at_least_one_source_check
    check (
      include_litter_care
      or include_reproductive_cycle
      or include_adopter_appointment
    ),
  constraint organization_calendar_feeds_revision_positive_check
    check (revision_no > 0),
  constraint organization_calendar_feeds_revocation_check
    check (
      (revoked_at is null and revoked_by is null)
      or (revoked_at is not null and revoked_by is not null)
    )
);

create unique index organization_calendar_feeds_token_hash_uidx
  on public.organization_calendar_feeds (token_hash);

create unique index organization_calendar_feeds_one_active_per_org_uidx
  on public.organization_calendar_feeds (organization_id)
  where revoked_at is null;

create index organization_calendar_feeds_organization_history_idx
  on public.organization_calendar_feeds (organization_id, created_at desc);

create trigger organization_calendar_feeds_set_updated_at
before update on public.organization_calendar_feeds
for each row execute function public.set_updated_at();

alter table public.organization_calendar_feeds enable row level security;

revoke all on table public.organization_calendar_feeds from public;
revoke all on table public.organization_calendar_feeds from anon;
revoke all on table public.organization_calendar_feeds from authenticated;

grant select on table public.organization_calendar_feeds to authenticated;
grant select on table public.organization_calendar_feeds to service_role;

-- Privileged feed route reads org-scoped calendar sources after token hash resolution.
grant select on table public.litter_care_tasks to service_role;
grant select on table public.litters to service_role;
grant select on table public.reproductive_cycles to service_role;
grant select on table public.animals to service_role;
grant select on table public.events to service_role;
grant select on table public.reservations to service_role;
grant select on table public.contacts to service_role;

create policy organization_calendar_feeds_select_owner_admin
on public.organization_calendar_feeds
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner', 'admin']
  )
);

-- No insert/update/delete policies: writes go through SECURITY DEFINER RPCs only.

create or replace function public.create_or_rotate_organization_calendar_feed(
  p_token_hash text,
  p_token_hint text,
  p_include_litter_care boolean,
  p_include_reproductive_cycle boolean,
  p_include_adopter_appointment boolean
)
returns table (
  outcome text,
  reason text,
  feed_id uuid,
  organization_id uuid,
  token_hint text,
  include_litter_care boolean,
  include_reproductive_cycle boolean,
  include_adopter_appointment boolean,
  revision_no integer,
  created_at timestamptz,
  updated_at timestamptz,
  revoked_at timestamptz
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
  v_active public.organization_calendar_feeds%rowtype;
  v_feed public.organization_calendar_feeds%rowtype;
  v_hint text;
begin
  outcome := 'error';
  reason := null;
  feed_id := null;
  organization_id := null;
  token_hint := null;
  include_litter_care := null;
  include_reproductive_cycle := null;
  include_adopter_appointment := null;
  revision_no := null;
  created_at := null;
  updated_at := null;
  revoked_at := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_hint is null
    or char_length(btrim(p_token_hint)) < 4
    or char_length(btrim(p_token_hint)) > 16
    or p_include_litter_care is null
    or p_include_reproductive_cycle is null
    or p_include_adopter_appointment is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not (
    p_include_litter_care
    or p_include_reproductive_cycle
    or p_include_adopter_appointment
  ) then
    reason := 'no_sources_selected';
    return next;
    return;
  end if;

  select membership.organization_id, membership.role
  into v_organization_id, v_membership_role
  from public.memberships membership
  where membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  order by membership.created_at asc
  limit 1
  for share;

  if not found then
    reason := 'organization_unavailable';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin') then
    reason := 'forbidden';
    return next;
    return;
  end if;

  select *
  into v_active
  from public.organization_calendar_feeds feed
  where feed.organization_id = v_organization_id
    and feed.revoked_at is null
  for update;

  if found then
    update public.organization_calendar_feeds as feed
    set
      revoked_at = statement_timestamp(),
      revoked_by = v_user_id,
      updated_by = v_user_id
    where feed.id = v_active.id
      and feed.organization_id = v_organization_id
      and feed.revoked_at is null;
  end if;

  v_hint := btrim(p_token_hint);

  insert into public.organization_calendar_feeds (
    organization_id,
    token_hash,
    token_hint,
    include_litter_care,
    include_reproductive_cycle,
    include_adopter_appointment,
    revision_no,
    created_by,
    updated_by
  )
  values (
    v_organization_id,
    lower(p_token_hash),
    v_hint,
    p_include_litter_care,
    p_include_reproductive_cycle,
    p_include_adopter_appointment,
    1,
    v_user_id,
    v_user_id
  )
  returning * into v_feed;

  outcome := 'success';
  reason := null;
  feed_id := v_feed.id;
  organization_id := v_feed.organization_id;
  token_hint := v_feed.token_hint;
  include_litter_care := v_feed.include_litter_care;
  include_reproductive_cycle := v_feed.include_reproductive_cycle;
  include_adopter_appointment := v_feed.include_adopter_appointment;
  revision_no := v_feed.revision_no;
  created_at := v_feed.created_at;
  updated_at := v_feed.updated_at;
  revoked_at := v_feed.revoked_at;
  return next;
exception
  when unique_violation then
    outcome := 'error';
    reason := 'conflict';
    feed_id := null;
    organization_id := null;
    token_hint := null;
    include_litter_care := null;
    include_reproductive_cycle := null;
    include_adopter_appointment := null;
    revision_no := null;
    created_at := null;
    updated_at := null;
    revoked_at := null;
    return next;
end;
$$;

create or replace function public.update_organization_calendar_feed_sources(
  p_feed_id uuid,
  p_expected_revision_no integer,
  p_include_litter_care boolean,
  p_include_reproductive_cycle boolean,
  p_include_adopter_appointment boolean
)
returns table (
  outcome text,
  reason text,
  feed_id uuid,
  organization_id uuid,
  token_hint text,
  include_litter_care boolean,
  include_reproductive_cycle boolean,
  include_adopter_appointment boolean,
  revision_no integer,
  created_at timestamptz,
  updated_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_role text;
  v_feed public.organization_calendar_feeds%rowtype;
begin
  outcome := 'error';
  reason := null;
  feed_id := p_feed_id;
  organization_id := null;
  token_hint := null;
  include_litter_care := null;
  include_reproductive_cycle := null;
  include_adopter_appointment := null;
  revision_no := null;
  created_at := null;
  updated_at := null;
  revoked_at := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_feed_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no <= 0
    or p_include_litter_care is null
    or p_include_reproductive_cycle is null
    or p_include_adopter_appointment is null
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  if not (
    p_include_litter_care
    or p_include_reproductive_cycle
    or p_include_adopter_appointment
  ) then
    reason := 'no_sources_selected';
    return next;
    return;
  end if;

  select *
  into v_feed
  from public.organization_calendar_feeds feed
  where feed.id = p_feed_id
  for update;

  if not found then
    reason := 'feed_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_feed.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found or v_membership_role not in ('owner', 'admin') then
    reason := 'forbidden';
    return next;
    return;
  end if;

  if v_feed.revoked_at is not null then
    reason := 'feed_revoked';
    organization_id := v_feed.organization_id;
    token_hint := v_feed.token_hint;
    include_litter_care := v_feed.include_litter_care;
    include_reproductive_cycle := v_feed.include_reproductive_cycle;
    include_adopter_appointment := v_feed.include_adopter_appointment;
    revision_no := v_feed.revision_no;
    created_at := v_feed.created_at;
    updated_at := v_feed.updated_at;
    revoked_at := v_feed.revoked_at;
    return next;
    return;
  end if;

  if v_feed.revision_no is distinct from p_expected_revision_no then
    reason := 'stale_revision';
    organization_id := v_feed.organization_id;
    token_hint := v_feed.token_hint;
    include_litter_care := v_feed.include_litter_care;
    include_reproductive_cycle := v_feed.include_reproductive_cycle;
    include_adopter_appointment := v_feed.include_adopter_appointment;
    revision_no := v_feed.revision_no;
    created_at := v_feed.created_at;
    updated_at := v_feed.updated_at;
    revoked_at := v_feed.revoked_at;
    return next;
    return;
  end if;

  update public.organization_calendar_feeds as feed
  set
    include_litter_care = p_include_litter_care,
    include_reproductive_cycle = p_include_reproductive_cycle,
    include_adopter_appointment = p_include_adopter_appointment,
    revision_no = feed.revision_no + 1,
    updated_by = v_user_id
  where feed.id = v_feed.id
    and feed.organization_id = v_feed.organization_id
    and feed.revoked_at is null
  returning feed.* into v_feed;

  if not found then
    reason := 'feed_revoked';
    return next;
    return;
  end if;

  outcome := 'success';
  reason := null;
  feed_id := v_feed.id;
  organization_id := v_feed.organization_id;
  token_hint := v_feed.token_hint;
  include_litter_care := v_feed.include_litter_care;
  include_reproductive_cycle := v_feed.include_reproductive_cycle;
  include_adopter_appointment := v_feed.include_adopter_appointment;
  revision_no := v_feed.revision_no;
  created_at := v_feed.created_at;
  updated_at := v_feed.updated_at;
  revoked_at := v_feed.revoked_at;
  return next;
end;
$$;

create or replace function public.revoke_organization_calendar_feed(
  p_feed_id uuid,
  p_expected_revision_no integer
)
returns table (
  outcome text,
  reason text,
  feed_id uuid,
  organization_id uuid,
  token_hint text,
  include_litter_care boolean,
  include_reproductive_cycle boolean,
  include_adopter_appointment boolean,
  revision_no integer,
  created_at timestamptz,
  updated_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_role text;
  v_feed public.organization_calendar_feeds%rowtype;
begin
  outcome := 'error';
  reason := null;
  feed_id := p_feed_id;
  organization_id := null;
  token_hint := null;
  include_litter_care := null;
  include_reproductive_cycle := null;
  include_adopter_appointment := null;
  revision_no := null;
  created_at := null;
  updated_at := null;
  revoked_at := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_feed_id is null
    or p_expected_revision_no is null
    or p_expected_revision_no <= 0
  then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select *
  into v_feed
  from public.organization_calendar_feeds feed
  where feed.id = p_feed_id
  for update;

  if not found then
    reason := 'feed_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_feed.organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found or v_membership_role not in ('owner', 'admin') then
    reason := 'forbidden';
    return next;
    return;
  end if;

  if v_feed.revoked_at is not null then
    outcome := 'success';
    reason := 'already_revoked';
    organization_id := v_feed.organization_id;
    token_hint := v_feed.token_hint;
    include_litter_care := v_feed.include_litter_care;
    include_reproductive_cycle := v_feed.include_reproductive_cycle;
    include_adopter_appointment := v_feed.include_adopter_appointment;
    revision_no := v_feed.revision_no;
    created_at := v_feed.created_at;
    updated_at := v_feed.updated_at;
    revoked_at := v_feed.revoked_at;
    return next;
    return;
  end if;

  if v_feed.revision_no is distinct from p_expected_revision_no then
    reason := 'stale_revision';
    organization_id := v_feed.organization_id;
    token_hint := v_feed.token_hint;
    include_litter_care := v_feed.include_litter_care;
    include_reproductive_cycle := v_feed.include_reproductive_cycle;
    include_adopter_appointment := v_feed.include_adopter_appointment;
    revision_no := v_feed.revision_no;
    created_at := v_feed.created_at;
    updated_at := v_feed.updated_at;
    revoked_at := v_feed.revoked_at;
    return next;
    return;
  end if;

  update public.organization_calendar_feeds as feed
  set
    revoked_at = statement_timestamp(),
    revoked_by = v_user_id,
    updated_by = v_user_id
  where feed.id = v_feed.id
    and feed.organization_id = v_feed.organization_id
    and feed.revoked_at is null
  returning feed.* into v_feed;

  if not found then
    outcome := 'success';
    reason := 'already_revoked';
    return next;
    return;
  end if;

  outcome := 'success';
  reason := null;
  feed_id := v_feed.id;
  organization_id := v_feed.organization_id;
  token_hint := v_feed.token_hint;
  include_litter_care := v_feed.include_litter_care;
  include_reproductive_cycle := v_feed.include_reproductive_cycle;
  include_adopter_appointment := v_feed.include_adopter_appointment;
  revision_no := v_feed.revision_no;
  created_at := v_feed.created_at;
  updated_at := v_feed.updated_at;
  revoked_at := v_feed.revoked_at;
  return next;
end;
$$;

revoke all on function public.create_or_rotate_organization_calendar_feed(
  text, text, boolean, boolean, boolean
) from public;
revoke all on function public.create_or_rotate_organization_calendar_feed(
  text, text, boolean, boolean, boolean
) from anon;
grant execute on function public.create_or_rotate_organization_calendar_feed(
  text, text, boolean, boolean, boolean
) to authenticated;

revoke all on function public.update_organization_calendar_feed_sources(
  uuid, integer, boolean, boolean, boolean
) from public;
revoke all on function public.update_organization_calendar_feed_sources(
  uuid, integer, boolean, boolean, boolean
) from anon;
grant execute on function public.update_organization_calendar_feed_sources(
  uuid, integer, boolean, boolean, boolean
) to authenticated;

revoke all on function public.revoke_organization_calendar_feed(
  uuid, integer
) from public;
revoke all on function public.revoke_organization_calendar_feed(
  uuid, integer
) from anon;
grant execute on function public.revoke_organization_calendar_feed(
  uuid, integer
) to authenticated;

comment on table public.organization_calendar_feeds is
  'Private revocable iCalendar feed secrets (hashed) and source selections per organization.';
comment on function public.create_or_rotate_organization_calendar_feed(
  text, text, boolean, boolean, boolean
) is
  'Creates or rotates the active organization calendar feed; raw token never reaches PostgreSQL.';
comment on function public.update_organization_calendar_feed_sources(
  uuid, integer, boolean, boolean, boolean
) is
  'Updates active calendar feed sources with optimistic concurrency; token unchanged.';
comment on function public.revoke_organization_calendar_feed(
  uuid, integer
) is
  'Revokes the active calendar feed immediately; idempotent when already revoked.';

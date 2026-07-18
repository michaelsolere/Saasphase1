create table public.litter_care_task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  description text,
  category text not null,
  target_scope text not null,
  anchor_type text not null,
  offset_days integer not null,
  species text not null,
  breed text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint litter_care_task_templates_organization_id_id_key
    unique (organization_id, id),
  constraint litter_care_task_templates_title_check
    check (char_length(btrim(title)) between 1 and 255),
  constraint litter_care_task_templates_description_check
    check (description is null or char_length(description) <= 5000),
  constraint litter_care_task_templates_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    )),
  constraint litter_care_task_templates_target_scope_check
    check (target_scope in ('mother', 'litter', 'all_offspring', 'organization')),
  constraint litter_care_task_templates_anchor_type_check
    check (anchor_type in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
      'offspring_age'
    )),
  constraint litter_care_task_templates_species_check
    check (species in ('dog', 'cat'))
);

create index litter_care_task_templates_active_org_species_order_idx
  on public.litter_care_task_templates (
    organization_id,
    species,
    sort_order,
    title
  )
  where is_active;

create trigger litter_care_task_templates_set_updated_at
before update on public.litter_care_task_templates
for each row execute function public.set_updated_at();

create table public.litter_care_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  source text not null,
  organization_template_id uuid,
  system_template_code text,
  occurrence_no integer not null default 1,
  category text not null,
  target_scope text not null,
  title text not null,
  description text,
  anchor_type text,
  anchor_date date,
  offset_days integer,
  planned_for date not null,
  status text not null default 'planned',
  creation_command_id uuid not null,
  resolution_command_id uuid,
  resolved_at timestamptz,
  resolved_timezone_name text,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint litter_care_tasks_organization_id_id_key
    unique (organization_id, id),
  constraint litter_care_tasks_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint litter_care_tasks_organization_template_organization_fk
    foreign key (organization_id, organization_template_id)
    references public.litter_care_task_templates (organization_id, id) on delete restrict,
  constraint litter_care_tasks_creation_command_key
    unique (organization_id, creation_command_id),
  constraint litter_care_tasks_occurrence_no_check
    check (occurrence_no > 0),
  constraint litter_care_tasks_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    )),
  constraint litter_care_tasks_target_scope_check
    check (target_scope in ('mother', 'litter', 'all_offspring', 'organization')),
  constraint litter_care_tasks_title_check
    check (char_length(btrim(title)) between 1 and 255),
  constraint litter_care_tasks_description_check
    check (description is null or char_length(description) <= 5000),
  constraint litter_care_tasks_source_check
    check (source in ('manual', 'system_template', 'organization_template')),
  constraint litter_care_tasks_system_template_code_check
    check (
      system_template_code is null
      or system_template_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_care_tasks_anchor_type_check
    check (
      anchor_type is null
      or anchor_type in (
        'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
        'offspring_age'
      )
    ),
  constraint litter_care_tasks_source_values_check
    check (
      (
        source = 'manual'
        and organization_template_id is null
        and system_template_code is null
        and anchor_type is null
        and anchor_date is null
        and offset_days is null
      )
      or (
        source = 'organization_template'
        and organization_template_id is not null
        and system_template_code is null
        and anchor_type is not null
        and anchor_date is not null
        and offset_days is not null
      )
      or (
        source = 'system_template'
        and organization_template_id is null
        and system_template_code is not null
        and anchor_type is not null
        and anchor_date is not null
        and offset_days is not null
      )
    ),
  constraint litter_care_tasks_status_check
    check (status in ('planned', 'done', 'cancelled', 'not_applicable')),
  constraint litter_care_tasks_resolution_values_check
    check (
      (
        status = 'planned'
        and resolution_command_id is null
        and resolved_at is null
        and resolved_timezone_name is null
        and resolved_by is null
        and resolution_note is null
      )
      or (
        status in ('done', 'cancelled', 'not_applicable')
        and resolution_command_id is not null
        and resolved_at is not null
        and resolved_timezone_name is not null
        and resolved_by is not null
      )
    ),
  constraint litter_care_tasks_resolution_note_check
    check (resolution_note is null or char_length(resolution_note) <= 5000)
);

create unique index litter_care_tasks_template_occurrence_key
  on public.litter_care_tasks (
    organization_id,
    litter_id,
    organization_template_id,
    occurrence_no
  )
  where organization_template_id is not null;

create unique index litter_care_tasks_system_template_occurrence_key
  on public.litter_care_tasks (
    organization_id,
    litter_id,
    system_template_code,
    occurrence_no
  )
  where system_template_code is not null;

create unique index litter_care_tasks_resolution_command_key
  on public.litter_care_tasks (organization_id, resolution_command_id)
  where resolution_command_id is not null;

create index litter_care_tasks_litter_status_planned_for_idx
  on public.litter_care_tasks (
    organization_id,
    litter_id,
    status,
    planned_for,
    created_at
  );

create trigger litter_care_tasks_set_updated_at
before update on public.litter_care_tasks
for each row execute function public.set_updated_at();

create or replace function public.validate_litter_care_task_litter_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_litter_status text;
begin
  select litter.status
  into v_litter_status
  from public.litters litter
  where litter.organization_id = new.organization_id
    and litter.id = new.litter_id
    and litter.deleted_at is null
  for share;

  if not found or v_litter_status not in (
    'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed',
    'birth_expected', 'birth_in_progress', 'born', 'puppies_created',
    'choice_period', 'ready_to_leave'
  ) then
    raise exception 'litter care task litter must be active and not deleted'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_care_tasks_validate_litter_on_insert
before insert on public.litter_care_tasks
for each row execute function public.validate_litter_care_task_litter_on_insert();

alter table public.litter_care_task_templates enable row level security;
alter table public.litter_care_tasks enable row level security;

create policy litter_care_task_templates_select_member
on public.litter_care_task_templates
for select
to authenticated
using (public.is_member_of(organization_id));

create policy litter_care_tasks_select_member
on public.litter_care_tasks
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.create_litter_care_task(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_category text,
  p_target_scope text,
  p_title text,
  p_description text,
  p_planned_for date
)
returns table (
  outcome text,
  task_id uuid,
  litter_id uuid,
  status text,
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
  v_existing_task public.litter_care_tasks%rowtype;
begin
  outcome := 'error';
  task_id := null;
  litter_id := p_litter_id;
  status := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_category is null
    or p_target_scope is null
    or p_title is null
    or p_planned_for is null
    or char_length(btrim(p_title)) not between 1 and 255
    or (p_description is not null and char_length(p_description) > 5000) then
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
      v_litter_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_existing_task
  from public.litter_care_tasks task
  where task.organization_id = v_litter_organization_id
    and task.creation_command_id = p_client_command_id;

  if found then
    if v_existing_task.litter_id <> p_litter_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    task_id := v_existing_task.id;
    litter_id := v_existing_task.litter_id;
    status := v_existing_task.status;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_litter
  from public.litters litter
  where litter.organization_id = v_litter_organization_id
    and litter.id = p_litter_id
    and litter.deleted_at is null
  for share;

  if not found then
    reason := 'litter_not_found';
    return next;
    return;
  end if;

  if v_litter.status not in (
    'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed',
    'birth_expected', 'birth_in_progress', 'born', 'puppies_created',
    'choice_period', 'ready_to_leave'
  ) then
    reason := 'litter_not_open';
    return next;
    return;
  end if;

  if p_category not in (
    'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
    'offspring_weight', 'offspring_health', 'offspring_feeding',
    'socialization', 'veterinary', 'identification', 'vaccination', 'other'
  ) then
    reason := 'invalid_category';
    return next;
    return;
  end if;

  if p_target_scope not in ('mother', 'litter', 'all_offspring', 'organization') then
    reason := 'invalid_target_scope';
    return next;
    return;
  end if;

  insert into public.litter_care_tasks (
    organization_id,
    litter_id,
    source,
    organization_template_id,
    system_template_code,
    occurrence_no,
    category,
    target_scope,
    title,
    description,
    anchor_type,
    anchor_date,
    offset_days,
    planned_for,
    status,
    creation_command_id,
    created_by,
    updated_by
  ) values (
    v_litter.organization_id,
    v_litter.id,
    'manual',
    null,
    null,
    1,
    p_category,
    p_target_scope,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    null,
    null,
    null,
    p_planned_for,
    'planned',
    p_client_command_id,
    v_user_id,
    v_user_id
  )
  returning litter_care_tasks.id, litter_care_tasks.status into task_id, status;

  outcome := 'success';
  litter_id := v_litter.id;
  return next;
end;
$$;

create or replace function public.resolve_litter_care_task(
  p_task_id uuid,
  p_client_command_id uuid,
  p_resolution_status text,
  p_resolved_at timestamptz,
  p_timezone_name text,
  p_resolution_note text
)
returns table (
  outcome text,
  task_id uuid,
  litter_id uuid,
  status text,
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
  v_task_organization_id uuid;
  v_membership_role text;
  v_task public.litter_care_tasks%rowtype;
  v_replayed_task public.litter_care_tasks%rowtype;
begin
  outcome := 'error';
  task_id := p_task_id;
  litter_id := null;
  status := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_task_id is null
    or p_client_command_id is null
    or p_resolution_status is null
    or p_resolved_at is null
    or p_timezone_name is null
    or (p_resolution_note is not null and char_length(p_resolution_note) > 5000) then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select task.organization_id
  into v_task_organization_id
  from public.litter_care_tasks task
  where task.id = p_task_id;

  if not found then
    reason := 'task_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_task_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'task_not_found';
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
      v_task_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_replayed_task
  from public.litter_care_tasks task
  where task.organization_id = v_task_organization_id
    and task.resolution_command_id = p_client_command_id;

  if found then
    if v_replayed_task.id <> p_task_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    task_id := v_replayed_task.id;
    litter_id := v_replayed_task.litter_id;
    status := v_replayed_task.status;
    replayed := true;
    return next;
    return;
  end if;

  select *
  into v_task
  from public.litter_care_tasks task
  where task.organization_id = v_task_organization_id
    and task.id = p_task_id
  for update;

  if not found then
    reason := 'task_not_found';
    return next;
    return;
  end if;

  if v_task.status <> 'planned' then
    reason := 'task_not_planned';
    return next;
    return;
  end if;

  if p_resolution_status not in ('done', 'cancelled', 'not_applicable') then
    reason := 'invalid_resolution_status';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone
    where timezone.name = p_timezone_name
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  update public.litter_care_tasks
  set
    status = p_resolution_status,
    resolution_command_id = p_client_command_id,
    resolved_at = p_resolved_at,
    resolved_timezone_name = p_timezone_name,
    resolved_by = v_user_id,
    resolution_note = nullif(btrim(p_resolution_note), ''),
    updated_by = v_user_id
  where id = v_task.id
  returning
    litter_care_tasks.id,
    litter_care_tasks.litter_id,
    litter_care_tasks.status
  into task_id, litter_id, status;

  outcome := 'success';
  return next;
end;
$$;

revoke all on table public.litter_care_task_templates from anon, authenticated;
grant select on table public.litter_care_task_templates to authenticated;

revoke all on table public.litter_care_tasks from anon, authenticated;
grant select on table public.litter_care_tasks to authenticated;

revoke all on function public.validate_litter_care_task_litter_on_insert() from public;

revoke all on function public.create_litter_care_task(
  uuid, uuid, text, text, text, text, date
) from public;
grant execute on function public.create_litter_care_task(
  uuid, uuid, text, text, text, text, date
) to authenticated;

revoke all on function public.resolve_litter_care_task(
  uuid, uuid, text, timestamptz, text, text
) from public;
grant execute on function public.resolve_litter_care_task(
  uuid, uuid, text, timestamptz, text, text
) to authenticated;

comment on table public.litter_care_task_templates is
  'Organization-owned milestone rules. Editing a template never changes task snapshots.';

comment on table public.litter_care_tasks is
  'Historical litter care tasks. Authenticated mutations are limited to the dedicated RPCs.';

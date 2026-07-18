alter table public.litter_care_task_templates
  add column revision integer not null default 1,
  add constraint litter_care_task_templates_revision_check
    check (revision > 0),
  add constraint litter_care_task_templates_breed_check
    check (
      breed is null
      or char_length(btrim(breed)) between 1 and 255
    ),
  add constraint litter_care_task_templates_offspring_age_offset_check
    check (anchor_type <> 'offspring_age' or offset_days >= 0);

create table public.litter_care_task_template_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  template_id uuid not null,
  operation text not null,
  result_revision integer not null,
  result_is_active boolean not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_care_task_template_commands_organization_command_key
    unique (organization_id, client_command_id),
  constraint litter_care_task_template_commands_template_organization_fk
    foreign key (organization_id, template_id)
    references public.litter_care_task_templates (organization_id, id) on delete restrict,
  constraint litter_care_task_template_commands_operation_check
    check (operation in ('create', 'update', 'set_active')),
  constraint litter_care_task_template_commands_result_revision_check
    check (result_revision > 0)
);

create index litter_care_task_template_commands_template_created_at_idx
  on public.litter_care_task_template_commands (
    organization_id,
    template_id,
    created_at
  );

alter table public.litter_care_task_template_commands enable row level security;

create or replace function public.create_litter_care_task_template(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_target_scope text,
  p_anchor_type text,
  p_offset_days integer,
  p_species text,
  p_breed text,
  p_sort_order integer
)
returns table (
  outcome text,
  template_id uuid,
  revision integer,
  is_active boolean,
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
  v_membership_role text;
  v_existing_command public.litter_care_task_template_commands%rowtype;
begin
  outcome := 'error';
  template_id := null;
  revision := null;
  is_active := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_organization_id is null
    or p_client_command_id is null
    or p_title is null
    or p_category is null
    or p_target_scope is null
    or p_anchor_type is null
    or p_offset_days is null
    or p_species is null
    or p_sort_order is null
    or char_length(btrim(p_title)) not between 1 and 255
    or (p_description is not null and char_length(btrim(p_description)) > 5000)
    or (
      p_breed is not null
      and char_length(btrim(p_breed)) not between 1 and 255
    )
    or p_category not in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    )
    or p_target_scope not in ('mother', 'litter', 'all_offspring', 'organization')
    or p_anchor_type not in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
      'offspring_age'
    )
    or (p_anchor_type = 'offspring_age' and p_offset_days < 0)
    or p_species not in ('dog', 'cat') then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform 1
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.deleted_at is null;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = p_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_template_commands:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_care_task_template_commands command
  where command.organization_id = p_organization_id
    and command.client_command_id = p_client_command_id;

  if found then
    if v_existing_command.operation <> 'create' then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    template_id := v_existing_command.template_id;
    revision := v_existing_command.result_revision;
    is_active := v_existing_command.result_is_active;
    replayed := true;
    return next;
    return;
  end if;

  insert into public.litter_care_task_templates (
    organization_id,
    title,
    description,
    category,
    target_scope,
    anchor_type,
    offset_days,
    species,
    breed,
    is_active,
    sort_order,
    revision,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    p_category,
    p_target_scope,
    p_anchor_type,
    p_offset_days,
    p_species,
    case when p_breed is null then null else btrim(p_breed) end,
    true,
    p_sort_order,
    1,
    v_user_id,
    v_user_id
  )
  returning litter_care_task_templates.id,
    litter_care_task_templates.revision,
    litter_care_task_templates.is_active
  into template_id, revision, is_active;

  insert into public.litter_care_task_template_commands (
    organization_id,
    client_command_id,
    template_id,
    operation,
    result_revision,
    result_is_active,
    created_by
  ) values (
    p_organization_id,
    p_client_command_id,
    template_id,
    'create',
    revision,
    is_active,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

create or replace function public.update_litter_care_task_template(
  p_template_id uuid,
  p_client_command_id uuid,
  p_expected_revision integer,
  p_title text,
  p_description text,
  p_category text,
  p_target_scope text,
  p_anchor_type text,
  p_offset_days integer,
  p_species text,
  p_breed text,
  p_sort_order integer
)
returns table (
  outcome text,
  template_id uuid,
  revision integer,
  is_active boolean,
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
  v_template_organization_id uuid;
  v_membership_role text;
  v_existing_command public.litter_care_task_template_commands%rowtype;
  v_template public.litter_care_task_templates%rowtype;
begin
  outcome := 'error';
  template_id := p_template_id;
  revision := null;
  is_active := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_template_id is null
    or p_client_command_id is null
    or p_expected_revision is null
    or p_expected_revision <= 0
    or p_title is null
    or p_category is null
    or p_target_scope is null
    or p_anchor_type is null
    or p_offset_days is null
    or p_species is null
    or p_sort_order is null
    or char_length(btrim(p_title)) not between 1 and 255
    or (p_description is not null and char_length(btrim(p_description)) > 5000)
    or (
      p_breed is not null
      and char_length(btrim(p_breed)) not between 1 and 255
    )
    or p_category not in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    )
    or p_target_scope not in ('mother', 'litter', 'all_offspring', 'organization')
    or p_anchor_type not in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
      'offspring_age'
    )
    or (p_anchor_type = 'offspring_age' and p_offset_days < 0)
    or p_species not in ('dog', 'cat') then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select template.organization_id
  into v_template_organization_id
  from public.litter_care_task_templates template
  where template.id = p_template_id;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_template_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_template_commands:'
        || v_template_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_care_task_template_commands command
  where command.organization_id = v_template_organization_id
    and command.client_command_id = p_client_command_id;

  if found then
    if v_existing_command.operation <> 'update'
      or v_existing_command.template_id <> p_template_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    template_id := v_existing_command.template_id;
    revision := v_existing_command.result_revision;
    is_active := v_existing_command.result_is_active;
    replayed := true;
    return next;
    return;
  end if;

  select template.*
  into v_template
  from public.litter_care_task_templates template
  where template.organization_id = v_template_organization_id
    and template.id = p_template_id
  for update;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  if v_template.revision <> p_expected_revision then
    reason := 'stale_revision';
    return next;
    return;
  end if;

  update public.litter_care_task_templates
  set
    title = btrim(p_title),
    description = nullif(btrim(p_description), ''),
    category = p_category,
    target_scope = p_target_scope,
    anchor_type = p_anchor_type,
    offset_days = p_offset_days,
    species = p_species,
    breed = case when p_breed is null then null else btrim(p_breed) end,
    sort_order = p_sort_order,
    revision = litter_care_task_templates.revision + 1,
    updated_by = v_user_id
  where id = v_template.id
  returning litter_care_task_templates.revision,
    litter_care_task_templates.is_active
  into revision, is_active;

  insert into public.litter_care_task_template_commands (
    organization_id,
    client_command_id,
    template_id,
    operation,
    result_revision,
    result_is_active,
    created_by
  ) values (
    v_template_organization_id,
    p_client_command_id,
    p_template_id,
    'update',
    revision,
    is_active,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

create or replace function public.set_litter_care_task_template_active(
  p_template_id uuid,
  p_client_command_id uuid,
  p_expected_revision integer,
  p_is_active boolean
)
returns table (
  outcome text,
  template_id uuid,
  revision integer,
  is_active boolean,
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
  v_template_organization_id uuid;
  v_membership_role text;
  v_existing_command public.litter_care_task_template_commands%rowtype;
  v_template public.litter_care_task_templates%rowtype;
begin
  outcome := 'error';
  template_id := p_template_id;
  revision := null;
  is_active := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_template_id is null
    or p_client_command_id is null
    or p_expected_revision is null
    or p_expected_revision <= 0
    or p_is_active is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select template.organization_id
  into v_template_organization_id
  from public.litter_care_task_templates template
  where template.id = p_template_id;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  select membership.role
  into v_membership_role
  from public.memberships membership
  where membership.organization_id = v_template_organization_id
    and membership.profile_id = v_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for share;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  if v_membership_role not in ('owner', 'admin') then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_template_commands:'
        || v_template_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_care_task_template_commands command
  where command.organization_id = v_template_organization_id
    and command.client_command_id = p_client_command_id;

  if found then
    if v_existing_command.operation <> 'set_active'
      or v_existing_command.template_id <> p_template_id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    template_id := v_existing_command.template_id;
    revision := v_existing_command.result_revision;
    is_active := v_existing_command.result_is_active;
    replayed := true;
    return next;
    return;
  end if;

  select template.*
  into v_template
  from public.litter_care_task_templates template
  where template.organization_id = v_template_organization_id
    and template.id = p_template_id
  for update;

  if not found then
    reason := 'template_not_found';
    return next;
    return;
  end if;

  if v_template.revision <> p_expected_revision then
    reason := 'stale_revision';
    return next;
    return;
  end if;

  if v_template.is_active is distinct from p_is_active then
    update public.litter_care_task_templates
    set
      is_active = p_is_active,
      revision = litter_care_task_templates.revision + 1,
      updated_by = v_user_id
    where id = v_template.id
    returning litter_care_task_templates.revision,
      litter_care_task_templates.is_active
    into revision, is_active;
  else
    revision := v_template.revision;
    is_active := v_template.is_active;
  end if;

  insert into public.litter_care_task_template_commands (
    organization_id,
    client_command_id,
    template_id,
    operation,
    result_revision,
    result_is_active,
    created_by
  ) values (
    v_template_organization_id,
    p_client_command_id,
    p_template_id,
    'set_active',
    revision,
    is_active,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on table public.litter_care_task_template_commands from anon, authenticated;

revoke all on function public.create_litter_care_task_template(
  uuid, uuid, text, text, text, text, text, integer, text, text, integer
) from public;
grant execute on function public.create_litter_care_task_template(
  uuid, uuid, text, text, text, text, text, integer, text, text, integer
) to authenticated;

revoke all on function public.update_litter_care_task_template(
  uuid, uuid, integer, text, text, text, text, text, integer, text, text, integer
) from public;
grant execute on function public.update_litter_care_task_template(
  uuid, uuid, integer, text, text, text, text, text, integer, text, text, integer
) to authenticated;

revoke all on function public.set_litter_care_task_template_active(
  uuid, uuid, integer, boolean
) from public;
grant execute on function public.set_litter_care_task_template_active(
  uuid, uuid, integer, boolean
) to authenticated;

comment on table public.litter_care_task_template_commands is
  'Private idempotency registry for organization litter care task template mutations.';

comment on column public.litter_care_task_templates.revision is
  'Positive optimistic-lock revision incremented by business mutations.';

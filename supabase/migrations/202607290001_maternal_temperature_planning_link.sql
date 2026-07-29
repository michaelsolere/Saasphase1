-- MATERNAL-TEMPERATURE-PLANNING-LINK-01
-- Explicitly links a newly recorded maternal temperature fact to at most one
-- compatible recurring planning occurrence. Existing rows remain inert.

begin;

-- ---------------------------------------------------------------------------
-- 1. Structured completion fact identity and immutable propagation
-- ---------------------------------------------------------------------------
alter table public.litter_planning_model_library_items
  add column if not exists completion_fact_kind text;

alter table public.litter_planning_model_items
  add column if not exists completion_fact_kind text;

alter table public.litter_plan_items
  add column if not exists completion_fact_kind text;

alter table public.litter_planning_model_library_items
  add constraint litter_planning_model_library_items_completion_fact_kind_check
  check (
    completion_fact_kind is null
    or completion_fact_kind = 'maternal_temperature_observation'
  );

alter table public.litter_planning_model_items
  add constraint litter_planning_model_items_completion_fact_kind_check
  check (
    completion_fact_kind is null
    or completion_fact_kind = 'maternal_temperature_observation'
  );

alter table public.litter_plan_items
  add constraint litter_plan_items_completion_fact_kind_check
  check (
    completion_fact_kind is null
    or (
      completion_fact_kind = 'maternal_temperature_observation'
      and item_kind = 'recurring_task'
      and category = 'maternal_health'
      and target_scope = 'mother'
      and origin_kind = 'planning_model'
    )
  );

comment on column public.litter_planning_model_library_items.completion_fact_kind is
  'Nullable explicit fact identity allowed to complete an occurrence. V1: maternal_temperature_observation.';
comment on column public.litter_planning_model_items.completion_fact_kind is
  'Nullable explicit fact identity copied from a global item or configured on a custom recurring item.';
comment on column public.litter_plan_items.completion_fact_kind is
  'Immutable completion fact identity snapshot. Ad-hoc plan items always remain null.';

create or replace function public.validate_litter_planning_library_completion_fact_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_category text;
  v_target_scope text;
begin
  if new.completion_fact_kind is null then
    return new;
  end if;

  select template.category, template.target_scope
  into v_category, v_target_scope
  from public.litter_care_task_library_templates template
  where template.code = new.library_template_code
    and template.version = new.library_template_version;

  if new.completion_fact_kind <> 'maternal_temperature_observation'
    or new.item_kind <> 'recurring_task'
    or v_category is distinct from 'maternal_health'
    or v_target_scope is distinct from 'mother'
  then
    raise exception 'incompatible planning completion fact kind'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_planning_library_completion_fact_kind_validate
before insert or update of completion_fact_kind, item_kind,
  library_template_code, library_template_version
on public.litter_planning_model_library_items
for each row execute function public.validate_litter_planning_library_completion_fact_kind();

create or replace function public.validate_planning_model_completion_fact_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_library_model_code text;
  v_library_model_version integer;
  v_category text;
  v_target_scope text;
begin
  if tg_op = 'INSERT' then
    select model.library_model_code, model.library_model_version
    into v_library_model_code, v_library_model_version
    from public.litter_planning_models model
    where model.organization_id = new.organization_id
      and model.id = new.model_id;

    if v_library_model_code is not null and v_library_model_version is not null then
      select library_item.completion_fact_kind
      into new.completion_fact_kind
      from public.litter_planning_model_library_items library_item
      where library_item.library_model_code = v_library_model_code
        and library_item.library_model_version = v_library_model_version
        and library_item.display_order = new.display_order;
    end if;
  end if;

  if new.completion_fact_kind is null then
    return new;
  end if;

  select template.category, template.target_scope
  into v_category, v_target_scope
  from public.litter_care_task_templates template
  where template.organization_id = new.organization_id
    and template.id = new.organization_template_id;

  if new.completion_fact_kind <> 'maternal_temperature_observation'
    or new.item_kind <> 'recurring_task'
    or v_category is distinct from 'maternal_health'
    or v_target_scope is distinct from 'mother'
  then
    raise exception 'incompatible planning completion fact kind'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_planning_model_completion_fact_kind_propagate_validate
before insert or update of completion_fact_kind, item_kind,
  organization_template_id, display_order
on public.litter_planning_model_items
for each row execute function public.validate_planning_model_completion_fact_kind();

create or replace function public.propagate_litter_plan_completion_fact_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' then
    if new.completion_fact_kind is distinct from old.completion_fact_kind then
      raise exception 'litter plan completion fact snapshot is immutable'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.origin_kind = 'ad_hoc' then
    new.completion_fact_kind := null;
    return new;
  end if;

  if new.source_model_item_id is not null then
    select model_item.completion_fact_kind
    into new.completion_fact_kind
    from public.litter_planning_model_items model_item
    where model_item.organization_id = new.organization_id
      and model_item.id = new.source_model_item_id;
  end if;

  return new;
end;
$$;

create trigger litter_plan_completion_fact_kind_snapshot
before insert or update of completion_fact_kind
on public.litter_plan_items
for each row execute function public.propagate_litter_plan_completion_fact_kind();

-- Keep the existing comprehensive item-shape validator and wrap it with the
-- new optional completionFactKind contract.
alter function public.assert_litter_planning_model_items(uuid, text, text, jsonb)
  rename to assert_litter_planning_model_items_without_completion_fact_kind;

create or replace function public.assert_litter_planning_model_items(
  p_organization_id uuid,
  p_species text,
  p_breed text,
  p_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_item jsonb;
  v_items_without_completion jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if v_item ? 'completionFactKind'
      and jsonb_typeof(v_item -> 'completionFactKind') not in ('null', 'string')
    then
      return false;
    end if;

    if nullif(v_item ->> 'completionFactKind', '') is not null then
      if v_item ->> 'completionFactKind' <> 'maternal_temperature_observation'
        or v_item ->> 'itemKind' <> 'recurring_task'
        or not exists (
          select 1
          from public.litter_care_task_templates template
          where template.organization_id = p_organization_id
            and template.id = (v_item ->> 'organizationTemplateId')::uuid
            and template.category = 'maternal_health'
            and template.target_scope = 'mother'
        )
      then
        return false;
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(entry.value - 'completionFactKind' order by entry.position), '[]'::jsonb)
  into v_items_without_completion
  from jsonb_array_elements(p_items) with ordinality entry(value, position);

  return public.assert_litter_planning_model_items_without_completion_fact_kind(
    p_organization_id,
    p_species,
    p_breed,
    v_items_without_completion
  );
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- The existing mutation RPC remains authoritative for permissions, revisions,
-- replacement and idempotence. These wrappers persist the newly validated
-- field after the base mutation, in the same transaction.
create or replace function public.create_litter_planning_model(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_title text,
  p_description text,
  p_species text,
  p_breed text,
  p_is_active boolean,
  p_items jsonb
)
returns table (
  outcome text,
  model_id uuid,
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
  v_result record;
begin
  select *
  into v_result
  from public.mutate_litter_planning_model(
    'create', null, p_organization_id, p_client_command_id, null,
    p_title, p_description, p_species, p_breed, p_is_active, p_items
  );

  if v_result.outcome = 'success' then
    update public.litter_planning_model_items model_item
    set completion_fact_kind = nullif(item.value ->> 'completionFactKind', '')
    from jsonb_array_elements(p_items) item(value)
    where model_item.model_id = v_result.model_id
      and model_item.display_order = (item.value ->> 'displayOrder')::integer;
  end if;

  return query select
    v_result.outcome,
    v_result.model_id,
    v_result.revision,
    v_result.is_active,
    v_result.replayed,
    v_result.reason;
end;
$$;

create or replace function public.replace_litter_planning_model(
  p_model_id uuid,
  p_client_command_id uuid,
  p_expected_revision integer,
  p_title text,
  p_description text,
  p_species text,
  p_breed text,
  p_items jsonb
)
returns table (
  outcome text,
  model_id uuid,
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
  v_result record;
begin
  select *
  into v_result
  from public.mutate_litter_planning_model(
    'replace', p_model_id, null, p_client_command_id, p_expected_revision,
    p_title, p_description, p_species, p_breed, null, p_items
  );

  if v_result.outcome = 'success' then
    update public.litter_planning_model_items model_item
    set completion_fact_kind = nullif(item.value ->> 'completionFactKind', '')
    from jsonb_array_elements(p_items) item(value)
    where model_item.model_id = v_result.model_id
      and model_item.display_order = (item.value ->> 'displayOrder')::integer;
  end if;

  return query select
    v_result.outcome,
    v_result.model_id,
    v_result.revision,
    v_result.is_active,
    v_result.replayed,
    v_result.reason;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Durable append-only fact-to-task relation and exact command replay
-- ---------------------------------------------------------------------------
alter table public.maternal_observations
  add constraint maternal_observations_org_litter_id_key
  unique (organization_id, litter_id, id);

alter table public.litter_care_tasks
  add constraint litter_care_tasks_org_litter_id_key
  unique (organization_id, litter_id, id);

alter table public.litter_care_tasks
  add constraint litter_care_tasks_org_litter_id_resolution_key
  unique (organization_id, litter_id, id, resolution_command_id);

create table public.maternal_observation_task_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  maternal_observation_id uuid not null,
  litter_care_task_id uuid not null,
  resolution_command_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint maternal_observation_task_links_org_id_key
    unique (organization_id, id),
  constraint maternal_observation_task_links_observation_key
    unique (organization_id, maternal_observation_id),
  constraint maternal_observation_task_links_task_key
    unique (organization_id, litter_care_task_id),
  constraint maternal_observation_task_links_observation_fk
    foreign key (organization_id, litter_id, maternal_observation_id)
    references public.maternal_observations (organization_id, litter_id, id)
    on delete restrict,
  constraint maternal_observation_task_links_task_fk
    foreign key (
      organization_id, litter_id, litter_care_task_id, resolution_command_id
    )
    references public.litter_care_tasks (
      organization_id, litter_id, id, resolution_command_id
    )
    on delete restrict
);

create index maternal_observation_task_links_litter_idx
  on public.maternal_observation_task_links (organization_id, litter_id, created_at desc);

create table public.maternal_observation_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_id uuid not null,
  client_command_id uuid not null,
  payload jsonb not null,
  maternal_observation_id uuid not null,
  match_status text not null,
  litter_care_task_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint maternal_observation_commands_org_id_key
    unique (organization_id, id),
  constraint maternal_observation_commands_org_client_key
    unique (organization_id, client_command_id),
  constraint maternal_observation_commands_observation_fk
    foreign key (organization_id, litter_id, maternal_observation_id)
    references public.maternal_observations (organization_id, litter_id, id)
    on delete restrict,
  constraint maternal_observation_commands_task_fk
    foreign key (organization_id, litter_id, litter_care_task_id)
    references public.litter_care_tasks (organization_id, litter_id, id)
    on delete restrict,
  constraint maternal_observation_commands_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint maternal_observation_commands_match_status_check
    check (match_status in ('linked', 'no_candidate', 'ambiguous', 'not_applicable')),
  constraint maternal_observation_commands_match_shape_check
    check (
      (match_status = 'linked' and litter_care_task_id is not null)
      or (match_status <> 'linked' and litter_care_task_id is null)
    )
);

create or replace function public.prevent_maternal_planning_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'maternal planning audit rows are append-only'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger maternal_observation_task_links_append_only
before update or delete on public.maternal_observation_task_links
for each row execute function public.prevent_maternal_planning_audit_mutation();

create trigger maternal_observation_commands_append_only
before update or delete on public.maternal_observation_commands
for each row execute function public.prevent_maternal_planning_audit_mutation();

alter table public.maternal_observation_task_links enable row level security;
alter table public.maternal_observation_commands enable row level security;

create policy maternal_observation_task_links_select_member
on public.maternal_observation_task_links
for select
to authenticated
using (public.is_member_of(organization_id));

revoke all on table public.maternal_observation_task_links from anon, authenticated;
grant select on table public.maternal_observation_task_links to authenticated;
revoke all on table public.maternal_observation_commands from anon, authenticated;

comment on table public.maternal_observation_task_links is
  'Append-only, one-to-one durable relation between a real maternal observation and the recurring task it completed.';
comment on table public.maternal_observation_commands is
  'Private append-only command registry preserving the exact observation and planning-match result for idempotent replay.';

-- ---------------------------------------------------------------------------
-- 3. Atomic observation recording and optional unambiguous task completion
-- ---------------------------------------------------------------------------
drop function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
);

create or replace function public.record_maternal_observation(
  p_litter_id uuid,
  p_client_command_id uuid,
  p_observed_at timestamptz,
  p_timezone_name text,
  p_observation_type text,
  p_numeric_value numeric,
  p_unit text,
  p_severity text,
  p_note text
)
returns table (
  outcome text,
  observation_id uuid,
  litter_id uuid,
  mother_id uuid,
  match_status text,
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
  v_mother public.animals%rowtype;
  v_existing_observation public.maternal_observations%rowtype;
  v_command public.maternal_observation_commands%rowtype;
  v_payload jsonb;
  v_normalized_note text := nullif(btrim(p_note), '');
  v_candidate_ids uuid[];
  v_candidate_count integer;
  v_task_id uuid;
  v_resolution_command_id uuid;
  v_resolution record;
  v_candidate_still_valid boolean;
begin
  outcome := 'error';
  observation_id := null;
  litter_id := p_litter_id;
  mother_id := null;
  match_status := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_litter_id is null
    or p_client_command_id is null
    or p_observed_at is null
    or p_timezone_name is null
    or p_observation_type is null
    or p_severity is null
    or (p_note is not null and char_length(p_note) > 5000)
  then
    reason := 'invalid_input';
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

  if p_observation_type not in (
    'temperature', 'appetite', 'behavior', 'discharge',
    'contractions', 'lactation', 'health', 'other'
  ) then
    reason := 'invalid_observation_type';
    return next;
    return;
  end if;

  if p_severity not in ('routine', 'watch', 'concern', 'urgent') then
    reason := 'invalid_severity';
    return next;
    return;
  end if;

  if not public.is_iana_timezone(p_timezone_name) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  if p_observation_type = 'temperature' then
    if p_numeric_value is null
      or p_numeric_value <= 0
      or p_unit is null
      or p_unit not in ('celsius', 'fahrenheit')
    then
      reason := 'invalid_temperature';
      return next;
      return;
    end if;
  elsif p_numeric_value is not null
    or p_unit is not null
    or v_normalized_note is null
  then
    reason := 'invalid_observation_values';
    return next;
    return;
  end if;

  v_payload := jsonb_build_object(
    'litterId', p_litter_id,
    'observedAt', p_observed_at,
    'timezoneName', p_timezone_name,
    'observationType', p_observation_type,
    'numericValue', p_numeric_value,
    'unit', p_unit,
    'severity', p_severity,
    'note', v_normalized_note
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'maternal_observation_command:' || v_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_command
  from public.maternal_observation_commands command
  where command.organization_id = v_organization_id
    and command.client_command_id = p_client_command_id;

  if found then
    if v_command.payload <> v_payload then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    select observation.mother_id
    into mother_id
    from public.maternal_observations observation
    where observation.organization_id = v_organization_id
      and observation.id = v_command.maternal_observation_id;

    outcome := 'success';
    observation_id := v_command.maternal_observation_id;
    litter_id := v_command.litter_id;
    match_status := v_command.match_status;
    replayed := true;
    return next;
    return;
  end if;

  -- Backward-compatible replay for an observation recorded before this command
  -- registry existed. It must never trigger retroactive matching.
  select *
  into v_existing_observation
  from public.maternal_observations observation
  where observation.organization_id = v_organization_id
    and observation.client_command_id = p_client_command_id;

  if found then
    if v_existing_observation.litter_id <> p_litter_id
      or v_existing_observation.observed_at <> p_observed_at
      or v_existing_observation.timezone_name <> p_timezone_name
      or v_existing_observation.observation_type <> p_observation_type
      or v_existing_observation.numeric_value is distinct from p_numeric_value
      or v_existing_observation.unit is distinct from p_unit
      or v_existing_observation.severity <> p_severity
      or v_existing_observation.note is distinct from v_normalized_note
    then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    observation_id := v_existing_observation.id;
    litter_id := v_existing_observation.litter_id;
    mother_id := v_existing_observation.mother_id;
    match_status := case
      when p_observation_type = 'temperature' then 'no_candidate'
      else 'not_applicable'
    end;

    insert into public.maternal_observation_commands (
      organization_id, litter_id, client_command_id, payload,
      maternal_observation_id, match_status, created_by
    ) values (
      v_organization_id, litter_id, p_client_command_id, v_payload,
      observation_id, match_status, v_user_id
    );

    outcome := 'success';
    replayed := true;
    return next;
    return;
  end if;

  select *
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

  select *
  into v_mother
  from public.animals animal
  where animal.organization_id = v_litter.organization_id
    and animal.id = v_litter.mother_id
    and animal.deleted_at is null
  for update;

  if not found or v_mother.sex <> 'female' then
    reason := 'mother_ineligible';
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

  insert into public.maternal_observations (
    organization_id, litter_id, mother_id, observation_type, observed_at,
    timezone_name, numeric_value, unit, severity, note, client_command_id,
    created_by, updated_by
  ) values (
    v_organization_id, v_litter.id, v_mother.id, p_observation_type, p_observed_at,
    p_timezone_name, p_numeric_value, p_unit, p_severity, v_normalized_note,
    p_client_command_id, v_user_id, v_user_id
  )
  returning id into observation_id;

  litter_id := v_litter.id;
  mother_id := v_mother.id;

  if p_observation_type <> 'temperature' then
    match_status := 'not_applicable';
  else
    -- Stronger than a day-scoped lock: serialize all temperature matching for
    -- this litter so two observations cannot consume the same occurrence.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'maternal_temperature_match:' || v_organization_id::text || ':' || v_litter.id::text,
        0
      )
    );

    with candidates as (
      select
        task.id,
        abs(extract(epoch from (
          (p_observed_at at time zone task.schedule_timezone_name)::time
          - task.scheduled_local_time
        ))) as distance_seconds
      from public.litter_care_tasks task
      join public.litter_plan_series series
        on series.organization_id = task.organization_id
       and series.litter_id = task.litter_id
       and series.id = task.litter_plan_series_id
      join public.litter_plan_items plan_item
        on plan_item.organization_id = task.organization_id
       and plan_item.litter_id = task.litter_id
       and plan_item.id = task.litter_plan_item_id
      where task.organization_id = v_organization_id
        and task.litter_id = v_litter.id
        and task.status = 'planned'
        and task.item_kind = 'recurring_task'
        and task.litter_plan_series_id is not null
        and series.state = 'active'
        and plan_item.completion_fact_kind = 'maternal_temperature_observation'
        and task.planned_for = (p_observed_at at time zone task.schedule_timezone_name)::date
        and task.scheduled_local_time is not null
        and task.schedule_timezone_name is not null
        and public.is_iana_timezone(task.schedule_timezone_name)
        and not exists (
          select 1
          from public.maternal_observation_task_links link
          where link.organization_id = task.organization_id
            and link.litter_care_task_id = task.id
        )
    ),
    nearest as (
      select candidate.id
      from candidates candidate
      where candidate.distance_seconds = (
        select min(other.distance_seconds) from candidates other
      )
    )
    select array_agg(nearest.id), count(*)
    into v_candidate_ids, v_candidate_count
    from nearest;

    if coalesce(v_candidate_count, 0) = 0 then
      match_status := 'no_candidate';
    elsif v_candidate_count > 1 then
      match_status := 'ambiguous';
    else
      v_task_id := v_candidate_ids[1];

      select true
      into v_candidate_still_valid
      from public.litter_care_tasks task
      join public.litter_plan_series series
        on series.organization_id = task.organization_id
       and series.litter_id = task.litter_id
       and series.id = task.litter_plan_series_id
      join public.litter_plan_items plan_item
        on plan_item.organization_id = task.organization_id
       and plan_item.litter_id = task.litter_id
       and plan_item.id = task.litter_plan_item_id
      where task.organization_id = v_organization_id
        and task.litter_id = v_litter.id
        and task.id = v_task_id
        and task.status = 'planned'
        and task.item_kind = 'recurring_task'
        and series.state = 'active'
        and plan_item.completion_fact_kind = 'maternal_temperature_observation'
        and task.planned_for = (p_observed_at at time zone task.schedule_timezone_name)::date
        and task.scheduled_local_time is not null
        and public.is_iana_timezone(task.schedule_timezone_name)
      for update of task, series;

      if not found then
        match_status := 'no_candidate';
        v_task_id := null;
      else
        v_resolution_command_id := gen_random_uuid();
        select *
        into v_resolution
        from public.resolve_litter_care_task(
          v_task_id,
          v_resolution_command_id,
          'done',
          p_observed_at,
          p_timezone_name,
          'Action satisfaite automatiquement par une température maternelle enregistrée dans le Journal.'
        );

        if v_resolution.outcome = 'success' and not v_resolution.replayed then
          insert into public.maternal_observation_task_links (
            organization_id, litter_id, maternal_observation_id,
            litter_care_task_id, resolution_command_id, created_by
          ) values (
            v_organization_id, v_litter.id, observation_id,
            v_task_id, v_resolution_command_id, v_user_id
          );
          match_status := 'linked';
        elsif v_resolution.reason = 'task_not_planned' then
          match_status := 'no_candidate';
          v_task_id := null;
        else
          raise exception 'maternal temperature task resolution failed: %',
            coalesce(v_resolution.reason, 'unknown');
        end if;
      end if;
    end if;
  end if;

  insert into public.maternal_observation_commands (
    organization_id, litter_id, client_command_id, payload,
    maternal_observation_id, match_status, litter_care_task_id, created_by
  ) values (
    v_organization_id, v_litter.id, p_client_command_id, v_payload,
    observation_id, match_status,
    case when match_status = 'linked' then v_task_id else null end,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

revoke all on function public.validate_litter_planning_library_completion_fact_kind() from public;
revoke all on function public.validate_planning_model_completion_fact_kind() from public;
revoke all on function public.propagate_litter_plan_completion_fact_kind() from public;
revoke all on function public.assert_litter_planning_model_items_without_completion_fact_kind(uuid, text, text, jsonb) from public;
revoke all on function public.assert_litter_planning_model_items(uuid, text, text, jsonb) from public;
revoke all on function public.prevent_maternal_planning_audit_mutation() from public;

revoke all on function public.create_litter_planning_model(
  uuid, uuid, text, text, text, text, boolean, jsonb
) from public;
grant execute on function public.create_litter_planning_model(
  uuid, uuid, text, text, text, text, boolean, jsonb
) to authenticated;

revoke all on function public.replace_litter_planning_model(
  uuid, uuid, integer, text, text, text, text, jsonb
) from public;
grant execute on function public.replace_litter_planning_model(
  uuid, uuid, integer, text, text, text, text, jsonb
) to authenticated;

revoke all on function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
) from public;
grant execute on function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
) to authenticated;

comment on function public.record_maternal_observation(
  uuid, uuid, timestamptz, text, text, numeric, text, text, text
) is
  'Atomically records one maternal observation and optionally completes one explicitly compatible recurring task, with exact replay.';

commit;

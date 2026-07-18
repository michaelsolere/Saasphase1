create table public.litter_care_task_library_packs (
  code text primary key,
  title text not null,
  description text,
  species text not null,
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint litter_care_task_library_packs_code_check
    check (
      char_length(code) between 1 and 100
      and code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_care_task_library_packs_title_check
    check (char_length(btrim(title)) between 1 and 255),
  constraint litter_care_task_library_packs_description_check
    check (description is null or char_length(description) <= 5000),
  constraint litter_care_task_library_packs_species_check
    check (species in ('dog', 'cat')),
  constraint litter_care_task_library_packs_code_species_key
    unique (code, species)
);

create index litter_care_task_library_packs_available_order_idx
  on public.litter_care_task_library_packs (species, sort_order, code)
  where is_available;

create table public.litter_care_task_library_templates (
  code text not null,
  version integer not null,
  pack_code text not null,
  title text not null,
  description text,
  category text not null,
  target_scope text not null,
  anchor_type text not null,
  offset_days integer not null,
  species text not null,
  breed text,
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (code, version),
  constraint litter_care_task_library_templates_pack_species_fk
    foreign key (pack_code, species)
    references public.litter_care_task_library_packs (code, species)
    on update restrict on delete restrict,
  constraint litter_care_task_library_templates_code_check
    check (
      char_length(code) between 1 and 100
      and code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_care_task_library_templates_version_check
    check (version > 0),
  constraint litter_care_task_library_templates_title_check
    check (char_length(btrim(title)) between 1 and 255),
  constraint litter_care_task_library_templates_description_check
    check (description is null or char_length(description) <= 5000),
  constraint litter_care_task_library_templates_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    )),
  constraint litter_care_task_library_templates_target_scope_check
    check (target_scope in ('mother', 'litter', 'all_offspring', 'organization')),
  constraint litter_care_task_library_templates_anchor_type_check
    check (anchor_type in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth',
      'offspring_age'
    )),
  constraint litter_care_task_library_templates_species_check
    check (species in ('dog', 'cat')),
  constraint litter_care_task_library_templates_breed_check
    check (
      breed is null
      or char_length(btrim(breed)) between 1 and 255
    ),
  constraint litter_care_task_library_templates_offspring_age_offset_check
    check (anchor_type <> 'offspring_age' or offset_days >= 0)
);

create unique index litter_care_task_library_templates_available_code_key
  on public.litter_care_task_library_templates (code)
  where is_available;

create index litter_care_task_library_templates_pack_order_idx
  on public.litter_care_task_library_templates (
    pack_code,
    sort_order,
    code,
    version desc
  );

alter table public.litter_care_task_templates
  add column library_template_code text,
  add column library_template_version integer,
  add constraint litter_care_task_templates_library_origin_values_check
    check (
      (library_template_code is null and library_template_version is null)
      or (
        library_template_code is not null
        and library_template_version is not null
        and library_template_version > 0
      )
    ),
  add constraint litter_care_task_templates_library_origin_fk
    foreign key (library_template_code, library_template_version)
    references public.litter_care_task_library_templates (code, version)
    on update restrict on delete restrict;

create unique index litter_care_task_templates_library_origin_key
  on public.litter_care_task_templates (
    organization_id,
    library_template_code,
    library_template_version
  )
  where library_template_code is not null;

create or replace function public.protect_litter_care_task_template_library_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if old.library_template_code is distinct from new.library_template_code
    or old.library_template_version is distinct from new.library_template_version then
    raise exception 'litter care task template library origin is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_care_task_templates_protect_library_origin
before update of library_template_code, library_template_version
on public.litter_care_task_templates
for each row execute function public.protect_litter_care_task_template_library_origin();

create table public.litter_care_task_library_import_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_command_id uuid not null,
  selection jsonb not null,
  initial_is_active boolean not null,
  imported_count integer not null,
  already_imported_count integer not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint litter_care_task_library_import_commands_org_command_key
    unique (organization_id, client_command_id),
  constraint litter_care_task_library_import_commands_selection_check
    check (jsonb_typeof(selection) = 'array'),
  constraint litter_care_task_library_import_commands_counts_check
    check (imported_count >= 0 and already_imported_count >= 0),
  constraint litter_care_task_library_import_commands_result_check
    check (jsonb_typeof(result) = 'array')
);

create index litter_care_task_library_import_commands_org_created_at_idx
  on public.litter_care_task_library_import_commands (
    organization_id,
    created_at
  );

alter table public.litter_care_task_library_packs enable row level security;
alter table public.litter_care_task_library_templates enable row level security;
alter table public.litter_care_task_library_import_commands enable row level security;

create policy litter_care_task_library_packs_select_authenticated
on public.litter_care_task_library_packs
for select
to authenticated
using (true);

create policy litter_care_task_library_templates_select_authenticated
on public.litter_care_task_library_templates
for select
to authenticated
using (true);

create or replace function public.import_litter_care_task_library_templates(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_selection jsonb,
  p_is_active boolean
)
returns table (
  outcome text,
  imported_count integer,
  already_imported_count integer,
  result jsonb,
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
  v_existing_command public.litter_care_task_library_import_commands%rowtype;
  v_selection_item jsonb;
  v_selection_count integer;
  v_distinct_selection_count integer;
  v_key_count integer;
  v_library_template public.litter_care_task_library_templates%rowtype;
  v_organization_template_id uuid;
begin
  outcome := 'error';
  imported_count := 0;
  already_imported_count := 0;
  result := '[]'::jsonb;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_organization_id is null
    or p_client_command_id is null
    or p_selection is null
    or p_is_active is null
    or jsonb_typeof(p_selection) <> 'array' then
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
      'litter_care_task_library_import_commands:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_care_task_library_import_commands command
  where command.organization_id = p_organization_id
    and command.client_command_id = p_client_command_id
  for update;

  if found then
    if v_existing_command.selection <> p_selection
      or v_existing_command.initial_is_active is distinct from p_is_active then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    outcome := 'success';
    imported_count := v_existing_command.imported_count;
    already_imported_count := v_existing_command.already_imported_count;
    result := v_existing_command.result;
    replayed := true;
    return next;
    return;
  end if;

  select count(*)
  into v_selection_count
  from jsonb_array_elements(p_selection);

  if v_selection_count not between 1 and 30 then
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  for v_selection_item in
    select item.value
    from jsonb_array_elements(p_selection) with ordinality item(value, position)
    order by item.position
  loop
    if jsonb_typeof(v_selection_item) <> 'object' then
      reason := 'invalid_selection';
      return next;
      return;
    end if;

    select count(*)
    into v_key_count
    from jsonb_object_keys(v_selection_item);

    if v_key_count <> 2
      or not (v_selection_item ? 'code')
      or not (v_selection_item ? 'version')
      or jsonb_typeof(v_selection_item -> 'code') <> 'string'
      or jsonb_typeof(v_selection_item -> 'version') <> 'number'
      or char_length(v_selection_item ->> 'code') not between 1 and 100
      or (v_selection_item ->> 'code') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or (v_selection_item ->> 'version') !~ '^[1-9][0-9]*$'
      or (v_selection_item ->> 'version')::numeric > 2147483647 then
      reason := 'invalid_selection';
      return next;
      return;
    end if;
  end loop;

  select count(distinct concat_ws(
    ':',
    item.value ->> 'code',
    item.value ->> 'version'
  ))
  into v_distinct_selection_count
  from jsonb_array_elements(p_selection) item(value);

  if v_distinct_selection_count <> v_selection_count then
    reason := 'invalid_selection';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'litter_care_task_library_imports:' || p_organization_id::text,
      0
    )
  );

  perform library_template.code
  from public.litter_care_task_library_templates library_template
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  join jsonb_array_elements(p_selection) item(value)
    on library_template.code = item.value ->> 'code'
   and library_template.version = (item.value ->> 'version')::integer
  where library_template.is_available
    and pack.is_available
  order by library_template.code, library_template.version
  for share of library_template, pack;

  if (
    select count(*)
    from public.litter_care_task_library_templates library_template
    join public.litter_care_task_library_packs pack
      on pack.code = library_template.pack_code
     and pack.species = library_template.species
    join jsonb_array_elements(p_selection) item(value)
      on library_template.code = item.value ->> 'code'
     and library_template.version = (item.value ->> 'version')::integer
    where library_template.is_available
      and pack.is_available
  ) <> v_selection_count then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  for v_selection_item in
    select item.value
    from jsonb_array_elements(p_selection) with ordinality item(value, position)
    order by item.position
  loop
    select library_template.*
    into strict v_library_template
    from public.litter_care_task_library_templates library_template
    where library_template.code = v_selection_item ->> 'code'
      and library_template.version = (v_selection_item ->> 'version')::integer;

    select organization_template.id
    into v_organization_template_id
    from public.litter_care_task_templates organization_template
    where organization_template.organization_id = p_organization_id
      and organization_template.library_template_code = v_library_template.code
      and organization_template.library_template_version = v_library_template.version;

    if found then
      already_imported_count := already_imported_count + 1;
      result := result || jsonb_build_array(jsonb_build_object(
        'code', v_library_template.code,
        'version', v_library_template.version,
        'templateId', v_organization_template_id,
        'state', 'already_imported'
      ));
      continue;
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
      library_template_code,
      library_template_version,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      v_library_template.title,
      v_library_template.description,
      v_library_template.category,
      v_library_template.target_scope,
      v_library_template.anchor_type,
      v_library_template.offset_days,
      v_library_template.species,
      v_library_template.breed,
      p_is_active,
      v_library_template.sort_order,
      1,
      v_library_template.code,
      v_library_template.version,
      v_user_id,
      v_user_id
    )
    returning litter_care_task_templates.id
    into v_organization_template_id;

    imported_count := imported_count + 1;
    result := result || jsonb_build_array(jsonb_build_object(
      'code', v_library_template.code,
      'version', v_library_template.version,
      'templateId', v_organization_template_id,
      'state', 'imported'
    ));
  end loop;

  insert into public.litter_care_task_library_import_commands (
    organization_id,
    client_command_id,
    selection,
    initial_is_active,
    imported_count,
    already_imported_count,
    result,
    created_by
  ) values (
    p_organization_id,
    p_client_command_id,
    p_selection,
    p_is_active,
    imported_count,
    already_imported_count,
    result,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

insert into public.litter_care_task_library_packs (
  code,
  title,
  description,
  species,
  sort_order,
  is_available
) values
  (
    'dog-gestation-preparation',
    'Gestation et préparation',
    'Repères de suivi pour la gestation et la préparation de la mise-bas.',
    'dog',
    10,
    true
  ),
  (
    'dog-birth-first-days',
    'Naissance et premiers jours',
    'Repères de suivi pour la naissance et les premiers jours de la portée.',
    'dog',
    20,
    true
  ),
  (
    'dog-growth-departure',
    'Croissance et préparation des départs',
    'Repères de suivi pour la croissance et la préparation des départs.',
    'dog',
    30,
    true
  );

insert into public.litter_care_task_library_templates (
  code,
  version,
  pack_code,
  title,
  description,
  category,
  target_scope,
  anchor_type,
  offset_days,
  species,
  breed,
  sort_order,
  is_available
) values
  (
    'dog-confirm-pregnancy', 1, 'dog-gestation-preparation',
    'Confirmer la gestation',
    'Repère de suivi pour organiser la confirmation de gestation.',
    'veterinary', 'litter', 'estimated_ovulation', 28,
    'dog', null, 10, true
  ),
  (
    'dog-plan-litter-count-xray', 1, 'dog-gestation-preparation',
    'Planifier la radiographie de comptage',
    'Repère de planification pour une éventuelle radiographie de comptage.',
    'veterinary', 'litter', 'estimated_ovulation', 55,
    'dog', null, 20, true
  ),
  (
    'dog-prepare-whelping-area', 1, 'dog-gestation-preparation',
    'Préparer l’espace de mise-bas',
    'Repère pour organiser l’espace prévu pour la mise-bas.',
    'preparation', 'organization', 'expected_birth', -14,
    'dog', null, 30, true
  ),
  (
    'dog-check-whelping-equipment', 1, 'dog-gestation-preparation',
    'Vérifier le matériel de mise-bas',
    'Repère pour revoir le matériel préparé pour la mise-bas.',
    'preparation', 'organization', 'expected_birth', -7,
    'dog', null, 40, true
  ),
  (
    'dog-start-temperature-monitoring', 1, 'dog-gestation-preparation',
    'Démarrer les relevés de température',
    'Repère de suivi pour commencer les relevés prévus.',
    'maternal_health', 'mother', 'expected_birth', -7,
    'dog', null, 50, true
  ),
  (
    'dog-check-emergency-protocol', 1, 'dog-gestation-preparation',
    'Vérifier le protocole et les contacts d’urgence',
    'Repère pour revoir le protocole et les contacts préparés.',
    'preparation', 'organization', 'expected_birth', -7,
    'dog', null, 60, true
  ),
  (
    'dog-prepare-whelping-journal', 1, 'dog-gestation-preparation',
    'Préparer le Journal de mise-bas',
    'Repère pour préparer le support de suivi de la mise-bas.',
    'preparation', 'litter', 'expected_birth', -2,
    'dog', null, 70, true
  ),
  (
    'dog-complete-birth-summary', 1, 'dog-birth-first-days',
    'Compléter la synthèse de mise-bas',
    'Repère pour compléter la synthèse factuelle de la mise-bas.',
    'reproduction', 'litter', 'actual_birth', 0,
    'dog', null, 80, true
  ),
  (
    'dog-record-birth-weights', 1, 'dog-birth-first-days',
    'Enregistrer les poids de naissance',
    'Repère pour consigner les poids relevés à la naissance.',
    'offspring_weight', 'all_offspring', 'actual_birth', 0,
    'dog', null, 90, true
  ),
  (
    'dog-check-provisional-identification', 1, 'dog-birth-first-days',
    'Vérifier l’identification provisoire de chaque chiot',
    'Repère pour revoir l’identification provisoire de la portée.',
    'identification', 'all_offspring', 'actual_birth', 1,
    'dog', null, 100, true
  ),
  (
    'dog-check-mother-postpartum', 1, 'dog-birth-first-days',
    'Contrôler l’état post-partum de la mère',
    'Repère de suivi de l’état post-partum observé chez la mère.',
    'maternal_health', 'mother', 'actual_birth', 1,
    'dog', null, 110, true
  ),
  (
    'dog-check-litter-general-condition', 1, 'dog-birth-first-days',
    'Contrôler l’état général de la portée',
    'Repère de suivi de l’état général observé dans la portée.',
    'offspring_health', 'all_offspring', 'actual_birth', 1,
    'dog', null, 120, true
  ),
  (
    'dog-open-socialization-checklist', 1, 'dog-growth-departure',
    'Ouvrir la checklist de socialisation',
    'Repère pour ouvrir le suivi prévu de la socialisation.',
    'socialization', 'all_offspring', 'offspring_age', 21,
    'dog', null, 130, true
  ),
  (
    'dog-prepare-identification-visit', 1, 'dog-growth-departure',
    'Préparer la visite vétérinaire d’identification',
    'Repère de préparation pour une visite d’identification envisagée.',
    'identification', 'all_offspring', 'offspring_age', 49,
    'dog', null, 140, true
  ),
  (
    'dog-prepare-puppy-departures', 1, 'dog-growth-departure',
    'Préparer les départs des chiots',
    'Repère pour organiser les éléments liés aux départs des chiots.',
    'preparation', 'litter', 'offspring_age', 49,
    'dog', null, 150, true
  );

revoke all on table public.litter_care_task_library_packs from anon, authenticated;
grant select on table public.litter_care_task_library_packs to authenticated;

revoke all on table public.litter_care_task_library_templates from anon, authenticated;
grant select on table public.litter_care_task_library_templates to authenticated;

revoke all on table public.litter_care_task_library_import_commands from anon, authenticated;

revoke all on function public.protect_litter_care_task_template_library_origin()
from public;

revoke all on function public.import_litter_care_task_library_templates(
  uuid, uuid, jsonb, boolean
) from public;
grant execute on function public.import_litter_care_task_library_templates(
  uuid, uuid, jsonb, boolean
) to authenticated;

comment on table public.litter_care_task_library_packs is
  'Read-only global packs of recommended litter care task template versions.';

comment on table public.litter_care_task_library_templates is
  'Immutable global product catalogue. Organization imports always create independent copies.';

comment on table public.litter_care_task_library_import_commands is
  'Private exact-selection registry for atomic organization library imports.';

comment on column public.litter_care_task_templates.library_template_code is
  'Immutable source code when the organization template was copied from the global library.';

comment on column public.litter_care_task_templates.library_template_version is
  'Immutable exact source version when copied from the global library.';

comment on function public.import_litter_care_task_library_templates(
  uuid, uuid, jsonb, boolean
) is
  'Atomically imports exact available library versions as independent organization templates.';

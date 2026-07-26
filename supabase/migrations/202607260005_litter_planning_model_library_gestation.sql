-- GESTATION-MODEL-LIBRARY-01: elementary gestation templates, planning model library, import RPC.

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
    'dog-pregnancy-ultrasound', 1, 'dog-gestation-preparation',
    'Échographie de gestation',
    $desc$Repère de planification pour organiser une échographie de gestation dans une fenêtre indicative, sans certitude médicale. À adapter avec le vétérinaire ou l'élevage.$desc$,
    'veterinary', 'litter', 'estimated_ovulation', 28,
    'dog', null, 15, true
  ),
  (
    'dog-herpesvirose-injection-1', 1, 'dog-gestation-preparation',
    'Première injection herpèsvirose',
    $desc$Repère pour planifier une première injection herpèsvirose. À valider et adapter avec le vétérinaire ou l'élevage.$desc$,
    'maternal_health', 'mother', 'first_mating', 8,
    'dog', null, 16, true
  ),
  (
    'dog-gestation-food-transition', 1, 'dog-gestation-preparation',
    'Transition vers Mother & Babydog',
    $desc$Repère pour préparer la transition alimentaire vers Mother & Babydog (réglage initial inspiré des pratiques Pays Pourpre, modifiable après import). À adapter selon la mère et l'avis du vétérinaire ou de l'élevage.$desc$,
    'maternal_feeding', 'mother', 'expected_birth', -23,
    'dog', null, 22, true
  ),
  (
    'dog-gestation-food-plus-10', 1, 'dog-gestation-preparation',
    'Ration +10 %',
    $desc$Repère d'augmentation progressive de la ration d'environ +10 % avant la mise-bas. À adapter avec le vétérinaire ou l'élevage.$desc$,
    'maternal_feeding', 'mother', 'expected_birth', -16,
    'dog', null, 24, true
  ),
  (
    'dog-gestation-food-plus-20', 1, 'dog-gestation-preparation',
    'Ration +20 %',
    $desc$Repère d'augmentation progressive de la ration d'environ +20 % avant la mise-bas. À adapter avec le vétérinaire ou l'élevage.$desc$,
    'maternal_feeding', 'mother', 'expected_birth', -9,
    'dog', null, 26, true
  ),
  (
    'dog-gestation-food-plus-40', 1, 'dog-gestation-preparation',
    'Augmentation progressive jusqu''à +40 %',
    $desc$Repère d'augmentation progressive de la ration jusqu'à environ +40 % ; le pourcentage et la ration réelle restent ajustables. À adapter avec le vétérinaire ou l'élevage.$desc$,
    'maternal_feeding', 'mother', 'expected_birth', -2,
    'dog', null, 28, true
  ),
  (
    'dog-deworm-mother-before-birth', 1, 'dog-gestation-preparation',
    'Vermifuger la mère',
    $desc$Repère pour planifier un vermifuge de la mère avant la mise-bas, sans produit ni dose prescrits ici. À organiser avec le vétérinaire ou l'élevage.$desc$,
    'maternal_health', 'mother', 'expected_birth', -15,
    'dog', null, 35, true
  ),
  (
    'dog-herpesvirose-injection-2', 1, 'dog-gestation-preparation',
    'Deuxième injection herpèsvirose',
    $desc$Date cible indicative autour de D−10, à choisir dans la fenêtre avec le vétérinaire.$desc$,
    'maternal_health', 'mother', 'expected_birth', -10,
    'dog', null, 36, true
  ),
  (
    'dog-temperature-monitoring-period', 1, 'dog-gestation-preparation',
    'Période de relevés de température',
    $desc$Relevés prévus matin et soir jusqu'à la mise-bas réelle. Les mesures restent dans le suivi maternel (pas de génération de tâches quotidiennes). À adapter avec le vétérinaire ou l'élevage.$desc$,
    'maternal_health', 'mother', 'expected_birth', -5,
    'dog', null, 55, true
  ),
  (
    'dog-whelping-vigilance-window', 1, 'dog-gestation-preparation',
    'Fenêtre probable de mise-bas',
    $desc$Fenêtre indicative de vigilance autour de la mise-bas prévue, sans certitude de date exacte. À adapter avec le vétérinaire ou l'élevage.$desc$,
    'reproduction', 'litter', 'expected_birth', 0,
    'dog', null, 75, true
  );

create table public.litter_planning_model_library_models (
  code text not null,
  version integer not null,
  family_code text not null,
  variant_code text not null,
  title text not null,
  description text,
  species text not null,
  breed text,
  sort_order integer not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (code, version),
  constraint litter_planning_model_library_models_code_check
    check (
      char_length(code) between 1 and 100
      and code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_planning_model_library_models_family_code_check
    check (
      char_length(family_code) between 1 and 100
      and family_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_planning_model_library_models_variant_code_check
    check (
      char_length(variant_code) between 1 and 100
      and variant_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint litter_planning_model_library_models_version_check
    check (version > 0),
  constraint litter_planning_model_library_models_title_check
    check (char_length(btrim(title)) between 1 and 255),
  constraint litter_planning_model_library_models_description_check
    check (description is null or char_length(description) <= 5000),
  constraint litter_planning_model_library_models_species_check
    check (species in ('dog', 'cat')),
  constraint litter_planning_model_library_models_breed_check
    check (
      breed is null
      or char_length(btrim(breed)) between 1 and 255
    )
);

create unique index litter_planning_model_library_models_available_code_key
  on public.litter_planning_model_library_models (code)
  where is_available;

create index litter_planning_model_library_models_family_order_idx
  on public.litter_planning_model_library_models (family_code, sort_order, code, version desc);

create table public.litter_planning_model_library_items (
  id uuid primary key default gen_random_uuid(),
  library_model_code text not null,
  library_model_version integer not null,
  library_template_code text not null,
  library_template_version integer not null,
  item_kind text not null,
  priority text not null default 'normal',
  anchor_type text not null,
  point_offset_days integer,
  point_local_time time without time zone,
  window_starts_offset_days integer,
  window_starts_local_time time without time zone,
  window_ends_offset_days integer,
  window_ends_local_time time without time zone,
  display_order integer not null,
  is_required boolean not null default true,
  is_selected_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  constraint litter_planning_model_library_items_model_fk
    foreign key (library_model_code, library_model_version)
    references public.litter_planning_model_library_models (code, version)
    on update restrict on delete restrict,
  constraint litter_planning_model_library_items_template_fk
    foreign key (library_template_code, library_template_version)
    references public.litter_care_task_library_templates (code, version)
    on update restrict on delete restrict,
  constraint litter_planning_model_library_items_kind_check
    check (item_kind in ('milestone', 'task', 'window')),
  constraint litter_planning_model_library_items_priority_check
    check (priority in ('normal', 'important', 'organization_critical')),
  constraint litter_planning_model_library_items_anchor_check
    check (anchor_type in (
      'first_mating', 'estimated_ovulation', 'expected_birth', 'actual_birth', 'offspring_age'
    )),
  constraint litter_planning_model_library_items_display_order_check
    check (display_order >= 0),
  constraint litter_planning_model_library_items_required_selection_check
    check (not is_required or is_selected_by_default),
  constraint litter_planning_model_library_items_schedule_shape_check
    check (
      (item_kind in ('milestone', 'task')
        and point_offset_days is not null
        and window_starts_offset_days is null and window_starts_local_time is null
        and window_ends_offset_days is null and window_ends_local_time is null)
      or
      (item_kind = 'window'
        and point_offset_days is null and point_local_time is null
        and window_starts_offset_days is not null and window_ends_offset_days is not null
        and (window_starts_offset_days < window_ends_offset_days
          or (window_starts_offset_days = window_ends_offset_days and (
            window_starts_local_time is null or window_ends_local_time is null
            or window_starts_local_time <= window_ends_local_time))))
    )
);

create unique index litter_planning_model_library_items_display_order_key
  on public.litter_planning_model_library_items (
    library_model_code,
    library_model_version,
    display_order
  );

create table public.litter_planning_model_library_import_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_command_id uuid not null,
  selection jsonb not null,
  initial_is_active boolean not null,
  imported_count integer not null,
  already_imported_count integer not null,
  elementary_imported_count integer not null,
  elementary_already_imported_count integer not null,
  result jsonb not null,
  elementary_result jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete restrict,
  constraint litter_planning_model_library_import_commands_org_command_key
    unique (organization_id, client_command_id),
  constraint litter_planning_model_library_import_commands_selection_check
    check (jsonb_typeof(selection) = 'array'),
  constraint litter_planning_model_library_import_commands_counts_check
    check (
      imported_count >= 0
      and already_imported_count >= 0
      and elementary_imported_count >= 0
      and elementary_already_imported_count >= 0
    ),
  constraint litter_planning_model_library_import_commands_result_check
    check (jsonb_typeof(result) = 'array'),
  constraint litter_planning_model_library_import_commands_elementary_result_check
    check (jsonb_typeof(elementary_result) = 'array')
);

create index litter_planning_model_library_import_commands_org_created_at_idx
  on public.litter_planning_model_library_import_commands (organization_id, created_at);

alter table public.litter_planning_models
  add column library_model_code text,
  add column library_model_version integer,
  add constraint litter_planning_models_library_origin_values_check
    check (
      (library_model_code is null and library_model_version is null)
      or (
        library_model_code is not null
        and library_model_version is not null
        and library_model_version > 0
      )
    ),
  add constraint litter_planning_models_library_origin_fk
    foreign key (library_model_code, library_model_version)
    references public.litter_planning_model_library_models (code, version)
    on update restrict on delete restrict;

create unique index litter_planning_models_library_origin_key
  on public.litter_planning_models (
    organization_id,
    library_model_code,
    library_model_version
  )
  where library_model_code is not null;

create or replace function public.protect_litter_planning_model_library_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if old.library_model_code is distinct from new.library_model_code
    or old.library_model_version is distinct from new.library_model_version then
    raise exception 'litter planning model library origin is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger litter_planning_models_protect_library_origin
before update of library_model_code, library_model_version
on public.litter_planning_models
for each row execute function public.protect_litter_planning_model_library_origin();

create or replace function public.import_litter_planning_model_library_models(
  p_organization_id uuid,
  p_client_command_id uuid,
  p_selection jsonb,
  p_is_active boolean
)
returns table (
  outcome text,
  imported_count integer,
  already_imported_count integer,
  elementary_imported_count integer,
  elementary_already_imported_count integer,
  result jsonb,
  elementary_result jsonb,
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
  v_existing_command public.litter_planning_model_library_import_commands%rowtype;
  v_selection_item jsonb;
  v_selection_count integer;
  v_distinct_selection_count integer;
  v_key_count integer;
  v_library_model public.litter_planning_model_library_models%rowtype;
  v_library_template public.litter_care_task_library_templates%rowtype;
  v_organization_model_id uuid;
  v_organization_template_id uuid;
  v_elementary_key text;
  v_elementary_map jsonb := '{}'::jsonb;
  v_distinct_elementary_count integer;
  v_available_elementary_count integer;
  v_library_item public.litter_planning_model_library_items%rowtype;
begin
  outcome := 'error';
  imported_count := 0;
  already_imported_count := 0;
  elementary_imported_count := 0;
  elementary_already_imported_count := 0;
  result := '[]'::jsonb;
  elementary_result := '[]'::jsonb;
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
      'litter_planning_model_library_import_commands:'
        || p_organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select command.*
  into v_existing_command
  from public.litter_planning_model_library_import_commands command
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
    elementary_imported_count := v_existing_command.elementary_imported_count;
    elementary_already_imported_count := v_existing_command.elementary_already_imported_count;
    result := v_existing_command.result;
    elementary_result := v_existing_command.elementary_result;
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
      'litter_planning_model_library_imports:' || p_organization_id::text,
      0
    )
  );

  perform library_model.code
  from public.litter_planning_model_library_models library_model
  join jsonb_array_elements(p_selection) item(value)
    on library_model.code = item.value ->> 'code'
   and library_model.version = (item.value ->> 'version')::integer
  where library_model.is_available
  order by library_model.code, library_model.version
  for share of library_model;

  if (
    select count(*)
    from public.litter_planning_model_library_models library_model
    join jsonb_array_elements(p_selection) item(value)
      on library_model.code = item.value ->> 'code'
     and library_model.version = (item.value ->> 'version')::integer
    where library_model.is_available
  ) <> v_selection_count then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_distinct_elementary_count
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer;

  perform library_template.code
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer
  join public.litter_care_task_library_templates library_template
    on library_template.code = library_item.library_template_code
   and library_template.version = library_item.library_template_version
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  where library_template.is_available
    and pack.is_available
  order by library_template.code, library_template.version
  for share of library_template, pack;

  select count(distinct concat_ws(
    ':',
    library_item.library_template_code,
    library_item.library_template_version::text
  ))
  into v_available_elementary_count
  from public.litter_planning_model_library_items library_item
  join jsonb_array_elements(p_selection) item(value)
    on library_item.library_model_code = item.value ->> 'code'
   and library_item.library_model_version = (item.value ->> 'version')::integer
  join public.litter_care_task_library_templates library_template
    on library_template.code = library_item.library_template_code
   and library_template.version = library_item.library_template_version
  join public.litter_care_task_library_packs pack
    on pack.code = library_template.pack_code
   and pack.species = library_template.species
  where library_template.is_available
    and pack.is_available;

  if v_available_elementary_count <> v_distinct_elementary_count then
    reason := 'selection_unavailable';
    return next;
    return;
  end if;

  for v_library_template in
    select distinct library_template.*
    from public.litter_planning_model_library_items library_item
    join jsonb_array_elements(p_selection) item(value)
      on library_item.library_model_code = item.value ->> 'code'
     and library_item.library_model_version = (item.value ->> 'version')::integer
    join public.litter_care_task_library_templates library_template
      on library_template.code = library_item.library_template_code
     and library_template.version = library_item.library_template_version
    order by library_template.code, library_template.version
  loop
    v_elementary_key := v_library_template.code || ':' || v_library_template.version::text;

    select organization_template.id
    into v_organization_template_id
    from public.litter_care_task_templates organization_template
    where organization_template.organization_id = p_organization_id
      and organization_template.library_template_code = v_library_template.code
      and organization_template.library_template_version = v_library_template.version;

    if found then
      elementary_already_imported_count := elementary_already_imported_count + 1;
      v_elementary_map := v_elementary_map || jsonb_build_object(
        v_elementary_key,
        v_organization_template_id::text
      );
      elementary_result := elementary_result || jsonb_build_array(jsonb_build_object(
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

    elementary_imported_count := elementary_imported_count + 1;
    v_elementary_map := v_elementary_map || jsonb_build_object(
      v_elementary_key,
      v_organization_template_id::text
    );
    elementary_result := elementary_result || jsonb_build_array(jsonb_build_object(
      'code', v_library_template.code,
      'version', v_library_template.version,
      'templateId', v_organization_template_id,
      'state', 'imported'
    ));
  end loop;

  for v_selection_item in
    select item.value
    from jsonb_array_elements(p_selection) with ordinality item(value, position)
    order by item.position
  loop
    select library_model.*
    into strict v_library_model
    from public.litter_planning_model_library_models library_model
    where library_model.code = v_selection_item ->> 'code'
      and library_model.version = (v_selection_item ->> 'version')::integer;

    select organization_model.id
    into v_organization_model_id
    from public.litter_planning_models organization_model
    where organization_model.organization_id = p_organization_id
      and organization_model.library_model_code = v_library_model.code
      and organization_model.library_model_version = v_library_model.version;

    if found then
      already_imported_count := already_imported_count + 1;
      result := result || jsonb_build_array(jsonb_build_object(
        'code', v_library_model.code,
        'version', v_library_model.version,
        'modelId', v_organization_model_id,
        'state', 'already_imported'
      ));
      continue;
    end if;

    insert into public.litter_planning_models (
      organization_id,
      title,
      description,
      species,
      breed,
      is_active,
      revision,
      library_model_code,
      library_model_version,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      v_library_model.title,
      v_library_model.description,
      v_library_model.species,
      v_library_model.breed,
      p_is_active,
      1,
      v_library_model.code,
      v_library_model.version,
      v_user_id,
      v_user_id
    )
    returning litter_planning_models.id
    into v_organization_model_id;

    for v_library_item in
      select library_item.*
      from public.litter_planning_model_library_items library_item
      where library_item.library_model_code = v_library_model.code
        and library_item.library_model_version = v_library_model.version
      order by library_item.display_order
    loop
      v_elementary_key := v_library_item.library_template_code
        || ':' || v_library_item.library_template_version::text;

      insert into public.litter_planning_model_items (
        organization_id,
        model_id,
        organization_template_id,
        item_kind,
        priority,
        anchor_type,
        point_offset_days,
        point_local_time,
        window_starts_offset_days,
        window_starts_local_time,
        window_ends_offset_days,
        window_ends_local_time,
        display_order,
        is_required,
        is_selected_by_default,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        v_organization_model_id,
        (v_elementary_map ->> v_elementary_key)::uuid,
        v_library_item.item_kind,
        v_library_item.priority,
        v_library_item.anchor_type,
        v_library_item.point_offset_days,
        v_library_item.point_local_time,
        v_library_item.window_starts_offset_days,
        v_library_item.window_starts_local_time,
        v_library_item.window_ends_offset_days,
        v_library_item.window_ends_local_time,
        v_library_item.display_order,
        v_library_item.is_required,
        v_library_item.is_selected_by_default,
        v_user_id,
        v_user_id
      );
    end loop;

    imported_count := imported_count + 1;
    result := result || jsonb_build_array(jsonb_build_object(
      'code', v_library_model.code,
      'version', v_library_model.version,
      'modelId', v_organization_model_id,
      'state', 'imported'
    ));
  end loop;

  insert into public.litter_planning_model_library_import_commands (
    organization_id,
    client_command_id,
    selection,
    initial_is_active,
    imported_count,
    already_imported_count,
    elementary_imported_count,
    elementary_already_imported_count,
    result,
    elementary_result,
    created_by
  ) values (
    p_organization_id,
    p_client_command_id,
    p_selection,
    p_is_active,
    imported_count,
    already_imported_count,
    elementary_imported_count,
    elementary_already_imported_count,
    result,
    elementary_result,
    v_user_id
  );

  outcome := 'success';
  return next;
end;
$$;

insert into public.litter_planning_model_library_models (
  code,
  version,
  family_code,
  variant_code,
  title,
  description,
  species,
  breed,
  sort_order,
  is_available
) values
  (
    'dog-gestation-standard', 1, 'dog-gestation', 'standard',
    'Gestation',
    $desc$Modèle de planification de gestation : réglages initiaux inspirés des pratiques Pays Pourpre, modifiables après import dans l'organisation.$desc$,
    'dog', 'Golden Retriever', 10, true
  ),
  (
    'dog-gestation-herpesvirose', 1, 'dog-gestation', 'herpesvirose',
    'Gestation + herpèsvirose',
    $desc$Modèle de planification de gestation avec protocole herpèsvirose : réglages initiaux inspirés des pratiques Pays Pourpre, modifiables après import dans l'organisation.$desc$,
    'dog', 'Golden Retriever', 20, true
  );

insert into public.litter_planning_model_library_items (
  library_model_code,
  library_model_version,
  library_template_code,
  library_template_version,
  item_kind,
  priority,
  anchor_type,
  window_starts_offset_days,
  window_ends_offset_days,
  point_offset_days,
  display_order,
  is_required,
  is_selected_by_default
) values
  ('dog-gestation-standard', 1, 'dog-pregnancy-ultrasound', 1, 'window', 'important', 'estimated_ovulation', 25, 32, null, 0, false, true),
  ('dog-gestation-standard', 1, 'dog-gestation-food-transition', 1, 'window', 'normal', 'expected_birth', -26, -20, null, 1, false, true),
  ('dog-gestation-standard', 1, 'dog-gestation-food-plus-10', 1, 'window', 'normal', 'expected_birth', -19, -13, null, 2, false, true),
  ('dog-gestation-standard', 1, 'dog-gestation-food-plus-20', 1, 'window', 'normal', 'expected_birth', -12, -6, null, 3, false, true),
  ('dog-gestation-standard', 1, 'dog-gestation-food-plus-40', 1, 'window', 'normal', 'expected_birth', -5, 0, null, 4, false, true),
  ('dog-gestation-standard', 1, 'dog-deworm-mother-before-birth', 1, 'task', 'important', 'expected_birth', null, null, -15, 5, false, true),
  ('dog-gestation-standard', 1, 'dog-plan-litter-count-xray', 1, 'window', 'important', 'estimated_ovulation', 54, 57, null, 6, false, true),
  ('dog-gestation-standard', 1, 'dog-prepare-whelping-area', 1, 'task', 'important', 'expected_birth', null, null, -7, 7, false, true),
  ('dog-gestation-standard', 1, 'dog-check-whelping-equipment', 1, 'task', 'normal', 'expected_birth', null, null, -7, 8, false, true),
  ('dog-gestation-standard', 1, 'dog-check-emergency-protocol', 1, 'task', 'normal', 'expected_birth', null, null, -7, 9, false, true),
  ('dog-gestation-standard', 1, 'dog-start-temperature-monitoring', 1, 'task', 'important', 'expected_birth', null, null, -5, 10, false, true),
  ('dog-gestation-standard', 1, 'dog-temperature-monitoring-period', 1, 'window', 'important', 'expected_birth', -5, 0, null, 11, false, true),
  ('dog-gestation-standard', 1, 'dog-prepare-whelping-journal', 1, 'task', 'normal', 'expected_birth', null, null, -2, 12, false, true),
  ('dog-gestation-standard', 1, 'dog-whelping-vigilance-window', 1, 'window', 'important', 'expected_birth', -1, 2, null, 13, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-pregnancy-ultrasound', 1, 'window', 'important', 'estimated_ovulation', 25, 32, null, 0, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-gestation-food-transition', 1, 'window', 'normal', 'expected_birth', -26, -20, null, 1, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-gestation-food-plus-10', 1, 'window', 'normal', 'expected_birth', -19, -13, null, 2, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-gestation-food-plus-20', 1, 'window', 'normal', 'expected_birth', -12, -6, null, 3, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-gestation-food-plus-40', 1, 'window', 'normal', 'expected_birth', -5, 0, null, 4, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-deworm-mother-before-birth', 1, 'task', 'important', 'expected_birth', null, null, -15, 5, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-plan-litter-count-xray', 1, 'window', 'important', 'estimated_ovulation', 54, 57, null, 6, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-prepare-whelping-area', 1, 'task', 'important', 'expected_birth', null, null, -7, 7, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-check-whelping-equipment', 1, 'task', 'normal', 'expected_birth', null, null, -7, 8, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-check-emergency-protocol', 1, 'task', 'normal', 'expected_birth', null, null, -7, 9, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-start-temperature-monitoring', 1, 'task', 'important', 'expected_birth', null, null, -5, 10, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-temperature-monitoring-period', 1, 'window', 'important', 'expected_birth', -5, 0, null, 11, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-prepare-whelping-journal', 1, 'task', 'normal', 'expected_birth', null, null, -2, 12, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-whelping-vigilance-window', 1, 'window', 'important', 'expected_birth', -1, 2, null, 13, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-herpesvirose-injection-1', 1, 'window', 'important', 'first_mating', 7, 10, null, 14, false, true),
  ('dog-gestation-herpesvirose', 1, 'dog-herpesvirose-injection-2', 1, 'window', 'important', 'expected_birth', -14, -7, null, 15, false, true);

alter table public.litter_planning_model_library_models enable row level security;
alter table public.litter_planning_model_library_items enable row level security;
alter table public.litter_planning_model_library_import_commands enable row level security;

create policy litter_planning_model_library_models_select_authenticated
on public.litter_planning_model_library_models
for select
to authenticated
using (true);

create policy litter_planning_model_library_items_select_authenticated
on public.litter_planning_model_library_items
for select
to authenticated
using (true);

revoke all on table public.litter_planning_model_library_models from anon, authenticated;
grant select on table public.litter_planning_model_library_models to authenticated;

revoke all on table public.litter_planning_model_library_items from anon, authenticated;
grant select on table public.litter_planning_model_library_items to authenticated;

revoke all on table public.litter_planning_model_library_import_commands from anon, authenticated;

revoke all on function public.protect_litter_planning_model_library_origin()
from public;

revoke all on function public.import_litter_planning_model_library_models(
  uuid, uuid, jsonb, boolean
) from public;
grant execute on function public.import_litter_planning_model_library_models(
  uuid, uuid, jsonb, boolean
) to authenticated;

comment on table public.litter_planning_model_library_models is
  'Read-only global catalogue of composed litter planning model versions.';

comment on table public.litter_planning_model_library_items is
  'Immutable schedule lines for global planning models, referencing elementary library templates.';

comment on table public.litter_planning_model_library_import_commands is
  'Private exact-selection registry for atomic organization planning model library imports.';

comment on column public.litter_planning_models.library_model_code is
  'Immutable source code when the organization model was copied from the global library.';

comment on column public.litter_planning_models.library_model_version is
  'Immutable exact source version when copied from the global library.';

comment on column public.litter_planning_model_library_import_commands.elementary_imported_count is
  'Number of elementary care task templates newly imported during this command.';

comment on column public.litter_planning_model_library_import_commands.elementary_already_imported_count is
  'Number of elementary care task templates already present before this command.';

comment on column public.litter_planning_model_library_import_commands.elementary_result is
  'Per-elementary-template import outcome (code, version, templateId, state).';

comment on function public.import_litter_planning_model_library_models(
  uuid, uuid, jsonb, boolean
) is
  'Atomically imports selected library planning models and required elementary templates as independent organization copies.';

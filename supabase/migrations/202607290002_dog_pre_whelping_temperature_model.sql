-- DOG-PRE-WHELPING-TEMPERATURE-MODEL-01
-- Optional global model for operational pre-whelping temperature monitoring.
-- Catalog data only: no schema, runtime, permission, or historical-model change.

begin;

do $prerequisites$
begin
  if not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-temperature-monitoring-period'
      and version = 1
      and is_available
  ) then
    raise exception 'missing required library template dog-temperature-monitoring-period v1';
  end if;

  if not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-prepare-whelping-journal'
      and version = 1
      and is_available
  ) then
    raise exception 'missing required library template dog-prepare-whelping-journal v1';
  end if;

  if not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-whelping-vigilance-window'
      and version = 1
      and is_available
  ) then
    raise exception 'missing required library template dog-whelping-vigilance-window v1';
  end if;

  if not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-temperature-monitoring-period'
      and version = 1
      and category = 'maternal_health'
      and target_scope = 'mother'
  ) then
    raise exception 'incoherent library template dog-temperature-monitoring-period v1'
      using detail = 'Expected category=maternal_health and target_scope=mother.';
  end if;
end;
$prerequisites$;

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
) values (
  'dog-pre-whelping-temperature-monitoring',
  1,
  'dog-pre-whelping',
  'temperature-monitoring',
  'Surveillance pré-mise-bas — températures',
  $description$Suivi opérationnel de la mère avant la mise-bas : températures deux fois par jour, préparation du Journal et période de vigilance. Modèle facultatif et modifiable après import, à adapter au protocole de l’élevage et aux recommandations vétérinaires.$description$,
  'dog',
  null,
  30,
  true
);

insert into public.litter_planning_model_library_items (
  id,
  library_model_code,
  library_model_version,
  library_template_code,
  library_template_version,
  item_kind,
  priority,
  anchor_type,
  point_offset_days,
  point_local_time,
  window_starts_offset_days,
  window_starts_local_time,
  window_ends_offset_days,
  window_ends_local_time,
  recurrence_kind,
  recurrence_interval_days,
  recurrence_starts_offset_days,
  recurrence_end_kind,
  recurrence_ends_offset_days,
  recurrence_day_count,
  initial_materialization_horizon_days,
  absolute_max_occurrences,
  completion_fact_kind,
  display_order,
  is_required,
  is_selected_by_default
) values
  (
    'ca7a2026-0729-4000-8000-000000000001',
    'dog-pre-whelping-temperature-monitoring',
    1,
    'dog-temperature-monitoring-period',
    1,
    'recurring_task',
    'important',
    'expected_birth',
    null,
    null,
    null,
    null,
    null,
    null,
    'daily_interval',
    1,
    -5,
    'actual_birth',
    null,
    null,
    7,
    30,
    'maternal_temperature_observation',
    0,
    true,
    true
  ),
  (
    'ca7a2026-0729-4000-8000-000000000002',
    'dog-pre-whelping-temperature-monitoring',
    1,
    'dog-prepare-whelping-journal',
    1,
    'task',
    'normal',
    'expected_birth',
    -2,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    1,
    false,
    true
  ),
  (
    'ca7a2026-0729-4000-8000-000000000003',
    'dog-pre-whelping-temperature-monitoring',
    1,
    'dog-whelping-vigilance-window',
    1,
    'window',
    'important',
    'expected_birth',
    null,
    null,
    -1,
    null,
    2,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    2,
    false,
    true
  );

insert into public.litter_planning_model_library_item_time_slots (
  id,
  library_model_item_id,
  slot_no,
  local_time
) values
  (
    'ca7a2026-0729-4000-8000-000000000011',
    'ca7a2026-0729-4000-8000-000000000001',
    1,
    '08:00'
  ),
  (
    'ca7a2026-0729-4000-8000-000000000012',
    'ca7a2026-0729-4000-8000-000000000001',
    2,
    '20:00'
  );

commit;

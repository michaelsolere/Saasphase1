-- DOG-POSTNATAL-CARE-MODEL-01
-- Optional global postnatal care model. Catalog data only.

begin;

do $prerequisites$
declare
  v_missing_id uuid;
begin
  if to_regclass('public.litter_care_task_library_packs') is null
    or to_regclass('public.litter_care_task_library_templates') is null
    or to_regclass('public.litter_planning_model_library_models') is null
    or to_regclass('public.litter_planning_model_library_items') is null
    or to_regclass('public.litter_planning_model_library_item_time_slots') is null then
    raise exception 'missing required litter planning library foundation';
  end if;

  select proposed.id
  into v_missing_id
  from unnest(array[
    'da7b2026-0730-4000-8000-000000000001'::uuid,
    'da7b2026-0730-4000-8000-000000000002'::uuid,
    'da7b2026-0730-4000-8000-000000000003'::uuid,
    'da7b2026-0730-4000-8000-000000000004'::uuid
  ]) as proposed(id)
  join public.litter_planning_model_library_items item on item.id = proposed.id
  limit 1;
  if v_missing_id is not null then
    raise exception 'catalog UUID already used: %', v_missing_id;
  end if;

  if exists (
    select 1
    from public.litter_planning_model_library_item_time_slots
    where id = 'da7b2026-0730-4000-8000-000000000101'::uuid
  ) then
    raise exception 'catalog UUID already used: da7b2026-0730-4000-8000-000000000101';
  end if;

  if exists (
    select 1 from public.litter_care_task_library_templates
    where code in (
      'dog-postpartum-mother-check',
      'dog-puppy-deworming-schedule',
      'dog-puppy-weaning-start',
      'dog-puppy-veterinary-identification-vaccination'
    )
  ) then
    raise exception 'postnatal elementary template code already exists';
  end if;

  if exists (
    select 1 from public.litter_planning_model_library_models
    where code = 'dog-postnatal-essential-care'
  ) then
    raise exception 'postnatal planning model code already exists';
  end if;
end;
$prerequisites$;

insert into public.litter_care_task_library_packs (
  code,
  title,
  description,
  species,
  sort_order,
  is_available
) values (
  'dog-postnatal-essential-care',
  'Soins postnatals essentiels',
  'Repères indicatifs et modifiables pour les soins collectifs essentiels jusqu’à huit semaines.',
  'dog',
  40,
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
    'dog-postpartum-mother-check',
    1,
    'dog-postnatal-essential-care',
    'Contrôler l’état post-partum de la mère',
    $description$Repère indicatif pour contrôler l’état général de la mère après la mise-bas et décider, si nécessaire, d’un avis vétérinaire. Ce jalon modifiable après import ne pose aucun diagnostic et son réglage est à adapter par l’éleveur avec son vétérinaire lorsque nécessaire.$description$,
    'maternal_health',
    'mother',
    'offspring_age',
    1,
    'dog',
    null,
    100,
    true
  ),
  (
    'dog-puppy-deworming-schedule',
    1,
    'dog-postnatal-essential-care',
    'Vermifuger les chiots',
    $description$Repère indicatif et modifiable après import pour organiser les vermifuges des chiots. Aucun produit, molécule ou dosage n’est prescrit ; le protocole est à adapter par l’éleveur avec son vétérinaire lorsque nécessaire.$description$,
    'deworming',
    'all_offspring',
    'offspring_age',
    14,
    'dog',
    null,
    110,
    true
  ),
  (
    'dog-puppy-weaning-start',
    1,
    'dog-postnatal-essential-care',
    'Commencer la transition alimentaire des chiots',
    $description$Repère indicatif et modifiable après import pour démarrer la transition alimentaire des chiots. Il ne pose aucun diagnostic et son réglage est à adapter par l’éleveur avec son vétérinaire lorsque nécessaire.$description$,
    'offspring_feeding',
    'all_offspring',
    'offspring_age',
    21,
    'dog',
    null,
    120,
    true
  ),
  (
    'dog-puppy-veterinary-identification-vaccination',
    1,
    'dog-postnatal-essential-care',
    'Visite vétérinaire — examen, identification et vaccination',
    $description$Repère indicatif pour un rendez-vous collectif de la portée regroupant examen, identification et vaccination. La fenêtre initiale est modifiable après import ; la date et le protocole sont à confirmer avec le vétérinaire. Ce jalon ne pose aucun diagnostic et ne valide automatiquement aucun acte.$description$,
    'veterinary',
    'litter',
    'offspring_age',
    49,
    'dog',
    null,
    130,
    true
  );

do $template_consistency$
begin
  if (
    select count(*)
    from public.litter_care_task_library_templates
    where pack_code = 'dog-postnatal-essential-care'
      and version = 1
      and species = 'dog'
      and breed is null
      and is_available
  ) <> 4 then
    raise exception 'incoherent postnatal elementary template count';
  end if;

  if not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-postpartum-mother-check' and version = 1
      and category = 'maternal_health' and target_scope = 'mother'
      and anchor_type = 'offspring_age' and offset_days = 1 and sort_order = 100
  ) or not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-puppy-deworming-schedule' and version = 1
      and category = 'deworming' and target_scope = 'all_offspring'
      and anchor_type = 'offspring_age' and offset_days = 14 and sort_order = 110
  ) or not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-puppy-weaning-start' and version = 1
      and category = 'offspring_feeding' and target_scope = 'all_offspring'
      and anchor_type = 'offspring_age' and offset_days = 21 and sort_order = 120
  ) or not exists (
    select 1
    from public.litter_care_task_library_templates
    where code = 'dog-puppy-veterinary-identification-vaccination' and version = 1
      and category = 'veterinary' and target_scope = 'litter'
      and anchor_type = 'offspring_age' and offset_days = 49 and sort_order = 130
  ) then
    raise exception 'incoherent postnatal elementary template definition';
  end if;
end;
$template_consistency$;

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
  'dog-postnatal-essential-care',
  1,
  'dog-postnatal',
  'essential-care',
  'Soins postnatals — essentiels jusqu’à 8 semaines',
  $description$Planning collectif minimal depuis la naissance réelle : contrôle post-partum de la mère, vermifuges des chiots, démarrage du sevrage et visite vétérinaire regroupant examen, identification et vaccination.

Réglages initiaux modifiables après import. Ce modèle ne prescrit aucun produit, dose ou diagnostic et ne valide aucun acte comme réalisé.$description$,
  'dog',
  null,
  40,
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
    'da7b2026-0730-4000-8000-000000000001',
    'dog-postnatal-essential-care',
    1,
    'dog-postpartum-mother-check',
    1,
    'task',
    'important',
    'offspring_age',
    1,
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
    0,
    false,
    true
  ),
  (
    'da7b2026-0730-4000-8000-000000000002',
    'dog-postnatal-essential-care',
    1,
    'dog-puppy-deworming-schedule',
    1,
    'recurring_task',
    'important',
    'offspring_age',
    null,
    null,
    null,
    null,
    null,
    null,
    'daily_interval',
    14,
    14,
    'fixed_end_offset',
    56,
    null,
    43,
    4,
    null,
    1,
    false,
    true
  ),
  (
    'da7b2026-0730-4000-8000-000000000003',
    'dog-postnatal-essential-care',
    1,
    'dog-puppy-weaning-start',
    1,
    'task',
    'normal',
    'offspring_age',
    21,
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
    2,
    false,
    true
  ),
  (
    'da7b2026-0730-4000-8000-000000000004',
    'dog-postnatal-essential-care',
    1,
    'dog-puppy-veterinary-identification-vaccination',
    1,
    'window',
    'important',
    'offspring_age',
    null,
    null,
    49,
    null,
    56,
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
    3,
    false,
    true
  );

insert into public.litter_planning_model_library_item_time_slots (
  id,
  library_model_item_id,
  slot_no,
  local_time
) values (
  'da7b2026-0730-4000-8000-000000000101',
  'da7b2026-0730-4000-8000-000000000002',
  1,
  '09:00'
);

do $model_consistency$
begin
  if (
    select count(*)
    from public.litter_planning_model_library_items
    where library_model_code = 'dog-postnatal-essential-care'
      and library_model_version = 1
      and not is_required
      and is_selected_by_default
      and completion_fact_kind is null
  ) <> 4 then
    raise exception 'incoherent postnatal planning model item count or defaults';
  end if;

  if (
    select count(*)
    from public.litter_planning_model_library_item_time_slots
    where library_model_item_id = 'da7b2026-0730-4000-8000-000000000002'::uuid
      and slot_no = 1
      and local_time = '09:00'::time
  ) <> 1 then
    raise exception 'incoherent postnatal deworming time slot';
  end if;
end;
$model_consistency$;

commit;

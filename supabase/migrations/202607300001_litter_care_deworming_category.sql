-- DOG-POSTNATAL-CARE-MODEL-01
-- Extend the authoritative litter-care category vocabulary with deworming.

begin;

alter table public.litter_care_task_library_templates
  drop constraint litter_care_task_library_templates_category_check,
  add constraint litter_care_task_library_templates_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding', 'deworming',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    ));

alter table public.litter_care_task_templates
  drop constraint litter_care_task_templates_category_check,
  add constraint litter_care_task_templates_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding', 'deworming',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    ));

alter table public.litter_care_tasks
  drop constraint litter_care_tasks_category_check,
  add constraint litter_care_tasks_category_check
    check (category in (
      'reproduction', 'maternal_health', 'maternal_feeding', 'preparation',
      'offspring_weight', 'offspring_health', 'offspring_feeding', 'deworming',
      'socialization', 'veterinary', 'identification', 'vaccination', 'other'
    ));

do $replace_category_validators$
declare
  v_function_name text;
  v_function_oid oid;
  v_definition text;
  v_updated_definition text;
  v_owner oid;
  v_security_definer boolean;
  v_config text[];
  v_acl aclitem[];
begin
  foreach v_function_name in array array[
    'create_litter_care_task',
    'create_litter_care_task_template',
    'update_litter_care_task_template',
    'create_litter_plan_ad_hoc_item',
    'update_litter_plan_ad_hoc_item_metadata'
  ]
  loop
    select function.oid
    into v_function_oid
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = v_function_name;

    if v_function_oid is null then
      raise exception 'missing required category validator function public.%', v_function_name;
    end if;

    if (
      select count(*)
      from pg_catalog.pg_proc function
      join pg_catalog.pg_namespace namespace
        on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = v_function_name
    ) <> 1 then
      raise exception 'ambiguous category validator function public.%', v_function_name;
    end if;

    select
      function.proowner,
      function.prosecdef,
      function.proconfig,
      function.proacl,
      pg_catalog.pg_get_functiondef(function.oid)
    into
      v_owner,
      v_security_definer,
      v_config,
      v_acl,
      v_definition
    from pg_catalog.pg_proc function
    where function.oid = v_function_oid;

    if pg_catalog.strpos(v_definition, '''deworming''') > 0 then
      raise exception 'category validator public.% already contains deworming', v_function_name;
    end if;

    v_updated_definition := pg_catalog.replace(
      v_definition,
      '''socialization'', ''veterinary''',
      '''deworming'', ''socialization'', ''veterinary'''
    );
    v_updated_definition := pg_catalog.replace(
      v_updated_definition,
      '''socialization'',''veterinary''',
      '''deworming'',''socialization'',''veterinary'''
    );

    if v_updated_definition = v_definition
      or pg_catalog.strpos(v_updated_definition, '''deworming''') = 0 then
      raise exception 'incompatible category validator body for public.%', v_function_name;
    end if;

    execute v_updated_definition;

    if not exists (
      select 1
      from pg_catalog.pg_proc function
      where function.oid = v_function_oid
        and function.proowner = v_owner
        and function.prosecdef = v_security_definer
        and function.proconfig is not distinct from v_config
        and function.proacl is not distinct from v_acl
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(function.oid),
          '''deworming'''
        ) > 0
    ) then
      raise exception 'security or category preservation failed for public.%', v_function_name;
    end if;
  end loop;
end;
$replace_category_validators$;

commit;

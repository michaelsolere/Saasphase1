import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

const ownerId = "10000000-0000-4000-8000-000000000001";
const durableOrganizationId = "20000000-0000-4000-8000-000000000001";
const modelCode = "dog-postnatal-essential-care";
const prefix = "e7300001-0000-4000-8000-";
const like = "e7300001-%";
const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  mother: `${prefix}000000000003`,
  litter: `${prefix}000000000004`,
} as const;

const templateCodes = [
  "dog-postpartum-mother-check",
  "dog-puppy-deworming-schedule",
  "dog-puppy-weaning-start",
  "dog-puppy-veterinary-identification-vaccination",
] as const;

const expectedDurablePostnatalAbsence = {
  models: [],
  modelItems: [],
  modelSlots: [],
  templates: [],
  imports: [],
};

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function jsonSql<T>(statement: string): T {
  const lines = sql(statement).split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line) as T;
    } catch {
      continue;
    }
  }
  throw new Error("E2E SQL did not return a JSON value");
}

function cleanup() {
  sql(`
    begin;
    set local session_replication_role = replica;

    delete from public.maternal_observation_task_links
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.maternal_observation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.maternal_observations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};

    delete from public.litter_care_task_schedule_changes
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or id::text like ${q(like)};

    delete from public.litter_plan_series_time_slots slot
    using public.litter_plan_series series
    where slot.series_id = series.id
      and (
        series.organization_id = ${q(ids.organization)}::uuid
        or series.litter_id::text like ${q(like)}
      );
    delete from public.litter_plan_series_materialization_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_items
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};

    delete from public.litter_planning_model_item_time_slots
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_commands
    where organization_id = ${q(ids.organization)}::uuid
       or client_command_id::text like ${q(like)};
    delete from public.litter_planning_model_items
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_library_import_commands
    where organization_id = ${q(ids.organization)}::uuid
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_task_templates
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};

    delete from public.litters
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.memberships
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.organizations
    where id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};

    commit;
  `);
}

function fixtureCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'links', (select count(*) from public.maternal_observation_task_links where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'observation_commands', (select count(*) from public.maternal_observation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'observations', (select count(*) from public.maternal_observations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or id::text like ${q(like)}),
      'series_slots', (
        select count(*) from public.litter_plan_series_time_slots slot
        join public.litter_plan_series series on series.id = slot.series_id
        where series.organization_id = ${q(ids.organization)}::uuid or series.litter_id::text like ${q(like)}
      ),
      'series_materialization_commands', (select count(*) from public.litter_plan_series_materialization_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'series_state_commands', (select count(*) from public.litter_plan_series_state_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'anchor_commands', (select count(*) from public.litter_plan_anchor_recalculation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'application_commands', (select count(*) from public.litter_plan_application_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'plan_items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'model_commands', (select count(*) from public.litter_planning_model_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid),
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
      'import_commands', (select count(*) from public.litter_planning_model_library_import_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'litters', (select count(*) from public.litters where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'memberships', (select count(*) from public.memberships where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'organizations', (select count(*) from public.organizations where id = ${q(ids.organization)}::uuid or id::text like ${q(like)})
    )::text;
  `);
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(fixtureCounts())) {
    expect(count, `${name} fixtures must be physically deleted`).toBe(0);
  }
}

function growthComparisonSnapshot() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (select count(*) from public.animals where id::text like 'd3c9000%'),
      'litters', (select count(*) from public.litters where id::text like 'd3c90001-%'),
      'sessions', (select count(*) from public.whelping_sessions where id::text like 'd3c90005-%'),
      'events', (select count(*) from public.whelping_events where id::text like 'd3c90006-%'),
      'births', (select count(*) from public.whelping_births where id::text like 'd3c90007-%'),
      'weighing_sessions', (select count(*) from public.litter_weighing_sessions where id::text like 'd3c90009-%'),
      'measurements', (
        select count(*) from public.animal_weight_measurements
        where id::text like 'd3c90008-%' or id::text like 'd3c9000a-%'
      )
    )::text;
  `);
}

function durableOrganizationSnapshot() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'models', (
        select coalesce(jsonb_agg(to_jsonb(model) order by model.id), '[]'::jsonb)
        from public.litter_planning_models model
        where model.organization_id = ${q(durableOrganizationId)}::uuid
          and model.library_model_code = ${q(modelCode)}
          and model.library_model_version = 1
      ),
      'modelItems', (
        select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
        from public.litter_planning_model_items item
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(durableOrganizationId)}::uuid
          and model.library_model_code = ${q(modelCode)}
          and model.library_model_version = 1
      ),
      'modelSlots', (
        select coalesce(jsonb_agg(to_jsonb(slot) order by slot.id), '[]'::jsonb)
        from public.litter_planning_model_item_time_slots slot
        join public.litter_planning_model_items item on item.id = slot.model_item_id
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(durableOrganizationId)}::uuid
          and model.library_model_code = ${q(modelCode)}
          and model.library_model_version = 1
      ),
      'templates', (
        select coalesce(jsonb_agg(to_jsonb(template) order by template.id), '[]'::jsonb)
        from public.litter_care_task_templates template
        where template.organization_id = ${q(durableOrganizationId)}::uuid
          and template.library_template_version = 1
          and template.library_template_code = any(array[
            ${templateCodes.map(q).join(",")}
          ])
      ),
      'imports', (
        select coalesce(jsonb_agg(to_jsonb(command) order by command.id), '[]'::jsonb)
        from public.litter_planning_model_library_import_commands command
        where command.organization_id = ${q(durableOrganizationId)}::uuid
          and command.selection @> jsonb_build_array(jsonb_build_object('code', ${q(modelCode)}, 'version', 1))
      )
    )::text;
  `);
}

function previousCatalogSnapshot() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'models', (
        select jsonb_agg(to_jsonb(model) - 'created_at' order by model.code)
        from public.litter_planning_model_library_models model
        where model.code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose',
          'dog-pre-whelping-temperature-monitoring'
        )
      ),
      'items', (
        select jsonb_agg(to_jsonb(item) - 'created_at' order by item.library_model_code, item.display_order)
        from public.litter_planning_model_library_items item
        where item.library_model_code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose',
          'dog-pre-whelping-temperature-monitoring'
        )
      ),
      'slots', (
        select coalesce(jsonb_agg(to_jsonb(slot) - 'created_at' order by slot.id), '[]'::jsonb)
        from public.litter_planning_model_library_item_time_slots slot
        join public.litter_planning_model_library_items item
          on item.id = slot.library_model_item_id
        where item.library_model_code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose',
          'dog-pre-whelping-temperature-monitoring'
        )
      )
    )::text;
  `);
}

function canonicalCatalog() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'model', (
        select json_build_object(
          'code', code, 'version', version, 'family', family_code,
          'variant', variant_code, 'title', title, 'species', species,
          'breed', breed, 'sortOrder', sort_order, 'available', is_available
        )
        from public.litter_planning_model_library_models
        where code = ${q(modelCode)} and version = 1
      ),
      'templates', (
        select json_agg(json_build_object(
          'code', code, 'version', version, 'pack', pack_code, 'title', title,
          'category', category, 'target', target_scope, 'anchor', anchor_type,
          'offset', offset_days, 'species', species, 'breed', breed,
          'sortOrder', sort_order, 'available', is_available
        ) order by sort_order)
        from public.litter_care_task_library_templates
        where pack_code = ${q(modelCode)}
      ),
      'items', (
        select json_agg(json_build_object(
          'id', item.id::text, 'template', item.library_template_code,
          'kind', item.item_kind, 'priority', item.priority,
          'anchor', item.anchor_type, 'pointOffset', item.point_offset_days,
          'windowStart', item.window_starts_offset_days,
          'windowEnd', item.window_ends_offset_days,
          'recurrenceKind', item.recurrence_kind,
          'interval', item.recurrence_interval_days,
          'recurrenceStart', item.recurrence_starts_offset_days,
          'endKind', item.recurrence_end_kind,
          'recurrenceEnd', item.recurrence_ends_offset_days,
          'horizon', item.initial_materialization_horizon_days,
          'maximum', item.absolute_max_occurrences,
          'fact', item.completion_fact_kind, 'order', item.display_order,
          'required', item.is_required, 'selected', item.is_selected_by_default,
          'slots', (
            select coalesce(json_agg(slot.local_time::text order by slot.slot_no), '[]'::json)
            from public.litter_planning_model_library_item_time_slots slot
            where slot.library_model_item_id = item.id
          )
        ) order by item.display_order)
        from public.litter_planning_model_library_items item
        where item.library_model_code = ${q(modelCode)}
          and item.library_model_version = 1
      )
    )::text;
  `);
}

function seedFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.organization)}::uuid, 'Organisation postnatale e7300001', 'dog-postnatal-e7300001');

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.membership)}::uuid, ${q(ids.organization)}::uuid,
      ${q(ownerId)}::uuid, 'owner', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(ids.organization)}::uuid,
      'Mère postnatale e7300001', 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      actual_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(ids.organization)}::uuid,
      'Portée postnatale e7300001', 'dog', 'Golden Retriever',
      ${q(ids.mother)}::uuid, 'born', '2026-06-01',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function importState() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid and library_model_code = ${q(modelCode)}),
      'modelItems', (
        select count(*) from public.litter_planning_model_items item
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(ids.organization)}::uuid and model.library_model_code = ${q(modelCode)}
      ),
      'modelSlots', (
        select count(*) from public.litter_planning_model_item_time_slots slot
        join public.litter_planning_model_items item on item.id = slot.model_item_id
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(ids.organization)}::uuid and model.library_model_code = ${q(modelCode)}
      ),
      'templates', (
        select count(*) from public.litter_care_task_templates
        where organization_id = ${q(ids.organization)}::uuid
          and library_template_code = any(array[${templateCodes.map(q).join(",")}])
      ),
      'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
      'planItems', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
      'series', (select count(*) from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid)
    )::text;
  `);
}

function applicationState() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid and status = 'active'),
      'items', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
      'series', (select count(*) from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid),
      'seriesSlots', (
        select count(*) from public.litter_plan_series_time_slots slot
        join public.litter_plan_series series on series.id = slot.series_id
        where series.litter_id = ${q(ids.litter)}::uuid
      ),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid),
      'snapshots', (
        select json_agg(json_build_object(
          'order', item.display_order, 'kind', item.item_kind,
          'category', item.category, 'target', item.target_scope,
          'anchor', item.anchor_type, 'fact', item.completion_fact_kind,
          'state', item.materialization_state
        ) order by item.display_order)
        from public.litter_plan_items item where item.litter_id = ${q(ids.litter)}::uuid
      ),
      'seriesCategory', (
        select item.category
        from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        where series.litter_id = ${q(ids.litter)}::uuid
      ),
      'organizationTemplateCategory', (
        select category
        from public.litter_care_task_templates
        where organization_id = ${q(ids.organization)}::uuid
          and library_template_code = 'dog-puppy-deworming-schedule'
          and library_template_version = 1
      ),
      'organizationModelCategory', (
        select template.category
        from public.litter_planning_model_items item
        join public.litter_planning_models model on model.id = item.model_id
        join public.litter_care_task_templates template
          on template.id = item.organization_template_id
        where model.organization_id = ${q(ids.organization)}::uuid
          and model.library_model_code = ${q(modelCode)}
          and template.library_template_code = 'dog-puppy-deworming-schedule'
      ),
      'dewormingOccurrences', (
        select count(*)
        from public.litter_care_tasks
        where litter_id = ${q(ids.litter)}::uuid and category = 'deworming'
      ),
      'seriesSlot', (
        select slot.local_time::text from public.litter_plan_series_time_slots slot
        join public.litter_plan_series series on series.id = slot.series_id
        where series.litter_id = ${q(ids.litter)}::uuid
      ),
      'taskRows', (
        select json_agg(json_build_object(
          'title', task.title, 'category', task.category, 'kind', task.item_kind,
          'date', task.planned_for::text, 'time', task.scheduled_local_time::text,
          'start', task.retained_starts_on::text, 'end', task.retained_ends_on::text,
          'status', task.status, 'source', task.schedule_source,
          'locked', task.is_schedule_locked
        ) order by coalesce(task.planned_for, task.retained_starts_on), task.scheduled_local_time nulls first)
        from public.litter_care_tasks task where task.litter_id = ${q(ids.litter)}::uuid
      )
    )::text;
  `);
}

function inventedFacts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'maternalObservations', (select count(*) from public.maternal_observations where litter_id = ${q(ids.litter)}::uuid),
      'observationTaskLinks', (select count(*) from public.maternal_observation_task_links where litter_id = ${q(ids.litter)}::uuid),
      'weightMeasurements', (
        select count(*) from public.animal_weight_measurements measurement
        join public.animals animal on animal.id = measurement.animal_id
        where animal.organization_id = ${q(ids.organization)}::uuid
      ),
      'weighingSessions', (select count(*) from public.litter_weighing_sessions where litter_id = ${q(ids.litter)}::uuid),
      'whelpingSessions', (select count(*) from public.whelping_sessions where litter_id = ${q(ids.litter)}::uuid),
      'whelpingEvents', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid),
      'documents', (select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid),
      'payments', (select count(*) from public.payments where organization_id = ${q(ids.organization)}::uuid),
      'reservations', (select count(*) from public.reservations where organization_id = ${q(ids.organization)}::uuid),
      'emails', (select count(*) from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid),
      'resolvedTasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid and status <> 'planned')
    )::text;
  `);
}

function categoryFunctionSecurity() {
  return jsonSql<Record<string, unknown>[]>(`
    select coalesce(json_agg(json_build_object(
      'name', function.proname,
      'securityDefiner', function.prosecdef,
      'config', function.proconfig,
      'authenticatedExecute', has_function_privilege('authenticated', function.oid, 'EXECUTE'),
      'anonExecute', has_function_privilege('anon', function.oid, 'EXECUTE'),
      'containsDeworming', position('deworming' in pg_get_functiondef(function.oid)) > 0
    ) order by function.proname), '[]'::json)::text
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'create_litter_care_task',
        'create_litter_care_task_template',
        'update_litter_care_task_template',
        'create_litter_plan_ad_hoc_item',
        'update_litter_plan_ad_hoc_item_metadata'
      );
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function libraryCard(page: Page) {
  return page.locator(`[data-library-model='${modelCode}:1']`);
}

function applyPanel(page: Page) {
  return page.getByRole("region", {
    name: "Programmer le planning de la portée",
  });
}

function applyCard(page: Page) {
  return applyPanel(page).locator("li").filter({
    hasText: "Soins postnatals — essentiels jusqu’à 8 semaines",
  });
}

test("importe et applique le modèle postnatal essentiel sans inventer de faits", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();

  const growthBefore = growthComparisonSnapshot();
  const durableBefore = durableOrganizationSnapshot();
  const previousCatalogBefore = previousCatalogSnapshot();
  expect(durableBefore).toEqual(expectedDurablePostnatalAbsence);
  expect(growthBefore).toEqual({
    animals: 13,
    litters: 2,
    sessions: 2,
    events: 11,
    births: 9,
    weighing_sessions: 62,
    measurements: 286,
  });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );

  let owner: SupabaseClient<Database> | null = null;
  try {
    expect(canonicalCatalog()).toEqual({
      model: {
        code: modelCode,
        version: 1,
        family: "dog-postnatal",
        variant: "essential-care",
        title: "Soins postnatals — essentiels jusqu’à 8 semaines",
        species: "dog",
        breed: null,
        sortOrder: 40,
        available: true,
      },
      templates: [
        {
          code: "dog-postpartum-mother-check",
          version: 1,
          pack: modelCode,
          title: "Contrôler l’état post-partum de la mère",
          category: "maternal_health",
          target: "mother",
          anchor: "offspring_age",
          offset: 1,
          species: "dog",
          breed: null,
          sortOrder: 100,
          available: true,
        },
        {
          code: "dog-puppy-deworming-schedule",
          version: 1,
          pack: modelCode,
          title: "Vermifuger les chiots",
          category: "deworming",
          target: "all_offspring",
          anchor: "offspring_age",
          offset: 14,
          species: "dog",
          breed: null,
          sortOrder: 110,
          available: true,
        },
        {
          code: "dog-puppy-weaning-start",
          version: 1,
          pack: modelCode,
          title: "Commencer la transition alimentaire des chiots",
          category: "offspring_feeding",
          target: "all_offspring",
          anchor: "offspring_age",
          offset: 21,
          species: "dog",
          breed: null,
          sortOrder: 120,
          available: true,
        },
        {
          code: "dog-puppy-veterinary-identification-vaccination",
          version: 1,
          pack: modelCode,
          title: "Visite vétérinaire — examen, identification et vaccination",
          category: "veterinary",
          target: "litter",
          anchor: "offspring_age",
          offset: 49,
          species: "dog",
          breed: null,
          sortOrder: 130,
          available: true,
        },
      ],
      items: [
        {
          id: "da7b2026-0730-4000-8000-000000000001",
          template: "dog-postpartum-mother-check",
          kind: "task",
          priority: "important",
          anchor: "offspring_age",
          pointOffset: 1,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: null,
          interval: null,
          recurrenceStart: null,
          endKind: null,
          recurrenceEnd: null,
          horizon: null,
          maximum: null,
          fact: null,
          order: 0,
          required: false,
          selected: true,
          slots: [],
        },
        {
          id: "da7b2026-0730-4000-8000-000000000002",
          template: "dog-puppy-deworming-schedule",
          kind: "recurring_task",
          priority: "important",
          anchor: "offspring_age",
          pointOffset: null,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: "daily_interval",
          interval: 14,
          recurrenceStart: 14,
          endKind: "fixed_end_offset",
          recurrenceEnd: 56,
          horizon: 43,
          maximum: 4,
          fact: null,
          order: 1,
          required: false,
          selected: true,
          slots: ["09:00:00"],
        },
        {
          id: "da7b2026-0730-4000-8000-000000000003",
          template: "dog-puppy-weaning-start",
          kind: "task",
          priority: "normal",
          anchor: "offspring_age",
          pointOffset: 21,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: null,
          interval: null,
          recurrenceStart: null,
          endKind: null,
          recurrenceEnd: null,
          horizon: null,
          maximum: null,
          fact: null,
          order: 2,
          required: false,
          selected: true,
          slots: [],
        },
        {
          id: "da7b2026-0730-4000-8000-000000000004",
          template: "dog-puppy-veterinary-identification-vaccination",
          kind: "window",
          priority: "important",
          anchor: "offspring_age",
          pointOffset: null,
          windowStart: 49,
          windowEnd: 56,
          recurrenceKind: null,
          interval: null,
          recurrenceStart: null,
          endKind: null,
          recurrenceEnd: null,
          horizon: null,
          maximum: null,
          fact: null,
          order: 3,
          required: false,
          selected: true,
          slots: [],
        },
      ],
    });

    for (const functionState of categoryFunctionSecurity()) {
      expect(functionState).toMatchObject({
        securityDefiner: true,
        authenticatedExecute: true,
        anonExecute: false,
        containsDeworming: true,
      });
      expect(functionState.config).toEqual(
        expect.arrayContaining(["search_path=\"\"", "row_security=off"]),
      );
    }

    seedFixtures();
    expect(growthComparisonSnapshot()).toEqual(growthBefore);

    await login(page);
    await page.goto("/settings/litter-planning-models");
    const card = libraryCard(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText(
      "Soins postnatals — essentiels jusqu’à 8 semaines",
    );
    await expect(card).toContainText("Postnatal");
    await expect(card).toContainText("Soins essentiels");
    await card
      .getByRole("button", { name: "Voir le détail des éléments" })
      .click();
    const details = page.getByRole("dialog");
    await expect(details).toContainText("Contrôler l’état post-partum de la mère");
    await expect(details).toContainText("Vermifuger les chiots");
    await expect(details).toContainText(
      "Commencer la transition alimentaire des chiots",
    );
    await expect(details).toContainText(
      "Visite vétérinaire — examen, identification et vaccination",
    );
    await expect(details).toContainText(
      "Tous les 14 jours · 09 h 00 à partir du 14e jour de vie jusqu’au 56e jour de vie",
    );
    await details.getByRole("button", { name: "Fermer" }).click();

    owner = await createAuthenticatedSupabaseClient();
    const imported = await owner.rpc(
      "import_litter_planning_model_library_models",
      {
        p_organization_id: ids.organization,
        p_client_command_id: `${prefix}000000000010`,
        p_selection: [{ code: modelCode, version: 1 }] as Json,
        p_is_active: true,
      },
    );
    expect(imported.error).toBeNull();
    expect(imported.data?.[0]).toMatchObject({
      outcome: "success",
      imported_count: 1,
      already_imported_count: 0,
      elementary_imported_count: 4,
      elementary_already_imported_count: 0,
      replayed: false,
    });
    await expect
      .poll(() => importState(), { timeout: 30_000 })
      .toEqual({
        models: 1,
        modelItems: 4,
        modelSlots: 1,
        templates: 4,
        plans: 0,
        planItems: 0,
        series: 0,
        tasks: 0,
      });

    await page.goto(`/litters/journal?litter=${ids.litter}`);
    const postnatal = applyCard(page);
    await expect(postnatal).toBeVisible();
    await postnatal.getByRole("button", { name: "Consulter le contenu" }).click();
    await expect(postnatal).toContainText("Vermifuges");
    await expect(postnatal).toContainText(
      "Tous les 14 jours · 09 h 00 à partir du 14e jour de vie jusqu’au 56e jour de vie",
    );

    await postnatal.getByRole("button", { name: "Appliquer ce modèle" }).click();
    const applyDialog = page.getByRole("dialog");
    await expect(applyDialog.locator("input[type='checkbox']")).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(
        applyDialog.locator("input[type='checkbox']").nth(index),
      ).toBeChecked();
      await expect(
        applyDialog.locator("input[type='checkbox']").nth(index),
      ).toBeEnabled();
    }
    await applyDialog.getByRole("button", { name: "Continuer" }).click();
    await applyDialog.getByRole("button", { name: "Appliquer le modèle" }).click();
    await expect(postnatal).toContainText("Déjà appliqué", { timeout: 30_000 });

    expect(applicationState()).toEqual({
      plans: 1,
      items: 4,
      series: 1,
      seriesSlots: 1,
      tasks: 7,
      snapshots: [
        {
          order: 0,
          kind: "task",
          category: "maternal_health",
          target: "mother",
          anchor: "offspring_age",
          fact: null,
          state: "materialized",
        },
        {
          order: 1,
          kind: "recurring_task",
          category: "deworming",
          target: "all_offspring",
          anchor: "offspring_age",
          fact: null,
          state: "materialized",
        },
        {
          order: 2,
          kind: "task",
          category: "offspring_feeding",
          target: "all_offspring",
          anchor: "offspring_age",
          fact: null,
          state: "materialized",
        },
        {
          order: 3,
          kind: "window",
          category: "veterinary",
          target: "litter",
          anchor: "offspring_age",
          fact: null,
          state: "materialized",
        },
      ],
      seriesCategory: "deworming",
      organizationTemplateCategory: "deworming",
      organizationModelCategory: "deworming",
      dewormingOccurrences: 4,
      seriesSlot: "09:00:00",
      taskRows: [
        {
          title: "Contrôler l’état post-partum de la mère",
          category: "maternal_health",
          kind: "task",
          date: "2026-06-02",
          time: null,
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Vermifuger les chiots",
          category: "deworming",
          kind: "recurring_task",
          date: "2026-06-15",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Commencer la transition alimentaire des chiots",
          category: "offspring_feeding",
          kind: "task",
          date: "2026-06-22",
          time: null,
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Vermifuger les chiots",
          category: "deworming",
          kind: "recurring_task",
          date: "2026-06-29",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Vermifuger les chiots",
          category: "deworming",
          kind: "recurring_task",
          date: "2026-07-13",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Visite vétérinaire — examen, identification et vaccination",
          category: "veterinary",
          kind: "window",
          date: null,
          time: null,
          start: "2026-07-20",
          end: "2026-07-27",
          status: "planned",
          source: "suggested",
          locked: false,
        },
        {
          title: "Vermifuger les chiots",
          category: "deworming",
          kind: "recurring_task",
          date: "2026-07-27",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
        },
      ],
    });

    expect(inventedFacts()).toEqual({
      maternalObservations: 0,
      observationTaskLinks: 0,
      weightMeasurements: 0,
      weighingSessions: 0,
      whelpingSessions: 0,
      whelpingEvents: 0,
      births: 0,
      documents: 0,
      payments: 0,
      reservations: 0,
      emails: 0,
      resolvedTasks: 0,
    });

    await expect(page.getByText("Vermifuges").first()).toBeVisible();
    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );

    await page.reload();
    await expect(applyCard(page)).toContainText("Déjà appliqué");
    await expect(
      applyCard(page).getByRole("button", { name: "Appliquer ce modèle" }),
    ).toHaveCount(0);

    expect(previousCatalogSnapshot()).toEqual(previousCatalogBefore);
    expect(durableOrganizationSnapshot()).toEqual(
      expectedDurablePostnatalAbsence,
    );
    expect(growthComparisonSnapshot()).toEqual(growthBefore);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    console.log(
      `DOG_POSTNATAL_CARE_MODEL_01_FIXTURES=${JSON.stringify({
        directIds: ids,
        organizationModels: jsonSql<string[]>(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_planning_models
          where organization_id = ${q(ids.organization)}::uuid
        `),
        organizationTemplates: jsonSql<string[]>(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_care_task_templates
          where organization_id = ${q(ids.organization)}::uuid
        `),
        planItems: jsonSql<string[]>(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid
        `),
        series: jsonSql<string[]>(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid
        `),
        tasks: jsonSql<string[]>(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid
        `),
      })}`,
    );
  } finally {
    if (owner) await owner.auth.signOut();
    cleanup();
    expectCleanupAtZero();
    expect(durableOrganizationSnapshot()).toEqual(
      expectedDurablePostnatalAbsence,
    );
    expect(previousCatalogSnapshot()).toEqual(previousCatalogBefore);
    expect(growthComparisonSnapshot()).toEqual(growthBefore);
    console.log(
      `DOG_POSTNATAL_CARE_MODEL_01_CLEANUP=${JSON.stringify(fixtureCounts())}`,
    );
  }
});

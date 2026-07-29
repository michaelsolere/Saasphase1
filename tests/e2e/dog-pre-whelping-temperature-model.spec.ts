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

type Supabase = SupabaseClient<Database>;

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const modelCode = "dog-pre-whelping-temperature-monitoring";
const prefix = "d7290003-0000-4000-8000-";
const like = `${prefix}%`;
const expectedBirthDate = "2026-08-03";

const ids = {
  mother: `${prefix}000000000001`,
  litter: `${prefix}000000000002`,
  importCommand: `${prefix}000000000010`,
  applyCommand: `${prefix}000000000011`,
  observationCommand: `${prefix}000000000012`,
} as const;

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

    create temporary table cleanup_models (id uuid primary key) on commit drop;
    create temporary table cleanup_templates (id uuid primary key) on commit drop;

    insert into cleanup_models (id)
    select model.id
    from public.litter_planning_models model
    where model.organization_id = ${q(organizationId)}::uuid
      and model.library_model_code = ${q(modelCode)}
      and model.library_model_version = 1;

    insert into cleanup_templates (id)
    select distinct (entry.value ->> 'templateId')::uuid
    from public.litter_planning_model_library_import_commands command
    cross join lateral jsonb_array_elements(command.elementary_result) entry(value)
    where command.organization_id = ${q(organizationId)}::uuid
      and command.selection @> jsonb_build_array(
        jsonb_build_object('code', ${q(modelCode)}, 'version', 1)
      )
      and entry.value ->> 'state' = 'imported';

    delete from public.maternal_observation_task_links
    where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.maternal_observation_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.maternal_observations
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};

    delete from public.litter_care_task_schedule_changes
    where litter_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
    where litter_id::text like ${q(like)} or id::text like ${q(like)};

    delete from public.litter_plan_series_time_slots slot
    using public.litter_plan_series series
    where slot.series_id = series.id
      and series.litter_id::text like ${q(like)};
    delete from public.litter_plan_series_materialization_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series
    where litter_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
    where litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_items
    where litter_id::text like ${q(like)};
    delete from public.litter_plans
    where litter_id::text like ${q(like)};

    delete from public.litter_planning_model_item_time_slots slot
    using public.litter_planning_model_items item, cleanup_models model
    where slot.model_item_id = item.id
      and item.model_id = model.id;
    delete from public.litter_planning_model_commands command
    using cleanup_models model
    where command.model_id = model.id;
    delete from public.litter_planning_model_items item
    using cleanup_models model
    where item.model_id = model.id;
    delete from public.litter_planning_models model
    using cleanup_models cleanup
    where model.id = cleanup.id;

    delete from public.litter_planning_model_library_import_commands command
    where command.organization_id = ${q(organizationId)}::uuid
      and (
        command.client_command_id::text like ${q(like)}
        or command.selection @> jsonb_build_array(
          jsonb_build_object('code', ${q(modelCode)}, 'version', 1)
        )
      );

    delete from public.litter_care_task_templates template
    using cleanup_templates cleanup
    where template.id = cleanup.id;

    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};

    commit;
  `);
}

function remainingCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'links', (
        select count(*) from public.maternal_observation_task_links
        where litter_id::text like ${q(like)} or id::text like ${q(like)}
      ),
      'observation_commands', (
        select count(*) from public.maternal_observation_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'observations', (
        select count(*) from public.maternal_observations
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'schedule_changes', (
        select count(*) from public.litter_care_task_schedule_changes
        where litter_id::text like ${q(like)}
      ),
      'schedule_commands', (
        select count(*) from public.litter_care_task_schedule_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where litter_id::text like ${q(like)} or id::text like ${q(like)}
      ),
      'series_slots', (
        select count(*)
        from public.litter_plan_series_time_slots slot
        join public.litter_plan_series series on series.id = slot.series_id
        where series.litter_id::text like ${q(like)}
      ),
      'series_materialization_commands', (
        select count(*) from public.litter_plan_series_materialization_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'series_state_commands', (
        select count(*) from public.litter_plan_series_state_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'anchor_commands', (
        select count(*) from public.litter_plan_anchor_recalculation_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'series', (
        select count(*) from public.litter_plan_series
        where litter_id::text like ${q(like)}
      ),
      'application_commands', (
        select count(*) from public.litter_plan_application_commands
        where litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'plan_items', (
        select count(*) from public.litter_plan_items
        where litter_id::text like ${q(like)}
      ),
      'plans', (
        select count(*) from public.litter_plans
        where litter_id::text like ${q(like)}
      ),
      'organization_models', (
        select count(*) from public.litter_planning_models
        where organization_id = ${q(organizationId)}::uuid
          and library_model_code = ${q(modelCode)}
      ),
      'import_commands', (
        select count(*) from public.litter_planning_model_library_import_commands
        where organization_id = ${q(organizationId)}::uuid
          and (
            client_command_id::text like ${q(like)}
            or selection @> jsonb_build_array(
              jsonb_build_object('code', ${q(modelCode)}, 'version', 1)
            )
          )
      ),
      'litters', (
        select count(*) from public.litters where id::text like ${q(like)}
      ),
      'animals', (
        select count(*) from public.animals where id::text like ${q(like)}
      )
    )::text;
  `);
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be physically deleted`).toBe(0);
  }
}

function elementaryOrganizationSnapshot() {
  return jsonSql<unknown[]>(`
    select coalesce(
      json_agg(
        to_jsonb(template) - 'created_at' - 'updated_at'
        order by template.library_template_code, template.id
      ),
      '[]'::json
    )::text
    from public.litter_care_task_templates template
    where template.organization_id = ${q(organizationId)}::uuid
      and template.library_template_code in (
        'dog-temperature-monitoring-period',
        'dog-prepare-whelping-journal',
        'dog-whelping-vigilance-window'
      );
  `);
}

function gestationSnapshot() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'models', (
        select jsonb_agg(to_jsonb(model) - 'created_at' order by model.sort_order)
        from public.litter_planning_model_library_models model
        where model.code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose'
        )
      ),
      'items', (
        select jsonb_agg(to_jsonb(item) - 'created_at' order by item.library_model_code, item.display_order)
        from public.litter_planning_model_library_items item
        where item.library_model_code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose'
        )
      ),
      'slots', (
        select coalesce(jsonb_agg(to_jsonb(slot) - 'created_at' order by slot.id), '[]'::jsonb)
        from public.litter_planning_model_library_item_time_slots slot
        join public.litter_planning_model_library_items item
          on item.id = slot.library_model_item_id
        where item.library_model_code in (
          'dog-gestation-standard',
          'dog-gestation-herpesvirose'
        )
      )
    )::text;
  `);
}

function growthComparisonSnapshot() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (
        select count(*) from public.animals where id::text like 'd3c9000%'
      ),
      'litters', (
        select count(*) from public.litters where id::text like 'd3c90001-%'
      ),
      'sessions', (
        select count(*) from public.whelping_sessions where id::text like 'd3c90005-%'
      ),
      'events', (
        select count(*) from public.whelping_events where id::text like 'd3c90006-%'
      ),
      'births', (
        select count(*) from public.whelping_births where id::text like 'd3c90007-%'
      ),
      'weighing_sessions', (
        select count(*) from public.litter_weighing_sessions where id::text like 'd3c90009-%'
      ),
      'measurements', (
        select count(*) from public.animal_weight_measurements
        where id::text like 'd3c90008-%' or id::text like 'd3c9000a-%'
      )
    )::text;
  `);
}

function canonicalModel() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'model', (
        select json_build_object(
          'code', code,
          'version', version,
          'title', title,
          'description', description,
          'species', species,
          'breed', breed,
          'available', is_available,
          'sortOrder', sort_order
        )
        from public.litter_planning_model_library_models
        where code = ${q(modelCode)} and version = 1
      ),
      'items', (
        select json_agg(
          json_build_object(
            'id', item.id::text,
            'template', item.library_template_code,
            'templateVersion', item.library_template_version,
            'kind', item.item_kind,
            'priority', item.priority,
            'anchor', item.anchor_type,
            'pointOffset', item.point_offset_days,
            'pointTime', item.point_local_time,
            'windowStart', item.window_starts_offset_days,
            'windowEnd', item.window_ends_offset_days,
            'recurrenceKind', item.recurrence_kind,
            'intervalDays', item.recurrence_interval_days,
            'recurrenceStart', item.recurrence_starts_offset_days,
            'recurrenceEndKind', item.recurrence_end_kind,
            'horizonDays', item.initial_materialization_horizon_days,
            'absoluteMax', item.absolute_max_occurrences,
            'completionFactKind', item.completion_fact_kind,
            'required', item.is_required,
            'selected', item.is_selected_by_default,
            'slots', (
              select coalesce(json_agg(slot.local_time::text order by slot.slot_no), '[]'::json)
              from public.litter_planning_model_library_item_time_slots slot
              where slot.library_model_item_id = item.id
            )
          )
          order by item.display_order
        )
        from public.litter_planning_model_library_items item
        where item.library_model_code = ${q(modelCode)}
          and item.library_model_version = 1
      )
    )::text;
  `);
}

function seedScope() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid,
      ${q(organizationId)}::uuid,
      'Mère pré-mise-bas d7290003',
      'dog',
      'Golden Retriever',
      'female',
      'breeding',
      'owned',
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date,
      created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid,
      ${q(organizationId)}::uuid,
      'Portée pré-mise-bas d7290003',
      'dog',
      'Golden Retriever',
      ${q(ids.mother)}::uuid,
      'birth_expected',
      '2026-06-01',
      ${q(expectedBirthDate)}::date,
      null,
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
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

async function importModel(owner: Supabase) {
  const selection = [{ code: modelCode, version: 1 }] as Json;
  const first = await owner.rpc("import_litter_planning_model_library_models", {
    p_organization_id: organizationId,
    p_client_command_id: ids.importCommand,
    p_selection: selection,
    p_is_active: true,
  });
  expect(first.error).toBeNull();
  expect(first.data?.[0]).toMatchObject({
    outcome: "success",
    imported_count: 1,
    already_imported_count: 0,
    replayed: false,
  });

  const replay = await owner.rpc("import_litter_planning_model_library_models", {
    p_organization_id: organizationId,
    p_client_command_id: ids.importCommand,
    p_selection: selection,
    p_is_active: true,
  });
  expect(replay.error).toBeNull();
  expect(replay.data?.[0]).toMatchObject({
    outcome: "success",
    imported_count: 1,
    already_imported_count: 0,
    replayed: true,
  });

  const modelId = first.data?.[0]?.result?.[0];
  if (
    typeof modelId !== "object" ||
    modelId === null ||
    !("modelId" in modelId) ||
    typeof modelId.modelId !== "string"
  ) {
    throw new Error("Imported model id is missing");
  }
  return modelId.modelId;
}

function fixtureManifest() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'directIds', json_build_object(
        'mother', ${q(ids.mother)},
        'litter', ${q(ids.litter)},
        'importCommand', ${q(ids.importCommand)},
        'applyCommand', ${q(ids.applyCommand)},
        'observationCommand', ${q(ids.observationCommand)}
      ),
      'organizationModels', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_planning_models
        where organization_id = ${q(organizationId)}::uuid
          and library_model_code = ${q(modelCode)}
      ),
      'organizationTemplates', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_care_task_templates
        where organization_id = ${q(organizationId)}::uuid
          and library_template_code in (
            'dog-temperature-monitoring-period',
            'dog-prepare-whelping-journal',
            'dog-whelping-vigilance-window'
          )
      ),
      'planItems', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid
      ),
      'series', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid
      ),
      'tasks', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid
      ),
      'observations', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.maternal_observations where litter_id = ${q(ids.litter)}::uuid
      ),
      'links', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.maternal_observation_task_links
        where litter_id = ${q(ids.litter)}::uuid
      )
    )::text;
  `);
}

test("importe, applique et rapproche le modèle pré-mise-bas sans modifier la gestation", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();
  const elementaryBefore = elementaryOrganizationSnapshot();
  const gestationBefore = gestationSnapshot();
  const growthBefore = growthComparisonSnapshot();
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
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  let owner: Supabase | null = null;
  try {
    expect(canonicalModel()).toEqual({
      model: {
        code: modelCode,
        version: 1,
        title: "Surveillance pré-mise-bas — températures",
        description:
          "Suivi opérationnel de la mère avant la mise-bas : températures deux fois par jour, préparation du Journal et période de vigilance. Modèle facultatif et modifiable après import, à adapter au protocole de l’élevage et aux recommandations vétérinaires.",
        species: "dog",
        breed: null,
        available: true,
        sortOrder: 30,
      },
      items: [
        {
          id: "d7290002-0000-4000-8000-000000000001",
          template: "dog-temperature-monitoring-period",
          templateVersion: 1,
          kind: "recurring_task",
          priority: "important",
          anchor: "expected_birth",
          pointOffset: null,
          pointTime: null,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: "daily_interval",
          intervalDays: 1,
          recurrenceStart: -5,
          recurrenceEndKind: "actual_birth",
          horizonDays: 7,
          absoluteMax: 30,
          completionFactKind: "maternal_temperature_observation",
          required: true,
          selected: true,
          slots: ["08:00:00", "20:00:00"],
        },
        {
          id: "d7290002-0000-4000-8000-000000000002",
          template: "dog-prepare-whelping-journal",
          templateVersion: 1,
          kind: "task",
          priority: "normal",
          anchor: "expected_birth",
          pointOffset: -2,
          pointTime: null,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: null,
          intervalDays: null,
          recurrenceStart: null,
          recurrenceEndKind: null,
          horizonDays: null,
          absoluteMax: null,
          completionFactKind: null,
          required: false,
          selected: true,
          slots: [],
        },
        {
          id: "d7290002-0000-4000-8000-000000000003",
          template: "dog-whelping-vigilance-window",
          templateVersion: 1,
          kind: "window",
          priority: "important",
          anchor: "expected_birth",
          pointOffset: null,
          pointTime: null,
          windowStart: -1,
          windowEnd: 2,
          recurrenceKind: null,
          intervalDays: null,
          recurrenceStart: null,
          recurrenceEndKind: null,
          horizonDays: null,
          absoluteMax: null,
          completionFactKind: null,
          required: false,
          selected: true,
          slots: [],
        },
      ],
    });

    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_model_library_models
          where is_available and sort_order < 30
            and code in ('dog-gestation-standard', 'dog-gestation-herpesvirose');
        `),
      ),
    ).toBe(2);

    await login(page);
    await page.goto("/settings/litter-planning-models");
    const card = page.locator(
      `[data-library-model='${modelCode}:1']`,
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText("Surveillance pré-mise-bas — températures");
    await expect(card).toContainText("Modèle facultatif et modifiable après import");
    await expect(card).toContainText("Pré-mise-bas");
    await expect(card).toContainText("Surveillance des températures");
    await card
      .getByRole("button", { name: "Voir le détail des éléments" })
      .click();
    const details = page.getByRole("dialog");
    await expect(details).toContainText("Période de relevés de température");
    await expect(details).toContainText("Préparer le Journal de mise-bas");
    await expect(details).toContainText("Fenêtre probable de mise-bas");
    await expect(details).toContainText("Deux fois par jour");
    await expect(details).toContainText("08 h 00 et 20 h 00");
    await expect(details).toContainText("5 jours avant la mise-bas estimée");
    await expect(details).toContainText("jusqu’à la mise-bas réelle");
    await expect(details).toContainText(
      "Validation automatique par le Journal",
    );
    await expect(details).toContainText("Température maternelle enregistrée");
    await details.getByRole("button", { name: "Fermer" }).click();

    owner = await createAuthenticatedSupabaseClient();
    const importedModelId = await importModel(owner);
    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_models
          where organization_id = ${q(organizationId)}::uuid
            and library_model_code = ${q(modelCode)}
            and library_model_version = 1;
        `),
      ),
    ).toBe(1);
    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_model_items
          where model_id = ${q(importedModelId)}::uuid;
        `),
      ),
    ).toBe(3);
    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_model_item_time_slots slot
          join public.litter_planning_model_items item
            on item.id = slot.model_item_id
          where item.model_id = ${q(importedModelId)}::uuid;
        `),
      ),
    ).toBe(2);

    seedScope();
    const applied = await owner.rpc("apply_litter_planning_model", {
      p_litter_id: ids.litter,
      p_planning_model_id: importedModelId,
      p_client_command_id: ids.applyCommand,
      p_expected_model_revision: 1,
      p_expected_plan_revision: null,
      p_selected_model_item_ids: null,
      p_timezone_name: "Europe/Paris",
    });
    expect(applied.error).toBeNull();
    expect(applied.data?.[0]?.outcome).toBe("success");

    const application = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'snapshots', (
          select json_agg(
            json_build_object(
              'order', display_order,
              'kind', item_kind,
              'category', category,
              'target', target_scope,
              'priority', priority,
              'anchor', anchor_type,
              'pointOffset', point_offset_days,
              'pointTime', point_local_time,
              'windowStart', window_starts_offset_days,
              'windowEnd', window_ends_offset_days,
              'recurrenceKind', recurrence_kind,
              'intervalDays', recurrence_interval_days,
              'recurrenceStart', recurrence_starts_offset_days,
              'recurrenceEndKind', recurrence_end_kind,
              'horizonDays', initial_materialization_horizon_days,
              'absoluteMax', absolute_max_occurrences,
              'completionFactKind', completion_fact_kind,
              'required', is_required_snapshot,
              'selected', is_selected_by_default_snapshot
            )
            order by display_order
          )
          from public.litter_plan_items
          where litter_id = ${q(ids.litter)}::uuid
        ),
        'series', (
          select json_build_object(
            'count', count(*),
            'startsOn', min(starts_on)::text,
            'endsOn', min(ends_on)::text,
            'endKind', min(end_kind),
            'horizonDays', min(initial_materialization_horizon_days),
            'absoluteMax', min(absolute_max_occurrences),
            'materializedCount', min(materialized_occurrence_count)
          )
          from public.litter_plan_series
          where litter_id = ${q(ids.litter)}::uuid
        ),
        'seriesSlots', (
          select json_agg(slot.local_time::text order by slot.slot_no)
          from public.litter_plan_series_time_slots slot
          join public.litter_plan_series series on series.id = slot.series_id
          where series.litter_id = ${q(ids.litter)}::uuid
        ),
        'recurringOccurrences', (
          select count(*) from public.litter_care_tasks
          where litter_id = ${q(ids.litter)}::uuid
            and litter_plan_series_id is not null
        ),
        'recurringDates', (
          select json_agg(distinct planned_for order by planned_for)
          from public.litter_care_tasks
          where litter_id = ${q(ids.litter)}::uuid
            and litter_plan_series_id is not null
        ),
        'recurringTimes', (
          select json_agg(distinct scheduled_local_time::text order by scheduled_local_time::text)
          from public.litter_care_tasks
          where litter_id = ${q(ids.litter)}::uuid
            and litter_plan_series_id is not null
        ),
        'pointTask', (
          select json_build_object(
            'count', count(*),
            'date', min(planned_for)::text,
            'time', min(scheduled_local_time)::text
          )
          from public.litter_care_tasks task
          join public.litter_plan_items item on item.id = task.litter_plan_item_id
          where task.litter_id = ${q(ids.litter)}::uuid
            and item.item_kind = 'task'
        ),
        'windowTask', (
          select json_build_object(
            'count', count(*),
            'start', min(retained_starts_on)::text,
            'end', min(retained_ends_on)::text
          )
          from public.litter_care_tasks task
          join public.litter_plan_items item on item.id = task.litter_plan_item_id
          where task.litter_id = ${q(ids.litter)}::uuid
            and item.item_kind = 'window'
        )
      )::text;
    `);
    expect(application).toEqual({
      snapshots: [
        {
          order: 0,
          kind: "recurring_task",
          category: "maternal_health",
          target: "mother",
          priority: "important",
          anchor: "expected_birth",
          pointOffset: null,
          pointTime: null,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: "daily_interval",
          intervalDays: 1,
          recurrenceStart: -5,
          recurrenceEndKind: "actual_birth",
          horizonDays: 7,
          absoluteMax: 30,
          completionFactKind: "maternal_temperature_observation",
          required: true,
          selected: true,
        },
        {
          order: 1,
          kind: "task",
          category: "preparation",
          target: "litter",
          priority: "normal",
          anchor: "expected_birth",
          pointOffset: -2,
          pointTime: null,
          windowStart: null,
          windowEnd: null,
          recurrenceKind: null,
          intervalDays: null,
          recurrenceStart: null,
          recurrenceEndKind: null,
          horizonDays: null,
          absoluteMax: null,
          completionFactKind: null,
          required: false,
          selected: true,
        },
        {
          order: 2,
          kind: "window",
          category: "reproduction",
          target: "litter",
          priority: "important",
          anchor: "expected_birth",
          pointOffset: null,
          pointTime: null,
          windowStart: -1,
          windowEnd: 2,
          recurrenceKind: null,
          intervalDays: null,
          recurrenceStart: null,
          recurrenceEndKind: null,
          horizonDays: null,
          absoluteMax: null,
          completionFactKind: null,
          required: false,
          selected: true,
        },
      ],
      series: {
        count: 1,
        startsOn: "2026-07-29",
        endsOn: null,
        endKind: "actual_birth",
        horizonDays: 7,
        absoluteMax: 30,
        materializedCount: 14,
      },
      seriesSlots: ["08:00:00", "20:00:00"],
      recurringOccurrences: 14,
      recurringDates: [
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
      ],
      recurringTimes: ["08:00:00", "20:00:00"],
      pointTask: { count: 1, date: "2026-08-01", time: null },
      windowTask: { count: 1, start: "2026-08-02", end: "2026-08-05" },
    });

    const recorded = await owner.rpc("record_maternal_observation", {
      p_litter_id: ids.litter,
      p_client_command_id: ids.observationCommand,
      p_observed_at: "2026-07-29T06:10:00.000Z",
      p_timezone_name: "Europe/Paris",
      p_observation_type: "temperature",
      p_numeric_value: 37.2,
      p_unit: "celsius",
      p_severity: "routine",
      p_note: null,
    });
    expect(recorded.error).toBeNull();
    expect(recorded.data?.[0]).toMatchObject({
      outcome: "success",
      match_status: "linked",
      replayed: false,
    });

    const linked = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'observations', (
          select count(*) from public.maternal_observations
          where litter_id = ${q(ids.litter)}::uuid
        ),
        'links', (
          select count(*) from public.maternal_observation_task_links
          where litter_id = ${q(ids.litter)}::uuid
        ),
        'done', (
          select count(*)
          from public.maternal_observation_task_links link
          join public.litter_care_tasks task
            on task.id = link.litter_care_task_id
          where link.litter_id = ${q(ids.litter)}::uuid
            and task.status = 'done'
        ),
        'slot', (
          select task.scheduled_local_time::text
          from public.maternal_observation_task_links link
          join public.litter_care_tasks task
            on task.id = link.litter_care_task_id
          where link.litter_id = ${q(ids.litter)}::uuid
        ),
        'factKind', (
          select item.completion_fact_kind
          from public.maternal_observation_task_links link
          join public.litter_care_tasks task
            on task.id = link.litter_care_task_id
          join public.litter_plan_items item
            on item.id = task.litter_plan_item_id
          where link.litter_id = ${q(ids.litter)}::uuid
        ),
        'value', (
          select numeric_value from public.maternal_observations
          where litter_id = ${q(ids.litter)}::uuid
        ),
        'unit', (
          select unit from public.maternal_observations
          where litter_id = ${q(ids.litter)}::uuid
        )
      )::text;
    `);
    expect(linked).toEqual({
      observations: 1,
      links: 1,
      done: 1,
      slot: "08:00:00",
      factKind: "maternal_temperature_observation",
      value: 37.2,
      unit: "celsius",
    });

    await page.goto(`/litters/journal?litter=${ids.litter}`);
    const taskCard = page
      .locator("#litter-care-tasks li")
      .filter({ hasText: "Période de relevés de température" })
      .filter({ hasText: "37,2 °C" });
    await expect(taskCard).toContainText("Réalisée depuis le Journal");
    await expect(taskCard).toContainText("Température maternelle enregistrée");
    await expect(taskCard).toContainText("37,2 °C");
    await expect(
      taskCard.getByRole("link", { name: "Voir le suivi de la mère" }),
    ).toHaveAttribute("href", "#maternal-observations");

    const observationCard = page
      .locator("#maternal-observations li")
      .filter({ hasText: "37,2 °C" });
    await expect(observationCard).toContainText("Action planifiée réalisée");
    await expect(observationCard).toContainText(
      "Période de relevés de température",
    );
    await expect(observationCard).toContainText("Occurrence 1");

    expect(gestationSnapshot()).toEqual(gestationBefore);
    expect(growthComparisonSnapshot()).toEqual(growthBefore);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    console.log(
      `DOG_PRE_WHELPING_TEMPERATURE_MODEL_01_FIXTURE_IDS=${JSON.stringify(
        fixtureManifest(),
      )}`,
    );
  } finally {
    if (owner) await owner.auth.signOut();
    cleanup();
    expectCleanupAtZero();
    expect(elementaryOrganizationSnapshot()).toEqual(elementaryBefore);
    expect(gestationSnapshot()).toEqual(gestationBefore);
    expect(growthComparisonSnapshot()).toEqual(growthBefore);
  }
});

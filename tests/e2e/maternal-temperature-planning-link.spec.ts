import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

type Supabase = SupabaseClient<Database>;

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "d7290001-0000-4000-8000-";
const like = `${prefix}%`;
const modelTitlePrefix = "MATERNAL-TEMPERATURE-PLANNING-LINK-01 E2E";
const modelTitleLike = `%${modelTitlePrefix}%`;

const ids = {
  mother: `${prefix}000000000001`,
  linkedLitter: `${prefix}000000000010`,
  ambiguousLitter: `${prefix}000000000011`,
  manualLitter: `${prefix}000000000012`,
  inactiveLitter: `${prefix}000000000013`,
  legacyLitter: `${prefix}000000000014`,
  concurrentLitter: `${prefix}000000000015`,
  compatibleTemplate: `${prefix}000000000020`,
  incompatibleTemplate: `${prefix}000000000021`,
  modelCommand: `${prefix}000000000030`,
  duplicateCommand: `${prefix}000000000031`,
  invalidModelCommand: `${prefix}000000000032`,
  legacyModelCommand: `${prefix}000000000033`,
  concurrentModelCommand: `${prefix}000000000034`,
  applyLinked: `${prefix}000000000040`,
  applyAmbiguous: `${prefix}000000000041`,
  applyManual: `${prefix}000000000042`,
  applyInactive: `${prefix}000000000043`,
  applyLegacy: `${prefix}000000000044`,
  applyConcurrent: `${prefix}000000000045`,
  firstObservation: `${prefix}000000000050`,
  secondObservation: `${prefix}000000000051`,
  noCandidateObservation: `${prefix}000000000052`,
  ambiguousObservation: `${prefix}000000000053`,
  manualObservation: `${prefix}000000000054`,
  inactiveObservation: `${prefix}000000000055`,
  legacyObservation: `${prefix}000000000056`,
  nonTemperatureObservation: `${prefix}000000000057`,
  concurrentObservationA: `${prefix}000000000058`,
  concurrentObservationB: `${prefix}000000000059`,
  viewerObservation: `${prefix}00000000005a`,
  manualResolveA: `${prefix}000000000060`,
  manualResolveB: `${prefix}000000000061`,
  suspendSeries: `${prefix}000000000062`,
  foreignOrganization: `${prefix}000000000070`,
  foreignMother: `${prefix}000000000071`,
  foreignLitter: `${prefix}000000000072`,
  foreignTask: `${prefix}000000000073`,
  duplicateLink: `${prefix}000000000074`,
  crossOrganizationLink: `${prefix}000000000075`,
} as const;

const litterIds = [
  ids.linkedLitter,
  ids.ambiguousLitter,
  ids.manualLitter,
  ids.inactiveLitter,
  ids.legacyLitter,
  ids.concurrentLitter,
] as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;

    delete from public.maternal_observation_task_links
    where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.maternal_observation_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.maternal_observations
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};

    delete from public.litter_care_task_schedule_changes
    where litter_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
    where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
    where series_id in (
      select id from public.litter_plan_series where litter_id::text like ${q(like)}
    );
    delete from public.litter_plan_series_materialization_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series where litter_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
    where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};

    delete from public.litter_planning_model_item_time_slots
    where model_item_id in (
      select item.id
      from public.litter_planning_model_items item
      join public.litter_planning_models model on model.id = item.model_id
      where model.organization_id = ${q(organizationId)}::uuid
        and model.title like ${q(modelTitleLike)}
    );
    delete from public.litter_planning_model_items
    where model_id in (
      select id from public.litter_planning_models
      where organization_id = ${q(organizationId)}::uuid
        and title like ${q(modelTitleLike)}
    );
    delete from public.litter_planning_model_commands
    where client_command_id::text like ${q(like)}
       or model_id in (
         select id from public.litter_planning_models
         where organization_id = ${q(organizationId)}::uuid
           and title like ${q(modelTitleLike)}
       );
    delete from public.litter_planning_models
    where organization_id = ${q(organizationId)}::uuid
      and title like ${q(modelTitleLike)};

    delete from public.litter_care_task_templates where id::text like ${q(like)};
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    delete from public.organizations where id::text like ${q(like)};

    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'links', (select count(*) from public.maternal_observation_task_links where litter_id::text like ${q(like)} or id::text like ${q(like)}),
        'observation_commands', (select count(*) from public.maternal_observation_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'observations', (select count(*) from public.maternal_observations where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)}),
        'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)}),
        'series_slots', (select count(*) from public.litter_plan_series_time_slots where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)})),
        'series_materialization_commands', (select count(*) from public.litter_plan_series_materialization_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'series_state_commands', (select count(*) from public.litter_plan_series_state_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'series', (select count(*) from public.litter_plan_series where litter_id::text like ${q(like)}),
        'application_commands', (select count(*) from public.litter_plan_application_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
        'plan_items', (select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}),
        'plans', (select count(*) from public.litter_plans where litter_id::text like ${q(like)}),
        'model_slots', (select count(*) from public.litter_planning_model_item_time_slots slot join public.litter_planning_model_items item on item.id = slot.model_item_id join public.litter_planning_models model on model.id = item.model_id where model.title like ${q(modelTitleLike)}),
        'model_commands', (select count(*) from public.litter_planning_model_commands where client_command_id::text like ${q(like)}),
        'model_items', (select count(*) from public.litter_planning_model_items item join public.litter_planning_models model on model.id = item.model_id where model.title like ${q(modelTitleLike)}),
        'models', (select count(*) from public.litter_planning_models where title like ${q(modelTitleLike)}),
        'templates', (select count(*) from public.litter_care_task_templates where id::text like ${q(like)}),
        'litters', (select count(*) from public.litters where id::text like ${q(like)}),
        'animals', (select count(*) from public.animals where id::text like ${q(like)}),
        'organizations', (select count(*) from public.organizations where id::text like ${q(like)})
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be physically deleted`).toBe(0);
  }
}

function fixtureIdManifest() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'organizations', coalesce((select json_agg(id::text order by id) from public.organizations where id::text like ${q(like)}), '[]'::json),
        'animals', coalesce((select json_agg(id::text order by id) from public.animals where id::text like ${q(like)}), '[]'::json),
        'litters', coalesce((select json_agg(id::text order by id) from public.litters where id::text like ${q(like)}), '[]'::json),
        'templates', coalesce((select json_agg(id::text order by id) from public.litter_care_task_templates where id::text like ${q(like)}), '[]'::json),
        'models', coalesce((select json_agg(id::text order by id) from public.litter_planning_models where title like ${q(modelTitleLike)}), '[]'::json),
        'model_items', coalesce((select json_agg(item.id::text order by item.id) from public.litter_planning_model_items item join public.litter_planning_models model on model.id = item.model_id where model.title like ${q(modelTitleLike)}), '[]'::json),
        'model_slots', coalesce((select json_agg(slot.id::text order by slot.id) from public.litter_planning_model_item_time_slots slot join public.litter_planning_model_items item on item.id = slot.model_item_id join public.litter_planning_models model on model.id = item.model_id where model.title like ${q(modelTitleLike)}), '[]'::json),
        'plans', coalesce((select json_agg(id::text order by id) from public.litter_plans where litter_id::text like ${q(like)}), '[]'::json),
        'plan_items', coalesce((select json_agg(id::text order by id) from public.litter_plan_items where litter_id::text like ${q(like)}), '[]'::json),
        'series', coalesce((select json_agg(id::text order by id) from public.litter_plan_series where litter_id::text like ${q(like)}), '[]'::json),
        'series_slots', coalesce((select json_agg(slot.id::text order by slot.id) from public.litter_plan_series_time_slots slot join public.litter_plan_series series on series.id = slot.series_id where series.litter_id::text like ${q(like)}), '[]'::json),
        'tasks', coalesce((select json_agg(id::text order by id) from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)}), '[]'::json),
        'observations', coalesce((select json_agg(id::text order by id) from public.maternal_observations where litter_id::text like ${q(like)}), '[]'::json),
        'observation_commands', coalesce((select json_agg(id::text order by id) from public.maternal_observation_commands where litter_id::text like ${q(like)}), '[]'::json),
        'links', coalesce((select json_agg(id::text order by id) from public.maternal_observation_task_links where litter_id::text like ${q(like)}), '[]'::json)
      )::text;
    `),
  ) as Record<string, string[]>;
}

function seedBaseFixtures() {
  const litterValues = litterIds
    .map(
      (litterId, index) =>
        `(${q(litterId)}::uuid, ${q(organizationId)}::uuid, ${q(`${modelTitlePrefix} portée ${index + 1}`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', '2026-06-10', '2026-08-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`,
    )
    .join(",\n");

  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${modelTitlePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, created_by, updated_by
    ) values ${litterValues};

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type,
      offset_days, species, revision, created_by, updated_by
    ) values
      (
        ${q(ids.compatibleTemplate)}::uuid, ${q(organizationId)}::uuid,
        'Température maternelle E2E', 'maternal_health', 'mother',
        'expected_birth', 0, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.incompatibleTemplate)}::uuid, ${q(organizationId)}::uuid,
        'Suivi générique E2E', 'other', 'litter',
        'expected_birth', 0, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
  `);
}

function recurringItem(
  templateId: string,
  completionFactKind: "maternal_temperature_observation" | null,
  timeSlots: string[],
  displayOrder = 0,
) {
  return {
    organizationTemplateId: templateId,
    itemKind: "recurring_task",
    priority: "important",
    anchorType: "expected_birth",
    recurrenceKind: "daily_interval",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: 0,
    recurrenceEndKind: "actual_birth",
    initialMaterializationHorizonDays: 1,
    absoluteMaxOccurrences: 30,
    timeSlots,
    displayOrder,
    isRequired: true,
    isSelectedByDefault: true,
    completionFactKind,
  };
}

async function createModel(
  client: Supabase,
  commandId: string,
  titleSuffix: string,
  items: ReturnType<typeof recurringItem>[],
) {
  const result = await client.rpc("create_litter_planning_model", {
    p_organization_id: organizationId,
    p_client_command_id: commandId,
    p_title: `${modelTitlePrefix} ${titleSuffix}`,
    p_description: "Fixtures réservées au lot et supprimées dans le finally.",
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: items as unknown as Json,
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
  return result.data![0]!.model_id!;
}

async function applyModel(
  client: Supabase,
  litterId: string,
  modelId: string,
  commandId: string,
) {
  const result = await client.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
    p_planning_model_id: modelId,
    p_client_command_id: commandId,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
}

async function recordTemperature(
  client: Supabase,
  litterId: string,
  commandId: string,
  observedAt: string,
  numericValue = 37.2,
) {
  return client.rpc("record_maternal_observation", {
    p_litter_id: litterId,
    p_client_command_id: commandId,
    p_observed_at: observedAt,
    p_timezone_name: "Europe/Paris",
    p_observation_type: "temperature",
    p_numeric_value: numericValue,
    p_unit: "celsius",
    p_severity: "routine",
    p_note: null,
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("relie atomiquement les températures aux occurrences configurées et expose le parcours UI", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();
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

  try {
    seedBaseFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerConcurrent = await createAuthenticatedSupabaseClient();

    expect(
      Number(
        sql(
          `select count(*) from public.litter_plan_items where litter_id = ${q(ids.linkedLitter)}::uuid`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(
          `select count(*) from public.litter_care_tasks where litter_id = ${q(ids.linkedLitter)}::uuid`,
        ),
      ),
    ).toBe(0);

    const configuredItems = [
      recurringItem(
        ids.compatibleTemplate,
        "maternal_temperature_observation",
        ["08:00", "18:00"],
      ),
      recurringItem(ids.incompatibleTemplate, null, ["12:00"], 1),
    ];
    const modelId = await createModel(
      owner,
      ids.modelCommand,
      "principal",
      configuredItems,
    );
    const duplicateModelId = await createModel(
      owner,
      ids.duplicateCommand,
      "duplication",
      structuredClone(configuredItems),
    );

    const persistedKinds = JSON.parse(
      sql(`
        select json_agg(json_build_object(
          'modelId', model_id::text,
          'displayOrder', display_order,
          'kind', completion_fact_kind
        ) order by model_id, display_order)::text
        from public.litter_planning_model_items
        where model_id in (${q(modelId)}::uuid, ${q(duplicateModelId)}::uuid);
      `),
    ) as Array<{ modelId: string; displayOrder: number; kind: string | null }>;
    expect(persistedKinds).toHaveLength(4);
    expect(
      persistedKinds
        .filter((item) => item.displayOrder === 0)
        .every((item) => item.kind === "maternal_temperature_observation"),
    ).toBe(true);
    expect(
      persistedKinds
        .filter((item) => item.displayOrder === 1)
        .every((item) => item.kind === null),
    ).toBe(true);

    const invalid = await owner.rpc("create_litter_planning_model", {
      p_organization_id: organizationId,
      p_client_command_id: ids.invalidModelCommand,
      p_title: `${modelTitlePrefix} invalide`,
      p_description: null,
      p_species: "dog",
      p_breed: "Golden Retriever",
      p_is_active: true,
      p_items: [
        recurringItem(
          ids.incompatibleTemplate,
          "maternal_temperature_observation",
          ["08:00"],
        ),
      ] as unknown as Json,
    });
    expect(invalid.error).toBeNull();
    expect(invalid.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "invalid_input",
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto(`/settings/litter-planning-models/${modelId}`);
    await expect(
      page.getByText("Validation automatique par le Journal"),
    ).toHaveCount(2);
    await expect(
      page.getByText("Température maternelle enregistrée"),
    ).toBeVisible();
    await expect(
      page.locator('[data-completion-fact-kind], [id*="maternal_temperature_observation"]'),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Créer une copie personnalisée" })
      .click();
    await expect(page).toHaveURL(/\/settings\/litter-planning-models\/[^/]+\/edit$/);
    await expect(
      page.getByLabel("Validation automatique par le Journal"),
    ).toHaveValue("temperature");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/settings\/litter-planning-models\/[^/]+$/);
    await expect(
      page.getByText("Température maternelle enregistrée"),
    ).toBeVisible();

    await page.goto(`/settings/litter-planning-models/${modelId}/edit`);
    const journalCompletion = page.getByLabel(
      "Validation automatique par le Journal",
    );
    await expect(journalCompletion).toHaveCount(1);
    await expect(journalCompletion).toHaveValue("temperature");
    await expect(
      journalCompletion.locator('option[value="temperature"]'),
    ).toHaveText("Température maternelle enregistrée");

    await page.goto(`/litters/journal?litter=${ids.linkedLitter}`);
    const modelCard = page
      .getByRole("listitem")
      .filter({ hasText: `${modelTitlePrefix} principal` });
    await modelCard.getByRole("button", { name: "Consulter le contenu" }).click();
    await expect(modelCard).toContainText(
      "Validation automatique par le Journal : Température maternelle enregistrée",
    );
    const applyButton = modelCard.getByRole("button", {
      name: "Appliquer ce modèle",
    });
    await applyButton.focus();
    await page.keyboard.press("Enter");
    const applyDialog = page.getByRole("dialog");
    await applyDialog
      .getByRole("button", { name: "Afficher le détail du modèle" })
      .click();
    await expect(applyDialog).toContainText(
      "Validation automatique par le Journal : Température maternelle enregistrée",
    );
    await applyDialog.getByRole("button", { name: "Continuer" }).click();
    await expect(applyDialog).toContainText("Confirmer l’application");
    await applyDialog.getByRole("button", { name: "Appliquer le modèle" }).click();
    await expect(
      page.getByText("3 occurrences de suivi récurrent préparées"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: `${modelTitlePrefix} principal` }),
    ).toContainText("Déjà présent");

    const snapshots = JSON.parse(
      sql(`
        select json_agg(json_build_object(
          'displayOrder', display_order,
          'kind', completion_fact_kind
        ) order by display_order)::text
        from public.litter_plan_items
        where litter_id = ${q(ids.linkedLitter)}::uuid;
      `),
    ) as Array<{ displayOrder: number; kind: string | null }>;
    expect(snapshots).toEqual([
      { displayOrder: 0, kind: "maternal_temperature_observation" },
      { displayOrder: 1, kind: null },
    ]);

    await page
      .getByTestId("maternal-observations-panel")
      .getByRole("button", { name: "Ajouter une observation" })
      .click();
    const observationDialog = page.getByRole("dialog");
    await observationDialog.getByLabel("Date et heure").fill("2026-08-10T08:10");
    await observationDialog.getByLabel("Température").fill("37.2");
    await observationDialog
      .getByRole("button", { name: "Enregistrer l’observation" })
      .click();
    await expect(
      page.getByText(
        "L’observation a été enregistrée et l’action prévue a été marquée comme réalisée.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
    await expect(
      page.getByText(
        "Action satisfaite automatiquement par une température maternelle enregistrée dans le Journal.",
      ),
    ).toBeVisible();

    const uiObservation = JSON.parse(
      sql(`
        select json_build_object(
          'id', observation.id::text,
          'commandId', observation.client_command_id::text,
          'linkedTaskId', link.litter_care_task_id::text
        )::text
        from public.maternal_observations observation
        join public.maternal_observation_task_links link
          on link.maternal_observation_id = observation.id
        where observation.litter_id = ${q(ids.linkedLitter)}::uuid
        order by observation.created_at
        limit 1;
      `),
    ) as { id: string; commandId: string; linkedTaskId: string };
    expect(uiObservation.id).toBeTruthy();

    const second = await recordTemperature(
      owner,
      ids.linkedLitter,
      ids.secondObservation,
      "2026-08-10T15:50:00.000Z",
      37.1,
    );
    expect(second.error).toBeNull();
    expect(second.data?.[0]).toMatchObject({
      outcome: "success",
      match_status: "linked",
      replayed: false,
    });
    const linkedTimes = JSON.parse(
      sql(`
        select json_agg(task.scheduled_local_time::text order by task.scheduled_local_time)::text
        from public.maternal_observation_task_links link
        join public.litter_care_tasks task on task.id = link.litter_care_task_id
        where link.litter_id = ${q(ids.linkedLitter)}::uuid;
      `),
    ) as string[];
    expect(linkedTimes).toEqual(["08:00:00", "18:00:00"]);

    const replay = await recordTemperature(
      owner,
      ids.linkedLitter,
      ids.secondObservation,
      "2026-08-10T15:50:00.000Z",
      37.1,
    );
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toMatchObject({
      observation_id: second.data?.[0]?.observation_id,
      match_status: "linked",
      replayed: true,
    });
    expect(
      Number(
        sql(
          `select count(*) from public.maternal_observations where client_command_id = ${q(ids.secondObservation)}::uuid`,
        ),
      ),
    ).toBe(1);

    const divergent = await recordTemperature(
      owner,
      ids.linkedLitter,
      ids.secondObservation,
      "2026-08-10T15:50:00.000Z",
      38.4,
    );
    expect(divergent.error).toBeNull();
    expect(divergent.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "client_command_conflict",
    });

    const noCandidate = await recordTemperature(
      owner,
      ids.linkedLitter,
      ids.noCandidateObservation,
      "2026-08-10T10:00:00.000Z",
    );
    expect(noCandidate.error).toBeNull();
    expect(noCandidate.data?.[0]?.match_status).toBe("no_candidate");
    await page
      .getByTestId("maternal-observations-panel")
      .getByRole("button", { name: "Ajouter une observation" })
      .click();
    const neutralDialog = page.getByRole("dialog");
    await neutralDialog.getByLabel("Date et heure").fill("2026-08-11T08:10");
    await neutralDialog.getByLabel("Température").fill("37.3");
    await neutralDialog
      .getByRole("button", { name: "Enregistrer l’observation" })
      .click();
    await expect(
      page.getByText(
        "L’observation a été enregistrée. Aucune action planifiée n’a été modifiée.",
      ),
    ).toBeVisible({ timeout: 30_000 });

    await applyModel(owner, ids.ambiguousLitter, modelId, ids.applyAmbiguous);
    const ambiguous = await recordTemperature(
      owner,
      ids.ambiguousLitter,
      ids.ambiguousObservation,
      "2026-08-10T11:00:00.000Z",
    );
    expect(ambiguous.error).toBeNull();
    expect(ambiguous.data?.[0]?.match_status).toBe("ambiguous");
    expect(
      Number(
        sql(
          `select count(*) from public.litter_care_tasks where litter_id = ${q(ids.ambiguousLitter)}::uuid and status = 'done'`,
        ),
      ),
    ).toBe(0);

    await applyModel(owner, ids.manualLitter, modelId, ids.applyManual);
    const manualTaskIds = JSON.parse(
      sql(`
        select json_agg(task.id::text order by task.scheduled_local_time)::text
        from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        where task.litter_id = ${q(ids.manualLitter)}::uuid
          and item.completion_fact_kind = 'maternal_temperature_observation';
      `),
    ) as string[];
    for (const [index, taskId] of manualTaskIds.entries()) {
      const resolved = await owner.rpc("resolve_litter_care_task", {
        p_task_id: taskId,
        p_client_command_id:
          index === 0 ? ids.manualResolveA : ids.manualResolveB,
        p_resolution_status: "done",
        p_resolved_at: "2026-08-10T06:00:00.000Z",
        p_timezone_name: "Europe/Paris",
        p_resolution_note: "Résolution manuelle E2E",
      });
      expect(resolved.error).toBeNull();
      expect(resolved.data?.[0]?.outcome).toBe("success");
    }
    const manualObservation = await recordTemperature(
      owner,
      ids.manualLitter,
      ids.manualObservation,
      "2026-08-10T06:10:00.000Z",
    );
    expect(manualObservation.data?.[0]?.match_status).toBe("no_candidate");

    await applyModel(owner, ids.inactiveLitter, modelId, ids.applyInactive);
    const activeSeries = JSON.parse(
      sql(`
        select json_build_object('id', series.id::text, 'revision', series.revision_no)::text
        from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        where series.litter_id = ${q(ids.inactiveLitter)}::uuid
          and item.completion_fact_kind = 'maternal_temperature_observation';
      `),
    ) as { id: string; revision: number };
    const suspended = await owner.rpc("set_litter_plan_series_state", {
      p_series_id: activeSeries.id,
      p_client_command_id: ids.suspendSeries,
      p_expected_revision_no: activeSeries.revision,
      p_new_state: "suspended",
      p_reason: "Vérification E2E",
    });
    expect(suspended.error).toBeNull();
    expect(suspended.data?.[0]?.outcome).toBe("success");
    const inactiveObservation = await recordTemperature(
      owner,
      ids.inactiveLitter,
      ids.inactiveObservation,
      "2026-08-10T06:10:00.000Z",
    );
    expect(inactiveObservation.data?.[0]?.match_status).toBe("no_candidate");

    const legacyModelId = await createModel(
      owner,
      ids.legacyModelCommand,
      "sans configuration",
      [recurringItem(ids.compatibleTemplate, null, ["08:00"])],
    );
    await applyModel(owner, ids.legacyLitter, legacyModelId, ids.applyLegacy);
    expect(
      sql(`
        select completion_fact_kind is null
        from public.litter_plan_items
        where litter_id = ${q(ids.legacyLitter)}::uuid;
      `),
    ).toBe("t");
    const legacyObservation = await recordTemperature(
      owner,
      ids.legacyLitter,
      ids.legacyObservation,
      "2026-08-10T06:05:00.000Z",
    );
    expect(legacyObservation.data?.[0]?.match_status).toBe("no_candidate");
    const nonTemperature = await owner.rpc("record_maternal_observation", {
      p_litter_id: ids.legacyLitter,
      p_client_command_id: ids.nonTemperatureObservation,
      p_observed_at: "2026-08-10T06:06:00.000Z",
      p_timezone_name: "Europe/Paris",
      p_observation_type: "health",
      p_numeric_value: null,
      p_unit: null,
      p_severity: "routine",
      p_note: "Observation non température E2E",
    });
    expect(nonTemperature.error).toBeNull();
    expect(nonTemperature.data?.[0]?.match_status).toBe("not_applicable");

    const concurrentModelId = await createModel(
      owner,
      ids.concurrentModelCommand,
      "concurrence",
      [
        recurringItem(
          ids.compatibleTemplate,
          "maternal_temperature_observation",
          ["08:00"],
        ),
      ],
    );
    await applyModel(
      owner,
      ids.concurrentLitter,
      concurrentModelId,
      ids.applyConcurrent,
    );
    const [concurrentA, concurrentB] = await Promise.all([
      recordTemperature(
        owner,
        ids.concurrentLitter,
        ids.concurrentObservationA,
        "2026-08-10T06:01:00.000Z",
      ),
      recordTemperature(
        ownerConcurrent,
        ids.concurrentLitter,
        ids.concurrentObservationB,
        "2026-08-10T06:02:00.000Z",
      ),
    ]);
    expect(concurrentA.error).toBeNull();
    expect(concurrentB.error).toBeNull();
    expect(
      [concurrentA.data?.[0]?.match_status, concurrentB.data?.[0]?.match_status].sort(),
    ).toEqual(["linked", "no_candidate"]);
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'observations', (select count(*) from public.maternal_observations where litter_id = ${q(ids.concurrentLitter)}::uuid),
            'links', (select count(*) from public.maternal_observation_task_links where litter_id = ${q(ids.concurrentLitter)}::uuid),
            'done', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.concurrentLitter)}::uuid and status = 'done')
          )::text;
        `),
      ),
    ).toEqual({ observations: 2, links: 1, done: 1 });

    const viewer = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    expect(
      (
        await viewer.auth.signInWithPassword({
          email: E2E_VIEWER_EMAIL,
          password: E2E_VIEWER_PASSWORD,
        })
      ).error,
    ).toBeNull();
    const viewerWrite = await recordTemperature(
      viewer,
      ids.legacyLitter,
      ids.viewerObservation,
      "2026-08-10T06:07:00.000Z",
    );
    expect(viewerWrite.error).toBeNull();
    expect(viewerWrite.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "membership_required",
    });

    const ownerLinks = await owner
      .from("maternal_observation_task_links")
      .select("id, litter_id");
    expect(ownerLinks.error).toBeNull();
    expect(ownerLinks.data?.length).toBeGreaterThan(0);
    const viewerLinks = await viewer
      .from("maternal_observation_task_links")
      .select("id, litter_id");
    expect(viewerLinks.error).toBeNull();
    expect(viewerLinks.data?.length).toBe(ownerLinks.data?.length);
    const directInsert = await owner.from("maternal_observation_task_links").insert({
      organization_id: organizationId,
      litter_id: ids.linkedLitter,
      maternal_observation_id: uiObservation.id,
      litter_care_task_id: uiObservation.linkedTaskId,
      resolution_command_id: ids.duplicateLink,
      created_by: ownerId,
    });
    expect(directInsert.error).not.toBeNull();
    const directUpdate = await owner
      .from("maternal_observation_task_links")
      .update({ created_by: ownerId })
      .eq("maternal_observation_id", uiObservation.id);
    expect(directUpdate.error).not.toBeNull();
    const directDelete = await owner
      .from("maternal_observation_task_links")
      .delete()
      .eq("maternal_observation_id", uiObservation.id);
    expect(directDelete.error).not.toBeNull();
    const privateCommands = await owner
      .from("maternal_observation_commands")
      .select("id")
      .limit(1);
    expect(privateCommands.error).not.toBeNull();

    expect(() =>
      sql(`
        insert into public.maternal_observation_task_links (
          id, organization_id, litter_id, maternal_observation_id,
          litter_care_task_id, resolution_command_id, created_by
        ) values (
          ${q(ids.duplicateLink)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.linkedLitter)}::uuid, ${q(uiObservation.id)}::uuid,
          ${q(uiObservation.linkedTaskId)}::uuid, ${q(ids.duplicateLink)}::uuid,
          ${q(ownerId)}::uuid
        );
      `),
    ).toThrow();

    sql(`
      insert into public.organizations (id, name, slug)
      values (${q(ids.foreignOrganization)}::uuid, 'Maternal foreign E2E', 'maternal-foreign-e2e');
      insert into public.animals (
        id, organization_id, call_name, species, breed, sex, status,
        ownership_status, created_by, updated_by
      ) values (
        ${q(ids.foreignMother)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        'Foreign mother E2E', 'dog', 'Golden Retriever', 'female', 'breeding',
        'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
      insert into public.litters (
        id, organization_id, name, species, breed, mother_id, status,
        expected_birth_date, created_by, updated_by
      ) values (
        ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        'Foreign litter E2E', 'dog', 'Golden Retriever',
        ${q(ids.foreignMother)}::uuid, 'birth_expected', '2026-08-10',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
      insert into public.litter_care_tasks (
        id, organization_id, litter_id, source, occurrence_no, item_kind,
        category, target_scope, title, planned_for, priority, schedule_source,
        status, creation_command_id, created_by, updated_by
      ) values (
        ${q(ids.foreignTask)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        ${q(ids.foreignLitter)}::uuid, 'manual', 1, 'task', 'other', 'litter',
        'Foreign task E2E', '2026-08-10', 'normal', 'manual', 'planned',
        gen_random_uuid(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
    expect(() =>
      sql(`
        insert into public.maternal_observation_task_links (
          id, organization_id, litter_id, maternal_observation_id,
          litter_care_task_id, resolution_command_id, created_by
        ) values (
          ${q(ids.crossOrganizationLink)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.linkedLitter)}::uuid, (
            select id from public.maternal_observations
            where client_command_id = ${q(ids.noCandidateObservation)}::uuid
          ),
          ${q(ids.foreignTask)}::uuid, ${q(ids.crossOrganizationLink)}::uuid,
          ${q(ownerId)}::uuid
        );
      `),
    ).toThrow();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {
    console.log(
      `MATERNAL_TEMPERATURE_PLANNING_LINK_01_FIXTURE_IDS=${JSON.stringify(fixtureIdManifest())}`,
    );
    cleanup();
    expectCleanupAtZero();
  }
});

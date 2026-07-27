import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "b7270001-0000-4000-8000-";
const like = `${prefix}%`;
const modelTitles = [
  "E2E suivis récurrents UI",
  "E2E suivis récurrents pending",
] as const;

const ids = {
  mother: `${prefix}000000000001`,
  litter: `${prefix}000000000002`,
  template: `${prefix}000000000003`,
  modelCommand: `${prefix}000000000005`,
  applyCommand: `${prefix}000000000006`,
  pendingMother: `${prefix}000000000011`,
  pendingLitter: `${prefix}000000000012`,
  pendingTemplate: `${prefix}000000000013`,
  pendingModelCommand: `${prefix}000000000015`,
  pendingApplyCommand: `${prefix}000000000016`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const modelTitleSql = modelTitles.map((title) => q(title)).join(", ");

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = 'owner'
      where id = ${q(membershipId)}::uuid;

    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)}
         or task_id in (
           select id from public.litter_care_tasks
           where litter_id::text like ${q(like)} or id::text like ${q(like)}
         );
    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)}
         or task_id in (
           select id from public.litter_care_tasks
           where litter_id::text like ${q(like)} or id::text like ${q(like)}
         );
    delete from public.litter_plan_series_materialization_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
      where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
      where series_id in (
        select id from public.litter_plan_series where litter_id::text like ${q(like)}
      );
    delete from public.litter_plan_series where litter_id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};
    with doomed_models as (
      select id from public.litter_planning_models
      where id::text like ${q(like)}
         or (
           title in (${modelTitleSql})
           and organization_id = ${q(organizationId)}::uuid
         )
    ),
    del_slots as (
      delete from public.litter_planning_model_item_time_slots s
      using public.litter_planning_model_items i
      where i.id = s.model_item_id and i.model_id in (select id from doomed_models)
      returning 1
    ),
    del_items as (
      delete from public.litter_planning_model_items
      where model_id in (select id from doomed_models)
      returning 1
    ),
    del_commands as (
      delete from public.litter_planning_model_commands
      where client_command_id::text like ${q(like)}
         or model_id in (select id from doomed_models)
      returning 1
    ),
    del_models as (
      delete from public.litter_planning_models
      where id in (select id from doomed_models)
      returning 1
    )
    select 1;
    delete from public.litter_care_task_templates where id::text like ${q(like)};
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'schedule_changes', (
          select count(*) from public.litter_care_task_schedule_changes
          where litter_id::text like ${q(like)}
        ),
        'schedule_commands', (
          select count(*) from public.litter_care_task_schedule_commands
          where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
        ),
        'series_mat_commands', (
          select count(*) from public.litter_plan_series_materialization_commands
          where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
        ),
        'series_state_commands', (
          select count(*) from public.litter_plan_series_state_commands
          where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
        ),
        'recalc_commands', (
          select count(*) from public.litter_plan_anchor_recalculation_commands
          where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
        ),
        'apply_commands', (
          select count(*) from public.litter_plan_application_commands
          where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where litter_id::text like ${q(like)} or id::text like ${q(like)}
        ),
        'series_slots', (
          select count(*) from public.litter_plan_series_time_slots s
          where s.series_id in (
            select id from public.litter_plan_series where litter_id::text like ${q(like)}
          )
        ),
        'series', (
          select count(*) from public.litter_plan_series where litter_id::text like ${q(like)}
        ),
        'plan_items', (
          select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}
        ),
        'plans', (
          select count(*) from public.litter_plans where litter_id::text like ${q(like)}
        ),
        'model_commands', (
          select count(*) from public.litter_planning_model_commands
          where client_command_id::text like ${q(like)}
        ),
        'model_items', (
          select count(*) from public.litter_planning_model_items
          where model_id::text like ${q(like)}
             or model_id in (
               select id from public.litter_planning_models
               where title in (${modelTitleSql})
                 and organization_id = ${q(organizationId)}::uuid
             )
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where id::text like ${q(like)}
             or (
               title in (${modelTitleSql})
               and organization_id = ${q(organizationId)}::uuid
             )
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like ${q(like)}
        ),
        'litters', (select count(*) from public.litters where id::text like ${q(like)}),
        'animals', (select count(*) from public.animals where id::text like ${q(like)}),
        'roleChanges', (
          select count(*) from public.memberships
          where id = ${q(membershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanup() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function writeSnapshot(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'series_mat_commands', (
          select count(*) from public.litter_plan_series_materialization_commands
          where litter_id = ${q(litterId)}::uuid
        ),
        'series_state_commands', (
          select count(*) from public.litter_plan_series_state_commands
          where litter_id = ${q(litterId)}::uuid
        ),
        'apply_commands', (
          select count(*) from public.litter_plan_application_commands
          where litter_id = ${q(litterId)}::uuid
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where litter_id = ${q(litterId)}::uuid
        ),
        'series', (
          select count(*) from public.litter_plan_series
          where litter_id = ${q(litterId)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function seriesState(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', s.id::text,
        'state', s.state,
        'revision', s.revision_no,
        'startsOn', s.starts_on,
        'endsOn', s.ends_on,
        'materializedThrough', s.materialized_through,
        'occurrenceCount', s.materialized_occurrence_count,
        'planItemId', s.litter_plan_item_id::text,
        'completionReason', s.completion_reason
      )::text
      from public.litter_plan_series s
      where s.litter_id = ${q(litterId)}::uuid
      order by s.created_at
      limit 1;
    `),
  ) as {
    id: string;
    state: string;
    revision: number;
    startsOn: string | null;
    endsOn: string | null;
    materializedThrough: string | null;
    occurrenceCount: number;
    planItemId: string;
    completionReason: string | null;
  };
}

function taskStatusCounts(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'total', count(*),
        'planned', count(*) filter (where status = 'planned'),
        'done', count(*) filter (where status = 'done'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'not_applicable', count(*) filter (where status = 'not_applicable')
      )::text
      from public.litter_care_tasks
      where litter_id = ${q(litterId)}::uuid
        and litter_plan_series_id is not null;
    `),
  ) as {
    total: number;
    planned: number;
    done: number;
    cancelled: number;
    not_applicable: number;
  };
}

function planItemState(itemId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'materializationState', materialization_state,
        'anchorDate', anchor_date_snapshot
      )::text
      from public.litter_plan_items
      where id = ${q(itemId)}::uuid;
    `),
  ) as {
    materializationState: string;
    anchorDate: string | null;
  };
}

async function authenticatedClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email: E2E_OWNER_EMAIL,
        password: E2E_OWNER_PASSWORD,
      })
    ).error,
  ).toBeNull();
  return client;
}

async function createActiveFixturesAndApply() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère récurrents UI',
      'dog', 'Golden Retriever', 'female', 'breeding', 'owned',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'E2E récurrents UI',
      'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected',
      '2026-06-10', '2026-08-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, revision, created_by, updated_by
    ) values (
      ${q(ids.template)}::uuid, ${q(organizationId)}::uuid,
      'Température de la mère', 'maternal_health', 'mother', 'expected_birth', -5,
      'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);

  const client = await authenticatedClient();
  const created = await client.rpc("create_litter_planning_model", {
    p_organization_id: organizationId,
    p_client_command_id: ids.modelCommand,
    p_title: "E2E suivis récurrents UI",
    p_description: null,
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: [
      {
        organizationTemplateId: ids.template,
        itemKind: "recurring_task",
        priority: "important",
        anchorType: "expected_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: -5,
        recurrenceEndKind: "actual_birth",
        initialMaterializationHorizonDays: 8,
        absoluteMaxOccurrences: 30,
        timeSlots: ["08:00", "20:00"],
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ] as unknown as Json,
  });
  expect(created.error).toBeNull();
  expect(created.data?.[0]?.outcome).toBe("success");
  const modelId = created.data![0]!.model_id!;

  const applied = await client.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: modelId,
    p_client_command_id: ids.applyCommand,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");
}

async function createPendingFixturesAndApply() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.pendingMother)}::uuid, ${q(organizationId)}::uuid, 'Mère pending UI',
      'dog', 'Golden Retriever', 'female', 'breeding', 'owned',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values (
      ${q(ids.pendingLitter)}::uuid, ${q(organizationId)}::uuid, 'E2E récurrents pending',
      'dog', 'Golden Retriever', ${q(ids.pendingMother)}::uuid, 'birth_expected',
      '2026-06-10', '2026-08-10', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, revision, created_by, updated_by
    ) values (
      ${q(ids.pendingTemplate)}::uuid, ${q(organizationId)}::uuid,
      'Pesée des chiots', 'offspring_weight', 'all_offspring', 'actual_birth', 0,
      'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);

  const client = await authenticatedClient();
  const created = await client.rpc("create_litter_planning_model", {
    p_organization_id: organizationId,
    p_client_command_id: ids.pendingModelCommand,
    p_title: "E2E suivis récurrents pending",
    p_description: null,
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: [
      {
        organizationTemplateId: ids.pendingTemplate,
        itemKind: "recurring_task",
        priority: "important",
        anchorType: "actual_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: 0,
        recurrenceEndKind: "fixed_recurrence_day_count",
        recurrenceDayCount: 7,
        initialMaterializationHorizonDays: 7,
        absoluteMaxOccurrences: 30,
        timeSlots: ["08:00", "20:00"],
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ] as unknown as Json,
  });
  expect(created.error).toBeNull();
  expect(created.data?.[0]?.outcome).toBe("success");
  const modelId = created.data![0]!.model_id!;

  const applied = await client.rpc("apply_litter_planning_model", {
    p_litter_id: ids.pendingLitter,
    p_planning_model_id: modelId,
    p_client_command_id: ids.pendingApplyCommand,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function panel(page: Page) {
  return page.getByRole("region", { name: "Suivis récurrents" });
}

test.afterEach(() => {
  cleanup();
  expectCleanup();
});

test("pilote une série active : affichage, suspension, prolongation, terminaison et viewer", async ({
  page,
}) => {
  cleanup();
  expectCleanup();
  await createActiveFixturesAndApply();

  const beforeLoad = writeSnapshot(ids.litter);
  await login(page);
  await page.goto(`/litters/journal?litter=${ids.litter}`);

  const recurring = panel(page);
  await expect(recurring).toContainText("Température de la mère");
  await expect(recurring).toContainText("Actif");
  await expect(recurring).toContainText("Tous les jours · 08 h 00 et 20 h 00");
  await expect(recurring).toContainText("Jusqu’à la mise-bas réelle");
  await expect(recurring).toContainText("à faire");

  const afterLoad = writeSnapshot(ids.litter);
  expect(afterLoad).toEqual(beforeLoad);

  await recurring.getByRole("button", { name: "Suspendre" }).click();
  await expect(recurring).toContainText("Suspendu", { timeout: 30_000 });
  await expect(recurring.getByRole("button", { name: "Reprendre" })).toBeVisible();

  await recurring.getByRole("button", { name: "Reprendre" }).click();
  await expect(recurring).toContainText("Actif", { timeout: 30_000 });

  const beforeExtend = seriesState(ids.litter);
  expect(beforeExtend.materializedThrough).toBe("2026-08-12");
  expect(beforeExtend.occurrenceCount).toBe(16);

  await recurring
    .getByRole("button", { name: "Préparer les prochaines occurrences" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Préparer les occurrences jusqu’au");
  await dialog.locator('input[name="requested_through"]').fill("2026-08-14");
  await dialog.getByRole("button", { name: "Préparer" }).click();
  await expect(recurring).toContainText("occurrence", { timeout: 30_000 });

  const afterExtend = seriesState(ids.litter);
  expect(afterExtend.materializedThrough).toBe("2026-08-14");
  expect(afterExtend.occurrenceCount).toBe(20);

  await recurring
    .getByRole("button", { name: "Préparer les prochaines occurrences" })
    .click();
  const replayDialog = page.getByRole("dialog");
  await replayDialog.locator('input[name="requested_through"]').fill("2026-08-14");
  await replayDialog.getByRole("button", { name: "Préparer" }).click();
  await expect(recurring).toContainText("Aucune nouvelle occurrence", {
    timeout: 30_000,
  });
  expect(seriesState(ids.litter).occurrenceCount).toBe(20);

  const beforeComplete = seriesState(ids.litter);
  const beforeStatuses = taskStatusCounts(ids.litter);
  const beforeSnapshot = writeSnapshot(ids.litter);
  expect(beforeStatuses.planned).toBeGreaterThan(0);

  await recurring.getByRole("button", { name: "Terminer" }).click();
  const terminal = page.getByRole("dialog");
  await expect(terminal).toContainText(
    "Le suivi ne pourra plus être prolongé. Les occurrences déjà préparées conserveront leur état actuel. Cette action est définitive.",
  );
  await terminal.getByRole("button", { name: "Terminer" }).click();
  await expect(recurring).toContainText("Terminé", { timeout: 30_000 });
  await expect(recurring.getByRole("button", { name: "Suspendre" })).toHaveCount(0);
  await expect(recurring.getByRole("button", { name: "Reprendre" })).toHaveCount(0);

  const afterComplete = seriesState(ids.litter);
  const afterStatuses = taskStatusCounts(ids.litter);
  const afterSnapshot = writeSnapshot(ids.litter);
  expect(afterComplete.state).toBe("completed");
  expect(afterComplete.occurrenceCount).toBe(beforeComplete.occurrenceCount);
  expect(afterStatuses).toEqual(beforeStatuses);
  expect(afterStatuses.planned).toBe(beforeStatuses.planned);
  expect(afterSnapshot.tasks).toBe(beforeSnapshot.tasks);
  expect(afterSnapshot.series).toBe(beforeSnapshot.series);
  expect(afterSnapshot.apply_commands).toBe(beforeSnapshot.apply_commands);
  expect(afterSnapshot.series_mat_commands).toBe(beforeSnapshot.series_mat_commands);
  expect(afterSnapshot.series_state_commands).toBe(
    beforeSnapshot.series_state_commands + 1,
  );

  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = 'viewer'
      where id = ${q(membershipId)}::uuid;
    set session_replication_role = origin;
  `);
  await page.context().clearCookies();
  await login(page);
  await page.goto(`/litters/journal?litter=${ids.litter}`);
  const viewerPanel = panel(page);
  await expect(viewerPanel).toContainText("Température de la mère");
  await expect(viewerPanel).toContainText("Terminé");
  await expect(viewerPanel.getByRole("button", { name: "Suspendre" })).toHaveCount(0);
  await expect(viewerPanel.getByRole("button", { name: "Reprendre" })).toHaveCount(0);
  await expect(
    viewerPanel.getByRole("button", { name: "Préparer les prochaines occurrences" }),
  ).toHaveCount(0);
  await expect(viewerPanel.getByRole("button", { name: "Terminer" })).toHaveCount(0);
});

test("débloque une série pending_anchor après naissance réelle", async ({
  page,
}) => {
  cleanup();
  expectCleanup();
  await createPendingFixturesAndApply();

  const pending = seriesState(ids.pendingLitter);
  expect(pending.startsOn).toBeNull();
  expect(pending.occurrenceCount).toBe(0);
  expect(planItemState(pending.planItemId).materializationState).toBe(
    "pending_anchor",
  );

  await login(page);
  await page.goto(`/litters/journal?litter=${ids.pendingLitter}`);
  const recurring = panel(page);
  await expect(recurring).toContainText("Pesée des chiots");
  await expect(recurring).toContainText("En attente de l’ancre");
  await expect(recurring).toContainText("0 au total");

  await recurring
    .getByRole("button", { name: "Préparer les prochaines occurrences" })
    .click();
  const earlyDialog = page.getByRole("dialog");
  await expect(earlyDialog).toContainText(
    "La date de début sera déterminée à partir des informations désormais enregistrées dans la portée.",
  );
  const throughInput = earlyDialog.locator('input[name="requested_through"]');
  await expect(throughInput).toBeEnabled();
  await throughInput.fill("2026-08-16");
  await earlyDialog.getByRole("button", { name: "Préparer" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Le suivi ne peut pas encore être programmé : la date d’ancrage n’est pas renseignée.",
    { timeout: 30_000 },
  );
  expect(taskStatusCounts(ids.pendingLitter).total).toBe(0);
  expect(seriesState(ids.pendingLitter).occurrenceCount).toBe(0);

  const matCommandsBeforeBirth = Number(
    sql(`
      select count(*) from public.litter_plan_series_materialization_commands
      where litter_id = ${q(ids.pendingLitter)}::uuid;
    `),
  );
  expect(matCommandsBeforeBirth).toBeGreaterThanOrEqual(1);

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-10'::date,
        status = 'born',
        updated_by = ${q(ownerId)}::uuid
    where id = ${q(ids.pendingLitter)}::uuid;
  `);

  await page.goto(`/litters/journal?litter=${ids.pendingLitter}`);
  const afterBirth = panel(page);
  await afterBirth
    .getByRole("button", { name: "Préparer les prochaines occurrences" })
    .click();
  const readyDialog = page.getByRole("dialog");
  await readyDialog.locator('input[name="requested_through"]').fill("2026-08-16");
  await readyDialog.getByRole("button", { name: "Préparer" }).click();
  await expect(afterBirth).toContainText("occurrence", { timeout: 30_000 });

  const activated = seriesState(ids.pendingLitter);
  expect(activated.startsOn).toBe("2026-08-10");
  expect(activated.endsOn).toBe("2026-08-16");
  expect(activated.materializedThrough).toBe("2026-08-16");
  expect(activated.occurrenceCount).toBe(14);
  expect(activated.state).toBe("completed");
  expect(activated.completionReason).toBe("recurrence_day_count_reached");
  expect(planItemState(activated.planItemId)).toMatchObject({
    materializationState: "materialized",
    anchorDate: "2026-08-10",
  });
  expect(taskStatusCounts(ids.pendingLitter).total).toBe(14);

  await expect(
    afterBirth.getByRole("button", { name: "Préparer les prochaines occurrences" }),
  ).toHaveCount(0);
  expect(seriesState(ids.pendingLitter).occurrenceCount).toBe(14);
});

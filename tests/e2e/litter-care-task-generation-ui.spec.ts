import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f180018-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E génération jalons UI";

const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}10`,
  readyOneTemplate: `${prefix}20`,
  readyTwoTemplate: `${prefix}21`,
  alreadyGeneratedTemplate: `${prefix}22`,
  missingAnchorTemplate: `${prefix}23`,
  inactiveTemplate: `${prefix}24`,
  speciesMismatchTemplate: `${prefix}25`,
  breedMismatchTemplate: `${prefix}26`,
  staleTemplate: `${prefix}27`,
  existingTask: `${prefix}30`,
  existingTaskCommand: `${prefix}40`,
} as const;

const titles = {
  readyOne: `${fixtureNamePrefix} préparation`,
  readyTwo: `${fixtureNamePrefix} contrôle`,
  alreadyGenerated: `${fixtureNamePrefix} déjà créé`,
  missingAnchor: `${fixtureNamePrefix} ancre manquante`,
  inactive: `${fixtureNamePrefix} inactif`,
  speciesMismatch: `${fixtureNamePrefix} espèce`,
  breedMismatch: `${fixtureNamePrefix} race`,
  stale: `${fixtureNamePrefix} stale`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function setOwnerRole(role: "owner" | "member" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
    set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function cleanup() {
  setOwnerRole("owner");
  sql(`
    delete from public.litter_care_tasks
    where id::text like '9f180018-%'
       or litter_id::text like '9f180018-%'
       or organization_template_id::text like '9f180018-%'
       or creation_command_id::text like '9f180018-%'
       or title like ${q(`${fixtureNamePrefix}%`)};

    delete from public.litter_care_task_generation_commands
    where litter_id::text like '9f180018-%'
       or client_command_id::text like '9f180018-%';

    delete from public.litter_care_task_templates
    where id::text like '9f180018-%'
       or title like ${q(`${fixtureNamePrefix}%`)};

    delete from public.litters
    where id::text like '9f180018-%'
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id::text like '9f180018-%'
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f180018-%';
    delete from auth.identities where user_id::text like '9f180018-%';
    delete from auth.users where id::text like '9f180018-%';
    delete from public.organizations where id::text like '9f180018-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like '9f180018-%'
             or litter_id::text like '9f180018-%'
             or organization_template_id::text like '9f180018-%'
             or creation_command_id::text like '9f180018-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'commands', (
          select count(*) from public.litter_care_task_generation_commands
          where litter_id::text like '9f180018-%'
             or client_command_id::text like '9f180018-%'
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like '9f180018-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'litters', (
          select count(*) from public.litters
          where id::text like '9f180018-%'
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id::text like '9f180018-%'
             or call_name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180018-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180018-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180018-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180018-%'
        ),
        'organizations', (
          select count(*) from public.organizations where id::text like '9f180018-%'
        ),
        'membership_role_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted or restored`).toBe(0);
  }
}

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'maternal_observations', (select count(*) from public.maternal_observations),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments)
      )::text;
    `),
  ) as Record<string, number>;
}

function createFixtures() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, estimated_ovulation_date, expected_birth_date,
      actual_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} portée`)}, 'dog', 'Golden Retriever',
      ${q(ids.mother)}::uuid, 'birth_expected', '2026-07-01', '2026-07-03',
      '2026-08-20', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order,
      revision, created_by, updated_by
    ) values
      (${q(ids.readyOneTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.readyOne)}, null, 'preparation', 'litter', 'expected_birth', 2,
       'dog', null, true, 10, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.readyTwoTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.readyTwo)}, null, 'maternal_health', 'mother', 'first_mating', -1,
       'dog', 'Golden Retriever', true, 20, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.alreadyGeneratedTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.alreadyGenerated)}, null, 'veterinary', 'all_offspring',
       'expected_birth', 1, 'dog', null, true, 30, 1,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.missingAnchorTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.missingAnchor)}, null, 'offspring_weight', 'all_offspring',
       'actual_birth', 7, 'dog', null, true, 40, 1,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.speciesMismatchTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.speciesMismatch)}, null, 'other', 'litter', 'expected_birth', 0,
       'cat', null, true, 50, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.breedMismatchTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.breedMismatch)}, null, 'other', 'litter', 'expected_birth', 0,
       'dog', 'Labrador Retriever', true, 60, 1,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.staleTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.stale)}, null, 'vaccination', 'all_offspring', 'expected_birth', 10,
       'dog', null, true, 70, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveTemplate)}::uuid, ${q(organizationId)}::uuid,
       ${q(titles.inactive)}, null, 'other', 'organization', 'expected_birth', 0,
       'dog', null, false, 80, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, organization_template_id,
      occurrence_no, category, target_scope, title, anchor_type, anchor_date,
      offset_days, planned_for, status, creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.existingTask)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.litter)}::uuid, 'organization_template',
      ${q(ids.alreadyGeneratedTemplate)}::uuid, 1, 'veterinary', 'all_offspring',
      ${q(titles.alreadyGenerated)}, 'expected_birth', '2026-08-20', 1,
      '2026-08-21', 'planned', ${q(ids.existingTaskCommand)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function generatedTaskCount(templateId?: string) {
  return Number(
    sql(`
      select count(*) from public.litter_care_tasks
      where litter_id = ${q(ids.litter)}::uuid
      ${templateId ? `and organization_template_id = ${q(templateId)}::uuid` : ""};
    `),
  );
}

function generationCommandCount() {
  return Number(
    sql(`
      select count(*) from public.litter_care_task_generation_commands
      where litter_id = ${q(ids.litter)}::uuid;
    `),
  );
}

function createdArtifactIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'task_ids', coalesce((
          select json_agg(id order by id) from public.litter_care_tasks
          where litter_id = ${q(ids.litter)}::uuid
        ), '[]'::json),
        'command_ids', coalesce((
          select json_agg(client_command_id order by client_command_id)
          from public.litter_care_task_generation_commands
          where litter_id = ${q(ids.litter)}::uuid
        ), '[]'::json)
      )::text;
    `),
  ) as { task_ids: string[]; command_ids: string[] };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function generationPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Jalons issus des modèles" })
    .locator("xpath=ancestor::section[1]");
}

function tasksPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Tâches de suivi" })
    .locator("xpath=ancestor::section[1]");
}

function planItem(page: Page, title: string) {
  return generationPanel(page).locator("li").filter({ hasText: title });
}

async function openSelection(page: Page) {
  await generationPanel(page)
    .getByRole("button", { name: "Sélectionner des tâches" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Sélectionner les tâches applicables" }),
  ).toBeVisible();
  return dialog;
}

test("sélectionne et génère les jalons du Journal avec permissions et plan figé", async ({
  page,
}) => {
  let artifactIds: { task_ids: string[]; command_ids: string[] } = {
    task_ids: [],
    command_ids: [],
  };
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();
    setOwnerRole("member");
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);

    const panel = generationPanel(page);
    await expect(panel).toBeVisible();
    await expect(planItem(page, titles.readyOne)).toContainText("Prêt à générer");
    await expect(planItem(page, titles.alreadyGenerated)).toContainText("Déjà créé");
    await expect(planItem(page, titles.missingAnchor)).toContainText(
      "Date de référence manquante",
    );
    await expect(planItem(page, titles.inactive)).toContainText("Modèle inactif");
    await expect(planItem(page, titles.speciesMismatch)).toContainText(
      "Espèce non applicable",
    );
    await expect(planItem(page, titles.breedMismatch)).toContainText(
      "Race non applicable",
    );

    await expect(planItem(page, titles.readyOne)).toContainText(
      "Date prévue : 22 août 2026",
    );
    await expect(planItem(page, titles.readyTwo)).toContainText(
      "Première saillie · 1 jour avant",
    );
    await expect(planItem(page, titles.readyTwo)).toContainText(
      "Date prévue : 30 juin 2026",
    );
    await expect(planItem(page, titles.missingAnchor)).toContainText(
      "La date « Naissance réelle » n’est pas renseignée",
    );
    await expect(planItem(page, titles.inactive)).toContainText(
      "Ce modèle est désactivé",
    );
    await expect(planItem(page, titles.speciesMismatch)).toContainText(
      "L’espèce de ce modèle ne correspond pas",
    );
    await expect(planItem(page, titles.breedMismatch)).toContainText(
      "La race de ce modèle ne correspond pas",
    );

    const tasksBeforeDialog = generatedTaskCount();
    const commandsBeforeDialog = generationCommandCount();
    let dialog = await openSelection(page);
    const checkboxes = dialog.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(3);
    for (const checkbox of await checkboxes.all()) {
      await expect(checkbox).not.toBeChecked();
    }
    await expect(dialog.getByRole("button", { name: "Continuer" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Tout sélectionner" }).click();
    for (const checkbox of await checkboxes.all()) {
      await expect(checkbox).toBeChecked();
    }
    await dialog.getByRole("button", { name: "Tout désélectionner" }).click();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect(generatedTaskCount()).toBe(tasksBeforeDialog);
    expect(generationCommandCount()).toBe(commandsBeforeDialog);

    dialog = await openSelection(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(generatedTaskCount()).toBe(tasksBeforeDialog);
    expect(generationCommandCount()).toBe(commandsBeforeDialog);

    dialog = await openSelection(page);
    await dialog.getByRole("checkbox", { name: new RegExp(titles.readyOne) }).check();
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(titles.readyTwo) }),
    ).not.toBeChecked();
    await dialog.getByRole("button", { name: "Continuer" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Confirmer la création" }),
    ).toBeVisible();
    await expect(dialog).toContainText("1 tâche sera créée");
    await expect(dialog).toContainText(titles.readyOne);
    await expect(dialog).toContainText("Prévue le 22 août 2026");
    await expect(dialog).not.toContainText(titles.readyTwo);
    await expect(dialog).toContainText(
      "Les tâches existantes ne seront ni déplacées ni recalculées.",
    );
    await expect(
      dialog.locator(
        'input[name="revision"], input[name="anchor_date"], input[name="planned_for"], input[name="anchor_type"], input[name="clientCommandId"], input[name="plan"]',
      ),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Créer les tâches sélectionnées" })
      .dblclick();
    await expect(dialog).toBeHidden();
    await expect(panel.getByRole("status")).toHaveText("1 tâche créée.");
    await expect(planItem(page, titles.readyOne)).toContainText("Déjà créé");
    await expect(tasksPanel(page).getByText(titles.readyOne)).toBeVisible();
    expect(generatedTaskCount(ids.readyOneTemplate)).toBe(1);

    dialog = await openSelection(page);
    await dialog.getByRole("checkbox", { name: new RegExp(titles.readyTwo) }).check();
    await dialog.getByRole("button", { name: "Continuer" }).click();
    await expect(dialog).toContainText(titles.readyTwo);
    await expect(dialog).toContainText("Prévue le 30 juin 2026");
    await dialog
      .getByRole("button", { name: "Créer les tâches sélectionnées" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(planItem(page, titles.readyTwo)).toContainText("Déjà créé");
    await expect(tasksPanel(page).getByText(titles.readyTwo)).toBeVisible();
    expect(generatedTaskCount(ids.readyTwoTemplate)).toBe(1);

    dialog = await openSelection(page);
    await dialog.getByRole("checkbox", { name: new RegExp(titles.stale) }).check();
    await dialog.getByRole("button", { name: "Continuer" }).click();
    const staleTaskCountBefore = generatedTaskCount(ids.staleTemplate);
    sql(`
      update public.litter_care_task_templates
      set revision = revision + 1, updated_by = ${q(ownerId)}::uuid
      where id = ${q(ids.staleTemplate)}::uuid;
    `);
    await dialog
      .getByRole("button", { name: "Créer les tâches sélectionnées" })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Le plan a changé. Rechargez le Journal avant de recommencer.",
    );
    expect(generatedTaskCount(ids.staleTemplate)).toBe(staleTaskCountBefore);
    await page.keyboard.press("Escape");

    setOwnerRole("viewer");
    await page.reload();
    const viewerPanel = generationPanel(page);
    await expect(viewerPanel.getByText(titles.readyOne)).toBeVisible();
    await expect(viewerPanel.getByText(titles.stale)).toBeVisible();
    await expect(viewerPanel.locator("button")).toHaveCount(0);
    await expect(viewerPanel.locator("input")).toHaveCount(0);
    await expect(viewerPanel.locator("form")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
    artifactIds = createdArtifactIds();
    expect(artifactIds.task_ids).toHaveLength(3);
    expect(artifactIds.command_ids).toHaveLength(3);
  } finally {
    console.info(`E2E generation fixture IDs: ${JSON.stringify(ids)}`);
    console.info(`E2E generation created artifact IDs: ${JSON.stringify(artifactIds)}`);
    cleanup();
    expectCleanupAtZero();
  }
});

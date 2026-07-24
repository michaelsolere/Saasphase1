import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f260001-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E actions rapides aujourd’hui";
const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  doneTask: `${prefix}03`,
  notApplicableTask: `${prefix}04`,
  doneCreationCommand: `${prefix}11`,
  notApplicableCreationCommand: `${prefix}12`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    delete from public.litter_care_tasks
    where id::text like '9f260001-%'
       or litter_id::text like '9f260001-%'
       or creation_command_id::text like '9f260001-%'
       or resolution_command_id::text like '9f260001-%'
       or title like ${q(`${fixtureNamePrefix}%`)};
    delete from public.litters
    where id::text like '9f260001-%' or name like ${q(`${fixtureNamePrefix}%`)};
    delete from public.animals where id::text like '9f260001-%';
  `);
}

function remainingCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'tasks', (select count(*) from public.litter_care_tasks where id::text like '9f260001-%' or litter_id::text like '9f260001-%' or creation_command_id::text like '9f260001-%' or resolution_command_id::text like '9f260001-%' or title like ${q(`${fixtureNamePrefix}%`)}),
      'litters', (select count(*) from public.litters where id::text like '9f260001-%' or name like ${q(`${fixtureNamePrefix}%`)}),
      'animals', (select count(*) from public.animals where id::text like '9f260001-%'),
      'role_changes', (select count(*) from public.memberships where id = ${q(ownerMembershipId)}::uuid and role <> 'owner')
    )::text;
  `)) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function verifyOwnerFixture() {
  expect(sql(`select count(*) from public.memberships where id = ${q(ownerMembershipId)}::uuid and organization_id = ${q(organizationId)}::uuid and profile_id = ${q(ownerId)}::uuid and role = 'owner';`)).toBe("1");
}

function createFixtures(today: string) {
  sql(`
    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère actions rapides E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litters (id, organization_id, name, species, breed, mother_id, status, created_by, updated_by)
    values (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} portée`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id, organization_id, litter_id, source, occurrence_no, category, target_scope, title, planned_for, status, creation_command_id, created_by, updated_by)
    values
      (${q(ids.doneTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'maternal_health', 'mother', ${q(`${fixtureNamePrefix} réalisée`)}, ${q(today)}::date, 'planned', ${q(ids.doneCreationCommand)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.notApplicableTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'other', 'litter', ${q(`${fixtureNamePrefix} non applicable`)}, ${q(today)}::date, 'planned', ${q(ids.notApplicableCreationCommand)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function resolutionRow(taskId: string) {
  return JSON.parse(sql(`
    select json_build_object('status', status, 'resolved_at', resolved_at, 'resolved_by', resolved_by, 'resolution_command_id', resolution_command_id, 'resolution_note', resolution_note)::text
    from public.litter_care_tasks where id = ${q(taskId)}::uuid;
  `)) as Record<string, string | null>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function todayPanel(page: Page) {
  return page.getByRole("heading", { name: "Aujourd’hui" }).locator("xpath=ancestor::section[1]");
}

test("traite les actions rapides du panneau Aujourd’hui", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();

  try {
    const today = formatLitterJournalBusinessDate(new Date());
    createFixtures(today);
    verifyOwnerFixture();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);

    const panel = todayPanel(page);
    const doneItem = panel.locator("li").filter({ hasText: `${fixtureNamePrefix} réalisée` });
    const notApplicableItem = panel.locator("li").filter({ hasText: `${fixtureNamePrefix} non applicable` });
    await expect(doneItem.getByRole("button", { name: "Marquer comme réalisé" })).toBeVisible();
    await expect(doneItem.getByRole("button", { name: "Non applicable" })).toBeVisible();
    await expect(notApplicableItem.getByRole("button", { name: "Marquer comme réalisé" })).toBeVisible();
    await expect(notApplicableItem.getByRole("button", { name: "Non applicable" })).toBeVisible();

    await doneItem.getByRole("button", { name: "Marquer comme réalisé" }).click();
    await expect(panel.getByRole("heading", { name: "Traité aujourd’hui" })).toBeVisible();
    const handledDoneItem = panel.locator("li").filter({ hasText: `${fixtureNamePrefix} réalisée` });
    await expect(handledDoneItem).toContainText("Statut : Réalisée");
    await expect(handledDoneItem.getByRole("button")).toHaveCount(0);
    const doneRow = resolutionRow(ids.doneTask);
    expect(doneRow.status).toBe("done");
    expect(doneRow.resolved_at).not.toBeNull();
    expect(doneRow.resolved_by).toBe(ownerId);
    expect(doneRow.resolution_command_id).not.toBeNull();

    await notApplicableItem.getByRole("button", { name: "Non applicable" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`${fixtureNamePrefix} non applicable`);
    await expect(dialog).toContainText("quittera les actions en attente");
    await dialog.getByLabel("Note (facultative)").fill("Élément non requis pour cette portée.");
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    const handledNotApplicableItem = panel.locator("li").filter({ hasText: `${fixtureNamePrefix} non applicable` });
    await expect(handledNotApplicableItem).toContainText("Statut : Non applicable");
    await expect(handledNotApplicableItem.getByRole("button")).toHaveCount(0);
    const notApplicableRow = resolutionRow(ids.notApplicableTask);
    expect(notApplicableRow.status).toBe("not_applicable");
    expect(notApplicableRow.resolved_at).not.toBeNull();
    expect(notApplicableRow.resolved_by).toBe(ownerId);
    expect(notApplicableRow.resolution_command_id).not.toBeNull();
    expect(notApplicableRow.resolution_note).toBe("Élément non requis pour cette portée.");
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});

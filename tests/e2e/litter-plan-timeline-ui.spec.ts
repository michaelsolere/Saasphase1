import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f240003-0000-4000-8000-0000000000";
const ids = { mother: `${prefix}01`, litter: `${prefix}02`, milestoneTemplate: `${prefix}03`, windowTemplate: `${prefix}04`, pendingTemplate: `${prefix}05`, model: `${prefix}06`, milestoneItem: `${prefix}07`, windowItem: `${prefix}08`, pendingItem: `${prefix}09`, command: `${prefix}10` } as const;
const q = (value: string) => `'${value}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner' where id = ${q(membershipId)}::uuid;
    set session_replication_role = origin;
    delete from public.litter_plan_application_commands where litter_id = ${q(ids.litter)}::uuid;
    delete from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid;
    delete from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid;
    delete from public.litter_plans where litter_id = ${q(ids.litter)}::uuid;
    delete from public.litter_planning_model_commands where model_id = ${q(ids.model)}::uuid;
    delete from public.litter_planning_model_items where model_id = ${q(ids.model)}::uuid;
    delete from public.litter_planning_models where id = ${q(ids.model)}::uuid;
    delete from public.litter_care_task_templates where id in (${q(ids.milestoneTemplate)}::uuid, ${q(ids.windowTemplate)}::uuid, ${q(ids.pendingTemplate)}::uuid);
    delete from public.litters where id = ${q(ids.litter)}::uuid;
    delete from public.animals where id = ${q(ids.mother)}::uuid;
  `);
}

function remainingCounts() {
  return JSON.parse(sql(`select json_build_object(
    'commands', (select count(*) from public.litter_plan_application_commands where litter_id = ${q(ids.litter)}::uuid),
    'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid),
    'items', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
    'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
    'modelItems', (select count(*) from public.litter_planning_model_items where model_id = ${q(ids.model)}::uuid),
    'models', (select count(*) from public.litter_planning_models where id = ${q(ids.model)}::uuid),
    'templates', (select count(*) from public.litter_care_task_templates where id::text like '9f240003-%'),
    'litters', (select count(*) from public.litters where id = ${q(ids.litter)}::uuid),
    'animals', (select count(*) from public.animals where id = ${q(ids.mother)}::uuid),
    'roleChanges', (select count(*) from public.memberships where id = ${q(membershipId)}::uuid and role <> 'owner')
  )::text;`)) as Record<string, number>;
}

function expectCleanup() {
  for (const [table, count] of Object.entries(remainingCounts())) expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
}

function createdFixtureIds() {
  return JSON.parse(sql(`select json_build_object(
    'animals', (select coalesce(json_agg(id order by id), '[]'::json) from public.animals where id = ${q(ids.mother)}::uuid),
    'litters', (select coalesce(json_agg(id order by id), '[]'::json) from public.litters where id = ${q(ids.litter)}::uuid),
    'templates', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_care_task_templates where id::text like '9f240003-%'),
    'models', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_planning_models where id = ${q(ids.model)}::uuid),
    'modelItems', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_planning_model_items where model_id = ${q(ids.model)}::uuid),
    'plans', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
    'planItems', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
    'tasks', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid),
    'applicationCommands', (select coalesce(json_agg(id order by id), '[]'::json) from public.litter_plan_application_commands where litter_id = ${q(ids.litter)}::uuid)
  )::text;`)) as Record<string, string[]>;
}

function createFixtures() {
  sql(`
    insert into public.animals(id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère timeline E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litters(id, organization_id, name, species, breed, mother_id, status, mating_date, created_by, updated_by)
    values (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'E2E timeline portée', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', '2026-06-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litter_care_task_templates(id, organization_id, title, category, target_scope, anchor_type, offset_days, species, revision, created_by, updated_by) values
    (${q(ids.milestoneTemplate)}::uuid, ${q(organizationId)}::uuid, 'E2E jalon ponctuel', 'preparation', 'litter', 'first_mating', 2, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.windowTemplate)}::uuid, ${q(organizationId)}::uuid, 'E2E fenêtre', 'veterinary', 'litter', 'first_mating', 2, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.pendingTemplate)}::uuid, ${q(organizationId)}::uuid, 'E2E attente ancre', 'offspring_health', 'litter', 'actual_birth', 2, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litter_planning_models(id, organization_id, title, species, breed, revision, created_by, updated_by)
    values (${q(ids.model)}::uuid, ${q(organizationId)}::uuid, 'E2E modèle timeline', 'dog', 'Golden Retriever', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litter_planning_model_items(id, organization_id, model_id, organization_template_id, item_kind, priority, anchor_type, point_offset_days, window_starts_offset_days, window_ends_offset_days, display_order, is_required, is_selected_by_default, created_by, updated_by) values
    (${q(ids.milestoneItem)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.milestoneTemplate)}::uuid, 'milestone', 'normal', 'first_mating', 2, null, null, 0, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.windowItem)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.windowTemplate)}::uuid, 'window', 'normal', 'first_mating', null, 3, 6, 1, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.pendingItem)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.pendingTemplate)}::uuid, 'task', 'normal', 'actual_birth', 2, null, null, 2, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function applyPlan() {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  expect((await client.auth.signInWithPassword({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })).error).toBeNull();
  const result = await client.rpc("apply_litter_planning_model", { p_litter_id: ids.litter, p_planning_model_id: ids.model, p_client_command_id: ids.command, p_expected_model_revision: 1, p_expected_plan_revision: null, p_selected_model_item_ids: null, p_timezone_name: "Europe/Paris" });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("filtre la frise localement, reste accessible sur mobile et conserve les actions", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec"}`,
    );
  });

  cleanup();
  expectCleanup();
  try {
  createFixtures(); await applyPlan();
  const fixtureIds = createdFixtureIds();
  expect(Object.fromEntries(Object.entries(fixtureIds).map(([name, values]) => [name, values.length]))).toEqual({
    animals: 1,
    litters: 1,
    templates: 3,
    models: 1,
    modelItems: 3,
    plans: 1,
    planItems: 3,
    tasks: 2,
    applicationCommands: 1,
  });
  console.log(`LITTER-TIMELINE-FILTERS-01 fixtures: ${JSON.stringify(fixtureIds)}`);
  sql(`
    update public.litter_care_tasks
    set status = 'done',
        resolution_command_id = ${q(`${prefix}11`)}::uuid,
        resolved_at = now(),
        resolved_timezone_name = 'Europe/Paris',
        resolved_by = ${q(ownerId)}::uuid
    where litter_id = ${q(ids.litter)}::uuid
      and title = 'E2E jalon ponctuel';
  `);
  await login(page);
  await page.goto(`/litters/journal?litter=${ids.litter}`);
  const panel = page.getByRole("region", {
    name: "Planning de la portée",
    exact: true,
  });
  await expect(panel).toContainText("E2E timeline portée");
  const categoryFilter = panel.getByLabel("Catégorie", { exact: true });
  const includeTerminal = panel.getByLabel("Inclure les éléments traités", {
    exact: true,
  });
  const counter = panel.locator("[data-timeline-filter-count]");

  await expect(categoryFilter).toHaveValue("all");
  await expect(includeTerminal).not.toBeChecked();
  await expect(counter).toHaveAttribute("role", "status");
  await expect(counter).toHaveAttribute("aria-live", "polite");
  await expect(categoryFilter.locator("option")).toHaveText([
    "Toutes les catégories",
    "Préparation",
    "Vétérinaire",
    "Santé des petits",
  ]);
  await expect(counter).toHaveText("2 éléments affichés sur 3");
  await expect(panel.getByText("E2E jalon ponctuel", { exact: true })).toHaveCount(0);
  await expect(panel).toContainText("E2E fenêtre");
  await expect(panel).toContainText("E2E attente ancre");

  await categoryFilter.selectOption("veterinary");
  await expect(counter).toHaveText("1 éléments affichés sur 3");
  await expect(panel).toContainText("E2E fenêtre");
  await expect(panel.getByText("E2E attente ancre", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Ajuster précisément" }).click();
  const scheduleDialog = page.getByRole("dialog");
  await expect(scheduleDialog).toBeVisible();
  await scheduleDialog.getByRole("button", { name: "Annuler" }).click();
  await expect(scheduleDialog).toHaveCount(0);

  await categoryFilter.selectOption("preparation");
  await expect(counter).toHaveText("0 éléments affichés sur 3");
  const emptyState = panel.locator("[data-timeline-filter-empty]");
  await expect(emptyState).toContainText(
    "Aucun élément ne correspond aux filtres actuels.",
  );
  await expect(
    emptyState.getByRole("button", { name: "Voir toutes les catégories" }),
  ).toBeVisible();
  await expect(
    emptyState.getByRole("button", {
      name: "Inclure les éléments traités",
    }),
  ).toBeVisible();
  await emptyState
    .getByRole("button", { name: "Voir toutes les catégories" })
    .click();
  await expect(categoryFilter).toHaveValue("all");
  await expect(counter).toHaveText("2 éléments affichés sur 3");

  await includeTerminal.check();
  await expect(counter).toHaveText("3 éléments affichés sur 3");
  await expect(panel).toContainText("E2E jalon ponctuel");
  await expect(panel).toContainText("Traité");
  await expect(panel).toContainText("Fenêtre");
  const window = panel.locator("[data-timeline-window]").filter({ hasText: "E2E fenêtre" });
  await expect(window).toHaveAttribute("data-start-percent", /44\.4/);
  await expect(window).toHaveAttribute("data-end-percent", /61\.1/);
  await expect(window.locator("[data-timeline-window-band]")).toHaveCount(1);
  await expect(window.locator("[data-timeline-window-start]")).toHaveCount(1);
  await expect(window.locator("[data-timeline-window-end]")).toHaveCount(1);
  await expect(panel).toContainText("En attente d’une date de référence");
  await expect(panel).toContainText("E2E attente ancre");
  await expect(panel.getByRole("button", { name: /Ajuster précisément/ })).toHaveCount(1);

  await includeTerminal.uncheck();
  await categoryFilter.selectOption("offspring_health");
  await expect(counter).toHaveText("1 éléments affichés sur 3");
  await expect(panel).toContainText("E2E attente ancre");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(categoryFilter).toBeVisible();
  await expect(includeTerminal).toBeVisible();
  await expect(counter).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await categoryFilter.selectOption("all");
  await expect(counter).toHaveText("2 éléments affichés sur 3");
  await categoryFilter.focus();
  await expect(categoryFilter).toBeFocused();
  await includeTerminal.focus();
  await page.keyboard.press("Space");
  await expect(includeTerminal).toBeChecked();
  await page.keyboard.press("Space");
  await expect(includeTerminal).not.toBeChecked();

  sql(`set session_replication_role = replica; update public.memberships set role = 'viewer' where id = ${q(membershipId)}::uuid; set session_replication_role = origin;`);
  await page.context().clearCookies(); await login(page); await page.goto(`/litters/journal?litter=${ids.litter}`);
  await expect(page.getByRole("region", { name: "Planning de la portée", exact: true })).toContainText("E2E fenêtre");
  await expect(page.getByRole("region", { name: "Planning de la portée", exact: true }).getByText("E2E jalon ponctuel", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Planning de la portée", exact: true }).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter une tâche" })).toHaveCount(0);

  sql(`delete from public.litter_plan_application_commands where litter_id = ${q(ids.litter)}::uuid; delete from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid; delete from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid; delete from public.litter_plans where litter_id = ${q(ids.litter)}::uuid;`);
  await page.goto(`/litters/journal?litter=${ids.litter}`);
  await expect(page.getByText("Aucun planning n’a encore été appliqué à cette portée.")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  } finally {
    cleanup();
    expectCleanup();
  }
});

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f180008-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E litter care tasks UI";

const ids = {
  mother: `${prefix}01`,
  foreignMother: `${prefix}02`,
  mainLitter: `${prefix}10`,
  emptyLitter: `${prefix}11`,
  foreignLitter: `${prefix}12`,
  otherOrganization: `${prefix}90`,
  template: `${prefix}20`,
  pastTask: `${prefix}30`,
  futureTask: `${prefix}31`,
  cancelledTask: `${prefix}32`,
  notApplicableTask: `${prefix}33`,
  concurrentTask: `${prefix}34`,
  roleTask: `${prefix}35`,
  closeTask: `${prefix}36`,
  terminalDoneTask: `${prefix}37`,
  terminalCancelledTask: `${prefix}38`,
  terminalNotApplicableTask: `${prefix}39`,
  foreignTask: `${prefix}3a`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;

    drop function if exists public.e2e_litter_care_tasks_ui_hold(uuid);

    delete from public.litter_care_tasks
    where id::text like '9f180008-%'
       or litter_id::text like '9f180008-%'
       or creation_command_id::text like '9f180008-%'
       or resolution_command_id::text like '9f180008-%'
       or title like ${q(`${fixtureNamePrefix}%`)};

    delete from public.litter_care_task_templates
    where id::text like '9f180008-%'
       or title like ${q(`${fixtureNamePrefix}%`)};

    delete from public.litters
    where id::text like '9f180008-%'
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals where id::text like '9f180008-%';
    delete from public.memberships where id::text like '9f180008-%';
    delete from auth.identities where user_id::text like '9f180008-%';
    delete from auth.users where id::text like '9f180008-%';
    delete from public.organizations where id::text like '9f180008-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like '9f180008-%'
             or litter_id::text like '9f180008-%'
             or creation_command_id::text like '9f180008-%'
             or resolution_command_id::text like '9f180008-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like '9f180008-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'litters', (
          select count(*) from public.litters
          where id::text like '9f180008-%'
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals where id::text like '9f180008-%'
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180008-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180008-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180008-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180008-%'
        ),
        'organizations', (
          select count(*) from public.organizations where id::text like '9f180008-%'
        ),
        'temporary_functions', (
          select count(*) from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname like 'e2e_litter_care_tasks_ui%'
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
        'payments', (select count(*) from public.payments),
        'animals', (select count(*) from public.animals),
        'whelping_sessions', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_sessions'
        ),
        'whelping_births', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_births'
        ),
        'animal_weight_measurements', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname = 'animal_weight_measurements'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E tâches UI isolée',
      'e2e-taches-ui-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       'Mère tâches UI E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Mère étrangère tâches UI E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.emptyLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} vide`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} étrangère`)}, 'dog', 'Golden Retriever',
       ${q(ids.foreignMother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type,
      offset_days, species, breed, is_active, sort_order, created_by, updated_by
    ) values (
      ${q(ids.template)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} jalon`)}, 'offspring_weight', 'all_offspring',
      'expected_birth', 1, 'dog', 'Golden Retriever', true, 1,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, description, planned_for, status,
      creation_command_id, created_by, updated_by
    ) values
      (${q(ids.pastTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       'manual', 1, 'maternal_health', 'mother', 'Tâche prévue ancienne',
       'Description prévue visible.', '2000-01-02', 'planned',
       ${q(`${prefix}50`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelledTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       'manual', 1, 'vaccination', 'litter', 'Tâche à annuler', null,
       '2026-08-02', 'planned', ${q(`${prefix}51`)}::uuid,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       'manual', 1, 'identification', 'all_offspring', 'Tâche concurrente', null,
       '2026-08-03', 'planned', ${q(`${prefix}52`)}::uuid,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.roleTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       'manual', 1, 'maternal_feeding', 'mother', 'Tâche changement de rôle', null,
       '2026-08-04', 'planned', ${q(`${prefix}53`)}::uuid,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closeTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       'manual', 1, 'offspring_feeding', 'all_offspring', 'Tâche après clôture', null,
       '2026-08-05', 'planned', ${q(`${prefix}54`)}::uuid,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, system_template_code,
      occurrence_no, category, target_scope, title, description, anchor_type,
      anchor_date, offset_days, planned_for, status, creation_command_id,
      created_by, updated_by
    ) values
      (${q(ids.notApplicableTask)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, 'system_template', 'ui-not-applicable', 1,
       'reproduction', 'organization', 'Tâche non applicable', null,
       'expected_birth', '2026-08-05', 0, '2026-08-05', 'planned',
       ${q(`${prefix}55`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.terminalDoneTask)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, 'system_template', 'ui-terminal-done', 1,
       'veterinary', 'organization', 'Historique réalisé', null,
       'expected_birth', '2026-07-18', 0, '2026-07-18', 'planned',
       ${q(`${prefix}56`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    update public.litter_care_tasks
    set status = 'done',
        resolution_command_id = ${q(`${prefix}70`)}::uuid,
        resolved_at = '2026-07-18T14:30:00.000Z'::timestamptz,
        resolved_timezone_name = 'America/New_York',
        resolved_by = ${q(ownerId)}::uuid,
        resolution_note = 'Note de résolution affichée.'
    where id = ${q(ids.terminalDoneTask)}::uuid;

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, organization_template_id,
      occurrence_no, category, target_scope, title, description, anchor_type,
      anchor_date, offset_days, planned_for, status, creation_command_id,
      created_by, updated_by
    ) values
      (${q(ids.futureTask)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, 'organization_template', ${q(ids.template)}::uuid,
       1, 'offspring_weight', 'all_offspring', 'Tâche prévue future',
       'Description du jalon personnalisé.', 'expected_birth', '2099-12-30', 1,
       '2099-12-31', 'planned', ${q(`${prefix}57`)}::uuid,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.terminalCancelledTask)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, 'organization_template', ${q(ids.template)}::uuid,
       2, 'preparation', 'litter', 'Historique annulé', null,
       'expected_birth', '2026-07-17', 1, '2026-07-18', 'planned',
       ${q(`${prefix}58`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    update public.litter_care_tasks
    set status = 'cancelled',
        resolution_command_id = ${q(`${prefix}71`)}::uuid,
        resolved_at = '2026-07-18T15:00:00.000Z'::timestamptz,
        resolved_timezone_name = 'Europe/Paris',
        resolved_by = ${q(ownerId)}::uuid
    where id = ${q(ids.terminalCancelledTask)}::uuid;

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, planned_for, status, creation_command_id,
      resolution_command_id, resolved_at, resolved_timezone_name, resolved_by,
      created_by, updated_by
    ) values (
      ${q(ids.terminalNotApplicableTask)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mainLitter)}::uuid, 'manual', 1, 'socialization', 'litter',
      'Historique non applicable', '2026-07-18', 'not_applicable',
      ${q(`${prefix}59`)}::uuid, ${q(`${prefix}72`)}::uuid,
      '2026-07-18T16:00:00.000Z'::timestamptz, 'Europe/Paris',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, system_template_code,
      occurrence_no, category, target_scope, title, anchor_type, anchor_date,
      offset_days, planned_for, status, creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.foreignTask)}::uuid, ${q(ids.otherOrganization)}::uuid,
      ${q(ids.foreignLitter)}::uuid, 'system_template', 'foreign-ui-task', 1,
      'other', 'organization', 'Tâche étrangère invisible', 'expected_birth',
      '2026-08-01', 0, '2026-08-01', 'planned', ${q(`${prefix}5a`)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function taskCount(title?: string) {
  return Number(
    sql(`
      select count(*) from public.litter_care_tasks
      where litter_id = ${q(ids.mainLitter)}::uuid
      ${title ? `and title = ${q(title)}` : ""};
    `),
  );
}

function taskRow(title: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', id,
        'source', source,
        'status', status,
        'category', category,
        'target_scope', target_scope,
        'title', title,
        'description', description,
        'planned_for', planned_for::text,
        'organization_template_id', organization_template_id,
        'system_template_code', system_template_code,
        'anchor_type', anchor_type,
        'anchor_date', anchor_date,
        'offset_days', offset_days,
        'creation_command_id', creation_command_id,
        'resolution_command_id', resolution_command_id,
        'resolved_at', resolved_at,
        'resolved_timezone_name', resolved_timezone_name,
        'resolution_note', resolution_note
      )::text
      from public.litter_care_tasks
      where litter_id = ${q(ids.mainLitter)}::uuid and title = ${q(title)}
      order by created_at desc limit 1;
    `),
  ) as Record<string, string | null>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function tasksPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Tâches de suivi" })
    .locator("xpath=ancestor::section[1]");
}

async function openCreateDialog(page: Page) {
  await tasksPanel(page).getByRole("button", { name: "Ajouter une tâche" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillCreateDialog(
  dialog: Locator,
  values: {
    title: string;
    description?: string;
    plannedFor: string;
    category?: string;
    targetScope?: string;
  },
) {
  await dialog.getByLabel("Titre").fill(values.title);
  if (values.description) {
    await dialog.getByLabel("Description (facultative)").fill(values.description);
  }
  await dialog.getByLabel("Date prévue").fill(values.plannedFor);
  if (values.category) {
    await dialog.getByLabel("Catégorie").selectOption(values.category);
  }
  if (values.targetScope) {
    await dialog.getByLabel("Cible").selectOption(values.targetScope);
  }
}

async function openResolveDialog(page: Page, title: string) {
  const item = tasksPanel(page).locator("li").filter({ hasText: title });
  await item.getByRole("button", { name: "Traiter la tâche" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(title);
  return dialog;
}

async function resolveTask(
  page: Page,
  title: string,
  values: {
    status: "done" | "cancelled" | "not_applicable";
    resolvedAt: string;
    note?: string;
    doubleClick?: boolean;
  },
) {
  const dialog = await openResolveDialog(page, title);
  await dialog.getByLabel("Résultat").selectOption(values.status);
  await dialog.getByLabel("Date et heure de résolution").fill(values.resolvedAt);
  if (values.note) {
    await dialog.getByLabel("Note (facultative)").fill(values.note);
  }
  const button = dialog.getByRole("button", { name: "Valider le résultat" });
  if (values.doubleClick) {
    await button.dblclick();
  } else {
    await button.click();
  }
  await expect.poll(() => taskRow(title).status).toBe(values.status);
  await expect(page.getByText("La tâche de suivi a été traitée.")).toBeVisible();
  await expect(
    tasksPanel(page)
      .locator("li")
      .filter({ hasText: title })
      .getByText(
        {
          done: "Réalisée",
          cancelled: "Annulée",
          not_applicable: "Non applicable",
        }[values.status],
        { exact: true },
      ),
  ).toBeVisible();
}

test("gère les tâches de suivi du Journal sans effet hors périmètre", async ({
  page,
}) => {
  const dynamicallyCreatedTaskIds: string[] = [];
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();
    await login(page);

    await page.goto(`/litters/journal?litter=${ids.emptyLitter}`);
    let panel = tasksPanel(page);
    await expect(
      panel.getByText("Aucune tâche de suivi enregistrée pour cette portée."),
    ).toBeVisible();
    await expect(panel.getByRole("heading", { name: "À faire" })).toBeVisible();
    await expect(panel.getByText("Aucune tâche en attente.")).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Historique" })).toBeVisible();
    await expect(panel.getByText("Aucune tâche terminée.")).toBeVisible();

    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    panel = tasksPanel(page);
    await expect(panel.getByText("Tâche prévue ancienne")).toBeVisible();
    await expect(panel.getByText("Tâche prévue future")).toBeVisible();
    await expect(panel.getByText("Historique réalisé")).toBeVisible();
    await expect(panel.getByText("Historique annulé")).toBeVisible();
    await expect(panel.getByText("Historique non applicable")).toBeVisible();
    await expect(panel.getByText("Tâche étrangère invisible")).toHaveCount(0);
    await expect(panel.getByText("Description prévue visible.")).toBeVisible();
    await expect(panel.getByText("Note de résolution affichée.")).toBeVisible();

    const plannedHeading = panel.getByRole("heading", { name: "À faire" });
    const historyHeading = panel.getByRole("heading", { name: "Historique" });
    expect(
      await plannedHeading.evaluate(
        (planned, history) =>
          Boolean(
            planned.compareDocumentPosition(history as Node) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        await historyHeading.elementHandle(),
      ),
    ).toBe(true);
    const plannedTexts = await plannedHeading
      .locator("xpath=following-sibling::ul[1]/li")
      .allTextContents();
    expect(plannedTexts[0]).toContain("Tâche prévue ancienne");
    expect(plannedTexts.at(-1)).toContain("Tâche prévue future");

    await expect(panel.getByText("Santé de la mère")).toBeVisible();
    await expect(panel.getByText("Mère", { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Ajout manuel").first()).toBeVisible();
    await expect(panel.getByText("Jalon personnalisé").first()).toBeVisible();
    await expect(panel.getByText("Jalon standard").first()).toBeVisible();
    await expect(panel.getByText("Réalisée", { exact: true })).toBeVisible();
    await expect(panel.getByText("Annulée", { exact: true })).toBeVisible();
    await expect(panel.getByText("Non applicable", { exact: true })).toBeVisible();
    await expect(panel.getByText("Prévue le 02 janvier 2000")).toBeVisible();

    const formattedResolution = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/New_York",
    }).format(new Date("2026-07-18T14:30:00.000Z"));
    await expect(panel.getByText(`Traitée le ${formattedResolution}`)).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    for (const technicalId of Object.values(ids)) {
      expect(bodyText).not.toContain(technicalId);
    }
    expect(bodyText).not.toContain("ui-terminal-done");

    await expect(
      panel.locator("li").filter({ hasText: "Tâche prévue ancienne" }).getByText("En retard"),
    ).toBeVisible();
    await expect(
      panel.locator("li").filter({ hasText: "Tâche prévue future" }).getByText("En retard"),
    ).toHaveCount(0);

    let dialog = await openCreateDialog(page);
    await expect(dialog.getByLabel("Catégorie")).toHaveValue("preparation");
    await expect(dialog.getByLabel("Cible")).toHaveValue("litter");
    await expect(dialog.getByLabel("Titre")).toHaveAttribute("maxlength", "255");
    await expect(dialog.getByLabel("Description (facultative)")).toHaveAttribute(
      "maxlength",
      "5000",
    );
    await expect(dialog.getByLabel("Date prévue")).toHaveAttribute("type", "date");
    await expect(dialog.getByLabel("Titre")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Date prévue")).toHaveAttribute("required", "");
    const categoryOptions = await dialog.getByLabel("Catégorie").locator("option").allTextContents();
    expect(categoryOptions).toEqual([
      "Reproduction",
      "Santé de la mère",
      "Alimentation de la mère",
      "Préparation",
      "Poids des petits",
      "Santé des petits",
      "Alimentation des petits",
      "Socialisation",
      "Vétérinaire",
      "Identification",
      "Vaccination",
      "Autre",
    ]);
    expect(await dialog.getByLabel("Cible").locator("option").allTextContents()).toEqual([
      "Mère",
      "Portée",
      "Tous les petits",
      "Élevage",
    ]);
    const countBeforeCancel = taskCount();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect(taskCount()).toBe(countBeforeCancel);

    dialog = await openCreateDialog(page);
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect(dialog.getByLabel("Titre")).toHaveJSProperty("validity.valid", false);
    await dialog.getByLabel("Titre").fill("Titre sans date");
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect(dialog.getByLabel("Date prévue")).toHaveJSProperty(
      "validity.valid",
      false,
    );
    await dialog.getByRole("button", { name: "Annuler" }).click();

    const firstCreatedTitle = `${fixtureNamePrefix} création manuelle 1`;
    dialog = await openCreateDialog(page);
    await fillCreateDialog(dialog, {
      title: firstCreatedTitle,
      description: "Description manuelle exacte.",
      plannedFor: "2026-08-06",
      category: "offspring_health",
      targetScope: "all_offspring",
    });
    const beforeDoubleClick = taskCount();
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("La tâche de suivi a été ajoutée.")).toBeVisible();
    await expect(panel.getByText(firstCreatedTitle)).toBeVisible();
    expect(taskCount()).toBe(beforeDoubleClick + 1);
    const firstCreatedRow = taskRow(firstCreatedTitle);
    dynamicallyCreatedTaskIds.push(firstCreatedRow.id!);
    expect(firstCreatedRow).toMatchObject({
      source: "manual",
      status: "planned",
      category: "offspring_health",
      target_scope: "all_offspring",
      description: "Description manuelle exacte.",
      planned_for: "2026-08-06",
      organization_template_id: null,
      system_template_code: null,
      anchor_type: null,
      anchor_date: null,
      offset_days: null,
    });

    const secondCreatedTitle = `${fixtureNamePrefix} création manuelle 2`;
    dialog = await openCreateDialog(page);
    await fillCreateDialog(dialog, {
      title: secondCreatedTitle,
      plannedFor: "2026-08-07",
      category: "other",
      targetScope: "organization",
    });
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("La tâche de suivi a été ajoutée.")).toBeVisible();
    await expect(panel.getByText(secondCreatedTitle)).toBeVisible();
    expect(taskCount(secondCreatedTitle)).toBe(1);
    const secondCreatedRow = taskRow(secondCreatedTitle);
    dynamicallyCreatedTaskIds.push(secondCreatedRow.id!);
    expect(secondCreatedRow.creation_command_id).not.toBe(
      firstCreatedRow.creation_command_id,
    );

    const reopenedTitle = `${fixtureNamePrefix} fermeture puis reprise`;
    dialog = await openCreateDialog(page);
    await fillCreateDialog(dialog, {
      title: reopenedTitle,
      description: "Même formulaire renvoyé.",
      plannedFor: "2026-08-08",
    });
    sql(`update public.litters set status = 'closed' where id = ${q(ids.mainLitter)}::uuid;`);
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Cette portée ne permet plus d’ajouter une tâche.",
    );
    expect(taskCount(reopenedTitle)).toBe(0);
    sql(`update public.litters set status = 'birth_expected' where id = ${q(ids.mainLitter)}::uuid;`);
    expect(
      sql(`select status from public.litters where id = ${q(ids.mainLitter)}::uuid;`),
    ).toBe("birth_expected");
    await expect(
      dialog.getByRole("button", { name: "Ajouter la tâche" }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect.poll(() => taskCount(reopenedTitle)).toBe(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByText("La tâche de suivi a été ajoutée.")).toBeVisible();
    await expect(panel.getByText(reopenedTitle)).toBeVisible();
    expect(taskCount(reopenedTitle)).toBe(1);
    dynamicallyCreatedTaskIds.push(taskRow(reopenedTitle).id!);

    await page.clock.setFixedTime(new Date("2026-07-18T09:00:00.000Z"));
    dialog = await openResolveDialog(page, "Tâche changement de rôle");
    const resolvedAtInput = dialog.getByLabel("Date et heure de résolution");
    const firstOpeningDefault = await page.evaluate(() => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60_000;
      return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    });
    await expect(resolvedAtInput).toHaveValue(firstOpeningDefault);
    expect(firstOpeningDefault).not.toBe("");
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();

    await page.clock.setFixedTime(new Date("2026-07-18T09:05:00.000Z"));
    dialog = await openResolveDialog(page, "Tâche changement de rôle");
    const secondOpeningDefault = await page.evaluate(() => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60_000;
      return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    });
    await expect(
      dialog.getByLabel("Date et heure de résolution"),
    ).toHaveValue(secondOpeningDefault);
    expect(secondOpeningDefault > firstOpeningDefault).toBe(true);

    const manuallyEditedResolution = "2026-07-18T09:03";
    await dialog
      .getByLabel("Date et heure de résolution")
      .fill(manuallyEditedResolution);
    await page.clock.setFixedTime(new Date("2026-07-18T09:10:00.000Z"));
    await expect(
      dialog.getByLabel("Date et heure de résolution"),
    ).toHaveValue(manuallyEditedResolution);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();

    const beforeDone = Number(
      sql(`select count(*) from public.litter_care_tasks where status = 'done' and litter_id = ${q(ids.mainLitter)}::uuid;`),
    );
    const doneLocal = "2026-07-18T10:15";
    const browserResolution = await page.evaluate((localValue) => {
      const instant = new Date(localValue);
      return {
        iso: instant.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }, doneLocal);
    await resolveTask(page, "Tâche prévue ancienne", {
      status: "done",
      resolvedAt: doneLocal,
      note: "Résolution exacte depuis le navigateur.",
      doubleClick: true,
    });
    expect(
      Number(
        sql(`select count(*) from public.litter_care_tasks where status = 'done' and litter_id = ${q(ids.mainLitter)}::uuid;`),
      ),
    ).toBe(beforeDone + 1);
    const doneRow = taskRow("Tâche prévue ancienne");
    expect(doneRow).toMatchObject({
      status: "done",
      resolved_timezone_name: browserResolution.timezone,
      resolution_note: "Résolution exacte depuis le navigateur.",
    });
    expect(new Date(doneRow.resolved_at!).toISOString()).toBe(browserResolution.iso);

    await resolveTask(page, "Tâche à annuler", {
      status: "cancelled",
      resolvedAt: "2026-07-18T11:00",
    });
    expect(taskRow("Tâche à annuler").status).toBe("cancelled");

    await resolveTask(page, "Tâche non applicable", {
      status: "not_applicable",
      resolvedAt: "2026-07-18T11:30",
    });
    expect(taskRow("Tâche non applicable").status).toBe("not_applicable");

    dialog = await openResolveDialog(page, "Tâche concurrente");
    await dialog.getByLabel("Date et heure de résolution").fill("2026-07-18T12:00");
    sql(`
      update public.litter_care_tasks
      set status = 'done',
          resolution_command_id = ${q(`${prefix}73`)}::uuid,
          resolved_at = '2026-07-18T12:00:00.000Z'::timestamptz,
          resolved_timezone_name = 'UTC',
          resolved_by = ${q(ownerId)}::uuid
      where id = ${q(ids.concurrentTask)}::uuid;
    `);
    await dialog.getByRole("button", { name: "Valider le résultat" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Cette tâche a déjà été traitée.",
    );
    expect(taskRow("Tâche concurrente").resolution_command_id).toBe(`${prefix}73`);
    await dialog.getByRole("button", { name: "Annuler" }).click();

    dialog = await openResolveDialog(page, "Tâche changement de rôle");
    const preservedResolutionValue = "2026-07-18T12:30";
    const mountedDialogId = await dialog.getAttribute("id");
    await dialog
      .getByLabel("Date et heure de résolution")
      .fill(preservedResolutionValue);
    setOwnerRole("viewer");
    await dialog.getByRole("button", { name: "Valider le résultat" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Vous n’avez pas les droits nécessaires pour traiter cette tâche.",
    );
    await expect(
      dialog.getByLabel("Date et heure de résolution"),
    ).toHaveValue(preservedResolutionValue);
    await expect(dialog).toHaveAttribute("id", mountedDialogId!);
    expect(taskRow("Tâche changement de rôle").status).toBe("planned");
    setOwnerRole("owner");
    await dialog.getByRole("button", { name: "Valider le résultat" }).click();
    await expect
      .poll(() => taskRow("Tâche changement de rôle").status)
      .toBe("done");
    await expect(dialog).toBeHidden();
    expect(taskRow("Tâche changement de rôle").resolution_command_id).toBeTruthy();

    setOwnerRole("viewer");
    await page.reload();
    panel = tasksPanel(page);
    await expect(panel.getByText("Tâche changement de rôle")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ajouter une tâche" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Traiter la tâche" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    setOwnerRole("owner");
    await page.reload();

    dialog = await openResolveDialog(page, "Tâche après clôture");
    await dialog.getByLabel("Date et heure de résolution").fill("2026-07-18T13:00");
    sql(`update public.litters set status = 'closed' where id = ${q(ids.mainLitter)}::uuid;`);
    await dialog.getByRole("button", { name: "Valider le résultat" }).click();
    await expect.poll(() => taskRow("Tâche après clôture").status).toBe("done");
    sql(`update public.litters set status = 'birth_expected' where id = ${q(ids.mainLitter)}::uuid;`);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    panel = tasksPanel(page);

    await page.setViewportSize({ width: 375, height: 760 });
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(
      panel.getByRole("button", { name: /Rouvrir|Modifier|Supprimer|Reporter/ }),
    ).toHaveCount(0);

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    console.info(
      `E2E dynamically created litter care task IDs: ${dynamicallyCreatedTaskIds.join(", ") || "none"}`,
    );
    cleanup();
    expectCleanupAtZero();
  }
});

import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190010-0000-4000-8000-0000000000";
const temporaryPackCode = "e2e-library-ui-versioned-pack";
const temporaryTemplateCode = "e2e-library-ui-versioned-template";
const importedProductCodes = [
  "dog-confirm-pregnancy",
  "dog-complete-birth-summary",
  "dog-open-socialization-checklist",
] as const;

const ids = {
  adminUser: `${prefix}01`,
  adminIdentity: `${prefix}02`,
  adminMembership: `${prefix}03`,
  memberUser: `${prefix}04`,
  memberIdentity: `${prefix}05`,
  memberMembership: `${prefix}06`,
  viewerUser: `${prefix}07`,
  viewerIdentity: `${prefix}08`,
  viewerMembership: `${prefix}09`,
} as const;

const credentials = {
  admin: ["library-ui-admin@saasphase1.invalid", "LibraryUiAdmin-2026!"],
  member: ["library-ui-member@saasphase1.invalid", "LibraryUiMember-2026!"],
  viewer: ["library-ui-viewer@saasphase1.invalid", "LibraryUiViewer-2026!"],
} as const;

const tracked = {
  organizationTemplateIds: new Set<string>(),
  importCommandIds: new Set<string>(),
  templateCommandIds: new Set<string>(),
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function sqlUuidArray(values: Iterable<string>) {
  const entries = Array.from(values);
  return entries.length === 0
    ? "array[]::uuid[]"
    : `array[${entries.map((entry) => `${q(entry)}::uuid`).join(",")}]`;
}

function testLibraryCodesSql() {
  return [...importedProductCodes, temporaryTemplateCode].map(q).join(",");
}

function trackCreatedRows() {
  const rows = JSON.parse(
    sql(`
      select coalesce(json_agg(row_data), '[]'::json)::text
      from (
        select template.id::text as template_id,
               import_command.id::text as import_command_id,
               template_command.id::text as template_command_id
        from public.litter_care_task_templates template
        left join public.litter_care_task_library_import_commands import_command
          on exists (
            select 1 from jsonb_array_elements(import_command.result) item(value)
            where item.value ->> 'templateId' = template.id::text
          )
        left join public.litter_care_task_template_commands template_command
          on template_command.template_id = template.id
        where template.organization_id = ${q(organizationId)}::uuid
          and template.library_template_code in (${testLibraryCodesSql()})
          and template.created_by in (
            ${q(ownerId)}::uuid,
            ${q(ids.adminUser)}::uuid
          )
      ) row_data;
    `),
  ) as Array<{
    template_id: string;
    import_command_id: string | null;
    template_command_id: string | null;
  }>;

  for (const row of rows) {
    tracked.organizationTemplateIds.add(row.template_id);
    if (row.import_command_id) tracked.importCommandIds.add(row.import_command_id);
    if (row.template_command_id) tracked.templateCommandIds.add(row.template_command_id);
  }
}

function cleanup() {
  trackCreatedRows();
  sql(`
    delete from public.litter_care_tasks
    where organization_template_id = any(${sqlUuidArray(tracked.organizationTemplateIds)});

    delete from public.litter_care_task_template_commands
    where id = any(${sqlUuidArray(tracked.templateCommandIds)})
       or template_id = any(${sqlUuidArray(tracked.organizationTemplateIds)});

    delete from public.litter_care_task_library_import_commands
    where id = any(${sqlUuidArray(tracked.importCommandIds)})
       or (
         organization_id = ${q(organizationId)}::uuid
         and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
         and exists (
           select 1 from jsonb_array_elements(selection) item(value)
           where item.value ->> 'code' in (${testLibraryCodesSql()})
         )
       );

    delete from public.litter_care_task_templates
    where id = any(${sqlUuidArray(tracked.organizationTemplateIds)})
       or (
         organization_id = ${q(organizationId)}::uuid
         and library_template_code in (${testLibraryCodesSql()})
         and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
       );

    delete from public.litter_care_task_library_templates
    where code = ${q(temporaryTemplateCode)};
    delete from public.litter_care_task_library_packs
    where code = ${q(temporaryPackCode)};

    delete from public.memberships where id::text like '9f190010-%';
    delete from auth.identities where user_id::text like '9f190010-%';
    delete from auth.users where id::text like '9f190010-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'import_commands', (
          select count(*) from public.litter_care_task_library_import_commands
          where id = any(${sqlUuidArray(tracked.importCommandIds)})
             or (
               organization_id = ${q(organizationId)}::uuid
               and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
               and exists (
                 select 1 from jsonb_array_elements(selection) item(value)
                 where item.value ->> 'code' in (${testLibraryCodesSql()})
               )
             )
        ),
        'template_commands', (
          select count(*) from public.litter_care_task_template_commands
          where id = any(${sqlUuidArray(tracked.templateCommandIds)})
             or template_id = any(${sqlUuidArray(tracked.organizationTemplateIds)})
        ),
        'organization_templates', (
          select count(*) from public.litter_care_task_templates
          where id = any(${sqlUuidArray(tracked.organizationTemplateIds)})
             or (
               organization_id = ${q(organizationId)}::uuid
               and library_template_code in (${testLibraryCodesSql()})
               and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
             )
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where organization_template_id = any(${sqlUuidArray(tracked.organizationTemplateIds)})
        ),
        'temporary_library_templates', (
          select count(*) from public.litter_care_task_library_templates
          where code = ${q(temporaryTemplateCode)}
        ),
        'temporary_library_packs', (
          select count(*) from public.litter_care_task_library_packs
          where code = ${q(temporaryPackCode)}
        ),
        'memberships', (select count(*) from public.memberships where id::text like '9f190010-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f190010-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190010-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190010-%')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
  expect(
    Number(sql("select count(*) from public.litter_care_task_library_packs;")),
  ).toBe(3);
  expect(
    Number(sql("select count(*) from public.litter_care_task_library_templates;")),
  ).toBe(15);
}

function operationalCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litter_care_tasks', (select count(*) from public.litter_care_tasks),
        'events', (select count(*) from public.events),
        'maternal_observations', (select count(*) from public.maternal_observations),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments),
        'email_delivery_attempts', (select count(*) from public.email_delivery_attempts),
        'reservations', (select count(*) from public.reservations),
        'applications', (select count(*) from public.applications),
        'contacts', (select count(*) from public.contacts),
        'notifications_relation', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'notifications'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createRoleFixtures() {
  const users = [
    [ids.adminUser, ids.adminIdentity, ...credentials.admin, "Admin bibliothèque UI E2E"],
    [ids.memberUser, ids.memberIdentity, ...credentials.member, "Member bibliothèque UI E2E"],
    [ids.viewerUser, ids.viewerIdentity, ...credentials.viewer, "Viewer bibliothèque UI E2E"],
  ] as const;

  sql(`
    ${users
      .map(
        ([userId, identityId, email, password, displayName]) => `
          insert into auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, confirmation_token, recovery_token,
            email_change_token_new, email_change, phone_change,
            phone_change_token, email_change_token_current, reauthentication_token,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
          ) values (
            ${q(userId)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
            'authenticated', 'authenticated', ${q(email)},
            extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(),
            '', '', '', '', '', '', '', '',
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('display_name', ${q(displayName)}), now(), now()
          );

          insert into auth.identities (
            id, provider_id, user_id, identity_data, provider, created_at, updated_at
          ) values (
            ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
            jsonb_build_object(
              'sub', ${q(userId)}, 'email', ${q(email)},
              'email_verified', true, 'phone_verified', false
            ), 'email', now(), now()
          );
        `,
      )
      .join("\n")}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminUser)}::uuid,
       'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid,
       'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid,
       'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function login(
  page: Page,
  email = E2E_OWNER_EMAIL,
  password = E2E_OWNER_PASSWORD,
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function library(page: Page) {
  return page.locator("section[aria-labelledby='recommended-library-heading']");
}

function libraryCard(page: Page, code: string, version: number) {
  return library(page).locator(`[data-library-template='${code}:${version}']`);
}

function myModels(page: Page) {
  return page.locator("section[aria-labelledby='organization-templates-heading']");
}

function myTemplateCard(page: Page, title: string) {
  return myModels(page).getByRole("listitem").filter({ hasText: title });
}

async function selectLibraryTemplate(page: Page, title: string, version = 1) {
  await page
    .getByRole("checkbox", { name: `Sélectionner ${title}, version ${version}` })
    .check();
}

function importCommandCount() {
  return Number(sql(`
    select count(*)
    from public.litter_care_task_library_import_commands
    where organization_id = ${q(organizationId)}::uuid
      and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
      and exists (
        select 1 from jsonb_array_elements(selection) item(value)
        where item.value ->> 'code' in (${testLibraryCodesSql()})
      );
  `));
}

function organizationTemplateCount() {
  return Number(sql(`
    select count(*) from public.litter_care_task_templates
    where organization_id = ${q(organizationId)}::uuid
      and library_template_code in (${testLibraryCodesSql()})
      and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid);
  `));
}

async function confirmImport(page: Page, doubleClick = false) {
  await page.getByRole("button", { name: "Vérifier l’import" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const button = dialog.getByRole("button", {
    name: "Importer les modèles sélectionnés",
  });
  if (doubleClick) await button.dblclick();
  else await button.click();
  await expect(dialog).toBeHidden();
}

test("consulte et importe explicitement la bibliothèque recommandée", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();
  const operationalBefore = operationalCounts();

  try {
    createRoleFixtures();
    await login(page);
    await page.goto("/settings/litter-care-task-templates");

    await expect(page.getByText(
      "Créez vos propres jalons ou importez des modèles recommandés, puis choisissez explicitement ceux à générer depuis le Journal des portées.",
    )).toBeVisible();
    await expect(page.getByText(
      "Importer, activer ou modifier un modèle ne crée et ne modifie aucune tâche existante.",
    )).toBeVisible();

    const libraryHeading = page.getByRole("heading", { name: "Bibliothèque recommandée" });
    const myModelsHeading = page.getByRole("heading", { name: "Mes modèles" });
    await expect(libraryHeading).toBeVisible();
    await expect(myModelsHeading).toBeVisible();
    expect(
      await libraryHeading.evaluate(
        (first, second) =>
          Boolean(
            first.compareDocumentPosition(second as Node) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        await myModelsHeading.elementHandle(),
      ),
    ).toBe(true);

    expect(
      await library(page).locator("[data-library-pack]").evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-library-pack")),
      ),
    ).toEqual([
      "dog-gestation-preparation",
      "dog-birth-first-days",
      "dog-growth-departure",
    ]);
    expect(
      await library(page).locator("[data-library-pack] > h3").allTextContents(),
    ).toEqual([
      "Gestation et préparation",
      "Naissance et premiers jours",
      "Croissance et préparation des départs",
    ]);
    const cards = library(page).locator("[data-library-template]");
    await expect(cards).toHaveCount(15);
    await expect(library(page).getByText("Disponible", { exact: true })).toHaveCount(15);
    for (const card of await cards.all()) {
      expect(await card.locator("dt").allTextContents()).toEqual([
        "Catégorie",
        "Cible",
        "Repère chronologique",
        "Décalage",
        "Espèce",
        "Race",
        "Version disponible",
      ]);
      await expect(card.getByText("1", { exact: true })).toBeVisible();
      await expect(card.locator("h4")).not.toHaveText("");
      await expect(card.locator("p").last()).not.toHaveText("");
    }

    const checkboxes = library(page).getByRole("checkbox");
    await expect(checkboxes).toHaveCount(15);
    expect(await checkboxes.evaluateAll((inputs) => inputs.every((input) => !(input as HTMLInputElement).checked))).toBe(true);
    await expect(library(page).getByText("0 sélectionné", { exact: true })).toBeVisible();
    await library(page).getByRole("button", { name: "Tout sélectionner" }).click();
    expect(await checkboxes.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).checked))).toBe(true);
    await expect(library(page).getByText("15 sélectionnés", { exact: true })).toBeVisible();
    await library(page).getByRole("button", { name: "Tout désélectionner" }).click();
    expect(await checkboxes.evaluateAll((inputs) => inputs.every((input) => !(input as HTMLInputElement).checked))).toBe(true);

    const ownerTitles = ["Confirmer la gestation", "Compléter la synthèse de mise-bas"];
    for (const title of ownerTitles) await selectLibraryTemplate(page, title);
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2 modèles seront importés comme modèles actifs.");
    await expect(dialog).toContainText("Gestation et préparation");
    await expect(dialog).toContainText("Naissance et premiers jours");
    for (const title of ownerTitles) await expect(dialog).toContainText(`${title} · version 1`);
    await expect(dialog).toContainText(
      "L’import créera des copies indépendantes dans « Mes modèles ». Il ne créera aucune tâche et une future mise à jour de la bibliothèque ne modifiera pas ces copies.",
    );
    const modelsBeforeCancel = organizationTemplateCount();
    const commandsBeforeCancel = importCommandCount();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect(organizationTemplateCount()).toBe(modelsBeforeCancel);
    expect(importCommandCount()).toBe(commandsBeforeCancel);

    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Importer les modèles sélectionnés" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect.poll(organizationTemplateCount).toBe(2);
    expect(importCommandCount()).toBe(1);
    await expect(library(page).getByText("0 sélectionné", { exact: true })).toBeVisible();
    await expect(library(page).getByRole("status")).toHaveText("2 modèles importés.");

    for (const [code, title] of [
      ["dog-confirm-pregnancy", ownerTitles[0]],
      ["dog-complete-birth-summary", ownerTitles[1]],
    ] as const) {
      await expect(libraryCard(page, code, 1)).toContainText("Importé · actif");
      await expect(libraryCard(page, code, 1).getByRole("checkbox")).toHaveCount(0);
      const copy = myTemplateCard(page, title);
      await expect(copy).toBeVisible();
      await expect(copy).toContainText("Importé depuis la bibliothèque · version 1");
      await expect(copy.getByRole("button", { name: "Modifier" })).toBeVisible();
      await expect(copy.getByRole("button", { name: "Désactiver" })).toBeVisible();
    }

    await login(page, ...credentials.admin);
    await page.goto("/settings/litter-care-task-templates");
    const adminTitle = "Ouvrir la checklist de socialisation";
    await selectLibraryTemplate(page, adminTitle);
    await library(page)
      .getByRole("radio", { name: "Importer comme modèles inactifs" })
      .check();
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 modèle sera importé comme modèle inactif.");
    await expect(dialog).toContainText("Croissance et préparation des départs");
    await expect(dialog).toContainText(`${adminTitle} · version 1`);
    await dialog.getByRole("button", { name: "Importer les modèles sélectionnés" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(organizationTemplateCount).toBe(3);
    await expect(libraryCard(page, "dog-open-socialization-checklist", 1)).toContainText(
      "Importé · inactif",
    );
    const inactiveCopy = myTemplateCard(page, adminTitle);
    await expect(inactiveCopy).toContainText("Inactif");
    await expect(inactiveCopy).toContainText("Importé depuis la bibliothèque · version 1");
    await inactiveCopy.getByRole("button", { name: "Modifier" }).click();
    dialog = page.getByRole("dialog");
    const editedAdminTitle = "Checklist de socialisation adaptée E2E";
    await dialog.getByLabel("Titre").fill(editedAdminTitle);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(myTemplateCard(page, editedAdminTitle)).toContainText(
      "Importé depuis la bibliothèque · version 1",
    );

    for (const roleCredentials of [credentials.member, credentials.viewer]) {
      await login(page, ...roleCredentials);
      await page.goto("/settings/litter-care-task-templates");
      await expect(library(page).locator("[data-library-pack]")).toHaveCount(3);
      await expect(library(page).locator("[data-library-template]")).toHaveCount(15);
      await expect(library(page).locator("input, button, form")).toHaveCount(0);
      await expect(library(page).locator("input[type='hidden']")).toHaveCount(0);
    }

    await login(page);
    sql(`
      insert into public.litter_care_task_library_packs (
        code, title, description, species, sort_order, is_available
      ) values (
        ${q(temporaryPackCode)}, 'Pack versionné UI E2E',
        'Pack strictement temporaire pour la vérification E2E.',
        'dog', 900, true
      );
      insert into public.litter_care_task_library_templates (
        code, version, pack_code, title, description, category, target_scope,
        anchor_type, offset_days, species, breed, sort_order, is_available
      ) values (
        ${q(temporaryTemplateCode)}, 1, ${q(temporaryPackCode)},
        'Modèle versionné UI E2E v1', 'Version temporaire 1.',
        'preparation', 'litter', 'actual_birth', 2,
        'dog', 'Golden Retriever', 900, true
      );
    `);
    await page.goto("/settings/litter-care-task-templates");
    await selectLibraryTemplate(page, "Modèle versionné UI E2E v1");
    await confirmImport(page);
    await expect.poll(organizationTemplateCount).toBe(4);
    const versionOneSnapshot = JSON.parse(sql(`
      select row_to_json(snapshot)::text from (
        select id::text, title, description, is_active, revision,
               library_template_code, library_template_version
        from public.litter_care_task_templates
        where organization_id = ${q(organizationId)}::uuid
          and library_template_code = ${q(temporaryTemplateCode)}
          and library_template_version = 1
      ) snapshot;
    `)) as Record<string, unknown>;

    sql(`
      update public.litter_care_task_library_templates
      set is_available = false
      where code = ${q(temporaryTemplateCode)} and version = 1;
      insert into public.litter_care_task_library_templates (
        code, version, pack_code, title, description, category, target_scope,
        anchor_type, offset_days, species, breed, sort_order, is_available
      ) values (
        ${q(temporaryTemplateCode)}, 2, ${q(temporaryPackCode)},
        'Modèle versionné UI E2E v2', 'Version temporaire 2 distincte.',
        'veterinary', 'organization', 'expected_birth', -4,
        'dog', null, 901, true
      );
    `);
    await page.reload();
    const versionTwoCard = libraryCard(page, temporaryTemplateCode, 2);
    await expect(versionTwoCard).toContainText("Nouvelle version disponible");
    await expect(versionTwoCard).toContainText("Dernière version importée : 1");
    await expect(
      versionTwoCard.getByRole("checkbox", {
        name: "Sélectionner Modèle versionné UI E2E v2, version 2",
      }),
    ).toBeVisible();
    await selectLibraryTemplate(page, "Modèle versionné UI E2E v2", 2);
    await confirmImport(page);
    await expect.poll(organizationTemplateCount).toBe(5);
    expect(JSON.parse(sql(`
      select row_to_json(snapshot)::text from (
        select id::text, title, description, is_active, revision,
               library_template_code, library_template_version
        from public.litter_care_task_templates
        where organization_id = ${q(organizationId)}::uuid
          and library_template_code = ${q(temporaryTemplateCode)}
          and library_template_version = 1
      ) snapshot;
    `))).toEqual(versionOneSnapshot);
    const versionCopies = JSON.parse(sql(`
      select coalesce(json_agg(json_build_object(
        'id', id, 'title', title, 'version', library_template_version
      ) order by library_template_version), '[]'::json)::text
      from public.litter_care_task_templates
      where organization_id = ${q(organizationId)}::uuid
        and library_template_code = ${q(temporaryTemplateCode)};
    `)) as Array<{ id: string; title: string; version: number }>;
    expect(versionCopies).toHaveLength(2);
    expect(versionCopies[0].id).not.toBe(versionCopies[1].id);
    expect(versionCopies.map((copy) => copy.version)).toEqual([1, 2]);
    await expect(versionTwoCard).toContainText("Importé · actif");
    await expect(myModels(page).getByText("Importé depuis la bibliothèque · version 1", { exact: true })).toHaveCount(4);
    await expect(myModels(page).getByText("Importé depuis la bibliothèque · version 2", { exact: true })).toHaveCount(1);

    expect(operationalCounts()).toEqual(operationalBefore);
    trackCreatedRows();
    console.info(
      `E2E library UI organization template IDs: ${Array.from(tracked.organizationTemplateIds).join(", ")}`,
    );
    console.info(
      `E2E library UI import command IDs: ${Array.from(tracked.importCommandIds).join(", ")}`,
    );
    console.info(
      `E2E library UI template command IDs: ${Array.from(tracked.templateCommandIds).join(", ")}`,
    );
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});

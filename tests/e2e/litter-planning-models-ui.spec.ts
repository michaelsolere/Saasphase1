import { expect, test, type Page } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(300_000);

const prefix = "c7270001-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E planning models UI c7270001";

const ids = {
  organization: `${prefix}01`,
  ownerUser: `${prefix}02`,
  ownerIdentity: `${prefix}03`,
  ownerMembership: `${prefix}04`,
  memberUser: `${prefix}05`,
  memberIdentity: `${prefix}06`,
  memberMembership: `${prefix}07`,
  viewerUser: `${prefix}08`,
  viewerIdentity: `${prefix}09`,
  viewerMembership: `${prefix}10`,
  foreignOrganization: `${prefix}11`,
  foreignUser: `${prefix}12`,
  foreignIdentity: `${prefix}13`,
  foreignMembership: `${prefix}14`,
  foreignModel: `${prefix}15`,
  foreignTemplate: `${prefix}16`,
} as const;

const credentials = {
  owner: [
    "planning-models-ui-owner@saasphase1.invalid",
    "PlanningModelsUiOwner-2026!",
  ],
  member: [
    "planning-models-ui-member@saasphase1.invalid",
    "PlanningModelsUiMember-2026!",
  ],
  viewer: [
    "planning-models-ui-viewer@saasphase1.invalid",
    "PlanningModelsUiViewer-2026!",
  ],
  foreign: [
    "planning-models-ui-foreign@saasphase1.invalid",
    "PlanningModelsUiForeign-2026!",
  ],
} as const;

const importedLibraryCodes = [
  "dog-gestation-standard",
  "dog-gestation-herpesvirose",
] as const;

const tracked = {
  modelIds: new Set<string>(),
  templateIds: new Set<string>(),
  importCommandIds: new Set<string>(),
  modelCommandIds: new Set<string>(),
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

function authUserSql(
  userId: string,
  identityId: string,
  email: string,
  password: string,
  displayName: string,
) {
  return `
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
  `;
}

function trackCreatedRows() {
  const rows = JSON.parse(
    sql(`
      select coalesce(json_agg(row_data), '[]'::json)::text
      from (
        select
          model.id::text as model_id,
          template.id::text as template_id,
          import_command.id::text as import_command_id,
          model_command.id::text as model_command_id
        from public.litter_planning_models model
        left join public.litter_care_task_templates template
          on template.organization_id = model.organization_id
         and template.library_template_code is not null
        left join public.litter_planning_model_library_import_commands import_command
          on import_command.organization_id = model.organization_id
        left join public.litter_planning_model_commands model_command
          on model_command.model_id = model.id
        where model.organization_id = ${q(ids.organization)}::uuid
           or model.id = ${q(ids.foreignModel)}::uuid
      ) row_data;
    `),
  ) as Array<{
    model_id: string | null;
    template_id: string | null;
    import_command_id: string | null;
    model_command_id: string | null;
  }>;

  for (const row of rows) {
    if (row.model_id) tracked.modelIds.add(row.model_id);
    if (row.template_id) tracked.templateIds.add(row.template_id);
    if (row.import_command_id) tracked.importCommandIds.add(row.import_command_id);
    if (row.model_command_id) tracked.modelCommandIds.add(row.model_command_id);
  }
}

function cleanup() {
  trackCreatedRows();
  sql(`
    delete from public.litter_planning_model_commands
    where id = any(${sqlUuidArray(tracked.modelCommandIds)})
       or model_id = any(${sqlUuidArray(tracked.modelIds)})
       or organization_id in (
         ${q(ids.organization)}::uuid,
         ${q(ids.foreignOrganization)}::uuid
       );

    delete from public.litter_planning_model_item_time_slots
    where organization_id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    );

    delete from public.litter_planning_model_items
    where organization_id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    )
       or model_id = any(${sqlUuidArray(tracked.modelIds)});

    delete from public.litter_planning_model_library_import_commands
    where id = any(${sqlUuidArray(tracked.importCommandIds)})
       or organization_id = ${q(ids.organization)}::uuid;

    delete from public.litter_planning_models
    where id = any(${sqlUuidArray(tracked.modelIds)})
       or organization_id in (
         ${q(ids.organization)}::uuid,
         ${q(ids.foreignOrganization)}::uuid
       );

    delete from public.litter_care_task_template_commands
    where organization_id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    )
       or template_id = any(${sqlUuidArray(tracked.templateIds)});

    delete from public.litter_care_task_templates
    where id = any(${sqlUuidArray(tracked.templateIds)})
       or organization_id in (
         ${q(ids.organization)}::uuid,
         ${q(ids.foreignOrganization)}::uuid
       )
       or id = ${q(ids.foreignTemplate)}::uuid;

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
    where id::text like 'c7270001-%'
       or organization_id in (
         ${q(ids.organization)}::uuid,
         ${q(ids.foreignOrganization)}::uuid
       );
    alter table public.memberships enable trigger memberships_protect_owner;

    delete from public.profiles where id::text like 'c7270001-%';
    delete from auth.identities where user_id::text like 'c7270001-%';
    delete from auth.users where id::text like 'c7270001-%';
    delete from public.organizations
    where id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    );
  `);

  tracked.modelIds.clear();
  tracked.templateIds.clear();
  tracked.importCommandIds.clear();
  tracked.modelCommandIds.clear();
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'import_commands', (
          select count(*) from public.litter_planning_model_library_import_commands
          where organization_id = ${q(ids.organization)}::uuid
             or id = any(${sqlUuidArray(tracked.importCommandIds)})
        ),
        'model_commands', (
          select count(*) from public.litter_planning_model_commands
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
             or id = any(${sqlUuidArray(tracked.modelCommandIds)})
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
             or id = any(${sqlUuidArray(tracked.modelIds)})
        ),
        'model_items', (
          select count(*) from public.litter_planning_model_items
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
             or id = any(${sqlUuidArray(tracked.templateIds)})
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like 'c7270001-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like 'c7270001-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like 'c7270001-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like 'c7270001-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function operationalCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litters', (
          select count(*) from public.litters
          where organization_id = ${q(ids.organization)}::uuid
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'litter_plans', (
          select count(*) from public.litter_plans
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'litter_plan_items', (
          select count(*) from public.litter_plan_items
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'litter_plan_series', (
          select count(*) from public.litter_plan_series
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'litter_care_tasks', (
          select count(*) from public.litter_care_tasks
          where organization_id = ${q(ids.organization)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values
      (
        ${q(ids.organization)}::uuid,
        ${q(`${fixtureNamePrefix} organisation`)},
        'e2e-planning-models-ui-c7270001'
      ),
      (
        ${q(ids.foreignOrganization)}::uuid,
        ${q(`${fixtureNamePrefix} foreign`)},
        'e2e-planning-models-ui-foreign-c7270001'
      );

    ${authUserSql(
      ids.ownerUser,
      ids.ownerIdentity,
      ...credentials.owner,
      "Owner planning models UI E2E",
    )}
    ${authUserSql(
      ids.memberUser,
      ids.memberIdentity,
      ...credentials.member,
      "Member planning models UI E2E",
    )}
    ${authUserSql(
      ids.viewerUser,
      ids.viewerIdentity,
      ...credentials.viewer,
      "Viewer planning models UI E2E",
    )}
    ${authUserSql(
      ids.foreignUser,
      ids.foreignIdentity,
      ...credentials.foreign,
      "Foreign planning models UI E2E",
    )}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (
        ${q(ids.ownerMembership)}::uuid, ${q(ids.organization)}::uuid,
        ${q(ids.ownerUser)}::uuid, 'owner', 'active',
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.memberMembership)}::uuid, ${q(ids.organization)}::uuid,
        ${q(ids.memberUser)}::uuid, 'member', 'active',
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.viewerMembership)}::uuid, ${q(ids.organization)}::uuid,
        ${q(ids.viewerUser)}::uuid, 'viewer', 'active',
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        ${q(ids.foreignUser)}::uuid, 'owner', 'active',
        ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid
      );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type,
      offset_days, species, breed, sort_order, revision, created_by, updated_by
    ) values (
      ${q(ids.foreignTemplate)}::uuid, ${q(ids.foreignOrganization)}::uuid,
      ${q(`${fixtureNamePrefix} foreign template`)}, 'other', 'litter',
      'expected_birth', 0, 'dog', null, 0, 1,
      ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid
    );

    insert into public.litter_planning_models (
      id, organization_id, title, description, species, breed, is_active,
      revision, created_by, updated_by
    ) values (
      ${q(ids.foreignModel)}::uuid, ${q(ids.foreignOrganization)}::uuid,
      ${q(`${fixtureNamePrefix} foreign model`)}, 'Foreign only',
      'dog', null, true, 1,
      ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid
    );
  `);
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function library(page: Page) {
  return page.locator(
    "section[aria-labelledby='recommended-planning-library-heading']",
  );
}

function myModels(page: Page) {
  return page.locator(
    "section[aria-labelledby='organization-planning-models-heading']",
  );
}

function libraryCard(page: Page, code: string, version = 1) {
  return library(page).locator(`[data-library-model='${code}:${version}']`);
}

function organizationModelCount() {
  return Number(
    sql(`
      select count(*) from public.litter_planning_models
      where organization_id = ${q(ids.organization)}::uuid
        and library_model_code in (${importedLibraryCodes.map(q).join(",")});
    `),
  );
}

function importedModelId(code: string) {
  return sql(`
    select id::text from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
      and library_model_code = ${q(code)}
      and library_model_version = 1
    limit 1;
  `).trim();
}

test("administre la bibliothèque des modèles de planning", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  createFixtures();
  const operationalBefore = operationalCounts();

  try {
    await login(page, ...credentials.owner);
    await page.goto("/settings/litter-planning-models");

    await expect(
      page.getByRole("heading", {
        name: "Modèles de planning des portées",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Importez des modèles recommandés et choisissez les modèles disponibles pour les prochaines portées.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Importer, activer ou désactiver un modèle ne modifie aucun planning déjà créé pour une portée.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Les jalons de suivi sont les éléments réutilisables. Les modèles de planning assemblent plusieurs jalons, tâches, périodes et suivis.",
      ),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Bibliothèque recommandée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Mes modèles" }),
    ).toBeVisible();
    await expect(myModels(page)).toContainText(
      "Aucun modèle n’est encore disponible dans votre organisation.",
    );

    await expect(libraryCard(page, "dog-gestation-standard")).toContainText(
      "Gestation",
    );
    await expect(libraryCard(page, "dog-gestation-standard")).toContainText(
      "Non importé",
    );
    await expect(libraryCard(page, "dog-gestation-herpesvirose")).toContainText(
      "Gestation + herpèsvirose",
    );
    await expect(libraryCard(page, "dog-gestation-standard")).not.toContainText(
      "family_code",
    );
    await expect(libraryCard(page, "dog-gestation-standard")).toContainText(
      "Variante standard",
    );

    const checkboxes = library(page).getByRole("checkbox", {
      name: /Sélectionner /,
    });
    await expect(checkboxes).toHaveCount(2);
    expect(
      await checkboxes.evaluateAll((inputs) =>
        inputs.every((input) => !(input as HTMLInputElement).checked),
      ),
    ).toBe(true);
    await expect(
      library(page).getByText("0 sélectionné", { exact: true }),
    ).toBeVisible();
    await expect(
      library(page).getByLabel("Activer les modèles importés"),
    ).toBeChecked();

    await libraryCard(page, "dog-gestation-standard")
      .getByRole("button", { name: "Voir le détail des éléments" })
      .click();
    const libraryDialog = page.getByRole("dialog");
    await expect(libraryDialog).toBeVisible();
    await expect(libraryDialog).toContainText("Gestation · version 1");
    await expect(libraryDialog).toContainText("Période");
    await expect(libraryDialog.getByText(/Fenêtre du 54e au 57e jour/)).toBeVisible();
    await libraryDialog.getByRole("button", { name: "Fermer" }).click();
    await expect(libraryDialog).toBeHidden();

    await page
      .getByRole("checkbox", {
        name: "Sélectionner Gestation, version 1",
      })
      .check();
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    let importDialog = page.getByRole("dialog");
    await expect(importDialog).toBeVisible();
    await expect(importDialog).toContainText(
      "Importer, activer ou désactiver un modèle ne modifie aucun planning déjà créé pour une portée.",
    );
    await importDialog
      .getByRole("button", { name: "Importer les modèles sélectionnés" })
      .click();
    await expect(importDialog).toBeHidden();
    await expect.poll(organizationModelCount).toBe(1);
    await expect(
      page.getByText(/modèle importé/i).first(),
    ).toBeVisible();

    await expect(myModels(page)).toContainText("Gestation");
    await expect(myModels(page)).toContainText("Actif");
    await expect(myModels(page)).toContainText(
      "Importé depuis la bibliothèque",
    );
    await expect(libraryCard(page, "dog-gestation-standard")).toContainText(
      "Déjà importé",
    );
    await expect(
      libraryCard(page, "dog-gestation-standard").getByRole("checkbox"),
    ).toHaveCount(0);

    const modelId = importedModelId("dog-gestation-standard");
    expect(modelId).toMatch(/^c7270001-|^[0-9a-f-]{36}$/i);
    tracked.modelIds.add(modelId);

    await page
      .getByRole("checkbox", {
        name: "Sélectionner Gestation, version 1",
      })
      .waitFor({ state: "detached" })
      .catch(() => undefined);
    await page
      .getByRole("checkbox", {
        name: "Sélectionner Gestation + herpèsvirose, version 1",
      })
      .check();
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    importDialog = page.getByRole("dialog");
    await importDialog
      .getByRole("button", { name: "Importer les modèles sélectionnés" })
      .dblclick();
    await expect(importDialog).toBeHidden();
    await expect.poll(organizationModelCount).toBe(2);

    // Idempotent already-imported state: standard remains unique.
    expect(organizationModelCount()).toBe(2);
    const standardCount = Number(
      sql(`
        select count(*) from public.litter_planning_models
        where organization_id = ${q(ids.organization)}::uuid
          and library_model_code = 'dog-gestation-standard'
          and library_model_version = 1;
      `),
    );
    expect(standardCount).toBe(1);

    await myModels(page)
      .locator(`[data-organization-model='${modelId}']`)
      .getByRole("link", { name: "Ouvrir la fiche" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/settings/litter-planning-models/${modelId}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Éléments du modèle" }),
    ).toBeVisible();
    await expect(page.getByText("Échographie de gestation").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Éléments du modèle" }),
    ).toBeVisible();
    await expect(page.getByText(/^[0-9a-f-]{36}$/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Désactiver" }).click();
    const deactivateDialog = page.getByRole("dialog");
    await expect(deactivateDialog).toContainText(
      "Importer, activer ou désactiver un modèle ne modifie aucun planning déjà créé pour une portée.",
    );
    await deactivateDialog.getByRole("button", { name: "Désactiver" }).click();
    await expect(deactivateDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Réactiver" })).toBeVisible();
    await expect(
      page.getByText("Inactif", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("button", { name: "Désactiver" })).toBeVisible();
    await expect(page.getByText("Actif", { exact: true }).first()).toBeVisible();

    await login(page, ...credentials.member);
    await page.goto("/settings/litter-planning-models");
    await expect(
      page.getByRole("heading", { name: "Bibliothèque recommandée" }),
    ).toBeVisible();
    await expect(
      library(page).getByRole("checkbox", { name: /Sélectionner / }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Votre rôle permet de consulter ces modèles, mais pas de les créer, dupliquer, importer ni activer ou désactiver.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Désactiver" })).toHaveCount(
      0,
    );

    await login(page, ...credentials.viewer);
    await page.goto("/settings/litter-planning-models");
    await expect(
      library(page).getByRole("checkbox", { name: /Sélectionner / }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Désactiver" })).toHaveCount(
      0,
    );

    await login(page, ...credentials.owner);
    const response = await page.goto(
      `/settings/litter-planning-models/${ids.foreignModel}`,
    );
    expect(response?.status()).toBe(404);

    expect(operationalCounts()).toEqual(operationalBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});

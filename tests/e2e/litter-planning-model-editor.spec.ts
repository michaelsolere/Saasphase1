import { expect, test, type Page } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(360_000);

const prefix = "d7270001-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E planning model editor d7270001";

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
  templateMilestone: `${prefix}17`,
  templateTask: `${prefix}18`,
  templateWindow: `${prefix}19`,
  templateRecurring: `${prefix}20`,
} as const;

const credentials = {
  owner: [
    "planning-model-editor-owner@saasphase1.invalid",
    "PlanningModelEditorOwner-2026!",
  ],
  member: [
    "planning-model-editor-member@saasphase1.invalid",
    "PlanningModelEditorMember-2026!",
  ],
  viewer: [
    "planning-model-editor-viewer@saasphase1.invalid",
    "PlanningModelEditorViewer-2026!",
  ],
  foreign: [
    "planning-model-editor-foreign@saasphase1.invalid",
    "PlanningModelEditorForeign-2026!",
  ],
} as const;

const tracked = {
  modelIds: new Set<string>(),
  templateIds: new Set<string>([
    ids.templateMilestone,
    ids.templateTask,
    ids.templateWindow,
    ids.templateRecurring,
    ids.foreignTemplate,
  ]),
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
        full join public.litter_care_task_templates template
          on template.organization_id = model.organization_id
        full join public.litter_planning_model_library_import_commands import_command
          on import_command.organization_id = coalesce(
            model.organization_id, template.organization_id
          )
        full join public.litter_planning_model_commands model_command
          on model_command.organization_id = coalesce(
            model.organization_id, template.organization_id
          )
        where coalesce(model.organization_id, template.organization_id) in (
          ${q(ids.organization)}::uuid,
          ${q(ids.foreignOrganization)}::uuid
        )
           or model.id = ${q(ids.foreignModel)}::uuid
           or template.id = any(${sqlUuidArray(tracked.templateIds)})
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
       );

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
    where id::text like 'd7270001-%'
       or organization_id in (
         ${q(ids.organization)}::uuid,
         ${q(ids.foreignOrganization)}::uuid
       );
    alter table public.memberships enable trigger memberships_protect_owner;

    delete from public.profiles where id::text like 'd7270001-%';
    delete from auth.identities where user_id::text like 'd7270001-%';
    delete from auth.users where id::text like 'd7270001-%';
    delete from public.organizations
    where id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    );
  `);

  tracked.modelIds.clear();
  tracked.templateIds = new Set([
    ids.templateMilestone,
    ids.templateTask,
    ids.templateWindow,
    ids.templateRecurring,
    ids.foreignTemplate,
  ]);
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
        'model_item_time_slots', (
          select count(*) from public.litter_planning_model_item_time_slots
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
        ),
        'template_commands', (
          select count(*) from public.litter_care_task_template_commands
          where organization_id in (
            ${q(ids.organization)}::uuid,
            ${q(ids.foreignOrganization)}::uuid
          )
             or template_id = any(${sqlUuidArray(tracked.templateIds)})
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
          select count(*) from public.memberships where id::text like 'd7270001-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like 'd7270001-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like 'd7270001-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like 'd7270001-%'
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
        'e2e-planning-model-editor-d7270001'
      ),
      (
        ${q(ids.foreignOrganization)}::uuid,
        ${q(`${fixtureNamePrefix} foreign`)},
        'e2e-planning-model-editor-foreign-d7270001'
      );

    ${authUserSql(
      ids.ownerUser,
      ids.ownerIdentity,
      ...credentials.owner,
      "Owner planning model editor E2E",
    )}
    ${authUserSql(
      ids.memberUser,
      ids.memberIdentity,
      ...credentials.member,
      "Member planning model editor E2E",
    )}
    ${authUserSql(
      ids.viewerUser,
      ids.viewerIdentity,
      ...credentials.viewer,
      "Viewer planning model editor E2E",
    )}
    ${authUserSql(
      ids.foreignUser,
      ids.foreignIdentity,
      ...credentials.foreign,
      "Foreign planning model editor E2E",
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
      offset_days, species, breed, sort_order, revision, is_active,
      created_by, updated_by
    ) values
      (
        ${q(ids.templateMilestone)}::uuid, ${q(ids.organization)}::uuid,
        ${q(`${fixtureNamePrefix} jalon`)}, 'veterinary', 'mother',
        'expected_birth', -5, 'dog', null, 0, 1, true,
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.templateTask)}::uuid, ${q(ids.organization)}::uuid,
        ${q(`${fixtureNamePrefix} tâche`)}, 'socialization', 'litter',
        'expected_birth', -2, 'dog', null, 1, 1, true,
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.templateWindow)}::uuid, ${q(ids.organization)}::uuid,
        ${q(`${fixtureNamePrefix} période`)}, 'reproduction', 'mother',
        'estimated_ovulation', 54, 'dog', null, 2, 1, true,
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.templateRecurring)}::uuid, ${q(ids.organization)}::uuid,
        ${q(`${fixtureNamePrefix} récurrent`)}, 'maternal_health', 'mother',
        'expected_birth', -5, 'dog', null, 3, 1, true,
        ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
      ),
      (
        ${q(ids.foreignTemplate)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        ${q(`${fixtureNamePrefix} foreign template`)}, 'other', 'litter',
        'expected_birth', 0, 'dog', null, 0, 1, true,
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
  tracked.modelIds.add(ids.foreignModel);
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function myModels(page: Page) {
  return page.locator(
    "section[aria-labelledby='organization-planning-models-heading']",
  );
}

function modelSnapshot(modelId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'title', model.title,
        'description', model.description,
        'species', model.species,
        'breed', model.breed,
        'is_active', model.is_active,
        'revision', model.revision,
        'library_model_code', model.library_model_code,
        'library_model_version', model.library_model_version,
        'items', (
          select coalesce(json_agg(item_row order by item_row.display_order), '[]'::json)
          from (
            select
              item.display_order,
              item.item_kind,
              item.organization_template_id::text as organization_template_id,
              item.priority,
              item.anchor_type,
              item.point_offset_days,
              item.point_local_time::text as point_local_time,
              item.window_starts_offset_days,
              item.window_ends_offset_days,
              item.recurrence_interval_days,
              item.recurrence_starts_offset_days,
              item.recurrence_end_kind,
              item.recurrence_day_count,
              item.initial_materialization_horizon_days,
              item.absolute_max_occurrences,
              item.is_required,
              item.is_selected_by_default,
              (
                select coalesce(json_agg(slot.local_time::text order by slot.slot_no), '[]'::json)
                from public.litter_planning_model_item_time_slots slot
                where slot.model_item_id = item.id
              ) as time_slots
            from public.litter_planning_model_items item
            where item.model_id = model.id
          ) item_row
        )
      )::text
      from public.litter_planning_models model
      where model.id = ${q(modelId)}::uuid;
    `),
  );
}

async function addEditorItem(
  page: Page,
  templateId: string,
  kind: "milestone" | "task" | "window" | "recurring_task",
) {
  await page.getByLabel("Jalon élémentaire").selectOption(templateId);
  await page
    .locator("section[aria-labelledby$='-add-heading']")
    .getByLabel("Type")
    .selectOption(kind);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
}

test("crée, active, modifie et duplique un modèle personnalisé", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();
  createFixtures();
  const operationalBefore = operationalCounts();

  try {
    await login(page, ...credentials.owner);
    await page.goto("/settings/litter-planning-models");
    await expect(
      page.getByRole("link", { name: "Créer un modèle personnalisé" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Créer un modèle personnalisé" }).click();
    await expect(page).toHaveURL(/\/settings\/litter-planning-models\/new$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("complementary").filter({
        hasText:
          "Modifier un modèle ne modifie aucun planning déjà créé pour une portée.",
      }),
    ).toBeVisible();

    await page.getByLabel("Titre").fill(`${fixtureNamePrefix} modèle custom`);
    await page.getByLabel("Description (facultative)").fill("Modèle éditeur E2E");
    await page.getByLabel("Espèce").selectOption("dog");

    const templateSelect = page.getByLabel("Jalon élémentaire");
    await expect(page.getByLabel("Rechercher un jalon")).toBeVisible();
    await expect(page.getByLabel("Catégorie")).toHaveValue("");
    await expect(page.getByLabel("Cible")).toHaveValue("");
    await expect(templateSelect.locator("option")).toHaveCount(5);
    await expect(
      page.getByRole("link", { name: /Créer ou modifier les jalons de suivi/ }),
    ).toHaveAttribute("target", "_blank");

    await page.getByLabel("Catégorie").selectOption("socialization");
    await expect(templateSelect.locator("option")).toHaveCount(2);
    await expect(templateSelect.locator("option").nth(1)).toContainText(
      "Socialisation",
    );
    await page.getByLabel("Cible").selectOption("litter");
    await expect(templateSelect.locator("option")).toHaveCount(2);
    await page.getByLabel("Rechercher un jalon").fill("aucun résultat");
    await expect(
      page.getByText("Aucun jalon ne correspond à ces critères."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Réinitialiser les critères" }).click();
    await expect(page.getByLabel("Catégorie")).toHaveValue("");
    await expect(page.getByLabel("Cible")).toHaveValue("");
    await expect(page.getByLabel("Rechercher un jalon")).toHaveValue("");
    await expect(templateSelect.locator("option")).toHaveCount(5);

    await addEditorItem(page, ids.templateMilestone, "milestone");
    await addEditorItem(page, ids.templateTask, "task");
    await addEditorItem(page, ids.templateWindow, "window");
    await addEditorItem(page, ids.templateRecurring, "recurring_task");

    const cards = page.locator("[data-editor-item]");
    await expect(cards).toHaveCount(4);

    const milestoneCard = cards.nth(0);
    await milestoneCard.getByLabel("Décalage en jours").fill("-5");
    await milestoneCard.getByLabel("Heure locale (facultative)").fill("09:00");
    await milestoneCard.getByLabel("Obligatoire").check();

    const taskCard = cards.nth(1);
    await taskCard.getByLabel("Décalage en jours").fill("-2");

    const windowCard = cards.nth(2);
    await windowCard.getByLabel("Décalage de début").fill("54");
    await windowCard.getByLabel("Décalage de fin").fill("57");

    const recurringCard = cards.nth(3);
    await recurringCard.getByLabel("Décalage de début").fill("-5");
    await recurringCard.getByLabel("Règle de fin").selectOption("fixed_recurrence_day_count");
    await recurringCard.getByLabel("Nombre de jours de suivi").fill("7");
    await recurringCard.getByLabel("Horizon initial de préparation").fill("7");
    await recurringCard.getByLabel("Plafond absolu d’occurrences").fill("30");
    await recurringCard.getByLabel("Créneau 1").fill("08:00");
    await recurringCard.getByRole("button", { name: "Ajouter un créneau" }).click();
    await recurringCard.getByLabel("Créneau 2").fill("20:00");

    await page.getByRole("button", { name: "Créer le modèle" }).click();
    await expect(page).toHaveURL(
      /\/settings\/litter-planning-models\/[0-9a-f-]{36}$/,
      { timeout: 60_000 },
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `${fixtureNamePrefix} modèle custom`,
      }),
    ).toBeVisible();

    const createdModelId = page.url().split("/").at(-1)!;
    tracked.modelIds.add(createdModelId);

    const created = modelSnapshot(createdModelId);
    expect(created.is_active).toBe(false);
    expect(created.revision).toBe(1);
    expect(created.library_model_code).toBeNull();
    expect(created.items).toHaveLength(4);
    expect(created.items.map((item: { item_kind: string }) => item.item_kind)).toEqual([
      "milestone",
      "task",
      "window",
      "recurring_task",
    ]);
    expect(created.items[0]).toMatchObject({
      point_offset_days: -5,
      point_local_time: "09:00:00",
      is_required: true,
      is_selected_by_default: true,
      display_order: 0,
    });
    expect(created.items[2]).toMatchObject({
      window_starts_offset_days: 54,
      window_ends_offset_days: 57,
      display_order: 2,
    });
    expect(created.items[3]).toMatchObject({
      recurrence_interval_days: 1,
      recurrence_starts_offset_days: -5,
      recurrence_day_count: 7,
      absolute_max_occurrences: 30,
      display_order: 3,
    });
    expect(created.items[3].time_slots).toEqual(["08:00:00", "20:00:00"]);

    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("button", { name: "Désactiver" })).toBeVisible();
    expect(modelSnapshot(createdModelId).is_active).toBe(true);
    expect(modelSnapshot(createdModelId).revision).toBe(2);

    await page.getByRole("link", { name: "Modifier" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/settings/litter-planning-models/${createdModelId}/edit$`),
    );

    await page.getByLabel("Titre").fill(`${fixtureNamePrefix} modèle custom v2`);
    const editCards = page.locator("[data-editor-item]");
    await editCards.nth(1).getByRole("button", { name: "Monter" }).click();
    await editCards.nth(2).getByLabel("Décalage de fin").fill("58");
    const recurringEdit = page.locator("[data-editor-item]").nth(3);
    await recurringEdit.getByLabel("Fréquence").selectOption("every_n_days");
    await recurringEdit.getByLabel("Intervalle en jours").fill("2");

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/settings/litter-planning-models/${createdModelId}$`),
      { timeout: 60_000 },
    );

    const replaced = modelSnapshot(createdModelId);
    expect(replaced.title).toBe(`${fixtureNamePrefix} modèle custom v2`);
    expect(replaced.revision).toBe(3);
    expect(replaced.is_active).toBe(true);
    expect(replaced.items.map((item: { item_kind: string }) => item.item_kind)).toEqual([
      "task",
      "milestone",
      "window",
      "recurring_task",
    ]);
    expect(replaced.items[2]).toMatchObject({
      item_kind: "window",
      window_ends_offset_days: 58,
    });
    expect(replaced.items[3]).toMatchObject({
      recurrence_interval_days: 2,
    });

    // Stale revision conflict: keep draft visible, no silent overwrite.
    await page.goto(`/settings/litter-planning-models/${createdModelId}/edit`);
    await page.getByLabel("Titre").fill(`${fixtureNamePrefix} conflit local`);
    sql(`
      update public.litter_planning_models
      set revision = revision + 1,
          title = ${q(`${fixtureNamePrefix} conflit distant`)}
      where id = ${q(createdModelId)}::uuid;
    `);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      page.locator('[role="alert"]').filter({ hasText: "modifié ailleurs" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Titre")).toHaveValue(
      `${fixtureNamePrefix} conflit local`,
    );
    expect(modelSnapshot(createdModelId).title).toBe(
      `${fixtureNamePrefix} conflit distant`,
    );
    expect(modelSnapshot(createdModelId).revision).toBe(4);

    // Import a library model, then duplicate it.
    await page.goto("/settings/litter-planning-models");
    await page
      .getByRole("checkbox", { name: "Sélectionner Gestation, version 1" })
      .check();
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    const importDialog = page.getByRole("dialog");
    await importDialog
      .getByRole("button", { name: "Importer les modèles sélectionnés" })
      .click();
    await expect(importDialog).toBeHidden();

    const importedId = sql(`
      select id::text from public.litter_planning_models
      where organization_id = ${q(ids.organization)}::uuid
        and library_model_code = 'dog-gestation-standard'
        and library_model_version = 1
      limit 1;
    `).trim();
    tracked.modelIds.add(importedId);
    const importedBefore = modelSnapshot(importedId);
    expect(importedBefore.library_model_code).toBe("dog-gestation-standard");

    const importedCard = myModels(page).locator(
      `[data-organization-model='${importedId}']`,
    );
    await expect(importedCard.getByRole("link", { name: "Modifier" })).toHaveCount(
      0,
    );
    await importedCard
      .getByRole("button", { name: "Créer une copie personnalisée" })
      .dblclick();
    await expect(page).toHaveURL(
      /\/settings\/litter-planning-models\/[0-9a-f-]{36}\/edit$/,
      { timeout: 60_000 },
    );
    const copyId = page.url().split("/").at(-2)!;
    tracked.modelIds.add(copyId);

    const copy = modelSnapshot(copyId);
    const importedAfter = modelSnapshot(importedId);
    expect(importedAfter).toEqual(importedBefore);
    expect(copy.library_model_code).toBeNull();
    expect(copy.library_model_version).toBeNull();
    expect(copy.is_active).toBe(false);
    expect(copy.title).toBe(`Copie de ${importedBefore.title}`);
    expect(copy.items).toHaveLength(importedBefore.items.length);
    expect(
      copy.items.map(
        (item: {
          item_kind: string;
          display_order: number;
          time_slots: string[];
        }) => ({
          item_kind: item.item_kind,
          display_order: item.display_order,
          time_slots: item.time_slots,
        }),
      ),
    ).toEqual(
      importedBefore.items.map(
        (item: {
          item_kind: string;
          display_order: number;
          time_slots: string[];
        }) => ({
          item_kind: item.item_kind,
          display_order: item.display_order,
          time_slots: item.time_slots,
        }),
      ),
    );

    const copyCount = Number(
      sql(`
        select count(*) from public.litter_planning_models
        where organization_id = ${q(ids.organization)}::uuid
          and title = ${q(`Copie de ${importedBefore.title}`)};
      `),
    );
    expect(copyCount).toBe(1);

    await login(page, ...credentials.member);
    await page.goto("/settings/litter-planning-models/new");
    await expect(page).toHaveURL(/\/settings\/litter-planning-models$/);
    await page.goto("/settings/litter-planning-models");
    await expect(
      page.getByRole("link", { name: "Créer un modèle personnalisé" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Créer une copie personnalisée" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);

    await login(page, ...credentials.viewer);
    await page.goto("/settings/litter-planning-models");
    await expect(
      page.getByRole("link", { name: "Créer un modèle personnalisé" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);

    await login(page, ...credentials.owner);
    const foreignResponse = await page.goto(
      `/settings/litter-planning-models/${ids.foreignModel}`,
    );
    expect(foreignResponse?.status()).toBe(404);
    const foreignEdit = await page.goto(
      `/settings/litter-planning-models/${ids.foreignModel}/edit`,
    );
    expect(foreignEdit?.status()).toBe(404);

    expect(operationalCounts()).toEqual(operationalBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f180010-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E jalons UI 9f180010";

const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  snapshotTask: `${prefix}03`,
  activeA: `${prefix}10`,
  activeB: `${prefix}11`,
  activeC: `${prefix}12`,
  activeD: `${prefix}13`,
  activeE: `${prefix}14`,
  inactive: `${prefix}15`,
  foreignTemplate: `${prefix}16`,
  otherOrganization: `${prefix}20`,
  adminUser: `${prefix}30`,
  adminIdentity: `${prefix}31`,
  adminMembership: `${prefix}32`,
  memberUser: `${prefix}33`,
  memberIdentity: `${prefix}34`,
  memberMembership: `${prefix}35`,
  viewerUser: `${prefix}36`,
  viewerIdentity: `${prefix}37`,
  viewerMembership: `${prefix}38`,
  inactiveUser: `${prefix}39`,
  inactiveIdentity: `${prefix}40`,
  inactiveMembership: `${prefix}41`,
} as const;

const credentials = {
  admin: ["templates-ui-admin@saasphase1.invalid", "TemplatesUiAdmin-2026!"],
  member: ["templates-ui-member@saasphase1.invalid", "TemplatesUiMember-2026!"],
  viewer: ["templates-ui-viewer@saasphase1.invalid", "TemplatesUiViewer-2026!"],
  inactive: [
    "templates-ui-inactive@saasphase1.invalid",
    "TemplatesUiInactive-2026!",
  ],
} as const;

const tracked = {
  templateIds: new Set<string>(),
  commandIds: new Set<string>(),
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function sqlArray(values: Iterable<string>) {
  const entries = Array.from(values);
  return entries.length === 0
    ? "array[]::uuid[]"
    : `array[${entries.map((value) => `${q(value)}::uuid`).join(",")}]`;
}

function trackFixtures() {
  const rows = JSON.parse(
    sql(`
      select coalesce(json_agg(row_data), '[]'::json)::text
      from (
        select template.id::text as template_id,
               command.client_command_id::text as command_id
        from public.litter_care_task_templates template
        left join public.litter_care_task_template_commands command
          on command.template_id = template.id
        where template.id::text like '9f180010-%'
           or template.title like ${q(`${fixtureNamePrefix}%`)}
      ) row_data;
    `),
  ) as Array<{ template_id: string; command_id: string | null }>;

  for (const row of rows) {
    tracked.templateIds.add(row.template_id);
    if (row.command_id) tracked.commandIds.add(row.command_id);
  }
}

function cleanup() {
  trackFixtures();
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner', status = 'active'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;

    delete from public.litter_care_tasks
    where id::text like '9f180010-%'
       or litter_id::text like '9f180010-%'
       or creation_command_id::text like '9f180010-%'
       or resolution_command_id::text like '9f180010-%'
       or title like ${q(`${fixtureNamePrefix}%`)};

    do $$
    declare
      v_template_ids uuid[];
    begin
      select pg_catalog.array_agg(id)
      into v_template_ids
      from public.litter_care_task_templates
      where id::text like '9f180010-%'
         or title like ${q(`${fixtureNamePrefix}%`)};

      delete from public.litter_care_task_template_commands
      where client_command_id::text like '9f180010-%'
         or id::text like '9f180010-%'
         or template_id = any(coalesce(v_template_ids, array[]::uuid[]));

      delete from public.litter_care_task_templates
      where id = any(coalesce(v_template_ids, array[]::uuid[]));
    end;
    $$;

    delete from public.litters
    where id::text like '9f180010-%'
       or name like ${q(`${fixtureNamePrefix}%`)};
    delete from public.animals where id::text like '9f180010-%';
    delete from public.memberships where id::text like '9f180010-%';
    delete from auth.identities where user_id::text like '9f180010-%';
    delete from auth.users where id::text like '9f180010-%';
    delete from public.organizations where id::text like '9f180010-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', (
          select count(*) from public.litter_care_task_template_commands
          where client_command_id = any(${sqlArray(tracked.commandIds)})
             or client_command_id::text like '9f180010-%'
             or id::text like '9f180010-%'
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id = any(${sqlArray(tracked.templateIds)})
             or id::text like '9f180010-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like '9f180010-%'
             or litter_id::text like '9f180010-%'
             or creation_command_id::text like '9f180010-%'
             or resolution_command_id::text like '9f180010-%'
             or title like ${q(`${fixtureNamePrefix}%`)}
        ),
        'litters', (
          select count(*) from public.litters
          where id::text like '9f180010-%'
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (select count(*) from public.animals where id::text like '9f180010-%'),
        'memberships', (select count(*) from public.memberships where id::text like '9f180010-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f180010-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f180010-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f180010-%'),
        'organizations', (select count(*) from public.organizations where id::text like '9f180010-%'),
        'temporary_functions', (
          select count(*) from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname like 'e2e_litter_care_task_templates_ui%'
        ),
        'owner_membership_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid
            and (role <> 'owner' or status <> 'active')
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
        'litter_care_tasks', (select count(*) from public.litter_care_tasks),
        'events', (select count(*) from public.events),
        'maternal_observations', (select count(*) from public.maternal_observations),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments),
        'animals', (select count(*) from public.animals)
      )::text;
    `),
  ) as Record<string, number>;
}

function createBaseFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1], "Admin jalons UI E2E"],
    [ids.memberUser, credentials.member[0], credentials.member[1], "Member jalons UI E2E"],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1], "Viewer jalons UI E2E"],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1], "Inactive jalons UI E2E"],
  ] as const;
  const identities = [
    [ids.adminIdentity, ids.adminUser, credentials.admin[0]],
    [ids.memberIdentity, ids.memberUser, credentials.member[0]],
    [ids.viewerIdentity, ids.viewerUser, credentials.viewer[0]],
    [ids.inactiveIdentity, ids.inactiveUser, credentials.inactive[0]],
  ] as const;

  sql(`
    insert into public.organizations (id, name, slug) values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation étrangère jalons UI E2E',
      'e2e-jalons-ui-etrangere'
    );

    ${authUsers.map(([id, email, password, displayName]) => `
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, phone_change,
        phone_change_token, email_change_token_current, reauthentication_token,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${q(id)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', ${q(email)},
        extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(displayName)}), now(), now()
      );
    `).join("\n")}

    ${identities.map(([id, userId, email]) => `
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(id)}::uuid, ${q(email)}, ${q(userId)}::uuid,
        jsonb_build_object(
          'sub', ${q(userId)}, 'email', ${q(email)},
          'email_verified', true, 'phone_verified', false
        ), 'email', now(), now()
      );
    `).join("\n")}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminUser)}::uuid,
       'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid,
       'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid,
       'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.inactiveUser)}::uuid,
       'member', 'disabled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

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
      actual_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} portée`)}, 'dog', 'Golden Retriever',
      ${q(ids.mother)}::uuid, 'born', '2026-07-18',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function createDisplayFixtures() {
  sql(`
    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order,
      created_by, updated_by
    ) values
      (${q(ids.activeA)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Alpha`)}, 'Snapshot initial.', 'offspring_weight', 'all_offspring',
       'actual_birth', -3, 'dog', 'Golden Retriever', true, 1,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.activeB)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Bêta`)}, null, 'preparation', 'litter',
       'expected_birth', 0, 'dog', null, true, 1,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.activeC)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Chronologie`)}, null, 'maternal_health', 'mother',
       'estimated_ovulation', 2, 'cat', 'Maine Coon', true, 2,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.activeD)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Naissance`)}, null, 'offspring_health', 'all_offspring',
       'offspring_age', 0, 'dog', null, true, 3,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.activeE)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Vie`)}, null, 'socialization', 'organization',
       'offspring_age', 5, 'cat', null, true, 4,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactive)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Inactif`)}, null, 'reproduction', 'mother',
       'first_mating', -10, 'cat', null, false, 0,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignTemplate)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} Étranger`)}, null, 'other', 'organization',
       'expected_birth', 0, 'dog', null, true, 0,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, organization_template_id,
      occurrence_no, category, target_scope, title, description,
      anchor_type, anchor_date, offset_days, planned_for, status,
      creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.snapshotTask)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.litter)}::uuid, 'organization_template', ${q(ids.activeA)}::uuid,
      1, 'offspring_weight', 'all_offspring', ${q(`${fixtureNamePrefix} Alpha`)},
      'Snapshot initial.', 'actual_birth', '2026-07-18', -3,
      '2026-07-15', 'planned', ${q(`${prefix}90`)}::uuid,
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

function templateCount(title?: string) {
  return Number(
    sql(`
      select count(*) from public.litter_care_task_templates
      where organization_id = ${q(organizationId)}::uuid
      ${title ? `and title = ${q(title)}` : ""};
    `),
  );
}

function templateRow(title: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', id, 'title', title, 'description', description,
        'category', category, 'target_scope', target_scope,
        'anchor_type', anchor_type, 'offset_days', offset_days,
        'species', species, 'breed', breed, 'sort_order', sort_order,
        'revision', revision, 'is_active', is_active
      )::text
      from public.litter_care_task_templates
      where organization_id = ${q(organizationId)}::uuid and title = ${q(title)}
      order by created_at desc limit 1;
    `),
  ) as Record<string, string | number | boolean | null>;
}

function commandIdsForTemplate(templateId: string) {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(client_command_id order by created_at), '[]'::json)::text
      from public.litter_care_task_template_commands
      where template_id = ${q(templateId)}::uuid;
    `),
  ) as string[];
}

function snapshotTask() {
  return JSON.parse(
    sql(`
      select row_to_json(snapshot)::text from (
        select title, description, category, target_scope, anchor_type,
               anchor_date::text, offset_days, planned_for::text, status,
               creation_command_id::text, updated_at::text
        from public.litter_care_tasks where id = ${q(ids.snapshotTask)}::uuid
      ) snapshot;
    `),
  ) as Record<string, string | number | null>;
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

function templateSection(page: Page, name: "Modèles actifs" | "Modèles inactifs") {
  return page.getByRole("heading", { name }).locator("xpath=ancestor::section[1]");
}

function templateCard(page: Page, title: string) {
  return page.locator("main li").filter({ hasText: title });
}

async function openCreateDialog(page: Page) {
  await page.getByRole("button", { name: "Créer un jalon" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openUpdateDialog(page: Page, title: string) {
  await templateCard(page, title).getByRole("button", { name: "Modifier" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillTemplateForm(
  dialog: Locator,
  values: {
    title?: string;
    description?: string;
    category?: string;
    targetScope?: string;
    anchorType?: string;
    offsetDays?: string;
    species?: string;
    breed?: string;
    sortOrder?: string;
  },
) {
  if (values.title !== undefined) await dialog.getByLabel("Titre").fill(values.title);
  if (values.description !== undefined) {
    await dialog.getByLabel("Description (facultative)").fill(values.description);
  }
  if (values.category) await dialog.getByLabel("Catégorie").selectOption(values.category);
  if (values.targetScope) await dialog.getByLabel("Cible").selectOption(values.targetScope);
  if (values.anchorType) {
    await dialog.getByLabel("Repère chronologique").selectOption(values.anchorType);
  }
  if (values.offsetDays !== undefined) {
    await dialog.getByLabel("Décalage en jours").fill(values.offsetDays);
  }
  if (values.species) await dialog.getByLabel("Espèce").selectOption(values.species);
  if (values.breed !== undefined) await dialog.getByLabel("Race (facultative)").fill(values.breed);
  if (values.sortOrder !== undefined) {
    await dialog.getByLabel("Ordre d’affichage").fill(values.sortOrder);
  }
}

test("gère les modèles de jalons sans générer ni modifier de tâche", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();

  try {
    createBaseFixtures();
    await login(page);
    await page.goto("/settings/litter-care-task-templates");

    const sidebar = page.getByTestId("main-sidebar");
    await expect(sidebar.getByRole("button", { name: "Paramètres" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(sidebar.getByRole("link", { name: "Organisation" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Jalons de portée" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { name: "Jalons de suivi des portées" })).toBeVisible();
    await expect(page.getByText("Aucun modèle de jalon n’a encore été créé.")).toBeVisible();
    await expect(page.getByText("Aucun modèle de jalon actif.")).toBeVisible();
    await expect(page.getByText("Aucun modèle de jalon inactif.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Paramètres de l’organisation" })).toHaveAttribute(
      "href",
      "/settings/organization",
    );

    createDisplayFixtures();
    const outOfScopeBefore = outOfScopeCounts();
    const snapshotBefore = snapshotTask();
    await page.reload();

    const activeSection = templateSection(page, "Modèles actifs");
    const inactiveSection = templateSection(page, "Modèles inactifs");
    const activeTitles = await activeSection.locator("li h3").allTextContents();
    expect(activeTitles).toEqual([
      `${fixtureNamePrefix} Alpha`,
      `${fixtureNamePrefix} Bêta`,
      `${fixtureNamePrefix} Chronologie`,
      `${fixtureNamePrefix} Naissance`,
      `${fixtureNamePrefix} Vie`,
    ]);
    expect(
      await activeSection.evaluate(
        (active, inactive) =>
          Boolean(
            active.compareDocumentPosition(inactive as Node) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        await inactiveSection.elementHandle(),
      ),
    ).toBe(true);
    await expect(inactiveSection).toContainText(`${fixtureNamePrefix} Inactif`);
    await expect(page.getByText(`${fixtureNamePrefix} Étranger`)).toHaveCount(0);

    for (const label of [
      "Première saillie",
      "Ovulation estimée",
      "Naissance prévue",
      "Naissance réelle",
      "Âge des petits",
      "3 jours avant",
      "Le jour même",
      "2 jours après",
      "À la naissance",
      "À 5 jours de vie",
      "Chien",
      "Chat",
      "Golden Retriever",
      "Toutes les races",
      "Préparation",
      "Santé de la mère",
      "Poids des petits",
      "Santé des petits",
      "Socialisation",
      "Reproduction",
      "Mère",
      "Portée",
      "Tous les petits",
      "Élevage",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const bodyText = await page.locator("body").innerText();
    for (const technicalId of Object.values(ids)) expect(bodyText).not.toContain(technicalId);
    expect(bodyText).not.toMatch(/\brévision\b/i);
    expect(bodyText).not.toMatch(/client_command|created_by|updated_by/i);

    let dialog = await openCreateDialog(page);
    await expect(dialog.getByLabel("Titre")).toHaveValue("");
    await expect(dialog.getByLabel("Description (facultative)")).toHaveValue("");
    await expect(dialog.getByLabel("Catégorie")).toHaveValue("preparation");
    await expect(dialog.getByLabel("Cible")).toHaveValue("litter");
    await expect(dialog.getByLabel("Repère chronologique")).toHaveValue("expected_birth");
    await expect(dialog.getByLabel("Décalage en jours")).toHaveValue("0");
    await expect(dialog.getByLabel("Espèce")).toHaveValue("dog");
    await expect(dialog.getByLabel("Race (facultative)")).toHaveValue("");
    await expect(dialog.getByLabel("Ordre d’affichage")).toHaveValue("0");
    await expect(dialog.getByLabel("Titre")).toHaveAttribute("maxlength", "255");
    await expect(dialog.getByLabel("Description (facultative)")).toHaveAttribute("maxlength", "5000");
    await expect(dialog.getByLabel("Race (facultative)")).toHaveAttribute("maxlength", "255");
    expect(await dialog.getByLabel("Catégorie").locator("option").allTextContents()).toEqual([
      "Reproduction", "Santé de la mère", "Alimentation de la mère", "Préparation",
      "Poids des petits", "Santé des petits", "Alimentation des petits", "Socialisation",
      "Vétérinaire", "Identification", "Vaccination", "Autre",
    ]);
    expect(await dialog.getByLabel("Cible").locator("option").allTextContents()).toEqual([
      "Mère", "Portée", "Tous les petits", "Élevage",
    ]);
    expect(await dialog.getByLabel("Repère chronologique").locator("option").allTextContents()).toEqual([
      "Première saillie", "Ovulation estimée", "Naissance prévue", "Naissance réelle", "Âge des petits",
    ]);
    expect(await dialog.getByLabel("Espèce").locator("option").allTextContents()).toEqual([
      "Chien", "Chat",
    ]);
    await dialog.getByLabel("Repère chronologique").selectOption("offspring_age");
    await expect(dialog.getByLabel("Décalage en jours")).toHaveAttribute("min", "0");
    const countBeforeCancel = templateCount();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect(templateCount()).toBe(countBeforeCancel);

    dialog = await openCreateDialog(page);
    await expect(dialog.getByLabel("Repère chronologique")).toHaveValue("expected_birth");
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog.getByLabel("Titre")).toHaveJSProperty("validity.valid", false);
    await dialog.getByLabel("Titre").evaluate((element) => element.removeAttribute("maxlength"));
    await dialog.getByLabel("Titre").fill("x".repeat(256));
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Le titre est obligatoire et ne doit pas dépasser 255 caractères.",
    );
    await dialog.getByLabel("Titre").fill("Titre valide");
    await dialog
      .getByLabel("Description (facultative)")
      .evaluate((element) => element.removeAttribute("maxlength"));
    await dialog.getByLabel("Description (facultative)").fill("x".repeat(5_001));
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "La description ne doit pas dépasser 5 000 caractères.",
    );
    await dialog.getByLabel("Description (facultative)").fill("");
    await dialog
      .getByLabel("Race (facultative)")
      .evaluate((element) => element.removeAttribute("maxlength"));
    await dialog.getByLabel("Race (facultative)").fill("x".repeat(256));
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "La race ne doit pas dépasser 255 caractères.",
    );
    await dialog.getByRole("button", { name: "Annuler" }).click();

    const firstCreatedTitle = `${fixtureNamePrefix} Création complète`;
    dialog = await openCreateDialog(page);
    await fillTemplateForm(dialog, {
      title: `  ${firstCreatedTitle}  `,
      description: "  Description complète.  ",
      category: "veterinary",
      targetScope: "organization",
      anchorType: "offspring_age",
      offsetDays: "12",
      species: "cat",
      breed: "  Maine Coon  ",
      sortOrder: "-8",
    });
    const beforeDoubleCreate = templateCount(firstCreatedTitle);
    await dialog.getByRole("button", { name: "Créer le jalon" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateCount(firstCreatedTitle)).toBe(beforeDoubleCreate + 1);
    const firstCreated = templateRow(firstCreatedTitle);
    expect(firstCreated).toMatchObject({
      title: firstCreatedTitle,
      description: "Description complète.",
      category: "veterinary",
      target_scope: "organization",
      anchor_type: "offspring_age",
      offset_days: 12,
      species: "cat",
      breed: "Maine Coon",
      sort_order: -8,
      revision: 1,
      is_active: true,
    });
    expect(commandIdsForTemplate(String(firstCreated.id))).toHaveLength(1);

    const secondCreatedTitle = `${fixtureNamePrefix} Deuxième création`;
    dialog = await openCreateDialog(page);
    await fillTemplateForm(dialog, { title: secondCreatedTitle });
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateCount(secondCreatedTitle)).toBe(1);
    const secondCreated = templateRow(secondCreatedTitle);
    expect(secondCreated.id).not.toBe(firstCreated.id);
    expect(commandIdsForTemplate(String(secondCreated.id))).toHaveLength(1);
    expect(commandIdsForTemplate(String(secondCreated.id))[0]).not.toBe(
      commandIdsForTemplate(String(firstCreated.id))[0],
    );

    const roleCreatedTitle = `${fixtureNamePrefix} Changement de rôle`;
    dialog = await openCreateDialog(page);
    await fillTemplateForm(dialog, {
      title: roleCreatedTitle,
      description: "Valeurs conservées après refus.",
    });
    setOwnerRole("viewer");
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Vous n’avez pas les droits nécessaires pour créer ce modèle.",
    );
    await expect(dialog.getByLabel("Titre")).toHaveValue(roleCreatedTitle);
    await expect(dialog.getByLabel("Description (facultative)")).toHaveValue(
      "Valeurs conservées après refus.",
    );
    expect(templateCount(roleCreatedTitle)).toBe(0);
    setOwnerRole("owner");
    await dialog.getByRole("button", { name: "Créer le jalon" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateCount(roleCreatedTitle)).toBe(1);
    expect(commandIdsForTemplate(String(templateRow(roleCreatedTitle).id))).toHaveLength(1);

    const alphaTitle = `${fixtureNamePrefix} Alpha`;
    dialog = await openUpdateDialog(page, alphaTitle);
    await expect(dialog.getByLabel("Titre")).toHaveValue(alphaTitle);
    await expect(dialog.getByLabel("Description (facultative)")).toHaveValue("Snapshot initial.");
    await expect(dialog.getByLabel("Catégorie")).toHaveValue("offspring_weight");
    await expect(dialog.getByLabel("Cible")).toHaveValue("all_offspring");
    await expect(dialog.getByLabel("Repère chronologique")).toHaveValue("actual_birth");
    await expect(dialog.getByLabel("Décalage en jours")).toHaveValue("-3");
    await expect(dialog.getByLabel("Espèce")).toHaveValue("dog");
    await expect(dialog.getByLabel("Race (facultative)")).toHaveValue("Golden Retriever");
    await expect(dialog.getByLabel("Ordre d’affichage")).toHaveValue("1");
    await dialog.getByLabel("Titre").fill("Valeur abandonnée");
    await dialog.getByRole("button", { name: "Annuler" }).click();
    dialog = await openUpdateDialog(page, alphaTitle);
    await expect(dialog.getByLabel("Titre")).toHaveValue(alphaTitle);

    const updatedTitle = `${fixtureNamePrefix} Alpha modifié`;
    await fillTemplateForm(dialog, {
      title: ` ${updatedTitle} `,
      description: " Nouvelle description. ",
      category: "identification",
      targetScope: "mother",
      anchorType: "first_mating",
      offsetDays: "-7",
      species: "cat",
      breed: " Chartreux ",
      sortOrder: "9",
    });
    await dialog.getByRole("button", { name: "Enregistrer" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateCount(updatedTitle)).toBe(1);
    const alpha = templateRow(updatedTitle);
    expect(alpha).toMatchObject({
      description: "Nouvelle description.",
      category: "identification",
      target_scope: "mother",
      anchor_type: "first_mating",
      offset_days: -7,
      species: "cat",
      breed: "Chartreux",
      sort_order: 9,
      revision: 2,
      is_active: true,
    });
    expect(commandIdsForTemplate(ids.activeA)).toHaveLength(1);
    expect(snapshotTask()).toEqual(snapshotBefore);

    dialog = await openUpdateDialog(page, updatedTitle);
    const staleAttemptTitle = `${fixtureNamePrefix} Valeur locale conservée`;
    await fillTemplateForm(dialog, {
      title: staleAttemptTitle,
      description: "Saisie locale après concurrence.",
    });
    sql(`
      update public.litter_care_task_templates
      set title = ${q(`${fixtureNamePrefix} Concurrent`)}, revision = revision + 1
      where id = ${q(ids.activeA)}::uuid;
    `);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Ce modèle a été modifié depuis l’ouverture du formulaire. Rechargez la page avant de recommencer.",
    );
    await expect(dialog.getByLabel("Titre")).toHaveValue(staleAttemptTitle);
    expect(templateCount(staleAttemptTitle)).toBe(0);
    expect(templateRow(`${fixtureNamePrefix} Concurrent`).revision).toBe(3);
    await page.reload();
    dialog = await openUpdateDialog(page, `${fixtureNamePrefix} Concurrent`);
    await fillTemplateForm(dialog, { title: staleAttemptTitle });
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateRow(staleAttemptTitle).revision).toBe(4);
    expect(snapshotTask()).toEqual(snapshotBefore);

    let card = templateCard(page, staleAttemptTitle);
    await card.getByRole("button", { name: "Désactiver" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Cette action ne crée et ne modifie aucune tâche.");
    await dialog.getByRole("button", { name: "Désactiver" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateRow(staleAttemptTitle).is_active).toBe(false);
    expect(templateRow(staleAttemptTitle).revision).toBe(5);
    await expect(templateSection(page, "Modèles inactifs")).toContainText(staleAttemptTitle);

    card = templateCard(page, staleAttemptTitle);
    await card.getByRole("button", { name: "Réactiver" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Réactiver" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => templateRow(staleAttemptTitle).is_active).toBe(true);
    expect(templateRow(staleAttemptTitle).revision).toBe(6);

    card = templateCard(page, staleAttemptTitle);
    await card.getByRole("button", { name: "Désactiver" }).click();
    dialog = page.getByRole("dialog");
    sql(`
      update public.litter_care_task_templates
      set revision = revision + 1
      where id = ${q(ids.activeA)}::uuid;
    `);
    await dialog.getByRole("button", { name: "Désactiver" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Ce modèle a été modifié depuis l’ouverture du formulaire. Rechargez la page avant de recommencer.",
    );
    expect(templateRow(staleAttemptTitle)).toMatchObject({ revision: 7, is_active: true });
    await page.reload();
    card = templateCard(page, staleAttemptTitle);
    await card.getByRole("button", { name: "Désactiver" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Désactiver" }).click();
    await expect.poll(() => templateRow(staleAttemptTitle).is_active).toBe(false);
    expect(templateRow(staleAttemptTitle).revision).toBe(8);
    expect(commandIdsForTemplate(ids.activeA)).toHaveLength(5);
    expect(snapshotTask()).toEqual(snapshotBefore);

    await login(page, ...credentials.member);
    await page.goto("/settings/litter-care-task-templates");
    await expect(page.getByText(staleAttemptTitle)).toBeVisible();
    await expect(page.getByText(`${fixtureNamePrefix} Bêta`)).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer un jalon|Modifier|Désactiver|Réactiver/ })).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await login(page, ...credentials.viewer);
    await page.goto("/settings/litter-care-task-templates");
    await expect(page.getByText(staleAttemptTitle)).toBeVisible();
    await expect(page.getByText(`${fixtureNamePrefix} Bêta`)).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer un jalon|Modifier|Désactiver|Réactiver/ })).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);

    await login(page, ...credentials.admin);
    await page.goto("/settings/litter-care-task-templates");
    await expect(page.getByRole("button", { name: "Créer un jalon" })).toBeVisible();

    await login(page, ...credentials.inactive);
    await page.goto("/settings/litter-care-task-templates");
    await expect(
      page.getByText("Les modèles de jalons ne sont pas disponibles pour le moment."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer un jalon" })).toHaveCount(0);

    await login(page);
    await page.goto(`/settings/litter-care-task-templates?organization=${ids.otherOrganization}`);
    await expect(page.getByText(staleAttemptTitle)).toBeVisible();
    await expect(page.getByText(`${fixtureNamePrefix} Étranger`)).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 760 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole("button", { name: /Supprimer|Dupliquer/ })).toHaveCount(0);
    await expect(page.getByText(/génère encore aucune tâche/)).toBeVisible();

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
    expect(snapshotTask()).toEqual(snapshotBefore);
    trackFixtures();
    console.info(
      `E2E litter care template IDs: ${Array.from(tracked.templateIds).join(", ")}`,
    );
    console.info(
      `E2E litter care template command IDs: ${Array.from(tracked.commandIds).join(", ")}`,
    );
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});

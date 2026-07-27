import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(600_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "e7270006-0000-4000-8000-0000000000";
const like = "e7270006-%";

const ids = {
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
  mother: `${prefix}15`,
  litter: `${prefix}16`,
  templateWindow: `${prefix}17`,
  model: `${prefix}18`,
  itemWindow: `${prefix}19`,
  applyCommand: `${prefix}20`,
  concurrentCommand: `${prefix}21`,
} as const;

const credentials = {
  member: ["adhoc-ui-member@saasphase1.invalid", "AdHocUiMember-2026!"],
  viewer: ["adhoc-ui-viewer@saasphase1.invalid", "AdHocUiViewer-2026!"],
  foreign: ["adhoc-ui-foreign@saasphase1.invalid", "AdHocUiForeign-2026!"],
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
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
    )
    on conflict (id) do update set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      updated_at = now();
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object('sub', ${q(userId)}, 'email', ${q(email)}, 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    )
    on conflict (id) do update set
      provider_id = excluded.provider_id,
      identity_data = excluded.identity_data,
      updated_at = now();
  `;
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = 'owner'
      where id = ${q(ownerMembershipId)}::uuid
        and organization_id = ${q(organizationId)}::uuid
        and profile_id = ${q(ownerId)}::uuid;
    delete from public.litter_plan_ad_hoc_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)} or task_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_materialization_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
      where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
      where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)});
    delete from public.litter_plan_series where litter_id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};
    delete from public.litter_planning_model_items where id::text like ${q(like)};
    delete from public.litter_planning_model_commands where client_command_id::text like ${q(like)};
    delete from public.litter_planning_models where id::text like ${q(like)};
    delete from public.litter_care_task_templates where id::text like ${q(like)};
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships where id::text like ${q(like)}
      or organization_id = ${q(ids.foreignOrganization)}::uuid;
    alter table public.memberships enable trigger memberships_protect_owner;
    delete from public.profiles where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.organizations where id = ${q(ids.foreignOrganization)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`select json_build_object(
      'ad_hoc_commands', (select count(*) from public.litter_plan_ad_hoc_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)}),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where litter_id::text like ${q(like)}),
      'application_commands', (select count(*) from public.litter_plan_application_commands where litter_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like ${q(like)}),
      'series_slots', (select count(*) from public.litter_plan_series_time_slots where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)})),
      'series', (select count(*) from public.litter_plan_series where litter_id::text like ${q(like)}),
      'plan_items', (select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where litter_id::text like ${q(like)}),
      'model_items', (select count(*) from public.litter_planning_model_items where id::text like ${q(like)}),
      'models', (select count(*) from public.litter_planning_models where id::text like ${q(like)}),
      'templates', (select count(*) from public.litter_care_task_templates where id::text like ${q(like)}),
      'litters', (select count(*) from public.litters where id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where id::text like ${q(like)}),
      'extra_memberships', (select count(*) from public.memberships where id::text like ${q(like)}),
      'extra_profiles', (select count(*) from public.profiles where id::text like ${q(like)}),
      'extra_auth_identities', (select count(*) from auth.identities where user_id::text like ${q(like)}),
      'extra_auth_users', (select count(*) from auth.users where id::text like ${q(like)}),
      'foreign_orgs', (select count(*) from public.organizations where id = ${q(ids.foreignOrganization)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

function expectCleanup() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrganization)}::uuid, 'E2E adhoc ui foreign e7270006', 'e2e-adhoc-ui-foreign-e7270006')
    on conflict (id) do nothing;

    ${authUserSql(ids.memberUser, ids.memberIdentity, ...credentials.member, "Member adhoc ui")}
    ${authUserSql(ids.viewerUser, ids.viewerIdentity, ...credentials.viewer, "Viewer adhoc ui")}
    ${authUserSql(ids.foreignUser, ids.foreignIdentity, ...credentials.foreign, "Foreign adhoc ui")}

    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by) values
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid, 'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid, 'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignUser)}::uuid, 'owner', 'active', ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid);

    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'E2E adhoc ui mère', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status, mating_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'E2E adhoc ui portée',
      'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', '2026-07-01',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days, species, revision, created_by, updated_by
    ) values (
      ${q(ids.templateWindow)}::uuid, ${q(organizationId)}::uuid, 'Fenêtre modèle adhoc ui',
      'maternal_health', 'mother', 'first_mating', 40, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_planning_models (id, organization_id, title, species, breed, revision, created_by, updated_by)
    values (${q(ids.model)}::uuid, ${q(organizationId)}::uuid, 'E2E adhoc ui modèle', 'dog', 'Golden Retriever', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind, priority,
      anchor_type, point_offset_days, window_starts_offset_days, window_ends_offset_days,
      display_order, is_required, is_selected_by_default, created_by, updated_by
    ) values (
      ${q(ids.itemWindow)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateWindow)}::uuid,
      'window', 'normal', 'first_mating', null, 40, 47, 0, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function counts() {
  return JSON.parse(
    sql(`select json_build_object(
      'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
      'revision', coalesce((select revision from public.litter_plans where litter_id = ${q(ids.litter)}::uuid and status = 'active'), 0),
      'items', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
      'adHocItems', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid and origin_kind = 'ad_hoc'),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid),
      'commands', (select count(*) from public.litter_plan_ad_hoc_commands where litter_id = ${q(ids.litter)}::uuid),
      'series', (select count(*) from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), {
    timeout: 45_000,
  });
}

async function gotoJournal(page: Page) {
  const url = `/litters/journal?litter=${ids.litter}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await expect(
        page.getByRole("heading", { name: "Planning de la portée", exact: true }),
      ).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(4_000);
    }
  }
  throw lastError;
}

async function openProgrammer(page: Page) {
  const trigger = page
    .getByRole("region", { name: "Planning de la portée", exact: true })
    .locator("[data-programmer-open]");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(
    page.getByRole("heading", { name: "Programmer un élément" }),
  ).toBeVisible({ timeout: 15_000 });
}

async function chooseKind(page: Page, label: string) {
  await page.getByRole("radio", { name: new RegExp(`^${label}\\.`) }).click();
}

test.beforeAll(() => {
  cleanup();
  createFixtures();
});

test.afterAll(() => {
  cleanup();
  expectCleanup();
});

test("LITTER-AD-HOC-PLANNING-UI-01 — programmer depuis la frise", async ({
  page,
}) => {
  await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  await gotoJournal(page);

  const timeline = page.getByRole("region", {
    name: "Planning de la portée",
    exact: true,
  });
  await expect(timeline.locator("[data-programmer-open]")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ajouter une tâche/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Les nouveaux éléments se programment depuis la frise."),
  ).toBeVisible();

  const beforePreview = counts();
  expect(beforePreview.plans).toBe(0);
  expect(beforePreview.commands).toBe(0);

  await openProgrammer(page);
  await chooseKind(page, "Jalon");
  await page.getByLabel("Titre", { exact: true }).fill("Jalon adhoc ui");
  await page.getByLabel("Date", { exact: true }).fill("2026-07-30");
  await expect(page.locator("[data-programmer-preview='true']")).toBeVisible();
  await expect(page.getByText("Aperçu — non enregistré").first()).toBeVisible();
  expect(counts().commands).toBe(0);
  expect(counts().plans).toBe(0);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator("[data-programmer-preview='true']")).toHaveCount(0);
  expect(counts().commands).toBe(0);
  expect(counts().plans).toBe(0);

  await openProgrammer(page);
  await chooseKind(page, "Jalon");
  await page.getByLabel("Titre", { exact: true }).fill("Jalon adhoc ui");
  await page.getByLabel("Date", { exact: true }).fill("2026-07-30");
  const submit = page.getByRole("button", { name: "Programmer", exact: true });
  await Promise.all([submit.click(), submit.click()]);
  await expect(page.getByText("Le jalon a été programmé.")).toBeVisible({
    timeout: 60_000,
  });
  await gotoJournal(page);

  let afterMilestone = counts();
  expect(afterMilestone.commands).toBe(1);
  expect(afterMilestone.plans).toBe(1);
  expect(afterMilestone.revision).toBe(1);
  expect(afterMilestone.adHocItems).toBe(1);
  expect(afterMilestone.tasks).toBe(1);
  await expect(page.getByText("Jalon adhoc ui").first()).toBeVisible();

  await openProgrammer(page);
  await chooseKind(page, "Période");
  await page.getByLabel("Titre", { exact: true }).fill("Période adhoc ui");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-10");
  await page.getByLabel("Date de fin", { exact: true }).fill("2026-08-17");
  await expect(page.getByText(/Du .* au .* · 8 jours/).first()).toBeVisible();
  await expect(page.locator("[data-programmer-preview='true']")).toBeVisible();
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText("La période a été programmée.")).toBeVisible({
    timeout: 60_000,
  });
  await gotoJournal(page);
  afterMilestone = counts();
  expect(afterMilestone.plans).toBe(1);
  expect(afterMilestone.revision).toBe(2);
  expect(afterMilestone.adHocItems).toBe(2);
  await expect(page.getByText("Période adhoc ui").first()).toBeVisible();

  await openProgrammer(page);
  await chooseKind(page, "Suivi récurrent");
  await page.getByLabel("Titre", { exact: true }).fill("Récurrence adhoc ui");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-01");
  await page.getByLabel("Tous les N jours").fill("1");
  await page.getByLabel("Nombre de dates de suivi").check();
  await page.getByLabel("Nombre de dates programmées").fill("5");
  await page.locator('input[aria-label="Créneau 1"]').fill("20:00");
  await page.getByRole("button", { name: "Ajouter un créneau" }).click();
  await page.locator('input[aria-label="Créneau 2"]').fill("08:00");
  await expect(page.getByText(/Créneaux : 08:00, 20:00/)).toBeVisible();
  await expect(page.getByText(/10 occurrences au total/).first()).toBeVisible();
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText(/Le suivi récurrent a été programmé/)).toBeVisible({
    timeout: 60_000,
  });
  await gotoJournal(page);
  const afterRecurring = counts();
  expect(afterRecurring.series).toBe(1);
  expect(afterRecurring.adHocItems).toBe(3);
  const slots = JSON.parse(
    sql(`select coalesce(json_agg(local_time::text order by slot_no), '[]')::text
      from public.litter_plan_series_time_slots
      where series_id = (select id from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid limit 1);`),
  ) as string[];
  expect(slots).toEqual(["08:00:00", "20:00:00"]);
  await expect(page.getByText("Récurrence adhoc ui").first()).toBeVisible();

  await openProgrammer(page);
  await chooseKind(page, "Période");
  await page.getByLabel("Titre", { exact: true }).fill("Fenêtre inversée");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-20");
  await page.getByLabel("Date de fin", { exact: true }).fill("2026-08-10");
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(
    page.getByText(/date de début doit être antérieure|bornes|Vérifiez/i).first(),
  ).toBeVisible();
  const beforeInvalid = counts().commands;

  await chooseKind(page, "Période");
  await page.getByLabel("Titre", { exact: true }).fill("Heures inversées");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-20");
  await page.getByLabel("Date de fin", { exact: true }).fill("2026-08-20");
  await page.getByLabel("Heure de début facultative").fill("18:00");
  await page.getByLabel("Heure de fin facultative").fill("08:00");
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText(/heure de début|Vérifiez|bornes/i).first()).toBeVisible();

  await chooseKind(page, "Suivi récurrent");
  await page.getByLabel("Titre", { exact: true }).fill("Doublons créneaux");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-01");
  await page.getByLabel("Nombre de dates programmées").fill("3");
  await page.locator('input[aria-label="Créneau 1"]').fill("08:00");
  await page.getByRole("button", { name: "Ajouter un créneau" }).click();
  await page.locator('input[aria-label="Créneau 2"]').fill("08:00");
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText(/doublons|créneau|Vérifiez/i).first()).toBeVisible();

  await page.getByLabel("Nombre de dates programmées").fill("100");
  for (let index = 0; index < 5; index += 1) {
    if ((await page.locator('input[aria-label^="Créneau "]').count()) < 6) {
      await page.getByRole("button", { name: "Ajouter un créneau" }).click();
    }
  }
  const slotInputs = page.locator('input[aria-label^="Créneau "]');
  const slotCount = await slotInputs.count();
  for (let index = 0; index < slotCount; index += 1) {
    const hour = String(8 + index).padStart(2, "0");
    await slotInputs.nth(index).fill(`${hour}:00`);
  }
  await expect(
    page.getByText(/dépasserait 500 occurrences|Trop d’occurrences/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Programmer", exact: true }),
  ).toBeDisabled();
  expect(counts().commands).toBe(beforeInvalid);
  await page.getByRole("button", { name: "Annuler" }).click();

  const revisionBeforeStale = counts().revision;
  await openProgrammer(page);
  await chooseKind(page, "Tâche");
  await page.getByLabel("Titre", { exact: true }).fill("Tâche stale");
  await page.getByLabel("Date", { exact: true }).fill("2026-09-01");

  const ownerClient = await createAuthenticatedSupabaseClient();
  const concurrent = await ownerClient.rpc("create_litter_plan_ad_hoc_item", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.concurrentCommand,
    p_expected_plan_revision: revisionBeforeStale,
    p_timezone_name: "Europe/Paris",
    p_item: {
      version: 1,
      kind: "task",
      title: "Concurrent adhoc",
      description: null,
      category: "preparation",
      targetScope: "litter",
      priority: "normal",
      lockSchedule: false,
      scheduledDate: "2026-09-02",
      localTime: null,
    },
  });
  expect(concurrent.error).toBeNull();
  expect(concurrent.data?.[0]?.outcome).toBe("success");

  const commandsBeforeStaleSubmit = counts().commands;
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(
    page.getByText(/planning a été modifié ailleurs/i),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Recharger le Journal" }),
  ).toBeVisible();
  expect(counts().commands).toBe(commandsBeforeStaleSubmit + 1);
  await expect(
    page.getByRole("button", { name: "Actualisation…" }),
  ).toBeDisabled();
  const commandsAfterNeutralized = counts().commands;
  await page.getByRole("button", { name: "Actualisation…" }).click({
    force: true,
  }).catch(() => undefined);
  expect(counts().commands).toBe(commandsAfterNeutralized);
  await page.getByRole("button", { name: "Recharger le Journal" }).click();
  await page.keyboard.press("Escape").catch(() => undefined);
  await gotoJournal(page);
  await expect(
    page
      .getByRole("region", { name: "Planning de la portée", exact: true })
      .locator("[data-programmer-open]"),
  ).toBeVisible();

  await openProgrammer(page);
  await chooseKind(page, "Tâche");
  await page.getByLabel("Titre", { exact: true }).fill("Tâche verrouillée ui");
  await page.getByLabel("Date", { exact: true }).fill("2026-09-10");
  await page.getByRole("checkbox", { name: /Verrouiller la programmation/ }).check();
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText("La tâche a été programmée.")).toBeVisible({
    timeout: 60_000,
  });
  await gotoJournal(page);
  const locked = JSON.parse(
    sql(`select json_build_object(
      'locked', is_schedule_locked,
      'title', title
    )::text from public.litter_care_tasks
    where litter_id = ${q(ids.litter)}::uuid and title = 'Tâche verrouillée ui';`),
  ) as { locked: boolean; title: string };
  expect(locked.locked).toBe(true);
  const lockedCard = page.locator("[data-timeline-item]").filter({
    hasText: "Tâche verrouillée ui",
  });
  await expect(lockedCard.getByText("Verrouillé", { exact: true })).toBeVisible();
  await expect(lockedCard.locator("[data-timeline-handle]")).toHaveCount(0);
  await expect(
    lockedCard.getByRole("button", { name: "Ajuster précisément" }),
  ).toBeVisible();

  await login(page, credentials.member[0], credentials.member[1]);
  await gotoJournal(page);
  await expect(page.locator("[data-programmer-open]")).toBeVisible();
  await openProgrammer(page);
  await chooseKind(page, "Jalon");
  await page.getByLabel("Titre", { exact: true }).fill("Jalon member ui");
  await page.getByLabel("Date", { exact: true }).fill("2026-09-15");
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(page.getByText("Le jalon a été programmé.")).toBeVisible({
    timeout: 60_000,
  });

  await login(page, credentials.viewer[0], credentials.viewer[1]);
  await gotoJournal(page);
  await expect(page.locator("[data-programmer-open]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ajouter une tâche/ })).toHaveCount(
    0,
  );

  await login(page, credentials.foreign[0], credentials.foreign[1]);
  await page.goto(`/litters/journal?litter=${ids.litter}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Planning de la portée", exact: true }),
  ).toHaveCount(0);

  await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  await gotoJournal(page);
  await expect(page.getByText("Jalon adhoc ui").first()).toBeVisible();
  await expect(page.getByText("Période adhoc ui").first()).toBeVisible();
  let calendarReady = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.goto(`/litters/journal/calendar?litter=${ids.litter}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await expect(
        page.getByText(/Jalon adhoc ui|Période adhoc ui|Tâche verrouillée ui/).first(),
      ).toBeVisible({ timeout: 60_000 });
      calendarReady = true;
      break;
    } catch {
      await page.waitForTimeout(4_000);
    }
  }
  expect(calendarReady).toBe(true);
});

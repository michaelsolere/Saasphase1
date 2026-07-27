import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(420_000);

const prefix = "e7270001-0000-4000-8000-0000000000";
const like = "e7270001-%";
const fixtureNamePrefix = "E2E apply UI e7270001";

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
  mother: `${prefix}15`,
  litter: `${prefix}16`,
  templateMilestone: `${prefix}17`,
  templateTask: `${prefix}18`,
  templateWindow: `${prefix}19`,
  templateRecurring: `${prefix}20`,
  templatePending: `${prefix}21`,
  modelPrimary: `${prefix}22`,
  modelSecond: `${prefix}23`,
  modelInactive: `${prefix}24`,
  modelIncompatible: `${prefix}25`,
  modelAuto: `${prefix}26`,
  itemMilestone: `${prefix}27`,
  itemTask: `${prefix}28`,
  itemWindow: `${prefix}29`,
  itemRecurring: `${prefix}30`,
  itemPending: `${prefix}31`,
  itemSecond: `${prefix}32`,
  itemInactive: `${prefix}33`,
  itemIncompatible: `${prefix}34`,
  itemAuto: `${prefix}35`,
  applyCommand1: `${prefix}40`,
  applyCommand1Replay: `${prefix}40`,
  applyCommand2: `${prefix}41`,
  applyCommandStalePlan: `${prefix}42`,
  applyCommandStaleModel: `${prefix}43`,
  applyCommandMember: `${prefix}44`,
  applyCommandAuto: `${prefix}45`,
  applyCommandDoubleA: `${prefix}46`,
  applyCommandDoubleB: `${prefix}47`,
} as const;

const credentials = {
  owner: [
    "planning-model-apply-owner@saasphase1.invalid",
    "PlanningModelApplyOwner-2026!",
  ],
  member: [
    "planning-model-apply-member@saasphase1.invalid",
    "PlanningModelApplyMember-2026!",
  ],
  viewer: [
    "planning-model-apply-viewer@saasphase1.invalid",
    "PlanningModelApplyViewer-2026!",
  ],
  foreign: [
    "planning-model-apply-foreign@saasphase1.invalid",
    "PlanningModelApplyForeign-2026!",
  ],
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

function cleanup() {
  sql(`
    set session_replication_role = replica;

    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)}
         or organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)}
         or organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.litter_plan_series_materialization_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
         or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series_state_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
         or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_anchor_recalculation_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
         or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}
         or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_care_tasks
      where litter_id::text like ${q(like)} or id::text like ${q(like)}
         or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series_time_slots
      where series_id in (
        select id from public.litter_plan_series
        where litter_id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid
      );
    delete from public.litter_plan_series
      where litter_id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_items
      where litter_id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plans
      where litter_id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid;

    delete from public.litter_planning_model_item_time_slots
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)
         or model_item_id::text like ${q(like)};
    delete from public.litter_planning_model_items
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)
         or id::text like ${q(like)};
    delete from public.litter_planning_model_commands
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)
         or client_command_id::text like ${q(like)};
    delete from public.litter_planning_models
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)
         or id::text like ${q(like)};

    delete from public.litter_care_task_template_commands
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.litter_care_task_templates
      where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)
         or id::text like ${q(like)};

    delete from public.litters where id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals where id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid;

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
      where id::text like ${q(like)}
         or organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    alter table public.memberships enable trigger memberships_protect_owner;

    delete from public.profiles where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.organizations
      where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);

    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'application_commands', (select count(*) from public.litter_plan_application_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
        'care_tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
        'series_slots', (select count(*) from public.litter_plan_series_time_slots where organization_id = ${q(ids.organization)}::uuid),
        'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
        'plan_items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
        'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
        'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
        'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
        'models', (select count(*) from public.litter_planning_models where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid) or id::text like ${q(like)}),
        'templates', (select count(*) from public.litter_care_task_templates where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid) or id::text like ${q(like)}),
        'litters', (select count(*) from public.litters where id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid),
        'animals', (select count(*) from public.animals where id::text like ${q(like)} or organization_id = ${q(ids.organization)}::uuid),
        'memberships', (select count(*) from public.memberships where id::text like ${q(like)}),
        'profiles', (select count(*) from public.profiles where id::text like ${q(like)}),
        'auth_identities', (select count(*) from auth.identities where user_id::text like ${q(like)}),
        'auth_users', (select count(*) from auth.users where id::text like ${q(like)}),
        'organizations', (select count(*) from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid))
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanup() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug) values
      (${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} organisation`)}, 'e2e-apply-ui-e7270001'),
      (${q(ids.foreignOrganization)}::uuid, ${q(`${fixtureNamePrefix} foreign`)}, 'e2e-apply-ui-foreign-e7270001');

    ${authUserSql(ids.ownerUser, ids.ownerIdentity, ...credentials.owner, "Owner apply UI")}
    ${authUserSql(ids.memberUser, ids.memberIdentity, ...credentials.member, "Member apply UI")}
    ${authUserSql(ids.viewerUser, ids.viewerIdentity, ...credentials.viewer, "Viewer apply UI")}
    ${authUserSql(ids.foreignUser, ids.foreignIdentity, ...credentials.foreign, "Foreign apply UI")}

    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by) values
      (${q(ids.ownerMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.ownerUser)}::uuid, 'owner', 'active', ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.memberUser)}::uuid, 'member', 'active', ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.viewerUser)}::uuid, 'viewer', 'active', ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignUser)}::uuid, 'owner', 'active', ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid);

    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} mère`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, estimated_ovulation_date, expected_birth_date, actual_birth_date,
      created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} portée`)},
      'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected',
      '2026-06-10', null, '2026-08-12', null,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, breed, sort_order, revision, is_active, created_by, updated_by
    ) values
      (${q(ids.templateMilestone)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} jalon`)}, 'preparation', 'litter', 'first_mating', 2, 'dog', null, 0, 1, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.templateTask)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} tâche`)}, 'veterinary', 'litter', 'first_mating', 5, 'dog', null, 1, 1, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.templateWindow)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} période`)}, 'reproduction', 'mother', 'first_mating', 3, 'dog', null, 2, 1, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.templateRecurring)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} récurrent`)}, 'maternal_health', 'mother', 'expected_birth', -5, 'dog', null, 3, 1, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.templatePending)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} pending`)}, 'offspring_health', 'all_offspring', 'actual_birth', 2, 'dog', null, 4, 1, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid);

    insert into public.litter_planning_models (
      id, organization_id, title, description, species, breed, is_active, revision, created_by, updated_by
    ) values
      (${q(ids.modelPrimary)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} modèle principal`)}, 'Modèle principal compatible', 'dog', 'Golden Retriever', true, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.modelSecond)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} modèle second`)}, 'Second modèle', 'dog', null, true, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.modelInactive)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} modèle inactif`)}, 'Inactif', 'dog', null, false, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.modelIncompatible)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} modèle incompatible`)}, 'Race incompatible', 'dog', 'Labrador', true, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.modelAuto)}::uuid, ${q(ids.organization)}::uuid, ${q(`${fixtureNamePrefix} modèle auto`)}, 'Auto appliqué', 'dog', null, true, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid);

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind, priority, anchor_type,
      point_offset_days, window_starts_offset_days, window_ends_offset_days,
      recurrence_kind, recurrence_interval_days, recurrence_starts_offset_days, recurrence_end_kind,
      initial_materialization_horizon_days, absolute_max_occurrences,
      display_order, is_required, is_selected_by_default, created_by, updated_by
    ) values
      (${q(ids.itemMilestone)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelPrimary)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'important', 'first_mating', 2, null, null, null, null, null, null, null, null, 0, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemTask)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelPrimary)}::uuid, ${q(ids.templateTask)}::uuid, 'task', 'normal', 'first_mating', 5, null, null, null, null, null, null, null, null, 1, false, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemWindow)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelPrimary)}::uuid, ${q(ids.templateWindow)}::uuid, 'window', 'normal', 'first_mating', null, 3, 6, null, null, null, null, null, null, 2, false, false, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemRecurring)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelPrimary)}::uuid, ${q(ids.templateRecurring)}::uuid, 'recurring_task', 'important', 'expected_birth', null, null, null, 'daily_interval', 1, -5, 'actual_birth', 3, 30, 3, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemPending)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelPrimary)}::uuid, ${q(ids.templatePending)}::uuid, 'task', 'normal', 'actual_birth', 2, null, null, null, null, null, null, null, null, 4, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemSecond)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelSecond)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 10, null, null, null, null, null, null, null, null, 0, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemInactive)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelInactive)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 1, null, null, null, null, null, null, null, null, 0, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemIncompatible)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelIncompatible)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 1, null, null, null, null, null, null, null, null, 0, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid),
      (${q(ids.itemAuto)}::uuid, ${q(ids.organization)}::uuid, ${q(ids.modelAuto)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 1, null, null, null, null, null, null, null, null, 0, true, true, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid);

    insert into public.litter_planning_model_item_time_slots (
      organization_id, model_item_id, slot_no, local_time, created_by
    ) values
      (${q(ids.organization)}::uuid, ${q(ids.itemRecurring)}::uuid, 1, '08:00', ${q(ids.ownerUser)}::uuid),
      (${q(ids.organization)}::uuid, ${q(ids.itemRecurring)}::uuid, 2, '20:00', ${q(ids.ownerUser)}::uuid);
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

async function clientFor(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  expect(
    (await client.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return client;
}

function applyPanel(page: Page) {
  return page.getByRole("region", {
    name: "Programmer le planning de la portée",
  });
}

function modelCard(page: Page, title: string) {
  return applyPanel(page).locator("li").filter({ hasText: title });
}

function countsAfterApply() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
        'planRevision', (select coalesce(max(revision), 0) from public.litter_plans where litter_id = ${q(ids.litter)}::uuid),
        'items', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid),
        'pending', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid and materialization_state = 'pending_anchor'),
        'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid),
        'series', (select count(*) from public.litter_plan_series where litter_id = ${q(ids.litter)}::uuid),
        'occurrences', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.litter)}::uuid and litter_plan_series_id is not null),
        'modelItemsPrimary', (select count(*) from public.litter_planning_model_items where model_id = ${q(ids.modelPrimary)}::uuid),
        'modelRevisionPrimary', (select revision from public.litter_planning_models where id = ${q(ids.modelPrimary)}::uuid),
        'orders', (
          select coalesce(json_agg(display_order order by display_order), '[]'::json)
          from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid
        ),
        'sources', (
          select coalesce(json_agg(source_planning_model_id::text order by display_order), '[]'::json)
          from public.litter_plan_items where litter_id = ${q(ids.litter)}::uuid
        ),
        'matingDate', (select mating_date::text from public.litters where id = ${q(ids.litter)}::uuid),
        'expectedBirth', (select expected_birth_date::text from public.litters where id = ${q(ids.litter)}::uuid),
        'actualBirth', (select actual_birth_date::text from public.litters where id = ${q(ids.litter)}::uuid)
      )::text;
    `),
  ) as Record<string, unknown>;
}

test.afterEach(() => {
  cleanup();
  expectCleanup();
});

test("LITTER-PLANNING-MODEL-APPLY-UI-01 — programmer une portée depuis un modèle", async ({
  page,
}) => {
  cleanup();
  expectCleanup();
  createFixtures();

  const beforeLoad = countsAfterApply();
  expect(beforeLoad.plans).toBe(0);
  expect(beforeLoad.items).toBe(0);
  expect(beforeLoad.tasks).toBe(0);

  await login(page, credentials.owner[0], credentials.owner[1]);
  await page.goto(`/litters/journal?litter=${ids.litter}`);

  const panel = applyPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(
    "Le modèle sera copié dans le planning de cette portée.",
  );
  await expect(panel).toContainText(
    "Aucun planning composé n’a encore été créé.",
  );
  await expect(panel).toContainText(`${fixtureNamePrefix} modèle principal`);
  await expect(panel).toContainText(`${fixtureNamePrefix} modèle second`);
  await expect(panel).not.toContainText(`${fixtureNamePrefix} modèle inactif`);
  await expect(panel).not.toContainText(
    `${fixtureNamePrefix} modèle incompatible`,
  );

  const afterLoad = countsAfterApply();
  expect(afterLoad).toEqual(beforeLoad);

  const primaryCard = modelCard(page, `${fixtureNamePrefix} modèle principal`);
  await primaryCard.getByRole("button", { name: "Consulter le contenu" }).click();
  await expect(primaryCard).toContainText("Jalon");
  await expect(primaryCard).toContainText("Tâche");
  await expect(primaryCard).toContainText("Période");
  await expect(primaryCard).toContainText("Suivi récurrent");
  await expect(primaryCard).toContainText("Prévu le");
  await expect(primaryCard).toContainText("Fenêtre du");
  await expect(primaryCard).toContainText("Début le");
  await expect(primaryCard).toContainText(
    "Sera ajouté en attente de la naissance réelle",
  );

  await primaryCard.getByRole("button", { name: "Appliquer ce modèle" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const requiredCheckbox = dialog.locator("input[type='checkbox']").nth(0);
  await expect(requiredCheckbox).toBeChecked();
  await expect(requiredCheckbox).toBeDisabled();

  const optionalDefault = dialog.locator("input[type='checkbox']").nth(1);
  await expect(optionalDefault).toBeChecked();
  await expect(optionalDefault).toBeEnabled();

  const optionalOff = dialog.locator("input[type='checkbox']").nth(2);
  await expect(optionalOff).not.toBeChecked();

  await dialog.getByRole("button", { name: "Continuer" }).click();
  await expect(dialog).toContainText(
    "Ce modèle ne pourra pas être appliqué une seconde fois",
  );
  await dialog.getByRole("button", { name: "Appliquer le modèle" }).click();
  await expect(panel).toContainText("éléments ajoutés");

  const afterFirst = countsAfterApply();
  expect(afterFirst.plans).toBe(1);
  expect(afterFirst.planRevision).toBe(1);
  expect(afterFirst.items).toBe(4);
  expect(afterFirst.pending).toBe(1);
  expect(afterFirst.series).toBe(1);
  expect(afterFirst.tasks).toBeGreaterThanOrEqual(3);
  expect(afterFirst.occurrences).toBeGreaterThanOrEqual(2);
  expect(afterFirst.orders).toEqual([0, 1, 2, 3]);
  expect(afterFirst.modelItemsPrimary).toBe(5);
  expect(afterFirst.modelRevisionPrimary).toBe(1);
  expect(afterFirst.matingDate).toBe("2026-06-10");
  expect(afterFirst.expectedBirth).toBe("2026-08-12");
  expect(afterFirst.actualBirth).toBeNull();

  const owner = await clientFor(credentials.owner[0], credentials.owner[1]);
  const already = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelPrimary,
    p_client_command_id: ids.applyCommandDoubleA,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 1,
    p_selected_model_item_ids: [
      ids.itemMilestone,
      ids.itemTask,
      ids.itemRecurring,
      ids.itemPending,
    ],
    p_timezone_name: "Europe/Paris",
  });
  expect(already.error).toBeNull();
  expect(already.data?.[0]?.reason).toBe("model_already_applied");
  expect(countsAfterApply().items).toBe(4);

  const doubleA = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelSecond,
    p_client_command_id: ids.applyCommandDoubleB,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 1,
    p_selected_model_item_ids: [ids.itemSecond],
    p_timezone_name: "Europe/Paris",
  });
  const doubleB = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelSecond,
    p_client_command_id: ids.applyCommandDoubleB,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 1,
    p_selected_model_item_ids: [ids.itemSecond],
    p_timezone_name: "Europe/Paris",
  });
  expect(doubleA.data?.[0]?.outcome).toBe("success");
  expect(doubleB.data?.[0]?.outcome).toBe("success");
  expect(doubleB.data?.[0]?.replayed).toBe(true);
  const afterSecond = countsAfterApply();
  expect(afterSecond.plans).toBe(1);
  expect(afterSecond.planRevision).toBe(2);
  expect(afterSecond.items).toBe(5);
  expect(afterSecond.orders).toEqual([0, 1, 2, 3, 4]);
  expect(afterSecond.sources).toEqual([
    ids.modelPrimary,
    ids.modelPrimary,
    ids.modelPrimary,
    ids.modelPrimary,
    ids.modelSecond,
  ]);

  const stalePlan = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelAuto,
    p_client_command_id: ids.applyCommandStalePlan,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 1,
    p_selected_model_item_ids: [ids.itemAuto],
    p_timezone_name: "Europe/Paris",
  });
  expect(stalePlan.data?.[0]?.reason).toBe("stale_plan");
  expect(countsAfterApply().items).toBe(5);

  sql(`
    update public.litter_planning_models
    set revision = 2, updated_by = ${q(ids.ownerUser)}::uuid
    where id = ${q(ids.modelAuto)}::uuid;
  `);
  const staleModel = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelAuto,
    p_client_command_id: ids.applyCommandStaleModel,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 2,
    p_selected_model_item_ids: [ids.itemAuto],
    p_timezone_name: "Europe/Paris",
  });
  expect(staleModel.data?.[0]?.reason).toBe("stale_model");
  expect(countsAfterApply().items).toBe(5);

  sql(`
    update public.litter_planning_models
    set revision = 1, updated_by = ${q(ids.ownerUser)}::uuid
    where id = ${q(ids.modelAuto)}::uuid;
  `);
  const autoApply = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelAuto,
    p_client_command_id: ids.applyCommandAuto,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 2,
    p_selected_model_item_ids: [ids.itemAuto],
    p_timezone_name: "Europe/Paris",
  });
  expect(autoApply.data?.[0]?.outcome).toBe("success");

  const memberModelId = `${prefix}50`;
  const memberItemId = `${prefix}51`;
  sql(`
    insert into public.litter_planning_models (
      id, organization_id, title, description, species, breed, is_active, revision, created_by, updated_by
    ) values (
      ${q(memberModelId)}::uuid, ${q(ids.organization)}::uuid,
      ${q(`${fixtureNamePrefix} modèle member`)}, 'Member apply',
      'dog', null, true, 1, ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );
    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind, priority, anchor_type,
      point_offset_days, display_order, is_required, is_selected_by_default, created_by, updated_by
    ) values (
      ${q(memberItemId)}::uuid, ${q(ids.organization)}::uuid, ${q(memberModelId)}::uuid,
      ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 12, 0, true, true,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );
  `);
  const member = await clientFor(credentials.member[0], credentials.member[1]);
  const memberApply = await member.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: memberModelId,
    p_client_command_id: ids.applyCommandMember,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 3,
    p_selected_model_item_ids: [memberItemId],
    p_timezone_name: "Europe/Paris",
  });
  expect(memberApply.error).toBeNull();
  expect(memberApply.data?.[0]?.outcome).toBe("success");

  const viewer = await clientFor(credentials.viewer[0], credentials.viewer[1]);
  const viewerApply = await viewer.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.modelInactive,
    p_client_command_id: `${prefix}52`,
    p_expected_model_revision: 1,
    p_expected_plan_revision: 4,
    p_selected_model_item_ids: [ids.itemInactive],
    p_timezone_name: "Europe/Paris",
  });
  expect(viewerApply.data?.[0]?.reason).toBe("membership_required");

  await page.reload();
  await expect(
    modelCard(page, `${fixtureNamePrefix} modèle principal`),
  ).toContainText("Déjà appliqué");
  await expect(
    modelCard(page, `${fixtureNamePrefix} modèle principal`).getByRole(
      "button",
      { name: "Appliquer ce modèle" },
    ),
  ).toHaveCount(0);
  await expect(
    modelCard(page, `${fixtureNamePrefix} modèle auto`),
  ).toContainText("Déjà appliqué");

  await login(page, credentials.viewer[0], credentials.viewer[1]);
  await page.goto(`/litters/journal?litter=${ids.litter}`);
  await expect(applyPanel(page)).toBeVisible();
  await expect(applyPanel(page)).toContainText(
    `${fixtureNamePrefix} modèle principal`,
  );
  await expect(
    applyPanel(page).getByRole("button", { name: "Appliquer ce modèle" }),
  ).toHaveCount(0);

  await login(page, credentials.foreign[0], credentials.foreign[1]);
  await page.goto(`/litters/journal?litter=${ids.litter}`);
  await expect(applyPanel(page)).toHaveCount(0);

  const finalDates = countsAfterApply();
  expect(finalDates.matingDate).toBe("2026-06-10");
  expect(finalDates.expectedBirth).toBe("2026-08-12");
  expect(finalDates.actualBirth).toBeNull();
});

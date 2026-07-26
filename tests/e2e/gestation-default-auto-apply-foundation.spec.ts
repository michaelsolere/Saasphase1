import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  GESTATION_LIBRARY_HERPESVIROSE_CODE,
  GESTATION_LIBRARY_STANDARD_CODE,
  GESTATION_LIBRARY_VERSION,
  gestationDefaultTitle,
} from "../../src/features/settings/gestation-default-planning";
import { setDefaultGestationPlanningModelCore } from "../../src/features/settings/gestation-default-planning-core";
import { recordReproductiveCycleMatingCore } from "../../src/features/reproduction/reproductive-cycles-core";
import { createReproductiveCycleCore } from "../../src/features/reproduction/reproductive-cycles-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
  type SupabaseTestClient,
} from "./helpers/supabase";

test.setTimeout(300_000);
test.describe.configure({ timeout: 300_000 });

const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f260006-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E gestation auto-apply 9f260006";
const otherFamilyLibraryVersion = 90;

const idKeys = [
  "tempOrg",
  "otherOrg",
  "adminUser",
  "adminIdentity",
  "adminMembership",
  "memberUser",
  "memberIdentity",
  "memberMembership",
  "viewerUser",
  "viewerIdentity",
  "viewerMembership",
  "inactiveUser",
  "inactiveIdentity",
  "inactiveMembership",
  "ownerMembership",
  "father",
  "motherNotConfigured",
  "motherStandard",
  "motherHerpes",
  "motherAlreadyApplied",
  "motherVariantConflict",
  "motherUnavailable",
  "motherInjectError",
  "litterAlreadyApplied",
  "litterVariantConflict",
  "cycleAlreadyApplied",
  "cycleVariantConflict",
  "fakeMatingAlreadyApplied",
  "fakeMatingVariantConflict",
  "commandAlreadyApplied",
  "commandVariantConflict",
  "commandConfigSetStandard",
  "commandConfigSetHerpes",
  "commandConfigRestoreStandardForL",
  "commandConfigRestoreHerpesForL2",
  "commandConfigRestoreStandardForM",
  "commandConfigReuseAndReactivate",
  "commandConfigClear",
  "commandConfigAdminAllowed",
  "commandConfigMemberRefused",
  "commandConfigViewerRefused",
  "commandConfigInactiveRefused",
  "commandConfigCrossOrg",
  "commandConfigOtherFamily",
  "commandMatingNotConfigured",
  "commandMatingStandardFirst",
  "commandMatingSecond",
  "commandMatingHerpesFirst",
  "commandMatingUnavailable",
  "commandMatingInjectError",
  "commandOldRpcAttempt",
  "commandConfigRestoreHerpesForVariantConflict",
  "commandConfigRestoreStandardForUnavailable",
  "foreignUser",
  "foreignIdentity",
  "foreignMembership",
  "fatherAlt",
  "motherForeignProbe",
  "motherHistorical",
  "litterHistorical",
  "cycleHistorical",
  "matingHistorical",
  "commandForeignNoCmd",
  "commandForeignReplaySource",
  "commandViewerMating",
  "commandHistorical",
] as const;

const ids = Object.fromEntries(
  idKeys.map((key, index) => [key, `${prefix}${String(index + 1).padStart(2, "0")}`]),
) as Record<(typeof idKeys)[number], string>;

const credentials = {
  admin: ["gestation-autoapply-admin@saasphase1.invalid", "GestationAutoApplyAdmin-2026!"],
  member: ["gestation-autoapply-member@saasphase1.invalid", "GestationAutoApplyMember-2026!"],
  viewer: ["gestation-autoapply-viewer@saasphase1.invalid", "GestationAutoApplyViewer-2026!"],
  inactive: ["gestation-autoapply-inactive@saasphase1.invalid", "GestationAutoApplyInactive-2026!"],
  foreign: ["gestation-autoapply-foreign@saasphase1.invalid", "GestationAutoApplyForeign-2026!"],
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.reproductive_cycle_mating_gestation_plan_commands
    where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid);

    delete from public.default_gestation_planning_model_commands
    where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid);

    delete from public.litter_care_tasks
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_plan_application_commands
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_plan_items
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_plans
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.reproductive_cycle_matings
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.reproductive_cycles
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_planning_model_items
    where organization_id = ${q(ids.tempOrg)}::uuid;

    select pg_catalog.set_config('app.default_gestation_planning_model_rpc', 'on', true);
    update public.organization_settings
    set default_gestation_planning_model_id = null
    where organization_id = ${q(ids.tempOrg)}::uuid
      and default_gestation_planning_model_id is not null;

    delete from public.litter_planning_models
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_care_task_template_commands
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litter_care_task_templates
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.litters
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.animals
    where organization_id = ${q(ids.tempOrg)}::uuid;

    delete from public.organization_settings
    where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid);

    set session_replication_role = replica;
    delete from public.memberships
    where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
       or id::text like '9f260006-%';
    set session_replication_role = origin;

    delete from auth.identities where user_id::text like '9f260006-%';
    delete from auth.users where id::text like '9f260006-%';
    delete from public.profiles where id::text like '9f260006-%';

    delete from public.organizations
    where id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid);

    delete from public.litter_planning_model_library_models
    where code = ${q(GESTATION_LIBRARY_STANDARD_CODE)}
      and version = ${otherFamilyLibraryVersion};
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'mating_gestation_plan_commands', (
          select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
          where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
        ),
        'default_gestation_commands', (
          select count(*) from public.default_gestation_planning_model_commands
          where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
        ),
        'litter_care_tasks', (
          select count(*) from public.litter_care_tasks where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'plan_application_commands', (
          select count(*) from public.litter_plan_application_commands
          where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'plan_items', (
          select count(*) from public.litter_plan_items where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'plans', (
          select count(*) from public.litter_plans where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'matings', (
          select count(*) from public.reproductive_cycle_matings where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'cycles', (
          select count(*) from public.reproductive_cycles where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'planning_model_items', (
          select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'planning_models', (
          select count(*) from public.litter_planning_models where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'template_commands', (
          select count(*) from public.litter_care_task_template_commands
          where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'litters', (
          select count(*) from public.litters where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'animals', (
          select count(*) from public.animals where organization_id = ${q(ids.tempOrg)}::uuid
        ),
        'organization_settings', (
          select count(*) from public.organization_settings
          where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
        ),
        'memberships', (
          select count(*) from public.memberships
          where organization_id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
             or id::text like '9f260006-%'
        ),
        'profiles', (select count(*) from public.profiles where id::text like '9f260006-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f260006-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f260006-%'),
        'organizations', (
          select count(*) from public.organizations
          where id in (${q(ids.tempOrg)}::uuid, ${q(ids.otherOrg)}::uuid)
        ),
        'other_family_library_row', (
          select count(*) from public.litter_planning_model_library_models
          where code = ${q(GESTATION_LIBRARY_STANDARD_CODE)} and version = ${otherFamilyLibraryVersion}
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
  expect(
    Number(
      sql(`
        select count(*) from public.litter_planning_model_library_models
        where family_code = 'dog-gestation';
      `),
    ),
  ).toBe(2);
}

function createRoleFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1]],
    [ids.memberUser, credentials.member[0], credentials.member[1]],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1]],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1]],
    [ids.foreignUser, credentials.foreign[0], credentials.foreign[1]],
  ] as const;
  const identities = [
    [ids.adminIdentity, ids.adminUser, credentials.admin[0]],
    [ids.memberIdentity, ids.memberUser, credentials.member[0]],
    [ids.viewerIdentity, ids.viewerUser, credentials.viewer[0]],
    [ids.inactiveIdentity, ids.inactiveUser, credentials.inactive[0]],
    [ids.foreignIdentity, ids.foreignUser, credentials.foreign[0]],
  ] as const;

  sql(`
    insert into public.organizations (id, name, slug) values
      (${q(ids.tempOrg)}::uuid, ${q(`${fixtureNamePrefix} organisation`)}, 'e2e-gestation-autoapply-9f260006'),
      (${q(ids.otherOrg)}::uuid, ${q(`${fixtureNamePrefix} autre organisation`)}, 'e2e-gestation-autoapply-other-9f260006');

    insert into public.organization_settings (organization_id, created_by, updated_by)
    values (${q(ids.tempOrg)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    ${authUsers
      .map(
        ([id, email, password]) => `
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
        '{"display_name":"Gestation auto-apply E2E"}'::jsonb, now(), now()
      );
    `,
      )
      .join("\n")}

    ${identities
      .map(
        ([id, userId, email]) => `
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(id)}::uuid, ${q(email)}, ${q(userId)}::uuid,
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
      (${q(ids.ownerMembership)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ownerId)}::uuid,
       'owner', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.adminMembership)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.adminUser)}::uuid,
       'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.memberUser)}::uuid,
       'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.viewerUser)}::uuid,
       'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveMembership)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.inactiveUser)}::uuid,
       'member', 'disabled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.otherOrg)}::uuid, ${q(ids.foreignUser)}::uuid,
       'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function createAnimalFixtures() {
  const mothers = [
    ["motherNotConfigured", "mère non configurée"],
    ["motherStandard", "mère standard"],
    ["motherHerpes", "mère herpès"],
    ["motherAlreadyApplied", "mère déjà appliqué"],
    ["motherVariantConflict", "mère conflit de variante"],
    ["motherUnavailable", "mère modèle indisponible"],
    ["motherInjectError", "mère erreur injectée"],
    ["motherForeignProbe", "mère sonde étrangère"],
    ["motherHistorical", "mère historique"],
  ] as const;

  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status, ownership_status,
      is_breeder, is_external, is_retired, created_by, updated_by
    ) values
      (${q(ids.father)}::uuid, ${q(ids.tempOrg)}::uuid,
       ${q(`${fixtureNamePrefix} père`)}, 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.fatherAlt)}::uuid, ${q(ids.tempOrg)}::uuid,
       ${q(`${fixtureNamePrefix} père alternatif`)}, 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      ${mothers
        .map(
          ([key, label]) => `
      (${q(ids[key])}::uuid, ${q(ids.tempOrg)}::uuid,
       ${q(`${fixtureNamePrefix} ${label}`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`,
        )
        .join(",\n")};
  `);
}

async function authenticatedClient(email: string, password: string): Promise<SupabaseTestClient> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  let lastError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (!error) {
      return client;
    }
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  expect(lastError).toBeNull();
  throw new Error(`Unable to authenticate ${email}: ${lastError?.message ?? "unknown"}`);
}

function requireSuccess<T extends { outcome: string }>(result: T): T & { outcome: "success" } {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") {
    throw new Error("Expected a successful result.");
  }
  return result as T & { outcome: "success" };
}

async function directSetDefault(
  client: SupabaseTestClient,
  clientCommandId: string,
  libraryModelCode: string | null,
  libraryModelVersion: number | null,
) {
  const response = await client.rpc("set_default_gestation_planning_model", {
    p_organization_id: ids.tempOrg,
    p_client_command_id: clientCommandId,
    p_library_model_code: libraryModelCode ?? undefined,
    p_library_model_version: libraryModelVersion ?? undefined,
  });
  expect(response.error).toBeNull();
  return response.data?.[0];
}

function currentDefaultModelId() {
  const value = sql(`
    select coalesce(default_gestation_planning_model_id::text, '')
    from public.organization_settings where organization_id = ${q(ids.tempOrg)}::uuid;
  `);
  return value === "" ? null : value;
}

type AnchorRow = { code: string; source: string | null; adjustment: number | null; date: string | null };
type WindowRow = { code: string; starts: string; ends: string };

function anchorRows(litterId: string, codes: readonly string[]): AnchorRow[] {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(json_build_object(
        'code', template.library_template_code,
        'source', item.anchor_resolution_source,
        'adjustment', item.anchor_adjustment_days,
        'date', item.anchor_date_snapshot
      ) order by template.library_template_code), '[]'::json)::text
      from public.litter_plan_items item
      join public.litter_care_task_templates template
        on template.id = item.organization_template_id
      where item.litter_id = ${q(litterId)}::uuid
        and template.library_template_code = any(array[${codes.map((code) => q(code)).join(",")}]);
    `),
  ) as AnchorRow[];
}

function taskWindows(litterId: string, codes: readonly string[]): WindowRow[] {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(json_build_object(
        'code', template.library_template_code,
        'starts', task.suggested_starts_on,
        'ends', task.suggested_ends_on
      ) order by template.library_template_code), '[]'::json)::text
      from public.litter_care_tasks task
      join public.litter_care_task_templates template
        on template.id = task.organization_template_id
      where task.litter_id = ${q(litterId)}::uuid
        and template.library_template_code = any(array[${codes.map((code) => q(code)).join(",")}]);
    `),
  ) as WindowRow[];
}

function elementaryTemplateCount() {
  return Number(
    sql(`
      select count(distinct library_template_code)
      from public.litter_care_task_templates where organization_id = ${q(ids.tempOrg)}::uuid;
    `),
  );
}

function litterPlanSnapshot(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'planRevision', (select revision from public.litter_plans where litter_id = ${q(litterId)}::uuid),
        'itemCount', (select count(*) from public.litter_plan_items where litter_id = ${q(litterId)}::uuid),
        'taskCount', (select count(*) from public.litter_care_tasks where litter_id = ${q(litterId)}::uuid)
      )::text;
    `),
  ) as { planRevision: number; itemCount: number; taskCount: number };
}

const state: {
  owner?: SupabaseTestClient;
  admin?: SupabaseTestClient;
  member?: SupabaseTestClient;
  viewer?: SupabaseTestClient;
  inactive?: SupabaseTestClient;
  foreign?: SupabaseTestClient;
  standardOrgModelId?: string;
  herpesOrgModelId?: string;
  standardLitterId?: string;
  standardPlanId?: string | null;
  herpesLitterId?: string;
  standardSnapshotAfterFirstMating?: { planRevision: number; itemCount: number; taskCount: number };
  herpesSnapshotAfterFirstMating?: { planRevision: number; itemCount: number; taskCount: number };
} = {};

test.beforeAll(async () => {
  cleanup();
  expectCleanupAtZero();
  createRoleFixtures();
  createAnimalFixtures();

  state.owner = await createAuthenticatedSupabaseClient();
  state.admin = await authenticatedClient(...credentials.admin);
  state.member = await authenticatedClient(...credentials.member);
  state.viewer = await authenticatedClient(...credentials.viewer);
  state.inactive = await authenticatedClient(...credentials.inactive);
  state.foreign = await authenticatedClient(...credentials.foreign);
}, { timeout: 300_000 });

test.afterAll(() => {
  cleanup();
  expectCleanupAtZero();
}, { timeout: 120_000 });

test("configure le modèle de gestation par défaut de l'organisation", async () => {
  const owner = state.owner!;
  const admin = state.admin!;
  const member = state.member!;
  const viewer = state.viewer!;
  const inactive = state.inactive!;

  // --- no default initially ---------------------------------------------
  expect(currentDefaultModelId()).toBeNull();

  // --- set Gestation (standard) -------------------------------------------
  const setStandard = await directSetDefault(
    owner,
    ids.commandConfigSetStandard,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(setStandard).toMatchObject({
    outcome: "success",
    library_model_code: GESTATION_LIBRARY_STANDARD_CODE,
    library_model_version: GESTATION_LIBRARY_VERSION,
    replayed: false,
  });
  const standardOrgModelId = setStandard!.organization_model_id!;
  expect(standardOrgModelId).toBeTruthy();
  state.standardOrgModelId = standardOrgModelId;
  expect(currentDefaultModelId()).toBe(standardOrgModelId);
  expect(elementaryTemplateCount()).toBe(14);
  expect(
    JSON.parse(
      sql(`
        select row_to_json(m)::text from public.litter_planning_models m
        where m.id = ${q(standardOrgModelId)}::uuid;
      `),
    ),
  ).toMatchObject({
    organization_id: ids.tempOrg,
    library_model_code: GESTATION_LIBRARY_STANDARD_CODE,
    library_model_version: GESTATION_LIBRARY_VERSION,
    is_active: true,
    revision: 1,
    title: gestationDefaultTitle("standard"),
  });

  // --- exact idempotence ---------------------------------------------------
  const idempotentReplay = await directSetDefault(
    owner,
    ids.commandConfigSetStandard,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(idempotentReplay).toMatchObject({
    outcome: "success",
    organization_model_id: standardOrgModelId,
    replayed: true,
  });
  expect(
    Number(
      sql(`
        select count(*) from public.default_gestation_planning_model_commands
        where organization_id = ${q(ids.tempOrg)}::uuid
          and client_command_id = ${q(ids.commandConfigSetStandard)}::uuid;
      `),
    ),
  ).toBe(1);

  // --- command conflict ------------------------------------------------------
  const conflictAttempt = await directSetDefault(
    owner,
    ids.commandConfigSetStandard,
    GESTATION_LIBRARY_HERPESVIROSE_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(conflictAttempt).toMatchObject({ outcome: "error", reason: "client_command_conflict" });
  expect(currentDefaultModelId()).toBe(standardOrgModelId);

  // --- admin is allowed (same write boundary as owner) ------------------------
  const adminAllowed = await directSetDefault(
    admin,
    ids.commandConfigAdminAllowed,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(adminAllowed).toMatchObject({
    outcome: "success",
    organization_model_id: standardOrgModelId,
    replayed: false,
  });
  expect(currentDefaultModelId()).toBe(standardOrgModelId);

  // --- member / viewer refused -----------------------------------------------
  const memberRefused = await setDefaultGestationPlanningModelCore(
    { organizationId: ids.tempOrg, clientCommandId: ids.commandConfigMemberRefused, choice: "standard" },
    member,
  );
  expect(memberRefused).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

  const viewerRefused = await setDefaultGestationPlanningModelCore(
    { organizationId: ids.tempOrg, clientCommandId: ids.commandConfigViewerRefused, choice: "standard" },
    viewer,
  );
  expect(viewerRefused).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

  // --- disabled membership is refused just like a non-member ------------------
  const inactiveRefused = await setDefaultGestationPlanningModelCore(
    { organizationId: ids.tempOrg, clientCommandId: ids.commandConfigInactiveRefused, choice: "standard" },
    inactive,
  );
  expect(inactiveRefused).toMatchObject({ outcome: "error", error: { code: "not_found" } });
  expect(currentDefaultModelId()).toBe(standardOrgModelId);

  // --- cross-org isolation ----------------------------------------------------
  const crossOrgAttempt = await setDefaultGestationPlanningModelCore(
    { organizationId: ids.otherOrg, clientCommandId: ids.commandConfigCrossOrg, choice: "standard" },
    owner,
  );
  expect(crossOrgAttempt).toMatchObject({ outcome: "error", error: { code: "not_found" } });
  expect(
    Number(
      sql(`
        select count(*) from public.litter_planning_models where organization_id = ${q(ids.otherOrg)}::uuid;
      `),
    ),
  ).toBe(0);

  // --- refuse other family -----------------------------------------------------
  // Note: `litter_planning_model_library_models_available_code_key` is a unique
  // index on `code` where `is_available`, so a second available row sharing the
  // real "dog-gestation-standard" code would violate it. This fixture row must
  // stay `is_available = false`; the RPC's guard (`not v_library.is_available or
  // v_library.family_code <> 'dog-gestation'`) still resolves to the same
  // `selection_unavailable` outcome the guard is meant to produce for any
  // version outside the organization's real dog-gestation family.
  sql(`
    insert into public.litter_planning_model_library_models (
      code, version, family_code, variant_code, title, species, breed, sort_order, is_available
    ) values (
      ${q(GESTATION_LIBRARY_STANDARD_CODE)}, ${otherFamilyLibraryVersion},
      'other-family-9f260006', 'standard',
      ${q(`${fixtureNamePrefix} autre famille`)}, 'dog', 'Golden Retriever', 999, false
    );
  `);
  const otherFamilyAttempt = await directSetDefault(
    owner,
    ids.commandConfigOtherFamily,
    GESTATION_LIBRARY_STANDARD_CODE,
    otherFamilyLibraryVersion,
  );
  expect(otherFamilyAttempt).toMatchObject({ outcome: "error", reason: "selection_unavailable" });
  expect(currentDefaultModelId()).toBe(standardOrgModelId);
  expect(
    Number(
      sql(`
        select count(*) from public.litter_planning_models
        where organization_id = ${q(ids.tempOrg)}::uuid
          and library_model_version = ${otherFamilyLibraryVersion};
      `),
    ),
  ).toBe(0);

  // --- set herpes as the new default ------------------------------------------
  const setHerpes = await directSetDefault(
    owner,
    ids.commandConfigSetHerpes,
    GESTATION_LIBRARY_HERPESVIROSE_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(setHerpes).toMatchObject({
    outcome: "success",
    library_model_code: GESTATION_LIBRARY_HERPESVIROSE_CODE,
    replayed: false,
  });
  const herpesOrgModelId = setHerpes!.organization_model_id!;
  expect(herpesOrgModelId).toBeTruthy();
  expect(herpesOrgModelId).not.toBe(standardOrgModelId);
  state.herpesOrgModelId = herpesOrgModelId;
  expect(currentDefaultModelId()).toBe(herpesOrgModelId);
  expect(elementaryTemplateCount()).toBe(16);
});

test("applique automatiquement le planning de gestation à la première saillie", async () => {
  const owner = state.owner!;
  const standardOrgModelId = state.standardOrgModelId!;
  const herpesOrgModelId = state.herpesOrgModelId!;
  expect(standardOrgModelId).toBeTruthy();
  expect(herpesOrgModelId).toBeTruthy();

  // --- not_configured: run against a cleared default --------------------------
  sql(`
    select pg_catalog.set_config('app.default_gestation_planning_model_rpc', 'on', true);
    update public.organization_settings set default_gestation_planning_model_id = null
    where organization_id = ${q(ids.tempOrg)}::uuid;
  `);
  expect(currentDefaultModelId()).toBeNull();

  const cycleNotConfigured = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherNotConfigured,
        status: "in_progress",
        startedOn: "2026-05-01",
        notes: `${fixtureNamePrefix} cycle non configuré`,
      },
      owner,
    ),
  ).cycle;

  const notConfigured = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleNotConfigured.id,
        clientCommandId: ids.commandMatingNotConfigured,
        fatherId: ids.father,
        occurredAt: "2026-05-01T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée non configurée`,
      },
      owner,
    ),
  );
  expect(notConfigured).toMatchObject({
    sequenceNo: 1,
    replayed: false,
    gestationPlanningOutcome: "not_configured",
    gestationModelTitle: null,
    gestationVariantCode: null,
    litterPlanId: null,
    litterPlanRevision: null,
    snapshotCount: 0,
    materializedCount: 0,
    pendingAnchorCount: 0,
  });
  expect(
    Number(sql(`select count(*) from public.litter_plans where litter_id = ${q(notConfigured.litterId)}::uuid;`)),
  ).toBe(0);

  // --- assert the retired RPC is not executable for authenticated clients -----
  const oldRpcAttempt = await owner.rpc("record_reproductive_cycle_mating", {
    p_cycle_id: cycleNotConfigured.id,
    p_client_command_id: ids.commandOldRpcAttempt,
    p_father_id: ids.father,
    p_occurred_at: "2026-09-01T09:00:00.000Z",
    p_timezone_name: "Europe/Paris",
    p_method: "natural",
  });
  expect(oldRpcAttempt.error).not.toBeNull();
  expect(
    Number(
      sql(`
        select count(*) from public.reproductive_cycle_matings
        where client_command_id = ${q(ids.commandOldRpcAttempt)}::uuid;
      `),
    ),
  ).toBe(0);

  // --- restore standard as default, then record the standard first mating -----
  const restoreStandard = await directSetDefault(
    owner,
    ids.commandConfigRestoreStandardForL,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(restoreStandard).toMatchObject({ outcome: "success", organization_model_id: standardOrgModelId });

  const cycleStandard = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherStandard,
        status: "in_progress",
        startedOn: "2026-06-01",
        notes: `${fixtureNamePrefix} cycle standard`,
      },
      owner,
    ),
  ).cycle;

  const standardFirst = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleStandard.id,
        clientCommandId: ids.commandMatingStandardFirst,
        fatherId: ids.father,
        occurredAt: "2026-06-10T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée standard`,
        estimatedOvulationDate: "2026-06-08",
      },
      owner,
    ),
  );
  expect(standardFirst).toMatchObject({
    sequenceNo: 1,
    replayed: false,
    gestationPlanningOutcome: "applied",
    gestationModelTitle: gestationDefaultTitle("standard"),
    gestationVariantCode: "standard",
    snapshotCount: 14,
    materializedCount: 14,
    pendingAnchorCount: 0,
  });
  expect(standardFirst.litterPlanId).toBeTruthy();
  state.standardLitterId = standardFirst.litterId;
  state.standardPlanId = standardFirst.litterPlanId;

  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'estimatedOvulationDate', estimated_ovulation_date::text,
          'matingDate', mating_date::text,
          'expectedBirthDate', expected_birth_date
        )::text
        from public.litters where id = ${q(standardFirst.litterId)}::uuid;
      `),
    ),
  ).toEqual({ estimatedOvulationDate: "2026-06-08", matingDate: "2026-06-10", expectedBirthDate: null });

  // ovulation-anchored items use estimated_ovulation directly (no derivation)
  expect(anchorRows(standardFirst.litterId, ["dog-pregnancy-ultrasound", "dog-plan-litter-count-xray"])).toEqual([
    { code: "dog-plan-litter-count-xray", source: "estimated_ovulation", adjustment: 0, date: "2026-06-08" },
    { code: "dog-pregnancy-ultrasound", source: "estimated_ovulation", adjustment: 0, date: "2026-06-08" },
  ]);

  // expected_birth-anchored items are derived via estimated_ovulation + 63 days
  expect(anchorRows(standardFirst.litterId, ["dog-gestation-food-transition"])).toEqual([
    { code: "dog-gestation-food-transition", source: "estimated_ovulation", adjustment: 63, date: "2026-08-10" },
  ]);

  expect(
    taskWindows(standardFirst.litterId, [
      "dog-pregnancy-ultrasound",
      "dog-plan-litter-count-xray",
      "dog-gestation-food-transition",
    ]),
  ).toEqual([
    { code: "dog-gestation-food-transition", starts: "2026-07-15", ends: "2026-07-21" },
    { code: "dog-plan-litter-count-xray", starts: "2026-08-01", ends: "2026-08-04" },
    { code: "dog-pregnancy-ultrasound", starts: "2026-07-03", ends: "2026-07-10" },
  ]);

  // --- second mating: never re-applies the plan --------------------------------
  const standardSecond = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleStandard.id,
        clientCommandId: ids.commandMatingSecond,
        fatherId: ids.father,
        occurredAt: "2026-06-12T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "ai_fresh",
      },
      owner,
    ),
  );
  expect(standardSecond).toMatchObject({
    sequenceNo: 2,
    replayed: false,
    gestationPlanningOutcome: "not_applicable",
    litterPlanId: null,
    litterPlanRevision: null,
    snapshotCount: 0,
    materializedCount: 0,
    pendingAnchorCount: 0,
  });
  expect(litterPlanSnapshot(standardFirst.litterId)).toEqual({ planRevision: 1, itemCount: 14, taskCount: 14 });

  // --- exact replay: identical ids and payload ---------------------------------
  const standardReplay = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleStandard.id,
        clientCommandId: ids.commandMatingStandardFirst,
        fatherId: ids.father,
        occurredAt: "2026-06-10T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée standard`,
        estimatedOvulationDate: "2026-06-08",
      },
      owner,
    ),
  );
  expect(standardReplay).toEqual({ ...standardFirst, replayed: true });

  // --- payload conflict on the same command id ----------------------------------
  const standardConflict = await recordReproductiveCycleMatingCore(
    {
      cycleId: cycleStandard.id,
      clientCommandId: ids.commandMatingStandardFirst,
      fatherId: ids.father,
      occurredAt: "2026-06-11T09:00:00+02:00",
      timezoneName: "Europe/Paris",
      method: "natural",
      litterName: `${fixtureNamePrefix} portée standard`,
      estimatedOvulationDate: "2026-06-08",
    },
    owner,
  );
  expect(standardConflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });

  state.standardSnapshotAfterFirstMating = litterPlanSnapshot(standardFirst.litterId);

  // --- herpes variant without an explicit ovulation date ------------------------
  const restoreHerpes = await directSetDefault(
    owner,
    ids.commandConfigRestoreHerpesForL2,
    GESTATION_LIBRARY_HERPESVIROSE_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(restoreHerpes).toMatchObject({ outcome: "success", organization_model_id: herpesOrgModelId });

  const cycleHerpes = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherHerpes,
        status: "in_progress",
        startedOn: "2026-06-15",
        notes: `${fixtureNamePrefix} cycle herpès`,
      },
      owner,
    ),
  ).cycle;

  const herpesFirst = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleHerpes.id,
        clientCommandId: ids.commandMatingHerpesFirst,
        fatherId: ids.father,
        occurredAt: "2026-06-15T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée herpès`,
      },
      owner,
    ),
  );
  expect(herpesFirst).toMatchObject({
    sequenceNo: 1,
    replayed: false,
    gestationPlanningOutcome: "applied",
    gestationModelTitle: gestationDefaultTitle("herpesvirose"),
    gestationVariantCode: "herpesvirose",
    snapshotCount: 16,
    materializedCount: 16,
    pendingAnchorCount: 0,
  });
  state.herpesLitterId = herpesFirst.litterId;

  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'estimatedOvulationDate', estimated_ovulation_date,
          'matingDate', mating_date::text
        )::text
        from public.litters where id = ${q(herpesFirst.litterId)}::uuid;
      `),
    ),
  ).toEqual({ estimatedOvulationDate: null, matingDate: "2026-06-15" });

  // without ovulation, expected_birth falls back to first_mating + 62 days
  expect(anchorRows(herpesFirst.litterId, ["dog-gestation-food-transition"])).toEqual([
    { code: "dog-gestation-food-transition", source: "first_mating", adjustment: 62, date: "2026-08-16" },
  ]);

  // injection 1 anchors on the first mating itself; injection 2 anchors on the
  // same derived "central" expected-birth estimate as the rest of the plan.
  expect(
    anchorRows(herpesFirst.litterId, ["dog-herpesvirose-injection-1", "dog-herpesvirose-injection-2"]),
  ).toEqual([
    { code: "dog-herpesvirose-injection-1", source: "first_mating", adjustment: 0, date: "2026-06-15" },
    { code: "dog-herpesvirose-injection-2", source: "first_mating", adjustment: 62, date: "2026-08-16" },
  ]);

  expect(
    taskWindows(herpesFirst.litterId, [
      "dog-gestation-food-transition",
      "dog-herpesvirose-injection-1",
      "dog-herpesvirose-injection-2",
    ]),
  ).toEqual([
    { code: "dog-gestation-food-transition", starts: "2026-07-21", ends: "2026-07-27" },
    { code: "dog-herpesvirose-injection-1", starts: "2026-06-22", ends: "2026-06-25" },
    { code: "dog-herpesvirose-injection-2", starts: "2026-08-02", ends: "2026-08-09" },
  ]);

  state.herpesSnapshotAfterFirstMating = litterPlanSnapshot(herpesFirst.litterId);

  // --- pre-seed two litters that already carry a "standard" gestation plan ------
  sql(`
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      mating_date, created_by, updated_by
    ) values
      (${q(ids.litterAlreadyApplied)}::uuid, ${q(ids.tempOrg)}::uuid,
       ${q(`${fixtureNamePrefix} portée déjà appliquée`)}, 'dog', 'Golden Retriever',
       ${q(ids.motherAlreadyApplied)}::uuid, ${q(ids.father)}::uuid, 'mating_done',
       '2026-06-01', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.litterVariantConflict)}::uuid, ${q(ids.tempOrg)}::uuid,
       ${q(`${fixtureNamePrefix} portée conflit de variante`)}, 'dog', 'Golden Retriever',
       ${q(ids.motherVariantConflict)}::uuid, ${q(ids.father)}::uuid, 'mating_done',
       '2026-06-01', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);

  const applySeedAlreadyApplied = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litterAlreadyApplied,
    p_planning_model_id: standardOrgModelId,
    p_client_command_id: randomUUID(),
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applySeedAlreadyApplied.error).toBeNull();
  expect(applySeedAlreadyApplied.data?.[0]?.outcome).toBe("success");
  const seededAlreadyAppliedPlanId = applySeedAlreadyApplied.data?.[0]?.litter_plan_id;

  const applySeedVariantConflict = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litterVariantConflict,
    p_planning_model_id: standardOrgModelId,
    p_client_command_id: randomUUID(),
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applySeedVariantConflict.error).toBeNull();
  expect(applySeedVariantConflict.data?.[0]?.outcome).toBe("success");
  const seededVariantConflictPlanId = applySeedVariantConflict.data?.[0]?.litter_plan_id;

  sql(`
    insert into public.reproductive_cycles (
      id, organization_id, mother_id, species, breed, status, started_on, litter_id, notes,
      created_by, updated_by
    ) values
      (${q(ids.cycleAlreadyApplied)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.motherAlreadyApplied)}::uuid,
       'dog', 'Golden Retriever', 'in_progress', '2026-06-01', ${q(ids.litterAlreadyApplied)}::uuid,
       ${q(`${fixtureNamePrefix} cycle déjà appliqué`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cycleVariantConflict)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.motherVariantConflict)}::uuid,
       'dog', 'Golden Retriever', 'in_progress', '2026-06-01', ${q(ids.litterVariantConflict)}::uuid,
       ${q(`${fixtureNamePrefix} cycle conflit de variante`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reproductive_cycle_matings (
      id, organization_id, cycle_id, father_id, sequence_no, occurred_at, timezone_name, method,
      client_command_id, created_by, updated_by
    ) values
      (${q(ids.fakeMatingAlreadyApplied)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.cycleAlreadyApplied)}::uuid,
       ${q(ids.father)}::uuid, 1, '2026-06-01T10:00:00+02:00'::timestamptz, 'Europe/Paris', 'natural',
       ${q(ids.commandAlreadyApplied)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.fakeMatingVariantConflict)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.cycleVariantConflict)}::uuid,
       ${q(ids.father)}::uuid, 1, '2026-06-01T10:00:00+02:00'::timestamptz, 'Europe/Paris', 'natural',
       ${q(ids.commandVariantConflict)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);

  // --- already_applied: default matches the plan already present on the litter --
  const restoreStandardForL = await directSetDefault(
    owner,
    ids.commandConfigRestoreStandardForM,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(restoreStandardForL).toMatchObject({ outcome: "success", organization_model_id: standardOrgModelId });

  const alreadyApplied = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: ids.cycleAlreadyApplied,
        clientCommandId: ids.commandAlreadyApplied,
        fatherId: ids.father,
        occurredAt: "2026-06-01T10:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée déjà appliquée`,
      },
      owner,
    ),
  );
  expect(alreadyApplied).toMatchObject({
    matingId: ids.fakeMatingAlreadyApplied,
    litterId: ids.litterAlreadyApplied,
    sequenceNo: 1,
    replayed: true,
    gestationPlanningOutcome: "already_applied",
    gestationModelTitle: gestationDefaultTitle("standard"),
    gestationVariantCode: "standard",
    litterPlanId: seededAlreadyAppliedPlanId,
    litterPlanRevision: 1,
  });
  expect(
    Number(
      sql(`select count(*) from public.litter_plan_items where litter_id = ${q(ids.litterAlreadyApplied)}::uuid;`),
    ),
  ).toBe(14);

  // --- variant_conflict: default points to a different variant than applied -----
  const restoreHerpesForL2 = await directSetDefault(
    owner,
    ids.commandConfigRestoreHerpesForVariantConflict,
    GESTATION_LIBRARY_HERPESVIROSE_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(restoreHerpesForL2).toMatchObject({
    outcome: "success",
    organization_model_id: herpesOrgModelId,
    replayed: false,
  });

  const variantConflict = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: ids.cycleVariantConflict,
        clientCommandId: ids.commandVariantConflict,
        fatherId: ids.father,
        occurredAt: "2026-06-01T10:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée conflit de variante`,
      },
      owner,
    ),
  );
  expect(variantConflict).toMatchObject({
    matingId: ids.fakeMatingVariantConflict,
    litterId: ids.litterVariantConflict,
    sequenceNo: 1,
    replayed: true,
    gestationPlanningOutcome: "variant_conflict",
    gestationModelTitle: gestationDefaultTitle("herpesvirose"),
    gestationVariantCode: "herpesvirose",
    litterPlanId: seededVariantConflictPlanId,
    litterPlanRevision: 1,
  });
  expect(
    Number(
      sql(`select count(*) from public.litter_plan_items where litter_id = ${q(ids.litterVariantConflict)}::uuid;`),
    ),
  ).toBe(14);

  // --- default_model_unavailable when the org model becomes inactive -----------
  const restoreStandardForM = await directSetDefault(
    owner,
    ids.commandConfigRestoreStandardForUnavailable,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(restoreStandardForM).toMatchObject({
    outcome: "success",
    organization_model_id: standardOrgModelId,
    replayed: false,
  });

  sql(`update public.litter_planning_models set is_active = false where id = ${q(standardOrgModelId)}::uuid;`);

  const cycleUnavailable = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherUnavailable,
        status: "in_progress",
        startedOn: "2026-05-05",
        notes: `${fixtureNamePrefix} cycle modèle indisponible`,
      },
      owner,
    ),
  ).cycle;

  const unavailable = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleUnavailable.id,
        clientCommandId: ids.commandMatingUnavailable,
        fatherId: ids.father,
        occurredAt: "2026-05-05T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée modèle indisponible`,
      },
      owner,
    ),
  );
  expect(unavailable).toMatchObject({
    sequenceNo: 1,
    replayed: false,
    gestationPlanningOutcome: "default_model_unavailable",
    gestationModelTitle: null,
    gestationVariantCode: null,
    litterPlanId: null,
    litterPlanRevision: null,
    snapshotCount: 0,
    materializedCount: 0,
    pendingAnchorCount: 0,
  });
  expect(
    Number(sql(`select count(*) from public.litter_plans where litter_id = ${q(unavailable.litterId)}::uuid;`)),
  ).toBe(0);

  // --- reuse the customized copy while reactivating it --------------------------
  const customizedTitle = `${fixtureNamePrefix} titre personnalisé`;
  sql(`update public.litter_planning_models set title = ${q(customizedTitle)} where id = ${q(standardOrgModelId)}::uuid;`);

  const reuseAndReactivate = await directSetDefault(
    owner,
    ids.commandConfigReuseAndReactivate,
    GESTATION_LIBRARY_STANDARD_CODE,
    GESTATION_LIBRARY_VERSION,
  );
  expect(reuseAndReactivate).toMatchObject({
    outcome: "success",
    organization_model_id: standardOrgModelId,
    replayed: false,
  });
  expect(
    JSON.parse(
      sql(`
        select json_build_object('isActive', is_active, 'title', title)::text
        from public.litter_planning_models where id = ${q(standardOrgModelId)}::uuid;
      `),
    ),
  ).toEqual({ isActive: true, title: customizedTitle });
  expect(
    Number(
      sql(`
        select count(*) from public.litter_planning_models
        where organization_id = ${q(ids.tempOrg)}::uuid
          and library_model_code = ${q(GESTATION_LIBRARY_STANDARD_CODE)};
      `),
    ),
  ).toBe(1);

  // --- clear to null --------------------------------------------------------------
  const cleared = await directSetDefault(owner, ids.commandConfigClear, null, null);
  expect(cleared).toMatchObject({ outcome: "success", organization_model_id: null, replayed: false });
  expect(currentDefaultModelId()).toBeNull();

  // --- changing the default never alters plans already applied on litters -------
  expect(litterPlanSnapshot(state.standardLitterId!)).toEqual(state.standardSnapshotAfterFirstMating);
  expect(litterPlanSnapshot(state.herpesLitterId!)).toEqual(state.herpesSnapshotAfterFirstMating);

  // --- security: foreign org without existing orchestration command --------------
  const foreign = state.foreign!;
  const viewer = state.viewer!;

  const cycleForeignProbe = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherForeignProbe,
        status: "in_progress",
        startedOn: "2026-05-10",
        notes: `${fixtureNamePrefix} cycle sonde étrangère`,
      },
      owner,
    ),
  ).cycle;

  const foreignNoCommandRpc = await foreign.rpc("record_reproductive_cycle_mating_with_gestation_plan", {
    p_cycle_id: cycleForeignProbe.id,
    p_client_command_id: ids.commandForeignNoCmd,
    p_father_id: ids.father,
    p_occurred_at: "2026-05-10T09:00:00+02:00",
    p_timezone_name: "Europe/Paris",
    p_method: "natural",
    p_litter_name: `${fixtureNamePrefix} portée sonde étrangère`,
  });
  expect(foreignNoCommandRpc.error).toBeNull();
  expect(foreignNoCommandRpc.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "cycle_not_found",
    mating_id: null,
    litter_id: null,
    sequence_no: null,
    replayed: false,
    gestation_planning_outcome: null,
    gestation_model_title: null,
    gestation_variant_code: null,
    litter_plan_id: null,
    litter_plan_revision: null,
    snapshot_count: 0,
    materialized_count: 0,
    pending_anchor_count: 0,
  });
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'commands', (
            select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
            where client_command_id = ${q(ids.commandForeignNoCmd)}::uuid
          ),
          'matings', (
            select count(*) from public.reproductive_cycle_matings
            where cycle_id = ${q(cycleForeignProbe.id)}::uuid
          ),
          'litters', (
            select count(*) from public.litters where mother_id = ${q(ids.motherForeignProbe)}::uuid
          ),
          'plans', (
            select count(*) from public.litter_plans
            where litter_id in (
              select id from public.litters where mother_id = ${q(ids.motherForeignProbe)}::uuid
            )
          )
        )::text;
      `),
    ),
  ).toEqual({ commands: 0, matings: 0, litters: 0, plans: 0 });

  // --- security: foreign exact replay of a successful orchestration command -----
  const authorizedSuccess = requireSuccess(
    await recordReproductiveCycleMatingCore(
      {
        cycleId: cycleForeignProbe.id,
        clientCommandId: ids.commandForeignReplaySource,
        fatherId: ids.father,
        occurredAt: "2026-05-10T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} portée sonde étrangère`,
      },
      owner,
    ),
  );
  expect(authorizedSuccess.replayed).toBe(false);

  const registryBeforeForeignReplay = Number(
    sql(`
      select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
      where client_command_id = ${q(ids.commandForeignReplaySource)}::uuid;
    `),
  );
  expect(registryBeforeForeignReplay).toBe(1);

  const foreignReplayRpc = await foreign.rpc("record_reproductive_cycle_mating_with_gestation_plan", {
    p_cycle_id: cycleForeignProbe.id,
    p_client_command_id: ids.commandForeignReplaySource,
    p_father_id: ids.father,
    p_occurred_at: "2026-05-10T09:00:00+02:00",
    p_timezone_name: "Europe/Paris",
    p_method: "natural",
    p_litter_name: `${fixtureNamePrefix} portée sonde étrangère`,
  });
  expect(foreignReplayRpc.error).toBeNull();
  expect(foreignReplayRpc.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "cycle_not_found",
    mating_id: null,
    litter_id: null,
    sequence_no: null,
    replayed: false,
    gestation_planning_outcome: null,
    gestation_model_title: null,
    gestation_variant_code: null,
    litter_plan_id: null,
    snapshot_count: 0,
    materialized_count: 0,
    pending_anchor_count: 0,
  });
  expect(
    Number(
      sql(`
        select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
        where client_command_id = ${q(ids.commandForeignReplaySource)}::uuid;
      `),
    ),
  ).toBe(1);
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'matingId', mating_id, 'litterId', litter_id, 'outcome', mating_outcome
        )::text
        from public.reproductive_cycle_mating_gestation_plan_commands
        where client_command_id = ${q(ids.commandForeignReplaySource)}::uuid;
      `),
    ),
  ).toEqual({
    matingId: authorizedSuccess.matingId,
    litterId: authorizedSuccess.litterId,
    outcome: "success",
  });

  // --- security: viewer of the owning organization ------------------------------
  const viewerRpc = await viewer.rpc("record_reproductive_cycle_mating_with_gestation_plan", {
    p_cycle_id: cycleForeignProbe.id,
    p_client_command_id: ids.commandViewerMating,
    p_father_id: ids.father,
    p_occurred_at: "2026-05-10T10:00:00+02:00",
    p_timezone_name: "Europe/Paris",
    p_method: "natural",
    p_litter_name: `${fixtureNamePrefix} portée viewer`,
  });
  expect(viewerRpc.error).toBeNull();
  expect(viewerRpc.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "membership_required",
    mating_id: null,
    litter_id: null,
    litter_plan_id: null,
    gestation_planning_outcome: null,
    replayed: false,
  });
  expect(
    Number(
      sql(`
        select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
        where client_command_id = ${q(ids.commandViewerMating)}::uuid;
      `),
    ),
  ).toBe(0);

  // --- security: historical mating without registry (exact + conflicts) ---------
  const historicalLitterName = `${fixtureNamePrefix} portée historique`;
  sql(`
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      mating_date, created_by, updated_by
    ) values (
      ${q(ids.litterHistorical)}::uuid, ${q(ids.tempOrg)}::uuid,
      ${q(historicalLitterName)}, 'dog', 'Golden Retriever',
      ${q(ids.motherHistorical)}::uuid, ${q(ids.father)}::uuid, 'mating_done',
      '2026-05-12', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.reproductive_cycles (
      id, organization_id, mother_id, species, breed, status, started_on, litter_id, notes,
      created_by, updated_by
    ) values (
      ${q(ids.cycleHistorical)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.motherHistorical)}::uuid,
      'dog', 'Golden Retriever', 'mated', '2026-05-12', ${q(ids.litterHistorical)}::uuid,
      ${q(`${fixtureNamePrefix} cycle historique`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.reproductive_cycle_matings (
      id, organization_id, cycle_id, father_id, sequence_no, occurred_at, timezone_name, method,
      location, note, client_command_id, created_by, updated_by
    ) values (
      ${q(ids.matingHistorical)}::uuid, ${q(ids.tempOrg)}::uuid, ${q(ids.cycleHistorical)}::uuid,
      ${q(ids.father)}::uuid, 1, '2026-05-12T09:00:00+02:00'::timestamptz, 'Europe/Paris', 'natural',
      null, null, ${q(ids.commandHistorical)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);

  const conflictBase = {
    cycleId: ids.cycleHistorical,
    clientCommandId: ids.commandHistorical,
    fatherId: ids.father,
    occurredAt: "2026-05-12T09:00:00+02:00",
    timezoneName: "Europe/Paris",
    method: "natural" as const,
    litterName: historicalLitterName,
  };

  const conflictCases = [
    { ...conflictBase, fatherId: ids.fatherAlt },
    { ...conflictBase, occurredAt: "2026-05-12T10:00:00+02:00" },
    { ...conflictBase, timezoneName: "Europe/Berlin" },
    { ...conflictBase, method: "ai_fresh" as const },
    { ...conflictBase, location: "chenil A" },
    { ...conflictBase, note: "note forgée" },
    { ...conflictBase, litterName: `${fixtureNamePrefix} autre nom` },
    { ...conflictBase, estimatedOvulationDate: "2026-05-13" },
  ] as const;

  for (const conflictInput of conflictCases) {
    const conflict = await recordReproductiveCycleMatingCore(conflictInput, owner);
    expect(conflict).toMatchObject({
      outcome: "error",
      error: { code: "conflict" },
    });
  }

  expect(
    Number(
      sql(`
        select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
        where client_command_id = ${q(ids.commandHistorical)}::uuid;
      `),
    ),
  ).toBe(0);
  expect(
    Number(
      sql(`
        select count(*) from public.litter_plans
        where litter_id = ${q(ids.litterHistorical)}::uuid;
      `),
    ),
  ).toBe(0);

  const historicalExact = requireSuccess(
    await recordReproductiveCycleMatingCore(conflictBase, owner),
  );
  expect(historicalExact).toMatchObject({
    matingId: ids.matingHistorical,
    litterId: ids.litterHistorical,
    sequenceNo: 1,
    replayed: true,
    gestationPlanningOutcome: "not_configured",
  });
  expect(
    Number(
      sql(`
        select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
        where client_command_id = ${q(ids.commandHistorical)}::uuid;
      `),
    ),
  ).toBe(1);

  // --- inject error: full rollback of mating + litter + plan ---------------------
  const cycleInjectError = requireSuccess(
    await createReproductiveCycleCore(
      {
        motherId: ids.motherInjectError,
        status: "in_progress",
        startedOn: "2026-05-06",
        notes: `${fixtureNamePrefix} cycle erreur injectée`,
      },
      owner,
    ),
  ).cycle;

  expect(() =>
    sql(`
      select pg_catalog.set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
      select pg_catalog.set_config('app.gestation_auto_apply_inject_error', 'on', true);
      select * from public.record_reproductive_cycle_mating_with_gestation_plan(
        ${q(cycleInjectError.id)}::uuid,
        ${q(ids.commandMatingInjectError)}::uuid,
        ${q(ids.father)}::uuid,
        '2026-05-06T09:00:00+02:00'::timestamptz,
        'Europe/Paris',
        'natural',
        null,
        null,
        ${q(`${fixtureNamePrefix} portée erreur injectée`)},
        null
      );
    `),
  ).toThrow(/gestation_auto_apply_injected_error/);

  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'matings', (
            select count(*) from public.reproductive_cycle_matings
            where cycle_id = ${q(cycleInjectError.id)}::uuid
          ),
          'litters', (
            select count(*) from public.litters where mother_id = ${q(ids.motherInjectError)}::uuid
          ),
          'commands', (
            select count(*) from public.reproductive_cycle_mating_gestation_plan_commands
            where client_command_id = ${q(ids.commandMatingInjectError)}::uuid
          ),
          'cycleLitterId', (
            select litter_id from public.reproductive_cycles where id = ${q(cycleInjectError.id)}::uuid
          ),
          'cycleStatus', (
            select status from public.reproductive_cycles where id = ${q(cycleInjectError.id)}::uuid
          )
        )::text;
      `),
    ),
  ).toEqual({ matings: 0, litters: 0, commands: 0, cycleLitterId: null, cycleStatus: "in_progress" });
});

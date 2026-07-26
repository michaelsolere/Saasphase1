import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  importLitterPlanningModelLibraryModelsCore,
  listLitterPlanningModelLibraryCore,
  type LitterPlanningModelLibraryItemSummary,
} from "../../src/features/litter-journal/litter-planning-model-library-core";
import {
  createLitterPlanningModelCore,
  getLitterPlanningModelCore,
  replaceLitterPlanningModelCore,
} from "../../src/features/litter-journal/litter-planning-models-core";
import { rescheduleLitterCareTaskWindowCore } from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f260005-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E gestation model library 9f260005";
const unavailableLibraryModelCode = "e2e-gestation-library-model-unavailable";

const ids = {
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
  motherOvulation: `${prefix}50`,
  motherMating: `${prefix}51`,
  litterStandard: `${prefix}52`,
  litterHerpes: `${prefix}53`,
  manualTemplate: `${prefix}54`,
} as const;

const credentials = {
  admin: ["gestation-library-admin@saasphase1.invalid", "GestationLibraryAdmin-2026!"],
  member: ["gestation-library-member@saasphase1.invalid", "GestationLibraryMember-2026!"],
  viewer: ["gestation-library-viewer@saasphase1.invalid", "GestationLibraryViewer-2026!"],
  inactive: ["gestation-library-inactive@saasphase1.invalid", "GestationLibraryInactive-2026!"],
} as const;

const elementaryTemplateCodes = [
  "dog-pregnancy-ultrasound",
  "dog-gestation-food-transition",
  "dog-gestation-food-plus-10",
  "dog-gestation-food-plus-20",
  "dog-gestation-food-plus-40",
  "dog-deworm-mother-before-birth",
  "dog-plan-litter-count-xray",
  "dog-prepare-whelping-area",
  "dog-check-whelping-equipment",
  "dog-check-emergency-protocol",
  "dog-start-temperature-monitoring",
  "dog-temperature-monitoring-period",
  "dog-prepare-whelping-journal",
  "dog-whelping-vigilance-window",
  "dog-herpesvirose-injection-1",
  "dog-herpesvirose-injection-2",
] as const;

const herpesOnlyTemplateCodes = [
  "dog-herpesvirose-injection-1",
  "dog-herpesvirose-injection-2",
] as const;

const standardLibraryItems: LitterPlanningModelLibraryItemSummary[] = [
  { libraryTemplateCode: "dog-pregnancy-ultrasound", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "estimated_ovulation", windowStartsOffsetDays: 25, windowEndsOffsetDays: 32, displayOrder: 0, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-gestation-food-transition", libraryTemplateVersion: 1, itemKind: "window", priority: "normal", anchorType: "expected_birth", windowStartsOffsetDays: -26, windowEndsOffsetDays: -20, displayOrder: 1, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-gestation-food-plus-10", libraryTemplateVersion: 1, itemKind: "window", priority: "normal", anchorType: "expected_birth", windowStartsOffsetDays: -19, windowEndsOffsetDays: -13, displayOrder: 2, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-gestation-food-plus-20", libraryTemplateVersion: 1, itemKind: "window", priority: "normal", anchorType: "expected_birth", windowStartsOffsetDays: -12, windowEndsOffsetDays: -6, displayOrder: 3, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-gestation-food-plus-40", libraryTemplateVersion: 1, itemKind: "window", priority: "normal", anchorType: "expected_birth", windowStartsOffsetDays: -5, windowEndsOffsetDays: 0, displayOrder: 4, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-deworm-mother-before-birth", libraryTemplateVersion: 1, itemKind: "task", priority: "important", anchorType: "expected_birth", pointOffsetDays: -15, displayOrder: 5, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-plan-litter-count-xray", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "estimated_ovulation", windowStartsOffsetDays: 54, windowEndsOffsetDays: 57, displayOrder: 6, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-prepare-whelping-area", libraryTemplateVersion: 1, itemKind: "task", priority: "important", anchorType: "expected_birth", pointOffsetDays: -7, displayOrder: 7, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-check-whelping-equipment", libraryTemplateVersion: 1, itemKind: "task", priority: "normal", anchorType: "expected_birth", pointOffsetDays: -7, displayOrder: 8, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-check-emergency-protocol", libraryTemplateVersion: 1, itemKind: "task", priority: "normal", anchorType: "expected_birth", pointOffsetDays: -7, displayOrder: 9, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-start-temperature-monitoring", libraryTemplateVersion: 1, itemKind: "task", priority: "important", anchorType: "expected_birth", pointOffsetDays: -5, displayOrder: 10, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-temperature-monitoring-period", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "expected_birth", windowStartsOffsetDays: -5, windowEndsOffsetDays: 0, displayOrder: 11, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-prepare-whelping-journal", libraryTemplateVersion: 1, itemKind: "task", priority: "normal", anchorType: "expected_birth", pointOffsetDays: -2, displayOrder: 12, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-whelping-vigilance-window", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "expected_birth", windowStartsOffsetDays: -1, windowEndsOffsetDays: 2, displayOrder: 13, isRequired: false, isSelectedByDefault: true },
];

const herpesExtraItems: LitterPlanningModelLibraryItemSummary[] = [
  { libraryTemplateCode: "dog-herpesvirose-injection-1", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "first_mating", windowStartsOffsetDays: 7, windowEndsOffsetDays: 10, displayOrder: 14, isRequired: false, isSelectedByDefault: true },
  { libraryTemplateCode: "dog-herpesvirose-injection-2", libraryTemplateVersion: 1, itemKind: "window", priority: "important", anchorType: "expected_birth", windowStartsOffsetDays: -14, windowEndsOffsetDays: -7, displayOrder: 15, isRequired: false, isSelectedByDefault: true },
];

const trackedModelIds = new Set<string>();
const trackedTemplateIds = new Set<string>();
const trackedLitterIds = new Set<string>([ids.litterStandard, ids.litterHerpes]);
const trackedAnimalIds = new Set<string>([ids.motherOvulation, ids.motherMating]);

function command(suffix: number) {
  return `${prefix}${String(suffix).padStart(2, "0")}`;
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function uuidArray(values: Iterable<string>) {
  const entries = [...values].map((value) => `${q(value)}::uuid`);
  return entries.length > 0 ? `array[${entries.join(",")}]::uuid[]` : "array[]::uuid[]";
}

function cleanup() {
  sql(`
    delete from public.litter_care_task_schedule_changes
    where command_id in (
      select id from public.litter_care_task_schedule_commands
      where client_command_id::text like '9f260005-%'
         or id::text like '9f260005-%'
         or task_id in (
           select id from public.litter_care_tasks
           where litter_id = any(${uuidArray(trackedLitterIds)})
              or litter_id::text like '9f260005-%'
              or creation_command_id::text like '9f260005-%'
         )
    )
       or id::text like '9f260005-%';

    delete from public.litter_care_task_schedule_commands
    where task_id in (
      select id from public.litter_care_tasks
      where litter_id = any(${uuidArray(trackedLitterIds)})
         or litter_id::text like '9f260005-%'
         or creation_command_id::text like '9f260005-%'
         or resolution_command_id::text like '9f260005-%'
    )
       or client_command_id::text like '9f260005-%'
       or id::text like '9f260005-%';

    delete from public.litter_care_tasks
    where litter_id = any(${uuidArray(trackedLitterIds)})
       or litter_id::text like '9f260005-%'
       or creation_command_id::text like '9f260005-%'
       or resolution_command_id::text like '9f260005-%';

    delete from public.litter_plan_application_commands
    where litter_id = any(${uuidArray(trackedLitterIds)})
       or client_command_id::text like '9f260005-%'
       or id::text like '9f260005-%';

    delete from public.litter_plan_items
    where litter_id = any(${uuidArray(trackedLitterIds)})
       or litter_id::text like '9f260005-%';

    delete from public.litter_plans
    where litter_id = any(${uuidArray(trackedLitterIds)})
       or litter_id::text like '9f260005-%';

    delete from public.litter_planning_model_commands
    where model_id = any(${uuidArray(trackedModelIds)})
       or client_command_id::text like '9f260005-%'
       or id::text like '9f260005-%'
       or model_id in (
         select id from public.litter_planning_models
         where title like ${q(`${fixtureNamePrefix}%`)}
            or (
              organization_id = ${q(organizationId)}::uuid
              and library_model_code in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
              and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
            )
            or organization_id = ${q(ids.otherOrganization)}::uuid
       );

    delete from public.litter_planning_model_items
    where model_id = any(${uuidArray(trackedModelIds)})
       or id::text like '9f260005-%'
       or organization_template_id = ${q(ids.manualTemplate)}::uuid
       or model_id in (
         select id from public.litter_planning_models
         where title like ${q(`${fixtureNamePrefix}%`)}
            or (
              organization_id = ${q(organizationId)}::uuid
              and library_model_code in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
              and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
            )
            or organization_id = ${q(ids.otherOrganization)}::uuid
       );

    delete from public.litter_planning_models
    where id = any(${uuidArray(trackedModelIds)})
       or id::text like '9f260005-%'
       or organization_id = ${q(ids.otherOrganization)}::uuid
       or title like ${q(`${fixtureNamePrefix}%`)}
       or (
         organization_id = ${q(organizationId)}::uuid
         and library_model_code in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
         and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
       );

    delete from public.litter_planning_model_library_import_commands
    where client_command_id::text like '9f260005-%'
       or id::text like '9f260005-%';

    delete from public.litter_care_task_template_commands
    where template_id = any(${uuidArray(trackedTemplateIds)})
       or client_command_id::text like '9f260005-%';

    delete from public.litter_care_task_templates
    where id = any(${uuidArray(trackedTemplateIds)})
       or id = ${q(ids.manualTemplate)}::uuid
       or (
         organization_id in (${q(organizationId)}::uuid, ${q(ids.otherOrganization)}::uuid)
         and library_template_code = any(array[
           ${elementaryTemplateCodes.map((code) => q(code)).join(",")}
         ])
         and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
       );

    delete from public.litters
    where id = any(${uuidArray(trackedLitterIds)})
       or id::text like '9f260005-%';

    delete from public.animals
    where id = any(${uuidArray(trackedAnimalIds)})
       or id::text like '9f260005-%';

    delete from public.litter_planning_model_library_items
    where library_model_code = 'dog-gestation-standard'
      and library_model_version = 2;

    delete from public.litter_planning_model_library_models
    where code in ('dog-gestation-standard', ${q(unavailableLibraryModelCode)})
      and version = 2;

    delete from public.litter_planning_model_library_models
    where code = ${q(unavailableLibraryModelCode)} and version = 1;

    update public.litter_planning_model_library_models
    set is_available = true
    where code = 'dog-gestation-standard' and version = 1;

    delete from public.memberships where id::text like '9f260005-%';
    delete from auth.identities where user_id::text like '9f260005-%';
    delete from auth.users where id::text like '9f260005-%';
    delete from public.organizations where id::text like '9f260005-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'import_commands', (
        select count(*) from public.litter_planning_model_library_import_commands
        where client_command_id::text like '9f260005-%'
           or id::text like '9f260005-%'
      ),
      'planning_model_commands', (
        select count(*) from public.litter_planning_model_commands
        where client_command_id::text like '9f260005-%'
           or id::text like '9f260005-%'
           or model_id = any(${uuidArray(trackedModelIds)})
      ),
      'planning_model_items', (
        select count(*) from public.litter_planning_model_items
        where model_id = any(${uuidArray(trackedModelIds)})
           or id::text like '9f260005-%'
      ),
      'planning_models', (
        select count(*) from public.litter_planning_models
        where id = any(${uuidArray(trackedModelIds)})
           or id::text like '9f260005-%'
           or organization_id = ${q(ids.otherOrganization)}::uuid
           or (
             organization_id = ${q(organizationId)}::uuid
             and library_model_code in ('dog-gestation-standard', 'dog-gestation-herpesvirose')
             and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
           )
      ),
      'plan_application_commands', (
        select count(*) from public.litter_plan_application_commands
        where client_command_id::text like '9f260005-%'
           or litter_id = any(${uuidArray(trackedLitterIds)})
      ),
      'plan_items', (
        select count(*) from public.litter_plan_items
        where litter_id = any(${uuidArray(trackedLitterIds)})
      ),
      'plans', (
        select count(*) from public.litter_plans
        where litter_id = any(${uuidArray(trackedLitterIds)})
      ),
      'care_tasks', (
        select count(*) from public.litter_care_tasks
        where litter_id = any(${uuidArray(trackedLitterIds)})
           or creation_command_id::text like '9f260005-%'
      ),
      'schedule_commands', (
        select count(*) from public.litter_care_task_schedule_commands
        where client_command_id::text like '9f260005-%'
           or id::text like '9f260005-%'
           or task_id in (
             select id from public.litter_care_tasks
             where litter_id = any(${uuidArray(trackedLitterIds)})
                or creation_command_id::text like '9f260005-%'
           )
      ),
      'organization_templates', (
        select count(*) from public.litter_care_task_templates
        where id = any(${uuidArray(trackedTemplateIds)})
           or id = ${q(ids.manualTemplate)}::uuid
           or (
             organization_id in (${q(organizationId)}::uuid, ${q(ids.otherOrganization)}::uuid)
             and library_template_code = any(array[
               ${elementaryTemplateCodes.map((code) => q(code)).join(",")}
             ])
             and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
           )
      ),
      'litters', (
        select count(*) from public.litters
        where id = any(${uuidArray(trackedLitterIds)})
      ),
      'animals', (
        select count(*) from public.animals
        where id = any(${uuidArray(trackedAnimalIds)})
      ),
      'temporary_library_models_v2', (
        select count(*) from public.litter_planning_model_library_models
        where (code = 'dog-gestation-standard' and version = 2)
           or code = ${q(unavailableLibraryModelCode)}
      ),
      'temporary_library_items_v2', (
        select count(*) from public.litter_planning_model_library_items
        where library_model_code = 'dog-gestation-standard'
          and library_model_version = 2
      ),
      'memberships', (select count(*) from public.memberships where id::text like '9f260005-%'),
      'auth_identities', (select count(*) from auth.identities where user_id::text like '9f260005-%'),
      'auth_users', (select count(*) from auth.users where id::text like '9f260005-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9f260005-%')
    )::text;
  `)) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
  expect(Number(sql(`
    select count(*) from public.litter_care_task_library_packs where code like 'dog-%';
  `))).toBe(3);
  expect(Number(sql(`
    select count(*) from public.litter_care_task_library_templates where code like 'dog-%';
  `))).toBe(25);
  expect(Number(sql(`
    select count(*) from public.litter_planning_model_library_models where is_available;
  `))).toBe(2);
}

function createRoleFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1]],
    [ids.memberUser, credentials.member[0], credentials.member[1]],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1]],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1]],
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
      ${q(`${fixtureNamePrefix} autre organisation`)},
      'e2e-gestation-library-other-9f260005'
    );

    ${authUsers.map(([id, email, password]) => `
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
        '{"display_name":"Gestation library E2E"}'::jsonb, now(), now()
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
  `);
}

function createBreedingFixtures() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status, ownership_status,
      created_by, updated_by
    ) values
      (${q(ids.motherOvulation)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} mère ovulation`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.motherMating)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} mère saillie`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, mating_date_2, estimated_ovulation_date, expected_birth_date,
      created_by, updated_by
    ) values
      (${q(ids.litterStandard)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} portée standard`)}, 'dog', 'Golden Retriever',
       ${q(ids.motherOvulation)}::uuid, 'pregnancy_confirmed',
       '2026-06-10', '2026-06-12', '2026-06-08', '2026-08-10',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.litterHerpes)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} portée herpès`)}, 'dog', 'Golden Retriever',
       ${q(ids.motherMating)}::uuid, 'pregnancy_confirmed',
       '2026-06-10', '2026-06-12', null, '2026-08-10',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, breed, revision, created_by, updated_by
    ) values (
      ${q(ids.manualTemplate)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} élément manuel`)}, 'other', 'litter', 'expected_birth',
      0, 'dog', 'Golden Retriever', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
  trackedTemplateIds.add(ids.manualTemplate);
}

async function authenticatedClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

async function directImport(
  client: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
  organization: string,
  commandId: string,
  selection: Json,
  isActive = true,
) {
  const response = await client.rpc("import_litter_planning_model_library_models", {
    p_organization_id: organization,
    p_client_command_id: commandId,
    p_selection: selection,
    p_is_active: isActive,
  });
  expect(response.error).toBeNull();
  return response.data?.[0];
}

function mapOrgItemsToLibrarySummary(
  modelId: string,
): LitterPlanningModelLibraryItemSummary[] {
  const rows = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'libraryTemplateCode', template.library_template_code,
      'libraryTemplateVersion', template.library_template_version,
      'itemKind', item.item_kind,
      'priority', item.priority,
      'anchorType', item.anchor_type,
      'pointOffsetDays', item.point_offset_days,
      'windowStartsOffsetDays', item.window_starts_offset_days,
      'windowEndsOffsetDays', item.window_ends_offset_days,
      'displayOrder', item.display_order,
      'isRequired', item.is_required,
      'isSelectedByDefault', item.is_selected_by_default
    ) order by item.display_order), '[]'::json)::text
    from public.litter_planning_model_items item
    join public.litter_care_task_templates template
      on template.id = item.organization_template_id
    where item.model_id = ${q(modelId)}::uuid;
  `)) as LitterPlanningModelLibraryItemSummary[];
  return rows.map((row) => {
    const normalized = { ...row };
    if (normalized.pointOffsetDays === null) delete (normalized as { pointOffsetDays?: number }).pointOffsetDays;
    if (normalized.windowStartsOffsetDays === null) {
      delete (normalized as { windowStartsOffsetDays?: number }).windowStartsOffsetDays;
    }
    if (normalized.windowEndsOffsetDays === null) {
      delete (normalized as { windowEndsOffsetDays?: number }).windowEndsOffsetDays;
    }
    return normalized;
  });
}

test.beforeEach(() => {
  cleanup();
  expectCleanupAtZero();
});

test.afterEach(() => {
  cleanup();
  expectCleanupAtZero();
});

test("fonde la bibliothèque de modèles de gestation et l’import atomique", async () => {
  const catalog = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', code,
      'version', version,
      'familyCode', family_code,
      'variantCode', variant_code,
      'title', title,
      'sortOrder', sort_order,
      'itemCount', (
        select count(*) from public.litter_planning_model_library_items item
        where item.library_model_code = model.code
          and item.library_model_version = model.version
      )
    ) order by sort_order), '[]'::json)::text
    from public.litter_planning_model_library_models model
    where is_available;
  `));
  expect(catalog).toEqual([
    {
      code: "dog-gestation-standard",
      version: 1,
      familyCode: "dog-gestation",
      variantCode: "standard",
      title: "Gestation",
      sortOrder: 10,
      itemCount: 14,
    },
    {
      code: "dog-gestation-herpesvirose",
      version: 1,
      familyCode: "dog-gestation",
      variantCode: "herpesvirose",
      title: "Gestation + herpèsvirose",
      sortOrder: 20,
      itemCount: 16,
    },
  ]);

  createRoleFixtures();
  createBreedingFixtures();

  const owner = await createAuthenticatedSupabaseClient();
  const secondOwner = await createAuthenticatedSupabaseClient();
  const admin = await authenticatedClient(...credentials.admin);
  const member = await authenticatedClient(...credentials.member);
  const viewer = await authenticatedClient(...credentials.viewer);
  const inactive = await authenticatedClient(...credentials.inactive);

  const listed = await listLitterPlanningModelLibraryCore({ organizationId }, owner);
  expect(listed).toMatchObject({ outcome: "success", role: "owner" });
  if (listed.outcome !== "success") throw new Error("list failed");

  const standard = listed.models.find((model) => model.code === "dog-gestation-standard");
  const herpes = listed.models.find((model) => model.code === "dog-gestation-herpesvirose");
  expect(standard).toMatchObject({
    version: 1,
    familyCode: "dog-gestation",
    variantCode: "standard",
    title: "Gestation",
    itemCount: 14,
    isImported: false,
  });
  expect(herpes).toMatchObject({
    version: 1,
    familyCode: "dog-gestation",
    variantCode: "herpesvirose",
    title: "Gestation + herpèsvirose",
    itemCount: 16,
    isImported: false,
  });
  expect(standard?.items).toEqual(standardLibraryItems);
  expect(herpes?.items.slice(0, 14)).toEqual(standardLibraryItems);
  expect(herpes?.items.slice(14)).toEqual(herpesExtraItems);
  expect(herpes?.items.length).toBe(16);

  for (const client of [member, viewer] as const) {
    expect(
      await listLitterPlanningModelLibraryCore({ organizationId }, client),
    ).toMatchObject({ outcome: "success" });
  }

  expect(
    Number(sql(`
      select count(*) from public.litter_plans where litter_id = ${q(ids.litterStandard)}::uuid;
    `)),
  ).toBe(0);

  const bothSelection = [
    { code: "dog-gestation-standard", version: 1 },
    { code: "dog-gestation-herpesvirose", version: 1 },
  ] as const;
  const standardOnlySelection = [{ code: "dog-gestation-standard", version: 1 }] as const;
  const herpesOnlySelection = [{ code: "dog-gestation-herpesvirose", version: 1 }] as const;

  const imported = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId,
      clientCommandId: command(1),
      selection: [...standardOnlySelection],
      isActive: true,
    },
    owner,
  );
  expect(imported).toMatchObject({
    outcome: "success",
    importedCount: 1,
    alreadyImportedCount: 0,
    replayed: false,
  });
  if (imported.outcome !== "success") throw new Error("import failed");

  expect(imported.elementaryImportedCount).toBe(14);
  expect(new Set(imported.elementaryTemplates.map((item) => item.code)).size).toBe(14);
  for (const template of imported.elementaryTemplates) {
    trackedTemplateIds.add(template.templateId);
  }
  for (const model of imported.models) {
    trackedModelIds.add(model.modelId);
    expect(
      JSON.parse(sql(`
        select row_to_json(model)::text
        from public.litter_planning_models model
        where model.id = ${q(model.modelId)}::uuid;
      `)),
    ).toMatchObject({
      library_model_code: model.code,
      library_model_version: model.version,
      organization_id: organizationId,
    });
  }

  const standardModelId = imported.models.find((m) => m.code === "dog-gestation-standard")!.modelId;
  expect(mapOrgItemsToLibrarySummary(standardModelId)).toEqual(standardLibraryItems);

  expect(
    await directImport(owner, organizationId, command(20), [
      { code: "dog-gestation-standard", version: 1 },
      { code: unavailableLibraryModelCode, version: 1 },
    ]),
  ).toMatchObject({ outcome: "error", reason: "selection_unavailable" });
  expect(Number(sql(`
    select count(*) from public.litter_planning_model_library_import_commands
    where client_command_id = ${q(command(20))}::uuid;
  `))).toBe(0);
  expect(Number(sql(`
    select count(*) from public.litter_planning_models
    where library_model_code = ${q(unavailableLibraryModelCode)};
  `))).toBe(0);

  const replayed = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId,
      clientCommandId: command(1),
      selection: [...standardOnlySelection],
      isActive: true,
    },
    owner,
  );
  expect(replayed).toMatchObject({ outcome: "success", replayed: true });

  expect(
    await importLitterPlanningModelLibraryModelsCore(
      {
        organizationId,
        clientCommandId: command(1),
        selection: [...bothSelection].reverse(),
        isActive: true,
      },
      owner,
    ),
  ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

  const alreadyImported = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId,
      clientCommandId: command(21),
      selection: [{ code: "dog-gestation-standard", version: 1 }],
      isActive: true,
    },
    owner,
  );
  expect(alreadyImported).toMatchObject({
    outcome: "success",
    importedCount: 0,
    alreadyImportedCount: 1,
    models: [{ code: "dog-gestation-standard", state: "already_imported", modelId: standardModelId }],
  });

  const concurrent = await Promise.all([
    importLitterPlanningModelLibraryModelsCore(
      {
        organizationId,
        clientCommandId: command(22),
        selection: [...herpesOnlySelection],
        isActive: true,
      },
      owner,
    ),
    importLitterPlanningModelLibraryModelsCore(
      {
        organizationId,
        clientCommandId: command(23),
        selection: [...herpesOnlySelection],
        isActive: true,
      },
      secondOwner,
    ),
  ]);
  expect(concurrent.every((result) => result.outcome === "success")).toBe(true);
  expect(concurrent.map((result) =>
    result.outcome === "success" ? result.importedCount : -1,
  ).sort()).toEqual([0, 1]);
  const concurrentHerpesModelIds = concurrent.flatMap((result) =>
    result.outcome === "success" ? result.models.map((model) => model.modelId) : [],
  );
  expect(new Set(concurrentHerpesModelIds).size).toBe(1);
  const herpesModelId = concurrentHerpesModelIds[0];
  trackedModelIds.add(herpesModelId);
  for (const result of concurrent) {
    if (result.outcome === "success") {
      for (const template of result.elementaryTemplates) {
        trackedTemplateIds.add(template.templateId);
      }
    }
  }
  expect(mapOrgItemsToLibrarySummary(herpesModelId).slice(0, 14)).toEqual(standardLibraryItems);
  expect(mapOrgItemsToLibrarySummary(herpesModelId).slice(14)).toEqual(herpesExtraItems);

  const bothImported = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId,
      clientCommandId: command(3),
      selection: [...bothSelection],
      isActive: true,
    },
    owner,
  );
  expect(bothImported).toMatchObject({
    outcome: "success",
    importedCount: 0,
    alreadyImportedCount: 2,
    elementaryImportedCount: 0,
    elementaryAlreadyImportedCount: 16,
  });
  if (bothImported.outcome === "success") {
    expect(new Set(bothImported.elementaryTemplates.map((item) => item.code)).size).toBe(16);
  }
  expect(Number(sql(`
    select count(distinct library_template_code) from public.litter_care_task_templates
    where organization_id = ${q(organizationId)}::uuid
      and library_template_code = any(array[
        ${elementaryTemplateCodes.map((code) => q(code)).join(",")}
      ]);
  `))).toBe(16);

  const isolatedImport = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId: ids.otherOrganization,
      clientCommandId: command(24),
      selection: [{ code: "dog-gestation-standard", version: 1 }],
      isActive: true,
    },
    owner,
  );
  expect(isolatedImport).toMatchObject({ outcome: "error", error: { code: "not_found" } });

  expect(Number(sql(`
    select count(*) from public.litter_planning_models
    where organization_id = ${q(ids.otherOrganization)}::uuid
      and library_model_code is not null;
  `))).toBe(0);
  expect(Number(sql(`
    select count(*) from public.litter_planning_models
    where organization_id = ${q(organizationId)}::uuid
      and library_model_code in ('dog-gestation-standard', 'dog-gestation-herpesvirose');
  `))).toBe(2);

  const otherOrgImport = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId: ids.otherOrganization,
      clientCommandId: command(25),
      selection: [{ code: "dog-gestation-standard", version: 1 }],
      isActive: true,
    },
    admin,
  );
  expect(otherOrgImport).toMatchObject({ outcome: "error", error: { code: "not_found" } });

  sql(`
    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(`${prefix}26`)}::uuid, ${q(ids.otherOrganization)}::uuid,
      ${q(ids.adminUser)}::uuid, 'admin', 'active',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
  const otherOrgAdminImport = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId: ids.otherOrganization,
      clientCommandId: command(27),
      selection: [{ code: "dog-gestation-standard", version: 1 }],
      isActive: true,
    },
    admin,
  );
  expect(otherOrgAdminImport).toMatchObject({ outcome: "success", importedCount: 1 });
  if (otherOrgAdminImport.outcome === "success") {
    trackedModelIds.add(otherOrgAdminImport.models[0].modelId);
    for (const elementary of otherOrgAdminImport.elementaryTemplates) {
      trackedTemplateIds.add(elementary.templateId);
    }
  }

  for (const unauthorized of [member, viewer] as const) {
    expect(
      await importLitterPlanningModelLibraryModelsCore(
        {
          organizationId,
          clientCommandId: command(28),
          selection: [{ code: "dog-gestation-standard", version: 1 }],
          isActive: true,
        },
        unauthorized,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
  }
  expect(
    await importLitterPlanningModelLibraryModelsCore(
      {
        organizationId,
        clientCommandId: command(29),
        selection: [{ code: "dog-gestation-standard", version: 1 }],
        isActive: true,
      },
      inactive,
    ),
  ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

  const immutableOrigin = sql(`
    do \$\$
    begin
      update public.litter_planning_models
      set library_model_code = 'dog-gestation-herpesvirose',
          library_model_version = 1
      where id = ${q(standardModelId)}::uuid;
      raise exception 'expected immutable origin guard';
    exception
      when check_violation then
        if sqlerrm !~ 'litter planning model library origin is immutable' then
          raise;
        end if;
    end;
    \$\$;
  `);
  expect(immutableOrigin.trim()).toBe("DO");

  const libraryTitleBefore = JSON.parse(sql(`
    select json_build_object('title', title)::text
    from public.litter_planning_model_library_models
    where code = 'dog-gestation-standard' and version = 1;
  `));

  const standardModelBeforeReplace = await getLitterPlanningModelCore(
    standardModelId,
    owner,
  );
  expect(standardModelBeforeReplace).toMatchObject({ outcome: "success" });
  if (standardModelBeforeReplace.outcome !== "success") {
    throw new Error("standard model read failed");
  }

  const replaced = await replaceLitterPlanningModelCore(
    standardModelId,
    command(30),
    1,
    {
      title: `${fixtureNamePrefix} copie adaptée`,
      description: "Description adaptée.",
      species: "dog",
      breed: "Golden Retriever",
      items: standardModelBeforeReplace.model.items.map((item) => ({
        organizationTemplateId: item.organizationTemplateId,
        itemKind: item.itemKind,
        priority: item.priority,
        anchorType: item.anchorType,
        pointOffsetDays: item.pointOffsetDays ?? undefined,
        windowStartsOffsetDays: item.windowStartsOffsetDays ?? undefined,
        windowEndsOffsetDays: item.windowEndsOffsetDays ?? undefined,
        displayOrder: item.displayOrder,
        isRequired: item.isRequired,
        isSelectedByDefault: item.isSelectedByDefault,
      })),
    },
    owner,
  );
  expect(replaced).toMatchObject({ outcome: "success", revision: 2 });
  expect(JSON.parse(sql(`
    select json_build_object('title', title)::text
    from public.litter_planning_models where id = ${q(standardModelId)}::uuid;
  `))).toEqual({ title: `${fixtureNamePrefix} copie adaptée` });
  expect(JSON.parse(sql(`
    select json_build_object('title', title)::text
    from public.litter_planning_model_library_models
    where code = 'dog-gestation-standard' and version = 1;
  `))).toEqual(libraryTitleBefore);

  sql(`
    update public.litter_planning_model_library_models
    set is_available = false
    where code = 'dog-gestation-standard' and version = 1;
    insert into public.litter_planning_model_library_models (
      code, version, family_code, variant_code, title, description, species, breed, sort_order, is_available
    ) values (
      'dog-gestation-standard', 2, 'dog-gestation', 'standard',
      ${q(`${fixtureNamePrefix} standard v2`)}, null, 'dog', 'Golden Retriever', 10, true
    );
    insert into public.litter_planning_model_library_items (
      library_model_code, library_model_version, library_template_code, library_template_version,
      item_kind, priority, anchor_type, point_offset_days, point_local_time,
      window_starts_offset_days, window_starts_local_time,
      window_ends_offset_days, window_ends_local_time,
      display_order, is_required, is_selected_by_default
    ) select
      'dog-gestation-standard', 2, library_template_code, library_template_version,
      item_kind, priority, anchor_type, point_offset_days, point_local_time,
      window_starts_offset_days, window_starts_local_time,
      window_ends_offset_days, window_ends_local_time,
      display_order, is_required, is_selected_by_default
    from public.litter_planning_model_library_items
    where library_model_code = 'dog-gestation-standard' and library_model_version = 1;
  `);

  const versionTwoImport = await importLitterPlanningModelLibraryModelsCore(
    {
      organizationId,
      clientCommandId: command(31),
      selection: [{ code: "dog-gestation-standard", version: 2 }],
      isActive: false,
    },
    owner,
  );
  expect(versionTwoImport).toMatchObject({
    outcome: "success",
    importedCount: 1,
    models: [{ version: 2, state: "imported" }],
  });
  if (versionTwoImport.outcome !== "success") throw new Error("v2 import failed");
  const versionTwoModelId = versionTwoImport.models[0].modelId;
  trackedModelIds.add(versionTwoModelId);
  expect(versionTwoModelId).not.toBe(standardModelId);
  expect(Number(sql(`
    select count(*) from public.litter_planning_models
    where organization_id = ${q(organizationId)}::uuid
      and library_model_code = 'dog-gestation-standard';
  `))).toBe(2);

  const manualModel = await createLitterPlanningModelCore(
    organizationId,
    command(32),
    {
      title: `${fixtureNamePrefix} modèle manuel`,
      description: null,
      species: "dog",
      breed: "Golden Retriever",
      items: [
        {
          organizationTemplateId: ids.manualTemplate,
          itemKind: "task",
          priority: "normal",
          anchorType: "expected_birth",
          pointOffsetDays: 1,
          displayOrder: 0,
          isRequired: true,
          isSelectedByDefault: true,
        },
      ],
    },
    owner,
  );
  expect(manualModel).toMatchObject({ outcome: "success", revision: 1 });
  if (manualModel.outcome !== "success") throw new Error("manual model failed");
  trackedModelIds.add(manualModel.modelId);
  expect(JSON.parse(sql(`
    select json_build_object(
      'library_model_code', library_model_code,
      'library_model_version', library_model_version
    )::text
    from public.litter_planning_models where id = ${q(manualModel.modelId)}::uuid;
  `))).toEqual({ library_model_code: null, library_model_version: null });

  const applyStandard = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litterStandard,
    p_planning_model_id: standardModelId,
    p_client_command_id: command(40),
    p_expected_model_revision: 2,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applyStandard.error).toBeNull();
  expect(applyStandard.data?.[0]?.outcome).toBe("success");

  const applyHerpes = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litterHerpes,
    p_planning_model_id: herpesModelId,
    p_client_command_id: command(41),
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applyHerpes.error).toBeNull();
  expect(applyHerpes.data?.[0]?.outcome).toBe("success");

  const manualApply = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litterStandard,
    p_planning_model_id: manualModel.modelId,
    p_client_command_id: command(42),
    p_expected_model_revision: 1,
    p_expected_plan_revision: applyStandard.data?.[0]?.revision ?? null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(manualApply.error).toBeNull();
  expect(manualApply.data?.[0]?.outcome).toBe("success");

  const standardHerpesCodes = JSON.parse(sql(`
    select coalesce(json_agg(distinct template.library_template_code), '[]'::json)::text
    from public.litter_care_tasks task
    join public.litter_care_task_templates template
      on template.id = task.organization_template_id
    where task.litter_id = ${q(ids.litterStandard)}::uuid;
  `)) as string[];
  for (const code of herpesOnlyTemplateCodes) {
    expect(standardHerpesCodes).not.toContain(code);
  }

  const herpesWindows = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', template.library_template_code,
      'starts', task.suggested_starts_on,
      'ends', task.suggested_ends_on
    ) order by template.library_template_code), '[]'::json)::text
    from public.litter_care_tasks task
    join public.litter_care_task_templates template
      on template.id = task.organization_template_id
    where task.litter_id = ${q(ids.litterHerpes)}::uuid
      and template.library_template_code = any(array[
        ${herpesOnlyTemplateCodes.map((code) => q(code)).join(",")}
      ]);
  `)) as { code: string; starts: string; ends: string }[];
  expect(herpesWindows).toEqual([
    { code: "dog-herpesvirose-injection-1", starts: "2026-06-17", ends: "2026-06-20" },
    { code: "dog-herpesvirose-injection-2", starts: "2026-07-27", ends: "2026-08-03" },
  ]);

  const explicitOvulationAnchors = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', template.library_template_code,
      'source', item.anchor_resolution_source,
      'date', item.anchor_date_snapshot
    ) order by template.library_template_code), '[]'::json)::text
    from public.litter_plan_items item
    join public.litter_care_task_templates template
      on template.id = item.organization_template_id
    where item.litter_id = ${q(ids.litterStandard)}::uuid
      and template.library_template_code in (
        'dog-pregnancy-ultrasound', 'dog-plan-litter-count-xray'
      );
  `)) as { code: string; source: string; date: string }[];
  expect(explicitOvulationAnchors).toEqual([
    { code: "dog-plan-litter-count-xray", source: "estimated_ovulation", date: "2026-06-08" },
    { code: "dog-pregnancy-ultrasound", source: "estimated_ovulation", date: "2026-06-08" },
  ]);

  const matingFallbackAnchors = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', template.library_template_code,
      'source', item.anchor_resolution_source,
      'date', item.anchor_date_snapshot
    ) order by template.library_template_code), '[]'::json)::text
    from public.litter_plan_items item
    join public.litter_care_task_templates template
      on template.id = item.organization_template_id
    where item.litter_id = ${q(ids.litterHerpes)}::uuid
      and template.library_template_code in (
        'dog-pregnancy-ultrasound', 'dog-plan-litter-count-xray'
      );
  `)) as { code: string; source: string; date: string }[];
  expect(matingFallbackAnchors).toEqual([
    { code: "dog-plan-litter-count-xray", source: "first_mating_minus_24h", date: "2026-06-09" },
    { code: "dog-pregnancy-ultrasound", source: "first_mating_minus_24h", date: "2026-06-09" },
  ]);

  const foodPhases = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', template.library_template_code,
      'starts', task.suggested_starts_on,
      'ends', task.suggested_ends_on
    ) order by task.suggested_starts_on, template.library_template_code), '[]'::json)::text
    from public.litter_care_tasks task
    join public.litter_care_task_templates template
      on template.id = task.organization_template_id
    where task.litter_id = ${q(ids.litterStandard)}::uuid
      and template.library_template_code like 'dog-gestation-food%';
  `)) as { code: string; starts: string; ends: string }[];
  expect(foodPhases).toEqual([
    { code: "dog-gestation-food-transition", starts: "2026-07-15", ends: "2026-07-21" },
    { code: "dog-gestation-food-plus-10", starts: "2026-07-22", ends: "2026-07-28" },
    { code: "dog-gestation-food-plus-20", starts: "2026-07-29", ends: "2026-08-04" },
    { code: "dog-gestation-food-plus-40", starts: "2026-08-05", ends: "2026-08-10" },
  ]);

  const tempWindowTaskId = sql(`
    select task.id::text
    from public.litter_care_tasks task
    join public.litter_care_task_templates template
      on template.id = task.organization_template_id
    where task.litter_id = ${q(ids.litterStandard)}::uuid
      and template.library_template_code = 'dog-temperature-monitoring-period'
    limit 1;
  `);
  const libraryItemsBeforeReschedule = Number(sql(`
    select count(*) from public.litter_planning_model_library_items;
  `));
  const orgModelRevisionBefore = Number(sql(`
    select revision from public.litter_planning_models where id = ${q(standardModelId)}::uuid;
  `));

  const rescheduled = await rescheduleLitterCareTaskWindowCore(
    {
      taskId: tempWindowTaskId,
      clientCommandId: command(43),
      expectedRevisionNo: 0,
      retainedStartsOn: "2026-08-04",
      retainedStartsLocalTime: null,
      retainedEndsOn: "2026-08-09",
      retainedEndsLocalTime: null,
      timezoneName: null,
      reason: "Fenêtre retenue E2E",
    },
    owner,
  );
  expect(rescheduled).toMatchObject({ outcome: "success", revisionNo: 1 });
  expect(JSON.parse(sql(`
    select json_build_object(
      'retainedStart', retained_starts_on,
      'retainedEnd', retained_ends_on
    )::text
    from public.litter_care_tasks where id = ${q(tempWindowTaskId)}::uuid;
  `))).toEqual({ retainedStart: "2026-08-04", retainedEnd: "2026-08-09" });
  expect(Number(sql(`
    select count(*) from public.litter_planning_model_library_items;
  `))).toBe(libraryItemsBeforeReschedule);
  expect(Number(sql(`
    select revision from public.litter_planning_models where id = ${q(standardModelId)}::uuid;
  `))).toBe(orgModelRevisionBefore);

  sql(`
    delete from public.memberships where id = ${q(`${prefix}26`)}::uuid;
  `);
});

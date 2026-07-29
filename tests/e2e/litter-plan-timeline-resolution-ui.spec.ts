import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  createLitterPlanAdHocItem,
  type CreateLitterPlanAdHocItemResult,
} from "../../src/features/litter-journal/litter-plan-ad-hoc";
import type { LitterCareTaskCategory } from "../../src/features/litter-journal/litter-care-tasks";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(600_000);

type CreatedItem = Extract<
  CreateLitterPlanAdHocItemResult,
  { outcome: "success" }
>;

type TaskSnapshot = {
  status: string;
  revisionNo: number;
  resolvedAt: string | null;
  resolvedTimezoneName: string | null;
  resolutionNote: string | null;
  resolutionCommandId: string | null;
  programming: {
    source: string;
    organizationTemplateId: string | null;
    systemTemplateCode: string | null;
    anchorType: string | null;
    anchorDate: string | null;
    offsetDays: number | null;
    plannedFor: string | null;
    itemKind: string;
    suggestedFor: string | null;
    suggestedLocalTime: string | null;
    scheduledLocalTime: string | null;
    suggestedStartsOn: string | null;
    suggestedStartsLocalTime: string | null;
    suggestedEndsOn: string | null;
    suggestedEndsLocalTime: string | null;
    retainedStartsOn: string | null;
    retainedStartsLocalTime: string | null;
    retainedEndsOn: string | null;
    retainedEndsLocalTime: string | null;
    scheduleTimezoneName: string | null;
    scheduleSource: string;
    isScheduleLocked: boolean;
    scheduleLockedAt: string | null;
    scheduleLockedBy: string | null;
    litterPlanItemId: string | null;
    litterPlanSeriesId: string | null;
    recurrenceDayNo: number | null;
    slotNo: number | null;
  };
};

const prefix = "e7280002-0000-4000-8000-0000000000";
const like = "e7280002-%";
const ownerId = "10000000-0000-4000-8000-000000000001";

const ids = {
  organization: `${prefix}01`,
  mother: `${prefix}02`,
  litter: `${prefix}03`,
  ownerMembership: `${prefix}04`,
  member: `${prefix}05`,
  memberIdentity: `${prefix}06`,
  memberMembership: `${prefix}07`,
  viewer: `${prefix}08`,
  viewerIdentity: `${prefix}09`,
  viewerMembership: `${prefix}0a`,
  terminalCommand: `${prefix}0b`,
  pendingTemplate: `${prefix}0c`,
  pendingModel: `${prefix}0d`,
  pendingModelItem: `${prefix}0e`,
  uiOwner: `${prefix}0f`,
  uiOwnerIdentity: `${prefix}10`,
  uiOwnerMembership: `${prefix}11`,
  concurrentResolutionCommand: `${prefix}12`,
} as const;

const credentials = {
  owner: [
    "e7280002-owner@saasphase1.invalid",
    "E7280002-Owner!",
  ] as const,
  member: [
    "e7280002-member@saasphase1.invalid",
    "E7280002-Member!",
  ] as const,
  viewer: [
    "e7280002-viewer@saasphase1.invalid",
    "E7280002-Viewer!",
  ] as const,
};

const fixtureDefinitions = [
  ["done", "E7280002 réalisée", "milestone", false, "reproduction"],
  ["cancelled", "E7280002 annulée", "task", false, "maternal_health"],
  ["notApplicable", "E7280002 non applicable", "window", true, "maternal_feeding"],
  ["close", "E7280002 fermeture sans mutation", "task", false, "preparation"],
  ["detail", "E7280002 panneau détaillé", "task", false, "offspring_weight"],
  ["mobile", "E7280002 mobile", "task", false, "offspring_health"],
  ["member", "E7280002 membre", "task", false, "offspring_feeding"],
  ["terminal", "E7280002 terminal", "task", false, "socialization"],
  ["pending", "E7280002 attente ancre", "task", false, "veterinary"],
  ["missingTask", "E7280002 snapshot sans tâche", "task", false, "identification"],
] as const;

const resolutionRaceFixtureDefinitions = [
  ["doubleSubmit", "E7280002 double soumission", "task", false, "vaccination"],
  ["concurrent", "E7280002 concurrence", "task", false, "other"],
] as const;

type FixtureName = (typeof fixtureDefinitions)[number][0];
type FixtureMap = Record<FixtureName, CreatedItem>;
type ResolutionRaceFixtureName =
  (typeof resolutionRaceFixtureDefinitions)[number][0];
type ResolutionRaceFixtureMap = Record<ResolutionRaceFixtureName, CreatedItem>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

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
      ${q(userId)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${q(email)},
      extensions.crypt(${q(password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', ${q(displayName)}),
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data,
      provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid,
      ${q(email)},
      ${q(userId)}::uuid,
      jsonb_build_object(
        'sub', ${q(userId)},
        'email', ${q(email)},
        'email_verified', true,
        'phone_verified', false
      ),
      'email', now(), now()
    );
  `;
}

function growthCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'animals', (
          select count(*) from public.animals where id::text like 'd3c9%'
        ),
        'litters', (
          select count(*) from public.litters where id::text like 'd3c9%'
        ),
        'sessions', (
          select count(*) from public.whelping_sessions where id::text like 'd3c9%'
        ),
        'events', (
          select count(*) from public.whelping_events where id::text like 'd3c9%'
        ),
        'births', (
          select count(*) from public.whelping_births where id::text like 'd3c9%'
        ),
        'weighing', (
          select count(*) from public.litter_weighing_sessions where id::text like 'd3c9%'
        ),
        'measurements', (
          select count(*) from public.animal_weight_measurements where id::text like 'd3c9%'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function cleanup() {
  sql(`
    set session_replication_role = replica;

    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)}
         or task_id in (
           select id from public.litter_care_tasks
           where litter_id::text like ${q(like)}
         );

    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)}
         or task_id in (
           select id from public.litter_care_tasks
           where litter_id::text like ${q(like)}
         );

    delete from public.litter_plan_ad_hoc_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)};

    delete from public.litter_plan_series_materialization_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)};

    delete from public.litter_plan_series_state_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)};

    delete from public.litter_plan_anchor_recalculation_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)};

    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)};

    delete from public.litter_care_tasks
      where litter_id::text like ${q(like)}
         or resolution_command_id::text like ${q(like)};

    delete from public.litter_plan_series_time_slots
      where series_id in (
        select id from public.litter_plan_series
        where litter_id::text like ${q(like)}
      );

    delete from public.litter_plan_series
      where litter_id::text like ${q(like)};

    delete from public.litter_plan_items
      where litter_id::text like ${q(like)};

    delete from public.litter_plans
      where litter_id::text like ${q(like)};

    delete from public.litter_planning_model_items
      where model_id::text like ${q(like)};

    delete from public.litter_planning_models
      where id::text like ${q(like)};

    delete from public.litter_care_task_templates
      where id::text like ${q(like)};

    delete from public.litters
      where id::text like ${q(like)};

    delete from public.animals
      where id::text like ${q(like)};

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
      where id::text like ${q(like)}
         or organization_id::text like ${q(like)};
    alter table public.memberships enable trigger memberships_protect_owner;

    delete from public.profiles where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.organizations where id::text like ${q(like)};

    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'resolution_registry', (
          select count(*) from public.litter_care_tasks
          where resolution_command_id::text like ${q(like)}
        ),
        'ad_hoc_commands', (
          select count(*) from public.litter_plan_ad_hoc_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'schedule_commands', (
          select count(*) from public.litter_care_task_schedule_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'schedule_changes', (
          select count(*) from public.litter_care_task_schedule_changes
          where litter_id::text like ${q(like)}
        ),
        'series_materialization_commands', (
          select count(*)
          from public.litter_plan_series_materialization_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'series_state_commands', (
          select count(*) from public.litter_plan_series_state_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'anchor_recalculation_commands', (
          select count(*)
          from public.litter_plan_anchor_recalculation_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'application_commands', (
          select count(*) from public.litter_plan_application_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where litter_id::text like ${q(like)}
        ),
        'series_slots', (
          select count(*) from public.litter_plan_series_time_slots
          where series_id in (
            select id from public.litter_plan_series
            where litter_id::text like ${q(like)}
          )
        ),
        'series', (
          select count(*) from public.litter_plan_series
          where litter_id::text like ${q(like)}
        ),
        'items', (
          select count(*) from public.litter_plan_items
          where litter_id::text like ${q(like)}
        ),
        'plans', (
          select count(*) from public.litter_plans
          where litter_id::text like ${q(like)}
        ),
        'model_items', (
          select count(*) from public.litter_planning_model_items
          where model_id::text like ${q(like)}
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where id::text like ${q(like)}
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like ${q(like)}
        ),
        'litters', (
          select count(*) from public.litters where id::text like ${q(like)}
        ),
        'animals', (
          select count(*) from public.animals where id::text like ${q(like)}
        ),
        'memberships', (
          select count(*) from public.memberships
          where id::text like ${q(like)}
             or organization_id::text like ${q(like)}
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like ${q(like)}
        ),
        'identities', (
          select count(*) from auth.identities where user_id::text like ${q(like)}
        ),
        'users', (
          select count(*) from auth.users where id::text like ${q(like)}
        ),
        'organizations', (
          select count(*) from public.organizations where id::text like ${q(like)}
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function seedActorsAndLitter() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.organization)}::uuid,
      'E7280002 organisation',
      'e7280002-organisation'
    );

    ${authUserSql(
      ids.uiOwner,
      ids.uiOwnerIdentity,
      credentials.owner[0],
      credentials.owner[1],
      "E7280002 propriétaire",
    )}

    ${authUserSql(
      ids.member,
      ids.memberIdentity,
      credentials.member[0],
      credentials.member[1],
      "E7280002 membre",
    )}

    ${authUserSql(
      ids.viewer,
      ids.viewerIdentity,
      credentials.viewer[0],
      credentials.viewer[1],
      "E7280002 lecteur",
    )}

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid,
      ${q(ids.organization)}::uuid,
      'E7280002 mère',
      'dog',
      'Golden Retriever',
      'female',
      'breeding',
      'owned',
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id,
      status, mating_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid,
      ${q(ids.organization)}::uuid,
      'E7280002 portée',
      'dog',
      'Golden Retriever',
      ${q(ids.mother)}::uuid,
      'birth_expected',
      '2026-07-01',
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope,
      anchor_type, offset_days, species, revision, created_by, updated_by
    ) values (
      ${q(ids.pendingTemplate)}::uuid,
      ${q(ids.organization)}::uuid,
      'E7280002 modèle attente',
      'preparation',
      'litter',
      'actual_birth',
      0,
      'dog',
      1,
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.litter_planning_models (
      id, organization_id, title, species, breed,
      revision, created_by, updated_by
    ) values (
      ${q(ids.pendingModel)}::uuid,
      ${q(ids.organization)}::uuid,
      'E7280002 planning attente',
      'dog',
      'Golden Retriever',
      1,
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id,
      item_kind, priority, anchor_type, point_offset_days,
      display_order, is_required, is_selected_by_default,
      created_by, updated_by
    ) values (
      ${q(ids.pendingModelItem)}::uuid,
      ${q(ids.organization)}::uuid,
      ${q(ids.pendingModel)}::uuid,
      ${q(ids.pendingTemplate)}::uuid,
      'task',
      'normal',
      'actual_birth',
      0,
      0,
      false,
      false,
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status,
      created_by, updated_by
    ) values
      (
        ${q(ids.ownerMembership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(ownerId)}::uuid,
        'owner',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.uiOwnerMembership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(ids.uiOwner)}::uuid,
        'owner',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.memberMembership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(ids.member)}::uuid,
        'member',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.viewerMembership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(ids.viewer)}::uuid,
        'viewer',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      );
  `);
}

function pointItem(title: string, category: LitterCareTaskCategory) {
  return {
    version: 1 as const,
    kind: "task" as const,
    title,
    description: null,
    category,
    targetScope: "litter" as const,
    priority: "normal" as const,
    lockSchedule: false,
    scheduledDate: "2026-08-10",
    localTime: "09:00",
  };
}

function adHocItem(
  title: string,
  kind: "milestone" | "task" | "window",
  locked: boolean,
  category: LitterCareTaskCategory,
) {
  if (kind === "window") {
    return {
      version: 1 as const,
      kind,
      title,
      description: null,
      category,
      targetScope: "litter" as const,
      priority: "normal" as const,
      lockSchedule: locked,
      startsOn: "2026-08-10",
      endsOn: "2026-08-12",
      startsLocalTime: "08:00",
      endsLocalTime: "16:00",
    };
  }

  return {
    ...pointItem(title, category),
    kind,
    lockSchedule: locked,
  };
}

async function createPlanningFixtures(): Promise<FixtureMap> {
  const client = await createAuthenticatedSupabaseClient();
  const created = {} as FixtureMap;
  let expectedPlanRevision: number | null = null;

  for (const [index, definition] of fixtureDefinitions.entries()) {
    const [name, title, kind, locked, category] = definition;
    const result = await createLitterPlanAdHocItem(
      {
        litterId: ids.litter,
        clientCommandId: `${prefix}${String(20 + index).padStart(2, "0")}`,
        expectedPlanRevision,
        timezoneName: "Europe/Paris",
        item: adHocItem(title, kind, locked, category),
      },
      client,
    );

    if (result.outcome !== "success") {
      throw new Error(`Fixture ${name}: ${JSON.stringify(result)}`);
    }

    created[name] = result;
    expectedPlanRevision = result.planRevision;
  }

  return created;
}

async function createResolutionRaceFixtures(): Promise<ResolutionRaceFixtureMap> {
  const client = await createAuthenticatedSupabaseClient();
  const created = {} as ResolutionRaceFixtureMap;
  let expectedPlanRevision = Number(
    sql(`
      select revision
      from public.litter_plans
      where litter_id = ${q(ids.litter)}::uuid;
    `),
  );

  for (const [index, definition] of resolutionRaceFixtureDefinitions.entries()) {
    const [name, title, kind, locked, category] = definition;
    const result = await createLitterPlanAdHocItem(
      {
        litterId: ids.litter,
        clientCommandId: `${prefix}${String(30 + index).padStart(2, "0")}`,
        expectedPlanRevision,
        timezoneName: "Europe/Paris",
        item: adHocItem(title, kind, locked, category),
      },
      client,
    );

    if (result.outcome !== "success") {
      throw new Error(`Fixture ${name}: ${JSON.stringify(result)}`);
    }

    created[name] = result;
    expectedPlanRevision = result.planRevision;
  }

  return created;
}

function shapeSpecialFixtures(fixtures: FixtureMap) {
  sql(`
    update public.litter_care_tasks
    set
      status = 'done',
      resolution_command_id = ${q(ids.terminalCommand)}::uuid,
      resolved_at = '2026-08-15T10:30:00+02:00'::timestamptz,
      resolved_timezone_name = 'Europe/Paris',
      resolved_by = ${q(ownerId)}::uuid,
      resolution_note = 'fixture terminale',
      revision_no = revision_no + 1
    where id = ${q(fixtures.terminal.taskId!)}::uuid;

    set session_replication_role = replica;

    delete from public.litter_plan_ad_hoc_commands
    where task_id in (
      ${q(fixtures.pending.taskId!)}::uuid,
      ${q(fixtures.missingTask.taskId!)}::uuid
    );

    delete from public.litter_care_tasks
    where id in (
      ${q(fixtures.pending.taskId!)}::uuid,
      ${q(fixtures.missingTask.taskId!)}::uuid
    );

    set session_replication_role = origin;

    update public.litter_plan_items
    set
      origin_kind = 'planning_model',
      source_planning_model_id = ${q(ids.pendingModel)}::uuid,
      source_planning_model_revision = 1,
      source_model_item_id = ${q(ids.pendingModelItem)}::uuid,
      source_model_display_order = 0,
      organization_template_id = ${q(ids.pendingTemplate)}::uuid,
      anchor_type = 'actual_birth',
      materialization_state = 'pending_anchor',
      materialized_at = null,
      anchor_resolution_source = null,
      anchor_source_date_snapshot = null,
      anchor_adjustment_days = null,
      anchor_date_snapshot = null
    where id = ${q(fixtures.pending.litterPlanItemId)}::uuid;
  `);
}

async function login(
  page: Page,
  [email, password]: readonly [string, string],
) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 45_000,
  });
}

async function gotoJournal(page: Page) {
  await page.goto("/litters/journal", {
    waitUntil: "commit",
    timeout: 90_000,
  });
  await expect(
    page.getByRole("heading", {
      name: "Planning de la portée",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
}

function timeline(page: Page) {
  return page.getByRole("region", {
    name: "Planning de la portée",
    exact: true,
  });
}

function timelineCard(page: Page, title: string) {
  return page
    .locator("[data-timeline-item]")
    .filter({ has: page.getByText(title, { exact: true }) });
}

function detailedTask(page: Page, title: string) {
  return page
    .locator("#litter-care-tasks li")
    .filter({ has: page.getByText(title, { exact: true }) });
}

function taskSnapshot(taskId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'status', status,
        'revisionNo', revision_no,
        'resolvedAt', resolved_at,
        'resolvedTimezoneName', resolved_timezone_name,
        'resolutionNote', resolution_note,
        'resolutionCommandId', resolution_command_id,
        'programming', json_build_object(
          'source', source,
          'organizationTemplateId', organization_template_id,
          'systemTemplateCode', system_template_code,
          'anchorType', anchor_type,
          'anchorDate', anchor_date,
          'offsetDays', offset_days,
          'plannedFor', planned_for,
          'itemKind', item_kind,
          'suggestedFor', suggested_for,
          'suggestedLocalTime', suggested_local_time,
          'scheduledLocalTime', scheduled_local_time,
          'suggestedStartsOn', suggested_starts_on,
          'suggestedStartsLocalTime', suggested_starts_local_time,
          'suggestedEndsOn', suggested_ends_on,
          'suggestedEndsLocalTime', suggested_ends_local_time,
          'retainedStartsOn', retained_starts_on,
          'retainedStartsLocalTime', retained_starts_local_time,
          'retainedEndsOn', retained_ends_on,
          'retainedEndsLocalTime', retained_ends_local_time,
          'scheduleTimezoneName', schedule_timezone_name,
          'scheduleSource', schedule_source,
          'isScheduleLocked', is_schedule_locked,
          'scheduleLockedAt', schedule_locked_at,
          'scheduleLockedBy', schedule_locked_by,
          'litterPlanItemId', litter_plan_item_id,
          'litterPlanSeriesId', litter_plan_series_id,
          'recurrenceDayNo', recurrence_day_no,
          'slotNo', slot_no
        )
      )::text
      from public.litter_care_tasks
      where id = ${q(taskId)}::uuid;
    `),
  ) as TaskSnapshot;
}

function resolutionRegistryCount() {
  return Number(
    sql(`
      select count(*)
      from public.litter_care_tasks
      where litter_id = ${q(ids.litter)}::uuid
        and resolution_command_id is not null;
    `),
  );
}

async function openTimelineResolution(page: Page, title: string) {
  const item = timelineCard(page, title);
  await expect(item).toHaveCount(1);
  await item.scrollIntoViewIfNeeded();
  await item.getByRole("button", { name: "Traiter", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Traiter l’élément", exact: true }),
  ).toBeVisible();
  return dialog;
}

async function assertResolutionDialog(dialog: Locator) {
  await expect(dialog.locator("option")).toHaveText([
    "Réalisée",
    "Annulée",
    "Non applicable",
  ]);
  await expect(dialog.getByLabel("Date et heure de résolution")).not.toHaveValue(
    "",
  );
  await expect(dialog.getByLabel("Note (facultative)")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Annuler" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Valider le résultat" }),
  ).toBeVisible();
}

async function resolveFromTimeline(
  page: Page,
  title: string,
  status: "done" | "cancelled" | "not_applicable",
  note: string,
) {
  const dialog = await openTimelineResolution(page, title);
  await dialog.getByLabel("Résultat").selectOption(status);
  await dialog.getByLabel("Note (facultative)").fill(note);
  await dialog.getByRole("button", { name: "Valider le résultat" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    timeline(page)
      .getByRole("status")
      .filter({ hasText: "La tâche de suivi a été traitée." }),
  ).toHaveCount(1);
  await expect(
    timelineCard(page, title).getByRole("button", {
      name: "Traiter",
      exact: true,
    }),
  ).toHaveCount(0);
}

test("LITTER-TIMELINE-RESOLUTION-UI-01 — rôles, confidentialité, panneau détaillé, mobile et cleanup", async ({
  page,
}) => {
  page.setDefaultTimeout(15_000);
  const growthBefore = growthCounts();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let fixtures: FixtureMap | null = null;
  let resolutionRaceFixtures: ResolutionRaceFixtureMap | null = null;

  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} — ${
        request.failure()?.errorText ?? "échec"
      }`,
    );
  });

  try {
    await test.step("fixtures autosuffisantes", async () => {
      expect(growthBefore).toEqual({
        animals: 13,
        litters: 2,
        sessions: 2,
        events: 11,
        births: 9,
        weighing: 62,
        measurements: 286,
      });
      cleanup();
      seedActorsAndLitter();
      fixtures = await createPlanningFixtures();
      shapeSpecialFixtures(fixtures);
    });

    await test.step("owner : visibilité selon l’état de la frise", async () => {
      await login(page, credentials.owner);
      await gotoJournal(page);

      await expect(
        timelineCard(page, "E7280002 membre").getByRole("button", {
          name: "Traiter",
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(
        timelineCard(page, "E7280002 non applicable").getByRole("button", {
          name: "Traiter",
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(
        timeline(page).getByText("E7280002 terminal", { exact: true }),
      ).toHaveCount(0);
      await timeline(page)
        .getByLabel("Inclure les éléments traités", { exact: true })
        .check();
      await expect(
        timelineCard(page, "E7280002 terminal").getByRole("button", {
          name: "Traiter",
          exact: true,
        }),
      ).toHaveCount(0);
      await timeline(page)
        .getByLabel("Inclure les éléments traités", { exact: true })
        .uncheck();

      const pendingSection = timeline(page)
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "En attente d’une date de référence",
            exact: true,
          }),
        });
      await expect(pendingSection).toContainText("E7280002 attente ancre");
      await expect(pendingSection.getByRole("button", { name: "Traiter" })).toHaveCount(
        0,
      );

      const missingSection = timeline(page)
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "Éléments sans date exploitable",
            exact: true,
          }),
        });
      await expect(missingSection).toContainText("E7280002 snapshot sans tâche");
      await expect(missingSection.getByRole("button", { name: "Traiter" })).toHaveCount(
        0,
      );
    });

    await test.step("fermeture sans mutation ni commande", async () => {
      if (!fixtures) throw new Error("Fixtures indisponibles");

      const taskId = fixtures.close.taskId!;
      const before = taskSnapshot(taskId);
      const registryBefore = resolutionRegistryCount();
      const dialog = await openTimelineResolution(
        page,
        "E7280002 fermeture sans mutation",
      );

      await assertResolutionDialog(dialog);
      await dialog
        .getByLabel("Note (facultative)")
        .fill("Cette note ne doit pas être enregistrée");
      await dialog.getByRole("button", { name: "Annuler" }).click();
      await expect(dialog).toHaveCount(0);

      expect(taskSnapshot(taskId)).toEqual(before);
      expect(resolutionRegistryCount()).toBe(registryBefore);
    });

    await test.step("confidentialité ciblée du trigger et du dialogue", async () => {
      if (!fixtures) throw new Error("Fixtures indisponibles");

      const item = timelineCard(page, "E7280002 fermeture sans mutation");
      const trigger = item.getByRole("button", {
        name: "Traiter",
        exact: true,
      });
      const triggerHtml = await trigger.evaluate((element) => element.outerHTML);
      const dialog = await openTimelineResolution(
        page,
        "E7280002 fermeture sans mutation",
      );
      const dialogHtml = await dialog.evaluate((element) => element.outerHTML);
      const controlAttributes = await dialog
        .locator("input, textarea, select")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            tag: element.tagName,
            attributes: Object.fromEntries(
              Array.from(element.attributes).map((attribute) => [
                attribute.name,
                attribute.value,
              ]),
            ),
          })),
        );

      const forbiddenValues = [
        ids.litter,
        fixtures.close.litterPlanId,
        fixtures.close.litterPlanItemId,
        fixtures.close.taskId!,
        `${prefix}23`,
        "taskId",
        "clientCommandId",
        "expectedRevisionNo",
        "litterId",
        "litterPlanId",
        "litterPlanItemId",
      ];
      const inspected = [
        triggerHtml,
        dialogHtml,
        JSON.stringify(controlAttributes),
        page.url(),
      ].join("\n");

      for (const forbidden of forbiddenValues) {
        expect(inspected).not.toContain(forbidden);
      }

      const fieldNames = await dialog
        .locator("input[name], textarea[name], select[name]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("name")),
        );
      expect([...new Set(fieldNames)].sort()).toEqual([
        "resolution_note",
        "resolution_status",
        "resolved_at",
        "timezone_name",
      ]);

      await dialog.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("panneau détaillé extrait : fermeture puis résolution", async () => {
      if (!fixtures) throw new Error("Fixtures indisponibles");
      const task = detailedTask(page, "E7280002 panneau détaillé");
      await task.scrollIntoViewIfNeeded();

      await task
        .getByRole("button", { name: "Traiter la tâche", exact: true })
        .click();
      let dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Traiter la tâche", exact: true }),
      ).toBeVisible();
      const detailFieldIds = await dialog
        .locator("select[id], input[id], textarea[id]")
        .evaluateAll((elements) => elements.map((element) => element.id));
      await dialog.getByRole("button", { name: "Annuler" }).click();
      expect(taskSnapshot(fixtures.detail.taskId!).status).toBe("planned");

      const secondTask = detailedTask(
        page,
        "E7280002 fermeture sans mutation",
      );
      await secondTask
        .getByRole("button", { name: "Traiter la tâche", exact: true })
        .click();
      dialog = page.getByRole("dialog");
      const secondFieldIds = await dialog
        .locator("select[id], input[id], textarea[id]")
        .evaluateAll((elements) => elements.map((element) => element.id));
      await dialog.getByRole("button", { name: "Annuler" }).click();

      const allFieldIds = [...detailFieldIds, ...secondFieldIds];
      expect(detailFieldIds.length).toBeGreaterThan(0);
      expect(secondFieldIds.length).toBeGreaterThan(0);
      expect(new Set(allFieldIds).size).toBe(allFieldIds.length);

      await task
        .getByRole("button", { name: "Traiter la tâche", exact: true })
        .click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Résultat").selectOption("done");
      await dialog
        .getByLabel("Note (facultative)")
        .fill("Résolution depuis le panneau détaillé");
      await dialog.getByRole("button", { name: "Valider le résultat" }).click();
      await expect(dialog).toHaveCount(0);

      const panel = page.locator("#litter-care-tasks");
      await expect(
        panel
          .getByRole("status")
          .filter({ hasText: "La tâche de suivi a été traitée." }),
      ).toHaveCount(1);
      await expect(
        panel
          .getByRole("region", { name: "À faire" })
          .getByText("E7280002 panneau détaillé", { exact: true }),
      ).toHaveCount(0);
      const history = panel.getByRole("region", { name: "Historique" });
      await expect(history).toContainText("E7280002 panneau détaillé");
      await expect(history).toContainText("Réalisée");
      await expect(history).toContainText("Traitée le");
      await expect(history).toContainText(
        "Résolution depuis le panneau détaillé",
      );
    });

    await test.step("mobile 375 × 812 : dialogue réel et résolution", async () => {
      await page.setViewportSize({ width: 375, height: 812 });

      const item = timelineCard(page, "E7280002 mobile");
      await item.scrollIntoViewIfNeeded();
      const trigger = item.getByRole("button", {
        name: "Traiter",
        exact: true,
      });
      await expect(trigger).toBeVisible();
      await trigger.click();

      let dialog = page.getByRole("dialog");
      await assertResolutionDialog(dialog);
      await expect(dialog).toHaveCSS("overflow-y", "auto");
      await expect(dialog.getByRole("button", { name: "Annuler" })).toBeVisible();
      await dialog.getByRole("button", { name: "Annuler" }).click();
      await expect(dialog).toHaveCount(0);

      await trigger.click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Résultat").selectOption("done");
      await dialog
        .getByLabel("Note (facultative)")
        .fill("Résolution mobile réelle");
      await dialog.getByRole("button", { name: "Valider le résultat" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        timeline(page)
          .getByRole("status")
          .filter({ hasText: "La tâche de suivi a été traitée." }),
      ).toHaveCount(1);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });

    await test.step("trois résultats existants restent verts", async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await resolveFromTimeline(
        page,
        "E7280002 réalisée",
        "done",
        "note done",
      );
      await resolveFromTimeline(
        page,
        "E7280002 annulée",
        "cancelled",
        "note cancelled",
      );
      await resolveFromTimeline(
        page,
        "E7280002 non applicable",
        "not_applicable",
        "note NA",
      );
    });

    await test.step("fixtures dédiées aux courses de résolution", async () => {
      resolutionRaceFixtures = await createResolutionRaceFixtures();
      await page.reload({ waitUntil: "commit" });
      await expect(
        page.getByRole("heading", {
          name: "Planning de la portée",
          exact: true,
        }),
      ).toBeVisible();
    });

    await test.step("double soumission : une seule résolution autoritative", async () => {
      if (!resolutionRaceFixtures) {
        throw new Error("Fixtures de double soumission indisponibles");
      }

      const taskId = resolutionRaceFixtures.doubleSubmit.taskId!;
      const before = taskSnapshot(taskId);
      const registryBefore = resolutionRegistryCount();
      const localDateTime = "2026-08-20T14:35";
      const note = "Double soumission contrôlée";
      const browserResolution = await page.evaluate((value) => {
        return {
          iso: new Date(value).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
      }, localDateTime);

      expect(before).toMatchObject({
        status: "planned",
        resolutionCommandId: null,
        resolvedAt: null,
        resolvedTimezoneName: null,
        resolutionNote: null,
      });

      const dialog = await openTimelineResolution(
        page,
        "E7280002 double soumission",
      );
      await dialog.getByLabel("Résultat").selectOption("cancelled");
      await dialog
        .getByLabel("Date et heure de résolution")
        .fill(localDateTime);
      await dialog.getByLabel("Note (facultative)").fill(note);

      const submit = dialog.getByRole("button", {
        name: "Valider le résultat",
      });
      await submit.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });

      const pendingSubmit = dialog.getByRole("button", {
        name: "Traitement...",
      });
      if (await pendingSubmit.isVisible().catch(() => false)) {
        await expect(pendingSubmit).toBeDisabled();
      }
      await expect(dialog).toHaveCount(0);
      await expect(
        timeline(page)
          .getByRole("status")
          .filter({ hasText: "La tâche de suivi a été traitée." }),
      ).toHaveCount(1);

      const after = taskSnapshot(taskId);
      expect(after.status).toBe("cancelled");
      expect(after.revisionNo).toBe(before.revisionNo);
      expect(after.resolutionCommandId).not.toBeNull();
      expect(after.resolvedAt).not.toBeNull();
      expect(new Date(after.resolvedAt!).toISOString()).toBe(
        browserResolution.iso,
      );
      expect(after.resolvedTimezoneName).toBe(browserResolution.timezone);
      expect(after.resolutionNote).toBe(note);
      expect(after.programming).toEqual(before.programming);
      expect(resolutionRegistryCount()).toBe(registryBefore + 1);

      await page.reload({ waitUntil: "commit" });
      await expect(
        page.getByRole("heading", {
          name: "Planning de la portée",
          exact: true,
        }),
      ).toBeVisible();
      expect(taskSnapshot(taskId)).toEqual(after);
      await expect(
        timelineCard(page, "E7280002 double soumission").getByRole("button", {
          name: "Traiter",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        timeline(page)
          .getByRole("status")
          .filter({ hasText: "La tâche de suivi a été traitée." }),
      ).toHaveCount(0);
    });

    await test.step("concurrence : le dialogue obsolète préserve l’autorité", async () => {
      if (!resolutionRaceFixtures) {
        throw new Error("Fixtures de concurrence indisponibles");
      }

      const taskId = resolutionRaceFixtures.concurrent.taskId!;
      const before = taskSnapshot(taskId);
      const registryBefore = resolutionRegistryCount();
      const localNote = "Valeur locale conservée";
      const concurrentNote = "Valeur concurrente autoritative";
      const concurrentResolvedAt = "2026-08-22T10:15:00+02:00";
      const dialog = await openTimelineResolution(
        page,
        "E7280002 concurrence",
      );

      expect(before).toMatchObject({
        status: "planned",
        resolutionCommandId: null,
        resolvedAt: null,
        resolvedTimezoneName: null,
        resolutionNote: null,
      });
      await dialog.getByLabel("Résultat").selectOption("done");
      await dialog
        .getByLabel("Date et heure de résolution")
        .fill("2026-08-21T16:40");
      await dialog.getByLabel("Note (facultative)").fill(localNote);

      const secondClient = await createAuthenticatedSupabaseClient();
      const concurrentResult = await secondClient.rpc(
        "resolve_litter_care_task",
        {
          p_task_id: taskId,
          p_client_command_id: ids.concurrentResolutionCommand,
          p_resolution_status: "cancelled",
          p_resolved_at: concurrentResolvedAt,
          p_timezone_name: "Europe/Paris",
          p_resolution_note: concurrentNote,
        },
      );

      expect(concurrentResult.error).toBeNull();
      expect(concurrentResult.data).toEqual([
        expect.objectContaining({
          outcome: "success",
          task_id: taskId,
          status: "cancelled",
          replayed: false,
          reason: null,
        }),
      ]);

      const concurrent = taskSnapshot(taskId);
      expect(concurrent.status).toBe("cancelled");
      expect(concurrent.revisionNo).toBe(before.revisionNo);
      expect(concurrent.resolutionCommandId).toBe(
        ids.concurrentResolutionCommand,
      );
      expect(new Date(concurrent.resolvedAt!).toISOString()).toBe(
        new Date(concurrentResolvedAt).toISOString(),
      );
      expect(concurrent.resolvedTimezoneName).toBe("Europe/Paris");
      expect(concurrent.resolutionNote).toBe(concurrentNote);
      expect(concurrent.programming).toEqual(before.programming);
      expect(resolutionRegistryCount()).toBe(registryBefore + 1);

      await dialog
        .getByRole("button", { name: "Valider le résultat" })
        .click();

      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Note (facultative)")).toHaveValue(
        localNote,
      );
      const alert = dialog.getByRole("alert");
      await expect(alert).toHaveText("Cette tâche a déjà été traitée.");
      await expect(alert).not.toContainText(
        /supabase|postgres|postgrest|rpc|sqlstate/i,
      );
      await expect(
        timeline(page)
          .getByRole("status")
          .filter({ hasText: "La tâche de suivi a été traitée." }),
      ).toHaveCount(0);
      expect(taskSnapshot(taskId)).toEqual(concurrent);
      expect(resolutionRegistryCount()).toBe(registryBefore + 1);

      await page.reload({ waitUntil: "commit" });
      await expect(
        page.getByRole("heading", {
          name: "Planning de la portée",
          exact: true,
        }),
      ).toBeVisible();
      await timeline(page)
        .getByLabel("Inclure les éléments traités", { exact: true })
        .check();
      const item = timelineCard(page, "E7280002 concurrence");
      await expect(item).toContainText("Annulé");
      await expect(
        item.getByRole("button", { name: "Traiter", exact: true }),
      ).toHaveCount(0);
      const history = page
        .locator("#litter-care-tasks")
        .getByRole("region", { name: "Historique" });
      await expect(history).toContainText("E7280002 concurrence");
      await expect(history).toContainText("Annulée");
      await expect(history).toContainText(concurrentNote);
    });

    await test.step("member : dialogue réel et fermeture", async () => {
      await login(page, credentials.member);
      await gotoJournal(page);

      const dialog = await openTimelineResolution(page, "E7280002 membre");
      await assertResolutionDialog(dialog);
      await dialog.getByRole("button", { name: "Annuler" }).click();
      await expect(dialog).toHaveCount(0);
    });

    await test.step("viewer : frise strictement en lecture seule", async () => {
      await login(page, credentials.viewer);
      await gotoJournal(page);

      await expect(timeline(page)).toContainText("E7280002 membre");
      await expect(
        timeline(page).getByRole("button", { name: "Traiter", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        timeline(page).locator(
          'form input[name="resolved_at"], form select[name="resolution_status"], form textarea[name="resolution_note"]',
        ),
      ).toHaveCount(0);
    });
  } finally {
    cleanup();

    for (const [name, count] of Object.entries(remainingCounts())) {
      expect(count, `${name} doit être nettoyé physiquement`).toBe(0);
    }

    expect(growthCounts()).toEqual(growthBefore);
    expect({
      pageErrors,
      consoleErrors,
      failedRequests,
    }).toEqual({
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
    });
  }
});

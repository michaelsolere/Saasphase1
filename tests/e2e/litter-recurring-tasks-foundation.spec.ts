import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { listLitterCareTasksForLitterCore } from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

type Supabase = SupabaseClient<Database>;

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const prefix = "a7270001-0000-4000-8000-";
const like = `${prefix}%`;

const ids = {
  mother: `${prefix}000000000001`,
  litter: `${prefix}000000000002`,
  litterB: `${prefix}000000000003`,
  foreignOrg: `${prefix}000000000010`,
  foreignOwner: `${prefix}000000000011`,
  foreignIdentity: `${prefix}000000000012`,
  foreignMembership: `${prefix}000000000013`,
  foreignMother: `${prefix}000000000014`,
  foreignLitter: `${prefix}000000000015`,
  viewer: `${prefix}000000000020`,
  viewerIdentity: `${prefix}000000000021`,
  viewerMembership: `${prefix}000000000022`,
  inactive: `${prefix}000000000023`,
  inactiveIdentity: `${prefix}000000000024`,
  inactiveMembership: `${prefix}000000000025`,
  template: `${prefix}000000000030`,
  autonomousTemplate: `${prefix}000000000031`,
  model: `${prefix}000000000040`,
  maxModel: `${prefix}000000000041`,
  autonomousTask: `${prefix}000000000050`,
  applyCommand: `${prefix}000000000060`,
  applyMaxCommand: `${prefix}000000000061`,
  modelCommand: `${prefix}000000000062`,
  maxModelCommand: `${prefix}000000000063`,
  prolong1: `${prefix}000000000070`,
  prolong2: `${prefix}000000000071`,
  prolongReplay: `${prefix}000000000072`,
  prolongConflict: `${prefix}000000000073`,
  concurrentA: `${prefix}000000000074`,
  concurrentB: `${prefix}000000000075`,
  collisionMat: `${prefix}000000000076`,
  maxProlong: `${prefix}000000000077`,
  suspendCmd: `${prefix}000000000080`,
  resumeCmd: `${prefix}000000000081`,
  suspendMat: `${prefix}000000000082`,
  cancelCmd: `${prefix}000000000083`,
  naCmd: `${prefix}000000000084`,
  completeCmd: `${prefix}000000000085`,
  birthMat: `${prefix}000000000086`,
  resolveCmd: `${prefix}000000000090`,
  rescheduleCmd: `${prefix}000000000091`,
  lockCmd: `${prefix}000000000092`,
  recalcCmd: `${prefix}000000000093`,
  foreignApply: `${prefix}000000000094`,
  inactiveMat: `${prefix}000000000095`,
  viewerMat: `${prefix}000000000096`,
  fakeCollisionTask: `${prefix}0000000000a0`,
  pendingAnchorModelCmd: `${prefix}0000000000b0`,
  pendingApply: `${prefix}0000000000b1`,
  pendingMat: `${prefix}0000000000b2`,
  reconcileBirthMat: `${prefix}0000000000b3`,
  intervalModelCmd: `${prefix}0000000000c0`,
  intervalApply: `${prefix}0000000000c1`,
  intervalExt8: `${prefix}0000000000c2`,
  intervalExt8Replay: `${prefix}0000000000c3`,
  intervalExt10: `${prefix}0000000000c4`,
  suspendBirthMat: `${prefix}0000000000c5`,
  completedRepairMat: `${prefix}0000000000c6`,
  concurMatRecalcMat: `${prefix}0000000000d0`,
  concurMatRecalcRecalc: `${prefix}0000000000d1`,
  concurCancelRecalcCancel: `${prefix}0000000000d2`,
  concurCancelRecalcRecalc: `${prefix}0000000000d3`,
  concurMatStateMat: `${prefix}0000000000d4`,
  concurMatStateSuspend: `${prefix}0000000000d5`,
  absoluteMax5ModelCmd: `${prefix}0000000000e0`,
  absoluteMax5Apply: `${prefix}0000000000e1`,
  absoluteMax5Prolong: `${prefix}0000000000e2`,
  absoluteMax5Again: `${prefix}0000000000e3`,
  replayMatCmd: `${prefix}0000000000e4`,
  replaySuspendCmd: `${prefix}0000000000e5`,
} as const;

const CONCURRENT_RPC_TIMEOUT_MS = 15_000;

const credentials = {
  viewer: ["recurring-viewer@saasphase1.invalid", "RecurringE2E-2026!"] as const,
  inactive: ["recurring-inactive@saasphase1.invalid", "RecurringE2E-2026!"] as const,
  foreign: ["recurring-foreign@saasphase1.invalid", "RecurringE2E-2026!"] as const,
};

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cmd(n: number) {
  return `${prefix}00000000${(0x100 + n).toString(16).padStart(4, "0")}`;
}

function authUserSql(userId: string, identityId: string, email: string, password: string) {
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
      extensions.crypt(${q(password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Recurring E2E"}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object(
        'sub', ${q(userId)}, 'email', ${q(email)},
        'email_verified', true, 'phone_verified', false
      ),
      'email', now(), now()
    );
  `;
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)}
         or task_id in (select id from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)});
    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)}
         or client_command_id::text like ${q(like)}
         or task_id in (select id from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)});
    delete from public.litter_plan_series_materialization_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
      where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)});
    delete from public.litter_plan_series where litter_id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};
    with doomed_models as (
      select distinct model_id
      from public.litter_planning_model_commands
      where client_command_id::text like ${q(like)}
      union
      select id from public.litter_planning_models
      where title in ('Température maternelle série')
        and organization_id = ${q(org)}::uuid
        and created_at > now() - interval '1 day'
    ),
    del_slots as (
      delete from public.litter_planning_model_item_time_slots s
      using public.litter_planning_model_items i
      where i.id = s.model_item_id and i.model_id in (select model_id from doomed_models)
      returning 1
    ),
    del_items as (
      delete from public.litter_planning_model_items
      where model_id in (select model_id from doomed_models)
      returning 1
    ),
    del_commands as (
      delete from public.litter_planning_model_commands
      where client_command_id::text like ${q(like)}
         or model_id in (select model_id from doomed_models)
      returning 1
    ),
    del_models as (
      delete from public.litter_planning_models
      where id in (select model_id from doomed_models)
      returning 1
    )
    select
      (select count(*) from del_slots)
      + (select count(*) from del_items)
      + (select count(*) from del_commands)
      + (select count(*) from del_models);
    delete from public.litter_care_task_templates where id::text like ${q(like)};
    delete from public.maternal_observations where litter_id::text like ${q(like)};
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    delete from public.memberships where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)} or id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.profiles where id::text like ${q(like)};
    delete from public.organizations where id::text like ${q(like)};
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)}),
        'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where client_command_id::text like ${q(like)} or litter_id::text like ${q(like)}),
        'series_mat_commands', (select count(*) from public.litter_plan_series_materialization_commands where client_command_id::text like ${q(like)} or litter_id::text like ${q(like)}),
        'series_state_commands', (select count(*) from public.litter_plan_series_state_commands where client_command_id::text like ${q(like)} or litter_id::text like ${q(like)}),
        'recalc_commands', (select count(*) from public.litter_plan_anchor_recalculation_commands where client_command_id::text like ${q(like)} or litter_id::text like ${q(like)}),
        'apply_commands', (select count(*) from public.litter_plan_application_commands where client_command_id::text like ${q(like)} or litter_id::text like ${q(like)}),
        'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like ${q(like)} or id::text like ${q(like)}),
        'series_slots', (
          select count(*) from public.litter_plan_series_time_slots s
          where s.series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)})
        ),
        'series', (select count(*) from public.litter_plan_series where litter_id::text like ${q(like)}),
        'plan_items', (select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}),
        'plans', (select count(*) from public.litter_plans where litter_id::text like ${q(like)}),
        'model_slots', (
          select count(*) from public.litter_planning_model_item_time_slots s
          join public.litter_planning_model_items i on i.id = s.model_item_id
          join public.litter_planning_models m on m.id = i.model_id
          where m.title = 'Température maternelle série'
            and m.organization_id = ${q(org)}::uuid
        ),
        'model_commands', (select count(*) from public.litter_planning_model_commands where client_command_id::text like ${q(like)}),
        'model_items', (
          select count(*) from public.litter_planning_model_items i
          join public.litter_planning_models m on m.id = i.model_id
          where m.title = 'Température maternelle série'
            and m.organization_id = ${q(org)}::uuid
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where title = 'Température maternelle série'
            and organization_id = ${q(org)}::uuid
        ),
        'templates', (select count(*) from public.litter_care_task_templates where id::text like ${q(like)}),
        'maternal_obs', (select count(*) from public.maternal_observations where litter_id::text like ${q(like)}),
        'litters', (select count(*) from public.litters where id::text like ${q(like)}),
        'animals', (select count(*) from public.animals where id::text like ${q(like)}),
        'memberships', (select count(*) from public.memberships where id::text like ${q(like)}),
        'auth_identities', (select count(*) from auth.identities where user_id::text like ${q(like)}),
        'auth_users', (select count(*) from auth.users where id::text like ${q(like)}),
        'profiles', (select count(*) from public.profiles where id::text like ${q(like)}),
        'orgs', (select count(*) from public.organizations where id::text like ${q(like)})
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = remainingCounts();
  for (const [name, count] of Object.entries(counts)) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function writeSnapshot() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where litter_id=${q(ids.litter)}::uuid),
        'series_mat_commands', (select count(*) from public.litter_plan_series_materialization_commands where litter_id=${q(ids.litter)}::uuid),
        'series_state_commands', (select count(*) from public.litter_plan_series_state_commands where litter_id=${q(ids.litter)}::uuid),
        'recalc_commands', (select count(*) from public.litter_plan_anchor_recalculation_commands where litter_id=${q(ids.litter)}::uuid),
        'apply_commands', (select count(*) from public.litter_plan_application_commands where litter_id=${q(ids.litter)}::uuid),
        'tasks', (select count(*) from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid),
        'series', (select count(*) from public.litter_plan_series where litter_id=${q(ids.litter)}::uuid),
        'maternal_obs', (select count(*) from public.maternal_observations where litter_id=${q(ids.litter)}::uuid)
      )::text;
    `),
  ) as Record<string, number>;
}

async function authenticated(email: string, password: string) {
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (!signedIn.error) {
      return client;
    }
    lastError = signedIn.error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  expect(lastError, `auth failed for ${email}`).toBeNull();
  throw new Error(`Unable to authenticate ${email}: ${lastError?.message ?? "unknown"}`);
}

function temperatureItem(overrides: Record<string, unknown> = {}) {
  return {
    organizationTemplateId: ids.template,
    itemKind: "recurring_task",
    priority: "important",
    anchorType: "expected_birth",
    recurrenceKind: "daily_interval",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: -5,
    recurrenceEndKind: "actual_birth",
    initialMaterializationHorizonDays: 8,
    absoluteMaxOccurrences: 30,
    timeSlots: ["08:00", "20:00"],
    displayOrder: 0,
    isRequired: true,
    isSelectedByDefault: true,
    ...overrides,
  };
}

function seedBaseActorsAndLitter() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrg)}::uuid, 'Recurring foreign', 'a727-foreign-org');

    ${authUserSql(ids.viewer, ids.viewerIdentity, ...credentials.viewer)}
    ${authUserSql(ids.inactive, ids.inactiveIdentity, ...credentials.inactive)}
    ${authUserSql(ids.foreignOwner, ids.foreignIdentity, ...credentials.foreign)}

    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
    values
      (${q(ids.viewerMembership)}::uuid, ${q(org)}::uuid, ${q(ids.viewer)}::uuid, 'viewer', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid),
      (${q(ids.inactiveMembership)}::uuid, ${q(org)}::uuid, ${q(ids.inactive)}::uuid, 'member', 'disabled', ${q(owner)}::uuid, ${q(owner)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrg)}::uuid, ${q(ids.foreignOwner)}::uuid, 'owner', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid);

    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values
      (${q(ids.mother)}::uuid, ${q(org)}::uuid, 'Recurring mother', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(owner)}::uuid, ${q(owner)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.foreignOrg)}::uuid, 'Foreign mother', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(owner)}::uuid, ${q(owner)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, created_by, updated_by
    ) values
      (
        ${q(ids.litter)}::uuid, ${q(org)}::uuid, 'Recurring litter', 'dog', 'Golden Retriever',
        ${q(ids.mother)}::uuid, 'birth_expected', '2026-06-10', '2026-08-10',
        ${q(owner)}::uuid, ${q(owner)}::uuid
      ),
      (
        ${q(ids.litterB)}::uuid, ${q(org)}::uuid, 'Recurring litter B', 'dog', 'Golden Retriever',
        ${q(ids.mother)}::uuid, 'birth_expected', '2026-06-10', '2026-08-10',
        ${q(owner)}::uuid, ${q(owner)}::uuid
      ),
      (
        ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrg)}::uuid, 'Foreign litter', 'dog', 'Golden Retriever',
        ${q(ids.foreignMother)}::uuid, 'birth_expected', '2026-06-10', '2026-08-10',
        ${q(owner)}::uuid, ${q(owner)}::uuid
      );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, revision, created_by, updated_by
    ) values
      (
        ${q(ids.template)}::uuid, ${q(org)}::uuid, 'Surveillance température', 'other', 'mother',
        'expected_birth', -5, 'dog', 1, ${q(owner)}::uuid, ${q(owner)}::uuid
      ),
      (
        ${q(ids.autonomousTemplate)}::uuid, ${q(org)}::uuid, 'Tâche autonome legacy', 'other', 'litter',
        'expected_birth', 0, 'dog', 1, ${q(owner)}::uuid, ${q(owner)}::uuid
      );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no,
      category, target_scope, title, planned_for, item_kind, priority,
      suggested_for, schedule_source, creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.autonomousTask)}::uuid, ${q(org)}::uuid, ${q(ids.litter)}::uuid, 'manual',
      1, 'other', 'litter', 'Tâche autonome legacy', '2026-08-10', 'task', 'normal',
      '2026-08-10', 'manual', gen_random_uuid(), ${q(owner)}::uuid, ${q(owner)}::uuid
    );
  `);
}

async function createTemperatureModel(client: Supabase, commandId: string, itemOverrides: Record<string, unknown> = {}) {
  const result = await client.rpc("create_litter_planning_model", {
    p_organization_id: org,
    p_client_command_id: commandId,
    p_title: "Température maternelle série",
    p_description: null,
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: [temperatureItem(itemOverrides)] as unknown as Json,
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
  return result.data![0]!;
}

async function applyModel(client: Supabase, litterId: string, modelId: string, commandId: string) {
  const result = await client.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
    p_planning_model_id: modelId,
    p_client_command_id: commandId,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
  return result.data![0]!;
}

function seriesRow(litterId = ids.litter) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', s.id::text,
        'state', s.state,
        'revision', s.revision_no,
        'startsOn', s.starts_on,
        'endsOn', s.ends_on,
        'materializedThrough', s.materialized_through,
        'occurrenceCount', s.materialized_occurrence_count,
        'completionReason', s.completion_reason,
        'absoluteMax', s.absolute_max_occurrences,
        'horizon', s.initial_materialization_horizon_days,
        'planItemId', s.litter_plan_item_id::text,
        'litterPlanId', s.litter_plan_id::text,
        'planRevision', p.revision
      )::text
      from public.litter_plan_series s
      join public.litter_plans p on p.id = s.litter_plan_id
      where s.litter_id = ${q(litterId)}::uuid
      order by s.created_at
      limit 1;
    `),
  ) as {
    id: string;
    state: string;
    revision: number;
    startsOn: string;
    endsOn: string | null;
    materializedThrough: string | null;
    occurrenceCount: number;
    completionReason: string | null;
    absoluteMax: number;
    horizon: number;
    planItemId: string;
    litterPlanId: string;
    planRevision: number;
  };
}

function occurrences(seriesId: string) {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(json_build_object(
        'id', id::text,
        'day', recurrence_day_no,
        'slot', slot_no,
        'occurrenceNo', occurrence_no,
        'plannedFor', planned_for,
        'suggestedFor', suggested_for,
        'localTime', scheduled_local_time::text,
        'status', status,
        'scheduleSource', schedule_source,
        'locked', is_schedule_locked,
        'revision', revision_no,
        'itemKind', item_kind
      ) order by occurrence_no), '[]'::json)::text
      from public.litter_care_tasks
      where litter_plan_series_id = ${q(seriesId)}::uuid;
    `),
  ) as Array<{
    id: string;
    day: number;
    slot: number;
    occurrenceNo: number;
    plannedFor: string;
    suggestedFor: string;
    localTime: string;
    status: string;
    scheduleSource: string;
    locked: boolean;
    revision: number;
    itemKind: string;
  }>;
}

test.beforeEach(() => {
  cleanup();
  expectCleanupAtZero();
});

test.afterEach(() => {
  cleanup();
  expectCleanupAtZero();
});

test("fonde la série température : numérotation, horizon, prolongation, idempotence et collisions", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const ownerB = await createAuthenticatedSupabaseClient();

  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  const modelId = created.model_id!;
  await applyModel(ownerClient, ids.litter, modelId, ids.applyCommand);

  const series = seriesRow();
  expect(series).toMatchObject({
    startsOn: "2026-08-05",
    endsOn: null,
    materializedThrough: "2026-08-12",
    occurrenceCount: 16,
    state: "active",
    absoluteMax: 30,
    horizon: 8,
  });

  const occ = occurrences(series.id);
  expect(occ).toHaveLength(16);
  expect(occ.every((row) => row.itemKind === "recurring_task")).toBe(true);
  expect(occ[0]).toMatchObject({
    day: 1,
    slot: 1,
    occurrenceNo: 1,
    plannedFor: "2026-08-05",
    localTime: "08:00:00",
    status: "planned",
  });
  expect(occ[1]).toMatchObject({
    day: 1,
    slot: 2,
    occurrenceNo: 2,
    plannedFor: "2026-08-05",
    localTime: "20:00:00",
  });
  expect(occ[2]).toMatchObject({ day: 2, slot: 1, occurrenceNo: 3, plannedFor: "2026-08-06" });
  expect(occ[15]).toMatchObject({
    day: 8,
    slot: 2,
    occurrenceNo: 16,
    plannedFor: "2026-08-12",
    localTime: "20:00:00",
  });
  expect(occ.every((row) => row.plannedFor <= "2026-08-12")).toBe(true);
  expect(Number(sql(`select count(*) from public.litter_care_tasks where litter_plan_series_id=${q(series.id)}::uuid and planned_for > '2026-08-12';`))).toBe(0);
  expect(Number(sql(`select count(*) from public.maternal_observations where litter_id=${q(ids.litter)}::uuid;`))).toBe(0);

  const autonomousBefore = JSON.parse(
    sql(`
      select json_build_object(
        'plannedFor', planned_for,
        'scheduleSource', schedule_source,
        'status', status,
        'revision', revision_no,
        'seriesId', litter_plan_series_id
      )::text
      from public.litter_care_tasks where id=${q(ids.autonomousTask)}::uuid;
    `),
  );
  expect(autonomousBefore).toMatchObject({
    plannedFor: "2026-08-10",
    scheduleSource: "manual",
    status: "planned",
    seriesId: null,
  });

  const prolong = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.prolong1,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-14",
  });
  expect(prolong.error).toBeNull();
  expect(prolong.data?.[0]).toMatchObject({
    outcome: "success",
    replayed: false,
    inserted_count: 4,
  });
  expect(occurrences(series.id)).toHaveLength(20);
  expect(seriesRow().materializedThrough).toBe("2026-08-14");

  const replay = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.prolong1,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-14",
  });
  expect(replay.error).toBeNull();
  expect(replay.data?.[0]).toMatchObject({
    outcome: "success",
    replayed: true,
    inserted_count: 4,
  });
  expect(occurrences(series.id)).toHaveLength(20);

  const conflict = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.prolong1,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: "2026-08-15",
  });
  expect(conflict.error).toBeNull();
  expect(conflict.data?.[0]?.reason).toBe("client_command_conflict");
  expect(occurrences(series.id)).toHaveLength(20);

  const beforeConcurrent = seriesRow();
  const concurrent = await Promise.all([
    ownerClient.rpc("materialize_litter_plan_series", {
      p_series_id: series.id,
      p_client_command_id: ids.concurrentA,
      p_expected_revision_no: beforeConcurrent.revision,
      p_requested_through: "2026-08-15",
    }),
    ownerB.rpc("materialize_litter_plan_series", {
      p_series_id: series.id,
      p_client_command_id: ids.concurrentB,
      p_expected_revision_no: beforeConcurrent.revision,
      p_requested_through: "2026-08-15",
    }),
  ]);
  expect(concurrent.every((result) => result.error === null)).toBe(true);
  const successes = concurrent.filter((result) => result.data?.[0]?.outcome === "success");
  expect(successes.length).toBeGreaterThanOrEqual(1);
  expect(occurrences(series.id)).toHaveLength(22);
  expect(
    Number(
      sql(`
        select count(*) from public.litter_care_tasks
        where litter_plan_series_id=${q(series.id)}::uuid
          and recurrence_day_no=11 and slot_no=1;
      `),
    ),
  ).toBe(1);

  const nextDay = "2026-08-16";
  sql(`
    set session_replication_role = replica;
    insert into public.litter_care_tasks (
      id, organization_id, litter_id, litter_plan_item_id, litter_plan_series_id,
      source, organization_template_id, occurrence_no, recurrence_day_no, slot_no,
      category, target_scope, title, anchor_type, anchor_date, offset_days, planned_for,
      item_kind, priority, suggested_for, suggested_local_time, scheduled_local_time,
      schedule_timezone_name, schedule_source, creation_command_id, created_by, updated_by
    )
    select
      ${q(ids.fakeCollisionTask)}::uuid, organization_id, litter_id, litter_plan_item_id, id,
      'organization_template', ${q(ids.template)}::uuid, 999, 12, 1,
      'other', 'mother', 'collision', 'expected_birth', '2026-08-10', 6, ${q(nextDay)}::date,
      'recurring_task', 'important', ${q(nextDay)}::date, '08:00'::time, '08:00'::time,
      'Europe/Paris', 'suggested', gen_random_uuid(), ${q(owner)}::uuid, ${q(owner)}::uuid
    from public.litter_plan_series where id=${q(series.id)}::uuid;
    set session_replication_role = origin;
  `);

  const collision = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.collisionMat,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: nextDay,
  });
  expect(collision.error).toBeNull();
  expect(collision.data?.[0]).toMatchObject({ outcome: "error", reason: "schedule_collision" });
  expect(
    Number(
      sql(`
        select count(*) from public.litter_care_tasks
        where litter_plan_series_id=${q(series.id)}::uuid and recurrence_day_no=12 and slot_no=1;
      `),
    ),
  ).toBe(1);

  sql(`delete from public.litter_care_tasks where id=${q(ids.fakeCollisionTask)}::uuid;`);

  const libraryCounts = JSON.parse(
    sql(`
      select json_build_object(
        'standard', (
          select count(*) from public.litter_planning_model_library_items i
          join public.litter_planning_model_library_models m
            on m.code = i.library_model_code and m.version = i.library_model_version
          where m.code = 'dog-gestation-standard' and m.is_available
        ),
        'herpes', (
          select count(*) from public.litter_planning_model_library_items i
          join public.litter_planning_model_library_models m
            on m.code = i.library_model_code and m.version = i.library_model_version
          where m.code = 'dog-gestation-herpesvirose' and m.is_available
        )
      )::text;
    `),
  ) as { standard: number; herpes: number };
  if (libraryCounts.standard > 0 || libraryCounts.herpes > 0) {
    expect(libraryCounts.standard).toBe(14);
    expect(libraryCounts.herpes).toBe(16);
  }

  expect(JSON.parse(
    sql(`
      select json_build_object(
        'plannedFor', planned_for,
        'scheduleSource', schedule_source,
        'status', status,
        'revision', revision_no,
        'seriesId', litter_plan_series_id
      )::text
      from public.litter_care_tasks where id=${q(ids.autonomousTask)}::uuid;
    `),
  )).toEqual(autonomousBefore);
  expect(Number(sql(`select count(*) from public.maternal_observations where litter_id=${q(ids.litter)}::uuid;`))).toBe(0);
});

test("plafond absolu, suspend/resume, terminaux et actual_birth", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const created = await createTemperatureModel(ownerClient, ids.maxModelCommand, {
    absoluteMaxOccurrences: 20,
    initialMaterializationHorizonDays: 8,
  });
  await applyModel(ownerClient, ids.litterB, created.model_id!, ids.applyMaxCommand);
  let series = seriesRow(ids.litterB);
  expect(series.occurrenceCount).toBe(16);

  const maxProlong = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.maxProlong,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-25",
  });
  expect(maxProlong.error).toBeNull();
  expect(maxProlong.data?.[0]?.outcome).toBe("success");
  series = seriesRow(ids.litterB);
  expect(series.occurrenceCount).toBe(20);
  expect(series.state).toBe("completed");
  expect(series.completionReason).toBe("absolute_max_reached");
  // 20 occurrences / 2 slots → terminal day 10 from 2026-08-05 → 2026-08-14
  expect(series.materializedThrough).toBe("2026-08-14");
  expect(Number(sql(`select count(*) from public.litter_care_tasks where litter_plan_series_id=${q(series.id)}::uuid;`))).toBe(20);

  cleanup();
  expectCleanupAtZero();
  seedBaseActorsAndLitter();

  const created2 = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created2.model_id!, ids.applyCommand);
  series = seriesRow();
  const initialCount = series.occurrenceCount;

  const suspend = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.suspendCmd,
    p_expected_revision_no: series.revision,
    p_new_state: "suspended",
    p_reason: "pause monitoring",
  });
  expect(suspend.error).toBeNull();
  expect(suspend.data?.[0]).toMatchObject({ outcome: "success", series_state: "suspended" });

  const blocked = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.suspendMat,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: "2026-08-20",
  });
  expect(blocked.error).toBeNull();
  expect(blocked.data?.[0]?.reason).toBe("series_not_active");
  expect(occurrences(series.id)).toHaveLength(initialCount);

  const resume = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.resumeCmd,
    p_expected_revision_no: seriesRow().revision,
    p_new_state: "active",
    p_reason: null,
  });
  expect(resume.error).toBeNull();
  expect(resume.data?.[0]).toMatchObject({ outcome: "success", series_state: "active" });
  expect(occurrences(series.id)).toHaveLength(initialCount);
  expect(seriesRow().materializedThrough).toBe("2026-08-12");

  const cancel = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.cancelCmd,
    p_expected_revision_no: seriesRow().revision,
    p_new_state: "cancelled",
    p_reason: "stop",
  });
  expect(cancel.error).toBeNull();
  expect(cancel.data?.[0]).toMatchObject({ outcome: "success", series_state: "cancelled" });
  expect(occurrences(series.id).every((row) => row.status === "cancelled")).toBe(true);

  cleanup();
  expectCleanupAtZero();
  seedBaseActorsAndLitter();
  const created3 = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created3.model_id!, ids.applyCommand);
  series = seriesRow();

  const na = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.naCmd,
    p_expected_revision_no: series.revision,
    p_new_state: "not_applicable",
    p_reason: "protocol change",
  });
  expect(na.error).toBeNull();
  expect(na.data?.[0]).toMatchObject({ outcome: "success", series_state: "not_applicable" });
  expect(occurrences(series.id).every((row) => row.status === "not_applicable")).toBe(true);

  cleanup();
  expectCleanupAtZero();
  seedBaseActorsAndLitter();
  const created4 = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created4.model_id!, ids.applyCommand);
  series = seriesRow();

  const complete = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.completeCmd,
    p_expected_revision_no: series.revision,
    p_new_state: "completed",
    p_reason: "manual complete",
  });
  expect(complete.error).toBeNull();
  expect(complete.data?.[0]).toMatchObject({ outcome: "success", series_state: "completed" });
  expect(occurrences(series.id).every((row) => row.status === "planned")).toBe(true);

  cleanup();
  expectCleanupAtZero();
  seedBaseActorsAndLitter();
  const created5 = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created5.model_id!, ids.applyCommand);
  series = seriesRow();
  expect(series.endsOn).toBeNull();
  expect(series.occurrenceCount).toBe(16);

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-09'::date, updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);

  const birthMat = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.birthMat,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: "2026-08-20",
  });
  expect(birthMat.error).toBeNull();
  expect(birthMat.data?.[0], JSON.stringify(birthMat.data?.[0])).toMatchObject({ outcome: "success" });
  series = seriesRow();
  expect(series.state).toBe("completed");
  expect(series.completionReason).toBe("actual_birth_reached");
  expect(series.endsOn).toBe("2026-08-09");

  const afterBirth = occurrences(series.id);
  expect(afterBirth.filter((row) => row.plannedFor > "2026-08-09").every((row) => row.status === "not_applicable")).toBe(true);
  expect(afterBirth.filter((row) => row.plannedFor <= "2026-08-09").every((row) => row.status === "planned")).toBe(true);
  expect(afterBirth.every((row) => row.plannedFor <= "2026-08-12")).toBe(true);
  expect(Number(sql(`select count(*) from public.litter_care_tasks where litter_plan_series_id=${q(series.id)}::uuid and planned_for > '2026-08-09' and status='planned';`))).toBe(0);
  expect(Number(sql(`select count(*) from public.maternal_observations where litter_id=${q(ids.litter)}::uuid;`))).toBe(0);
});

test("active une série pending_anchor après naissance réelle via matérialisation explicite", async () => {
  seedBaseActorsAndLitter();
  sql(`
    update public.litters
    set actual_birth_date = null, updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.pendingAnchorModelCmd, {
    anchorType: "actual_birth",
    recurrenceStartsOffsetDays: 0,
    initialMaterializationHorizonDays: 7,
    timeSlots: ["08:00", "20:00"],
  });
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.pendingApply);

  const pendingItem = JSON.parse(
    sql(`
      select json_build_object(
        'materializationState', materialization_state,
        'anchorDate', anchor_date_snapshot
      )::text
      from public.litter_plan_items
      where litter_id = ${q(ids.litter)}::uuid
      order by display_order desc
      limit 1;
    `),
  ) as { materializationState: string; anchorDate: string | null };
  expect(pendingItem).toMatchObject({
    materializationState: "pending_anchor",
    anchorDate: null,
  });

  let series = seriesRow();
  expect(series.occurrenceCount).toBe(0);
  expect(occurrences(series.id)).toHaveLength(0);

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-10'::date,
        status = 'born',
        updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);

  const mat = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.pendingMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-16",
  });
  expect(mat.error).toBeNull();
  expect(mat.data?.[0]).toMatchObject({ outcome: "success" });

  const activatedItem = JSON.parse(
    sql(`
      select json_build_object(
        'materializationState', materialization_state,
        'anchorDate', anchor_date_snapshot
      )::text
      from public.litter_plan_items
      where id = ${q(series.planItemId)}::uuid;
    `),
  );
  expect(activatedItem).toMatchObject({
    materializationState: "materialized",
    anchorDate: "2026-08-10",
  });

  series = seriesRow();
  expect(series).toMatchObject({
    startsOn: "2026-08-10",
    materializedThrough: "2026-08-16",
    occurrenceCount: 14,
    state: "active",
  });

  const occ = occurrences(series.id);
  expect(occ[0]).toMatchObject({
    day: 1,
    slot: 1,
    occurrenceNo: 1,
    plannedFor: "2026-08-10",
  });
  expect(occ[13]).toMatchObject({
    day: 7,
    slot: 2,
    occurrenceNo: 14,
    plannedFor: "2026-08-16",
  });
});

test("réconcilie actual_birth sans faux no-op lorsque l'horizon couvre déjà la naissance", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  let series = seriesRow();
  expect(series.materializedThrough).toBe("2026-08-12");
  expect(series.occurrenceCount).toBe(16);

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-09'::date, updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);

  const birthMat = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.reconcileBirthMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-08",
  });
  expect(birthMat.error).toBeNull();
  expect(birthMat.data?.[0]?.outcome).toBe("success");
  expect(birthMat.data?.[0]?.result?.noop).not.toBe(true);

  series = seriesRow();
  expect(series).toMatchObject({
    state: "completed",
    completionReason: "actual_birth_reached",
    endsOn: "2026-08-09",
    materializedThrough: "2026-08-09",
  });

  const afterBirth = occurrences(series.id);
  expect(afterBirth.filter((row) => row.plannedFor > "2026-08-09").every((row) => row.status === "not_applicable")).toBe(true);
  expect(afterBirth.filter((row) => row.plannedFor === "2026-08-09").every((row) => row.status === "planned")).toBe(true);
  expect(afterBirth.filter((row) => row.plannedFor <= "2026-08-09").every((row) => row.status === "planned")).toBe(true);
  expect(Number(sql(`select count(*) from public.litter_care_tasks where litter_plan_series_id=${q(series.id)}::uuid and planned_for > '2026-08-09' and status='planned';`))).toBe(0);
});

test("résolution / report / verrou d'une occurrence et recalcul d'ancrage sans nouvelles occurrences", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();
  const occ = occurrences(series.id);
  const target = occ[3]!;
  const lockedTarget = occ[4]!;
  const manualTarget = occ[5]!;

  const resolved = await ownerClient.rpc("resolve_litter_care_task", {
    p_task_id: target.id,
    p_client_command_id: ids.resolveCmd,
    p_resolution_status: "done",
    p_resolved_at: "2026-08-06T10:00:00.000Z",
    p_timezone_name: "Europe/Paris",
    p_resolution_note: "ok",
  });
  expect(resolved.error).toBeNull();
  expect(resolved.data?.[0]).toMatchObject({ outcome: "success", status: "done" });

  const rescheduled = await ownerClient.rpc("reschedule_litter_care_task_point", {
    p_task_id: manualTarget.id,
    p_client_command_id: ids.rescheduleCmd,
    p_expected_revision_no: manualTarget.revision,
    p_planned_for: "2026-08-07",
    p_scheduled_local_time: "09:15",
    p_schedule_timezone_name: "Europe/Paris",
    p_reason: "vet visit",
  });
  expect(rescheduled.error).toBeNull();
  expect(rescheduled.data?.[0]?.outcome).toBe("success");

  const locked = await ownerClient.rpc("set_litter_care_task_schedule_lock", {
    p_task_id: lockedTarget.id,
    p_client_command_id: ids.lockCmd,
    p_expected_revision_no: lockedTarget.revision,
    p_is_locked: true,
    p_reason: "keep",
  });
  expect(locked.error).toBeNull();
  expect(locked.data?.[0]?.outcome).toBe("success");

  const countBeforeRecalc = Number(
    sql(`select count(*) from public.litter_care_tasks where litter_plan_series_id=${q(series.id)}::uuid;`),
  );
  const litterUpdatedAt = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const planRevision = seriesRow().planRevision;

  const recalc = await ownerClient.rpc("update_litter_gestation_anchors_and_recalculate_plan", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.recalcCmd,
    p_expected_litter_updated_at: litterUpdatedAt,
    p_expected_plan_revision: planRevision,
    p_estimated_ovulation_date: "2026-06-08",
    p_expected_birth_date: "2026-08-11",
  });
  expect(recalc.error).toBeNull();
  expect(recalc.data?.[0]?.outcome).toMatch(/success|updated|unchanged|recalculated/);

  const after = occurrences(series.id);
  expect(after).toHaveLength(countBeforeRecalc);
  expect(after.find((row) => row.id === target.id)?.status).toBe("done");
  expect(after.find((row) => row.id === manualTarget.id)).toMatchObject({
    scheduleSource: "manual",
    plannedFor: "2026-08-07",
  });
  expect(after.find((row) => row.id === lockedTarget.id)?.locked).toBe(true);

  const beforeReads = writeSnapshot();
  const listed = await listLitterCareTasksForLitterCore({ litterId: ids.litter }, ownerClient);
  expect(listed).toMatchObject({ outcome: "success" });
  if (listed.outcome === "success") {
    expect(listed.tasks.some((task) => task.itemKind === "recurring_task")).toBe(true);
  }
  const seriesSelect = await ownerClient.from("litter_plan_series").select("id,state").eq("id", series.id);
  expect(seriesSelect.error).toBeNull();
  expect(seriesSelect.data?.[0]?.state).toBeTruthy();
  expect(writeSnapshot()).toEqual(beforeReads);
  expect(Number(sql(`select count(*) from public.maternal_observations where litter_id=${q(ids.litter)}::uuid;`))).toBe(0);
});

test("isolement inter-org, membership inactive, viewer lecture seule et DML direct refusé", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const viewer = await authenticated(...credentials.viewer);
  const inactive = await authenticated(...credentials.inactive);
  const foreign = await authenticated(...credentials.foreign);

  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();

  const foreignApply = await foreign.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: created.model_id!,
    p_client_command_id: ids.foreignApply,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(foreignApply.error).toBeNull();
  expect(["not_found", "membership_required"]).toContain(foreignApply.data?.[0]?.reason ?? "");

  const inactiveMat = await inactive.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.inactiveMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-20",
  });
  expect(inactiveMat.error).toBeNull();
  expect(["not_found", "membership_required"]).toContain(inactiveMat.data?.[0]?.reason ?? "");

  const viewerSelect = await viewer.from("litter_plan_series").select("id,state").eq("id", series.id);
  expect(viewerSelect.error).toBeNull();
  expect(viewerSelect.data?.[0]?.id).toBe(series.id);

  const viewerMat = await viewer.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.viewerMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-20",
  });
  expect(viewerMat.error).toBeNull();
  expect(viewerMat.data?.[0]?.reason).toBe("membership_required");

  const viewerState = await viewer.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: cmd(2),
    p_expected_revision_no: series.revision,
    p_new_state: "suspended",
    p_reason: null,
  });
  expect(viewerState.error).toBeNull();
  expect(viewerState.data?.[0]?.reason).toBe("membership_required");

  const current = seriesRow();
  const insertSeries = await ownerClient.from("litter_plan_series").insert({
    organization_id: org,
    litter_id: ids.litter,
    litter_plan_id: current.litterPlanId,
    litter_plan_item_id: current.planItemId,
    recurrence_kind: "daily_interval",
    recurrence_interval_days: 1,
    end_kind: "actual_birth",
    initial_materialization_horizon_days: 8,
    absolute_max_occurrences: 30,
    timezone_name: "Europe/Paris",
    created_by: owner,
    updated_by: owner,
  } as never);
  expect(insertSeries.error).not.toBeNull();

  const insertSlot = await ownerClient.from("litter_plan_series_time_slots").insert({
    organization_id: org,
    series_id: series.id,
    slot_no: 9,
    local_time: "12:00",
    created_by: owner,
  } as never);
  expect(insertSlot.error).not.toBeNull();

  const insertMatCmd = await ownerClient.from("litter_plan_series_materialization_commands").insert({
    organization_id: org,
    litter_id: ids.litter,
    litter_plan_id: current.litterPlanId,
    series_id: series.id,
    client_command_id: cmd(3),
    payload: {},
    expected_revision_no: 1,
    requested_through: "2026-08-20",
    outcome: "success",
    created_by: owner,
  } as never);
  expect(insertMatCmd.error).not.toBeNull();

  expect(occurrences(series.id)).toHaveLength(16);
});

test("étend l'horizon civil sans occurrence intermédiaire puis no-op et création au 10 août", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.intervalModelCmd, {
    recurrenceIntervalDays: 3,
    recurrenceStartsOffsetDays: -9,
    initialMaterializationHorizonDays: 7,
    timeSlots: ["08:00", "20:00"],
  });
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.intervalApply);
  const series = seriesRow();
  expect(series.startsOn).toBe("2026-08-01");
  expect(series.materializedThrough).toBe("2026-08-07");
  const occ = occurrences(series.id);
  expect(occ).toHaveLength(6);
  expect([...new Set(occ.map((row) => row.plannedFor))].sort()).toEqual([
    "2026-08-01",
    "2026-08-04",
    "2026-08-07",
  ]);

  const revisionBefore = series.revision;
  const extend8 = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.intervalExt8,
    p_expected_revision_no: revisionBefore,
    p_requested_through: "2026-08-08",
  });
  expect(extend8.error).toBeNull();
  expect(extend8.data?.[0]).toMatchObject({
    outcome: "success",
    inserted_count: 0,
    materialized_through: "2026-08-08",
  });
  expect(seriesRow().revision).toBe(revisionBefore + 1);
  expect(occurrences(series.id)).toHaveLength(6);

  const replay8 = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.intervalExt8Replay,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: "2026-08-08",
  });
  expect(replay8.error).toBeNull();
  expect(replay8.data?.[0]?.result?.noop).toBe(true);
  expect(seriesRow().revision).toBe(revisionBefore + 1);

  const extend10 = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.intervalExt10,
    p_expected_revision_no: seriesRow().revision,
    p_requested_through: "2026-08-10",
  });
  expect(extend10.error).toBeNull();
  expect(extend10.data?.[0]?.inserted_count).toBe(2);
  expect(seriesRow().materializedThrough).toBe("2026-08-10");
  expect(occurrences(series.id).filter((row) => row.plannedFor === "2026-08-10")).toHaveLength(2);
});

test("réconcilie une série suspendue puis completed après naissance sans nouvelle occurrence", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  let series = seriesRow();
  await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.suspendCmd,
    p_expected_revision_no: series.revision,
    p_new_state: "suspended",
    p_reason: "pause",
  });
  series = seriesRow();
  expect(series.state).toBe("suspended");
  const countBefore = occurrences(series.id).length;

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-09'::date, updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);

  const mat = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.suspendBirthMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-08",
  });
  expect(mat.error).toBeNull();
  expect(mat.data?.[0]?.inserted_count).toBe(0);
  series = seriesRow();
  expect(series).toMatchObject({
    state: "completed",
    completionReason: "actual_birth_reached",
    endsOn: "2026-08-09",
    materializedThrough: "2026-08-09",
  });
  expect(occurrences(series.id)).toHaveLength(countBefore);
});

test("répare une série completed avec occurrences futures sans création", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  let series = seriesRow();
  await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.completeCmd,
    p_expected_revision_no: series.revision,
    p_new_state: "completed",
    p_reason: "manual",
  });
  series = seriesRow();
  expect(series.state).toBe("completed");
  const countBefore = occurrences(series.id).length;

  sql(`
    update public.litters
    set actual_birth_date = '2026-08-09'::date, updated_by = ${q(owner)}::uuid
    where id = ${q(ids.litter)}::uuid;
  `);

  const mat = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.completedRepairMat,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-08",
  });
  expect(mat.error).toBeNull();
  expect(mat.data?.[0]?.inserted_count).toBe(0);
  series = seriesRow();
  expect(series.state).toBe("completed");
  expect(series.endsOn).toBe("2026-08-09");
  expect(series.materializedThrough).toBe("2026-08-09");
  expect(occurrences(series.id)).toHaveLength(countBefore);
  expect(
    occurrences(series.id).filter((row) => row.plannedFor > "2026-08-09").every((row) => row.status === "not_applicable"),
  ).toBe(true);
});

async function raceWithTimeout<T>(label: string, racers: Promise<T>[]) {
  return Promise.race([
    Promise.all(racers),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} exceeded ${CONCURRENT_RPC_TIMEOUT_MS}ms`)), CONCURRENT_RPC_TIMEOUT_MS);
    }),
  ]);
}

test("concurrence matérialisation vs recalcul sans deadlock", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();
  const litterUpdatedAt = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);

  const results = await raceWithTimeout("mat vs recalc", [
    ownerClient.rpc("materialize_litter_plan_series", {
      p_series_id: series.id,
      p_client_command_id: ids.concurMatRecalcMat,
      p_expected_revision_no: series.revision,
      p_requested_through: "2026-08-14",
    }),
    ownerClient.rpc("update_litter_gestation_anchors_and_recalculate_plan", {
      p_litter_id: ids.litter,
      p_client_command_id: ids.concurMatRecalcRecalc,
      p_expected_litter_updated_at: litterUpdatedAt,
      p_expected_plan_revision: series.planRevision,
      p_estimated_ovulation_date: "2026-06-24",
      p_expected_birth_date: "2026-08-11",
    }),
  ]);

  expect(results.every((result) => result.error === null)).toBe(true);
  const outcomes = results.map((result) => result.data?.[0]?.outcome);
  expect(outcomes.filter((value) => value === "success").length).toBeGreaterThanOrEqual(1);
  expect(new Set(occurrences(series.id).map((row) => `${row.day}-${row.slot}`)).size).toBe(
    occurrences(series.id).length,
  );
});

test("concurrence annulation de série vs recalcul sans deadlock", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();
  const litterUpdatedAt = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);

  const results = await raceWithTimeout("cancel vs recalc", [
    ownerClient.rpc("set_litter_plan_series_state", {
      p_series_id: series.id,
      p_client_command_id: ids.concurCancelRecalcCancel,
      p_expected_revision_no: series.revision,
      p_new_state: "cancelled",
      p_reason: "stop",
    }),
    ownerClient.rpc("update_litter_gestation_anchors_and_recalculate_plan", {
      p_litter_id: ids.litter,
      p_client_command_id: ids.concurCancelRecalcRecalc,
      p_expected_litter_updated_at: litterUpdatedAt,
      p_expected_plan_revision: series.planRevision,
      p_estimated_ovulation_date: "2026-06-24",
      p_expected_birth_date: "2026-08-11",
    }),
  ]);

  expect(results.every((result) => result.error === null)).toBe(true);
});

test("concurrence matérialisation vs changement d'état sans deadlock", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();

  const results = await raceWithTimeout("mat vs state", [
    ownerClient.rpc("materialize_litter_plan_series", {
      p_series_id: series.id,
      p_client_command_id: ids.concurMatStateMat,
      p_expected_revision_no: series.revision,
      p_requested_through: "2026-08-14",
    }),
    ownerClient.rpc("set_litter_plan_series_state", {
      p_series_id: series.id,
      p_client_command_id: ids.concurMatStateSuspend,
      p_expected_revision_no: series.revision,
      p_new_state: "suspended",
      p_reason: "pause",
    }),
  ]);

  expect(results.every((result) => result.error === null)).toBe(true);
  const stale = results.filter((result) => result.data?.[0]?.reason === "stale_revision");
  expect(stale.length).toBeLessThanOrEqual(1);
});

test("plafond absolu partiel dans la journée borne materialized_through au jour terminal", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.absoluteMax5ModelCmd, {
    absoluteMaxOccurrences: 5,
    initialMaterializationHorizonDays: 2,
    recurrenceIntervalDays: 1,
    timeSlots: ["08:00", "20:00"],
  });
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.absoluteMax5Apply);
  let series = seriesRow();
  expect(series.occurrenceCount).toBe(4);
  expect(series.materializedThrough).toBe("2026-08-06");

  const prolong = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.absoluteMax5Prolong,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-30",
  });
  expect(prolong.error).toBeNull();
  expect(prolong.data?.[0]?.outcome).toBe("success");

  series = seriesRow();
  expect(series.occurrenceCount).toBe(5);
  expect(series.state).toBe("completed");
  expect(series.completionReason).toBe("absolute_max_reached");
  // ceil(5/2)=3 → 2026-08-05 + 2 = 2026-08-07
  expect(series.materializedThrough).toBe("2026-08-07");

  const occ = occurrences(series.id);
  expect(occ).toHaveLength(5);
  expect(occ[0]).toMatchObject({ day: 1, slot: 1, occurrenceNo: 1, plannedFor: "2026-08-05" });
  expect(occ[1]).toMatchObject({ day: 1, slot: 2, occurrenceNo: 2, plannedFor: "2026-08-05" });
  expect(occ[2]).toMatchObject({ day: 2, slot: 1, occurrenceNo: 3, plannedFor: "2026-08-06" });
  expect(occ[3]).toMatchObject({ day: 2, slot: 2, occurrenceNo: 4, plannedFor: "2026-08-06" });
  expect(occ[4]).toMatchObject({ day: 3, slot: 1, occurrenceNo: 5, plannedFor: "2026-08-07" });

  const blocked = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.absoluteMax5Again,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-09-01",
  });
  expect(blocked.error).toBeNull();
  expect(blocked.data?.[0]?.reason).toBe("series_not_active");
  expect(occurrences(series.id)).toHaveLength(5);
});

test("rejeu de matérialisation conserve series_state append-only après suspension", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const created = await createTemperatureModel(ownerClient, ids.modelCommand);
  await applyModel(ownerClient, ids.litter, created.model_id!, ids.applyCommand);
  const series = seriesRow();

  const first = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.replayMatCmd,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-14",
  });
  expect(first.error).toBeNull();
  expect(first.data?.[0]).toMatchObject({
    outcome: "success",
    replayed: false,
    series_state: "active",
  });
  const original = first.data![0]!;

  const suspend = await ownerClient.rpc("set_litter_plan_series_state", {
    p_series_id: series.id,
    p_client_command_id: ids.replaySuspendCmd,
    p_expected_revision_no: seriesRow().revision,
    p_new_state: "suspended",
    p_reason: "pause after mat",
  });
  expect(suspend.error).toBeNull();
  expect(suspend.data?.[0]?.series_state).toBe("suspended");
  expect(seriesRow().state).toBe("suspended");

  const replay = await ownerClient.rpc("materialize_litter_plan_series", {
    p_series_id: series.id,
    p_client_command_id: ids.replayMatCmd,
    p_expected_revision_no: series.revision,
    p_requested_through: "2026-08-14",
  });
  expect(replay.error).toBeNull();
  expect(replay.data?.[0]).toMatchObject({
    outcome: "success",
    replayed: true,
    series_state: "active",
    revision_no: original.revision_no,
    inserted_count: original.inserted_count,
    skipped_identical_count: original.skipped_identical_count,
    materialized_through: original.materialized_through,
    materialized_occurrence_count: original.materialized_occurrence_count,
  });
  expect(replay.data?.[0]?.result).toEqual(original.result);
  expect(seriesRow().state).toBe("suspended");
});

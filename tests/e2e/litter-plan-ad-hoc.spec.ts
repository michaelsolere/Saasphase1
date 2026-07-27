import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createLitterPlanAdHocItem,
  type CreateLitterPlanAdHocItemResult,
} from "../../src/features/litter-journal/litter-plan-ad-hoc";
import { listLitterCareTasksForLitterCore } from "../../src/features/litter-journal/litter-care-tasks-core";
import {
  applyLitterPlanningModel,
  materializeLitterPlanSeries,
} from "../../src/features/litter-journal/litter-plans-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

// LITTER-AD-HOC-PLANNING-01 — integrated Playwright E2E for direct ad-hoc
// programming of a litter plan (milestone/task/window/recurring_task),
// covering: absence/existing plan, periods, recurrence, locking,
// idempotence, concurrency, model coexistence, anchor recalculation,
// permissions and atomic validation.
//
// Isolated fixture prefix: e7270005-… (never touches growth-comparison/d3c9).

test.setTimeout(360_000);

type Supabase = SupabaseClient<Database>;

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";

const prefix = "e7270005-0000-4000-8000-0000000000";
const like = "e7270005-%";

const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,

  foreignOrg: `${prefix}10`,
  foreignOwner: `${prefix}11`,
  foreignIdentity: `${prefix}12`,
  foreignMembership: `${prefix}13`,

  viewer: `${prefix}20`,
  viewerIdentity: `${prefix}21`,
  viewerMembership: `${prefix}22`,
  member: `${prefix}23`,
  memberIdentity: `${prefix}24`,
  memberMembership: `${prefix}25`,

  template: `${prefix}30`,

  cmdMilestoneCreate: `${prefix}40`,
  cmdTaskOnExisting: `${prefix}41`,
  cmdWindowCreate: `${prefix}42`,
  cmdRecurringCreate: `${prefix}43`,
  cmdRecurringProlong: `${prefix}44`,
  cmdRecurringBlocked: `${prefix}45`,
  cmdLockCreate: `${prefix}46`,
  cmdRescheduleAttempt1: `${prefix}47`,
  cmdReplaceLockedAttempt: `${prefix}48`,
  cmdRescheduleAttempt2: `${prefix}49`,
  cmdIdempotent: `${prefix}4a`,
  cmdConcurrentA: `${prefix}4b`,
  cmdConcurrentB: `${prefix}4c`,
  modelCommandA: `${prefix}4d`,
  applyCommandA: `${prefix}4e`,
  adHocAfterModelCommand: `${prefix}4f`,
  adHocFirstCommand: `${prefix}50`,
  modelCommandB: `${prefix}51`,
  applyCommandB: `${prefix}52`,
  modelCommandRecalc: `${prefix}53`,
  applyCommandRecalc: `${prefix}54`,
  adHocRecalcCommand: `${prefix}55`,
  recalcCommand: `${prefix}56`,
  memberCreateCommand: `${prefix}57`,
  viewerCreateCommand: `${prefix}58`,
  foreignCreateCommand: `${prefix}59`,
  invalidWindowRpcCommand: `${prefix}5a`,
  invalidRecurrenceRpcCommand: `${prefix}5b`,
  duplicateSlotsRpcCommand: `${prefix}5c`,
  cmdConcurrencySetup: `${prefix}5d`,
  reapplyModelBCommand: `${prefix}5e`,
} as const;

const modelTitleA = "Modèle ad hoc E2E — coexistence A";
const modelTitleB = "Modèle ad hoc E2E — coexistence B";
const modelTitleRecalc = "Modèle ad hoc E2E — recalcul";
const modelTitles = [modelTitleA, modelTitleB, modelTitleRecalc];

const CONCURRENT_RPC_TIMEOUT_MS = 15_000;

const credentials = {
  viewer: ["adhoc-viewer@saasphase1.invalid", "AdHocE2E-2026!"] as const,
  member: ["adhoc-member@saasphase1.invalid", "AdHocE2E-2026!"] as const,
  foreign: ["adhoc-foreign@saasphase1.invalid", "AdHocE2E-2026!"] as const,
};

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const inList = (values: string[]) => values.map((value) => q(value)).join(", ");

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
      '{"display_name":"Ad Hoc E2E"}'::jsonb, now(), now()
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
    delete from public.litter_plan_ad_hoc_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
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
      where title in (${inList(modelTitles)})
        and organization_id = ${q(org)}::uuid
        and created_at > now() - interval '1 day'
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
      (select count(*) from del_items)
      + (select count(*) from del_commands)
      + (select count(*) from del_models);
    delete from public.litter_care_task_templates where id::text like ${q(like)};
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
        'ad_hoc_commands', (select count(*) from public.litter_plan_ad_hoc_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
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
        'model_commands', (select count(*) from public.litter_planning_model_commands where client_command_id::text like ${q(like)}),
        'model_items', (
          select count(*) from public.litter_planning_model_items i
          join public.litter_planning_models m on m.id = i.model_id
          where m.organization_id = ${q(org)}::uuid and m.title in (${inList(modelTitles)})
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where organization_id = ${q(org)}::uuid and title in (${inList(modelTitles)})
        ),
        'templates', (select count(*) from public.litter_care_task_templates where id::text like ${q(like)}),
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

async function allSettledWithTimeout<T>(label: string, promises: Promise<T>[]) {
  return Promise.race([
    Promise.allSettled(promises),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} exceeded ${CONCURRENT_RPC_TIMEOUT_MS}ms`)),
        CONCURRENT_RPC_TIMEOUT_MS,
      );
    }),
  ]);
}

function seedBaseActorsAndLitter(overrides: { expectedBirthDate?: string } = {}) {
  const expectedBirthDate = overrides.expectedBirthDate ?? "2026-08-10";
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrg)}::uuid, 'Ad hoc foreign', 'e727-adhoc-foreign-org');

    ${authUserSql(ids.viewer, ids.viewerIdentity, ...credentials.viewer)}
    ${authUserSql(ids.member, ids.memberIdentity, ...credentials.member)}
    ${authUserSql(ids.foreignOwner, ids.foreignIdentity, ...credentials.foreign)}

    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
    values
      (${q(ids.viewerMembership)}::uuid, ${q(org)}::uuid, ${q(ids.viewer)}::uuid, 'viewer', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(org)}::uuid, ${q(ids.member)}::uuid, 'member', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrg)}::uuid, ${q(ids.foreignOwner)}::uuid, 'owner', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid);

    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(org)}::uuid, 'Ad hoc mother', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(owner)}::uuid, ${q(owner)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(org)}::uuid, 'Ad hoc litter', 'dog', 'Golden Retriever',
      ${q(ids.mother)}::uuid, 'birth_expected', '2026-06-10', ${q(expectedBirthDate)}::date,
      ${q(owner)}::uuid, ${q(owner)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days,
      species, revision, created_by, updated_by
    ) values (
      ${q(ids.template)}::uuid, ${q(org)}::uuid, 'Modèle ad hoc gabarit', 'other', 'litter',
      'expected_birth', 0, 'dog', 1, ${q(owner)}::uuid, ${q(owner)}::uuid
    );
  `);
}

function planRow(litterId: string = ids.litter) {
  return JSON.parse(
    sql(`
      select coalesce(
        (
          select json_build_object(
            'id', id::text,
            'title', title,
            'revision', revision,
            'timezoneName', timezone_name,
            'status', status
          )
          from public.litter_plans
          where litter_id = ${q(litterId)}::uuid and status = 'active'
        ),
        'null'
      )::text;
    `),
  ) as { id: string; title: string; revision: number; timezoneName: string; status: string } | null;
}

function itemsRows(planId: string) {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(json_build_object(
        'id', id::text,
        'originKind', origin_kind,
        'itemKind', item_kind,
        'displayOrder', display_order,
        'revisionNo', revision_no,
        'sourcePlanningModelId', source_planning_model_id::text,
        'sourcePlanningModelRevision', source_planning_model_revision,
        'sourceModelItemId', source_model_item_id::text,
        'sourceModelDisplayOrder', source_model_display_order,
        'organizationTemplateId', organization_template_id::text,
        'anchorType', anchor_type,
        'anchorResolutionSource', anchor_resolution_source,
        'anchorSourceDateSnapshot', anchor_source_date_snapshot,
        'anchorAdjustmentDays', anchor_adjustment_days,
        'anchorDateSnapshot', anchor_date_snapshot,
        'materializationState', materialization_state,
        'materializedAt', materialized_at,
        'pointOffsetDays', point_offset_days,
        'pointLocalTime', point_local_time::text,
        'windowStartsOffsetDays', window_starts_offset_days,
        'windowStartsLocalTime', window_starts_local_time::text,
        'windowEndsOffsetDays', window_ends_offset_days,
        'windowEndsLocalTime', window_ends_local_time::text,
        'recurrenceIntervalDays', recurrence_interval_days,
        'recurrenceEndKind', recurrence_end_kind,
        'recurrenceEndsOffsetDays', recurrence_ends_offset_days,
        'recurrenceDayCount', recurrence_day_count,
        'initialHorizonDays', initial_materialization_horizon_days,
        'absoluteMaxOccurrences', absolute_max_occurrences
      ) order by display_order), '[]'::json)::text
      from public.litter_plan_items
      where litter_plan_id = ${q(planId)}::uuid;
    `),
  ) as Array<Record<string, unknown>>;
}

function taskRow(taskId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', id::text,
        'source', source,
        'litterPlanItemId', litter_plan_item_id::text,
        'litterPlanSeriesId', litter_plan_series_id::text,
        'organizationTemplateId', organization_template_id::text,
        'category', category,
        'targetScope', target_scope,
        'title', title,
        'description', description,
        'itemKind', item_kind,
        'priority', priority,
        'plannedFor', planned_for,
        'scheduledLocalTime', scheduled_local_time::text,
        'suggestedFor', suggested_for,
        'suggestedLocalTime', suggested_local_time::text,
        'retainedStartsOn', retained_starts_on,
        'retainedStartsLocalTime', retained_starts_local_time::text,
        'retainedEndsOn', retained_ends_on,
        'retainedEndsLocalTime', retained_ends_local_time::text,
        'scheduleSource', schedule_source,
        'isScheduleLocked', is_schedule_locked,
        'scheduleLockedBy', schedule_locked_by::text,
        'revisionNo', revision_no,
        'status', status
      )::text
      from public.litter_care_tasks
      where id = ${q(taskId)}::uuid;
    `),
  ) as Record<string, unknown>;
}

function seriesRowById(seriesId: string) {
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
        'recurrenceDayCount', s.recurrence_day_count,
        'planItemId', s.litter_plan_item_id::text,
        'litterPlanId', s.litter_plan_id::text
      )::text
      from public.litter_plan_series s
      where s.id = ${q(seriesId)}::uuid;
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
    recurrenceDayCount: number | null;
    planItemId: string;
    litterPlanId: string;
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
        'localTime', scheduled_local_time::text,
        'status', status,
        'scheduleSource', schedule_source,
        'locked', is_schedule_locked,
        'revision', revision_no
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
    localTime: string;
    status: string;
    scheduleSource: string;
    locked: boolean;
    revision: number;
  }>;
}

function litterCounts(litterId: string = ids.litter) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'plans', (select count(*) from public.litter_plans where litter_id = ${q(litterId)}::uuid),
        'items', (select count(*) from public.litter_plan_items where litter_id = ${q(litterId)}::uuid),
        'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(litterId)}::uuid),
        'series', (select count(*) from public.litter_plan_series where litter_id = ${q(litterId)}::uuid),
        'adHocCommands', (select count(*) from public.litter_plan_ad_hoc_commands where litter_id = ${q(litterId)}::uuid)
      )::text;
    `),
  ) as { plans: number; items: number; tasks: number; series: number; adHocCommands: number };
}

function milestonePayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "milestone",
    title: "Pesée de contrôle initiale",
    description: null,
    category: "offspring_weight",
    targetScope: "litter",
    priority: "normal",
    lockSchedule: false,
    scheduledDate: "2026-08-05",
    localTime: "08:00",
    ...overrides,
  };
}

function taskPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "task",
    title: "Contrôle vermifuge",
    description: "Suivi vermifuge de la mère",
    category: "veterinary",
    targetScope: "mother",
    priority: "important",
    lockSchedule: false,
    scheduledDate: "2026-08-06",
    localTime: "09:30",
    ...overrides,
  };
}

function windowPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "window",
    title: "Fenêtre de sevrage",
    description: null,
    category: "offspring_feeding",
    targetScope: "all_offspring",
    priority: "important",
    lockSchedule: false,
    startsOn: "2026-08-05",
    endsOn: "2026-08-12",
    startsLocalTime: "08:00",
    endsLocalTime: "18:00",
    ...overrides,
  };
}

function recurringPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "recurring_task",
    title: "Température quotidienne",
    description: null,
    category: "maternal_health",
    targetScope: "mother",
    priority: "organization_critical",
    lockSchedule: false,
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 40,
    timeSlots: ["08:00", "20:00"],
    ...overrides,
  };
}

async function createSimpleModel(
  client: Supabase,
  commandId: string,
  title: string,
  itemOverrides: Record<string, unknown> = {},
) {
  const result = await client.rpc("create_litter_planning_model", {
    p_organization_id: org,
    p_client_command_id: commandId,
    p_title: title,
    p_description: null,
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: [
      {
        organizationTemplateId: ids.template,
        itemKind: "task",
        priority: "normal",
        anchorType: "expected_birth",
        pointOffsetDays: 0,
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
        ...itemOverrides,
      },
    ] as unknown as Json,
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");
  return result.data![0]!;
}

async function applyModel(
  client: Supabase,
  litterId: string,
  modelId: string,
  commandId: string,
  expectedPlanRevision: number | null = null,
) {
  const result = await applyLitterPlanningModel(
    {
      litterId,
      planningModelId: modelId,
      clientCommandId: commandId,
      expectedModelRevision: 1,
      expectedPlanRevision,
      selectedModelItemIds: null,
      timezoneName: "Europe/Paris",
    },
    client,
  );
  expect(result.outcome, JSON.stringify(result)).toBe("success");
  return result;
}

function expectAdHocSuccess(
  result: CreateLitterPlanAdHocItemResult,
): asserts result is Extract<CreateLitterPlanAdHocItemResult, { outcome: "success" }> {
  expect(result.outcome, JSON.stringify(result)).toBe("success");
}

test.beforeEach(() => {
  cleanup();
  expectCleanupAtZero();
});

test.afterEach(() => {
  cleanup();
  expectCleanupAtZero();
});

// ---------------------------------------------------------------------------
// Absence de planning (1-8) + Planning existant (9-12)
// ---------------------------------------------------------------------------
test("programme un jalon direct sans planning existant puis une tâche additionnelle sur le planning créé", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  expect(planRow()).toBeNull();
  const modelsBefore = Number(
    sql(`select count(*) from public.litter_planning_models where organization_id=${q(org)}::uuid and title in (${inList(modelTitles)});`),
  );
  expect(modelsBefore).toBe(0);

  const milestone = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdMilestoneCreate,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: milestonePayload(),
    },
    ownerClient,
  );
  expectAdHocSuccess(milestone);
  expect(milestone.planRevision).toBe(1);
  expect(milestone.replayed).toBe(false);
  expect(milestone.seriesId).toBeNull();
  expect(milestone.taskId).not.toBeNull();
  expect(milestone.materializedOccurrenceCount).toBe(0);

  const plan = planRow();
  expect(plan).toMatchObject({
    id: milestone.litterPlanId,
    title: "Planning personnalisé",
    revision: 1,
    timezoneName: "Europe/Paris",
    status: "active",
  });

  let items = itemsRows(milestone.litterPlanId);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: milestone.litterPlanItemId,
    originKind: "ad_hoc",
    itemKind: "milestone",
    displayOrder: 0,
    revisionNo: 1,
    sourcePlanningModelId: null,
    sourcePlanningModelRevision: null,
    sourceModelItemId: null,
    sourceModelDisplayOrder: null,
    organizationTemplateId: null,
    anchorType: null,
    anchorResolutionSource: "manual_absolute",
    anchorSourceDateSnapshot: "2026-08-05",
    anchorAdjustmentDays: 0,
    anchorDateSnapshot: "2026-08-05",
    materializationState: "materialized",
    pointOffsetDays: 0,
    pointLocalTime: "08:00:00",
  });
  expect(items[0]!.materializedAt).not.toBeNull();

  const milestoneTask = taskRow(milestone.taskId!);
  expect(milestoneTask).toMatchObject({
    source: "manual",
    litterPlanItemId: milestone.litterPlanItemId,
    litterPlanSeriesId: null,
    organizationTemplateId: null,
    category: "offspring_weight",
    targetScope: "litter",
    itemKind: "milestone",
    priority: "normal",
    plannedFor: "2026-08-05",
    scheduledLocalTime: "08:00:00",
    scheduleSource: "manual",
    isScheduleLocked: false,
    status: "planned",
  });

  // 9-12: adding a direct task on an existing ad-hoc plan bumps the revision
  // by exactly one and keeps a continuous display order on the same plan.
  const task = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdTaskOnExisting,
      expectedPlanRevision: 1,
      timezoneName: "Europe/Paris",
      item: taskPayload(),
    },
    ownerClient,
  );
  expectAdHocSuccess(task);
  expect(task.litterPlanId).toBe(milestone.litterPlanId);
  expect(task.planRevision).toBe(2);
  expect(task.seriesId).toBeNull();

  expect(planRow()).toMatchObject({ id: milestone.litterPlanId, revision: 2 });

  items = itemsRows(milestone.litterPlanId);
  expect(items).toHaveLength(2);
  expect(items.map((row) => row.displayOrder)).toEqual([0, 1]);
  expect(items[1]).toMatchObject({
    id: task.litterPlanItemId,
    originKind: "ad_hoc",
    itemKind: "task",
    displayOrder: 1,
  });

  const taskTask = taskRow(task.taskId!);
  expect(taskTask).toMatchObject({
    category: "veterinary",
    targetScope: "mother",
    plannedFor: "2026-08-06",
    scheduledLocalTime: "09:30:00",
  });

  const modelsAfter = Number(
    sql(`select count(*) from public.litter_planning_models where organization_id=${q(org)}::uuid and title in (${inList(modelTitles)});`),
  );
  expect(modelsAfter).toBe(0);
});

// ---------------------------------------------------------------------------
// Période (13-16)
// ---------------------------------------------------------------------------
test("programme une fenêtre ad hoc avec bornes exactes, cohérence de la tâche et visibilité via le core", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const result = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdWindowCreate,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: windowPayload(),
    },
    ownerClient,
  );
  expectAdHocSuccess(result);
  expect(result.seriesId).toBeNull();
  expect(result.taskId).not.toBeNull();

  const items = itemsRows(result.litterPlanId);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    itemKind: "window",
    originKind: "ad_hoc",
    anchorDateSnapshot: "2026-08-05",
    windowStartsOffsetDays: 0,
    windowStartsLocalTime: "08:00:00",
    windowEndsOffsetDays: 7,
    windowEndsLocalTime: "18:00:00",
  });

  const windowTask = taskRow(result.taskId!);
  expect(windowTask).toMatchObject({
    itemKind: "window",
    category: "offspring_feeding",
    targetScope: "all_offspring",
    scheduleSource: "manual",
    retainedStartsOn: "2026-08-05",
    retainedStartsLocalTime: "08:00:00",
    retainedEndsOn: "2026-08-12",
    retainedEndsLocalTime: "18:00:00",
    plannedFor: null,
    suggestedFor: null,
  });

  const listed = await listLitterCareTasksForLitterCore({ litterId: ids.litter }, ownerClient);
  expect(listed.outcome).toBe("success");
  if (listed.outcome === "success") {
    const match = listed.tasks.find((row) => row.id === result.taskId);
    expect(match).toBeTruthy();
    expect(match?.itemKind).toBe("window");
  }
});

// ---------------------------------------------------------------------------
// Récurrence (17-22)
// ---------------------------------------------------------------------------
test("matérialise une série ad hoc quotidienne finie, déterministe, avec horizon, prolongation et plafond respecté", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const result = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdRecurringCreate,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: recurringPayload(),
    },
    ownerClient,
  );
  expectAdHocSuccess(result);
  expect(result.seriesId).not.toBeNull();
  expect(result.taskId).toBeNull();
  expect(result.materializedOccurrenceCount).toBe(60);

  const items = itemsRows(result.litterPlanId);
  expect(items[0]).toMatchObject({
    itemKind: "recurring_task",
    originKind: "ad_hoc",
    anchorDateSnapshot: "2026-08-01",
    recurrenceIntervalDays: 1,
    recurrenceEndKind: "fixed_recurrence_day_count",
    recurrenceDayCount: 40,
    initialHorizonDays: 30,
    absoluteMaxOccurrences: 80,
  });

  let series = seriesRowById(result.seriesId!);
  expect(series).toMatchObject({
    startsOn: "2026-08-01",
    endsOn: "2026-09-09",
    materializedThrough: "2026-08-30",
    occurrenceCount: 60,
    state: "active",
    absoluteMax: 80,
    horizon: 30,
    recurrenceDayCount: 40,
  });

  let occ = occurrences(series.id);
  expect(occ).toHaveLength(60);
  for (const row of occ) {
    expect(row.occurrenceNo).toBe((row.day - 1) * 2 + row.slot);
    expect(row.scheduleSource).toBe("manual");
    expect(row.locked).toBe(false);
  }
  expect(occ[0]).toMatchObject({ day: 1, slot: 1, occurrenceNo: 1, plannedFor: "2026-08-01", localTime: "08:00:00" });
  expect(occ[1]).toMatchObject({ day: 1, slot: 2, occurrenceNo: 2, plannedFor: "2026-08-01", localTime: "20:00:00" });
  expect(occ[59]).toMatchObject({ day: 30, slot: 2, occurrenceNo: 60, plannedFor: "2026-08-30", localTime: "20:00:00" });

  // Existing prolongation via the TS core wrapper still works past the initial horizon.
  const prolong = await materializeLitterPlanSeries(
    {
      seriesId: series.id,
      clientCommandId: ids.cmdRecurringProlong,
      expectedRevisionNo: series.revision,
      requestedThrough: "2026-09-09",
    },
    ownerClient,
  );
  expect(prolong.outcome, JSON.stringify(prolong)).toBe("success");
  if (prolong.outcome === "success") {
    expect(prolong.insertedCount).toBe(20);
    expect(prolong.seriesState).toBe("completed");
    expect(prolong.materializedOccurrenceCount).toBe(80);
  }

  series = seriesRowById(series.id);
  expect(series).toMatchObject({
    occurrenceCount: 80,
    materializedThrough: "2026-09-09",
    state: "completed",
    completionReason: "absolute_max_reached",
  });

  occ = occurrences(series.id);
  expect(occ).toHaveLength(80);
  expect(occ[79]).toMatchObject({ day: 40, slot: 2, occurrenceNo: 80, plannedFor: "2026-09-09" });

  // Occurrence ceiling respected: the series is completed and no further
  // materialization is accepted beyond the absolute max.
  const blocked = await materializeLitterPlanSeries(
    {
      seriesId: series.id,
      clientCommandId: ids.cmdRecurringBlocked,
      expectedRevisionNo: series.revision,
      requestedThrough: "2026-12-31",
    },
    ownerClient,
  );
  expect(blocked.outcome).toBe("error");
  if (blocked.outcome === "error") {
    expect(blocked.error.code).toBe("series_not_active");
  }
  expect(occurrences(series.id)).toHaveLength(80);
});

// ---------------------------------------------------------------------------
// Verrouillage (23-25)
// ---------------------------------------------------------------------------
test("verrouille un point ad hoc à la création : le remplacement de planning locked reste obligatoire", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const created = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdLockCreate,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: taskPayload({ title: "Injection vermifuge verrouillée", lockSchedule: true, scheduledDate: "2026-08-05", localTime: "09:00" }),
    },
    ownerClient,
  );
  expectAdHocSuccess(created);
  const taskId = created.taskId!;

  let row = taskRow(taskId);
  expect(row).toMatchObject({ isScheduleLocked: true, plannedFor: "2026-08-05", scheduledLocalTime: "09:00:00" });
  expect(row.scheduleLockedBy).toBe(owner);
  const initialRevision = row.revisionNo as number;

  const blockedReschedule = await ownerClient.rpc("reschedule_litter_care_task_point", {
    p_task_id: taskId,
    p_client_command_id: ids.cmdRescheduleAttempt1,
    p_expected_revision_no: initialRevision,
    p_planned_for: "2026-08-09",
    p_scheduled_local_time: "10:00:00",
    p_schedule_timezone_name: "Europe/Paris",
    p_reason: "sans override",
  });
  expect(blockedReschedule.error).toBeNull();
  expect(blockedReschedule.data?.[0]?.outcome).toBe("error");
  expect(blockedReschedule.data?.[0]?.reason).toBe("schedule_locked");
  expect(taskRow(taskId)).toMatchObject({ plannedFor: "2026-08-05", revisionNo: initialRevision });

  const override = await ownerClient.rpc("replace_locked_litter_care_task_point_schedule", {
    p_task_id: taskId,
    p_client_command_id: ids.cmdReplaceLockedAttempt,
    p_expected_revision_no: initialRevision,
    p_planned_for: "2026-08-09",
    p_scheduled_local_time: "10:00:00",
    p_schedule_timezone_name: "Europe/Paris",
    p_reason: "avec override",
  });
  expect(override.error).toBeNull();
  expect(override.data?.[0]?.outcome).toBe("success");

  row = taskRow(taskId);
  expect(row).toMatchObject({ plannedFor: "2026-08-09", scheduledLocalTime: "10:00:00", isScheduleLocked: true });
  const revisionAfterOverride = row.revisionNo as number;
  expect(revisionAfterOverride).toBeGreaterThan(initialRevision);

  // Locking persists: a subsequent non-override reschedule is still refused.
  const blockedAgain = await ownerClient.rpc("reschedule_litter_care_task_point", {
    p_task_id: taskId,
    p_client_command_id: ids.cmdRescheduleAttempt2,
    p_expected_revision_no: revisionAfterOverride,
    p_planned_for: "2026-08-10",
    p_scheduled_local_time: "11:00:00",
    p_schedule_timezone_name: "Europe/Paris",
    p_reason: "toujours sans override",
  });
  expect(blockedAgain.error).toBeNull();
  expect(blockedAgain.data?.[0]?.reason).toBe("schedule_locked");
  expect(taskRow(taskId)).toMatchObject({ plannedFor: "2026-08-09", isScheduleLocked: true });
});

// ---------------------------------------------------------------------------
// Idempotence (26-30)
// ---------------------------------------------------------------------------
test("rejoue une commande identique sans doublon et refuse un payload différent sans écriture", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const payload = milestonePayload();
  const input = {
    litterId: ids.litter,
    clientCommandId: ids.cmdIdempotent,
    expectedPlanRevision: null as number | null,
    timezoneName: "Europe/Paris",
    item: payload,
  };

  const first = await createLitterPlanAdHocItem(input, ownerClient);
  expectAdHocSuccess(first);
  expect(first.replayed).toBe(false);
  const countsAfterFirst = litterCounts();

  const replay = await createLitterPlanAdHocItem(input, ownerClient);
  expectAdHocSuccess(replay);
  expect(replay.replayed).toBe(true);
  expect(replay).toMatchObject({
    litterPlanId: first.litterPlanId,
    planRevision: first.planRevision,
    litterPlanItemId: first.litterPlanItemId,
    taskId: first.taskId,
    seriesId: first.seriesId,
  });
  expect(litterCounts()).toEqual(countsAfterFirst);

  const conflicting = await createLitterPlanAdHocItem(
    { ...input, item: milestonePayload({ scheduledDate: "2026-08-20" }) },
    ownerClient,
  );
  expect(conflicting.outcome).toBe("error");
  if (conflicting.outcome === "error") {
    expect(conflicting.error.code).toBe("client_command_conflict");
  }
  expect(litterCounts()).toEqual(countsAfterFirst);
});

// ---------------------------------------------------------------------------
// Concurrence (31-35)
// ---------------------------------------------------------------------------
test("sous une même révision attendue, une seule commande concurrente gagne sans doublon ni perte de révision", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();
  const ownerB = await createAuthenticatedSupabaseClient();

  const setup = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.cmdConcurrencySetup,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: milestonePayload(),
    },
    ownerClient,
  );
  expectAdHocSuccess(setup);
  expect(setup.planRevision).toBe(1);

  const settled = await allSettledWithTimeout("concurrence ad hoc", [
    createLitterPlanAdHocItem(
      {
        litterId: ids.litter,
        clientCommandId: ids.cmdConcurrentA,
        expectedPlanRevision: 1,
        timezoneName: "Europe/Paris",
        item: taskPayload({ title: "Tâche concurrente A", scheduledDate: "2026-08-07" }),
      },
      ownerClient,
    ),
    createLitterPlanAdHocItem(
      {
        litterId: ids.litter,
        clientCommandId: ids.cmdConcurrentB,
        expectedPlanRevision: 1,
        timezoneName: "Europe/Paris",
        item: taskPayload({ title: "Tâche concurrente B", scheduledDate: "2026-08-08" }),
      },
      ownerB,
    ),
  ]);

  expect(settled.every((entry) => entry.status === "fulfilled")).toBe(true);
  const results = settled.map((entry) =>
    entry.status === "fulfilled" ? entry.value : null,
  ) as CreateLitterPlanAdHocItemResult[];

  const successes = results.filter((result) => result.outcome === "success");
  const staleRevisionFailures = results.filter(
    (result) => result.outcome === "error" && result.error.code === "stale_revision",
  );
  expect(successes).toHaveLength(1);
  expect(staleRevisionFailures).toHaveLength(1);

  expect(planRow()).toMatchObject({ revision: 2 });
  const items = itemsRows(setup.litterPlanId);
  expect(items).toHaveLength(2);
  expect(items.map((row) => row.displayOrder)).toEqual([0, 1]);
  expect(new Set(items.map((row) => row.displayOrder)).size).toBe(2);
  expect(litterCounts()).toMatchObject({ plans: 1, items: 2, tasks: 2, series: 0 });
});

// ---------------------------------------------------------------------------
// Coexistence modèles (36-40)
// ---------------------------------------------------------------------------
test("coexistence : modèle appliqué en premier puis ajout ad hoc sur le même plan actif unique", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const model = await createSimpleModel(ownerClient, ids.modelCommandA, modelTitleA);
  const applied = await applyModel(ownerClient, ids.litter, model.model_id!, ids.applyCommandA, null);
  expect(applied.outcome).toBe("success");
  if (applied.outcome !== "success") return;
  expect(applied.revision).toBe(1);

  const adHoc = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.adHocAfterModelCommand,
      expectedPlanRevision: 1,
      timezoneName: "Europe/Paris",
      item: taskPayload({ title: "Tâche ad hoc post-modèle" }),
    },
    ownerClient,
  );
  expectAdHocSuccess(adHoc);
  expect(adHoc.litterPlanId).toBe(applied.planId);
  expect(adHoc.planRevision).toBe(2);

  const activePlans = Number(
    sql(`select count(*) from public.litter_plans where litter_id=${q(ids.litter)}::uuid and status='active';`),
  );
  expect(activePlans).toBe(1);

  const items = itemsRows(applied.planId);
  expect(items).toHaveLength(2);
  expect(items.map((row) => row.displayOrder)).toEqual([0, 1]);
  expect(items[0]).toMatchObject({ originKind: "planning_model", sourcePlanningModelId: model.model_id });
  expect(items[1]).toMatchObject({ originKind: "ad_hoc", sourcePlanningModelId: null, displayOrder: 1 });
});

test("coexistence : plan ad hoc créé d'abord puis modèle appliqué sans collision ni duplication (already_applied ignore les sources nulles)", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const adHocFirst = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.adHocFirstCommand,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: taskPayload({ title: "Tâche ad hoc initiale" }),
    },
    ownerClient,
  );
  expectAdHocSuccess(adHocFirst);
  expect(adHocFirst.planRevision).toBe(1);
  const adHocItemBefore = itemsRows(adHocFirst.litterPlanId)[0]!;
  const adHocTaskBefore = taskRow(adHocFirst.taskId!);

  const model = await createSimpleModel(ownerClient, ids.modelCommandB, modelTitleB);
  const applied = await applyModel(ownerClient, ids.litter, model.model_id!, ids.applyCommandB, 1);
  expect(applied.outcome).toBe("success");
  if (applied.outcome !== "success") return;
  expect(applied.planId).toBe(adHocFirst.litterPlanId);
  expect(applied.revision).toBe(2);

  // The ad-hoc item must remain byte-for-byte identical: no constraint break,
  // no duplication, and model_already_applied detection must ignore the
  // ad-hoc item's null source_planning_model_id.
  const adHocItemAfter = itemsRows(adHocFirst.litterPlanId).find(
    (row) => row.id === adHocFirst.litterPlanItemId,
  );
  expect(adHocItemAfter).toEqual(adHocItemBefore);
  expect(taskRow(adHocFirst.taskId!)).toEqual(adHocTaskBefore);

  const items = itemsRows(adHocFirst.litterPlanId);
  expect(items).toHaveLength(2);
  expect(items.map((row) => row.displayOrder)).toEqual([0, 1]);
  const modelItem = items.find((row) => row.originKind === "planning_model");
  expect(modelItem).toMatchObject({ sourcePlanningModelId: model.model_id, displayOrder: 1 });

  const activePlans = Number(
    sql(`select count(*) from public.litter_plans where litter_id=${q(ids.litter)}::uuid and status='active';`),
  );
  expect(activePlans).toBe(1);

  // Re-applying the exact same model a second time is correctly detected as
  // already applied (real duplicate source), proving the earlier ad-hoc
  // coexistence was not a false positive of that same guard.
  const reapply = await applyLitterPlanningModel(
    {
      litterId: ids.litter,
      planningModelId: model.model_id!,
      clientCommandId: ids.reapplyModelBCommand,
      expectedModelRevision: 1,
      expectedPlanRevision: applied.revision,
      selectedModelItemIds: null,
      timezoneName: "Europe/Paris",
    },
    ownerClient,
  );
  expect(reapply.outcome).toBe("error");
  if (reapply.outcome === "error") {
    expect(reapply.error.code).toBe("already_applied");
  }
});

// ---------------------------------------------------------------------------
// Recalcul biologique (41-44)
// ---------------------------------------------------------------------------
test("le recalcul d'ancrage biologique déplace les items modèle et laisse les items ad hoc totalement inchangés", async () => {
  seedBaseActorsAndLitter({ expectedBirthDate: "2026-08-10" });
  const ownerClient = await createAuthenticatedSupabaseClient();

  const model = await createSimpleModel(ownerClient, ids.modelCommandRecalc, modelTitleRecalc);
  const applied = await applyModel(ownerClient, ids.litter, model.model_id!, ids.applyCommandRecalc, null);
  expect(applied.outcome).toBe("success");
  if (applied.outcome !== "success") return;

  const modelItem = itemsRows(applied.planId)[0]!;
  expect(modelItem).toMatchObject({ originKind: "planning_model", anchorDateSnapshot: "2026-08-10" });
  const modelTaskId = sql(
    `select id::text from public.litter_care_tasks where litter_plan_item_id=${q(modelItem.id as string)}::uuid;`,
  );
  expect(taskRow(modelTaskId)).toMatchObject({ plannedFor: "2026-08-10", scheduleSource: "suggested" });

  const adHoc = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.adHocRecalcCommand,
      expectedPlanRevision: applied.revision,
      timezoneName: "Europe/Paris",
      item: milestonePayload({ title: "Jalon ad hoc absolu", scheduledDate: "2026-08-20" }),
    },
    ownerClient,
  );
  expectAdHocSuccess(adHoc);
  const adHocItemBefore = itemsRows(adHoc.litterPlanId).find((row) => row.id === adHoc.litterPlanItemId)!;
  const adHocTaskBefore = taskRow(adHoc.taskId!);
  expect(adHocItemBefore).toMatchObject({ anchorDateSnapshot: "2026-08-20", originKind: "ad_hoc" });
  expect(adHocTaskBefore).toMatchObject({ plannedFor: "2026-08-20" });

  const litterUpdatedAt = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);

  const recalc = await ownerClient.rpc("update_litter_gestation_anchors_and_recalculate_plan", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.recalcCommand,
    p_expected_litter_updated_at: litterUpdatedAt,
    p_expected_plan_revision: adHoc.planRevision,
    p_estimated_ovulation_date: null,
    p_expected_birth_date: "2026-08-15",
  });
  expect(recalc.error).toBeNull();
  expect(recalc.data?.[0]?.outcome).toBe("recalculated");
  expect(Number(recalc.data?.[0]?.recalculated_item_count)).toBeGreaterThanOrEqual(1);
  expect(Number(recalc.data?.[0]?.moved_automatic_schedule_count)).toBeGreaterThanOrEqual(1);

  const modelItemAfter = itemsRows(adHoc.litterPlanId).find((row) => row.id === modelItem.id);
  expect(modelItemAfter).toMatchObject({ anchorDateSnapshot: "2026-08-15" });
  expect((modelItemAfter!.revisionNo as number)).toBeGreaterThan(modelItem.revisionNo as number);
  expect(taskRow(modelTaskId)).toMatchObject({ plannedFor: "2026-08-15" });

  const adHocItemAfter = itemsRows(adHoc.litterPlanId).find((row) => row.id === adHoc.litterPlanItemId);
  expect(adHocItemAfter).toEqual(adHocItemBefore);
  expect(taskRow(adHoc.taskId!)).toEqual(adHocTaskBefore);

  const fnBody = sql(
    `select pg_get_functiondef('public.update_litter_gestation_anchors_and_recalculate_plan'::regproc);`,
  );
  expect(fnBody).toContain("origin_kind = 'planning_model'");
});

// ---------------------------------------------------------------------------
// Permissions (45-47)
// ---------------------------------------------------------------------------
test("permissions : membre autorisé, viewer refusé (forbidden) et organisation étrangère introuvable (not_found)", async () => {
  seedBaseActorsAndLitter();
  const memberClient = await authenticated(...credentials.member);
  const viewerClient = await authenticated(...credentials.viewer);
  const foreignClient = await authenticated(...credentials.foreign);

  const memberResult = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.memberCreateCommand,
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: milestonePayload({ title: "Jalon créé par un membre" }),
    },
    memberClient,
  );
  expectAdHocSuccess(memberResult);
  const countsAfterMember = litterCounts();

  const viewerResult = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.viewerCreateCommand,
      expectedPlanRevision: memberResult.planRevision,
      timezoneName: "Europe/Paris",
      item: taskPayload({ title: "Tâche refusée pour viewer" }),
    },
    viewerClient,
  );
  expect(viewerResult.outcome).toBe("error");
  if (viewerResult.outcome === "error") {
    expect(viewerResult.error.code).toBe("forbidden");
  }
  expect(litterCounts()).toEqual(countsAfterMember);

  const foreignResult = await createLitterPlanAdHocItem(
    {
      litterId: ids.litter,
      clientCommandId: ids.foreignCreateCommand,
      expectedPlanRevision: memberResult.planRevision,
      timezoneName: "Europe/Paris",
      item: taskPayload({ title: "Tâche refusée pour organisation étrangère" }),
    },
    foreignClient,
  );
  expect(foreignResult.outcome).toBe("error");
  if (foreignResult.outcome === "error") {
    expect(foreignResult.error.code).toBe("not_found");
  }
  expect(litterCounts()).toEqual(countsAfterMember);
});

// ---------------------------------------------------------------------------
// Validation atomique (48-51) — direct RPC calls bypass the client-side
// normalizer to exercise the authoritative server-side atomicity guarantees.
// ---------------------------------------------------------------------------
test("validation atomique côté RPC : fenêtre invalide, récurrence hors plafond et créneaux dupliqués n'écrivent jamais rien", async () => {
  seedBaseActorsAndLitter();
  const ownerClient = await createAuthenticatedSupabaseClient();

  const baseline = litterCounts();
  expect(baseline).toEqual({ plans: 0, items: 0, tasks: 0, series: 0, adHocCommands: 0 });

  const invalidWindow = await ownerClient.rpc("create_litter_plan_ad_hoc_item", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.invalidWindowRpcCommand,
    p_expected_plan_revision: null,
    p_timezone_name: "Europe/Paris",
    p_item: {
      version: 1,
      kind: "window",
      title: "Fenêtre invalide",
      description: null,
      category: "other",
      targetScope: "litter",
      priority: "normal",
      lockSchedule: false,
      startsOn: "2026-08-10",
      endsOn: "2026-08-05",
      startsLocalTime: null,
      endsLocalTime: null,
    } as unknown as Json,
  });
  expect(invalidWindow.error).toBeNull();
  expect(invalidWindow.data?.[0]?.outcome).toBe("error");
  expect(invalidWindow.data?.[0]?.reason).toBe("invalid_input");
  expect(litterCounts()).toEqual(baseline);

  const overCeiling = await ownerClient.rpc("create_litter_plan_ad_hoc_item", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.invalidRecurrenceRpcCommand,
    p_expected_plan_revision: null,
    p_timezone_name: "Europe/Paris",
    p_item: {
      version: 1,
      kind: "recurring_task",
      title: "Récurrence hors plafond",
      description: null,
      category: "maternal_health",
      targetScope: "mother",
      priority: "normal",
      lockSchedule: false,
      startsOn: "2026-08-01",
      intervalDays: 1,
      endKind: "fixed_recurrence_day_count",
      endsOn: null,
      recurrenceDayCount: 300,
      timeSlots: ["08:00", "20:00"],
    } as unknown as Json,
  });
  expect(overCeiling.error).toBeNull();
  expect(overCeiling.data?.[0]?.outcome).toBe("error");
  expect(overCeiling.data?.[0]?.reason).toBe("invalid_input");
  expect(litterCounts()).toEqual(baseline);

  const duplicateSlots = await ownerClient.rpc("create_litter_plan_ad_hoc_item", {
    p_litter_id: ids.litter,
    p_client_command_id: ids.duplicateSlotsRpcCommand,
    p_expected_plan_revision: null,
    p_timezone_name: "Europe/Paris",
    p_item: {
      version: 1,
      kind: "recurring_task",
      title: "Créneaux dupliqués",
      description: null,
      category: "maternal_health",
      targetScope: "mother",
      priority: "normal",
      lockSchedule: false,
      startsOn: "2026-08-01",
      intervalDays: 1,
      endKind: "fixed_recurrence_day_count",
      endsOn: null,
      recurrenceDayCount: 5,
      timeSlots: ["08:00", "08:00"],
    } as unknown as Json,
  });
  expect(duplicateSlots.error).toBeNull();
  expect(duplicateSlots.data?.[0]?.outcome).toBe("error");
  expect(duplicateSlots.data?.[0]?.reason).toBe("invalid_input");
  expect(litterCounts()).toEqual(baseline);
});

// ---------------------------------------------------------------------------
// Nettoyage (52-53) — enforced by beforeEach/afterEach around every test
// above: cleanup() runs before the first test and after every test
// (success or failure), and expectCleanupAtZero() verifies every counter
// (ad-hoc commands, schedule commands/changes, series/materialization/state
// commands, anchor recalculation & application commands, tasks, series,
// series slots, plan items, plans, model commands/items/models, templates,
// litters, animals, memberships, auth identities/users, profiles and
// organizations) is exactly zero — including any historical e7270005-*
// leftovers, not only the current run's UUIDs.
// ---------------------------------------------------------------------------
test("nettoyage : après suppression de toutes les fixtures e7270005, tous les compteurs sont à zéro", () => {
  seedBaseActorsAndLitter();
  sql(`
    insert into public.litter_plans (organization_id, litter_id, title, timezone_name, created_by, updated_by)
    values (${q(org)}::uuid, ${q(ids.litter)}::uuid, 'Planning personnalisé', 'Europe/Paris', ${q(owner)}::uuid, ${q(owner)}::uuid);
  `);
  expect(Number(sql(`select count(*) from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`))).toBe(1);

  cleanup();
  expectCleanupAtZero();
});

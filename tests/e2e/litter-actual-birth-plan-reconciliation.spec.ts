import { expect, test, type Page } from "@playwright/test";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  cancelWhelpingBirthCore,
  correctWhelpingBirthCore,
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(480_000);

type Supabase = SupabaseClient<Database>;
type BirthFixture = {
  birthId: string;
  animalId: string;
  sessionId: string;
  revisionNo: number;
};

const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const viewerId = "10000000-0000-4000-8000-000000000003";
const durableOrganizationId = "20000000-0000-4000-8000-000000000001";
const prefix = "e7300005-0000-4000-8000-";
const like = "e7300005-%";
const preModelCode = "dog-pre-whelping-temperature-monitoring";
const postModelCode = "dog-postnatal-essential-care";

const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  viewerMembership: `${prefix}000000000003`,
  foreignOrganization: `${prefix}000000000004`,
  foreignMembership: `${prefix}000000000005`,
  mainMother: `${prefix}000000000011`,
  insertMother: `${prefix}000000000012`,
  rollbackMother: `${prefix}000000000013`,
  concurrentMother: `${prefix}000000000014`,
  noPlanMother: `${prefix}000000000015`,
  cancelMother: `${prefix}000000000016`,
  mainLitter: `${prefix}000000000021`,
  insertLitter: `${prefix}000000000022`,
  rollbackLitter: `${prefix}000000000023`,
  concurrentLitter: `${prefix}000000000024`,
  noPlanLitter: `${prefix}000000000025`,
  cancelLitter: `${prefix}000000000026`,
  importCommand: `${prefix}000000000031`,
  mainPreApply: `${prefix}000000000032`,
  mainPostApply: `${prefix}000000000033`,
  insertPreApply: `${prefix}000000000034`,
  insertPostApply: `${prefix}000000000035`,
  rollbackPreApply: `${prefix}000000000036`,
  rollbackPostApply: `${prefix}000000000037`,
  concurrentPostApply: `${prefix}000000000038`,
  mainOpen: `${prefix}000000000041`,
  insertOpen: `${prefix}000000000042`,
  rollbackOpen: `${prefix}000000000043`,
  concurrentOpen: `${prefix}000000000044`,
  noPlanOpen: `${prefix}000000000045`,
  cancelOpen: `${prefix}000000000046`,
  mainFirstBirth: `${prefix}000000000051`,
  mainSecondBirth: `${prefix}000000000052`,
  insertFirstBirth: `${prefix}000000000053`,
  rollbackFirstBirth: `${prefix}000000000054`,
  concurrentFirstBirth: `${prefix}000000000055`,
  noPlanFirstBirth: `${prefix}000000000056`,
  cancelFirstBirth: `${prefix}000000000057`,
  mainCorrection: `${prefix}000000000061`,
  mainSameDayCorrection: `${prefix}000000000062`,
  mainSecondCorrection: `${prefix}000000000063`,
  insertCorrection: `${prefix}000000000064`,
  rollbackCorrection: `${prefix}000000000065`,
  concurrentCorrectionA: `${prefix}000000000066`,
  concurrentCorrectionB: `${prefix}000000000067`,
  noPlanCorrection: `${prefix}000000000068`,
  cancelCommand: `${prefix}000000000069`,
  manualSchedule: `${prefix}000000000071`,
  lockedSchedule: `${prefix}000000000072`,
  invalidCorrection: `${prefix}000000000081`,
  missingCorrection: `${prefix}000000000082`,
  viewerCorrection: `${prefix}000000000083`,
  foreignCorrection: `${prefix}000000000084`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function jsonSql<T>(statement: string): T {
  const lines = sql(statement).split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line) as T;
    } catch {
      continue;
    }
  }
  throw new Error("E2E SQL did not return JSON");
}

async function authenticatedClient(
  email: string,
  password: string,
): Promise<Supabase> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

function cleanup() {
  sql(`
    begin;
    set local session_replication_role = replica;
    select pg_catalog.set_config('app.fixture_cleanup', 'on', true);

    delete from public.litter_plan_actual_birth_reconciliation_task_changes
    where organization_id = ${q(ids.organization)}::uuid
       or command_id::text like ${q(like)}
       or task_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_reconciliations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_actual_birth_reconciliation_changes
    where organization_id = ${q(ids.organization)}::uuid
       or command_id::text like ${q(like)}
       or task_id::text like ${q(like)};
    delete from public.litter_plan_series_actual_birth_reconciliation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or whelping_client_command_id::text like ${q(like)};
    delete from public.maternal_observation_task_links
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.maternal_observation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.maternal_observations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_changes
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_materialization_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_anchor_recalculation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_ad_hoc_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or creation_command_id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_items
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};

    delete from public.whelping_birth_adjustment_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.whelping_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or client_command_id::text like ${q(like)};
    delete from public.animal_weight_measurements
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.whelping_births
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.whelping_events
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.whelping_sessions
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or id::text like ${q(like)};

    delete from public.litter_planning_model_item_time_slots
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_commands
    where organization_id = ${q(ids.organization)}::uuid
       or client_command_id::text like ${q(like)};
    delete from public.litter_planning_model_items
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_library_import_commands
    where organization_id = ${q(ids.organization)}::uuid
       or client_command_id::text like ${q(like)};
    delete from public.litter_care_task_templates
    where organization_id = ${q(ids.organization)}::uuid;

    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id is not null;
    delete from public.litters
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.memberships
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};
    delete from public.organizations
    where id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    ) or id::text like ${q(like)};

    set local session_replication_role = origin;
    commit;
  `);
}

function fixtureCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'plan_change_audits', (select count(*) from public.litter_plan_actual_birth_reconciliation_task_changes where organization_id = ${q(ids.organization)}::uuid or task_id::text like ${q(like)}),
      'plan_audits', (select count(*) from public.litter_plan_actual_birth_reconciliations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'series_change_audits', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_changes where organization_id = ${q(ids.organization)}::uuid or task_id::text like ${q(like)}),
      'series_audits', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activations', (select count(*) from public.litter_plan_actual_birth_activations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'slots', (select count(*) from public.litter_plan_series_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'adjustments', (select count(*) from public.whelping_birth_adjustment_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'whelping_commands', (select count(*) from public.whelping_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'measurements', (select count(*) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid),
      'events', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid),
      'sessions', (select count(*) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid),
      'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'model_commands', (select count(*) from public.litter_planning_model_commands where organization_id = ${q(ids.organization)}::uuid),
      'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid),
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
      'imports', (select count(*) from public.litter_planning_model_library_import_commands where organization_id = ${q(ids.organization)}::uuid),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid),
      'litters', (select count(*) from public.litters where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'memberships', (select count(*) from public.memberships where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'organizations', (select count(*) from public.organizations where id::text like ${q(like)})
    )::text;
  `);
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(fixtureCounts())) {
    expect(count, `${name} fixtures must be physically deleted`).toBe(0);
  }
}

function durableCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (select count(*) from public.animals where id::text like 'd3c9%'),
      'litters', (select count(*) from public.litters where id::text like 'd3c9%'),
      'sessions', (select count(*) from public.whelping_sessions where id::text like 'd3c9%'),
      'events', (select count(*) from public.whelping_events where id::text like 'd3c9%'),
      'births', (select count(*) from public.whelping_births where id::text like 'd3c9%'),
      'weighing_sessions', (select count(*) from public.litter_weighing_sessions where id::text like 'd3c9%'),
      'measurements', (select count(*) from public.animal_weight_measurements where id::text like 'd3c9%'),
      'temporary_rows', (
        (select count(*) from public.litter_plan_actual_birth_reconciliations where organization_id = ${q(durableOrganizationId)}::uuid and birth_adjustment_client_command_id::text like ${q(like)})
        + (select count(*) from public.litter_care_tasks where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)})
      )
    )::text;
  `);
}

const durableExpected = {
  animals: 13,
  litters: 2,
  sessions: 2,
  events: 11,
  births: 9,
  weighing_sessions: 62,
  measurements: 286,
  temporary_rows: 0,
};

function seedScope() {
  const mothers = [
    [ids.mainMother, "Mère correction principale"],
    [ids.insertMother, "Mère correction étendue"],
    [ids.rollbackMother, "Mère rollback"],
    [ids.concurrentMother, "Mère concurrence"],
    [ids.noPlanMother, "Mère sans plan"],
    [ids.cancelMother, "Mère annulation"],
  ] as const;
  const litters = [
    [ids.mainLitter, ids.mainMother, "Portée correction principale"],
    [ids.insertLitter, ids.insertMother, "Portée correction étendue"],
    [ids.rollbackLitter, ids.rollbackMother, "Portée rollback"],
    [ids.concurrentLitter, ids.concurrentMother, "Portée concurrence"],
    [ids.noPlanLitter, ids.noPlanMother, "Portée sans plan"],
    [ids.cancelLitter, ids.cancelMother, "Portée annulation"],
  ] as const;

  sql(`
    insert into public.organizations (id, name, slug) values
      (${q(ids.organization)}::uuid, 'Réconciliation plan e7300005', 'reconciliation-plan-e7300005'),
      (${q(ids.foreignOrganization)}::uuid, 'Organisation étrangère e7300005', 'organisation-etrangere-e7300005');
    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (${q(ids.membership)}::uuid, ${q(ids.organization)}::uuid, ${q(ownerId)}::uuid, 'owner', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(viewerId)}::uuid, 'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(memberId)}::uuid, 'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      ${mothers.map(([id, name]) => `(${q(id)}::uuid, ${q(ids.organization)}::uuid, ${q(name)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`).join(",\n")};
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values
      ${litters.map(([id, mother, name]) => `(${q(id)}::uuid, ${q(ids.organization)}::uuid, ${q(name)}, 'dog', 'Golden Retriever', ${q(mother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`).join(",\n")};
  `);
}

async function importModels(owner: Supabase) {
  const imported = await owner.rpc(
    "import_litter_planning_model_library_models",
    {
      p_organization_id: ids.organization,
      p_client_command_id: ids.importCommand,
      p_selection: [
        { code: preModelCode, version: 1 },
        { code: postModelCode, version: 1 },
      ] as Json,
      p_is_active: true,
    },
  );
  expect(imported.error).toBeNull();
  expect(imported.data?.[0]).toMatchObject({
    outcome: "success",
    imported_count: 2,
  });
}

function modelId(code: string) {
  return sql(`
    select id::text from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
      and library_model_code = ${q(code)}
      and library_model_version = 1;
  `);
}

function planRevision(litterId: string) {
  return Number(sql(`
    select revision from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id = ${q(litterId)}::uuid
      and status = 'active';
  `));
}

async function applyModel(
  owner: Supabase,
  litterId: string,
  code: string,
  commandId: string,
) {
  const revision = sql(`
    select revision::text from public.litter_plans
    where litter_id = ${q(litterId)}::uuid and status = 'active';
  `);
  const applied = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
    p_planning_model_id: modelId(code),
    p_client_command_id: commandId,
    p_expected_model_revision: 1,
    p_expected_plan_revision: revision ? Number(revision) : null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");
}

async function createBirth(
  owner: Supabase,
  litterId: string,
  openCommand: string,
  birthCommand: string,
  occurredAt: string,
): Promise<BirthFixture> {
  const opened = await openWhelpingSessionCore(
    {
      litterId,
      clientCommandId: openCommand,
      startedAt: "2026-08-08T02:30:00+02:00",
      timezoneName: "Europe/Paris",
      note: null,
    },
    owner,
  );
  expect(opened.outcome).toBe("success");
  if (opened.outcome !== "success") throw new Error("Session opening failed");

  const birth = await recordWhelpingBirthCore(
    {
      sessionId: opened.sessionId,
      clientCommandId: birthCommand,
      occurredAt,
      sex: "unknown",
      viability: "unknown",
    },
    owner,
  );
  expect(birth.outcome).toBe("success");
  if (birth.outcome !== "success") throw new Error("Birth creation failed");
  return {
    birthId: birth.birthId,
    animalId: birth.animalId,
    sessionId: opened.sessionId,
    revisionNo: 0,
  };
}

async function addBirth(
  owner: Supabase,
  sessionId: string,
  commandId: string,
  occurredAt: string,
) {
  const birth = await recordWhelpingBirthCore(
    {
      sessionId,
      clientCommandId: commandId,
      occurredAt,
      sex: "unknown",
      viability: "unknown",
    },
    owner,
  );
  expect(birth.outcome).toBe("success");
  if (birth.outcome !== "success") throw new Error("Additional birth failed");
  return birth;
}

function correctionInput(
  fixture: BirthFixture,
  commandId: string,
  expectedRevisionNo: number,
  occurredAt: string,
) {
  return {
    birthId: fixture.birthId,
    clientCommandId: commandId,
    expectedRevisionNo,
    occurredAt,
    sex: "unknown" as const,
    viability: "unknown" as const,
    initialCollarColor: null,
    birthNote: null,
    weightGrams: null,
    weightMeasuredAt: null,
    weightNote: null,
    reason: `Correction auditée ${commandId.slice(-4)}`,
  };
}

function completeFingerprint(litterId: string) {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'litter', (select to_jsonb(litter) from public.litters litter where id = ${q(litterId)}::uuid),
      'births', (
        select coalesce(jsonb_agg(to_jsonb(birth) order by birth.id), '[]'::jsonb)
        from public.whelping_births birth
        join public.whelping_sessions session on session.id = birth.session_id
        where session.litter_id = ${q(litterId)}::uuid
      ),
      'animals', (
        select coalesce(jsonb_agg(to_jsonb(animal) order by animal.id), '[]'::jsonb)
        from public.animals animal where animal.litter_id = ${q(litterId)}::uuid
      ),
      'events', (
        select coalesce(jsonb_agg(to_jsonb(event) order by event.id), '[]'::jsonb)
        from public.whelping_events event
        join public.whelping_sessions session on session.id = event.session_id
        where session.litter_id = ${q(litterId)}::uuid
      ),
      'plan', (select to_jsonb(plan) from public.litter_plans plan where plan.litter_id = ${q(litterId)}::uuid and plan.status = 'active'),
      'items', (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from public.litter_plan_items item where item.litter_id = ${q(litterId)}::uuid),
      'series', (select coalesce(jsonb_agg(to_jsonb(series) order by series.id), '[]'::jsonb) from public.litter_plan_series series where series.litter_id = ${q(litterId)}::uuid),
      'tasks', (select coalesce(jsonb_agg(to_jsonb(task) order by task.id), '[]'::jsonb) from public.litter_care_tasks task where task.litter_id = ${q(litterId)}::uuid),
      'adjustments', (select count(*) from public.whelping_birth_adjustment_commands where litter_id = ${q(litterId)}::uuid),
      'planAudits', (select count(*) from public.litter_plan_actual_birth_reconciliations where litter_id = ${q(litterId)}::uuid),
      'seriesAudits', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands where litter_id = ${q(litterId)}::uuid)
    )::text;
  `);
}

function mainState() {
  return jsonSql<Record<string, unknown>>(`
    with post_tasks as (
      select task.*
      from public.litter_care_tasks task
      join public.litter_plan_items item on item.id = task.litter_plan_item_id
      join public.litter_planning_models model on model.id = item.source_planning_model_id
      where task.litter_id = ${q(ids.mainLitter)}::uuid
        and model.library_model_code = ${q(postModelCode)}
    )
    select json_build_object(
      'actualBirthDate', (select actual_birth_date::text from public.litters where id = ${q(ids.mainLitter)}::uuid),
      'planRevision', (select revision from public.litter_plans where litter_id = ${q(ids.mainLitter)}::uuid and status = 'active'),
      'anchoredItems', (
        select count(*) from public.litter_plan_items
        where litter_id = ${q(ids.mainLitter)}::uuid
          and materialization_state = 'materialized'
          and anchor_resolution_source = 'actual_birth'
          and anchor_source_date_snapshot = '2026-08-09'
          and anchor_date_snapshot = '2026-08-09'
      ),
      'postTasks', (select count(*) from post_tasks),
      'duplicateIdentities', (
        select count(*) from (
          select litter_plan_series_id, recurrence_day_no, slot_no
          from public.litter_care_tasks
          where litter_id = ${q(ids.mainLitter)}::uuid
            and litter_plan_series_id is not null
          group by litter_plan_series_id, recurrence_day_no, slot_no
          having count(*) > 1
        ) duplicate
      ),
      'rows', (
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'title', title,
          'kind', item_kind,
          'status', status,
          'source', schedule_source,
          'locked', is_schedule_locked,
          'plannedFor', planned_for,
          'time', scheduled_local_time,
          'suggestedFor', suggested_for,
          'start', retained_starts_on,
          'end', retained_ends_on,
          'suggestedStart', suggested_starts_on,
          'suggestedEnd', suggested_ends_on,
          'revisionNo', revision_no
        ) order by coalesce(planned_for, retained_starts_on), id)
        from post_tasks
      ),
      'preSeries', (
        select json_build_object(
          'state', series.state,
          'reason', series.completion_reason,
          'endsOn', series.ends_on,
          'through', series.materialized_through,
          'restoredOnNinth', count(task.id) filter (
            where task.planned_for = '2026-08-09' and task.status = 'planned'
          )
        )
        from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        left join public.litter_care_tasks task on task.litter_plan_series_id = series.id
        where series.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(preModelCode)}
        group by series.id
      ),
      'planAudit', (
        select json_build_object(
          'count', count(*),
          'previousRevision', min(previous_plan_revision),
          'resultRevision', min(result_plan_revision),
          'items', min(recalculated_item_count),
          'tasks', min(changed_task_count),
          'automatic', min(moved_automatic_schedule_count),
          'manual', min(preserved_manual_schedule_count),
          'locked', min(preserved_locked_schedule_count),
          'terminal', min(preserved_terminal_count),
          'series', min(recalculated_series_count),
          'prebirth', min(prebirth_series_reconciliation_count)
        )
        from public.litter_plan_actual_birth_reconciliations
        where litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'classifications', (
        select json_object_agg(classification, amount)
        from (
          select classification, count(*) as amount
          from public.litter_plan_actual_birth_reconciliation_task_changes change
          join public.litter_plan_actual_birth_reconciliations command on command.id = change.command_id
          where command.litter_id = ${q(ids.mainLitter)}::uuid
          group by classification
        ) counts
      ),
      'seriesAudit', (
        select json_build_object(
          'parents', count(distinct command.id),
          'children', count(change.id),
          'restored', count(change.id) filter (where change.change_type = 'restored')
        )
        from public.litter_plan_series_actual_birth_reconciliation_commands command
        left join public.litter_plan_series_actual_birth_reconciliation_changes change on change.command_id = command.id
        where command.litter_id = ${q(ids.mainLitter)}::uuid
      )
    )::text;
  `);
}

function noInventedFacts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'observations', (select count(*) from public.maternal_observations where organization_id = ${q(ids.organization)}::uuid),
      'observationLinks', (select count(*) from public.maternal_observation_task_links where organization_id = ${q(ids.organization)}::uuid),
      'documents', (select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid),
      'payments', (select count(*) from public.payments where organization_id = ${q(ids.organization)}::uuid),
      'reservations', (select count(*) from public.reservations where organization_id = ${q(ids.organization)}::uuid),
      'emails', (select count(*) from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid)
    )::text;
  `);
}

function securityState() {
  return jsonSql<Record<string, unknown>>(`
    with functions as (
      select
        procedure.proname as name,
        procedure.oid::text as oid,
        procedure.prosecdef,
        procedure.proconfig,
        pg_get_userbyid(procedure.proowner) as owner,
        has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
        exists (
          select 1
          from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_execute
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'correct_whelping_birth',
          'correct_whelping_birth_core_internal',
          'reconcile_litter_plan_actual_birth_date_internal',
          'prevent_litter_plan_actual_birth_reconciliation_mutation'
        )
    )
    select json_build_object(
      'functions', (
        select json_object_agg(name, json_build_object(
          'oid', oid,
          'owner', owner,
          'securityDefiner', prosecdef,
          'config', proconfig,
          'authenticatedExecute', authenticated_execute,
          'anonExecute', anon_execute,
          'publicExecute', public_execute
        )) from functions
      ),
      'coreHash', (
        select encode(sha256(convert_to(
          regexp_replace(prosrc, '\\s+', ' ', 'g'),
          'UTF8'
        )), 'hex')
        from pg_catalog.pg_proc
        where oid = 'public.correct_whelping_birth_core_internal(uuid,uuid,integer,timestamptz,text,text,text,text,integer,timestamptz,text,text)'::regprocedure
      ),
      'tables', (
        select json_object_agg(class.relname, json_build_object(
          'rls', class.relrowsecurity,
          'policies', (select count(*) from pg_catalog.pg_policy where polrelid = class.oid),
          'authenticated', has_table_privilege('authenticated', class.oid, 'SELECT,INSERT,UPDATE,DELETE'),
          'anon', has_table_privilege('anon', class.oid, 'SELECT,INSERT,UPDATE,DELETE')
        ))
        from pg_catalog.pg_class class
        join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname in (
            'litter_plan_actual_birth_reconciliations',
            'litter_plan_actual_birth_reconciliation_task_changes'
          )
      ),
      'seriesResultObjectConstraint', exists (
        select 1 from pg_catalog.pg_constraint
        where conrelid = 'public.litter_plan_series_actual_birth_reconciliation_commands'::regclass
          and conname = 'litter_plan_series_birth_reconciliation_result_object_check'
      )
    )::text;
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Concurrent corrections exceeded ${timeoutMs} ms`)),
        timeoutMs,
      );
    }),
  ]);
}

function deniedCorrectionLockProbe({
  profileId,
  birthId,
  commandId,
  expectedRevision = 0,
  occurredAt = "2026-08-09T00:05:00+02:00",
  sex = "unknown",
}: {
  profileId: string | null;
  birthId: string | null;
  commandId: string;
  expectedRevision?: number;
  occurredAt?: string | null;
  sex?: string | null;
}) {
  const nullable = (value: string | null, type: string) =>
    value === null ? `null::${type}` : `${q(value)}::${type}`;
  return jsonSql<{
    result: Record<string, unknown>;
    targetLockCount: number;
    backendAdvisoryLockCount: number;
  }>(`
    begin;
    set local role authenticated;
    select pg_catalog.set_config(
      'request.jwt.claim.sub',
      ${q(profileId ?? '')},
      true
    );
    with denied as materialized (
      select *
      from public.correct_whelping_birth(
        ${nullable(birthId, "uuid")},
        ${q(commandId)}::uuid,
        ${expectedRevision},
        ${nullable(occurredAt, "timestamptz")},
        ${nullable(sex, "text")},
        'unknown',
        null,
        null,
        null,
        null,
        null,
        'Refus contrôlé'
      )
    ),
    lock_key as (
      select pg_catalog.hashtextextended(
        'litter_plan_mutation:' || ${q(ids.organization)}
          || ':' || ${q(ids.mainLitter)},
        0
      ) as value
    ),
    held_locks as materialized (
      select
        count(*) filter (
          where lock.classid::bigint = ((lock_key.value >> 32) & 4294967295)
            and lock.objid::bigint = (lock_key.value & 4294967295)
        ) as target_lock_count,
        count(lock.pid) as backend_advisory_lock_count
      from denied
      cross join lock_key
      left join pg_catalog.pg_locks lock
        on lock.pid = pg_catalog.pg_backend_pid()
       and lock.locktype = 'advisory'
       and lock.granted
    )
    select json_build_object(
      'result', (select row_to_json(denied) from denied),
      'targetLockCount', held_locks.target_lock_count,
      'backendAdvisoryLockCount', held_locks.backend_advisory_lock_count
    )::text
    from held_locks;
    rollback;
  `);
}

function planAuditCount(litterId: string) {
  return Number(sql(`
    select count(*) from public.litter_plan_actual_birth_reconciliations
    where litter_id = ${q(litterId)}::uuid;
  `));
}

function adjustmentCount(litterId: string) {
  return Number(sql(`
    select count(*) from public.whelping_birth_adjustment_commands
    where litter_id = ${q(litterId)}::uuid;
  `));
}

test("réconcilie atomiquement le plan après correction de la naissance réelle", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();
  expect(durableCounts()).toEqual(durableExpected);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  let owner: Supabase | null = null;
  let secondOwner: Supabase | null = null;
  let viewer: Supabase | null = null;
  let foreignMember: Supabase | null = null;
  let anonymous: Supabase | null = null;

  try {
    const security = securityState();
    expect(security).toMatchObject({
      functions: {
        correct_whelping_birth: {
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          authenticatedExecute: true,
          anonExecute: false,
          publicExecute: false,
        },
        correct_whelping_birth_core_internal: {
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
        reconcile_litter_plan_actual_birth_date_internal: {
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
        prevent_litter_plan_actual_birth_reconciliation_mutation: {
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
      },
      coreHash:
        "f98de233987c57b0a78859cdeca60f6e05f51fba130a87cb708e0286db85986a",
      tables: {
        litter_plan_actual_birth_reconciliations: {
          rls: true,
          policies: 0,
          authenticated: false,
          anon: false,
        },
        litter_plan_actual_birth_reconciliation_task_changes: {
          rls: true,
          policies: 0,
          authenticated: false,
          anon: false,
        },
      },
      seriesResultObjectConstraint: true,
    });
    const functions = security.functions as Record<string, { oid: string }>;
    expect(functions.correct_whelping_birth.oid).not.toBe(
      functions.correct_whelping_birth_core_internal.oid,
    );

    seedScope();
    owner = await createAuthenticatedSupabaseClient();
    secondOwner = await createAuthenticatedSupabaseClient();
    viewer = await authenticatedClient(
      E2E_VIEWER_EMAIL,
      E2E_VIEWER_PASSWORD,
    );
    foreignMember = await authenticatedClient(
      E2E_MEMBER_EMAIL,
      E2E_MEMBER_PASSWORD,
    );
    anonymous = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await importModels(owner);

    await applyModel(owner, ids.mainLitter, preModelCode, ids.mainPreApply);
    await applyModel(owner, ids.mainLitter, postModelCode, ids.mainPostApply);
    await applyModel(owner, ids.insertLitter, preModelCode, ids.insertPreApply);
    await applyModel(owner, ids.insertLitter, postModelCode, ids.insertPostApply);
    await applyModel(
      owner,
      ids.rollbackLitter,
      preModelCode,
      ids.rollbackPreApply,
    );
    await applyModel(
      owner,
      ids.rollbackLitter,
      postModelCode,
      ids.rollbackPostApply,
    );
    await applyModel(
      owner,
      ids.concurrentLitter,
      postModelCode,
      ids.concurrentPostApply,
    );

    const mainFirst = await createBirth(
      owner,
      ids.mainLitter,
      ids.mainOpen,
      ids.mainFirstBirth,
      "2026-08-08T23:55:00+02:00",
    );
    const mainSecond = await addBirth(
      owner,
      mainFirst.sessionId,
      ids.mainSecondBirth,
      "2026-08-09T00:30:00+02:00",
    );
    expect(sql(`
      select actual_birth_date::text from public.litters
      where id = ${q(ids.mainLitter)}::uuid;
    `)).toBe("2026-08-08");

    const planRevisionAfterActivation = planRevision(ids.mainLitter);
    const sameDay = await correctWhelpingBirthCore(
      correctionInput(
        mainFirst,
        ids.mainSameDayCorrection,
        0,
        "2026-08-08T23:50:00+02:00",
      ),
      owner,
    );
    expect(sameDay).toMatchObject({
      outcome: "success",
      replayed: false,
      revisionNo: 1,
    });
    expect(planRevision(ids.mainLitter)).toBe(planRevisionAfterActivation);
    expect(planAuditCount(ids.mainLitter)).toBe(0);
    expect(
      Number(sql(`
        select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands
        where litter_id = ${q(ids.mainLitter)}::uuid;
      `)),
    ).toBe(0);

    const postTargets = jsonSql<{
      manual: { id: string; revisionNo: number };
      locked: { id: string; revisionNo: number };
      terminal: { id: string; revisionNo: number };
    }>(`
      with recurring as (
        select task.id, task.revision_no,
          row_number() over (order by task.recurrence_day_no) as position
        from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and task.litter_plan_series_id is not null
      )
      select json_build_object(
        'manual', (select json_build_object('id', id, 'revisionNo', revision_no) from recurring where position = 1),
        'locked', (select json_build_object('id', id, 'revisionNo', revision_no) from recurring where position = 2),
        'terminal', (select json_build_object('id', id, 'revisionNo', revision_no) from recurring where position = 3)
      )::text;
    `);
    const manual = await owner.rpc("reschedule_litter_care_task_point", {
      p_task_id: postTargets.manual.id,
      p_client_command_id: ids.manualSchedule,
      p_expected_revision_no: postTargets.manual.revisionNo,
      p_planned_for: "2026-08-25",
      p_scheduled_local_time: "11:30",
      p_schedule_timezone_name: "Europe/Paris",
      p_reason: "Choix utilisateur conservé",
    });
    expect(manual.error).toBeNull();
    expect(manual.data?.[0]?.outcome).toBe("success");

    const locked = await owner.rpc("set_litter_care_task_schedule_lock", {
      p_task_id: postTargets.locked.id,
      p_client_command_id: ids.lockedSchedule,
      p_expected_revision_no: postTargets.locked.revisionNo,
      p_is_locked: true,
      p_reason: "Choix utilisateur verrouillé",
    });
    expect(locked.error).toBeNull();
    expect(locked.data?.[0]?.outcome).toBe("success");
    sql(`
      update public.litter_care_tasks
      set planned_for = '2026-09-08',
          scheduled_local_time = '15:45',
          revision_no = revision_no + 1,
          updated_at = statement_timestamp(),
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(postTargets.locked.id)}::uuid
        and is_schedule_locked = true;
      update public.litter_care_tasks
      set status = 'cancelled',
          planned_for = '2026-09-22',
          scheduled_local_time = '16:15',
          resolution_command_id = ${q(`${prefix}000000000073`)}::uuid,
          resolved_at = statement_timestamp(),
          resolved_timezone_name = 'Europe/Paris',
          resolved_by = ${q(ownerId)}::uuid,
          resolution_note = 'État terminal de contrôle',
          revision_no = revision_no + 1,
          updated_at = statement_timestamp(),
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(postTargets.terminal.id)}::uuid;
    `);

    const postBefore = jsonSql<Record<string, Record<string, unknown>>>(`
      select json_object_agg(id::text, to_jsonb(task))::text
      from public.litter_care_tasks task
      where litter_id = ${q(ids.mainLitter)}::uuid
        and litter_plan_item_id in (
          select item.id
          from public.litter_plan_items item
          join public.litter_planning_models model on model.id = item.source_planning_model_id
          where item.litter_id = ${q(ids.mainLitter)}::uuid
            and model.library_model_code = ${q(postModelCode)}
        );
    `);
    const mainPlanRevisionBefore = planRevision(ids.mainLitter);
    const mainCorrectionInput = correctionInput(
      mainFirst,
      ids.mainCorrection,
      1,
      "2026-08-09T00:05:00+02:00",
    );
    const mainCorrection = await correctWhelpingBirthCore(
      mainCorrectionInput,
      owner,
    );
    expect(mainCorrection).toMatchObject({
      outcome: "success",
      replayed: false,
      revisionNo: 2,
    });

    const state = mainState();
    expect(state).toMatchObject({
      actualBirthDate: "2026-08-09",
      planRevision: mainPlanRevisionBefore + 1,
      anchoredItems: 4,
      postTasks: 7,
      duplicateIdentities: 0,
      preSeries: {
        state: "completed",
        reason: "actual_birth_reached",
        endsOn: "2026-08-09",
        through: "2026-08-09",
        restoredOnNinth: 2,
      },
      planAudit: {
        count: 1,
        previousRevision: mainPlanRevisionBefore,
        resultRevision: mainPlanRevisionBefore + 1,
        items: 4,
        tasks: 7,
        automatic: 4,
        manual: 1,
        locked: 1,
        terminal: 1,
        series: 1,
        prebirth: 1,
      },
      classifications: {
        automatic_moved: 4,
        manual_preserved: 1,
        locked_preserved: 1,
        terminal_preserved: 1,
      },
      seriesAudit: { parents: 1, children: 2, restored: 2 },
    });
    const postRows = state.rows as Array<Record<string, unknown>>;
    expect(postRows).toHaveLength(7);
    const manualAfter = postRows.find(
      (row) => row.id === postTargets.manual.id,
    )!;
    expect(manualAfter).toMatchObject({
      status: "planned",
      source: "manual",
      locked: false,
      plannedFor: "2026-08-25",
      time: "11:30:00",
      suggestedFor: "2026-08-23",
    });
    const lockedAfter = postRows.find(
      (row) => row.id === postTargets.locked.id,
    )!;
    expect(lockedAfter).toMatchObject({
      status: "planned",
      source: "suggested",
      locked: true,
      plannedFor: "2026-09-08",
      time: "15:45:00",
      suggestedFor: "2026-09-06",
    });
    const terminalAfter = postRows.find(
      (row) => row.id === postTargets.terminal.id,
    )!;
    expect(terminalAfter).toMatchObject({
      status: "cancelled",
      source: "suggested",
      locked: false,
      plannedFor: "2026-09-22",
      time: "16:15:00",
      suggestedFor: "2026-09-20",
    });
    expect(postRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Contrôler l’état post-partum de la mère",
          plannedFor: "2026-08-10",
          suggestedFor: "2026-08-10",
        }),
        expect.objectContaining({
          title: "Commencer la transition alimentaire des chiots",
          plannedFor: "2026-08-30",
          suggestedFor: "2026-08-30",
        }),
        expect.objectContaining({
          kind: "window",
          start: "2026-09-27",
          end: "2026-10-04",
          suggestedStart: "2026-09-27",
          suggestedEnd: "2026-10-04",
        }),
        expect.objectContaining({
          title: "Vermifuger les chiots",
          plannedFor: "2026-10-04",
          suggestedFor: "2026-10-04",
        }),
      ]),
    );

    const taskAuditRows = jsonSql<
      Array<{
        taskId: string;
        classification: string;
        previousRevisionNo: number;
        resultRevisionNo: number;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        matchesCurrent: boolean;
      }>
    >(`
      select json_agg(json_build_object(
        'taskId', change.task_id,
        'classification', change.classification,
        'previousRevisionNo', change.previous_revision_no,
        'resultRevisionNo', change.result_revision_no,
        'before', change.snapshot_before,
        'after', change.snapshot_after,
        'matchesCurrent', change.snapshot_after = to_jsonb(task)
      ) order by change.task_id)::text
      from public.litter_plan_actual_birth_reconciliation_task_changes change
      join public.litter_plan_actual_birth_reconciliations command on command.id = change.command_id
      join public.litter_care_tasks task on task.id = change.task_id
      where command.litter_id = ${q(ids.mainLitter)}::uuid;
    `);
    expect(taskAuditRows).toHaveLength(7);
    for (const audit of taskAuditRows) {
      expect(audit.before).toEqual(postBefore[audit.taskId]);
      expect(audit.resultRevisionNo).toBe(audit.previousRevisionNo + 1);
      expect(audit.matchesCurrent).toBe(true);
      expect(audit.after.revision_no).toBe(audit.resultRevisionNo);
    }

    const replayFingerprint = completeFingerprint(ids.mainLitter);
    const replay = await correctWhelpingBirthCore(mainCorrectionInput, owner);
    expect(replay).toEqual({ ...mainCorrection, replayed: true });
    expect(completeFingerprint(ids.mainLitter)).toEqual(replayFingerprint);
    const conflict = await correctWhelpingBirthCore(
      {
        ...mainCorrectionInput,
        occurredAt: "2026-08-09T00:06:00+02:00",
      },
      owner,
    );
    expect(conflict).toMatchObject({
      outcome: "error",
      error: { code: "conflict" },
    });
    expect(completeFingerprint(ids.mainLitter)).toEqual(replayFingerprint);

    const planAuditBeforeSecond = planAuditCount(ids.mainLitter);
    const planRevisionBeforeSecond = planRevision(ids.mainLitter);
    const secondCorrection = await correctWhelpingBirthCore(
      correctionInput(
        {
          birthId: mainSecond.birthId,
          animalId: mainSecond.animalId,
          sessionId: mainFirst.sessionId,
          revisionNo: 0,
        },
        ids.mainSecondCorrection,
        0,
        "2026-08-09T00:35:00+02:00",
      ),
      owner,
    );
    expect(secondCorrection).toMatchObject({
      outcome: "success",
      replayed: false,
      revisionNo: 1,
    });
    expect(planRevision(ids.mainLitter)).toBe(planRevisionBeforeSecond);
    expect(planAuditCount(ids.mainLitter)).toBe(planAuditBeforeSecond);

    const insertBirth = await createBirth(
      owner,
      ids.insertLitter,
      ids.insertOpen,
      ids.insertFirstBirth,
      "2026-08-08T03:00:00+02:00",
    );
    const insertRevisionBefore = planRevision(ids.insertLitter);
    const inserted = await correctWhelpingBirthCore(
      correctionInput(
        insertBirth,
        ids.insertCorrection,
        0,
        "2026-08-12T03:00:00+02:00",
      ),
      owner,
    );
    expect(inserted).toMatchObject({ outcome: "success", revisionNo: 1 });
    expect(planRevision(ids.insertLitter)).toBe(insertRevisionBefore + 1);
    expect(
      jsonSql<Record<string, unknown>>(`
        select json_build_object(
          'endsOn', series.ends_on,
          'through', series.materialized_through,
          'state', series.state,
          'reason', series.completion_reason,
          'count', series.materialized_occurrence_count,
          'identities', count(distinct (task.recurrence_day_no, task.slot_no)),
          'duplicates', count(*) - count(distinct (task.recurrence_day_no, task.slot_no)),
          'parents', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands where litter_id = ${q(ids.insertLitter)}::uuid),
          'restored', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_changes change join public.litter_plan_series_actual_birth_reconciliation_commands command on command.id = change.command_id where command.litter_id = ${q(ids.insertLitter)}::uuid and change.change_type = 'restored'),
          'inserted', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_changes change join public.litter_plan_series_actual_birth_reconciliation_commands command on command.id = change.command_id where command.litter_id = ${q(ids.insertLitter)}::uuid and change.change_type = 'inserted')
        )::text
        from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        join public.litter_care_tasks task on task.litter_plan_series_id = series.id
        where series.litter_id = ${q(ids.insertLitter)}::uuid
          and model.library_model_code = ${q(preModelCode)}
        group by series.id;
      `),
    ).toMatchObject({
      endsOn: "2026-08-12",
      through: "2026-08-12",
      state: "completed",
      reason: "actual_birth_reached",
      identities: 20,
      duplicates: 0,
      parents: 1,
      restored: 2,
      inserted: 6,
    });

    const rollbackBirth = await createBirth(
      owner,
      ids.rollbackLitter,
      ids.rollbackOpen,
      ids.rollbackFirstBirth,
      "2026-08-08T03:00:00+02:00",
    );
    sql(`
      begin;
      set local session_replication_role = replica;
      select pg_catalog.set_config('app.fixture_cleanup', 'on', true);
      delete from public.litter_care_tasks
      where id = (
        select task.id
        from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.rollbackLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and task.litter_plan_series_id is not null
        order by task.recurrence_day_no
        limit 1
      );
      commit;
    `);
    const rollbackBefore = completeFingerprint(ids.rollbackLitter);
    const rollbackInput = correctionInput(
      rollbackBirth,
      ids.rollbackCorrection,
      0,
      "2026-08-09T03:00:00+02:00",
    );
    const rollback = await owner.rpc("correct_whelping_birth", {
      p_birth_id: rollbackInput.birthId,
      p_client_command_id: rollbackInput.clientCommandId,
      p_expected_revision_no: rollbackInput.expectedRevisionNo,
      p_occurred_at: rollbackInput.occurredAt,
      p_sex: rollbackInput.sex,
      p_viability: rollbackInput.viability,
      p_initial_collar_color: rollbackInput.initialCollarColor,
      p_birth_note: rollbackInput.birthNote,
      p_weight_grams: rollbackInput.weightGrams,
      p_weight_measured_at: rollbackInput.weightMeasuredAt,
      p_weight_note: rollbackInput.weightNote,
      p_reason: rollbackInput.reason,
    });
    expect(rollback.error).toBeNull();
    expect(rollback.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "technical_error",
      birth_id: rollbackBirth.birthId,
      animal_id: null,
      event_id: null,
      weight_measurement_id: null,
      revision_no: null,
      event_sequence_no: null,
      replayed: false,
    });
    expect(completeFingerprint(ids.rollbackLitter)).toEqual(rollbackBefore);

    const concurrentBirth = await createBirth(
      owner,
      ids.concurrentLitter,
      ids.concurrentOpen,
      ids.concurrentFirstBirth,
      "2026-08-08T03:00:00+02:00",
    );
    const concurrentPlanRevision = planRevision(ids.concurrentLitter);
    const concurrentResults = await withTimeout(
      Promise.all([
        correctWhelpingBirthCore(
          correctionInput(
            concurrentBirth,
            ids.concurrentCorrectionA,
            0,
            "2026-08-09T03:00:00+02:00",
          ),
          owner,
        ),
        correctWhelpingBirthCore(
          correctionInput(
            concurrentBirth,
            ids.concurrentCorrectionB,
            0,
            "2026-08-10T03:00:00+02:00",
          ),
          secondOwner,
        ),
      ]),
      20_000,
    );
    expect(
      concurrentResults.map((result) =>
        result.outcome === "success" ? "success" : result.error.code,
      ).sort(),
    ).toEqual(["stale_revision", "success"]);
    expect(planRevision(ids.concurrentLitter)).toBe(
      concurrentPlanRevision + 1,
    );
    expect(planAuditCount(ids.concurrentLitter)).toBe(1);
    expect(adjustmentCount(ids.concurrentLitter)).toBe(1);
    expect(
      Number(sql(`
        select count(*) - count(distinct (litter_plan_series_id, recurrence_day_no, slot_no))
        from public.litter_care_tasks
        where litter_id = ${q(ids.concurrentLitter)}::uuid
          and litter_plan_series_id is not null;
      `)),
    ).toBe(0);

    const noPlanBirth = await createBirth(
      owner,
      ids.noPlanLitter,
      ids.noPlanOpen,
      ids.noPlanFirstBirth,
      "2026-08-08T03:00:00+02:00",
    );
    const noPlanCorrection = await correctWhelpingBirthCore(
      correctionInput(
        noPlanBirth,
        ids.noPlanCorrection,
        0,
        "2026-08-09T03:00:00+02:00",
      ),
      owner,
    );
    expect(noPlanCorrection).toMatchObject({ outcome: "success", revisionNo: 1 });
    expect(
      jsonSql<Record<string, unknown>>(`
        select json_build_object(
          'plans', (select count(*) from public.litter_plans where litter_id = ${q(ids.noPlanLitter)}::uuid),
          'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.noPlanLitter)}::uuid),
          'audits', count(*),
          'nullPlan', bool_and(litter_plan_id is null),
          'zeroCounters', bool_and(
            recalculated_item_count = 0
            and changed_task_count = 0
            and recalculated_series_count = 0
            and prebirth_series_reconciliation_count = 0
            and result->>'planChanged' = 'false'
          )
        )::text
        from public.litter_plan_actual_birth_reconciliations
        where litter_id = ${q(ids.noPlanLitter)}::uuid;
      `),
    ).toEqual({
      plans: 0,
      tasks: 0,
      audits: 1,
      nullPlan: true,
      zeroCounters: true,
    });

    const cancelBirth = await createBirth(
      owner,
      ids.cancelLitter,
      ids.cancelOpen,
      ids.cancelFirstBirth,
      "2026-08-08T03:00:00+02:00",
    );
    const cancelBefore = completeFingerprint(ids.cancelLitter);
    const cancelled = await cancelWhelpingBirthCore(
      {
        birthId: cancelBirth.birthId,
        clientCommandId: ids.cancelCommand,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T04:00:00+02:00",
        reason: "Naissance erronée",
      },
      owner,
    );
    expect(cancelled).toMatchObject({
      outcome: "error",
      error: { code: "birth_has_downstream_data" },
    });
    expect(completeFingerprint(ids.cancelLitter)).toEqual(cancelBefore);
    expect(sql(`
      select actual_birth_date::text from public.litters
      where id = ${q(ids.cancelLitter)}::uuid;
    `)).toBe("2026-08-08");
    expect(planAuditCount(ids.cancelLitter)).toBe(0);

    const invalidProbe = deniedCorrectionLockProbe({
      profileId: ownerId,
      birthId: null,
      commandId: ids.invalidCorrection,
      sex: "invalid",
    });
    expect(invalidProbe).toMatchObject({
      result: { outcome: "error", reason: "invalid_input" },
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });
    const missingProbe = deniedCorrectionLockProbe({
      profileId: ownerId,
      birthId: `${prefix}000000000099`,
      commandId: ids.missingCorrection,
    });
    expect(missingProbe).toMatchObject({
      result: { outcome: "error", reason: "birth_not_found" },
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });
    const viewerProbe = deniedCorrectionLockProbe({
      profileId: viewerId,
      birthId: mainFirst.birthId,
      commandId: ids.viewerCorrection,
      expectedRevision: 2,
    });
    expect(viewerProbe).toMatchObject({
      result: { outcome: "error", reason: "membership_required" },
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });
    const foreignProbe = deniedCorrectionLockProbe({
      profileId: memberId,
      birthId: mainFirst.birthId,
      commandId: ids.foreignCorrection,
      expectedRevision: 2,
    });
    expect(foreignProbe).toMatchObject({
      result: { outcome: "error", reason: "birth_not_found" },
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });
    const unauthenticated = await correctWhelpingBirthCore(
      correctionInput(
        mainFirst,
        `${prefix}000000000085`,
        2,
        "2026-08-09T00:10:00+02:00",
      ),
      anonymous,
    );
    expect(unauthenticated).toMatchObject({
      outcome: "error",
      error: { code: "unauthenticated" },
    });

    expect(noInventedFacts()).toEqual({
      observations: 0,
      observationLinks: 0,
      documents: 0,
      payments: 0,
      reservations: 0,
      emails: 0,
    });

    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    await expect(
      page.getByRole("heading", { name: "Mise-bas", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("9 août 2026, 00:05", { exact: true }),
    ).toBeVisible();
    const taskSection = page.locator("#litter-care-tasks");
    await expect(
      taskSection.getByText("Contrôler l’état post-partum de la mère"),
    ).toBeVisible();
    await expect(
      taskSection.getByText("Vermifuger les chiots"),
    ).toHaveCount(4);
    await expect(taskSection).toContainText("10 août 2026");
    await expect(taskSection).toContainText("23 août 2026");
    await expect(taskSection).toContainText("30 août 2026");
    await expect(taskSection).toContainText("04 octobre 2026");
    const preSeriesCard = page
      .locator("#litter-recurring-series article")
      .filter({ hasText: "Période de relevés de température" });
    await expect(preSeriesCard).toHaveAttribute(
      "data-series-state",
      "completed",
    );
    await expect(preSeriesCard).toContainText("Terminé");

    await page.goto(
      `/litters/journal/calendar?litter=${ids.mainLitter}&month=2026-08`,
    );
    await expect(page.locator("body")).toContainText("Calendrier de la portée");
    await expect(page.locator("body")).toContainText(
      "Contrôler l’état post-partum de la mère",
    );
    await page.goto("/calendar?month=2026-08");
    await expect(page.locator("body")).toContainText("Calendrier de l’élevage");
    await expect(page.locator("body")).not.toContainText(
      "Calendrier momentanément indisponible",
    );
    await page.goto("/calendar/today");
    await expect(page.locator("body")).toContainText("Aujourd’hui — élevage");
    await expect(page.locator("body")).not.toContainText(ids.mainLitter);

    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(durableCounts()).toEqual(durableExpected);

    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_RECONCILIATION_01_FIXTURES=${JSON.stringify({
        ids,
        mainCorrection,
        inserted,
        concurrentResults,
        planAudit: state.planAudit,
        classifications: state.classifications,
      })}`,
    );
  } finally {
    if (foreignMember) await foreignMember.auth.signOut();
    if (viewer) await viewer.auth.signOut();
    if (secondOwner) await secondOwner.auth.signOut();
    if (owner) await owner.auth.signOut();
    cleanup();
    expectCleanupAtZero();
    expect(durableCounts()).toEqual(durableExpected);
    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_RECONCILIATION_01_CLEANUP=${JSON.stringify(
        fixtureCounts(),
      )}`,
    );
  }
});

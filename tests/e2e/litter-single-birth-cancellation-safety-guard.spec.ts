import { expect, test } from "@playwright/test";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  cancelWhelpingBirthActionCore,
} from "../../src/features/whelping/whelping-actions-core";
import {
  cancelWhelpingBirthCore,
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

test.setTimeout(360_000);

type Supabase = SupabaseClient<Database>;

const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const viewerId = "10000000-0000-4000-8000-000000000003";
const durableOrganizationId = "20000000-0000-4000-8000-000000000001";
const prefix = "e7300006-0000-4000-8000-";
const like = "e7300006-%";
const preModelCode = "dog-pre-whelping-temperature-monitoring";
const postModelCode = "dog-postnatal-essential-care";

const ids = {
  organization: `${prefix}000000000001`,
  foreignOrganization: `${prefix}000000000002`,
  ownerMembership: `${prefix}000000000003`,
  viewerMembership: `${prefix}000000000004`,
  foreignMembership: `${prefix}000000000005`,
  plannedMother: `${prefix}000000000011`,
  noPlanMother: `${prefix}000000000012`,
  technicalMother: `${prefix}000000000013`,
  plannedLitter: `${prefix}000000000021`,
  noPlanLitter: `${prefix}000000000022`,
  technicalLitter: `${prefix}000000000023`,
  importModels: `${prefix}000000000031`,
  applyPre: `${prefix}000000000032`,
  applyPost: `${prefix}000000000033`,
  plannedOpen: `${prefix}000000000041`,
  noPlanOpen: `${prefix}000000000042`,
  technicalOpen: `${prefix}000000000043`,
  plannedFirstBirth: `${prefix}000000000051`,
  plannedSecondBirth: `${prefix}000000000052`,
  plannedConcurrentBirth: `${prefix}000000000053`,
  noPlanFirstBirth: `${prefix}000000000054`,
  technicalFirstBirth: `${prefix}000000000055`,
  blockedPlannedCancellation: `${prefix}000000000061`,
  blockedNoPlanCancellation: `${prefix}000000000062`,
  cancelNotLast: `${prefix}000000000063`,
  cancelSecond: `${prefix}000000000064`,
  concurrentCancellation: `${prefix}000000000065`,
  technicalCancellation: `${prefix}000000000066`,
  alreadyCancelled: `${prefix}000000000067`,
  anonymousProbe: `${prefix}000000000071`,
  invalidProbe: `${prefix}000000000072`,
  missingProbe: `${prefix}000000000073`,
  viewerProbe: `${prefix}000000000074`,
  foreignProbe: `${prefix}000000000075`,
  guardLockProbe: `${prefix}000000000076`,
  missingBirth: `${prefix}000000000091`,
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
  throw new Error("E2E SQL did not return a JSON value");
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
    delete from public.litter_plan_actual_birth_activation_deactivations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_states
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
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
    where organization_id in (
      ${q(ids.organization)}::uuid,
      ${q(ids.foreignOrganization)}::uuid
    ) or id::text like ${q(like)};
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
      'activation_deactivations', (select count(*) from public.litter_plan_actual_birth_activation_deactivations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activation_states', (select count(*) from public.litter_plan_actual_birth_activation_states where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
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
      'measurements', (select count(*) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'events', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'sessions', (select count(*) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'model_commands', (select count(*) from public.litter_planning_model_commands where organization_id = ${q(ids.organization)}::uuid),
      'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid),
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
      'imports', (select count(*) from public.litter_planning_model_library_import_commands where organization_id = ${q(ids.organization)}::uuid),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid),
      'litters', (select count(*) from public.litters where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'memberships', (select count(*) from public.memberships where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid) or id::text like ${q(like)}),
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
  sql(`
    insert into public.organizations (id, name, slug)
    values
      (${q(ids.organization)}::uuid, 'Garde annulation e7300006', 'garde-annulation-e7300006'),
      (${q(ids.foreignOrganization)}::uuid, 'Organisation étrangère e7300006', 'organisation-etrangere-e7300006');

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (${q(ids.ownerMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(ownerId)}::uuid, 'owner', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(ids.organization)}::uuid, ${q(viewerId)}::uuid, 'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(memberId)}::uuid, 'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (${q(ids.plannedMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère planning', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère sans plan', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.technicalMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère technique', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values
      (${q(ids.plannedLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée avec planning', 'dog', 'Golden Retriever', ${q(ids.plannedMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée sans plan actif', 'dog', 'Golden Retriever', ${q(ids.noPlanMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.technicalLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée technique sans activation', 'dog', 'Golden Retriever', ${q(ids.technicalMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function importModels(owner: Supabase) {
  const imported = await owner.rpc(
    "import_litter_planning_model_library_models",
    {
      p_organization_id: ids.organization,
      p_client_command_id: ids.importModels,
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
    replayed: false,
  });
}

function modelId(code: string) {
  return sql(`
    select id::text
    from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
      and library_model_code = ${q(code)}
      and library_model_version = 1;
  `);
}

function planRevision(litterId: string) {
  return Number(sql(`
    select revision
    from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id = ${q(litterId)}::uuid
      and status = 'active';
  `));
}

async function applyModel(
  owner: Supabase,
  code: string,
  commandId: string,
  expectedPlanRevision: number | null,
) {
  const applied = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.plannedLitter,
    p_planning_model_id: modelId(code),
    p_client_command_id: commandId,
    p_expected_model_revision: 1,
    p_expected_plan_revision: expectedPlanRevision,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");
}

async function openSession(
  owner: Supabase,
  litterId: string,
  commandId: string,
) {
  const result = await openWhelpingSessionCore(
    {
      litterId,
      clientCommandId: commandId,
      startedAt: "2026-08-08T02:30:00+02:00",
      timezoneName: "Europe/Paris",
      note: null,
    },
    owner,
  );
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Session did not open");
  return result;
}

async function recordBirth(
  owner: Supabase,
  sessionId: string,
  commandId: string,
  occurredAt: string,
  weightGrams: number | null = null,
) {
  const result = await recordWhelpingBirthCore(
    {
      sessionId,
      clientCommandId: commandId,
      occurredAt,
      sex: "unknown",
      viability: "unknown",
      initialCollarColor: null,
      birthWeightGrams: weightGrams,
      measuredAt: weightGrams === null ? null : occurredAt,
      note: null,
    },
    owner,
  );
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Birth did not succeed");
  return result;
}

function rows(table: string, predicate: string) {
  return `(select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id), '[]'::jsonb) from (select * from public.${table} where ${predicate}) row_data)`;
}

function completeFingerprint(litterId: string) {
  const litter = `${q(litterId)}::uuid`;
  const org = `${q(ids.organization)}::uuid`;
  return jsonSql<Record<string, unknown>>(`
    select jsonb_build_object(
      'births', (
        select coalesce(jsonb_agg(to_jsonb(birth) order by birth.id), '[]'::jsonb)
        from public.whelping_births birth
        join public.whelping_sessions session
          on session.organization_id = birth.organization_id
         and session.id = birth.session_id
        where session.organization_id = ${org}
          and session.litter_id = ${litter}
      ),
      'animals', ${rows("animals", `organization_id = ${org} and litter_id = ${litter}`)},
      'weights', (
        select coalesce(jsonb_agg(to_jsonb(measurement) order by measurement.id), '[]'::jsonb)
        from public.animal_weight_measurements measurement
        join public.animals animal
          on animal.organization_id = measurement.organization_id
         and animal.id = measurement.animal_id
        where animal.organization_id = ${org}
          and animal.litter_id = ${litter}
      ),
      'events', (
        select coalesce(jsonb_agg(to_jsonb(event) order by event.id), '[]'::jsonb)
        from public.whelping_events event
        join public.whelping_sessions session
          on session.organization_id = event.organization_id
         and session.id = event.session_id
        where session.organization_id = ${org}
          and session.litter_id = ${litter}
      ),
      'whelpingCommands', ${rows("whelping_commands", `organization_id = ${org} and litter_id = ${litter}`)},
      'adjustmentCommands', ${rows("whelping_birth_adjustment_commands", `organization_id = ${org} and litter_id = ${litter}`)},
      'litter', (select to_jsonb(litter) from public.litters litter where litter.organization_id = ${org} and litter.id = ${litter}),
      'activation', ${rows("litter_plan_actual_birth_activations", `organization_id = ${org} and litter_id = ${litter}`)},
      'plan', ${rows("litter_plans", `organization_id = ${org} and litter_id = ${litter}`)},
      'items', ${rows("litter_plan_items", `organization_id = ${org} and litter_id = ${litter}`)},
      'series', ${rows("litter_plan_series", `organization_id = ${org} and litter_id = ${litter}`)},
      'tasks', ${rows("litter_care_tasks", `organization_id = ${org} and litter_id = ${litter}`)},
      'planAudits', ${rows("litter_plan_actual_birth_reconciliations", `organization_id = ${org} and litter_id = ${litter}`)},
      'seriesAudits', ${rows("litter_plan_series_actual_birth_reconciliation_commands", `organization_id = ${org} and litter_id = ${litter}`)}
    )::text;
  `);
}

function planningFingerprint(litterId: string) {
  const litter = `${q(litterId)}::uuid`;
  const org = `${q(ids.organization)}::uuid`;
  return jsonSql<Record<string, unknown>>(`
    select jsonb_build_object(
      'activation', ${rows("litter_plan_actual_birth_activations", `organization_id = ${org} and litter_id = ${litter}`)},
      'plan', ${rows("litter_plans", `organization_id = ${org} and litter_id = ${litter}`)},
      'items', ${rows("litter_plan_items", `organization_id = ${org} and litter_id = ${litter}`)},
      'series', ${rows("litter_plan_series", `organization_id = ${org} and litter_id = ${litter}`)},
      'tasks', ${rows("litter_care_tasks", `organization_id = ${org} and litter_id = ${litter}`)},
      'planAudits', ${rows("litter_plan_actual_birth_reconciliations", `organization_id = ${org} and litter_id = ${litter}`)},
      'seriesAudits', ${rows("litter_plan_series_actual_birth_reconciliation_commands", `organization_id = ${org} and litter_id = ${litter}`)}
    )::text;
  `);
}

function activationState(litterId: string) {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'actualBirthDate', litter.actual_birth_date::text,
      'activeBirths', (
        select count(*)
        from public.whelping_births birth
        join public.whelping_sessions session
          on session.organization_id = birth.organization_id
         and session.id = birth.session_id
        where session.organization_id = litter.organization_id
          and session.litter_id = litter.id
          and birth.cancelled_at is null
      ),
      'activationCount', (
        select count(*) from public.litter_plan_actual_birth_activations activation
        where activation.organization_id = litter.organization_id
          and activation.litter_id = litter.id
      ),
      'activationPlanId', (
        select activation.litter_plan_id::text
        from public.litter_plan_actual_birth_activations activation
        where activation.organization_id = litter.organization_id
          and activation.litter_id = litter.id
      ),
      'materializedItems', (
        select count(*) from public.litter_plan_items item
        where item.organization_id = litter.organization_id
          and item.litter_id = litter.id
          and item.materialization_state = 'materialized'
      ),
      'postTasks', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where task.organization_id = litter.organization_id
          and task.litter_id = litter.id
          and model.library_model_code = ${q(postModelCode)}
      ),
      'completedPreSeries', (
        select count(*) from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where series.organization_id = litter.organization_id
          and series.litter_id = litter.id
          and model.library_model_code = ${q(preModelCode)}
          and series.state = 'completed'
          and series.completion_reason = 'actual_birth_reached'
      )
    )::text
    from public.litters litter
    where litter.id = ${q(litterId)}::uuid;
  `);
}

const nullableSql = (
  value: string | number | null,
  type: "uuid" | "text" | "integer" | "timestamptz",
) =>
  value === null
    ? `null::${type}`
    : `${typeof value === "number" ? value : q(value)}::${type}`;

type CancellationProbe = {
  profileId: string | null;
  birthId: string | null;
  commandId: string;
  revision?: number | null;
  cancelledAt?: string | null;
  reason?: string | null;
};

function cancellationLockProbe({
  profileId,
  birthId,
  commandId,
  revision = 0,
  cancelledAt = "2026-08-08T06:00:00+02:00",
  reason = "Contrôle des verrous",
}: CancellationProbe) {
  return jsonSql<{
    result: Record<string, unknown>;
    targetLockCount: number;
    backendAdvisoryLockCount: number;
    taskOrSeriesRelationLockCount: number;
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
      from public.cancel_whelping_birth(
        ${nullableSql(birthId, "uuid")},
        ${q(commandId)}::uuid,
        ${nullableSql(revision, "integer")},
        ${nullableSql(cancelledAt, "timestamptz")},
        ${nullableSql(reason, "text")}
      )
    ),
    lock_key as (
      select pg_catalog.hashtextextended(
        'litter_plan_mutation:' || ${q(ids.organization)}
          || ':' || ${q(ids.plannedLitter)},
        0
      ) as value
    ),
    held_locks as materialized (
      select
        count(*) filter (
          where lock.locktype = 'advisory'
            and lock.classid::bigint = ((lock_key.value >> 32) & 4294967295)
            and lock.objid::bigint = (lock_key.value & 4294967295)
        ) as target_lock_count,
        count(*) filter (
          where lock.locktype = 'advisory'
        ) as backend_advisory_lock_count,
        count(*) filter (
          where lock.relation in (
            'public.litter_care_tasks'::regclass,
            'public.litter_plan_series'::regclass
          )
        ) as task_or_series_relation_lock_count
      from denied
      cross join lock_key
      left join pg_catalog.pg_locks lock
        on lock.pid = pg_catalog.pg_backend_pid()
       and lock.granted
    )
    select json_build_object(
      'result', (select row_to_json(denied) from denied),
      'targetLockCount', held_locks.target_lock_count,
      'backendAdvisoryLockCount', held_locks.backend_advisory_lock_count,
      'taskOrSeriesRelationLockCount',
        held_locks.task_or_series_relation_lock_count
    )::text
    from held_locks;

    rollback;
  `);
}

function historicalErrorRow(birthId: string | null, reason: string) {
  return {
    outcome: "error",
    birth_id: birthId,
    animal_id: null,
    event_id: null,
    weight_measurement_id: null,
    revision_no: null,
    event_sequence_no: null,
    replayed: false,
    reason,
  };
}

function persistentTargetLockCount() {
  return Number(sql(`
    with lock_key as (
      select pg_catalog.hashtextextended(
        'litter_plan_mutation:' || ${q(ids.organization)}
          || ':' || ${q(ids.plannedLitter)},
        0
      ) as value
    )
    select count(*)
    from pg_catalog.pg_locks lock
    cross join lock_key
    where lock.locktype = 'advisory'
      and lock.granted
      and lock.classid::bigint = ((lock_key.value >> 32) & 4294967295)
      and lock.objid::bigint = (lock_key.value & 4294967295);
  `));
}

function securityState() {
  return jsonSql<Record<string, unknown>>(`
    with functions as (
      select
        procedure.proname as name,
        procedure.oid::text,
        procedure.prosecdef,
        procedure.proconfig,
        pg_get_userbyid(procedure.proowner) as owner,
        pg_get_expr(procedure.proargdefaults, 0) as defaults,
        pg_get_function_arguments(procedure.oid) as arguments,
        pg_get_function_result(procedure.oid) as result,
        encode(
          digest(
            convert_to(regexp_replace(procedure.prosrc, '\\s+', ' ', 'g'), 'UTF8'),
            'sha256'
          ),
          'hex'
        ) as body_hash,
        has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
        exists (
          select 1
          from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_execute
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'cancel_whelping_birth',
          'cancel_whelping_birth_core_internal'
        )
    )
    select json_build_object(
      'overloads', (
        select json_object_agg(name, overload_count)
        from (
          select procedure.proname as name, count(*) as overload_count
          from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname in (
              'cancel_whelping_birth',
              'cancel_whelping_birth_core_internal'
            )
          group by procedure.proname
        ) counts
      ),
      'functions', (
        select json_object_agg(name, json_build_object(
          'oid', oid,
          'owner', owner,
          'securityDefiner', prosecdef,
          'config', proconfig,
          'defaults', defaults,
          'arguments', arguments,
          'result', result,
          'bodyHash', body_hash,
          'authenticatedExecute', authenticated_execute,
          'anonExecute', anon_execute,
          'publicExecute', public_execute
        ))
        from functions
      )
    )::text;
  `);
}

function fixtureManifest() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'stableIds', ${q(JSON.stringify(ids))}::json,
      'generatedIds', json_build_object(
        'models', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
        'templates', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid),
        'plans', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid),
        'items', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid),
        'series', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid),
        'tasks', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid),
        'sessions', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid),
        'events', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid),
        'births', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid),
        'animals', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.animals where organization_id = ${q(ids.organization)}::uuid),
        'weights', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid),
        'activations', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.litter_plan_actual_birth_activations where organization_id = ${q(ids.organization)}::uuid),
        'adjustments', (select coalesce(json_agg(id::text order by id), '[]'::json) from public.whelping_birth_adjustment_commands where organization_id = ${q(ids.organization)}::uuid)
      )
    )::text;
  `);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Concurrent operations exceeded ${timeoutMs} ms`)),
        timeoutMs,
      );
    }),
  ]);
}

test("bloque atomiquement l’annulation irréversible de l’unique naissance", async () => {
  cleanup();
  expectCleanupAtZero();
  const durableBefore = durableCounts();
  expect(durableBefore).toEqual(durableExpected);

  let owner: Supabase | null = null;
  let secondOwner: Supabase | null = null;
  let viewer: Supabase | null = null;
  let foreignMember: Supabase | null = null;
  let manifest: Record<string, unknown> | null = null;
  let technicalActivationId: string | null = null;

  try {
    const security = securityState();
    expect(security).toMatchObject({
      overloads: {
        cancel_whelping_birth: 1,
        cancel_whelping_birth_core_internal: 1,
      },
      functions: {
        cancel_whelping_birth: {
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          defaults: null,
          authenticatedExecute: true,
          anonExecute: false,
          publicExecute: false,
        },
        cancel_whelping_birth_core_internal: {
          oid: "21411",
          owner: "postgres",
          securityDefiner: true,
          config: expect.arrayContaining([
            'search_path=""',
            "row_security=off",
          ]),
          defaults: null,
          bodyHash:
            "96d670397313a8322b3c1c1053369235ba9a74425a088205055a5638f9fe6516",
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
      },
    });
    const functions = security.functions as Record<
      string,
      { oid: string; arguments: string; result: string }
    >;
    expect(functions.cancel_whelping_birth.oid).not.toBe(
      functions.cancel_whelping_birth_core_internal.oid,
    );
    expect(functions.cancel_whelping_birth.arguments).toBe(
      functions.cancel_whelping_birth_core_internal.arguments,
    );
    expect(functions.cancel_whelping_birth.result).toBe(
      functions.cancel_whelping_birth_core_internal.result,
    );

    seedScope();
    owner = await createAuthenticatedSupabaseClient();
    secondOwner = await authenticatedClient(
      E2E_OWNER_EMAIL,
      E2E_OWNER_PASSWORD,
    );
    viewer = await authenticatedClient(
      E2E_VIEWER_EMAIL,
      E2E_VIEWER_PASSWORD,
    );
    foreignMember = await authenticatedClient(
      E2E_MEMBER_EMAIL,
      E2E_MEMBER_PASSWORD,
    );

    await importModels(owner);
    await applyModel(owner, preModelCode, ids.applyPre, null);
    await applyModel(
      owner,
      postModelCode,
      ids.applyPost,
      planRevision(ids.plannedLitter),
    );

    const plannedSession = await openSession(
      owner,
      ids.plannedLitter,
      ids.plannedOpen,
    );
    const noPlanSession = await openSession(
      owner,
      ids.noPlanLitter,
      ids.noPlanOpen,
    );
    const technicalSession = await openSession(
      owner,
      ids.technicalLitter,
      ids.technicalOpen,
    );

    const plannedFirst = await recordBirth(
      owner,
      plannedSession.sessionId,
      ids.plannedFirstBirth,
      "2026-08-08T03:00:00+02:00",
      420,
    );
    expect(activationState(ids.plannedLitter)).toMatchObject({
      actualBirthDate: "2026-08-08",
      activeBirths: 1,
      activationCount: 1,
      activationPlanId: expect.any(String),
      materializedItems: 7,
      postTasks: 7,
      completedPreSeries: 1,
    });

    const securityBefore = completeFingerprint(ids.plannedLitter);
    const anonymousProbe = cancellationLockProbe({
      profileId: null,
      birthId: null,
      commandId: ids.anonymousProbe,
      revision: -1,
      cancelledAt: null,
      reason: null,
    });
    expect(anonymousProbe).toEqual({
      result: historicalErrorRow(null, "not_authenticated"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
      taskOrSeriesRelationLockCount: 0,
    });

    const invalidProbe = cancellationLockProbe({
      profileId: ownerId,
      birthId: plannedFirst.birthId,
      commandId: ids.invalidProbe,
      revision: -1,
    });
    expect(invalidProbe).toEqual({
      result: historicalErrorRow(plannedFirst.birthId, "invalid_input"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
      taskOrSeriesRelationLockCount: 0,
    });

    const missingProbe = cancellationLockProbe({
      profileId: ownerId,
      birthId: ids.missingBirth,
      commandId: ids.missingProbe,
    });
    expect(missingProbe).toEqual({
      result: historicalErrorRow(ids.missingBirth, "birth_not_found"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
      taskOrSeriesRelationLockCount: 0,
    });

    const viewerProbe = cancellationLockProbe({
      profileId: viewerId,
      birthId: plannedFirst.birthId,
      commandId: ids.viewerProbe,
    });
    expect(viewerProbe).toEqual({
      result: historicalErrorRow(plannedFirst.birthId, "membership_required"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
      taskOrSeriesRelationLockCount: 0,
    });

    const foreignProbe = cancellationLockProbe({
      profileId: memberId,
      birthId: plannedFirst.birthId,
      commandId: ids.foreignProbe,
    });
    expect(foreignProbe).toEqual({
      result: historicalErrorRow(plannedFirst.birthId, "birth_not_found"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
      taskOrSeriesRelationLockCount: 0,
    });
    expect(completeFingerprint(ids.plannedLitter)).toEqual(securityBefore);

    const guardedProbe = cancellationLockProbe({
      profileId: ownerId,
      birthId: plannedFirst.birthId,
      commandId: ids.guardLockProbe,
    });
    expect(guardedProbe).toEqual({
      result: historicalErrorRow(
        plannedFirst.birthId,
        "birth_has_downstream_data",
      ),
      targetLockCount: 1,
      backendAdvisoryLockCount: 1,
      taskOrSeriesRelationLockCount: 0,
    });
    expect(persistentTargetLockCount()).toBe(0);
    expect(completeFingerprint(ids.plannedLitter)).toEqual(securityBefore);

    const plannedBlocked = await cancelWhelpingBirthCore(
      {
        birthId: plannedFirst.birthId,
        clientCommandId: ids.blockedPlannedCancellation,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T06:01:00+02:00",
        reason: "Annulation unique dangereuse",
      },
      owner,
    );
    expect(plannedBlocked).toMatchObject({
      outcome: "error",
      error: { code: "birth_has_downstream_data" },
    });
    expect(completeFingerprint(ids.plannedLitter)).toEqual(securityBefore);
    expect(persistentTargetLockCount()).toBe(0);

    const noPlanFirst = await recordBirth(
      owner,
      noPlanSession.sessionId,
      ids.noPlanFirstBirth,
      "2026-08-08T03:10:00+02:00",
    );
    expect(activationState(ids.noPlanLitter)).toMatchObject({
      actualBirthDate: "2026-08-08",
      activeBirths: 1,
      activationCount: 1,
      activationPlanId: null,
      materializedItems: 0,
      postTasks: 0,
      completedPreSeries: 0,
    });
    const noPlanBefore = completeFingerprint(ids.noPlanLitter);
    const noPlanBlocked = await cancelWhelpingBirthCore(
      {
        birthId: noPlanFirst.birthId,
        clientCommandId: ids.blockedNoPlanCancellation,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T06:02:00+02:00",
        reason: "Activation sans plan toujours irréversible",
      },
      owner,
    );
    expect(noPlanBlocked).toMatchObject({
      outcome: "error",
      error: { code: "birth_has_downstream_data" },
    });
    expect(completeFingerprint(ids.noPlanLitter)).toEqual(noPlanBefore);

    const plannedSecond = await recordBirth(
      owner,
      plannedSession.sessionId,
      ids.plannedSecondBirth,
      "2026-08-08T04:00:00+02:00",
    );
    const nonLast = await cancelWhelpingBirthCore(
      {
        birthId: plannedFirst.birthId,
        clientCommandId: ids.cancelNotLast,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T06:03:00+02:00",
        reason: "Naissance non dernière",
      },
      owner,
    );
    expect(nonLast).toMatchObject({
      outcome: "error",
      error: { code: "later_active_birth_exists" },
    });

    const planningBeforeSecondCancellation = planningFingerprint(
      ids.plannedLitter,
    );
    const secondCancellationInput = {
      birthId: plannedSecond.birthId,
      clientCommandId: ids.cancelSecond,
      expectedRevisionNo: 0,
      cancelledAt: "2026-08-08T06:04:00+02:00",
      reason: "Seconde naissance erronée",
    };
    const cancelledSecond = await cancelWhelpingBirthCore(
      secondCancellationInput,
      owner,
    );
    expect(cancelledSecond).toMatchObject({
      outcome: "success",
      revisionNo: 1,
      replayed: false,
    });
    expect(activationState(ids.plannedLitter)).toMatchObject({
      actualBirthDate: "2026-08-08",
      activeBirths: 1,
      activationCount: 1,
      postTasks: 7,
      completedPreSeries: 1,
    });
    expect(planningFingerprint(ids.plannedLitter)).toEqual(
      planningBeforeSecondCancellation,
    );
    expect(
      Number(sql(`
        select count(*) from public.whelping_birth_adjustment_commands
        where client_command_id = ${q(ids.cancelSecond)}::uuid
          and command_type = 'cancel_birth';
      `)),
    ).toBe(1);

    const replayedSecond = await cancelWhelpingBirthCore(
      secondCancellationInput,
      owner,
    );
    expect(replayedSecond).toEqual({ ...cancelledSecond, replayed: true });
    const afterReplay = completeFingerprint(ids.plannedLitter);
    const conflictingSecond = await cancelWhelpingBirthCore(
      {
        ...secondCancellationInput,
        reason: "Payload divergent",
      },
      owner,
    );
    expect(conflictingSecond).toMatchObject({
      outcome: "error",
      error: { code: "conflict" },
    });
    const alreadyCancelledSecond = await cancelWhelpingBirthCore(
      {
        ...secondCancellationInput,
        clientCommandId: ids.alreadyCancelled,
      },
      owner,
    );
    expect(alreadyCancelledSecond).toMatchObject({
      outcome: "error",
      error: { code: "birth_cancelled" },
    });
    expect(completeFingerprint(ids.plannedLitter)).toEqual(afterReplay);

    const technicalFirst = await recordBirth(
      owner,
      technicalSession.sessionId,
      ids.technicalFirstBirth,
      "2026-08-08T03:20:00+02:00",
    );
    const capturedTechnicalActivationId = sql(`
      select id::text
      from public.litter_plan_actual_birth_activations
      where organization_id = ${q(ids.organization)}::uuid
        and litter_id = ${q(ids.technicalLitter)}::uuid;
    `);
    technicalActivationId = capturedTechnicalActivationId;
    expect(technicalActivationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    sql(`
      begin;
      set local session_replication_role = replica;
      delete from public.litter_plan_actual_birth_activation_states
      where organization_id = ${q(ids.organization)}::uuid
        and litter_id = ${q(ids.technicalLitter)}::uuid
        and current_activation_id = ${q(capturedTechnicalActivationId)}::uuid;
      delete from public.litter_plan_actual_birth_activations
      where organization_id = ${q(ids.organization)}::uuid
        and litter_id = ${q(ids.technicalLitter)}::uuid
        and id = ${q(capturedTechnicalActivationId)}::uuid;
      set local session_replication_role = origin;
      commit;
    `);
    expect(activationState(ids.technicalLitter)).toMatchObject({
      activeBirths: 1,
      activationCount: 0,
      activationPlanId: null,
    });
    const technicalCancellation = await cancelWhelpingBirthCore(
      {
        birthId: technicalFirst.birthId,
        clientCommandId: ids.technicalCancellation,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T06:05:00+02:00",
        reason: "Fixture technique historique sans activation",
      },
      owner,
    );
    expect(technicalCancellation).toMatchObject({
      outcome: "success",
      replayed: false,
      revisionNo: 1,
    });
    expect(activationState(ids.technicalLitter)).toMatchObject({
      actualBirthDate: "2026-08-08",
      activeBirths: 0,
      activationCount: 0,
    });

    const concurrent = await withTimeout(
      Promise.all([
        cancelWhelpingBirthCore(
          {
            birthId: plannedFirst.birthId,
            clientCommandId: ids.concurrentCancellation,
            expectedRevisionNo: 0,
            cancelledAt: "2026-08-08T06:06:00+02:00",
            reason: "Course annulation et nouvelle naissance",
          },
          owner,
        ),
        recordWhelpingBirthCore(
          {
            sessionId: plannedSession.sessionId,
            clientCommandId: ids.plannedConcurrentBirth,
            occurredAt: "2026-08-08T05:00:00+02:00",
            sex: "unknown",
            viability: "unknown",
            initialCollarColor: null,
            birthWeightGrams: null,
            measuredAt: null,
            note: null,
          },
          secondOwner,
        ),
      ]),
      15_000,
    );
    expect(concurrent[1]).toMatchObject({
      outcome: "success",
      replayed: false,
    });
    expect(concurrent[0].outcome).toBe("error");
    if (concurrent[0].outcome !== "error") {
      throw new Error("Concurrent cancellation unexpectedly succeeded");
    }
    expect([
      "birth_has_downstream_data",
      "later_active_birth_exists",
    ]).toContain(concurrent[0].error.code);
    expect(
      Number(sql(`
        select count(*)
        from public.whelping_births birth
        join public.whelping_sessions session
          on session.organization_id = birth.organization_id
         and session.id = birth.session_id
        where session.litter_id = ${q(ids.plannedLitter)}::uuid
          and birth.cancelled_at is null;
      `)),
    ).toBeGreaterThanOrEqual(1);
    expect(persistentTargetLockCount()).toBe(0);

    const interfaceResult = await cancelWhelpingBirthActionCore(
      {
        litterId: ids.plannedLitter,
        sessionId: plannedSession.sessionId,
        birthId: plannedFirst.birthId,
        animalId: plannedFirst.animalId,
        expectedRevisionNo: 0,
        clientCommandId: crypto.randomUUID(),
      },
      { status: "idle" },
      new FormData(),
      {
        cancelBirth: async () => ({
          outcome: "error",
          error: {
            code: "birth_has_downstream_data",
            message: "blocked",
          },
        } as const),
        correctBirth: async () => {
          throw new Error("not used");
        },
        revalidatePath: () => undefined,
      },
    );
    expect(interfaceResult).toEqual({
      status: "error",
      message: "La date d’annulation est invalide.",
    });

    const interfaceForm = new FormData();
    interfaceForm.set("cancelled_at", "2026-08-08T06:07:00+02:00");
    interfaceForm.set("reason", "Contrôle interface");
    const mappedInterfaceResult = await cancelWhelpingBirthActionCore(
      {
        litterId: ids.plannedLitter,
        sessionId: plannedSession.sessionId,
        birthId: plannedFirst.birthId,
        animalId: plannedFirst.animalId,
        expectedRevisionNo: 0,
        clientCommandId: crypto.randomUUID(),
      },
      { status: "idle" },
      interfaceForm,
      {
        cancelBirth: async () => ({
          outcome: "error",
          error: {
            code: "birth_has_downstream_data",
            message: "blocked",
          },
        } as const),
        correctBirth: async () => {
          throw new Error("not used");
        },
        revalidatePath: () => undefined,
      },
    );
    expect(mappedInterfaceResult).toEqual({
      status: "error",
      message:
        "Cette naissance possède déjà des données ultérieures. Elle ne peut plus être annulée, mais ses informations peuvent éventuellement être corrigées.",
    });
    expect(JSON.stringify(mappedInterfaceResult)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );

    expect(durableCounts()).toEqual(durableBefore);
    manifest = {
      ...fixtureManifest(),
      deletedDuringScenario: { technicalActivationId },
    };
    console.info(
      `LITTER_SINGLE_BIRTH_CANCELLATION_SAFETY_GUARD_01_FIXTURES=${JSON.stringify(manifest)}`,
    );
  } finally {
    if (foreignMember) await foreignMember.auth.signOut();
    if (viewer) await viewer.auth.signOut();
    if (secondOwner) await secondOwner.auth.signOut();
    if (owner) await owner.auth.signOut();
    cleanup();
    expectCleanupAtZero();
    expect(durableCounts()).toEqual(durableBefore);
    console.info(
      `LITTER_SINGLE_BIRTH_CANCELLATION_SAFETY_GUARD_01_CLEANUP=${JSON.stringify({
        prefix,
        created: manifest,
        deletedDuringScenario: { technicalActivationId },
        deleted: fixtureCounts(),
        growthComparison: durableCounts(),
      })}`,
    );
  }
});

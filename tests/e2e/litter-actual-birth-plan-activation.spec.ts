import { expect, test, type Page } from "@playwright/test";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
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
const prefix = "e7300002-0000-4000-8000-";
const like = "e7300002-%";
const missingSessionId = `${prefix}000000000099`;
const preModelCode = "dog-pre-whelping-temperature-monitoring";
const postModelCode = "dog-postnatal-essential-care";

const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  mainMother: `${prefix}000000000003`,
  rollbackMother: `${prefix}000000000004`,
  concurrentMother: `${prefix}000000000005`,
  viewerMembership: `${prefix}000000000006`,
  foreignOrganization: `${prefix}000000000007`,
  foreignMembership: `${prefix}000000000008`,
  mainLitter: `${prefix}000000000011`,
  rollbackLitter: `${prefix}000000000012`,
  concurrentLitter: `${prefix}000000000013`,
  importCommand: `${prefix}000000000020`,
  mainPreApplyCommand: `${prefix}000000000021`,
  mainPostApplyCommand: `${prefix}000000000022`,
  rollbackPostApplyCommand: `${prefix}000000000023`,
  concurrentPostApplyCommand: `${prefix}000000000024`,
  mainOpenCommand: `${prefix}000000000031`,
  mainFirstBirthCommand: `${prefix}000000000032`,
  mainSecondBirthCommand: `${prefix}000000000033`,
  rollbackOpenCommand: `${prefix}000000000034`,
  rollbackBirthCommand: `${prefix}000000000035`,
  concurrentOpenCommand: `${prefix}000000000036`,
  concurrentBirthOneCommand: `${prefix}000000000037`,
  concurrentBirthTwoCommand: `${prefix}000000000038`,
  unauthenticatedBirthCommand: `${prefix}000000000039`,
  viewerBirthCommand: `${prefix}000000000040`,
  foreignBirthCommand: `${prefix}000000000041`,
  nullSessionBirthCommand: `${prefix}000000000042`,
  missingInvalidBirthCommand: `${prefix}000000000043`,
  missingValidBirthCommand: `${prefix}000000000044`,
  viewerInvalidBirthCommand: `${prefix}000000000045`,
  foreignInvalidBirthCommand: `${prefix}000000000046`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const historicalErrorRow = (reason: string) => ({
  outcome: "error",
  birth_id: null,
  event_id: null,
  animal_id: null,
  weight_measurement_id: null,
  event_sequence_no: null,
  birth_order: null,
  replayed: false,
  reason,
});

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

    delete from public.litter_plan_actual_birth_activation_reversal_changes
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_reversal_snapshots
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
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
    delete from public.litter_care_tasks
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or creation_command_id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots
    where organization_id = ${q(ids.organization)}::uuid
       or series_id in (
         select id
         from public.litter_plan_series
         where litter_id::text like ${q(like)}
       );
    delete from public.litter_plan_series
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
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
    where organization_id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};

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
    where id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};

    commit;
  `);
}

function fixtureCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'activation_deactivations', (select count(*) from public.litter_plan_actual_birth_activation_deactivations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or birth_adjustment_client_command_id::text like ${q(like)}),
      'activation_states', (select count(*) from public.litter_plan_actual_birth_activation_states where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activations', (select count(*) from public.litter_plan_actual_birth_activations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or whelping_client_command_id::text like ${q(like)}),
      'observations', (select count(*) from public.maternal_observations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'observation_commands', (select count(*) from public.maternal_observation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'observation_links', (select count(*) from public.maternal_observation_task_links where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or creation_command_id::text like ${q(like)}),
      'series_slots', (
        select count(*) from public.litter_plan_series_time_slots slot
        where slot.organization_id = ${q(ids.organization)}::uuid
           or slot.series_id in (
             select id
             from public.litter_plan_series
             where litter_id::text like ${q(like)}
           )
      ),
      'series_materialization_commands', (select count(*) from public.litter_plan_series_materialization_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'series_state_commands', (select count(*) from public.litter_plan_series_state_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'anchor_commands', (select count(*) from public.litter_plan_anchor_recalculation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'ad_hoc_commands', (select count(*) from public.litter_plan_ad_hoc_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'application_commands', (select count(*) from public.litter_plan_application_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'plan_items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'whelping_adjustments', (select count(*) from public.whelping_birth_adjustment_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'whelping_commands', (select count(*) from public.whelping_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'measurements', (select count(*) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'events', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'sessions', (select count(*) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or id::text like ${q(like)}),
      'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'model_commands', (select count(*) from public.litter_planning_model_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid),
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
      'import_commands', (select count(*) from public.litter_planning_model_library_import_commands where organization_id = ${q(ids.organization)}::uuid or client_command_id::text like ${q(like)}),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'litters', (select count(*) from public.litters where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'memberships', (select count(*) from public.memberships where organization_id = ${q(ids.organization)}::uuid or id::text like ${q(like)}),
      'organizations', (select count(*) from public.organizations where id = ${q(ids.organization)}::uuid or id::text like ${q(like)})
    )::text;
  `);
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(fixtureCounts())) {
    expect(count, `${table} fixtures must be physically deleted`).toBe(0);
  }
}

function growthComparisonSnapshot() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (select count(*) from public.animals where id::text like 'd3c9000%'),
      'litters', (select count(*) from public.litters where id::text like 'd3c90001-%'),
      'sessions', (select count(*) from public.whelping_sessions where id::text like 'd3c90005-%'),
      'events', (select count(*) from public.whelping_events where id::text like 'd3c90006-%'),
      'births', (select count(*) from public.whelping_births where id::text like 'd3c90007-%'),
      'weighing_sessions', (select count(*) from public.litter_weighing_sessions where id::text like 'd3c90009-%'),
      'measurements', (
        select count(*) from public.animal_weight_measurements
        where id::text like 'd3c90008-%' or id::text like 'd3c9000a-%'
      )
    )::text;
  `);
}

function durableOrganizationTemporaryCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)}),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)}),
      'activations', (select count(*) from public.litter_plan_actual_birth_activations where organization_id = ${q(durableOrganizationId)}::uuid and whelping_client_command_id::text like ${q(like)}),
      'whelping_commands', (select count(*) from public.whelping_commands where organization_id = ${q(durableOrganizationId)}::uuid and client_command_id::text like ${q(like)}),
      'planning_commands', (select count(*) from public.litter_plan_application_commands where organization_id = ${q(durableOrganizationId)}::uuid and client_command_id::text like ${q(like)})
    )::text;
  `);
}

function seedScope() {
  sql(`
    insert into public.organizations (id, name, slug)
    values
      (
        ${q(ids.organization)}::uuid,
        'Activation naissance e7300002',
        'activation-naissance-e7300002'
      ),
      (
        ${q(ids.foreignOrganization)}::uuid,
        'Organisation étrangère e7300002',
        'organisation-etrangere-e7300002'
      );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (
        ${q(ids.membership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(ownerId)}::uuid,
        'owner',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.viewerMembership)}::uuid,
        ${q(ids.organization)}::uuid,
        ${q(viewerId)}::uuid,
        'viewer',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignMembership)}::uuid,
        ${q(ids.foreignOrganization)}::uuid,
        ${q(memberId)}::uuid,
        'member',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (
        ${q(ids.mainMother)}::uuid, ${q(ids.organization)}::uuid,
        'Mère activation principale', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.rollbackMother)}::uuid, ${q(ids.organization)}::uuid,
        'Mère activation rollback', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.concurrentMother)}::uuid, ${q(ids.organization)}::uuid,
        'Mère activation concurrence', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values
      (
        ${q(ids.mainLitter)}::uuid, ${q(ids.organization)}::uuid,
        'Portée activation principale', 'dog', 'Golden Retriever',
        ${q(ids.mainMother)}::uuid, 'birth_expected', '2026-06-07',
        '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.rollbackLitter)}::uuid, ${q(ids.organization)}::uuid,
        'Portée activation rollback', 'dog', 'Golden Retriever',
        ${q(ids.rollbackMother)}::uuid, 'birth_expected', '2026-06-07',
        '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.concurrentLitter)}::uuid, ${q(ids.organization)}::uuid,
        'Portée activation concurrence', 'dog', 'Golden Retriever',
        ${q(ids.concurrentMother)}::uuid, 'birth_expected', '2026-06-07',
        '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
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
  return Number(
    sql(`
      select revision
      from public.litter_plans
      where organization_id = ${q(ids.organization)}::uuid
        and litter_id = ${q(litterId)}::uuid
        and status = 'active';
    `),
  );
}

function authorizationMutationSnapshot() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'targetEvents', (
        select count(*) from public.whelping_events event
        join public.whelping_sessions session on session.id = event.session_id
        where session.litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'targetBirths', (
        select count(*) from public.whelping_births birth
        join public.whelping_sessions session on session.id = birth.session_id
        where session.litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'targetOffspring', (
        select count(*) from public.animals
        where litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'targetActivations', (
        select count(*) from public.litter_plan_actual_birth_activations
        where litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'targetPostTasks', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
      ),
      'targetCommands', (
        select count(*) from public.whelping_commands
        where litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'targetRevision', (
        select revision from public.litter_plans
        where litter_id = ${q(ids.mainLitter)}::uuid
          and status = 'active'
      ),
      'foreignEvents', (
        select count(*) from public.whelping_events
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      ),
      'foreignBirths', (
        select count(*) from public.whelping_births
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      ),
      'foreignAnimals', (
        select count(*) from public.animals
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      ),
      'foreignCommands', (
        select count(*) from public.whelping_commands
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      ),
      'foreignActivations', (
        select count(*) from public.litter_plan_actual_birth_activations
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      ),
      'foreignTasks', (
        select count(*) from public.litter_care_tasks
        where organization_id = ${q(ids.foreignOrganization)}::uuid
      )
    )::text;
  `);
}

async function rawBirthAttempt(
  client: Supabase,
  sessionId: string,
  commandId: string,
) {
  return client.rpc("record_whelping_birth", {
    p_session_id: sessionId,
    p_client_command_id: commandId,
    p_occurred_at: "2026-08-08T03:00:00+02:00",
    p_sex: "unknown",
    p_viability: "unknown",
    p_initial_collar_color: null,
    p_weight_grams: null,
    p_measured_at: null,
    p_note: null,
  });
}

type BirthLockProbeInput = {
  profileId: string | null;
  sessionId: string | null;
  commandId: string;
  occurredAt?: string | null;
  sex?: string | null;
  viability?: string | null;
  initialCollarColor?: string | null;
  weightGrams?: number | null;
  measuredAt?: string | null;
  note?: string | null;
};

const nullableSql = (
  value: string | number | null,
  type: "uuid" | "text" | "integer" | "timestamptz",
) =>
  value === null
    ? `null::${type}`
    : `${typeof value === "number" ? value : q(value)}::${type}`;

function deniedBirthLockProbe({
  profileId,
  sessionId,
  commandId,
  occurredAt = "2026-08-08T03:00:00+02:00",
  sex = "unknown",
  viability = "unknown",
  initialCollarColor = null,
  weightGrams = null,
  measuredAt = null,
  note = null,
}: BirthLockProbeInput) {
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
      from public.record_whelping_birth(
        ${nullableSql(sessionId, "uuid")},
        ${q(commandId)}::uuid,
        ${nullableSql(occurredAt, "timestamptz")},
        ${nullableSql(sex, "text")},
        ${nullableSql(viability, "text")},
        ${nullableSql(initialCollarColor, "text")},
        ${nullableSql(weightGrams, "integer")},
        ${nullableSql(measuredAt, "timestamptz")},
        ${nullableSql(note, "text")}
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

async function applyModel(
  owner: Supabase,
  litterId: string,
  code: string,
  commandId: string,
  expectedPlanRevision: number | null,
) {
  const applied = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
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

function preBirthState(litterId: string) {
  return jsonSql<Record<string, number | null>>(`
    select json_build_object(
      'preMaterializedItems', (
        select count(*) from public.litter_plan_items item
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where item.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(preModelCode)}
          and item.materialization_state = 'materialized'
      ),
      'postPendingItems', (
        select count(*) from public.litter_plan_items item
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where item.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and item.materialization_state = 'pending_anchor'
      ),
      'preOccurrences', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where task.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(preModelCode)}
          and task.litter_plan_series_id is not null
      ),
      'postSeries', (
        select count(*) from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where series.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(postModelCode)}
      ),
      'postSeriesOccurrences', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where task.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and task.litter_plan_series_id is not null
      ),
      'postTasks', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model
          on model.id = item.source_planning_model_id
        where task.litter_id = ${q(litterId)}::uuid
          and model.library_model_code = ${q(postModelCode)}
      )
    )::text;
  `);
}

function mainActivationState() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'actualBirthDate', (select actual_birth_date::text from public.litters where id = ${q(ids.mainLitter)}::uuid),
      'sessions', (select count(*) from public.whelping_sessions where litter_id = ${q(ids.mainLitter)}::uuid),
      'events', (
        select count(*) from public.whelping_events event
        join public.whelping_sessions session on session.id = event.session_id
        where session.litter_id = ${q(ids.mainLitter)}::uuid and event.event_type = 'birth'
      ),
      'births', (
        select count(*) from public.whelping_births birth
        join public.whelping_sessions session on session.id = birth.session_id
        where session.litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'offspring', (select count(*) from public.animals where litter_id = ${q(ids.mainLitter)}::uuid),
      'weights', (
        select count(*) from public.animal_weight_measurements measurement
        join public.animals animal on animal.id = measurement.animal_id
        where animal.litter_id = ${q(ids.mainLitter)}::uuid
      ),
      'postMaterializedItems', (
        select count(*) from public.litter_plan_items item
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where item.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and item.materialization_state = 'materialized'
          and item.anchor_resolution_source = 'actual_birth'
          and item.anchor_source_date_snapshot = '2026-08-08'
          and item.anchor_adjustment_days = 0
          and item.anchor_date_snapshot = '2026-08-08'
      ),
      'postTasks', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
      ),
      'postOccurrences', (
        select count(*) from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
          and task.litter_plan_series_id is not null
      ),
      'postRows', (
        select json_agg(json_build_object(
          'title', task.title,
          'kind', task.item_kind,
          'date', task.planned_for::text,
          'time', task.scheduled_local_time::text,
          'start', task.retained_starts_on::text,
          'end', task.retained_ends_on::text,
          'status', task.status,
          'source', task.schedule_source,
          'locked', task.is_schedule_locked,
          'fact', item.completion_fact_kind
        ) order by coalesce(task.planned_for, task.retained_starts_on), task.scheduled_local_time nulls first)
        from public.litter_care_tasks task
        join public.litter_plan_items item on item.id = task.litter_plan_item_id
        join public.litter_planning_models model on model.id = item.source_planning_model_id
        where task.litter_id = ${q(ids.mainLitter)}::uuid
          and model.library_model_code = ${q(postModelCode)}
      ),
      'preSeries', (
        select json_build_object(
          'endsOn', series.ends_on::text,
          'state', series.state,
          'completionReason', series.completion_reason,
          'notApplicable', count(task.id) filter (
            where task.status = 'not_applicable'
              and task.planned_for = '2026-08-09'
          ),
          'plannedAfterBirth', count(task.id) filter (
            where task.status = 'planned'
              and task.planned_for > '2026-08-08'
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
      'activation', (
        select json_build_object(
          'count', count(*),
          'previousRevision', min(previous_plan_revision),
          'resultRevision', min(result_plan_revision),
          'materializedItems', min(materialized_item_count),
          'createdTasks', min(created_task_count),
          'createdOccurrences', min(created_series_occurrence_count),
          'reconciledSeries', min(reconciled_series_count),
          'notApplicableOccurrences', min(not_applicable_occurrence_count)
        )
        from public.litter_plan_actual_birth_activations
        where litter_id = ${q(ids.mainLitter)}::uuid
      )
    )::text;
  `);
}

function noInventedFacts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'observations', (select count(*) from public.maternal_observations where organization_id = ${q(ids.organization)}::uuid),
      'observationLinks', (select count(*) from public.maternal_observation_task_links where organization_id = ${q(ids.organization)}::uuid),
      'weights', (select count(*) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid),
      'documents', (select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid),
      'payments', (select count(*) from public.payments where organization_id = ${q(ids.organization)}::uuid),
      'reservations', (select count(*) from public.reservations where organization_id = ${q(ids.organization)}::uuid),
      'emails', (select count(*) from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid)
    )::text;
  `);
}

function fixtureManifest() {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'directIds', json_build_object(
        'organization', ${q(ids.organization)},
        'membership', ${q(ids.membership)},
        'viewerMembership', ${q(ids.viewerMembership)},
        'foreignOrganization', ${q(ids.foreignOrganization)},
        'foreignMembership', ${q(ids.foreignMembership)},
        'mainMother', ${q(ids.mainMother)},
        'rollbackMother', ${q(ids.rollbackMother)},
        'concurrentMother', ${q(ids.concurrentMother)},
        'mainLitter', ${q(ids.mainLitter)},
        'rollbackLitter', ${q(ids.rollbackLitter)},
        'concurrentLitter', ${q(ids.concurrentLitter)}
      ),
      'models', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_planning_models
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'templates', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_care_task_templates
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'plans', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plans
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'planItems', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plan_items
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'series', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plan_series
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'seriesSlots', (
        select coalesce(json_agg(slot.id::text order by slot.id), '[]'::json)
        from public.litter_plan_series_time_slots slot
        join public.litter_plan_series series on series.id = slot.series_id
        where series.organization_id = ${q(ids.organization)}::uuid
      ),
      'tasks', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_care_tasks
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'sessions', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.whelping_sessions
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'events', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.whelping_events
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'births', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.whelping_births
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'animals', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.animals
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'whelpingCommands', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.whelping_commands
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'activations', (
        select coalesce(json_agg(id::text order by id), '[]'::json)
        from public.litter_plan_actual_birth_activations
        where organization_id = ${q(ids.organization)}::uuid
      )
    )::text;
  `);
}

function securityState() {
  return jsonSql<Record<string, unknown>>(`
    with functions as (
      select
        procedure.proname as name,
        procedure.oid,
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
          'record_whelping_birth',
          'record_whelping_birth_core_internal',
          'activate_litter_plan_on_first_birth_internal'
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
      'coreBodyHash', (
        select md5(replace(
          pg_get_functiondef(procedure.oid),
          'record_whelping_birth_core_internal',
          'record_whelping_birth'
        ))
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'record_whelping_birth_core_internal'
      ),
      'activationTableRls', (
        select relrowsecurity from pg_catalog.pg_class
        where oid = 'public.litter_plan_actual_birth_activations'::regclass
      ),
      'activationPolicies', (
        select count(*) from pg_catalog.pg_policy
        where polrelid = 'public.litter_plan_actual_birth_activations'::regclass
      ),
      'authenticatedTableAccess', has_table_privilege(
        'authenticated',
        'public.litter_plan_actual_birth_activations',
        'SELECT,INSERT,UPDATE,DELETE'
      ),
      'anonTableAccess', has_table_privilege(
        'anon',
        'public.litter_plan_actual_birth_activations',
        'SELECT,INSERT,UPDATE,DELETE'
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
        () => reject(new Error(`Concurrent birth calls exceeded ${timeoutMs} ms`)),
        timeoutMs,
      );
    }),
  ]);
}

test("active atomiquement le planning à la première naissance", async ({
  page,
}) => {
  cleanup();
  expectCleanupAtZero();

  const growthBefore = growthComparisonSnapshot();
  const durableBefore = durableOrganizationTemporaryCounts();
  expect(growthBefore).toEqual({
    animals: 13,
    litters: 2,
    sessions: 2,
    events: 11,
    births: 9,
    weighing_sessions: 62,
    measurements: 286,
  });
  expect(durableBefore).toEqual({
    models: 0,
    templates: 0,
    plans: 0,
    activations: 0,
    whelping_commands: 0,
    planning_commands: 0,
  });

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
  try {
    const security = securityState();
    expect(security).toMatchObject({
      functions: {
        record_whelping_birth: {
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
        record_whelping_birth_core_internal: {
          oid: expect.any(String),
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
        activate_litter_plan_on_first_birth_internal: {
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
      coreBodyHash: "8d49f49b5d55a1fd449737a4d3e5c301",
      activationTableRls: true,
      activationPolicies: 0,
      authenticatedTableAccess: false,
      anonTableAccess: false,
    });
    const functionSecurity = security.functions as Record<
      string,
      { oid: string }
    >;
    expect(functionSecurity.record_whelping_birth.oid).not.toBe(
      functionSecurity.record_whelping_birth_core_internal.oid,
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
    await importModels(owner);

    await applyModel(
      owner,
      ids.mainLitter,
      preModelCode,
      ids.mainPreApplyCommand,
      null,
    );
    await applyModel(
      owner,
      ids.mainLitter,
      postModelCode,
      ids.mainPostApplyCommand,
      planRevision(ids.mainLitter),
    );

    expect(preBirthState(ids.mainLitter)).toEqual({
      preMaterializedItems: 3,
      postPendingItems: 4,
      preOccurrences: 14,
      postSeries: 1,
      postSeriesOccurrences: 0,
      postTasks: 0,
    });

    const revisionBefore = planRevision(ids.mainLitter);
    const opened = await openWhelpingSessionCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: ids.mainOpenCommand,
        startedAt: "2026-08-08T02:45:00+02:00",
        timezoneName: "Europe/Paris",
        note: null,
      },
      owner,
    );
    expect(opened.outcome).toBe("success");
    if (opened.outcome !== "success") {
      throw new Error("Main whelping session did not open");
    }

    const authorizationBefore = authorizationMutationSnapshot();
    expect(authorizationBefore).toEqual({
      targetEvents: 0,
      targetBirths: 0,
      targetOffspring: 0,
      targetActivations: 0,
      targetPostTasks: 0,
      targetCommands: 1,
      targetRevision: revisionBefore,
      foreignEvents: 0,
      foreignBirths: 0,
      foreignAnimals: 0,
      foreignCommands: 0,
      foreignActivations: 0,
      foreignTasks: 0,
    });

    const unauthenticatedProbe = deniedBirthLockProbe({
      profileId: null,
      sessionId: null,
      commandId: ids.unauthenticatedBirthCommand,
      sex: "invalid",
    });
    expect(unauthenticatedProbe).toEqual({
      result: historicalErrorRow("not_authenticated"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const nullSessionProbe = deniedBirthLockProbe({
      profileId: ownerId,
      sessionId: null,
      commandId: ids.nullSessionBirthCommand,
    });
    expect(nullSessionProbe).toEqual({
      result: historicalErrorRow("invalid_input"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const missingInvalidProbe = deniedBirthLockProbe({
      profileId: ownerId,
      sessionId: missingSessionId,
      commandId: ids.missingInvalidBirthCommand,
      sex: "invalid",
    });
    expect(missingInvalidProbe).toEqual({
      result: historicalErrorRow("invalid_input"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const missingValidProbe = deniedBirthLockProbe({
      profileId: ownerId,
      sessionId: missingSessionId,
      commandId: ids.missingValidBirthCommand,
    });
    expect(missingValidProbe).toEqual({
      result: historicalErrorRow("session_not_found"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const foreignInvalidProbe = deniedBirthLockProbe({
      profileId: memberId,
      sessionId: opened.sessionId,
      commandId: ids.foreignInvalidBirthCommand,
      sex: "invalid",
    });
    expect(foreignInvalidProbe).toEqual({
      result: historicalErrorRow("invalid_input"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const foreignDenied = await rawBirthAttempt(
      foreignMember,
      opened.sessionId,
      ids.foreignBirthCommand,
    );
    expect(foreignDenied.error).toBeNull();
    expect(foreignDenied.data?.[0]).toEqual(
      historicalErrorRow("session_not_found"),
    );
    const foreignValidProbe = deniedBirthLockProbe({
      profileId: memberId,
      sessionId: opened.sessionId,
      commandId: ids.foreignBirthCommand,
    });
    expect(foreignValidProbe).toEqual({
      result: foreignDenied.data?.[0],
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const viewerInvalidProbe = deniedBirthLockProbe({
      profileId: viewerId,
      sessionId: opened.sessionId,
      commandId: ids.viewerInvalidBirthCommand,
      weightGrams: 400,
      measuredAt: null,
    });
    expect(viewerInvalidProbe).toEqual({
      result: historicalErrorRow("invalid_input"),
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    const viewerDenied = await rawBirthAttempt(
      viewer,
      opened.sessionId,
      ids.viewerBirthCommand,
    );
    expect(viewerDenied.error).toBeNull();
    expect(viewerDenied.data?.[0]).toEqual(
      historicalErrorRow("membership_required"),
    );
    const viewerValidProbe = deniedBirthLockProbe({
      profileId: viewerId,
      sessionId: opened.sessionId,
      commandId: ids.viewerBirthCommand,
    });
    expect(viewerValidProbe).toEqual({
      result: viewerDenied.data?.[0],
      targetLockCount: 0,
      backendAdvisoryLockCount: 0,
    });

    expect(authorizationMutationSnapshot()).toEqual(authorizationBefore);
    expect(planRevision(ids.mainLitter)).toBe(revisionBefore);

    const firstBirthInput = {
      sessionId: opened.sessionId,
      clientCommandId: ids.mainFirstBirthCommand,
      occurredAt: "2026-08-08T03:00:00+02:00",
      sex: "unknown" as const,
      viability: "unknown" as const,
      initialCollarColor: null,
      note: null,
    };
    const firstBirth = await recordWhelpingBirthCore(firstBirthInput, owner);
    expect(firstBirth).toMatchObject({
      outcome: "success",
      birthOrder: 1,
      eventSequenceNo: 1,
      weightMeasurementId: null,
      replayed: false,
    });
    if (firstBirth.outcome !== "success") {
      throw new Error("First birth did not succeed");
    }

    expect(mainActivationState()).toEqual({
      actualBirthDate: "2026-08-08",
      sessions: 1,
      events: 1,
      births: 1,
      offspring: 1,
      weights: 0,
      postMaterializedItems: 4,
      postTasks: 7,
      postOccurrences: 4,
      postRows: [
        {
          title: "Contrôler l’état post-partum de la mère",
          kind: "task",
          date: "2026-08-09",
          time: null,
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title: "Vermifuger les chiots",
          kind: "recurring_task",
          date: "2026-08-22",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title: "Commencer la transition alimentaire des chiots",
          kind: "task",
          date: "2026-08-29",
          time: null,
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title: "Vermifuger les chiots",
          kind: "recurring_task",
          date: "2026-09-05",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title: "Vermifuger les chiots",
          kind: "recurring_task",
          date: "2026-09-19",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title:
            "Visite vétérinaire — examen, identification et vaccination",
          kind: "window",
          date: null,
          time: null,
          start: "2026-09-26",
          end: "2026-10-03",
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
        {
          title: "Vermifuger les chiots",
          kind: "recurring_task",
          date: "2026-10-03",
          time: "09:00:00",
          start: null,
          end: null,
          status: "planned",
          source: "suggested",
          locked: false,
          fact: null,
        },
      ],
      preSeries: {
        endsOn: "2026-08-08",
        state: "completed",
        completionReason: "actual_birth_reached",
        notApplicable: 2,
        plannedAfterBirth: 0,
      },
      activation: {
        count: 1,
        previousRevision: revisionBefore,
        resultRevision: revisionBefore + 1,
        materializedItems: 4,
        createdTasks: 7,
        createdOccurrences: 4,
        reconciledSeries: 1,
        notApplicableOccurrences: 2,
      },
    });
    expect(planRevision(ids.mainLitter)).toBe(revisionBefore + 1);

    const replay = await recordWhelpingBirthCore(firstBirthInput, owner);
    expect(replay).toEqual({ ...firstBirth, replayed: true });
    expect(planRevision(ids.mainLitter)).toBe(revisionBefore + 1);
    expect(mainActivationState()).toMatchObject({
      births: 1,
      offspring: 1,
      postTasks: 7,
      postOccurrences: 4,
      activation: { count: 1 },
    });

    const secondBirth = await recordWhelpingBirthCore(
      {
        sessionId: opened.sessionId,
        clientCommandId: ids.mainSecondBirthCommand,
        occurredAt: "2026-08-08T04:00:00+02:00",
        sex: "unknown",
        viability: "unknown",
      },
      owner,
    );
    expect(secondBirth).toMatchObject({
      outcome: "success",
      birthOrder: 2,
      replayed: false,
      weightMeasurementId: null,
    });
    expect(planRevision(ids.mainLitter)).toBe(revisionBefore + 1);
    expect(mainActivationState()).toMatchObject({
      actualBirthDate: "2026-08-08",
      events: 2,
      births: 2,
      offspring: 2,
      weights: 0,
      postTasks: 7,
      postOccurrences: 4,
      activation: { count: 1 },
    });

    await applyModel(
      owner,
      ids.rollbackLitter,
      postModelCode,
      ids.rollbackPostApplyCommand,
      null,
    );
    const rollbackRevision = planRevision(ids.rollbackLitter);
    expect(preBirthState(ids.rollbackLitter)).toMatchObject({
      postPendingItems: 4,
      postSeries: 1,
      postSeriesOccurrences: 0,
      postTasks: 0,
    });
    sql(`
      set session_replication_role = replica;
      delete from public.litter_plan_series
      where litter_id = ${q(ids.rollbackLitter)}::uuid;
      set session_replication_role = origin;
    `);
    const rollbackOpened = await openWhelpingSessionCore(
      {
        litterId: ids.rollbackLitter,
        clientCommandId: ids.rollbackOpenCommand,
        startedAt: "2026-08-08T02:45:00+02:00",
        timezoneName: "Europe/Paris",
        note: null,
      },
      owner,
    );
    expect(rollbackOpened.outcome).toBe("success");
    if (rollbackOpened.outcome !== "success") {
      throw new Error("Rollback whelping session did not open");
    }
    const rollbackBirth = await owner.rpc("record_whelping_birth", {
      p_session_id: rollbackOpened.sessionId,
      p_client_command_id: ids.rollbackBirthCommand,
      p_occurred_at: "2026-08-08T03:00:00+02:00",
      p_sex: "unknown",
      p_viability: "unknown",
      p_initial_collar_color: null,
      p_weight_grams: null,
      p_measured_at: null,
      p_note: null,
    });
    expect(rollbackBirth.error).not.toBeNull();
    expect(rollbackBirth.error?.message).toContain(
      "pending recurring first-birth item must have exactly one series",
    );
    expect(
      jsonSql<Record<string, unknown>>(`
        select json_build_object(
          'events', (
            select count(*) from public.whelping_events event
            join public.whelping_sessions session on session.id = event.session_id
            where session.litter_id = ${q(ids.rollbackLitter)}::uuid
          ),
          'births', (
            select count(*) from public.whelping_births birth
            join public.whelping_sessions session on session.id = birth.session_id
            where session.litter_id = ${q(ids.rollbackLitter)}::uuid
          ),
          'offspring', (select count(*) from public.animals where litter_id = ${q(ids.rollbackLitter)}::uuid),
          'actualBirthDate', (select actual_birth_date::text from public.litters where id = ${q(ids.rollbackLitter)}::uuid),
          'pendingItems', (select count(*) from public.litter_plan_items where litter_id = ${q(ids.rollbackLitter)}::uuid and materialization_state = 'pending_anchor'),
          'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.rollbackLitter)}::uuid),
          'activations', (select count(*) from public.litter_plan_actual_birth_activations where litter_id = ${q(ids.rollbackLitter)}::uuid),
          'revision', (select revision from public.litter_plans where litter_id = ${q(ids.rollbackLitter)}::uuid)
        )::text;
      `),
    ).toEqual({
      events: 0,
      births: 0,
      offspring: 0,
      actualBirthDate: null,
      pendingItems: 4,
      tasks: 0,
      activations: 0,
      revision: rollbackRevision,
    });

    await applyModel(
      owner,
      ids.concurrentLitter,
      postModelCode,
      ids.concurrentPostApplyCommand,
      null,
    );
    const concurrentRevision = planRevision(ids.concurrentLitter);
    const concurrentOpened = await openWhelpingSessionCore(
      {
        litterId: ids.concurrentLitter,
        clientCommandId: ids.concurrentOpenCommand,
        startedAt: "2026-08-08T02:45:00+02:00",
        timezoneName: "Europe/Paris",
        note: null,
      },
      owner,
    );
    expect(concurrentOpened.outcome).toBe("success");
    if (concurrentOpened.outcome !== "success") {
      throw new Error("Concurrent whelping session did not open");
    }

    const concurrentResults = await withTimeout(
      Promise.all([
        recordWhelpingBirthCore(
          {
            sessionId: concurrentOpened.sessionId,
            clientCommandId: ids.concurrentBirthOneCommand,
            occurredAt: "2026-08-08T03:00:00+02:00",
            sex: "unknown",
            viability: "unknown",
          },
          owner,
        ),
        recordWhelpingBirthCore(
          {
            sessionId: concurrentOpened.sessionId,
            clientCommandId: ids.concurrentBirthTwoCommand,
            occurredAt: "2026-08-08T04:00:00+02:00",
            sex: "unknown",
            viability: "unknown",
          },
          secondOwner,
        ),
      ]),
      15_000,
    );
    expect(concurrentResults).toEqual([
      expect.objectContaining({ outcome: "success", replayed: false }),
      expect.objectContaining({ outcome: "success", replayed: false }),
    ]);
    expect(
      concurrentResults
        .map((result) =>
          result.outcome === "success" ? result.birthOrder : null,
        )
        .sort(),
    ).toEqual([1, 2]);
    expect(
      jsonSql<Record<string, number>>(`
        select json_build_object(
          'births', (
            select count(*) from public.whelping_births birth
            join public.whelping_sessions session on session.id = birth.session_id
            where session.litter_id = ${q(ids.concurrentLitter)}::uuid
          ),
          'offspring', (select count(*) from public.animals where litter_id = ${q(ids.concurrentLitter)}::uuid),
          'activations', (select count(*) from public.litter_plan_actual_birth_activations where litter_id = ${q(ids.concurrentLitter)}::uuid),
          'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.concurrentLitter)}::uuid),
          'revision', (select revision from public.litter_plans where litter_id = ${q(ids.concurrentLitter)}::uuid)
        )::text;
      `),
    ).toEqual({
      births: 2,
      offspring: 2,
      activations: 1,
      tasks: 7,
      revision: concurrentRevision + 1,
    });

    expect(noInventedFacts()).toEqual({
      observations: 0,
      observationLinks: 0,
      weights: 0,
      documents: 0,
      payments: 0,
      reservations: 0,
      emails: 0,
    });

    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    const whelpingPanel = page
      .getByRole("heading", { name: "Mise-bas", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(whelpingPanel.getByText("Naissance n° 1")).toBeVisible();
    const taskSection = page.locator("#litter-care-tasks");
    await expect(
      taskSection.getByText("Contrôler l’état post-partum de la mère"),
    ).toBeVisible();
    await expect(
      taskSection.getByText("Vermifuger les chiots"),
    ).toHaveCount(4);
    await expect(
      taskSection.getByText(
        "Visite vétérinaire — examen, identification et vaccination",
      ),
    ).toBeVisible();
    const preBirthSeriesCard = page
      .locator("#litter-recurring-series article")
      .filter({ hasText: "Période de relevés de température" });
    await expect(preBirthSeriesCard).toHaveAttribute(
      "data-series-state",
      "completed",
    );
    await expect(preBirthSeriesCard).toContainText("Terminé");
    await expect(taskSection).toContainText("09 août 2026");
    await expect(taskSection).toContainText("22 août 2026");
    await expect(taskSection).toContainText("05 septembre 2026");
    await expect(taskSection).toContainText("19 septembre 2026");
    await expect(taskSection).toContainText("03 octobre 2026");
    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    expect(growthComparisonSnapshot()).toEqual(growthBefore);
    expect(durableOrganizationTemporaryCounts()).toEqual(durableBefore);

    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_ACTIVATION_01_FIXTURES=${JSON.stringify({
        manifest: fixtureManifest(),
        commandIds: ids,
        mainFirstBirth: firstBirth,
        mainSecondBirth: secondBirth,
        concurrentBirths: concurrentResults,
      })}`,
    );
  } finally {
    if (foreignMember) await foreignMember.auth.signOut();
    if (viewer) await viewer.auth.signOut();
    if (secondOwner) await secondOwner.auth.signOut();
    if (owner) await owner.auth.signOut();
    cleanup();
    expectCleanupAtZero();
    expect(growthComparisonSnapshot()).toEqual(growthBefore);
    expect(durableOrganizationTemporaryCounts()).toEqual(durableBefore);
    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_ACTIVATION_01_CLEANUP=${JSON.stringify(
        fixtureCounts(),
      )}`,
    );
  }
});

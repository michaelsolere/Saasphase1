import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

type Supabase = SupabaseClient<Database>;

const ownerId = "10000000-0000-4000-8000-000000000001";
const durableOrganizationId = "20000000-0000-4000-8000-000000000001";
const prefix = "e7300004-0000-4000-8000-";
const like = "e7300004-%";
const modelCode = "dog-pre-whelping-temperature-monitoring";

const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  restoreMother: `${prefix}000000000011`,
  insertMother: `${prefix}000000000012`,
  maxMother: `${prefix}000000000013`,
  concurrentMother: `${prefix}000000000014`,
  cancelMother: `${prefix}000000000015`,
  inconsistentMother: `${prefix}000000000016`,
  restoreLitter: `${prefix}000000000021`,
  insertLitter: `${prefix}000000000022`,
  maxLitter: `${prefix}000000000023`,
  concurrentLitter: `${prefix}000000000024`,
  cancelLitter: `${prefix}000000000025`,
  inconsistentLitter: `${prefix}000000000026`,
  importCommand: `${prefix}000000000031`,
  restoreApply: `${prefix}000000000032`,
  insertApply: `${prefix}000000000033`,
  maxApply: `${prefix}000000000034`,
  concurrentApply: `${prefix}000000000035`,
  cancelApply: `${prefix}000000000036`,
  inconsistentApply: `${prefix}000000000037`,
  restoreOpen: `${prefix}000000000041`,
  insertOpen: `${prefix}000000000042`,
  maxOpen: `${prefix}000000000043`,
  concurrentOpen: `${prefix}000000000044`,
  cancelOpen: `${prefix}000000000045`,
  inconsistentOpen: `${prefix}000000000046`,
  restoreBirth: `${prefix}000000000051`,
  insertBirth: `${prefix}000000000052`,
  maxBirth: `${prefix}000000000053`,
  concurrentBirth: `${prefix}000000000054`,
  cancelBirth: `${prefix}000000000055`,
  inconsistentBirth: `${prefix}000000000056`,
  restoreCorrection: `${prefix}000000000061`,
  insertCorrection: `${prefix}000000000062`,
  contractionCorrection: `${prefix}000000000063`,
  maxCorrection: `${prefix}000000000064`,
  noDateCorrection: `${prefix}000000000065`,
  concurrentCorrectionA: `${prefix}000000000066`,
  concurrentRevert: `${prefix}000000000067`,
  concurrentCorrectionB: `${prefix}000000000068`,
  cancellationCommand: `${prefix}000000000069`,
  inconsistentCorrection: `${prefix}00000000006a`,
  publicMaterialization: `${prefix}000000000071`,
  missingAdjustment: `${prefix}000000000072`,
  manualReschedule: `${prefix}000000000073`,
  lockedSchedule: `${prefix}000000000074`,
  doneResolution: `${prefix}000000000081`,
  cancelledResolution: `${prefix}000000000082`,
  incompatibleResolution: `${prefix}000000000083`,
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

function cleanup() {
  sql(`
    begin;
    set local session_replication_role = replica;
    select pg_catalog.set_config('app.fixture_cleanup', 'on', true);

    delete from public.litter_plan_actual_birth_reconciliation_task_changes
    where organization_id = ${q(ids.organization)}::uuid
       or command_id in (
         select id
         from public.litter_plan_actual_birth_reconciliations
         where litter_id::text like ${q(like)}
       );
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
    delete from public.litter_plan_series_time_slots slot
    using public.litter_plan_series series
    where slot.series_id = series.id
      and (
        series.organization_id = ${q(ids.organization)}::uuid
        or series.litter_id::text like ${q(like)}
      );
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
    where id = ${q(ids.organization)}::uuid
       or id::text like ${q(like)};

    set local session_replication_role = origin;
    commit;
  `);
}

function fixtureCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'plan_reconciliation_changes', (
        select count(*) from public.litter_plan_actual_birth_reconciliation_task_changes
        where organization_id = ${q(ids.organization)}::uuid
           or command_id in (
             select id
             from public.litter_plan_actual_birth_reconciliations
             where litter_id::text like ${q(like)}
           )
      ),
      'plan_reconciliations', (
        select count(*) from public.litter_plan_actual_birth_reconciliations
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or birth_adjustment_client_command_id::text like ${q(like)}
      ),
      'reconciliation_changes', (
        select count(*) from public.litter_plan_series_actual_birth_reconciliation_changes
        where organization_id = ${q(ids.organization)}::uuid
           or command_id::text like ${q(like)}
           or task_id::text like ${q(like)}
      ),
      'reconciliation_commands', (
        select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or birth_adjustment_client_command_id::text like ${q(like)}
      ),
      'activation_deactivations', (
        select count(*) from public.litter_plan_actual_birth_activation_deactivations
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or birth_adjustment_client_command_id::text like ${q(like)}
      ),
      'activation_states', (
        select count(*) from public.litter_plan_actual_birth_activation_states
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'activations', (
        select count(*) from public.litter_plan_actual_birth_activations
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or whelping_client_command_id::text like ${q(like)}
      ),
      'observation_links', (
        select count(*) from public.maternal_observation_task_links
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'observation_commands', (
        select count(*) from public.maternal_observation_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'observations', (
        select count(*) from public.maternal_observations
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'schedule_changes', (
        select count(*) from public.litter_care_task_schedule_changes
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'schedule_commands', (
        select count(*) from public.litter_care_task_schedule_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'materialization_commands', (
        select count(*) from public.litter_plan_series_materialization_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'state_commands', (
        select count(*) from public.litter_plan_series_state_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'anchor_commands', (
        select count(*) from public.litter_plan_anchor_recalculation_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'ad_hoc_commands', (
        select count(*) from public.litter_plan_ad_hoc_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'application_commands', (
        select count(*) from public.litter_plan_application_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or creation_command_id::text like ${q(like)}
      ),
      'slots', (
        select count(*) from public.litter_plan_series_time_slots
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'series', (
        select count(*) from public.litter_plan_series
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'items', (
        select count(*) from public.litter_plan_items
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'plans', (
        select count(*) from public.litter_plans
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
      ),
      'adjustments', (
        select count(*) from public.whelping_birth_adjustment_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'whelping_commands', (
        select count(*) from public.whelping_commands
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or client_command_id::text like ${q(like)}
      ),
      'measurements', (
        select count(*) from public.animal_weight_measurements
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'births', (
        select count(*) from public.whelping_births
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'events', (
        select count(*) from public.whelping_events
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'sessions', (
        select count(*) from public.whelping_sessions
        where organization_id = ${q(ids.organization)}::uuid
           or litter_id::text like ${q(like)}
           or id::text like ${q(like)}
      ),
      'model_slots', (
        select count(*) from public.litter_planning_model_item_time_slots
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'model_commands', (
        select count(*) from public.litter_planning_model_commands
        where organization_id = ${q(ids.organization)}::uuid
           or client_command_id::text like ${q(like)}
      ),
      'model_items', (
        select count(*) from public.litter_planning_model_items
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'models', (
        select count(*) from public.litter_planning_models
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'import_commands', (
        select count(*) from public.litter_planning_model_library_import_commands
        where organization_id = ${q(ids.organization)}::uuid
           or client_command_id::text like ${q(like)}
      ),
      'templates', (
        select count(*) from public.litter_care_task_templates
        where organization_id = ${q(ids.organization)}::uuid
      ),
      'animals', (
        select count(*) from public.animals
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'litters', (
        select count(*) from public.litters
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'memberships', (
        select count(*) from public.memberships
        where organization_id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      ),
      'organizations', (
        select count(*) from public.organizations
        where id = ${q(ids.organization)}::uuid
           or id::text like ${q(like)}
      )
    )::text;
  `);
}

function durableCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (select count(*) from public.animals where id::text like 'd3c9%'),
      'litters', (select count(*) from public.litters where id::text like 'd3c9%'),
      'sessions', (select count(*) from public.whelping_sessions where id::text like 'd3c9%'),
      'events', (select count(*) from public.whelping_events where id::text like 'd3c9%'),
      'births', (select count(*) from public.whelping_births where id::text like 'd3c9%'),
      'weighing_sessions', (
        select count(*) from public.litter_weighing_sessions where id::text like 'd3c9%'
      ),
      'measurements', (
        select count(*) from public.animal_weight_measurements where id::text like 'd3c9%'
      ),
      'temporary_rows', (
        select
          (select count(*) from public.litter_plan_series where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)})
          + (select count(*) from public.litter_care_tasks where organization_id = ${q(durableOrganizationId)}::uuid and id::text like ${q(like)})
          + (select count(*) from public.whelping_birth_adjustment_commands where organization_id = ${q(durableOrganizationId)}::uuid and client_command_id::text like ${q(like)})
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
    values (
      ${q(ids.organization)}::uuid,
      'Réconciliation naissance e7300004',
      'reconciliation-naissance-e7300004'
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.membership)}::uuid,
      ${q(ids.organization)}::uuid,
      ${q(ownerId)}::uuid,
      'owner',
      'active',
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (${q(ids.restoreMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère restauration', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.insertMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère extension', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.maxMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère plafond', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère concurrence', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère annulation', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère automatique incohérente', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values
      (${q(ids.restoreLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée restauration', 'dog', 'Golden Retriever', ${q(ids.restoreMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.insertLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée extension', 'dog', 'Golden Retriever', ${q(ids.insertMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.maxLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée plafond', 'dog', 'Golden Retriever', ${q(ids.maxMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée concurrence', 'dog', 'Golden Retriever', ${q(ids.concurrentMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée annulation', 'dog', 'Golden Retriever', ${q(ids.cancelMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée automatique incohérente', 'dog', 'Golden Retriever', ${q(ids.inconsistentMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function importAndApply(owner: Supabase) {
  const imported = await owner.rpc(
    "import_litter_planning_model_library_models",
    {
      p_organization_id: ids.organization,
      p_client_command_id: ids.importCommand,
      p_selection: [{ code: modelCode, version: 1 }] as Json,
      p_is_active: true,
    },
  );
  expect(imported.error).toBeNull();
  expect(imported.data?.[0]).toMatchObject({
    outcome: "success",
    imported_count: 1,
  });

  const modelId = sql(`
    select id::text
    from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
      and library_model_code = ${q(modelCode)}
      and library_model_version = 1;
  `);

  const applications = [
    [ids.restoreLitter, ids.restoreApply],
    [ids.insertLitter, ids.insertApply],
    [ids.maxLitter, ids.maxApply],
    [ids.concurrentLitter, ids.concurrentApply],
    [ids.cancelLitter, ids.cancelApply],
    [ids.inconsistentLitter, ids.inconsistentApply],
  ] as const;

  for (const [litterId, commandId] of applications) {
    const applied = await owner.rpc("apply_litter_planning_model", {
      p_litter_id: litterId,
      p_planning_model_id: modelId,
      p_client_command_id: commandId,
      p_expected_model_revision: 1,
      p_expected_plan_revision: null,
      p_selected_model_item_ids: null,
      p_timezone_name: "Europe/Paris",
    });
    expect(applied.error).toBeNull();
    expect(applied.data?.[0]?.outcome).toBe("success");
  }
}

type BirthFixture = {
  birthId: string;
  sessionId: string;
  revisionNo: number;
};

async function recordFirstBirth(
  owner: Supabase,
  litterId: string,
  openCommand: string,
  birthCommand: string,
): Promise<BirthFixture> {
  const opened = await openWhelpingSessionCore(
    {
      litterId,
      clientCommandId: openCommand,
      startedAt: "2026-08-07T00:00:00+02:00",
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
      occurredAt: "2026-08-08T03:00:00+02:00",
      sex: "unknown",
      viability: "unknown",
      initialCollarColor: null,
      birthWeightGrams: null,
      measuredAt: null,
      note: null,
    },
    owner,
  );
  expect(birth.outcome).toBe("success");
  if (birth.outcome !== "success") throw new Error("Birth recording failed");

  return {
    birthId: birth.birthId,
    sessionId: opened.sessionId,
    revisionNo: 0,
  };
}

async function correctBirth(
  _owner: Supabase,
  fixture: BirthFixture,
  commandId: string,
  expectedRevisionNo: number,
  occurredAt: string,
  sex: "male" | "female" | "unknown" = "unknown",
) {
  const corrected = jsonSql<{
    outcome: string;
    revision_no: number | null;
    reason: string | null;
  }>(`
    begin;
    select pg_catalog.set_config(
      'request.jwt.claim.sub',
      ${q(ownerId)},
      true
    );
    select row_to_json(corrected)::text
    from public.correct_whelping_birth_core_internal(
      ${q(fixture.birthId)}::uuid,
      ${q(commandId)}::uuid,
      ${expectedRevisionNo},
      ${q(occurredAt)}::timestamptz,
      ${q(sex)},
      'unknown',
      null,
      null,
      null,
      null,
      null,
      ${q(`Correction auditée ${commandId.slice(-4)}`)}
    ) corrected;
    commit;
  `);
  expect(corrected.outcome).toBe("success");
  if (corrected.outcome !== "success" || corrected.revision_no === null) {
    throw new Error(`Correction failed: ${corrected.reason}`);
  }
  return corrected.revision_no;
}

function seriesId(litterId: string) {
  return sql(`
    select series.id::text
    from public.litter_plan_series series
    where series.organization_id = ${q(ids.organization)}::uuid
      and series.litter_id = ${q(litterId)}::uuid
      and series.end_kind = 'actual_birth';
  `);
}

function seriesRevision(targetSeriesId: string) {
  return Number(sql(`
    select revision_no
    from public.litter_plan_series
    where id = ${q(targetSeriesId)}::uuid;
  `));
}

type ReconciliationResult = {
  outcome: "success" | "error";
  reason: string | null;
  replayed: boolean;
  series_id: string;
  revision_no: number;
  restored_occurrence_count: number;
  inserted_occurrence_count: number;
  not_applicable_occurrence_count: number;
  skipped_identical_count: number;
  ends_on: string | null;
  materialized_through: string | null;
  materialized_occurrence_count: number | null;
  result: Record<string, unknown>;
};

function reconciliationSql(
  targetSeriesId: string,
  birthId: string,
  commandId: string,
  previousDate: string,
  resultDate: string,
  expectedRevision: number,
) {
  return `
    select row_to_json(reconciliation)::text
    from public.reconcile_completed_actual_birth_series_internal(
      ${q(targetSeriesId)}::uuid,
      ${q(birthId)}::uuid,
      ${q(commandId)}::uuid,
      ${q(previousDate)}::date,
      ${q(resultDate)}::date,
      ${q(ownerId)}::uuid,
      ${expectedRevision}
    ) reconciliation;
  `;
}

function reconcile(
  targetSeriesId: string,
  birthId: string,
  commandId: string,
  previousDate: string,
  resultDate: string,
  expectedRevision: number,
) {
  return jsonSql<ReconciliationResult>(
    reconciliationSql(
      targetSeriesId,
      birthId,
      commandId,
      previousDate,
      resultDate,
      expectedRevision,
    ),
  );
}

function seriesFingerprint(targetSeriesId: string) {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'series', (
        select to_jsonb(series) - 'updated_at'
        from public.litter_plan_series series
        where series.id = ${q(targetSeriesId)}::uuid
      ),
      'tasks', (
        select jsonb_agg(to_jsonb(task) - 'updated_at' order by task.id)
        from public.litter_care_tasks task
        where task.litter_plan_series_id = ${q(targetSeriesId)}::uuid
      ),
      'audits', (
        select count(*)
        from public.litter_plan_series_actual_birth_reconciliation_commands command
        where command.series_id = ${q(targetSeriesId)}::uuid
      )
    )::text;
  `);
}

function nonSeriesBusinessFingerprint(litterId: string) {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'litter', (
        select to_jsonb(litter)
        from public.litters litter
        where litter.id = ${q(litterId)}::uuid
      ),
      'births', (
        select jsonb_agg(to_jsonb(birth) order by birth.id)
        from public.whelping_births birth
        join public.whelping_sessions session
          on session.organization_id = birth.organization_id
         and session.id = birth.session_id
        where session.litter_id = ${q(litterId)}::uuid
      ),
      'animals', (
        select jsonb_agg(to_jsonb(animal) order by animal.id)
        from public.animals animal
        where animal.litter_id = ${q(litterId)}::uuid
      ),
      'plans', (
        select jsonb_agg(to_jsonb(plan) order by plan.id)
        from public.litter_plans plan
        where plan.litter_id = ${q(litterId)}::uuid
      ),
      'items', (
        select jsonb_agg(to_jsonb(item) order by item.id)
        from public.litter_plan_items item
        where item.litter_id = ${q(litterId)}::uuid
      ),
      'observations', (
        select count(*) from public.maternal_observations
        where litter_id = ${q(litterId)}::uuid
      ),
      'weights', (
        select count(*)
        from public.animal_weight_measurements measurement
        join public.animals animal on animal.id = measurement.animal_id
        where animal.litter_id = ${q(litterId)}::uuid
      ),
      'documents', (
        select count(*) from public.documents
        where litter_id = ${q(litterId)}::uuid
      ),
      'reservations', (
        select count(*) from public.reservations
        where litter_id = ${q(litterId)}::uuid
      )
    )::text;
  `);
}

test("réconcilie de façon privée les séries actual_birth terminales", async () => {
  cleanup();
  expect(fixtureCounts()).toEqual({
    plan_reconciliation_changes: 0,
    plan_reconciliations: 0,
    reconciliation_changes: 0,
    reconciliation_commands: 0,
    activation_deactivations: 0,
    activation_states: 0,
    activations: 0,
    observation_links: 0,
    observation_commands: 0,
    observations: 0,
    schedule_changes: 0,
    schedule_commands: 0,
    materialization_commands: 0,
    state_commands: 0,
    anchor_commands: 0,
    ad_hoc_commands: 0,
    application_commands: 0,
    tasks: 0,
    slots: 0,
    series: 0,
    items: 0,
    plans: 0,
    adjustments: 0,
    whelping_commands: 0,
    measurements: 0,
    births: 0,
    events: 0,
    sessions: 0,
    model_slots: 0,
    model_commands: 0,
    model_items: 0,
    models: 0,
    import_commands: 0,
    templates: 0,
    animals: 0,
    litters: 0,
    memberships: 0,
    organizations: 0,
  });
  expect(durableCounts()).toEqual(durableExpected);

  let owner: Supabase | null = null;
  try {
    owner = await createAuthenticatedSupabaseClient();
    seedScope();
    await importAndApply(owner);

    const insertSeries = seriesId(ids.insertLitter);
    const retainedTargets = jsonSql<{
      manual: { id: string; revisionNo: number };
      locked: { id: string; revisionNo: number };
    }>(`
      with targets as (
        select
          task.id,
          task.revision_no,
          row_number() over (order by task.slot_no) as position
        from public.litter_care_tasks task
        where task.litter_plan_series_id = ${q(insertSeries)}::uuid
          and task.planned_for = '2026-08-09'
          and task.status = 'planned'
      )
      select json_build_object(
        'manual', (
          select json_build_object('id', id, 'revisionNo', revision_no)
          from targets where position = 1
        ),
        'locked', (
          select json_build_object('id', id, 'revisionNo', revision_no)
          from targets where position = 2
        )
      )::text;
    `);
    const manualReschedule = await owner.rpc(
      "reschedule_litter_care_task_point",
      {
        p_task_id: retainedTargets.manual.id,
        p_client_command_id: ids.manualReschedule,
        p_expected_revision_no: retainedTargets.manual.revisionNo,
        p_planned_for: "2026-08-10",
        p_scheduled_local_time: "11:45",
        p_schedule_timezone_name: "Europe/Paris",
        p_reason: "Report utilisateur avant naissance",
      },
    );
    expect(manualReschedule.error).toBeNull();
    expect(manualReschedule.data?.[0]?.outcome).toBe("success");

    const lockedSchedule = await owner.rpc(
      "set_litter_care_task_schedule_lock",
      {
        p_task_id: retainedTargets.locked.id,
        p_client_command_id: ids.lockedSchedule,
        p_expected_revision_no: retainedTargets.locked.revisionNo,
        p_is_locked: true,
        p_reason: "Créneau utilisateur verrouillé",
      },
    );
    expect(lockedSchedule.error).toBeNull();
    expect(lockedSchedule.data?.[0]?.outcome).toBe("success");
    sql(`
      update public.litter_care_tasks
      set planned_for = '2026-08-11',
          scheduled_local_time = '22:15',
          revision_no = revision_no + 1,
          updated_at = statement_timestamp(),
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(retainedTargets.locked.id)}::uuid
        and schedule_source = 'suggested'
        and is_schedule_locked = true;
    `);

    const restoreBirth = await recordFirstBirth(
      owner,
      ids.restoreLitter,
      ids.restoreOpen,
      ids.restoreBirth,
    );
    const insertBirth = await recordFirstBirth(
      owner,
      ids.insertLitter,
      ids.insertOpen,
      ids.insertBirth,
    );
    const maxBirth = await recordFirstBirth(
      owner,
      ids.maxLitter,
      ids.maxOpen,
      ids.maxBirth,
    );
    const concurrentBirth = await recordFirstBirth(
      owner,
      ids.concurrentLitter,
      ids.concurrentOpen,
      ids.concurrentBirth,
    );
    const cancelBirth = await recordFirstBirth(
      owner,
      ids.cancelLitter,
      ids.cancelOpen,
      ids.cancelBirth,
    );
    const inconsistentBirth = await recordFirstBirth(
      owner,
      ids.inconsistentLitter,
      ids.inconsistentOpen,
      ids.inconsistentBirth,
    );

    const restoreSeries = seriesId(ids.restoreLitter);
    const maxSeries = seriesId(ids.maxLitter);
    const concurrentSeries = seriesId(ids.concurrentLitter);
    const inconsistentSeries = seriesId(ids.inconsistentLitter);

    const restoreRevision = seriesRevision(restoreSeries);
    await correctBirth(
      owner,
      restoreBirth,
      ids.restoreCorrection,
      0,
      "2026-08-09T03:00:00+02:00",
    );
    const restoreBusinessBefore = nonSeriesBusinessFingerprint(ids.restoreLitter);
    const restored = reconcile(
      restoreSeries,
      restoreBirth.birthId,
      ids.restoreCorrection,
      "2026-08-08",
      "2026-08-09",
      restoreRevision,
    );
    expect(restored).toMatchObject({
      outcome: "success",
      reason: null,
      replayed: false,
      revision_no: restoreRevision + 1,
      restored_occurrence_count: 2,
      inserted_occurrence_count: 0,
      not_applicable_occurrence_count: 0,
      ends_on: "2026-08-09",
      materialized_through: "2026-08-09",
      materialized_occurrence_count: 14,
    });
    expect(nonSeriesBusinessFingerprint(ids.restoreLitter)).toEqual(
      restoreBusinessBefore,
    );
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'state', series.state,
        'completion', series.completion_reason,
        'plannedOnNine', count(task.id) filter (
          where task.planned_for = '2026-08-09' and task.status = 'planned'
        ),
        'restoredAudit', (
          select count(*)
          from public.litter_plan_series_actual_birth_reconciliation_changes change
          join public.litter_plan_series_actual_birth_reconciliation_commands command
            on command.id = change.command_id
          where command.series_id = ${q(restoreSeries)}::uuid
            and change.change_type = 'restored'
        )
      )::text
      from public.litter_plan_series series
      left join public.litter_care_tasks task
        on task.litter_plan_series_id = series.id
      where series.id = ${q(restoreSeries)}::uuid
      group by series.id;
    `)).toEqual({
      state: "completed",
      completion: "actual_birth_reached",
      plannedOnNine: 2,
      restoredAudit: 2,
    });

    const replay = reconcile(
      restoreSeries,
      restoreBirth.birthId,
      ids.restoreCorrection,
      "2026-08-08",
      "2026-08-09",
      restoreRevision,
    );
    expect(replay).toMatchObject({
      outcome: "success",
      replayed: true,
      revision_no: restoreRevision + 1,
      restored_occurrence_count: 2,
      inserted_occurrence_count: 0,
    });
    const conflict = reconcile(
      restoreSeries,
      restoreBirth.birthId,
      ids.restoreCorrection,
      "2026-08-08",
      "2026-08-10",
      restoreRevision,
    );
    expect(conflict).toMatchObject({
      outcome: "error",
      reason: "client_command_conflict",
      replayed: false,
    });

    const retainedBefore = jsonSql<{
      manual: Record<string, unknown>;
      locked: Record<string, unknown>;
    }>(`
      select json_build_object(
        'manual', (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = ${q(retainedTargets.manual.id)}::uuid
        ),
        'locked', (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = ${q(retainedTargets.locked.id)}::uuid
        )
      )::text;
    `);
    expect(retainedBefore.manual).toMatchObject({
      status: "not_applicable",
      resolution_note: "actual_birth_reached",
      planned_for: "2026-08-10",
      scheduled_local_time: "11:45:00",
      schedule_source: "manual",
      is_schedule_locked: false,
      recurrence_day_no: 7,
      slot_no: 1,
      occurrence_no: 13,
    });
    expect(retainedBefore.locked).toMatchObject({
      status: "not_applicable",
      resolution_note: "actual_birth_reached",
      planned_for: "2026-08-11",
      scheduled_local_time: "22:15:00",
      schedule_source: "suggested",
      is_schedule_locked: true,
      recurrence_day_no: 7,
      slot_no: 2,
      occurrence_no: 14,
    });

    const insertRevision = seriesRevision(insertSeries);
    await correctBirth(
      owner,
      insertBirth,
      ids.insertCorrection,
      0,
      "2026-08-12T03:00:00+02:00",
    );
    const inserted = reconcile(
      insertSeries,
      insertBirth.birthId,
      ids.insertCorrection,
      "2026-08-08",
      "2026-08-12",
      insertRevision,
    );
    expect(inserted).toMatchObject({
      outcome: "success",
      replayed: false,
      restored_occurrence_count: 2,
      inserted_occurrence_count: 6,
      not_applicable_occurrence_count: 0,
      ends_on: "2026-08-12",
      materialized_through: "2026-08-12",
      materialized_occurrence_count: 20,
      revision_no: insertRevision + 1,
    });
    const retainedAfter = jsonSql<{
      manual: Record<string, unknown>;
      locked: Record<string, unknown>;
    }>(`
      select json_build_object(
        'manual', (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = ${q(retainedTargets.manual.id)}::uuid
        ),
        'locked', (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = ${q(retainedTargets.locked.id)}::uuid
        )
      )::text;
    `);
    expect(retainedAfter.manual).toMatchObject({
      status: "planned",
      resolution_command_id: null,
      resolved_at: null,
      resolved_timezone_name: null,
      resolved_by: null,
      resolution_note: null,
      planned_for: "2026-08-10",
      scheduled_local_time: "11:45:00",
      schedule_source: "manual",
      is_schedule_locked: false,
      recurrence_day_no: 7,
      slot_no: 1,
      occurrence_no: 13,
      revision_no: Number(retainedBefore.manual.revision_no) + 1,
    });
    expect(retainedAfter.locked).toMatchObject({
      status: "planned",
      resolution_command_id: null,
      resolved_at: null,
      resolved_timezone_name: null,
      resolved_by: null,
      resolution_note: null,
      planned_for: "2026-08-11",
      scheduled_local_time: "22:15:00",
      schedule_source: "suggested",
      is_schedule_locked: true,
      recurrence_day_no: 7,
      slot_no: 2,
      occurrence_no: 14,
      revision_no: Number(retainedBefore.locked.revision_no) + 1,
    });
    expect(jsonSql<Record<string, unknown>>(`
      select jsonb_object_agg(
        change.task_id::text,
        jsonb_build_object(
          'type', change.change_type,
          'before', change.snapshot_before,
          'after', change.snapshot_after
        )
      )::text
      from public.litter_plan_series_actual_birth_reconciliation_changes change
      join public.litter_plan_series_actual_birth_reconciliation_commands command
        on command.id = change.command_id
      where command.series_id = ${q(insertSeries)}::uuid
        and change.task_id in (
          ${q(retainedTargets.manual.id)}::uuid,
          ${q(retainedTargets.locked.id)}::uuid
        );
    `)).toEqual({
      [retainedTargets.manual.id]: {
        type: "restored",
        before: retainedBefore.manual,
        after: retainedAfter.manual,
      },
      [retainedTargets.locked.id]: {
        type: "restored",
        before: retainedBefore.locked,
        after: retainedAfter.locked,
      },
    });
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'newDates', json_agg(distinct task.planned_for::text order by task.planned_for::text)
          filter (where task.planned_for between '2026-08-10' and '2026-08-12'),
        'retainedDateCount', count(*) filter (
          where task.planned_for between '2026-08-10' and '2026-08-12'
        ),
        'insertedIdentityCount', count(*) filter (
          where task.recurrence_day_no between 8 and 10
        ),
        'identityCollisions', (
          select count(*) - count(distinct (task.recurrence_day_no, task.slot_no))
          from public.litter_care_tasks task
          where task.litter_plan_series_id = ${q(insertSeries)}::uuid
        ),
        'insertAudits', (
          select count(*)
          from public.litter_plan_series_actual_birth_reconciliation_changes change
          join public.litter_plan_series_actual_birth_reconciliation_commands command
            on command.id = change.command_id
          where command.series_id = ${q(insertSeries)}::uuid
            and change.change_type = 'inserted'
        )
      )::text
      from public.litter_care_tasks task
      where task.litter_plan_series_id = ${q(insertSeries)}::uuid;
    `)).toEqual({
      newDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
      retainedDateCount: 8,
      insertedIdentityCount: 6,
      identityCollisions: 0,
      insertAudits: 6,
    });

    const terminalIds = jsonSql<{
      done: string;
      cancelled: string;
      incompatible: string;
    }>(`
      with candidates as (
        select id, row_number() over (order by planned_for, slot_no) as position
        from public.litter_care_tasks
        where litter_plan_series_id = ${q(insertSeries)}::uuid
          and planned_for > '2026-08-07'
          and status = 'planned'
      )
      select json_build_object(
        'done', (select id from candidates where position = 1),
        'cancelled', (select id from candidates where position = 2),
        'incompatible', (select id from candidates where position = 3)
      )::text;
    `);
    sql(`
      update public.litter_care_tasks
      set status = 'done',
          planned_for = planned_for + 17,
          scheduled_local_time = '13:20',
          resolution_command_id = ${q(ids.doneResolution)}::uuid,
          resolved_at = statement_timestamp(),
          resolved_timezone_name = 'Europe/Paris',
          resolved_by = ${q(ownerId)}::uuid,
          resolution_note = 'fait réel',
          revision_no = revision_no + 1,
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(terminalIds.done)}::uuid;
      update public.litter_care_tasks
      set status = 'cancelled',
          resolution_command_id = ${q(ids.cancelledResolution)}::uuid,
          resolved_at = statement_timestamp(),
          resolved_timezone_name = 'Europe/Paris',
          resolved_by = ${q(ownerId)}::uuid,
          resolution_note = 'annulation métier',
          revision_no = revision_no + 1,
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(terminalIds.cancelled)}::uuid;
      update public.litter_care_tasks
      set status = 'not_applicable',
          resolution_command_id = ${q(ids.incompatibleResolution)}::uuid,
          resolved_at = statement_timestamp(),
          resolved_timezone_name = 'Europe/Paris',
          resolved_by = ${q(ownerId)}::uuid,
          resolution_note = 'motif incompatible',
          revision_no = revision_no + 1,
          updated_by = ${q(ownerId)}::uuid
      where id = ${q(terminalIds.incompatible)}::uuid;
    `);
    const terminalBefore = jsonSql<Record<string, unknown>>(`
      select jsonb_object_agg(id::text, to_jsonb(task) - 'updated_at')::text
      from public.litter_care_tasks task
      where id in (
        ${q(terminalIds.done)}::uuid,
        ${q(terminalIds.cancelled)}::uuid,
        ${q(terminalIds.incompatible)}::uuid
      );
    `);

    await correctBirth(
      owner,
      insertBirth,
      ids.contractionCorrection,
      1,
      "2026-08-07T03:00:00+02:00",
    );
    const contracted = reconcile(
      insertSeries,
      insertBirth.birthId,
      ids.contractionCorrection,
      "2026-08-12",
      "2026-08-07",
      insertRevision + 1,
    );
    expect(contracted).toMatchObject({
      outcome: "success",
      restored_occurrence_count: 0,
      inserted_occurrence_count: 0,
      ends_on: "2026-08-07",
      materialized_through: "2026-08-07",
      revision_no: insertRevision + 2,
    });
    const terminalAfter = jsonSql<Record<string, unknown>>(`
      select jsonb_object_agg(id::text, to_jsonb(task) - 'updated_at')::text
      from public.litter_care_tasks task
      where id in (
        ${q(terminalIds.done)}::uuid,
        ${q(terminalIds.cancelled)}::uuid,
        ${q(terminalIds.incompatible)}::uuid
      );
    `);
    expect(terminalAfter).toEqual(terminalBefore);
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'plannedAfter', count(*) filter (
          where planned_for > '2026-08-07' and status = 'planned'
        ),
        'markedAfter', count(*) filter (
          where planned_for > '2026-08-07'
            and status = 'not_applicable'
            and resolution_note = 'actual_birth_reached'
        ),
        'beforeOrOnUnchanged', count(*) filter (
          where planned_for <= '2026-08-07' and status = 'planned'
        ),
        'state', min(series.state),
        'completion', min(series.completion_reason)
      )::text
      from public.litter_care_tasks task
      join public.litter_plan_series series
        on series.id = task.litter_plan_series_id
      where series.id = ${q(insertSeries)}::uuid;
    `)).toMatchObject({
      plannedAfter: 0,
      beforeOrOnUnchanged: 10,
      state: "completed",
      completion: "actual_birth_reached",
    });

    const inconsistentRevision = seriesRevision(inconsistentSeries);
    sql(`
      update public.litter_care_tasks task
      set planned_for = task.planned_for - 1,
          updated_at = statement_timestamp(),
          updated_by = ${q(ownerId)}::uuid
      where task.id = (
        select candidate.id
        from public.litter_care_tasks candidate
        where candidate.litter_plan_series_id = ${q(inconsistentSeries)}::uuid
          and candidate.status = 'planned'
          and candidate.schedule_source = 'suggested'
          and candidate.is_schedule_locked = false
        order by candidate.recurrence_day_no, candidate.slot_no
        limit 1
      );
    `);
    await correctBirth(
      owner,
      inconsistentBirth,
      ids.inconsistentCorrection,
      0,
      "2026-08-09T03:00:00+02:00",
    );
    const inconsistentBefore = seriesFingerprint(inconsistentSeries);
    expect(reconcile(
      inconsistentSeries,
      inconsistentBirth.birthId,
      ids.inconsistentCorrection,
      "2026-08-08",
      "2026-08-09",
      inconsistentRevision,
    )).toMatchObject({
      outcome: "error",
      reason: "invariant_failed",
      replayed: false,
    });
    expect(seriesFingerprint(inconsistentSeries)).toEqual(inconsistentBefore);

    const maxRevision = seriesRevision(maxSeries);
    await correctBirth(
      owner,
      maxBirth,
      ids.maxCorrection,
      0,
      "2026-08-20T03:00:00+02:00",
    );
    const beforeMax = seriesFingerprint(maxSeries);
    const maxResult = reconcile(
      maxSeries,
      maxBirth.birthId,
      ids.maxCorrection,
      "2026-08-08",
      "2026-08-20",
      maxRevision,
    );
    expect(maxResult).toMatchObject({
      outcome: "error",
      reason: "absolute_max_insufficient",
      replayed: false,
      revision_no: maxRevision,
    });
    expect(seriesFingerprint(maxSeries)).toEqual(beforeMax);

    const noDateRevision = await correctBirth(
      owner,
      concurrentBirth,
      ids.noDateCorrection,
      0,
      "2026-08-08T03:00:00+02:00",
      "male",
    );
    const concurrentRevision = seriesRevision(concurrentSeries);
    expect(reconcile(
      concurrentSeries,
      concurrentBirth.birthId,
      ids.noDateCorrection,
      "2026-08-08",
      "2026-08-09",
      concurrentRevision,
    )).toMatchObject({
      outcome: "error",
      reason: "birth_adjustment_not_authorized",
    });
    expect(reconcile(
      concurrentSeries,
      concurrentBirth.birthId,
      ids.missingAdjustment,
      "2026-08-08",
      "2026-08-09",
      concurrentRevision,
    )).toMatchObject({
      outcome: "error",
      reason: "birth_adjustment_not_authorized",
    });
    expect(jsonSql<ReconciliationResult>(`
      select row_to_json(reconciliation)::text
      from public.reconcile_completed_actual_birth_series_internal(
        ${q(concurrentSeries)}::uuid,
        ${q(concurrentBirth.birthId)}::uuid,
        null::uuid,
        '2026-08-08'::date,
        '2026-08-09'::date,
        ${q(ownerId)}::uuid,
        ${concurrentRevision}
      ) reconciliation;
    `)).toMatchObject({
      outcome: "error",
      reason: "invalid_input",
    });
    expect(jsonSql<ReconciliationResult>(`
      begin;
      select pg_catalog.set_config(
        'app.litter_actual_birth_series_reconciliation',
        'on',
        true
      );
      select row_to_json(reconciliation)::text
      from public.reconcile_completed_actual_birth_series_internal(
        ${q(concurrentSeries)}::uuid,
        ${q(concurrentBirth.birthId)}::uuid,
        ${q(ids.missingAdjustment)}::uuid,
        '2026-08-08'::date,
        '2026-08-09'::date,
        ${q(ownerId)}::uuid,
        ${concurrentRevision}
      ) reconciliation;
      rollback;
    `)).toMatchObject({
      outcome: "error",
      reason: "birth_adjustment_not_authorized",
    });
    expect(reconcile(
      concurrentSeries,
      concurrentBirth.birthId,
      ids.maxCorrection,
      "2026-08-08",
      "2026-08-20",
      concurrentRevision,
    )).toMatchObject({
      outcome: "error",
      reason: "birth_adjustment_not_authorized",
    });

    const correctionARevision = await correctBirth(
      owner,
      concurrentBirth,
      ids.concurrentCorrectionA,
      noDateRevision,
      "2026-08-09T03:00:00+02:00",
      "male",
    );
    const revertRevision = await correctBirth(
      owner,
      concurrentBirth,
      ids.concurrentRevert,
      correctionARevision,
      "2026-08-08T03:00:00+02:00",
      "male",
    );
    await correctBirth(
      owner,
      concurrentBirth,
      ids.concurrentCorrectionB,
      revertRevision,
      "2026-08-09T03:00:00+02:00",
      "male",
    );

    const concurrentCalls = await Promise.all([
      runE2eSql(reconciliationSql(
        concurrentSeries,
        concurrentBirth.birthId,
        ids.concurrentCorrectionA,
        "2026-08-08",
        "2026-08-09",
        concurrentRevision,
      )),
      runE2eSql(reconciliationSql(
        concurrentSeries,
        concurrentBirth.birthId,
        ids.concurrentCorrectionB,
        "2026-08-08",
        "2026-08-09",
        concurrentRevision,
      )),
    ]);
    const concurrentResults = concurrentCalls.map((value) =>
      JSON.parse(value.trim()) as ReconciliationResult
    );
    expect(concurrentResults.filter((value) => value.outcome === "success")).toHaveLength(1);
    expect(concurrentResults.filter(
      (value) => value.outcome === "error" && value.reason === "stale_revision",
    )).toHaveLength(1);
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'revision', series.revision_no,
        'tasks', count(task.id),
        'identities', count(distinct (task.recurrence_day_no, task.slot_no)),
        'audits', (
          select count(*)
          from public.litter_plan_series_actual_birth_reconciliation_commands command
          where command.series_id = ${q(concurrentSeries)}::uuid
        )
      )::text
      from public.litter_plan_series series
      left join public.litter_care_tasks task
        on task.litter_plan_series_id = series.id
      where series.id = ${q(concurrentSeries)}::uuid
      group by series.id;
    `)).toEqual({
      revision: concurrentRevision + 1,
      tasks: 14,
      identities: 14,
      audits: 1,
    });

    const cancellation = jsonSql<{ outcome: string }>(`
      begin;
      set local request.jwt.claims =
        '{"sub":"${ownerId}","role":"authenticated"}';
      select row_to_json(result)::text
      from public.cancel_whelping_birth_core_internal(
        ${q(cancelBirth.birthId)}::uuid,
        ${q(ids.cancellationCommand)}::uuid,
        0,
        '2026-08-08T04:00:00+02:00'::timestamptz,
        'Commande annulation de contrôle'
      ) result;
      commit;
    `);
    expect(cancellation.outcome).toBe("success");
    expect(reconcile(
      restoreSeries,
      restoreBirth.birthId,
      ids.cancellationCommand,
      "2026-08-09",
      "2026-08-10",
      restoreRevision + 1,
    )).toMatchObject({
      outcome: "error",
      reason: "birth_adjustment_not_authorized",
    });

    const publicAttempt = await owner.rpc("materialize_litter_plan_series", {
      p_series_id: restoreSeries,
      p_client_command_id: ids.publicMaterialization,
      p_expected_revision_no: restoreRevision + 1,
      p_requested_through: "2026-08-10",
    });
    expect(publicAttempt.error).toBeNull();
    expect(publicAttempt.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "series_not_active",
    });

    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'privateOwner', pg_get_userbyid(procedure.proowner),
        'privateSecurityDefiner', procedure.prosecdef,
        'privateConfig', procedure.proconfig,
        'privatePublicExecute', has_function_privilege(
          'public',
          procedure.oid,
          'EXECUTE'
        ),
        'privateAnonExecute', has_function_privilege(
          'anon',
          procedure.oid,
          'EXECUTE'
        ),
        'privateAuthenticatedExecute', has_function_privilege(
          'authenticated',
          procedure.oid,
          'EXECUTE'
        ),
        'helperPublicExecute', has_function_privilege(
          'public',
          'public.materialize_litter_plan_series_occurrences(uuid,date,uuid,uuid,boolean)',
          'EXECUTE'
        ),
        'parentPolicies', (
          select count(*) from pg_policies
          where schemaname = 'public'
            and tablename = 'litter_plan_series_actual_birth_reconciliation_commands'
        ),
        'childPolicies', (
          select count(*) from pg_policies
          where schemaname = 'public'
            and tablename = 'litter_plan_series_actual_birth_reconciliation_changes'
        ),
        'parentRls', (
          select relrowsecurity
          from pg_class
          where oid =
            'public.litter_plan_series_actual_birth_reconciliation_commands'::regclass
        ),
        'childRls', (
          select relrowsecurity
          from pg_class
          where oid =
            'public.litter_plan_series_actual_birth_reconciliation_changes'::regclass
        ),
        'clientTableGrants', (
          select count(*)
          from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name in (
              'litter_plan_series_actual_birth_reconciliation_commands',
              'litter_plan_series_actual_birth_reconciliation_changes'
            )
            and grantee in ('anon', 'authenticated', 'PUBLIC')
        )
      )::text
      from pg_proc procedure
      where procedure.oid =
        'public.reconcile_completed_actual_birth_series_internal(uuid,uuid,uuid,date,date,uuid,integer)'::regprocedure::oid;
    `)).toEqual({
      privateOwner: "postgres",
      privateSecurityDefiner: true,
      privateConfig: ['search_path=""', "row_security=off"],
      privatePublicExecute: false,
      privateAnonExecute: false,
      privateAuthenticatedExecute: false,
      helperPublicExecute: false,
      parentPolicies: 0,
      childPolicies: 0,
      parentRls: true,
      childRls: true,
      clientTableGrants: 0,
    });

    const beforeBusiness = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'births', jsonb_agg(to_jsonb(birth) order by birth.id),
        'animals', (
          select jsonb_agg(to_jsonb(animal) order by animal.id)
          from public.animals animal
          where animal.organization_id = ${q(ids.organization)}::uuid
        ),
        'litters', (
          select jsonb_agg(to_jsonb(litter) order by litter.id)
          from public.litters litter
          where litter.organization_id = ${q(ids.organization)}::uuid
        ),
        'plans', (
          select jsonb_agg(to_jsonb(plan) order by plan.id)
          from public.litter_plans plan
          where plan.organization_id = ${q(ids.organization)}::uuid
        ),
        'items', (
          select jsonb_agg(to_jsonb(item) order by item.id)
          from public.litter_plan_items item
          where item.organization_id = ${q(ids.organization)}::uuid
        )
      )::text
      from public.whelping_births birth
      where birth.organization_id = ${q(ids.organization)}::uuid;
    `);
    const exactReplay = reconcile(
      restoreSeries,
      restoreBirth.birthId,
      ids.restoreCorrection,
      "2026-08-08",
      "2026-08-09",
      restoreRevision,
    );
    expect(exactReplay.replayed).toBe(true);
    const afterBusiness = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'births', jsonb_agg(to_jsonb(birth) order by birth.id),
        'animals', (
          select jsonb_agg(to_jsonb(animal) order by animal.id)
          from public.animals animal
          where animal.organization_id = ${q(ids.organization)}::uuid
        ),
        'litters', (
          select jsonb_agg(to_jsonb(litter) order by litter.id)
          from public.litters litter
          where litter.organization_id = ${q(ids.organization)}::uuid
        ),
        'plans', (
          select jsonb_agg(to_jsonb(plan) order by plan.id)
          from public.litter_plans plan
          where plan.organization_id = ${q(ids.organization)}::uuid
        ),
        'items', (
          select jsonb_agg(to_jsonb(item) order by item.id)
          from public.litter_plan_items item
          where item.organization_id = ${q(ids.organization)}::uuid
        )
      )::text
      from public.whelping_births birth
      where birth.organization_id = ${q(ids.organization)}::uuid;
    `);
    expect(afterBusiness).toEqual(beforeBusiness);
    expect(durableCounts()).toEqual(durableExpected);
  } finally {
    await owner?.auth.signOut();
    cleanup();
  }

  expect(fixtureCounts()).toEqual({
    plan_reconciliation_changes: 0,
    plan_reconciliations: 0,
    reconciliation_changes: 0,
    reconciliation_commands: 0,
    activation_deactivations: 0,
    activation_states: 0,
    activations: 0,
    observation_links: 0,
    observation_commands: 0,
    observations: 0,
    schedule_changes: 0,
    schedule_commands: 0,
    materialization_commands: 0,
    state_commands: 0,
    anchor_commands: 0,
    ad_hoc_commands: 0,
    application_commands: 0,
    tasks: 0,
    slots: 0,
    series: 0,
    items: 0,
    plans: 0,
    adjustments: 0,
    whelping_commands: 0,
    measurements: 0,
    births: 0,
    events: 0,
    sessions: 0,
    model_slots: 0,
    model_commands: 0,
    model_items: 0,
    models: 0,
    import_commands: 0,
    templates: 0,
    animals: 0,
    litters: 0,
    memberships: 0,
    organizations: 0,
  });
  expect(durableCounts()).toEqual(durableExpected);
});

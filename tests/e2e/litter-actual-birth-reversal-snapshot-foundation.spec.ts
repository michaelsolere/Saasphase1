import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

type TypedClient = SupabaseClient<Database>;
type JsonRecord = Record<string, Json>;
type ReversalChange = {
  sequenceNo: number;
  entityKind:
    | "litter_plan_item"
    | "litter_plan_series"
    | "litter_care_task";
  entityId: string;
  changeKind: "insert" | "update";
  snapshotBefore: Json | null;
  snapshotAfter: JsonRecord;
  current: JsonRecord;
};

const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "e7310008-0000-4000-8000-";
const like = "e7310008-%";
const preModelCode = "dog-pre-whelping-temperature-monitoring";
const postModelCode = "dog-postnatal-essential-care";

const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  mainMother: `${prefix}000000000003`,
  noPlanMother: `${prefix}000000000004`,
  concurrentMother: `${prefix}000000000005`,
  rollbackMother: `${prefix}000000000006`,
  legacyMother: `${prefix}000000000007`,
  mainLitter: `${prefix}000000000011`,
  noPlanLitter: `${prefix}000000000012`,
  concurrentLitter: `${prefix}000000000013`,
  rollbackLitter: `${prefix}000000000014`,
  legacyLitter: `${prefix}000000000015`,
  importCommand: `${prefix}000000000020`,
  mainPreApplyCommand: `${prefix}000000000021`,
  mainPostApplyCommand: `${prefix}000000000022`,
  mainOpenCommand: `${prefix}000000000031`,
  mainBirthCommand: `${prefix}000000000032`,
  noPlanOpenCommand: `${prefix}000000000033`,
  noPlanBirthCommand: `${prefix}000000000034`,
  concurrentOpenCommand: `${prefix}000000000035`,
  concurrentBirthOneCommand: `${prefix}000000000036`,
  concurrentBirthTwoCommand: `${prefix}000000000037`,
  rollbackOpenCommand: `${prefix}000000000038`,
  rollbackBirthCommand: `${prefix}000000000039`,
  legacyOpenCommand: `${prefix}000000000040`,
  legacyBirthCommand: `${prefix}000000000041`,
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
    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id is not null;
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
      'reversal_changes', (select count(*) from public.litter_plan_actual_birth_activation_reversal_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'reversal_snapshots', (select count(*) from public.litter_plan_actual_birth_activation_reversal_snapshots where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activation_deactivations', (select count(*) from public.litter_plan_actual_birth_activation_deactivations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or birth_adjustment_client_command_id::text like ${q(like)}),
      'activation_states', (select count(*) from public.litter_plan_actual_birth_activation_states where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activations', (select count(*) from public.litter_plan_actual_birth_activations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or whelping_client_command_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'series_slots', (select count(*) from public.litter_plan_series_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'application_commands', (select count(*) from public.litter_plan_application_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'plan_items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'whelping_commands', (select count(*) from public.whelping_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
      'measurements', (select count(*) from public.animal_weight_measurements where organization_id = ${q(ids.organization)}::uuid),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid),
      'events', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid),
      'sessions', (select count(*) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid),
      'model_slots', (select count(*) from public.litter_planning_model_item_time_slots where organization_id = ${q(ids.organization)}::uuid),
      'model_commands', (select count(*) from public.litter_planning_model_commands where organization_id = ${q(ids.organization)}::uuid),
      'model_items', (select count(*) from public.litter_planning_model_items where organization_id = ${q(ids.organization)}::uuid),
      'models', (select count(*) from public.litter_planning_models where organization_id = ${q(ids.organization)}::uuid),
      'import_commands', (select count(*) from public.litter_planning_model_library_import_commands where organization_id = ${q(ids.organization)}::uuid),
      'templates', (select count(*) from public.litter_care_task_templates where organization_id = ${q(ids.organization)}::uuid),
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

function growthComparisonCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'animals', (select count(*) from public.animals where id::text like 'd3c9000%'),
      'litters', (select count(*) from public.litters where id::text like 'd3c90001-%'),
      'sessions', (select count(*) from public.whelping_sessions where id::text like 'd3c90005-%'),
      'events', (select count(*) from public.whelping_events where id::text like 'd3c90006-%'),
      'births', (select count(*) from public.whelping_births where id::text like 'd3c90007-%'),
      'weighingSessions', (select count(*) from public.litter_weighing_sessions where id::text like 'd3c90009-%'),
      'measurements', (
        select count(*) from public.animal_weight_measurements
        where id::text like 'd3c90008-%' or id::text like 'd3c9000a-%'
      )
    )::text;
  `);
}

function seedScope() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.organization)}::uuid,
      'Photographies réversibilité e7310008',
      'photographies-reversibilite-e7310008'
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
      (${q(ids.mainMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère photographie complète', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère photographie sans plan', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère photographie concurrence', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.rollbackMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère photographie rollback', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.legacyMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère activation legacy', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, actual_birth_date, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée photographie complète', 'dog', 'Golden Retriever', ${q(ids.mainMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée photographie sans plan', 'dog', 'Golden Retriever', ${q(ids.noPlanMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée photographie concurrence', 'dog', 'Golden Retriever', ${q(ids.concurrentMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.rollbackLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée photographie rollback', 'dog', 'Golden Retriever', ${q(ids.rollbackMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.legacyLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée activation legacy', 'dog', 'Golden Retriever', ${q(ids.legacyMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function importModels(owner: TypedClient) {
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
  owner: TypedClient,
  code: string,
  commandId: string,
  expectedPlanRevision: number | null,
) {
  const applied = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: ids.mainLitter,
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
  owner: TypedClient,
  litterId: string,
  commandId: string,
  startedAt: string,
) {
  const opened = await openWhelpingSessionCore(
    {
      litterId,
      clientCommandId: commandId,
      startedAt,
      timezoneName: "Europe/Paris",
      note: null,
    },
    owner,
  );
  expect(opened.outcome).toBe("success");
  if (opened.outcome !== "success") throw new Error("Session creation failed");
  return opened.sessionId;
}

function completePlanBefore() {
  return jsonSql<{
    items: Record<string, JsonRecord>;
    series: Record<string, JsonRecord>;
    tasks: Record<string, JsonRecord>;
  }>(`
    select json_build_object(
      'items', coalesce((
        select jsonb_object_agg(item.id::text, to_jsonb(item) order by item.id)
        from public.litter_plan_items item
        where item.organization_id = ${q(ids.organization)}::uuid
          and item.litter_id = ${q(ids.mainLitter)}::uuid
      ), '{}'::jsonb),
      'series', coalesce((
        select jsonb_object_agg(series.id::text, to_jsonb(series) order by series.id)
        from public.litter_plan_series series
        where series.organization_id = ${q(ids.organization)}::uuid
          and series.litter_id = ${q(ids.mainLitter)}::uuid
      ), '{}'::jsonb),
      'tasks', coalesce((
        select jsonb_object_agg(task.id::text, to_jsonb(task) order by task.id)
        from public.litter_care_tasks task
        where task.organization_id = ${q(ids.organization)}::uuid
          and task.litter_id = ${q(ids.mainLitter)}::uuid
      ), '{}'::jsonb)
    )::text;
  `);
}

function reversalChanges(litterId: string) {
  return jsonSql<ReversalChange[]>(`
    select coalesce(json_agg(json_build_object(
      'sequenceNo', change.sequence_no,
      'entityKind', change.entity_kind,
      'entityId', change.entity_id::text,
      'changeKind', change.change_kind,
      'snapshotBefore', change.snapshot_before,
      'snapshotAfter', change.snapshot_after,
      'current', case change.entity_kind
        when 'litter_plan_item' then (
          select to_jsonb(item)
          from public.litter_plan_items item
          where item.id = change.entity_id
        )
        when 'litter_plan_series' then (
          select to_jsonb(series)
          from public.litter_plan_series series
          where series.id = change.entity_id
        )
        when 'litter_care_task' then (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = change.entity_id
        )
      end
    ) order by change.sequence_no), '[]'::json)::text
    from public.litter_plan_actual_birth_activation_reversal_changes change
    where change.organization_id = ${q(ids.organization)}::uuid
      and change.litter_id = ${q(litterId)}::uuid;
  `);
}

function snapshotHeader(litterId: string) {
  return jsonSql<{
    id: string;
    activationId: string;
    litterPlanId: string | null;
    snapshotVersion: number;
    itemChangeCount: number;
    seriesChangeCount: number;
    taskInsertCount: number;
    taskUpdateCount: number;
    result: JsonRecord;
  }>(`
    select json_build_object(
      'id', snapshot.id::text,
      'activationId', snapshot.activation_id::text,
      'litterPlanId', snapshot.litter_plan_id::text,
      'snapshotVersion', snapshot.snapshot_version,
      'itemChangeCount', snapshot.item_change_count,
      'seriesChangeCount', snapshot.series_change_count,
      'taskInsertCount', snapshot.task_insert_count,
      'taskUpdateCount', snapshot.task_update_count,
      'result', snapshot.result
    )::text
    from public.litter_plan_actual_birth_activation_reversal_snapshots snapshot
    where snapshot.organization_id = ${q(ids.organization)}::uuid
      and snapshot.litter_id = ${q(litterId)}::uuid;
  `);
}

function idempotenceState(litterId: string) {
  return jsonSql<Record<string, string | number | null>>(`
    select json_build_object(
      'planRevision', (
        select revision from public.litter_plans
        where litter_id = ${q(litterId)}::uuid and status = 'active'
      ),
      'stateRevision', (
        select revision
        from public.litter_plan_actual_birth_activation_states
        where litter_id = ${q(litterId)}::uuid
      ),
      'activationCount', (
        select count(*) from public.litter_plan_actual_birth_activations
        where litter_id = ${q(litterId)}::uuid
      ),
      'snapshotCount', (
        select count(*) from public.litter_plan_actual_birth_activation_reversal_snapshots
        where litter_id = ${q(litterId)}::uuid
      ),
      'changeCount', (
        select count(*) from public.litter_plan_actual_birth_activation_reversal_changes
        where litter_id = ${q(litterId)}::uuid
      ),
      'snapshotCreatedAt', (
        select max(created_at)::text
        from public.litter_plan_actual_birth_activation_reversal_snapshots
        where litter_id = ${q(litterId)}::uuid
      ),
      'latestTaskUpdatedAt', (
        select max(updated_at)::text from public.litter_care_tasks
        where litter_id = ${q(litterId)}::uuid
      )
    )::text;
  `);
}

function rollbackState() {
  return jsonSql<Record<string, number | string | null>>(`
    select json_build_object(
      'actualBirthDate', (
        select actual_birth_date::text from public.litters
        where id = ${q(ids.rollbackLitter)}::uuid
      ),
      'sessions', (
        select count(*) from public.whelping_sessions
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'birthEvents', (
        select count(*) from public.whelping_events event
        join public.whelping_sessions session on session.id = event.session_id
        where session.litter_id = ${q(ids.rollbackLitter)}::uuid
          and event.event_type = 'birth'
      ),
      'births', (
        select count(*) from public.whelping_births birth
        join public.whelping_sessions session on session.id = birth.session_id
        where session.litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'offspring', (
        select count(*) from public.animals
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'weights', (
        select count(*) from public.animal_weight_measurements measurement
        join public.animals animal on animal.id = measurement.animal_id
        where animal.litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'birthCommands', (
        select count(*) from public.whelping_commands
        where litter_id = ${q(ids.rollbackLitter)}::uuid
          and command_type = 'record_birth'
      ),
      'activations', (
        select count(*) from public.litter_plan_actual_birth_activations
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'snapshots', (
        select count(*) from public.litter_plan_actual_birth_activation_reversal_snapshots
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'changes', (
        select count(*) from public.litter_plan_actual_birth_activation_reversal_changes
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      ),
      'states', (
        select count(*) from public.litter_plan_actual_birth_activation_states
        where litter_id = ${q(ids.rollbackLitter)}::uuid
      )
    )::text;
  `);
}

function schemaSecurity() {
  return jsonSql<{
    tables: Record<string, {
      rls: boolean;
      policies: number;
      publicAccess: boolean;
      anonAccess: boolean;
      authenticatedAccess: boolean;
    }>;
    functions: Record<string, {
      owner: string;
      securityDefiner: boolean;
      authenticatedExecute: boolean;
      anonExecute: boolean;
      publicExecute: boolean;
    }>;
    historicalOverloads: Record<string, number>;
    activationUsesDeactivation: boolean;
    cancellationUsesDeactivation: boolean;
  }>(`
    with target_tables(name, relation) as (
      values
        (
          'snapshots',
          'public.litter_plan_actual_birth_activation_reversal_snapshots'::regclass
        ),
        (
          'changes',
          'public.litter_plan_actual_birth_activation_reversal_changes'::regclass
        )
    ),
    target_functions as (
      select
        procedure.proname as name,
        procedure.oid,
        procedure.proowner,
        procedure.prosecdef
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'capture_litter_birth_reversal_snapshot_internal',
          'prevent_litter_birth_reversal_registry_mutation'
        )
    )
    select json_build_object(
      'tables', (
        select json_object_agg(target.name, json_build_object(
          'rls', class.relrowsecurity,
          'policies', (
            select count(*) from pg_catalog.pg_policy policy
            where policy.polrelid = target.relation
          ),
          'publicAccess', exists (
            select 1
            from pg_catalog.aclexplode(coalesce(
              class.relacl,
              pg_catalog.acldefault('r', class.relowner)
            )) acl
            where acl.grantee = 0
              and acl.privilege_type in (
                'SELECT', 'INSERT', 'UPDATE', 'DELETE'
              )
          ),
          'anonAccess', has_table_privilege(
            'anon', target.relation, 'SELECT,INSERT,UPDATE,DELETE'
          ),
          'authenticatedAccess', has_table_privilege(
            'authenticated', target.relation, 'SELECT,INSERT,UPDATE,DELETE'
          )
        ))
        from target_tables target
        join pg_catalog.pg_class class on class.oid = target.relation
      ),
      'functions', (
        select json_object_agg(function.name, json_build_object(
          'owner', pg_catalog.pg_get_userbyid(function.proowner),
          'securityDefiner', function.prosecdef,
          'authenticatedExecute', has_function_privilege(
            'authenticated', function.oid, 'EXECUTE'
          ),
          'anonExecute', has_function_privilege(
            'anon', function.oid, 'EXECUTE'
          ),
          'publicExecute', exists (
            select 1
            from pg_catalog.aclexplode(coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )) acl
            where acl.grantee = 0
              and acl.privilege_type = 'EXECUTE'
          )
        ))
        from target_functions function
        join pg_catalog.pg_proc procedure on procedure.oid = function.oid
      ),
      'historicalOverloads', (
        select json_object_agg(name, count)
        from (
          select procedure.proname as name, count(*) as count
          from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname in (
              'record_whelping_birth',
              'activate_litter_plan_on_first_birth_internal',
              'cancel_whelping_birth'
            )
          group by procedure.proname
        ) overloads
      ),
      'activationUsesDeactivation', position(
        'deactivate_litter_plan_actual_birth_activation_internal'
        in pg_catalog.pg_get_functiondef(
          'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure
        )
      ) > 0,
      'cancellationUsesDeactivation', position(
        'deactivate_litter_plan_actual_birth_activation_internal'
        in pg_catalog.pg_get_functiondef(
          'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
        )
      ) > 0
    )::text;
  `);
}

test("photographie exacte, atomique, idempotente, concurrente et privée", async () => {
  cleanup();
  expectCleanupAtZero();
  const growthBefore = growthComparisonCounts();
  let fixtureManifest: Record<string, unknown> = {};

  try {
    seedScope();
    const owner = await createAuthenticatedSupabaseClient();
    const secondOwner = await createAuthenticatedSupabaseClient();
    await importModels(owner);
    await applyModel(owner, preModelCode, ids.mainPreApplyCommand, null);
    await applyModel(
      owner,
      postModelCode,
      ids.mainPostApplyCommand,
      planRevision(ids.mainLitter),
    );

    const before = completePlanBefore();
    expect(Object.keys(before.items)).toHaveLength(7);
    expect(Object.keys(before.series)).toHaveLength(2);
    expect(Object.keys(before.tasks)).toHaveLength(16);

    const mainSession = await openSession(
      owner,
      ids.mainLitter,
      ids.mainOpenCommand,
      "2026-08-08T02:45:00+02:00",
    );
    const mainInput = {
      sessionId: mainSession,
      clientCommandId: ids.mainBirthCommand,
      occurredAt: "2026-08-08T03:00:00+02:00",
      sex: "female" as const,
      viability: "alive" as const,
      initialCollarColor: "Rose",
      note: "Première naissance avec photographie complète",
    };
    const mainBirth = await recordWhelpingBirthCore(mainInput, owner);
    expect(mainBirth).toMatchObject({
      outcome: "success",
      birthOrder: 1,
      replayed: false,
    });

    const header = snapshotHeader(ids.mainLitter);
    const changes = reversalChanges(ids.mainLitter);
    const computed = {
      itemChangeCount: changes.filter(
        (change) => change.entityKind === "litter_plan_item",
      ).length,
      seriesChangeCount: changes.filter(
        (change) => change.entityKind === "litter_plan_series",
      ).length,
      taskInsertCount: changes.filter(
        (change) =>
          change.entityKind === "litter_care_task" &&
          change.changeKind === "insert",
      ).length,
      taskUpdateCount: changes.filter(
        (change) =>
          change.entityKind === "litter_care_task" &&
          change.changeKind === "update",
      ).length,
    };
    expect(header).toMatchObject({
      litterPlanId: expect.any(String),
      snapshotVersion: 1,
      ...computed,
    });
    expect(computed).toEqual({
      itemChangeCount: 4,
      seriesChangeCount: 2,
      taskInsertCount: 7,
      taskUpdateCount: 2,
    });
    expect(changes.map((change) => change.sequenceNo)).toEqual(
      changes.map((_, index) => index + 1),
    );

    for (const change of changes) {
      expect(change.snapshotAfter).toEqual(change.current);
      expect(change.snapshotAfter).toMatchObject({
        id: change.entityId,
        organization_id: ids.organization,
      });
      if (change.changeKind === "insert") {
        expect(change.snapshotBefore).toBeNull();
        expect(before.tasks[change.entityId]).toBeUndefined();
      } else {
        const source =
          change.entityKind === "litter_plan_item"
            ? before.items
            : change.entityKind === "litter_plan_series"
              ? before.series
              : before.tasks;
        expect(change.snapshotBefore).toEqual(source[change.entityId]);
        expect(change.snapshotBefore).not.toEqual(change.snapshotAfter);
      }
    }

    const recurringInsertOrder = changes
      .filter(
        (change) =>
          change.entityKind === "litter_care_task" &&
          change.changeKind === "insert" &&
          change.snapshotAfter.litter_plan_series_id != null,
      )
      .map((change) => Number(change.snapshotAfter.occurrence_no));
    expect(recurringInsertOrder).toEqual([1, 2, 3, 4]);

    const mainStableBeforeReplay = idempotenceState(ids.mainLitter);
    const replay = await recordWhelpingBirthCore(mainInput, owner);
    expect(replay).toEqual({ ...mainBirth, replayed: true });
    expect(idempotenceState(ids.mainLitter)).toEqual(mainStableBeforeReplay);

    const noPlanSession = await openSession(
      owner,
      ids.noPlanLitter,
      ids.noPlanOpenCommand,
      "2026-08-09T02:45:00+02:00",
    );
    const noPlanInput = {
      sessionId: noPlanSession,
      clientCommandId: ids.noPlanBirthCommand,
      occurredAt: "2026-08-09T03:00:00+02:00",
      sex: "male" as const,
      viability: "alive" as const,
    };
    const noPlanBirth = await recordWhelpingBirthCore(noPlanInput, owner);
    expect(noPlanBirth).toMatchObject({
      outcome: "success",
      birthOrder: 1,
      replayed: false,
    });
    expect(snapshotHeader(ids.noPlanLitter)).toMatchObject({
      litterPlanId: null,
      snapshotVersion: 1,
      itemChangeCount: 0,
      seriesChangeCount: 0,
      taskInsertCount: 0,
      taskUpdateCount: 0,
    });
    expect(reversalChanges(ids.noPlanLitter)).toEqual([]);
    const noPlanBeforeReplay = idempotenceState(ids.noPlanLitter);
    expect(
      await recordWhelpingBirthCore(noPlanInput, owner),
    ).toEqual({ ...noPlanBirth, replayed: true });
    expect(idempotenceState(ids.noPlanLitter)).toEqual(noPlanBeforeReplay);

    const concurrentSession = await openSession(
      owner,
      ids.concurrentLitter,
      ids.concurrentOpenCommand,
      "2026-08-10T02:45:00+02:00",
    );
    const concurrentResults = await Promise.all([
      recordWhelpingBirthCore(
        {
          sessionId: concurrentSession,
          clientCommandId: ids.concurrentBirthOneCommand,
          occurredAt: "2026-08-10T03:00:00+02:00",
          sex: "female",
          viability: "alive",
        },
        owner,
      ),
      recordWhelpingBirthCore(
        {
          sessionId: concurrentSession,
          clientCommandId: ids.concurrentBirthTwoCommand,
          occurredAt: "2026-08-10T03:01:00+02:00",
          sex: "male",
          viability: "alive",
        },
        secondOwner,
      ),
    ]);
    expect(concurrentResults.map((result) => result.outcome)).toEqual([
      "success",
      "success",
    ]);
    expect(
      concurrentResults
        .map((result) =>
          result.outcome === "success" ? result.birthOrder : 0,
        )
        .sort(),
    ).toEqual([1, 2]);
    const concurrency = jsonSql<{
      births: number;
      orders: number[];
      activations: number;
      states: number;
      snapshots: number;
      changes: number;
      activationCommand: string;
    }>(`
      select json_build_object(
        'births', (
          select count(*) from public.whelping_births birth
          join public.whelping_sessions session on session.id = birth.session_id
          where session.litter_id = ${q(ids.concurrentLitter)}::uuid
            and birth.cancelled_at is null
        ),
        'orders', (
          select json_agg(birth.birth_order order by birth.birth_order)
          from public.whelping_births birth
          join public.whelping_sessions session on session.id = birth.session_id
          where session.litter_id = ${q(ids.concurrentLitter)}::uuid
            and birth.cancelled_at is null
        ),
        'activations', (
          select count(*) from public.litter_plan_actual_birth_activations
          where litter_id = ${q(ids.concurrentLitter)}::uuid
        ),
        'states', (
          select count(*) from public.litter_plan_actual_birth_activation_states
          where litter_id = ${q(ids.concurrentLitter)}::uuid
        ),
        'snapshots', (
          select count(*) from public.litter_plan_actual_birth_activation_reversal_snapshots
          where litter_id = ${q(ids.concurrentLitter)}::uuid
        ),
        'changes', (
          select count(*) from public.litter_plan_actual_birth_activation_reversal_changes
          where litter_id = ${q(ids.concurrentLitter)}::uuid
        ),
        'activationCommand', (
          select activation.whelping_client_command_id::text
          from public.litter_plan_actual_birth_activations activation
          where activation.litter_id = ${q(ids.concurrentLitter)}::uuid
        )
      )::text;
    `);
    const firstConcurrentCommand = concurrentResults.find(
      (result) =>
        result.outcome === "success" && result.birthOrder === 1,
    ) === concurrentResults[0]
      ? ids.concurrentBirthOneCommand
      : ids.concurrentBirthTwoCommand;
    expect(concurrency).toEqual({
      births: 2,
      orders: [1, 2],
      activations: 1,
      states: 1,
      snapshots: 1,
      changes: 0,
      activationCommand: firstConcurrentCommand,
    });

    const rollbackSession = await openSession(
      owner,
      ids.rollbackLitter,
      ids.rollbackOpenCommand,
      "2026-08-11T02:45:00+02:00",
    );
    const rollbackBefore = rollbackState();
    expect(() =>
      sql(`
        begin;
        create function pg_temp.force_reversal_snapshot_failure()
        returns trigger
        language plpgsql
        as $failure$
        begin
          raise exception 'forced reversal snapshot failure'
            using errcode = '23514';
        end;
        $failure$;
        create trigger force_reversal_snapshot_failure
        before insert
        on public.litter_plan_actual_birth_activation_reversal_snapshots
        for each row
        execute function pg_temp.force_reversal_snapshot_failure();
        set local role authenticated;
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${q(ownerId)},
          true
        );
        select *
        from public.record_whelping_birth(
          ${q(rollbackSession)}::uuid,
          ${q(ids.rollbackBirthCommand)}::uuid,
          '2026-08-11T03:00:00+02:00'::timestamptz,
          'female',
          'alive',
          'Violet',
          420,
          '2026-08-11T03:02:00+02:00'::timestamptz,
          'Rollback global provoqué à l’insertion de la photographie'
        );
        commit;
      `),
    ).toThrow(/forced reversal snapshot failure/);
    expect(rollbackState()).toEqual(rollbackBefore);
    expect(
      Number(sql(`
        select count(*) from pg_catalog.pg_trigger
        where tgname = 'force_reversal_snapshot_failure'
          and not tgisinternal;
      `)),
    ).toBe(0);

    const legacySession = await openSession(
      owner,
      ids.legacyLitter,
      ids.legacyOpenCommand,
      "2026-08-12T02:45:00+02:00",
    );
    const legacyInput = {
      sessionId: legacySession,
      clientCommandId: ids.legacyBirthCommand,
      occurredAt: "2026-08-12T03:00:00+02:00",
      sex: "unknown" as const,
      viability: "unknown" as const,
    };
    const legacyBirth = await recordWhelpingBirthCore(legacyInput, owner);
    expect(legacyBirth).toMatchObject({
      outcome: "success",
      birthOrder: 1,
    });
    sql(`
      begin;
      select pg_catalog.set_config('app.fixture_cleanup', 'on', true);
      delete from public.litter_plan_actual_birth_activation_reversal_changes
      where litter_id = ${q(ids.legacyLitter)}::uuid;
      delete from public.litter_plan_actual_birth_activation_reversal_snapshots
      where litter_id = ${q(ids.legacyLitter)}::uuid;
      commit;
    `);
    expect(
      await recordWhelpingBirthCore(legacyInput, owner),
    ).toEqual({ ...legacyBirth, replayed: true });
    expect(idempotenceState(ids.legacyLitter)).toMatchObject({
      activationCount: 1,
      snapshotCount: 0,
      changeCount: 0,
    });

    const schema = schemaSecurity();
    expect(schema).toEqual({
      tables: {
        snapshots: {
          rls: true,
          policies: 0,
          publicAccess: false,
          anonAccess: false,
          authenticatedAccess: false,
        },
        changes: {
          rls: true,
          policies: 0,
          publicAccess: false,
          anonAccess: false,
          authenticatedAccess: false,
        },
      },
      functions: {
        capture_litter_birth_reversal_snapshot_internal: {
          owner: "postgres",
          securityDefiner: true,
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
        prevent_litter_birth_reversal_registry_mutation: {
          owner: "postgres",
          securityDefiner: true,
          authenticatedExecute: false,
          anonExecute: false,
          publicExecute: false,
        },
      },
      historicalOverloads: {
        activate_litter_plan_on_first_birth_internal: 1,
        cancel_whelping_birth: 1,
        record_whelping_birth: 1,
      },
      activationUsesDeactivation: false,
      cancellationUsesDeactivation: false,
    });

    sql(`
      do $immutability$
      begin
        begin
          update public.litter_plan_actual_birth_activation_reversal_snapshots
          set snapshot_version = 1
          where id = ${q(header.id)}::uuid;
          raise exception 'snapshot UPDATE unexpectedly succeeded';
        exception when sqlstate '55000' then
          null;
        end;

        begin
          delete from public.litter_plan_actual_birth_activation_reversal_snapshots
          where id = ${q(header.id)}::uuid;
          raise exception 'snapshot DELETE unexpectedly succeeded';
        exception when sqlstate '55000' then
          null;
        end;

        begin
          update public.litter_plan_actual_birth_activation_reversal_changes
          set sequence_no = sequence_no
          where snapshot_id = ${q(header.id)}::uuid;
          raise exception 'change UPDATE unexpectedly succeeded';
        exception when sqlstate '55000' then
          null;
        end;

        begin
          delete from public.litter_plan_actual_birth_activation_reversal_changes
          where snapshot_id = ${q(header.id)}::uuid;
          raise exception 'change DELETE unexpectedly succeeded';
        exception when sqlstate '55000' then
          null;
        end;
      end;
      $immutability$;
    `);

    const untypedOwner = owner as unknown as SupabaseClient;
    const snapshotRead = await untypedOwner
      .from("litter_plan_actual_birth_activation_reversal_snapshots")
      .select("*");
    const changeRead = await untypedOwner
      .from("litter_plan_actual_birth_activation_reversal_changes")
      .select("*");
    expect(snapshotRead.error).not.toBeNull();
    expect(changeRead.error).not.toBeNull();
    const privateRpc = await untypedOwner.rpc(
      "capture_litter_birth_reversal_snapshot_internal",
      {
        p_organization_id: ids.organization,
        p_litter_id: ids.mainLitter,
        p_activation_id: header.activationId,
        p_litter_plan_id: header.litterPlanId,
        p_items_before: {},
        p_series_before: {},
        p_tasks_before: {},
        p_actor_id: ownerId,
      },
    );
    expect(privateRpc.error).not.toBeNull();

    const cancellationBody = sql(`
      select pg_catalog.pg_get_functiondef(
        'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
      );
    `);
    expect(cancellationBody).toContain("birth_has_downstream_data");
    expect(cancellationBody).not.toContain(
      "deactivate_litter_plan_actual_birth_activation_internal",
    );

    fixtureManifest = {
      deterministicIds: ids,
      mainBirth,
      mainSnapshot: header,
      mainChangeIds: changes.map((change) => change.entityId),
      concurrentResults,
      rollbackBefore,
      legacyActivationWithoutSnapshot: true,
    };
  } finally {
    cleanup();
  }

  const finalCounts = fixtureCounts();
  expect(Object.values(finalCounts).every((count) => count === 0)).toBe(true);
  expect(growthComparisonCounts()).toEqual(growthBefore);
  expect(
    Number(sql(`
      select count(*) from pg_catalog.pg_trigger
      where tgname = 'force_reversal_snapshot_failure'
        and not tgisinternal;
    `)),
  ).toBe(0);
  console.log(
    `LITTER_ACTUAL_BIRTH_REVERSAL_SNAPSHOT_FIXTURES=${JSON.stringify(fixtureManifest)}`,
  );
  console.log(
    `LITTER_ACTUAL_BIRTH_REVERSAL_SNAPSHOT_CLEANUP=${JSON.stringify(finalCounts)}`,
  );
  console.log(
    `LITTER_ACTUAL_BIRTH_REVERSAL_SNAPSHOT_GROWTH=${JSON.stringify(growthBefore)}`,
  );
});

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelWhelpingBirthCore,
  correctWhelpingBirthCore,
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import { createLitterCareTaskCore } from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

type TypedClient = SupabaseClient<Database>;

const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "e7310011-0000-4000-8000-";
const like = "e7310011-%";
const preModelCode = "dog-pre-whelping-temperature-monitoring";
const postModelCode = "dog-postnatal-essential-care";

const ids = {
  organization: `${prefix}000000000001`,
  membership: `${prefix}000000000002`,
  planMother: `${prefix}000000000003`,
  noPlanMother: `${prefix}000000000004`,
  divergenceMother: `${prefix}000000000005`,
  dependencyMother: `${prefix}000000000006`,
  legacyMother: `${prefix}000000000007`,
  rollbackMother: `${prefix}000000000008`,
  postActivationMother: `${prefix}000000000101`,
  lateBirthMother: `${prefix}000000000102`,
  correctionMother: `${prefix}000000000103`,
  missingEntityMother: `${prefix}000000000104`,
  distinctMother: `${prefix}000000000105`,
  planLitter: `${prefix}000000000011`,
  noPlanLitter: `${prefix}000000000012`,
  divergenceLitter: `${prefix}000000000013`,
  dependencyLitter: `${prefix}000000000014`,
  legacyLitter: `${prefix}000000000015`,
  rollbackLitter: `${prefix}000000000016`,
  postActivationLitter: `${prefix}000000000111`,
  lateBirthLitter: `${prefix}000000000112`,
  correctionLitter: `${prefix}000000000113`,
  missingEntityLitter: `${prefix}000000000114`,
  distinctLitter: `${prefix}000000000115`,
  importCommand: `${prefix}000000000020`,
  planPreApply: `${prefix}000000000021`,
  planPostApply: `${prefix}000000000022`,
  divergencePostApply: `${prefix}000000000023`,
  dependencyPostApply: `${prefix}000000000024`,
  rollbackPostApply: `${prefix}000000000025`,
  postActivationPostApply: `${prefix}000000000121`,
  lateBirthPreApply: `${prefix}000000000122`,
  lateBirthPostApply: `${prefix}000000000123`,
  correctionPreApply: `${prefix}000000000124`,
  correctionPostApply: `${prefix}000000000125`,
  missingEntityPostApply: `${prefix}000000000126`,
  planOpen: `${prefix}000000000031`,
  noPlanOpen: `${prefix}000000000032`,
  divergenceOpen: `${prefix}000000000033`,
  dependencyOpen: `${prefix}000000000034`,
  legacyOpen: `${prefix}000000000035`,
  rollbackOpen: `${prefix}000000000036`,
  postActivationOpen: `${prefix}000000000131`,
  lateBirthOpen: `${prefix}000000000132`,
  correctionOpen: `${prefix}000000000133`,
  missingEntityOpen: `${prefix}000000000134`,
  distinctOpen: `${prefix}000000000135`,
  planBirth: `${prefix}000000000041`,
  noPlanBirth: `${prefix}000000000042`,
  divergenceBirth: `${prefix}000000000043`,
  dependencyBirth: `${prefix}000000000044`,
  legacyBirth: `${prefix}000000000045`,
  rollbackBirth: `${prefix}000000000046`,
  postActivationBirth: `${prefix}000000000141`,
  lateBirthBirth: `${prefix}000000000142`,
  correctionBirth: `${prefix}000000000143`,
  missingEntityBirth: `${prefix}000000000144`,
  distinctBirth: `${prefix}000000000145`,
  planCancel: `${prefix}000000000051`,
  noPlanCancel: `${prefix}000000000052`,
  divergenceCancel: `${prefix}000000000053`,
  dependencyCancel: `${prefix}000000000054`,
  legacyCancel: `${prefix}000000000055`,
  rollbackCancel: `${prefix}000000000056`,
  postActivationCancel: `${prefix}000000000151`,
  lateBirthCancel: `${prefix}000000000152`,
  correctionCancel: `${prefix}000000000153`,
  missingEntityCancel: `${prefix}000000000154`,
  distinctCancelA: `${prefix}000000000155`,
  distinctCancelB: `${prefix}000000000156`,
  staleCancel: `${prefix}000000000157`,
  postActivationTaskCommand: `${prefix}000000000161`,
  correctionCommand: `${prefix}000000000162`,
  lateFutureTask: `${prefix}000000000163`,
  lateFutureTaskCommand: `${prefix}000000000164`,
  reminder: `${prefix}000000000061`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function jsonSql<T>(statement: string): T {
  for (const line of sql(statement).split(/\r?\n/).reverse()) {
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

    delete from public.litter_plan_actual_birth_plan_reversal_changes
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_plan_reversals
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_reconciliation_task_changes
    where organization_id = ${q(ids.organization)}::uuid
       or task_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_reconciliations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_actual_birth_reconciliation_changes
    where organization_id = ${q(ids.organization)}::uuid
       or task_id::text like ${q(like)};
    delete from public.litter_plan_series_actual_birth_reconciliation_commands
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)}
       or birth_adjustment_client_command_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_reversal_changes
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_reversal_snapshots
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_deactivations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activation_states
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};
    delete from public.litter_plan_actual_birth_activations
    where organization_id = ${q(ids.organization)}::uuid
       or litter_id::text like ${q(like)};

    delete from public.calendar_reminder_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.calendar_reminders
    where organization_id = ${q(ids.organization)}::uuid
       or id = ${q(ids.reminder)}::uuid;
    delete from public.litter_care_task_schedule_changes
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_care_task_schedule_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series_materialization_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series_state_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_anchor_recalculation_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_ad_hoc_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_care_task_generation_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_care_tasks
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series_time_slots
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_series
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_application_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plan_items
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid;

    delete from public.whelping_birth_adjustment_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.whelping_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animal_weight_measurements
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.whelping_births
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.whelping_events
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id is not null;
    delete from public.whelping_sessions
    where organization_id = ${q(ids.organization)}::uuid;

    delete from public.litter_planning_model_item_time_slots
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_items
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_planning_model_library_import_commands
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_care_task_templates
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litters
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.memberships
    where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organizations
    where id = ${q(ids.organization)}::uuid;
    commit;
  `);
}

function fixtureCounts() {
  return jsonSql<Record<string, number>>(`
    select json_build_object(
      'reversalChanges', (select count(*) from public.litter_plan_actual_birth_plan_reversal_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'reversals', (select count(*) from public.litter_plan_actual_birth_plan_reversals where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or birth_adjustment_client_command_id::text like ${q(like)}),
      'planReconciliationChanges', (select count(*) from public.litter_plan_actual_birth_reconciliation_task_changes where organization_id = ${q(ids.organization)}::uuid or task_id::text like ${q(like)}),
      'planReconciliations', (select count(*) from public.litter_plan_actual_birth_reconciliations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or birth_adjustment_client_command_id::text like ${q(like)}),
      'seriesReconciliationChanges', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_changes where organization_id = ${q(ids.organization)}::uuid or task_id::text like ${q(like)}),
      'seriesReconciliations', (select count(*) from public.litter_plan_series_actual_birth_reconciliation_commands where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)} or birth_adjustment_client_command_id::text like ${q(like)}),
      'snapshotChanges', (select count(*) from public.litter_plan_actual_birth_activation_reversal_changes where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'snapshots', (select count(*) from public.litter_plan_actual_birth_activation_reversal_snapshots where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'deactivations', (select count(*) from public.litter_plan_actual_birth_activation_deactivations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'states', (select count(*) from public.litter_plan_actual_birth_activation_states where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'activations', (select count(*) from public.litter_plan_actual_birth_activations where organization_id = ${q(ids.organization)}::uuid or litter_id::text like ${q(like)}),
      'reminders', (select count(*) from public.calendar_reminders where organization_id = ${q(ids.organization)}::uuid or id = ${q(ids.reminder)}::uuid),
      'tasks', (select count(*) from public.litter_care_tasks where organization_id = ${q(ids.organization)}::uuid),
      'generationCommands', (select count(*) from public.litter_care_task_generation_commands where organization_id = ${q(ids.organization)}::uuid),
      'adHocCommands', (select count(*) from public.litter_plan_ad_hoc_commands where organization_id = ${q(ids.organization)}::uuid),
      'anchorCommands', (select count(*) from public.litter_plan_anchor_recalculation_commands where organization_id = ${q(ids.organization)}::uuid),
      'series', (select count(*) from public.litter_plan_series where organization_id = ${q(ids.organization)}::uuid),
      'items', (select count(*) from public.litter_plan_items where organization_id = ${q(ids.organization)}::uuid),
      'plans', (select count(*) from public.litter_plans where organization_id = ${q(ids.organization)}::uuid),
      'adjustments', (select count(*) from public.whelping_birth_adjustment_commands where organization_id = ${q(ids.organization)}::uuid),
      'commands', (select count(*) from public.whelping_commands where organization_id = ${q(ids.organization)}::uuid),
      'births', (select count(*) from public.whelping_births where organization_id = ${q(ids.organization)}::uuid),
      'events', (select count(*) from public.whelping_events where organization_id = ${q(ids.organization)}::uuid),
      'sessions', (select count(*) from public.whelping_sessions where organization_id = ${q(ids.organization)}::uuid),
      'litters', (select count(*) from public.litters where organization_id = ${q(ids.organization)}::uuid),
      'animals', (select count(*) from public.animals where organization_id = ${q(ids.organization)}::uuid),
      'memberships', (select count(*) from public.memberships where organization_id = ${q(ids.organization)}::uuid),
      'organizations', (select count(*) from public.organizations where id = ${q(ids.organization)}::uuid)
    )::text;
  `);
}

function seedScope() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.organization)}::uuid,
      'Raccordement annulation restauration e7310011',
      'raccordement-annulation-restauration-e7310011'
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
      (${q(ids.planMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère restauration plan', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère restauration sans plan', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.divergenceMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère divergence humaine', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.dependencyMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère dépendance externe', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.legacyMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère activation legacy', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.rollbackMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère rollback audit', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.postActivationMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère tâche post-activation', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lateBirthMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère naissance tardive', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.correctionMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère correction de date', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.missingEntityMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère entité disparue', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.distinctMother)}::uuid, ${q(ids.organization)}::uuid, 'Mère concurrence distincte', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, expected_birth_date, created_by, updated_by
    ) values
      (${q(ids.planLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée restauration plan', 'dog', 'Golden Retriever', ${q(ids.planMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPlanLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée restauration sans plan', 'dog', 'Golden Retriever', ${q(ids.noPlanMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-09', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.divergenceLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée divergence humaine', 'dog', 'Golden Retriever', ${q(ids.divergenceMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.dependencyLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée dépendance externe', 'dog', 'Golden Retriever', ${q(ids.dependencyMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-11', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.legacyLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée activation legacy', 'dog', 'Golden Retriever', ${q(ids.legacyMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-12', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.rollbackLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée rollback audit', 'dog', 'Golden Retriever', ${q(ids.rollbackMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-13', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.postActivationLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée tâche post-activation', 'dog', 'Golden Retriever', ${q(ids.postActivationMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-14', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lateBirthLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée naissance tardive', 'dog', 'Golden Retriever', ${q(ids.lateBirthMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-08', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.correctionLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée correction de date', 'dog', 'Golden Retriever', ${q(ids.correctionMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-16', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.missingEntityLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée entité disparue', 'dog', 'Golden Retriever', ${q(ids.missingEntityMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-17', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.distinctLitter)}::uuid, ${q(ids.organization)}::uuid, 'Portée concurrence distincte', 'dog', 'Golden Retriever', ${q(ids.distinctMother)}::uuid, 'birth_expected', '2026-06-07', '2026-08-18', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
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
  expect(imported.data?.[0]?.outcome).toBe("success");
}

function modelId(code: string) {
  return sql(`
    select id::text
    from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
      and library_model_code = ${q(code)}
      and library_model_version = 1
  `);
}

function planRevision(litterId: string) {
  return Number(sql(`
    select revision from public.litter_plans
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id = ${q(litterId)}::uuid
      and status = 'active'
  `));
}

async function applyModel(
  owner: TypedClient,
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

async function createBirth(
  owner: TypedClient,
  litterId: string,
  openCommandId: string,
  birthCommandId: string,
  occurredAt: string,
) {
  const opened = await openWhelpingSessionCore(
    {
      litterId,
      clientCommandId: openCommandId,
      startedAt: occurredAt,
      timezoneName: "Europe/Paris",
      note: null,
    },
    owner,
  );
  expect(opened.outcome).toBe("success");
  if (opened.outcome !== "success") throw new Error("Session creation failed");
  const birth = await recordWhelpingBirthCore(
    {
      sessionId: opened.sessionId,
      clientCommandId: birthCommandId,
      occurredAt,
      sex: "female",
      viability: "alive",
      note: "Fixture moteur de restauration",
    },
    owner,
  );
  expect(birth.outcome).toBe("success");
  if (birth.outcome !== "success") throw new Error("Birth creation failed");
  return birth.birthId;
}

function activationId(litterId: string) {
  return sql(`
    select id::text
    from public.litter_plan_actual_birth_activations
    where organization_id = ${q(ids.organization)}::uuid
      and litter_id = ${q(litterId)}::uuid
  `);
}

function publicCancellationStatement(
  birthId: string,
  cancelCommandId: string,
  cancelledAt: string,
  beforeCancellationSql = "",
  expectedBirthRevisionNo = 0,
) {
  return `
    begin;
    set local request.jwt.claims =
      '{"sub":"${ownerId}","role":"authenticated"}';
    ${beforeCancellationSql}
    select row_to_json(result)::text
    from public.cancel_whelping_birth(
      ${q(birthId)}::uuid,
      ${q(cancelCommandId)}::uuid,
      ${expectedBirthRevisionNo},
      ${q(cancelledAt)}::timestamptz,
      'Annulation fixture raccordement public'
    ) result;
    commit;
  `;
}

function publicCancellationTransaction(
  birthId: string,
  cancelCommandId: string,
  cancelledAt: string,
  beforeCancellationSql = "",
  expectedBirthRevisionNo = 0,
) {
  return jsonFromSqlOutput<Record<string, unknown>>(sql(
    publicCancellationStatement(
    birthId,
    cancelCommandId,
    cancelledAt,
    beforeCancellationSql,
    expectedBirthRevisionNo,
  )));
}

function jsonFromSqlOutput<T>(output: string): T {
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      return JSON.parse(line) as T;
    } catch {
      continue;
    }
  }
  throw new Error(`E2E SQL did not return JSON: ${output}`);
}

function withoutMonotoneMetadata(value: unknown) {
  const copy = structuredClone(value) as Record<string, unknown>;
  for (const key of ["revision", "revision_no", "updated_at", "updated_by"]) {
    delete copy[key];
  }
  return copy;
}

async function waitForSqlCondition(statement: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (sql(statement) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for SQL condition: ${statement}`);
}

function birthState(litterId: string) {
  return jsonSql<Record<string, unknown>>(`
    select json_build_object(
      'actualBirthDate', litter.actual_birth_date,
      'activeBirths', (
        select count(*) from public.whelping_births birth
        join public.whelping_sessions session on session.id = birth.session_id
        where session.litter_id = litter.id and birth.cancelled_at is null
      ),
      'adjustments', (
        select count(*) from public.whelping_birth_adjustment_commands command
        where command.litter_id = litter.id
      ),
      'reversals', (
        select count(*) from public.litter_plan_actual_birth_plan_reversals reversal
        where reversal.litter_id = litter.id
      ),
      'deactivations', (
        select count(*) from public.litter_plan_actual_birth_activation_deactivations deactivation
        where deactivation.litter_id = litter.id
      ),
      'currentActivationId', (
        select current_activation_id
        from public.litter_plan_actual_birth_activation_states state
        where state.litter_id = litter.id
      )
    )::text
    from public.litters litter
    where litter.id = ${q(litterId)}::uuid
  `);
}

test("raccordement public atomique, prudent, audité et idempotent", async () => {
  cleanup();
  for (const count of Object.values(fixtureCounts())) expect(count).toBe(0);
  let fixtureManifest: Record<string, unknown> = {};

  try {
    seedScope();
    const owner = await createAuthenticatedSupabaseClient();
    await importModels(owner);

    await applyModel(owner, ids.planLitter, preModelCode, ids.planPreApply, null);
    await applyModel(
      owner,
      ids.planLitter,
      postModelCode,
      ids.planPostApply,
      planRevision(ids.planLitter),
    );
    const planBirthId = await createBirth(
      owner,
      ids.planLitter,
      ids.planOpen,
      ids.planBirth,
      "2026-08-08T03:00:00+02:00",
    );
    const planActivation = activationId(ids.planLitter);
    const beforeCounts = jsonSql<{
      inserts: number;
      updates: number;
      planRevision: number;
    }>(`
      select json_build_object(
        'inserts', count(*) filter (where change.change_kind = 'insert'),
        'updates', count(*) filter (where change.change_kind = 'update'),
        'planRevision', plan.revision
      )::text
      from public.litter_plan_actual_birth_activations activation
      join public.litter_plans plan on plan.id = activation.litter_plan_id
      join public.litter_plan_actual_birth_activation_reversal_snapshots snapshot
        on snapshot.activation_id = activation.id
      join public.litter_plan_actual_birth_activation_reversal_changes change
        on change.snapshot_id = snapshot.id
      where activation.id = ${q(planActivation)}::uuid
      group by plan.revision
    `);

    const publicPlanCancellation = await cancelWhelpingBirthCore(
      {
        birthId: planBirthId,
        clientCommandId: ids.planCancel,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T04:00:00+02:00",
        reason: "Annulation fixture raccordement public",
      },
      owner,
    );
    expect(publicPlanCancellation).toMatchObject({
      outcome: "success",
      birthId: planBirthId,
      revisionNo: 1,
      replayed: false,
    });
    expect(birthState(ids.planLitter)).toMatchObject({
      actualBirthDate: null,
      activeBirths: 0,
      adjustments: 1,
      reversals: 1,
      deactivations: 1,
      currentActivationId: null,
    });
    const restored = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'deletedTasks', reversal.deleted_task_count,
        'restoredTasks', reversal.restored_task_count,
        'restoredSeries', reversal.restored_series_count,
        'restoredItems', reversal.restored_item_count,
        'previousPlanRevision', reversal.previous_plan_revision,
        'resultPlanRevision', reversal.result_plan_revision,
        'detailCount', (
          select count(*) from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.reversal_id = reversal.id
        ),
        'insertedTasksRemaining', (
          select count(*)
          from public.litter_plan_actual_birth_activation_reversal_changes change
          join public.litter_care_tasks task on task.id = change.entity_id
          where change.activation_id = reversal.activation_id
            and change.change_kind = 'insert'
        ),
        'monotoneUpdates', (
          select bool_and(
            detail.result_revision_no = detail.previous_revision_no + 1
          )
          from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.reversal_id = reversal.id
            and detail.reversal_action = 'restore_updated'
        )
      )::text
      from public.litter_plan_actual_birth_plan_reversals reversal
      where reversal.activation_id = ${q(planActivation)}::uuid
    `);
    expect(restored).toMatchObject({
      deletedTasks: beforeCounts.inserts,
      detailCount: beforeCounts.inserts + beforeCounts.updates,
      insertedTasksRemaining: 0,
      monotoneUpdates: true,
      previousPlanRevision: beforeCounts.planRevision,
      resultPlanRevision: beforeCounts.planRevision + 1,
    });
    const exactDetails = jsonSql<Array<{
      entityKind: string;
      entityId: string;
      action: "delete_inserted" | "restore_updated";
      snapshotBeforeReversal: Record<string, unknown>;
      snapshotTarget: Record<string, unknown>;
      snapshotAfterReversal: Record<string, unknown> | null;
      activationSnapshotBefore: Record<string, unknown> | null;
      entityExists: boolean;
    }>>(`
      select json_agg(
        json_build_object(
          'entityKind', detail.entity_kind,
          'entityId', detail.entity_id,
          'action', detail.reversal_action,
          'snapshotBeforeReversal', detail.snapshot_before_reversal,
          'snapshotTarget', detail.snapshot_target,
          'snapshotAfterReversal', detail.snapshot_after_reversal,
          'activationSnapshotBefore', source.snapshot_before,
          'entityExists', case detail.entity_kind
            when 'litter_care_task' then exists (
              select 1 from public.litter_care_tasks row
              where row.id = detail.entity_id
            )
            when 'litter_plan_series' then exists (
              select 1 from public.litter_plan_series row
              where row.id = detail.entity_id
            )
            when 'litter_plan_item' then exists (
              select 1 from public.litter_plan_items row
              where row.id = detail.entity_id
            )
          end
        )
        order by detail.sequence_no
      )::text
      from public.litter_plan_actual_birth_plan_reversal_changes detail
      join public.litter_plan_actual_birth_activation_reversal_changes source
        on source.id = detail.snapshot_change_id
      where detail.activation_id = ${q(planActivation)}::uuid
    `);
    expect(new Set(
      exactDetails
        .filter((detail) => detail.action === "restore_updated")
        .map((detail) => detail.entityKind),
    )).toEqual(new Set([
      "litter_care_task",
      "litter_plan_series",
      "litter_plan_item",
    ]));
    for (const detail of exactDetails) {
      if (detail.action === "delete_inserted") {
        expect(detail.entityExists).toBe(false);
        expect(detail.snapshotAfterReversal).toBeNull();
        expect(detail.snapshotTarget).toEqual(detail.snapshotBeforeReversal);
        expect(detail.activationSnapshotBefore).toBeNull();
      } else {
        expect(detail.entityExists).toBe(true);
        expect(detail.snapshotTarget).toEqual(detail.activationSnapshotBefore);
        expect(withoutMonotoneMetadata(detail.snapshotAfterReversal))
          .toEqual(withoutMonotoneMetadata(detail.snapshotTarget));
      }
    }

    const stableBeforeReplay = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'reversal', to_jsonb(reversal),
        'details', (
          select jsonb_agg(to_jsonb(detail) order by detail.sequence_no)
          from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.reversal_id = reversal.id
        ),
        'plan', to_jsonb(plan)
      )::text
      from public.litter_plan_actual_birth_plan_reversals reversal
      join public.litter_plans plan on plan.id = reversal.litter_plan_id
      where reversal.activation_id = ${q(planActivation)}::uuid
    `);
    const replay = await cancelWhelpingBirthCore(
      {
        birthId: planBirthId,
        clientCommandId: ids.planCancel,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T04:00:00+02:00",
        reason: "Annulation fixture raccordement public",
      },
      owner,
    );
    expect(replay).toMatchObject({ outcome: "success", replayed: true });
    const divergentReplay = await cancelWhelpingBirthCore(
      {
        birthId: planBirthId,
        clientCommandId: ids.planCancel,
        expectedRevisionNo: 0,
        cancelledAt: "2026-08-08T04:00:00+02:00",
        reason: "Charge divergente",
      },
      owner,
    );
    expect(divergentReplay).toMatchObject({
      outcome: "error",
      error: { code: "conflict" },
    });
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'reversal', to_jsonb(reversal),
        'details', (
          select jsonb_agg(to_jsonb(detail) order by detail.sequence_no)
          from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.reversal_id = reversal.id
        ),
        'plan', to_jsonb(plan)
      )::text
      from public.litter_plan_actual_birth_plan_reversals reversal
      join public.litter_plans plan on plan.id = reversal.litter_plan_id
      where reversal.activation_id = ${q(planActivation)}::uuid
    `)).toEqual(stableBeforeReplay);

    const noPlanBirthId = await createBirth(
      owner,
      ids.noPlanLitter,
      ids.noPlanOpen,
      ids.noPlanBirth,
      "2026-08-09T03:00:00+02:00",
    );
    const concurrencyApplicationName = "e7310011_cancellation_controller";
    const controller = runE2eSql(`
      set application_name = ${q(concurrencyApplicationName)};
      begin;
      select pg_catalog.pg_advisory_xact_lock(7310011);
      select pg_catalog.pg_sleep(10);
      commit;
    `);
    await waitForSqlCondition(`
      select exists (
        select 1
        from pg_catalog.pg_locks lock
        join pg_catalog.pg_stat_activity activity
          on activity.pid = lock.pid
        where activity.application_name = ${q(concurrencyApplicationName)}
          and lock.locktype = 'advisory'
          and lock.granted
      )
    `);
    const firstConcurrentReversal = runE2eSql(publicCancellationStatement(
      noPlanBirthId,
      ids.noPlanCancel,
      "2026-08-09T04:00:00+02:00",
      `
        create function pg_temp.wait_before_public_cancel_audit()
        returns trigger language plpgsql as $trigger$
        begin
          perform pg_catalog.pg_advisory_xact_lock(7310011);
          return new;
        end;
        $trigger$;
        create trigger e7310011_wait_before_public_cancel_audit
        before insert on public.whelping_birth_adjustment_commands
        for each row
        when (new.client_command_id = ${q(ids.noPlanCancel)}::uuid)
        execute function pg_temp.wait_before_public_cancel_audit();
      `,
    ));
    await waitForSqlCondition(`
      select exists (
        select 1
        from pg_catalog.pg_locks lock
        where lock.locktype = 'advisory'
          and not lock.granted
      )
    `);
    const secondConcurrentReversal = runE2eSql(publicCancellationStatement(
      noPlanBirthId,
      ids.noPlanCancel,
      "2026-08-09T04:00:00+02:00",
    ));
    await waitForSqlCondition(`
      select count(*) >= 2
      from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory'
        and not lock.granted
    `);
    await controller;
    const concurrentResults = await Promise.all([
      firstConcurrentReversal,
      secondConcurrentReversal,
    ]);
    expect(concurrentResults.map((output) =>
      jsonFromSqlOutput<Record<string, unknown>>(output),
    )).toEqual([
      expect.objectContaining({ outcome: "success", replayed: false }),
      expect.objectContaining({ outcome: "success", replayed: true }),
    ]);
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'actualBirthDate', litter.actual_birth_date,
        'planId', reversal.litter_plan_id,
        'previousPlanRevision', reversal.previous_plan_revision,
        'resultPlanRevision', reversal.result_plan_revision,
        'deleted', reversal.deleted_task_count,
        'restoredTasks', reversal.restored_task_count,
        'restoredSeries', reversal.restored_series_count,
        'restoredItems', reversal.restored_item_count,
        'reversalCount', (
          select count(*)
          from public.litter_plan_actual_birth_plan_reversals row
          where row.activation_id = reversal.activation_id
        ),
        'deactivationCount', (
          select count(*)
          from public.litter_plan_actual_birth_activation_deactivations row
          where row.activation_id = reversal.activation_id
        ),
        'detailCount', (
          select count(*)
          from public.litter_plan_actual_birth_plan_reversal_changes row
          where row.reversal_id = reversal.id
        ),
        'distinctSnapshotChangeCount', (
          select count(distinct row.snapshot_change_id)
          from public.litter_plan_actual_birth_plan_reversal_changes row
          where row.reversal_id = reversal.id
        )
      )::text
      from public.litters litter
      join public.litter_plan_actual_birth_plan_reversals reversal
        on reversal.litter_id = litter.id
      where litter.id = ${q(ids.noPlanLitter)}::uuid
    `)).toEqual({
      actualBirthDate: null,
      planId: null,
      previousPlanRevision: null,
      resultPlanRevision: null,
      deleted: 0,
      restoredTasks: 0,
      restoredSeries: 0,
      restoredItems: 0,
      reversalCount: 1,
      deactivationCount: 1,
      detailCount: 0,
      distinctSnapshotChangeCount: 0,
    });

    const distinctBirthId = await createBirth(
      owner,
      ids.distinctLitter,
      ids.distinctOpen,
      ids.distinctBirth,
      "2026-08-18T03:00:00+02:00",
    );
    const distinctControllerName = "e7310011_distinct_controller";
    const distinctController = runE2eSql(`
      set application_name = ${q(distinctControllerName)};
      begin;
      select pg_catalog.pg_advisory_xact_lock(7310012);
      select pg_catalog.pg_sleep(10);
      commit;
    `);
    await waitForSqlCondition(`
      select exists (
        select 1
        from pg_catalog.pg_locks lock
        join pg_catalog.pg_stat_activity activity
          on activity.pid = lock.pid
        where activity.application_name = ${q(distinctControllerName)}
          and lock.locktype = 'advisory'
          and lock.granted
      )
    `);
    const firstDistinctCancellation = runE2eSql(
      publicCancellationStatement(
        distinctBirthId,
        ids.distinctCancelA,
        "2026-08-18T04:00:00+02:00",
        `
          create function pg_temp.wait_before_distinct_cancel_audit()
          returns trigger language plpgsql as $trigger$
          begin
            perform pg_catalog.pg_advisory_xact_lock(7310012);
            return new;
          end;
          $trigger$;
          create trigger e7310011_wait_before_distinct_cancel_audit
          before insert on public.whelping_birth_adjustment_commands
          for each row
          when (new.client_command_id = ${q(ids.distinctCancelA)}::uuid)
          execute function pg_temp.wait_before_distinct_cancel_audit();
        `,
      ),
    );
    await waitForSqlCondition(`
      select exists (
        select 1 from pg_catalog.pg_locks lock
        where lock.locktype = 'advisory' and not lock.granted
      )
    `);
    const secondDistinctCancellation = runE2eSql(
      publicCancellationStatement(
        distinctBirthId,
        ids.distinctCancelB,
        "2026-08-18T04:01:00+02:00",
      ),
    );
    await waitForSqlCondition(`
      select count(*) >= 2
      from pg_catalog.pg_locks lock
      where lock.locktype = 'advisory' and not lock.granted
    `);
    await distinctController;
    const distinctResults = await Promise.all([
      firstDistinctCancellation,
      secondDistinctCancellation,
    ]);
    expect(distinctResults.map((output) =>
      jsonFromSqlOutput<Record<string, unknown>>(output),
    )).toEqual([
      expect.objectContaining({ outcome: "success", replayed: false }),
      expect.objectContaining({
        outcome: "error",
        reason: "birth_cancelled",
        replayed: false,
      }),
    ]);
    expect(birthState(ids.distinctLitter)).toMatchObject({
      actualBirthDate: null,
      activeBirths: 0,
      adjustments: 1,
      reversals: 1,
      deactivations: 1,
      currentActivationId: null,
    });

    await applyModel(
      owner,
      ids.postActivationLitter,
      postModelCode,
      ids.postActivationPostApply,
      null,
    );
    const postActivationBirthId = await createBirth(
      owner,
      ids.postActivationLitter,
      ids.postActivationOpen,
      ids.postActivationBirth,
      "2026-08-14T03:00:00+02:00",
    );
    const postActivationId = activationId(ids.postActivationLitter);
    const postActivationPlanRevision = planRevision(ids.postActivationLitter);
    const adHocTask = await createLitterCareTaskCore(
      {
        litterId: ids.postActivationLitter,
        clientCommandId: ids.postActivationTaskCommand,
        category: "other",
        targetScope: "litter",
        title: "Contrôle ad hoc après première naissance",
        description: "Tâche métier normale hors photographie d’activation",
        plannedFor: "2026-08-15",
      },
      owner,
    );
    expect(adHocTask).toMatchObject({
      outcome: "success",
      replayed: false,
    });
    if (adHocTask.outcome !== "success") {
      throw new Error("Post-activation task creation failed");
    }
    expect(planRevision(ids.postActivationLitter))
      .toBe(postActivationPlanRevision);
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'source', task.source,
        'anchorType', task.anchor_type,
        'planItemId', task.litter_plan_item_id,
        'planSeriesId', task.litter_plan_series_id,
        'createdAfterActivation', task.created_at > activation.created_at,
        'snapshotChangeId', change.id,
        'activationTaskChangeCount', (
          select count(*)
          from public.litter_plan_actual_birth_activation_reversal_changes row
          where row.activation_id = activation.id
            and row.entity_id = task.id
        )
      )::text
      from public.litter_care_tasks task
      join public.litter_plan_actual_birth_activations activation
        on activation.id = ${q(postActivationId)}::uuid
      left join public.litter_plan_actual_birth_activation_reversal_changes change
        on change.activation_id = activation.id
       and change.entity_id = task.id
      where task.id = ${q(adHocTask.taskId)}::uuid
    `)).toEqual({
      source: "manual",
      anchorType: null,
      planItemId: null,
      planSeriesId: null,
      createdAfterActivation: true,
      snapshotChangeId: null,
      activationTaskChangeCount: 0,
    });
    expect(publicCancellationTransaction(
      postActivationBirthId,
      ids.postActivationCancel,
      "2026-08-14T04:00:00+02:00",
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.postActivationLitter)).toMatchObject({
      actualBirthDate: "2026-08-14",
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
      currentActivationId: postActivationId,
    });
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'taskStillPresent', exists (
          select 1 from public.litter_care_tasks
          where id = ${q(adHocTask.taskId)}::uuid
        ),
        'cancelCommandCount', (
          select count(*) from public.whelping_birth_adjustment_commands
          where client_command_id = ${q(ids.postActivationCancel)}::uuid
        ),
        'planRevision', (
          select revision from public.litter_plans
          where litter_id = ${q(ids.postActivationLitter)}::uuid
            and status = 'active'
        )
      )::text
    `)).toEqual({
      taskStillPresent: true,
      cancelCommandCount: 0,
      planRevision: postActivationPlanRevision,
    });

    await applyModel(
      owner,
      ids.lateBirthLitter,
      preModelCode,
      ids.lateBirthPreApply,
      null,
    );
    await applyModel(
      owner,
      ids.lateBirthLitter,
      postModelCode,
      ids.lateBirthPostApply,
      planRevision(ids.lateBirthLitter),
    );
    sql(`
      with source as (
        select to_jsonb(task) as body
        from public.litter_care_tasks task
        join public.litter_plan_series series
          on series.id = task.litter_plan_series_id
        where task.organization_id = ${q(ids.organization)}::uuid
          and task.litter_id = ${q(ids.lateBirthLitter)}::uuid
          and series.end_kind = 'actual_birth'
        order by task.planned_for desc, task.slot_no desc
        limit 1
      )
      insert into public.litter_care_tasks
      select (
        pg_catalog.jsonb_populate_record(
          null::public.litter_care_tasks,
          source.body || jsonb_build_object(
            'id', ${q(ids.lateFutureTask)},
            'occurrence_no', 99,
            'recurrence_day_no', 99,
            'planned_for', '2026-08-12',
            'suggested_for', '2026-08-12',
            'creation_command_id', ${q(ids.lateFutureTaskCommand)},
            'created_at', statement_timestamp(),
            'updated_at', statement_timestamp()
          )
        )
      ).*
      from source
    `);
    const lateBirthId = await createBirth(
      owner,
      ids.lateBirthLitter,
      ids.lateBirthOpen,
      ids.lateBirthBirth,
      "2026-08-11T03:00:00+02:00",
    );
    const lateActivation = activationId(ids.lateBirthLitter);
    const lateSnapshot = jsonSql<{
      activationCreatedTaskCount: number;
      taskInsertCount: number;
      taskUpdateCount: number;
      inserted: Array<{
        snapshotChangeId: string;
        taskId: string;
        seriesId: string | null;
        plannedFor: string;
      }>;
      updated: Array<{
        taskId: string;
        snapshotBefore: Record<string, unknown>;
      }>;
      preBirthSeriesId: string;
    }>(`
      with snapshot as (
        select row.*
        from public.litter_plan_actual_birth_activation_reversal_snapshots row
        where row.activation_id = ${q(lateActivation)}::uuid
      ),
      pre_series as (
        select series.id
        from public.litter_plan_series series
        join public.litter_plan_items item on item.id = series.litter_plan_item_id
        where series.litter_id = ${q(ids.lateBirthLitter)}::uuid
          and series.end_kind = 'actual_birth'
          and item.anchor_type = 'expected_birth'
      )
      select json_build_object(
        'activationCreatedTaskCount', activation.created_task_count,
        'taskInsertCount', snapshot.task_insert_count,
        'taskUpdateCount', snapshot.task_update_count,
        'inserted', (
          select json_agg(json_build_object(
            'snapshotChangeId', change.id,
            'taskId', change.entity_id,
            'seriesId', change.snapshot_after ->> 'litter_plan_series_id',
            'plannedFor', change.snapshot_after ->> 'planned_for'
          ) order by change.sequence_no)
          from public.litter_plan_actual_birth_activation_reversal_changes change
          where change.snapshot_id = snapshot.id
            and change.entity_kind = 'litter_care_task'
            and change.change_kind = 'insert'
        ),
        'updated', (
          select coalesce(json_agg(json_build_object(
            'taskId', change.entity_id,
            'snapshotBefore', change.snapshot_before
          ) order by change.sequence_no), '[]'::json)
          from public.litter_plan_actual_birth_activation_reversal_changes change
          where change.snapshot_id = snapshot.id
            and change.entity_kind = 'litter_care_task'
            and change.change_kind = 'update'
        ),
        'preBirthSeriesId', (select id from pre_series)
      )::text
      from snapshot
      join public.litter_plan_actual_birth_activations activation
        on activation.id = snapshot.activation_id
    `);
    expect(lateSnapshot.activationCreatedTaskCount).toBe(7);
    expect(lateSnapshot.taskInsertCount).toBe(11);
    expect(lateSnapshot.inserted).toHaveLength(11);
    expect(lateSnapshot.inserted.filter(
      (change) => change.seriesId === lateSnapshot.preBirthSeriesId,
    ).map((change) => change.plannedFor)).toEqual([
      "2026-08-10",
      "2026-08-10",
      "2026-08-11",
      "2026-08-11",
    ]);
    expect(lateSnapshot.inserted.filter(
      (change) => change.seriesId !== lateSnapshot.preBirthSeriesId,
    )).toHaveLength(7);
    expect(lateSnapshot.updated.map((change) => change.taskId))
      .toContain(ids.lateFutureTask);
    expect(publicCancellationTransaction(
      lateBirthId,
      ids.lateBirthCancel,
      "2026-08-11T04:00:00+02:00",
    )).toMatchObject({
      outcome: "success",
      birth_id: lateBirthId,
      replayed: false,
    });
    const lateRestoration = jsonSql<{
      deletedTaskIds: string[];
      consumedSnapshotChangeIds: string[];
      insertedRemaining: number;
      futureTask: Record<string, unknown>;
      restoredItems: number;
      restoredSeries: number;
    }>(`
      select json_build_object(
        'deletedTaskIds', (
          select json_agg(detail.entity_id order by detail.entity_id)
          from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.activation_id = ${q(lateActivation)}::uuid
            and detail.reversal_action = 'delete_inserted'
        ),
        'consumedSnapshotChangeIds', (
          select json_agg(detail.snapshot_change_id order by detail.snapshot_change_id)
          from public.litter_plan_actual_birth_plan_reversal_changes detail
          where detail.activation_id = ${q(lateActivation)}::uuid
            and detail.reversal_action = 'delete_inserted'
        ),
        'insertedRemaining', (
          select count(*)
          from public.litter_plan_actual_birth_activation_reversal_changes change
          join public.litter_care_tasks task on task.id = change.entity_id
          where change.activation_id = ${q(lateActivation)}::uuid
            and change.change_kind = 'insert'
        ),
        'futureTask', (
          select to_jsonb(task)
          from public.litter_care_tasks task
          where task.id = ${q(ids.lateFutureTask)}::uuid
        ),
        'restoredItems', reversal.restored_item_count,
        'restoredSeries', reversal.restored_series_count
      )::text
      from public.litter_plan_actual_birth_plan_reversals reversal
      where reversal.activation_id = ${q(lateActivation)}::uuid
    `);
    expect(lateRestoration.deletedTaskIds).toEqual(
      lateSnapshot.inserted.map((change) => change.taskId).sort(),
    );
    expect(lateRestoration.consumedSnapshotChangeIds).toEqual(
      lateSnapshot.inserted.map((change) => change.snapshotChangeId).sort(),
    );
    expect(lateRestoration.insertedRemaining).toBe(0);
    expect(lateRestoration.restoredItems).toBeGreaterThan(0);
    expect(lateRestoration.restoredSeries).toBeGreaterThan(0);
    const lateFutureBefore = lateSnapshot.updated.find(
      (change) => change.taskId === ids.lateFutureTask,
    );
    expect(lateFutureBefore).toBeDefined();
    expect(withoutMonotoneMetadata(lateRestoration.futureTask))
      .toEqual(withoutMonotoneMetadata(lateFutureBefore?.snapshotBefore));
    expect(birthState(ids.lateBirthLitter)).toMatchObject({
      actualBirthDate: null,
      activeBirths: 0,
      reversals: 1,
      deactivations: 1,
      currentActivationId: null,
    });

    await applyModel(
      owner,
      ids.correctionLitter,
      preModelCode,
      ids.correctionPreApply,
      null,
    );
    await applyModel(
      owner,
      ids.correctionLitter,
      postModelCode,
      ids.correctionPostApply,
      planRevision(ids.correctionLitter),
    );
    const correctionBirthId = await createBirth(
      owner,
      ids.correctionLitter,
      ids.correctionOpen,
      ids.correctionBirth,
      "2026-08-16T03:00:00+02:00",
    );
    const correctionActivation = activationId(ids.correctionLitter);
    const correctionPlanRevisionBefore =
      planRevision(ids.correctionLitter);
    const corrected = await correctWhelpingBirthCore(
      {
        birthId: correctionBirthId,
        clientCommandId: ids.correctionCommand,
        expectedRevisionNo: 0,
        occurredAt: "2026-08-17T03:00:00+02:00",
        sex: "female",
        viability: "alive",
        initialCollarColor: null,
        birthNote: "Fixture moteur de restauration",
        weightGrams: null,
        weightMeasuredAt: null,
        weightNote: null,
        reason: "Correction de date adverse avant restauration",
      },
      owner,
    );
    expect(corrected).toMatchObject({
      outcome: "success",
      revisionNo: 1,
      replayed: false,
    });
    const correctionReconciled = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'actualBirthDate', litter.actual_birth_date,
        'birthOccurredAt', birth.occurred_at,
        'birthRevision', birth.revision_no,
        'planRevision', plan.revision,
        'reconciliationCount', (
          select count(*)
          from public.litter_plan_actual_birth_reconciliations row
          where row.litter_id = litter.id
        ),
        'seriesReconciliationCount', (
          select count(*)
          from public.litter_plan_series_actual_birth_reconciliation_commands row
          where row.litter_id = litter.id
        )
      )::text
      from public.litters litter
      join public.litter_plans plan
        on plan.litter_id = litter.id and plan.status = 'active'
      join public.whelping_sessions session on session.litter_id = litter.id
      join public.whelping_births birth
        on birth.session_id = session.id and birth.id = ${q(correctionBirthId)}::uuid
      where litter.id = ${q(ids.correctionLitter)}::uuid
    `);
    expect(correctionReconciled).toMatchObject({
      actualBirthDate: "2026-08-17",
      birthRevision: 1,
      planRevision: correctionPlanRevisionBefore + 1,
    });
    expect(
      Number(correctionReconciled.reconciliationCount) +
      Number(correctionReconciled.seriesReconciliationCount),
    ).toBeGreaterThan(0);
    expect(publicCancellationTransaction(
      correctionBirthId,
      ids.correctionCancel,
      "2026-08-17T04:00:00+02:00",
      "",
      1,
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.correctionLitter)).toMatchObject({
      actualBirthDate: "2026-08-17",
      activeBirths: 1,
      adjustments: 1,
      reversals: 0,
      deactivations: 0,
      currentActivationId: correctionActivation,
    });
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'birthOccurredAt', birth.occurred_at,
        'birthRevision', birth.revision_no,
        'planRevision', plan.revision,
        'cancelCommandCount', (
          select count(*) from public.whelping_birth_adjustment_commands
          where client_command_id = ${q(ids.correctionCancel)}::uuid
        )
      )::text
      from public.whelping_births birth
      join public.whelping_sessions session on session.id = birth.session_id
      join public.litter_plans plan
        on plan.litter_id = session.litter_id and plan.status = 'active'
      where birth.id = ${q(correctionBirthId)}::uuid
    `)).toEqual({
      birthOccurredAt: "2026-08-17T01:00:00+00:00",
      birthRevision: 1,
      planRevision: correctionPlanRevisionBefore + 1,
      cancelCommandCount: 0,
    });

    await applyModel(
      owner,
      ids.missingEntityLitter,
      postModelCode,
      ids.missingEntityPostApply,
      null,
    );
    const missingEntityBirthId = await createBirth(
      owner,
      ids.missingEntityLitter,
      ids.missingEntityOpen,
      ids.missingEntityBirth,
      "2026-08-17T03:00:00+02:00",
    );
    const missingEntityActivation = activationId(ids.missingEntityLitter);
    const missingTaskId = sql(`
      select change.entity_id
      from public.litter_plan_actual_birth_activation_reversal_changes change
      where change.activation_id = ${q(missingEntityActivation)}::uuid
        and change.entity_kind = 'litter_care_task'
        and change.change_kind = 'insert'
        and change.snapshot_after ->> 'litter_plan_series_id' is null
      order by change.sequence_no
      limit 1
    `);
    sql(`
      delete from public.litter_care_tasks
      where id = ${q(missingTaskId)}::uuid
    `);
    expect(publicCancellationTransaction(
      missingEntityBirthId,
      ids.missingEntityCancel,
      "2026-08-17T04:00:00+02:00",
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.missingEntityLitter)).toMatchObject({
      actualBirthDate: "2026-08-17",
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
      currentActivationId: missingEntityActivation,
    });
    expect(jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'taskStillMissing', not exists (
          select 1 from public.litter_care_tasks
          where id = ${q(missingTaskId)}::uuid
        ),
        'cancelCommandCount', (
          select count(*) from public.whelping_birth_adjustment_commands
          where client_command_id = ${q(ids.missingEntityCancel)}::uuid
        ),
        'snapshotChangeStillPresent', exists (
          select 1
          from public.litter_plan_actual_birth_activation_reversal_changes
          where activation_id = ${q(missingEntityActivation)}::uuid
            and entity_id = ${q(missingTaskId)}::uuid
        )
      )::text
    `)).toEqual({
      taskStillMissing: true,
      cancelCommandCount: 0,
      snapshotChangeStillPresent: true,
    });

    await applyModel(
      owner,
      ids.divergenceLitter,
      postModelCode,
      ids.divergencePostApply,
      null,
    );
    const divergenceBirthId = await createBirth(
      owner,
      ids.divergenceLitter,
      ids.divergenceOpen,
      ids.divergenceBirth,
      "2026-08-10T03:00:00+02:00",
    );
    const staleCancellation = await cancelWhelpingBirthCore(
      {
        birthId: divergenceBirthId,
        clientCommandId: ids.staleCancel,
        expectedRevisionNo: 99,
        cancelledAt: "2026-08-10T03:30:00+02:00",
        reason: "Révision obsolète",
      },
      owner,
    );
    expect(staleCancellation).toMatchObject({
      outcome: "error",
      error: { code: "stale_revision" },
    });
    expect(birthState(ids.divergenceLitter)).toMatchObject({
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
    });
    sql(`
      update public.litter_care_tasks task
      set
        planned_for = task.planned_for + 1,
        suggested_for = task.suggested_for + 1,
        revision_no = task.revision_no + 1,
        updated_by = ${q(ownerId)}::uuid
      where task.id = (
        select change.entity_id
        from public.litter_plan_actual_birth_activation_reversal_changes change
        where change.activation_id = ${q(activationId(ids.divergenceLitter))}::uuid
          and change.entity_kind = 'litter_care_task'
        order by change.sequence_no
        limit 1
      )
    `);
    expect(publicCancellationTransaction(
      divergenceBirthId,
      ids.divergenceCancel,
      "2026-08-10T04:00:00+02:00",
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.divergenceLitter)).toMatchObject({
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
      currentActivationId: activationId(ids.divergenceLitter),
    });

    await applyModel(
      owner,
      ids.dependencyLitter,
      postModelCode,
      ids.dependencyPostApply,
      null,
    );
    const dependencyBirthId = await createBirth(
      owner,
      ids.dependencyLitter,
      ids.dependencyOpen,
      ids.dependencyBirth,
      "2026-08-11T03:00:00+02:00",
    );
    sql(`
      insert into public.calendar_reminders (
        id, organization_id, litter_care_task_id, days_before, local_time,
        timezone_name, created_by, updated_by
      )
      select
        ${q(ids.reminder)}::uuid,
        ${q(ids.organization)}::uuid,
        change.entity_id,
        0,
        '08:00'::time,
        'Europe/Paris',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      from public.litter_plan_actual_birth_activation_reversal_changes change
      where change.activation_id = ${q(activationId(ids.dependencyLitter))}::uuid
        and change.entity_kind = 'litter_care_task'
        and change.change_kind = 'insert'
      order by change.sequence_no
      limit 1
    `);
    expect(publicCancellationTransaction(
      dependencyBirthId,
      ids.dependencyCancel,
      "2026-08-11T04:00:00+02:00",
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.dependencyLitter)).toMatchObject({
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
    });

    const legacyBirthId = await createBirth(
      owner,
      ids.legacyLitter,
      ids.legacyOpen,
      ids.legacyBirth,
      "2026-08-12T03:00:00+02:00",
    );
    sql(`
      begin;
      select pg_catalog.set_config('app.fixture_cleanup', 'on', true);
      delete from public.litter_plan_actual_birth_activation_reversal_snapshots
      where activation_id = ${q(activationId(ids.legacyLitter))}::uuid;
      commit
    `);
    expect(publicCancellationTransaction(
      legacyBirthId,
      ids.legacyCancel,
      "2026-08-12T04:00:00+02:00",
    )).toMatchObject({
      outcome: "error",
      reason: "birth_has_downstream_data",
      replayed: false,
    });
    expect(birthState(ids.legacyLitter)).toMatchObject({
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
    });

    await applyModel(
      owner,
      ids.rollbackLitter,
      postModelCode,
      ids.rollbackPostApply,
      null,
    );
    const rollbackBirthId = await createBirth(
      owner,
      ids.rollbackLitter,
      ids.rollbackOpen,
      ids.rollbackBirth,
      "2026-08-13T03:00:00+02:00",
    );
    expect(publicCancellationTransaction(
      rollbackBirthId,
      ids.rollbackCancel,
      "2026-08-13T04:00:00+02:00",
      `
        create function pg_temp.fail_plan_reversal_audit()
        returns trigger language plpgsql as $trigger$
        begin
          raise exception 'forced plan reversal audit failure';
        end;
        $trigger$;
        create trigger e7310011_forced_plan_reversal_audit
        before insert on public.litter_plan_actual_birth_plan_reversals
        for each row execute function pg_temp.fail_plan_reversal_audit();
      `,
    )).toMatchObject({
      outcome: "error",
      reason: "technical_error",
      replayed: false,
    });
    expect(birthState(ids.rollbackLitter)).toMatchObject({
      activeBirths: 1,
      adjustments: 0,
      reversals: 0,
      deactivations: 0,
      currentActivationId: activationId(ids.rollbackLitter),
    });
    expect(Number(sql(`
      select count(*) from pg_catalog.pg_trigger
      where tgname = 'e7310011_forced_plan_reversal_audit'
    `))).toBe(0);

    const security = jsonSql<Record<string, unknown>>(`
      with target_tables(name, relation) as (
        values
          ('headers', 'public.litter_plan_actual_birth_plan_reversals'::regclass),
          ('details', 'public.litter_plan_actual_birth_plan_reversal_changes'::regclass)
      )
      select json_build_object(
        'tables', (
          select json_object_agg(target.name, json_build_object(
            'rls', class.relrowsecurity,
            'policies', (
              select count(*) from pg_catalog.pg_policy policy
              where policy.polrelid = target.relation
            ),
            'authenticatedAccess', has_table_privilege(
              'authenticated', target.relation, 'SELECT,INSERT,UPDATE,DELETE'
            )
          ))
          from target_tables target
          join pg_catalog.pg_class class on class.oid = target.relation
        ),
        'privateOwner', pg_catalog.pg_get_userbyid(procedure.proowner),
        'privateSecurityDefiner', procedure.prosecdef,
        'privateConfig', procedure.proconfig,
        'privatePublicExecute', has_function_privilege(
          'public', procedure.oid, 'EXECUTE'
        ),
        'privateAnonExecute', has_function_privilege(
          'anon', procedure.oid, 'EXECUTE'
        ),
        'privateAuthenticatedExecute', has_function_privilege(
          'authenticated', procedure.oid, 'EXECUTE'
        ),
        'publicCancellationWired', position(
          'reverse_litter_plan_after_cancelled_first_birth_internal'
          in pg_catalog.pg_get_functiondef(
            'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
          )
        ) > 0
      )::text
      from pg_catalog.pg_proc procedure
      where procedure.oid =
        'public.reverse_litter_plan_after_cancelled_first_birth_internal(uuid,uuid,uuid,uuid)'::regprocedure
    `);
    expect(security).toMatchObject({
      tables: {
        headers: { rls: true, policies: 0, authenticatedAccess: false },
        details: { rls: true, policies: 0, authenticatedAccess: false },
      },
      privateOwner: "postgres",
      privateSecurityDefiner: true,
      privateConfig: ["search_path=\"\"", "row_security=off"],
      privatePublicExecute: false,
      privateAnonExecute: false,
      privateAuthenticatedExecute: false,
      publicCancellationWired: true,
    });
    fixtureManifest = jsonSql<Record<string, unknown>>(`
      select json_build_object(
        'deterministicIds', ${q(JSON.stringify(ids))}::json,
        'plans', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plans
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'planItems', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plan_items
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'series', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plan_series
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'tasks', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_care_tasks
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'sessions', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.whelping_sessions
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'events', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.whelping_events
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'births', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.whelping_births
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'offspring', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.animals
          where organization_id = ${q(ids.organization)}::uuid
            and litter_id is not null
        ),
        'activations', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plan_actual_birth_activations
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'snapshots', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plan_actual_birth_activation_reversal_snapshots
          where organization_id = ${q(ids.organization)}::uuid
        ),
        'reversals', (
          select coalesce(json_agg(id order by id), '[]'::json)
          from public.litter_plan_actual_birth_plan_reversals
          where organization_id = ${q(ids.organization)}::uuid
        )
      )::text
    `);
  } finally {
    cleanup();
    const remaining = fixtureCounts();
    for (const [table, count] of Object.entries(remaining)) {
      expect(count, `${table} fixtures must be physically deleted`).toBe(0);
    }
    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_REVERSAL_FIXTURES=${JSON.stringify(fixtureManifest)}`,
    );
    console.log(
      `LITTER_ACTUAL_BIRTH_PLAN_REVERSAL_CLEANUP=${JSON.stringify(remaining)}`,
    );
  }
});

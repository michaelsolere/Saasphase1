export const fixtureTables = [
  "post_adoption_questionnaire_reconciliation_run_results",
  "post_adoption_questionnaire_reconciliation_attempts",
  "post_adoption_questionnaire_reconciliation_runs",
  "post_adoption_questionnaire_events",
  "post_adoption_questionnaire_response_revisions",
  "post_adoption_questionnaire_drafts",
  "post_adoption_questionnaire_instances",
  "notes",
  "calendar_reminder_commands",
  "calendar_reminders",
  "events",
  "documents",
  "payments",
  "contact_roles",
  "reservations",
  "applications",
  "contacts",
  "maternal_observation_task_links",
  "maternal_observation_commands",
  "maternal_observations",
  "litter_plan_actual_birth_reconciliation_task_changes",
  "litter_plan_actual_birth_reconciliations",
  "litter_plan_series_actual_birth_reconciliation_changes",
  "litter_plan_series_actual_birth_reconciliation_commands",
  "litter_plan_actual_birth_plan_reversal_changes",
  "litter_plan_actual_birth_plan_reversals",
  "litter_plan_actual_birth_activation_reversal_changes",
  "litter_plan_actual_birth_activation_reversal_snapshots",
  "litter_plan_actual_birth_activation_deactivations",
  "litter_plan_actual_birth_activation_states",
  "litter_plan_actual_birth_activations",
  "litter_care_tasks",
  "litter_plan_series_time_slots",
  "litter_plan_series_materialization_commands",
  "litter_plan_series_state_commands",
  "litter_plan_anchor_recalculation_commands",
  "litter_plan_series",
  "litter_plan_application_commands",
  "litter_plan_items",
  "litter_plans",
  "litter_planning_model_item_time_slots",
  "litter_planning_model_commands",
  "litter_planning_model_items",
  "litter_planning_models",
  "litter_care_task_templates",
  "whelping_birth_adjustment_commands",
  "whelping_commands",
  "litter_weight_adjustment_commands",
  "litter_weight_commands",
  "animal_weight_measurements",
  "litter_weighing_sessions",
  "whelping_births",
  "whelping_events",
  "whelping_sessions",
  "reproductive_cycle_matings",
  "progesterone_measurements",
  "reproductive_cycles",
  "organization_calendar_feeds",
  "litters",
  "litter_groups",
  "animals",
  "memberships",
  "organizations",
] as const;
export type FixtureTable = (typeof fixtureTables)[number];
export type SqlExecutor = (sql: string) => string | Promise<string>;

const cleanupOrder: FixtureTable[] = [
  "post_adoption_questionnaire_reconciliation_run_results",
  "post_adoption_questionnaire_reconciliation_attempts",
  "post_adoption_questionnaire_reconciliation_runs",
  "post_adoption_questionnaire_events",
  "post_adoption_questionnaire_response_revisions",
  "post_adoption_questionnaire_drafts",
  "post_adoption_questionnaire_instances",
  "notes",
  "calendar_reminder_commands",
  "calendar_reminders",
  "events",
  "documents",
  "payments",
  "contact_roles",
  "reservations",
  "applications",
  "contacts",
  "maternal_observation_task_links",
  "maternal_observation_commands",
  "maternal_observations",
  "litter_plan_actual_birth_reconciliation_task_changes",
  "litter_plan_actual_birth_reconciliations",
  "litter_plan_series_actual_birth_reconciliation_changes",
  "litter_plan_series_actual_birth_reconciliation_commands",
  "litter_plan_actual_birth_plan_reversal_changes",
  "litter_plan_actual_birth_plan_reversals",
  "litter_plan_actual_birth_activation_reversal_changes",
  "litter_plan_actual_birth_activation_reversal_snapshots",
  "litter_plan_actual_birth_activation_deactivations",
  "litter_plan_actual_birth_activation_states",
  "litter_plan_actual_birth_activations",
  "litter_care_tasks",
  "litter_plan_series_time_slots",
  "litter_plan_series_materialization_commands",
  "litter_plan_series_state_commands",
  "litter_plan_anchor_recalculation_commands",
  "litter_plan_series",
  "litter_plan_application_commands",
  "litter_plan_items",
  "litter_plans",
  "litter_planning_model_item_time_slots",
  "litter_planning_model_commands",
  "litter_planning_model_items",
  "litter_planning_models",
  "litter_care_task_templates",
  "whelping_birth_adjustment_commands",
  "whelping_commands",
  "litter_weight_adjustment_commands",
  "litter_weight_commands",
  "animal_weight_measurements",
  "litter_weighing_sessions",
  "whelping_births",
  "whelping_events",
  "whelping_sessions",
  "reproductive_cycle_matings",
  "progesterone_measurements",
  "reproductive_cycles",
  "organization_calendar_feeds",
  "litters",
  "litter_groups",
  "animals",
  "memberships",
  "organizations",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idsSql(ids: string[]) { return ids.map((id) => `'${id}'::uuid`).join(", "); }

export function createE2eFixtureRegistry(execute: SqlExecutor, namespace = `e2e-${crypto.randomUUID()}`) {
  const ids = new Map<FixtureTable, Set<string>>(fixtureTables.map((table) => [table, new Set()]));
  const register = (table: FixtureTable, id: string) => {
    if (!fixtureTables.includes(table)) throw new Error(`Unsupported E2E fixture table: ${table}`);
    if (!uuid.test(id)) throw new Error(`Invalid E2E fixture UUID for ${table}: ${id}`);
    const tableIds = ids.get(table)!;
    if (tableIds.has(id)) throw new Error(`Duplicate E2E fixture ${table}:${id}`);
    tableIds.add(id);
    return id;
  };
  const has = (table: FixtureTable, id: string) => ids.get(table)?.has(id) ?? false;
  const counts = async () => Object.fromEntries(await Promise.all(fixtureTables.map(async (table) => {
    const tableIds = [...ids.get(table)!];
    if (tableIds.length === 0) return [table, 0];
    return [table, Number(await execute(`select count(*)::text from public.${table} where id in (${idsSql(tableIds)})`))];
  }))) as Record<FixtureTable, number>;
  const cleanup = async () => {
    const animalIds = [...ids.get("animals")!];
    for (const table of cleanupOrder) { const tableIds = [...ids.get(table)!]; if (tableIds.length) {
    if (table === "animals" || table === "organizations") continue;
    if (table === "litter_care_tasks") {
      await execute(`delete from public.litter_care_task_schedule_changes where task_id in (${idsSql(tableIds)})`);
      await execute(`delete from public.litter_care_task_schedule_commands where task_id in (${idsSql(tableIds)})`);
    }
    if (table === "reproductive_cycles") {
      await execute(`update public.reproductive_cycles set litter_id = null where id in (${idsSql(tableIds)})`);
    }
    if (table === "litters" && animalIds.length) await execute(`delete from public.animals where id in (${idsSql(animalIds)}) and litter_id is not null`);
    const statement = `delete from public.${table} where id in (${idsSql(tableIds)})`;
    const requiresAppendOnlyBypass =
      table === "litter_plan_actual_birth_reconciliation_task_changes"
      || table === "litter_plan_actual_birth_reconciliations"
      || table === "litter_plan_series_actual_birth_reconciliation_changes"
      || table === "litter_plan_series_actual_birth_reconciliation_commands"
      || table === "litter_plan_actual_birth_plan_reversal_changes"
      || table === "litter_plan_actual_birth_plan_reversals"
      || table === "litter_plan_actual_birth_activation_reversal_changes"
      || table === "litter_plan_actual_birth_activation_reversal_snapshots"
      || table === "whelping_birth_adjustment_commands"
      || table === "litter_plan_actual_birth_activation_deactivations"
      || table === "litter_plan_actual_birth_activations";
    const requiresPostAdoptionBypass =
      table === "post_adoption_questionnaire_reconciliation_run_results"
      || table === "post_adoption_questionnaire_reconciliation_attempts"
      || table === "post_adoption_questionnaire_reconciliation_runs"
      || table === "post_adoption_questionnaire_events"
      || table === "post_adoption_questionnaire_response_revisions";
    await execute(
      requiresPostAdoptionBypass
        ? `begin; set local app.qa_hard_delete = 'on'; ${statement}; commit;`
        : requiresAppendOnlyBypass
          ? `begin; set local session_replication_role = replica; set local app.fixture_cleanup = 'on'; ${statement}; commit;`
          : statement,
    );
  } }
    if (animalIds.length) await execute(`delete from public.animals where id in (${idsSql(animalIds)})`);
    const organizationIds = [...ids.get("organizations")!];
    if (organizationIds.length) await execute(`delete from public.organizations where id in (${idsSql(organizationIds)})`);
  };
  const assertEmpty = async () => {
    const remaining = await counts();
    const taskIds = [...ids.get("litter_care_tasks")!];
    const scheduleRemaining = taskIds.length === 0
      ? { schedule_changes: 0, schedule_commands: 0 }
      : {
          schedule_changes: Number(await execute(`select count(*)::text from public.litter_care_task_schedule_changes where task_id in (${idsSql(taskIds)})`)),
          schedule_commands: Number(await execute(`select count(*)::text from public.litter_care_task_schedule_commands where task_id in (${idsSql(taskIds)})`)),
        };
    const allRemaining = { ...remaining, ...scheduleRemaining };
    const dirty = Object.entries(allRemaining).filter(([, count]) => count !== 0);
    if (dirty.length) throw new Error(`E2E fixture cleanup left rows: ${dirty.map(([table, count]) => `${table}=${count}`).join(", ")}`);
    return allRemaining;
  };
  return { namespace, register, has, cleanup, assertEmpty, counts, cleanupOrder: [...cleanupOrder] };
}

export async function withE2eFixtures<T>(execute: SqlExecutor, scenario: (fixtures: ReturnType<typeof createE2eFixtureRegistry>) => Promise<T>, namespace?: string) {
  const fixtures = createE2eFixtureRegistry(execute, namespace);
  let scenarioError: unknown;
  try { return await scenario(fixtures); } catch (error) { scenarioError = error; throw error; } finally {
    try { await fixtures.cleanup(); await fixtures.assertEmpty(); } catch (cleanupError) {
      if (scenarioError instanceof Error) { (scenarioError as Error & { cleanupError?: unknown }).cleanupError = cleanupError; }
      else throw cleanupError;
    }
  }
}

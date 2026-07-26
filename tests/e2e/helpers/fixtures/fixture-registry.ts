export const fixtureTables = [
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
  "litter_care_tasks",
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
  "litter_care_tasks",
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
    await execute(table === "whelping_birth_adjustment_commands" ? `begin; set local app.fixture_cleanup = 'on'; ${statement}; commit;` : statement);
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

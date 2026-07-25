import { randomUUID } from "node:crypto";

import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type PuppyFixture = { id: string; organizationId: string; litterId: string };
type SessionFixture = { id: string; organizationId: string; litterId: string; measuredAt: string };

type PuppyInput = {
  id?: string;
  organizationId: string;
  litterId: string;
  ownerId: string;
  motherId?: string;
  fatherId?: string;
  name?: string;
  sex?: "female" | "male";
  birthDate?: string;
  birthOrder?: number;
};
type SessionInput = {
  id?: string;
  organizationId: string;
  litterId: string;
  ownerId: string;
  measuredAt: string;
  timezoneName?: string;
  note?: string | null;
};
type MeasurementInput = {
  id?: string;
  organizationId: string;
  ownerId: string;
  puppyId: string;
  sessionId: string;
  grams: number;
  note?: string | null;
};

const relations = new WeakMap<Registry, { puppies: Map<string, PuppyFixture>; sessions: Map<string, SessionFixture> }>();
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const fixtureId = (value?: string) => value ?? randomUUID();

function state(registry: Registry) {
  let current = relations.get(registry);
  if (!current) {
    current = { puppies: new Map(), sessions: new Map() };
    relations.set(registry, current);
  }
  return current;
}

async function insert(execute: SqlExecutor, sql: string) {
  await execute(sql);
}

function validateWeight(grams: number) {
  if (!Number.isInteger(grams) || grams < 1 || grams > 100_000) {
    throw new Error("E2E weight must be an integer between 1 and 100000 grams");
  }
}

export async function createTestPuppy(execute: SqlExecutor, registry: Registry, input: PuppyInput): Promise<PuppyFixture> {
  if (input.birthOrder !== undefined && input.birthOrder < 1) throw new Error("E2E puppy birth order must be positive");
  const entityId = fixtureId(input.id);
  await insert(execute, `insert into public.animals (id,organization_id,litter_id,mother_id,father_id,call_name,species,breed,sex,status,ownership_status,birth_date,birth_order,created_by,updated_by) values (${q(entityId)}::uuid,${q(input.organizationId)}::uuid,${q(input.litterId)}::uuid,${input.motherId ? `${q(input.motherId)}::uuid` : "null"},${input.fatherId ? `${q(input.fatherId)}::uuid` : "null"},${q(input.name ?? `E2E puppy ${registry.namespace}`)},'dog','Golden Retriever',${q(input.sex ?? "female")},'born','produced',${input.birthDate ? q(input.birthDate) : "null"},${input.birthOrder?.toString() ?? "null"},${q(input.ownerId)}::uuid,${q(input.ownerId)}::uuid)`);
  registry.register("animals", entityId);
  const puppy = { id: entityId, organizationId: input.organizationId, litterId: input.litterId };
  state(registry).puppies.set(entityId, puppy);
  return puppy;
}

export async function createTestWeighingSession(execute: SqlExecutor, registry: Registry, input: SessionInput): Promise<SessionFixture> {
  const entityId = fixtureId(input.id);
  const timezoneName = input.timezoneName ?? "Europe/Paris";
  await insert(execute, `insert into public.litter_weighing_sessions (id,organization_id,litter_id,measured_at,timezone_name,note,created_by) values (${q(entityId)}::uuid,${q(input.organizationId)}::uuid,${q(input.litterId)}::uuid,${q(input.measuredAt)}::timestamptz,${q(timezoneName)},${input.note === undefined || input.note === null ? "null" : q(input.note)},${q(input.ownerId)}::uuid)`);
  registry.register("litter_weighing_sessions", entityId);
  const session = { id: entityId, organizationId: input.organizationId, litterId: input.litterId, measuredAt: input.measuredAt };
  state(registry).sessions.set(entityId, session);
  return session;
}

export async function createTestWeightMeasurement(execute: SqlExecutor, registry: Registry, input: MeasurementInput) {
  validateWeight(input.grams);
  const puppy = state(registry).puppies.get(input.puppyId);
  const session = state(registry).sessions.get(input.sessionId);
  if (puppy && (puppy.organizationId !== input.organizationId || puppy.litterId !== session?.litterId)) throw new Error("E2E weight puppy does not belong to the weighing session litter");
  if (session && session.organizationId !== input.organizationId) throw new Error("E2E weight session belongs to another organization");
  if (puppy && session && puppy.litterId !== session.litterId) throw new Error("E2E weight puppy does not belong to the weighing session litter");
  const entityId = fixtureId(input.id);
  await insert(execute, `insert into public.animal_weight_measurements (id,organization_id,animal_id,litter_weighing_session_id,measured_at,grams,measurement_kind,note,created_by) values (${q(entityId)}::uuid,${q(input.organizationId)}::uuid,${q(input.puppyId)}::uuid,${q(input.sessionId)}::uuid,${q(session?.measuredAt ?? "") }::timestamptz,${input.grams},'routine',${input.note === undefined || input.note === null ? "null" : q(input.note)},${q(input.ownerId)}::uuid)`);
  registry.register("animal_weight_measurements", entityId);
  return { id: entityId, puppyId: input.puppyId, sessionId: input.sessionId, grams: input.grams, measuredAt: session?.measuredAt };
}

export async function createTestLitterWithPuppies(execute: SqlExecutor, registry: Registry, input: { organizationId: string; litterId: string; ownerId: string; puppies: Omit<PuppyInput, "organizationId" | "litterId" | "ownerId">[] }) {
  const puppies = await Promise.all(input.puppies.map((puppy) => createTestPuppy(execute, registry, { ...puppy, organizationId: input.organizationId, litterId: input.litterId, ownerId: input.ownerId })));
  return { litterId: input.litterId, puppies };
}

export async function createTestWeighingSeries(execute: SqlExecutor, registry: Registry, input: { puppyId: string; ownerId: string; values: readonly { day: string; weightGrams: number }[]; timezoneName?: string }) {
  const puppy = state(registry).puppies.get(input.puppyId);
  if (!puppy) throw new Error("E2E weighing series puppy must be created by this registry");
  const snapshot = structuredClone(input);
  const sessionsByMeasuredAt = new Map([...state(registry).sessions.values()].filter((session) => session.organizationId === puppy.organizationId && session.litterId === puppy.litterId).map((session) => [session.measuredAt, session]));
  const rows = [];
  for (const value of [...input.values].sort((left, right) => left.day.localeCompare(right.day))) {
    validateWeight(value.weightGrams);
    const measuredAt = `${value.day}T08:00:00.000Z`;
    let session = sessionsByMeasuredAt.get(measuredAt);
    if (!session) {
      session = await createTestWeighingSession(execute, registry, { organizationId: puppy.organizationId, litterId: puppy.litterId, ownerId: input.ownerId, measuredAt, timezoneName: input.timezoneName ?? "Europe/Paris" });
      sessionsByMeasuredAt.set(measuredAt, session);
    }
    rows.push(await createTestWeightMeasurement(execute, registry, { organizationId: puppy.organizationId, ownerId: input.ownerId, puppyId: puppy.id, sessionId: session.id, grams: value.weightGrams }));
  }
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E weighing series mutated its input");
  return { puppy, sessions: rows.map((row) => state(registry).sessions.get(row.sessionId)!), measurements: rows };
}

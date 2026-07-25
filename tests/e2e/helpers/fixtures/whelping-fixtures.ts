import { randomUUID } from "node:crypto";

import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type WhelpingSession = { id: string; organizationId: string; litterId: string; motherId: string; startedAt: string; timezoneName: string };
type WhelpingBirth = { id: string; organizationId: string; sessionId: string; eventId: string; puppyId: string; birthOrder: number; occurredAt: string; weightMeasurementId: string | null };
type State = { sessions: Map<string, WhelpingSession>; births: Map<string, WhelpingBirth>; birthOrders: Map<string, Set<number>> };

const states = new WeakMap<Registry, State>();
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const fixtureId = (value?: string) => value ?? randomUUID();
const utc = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) throw new Error("E2E whelping timestamps must include an explicit offset");
  return timestamp;
};
function state(registry: Registry) {
  let current = states.get(registry);
  if (!current) { current = { sessions: new Map(), births: new Map(), birthOrders: new Map() }; states.set(registry, current); }
  return current;
}
function validWeight(grams: number) {
  if (!Number.isInteger(grams) || grams < 1 || grams > 100_000) throw new Error("E2E birth weight must be an integer between 1 and 100000 grams");
}
function validBirthOrder(order: number) {
  if (!Number.isInteger(order) || order < 1) throw new Error("E2E birth order must be a positive integer");
}

export async function createTestWhelpingSession(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; litterId: string; motherId: string; ownerId: string; startedAt: string; timezoneName?: string }) {
  const snapshot = structuredClone(input); const id = fixtureId(input.id); const timezoneName = input.timezoneName ?? "Europe/Paris";
  utc(input.startedAt);
  await execute(`insert into public.whelping_sessions (id,organization_id,litter_id,mother_id,status,started_at,timezone_name,created_by,updated_by) values (${quote(id)}::uuid,${quote(input.organizationId)}::uuid,${quote(input.litterId)}::uuid,${quote(input.motherId)}::uuid,'open',${quote(input.startedAt)}::timestamptz,${quote(timezoneName)},${quote(input.ownerId)}::uuid,${quote(input.ownerId)}::uuid)`);
  registry.register("whelping_sessions", id);
  const row = { id, organizationId: input.organizationId, litterId: input.litterId, motherId: input.motherId, startedAt: input.startedAt, timezoneName };
  state(registry).sessions.set(id, row); if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E whelping session mutated its input"); return row;
}

export async function createTestWhelpingEvent(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; sessionId: string; ownerId: string; sequenceNo: number; occurredAt: string; eventType: "labor_started" | "contractions" | "water_broke" | "placenta" | "nursing" | "vet_called" | "intervention" | "observation" | "birth"; note?: string | null }) {
  const snapshot = structuredClone(input); const session = state(registry).sessions.get(input.sessionId);
  if (!session || session.organizationId !== input.organizationId) throw new Error("E2E whelping event session belongs to another organization");
  if (!Number.isInteger(input.sequenceNo) || input.sequenceNo < 1) throw new Error("E2E whelping event sequence must be positive");
  if (utc(input.occurredAt) < utc(session.startedAt)) throw new Error("E2E whelping event precedes its session");
  const id = fixtureId(input.id);
  await execute(`insert into public.whelping_events (id,organization_id,session_id,sequence_no,occurred_at,event_type,note,author_id) values (${quote(id)}::uuid,${quote(input.organizationId)}::uuid,${quote(input.sessionId)}::uuid,${input.sequenceNo},${quote(input.occurredAt)}::timestamptz,${quote(input.eventType)},${input.note == null ? "null" : quote(input.note)},${quote(input.ownerId)}::uuid)`);
  registry.register("whelping_events", id); if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E whelping event mutated its input"); return { id, ...input };
}

export async function createTestBirthWithPuppy(execute: SqlExecutor, registry: Registry, input: { id?: string; eventId: string; puppyId?: string; weightMeasurementId?: string; organizationId: string; sessionId: string; ownerId: string; birthOrder: number; occurredAt: string; sex: "female" | "male" | "unknown"; viability?: "alive" | "stillborn" | "unknown"; weightGrams?: number | null }) {
  const snapshot = structuredClone(input); const session = state(registry).sessions.get(input.sessionId);
  if (!session || session.organizationId !== input.organizationId) throw new Error("E2E birth session belongs to another organization"); validBirthOrder(input.birthOrder); utc(input.occurredAt);
  if (utc(input.occurredAt) < utc(session.startedAt)) throw new Error("E2E birth precedes its session"); if (input.weightGrams != null) validWeight(input.weightGrams);
  const orders = state(registry).birthOrders.get(input.sessionId) ?? new Set<number>(); if (orders.has(input.birthOrder)) throw new Error("E2E birth order is duplicated for this session");
  const id = fixtureId(input.id), puppyId = fixtureId(input.puppyId), viability = input.viability ?? "alive";
  const birthDate = new Intl.DateTimeFormat("en-CA", { timeZone: session.timezoneName }).format(new Date(input.occurredAt));
  await execute(`insert into public.animals (id,organization_id,litter_id,mother_id,call_name,species,breed,sex,status,ownership_status,birth_date,birth_order,created_by,updated_by) values (${quote(puppyId)}::uuid,${quote(input.organizationId)}::uuid,${quote(session.litterId)}::uuid,${quote(session.motherId)}::uuid,${quote(`E2E puppy ${registry.namespace}`)},'dog','Golden Retriever',${quote(input.sex)},${quote(viability === "stillborn" ? "stillborn" : "born")},'produced',${quote(birthDate)},${input.birthOrder},${quote(input.ownerId)}::uuid,${quote(input.ownerId)}::uuid)`);
  registry.register("animals", puppyId);
  await execute(`insert into public.whelping_births (id,organization_id,session_id,event_id,animal_id,birth_order,sex,viability,occurred_at,created_by) values (${quote(id)}::uuid,${quote(input.organizationId)}::uuid,${quote(input.sessionId)}::uuid,${quote(input.eventId)}::uuid,${quote(puppyId)}::uuid,${input.birthOrder},${quote(input.sex)},${quote(viability)},${quote(input.occurredAt)}::timestamptz,${quote(input.ownerId)}::uuid)`);
  registry.register("whelping_births", id); let weightMeasurementId: string | null = null;
  if (input.weightGrams != null) { weightMeasurementId = fixtureId(input.weightMeasurementId); await execute(`insert into public.animal_weight_measurements (id,organization_id,animal_id,measured_at,grams,measurement_kind,source_birth_id,created_by) values (${quote(weightMeasurementId)}::uuid,${quote(input.organizationId)}::uuid,${quote(puppyId)}::uuid,${quote(input.occurredAt)}::timestamptz,${input.weightGrams},'birth',${quote(id)}::uuid,${quote(input.ownerId)}::uuid)`); registry.register("animal_weight_measurements", weightMeasurementId); }
  orders.add(input.birthOrder); state(registry).birthOrders.set(input.sessionId, orders); const birth = { id, organizationId: input.organizationId, sessionId: input.sessionId, eventId: input.eventId, puppyId, birthOrder: input.birthOrder, occurredAt: input.occurredAt, weightMeasurementId }; state(registry).births.set(id, birth);
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E birth fixture mutated its input"); return birth;
}

export async function createTestWhelpingTimeline(execute: SqlExecutor, registry: Registry, input: { session: Omit<Parameters<typeof createTestWhelpingSession>[2], "id">; events: readonly ({ at: string; type: "labor_started" | "contractions" | "water_broke" | "placenta" | "nursing" | "vet_called" | "intervention" | "observation" } | { at: string; type: "birth"; sex: "female" | "male" | "unknown"; weightGrams?: number })[] }) {
  const snapshot = structuredClone(input); const ordered = [...input.events].sort((left, right) => utc(left.at) - utc(right.at));
  for (let index = 1; index < ordered.length; index += 1) if (utc(ordered[index - 1]!.at) > utc(ordered[index]!.at)) throw new Error("E2E timeline is not chronological");
  const session = await createTestWhelpingSession(execute, registry, input.session); const events = []; const births = [];
  for (const [index, item] of ordered.entries()) { const event = await createTestWhelpingEvent(execute, registry, { organizationId: session.organizationId, sessionId: session.id, ownerId: input.session.ownerId, sequenceNo: index + 1, occurredAt: item.at, eventType: item.type }); events.push(event); if (item.type === "birth") births.push(await createTestBirthWithPuppy(execute, registry, { organizationId: session.organizationId, sessionId: session.id, ownerId: input.session.ownerId, eventId: event.id, birthOrder: births.length + 1, occurredAt: item.at, sex: item.sex, weightGrams: item.weightGrams })); }
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E timeline mutated its input"); return { session, events, births, puppies: births.map(({ puppyId }) => puppyId), measurements: births.flatMap(({ weightMeasurementId }) => weightMeasurementId ? [weightMeasurementId] : []) };
}

export function registerActualWhelpingCommands(execute: SqlExecutor, registry: Registry, input: { organizationId: string; litterId: string; commandIds: readonly string[]; adjustmentCommandIds?: readonly string[]; adjustments?: readonly { birthId: string; resultingRevisionNo: number }[] }) {
  const ids = [...new Set(input.commandIds)]; const adjustmentIds = [...new Set(input.adjustmentCommandIds ?? [])];
  const register = (table: Parameters<Registry["register"]>[0], id: string | null) => { if (id && !registry.has(table, id)) registry.register(table, id); };
  const discoverCommands = async () => { if (!ids.length) return; const rows = JSON.parse(await execute(`select coalesce(json_agg(json_build_object('id',id,'event_id',event_id,'birth_id',birth_id,'animal_id',animal_id,'weight_measurement_id',weight_measurement_id) order by id),'[]'::json)::text from public.whelping_commands where organization_id=${quote(input.organizationId)}::uuid and litter_id=${quote(input.litterId)}::uuid and client_command_id in (${ids.map((id) => `${quote(id)}::uuid`).join(",")})`)) as { id: string; event_id: string | null; birth_id: string | null; animal_id: string | null; weight_measurement_id: string | null }[]; for (const row of rows) { register("whelping_commands", row.id); register("whelping_events", row.event_id); register("whelping_births", row.birth_id); register("animals", row.animal_id); register("animal_weight_measurements", row.weight_measurement_id); } };
  const adjustmentWhere = [adjustmentIds.length ? `client_command_id in (${adjustmentIds.map((id) => `${quote(id)}::uuid`).join(",")})` : null, ...(input.adjustments ?? []).map(({ birthId, resultingRevisionNo }) => `(birth_id=${quote(birthId)}::uuid and resulting_revision_no=${resultingRevisionNo})`)].filter(Boolean).join(" or ");
  const discoverAdjustments = async () => { if (!adjustmentWhere) return; const rows = JSON.parse(await execute(`select coalesce(json_agg(json_build_object('id',id,'event_id',event_id,'birth_id',birth_id,'animal_id',animal_id,'weight_measurement_id',weight_measurement_id) order by id),'[]'::json)::text from public.whelping_birth_adjustment_commands where organization_id=${quote(input.organizationId)}::uuid and litter_id=${quote(input.litterId)}::uuid and (${adjustmentWhere})`)) as { id: string; event_id: string; birth_id: string; animal_id: string; weight_measurement_id: string | null }[]; for (const row of rows) { register("whelping_birth_adjustment_commands", row.id); register("whelping_events", row.event_id); register("whelping_births", row.birth_id); register("animals", row.animal_id); register("animal_weight_measurements", row.weight_measurement_id); } };
  return Promise.all([discoverCommands(), discoverAdjustments()]);
}

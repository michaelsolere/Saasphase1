import { expect, test } from "@playwright/test";

import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
import { createTestPuppy, createTestWeighingSeries, createTestWeighingSession, createTestWeightMeasurement } from "./helpers/fixtures/weighing-fixtures";

const ids = { organizationId: "11111111-1111-4111-8111-111111111111", ownerId: "22222222-2222-4222-8222-222222222222", litterId: "33333333-3333-4333-8333-333333333333", puppyOne: "44444444-4444-4444-8444-444444444444", puppyTwo: "55555555-5555-4555-8555-555555555555", session: "66666666-6666-4666-8666-666666666666", measurement: "77777777-7777-4777-8777-777777777777" };

test("constructeurs de pesée enregistrent les lignes, préservent les IDs et ne mutent pas les entrées", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry((sql) => { calls.push(sql); return "0"; }, "fixture");
  const puppyInput = { id: ids.puppyOne, organizationId: ids.organizationId, litterId: ids.litterId, ownerId: ids.ownerId, birthOrder: 1 };
  const snapshot = structuredClone(puppyInput);
  const puppy = await createTestPuppy((sql) => { calls.push(sql); return ""; }, registry, puppyInput);
  const session = await createTestWeighingSession((sql) => { calls.push(sql); return ""; }, registry, { id: ids.session, organizationId: ids.organizationId, litterId: ids.litterId, ownerId: ids.ownerId, measuredAt: "2026-08-01T08:00:00.000Z" });
  const measurement = await createTestWeightMeasurement((sql) => { calls.push(sql); return ""; }, registry, { id: ids.measurement, organizationId: ids.organizationId, ownerId: ids.ownerId, puppyId: puppy.id, sessionId: session.id, grams: 420 });
  expect(puppy.id).toBe(ids.puppyOne); expect(measurement.id).toBe(ids.measurement); expect(puppyInput).toEqual(snapshot);
  expect(calls.join("\n")).toContain("Europe/Paris");
  expect(await registry.counts()).toMatchObject({ animals: 0, litter_weighing_sessions: 0, animal_weight_measurements: 0 });
});

test("série déterministe réutilise les séances et rejette les poids et relations invalides", async () => {
  const calls: string[] = [];
  const execute = (sql: string) => { calls.push(sql); return ""; };
  const registry = createE2eFixtureRegistry(() => "0", "fixture");
  const first = await createTestPuppy(execute, registry, { id: ids.puppyOne, organizationId: ids.organizationId, litterId: ids.litterId, ownerId: ids.ownerId });
  const second = await createTestPuppy(execute, registry, { id: ids.puppyTwo, organizationId: ids.organizationId, litterId: ids.litterId, ownerId: ids.ownerId });
  const values = [{ day: "2026-08-03", weightGrams: 490 }, { day: "2026-08-01", weightGrams: 420 }, { day: "2026-08-02", weightGrams: 455 }];
  const snapshot = structuredClone(values);
  const series = await createTestWeighingSeries(execute, registry, { puppyId: first.id, ownerId: ids.ownerId, values });
  const reused = await createTestWeighingSeries(execute, registry, { puppyId: second.id, ownerId: ids.ownerId, values });
  expect(series.measurements.map(({ grams }) => grams)).toEqual([420, 455, 490]); expect(reused.sessions.map(({ id }) => id)).toEqual(series.sessions.map(({ id }) => id)); expect(values).toEqual(snapshot);
  await expect(createTestWeightMeasurement(execute, registry, { organizationId: ids.organizationId, ownerId: ids.ownerId, puppyId: first.id, sessionId: series.sessions[0]!.id, grams: 0 })).rejects.toThrow(/between/);
  const other = await createTestPuppy(execute, registry, { organizationId: ids.organizationId, litterId: "88888888-8888-4888-8888-888888888888", ownerId: ids.ownerId });
  await expect(createTestWeightMeasurement(execute, registry, { organizationId: ids.organizationId, ownerId: ids.ownerId, puppyId: other.id, sessionId: series.sessions[0]!.id, grams: 450 })).rejects.toThrow(/does not belong/);
});

test("assertEmpty signale un reliquat de mesure", async () => {
  const registry = createE2eFixtureRegistry((sql) => sql.includes("animal_weight_measurements") ? "1" : "0", "fixture");
  registry.register("animal_weight_measurements", ids.measurement);
  await expect(registry.assertEmpty()).rejects.toThrow("animal_weight_measurements=1");
});

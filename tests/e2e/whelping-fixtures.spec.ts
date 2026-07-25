import { expect, test } from "@playwright/test";

import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
import { createTestBirthWithPuppy, createTestWhelpingEvent, createTestWhelpingSession, createTestWhelpingTimeline } from "./helpers/fixtures/whelping-fixtures";

const ids = { org: "11111111-1111-4111-8111-111111111111", owner: "22222222-2222-4222-8222-222222222222", litter: "33333333-3333-4333-8333-333333333333", mother: "44444444-4444-8444-8444-444444444444", session: "55555555-5555-4555-8555-555555555555", event: "66666666-6666-4666-8666-666666666666", birth: "77777777-7777-4777-8777-777777777777", puppy: "88888888-8888-4888-8888-888888888888", weight: "99999999-9999-4999-8999-999999999999" };

test("constructeurs de mise-bas préservent les IDs, relations et fuseau", async () => {
  const sql: string[] = []; const registry = createE2eFixtureRegistry(() => "0", "fixture");
  const sessionInput = { id: ids.session, organizationId: ids.org, litterId: ids.litter, motherId: ids.mother, ownerId: ids.owner, startedAt: "2026-08-20T01:10:00+02:00" }; const snapshot = structuredClone(sessionInput);
  const session = await createTestWhelpingSession((statement) => { sql.push(statement); return ""; }, registry, sessionInput);
  const event = await createTestWhelpingEvent((statement) => { sql.push(statement); return ""; }, registry, { id: ids.event, organizationId: ids.org, sessionId: session.id, ownerId: ids.owner, sequenceNo: 1, occurredAt: "2026-08-20T01:42:00+02:00", eventType: "birth" });
  const birth = await createTestBirthWithPuppy((statement) => { sql.push(statement); return ""; }, registry, { id: ids.birth, puppyId: ids.puppy, weightMeasurementId: ids.weight, organizationId: ids.org, sessionId: session.id, ownerId: ids.owner, eventId: event.id, birthOrder: 1, occurredAt: "2026-08-20T01:42:00+02:00", sex: "female", weightGrams: 420 });
  expect(session.id).toBe(ids.session); expect(birth.puppyId).toBe(ids.puppy); expect(sessionInput).toEqual(snapshot); expect(sql.join("\n")).toContain("Europe/Paris"); expect(sql.join("\n")).toContain("420");
});

test("timeline déterministe refuse les poids, ordres et organisations incohérents", async () => {
  const registry = createE2eFixtureRegistry(() => "0", "fixture"); const events = [{ at: "2026-08-20T02:18:00+02:00", type: "birth" as const, sex: "male" as const, weightGrams: 455 }, { at: "2026-08-20T01:10:00+02:00", type: "labor_started" as const }, { at: "2026-08-20T01:42:00+02:00", type: "birth" as const, sex: "female" as const, weightGrams: 420 }]; const snapshot = structuredClone(events);
  const timeline = await createTestWhelpingTimeline(() => "", registry, { session: { organizationId: ids.org, litterId: ids.litter, motherId: ids.mother, ownerId: ids.owner, startedAt: "2026-08-20T01:00:00+02:00" }, events });
  expect(timeline.births.map(({ birthOrder }) => birthOrder)).toEqual([1, 2]); expect(timeline.births.map(({ occurredAt }) => occurredAt)).toEqual(["2026-08-20T01:42:00+02:00", "2026-08-20T02:18:00+02:00"]); expect(events).toEqual(snapshot);
  const invalid = { organizationId: ids.org, sessionId: timeline.session.id, ownerId: ids.owner, eventId: ids.event, occurredAt: "2026-08-20T02:20:00+02:00", sex: "female" as const };
  await expect(createTestBirthWithPuppy(() => "", registry, { ...invalid, birthOrder: 0 })).rejects.toThrow(/positive/);
  await expect(createTestBirthWithPuppy(() => "", registry, { ...invalid, birthOrder: 1 })).rejects.toThrow(/duplicated/);
  await expect(createTestBirthWithPuppy(() => "", registry, { ...invalid, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", birthOrder: 3 })).rejects.toThrow(/another organization/);
  await expect(createTestBirthWithPuppy(() => "", registry, { ...invalid, birthOrder: 3, weightGrams: 0 })).rejects.toThrow(/between/);
});

test("le cleanup est idempotent et signale les reliquats de naissance", async () => {
  const registry = createE2eFixtureRegistry((statement) => statement.includes("whelping_births") ? "1" : "0", "fixture"); registry.register("whelping_births", ids.birth); await expect(registry.assertEmpty()).rejects.toThrow("whelping_births=1"); await registry.cleanup(); await registry.cleanup();
});

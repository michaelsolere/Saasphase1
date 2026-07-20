import { expect, test } from "@playwright/test";

import {
  buildLitterWeighingScheduleFromHistory,
  type BuildLitterWeighingScheduleFromHistoryInput,
  type LitterWeighingScheduleHistorySession,
} from "../../src/features/litter-weights/litter-weighing-schedule-history-adapter";
import type { LitterWeighingScheduleResult } from "../../src/features/litter-weights/litter-weighing-schedule-model";

const POLICY = {
  phases: [{ startAgeDay: 0, endAgeDay: 5, intervalDays: 1 }],
} as const;

function session(
  internalId: string,
  measuredAt: string,
  timezoneName: string,
  overrides: Partial<LitterWeighingScheduleHistorySession> = {},
): LitterWeighingScheduleHistorySession {
  return {
    internalId,
    measuredAt,
    timezoneName,
    createdAt: measuredAt,
    routineMeasurementCount: 1,
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildLitterWeighingScheduleFromHistoryInput> = {},
): BuildLitterWeighingScheduleFromHistoryInput {
  return {
    actualBirthDate: "2026-03-28",
    request: { todayDate: "2026-03-30", policy: POLICY },
    hasBirthMeasurement: false,
    sessions: [],
    ...overrides,
  };
}

function schedule(
  value: BuildLitterWeighingScheduleFromHistoryInput,
): Extract<LitterWeighingScheduleResult, { status: "available" }> {
  const adapted = buildLitterWeighingScheduleFromHistory(value);
  expect(adapted.outcome).toBe("success");
  if (adapted.outcome !== "success") throw new Error("Expected success");
  expect(adapted.weighingSchedule.status).toBe("available");
  if (adapted.weighingSchedule.status !== "available") {
    throw new Error(`Expected available, got ${adapted.weighingSchedule.status}`);
  }
  return adapted.weighingSchedule;
}

function observations(result: Extract<LitterWeighingScheduleResult, { status: "available" }>) {
  return [
    ...result.schedule.flatMap((item) => item.observations),
    ...result.extraObservations,
  ].sort((left, right) => left.observationIndex - right.observationIndex);
}

test("convertit strictement les instants vers le jour civil du fuseau stocké", () => {
  const cases = [
    ["Europe/Paris", "2026-03-28T23:30:00.000Z", "2026-03-29"],
    ["America/New_York", "2026-03-29T02:30:00.000Z", "2026-03-28"],
    ["Pacific/Auckland", "2026-03-29T11:30:00.000Z", "2026-03-30"],
    ["Europe/Paris", "2026-10-25T01:30:00.000Z", "2026-10-25"],
  ] as const;

  for (const [timezoneName, measuredAt, observedOn] of cases) {
    const result = schedule(
      input({
        actualBirthDate: "2026-03-01",
        request: {
          todayDate: "2026-03-01",
          policy: { phases: [{ startAgeDay: 0, endAgeDay: 0, intervalDays: 1 }] },
        },
        sessions: [session("session-a", measuredAt, timezoneName)],
      }),
    );
    expect(observations(result)).toMatchObject([
      { observationIndex: 0, observedOn, source: "routine" },
    ]);
  }
});

test("exclut les séances vides et conserve chaque séance non vide, même partielle ou le même jour", () => {
  const result = schedule(
    input({
      hasBirthMeasurement: true,
      sessions: [
        session("empty", "2026-03-28T08:00:00.000Z", "Europe/Paris", {
          routineMeasurementCount: 0,
        }),
        session("collective", "2026-03-29T08:00:00.000Z", "Europe/Paris", {
          routineMeasurementCount: 3,
        }),
        session("partial", "2026-03-29T12:00:00.000Z", "Europe/Paris", {
          routineMeasurementCount: 1,
        }),
      ],
    }),
  );

  expect(observations(result)).toEqual([
    { observationIndex: 0, observedOn: "2026-03-28", source: "birth" },
    { observationIndex: 1, observedOn: "2026-03-29", source: "routine" },
    { observationIndex: 2, observedOn: "2026-03-29", source: "routine" },
  ]);
  expect(result.schedule.filter(({ status }) => status === "completed")).toHaveLength(2);
  expect(result.schedule.find(({ ageDay }) => ageDay === 1)?.observations).toHaveLength(2);
});

test("trie sur une copie par instant, création puis identifiant sans muter les entrées", () => {
  const sessions = [
    session("z", "2026-03-30T08:00:00.000Z", "Europe/Paris"),
    session("b", "2026-03-29T12:30:00.000Z", "America/New_York", {
      createdAt: "2026-03-29T07:00:01.000Z",
    }),
    session("a", "2026-03-29T12:30:00.000Z", "Pacific/Auckland", {
      createdAt: "2026-03-29T07:00:01.000Z",
    }),
    session("c", "2026-03-29T12:30:00.000Z", "Europe/Paris", {
      createdAt: "2026-03-29T07:00:00.000Z",
    }),
  ];
  const before = structuredClone(sessions);
  const forward = observations(schedule(input({ sessions })));
  const reverse = observations(schedule(input({ sessions: [...sessions].reverse() })));

  expect(forward).toEqual(reverse);
  expect(forward.map(({ observedOn }) => observedOn)).toEqual([
    "2026-03-29",
    "2026-03-30",
    "2026-03-29",
    "2026-03-30",
  ]);
  expect(sessions).toEqual(before);
});

test("crée au plus une observation de naissance seulement à partir d’une mesure réelle", () => {
  const withSeveralPersistedWeights = schedule(
    input({ hasBirthMeasurement: true }),
  );
  expect(observations(withSeveralPersistedWeights)).toEqual([
    { observationIndex: 0, observedOn: "2026-03-28", source: "birth" },
  ]);
  expect(observations(schedule(input({ hasBirthMeasurement: false })))).toEqual([]);

  const missingDate = buildLitterWeighingScheduleFromHistory(
    input({ actualBirthDate: null, hasBirthMeasurement: true }),
  );
  expect(missingDate).toEqual({
    outcome: "success",
    weighingSchedule: {
      status: "missing_actual_birth_date",
      schedule: [],
      extraObservations: [],
    },
  });
});

test("distingue les timestamps et fuseaux persistés invalides", () => {
  for (const invalidSession of [
    session("bad-timestamp", "not-a-timestamp", "Europe/Paris"),
    session("bad-created-at", "2026-03-29T08:00:00.000Z", "Europe/Paris", {
      createdAt: "not-a-timestamp",
    }),
    session("bad-timezone", "2026-03-29T08:00:00.000Z", "Mars/Olympus"),
  ]) {
    expect(
      buildLitterWeighingScheduleFromHistory(input({ sessions: [invalidSession] })),
    ).toEqual({ outcome: "invalid_persisted_history" });
  }
});

test("ne dépend ni du fuseau du processus ni de Date.now et ne divulgue aucun UUID", () => {
  const originalTimezone = process.env.TZ;
  const originalDateNow = Date.now;
  const results: string[] = [];
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  try {
    Date.now = () => {
      throw new Error("Date.now must not be read");
    };
    for (const timezone of ["Europe/Paris", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      results.push(JSON.stringify(buildLitterWeighingScheduleFromHistory(
        input({
          sessions: [
            session(uuid, "2026-03-28T23:30:00.000Z", "Europe/Paris"),
          ],
        }),
      )));
    }
  } finally {
    Date.now = originalDateNow;
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }

  expect(new Set(results).size).toBe(1);
  expect(results[0]).not.toContain(uuid);
  expect(results[0]).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
});

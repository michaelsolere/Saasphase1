import { expect, test } from "@playwright/test";

import { buildLitterWeighingScheduleFromHistory } from "@/features/litter-weights/litter-weighing-schedule-history-adapter";
import {
  DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
  type LitterWeighingSchedulePolicy,
} from "@/features/litter-weights/litter-weighing-schedule-model";
import {
  projectLitterWeighingToday,
  type LitterWeighingTodaySession,
} from "@/features/litter-weights/litter-weighing-today";

const litterId = "d7290004-0000-4000-8000-000000000001";
const sessionId = "d7290004-0000-4000-8000-000000000101";
const measurementId = "d7290004-0000-4000-8000-000000000201";
const commandId = "d7290004-0000-4000-8000-000000000301";

function schedule({
  actualBirthDate = "2026-07-10",
  todayDate = "2026-07-12",
  sessions = [],
  policy = DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
}: {
  actualBirthDate?: string;
  todayDate?: string;
  sessions?: readonly LitterWeighingTodaySession[];
  policy?: LitterWeighingSchedulePolicy;
} = {}) {
  const result = buildLitterWeighingScheduleFromHistory({
    actualBirthDate,
    request: { todayDate, policy },
    hasBirthMeasurement: false,
    sessions: sessions
      .filter(({ cancelledAt }) => cancelledAt == null)
      .map((session, index) => ({
        internalId: `${sessionId.slice(0, -3)}${String(index + 1).padStart(3, "0")}`,
        measuredAt: session.measuredAt,
        timezoneName: session.timezoneName,
        createdAt: session.measuredAt,
        routineMeasurementCount: session.activeRoutineMeasurementCount,
      })),
  });
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Unexpected invalid history");
  return result.weighingSchedule;
}

function project({
  actualBirthDate = "2026-07-10",
  todayDate = "2026-07-12",
  sessions = [],
  policy,
}: {
  actualBirthDate?: string;
  todayDate?: string;
  sessions?: readonly LitterWeighingTodaySession[];
  policy?: LitterWeighingSchedulePolicy;
} = {}) {
  return projectLitterWeighingToday({
    todayDate,
    litterId,
    litterLabel: "Rosie × Rimbaud",
    weighingSchedule: schedule({
      actualBirthDate,
      todayDate,
      sessions,
      policy,
    }),
    sessions,
  });
}

test("projette une échéance à faire aujourd’hui", () => {
  const due = project().find(({ state }) => state === "due_today");
  expect(due).toMatchObject({
    litterId,
    litterLabel: "Rosie × Rimbaud",
    state: "due_today",
    scheduledOn: "2026-07-12",
    ageDay: 2,
  });
});

test("agrège plusieurs échéances en retard en une seule carte", () => {
  const overdue = project({
    actualBirthDate: "2026-07-10",
    todayDate: "2026-07-13",
  }).filter(({ state }) => state === "overdue");
  expect(overdue).toHaveLength(1);
  expect(overdue[0]).toMatchObject({
    scheduledOn: "2026-07-10",
    ageDay: 0,
    overdueCount: 3,
  });
});

test("reconnaît une séance partielle contenant une mesure active", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 1,
    },
  ];
  const result = project({ sessions });
  expect(result.find(({ state }) => state === "due_today")).toBeUndefined();
  expect(result.find(({ state }) => state === "handled_today")).toMatchObject({
    sessionCount: 1,
    measurementCount: 1,
    scheduledOn: "2026-07-12",
    ageDay: 2,
  });
});

test("agrège plusieurs séances du même jour civil", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T06:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 2,
    },
    {
      measuredAt: "2026-07-12T19:30:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 3,
    },
  ];
  const handled = project({ sessions }).find(
    ({ state }) => state === "handled_today",
  );
  expect(handled).toMatchObject({
    sessionCount: 2,
    measurementCount: 5,
    latestMeasuredAt: "2026-07-12T19:30:00.000Z",
    latestTimezoneName: "Europe/Paris",
  });
});

test("identifie une séance supplémentaire un jour non programmé", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 1,
    },
  ];
  const handled = project({
    actualBirthDate: "2026-06-10",
    todayDate: "2026-07-12",
    sessions,
    policy: {
      phases: [{ startAgeDay: 31, endAgeDay: 60, intervalDays: 3 }],
    },
  }).find(({ state }) => state === "handled_today");
  expect(handled).toMatchObject({
    scheduledOn: null,
    ageDay: null,
    sessionCount: 1,
    measurementCount: 1,
  });
});

test("ignore une séance sans mesure active", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 0,
    },
  ];
  const result = project({ sessions });
  expect(result.some(({ state }) => state === "handled_today")).toBe(false);
  expect(result.some(({ state }) => state === "due_today")).toBe(true);
});

test("ignore une séance annulée", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 2,
      cancelledAt: "2026-07-12T09:00:00.000Z",
    },
  ];
  const result = project({ sessions });
  expect(result.some(({ state }) => state === "handled_today")).toBe(false);
  expect(result.some(({ state }) => state === "due_today")).toBe(true);
});

test("exclut les mesures annulées du compteur actif", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 1,
    },
  ];
  const handled = project({ sessions }).find(
    ({ state }) => state === "handled_today",
  );
  expect(handled?.measurementCount).toBe(1);
});

test("ne modifie aucune donnée source", () => {
  const sessions = [
    {
      measuredAt: "2026-07-12T08:00:00.000Z",
      timezoneName: "Europe/Paris",
      activeRoutineMeasurementCount: 1,
    },
  ] satisfies LitterWeighingTodaySession[];
  const weighingSchedule = schedule({ sessions });
  const source = {
    todayDate: "2026-07-12",
    litterId,
    litterLabel: "Rosie × Rimbaud",
    weighingSchedule,
    sessions,
  };
  const snapshot = structuredClone(source);
  projectLitterWeighingToday(source);
  expect(source).toEqual(snapshot);
});

test("n’expose aucun identifiant de séance, mesure ou commande", () => {
  const result = project({
    sessions: [
      {
        measuredAt: "2026-07-12T08:00:00.000Z",
        timezoneName: "Europe/Paris",
        activeRoutineMeasurementCount: 1,
      },
    ],
  });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(sessionId);
  expect(serialized).not.toContain(measurementId);
  expect(serialized).not.toContain(commandId);
  for (const item of result) {
    expect(Object.keys(item)).not.toEqual(
      expect.arrayContaining([
        "sessionId",
        "measurementId",
        "commandId",
        "sessionIds",
        "measurementIds",
        "commandIds",
      ]),
    );
  }
});

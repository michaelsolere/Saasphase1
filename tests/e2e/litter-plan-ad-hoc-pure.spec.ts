import { expect, test } from "@playwright/test";

import {
  countLitterPlanAdHocOccurrences,
  litterPlanAdHocInitialHorizonDays,
  mapCreateLitterPlanAdHocItemRpcResult,
  normalizeLitterPlanAdHocItemPayload,
  normalizeLitterPlanAdHocTimeSlots,
} from "../../src/features/litter-journal/litter-plan-ad-hoc";

function baseMilestone(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "milestone",
    title: "Pesée de contrôle",
    description: null,
    category: "offspring_weight",
    targetScope: "litter",
    priority: "normal",
    lockSchedule: false,
    scheduledDate: "2026-08-05",
    localTime: "08:00",
    ...overrides,
  };
}

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    ...baseMilestone(overrides),
    kind: "task",
    ...overrides,
  };
}

function baseWindow(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "window",
    title: "Fenêtre de socialisation",
    description: "Détails",
    category: "socialization",
    targetScope: "all_offspring",
    priority: "important",
    lockSchedule: true,
    startsOn: "2026-08-05",
    endsOn: "2026-08-10",
    startsLocalTime: "08:00",
    endsLocalTime: "18:00",
    ...overrides,
  };
}

function baseRecurringEndDate(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "recurring_task",
    title: "Prise de température",
    description: null,
    category: "maternal_health",
    targetScope: "mother",
    priority: "organization_critical",
    lockSchedule: false,
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_end_date",
    endsOn: "2026-08-10",
    recurrenceDayCount: null,
    timeSlots: ["08:00", "20:00"],
    ...overrides,
  };
}

function baseRecurringDayCount(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "recurring_task",
    title: "Prise de température",
    description: null,
    category: "maternal_health",
    targetScope: "mother",
    priority: "normal",
    lockSchedule: false,
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 10,
    timeSlots: ["08:00"],
    ...overrides,
  };
}

test("accepts a strictly valid payload for each of the four kinds", () => {
  expect(normalizeLitterPlanAdHocItemPayload(baseMilestone())).toMatchObject({
    kind: "milestone",
    scheduledDate: "2026-08-05",
    localTime: "08:00:00",
  });
  expect(normalizeLitterPlanAdHocItemPayload(baseTask())).toMatchObject({
    kind: "task",
  });
  expect(normalizeLitterPlanAdHocItemPayload(baseWindow())).toMatchObject({
    kind: "window",
    startsOn: "2026-08-05",
    endsOn: "2026-08-10",
    startsLocalTime: "08:00:00",
    endsLocalTime: "18:00:00",
  });
  expect(
    normalizeLitterPlanAdHocItemPayload(baseRecurringEndDate()),
  ).toMatchObject({
    kind: "recurring_task",
    endKind: "fixed_end_date",
    timeSlots: ["08:00:00", "20:00:00"],
  });
  expect(
    normalizeLitterPlanAdHocItemPayload(baseRecurringDayCount()),
  ).toMatchObject({
    kind: "recurring_task",
    endKind: "fixed_recurrence_day_count",
    recurrenceDayCount: 10,
  });
});

test("rejects unknown keys for every kind", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseMilestone({ unexpectedKey: "x" }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(baseWindow({ unexpectedKey: "x" })),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ unexpectedKey: "x" }),
    ),
  ).toBeNull();
});

test("rejects invalid version or kind", () => {
  expect(normalizeLitterPlanAdHocItemPayload(baseMilestone({ version: 2 }))).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(baseMilestone({ kind: "unknown" })),
  ).toBeNull();
  expect(normalizeLitterPlanAdHocItemPayload(null)).toBeNull();
  expect(normalizeLitterPlanAdHocItemPayload(["not", "an", "object"])).toBeNull();
});

test("rejects invalid civil dates", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseMilestone({ scheduledDate: "2026-02-30" }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseMilestone({ scheduledDate: "2026-13-01" }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({ startsOn: "not-a-date" }),
    ),
  ).toBeNull();
});

test("accepts HH:MM and normalizes to HH:MM:SS without mutating input", () => {
  const input = baseMilestone({ localTime: "08:00" });
  const frozenInput = JSON.parse(JSON.stringify(input));
  const result = normalizeLitterPlanAdHocItemPayload(input);
  expect(result?.kind).toBe("milestone");
  expect(
    result && (result.kind === "milestone" || result.kind === "task")
      ? result.localTime
      : null,
  ).toBe("08:00:00");
  expect(input).toEqual(frozenInput);
});

test("enforces window bound order across days", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({ startsOn: "2026-08-10", endsOn: "2026-08-05" }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({ startsOn: "2026-08-05", endsOn: "2026-08-05" }),
    ),
  ).not.toBeNull();
});

test("enforces same-day time order for windows", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({
        startsOn: "2026-08-05",
        endsOn: "2026-08-05",
        startsLocalTime: "18:00",
        endsLocalTime: "08:00",
      }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({
        startsOn: "2026-08-05",
        endsOn: "2026-08-05",
        startsLocalTime: "08:00",
        endsLocalTime: "08:00",
      }),
    ),
  ).not.toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseWindow({
        startsOn: "2026-08-05",
        endsOn: "2026-08-06",
        startsLocalTime: "18:00",
        endsLocalTime: "08:00",
      }),
    ),
  ).not.toBeNull();
});

test("normalizes and sorts distinct time slots, rejecting duplicates and range violations", () => {
  const input = ["20:00", "08:00:00", "14:00"];
  const frozenInput = [...input];
  expect(normalizeLitterPlanAdHocTimeSlots(input)).toEqual([
    "08:00:00",
    "14:00:00",
    "20:00:00",
  ]);
  expect(input).toEqual(frozenInput);

  expect(normalizeLitterPlanAdHocTimeSlots(["08:00", "08:00:00"])).toBeNull();
  expect(normalizeLitterPlanAdHocTimeSlots([])).toBeNull();
  expect(
    normalizeLitterPlanAdHocTimeSlots([
      "01:00",
      "02:00",
      "03:00",
      "04:00",
      "05:00",
      "06:00",
      "07:00",
      "08:00",
      "09:00",
    ]),
  ).toBeNull();
  expect(normalizeLitterPlanAdHocTimeSlots(["25:00"])).toBeNull();
  expect(normalizeLitterPlanAdHocTimeSlots("08:00")).toBeNull();
});

test("enforces recurring interval bounds of 1..365", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ intervalDays: 0 }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ intervalDays: 366 }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ intervalDays: 365 }),
    ),
  ).not.toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ intervalDays: 1 }),
    ),
  ).not.toBeNull();
});

test("enforces recurring end-kind and end-value consistency", () => {
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ endsOn: null }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringEndDate({ recurrenceDayCount: 5 }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringDayCount({ endsOn: "2026-08-10" }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringDayCount({ recurrenceDayCount: 0 }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringDayCount({ recurrenceDayCount: 501 }),
    ),
  ).toBeNull();
  expect(
    normalizeLitterPlanAdHocItemPayload(
      baseRecurringDayCount({ recurrenceDayCount: 500 }),
    ),
  ).not.toBeNull();
});

test("computes occurrence count with a fixed end date", () => {
  expect(
    countLitterPlanAdHocOccurrences({
      intervalDays: 3,
      endKind: "fixed_end_date",
      startsOn: "2026-08-01",
      endsOn: "2026-08-10",
      recurrenceDayCount: null,
      slotCount: 2,
    }),
  ).toBe(8);

  expect(
    countLitterPlanAdHocOccurrences({
      intervalDays: 1,
      endKind: "fixed_end_date",
      startsOn: "2026-08-10",
      endsOn: "2026-08-01",
      recurrenceDayCount: null,
      slotCount: 1,
    }),
  ).toBeNull();
});

test("computes occurrence count with a fixed recurrence day count", () => {
  expect(
    countLitterPlanAdHocOccurrences({
      intervalDays: 1,
      endKind: "fixed_recurrence_day_count",
      startsOn: "2026-08-01",
      endsOn: null,
      recurrenceDayCount: 10,
      slotCount: 2,
    }),
  ).toBe(20);
});

test("refuses occurrence counts above the 500 ceiling", () => {
  expect(
    countLitterPlanAdHocOccurrences({
      intervalDays: 1,
      endKind: "fixed_recurrence_day_count",
      startsOn: "2026-08-01",
      endsOn: null,
      recurrenceDayCount: 100,
      slotCount: 8,
    }),
  ).toBeNull();
  expect(
    countLitterPlanAdHocOccurrences({
      intervalDays: 1,
      endKind: "fixed_end_date",
      startsOn: "2026-08-01",
      endsOn: "2027-08-01",
      recurrenceDayCount: null,
      slotCount: 2,
    }),
  ).toBeNull();
});

test("caps the initial materialization horizon at 30 civil days", () => {
  expect(
    litterPlanAdHocInitialHorizonDays({
      startsOn: "2026-08-01",
      intervalDays: 1,
      endKind: "fixed_end_date",
      endsOn: "2026-08-05",
      recurrenceDayCount: null,
    }),
  ).toBe(5);

  expect(
    litterPlanAdHocInitialHorizonDays({
      startsOn: "2026-08-01",
      intervalDays: 1,
      endKind: "fixed_end_date",
      endsOn: "2027-08-01",
      recurrenceDayCount: null,
    }),
  ).toBe(30);

  expect(
    litterPlanAdHocInitialHorizonDays({
      startsOn: "2026-08-01",
      intervalDays: 3,
      endKind: "fixed_recurrence_day_count",
      endsOn: null,
      recurrenceDayCount: 5,
    }),
  ).toBe(13);

  expect(
    litterPlanAdHocInitialHorizonDays({
      startsOn: "2026-08-10",
      intervalDays: 1,
      endKind: "fixed_end_date",
      endsOn: "2026-08-01",
      recurrenceDayCount: null,
    }),
  ).toBeNull();
});

test("maps a successful RPC row strictly", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "success",
    reason: null,
    litter_plan_id: "a7270001-0000-4000-8000-000000000001",
    plan_revision: 4,
    litter_plan_item_id: "a7270001-0000-4000-8000-000000000002",
    task_id: "a7270001-0000-4000-8000-000000000003",
    series_id: null,
    materialized_occurrence_count: 6,
    replayed: false,
    result: { ok: true },
  });
  expect(result).toEqual({
    outcome: "success",
    litterPlanId: "a7270001-0000-4000-8000-000000000001",
    planRevision: 4,
    litterPlanItemId: "a7270001-0000-4000-8000-000000000002",
    taskId: "a7270001-0000-4000-8000-000000000003",
    seriesId: null,
    materializedOccurrenceCount: 6,
    replayed: false,
    result: { ok: true },
  });
});

test("treats a malformed success row as a database error", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "success",
    reason: null,
    litter_plan_id: "not-a-uuid",
    plan_revision: 4,
    litter_plan_item_id: "a7270001-0000-4000-8000-000000000002",
    task_id: null,
    series_id: null,
    materialized_occurrence_count: 6,
    replayed: false,
    result: null,
  });
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("maps known SQL error reasons to stable error codes", () => {
  const reasonToCode: Array<[string, string]> = [
    ["not_authenticated", "unauthenticated"],
    ["membership_required", "forbidden"],
    ["stale_revision", "stale_revision"],
    ["client_command_conflict", "client_command_conflict"],
    ["invalid_litter", "invalid_litter"],
    ["not_found", "not_found"],
  ];
  for (const [reason, code] of reasonToCode) {
    const result = mapCreateLitterPlanAdHocItemRpcResult({
      outcome: "error",
      reason,
      litter_plan_id: null,
      plan_revision: null,
      litter_plan_item_id: null,
      task_id: null,
      series_id: null,
      materialized_occurrence_count: null,
      replayed: null,
      result: null,
    });
    expect(result).toEqual({
      outcome: "error",
      error: { code, message: expect.any(String) },
    });
  }

  const unknownReason = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "error",
    reason: "some_unlisted_reason",
    litter_plan_id: null,
    plan_revision: null,
    litter_plan_item_id: null,
    task_id: null,
    series_id: null,
    materialized_occurrence_count: null,
    replayed: null,
    result: null,
  });
  expect(unknownReason).toEqual({
    outcome: "error",
    error: { code: "conflict", message: expect.any(String) },
  });

  expect(mapCreateLitterPlanAdHocItemRpcResult(null)).toEqual({
    outcome: "error",
    error: { code: "conflict", message: expect.any(String) },
  });
});

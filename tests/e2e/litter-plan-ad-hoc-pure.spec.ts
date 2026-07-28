import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  countLitterPlanAdHocOccurrences,
  createLitterPlanAdHocItem,
  litterPlanAdHocInitialHorizonDays,
  mapCreateLitterPlanAdHocItemRpcResult,
  normalizeLitterPlanAdHocItemPayload,
  normalizeLitterPlanAdHocTimeSlots,
  normalizeLitterPlanAdHocMetadataPayload,
  mapUpdateLitterPlanAdHocMetadataRpcResult,
} from "../../src/features/litter-journal/litter-plan-ad-hoc";
import type { Database } from "../../src/types/database.types";
import { canEditLitterPlanAdHocMetadata } from "../../src/features/litter-journal/litter-plan-ad-hoc-metadata-eligibility";
import { validateLitterPlanAdHocMetadataForm } from "../../src/features/litter-journal/litter-plan-ad-hoc-metadata-validation";

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

test("normalise strictement les métadonnées ad hoc et refuse les clés supplémentaires", () => {
  expect(normalizeLitterPlanAdHocMetadataPayload({ version: 1, operation: "update_metadata", title: "  Contrôle  ", description: "  Note  ", category: "other", targetScope: "litter", priority: "important" })).toEqual({ version: 1, operation: "update_metadata", title: "Contrôle", description: "Note", category: "other", targetScope: "litter", priority: "important" });
  expect(normalizeLitterPlanAdHocMetadataPayload({ version: 1, operation: "update_metadata", title: "Contrôle", description: null, category: "other", targetScope: "litter", priority: "normal", revision: 1 })).toBeNull();
});

test("mappe strictement le résultat d’édition sans exposer les identifiants", () => {
  expect(mapUpdateLitterPlanAdHocMetadataRpcResult({ outcome: "success", reason: null, litter_plan_id: "11111111-1111-4111-8111-111111111111", litter_plan_item_id: "22222222-2222-4222-8222-222222222222", task_id: "33333333-3333-4333-8333-333333333333", plan_revision: 3, item_revision: 2, task_revision: 1, replayed: false, result: { litterPlanId: "11111111-1111-4111-8111-111111111111", litterPlanItemId: "22222222-2222-4222-8222-222222222222", taskId: "33333333-3333-4333-8333-333333333333", kind: "milestone", planRevision: 3, itemRevision: 2, taskRevision: 1 } })).toMatchObject({ outcome: "success", planRevision: 3, itemRevision: 2, taskRevision: 1 });
  expect(mapUpdateLitterPlanAdHocMetadataRpcResult({ outcome: "success", reason: null, plan_revision: 3, item_revision: 2, task_revision: 1, replayed: false, result: { kind: "recurring_task", itemRevision: 2, taskRevision: 1 } }).outcome).toBe("error");
});

test("applique l’éligibilité stricte de l’édition de métadonnées", () => {
  const base = { role: "member" as const, originKind: "ad_hoc", itemKind: "milestone", materializationState: "materialized", hasModelSource: false, hasSeries: false, taskStatus: "planned", taskSource: "manual", taskKind: "milestone", itemKindMatches: true, projectionsMatch: true };
  expect(canEditLitterPlanAdHocMetadata(base)).toBe(true);
  expect(canEditLitterPlanAdHocMetadata({ ...base, role: "viewer" })).toBe(false);
  expect(canEditLitterPlanAdHocMetadata({ ...base, hasModelSource: true })).toBe(false);
  expect(canEditLitterPlanAdHocMetadata({ ...base, hasSeries: true })).toBe(false);
  expect(canEditLitterPlanAdHocMetadata({ ...base, taskStatus: "done" })).toBe(false);
  expect(canEditLitterPlanAdHocMetadata({ ...base, projectionsMatch: false })).toBe(false);
});

test("associe chaque erreur de métadonnées à son champ", () => {
  const valid = { title: "Contrôle", description: "", category: "other", targetScope: "litter", priority: "normal" };
  expect(validateLitterPlanAdHocMetadataForm({ ...valid, title: " " })).toEqual({ title: expect.any(String) });
  expect(validateLitterPlanAdHocMetadataForm({ ...valid, description: "x".repeat(5001) })).toEqual({ description: expect.any(String) });
  expect(validateLitterPlanAdHocMetadataForm({ ...valid, category: "bad" })).toEqual({ category: expect.any(String) });
  expect(validateLitterPlanAdHocMetadataForm({ ...valid, targetScope: "bad" })).toEqual({ targetScope: expect.any(String) });
  expect(validateLitterPlanAdHocMetadataForm({ ...valid, priority: "bad" })).toEqual({ priority: expect.any(String) });
});

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

  // Duplicates that only become equal after HH:MM → HH:MM:SS normalization
  // must be refused, not silently deduplicated.
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

// ---------------------------------------------------------------------------
// mapCreateLitterPlanAdHocItemRpcResult — strict RPC row mapping
// ---------------------------------------------------------------------------

const PLAN_ID = "a7270001-0000-4000-8000-000000000001";
const ITEM_ID = "a7270001-0000-4000-8000-000000000002";
const TASK_ID = "a7270001-0000-4000-8000-000000000003";
const SERIES_ID = "a7270001-0000-4000-8000-000000000004";
const OTHER_ID = "a7270001-0000-4000-8000-000000000005";

function validSuccessPointRow(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "success",
    reason: null,
    litter_plan_id: PLAN_ID,
    plan_revision: 1,
    litter_plan_item_id: ITEM_ID,
    task_id: TASK_ID,
    series_id: null,
    materialized_occurrence_count: 0,
    replayed: false,
    result: { kind: "task", planItemId: ITEM_ID, taskId: TASK_ID },
    ...overrides,
  };
}

function validSuccessRecurringRow(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "success",
    reason: null,
    litter_plan_id: PLAN_ID,
    plan_revision: 1,
    litter_plan_item_id: ITEM_ID,
    task_id: null,
    series_id: SERIES_ID,
    materialized_occurrence_count: 10,
    replayed: false,
    result: { kind: "recurring_task", planItemId: ITEM_ID, seriesId: SERIES_ID },
    ...overrides,
  };
}

test("maps a successful point RPC row strictly", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(validSuccessPointRow());
  expect(result).toEqual({
    outcome: "success",
    litterPlanId: PLAN_ID,
    planRevision: 1,
    litterPlanItemId: ITEM_ID,
    taskId: TASK_ID,
    seriesId: null,
    materializedOccurrenceCount: 0,
    replayed: false,
    result: { kind: "task", planItemId: ITEM_ID, taskId: TASK_ID },
  });
});

test("maps a successful recurring RPC row strictly", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessRecurringRow(),
  );
  expect(result).toEqual({
    outcome: "success",
    litterPlanId: PLAN_ID,
    planRevision: 1,
    litterPlanItemId: ITEM_ID,
    taskId: null,
    seriesId: SERIES_ID,
    materializedOccurrenceCount: 10,
    replayed: false,
    result: { kind: "recurring_task", planItemId: ITEM_ID, seriesId: SERIES_ID },
  });
});

test("treats a null RPC row as a database error", () => {
  expect(mapCreateLitterPlanAdHocItemRpcResult(null)).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
  expect(mapCreateLitterPlanAdHocItemRpcResult(undefined)).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
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

test("maps known SQL error reasons to stable error codes, including invalid_input", () => {
  const reasonToCode: Array<[string, string]> = [
    ["invalid_input", "invalid_input"],
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
});

test("maps an unexpected outcome value to database_error even with a known reason", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "unexpected",
    reason: "invalid_input",
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
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("maps an empty outcome string to database_error", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "",
    reason: "invalid_input",
    litter_plan_id: null,
    plan_revision: null,
    litter_plan_item_id: null,
    task_id: null,
    series_id: null,
    materialized_occurrence_count: 0,
    replayed: false,
    result: {},
  });
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success row that still carries an error reason", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({ reason: "stale_revision" }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("keeps business error mapping when outcome is exactly error", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "error",
    reason: "invalid_input",
    litter_plan_id: null,
    plan_revision: null,
    litter_plan_item_id: null,
    task_id: null,
    series_id: null,
    materialized_occurrence_count: 0,
    replayed: false,
    result: {},
  });
  expect(result).toEqual({
    outcome: "error",
    error: { code: "invalid_input", message: expect.any(String) },
  });
});

test("accepts a stale_revision error that exposes litter_plan_id and plan_revision", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "error",
    reason: "stale_revision",
    litter_plan_id: PLAN_ID,
    plan_revision: 3,
    litter_plan_item_id: null,
    task_id: null,
    series_id: null,
    materialized_occurrence_count: 0,
    replayed: false,
    result: {},
  });
  expect(result).toEqual({
    outcome: "error",
    error: { code: "stale_revision", message: expect.any(String) },
  });
});

test("rejects an error row that pretends to carry success write fields", () => {
  expect(
    mapCreateLitterPlanAdHocItemRpcResult({
      outcome: "error",
      reason: "invalid_input",
      litter_plan_id: null,
      plan_revision: null,
      litter_plan_item_id: ITEM_ID,
      task_id: null,
      series_id: null,
      materialized_occurrence_count: 0,
      replayed: false,
      result: {},
    }),
  ).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });

  expect(
    mapCreateLitterPlanAdHocItemRpcResult({
      outcome: "error",
      reason: "invalid_input",
      litter_plan_id: null,
      plan_revision: null,
      litter_plan_item_id: null,
      task_id: null,
      series_id: null,
      materialized_occurrence_count: 0,
      replayed: false,
      result: { kind: "task", planItemId: ITEM_ID, taskId: TASK_ID },
    }),
  ).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("maps an unknown or unlisted error reason to database_error, not conflict", () => {
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
    error: { code: "database_error", message: expect.any(String) },
  });

  const nullReason = mapCreateLitterPlanAdHocItemRpcResult({
    outcome: "error",
    reason: null,
    litter_plan_id: null,
    plan_revision: null,
    litter_plan_item_id: null,
    task_id: null,
    series_id: null,
    materialized_occurrence_count: null,
    replayed: null,
    result: null,
  });
  expect(nullReason).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success point row missing a task id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({ task_id: null }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success point row that also carries a series id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({ series_id: SERIES_ID }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success recurring row missing a series id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessRecurringRow({ series_id: null }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success recurring row that also carries a task id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessRecurringRow({ task_id: TASK_ID }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success row whose result.planItemId disagrees with litter_plan_item_id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({
      result: { kind: "task", planItemId: OTHER_ID, taskId: TASK_ID },
    }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success point row whose result.taskId disagrees with task_id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({
      result: { kind: "task", planItemId: ITEM_ID, taskId: OTHER_ID },
    }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success recurring row whose result.seriesId disagrees with series_id", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessRecurringRow({
      result: { kind: "recurring_task", planItemId: ITEM_ID, seriesId: OTHER_ID },
    }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success row whose result is an array or null", () => {
  expect(
    mapCreateLitterPlanAdHocItemRpcResult(validSuccessPointRow({ result: [] })),
  ).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
  expect(
    mapCreateLitterPlanAdHocItemRpcResult(
      validSuccessPointRow({ result: null }),
    ),
  ).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

test("rejects a success row whose replayed flag is not a boolean", () => {
  const result = mapCreateLitterPlanAdHocItemRpcResult(
    validSuccessPointRow({ replayed: null }),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "database_error", message: expect.any(String) },
  });
});

// ---------------------------------------------------------------------------
// createLitterPlanAdHocItem — client-side guard rails before calling the RPC
// ---------------------------------------------------------------------------

function throwingRpcClient() {
  return {
    rpc: async () => {
      throw new Error("rpc must not be called when client-side input is invalid");
    },
  } as unknown as SupabaseClient<Database>;
}

test("rejects an invalid IANA timezone without ever calling the RPC", async () => {
  const result = await createLitterPlanAdHocItem(
    {
      litterId: "a7270001-0000-4000-8000-000000000006",
      clientCommandId: "a7270001-0000-4000-8000-000000000007",
      expectedPlanRevision: null,
      timezoneName: "Not/AZone",
      item: baseMilestone(),
    },
    throwingRpcClient(),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "invalid_input", message: expect.any(String) },
  });
});

test("rejects an empty timezone without ever calling the RPC", async () => {
  const result = await createLitterPlanAdHocItem(
    {
      litterId: "a7270001-0000-4000-8000-000000000006",
      clientCommandId: "a7270001-0000-4000-8000-000000000007",
      expectedPlanRevision: null,
      timezoneName: "",
      item: baseMilestone(),
    },
    throwingRpcClient(),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "invalid_input", message: expect.any(String) },
  });
});

test("rejects an invalid litter id without ever calling the RPC", async () => {
  const result = await createLitterPlanAdHocItem(
    {
      litterId: "not-a-uuid",
      clientCommandId: "a7270001-0000-4000-8000-000000000007",
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: baseMilestone(),
    },
    throwingRpcClient(),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "invalid_input", message: expect.any(String) },
  });
});

test("rejects an invalid payload without ever calling the RPC", async () => {
  const result = await createLitterPlanAdHocItem(
    {
      litterId: "a7270001-0000-4000-8000-000000000006",
      clientCommandId: "a7270001-0000-4000-8000-000000000007",
      expectedPlanRevision: null,
      timezoneName: "Europe/Paris",
      item: baseMilestone({ unexpectedKey: "x" }),
    },
    throwingRpcClient(),
  );
  expect(result).toEqual({
    outcome: "error",
    error: { code: "invalid_input", message: expect.any(String) },
  });
});

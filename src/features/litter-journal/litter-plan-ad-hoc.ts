import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidIanaTimeZone } from "@/lib/timezone";
import type { Database, Json } from "@/types/database.types";

import {
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_PRIORITIES,
  LITTER_CARE_TASK_TARGET_SCOPES,
  type LitterCareTaskCategory,
  type LitterCareTaskPriority,
  type LitterCareTaskTargetScope,
} from "./litter-care-tasks-core";

type Supabase = SupabaseClient<Database>;

export type LitterPlanAdHocErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_litter"
  | "stale_revision"
  | "client_command_conflict"
  | "conflict"
  | "database_error";

export type LitterPlanAdHocResult<TSuccess extends Record<string, unknown>> =
  | ({ outcome: "success" } & TSuccess)
  | { outcome: "error"; error: { code: LitterPlanAdHocErrorCode; message: string } };

type LitterPlanAdHocItemCommon = {
  version: 1;
  title: string;
  description: string | null;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  priority: LitterCareTaskPriority;
  lockSchedule: boolean;
};

export type LitterPlanAdHocPointPayload = LitterPlanAdHocItemCommon & {
  kind: "milestone" | "task";
  scheduledDate: string;
  localTime: string | null;
};

export type LitterPlanAdHocWindowPayload = LitterPlanAdHocItemCommon & {
  kind: "window";
  startsOn: string;
  endsOn: string;
  startsLocalTime: string | null;
  endsLocalTime: string | null;
};

export type LitterPlanAdHocRecurringPayload = LitterPlanAdHocItemCommon & {
  kind: "recurring_task";
  startsOn: string;
  intervalDays: number;
  endKind: "fixed_end_date" | "fixed_recurrence_day_count";
  endsOn: string | null;
  recurrenceDayCount: number | null;
  timeSlots: string[];
};

export type LitterPlanAdHocItemPayload =
  | LitterPlanAdHocPointPayload
  | LitterPlanAdHocWindowPayload
  | LitterPlanAdHocRecurringPayload;

export type CreateLitterPlanAdHocItemInput = {
  litterId: string;
  clientCommandId: string;
  expectedPlanRevision?: number | null;
  timezoneName: string;
  item: unknown;
};

export type CreateLitterPlanAdHocItemResult = LitterPlanAdHocResult<{
  litterPlanId: string;
  planRevision: number;
  litterPlanItemId: string;
  taskId: string | null;
  seriesId: string | null;
  materializedOccurrenceCount: number;
  replayed: boolean;
  result: Json;
}>;

type CreateLitterPlanAdHocItemRpcRow = {
  outcome: string;
  reason: string | null;
  litter_plan_id: string | null;
  plan_revision: number | null;
  litter_plan_item_id: string | null;
  task_id: string | null;
  series_id: string | null;
  materialized_occurrence_count: number | null;
  replayed: boolean | null;
  result: Json;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const uuid = (value: unknown) =>
  typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;

const timezone = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255 &&
  isValidIanaTimeZone(value)
    ? value
    : null;

function error(code: LitterPlanAdHocErrorCode): {
  outcome: "error";
  error: { code: LitterPlanAdHocErrorCode; message: string };
} {
  return {
    outcome: "error",
    error: { code, message: "Cet élément de planning n’a pas pu être créé." },
  };
}

function reasonCode(reason: string | null): LitterPlanAdHocErrorCode {
  switch (reason) {
    case "invalid_input":
      return "invalid_input";
    case "not_authenticated":
      return "unauthenticated";
    case "membership_required":
      return "forbidden";
    case "invalid_litter":
      return "invalid_litter";
    case "not_found":
      return "not_found";
    case "stale_revision":
      return "stale_revision";
    case "client_command_conflict":
      return "client_command_conflict";
    default:
      return "database_error";
  }
}

function isPlainJsonObject(
  value: Json | null | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultString(
  result: { [key: string]: Json | undefined },
  key: string,
): string | null {
  const value = result[key];
  return typeof value === "string" ? value : null;
}

function normalizeCivilDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function civilDayDiff(startsOn: string, endsOn: string): number | null {
  const start = normalizeCivilDate(startsOn);
  const end = normalizeCivilDate(endsOn);
  if (!start || !end) return null;
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startMs = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((endMs - startMs) / 86_400_000);
}

function normalizeRequiredLocalTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = TIME.exec(value.trim());
  return match ? `${match[1]}:${match[2]}:${match[3] ?? "00"}` : null;
}

function normalizeNullableLocalTime(value: unknown): string | null | undefined {
  if (value === null) return null;
  const normalized = normalizeRequiredLocalTime(value);
  return normalized ?? undefined;
}

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : null;
}

function normalizeDescription(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 5000) return undefined;
  return trimmed.length > 0 ? trimmed : null;
}

function isCategory(value: unknown): value is LitterCareTaskCategory {
  return (
    typeof value === "string" &&
    LITTER_CARE_TASK_CATEGORIES.includes(value as LitterCareTaskCategory)
  );
}

function isTargetScope(value: unknown): value is LitterCareTaskTargetScope {
  return (
    typeof value === "string" &&
    LITTER_CARE_TASK_TARGET_SCOPES.includes(value as LitterCareTaskTargetScope)
  );
}

function isPriority(value: unknown): value is LitterCareTaskPriority {
  return (
    typeof value === "string" &&
    LITTER_CARE_TASK_PRIORITIES.includes(value as LitterCareTaskPriority)
  );
}

const COMMON_KEYS = [
  "version",
  "kind",
  "title",
  "description",
  "category",
  "targetScope",
  "priority",
  "lockSchedule",
];
const POINT_KEYS = [...COMMON_KEYS, "scheduledDate", "localTime"];
const WINDOW_KEYS = [
  ...COMMON_KEYS,
  "startsOn",
  "endsOn",
  "startsLocalTime",
  "endsLocalTime",
];
const RECURRING_KEYS = [
  ...COMMON_KEYS,
  "startsOn",
  "intervalDays",
  "endKind",
  "endsOn",
  "recurrenceDayCount",
  "timeSlots",
];

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(record).length === keys.length &&
    keys.every((key) => key in record)
  );
}

/** Normalizes HH:MM/HH:MM:SS slots, sorted ascending, rejecting duplicates and out-of-range counts. */
export function normalizeLitterPlanAdHocTimeSlots(
  slots: unknown,
): string[] | null {
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 8) {
    return null;
  }
  const normalized: string[] = [];
  for (const slot of slots) {
    const time = normalizeRequiredLocalTime(slot);
    if (!time) return null;
    normalized.push(time);
  }
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) return null;
  return [...normalized].sort();
}

/** Strict, non-mutating normalization of a versioned ad-hoc plan item payload. */
export function normalizeLitterPlanAdHocItemPayload(
  input: unknown,
): LitterPlanAdHocItemPayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;

  if (record.version !== 1) return null;
  if (
    record.kind !== "milestone" &&
    record.kind !== "task" &&
    record.kind !== "window" &&
    record.kind !== "recurring_task"
  ) {
    return null;
  }

  const title = normalizeTitle(record.title);
  const description = normalizeDescription(record.description);
  const category = isCategory(record.category) ? record.category : null;
  const targetScope = isTargetScope(record.targetScope)
    ? record.targetScope
    : null;
  const priority = isPriority(record.priority) ? record.priority : null;
  const lockSchedule = record.lockSchedule;

  if (
    !title ||
    description === undefined ||
    !category ||
    !targetScope ||
    !priority ||
    typeof lockSchedule !== "boolean"
  ) {
    return null;
  }

  const common: LitterPlanAdHocItemCommon = {
    version: 1,
    title,
    description,
    category,
    targetScope,
    priority,
    lockSchedule,
  };

  if (record.kind === "milestone" || record.kind === "task") {
    if (!hasExactKeys(record, POINT_KEYS)) return null;
    const scheduledDate = normalizeCivilDate(record.scheduledDate);
    const localTime = normalizeNullableLocalTime(record.localTime);
    if (!scheduledDate || localTime === undefined) return null;
    return { ...common, kind: record.kind, scheduledDate, localTime };
  }

  if (record.kind === "window") {
    if (!hasExactKeys(record, WINDOW_KEYS)) return null;
    const startsOn = normalizeCivilDate(record.startsOn);
    const endsOn = normalizeCivilDate(record.endsOn);
    const startsLocalTime = normalizeNullableLocalTime(record.startsLocalTime);
    const endsLocalTime = normalizeNullableLocalTime(record.endsLocalTime);
    if (
      !startsOn ||
      !endsOn ||
      startsOn > endsOn ||
      startsLocalTime === undefined ||
      endsLocalTime === undefined ||
      (startsOn === endsOn &&
        startsLocalTime !== null &&
        endsLocalTime !== null &&
        startsLocalTime > endsLocalTime)
    ) {
      return null;
    }
    return {
      ...common,
      kind: "window",
      startsOn,
      endsOn,
      startsLocalTime,
      endsLocalTime,
    };
  }

  if (!hasExactKeys(record, RECURRING_KEYS)) return null;
  const startsOn = normalizeCivilDate(record.startsOn);
  const intervalDays = record.intervalDays;
  const endKind = record.endKind;
  if (
    !startsOn ||
    typeof intervalDays !== "number" ||
    !Number.isInteger(intervalDays) ||
    intervalDays < 1 ||
    intervalDays > 365 ||
    (endKind !== "fixed_end_date" && endKind !== "fixed_recurrence_day_count")
  ) {
    return null;
  }

  let endsOn: string | null = null;
  let recurrenceDayCount: number | null = null;
  if (endKind === "fixed_end_date") {
    if (record.recurrenceDayCount !== null) return null;
    endsOn = normalizeCivilDate(record.endsOn);
    if (!endsOn || endsOn < startsOn) return null;
  } else {
    if (record.endsOn !== null) return null;
    const dayCount = record.recurrenceDayCount;
    if (
      typeof dayCount !== "number" ||
      !Number.isInteger(dayCount) ||
      dayCount < 1 ||
      dayCount > 500
    ) {
      return null;
    }
    recurrenceDayCount = dayCount;
  }

  const timeSlots = normalizeLitterPlanAdHocTimeSlots(record.timeSlots);
  if (!timeSlots) return null;

  return {
    ...common,
    kind: "recurring_task",
    startsOn,
    intervalDays,
    endKind,
    endsOn,
    recurrenceDayCount,
    timeSlots,
  };
}

/** Occurrence count for a recurring ad-hoc item, capped to a 500-occurrence ceiling. */
export function countLitterPlanAdHocOccurrences(args: {
  intervalDays: number;
  endKind: "fixed_end_date" | "fixed_recurrence_day_count";
  startsOn: string;
  endsOn: string | null;
  recurrenceDayCount: number | null;
  slotCount: number;
}): number | null {
  if (
    !Number.isInteger(args.intervalDays) ||
    args.intervalDays < 1 ||
    args.intervalDays > 365 ||
    !Number.isInteger(args.slotCount) ||
    args.slotCount < 1 ||
    args.slotCount > 8 ||
    !normalizeCivilDate(args.startsOn)
  ) {
    return null;
  }

  if (args.endKind === "fixed_end_date") {
    if (
      args.recurrenceDayCount !== null ||
      !args.endsOn ||
      !normalizeCivilDate(args.endsOn)
    ) {
      return null;
    }
    const diffDays = civilDayDiff(args.startsOn, args.endsOn);
    if (diffDays === null || diffDays < 0) return null;
    const recurrenceDays = Math.floor(diffDays / args.intervalDays) + 1;
    const occurrences = recurrenceDays * args.slotCount;
    return occurrences > 500 ? null : occurrences;
  }

  if (
    args.endsOn !== null ||
    !Number.isInteger(args.recurrenceDayCount) ||
    (args.recurrenceDayCount as number) < 1 ||
    (args.recurrenceDayCount as number) > 500
  ) {
    return null;
  }
  const occurrences = (args.recurrenceDayCount as number) * args.slotCount;
  return occurrences > 500 ? null : occurrences;
}

/** Initial materialization horizon (civil days), capped at 30 and at least 1. */
export function litterPlanAdHocInitialHorizonDays(args: {
  startsOn: string;
  intervalDays: number;
  endKind: "fixed_end_date" | "fixed_recurrence_day_count";
  endsOn: string | null;
  recurrenceDayCount: number | null;
}): number | null {
  if (
    !normalizeCivilDate(args.startsOn) ||
    !Number.isInteger(args.intervalDays) ||
    args.intervalDays < 1 ||
    args.intervalDays > 365
  ) {
    return null;
  }

  let span: number;
  if (args.endKind === "fixed_end_date") {
    if (
      args.recurrenceDayCount !== null ||
      !args.endsOn ||
      !normalizeCivilDate(args.endsOn)
    ) {
      return null;
    }
    const diffDays = civilDayDiff(args.startsOn, args.endsOn);
    if (diffDays === null || diffDays < 0) return null;
    span = diffDays + 1;
  } else {
    if (
      args.endsOn !== null ||
      !Number.isInteger(args.recurrenceDayCount) ||
      (args.recurrenceDayCount as number) < 1 ||
      (args.recurrenceDayCount as number) > 500
    ) {
      return null;
    }
    span = ((args.recurrenceDayCount as number) - 1) * args.intervalDays + 1;
  }

  return Math.max(1, Math.min(30, span));
}

/** Strict mapping of the create_litter_plan_ad_hoc_item RPC row into a typed result. */
export function mapCreateLitterPlanAdHocItemRpcResult(
  row: CreateLitterPlanAdHocItemRpcRow | null | undefined,
): CreateLitterPlanAdHocItemResult {
  if (!row) {
    return error("database_error");
  }
  if (row.outcome !== "success") {
    return error(reasonCode(row.reason ?? null));
  }

  const litterPlanId = uuid(row.litter_plan_id);
  const litterPlanItemId = uuid(row.litter_plan_item_id);
  const taskId = row.task_id === null ? null : uuid(row.task_id);
  const seriesId = row.series_id === null ? null : uuid(row.series_id);
  const planRevision = row.plan_revision;
  const materializedOccurrenceCount = row.materialized_occurrence_count;
  const result = row.result;

  if (
    typeof row.replayed !== "boolean" ||
    !litterPlanId ||
    !litterPlanItemId ||
    (row.task_id !== null && !taskId) ||
    (row.series_id !== null && !seriesId) ||
    !Number.isInteger(planRevision) ||
    (planRevision as number) <= 0 ||
    !Number.isInteger(materializedOccurrenceCount) ||
    !isPlainJsonObject(result)
  ) {
    return error("database_error");
  }

  const resultKind = resultString(result, "kind");
  const resultPlanItemId = uuid(resultString(result, "planItemId"));
  if (!resultKind || resultPlanItemId !== litterPlanItemId) {
    return error("database_error");
  }

  if (
    resultKind === "milestone" ||
    resultKind === "task" ||
    resultKind === "window"
  ) {
    const resultTaskId = uuid(resultString(result, "taskId"));
    if (
      taskId === null ||
      seriesId !== null ||
      (materializedOccurrenceCount as number) !== 0 ||
      resultTaskId !== taskId ||
      result.seriesId !== undefined
    ) {
      return error("database_error");
    }
  } else if (resultKind === "recurring_task") {
    const resultSeriesId = uuid(resultString(result, "seriesId"));
    if (
      taskId !== null ||
      seriesId === null ||
      (materializedOccurrenceCount as number) <= 0 ||
      (materializedOccurrenceCount as number) > 500 ||
      resultSeriesId !== seriesId ||
      result.taskId !== undefined
    ) {
      return error("database_error");
    }
  } else {
    return error("database_error");
  }

  return {
    outcome: "success",
    litterPlanId,
    planRevision: planRevision as number,
    litterPlanItemId,
    taskId,
    seriesId,
    materializedOccurrenceCount: materializedOccurrenceCount as number,
    replayed: row.replayed,
    result,
  };
}

export async function createLitterPlanAdHocItem(
  input: CreateLitterPlanAdHocItemInput,
  supabase: Supabase,
): Promise<CreateLitterPlanAdHocItemResult> {
  const litterId = uuid(input.litterId);
  const clientCommandId = uuid(input.clientCommandId);
  const zone = timezone(input.timezoneName);
  const expectedPlanRevision =
    input.expectedPlanRevision === undefined ||
    input.expectedPlanRevision === null
      ? null
      : input.expectedPlanRevision;
  const payload = normalizeLitterPlanAdHocItemPayload(input.item);

  if (
    !litterId ||
    !clientCommandId ||
    !zone ||
    !payload ||
    (expectedPlanRevision !== null &&
      (!Number.isInteger(expectedPlanRevision) || expectedPlanRevision <= 0))
  ) {
    return error("invalid_input");
  }

  const rpc = await supabase.rpc("create_litter_plan_ad_hoc_item", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_expected_plan_revision: expectedPlanRevision,
    p_timezone_name: zone,
    p_item: payload as unknown as Json,
  });
  if (rpc.error) return error("database_error");

  return mapCreateLitterPlanAdHocItemRpcResult(
    (rpc.data?.[0] as CreateLitterPlanAdHocItemRpcRow | undefined) ?? null,
  );
}

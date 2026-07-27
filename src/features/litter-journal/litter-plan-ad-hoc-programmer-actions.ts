"use server";

import { createClient } from "@/lib/supabase/server";

import {
  createLitterPlanAdHocItem,
  normalizeLitterPlanAdHocItemPayload,
  type LitterPlanAdHocErrorCode,
} from "./litter-plan-ad-hoc";
import {
  litterPlanAdHocProgrammerErrorMessage,
  litterPlanAdHocProgrammerErrorRequiresRefresh,
  litterPlanAdHocProgrammerSuccessMessage,
  type LitterPlanAdHocProgrammerKind,
} from "./litter-plan-ad-hoc-programmer";
import { revalidateLitterCareTaskSchedulePaths } from "./litter-care-task-schedule-revalidate";

export type LitterPlanAdHocProgrammerIntention = {
  litterId: string;
  expectedPlanRevision: number | null;
  timezoneName: string;
  clientCommandId: string;
};

export type LitterPlanAdHocProgrammerActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: LitterPlanAdHocErrorCode;
  requiresRefresh?: boolean;
  createdKind?: LitterPlanAdHocProgrammerKind;
  materializedOccurrenceCount?: number;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalTrimmed(formData: FormData, name: string): string | null {
  const trimmed = value(formData, name).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBoolean(formData: FormData, name: string): boolean {
  const entry = value(formData, name);
  return entry === "true" || entry === "on" || entry === "1";
}

function parseKind(raw: string): LitterPlanAdHocProgrammerKind | null {
  if (
    raw === "milestone" ||
    raw === "task" ||
    raw === "window" ||
    raw === "recurring_task"
  ) {
    return raw;
  }
  return null;
}

function buildItemFromFormData(formData: FormData): unknown {
  const kind = parseKind(value(formData, "kind"));
  if (!kind) return null;

  const common = {
    version: 1 as const,
    kind,
    title: value(formData, "title"),
    description: optionalTrimmed(formData, "description"),
    category: value(formData, "category"),
    targetScope: value(formData, "target_scope"),
    priority: value(formData, "priority"),
    lockSchedule: parseBoolean(formData, "lock_schedule"),
  };

  if (kind === "milestone" || kind === "task") {
    return {
      ...common,
      scheduledDate: value(formData, "scheduled_date"),
      localTime: optionalTrimmed(formData, "local_time"),
    };
  }

  if (kind === "window") {
    return {
      ...common,
      startsOn: value(formData, "starts_on"),
      endsOn: value(formData, "ends_on"),
      startsLocalTime: optionalTrimmed(formData, "starts_local_time"),
      endsLocalTime: optionalTrimmed(formData, "ends_local_time"),
    };
  }

  const endKind = value(formData, "end_kind");
  const intervalRaw = value(formData, "interval_days").trim();
  const intervalDays = /^-?\d+$/.test(intervalRaw) ? Number(intervalRaw) : NaN;
  const dayCountRaw = value(formData, "recurrence_day_count").trim();
  const recurrenceDayCount =
    endKind === "fixed_recurrence_day_count" && /^-?\d+$/.test(dayCountRaw)
      ? Number(dayCountRaw)
      : null;
  const timeSlots = formData
    .getAll("time_slot")
    .filter((entry): entry is string => typeof entry === "string");

  return {
    ...common,
    startsOn: value(formData, "starts_on"),
    intervalDays,
    endKind,
    endsOn:
      endKind === "fixed_end_date" ? value(formData, "ends_on") || null : null,
    recurrenceDayCount,
    timeSlots,
  };
}

export async function createLitterPlanAdHocItemAction(
  intention: LitterPlanAdHocProgrammerIntention,
  _previousState: LitterPlanAdHocProgrammerActionState,
  formData: FormData,
): Promise<LitterPlanAdHocProgrammerActionState> {
  const kind = parseKind(value(formData, "kind"));
  const rawItem = buildItemFromFormData(formData);
  const payload = normalizeLitterPlanAdHocItemPayload(rawItem);

  if (!kind || !payload) {
    return {
      status: "error",
      message: litterPlanAdHocProgrammerErrorMessage("invalid_input"),
      code: "invalid_input",
      requiresRefresh: false,
    };
  }

  const supabase = await createClient();
  const result = await createLitterPlanAdHocItem(
    {
      litterId: intention.litterId,
      clientCommandId: intention.clientCommandId,
      expectedPlanRevision: intention.expectedPlanRevision,
      timezoneName: intention.timezoneName,
      item: payload,
    },
    supabase,
  );

  if (result.outcome === "error") {
    return {
      status: "error",
      message: litterPlanAdHocProgrammerErrorMessage(result.error.code),
      code: result.error.code,
      requiresRefresh: litterPlanAdHocProgrammerErrorRequiresRefresh(
        result.error.code,
      ),
    };
  }

  revalidateLitterCareTaskSchedulePaths(intention.litterId);

  return {
    status: "success",
    message: litterPlanAdHocProgrammerSuccessMessage({
      kind: payload.kind,
      materializedOccurrenceCount: result.materializedOccurrenceCount,
    }),
    createdKind: payload.kind,
    materializedOccurrenceCount: result.materializedOccurrenceCount,
  };
}

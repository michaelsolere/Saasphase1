import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type Plan = Database["public"]["Tables"]["litter_plans"]["Row"];
type Item = Database["public"]["Tables"]["litter_plan_items"]["Row"];

export type LitterPlanErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_litter"
  | "stale_model"
  | "stale_plan"
  | "already_applied"
  | "stale_revision"
  | "conflict"
  | "database_error";
export type LitterPlanResult =
  | {
      outcome: "success";
      planId: string;
      revision: number;
      replayed: boolean;
      result: Json;
    }
  | { outcome: "error"; error: { code: LitterPlanErrorCode; message: string } };
export type LitterPlanErrorResult = Extract<LitterPlanResult, { outcome: "error" }>;
export type LitterPlanDetail = { header: Plan; items: Item[] };

export type LitterPlanSeriesState =
  | "active"
  | "suspended"
  | "completed"
  | "cancelled"
  | "not_applicable";

export type MaterializeLitterPlanSeriesResult =
  | {
      outcome: "success";
      seriesId: string;
      revisionNo: number;
      seriesState: LitterPlanSeriesState;
      insertedCount: number;
      skippedIdenticalCount: number;
      materializedThrough: string | null;
      materializedOccurrenceCount: number | null;
      replayed: boolean;
      result: Json;
    }
  | { outcome: "error"; error: { code: LitterPlanErrorCode; message: string } };

export type SetLitterPlanSeriesStateResult =
  | {
      outcome: "success";
      seriesId: string;
      revisionNo: number;
      seriesState: LitterPlanSeriesState;
      resolvedOccurrenceCount: number;
      replayed: boolean;
      result: Json;
    }
  | { outcome: "error"; error: { code: LitterPlanErrorCode; message: string } };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const timezone = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 255
    ? value
    : null;
const uuid = (value: unknown) =>
  typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
const civilDate = (value: unknown) =>
  typeof value === "string" && DATE.test(value) ? value : null;
const error = (code: LitterPlanErrorCode): LitterPlanErrorResult => ({
  outcome: "error",
  error: { code, message: "Le planning n’a pas pu être appliqué." },
});
const seriesError = (code: LitterPlanErrorCode, message: string) => ({
  outcome: "error" as const,
  error: { code, message },
});

function code(reason: string | null): LitterPlanErrorCode {
  if (reason === "not_authenticated") return "unauthenticated";
  if (reason === "membership_required") return "forbidden";
  if (reason === "not_found") return "not_found";
  if (reason === "invalid_litter") return "invalid_litter";
  if (reason === "stale_model") return "stale_model";
  if (reason === "stale_plan") return "stale_plan";
  if (reason === "stale_revision") return "stale_revision";
  if (reason === "model_already_applied") return "already_applied";
  if (reason === "client_command_conflict") return "conflict";
  return "invalid_input";
}

/** Deterministic occurrence number: day 1/slot 1 → 1, day 1/slot 2 → 2, day 2/slot 1 → 3, … */
export function litterPlanSeriesOccurrenceNo(
  recurrenceDayNo: number,
  slotNo: number,
  slotCount: number,
): number | null {
  if (
    !Number.isInteger(recurrenceDayNo) ||
    recurrenceDayNo < 1 ||
    !Number.isInteger(slotNo) ||
    slotNo < 1 ||
    !Number.isInteger(slotCount) ||
    slotCount < 1 ||
    slotCount > 8 ||
    slotNo > slotCount
  ) {
    return null;
  }
  return (recurrenceDayNo - 1) * slotCount + slotNo;
}

/** Initial civil horizon through date: starts_on + (horizonDays - 1) calendar days. */
export function litterPlanSeriesInitialThroughDate(
  startsOn: string,
  horizonDays: number,
): string | null {
  if (
    !DATE.test(startsOn) ||
    !Number.isInteger(horizonDays) ||
    horizonDays < 1 ||
    horizonDays > 365
  ) {
    return null;
  }
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() + (horizonDays - 1));
  return start.toISOString().slice(0, 10);
}

export async function getActiveLitterPlanForLitter(
  litterId: string,
  supabase: Supabase,
): Promise<LitterPlanDetail | LitterPlanErrorResult> {
  const normalized = uuid(litterId);
  if (!normalized) return error("invalid_input");
  const plan = await supabase
    .from("litter_plans")
    .select("*")
    .eq("litter_id", normalized)
    .eq("status", "active")
    .maybeSingle();
  if (plan.error) return error("database_error");
  if (!plan.data) return error("not_found");
  const items = await supabase
    .from("litter_plan_items")
    .select("*")
    .eq("litter_plan_id", plan.data.id)
    .order("display_order");
  if (items.error) return error("database_error");
  return { header: plan.data, items: items.data ?? [] };
}

export async function applyLitterPlanningModel(
  input: {
    litterId: string;
    planningModelId: string;
    clientCommandId: string;
    expectedModelRevision: number;
    expectedPlanRevision?: number | null;
    selectedModelItemIds?: string[] | null;
    timezoneName: string;
  },
  supabase: Supabase,
): Promise<LitterPlanResult> {
  const litterId = uuid(input.litterId);
  const modelId = uuid(input.planningModelId);
  const commandId = uuid(input.clientCommandId);
  const zone = timezone(input.timezoneName);
  const ids =
    input.selectedModelItemIds === null ||
    input.selectedModelItemIds === undefined
      ? null
      : input.selectedModelItemIds.map(uuid);
  if (
    !litterId ||
    !modelId ||
    !commandId ||
    !zone ||
    !Number.isInteger(input.expectedModelRevision) ||
    input.expectedModelRevision <= 0 ||
    ids?.some((id) => !id) ||
    (input.expectedPlanRevision !== null &&
      input.expectedPlanRevision !== undefined &&
      (!Number.isInteger(input.expectedPlanRevision) ||
        input.expectedPlanRevision <= 0))
  ) {
    return error("invalid_input");
  }
  const selectedIds = ids?.filter((id): id is string => id !== null) ?? null;
  const rpc = await supabase.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
    p_planning_model_id: modelId,
    p_client_command_id: commandId,
    p_expected_model_revision: input.expectedModelRevision,
    p_expected_plan_revision: input.expectedPlanRevision ?? null,
    p_selected_model_item_ids: selectedIds,
    p_timezone_name: zone,
  });
  if (rpc.error) return error("database_error");
  const row = rpc.data?.[0];
  const planId = uuid(row?.litter_plan_id);
  const revision = row?.revision;
  if (
    !row ||
    row.outcome !== "success" ||
    !planId ||
    typeof revision !== "number" ||
    !Number.isInteger(revision)
  ) {
    return error(code(row?.reason ?? null));
  }
  return {
    outcome: "success",
    planId,
    revision,
    replayed: row.replayed === true,
    result: row.result,
  };
}

export async function materializeLitterPlanSeries(
  input: {
    seriesId: string;
    clientCommandId: string;
    expectedRevisionNo: number;
    requestedThrough: string;
  },
  supabase: Supabase,
): Promise<MaterializeLitterPlanSeriesResult> {
  const seriesId = uuid(input.seriesId);
  const clientCommandId = uuid(input.clientCommandId);
  const requestedThrough = civilDate(input.requestedThrough);
  if (
    !seriesId ||
    !clientCommandId ||
    !requestedThrough ||
    !Number.isInteger(input.expectedRevisionNo) ||
    input.expectedRevisionNo <= 0
  ) {
    return seriesError(
      "invalid_input",
      "La matérialisation de la série est invalide.",
    );
  }
  const rpc = await supabase.rpc("materialize_litter_plan_series", {
    p_series_id: seriesId,
    p_client_command_id: clientCommandId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_requested_through: requestedThrough,
  });
  if (rpc.error) {
    return seriesError(
      "database_error",
      "La matérialisation de la série a échoué.",
    );
  }
  const row = rpc.data?.[0];
  const resultSeriesId = uuid(row?.series_id);
  const revisionNo = row?.revision_no;
  const seriesState = row?.series_state as LitterPlanSeriesState | null | undefined;
  if (
    !row ||
    row.outcome !== "success" ||
    !resultSeriesId ||
    typeof revisionNo !== "number" ||
    !Number.isInteger(revisionNo) ||
    !seriesState
  ) {
    return seriesError(
      code(row?.reason ?? null),
      "La matérialisation de la série a échoué.",
    );
  }
  return {
    outcome: "success",
    seriesId: resultSeriesId,
    revisionNo,
    seriesState,
    insertedCount: row.inserted_count ?? 0,
    skippedIdenticalCount: row.skipped_identical_count ?? 0,
    materializedThrough: row.materialized_through,
    materializedOccurrenceCount: row.materialized_occurrence_count,
    replayed: row.replayed === true,
    result: row.result,
  };
}

export async function setLitterPlanSeriesState(
  input: {
    seriesId: string;
    clientCommandId: string;
    expectedRevisionNo: number;
    newState: LitterPlanSeriesState;
    reason?: string | null;
  },
  supabase: Supabase,
): Promise<SetLitterPlanSeriesStateResult> {
  const seriesId = uuid(input.seriesId);
  const clientCommandId = uuid(input.clientCommandId);
  const allowed: LitterPlanSeriesState[] = [
    "active",
    "suspended",
    "completed",
    "cancelled",
    "not_applicable",
  ];
  if (
    !seriesId ||
    !clientCommandId ||
    !Number.isInteger(input.expectedRevisionNo) ||
    input.expectedRevisionNo <= 0 ||
    !allowed.includes(input.newState) ||
    (input.reason != null &&
      (typeof input.reason !== "string" || input.reason.length > 5000))
  ) {
    return seriesError(
      "invalid_input",
      "Le changement d’état de la série est invalide.",
    );
  }
  const rpc = await supabase.rpc("set_litter_plan_series_state", {
    p_series_id: seriesId,
    p_client_command_id: clientCommandId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_new_state: input.newState,
    p_reason: input.reason ?? null,
  });
  if (rpc.error) {
    return seriesError(
      "database_error",
      "Le changement d’état de la série a échoué.",
    );
  }
  const row = rpc.data?.[0];
  const resultSeriesId = uuid(row?.series_id);
  const revisionNo = row?.revision_no;
  const seriesState = row?.series_state as LitterPlanSeriesState | null | undefined;
  if (
    !row ||
    row.outcome !== "success" ||
    !resultSeriesId ||
    typeof revisionNo !== "number" ||
    !Number.isInteger(revisionNo) ||
    !seriesState
  ) {
    return seriesError(
      code(row?.reason ?? null),
      "Le changement d’état de la série a échoué.",
    );
  }
  return {
    outcome: "success",
    seriesId: resultSeriesId,
    revisionNo,
    seriesState,
    resolvedOccurrenceCount: row.resolved_occurrence_count ?? 0,
    replayed: row.replayed === true,
    result: row.result,
  };
}

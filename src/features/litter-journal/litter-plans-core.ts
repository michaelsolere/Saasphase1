import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import {
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_TARGET_SCOPES,
  type LitterCareTaskCategory,
  type LitterCareTaskTargetScope,
} from "./litter-care-tasks-core";
import type {
  LitterPlanSeriesEndKind,
  LitterPlanSeriesState,
  LitterPlanSeriesSummariesResult,
  LitterPlanSeriesSummary,
} from "./litter-plan-series-summary";

export type { LitterPlanSeriesState } from "./litter-plan-series-summary";

type Supabase = SupabaseClient<Database>;
type Plan = Database["public"]["Tables"]["litter_plans"]["Row"];
type Item = Database["public"]["Tables"]["litter_plan_items"]["Row"];
type OrganizationRole = "owner" | "admin" | "member" | "viewer";
type SeriesRow = Database["public"]["Tables"]["litter_plan_series"]["Row"];
type SeriesSlotRow =
  Database["public"]["Tables"]["litter_plan_series_time_slots"]["Row"];
type CareTaskRow = Pick<
  Database["public"]["Tables"]["litter_care_tasks"]["Row"],
  | "litter_plan_series_id"
  | "status"
  | "planned_for"
  | "scheduled_local_time"
>;
type PlanItemMeta = Pick<
  Item,
  "id" | "title" | "category" | "target_scope" | "display_order"
>;

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
  | "anchor_unavailable"
  | "series_not_active"
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
  if (reason === "anchor_unavailable") return "anchor_unavailable";
  if (reason === "series_not_active") return "series_not_active";
  return "invalid_input";
}

function seriesFailureMessage(
  reason: string | null,
  fallback: string,
): string {
  if (reason === "anchor_unavailable") {
    return "Le suivi ne peut pas encore être programmé : la date d’ancrage n’est pas renseignée.";
  }
  if (reason === "stale_revision") {
    return "Ce suivi a été modifié ailleurs. Rechargez le Journal pour continuer.";
  }
  if (reason === "series_not_active") {
    return "Ce suivi n’est plus actif et ne peut pas être prolongé.";
  }
  return fallback;
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
    const reason = row?.reason ?? null;
    return seriesError(
      code(reason),
      seriesFailureMessage(reason, "La matérialisation de la série a échoué."),
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
    const reason = row?.reason ?? null;
    return seriesError(
      code(reason),
      seriesFailureMessage(reason, "Le changement d’état de la série a échoué."),
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

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isSeriesState(value: unknown): value is LitterPlanSeriesState {
  return (
    value === "active" ||
    value === "suspended" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "not_applicable"
  );
}

function isSeriesEndKind(value: unknown): value is LitterPlanSeriesEndKind {
  return (
    value === "fixed_end_offset" ||
    value === "fixed_recurrence_day_count" ||
    value === "actual_birth"
  );
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

function emptyOccurrenceCounts() {
  return {
    total: 0,
    planned: 0,
    done: 0,
    cancelled: 0,
    notApplicable: 0,
  };
}

function mapSeriesSummary(
  series: SeriesRow,
  item: PlanItemMeta,
  slots: SeriesSlotRow[],
  tasks: CareTaskRow[],
): LitterPlanSeriesSummary | null {
  if (
    !isSeriesState(series.state) ||
    !isSeriesEndKind(series.end_kind) ||
    !isCategory(item.category) ||
    !isTargetScope(item.target_scope) ||
    !Number.isInteger(series.revision_no) ||
    series.revision_no <= 0
  ) {
    return null;
  }

  const timeSlots = [...slots]
    .sort((a, b) => a.slot_no - b.slot_no)
    .map((slot) =>
      typeof slot.local_time === "string"
        ? slot.local_time.slice(0, 5)
        : "",
    )
    .filter(Boolean);

  const counts = emptyOccurrenceCounts();
  let nextOccurrence: LitterPlanSeriesSummary["nextOccurrence"] = null;
  for (const task of tasks) {
    counts.total += 1;
    if (task.status === "planned") counts.planned += 1;
    else if (task.status === "done") counts.done += 1;
    else if (task.status === "cancelled") counts.cancelled += 1;
    else if (task.status === "not_applicable") counts.notApplicable += 1;

    if (task.status !== "planned" || !task.planned_for) continue;
    const candidate = {
      plannedFor: task.planned_for,
      scheduledLocalTime: task.scheduled_local_time
        ? task.scheduled_local_time.slice(0, 5)
        : null,
    };
    if (!nextOccurrence) {
      nextOccurrence = candidate;
      continue;
    }
    const byDate = candidate.plannedFor.localeCompare(nextOccurrence.plannedFor);
    if (byDate < 0) {
      nextOccurrence = candidate;
      continue;
    }
    if (byDate === 0) {
      const left = candidate.scheduledLocalTime ?? "";
      const right = nextOccurrence.scheduledLocalTime ?? "";
      if (left && (!right || left < right)) nextOccurrence = candidate;
    }
  }

  return {
    id: series.id,
    revisionNo: series.revision_no,
    title: item.title,
    category: item.category,
    targetScope: item.target_scope,
    state: series.state,
    endKind: series.end_kind,
    recurrenceIntervalDays: series.recurrence_interval_days,
    recurrenceDayCount: series.recurrence_day_count,
    startsOn: series.starts_on,
    endsOn: series.ends_on,
    materializedThrough: series.materialized_through,
    absoluteMaxOccurrences: series.absolute_max_occurrences,
    initialMaterializationHorizonDays:
      series.initial_materialization_horizon_days,
    timeSlots,
    occurrenceCounts: counts,
    nextOccurrence,
    anchorPending: series.starts_on === null,
  };
}

export async function listLitterPlanSeriesSummariesForLitter(
  litterId: string,
  supabase: Supabase,
): Promise<LitterPlanSeriesSummariesResult> {
  const normalized = uuid(litterId);
  if (!normalized) {
    return {
      outcome: "error",
      error: { code: "invalid_input", message: "La portée est invalide." },
    };
  }

  const auth = await supabase.auth.getUser();
  const userId = auth.data.user?.id ?? null;
  if (!userId) {
    return {
      outcome: "error",
      error: {
        code: "unauthenticated",
        message: "Vous devez être connecté pour continuer.",
      },
    };
  }

  const litter = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", normalized)
    .is("deleted_at", null)
    .maybeSingle();
  if (litter.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les suivis récurrents n’ont pas pu être chargés.",
      },
    };
  }
  if (!litter.data) {
    return {
      outcome: "error",
      error: {
        code: "not_found",
        message: "La portée demandée est introuvable.",
      },
    };
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", litter.data.organization_id)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les suivis récurrents n’ont pas pu être chargés.",
      },
    };
  }
  if (!membership.data || !isOrganizationRole(membership.data.role)) {
    return {
      outcome: "error",
      error: {
        code: "not_found",
        message: "La portée demandée est introuvable.",
      },
    };
  }

  const seriesResult = await supabase
    .from("litter_plan_series")
    .select("*")
    .eq("litter_id", normalized)
    .order("created_at", { ascending: true });
  if (seriesResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les suivis récurrents n’ont pas pu être chargés.",
      },
    };
  }

  const seriesRows = seriesResult.data ?? [];
  if (seriesRows.length === 0) {
    return {
      outcome: "success",
      role: membership.data.role,
      series: [],
    };
  }

  const seriesIds = seriesRows.map((row) => row.id);
  const itemIds = [...new Set(seriesRows.map((row) => row.litter_plan_item_id))];

  const [slotsResult, itemsResult, tasksResult] = await Promise.all([
    supabase
      .from("litter_plan_series_time_slots")
      .select("series_id, slot_no, local_time")
      .in("series_id", seriesIds)
      .order("slot_no", { ascending: true }),
    supabase
      .from("litter_plan_items")
      .select("id, title, category, target_scope, display_order")
      .in("id", itemIds),
    supabase
      .from("litter_care_tasks")
      .select(
        "litter_plan_series_id, status, planned_for, scheduled_local_time",
      )
      .eq("litter_id", normalized)
      .in("litter_plan_series_id", seriesIds),
  ]);

  if (slotsResult.error || itemsResult.error || tasksResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les suivis récurrents n’ont pas pu être chargés.",
      },
    };
  }

  const slotsBySeries = new Map<string, SeriesSlotRow[]>();
  for (const slot of slotsResult.data ?? []) {
    const list = slotsBySeries.get(slot.series_id) ?? [];
    list.push(slot as SeriesSlotRow);
    slotsBySeries.set(slot.series_id, list);
  }

  const itemsById = new Map<string, PlanItemMeta>();
  for (const item of itemsResult.data ?? []) {
    itemsById.set(item.id, item);
  }

  const tasksBySeries = new Map<string, CareTaskRow[]>();
  for (const task of tasksResult.data ?? []) {
    if (!task.litter_plan_series_id) continue;
    const list = tasksBySeries.get(task.litter_plan_series_id) ?? [];
    list.push(task);
    tasksBySeries.set(task.litter_plan_series_id, list);
  }

  const summaries: LitterPlanSeriesSummary[] = [];
  const ordered = [...seriesRows].sort((left, right) => {
    const leftItem = itemsById.get(left.litter_plan_item_id);
    const rightItem = itemsById.get(right.litter_plan_item_id);
    const byOrder =
      (leftItem?.display_order ?? 0) - (rightItem?.display_order ?? 0);
    if (byOrder !== 0) return byOrder;
    return left.id.localeCompare(right.id);
  });

  for (const row of ordered) {
    const item = itemsById.get(row.litter_plan_item_id);
    if (!item) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les suivis récurrents n’ont pas pu être chargés.",
        },
      };
    }
    const summary = mapSeriesSummary(
      row,
      item,
      slotsBySeries.get(row.id) ?? [],
      tasksBySeries.get(row.id) ?? [],
    );
    if (!summary) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les suivis récurrents n’ont pas pu être chargés.",
        },
      };
    }
    summaries.push(summary);
  }

  return {
    outcome: "success",
    role: membership.data.role,
    series: summaries,
  };
}

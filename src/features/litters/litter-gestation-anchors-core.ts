import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";
import {
  gestationAnchorRecalculationErrorMessage,
  gestationAnchorRecalculationSuccessMessage,
  parseOptionalCivilDate,
  type LitterGestationAnchorBusinessOutcome,
  type LitterGestationAnchorCounters,
  type LitterGestationAnchorErrorReason,
} from "./litter-gestation-anchors-outcome";

type Supabase = SupabaseClient<Database>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UpdateLitterGestationAnchorsInput = {
  litterId: string;
  clientCommandId: string;
  expectedLitterUpdatedAt: string;
  expectedPlanRevision: number | null;
  estimatedOvulationDate: string | null;
  expectedBirthDate: string | null;
};

export type UpdateLitterGestationAnchorsSuccess = {
  outcome: "success";
  businessOutcome: LitterGestationAnchorBusinessOutcome;
  replayed: boolean;
  litterId: string;
  litterPlanId: string | null;
  resultPlanRevision: number | null;
  counters: LitterGestationAnchorCounters;
  message: string;
  result: Json;
};

export type UpdateLitterGestationAnchorsError = {
  outcome: "error";
  error: {
    code: LitterGestationAnchorErrorReason | "database_error";
    message: string;
  };
};

export type UpdateLitterGestationAnchorsResult =
  | UpdateLitterGestationAnchorsSuccess
  | UpdateLitterGestationAnchorsError;

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function mapReason(
  reason: string | null | undefined,
): LitterGestationAnchorErrorReason | "database_error" {
  switch (reason) {
    case "stale_litter":
    case "stale_plan":
    case "anchor_unavailable":
    case "client_command_conflict":
    case "invalid_input":
    case "membership_required":
    case "not_found":
    case "not_authenticated":
      return reason;
    default:
      return "database_error";
  }
}

export async function updateLitterGestationAnchorsAndRecalculatePlanCore(
  input: UpdateLitterGestationAnchorsInput,
  supabase: Supabase,
): Promise<UpdateLitterGestationAnchorsResult> {
  const litterId = uuid(input.litterId);
  const clientCommandId = uuid(input.clientCommandId);
  const ovulation = parseOptionalCivilDate(input.estimatedOvulationDate);
  const expectedBirth = parseOptionalCivilDate(input.expectedBirthDate);

  if (
    !litterId ||
    !clientCommandId ||
    !input.expectedLitterUpdatedAt ||
    ovulation === "invalid" ||
    expectedBirth === "invalid" ||
    (input.expectedPlanRevision !== null &&
      (!Number.isInteger(input.expectedPlanRevision) ||
        input.expectedPlanRevision <= 0))
  ) {
    return {
      outcome: "error",
      error: {
        code: "invalid_input",
        message: gestationAnchorRecalculationErrorMessage("invalid_input"),
      },
    };
  }

  const rpc = await supabase.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: litterId,
      p_client_command_id: clientCommandId,
      p_expected_litter_updated_at: input.expectedLitterUpdatedAt,
      p_expected_plan_revision: input.expectedPlanRevision,
      p_estimated_ovulation_date: ovulation,
      p_expected_birth_date: expectedBirth,
    },
  );

  if (rpc.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: gestationAnchorRecalculationErrorMessage("database_error"),
      },
    };
  }

  const row = rpc.data?.[0];
  if (!row) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: gestationAnchorRecalculationErrorMessage("database_error"),
      },
    };
  }

  if (
    row.outcome !== "updated_without_plan" &&
    row.outcome !== "recalculated" &&
    row.outcome !== "unchanged"
  ) {
    const code = mapReason(row.reason);
    return {
      outcome: "error",
      error: {
        code,
        message: gestationAnchorRecalculationErrorMessage(code),
      },
    };
  }

  const counters: LitterGestationAnchorCounters = {
    recalculatedItemCount: asCount(row.recalculated_item_count),
    changedTaskCount: asCount(row.changed_task_count),
    movedAutomaticScheduleCount: asCount(row.moved_automatic_schedule_count),
    preservedManualScheduleCount: asCount(row.preserved_manual_schedule_count),
    preservedLockedScheduleCount: asCount(row.preserved_locked_schedule_count),
    preservedTerminalCount: asCount(row.preserved_terminal_count),
    unchangedTaskCount: asCount(row.unchanged_task_count),
  };

  const message = gestationAnchorRecalculationSuccessMessage(
    row.outcome,
    counters,
  );

  return {
    outcome: "success",
    businessOutcome: row.outcome,
    replayed: row.replayed === true,
    litterId: uuid(row.litter_id) ?? litterId,
    litterPlanId: uuid(row.litter_plan_id),
    resultPlanRevision:
      typeof row.result_plan_revision === "number"
        ? row.result_plan_revision
        : null,
    counters,
    message: message.message,
    result: row.result ?? {},
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import {
  formatLitterPlanningModelApplySuccessMessage,
  litterPlanningModelApplyErrorMessage,
  litterPlanningModelApplyErrorRequiresReload,
  readLitterPlanningModelApplyResultCounters,
  validateLitterPlanningModelSelectedIndexes,
} from "./litter-planning-model-apply";
import type { LitterPlanningModelApplyIntention } from "./litter-planning-model-apply";
import { applyLitterPlanningModel } from "./litter-plans-core";

export type ApplyLitterPlanningModelActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  requiresReload?: boolean;
  addedCount?: number;
  materializedCount?: number;
  pendingAnchorCount?: number;
  recurringPreparedOccurrenceCount?: number | null;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function parseSelectedIndexes(formData: FormData): unknown[] {
  return formData
    .getAll("selected_public_index")
    .map((entry) => {
      if (typeof entry !== "string") return entry;
      const trimmed = entry.trim();
      if (!/^-?\d+$/.test(trimmed)) return trimmed;
      return Number(trimmed);
    });
}

function revalidateAfterApply(litterId: string) {
  revalidatePath("/litters/journal");
  revalidatePath("/litters/journal/calendar");
  revalidatePath("/calendar");
  revalidatePath("/calendar/today");
  revalidatePath(`/litters/${litterId}`);
}

export async function applyLitterPlanningModelAction(
  intention: LitterPlanningModelApplyIntention,
  _previousState: ApplyLitterPlanningModelActionState,
  formData: FormData,
): Promise<ApplyLitterPlanningModelActionState> {
  if (value(formData, "confirmation") !== "confirmed") {
    return {
      status: "error",
      message: "La confirmation est requise pour appliquer ce modèle.",
    };
  }

  const selectionItems = Object.keys(intention.publicIndexToModelItemId).map(
    (key) => {
      const publicIndex = Number(key);
      return {
        publicIndex,
        isRequired: intention.requiredIndexes.includes(publicIndex),
        isSelectedByDefault: false,
      };
    },
  );

  const validation = validateLitterPlanningModelSelectedIndexes({
    items: selectionItems,
    selectedIndexes: parseSelectedIndexes(formData),
  });
  if (!validation.ok) {
    return {
      status: "error",
      message: "La sélection d’éléments est invalide.",
      code: "invalid_input",
    };
  }

  const selectedModelItemIds = validation.selectedIndexes.map((index) => {
    const modelItemId = intention.publicIndexToModelItemId[index];
    if (!modelItemId) {
      throw new Error("Missing authoritative model item mapping.");
    }
    return modelItemId;
  });

  const supabase = await createClient();
  const result = await applyLitterPlanningModel(
    {
      litterId: intention.litterId,
      planningModelId: intention.planningModelId,
      clientCommandId: intention.clientCommandId,
      expectedModelRevision: intention.expectedModelRevision,
      expectedPlanRevision: intention.expectedPlanRevision,
      selectedModelItemIds,
      timezoneName: intention.timezoneName,
    },
    supabase,
  );

  if (result.outcome === "error") {
    return {
      status: "error",
      message: litterPlanningModelApplyErrorMessage(result.error.code),
      code: result.error.code,
      requiresReload: litterPlanningModelApplyErrorRequiresReload(
        result.error.code,
      ),
    };
  }

  const counters = readLitterPlanningModelApplyResultCounters(result.result);
  revalidateAfterApply(intention.litterId);

  return {
    status: "success",
    message: formatLitterPlanningModelApplySuccessMessage(counters),
    addedCount: counters.addedCount,
    materializedCount: counters.materializedCount,
    pendingAnchorCount: counters.pendingAnchorCount,
    recurringPreparedOccurrenceCount: counters.recurringPreparedOccurrenceCount,
  };
}

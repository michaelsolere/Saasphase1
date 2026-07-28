"use server";

import { createClient } from "@/lib/supabase/server";

import {
  normalizeLitterPlanAdHocMetadataPayload,
  updateLitterPlanAdHocItemMetadata,
  type LitterPlanAdHocErrorCode,
} from "./litter-plan-ad-hoc";
import { revalidateLitterCareTaskSchedulePaths } from "./litter-care-task-schedule-revalidate";
import { validateLitterPlanAdHocMetadataForm } from "./litter-plan-ad-hoc-metadata-validation";

export type LitterPlanAdHocMetadataIntention = {
  litterId: string; litterPlanId: string; litterPlanItemId: string; taskId: string; clientCommandId: string;
  expectedPlanRevision: number; expectedItemRevision: number; expectedTaskRevision: number;
};
export type LitterPlanAdHocMetadataActionState = { status: "idle" | "success" | "error"; message?: string; code?: LitterPlanAdHocErrorCode; requiresRefresh?: boolean; fieldErrors?: Partial<Record<"title" | "description" | "category" | "targetScope" | "priority", string>> };

const read = (data: FormData, key: string) => {
  const value = data.get(key); return typeof value === "string" ? value : "";
};

export async function updateLitterPlanAdHocItemMetadataAction(intention: LitterPlanAdHocMetadataIntention, _previous: LitterPlanAdHocMetadataActionState, formData: FormData): Promise<LitterPlanAdHocMetadataActionState> {
  const metadata = normalizeLitterPlanAdHocMetadataPayload({
    version: 1, operation: "update_metadata", title: read(formData, "title"),
    description: read(formData, "description"), category: read(formData, "category"),
    targetScope: read(formData, "target_scope"), priority: read(formData, "priority"),
  });
  if (!metadata) {
    return { status: "error", code: "invalid_input", message: "Corrigez les informations indiquées.", fieldErrors: validateLitterPlanAdHocMetadataForm({ title: read(formData,"title"), description: read(formData,"description"), category: read(formData,"category"), targetScope: read(formData,"target_scope"), priority: read(formData,"priority") }) };
  }
  const result = await updateLitterPlanAdHocItemMetadata({ ...intention, metadata }, await createClient());
  if (result.outcome === "error") return {
    status: "error", code: result.error.code, requiresRefresh: result.error.code === "stale_revision",
    message: result.error.code === "stale_revision" ? "Le Journal a été modifié. Rechargez-le avant de réessayer." : "Les informations ne peuvent pas être modifiées pour le moment.",
  };
  revalidateLitterCareTaskSchedulePaths(intention.litterId);
  return { status: "success", message: "Informations mises à jour." };
}

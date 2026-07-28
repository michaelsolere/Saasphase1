"use server";

import { createClient } from "@/lib/supabase/server";

import {
  normalizeLitterPlanAdHocMetadataPayload,
  updateLitterPlanAdHocItemMetadata,
  type LitterPlanAdHocErrorCode,
} from "./litter-plan-ad-hoc";
import { revalidateLitterCareTaskSchedulePaths } from "./litter-care-task-schedule-revalidate";

export type LitterPlanAdHocMetadataIntention = {
  litterId: string; litterPlanItemId: string; clientCommandId: string;
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
    const title=read(formData,"title").trim(); const description=read(formData,"description");
    return { status: "error", code: "invalid_input", message: "Corrigez les informations indiquées.", fieldErrors: { ...(title.length < 1 || title.length > 255 ? { title: "Le titre doit contenir entre 1 et 255 caractères." } : {}), ...(description.length > 5000 ? { description: "La description ne doit pas dépasser 5 000 caractères." } : {}), ...(title && description.length <= 5000 ? { category: "La catégorie, la cible ou la priorité est invalide." } : {}) } };
  }
  const result = await updateLitterPlanAdHocItemMetadata({ ...intention, metadata }, await createClient());
  if (result.outcome === "error") return {
    status: "error", code: result.error.code, requiresRefresh: result.error.code === "stale_revision",
    message: result.error.code === "stale_revision" ? "Le Journal a été modifié. Rechargez-le avant de réessayer." : "Les informations ne peuvent pas être modifiées pour le moment.",
  };
  revalidateLitterCareTaskSchedulePaths(intention.litterId);
  return { status: "success", message: "Informations mises à jour." };
}

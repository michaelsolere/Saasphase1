import { LITTER_CARE_TASK_CATEGORIES, LITTER_CARE_TASK_PRIORITIES, LITTER_CARE_TASK_TARGET_SCOPES } from "./litter-care-tasks-core";

export type LitterPlanAdHocMetadataFieldErrors = Partial<Record<"title" | "description" | "category" | "targetScope" | "priority", string>>;
export function validateLitterPlanAdHocMetadataForm(input: Record<string, unknown>): LitterPlanAdHocMetadataFieldErrors {
  const errors: LitterPlanAdHocMetadataFieldErrors = {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description : "";
  if (title.length < 1 || title.length > 255) errors.title = "Le titre doit contenir entre 1 et 255 caractères.";
  if (description.length > 5000) errors.description = "La description ne doit pas dépasser 5 000 caractères.";
  if (typeof input.category !== "string" || !LITTER_CARE_TASK_CATEGORIES.includes(input.category as (typeof LITTER_CARE_TASK_CATEGORIES)[number])) errors.category = "La catégorie est invalide.";
  if (typeof input.targetScope !== "string" || !LITTER_CARE_TASK_TARGET_SCOPES.includes(input.targetScope as (typeof LITTER_CARE_TASK_TARGET_SCOPES)[number])) errors.targetScope = "La cible est invalide.";
  if (typeof input.priority !== "string" || !LITTER_CARE_TASK_PRIORITIES.includes(input.priority as (typeof LITTER_CARE_TASK_PRIORITIES)[number])) errors.priority = "La priorité est invalide.";
  return errors;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export const LITTER_CARE_TASK_CATEGORIES = [
  "reproduction",
  "maternal_health",
  "maternal_feeding",
  "preparation",
  "offspring_weight",
  "offspring_health",
  "offspring_feeding",
  "socialization",
  "veterinary",
  "identification",
  "vaccination",
  "other",
] as const;
export type LitterCareTaskCategory =
  (typeof LITTER_CARE_TASK_CATEGORIES)[number];

export const LITTER_CARE_TASK_TARGET_SCOPES = [
  "mother",
  "litter",
  "all_offspring",
  "organization",
] as const;
export type LitterCareTaskTargetScope =
  (typeof LITTER_CARE_TASK_TARGET_SCOPES)[number];

export const LITTER_CARE_TASK_ANCHOR_TYPES = [
  "first_mating",
  "estimated_ovulation",
  "expected_birth",
  "actual_birth",
  "offspring_age",
] as const;
export type LitterCareTaskAnchorType =
  (typeof LITTER_CARE_TASK_ANCHOR_TYPES)[number];

export const LITTER_CARE_TASK_RESOLUTION_STATUSES = [
  "done",
  "cancelled",
  "not_applicable",
] as const;
export type LitterCareTaskResolutionStatus =
  (typeof LITTER_CARE_TASK_RESOLUTION_STATUSES)[number];

export type LitterCareTaskServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_litter"
  | "stale_plan"
  | "conflict"
  | "stale_revision"
  | "not_planned"
  | "database_error";

export type LitterCareTaskServiceError = {
  code: LitterCareTaskServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: LitterCareTaskServiceError;
};

export type LitterCareTaskTemplateSummary = {
  id: string;
  title: string;
  description: string | null;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  anchorType: LitterCareTaskAnchorType;
  offsetDays: number;
  species: "dog" | "cat";
  breed: string | null;
  isActive: boolean;
  sortOrder: number;
  revision: number;
  libraryTemplateCode: string | null;
  libraryTemplateVersion: number | null;
};

export type LitterCareTaskLibraryPackSummary = {
  code: string;
  title: string;
  description: string | null;
  species: "dog" | "cat";
  sortOrder: number;
};

export type LitterCareTaskLibraryImportedVersionSummary = {
  version: number;
  organizationTemplateId: string;
  isActive: boolean;
};

export type LitterCareTaskLibraryTemplateSummary = {
  code: string;
  version: number;
  packCode: string;
  title: string;
  description: string | null;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  anchorType: LitterCareTaskAnchorType;
  offsetDays: number;
  species: "dog" | "cat";
  breed: string | null;
  sortOrder: number;
  isImported: boolean;
  organizationTemplateId: string | null;
  organizationTemplateIsActive: boolean | null;
  latestImportedVersion: LitterCareTaskLibraryImportedVersionSummary | null;
};

export type LitterCareTaskLibrarySelection = {
  code: string;
  version: number;
};

export type LitterCareTaskLibraryImportItemResult =
  LitterCareTaskLibrarySelection & {
    templateId: string;
    state: "imported" | "already_imported";
  };

export type LitterCareTaskSummary = {
  id: string;
  litterId: string;
  source: "manual" | "system_template" | "organization_template";
  organizationTemplateId: string | null;
  systemTemplateCode: string | null;
  occurrenceNo: number;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  title: string;
  description: string | null;
  anchorType: LitterCareTaskAnchorType | null;
  anchorDate: string | null;
  offsetDays: number | null;
  plannedFor: string;
  status: "planned" | "done" | "cancelled" | "not_applicable";
  resolvedAt: string | null;
  resolvedTimezoneName: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
};

export const LITTER_CARE_TASK_GENERATION_STATES = [
  "ready",
  "already_generated",
  "missing_anchor",
  "inactive",
  "species_mismatch",
  "breed_mismatch",
] as const;
export type LitterCareTaskGenerationState =
  (typeof LITTER_CARE_TASK_GENERATION_STATES)[number];

export type LitterCareTaskGenerationReadyPlanItem = {
  templateId: string;
  revision: number;
  anchorType: LitterCareTaskAnchorType;
  anchorDate: string;
  plannedFor: string;
};

export type LitterCareTaskGenerationPlanEntry = {
  template: LitterCareTaskTemplateSummary;
  state: LitterCareTaskGenerationState;
  readyPlan: LitterCareTaskGenerationReadyPlanItem | null;
};

export type LitterCareTaskGenerationTaskResult = {
  templateId: string;
  taskId: string;
  state: "created" | "already_generated";
};

export type ListLitterCareTaskTemplatesInput = { litterId: string };
export type ListLitterCareTaskTemplatesForOrganizationInput = {
  organizationId: string;
};
export type ListLitterCareTaskLibraryInput = {
  organizationId: string;
};
export type ImportLitterCareTaskLibraryTemplatesInput = {
  organizationId: string;
  clientCommandId: string;
  selection: LitterCareTaskLibrarySelection[];
  isActive: boolean;
};
export type ListLitterCareTasksForLitterInput = { litterId: string };
export type PlanLitterCareTaskGenerationInput = { litterId: string };
export type GenerateLitterCareTasksFromPlanInput = {
  litterId: string;
  clientCommandId: string;
  plan: LitterCareTaskGenerationReadyPlanItem[];
};

export type ListLitterCareTaskTemplatesResult =
  | { outcome: "success"; role: OrganizationRole; templates: LitterCareTaskTemplateSummary[] }
  | ErrorResult;

export type ListLitterCareTaskTemplatesForOrganizationResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      templates: LitterCareTaskTemplateSummary[];
    }
  | ErrorResult;

export type ListLitterCareTaskLibraryResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      packs: LitterCareTaskLibraryPackSummary[];
      templates: LitterCareTaskLibraryTemplateSummary[];
    }
  | ErrorResult;

export type ImportLitterCareTaskLibraryTemplatesResult =
  | {
      outcome: "success";
      importedCount: number;
      alreadyImportedCount: number;
      templates: LitterCareTaskLibraryImportItemResult[];
      replayed: boolean;
    }
  | ErrorResult;

type LitterCareTaskTemplateValues = {
  title: string;
  description?: string | null;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  anchorType: LitterCareTaskAnchorType;
  offsetDays: number;
  species: "dog" | "cat";
  breed?: string | null;
  sortOrder: number;
};

export type CreateLitterCareTaskTemplateInput = LitterCareTaskTemplateValues & {
  organizationId: string;
  clientCommandId: string;
};

export type UpdateLitterCareTaskTemplateInput = LitterCareTaskTemplateValues & {
  templateId: string;
  clientCommandId: string;
  expectedRevision: number;
};

export type SetLitterCareTaskTemplateActiveInput = {
  templateId: string;
  clientCommandId: string;
  expectedRevision: number;
  isActive: boolean;
};

export type LitterCareTaskTemplateMutationResult =
  | {
      outcome: "success";
      templateId: string;
      revision: number;
      isActive: boolean;
      replayed: boolean;
    }
  | ErrorResult;

export type ListLitterCareTasksForLitterResult =
  | { outcome: "success"; role: OrganizationRole; tasks: LitterCareTaskSummary[] }
  | ErrorResult;

export type PlanLitterCareTaskGenerationResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      litterId: string;
      entries: LitterCareTaskGenerationPlanEntry[];
      readyPlan: LitterCareTaskGenerationReadyPlanItem[];
    }
  | ErrorResult;

export type GenerateLitterCareTasksFromPlanResult =
  | {
      outcome: "success";
      litterId: string;
      createdCount: number;
      alreadyGeneratedCount: number;
      tasks: LitterCareTaskGenerationTaskResult[];
      replayed: boolean;
    }
  | ErrorResult;

export type CreateLitterCareTaskInput = {
  litterId: string;
  clientCommandId: string;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  title: string;
  description?: string | null;
  plannedFor: string;
};

export type ResolveLitterCareTaskInput = {
  taskId: string;
  clientCommandId: string;
  resolutionStatus: LitterCareTaskResolutionStatus;
  resolvedAt: string;
  timezoneName: string;
  resolutionNote?: string | null;
};

export type CreateLitterCareTaskResult =
  | { outcome: "success"; taskId: string; litterId: string; status: "planned"; replayed: boolean }
  | ErrorResult;

export type ResolveLitterCareTaskResult =
  | {
      outcome: "success";
      taskId: string;
      litterId: string;
      status: LitterCareTaskResolutionStatus;
      replayed: boolean;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIBRARY_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const GENERATABLE_LITTER_STATUSES = [
  "mating_done",
  "pregnancy_unconfirmed",
  "pregnancy_confirmed",
  "birth_expected",
  "birth_in_progress",
  "born",
  "puppies_created",
  "choice_period",
  "ready_to_leave",
] as const;

function failure(
  code: LitterCareTaskServiceErrorCode,
  message: string,
): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

function invalidInput() {
  return failure("invalid_input", "Les informations transmises sont invalides.");
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return failure(
    "database_error",
    "Une erreur technique empêche momentanément cette opération.",
  );
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeCivilDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

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

function addCivilDays(value: string, offsetDays: number) {
  const civilDate = normalizeCivilDate(value);
  if (!civilDate || !isPostgresInteger(offsetDays)) return null;

  const [year, month, day] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  if (Number.isNaN(date.getTime())) return null;

  const result = [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return normalizeCivilDate(result);
}

function normalizeTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeTimezone(value: unknown) {
  if (typeof value !== "string") return null;
  const timezoneName = value.trim();
  if (!timezoneName || timezoneName.length > 255) return null;

  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezoneName });
    return timezoneName;
  } catch {
    return null;
  }
}

function normalizeRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : undefined;
}

function normalizeOptionalNonEmptyText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function isRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

function isGeneratableLitterStatus(value: string) {
  return GENERATABLE_LITTER_STATUSES.includes(
    value as (typeof GENERATABLE_LITTER_STATUSES)[number],
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

function isAnchorType(value: unknown): value is LitterCareTaskAnchorType {
  return (
    typeof value === "string" &&
    LITTER_CARE_TASK_ANCHOR_TYPES.includes(value as LitterCareTaskAnchorType)
  );
}

function isSpecies(value: unknown): value is "dog" | "cat" {
  return value === "dog" || value === "cat";
}

function isPostgresInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= POSTGRES_INTEGER_MIN &&
    value <= POSTGRES_INTEGER_MAX
  );
}

function isPositivePostgresInteger(value: unknown): value is number {
  return isPostgresInteger(value) && value > 0;
}

function isResolutionStatus(
  value: unknown,
): value is LitterCareTaskResolutionStatus {
  return (
    typeof value === "string" &&
    LITTER_CARE_TASK_RESOLUTION_STATUSES.includes(
      value as LitterCareTaskResolutionStatus,
    )
  );
}

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
}

async function authorizeLitterRead(supabase: Supabase, rawLitterId: unknown) {
  const litterId = normalizeUuid(rawLitterId);
  if (!litterId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const litter = await supabase
    .from("litters")
    .select(
      "id, organization_id, species, breed, status, mating_date, estimated_ovulation_date, expected_birth_date, actual_birth_date",
    )
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();
  if (litter.error) return databaseFailure("litter_care_tasks_litter_read_failed", litter.error);
  if (!litter.data) return failure("not_found", "La portée demandée est introuvable.");

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", litter.data.organization_id)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error) {
    return databaseFailure("litter_care_tasks_membership_read_failed", membership.error);
  }
  if (!membership.data || !isRole(membership.data.role)) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  return { litter: litter.data, role: membership.data.role };
}

async function authorizeOrganizationRead(
  supabase: Supabase,
  rawOrganizationId: unknown,
) {
  const organizationId = normalizeUuid(rawOrganizationId);
  if (!organizationId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error) {
    return databaseFailure(
      "litter_care_task_templates_organization_membership_read_failed",
      membership.error,
    );
  }
  if (!membership.data || !isRole(membership.data.role)) {
    return failure("not_found", "L’organisation demandée est introuvable.");
  }

  return { organizationId, role: membership.data.role };
}

function createFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure("forbidden", "Vous n’avez pas les droits nécessaires pour cette opération.");
    case "litter_not_found":
      return failure("not_found", "La portée demandée est introuvable.");
    case "litter_not_open":
      return failure("invalid_litter", "Cette portée ne permet pas cette tâche.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

function resolutionFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure("forbidden", "Vous n’avez pas les droits nécessaires pour cette opération.");
    case "task_not_found":
      return failure("not_found", "La tâche demandée est introuvable.");
    case "task_not_planned":
      return failure("not_planned", "Cette tâche ne peut plus être résolue.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

function templateMutationFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure(
        "forbidden",
        "Vous n’avez pas les droits nécessaires pour cette opération.",
      );
    case "organization_not_found":
    case "template_not_found":
      return failure("not_found", "Le modèle demandé est introuvable.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    case "stale_revision":
      return failure(
        "stale_revision",
        "Le modèle a été modifié depuis votre dernière lecture.",
      );
    default:
      return invalidInput();
  }
}

function generationFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure(
        "forbidden",
        "Vous n’avez pas les droits nécessaires pour cette opération.",
      );
    case "litter_not_found":
      return failure("not_found", "La portée demandée est introuvable.");
    case "invalid_litter":
    case "litter_not_open":
      return failure(
        "invalid_litter",
        "Cette portée ne permet pas de générer ces tâches.",
      );
    case "stale_plan":
      return failure(
        "stale_plan",
        "Le plan a changé et doit être préparé à nouveau.",
      );
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

function libraryImportFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure(
        "forbidden",
        "Vous n’avez pas les droits nécessaires pour cette opération.",
      );
    case "organization_not_found":
      return failure("not_found", "L’organisation demandée est introuvable.");
    case "selection_unavailable":
      return failure("not_found", "La sélection de modèles est indisponible.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

function normalizeLibrarySelection(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    return null;
  }

  const normalized: LitterCareTaskLibrarySelection[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      typeof record.code !== "string" ||
      record.code.length < 1 ||
      record.code.length > 100 ||
      !LIBRARY_CODE_PATTERN.test(record.code) ||
      !isPositivePostgresInteger(record.version)
    ) {
      return null;
    }

    const key = `${record.code}:${record.version}`;
    if (seen.has(key)) return null;
    seen.add(key);
    normalized.push({ code: record.code, version: record.version });
  }

  return normalized;
}

function mapLibraryImportResults(value: Json) {
  if (!Array.isArray(value)) return null;

  const templates: LitterCareTaskLibraryImportItemResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const templateId = normalizeUuid(item.templateId);
    if (
      typeof item.code !== "string" ||
      item.code.length < 1 ||
      item.code.length > 100 ||
      !LIBRARY_CODE_PATTERN.test(item.code) ||
      !isPositivePostgresInteger(item.version) ||
      !templateId ||
      (item.state !== "imported" && item.state !== "already_imported")
    ) {
      return null;
    }

    templates.push({
      code: item.code,
      version: item.version,
      templateId,
      state: item.state,
    });
  }

  return templates;
}

function normalizeGenerationPlan(value: unknown) {
  if (!Array.isArray(value)) return null;

  const normalized: LitterCareTaskGenerationReadyPlanItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).length !== 5 ||
      !normalizeUuid(record.templateId) ||
      !isPositivePostgresInteger(record.revision) ||
      !isAnchorType(record.anchorType) ||
      !normalizeCivilDate(record.anchorDate) ||
      !normalizeCivilDate(record.plannedFor)
    ) {
      return null;
    }

    normalized.push({
      templateId: normalizeUuid(record.templateId)!,
      revision: record.revision,
      anchorType: record.anchorType,
      anchorDate: normalizeCivilDate(record.anchorDate)!,
      plannedFor: normalizeCivilDate(record.plannedFor)!,
    });
  }

  return normalized;
}

function mapGenerationTaskResults(value: Json) {
  if (!Array.isArray(value)) return null;

  const tasks: LitterCareTaskGenerationTaskResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const templateId = normalizeUuid(item.templateId);
    const taskId = normalizeUuid(item.taskId);
    if (
      !templateId ||
      !taskId ||
      (item.state !== "created" && item.state !== "already_generated")
    ) {
      return null;
    }
    tasks.push({ templateId, taskId, state: item.state });
  }

  return tasks;
}

function mapTemplate(
  row: Database["public"]["Tables"]["litter_care_task_templates"]["Row"],
): LitterCareTaskTemplateSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as LitterCareTaskCategory,
    targetScope: row.target_scope as LitterCareTaskTargetScope,
    anchorType: row.anchor_type as LitterCareTaskAnchorType,
    offsetDays: row.offset_days,
    species: row.species as "dog" | "cat",
    breed: row.breed,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    revision: row.revision,
    libraryTemplateCode: row.library_template_code,
    libraryTemplateVersion: row.library_template_version,
  };
}

function mapLibraryPack(
  row: Database["public"]["Tables"]["litter_care_task_library_packs"]["Row"],
): LitterCareTaskLibraryPackSummary {
  return {
    code: row.code,
    title: row.title,
    description: row.description,
    species: row.species as "dog" | "cat",
    sortOrder: row.sort_order,
  };
}

function normalizeTemplateValues(input: LitterCareTaskTemplateValues) {
  const title = normalizeRequiredText(input.title, 255);
  const description = normalizeOptionalText(input.description, 5000);
  const breed = normalizeOptionalNonEmptyText(input.breed, 255);

  if (
    !title ||
    description === undefined ||
    breed === undefined ||
    !isCategory(input.category) ||
    !isTargetScope(input.targetScope) ||
    !isAnchorType(input.anchorType) ||
    !isPostgresInteger(input.offsetDays) ||
    (input.anchorType === "offspring_age" && input.offsetDays < 0) ||
    !isSpecies(input.species) ||
    !isPostgresInteger(input.sortOrder)
  ) {
    return null;
  }

  return {
    title,
    description,
    category: input.category,
    targetScope: input.targetScope,
    anchorType: input.anchorType,
    offsetDays: input.offsetDays,
    species: input.species,
    breed,
    sortOrder: input.sortOrder,
  };
}

function mapTemplateMutationResult(
  result:
    | {
        outcome: string;
        template_id: string | null;
        revision: number | null;
        is_active: boolean | null;
        replayed: boolean | null;
        reason: string | null;
      }
    | undefined,
): LitterCareTaskTemplateMutationResult {
  const templateId = normalizeUuid(result?.template_id);
  if (
    !result ||
    result.outcome !== "success" ||
    !templateId ||
    !isPositivePostgresInteger(result.revision) ||
    typeof result.is_active !== "boolean"
  ) {
    return templateMutationFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    templateId,
    revision: result.revision,
    isActive: result.is_active,
    replayed: result.replayed === true,
  };
}

function mapTask(
  row: Database["public"]["Tables"]["litter_care_tasks"]["Row"],
): LitterCareTaskSummary {
  return {
    id: row.id,
    litterId: row.litter_id,
    source: row.source as LitterCareTaskSummary["source"],
    organizationTemplateId: row.organization_template_id,
    systemTemplateCode: row.system_template_code,
    occurrenceNo: row.occurrence_no,
    category: row.category as LitterCareTaskCategory,
    targetScope: row.target_scope as LitterCareTaskTargetScope,
    title: row.title,
    description: row.description,
    anchorType: row.anchor_type as LitterCareTaskAnchorType | null,
    anchorDate: row.anchor_date,
    offsetDays: row.offset_days,
    plannedFor: row.planned_for,
    status: row.status as LitterCareTaskSummary["status"],
    resolvedAt: row.resolved_at,
    resolvedTimezoneName: row.resolved_timezone_name,
    resolvedBy: row.resolved_by,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
  };
}

function litterAnchorDate(
  litter: Pick<
    Database["public"]["Tables"]["litters"]["Row"],
    | "mating_date"
    | "estimated_ovulation_date"
    | "expected_birth_date"
    | "actual_birth_date"
  >,
  anchorType: LitterCareTaskAnchorType,
) {
  switch (anchorType) {
    case "first_mating":
      return litter.mating_date;
    case "estimated_ovulation":
      return litter.estimated_ovulation_date;
    case "expected_birth":
      return litter.expected_birth_date;
    case "actual_birth":
    case "offspring_age":
      return litter.actual_birth_date;
  }
}

function sameBreed(templateBreed: string | null, litterBreed: string) {
  return (
    templateBreed === null ||
    templateBreed.trim().toLowerCase() === litterBreed.trim().toLowerCase()
  );
}

export async function planLitterCareTaskGenerationCore(
  input: PlanLitterCareTaskGenerationInput,
  supabase: Supabase,
): Promise<PlanLitterCareTaskGenerationResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  if (!isGeneratableLitterStatus(authorization.litter.status)) {
    return failure(
      "invalid_litter",
      "Cette portée ne permet pas de générer ces tâches.",
    );
  }

  const [templates, generatedTasks] = await Promise.all([
    supabase
      .from("litter_care_task_templates")
      .select("*")
      .eq("organization_id", authorization.litter.organization_id)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("litter_care_tasks")
      .select("organization_template_id")
      .eq("organization_id", authorization.litter.organization_id)
      .eq("litter_id", authorization.litter.id)
      .eq("occurrence_no", 1)
      .not("organization_template_id", "is", null),
  ]);

  if (templates.error) {
    return databaseFailure(
      "litter_care_task_generation_templates_read_failed",
      templates.error,
    );
  }
  if (generatedTasks.error) {
    return databaseFailure(
      "litter_care_task_generation_existing_tasks_read_failed",
      generatedTasks.error,
    );
  }

  const generatedTemplateIds = new Set(
    (generatedTasks.data ?? []).flatMap((task) =>
      task.organization_template_id ? [task.organization_template_id] : [],
    ),
  );
  const entries: LitterCareTaskGenerationPlanEntry[] = [];

  for (const row of templates.data ?? []) {
    const template = mapTemplate(row);
    let state: LitterCareTaskGenerationState;
    let readyPlan: LitterCareTaskGenerationReadyPlanItem | null = null;

    if (generatedTemplateIds.has(template.id)) {
      state = "already_generated";
    } else if (!template.isActive) {
      state = "inactive";
    } else if (template.species !== authorization.litter.species) {
      state = "species_mismatch";
    } else if (!sameBreed(template.breed, authorization.litter.breed)) {
      state = "breed_mismatch";
    } else {
      const anchorDate = litterAnchorDate(
        authorization.litter,
        template.anchorType,
      );
      if (!anchorDate) {
        state = "missing_anchor";
      } else {
        const plannedFor = addCivilDays(anchorDate, template.offsetDays);
        if (!plannedFor) {
          return databaseFailure(
            "litter_care_task_generation_planned_date_out_of_range",
            { litterId: authorization.litter.id, templateId: template.id },
          );
        }
        state = "ready";
        readyPlan = {
          templateId: template.id,
          revision: template.revision,
          anchorType: template.anchorType,
          anchorDate,
          plannedFor,
        };
      }
    }

    entries.push({ template, state, readyPlan });
  }

  return {
    outcome: "success",
    role: authorization.role,
    litterId: authorization.litter.id,
    entries,
    readyPlan: entries.flatMap((entry) =>
      entry.readyPlan ? [entry.readyPlan] : [],
    ),
  };
}

export async function generateLitterCareTasksFromPlanCore(
  input: GenerateLitterCareTasksFromPlanInput,
  supabase: Supabase,
): Promise<GenerateLitterCareTasksFromPlanResult> {
  const litterId = normalizeUuid(input.litterId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const plan = normalizeGenerationPlan(input.plan);
  if (!litterId || !clientCommandId || !plan) return invalidInput();

  const generated = await supabase.rpc("generate_litter_care_tasks_from_plan", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_plan: plan,
  });
  if (generated.error) {
    return databaseFailure("litter_care_task_generation_failed", generated.error);
  }

  const row = generated.data?.[0];
  if (!row || row.outcome !== "success") {
    return generationFailure(row?.reason ?? null);
  }

  const resultLitterId = normalizeUuid(row.litter_id);
  const tasks = mapGenerationTaskResults(row.result);
  if (
    !resultLitterId ||
    !tasks ||
    !isPostgresInteger(row.created_count) ||
    row.created_count < 0 ||
    !isPostgresInteger(row.already_generated_count) ||
    row.already_generated_count < 0 ||
    tasks.filter((task) => task.state === "created").length !==
      row.created_count ||
    tasks.filter((task) => task.state === "already_generated").length !==
      row.already_generated_count
  ) {
    return databaseFailure("litter_care_task_generation_invalid_result", row);
  }

  return {
    outcome: "success",
    litterId: resultLitterId,
    createdCount: row.created_count,
    alreadyGeneratedCount: row.already_generated_count,
    tasks,
    replayed: row.replayed === true,
  };
}

export async function listLitterCareTaskTemplatesCore(
  input: ListLitterCareTaskTemplatesInput,
  supabase: Supabase,
): Promise<ListLitterCareTaskTemplatesResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  const templates = await supabase
    .from("litter_care_task_templates")
    .select("*")
    .eq("organization_id", authorization.litter.organization_id)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (templates.error) {
    return databaseFailure("litter_care_task_templates_list_failed", templates.error);
  }

  return {
    outcome: "success",
    role: authorization.role,
    templates: (templates.data ?? []).map(mapTemplate),
  };
}

export async function listLitterCareTaskTemplatesForOrganizationCore(
  input: ListLitterCareTaskTemplatesForOrganizationInput,
  supabase: Supabase,
): Promise<ListLitterCareTaskTemplatesForOrganizationResult> {
  const authorization = await authorizeOrganizationRead(
    supabase,
    input.organizationId,
  );
  if ("outcome" in authorization) return authorization;

  const templates = await supabase
    .from("litter_care_task_templates")
    .select("*")
    .eq("organization_id", authorization.organizationId)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (templates.error) {
    return databaseFailure(
      "litter_care_task_templates_organization_list_failed",
      templates.error,
    );
  }

  return {
    outcome: "success",
    role: authorization.role,
    templates: (templates.data ?? []).map(mapTemplate),
  };
}

export async function listLitterCareTaskLibraryCore(
  input: ListLitterCareTaskLibraryInput,
  supabase: Supabase,
): Promise<ListLitterCareTaskLibraryResult> {
  const authorization = await authorizeOrganizationRead(
    supabase,
    input.organizationId,
  );
  if ("outcome" in authorization) return authorization;

  const [packs, libraryTemplates, organizationTemplates] = await Promise.all([
    supabase
      .from("litter_care_task_library_packs")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("litter_care_task_library_templates")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true })
      .order("version", { ascending: false }),
    supabase
      .from("litter_care_task_templates")
      .select(
        "id, library_template_code, library_template_version, is_active",
      )
      .eq("organization_id", authorization.organizationId)
      .not("library_template_code", "is", null)
      .order("library_template_version", { ascending: false }),
  ]);

  if (packs.error) {
    return databaseFailure("litter_care_task_library_packs_list_failed", packs.error);
  }
  if (libraryTemplates.error) {
    return databaseFailure(
      "litter_care_task_library_templates_list_failed",
      libraryTemplates.error,
    );
  }
  if (organizationTemplates.error) {
    return databaseFailure(
      "litter_care_task_library_imports_list_failed",
      organizationTemplates.error,
    );
  }

  const mappedPacks = (packs.data ?? []).map(mapLibraryPack);
  const availablePackCodes = new Set(mappedPacks.map((pack) => pack.code));
  const exactImports = new Map<
    string,
    LitterCareTaskLibraryImportedVersionSummary
  >();
  const latestImports = new Map<
    string,
    LitterCareTaskLibraryImportedVersionSummary
  >();

  for (const imported of organizationTemplates.data ?? []) {
    if (
      !imported.library_template_code ||
      !isPositivePostgresInteger(imported.library_template_version)
    ) {
      continue;
    }

    const summary = {
      version: imported.library_template_version,
      organizationTemplateId: imported.id,
      isActive: imported.is_active,
    };
    exactImports.set(
      `${imported.library_template_code}:${imported.library_template_version}`,
      summary,
    );
    const latest = latestImports.get(imported.library_template_code);
    if (!latest || summary.version > latest.version) {
      latestImports.set(imported.library_template_code, summary);
    }
  }

  const packOrder = new Map(
    mappedPacks.map((pack, index) => [pack.code, index]),
  );
  const templates = (libraryTemplates.data ?? [])
    .filter((template) => availablePackCodes.has(template.pack_code))
    .map((template): LitterCareTaskLibraryTemplateSummary => {
      const exactImport = exactImports.get(`${template.code}:${template.version}`);
      return {
        code: template.code,
        version: template.version,
        packCode: template.pack_code,
        title: template.title,
        description: template.description,
        category: template.category as LitterCareTaskCategory,
        targetScope: template.target_scope as LitterCareTaskTargetScope,
        anchorType: template.anchor_type as LitterCareTaskAnchorType,
        offsetDays: template.offset_days,
        species: template.species as "dog" | "cat",
        breed: template.breed,
        sortOrder: template.sort_order,
        isImported: Boolean(exactImport),
        organizationTemplateId: exactImport?.organizationTemplateId ?? null,
        organizationTemplateIsActive: exactImport?.isActive ?? null,
        latestImportedVersion: latestImports.get(template.code) ?? null,
      };
    });
  templates.sort(
    (left, right) =>
      (packOrder.get(left.packCode) ?? Number.MAX_SAFE_INTEGER) -
        (packOrder.get(right.packCode) ?? Number.MAX_SAFE_INTEGER) ||
      left.sortOrder - right.sortOrder ||
      left.code.localeCompare(right.code) ||
      right.version - left.version,
  );

  return {
    outcome: "success",
    role: authorization.role,
    packs: mappedPacks,
    templates,
  };
}

export async function importLitterCareTaskLibraryTemplatesCore(
  input: ImportLitterCareTaskLibraryTemplatesInput,
  supabase: Supabase,
): Promise<ImportLitterCareTaskLibraryTemplatesResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const selection = normalizeLibrarySelection(input.selection);
  if (
    !organizationId ||
    !clientCommandId ||
    !selection ||
    typeof input.isActive !== "boolean"
  ) {
    return invalidInput();
  }

  if (!(await authenticatedUserId(supabase))) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const imported = await supabase.rpc(
    "import_litter_care_task_library_templates",
    {
      p_organization_id: organizationId,
      p_client_command_id: clientCommandId,
      p_selection: selection,
      p_is_active: input.isActive,
    },
  );
  if (imported.error) {
    return databaseFailure("litter_care_task_library_import_failed", imported.error);
  }

  const row = imported.data?.[0];
  if (!row || row.outcome !== "success") {
    return libraryImportFailure(row?.reason ?? null);
  }

  const templates = mapLibraryImportResults(row.result);
  if (
    !templates ||
    !isPostgresInteger(row.imported_count) ||
    row.imported_count < 0 ||
    !isPostgresInteger(row.already_imported_count) ||
    row.already_imported_count < 0 ||
    templates.filter((template) => template.state === "imported").length !==
      row.imported_count ||
    templates.filter((template) => template.state === "already_imported")
      .length !== row.already_imported_count
  ) {
    return databaseFailure("litter_care_task_library_import_invalid_result", row);
  }

  return {
    outcome: "success",
    importedCount: row.imported_count,
    alreadyImportedCount: row.already_imported_count,
    templates,
    replayed: row.replayed === true,
  };
}

export async function createLitterCareTaskTemplateCore(
  input: CreateLitterCareTaskTemplateInput,
  supabase: Supabase,
): Promise<LitterCareTaskTemplateMutationResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const values = normalizeTemplateValues(input);
  if (!organizationId || !clientCommandId || !values) return invalidInput();

  const created = await supabase.rpc("create_litter_care_task_template", {
    p_organization_id: organizationId,
    p_client_command_id: clientCommandId,
    p_title: values.title,
    p_description: values.description,
    p_category: values.category,
    p_target_scope: values.targetScope,
    p_anchor_type: values.anchorType,
    p_offset_days: values.offsetDays,
    p_species: values.species,
    p_breed: values.breed,
    p_sort_order: values.sortOrder,
  });
  if (created.error) {
    return databaseFailure("litter_care_task_template_create_failed", created.error);
  }

  return mapTemplateMutationResult(created.data?.[0]);
}

export async function updateLitterCareTaskTemplateCore(
  input: UpdateLitterCareTaskTemplateInput,
  supabase: Supabase,
): Promise<LitterCareTaskTemplateMutationResult> {
  const templateId = normalizeUuid(input.templateId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const values = normalizeTemplateValues(input);
  if (
    !templateId ||
    !clientCommandId ||
    !isPositivePostgresInteger(input.expectedRevision) ||
    !values
  ) {
    return invalidInput();
  }

  const updated = await supabase.rpc("update_litter_care_task_template", {
    p_template_id: templateId,
    p_client_command_id: clientCommandId,
    p_expected_revision: input.expectedRevision,
    p_title: values.title,
    p_description: values.description,
    p_category: values.category,
    p_target_scope: values.targetScope,
    p_anchor_type: values.anchorType,
    p_offset_days: values.offsetDays,
    p_species: values.species,
    p_breed: values.breed,
    p_sort_order: values.sortOrder,
  });
  if (updated.error) {
    return databaseFailure("litter_care_task_template_update_failed", updated.error);
  }

  return mapTemplateMutationResult(updated.data?.[0]);
}

export async function setLitterCareTaskTemplateActiveCore(
  input: SetLitterCareTaskTemplateActiveInput,
  supabase: Supabase,
): Promise<LitterCareTaskTemplateMutationResult> {
  const templateId = normalizeUuid(input.templateId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  if (
    !templateId ||
    !clientCommandId ||
    !isPositivePostgresInteger(input.expectedRevision) ||
    typeof input.isActive !== "boolean"
  ) {
    return invalidInput();
  }

  const activated = await supabase.rpc(
    "set_litter_care_task_template_active",
    {
      p_template_id: templateId,
      p_client_command_id: clientCommandId,
      p_expected_revision: input.expectedRevision,
      p_is_active: input.isActive,
    },
  );
  if (activated.error) {
    return databaseFailure(
      "litter_care_task_template_set_active_failed",
      activated.error,
    );
  }

  return mapTemplateMutationResult(activated.data?.[0]);
}

export async function listLitterCareTasksForLitterCore(
  input: ListLitterCareTasksForLitterInput,
  supabase: Supabase,
): Promise<ListLitterCareTasksForLitterResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  const tasks = await supabase
    .from("litter_care_tasks")
    .select("*")
    .eq("organization_id", authorization.litter.organization_id)
    .eq("litter_id", authorization.litter.id);
  if (tasks.error) {
    return databaseFailure("litter_care_tasks_list_failed", tasks.error);
  }

  const mapped = (tasks.data ?? []).map(mapTask);
  mapped.sort((left, right) => {
    if (left.status === "planned" && right.status !== "planned") return -1;
    if (left.status !== "planned" && right.status === "planned") return 1;
    if (left.status === "planned" && right.status === "planned") {
      return (
        left.plannedFor.localeCompare(right.plannedFor) ||
        left.createdAt.localeCompare(right.createdAt)
      );
    }
    return (
      (right.resolvedAt ?? "").localeCompare(left.resolvedAt ?? "") ||
      right.createdAt.localeCompare(left.createdAt)
    );
  });

  return { outcome: "success", role: authorization.role, tasks: mapped };
}

export async function createLitterCareTaskCore(
  input: CreateLitterCareTaskInput,
  supabase: Supabase,
): Promise<CreateLitterCareTaskResult> {
  const litterId = normalizeUuid(input.litterId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const title = normalizeRequiredText(input.title, 255);
  const description = normalizeOptionalText(input.description, 5000);
  const plannedFor = normalizeCivilDate(input.plannedFor);

  if (
    !litterId ||
    !clientCommandId ||
    !title ||
    description === undefined ||
    !plannedFor ||
    !isCategory(input.category) ||
    !isTargetScope(input.targetScope)
  ) {
    return invalidInput();
  }

  const created = await supabase.rpc("create_litter_care_task", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_category: input.category,
    p_target_scope: input.targetScope,
    p_title: title,
    p_description: description ?? "",
    p_planned_for: plannedFor,
  });
  if (created.error) return databaseFailure("litter_care_task_create_failed", created.error);

  const result = created.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.task_id ||
    !result.litter_id ||
    result.status !== "planned"
  ) {
    return createFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    taskId: result.task_id,
    litterId: result.litter_id,
    status: "planned",
    replayed: result.replayed === true,
  };
}

export async function resolveLitterCareTaskCore(
  input: ResolveLitterCareTaskInput,
  supabase: Supabase,
): Promise<ResolveLitterCareTaskResult> {
  const taskId = normalizeUuid(input.taskId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const resolvedAt = normalizeTimestamp(input.resolvedAt);
  const timezoneName = normalizeTimezone(input.timezoneName);
  const resolutionNote = normalizeOptionalText(input.resolutionNote, 5000);

  if (
    !taskId ||
    !clientCommandId ||
    !resolvedAt ||
    !timezoneName ||
    resolutionNote === undefined ||
    !isResolutionStatus(input.resolutionStatus)
  ) {
    return invalidInput();
  }

  const resolved = await supabase.rpc("resolve_litter_care_task", {
    p_task_id: taskId,
    p_client_command_id: clientCommandId,
    p_resolution_status: input.resolutionStatus,
    p_resolved_at: resolvedAt,
    p_timezone_name: timezoneName,
    p_resolution_note: resolutionNote ?? "",
  });
  if (resolved.error) {
    return databaseFailure("litter_care_task_resolve_failed", resolved.error);
  }

  const result = resolved.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.task_id ||
    !result.litter_id ||
    !isResolutionStatus(result.status)
  ) {
    return resolutionFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    taskId: result.task_id,
    litterId: result.litter_id,
    status: result.status,
    replayed: result.replayed === true,
  };
}

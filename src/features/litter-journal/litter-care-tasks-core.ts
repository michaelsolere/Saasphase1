import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

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
  | "conflict"
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

export type ListLitterCareTaskTemplatesInput = { litterId: string };
export type ListLitterCareTasksForLitterInput = { litterId: string };

export type ListLitterCareTaskTemplatesResult =
  | { outcome: "success"; role: OrganizationRole; templates: LitterCareTaskTemplateSummary[] }
  | ErrorResult;

export type ListLitterCareTasksForLitterResult =
  | { outcome: "success"; role: OrganizationRole; tasks: LitterCareTaskSummary[] }
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
const ISO_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

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

function isRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
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
    .select("id, organization_id")
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

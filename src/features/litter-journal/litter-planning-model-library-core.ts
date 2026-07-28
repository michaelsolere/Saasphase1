import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import {
  LITTER_PLANNING_MODEL_ANCHORS,
  LITTER_PLANNING_MODEL_ITEM_KINDS,
  LITTER_PLANNING_MODEL_PRIORITIES,
  LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS,
  LITTER_PLANNING_MODEL_RECURRENCE_KINDS,
  type LitterPlanningModelAnchor,
  type LitterPlanningModelItemKind,
  type LitterPlanningModelPriority,
  type LitterPlanningModelRecurrenceEndKind,
  type LitterPlanningModelRecurrenceKind,
} from "./litter-planning-models-core";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

type LibraryModelRow =
  Database["public"]["Tables"]["litter_planning_model_library_models"]["Row"];
type LibraryItemRow =
  Database["public"]["Tables"]["litter_planning_model_library_items"]["Row"];
type LibraryItemTimeSlotRow =
  Database["public"]["Tables"]["litter_planning_model_library_item_time_slots"]["Row"];

export type LitterPlanningModelLibrarySelection = {
  code: string;
  version: number;
};

export type LitterPlanningModelLibraryItemSummary = {
  libraryTemplateCode: string;
  libraryTemplateVersion: number;
  itemKind: LitterPlanningModelItemKind;
  priority: LitterPlanningModelPriority;
  anchorType: LitterPlanningModelAnchor;
  pointOffsetDays?: number;
  pointLocalTime?: string | null;
  windowStartsOffsetDays?: number;
  windowStartsLocalTime?: string | null;
  windowEndsOffsetDays?: number;
  windowEndsLocalTime?: string | null;
  recurrenceKind?: LitterPlanningModelRecurrenceKind;
  recurrenceIntervalDays?: number;
  recurrenceStartsOffsetDays?: number;
  recurrenceEndKind?: LitterPlanningModelRecurrenceEndKind;
  recurrenceEndsOffsetDays?: number;
  recurrenceDayCount?: number;
  initialMaterializationHorizonDays?: number;
  absoluteMaxOccurrences?: number;
  timeSlots: string[];
  displayOrder: number;
  isRequired: boolean;
  isSelectedByDefault: boolean;
};

export type LitterPlanningModelLibraryImportedVersionSummary = {
  version: number;
  organizationModelId: string;
  isActive: boolean;
};

export type LitterPlanningModelLibraryModelSummary = {
  code: string;
  version: number;
  familyCode: string;
  variantCode: string;
  title: string;
  description: string | null;
  species: "dog" | "cat";
  breed: string | null;
  sortOrder: number;
  itemCount: number;
  items: LitterPlanningModelLibraryItemSummary[];
  isImported: boolean;
  organizationModelId: string | null;
  organizationModelIsActive: boolean | null;
  latestImportedVersion: LitterPlanningModelLibraryImportedVersionSummary | null;
};

export type LitterPlanningModelLibraryModelImportItemResult =
  LitterPlanningModelLibrarySelection & {
    modelId: string;
    state: "imported" | "already_imported";
  };

export type LitterPlanningModelLibraryElementaryImportItemResult = {
  code: string;
  version: number;
  templateId: string;
  state: "imported" | "already_imported";
};

export type LitterPlanningModelLibraryServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "database_error";

export type LitterPlanningModelLibraryServiceError = {
  code: LitterPlanningModelLibraryServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: LitterPlanningModelLibraryServiceError;
};

export type ListLitterPlanningModelLibraryInput = {
  organizationId: string;
};

export type ImportLitterPlanningModelLibraryModelsInput = {
  organizationId: string;
  clientCommandId: string;
  selection: LitterPlanningModelLibrarySelection[];
  isActive: boolean;
};

export type ListLitterPlanningModelLibraryResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      models: LitterPlanningModelLibraryModelSummary[];
    }
  | ErrorResult;

export type ImportLitterPlanningModelLibraryModelsResult =
  | {
      outcome: "success";
      importedCount: number;
      alreadyImportedCount: number;
      elementaryImportedCount: number;
      elementaryAlreadyImportedCount: number;
      models: LitterPlanningModelLibraryModelImportItemResult[];
      elementaryTemplates: LitterPlanningModelLibraryElementaryImportItemResult[];
      replayed: boolean;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIBRARY_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

function failure(
  code: LitterPlanningModelLibraryServiceErrorCode,
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

function isRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

function isSpecies(value: unknown): value is "dog" | "cat" {
  return value === "dog" || value === "cat";
}

function isItemKind(value: unknown): value is LitterPlanningModelItemKind {
  return (
    typeof value === "string" &&
    LITTER_PLANNING_MODEL_ITEM_KINDS.includes(value as LitterPlanningModelItemKind)
  );
}

function isPriority(value: unknown): value is LitterPlanningModelPriority {
  return (
    typeof value === "string" &&
    LITTER_PLANNING_MODEL_PRIORITIES.includes(value as LitterPlanningModelPriority)
  );
}

function isAnchorType(value: unknown): value is LitterPlanningModelAnchor {
  return (
    typeof value === "string" &&
    LITTER_PLANNING_MODEL_ANCHORS.includes(value as LitterPlanningModelAnchor)
  );
}

function isRecurrenceKind(value: unknown): value is LitterPlanningModelRecurrenceKind {
  return typeof value === "string" && LITTER_PLANNING_MODEL_RECURRENCE_KINDS.includes(value as LitterPlanningModelRecurrenceKind);
}

function isRecurrenceEndKind(value: unknown): value is LitterPlanningModelRecurrenceEndKind {
  return typeof value === "string" && LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS.includes(value as LitterPlanningModelRecurrenceEndKind);
}

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function normalizeSlots(rows: LibraryItemTimeSlotRow[] | undefined) {
  if (!rows || rows.length < 1 || rows.length > 8) return null;
  const slots: string[] = [];
  const times = new Set<string>();
  let previousNo = 0;
  for (const row of rows) {
    if (!isPositivePostgresInteger(row.slot_no) || row.slot_no <= previousNo || typeof row.local_time !== "string" || !LOCAL_TIME.test(row.local_time) || times.has(row.local_time)) return null;
    previousNo = row.slot_no;
    times.add(row.local_time);
    slots.push(row.local_time);
  }
  return slots;
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

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
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
      "litter_planning_model_library_organization_membership_read_failed",
      membership.error,
    );
  }
  if (!membership.data || !isRole(membership.data.role)) {
    return failure("not_found", "L’organisation demandée est introuvable.");
  }

  return { organizationId, role: membership.data.role };
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

  const normalized: LitterPlanningModelLibrarySelection[] = [];
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

function mapModelLibraryImportResults(value: Json) {
  if (!Array.isArray(value)) return null;

  const models: LitterPlanningModelLibraryModelImportItemResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const modelId = normalizeUuid(record.modelId);
    if (
      typeof record.code !== "string" ||
      record.code.length < 1 ||
      record.code.length > 100 ||
      !LIBRARY_CODE_PATTERN.test(record.code) ||
      !isPositivePostgresInteger(record.version) ||
      !modelId ||
      (record.state !== "imported" && record.state !== "already_imported")
    ) {
      return null;
    }

    models.push({
      code: record.code,
      version: record.version,
      modelId,
      state: record.state,
    });
  }

  return models;
}

function mapElementaryLibraryImportResults(value: Json) {
  if (!Array.isArray(value)) return null;

  const elementaryTemplates: LitterPlanningModelLibraryElementaryImportItemResult[] =
    [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const templateId = normalizeUuid(record.templateId);
    if (
      typeof record.code !== "string" ||
      record.code.length < 1 ||
      record.code.length > 100 ||
      !LIBRARY_CODE_PATTERN.test(record.code) ||
      !isPositivePostgresInteger(record.version) ||
      !templateId ||
      (record.state !== "imported" && record.state !== "already_imported")
    ) {
      return null;
    }

    elementaryTemplates.push({
      code: record.code,
      version: record.version,
      templateId,
      state: record.state,
    });
  }

  return elementaryTemplates;
}

function mapLibraryItem(
  row: LibraryItemRow,
  slotRows?: LibraryItemTimeSlotRow[],
): LitterPlanningModelLibraryItemSummary | null {
  if (
    typeof row.library_template_code !== "string" ||
    row.library_template_code.length < 1 ||
    row.library_template_code.length > 100 ||
    !LIBRARY_CODE_PATTERN.test(row.library_template_code) ||
    !isPositivePostgresInteger(row.library_template_version) ||
    !isItemKind(row.item_kind) ||
    !isPriority(row.priority) ||
    !isAnchorType(row.anchor_type) ||
    !isPostgresInteger(row.display_order) ||
    row.display_order < 0 ||
    typeof row.is_required !== "boolean" ||
    typeof row.is_selected_by_default !== "boolean" ||
    (row.is_required && !row.is_selected_by_default)
  ) {
    return null;
  }

  if (row.item_kind === "recurring_task") {
    const slots = normalizeSlots(slotRows);
    if (
      !slots ||
      row.point_offset_days !== null || row.point_local_time !== null ||
      row.window_starts_offset_days !== null || row.window_starts_local_time !== null ||
      row.window_ends_offset_days !== null || row.window_ends_local_time !== null ||
      !isRecurrenceKind(row.recurrence_kind) ||
      !isPostgresInteger(row.recurrence_interval_days) || row.recurrence_interval_days < 1 || row.recurrence_interval_days > 365 ||
      !isPostgresInteger(row.recurrence_starts_offset_days) ||
      !isRecurrenceEndKind(row.recurrence_end_kind) ||
      !isPostgresInteger(row.initial_materialization_horizon_days) || row.initial_materialization_horizon_days < 1 || row.initial_materialization_horizon_days > 365 ||
      !isPostgresInteger(row.absolute_max_occurrences) || row.absolute_max_occurrences < 1 || row.absolute_max_occurrences > 500 ||
      (row.recurrence_end_kind === "fixed_end_offset" && (!isPostgresInteger(row.recurrence_ends_offset_days) || row.recurrence_day_count !== null || row.recurrence_ends_offset_days < row.recurrence_starts_offset_days)) ||
      (row.recurrence_end_kind === "fixed_recurrence_day_count" && (row.recurrence_ends_offset_days !== null || !isPostgresInteger(row.recurrence_day_count) || row.recurrence_day_count < 1 || row.recurrence_day_count > 500)) ||
      (row.recurrence_end_kind === "actual_birth" && (row.recurrence_ends_offset_days !== null || row.recurrence_day_count !== null))
    ) return null;
    return {
      libraryTemplateCode: row.library_template_code, libraryTemplateVersion: row.library_template_version,
      itemKind: row.item_kind, priority: row.priority, anchorType: row.anchor_type,
      recurrenceKind: row.recurrence_kind, recurrenceIntervalDays: row.recurrence_interval_days,
      recurrenceStartsOffsetDays: row.recurrence_starts_offset_days, recurrenceEndKind: row.recurrence_end_kind,
      ...(row.recurrence_ends_offset_days === null ? {} : { recurrenceEndsOffsetDays: row.recurrence_ends_offset_days }),
      ...(row.recurrence_day_count === null ? {} : { recurrenceDayCount: row.recurrence_day_count }),
      initialMaterializationHorizonDays: row.initial_materialization_horizon_days,
      absoluteMaxOccurrences: row.absolute_max_occurrences, timeSlots: slots,
      displayOrder: row.display_order, isRequired: row.is_required, isSelectedByDefault: row.is_selected_by_default,
    };
  }

  if ((slotRows?.length ?? 0) > 0 || row.recurrence_kind !== null || row.recurrence_interval_days !== null || row.recurrence_starts_offset_days !== null || row.recurrence_end_kind !== null || row.recurrence_ends_offset_days !== null || row.recurrence_day_count !== null || row.initial_materialization_horizon_days !== null || row.absolute_max_occurrences !== null) return null;

  if (row.item_kind === "window") {
    if (
      row.point_offset_days !== null ||
      row.point_local_time !== null ||
      !isPostgresInteger(row.window_starts_offset_days) ||
      !isPostgresInteger(row.window_ends_offset_days) ||
      (row.window_starts_offset_days as number) >
        (row.window_ends_offset_days as number)
    ) {
      return null;
    }
  } else if (
    !isPostgresInteger(row.point_offset_days) ||
    row.window_starts_offset_days !== null ||
    row.window_starts_local_time !== null ||
    row.window_ends_offset_days !== null ||
    row.window_ends_local_time !== null
  ) {
    return null;
  }

  return {
    libraryTemplateCode: row.library_template_code,
    libraryTemplateVersion: row.library_template_version,
    itemKind: row.item_kind,
    priority: row.priority,
    anchorType: row.anchor_type,
    ...(row.point_offset_days === null
      ? {}
      : { pointOffsetDays: row.point_offset_days }),
    ...(row.point_local_time == null
      ? {}
      : { pointLocalTime: row.point_local_time }),
    ...(row.window_starts_offset_days === null
      ? {}
      : { windowStartsOffsetDays: row.window_starts_offset_days }),
    ...(row.window_starts_local_time == null
      ? {}
      : { windowStartsLocalTime: row.window_starts_local_time }),
    ...(row.window_ends_offset_days === null
      ? {}
      : { windowEndsOffsetDays: row.window_ends_offset_days }),
    ...(row.window_ends_local_time == null
      ? {}
      : { windowEndsLocalTime: row.window_ends_local_time }),
    timeSlots: [],
    displayOrder: row.display_order,
    isRequired: row.is_required,
    isSelectedByDefault: row.is_selected_by_default,
  };
}

function mapLibraryModel(
  row: LibraryModelRow,
  items: LitterPlanningModelLibraryItemSummary[],
  exactImport: LitterPlanningModelLibraryImportedVersionSummary | undefined,
  latestImport: LitterPlanningModelLibraryImportedVersionSummary | undefined,
): LitterPlanningModelLibraryModelSummary | null {
  if (
    typeof row.code !== "string" ||
    row.code.length < 1 ||
    row.code.length > 100 ||
    !LIBRARY_CODE_PATTERN.test(row.code) ||
    !isPositivePostgresInteger(row.version) ||
    typeof row.family_code !== "string" ||
    row.family_code.length < 1 ||
    typeof row.variant_code !== "string" ||
    row.variant_code.length < 1 ||
    typeof row.title !== "string" ||
    !isSpecies(row.species) ||
    !isPostgresInteger(row.sort_order)
  ) {
    return null;
  }

  return {
    code: row.code,
    version: row.version,
    familyCode: row.family_code,
    variantCode: row.variant_code,
    title: row.title,
    description: row.description,
    species: row.species,
    breed: row.breed,
    sortOrder: row.sort_order,
    itemCount: items.length,
    items,
    isImported: Boolean(exactImport),
    organizationModelId: exactImport?.organizationModelId ?? null,
    organizationModelIsActive: exactImport?.isActive ?? null,
    latestImportedVersion: latestImport ?? null,
  };
}

export async function listLitterPlanningModelLibraryCore(
  input: ListLitterPlanningModelLibraryInput,
  supabase: Supabase,
): Promise<ListLitterPlanningModelLibraryResult> {
  const authorization = await authorizeOrganizationRead(
    supabase,
    input.organizationId,
  );
  if ("outcome" in authorization) return authorization;

  const [libraryModels, libraryItems, organizationModels] = await Promise.all([
    supabase
      .from("litter_planning_model_library_models")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true })
      .order("version", { ascending: false }),
    supabase
      .from("litter_planning_model_library_items")
      .select("*")
      .order("display_order", { ascending: true }),
    supabase
      .from("litter_planning_models")
      .select("id, library_model_code, library_model_version, is_active")
      .eq("organization_id", authorization.organizationId)
      .not("library_model_code", "is", null)
      .order("library_model_version", { ascending: false }),
  ]);

  if (libraryModels.error) {
    return databaseFailure(
      "litter_planning_model_library_models_list_failed",
      libraryModels.error,
    );
  }
  if (libraryItems.error) {
    return databaseFailure(
      "litter_planning_model_library_items_list_failed",
      libraryItems.error,
    );
  }
  if (organizationModels.error) {
    return databaseFailure(
      "litter_planning_model_library_imports_list_failed",
      organizationModels.error,
    );
  }

  const itemIds = (libraryItems.data ?? []).map((item) => item.id);
  const librarySlots = itemIds.length === 0
    ? { data: [] as LibraryItemTimeSlotRow[], error: null }
    : await supabase.from("litter_planning_model_library_item_time_slots").select("*").in("library_model_item_id", itemIds).order("slot_no");
  if (librarySlots.error) return databaseFailure("litter_planning_model_library_item_slots_list_failed", librarySlots.error);
  const slotsByItem = new Map<string, LibraryItemTimeSlotRow[]>();
  for (const slot of librarySlots.data ?? []) {
    const bucket = slotsByItem.get(slot.library_model_item_id) ?? [];
    bucket.push(slot);
    slotsByItem.set(slot.library_model_item_id, bucket);
  }

  const availableModelKeys = new Set(
    (libraryModels.data ?? []).map((model) => `${model.code}:${model.version}`),
  );

  const itemsByModel = new Map<string, LitterPlanningModelLibraryItemSummary[]>();
  for (const row of libraryItems.data ?? []) {
    const modelKey = `${row.library_model_code}:${row.library_model_version}`;
    if (!availableModelKeys.has(modelKey)) continue;
    const mapped = mapLibraryItem(row, slotsByItem.get(row.id));
    if (!mapped) {
      return databaseFailure("litter_planning_model_library_item_invalid", row);
    }
    const bucket = itemsByModel.get(modelKey) ?? [];
    bucket.push(mapped);
    itemsByModel.set(modelKey, bucket);
  }

  const exactImports = new Map<
    string,
    LitterPlanningModelLibraryImportedVersionSummary
  >();
  const latestImports = new Map<
    string,
    LitterPlanningModelLibraryImportedVersionSummary
  >();

  for (const imported of organizationModels.data ?? []) {
    if (
      !imported.library_model_code ||
      !isPositivePostgresInteger(imported.library_model_version)
    ) {
      continue;
    }

    const summary = {
      version: imported.library_model_version,
      organizationModelId: imported.id,
      isActive: imported.is_active,
    };
    exactImports.set(
      `${imported.library_model_code}:${imported.library_model_version}`,
      summary,
    );
    const latest = latestImports.get(imported.library_model_code);
    if (!latest || summary.version > latest.version) {
      latestImports.set(imported.library_model_code, summary);
    }
  }

  const models: LitterPlanningModelLibraryModelSummary[] = [];
  for (const row of libraryModels.data ?? []) {
    const modelKey = `${row.code}:${row.version}`;
    const items = itemsByModel.get(modelKey) ?? [];
    const exactImport = exactImports.get(modelKey);
    const mapped = mapLibraryModel(
      row,
      items,
      exactImport,
      latestImports.get(row.code),
    );
    if (!mapped) {
      return databaseFailure("litter_planning_model_library_model_invalid", row);
    }
    models.push(mapped);
  }

  return {
    outcome: "success",
    role: authorization.role,
    models,
  };
}

export async function importLitterPlanningModelLibraryModelsCore(
  input: ImportLitterPlanningModelLibraryModelsInput,
  supabase: Supabase,
): Promise<ImportLitterPlanningModelLibraryModelsResult> {
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
    "import_litter_planning_model_library_models",
    {
      p_organization_id: organizationId,
      p_client_command_id: clientCommandId,
      p_selection: selection,
      p_is_active: input.isActive,
    },
  );
  if (imported.error) {
    return databaseFailure(
      "litter_planning_model_library_import_failed",
      imported.error,
    );
  }

  const row = imported.data?.[0];
  if (!row || row.outcome !== "success") {
    return libraryImportFailure(row?.reason ?? null);
  }

  const models = mapModelLibraryImportResults(row.result);
  const elementaryTemplates = mapElementaryLibraryImportResults(
    row.elementary_result,
  );
  if (
    !models ||
    !elementaryTemplates ||
    !isPostgresInteger(row.imported_count) ||
    row.imported_count < 0 ||
    !isPostgresInteger(row.already_imported_count) ||
    row.already_imported_count < 0 ||
    !isPostgresInteger(row.elementary_imported_count) ||
    row.elementary_imported_count < 0 ||
    !isPostgresInteger(row.elementary_already_imported_count) ||
    row.elementary_already_imported_count < 0 ||
    models.filter((model) => model.state === "imported").length !==
      row.imported_count ||
    models.filter((model) => model.state === "already_imported").length !==
      row.already_imported_count ||
    elementaryTemplates.filter((template) => template.state === "imported")
      .length !== row.elementary_imported_count ||
    elementaryTemplates.filter((template) => template.state === "already_imported")
      .length !== row.elementary_already_imported_count
  ) {
    return databaseFailure(
      "litter_planning_model_library_import_invalid_result",
      row,
    );
  }

  return {
    outcome: "success",
    importedCount: row.imported_count,
    alreadyImportedCount: row.already_imported_count,
    elementaryImportedCount: row.elementary_imported_count,
    elementaryAlreadyImportedCount: row.elementary_already_imported_count,
    models,
    elementaryTemplates,
    replayed: row.replayed === true,
  };
}

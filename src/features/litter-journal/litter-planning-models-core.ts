import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type Role = "owner" | "admin" | "member" | "viewer";
type ModelRow = Database["public"]["Tables"]["litter_planning_models"]["Row"];
type ItemRow = Database["public"]["Tables"]["litter_planning_model_items"]["Row"];

export const LITTER_PLANNING_MODEL_ITEM_KINDS = [
  "milestone",
  "task",
  "window",
  "recurring_task",
] as const;
export const LITTER_PLANNING_MODEL_RECURRENCE_KINDS = ["daily_interval"] as const;
export const LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS = [
  "fixed_end_offset",
  "fixed_recurrence_day_count",
  "actual_birth",
] as const;
export const LITTER_PLANNING_MODEL_PRIORITIES = [
  "normal",
  "important",
  "organization_critical",
] as const;
export const LITTER_PLANNING_MODEL_ANCHORS = [
  "first_mating",
  "estimated_ovulation",
  "expected_birth",
  "actual_birth",
  "offspring_age",
] as const;

export type LitterPlanningModelItemKind =
  (typeof LITTER_PLANNING_MODEL_ITEM_KINDS)[number];
export type LitterPlanningModelPriority =
  (typeof LITTER_PLANNING_MODEL_PRIORITIES)[number];
export type LitterPlanningModelAnchor =
  (typeof LITTER_PLANNING_MODEL_ANCHORS)[number];
export type LitterPlanningModelRecurrenceKind =
  (typeof LITTER_PLANNING_MODEL_RECURRENCE_KINDS)[number];
export type LitterPlanningModelRecurrenceEndKind =
  (typeof LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS)[number];

export type LitterPlanningModelItemInput = {
  organizationTemplateId: string;
  itemKind: LitterPlanningModelItemKind;
  priority: LitterPlanningModelPriority;
  anchorType: LitterPlanningModelAnchor;
  pointOffsetDays?: number;
  pointLocalTime?: string;
  windowStartsOffsetDays?: number;
  windowStartsLocalTime?: string;
  windowEndsOffsetDays?: number;
  windowEndsLocalTime?: string;
  recurrenceKind?: LitterPlanningModelRecurrenceKind;
  recurrenceIntervalDays?: number;
  recurrenceStartsOffsetDays?: number;
  recurrenceEndKind?: LitterPlanningModelRecurrenceEndKind;
  recurrenceEndsOffsetDays?: number;
  recurrenceDayCount?: number;
  initialMaterializationHorizonDays?: number;
  absoluteMaxOccurrences?: number;
  timeSlots?: string[];
  displayOrder: number;
  isRequired: boolean;
  isSelectedByDefault: boolean;
};

export type CreateLitterPlanningModelInput = {
  title: string;
  description?: string | null;
  species?: "dog" | "cat" | null;
  breed?: string | null;
  isActive?: boolean;
  items: LitterPlanningModelItemInput[];
};

export type ReplaceLitterPlanningModelInput = Omit<
  CreateLitterPlanningModelInput,
  "isActive"
>;

export type LitterPlanningModelItem = LitterPlanningModelItemInput & { id: string };
export type LitterPlanningModel = {
  id: string;
  title: string;
  description: string | null;
  species: "dog" | "cat" | null;
  breed: string | null;
  isActive: boolean;
  revision: number;
  libraryModelCode: string | null;
  libraryModelVersion: number | null;
  items: LitterPlanningModelItem[];
};
export type LitterPlanningModelErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "stale_revision"
  | "imported_model_immutable"
  | "conflict"
  | "database_error";
export type LitterPlanningModelResult =
  | {
      outcome: "success";
      modelId: string;
      revision: number;
      isActive: boolean;
      replayed: boolean;
    }
  | { outcome: "error"; error: { code: LitterPlanningModelErrorCode; message: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function failure(code: LitterPlanningModelErrorCode, message: string): LitterPlanningModelResult {
  return { outcome: "error", error: { code, message } };
}

function normalizeUuid(value: unknown) {
  return typeof value === "string" && UUID.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function normalizeText(value: unknown, maxLength: number, required = false) {
  if (value === undefined || value === null || value === "") return required ? null : null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return (!required || normalized.length > 0) && normalized.length <= maxLength
    ? normalized || null
    : undefined;
}

function normalizeLocalTime(value: unknown) {
  if (value === undefined) return undefined;
  return typeof value === "string" && LOCAL_TIME.test(value.trim())
    ? value.trim()
    : null;
}

function normalizeItem(value: unknown): LitterPlanningModelItemInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const organizationTemplateId = normalizeUuid(item.organizationTemplateId);
  const pointLocalTime = normalizeLocalTime(item.pointLocalTime);
  const windowStartsLocalTime = normalizeLocalTime(item.windowStartsLocalTime);
  const windowEndsLocalTime = normalizeLocalTime(item.windowEndsLocalTime);
  const displayOrder = item.displayOrder;
  const pointOffsetDays = item.pointOffsetDays;
  const windowStartsOffsetDays = item.windowStartsOffsetDays;
  const windowEndsOffsetDays = item.windowEndsOffsetDays;
  if (
    !organizationTemplateId ||
    !Number.isInteger(displayOrder) ||
    (displayOrder as number) < 0 ||
    !LITTER_PLANNING_MODEL_ITEM_KINDS.includes(item.itemKind as LitterPlanningModelItemKind) ||
    !LITTER_PLANNING_MODEL_PRIORITIES.includes(item.priority as LitterPlanningModelPriority) ||
    !LITTER_PLANNING_MODEL_ANCHORS.includes(item.anchorType as LitterPlanningModelAnchor) ||
    typeof item.isRequired !== "boolean" ||
    typeof item.isSelectedByDefault !== "boolean" ||
    pointLocalTime === null ||
    windowStartsLocalTime === null ||
    windowEndsLocalTime === null ||
    (item.isRequired && !item.isSelectedByDefault)
  ) return null;

  if (item.itemKind === "window") {
    if (
      pointOffsetDays !== undefined ||
      pointLocalTime !== undefined ||
      item.recurrenceKind !== undefined ||
      item.timeSlots !== undefined ||
      !Number.isInteger(windowStartsOffsetDays) ||
      !Number.isInteger(windowEndsOffsetDays) ||
      (windowStartsOffsetDays as number) > (windowEndsOffsetDays as number) ||
      ((windowStartsOffsetDays as number) === (windowEndsOffsetDays as number) &&
        windowStartsLocalTime !== undefined &&
        windowEndsLocalTime !== undefined &&
        windowStartsLocalTime > windowEndsLocalTime)
    ) return null;
    return {
      organizationTemplateId,
      itemKind: "window",
      priority: item.priority as LitterPlanningModelPriority,
      anchorType: item.anchorType as LitterPlanningModelAnchor,
      ...(windowStartsOffsetDays === undefined ? {} : { windowStartsOffsetDays: windowStartsOffsetDays as number }),
      ...(windowStartsLocalTime === undefined ? {} : { windowStartsLocalTime }),
      ...(windowEndsOffsetDays === undefined ? {} : { windowEndsOffsetDays: windowEndsOffsetDays as number }),
      ...(windowEndsLocalTime === undefined ? {} : { windowEndsLocalTime }),
      displayOrder: displayOrder as number,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    };
  }

  if (item.itemKind === "recurring_task") {
    const recurrenceKind = item.recurrenceKind;
    const recurrenceEndKind = item.recurrenceEndKind;
    const recurrenceIntervalDays = item.recurrenceIntervalDays;
    const recurrenceStartsOffsetDays = item.recurrenceStartsOffsetDays;
    const initialMaterializationHorizonDays = item.initialMaterializationHorizonDays;
    const absoluteMaxOccurrences = item.absoluteMaxOccurrences;
    const timeSlotsRaw = item.timeSlots;
    if (
      pointOffsetDays !== undefined ||
      pointLocalTime !== undefined ||
      windowStartsOffsetDays !== undefined ||
      windowStartsLocalTime !== undefined ||
      windowEndsOffsetDays !== undefined ||
      windowEndsLocalTime !== undefined ||
      !LITTER_PLANNING_MODEL_RECURRENCE_KINDS.includes(
        recurrenceKind as LitterPlanningModelRecurrenceKind,
      ) ||
      !LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS.includes(
        recurrenceEndKind as LitterPlanningModelRecurrenceEndKind,
      ) ||
      !Number.isInteger(recurrenceIntervalDays) ||
      (recurrenceIntervalDays as number) < 1 ||
      (recurrenceIntervalDays as number) > 365 ||
      !Number.isInteger(recurrenceStartsOffsetDays) ||
      !Number.isInteger(initialMaterializationHorizonDays) ||
      (initialMaterializationHorizonDays as number) < 1 ||
      (initialMaterializationHorizonDays as number) > 365 ||
      !Number.isInteger(absoluteMaxOccurrences) ||
      (absoluteMaxOccurrences as number) < 1 ||
      (absoluteMaxOccurrences as number) > 500 ||
      !Array.isArray(timeSlotsRaw) ||
      timeSlotsRaw.length < 1 ||
      timeSlotsRaw.length > 8
    ) {
      return null;
    }

    const timeSlots: string[] = [];
    let previousTime: string | null = null;
    for (const slot of timeSlotsRaw) {
      const normalized = normalizeLocalTime(slot);
      if (!normalized) return null;
      if (previousTime !== null && normalized <= previousTime) return null;
      timeSlots.push(normalized);
      previousTime = normalized;
    }

    if (recurrenceEndKind === "fixed_end_offset") {
      if (
        !Number.isInteger(item.recurrenceEndsOffsetDays) ||
        item.recurrenceDayCount !== undefined ||
        (item.recurrenceEndsOffsetDays as number) <
          (recurrenceStartsOffsetDays as number)
      ) {
        return null;
      }
    } else if (recurrenceEndKind === "fixed_recurrence_day_count") {
      if (
        !Number.isInteger(item.recurrenceDayCount) ||
        (item.recurrenceDayCount as number) < 1 ||
        (item.recurrenceDayCount as number) > 500 ||
        item.recurrenceEndsOffsetDays !== undefined ||
        (item.recurrenceDayCount as number) * timeSlots.length >
          (absoluteMaxOccurrences as number)
      ) {
        return null;
      }
    } else if (
      item.recurrenceEndsOffsetDays !== undefined ||
      item.recurrenceDayCount !== undefined
    ) {
      return null;
    }

    return {
      organizationTemplateId,
      itemKind: "recurring_task",
      priority: item.priority as LitterPlanningModelPriority,
      anchorType: item.anchorType as LitterPlanningModelAnchor,
      recurrenceKind: recurrenceKind as LitterPlanningModelRecurrenceKind,
      recurrenceIntervalDays: recurrenceIntervalDays as number,
      recurrenceStartsOffsetDays: recurrenceStartsOffsetDays as number,
      recurrenceEndKind: recurrenceEndKind as LitterPlanningModelRecurrenceEndKind,
      ...(item.recurrenceEndsOffsetDays === undefined
        ? {}
        : { recurrenceEndsOffsetDays: item.recurrenceEndsOffsetDays as number }),
      ...(item.recurrenceDayCount === undefined
        ? {}
        : { recurrenceDayCount: item.recurrenceDayCount as number }),
      initialMaterializationHorizonDays: initialMaterializationHorizonDays as number,
      absoluteMaxOccurrences: absoluteMaxOccurrences as number,
      timeSlots,
      displayOrder: displayOrder as number,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    };
  }

  if (
    !Number.isInteger(pointOffsetDays) ||
    windowStartsOffsetDays !== undefined ||
    windowStartsLocalTime !== undefined ||
    windowEndsOffsetDays !== undefined ||
    windowEndsLocalTime !== undefined ||
    item.recurrenceKind !== undefined ||
    item.timeSlots !== undefined
  ) return null;
  return {
    organizationTemplateId,
    itemKind: item.itemKind as LitterPlanningModelItemKind,
    priority: item.priority as LitterPlanningModelPriority,
    anchorType: item.anchorType as LitterPlanningModelAnchor,
    ...(pointOffsetDays === undefined ? {} : { pointOffsetDays: pointOffsetDays as number }),
    ...(pointLocalTime === undefined ? {} : { pointLocalTime }),
    displayOrder: displayOrder as number,
    isRequired: item.isRequired,
    isSelectedByDefault: item.isSelectedByDefault,
  };
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const orders = new Set<number>();
  const normalized = items.map(normalizeItem);
  if (normalized.some((item) => item === null)) return null;
  for (const item of normalized) {
    if (!item || orders.has(item.displayOrder)) return null;
    orders.add(item.displayOrder);
  }
  return normalized as LitterPlanningModelItemInput[];
}

/** Pure validation for planning model items (SQL-equivalent shape checks). */
export function parseLitterPlanningModelItems(
  items: unknown,
): LitterPlanningModelItemInput[] | null {
  return normalizeItems(items);
}

function mapModel(row: ModelRow): Omit<LitterPlanningModel, "items"> | null {
  const libraryCode = row.library_model_code;
  const libraryVersion = row.library_model_version;
  if (
    !normalizeUuid(row.id) ||
    typeof row.title !== "string" ||
    typeof row.is_active !== "boolean" ||
    !Number.isInteger(row.revision) ||
    row.revision <= 0 ||
    (row.species !== null && row.species !== "dog" && row.species !== "cat") ||
    (row.breed !== null && row.species === null) ||
    (libraryCode === null) !== (libraryVersion === null) ||
    (libraryVersion !== null &&
      (!Number.isInteger(libraryVersion) || libraryVersion <= 0))
  ) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    species: row.species,
    breed: row.breed,
    isActive: row.is_active,
    revision: row.revision,
    libraryModelCode: libraryCode,
    libraryModelVersion: libraryVersion,
  };
}

function mapItem(
  row: ItemRow,
  timeSlots?: string[],
): LitterPlanningModelItem | null {
  const input = normalizeItem({
    organizationTemplateId: row.organization_template_id,
    itemKind: row.item_kind,
    priority: row.priority,
    anchorType: row.anchor_type,
    pointOffsetDays: row.point_offset_days ?? undefined,
    pointLocalTime: row.point_local_time ?? undefined,
    windowStartsOffsetDays: row.window_starts_offset_days ?? undefined,
    windowStartsLocalTime: row.window_starts_local_time ?? undefined,
    windowEndsOffsetDays: row.window_ends_offset_days ?? undefined,
    windowEndsLocalTime: row.window_ends_local_time ?? undefined,
    recurrenceKind: row.recurrence_kind ?? undefined,
    recurrenceIntervalDays: row.recurrence_interval_days ?? undefined,
    recurrenceStartsOffsetDays: row.recurrence_starts_offset_days ?? undefined,
    recurrenceEndKind: row.recurrence_end_kind ?? undefined,
    recurrenceEndsOffsetDays: row.recurrence_ends_offset_days ?? undefined,
    recurrenceDayCount: row.recurrence_day_count ?? undefined,
    initialMaterializationHorizonDays:
      row.initial_materialization_horizon_days ?? undefined,
    absoluteMaxOccurrences: row.absolute_max_occurrences ?? undefined,
    timeSlots: timeSlots,
    displayOrder: row.display_order,
    isRequired: row.is_required,
    isSelectedByDefault: row.is_selected_by_default,
  });
  return input && normalizeUuid(row.id) ? { id: row.id, ...input } : null;
}

function mapMutation(row: Database["public"]["Functions"]["create_litter_planning_model"]["Returns"][number]): LitterPlanningModelResult {
  const modelId = normalizeUuid(row.model_id);
  const revision = row.revision;
  const isActive = row.is_active;
  if (row.outcome === "success" && modelId && typeof revision === "number" && Number.isInteger(revision) && revision > 0 && typeof isActive === "boolean") return { outcome: "success", modelId, revision, isActive, replayed: row.replayed };
  const code: LitterPlanningModelErrorCode =
    row.reason === "not_authenticated"
      ? "unauthenticated"
      : row.reason === "membership_required"
        ? "forbidden"
        : row.reason === "model_not_found"
          ? "not_found"
          : row.reason === "stale_revision"
            ? "stale_revision"
            : row.reason === "imported_model_immutable"
              ? "imported_model_immutable"
              : row.reason === "client_command_conflict"
                ? "conflict"
                : "invalid_input";
  return failure(
    code,
    code === "imported_model_immutable"
      ? "Un modèle importé ne peut pas être modifié directement. Créez une copie personnalisée."
      : "La modification du modèle n’a pas pu être effectuée.",
  );
}

function itemsJson(items: LitterPlanningModelItemInput[]): Json {
  return JSON.parse(JSON.stringify(items)) as Json;
}

export async function listLitterPlanningModelsCore(organizationId: string, supabase: Supabase): Promise<{ outcome: "success"; role: Role; models: Omit<LitterPlanningModel, "items">[] } | LitterPlanningModelResult> {
  const organizationIdNormalized = normalizeUuid(organizationId);
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return failure("unauthenticated", "Authentification requise.");
  if (!organizationIdNormalized) return failure("invalid_input", "La demande est invalide.");
  const membership = await supabase.from("memberships").select("role").eq("organization_id", organizationIdNormalized).eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (membership.error) return failure("database_error", "La lecture des modèles est indisponible.");
  if (!membership.data) return failure("not_found", "Le modèle est introuvable.");
  const models = await supabase.from("litter_planning_models").select("*").eq("organization_id", organizationIdNormalized).order("is_active", { ascending: false }).order("title");
  if (models.error) return failure("database_error", "La lecture des modèles est indisponible.");
  const mapped = (models.data ?? []).map(mapModel);
  return mapped.every(Boolean) ? { outcome: "success" as const, role: membership.data.role as Role, models: mapped as Omit<LitterPlanningModel, "items">[] } : failure("database_error", "Les données du modèle sont invalides.");
}

export async function getLitterPlanningModelCore(modelId: string, supabase: Supabase) {
  const normalizedModelId = normalizeUuid(modelId);
  if (!normalizedModelId) return failure("invalid_input", "La demande est invalide.");
  const model = await supabase.from("litter_planning_models").select("*").eq("id", normalizedModelId).maybeSingle();
  if (model.error) return failure("database_error", "La lecture du modèle est indisponible.");
  if (!model.data) return failure("not_found", "Le modèle est introuvable.");
  const listed = await listLitterPlanningModelsCore(model.data.organization_id, supabase);
  if (!("role" in listed)) return listed;
  const items = await supabase.from("litter_planning_model_items").select("*").eq("organization_id", model.data.organization_id).eq("model_id", normalizedModelId).order("display_order");
  if (items.error) return failure("database_error", "La lecture du modèle est indisponible.");
  const itemIds = (items.data ?? []).map((item) => item.id);
  const slotsByItem = new Map<string, string[]>();
  if (itemIds.length > 0) {
    const slots = await supabase
      .from("litter_planning_model_item_time_slots")
      .select("model_item_id, slot_no, local_time")
      .eq("organization_id", model.data.organization_id)
      .in("model_item_id", itemIds)
      .order("slot_no");
    if (slots.error) return failure("database_error", "La lecture du modèle est indisponible.");
    for (const slot of slots.data ?? []) {
      const list = slotsByItem.get(slot.model_item_id) ?? [];
      list.push(slot.local_time);
      slotsByItem.set(slot.model_item_id, list);
    }
  }
  const mappedModel = mapModel(model.data);
  const mappedItems = (items.data ?? []).map((row) =>
    mapItem(row, slotsByItem.get(row.id)),
  );
  return mappedModel && mappedItems.every(Boolean) ? { outcome: "success" as const, role: listed.role, model: { ...mappedModel, items: mappedItems as LitterPlanningModelItem[] } } : failure("database_error", "Les données du modèle sont invalides.");
}

export async function createLitterPlanningModelCore(organizationId: string, clientCommandId: string, input: CreateLitterPlanningModelInput, supabase: Supabase) {
  const title = normalizeText(input.title, 255, true);
  const description = normalizeText(input.description, 5000);
  const breed = normalizeText(input.breed, 255);
  const items = normalizeItems(input.items);
  if (!normalizeUuid(organizationId) || !normalizeUuid(clientCommandId) || !title || description === undefined || breed === undefined || !items || (input.species !== undefined && input.species !== null && input.species !== "dog" && input.species !== "cat") || (breed !== null && input.species == null) || (input.isActive !== undefined && typeof input.isActive !== "boolean")) return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("create_litter_planning_model", { p_organization_id: organizationId, p_client_command_id: clientCommandId, p_title: title, p_description: description, p_species: input.species ?? null, p_breed: breed, p_is_active: input.isActive ?? true, p_items: itemsJson(items) });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

export async function replaceLitterPlanningModelCore(modelId: string, clientCommandId: string, expectedRevision: number, input: ReplaceLitterPlanningModelInput, supabase: Supabase) {
  const title = normalizeText(input.title, 255, true);
  const description = normalizeText(input.description, 5000);
  const breed = normalizeText(input.breed, 255);
  const items = normalizeItems(input.items);
  if (!normalizeUuid(modelId) || !normalizeUuid(clientCommandId) || !Number.isInteger(expectedRevision) || expectedRevision <= 0 || !title || description === undefined || breed === undefined || !items || (input.species !== undefined && input.species !== null && input.species !== "dog" && input.species !== "cat") || (breed !== null && input.species == null)) return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("replace_litter_planning_model", { p_model_id: modelId, p_client_command_id: clientCommandId, p_expected_revision: expectedRevision, p_title: title, p_description: description, p_species: input.species ?? null, p_breed: breed, p_items: itemsJson(items) });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

export async function setLitterPlanningModelActiveCore(modelId: string, clientCommandId: string, expectedRevision: number, isActive: boolean, supabase: Supabase) {
  if (!normalizeUuid(modelId) || !normalizeUuid(clientCommandId) || !Number.isInteger(expectedRevision) || expectedRevision <= 0 || typeof isActive !== "boolean") return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("set_litter_planning_model_active", { p_model_id: modelId, p_client_command_id: clientCommandId, p_expected_revision: expectedRevision, p_is_active: isActive });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

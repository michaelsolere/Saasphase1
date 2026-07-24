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
  items: LitterPlanningModelItem[];
};
export type LitterPlanningModelErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "stale_revision"
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
      !Number.isInteger(windowStartsOffsetDays) ||
      !Number.isInteger(windowEndsOffsetDays) ||
      (windowStartsOffsetDays as number) > (windowEndsOffsetDays as number) ||
      ((windowStartsOffsetDays as number) === (windowEndsOffsetDays as number) &&
        windowStartsLocalTime !== undefined &&
        windowEndsLocalTime !== undefined &&
        windowStartsLocalTime > windowEndsLocalTime)
    ) return null;
  } else if (
    !Number.isInteger(pointOffsetDays) ||
    windowStartsOffsetDays !== undefined ||
    windowStartsLocalTime !== undefined ||
    windowEndsOffsetDays !== undefined ||
    windowEndsLocalTime !== undefined
  ) return null;
  return {
    organizationTemplateId,
    itemKind: item.itemKind as LitterPlanningModelItemKind,
    priority: item.priority as LitterPlanningModelPriority,
    anchorType: item.anchorType as LitterPlanningModelAnchor,
    ...(pointOffsetDays === undefined ? {} : { pointOffsetDays: pointOffsetDays as number }),
    ...(pointLocalTime === undefined ? {} : { pointLocalTime }),
    ...(windowStartsOffsetDays === undefined ? {} : { windowStartsOffsetDays: windowStartsOffsetDays as number }),
    ...(windowStartsLocalTime === undefined ? {} : { windowStartsLocalTime }),
    ...(windowEndsOffsetDays === undefined ? {} : { windowEndsOffsetDays: windowEndsOffsetDays as number }),
    ...(windowEndsLocalTime === undefined ? {} : { windowEndsLocalTime }),
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

function mapModel(row: ModelRow): Omit<LitterPlanningModel, "items"> | null {
  if (
    !normalizeUuid(row.id) ||
    typeof row.title !== "string" ||
    typeof row.is_active !== "boolean" ||
    !Number.isInteger(row.revision) ||
    row.revision <= 0 ||
    (row.species !== null && row.species !== "dog" && row.species !== "cat")
  ) return null;
  return { id: row.id, title: row.title, description: row.description, species: row.species, breed: row.breed, isActive: row.is_active, revision: row.revision };
}

function mapItem(row: ItemRow): LitterPlanningModelItem | null {
  const input = normalizeItem({ organizationTemplateId: row.organization_template_id, itemKind: row.item_kind, priority: row.priority, anchorType: row.anchor_type, pointOffsetDays: row.point_offset_days ?? undefined, pointLocalTime: row.point_local_time ?? undefined, windowStartsOffsetDays: row.window_starts_offset_days ?? undefined, windowStartsLocalTime: row.window_starts_local_time ?? undefined, windowEndsOffsetDays: row.window_ends_offset_days ?? undefined, windowEndsLocalTime: row.window_ends_local_time ?? undefined, displayOrder: row.display_order, isRequired: row.is_required, isSelectedByDefault: row.is_selected_by_default });
  return input && normalizeUuid(row.id) ? { id: row.id, ...input } : null;
}

function mapMutation(row: Database["public"]["Functions"]["create_litter_planning_model"]["Returns"][number]): LitterPlanningModelResult {
  const modelId = normalizeUuid(row.model_id);
  const revision = row.revision;
  const isActive = row.is_active;
  if (row.outcome === "success" && modelId && typeof revision === "number" && Number.isInteger(revision) && revision > 0 && typeof isActive === "boolean") return { outcome: "success", modelId, revision, isActive, replayed: row.replayed };
  const code: LitterPlanningModelErrorCode = row.reason === "not_authenticated" ? "unauthenticated" : row.reason === "membership_required" ? "forbidden" : row.reason === "model_not_found" ? "not_found" : row.reason === "stale_revision" ? "stale_revision" : row.reason === "client_command_conflict" ? "conflict" : "invalid_input";
  return failure(code, "La modification du modèle n’a pas pu être effectuée.");
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
  const mappedModel = mapModel(model.data);
  const mappedItems = (items.data ?? []).map(mapItem);
  return mappedModel && mappedItems.every(Boolean) ? { outcome: "success" as const, role: listed.role, model: { ...mappedModel, items: mappedItems as LitterPlanningModelItem[] } } : failure("database_error", "Les données du modèle sont invalides.");
}

export async function createLitterPlanningModelCore(organizationId: string, clientCommandId: string, input: CreateLitterPlanningModelInput, supabase: Supabase) {
  const title = normalizeText(input.title, 255, true);
  const description = normalizeText(input.description, 5000);
  const breed = normalizeText(input.breed, 255);
  const items = normalizeItems(input.items);
  if (!normalizeUuid(organizationId) || !normalizeUuid(clientCommandId) || !title || description === undefined || breed === undefined || !items || (input.species !== undefined && input.species !== null && input.species !== "dog" && input.species !== "cat") || (input.isActive !== undefined && typeof input.isActive !== "boolean")) return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("create_litter_planning_model", { p_organization_id: organizationId, p_client_command_id: clientCommandId, p_title: title, p_description: description, p_species: input.species ?? null, p_breed: breed, p_is_active: input.isActive ?? true, p_items: itemsJson(items) });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

export async function replaceLitterPlanningModelCore(modelId: string, clientCommandId: string, expectedRevision: number, input: ReplaceLitterPlanningModelInput, supabase: Supabase) {
  const title = normalizeText(input.title, 255, true);
  const description = normalizeText(input.description, 5000);
  const breed = normalizeText(input.breed, 255);
  const items = normalizeItems(input.items);
  if (!normalizeUuid(modelId) || !normalizeUuid(clientCommandId) || !Number.isInteger(expectedRevision) || expectedRevision <= 0 || !title || description === undefined || breed === undefined || !items || (input.species !== undefined && input.species !== null && input.species !== "dog" && input.species !== "cat")) return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("replace_litter_planning_model", { p_model_id: modelId, p_client_command_id: clientCommandId, p_expected_revision: expectedRevision, p_title: title, p_description: description, p_species: input.species ?? null, p_breed: breed, p_items: itemsJson(items) });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

export async function setLitterPlanningModelActiveCore(modelId: string, clientCommandId: string, expectedRevision: number, isActive: boolean, supabase: Supabase) {
  if (!normalizeUuid(modelId) || !normalizeUuid(clientCommandId) || !Number.isInteger(expectedRevision) || expectedRevision <= 0 || typeof isActive !== "boolean") return failure("invalid_input", "La demande est invalide.");
  const result = await supabase.rpc("set_litter_planning_model_active", { p_model_id: modelId, p_client_command_id: clientCommandId, p_expected_revision: expectedRevision, p_is_active: isActive });
  return result.error || !result.data?.[0] ? failure("database_error", "La modification du modèle n’a pas pu être effectuée.") : mapMutation(result.data[0]);
}

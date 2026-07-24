import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type Plan = Database["public"]["Tables"]["litter_plans"]["Row"];
type Item = Database["public"]["Tables"]["litter_plan_items"]["Row"];

export type LitterPlanErrorCode = "invalid_input" | "unauthenticated" | "forbidden" | "not_found" | "invalid_litter" | "stale_model" | "stale_plan" | "already_applied" | "conflict" | "database_error";
export type LitterPlanResult = { outcome: "success"; planId: string; revision: number; replayed: boolean; result: Json } | { outcome: "error"; error: { code: LitterPlanErrorCode; message: string } };
export type LitterPlanDetail = { header: Plan; items: Item[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timezone = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 255 ? value : null;
const uuid = (value: unknown) => typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
const error = (code: LitterPlanErrorCode): LitterPlanResult => ({ outcome: "error", error: { code, message: "Le planning n’a pas pu être appliqué." } });

function code(reason: string | null): LitterPlanErrorCode {
  if (reason === "not_authenticated") return "unauthenticated";
  if (reason === "membership_required") return "forbidden";
  if (reason === "not_found") return "not_found";
  if (reason === "invalid_litter") return "invalid_litter";
  if (reason === "stale_model") return "stale_model";
  if (reason === "stale_plan") return "stale_plan";
  if (reason === "model_already_applied") return "already_applied";
  if (reason === "client_command_conflict") return "conflict";
  return "invalid_input";
}

export async function getActiveLitterPlanForLitter(litterId: string, supabase: Supabase): Promise<LitterPlanDetail | LitterPlanResult> {
  const normalized = uuid(litterId); if (!normalized) return error("invalid_input");
  const plan = await supabase.from("litter_plans").select("*").eq("litter_id", normalized).eq("status", "active").maybeSingle();
  if (plan.error) return error("database_error");
  if (!plan.data) return error("not_found");
  const items = await supabase.from("litter_plan_items").select("*").eq("litter_plan_id", plan.data.id).order("display_order");
  if (items.error) return error("database_error");
  return { header: plan.data, items: items.data ?? [] };
}

export async function applyLitterPlanningModel(input: { litterId: string; planningModelId: string; clientCommandId: string; expectedModelRevision: number; expectedPlanRevision?: number | null; selectedModelItemIds?: string[] | null; timezoneName: string }, supabase: Supabase): Promise<LitterPlanResult> {
  const litterId = uuid(input.litterId), modelId = uuid(input.planningModelId), commandId = uuid(input.clientCommandId), zone = timezone(input.timezoneName);
  const ids = input.selectedModelItemIds === null || input.selectedModelItemIds === undefined ? null : input.selectedModelItemIds.map(uuid);
  if (!litterId || !modelId || !commandId || !zone || !Number.isInteger(input.expectedModelRevision) || input.expectedModelRevision <= 0 || ids?.some((id) => !id) || (input.expectedPlanRevision !== null && input.expectedPlanRevision !== undefined && (!Number.isInteger(input.expectedPlanRevision) || input.expectedPlanRevision <= 0))) return error("invalid_input");
  const selectedIds = ids?.filter((id): id is string => id !== null) ?? null;
  const rpc = await supabase.rpc("apply_litter_planning_model", { p_litter_id: litterId, p_planning_model_id: modelId, p_client_command_id: commandId, p_expected_model_revision: input.expectedModelRevision, p_expected_plan_revision: input.expectedPlanRevision ?? null, p_selected_model_item_ids: selectedIds, p_timezone_name: zone });
  if (rpc.error) return error("database_error");
  const row = rpc.data?.[0]; const planId = uuid(row?.litter_plan_id);
  const revision = row?.revision;
  if (!row || row.outcome !== "success" || !planId || typeof revision !== "number" || !Number.isInteger(revision)) return error(code(row?.reason ?? null));
  return { outcome: "success", planId, revision, replayed: row.replayed === true, result: row.result };
}

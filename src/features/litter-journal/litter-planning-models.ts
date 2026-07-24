import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { createLitterPlanningModelCore, getLitterPlanningModelCore, listLitterPlanningModelsCore, replaceLitterPlanningModelCore, setLitterPlanningModelActiveCore } from "./litter-planning-models-core";
export * from "./litter-planning-models-core";
type Supabase = SupabaseClient<Database>;
async function client(value?: Supabase) { return value ?? await createClient(); }
export async function listLitterPlanningModels(organizationId: string, supplied?: Supabase) { return listLitterPlanningModelsCore(organizationId, await client(supplied)); }
export async function getLitterPlanningModel(modelId: string, supplied?: Supabase) { return getLitterPlanningModelCore(modelId, await client(supplied)); }
export async function createLitterPlanningModel(organizationId: string, clientCommandId: string, input: Parameters<typeof createLitterPlanningModelCore>[2], supplied?: Supabase) { return createLitterPlanningModelCore(organizationId, clientCommandId, input, await client(supplied)); }
export async function replaceLitterPlanningModel(modelId: string, clientCommandId: string, expectedRevision: number, input: Parameters<typeof replaceLitterPlanningModelCore>[3], supplied?: Supabase) { return replaceLitterPlanningModelCore(modelId, clientCommandId, expectedRevision, input, await client(supplied)); }
export async function setLitterPlanningModelActive(modelId: string, clientCommandId: string, expectedRevision: number, isActive: boolean, supplied?: Supabase) { return setLitterPlanningModelActiveCore(modelId, clientCommandId, expectedRevision, isActive, await client(supplied)); }

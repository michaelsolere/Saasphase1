import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  createLitterPlanningModelCore,
  getLitterPlanningModelCore,
  listLitterPlanningModelsCore,
  replaceLitterPlanningModelCore,
  setLitterPlanningModelActiveCore,
} from "./litter-planning-models-core";

export * from "./litter-planning-models-core";

type Supabase = SupabaseClient<Database>;

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function listLitterPlanningModels(organizationId: string, suppliedClient?: Supabase) {
  return listLitterPlanningModelsCore(organizationId, await serverClient(suppliedClient));
}

export async function getLitterPlanningModel(modelId: string, suppliedClient?: Supabase) {
  return getLitterPlanningModelCore(modelId, await serverClient(suppliedClient));
}

export async function createLitterPlanningModel(
  organizationId: string,
  clientCommandId: string,
  input: Parameters<typeof createLitterPlanningModelCore>[2],
  suppliedClient?: Supabase,
) {
  return createLitterPlanningModelCore(organizationId, clientCommandId, input, await serverClient(suppliedClient));
}

export async function replaceLitterPlanningModel(
  modelId: string,
  clientCommandId: string,
  expectedRevision: number,
  input: Parameters<typeof replaceLitterPlanningModelCore>[3],
  suppliedClient?: Supabase,
) {
  return replaceLitterPlanningModelCore(modelId, clientCommandId, expectedRevision, input, await serverClient(suppliedClient));
}

export async function setLitterPlanningModelActive(
  modelId: string,
  clientCommandId: string,
  expectedRevision: number,
  isActive: boolean,
  suppliedClient?: Supabase,
) {
  return setLitterPlanningModelActiveCore(modelId, clientCommandId, expectedRevision, isActive, await serverClient(suppliedClient));
}

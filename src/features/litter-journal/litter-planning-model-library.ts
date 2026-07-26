import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  importLitterPlanningModelLibraryModelsCore,
  listLitterPlanningModelLibraryCore,
} from "./litter-planning-model-library-core";

export * from "./litter-planning-model-library-core";

type Supabase = SupabaseClient<Database>;

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function listLitterPlanningModelLibrary(
  input: Parameters<typeof listLitterPlanningModelLibraryCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterPlanningModelLibraryCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function importLitterPlanningModelLibraryModels(
  input: Parameters<typeof importLitterPlanningModelLibraryModelsCore>[0],
  suppliedClient?: Supabase,
) {
  return importLitterPlanningModelLibraryModelsCore(
    input,
    await serverClient(suppliedClient),
  );
}

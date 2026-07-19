import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listLitterWeightHistoryCore,
  recordLitterRoutineWeightsCore,
} from "./litter-weights-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  ListLitterWeightHistoryInput,
  ListLitterWeightHistoryResult,
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
  LitterWeightOrganizationRole,
  LitterWeightServiceError,
  LitterWeightServiceErrorCode,
  RecordLitterRoutineWeightItemInput,
  RecordLitterRoutineWeightsInput,
  RecordLitterRoutineWeightsResult,
} from "./litter-weights-core";
export type { LitterWeightLatestSessionComparison } from "./litter-weighing-session-comparison";

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function recordLitterRoutineWeights(
  input: Parameters<typeof recordLitterRoutineWeightsCore>[0],
  suppliedClient?: Supabase,
) {
  return recordLitterRoutineWeightsCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function listLitterWeightHistory(
  input: Parameters<typeof listLitterWeightHistoryCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterWeightHistoryCore(input, await serverClient(suppliedClient));
}

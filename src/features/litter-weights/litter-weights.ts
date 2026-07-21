import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelLitterRoutineWeightCore,
  cancelLitterWeighingSessionCore,
  correctLitterRoutineWeightCore,
  listLitterAgeComparisonCore,
  listLitterWeightAdjustmentHistoryCore,
  listLitterWeightHistoryCore,
  recordLitterRoutineWeightsCore,
} from "./litter-weights-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  CancelLitterRoutineWeightInput,
  CancelLitterRoutineWeightResult,
  CancelLitterWeighingSessionInput,
  CancelLitterWeighingSessionResult,
  CorrectLitterRoutineWeightInput,
  CorrectLitterRoutineWeightResult,
  ListLitterAgeComparisonInput,
  ListLitterAgeComparisonResult,
  ListLitterWeightAdjustmentHistoryInput,
  ListLitterWeightAdjustmentHistoryResult,
  LitterWeightAdjustmentHistoryEntry,
  ListLitterWeightHistoryInput,
  ListLitterWeightHistoryResult,
  ListLitterWeightHistoryScheduleRequest,
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
  LitterWeightOrganizationRole,
  LitterWeighingSchedulePolicyMetadata,
  LitterWeightServiceError,
  LitterWeightServiceErrorCode,
  RecordLitterRoutineWeightItemInput,
  RecordLitterRoutineWeightsInput,
  RecordLitterRoutineWeightsResult,
} from "./litter-weights-core";
export type { LitterAgeComparisonPoint } from "./litter-age-comparison-model";
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

export async function correctLitterRoutineWeight(
  input: Parameters<typeof correctLitterRoutineWeightCore>[0],
  suppliedClient?: Supabase,
) {
  return correctLitterRoutineWeightCore(input, await serverClient(suppliedClient));
}

export async function cancelLitterRoutineWeight(
  input: Parameters<typeof cancelLitterRoutineWeightCore>[0],
  suppliedClient?: Supabase,
) {
  return cancelLitterRoutineWeightCore(input, await serverClient(suppliedClient));
}

export async function cancelLitterWeighingSession(
  input: Parameters<typeof cancelLitterWeighingSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return cancelLitterWeighingSessionCore(input, await serverClient(suppliedClient));
}

export async function listLitterWeightHistory(
  input: Parameters<typeof listLitterWeightHistoryCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterWeightHistoryCore(input, await serverClient(suppliedClient));
}

export async function listLitterWeightAdjustmentHistory(
  input: Parameters<typeof listLitterWeightAdjustmentHistoryCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterWeightAdjustmentHistoryCore(input, await serverClient(suppliedClient));
}

export async function listLitterAgeComparison(
  input: Parameters<typeof listLitterAgeComparisonCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterAgeComparisonCore(input, await serverClient(suppliedClient));
}

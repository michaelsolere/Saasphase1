import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addProgesteroneMeasurementCore,
  createReproductiveCycleCore,
  listReproductiveCycleMatingsForCycleCore,
  listProgesteroneMeasurementsForCycleCore,
  listReproductiveCyclesForMotherCore,
  recordReproductiveCycleMatingCore,
} from "./reproductive-cycles-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  AddProgesteroneMeasurementInput,
  AddProgesteroneMeasurementResult,
  CreateReproductiveCycleInput,
  CreateReproductiveCycleResult,
  ListProgesteroneMeasurementsInput,
  ListProgesteroneMeasurementsResult,
  ListReproductiveCycleMatingsInput,
  ListReproductiveCycleMatingsResult,
  ListReproductiveCyclesInput,
  ListReproductiveCyclesResult,
  ProgesteroneMeasurementSummary,
  ProgesteroneUnit,
  ReproductionServiceError,
  ReproductionServiceErrorCode,
  RecordReproductiveCycleMatingInput,
  RecordReproductiveCycleMatingResult,
  ReproductiveCycleStatus,
  ReproductiveCycleMatingMethod,
  ReproductiveCycleMatingSummary,
  ReproductiveCycleSummary,
} from "./reproductive-cycles-core";

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function listReproductiveCyclesForMother(
  input: Parameters<typeof listReproductiveCyclesForMotherCore>[0],
  suppliedClient?: Supabase,
) {
  return listReproductiveCyclesForMotherCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function createReproductiveCycle(
  input: Parameters<typeof createReproductiveCycleCore>[0],
  suppliedClient?: Supabase,
) {
  return createReproductiveCycleCore(input, await serverClient(suppliedClient));
}

export async function listProgesteroneMeasurementsForCycle(
  input: Parameters<typeof listProgesteroneMeasurementsForCycleCore>[0],
  suppliedClient?: Supabase,
) {
  return listProgesteroneMeasurementsForCycleCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function addProgesteroneMeasurement(
  input: Parameters<typeof addProgesteroneMeasurementCore>[0],
  suppliedClient?: Supabase,
) {
  return addProgesteroneMeasurementCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function listReproductiveCycleMatingsForCycle(
  input: Parameters<typeof listReproductiveCycleMatingsForCycleCore>[0],
  suppliedClient?: Supabase,
) {
  return listReproductiveCycleMatingsForCycleCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function recordReproductiveCycleMating(
  input: Parameters<typeof recordReproductiveCycleMatingCore>[0],
  suppliedClient?: Supabase,
) {
  return recordReproductiveCycleMatingCore(
    input,
    await serverClient(suppliedClient),
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addProgesteroneMeasurementCore,
  createReproductiveCycleCore,
  listProgesteroneMeasurementsForCycleCore,
  listReproductiveCyclesForMotherCore,
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
  ListReproductiveCyclesInput,
  ListReproductiveCyclesResult,
  ProgesteroneMeasurementSummary,
  ProgesteroneUnit,
  ReproductionServiceError,
  ReproductionServiceErrorCode,
  ReproductiveCycleStatus,
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

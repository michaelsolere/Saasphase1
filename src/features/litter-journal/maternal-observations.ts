import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listMaternalObservationsForLitterCore,
  recordMaternalObservationCore,
} from "./maternal-observations-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  ListMaternalObservationsForLitterInput,
  ListMaternalObservationsForLitterResult,
  MaternalObservationServiceError,
  MaternalObservationServiceErrorCode,
  MaternalObservationSeverity,
  MaternalObservationSummary,
  MaternalObservationTemperatureUnit,
  MaternalObservationType,
  RecordMaternalObservationInput,
  RecordMaternalObservationResult,
} from "./maternal-observations-core";

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function listMaternalObservationsForLitter(
  input: Parameters<typeof listMaternalObservationsForLitterCore>[0],
  suppliedClient?: Supabase,
) {
  return listMaternalObservationsForLitterCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function recordMaternalObservation(
  input: Parameters<typeof recordMaternalObservationCore>[0],
  suppliedClient?: Supabase,
) {
  return recordMaternalObservationCore(input, await serverClient(suppliedClient));
}

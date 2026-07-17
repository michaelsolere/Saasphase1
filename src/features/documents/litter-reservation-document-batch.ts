import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateLitterReservationDocumentsBatchCore,
  type LitterReservationDocumentBatchInput,
  type LitterReservationDocumentBatchResult,
} from "./litter-reservation-document-batch-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  DocumentBatchOutcome,
  DocumentBatchOutcomeName,
  DocumentBatchReasonCode,
  LitterReservationDocumentBatchGlobalReasonCode,
  LitterReservationDocumentBatchInput,
  LitterReservationDocumentBatchResult,
} from "./litter-reservation-document-batch-core";

export async function generateLitterReservationDocumentsBatch(
  input: LitterReservationDocumentBatchInput,
  supabase?: Supabase,
): Promise<LitterReservationDocumentBatchResult> {
  return generateLitterReservationDocumentsBatchCore(
    input,
    supabase ?? (await createClient()),
  );
}

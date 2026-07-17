import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateLitterGroupReservationDocumentsBatchCore,
  type LitterGroupReservationDocumentBatchInput,
  type LitterGroupReservationDocumentBatchResult,
} from "./litter-group-reservation-document-batch-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  LitterGroupReservationDocumentBatchGlobalReasonCode,
  LitterGroupReservationDocumentBatchInput,
  LitterGroupReservationDocumentBatchLitter,
  LitterGroupReservationDocumentBatchLocalReasonCode,
  LitterGroupReservationDocumentBatchReservation,
  LitterGroupReservationDocumentBatchResult,
} from "./litter-group-reservation-document-batch-core";

export async function generateLitterGroupReservationDocumentsBatch(
  input: LitterGroupReservationDocumentBatchInput,
  supabase?: Supabase,
): Promise<LitterGroupReservationDocumentBatchResult> {
  return generateLitterGroupReservationDocumentsBatchCore(
    input,
    supabase ?? (await createClient()),
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateAndStoreReservationDocumentPdfCore,
  type GenerateAndStoreReservationDocumentPdfInput,
  type GenerateAndStoreReservationDocumentPdfResult,
} from "./generated-reservation-document-orchestrator-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  GenerateAndStoreReservationDocumentPdfErrorCode,
  GenerateAndStoreReservationDocumentPdfErrorStage,
  GenerateAndStoreReservationDocumentPdfInput,
  GenerateAndStoreReservationDocumentPdfResult,
} from "./generated-reservation-document-orchestrator-core";

export async function generateAndStoreReservationDocumentPdf(
  input: GenerateAndStoreReservationDocumentPdfInput,
  supabase?: Supabase,
): Promise<GenerateAndStoreReservationDocumentPdfResult> {
  return generateAndStoreReservationDocumentPdfCore(
    input,
    supabase ?? (await createClient()),
  );
}

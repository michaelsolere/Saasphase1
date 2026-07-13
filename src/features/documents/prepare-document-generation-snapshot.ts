import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  prepareDocumentGenerationSnapshotForReservationCore,
  type PrepareDocumentGenerationSnapshotInput,
  type PrepareDocumentGenerationSnapshotResult,
} from "./prepare-document-generation-snapshot-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type WrapperInput = Omit<PrepareDocumentGenerationSnapshotInput, "capturedAt"> & {
  capturedAt?: string;
};

export type {
  PrepareDocumentGenerationSnapshotErrorCode,
  PrepareDocumentGenerationSnapshotInput,
  PrepareDocumentGenerationSnapshotResult,
} from "./prepare-document-generation-snapshot-core";

export async function prepareDocumentGenerationSnapshotForReservation(
  input: WrapperInput,
  supabase?: Supabase,
): Promise<PrepareDocumentGenerationSnapshotResult> {
  return prepareDocumentGenerationSnapshotForReservationCore(
    { ...input, capturedAt: input.capturedAt ?? new Date().toISOString() },
    supabase ?? (await createClient()),
  );
}

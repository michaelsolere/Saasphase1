import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  abandonDocumentSignedReturnUploadCore,
  archiveDocumentSignedReturnCore,
  finalizeDocumentSignedReturnUploadCore,
  prepareDocumentSignedReturnUploadCore,
  readDocumentSignedReturnCore,
  type ArchiveDocumentSignedReturnInput,
  type ArchiveDocumentSignedReturnResult,
  type DocumentSignedReturnLogger,
  type FinalizeDocumentSignedReturnUploadResult,
  type PrepareDocumentSignedReturnUploadInput,
  type PrepareDocumentSignedReturnUploadResult,
  type ReadDocumentSignedReturnResult,
} from "@/features/documents/document-signed-return-storage-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

async function resolveSupabase(supabase?: Supabase) {
  return supabase ?? (await createClient());
}

export type {
  ArchiveDocumentSignedReturnInput,
  ArchiveDocumentSignedReturnResult,
  DocumentSignedReturnErrorCode,
  FinalizeDocumentSignedReturnUploadResult,
  PrepareDocumentSignedReturnUploadInput,
  PrepareDocumentSignedReturnUploadResult,
  ReadDocumentSignedReturnResult,
} from "@/features/documents/document-signed-return-storage-core";

export async function prepareDocumentSignedReturnUpload(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase?: Supabase,
): Promise<PrepareDocumentSignedReturnUploadResult> {
  return prepareDocumentSignedReturnUploadCore(input, await resolveSupabase(supabase));
}

export async function finalizeDocumentSignedReturnUpload(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase?: Supabase,
  logger?: DocumentSignedReturnLogger,
): Promise<FinalizeDocumentSignedReturnUploadResult> {
  return finalizeDocumentSignedReturnUploadCore(
    input,
    await resolveSupabase(supabase),
    logger,
  );
}

export async function abandonDocumentSignedReturnUpload(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase?: Supabase,
  logger?: DocumentSignedReturnLogger,
) {
  return abandonDocumentSignedReturnUploadCore(
    input,
    await resolveSupabase(supabase),
    logger,
  );
}

export async function archiveDocumentSignedReturn(
  input: ArchiveDocumentSignedReturnInput,
  supabase?: Supabase,
  logger?: DocumentSignedReturnLogger,
): Promise<ArchiveDocumentSignedReturnResult> {
  return archiveDocumentSignedReturnCore(input, await resolveSupabase(supabase), logger);
}

export async function readDocumentSignedReturn(
  organizationId: string,
  signedReturnId: string,
  supabase?: Supabase,
): Promise<ReadDocumentSignedReturnResult> {
  return readDocumentSignedReturnCore(
    organizationId,
    signedReturnId,
    await resolveSupabase(supabase),
  );
}

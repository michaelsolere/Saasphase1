import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentPdfSignedUrlCore,
  readDocumentPdfCore,
  storeDocumentPdfCore,
  type DocumentPdfLogger,
  type ReadDocumentPdfResult,
  type SignDocumentPdfResult,
  type StoreDocumentPdfInput,
  type StoreDocumentPdfResult,
} from "@/features/documents/document-pdf-storage-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

async function resolveSupabase(supabase?: Supabase) {
  return supabase ?? (await createClient());
}

export type {
  DocumentPdfErrorCode,
  DocumentPdfScope,
  ReadDocumentPdfResult,
  SignDocumentPdfResult,
  StoreDocumentPdfInput,
  StoreDocumentPdfResult,
} from "@/features/documents/document-pdf-storage-core";

export async function storeDocumentPdf(
  input: StoreDocumentPdfInput,
  supabase?: Supabase,
  logger?: DocumentPdfLogger,
): Promise<StoreDocumentPdfResult> {
  return storeDocumentPdfCore(input, await resolveSupabase(supabase), logger);
}

export async function readDocumentPdf(
  organizationId: string,
  documentId: string,
  supabase?: Supabase,
): Promise<ReadDocumentPdfResult> {
  return readDocumentPdfCore(organizationId, documentId, await resolveSupabase(supabase));
}

export async function createDocumentPdfSignedUrl(
  organizationId: string,
  documentId: string,
  expiresIn = 60,
  supabase?: Supabase,
): Promise<SignDocumentPdfResult> {
  return createDocumentPdfSignedUrlCore(
    organizationId,
    documentId,
    expiresIn,
    await resolveSupabase(supabase),
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createNextReservationDocumentVariantVersionCore,
  createReservationDocumentVariantDraftCore,
  listReservationDocumentVariantsCore,
  listReservationDocumentVariantVersionsCore,
  publishReservationDocumentVariantVersionCore,
  saveReservationDocumentVariantDraftCore,
  validateReservationDocumentVariantDraftCore,
} from "./reservation-document-variant-management-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  CreateNextReservationDocumentVariantVersionInput,
  CreateNextReservationDocumentVariantVersionResult,
  CreateReservationDocumentVariantDraftInput,
  CreateReservationDocumentVariantDraftResult,
  ListReservationDocumentVariantsInput,
  ListReservationDocumentVariantsResult,
  ListReservationDocumentVariantVersionsInput,
  ListReservationDocumentVariantVersionsResult,
  PublishReservationDocumentVariantVersionInput,
  PublishReservationDocumentVariantVersionResult,
  ReservationDocumentVariantDto,
  ReservationDocumentVariantManagementError,
  ReservationDocumentVariantManagementErrorCode,
  ReservationDocumentVariantVersionDto,
  SaveReservationDocumentVariantDraftInput,
  SaveReservationDocumentVariantDraftResult,
  ValidateReservationDocumentVariantDraftInput,
  ValidateReservationDocumentVariantDraftResult,
} from "./reservation-document-variant-management-core";

async function serverClient(supabase?: Supabase) {
  return supabase ?? (await createClient());
}

export async function listReservationDocumentVariants(
  input: Parameters<typeof listReservationDocumentVariantsCore>[0],
  supabase?: Supabase,
) {
  return listReservationDocumentVariantsCore(input, await serverClient(supabase));
}

export async function listReservationDocumentVariantVersions(
  input: Parameters<typeof listReservationDocumentVariantVersionsCore>[0],
  supabase?: Supabase,
) {
  return listReservationDocumentVariantVersionsCore(input, await serverClient(supabase));
}

export async function createReservationDocumentVariantDraft(
  input: Parameters<typeof createReservationDocumentVariantDraftCore>[0],
  supabase?: Supabase,
) {
  return createReservationDocumentVariantDraftCore(input, await serverClient(supabase));
}

export async function saveReservationDocumentVariantDraft(
  input: Parameters<typeof saveReservationDocumentVariantDraftCore>[0],
  supabase?: Supabase,
) {
  return saveReservationDocumentVariantDraftCore(input, await serverClient(supabase));
}

export async function validateReservationDocumentVariantDraft(
  input: Parameters<typeof validateReservationDocumentVariantDraftCore>[0],
  supabase?: Supabase,
) {
  return validateReservationDocumentVariantDraftCore(input, await serverClient(supabase));
}

export async function createNextReservationDocumentVariantVersion(
  input: Parameters<typeof createNextReservationDocumentVariantVersionCore>[0],
  supabase?: Supabase,
) {
  return createNextReservationDocumentVariantVersionCore(input, await serverClient(supabase));
}

export async function publishReservationDocumentVariantVersion(
  input: Parameters<typeof publishReservationDocumentVariantVersionCore>[0],
  supabase?: Supabase,
) {
  return publishReservationDocumentVariantVersionCore(input, await serverClient(supabase));
}

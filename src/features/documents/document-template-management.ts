import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentTemplateFamilyWithDraftCore,
  createNextDocumentTemplateDraftCore,
  listDocumentTemplateFamiliesCore,
  publishDocumentTemplateDraftCore,
  saveDocumentTemplateDraftCore,
  updateDocumentTemplateFamilyMetadataCore,
  validateDocumentTemplateDraftCore,
} from "./document-template-management-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  CreateDocumentTemplateFamilyWithDraftInput,
  CreateDocumentTemplateFamilyWithDraftResult,
  CreateNextDocumentTemplateDraftInput,
  CreateNextDocumentTemplateDraftResult,
  DocumentTemplateFamilySummary,
  DocumentTemplateManagementError,
  DocumentTemplateManagementErrorCode,
  DocumentTemplateVersionSummary,
  ListDocumentTemplateFamiliesResult,
  PublishDocumentTemplateDraftInput,
  PublishDocumentTemplateDraftResult,
  SaveDocumentTemplateDraftInput,
  SaveDocumentTemplateDraftResult,
  UpdateDocumentTemplateFamilyMetadataInput,
  UpdateDocumentTemplateFamilyMetadataResult,
  ValidateDocumentTemplateDraftInput,
  ValidateDocumentTemplateDraftResult,
} from "./document-template-management-core";

async function serverClient(supabase?: Supabase) {
  return supabase ?? (await createClient());
}

export async function listDocumentTemplateFamilies(
  input: Parameters<typeof listDocumentTemplateFamiliesCore>[0],
  supabase?: Supabase,
) {
  return listDocumentTemplateFamiliesCore(input, await serverClient(supabase));
}

export async function createDocumentTemplateFamilyWithDraft(
  input: Parameters<typeof createDocumentTemplateFamilyWithDraftCore>[0],
  supabase?: Supabase,
) {
  return createDocumentTemplateFamilyWithDraftCore(
    input,
    await serverClient(supabase),
  );
}

export async function updateDocumentTemplateFamilyMetadata(
  input: Parameters<typeof updateDocumentTemplateFamilyMetadataCore>[0],
  supabase?: Supabase,
) {
  return updateDocumentTemplateFamilyMetadataCore(
    input,
    await serverClient(supabase),
  );
}

export async function createNextDocumentTemplateDraft(
  input: Parameters<typeof createNextDocumentTemplateDraftCore>[0],
  supabase?: Supabase,
) {
  return createNextDocumentTemplateDraftCore(input, await serverClient(supabase));
}

export async function saveDocumentTemplateDraft(
  input: Parameters<typeof saveDocumentTemplateDraftCore>[0],
  supabase?: Supabase,
) {
  return saveDocumentTemplateDraftCore(input, await serverClient(supabase));
}

export async function validateDocumentTemplateDraft(
  input: Parameters<typeof validateDocumentTemplateDraftCore>[0],
  supabase?: Supabase,
) {
  return validateDocumentTemplateDraftCore(input, await serverClient(supabase));
}

export async function publishDocumentTemplateDraft(
  input: Parameters<typeof publishDocumentTemplateDraftCore>[0],
  supabase?: Supabase,
) {
  return publishDocumentTemplateDraftCore(input, await serverClient(supabase));
}

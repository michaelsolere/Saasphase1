import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

const DOCUMENTS_BUCKET = "documents";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const DOCUMENT_TYPES = new Set([
  "phone_call_summary",
  "plaud_transcript",
  "application_form",
  "reservation_contract",
  "commitment_certificate",
  "payment_receipt",
  "invoice",
  "sale_certificate",
  "welcome_booklet",
  "photo_use_authorization",
  "other",
]);

type Supabase = SupabaseClient<Database>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type NullableUuid = string | null | undefined;

export type DocumentPdfScope = {
  contactId?: NullableUuid;
  applicationId?: NullableUuid;
  reservationId?: NullableUuid;
  litterId?: NullableUuid;
  litterGroupId?: NullableUuid;
  animalId?: NullableUuid;
  paymentId?: NullableUuid;
};

export type StoreDocumentPdfInput = DocumentPdfScope & {
  organizationId: string;
  documentId: string;
  replacesDocumentId?: NullableUuid;
  bytes: Buffer | Uint8Array;
  documentType: string;
  title: string;
  templateId?: NullableUuid;
  generatedFromTemplate?: boolean;
  generatedAt?: string | null;
  sourceTemplateVersion?: number | null;
  generationData?: Json;
  signatureRequired?: boolean;
};

export type DocumentPdfErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "incoherent_metadata"
  | "storage_error"
  | "database_error"
  | "database_outcome_unknown"
  | "orphaned_storage_object";

type ErrorResult = {
  outcome: "error";
  error: { code: DocumentPdfErrorCode; message: string; path?: string };
};

export type StoreDocumentPdfResult =
  | {
      outcome: "created" | "existing";
      documentId: string;
      filePath: string;
      fileSha256: string;
      version: number;
    }
  | ErrorResult;

export type ReadDocumentPdfResult =
  | { outcome: "success"; document: DocumentRow; bytes: Uint8Array }
  | ErrorResult;

export type SignDocumentPdfResult =
  | { outcome: "success"; document: DocumentRow; signedUrl: string; expiresIn: number }
  | ErrorResult;

export type DocumentPdfLogger = {
  error: (event: string, details: Record<string, unknown>) => void;
};

const defaultLogger: DocumentPdfLogger = {
  error(event, details) {
    console.error(event, details);
  },
};

function error(code: DocumentPdfErrorCode, message: string, path?: string): ErrorResult {
  return { outcome: "error", error: { code, message, ...(path ? { path } : {}) } };
}

export function normalizeUuid(value: string) {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeOptionalUuid(value: NullableUuid) {
  if (value === null || value === undefined) return null;
  return normalizeUuid(value);
}

export function validateAndHashPdf(bytes: Buffer | Uint8Array) {
  const normalized = new Uint8Array(bytes);
  if (normalized.byteLength < PDF_SIGNATURE.byteLength) return null;

  for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
    if (normalized[index] !== PDF_SIGNATURE[index]) return null;
  }

  return {
    bytes: normalized,
    fileSha256: createHash("sha256").update(normalized).digest("hex"),
    fileSizeBytes: normalized.byteLength,
  };
}

export function buildDocumentPdfPath(
  organizationId: string,
  documentId: string,
  version: number,
  fileSha256: string,
) {
  const organization = normalizeUuid(organizationId);
  const document = normalizeUuid(documentId);
  if (
    !organization ||
    !document ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !SHA256_PATTERN.test(fileSha256)
  ) {
    return null;
  }

  return `organizations/${organization}/documents/${document}/v${version}/${fileSha256}.pdf`;
}

export function parseDocumentPdfPath(path: string) {
  const match = path.match(
    /^organizations\/([0-9a-f-]{36})\/documents\/([0-9a-f-]{36})\/v([1-9][0-9]*)\/([0-9a-f]{64})\.pdf$/,
  );
  if (!match) return null;

  const organizationId = normalizeUuid(match[1]);
  const documentId = normalizeUuid(match[2]);
  const version = Number(match[3]);
  if (!organizationId || !documentId || !Number.isSafeInteger(version)) return null;

  return { organizationId, documentId, version, fileSha256: match[4] };
}

export function isDocumentPdfMetadataCoherent(
  document: Pick<DocumentRow, "organization_id" | "id" | "file_path" | "file_sha256" | "mime_type">,
) {
  if (!document.file_path || !document.file_sha256 || document.mime_type !== "application/pdf") {
    return false;
  }
  const parsed = parseDocumentPdfPath(document.file_path);
  return Boolean(
    parsed &&
      parsed.organizationId === document.organization_id &&
      parsed.documentId === document.id &&
      parsed.fileSha256 === document.file_sha256,
  );
}

function normalizeStoreInput(input: StoreDocumentPdfInput) {
  const organizationId = normalizeUuid(input.organizationId);
  const documentId = normalizeUuid(input.documentId);
  const replacesDocumentId = normalizeOptionalUuid(input.replacesDocumentId);
  const title = input.title.trim();
  const documentType = input.documentType.trim();
  const pdf = validateAndHashPdf(input.bytes);
  const scopeEntries = {
    contactId: normalizeOptionalUuid(input.contactId),
    applicationId: normalizeOptionalUuid(input.applicationId),
    reservationId: normalizeOptionalUuid(input.reservationId),
    litterId: normalizeOptionalUuid(input.litterId),
    litterGroupId: normalizeOptionalUuid(input.litterGroupId),
    animalId: normalizeOptionalUuid(input.animalId),
    paymentId: normalizeOptionalUuid(input.paymentId),
  };
  const optionalUuidValues = [
    input.replacesDocumentId,
    input.contactId,
    input.applicationId,
    input.reservationId,
    input.litterId,
    input.litterGroupId,
    input.animalId,
    input.paymentId,
    input.templateId,
  ];
  if (
    !organizationId ||
    !documentId ||
    !pdf ||
    !title ||
    title.length > 500 ||
    !DOCUMENT_TYPES.has(documentType) ||
    optionalUuidValues.some(
      (value) => value !== undefined && value !== null && !normalizeOptionalUuid(value),
    )
  ) {
    return null;
  }

  const templateId = normalizeOptionalUuid(input.templateId);
  const generatedFromTemplate = input.generatedFromTemplate ?? false;
  if (
    (generatedFromTemplate && (!templateId || !input.generatedAt)) ||
    (input.sourceTemplateVersion !== undefined &&
      input.sourceTemplateVersion !== null &&
      (!Number.isSafeInteger(input.sourceTemplateVersion) || input.sourceTemplateVersion < 1))
  ) {
    return null;
  }

  if (
    documentType === "welcome_booklet" &&
    (Boolean(scopeEntries.litterId) === Boolean(scopeEntries.litterGroupId) ||
      scopeEntries.reservationId || scopeEntries.applicationId || scopeEntries.contactId ||
      scopeEntries.animalId)
  ) {
    return null;
  }
  if (
    (documentType === "reservation_contract" || documentType === "commitment_certificate") &&
    (!scopeEntries.reservationId || !scopeEntries.contactId || scopeEntries.litterGroupId)
  ) {
    return null;
  }

  return {
    organizationId,
    documentId,
    replacesDocumentId,
    title,
    documentType,
    templateId,
    generatedFromTemplate,
    generatedAt: input.generatedAt ?? null,
    sourceTemplateVersion: input.sourceTemplateVersion ?? null,
    generationData: input.generationData ?? {},
    signatureRequired: input.signatureRequired ?? false,
    ...scopeEntries,
    ...pdf,
  };
}

async function authorize(
  supabase: Supabase,
  organizationId: string,
  write: boolean,
): Promise<{ userId: string } | ErrorResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return error("unauthenticated", "Authentication required.");

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userData.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error || !membership.data) return error("forbidden", "Organization access denied.");
  if (write && !["owner", "admin", "member"].includes(membership.data.role)) {
    return error("forbidden", "Organization write access denied.");
  }
  return { userId: userData.user.id };
}

async function compensateUploadedObject(
  supabase: Supabase,
  path: string,
  logger: DocumentPdfLogger,
) {
  const removal = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (!removal.error) return null;

  logger.error("document_pdf_storage_orphan", {
    code: "orphaned_storage_object",
    path,
    storageError: removal.error.message,
  });
  return error("orphaned_storage_object", "SQL failed and the uploaded object could not be removed.", path);
}

export async function storeDocumentPdfCore(
  input: StoreDocumentPdfInput,
  supabase: Supabase,
  logger: DocumentPdfLogger = defaultLogger,
): Promise<StoreDocumentPdfResult> {
  const normalized = normalizeStoreInput(input);
  if (!normalized) return error("invalid_input", "Invalid PDF document input.");

  const authorization = await authorize(supabase, normalized.organizationId, true);
  if ("outcome" in authorization) return authorization;

  let version = 1;
  if (normalized.replacesDocumentId) {
    const previous = await supabase
      .from("documents")
      .select("id, organization_id, file_path, file_sha256, mime_type")
      .eq("organization_id", normalized.organizationId)
      .eq("id", normalized.replacesDocumentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (previous.error || !previous.data) return error("not_found", "Previous PDF document not found.");
    if (!isDocumentPdfMetadataCoherent(previous.data)) {
      return error("incoherent_metadata", "Previous PDF metadata is incoherent.");
    }
    version = parseDocumentPdfPath(previous.data.file_path!)!.version + 1;
  }

  const filePath = buildDocumentPdfPath(
    normalized.organizationId,
    normalized.documentId,
    version,
    normalized.fileSha256,
  )!;
  const upload = await supabase.storage.from(DOCUMENTS_BUCKET).upload(filePath, normalized.bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  const duplicateUpload = Boolean(
    upload.error &&
      (upload.error.message.toLowerCase().includes("duplicate") ||
        String((upload.error as { statusCode?: string }).statusCode) === "409"),
  );
  if (upload.error && !duplicateUpload) {
    return error("storage_error", upload.error.message);
  }

  let rpcResult;
  try {
    rpcResult = await supabase.rpc("store_document_pdf_version", {
      p_organization_id: normalized.organizationId,
      p_document_id: normalized.documentId,
      p_replaces_document_id: normalized.replacesDocumentId,
      p_version: version,
      p_document_type: normalized.documentType,
      p_title: normalized.title,
      p_file_path: filePath,
      p_file_sha256: normalized.fileSha256,
      p_file_size_bytes: normalized.fileSizeBytes,
      p_contact_id: normalized.contactId,
      p_application_id: normalized.applicationId,
      p_reservation_id: normalized.reservationId,
      p_litter_id: normalized.litterId,
      p_litter_group_id: normalized.litterGroupId,
      p_animal_id: normalized.animalId,
      p_payment_id: normalized.paymentId,
      p_template_id: normalized.templateId,
      p_generated_from_template: normalized.generatedFromTemplate,
      p_generated_at: normalized.generatedAt,
      p_source_template_version: normalized.sourceTemplateVersion,
      p_generation_data: normalized.generationData,
      p_signature_required: normalized.signatureRequired,
    });
  } catch (rpcError) {
    return error(
      "database_outcome_unknown",
      rpcError instanceof Error ? rpcError.message : "Database outcome is unknown.",
      filePath,
    );
  }

  if (rpcResult.error) {
    if (!duplicateUpload) {
      const compensation = await compensateUploadedObject(supabase, filePath, logger);
      if (compensation) return compensation;
    }
    return error("database_error", rpcResult.error.message);
  }

  const stored = rpcResult.data?.[0];
  if (!stored) return error("database_outcome_unknown", "Database returned no storage result.", filePath);
  return {
    outcome: stored.outcome === "existing" ? "existing" : "created",
    documentId: stored.document_id,
    filePath,
    fileSha256: normalized.fileSha256,
    version,
  };
}

async function readAuthorizedDocument(
  supabase: Supabase,
  organizationIdValue: string,
  documentIdValue: string,
) {
  const organizationId = normalizeUuid(organizationIdValue);
  const documentId = normalizeUuid(documentIdValue);
  if (!organizationId || !documentId) return error("invalid_input", "Invalid document identifier.");
  const authorization = await authorize(supabase, organizationId, false);
  if ("outcome" in authorization) return authorization;

  const result = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error || !result.data) return error("not_found", "PDF document not found.");
  if (!isDocumentPdfMetadataCoherent(result.data)) {
    return error("incoherent_metadata", "PDF path and checksum are incoherent.");
  }
  return result.data;
}

export async function readDocumentPdfCore(
  organizationId: string,
  documentId: string,
  supabase: Supabase,
): Promise<ReadDocumentPdfResult> {
  const document = await readAuthorizedDocument(supabase, organizationId, documentId);
  if ("outcome" in document) return document;
  const downloaded = await supabase.storage.from(DOCUMENTS_BUCKET).download(document.file_path!);
  if (downloaded.error || !downloaded.data) {
    return error("storage_error", downloaded.error?.message ?? "PDF download failed.");
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const validated = validateAndHashPdf(bytes);
  if (!validated || validated.fileSha256 !== document.file_sha256) {
    return error("incoherent_metadata", "Stored PDF bytes do not match the recorded checksum.");
  }
  return {
    outcome: "success",
    document,
    bytes,
  };
}

export async function createDocumentPdfSignedUrlCore(
  organizationId: string,
  documentId: string,
  expiresIn: number,
  supabase: Supabase,
): Promise<SignDocumentPdfResult> {
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 60) {
    return error("invalid_input", "Signed URL duration must be between 1 and 60 seconds.");
  }
  const document = await readAuthorizedDocument(supabase, organizationId, documentId);
  if ("outcome" in document) return document;
  const signed = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(
    document.file_path!,
    expiresIn,
  );
  if (signed.error || !signed.data) return error("storage_error", signed.error?.message ?? "Signed URL creation failed.");
  return { outcome: "success", document, signedUrl: signed.data.signedUrl, expiresIn };
}

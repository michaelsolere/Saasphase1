import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import {
  isDocumentPdfMetadataCoherent,
  readDocumentPdfCore,
} from "@/features/documents/document-pdf-storage-core";

export const DOCUMENT_SIGNED_RETURN_BUCKET = "documents";
export const DOCUMENT_SIGNED_RETURN_MAX_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PDF_EOF = new Uint8Array([0x25, 0x25, 0x45, 0x4f, 0x46]);

type Supabase = SupabaseClient<Database>;
type SignedReturnRow = Database["public"]["Tables"]["document_signed_returns"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export type PrepareDocumentSignedReturnUploadInput = {
  documentId: string;
  fileSha256: string;
  fileSizeBytes: number;
};

export type PreparedDocumentSignedReturnUpload = {
  outcome: "prepared";
  signedReturnId: string;
  documentId: string;
  filePath: string;
  uploadToken: string;
};

export type PrepareDocumentSignedReturnUploadResult =
  | PreparedDocumentSignedReturnUpload
  | ErrorResult;

export type FinalizeDocumentSignedReturnUploadResult =
  | {
      outcome: "created" | "existing";
      signedReturnId: string;
      documentId: string;
      filePath: string;
      fileSha256: string;
      fileSizeBytes: number;
    }
  | ErrorResult;

export type ArchiveDocumentSignedReturnInput = {
  organizationId: string;
  documentId: string;
  signedReturnId: string;
  bytes: Buffer | Uint8Array;
};

export type DocumentSignedReturnErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "incoherent_metadata"
  | "storage_error"
  | "database_error"
  | "orphaned_storage_object";

type ErrorResult = {
  outcome: "error";
  error: { code: DocumentSignedReturnErrorCode; message: string };
};

export type ArchiveDocumentSignedReturnResult =
  | {
      outcome: "created" | "existing";
      signedReturnId: string;
      documentId: string;
      filePath: string;
      fileSha256: string;
      fileSizeBytes: number;
    }
  | ErrorResult;

export type ReadDocumentSignedReturnResult =
  | { outcome: "success"; signedReturn: SignedReturnRow; bytes: Uint8Array }
  | ErrorResult;

export type DocumentSignedReturnLogger = {
  error: (event: string, details: Record<string, unknown>) => void;
};

const defaultLogger: DocumentSignedReturnLogger = {
  error(event, details) {
    console.error(event, details);
  },
};

function error(code: DocumentSignedReturnErrorCode, message: string): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

export function normalizeDocumentSignedReturnUuid(value: string) {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function hasPdfEof(bytes: Uint8Array) {
  const minimumIndex = Math.max(0, bytes.byteLength - 1024);
  for (let index = bytes.byteLength - PDF_EOF.byteLength; index >= minimumIndex; index -= 1) {
    let matches = true;
    for (let offset = 0; offset < PDF_EOF.byteLength; offset += 1) {
      if (bytes[index + offset] !== PDF_EOF[offset]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    for (let offset = index + PDF_EOF.byteLength; offset < bytes.byteLength; offset += 1) {
      if (![0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(bytes[offset])) return false;
    }
    return true;
  }
  return false;
}

export function validateAndHashSignedReturnPdf(bytes: Buffer | Uint8Array) {
  const normalized = new Uint8Array(bytes);
  if (
    normalized.byteLength < 13 ||
    normalized.byteLength > DOCUMENT_SIGNED_RETURN_MAX_BYTES ||
    normalized[0] !== 0x25 ||
    normalized[1] !== 0x50 ||
    normalized[2] !== 0x44 ||
    normalized[3] !== 0x46 ||
    normalized[4] !== 0x2d ||
    ![0x31, 0x32].includes(normalized[5]) ||
    normalized[6] !== 0x2e ||
    normalized[7] < 0x30 ||
    normalized[7] > 0x39 ||
    !hasPdfEof(normalized)
  ) {
    return null;
  }

  return {
    bytes: normalized,
    fileSha256: createHash("sha256").update(normalized).digest("hex"),
    fileSizeBytes: normalized.byteLength,
  };
}

export function buildDocumentSignedReturnPath(
  organizationId: string,
  documentId: string,
  signedReturnId: string,
  fileSha256: string,
) {
  const organization = normalizeDocumentSignedReturnUuid(organizationId);
  const document = normalizeDocumentSignedReturnUuid(documentId);
  const signedReturn = normalizeDocumentSignedReturnUuid(signedReturnId);
  if (!organization || !document || !signedReturn || !SHA256_PATTERN.test(fileSha256)) {
    return null;
  }

  return `organizations/${organization}/documents/${document}/signed-returns/${signedReturn}/${fileSha256}.pdf`;
}

export function parseDocumentSignedReturnPath(path: string) {
  const match = path.match(
    /^organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/signed-returns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\.pdf$/,
  );
  if (!match) return null;

  const organizationId = normalizeDocumentSignedReturnUuid(match[1]);
  const documentId = normalizeDocumentSignedReturnUuid(match[2]);
  const signedReturnId = normalizeDocumentSignedReturnUuid(match[3]);
  if (!organizationId || !documentId || !signedReturnId) return null;
  return { organizationId, documentId, signedReturnId, fileSha256: match[4] };
}

export function deriveDocumentSignedReturnId(
  organizationIdValue: string,
  documentIdValue: string,
  fileSha256: string,
) {
  const organizationId = normalizeDocumentSignedReturnUuid(organizationIdValue);
  const documentId = normalizeDocumentSignedReturnUuid(documentIdValue);
  if (!organizationId || !documentId || !SHA256_PATTERN.test(fileSha256)) return null;

  const bytes = createHash("sha256")
    .update(`document-signed-return\0${organizationId}\0${documentId}\0${fileSha256}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function authorize(supabase: Supabase, organizationId: string, write: boolean) {
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) {
    return error("unauthenticated", "Authentication is required.");
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return error("forbidden", "This operation is not permitted.");
  }
  if (write && !["owner", "admin", "member"].includes(membership.data.role)) {
    return error("forbidden", "This operation is not permitted.");
  }
  return null;
}

async function verifyStoredBytes(
  supabase: Supabase,
  path: string,
  expectedSha256: string,
  expectedSize: number,
) {
  const downloaded = await supabase.storage
    .from(DOCUMENT_SIGNED_RETURN_BUCKET)
    .download(path);
  if (downloaded.error || !downloaded.data) return false;
  const validated = validateAndHashSignedReturnPdf(
    new Uint8Array(await downloaded.data.arrayBuffer()),
  );
  return Boolean(
    validated &&
      validated.fileSha256 === expectedSha256 &&
      validated.fileSizeBytes === expectedSize,
  );
}

export async function compensateDocumentSignedReturnIntent(
  supabase: Supabase,
  path: string,
  logger: DocumentSignedReturnLogger,
) {
  const parsed = parseDocumentSignedReturnPath(path);
  if (!parsed) return error("invalid_input", "The upload intention is invalid.");

  const referenced = await supabase
    .from("document_signed_returns")
    .select("id")
    .eq("file_path", path)
    .limit(1);
  if (referenced.error) {
    return error("database_error", "The upload intention could not be checked safely.");
  }
  if (referenced.data.length > 0) {
    return error("conflict", "An archived signed PDF cannot be removed.");
  }

  const removed = await supabase.storage
    .from(DOCUMENT_SIGNED_RETURN_BUCKET)
    .remove([path]);
  if (!removed.error) return null;

  logger.error("document_signed_return_storage_orphan", {
    path,
    storageError: removed.error.message,
  });
  return error(
    "orphaned_storage_object",
    "The signed PDF could not be archived safely.",
  );
}

function isEligibleDocument(
  document: Pick<
    DocumentRow,
    | "id"
    | "organization_id"
    | "document_type"
    | "status"
    | "sent_at"
    | "deleted_at"
    | "file_path"
    | "file_sha256"
    | "file_size_bytes"
    | "mime_type"
  >,
) {
  return Boolean(
    document.deleted_at === null &&
      ["reservation_contract", "commitment_certificate"].includes(
        document.document_type,
      ) &&
      ["sent", "signed"].includes(document.status) &&
      document.sent_at &&
      isDocumentPdfMetadataCoherent(document),
  );
}

const eligibilityFields =
  "id, organization_id, document_type, status, sent_at, deleted_at, file_path, file_sha256, file_size_bytes, mime_type";

async function loadDocumentForWrite(documentId: string, supabase: Supabase) {
  const document = await supabase
    .from("documents")
    .select(eligibilityFields)
    .eq("id", documentId)
    .maybeSingle();
  if (document.error || !document.data) return error("not_found", "The document was not found.");

  const authorization = await authorize(supabase, document.data.organization_id, true);
  if (authorization) return authorization;
  return { outcome: "success" as const, document: document.data as DocumentRow };
}

async function verifyEligibleOriginal(document: DocumentRow, supabase: Supabase) {
  if (!isEligibleDocument(document)) {
    return error("conflict", "This document version cannot receive a signed PDF.");
  }

  const original = await readDocumentPdfCore(
    document.organization_id,
    document.id,
    supabase,
  );
  if (original.outcome !== "success") {
    return error("incoherent_metadata", "The original PDF could not be verified.");
  }
  return { outcome: "success" as const };
}

async function loadEligibleDocument(documentId: string, supabase: Supabase) {
  const loaded = await loadDocumentForWrite(documentId, supabase);
  if (loaded.outcome !== "success") return loaded;
  const eligible = await verifyEligibleOriginal(loaded.document, supabase);
  if (eligible.outcome !== "success") return eligible;
  return loaded;
}

export async function prepareDocumentSignedReturnUploadCore(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase: Supabase,
): Promise<PrepareDocumentSignedReturnUploadResult> {
  const documentId = normalizeDocumentSignedReturnUuid(input.documentId);
  if (
    !documentId ||
    !SHA256_PATTERN.test(input.fileSha256) ||
    !Number.isSafeInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > DOCUMENT_SIGNED_RETURN_MAX_BYTES
  ) {
    return error("invalid_input", "A valid PDF upload intention is required.");
  }

  const eligible = await loadEligibleDocument(documentId, supabase);
  if (eligible.outcome !== "success") return eligible;
  const organizationId = eligible.document.organization_id;
  const signedReturnId = deriveDocumentSignedReturnId(
    organizationId,
    documentId,
    input.fileSha256,
  )!;
  const filePath = buildDocumentSignedReturnPath(
    organizationId,
    documentId,
    signedReturnId,
    input.fileSha256,
  )!;

  const existing = await supabase
    .from("document_signed_returns")
    .select("id, document_id, file_path, file_sha256, file_size_bytes")
    .eq("document_id", documentId)
    .maybeSingle();
  if (existing.error) return error("database_error", "The upload intention could not be prepared.");
  if (existing.data) {
    return error("conflict", "A signed PDF is already archived for this version.");
  }

  const signedUpload = await supabase.storage
    .from(DOCUMENT_SIGNED_RETURN_BUCKET)
    .createSignedUploadUrl(filePath, { upsert: false });
  if (signedUpload.error || !signedUpload.data?.token) {
    return error("storage_error", "The upload intention could not be prepared.");
  }

  return {
    outcome: "prepared",
    signedReturnId,
    documentId,
    filePath,
    uploadToken: signedUpload.data.token,
  };
}

async function reconcileUnknownRpcOutcome(
  supabase: Supabase,
  intent: {
    organizationId: string;
    documentId: string;
    signedReturnId: string;
    filePath: string;
    fileSha256: string;
    fileSizeBytes: number;
  },
) {
  const result = await supabase
    .from("document_signed_returns")
    .select("id, organization_id, document_id, file_path, file_sha256, file_size_bytes, mime_type")
    .eq("organization_id", intent.organizationId)
    .eq("id", intent.signedReturnId)
    .maybeSingle();
  if (result.error) return { outcome: "unknown" } as const;
  if (!result.data) return { outcome: "absent" } as const;
  if (
    result.data.document_id === intent.documentId &&
    result.data.file_path === intent.filePath &&
    result.data.file_sha256 === intent.fileSha256 &&
    result.data.file_size_bytes === intent.fileSizeBytes &&
    result.data.mime_type === "application/pdf"
  ) {
    return { outcome: "existing" } as const;
  }
  return { outcome: "conflict" } as const;
}

export async function archiveDocumentSignedReturnCore(
  input: ArchiveDocumentSignedReturnInput,
  supabase: Supabase,
  logger: DocumentSignedReturnLogger = defaultLogger,
): Promise<ArchiveDocumentSignedReturnResult> {
  const organizationId = normalizeDocumentSignedReturnUuid(input.organizationId);
  const documentId = normalizeDocumentSignedReturnUuid(input.documentId);
  const signedReturnId = normalizeDocumentSignedReturnUuid(input.signedReturnId);
  const pdf = validateAndHashSignedReturnPdf(input.bytes);
  if (!organizationId || !documentId || !signedReturnId || !pdf) {
    return error("invalid_input", "A valid signed PDF of at most 10 MiB is required.");
  }

  const authorization = await authorize(supabase, organizationId, true);
  if (authorization) return authorization;

  const filePath = buildDocumentSignedReturnPath(
    organizationId,
    documentId,
    signedReturnId,
    pdf.fileSha256,
  )!;
  const upload = await supabase.storage
    .from(DOCUMENT_SIGNED_RETURN_BUCKET)
    .upload(filePath, pdf.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  const duplicateUpload = Boolean(
    upload.error &&
      (upload.error.message.toLowerCase().includes("duplicate") ||
        String((upload.error as { statusCode?: string }).statusCode) === "409"),
  );
  if (upload.error && !duplicateUpload) {
    logger.error("document_signed_return_upload_failed", {
      path: filePath,
      storageError: upload.error.message,
    });
    return error("storage_error", "The signed PDF could not be archived safely.");
  }
  return finalizeUploadedDocumentSignedReturn(
    {
      organizationId,
      documentId,
      signedReturnId,
      filePath,
      fileSha256: pdf.fileSha256,
      fileSizeBytes: pdf.fileSizeBytes,
    },
    supabase,
    logger,
  );
}

async function finalizeUploadedDocumentSignedReturn(
  intent: {
    organizationId: string;
    documentId: string;
    signedReturnId: string;
    filePath: string;
    fileSha256: string;
    fileSizeBytes: number;
  },
  supabase: Supabase,
  logger: DocumentSignedReturnLogger,
): Promise<FinalizeDocumentSignedReturnUploadResult> {
  const {
    organizationId,
    documentId,
    signedReturnId,
    filePath,
    fileSha256,
    fileSizeBytes,
  } = intent;

  if (!(await verifyStoredBytes(supabase, filePath, fileSha256, fileSizeBytes))) {
    logger.error("document_signed_return_uploaded_object_invalid", { path: filePath });
    const compensated = await compensateDocumentSignedReturnIntent(
      supabase,
      filePath,
      logger,
    );
    if (compensated && compensated.error.code !== "conflict") return compensated;
    return error("incoherent_metadata", "The signed PDF could not be verified.");
  }

  let rpcResult;
  try {
    rpcResult = await supabase.rpc("archive_document_signed_return", {
      p_organization_id: organizationId,
      p_document_id: documentId,
      p_signed_return_id: signedReturnId,
      p_file_path: filePath,
      p_file_sha256: fileSha256,
      p_file_size_bytes: fileSizeBytes,
      p_mime_type: "application/pdf",
    });
  } catch (rpcError) {
    logger.error("document_signed_return_rpc_threw", {
      path: filePath,
      databaseError: rpcError instanceof Error ? rpcError.message : String(rpcError),
    });
    const reconciliation = await reconcileUnknownRpcOutcome(supabase, {
      organizationId,
      documentId,
      signedReturnId,
      filePath,
      fileSha256,
      fileSizeBytes,
    });
    if (reconciliation.outcome === "existing") {
      return {
        outcome: "existing",
        signedReturnId,
        documentId,
        filePath,
        fileSha256,
        fileSizeBytes,
      };
    }
    if (reconciliation.outcome === "absent" || reconciliation.outcome === "conflict") {
      const compensated = await compensateDocumentSignedReturnIntent(
        supabase,
        filePath,
        logger,
      );
      if (compensated) return compensated;
    }
    return error("database_error", "The signed PDF could not be archived safely.");
  }

  if (rpcResult.error) {
    logger.error("document_signed_return_rpc_failed", {
      path: filePath,
      databaseCode: rpcResult.error.code,
      databaseError: rpcResult.error.message,
    });
    const reconciliation = await reconcileUnknownRpcOutcome(supabase, intent);
    if (reconciliation.outcome === "existing") {
      return {
        outcome: "existing",
        signedReturnId,
        documentId,
        filePath,
        fileSha256,
        fileSizeBytes,
      };
    }
    if (reconciliation.outcome === "absent" || reconciliation.outcome === "conflict") {
      const compensated = await compensateDocumentSignedReturnIntent(
        supabase,
        filePath,
        logger,
      );
      if (compensated) return compensated;
    }
    return error("conflict", "The signed PDF could not be archived safely.");
  }

  const stored = rpcResult.data?.[0];
  if (!stored || !["created", "existing"].includes(stored.outcome)) {
    logger.error("document_signed_return_rpc_invalid_result", { path: filePath });
    const reconciliation = await reconcileUnknownRpcOutcome(supabase, intent);
    if (reconciliation.outcome === "absent" || reconciliation.outcome === "conflict") {
      const compensated = await compensateDocumentSignedReturnIntent(
        supabase,
        filePath,
        logger,
      );
      if (compensated) return compensated;
    }
    return error("database_error", "The signed PDF could not be archived safely.");
  }

  return {
    outcome: stored.outcome === "existing" ? "existing" : "created",
    signedReturnId: stored.signed_return_id,
    documentId,
    filePath,
    fileSha256,
    fileSizeBytes,
  };
}

export async function finalizeDocumentSignedReturnUploadCore(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase: Supabase,
  logger: DocumentSignedReturnLogger = defaultLogger,
): Promise<FinalizeDocumentSignedReturnUploadResult> {
  const documentId = normalizeDocumentSignedReturnUuid(input.documentId);
  if (
    !documentId ||
    !SHA256_PATTERN.test(input.fileSha256) ||
    !Number.isSafeInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > DOCUMENT_SIGNED_RETURN_MAX_BYTES
  ) {
    return error("invalid_input", "A valid PDF upload intention is required.");
  }

  const loaded = await loadDocumentForWrite(documentId, supabase);
  if (loaded.outcome !== "success") return loaded;
  const organizationId = loaded.document.organization_id;
  const signedReturnId = deriveDocumentSignedReturnId(
    organizationId,
    documentId,
    input.fileSha256,
  )!;
  const filePath = buildDocumentSignedReturnPath(
    organizationId,
    documentId,
    signedReturnId,
    input.fileSha256,
  )!;

  const eligibility = await verifyEligibleOriginal(loaded.document, supabase);
  if (eligibility.outcome !== "success") {
    const compensated = await compensateDocumentSignedReturnIntent(
      supabase,
      filePath,
      logger,
    );
    if (compensated && compensated.error.code !== "conflict") return compensated;
    return eligibility;
  }

  return finalizeUploadedDocumentSignedReturn(
    {
      organizationId,
      documentId,
      signedReturnId,
      filePath,
      fileSha256: input.fileSha256,
      fileSizeBytes: input.fileSizeBytes,
    },
    supabase,
    logger,
  );
}

export async function abandonDocumentSignedReturnUploadCore(
  input: PrepareDocumentSignedReturnUploadInput,
  supabase: Supabase,
  logger: DocumentSignedReturnLogger = defaultLogger,
) {
  const documentId = normalizeDocumentSignedReturnUuid(input.documentId);
  if (!documentId || !SHA256_PATTERN.test(input.fileSha256)) {
    return error("invalid_input", "The upload intention is invalid.");
  }
  const eligible = await loadDocumentForWrite(documentId, supabase);
  if (eligible.outcome !== "success") return eligible;
  const signedReturnId = deriveDocumentSignedReturnId(
    eligible.document.organization_id,
    documentId,
    input.fileSha256,
  )!;
  const filePath = buildDocumentSignedReturnPath(
    eligible.document.organization_id,
    documentId,
    signedReturnId,
    input.fileSha256,
  )!;
  const compensated = await compensateDocumentSignedReturnIntent(
    supabase,
    filePath,
    logger,
  );
  return compensated ?? { outcome: "removed" as const };
}

export async function readDocumentSignedReturnCore(
  organizationIdValue: string,
  signedReturnIdValue: string,
  supabase: Supabase,
): Promise<ReadDocumentSignedReturnResult> {
  const organizationId = normalizeDocumentSignedReturnUuid(organizationIdValue);
  const signedReturnId = normalizeDocumentSignedReturnUuid(signedReturnIdValue);
  if (!organizationId || !signedReturnId) {
    return error("invalid_input", "Invalid signed PDF identifier.");
  }

  const authorization = await authorize(supabase, organizationId, false);
  if (authorization) return authorization;

  const result = await supabase
    .from("document_signed_returns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", signedReturnId)
    .maybeSingle();
  if (result.error || !result.data) {
    return error("not_found", "The signed PDF was not found.");
  }

  const parsed = parseDocumentSignedReturnPath(result.data.file_path);
  if (
    !parsed ||
    parsed.organizationId !== result.data.organization_id ||
    parsed.documentId !== result.data.document_id ||
    parsed.signedReturnId !== result.data.id ||
    parsed.fileSha256 !== result.data.file_sha256 ||
    result.data.mime_type !== "application/pdf" ||
    result.data.file_size_bytes <= 0 ||
    result.data.file_size_bytes > DOCUMENT_SIGNED_RETURN_MAX_BYTES
  ) {
    return error("incoherent_metadata", "The signed PDF could not be verified.");
  }

  const downloaded = await supabase.storage
    .from(DOCUMENT_SIGNED_RETURN_BUCKET)
    .download(result.data.file_path);
  if (downloaded.error || !downloaded.data) {
    return error("storage_error", "The signed PDF could not be read.");
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const validated = validateAndHashSignedReturnPdf(bytes);
  if (
    !validated ||
    validated.fileSha256 !== result.data.file_sha256 ||
    validated.fileSizeBytes !== result.data.file_size_bytes
  ) {
    return error("incoherent_metadata", "The signed PDF could not be verified.");
  }

  return { outcome: "success", signedReturn: result.data, bytes };
}

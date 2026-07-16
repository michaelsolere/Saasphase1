import { createHash } from "node:crypto";

import type { Json } from "@/types/database.types";

export const MAX_TRANSACTIONAL_EMAIL_ATTACHMENTS = 10;
export const MAX_TRANSACTIONAL_EMAIL_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSACTIONAL_EMAIL_ATTACHMENTS_TOTAL_BYTES = 12 * 1024 * 1024;

export type TransactionalEmailAttachmentDocumentType =
  | "commitment_certificate"
  | "reservation_contract";

export type TransactionalEmailAttachmentSnapshot = {
  kind: "document_pdf";
  documentId: string;
  documentType: TransactionalEmailAttachmentDocumentType;
  fileName: string;
  fileSha256: string;
  fileSizeBytes: number;
  version: number;
};

export type TransactionalEmailAttachment = {
  name: string;
  content: string;
  snapshot: TransactionalEmailAttachmentSnapshot;
};

export type TransactionalEmailAttachmentSnapshotJson = {
  kind: "document_pdf";
  document_id: string;
  document_type: TransactionalEmailAttachmentDocumentType;
  file_name: string;
  file_sha256: string;
  file_size_bytes: number;
  version: number;
};

export type ValidatedTransactionalEmailAttachment = {
  name: string;
  content: string;
  snapshot: TransactionalEmailAttachmentSnapshotJson;
};

export type TransactionalEmailAttachmentValidationResult =
  | { ok: true; attachments: ValidatedTransactionalEmailAttachment[] }
  | { ok: false; errorCode: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const INVALID_BASE64_CHARACTER_PATTERN = /[^A-Za-z0-9+/]/;

function isDocumentType(
  value: unknown,
): value is TransactionalEmailAttachmentDocumentType {
  return (
    value === "commitment_certificate" || value === "reservation_contract"
  );
}

function isSafePdfName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 5 &&
    value.length <= 255 &&
    value === value.trim() &&
    value.endsWith(".pdf") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.includes("..")
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function decodeStrictBase64(value: string) {
  if (!value || value.length % 4 !== 0) return null;

  const paddingLength = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const unpaddedValue = paddingLength ? value.slice(0, -paddingLength) : value;
  if (
    unpaddedValue.includes("=") ||
    INVALID_BASE64_CHARACTER_PATTERN.test(unpaddedValue)
  ) {
    return null;
  }

  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) return null;
  return bytes;
}

function snapshotToJson(
  snapshot: TransactionalEmailAttachmentSnapshot,
): TransactionalEmailAttachmentSnapshotJson {
  return {
    kind: "document_pdf",
    document_id: snapshot.documentId,
    document_type: snapshot.documentType,
    file_name: snapshot.fileName,
    file_sha256: snapshot.fileSha256,
    file_size_bytes: snapshot.fileSizeBytes,
    version: snapshot.version,
  };
}

export function normalizeTransactionalEmailAttachmentSnapshotJson(
  value: unknown,
): TransactionalEmailAttachmentSnapshotJson[] | null {
  if (!Array.isArray(value) || value.length > MAX_TRANSACTIONAL_EMAIL_ATTACHMENTS) {
    return null;
  }

  const normalized: TransactionalEmailAttachmentSnapshotJson[] = [];
  const documentIds = new Set<string>();
  let sawReservationContract = false;

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.join("|") !==
      "document_id|document_type|file_name|file_sha256|file_size_bytes|kind|version"
    ) {
      return null;
    }
    if (
      record.kind !== "document_pdf" ||
      typeof record.document_id !== "string" ||
      !UUID_PATTERN.test(record.document_id) ||
      !isDocumentType(record.document_type) ||
      !isSafePdfName(record.file_name) ||
      typeof record.file_sha256 !== "string" ||
      !SHA256_PATTERN.test(record.file_sha256) ||
      !isPositiveSafeInteger(record.file_size_bytes) ||
      !isPositiveSafeInteger(record.version) ||
      documentIds.has(record.document_id)
    ) {
      return null;
    }
    if (record.document_type === "commitment_certificate" && sawReservationContract) {
      return null;
    }
    if (record.document_type === "reservation_contract") {
      sawReservationContract = true;
    }
    documentIds.add(record.document_id);
    normalized.push({
      kind: "document_pdf",
      document_id: record.document_id,
      document_type: record.document_type,
      file_name: record.file_name,
      file_sha256: record.file_sha256,
      file_size_bytes: record.file_size_bytes,
      version: record.version,
    });
  }

  return normalized;
}

export function validateTransactionalEmailAttachments(
  value: TransactionalEmailAttachment[] | undefined,
): TransactionalEmailAttachmentValidationResult {
  if (value === undefined) return { ok: true, attachments: [] };
  if (!Array.isArray(value) || value.length > MAX_TRANSACTIONAL_EMAIL_ATTACHMENTS) {
    return { ok: false, errorCode: "invalid_attachment_count" };
  }

  const attachments: ValidatedTransactionalEmailAttachment[] = [];
  const documentIds = new Set<string>();
  let totalBytes = 0;
  let sawReservationContract = false;

  for (const attachment of value) {
    if (!attachment || typeof attachment !== "object") {
      return { ok: false, errorCode: "invalid_attachment" };
    }
    const { snapshot } = attachment;
    if (!snapshot || snapshot.kind !== "document_pdf") {
      return { ok: false, errorCode: "invalid_attachment_snapshot" };
    }
    if (!isSafePdfName(attachment.name) || attachment.name !== snapshot.fileName) {
      return { ok: false, errorCode: "unsafe_attachment_name" };
    }
    if (!UUID_PATTERN.test(snapshot.documentId)) {
      return { ok: false, errorCode: "invalid_attachment_document_id" };
    }
    if (!isDocumentType(snapshot.documentType)) {
      return { ok: false, errorCode: "invalid_attachment_document_type" };
    }
    if (!SHA256_PATTERN.test(snapshot.fileSha256)) {
      return { ok: false, errorCode: "invalid_attachment_sha256" };
    }
    if (
      !isPositiveSafeInteger(snapshot.fileSizeBytes) ||
      !isPositiveSafeInteger(snapshot.version)
    ) {
      return { ok: false, errorCode: "invalid_attachment_snapshot" };
    }
    if (documentIds.has(snapshot.documentId)) {
      return { ok: false, errorCode: "duplicate_attachment_document" };
    }
    if (snapshot.documentType === "commitment_certificate" && sawReservationContract) {
      return { ok: false, errorCode: "invalid_attachment_order" };
    }
    if (snapshot.documentType === "reservation_contract") {
      sawReservationContract = true;
    }

    const bytes = decodeStrictBase64(attachment.content);
    if (!bytes) return { ok: false, errorCode: "invalid_attachment_base64" };
    if (bytes.length > MAX_TRANSACTIONAL_EMAIL_ATTACHMENT_BYTES) {
      return { ok: false, errorCode: "attachment_too_large" };
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TRANSACTIONAL_EMAIL_ATTACHMENTS_TOTAL_BYTES) {
      return { ok: false, errorCode: "attachments_too_large" };
    }
    if (bytes.length < 5 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return { ok: false, errorCode: "invalid_attachment_pdf" };
    }
    if (bytes.length !== snapshot.fileSizeBytes) {
      return { ok: false, errorCode: "attachment_size_mismatch" };
    }
    if (createHash("sha256").update(bytes).digest("hex") !== snapshot.fileSha256) {
      return { ok: false, errorCode: "attachment_sha256_mismatch" };
    }

    documentIds.add(snapshot.documentId);
    attachments.push({
      name: attachment.name,
      content: attachment.content,
      snapshot: snapshotToJson(snapshot),
    });
  }

  return { ok: true, attachments };
}

export function attachmentSnapshotsEqual(
  left: TransactionalEmailAttachmentSnapshotJson[],
  right: TransactionalEmailAttachmentSnapshotJson[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function toAttachmentSnapshotJson(
  value: TransactionalEmailAttachmentSnapshotJson[],
): Json {
  return value as Json;
}

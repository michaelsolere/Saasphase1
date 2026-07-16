import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeTransactionalEmailAttachmentSnapshotJson,
  type TransactionalEmailAttachment,
  type TransactionalEmailAttachmentDocumentType,
  type TransactionalEmailAttachmentSnapshotJson,
} from "@/features/communications/transactional-email-attachments";
import {
  isDocumentPdfMetadataCoherent,
  parseDocumentPdfPath,
  readDocumentPdfCore,
} from "@/features/documents/document-pdf-storage-core";
import { parseDocumentGenerationSnapshot } from "@/features/documents/parse-document-generation-snapshot";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const DOCUMENT_TYPES = [
  "commitment_certificate",
  "reservation_contract",
] as const satisfies readonly TransactionalEmailAttachmentDocumentType[];

export type BirthDocumentsDepositAttachmentErrorCode =
  | "missing_documents"
  | "incoherent_documents"
  | "documents_not_sendable";

export type BirthDocumentsDepositDocumentPreview = {
  documentType: TransactionalEmailAttachmentDocumentType;
  version: number;
};

export type BirthDocumentsDepositDocumentEligibility =
  | { ok: true; documents: BirthDocumentsDepositDocumentPreview[] }
  | { ok: false; errorCode: BirthDocumentsDepositAttachmentErrorCode };

type CandidateDocument = Pick<
  DocumentRow,
  | "id"
  | "organization_id"
  | "reservation_id"
  | "document_type"
  | "status"
  | "deleted_at"
  | "superseded_at"
  | "file_path"
  | "file_sha256"
  | "file_size_bytes"
  | "mime_type"
  | "generated_from_template"
  | "generated_at"
  | "template_id"
  | "source_template_version"
  | "generation_data"
>;

function fileName(documentType: TransactionalEmailAttachmentDocumentType, version: number) {
  return documentType === "commitment_certificate"
    ? `certificat-engagement-v${version}.pdf`
    : `contrat-reservation-v${version}.pdf`;
}

function validateDocumentOrigin(
  document: CandidateDocument,
  organizationId: string,
  reservationId: string,
) {
  if (
    document.organization_id !== organizationId ||
    document.reservation_id !== reservationId ||
    !DOCUMENT_TYPES.includes(
      document.document_type as TransactionalEmailAttachmentDocumentType,
    ) ||
    document.deleted_at !== null ||
    !document.generated_from_template ||
    !document.generated_at ||
    !document.template_id ||
    !Number.isSafeInteger(document.source_template_version) ||
    !isDocumentPdfMetadataCoherent(document)
  ) {
    return null;
  }

  const parsedPath = parseDocumentPdfPath(document.file_path!);
  const parsedSnapshot = parseDocumentGenerationSnapshot({
    documentType: document.document_type,
    generationData: document.generation_data,
  });
  if (
    !parsedPath ||
    !parsedSnapshot.success ||
    parsedSnapshot.snapshot.sources.organizationId !== organizationId ||
    parsedSnapshot.snapshot.sources.reservationId !== reservationId
  ) {
    return null;
  }

  return {
    documentType: document.document_type as TransactionalEmailAttachmentDocumentType,
    version: parsedPath.version,
  };
}

export function assessBirthDocumentsDepositDocumentRows(input: {
  organizationId: string;
  reservationId: string;
  documents: CandidateDocument[];
}): BirthDocumentsDepositDocumentEligibility {
  const current = input.documents.filter(
    (document) => document.deleted_at === null && document.superseded_at === null,
  );
  const selected: BirthDocumentsDepositDocumentPreview[] = [];

  for (const documentType of DOCUMENT_TYPES) {
    const matches = current.filter(
      (document) => document.document_type === documentType,
    );
    if (matches.length === 0) return { ok: false, errorCode: "missing_documents" };
    if (matches.length !== 1) {
      return { ok: false, errorCode: "incoherent_documents" };
    }
    if (matches[0].status !== "to_generate") {
      return { ok: false, errorCode: "documents_not_sendable" };
    }
    const validated = validateDocumentOrigin(
      matches[0],
      input.organizationId,
      input.reservationId,
    );
    if (!validated) return { ok: false, errorCode: "incoherent_documents" };
    selected.push(validated);
  }

  return { ok: true, documents: selected };
}

function validateManifest(
  value: unknown,
): TransactionalEmailAttachmentSnapshotJson[] | null {
  const manifest = normalizeTransactionalEmailAttachmentSnapshotJson(value);
  if (
    !manifest ||
    manifest.length !== 2 ||
    manifest[0].document_type !== "commitment_certificate" ||
    manifest[1].document_type !== "reservation_contract"
  ) {
    return null;
  }
  return manifest;
}

export async function loadBirthDocumentsDepositAttachments(input: {
  organizationId: string;
  reservationId: string;
  attachmentsSnapshot: unknown;
  supabase: Supabase;
}): Promise<
  | {
      ok: true;
      attachments: TransactionalEmailAttachment[];
      manifest: TransactionalEmailAttachmentSnapshotJson[];
    }
  | { ok: false; errorCode: BirthDocumentsDepositAttachmentErrorCode }
> {
  const storedManifest = normalizeTransactionalEmailAttachmentSnapshotJson(
    input.attachmentsSnapshot,
  );
  if (!storedManifest) return { ok: false, errorCode: "incoherent_documents" };

  let documents: CandidateDocument[];
  let expectedManifest: TransactionalEmailAttachmentSnapshotJson[] | null = null;
  if (storedManifest.length > 0) {
    expectedManifest = validateManifest(storedManifest);
    if (!expectedManifest) return { ok: false, errorCode: "incoherent_documents" };
    const { data, error } = await input.supabase
      .from("documents")
      .select("*")
      .eq("organization_id", input.organizationId)
      .in("id", expectedManifest.map((entry) => entry.document_id));
    if (error || data?.length !== 2) {
      return { ok: false, errorCode: "incoherent_documents" };
    }
    documents = data;
  } else {
    const { data, error } = await input.supabase
      .from("documents")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("reservation_id", input.reservationId)
      .in("document_type", [...DOCUMENT_TYPES])
      .is("deleted_at", null)
      .is("superseded_at", null);
    if (error || !data) return { ok: false, errorCode: "incoherent_documents" };
    const eligibility = assessBirthDocumentsDepositDocumentRows({
      organizationId: input.organizationId,
      reservationId: input.reservationId,
      documents: data,
    });
    if (!eligibility.ok) return eligibility;
    documents = data;
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const ordered = expectedManifest
    ? expectedManifest.map((entry) => byId.get(entry.document_id))
    : DOCUMENT_TYPES.map((documentType) =>
        documents.find((document) => document.document_type === documentType),
      );
  if (ordered.some((document) => !document)) {
    return { ok: false, errorCode: "incoherent_documents" };
  }

  const attachments: TransactionalEmailAttachment[] = [];
  for (let index = 0; index < DOCUMENT_TYPES.length; index += 1) {
    const document = ordered[index]!;
    if (document.status !== "to_generate") {
      return { ok: false, errorCode: "documents_not_sendable" };
    }
    const origin = validateDocumentOrigin(
      document,
      input.organizationId,
      input.reservationId,
    );
    if (!origin || origin.documentType !== DOCUMENT_TYPES[index]) {
      return { ok: false, errorCode: "incoherent_documents" };
    }
    const expectedName = fileName(origin.documentType, origin.version);
    const expected = expectedManifest?.[index];
    if (
      expected &&
      (expected.document_id !== document.id ||
        expected.document_type !== origin.documentType ||
        expected.file_name !== expectedName ||
        expected.version !== origin.version ||
        expected.file_size_bytes !== document.file_size_bytes ||
        expected.file_sha256 !== document.file_sha256)
    ) {
      return { ok: false, errorCode: "incoherent_documents" };
    }

    const read = await readDocumentPdfCore(
      input.organizationId,
      document.id,
      input.supabase,
    );
    if (
      read.outcome !== "success" ||
      read.bytes.byteLength !== document.file_size_bytes
    ) {
      return { ok: false, errorCode: "incoherent_documents" };
    }
    attachments.push({
      name: expectedName,
      content: Buffer.from(read.bytes).toString("base64"),
      snapshot: {
        kind: "document_pdf",
        documentId: document.id,
        documentType: origin.documentType,
        fileName: expectedName,
        fileSha256: document.file_sha256!,
        fileSizeBytes: document.file_size_bytes!,
        version: origin.version,
      },
    });
  }

  return {
    ok: true,
    attachments,
    manifest: attachments.map((attachment) => ({
      kind: "document_pdf",
      document_id: attachment.snapshot.documentId,
      document_type: attachment.snapshot.documentType,
      file_name: attachment.snapshot.fileName,
      file_sha256: attachment.snapshot.fileSha256,
      file_size_bytes: attachment.snapshot.fileSizeBytes,
      version: attachment.snapshot.version,
    })),
  };
}

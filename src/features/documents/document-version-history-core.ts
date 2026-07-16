import {
  isDocumentPdfMetadataCoherent,
  parseDocumentPdfPath,
} from "@/features/documents/document-pdf-storage-core";
import { parseDocumentGenerationSnapshot } from "@/features/documents/parse-document-generation-snapshot";

export type DocumentVersionSourceKind = "common" | "reservation_variant";

export type DocumentVersionSource = {
  id: string;
  organization_id: string;
  title: string;
  document_type: string;
  status: string;
  sent_at: string | null;
  replaces_document_id: string | null;
  superseded_at: string | null;
  generated_at: string | null;
  generation_data: unknown;
  reservation_document_variant_version_id: string | null;
  reservation_document_variant_version: number | null;
  template_label: string | null;
  source_template_version: number | null;
  file_path: string | null;
  file_sha256: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
};

export type OriginalDocumentPdfArtifact = {
  kind: "original_pdf";
  version: number;
};

export type SignedReturnPdfArtifact = {
  kind: "signed_return_pdf";
  signedReturnId: string;
  receivedAt: string;
  fileSizeBytes: number;
};

export type DocumentVersionArtifact =
  | OriginalDocumentPdfArtifact
  | SignedReturnPdfArtifact;

export type DocumentVersionHistoryEntry = {
  documentId: string;
  title: string;
  documentType: string;
  businessStatus: string;
  sentAt: string | null;
  position: "current" | "historical";
  version: number | null;
  generatedAt: string | null;
  sourceKind: DocumentVersionSourceKind;
  reservationDocumentVariantVersion: number | null;
  sourceTemplateVersion: number | null;
  templateLabel: string | null;
  artifacts: DocumentVersionArtifact[];
};

export type DocumentVersionHistory = {
  currentDocumentId: string;
  canArchiveSignedReturns?: boolean;
  entries: DocumentVersionHistoryEntry[];
};

export type ReconstructDocumentVersionChainResult =
  | { outcome: "success"; history: DocumentVersionHistory }
  | { outcome: "error" };

export type DocumentVersionSourceMetadata = Pick<
  DocumentVersionHistoryEntry,
  | "sourceKind"
  | "reservationDocumentVariantVersion"
  | "sourceTemplateVersion"
  | "templateLabel"
>;

export function deriveDocumentVersionSourceMetadata(
  document: Pick<
    DocumentVersionSource,
    | "document_type"
    | "generation_data"
    | "reservation_document_variant_version_id"
    | "reservation_document_variant_version"
    | "source_template_version"
    | "template_label"
  >,
): DocumentVersionSourceMetadata {
  const parsed = parseDocumentGenerationSnapshot({
    documentType: document.document_type,
    generationData: document.generation_data,
  });

  if (parsed.success) {
    const { snapshot } = parsed;
    if (snapshot.snapshotVersion === 2) {
      return {
        sourceKind: snapshot.template.sourceKind,
        reservationDocumentVariantVersion:
          snapshot.template.sourceKind === "reservation_variant"
            ? snapshot.template.reservationDocumentVariantVersion
            : null,
        sourceTemplateVersion: snapshot.template.templateVersion,
        templateLabel: document.template_label,
      };
    }

    return {
      sourceKind: "common",
      reservationDocumentVariantVersion: null,
      sourceTemplateVersion: snapshot.template.templateVersion,
      templateLabel: document.template_label,
    };
  }

  const isReservationVariant =
    document.reservation_document_variant_version_id !== null;
  return {
    sourceKind: isReservationVariant ? "reservation_variant" : "common",
    reservationDocumentVariantVersion: isReservationVariant
      ? document.reservation_document_variant_version
      : null,
    sourceTemplateVersion: document.source_template_version,
    templateLabel: document.template_label,
  };
}

function toHistoryEntry(
  document: DocumentVersionSource,
  currentDocumentId: string,
): DocumentVersionHistoryEntry {
  const coherentPdf = isDocumentPdfMetadataCoherent(document);
  const parsedPath = coherentPdf
    ? parseDocumentPdfPath(document.file_path!)
    : null;
  const version = parsedPath?.version ?? null;
  const source = deriveDocumentVersionSourceMetadata(document);

  return {
    documentId: document.id,
    title: document.title,
    documentType: document.document_type,
    businessStatus: document.status,
    sentAt: document.sent_at,
    position: document.id === currentDocumentId ? "current" : "historical",
    version,
    generatedAt: document.generated_at,
    ...source,
    artifacts:
      version === null ? [] : [{ kind: "original_pdf", version }],
  };
}

export async function reconstructDocumentVersionChainFromCurrent(
  currentDocument: DocumentVersionSource,
  loadPrevious: (
    documentId: string,
    organizationId: string,
  ) => Promise<DocumentVersionSource | null>,
): Promise<ReconstructDocumentVersionChainResult> {
  if (currentDocument.superseded_at !== null) {
    return { outcome: "error" };
  }

  const chain: DocumentVersionSource[] = [];
  const visited = new Set<string>();
  let document: DocumentVersionSource | null = currentDocument;

  while (document) {
    if (
      visited.has(document.id) ||
      document.organization_id !== currentDocument.organization_id ||
      chain.length >= 100
    ) {
      return { outcome: "error" };
    }

    visited.add(document.id);
    chain.push(document);

    if (!document.replaces_document_id) break;
    document = await loadPrevious(
      document.replaces_document_id,
      currentDocument.organization_id,
    );
    if (!document) return { outcome: "error" };
  }

  return {
    outcome: "success",
    history: {
      currentDocumentId: currentDocument.id,
      entries: chain.map((entry) =>
        toHistoryEntry(entry, currentDocument.id),
      ),
    },
  };
}

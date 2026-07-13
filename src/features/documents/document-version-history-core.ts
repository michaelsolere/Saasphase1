import {
  isDocumentPdfMetadataCoherent,
  parseDocumentPdfPath,
} from "@/features/documents/document-pdf-storage-core";

export type DocumentVersionSource = {
  id: string;
  organization_id: string;
  title: string;
  document_type: string;
  status: string;
  replaces_document_id: string | null;
  superseded_at: string | null;
  generated_at: string | null;
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

export type DocumentVersionHistoryEntry = {
  documentId: string;
  title: string;
  documentType: string;
  businessStatus: string;
  position: "current" | "historical";
  version: number | null;
  generatedAt: string | null;
  sourceTemplateVersion: number | null;
  artifacts: OriginalDocumentPdfArtifact[];
};

export type DocumentVersionHistory = {
  currentDocumentId: string;
  entries: DocumentVersionHistoryEntry[];
};

export type ReconstructDocumentVersionChainResult =
  | { outcome: "success"; history: DocumentVersionHistory }
  | { outcome: "error" };

function toHistoryEntry(
  document: DocumentVersionSource,
  currentDocumentId: string,
): DocumentVersionHistoryEntry {
  const coherentPdf = isDocumentPdfMetadataCoherent(document);
  const parsedPath = coherentPdf
    ? parseDocumentPdfPath(document.file_path!)
    : null;
  const version = parsedPath?.version ?? null;

  return {
    documentId: document.id,
    title: document.title,
    documentType: document.document_type,
    businessStatus: document.status,
    position: document.id === currentDocumentId ? "current" : "historical",
    version,
    generatedAt: document.generated_at,
    sourceTemplateVersion: document.source_template_version,
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

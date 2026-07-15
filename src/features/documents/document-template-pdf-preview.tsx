"use client";

import { BlobProvider } from "@react-pdf/renderer";
import { useMemo } from "react";

import { DocumentPdfDocument } from "./document-pdf-document";
import { buildDocumentPdfPresentation } from "./document-pdf-presentation";
import type { DocumentTemplateDefinition } from "./document-template-definitions";
import { createDocumentTemplatePreviewSnapshot } from "./document-template-preview-snapshot";

export function DocumentTemplatePdfPreview({
  definition,
}: {
  definition: DocumentTemplateDefinition;
}) {
  const presentation = useMemo(() => {
    const snapshot = createDocumentTemplatePreviewSnapshot(
      definition.documentType,
    );
    return buildDocumentPdfPresentation(snapshot, definition);
  }, [definition]);
  const document = useMemo(
    () => presentation ? DocumentPdfDocument({ presentation }) : null,
    [presentation],
  );

  if (!presentation || !document) {
    return (
      <div
        role="status"
        className="flex min-h-[32rem] items-center justify-center rounded-lg bg-muted-soft p-6 text-center text-sm text-muted"
      >
        Aperçu indisponible.
      </div>
    );
  }

  return (
    <BlobProvider document={document}>
      {({ url, loading, error }) => {
        if (error) {
          return (
            <div
              role="status"
              className="flex min-h-[32rem] items-center justify-center rounded-lg bg-muted-soft p-6 text-center text-sm text-muted"
            >
              Aperçu indisponible.
            </div>
          );
        }
        if (loading || !url) {
          return (
            <div
              role="status"
              className="flex min-h-[32rem] items-center justify-center rounded-lg bg-muted-soft p-6 text-center text-sm text-muted"
            >
              Préparation de l’aperçu…
            </div>
          );
        }
        return (
          <iframe
            src={url}
            title={`Aperçu PDF — ${presentation.title}`}
            data-document-pdf-preview="ready"
            className="h-[72vh] min-h-[38rem] w-full rounded-lg border bg-white"
          />
        );
      }}
    </BlobProvider>
  );
}

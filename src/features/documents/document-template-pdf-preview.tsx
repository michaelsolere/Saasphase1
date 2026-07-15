"use client";

import { BlobProvider } from "@react-pdf/renderer";
import { useEffect, useMemo, useRef } from "react";

import { DocumentPdfDocument } from "./document-pdf-document";
import { buildDocumentPdfPresentation } from "./document-pdf-presentation";
import type { DocumentTemplateDefinition } from "./document-template-definitions";
import { createDocumentTemplatePreviewSnapshot } from "./document-template-preview-snapshot";

function PdfPreviewContent({
  url,
  loading,
  error,
  title,
}: {
  url: string | null;
  loading: boolean;
  error: Error | null;
  title: string;
}) {
  const pendingRevocationsRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!url) return;
    const pendingRevocation = pendingRevocationsRef.current.get(url);
    if (pendingRevocation !== undefined) {
      window.clearTimeout(pendingRevocation);
      pendingRevocationsRef.current.delete(url);
    }
    const pendingRevocations = pendingRevocationsRef.current;
    return () => {
      const timeout = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        pendingRevocations.delete(url);
      }, 0);
      pendingRevocations.set(url, timeout);
    };
  }, [url]);

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

  return (
    <div className="space-y-3">
      {loading || !url ? (
        <span
          aria-disabled="true"
          className="inline-flex cursor-not-allowed items-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-muted opacity-60"
        >
          Ouvrir l’aperçu en grand
        </span>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Ouvrir l’aperçu en grand
        </a>
      )}
      {loading || !url ? (
        <div
          role="status"
          className="flex min-h-[32rem] items-center justify-center rounded-lg bg-muted-soft p-6 text-center text-sm text-muted"
        >
          Préparation de l’aperçu…
        </div>
      ) : (
        <iframe
          src={url}
          title={`Aperçu PDF — ${title}`}
          data-document-pdf-preview="ready"
          className="h-[72vh] min-h-[38rem] w-full rounded-lg border bg-white"
        />
      )}
    </div>
  );
}

export function DocumentTemplatePdfPreview({
  definition,
  logo,
  brandingUnavailable = false,
}: {
  definition: DocumentTemplateDefinition;
  logo?: { dataUri: string; widthPx: number; heightPx: number } | null;
  brandingUnavailable?: boolean;
}) {
  const presentation = useMemo(() => {
    const snapshot = createDocumentTemplatePreviewSnapshot(
      definition.documentType,
    );
    return buildDocumentPdfPresentation(snapshot, definition);
  }, [definition]);
  const document = useMemo(
    () => presentation ? DocumentPdfDocument({ presentation, logo }) : null,
    [presentation, logo],
  );

  if (!presentation || !document || brandingUnavailable) {
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
      {({ url, loading, error }) => (
        <PdfPreviewContent
          url={url}
          loading={loading}
          error={error}
          title={presentation.title}
        />
      )}
    </BlobProvider>
  );
}

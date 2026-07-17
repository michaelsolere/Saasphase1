import type {
  DocumentTemplateDefinition,
} from "./document-template-definition-schemas";
import type {
  DocumentGenerationSnapshot,
} from "./document-generation-snapshot-schemas";
import {
  resolveFreeDocumentTemplateDefinition,
  type FreeTextParagraph,
} from "./reservation-contract-template-variables";

export type DocumentPdfPresentationSection = {
  id: string;
  title: string;
  paragraphs: string[];
  keepTogether?: boolean;
  signatureLabels?: [string, string];
};

export type DocumentPdfPresentation = {
  documentType: DocumentGenerationSnapshot["documentType"];
  title: string;
  fileName: string;
  preparedAt: string;
  sections: DocumentPdfPresentationSection[];
  freeBody?: string;
  freeTextParagraphs?: FreeTextParagraph[];
};

function fileNameFor(
  snapshot: DocumentGenerationSnapshot,
): string {
  return snapshot.documentType === "reservation_contract"
    ? `contrat-reservation-${snapshot.reservation.id}.pdf`
    : `certificat-engagement-${snapshot.reservation.id}.pdf`;
}

function buildFreeDocumentPresentation(
  snapshot: DocumentGenerationSnapshot,
  template: DocumentTemplateDefinition,
  allowMissingTemplateVariables: boolean,
): DocumentPdfPresentation | null {
  if (snapshot.documentType !== template.documentType) {
    return null;
  }

  const resolved = resolveFreeDocumentTemplateDefinition({
    definition: template,
    snapshot,
    allowMissingTemplateVariables,
  });
  if (!resolved.success) return null;

  return {
    documentType: snapshot.documentType,
    title: resolved.title,
    fileName: fileNameFor(snapshot),
    preparedAt: snapshot.capturedAt,
    sections: [],
    freeBody: resolved.body,
    freeTextParagraphs: resolved.bodyParagraphs,
  };
}

export function buildDocumentPdfPresentation(
  snapshot: DocumentGenerationSnapshot,
  template: DocumentTemplateDefinition,
  options: { allowMissingTemplateVariables?: boolean } = {},
): DocumentPdfPresentation | null {
  return buildFreeDocumentPresentation(
    snapshot,
    template,
    options.allowMissingTemplateVariables ?? false,
  );
}

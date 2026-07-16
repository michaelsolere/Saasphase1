"use client";

import { DocumentTemplateEditor } from "@/features/documents/document-template-editor";
import {
  publishReservationDocumentVariantVersionAction,
  saveReservationDocumentVariantDraftAction,
  validateReservationDocumentVariantDraftAction,
} from "@/features/documents/reservation-document-variant-management-actions";
import type { DocumentTemplateDefinition } from "@/features/documents/document-template-definitions";

export function ReservationDocumentVariantEditor({
  reservationId,
  variantId,
  versionId,
  version,
  initialDefinition,
  initialSavedContent,
  initialUpdatedAt,
  mode,
  canSave,
  canValidate,
  canPublish,
  previewLogo,
  previewBrandingUnavailable,
}: {
  reservationId: string;
  variantId: string;
  versionId: string;
  version: number;
  initialDefinition: DocumentTemplateDefinition;
  initialSavedContent?: string | null;
  initialUpdatedAt: string;
  mode: "draft" | "published";
  canSave?: boolean;
  canValidate?: boolean;
  canPublish?: boolean;
  previewLogo?: { dataUri: string; widthPx: number; heightPx: number } | null;
  previewBrandingUnavailable?: boolean;
}) {
  return (
    <DocumentTemplateEditor
      templateId={versionId}
      version={version}
      initialDefinition={initialDefinition}
      initialSavedContent={initialSavedContent}
      initialUpdatedAt={initialUpdatedAt}
      mode={mode}
      canSave={canSave}
      canValidate={canValidate}
      canPublish={canPublish}
      previewLogo={previewLogo}
      previewBrandingUnavailable={previewBrandingUnavailable}
      previewNotice="Aperçu avec données fictives — la variante n’est pas encore raccordée aux données réelles du dossier ni à la génération PDF."
      actions={mode === "draft" ? {
        save: ({ templateContent, expectedUpdatedAt }) =>
          saveReservationDocumentVariantDraftAction({
            reservationId,
            variantId,
            versionId,
            templateContent,
            expectedUpdatedAt,
          }),
        validate: () => validateReservationDocumentVariantDraftAction({
          reservationId,
          variantId,
          versionId,
        }),
        publish: ({ expectedUpdatedAt }) => publishReservationDocumentVariantVersionAction({
          reservationId,
          variantId,
          versionId,
          expectedUpdatedAt,
        }),
      } : undefined}
    />
  );
}

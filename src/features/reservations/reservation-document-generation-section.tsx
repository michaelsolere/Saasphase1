import { randomUUID } from "node:crypto";

import {
  isDocumentPdfMetadataCoherent,
  parseDocumentPdfPath,
} from "@/features/documents/document-pdf-storage-core";
import { getDocumentStatusLabel } from "@/features/documents/formatters";
import {
  isReservationDocumentTemplateCompatible,
  resolveEffectiveReservationDocumentTaxonomy,
  type ReservationDocumentType,
} from "@/features/documents/reservation-document-template-compatibility";
import {
  ReservationDocumentGenerationPanel,
  type ReservationDocumentGenerationCard,
} from "@/features/reservations/reservation-document-generation-panel";
import { createClient } from "@/lib/supabase/server";

type CurrentDocument = {
  id: string;
  organization_id: string;
  title: string;
  document_type: string;
  status: string;
  file_path: string | null;
  file_sha256: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  generated_at: string | null;
  template_id: string | null;
  source_template_version: number | null;
};

type DocumentTemplate = {
  id: string;
  name: string;
  document_type: string;
  species: string;
  breed: string;
  template_format: string;
  version: number;
  is_active: boolean;
  deleted_at: string | null;
};

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

export async function ReservationDocumentGenerationSection({
  reservationId,
}: {
  reservationId: string;
}) {
  const supabase = await createClient();
  const reservationResult = await supabase
    .from("reservations")
    .select("id, organization_id, application_id, litter_id, animal_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  const reservation = reservationResult.data;

  if (reservationResult.error || !reservation) {
    return (
      <p role="alert" className="mb-4 text-sm text-amber-800">
        La génération documentaire n’est pas disponible pour le moment.
      </p>
    );
  }

  const [applicationResult, litterResult, animalResult, documentsResult, templatesResult] =
    await Promise.all([
      reservation.application_id
        ? supabase
            .from("applications")
            .select("species, breed")
            .eq("organization_id", reservation.organization_id)
            .eq("id", reservation.application_id)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reservation.litter_id
        ? supabase
            .from("litters")
            .select("species, breed")
            .eq("organization_id", reservation.organization_id)
            .eq("id", reservation.litter_id)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reservation.animal_id
        ? supabase
            .from("animals")
            .select("species, breed")
            .eq("organization_id", reservation.organization_id)
            .eq("id", reservation.animal_id)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("documents")
        .select(
          "id, organization_id, title, document_type, status, file_path, file_sha256, file_size_bytes, mime_type, generated_at, template_id, source_template_version",
        )
        .eq("organization_id", reservation.organization_id)
        .eq("reservation_id", reservationId)
        .in("document_type", [
          "commitment_certificate",
          "reservation_contract",
        ])
        .is("deleted_at", null)
        .is("superseded_at", null),
      supabase
        .from("document_templates")
        .select(
          "id, name, document_type, species, breed, template_format, version, is_active, deleted_at",
        )
        .eq("organization_id", reservation.organization_id)
        .order("name")
        .order("version", { ascending: false }),
    ]);

  if (
    applicationResult.error ||
    litterResult.error ||
    animalResult.error ||
    documentsResult.error ||
    templatesResult.error
  ) {
    return (
      <p role="alert" className="mb-4 text-sm text-amber-800">
        Les données nécessaires à la génération ne sont pas disponibles pour le
        moment.
      </p>
    );
  }

  const taxonomy = resolveEffectiveReservationDocumentTaxonomy({
    animal: animalResult.data,
    litter: litterResult.data,
    application: applicationResult.data,
  });
  const documents = (documentsResult.data ?? []) as CurrentDocument[];
  const templates = (templatesResult.data ?? []) as DocumentTemplate[];

  const cards: ReservationDocumentGenerationCard[] = (
    [
      ["commitment_certificate", "Certificat d’engagement et de connaissance"],
      ["reservation_contract", "Contrat de réservation"],
    ] as const
  ).map(([documentType, label]) => {
    const currentDocument = documents.find(
      (document) => document.document_type === documentType,
    );
    const parsedPdfPath = currentDocument?.file_path
      ? parseDocumentPdfPath(currentDocument.file_path)
      : null;
    const hasPdf = Boolean(
      currentDocument &&
        parsedPdfPath &&
        isDocumentPdfMetadataCoherent(currentDocument),
    );
    const currentTemplate = currentDocument?.template_id
      ? templates.find((template) => template.id === currentDocument.template_id)
      : null;
    const compatibleTemplates = taxonomy
      ? templates.filter((template) =>
          isReservationDocumentTemplateCompatible({
            template,
            documentType: documentType as ReservationDocumentType,
            taxonomy,
          }),
        )
      : [];

    return {
      documentType,
      label,
      intention: {
        documentId: randomUUID(),
        reservationId,
        documentType,
        capturedAt: new Date().toISOString(),
      },
      currentDocument: currentDocument
        ? {
            title: currentDocument.title,
            statusLabel: getDocumentStatusLabel(
              currentDocument.status,
              currentDocument.document_type,
            ),
            hasPdf,
            version: hasPdf ? parsedPdfPath?.version ?? null : null,
            templateLabel: currentTemplate?.name ?? null,
            templateVersion: currentDocument.source_template_version,
            generatedAtLabel: currentDocument.generated_at
              ? formatGeneratedAt(currentDocument.generated_at)
              : null,
          }
        : null,
      templates: compatibleTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        version: template.version,
      })),
    };
  });

  return <ReservationDocumentGenerationPanel cards={cards} />;
}

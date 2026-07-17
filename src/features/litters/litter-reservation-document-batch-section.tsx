import { randomUUID } from "node:crypto";

import { getDocumentStatusLabel } from "@/features/documents/formatters";
import { isReservationDocumentTemplateCompatible } from "@/features/documents/reservation-document-template-compatibility";
import { generateLitterReservationDocumentsBatchAction } from "@/features/litters/litter-reservation-document-batch-action";
import { LitterReservationDocumentBatchPanel } from "@/features/litters/litter-reservation-document-batch-panel";
import { createClient } from "@/lib/supabase/server";

const WRITABLE_ROLES = new Set(["owner", "admin", "member"]);
const DOCUMENT_TYPES = [
  "commitment_certificate",
  "reservation_contract",
] as const;

function UnavailableMessage() {
  return (
    <p role="alert" className="text-sm text-amber-800">
      La génération groupée n’est pas disponible pour le moment. Aucune donnée
      n’a été modifiée.
    </p>
  );
}

function documentStateLabel(statuses: string[]) {
  if (statuses.length === 0) return "Absent";
  if (statuses.length > 1) return "État incohérent";
  return getDocumentStatusLabel(statuses[0]);
}

export async function LitterReservationDocumentBatchSection({
  litterId,
}: {
  litterId: string;
}) {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();

  if (auth.error || !auth.data.user) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5"><UnavailableMessage /></div>
      </details>
    );
  }

  const litterResult = await supabase
    .from("litters")
    .select("id, organization_id, species, breed")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterResult.error || !litterResult.data) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5"><UnavailableMessage /></div>
      </details>
    );
  }

  const litter = litterResult.data;
  const membershipResult = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", litter.organization_id)
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  const hasReadError = Boolean(membershipResult.error || !membershipResult.data);
  const canGenerate = Boolean(
    membershipResult.data?.role && WRITABLE_ROLES.has(membershipResult.data.role),
  );

  if (hasReadError) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5"><UnavailableMessage /></div>
      </details>
    );
  }

  if (!canGenerate) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5 space-y-3 text-sm text-muted">
          <p>
            Cette étape génère les PDF du certificat d’engagement et du contrat
            de réservation. Elle n’envoie aucun e-mail et ne crée aucun paiement.
          </p>
          <p>Cette fonctionnalité est disponible en lecture seule pour votre rôle.</p>
        </div>
      </details>
    );
  }

  const reservationsResult = await supabase
    .from("reservations")
    .select("id, contact_id, application_id, status, created_at")
    .eq("organization_id", litter.organization_id)
    .eq("litter_id", litter.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (reservationsResult.error) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5"><UnavailableMessage /></div>
      </details>
    );
  }

  const reservations = reservationsResult.data ?? [];
  const reservationIds = reservations.map((reservation) => reservation.id);
  const contactIds = [
    ...new Set(reservations.map((reservation) => reservation.contact_id).filter(Boolean)),
  ];

  const [contactsResult, documentsResult, templatesResult] = await Promise.all([
    contactIds.length > 0
      ? supabase
          .from("contacts")
          .select("id, display_name")
          .eq("organization_id", litter.organization_id)
          .in("id", contactIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    reservationIds.length > 0
      ? supabase
          .from("documents")
          .select("reservation_id, document_type, status")
          .eq("organization_id", litter.organization_id)
          .in("reservation_id", reservationIds)
          .in("document_type", [...DOCUMENT_TYPES])
          .is("deleted_at", null)
          .is("superseded_at", null)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("document_templates")
      .select(
        "id, name, version, document_type, species, breed, template_format, is_active, lifecycle_status, deleted_at",
      )
      .eq("organization_id", litter.organization_id)
      .eq("is_active", true)
      .eq("lifecycle_status", "published")
      .is("deleted_at", null)
      .in("document_type", [...DOCUMENT_TYPES])
      .order("name", { ascending: true })
      .order("version", { ascending: false }),
  ]);

  if (contactsResult.error || documentsResult.error || templatesResult.error) {
    return (
      <details
        id="generation-documents-groupes"
        className="rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          Génération groupée des documents
        </summary>
        <div className="mt-5"><UnavailableMessage /></div>
      </details>
    );
  }

  const contactNames = new Map(
    (contactsResult.data ?? []).map((contact) => [
      contact.id,
      contact.display_name || "Contact non renseigné",
    ]),
  );
  const currentDocuments = documentsResult.data ?? [];
  const templates = (templatesResult.data ?? []).filter((template) =>
    DOCUMENT_TYPES.some((documentType) =>
      isReservationDocumentTemplateCompatible({
        template,
        documentType,
        taxonomy: { species: litter.species, breed: litter.breed },
      }),
    ),
  );

  const intention = {
    litterId: litter.id,
    operationId: randomUUID(),
    capturedAt: new Date().toISOString(),
  };
  const action = generateLitterReservationDocumentsBatchAction.bind(
    null,
    intention,
  );

  return (
    <details
      id="generation-documents-groupes"
      className="rounded-2xl border bg-surface p-6 sm:p-8"
    >
      <summary className="cursor-pointer text-xl font-semibold">
        Génération groupée des documents
      </summary>
      <div className="mt-5">
        <LitterReservationDocumentBatchPanel
          litterId={litter.id}
          action={action}
          reservations={reservations.map((reservation) => {
            const documents = currentDocuments.filter(
              (document) => document.reservation_id === reservation.id,
            );
            const selectable =
              reservation.status === "pre_reservation_paid" &&
              Boolean(reservation.contact_id) &&
              Boolean(reservation.application_id);
            return {
              id: reservation.id,
              contactName:
                contactNames.get(reservation.contact_id) ?? "Contact non renseigné",
              status: reservation.status,
              selectable,
              disabledReason: selectable
                ? null
                : "Ce dossier ne remplit pas les conditions préalables.",
              commitmentStatus: documentStateLabel(
                documents
                  .filter(
                    (document) =>
                      document.document_type === "commitment_certificate",
                  )
                  .map((document) => document.status),
              ),
              contractStatus: documentStateLabel(
                documents
                  .filter(
                    (document) => document.document_type === "reservation_contract",
                  )
                  .map((document) => document.status),
              ),
            };
          })}
          commitmentTemplates={templates
            .filter(
              (template) => template.document_type === "commitment_certificate",
            )
            .map(({ id, name, version }) => ({ id, name, version }))}
          contractTemplates={templates
            .filter(
              (template) => template.document_type === "reservation_contract",
            )
            .map(({ id, name, version }) => ({ id, name, version }))}
        />
      </div>
    </details>
  );
}

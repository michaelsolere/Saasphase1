import Link from "next/link";

import { getDocumentTypeLabel } from "@/features/documents/formatters";
import {
  isReservationDocumentTemplateCompatible,
  resolveEffectiveReservationDocumentTaxonomy,
  type ReservationDocumentType,
} from "@/features/documents/reservation-document-template-compatibility";
import { listReservationDocumentVariants } from "@/features/documents/reservation-document-variant-management";
import { CreateReservationDocumentVariantButton } from "@/features/reservations/create-reservation-document-variant-button";
import { createClient } from "@/lib/supabase/server";

const SUPPORTED_TYPES = ["reservation_contract", "commitment_certificate"] as const;

export async function ReservationDocumentVariantsSection({
  reservationId,
}: {
  reservationId: string;
}) {
  const supabase = await createClient();
  const reservation = await supabase
    .from("reservations")
    .select("id, organization_id, application_id, litter_id, animal_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservation.error || !reservation.data) return null;

  const row = reservation.data;
  const [listed, families, publications, application, litter, animal] = await Promise.all([
    listReservationDocumentVariants({
      organizationId: row.organization_id,
      reservationId: row.id,
    }, supabase),
    supabase
      .from("document_template_families")
      .select("id, name, document_type, species, breed")
      .eq("organization_id", row.organization_id)
      .in("document_type", [...SUPPORTED_TYPES])
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("document_templates")
      .select("id, family_id, name, document_type, species, breed, template_format, version, is_active, deleted_at")
      .eq("organization_id", row.organization_id)
      .eq("lifecycle_status", "published")
      .eq("is_active", true)
      .is("deleted_at", null),
    row.application_id
      ? supabase.from("applications").select("species, breed").eq("id", row.application_id).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.litter_id
      ? supabase.from("litters").select("species, breed").eq("id", row.litter_id).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.animal_id
      ? supabase.from("animals").select("species, breed").eq("id", row.animal_id).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (
    listed.outcome === "error" || families.error || publications.error ||
    application.error || litter.error || animal.error
  ) {
    return (
      <section className="mt-6 rounded-xl border bg-surface p-5" aria-labelledby="reservation-variants-title">
        <h3 id="reservation-variants-title" className="text-lg font-semibold">Variantes documentaires personnalisées</h3>
        <p role="alert" className="mt-3 text-sm text-amber-800">Les variantes ne sont pas disponibles pour le moment.</p>
      </section>
    );
  }

  const taxonomy = resolveEffectiveReservationDocumentTaxonomy({
    animal: animal.data,
    litter: litter.data,
    application: application.data,
  });
  const variantsByFamily = new Map(listed.variants.map((variant) => [variant.templateFamilyId, variant]));
  const familiesById = new Map((families.data ?? []).map((family) => [family.id, family]));
  const rows = [...(families.data ?? [])];
  for (const variant of listed.variants) {
    if (!familiesById.has(variant.templateFamilyId)) {
      rows.push({
        id: variant.templateFamilyId,
        name: "Modèle de référence archivé",
        document_type: variant.documentType,
        species: variant.species,
        breed: variant.breed,
      });
    }
  }
  const canCreate = listed.role !== "viewer";

  return (
    <section className="mt-6 rounded-xl border bg-surface p-5" aria-labelledby="reservation-variants-title">
      <div>
        <h3 id="reservation-variants-title" className="text-lg font-semibold">Variantes documentaires personnalisées</h3>
        <p className="mt-1 text-sm text-muted">Personnalisez un modèle pour cette réservation sans modifier le modèle commun.</p>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted">Aucun modèle de référence pris en charge.</p> : rows.map((family) => {
          const variant = variantsByFamily.get(family.id);
          const publication = (publications.data ?? []).find((item) => item.family_id === family.id);
          const compatible = Boolean(taxonomy && publication && isReservationDocumentTemplateCompatible({
            template: publication,
            documentType: family.document_type as ReservationDocumentType,
            taxonomy,
          }));
          const origin = variant?.draft ?? variant?.publication;
          return (
            <div key={family.id} className="rounded-lg border bg-background p-4">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h4 className="font-semibold">{family.name}</h4>
                  <p className="mt-1 text-sm text-muted">{getDocumentTypeLabel(family.document_type)}</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                    <div><dt className="text-muted">Variante</dt><dd>{variant ? "Présente" : "Absente"}</dd></div>
                    <div><dt className="text-muted">Publication</dt><dd>{variant?.publication ? `Version ${variant.publication.version}` : "Aucune"}</dd></div>
                    <div><dt className="text-muted">Brouillon</dt><dd>{variant?.draft ? `Version ${variant.draft.version}` : "Aucun"}</dd></div>
                  </dl>
                  {origin ? (
                    <p className="mt-2 text-xs text-muted">Origine exacte : modèle commun version {origin.sourceTemplateVersion}</p>
                  ) : null}
                  {!variant && !compatible ? (
                    <p className="mt-2 text-xs text-muted">Aucune publication commune active compatible.</p>
                  ) : null}
                </div>
                {variant ? (
                  <Link className="text-sm font-semibold text-accent hover:underline" href={`/reservations/${reservationId}/documents/variantes/${variant.id}`}>
                    Consulter la variante
                  </Link>
                ) : compatible && canCreate ? (
                  <CreateReservationDocumentVariantButton reservationId={reservationId} templateFamilyId={family.id} />
                ) : compatible ? (
                  <p className="text-sm text-muted">Consultation uniquement</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

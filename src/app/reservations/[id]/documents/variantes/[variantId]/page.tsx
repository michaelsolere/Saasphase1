import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateNextReservationDocumentVariantVersionButton } from "@/features/documents/create-next-reservation-document-variant-version-button";
import { decodeDocumentTemplateDraft } from "@/features/documents/decode-document-template-draft";
import { DocumentTemplateAutomaticContent } from "@/features/documents/document-template-automatic-content";
import { getDocumentTypeLabel } from "@/features/documents/formatters";
import { ReservationDocumentVariantEditor } from "@/features/documents/reservation-document-variant-editor";
import { listReservationDocumentVariantVersions } from "@/features/documents/reservation-document-variant-management";
import {
  parseDocumentTemplateDefinition,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
} from "@/features/documents/document-template-definitions";
import { readActiveOrganizationLogo } from "@/features/settings/organization-logo-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function lifecycleLabel(status: string) {
  if (status === "published") return "published · publiée";
  if (status === "retired") return "retired · retirée";
  return "draft · brouillon";
}

export default async function ReservationDocumentVariantPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const { id: reservationId, variantId } = await params;
  const supabase = await createClient();
  const reservation = await supabase
    .from("reservations")
    .select("id, organization_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservation.error || !reservation.data) notFound();

  const listed = await listReservationDocumentVariantVersions({
    organizationId: reservation.data.organization_id,
    variantId,
  }, supabase);
  if (listed.outcome === "error" || listed.variant.reservationId !== reservationId) notFound();

  const sourceIds = [...new Set(listed.versions.map((version) => version.sourceTemplateId))];
  const [family, sources, activeLogo] = await Promise.all([
    supabase
      .from("document_template_families")
      .select("id, name, description")
      .eq("id", listed.variant.templateFamilyId)
      .eq("organization_id", reservation.data.organization_id)
      .maybeSingle(),
    supabase
      .from("document_templates")
      .select("id, name, version")
      .eq("organization_id", reservation.data.organization_id)
      .in("id", sourceIds),
    readActiveOrganizationLogo(reservation.data.organization_id),
  ]);
  if (family.error || sources.error) notFound();

  const sourceById = new Map((sources.data ?? []).map((source) => [source.id, source]));
  const publication = listed.versions.find((version) => version.lifecycleStatus === "published") ?? null;
  const draft = listed.versions.find((version) => version.lifecycleStatus === "draft") ?? null;
  const publicationDefinition = publication
    ? parseDocumentTemplateDefinition({
        templateFormat: publication.templateFormat,
        templateContent: publication.templateContent,
        documentType: listed.variant.documentType,
      })
    : null;
  const draftDefinition = draft
    ? decodeDocumentTemplateDraft({
        documentType: listed.variant.documentType as DocumentTemplateType,
        templateContent: draft.templateContent,
      })
    : null;
  const canSave = listed.role !== "viewer";
  const canPublish = listed.role === "admin" || listed.role === "owner";
  const logo = activeLogo.ok && activeLogo.logo ? {
    dataUri: activeLogo.logo.dataUri,
    widthPx: activeLogo.logo.asset.width_px,
    heightPx: activeLogo.logo.asset.height_px,
  } : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
      <header className="border-b pb-7">
        <Link href={`/reservations/${reservationId}#documents`} className="text-sm font-semibold text-accent hover:underline">
          ← Retour à la réservation
        </Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-accent">{getDocumentTypeLabel(listed.variant.documentType)}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Variante personnalisée · {family.data?.name ?? "Modèle de référence"}</h1>
        <p className="mt-3 text-muted">{family.data?.description || "Variante propre à cette réservation."}</p>
        <dl className="mt-6 grid gap-3 rounded-xl border bg-surface p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase text-muted">Modèle de référence</dt><dd className="mt-1 font-medium">{family.data?.name ?? "Archivé"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-muted">Origine exacte</dt><dd className="mt-1 font-medium">{(draft ?? publication) ? `Version ${(draft ?? publication)!.sourceTemplateVersion}` : "—"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-muted">Taxonomie</dt><dd className="mt-1 font-medium">{listed.variant.species} · {listed.variant.breed}</dd></div>
        </dl>
      </header>

      <div className="space-y-8 py-8">
        <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Publication courante</h2>
          {publication && publicationDefinition?.success ? (
            <div className="mt-5">
              <p className="mb-5 text-sm text-muted">Version {publication.version} · origine {sourceById.get(publication.sourceTemplateId)?.name ?? "modèle commun"} version {publication.sourceTemplateVersion}</p>
              <ReservationDocumentVariantEditor
                reservationId={reservationId}
                variantId={variantId}
                versionId={publication.id}
                version={publication.version}
                initialDefinition={publicationDefinition.definition}
                initialUpdatedAt={publication.updatedAt}
                mode="published"
                previewLogo={logo}
                previewBrandingUnavailable={!activeLogo.ok}
              />
            </div>
          ) : <p className="mt-3 text-sm text-muted">Aucune version publiée.</p>}
        </section>

        {draftDefinition?.schemaVersion !== 2 ? (
          <DocumentTemplateAutomaticContent documentType={listed.variant.documentType as DocumentTemplateType} />
        ) : null}

        <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Brouillon courant</h2>
          {draft && draftDefinition ? (
            <div className="mt-5">
              <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Version {draft.version} · origine exacte du modèle commun version {draft.sourceTemplateVersion}</p>
              <ReservationDocumentVariantEditor
                reservationId={reservationId}
                variantId={variantId}
                versionId={draft.id}
                version={draft.version}
                initialDefinition={draftDefinition as DocumentTemplateDefinition}
                initialSavedContent={draft.templateContent}
                initialUpdatedAt={draft.updatedAt}
                mode="draft"
                canSave={canSave}
                canValidate
                canPublish={canPublish}
                previewLogo={logo}
                previewBrandingUnavailable={!activeLogo.ok}
              />
            </div>
          ) : publication && canSave ? (
            <div className="mt-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <p className="text-sm text-muted">La publication reste en lecture seule. Créez un nouveau brouillon pour la faire évoluer.</p>
              <CreateNextReservationDocumentVariantVersionButton reservationId={reservationId} variantId={variantId} />
            </div>
          ) : <p className="mt-3 text-sm text-muted">Aucun brouillon en cours.</p>}
        </section>

        <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Historique des versions</h2>
          <ol className="mt-4 divide-y rounded-xl border">
            {listed.versions.map((version) => (
              <li key={version.id} className="flex flex-col justify-between gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
                <span className="font-medium">Version {version.version} · {lifecycleLabel(version.lifecycleStatus)}</span>
                <span className="text-muted">Origine commune v{version.sourceTemplateVersion} · {formatDate(version.publishedAt ?? version.updatedAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

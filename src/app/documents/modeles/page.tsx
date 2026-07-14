import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getDocumentTypeLabel } from "@/features/documents/formatters";
import { listDocumentTemplateFamilies } from "@/features/documents/document-template-management";
import { resolveCurrentDocumentTemplateOrganization } from "@/features/documents/document-template-management-context";

export const dynamic = "force-dynamic";

const roleLabels = {
  viewer: "Lecture et validation",
  member: "Gestion des brouillons",
  admin: "Gestion et publication",
  owner: "Gestion et publication",
} as const;

function formatDate(value: string | null) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function LoadingError() {
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950">
      <p className="font-semibold">Impossible de charger les modèles de référence</p>
      <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
    </div>
  );
}

export default async function DocumentTemplatesPage() {
  const organization = await resolveCurrentDocumentTemplateOrganization();
  const result = organization
    ? await listDocumentTemplateFamilies({ organizationId: organization.organizationId })
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <Link href="/documents" className="text-sm font-semibold text-accent hover:underline">
          ← Retour aux documents
        </Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Documents · Configuration</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Modèles de référence</h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">
              Consultez les versions publiées et préparez les prochains brouillons des documents métier.
            </p>
          </div>
          {result?.outcome === "success" ? (
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              {roleLabels[result.role]}
            </span>
          ) : null}
        </div>
      </header>

      <section className="py-8">
        {!result || result.outcome === "error" ? (
          <LoadingError />
        ) : result.families.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
            <p className="font-semibold">Aucun modèle de référence</p>
            <p className="mt-2 text-sm text-muted">Les familles documentaires configurées apparaîtront ici.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {result.families.map((family) => (
              <article key={family.id} className="rounded-2xl border bg-surface p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">{family.name}</h2>
                    <p className="mt-1 text-sm font-medium text-accent">{getDocumentTypeLabel(family.documentType)}</p>
                  </div>
                  <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted">
                    {family.species === "dog" ? "Chien" : family.species} · {family.breed}
                  </span>
                </div>
                <p className="mt-4 min-h-12 text-sm leading-6 text-muted">
                  {family.description || "Aucune description."}
                </p>
                <dl className="mt-5 grid gap-3 rounded-xl border bg-background p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Version publiée</dt>
                    <dd className="mt-1 font-medium">{family.publication ? `Version ${family.publication.version}` : "Aucune"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Brouillon actuel</dt>
                    <dd className="mt-1 font-medium">{family.draft ? `Version ${family.draft.version}` : "Aucun"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Dernière mise à jour</dt>
                    <dd className="mt-1 font-medium">{formatDate(family.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex justify-end">
                  <Button asChild variant="outline">
                    <Link href={`/documents/modeles/${family.id}`}>
                      {result.role === "viewer" ? "Consulter et valider" : "Gérer le modèle"}
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

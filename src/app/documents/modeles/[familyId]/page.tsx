import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateDocumentTemplateDraftButton } from "@/features/documents/create-document-template-draft-button";
import { decodeDocumentTemplateDraft } from "@/features/documents/decode-document-template-draft";
import { DocumentTemplateEditor } from "@/features/documents/document-template-editor";
import { hasStructuredDocumentTemplateEditor } from "@/features/documents/document-template-editor-config";
import { getDocumentTypeLabel } from "@/features/documents/formatters";
import { listDocumentTemplateFamilies, type DocumentTemplateVersionSummary } from "@/features/documents/document-template-management";
import { resolveCurrentDocumentTemplateOrganization } from "@/features/documents/document-template-management-context";
import { parseDocumentTemplateDefinition, type DocumentTemplateDefinition } from "@/features/documents/document-template-definitions";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function parseVersion(version: DocumentTemplateVersionSummary | null, documentType: string) {
  if (!version) return null;
  const parsed = parseDocumentTemplateDefinition({
    templateFormat: version.templateFormat,
    templateContent: version.templateContent,
    documentType,
  });
  return parsed.success ? parsed.definition : null;
}

function VersionPlaceholder({
  kind,
  hasEditor,
}: {
  kind: "invalid" | "unsupported";
  hasEditor: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted-soft/30 px-5 py-8 text-center">
      <p className="font-semibold">
        {kind === "unsupported" || !hasEditor
          ? "Éditeur non encore disponible"
          : "Le contenu enregistré ne peut pas être affiché dans l’éditeur"}
      </p>
      <p className="mt-2 text-sm text-muted">
        {kind === "unsupported" || !hasEditor
          ? "Ce type documentaire reste consultable sans bloquer les autres modèles."
          : "Utilisez la validation pour obtenir un message neutre sur le contenu du brouillon."}
      </p>
    </div>
  );
}

function VersionHeader({ version, label }: { version: DocumentTemplateVersionSummary; label: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div>
        <h2 className="text-xl font-semibold">{label} · version {version.version}</h2>
        <p className="mt-1 text-sm text-muted">Mise à jour le {formatDate(version.updatedAt)}</p>
      </div>
      <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
        {version.lifecycleStatus === "published" ? "Publiée" : "Brouillon"}
      </span>
    </div>
  );
}

export default async function DocumentTemplateFamilyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const organization = await resolveCurrentDocumentTemplateOrganization();
  const result = organization
    ? await listDocumentTemplateFamilies({ organizationId: organization.organizationId })
    : null;

  if (!result || result.outcome === "error") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950">
          <p className="font-semibold">Impossible de charger ce modèle de référence</p>
          <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
        </div>
      </main>
    );
  }

  const family = result.families.find((item) => item.id === familyId);
  if (!family) notFound();

  const documentType = family.documentType;
  const hasEditor = hasStructuredDocumentTemplateEditor(documentType);
  const publicationDefinition = hasEditor ? parseVersion(family.publication, documentType) : null;
  const draftDefinition = hasEditor && family.draft
    ? decodeDocumentTemplateDraft({
        documentType,
        templateContent: family.draft.templateContent,
      })
    : null;
  const canSave = result.role !== "viewer";
  const canPublish = result.role === "owner" || result.role === "admin";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
      <header className="border-b pb-7">
        <Link href="/documents/modeles" className="text-sm font-semibold text-accent hover:underline">
          ← Retour aux modèles
        </Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">{getDocumentTypeLabel(family.documentType)}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{family.name}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">{family.description || "Aucune description."}</p>
          </div>
          <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {family.species === "dog" ? "Chien" : family.species} · {family.breed}
          </span>
        </div>
        <dl className="mt-6 grid gap-3 rounded-xl border bg-surface p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Type stable</dt><dd className="mt-1 font-medium">{family.documentType}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Publication actuelle</dt><dd className="mt-1 font-medium">{family.publication ? `Version ${family.publication.version}` : "Aucune"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Mise à jour famille</dt><dd className="mt-1 font-medium">{formatDate(family.updatedAt)}</dd></div>
        </dl>
      </header>

      <div className="space-y-8 py-8">
        <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
          {family.publication ? (
            <>
              <VersionHeader version={family.publication} label="Version publiée" />
              {publicationDefinition ? (
                <DocumentTemplateEditor
                  templateId={family.publication.id}
                  version={family.publication.version}
                  initialDefinition={publicationDefinition as DocumentTemplateDefinition}
                  initialUpdatedAt={family.publication.updatedAt}
                  mode="published"
                />
              ) : (
                <VersionPlaceholder kind={hasEditor ? "invalid" : "unsupported"} hasEditor={hasEditor} />
              )}
            </>
          ) : (
            <div className="py-5 text-center">
              <h2 className="text-xl font-semibold">Aucune version publiée</h2>
              <p className="mt-2 text-sm text-muted">La première publication apparaîtra ici.</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
          {family.draft ? (
            <>
              <VersionHeader version={family.draft} label="Brouillon actuel" />
              {!hasEditor ? (
                <VersionPlaceholder kind="unsupported" hasEditor={false} />
              ) : draftDefinition ? (
                <DocumentTemplateEditor
                  templateId={family.draft.id}
                  version={family.draft.version}
                  initialDefinition={draftDefinition as DocumentTemplateDefinition}
                  initialSavedContent={family.draft.templateContent}
                  initialUpdatedAt={family.draft.updatedAt}
                  mode="draft"
                  canSave={canSave}
                  canValidate
                  canPublish={canPublish}
                />
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold">Aucun brouillon en cours</h2>
                <p className="mt-2 text-sm text-muted">Le prochain brouillon sera cloné depuis la version publiée.</p>
              </div>
              {canSave ? (
                <CreateDocumentTemplateDraftButton familyId={family.id} />
              ) : (
                <p className="text-sm text-muted">Votre rôle ne permet pas de créer un brouillon.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

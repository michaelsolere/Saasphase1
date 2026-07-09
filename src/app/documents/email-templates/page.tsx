import { getEmailTemplatesForCurrentOrganization } from "@/features/documents/email-template-actions";
import { EmailTemplateCreateDialog } from "@/features/documents/email-template-create-dialog";
import { EmailTemplateEditor } from "@/features/documents/email-template-editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Modèles d’emails - Documents",
};

type StatusValue = "created" | "duplicate" | "success" | "error" | undefined;

function StatusMessage({ value }: { value: StatusValue }) {
  if (!value) {
    return null;
  }

  const isSuccess = value === "created" || value === "success";
  const message = {
    created: "Modèle créé.",
    duplicate:
      "Un modèle portant ce nom existe déjà. Choisissez un nom plus précis.",
    success: "Modèle enregistré.",
    error:
      "Impossible d’enregistrer le modèle. Vérifiez les champs obligatoires.",
  }[value];

  return (
    <div
      role="status"
      className={
        isSuccess
          ? "rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-950"
          : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      }
    >
      {message}
    </div>
  );
}

function TemplateNav({
  templates,
}: {
  templates: Awaited<ReturnType<typeof getEmailTemplatesForCurrentOrganization>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((template) => (
        <a
          key={template.templateKey}
          href={`#${template.templateKey}`}
          className="rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
        >
          {template.title}
        </a>
      ))}
    </div>
  );
}

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ template_status?: StatusValue }>;
}) {
  const query = await searchParams;
  const templates = await getEmailTemplatesForCurrentOrganization();
  const candidateTemplates = templates.filter(
    (template) => template.category === "candidate_journey",
  );
  const journeyTemplates = templates.filter(
    (template) => template.category === "adopter_journey",
  );
  const followUpTemplates = templates.filter(
    (template) => template.category === "post_adoption",
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Documents · Modèles
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Modèles d’emails
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">
              Textes éditables et copiables pour accompagner manuellement les
              grandes étapes du parcours adoptant. Aucun email n’est envoyé
              automatiquement.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <EmailTemplateCreateDialog />
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Copie manuelle
            </span>
          </div>
        </div>
      </header>

      <section className="space-y-5 border-b py-6" aria-label="Accès rapides">
        <StatusMessage value={query.template_status} />
        <TemplateNav templates={templates} />
      </section>

      <section className="py-8">
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">
            Parcours candidat
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Modèles à utiliser pendant les premiers échanges et la validation
            des candidatures.
          </p>
        </div>
        <div className="space-y-5">
          {candidateTemplates.map((template) => (
            <EmailTemplateEditor
              key={template.templateKey}
              template={template}
            />
          ))}
        </div>
      </section>

      <section className="py-8">
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">
            Parcours adoptant
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Modèles à utiliser depuis l’ouverture des pré-réservations jusqu’à
            la préparation du départ.
          </p>
        </div>
        <div className="space-y-5">
          {journeyTemplates.map((template) => (
            <EmailTemplateEditor
              key={template.templateKey}
              template={template}
            />
          ))}
        </div>
      </section>

      <section className="pb-12 pt-2">
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">
            Suivi post-adoption
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Modèles pour les suivis retenus en Phase 1 : 4 mois, anniversaire 1
            an et 15 mois.
          </p>
        </div>
        <div className="space-y-5">
          {followUpTemplates.map((template) => (
            <EmailTemplateEditor
              key={template.templateKey}
              template={template}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

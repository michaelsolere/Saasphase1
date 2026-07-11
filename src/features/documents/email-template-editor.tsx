import { Button } from "@/components/ui/button";
import { updateEmailTemplate } from "@/features/documents/email-template-actions";
import type { EmailTemplateRecord } from "@/features/documents/email-template-actions";

import { buildEmailBodyWithSubject } from "./email-template-defaults";
import { EmailTemplateCopyButton } from "./email-template-copy-button";

const categoryLabels = {
  adopter_journey: "Parcours adoptant",
  candidate_journey: "Parcours candidat",
  post_adoption: "Suivi post-adoption",
};

export function EmailTemplateEditor({
  template,
}: {
  template: EmailTemplateRecord;
}) {
  const subjectFieldId = `${template.templateKey}-subject`;
  const bodyFieldId = `${template.templateKey}-body`;
  const titleFieldId = `${template.templateKey}-title`;
  const categoryFieldId = `${template.templateKey}-category`;
  const brevoTemplateIdFieldId = `${template.templateKey}-brevo-template-id`;
  const copyText = buildEmailBodyWithSubject({
    subject: template.subject,
    body: template.body,
  });

  return (
    <article
      id={template.templateKey}
      className="rounded-lg border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">
              {template.title}
            </h3>
            <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted">
              {categoryLabels[template.category]}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {template.context}
          </p>
        </div>
        <EmailTemplateCopyButton
          bodyFieldId={bodyFieldId}
          subjectFieldId={subjectFieldId}
          text={copyText}
        />
      </div>

      <form action={updateEmailTemplate} className="mt-5 space-y-4">
        <input
          type="hidden"
          name="template_key"
          value={template.templateKey}
        />
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
          <div>
            <label
              htmlFor={titleFieldId}
              className="text-sm font-semibold"
            >
              Nom du modèle
            </label>
            <input
              id={titleFieldId}
              name="title"
              type="text"
              maxLength={120}
              required
              defaultValue={template.title}
              className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label
              htmlFor={categoryFieldId}
              className="text-sm font-semibold"
            >
              Catégorie
            </label>
            <select
              id={categoryFieldId}
              name="category"
              required
              defaultValue={template.category}
              className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="candidate_journey">Parcours candidat</option>
              <option value="adopter_journey">Parcours adoptant</option>
              <option value="post_adoption">Suivi post-adoption</option>
            </select>
          </div>
        </div>
        <div>
          <label
            htmlFor={brevoTemplateIdFieldId}
            className="text-sm font-semibold"
          >
            Identifiant du modèle transactionnel Brevo
          </label>
          <input
            id={brevoTemplateIdFieldId}
            name="brevo_template_id"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            defaultValue={template.brevoTemplateId ?? ""}
            className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label
            htmlFor={subjectFieldId}
            className="text-sm font-semibold"
          >
            Sujet
          </label>
          <input
            id={subjectFieldId}
            name="subject"
            type="text"
            maxLength={255}
            required
            defaultValue={template.subject}
            className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label
            htmlFor={bodyFieldId}
            className="text-sm font-semibold"
          >
            Corps
          </label>
          <textarea
            id={bodyFieldId}
            name="body"
            required
            defaultValue={template.body}
            rows={14}
            className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2 font-sans text-sm leading-6 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {template.updatedAt
              ? `Dernière mise à jour : ${new Date(template.updatedAt).toLocaleString("fr-FR")}`
              : "Modèle par défaut prêt à enregistrer."}
          </p>
          <Button type="submit" size="sm">
            Enregistrer les modifications
          </Button>
        </div>
      </form>
    </article>
  );
}

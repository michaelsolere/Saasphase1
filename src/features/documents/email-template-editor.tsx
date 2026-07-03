import { Button } from "@/components/ui/button";
import { updateEmailTemplate } from "@/features/documents/email-template-actions";
import type { EmailTemplateRecord } from "@/features/documents/email-template-actions";

import { buildEmailBodyWithSubject } from "./email-template-defaults";
import { EmailTemplateCopyButton } from "./email-template-copy-button";

const categoryLabels = {
  adopter_journey: "Parcours adoptant",
  post_adoption: "Suivi post-adoption",
};

export function EmailTemplateEditor({
  template,
}: {
  template: EmailTemplateRecord;
}) {
  const subjectFieldId = `${template.templateKey}-subject`;
  const bodyFieldId = `${template.templateKey}-body`;
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
            Enregistrer
          </Button>
        </div>
      </form>
    </article>
  );
}

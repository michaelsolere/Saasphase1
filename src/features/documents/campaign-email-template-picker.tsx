"use client";

import { useMemo, useState } from "react";

import { EmailTemplateCopyButton } from "@/features/documents/email-template-copy-button";
import { buildEmailBodyWithSubject } from "@/features/documents/email-template-defaults";

import type { CampaignEmailTemplateOption } from "./campaign-email-template-options";

const categoryLabels = {
  candidate_journey: "Parcours candidat",
  adopter_journey: "Parcours adoptant",
  post_adoption: "Suivi post-adoption",
};

export function CampaignEmailTemplatePicker({
  templates,
}: {
  templates: CampaignEmailTemplateOption[];
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ??
      templates[0],
    [selectedTemplateId, templates],
  );

  if (templates.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Aucun modèle d’e-mail disponible. Créez ou modifiez vos modèles dans
        Documents &gt; Modèles d’e-mails.
      </div>
    );
  }

  const copyText = selectedTemplate
    ? buildEmailBodyWithSubject({
        subject: selectedTemplate.subject,
        body: selectedTemplate.body,
      })
    : "";

  return (
    <div className="mt-5 rounded-xl border bg-background p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_auto] lg:items-end">
        <div>
          <label
            htmlFor="campaign-email-template"
            className="text-sm font-semibold text-foreground"
          >
            Modèle d’e-mail
          </label>
          <select
            id="campaign-email-template"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-md border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title} - {categoryLabels[template.category]}
              </option>
            ))}
          </select>
        </div>
        <EmailTemplateCopyButton text={copyText} />
      </div>

      {selectedTemplate ? (
        <div className="mt-4 space-y-3 rounded-lg border bg-surface p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sujet
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {selectedTemplate.subject}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Texte copiable
            </p>
            <textarea
              readOnly
              rows={10}
              value={copyText}
              className="mt-2 w-full resize-y rounded-md border bg-background p-3 font-sans text-sm leading-6 text-foreground outline-none"
            />
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        Aucun email réel n’est envoyé. Copiez ce texte pour l’envoyer
        manuellement.
      </p>
    </div>
  );
}

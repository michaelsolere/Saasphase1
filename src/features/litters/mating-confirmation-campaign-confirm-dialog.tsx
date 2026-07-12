"use client";

import { useMemo, useRef, useState } from "react";

import { getSexPreferenceLabel } from "@/features/applications/formatters";

type MatingConfirmationCampaignVariables = {
  prenom: string;
  nom: string;
  nom_complet: string;
  portee: string;
  groupe_portees: string;
  mere: string;
  pere: string;
  date_saillie: string;
  date_saillie_2: string;
  nom_elevage: string;
};

type CampaignApplication = {
  id: string;
  contactName: string;
  contactEmail: string | null;
  desiredSexPreference: string | null;
  rank: number | null;
  variables: MatingConfirmationCampaignVariables;
};

type CampaignTemplate = {
  title: string;
  brevoTemplateId: number | null;
};

type BrevoCampaignConfiguration = {
  isConfigured: boolean;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
};

const variableLabels: Array<keyof MatingConfirmationCampaignVariables> = [
  "prenom",
  "nom",
  "nom_complet",
  "portee",
  "groupe_portees",
  "mere",
  "pere",
  "date_saillie",
  "date_saillie_2",
  "nom_elevage",
];

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function formatSender(configuration: BrevoCampaignConfiguration) {
  if (!configuration.senderEmail) {
    return "Valeur définie dans le modèle Brevo";
  }

  return configuration.senderName
    ? `${configuration.senderName} <${configuration.senderEmail}>`
    : configuration.senderEmail;
}

export function canConfirmMatingConfirmationCampaign({
  hasSelectedValidCandidate,
  brevoTemplateId,
  isBrevoConfigured,
}: {
  hasSelectedValidCandidate: boolean;
  brevoTemplateId: number | null | undefined;
  isBrevoConfigured: boolean;
}) {
  return (
    hasSelectedValidCandidate &&
    Boolean(brevoTemplateId) &&
    isBrevoConfigured
  );
}

export function MatingConfirmationCampaignConfirmDialog({
  action,
  litterId,
  applications,
  template,
  scopeLabel,
  brevoConfiguration,
  disabled,
}: {
  action: (formData: FormData) => void | Promise<void>;
  litterId: string;
  applications: CampaignApplication[];
  template: CampaignTemplate | null;
  scopeLabel: string;
  brevoConfiguration: BrevoCampaignConfiguration;
  disabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const applicationsById = useMemo(
    () => new Map(applications.map((app) => [app.id, app])),
    [applications],
  );
  const eligibleApplications = applications.filter((app) =>
    isValidEmail(app.contactEmail),
  );
  const excludedEmailCount = applications.length - eligibleApplications.length;
  const selectedApplications = selectedIds
    .map((id) => applicationsById.get(id))
    .filter((app): app is CampaignApplication => Boolean(app));
  const hasSelectedValidCandidate = selectedApplications.some((app) =>
    isValidEmail(app.contactEmail),
  );
  const hasTemplate = Boolean(template?.brevoTemplateId);
  const canSubmit = canConfirmMatingConfirmationCampaign({
    hasSelectedValidCandidate,
    brevoTemplateId: template?.brevoTemplateId,
    isBrevoConfigured: brevoConfiguration.isConfigured,
  });

  return (
    <>
      <form
        ref={formRef}
        action={action}
        className="mt-6"
        onSubmit={(event) => {
          if (confirmedRef.current) {
            return;
          }

          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const ids = data
            .getAll("application_ids[]")
            .filter((value): value is string => typeof value === "string");

          setSelectedIds(ids);
          setIsOpen(true);
        }}
      >
        <input type="hidden" name="litter_id" value={litterId} />
        <input
          ref={confirmationInputRef}
          type="hidden"
          name="campaign_confirmation"
          value=""
        />

        {applications.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune candidature qualifiée liée à cette portée.
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">
              Candidatures qualifiées pour la confirmation de saillie
            </legend>
            <div className="divide-y divide-border rounded-xl border bg-background">
              {applications.map((app) => {
                const sexPref = getSexPreferenceLabel(app.desiredSexPreference);
                const hasValidEmail = isValidEmail(app.contactEmail);

                return (
                  <label
                    key={app.id}
                    htmlFor={`mating-confirmation-campaign-app-${app.id}`}
                    className={`flex items-start gap-4 px-4 py-4 ${
                      hasValidEmail
                        ? "cursor-pointer hover:bg-muted-soft"
                        : "cursor-not-allowed bg-muted-soft/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`mating-confirmation-campaign-app-${app.id}`}
                      name="application_ids[]"
                      value={app.id}
                      defaultChecked={hasValidEmail}
                      disabled={!hasValidEmail}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {app.contactName}
                        </p>
                        {!hasValidEmail ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            Exclu · e-mail manquant ou invalide
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted">
                        {app.contactEmail || "Aucun e-mail"} · Préférence :{" "}
                        {sexPref}
                        {app.rank ? ` · Rang : ${app.rank}` : ""}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {excludedEmailCount > 0 ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {excludedEmailCount} candidat(s) sans adresse e-mail valide sont
            exclus de l’envoi.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={disabled || eligibleApplications.length === 0}
            className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            Envoyer via Brevo
          </button>
          <p className="text-xs text-muted">
            Envoie uniquement l’e-mail transactionnel Brevo, sans créer de
            réservation, paiement ou document.
          </p>
        </div>
      </form>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mating-confirmation-campaign-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
        >
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
            <h3
              id="mating-confirmation-campaign-confirm-title"
              className="text-lg font-semibold text-foreground"
            >
              Confirmer l’envoi Brevo de confirmation de saillie
            </h3>
            <div className="mt-5 grid gap-3 rounded-xl border bg-surface p-4 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold">Périmètre :</span> {scopeLabel}
              </p>
              <p>
                <span className="font-semibold">Modèle Brevo :</span>{" "}
                {template?.brevoTemplateId
                  ? `${template.title} (#${template.brevoTemplateId})`
                  : "Non configuré"}
              </p>
              <p>
                <span className="font-semibold">Expéditeur :</span>{" "}
                {formatSender(brevoConfiguration)}
              </p>
              <p>
                <span className="font-semibold">Adresse de réponse :</span>{" "}
                {brevoConfiguration.replyToEmail ??
                  "Valeur définie dans le modèle Brevo"}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-foreground">
                Destinataires sélectionnés
              </p>
              {selectedApplications.length === 0 ? (
                <p className="mt-2 text-sm text-amber-800">
                  Aucun destinataire sélectionné.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-border rounded-xl border">
                  {selectedApplications.map((app) => (
                    <div key={app.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-foreground">
                          {app.contactName}
                        </p>
                        <p className="text-muted">{app.contactEmail}</p>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        {variableLabels.map((variableName) => (
                          <div
                            key={variableName}
                            className="rounded-md border bg-surface px-2 py-1.5"
                          >
                            <dt className="font-semibold text-muted">
                              {variableName}
                            </dt>
                            <dd className="mt-0.5 break-words text-foreground">
                              {app.variables[variableName] || "Chaîne vide"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!hasTemplate || !brevoConfiguration.isConfigured ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Ouvrez les paramètres Brevo pour configurer
                {!hasTemplate
                  ? " l’identifiant numérique du modèle mating_confirmation"
                  : " la connexion Brevo côté serveur"}
                {!hasTemplate && !brevoConfiguration.isConfigured
                  ? " ainsi que la connexion Brevo côté serveur"
                  : ""}
                , puis relancez cette campagne.
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t pt-5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => {
                  if (confirmationInputRef.current) {
                    confirmationInputRef.current.value = "confirmed";
                  }
                  confirmedRef.current = true;
                  formRef.current?.requestSubmit();
                }}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                Confirmer et envoyer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

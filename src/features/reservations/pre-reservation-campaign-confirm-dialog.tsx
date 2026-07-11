"use client";

import { useMemo, useRef, useState } from "react";

import { getSexPreferenceLabel } from "@/features/applications/formatters";

type CampaignApplication = {
  id: string;
  contactName: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  desiredSexPreference: string | null;
  rank: number | null;
  scopeLabel?: string;
};

type CampaignTemplate = {
  title: string;
  brevoTemplateId: number | null;
};

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function PreReservationCampaignConfirmDialog({
  action,
  hiddenFieldName,
  hiddenFieldValue,
  applications,
  template,
  scopeLabel,
  amountLabel,
  deadlineLabel,
  organizationName,
  disabled,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFieldName: string;
  hiddenFieldValue: string;
  applications: CampaignApplication[];
  template: CampaignTemplate | null;
  scopeLabel: string;
  amountLabel: string;
  deadlineLabel: string;
  organizationName: string;
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
  const selectedApplications = selectedIds
    .map((id) => applicationsById.get(id))
    .filter((app): app is CampaignApplication => Boolean(app));
  const missingEmailCount = selectedApplications.filter(
    (app) => !isValidEmail(app.contactEmail),
  ).length;
  const canSubmit = selectedIds.length > 0;

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
        <input type="hidden" name={hiddenFieldName} value={hiddenFieldValue} />
        <input
          ref={confirmationInputRef}
          type="hidden"
          name="campaign_confirmation"
          value=""
        />

        {applications.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune candidature validée liée à ce périmètre.
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">Candidatures validées</legend>
            <div className="divide-y divide-border rounded-xl border bg-background">
              {applications.map((app) => {
                const sexPref = getSexPreferenceLabel(app.desiredSexPreference);
                const hasValidEmail = isValidEmail(app.contactEmail);

                return (
                  <label
                    key={app.id}
                    htmlFor={`pre-reservation-campaign-app-${app.id}`}
                    className="flex cursor-pointer items-start gap-4 px-4 py-4 hover:bg-muted-soft"
                  >
                    <input
                      type="checkbox"
                      id={`pre-reservation-campaign-app-${app.id}`}
                      name="application_ids[]"
                      value={app.id}
                      defaultChecked
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {app.contactName}
                        </p>
                        {!hasValidEmail ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            E-mail manquant ou invalide
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted">
                        {app.scopeLabel ? `${app.scopeLabel} · ` : ""}
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

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={disabled || applications.length === 0}
            className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            Préparer et envoyer via Brevo
          </button>
          <p className="text-xs text-muted">
            Crée ou réutilise les réservations et demandes de paiement, puis
            déclenche l’e-mail transactionnel Brevo pour chaque réservation.
          </p>
        </div>
      </form>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pre-reservation-campaign-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
        >
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
            <h3
              id="pre-reservation-campaign-confirm-title"
              className="text-lg font-semibold text-foreground"
            >
              Confirmer l’envoi Brevo de pré-réservation
            </h3>
            <div className="mt-5 grid gap-3 rounded-xl border bg-surface p-4 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold">Périmètre :</span> {scopeLabel}
              </p>
              <p>
                <span className="font-semibold">Montant :</span> {amountLabel}
              </p>
              <p>
                <span className="font-semibold">Échéance :</span>{" "}
                {deadlineLabel}
              </p>
              <p>
                <span className="font-semibold">Modèle Brevo :</span>{" "}
                {template?.brevoTemplateId
                  ? `${template.title} (#${template.brevoTemplateId})`
                  : "Non configuré"}
              </p>
              <p>
                <span className="font-semibold">Expéditeur :</span> Brevo,
                modèle #{template?.brevoTemplateId ?? "non configuré"}
              </p>
              <p>
                <span className="font-semibold">Reply-to :</span> Brevo,
                modèle #{template?.brevoTemplateId ?? "non configuré"}
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
                  {selectedApplications.map((app) => {
                    const fallback = splitName(app.contactName);
                    const variables = {
                      prenom: app.contactFirstName ?? fallback.firstName,
                      nom: app.contactLastName ?? fallback.lastName,
                      nom_complet: app.contactName,
                      montant_pre_reservation: amountLabel,
                      echeance_pre_reservation: deadlineLabel,
                      nom_elevage: organizationName,
                    };

                    return (
                      <div key={app.id} className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-foreground">
                            {app.contactName}
                          </p>
                          <p
                            className={
                              isValidEmail(app.contactEmail)
                                ? "text-muted"
                                : "font-semibold text-amber-800"
                            }
                          >
                            {app.contactEmail || "E-mail manquant"}
                          </p>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          Variables : {JSON.stringify(variables)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {missingEmailCount > 0 ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {missingEmailCount} destinataire(s) sans e-mail valide seront
                préparés côté réservation/paiement, mais l’e-mail Brevo sera
                signalé comme manquant.
              </p>
            ) : null}

            {!template?.brevoTemplateId ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Configurez l’identifiant numérique Brevo du modèle
                pre_reservation avant de lancer cette campagne.
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

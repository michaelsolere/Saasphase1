"use client";

import { useMemo, useState } from "react";

import { EmailTemplateCopyButton } from "@/features/documents/email-template-copy-button";
import { buildEmailBodyWithSubject } from "@/features/documents/email-template-defaults";

type ChoiceAppointmentCampaignTemplate = {
  id: string;
  templateKey: string;
  subject: string;
  body: string;
};

export type ChoiceAppointmentCampaignReservation = {
  id: string;
  contactName: string;
  contactFirstName: string;
  litterName: string;
  choiceAppointmentAt: string;
  adoptionAppointmentAt: string;
  animalName: string | null;
};

function formatAppointmentDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "date à vérifier";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function replaceAllTokens(
  value: string,
  replacements: Record<string, string>,
) {
  return Object.entries(replacements).reduce(
    (current, [token, replacement]) => current.replaceAll(token, replacement),
    value,
  );
}

function renderPersonalizedEmail({
  template,
  reservation,
}: {
  template: ChoiceAppointmentCampaignTemplate;
  reservation: ChoiceAppointmentCampaignReservation;
}) {
  const animalLabel = reservation.animalName ?? "votre futur animal";
  const replacements = {
    "[Prénom]": reservation.contactFirstName || reservation.contactName,
    "[Portée]": reservation.litterName,
    "[Date du rendez-vous de choix]": formatAppointmentDate(
      reservation.choiceAppointmentAt,
    ),
    "[Date du rendez-vous de départ]": formatAppointmentDate(
      reservation.adoptionAppointmentAt,
    ),
    "[Nom du chiot]": animalLabel,
    "[Nom de l’animal]": animalLabel,
    "[Nom de l'animal]": animalLabel,
  };

  const subject = replaceAllTokens(template.subject, replacements);
  const body = replaceAllTokens(template.body, replacements);

  return {
    subject,
    body,
    copyText: buildEmailBodyWithSubject({ subject, body }),
  };
}

export function ChoiceAppointmentCampaignList({
  reservations,
  template,
}: {
  reservations: ChoiceAppointmentCampaignReservation[];
  template: ChoiceAppointmentCampaignTemplate | null;
}) {
  const [previewedReservationId, setPreviewedReservationId] = useState<
    string | null
  >(reservations[0]?.id ?? null);
  const previewedReservation =
    reservations.find((reservation) => reservation.id === previewedReservationId) ??
    reservations[0] ??
    null;
  const preview = useMemo(() => {
    if (!template || !previewedReservation) {
      return null;
    }

    return renderPersonalizedEmail({
      template,
      reservation: previewedReservation,
    });
  }, [previewedReservation, template]);

  if (!template) {
    return (
      <p role="alert" className="mt-5 text-sm text-amber-800">
        Le modèle choice_appointment_adoption_booklet est introuvable ou inactif.
      </p>
    );
  }

  if (reservations.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted">
        Aucun dossier éligible pour cette campagne.
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <fieldset>
        <legend className="sr-only">
          Réservations éligibles aux créneaux de choix
        </legend>
        <div className="divide-y divide-border rounded-xl border bg-background">
          {reservations.map((reservation) => {
            const isPreviewed = reservation.id === previewedReservation?.id;
            const choiceLabel = formatAppointmentDate(
              reservation.choiceAppointmentAt,
            );
            const adoptionLabel = formatAppointmentDate(
              reservation.adoptionAppointmentAt,
            );

            return (
              <div
                key={reservation.id}
                className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
              >
                <label
                  htmlFor={`choice-appointments-reservation-${reservation.id}`}
                  className="flex min-w-0 cursor-pointer items-start gap-4"
                >
                  <input
                    type="checkbox"
                    id={`choice-appointments-reservation-${reservation.id}`}
                    name="reservation_ids[]"
                    value={reservation.id}
                    defaultChecked
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {reservation.contactName}
                    </span>
                    <span className="block text-xs leading-5 text-muted">
                      Choix : {choiceLabel}
                    </span>
                    <span className="block text-xs leading-5 text-muted">
                      Départ/adoption : {adoptionLabel}
                    </span>
                    <span className="block text-xs leading-5 text-muted">
                      Animal : {reservation.animalName ?? "votre futur animal"}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setPreviewedReservationId(reservation.id)}
                  className="inline-flex rounded-md border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent-soft"
                >
                  {isPreviewed ? "E-mail prévisualisé" : "Prévisualiser / Copier l’e-mail"}
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>

      {preview ? (
        <div className="rounded-xl border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Prévisualisation pour {previewedReservation?.contactName}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {preview.subject}
              </p>
            </div>
            <EmailTemplateCopyButton text={preview.copyText} />
          </div>
          <textarea
            aria-label="Prévisualisation personnalisée de l’e-mail"
            readOnly
            rows={12}
            value={preview.body}
            className="mt-3 w-full resize-y rounded-md border bg-background p-3 font-sans text-sm leading-6 text-foreground outline-none"
          />
        </div>
      ) : null}
    </div>
  );
}

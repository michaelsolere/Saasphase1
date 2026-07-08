import type { ReactNode } from "react";

import Link from "next/link";

import { attachApplicationToScope } from "@/features/applications/actions";
import {
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { formatLitterDate, getSpeciesLabel } from "@/features/litters/formatters";
import { attachReservationToScope } from "@/features/reservations/actions";
import { getReservationStatusLabel } from "@/features/reservations/formatters";

export type LinkedApplication = {
  id: string;
  contact_id: string | null;
  contact_display_name: string | null;
  species: string | null;
  breed: string | null;
  desired_sex_preference: string | null;
  status: string | null;
  created_at: string | null;
};

export type AttachableApplication = {
  id: string;
  contact_display_name: string | null;
  status: string | null;
  created_at: string | null;
  already_attached_elsewhere: boolean;
};

export type AttachableReservation = {
  id: string;
  contact_display_name: string | null;
  status: string | null;
  litter_name: string | null;
  litter_group_name: string | null;
  has_animal: boolean;
};

export function LinkedApplicationsSection({
  title,
  description,
  emptyLabel,
  applications,
  hasError,
  sectionId,
  banner,
  footer,
}: {
  title: string;
  description?: ReactNode;
  emptyLabel: string;
  applications: LinkedApplication[] | null;
  hasError: boolean;
  sectionId?: string;
  banner?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section id={sectionId} className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{title}</h2>

      {description ? (
        <p className="mt-1 text-sm text-muted">{description}</p>
      ) : null}

      {banner}

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les candidatures liées.
        </p>
      ) : !applications || applications.length === 0 ? (
        <p className="mt-5 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {applications.map((application) => (
            <div key={application.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {application.contact_id ? (
                        <Link
                          href={`/contacts/${application.contact_id}`}
                          className="text-accent hover:underline"
                        >
                          {application.contact_display_name ??
                            "Contact non renseigné"}
                        </Link>
                      ) : (
                        application.contact_display_name ??
                        "Contact non renseigné"
                      )}
                    </span>
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getApplicationStatusLabel(application.status)}
                    </span>
                    <Link
                      href={`/candidatures/${application.id}`}
                      className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                    >
                      Fiche
                    </Link>
                  </div>
                  <p className="text-xs text-muted">
                    {getSpeciesLabel(application.species)} ·{" "}
                    {application.breed || "Race non renseignée"}
                  </p>
                  <p className="text-xs text-muted">
                    Sexe souhaité :{" "}
                    {getSexPreferenceLabel(application.desired_sex_preference)}
                  </p>
                  <p className="text-xs text-muted">
                    Créée le {formatLitterDate(application.created_at)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {footer}
    </section>
  );
}

function attachOptionLabel(application: AttachableApplication) {
  const contact = application.contact_display_name ?? "Contact non renseigné";
  const status = getApplicationStatusLabel(application.status);
  const created = formatLitterDate(application.created_at);
  const elsewhere = application.already_attached_elsewhere
    ? " · déjà rattachée ailleurs"
    : "";

  return `${contact} · ${status} · créée le ${created}${elsewhere}`;
}

export function AttachApplicationForm({
  scope,
  applications,
}: {
  scope:
    | { kind: "litter"; litterId: string; label: string; warning: string }
    | { kind: "group"; groupId: string; label: string; warning: string };
  applications: AttachableApplication[];
}) {
  return (
    <details className="mt-6 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-accent">
        {scope.label}
      </summary>

      {applications.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Aucune candidature disponible à rattacher pour le moment.
        </p>
      ) : (
        <form action={attachApplicationToScope} className="mt-4 space-y-4">
          {scope.kind === "litter" ? (
            <input type="hidden" name="litter_id" value={scope.litterId} />
          ) : (
            <input
              type="hidden"
              name="litter_group_id"
              value={scope.groupId}
            />
          )}

          <div>
            <label
              htmlFor={`attach-application-${
                scope.kind === "litter" ? scope.litterId : scope.groupId
              }`}
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Candidature à rattacher
            </label>
            <select
              id={`attach-application-${
                scope.kind === "litter" ? scope.litterId : scope.groupId
              }`}
              name="application_id"
              required
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Choisir une candidature…
              </option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {attachOptionLabel(application)}
                </option>
              ))}
            </select>
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            {scope.warning} Si cette candidature avait déjà une portée ou
            période souhaitée, elle sera remplacée. Cette action ne crée pas de
            réservation et ne change pas son statut.
          </p>

          <button
            type="submit"
            className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Rattacher la candidature
          </button>
        </form>
      )}
    </details>
  );
}

function reservationScopeLabel(reservation: AttachableReservation) {
  if (reservation.litter_name) {
    return `Portée : ${reservation.litter_name}`;
  }
  if (reservation.litter_group_name) {
    return `Groupe : ${reservation.litter_group_name}`;
  }
  return "Sans rattachement";
}

function attachReservationOptionLabel(reservation: AttachableReservation) {
  const contact = reservation.contact_display_name ?? "Contact non renseigné";
  const status = getReservationStatusLabel(reservation.status);
  const scope = reservationScopeLabel(reservation);
  const blocked = reservation.has_animal
    ? " · animal attribué (non rattachable)"
    : "";

  return `${contact} · ${status} · ${scope}${blocked}`;
}

export function AttachReservationForm({
  scope,
  reservations,
}: {
  scope:
    | { kind: "litter"; litterId: string; label: string; warning: string }
    | { kind: "group"; groupId: string; label: string; warning: string };
  reservations: AttachableReservation[];
}) {
  return (
    <details className="mt-6 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-accent">
        {scope.label}
      </summary>

      {reservations.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Aucune réservation disponible à rattacher pour le moment.
        </p>
      ) : (
        <form action={attachReservationToScope} className="mt-4 space-y-4">
          {scope.kind === "litter" ? (
            <input type="hidden" name="litter_id" value={scope.litterId} />
          ) : (
            <input
              type="hidden"
              name="litter_group_id"
              value={scope.groupId}
            />
          )}

          <div>
            <label
              htmlFor={`attach-reservation-${
                scope.kind === "litter" ? scope.litterId : scope.groupId
              }`}
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Réservation à rattacher
            </label>
            <select
              id={`attach-reservation-${
                scope.kind === "litter" ? scope.litterId : scope.groupId
              }`}
              name="reservation_id"
              required
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Choisir une réservation…
              </option>
              {reservations.map((reservation) => (
                <option
                  key={reservation.id}
                  value={reservation.id}
                  disabled={reservation.has_animal}
                >
                  {attachReservationOptionLabel(reservation)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Les réservations ayant déjà un animal attribué sont désactivées :
              elles ne peuvent pas être déplacées depuis cet écran.
            </p>
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            {scope.warning} Si cette réservation avait déjà une portée ou un
            groupe, ce rattachement sera remplacé. Cette action ne change pas
            son statut, ni les paiements, les documents, les notes ou l’animal
            attribué.
          </p>

          <button
            type="submit"
            className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Rattacher la réservation
          </button>
        </form>
      )}
    </details>
  );
}

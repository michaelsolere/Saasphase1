import Link from "next/link";

import { formatApplicationDate } from "@/features/applications/formatters";
import {
  getContactChronologyKindLabel,
  type ContactChronologyEntry,
} from "@/features/contacts/contact-360-model";
import type { ReservationOverview } from "@/features/reservations/types";
import { getReservationStatusLabel } from "@/features/reservations/formatters";

const KIND_BADGE_CLASSES: Record<ContactChronologyEntry["kind"], string> = {
  form_submission: "bg-sky-100 text-sky-900",
  application: "bg-accent-soft text-accent",
  payment: "bg-emerald-100 text-emerald-900",
  document: "bg-violet-100 text-violet-900",
  appointment: "bg-amber-100 text-amber-900",
  note: "bg-neutral-200 text-neutral-800",
  manual_contact: "bg-cyan-100 text-cyan-900",
  email: "bg-indigo-100 text-indigo-900",
};

export function ContactJourneyDossierCard({ reservation }: { reservation: ReservationOverview }) {
  const targetLitter = reservation.litter_name ?? reservation.litter_group_name ?? "Portée non précisée";
  const isFinalized = reservation.status === "adopted";
  const isClosed = Boolean(
    reservation.status &&
      ["cancelled", "withdrawn", "expired", "archived"].includes(reservation.status),
  );

  return (
    <Link
      href={`/reservations/${reservation.id}`}
      className="block rounded-xl border bg-background p-5 transition hover:border-accent/50 hover:bg-accent-soft"
      data-testid="journey-dossier-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{targetLitter}</span>
        <span
          className={
            isFinalized || isClosed
              ? "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
              : "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
          }
        >
          {isFinalized
            ? "Dossier finalisé"
            : isClosed
              ? `Dossier clos · ${getReservationStatusLabel(reservation.status)}`
              : "Dossier en cours"}
        </span>
        {reservation.animal_display_name ? (
          <span className="text-xs font-medium text-muted">
            {reservation.animal_display_name}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted">
        Dernière activité : {formatApplicationDate(reservation.created_at)} · Ouvrir le dossier parcours adoptant →
      </p>
    </Link>
  );
}

export function ContactChronologyPanel({
  entries,
  totalCount,
  hasMore,
  nextPage,
}: {
  entries: ContactChronologyEntry[];
  totalCount: number;
  hasMore: boolean;
  nextPage: number;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8" data-testid="contact-chronology">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Chronologie</h2>
        <p className="text-sm text-muted">{totalCount} événement{totalCount === 1 ? "" : "s"}</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Aucun événement à afficher pour ce contact.</p>
      ) : (
        <>
          <ol className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="py-4 first:pt-0 last:pb-0" data-testid="chronology-entry">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_BADGE_CLASSES[entry.kind]}`}
                  >
                    {getContactChronologyKindLabel(entry.kind)}
                  </span>
                  <span className="text-sm font-medium text-foreground">{entry.label}</span>
                  <span className="ml-auto text-xs text-muted">
                    {formatApplicationDate(entry.occurredAt)}
                  </span>
                </div>
                {entry.detail ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {entry.detail}
                  </p>
                ) : null}
                {entry.email ? <ContactEmailTechnicalDetails email={entry.email} /> : null}
              </li>
            ))}
          </ol>
          {hasMore ? (
            <Link
              href={`?page=${nextPage}`}
              className="mt-4 inline-flex rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent-soft"
            >
              Afficher plus
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ContactSectionError({ label }: { label: string }) {
  return (
    <p role="alert" className="text-sm text-amber-800">
      Impossible de charger {label}.
    </p>
  );
}

const emailStatusLabels: Record<string, string> = {
  sent: "Envoyé",
  failed: "Échec",
  pending: "En attente",
};

function ContactEmailTechnicalDetails({
  email,
}: {
  email: ContactChronologyEntry["email"];
}) {
  if (!email) {
    return null;
  }

  const rows: Array<[string, string]> = [
    ["Destinataire", email.recipientEmail ?? "Non renseigné"],
    ["Objet", email.subject ?? "Sans objet"],
    ["Statut", email.status ? (emailStatusLabels[email.status] ?? email.status) : "Inconnu"],
    ["Tentatives", String(email.attemptCount ?? 0)],
  ];
  if (email.lastErrorCode) {
    rows.push(["Dernière erreur", email.lastErrorCode]);
  }
  rows.push([
    "Envoyé le",
    email.sentAt ? formatApplicationDate(email.sentAt) : "Jamais envoyé",
  ]);
  if (email.attachmentCount) {
    rows.push(["Pièces jointes", String(email.attachmentCount)]);
  }

  return (
    <details
      className="mt-2 rounded-lg border bg-background px-3 py-2 text-xs"
      data-testid={`email-details-${email.sentAt ? "sent" : "pending"}`}
    >
      <summary className="cursor-pointer font-semibold text-accent">
        Détails techniques
      </summary>
      <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-0.5 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createAnimalHealthEvent,
  promoteAnimalToHomeBreeder,
  updateAnimalFinalIdentity,
} from "@/features/animals/actions";
import {
  formatAnimalCoat,
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalSpeciesLabel,
  getAnimalStatusLabel,
  getBornOffspringLabel,
  getOwnershipStatusLabel,
} from "@/features/animals/formatters";
import type { DBAnimal } from "@/features/animals/types";
import { getSexPreferenceLabel } from "@/features/applications/formatters";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getLitterStatusLabel,
  getSpeciesLabel as getLitterSpeciesLabel,
} from "@/features/litters/formatters";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LitterLookup = {
  id: string | null;
  name: string | null;
  litter_group_name: string | null;
  species: string | null;
  breed: string | null;
  status: string | null;
  expected_birth_date: string | null;
  actual_birth_date: string | null;
  expected_puppy_count: number | null;
  born_total_count: number | null;
  alive_count: number | null;
  animal_count: number | null;
  reservation_count: number | null;
};

type ParentLookup = Pick<DBAnimal, "id" | "display_name">;
type RelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  received_at: string | null;
  signed_at: string | null;
  file_name: string | null;
  signature_required: boolean;
};
type RelatedEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  priority: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};
type RelatedNote = {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  visibility: string;
  created_at: string;
  created_by: string | null;
  profiles: { display_name: string | null } | null;
};

const HEALTH_KEYWORDS = [
  "health",
  "sante",
  "sanitaire",
  "medical",
  "veterinaire",
  "veterinary",
  "vaccin",
  "vaccination",
  "vaccine",
  "vermifuge",
  "deworming",
];

const animalHealthEventTypeOptions = [
  ["vaccination", "Vaccination"],
  ["xray", "Radiographie"],
  ["ultrasound", "Échographie"],
  ["pregnancy_check", "Contrôle de gestation"],
  ["other", "Autre"],
] as const;

const eventStatusOptions = [
  ["planned", "Planifié"],
  ["todo", "À faire"],
  ["in_progress", "En cours"],
  ["done", "Fait"],
  ["late", "En retard"],
  ["cancelled", "Annulé"],
  ["postponed", "Reporté"],
  ["not_applicable", "Sans objet"],
] as const;

const eventPriorityOptions = [
  ["low", "Basse"],
  ["normal", "Normale"],
  ["high", "Haute"],
  ["urgent", "Urgente"],
] as const;

function booleanLabel(value: boolean | null) {
  return value ? "Oui" : "Non";
}

function formatBirthWeight(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  return `${new Intl.NumberFormat("fr-FR").format(value)} g`;
}

function formatBirthOrder(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatBirthTime(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return value.slice(0, 5);
}

function getUsefulDocumentDate(document: RelatedDocument) {
  if (document.signed_at) {
    return { label: "Signé le", value: document.signed_at };
  }

  if (document.received_at) {
    return { label: "Reçu le", value: document.received_at };
  }

  if (document.sent_at) {
    return { label: "Envoyé le", value: document.sent_at };
  }

  if (document.updated_at) {
    return { label: "Mis à jour le", value: document.updated_at };
  }

  return { label: "Créé le", value: document.created_at };
}

function getUsefulEventDate(event: RelatedEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getEventTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function normalizeHealthLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasHealthKeyword(value: string) {
  const normalizedValue = normalizeHealthLookup(value);

  return HEALTH_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
}

function isHealthNote(note: RelatedNote) {
  return note.note_type === "health";
}

function isHealthEvent(event: RelatedEvent) {
  return hasHealthKeyword(event.event_type);
}

function isHealthDocument(document: RelatedDocument) {
  return hasHealthKeyword(`${document.document_type} ${document.title}`);
}

function canPromoteToHomeBreeder(animal: DBAnimal) {
  const isHomeOrKept =
    animal.status === "kept" ||
    ["owned", "produced"].includes(String(animal.ownership_status)) ||
    Boolean(animal.litter_id);
  const isAdoptedOut = ["adopted_out", "sold"].includes(
    String(animal.ownership_status),
  );

  return (
    animal.sex === "female" &&
    !animal.is_external &&
    !animal.is_breeder &&
    !animal.is_retired &&
    animal.status !== "adopted" &&
    animal.status !== "deceased" &&
    animal.status !== "archived" &&
    animal.status !== "retired" &&
    !isAdoptedOut &&
    isHomeOrKept
  );
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Animal introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cet animal n’existe pas ou vous n’êtes pas autorisé à le consulter.
      </p>
      <Link
        href="/animals"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux animaux
      </Link>
    </section>
  );
}

function ErrorMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h1 className="text-xl font-semibold">
        Impossible de charger l’animal
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/animals"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux animaux
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function DetailLink({
  label,
  href,
}: {
  label: string;
  href: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 break-all text-sm leading-6">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:underline"
          >
            {href}
          </a>
        ) : (
          "Non renseigné"
        )}
      </dd>
    </div>
  );
}

function FinalIdentityField({
  id,
  label,
  name,
  defaultValue,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | null;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function RelatedLitterSection({
  animalLitterId,
  litter,
}: {
  animalLitterId: string | null;
  litter: LitterLookup | null;
}) {
  if (!animalLitterId) {
    return (
      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Portée liée</h2>
        <p className="mt-5 text-sm text-muted">
          Aucune portée liée à cet animal.
        </p>
      </section>
    );
  }

  if (!litter) {
    return (
      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Portée liée</h2>
        <p className="mt-5 text-sm text-muted">
          Portée non renseignée ou inaccessible.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold">Portée liée</h2>
          <p className="mt-2 text-sm text-muted">
            {getLitterDisplayName(litter.name, litter.id)}
          </p>
        </div>
        {litter.id ? (
          <Link
            href={`/litters/${litter.id}`}
            className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
          >
            Consulter la portée
          </Link>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
        <DetailItem
          label="Nom"
          value={getLitterDisplayName(litter.name, litter.id)}
        />
        <DetailItem
          label="Groupe de portée"
          value={litter.litter_group_name}
        />
        <DetailItem
          label="Espèce"
          value={getLitterSpeciesLabel(litter.species)}
        />
        <DetailItem label="Race" value={litter.breed} />
        <DetailItem
          label="Statut"
          value={getLitterStatusLabel(litter.status)}
        />
        <DetailItem
          label="Naissance prévue"
          value={formatLitterDate(litter.expected_birth_date)}
        />
        <DetailItem
          label="Naissance réelle"
          value={formatLitterDate(litter.actual_birth_date)}
        />
        <DetailItem
          label="Nombre attendu"
          value={formatLitterCount(litter.expected_puppy_count)}
        />
        <DetailItem
          label="Nombre né total"
          value={formatLitterCount(litter.born_total_count)}
        />
        <DetailItem
          label="Nombre vivant"
          value={formatLitterCount(litter.alive_count)}
        />
        <DetailItem
          label="Nombre d’animaux"
          value={formatLitterCount(litter.animal_count)}
        />
        <DetailItem
          label="Nombre de réservations"
          value={formatLitterCount(litter.reservation_count)}
        />
      </dl>
    </section>
  );
}

function RelatedReservationSection({
  reservation,
  hasError,
}: {
  reservation: ReservationOverview | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold">Réservation liée</h2>
          {reservation ? (
            <p className="mt-2 text-sm text-muted">
              {reservation.contact_display_name ?? "Contact non renseigné"}
            </p>
          ) : null}
        </div>
        {reservation?.id || reservation?.contact_id ? (
          <div className="flex flex-wrap gap-2">
            {reservation.contact_id ? (
              <Link
                href={`/contacts/${reservation.contact_id}`}
                className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
              >
                Voir le contact
              </Link>
            ) : null}
            {reservation.id ? (
              <Link
                href={`/reservations/${reservation.id}`}
                className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
              >
                Consulter
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger la réservation liée.
        </p>
      ) : !reservation ? (
        <p className="mt-5 text-sm text-muted">
          Aucune réservation liée à cet animal.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {reservation.status === "adopted" ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              Animal adopté via cette réservation.
            </p>
          ) : null}

          <dl className="grid gap-6 sm:grid-cols-2">
            <DetailItem
              label="Statut"
              value={getReservationStatusLabel(reservation.status)}
            />
            <DetailItem
              label="Contact"
              value={reservation.contact_display_name}
            />
            <DetailItem
              label="Préférence de sexe"
              value={getSexPreferenceLabel(reservation.reserved_sex_preference)}
            />
            <DetailItem
              label="Prix"
              value={formatPrice(reservation.price_cents, reservation.currency)}
            />
            <DetailItem
              label="Montant payé"
              value={formatPrice(reservation.paid_cents, reservation.currency)}
            />
            {reservation.refunded_cents !== null &&
            reservation.refunded_cents !== undefined &&
            reservation.refunded_cents > 0 ? (
              <DetailItem
                label="Montant remboursé"
                value={formatPrice(
                  reservation.refunded_cents,
                  reservation.currency,
                )}
              />
            ) : null}
            {reservation.status === "adopted" &&
            reservation.adoption_completed_at ? (
              <DetailItem
                label="Date d’adoption effective"
                value={formatAnimalDate(reservation.adoption_completed_at)}
              />
            ) : null}
            <DetailItem
              label="Création"
              value={formatAnimalDate(reservation.created_at)}
            />
          </dl>
        </div>
      )}
    </section>
  );
}

function AnimalHealthSection({
  animalId,
  notes,
  events,
  documents,
  hasError,
  eventStatus,
}: {
  animalId: string;
  notes: RelatedNote[];
  events: RelatedEvent[];
  documents: RelatedDocument[];
  hasError: boolean;
  eventStatus?: string;
}) {
  const hasHealthData =
    notes.length > 0 || events.length > 0 || documents.length > 0;

  return (
    <section id="sante" className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Santé</h2>

      {eventStatus === "success" ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        >
          L’événement santé a été ajouté.
        </p>
      ) : eventStatus ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Impossible d’ajouter l’événement santé. Vérifiez le titre et la date.
        </p>
      ) : null}

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Certaines données liées n’ont pas pu être chargées.
        </p>
      ) : null}

      {!hasHealthData ? (
        <p className="mt-5 text-sm text-muted">
          Aucune donnée santé clairement identifiable pour cet animal.
        </p>
      ) : (
        <div className="mt-6 space-y-7">
          {notes.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Notes santé</h3>
              <div className="mt-3 divide-y divide-border">
                {notes.map((note) => {
                  const authorName = note.profiles?.display_name ?? null;

                  return (
                    <div key={note.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="space-y-2">
                        {note.title ? (
                          <p className="text-sm font-semibold text-foreground">
                            {note.title}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                          {note.body}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          <span>Type : {note.note_type}</span>
                          <span>
                            Créée le {formatAnimalDate(note.created_at)}
                          </span>
                          {authorName ? <span>Par {authorName}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {events.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Événements santé</h3>
              <div className="mt-3 divide-y divide-border">
                {events.map((event) => (
                  <div key={event.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {event.title || getEventTypeLabel(event.event_type)}
                        </span>
                        <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                          {event.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        Type : {getEventTypeLabel(event.event_type)}
                      </p>
                      <p className="text-xs text-muted">
                        Date utile :{" "}
                        {formatAnimalDate(getUsefulEventDate(event))}
                      </p>
                      {event.description ? (
                        <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                          {event.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {documents.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Documents santé</h3>
              <div className="mt-3 divide-y divide-border">
                {documents.map((document) => {
                  const usefulDate = getUsefulDocumentDate(document);

                  return (
                    <div
                      key={document.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            {document.title}
                          </span>
                          <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                            {getDocumentStatusLabel(document.status)}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          Type : {getDocumentTypeLabel(document.document_type)}
                        </p>
                        <p className="text-xs text-muted">
                          {usefulDate.label}{" "}
                          {formatAnimalDate(usefulDate.value)}
                        </p>
                        <Link
                          href={`/documents/${document.id}`}
                          className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                        >
                          Consulter
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <form action={createAnimalHealthEvent} className="mt-8 border-t pt-6">
        <input type="hidden" name="animal_id" value={animalId} />
        <h3 className="text-sm font-semibold text-foreground">
          Ajouter un événement santé
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="animal-health-event-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Titre <span className="text-accent">*</span>
            </label>
            <input
              id="animal-health-event-title"
              name="title"
              type="text"
              required
              maxLength={255}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="animal-health-event-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Date prévue / réelle <span className="text-accent">*</span>
            </label>
            <input
              id="animal-health-event-date"
              name="planned_date"
              type="date"
              required
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="animal-health-event-type"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Type
            </label>
            <select
              id="animal-health-event-type"
              name="event_type"
              defaultValue="vaccination"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {animalHealthEventTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-5 text-muted">
              Le type Autre peut ne pas réapparaître dans cette section avec le
              filtre santé actuel.
            </p>
          </div>

          <div>
            <label
              htmlFor="animal-health-event-status"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Statut
            </label>
            <select
              id="animal-health-event-status"
              name="status"
              defaultValue="planned"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {eventStatusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="animal-health-event-priority"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Priorité
            </label>
            <select
              id="animal-health-event-priority"
              name="priority"
              defaultValue="normal"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {eventPriorityOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="self-end">
            <label
              htmlFor="animal-health-event-is-task"
              className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm text-muted"
            >
              <input
                id="animal-health-event-is-task"
                name="is_task"
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Marquer comme tâche
            </label>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="animal-health-event-description"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Note
            </label>
            <textarea
              id="animal-health-event-description"
              name="description"
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Ajouter l’événement
        </button>
      </form>
    </section>
  );
}

function RelatedEventsSection({
  events,
  hasError,
}: {
  events: RelatedEvent[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Événements liés</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les événements liés.
        </p>
      ) : !events || events.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun événement lié à cet animal.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {events.map((event) => (
            <div key={event.id} className="py-5 first:pt-0 last:pb-0">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {event.title || getEventTypeLabel(event.event_type)}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    {event.status}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    Priorité : {event.priority}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Type : {getEventTypeLabel(event.event_type)}
                </p>
                <p className="text-xs text-muted">
                  Date utile : {formatAnimalDate(getUsefulEventDate(event))}
                </p>
                <p className="text-xs text-muted">
                  Créé le {formatAnimalDate(event.created_at)}
                </p>
                {event.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RelatedNotesSection({
  notes,
  hasError,
}: {
  notes: RelatedNote[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Notes liées</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les notes liées.
        </p>
      ) : !notes || notes.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucune note liée à cet animal.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {notes.map((note) => {
            const authorName = note.profiles?.display_name ?? null;

            return (
              <div key={note.id} className="py-5 first:pt-0 last:pb-0">
                <div className="space-y-2">
                  {note.title ? (
                    <p className="text-sm font-semibold text-foreground">
                      {note.title}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {note.body}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>Type : {note.note_type}</span>
                    <span>Visibilité : {note.visibility}</span>
                    <span>Créée le {formatAnimalDate(note.created_at)}</span>
                    {authorName ? <span>Par {authorName}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RelatedDocumentsSection({
  documents,
  hasError,
}: {
  documents: RelatedDocument[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Documents liés</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les documents liés.
        </p>
      ) : !documents || documents.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun document lié à cet animal.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {documents.map((document) => {
            const usefulDate = getUsefulDocumentDate(document);

            return (
              <div key={document.id} className="py-5 first:pt-0 last:pb-0">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {document.title}
                    </span>
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getDocumentStatusLabel(document.status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Type : {getDocumentTypeLabel(document.document_type)}
                  </p>
                  <p className="text-xs text-muted">
                    {usefulDate.label} {formatAnimalDate(usefulDate.value)}
                  </p>
                  <p className="text-xs text-muted">
                    Fichier : {document.file_name || "Non renseigné"}
                  </p>
                  <p className="text-xs text-muted">
                    Signature requise :{" "}
                    {getSignatureRequiredLabel(document.signature_required)}
                  </p>
                  <Link
                    href={`/documents/${document.id}`}
                    className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                  >
                    Consulter
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default async function AnimalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    identity_status?: string;
    final_identity_status?: string;
    health_event_status?: string;
    home_breeder_promotion_status?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawAnimal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, display_name, temporary_name, call_name, official_name, chosen_name_by_adopter, species, breed, sex, status, ownership_status, birth_date, death_date, litter_id, mother_id, father_id, identification_number, lof_number, color, coat_color, birth_order, birth_time, birth_weight_grams, collar_color_initial, collar_color_current, collar_color_note, official_affix_name, pedigree_url, is_breeder, is_external, is_retired, notes, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const animal = rawAnimal as DBAnimal | null;

  const { data: rawLitter, error: litterError } = animal?.litter_id
    ? await supabase
        .from("litter_overview")
        .select(
          "id, name, litter_group_name, species, breed, status, expected_birth_date, actual_birth_date, expected_puppy_count, born_total_count, alive_count, animal_count, reservation_count",
        )
        .eq("id", animal.litter_id)
        .maybeSingle()
    : { data: null, error: null };

  const parentIds = animal
    ? Array.from(new Set([animal.mother_id, animal.father_id].filter(Boolean))) as string[]
    : [];

  const { data: rawParents, error: parentsError } = parentIds.length
    ? await supabase
        .from("animals")
        .select("id, display_name")
        .in("id", parentIds)
        .is("deleted_at", null)
    : { data: [], error: null };

  const litter = rawLitter as LitterLookup | null;
  const parentsById = new Map(
    ((rawParents as ParentLookup[] | null) ?? []).map((parent) => [
      parent.id,
      parent.display_name,
    ]),
  );

  const motherDisplayName = animal?.mother_id
    ? parentsById.get(animal.mother_id) ?? null
    : null;
  const fatherDisplayName = animal?.father_id
    ? parentsById.get(animal.father_id) ?? null
    : null;

  const { data: rawDocuments, error: documentsError } = animal
    ? await supabase
        .from("documents")
        .select(
          "id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, file_name, signature_required",
        )
        .eq("animal_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const animalDocuments = rawDocuments as RelatedDocument[] | null;

  const { data: rawEvents, error: eventsError } = animal
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("animal_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const animalEvents = rawEvents as RelatedEvent[] | null;

  const { data: rawNotes, error: notesError } = animal
    ? await supabase
        .from("notes")
        .select(
          "id, title, body, note_type, visibility, created_at, created_by, profiles!created_by(display_name)",
        )
        .eq("animal_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const animalNotes = rawNotes as RelatedNote[] | null;
  const healthNotes = (animalNotes ?? []).filter(isHealthNote);
  const healthEvents = (animalEvents ?? []).filter(isHealthEvent);
  const healthDocuments = (animalDocuments ?? []).filter(isHealthDocument);

  const { data: rawReservations, error: reservationError } = animal
    ? await supabase
        .from("reservation_overview")
        .select(
          "id, contact_id, contact_display_name, animal_id, animal_display_name, reserved_sex_preference, status, price_cents, currency, paid_cents, refunded_cents, adoption_completed_at, created_at, updated_at",
        )
        .eq("animal_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
    : { data: null, error: null };

  const relatedReservation =
    ((rawReservations as ReservationOverview[] | null) ?? [])[0] ?? null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/animals"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux animaux
        </Link>
      </div>

      <div className="mt-8">
        {readError || litterError || parentsError ? (
          <ErrorMessage />
        ) : !animal ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Animal · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {getAnimalDisplayName(animal)}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatAnimalDate(animal.created_at)}
                </p>
                {getBornOffspringLabel(animal) ? (
                  <p className="mt-3 w-fit rounded-xl border bg-surface px-4 py-2 text-sm font-medium text-muted">
                    {getBornOffspringLabel(animal)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/animals/${animal.id}/edit`}
                  className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Modifier les informations
                </Link>
                <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted">
                  Lecture seule
                </span>
              </div>
            </header>

            <div className="space-y-6 py-8">
              {query.identity_status === "success" ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-sm text-emerald-950">
                  Les informations de l’animal ont été mises à jour.
                </section>
              ) : null}

              {query.final_identity_status === "success" ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-sm text-emerald-950">
                  L’identité définitive de l’animal a été mise à jour.
                </section>
              ) : query.final_identity_status ? (
                <section
                  role="alert"
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
                >
                  Impossible de mettre à jour l’identité définitive. Aucune
                  autre donnée n’a été modifiée.
                </section>
              ) : null}

              {query.home_breeder_promotion_status === "success" ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-sm text-emerald-950">
                  L’animal est maintenant reproductrice maison.
                </section>
              ) : query.home_breeder_promotion_status ? (
                <section
                  role="alert"
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
                >
                  Impossible de promouvoir cet animal en reproductrice maison.
                </section>
              ) : null}

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Identité</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem label="Nom principal" value={animal.display_name} />
                  <DetailItem label="Nom temporaire" value={animal.temporary_name} />
                  <DetailItem label="Nom d’appel" value={animal.call_name} />
                  <DetailItem label="Nom officiel" value={animal.official_name} />
                  <DetailItem
                    label="Nom choisi par l’adoptant"
                    value={animal.chosen_name_by_adopter}
                  />
                  <DetailItem
                    label="Nom d’affixe officiel"
                    value={animal.official_affix_name}
                  />
                </dl>
              </section>

              <section
                id="identite-definitive"
                className="rounded-2xl border bg-surface p-6 sm:p-8"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Renseigner l’identité définitive
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Mise à jour des informations utiles avant départ, sans
                      modifier le nom provisoire, le collier ou le nom
                      principal.
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                    Avant départ
                  </span>
                </div>

                <form
                  action={updateAnimalFinalIdentity}
                  className="mt-6 border-t pt-6"
                >
                  <input type="hidden" name="animal_id" value={animal.id} />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FinalIdentityField
                      id="animal-final-identification"
                      label="Numéro d’identification"
                      name="identification_number"
                      defaultValue={animal.identification_number}
                    />
                    <FinalIdentityField
                      id="animal-final-official-name"
                      label="Nom officiel"
                      name="official_name"
                      defaultValue={animal.official_name}
                    />
                    <FinalIdentityField
                      id="animal-final-call-name"
                      label="Nom d’usage"
                      name="call_name"
                      defaultValue={animal.call_name}
                    />
                    <FinalIdentityField
                      id="animal-final-adopter-name"
                      label="Nom choisi par l’adoptant"
                      name="chosen_name_by_adopter"
                      defaultValue={animal.chosen_name_by_adopter}
                    />
                    <FinalIdentityField
                      id="animal-final-affix-name"
                      label="Nom d’affixe officiel"
                      name="official_affix_name"
                      defaultValue={animal.official_affix_name}
                    />
                    <FinalIdentityField
                      id="animal-final-lof-number"
                      label="Numéro LOF"
                      name="lof_number"
                      defaultValue={animal.lof_number}
                    />
                  </div>
                  <div className="mt-6 flex justify-end border-t pt-6">
                    <button
                      type="submit"
                      className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Enregistrer l’identité définitive
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Statut et informations générales
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Espèce"
                    value={getAnimalSpeciesLabel(animal.species)}
                  />
                  <DetailItem label="Race" value={animal.breed} />
                  <DetailItem
                    label="Sexe"
                    value={getAnimalSexLabel(animal.sex)}
                  />
                  <DetailItem
                    label="Statut"
                    value={getAnimalStatusLabel(animal.status)}
                  />
                  <DetailItem
                    label="Statut de propriété"
                    value={getOwnershipStatusLabel(animal.ownership_status)}
                  />
                  <DetailItem
                    label="Reproducteur"
                    value={booleanLabel(animal.is_breeder)}
                  />
                  <DetailItem
                    label="Animal extérieur"
                    value={booleanLabel(animal.is_external)}
                  />
                  <DetailItem
                    label="Retraité"
                    value={booleanLabel(animal.is_retired)}
                  />
                </dl>

                {canPromoteToHomeBreeder(animal) ? (
                  <form
                    action={promoteAnimalToHomeBreeder}
                    className="mt-6 border-t pt-6"
                  >
                    <input type="hidden" name="animal_id" value={animal.id} />
                    <label
                      htmlFor="confirm-home-breeder-promotion"
                      className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm leading-6 text-muted"
                    >
                      <input
                        id="confirm-home-breeder-promotion"
                        name="confirm_home_breeder_promotion"
                        type="checkbox"
                        value="yes"
                        required
                        className="mt-1 h-4 w-4 rounded border-border accent-accent"
                      />
                      Je confirme que cet animal doit devenir reproductrice
                      maison.
                    </label>
                    <button
                      type="submit"
                      className="mt-4 inline-flex rounded-xl border px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                    >
                      Promouvoir en reproductrice maison
                    </button>
                  </form>
                ) : null}
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Naissance et filiation
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Date de naissance"
                    value={formatAnimalDate(animal.birth_date)}
                  />
                  <DetailItem
                    label="Date de décès"
                    value={formatAnimalDate(animal.death_date)}
                  />
                  <DetailItem
                    label="Portée liée"
                    value={litter ? getLitterDisplayName(litter.name, litter.id) : null}
                  />
                  <DetailItem
                    label="Groupe de portée"
                    value={litter?.litter_group_name ?? null}
                  />
                  <DetailItem label="Mère" value={motherDisplayName} />
                  <DetailItem label="Père" value={fatherDisplayName} />
                  <DetailItem
                    label="Ordre de naissance"
                    value={formatBirthOrder(animal.birth_order)}
                  />
                  <DetailItem
                    label="Heure de naissance"
                    value={formatBirthTime(animal.birth_time)}
                  />
                  <DetailItem
                    label="Poids de naissance"
                    value={formatBirthWeight(animal.birth_weight_grams)}
                  />
                </dl>
              </section>

              <RelatedLitterSection
                animalLitterId={animal.litter_id}
                litter={litter}
              />

              <RelatedReservationSection
                reservation={relatedReservation}
                hasError={Boolean(reservationError)}
              />

              <AnimalHealthSection
                animalId={animal.id}
                notes={healthNotes}
                events={healthEvents}
                documents={healthDocuments}
                hasError={Boolean(documentsError || eventsError || notesError)}
                eventStatus={query.health_event_status}
              />

              <RelatedDocumentsSection
                documents={animalDocuments}
                hasError={Boolean(documentsError)}
              />

              <RelatedEventsSection
                events={animalEvents}
                hasError={Boolean(eventsError)}
              />

              <RelatedNotesSection
                notes={animalNotes}
                hasError={Boolean(notesError)}
              />

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Identification et robe
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Numéro d’identification"
                    value={animal.identification_number}
                  />
                  <DetailItem label="Numéro LOF" value={animal.lof_number} />
                  <DetailItem label="Couleur" value={animal.color} />
                  <DetailItem label="Robe" value={animal.coat_color} />
                  <DetailItem
                    label="Couleur ou robe"
                    value={formatAnimalCoat(animal)}
                  />
                  <DetailLink
                    label="Lien pedigree"
                    href={animal.pedigree_url}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Collier et suivi</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Couleur de collier initiale"
                    value={animal.collar_color_initial}
                  />
                  <DetailItem
                    label="Couleur de collier actuelle"
                    value={animal.collar_color_current}
                  />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Note de collier
                    </dt>
                    <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                      {animal.collar_color_note || "Non renseigné"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Notes</h2>
                <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                  {animal.notes || "Aucune note renseignée."}
                </p>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Dates techniques</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Création"
                    value={formatAnimalDate(animal.created_at)}
                  />
                  <DetailItem
                    label="Mise à jour"
                    value={formatAnimalDate(animal.updated_at)}
                  />
                </dl>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

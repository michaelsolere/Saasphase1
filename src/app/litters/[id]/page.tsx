import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatAnimalCoat,
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalStatusLabel,
} from "@/features/animals/formatters";
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
  getSpeciesLabel,
} from "@/features/litters/formatters";
import type { LitterOverview } from "@/features/litters/types";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import { launchPreReservationCampaign } from "@/features/reservations/actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type DBLitter = Database["public"]["Tables"]["litters"]["Row"];
type RelatedAnimal = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  | "id"
  | "display_name"
  | "temporary_name"
  | "call_name"
  | "official_name"
  | "sex"
  | "status"
  | "birth_date"
  | "birth_order"
  | "identification_number"
  | "color"
  | "coat_color"
  | "created_at"
>;
type RelatedDocument = Pick<
  Database["public"]["Tables"]["documents"]["Row"],
  | "id"
  | "title"
  | "document_type"
  | "status"
  | "created_at"
  | "updated_at"
  | "sent_at"
  | "received_at"
  | "signed_at"
  | "file_name"
  | "signature_required"
>;
type RelatedReservation = Pick<
  Database["public"]["Views"]["reservation_overview"]["Row"],
  | "id"
  | "contact_id"
  | "contact_display_name"
  | "status"
  | "price_cents"
  | "paid_cents"
  | "currency"
  | "animal_display_name"
  | "reserved_sex_preference"
  | "created_at"
>;
type QualifiedApplication = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  | "id"
  | "contact_id"
  | "desired_sex_preference"
  | "status"
  | "active_rank"
  | "initial_rank"
> & {
  contacts: { display_name: string | null } | null;
};
type RelatedNote = Pick<
  Database["public"]["Tables"]["notes"]["Row"],
  | "id"
  | "title"
  | "body"
  | "note_type"
  | "visibility"
  | "created_at"
  | "created_by"
> & {
  profiles: { display_name: string | null } | null;
};
type RelatedEvent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "title"
  | "description"
  | "event_type"
  | "status"
  | "priority"
  | "planned_at"
  | "planned_date"
  | "actual_at"
  | "created_at"
>;
type LitterSummary = Pick<
  LitterOverview,
  | "id"
  | "litter_group_name"
  | "mother_display_name"
  | "father_display_name"
  | "animal_count"
  | "reservation_count"
>;

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Portée introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cette portée n’existe pas ou vous n’êtes pas autorisé à la consulter.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux portées
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
        Impossible de charger la portée
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux portées
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

function CountItem({ label, value }: { label: string; value: number | null }) {
  return <DetailItem label={label} value={formatLitterCount(value)} />;
}

function formatBirthOrder(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
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

function RelatedAnimalsSection({
  animals,
  hasError,
}: {
  animals: RelatedAnimal[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Animaux liés</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les animaux liés.
        </p>
      ) : !animals || animals.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun animal lié à cette portée.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-background">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Animal
                </th>
                <th scope="col" className="px-4 py-3">
                  Statut
                </th>
                <th scope="col" className="px-4 py-3">
                  Naissance
                </th>
                <th scope="col" className="px-4 py-3">
                  Identification
                </th>
                <th scope="col" className="px-4 py-3">
                  Couleur / robe
                </th>
                <th scope="col" className="px-4 py-3">
                  Détail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {animals.map((animal) => (
                <tr key={animal.id}>
                  <td className="min-w-56 px-4 py-4">
                    <p className="font-semibold text-foreground">
                      {getAnimalDisplayName(animal)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Sexe : {getAnimalSexLabel(animal.sex)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Ordre : {formatBirthOrder(animal.birth_order)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getAnimalStatusLabel(animal.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {formatAnimalDate(animal.birth_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {animal.identification_number || "Non renseignée"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {formatAnimalCoat(animal)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <Link
                      href={`/animals/${animal.id}`}
                      className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                    >
                      Consulter
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RelatedReservationsSection({
  reservations,
  hasError,
}: {
  reservations: RelatedReservation[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Réservations liées</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les réservations liées.
        </p>
      ) : !reservations || reservations.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucune réservation liée à cette portée.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {reservations.map((reservation, index) => {
            const dateText = formatLitterDate(reservation.created_at);

            return (
              <div
                key={reservation.id ?? `${reservation.contact_id}-${index}`}
                className="py-5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {reservation.contact_display_name ??
                          "Contact non renseigné"}
                      </span>
                      <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Préférence :{" "}
                      {getSexPreferenceLabel(
                        reservation.reserved_sex_preference,
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      Animal :{" "}
                      {reservation.animal_display_name ?? "Non attribué"}
                    </p>
                    <p className="text-xs text-muted">
                      Tarif :{" "}
                      {formatPrice(
                        reservation.price_cents,
                        reservation.currency,
                      )}
                      {reservation.paid_cents !== null &&
                      reservation.paid_cents !== undefined &&
                      reservation.paid_cents > 0 ? (
                        <span className="ml-2 font-medium text-emerald-700">
                          (Payé :{" "}
                          {formatPrice(
                            reservation.paid_cents,
                            reservation.currency,
                          )}
                          )
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">Créée le {dateText}</p>
                  </div>
                  {reservation.id ? (
                    <Link
                      href={`/reservations/${reservation.id}`}
                      className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft self-start sm:self-center"
                    >
                      Consulter
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
          Aucun événement lié à cette portée.
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
                  Date utile : {formatLitterDate(getUsefulEventDate(event))}
                </p>
                <p className="text-xs text-muted">
                  Créé le {formatLitterDate(event.created_at)}
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
          Aucune note liée à cette portée.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {notes.map((note) => {
            const authorName =
              note.profiles?.display_name || "Auteur inconnu";

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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{formatLitterDate(note.created_at)}</span>
                    <span aria-hidden="true">•</span>
                    <span>Type : {note.note_type}</span>
                    <span aria-hidden="true">•</span>
                    <span>Visibilité : {note.visibility}</span>
                    <span aria-hidden="true">•</span>
                    <span>Par {authorName}</span>
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
          Aucun document lié à cette portée.
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
                    {usefulDate.label} {formatLitterDate(usefulDate.value)}
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

export default async function LitterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ campaign_status?: string; campaign_count?: string }>;
}) {
  const { id } = await params;
  const { campaign_status, campaign_count } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawLitter, error: readError } = await supabase
    .from("litters")
    .select(
      "id, name, species, breed, status, litter_group_id, mother_id, father_id, mating_date, mating_date_2, estimated_ovulation_date, expected_birth_date, actual_birth_date, pregnancy_confirmed_at, pregnancy_confirmation_method, expected_puppy_count, born_total_count, born_male_count, born_female_count, alive_count, notes, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const litter = rawLitter as DBLitter | null;

  const { data: rawSummary, error: summaryError } = litter
    ? await supabase
        .from("litter_overview")
        .select(
          "id, litter_group_name, mother_display_name, father_display_name, animal_count, reservation_count",
        )
        .eq("id", id)
        .maybeSingle()
    : { data: null, error: null };

  const summary = rawSummary as LitterSummary | null;

  const { data: rawAnimals, error: animalsError } = litter
    ? await supabase
        .from("animals")
        .select(
          "id, display_name, temporary_name, call_name, official_name, sex, status, birth_date, birth_order, identification_number, color, coat_color, created_at",
        )
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("birth_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  const litterAnimals = rawAnimals as RelatedAnimal[] | null;

  const { data: rawReservations, error: reservationsError } = litter
    ? await supabase
        .from("reservation_overview")
        .select(
          "id, contact_id, contact_display_name, status, price_cents, paid_cents, currency, animal_display_name, reserved_sex_preference, created_at",
        )
        .eq("litter_id", id)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterReservations = rawReservations as RelatedReservation[] | null;

  const { data: rawNotes, error: notesError } = litter
    ? await supabase
        .from("notes")
        .select("id, title, body, note_type, visibility, created_at, created_by, profiles!created_by ( display_name )")
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterNotes = rawNotes as RelatedNote[] | null;

  const { data: rawEvents, error: eventsError } = litter
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterEvents = rawEvents as RelatedEvent[] | null;

  const { data: rawDocuments, error: documentsError } = litter
    ? await supabase
        .from("documents")
        .select(
          "id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, file_name, signature_required",
        )
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterDocuments = rawDocuments as RelatedDocument[] | null;

  // Candidatures qualifiées liées à cette portée (pour la campagne de pré-réservation)
  const { data: rawQualifiedApplications, error: qualifiedAppsError } = litter
    ? await supabase
        .from("applications")
        .select(
          "id, contact_id, desired_sex_preference, status, active_rank, initial_rank",
        )
        .eq("organization_id", litter.organization_id)
        .eq("desired_litter_id", id)
        .eq("status", "qualified")
        .is("deleted_at", null)
        .order("active_rank", { ascending: true, nullsFirst: false })
        .order("initial_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  if (qualifiedAppsError) {
    console.error("QUALIFIED_APPS_ERROR_DETAILS:", {
      message: qualifiedAppsError.message,
      details: qualifiedAppsError.details,
      hint: qualifiedAppsError.hint,
      code: qualifiedAppsError.code,
    });
  }

  let qualifiedApplications: QualifiedApplication[] | null = null;

  if (litter && rawQualifiedApplications && rawQualifiedApplications.length > 0) {
    const contactIds = Array.from(
      new Set(
        rawQualifiedApplications
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    if (contactIds.length > 0) {
      const { data: contactsData, error: contactsError } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", litter.organization_id)
        .in("id", contactIds);

      if (contactsError) {
        console.error("QUALIFIED_APPS_CONTACTS_ERROR:", contactsError);
        qualifiedApplications = rawQualifiedApplications.map((app) => ({
          ...app,
          contacts: { display_name: "Contact non chargé" },
        }));
      } else {
        const contactMap = new Map<string, { display_name: string | null }>();
        contactsData?.forEach((c) => {
          contactMap.set(c.id, { display_name: c.display_name });
        });

        qualifiedApplications = rawQualifiedApplications.map((app) => ({
          ...app,
          contacts: app.contact_id ? (contactMap.get(app.contact_id) ?? null) : null,
        }));
      }
    } else {
      qualifiedApplications = rawQualifiedApplications.map((app) => ({
        ...app,
        contacts: null,
      }));
    }
  } else if (rawQualifiedApplications) {
    qualifiedApplications = [];
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href="/litters"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour aux portées
      </Link>

      <div className="mt-8">
        {readError || summaryError ? (
          <ErrorMessage />
        ) : !litter ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Portée
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {getLitterDisplayName(litter.name, litter.id)}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatLitterDate(litter.created_at)}
                </p>
              </div>
            </header>

            {/* Feedback campagne de pré-réservation */}
            {campaign_status === "success" && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                ✓ Campagne lancée avec succès —{" "}
                {campaign_count ?? "0"} pré-réservation(s) créée(s) et demande(s) de paiement envoyée(s).
              </div>
            )}
            {campaign_status === "no_selection" && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature sélectionnée. Cochez au moins une case avant de lancer la campagne.
              </div>
            )}
            {campaign_status === "no_eligible" && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature qualifiée trouvée pour cette portée parmi les sélections.
              </div>
            )}
            {campaign_status === "error" && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors du lancement de la campagne. Aucune modification n&apos;a été appliquée pour les candidatures en erreur.
              </div>
            )}

            <div className="space-y-6 py-8">
              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Informations</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Nom"
                    value={getLitterDisplayName(litter.name, litter.id)}
                  />
                  <DetailItem
                    label="Groupe de portée"
                    value={summary?.litter_group_name ?? null}
                  />
                  <DetailItem
                    label="Espèce"
                    value={getSpeciesLabel(litter.species)}
                  />
                  <DetailItem label="Race" value={litter.breed} />
                  <DetailItem
                    label="Statut"
                    value={getLitterStatusLabel(litter.status)}
                  />
                  <DetailItem
                    label="Mère"
                    value={summary?.mother_display_name ?? null}
                  />
                  <DetailItem
                    label="Père"
                    value={summary?.father_display_name ?? null}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Reproduction et gestation
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Date de saillie principale"
                    value={formatLitterDate(litter.mating_date)}
                  />
                  <DetailItem
                    label="Deuxième date de saillie"
                    value={formatLitterDate(litter.mating_date_2)}
                  />
                  <DetailItem
                    label="Ovulation estimée"
                    value={formatLitterDate(litter.estimated_ovulation_date)}
                  />
                  <DetailItem
                    label="Confirmation de gestation"
                    value={formatLitterDate(litter.pregnancy_confirmed_at)}
                  />
                  <DetailItem
                    label="Méthode de confirmation"
                    value={litter.pregnancy_confirmation_method}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Naissance et compteurs
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Naissance prévue"
                    value={formatLitterDate(litter.expected_birth_date)}
                  />
                  <DetailItem
                    label="Naissance réelle"
                    value={formatLitterDate(litter.actual_birth_date)}
                  />
                  <CountItem
                    label="Nombre attendu"
                    value={litter.expected_puppy_count}
                  />
                  <CountItem
                    label="Nombre né total"
                    value={litter.born_total_count}
                  />
                  <CountItem label="Mâles" value={litter.born_male_count} />
                  <CountItem label="Femelles" value={litter.born_female_count} />
                  <CountItem label="Vivants" value={litter.alive_count} />
                  <CountItem
                    label="Nombre d’animaux"
                    value={summary?.animal_count ?? null}
                  />
                  <CountItem
                    label="Nombre de réservations"
                    value={summary?.reservation_count ?? null}
                  />
                </dl>
              </section>

              <RelatedAnimalsSection
                animals={litterAnimals}
                hasError={Boolean(animalsError)}
              />

              {/* ---- Campagne de pré-réservation ---- */}
              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Campagne de pré-réservation</h2>
                <p className="mt-2 text-sm text-muted">
                  Sélectionnez les candidatures qualifiées pour lesquelles vous souhaitez lancer
                  une demande d&apos;avance sur arrhes (250 €, échéance J+15).
                  Une pré-réservation et une demande de paiement seront créées pour chacune.
                </p>

                {qualifiedAppsError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les candidatures qualifiées.
                  </p>
                ) : !qualifiedApplications || qualifiedApplications.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Aucune candidature qualifiée liée à cette portée.
                  </p>
                ) : (
                  <form action={launchPreReservationCampaign} className="mt-6">
                    <input type="hidden" name="litter_id" value={id} />

                    <fieldset>
                      <legend className="sr-only">Candidatures qualifiées</legend>
                      <div className="divide-y divide-border rounded-xl border bg-background">
                        {qualifiedApplications.map((app) => {
                          const contactName =
                            app.contacts?.display_name ?? "Contact inconnu";
                          const sexPref = getSexPreferenceLabel(
                            app.desired_sex_preference,
                          );
                          const rank = app.active_rank ?? app.initial_rank;

                          return (
                            <label
                              key={app.id}
                              htmlFor={`app-${app.id}`}
                              className="flex cursor-pointer items-start gap-4 px-4 py-4 hover:bg-muted-soft"
                            >
                              <input
                                type="checkbox"
                                id={`app-${app.id}`}
                                name="application_ids[]"
                                value={app.id}
                                defaultChecked
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-sm font-semibold text-foreground">
                                  {contactName}
                                </p>
                                <p className="text-xs text-muted">
                                  Préférence : {sexPref}
                                  {rank ? ` · Rang : ${rank}` : ""}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <div className="mt-5 flex items-center gap-4">
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Lancer la campagne de pré-réservation
                      </button>
                      <p className="text-xs text-muted">
                        Aucun e-mail ne sera envoyé automatiquement.
                      </p>
                    </div>
                  </form>
                )}
              </section>

              <RelatedReservationsSection
                reservations={litterReservations}
                hasError={Boolean(reservationsError)}
              />

              <RelatedDocumentsSection
                documents={litterDocuments}
                hasError={Boolean(documentsError)}
              />

              <RelatedEventsSection
                events={litterEvents}
                hasError={Boolean(eventsError)}
              />

              <RelatedNotesSection
                notes={litterNotes}
                hasError={Boolean(notesError)}
              />

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Notes</h2>
                <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                  {litter.notes || "Aucune note renseignée."}
                </p>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Dates techniques</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Création"
                    value={formatLitterDate(litter.created_at)}
                  />
                  <DetailItem
                    label="Mise à jour"
                    value={formatLitterDate(litter.updated_at)}
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

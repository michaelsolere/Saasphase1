import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { getContactRoleLabel } from "@/features/contacts/formatters";
import { NoteForm } from "@/features/contacts/note-form";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RelatedPayment = {
  id: string;
  amount_cents: number;
  currency: string;
  payment_type: string;
  status: string;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
  reservation_id: string | null;
};

type RelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  signed_at: string | null;
  received_at: string | null;
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

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Contact introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Contact introuvable ou inaccessible.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux candidatures
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
        Impossible de charger le contact
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux candidatures
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

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note_status?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch contact
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select(
      "id, organization_id, display_name, first_name, last_name, email, phone, secondary_phone, address_line1, address_line2, postal_code, city, country, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  // Fetch active roles
  const { data: contactRoles } = contact
    ? await supabase
        .from("contact_roles")
        .select("role")
        .eq("contact_id", contact.id)
        .eq("is_active", true)
        .is("deleted_at", null)
    : { data: null };

  // Fetch applications
  const { data: contactApplications, error: applicationsError } = contact
    ? await supabase
        .from("application_overview")
        .select(
          "id, status, species, breed, desired_sex_preference, submitted_at, created_at, public_form_name, public_form_slug",
        )
        .eq("contact_id", contact.id)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  // Fetch notes
  const contactId = contact?.id;
  const { data: notes, error: notesError } = contactId
    ? await supabase
        .from("notes")
        .select("id, body, created_at, created_by, profiles!created_by ( display_name )")
        .eq("contact_id", contactId)
        .eq("note_type", "internal")
        .eq("visibility", "internal")
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  // Fetch reservations
  const { data: rawReservations, error: reservationsError } = contactId
    ? await supabase
        .from("reservation_overview")
        .select("id, status, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_display_name, reserved_sex_preference, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const contactReservations = rawReservations as ReservationOverview[] | null;

  // Fetch payments
  const { data: rawPayments, error: paymentsError } = contactId
    ? await supabase
        .from("payments")
        .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at, reservation_id")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const contactPayments = rawPayments as RelatedPayment[] | null;

  // Fetch documents
  const { data: rawDocuments, error: documentsError } = contactId
    ? await supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const contactDocuments = rawDocuments as RelatedDocument[] | null;

  // Fetch events
  const { data: rawEvents, error: eventsError } = contactId
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const contactEvents = rawEvents as RelatedEvent[] | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux contacts
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/candidatures"
          className="text-sm font-medium text-accent hover:underline"
        >
          Retour aux candidatures
        </Link>
      </div>

      <div className="mt-8">
        {contactError ? (
          <ErrorMessage />
        ) : !contact ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            {query.note_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La note interne a bien été ajoutée.
              </p>
            ) : null}

            {query.note_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La note n’a pas pu être ajoutée. Réessayez.
              </p>
            ) : null}

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Contact · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {contact.display_name}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatApplicationDate(contact.created_at)}
                </p>
              </div>
              <Link
                href={`/contacts/${contact.id}/applications/new`}
                className="inline-flex w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
              >
                Créer une candidature
              </Link>
            </header>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations personnelles
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem label="Prénom" value={contact.first_name} />
                    <DetailItem label="Nom" value={contact.last_name} />
                    <DetailItem label="Email" value={contact.email} />
                    <DetailItem
                      label="Téléphone principal"
                      value={contact.phone}
                    />
                    <DetailItem
                      label="Téléphone secondaire"
                      value={contact.secondary_phone}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Adresse postale</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Adresse (ligne 1)"
                      value={contact.address_line1}
                    />
                    <DetailItem
                      label="Adresse (ligne 2)"
                      value={contact.address_line2}
                    />
                    <DetailItem label="Code postal" value={contact.postal_code} />
                    <DetailItem label="Ville" value={contact.city} />
                    <DetailItem
                      label="Pays"
                      value={
                        contact.country === "FR" ? "France" : contact.country
                      }
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Candidatures liées
                  </h2>

                  {applicationsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les candidatures liées.
                    </p>
                  ) : contactApplications && contactApplications.length > 0 ? (
                    <div className="divide-y divide-border">
                      {contactApplications.map((app) => {
                        const sourceForm =
                          app.public_form_name ??
                          app.public_form_slug ??
                          "Source non précisée";
                        const dateText = formatApplicationDate(
                          app.submitted_at ?? app.created_at,
                        );

                        return (
                          <div
                            key={app.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {[app.species, app.breed]
                                      .filter(Boolean)
                                      .join(" · ") ||
                                      "Espèce et race non précisées"}
                                  </span>
                                  <span
                                    className={
                                      app.status === "to_review"
                                        ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                                        : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                                    }
                                  >
                                    {getApplicationStatusLabel(app.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Préférence :{" "}
                                  {getSexPreferenceLabel(
                                    app.desired_sex_preference,
                                  )}
                                </p>
                                <p className="text-xs text-muted">
                                  Soumise le {dateText} · Source : {sourceForm}
                                </p>
                              </div>
                              {app.id ? (
                                <Link
                                  href={`/candidatures/${app.id}`}
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
                  ) : (
                    <p className="text-sm text-muted">
                      Aucune candidature liée à ce contact.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Réservations liées
                  </h2>

                  {reservationsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les réservations liées.
                    </p>
                  ) : contactReservations && contactReservations.length > 0 ? (
                    <div className="divide-y divide-border">
                      {contactReservations.map((res) => {
                        const targetLitter =
                          res.litter_name ??
                          res.litter_group_name ??
                          "Portée non précisée";
                        const dateText = formatApplicationDate(res.created_at);

                        return (
                          <div
                            key={res.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {targetLitter}
                                  </span>
                                  <span
                                    className={
                                      res.status === "active" ||
                                      res.status === "confirmed_after_birth" ||
                                      res.status === "animal_assigned"
                                        ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                                        : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                                    }
                                  >
                                    {getReservationStatusLabel(res.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Préférence : {getSexPreferenceLabel(res.reserved_sex_preference)}
                                </p>
                                <p className="text-xs text-muted">
                                  Tarif : {formatPrice(res.price_cents, res.currency)}
                                  {res.paid_cents !== null && res.paid_cents !== undefined && res.paid_cents > 0 ? (
                                    <span className="text-emerald-700 ml-2 font-medium">
                                      (Payé : {formatPrice(res.paid_cents, res.currency)})
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted">
                                  Animal : {res.animal_display_name ?? "Non attribué"}
                                </p>
                                <p className="text-xs text-muted">
                                  Créée le {dateText}
                                </p>
                              </div>
                              {res.id ? (
                                <Link
                                  href={`/reservations/${res.id}`}
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
                  ) : (
                    <p className="text-sm text-muted">
                      Aucune réservation liée à ce contact.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Paiements liés
                  </h2>

                  {paymentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les paiements liés.
                    </p>
                  ) : contactPayments && contactPayments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {contactPayments.map((payment) => {
                        const dateText = formatApplicationDate(
                          payment.paid_at ?? payment.created_at,
                        );

                        return (
                          <div
                            key={payment.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {formatPrice(payment.amount_cents, payment.currency)}
                                  </span>
                                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                    {getPaymentStatusLabel(payment.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Type : {getPaymentTypeLabel(payment.payment_type)}
                                </p>
                                <p className="text-xs text-muted">
                                  Méthode : {getPaymentMethodLabel(payment.payment_method)}
                                </p>
                                <p className="text-xs text-muted">
                                  Date : {dateText}
                                </p>
                                {payment.reservation_id ? (
                                  <p className="text-xs">
                                    <Link
                                      href={`/reservations/${payment.reservation_id}`}
                                      className="font-medium text-accent hover:underline"
                                    >
                                      Réservation liée
                                    </Link>
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted">
                                    Aucune réservation liée
                                  </p>
                                )}
                              </div>
                              <Link
                                href={`/payments/${payment.id}`}
                                className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft self-start sm:self-center"
                              >
                                Consulter
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun paiement lié à ce contact.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : contactDocuments && contactDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {contactDocuments.map((document) => {
                        const usefulDate = getUsefulDocumentDate(document);

                        return (
                          <div
                            key={document.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground text-sm">
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
                                {formatApplicationDate(usefulDate.value)}
                              </p>
                              <p className="text-xs text-muted">
                                Fichier : {document.file_name || "Non renseigné"}
                              </p>
                              <p className="text-xs text-muted">
                                Signature requise :{" "}
                                {getSignatureRequiredLabel(
                                  document.signature_required,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun document lié à ce contact.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Événements liés
                  </h2>

                  {eventsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les événements liés.
                    </p>
                  ) : contactEvents && contactEvents.length > 0 ? (
                    <div className="divide-y divide-border">
                      {contactEvents.map((event) => (
                        <div
                          key={event.id}
                          className="py-5 first:pt-0 last:pb-0"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-semibold text-foreground text-sm">
                                {event.title ||
                                  getEventTypeLabel(event.event_type)}
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
                              Date utile :{" "}
                              {formatApplicationDate(getUsefulEventDate(event))}
                            </p>
                            <p className="text-xs text-muted">
                              Créé le {formatApplicationDate(event.created_at)}
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
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun événement lié à ce contact.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Notes internes</h2>

                  <div className="mt-6 space-y-6">
                    {notesError ? (
                      <p role="alert" className="text-sm text-amber-800">
                        Impossible de charger les notes internes.
                      </p>
                    ) : notes && notes.length > 0 ? (
                      <div className="divide-y divide-border">
                        {notes.map((note) => {
                          const authorName =
                            (
                              note.profiles as
                                | { display_name: string | null }
                                | null
                            )?.display_name || "Auteur inconnu";
                          return (
                            <div
                              key={note.id}
                              className="py-4 first:pt-0 last:pb-0"
                            >
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {note.body}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                                <span>Par {authorName}</span>
                                <span>•</span>
                                <span>
                                  {formatApplicationDate(note.created_at)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">
                        Aucune note interne pour le moment.
                      </p>
                    )}
                  </div>

                  {contact.id ? (
                    <NoteForm contactId={contact.id} />
                  ) : null}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6">
                <h2 className="text-lg font-semibold">Rôles du contact</h2>
                {contactRoles && contactRoles.length > 0 ? (
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {contactRoles.map((cr, idx) => (
                      <li
                        key={idx}
                        className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"
                      >
                        {getContactRoleLabel(cr.role)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 text-sm text-muted">Aucun rôle actif.</p>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import { formatPrice } from "@/features/reservations/formatters";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import { markPaymentAsPaid } from "@/features/payments/actions";
import type { DBPayment } from "@/features/payments/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function formatDate(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  const hasTime = value.includes("T");

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    ...(hasTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
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

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Paiement introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Paiement introuvable ou inaccessible.
      </p>
      <Link
        href="/payments"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux paiements
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
        Impossible de charger le paiement
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/payments"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux paiements
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
          Aucune note liée à ce paiement.
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
                    <span>Créée le {formatDate(note.created_at)}</span>
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

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const paymentMarkStatus = typeof resolvedSearchParams.payment_mark_status === "string" ? resolvedSearchParams.payment_mark_status : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawPayment, error: readError } = await supabase
    .from("payments")
    .select(
      "id, amount_cents, currency, payment_type, status, payment_method, requested_at, due_date, paid_at, refunded_at, external_reference, notes, created_at, updated_at, contact_id, reservation_id",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const payment = rawPayment as DBPayment | null;

  // Fetch documents
  const { data: rawDocuments, error: documentsError } = payment?.id
    ? await supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("payment_id", payment.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const paymentDocuments = rawDocuments as RelatedDocument[] | null;

  const { data: rawNotes, error: notesError } = payment?.id
    ? await supabase
        .from("notes")
        .select(
          "id, title, body, note_type, visibility, created_at, created_by, profiles!created_by(display_name)",
        )
        .eq("payment_id", payment.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const paymentNotes = rawNotes as RelatedNote[] | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/payments"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux paiements
        </Link>
        <span className="select-none text-sm text-muted" aria-hidden="true">
          |
        </span>
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          Contacts
        </Link>
        <span className="select-none text-sm text-muted" aria-hidden="true">
          |
        </span>
        <Link
          href="/reservations"
          className="text-sm font-medium text-accent hover:underline"
        >
          Réservations
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !payment ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            {paymentMarkStatus === "success" && (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le paiement a été marqué comme payé.
              </p>
            )}

            {paymentMarkStatus === "error" && (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le paiement n’a pas pu être mis à jour. Aucune autre donnée n’a été modifiée.
              </p>
            )}

            {paymentMarkStatus === "invalid_state" && (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Action impossible : ce paiement a déjà été traité.
              </p>
            )}

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Paiement · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {formatPrice(payment.amount_cents, payment.currency)}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatDate(payment.created_at)}
                </p>
              </div>
              <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted">
                {getPaymentStatusLabel(payment.status)}
              </span>
            </header>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                {payment.status === "requested" && (
                  <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                    <h2 className="text-xl font-semibold mb-2">
                      Marquer comme payé
                    </h2>
                    <p className="text-xs text-muted mb-6">
                      Cette action marque cette demande de paiement comme réglée. Elle ne modifie pas le montant, le type de paiement, la réservation et ne génère aucun document.
                    </p>

                    <form action={markPaymentAsPaid} className="space-y-4">
                      <input
                        type="hidden"
                        name="payment_id"
                        value={payment.id}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Date de paiement
                          </label>
                          <input
                            name="paid_date"
                            type="date"
                            required
                            defaultValue={new Date().toLocaleDateString("en-CA")}
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Moyen de paiement
                          </label>
                          <select
                            name="payment_method"
                            required
                            defaultValue="bank_transfer"
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          >
                            <option value="bank_transfer">Virement</option>
                            <option value="cash">Espèces</option>
                            <option value="card">Carte bancaire</option>
                            <option value="cheque">Chèque</option>
                            <option value="other">Autre</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                          Note optionnelle
                        </label>
                        <textarea
                          name="notes"
                          rows={3}
                          maxLength={2000}
                          placeholder="Note de paiement facultative..."
                          className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent resize-y"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90"
                        >
                          Marquer le paiement comme payé
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations du paiement
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Montant"
                      value={formatPrice(payment.amount_cents, payment.currency)}
                    />
                    <DetailItem label="Devise" value={payment.currency} />
                    <DetailItem
                      label="Type"
                      value={getPaymentTypeLabel(payment.payment_type)}
                    />
                    <DetailItem
                      label="Statut"
                      value={getPaymentStatusLabel(payment.status)}
                    />
                    <DetailItem
                      label="Méthode"
                      value={getPaymentMethodLabel(payment.payment_method)}
                    />
                    <DetailItem
                      label="Référence externe"
                      value={payment.external_reference}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Dates</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Date de demande"
                      value={formatDate(payment.requested_at)}
                    />
                    <DetailItem
                      label="Échéance"
                      value={formatDate(payment.due_date)}
                    />
                    <DetailItem
                      label="Date de paiement"
                      value={formatDate(payment.paid_at)}
                    />
                    <DetailItem
                      label="Date de remboursement"
                      value={formatDate(payment.refunded_at)}
                    />
                    <DetailItem
                      label="Créé le"
                      value={formatDate(payment.created_at)}
                    />
                    <DetailItem
                      label="Dernière mise à jour"
                      value={formatDate(payment.updated_at)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Notes</h2>
                  <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                    {payment.notes || "Aucune note renseignée."}
                  </p>
                </section>

                <RelatedNotesSection
                  notes={paymentNotes}
                  hasError={Boolean(notesError)}
                />

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : paymentDocuments && paymentDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {paymentDocuments.map((document) => {
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
                                {usefulDate.label} {formatDate(usefulDate.value)}
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
                      Aucun document lié à ce paiement.
                    </p>
                  )}
                </section>
              </div>

              <aside className="h-fit space-y-6 rounded-2xl border bg-surface p-6">
                <div>
                  <h2 className="text-lg font-semibold">Contact lié</h2>
                  <div className="mt-4">
                    {payment.contact_id ? (
                      <Link
                        href={`/contacts/${payment.contact_id}`}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la fiche contact
                      </Link>
                    ) : (
                      <p className="text-sm text-muted">
                        Aucun contact lié.
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h2 className="text-lg font-semibold">Réservation liée</h2>
                  <div className="mt-4">
                    {payment.reservation_id ? (
                      <Link
                        href={`/reservations/${payment.reservation_id}`}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la réservation
                      </Link>
                    ) : (
                      <p className="text-sm text-muted">
                        Aucune réservation liée.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

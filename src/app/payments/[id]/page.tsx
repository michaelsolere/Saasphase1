import Link from "next/link";
import { redirect } from "next/navigation";

import { formatPrice } from "@/features/reservations/formatters";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import type { DBPayment } from "@/features/payments/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

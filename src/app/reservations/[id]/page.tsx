import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
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
};

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Réservation introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Réservation introuvable ou inaccessible.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux réservations
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
        Impossible de charger la réservation
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux réservations
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

export default async function ReservationDetailPage({
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

  // Fetch reservation detail from view
  const { data: rawReservation, error: readError } = await supabase
    .from("reservation_overview")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const reservation = rawReservation as ReservationOverview | null;

  // Fetch payments
  const { data: rawPayments, error: paymentsError } = reservation?.id
    ? await supabase
        .from("payments")
        .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at")
        .eq("reservation_id", reservation.id)
        .is("deleted_at", null)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const reservationPayments = rawPayments as RelatedPayment[] | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/reservations"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux réservations
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/candidatures"
          className="text-sm font-medium text-accent hover:underline"
        >
          Candidatures
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          Contacts
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !reservation ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Réservation · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Réservation de {reservation.contact_display_name ?? "Client anonyme"}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatApplicationDate(reservation.created_at)}
                </p>
              </div>
            </header>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations de la réservation
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Statut"
                      value={getReservationStatusLabel(reservation.status)}
                    />
                    <DetailItem
                      label="Préférence de sexe"
                      value={getSexPreferenceLabel(reservation.reserved_sex_preference)}
                    />
                    <DetailItem
                      label="Tarif convenu"
                      value={formatPrice(reservation.price_cents, reservation.currency)}
                    />
                    <DetailItem
                      label="Montant réglé"
                      value={
                        reservation.paid_cents !== null && reservation.paid_cents !== undefined
                          ? formatPrice(reservation.paid_cents, reservation.currency)
                          : "Aucun paiement"
                      }
                    />
                    {reservation.refunded_cents !== null && reservation.refunded_cents !== undefined && reservation.refunded_cents > 0 ? (
                      <DetailItem
                        label="Montant remboursé"
                        value={formatPrice(reservation.refunded_cents, reservation.currency)}
                      />
                    ) : null}
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Attribution et portée</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Portée"
                      value={reservation.litter_name}
                    />
                    <DetailItem
                      label="Groupe de portée"
                      value={reservation.litter_group_name}
                    />
                    <DetailItem
                      label="Animal attribué"
                      value={reservation.animal_display_name}
                    />
                    <DetailItem
                      label="Date d'adoption prévue"
                      value={formatApplicationDate(reservation.adoption_planned_at)}
                    />
                    <DetailItem
                      label="Date d'adoption effective"
                      value={formatApplicationDate(reservation.adoption_completed_at)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Priorité et suivi</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Rang initial"
                      value={reservation.rank_initial !== null ? String(reservation.rank_initial) : null}
                    />
                    <DetailItem
                      label="Rang actif"
                      value={reservation.rank_active !== null ? String(reservation.rank_active) : null}
                    />
                    <DetailItem
                      label="Dernière mise à jour"
                      value={formatApplicationDate(reservation.updated_at)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Paiements liés
                  </h2>

                  {paymentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les paiements liés.
                    </p>
                  ) : reservationPayments && reservationPayments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {reservationPayments.map((payment) => {
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
                      Aucun paiement lié à cette réservation.
                    </p>
                  )}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Client associé</h2>
                  <div className="mt-4">
                    <p className="font-medium text-sm">{reservation.contact_display_name ?? "Client anonyme"}</p>
                    {reservation.contact_id ? (
                      <Link
                        href={`/contacts/${reservation.contact_id}`}
                        className="mt-3 inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la fiche contact
                      </Link>
                    ) : null}
                  </div>
                </div>

                {reservation.application_id ? (
                  <div className="border-t pt-6">
                    <h2 className="text-lg font-semibold">Candidature liée</h2>
                    <div className="mt-4">
                      <Link
                        href={`/candidatures/${reservation.application_id}`}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la candidature
                      </Link>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

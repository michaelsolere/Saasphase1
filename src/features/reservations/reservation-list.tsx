import Link from "next/link";

import { getSexPreferenceLabel } from "@/features/applications/formatters";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";

function formatRankLabel(rank: number | null) {
  return rank ? `#${rank}` : "Non défini";
}

function getPaymentSummary(reservation: ReservationOverview) {
  const paidCents = reservation.paid_cents ?? 0;
  const refundedCents = reservation.refunded_cents ?? 0;
  const priceCents = reservation.price_cents;
  const currency = reservation.currency;

  if (priceCents === null || priceCents === undefined) {
    return {
      primary:
        paidCents > 0
          ? `Payé : ${formatPrice(paidCents, currency)}`
          : "Aucun paiement",
      secondary:
        refundedCents > 0
          ? `Remboursé : ${formatPrice(refundedCents, currency)}`
          : "Solde non déterminé",
      tone: "muted",
    };
  }

  const remainingBalanceCents = priceCents - paidCents + refundedCents;

  if (remainingBalanceCents > 0) {
    return {
      primary:
        paidCents > 0
          ? `Payé : ${formatPrice(paidCents, currency)}`
          : reservation.status === "pre_reservation_requested"
            ? "Paiement demandé"
            : "Aucun paiement",
      secondary: `Reste à régler : ${formatPrice(
        remainingBalanceCents,
        currency,
      )}`,
      tone: "warning",
    };
  }

  if (remainingBalanceCents === 0) {
    return {
      primary: "Soldé",
      secondary:
        paidCents > 0
          ? `Payé : ${formatPrice(paidCents, currency)}`
          : "Aucun paiement attendu",
      tone: "success",
    };
  }

  return {
    primary: `Trop-perçu : ${formatPrice(
      Math.abs(remainingBalanceCents),
      currency,
    )}`,
    secondary:
      refundedCents > 0
        ? `Remboursé : ${formatPrice(refundedCents, currency)}`
        : `Payé : ${formatPrice(paidCents, currency)}`,
    tone: "danger",
  };
}

function getPaymentToneClassName(tone: string) {
  if (tone === "success") {
    return "text-emerald-700";
  }

  if (tone === "warning") {
    return "text-amber-700";
  }

  if (tone === "danger") {
    return "text-rose-700";
  }

  return "text-muted";
}

export function ReservationList({
  reservations,
}: {
  reservations: ReservationOverview[];
}) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <p className="text-lg font-semibold">Aucun parcours adoptant trouvé</p>
        <p className="mt-2 text-sm text-muted">
          Les parcours adoptants apparaîtront ici dès qu’ils correspondront aux critères.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted">
        {reservations.length} parcours adoptant
        {reservations.length > 1 ? "s" : ""} affiché
        {reservations.length > 1 ? "s" : ""}
      </p>
      <div className="overflow-hidden rounded-2xl border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className="border-b bg-background text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-4">Adoptant</th>
                <th className="px-5 py-4">Portée / Groupe</th>
                <th className="px-5 py-4">Préférence</th>
                <th className="px-5 py-4">Statut</th>
                <th className="px-5 py-4">Rang</th>
                <th className="px-5 py-4">Tarif</th>
                <th className="px-5 py-4">Paiements</th>
                <th className="px-5 py-4">Animal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservations.map((res, index) => {
                const targetLitter = res.litter_name || res.litter_group_name || "Non précisée";
                const paymentSummary = getPaymentSummary(res);
                return (
                  <tr key={res.id ?? index}>
                    <td className="px-5 py-5 align-top font-medium">
                      <div className="flex flex-col items-start gap-2">
                        {res.contact_id ? (
                          <Link
                            href={`/contacts/${res.contact_id}`}
                            className="text-accent hover:underline"
                          >
                            {res.contact_display_name ?? "Client anonyme"}
                          </Link>
                        ) : (
                          <span>{res.contact_display_name ?? "Client anonyme"}</span>
                        )}
                        {res.id ? (
                          <Link
                            href={`/reservations/${res.id}`}
                            aria-label={`Ouvrir le parcours adoptant ${
                              res.contact_display_name ?? ""
                            }`}
                            className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                          >
                            Parcours
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      {targetLitter}
                    </td>
                    <td className="px-5 py-5 align-top">
                      {getSexPreferenceLabel(res.reserved_sex_preference)}
                    </td>
                    <td className="px-5 py-5 align-top">
                      <span
                        className={
                          res.status === "active" || res.status === "confirmed_after_birth" || res.status === "animal_assigned"
                            ? "inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white"
                            : "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted"
                        }
                      >
                        {getReservationStatusLabel(res.status)}
                      </span>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div>{formatRankLabel(res.rank_active)}</div>
                      {res.rank_initial && res.rank_initial !== res.rank_active ? (
                        <div className="mt-1 text-xs text-muted">
                          Initial : #{res.rank_initial}
                        </div>
                      ) : res.rank_initial ? (
                        <div className="mt-1 text-xs text-muted">
                          Initial conservé
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-5 align-top">
                      {formatPrice(res.price_cents, res.currency)}
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div
                        className={`font-medium ${getPaymentToneClassName(
                          paymentSummary.tone,
                        )}`}
                      >
                        {paymentSummary.primary}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {paymentSummary.secondary}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top text-muted">
                      {res.animal_display_name ?? "Non attribué"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

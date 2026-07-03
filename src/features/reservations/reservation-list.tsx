import Link from "next/link";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import {
  formatPrice,
  getPreReservationDepositBadgeClassName,
  getPreReservationDepositLabel,
  getPreReservationDepositStateFromStatus,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";

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
          <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
            <thead className="border-b bg-background text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-4">Client</th>
                <th className="px-5 py-4">Portée / Groupe</th>
                <th className="px-5 py-4">Préférence</th>
                <th className="px-5 py-4">Statut</th>
                <th className="px-5 py-4">Paiement 250 €</th>
                <th className="px-5 py-4">Tarif</th>
                <th className="px-5 py-4">Animal</th>
                <th className="px-5 py-4">Date de création</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservations.map((res, index) => {
                const targetLitter = res.litter_name || res.litter_group_name || "Non précisée";
                const preReservationDepositState =
                  getPreReservationDepositStateFromStatus(res.status);
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
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPreReservationDepositBadgeClassName(
                          preReservationDepositState,
                        )}`}
                      >
                        {getPreReservationDepositLabel(
                          preReservationDepositState,
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div>{formatPrice(res.price_cents, res.currency)}</div>
                      {res.paid_cents !== null && res.paid_cents !== undefined && res.paid_cents > 0 ? (
                        <div className="mt-1 text-xs text-emerald-700">
                          Payé : {formatPrice(res.paid_cents, res.currency)}
                        </div>
                      ) : null}
                      {(() => {
                        const priceCents = res.price_cents;
                        const paidCents = res.paid_cents ?? 0;
                        const refundedCents = res.refunded_cents ?? 0;

                        if (priceCents === null) {
                          return (
                            <div className="mt-1 text-xs text-muted/60">
                              Solde non déterminé
                            </div>
                          );
                        }

                        const remainingBalanceCents = priceCents - paidCents + refundedCents;
                        if (remainingBalanceCents > 0) {
                          return (
                            <div className="mt-1 text-xs text-amber-700">
                              Reste à régler : {formatPrice(remainingBalanceCents, res.currency)}
                            </div>
                          );
                        } else if (remainingBalanceCents === 0) {
                          return (
                            <div className="mt-1 text-xs text-emerald-700 font-medium">
                              Soldé
                            </div>
                          );
                        } else {
                          return (
                            <div className="mt-1 text-xs text-rose-700">
                              Trop-perçu : {formatPrice(Math.abs(remainingBalanceCents), res.currency)}
                            </div>
                          );
                        }
                      })()}
                    </td>
                    <td className="px-5 py-5 align-top text-muted">
                      {res.animal_display_name ?? "Non attribué"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-5 align-top text-muted">
                      {formatApplicationDate(res.created_at)}
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

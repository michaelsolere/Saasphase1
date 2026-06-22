import Link from "next/link";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";

export function ReservationList({
  reservations,
}: {
  reservations: ReservationOverview[];
}) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <p className="text-lg font-semibold">Aucune réservation trouvée</p>
        <p className="mt-2 text-sm text-muted">
          Les réservations apparaîtront ici dès qu’elles seront créées en base de données.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="border-b bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-4">Client</th>
              <th className="px-5 py-4">Portée / Groupe</th>
              <th className="px-5 py-4">Préférence</th>
              <th className="px-5 py-4">Statut</th>
              <th className="px-5 py-4">Tarif</th>
              <th className="px-5 py-4">Animal</th>
              <th className="px-5 py-4">Date de création</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reservations.map((res, index) => {
              const targetLitter = res.litter_name || res.litter_group_name || "Non précisée";
              return (
                <tr key={res.id ?? index}>
                  <td className="px-5 py-5 align-top font-medium">
                    {res.contact_id ? (
                      <Link
                        href={`/contacts/${res.contact_id}`}
                        className="text-accent hover:underline"
                      >
                        {res.contact_display_name ?? "Client anonyme"}
                      </Link>
                    ) : (
                      res.contact_display_name ?? "Client anonyme"
                    )}
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
                    <div>{formatPrice(res.price_cents, res.currency)}</div>
                    {res.paid_cents !== null && res.paid_cents !== undefined && res.paid_cents > 0 ? (
                      <div className="mt-1 text-xs text-emerald-700">
                        Payé : {formatPrice(res.paid_cents, res.currency)}
                      </div>
                    ) : null}
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
  );
}

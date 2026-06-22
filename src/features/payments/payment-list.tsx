import Link from "next/link";

import { formatApplicationDate } from "@/features/applications/formatters";
import { formatPrice } from "@/features/reservations/formatters";

import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "./formatters";
import type { DBPayment } from "./types";

function StatusBadge({ status }: { status: string }) {
  const label = getPaymentStatusLabel(status);
  
  let colorClasses = "border text-muted bg-surface";
  if (status === "paid") {
    colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  } else if (
    status === "pending" ||
    status === "partially_paid" ||
    status === "requested"
  ) {
    colorClasses = "bg-amber-50 text-amber-700 border-amber-200/60";
  } else if (status === "failed" || status === "cancelled" || status === "disputed") {
    colorClasses = "bg-rose-50 text-rose-700 border-rose-200/60";
  } else if (status === "refunded" || status === "partially_refunded") {
    colorClasses = "bg-blue-50 text-blue-700 border-blue-200/60";
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}>
      {label}
    </span>
  );
}

export function PaymentList({ payments }: { payments: DBPayment[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-sm text-muted">Aucun paiement trouvé.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface">
      <table className="w-full border-collapse text-left text-sm text-foreground">
        <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-6 py-4">Montant</th>
            <th scope="col" className="px-6 py-4">Statut</th>
            <th scope="col" className="px-6 py-4">Type</th>
            <th scope="col" className="px-6 py-4">Méthode</th>
            <th scope="col" className="px-6 py-4">Date</th>
            <th scope="col" className="px-6 py-4">Contact</th>
            <th scope="col" className="px-6 py-4">Réservation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payments.map((payment) => {
            const dateValue = payment.paid_at || payment.created_at;

            return (
              <tr key={payment.id} className="hover:bg-muted-soft/40 transition-colors">
                <td className="whitespace-nowrap px-6 py-4 font-semibold text-foreground">
                  {formatPrice(payment.amount_cents, payment.currency)}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <StatusBadge status={payment.status} />
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {getPaymentTypeLabel(payment.payment_type)}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {getPaymentMethodLabel(payment.payment_method)}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {formatApplicationDate(dateValue)}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Link
                    href={`/contacts/${payment.contact_id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    Contact lié
                  </Link>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {payment.reservation_id ? (
                    <Link
                      href={`/reservations/${payment.reservation_id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      Réservation liée
                    </Link>
                  ) : (
                    <span className="text-muted/60">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

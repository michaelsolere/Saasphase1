"use client";

import React, { useState } from "react";
import { createReservationRefund } from "@/features/payments/actions";

function formatDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function ReservationRefundForm({
  reservationId,
  remainingBalanceCents,
}: {
  reservationId: string;
  remainingBalanceCents: number;
}) {
  const [amount, setAmount] = useState("");

  const handleFillOverpayment = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (remainingBalanceCents < 0) {
      setAmount((Math.abs(remainingBalanceCents) / 100).toFixed(2));
    }
  };

  const isOverpaid = remainingBalanceCents < 0;
  const absBalanceEuros = (Math.abs(remainingBalanceCents) / 100).toFixed(2);

  return (
    <form action={createReservationRefund} className="space-y-4">
      <input type="hidden" name="reservation_id" value={reservationId} />

      {/* Avertissement/Aide selon le solde */}
      {isOverpaid ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-950">
          <p className="font-semibold mb-1">Trop-perçu détecté</p>
          <p className="text-xs leading-relaxed text-blue-900">
            Cette réservation présente un trop-perçu de <span className="font-bold">{Number(absBalanceEuros).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>. Vous pouvez enregistrer ce remboursement pour solder la réservation.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          <p className="font-semibold mb-1">Attention</p>
          <p className="text-xs leading-relaxed text-amber-900">
            Vous vous apprêtez à enregistrer un remboursement manuel sur une réservation qui n’est pas en trop-perçu. Cela augmentera le reste à régler.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted block">
              Montant (en €)
            </label>
            {isOverpaid && (
              <button
                type="button"
                onClick={handleFillOverpayment}
                className="text-xs font-semibold text-accent hover:underline focus:outline-none"
              >
                Remplir avec le trop-perçu
              </button>
            )}
          </div>
          <input
            name="amount"
            type="text"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ex: 150 ou 150.50"
            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
          />
          {isOverpaid && (
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              Le champ montant sera rempli avec la valeur du trop-perçu. Aucun remboursement n’est créé automatiquement.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
            Moyen de remboursement
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

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
            Date du remboursement
          </label>
          <input
            name="payment_date"
            type="date"
            required
            defaultValue={formatDateInputValue(new Date().toISOString())}
            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
          Note (optionnelle)
        </label>
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="Commentaire interne sur ce remboursement..."
          className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent resize-y"
        />
      </div>

      <button
        type="submit"
        className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Enregistrer le remboursement
      </button>
    </form>
  );
}

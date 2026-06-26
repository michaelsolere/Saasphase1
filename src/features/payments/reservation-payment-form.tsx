"use client";

import React, { useState } from "react";
import { createReservationPayment } from "@/features/payments/actions";

function formatDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function ReservationPaymentForm({
  reservationId,
  remainingBalanceCents,
}: {
  reservationId: string;
  remainingBalanceCents: number;
}) {
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("arrhes");

  const handleFillBalance = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (remainingBalanceCents > 0) {
      setAmount((remainingBalanceCents / 100).toFixed(2));
      setPaymentType("balance");
    }
  };

  return (
    <form action={createReservationPayment} className="space-y-4">
      <input type="hidden" name="reservation_id" value={reservationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted block">
              Montant (en €)
            </label>
            {remainingBalanceCents > 0 && (
              <button
                type="button"
                onClick={handleFillBalance}
                className="text-xs font-semibold text-accent hover:underline focus:outline-none"
              >
                Remplir avec le reste à régler
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
          {remainingBalanceCents > 0 && (
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              Le champ montant sera rempli avec le solde actuel. Aucun paiement n’est créé automatiquement.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
            Type de paiement
          </label>
          <select
            name="payment_type"
            required
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
          >
            <option value="arrhes">Arrhes</option>
            <option value="balance">Solde</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
            Statut
          </label>
          <select
            name="status"
            required
            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
          >
            <option value="paid">Payé</option>
            <option value="requested">Demandé</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
            Moyen de paiement
          </label>
          <select
            name="payment_method"
            required
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
            Date
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
          placeholder="Commentaire interne sur ce paiement..."
          className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent resize-y"
        />
      </div>

      <button
        type="submit"
        className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Enregistrer le paiement
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";

import {
  formatEuroPreview,
  previewEuroAmountCents,
} from "@/features/payments/payment-settings-parse";

function DepositField({
  id,
  label,
  name,
  hint,
  value,
  onChange,
  disabled,
  currency,
}: {
  id: string;
  label: string;
  name: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  currency: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <p className="mt-1 text-sm leading-6 text-muted">{hint}</p>
      <div className="mt-2 flex rounded-xl border bg-background focus-within:border-accent">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="flex items-center border-l px-3 text-sm font-medium text-muted">
          {currency}
        </span>
      </div>
    </div>
  );
}

export function DepositSettingsFields({
  defaultPreReservationEuros,
  defaultComplementEuros,
  currency,
  disabled,
}: {
  defaultPreReservationEuros: string;
  defaultComplementEuros: string;
  currency: string;
  disabled: boolean;
}) {
  const [preReservationEuros, setPreReservationEuros] = useState(
    defaultPreReservationEuros,
  );
  const [complementEuros, setComplementEuros] = useState(defaultComplementEuros);

  const preReservationCents = previewEuroAmountCents(preReservationEuros);
  const complementCents = previewEuroAmountCents(complementEuros);
  const totalCents =
    preReservationCents !== null &&
    complementCents !== null &&
    preReservationCents > 0 &&
    complementCents > 0
      ? preReservationCents + complementCents
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Pré-réservation et arrhes
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Le premier versement est une pré-réservation remboursable selon les
          conditions du parcours. Après le paiement du complément, les deux
          versements constituent le total des arrhes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DepositField
          id="default_pre_reservation_deposit_euros"
          label="Premier versement — pré-réservation remboursable"
          name="default_pre_reservation_deposit_euros"
          hint="Montant demandé en premier, remboursable selon les conditions du parcours."
          value={preReservationEuros}
          onChange={setPreReservationEuros}
          disabled={disabled}
          currency={currency}
        />
        <DepositField
          id="default_arrhes_second_payment_euros"
          label="Deuxième versement — complément à la réservation"
          name="default_arrhes_second_payment_euros"
          hint="Complément demandé ensuite pour constituer les arrhes complètes."
          value={complementEuros}
          onChange={setComplementEuros}
          disabled={disabled}
          currency={currency}
        />
      </div>

      <div
        className="rounded-xl border bg-background px-4 py-4"
        data-testid="deposit-total-preview"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Total des arrhes complètes
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {formatEuroPreview(totalCents, currency)}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {preReservationCents !== null &&
          complementCents !== null &&
          totalCents !== null
            ? `${formatEuroPreview(preReservationCents, currency)} + ${formatEuroPreview(complementCents, currency)} = ${formatEuroPreview(totalCents, currency)}`
            : "Saisissez deux montants valides et strictement positifs pour voir le total."}
        </p>
      </div>
    </div>
  );
}

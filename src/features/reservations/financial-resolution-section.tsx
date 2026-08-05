"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  recordAdopterFinancialResolution,
  type FinancialResolutionActionState,
} from "@/features/reservations/actions";
import {
  getFinancialResolutionLabel,
  getFinancialResolutionTone,
} from "@/features/reservations/financial-resolution-core";

export type FinancialResolutionEventSummary = {
  id: string;
  event_type: string;
  financial_resolution: string;
  previous_financial_resolution: string | null;
  paid_cents: number;
  refunded_cents: number;
  refundable_cents: number;
  retained_cents: number;
  reason: string | null;
  refund_payment_id: string | null;
  voided_payment_id: string | null;
  actor_role: string;
  occurred_at: string;
  profiles: { display_name: string | null } | null;
};

export type CorrectableRefundSummary = {
  id: string;
  amount_cents: number;
  paid_at: string | null;
  payment_method: string | null;
};

const initialState: FinancialResolutionActionState = {
  status: "idle",
  message: "",
};

const resolutionToneClasses = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  attention: "border-orange-200 bg-orange-50 text-orange-950",
} as const;

const eventLabels: Record<string, string> = {
  opened: "Résolution ouverte",
  not_required: "Aucune résolution requise",
  resolved: "Résolution finalisée",
  rectified: "Résolution rectifiée",
  reconciled: "Historique rapproché",
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SubmitButton({ isCorrection }: { isCorrection: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Enregistrement…"
        : isCorrection
          ? "Enregistrer la rectification"
          : "Finaliser la résolution"}
    </Button>
  );
}

export function FinancialResolutionSection({
  reservationId,
  clientCommandId,
  currentResolution,
  expectedEventId,
  paidCents,
  refundedCents,
  currency,
  canResolve,
  events,
  correctableRefunds,
  today,
}: {
  reservationId: string;
  clientCommandId: string;
  currentResolution: string;
  expectedEventId: string | null;
  paidCents: number;
  refundedCents: number;
  currency: string;
  canResolve: boolean;
  events: FinancialResolutionEventSummary[];
  correctableRefunds: CorrectableRefundSummary[];
  today: string;
}) {
  const [state, formAction] = useActionState(
    recordAdopterFinancialResolution,
    initialState,
  );
  const defaultOutcome =
    currentResolution === "pending"
      ? "full_refund"
      : ["full_refund", "partial_refund", "no_refund"].includes(currentResolution)
        ? currentResolution
        : "full_refund";
  const [outcome, setOutcome] = useState(defaultOutcome);
  const [refundAmount, setRefundAmount] = useState(
    currentResolution === "pending"
      ? ((paidCents - refundedCents) / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [voidPaymentId, setVoidPaymentId] = useState("");
  const isCorrection = currentResolution !== "pending";
  const isActionableResolution = [
    "pending",
    "full_refund",
    "partial_refund",
    "no_refund",
  ].includes(currentResolution);
  const refundableCents = Math.max(paidCents - refundedCents, 0);
  const tone = getFinancialResolutionTone(currentResolution);
  const hasRefundToRecord = useMemo(() => {
    const normalized = refundAmount.trim().replace(",", ".");
    return Number(normalized) > 0;
  }, [refundAmount]);


  function handleOutcomeChange(nextOutcome: string) {
    setOutcome(nextOutcome);
    if (nextOutcome === "no_refund") {
      setRefundAmount("");
    } else if (nextOutcome === "partial_refund") {
      setRefundAmount("");
    } else if (nextOutcome === "full_refund" && refundableCents > 0) {
      setRefundAmount((refundableCents / 100).toFixed(2).replace(".", ","));
    }
  }

  return (
    <section id="financial-resolution" className="scroll-mt-24 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Sortie du parcours
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Résolution financière
            </h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${resolutionToneClasses[tone]}`}>
            {getFinancialResolutionLabel(currentResolution)}
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Cette décision explique ce que devient l’argent encaissé après la sortie.
          Aucun virement ni e-mail n’est déclenché par le logiciel.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs font-medium text-muted">Encaissé</dt>
          <dd className="mt-1 text-lg font-semibold text-slate-950">
            {formatMoney(paidCents, currency)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs font-medium text-muted">Déjà remboursé</dt>
          <dd className="mt-1 text-lg font-semibold text-slate-950">
            {formatMoney(refundedCents, currency)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs font-medium text-muted">
            {currentResolution === "pending" ? "Reste à décider" : "Somme conservée"}
          </dt>
          <dd className="mt-1 text-lg font-semibold text-slate-950">
            {formatMoney(refundableCents, currency)}
          </dd>
        </div>
      </dl>

      {currentResolution === "none" ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Aucun montant encaissé ne reste à traiter pour cette sortie.
        </p>
      ) : !canResolve ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Seuls le propriétaire et les administrateurs peuvent finaliser ou rectifier cette décision.
        </p>
      ) : !isActionableResolution ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
          Cette résolution provient d’un état historique non modifiable dans ce lot.
          Son historique reste consultable ci-dessous.
        </p>
      ) : expectedEventId ? (
        <details open={currentResolution === "pending"} className="group rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <summary className="cursor-pointer list-none font-semibold text-slate-950">
            {isCorrection ? "Rectifier la résolution" : "Prendre la décision financière"}
            <span className="ml-2 text-xs font-normal text-muted group-open:hidden">Afficher</span>
          </summary>

          <form action={formAction} className="mt-5 space-y-5">
            <input type="hidden" name="reservation_id" value={reservationId} />
            <input type="hidden" name="client_command_id" value={clientCommandId} />
            <input type="hidden" name="expected_event_id" value={expectedEventId} />

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-900">Décision finale</legend>
              <select
                name="financial_resolution"
                aria-label="Décision finale"
                value={outcome}
                onChange={(event) => handleOutcomeChange(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="full_refund">Remboursement total</option>
                <option value="partial_refund">Remboursement partiel — solde conservé</option>
                <option value="no_refund">Aucun remboursement — somme conservée</option>
              </select>
            </fieldset>

            {outcome !== "no_refund" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-900">
                  <span>Montant remboursé maintenant</span>
                  <input
                    name="refund_amount"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                  />
                </label>
                {hasRefundToRecord ? (
                  <>
                    <label className="space-y-1 text-sm font-medium text-slate-900">
                      <span>Moyen</span>
                      <select name="payment_method" defaultValue="bank_transfer" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                        <option value="bank_transfer">Virement bancaire</option>
                        <option value="card">Carte</option>
                        <option value="cheque">Chèque</option>
                        <option value="cash">Espèces</option>
                        <option value="other">Autre</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-900">
                      <span>Date réelle</span>
                      <input name="paid_at" type="date" max={today} defaultValue={today} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}

            {isCorrection && correctableRefunds.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <label className="space-y-1 text-sm font-semibold text-red-950">
                  <span>Neutraliser une saisie erronée — facultatif</span>
                  <select
                    name="void_refund_payment_id"
                    value={voidPaymentId}
                    onChange={(event) => setVoidPaymentId(event.target.value)}
                    className="h-11 w-full rounded-xl border border-red-200 bg-white px-3 font-normal"
                  >
                    <option value="">Aucune saisie à neutraliser</option>
                    {correctableRefunds.map((refund) => (
                      <option key={refund.id} value={refund.id}>
                        {formatMoney(refund.amount_cents, currency)} — {refund.paid_at ? new Date(refund.paid_at).toLocaleDateString("fr-FR") : "date inconnue"}
                      </option>
                    ))}
                  </select>
                </label>
                {voidPaymentId ? (
                  <label className="flex gap-3 text-sm leading-5 text-red-950">
                    <input type="checkbox" name="void_attestation" value="confirmed" required className="mt-1" />
                    <span>Je confirme qu’aucun remboursement réel correspondant à cette saisie n’a été effectué.</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            <label className="block space-y-1 text-sm font-semibold text-slate-900">
              <span>Motif financier obligatoire</span>
              <textarea
                name="reason"
                required
                maxLength={5000}
                rows={4}
                placeholder="Expliquez le remboursement et, le cas échéant, la somme conservée."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal"
              />
            </label>

            {state.message ? (
              <p className={`rounded-xl border px-3 py-2 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                {state.message}
              </p>
            ) : null}

            <div className="flex justify-end">
              <SubmitButton isCorrection={isCorrection} />
            </div>
          </form>
        </details>
      ) : (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          L’état financier courant est incomplet. Rechargez la page avant d’agir.
        </p>
      )}

      <div className="space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-950">Historique financier de la sortie</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Aucune trace financière enregistrée.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {eventLabels[event.event_type] ?? "Événement financier"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(event.occurred_at)} · {event.profiles?.display_name ?? (event.actor_role === "system" ? "Système" : "Utilisateur indisponible")}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {getFinancialResolutionLabel(event.financial_resolution)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  Remboursé cumulé : {formatMoney(event.refunded_cents, currency)} ·{" "}
                  {event.financial_resolution === "pending"
                    ? `Reste à décider : ${formatMoney(event.refundable_cents, currency)}`
                    : `Somme conservée : ${formatMoney(event.retained_cents, currency)}`}
                </p>
                {event.reason ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{event.reason}</p>
                ) : null}
                {event.voided_payment_id ? (
                  <p className="mt-2 text-xs font-medium text-red-700">Une saisie de remboursement a été neutralisée par cette rectification.</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

"use client";

import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { recordCandidateJourneyPaymentReceipt } from "@/features/applications/actions";
import { formatPrice } from "@/features/reservations/formatters";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Enregistrement…" : "Confirmer l’encaissement"}
    </button>
  );
}

export function CandidatePaymentReceiptDialog({
  applicationId,
  paymentId,
  proposalId,
  expectedAmountCents,
  receivedAmountCents,
  currency,
}: {
  applicationId: string;
  paymentId: string;
  proposalId: string | null;
  expectedAmountCents: number;
  receivedAmountCents: number;
  currency: string;
}) {
  const remainingCents = Math.max(0, expectedAmountCents - receivedAmountCents);
  const defaultAmount = (remainingCents / 100).toFixed(2);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90"
        >
          Enregistrer un encaissement
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Enregistrer le montant réellement reçu</AlertDialogTitle>
          <AlertDialogDescription>
            Le montant attendu restant est de {formatPrice(remainingCents, currency)}.
            Un montant inférieur restera partiel. Le parcours ne s’ouvrira qu’une
            fois le seuil réellement atteint.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={recordCandidateJourneyPaymentReceipt} className="space-y-4">
          <input type="hidden" name="application_id" value={applicationId} />
          <input type="hidden" name="payment_id" value={paymentId} />
          {proposalId ? (
            <input type="hidden" name="proposal_id" value={proposalId} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Montant reçu (€)
              <input
                name="received_amount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={defaultAmount}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-medium">
              Date de réception
              <input
                name="received_date"
                type="date"
                required
                defaultValue={today}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-medium">
              Moyen de paiement
              <select
                name="payment_method"
                required
                defaultValue="bank_transfer"
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
              >
                <option value="bank_transfer">Virement</option>
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="cheque">Chèque</option>
                <option value="paypal">PayPal</option>
                <option value="stripe">Stripe</option>
                <option value="other">Autre</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Référence (facultative)
              <input
                name="reference"
                type="text"
                maxLength={120}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
              />
            </label>
          </div>

          {!proposalId ? (
            <label className="block text-sm font-medium">
              Motif de l’absence de proposition
              <textarea
                name="exception_reason"
                required
                minLength={10}
                maxLength={500}
                rows={3}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
                placeholder="Expliquez pourquoi ce paiement est traité sans proposition préalable."
              />
            </label>
          ) : null}

          <p className="rounded-xl border bg-surface px-4 py-3 text-xs leading-5 text-muted">
            Tout surplus est conservé comme montant non appliqué et reportable. La
            date saisie détermine le rang lorsque le parcours s’ouvre.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <SubmitButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

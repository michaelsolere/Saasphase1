"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { markReservationPaymentAsPaid } from "@/features/payments/actions";

export function PaymentConfirmDialog({
  paymentId,
  reservationId,
  amountLabel,
  typeLabel,
  dueDateLabel,
}: {
  paymentId: string;
  reservationId: string;
  amountLabel: string;
  typeLabel: string;
  dueDateLabel: string | null;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/60 hover:text-emerald-800"
        >
          Marquer payé
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer le paiement reçu</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action marquera ce paiement comme payé aujourd’hui. Elle ne
            modifiera pas le statut de la réservation.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border bg-surface px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">{amountLabel}</p>
          <p className="mt-1 text-xs text-muted">Type : {typeLabel}</p>
          {dueDateLabel ? (
            <p className="mt-1 text-xs text-muted">{dueDateLabel}</p>
          ) : null}
        </div>

        <form action={markReservationPaymentAsPaid}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="payment_id" value={paymentId} />
            <input type="hidden" name="reservation_id" value={reservationId} />
            <AlertDialogAction asChild>
              <button
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              >
                Confirmer le paiement
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

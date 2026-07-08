"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/60 hover:text-emerald-800"
      >
        Marquer payé
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer le paiement reçu</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action marquera ce paiement comme payé aujourd’hui. Pour un
            versement de pré-réservation suffisant, le dossier passera en
            pré-réservation réglée.
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
            <Button type="submit">Confirmer le paiement</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

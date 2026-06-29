"use client";

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
import { Button } from "@/components/ui/button";
import {
  cancelReservation,
  expireReservation,
  withdrawReservation,
} from "@/features/reservations/actions";

type ReservationNegativeAction = "cancel" | "withdraw" | "expire";

const sharedDescription =
  "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.";

const actionCopy: Record<
  ReservationNegativeAction,
  {
    title: string;
    confirmLabel: string;
    defaultTriggerLabel: string;
    action: (formData: FormData) => void | Promise<void>;
  }
> = {
  cancel: {
    title: "Confirmer l’annulation de cette réservation ?",
    confirmLabel: "Confirmer l’annulation",
    defaultTriggerLabel: "Annuler la réservation",
    action: cancelReservation,
  },
  withdraw: {
    title: "Confirmer le désistement ?",
    confirmLabel: "Confirmer le désistement",
    defaultTriggerLabel: "Marquer comme désistée",
    action: withdrawReservation,
  },
  expire: {
    title: "Confirmer l’expiration de cette réservation ?",
    confirmLabel: "Confirmer l’expiration",
    defaultTriggerLabel: "Marquer comme expirée",
    action: expireReservation,
  },
};

export function ReservationNegativeActionConfirmDialog({
  actionType,
  reservationId,
  triggerLabel,
  triggerClassName,
}: {
  actionType: ReservationNegativeAction;
  reservationId: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const copy = actionCopy[actionType];

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" className={triggerClassName}>
          {triggerLabel ?? copy.defaultTriggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{sharedDescription}</AlertDialogDescription>
        </AlertDialogHeader>

        <form action={copy.action}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <Button type="submit">{copy.confirmLabel}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

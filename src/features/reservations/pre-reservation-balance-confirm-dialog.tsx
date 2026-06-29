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
import { requestPreReservationBalance } from "@/features/reservations/actions";

const confirmationText =
  "Créer le complément 2/2 — 250 € ? Cette action crée uniquement une demande de paiement en statut demandé. Elle ne change pas le statut de réservation, n’attribue aucun animal, ne finalise pas l’adoption et n’envoie aucun email.";

export function PreReservationBalanceConfirmDialog({
  reservationId,
  buttonClassName,
  compactLabel = false,
}: {
  reservationId: string;
  buttonClassName?: string;
  compactLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        {compactLabel
          ? "Complément 2/2 — 250 €"
          : "Demander le complément 2/2 — 250 €"}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Créer le complément 2/2 — 250 € ?
          </AlertDialogTitle>
          <AlertDialogDescription>{confirmationText}</AlertDialogDescription>
        </AlertDialogHeader>

        <form action={requestPreReservationBalance}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <Button type="submit">Confirmer la demande</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

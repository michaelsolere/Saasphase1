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
import { adoptReservation } from "@/features/reservations/actions";

const confirmationText =
  "Finaliser l’adoption ? Cette action marque la réservation comme adoptée et l’animal comme adopté. Elle ne crée aucun paiement, document, email, facture ou signature. Vérifiez manuellement que le solde, les documents et la date de départ sont corrects.";

export function AdoptionConfirmDialog({
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
        {compactLabel ? "Finaliser l’adoption" : "Finaliser l’adoption"}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finaliser l’adoption ?</AlertDialogTitle>
          <AlertDialogDescription>{confirmationText}</AlertDialogDescription>
        </AlertDialogHeader>

        <form action={adoptReservation}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <Button type="submit">Confirmer la finalisation</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ReservationFinanceDialogs({
  paymentForm,
  refundForm,
  className,
  containerClassName,
  buttonClassName,
}: {
  paymentForm: ReactNode;
  refundForm: ReactNode;
  className?: string;
  containerClassName?: string;
  buttonClassName?: string;
}) {
  return (
    <div className={containerClassName ?? "mt-8 border-t border-border pt-6"}>
      <div className={className ?? "flex flex-col gap-3 sm:flex-row"}>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" className={buttonClassName ?? "w-full sm:w-auto"}>
              + Enregistrer un encaissement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Enregistrer un encaissement</DialogTitle>
              <DialogDescription>
                Ajoute un paiement manuel lié à cette réservation, sans changer
                son statut et sans générer de document.
              </DialogDescription>
            </DialogHeader>
            {paymentForm}
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className={buttonClassName ?? "w-full sm:w-auto"}>
              + Enregistrer un remboursement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Enregistrer un remboursement</DialogTitle>
              <DialogDescription>
                Ajoute un remboursement manuel lié à cette réservation, sans
                modifier le paiement d’origine ni le statut de la réservation.
              </DialogDescription>
            </DialogHeader>
            {refundForm}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

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

export function ReservationNoteDialog({
  noteForm,
}: {
  noteForm: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="w-full sm:w-auto">
          + Ajouter une note interne
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter une note interne</DialogTitle>
          <DialogDescription>
            Cette note restera interne à l’élevage et ne sera pas envoyée à
            l’adoptant.
          </DialogDescription>
        </DialogHeader>
        {noteForm}
      </DialogContent>
    </Dialog>
  );
}

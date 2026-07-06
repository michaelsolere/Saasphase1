"use client";

import { useFormStatus } from "react-dom";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateApplicationStatus } from "@/features/applications/actions";

function SubmitButton({
  label,
  value,
  className,
}: {
  label: string;
  value: "qualify" | "reject";
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="qualification_action"
      value={value}
      disabled={pending}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {pending ? "Mise à jour..." : label}
    </button>
  );
}

export function ApplicationStatusActionDialog({
  applicationId,
  returnPath,
}: {
  applicationId: string;
  returnPath: string;
}) {
  const reasonId = `${applicationId}-list-status-reason`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-2 inline-flex rounded-lg border border-accent/30 px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent-soft"
        >
          Valider / Refuser
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Statut de la candidature</DialogTitle>
        </DialogHeader>
        <form action={updateApplicationStatus} className="space-y-5">
          <input type="hidden" name="application_id" value={applicationId} />
          <input type="hidden" name="return_path" value={returnPath} />
          <div>
            <Label htmlFor={reasonId}>
              Raison / commentaire interne
            </Label>
            <Textarea
              id={reasonId}
              name="status_reason"
              rows={4}
              maxLength={500}
              placeholder="Note interne optionnelle..."
              className="mt-2 min-h-28 resize-y"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-background"
              >
                Annuler
              </button>
            </DialogClose>
            <SubmitButton
              label="Refuser"
              value="reject"
              className="border border-red-200 text-red-800 hover:bg-red-50"
            />
            <SubmitButton
              label="Valider"
              value="qualify"
              className="bg-accent text-white hover:opacity-90"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

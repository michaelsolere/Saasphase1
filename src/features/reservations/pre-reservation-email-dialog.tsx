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
import { sendPreReservationEmail } from "@/features/reservations/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? "Envoi..." : label}
    </button>
  );
}

export function PreReservationEmailDialog({
  amountLabel,
  deadlineLabel,
  disabled,
  recipientLabel,
  reservationId,
  scopeLabel,
  triggerLabel,
}: {
  amountLabel: string;
  deadlineLabel: string;
  disabled?: boolean;
  recipientLabel: string;
  reservationId: string;
  scopeLabel: string;
  triggerLabel: "Envoyer via Brevo" | "Réessayer l’envoi";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerLabel}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer l’envoi Brevo</AlertDialogTitle>
          <AlertDialogDescription>
            Un véritable e-mail transactionnel sera envoyé au destinataire.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid gap-3 rounded-xl border bg-surface px-4 py-3 text-sm">
          <div>
            <dt className="font-semibold text-foreground">Destinataire</dt>
            <dd className="mt-1 text-muted">{recipientLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Portée ou groupe</dt>
            <dd className="mt-1 text-muted">{scopeLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Montant</dt>
            <dd className="mt-1 text-muted">{amountLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Échéance</dt>
            <dd className="mt-1 text-muted">{deadlineLabel}</dd>
          </div>
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={sendPreReservationEmail}>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <SubmitButton label={triggerLabel} />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

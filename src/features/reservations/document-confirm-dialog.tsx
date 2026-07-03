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
import {
  markDocumentAsSent,
  markDocumentAsSigned,
  markReservationDocumentsAsSent,
  markReservationDocumentsAsSigned,
} from "@/features/documents/actions";

type DocumentConfirmAction = "sent" | "signed";

const actionCopy: Record<
  DocumentConfirmAction,
  {
    buttonLabel: string;
    title: string;
    description: string;
    confirmLabel: string;
    buttonClassName: string;
  }
> = {
  sent: {
    buttonLabel: "Marquer comme envoyé",
    title: "Confirmer l’envoi du document",
    description:
      "Cette action marquera ce document comme envoyé aujourd’hui. Elle n’envoie aucun e-mail et ne génère aucun fichier.",
    confirmLabel: "Confirmer l’envoi",
    buttonClassName:
      "w-full border bg-background text-foreground hover:bg-muted",
  },
  signed: {
    buttonLabel: "Marquer comme reçu signé",
    title: "Confirmer la réception signée",
    description:
      "Cette action marquera ce document comme reçu signé aujourd’hui. Elle ne crée aucune signature électronique et n’importe aucun fichier.",
    confirmLabel: "Confirmer reçu signé",
    buttonClassName:
      "w-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/50 hover:text-emerald-800",
  },
};

const bundledActionCopy: Record<
  DocumentConfirmAction,
  {
    buttonLabel: string;
    title: string;
    description: string;
    confirmLabel: string;
    buttonClassName: string;
  }
> = {
  sent: {
    buttonLabel: "Marquer documents envoyés",
    title: "Confirmer l’envoi des documents de réservation",
    description:
      "Cette action marquera le certificat d’engagement et le contrat de réservation comme envoyés aujourd’hui. Elle n’envoie aucun e-mail et ne génère aucun fichier.",
    confirmLabel: "Confirmer documents envoyés",
    buttonClassName:
      "w-full border bg-background text-foreground hover:bg-muted",
  },
  signed: {
    buttonLabel: "Marquer reçus signés",
    title: "Confirmer la réception signée des documents",
    description:
      "Cette action marquera le certificat d’engagement et le contrat de réservation comme reçus signés aujourd’hui. Elle ne crée aucune signature électronique et n’importe aucun fichier.",
    confirmLabel: "Confirmer reçus signés",
    buttonClassName:
      "w-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/50 hover:text-emerald-800",
  },
};

export function DocumentConfirmDialog({
  actionType,
  documentId,
  reservationId,
  documentLabel,
  statusLabel,
  returnTo,
}: {
  actionType: DocumentConfirmAction;
  documentId: string;
  reservationId: string;
  documentLabel: string;
  statusLabel: string;
  returnTo?: "reservation" | "document";
}) {
  const copy = actionCopy[actionType];
  const action =
    actionType === "sent" ? markDocumentAsSent : markDocumentAsSigned;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={copy.buttonClassName}
        >
          {copy.buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border bg-surface px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">{documentLabel}</p>
          <p className="mt-1 text-xs text-muted">Statut actuel : {statusLabel}</p>
        </div>

        <form action={action}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="document_id" value={documentId} />
            <input type="hidden" name="reservation_id" value={reservationId} />
            {returnTo === "document" ? (
              <input type="hidden" name="return_to" value="document" />
            ) : null}
            <AlertDialogAction asChild>
              <button
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              >
                {copy.confirmLabel}
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReservationDocumentsBundleConfirmDialog({
  actionType,
  reservationId,
  statusSummary,
}: {
  actionType: DocumentConfirmAction;
  reservationId: string;
  statusSummary: string;
}) {
  const copy = bundledActionCopy[actionType];
  const action =
    actionType === "sent"
      ? markReservationDocumentsAsSent
      : markReservationDocumentsAsSigned;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={copy.buttonClassName}
        >
          {copy.buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border bg-surface px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            Documents de réservation
          </p>
          <p className="mt-1 text-xs text-muted">{statusSummary}</p>
        </div>

        <form action={action}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <AlertDialogAction asChild>
              <button
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              >
                {copy.confirmLabel}
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

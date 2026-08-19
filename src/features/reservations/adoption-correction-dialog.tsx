"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

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
import { Textarea } from "@/components/ui/textarea";
import { departureDateTimeInputToIso, isoToParisLocalInput } from "@/features/departures/departure-time-zone";
import { correctAdoptionHandover } from "@/features/reservations/actions";

type CorrectionType = "date" | "reverse";


function SubmitButton({ disabled, correctionType }: {
  disabled: boolean;
  correctionType: CorrectionType;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      variant={correctionType === "reverse" ? "destructive" : "default"}
    >
      {pending
        ? "Vérification…"
        : correctionType === "reverse"
          ? "Demander l’annulation"
          : "Enregistrer la rectification"}
    </Button>
  );
}

export function AdoptionCorrectionDialog({
  reservationId,
  adoptionCompletedAt,
  actorRole,
}: {
  reservationId: string;
  adoptionCompletedAt: string;
  actorRole: string | null;
}) {
  const canCorrect = actorRole === "owner" || actorRole === "admin";
  const [open, setOpen] = useState(false);
  const [correctionType, setCorrectionType] = useState<CorrectionType>("date");
  const [commandId, setCommandId] = useState("");
  const [newAdoptionAt, setNewAdoptionAt] = useState(() =>
    isoToParisLocalInput(adoptionCompletedAt),
  );
  const [reason, setReason] = useState("");
  const newAdoptionAtIso = departureDateTimeInputToIso(newAdoptionAt) ?? "";

  if (!canCorrect) return null;

  function show(type: CorrectionType) {
    setCorrectionType(type);
    setCommandId(crypto.randomUUID());
    setNewAdoptionAt(isoToParisLocalInput(adoptionCompletedAt));
    setReason("");
    setOpen(true);
  }

  const canSubmit =
    reason.trim().length > 0 &&
    (correctionType === "reverse" || Boolean(newAdoptionAtIso));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => show("date")}>
          Rectifier la date
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          onClick={() => show("reverse")}
        >
          Adoption enregistrée par erreur
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {correctionType === "date"
                ? "Rectifier la date réelle ?"
                : "Annuler cette finalisation ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {correctionType === "date"
                ? "L’ancienne date restera dans l’historique. Les questionnaires jamais invités seront réancrés depuis la date corrigée."
                : "Le parcours et l’animal ne reviendront à l’étape précédente que si aucun questionnaire n’a jamais été invité ou utilisé."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form action={correctAdoptionHandover} className="space-y-5">
            <input type="hidden" name="reservation_id" value={reservationId} />
            <input type="hidden" name="client_command_id" value={commandId} />
            <input type="hidden" name="correction_type" value={correctionType} />
            <input
              type="hidden"
              name="expected_adoption_completed_at"
              value={adoptionCompletedAt}
            />
            <input
              type="hidden"
              name="new_adoption_completed_at"
              value={correctionType === "date" ? newAdoptionAtIso : ""}
            />

            {correctionType === "date" ? (
              <label className="block space-y-2 text-sm font-medium">
                <span>Nouvelle date et heure réelles</span>
                <input
                  type="datetime-local"
                  value={newAdoptionAt}
                  onChange={(event) => setNewAdoptionAt(event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
            ) : (
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-950">
                Si le suivi familial a commencé, aucune donnée d’adoption ne sera effacée : un incident interne sera ouvert et les accès concernés seront suspendus.
              </p>
            )}

            <label className="block space-y-2 text-sm font-medium">
              <span>Motif obligatoire</span>
              <Textarea
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={5_000}
                placeholder="Décrivez l’erreur constatée et la correction demandée."
                required
              />
            </label>

            <AlertDialogFooter>
              <AlertDialogCancel type="button">Ne rien modifier</AlertDialogCancel>
              <SubmitButton
                disabled={!canSubmit}
                correctionType={correctionType}
              />
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

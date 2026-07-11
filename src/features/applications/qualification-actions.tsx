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
import { transitions, type QualificationAction } from "./transitions";

const actionLabels: Record<QualificationAction, string> = {
  archive: "Archiver",
  mark_unsuccessful: "Marquer non aboutie",
  qualify: "Valider",
  reactivate: "Réactiver vers À valider",
  reject: "Refuser",
  to_call: "À valider",
};

const actionStyles: Record<QualificationAction, string> = {
  archive: "border text-muted hover:bg-background",
  mark_unsuccessful: "border border-amber-200 text-amber-900 hover:bg-amber-50",
  qualify: "bg-accent text-white hover:opacity-90",
  reactivate: "bg-accent text-white hover:opacity-90",
  reject: "border border-red-200 text-red-800 hover:bg-red-50",
  to_call: "border border-accent/30 text-accent hover:bg-accent-soft",
};

const actionsWithReason = new Set<QualificationAction>([
  "reactivate",
]);

function ActionButton({
  action,
  label,
}: {
  action: QualificationAction;
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${actionStyles[action]}`}
    >
      {pending ? "Mise à jour…" : (label ?? actionLabels[action])}
    </button>
  );
}

function MarkUnsuccessfulDialog({ applicationId }: { applicationId: string }) {
  const reasonId = `${applicationId}-mark-unsuccessful-reason`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${actionStyles.mark_unsuccessful}`}
        >
          {actionLabels.mark_unsuccessful}
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Marquer la candidature comme non aboutie
          </DialogTitle>
        </DialogHeader>
        <form action={updateApplicationStatus} className="space-y-5">
          <input type="hidden" name="application_id" value={applicationId} />
          <input
            type="hidden"
            name="qualification_action"
            value="mark_unsuccessful"
          />
          <div>
            <Label htmlFor={reasonId}>
              Raison / commentaire interne
            </Label>
            <Textarea
              id={reasonId}
              name="status_reason"
              rows={4}
              maxLength={500}
              placeholder="Ex. famille plus disponible, portée non adaptée, sans réponse…"
              className="mt-2 min-h-28 resize-y"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:space-x-0">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-background"
              >
                Annuler
              </button>
            </DialogClose>
            <ActionButton action="mark_unsuccessful" label="Confirmer" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionForm({
  action,
  applicationId,
}: {
  action: QualificationAction;
  applicationId: string;
}) {
  if (action === "mark_unsuccessful") {
    return <MarkUnsuccessfulDialog applicationId={applicationId} />;
  }

  const asksForReason = actionsWithReason.has(action);

  return (
    <form
      action={updateApplicationStatus}
      className={asksForReason ? "w-full min-w-0 space-y-3 sm:max-w-sm" : ""}
    >
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="qualification_action" value={action} />
      {asksForReason ? (
        <div>
          <label
            htmlFor={`${applicationId}-${action}-reason`}
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Raison simple
          </label>
          <textarea
            id={`${applicationId}-${action}-reason`}
            name="status_reason"
            rows={2}
            maxLength={500}
            placeholder="Ex. dossier repris, nouveau contact..."
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      ) : null}
      <ActionButton action={action} />
    </form>
  );
}

export function QualificationActions({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string | null;
}) {
  if (!status) {
    return null;
  }

  const allowedActions = transitions[status] ?? [];

  if (allowedActions.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune action disponible pour ce statut.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:justify-end">
      {allowedActions.map((action) => (
        <ActionForm
          key={action}
          action={action}
          applicationId={applicationId}
        />
      ))}
    </div>
  );
}

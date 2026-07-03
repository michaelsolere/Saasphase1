"use client";

import { useFormStatus } from "react-dom";

import { updateApplicationStatus } from "@/features/applications/actions";
import { transitions, type QualificationAction } from "./transitions";

const actionLabels: Record<QualificationAction, string> = {
  archive: "Archiver",
  mark_unsuccessful: "Marquer non aboutie",
  qualify: "Valider",
  reactivate: "Réactiver vers À valider",
  reject: "Refuser",
  to_call: "À appeler",
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
  "mark_unsuccessful",
  "reactivate",
]);

function ActionButton({ action }: { action: QualificationAction }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${actionStyles[action]}`}
    >
      {pending ? "Mise à jour…" : actionLabels[action]}
    </button>
  );
}

function ActionForm({
  action,
  applicationId,
}: {
  action: QualificationAction;
  applicationId: string;
}) {
  const asksForReason = actionsWithReason.has(action);

  return (
    <form
      action={updateApplicationStatus}
      className={asksForReason ? "min-w-0 flex-1 space-y-3" : ""}
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
            placeholder={
              action === "mark_unsuccessful"
                ? "Ex. famille plus disponible, portée non adaptée..."
                : "Ex. dossier repris, nouveau contact..."
            }
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
    <div className="flex flex-wrap gap-3">
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

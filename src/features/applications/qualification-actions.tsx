"use client";

import { useFormStatus } from "react-dom";

import { updateApplicationStatus } from "@/features/applications/actions";

type ActionName = "archive" | "qualify" | "reject" | "to_call";

const actionLabels: Record<ActionName, string> = {
  archive: "Archiver",
  qualify: "Qualifier",
  reject: "Refuser",
  to_call: "À appeler",
};

const actionStyles: Record<ActionName, string> = {
  archive: "border text-muted hover:bg-background",
  qualify: "bg-accent text-white hover:opacity-90",
  reject: "border border-red-200 text-red-800 hover:bg-red-50",
  to_call: "border border-accent/30 text-accent hover:bg-accent-soft",
};

function ActionButton({ action }: { action: ActionName }) {
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
  action: ActionName;
  applicationId: string;
}) {
  return (
    <form action={updateApplicationStatus}>
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="qualification_action" value={action} />
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
  const isToReview = status === "to_review";
  const canArchive = Boolean(status && status !== "archived");

  if (!isToReview && !canArchive) {
    return (
      <p className="text-sm text-muted">
        Aucune action disponible pour ce statut.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {isToReview ? (
        <>
          <ActionForm action="to_call" applicationId={applicationId} />
          <ActionForm action="qualify" applicationId={applicationId} />
          <ActionForm action="reject" applicationId={applicationId} />
        </>
      ) : null}
      {canArchive ? (
        <ActionForm action="archive" applicationId={applicationId} />
      ) : null}
    </div>
  );
}

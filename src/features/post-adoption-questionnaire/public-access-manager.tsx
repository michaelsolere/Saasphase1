"use client";

import { useActionState, useState } from "react";

import {
  revokePublicQuestionnaireAccessAction,
  rotatePublicQuestionnaireAccessAction,
  type PublicAccessActionState,
} from "./internal-actions";

const initialState: PublicAccessActionState = { status: "idle" };

export function PublicQuestionnaireAccessManager({
  instanceId,
  reservationId,
  hasActiveAccess,
}: {
  instanceId: string;
  reservationId: string;
  hasActiveAccess: boolean;
}) {
  const [rotateState, rotateAction, rotatePending] = useActionState(
    rotatePublicQuestionnaireAccessAction,
    initialState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokePublicQuestionnaireAccessAction,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!rotateState.publicPath) return;
    await navigator.clipboard.writeText(
      new URL(rotateState.publicPath, window.location.origin).toString(),
    );
    setCopied(true);
  }

  return (
    <div className="mt-4 space-y-3">
      {rotateState.message ? (
        <p role={rotateState.status === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${rotateState.status === "error" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          {rotateState.message}
        </p>
      ) : null}
      {rotateState.publicPath ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Lien affiché une seule fois</p>
          <p className="mt-2 break-all font-mono text-xs text-emerald-950">{rotateState.publicPath}</p>
          <button type="button" onClick={copyLink} className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900">{copied ? "Lien copié" : "Copier le lien complet"}</button>
        </div>
      ) : null}
      {revokeState.message ? <p role={revokeState.status === "error" ? "alert" : "status"} className="text-sm text-muted">{revokeState.message}</p> : null}
      <div className="flex flex-wrap gap-3">
        <form action={rotateAction}>
          <input type="hidden" name="instance_id" value={instanceId} />
          <input type="hidden" name="reservation_id" value={reservationId} />
          <button type="submit" disabled={rotatePending} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {rotatePending ? "Création…" : hasActiveAccess ? "Remplacer le lien" : "Créer le lien"}
          </button>
        </form>
        {hasActiveAccess ? (
          <form action={revokeAction}>
            <input type="hidden" name="instance_id" value={instanceId} />
            <input type="hidden" name="reservation_id" value={reservationId} />
            <button type="submit" disabled={revokePending} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-60">{revokePending ? "Révocation…" : "Révoquer le lien"}</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

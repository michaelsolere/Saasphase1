"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  initialReservationPreparationActionState,
} from "@/features/reservations/reservation-preparation-action-core";
import { confirmReservationPreparation } from "@/features/reservations/reservation-preparation-actions";
import {
  buildReservationPreparation,
  buildReservationPreparationKey,
  formatReservationPreparationStateLabel,
  renderBrevoPreviewHtml,
  type ReservationPreparationInput,
} from "@/features/reservations/reservation-preparation-model";

function euros(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function StateCard({ title, state, detail }: { title: string; state: string; detail: string }) {
  const ready = ["complete", "ready_to_send", "sent"].includes(state);
  return <article className={`rounded-2xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p><p className="mt-1 font-semibold">{formatReservationPreparationStateLabel(state)}</p><p className="mt-2 text-sm text-muted">{detail}</p></article>;
}

function DeliveryFeedback({ state }: { state: typeof initialReservationPreparationActionState | Awaited<ReturnType<typeof confirmReservationPreparation>> }) {
  if (state.status === "idle") return null;
  const successful = state.status === "sent";
  const text = successful
    ? state.deliveryStatus === "already_sent" ? "Cet envoi avait déjà été confirmé ; aucun double envoi n’a été produit." : "Les documents ont été transmis via Brevo et la tentative est historisée."
    : state.status === "conflict" ? "Le dossier a changé depuis l’aperçu. Rechargez et contrôlez à nouveau les informations."
      : state.status === "in_progress" ? "Un envoi identique est déjà en cours. Attendez son résultat avant toute reprise."
        : state.status === "uncertain" ? "Brevo a retourné un résultat incertain. Ne renvoyez pas avant d’avoir vérifié la tentative."
          : state.status === "forbidden" ? "Votre rôle ne permet pas cette validation."
            : state.status === "confirmation_required" ? "La confirmation finale explicite est requise."
              : "L’envoi n’a pas abouti. Aucune réussite n’est simulée.";
  return <p role={successful ? "status" : "alert"} className={`rounded-xl border p-4 text-sm font-semibold ${successful ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{text}</p>;
}

export function ReservationPreparationView({ input, returnPath }: { input: ReservationPreparationInput; returnPath: string }) {
  const preparation = useMemo(() => buildReservationPreparation(input), [input]);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(confirmReservationPreparation, initialReservationPreparationActionState);
  const previewHtml = input.template?.htmlContent
    ? renderBrevoPreviewHtml(input.template.htmlContent, input.variables)
    : null;

  return <div className="space-y-7">
    <div className="grid gap-3 md:grid-cols-3">
      <StateCard title="État financier" state={preparation.financial.state} detail={`${euros(preparation.financial.paidCents)} affectés sur ${euros(preparation.financial.targetCents)}.`} />
      <StateCard title="État documentaire" state={preparation.documentary.state} detail={`${preparation.documentary.documents.length}/2 PDF exacts envoyables.`} />
      <StateCard title="État contractuel" state={preparation.contractual.state} detail="Cet état dépend de l’envoi et reste distinct du paiement et des signatures." />
    </div>

    <section id="documents" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">1 · Documents attendus</p><h2 className="mt-2 text-xl font-semibold">Les deux PDF figés</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{(["commitment_certificate", "reservation_contract"] as const).map((type) => { const document = input.documents.find((candidate) => candidate.type === type); const label = type === "commitment_certificate" ? "Certificat d’engagement" : "Contrat de réservation"; return <article key={type} className={`rounded-xl border p-4 ${document?.sendable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="font-semibold">{label}</p><p className="mt-1 text-sm text-muted">{document ? `Version ${document.version} · ${document.status}` : "Document manquant"}</p>{document ? <Link href={`/documents/${document.id}`} target="_blank" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Ouvrir le PDF exact</Link> : null}</article>; })}</div>
      {preparation.documentary.state === "incomplete" ? <Link href={`/reservations/${input.reservationId}?return_to=${encodeURIComponent(returnPath)}#documents`} className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold text-accent">Générer ou corriger les documents</Link> : null}
    </section>

    <section id="arrhes" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">2 · Complément d’arrhes</p><h2 className="mt-2 text-xl font-semibold">Montant et échéance relus</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs uppercase text-muted">Déjà affecté</dt><dd className="mt-1 text-lg font-semibold">{euros(preparation.financial.paidCents)}</dd></div><div><dt className="text-xs uppercase text-muted">Complément</dt><dd className="mt-1 text-lg font-semibold">{euros(preparation.financial.complementCents)}</dd></div><div><dt className="text-xs uppercase text-muted">Échéance</dt><dd className="mt-1 text-lg font-semibold">{preparation.financial.dueDate ?? "Non requise"}</dd></div></dl>
      <p className="mt-4 text-sm text-muted">{preparation.financial.requestState === "not_required" ? "Les arrhes sont déjà complètes : aucun paiement supplémentaire ne sera créé." : preparation.financial.requestState === "will_reuse" ? "La demande compatible existante sera réutilisée." : "La demande de complément sera créée seulement lors de la confirmation finale."}</p>
    </section>

    <section id="brevo" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">3 · Modèle et variables Brevo</p><h2 className="mt-2 text-xl font-semibold">Contenu éditorial conservé dans Brevo</h2>
      <div className="mt-4 rounded-xl border bg-background p-4 text-sm"><p className="font-semibold">{input.template?.providerName ?? input.template?.registryTitle ?? "Modèle indisponible"}</p><p className="mt-1 text-muted">{input.template?.subject ?? "Sujet Brevo indisponible"}</p>{input.template ? <p className="mt-1 text-xs text-muted">Modèle #{input.template.brevoTemplateId}{input.template.modifiedAt ? ` · modifié le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(input.template.modifiedAt))}` : ""}</p> : null}</div>
      <details className="mt-4 rounded-xl border"><summary className="cursor-pointer px-4 py-3 font-semibold">Contrôler toutes les variables</summary><dl className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(input.variables).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold text-muted">{key}</dt><dd className={`mt-1 break-words text-sm ${value ? "" : "text-amber-800"}`}>{value || "(vide)"}</dd></div>)}</dl></details>
    </section>

    <section id="controles" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">4 · Avertissements et exclusions</p><h2 className="mt-2 text-xl font-semibold">Contrôles avant envoi</h2>
      {preparation.blockers.length === 0 ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Aucune exclusion bloquante.</p> : <ul className="mt-4 space-y-2">{preparation.blockers.map((item) => <li key={item.code} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">Exclusion · {item.label}</li>)}</ul>}
      {preparation.warnings.length > 0 ? <ul className="mt-3 space-y-2">{preparation.warnings.map((item) => <li key={item.code} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Avertissement · {item.label}</li>)}</ul> : null}
    </section>

    <section id="apercu" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">5 · Aperçu</p><h2 className="mt-2 text-xl font-semibold">Email personnalisé en lecture seule</h2>
      {previewHtml ? <iframe title="Aperçu du modèle Brevo" sandbox="" srcDoc={previewHtml} className="mt-4 min-h-[420px] w-full rounded-xl border bg-white" /> : <div className="mt-4 rounded-xl border border-dashed bg-background p-8 text-center text-sm text-muted">L’aperçu HTML Brevo n’est pas disponible. Le sujet, les variables et les deux pièces jointes restent contrôlables ci-dessus.</div>}
    </section>

    <section id="recapitulatif" className="rounded-2xl border-2 border-accent/30 bg-accent-soft p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">6 · Récapitulatif et validation finale</p><h2 className="mt-2 text-xl font-semibold">Une confirmation, deux effets explicites</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Destinataire</dt><dd className="mt-1 text-muted">{input.familyName} · {input.recipientEmail ?? "email absent"}</dd></div><div><dt className="font-semibold">Portée</dt><dd className="mt-1 text-muted">{input.litterName ?? "portée absente"}</dd></div><div><dt className="font-semibold">Paiement</dt><dd className="mt-1 text-muted">{preparation.financial.requestState === "not_required" ? "Aucune demande à créer" : `${euros(preparation.financial.complementCents)} à demander avant le ${preparation.financial.dueDate}`}</dd></div><div><dt className="font-semibold">Pièces jointes</dt><dd className="mt-1 text-muted">{preparation.summary.attachments.join(" · ") || "Pièces manquantes"}</dd></div></dl>
      <form action={action} className="mt-6 space-y-4"><input type="hidden" name="reservation_id" value={input.reservationId} /><input type="hidden" name="litter_id" value={input.litterId ?? ""} /><input type="hidden" name="expected_preparation_key" value={buildReservationPreparationKey(input)} /><label className="flex items-start gap-3 rounded-xl border bg-white p-4 text-sm"><input type="checkbox" name="final_confirmation" value="confirmed" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>Je confirme avoir relu le destinataire, le modèle, les variables, le montant, l’échéance et les deux PDF exacts. Je déclenche maintenant l’envoi Brevo.</span></label><button disabled={!preparation.canConfirm || !confirmed || pending} className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600">{pending ? "Validation en cours…" : "Valider et envoyer via Brevo"}</button></form>
      <div className="mt-4"><DeliveryFeedback state={state} /></div>
    </section>
  </div>;
}

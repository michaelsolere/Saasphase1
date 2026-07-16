"use client";
import { useRef, useState } from "react";

export type BirthDocumentsDepositCandidate = {
  id: string; contactName: string; contactEmail: string | null; eligible: boolean; reason: string | null;
  documents: Array<{ documentType: "commitment_certificate" | "reservation_contract"; version: number }>;
  variables: Record<string, string>;
};

export function BirthDocumentsDepositCampaignConfirmDialog({ action, litterId, candidates, template, brevoConfigured }: {
  action: (formData: FormData) => void | Promise<void>; litterId: string; candidates: BirthDocumentsDepositCandidate[];
  template: { title: string; brevoTemplateId: number | null } | null; brevoConfigured: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null); const confirmationRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState<BirthDocumentsDepositCandidate[]>([]);
  const enabled = Boolean(template?.brevoTemplateId && brevoConfigured && candidates.some((c) => c.eligible));
  return <>
    <form ref={formRef} action={action} className="mt-6" onSubmit={(event) => { if (confirmationRef.current?.value === "confirmed") return; event.preventDefault(); const ids = new FormData(event.currentTarget).getAll("reservation_ids[]"); setSelected(candidates.filter((c) => ids.includes(c.id))); setOpen(true); }}>
      <input type="hidden" name="litter_id" value={litterId}/><input ref={confirmationRef} type="hidden" name="campaign_confirmation" value=""/>
      <div className="divide-y divide-border rounded-xl border bg-background">
        {candidates.map((candidate) => <label key={candidate.id} className={`flex items-start gap-4 px-4 py-4 ${candidate.eligible ? "cursor-pointer hover:bg-muted-soft" : "opacity-70"}`}>
          <input type="checkbox" name="reservation_ids[]" value={candidate.id} defaultChecked={candidate.eligible} disabled={!candidate.eligible} className="mt-1"/>
          <div><p className="text-sm font-semibold">{candidate.contactName}</p><p className="text-xs text-muted">{candidate.contactEmail || "Aucun e-mail"}</p>{candidate.reason ? <p className="mt-1 text-xs font-semibold text-amber-800">Inéligible : {candidate.reason}</p> : null}</div>
        </label>)}
      </div>
      <button type="submit" disabled={!enabled} className="mt-5 inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">Préparer le complément et envoyer via Brevo</button>
    </form>
    {open ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"><div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
      <h3 className="text-lg font-semibold">Confirmer Contrat + certificat</h3><p className="mt-2 text-sm text-muted">Une seule confirmation créera ou réutilisera le complément d’arrhes puis déclenchera le modèle Brevo.</p>
      <div className="mt-4 rounded-xl border p-4 text-sm"><p><b>Modèle :</b> {template?.title} (#{template?.brevoTemplateId})</p><p><b>Dossiers :</b> {selected.length}</p></div>
      <p className="mt-4 text-sm font-medium">Les deux PDF exacts affichés seront joints à l’e-mail Brevo.</p>
      <div className="mt-4 space-y-3">{selected.map((candidate) => <details key={candidate.id} className="min-w-0 rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{candidate.contactName} — variables prévisualisées</summary><div className="mt-3 space-y-1 text-sm">{candidate.documents.map((document) => <p key={document.documentType}>{document.documentType === "commitment_certificate" ? "Certificat d’engagement" : "Contrat de réservation"} — version {document.version}</p>)}</div><dl className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2">{Object.entries(candidate.variables).map(([key, value]) => <div key={key} className="min-w-0"><dt className="font-semibold">{key}</dt><dd className="break-words text-muted">{value || "(vide)"}</dd></div>)}</dl></details>)}</div>
      <div className="mt-6 flex gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Annuler</button><button type="button" disabled={selected.length === 0} onClick={() => { if (confirmationRef.current && formRef.current) { confirmationRef.current.value = "confirmed"; formRef.current.requestSubmit(); } }} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:bg-muted">Confirmer l’envoi</button></div>
    </div></div> : null}
  </>;
}

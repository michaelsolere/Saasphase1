"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

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
import type {
  DocumentBatchOutcome,
  DocumentBatchReasonCode,
  LitterReservationDocumentBatchResult,
} from "@/features/documents/litter-reservation-document-batch-core";
import {
  initialLitterReservationDocumentBatchActionState,
  type LitterReservationDocumentBatchActionState,
} from "@/features/litters/litter-reservation-document-batch-action-core";
import { getReservationStatusLabel } from "@/features/reservations/formatters";

const MAX_SELECTION = 30;

type Reservation = {
  id: string;
  contactName: string;
  status: string;
  selectable: boolean;
  disabledReason: string | null;
  commitmentStatus: string;
  contractStatus: string;
};

type Template = { id: string; name: string; version: number };
type SubmittedConfiguration = {
  reservationIds: string[];
  commitmentTemplateId: string;
  contractTemplateId: string;
};

const outcomeLabels: Record<DocumentBatchOutcome["outcome"], string> = {
  created: "Généré",
  existing: "Déjà généré par cette opération",
  already_present: "Déjà présent",
  protected: "Protégé",
  ineligible: "Non éligible",
  missing_data: "Données manquantes",
  invalid_data: "Données invalides",
  invalid_source: "Source invalide",
  incoherent_current_document: "Document incohérent",
  error: "Erreur",
};

const reasonLabels: Record<DocumentBatchReasonCode, string> = {
  invalid_reservation_id: "Le dossier transmis est invalide.",
  reservation_not_found: "Le dossier n’est pas disponible.",
  reservation_ineligible: "Le dossier ne remplit pas les conditions requises.",
  contact_incoherent: "Les informations du contact sont incohérentes.",
  application_incoherent: "Les informations de la candidature sont incohérentes.",
  multiple_current_documents: "Plusieurs documents courants ont été trouvés.",
  current_document_incoherent: "Le document courant est incohérent.",
  paired_prevalidation_failed: "Les deux documents n’ont pas pu être préparés ensemble.",
  incomplete_source_data: "Certaines données nécessaires sont manquantes.",
  missing_template_variables: "Des informations nécessaires au modèle sont manquantes.",
  invalid_template_variable_value: "Une information du modèle est invalide.",
  template_not_found: "Le modèle n’est plus disponible.",
  template_mismatch: "Le modèle ne correspond pas à ce dossier.",
  invalid_template: "La source documentaire est invalide.",
  invalid_template_formatting: "La mise en forme du modèle est invalide.",
  branding_inconsistent: "Les informations de présentation sont incohérentes.",
  branding_mismatch: "Les informations de présentation ne correspondent plus.",
  document_type_mismatch: "Le type de document est incohérent.",
  template_hash_mismatch: "La source documentaire a changé.",
  invalid_snapshot: "Les données préparées sont incohérentes.",
  current_document_conflict: "Un document courant existe déjà.",
  document_id_conflict: "Un conflit documentaire empêche la génération.",
  database_error: "Le dossier n’a pas pu être traité pour le moment.",
  storage_error: "Le PDF n’a pas pu être enregistré.",
  render_error: "Le PDF n’a pas pu être préparé.",
  generation_error: "Le document n’a pas pu être généré.",
};

const countLabels: Array<[
  keyof LitterReservationDocumentBatchResult["counts"],
  string,
]> = [
  ["created", "Générés"],
  ["existing", "Déjà générés par cette opération"],
  ["alreadyPresent", "Déjà présents"],
  ["protected", "Protégés"],
  ["ineligible", "Non éligibles"],
  ["missingData", "Données manquantes"],
  ["invalidData", "Données invalides"],
  ["invalidSource", "Sources invalides"],
  ["incoherent", "Documents incohérents"],
  ["errors", "Erreurs"],
];

function Outcome({ value }: { value: DocumentBatchOutcome }) {
  return (
    <div>
      <p className="font-medium text-foreground">{outcomeLabels[value.outcome]}</p>
      {value.reasonCode ? (
        <p className="mt-1 text-xs text-muted">
          {reasonLabels[value.reasonCode] ?? "Ce dossier n’a pas pu être traité normalement."}
        </p>
      ) : null}
    </div>
  );
}

function PreliminaryState({ state }: { state: LitterReservationDocumentBatchActionState }) {
  if (state.status === "confirmation_required") {
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Une confirmation explicite est requise.</p>;
  }
  if (state.status === "no_selection") {
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sélectionnez au moins un dossier.</p>;
  }
  if (state.status === "invalid_input") {
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Les informations transmises ne permettent pas de lancer la génération.</p>;
  }
  return null;
}

function ResultPanel({
  result,
  reservations,
}: {
  result: LitterReservationDocumentBatchResult;
  reservations: Reservation[];
}) {
  const style =
    result.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : result.status === "partial"
        ? "border-orange-200 bg-orange-50 text-orange-950"
        : "border-rose-200 bg-rose-50 text-rose-950";
  const title =
    result.status === "success"
      ? "Génération terminée"
      : result.status === "partial"
        ? "Génération partiellement terminée"
        : "La génération n’a pas pu être lancée";
  const reservationMap = new Map(reservations.map((reservation) => [reservation.id, reservation]));

  return (
    <section aria-live="polite" className={`rounded-xl border p-5 ${style}`}>
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {countLabels.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-current/15 bg-white/50 p-3">
            <dt className="text-xs">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">{result.counts[key]}</dd>
          </div>
        ))}
      </dl>
      {result.reservations.length > 0 ? (
        <div className="mt-5 space-y-3">
          {result.reservations.map((item) => {
            const reservation = reservationMap.get(item.reservationId);
            return (
              <article key={item.reservationId} className="rounded-lg border border-current/15 bg-white/50 p-4">
                <Link href={`/reservations/${item.reservationId}`} className="font-semibold text-accent hover:underline">
                  {reservation?.contactName ?? "Dossier non disponible"}
                </Link>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted">Certificat d’engagement</dt><dd className="mt-1"><Outcome value={item.commitment} /></dd></div>
                  <div><dt className="text-xs text-muted">Contrat de réservation</dt><dd className="mt-1"><Outcome value={item.contract} /></dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function LitterReservationDocumentBatchPanel({
  litterId,
  action,
  reservations,
  commitmentTemplates,
  contractTemplates,
}: {
  litterId: string;
  action: (
    previousState: LitterReservationDocumentBatchActionState,
    formData: FormData,
  ) => Promise<LitterReservationDocumentBatchActionState>;
  reservations: Reservation[];
  commitmentTemplates: Template[];
  contractTemplates: Template[];
}) {
  const eligibleIds = reservations.filter((reservation) => reservation.selectable).map((reservation) => reservation.id);
  const [selectedIds, setSelectedIds] = useState(eligibleIds.slice(0, MAX_SELECTION));
  const [commitmentTemplateId, setCommitmentTemplateId] = useState(commitmentTemplates[0]?.id ?? "");
  const [contractTemplateId, setContractTemplateId] = useState(contractTemplates[0]?.id ?? "");
  const [submitted, setSubmitted] = useState<SubmittedConfiguration | null>(null);
  const [state, formAction, isPending] = useActionState(
    action,
    initialLitterReservationDocumentBatchActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const locked = state.status === "completed";
  const missingTemplate = commitmentTemplates.length === 0 || contractTemplates.length === 0;
  const limitReached = selectedIds.length >= MAX_SELECTION && eligibleIds.length > MAX_SELECTION;
  const selectedCommitment = commitmentTemplates.find((template) => template.id === commitmentTemplateId);
  const selectedContract = contractTemplates.find((template) => template.id === contractTemplateId);
  const canSubmit = selectedIds.length > 0 && !missingTemplate && !isPending && !locked;

  function toggleReservation(id: string, checked: boolean) {
    if (locked || isPending) return;
    if (checked) {
      if (selectedIds.length >= MAX_SELECTION) return;
      setSelectedIds((current) => [...current, id]);
    } else {
      setSelectedIds((current) => current.filter((candidate) => candidate !== id));
    }
  }

  function confirmSubmission() {
    const configuration = {
      reservationIds: [...selectedIds],
      commitmentTemplateId,
      contractTemplateId,
    };
    setSubmitted(configuration);
    if (confirmationRef.current) confirmationRef.current.value = "confirmed";
    formRef.current?.requestSubmit();
  }

  function replay() {
    if (!submitted || isPending) return;
    if (confirmationRef.current) confirmationRef.current.value = "confirmed";
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm text-muted">
        <p>Cette étape génère les PDF du certificat d’engagement et du contrat de réservation. Elle n’envoie aucun e-mail et ne crée aucun paiement.</p>
        <p>La lecture des états ci-dessous est informative ; le serveur contrôle à nouveau chaque dossier au lancement.</p>
      </div>

      <form ref={formRef} action={formAction} className="space-y-6">
        <input ref={confirmationRef} type="hidden" name="batch_confirmation" defaultValue="" />
        {locked && submitted ? (
          <>
            {submitted.reservationIds.map((id) => <input key={id} type="hidden" name="reservation_ids[]" value={id} />)}
            <input type="hidden" name="commitment_template_id" value={submitted.commitmentTemplateId} />
            <input type="hidden" name="contract_template_id" value={submitted.contractTemplateId} />
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold" aria-live="polite">{selectedIds.length} dossier(s) sélectionné(s) sur 30</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={locked || isPending || eligibleIds.length === 0} onClick={() => setSelectedIds(eligibleIds.slice(0, MAX_SELECTION))}>Sélectionner les dossiers éligibles</Button>
            <Button type="button" variant="outline" size="sm" disabled={locked || isPending || selectedIds.length === 0} onClick={() => setSelectedIds([])}>Tout désélectionner</Button>
          </div>
        </div>
        {limitReached ? <p role="status" className="text-sm text-amber-800">La limite de 30 dossiers est atteinte. Désélectionnez un dossier pour en choisir un autre.</p> : null}

        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wide text-muted"><tr><th className="px-4 py-3" scope="col">Sélection</th><th className="px-4 py-3" scope="col">Dossier</th><th className="px-4 py-3" scope="col">Statut</th><th className="px-4 py-3" scope="col">Certificat courant</th><th className="px-4 py-3" scope="col">Contrat courant</th></tr></thead>
            <tbody className="divide-y divide-border">
              {reservations.map((reservation) => {
                const checked = selectedIds.includes(reservation.id);
                const disabledByLimit = !checked && selectedIds.length >= MAX_SELECTION;
                return (
                  <tr key={reservation.id} className={!reservation.selectable ? "opacity-65" : undefined}>
                    <td className="px-4 py-4"><input aria-label={`Sélectionner ${reservation.contactName}`} type="checkbox" name={locked ? undefined : "reservation_ids[]"} value={reservation.id} checked={checked} disabled={!reservation.selectable || disabledByLimit || locked || isPending} onChange={(event) => toggleReservation(reservation.id, event.target.checked)} /></td>
                    <td className="px-4 py-4"><Link href={`/reservations/${reservation.id}`} className="font-semibold text-accent hover:underline">{reservation.contactName}</Link>{!reservation.selectable && reservation.disabledReason ? <p className="mt-1 text-xs text-muted">{reservation.disabledReason}</p> : null}</td>
                    <td className="px-4 py-4">{getReservationStatusLabel(reservation.status)}</td>
                    <td className="px-4 py-4">{reservation.commitmentStatus}</td>
                    <td className="px-4 py-4">{reservation.contractStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Certificat d’engagement<select name={locked ? undefined : "commitment_template_id"} value={commitmentTemplateId} onChange={(event) => setCommitmentTemplateId(event.target.value)} disabled={locked || isPending || commitmentTemplates.length === 0} required className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm disabled:opacity-60">{commitmentTemplates.length === 0 ? <option value="">Aucun modèle compatible publié</option> : commitmentTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} — version {template.version}</option>)}</select></label>
          <label className="text-sm font-medium">Contrat de réservation<select name={locked ? undefined : "contract_template_id"} value={contractTemplateId} onChange={(event) => setContractTemplateId(event.target.value)} disabled={locked || isPending || contractTemplates.length === 0} required className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm disabled:opacity-60">{contractTemplates.length === 0 ? <option value="">Aucun modèle compatible publié</option> : contractTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} — version {template.version}</option>)}</select></label>
        </div>
        <p className="text-sm text-muted">Pour chaque dossier, le serveur utilisera automatiquement sa variante personnalisée publiée lorsqu’elle existe. Le modèle choisi reste l’origine commune.</p>
        <p className="text-xs text-muted">Une variante publiée invalide sera signalée dans le résultat du dossier, sans fallback silencieux.</p>
        {missingTemplate ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Les deux modèles compatibles publiés sont nécessaires avant de lancer la génération.</p> : null}

        {!locked ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" disabled={!canSubmit}>{isPending ? "Génération en cours…" : "Générer les documents sélectionnés"}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirmer la génération groupée</AlertDialogTitle><AlertDialogDescription>Vérifiez la sélection avant de lancer l’opération.</AlertDialogDescription></AlertDialogHeader>
              <dl className="space-y-2 text-sm"><div><dt className="font-medium">Dossiers</dt><dd>{selectedIds.length}</dd></div><div><dt className="font-medium">Certificat</dt><dd>{selectedCommitment ? `${selectedCommitment.name} — version ${selectedCommitment.version}` : "Non disponible"}</dd></div><div><dt className="font-medium">Contrat</dt><dd>{selectedContract ? `${selectedContract.name} — version ${selectedContract.version}` : "Non disponible"}</dd></div></dl>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted"><li>Le certificat sera traité avant le contrat.</li><li>Aucun e-mail ni paiement ne sera créé.</li><li>Aucune nouvelle version ne sera créée lorsqu’un document courant existe déjà.</li></ul>
              <AlertDialogFooter><AlertDialogCancel type="button">Annuler</AlertDialogCancel><AlertDialogAction asChild><button type="button" disabled={isPending} onClick={confirmSubmission}>Confirmer la génération</button></AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </form>

      <PreliminaryState state={state} />
      {state.status === "completed" ? <ResultPanel result={state.result} reservations={reservations} /> : null}
      {state.status === "completed" ? (
        <div className="flex flex-wrap gap-3">
          {(state.result.status === "partial" || state.result.status === "error") ? <Button type="button" disabled={isPending} onClick={replay}>{isPending ? "Rejeu en cours…" : "Rejouer cette opération"}</Button> : null}
          <Button asChild variant="outline">
            <a
              href={`/litters/${litterId}#generation-documents-groupes`}
              onClick={(event) => {
                event.preventDefault();
                window.history.replaceState(
                  null,
                  "",
                  `/litters/${litterId}#generation-documents-groupes`,
                );
                window.location.reload();
              }}
            >
              Démarrer une nouvelle opération
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
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
import { adoptReservation } from "@/features/reservations/actions";
import {
  evaluateAdoptionHandoverReadiness,
  getAdoptionHandoverAuthorization,
  type AdoptionHandoverBlockerCode,
  type AdoptionHandoverExceptionCode,
} from "@/features/reservations/adoption-handover-core";

const blockerLabels: Record<AdoptionHandoverBlockerCode, string> = {
  reservation_not_ready: "Le dossier n’est plus à l’étape « Chiot attribué ».",
  animal_missing: "Aucun animal n’est attribué à ce dossier.",
  animal_inconsistent: "L’animal attribué n’est plus disponible dans l’état attendu.",
  adoption_date_invalid: "La date réelle de départ est invalide.",
  adoption_in_future: "Une adoption effective ne peut pas être datée dans le futur.",
  adoption_before_birth: "La date de départ ne peut pas précéder la naissance.",
};

const exceptionLabels: Record<AdoptionHandoverExceptionCode, string> = {
  animal_identification_missing: "Le numéro d’identification de l’animal est absent.",
  price_missing: "Le tarif convenu n’est pas renseigné.",
  balance_remaining: "Un solde reste à régler.",
  payment_data_unavailable: "Les paiements ne sont pas disponibles pour vérification.",
  document_data_unavailable: "Les documents ne sont pas disponibles pour vérification.",
  commitment_certificate_missing: "Le certificat d’engagement est absent.",
  commitment_certificate_not_signed: "Le certificat d’engagement n’est pas reçu signé.",
  reservation_contract_missing: "Le contrat de réservation est absent.",
  reservation_contract_not_signed: "Le contrat de réservation n’est pas reçu signé.",
};

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeToIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Finalisation…" : "Confirmer le départ"}
    </Button>
  );
}

export type AdoptionConfirmDialogProps = {
  reservationId: string;
  expectedReservationUpdatedAt: string;
  organizationName: string;
  contactName: string;
  actorRole: string | null;
  animal: {
    id: string;
    name: string;
    birthDate: string | null;
    identificationNumber: string | null;
    isConsistent: boolean;
  } | null;
  defaultAdoptionAt: string;
  priceCents: number | null;
  balanceRemainingCents: number | null;
  balanceLabel: string;
  paymentDataAvailable: boolean;
  documentDataAvailable: boolean;
  commitmentCertificateStatus: string | null;
  reservationContractStatus: string | null;
  buttonClassName?: string;
};

export function AdoptionConfirmDialog({
  reservationId,
  expectedReservationUpdatedAt,
  organizationName,
  contactName,
  actorRole,
  animal,
  defaultAdoptionAt,
  priceCents,
  balanceRemainingCents,
  balanceLabel,
  paymentDataAvailable,
  documentDataAvailable,
  commitmentCertificateStatus,
  reservationContractStatus,
  buttonClassName,
}: AdoptionConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [commandId, setCommandId] = useState("");
  const [adoptionAt, setAdoptionAt] = useState(() =>
    toLocalDateTimeValue(defaultAdoptionAt),
  );
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [exceptionReason, setExceptionReason] = useState("");
  const adoptionAtIso = localDateTimeToIso(adoptionAt);
  const readiness = useMemo(
    () =>
      evaluateAdoptionHandoverReadiness({
        reservationStatus: "animal_assigned",
        adoptionAt: adoptionAtIso,
        now: new Date().toISOString(),
        animal: animal
          ? {
              id: animal.id,
              birthDate: animal.birthDate,
              identificationNumber: animal.identificationNumber,
              isConsistent: animal.isConsistent,
            }
          : null,
        priceCents,
        balanceRemainingCents,
        paymentDataAvailable,
        documents: {
          dataAvailable: documentDataAvailable,
          commitmentCertificateStatus,
          reservationContractStatus,
        },
      }),
    [
      adoptionAtIso,
      animal,
      balanceRemainingCents,
      commitmentCertificateStatus,
      documentDataAvailable,
      paymentDataAvailable,
      priceCents,
      reservationContractStatus,
    ],
  );
  const authorization = getAdoptionHandoverAuthorization({
    role: actorRole,
    readiness,
  });
  const allExceptionsAcknowledged = readiness.exceptionCodes.every((code) =>
    acknowledged.has(code),
  );
  const canSubmit =
    authorization.allowed &&
    readiness.blockerCodes.length === 0 &&
    (!authorization.requiresJustification ||
      (allExceptionsAcknowledged && exceptionReason.trim().length > 0));

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setCommandId(crypto.randomUUID());
      setAdoptionAt(toLocalDateTimeValue(defaultAdoptionAt));
      setAcknowledged(new Set());
      setExceptionReason("");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <Button
        type="button"
        onClick={() => changeOpen(true)}
        className={buttonClassName}
      >
        Finaliser l’adoption
      </Button>
      <AlertDialogContent
        className="h-[min(90vh,760px)] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
        data-testid="adoption-handover-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer le départ réel</AlertDialogTitle>
          <AlertDialogDescription>
            Le parcours, l’animal, le rôle adoptant et l’historique seront enregistrés ensemble. Aucun paiement, document ou email ne sera créé.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          action={adoptReservation}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            <input type="hidden" name="reservation_id" value={reservationId} />
            <input type="hidden" name="client_command_id" value={commandId} />
            <input
              type="hidden"
              name="expected_reservation_updated_at"
              value={expectedReservationUpdatedAt}
            />
            <input
              type="hidden"
              name="adoption_completed_at"
              value={adoptionAtIso}
            />

          <dl className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Élevage</dt>
              <dd className="mt-1 font-medium">{organizationName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Famille</dt>
              <dd className="mt-1 font-medium">{contactName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Animal</dt>
              <dd className="mt-1 font-medium">{animal?.name ?? "Non attribué"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situation financière</dt>
              <dd className="mt-1 font-medium">{balanceLabel}</dd>
            </div>
          </dl>

          <label className="block space-y-2 text-sm font-medium">
            <span>Date et heure réelles du départ</span>
            <input
              type="datetime-local"
              value={adoptionAt}
              onChange={(event) => setAdoptionAt(event.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2"
              required
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Une date passée est acceptée pour refléter le départ réel. Une date future est refusée.
            </p>
          </label>

          {readiness.blockerCodes.length > 0 ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
              <p className="font-semibold">La finalisation est impossible :</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {readiness.blockerCodes.map((code) => (
                  <li key={code}>{blockerLabels[code]}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {readiness.exceptionCodes.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">Exceptions sensibles à accepter</p>
              <div className="mt-3 space-y-3">
                {readiness.exceptionCodes.map((code) => (
                  <label key={code} className="flex items-start gap-3 leading-5">
                    <input
                      type="checkbox"
                      name="acknowledged_exception_code"
                      value={code}
                      checked={acknowledged.has(code)}
                      onChange={(event) => {
                        const next = new Set(acknowledged);
                        if (event.target.checked) next.add(code);
                        else next.delete(code);
                        setAcknowledged(next);
                      }}
                      className="mt-1 size-4 rounded border-amber-400"
                    />
                    <span>{exceptionLabels[code]}</span>
                  </label>
                ))}
              </div>
              {authorization.allowed ? (
                <label className="mt-4 block space-y-2 font-medium">
                  <span>Justification de la décision</span>
                  <Textarea
                    name="exception_reason"
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                    maxLength={5_000}
                    placeholder="Exemple : virement confirmé par la famille, contrôle prévu demain."
                    required
                  />
                </label>
              ) : (
                <p className="mt-4 font-medium">
                  Un propriétaire ou administrateur doit confirmer ce départ incomplet.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              Les contrôles visibles sont complets. La décision restera attribuée et historisée.
            </p>
          )}

          </div>

          <AlertDialogFooter className="shrink-0 border-t pt-4">
            <AlertDialogCancel type="button">Revenir au dossier</AlertDialogCancel>
            <SubmitButton disabled={!canSubmit} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

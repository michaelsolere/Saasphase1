"use client";

import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createDirectCandidateReservationAfterBirth,
  prepareCandidatePreReservationProposal,
  resolveUncertainCandidateProposalAsNotSent,
  sendCandidatePreReservationProposal,
} from "@/features/applications/actions";
import { formatPrice } from "@/features/reservations/formatters";

export type CandidatePreReservationProposal = {
  id: string;
  version: number;
  status: string;
  recipient_email: string;
  recipient_name: string | null;
  expected_amount_cents: number;
  complete_deposit_cents: number;
  currency: string;
  due_date: string;
  target_litter_id: string | null;
  target_litter_group_id: string | null;
  variables_snapshot: Record<string, unknown>;
  stale_reason: string | null;
  prepared_at: string;
  sent_at: string | null;
  payment_id: string | null;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(value),
  );
}

export function CandidatePreReservationProposalPanel({
  applicationId,
  applicationStatus,
  proposal,
  targetIsBorn,
  hasStartedJourney,
  targetLabel,
}: {
  applicationId: string;
  applicationStatus: string | null;
  proposal: CandidatePreReservationProposal | null;
  targetIsBorn: boolean;
  hasStartedJourney: boolean;
  targetLabel: string | null;
}) {
  const canPrepare =
    applicationStatus === "qualified" &&
    !targetIsBorn &&
    !hasStartedJourney &&
    (!proposal || ["stale", "cancelled", "expired", "failed"].includes(proposal.status));
  const canCreateDirectReservation =
    applicationStatus === "qualified" && targetIsBorn && !hasStartedJourney;

  return (
    <section id="proposition-pre-reservation" className="border-b py-6">
      <h2 className="font-semibold">Proposition de pré-réservation</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        {targetIsBorn
          ? "Après la naissance, la famille entre par une réservation directe. Le parcours s’ouvre seulement après réception des arrhes totales."
          : "La préparation fige le destinataire et les variables pour contrôle. Elle n’envoie aucun email et n’ouvre aucun parcours."}
      </p>

      {proposal ? (
        <div className="mt-5 rounded-2xl border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Préparation n°{proposal.version}</p>
            <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted">
              {proposal.status === "ready"
                ? "Prête à envoyer"
                : proposal.status === "sending"
                  ? "Envoi en cours ou à vérifier"
                  : proposal.status === "uncertain"
                    ? "Envoi à réconcilier"
                  : proposal.status === "sent"
                    ? "Envoyée"
                    : "À préparer de nouveau"}
            </span>
          </div>

          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Destinataire</dt>
              <dd className="mt-1 break-all">{proposal.recipient_email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Nom</dt>
              <dd className="mt-1">{proposal.recipient_name || "Non renseigné"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Premier versement attendu</dt>
              <dd className="mt-1">{formatPrice(proposal.expected_amount_cents, proposal.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Arrhes totales</dt>
              <dd className="mt-1">{formatPrice(proposal.complete_deposit_cents, proposal.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Échéance proposée</dt>
              <dd className="mt-1">{formatDate(proposal.due_date)}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-muted">Cible</dt>
              <dd className="mt-1 text-base font-normal normal-case text-foreground">
                {targetLabel ?? "—"}
              </dd>
            </div>
          </dl>

          {proposal.status === "stale" && proposal.stale_reason ? (
            <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Cette préparation est obsolète : {proposal.stale_reason}. Préparez
              une nouvelle version après vérification.
            </p>
          ) : null}

          {proposal.status === "ready" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Relire et envoyer
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Envoyer cette proposition ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Vérifiez le destinataire {proposal.recipient_email}, le
                    premier versement de {formatPrice(proposal.expected_amount_cents, proposal.currency)}
                    et l’échéance du {formatDate(proposal.due_date)}. Les
                    conditions seront relues côté serveur juste avant Brevo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Revenir au contrôle</AlertDialogCancel>
                  <form action={sendCandidatePreReservationProposal}>
                    <input type="hidden" name="application_id" value={applicationId} />
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <SubmitButton label="Confirmer l’envoi" pendingLabel="Envoi…" />
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}

          {proposal.status === "sending" ? (
            <form action={sendCandidatePreReservationProposal} className="mt-5">
              <input type="hidden" name="application_id" value={applicationId} />
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <SubmitButton
                label="Vérifier l’état de l’envoi"
                pendingLabel="Vérification…"
              />
            </form>
          ) : null}

          {proposal.status === "uncertain" ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">Envoi à réconcilier manuellement</p>
              <p className="mt-1 leading-6">
                Vérifiez dans Brevo que le message n’a pas été envoyé. Seul un
                propriétaire ou administrateur peut ensuite autoriser un nouvel essai.
              </p>
              <form
                action={resolveUncertainCandidateProposalAsNotSent}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="application_id" value={applicationId} />
                <input type="hidden" name="proposal_id" value={proposal.id} />
                <label className="block font-medium">
                  Motif confirmant l’absence d’envoi
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={500}
                    rows={3}
                    className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-foreground"
                    placeholder="Ex. Vérification Brevo : aucune livraison ni tentative active."
                  />
                </label>
                <SubmitButton
                  label="Confirmer non envoyé et réautoriser"
                  pendingLabel="Enregistrement…"
                />
              </form>
            </div>
          ) : null}
        </div>
      ) : null}

      {canPrepare ? (
        <form action={prepareCandidatePreReservationProposal} className="mt-5">
          <input type="hidden" name="application_id" value={applicationId} />
          <SubmitButton
            label={proposal ? "Préparer une nouvelle version" : "Préparer la proposition"}
            pendingLabel="Préparation…"
          />
        </form>
      ) : null}

      {canCreateDirectReservation ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
            >
              Préparer la réservation directe
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Créer la réservation après naissance ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette décision crée la réservation et une demande correspondant
                aux arrhes totales. Elle n’ouvre pas encore le parcours adoptant.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={createDirectCandidateReservationAfterBirth} className="space-y-4">
              <input type="hidden" name="application_id" value={applicationId} />
              <label className="block text-sm font-medium">
                Motif de la réservation directe
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5"
                  placeholder="Ex. Chiot déjà né et disponible pour cette famille."
                />
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <SubmitButton
                  label="Créer la réservation"
                  pendingLabel="Création…"
                />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {applicationStatus !== "qualified" ? (
        <p className="mt-4 text-sm text-muted">
          La candidature doit être validée avant toute proposition.
        </p>
      ) : null}
    </section>
  );
}

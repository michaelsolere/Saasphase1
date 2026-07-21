"use client";

import { Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  initialLitterRoutineWeightsActionState,
  initialLitterWeightAdjustmentActionState,
  type LitterWeightAdjustmentActionState,
  type LitterRoutineWeightsActionState,
} from "./litter-weights-actions-core";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
  LitterWeightAdjustmentHistoryEntry,
  LitterWeightOrganizationRole,
  LitterWeighingSchedulePolicyMetadata,
} from "./litter-weights-core";
import type { LitterWeightLatestSessionComparison } from "./litter-weighing-session-comparison";
import type { LitterWeighingScheduleResult } from "./litter-weighing-schedule-model";
import { LitterWeighingScheduleSummary } from "./litter-weighing-schedule-summary";
import {
  litterWeightAnimalDetails,
  litterWeightAnimalName,
} from "./litter-weight-animal-identity";
import { LitterGrowthCharts } from "./litter-growth-charts";
import { LitterGrowthTable } from "./litter-growth-table";
import {
  getRoutineWeightEligibility,
  type RoutineWeightEligibilityReason,
} from "./routine-weight-eligibility";

type RecordAction = (
  previousState: LitterRoutineWeightsActionState,
  formData: FormData,
) => Promise<LitterRoutineWeightsActionState>;
type AdjustmentAction = (previousState: LitterWeightAdjustmentActionState, formData: FormData) => Promise<LitterWeightAdjustmentActionState>;
export type LitterWeightMeasurementAdjustmentAction = { measurementId: string; correctAction: AdjustmentAction; cancelAction: AdjustmentAction | null };
export type LitterWeightSessionCancellationAction = { sessionId: string; action: AdjustmentAction };

const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base outline-none transition focus:border-accent focus:ring-1 focus:ring-accent sm:text-sm";
const labelClass = "text-sm font-semibold";

function currentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatDateTime(value: string, timezoneName?: string) {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezoneName ? { timeZone: timezoneName } : {}),
  };
  try {
    return new Intl.DateTimeFormat("fr-FR", options).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}

const gramsFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function formatGrams(value: number) {
  return `${gramsFormatter.format(value)} g`;
}

function formatGramDifference(value: number) {
  if (value === 0) return "0 g";
  return `${value > 0 ? "+" : ""}${gramsFormatter.format(value)} g`;
}

function routineWeightEligibilityReasonMessage(
  reason: RoutineWeightEligibilityReason,
  animal: LitterWeightHistoryAnimal,
) {
  switch (reason) {
    case "current_ownership_not_produced":
      return animal.ownershipStatus === "adopted_out"
        ? "Adopté administrativement : la saisie de nouvelle pesée est actuellement indisponible."
        : "Statut de propriété actuel incompatible avec une nouvelle pesée.";
    case "missing_birth_date":
      return "Date de naissance manquante.";
    case "stillborn":
      return "Animal déclaré mort-né.";
  }
}

function IneligibleRoutineWeightAnimals({
  animals,
}: {
  animals: Array<{
    animal: LitterWeightHistoryAnimal;
    reasons: RoutineWeightEligibilityReason[];
  }>;
}) {
  if (animals.length === 0) return null;

  return (
    <section
      data-testid="ineligible-routine-weight-animals"
      aria-labelledby="ineligible-routine-weight-animals-title"
      className="mt-4 min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
    >
      <h3 id="ineligible-routine-weight-animals-title" className="font-semibold">
        Animaux non proposés pour cette pesée
      </h3>
      <ul className="mt-3 space-y-3">
        {animals.map(({ animal, reasons }) => (
          <li key={animal.id} className="min-w-0 rounded-lg bg-background/80 px-3 py-3">
            <p className="break-words text-sm font-semibold">
              {litterWeightAnimalName(animal)}
            </p>
            <ul className="mt-1 space-y-1 text-sm leading-5">
              {reasons.map((reason) => (
                <li key={reason} className="break-words">
                  {routineWeightEligibilityReasonMessage(reason, animal)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-h-11">
      {pending ? "Enregistrement..." : "Enregistrer la pesée"}
    </Button>
  );
}

function ActionMessage({ state }: { state: LitterRoutineWeightsActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      }
    >
      {state.message}
    </p>
  );
}

function RoutineWeightDialog({
  animals,
  action,
  onSuccess,
}: {
  animals: LitterWeightHistoryAnimal[];
  action: RecordAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(currentLocalDateTime);
  const measuredAtIsoRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: LitterRoutineWeightsActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(
    submitAction,
    initialLitterRoutineWeightsActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setMeasuredAt(currentLocalDateTime());
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (measuredAtIsoRef.current) {
      measuredAtIsoRef.current.value = localDateTimeToIso(measuredAt);
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = browserTimezone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11">
          <Plus aria-hidden="true" />
          Nouvelle pesée
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] overflow-x-hidden overflow-y-auto rounded-xl p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Nouvelle pesée</DialogTitle>
          <DialogDescription>
            Renseignez uniquement les animaux pesés pendant cette séance.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="min-w-0 space-y-5">
          <input ref={measuredAtIsoRef} type="hidden" name="measured_at" />
          <input ref={timezoneNameRef} type="hidden" name="timezone_name" />
          <div>
            <label className={labelClass} htmlFor="routine-weight-measured-at">
              Date et heure de la pesée
            </label>
            <input
              id="routine-weight-measured-at"
              className={inputClass}
              type="datetime-local"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="routine-weight-note">
              Note commune (facultative)
            </label>
            <textarea
              id="routine-weight-note"
              className={inputClass}
              name="note"
              rows={3}
              maxLength={5000}
            />
          </div>
          <div className="space-y-3" aria-label="Animaux à peser">
            {animals.map((animal, index) => (
              <fieldset
                key={animal.id}
                className="min-w-0 rounded-2xl border bg-surface p-4"
              >
                <legend className="max-w-full px-1 text-base font-semibold">
                  <span className="break-words">{litterWeightAnimalName(animal)}</span>
                </legend>
                {litterWeightAnimalDetails(animal) ? (
                  <p className="mb-3 break-words text-xs leading-5 text-muted">
                    {litterWeightAnimalDetails(animal)}
                  </p>
                ) : null}
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor={`routine-weight-${index}`}>
                      Poids en grammes
                    </label>
                    <input
                      id={`routine-weight-${index}`}
                      className={inputClass}
                      name={`weight_${index}`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="100000"
                      step="1"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`routine-weight-note-${index}`}>
                      Note individuelle (facultative)
                    </label>
                    <input
                      id={`routine-weight-note-${index}`}
                      className={inputClass}
                      name={`item_note_${index}`}
                      maxLength={5000}
                    />
                  </div>
                </div>
              </fieldset>
            ))}
          </div>
          <ActionMessage state={state} />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentState({ state }: { state: LitterWeightAdjustmentActionState }) {
  if (state.status === "idle") return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${state.status === "error" ? "border-rose-200 bg-rose-50 text-rose-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>{state.message}{state.stale ? <> <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Recharger la page</button></> : null}</p>;
}

function CorrectionDialog({ measurement, animalLabel, session, action, onSuccess }: { measurement: LitterWeightHistoryMeasurement; animalLabel: string; session: LitterWeightHistorySession; action: AdjustmentAction; onSuccess: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialLitterWeightAdjustmentActionState);
  const router = useRouter();
  useEffect(() => { if (state.status === "success") { setOpen(false); onSuccess(state.message ?? "La mesure a été corrigée."); router.refresh(); } }, [state, onSuccess, router]);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" size="sm" variant="outline"><Pencil className="size-4" aria-hidden="true" />Corriger</Button></DialogTrigger><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Corriger la pesée de {animalLabel}</DialogTitle><DialogDescription>Séance du {formatDateTime(session.measuredAt, session.timezoneName)}. L’heure de la séance reste inchangée.</DialogDescription></DialogHeader><form action={formAction} className="space-y-4"><label className={labelClass}>Poids (g)<input className={inputClass} name="grams" inputMode="numeric" required defaultValue={measurement.grams} /></label><label className={labelClass}>Note individuelle<textarea className={inputClass} name="note" rows={3} defaultValue={measurement.note ?? ""} /></label><label className={labelClass}>Motif de la correction<textarea className={inputClass} name="reason" rows={3} maxLength={500} required /></label><AdjustmentState state={state} /><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose><Button disabled={pending} type="submit">{pending ? "Correction…" : "Enregistrer la correction"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CancellationDialog({ kind, animalLabel, measurement, session, measurementCount, action, onSuccess }: { kind: "measurement" | "session"; animalLabel?: string; measurement?: LitterWeightHistoryMeasurement; session: LitterWeightHistorySession; measurementCount: number; action: AdjustmentAction; onSuccess: (message: string) => void }) {
  const [open, setOpen] = useState(false); const [state, formAction, pending] = useActionState(action, initialLitterWeightAdjustmentActionState); const cancelledAt = useRef<HTMLInputElement>(null); const router = useRouter();
  useEffect(() => { if (state.status === "success") { setOpen(false); onSuccess(state.message ?? "L’annulation a été enregistrée."); router.refresh(); } }, [state, onSuccess, router]);
  const isSession = kind === "session";
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" size="sm" variant="outline" className={isSession ? "text-destructive" : ""}><Trash2 className="size-4" aria-hidden="true" />{isSession ? "Annuler la séance" : "Annuler la mesure"}</Button></DialogTrigger><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{isSession ? "Annuler toute la séance" : `Annuler la mesure de ${animalLabel}`}</DialogTitle><DialogDescription>{formatDateTime(session.measuredAt, session.timezoneName)}{measurement ? ` · ${formatGrams(measurement.grams)}` : ` · ${measurementCount} mesures actives`}</DialogDescription></DialogHeader><form action={formAction} onSubmit={() => { if (cancelledAt.current) cancelledAt.current.value = new Date().toISOString(); }} className="space-y-4"><input ref={cancelledAt} type="hidden" name="cancelled_at" />{isSession ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950"><p>La séance et toutes ses mesures seront exclues des tableaux, graphiques, statistiques et du planning. Rien ne sera supprimé.</p><p className="mt-2">Si l’heure est erronée, créez ensuite une nouvelle séance à la bonne heure.</p></div> : <p className="text-sm text-muted">La séance restera active et apparaîtra avec une couverture partielle.</p>}<label className={labelClass}>Motif de l’annulation<textarea className={inputClass} name="reason" rows={3} maxLength={500} required /></label><AdjustmentState state={state} /><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Conserver</Button></DialogClose><Button disabled={pending} type="submit" variant="destructive">{pending ? "Annulation…" : isSession ? "Confirmer l’annulation de la séance" : "Confirmer l’annulation"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SessionsHistory({
  sessions,
  measurements,
  animals,
  measurementActions,
  sessionActions,
  onSuccess,
}: {
  sessions: LitterWeightHistorySession[];
  measurements: LitterWeightHistoryMeasurement[];
  animals: LitterWeightHistoryAnimal[];
  measurementActions: LitterWeightMeasurementAdjustmentAction[];
  sessionActions: LitterWeightSessionCancellationAction[];
  onSuccess: (message: string) => void;
}) {
  const animalNameById = new Map(
    animals.map((animal) => [animal.id, litterWeightAnimalName(animal)]),
  );
  return (
    <details
      className="mt-6 rounded-xl border px-4 py-3"
      data-testid="litter-weight-sessions-history"
    >
      <summary className="cursor-pointer font-semibold">
        Historique détaillé des séances
      </summary>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune pesée de routine enregistrée.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {sessions.map((session) => {
            const sessionMeasurements = measurements.filter(
              (measurement) =>
                measurement.type === "routine" &&
                measurement.sessionId === session.id,
            );
            const sessionAction = sessionActions.find((item) => item.sessionId === session.id);
            return (
              <li key={session.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {formatDateTime(session.measuredAt, session.timezoneName)}
                  </p>
                  <p className="text-muted">
                    Couverture : {sessionMeasurements.length} / {animals.length}
                  </p>
                  {sessionAction ? <CancellationDialog kind="session" session={session} measurementCount={sessionMeasurements.length} action={sessionAction.action} onSuccess={onSuccess} /> : null}
                </div>
                {session.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-muted">{session.note}</p>
                ) : null}
                {sessionMeasurements.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-muted">
                    {sessionMeasurements.map((measurement) => { const linked = measurementActions.find((item) => item.measurementId === measurement.id); const animalLabel = animalNameById.get(measurement.animalId) ?? "Animal"; return (
                      <li key={measurement.id} className="flex min-w-0 flex-col gap-2 rounded-lg bg-secondary/40 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="min-w-0 break-words"><span className="font-medium text-foreground">{animalLabel}</span> · {formatGrams(measurement.grams)}{measurement.note ? ` · ${measurement.note}` : ""}</p>{linked ? <div className="flex flex-wrap gap-2"><CorrectionDialog measurement={measurement} animalLabel={animalLabel} session={session} action={linked.correctAction} onSuccess={onSuccess} />{linked.cancelAction ? <CancellationDialog kind="measurement" animalLabel={animalLabel} measurement={measurement} session={session} measurementCount={sessionMeasurements.length} action={linked.cancelAction} onSuccess={onSuccess} /> : <p className="max-w-xs text-xs text-muted">Dernière mesure de la séance : utilisez « Annuler la séance ».</p>}</div> : null}</li>
                    );})}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

function AdjustmentHistory({ entries, loadError }: { entries: LitterWeightAdjustmentHistoryEntry[]; loadError: boolean }) {
  return <details className="mt-3 rounded-xl border px-4 py-3" data-testid="litter-weight-adjustment-history"><summary className="cursor-pointer font-semibold">Historique des rectifications</summary>{loadError ? <p className="mt-3 text-sm text-muted">L’historique des rectifications n’est pas disponible pour le moment.</p> : entries.length === 0 ? <p className="mt-3 text-sm text-muted">Aucune rectification enregistrée.</p> : <ol className="mt-3 space-y-3">{entries.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{entry.commandType === "correct_measurement" ? "Poids corrigé" : entry.commandType === "cancel_measurement" ? "Mesure annulée" : "Séance annulée"}</p><time className="text-muted">{formatDateTime(entry.createdAt)}</time></div><p className="mt-1 text-muted">Séance du {formatDateTime(entry.sessionMeasuredAt, entry.sessionTimezoneName)}{entry.animalLabel ? ` · ${entry.animalLabel}` : ""}</p><p className="mt-2 whitespace-pre-wrap">Motif : {entry.reason}</p>{entry.commandType === "correct_measurement" ? <><p className="mt-1">{formatGrams(entry.beforeGrams ?? 0)} → {formatGrams(entry.afterGrams ?? 0)}</p>{entry.beforeNote !== entry.afterNote ? <p className="mt-1 text-muted">Note : {entry.beforeNote || "Aucune"} → {entry.afterNote || "Aucune"}</p> : null}</> : entry.commandType === "cancel_measurement" ? <p className="mt-1">Poids d’origine : {formatGrams(entry.beforeGrams ?? 0)}</p> : <p className="mt-1">{entry.affectedMeasurementCount} mesure{entry.affectedMeasurementCount > 1 ? "s" : ""} concernée{entry.affectedMeasurementCount > 1 ? "s" : ""}</p>}</li>)}</ol>}</details>;
}

type LitterWeightMainView = "table" | "charts" | "schedule";

function compactScheduleState(schedule: LitterWeighingScheduleResult | null) {
  if (!schedule || schedule.status !== "available") return "Planning indisponible";
  const item = schedule.summary.firstIncomplete;
  if (!item) return "Planning à jour";
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${item.scheduledOn}T00:00:00Z`));
  if (item.status === "overdue") return `En retard : J${item.ageDay}`;
  if (item.status === "due_today") return `Aujourd’hui : J${item.ageDay}`;
  return `Prochaine : J${item.ageDay} · ${date}`;
}

function LatestWeightBanner({
  session,
  animalCount,
  comparison,
  schedule,
}: {
  session: LitterWeightHistorySession | null;
  animalCount: number;
  comparison: LitterWeightLatestSessionComparison;
  schedule: LitterWeighingScheduleResult | null;
}) {
  const latestCompleted =
    schedule?.status === "available"
      ? schedule.schedule.filter((item) => item.status === "completed").at(-1)
      : null;
  return (
    <section
      className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-secondary/50 px-4 py-3 text-sm"
      data-testid="latest-litter-weight-banner"
      aria-label="Dernière pesée"
    >
      <span className="font-semibold">
        {session
          ? `${latestCompleted ? `J${latestCompleted.ageDay} · ` : ""}${formatDateTime(session.measuredAt, session.timezoneName)}`
          : "Aucune séance"}
      </span>
      <span>Couverture : {session ? `${session.measurementCount} / ${Math.max(animalCount, session.measurementCount)}` : "—"}</span>
      <span>Poids moyen : {session?.averageGrams !== null && session?.averageGrams !== undefined ? formatGrams(session.averageGrams) : "—"}</span>
      <span>
        Variation moyenne : {comparison.status === "available" ? formatGramDifference(comparison.averageDifferenceGrams) : "—"}
      </span>
      <span className="text-muted">{compactScheduleState(schedule)}</span>
    </section>
  );
}

export function LitterWeightPanel({
  animals,
  sessions,
  measurements,
  latestSessionComparison,
  weighingSchedule,
  weighingSchedulePolicy,
  role,
  action,
  measurementAdjustmentActions,
  sessionCancellationActions,
  adjustmentHistory,
  adjustmentHistoryLoadError,
  loadError,
}: {
  animals: LitterWeightHistoryAnimal[];
  sessions: LitterWeightHistorySession[];
  measurements: LitterWeightHistoryMeasurement[];
  latestSessionComparison: LitterWeightLatestSessionComparison;
  weighingSchedule: LitterWeighingScheduleResult | null;
  weighingSchedulePolicy: LitterWeighingSchedulePolicyMetadata | null;
  role: LitterWeightOrganizationRole | null;
  action: RecordAction | null;
  measurementAdjustmentActions: LitterWeightMeasurementAdjustmentAction[];
  sessionCancellationActions: LitterWeightSessionCancellationAction[];
  adjustmentHistory: LitterWeightAdjustmentHistoryEntry[];
  adjustmentHistoryLoadError: boolean;
  loadError: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mainView, setMainView] = useState<LitterWeightMainView>("table");
  const animalsWithEligibility = animals.map((animal) => ({
    animal,
    eligibility: getRoutineWeightEligibility(animal),
  }));
  const eligibleAnimals = animalsWithEligibility.flatMap(({ animal, eligibility }) =>
    eligibility.eligible ? [animal] : [],
  );
  const ineligibleAnimals = animalsWithEligibility.flatMap(({ animal, eligibility }) =>
    eligibility.eligible ? [] : [{ animal, reasons: eligibility.reasons }],
  );
  const canWrite =
    action !== null &&
    (role === "owner" || role === "admin" || role === "member") &&
    eligibleAnimals.length >= 1 &&
    eligibleAnimals.length <= 30;
  const lastSession = sessions[0] ?? null;

  if (loadError) {
    return (
      <section data-testid="litter-weight-panel" className="rounded-2xl border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Scale aria-hidden="true" className="text-accent" />
          <h2 className="text-lg font-semibold">Poids et croissance</h2>
        </div>
        <p className="mt-4 text-sm text-muted">
          Les poids ne sont pas disponibles pour le moment. Les autres éléments du journal restent accessibles.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="litter-weight-panel" className="min-w-0 rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Scale aria-hidden="true" className="shrink-0 text-accent" />
            <h2 className="text-lg font-semibold">Poids et croissance</h2>
          </div>
          <p className="mt-3 text-sm text-muted">
            {animals.length} {animals.length > 1 ? "animaux suivis" : "animal suivi"}
            {" · "}{sessions.length} séance{sessions.length > 1 ? "s" : ""} de routine
            {" · "}{lastSession ? `Dernière pesée le ${formatDateTime(lastSession.measuredAt, lastSession.timezoneName)}` : "Aucune séance"}
          </p>
        </div>
        {canWrite ? (
          <RoutineWeightDialog
            animals={eligibleAnimals}
            action={action}
            onSuccess={setConfirmation}
          />
        ) : null}
      </div>
      <IneligibleRoutineWeightAnimals animals={ineligibleAnimals} />
      <LatestWeightBanner
        session={lastSession}
        animalCount={animals.length}
        comparison={latestSessionComparison}
        schedule={weighingSchedule}
      />
      {confirmation ? (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {confirmation}
        </p>
      ) : null}
      <nav className="mt-5 flex w-fit max-w-full overflow-x-auto rounded-lg border p-1" aria-label="Vue poids et croissance">
        {(["table", "charts", "schedule"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mainView === view}
            onClick={() => setMainView(view)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${
              mainView === view
                ? "bg-accent text-accent-foreground"
                : "text-muted"
            }`}
          >
            {view === "table" ? "Tableau" : view === "charts" ? "Graphiques" : "Planning"}
          </button>
        ))}
      </nav>
      <div data-testid={`litter-weight-main-view-${mainView}`}>
        {mainView === "table" ? (
          <LitterGrowthTable
            animals={animals}
            sessions={sessions}
            measurements={measurements}
          />
        ) : mainView === "charts" ? (
          <LitterGrowthCharts animals={animals} measurements={measurements} />
        ) : (
          <LitterWeighingScheduleSummary
            schedule={weighingSchedule}
            policy={weighingSchedulePolicy}
          />
        )}
      </div>
      <SessionsHistory
        sessions={sessions}
        measurements={measurements}
        animals={animals}
        measurementActions={measurementAdjustmentActions}
        sessionActions={sessionCancellationActions}
        onSuccess={setConfirmation}
      />
      <AdjustmentHistory entries={adjustmentHistory} loadError={adjustmentHistoryLoadError} />
    </section>
  );
}

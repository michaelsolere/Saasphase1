"use client";

import { Plus, Scale } from "lucide-react";
import { useActionState, useCallback, useRef, useState } from "react";
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
  type LitterRoutineWeightsActionState,
} from "./litter-weights-actions-core";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
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

type RecordAction = (
  previousState: LitterRoutineWeightsActionState,
  formData: FormData,
) => Promise<LitterRoutineWeightsActionState>;

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

function measurementCountLabel(count: number) {
  return `${count} poids enregistré${count > 1 ? "s" : ""}`;
}

function SessionStatistics({
  session,
  compact = false,
}: {
  session: LitterWeightHistorySession;
  compact?: boolean;
}) {
  const { averageGrams, minimumGrams, maximumGrams } = session;
  if (
    session.measurementCount === 0 ||
    averageGrams === null ||
    minimumGrams === null ||
    maximumGrams === null
  ) {
    return (
      <p className={compact ? "mt-3 text-sm text-muted" : "mt-2 text-sm text-muted"}>
        Statistiques indisponibles pour cette séance.
      </p>
    );
  }

  return (
    <div className={compact ? "mt-3" : "mt-2"}>
      <p className="text-sm text-muted">
        {session.measurementCount} poids enregistré
        {session.measurementCount > 1 ? "s" : ""}
      </p>
      <dl
        className={
          compact
            ? "mt-3 grid min-w-0 grid-cols-1 gap-2 text-sm min-[360px]:grid-cols-3"
            : "mt-2 grid min-w-0 gap-1 text-sm"
        }
      >
        <div className={compact ? "min-w-0 rounded-lg bg-background px-3 py-2" : "flex min-w-0 gap-1"}>
          <dt className="font-medium">Moyenne{compact ? "" : " :"}</dt>
          <dd className={compact ? "mt-1 break-words" : "break-words"}>
            {formatGrams(averageGrams)}
          </dd>
        </div>
        <div className={compact ? "min-w-0 rounded-lg bg-background px-3 py-2" : "flex min-w-0 gap-1"}>
          <dt className="font-medium">Minimum{compact ? "" : " :"}</dt>
          <dd className={compact ? "mt-1 break-words" : "break-words"}>
            {formatGrams(minimumGrams)}
          </dd>
        </div>
        <div className={compact ? "min-w-0 rounded-lg bg-background px-3 py-2" : "flex min-w-0 gap-1"}>
          <dt className="font-medium">Maximum{compact ? "" : " :"}</dt>
          <dd className={compact ? "mt-1 break-words" : "break-words"}>
            {formatGrams(maximumGrams)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-5 text-muted">
        Calculé sur les poids enregistrés pendant cette séance.
      </p>
    </div>
  );
}

function LatestSessionComparison({
  comparison,
}: {
  comparison: LitterWeightLatestSessionComparison;
}) {
  return (
    <section
      data-testid="latest-litter-weight-session-comparison"
      aria-labelledby="latest-litter-weight-session-comparison-title"
      className="mt-4 min-w-0 rounded-xl border p-4"
    >
      <h3
        id="latest-litter-weight-session-comparison-title"
        className="font-semibold"
      >
        Évolution entre les deux dernières séances
      </h3>
      {comparison.status === "insufficient_sessions" ? (
        <p className="mt-3 text-sm leading-6 text-muted">
          Deux séances comportant des poids sont nécessaires pour afficher une
          évolution.
        </p>
      ) : comparison.status === "no_common_animals" ? (
        <p className="mt-3 text-sm leading-6 text-muted">
          Les deux dernières séances ne comportent aucun animal pesé en commun ;
          leur évolution moyenne n’est donc pas comparée.
        </p>
      ) : (
        <div className="mt-3 min-w-0 space-y-4 text-sm">
          <div className="space-y-1 text-muted">
            <p className="break-words">
              <span className="font-medium text-foreground">Séance précédente :</span>{" "}
              {formatDateTime(
                comparison.previousMeasuredAt,
                comparison.previousTimezoneName,
              )}{" "}
              · {measurementCountLabel(comparison.previousMeasurementCount)}
            </p>
            <p className="break-words">
              <span className="font-medium text-foreground">Dernière séance :</span>{" "}
              {formatDateTime(
                comparison.currentMeasuredAt,
                comparison.currentTimezoneName,
              )}{" "}
              · {measurementCountLabel(comparison.currentMeasurementCount)}
            </p>
          </div>
          <p className="font-medium">
            {comparison.commonAnimalCount}{" "}
            {comparison.commonAnimalCount > 1 ? "animaux" : "animal"} pesé
            {comparison.commonAnimalCount > 1 ? "s" : ""} lors des deux séances
          </p>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg bg-secondary/50 p-3">
              <dt className="font-medium">Poids moyen des animaux communs</dt>
              <dd className="mt-2 break-words text-base font-semibold">
                {formatGrams(comparison.previousCommonAverageGrams)} →{" "}
                {formatGrams(comparison.currentCommonAverageGrams)}
              </dd>
              <dd className="mt-1 break-words text-muted">
                Évolution : {formatGramDifference(comparison.averageDifferenceGrams)}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg bg-secondary/50 p-3">
              <dt className="font-medium">
                Amplitude des poids des animaux communs
              </dt>
              <dd className="mt-1 text-xs leading-5 text-muted">
                Écart entre le poids minimum et le poids maximum.
              </dd>
              <dd className="mt-2 break-words text-base font-semibold">
                {formatGrams(comparison.previousCommonRangeGrams)} →{" "}
                {formatGrams(comparison.currentCommonRangeGrams)}
              </dd>
              <dd className="mt-1 break-words text-muted">
                Évolution : {formatGramDifference(comparison.rangeDifferenceGrams)}
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-5 text-muted">
            Comparaison calculée uniquement sur les animaux pesés lors des deux
            séances.
          </p>
        </div>
      )}
    </section>
  );
}

function eligibleForRoutineWeight(animal: LitterWeightHistoryAnimal) {
  return (
    animal.ownershipStatus === "produced" &&
    animal.birthDate !== null &&
    animal.status !== "stillborn"
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

function SessionsHistory({ sessions }: { sessions: LitterWeightHistorySession[] }) {
  return (
    <div data-testid="litter-weight-sessions-history">
      <h3 className="text-base font-semibold">Séances</h3>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune pesée de routine enregistrée.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">
                {formatDateTime(session.measuredAt, session.timezoneName)}
              </p>
              <SessionStatistics session={session} />
              {session.note ? <p className="mt-2 whitespace-pre-wrap">{session.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnimalsHistory({
  animals,
  measurements,
  sessions,
}: {
  animals: LitterWeightHistoryAnimal[];
  measurements: LitterWeightHistoryMeasurement[];
  sessions: LitterWeightHistorySession[];
}) {
  const timezoneBySession = new Map(
    sessions.map((session) => [session.id, session.timezoneName]),
  );
  return (
    <div data-testid="litter-weight-animals-history">
      <h3 className="text-base font-semibold">Animaux</h3>
      <div className="mt-3 space-y-4">
        {animals.map((animal) => {
          const animalMeasurements = measurements.filter(
            (measurement) => measurement.animalId === animal.id,
          );
          return (
            <article key={animal.id} className="rounded-2xl border p-4 sm:p-5">
              <h4 className="break-words font-semibold">{litterWeightAnimalName(animal)}</h4>
              {litterWeightAnimalDetails(animal) ? (
                <p className="mt-1 break-words text-xs leading-5 text-muted">
                  {litterWeightAnimalDetails(animal)}
                </p>
              ) : null}
              {animal.birthWeightGrams !== null ? (
                <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm">
                  <span className="font-medium">Repère déclaré à la naissance :</span>{" "}
                  {animal.birthWeightGrams} g
                </p>
              ) : null}
              {animalMeasurements.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Aucune mesure enregistrée.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {animalMeasurements.map((measurement, index) => {
                    const latest = index === animalMeasurements.length - 1;
                    const timezoneName = measurement.sessionId
                      ? timezoneBySession.get(measurement.sessionId)
                      : undefined;
                    return (
                      <li
                        key={measurement.id}
                        className={
                          latest
                            ? "rounded-xl border border-accent/40 bg-accent/5 px-3 py-3 text-sm"
                            : "rounded-xl border px-3 py-3 text-sm"
                        }
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-semibold">{measurement.grams} g</p>
                          <p className="text-xs text-muted">
                            {formatDateTime(measurement.measuredAt, timezoneName)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {measurement.type === "birth" ? "Mesure de naissance" : "Pesée de routine"}
                          {latest ? " · Dernière mesure" : ""}
                        </p>
                        {measurement.note ? (
                          <p className="mt-2 whitespace-pre-wrap">{measurement.note}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </div>
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
  loadError: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const eligibleAnimals = animals.filter(eligibleForRoutineWeight);
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
        <LitterWeighingScheduleSummary
          schedule={weighingSchedule}
          policy={weighingSchedulePolicy}
        />
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
      <LitterWeighingScheduleSummary
        schedule={weighingSchedule}
        policy={weighingSchedulePolicy}
      />
      {lastSession ? (
        <section
          data-testid="latest-litter-weight-session-summary"
          aria-labelledby="latest-litter-weight-session-summary-title"
          className="mt-4 min-w-0 rounded-xl border bg-secondary/50 p-4"
        >
          <h3 id="latest-litter-weight-session-summary-title" className="font-semibold">
            Synthèse de la dernière séance
          </h3>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(lastSession.measuredAt, lastSession.timezoneName)}
          </p>
          <SessionStatistics session={lastSession} compact />
        </section>
      ) : null}
      <LatestSessionComparison comparison={latestSessionComparison} />
      {confirmation ? (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {confirmation}
        </p>
      ) : null}
      <LitterGrowthCharts animals={animals} measurements={measurements} />
      <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-2">
        <SessionsHistory sessions={sessions} />
        <AnimalsHistory animals={animals} measurements={measurements} sessions={sessions} />
      </div>
    </section>
  );
}

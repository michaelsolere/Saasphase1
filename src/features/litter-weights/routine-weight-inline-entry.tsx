"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import {
  initialLitterRoutineWeightsActionState,
  type LitterRoutineWeightsActionState,
} from "@/features/litter-weights/litter-weights-actions-core";
import {
  buildLitterRoutineWeightEntries,
  getLitterRoutineWeightEntryProgress,
  type LitterRoutineWeightDraft,
} from "@/features/litter-weights/litter-routine-weight-entry";
import { collarSeriesColor } from "@/features/litter-weights/litter-collar-colors";
import {
  computeEntryDeltaPercent,
  formatSignedPercent,
} from "@/features/litter-weights/weight-entry-deltas";
import { findLowestGainAnimals } from "@/features/litter-weights/gain-alert-model";
import type { LitterGainAlertPolicyV1 } from "@/features/litter-weights/litter-gain-alert-policy";

type RecordAction = (
  previousState: LitterRoutineWeightsActionState,
  formData: FormData,
) => Promise<LitterRoutineWeightsActionState>;

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function localDateTimeToIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function currentLocalDateTime() {
  const now = new Date();
  now.setSeconds(0, 0);
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Saisie des pesées intégrée dans la page (prototype 004-journal-hybride) :
 * tableau compact d'une ligne par animal, Δ calculés à la saisie,
 * alerte « prise la plus faible », enregistrement groupé sans modale.
 * Réutilise l'action serveur et les projections existantes sans les modifier.
 */
export function RoutineWeightInlineEntry({
  animals,
  measurements,
  action,
  onSuccess,
  gainAlertPolicy,
}: {
  animals: Parameters<typeof buildLitterRoutineWeightEntries>[0]["animals"];
  measurements: Parameters<
    typeof buildLitterRoutineWeightEntries
  >[0]["measurements"];
  action: RecordAction | null;
  onSuccess: (message: string) => void;
  gainAlertPolicy: LitterGainAlertPolicyV1;
}) {
  const router = useRouter();
  const [weightDrafts, setWeightDrafts] = useState<LitterRoutineWeightDraft[]>(
    () => animals.map((animal) => ({ animalId: animal.id, weightDraft: "" })),
  );
  const [measuredAt, setMeasuredAt] = useState(currentLocalDateTime);
  const [sessionNoteDraft, setSessionNoteDraft] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [showPartialConfirmation, setShowPartialConfirmation] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const measuredAtIsoRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () =>
      buildLitterRoutineWeightEntries({
        animals,
        measurements,
        drafts: weightDrafts,
      }),
    [animals, measurements, weightDrafts],
  );
  const progress = useMemo(
    () => getLitterRoutineWeightEntryProgress(entries),
    [entries],
  );

  const deltaByAnimalId = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const entry of entries) {
      const draftGrams =
        entry.isValidWeightDraft && entry.weightDraft.trim() !== ""
          ? Number(entry.weightDraft)
          : null;
      map.set(
        entry.animalId,
        computeEntryDeltaPercent(entry.latestWeightGrams, draftGrams),
      );
    }
    return map;
  }, [entries]);

  const flaggedAnimalIds = useMemo(
    () =>
      findLowestGainAnimals(
        entries.map((entry) => ({
          animalId: entry.animalId,
          publicLabel: entry.publicLabel,
          deltaPercent: deltaByAnimalId.get(entry.animalId) ?? null,
        })),
        gainAlertPolicy.lowestGainCount,
      ),
    [entries, deltaByAnimalId, gainAlertPolicy.lowestGainCount],
  );

  const updateWeightDraft = useCallback((animalId: string, weightDraft: string) => {
    setClientError(null);
    setShowPartialConfirmation(false);
    setWeightDrafts((current) =>
      current.map((draft) =>
        draft.animalId === animalId ? { ...draft, weightDraft } : draft,
      ),
    );
  }, []);

  const submitAction = useCallback(
    async (
      previousState: LitterRoutineWeightsActionState,
      formData: FormData,
    ): Promise<LitterRoutineWeightsActionState> => {
      if (!action) return previousState;
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setWeightDrafts(
          animals.map((animal) => ({ animalId: animal.id, weightDraft: "" })),
        );
        setSessionNoteDraft("");
        setMeasuredAt(currentLocalDateTime());
        setClientError(null);
        setShowPartialConfirmation(false);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, animals, onSuccess, router],
  );

  const [state, formAction] = useActionState(
    submitAction,
    initialLitterRoutineWeightsActionState,
  );

  function prepareSubmission() {
    const iso = localDateTimeToIso(measuredAt);
    if (measuredAtIsoRef.current && iso) {
      measuredAtIsoRef.current.value = iso;
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = browserTimezone();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    prepareSubmission();
    if (progress.validWeightCount === 0) {
      event.preventDefault();
      setShowPartialConfirmation(false);
      setClientError("Saisissez au moins un poids.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const partialConfirmed =
      submitter?.name === "partial_confirmation" &&
      submitter.value === "confirmed";
    if (progress.missingAnimalLabels.length > 0 && !partialConfirmed) {
      event.preventDefault();
      setClientError(null);
      setShowPartialConfirmation(true);
    }
  }

  if (!action) {
    return null;
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="mt-5 min-w-0 rounded-2xl border border-accent/25 bg-secondary/40 p-4 sm:p-5"
      data-testid="routine-weight-inline-entry"
      id="weight-entry"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-base font-semibold">Séance de pesée — aujourd’hui</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            Renseignez uniquement les animaux pesés. Les variations se calculent
            automatiquement ; l’enregistrement groupé crée la séance.
          </p>
        </div>
        <p
          aria-live="polite"
          aria-atomic="true"
          className="shrink-0 text-sm font-semibold text-foreground"
          data-testid="routine-weight-inline-progress"
        >
          {progress.validWeightCount} / {entries.length} saisis
        </p>
      </div>

      <input ref={measuredAtIsoRef} type="hidden" name="measured_at" />
      <input ref={timezoneNameRef} type="hidden" name="timezone_name" />

      {flaggedAnimalIds.length > 0 ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="routine-weight-gain-alert"
        >
          <span className="font-semibold">Prise la plus faible du jour :</span>{" "}
          {flaggedAnimalIds
            .map((animalId) =>
              entries.find((entry) => entry.animalId === animalId)?.publicLabel,
            )
            .filter(Boolean)
            .join(", ")}
          . Variation en retrait par rapport au reste de la portée — signal
          descriptif, à relire humainement.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto" aria-label="Animaux à peser">
        <table className="w-full min-w-max border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th scope="col" className="py-1 pr-3 font-semibold">Chiot</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Dernier poids</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Aujourd’hui (g)</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Δ depuis dernière</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const collar = collarSeriesColor(entry.collarColor, index);
              const delta = deltaByAnimalId.get(entry.animalId) ?? null;
              const flagged = flaggedAnimalIds.includes(entry.animalId);
              return (
                <tr key={entry.animalId}>
                  <td className="whitespace-nowrap py-1.5 pr-3 align-middle">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: collar.color }}
                      />
                      <span className="font-medium">{entry.publicLabel}</span>
                      {flagged ? (
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full bg-amber-500"
                          title="Prise de poids la plus faible du jour"
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-muted">
                    {entry.latestWeightGrams !== null
                      ? `${entry.latestWeightGrams} g`
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <label className="sr-only" htmlFor={`inline-weight-${entry.animalId}`}>
                      Poids de {entry.publicLabel} en grammes
                    </label>
                    <input
                      id={`inline-weight-${entry.animalId}`}
                      className="w-24 rounded-lg border bg-background px-2 py-1.5 text-sm font-semibold tabular-nums outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                      inputMode="numeric"
                      autoComplete="off"
                      name={`weight_${index}`}
                      value={entry.weightDraft}
                      onChange={(event) =>
                        updateWeightDraft(entry.animalId, event.target.value)
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                    {delta === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={
                          delta >= 0
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-amber-700"
                        }
                      >
                        {formatSignedPercent(delta)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-3 rounded-xl border px-3 py-2">
        <summary className="flex min-h-9 cursor-pointer items-center text-sm font-semibold">
          Date, heure et note de séance
        </summary>
        <div className="space-y-3 pb-2 pt-2">
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide text-muted"
              htmlFor="routine-weight-inline-measured-at"
            >
              Date et heure de la pesée
            </label>
            <input
              id="routine-weight-inline-measured-at"
              className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
              type="datetime-local"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide text-muted"
              htmlFor="routine-weight-inline-note"
            >
              Note commune (facultative)
            </label>
            <textarea
              id="routine-weight-inline-note"
              className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
              rows={2}
              maxLength={5000}
              name="note"
              value={sessionNoteDraft}
              onChange={(event) => setSessionNoteDraft(event.target.value)}
            />
          </div>
        </div>
      </details>

      {clientError ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {clientError}
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {state.message}
        </p>
      ) : null}

      {showPartialConfirmation ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Séance partielle :{" "}
          {progress.missingAnimalLabels.join(", ")} sans mesure. Confirmez pour
          n’enregistrer que les poids saisis.
          <button
            type="submit"
            name="partial_confirmation"
            value="confirmed"
            className="ml-2 rounded-lg border border-amber-300 bg-background px-2 py-1 text-xs font-semibold text-amber-900"
          >
            Confirmer la séance partielle
          </button>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex min-h-10 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Enregistrer la séance
        </button>
        <button
          type="button"
          onClick={() => {
            setWeightDrafts(
              animals.map((animal) => ({ animalId: animal.id, weightDraft: "" })),
            );
            setClientError(null);
            setShowPartialConfirmation(false);
          }}
          className="inline-flex min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/5"
        >
          Effacer les saisies
        </button>
      </div>
    </form>
  );
}

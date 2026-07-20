"use client";

import { useMemo, useState } from "react";

import { buildLitterWeighingPolicyPreview } from "@/features/litter-weights/litter-weighing-policy-preview";
import type {
  LitterWeighingSchedulePolicy,
} from "@/features/litter-weights/litter-weighing-schedule-model";
import { formatLitterWeighingSchedulePhaseFr } from "@/features/litter-weights/litter-weighing-schedule-summary";
import { updateLitterWeighingSchedulePolicy } from "@/features/settings/actions";

type Props = {
  organizationId: string;
  canEdit: boolean;
  customPolicy: LitterWeighingSchedulePolicy | null;
  recommendedPolicy: LitterWeighingSchedulePolicy;
  hasInvalidPersistedPolicy: boolean;
};

type PhaseDraft = {
  startAgeDay: string;
  endAgeDay: string;
  intervalDays: string;
};

function toDrafts(policy: LitterWeighingSchedulePolicy): PhaseDraft[] {
  return policy.phases.map((phase) => ({
    startAgeDay: String(phase.startAgeDay),
    endAgeDay: String(phase.endAgeDay),
    intervalDays: String(phase.intervalDays),
  }));
}

function numberFromDraft(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toCandidate(phases: readonly PhaseDraft[]) {
  return {
    phases: phases.map((phase) => ({
      startAgeDay: numberFromDraft(phase.startAgeDay),
      endAgeDay: numberFromDraft(phase.endAgeDay),
      intervalDays: numberFromDraft(phase.intervalDays),
    })),
  };
}

function validationMessage(error: string) {
  if (error.includes("non-empty array")) return "Conservez au moins une phase.";
  if (error.includes("at most")) return "La cadence est limitée à 12 phases.";
  if (error.includes("finite integers")) return "Utilisez uniquement des jours entiers.";
  if (error.includes("non-negative")) return "Le début doit être compris entre J0 et J365.";
  if (error.includes("must not precede")) return "La fin doit être postérieure ou égale au début.";
  if (error.includes("must not exceed")) return "La fin ne peut pas dépasser J365.";
  if (error.includes("at least 1")) return "L’intervalle doit être d’au moins un jour.";
  if (error.includes("out of order")) return "Les phases doivent être ordonnées par jour de début.";
  if (error.includes("overlaps")) return "Les phases ne doivent pas se chevaucher.";
  if (error.includes("more than 400")) return "La cadence ne peut pas dépasser 400 échéances.";
  return "La cadence saisie n’est pas valide.";
}

function nextPhase(phases: readonly PhaseDraft[]): PhaseDraft {
  const previousEnd = Number(phases.at(-1)?.endAgeDay);
  const startAgeDay = Number.isInteger(previousEnd)
    ? Math.min(previousEnd + 1, 365)
    : 0;
  return {
    startAgeDay: String(startAgeDay),
    endAgeDay: String(startAgeDay),
    intervalDays: "1",
  };
}

export function LitterWeighingPolicySettings({
  organizationId,
  canEdit,
  customPolicy,
  recommendedPolicy,
  hasInvalidPersistedPolicy,
}: Props) {
  const initialPolicy = customPolicy ?? recommendedPolicy;
  const [phases, setPhases] = useState<PhaseDraft[]>(() => toDrafts(initialPolicy));
  const candidate = useMemo(() => toCandidate(phases), [phases]);
  const previewResult = useMemo(
    () => buildLitterWeighingPolicyPreview(candidate),
    [candidate],
  );
  const policyJson = JSON.stringify(candidate);

  function updatePhase(
    index: number,
    field: keyof PhaseDraft,
    value: string,
  ) {
    setPhases((current) =>
      current.map((phase, phaseIndex) =>
        phaseIndex === index ? { ...phase, [field]: value } : phase,
      ),
    );
  }

  return (
    <section
      id="litter-weighing-policy"
      className="mt-8 min-w-0 scroll-mt-6 rounded-2xl border bg-surface p-4 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Cadence des pesées des portées</h2>
      <p className="mt-3 text-sm font-semibold text-foreground">
        {hasInvalidPersistedPolicy
          ? "État de configuration à corriger"
          : customPolicy
            ? "Politique personnalisée active"
            : "Cadence recommandée du logiciel"}
      </p>
      {hasInvalidPersistedPolicy ? (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          La cadence enregistrée ne peut pas être lue. La recommandation est
          proposée comme base de correction. Vous pouvez l’enregistrer ou
          rétablir la cadence recommandée.
        </p>
      ) : null}
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Les modifications s’appliquent aux portées sans date réelle de naissance.
        <br />
        Les portées déjà nées conservent leur cadence figée.
      </p>

      <form action={updateLitterWeighingSchedulePolicy} className="mt-6 min-w-0">
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="policy_json" value={policyJson} />

        <div className="space-y-4" data-testid="litter-weighing-policy-phases">
          {phases.map((phase, index) => (
            <fieldset
              key={index}
              className="min-w-0 rounded-xl border bg-background p-3 sm:p-4"
            >
              <legend className="px-1 text-sm font-semibold">Phase {index + 1}</legend>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    ["startAgeDay", "Début en jours", 0],
                    ["endAgeDay", "Fin en jours", 0],
                    ["intervalDays", "Intervalle en jours", 1],
                  ] as const
                ).map(([field, label, minimum]) => {
                  const id = `litter-weighing-phase-${index}-${field}`;
                  return (
                    <div className="min-w-0" key={field}>
                      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {label}
                      </label>
                      <input
                        id={id}
                        aria-label={`${label} · phase ${index + 1}`}
                        type="number"
                        inputMode="numeric"
                        min={minimum}
                        max={field === "intervalDays" ? undefined : 365}
                        step="1"
                        value={phase[field]}
                        disabled={!canEdit}
                        onChange={(event) => updatePhase(index, field, event.target.value)}
                        className="mt-2 w-full min-w-0 rounded-xl border bg-surface px-3 py-2.5 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </div>
                  );
                })}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={phases.length === 1}
                  onClick={() => setPhases((current) => current.filter((_, phaseIndex) => phaseIndex !== index))}
                  className="mt-3 text-sm font-semibold text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={`Supprimer la phase ${index + 1}`}
                >
                  Supprimer cette phase
                </button>
              ) : null}
            </fieldset>
          ))}
        </div>

        {canEdit ? (
          <button
            type="button"
            disabled={phases.length >= 12}
            onClick={() => setPhases((current) => [...current, nextPhase(current)])}
            className="mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Ajouter une phase
          </button>
        ) : null}

        <div className="mt-6 min-w-0 rounded-xl border bg-secondary/50 p-4" aria-live="polite">
          <h3 className="font-semibold">Prévisualisation</h3>
          {previewResult.ok ? (
            <>
              <p className="mt-2 text-sm">
                <strong>{previewResult.preview.scheduledCount}</strong> échéance(s)
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {previewResult.preview.policy.phases.map((phase, index) => (
                  <li key={`${phase.startAgeDay}-${phase.endAgeDay}-${index}`}>
                    {formatLitterWeighingSchedulePhaseFr(phase)}
                  </li>
                ))}
              </ul>
              <div
                data-testid="litter-weighing-generated-days"
                className="mt-3 max-h-28 min-w-0 overflow-y-auto rounded-lg border bg-background p-3 text-sm leading-6 text-muted [overflow-wrap:anywhere]"
              >
                {previewResult.preview.ageDays.map((day) => `J${day}`).join(" · ")}
              </div>
            </>
          ) : (
            <p role="alert" className="mt-2 text-sm text-amber-900">
              {validationMessage(previewResult.error)}
            </p>
          )}
        </div>

        {!canEdit ? (
          <p className="mt-5 text-sm text-muted">
            Votre rôle permet de consulter cette cadence en lecture seule.
          </p>
        ) : (
          <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="submit"
              name="intent"
              value="reset_recommended"
              className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-secondary sm:w-auto"
            >
              Rétablir la cadence recommandée
            </button>
            <button
              type="submit"
              name="intent"
              value="save_custom"
              disabled={!previewResult.ok}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Enregistrer la cadence personnalisée
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

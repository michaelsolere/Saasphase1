import Link from "next/link";

import { formatLitterDate } from "./formatters";
import {
  expectedBirthFallbackHint,
  explicitEstimatedOvulationFieldValue,
  explicitExpectedBirthFieldValue,
  gestationAnchorRecalculationErrorMessage,
  gestationAnchorRecalculationSuccessMessage,
  type LitterGestationAnchorBusinessOutcome,
  type LitterGestationAnchorCounters,
} from "./litter-gestation-anchors-outcome";

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-muted";
const readonlyClass =
  "mt-2 w-full rounded-xl border border-dashed bg-surface px-4 py-3 text-sm text-foreground";

export type LitterGestationAnchorsSectionProps = {
  litterId: string;
  motherId: string | null;
  matingDate: string | null;
  matingDate2: string | null;
  estimatedOvulationDate: string | null;
  expectedBirthDate: string | null;
  actualBirthDate: string | null;
  canWrite: boolean;
  /** Server Action already bound with the mutation intention. */
  action?: (formData: FormData) => void | Promise<void>;
  status?: string | null;
};

function parseSuccessOutcome(
  status: string | null | undefined,
): LitterGestationAnchorBusinessOutcome | null {
  if (!status) return null;
  const head = status.split("|")[0] ?? "";
  if (!head.startsWith("success_")) return null;
  const outcome = head.slice("success_".length);
  if (
    outcome === "updated_without_plan" ||
    outcome === "recalculated" ||
    outcome === "unchanged"
  ) {
    return outcome;
  }
  return null;
}

function parseSuccessCounters(
  status: string | null | undefined,
): LitterGestationAnchorCounters | null {
  if (!status?.includes("|")) return null;
  const parts = Object.fromEntries(
    status
      .split("|")
      .slice(1)
      .map((part) => {
        const [key, value] = part.split("=");
        return [key, Number(value)];
      }),
  );
  return {
    recalculatedItemCount: parts.items ?? 0,
    changedTaskCount: parts.changed ?? 0,
    movedAutomaticScheduleCount: parts.moved ?? 0,
    preservedManualScheduleCount: parts.manual ?? 0,
    preservedLockedScheduleCount: parts.locked ?? 0,
    preservedTerminalCount: parts.terminal ?? 0,
    unchangedTaskCount: parts.unchanged ?? 0,
  };
}

function MatingOriginNote({ motherId }: { motherId: string | null }) {
  if (motherId) {
    return (
      <p className="mt-1 text-xs text-muted">
        Issue du module{" "}
        <Link
          href={`/animals/${motherId}/reproduction`}
          className="font-medium text-accent hover:underline"
          data-testid="gestation-reproduction-link"
        >
          Reproduction
        </Link>
        .
      </p>
    );
  }

  return (
    <p
      className="mt-1 text-xs text-muted"
      data-testid="gestation-reproduction-nolink"
    >
      Les saillies se gèrent depuis la fiche de la reproductrice.
    </p>
  );
}

function GestationDatesPresentation({
  litterId,
  motherId,
  matingDate,
  matingDate2,
  estimatedOvulationDate,
  expectedBirthDate,
  actualBirthDate,
  editable,
}: {
  litterId: string;
  motherId: string | null;
  matingDate: string | null;
  matingDate2: string | null;
  estimatedOvulationDate: string | null;
  expectedBirthDate: string | null;
  actualBirthDate: string | null;
  editable: boolean;
}) {
  const fallbackHint = expectedBirthFallbackHint({
    expectedBirthDate,
    estimatedOvulationDate,
    matingDate,
  });

  return (
    <div className="grid gap-5 sm:grid-cols-2" data-testid="gestation-anchors-panel">
      <div>
        <p className={labelClass}>Première saillie</p>
        <p className={readonlyClass} data-testid="gestation-mating-date-readonly">
          {matingDate ? formatLitterDate(matingDate) : "Non renseignée"}
        </p>
        <MatingOriginNote motherId={motherId} />
      </div>

      <div>
        <p className={labelClass}>Deuxième saillie</p>
        <p className={readonlyClass} data-testid="gestation-mating-date-2-readonly">
          {matingDate2 ? formatLitterDate(matingDate2) : "Non renseignée"}
        </p>
        <MatingOriginNote motherId={motherId} />
      </div>

      <div>
        {editable ? (
          <>
            <label htmlFor="gestation-estimated-ovulation" className={labelClass}>
              Ovulation estimée
            </label>
            <input
              id="gestation-estimated-ovulation"
              name="estimated_ovulation_date"
              type="date"
              defaultValue={explicitEstimatedOvulationFieldValue(
                estimatedOvulationDate,
              )}
              className={inputClass}
              data-testid="gestation-estimated-ovulation-input"
            />
          </>
        ) : (
          <>
            <p className={labelClass}>Ovulation estimée</p>
            <p
              className={readonlyClass}
              data-testid="gestation-estimated-ovulation-readonly"
            >
              {estimatedOvulationDate
                ? formatLitterDate(estimatedOvulationDate)
                : "Non renseignée"}
            </p>
          </>
        )}
      </div>

      <div>
        {editable ? (
          <>
            <label htmlFor="gestation-expected-birth" className={labelClass}>
              Mise-bas prévue
            </label>
            <input
              id="gestation-expected-birth"
              name="expected_birth_date"
              type="date"
              defaultValue={explicitExpectedBirthFieldValue(expectedBirthDate)}
              className={inputClass}
              data-testid="gestation-expected-birth-input"
            />
          </>
        ) : (
          <>
            <p className={labelClass}>Mise-bas prévue</p>
            <p
              className={readonlyClass}
              data-testid="gestation-expected-birth-readonly"
            >
              {expectedBirthDate
                ? formatLitterDate(expectedBirthDate)
                : "Non renseignée"}
            </p>
          </>
        )}
        {fallbackHint ? (
          <p
            className="mt-1 text-xs text-muted"
            data-testid="gestation-expected-birth-hint"
          >
            {fallbackHint}
          </p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <p className={labelClass}>Naissance réelle</p>
        <p className={readonlyClass} data-testid="gestation-actual-birth-readonly">
          {actualBirthDate ? formatLitterDate(actualBirthDate) : "Non renseignée"}
        </p>
        <p className="mt-1 text-xs text-muted">
          Issue du{" "}
          <Link
            href={`/litters/journal?litter=${litterId}`}
            className="font-medium text-accent hover:underline"
            data-testid="gestation-journal-link"
          >
            Journal de mise-bas
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function LitterGestationAnchorsSection({
  litterId,
  motherId,
  matingDate,
  matingDate2,
  estimatedOvulationDate,
  expectedBirthDate,
  actualBirthDate,
  canWrite,
  action,
  status,
}: LitterGestationAnchorsSectionProps) {
  const successOutcome = parseSuccessOutcome(status);
  const successCounters = parseSuccessCounters(status);
  const errorCode = status?.split("|")[0] ?? status;
  const errorMessage =
    errorCode && !successOutcome && errorCode !== "success"
      ? gestationAnchorRecalculationErrorMessage(errorCode)
      : null;
  const successMessage = successOutcome
    ? gestationAnchorRecalculationSuccessMessage(
        successOutcome,
        successCounters ?? {
          recalculatedItemCount: 0,
          changedTaskCount: 0,
          movedAutomaticScheduleCount: 0,
          preservedManualScheduleCount: 0,
          preservedLockedScheduleCount: 0,
          preservedTerminalCount: 0,
          unchangedTaskCount: 0,
        },
      ).message
    : null;

  const presentation = (
    <GestationDatesPresentation
      litterId={litterId}
      motherId={motherId}
      matingDate={matingDate}
      matingDate2={matingDate2}
      estimatedOvulationDate={estimatedOvulationDate}
      expectedBirthDate={expectedBirthDate}
      actualBirthDate={actualBirthDate}
      editable={canWrite && Boolean(action)}
    />
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        La modification de l’ovulation estimée ou de la date prévue de mise-bas
        recalcule les suggestions du planning. Les dates choisies manuellement
        et les dates verrouillées sont conservées. Ces dates ne constituent pas
        une certitude médicale.
      </p>

      {successMessage ? (
        <p
          role="status"
          data-testid="gestation-anchors-success"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        >
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          data-testid="gestation-anchors-error"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {errorMessage}
        </p>
      ) : null}

      {canWrite && action ? (
        <form action={action} className="space-y-5" data-testid="gestation-anchors-form">
          {presentation}
          <div className="flex justify-end border-t pt-6">
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              data-testid="gestation-anchors-submit"
            >
              Enregistrer les dates de gestation
            </button>
          </div>
        </form>
      ) : (
        <div data-testid="gestation-anchors-readonly">
          {presentation}
          <p className="mt-5 text-sm text-muted">
            Lecture seule — votre rôle ne permet pas de modifier ces dates.
          </p>
        </div>
      )}
    </div>
  );
}

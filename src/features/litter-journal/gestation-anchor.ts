/**
 * Pure civil-date resolution of the biological gestation anchor (J0).
 *
 * Priority:
 * 1. explicit `estimated_ovulation_date` (no adjustment)
 * 2. otherwise `mating_date - 1 day` (derived provisional anchor)
 * 3. otherwise missing — never invent a date, never use `mating_date_2`
 *
 * The derived date must NOT be written to `litters.estimated_ovulation_date`.
 */

export type GestationAnchorInput = {
  estimatedOvulationDate?: string | null;
  matingDate?: string | null;
  /** Intentionally ignored — second mating is never a biological fallback. */
  matingDate2?: string | null;
};

export type GestationAnchorResolution =
  | {
      outcome: "resolved";
      date: string;
      source: "estimated_ovulation";
      sourceDate: string;
      adjustmentDays: 0;
      isDerived: false;
    }
  | {
      outcome: "resolved";
      date: string;
      source: "first_mating_minus_24h";
      sourceDate: string;
      adjustmentDays: -1;
      isDerived: true;
    }
  | {
      outcome: "missing";
    };

function isCivilDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseCivilDate(value: string | null | undefined): string | null {
  return isCivilDate(value) ? value : null;
}

/** Add civil calendar days using UTC arithmetic (timezone-independent). */
export function addGestationAnchorCivilDays(
  value: string,
  offsetDays: number,
): string | null {
  if (!isCivilDate(value) || !Number.isInteger(offsetDays)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

/**
 * Resolve the biological J0 anchor for gestation calculations.
 * Pure: does not mutate `input` and ignores `matingDate2`.
 */
export function resolveGestationAnchor(
  input: GestationAnchorInput,
): GestationAnchorResolution {
  const ovulation = parseCivilDate(input.estimatedOvulationDate);
  if (ovulation) {
    return {
      outcome: "resolved",
      date: ovulation,
      source: "estimated_ovulation",
      sourceDate: ovulation,
      adjustmentDays: 0,
      isDerived: false,
    };
  }

  const mating = parseCivilDate(input.matingDate);
  if (mating) {
    const derived = addGestationAnchorCivilDays(mating, -1);
    if (!derived) {
      return { outcome: "missing" };
    }
    return {
      outcome: "resolved",
      date: derived,
      source: "first_mating_minus_24h",
      sourceDate: mating,
      adjustmentDays: -1,
      isDerived: true,
    };
  }

  return { outcome: "missing" };
}

/** Convenience: civil J0 date or null. */
export function resolveGestationAnchorDate(
  input: GestationAnchorInput,
): string | null {
  const resolved = resolveGestationAnchor(input);
  return resolved.outcome === "resolved" ? resolved.date : null;
}

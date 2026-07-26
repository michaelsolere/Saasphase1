/**
 * Pure civil-date resolution of the expected_birth planning anchor.
 *
 * Priority:
 * 1. explicit `expected_birth_date` (no adjustment)
 * 2. otherwise `estimated_ovulation_date + 63 days`
 * 3. otherwise `mating_date + 62 days` (J0 = first mating − 1, J63 = mating + 62)
 * 4. otherwise missing — never invent a date, never use `mating_date_2`
 *
 * Derived dates must NOT be written to `litters.expected_birth_date`.
 */

import { addGestationAnchorCivilDays } from "./gestation-anchor";

export type ExpectedBirthAnchorInput = {
  expectedBirthDate?: string | null;
  estimatedOvulationDate?: string | null;
  matingDate?: string | null;
  /** Intentionally ignored — second mating is never a birth-date fallback. */
  matingDate2?: string | null;
};

export type ExpectedBirthAnchorResolution =
  | {
      outcome: "resolved";
      date: string;
      source: "expected_birth";
      sourceDate: string;
      adjustmentDays: 0;
      isDerived: false;
    }
  | {
      outcome: "resolved";
      date: string;
      source: "estimated_ovulation";
      sourceDate: string;
      adjustmentDays: 63;
      isDerived: true;
    }
  | {
      outcome: "resolved";
      date: string;
      source: "first_mating";
      sourceDate: string;
      adjustmentDays: 62;
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

/**
 * Resolve the expected_birth planning anchor.
 * Pure: does not mutate `input` and ignores `matingDate2`.
 */
export function resolveExpectedBirthAnchor(
  input: ExpectedBirthAnchorInput,
): ExpectedBirthAnchorResolution {
  const expectedBirth = parseCivilDate(input.expectedBirthDate);
  if (expectedBirth) {
    return {
      outcome: "resolved",
      date: expectedBirth,
      source: "expected_birth",
      sourceDate: expectedBirth,
      adjustmentDays: 0,
      isDerived: false,
    };
  }

  const ovulation = parseCivilDate(input.estimatedOvulationDate);
  if (ovulation) {
    const derived = addGestationAnchorCivilDays(ovulation, 63);
    if (!derived) {
      return { outcome: "missing" };
    }
    return {
      outcome: "resolved",
      date: derived,
      source: "estimated_ovulation",
      sourceDate: ovulation,
      adjustmentDays: 63,
      isDerived: true,
    };
  }

  const mating = parseCivilDate(input.matingDate);
  if (mating) {
    const derived = addGestationAnchorCivilDays(mating, 62);
    if (!derived) {
      return { outcome: "missing" };
    }
    return {
      outcome: "resolved",
      date: derived,
      source: "first_mating",
      sourceDate: mating,
      adjustmentDays: 62,
      isDerived: true,
    };
  }

  return { outcome: "missing" };
}

/** Convenience: civil expected-birth planning date or null. */
export function resolveExpectedBirthAnchorDate(
  input: ExpectedBirthAnchorInput,
): string | null {
  const resolved = resolveExpectedBirthAnchor(input);
  return resolved.outcome === "resolved" ? resolved.date : null;
}

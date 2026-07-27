/**
 * Pure TypeScript mirror of `public.resolve_litter_plan_anchor`.
 * Never uses mating_date_2. Does not persist projected dates.
 */

import { addGestationAnchorCivilDays } from "./gestation-anchor";
import type { LitterPlanningModelAnchor } from "./litter-planning-models-core";

export type LitterPlanAnchorInput = {
  estimatedOvulationDate?: string | null;
  expectedBirthDate?: string | null;
  matingDate?: string | null;
  actualBirthDate?: string | null;
  /** Intentionally ignored — second mating is never a biological fallback. */
  matingDate2?: string | null;
};

export type LitterPlanAnchorResolution =
  | {
      outcome: "resolved";
      date: string;
      resolutionSource: string;
      sourceDate: string;
      adjustmentDays: number;
    }
  | { outcome: "missing" };

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

export function resolveLitterPlanAnchor(
  anchorType: LitterPlanningModelAnchor | string,
  input: LitterPlanAnchorInput,
): LitterPlanAnchorResolution {
  const ovulation = parseCivilDate(input.estimatedOvulationDate);
  const expectedBirth = parseCivilDate(input.expectedBirthDate);
  const mating = parseCivilDate(input.matingDate);
  const actualBirth = parseCivilDate(input.actualBirthDate);

  if (anchorType === "first_mating" && mating) {
    return {
      outcome: "resolved",
      date: mating,
      resolutionSource: "first_mating",
      sourceDate: mating,
      adjustmentDays: 0,
    };
  }

  if (anchorType === "estimated_ovulation") {
    if (ovulation) {
      return {
        outcome: "resolved",
        date: ovulation,
        resolutionSource: "estimated_ovulation",
        sourceDate: ovulation,
        adjustmentDays: 0,
      };
    }
    if (mating) {
      const derived = addGestationAnchorCivilDays(mating, -1);
      if (!derived) return { outcome: "missing" };
      return {
        outcome: "resolved",
        date: derived,
        resolutionSource: "first_mating_minus_24h",
        sourceDate: mating,
        adjustmentDays: -1,
      };
    }
    return { outcome: "missing" };
  }

  if (anchorType === "expected_birth") {
    if (expectedBirth) {
      return {
        outcome: "resolved",
        date: expectedBirth,
        resolutionSource: "expected_birth",
        sourceDate: expectedBirth,
        adjustmentDays: 0,
      };
    }
    if (ovulation) {
      const derived = addGestationAnchorCivilDays(ovulation, 63);
      if (!derived) return { outcome: "missing" };
      return {
        outcome: "resolved",
        date: derived,
        resolutionSource: "estimated_ovulation",
        sourceDate: ovulation,
        adjustmentDays: 63,
      };
    }
    if (mating) {
      const derived = addGestationAnchorCivilDays(mating, 62);
      if (!derived) return { outcome: "missing" };
      return {
        outcome: "resolved",
        date: derived,
        resolutionSource: "first_mating",
        sourceDate: mating,
        adjustmentDays: 62,
      };
    }
    return { outcome: "missing" };
  }

  if (
    (anchorType === "actual_birth" || anchorType === "offspring_age") &&
    actualBirth
  ) {
    return {
      outcome: "resolved",
      date: actualBirth,
      resolutionSource: "actual_birth",
      sourceDate: actualBirth,
      adjustmentDays: 0,
    };
  }

  return { outcome: "missing" };
}

export function resolveLitterPlanAnchorDate(
  anchorType: LitterPlanningModelAnchor | string,
  input: LitterPlanAnchorInput,
): string | null {
  const resolved = resolveLitterPlanAnchor(anchorType, input);
  return resolved.outcome === "resolved" ? resolved.date : null;
}

/**
 * Pure projection of gestation-anchor recalculation outcomes and UI copy.
 */

export type LitterGestationAnchorBusinessOutcome =
  | "updated_without_plan"
  | "recalculated"
  | "unchanged";

export type LitterGestationAnchorErrorReason =
  | "stale_litter"
  | "stale_plan"
  | "anchor_unavailable"
  | "client_command_conflict"
  | "invalid_input"
  | "membership_required"
  | "not_found"
  | "not_authenticated";

export type LitterGestationAnchorCounters = {
  recalculatedItemCount: number;
  changedTaskCount: number;
  movedAutomaticScheduleCount: number;
  preservedManualScheduleCount: number;
  preservedLockedScheduleCount: number;
  preservedTerminalCount: number;
  unchangedTaskCount: number;
};

export type LitterGestationAnchorSuccessMessage = {
  outcome: LitterGestationAnchorBusinessOutcome;
  message: string;
};

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseOptionalCivilDate(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!CIVIL_DATE.test(trimmed)) return "invalid";
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(5, 7));
  const day = Number(trimmed.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "invalid";
  }
  return trimmed;
}

/**
 * Explicit persisted expected_birth_date must never be prefilled from a derived
 * ovulation+63 / mating+62 value — only the stored explicit value is shown.
 */
export function explicitExpectedBirthFieldValue(
  expectedBirthDate: string | null | undefined,
): string {
  const parsed = parseOptionalCivilDate(expectedBirthDate ?? null);
  return parsed && parsed !== "invalid" ? parsed : "";
}

export function explicitEstimatedOvulationFieldValue(
  estimatedOvulationDate: string | null | undefined,
): string {
  const parsed = parseOptionalCivilDate(estimatedOvulationDate ?? null);
  return parsed && parsed !== "invalid" ? parsed : "";
}

export function expectedBirthFallbackHint(input: {
  expectedBirthDate?: string | null;
  estimatedOvulationDate?: string | null;
  matingDate?: string | null;
}): string | null {
  const explicit = parseOptionalCivilDate(input.expectedBirthDate ?? null);
  if (explicit && explicit !== "invalid") return null;
  const ovulation = parseOptionalCivilDate(input.estimatedOvulationDate ?? null);
  if (ovulation && ovulation !== "invalid") {
    return "Sans date prévue explicite, le planning utilise ovulation + 63 jours.";
  }
  const mating = parseOptionalCivilDate(input.matingDate ?? null);
  if (mating && mating !== "invalid") {
    return "Sans date prévue explicite, le planning utilise première saillie + 62 jours.";
  }
  return null;
}

export function gestationAnchorRecalculationSuccessMessage(
  outcome: LitterGestationAnchorBusinessOutcome,
  counters: LitterGestationAnchorCounters,
): LitterGestationAnchorSuccessMessage {
  if (outcome === "unchanged") {
    return {
      outcome,
      message:
        "Aucune modification de date ni de planning n’était nécessaire.",
    };
  }

  if (outcome === "updated_without_plan") {
    return {
      outcome,
      message:
        "Dates enregistrées. Aucun planning actif n’était associé à cette portée.",
    };
  }

  const preserved =
    counters.preservedManualScheduleCount + counters.preservedLockedScheduleCount;
  let message = `Dates enregistrées. Le planning a été recalculé : ${counters.changedTaskCount} suggestion(s) mises à jour et ${counters.movedAutomaticScheduleCount} programmation(s) automatiques déplacées.`;
  if (preserved > 0) {
    message += ` ${preserved} programmation(s) manuelles ou verrouillées ont été conservées.`;
  }
  return { outcome, message };
}

export function gestationAnchorRecalculationErrorMessage(
  reason: LitterGestationAnchorErrorReason | string | null | undefined,
): string {
  switch (reason) {
    case "stale_litter":
    case "stale_plan":
      return "La portée ou son planning a été modifié depuis l’ouverture de la page. Rechargez avant de recommencer.";
    case "anchor_unavailable":
      return "Ces dates ne permettent plus de recalculer le planning actuel. Aucune modification n’a été enregistrée.";
    case "membership_required":
      return "Vous n’avez pas l’autorisation de modifier ces dates.";
    case "client_command_conflict":
      return "Une opération concurrente entre en conflit. Rechargez avant de recommencer.";
    case "not_found":
      return "Portée introuvable ou inaccessible.";
    default:
      return "Impossible d’enregistrer les dates de gestation pour le moment.";
  }
}

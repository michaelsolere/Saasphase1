import type { LitterCareTaskCategory, LitterCareTaskTargetScope } from "./litter-care-tasks-core";

export type LitterPlanSeriesState =
  | "active"
  | "suspended"
  | "completed"
  | "cancelled"
  | "not_applicable";

export type LitterPlanSeriesEndKind =
  | "fixed_end_offset"
  | "fixed_recurrence_day_count"
  | "actual_birth";

export type LitterPlanSeriesActionKind =
  | "suspend"
  | "resume"
  | "materialize"
  | "complete"
  | "cancel"
  | "not_applicable";

export type LitterPlanSeriesOccurrenceCounts = {
  total: number;
  planned: number;
  done: number;
  cancelled: number;
  notApplicable: number;
};

export type LitterPlanSeriesNextOccurrence = {
  plannedFor: string;
  scheduledLocalTime: string | null;
};

export type LitterPlanSeriesSummary = {
  id: string;
  revisionNo: number;
  title: string;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  state: LitterPlanSeriesState;
  endKind: LitterPlanSeriesEndKind;
  recurrenceIntervalDays: number;
  recurrenceDayCount: number | null;
  startsOn: string | null;
  endsOn: string | null;
  materializedThrough: string | null;
  absoluteMaxOccurrences: number;
  initialMaterializationHorizonDays: number;
  timeSlots: string[];
  occurrenceCounts: LitterPlanSeriesOccurrenceCounts;
  nextOccurrence: LitterPlanSeriesNextOccurrence | null;
  anchorPending: boolean;
};

export type LitterPlanSeriesSummariesResult =
  | {
      outcome: "success";
      role: "owner" | "admin" | "member" | "viewer";
      series: LitterPlanSeriesSummary[];
    }
  | {
      outcome: "error";
      error: {
        code:
          | "invalid_input"
          | "unauthenticated"
          | "forbidden"
          | "not_found"
          | "database_error";
        message: string;
      };
    };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function formatLitterPlanSeriesLocalTime(value: string): string {
  const match = TIME.exec(value.trim());
  if (!match) return value;
  return `${match[1]} h ${match[2]}`;
}

export function formatLitterPlanSeriesTimeSlots(slots: string[]): string {
  if (slots.length === 0) return "";
  const labels = slots.map(formatLitterPlanSeriesLocalTime);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

export function formatLitterPlanSeriesFrequencyLabel(
  intervalDays: number,
): string {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    return "Fréquence indisponible";
  }
  if (intervalDays === 1) return "Tous les jours";
  return `Tous les ${intervalDays} jours`;
}

export function formatLitterPlanSeriesScheduleLabel(input: {
  recurrenceIntervalDays: number;
  timeSlots: string[];
}): string {
  const frequency = formatLitterPlanSeriesFrequencyLabel(
    input.recurrenceIntervalDays,
  );
  const times = formatLitterPlanSeriesTimeSlots(input.timeSlots);
  return times ? `${frequency} · ${times}` : frequency;
}

export function formatLitterPlanSeriesEndLabel(input: {
  endKind: LitterPlanSeriesEndKind;
  endsOn: string | null;
  recurrenceDayCount: number | null;
}): string {
  if (input.endKind === "actual_birth") {
    return "Jusqu’à la mise-bas réelle";
  }
  if (input.endKind === "fixed_recurrence_day_count") {
    const days = input.recurrenceDayCount;
    if (!days || days < 1) return "Fin de suivi indisponible";
    return `Pendant ${days} jour${days === 1 ? "" : "s"} de suivi`;
  }
  if (input.endsOn && DATE.test(input.endsOn)) {
    return `Jusqu’au ${formatCivilDateFr(input.endsOn)}`;
  }
  return "Fin de suivi indisponible";
}

export function formatLitterPlanSeriesStateLabel(
  state: LitterPlanSeriesState,
): string {
  switch (state) {
    case "active":
      return "Actif";
    case "suspended":
      return "Suspendu";
    case "completed":
      return "Terminé";
    case "cancelled":
      return "Annulé";
    case "not_applicable":
      return "Non applicable";
  }
}

export function formatLitterPlanSeriesHorizonLabel(
  materializedThrough: string | null,
): string {
  if (!materializedThrough || !DATE.test(materializedThrough)) {
    return "Aucun horizon préparé";
  }
  return `Préparé jusqu’au ${formatCivilDateFr(materializedThrough)}`;
}

export function formatLitterPlanSeriesAnchorPendingLabel(): string {
  return "En attente de l’ancre";
}

export function formatLitterPlanSeriesAnchorUnavailableMessage(): string {
  return "Le suivi ne peut pas encore être programmé : la date d’ancrage n’est pas renseignée.";
}

export function isLitterPlanSeriesTerminalState(
  state: LitterPlanSeriesState,
): boolean {
  return (
    state === "completed" ||
    state === "cancelled" ||
    state === "not_applicable"
  );
}

export function getLitterPlanSeriesAvailableActions(input: {
  state: LitterPlanSeriesState;
  canWrite: boolean;
}): LitterPlanSeriesActionKind[] {
  if (!input.canWrite || isLitterPlanSeriesTerminalState(input.state)) {
    return [];
  }
  if (input.state === "active") {
    return [
      "suspend",
      "materialize",
      "complete",
      "cancel",
      "not_applicable",
    ];
  }
  if (input.state === "suspended") {
    return ["resume", "complete", "cancel", "not_applicable"];
  }
  return [];
}

/** Propose a civil through date for extending materialization without writing. */
export function proposeLitterPlanSeriesMaterializeThrough(input: {
  startsOn: string | null;
  endsOn: string | null;
  materializedThrough: string | null;
  recurrenceIntervalDays: number;
  absoluteMaxOccurrences: number;
  timeSlotCount: number;
  initialMaterializationHorizonDays: number;
}): string | null {
  if (!input.startsOn || !DATE.test(input.startsOn)) return null;
  if (
    !Number.isInteger(input.recurrenceIntervalDays) ||
    input.recurrenceIntervalDays < 1 ||
    !Number.isInteger(input.absoluteMaxOccurrences) ||
    input.absoluteMaxOccurrences < 1 ||
    !Number.isInteger(input.timeSlotCount) ||
    input.timeSlotCount < 1 ||
    !Number.isInteger(input.initialMaterializationHorizonDays) ||
    input.initialMaterializationHorizonDays < 1
  ) {
    return null;
  }

  const hasExistingHorizon =
    Boolean(input.materializedThrough) &&
    DATE.test(input.materializedThrough!);

  let proposed: string | null;
  if (hasExistingHorizon) {
    const extensionDays = Math.min(
      Math.max(input.initialMaterializationHorizonDays, 1),
      14,
    );
    proposed = addCivilDays(input.materializedThrough!, extensionDays);
  } else {
    // Inclusive first horizon: startsOn + (horizonDays - 1)
    proposed = addCivilDays(
      input.startsOn,
      input.initialMaterializationHorizonDays - 1,
    );
  }
  if (!proposed) return null;

  if (input.endsOn && DATE.test(input.endsOn) && proposed > input.endsOn) {
    proposed = input.endsOn;
  }

  const terminalDayNo = Math.ceil(
    input.absoluteMaxOccurrences / input.timeSlotCount,
  );
  const absoluteMaxDate = addCivilDays(
    input.startsOn,
    (terminalDayNo - 1) * input.recurrenceIntervalDays,
  );
  if (absoluteMaxDate && proposed > absoluteMaxDate) {
    proposed = absoluteMaxDate;
  }

  return proposed;
}

export function formatCivilDateFr(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function addCivilDays(isoDate: string, days: number): string | null {
  if (!DATE.test(isoDate) || !Number.isInteger(days)) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

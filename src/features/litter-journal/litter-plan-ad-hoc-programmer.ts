import type {
  LitterCareTaskCategory,
  LitterCareTaskPriority,
  LitterCareTaskTargetScope,
} from "./litter-care-tasks-core";
import {
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_PRIORITIES,
  LITTER_CARE_TASK_TARGET_SCOPES,
} from "./litter-care-tasks-core";
import {
  countLitterPlanAdHocOccurrences,
  litterPlanAdHocInitialHorizonDays,
  normalizeLitterPlanAdHocItemPayload,
  normalizeLitterPlanAdHocTimeSlots,
  type LitterPlanAdHocErrorCode,
  type LitterPlanAdHocItemPayload,
} from "./litter-plan-ad-hoc";
import type {
  InteractiveLitterPlanTimeline,
  InteractiveTimelineItem,
} from "./litter-plan-timeline-interaction";
import {
  addCivilDays,
  civilDayDelta,
  civilInclusiveDurationDays,
} from "./litter-plan-timeline-interaction";
import { litterPlanSeriesInitialThroughDate } from "./litter-plans-core";

export type LitterPlanAdHocProgrammerKind =
  | "milestone"
  | "task"
  | "window"
  | "recurring_task";

export type LitterPlanAdHocProgrammerEndKind =
  | "fixed_end_date"
  | "fixed_recurrence_day_count";

export type LitterPlanAdHocProgrammerFormState = {
  kind: LitterPlanAdHocProgrammerKind;
  title: string;
  description: string;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  priority: LitterCareTaskPriority;
  lockSchedule: boolean;
  scheduledDate: string;
  localTime: string;
  startsOn: string;
  startsLocalTime: string;
  endsOn: string;
  endsLocalTime: string;
  recurringStartsOn: string;
  intervalDays: string;
  endKind: LitterPlanAdHocProgrammerEndKind;
  recurringEndsOn: string;
  recurrenceDayCount: string;
  timeSlots: string[];
};

export type LitterPlanAdHocProgrammerFieldError = {
  field: string;
  message: string;
};

export type LitterPlanAdHocProgrammerValidation =
  | { ok: true; payload: LitterPlanAdHocItemPayload }
  | { ok: false; errors: LitterPlanAdHocProgrammerFieldError[]; message: string };

export type LitterPlanAdHocProgrammerOccurrenceEstimate = {
  total: number | null;
  exceedsCeiling: boolean;
  initialPrepared: number | null;
  horizonDays: number | null;
  lastDate: string | null;
  sortedSlots: string[] | null;
};

export type LitterPlanAdHocProgrammerPreview = {
  publicKey: string;
  kind: LitterPlanAdHocProgrammerKind;
  title: string;
  category: LitterCareTaskCategory;
  startDate: string;
  endDate: string;
  geometryKind: "point" | "window";
  statusLabel: "Aperçu — non enregistré";
  panelSummary: {
    kindLabel: string;
    title: string;
    timingLine: string;
  };
  recurringDetails: {
    cadenceLabel: string;
    slotsLabel: string;
    totalOccurrences: number;
    initialPrepared: number;
    horizonDays: number;
  } | null;
};

export type LitterPlanAdHocProgrammerKindChoice = {
  kind: LitterPlanAdHocProgrammerKind;
  title: string;
  description: string;
};

export const LITTER_PLAN_AD_HOC_PROGRAMMER_KIND_CHOICES: LitterPlanAdHocProgrammerKindChoice[] =
  [
    {
      kind: "milestone",
      title: "Jalon",
      description: "Repère important à une date précise",
    },
    {
      kind: "task",
      title: "Tâche",
      description: "Action ponctuelle à réaliser",
    },
    {
      kind: "window",
      title: "Période",
      description: "Suivi compris entre deux dates",
    },
    {
      kind: "recurring_task",
      title: "Suivi récurrent",
      description: "Action répétée selon une cadence finie",
    },
  ];

export const litterPlanAdHocProgrammerPriorityLabels: Record<
  LitterCareTaskPriority,
  string
> = {
  normal: "Normale",
  important: "Importante",
  organization_critical: "Critique pour l’élevage",
};

export const LITTER_PLAN_AD_HOC_LOCK_HELP =
  "Une programmation verrouillée ne pourra être déplacée qu’après confirmation explicite.";

export const LITTER_PLAN_AD_HOC_RECURRENCE_DAY_COUNT_HELP =
  "Exemple : 5 crée cinq dates de suivi espacées selon la cadence choisie.";

export const LITTER_PLAN_AD_HOC_TASKS_PANEL_HINT =
  "Les nouveaux éléments se programment depuis la frise.";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const OCCURRENCE_CEILING = 500;

function isCivilDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeOptionalTime(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = TIME.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function formatCivilDateFr(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatCivilDateShortFr(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatLocalTimeFr(value: string | null): string {
  if (!value) return "";
  const match = TIME.exec(value.trim());
  if (!match) return "";
  return ` à ${match[1]} h ${match[2]}`;
}

function formatTimeSlotDisplay(value: string): string {
  const match = TIME.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : value;
}

export function litterPlanAdHocProgrammerKindLabel(
  kind: LitterPlanAdHocProgrammerKind,
): string {
  switch (kind) {
    case "milestone":
      return "Jalon";
    case "task":
      return "Tâche";
    case "window":
      return "Période";
    case "recurring_task":
      return "Suivi récurrent";
  }
}

export function buildLitterPlanAdHocProgrammerPublicKey(
  instanceKey: string,
  suffix: string,
) {
  return `programmer-${instanceKey}-${suffix}`;
}

export function buildLitterPlanAdHocProgrammerPreviewKey(instanceKey: string) {
  return `programmer-preview-${instanceKey}`;
}

export function isOpaqueLitterPlanAdHocProgrammerKey(
  value: string,
  instanceKey: string,
) {
  return (
    value === buildLitterPlanAdHocProgrammerPreviewKey(instanceKey) ||
    value.startsWith(`programmer-${instanceKey}-`)
  );
}

export function litterPlanAdHocProgrammerKeyContainsForbiddenData(
  value: string,
  forbidden: string[],
) {
  const lowered = value.toLowerCase();
  return forbidden.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    return lowered.includes(trimmed.toLowerCase());
  });
}

export function createInitialLitterPlanAdHocProgrammerFormState(
  businessDate: string,
): LitterPlanAdHocProgrammerFormState {
  const date = isCivilDate(businessDate) ? businessDate : "";
  return {
    kind: "task",
    title: "",
    description: "",
    category: "preparation",
    targetScope: "litter",
    priority: "normal",
    lockSchedule: false,
    scheduledDate: date,
    localTime: "",
    startsOn: date,
    startsLocalTime: "",
    endsOn: date,
    endsLocalTime: "",
    recurringStartsOn: date,
    intervalDays: "1",
    endKind: "fixed_recurrence_day_count",
    recurringEndsOn: date,
    recurrenceDayCount: "7",
    timeSlots: ["08:00"],
  };
}

function defaultFieldsForKind(
  kind: LitterPlanAdHocProgrammerKind,
  businessDate: string,
): Pick<
  LitterPlanAdHocProgrammerFormState,
  | "scheduledDate"
  | "localTime"
  | "startsOn"
  | "startsLocalTime"
  | "endsOn"
  | "endsLocalTime"
  | "recurringStartsOn"
  | "intervalDays"
  | "endKind"
  | "recurringEndsOn"
  | "recurrenceDayCount"
  | "timeSlots"
> {
  const date = isCivilDate(businessDate) ? businessDate : "";
  return {
    scheduledDate: date,
    localTime: "",
    startsOn: date,
    startsLocalTime: "",
    endsOn: date,
    endsLocalTime: "",
    recurringStartsOn: date,
    intervalDays: "1",
    endKind: "fixed_recurrence_day_count",
    recurringEndsOn: date,
    recurrenceDayCount: "7",
    timeSlots: ["08:00"],
  };
}

/** Keeps common fields; resets kind-specific fields to defaults for the new kind. */
export function changeLitterPlanAdHocProgrammerKind(
  state: LitterPlanAdHocProgrammerFormState,
  nextKind: LitterPlanAdHocProgrammerKind,
  businessDate: string,
): LitterPlanAdHocProgrammerFormState {
  if (state.kind === nextKind) return state;
  return {
    ...state,
    kind: nextKind,
    ...defaultFieldsForKind(nextKind, businessDate),
  };
}

export function litterPlanAdHocProgrammerRecurringLastDate(args: {
  startsOn: string;
  intervalDays: number;
  endKind: LitterPlanAdHocProgrammerEndKind;
  endsOn: string | null;
  recurrenceDayCount: number | null;
}): string | null {
  if (
    !isCivilDate(args.startsOn) ||
    !Number.isInteger(args.intervalDays) ||
    args.intervalDays < 1 ||
    args.intervalDays > 365
  ) {
    return null;
  }

  if (args.endKind === "fixed_end_date") {
    if (!args.endsOn || !isCivilDate(args.endsOn) || args.endsOn < args.startsOn) {
      return null;
    }
    const diff = civilDayDelta(args.startsOn, args.endsOn);
    if (diff === null || diff < 0) return null;
    const steps = Math.floor(diff / args.intervalDays);
    return addCivilDays(args.startsOn, steps * args.intervalDays);
  }

  if (
    args.endsOn !== null ||
    !Number.isInteger(args.recurrenceDayCount) ||
    (args.recurrenceDayCount as number) < 1 ||
    (args.recurrenceDayCount as number) > 500
  ) {
    return null;
  }
  return addCivilDays(
    args.startsOn,
    ((args.recurrenceDayCount as number) - 1) * args.intervalDays,
  );
}

function rawRecurringOccurrenceCount(args: {
  intervalDays: number;
  endKind: LitterPlanAdHocProgrammerEndKind;
  startsOn: string;
  endsOn: string | null;
  recurrenceDayCount: number | null;
  slotCount: number;
}): number | null {
  if (
    !Number.isInteger(args.intervalDays) ||
    args.intervalDays < 1 ||
    args.intervalDays > 365 ||
    !Number.isInteger(args.slotCount) ||
    args.slotCount < 1 ||
    args.slotCount > 8 ||
    !isCivilDate(args.startsOn)
  ) {
    return null;
  }

  if (args.endKind === "fixed_end_date") {
    if (
      args.recurrenceDayCount !== null ||
      !args.endsOn ||
      !isCivilDate(args.endsOn)
    ) {
      return null;
    }
    const diff = civilDayDelta(args.startsOn, args.endsOn);
    if (diff === null || diff < 0) return null;
    return (Math.floor(diff / args.intervalDays) + 1) * args.slotCount;
  }

  if (
    args.endsOn !== null ||
    !Number.isInteger(args.recurrenceDayCount) ||
    (args.recurrenceDayCount as number) < 1
  ) {
    return null;
  }
  return (args.recurrenceDayCount as number) * args.slotCount;
}

function countPreparedWithinHorizon(args: {
  startsOn: string;
  lastDate: string;
  intervalDays: number;
  slotCount: number;
  horizonDays: number;
}): number | null {
  const through = litterPlanSeriesInitialThroughDate(
    args.startsOn,
    args.horizonDays,
  );
  if (!through) return null;
  const effectiveThrough =
    args.lastDate < through ? args.lastDate : through;
  let recurrenceDays = 0;
  let cursor: string | null = args.startsOn;
  while (cursor && cursor <= effectiveThrough) {
    recurrenceDays += 1;
    cursor = addCivilDays(cursor, args.intervalDays);
  }
  return recurrenceDays * args.slotCount;
}

export function estimateLitterPlanAdHocProgrammerOccurrences(args: {
  startsOn: string;
  intervalDays: number;
  endKind: LitterPlanAdHocProgrammerEndKind;
  endsOn: string | null;
  recurrenceDayCount: number | null;
  timeSlots: string[];
}): LitterPlanAdHocProgrammerOccurrenceEstimate {
  const sortedSlots = normalizeLitterPlanAdHocTimeSlots(args.timeSlots);
  const lastDate = litterPlanAdHocProgrammerRecurringLastDate({
    startsOn: args.startsOn,
    intervalDays: args.intervalDays,
    endKind: args.endKind,
    endsOn: args.endsOn,
    recurrenceDayCount: args.recurrenceDayCount,
  });
  const horizonDays = litterPlanAdHocInitialHorizonDays({
    startsOn: args.startsOn,
    intervalDays: args.intervalDays,
    endKind: args.endKind,
    endsOn: args.endsOn,
    recurrenceDayCount: args.recurrenceDayCount,
  });

  if (!sortedSlots) {
    return {
      total: null,
      exceedsCeiling: false,
      initialPrepared: null,
      horizonDays,
      lastDate,
      sortedSlots: null,
    };
  }

  const rawTotal = rawRecurringOccurrenceCount({
    intervalDays: args.intervalDays,
    endKind: args.endKind,
    startsOn: args.startsOn,
    endsOn: args.endsOn,
    recurrenceDayCount: args.recurrenceDayCount,
    slotCount: sortedSlots.length,
  });

  if (rawTotal === null) {
    return {
      total: null,
      exceedsCeiling: false,
      initialPrepared: null,
      horizonDays,
      lastDate,
      sortedSlots,
    };
  }

  if (rawTotal > OCCURRENCE_CEILING) {
    return {
      total: rawTotal,
      exceedsCeiling: true,
      initialPrepared: null,
      horizonDays,
      lastDate,
      sortedSlots,
    };
  }

  const capped = countLitterPlanAdHocOccurrences({
    intervalDays: args.intervalDays,
    endKind: args.endKind,
    startsOn: args.startsOn,
    endsOn: args.endsOn,
    recurrenceDayCount: args.recurrenceDayCount,
    slotCount: sortedSlots.length,
  });

  const initialPrepared =
    lastDate && horizonDays
      ? countPreparedWithinHorizon({
          startsOn: args.startsOn,
          lastDate,
          intervalDays: args.intervalDays,
          slotCount: sortedSlots.length,
          horizonDays,
        })
      : null;

  return {
    total: capped,
    exceedsCeiling: false,
    initialPrepared,
    horizonDays,
    lastDate,
    sortedSlots,
  };
}

export function formatLitterPlanAdHocProgrammerOccurrenceEstimate(
  estimate: LitterPlanAdHocProgrammerOccurrenceEstimate,
): string | null {
  if (estimate.exceedsCeiling && estimate.total !== null) {
    return `Cette programmation dépasserait ${OCCURRENCE_CEILING} occurrences (${estimate.total}). Réduisez la cadence, les créneaux ou la durée.`;
  }
  if (
    estimate.total === null ||
    estimate.initialPrepared === null ||
    estimate.horizonDays === null
  ) {
    return null;
  }
  if (estimate.total === estimate.initialPrepared) {
    return `${estimate.total} occurrences au total\n${estimate.initialPrepared} occurrences préparées immédiatement`;
  }
  return `${estimate.total} occurrences au total\n${estimate.initialPrepared} occurrences préparées sur les ${estimate.horizonDays} premiers jours`;
}

export function formatLitterPlanAdHocProgrammerWindowDuration(
  startsOn: string,
  endsOn: string,
): string | null {
  if (!isCivilDate(startsOn) || !isCivilDate(endsOn) || startsOn > endsOn) {
    return null;
  }
  const days = civilInclusiveDurationDays(startsOn, endsOn);
  if (days === null) return null;
  const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
  const startLabel = sameYear
    ? formatCivilDateShortFr(startsOn)
    : formatCivilDateFr(startsOn);
  const endLabel = formatCivilDateShortFr(endsOn);
  return `Du ${startLabel} au ${endLabel} · ${days} jour${days === 1 ? "" : "s"}`;
}

function validateCommon(
  state: LitterPlanAdHocProgrammerFormState,
): LitterPlanAdHocProgrammerFieldError[] {
  const errors: LitterPlanAdHocProgrammerFieldError[] = [];
  const title = state.title.trim();
  if (!title || title.length > 255) {
    errors.push({
      field: "title",
      message: "Le titre est obligatoire (1 à 255 caractères).",
    });
  }
  if (state.description.trim().length > 5000) {
    errors.push({
      field: "description",
      message: "La description ne doit pas dépasser 5 000 caractères.",
    });
  }
  if (
    !LITTER_CARE_TASK_CATEGORIES.includes(
      state.category as LitterCareTaskCategory,
    )
  ) {
    errors.push({ field: "category", message: "La catégorie est invalide." });
  }
  if (
    !LITTER_CARE_TASK_TARGET_SCOPES.includes(
      state.targetScope as LitterCareTaskTargetScope,
    )
  ) {
    errors.push({ field: "target_scope", message: "La cible est invalide." });
  }
  if (
    !LITTER_CARE_TASK_PRIORITIES.includes(
      state.priority as LitterCareTaskPriority,
    )
  ) {
    errors.push({ field: "priority", message: "La priorité est invalide." });
  }
  return errors;
}

function buildCommonPayload(state: LitterPlanAdHocProgrammerFormState) {
  const description = state.description.trim();
  return {
    version: 1 as const,
    title: state.title.trim(),
    description: description.length > 0 ? description : null,
    category: state.category,
    targetScope: state.targetScope,
    priority: state.priority,
    lockSchedule: state.lockSchedule,
  };
}

export function validateLitterPlanAdHocProgrammerForm(
  state: LitterPlanAdHocProgrammerFormState,
): LitterPlanAdHocProgrammerValidation {
  const errors = validateCommon(state);

  if (state.kind === "milestone" || state.kind === "task") {
    if (!isCivilDate(state.scheduledDate)) {
      errors.push({
        field: "scheduled_date",
        message: "La date est invalide.",
      });
    }
    const localTime = normalizeOptionalTime(state.localTime);
    if (localTime === undefined) {
      errors.push({
        field: "local_time",
        message: "L’heure facultative est invalide.",
      });
    }
    if (errors.length > 0) {
      return {
        ok: false,
        errors,
        message: "Vérifiez les informations de programmation.",
      };
    }
    const payload = normalizeLitterPlanAdHocItemPayload({
      ...buildCommonPayload(state),
      kind: state.kind,
      scheduledDate: state.scheduledDate,
      localTime: localTime ?? null,
    });
    if (!payload) {
      return {
        ok: false,
        errors: [
          {
            field: "form",
            message: "Vérifiez les informations de programmation.",
          },
        ],
        message: "Vérifiez les informations de programmation.",
      };
    }
    return { ok: true, payload };
  }

  if (state.kind === "window") {
    if (!isCivilDate(state.startsOn)) {
      errors.push({
        field: "starts_on",
        message: "La date de début est invalide.",
      });
    }
    if (!isCivilDate(state.endsOn)) {
      errors.push({
        field: "ends_on",
        message: "La date de fin est invalide.",
      });
    }
    const startsLocalTime = normalizeOptionalTime(state.startsLocalTime);
    const endsLocalTime = normalizeOptionalTime(state.endsLocalTime);
    if (startsLocalTime === undefined) {
      errors.push({
        field: "starts_local_time",
        message: "L’heure de début est invalide.",
      });
    }
    if (endsLocalTime === undefined) {
      errors.push({
        field: "ends_local_time",
        message: "L’heure de fin est invalide.",
      });
    }
    if (
      isCivilDate(state.startsOn) &&
      isCivilDate(state.endsOn) &&
      state.startsOn > state.endsOn
    ) {
      errors.push({
        field: "ends_on",
        message: "La date de début doit être antérieure ou égale à la date de fin.",
      });
    }
    if (
      isCivilDate(state.startsOn) &&
      isCivilDate(state.endsOn) &&
      state.startsOn === state.endsOn &&
      startsLocalTime &&
      endsLocalTime &&
      startsLocalTime > endsLocalTime
    ) {
      errors.push({
        field: "ends_local_time",
        message:
          "Sur une même date, l’heure de début doit être inférieure ou égale à l’heure de fin.",
      });
    }
    if (errors.length > 0) {
      return {
        ok: false,
        errors,
        message: "Vérifiez les bornes de la période.",
      };
    }
    const payload = normalizeLitterPlanAdHocItemPayload({
      ...buildCommonPayload(state),
      kind: "window",
      startsOn: state.startsOn,
      endsOn: state.endsOn,
      startsLocalTime: startsLocalTime ?? null,
      endsLocalTime: endsLocalTime ?? null,
    });
    if (!payload) {
      return {
        ok: false,
        errors: [
          {
            field: "form",
            message: "Vérifiez les informations de programmation.",
          },
        ],
        message: "Vérifiez les informations de programmation.",
      };
    }
    return { ok: true, payload };
  }

  const intervalDays = Number(state.intervalDays);
  if (
    !Number.isInteger(intervalDays) ||
    intervalDays < 1 ||
    intervalDays > 365
  ) {
    errors.push({
      field: "interval_days",
      message: "La cadence doit être comprise entre 1 et 365 jours.",
    });
  }
  if (!isCivilDate(state.recurringStartsOn)) {
    errors.push({
      field: "starts_on",
      message: "La date de début est invalide.",
    });
  }

  let endsOn: string | null = null;
  let recurrenceDayCount: number | null = null;
  if (state.endKind === "fixed_end_date") {
    if (!isCivilDate(state.recurringEndsOn)) {
      errors.push({
        field: "ends_on",
        message: "La date de fin est invalide.",
      });
    } else if (
      isCivilDate(state.recurringStartsOn) &&
      state.recurringEndsOn < state.recurringStartsOn
    ) {
      errors.push({
        field: "ends_on",
        message: "La date de fin doit être postérieure ou égale au début.",
      });
    } else {
      endsOn = state.recurringEndsOn;
    }
  } else {
    const dayCount = Number(state.recurrenceDayCount);
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 500) {
      errors.push({
        field: "recurrence_day_count",
        message: "Le nombre de dates programmées est invalide.",
      });
    } else {
      recurrenceDayCount = dayCount;
    }
  }

  const slots = normalizeLitterPlanAdHocTimeSlots(state.timeSlots);
  if (!slots) {
    if (state.timeSlots.length > 8) {
      errors.push({
        field: "time_slot",
        message: "Vous pouvez ajouter au maximum 8 créneaux.",
      });
    } else if (state.timeSlots.length < 1) {
      errors.push({
        field: "time_slot",
        message: "Ajoutez au moins un créneau horaire.",
      });
    } else {
      errors.push({
        field: "time_slot",
        message:
          "Chaque créneau est obligatoire et les doublons normalisés sont refusés.",
      });
    }
  }

  const estimate = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: state.recurringStartsOn,
    intervalDays: Number.isInteger(intervalDays) ? intervalDays : 0,
    endKind: state.endKind,
    endsOn,
    recurrenceDayCount,
    timeSlots: state.timeSlots,
  });
  if (estimate.exceedsCeiling) {
    errors.push({
      field: "occurrences",
      message:
        formatLitterPlanAdHocProgrammerOccurrenceEstimate(estimate) ??
        "Trop d’occurrences.",
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      message: "Vérifiez les informations de programmation.",
    };
  }

  const payload = normalizeLitterPlanAdHocItemPayload({
    ...buildCommonPayload(state),
    kind: "recurring_task",
    startsOn: state.recurringStartsOn,
    intervalDays,
    endKind: state.endKind,
    endsOn,
    recurrenceDayCount,
    timeSlots: state.timeSlots,
  });
  if (!payload) {
    return {
      ok: false,
      errors: [
        {
          field: "form",
          message: "Vérifiez les informations de programmation.",
        },
      ],
      message: "Vérifiez les informations de programmation.",
    };
  }
  return { ok: true, payload };
}

/** Builds a local-only timeline preview when temporal fields are minimally valid. */
export function buildLitterPlanAdHocProgrammerPreview(
  state: LitterPlanAdHocProgrammerFormState,
  instanceKey: string,
): LitterPlanAdHocProgrammerPreview | null {
  const title = state.title.trim() || "Élément sans titre";
  const publicKey = buildLitterPlanAdHocProgrammerPreviewKey(instanceKey);

  if (state.kind === "milestone" || state.kind === "task") {
    if (!isCivilDate(state.scheduledDate)) return null;
    const localTime = normalizeOptionalTime(state.localTime);
    if (localTime === undefined) return null;
    return {
      publicKey,
      kind: state.kind,
      title,
      category: state.category,
      startDate: state.scheduledDate,
      endDate: state.scheduledDate,
      geometryKind: "point",
      statusLabel: "Aperçu — non enregistré",
      panelSummary: {
        kindLabel: litterPlanAdHocProgrammerKindLabel(state.kind),
        title,
        timingLine: `${formatCivilDateFr(state.scheduledDate)}${formatLocalTimeFr(localTime)}`,
      },
      recurringDetails: null,
    };
  }

  if (state.kind === "window") {
    if (
      !isCivilDate(state.startsOn) ||
      !isCivilDate(state.endsOn) ||
      state.startsOn > state.endsOn
    ) {
      return null;
    }
    const startsLocalTime = normalizeOptionalTime(state.startsLocalTime);
    const endsLocalTime = normalizeOptionalTime(state.endsLocalTime);
    if (startsLocalTime === undefined || endsLocalTime === undefined) {
      return null;
    }
    if (
      state.startsOn === state.endsOn &&
      startsLocalTime &&
      endsLocalTime &&
      startsLocalTime > endsLocalTime
    ) {
      return null;
    }
    const durationLabel = formatLitterPlanAdHocProgrammerWindowDuration(
      state.startsOn,
      state.endsOn,
    );
    if (!durationLabel) return null;
    return {
      publicKey,
      kind: "window",
      title,
      category: state.category,
      startDate: state.startsOn,
      endDate: state.endsOn,
      geometryKind: "window",
      statusLabel: "Aperçu — non enregistré",
      panelSummary: {
        kindLabel: "Période",
        title,
        timingLine: durationLabel,
      },
      recurringDetails: null,
    };
  }

  const intervalDays = Number(state.intervalDays);
  if (
    !isCivilDate(state.recurringStartsOn) ||
    !Number.isInteger(intervalDays) ||
    intervalDays < 1 ||
    intervalDays > 365
  ) {
    return null;
  }

  let endsOn: string | null = null;
  let recurrenceDayCount: number | null = null;
  if (state.endKind === "fixed_end_date") {
    if (
      !isCivilDate(state.recurringEndsOn) ||
      state.recurringEndsOn < state.recurringStartsOn
    ) {
      return null;
    }
    endsOn = state.recurringEndsOn;
  } else {
    const dayCount = Number(state.recurrenceDayCount);
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 500) {
      return null;
    }
    recurrenceDayCount = dayCount;
  }

  const estimate = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: state.recurringStartsOn,
    intervalDays,
    endKind: state.endKind,
    endsOn,
    recurrenceDayCount,
    timeSlots: state.timeSlots,
  });
  if (
    !estimate.sortedSlots ||
    estimate.lastDate === null ||
    estimate.total === null ||
    estimate.initialPrepared === null ||
    estimate.horizonDays === null ||
    estimate.exceedsCeiling
  ) {
    return null;
  }

  const slotsLabel = estimate.sortedSlots
    .map(formatTimeSlotDisplay)
    .join(", ");
  const cadenceLabel =
    intervalDays === 1 ? "Tous les jours" : `Tous les ${intervalDays} jours`;

  return {
    publicKey,
    kind: "recurring_task",
    title: "Suivi récurrent · aperçu",
    category: state.category,
    startDate: state.recurringStartsOn,
    endDate: estimate.lastDate,
    geometryKind: "window",
    statusLabel: "Aperçu — non enregistré",
    panelSummary: {
      kindLabel: "Suivi récurrent",
      title,
      timingLine: `Du ${formatCivilDateShortFr(state.recurringStartsOn)} au ${formatCivilDateShortFr(estimate.lastDate)}`,
    },
    recurringDetails: {
      cadenceLabel,
      slotsLabel,
      totalOccurrences: estimate.total,
      initialPrepared: estimate.initialPrepared,
      horizonDays: estimate.horizonDays,
    },
  };
}

function previewToTimelineItem(
  preview: LitterPlanAdHocProgrammerPreview,
): InteractiveTimelineItem {
  return {
    publicKey: preview.publicKey,
    kind:
      preview.geometryKind === "window"
        ? "window"
        : preview.kind === "milestone"
          ? "milestone"
          : "task",
    title: preview.title,
    category: preview.category,
    suggestedStartDate: preview.startDate,
    suggestedEndDate: preview.endDate,
    retainedStartDate: preview.startDate,
    retainedEndDate: preview.endDate,
    scheduleSource: "manual",
    isLocked: false,
    status: "planned",
    interactionMode: "read_only",
    readOnlyReason: null,
    statusLabel: preview.statusLabel,
  };
}

/**
 * Combines the existing interactive timeline with a local ad-hoc preview.
 * Never mutates the source timeline; preview never enters pendingAnchorItems.
 */
export function buildLitterPlanAdHocProgrammerDisplayTimeline(
  timeline: InteractiveLitterPlanTimeline | null,
  preview: LitterPlanAdHocProgrammerPreview | null,
): InteractiveLitterPlanTimeline | null {
  if (!preview) {
    return timeline
      ? {
          title: timeline.title,
          items: [...timeline.items],
          pendingAnchorItems: [...timeline.pendingAnchorItems],
        }
      : null;
  }

  const previewItem = previewToTimelineItem(preview);
  if (!timeline) {
    return {
      title: "Aperçu de programmation",
      items: [previewItem],
      pendingAnchorItems: [],
    };
  }

  return {
    title: timeline.title,
    items: [...timeline.items, previewItem],
    pendingAnchorItems: [...timeline.pendingAnchorItems],
  };
}

export function litterPlanAdHocProgrammerErrorMessage(
  code: LitterPlanAdHocErrorCode | string,
): string {
  switch (code) {
    case "invalid_input":
      return "Vérifiez les informations de programmation.";
    case "stale_revision":
      return "Le planning a été modifié ailleurs. Rechargez le Journal avant de recommencer.";
    case "client_command_conflict":
      return "Cette demande a déjà été utilisée avec un contenu différent. Rechargez le Journal.";
    case "invalid_litter":
      return "Le statut actuel de cette portée ne permet plus de programmer cet élément.";
    case "forbidden":
    case "unauthenticated":
      return "Vous n’avez pas les droits suffisants pour programmer cette portée.";
    case "not_found":
      return "Cette portée ou son planning est introuvable.";
    case "database_error":
    case "conflict":
    default:
      return "La programmation n’a pas pu être enregistrée.";
  }
}

export function litterPlanAdHocProgrammerErrorRequiresRefresh(
  code: LitterPlanAdHocErrorCode | string | undefined,
): boolean {
  return (
    code === "stale_revision" ||
    code === "client_command_conflict" ||
    code === "not_found" ||
    code === "invalid_litter" ||
    code === "forbidden" ||
    code === "unauthenticated"
  );
}

export function litterPlanAdHocProgrammerSuccessMessage(args: {
  kind: LitterPlanAdHocProgrammerKind;
  materializedOccurrenceCount?: number;
}): string {
  switch (args.kind) {
    case "milestone":
      return "Le jalon a été programmé.";
    case "task":
      return "La tâche a été programmée.";
    case "window":
      return "La période a été programmée.";
    case "recurring_task": {
      const count = args.materializedOccurrenceCount ?? 0;
      return `Le suivi récurrent a été programmé.\n${count} occurrences ont été préparées.`;
    }
  }
}

export function canShowLitterPlanAdHocProgrammer(args: {
  role: "owner" | "admin" | "member" | "viewer" | null;
  planUnavailable: boolean;
}): boolean {
  if (args.planUnavailable) return false;
  return (
    args.role === "owner" || args.role === "admin" || args.role === "member"
  );
}

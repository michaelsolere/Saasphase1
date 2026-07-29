import type {
  MaternalObservationSeverity,
  MaternalObservationTemperatureUnit,
} from "./maternal-observations-core";

export const MATERNAL_TEMPERATURE_OBSERVATION_SOURCE =
  "maternal_temperature_observation" as const;

export type MaternalTemperatureObservationTaskFact = {
  source: typeof MATERNAL_TEMPERATURE_OBSERVATION_SOURCE;
  observedAt: string;
  timezoneName: string;
  numericValue: number;
  unit: MaternalObservationTemperatureUnit;
  severity: MaternalObservationSeverity;
  note: string | null;
};

export type MaternalObservationSatisfiedTask = {
  taskTitle: string;
  occurrenceNo: number | null;
  plannedFor: string | null;
  scheduledLocalTime: string | null;
  scheduleTimezoneName: string | null;
};

export type LitterCareTaskCompletionOrigin =
  | typeof MATERNAL_TEMPERATURE_OBSERVATION_SOURCE
  | "manual"
  | "unknown";

export type TaskCompletionProjection = {
  completionOrigin: LitterCareTaskCompletionOrigin | null;
  completionFact: MaternalTemperatureObservationTaskFact | null;
};

export type MaternalObservationTaskLinkReadAvailability =
  | "available"
  | "unavailable";

type MaternalObservationProjectionSource = {
  observation_type: string;
  observed_at: string;
  timezone_name: string;
  numeric_value: number | null;
  unit: string | null;
  severity: string;
  note: string | null;
};

type LitterCareTaskProjectionSource = {
  title: string;
  item_kind: string;
  occurrence_no: number;
  planned_for: string | null;
  scheduled_local_time: string | null;
  schedule_timezone_name: string | null;
};

const SEVERITIES = new Set<MaternalObservationSeverity>([
  "routine",
  "watch",
  "concern",
  "urgent",
]);

const TEMPERATURE_UNITS = new Set<MaternalObservationTemperatureUnit>([
  "celsius",
  "fahrenheit",
]);

export function projectMaternalTemperatureObservationTaskFact(
  source: Readonly<MaternalObservationProjectionSource>,
): MaternalTemperatureObservationTaskFact | null {
  if (
    source.observation_type !== "temperature" ||
    typeof source.numeric_value !== "number" ||
    !Number.isFinite(source.numeric_value) ||
    !TEMPERATURE_UNITS.has(
      source.unit as MaternalObservationTemperatureUnit,
    ) ||
    !SEVERITIES.has(source.severity as MaternalObservationSeverity)
  ) {
    return null;
  }

  return {
    source: MATERNAL_TEMPERATURE_OBSERVATION_SOURCE,
    observedAt: source.observed_at,
    timezoneName: source.timezone_name,
    numericValue: source.numeric_value,
    unit: source.unit as MaternalObservationTemperatureUnit,
    severity: source.severity as MaternalObservationSeverity,
    note: source.note,
  };
}

export function projectMaternalObservationSatisfiedTask(
  source: Readonly<LitterCareTaskProjectionSource>,
): MaternalObservationSatisfiedTask {
  return {
    taskTitle: source.title,
    occurrenceNo:
      source.item_kind === "recurring_task" ? source.occurrence_no : null,
    plannedFor: source.planned_for,
    scheduledLocalTime: source.scheduled_local_time,
    scheduleTimezoneName: source.schedule_timezone_name,
  };
}

export function projectTaskCompletion(
  status: "planned" | "done" | "cancelled" | "not_applicable",
  availability: MaternalObservationTaskLinkReadAvailability,
  fact: MaternalTemperatureObservationTaskFact | null,
): TaskCompletionProjection {
  if (status !== "done") {
    return { completionOrigin: null, completionFact: null };
  }
  if (availability === "unavailable") {
    return { completionOrigin: "unknown", completionFact: null };
  }
  if (fact) {
    return {
      completionOrigin: MATERNAL_TEMPERATURE_OBSERVATION_SOURCE,
      completionFact: fact,
    };
  }
  return { completionOrigin: "manual", completionFact: null };
}

export function formatMaternalTemperature(
  fact: Pick<MaternalTemperatureObservationTaskFact, "numericValue" | "unit">,
) {
  const value = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 3,
  }).format(fact.numericValue);
  return `${value} ${fact.unit === "fahrenheit" ? "°F" : "°C"}`;
}

export function formatMaternalFactDateTime(
  observedAt: string,
  timezoneName: string,
) {
  const date = new Date(observedAt);
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezoneName,
  };

  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("fr-FR", options).format(date);
  } catch {
    formatted = new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
  return formatted.replace(/(\d{2}):(\d{2})/, "$1 h $2");
}

export function formatPlannedTaskDateTime(
  plannedFor: string | null,
  scheduledLocalTime: string | null,
) {
  if (!plannedFor) return "Planification indisponible";
  const [year, month, day] = plannedFor.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formattedDate = Number.isNaN(date.getTime())
    ? plannedFor
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
  const time = /^([01]\d|2[0-3]):([0-5]\d)/.exec(
    scheduledLocalTime ?? "",
  );
  return time
    ? `${formattedDate} à ${time[1]} h ${time[2]}`
    : formattedDate;
}

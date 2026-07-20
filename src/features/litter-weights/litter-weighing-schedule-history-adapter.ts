import {
  buildLitterWeighingSchedule,
  type LitterWeighingObservation,
  type LitterWeighingSchedulePolicy,
  type LitterWeighingScheduleResult,
} from "./litter-weighing-schedule-model";

export type LitterWeighingScheduleHistoryRequest = {
  todayDate: string;
  policy: LitterWeighingSchedulePolicy;
};

export type LitterWeighingScheduleHistorySession = {
  internalId: string;
  measuredAt: string;
  timezoneName: string;
  createdAt: string;
  routineMeasurementCount: number;
};

export type BuildLitterWeighingScheduleFromHistoryInput = {
  actualBirthDate: string | null;
  request: LitterWeighingScheduleHistoryRequest;
  hasBirthMeasurement: boolean;
  sessions: readonly LitterWeighingScheduleHistorySession[];
};

export type BuildLitterWeighingScheduleFromHistoryResult =
  | {
      outcome: "success";
      weighingSchedule: LitterWeighingScheduleResult;
    }
  | {
      outcome: "invalid_persisted_history";
    };

type ValidatedRoutineSession = LitterWeighingScheduleHistorySession & {
  instant: number;
  createdInstant: number;
  observedOn: string;
};

function parsePersistedInstant(value: string): number | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }

  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

function civilDateAtInstant(instant: number, timezoneName: string): string | null {
  if (typeof timezoneName !== "string" || !timezoneName.trim()) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    if (!year || !month || !day) return null;

    const civilDate = `${year}-${month}-${day}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(civilDate) ? civilDate : null;
  } catch {
    return null;
  }
}

function compareInternalIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function buildLitterWeighingScheduleFromHistory(
  input: BuildLitterWeighingScheduleFromHistoryInput,
): BuildLitterWeighingScheduleFromHistoryResult {
  const routineSessions: ValidatedRoutineSession[] = [];

  for (const session of input.sessions) {
    if (session.routineMeasurementCount < 1) continue;

    const instant = parsePersistedInstant(session.measuredAt);
    const createdInstant = parsePersistedInstant(session.createdAt);
    if (instant === null || createdInstant === null) {
      return { outcome: "invalid_persisted_history" };
    }

    const observedOn = civilDateAtInstant(instant, session.timezoneName);
    if (!observedOn) return { outcome: "invalid_persisted_history" };
    routineSessions.push({ ...session, instant, createdInstant, observedOn });
  }

  routineSessions.sort(
    (left, right) =>
      left.instant - right.instant ||
      left.createdInstant - right.createdInstant ||
      compareInternalIds(left.internalId, right.internalId),
  );

  const observations: LitterWeighingObservation[] = [];
  if (input.hasBirthMeasurement && input.actualBirthDate !== null) {
    observations.push({
      observationIndex: 0,
      observedOn: input.actualBirthDate,
      source: "birth",
    });
  }

  for (const session of routineSessions) {
    observations.push({
      observationIndex: observations.length,
      observedOn: session.observedOn,
      source: "routine",
    });
  }

  return {
    outcome: "success",
    weighingSchedule: buildLitterWeighingSchedule({
      actualBirthDate: input.actualBirthDate,
      todayDate: input.request.todayDate,
      observations,
      policy: input.request.policy,
    }),
  };
}

import type { LitterWeighingScheduleResult } from "./litter-weighing-schedule-model";

export type LitterWeighingTodayState =
  | "due_today"
  | "overdue"
  | "handled_today";

export type LitterWeighingTodayProjection = {
  litterId: string;
  litterLabel: string;
  state: LitterWeighingTodayState;
  scheduledOn: string | null;
  ageDay: number | null;
  overdueCount: number;
  sessionCount: number;
  measurementCount: number;
  latestMeasuredAt: string | null;
  latestTimezoneName: string | null;
};

export type LitterWeighingTodaySession = {
  measuredAt: string;
  timezoneName: string;
  activeRoutineMeasurementCount: number;
  cancelledAt?: string | null;
};

export type ProjectLitterWeighingTodayInput = {
  todayDate: string;
  litterId: string;
  litterLabel: string;
  weighingSchedule: LitterWeighingScheduleResult;
  sessions: readonly LitterWeighingTodaySession[];
};

function civilDateAtInstant(value: string, timezoneName: string): string | null {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !timezoneName.trim()) {
    return null;
  }

  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;

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
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function latestSession(
  sessions: readonly LitterWeighingTodaySession[],
): LitterWeighingTodaySession | null {
  let latest: LitterWeighingTodaySession | null = null;
  let latestInstant = Number.NEGATIVE_INFINITY;

  for (const session of sessions) {
    const instant = Date.parse(session.measuredAt);
    if (
      Number.isFinite(instant) &&
      (instant > latestInstant ||
        (instant === latestInstant &&
          session.timezoneName.localeCompare(latest?.timezoneName ?? "") > 0))
    ) {
      latest = session;
      latestInstant = instant;
    }
  }

  return latest;
}

export function projectLitterWeighingToday(
  input: ProjectLitterWeighingTodayInput,
): LitterWeighingTodayProjection[] {
  const litterLabel = input.litterLabel.trim() || "Portée sans nom";
  const schedule =
    input.weighingSchedule.status === "available"
      ? input.weighingSchedule.schedule
      : [];
  const dueToday = schedule.filter(({ status }) => status === "due_today");
  const overdue = schedule.filter(({ status }) => status === "overdue");
  const scheduledToday = schedule.find(
    ({ scheduledOn }) => scheduledOn === input.todayDate,
  );
  const handledSessions = input.sessions.filter(
    (session) =>
      session.cancelledAt == null &&
      Number.isInteger(session.activeRoutineMeasurementCount) &&
      session.activeRoutineMeasurementCount > 0 &&
      civilDateAtInstant(session.measuredAt, session.timezoneName) ===
        input.todayDate,
  );
  const latest = latestSession(handledSessions);
  const result: LitterWeighingTodayProjection[] = [];

  for (const item of dueToday) {
    result.push({
      litterId: input.litterId,
      litterLabel,
      state: "due_today",
      scheduledOn: item.scheduledOn,
      ageDay: item.ageDay,
      overdueCount: 0,
      sessionCount: 0,
      measurementCount: 0,
      latestMeasuredAt: null,
      latestTimezoneName: null,
    });
  }

  if (overdue.length > 0) {
    const first = overdue[0]!;
    result.push({
      litterId: input.litterId,
      litterLabel,
      state: "overdue",
      scheduledOn: first.scheduledOn,
      ageDay: first.ageDay,
      overdueCount: overdue.length,
      sessionCount: 0,
      measurementCount: 0,
      latestMeasuredAt: null,
      latestTimezoneName: null,
    });
  }

  if (handledSessions.length > 0 && latest) {
    result.push({
      litterId: input.litterId,
      litterLabel,
      state: "handled_today",
      scheduledOn: scheduledToday?.scheduledOn ?? null,
      ageDay: scheduledToday?.ageDay ?? null,
      overdueCount: 0,
      sessionCount: handledSessions.length,
      measurementCount: handledSessions.reduce(
        (count, session) => count + session.activeRoutineMeasurementCount,
        0,
      ),
      latestMeasuredAt: latest.measuredAt,
      latestTimezoneName: latest.timezoneName,
    });
  }

  return result;
}

export type LitterWeighingSchedulePhase = {
  startAgeDay: number;
  endAgeDay: number;
  intervalDays: number;
};

export type LitterWeighingSchedulePolicy = {
  phases: readonly LitterWeighingSchedulePhase[];
};

export const DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY = {
  phases: [
    { startAgeDay: 0, endAgeDay: 30, intervalDays: 1 },
    { startAgeDay: 31, endAgeDay: 60, intervalDays: 3 },
  ],
} as const satisfies LitterWeighingSchedulePolicy;

export type LitterWeighingObservationSource = "birth" | "routine";

export type LitterWeighingObservation = {
  observationIndex: number;
  observedOn: string;
  source: LitterWeighingObservationSource;
};

export type BuildLitterWeighingScheduleInput = {
  actualBirthDate: string | null;
  todayDate: string;
  observations: readonly LitterWeighingObservation[];
  policy: LitterWeighingSchedulePolicy;
};

export type LitterWeighingScheduleStatus =
  | "completed"
  | "due_today"
  | "overdue"
  | "upcoming";

export type LitterWeighingScheduleItem = {
  ageDay: number;
  scheduledOn: string;
  phaseIndex: number;
  cadence: {
    intervalDays: number;
  };
  status: LitterWeighingScheduleStatus;
  observations: LitterWeighingObservation[];
};

export type LitterWeighingExtraObservationReason =
  | "before_birth"
  | "unscheduled_day"
  | "after_schedule";

export type LitterWeighingExtraObservation = LitterWeighingObservation & {
  ageDay: number;
  reason: LitterWeighingExtraObservationReason;
};

export type LitterWeighingScheduleSummary = {
  totalScheduledCount: number;
  completedCount: number;
  dueTodayCount: number;
  overdueCount: number;
  upcomingCount: number;
  extraObservationCount: number;
  firstIncomplete: {
    ageDay: number;
    scheduledOn: string;
    status: "due_today" | "overdue" | "upcoming";
  } | null;
};

export type LitterWeighingScheduleResult =
  | {
      status: "missing_actual_birth_date";
      schedule: [];
      extraObservations: [];
    }
  | {
      status: "invalid_input";
      reason: string;
      schedule: [];
      extraObservations: [];
    }
  | {
      status: "available";
      schedule: LitterWeighingScheduleItem[];
      extraObservations: LitterWeighingExtraObservation[];
      summary: LitterWeighingScheduleSummary;
    };

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAX_PHASE_COUNT = 12;
const MAX_AGE_DAY = 365;
const MAX_SCHEDULED_COUNT = 400;

type ParsedCivilDate = {
  value: string;
  dayNumber: number;
};

type GeneratedScheduleDay = {
  ageDay: number;
  phaseIndex: number;
  intervalDays: number;
};

function invalid(reason: string): LitterWeighingScheduleResult {
  return { status: "invalid_input", reason, schedule: [], extraObservations: [] };
}

function parseCivilDate(value: unknown): ParsedCivilDate | null {
  if (typeof value !== "string") return null;
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { value, dayNumber: date.getTime() / DAY_MILLISECONDS };
}

function formatCivilDay(dayNumber: number): string | null {
  const date = new Date(dayNumber * DAY_MILLISECONDS);
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9_999) return null;

  const value = `${String(year).padStart(4, "0")}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return parseCivilDate(value)?.dayNumber === dayNumber ? value : null;
}

function validateAndGeneratePolicy(
  policy: unknown,
): { days: GeneratedScheduleDay[]; maximumAgeDay: number } | string {
  if (typeof policy !== "object" || policy === null) {
    return "policy must be an object";
  }

  const phases = (policy as { phases?: unknown }).phases;
  if (!Array.isArray(phases) || phases.length === 0) {
    return "policy phases must be a non-empty array";
  }
  if (phases.length > MAX_PHASE_COUNT) {
    return `policy must contain at most ${MAX_PHASE_COUNT} phases`;
  }

  const days: GeneratedScheduleDay[] = [];
  const generatedAgeDays = new Set<number>();
  let previousStartAgeDay = -1;
  let previousEndAgeDay = -1;

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    if (typeof phase !== "object" || phase === null) {
      return `phase ${phaseIndex} must be an object`;
    }

    const { startAgeDay, endAgeDay, intervalDays } = phase as Record<
      string,
      unknown
    >;
    if (
      !Number.isInteger(startAgeDay) ||
      !Number.isInteger(endAgeDay) ||
      !Number.isInteger(intervalDays)
    ) {
      return `phase ${phaseIndex} values must be finite integers`;
    }

    const start = startAgeDay as number;
    const end = endAgeDay as number;
    const interval = intervalDays as number;
    if (start < 0) return `phase ${phaseIndex} startAgeDay must be non-negative`;
    if (end < start) {
      return `phase ${phaseIndex} endAgeDay must not precede startAgeDay`;
    }
    if (end > MAX_AGE_DAY) {
      return `phase ${phaseIndex} endAgeDay must not exceed ${MAX_AGE_DAY}`;
    }
    if (interval < 1) {
      return `phase ${phaseIndex} intervalDays must be at least 1`;
    }
    if (phaseIndex > 0 && start < previousStartAgeDay) {
      return `phase ${phaseIndex} is out of order`;
    }
    if (phaseIndex > 0 && start <= previousEndAgeDay) {
      return `phase ${phaseIndex} overlaps the previous phase`;
    }

    for (let ageDay = start; ageDay <= end; ageDay += interval) {
      if (generatedAgeDays.has(ageDay)) {
        return `age day ${ageDay} is generated more than once`;
      }
      if (days.length >= MAX_SCHEDULED_COUNT) {
        return `policy generates more than ${MAX_SCHEDULED_COUNT} schedule items`;
      }
      generatedAgeDays.add(ageDay);
      days.push({ ageDay, phaseIndex, intervalDays: interval });
    }

    previousStartAgeDay = start;
    previousEndAgeDay = end;
  }

  return { days, maximumAgeDay: previousEndAgeDay };
}

function compareObservations(
  left: LitterWeighingObservation,
  right: LitterWeighingObservation,
) {
  return left.observationIndex - right.observationIndex;
}

export function buildLitterWeighingSchedule(
  input: BuildLitterWeighingScheduleInput,
): LitterWeighingScheduleResult {
  if (input.actualBirthDate === null) {
    return {
      status: "missing_actual_birth_date",
      schedule: [],
      extraObservations: [],
    };
  }

  const birthDate = parseCivilDate(input.actualBirthDate);
  if (!birthDate) return invalid("actualBirthDate must be a valid YYYY-MM-DD date");
  const todayDate = parseCivilDate(input.todayDate);
  if (!todayDate) return invalid("todayDate must be a valid YYYY-MM-DD date");

  const generatedPolicy = validateAndGeneratePolicy(input.policy);
  if (typeof generatedPolicy === "string") return invalid(generatedPolicy);

  if (!Array.isArray(input.observations)) {
    return invalid("observations must be an array");
  }

  const observationIndexes = new Set<number>();
  const parsedObservations: Array<{
    observation: LitterWeighingObservation;
    dayNumber: number;
  }> = [];

  for (const candidate of input.observations as readonly unknown[]) {
    if (typeof candidate !== "object" || candidate === null) {
      return invalid("each observation must be an object");
    }
    const observation = candidate as LitterWeighingObservation;
    if (!Number.isInteger(observation.observationIndex) || observation.observationIndex < 0) {
      return invalid("observationIndex must be a non-negative integer");
    }
    if (observationIndexes.has(observation.observationIndex)) {
      return invalid(`duplicate observationIndex: ${observation.observationIndex}`);
    }
    observationIndexes.add(observation.observationIndex);

    if (observation.source !== "birth" && observation.source !== "routine") {
      return invalid(`invalid observation source at index ${observation.observationIndex}`);
    }
    const observedOn = parseCivilDate(observation.observedOn);
    if (!observedOn) {
      return invalid(`invalid observedOn date at index ${observation.observationIndex}`);
    }
    parsedObservations.push({
      observation: {
        observationIndex: observation.observationIndex,
        observedOn: observation.observedOn,
        source: observation.source,
      },
      dayNumber: observedOn.dayNumber,
    });
  }

  const observationsByDay = new Map<number, LitterWeighingObservation[]>();
  for (const parsed of parsedObservations) {
    const observations = observationsByDay.get(parsed.dayNumber) ?? [];
    observations.push(parsed.observation);
    observationsByDay.set(parsed.dayNumber, observations);
  }

  const scheduledDayNumbers = new Set<number>();
  const schedule: LitterWeighingScheduleItem[] = [];
  for (const generatedDay of generatedPolicy.days) {
    const scheduledDayNumber = birthDate.dayNumber + generatedDay.ageDay;
    const scheduledOn = formatCivilDay(scheduledDayNumber);
    if (!scheduledOn) return invalid("a scheduled date is outside the supported range");
    scheduledDayNumbers.add(scheduledDayNumber);
    const observations = [...(observationsByDay.get(scheduledDayNumber) ?? [])].sort(
      compareObservations,
    );
    const status: LitterWeighingScheduleStatus =
      observations.length > 0
        ? "completed"
        : scheduledDayNumber === todayDate.dayNumber
          ? "due_today"
          : scheduledDayNumber < todayDate.dayNumber
            ? "overdue"
            : "upcoming";

    schedule.push({
      ageDay: generatedDay.ageDay,
      scheduledOn,
      phaseIndex: generatedDay.phaseIndex,
      cadence: { intervalDays: generatedDay.intervalDays },
      status,
      observations,
    });
  }

  const extraObservations = parsedObservations
    .filter(({ dayNumber }) => !scheduledDayNumbers.has(dayNumber))
    .map(({ observation, dayNumber }): LitterWeighingExtraObservation => {
      const ageDay = dayNumber - birthDate.dayNumber;
      const reason: LitterWeighingExtraObservationReason =
        ageDay < 0
          ? "before_birth"
          : ageDay > generatedPolicy.maximumAgeDay
            ? "after_schedule"
            : "unscheduled_day";
      return { ...observation, ageDay, reason };
    })
    .sort(
      (left, right) =>
        left.ageDay - right.ageDay ||
        left.observationIndex - right.observationIndex,
    );

  const completedCount = schedule.filter(({ status }) => status === "completed").length;
  const dueTodayCount = schedule.filter(({ status }) => status === "due_today").length;
  const overdueCount = schedule.filter(({ status }) => status === "overdue").length;
  const upcomingCount = schedule.filter(({ status }) => status === "upcoming").length;
  const firstIncompleteItem = schedule.find(({ status }) => status !== "completed");

  return {
    status: "available",
    schedule,
    extraObservations,
    summary: {
      totalScheduledCount: schedule.length,
      completedCount,
      dueTodayCount,
      overdueCount,
      upcomingCount,
      extraObservationCount: extraObservations.length,
      firstIncomplete: firstIncompleteItem
        ? {
            ageDay: firstIncompleteItem.ageDay,
            scheduledOn: firstIncompleteItem.scheduledOn,
            status: firstIncompleteItem.status as "due_today" | "overdue" | "upcoming",
          }
        : null,
    },
  };
}

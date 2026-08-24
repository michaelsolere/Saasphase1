import { buildLitterGrowthModel } from "./litter-growth-chart-model";
import { litterWeightAnimalName } from "./litter-weight-animal-identity";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
} from "./litter-weights-core";
import type { LitterWeighingScheduleResult } from "./litter-weighing-schedule-model";
import { getRoutineWeightEligibility } from "./routine-weight-eligibility";

export type LitterGrowthVigilanceCode =
  | "weight_decrease"
  | "weight_stagnation"
  | "weighing_due_today"
  | "weighing_overdue"
  | "latest_session_incomplete";

export type LitterGrowthVigilanceSeverity = "information" | "attention";
export type LitterGrowthVigilanceScope = "animal" | "litter" | "session";

export type LitterGrowthVigilanceMeasurement = {
  measuredAt: string;
  grams: number;
  type: "birth" | "routine";
};

type AnimalSignalBase = {
  severity: "attention";
  scope: "animal";
  animalId: string;
  animalPublicLabel: string;
  animalPublicDetails: string;
  latestMeasurement: LitterGrowthVigilanceMeasurement;
  previousMeasurement: LitterGrowthVigilanceMeasurement;
  intervalMilliseconds: number;
  suggestsWeightEntry: false;
};

export type LitterGrowthVigilanceSignal =
  | (AnimalSignalBase & {
      code: "weight_decrease";
      differenceGrams: number;
    })
  | (AnimalSignalBase & {
      code: "weight_stagnation";
    })
  | {
      code: "weighing_due_today";
      severity: "information";
      scope: "litter";
      scheduledOn: string;
      ageDay: number;
      suggestsWeightEntry: true;
    }
  | {
      code: "weighing_overdue";
      severity: "attention";
      scope: "litter";
      scheduledOn: string;
      ageDay: number;
      overdueCount: number;
      suggestsWeightEntry: true;
    }
  | {
      code: "latest_session_incomplete";
      severity: "attention";
      scope: "session";
      sessionId: string;
      sessionMeasuredAt: string;
      missingAnimalLabels: string[];
      suggestsWeightEntry: true;
    };

export type BuildLitterGrowthVigilanceInput = {
  animals: readonly LitterWeightHistoryAnimal[];
  measurements: readonly LitterWeightHistoryMeasurement[];
  sessions: readonly LitterWeightHistorySession[];
  weighingSchedule: LitterWeighingScheduleResult | null;
};

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function civilDateAtInstant(value: string, timezoneName: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function isRoutineWeightEligibleAtSessionByDeathDate({
  deathDate,
  sessionMeasuredAt,
  sessionTimezoneName,
}: {
  deathDate: string | null;
  sessionMeasuredAt: string;
  sessionTimezoneName: string;
}) {
  if (deathDate === null || !CIVIL_DATE_PATTERN.test(deathDate)) return true;
  const sessionCivilDate = civilDateAtInstant(
    sessionMeasuredAt,
    sessionTimezoneName,
  );
  if (sessionCivilDate === null) return true;

  // Mirrors record_litter_routine_weights: reject only when the session's
  // civil date in its own timezone is strictly later than the death date.
  return sessionCivilDate <= deathDate;
}

function compareAnimals(
  left: LitterWeightHistoryAnimal,
  right: LitterWeightHistoryAnimal,
) {
  const sexDifference = (right.sex ?? "").localeCompare(left.sex ?? "", "fr");
  if (sexDifference !== 0) return sexDifference;

  const leftOrder = left.birthOrder ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.birthOrder ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  const labelDifference = litterWeightAnimalName(left).localeCompare(
    litterWeightAnimalName(right),
    "fr",
  );
  if (labelDifference !== 0) return labelDifference;
  return left.id.localeCompare(right.id);
}

function compareTimestampValues(left: string, right: string) {
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
    return leftTimestamp - rightTimestamp;
  }
  if (Number.isFinite(leftTimestamp)) return 1;
  if (Number.isFinite(rightTimestamp)) return -1;
  return left.localeCompare(right);
}

function compareSessions(
  left: LitterWeightHistorySession,
  right: LitterWeightHistorySession,
) {
  const measuredAtDifference = compareTimestampValues(
    left.measuredAt,
    right.measuredAt,
  );
  if (measuredAtDifference !== 0) return measuredAtDifference;
  const createdAtDifference = compareTimestampValues(
    left.createdAt,
    right.createdAt,
  );
  if (createdAtDifference !== 0) return createdAtDifference;
  return left.id.localeCompare(right.id);
}

function publicMeasurement(measurement: {
  measuredAt: string;
  grams: number;
  type: "birth" | "routine";
}): LitterGrowthVigilanceMeasurement {
  return {
    measuredAt: measurement.measuredAt,
    grams: measurement.grams,
    type: measurement.type,
  };
}

export function buildLitterGrowthVigilance({
  animals,
  measurements,
  sessions,
  weighingSchedule,
}: BuildLitterGrowthVigilanceInput): LitterGrowthVigilanceSignal[] {
  const orderedAnimals = [
    ...new Map(animals.map((animal) => [animal.id, animal])).values(),
  ].sort(compareAnimals);
  const growthModel = buildLitterGrowthModel(orderedAnimals, measurements);
  const decreaseSignals: LitterGrowthVigilanceSignal[] = [];
  const stagnationSignals: LitterGrowthVigilanceSignal[] = [];

  for (const indicator of growthModel.indicators) {
    const latest = indicator.latestMeasurement;
    const previous = indicator.previousMeasurement;
    const intervalMilliseconds = indicator.intervalMilliseconds;
    if (!latest || !previous || intervalMilliseconds === null) continue;

    const common = {
      severity: "attention" as const,
      scope: "animal" as const,
      animalId: indicator.internalId,
      animalPublicLabel: indicator.publicLabel,
      animalPublicDetails: indicator.publicDetails,
      latestMeasurement: publicMeasurement(latest),
      previousMeasurement: publicMeasurement(previous),
      intervalMilliseconds,
      suggestsWeightEntry: false as const,
    };

    if (
      indicator.differenceGrams !== null &&
      indicator.differenceGrams < 0
    ) {
      decreaseSignals.push({
        ...common,
        code: "weight_decrease",
        differenceGrams: indicator.differenceGrams,
      });
    }

    const series = growthModel.series.find(
      (candidate) => candidate.internalId === indicator.internalId,
    );
    const latestThree = series?.points.slice(-3) ?? [];
    if (
      latestThree.length === 3 &&
      latestThree[0].grams === latestThree[1].grams &&
      latestThree[1].grams === latestThree[2].grams
    ) {
      stagnationSignals.push({ ...common, code: "weight_stagnation" });
    }
  }

  const scheduleSignals: LitterGrowthVigilanceSignal[] = [];
  if (weighingSchedule?.status === "available") {
    const overdue = weighingSchedule.schedule
      .filter((item) => item.status === "overdue")
      .sort((left, right) =>
        left.scheduledOn.localeCompare(right.scheduledOn) ||
        left.ageDay - right.ageDay,
      );
    const oldestOverdue = overdue[0];
    if (oldestOverdue) {
      scheduleSignals.push({
        code: "weighing_overdue",
        severity: "attention",
        scope: "litter",
        scheduledOn: oldestOverdue.scheduledOn,
        ageDay: oldestOverdue.ageDay,
        overdueCount: overdue.length,
        suggestsWeightEntry: true,
      });
    }
  }

  const sessionSignals: LitterGrowthVigilanceSignal[] = [];
  const latestSession = [...sessions].sort(compareSessions).at(-1);
  if (latestSession) {
    const measuredAnimalIds = new Set(
      measurements.flatMap((measurement) =>
        measurement.type === "routine" &&
        measurement.sessionId === latestSession.id
          ? [measurement.animalId]
          : [],
      ),
    );
    if (measuredAnimalIds.size > 0) {
      const missingAnimalLabels = orderedAnimals.flatMap((animal) =>
        getRoutineWeightEligibility(animal).eligible &&
        isRoutineWeightEligibleAtSessionByDeathDate({
          deathDate: animal.deathDate,
          sessionMeasuredAt: latestSession.measuredAt,
          sessionTimezoneName: latestSession.timezoneName,
        }) &&
        !measuredAnimalIds.has(animal.id)
          ? [litterWeightAnimalName(animal)]
          : [],
      );
      if (missingAnimalLabels.length > 0) {
        sessionSignals.push({
          code: "latest_session_incomplete",
          severity: "attention",
          scope: "session",
          sessionId: latestSession.id,
          sessionMeasuredAt: latestSession.measuredAt,
          missingAnimalLabels,
          suggestsWeightEntry: true,
        });
      }
    }
  }

  const dueTodaySignals: LitterGrowthVigilanceSignal[] = [];
  if (weighingSchedule?.status === "available") {
    const dueToday = weighingSchedule.schedule.find(
      (item) => item.status === "due_today",
    );
    if (dueToday) {
      dueTodaySignals.push({
        code: "weighing_due_today",
        severity: "information",
        scope: "litter",
        scheduledOn: dueToday.scheduledOn,
        ageDay: dueToday.ageDay,
        suggestsWeightEntry: true,
      });
    }
  }

  return [
    ...scheduleSignals,
    ...decreaseSignals,
    ...stagnationSignals,
    ...sessionSignals,
    ...dueTodaySignals,
  ];
}

export type LitterWeighingSessionComparisonSession = {
  sessionId: string;
  measuredAt: string;
  timezoneName: string;
  createdAt: string;
};

export type LitterWeighingSessionComparisonMeasurement = {
  sessionId: string;
  animalId: string;
  grams: number;
};

export type LitterWeightLatestSessionComparison =
  | {
      status: "available";
      previousMeasuredAt: string;
      previousTimezoneName: string;
      previousMeasurementCount: number;
      currentMeasuredAt: string;
      currentTimezoneName: string;
      currentMeasurementCount: number;
      commonAnimalCount: number;
      previousCommonAverageGrams: number;
      currentCommonAverageGrams: number;
      averageDifferenceGrams: number;
      previousCommonRangeGrams: number;
      currentCommonRangeGrams: number;
      rangeDifferenceGrams: number;
    }
  | {
      status: "insufficient_sessions";
    }
  | {
      status: "no_common_animals";
      previousMeasuredAt: string;
      previousTimezoneName: string;
      currentMeasuredAt: string;
      currentTimezoneName: string;
    };

function compareSessions(
  left: LitterWeighingSessionComparisonSession,
  right: LitterWeighingSessionComparisonSession,
) {
  const measuredAtDifference =
    Date.parse(right.measuredAt) - Date.parse(left.measuredAt);
  if (measuredAtDifference !== 0) return measuredAtDifference;

  const createdAtDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdAtDifference !== 0) return createdAtDifference;

  return left.sessionId.localeCompare(right.sessionId);
}

function average(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function range(values: readonly number[]) {
  return Math.max(...values) - Math.min(...values);
}

export function buildLitterWeightLatestSessionComparison(
  sessions: readonly LitterWeighingSessionComparisonSession[],
  measurements: readonly LitterWeighingSessionComparisonMeasurement[],
): LitterWeightLatestSessionComparison {
  const measurementsBySession = new Map<string, Map<string, number>>();

  for (const measurement of measurements) {
    const sessionMeasurements =
      measurementsBySession.get(measurement.sessionId) ?? new Map<string, number>();
    sessionMeasurements.set(measurement.animalId, measurement.grams);
    measurementsBySession.set(measurement.sessionId, sessionMeasurements);
  }

  const nonEmptySessions = sessions
    .filter((session) => (measurementsBySession.get(session.sessionId)?.size ?? 0) > 0)
    .slice()
    .sort(compareSessions);

  const current = nonEmptySessions[0];
  const previous = nonEmptySessions[1];
  if (!current || !previous) return { status: "insufficient_sessions" };

  const currentMeasurements = measurementsBySession.get(current.sessionId)!;
  const previousMeasurements = measurementsBySession.get(previous.sessionId)!;
  const commonAnimalIds = [...currentMeasurements.keys()]
    .filter((animalId) => previousMeasurements.has(animalId))
    .sort();

  if (commonAnimalIds.length === 0) {
    return {
      status: "no_common_animals",
      previousMeasuredAt: previous.measuredAt,
      previousTimezoneName: previous.timezoneName,
      currentMeasuredAt: current.measuredAt,
      currentTimezoneName: current.timezoneName,
    };
  }

  const previousCommonWeights = commonAnimalIds.map(
    (animalId) => previousMeasurements.get(animalId)!,
  );
  const currentCommonWeights = commonAnimalIds.map(
    (animalId) => currentMeasurements.get(animalId)!,
  );
  const previousCommonAverageGrams = average(previousCommonWeights);
  const currentCommonAverageGrams = average(currentCommonWeights);
  const previousCommonRangeGrams = range(previousCommonWeights);
  const currentCommonRangeGrams = range(currentCommonWeights);

  return {
    status: "available",
    previousMeasuredAt: previous.measuredAt,
    previousTimezoneName: previous.timezoneName,
    previousMeasurementCount: previousMeasurements.size,
    currentMeasuredAt: current.measuredAt,
    currentTimezoneName: current.timezoneName,
    currentMeasurementCount: currentMeasurements.size,
    commonAnimalCount: commonAnimalIds.length,
    previousCommonAverageGrams,
    currentCommonAverageGrams,
    averageDifferenceGrams:
      currentCommonAverageGrams - previousCommonAverageGrams,
    previousCommonRangeGrams,
    currentCommonRangeGrams,
    rangeDifferenceGrams: currentCommonRangeGrams - previousCommonRangeGrams,
  };
}

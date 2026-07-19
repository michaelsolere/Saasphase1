export type LitterWeighingSessionMeasurementRow = {
  sessionId: string;
  grams: number;
};

export type LitterWeighingSessionStatistics = {
  measurementCount: number;
  averageGrams: number;
  minimumGrams: number;
  maximumGrams: number;
};

export function buildLitterWeighingSessionStatistics(
  rows: readonly LitterWeighingSessionMeasurementRow[],
): Map<string, LitterWeighingSessionStatistics> {
  const accumulators = new Map<
    string,
    {
      measurementCount: number;
      totalGrams: number;
      minimumGrams: number;
      maximumGrams: number;
    }
  >();

  for (const row of rows) {
    const current = accumulators.get(row.sessionId);
    if (!current) {
      accumulators.set(row.sessionId, {
        measurementCount: 1,
        totalGrams: row.grams,
        minimumGrams: row.grams,
        maximumGrams: row.grams,
      });
      continue;
    }

    current.measurementCount += 1;
    current.totalGrams += row.grams;
    current.minimumGrams = Math.min(current.minimumGrams, row.grams);
    current.maximumGrams = Math.max(current.maximumGrams, row.grams);
  }

  return new Map<string, LitterWeighingSessionStatistics>(
    [...accumulators.entries()]
      .sort(([leftSessionId], [rightSessionId]) =>
        leftSessionId < rightSessionId ? -1 : leftSessionId > rightSessionId ? 1 : 0,
      )
      .map(([sessionId, accumulator]) => [
        sessionId,
        {
          measurementCount: accumulator.measurementCount,
          averageGrams: accumulator.totalGrams / accumulator.measurementCount,
          minimumGrams: accumulator.minimumGrams,
          maximumGrams: accumulator.maximumGrams,
        },
      ]),
  );
}

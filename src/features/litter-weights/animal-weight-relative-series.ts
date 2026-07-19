export type AnimalWeightMeasurementInput = {
  internalId: string;
  measuredAt: string;
  grams: number;
  type: "birth" | "routine";
};

export type AnimalWeightMeasurement = AnimalWeightMeasurementInput & {
  timestamp: number;
};

export type AnimalWeightRelativePoint = AnimalWeightMeasurement & {
  elapsedMilliseconds: number;
  index: number;
};

export type AnimalWeightRelativeSeriesResult =
  | {
      status: "available";
      birthMeasurement: AnimalWeightMeasurement;
      points: AnimalWeightRelativePoint[];
      latestPoint: AnimalWeightRelativePoint;
    }
  | {
      status: "missing_or_ambiguous_birth";
      birthMeasurement: null;
      points: [];
      latestPoint: null;
    };

function compareMeasurements(
  left: AnimalWeightMeasurement,
  right: AnimalWeightMeasurement,
) {
  const timestampDifference = left.timestamp - right.timestamp;
  if (timestampDifference !== 0) return timestampDifference;
  if (left.type !== right.type) return left.type === "birth" ? -1 : 1;
  if (left.internalId < right.internalId) return -1;
  if (left.internalId > right.internalId) return 1;
  return 0;
}

export function buildAnimalWeightRelativeSeries(
  measurements: readonly AnimalWeightMeasurementInput[],
): AnimalWeightRelativeSeriesResult {
  const validMeasurements = measurements
    .map((measurement): AnimalWeightMeasurement | null => {
      const timestamp = Date.parse(measurement.measuredAt);
      if (!Number.isFinite(timestamp) || !Number.isFinite(measurement.grams)) {
        return null;
      }

      return {
        internalId: measurement.internalId,
        measuredAt: measurement.measuredAt,
        timestamp,
        grams: measurement.grams,
        type: measurement.type,
      };
    })
    .filter(
      (measurement): measurement is AnimalWeightMeasurement =>
        measurement !== null,
    )
    .sort(compareMeasurements);
  const usableBirthMeasurements = validMeasurements.filter(
    (measurement) => measurement.type === "birth" && measurement.grams > 0,
  );

  if (usableBirthMeasurements.length !== 1) {
    return {
      status: "missing_or_ambiguous_birth",
      birthMeasurement: null,
      points: [],
      latestPoint: null,
    };
  }

  const birthMeasurement = usableBirthMeasurements[0];
  const points = validMeasurements
    .filter(
      (measurement) => measurement.timestamp >= birthMeasurement.timestamp,
    )
    .map((measurement): AnimalWeightRelativePoint => ({
      ...measurement,
      elapsedMilliseconds:
        measurement.timestamp - birthMeasurement.timestamp,
      index:
        measurement === birthMeasurement
          ? 100
          : (measurement.grams / birthMeasurement.grams) * 100,
    }));

  return {
    status: "available",
    birthMeasurement,
    points,
    latestPoint: points[points.length - 1],
  };
}

import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";
import {
  buildAnimalWeightRelativeSeries,
  type AnimalWeightMeasurement,
  type AnimalWeightMeasurementInput,
  type AnimalWeightRelativePoint,
} from "./animal-weight-relative-series";
import {
  litterWeightAnimalDetails,
  litterWeightAnimalName,
} from "./litter-weight-animal-identity";

export type LitterGrowthPoint = AnimalWeightMeasurement;

export type LitterGrowthSeries = {
  internalId: string;
  publicLabel: string;
  publicDetails: string;
  seriesIndex: number;
  points: LitterGrowthPoint[];
  latestMeasurement: LitterGrowthPoint;
};

export type LitterRelativeGrowthPoint = AnimalWeightRelativePoint;

export type LitterRelativeGrowthSeries = {
  internalId: string;
  publicLabel: string;
  publicDetails: string;
  seriesIndex: number;
  birthMeasurement: LitterGrowthPoint;
  points: LitterRelativeGrowthPoint[];
  latestPoint: LitterRelativeGrowthPoint;
};

export type LitterGrowthIndicator = {
  internalId: string;
  publicLabel: string;
  publicDetails: string;
  seriesIndex: number;
  measurementCount: number;
  latestMeasurement: LitterGrowthPoint | null;
  previousMeasurement: LitterGrowthPoint | null;
  differenceGrams: number | null;
  intervalMilliseconds: number | null;
  relativeProgressPercentage: number | null;
};

export type LitterGrowthModel = {
  indicators: LitterGrowthIndicator[];
  series: LitterGrowthSeries[];
  relativeSeries: LitterRelativeGrowthSeries[];
};

export type GrowthChartDomain = {
  minTimestamp: number;
  maxTimestamp: number;
  minGrams: number;
  maxGrams: number;
  timestampTicks: number[];
  gramTicks: number[];
};

export type GrowthChartPlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ProjectedGrowthPoint = { x: number; y: number };

const TICK_COUNT = 5;
const IDENTICAL_TIMESTAMP_MARGIN_MS = 30 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function compareGrowthPoints(
  left: LitterGrowthPoint,
  right: LitterGrowthPoint,
) {
  const timestampDifference = left.timestamp - right.timestamp;
  if (timestampDifference !== 0) return timestampDifference;
  if (left.type !== right.type) return left.type === "birth" ? -1 : 1;
  if (left.internalId < right.internalId) return -1;
  if (left.internalId > right.internalId) return 1;
  return 0;
}

function linearTicks(min: number, max: number, count = TICK_COUNT) {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

export function buildLitterGrowthModel(
  animals: readonly LitterWeightHistoryAnimal[],
  measurements: readonly LitterWeightHistoryMeasurement[],
): LitterGrowthModel {
  const measurementsByAnimal = new Map<string, LitterGrowthPoint[]>();
  const relativeMeasurementsByAnimal = new Map<
    string,
    AnimalWeightMeasurementInput[]
  >();

  for (const measurement of measurements) {
    if (measurement.type !== "birth" && measurement.type !== "routine") continue;
    const relativeMeasurements =
      relativeMeasurementsByAnimal.get(measurement.animalId) ?? [];
    relativeMeasurements.push({
      internalId: measurement.id,
      measuredAt: measurement.measuredAt,
      grams: measurement.grams,
      type: measurement.type,
    });
    relativeMeasurementsByAnimal.set(
      measurement.animalId,
      relativeMeasurements,
    );

    const timestamp = Date.parse(measurement.measuredAt);
    if (!Number.isFinite(timestamp) || !Number.isFinite(measurement.grams)) continue;

    const points = measurementsByAnimal.get(measurement.animalId) ?? [];
    points.push({
      internalId: measurement.id,
      timestamp,
      measuredAt: measurement.measuredAt,
      grams: measurement.grams,
      type: measurement.type,
    });
    measurementsByAnimal.set(measurement.animalId, points);
  }

  for (const points of measurementsByAnimal.values()) {
    points.sort(compareGrowthPoints);
  }

  const indicators: LitterGrowthIndicator[] = [];
  const series: LitterGrowthSeries[] = [];
  const relativeSeries: LitterRelativeGrowthSeries[] = [];
  animals.forEach((animal, seriesIndex) => {
    const points = measurementsByAnimal.get(animal.id) ?? [];
    const latestMeasurement = points.at(-1) ?? null;
    const previousMeasurement = points.at(-2) ?? null;
    const relativeResult = buildAnimalWeightRelativeSeries(
      relativeMeasurementsByAnimal.get(animal.id) ?? [],
    );
    const latestRelativePoint =
      relativeResult.status === "available" ? relativeResult.latestPoint : null;
    const publicIdentity = {
      internalId: animal.id,
      publicLabel: litterWeightAnimalName(animal),
      publicDetails: litterWeightAnimalDetails(animal),
      seriesIndex,
    };

    indicators.push({
      ...publicIdentity,
      measurementCount: points.length,
      latestMeasurement,
      previousMeasurement,
      differenceGrams:
        latestMeasurement && previousMeasurement
          ? latestMeasurement.grams - previousMeasurement.grams
          : null,
      intervalMilliseconds:
        latestMeasurement && previousMeasurement
          ? latestMeasurement.timestamp - previousMeasurement.timestamp
          : null,
      relativeProgressPercentage: latestRelativePoint
        ? latestRelativePoint.index - 100
        : null,
    });

    if (!latestMeasurement) return;
    series.push({
      ...publicIdentity,
      points,
      latestMeasurement,
    });

    if (relativeResult.status === "available") {
      relativeSeries.push({
        ...publicIdentity,
        birthMeasurement: relativeResult.birthMeasurement,
        points: relativeResult.points,
        latestPoint: relativeResult.latestPoint,
      });
    }
  });

  return { indicators, series, relativeSeries };
}

export function buildLitterGrowthSeries(
  animals: readonly LitterWeightHistoryAnimal[],
  measurements: readonly LitterWeightHistoryMeasurement[],
): LitterGrowthSeries[] {
  return buildLitterGrowthModel(animals, measurements).series;
}

export function buildLitterRelativeGrowthSeries(
  animals: readonly LitterWeightHistoryAnimal[],
  measurements: readonly LitterWeightHistoryMeasurement[],
): LitterRelativeGrowthSeries[] {
  return buildLitterGrowthModel(animals, measurements).relativeSeries;
}

export function formatObservedInterval(intervalMilliseconds: number) {
  if (intervalMilliseconds < MINUTE_MS) {
    return intervalMilliseconds === 0 ? "0 min" : "Moins d’une minute";
  }

  let remaining = intervalMilliseconds;
  const days = Math.floor(remaining / DAY_MS);
  remaining -= days * DAY_MS;
  const hours = Math.floor(remaining / HOUR_MS);
  remaining -= hours * HOUR_MS;
  const minutes = Math.floor(remaining / MINUTE_MS);
  const parts = [
    days > 0 ? `${days} j` : null,
    hours > 0 ? `${hours} h` : null,
    minutes > 0 ? `${minutes} min` : null,
  ].filter((part): part is string => part !== null);

  return parts.join(" ");
}

export function buildGrowthChartDomain(
  points: readonly LitterGrowthPoint[],
): GrowthChartDomain | null {
  if (points.length === 0) return null;

  const timestamps = points.map((point) => point.timestamp);
  const grams = points.map((point) => point.grams);
  const rawMinTimestamp = Math.min(...timestamps);
  const rawMaxTimestamp = Math.max(...timestamps);
  const rawMinGrams = Math.min(...grams);
  const rawMaxGrams = Math.max(...grams);

  const minTimestamp =
    rawMinTimestamp === rawMaxTimestamp
      ? rawMinTimestamp - IDENTICAL_TIMESTAMP_MARGIN_MS
      : rawMinTimestamp;
  const maxTimestamp =
    rawMinTimestamp === rawMaxTimestamp
      ? rawMaxTimestamp + IDENTICAL_TIMESTAMP_MARGIN_MS
      : rawMaxTimestamp;

  const weightRange = rawMaxGrams - rawMinGrams;
  const weightMargin =
    weightRange === 0
      ? Math.max(10, rawMaxGrams * 0.08)
      : Math.max(10, weightRange * 0.12);
  const minGrams = Math.max(0, Math.floor((rawMinGrams - weightMargin) / 10) * 10);
  let maxGrams = Math.ceil((rawMaxGrams + weightMargin) / 10) * 10;
  if (maxGrams <= minGrams) maxGrams = minGrams + 10;

  return {
    minTimestamp,
    maxTimestamp,
    minGrams,
    maxGrams,
    timestampTicks: linearTicks(minTimestamp, maxTimestamp),
    gramTicks: linearTicks(minGrams, maxGrams),
  };
}

export function buildRelativeGrowthChartDomain(
  points: readonly LitterRelativeGrowthPoint[],
): GrowthChartDomain | null {
  if (points.length === 0) return null;

  const maxElapsedMilliseconds = Math.max(
    ...points.map((point) => point.elapsedMilliseconds),
  );
  const indices = points.map((point) => point.index);
  const rawMinIndex = Math.min(...indices);
  const rawMaxIndex = Math.max(...indices);
  const indexRange = rawMaxIndex - rawMinIndex;
  const indexMargin =
    indexRange === 0
      ? Math.max(5, rawMaxIndex * 0.05)
      : Math.max(5, indexRange * 0.12);
  const minIndex = Math.max(
    0,
    Math.floor((rawMinIndex - indexMargin) / 5) * 5,
  );
  let maxIndex = Math.ceil((rawMaxIndex + indexMargin) / 5) * 5;
  if (maxIndex <= minIndex) maxIndex = minIndex + 5;
  const maxElapsed =
    maxElapsedMilliseconds === 0 ? HOUR_MS : maxElapsedMilliseconds;

  return {
    minTimestamp: 0,
    maxTimestamp: maxElapsed,
    minGrams: minIndex,
    maxGrams: maxIndex,
    timestampTicks: linearTicks(0, maxElapsed),
    gramTicks: linearTicks(minIndex, maxIndex),
  };
}

export function projectGrowthPoint(
  point: Pick<LitterGrowthPoint, "timestamp" | "grams">,
  domain: GrowthChartDomain,
  plotArea: GrowthChartPlotArea,
): ProjectedGrowthPoint {
  const timestampRatio =
    (point.timestamp - domain.minTimestamp) /
    (domain.maxTimestamp - domain.minTimestamp);
  const gramsRatio =
    (point.grams - domain.minGrams) / (domain.maxGrams - domain.minGrams);
  const boundedTimestampRatio = Math.min(1, Math.max(0, timestampRatio));
  const boundedGramsRatio = Math.min(1, Math.max(0, gramsRatio));

  return {
    x: plotArea.left + boundedTimestampRatio * plotArea.width,
    y: plotArea.top + (1 - boundedGramsRatio) * plotArea.height,
  };
}

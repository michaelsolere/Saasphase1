import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";
import {
  litterWeightAnimalDetails,
  litterWeightAnimalName,
} from "./litter-weight-animal-identity";

export type LitterGrowthPoint = {
  internalId: string;
  timestamp: number;
  measuredAt: string;
  grams: number;
  type: "birth" | "routine";
};

export type LitterGrowthSeries = {
  internalId: string;
  publicLabel: string;
  publicDetails: string;
  seriesIndex: number;
  points: LitterGrowthPoint[];
  latestMeasurement: LitterGrowthPoint;
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

function linearTicks(min: number, max: number, count = TICK_COUNT) {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

export function buildLitterGrowthSeries(
  animals: readonly LitterWeightHistoryAnimal[],
  measurements: readonly LitterWeightHistoryMeasurement[],
): LitterGrowthSeries[] {
  const measurementsByAnimal = new Map<string, LitterGrowthPoint[]>();

  for (const measurement of measurements) {
    if (measurement.type !== "birth" && measurement.type !== "routine") continue;
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

  const series: LitterGrowthSeries[] = [];
  animals.forEach((animal, seriesIndex) => {
    const points = measurementsByAnimal.get(animal.id);
    if (!points?.length) return;

    points.sort((left, right) => left.timestamp - right.timestamp);
    series.push({
      internalId: animal.id,
      publicLabel: litterWeightAnimalName(animal),
      publicDetails: litterWeightAnimalDetails(animal),
      seriesIndex,
      points,
      latestMeasurement: points[points.length - 1],
    });
  });

  return series;
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

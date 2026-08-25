import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";

// Rang d'un chiot parmi les chiots de même sexe (1, 2, 3…), dans l'ordre
// de naissance, indépendamment de l'ordre de réception du tableau.
export function buildSexOrdinals(
  animals: readonly LitterWeightHistoryAnimal[],
): Map<string, number> {
  const counters = new Map<string, number>();
  const ordinals = new Map<string, number>();
  const orderedAnimals = [...animals].sort((left, right) => {
    const leftOrder = left.birthOrder ?? Number.POSITIVE_INFINITY;
    const rightOrder = right.birthOrder ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.id.localeCompare(right.id);
  });

  for (const animal of orderedAnimals) {
    if (animal.birthOrder === null) continue;
    const next = (counters.get(animal.sex) ?? 0) + 1;
    counters.set(animal.sex, next);
    ordinals.set(animal.id, next);
  }

  return ordinals;
}

export type AnimalWeightGainSummary = {
  latestGrams: number;
  latestMeasuredAt: string;
  previousGrams: number | null;
  reference3dGrams: number | null;
  gainSincePreviousGrams: number | null;
  gainSincePreviousPerDayGrams: number | null;
  gainOver3dGrams: number | null;
  gainOver3dPerDayGrams: number | null;
  gainSinceBirthPercentage: number | null;
  priorThreeGainAveragePerDayGrams: number | null;
  gainBelowPriorThreeDayAverage: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const MIN_REFERENCE_AGE_MS = 20 * 60 * 60 * 1_000;
const MAX_REFERENCE_AGE_MS = 4 * DAY_MS;

type GainInterval = {
  gainGrams: number;
  gainPerDayGrams: number;
};

function intervalGain(
  previous: LitterWeightHistoryMeasurement,
  current: LitterWeightHistoryMeasurement,
): GainInterval | null {
  if (previous.grams <= 0 || current.grams <= 0) return null;
  const elapsedMs = Date.parse(current.measuredAt) - Date.parse(previous.measuredAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
  const elapsedDays = elapsedMs / DAY_MS;
  return {
    gainGrams: current.grams - previous.grams,
    gainPerDayGrams: (current.grams - previous.grams) / elapsedDays,
  };
}

function findReference3d(
  sortedPoints: readonly LitterWeightHistoryMeasurement[],
  latestTimestamp: number,
): LitterWeightHistoryMeasurement | null {
  const targetElapsed = 3 * DAY_MS;
  let reference: LitterWeightHistoryMeasurement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = sortedPoints.length - 2; index >= 0; index -= 1) {
    const candidate = sortedPoints[index]!;
    const timestamp = Date.parse(candidate.measuredAt);
    if (!Number.isFinite(timestamp)) continue;
    const elapsed = latestTimestamp - timestamp;
    if (elapsed < MIN_REFERENCE_AGE_MS || elapsed > MAX_REFERENCE_AGE_MS) continue;
    if (candidate.grams <= 0) continue;
    const distance = Math.abs(elapsed - targetElapsed);
    if (distance < bestDistance) {
      reference = candidate;
      bestDistance = distance;
    }
  }
  return reference;
}

function averagePriorThreeGains(
  sortedPoints: readonly LitterWeightHistoryMeasurement[],
): number | null {
  const intervals: number[] = [];
  for (let index = 1; index < sortedPoints.length; index += 1) {
    const interval = intervalGain(sortedPoints[index - 1]!, sortedPoints[index]!);
    if (interval) intervals.push(interval.gainPerDayGrams);
  }
  const priorThree = intervals.slice(-3);
  if (priorThree.length !== 3) return null;
  return priorThree.reduce((total, value) => total + value, 0) / priorThree.length;
}

export function summarizeAnimalWeightGain(
  points: readonly LitterWeightHistoryMeasurement[],
  birthGrams: number | null,
  belowTrendDeviationPercent = 0,
): AnimalWeightGainSummary | null {
  const sorted = [...points].sort((left, right) => {
    const difference = Date.parse(left.measuredAt) - Date.parse(right.measuredAt);
    return Number.isFinite(difference) && difference !== 0
      ? difference
      : left.measuredAt.localeCompare(right.measuredAt);
  });
  const latest = sorted.at(-1);
  if (!latest || !(latest.grams > 0)) return null;

  const previous = sorted.at(-2) ?? null;
  const latestInterval = previous ? intervalGain(previous, latest) : null;
  const latestTimestamp = Date.parse(latest.measuredAt);
  const reference3d = findReference3d(sorted, latestTimestamp);
  const gainOver3dGrams =
    reference3d && reference3d.grams > 0 ? latest.grams - reference3d.grams : null;
  const gainOver3dPerDayGrams =
    reference3d && gainOver3dGrams !== null
      ? gainOver3dGrams /
        Math.max(1, (latestTimestamp - Date.parse(reference3d.measuredAt)) / DAY_MS)
      : null;
  const priorThreeGainAveragePerDayGrams = averagePriorThreeGains(sorted.slice(0, -1));

  return {
    latestGrams: latest.grams,
    latestMeasuredAt: latest.measuredAt,
    previousGrams: previous?.grams ?? null,
    reference3dGrams: reference3d?.grams ?? null,
    gainSincePreviousGrams: latestInterval?.gainGrams ?? null,
    gainSincePreviousPerDayGrams: latestInterval?.gainPerDayGrams ?? null,
    gainOver3dGrams,
    gainOver3dPerDayGrams,
    gainSinceBirthPercentage:
      birthGrams && birthGrams > 0
        ? ((latest.grams - birthGrams) / birthGrams) * 100
        : null,
    priorThreeGainAveragePerDayGrams,
    gainBelowPriorThreeDayAverage:
      latestInterval !== null &&
      priorThreeGainAveragePerDayGrams !== null &&
      (belowTrendDeviationPercent > 0
        ? latestInterval.gainPerDayGrams <=
          priorThreeGainAveragePerDayGrams *
            (1 - belowTrendDeviationPercent / 100)
        : latestInterval.gainPerDayGrams < priorThreeGainAveragePerDayGrams),
  };
}

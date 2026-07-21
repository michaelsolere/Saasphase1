import {
  buildAnimalWeightRelativeSeries,
  type AnimalWeightMeasurementInput,
  type AnimalWeightRelativePoint,
} from "./animal-weight-relative-series";

export type LitterAgeComparisonInput = {
  internalId: string;
  publicLabel: string;
  seriesIndex: number;
  animals: readonly {
    internalId: string;
    measurements: readonly AnimalWeightMeasurementInput[];
  }[];
};

export type LitterAgeComparisonPoint = {
  ageDay: number;
  observedAnimalCount: number;
  averageGrams: number;
  averageRelativeIndex: number;
  averageRelativeProgressPercentage: number;
};

export type LitterAgeComparisonSeries = {
  internalId: string;
  publicLabel: string;
  seriesIndex: number;
  totalAnimalCount: number;
  eligibleAnimalCount: number;
  excludedAnimalCount: number;
  status: "available" | "no_eligible_animals";
  points: LitterAgeComparisonPoint[];
};

export type LitterAgeComparisonModel = {
  series: LitterAgeComparisonSeries[];
};

const AGE_DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

type DailyContribution = Pick<AnimalWeightRelativePoint, "grams" | "index">;

function compareByInternalId(
  left: { internalId: string },
  right: { internalId: string },
) {
  if (left.internalId < right.internalId) return -1;
  if (left.internalId > right.internalId) return 1;
  return 0;
}

function compareLitters(
  left: LitterAgeComparisonInput,
  right: LitterAgeComparisonInput,
) {
  const seriesIndexDifference = left.seriesIndex - right.seriesIndex;
  return seriesIndexDifference !== 0
    ? seriesIndexDifference
    : compareByInternalId(left, right);
}

function buildLitterSeries(
  litter: LitterAgeComparisonInput,
): LitterAgeComparisonSeries {
  const contributionsByAgeDay = new Map<number, DailyContribution[]>();
  let eligibleAnimalCount = 0;

  for (const animal of [...litter.animals].sort(compareByInternalId)) {
    const relativeSeries = buildAnimalWeightRelativeSeries(
      animal.measurements,
    );
    if (relativeSeries.status !== "available") continue;

    eligibleAnimalCount += 1;
    const latestContributionByAgeDay = new Map<number, DailyContribution>();

    for (const point of relativeSeries.points) {
      const ageDay = Math.floor(
        point.elapsedMilliseconds / AGE_DAY_MILLISECONDS,
      );
      // J0 is the immutable birth reference. A routine measurement recorded
      // later on the civil birth day remains part of the source history, but
      // must never replace the real birth measurement in this comparison.
      if (ageDay === 0 && point.type !== "birth") continue;
      latestContributionByAgeDay.set(ageDay, {
        grams: point.grams,
        index: point.index,
      });
    }

    for (const [ageDay, contribution] of latestContributionByAgeDay) {
      const contributions = contributionsByAgeDay.get(ageDay) ?? [];
      contributions.push(contribution);
      contributionsByAgeDay.set(ageDay, contributions);
    }
  }

  const points = [...contributionsByAgeDay.entries()]
    .sort(([leftAgeDay], [rightAgeDay]) => leftAgeDay - rightAgeDay)
    .map(([ageDay, contributions]): LitterAgeComparisonPoint => {
      const observedAnimalCount = contributions.length;
      const averageGrams =
        contributions.reduce((sum, contribution) => sum + contribution.grams, 0) /
        observedAnimalCount;
      const averageRelativeIndex =
        ageDay === 0
          ? 100
          : contributions.reduce((sum, contribution) => sum + contribution.index, 0) /
            observedAnimalCount;

      return {
        ageDay,
        observedAnimalCount,
        averageGrams,
        averageRelativeIndex,
        averageRelativeProgressPercentage: averageRelativeIndex - 100,
      };
    });
  const totalAnimalCount = litter.animals.length;

  return {
    internalId: litter.internalId,
    publicLabel: litter.publicLabel,
    seriesIndex: litter.seriesIndex,
    totalAnimalCount,
    eligibleAnimalCount,
    excludedAnimalCount: totalAnimalCount - eligibleAnimalCount,
    status: eligibleAnimalCount > 0 ? "available" : "no_eligible_animals",
    points,
  };
}

export function buildLitterAgeComparisonModel(
  litters: readonly LitterAgeComparisonInput[],
): LitterAgeComparisonModel {
  return {
    series: [...litters].sort(compareLitters).map(buildLitterSeries),
  };
}

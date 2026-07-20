export type LitterAgeComparisonChartMode = "weight" | "relative";

export type LitterAgeComparisonChartInput = readonly {
  publicLabel: string;
  seriesIndex: number;
  eligibleAnimalCount: number;
  points: readonly {
    ageDay: number;
    observedAnimalCount: number;
    averageGrams: number;
    averageRelativeIndex: number;
  }[];
}[];

export type LitterAgeComparisonChartPlot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LitterAgeComparisonChartPoint = {
  ageDay: number;
  value: number;
  observedAnimalCount: number;
  eligibleAnimalCount: number;
  x: number;
  y: number;
};

export type LitterAgeComparisonChartSeries = {
  publicLabel: string;
  seriesIndex: number;
  points: LitterAgeComparisonChartPoint[];
};

export type LitterAgeComparisonChartDomain = {
  minAgeDay: number;
  maxAgeDay: number;
  minValue: number;
  maxValue: number;
  ageDayTicks: number[];
  valueTicks: number[];
};

export type LitterAgeComparisonChartModel = {
  mode: LitterAgeComparisonChartMode;
  domain: LitterAgeComparisonChartDomain | null;
  series: LitterAgeComparisonChartSeries[];
  emptySeries: Array<{ publicLabel: string; seriesIndex: number }>;
  referenceY: number | null;
};

const MAX_TICK_COUNT = 6;

function linearTicks(min: number, max: number, count = 5) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function ageDayTicks(min: number, max: number) {
  const extent = max - min;
  const step = Math.max(1, Math.ceil(extent / (MAX_TICK_COUNT - 1)));
  const ticks: number[] = [];

  for (let value = min; value <= max; value += step) ticks.push(value);
  if (ticks.at(-1) !== max) ticks.push(max);
  return ticks;
}

function buildDomain(
  ageDays: readonly number[],
  values: readonly number[],
  mode: LitterAgeComparisonChartMode,
): LitterAgeComparisonChartDomain {
  const observedMinAgeDay = Math.min(...ageDays);
  const observedMaxAgeDay = Math.max(...ageDays);
  const minAgeDay =
    observedMinAgeDay === observedMaxAgeDay
      ? Math.max(0, observedMinAgeDay - 1)
      : observedMinAgeDay;
  const maxAgeDay =
    observedMinAgeDay === observedMaxAgeDay
      ? observedMaxAgeDay + 1
      : observedMaxAgeDay;
  const valuesForDomain = mode === "relative" ? [...values, 100] : values;
  const observedMinValue = Math.min(...valuesForDomain);
  const observedMaxValue = Math.max(...valuesForDomain);
  const extent = observedMaxValue - observedMinValue;
  const padding = extent === 0 ? Math.max(Math.abs(observedMinValue) * 0.1, 1) : extent * 0.1;
  const minValue = Math.max(0, observedMinValue - padding);
  const maxValue = observedMaxValue + padding;

  return {
    minAgeDay,
    maxAgeDay,
    minValue,
    maxValue,
    ageDayTicks: ageDayTicks(minAgeDay, maxAgeDay),
    valueTicks: linearTicks(minValue, maxValue),
  };
}

export function projectLitterAgeComparisonPoint(
  point: { ageDay: number; value: number },
  domain: LitterAgeComparisonChartDomain,
  plot: LitterAgeComparisonChartPlot,
) {
  const ageRatio = (point.ageDay - domain.minAgeDay) / (domain.maxAgeDay - domain.minAgeDay);
  const valueRatio = (point.value - domain.minValue) / (domain.maxValue - domain.minValue);

  return {
    x: plot.left + ageRatio * plot.width,
    y: plot.top + (1 - valueRatio) * plot.height,
  };
}

export function buildLitterAgeComparisonChartModel(
  input: LitterAgeComparisonChartInput,
  mode: LitterAgeComparisonChartMode,
  plot: LitterAgeComparisonChartPlot,
): LitterAgeComparisonChartModel {
  const ordered = [...input].sort(
    (left, right) =>
      left.seriesIndex - right.seriesIndex ||
      (left.publicLabel < right.publicLabel
        ? -1
        : left.publicLabel > right.publicLabel
          ? 1
          : 0),
  );
  const emptySeries = ordered
    .filter((item) => item.points.length === 0)
    .map(({ publicLabel, seriesIndex }) => ({ publicLabel, seriesIndex }));
  const observedSeries = ordered.filter((item) => item.points.length > 0);
  const ageDays = observedSeries.flatMap((item) =>
    item.points.map((point) => point.ageDay),
  );
  const values = observedSeries.flatMap((item) =>
    item.points.map((point) =>
      mode === "weight" ? point.averageGrams : point.averageRelativeIndex,
    ),
  );

  if (ageDays.length === 0) {
    return { mode, domain: null, series: [], emptySeries, referenceY: null };
  }

  const domain = buildDomain(ageDays, values, mode);
  const series = observedSeries.map((item) => ({
    publicLabel: item.publicLabel,
    seriesIndex: item.seriesIndex,
    points: [...item.points]
      .sort((left, right) => left.ageDay - right.ageDay)
      .map((point) => {
        const value =
          mode === "weight" ? point.averageGrams : point.averageRelativeIndex;
        return {
          ageDay: point.ageDay,
          value,
          observedAnimalCount: point.observedAnimalCount,
          eligibleAnimalCount: item.eligibleAnimalCount,
          ...projectLitterAgeComparisonPoint(
            { ageDay: point.ageDay, value },
            domain,
            plot,
          ),
        };
      }),
  }));
  const referenceY =
    mode === "relative"
      ? projectLitterAgeComparisonPoint(
          { ageDay: domain.minAgeDay, value: 100 },
          domain,
          plot,
        ).y
      : null;

  return { mode, domain, series, emptySeries, referenceY };
}

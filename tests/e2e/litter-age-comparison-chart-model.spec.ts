import { expect, test } from "@playwright/test";

import {
  buildLitterAgeComparisonChartModel,
  type LitterAgeComparisonChartInput,
} from "../../src/features/litter-age-comparison/litter-age-comparison-chart-model";

const plot = { left: 50, top: 20, width: 500, height: 200 } as const;

function series(
  publicLabel: string,
  seriesIndex: number,
  points: Array<{
    ageDay: number;
    averageGrams: number;
    averageRelativeIndex: number;
    observedAnimalCount?: number;
  }>,
): LitterAgeComparisonChartInput[number] {
  return {
    publicLabel,
    seriesIndex,
    eligibleAnimalCount: 3,
    points: points.map((point) => ({
      observedAnimalCount: 2,
      ...point,
    })),
  };
}

test("projette le poids moyen et conserve la couverture", () => {
  const model = buildLitterAgeComparisonChartModel(
    [series("Portée A", 0, [
      { ageDay: 0, averageGrams: 300, averageRelativeIndex: 100 },
      { ageDay: 2, averageGrams: 450, averageRelativeIndex: 150, observedAnimalCount: 1 },
    ])],
    "weight",
    plot,
  );

  expect(model.domain).not.toBeNull();
  expect(model.series[0].points.map(({ ageDay, value }) => ({ ageDay, value }))).toEqual([
    { ageDay: 0, value: 300 },
    { ageDay: 2, value: 450 },
  ]);
  expect(model.series[0].points[1]).toMatchObject({
    observedAnimalCount: 1,
    eligibleAnimalCount: 3,
  });
  expect(model.series[0].points[0].x).toBe(plot.left);
  expect(model.series[0].points[1].x).toBe(plot.left + plot.width);
});

test("projette l’indice base 100 et fournit son repère", () => {
  const model = buildLitterAgeComparisonChartModel(
    [series("Portée A", 0, [
      { ageDay: 0, averageGrams: 300, averageRelativeIndex: 100 },
      { ageDay: 3, averageGrams: 420, averageRelativeIndex: 140 },
    ])],
    "relative",
    plot,
  );

  expect(model.series[0].points.map((point) => point.value)).toEqual([100, 140]);
  expect(model.referenceY).toBe(model.series[0].points[0].y);
});

test("préserve exactement les jours fournis sans point artificiel", () => {
  const model = buildLitterAgeComparisonChartModel(
    [series("Portée A", 0, [
      { ageDay: 0, averageGrams: 300, averageRelativeIndex: 100 },
      { ageDay: 4, averageGrams: 500, averageRelativeIndex: 166.7 },
    ])],
    "weight",
    plot,
  );

  expect(model.series[0].points.map((point) => point.ageDay)).toEqual([0, 4]);
  expect(model.series[0].points).toHaveLength(2);
});

test("gère une seule journée et des valeurs identiques", () => {
  const model = buildLitterAgeComparisonChartModel(
    [
      series("Portée A", 1, [{ ageDay: 2, averageGrams: 400, averageRelativeIndex: 100 }]),
      series("Portée B", 2, [{ ageDay: 2, averageGrams: 400, averageRelativeIndex: 100 }]),
    ],
    "weight",
    plot,
  );

  expect(model.domain!.minAgeDay).toBeLessThan(model.domain!.maxAgeDay);
  expect(model.domain!.minValue).toBeLessThan(400);
  expect(model.domain!.maxValue).toBeGreaterThan(400);
  for (const item of model.series) {
    expect(Number.isFinite(item.points[0].x)).toBe(true);
    expect(Number.isFinite(item.points[0].y)).toBe(true);
  }
});

test("omet du tracé une portée vide et conserve un ordre déterministe", () => {
  const model = buildLitterAgeComparisonChartModel(
    [
      series("Portée C", 3, [{ ageDay: 0, averageGrams: 500, averageRelativeIndex: 100 }]),
      series("Portée vide", 2, []),
      series("Portée A", 1, [{ ageDay: 0, averageGrams: 300, averageRelativeIndex: 100 }]),
    ],
    "weight",
    plot,
  );

  expect(model.series.map((item) => item.seriesIndex)).toEqual([1, 3]);
  expect(model.emptySeries).toEqual([{ publicLabel: "Portée vide", seriesIndex: 2 }]);
});

test("ne mute pas les séries ni leurs points", () => {
  const input = [
    series("Portée B", 2, [{ ageDay: 1, averageGrams: 420, averageRelativeIndex: 120 }]),
    series("Portée A", 1, [{ ageDay: 0, averageGrams: 350, averageRelativeIndex: 100 }]),
  ];
  const snapshot = structuredClone(input);

  buildLitterAgeComparisonChartModel(input, "weight", plot);

  expect(input).toEqual(snapshot);
});

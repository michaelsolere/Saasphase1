import { expect, test } from "@playwright/test";

import {
  buildGrowthChartDomain,
  buildLitterGrowthModel,
  buildLitterRelativeGrowthSeries,
  buildLitterGrowthSeries,
  buildRelativeGrowthChartDomain,
  formatObservedInterval,
  projectGrowthPoint,
  type LitterGrowthPoint,
} from "../../src/features/litter-weights/litter-growth-chart-model";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "../../src/features/litter-weights/litter-weights-core";

function animal(
  id: string,
  overrides: Partial<LitterWeightHistoryAnimal> = {},
): LitterWeightHistoryAnimal {
  return {
    id,
    ownershipStatus: "produced",
    birthOrder: null,
    sex: "unknown",
    callName: null,
    officialName: null,
    initialCollarColor: null,
    currentCollarColor: null,
    status: "born",
    birthDate: "2026-07-18",
    deathDate: null,
    birthWeightGrams: null,
    ...overrides,
  };
}

function measurement(
  id: string,
  animalId: string,
  measuredAt: string,
  grams: number,
  type: "birth" | "routine" = "routine",
): LitterWeightHistoryMeasurement {
  return {
    id,
    animalId,
    sessionId: type === "routine" ? "session" : null,
    type,
    grams,
    measuredAt,
    note: null,
    createdBy: "author",
    createdAt: measuredAt,
  };
}

function point(timestamp: number, grams: number): LitterGrowthPoint {
  return {
    internalId: `${timestamp}-${grams}`,
    measuredAt: new Date(timestamp).toISOString(),
    timestamp,
    grams,
    type: "routine",
  };
}

test("ordonne les séries selon les animaux reçus", () => {
  const animals = [
    animal("animal-b", { callName: "Bêta" }),
    animal("animal-a", { callName: "Alpha" }),
    animal("animal-c", { callName: "Charlie" }),
  ];
  const measurements = [
    measurement("m-a", "animal-a", "2026-07-19T10:00:00Z", 420),
    measurement("m-c", "animal-c", "2026-07-19T10:00:00Z", 430),
    measurement("m-b", "animal-b", "2026-07-19T10:00:00Z", 410),
  ];

  expect(buildLitterGrowthSeries(animals, measurements).map((item) => item.publicLabel)).toEqual([
    "Bêta",
    "Alpha",
    "Charlie",
  ]);
});

test("trie les mesures chronologiquement et conserve la dernière", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a", { callName: "Alpha" })],
    [
      measurement("latest", "animal-a", "2026-07-20T10:00:00Z", 450),
      measurement("first", "animal-a", "2026-07-18T10:00:00Z", 350, "birth"),
      measurement("middle", "animal-a", "2026-07-19T10:00:00Z", 400),
    ],
  );

  expect(series[0].points.map((item) => item.internalId)).toEqual([
    "first",
    "middle",
    "latest",
  ]);
  expect(series[0].latestMeasurement.internalId).toBe("latest");
});

test("calcule la progression relative depuis l’unique mesure birth réelle", () => {
  const animals = [
    animal("birth-only", { callName: "Naissance seule" }),
    animal("positive", { callName: "Hausse" }),
    animal("negative", { callName: "Baisse" }),
    animal("declared-only", {
      callName: "Poids déclaré seulement",
      birthWeightGrams: 375,
    }),
  ];
  const measurements = [
    measurement("positive-latest", "positive", "2026-07-20T10:00:00Z", 430),
    measurement("negative-latest", "negative", "2026-07-19T11:00:00Z", 360),
    measurement("positive-before-birth", "positive", "2026-07-18T09:00:00Z", 330),
    measurement("birth-only", "birth-only", "2026-07-18T12:00:00Z", 300, "birth"),
    measurement("declared-routine", "declared-only", "2026-07-19T12:00:00Z", 410),
    measurement("negative-birth", "negative", "2026-07-18T11:00:00Z", 400, "birth"),
    measurement("positive-birth", "positive", "2026-07-18T10:00:00Z", 340, "birth"),
  ];

  const model = buildLitterGrowthModel(animals, measurements);

  expect(model.relativeSeries.map((item) => item.publicLabel)).toEqual([
    "Naissance seule",
    "Hausse",
    "Baisse",
  ]);
  expect(model.relativeSeries[0].points).toHaveLength(1);
  expect(model.relativeSeries[0].points[0]).toMatchObject({
    internalId: "birth-only",
    elapsedMilliseconds: 0,
    index: 100,
  });
  expect(model.relativeSeries[1].points.map((item) => item.internalId)).toEqual([
    "positive-birth",
    "positive-latest",
  ]);
  expect(model.relativeSeries[1].latestPoint.index).toBeCloseTo(
    (430 / 340) * 100,
    12,
  );
  expect(model.relativeSeries[1].latestPoint.elapsedMilliseconds).toBe(
    2 * 24 * 60 * 60 * 1_000,
  );
  expect(model.relativeSeries[2].latestPoint.index).toBe(90);
  expect(model.indicators.map((item) => item.relativeProgressPercentage)).toEqual([
    0,
    (430 / 340) * 100 - 100,
    -10,
    null,
  ]);
  expect(model.relativeSeries.flatMap((item) => item.points)).toHaveLength(5);
});

test("donne le même indice à des poids de départ différents pour une même progression", () => {
  const relativeSeries = buildLitterRelativeGrowthSeries(
    [animal("small"), animal("large")],
    [
      measurement("large-routine", "large", "2026-07-20T22:00:00Z", 600),
      measurement("small-birth", "small", "2026-07-18T10:00:00Z", 200, "birth"),
      measurement("large-birth", "large", "2026-07-18T22:00:00Z", 400, "birth"),
      measurement("small-routine", "small", "2026-07-19T10:00:00Z", 300),
    ],
  );

  expect(relativeSeries[0].latestPoint.index).toBe(150);
  expect(relativeSeries[1].latestPoint.index).toBe(150);
  expect(relativeSeries[0].latestPoint.elapsedMilliseconds).toBe(
    24 * 60 * 60 * 1_000,
  );
  expect(relativeSeries[1].latestPoint.elapsedMilliseconds).toBe(
    2 * 24 * 60 * 60 * 1_000,
  );
});

test("reste déterministe lorsque les mesures arrivent dans l’ordre inverse", () => {
  const animals = [animal("animal-a")];
  const measurements = [
    measurement("routine-b", "animal-a", "2026-07-19T10:00:00Z", 420),
    measurement("birth", "animal-a", "2026-07-18T10:00:00Z", 350, "birth"),
    measurement("routine-a", "animal-a", "2026-07-19T10:00:00Z", 410),
  ];

  const forward = buildLitterGrowthModel(animals, measurements);
  const reverse = buildLitterGrowthModel(animals, [...measurements].reverse());

  expect(reverse).toEqual(forward);
  expect(forward.relativeSeries[0].points.map((item) => item.internalId)).toEqual([
    "birth",
    "routine-a",
    "routine-b",
  ]);
});

test("construit les repères de tous les animaux à partir des mesures réelles désordonnées", () => {
  const animals = [
    animal("none", { callName: "Sans mesure", birthWeightGrams: 375 }),
    animal("single", { callName: "Unique" }),
    animal("positive", { callName: "Hausse" }),
    animal("zero", { callName: "Stable" }),
    animal("negative", { callName: "Baisse" }),
  ];
  const measurements = [
    measurement("positive-latest", "positive", "2026-07-20T12:30:00Z", 430),
    measurement("negative-first", "negative", "2026-07-18T11:00:00Z", 410),
    measurement("zero-latest", "zero", "2026-07-19T12:00:00Z", 400),
    measurement("single-only", "single", "2026-07-19T10:00:00Z", 390),
    measurement("positive-first", "positive", "2026-07-18T10:00:00Z", 350, "birth"),
    measurement("negative-latest", "negative", "2026-07-20T11:00:00Z", 390),
    measurement("zero-first", "zero", "2026-07-19T10:00:00Z", 400),
  ];

  const model = buildLitterGrowthModel(animals, measurements);

  expect(model.indicators.map((indicator) => indicator.publicLabel)).toEqual([
    "Sans mesure",
    "Unique",
    "Hausse",
    "Stable",
    "Baisse",
  ]);
  expect(model.series).toHaveLength(4);
  expect(model.indicators[0]).toMatchObject({
    measurementCount: 0,
    latestMeasurement: null,
    previousMeasurement: null,
    differenceGrams: null,
    intervalMilliseconds: null,
  });
  expect(model.indicators[1]).toMatchObject({
    measurementCount: 1,
    previousMeasurement: null,
    differenceGrams: null,
    intervalMilliseconds: null,
  });
  expect(model.indicators[1].latestMeasurement?.internalId).toBe("single-only");
  expect(model.indicators[2]).toMatchObject({
    measurementCount: 2,
    differenceGrams: 80,
    intervalMilliseconds: 2 * 24 * 60 * 60 * 1_000 + 2.5 * 60 * 60 * 1_000,
  });
  expect(model.indicators[2].previousMeasurement?.internalId).toBe("positive-first");
  expect(model.indicators[2].latestMeasurement?.internalId).toBe("positive-latest");
  expect(model.indicators[3]).toMatchObject({
    differenceGrams: 0,
    intervalMilliseconds: 2 * 60 * 60 * 1_000,
  });
  expect(model.indicators[4]).toMatchObject({
    differenceGrams: -20,
    intervalMilliseconds: 2 * 24 * 60 * 60 * 1_000,
  });
});

test("calcule l’intervalle uniquement entre les deux dernières mesures", () => {
  const { indicators } = buildLitterGrowthModel(
    [animal("animal-a")],
    [
      measurement("latest", "animal-a", "2026-07-20T18:45:00Z", 460),
      measurement("oldest", "animal-a", "2026-07-01T08:00:00Z", 300),
      measurement("previous", "animal-a", "2026-07-19T16:15:00Z", 440),
    ],
  );

  expect(indicators[0].previousMeasurement?.internalId).toBe("previous");
  expect(indicators[0].latestMeasurement?.internalId).toBe("latest");
  expect(indicators[0].differenceGrams).toBe(20);
  expect(indicators[0].intervalMilliseconds).toBe(
    24 * 60 * 60 * 1_000 + 2.5 * 60 * 60 * 1_000,
  );
  expect(formatObservedInterval(indicators[0].intervalMilliseconds!)).toBe(
    "1 j 2 h 30 min",
  );
});

test("sépare strictement les mesures des animaux", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a"), animal("animal-b")],
    [
      measurement("a-1", "animal-a", "2026-07-18T10:00:00Z", 350),
      measurement("b-1", "animal-b", "2026-07-18T10:00:00Z", 360),
      measurement("a-2", "animal-a", "2026-07-19T10:00:00Z", 410),
    ],
  );

  expect(series[0].points.map((item) => item.internalId)).toEqual(["a-1", "a-2"]);
  expect(series[1].points.map((item) => item.internalId)).toEqual(["b-1"]);
});

test("conserve les mesures birth et routine", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a")],
    [
      measurement("birth", "animal-a", "2026-07-18T10:00:00Z", 350, "birth"),
      measurement("routine", "animal-a", "2026-07-19T10:00:00Z", 410, "routine"),
    ],
  );

  expect(series[0].points.map((item) => item.type)).toEqual(["birth", "routine"]);
});

test("ignore le poids de naissance déclaré lorsqu’aucune mesure réelle n’existe", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a", { birthWeightGrams: 375 })],
    [],
  );

  expect(series).toEqual([]);
});

test("rend la progression indisponible sans birth réelle même avec une routine", () => {
  const model = buildLitterGrowthModel(
    [animal("animal-a", { birthWeightGrams: 375 })],
    [measurement("routine", "animal-a", "2026-07-19T10:00:00Z", 410)],
  );

  expect(model.series).toHaveLength(1);
  expect(model.relativeSeries).toEqual([]);
  expect(model.indicators[0].relativeProgressPercentage).toBeNull();
});

test("exclut un animal sans mesure des séries", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a"), animal("animal-b")],
    [measurement("a-1", "animal-a", "2026-07-18T10:00:00Z", 350)],
  );

  expect(series).toHaveLength(1);
  expect(series[0].internalId).toBe("animal-a");
});

test("conserve une série composée d’un point unique", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a")],
    [measurement("a-1", "animal-a", "2026-07-18T10:00:00Z", 350)],
  );

  expect(series[0].points).toHaveLength(1);
});

test("conserve des timestamps identiques entre animaux", () => {
  const series = buildLitterGrowthSeries(
    [animal("animal-a"), animal("animal-b")],
    [
      measurement("a-1", "animal-a", "2026-07-18T10:00:00Z", 350),
      measurement("b-1", "animal-b", "2026-07-18T10:00:00Z", 360),
    ],
  );

  expect(series[0].points[0].timestamp).toBe(series[1].points[0].timestamp);
  expect(series).toHaveLength(2);
});

test("construit un domaine exploitable avec un poids unique", () => {
  const domain = buildGrowthChartDomain([point(Date.parse("2026-07-18T10:00:00Z"), 400)]);

  expect(domain).not.toBeNull();
  expect(domain!.minGrams).toBeLessThan(400);
  expect(domain!.maxGrams).toBeGreaterThan(400);
  expect(domain!.minTimestamp).toBeLessThan(domain!.maxTimestamp);
  expect(domain!.gramTicks.length).toBeLessThanOrEqual(5);
  expect(domain!.timestampTicks.length).toBeLessThanOrEqual(5);
});

test("ne crée jamais de domaine vertical négatif", () => {
  const domain = buildGrowthChartDomain([
    point(Date.parse("2026-07-18T10:00:00Z"), 1),
    point(Date.parse("2026-07-19T10:00:00Z"), 5),
  ]);

  expect(domain!.minGrams).toBe(0);
});

test("retourne un domaine nul pour un jeu vide", () => {
  expect(buildGrowthChartDomain([])).toBeNull();
});

test("ancre le domaine relatif à zéro sans inventer de point", () => {
  const relativeSeries = buildLitterRelativeGrowthSeries(
    [animal("animal-a")],
    [measurement("birth", "animal-a", "2026-07-18T10:00:00Z", 350, "birth")],
  );
  const domain = buildRelativeGrowthChartDomain(relativeSeries[0].points);

  expect(relativeSeries[0].points).toHaveLength(1);
  expect(domain).not.toBeNull();
  expect(domain!.minTimestamp).toBe(0);
  expect(domain!.maxTimestamp).toBeGreaterThan(0);
  expect(domain!.minGrams).toBeLessThan(100);
  expect(domain!.maxGrams).toBeGreaterThan(100);
});

test("borne la projection dans la zone SVG", () => {
  const points = [
    point(Date.parse("2026-07-18T10:00:00Z"), 300),
    point(Date.parse("2026-07-20T10:00:00Z"), 500),
  ];
  const domain = buildGrowthChartDomain(points)!;
  const plot = { left: 68, top: 22, width: 670, height: 238 };
  const projected = [
    ...points.map((item) => projectGrowthPoint(item, domain, plot)),
    projectGrowthPoint({ timestamp: 0, grams: -1_000 }, domain, plot),
    projectGrowthPoint({ timestamp: Number.MAX_SAFE_INTEGER, grams: 1_000_000 }, domain, plot),
  ];

  for (const item of projected) {
    expect(item.x).toBeGreaterThanOrEqual(plot.left);
    expect(item.x).toBeLessThanOrEqual(plot.left + plot.width);
    expect(item.y).toBeGreaterThanOrEqual(plot.top);
    expect(item.y).toBeLessThanOrEqual(plot.top + plot.height);
  }
});

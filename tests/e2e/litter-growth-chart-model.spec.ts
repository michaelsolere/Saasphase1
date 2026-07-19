import { expect, test } from "@playwright/test";

import {
  buildGrowthChartDomain,
  buildLitterGrowthSeries,
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

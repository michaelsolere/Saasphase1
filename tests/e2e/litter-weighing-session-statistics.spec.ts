import { expect, test } from "@playwright/test";

import { buildLitterWeighingSessionStatistics } from "../../src/features/litter-weights/litter-weighing-session-statistics";

test("calcule compteur, moyenne, minimum et maximum par séance", () => {
  const statistics = buildLitterWeighingSessionStatistics([
    { sessionId: "complete", grams: 430 },
    { sessionId: "partial", grams: 455 },
    { sessionId: "complete", grams: 440 },
    { sessionId: "partial", grams: 465 },
    { sessionId: "complete", grams: 450 },
  ]);

  expect(statistics.get("complete")).toEqual({
    measurementCount: 3,
    averageGrams: 440,
    minimumGrams: 430,
    maximumGrams: 450,
  });
  expect(statistics.get("partial")).toEqual({
    measurementCount: 2,
    averageGrams: 460,
    minimumGrams: 455,
    maximumGrams: 465,
  });
});

test("conserve une moyenne non entière sans arrondi prématuré", () => {
  const statistics = buildLitterWeighingSessionStatistics([
    { sessionId: "fractional", grams: 430 },
    { sessionId: "fractional", grams: 440 },
    { sessionId: "fractional", grams: 455 },
  ]);

  expect(statistics.get("fractional")?.averageGrams).toBe(1325 / 3);
});

test("reste indépendant de l’ordre des lignes et sépare les séances", () => {
  const rows = [
    { sessionId: "session-b", grams: 465 },
    { sessionId: "session-a", grams: 450 },
    { sessionId: "session-b", grams: 455 },
    { sessionId: "session-a", grams: 430 },
    { sessionId: "session-a", grams: 440 },
  ];

  expect(buildLitterWeighingSessionStatistics([...rows].reverse())).toEqual(
    buildLitterWeighingSessionStatistics(rows),
  );
});

test("retourne les valeurs brutes pour une séance à une seule mesure", () => {
  expect(
    buildLitterWeighingSessionStatistics([
      { sessionId: "single", grams: 447 },
    ]).get("single"),
  ).toEqual({
    measurementCount: 1,
    averageGrams: 447,
    minimumGrams: 447,
    maximumGrams: 447,
  });
});

test("ne produit aucune statistique pour une séance vide", () => {
  expect(buildLitterWeighingSessionStatistics([])).toEqual(new Map());
});

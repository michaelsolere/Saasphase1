import { expect, test } from "@playwright/test";

import {
  buildAnimalWeightRelativeSeries,
  type AnimalWeightMeasurementInput,
} from "../../src/features/litter-weights/animal-weight-relative-series";

const HOUR_MS = 60 * 60 * 1_000;

function measurement(
  internalId: string,
  measuredAt: string,
  grams: number,
  type: "birth" | "routine" = "routine",
): AnimalWeightMeasurementInput {
  return { internalId, measuredAt, grams, type };
}

test("normalise une série réelle désordonnée depuis la naissance", () => {
  const result = buildAnimalWeightRelativeSeries([
    measurement("after-48h", "2026-07-20T10:00:00Z", 430),
    measurement("before", "2026-07-18T09:00:00Z", 320),
    measurement("birth", "2026-07-18T10:00:00Z", 340, "birth"),
  ]);

  expect(result.status).toBe("available");
  if (result.status !== "available") return;

  expect(result.points.map((point) => point.internalId)).toEqual([
    "birth",
    "after-48h",
  ]);
  expect(result.points[0]).toMatchObject({
    internalId: "birth",
    elapsedMilliseconds: 0,
    index: 100,
  });
  expect(result.points[1].elapsedMilliseconds).toBe(48 * HOUR_MS);
  expect(result.points[1].index).toBe((430 / 340) * 100);
  expect(result.latestPoint).toEqual(result.points[1]);
  expect(result.latestPoint.index - 100).toBe((430 / 340) * 100 - 100);
});

test("conserve une naissance seule comme unique point à l’indice 100", () => {
  const result = buildAnimalWeightRelativeSeries([
    measurement("birth", "2026-07-18T10:00:00Z", 340, "birth"),
  ]);

  expect(result).toMatchObject({
    status: "available",
    birthMeasurement: { internalId: "birth", grams: 340 },
    points: [
      { internalId: "birth", elapsedMilliseconds: 0, index: 100 },
    ],
    latestPoint: {
      internalId: "birth",
      elapsedMilliseconds: 0,
      index: 100,
    },
  });
});

test("accepte une baisse réelle sans jugement ni rejet", () => {
  const result = buildAnimalWeightRelativeSeries([
    measurement("birth", "2026-07-18T10:00:00Z", 400, "birth"),
    measurement("lower", "2026-07-19T10:00:00Z", 360),
  ]);

  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.latestPoint.index).toBe(90);
});

test("reste indisponible lorsque la naissance réelle manque ou est ambiguë", () => {
  const unavailableCases: AnimalWeightMeasurementInput[][] = [
    [measurement("routine", "2026-07-18T10:00:00Z", 340)],
    [
      measurement("birth-a", "2026-07-18T10:00:00Z", 340, "birth"),
      measurement("birth-b", "2026-07-18T11:00:00Z", 350, "birth"),
    ],
    [measurement("zero-birth", "2026-07-18T10:00:00Z", 0, "birth")],
    [measurement("invalid-birth", "date-invalide", 340, "birth")],
  ];

  for (const measurements of unavailableCases) {
    expect(buildAnimalWeightRelativeSeries(measurements)).toEqual({
      status: "missing_or_ambiguous_birth",
      birthMeasurement: null,
      points: [],
      latestPoint: null,
    });
  }
});

test("trie de façon déterministe à timestamp identique", () => {
  const measurements = [
    measurement("routine-b", "2026-07-18T10:00:00Z", 370),
    measurement("routine-a", "2026-07-18T10:00:00Z", 360),
    measurement("birth", "2026-07-18T10:00:00Z", 340, "birth"),
  ];

  const forward = buildAnimalWeightRelativeSeries(measurements);
  const reverse = buildAnimalWeightRelativeSeries([...measurements].reverse());

  expect(reverse).toEqual(forward);
  expect(forward.status).toBe("available");
  if (forward.status !== "available") return;
  expect(forward.points.map((point) => point.internalId)).toEqual([
    "birth",
    "routine-a",
    "routine-b",
  ]);
});

test("normalise indépendamment de l’heure absolue de naissance", () => {
  const early = buildAnimalWeightRelativeSeries([
    measurement("early-birth", "2026-07-18T02:00:00Z", 200, "birth"),
    measurement("early-latest", "2026-07-19T14:00:00Z", 300),
  ]);
  const late = buildAnimalWeightRelativeSeries([
    measurement("late-birth", "2026-08-03T19:30:00Z", 400, "birth"),
    measurement("late-latest", "2026-08-05T07:30:00Z", 600),
  ]);

  expect(early.status).toBe("available");
  expect(late.status).toBe("available");
  if (early.status !== "available" || late.status !== "available") return;
  expect(
    early.points.map(({ elapsedMilliseconds, index }) => ({
      elapsedMilliseconds,
      index,
    })),
  ).toEqual(
    late.points.map(({ elapsedMilliseconds, index }) => ({
      elapsedMilliseconds,
      index,
    })),
  );
});

test("n’interpole aucun point, ne mute pas les entrées et n’utilise pas l’heure courante", () => {
  const inputs = [
    measurement("latest", "2026-07-20T10:00:00Z", 430),
    measurement("birth", "2026-07-18T10:00:00Z", 340, "birth"),
  ];
  const snapshot = structuredClone(inputs);
  inputs.forEach(Object.freeze);
  Object.freeze(inputs);
  const originalDateNow = Date.now;
  let result;

  try {
    Date.now = () => {
      throw new Error("Le moteur ne doit pas lire l’heure courante.");
    };
    result = buildAnimalWeightRelativeSeries(inputs);
  } finally {
    Date.now = originalDateNow;
  }

  expect(inputs).toEqual(snapshot);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.points).toHaveLength(inputs.length);
  expect(result.points.map((point) => point.internalId)).toEqual([
    "birth",
    "latest",
  ]);
});

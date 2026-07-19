import { expect, test } from "@playwright/test";

import type { AnimalWeightMeasurementInput } from "../../src/features/litter-weights/animal-weight-relative-series";
import {
  buildLitterAgeComparisonModel,
  type LitterAgeComparisonInput,
} from "../../src/features/litter-weights/litter-age-comparison-model";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

function measuredAt(birthAt: string, elapsedMilliseconds: number) {
  return new Date(Date.parse(birthAt) + elapsedMilliseconds).toISOString();
}

function measurement(
  internalId: string,
  measuredAtValue: string,
  grams: number,
  type: "birth" | "routine" = "routine",
): AnimalWeightMeasurementInput {
  return { internalId, measuredAt: measuredAtValue, grams, type };
}

function litter(
  internalId: string,
  animals: LitterAgeComparisonInput["animals"],
  seriesIndex = 0,
): LitterAgeComparisonInput {
  return {
    internalId,
    publicLabel: `Portée ${internalId}`,
    seriesIndex,
    animals,
  };
}

function animal(
  internalId: string,
  measurements: readonly AnimalWeightMeasurementInput[],
) {
  return { internalId, measurements };
}

test("compare les âges réels sans dépendre des dates absolues", () => {
  const earlyBirth = "2026-01-04T08:15:00.000Z";
  const lateBirth = "2026-06-21T19:45:00.000Z";
  const model = buildLitterAgeComparisonModel([
    litter("late", [
      animal("late-animal", [
        measurement("late-j2", measuredAt(lateBirth, 2 * DAY_MS), 600),
        measurement("late-birth", lateBirth, 400, "birth"),
        measurement("late-j1", measuredAt(lateBirth, DAY_MS), 500),
      ]),
    ], 2),
    litter("early", [
      animal("early-animal", [
        measurement("early-j1", measuredAt(earlyBirth, DAY_MS), 250),
        measurement("early-birth", earlyBirth, 200, "birth"),
        measurement("early-j2", measuredAt(earlyBirth, 2 * DAY_MS), 300),
      ]),
    ], 1),
  ]);

  expect(model.series.map((series) => series.internalId)).toEqual([
    "early",
    "late",
  ]);
  expect(
    model.series.map((series) =>
      series.points.map(({ ageDay, averageRelativeIndex }) => ({
        ageDay,
        averageRelativeIndex,
      })),
    ),
  ).toEqual([
    [
      { ageDay: 0, averageRelativeIndex: 100 },
      { ageDay: 1, averageRelativeIndex: 125 },
      { ageDay: 2, averageRelativeIndex: 150 },
    ],
    [
      { ageDay: 0, averageRelativeIndex: 100 },
      { ageDay: 1, averageRelativeIndex: 125 },
      { ageDay: 2, averageRelativeIndex: 150 },
    ],
  ]);
});

test("calcule les moyennes brutes sur les mêmes animaux observés", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const series = buildLitterAgeComparisonModel([
    litter("average", [
      animal("animal-a", [
        measurement("a-birth", birthAt, 320, "birth"),
        measurement("a-j2", measuredAt(birthAt, 2 * DAY_MS), 400),
      ]),
      animal("animal-b", [
        measurement("b-birth", birthAt, 1_000 / 3, "birth"),
        measurement("b-j2", measuredAt(birthAt, 2 * DAY_MS), 500),
      ]),
    ]),
  ]).series[0];

  expect(series.points[1]).toEqual({
    ageDay: 2,
    observedAnimalCount: 2,
    averageGrams: 450,
    averageRelativeIndex: 137.5,
    averageRelativeProgressPercentage: 37.5,
  });
});

test("ne retient que la dernière mesure de chaque animal pour un jour d’âge", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const series = buildLitterAgeComparisonModel([
    litter("daily-last", [
      animal("animal-a", [
        measurement("a-j1-late", measuredAt(birthAt, DAY_MS + 10 * HOUR_MS), 430),
        measurement("a-birth", birthAt, 400, "birth"),
        measurement("a-j1-early", measuredAt(birthAt, DAY_MS + 2 * HOUR_MS), 410),
      ]),
      animal("animal-b", [
        measurement("b-j1", measuredAt(birthAt, DAY_MS + 5 * HOUR_MS), 450),
        measurement("b-birth", birthAt, 300, "birth"),
      ]),
    ]),
  ]).series[0];

  expect(series.points[1]).toEqual({
    ageDay: 1,
    observedAnimalCount: 2,
    averageGrams: 440,
    averageRelativeIndex: 128.75,
    averageRelativeProgressPercentage: 28.75,
  });
});

test("rend explicite la couverture d’une pesée partielle", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const series = buildLitterAgeComparisonModel([
    litter("partial", [
      animal("animal-a", [
        measurement("a-birth", birthAt, 300, "birth"),
        measurement("a-j3", measuredAt(birthAt, 3 * DAY_MS), 450),
      ]),
      animal("animal-b", [
        measurement("b-birth", birthAt, 320, "birth"),
        measurement("b-j3", measuredAt(birthAt, 3 * DAY_MS), 480),
      ]),
      animal("animal-c", [
        measurement("c-birth", birthAt, 340, "birth"),
      ]),
    ]),
  ]).series[0];

  expect(series.eligibleAnimalCount).toBe(3);
  expect(series.points.find((point) => point.ageDay === 3)).toMatchObject({
    observedAnimalCount: 2,
    averageGrams: 465,
  });
});

test("ne crée aucun jour manquant et ne reporte aucune mesure", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const series = buildLitterAgeComparisonModel([
    litter("missing-day", [
      animal("animal-a", [
        measurement("birth", birthAt, 300, "birth"),
        measurement("j2", measuredAt(birthAt, 2 * DAY_MS), 420),
      ]),
    ]),
  ]).series[0];

  expect(series.points.map((point) => point.ageDay)).toEqual([0, 2]);
});

test("utilise des frontières exactes de périodes de 24 heures", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const elapsedCases = [
    { internalId: "at-23h59", elapsed: 23 * HOUR_MS + 59 * 60 * 1_000, days: [0] },
    { internalId: "at-24h", elapsed: DAY_MS, days: [0, 1] },
    { internalId: "at-47h59", elapsed: 47 * HOUR_MS + 59 * 60 * 1_000, days: [0, 1] },
    { internalId: "at-48h", elapsed: 2 * DAY_MS, days: [0, 2] },
  ];
  const model = buildLitterAgeComparisonModel(
    elapsedCases.map(({ internalId, elapsed }, seriesIndex) =>
      litter(internalId, [
        animal(`${internalId}-animal`, [
          measurement(`${internalId}-birth`, birthAt, 300, "birth"),
          measurement(`${internalId}-routine`, measuredAt(birthAt, elapsed), 350),
        ]),
      ], seriesIndex),
    ),
  );

  expect(
    model.series.map((series) => ({
      internalId: series.internalId,
      days: series.points.map((point) => point.ageDay),
    })),
  ).toEqual(
    elapsedCases.map(({ internalId, days }) => ({ internalId, days })),
  );
});

test("exclut les animaux sans naissance réelle unique et exploitable", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const series = buildLitterAgeComparisonModel([
    litter("eligibility", [
      animal("missing-birth", [
        measurement("routine-only", measuredAt(birthAt, DAY_MS), 400),
      ]),
      animal("ambiguous-birth", [
        measurement("birth-a", birthAt, 300, "birth"),
        measurement("birth-b", measuredAt(birthAt, HOUR_MS), 310, "birth"),
      ]),
      animal("eligible", [
        measurement("valid-birth", birthAt, 320, "birth"),
        measurement("valid-j1", measuredAt(birthAt, DAY_MS), 400),
      ]),
    ]),
  ]).series[0];

  expect(series).toMatchObject({
    totalAnimalCount: 3,
    eligibleAnimalCount: 1,
    excludedAnimalCount: 2,
    status: "available",
  });
  expect(series.points).toHaveLength(2);
  expect(series.points.every((point) => point.observedAnimalCount === 1)).toBe(true);
});

test("retourne un état explicite lorsqu’aucun animal n’est éligible", () => {
  const series = buildLitterAgeComparisonModel([
    litter("unavailable", [
      animal("animal-a", [
        measurement("routine", "2026-07-02T10:00:00.000Z", 400),
      ]),
    ]),
  ]).series[0];

  expect(series).toMatchObject({
    totalAnimalCount: 1,
    eligibleAnimalCount: 0,
    excludedAnimalCount: 1,
    status: "no_eligible_animals",
    points: [],
  });
});

test("respecte le dernier point du tri partagé à timestamp identique", () => {
  const timestamp = "2026-07-01T10:00:00.000Z";
  const measurements = [
    measurement("routine-b", timestamp, 370),
    measurement("birth", timestamp, 340, "birth"),
    measurement("routine-a", timestamp, 360),
  ];
  const forward = buildLitterAgeComparisonModel([
    litter("same-timestamp", [animal("animal-a", measurements)]),
  ]);
  const reverse = buildLitterAgeComparisonModel([
    litter("same-timestamp", [animal("animal-a", [...measurements].reverse())]),
  ]);

  expect(reverse).toEqual(forward);
  expect(forward.series[0].points).toEqual([
    {
      ageDay: 0,
      observedAnimalCount: 1,
      averageGrams: 370,
      averageRelativeIndex: (370 / 340) * 100,
      averageRelativeProgressPercentage: (370 / 340) * 100 - 100,
    },
  ]);
});

test("reste déterministe, ne mute aucune entrée et ne lit pas l’heure courante", () => {
  const birthAt = "2026-07-01T10:00:00.000Z";
  const litters = [
    litter("litter-b", [
      animal("animal-b", [
        measurement("b-j1", measuredAt(birthAt, DAY_MS), 420),
        measurement("b-birth", birthAt, 300, "birth"),
      ]),
      animal("animal-a", [
        measurement("a-birth", birthAt, 320, "birth"),
        measurement("a-j1", measuredAt(birthAt, DAY_MS), 400),
      ]),
    ], 4),
    litter("litter-a", [
      animal("animal-c", [
        measurement("c-j2", measuredAt(birthAt, 2 * DAY_MS), 500),
        measurement("c-birth", birthAt, 350, "birth"),
      ]),
    ], 4),
  ];
  const snapshot = structuredClone(litters);
  const reordered = [...litters]
    .reverse()
    .map((item) => ({
      ...item,
      animals: [...item.animals]
        .reverse()
        .map((itemAnimal) => ({
          ...itemAnimal,
          measurements: [...itemAnimal.measurements].reverse(),
        })),
    }));
  const originalDateNow = Date.now;
  let forward;
  let reverse;

  try {
    Date.now = () => {
      throw new Error("Le modèle ne doit pas lire l’heure courante.");
    };
    forward = buildLitterAgeComparisonModel(litters);
    reverse = buildLitterAgeComparisonModel(reordered);
  } finally {
    Date.now = originalDateNow;
  }

  expect(reverse).toEqual(forward);
  expect(litters).toEqual(snapshot);
  expect(forward.series.map((series) => series.internalId)).toEqual([
    "litter-a",
    "litter-b",
  ]);
});

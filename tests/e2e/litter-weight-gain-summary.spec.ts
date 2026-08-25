import { expect, test } from "@playwright/test";

import {
  buildSexOrdinals,
  summarizeAnimalWeightGain,
} from "../../src/features/litter-weights/litter-weight-gain-summary";
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
    birthDate: "2026-08-03",
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
): LitterWeightHistoryMeasurement {
  return {
    id,
    revisionNo: 0,
    animalId,
    sessionId: "session-1",
    type: "routine",
    grams,
    measuredAt,
    note: null,
    createdBy: "author",
    createdAt: measuredAt,
  };
}

test.describe("buildSexOrdinals", () => {
  test("numérote par sexe dans l'ordre de naissance", () => {
    const ordinals = buildSexOrdinals([
      animal("c", { birthOrder: 3, sex: "male" }),
      animal("d", { birthOrder: 4, sex: "female" }),
      animal("a", { birthOrder: 1, sex: "male" }),
      animal("e", { birthOrder: 5, sex: "male" }),
      animal("b", { birthOrder: 2, sex: "female" }),
    ]);
    expect(ordinals.get("a")).toBe(1);
    expect(ordinals.get("b")).toBe(1);
    expect(ordinals.get("c")).toBe(2);
    expect(ordinals.get("d")).toBe(2);
    expect(ordinals.get("e")).toBe(3);
  });

  test("ignore les animaux sans ordre de naissance", () => {
    const ordinals = buildSexOrdinals([
      animal("a", { birthOrder: 1, sex: "male" }),
      animal("b", { birthOrder: null, sex: "male" }),
    ]);
    expect(ordinals.get("a")).toBe(1);
    expect(ordinals.has("b")).toBe(false);
  });
});

test.describe("summarizeAnimalWeightGain", () => {
  const base = Date.UTC(2026, 7, 20, 8, 30);
  const iso = (dayOffset: number) =>
    new Date(base - dayOffset * 24 * 60 * 60 * 1_000).toISOString();

  test("calcule gains dernière pesée, 3 jours et depuis la naissance", () => {
    const summary = summarizeAnimalWeightGain(
      [
        measurement("m0", "a", iso(10), 400),
        measurement("m1", "a", iso(4), 800),
        measurement("m2", "a", iso(3), 900),
        measurement("m3", "a", iso(2), 1000),
        measurement("m4", "a", iso(1), 1100),
        measurement("m5", "a", iso(0), 1150),
      ],
      400,
    );
    expect(summary).not.toBeNull();
    expect(summary!.reference3dGrams).toBe(900);
    expect(summary!.gainOver3dGrams).toBe(250);
    expect(summary!.gainSincePreviousGrams).toBe(50);
    expect(summary!.gainSincePreviousPerDayGrams).toBe(50);
    expect(summary!.gainOver3dPerDayGrams).toBeCloseTo(250 / 3, 5);
    expect(summary!.gainSinceBirthPercentage).toBeCloseTo(187.5, 5);
    expect(summary!.priorThreeGainAveragePerDayGrams).toBe(100);
    expect(summary!.gainBelowPriorThreeDayAverage).toBe(true);
  });

  test("ne signale pas un gain au moins égal à sa moyenne précédente", () => {
    const summary = summarizeAnimalWeightGain(
      [
        measurement("m0", "a", iso(4), 700),
        measurement("m1", "a", iso(3), 800),
        measurement("m2", "a", iso(2), 900),
        measurement("m3", "a", iso(1), 1000),
        measurement("m4", "a", iso(0), 1100),
      ],
      400,
    );
    expect(summary!.priorThreeGainAveragePerDayGrams).toBe(100);
    expect(summary!.gainSincePreviousGrams).toBe(100);
    expect(summary!.gainBelowPriorThreeDayAverage).toBe(false);
  });

  test("applique le seuil de retrait paramétrable", () => {
    const points = [
      measurement("m0", "a", iso(4), 700),
      measurement("m1", "a", iso(3), 800),
      measurement("m2", "a", iso(2), 900),
      measurement("m3", "a", iso(1), 1000),
      measurement("m4", "a", iso(0), 1075),
    ];
    expect(summarizeAnimalWeightGain(points, 400, 20)!.gainBelowPriorThreeDayAverage).toBe(true);
    expect(summarizeAnimalWeightGain(points, 400, 30)!.gainBelowPriorThreeDayAverage).toBe(false);
  });
  test("retourne null sans mesure", () => {
    expect(summarizeAnimalWeightGain([], 400)).toBeNull();
  });

  test("ne signale pas sans trois prises précédentes exploitables", () => {
    const summary = summarizeAnimalWeightGain(
      [
        measurement("m0", "a", iso(2), 800),
        measurement("m1", "a", iso(1), 900),
        measurement("m2", "a", iso(0), 950),
      ],
      400,
    );
    expect(summary!.priorThreeGainAveragePerDayGrams).toBeNull();
    expect(summary!.gainBelowPriorThreeDayAverage).toBe(false);
  });

  test("pourcentage depuis la naissance indisponible sans poids de naissance", () => {
    const summary = summarizeAnimalWeightGain(
      [
        measurement("m1", "a", iso(3), 1000),
        measurement("m2", "a", iso(0), 1300),
      ],
      null,
    );
    expect(summary!.gainSinceBirthPercentage).toBeNull();
    expect(summary!.gainOver3dGrams).toBe(300);
  });
});

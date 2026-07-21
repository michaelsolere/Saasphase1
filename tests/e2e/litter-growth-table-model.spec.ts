import { expect, test } from "@playwright/test";

import {
  buildLitterGrowthTableModel,
  getLitterGrowthCellValue,
} from "../../src/features/litter-weights/litter-growth-table-model";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
} from "../../src/features/litter-weights/litter-weights-core";

function animal(id: string, name: string): LitterWeightHistoryAnimal {
  return {
    id, ownershipStatus: "produced", birthOrder: 1, sex: "female",
    callName: name, officialName: null, initialCollarColor: "Rose",
    currentCollarColor: "Rose", status: "born", birthDate: "2026-07-01",
    deathDate: null, birthWeightGrams: 300,
  };
}

function session(id: string, day: number): LitterWeightHistorySession {
  return {
    id, measuredAt: `2026-07-${String(day + 1).padStart(2, "0")}T14:00:00Z`,
    timezoneName: "Europe/Paris", note: null, measurementCount: 0,
    averageGrams: null, minimumGrams: null, maximumGrams: null,
    createdBy: "author", createdAt: "2026-07-01T00:00:00Z",
  };
}

function measurement(
  id: string, animalId: string, grams: number, measuredAt: string,
  type: "birth" | "routine", sessionId: string | null,
): LitterWeightHistoryMeasurement {
  return { id, animalId, sessionId, type, grams, measuredAt, note: null, createdBy: "author", createdAt: measuredAt };
}

test("sépare naissance et routine J0 et calcule gain et indice sur la vraie naissance", () => {
  const animals = [animal("a", "Alba")];
  const sessions = [session("j0", 0), session("j1", 1), session("j3", 3)];
  const measurements = [
    measurement("birth", "a", 300, "2026-07-01T08:00:00Z", "birth", null),
    measurement("routine-j0", "a", 315, sessions[0].measuredAt, "routine", "j0"),
    measurement("routine-j1", "a", 330, sessions[1].measuredAt, "routine", "j1"),
    measurement("routine-j3", "a", 390, sessions[2].measuredAt, "routine", "j3"),
  ];
  const sourceSnapshot = structuredClone(measurements);
  const model = buildLitterGrowthTableModel(animals, sessions, measurements);

  expect(model.birthRow.label).toBe("Naissance");
  expect(model.birthRow.cellsByAnimalId.get("a")?.weightGrams).toBe(300);
  expect(model.routineRows.map((row) => row.label)).toEqual(["J0 routine", "J1", "J3"]);
  expect(model.routineRows[0].cellsByAnimalId.get("a")).toMatchObject({
    weightGrams: 315, gainGrams: 15, birthIndex: 105,
  });
  expect(model.routineRows[1].cellsByAnimalId.get("a")?.gainGrams).toBe(15);
  expect(model.birthRow.cellsByAnimalId.get("a")?.birthIndex).toBe(100);
  expect(model.routineRows.map((row) => row.ageDay)).toEqual([0, 1, 3]);
  expect(measurements).toEqual(sourceSnapshot);
});

test("conserve les absences comme absences sans zéro ni interpolation", () => {
  const animals = [animal("a", "Alba"), animal("b", "Bosco")];
  const sessions = [session("j0", 0), session("j2", 2)];
  const measurements = [
    measurement("a-birth", "a", 300, "2026-07-01T08:00:00Z", "birth", null),
    measurement("b-birth", "b", 400, "2026-07-01T08:10:00Z", "birth", null),
    measurement("a-j0", "a", 310, sessions[0].measuredAt, "routine", "j0"),
    measurement("a-j2", "a", 380, sessions[1].measuredAt, "routine", "j2"),
    measurement("b-j2", "b", 480, sessions[1].measuredAt, "routine", "j2"),
  ];
  const model = buildLitterGrowthTableModel(animals, sessions, measurements);
  const missing = model.routineRows[0].cellsByAnimalId.get("b")!;

  expect(model.routineRows[0].observedAnimalCount).toBe(1);
  expect(missing).toMatchObject({ weightGrams: null, gainGrams: null, birthIndex: null });
  expect(getLitterGrowthCellValue(missing, "weight")).toBeNull();
  expect(getLitterGrowthCellValue(missing, "gain")).toBeNull();
  expect(getLitterGrowthCellValue(missing, "index")).toBeNull();
  expect(model.routineRows.map((row) => row.label)).toEqual(["J0 routine", "J2"]);
});

test("ne fabrique aucun indice sans mesure birth unique", () => {
  const animals = [animal("a", "Alba")];
  const sessions = [session("j0", 0)];
  const model = buildLitterGrowthTableModel(animals, sessions, [
    measurement("routine", "a", 315, sessions[0].measuredAt, "routine", "j0"),
  ]);

  expect(model.animals[0].birth.birthIndex).toBeNull();
  expect(model.routineRows[0].cellsByAnimalId.get("a")?.birthIndex).toBeNull();
});

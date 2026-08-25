import { expect, test } from "@playwright/test";

import {
  findLowestGainAnimals,
  type GainAlertAnimalInput,
} from "../../src/features/litter-weights/gain-alert-model";

function animal(
  id: string,
  deltaPercent: number | null,
): GainAlertAnimalInput {
  return { animalId: id, publicLabel: `Chiot ${id}`, deltaPercent };
}

test("identifie l'animal à la prise la plus faible dès deux saisies", () => {
  const flagged = findLowestGainAnimals([
    animal("a", 5.1),
    animal("b", 1.9),
    animal("c", 3.3),
  ]);
  expect(flagged).toEqual(["b"]);
});

test("retourne aucun signal avec moins de deux mesures", () => {
  expect(findLowestGainAnimals([animal("a", 2)])).toEqual([]);
  expect(findLowestGainAnimals([])).toEqual([]);
});

test("ignore les animaux sans mesure calculable", () => {
  const flagged = findLowestGainAnimals([
    animal("a", 4),
    animal("b", null),
    animal("c", 6),
  ]);
  expect(flagged).toEqual(["a"]);
});

test("signale jusqu'au nombre demandé de prises les plus faibles", () => {
  const flagged = findLowestGainAnimals(
    [animal("a", 5.1), animal("b", 1.9), animal("c", 3.3), animal("d", 0.8)],
    2,
  );
  expect(flagged).toEqual(["d", "b"]);
  expect(findLowestGainAnimals([
    animal("a", 5.1),
    animal("b", 1.9),
    animal("c", 3.3),
  ], 0)).toEqual([]);
});

test("conserve les ex æquo au seuil demandé", () => {
  expect(
    findLowestGainAnimals(
      [animal("a", 1), animal("b", 1), animal("c", 4)],
      1,
    ),
  ).toEqual(["a", "b"]);
});


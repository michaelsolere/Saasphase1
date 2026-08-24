import { expect, test } from "@playwright/test";

import {
  litterWeightAnimalCollarColor,
  litterWeightAnimalDetails,
  litterWeightAnimalName,
} from "../../src/features/litter-weights/litter-weight-animal-identity";
import type { LitterWeightHistoryAnimal } from "../../src/features/litter-weights/litter-weights-core";

function animal(
  overrides: Partial<LitterWeightHistoryAnimal> = {},
): LitterWeightHistoryAnimal {
  return {
    id: "animal-1",
    ownershipStatus: "produced",
    birthOrder: 3,
    sex: "male",
    callName: null,
    officialName: null,
    initialCollarColor: "Noir",
    currentCollarColor: null,
    status: "born",
    birthDate: "2026-08-03",
    deathDate: null,
    birthWeightGrams: 400,
    ...overrides,
  };
}

test.describe("litterWeightAnimalName", () => {
  test("nom d'appel prioritaire", () => {
    expect(litterWeightAnimalName(animal({ callName: "Ours" }))).toBe("Ours");
  });

  test("nom officiel ensuite", () => {
    expect(
      litterWeightAnimalName(animal({ officialName: "Ours du Pays Pourpre" })),
    ).toBe("Ours du Pays Pourpre");
  });

  test("sexe + numéro de naissance quand pas de nom", () => {
    expect(litterWeightAnimalName(animal())).toBe("Mâle 3");
  });

  test("femelle + numéro", () => {
    expect(litterWeightAnimalName(animal({ sex: "female" }))).toBe("Femelle 3");
  });

  test("détails sans répétition du collier, déjà présent dans le libellé", () => {
    const details = litterWeightAnimalDetails(animal());
    expect(details).toContain("Mâle");
    expect(details).not.toContain("Collier");
  });

  test("chiot sans ordre ni nom garde un libellé neutre", () => {
    expect(
      litterWeightAnimalName(animal({ birthOrder: null, sex: "unknown" })),
    ).toBe("Animal de la portée");
  });
});

test.describe("litterWeightAnimalCollarColor", () => {
  test("préfère le collier courant, sinon initial, normalisé", () => {
    expect(litterWeightAnimalCollarColor(animal())).toBe("noir");
    expect(
      litterWeightAnimalCollarColor(
        animal({ currentCollarColor: "Vert clair" }),
      ),
    ).toBe("vert clair");
  });

  test("chaîne vide sans collier", () => {
    expect(
      litterWeightAnimalCollarColor(
        animal({ currentCollarColor: null, initialCollarColor: null }),
      ),
    ).toBe("");
  });
});

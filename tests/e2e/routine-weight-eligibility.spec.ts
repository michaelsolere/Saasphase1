import { expect, test } from "@playwright/test";

import { getRoutineWeightEligibility } from "../../src/features/litter-weights/routine-weight-eligibility";

function animal(overrides: Partial<Parameters<typeof getRoutineWeightEligibility>[0]> = {}) {
  return {
    ownershipStatus: "produced",
    birthDate: "2026-07-18",
    status: "born",
    ...overrides,
  };
}

test.describe("éligibilité UI aux pesées de routine", () => {
  test("accepte les animaux produits vivants quel que soit leur statut de parcours", () => {
    for (const status of ["born", "reserved", "kept"]) {
      expect(getRoutineWeightEligibility(animal({ status }))).toEqual({ eligible: true });
    }
  });

  test("explique chaque exclusion", () => {
    expect(
      getRoutineWeightEligibility(animal({ ownershipStatus: "adopted_out" })),
    ).toEqual({
      eligible: false,
      reasons: ["current_ownership_not_produced"],
    });
    expect(getRoutineWeightEligibility(animal({ birthDate: null }))).toEqual({
      eligible: false,
      reasons: ["missing_birth_date"],
    });
    expect(getRoutineWeightEligibility(animal({ status: "stillborn" }))).toEqual({
      eligible: false,
      reasons: ["stillborn"],
    });
  });

  test("retourne tous les motifs dans un ordre déterministe", () => {
    expect(
      getRoutineWeightEligibility(
        animal({
          ownershipStatus: "adopted_out",
          birthDate: null,
          status: "stillborn",
        }),
      ),
    ).toEqual({
      eligible: false,
      reasons: [
        "current_ownership_not_produced",
        "missing_birth_date",
        "stillborn",
      ],
    });
  });
});

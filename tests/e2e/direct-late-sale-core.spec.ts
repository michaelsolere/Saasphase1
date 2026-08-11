import { expect, test } from "@playwright/test";

import {
  deriveDirectLateSaleProofState,
  isDirectLateSaleAnimalEligible,
} from "../../src/features/reservations/direct-late-sale-model";

test("direct late sale accepts only a genuinely remaining produced puppy after priority resolution", () => {
  const base = {
    litterId: "litter-a",
    targetLitterId: "litter-a",
    status: "available",
    ownershipStatus: "produced",
    isBreeder: false,
    isExternal: false,
    isRetired: false,
    alreadyAssigned: false,
    activeHold: false,
    priorityResolved: true,
    ordinaryWaveResolved: true,
  };

  expect(isDirectLateSaleAnimalEligible(base)).toEqual({ eligible: true, reason: null });
  expect(isDirectLateSaleAnimalEligible({ ...base, priorityResolved: false })).toEqual({
    eligible: false,
    reason: "priority_families_unresolved",
  });
  expect(isDirectLateSaleAnimalEligible({ ...base, status: "reserved" })).toEqual({
    eligible: false,
    reason: "animal_unavailable",
  });
});

test("direct attribution waits for both signed documents and full payment in any order", () => {
  expect(
    deriveDirectLateSaleProofState({
      contractSigned: true,
      certificateSigned: false,
      paidCents: 200_000,
      requiredCents: 200_000,
      deadline: "2026-08-10T10:00:00.000Z",
      now: "2026-08-11T10:00:00.000Z",
      holdStatus: "active",
    }),
  ).toEqual({
    contract: "complete",
    certificate: "missing",
    payment: "complete",
    overdue: true,
    holdStatus: "active",
    assignable: false,
  });

  expect(
    deriveDirectLateSaleProofState({
      contractSigned: true,
      certificateSigned: true,
      paidCents: 200_000,
      requiredCents: 200_000,
      deadline: "2026-08-12T10:00:00.000Z",
      now: "2026-08-11T10:00:00.000Z",
      holdStatus: "active",
    }).assignable,
  ).toBe(true);
});

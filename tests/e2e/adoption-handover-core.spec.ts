import { expect, test } from "@playwright/test";

import {
  evaluateAdoptionHandoverReadiness,
  getAdoptionHandoverAuthorization,
} from "../../src/features/reservations/adoption-handover-core";

const completeInput = {
  reservationStatus: "animal_assigned",
  adoptionAt: "2026-08-05T14:00:00.000Z",
  now: "2026-08-05T16:00:00.000Z",
  animal: {
    id: "animal-1",
    birthDate: "2026-05-01",
    identificationNumber: "250269000000001",
    isConsistent: true,
  },
  priceCents: 200_000,
  balanceRemainingCents: 0,
  paymentDataAvailable: true,
  documents: {
    dataAvailable: true,
    commitmentCertificateStatus: "signed",
    reservationContractStatus: "signed",
  },
} as const;

test("classifies impossible adoption states as hard blockers", () => {
  const readiness = evaluateAdoptionHandoverReadiness({
    ...completeInput,
    adoptionAt: "2026-08-06T14:00:00.000Z",
    animal: null,
  });

  expect(readiness.blockerCodes).toEqual([
    "animal_missing",
    "adoption_in_future",
  ]);
  expect(readiness.exceptionCodes).toEqual([]);
  expect(readiness.isComplete).toBe(false);
});

test("classifies incomplete business evidence as sensitive exceptions", () => {
  const readiness = evaluateAdoptionHandoverReadiness({
    ...completeInput,
    animal: {
      ...completeInput.animal,
      identificationNumber: null,
    },
    balanceRemainingCents: 25_000,
    documents: {
      dataAvailable: true,
      commitmentCertificateStatus: "sent",
      reservationContractStatus: null,
    },
  });

  expect(readiness.blockerCodes).toEqual([]);
  expect(readiness.exceptionCodes).toEqual([
    "animal_identification_missing",
    "balance_remaining",
    "commitment_certificate_not_signed",
    "reservation_contract_missing",
  ]);
  expect(readiness.isComplete).toBe(false);
});

test("treats unavailable payment or document evidence as sensitive exceptions", () => {
  const readiness = evaluateAdoptionHandoverReadiness({
    ...completeInput,
    paymentDataAvailable: false,
    documents: {
      ...completeInput.documents,
      dataAvailable: false,
    },
  });

  expect(readiness.blockerCodes).toEqual([]);
  expect(readiness.exceptionCodes).toEqual([
    "payment_data_unavailable",
    "document_data_unavailable",
  ]);
});

test("requires an explicit exception when the price is unknown", () => {
  const readiness = evaluateAdoptionHandoverReadiness({
    ...completeInput,
    priceCents: null,
  });

  expect(readiness.blockerCodes).toEqual([]);
  expect(readiness.exceptionCodes).toEqual(["price_missing"]);
});

test("allows members only for complete handovers and owners or admins for justified exceptions", () => {
  const complete = evaluateAdoptionHandoverReadiness(completeInput);
  const incomplete = evaluateAdoptionHandoverReadiness({
    ...completeInput,
    balanceRemainingCents: 10_000,
  });

  expect(getAdoptionHandoverAuthorization({ role: "member", readiness: complete })).toEqual({
    allowed: true,
    requiresJustification: false,
  });
  expect(getAdoptionHandoverAuthorization({ role: "member", readiness: incomplete })).toEqual({
    allowed: false,
    requiresJustification: true,
  });
  expect(getAdoptionHandoverAuthorization({ role: "admin", readiness: incomplete })).toEqual({
    allowed: true,
    requiresJustification: true,
  });
  expect(getAdoptionHandoverAuthorization({ role: "owner", readiness: incomplete })).toEqual({
    allowed: true,
    requiresJustification: true,
  });
  expect(getAdoptionHandoverAuthorization({ role: "viewer", readiness: complete })).toEqual({
    allowed: false,
    requiresJustification: false,
  });
});

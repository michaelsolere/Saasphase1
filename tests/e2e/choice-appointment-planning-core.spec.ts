import { expect, test } from "@playwright/test";

import {
  buildChoiceAppointmentDraft,
  evaluateChoiceAppointmentEligibility,
} from "@/features/reservations/choice-appointment-planning-core";

test("eligibility requires a confirmed position, signed documents and complete deposit", () => {
  expect(
    evaluateChoiceAppointmentEligibility({
      positionStatus: "confirmed",
      sex: "female",
      activeOrder: 1,
      historicalRank: 2,
      requiredDocuments: [
        { type: "commitment_certificate", status: "signed" },
        { type: "reservation_contract", status: "signed" },
      ],
      paidDepositCents: 50_000,
      completeDepositCents: 50_000,
    }),
  ).toEqual({ eligible: true, blockers: [] });

  expect(
    evaluateChoiceAppointmentEligibility({
      positionStatus: "postponed",
      sex: null,
      activeOrder: null,
      historicalRank: 2,
      requiredDocuments: [
        { type: "commitment_certificate", status: "signed" },
      ],
      paidDepositCents: 49_999,
      completeDepositCents: 50_000,
    }),
  ).toEqual({
    eligible: false,
    blockers: [
      "place_not_confirmed",
      "sex_not_confirmed",
      "active_order_not_confirmed",
      "required_documents_not_signed",
      "deposit_incomplete",
    ],
  });
});

test("draft merges both sex files while preserving their active order and historical priority", () => {
  const result = buildChoiceAppointmentDraft({
    startsAt: "2026-09-10T08:00:00.000Z",
    durationMinutes: 45,
    male: [
      { reservationId: "male-1", activeOrder: 1, historicalRank: 1 },
      { reservationId: "male-2", activeOrder: 2, historicalRank: 5 },
    ],
    female: [
      { reservationId: "female-1", activeOrder: 1, historicalRank: 2 },
      { reservationId: "female-2", activeOrder: 2, historicalRank: 3 },
    ],
  });

  expect(result.map(({ reservationId, sequence, plannedAt }) => ({ reservationId, sequence, plannedAt }))).toEqual([
    { reservationId: "male-1", sequence: 1, plannedAt: "2026-09-10T08:00:00.000Z" },
    { reservationId: "female-1", sequence: 2, plannedAt: "2026-09-10T08:45:00.000Z" },
    { reservationId: "female-2", sequence: 3, plannedAt: "2026-09-10T09:30:00.000Z" },
    { reservationId: "male-2", sequence: 4, plannedAt: "2026-09-10T10:15:00.000Z" },
  ]);
});

test("draft rejects duplicated active orders or reservations", () => {
  expect(() =>
    buildChoiceAppointmentDraft({
      startsAt: "2026-09-10T08:00:00.000Z",
      durationMinutes: 45,
      male: [
        { reservationId: "same", activeOrder: 1, historicalRank: 1 },
        { reservationId: "male-2", activeOrder: 1, historicalRank: 2 },
      ],
      female: [{ reservationId: "same", activeOrder: 1, historicalRank: 3 }],
    }),
  ).toThrow("invalid_active_file");
});

test("draft preserves legitimate active-order gaps after ineligible families are filtered", () => {
  expect(
    buildChoiceAppointmentDraft({
      startsAt: "2026-09-10T08:00:00.000Z",
      durationMinutes: 45,
      male: [],
      female: [
        { reservationId: "female-eligible", activeOrder: 2, historicalRank: 2 },
      ],
    }),
  ).toMatchObject([
    {
      reservationId: "female-eligible",
      activeOrder: 2,
      sequence: 1,
    },
  ]);
});

import { expect, test } from "@playwright/test";

import {
  allocateCandidateJourneyPayment,
  calculateCandidatePaymentRank,
  evaluatePreReservationProposalEligibility,
  resolveCandidateJourneyEntryMode,
  validateDesiredTiming,
} from "../../src/features/applications/candidate-positioning-pre-reservation";

test("structured timing distinguishes unknown, no preference, season and not-before", () => {
  expect(validateDesiredTiming({ mode: "unknown" })).toEqual({
    ok: true,
    value: { mode: "unknown", season: null, seasonYear: null, notBeforeDate: null },
  });
  expect(validateDesiredTiming({ mode: "no_preference" }).ok).toBe(true);
  expect(
    validateDesiredTiming({ mode: "season", season: "spring", seasonYear: 2027 }),
  ).toMatchObject({ ok: true });
  expect(
    validateDesiredTiming({ mode: "season", season: "spring" }),
  ).toMatchObject({ ok: false, reason: "season_year_required" });
  expect(
    validateDesiredTiming({ mode: "not_before", notBeforeDate: "2027-06-01" }),
  ).toMatchObject({ ok: true });
  expect(
    validateDesiredTiming({ mode: "not_before", notBeforeDate: "01/06/2027" }),
  ).toMatchObject({ ok: false, reason: "not_before_date_invalid" });
});

test("proposal requires a confirmed precise litter or a group containing one", () => {
  const base = {
    applicationStatus: "qualified",
    hasStartedJourney: false,
    recipientEmail: "famille@example.invalid",
  };

  expect(
    evaluatePreReservationProposalEligibility({
      ...base,
      targetLitterId: "litter-confirmed",
      targetLitterGroupId: "group-a",
      targetLitterStatus: "pregnancy_confirmed",
      confirmedLitterCountInGroup: 1,
    }),
  ).toEqual({ eligible: true, reason: null });

  expect(
    evaluatePreReservationProposalEligibility({
      ...base,
      targetLitterId: null,
      targetLitterGroupId: "group-a",
      targetLitterStatus: null,
      confirmedLitterCountInGroup: 1,
    }),
  ).toEqual({ eligible: true, reason: null });

  expect(
    evaluatePreReservationProposalEligibility({
      ...base,
      targetLitterId: null,
      targetLitterGroupId: null,
      targetLitterStatus: null,
      confirmedLitterCountInGroup: 0,
    }),
  ).toEqual({ eligible: false, reason: "confirmed_scope_required" });

  expect(
    evaluatePreReservationProposalEligibility({
      ...base,
      targetLitterId: "litter-planned",
      targetLitterGroupId: "group-a",
      targetLitterStatus: "planned",
      confirmedLitterCountInGroup: 1,
    }),
  ).toEqual({ eligible: false, reason: "target_litter_not_confirmed" });
});

test("born litter uses direct reservation and skips pre-reservation proposal", () => {
  expect(resolveCandidateJourneyEntryMode({ actualBirthDate: null })).toBe(
    "pre_reservation_before_birth",
  );
  expect(
    resolveCandidateJourneyEntryMode({ actualBirthDate: "2026-08-12" }),
  ).toBe("direct_reservation_after_birth");
});

test("payment allocation keeps real amounts and carries shortfall or surplus", () => {
  expect(
    allocateCandidateJourneyPayment({
      expectedFirstCents: 25_000,
      completeDepositCents: 50_000,
      receivedCents: 20_000,
      acceptShortfallForOpening: false,
    }),
  ).toEqual({
    receivedCents: 20_000,
    firstPaymentAllocatedCents: 20_000,
    nextPaymentAdvanceCents: 0,
    unallocatedSurplusCents: 0,
    remainingCompleteDepositCents: 30_000,
    opensJourney: false,
    requiresShortfallReason: false,
  });

  expect(
    allocateCandidateJourneyPayment({
      expectedFirstCents: 25_000,
      completeDepositCents: 50_000,
      receivedCents: 20_000,
      acceptShortfallForOpening: true,
    }),
  ).toMatchObject({
    remainingCompleteDepositCents: 30_000,
    opensJourney: true,
    requiresShortfallReason: true,
  });

  expect(
    allocateCandidateJourneyPayment({
      expectedFirstCents: 25_000,
      completeDepositCents: 50_000,
      receivedCents: 30_000,
      acceptShortfallForOpening: false,
    }),
  ).toEqual({
    receivedCents: 30_000,
    firstPaymentAllocatedCents: 25_000,
    nextPaymentAdvanceCents: 5_000,
    unallocatedSurplusCents: 0,
    remainingCompleteDepositCents: 20_000,
    opensJourney: true,
    requiresShortfallReason: false,
  });

  expect(
    allocateCandidateJourneyPayment({
      expectedFirstCents: 25_000,
      completeDepositCents: 50_000,
      receivedCents: 60_000,
      acceptShortfallForOpening: false,
    }),
  ).toEqual({
    receivedCents: 60_000,
    firstPaymentAllocatedCents: 25_000,
    nextPaymentAdvanceCents: 25_000,
    unallocatedSurplusCents: 10_000,
    remainingCompleteDepositCents: 0,
    opensJourney: true,
    requiresShortfallReason: false,
  });
});

test("payment rank keeps the historical form order until the deadline and queues late families by acceptance", () => {
  const common = {
    initialRank: 3,
    deadline: "2026-08-20T12:00:00.000Z",
    activeOnTimeRanks: [1, 2, 4],
    lateAcceptances: [
      { reservationId: "late-b", acceptedAt: "2026-08-22T09:00:00.000Z" },
      { reservationId: "late-a", acceptedAt: "2026-08-21T09:00:00.000Z" },
    ],
    reservationId: "current",
  };

  expect(
    calculateCandidatePaymentRank({
      ...common,
      acceptedAt: "2026-08-20T12:00:00.000Z",
    }),
  ).toEqual({ rank: 3, late: false });

  expect(
    calculateCandidatePaymentRank({
      ...common,
      acceptedAt: "2026-08-23T09:00:00.000Z",
    }),
  ).toEqual({ rank: 7, late: true });

  expect(
    calculateCandidatePaymentRank({
      ...common,
      reservationId: "late-0",
      acceptedAt: "2026-08-21T09:00:00.000Z",
    }),
  ).toEqual({ rank: 5, late: true });
});

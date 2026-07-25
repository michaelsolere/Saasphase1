import { expect, test } from "@playwright/test";

import {
  COMPLETE_DEPOSIT_AMOUNT_CENTS,
  PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
  resolveDepositSettings,
} from "../../src/features/payments/deposit-thresholds";
import {
  computePreReservationDepositProgress,
  evaluateReservationHolderPromotion,
} from "../../src/features/payments/pre-reservation-deposit";

test("defaults resolve to 250 + 250 = 500 euro", () => {
  expect(resolveDepositSettings(null)).toEqual({
    preReservationDepositCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    arrhesSecondPaymentCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    completeDepositCents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
    preReservationResponseDelayDays: 15,
  });
  expect(resolveDepositSettings(undefined).completeDepositCents).toBe(50_000);
});

test("complete configuration uses 300 + 400 = 700 euro", () => {
  expect(
    resolveDepositSettings({
      default_pre_reservation_deposit_cents: 30_000,
      default_arrhes_second_payment_cents: 40_000,
      pre_reservation_response_delay_days: 10,
    }),
  ).toEqual({
    preReservationDepositCents: 30_000,
    arrhesSecondPaymentCents: 40_000,
    completeDepositCents: 70_000,
    preReservationResponseDelayDays: 10,
  });
});

test("partial pre-reservation setting keeps default complement", () => {
  expect(
    resolveDepositSettings({
      default_pre_reservation_deposit_cents: 30_000,
      default_arrhes_second_payment_cents: null,
      pre_reservation_response_delay_days: null,
    }),
  ).toEqual({
    preReservationDepositCents: 30_000,
    arrhesSecondPaymentCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    completeDepositCents: 55_000,
    preReservationResponseDelayDays: 15,
  });
});

test("partial complement setting keeps default pre-reservation", () => {
  expect(
    resolveDepositSettings({
      default_pre_reservation_deposit_cents: null,
      default_arrhes_second_payment_cents: 40_000,
      pre_reservation_response_delay_days: 7,
    }),
  ).toEqual({
    preReservationDepositCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    arrhesSecondPaymentCents: 40_000,
    completeDepositCents: 65_000,
    preReservationResponseDelayDays: 7,
  });
});

test("invalid null zero and negative values fall back component-wise", () => {
  expect(
    resolveDepositSettings({
      default_pre_reservation_deposit_cents: 0,
      default_arrhes_second_payment_cents: -100,
      pre_reservation_response_delay_days: -1,
    }),
  ).toEqual({
    preReservationDepositCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    arrhesSecondPaymentCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    completeDepositCents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
    preReservationResponseDelayDays: 15,
  });

  expect(
    resolveDepositSettings({
      default_pre_reservation_deposit_cents: 12.5 as unknown as number,
      default_arrhes_second_payment_cents: Number.NaN,
      pre_reservation_response_delay_days: 1.5 as unknown as number,
    }),
  ).toMatchObject({
    preReservationDepositCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    arrhesSecondPaymentCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    completeDepositCents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
  });
});

test("configured complement remaining uses resolved completeDepositCents", () => {
  const depositSettings = resolveDepositSettings({
    default_pre_reservation_deposit_cents: 30_000,
    default_arrhes_second_payment_cents: 40_000,
    pre_reservation_response_delay_days: 15,
  });

  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: 30_000,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.eligibleReceivedCents).toBe(30_000);
  expect(progress.remainingToRequestCents).toBe(40_000);
  expect(progress.hasCompleteDeposit).toBe(false);
  expect(progress.canRequestPreReservationBalance).toBe(true);
});

test("promotion waits for configured 700 euro not default 500", () => {
  const depositSettings = resolveDepositSettings({
    default_pre_reservation_deposit_cents: 30_000,
    default_arrhes_second_payment_cents: 40_000,
    pre_reservation_response_delay_days: 15,
  });

  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "pre_reservation_deposit_refundable",
          status: "paid",
          amount_cents: 30_000,
        },
        {
          payment_type: "arrhes",
          status: "paid",
          amount_cents: 20_000,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("below_threshold");

  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "pre_reservation_deposit_refundable",
          status: "paid",
          amount_cents: 30_000,
        },
        {
          payment_type: "arrhes",
          status: "paid",
          amount_cents: 40_000,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("promote");
});

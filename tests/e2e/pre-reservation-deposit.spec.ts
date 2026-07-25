import { expect, test } from "@playwright/test";

import {
  COMPLETE_DEPOSIT_AMOUNT_CENTS,
  PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
  resolveDepositSettings,
} from "../../src/features/payments/deposit-thresholds";
import {
  computePreReservationDepositProgress,
  evaluatePreReservationBalanceRequest,
  evaluateReservationHolderPromotion,
} from "../../src/features/payments/pre-reservation-deposit";
import { prepareContactJourneyRolePromotion } from "../../src/features/contacts/roles";

const depositSettings = resolveDepositSettings(null);

test("modern paid refundable deposit enables complement request", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress).toMatchObject({
    eligibleReceivedCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    eligibleRequestedCents: 0,
    remainingToRequestCents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    hasActiveArrhesRequest: false,
    hasCompleteDeposit: false,
    canRequestPreReservationBalance: true,
  });
});

test("historical paid arrhes deposit still enables complement request", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "arrhes",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.canRequestPreReservationBalance).toBe(true);
  expect(progress.eligibleReceivedCents).toBe(PRE_RESERVATION_PAYMENT_AMOUNT_CENTS);
});

test("requested modern deposit does not enable complement", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "requested",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_requested",
  });

  expect(progress.canRequestPreReservationBalance).toBe(false);
  expect(progress.eligibleReceivedCents).toBe(0);
  expect(progress.eligibleRequestedCents).toBe(PRE_RESERVATION_PAYMENT_AMOUNT_CENTS);
});

test("active complement request blocks a duplicate", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
      {
        payment_type: "arrhes",
        status: "requested",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.hasActiveArrhesRequest).toBe(true);
  expect(progress.canRequestPreReservationBalance).toBe(false);
});

test("cancelled complement is ignored and allows a new request", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
      {
        payment_type: "arrhes",
        status: "cancelled",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.hasActiveArrhesRequest).toBe(false);
  expect(progress.canRequestPreReservationBalance).toBe(true);
  expect(
    evaluatePreReservationBalanceRequest({
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      payments: [
        {
          payment_type: "pre_reservation_deposit_refundable",
          status: "paid",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
        {
          payment_type: "arrhes",
          status: "cancelled",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      isFinalStatus: false,
    }).outcome,
  ).toBe("eligible");
});

test("complete eligible total of 500 euro blocks complement", () => {
  const payments = [
    {
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
      amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    },
    {
      payment_type: "arrhes",
      status: "paid",
      amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    },
  ];
  const progress = computePreReservationDepositProgress({
    payments,
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.eligibleReceivedCents).toBe(COMPLETE_DEPOSIT_AMOUNT_CENTS);
  expect(progress.hasCompleteDeposit).toBe(true);
  expect(progress.canRequestPreReservationBalance).toBe(false);
  expect(
    evaluatePreReservationBalanceRequest({
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      payments,
      depositSettings,
      isFinalStatus: false,
    }).outcome,
  ).toBe("complete");
});

test("non-eligible payment types are ignored for deposit progress", () => {
  const progress = computePreReservationDepositProgress({
    payments: [
      {
        payment_type: "balance",
        status: "paid",
        amount_cents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
  });

  expect(progress.eligibleReceivedCents).toBe(0);
  expect(progress.hasCompleteDeposit).toBe(false);
  expect(progress.canRequestPreReservationBalance).toBe(false);
});

test("server evaluation refuses final, foreign-empty contact, and unpaid first deposit", () => {
  const paidModern = [
    {
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
      amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    },
  ];

  expect(
    evaluatePreReservationBalanceRequest({
      reservationStatus: "pre_reservation_paid",
      contactId: null,
      payments: paidModern,
      depositSettings,
      isFinalStatus: false,
    }).outcome,
  ).toBe("ineligible");

  expect(
    evaluatePreReservationBalanceRequest({
      reservationStatus: "cancelled",
      contactId: "contact",
      payments: paidModern,
      depositSettings,
      isFinalStatus: true,
    }).outcome,
  ).toBe("ineligible");

  expect(
    evaluatePreReservationBalanceRequest({
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      payments: [
        {
          payment_type: "pre_reservation_deposit_refundable",
          status: "requested",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      isFinalStatus: false,
    }).outcome,
  ).toBe("pre_reservation_unpaid");
});

test("first modern 250 euro paid stays below reservation_holder promotion", () => {
  const evaluation = evaluateReservationHolderPromotion({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
    contactId: "contact",
    isFinalStatus: false,
  });

  expect(evaluation.outcome).toBe("below_threshold");
  expect(evaluation.eligibleReceivedCents).toBe(PRE_RESERVATION_PAYMENT_AMOUNT_CENTS);
  expect(evaluation.progress.hasCompleteDeposit).toBe(false);
});

test("modern complement paid promotes at completeDepositCents", () => {
  const evaluation = evaluateReservationHolderPromotion({
    payments: [
      {
        payment_type: "pre_reservation_deposit_refundable",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
      {
        payment_type: "arrhes",
        status: "paid",
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
      },
    ],
    depositSettings,
    reservationStatus: "pre_reservation_paid",
    contactId: "contact",
    isFinalStatus: false,
  });

  expect(evaluation.outcome).toBe("promote");
  expect(evaluation.eligibleReceivedCents).toBe(COMPLETE_DEPOSIT_AMOUNT_CENTS);
});

test("historical arrhes-only complete deposit still promotes", () => {
  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "arrhes",
          status: "paid",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
        {
          payment_type: "arrhes",
          status: "paid",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("promote");

  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "arrhes",
          status: "paid",
          amount_cents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("promote");
});

test("requested complement does not promote", () => {
  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "pre_reservation_deposit_refundable",
          status: "paid",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
        {
          payment_type: "arrhes",
          status: "requested",
          amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("below_threshold");
});

test("non-admissible payment type does not count toward promotion", () => {
  expect(
    evaluateReservationHolderPromotion({
      payments: [
        {
          payment_type: "balance",
          status: "paid",
          amount_cents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
        },
      ],
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("below_threshold");
});

test("promotion evaluation is idempotent once threshold is reached", () => {
  const payments = [
    {
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
      amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    },
    {
      payment_type: "arrhes",
      status: "paid",
      amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    },
  ];

  expect(
    evaluateReservationHolderPromotion({
      payments,
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("promote");
  expect(
    evaluateReservationHolderPromotion({
      payments,
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: "contact",
      isFinalStatus: false,
    }).outcome,
  ).toBe("promote");
});

test("missing contact or final status refuses reservation_holder promotion", () => {
  const completePayments = [
    {
      payment_type: "arrhes",
      status: "paid",
      amount_cents: COMPLETE_DEPOSIT_AMOUNT_CENTS,
    },
  ];

  expect(
    evaluateReservationHolderPromotion({
      payments: completePayments,
      depositSettings,
      reservationStatus: "pre_reservation_paid",
      contactId: null,
      isFinalStatus: false,
    }).outcome,
  ).toBe("ineligible");

  expect(
    evaluateReservationHolderPromotion({
      payments: completePayments,
      depositSettings,
      reservationStatus: "cancelled",
      contactId: "contact",
      isFinalStatus: true,
    }).outcome,
  ).toBe("ineligible");
});

test("prepareContactJourneyRolePromotion deactivates pre_reservation_holder only among journey roles", () => {
  expect(prepareContactJourneyRolePromotion("reservation_holder")).toEqual({
    roleToActivate: "reservation_holder",
    rolesToDeactivate: [
      "candidate",
      "pre_reservation_holder",
      "adopter",
      "former_adopter",
    ],
  });
});

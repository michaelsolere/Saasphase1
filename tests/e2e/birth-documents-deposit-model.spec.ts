import { expect, test } from "@playwright/test";

import { deriveBirthDocumentsDepositPaymentPlan } from "../../src/features/communications/birth-documents-deposit-email-core";

test("ne crée aucune demande de complément lorsque les arrhes affectées sont déjà complètes", () => {
  expect(
    deriveBirthDocumentsDepositPaymentPlan({
      paidCents: 50_000,
      preReservationDepositCents: 25_000,
      completeDepositCents: 50_000,
    }),
  ).toEqual({ eligible: true, complementCents: 0, paymentRequired: false });
});

test("refuse un premier versement insuffisant et calcule sinon le complément exact", () => {
  expect(
    deriveBirthDocumentsDepositPaymentPlan({
      paidCents: 20_000,
      preReservationDepositCents: 25_000,
      completeDepositCents: 50_000,
    }),
  ).toEqual({ eligible: false, errorCode: "pre_reservation_unpaid" });
  expect(
    deriveBirthDocumentsDepositPaymentPlan({
      paidCents: 30_000,
      preReservationDepositCents: 25_000,
      completeDepositCents: 50_000,
    }),
  ).toEqual({ eligible: true, complementCents: 20_000, paymentRequired: true });
});

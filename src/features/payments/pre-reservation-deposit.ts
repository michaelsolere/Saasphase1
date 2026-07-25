import type { ResolvedDepositSettings } from "@/features/payments/deposit-thresholds";

export const ELIGIBLE_PRE_RESERVATION_DEPOSIT_TYPES = [
  "arrhes",
  "pre_reservation_deposit_refundable",
] as const;

export type EligiblePreReservationDepositType =
  (typeof ELIGIBLE_PRE_RESERVATION_DEPOSIT_TYPES)[number];

export type DepositPaymentLike = {
  payment_type: string | null;
  status: string | null;
  amount_cents: number;
};

export type PreReservationDepositProgress = {
  eligibleReceivedCents: number;
  eligibleRequestedCents: number;
  remainingToRequestCents: number;
  hasActiveArrhesRequest: boolean;
  hasSeparatePreReservationDeposit: boolean;
  hasFirstPaid: boolean;
  hasSecondPayment: boolean;
  hasSecondPaid: boolean;
  hasCompleteDeposit: boolean;
  canRequestPreReservationBalance: boolean;
};

export function isEligiblePreReservationDepositType(
  paymentType: string | null | undefined,
): paymentType is EligiblePreReservationDepositType {
  return (
    paymentType === "arrhes" ||
    paymentType === "pre_reservation_deposit_refundable"
  );
}

function isActiveDepositRequestStatus(status: string | null | undefined) {
  return (
    status === "requested" ||
    status === "pending" ||
    status === "partially_paid"
  );
}

/**
 * Shared deposit progress for complement eligibility and "Arrhes complètes".
 * Counts both modern refundable pre-reservation deposits and arrhes payments.
 */
export function computePreReservationDepositProgress({
  payments,
  depositSettings,
  reservationStatus,
}: {
  payments: DepositPaymentLike[];
  depositSettings: Pick<
    ResolvedDepositSettings,
    | "preReservationDepositCents"
    | "arrhesSecondPaymentCents"
    | "completeDepositCents"
  >;
  reservationStatus: string | null | undefined;
}): PreReservationDepositProgress {
  const eligiblePayments = payments.filter((payment) =>
    isEligiblePreReservationDepositType(payment.payment_type),
  );

  const eligibleReceivedCents = eligiblePayments
    .filter((payment) => payment.status === "paid")
    .reduce((total, payment) => total + payment.amount_cents, 0);

  const eligibleRequestedCents = eligiblePayments
    .filter((payment) => isActiveDepositRequestStatus(payment.status))
    .reduce((total, payment) => total + payment.amount_cents, 0);

  const hasActiveArrhesRequest = eligiblePayments.some(
    (payment) =>
      payment.payment_type === "arrhes" &&
      isActiveDepositRequestStatus(payment.status),
  );

  const hasSeparatePreReservationDeposit = eligiblePayments.some(
    (payment) => payment.payment_type === "pre_reservation_deposit_refundable",
  );

  const arrhesPayments = eligiblePayments.filter(
    (payment) => payment.payment_type === "arrhes",
  );
  const activeArrhesPayments = arrhesPayments.filter(
    (payment) =>
      payment.status === "paid" || isActiveDepositRequestStatus(payment.status),
  );
  const paidArrhesPaymentCount = arrhesPayments.filter(
    (payment) => payment.status === "paid",
  ).length;
  const paidArrhesOnlyCents = arrhesPayments
    .filter((payment) => payment.status === "paid")
    .reduce((total, payment) => total + payment.amount_cents, 0);

  const hasFirstPaid =
    eligiblePayments.some(
      (payment) =>
        payment.status === "paid" &&
        payment.amount_cents === depositSettings.preReservationDepositCents,
    ) ||
    reservationStatus === "pre_reservation_paid" ||
    eligibleReceivedCents >= depositSettings.preReservationDepositCents;

  const hasSecondPayment = hasSeparatePreReservationDeposit
    ? activeArrhesPayments.length >= 1
    : activeArrhesPayments.some(
        (payment) =>
          isActiveDepositRequestStatus(payment.status) &&
          payment.amount_cents === depositSettings.arrhesSecondPaymentCents,
      ) || paidArrhesOnlyCents >= depositSettings.completeDepositCents;

  const hasSecondPaid = hasSeparatePreReservationDeposit
    ? paidArrhesPaymentCount >= 1
    : paidArrhesOnlyCents >= depositSettings.completeDepositCents;

  const hasCompleteDeposit =
    eligibleReceivedCents >= depositSettings.completeDepositCents;

  const remainingToRequestCents = Math.max(
    0,
    depositSettings.completeDepositCents - eligibleReceivedCents,
  );

  const canRequestPreReservationBalance =
    reservationStatus === "pre_reservation_paid" &&
    eligibleReceivedCents >= depositSettings.preReservationDepositCents &&
    eligibleReceivedCents < depositSettings.completeDepositCents &&
    !hasActiveArrhesRequest &&
    remainingToRequestCents > 0;

  return {
    eligibleReceivedCents,
    eligibleRequestedCents,
    remainingToRequestCents,
    hasActiveArrhesRequest,
    hasSeparatePreReservationDeposit,
    hasFirstPaid,
    hasSecondPayment,
    hasSecondPaid,
    hasCompleteDeposit,
    canRequestPreReservationBalance,
  };
}

export type PreReservationBalanceEligibilityOutcome =
  | "eligible"
  | "ineligible"
  | "pre_reservation_unpaid"
  | "active_request"
  | "complete";

/**
 * Server-side gate aligned with the UI eligibility helper.
 * Does not itself check organization membership (caller does via RLS/read).
 */
export function evaluatePreReservationBalanceRequest({
  reservationStatus,
  contactId,
  payments,
  depositSettings,
  isFinalStatus,
}: {
  reservationStatus: string | null | undefined;
  contactId: string | null | undefined;
  payments: DepositPaymentLike[];
  depositSettings: Pick<
    ResolvedDepositSettings,
    | "preReservationDepositCents"
    | "arrhesSecondPaymentCents"
    | "completeDepositCents"
  >;
  isFinalStatus: boolean;
}): {
  outcome: PreReservationBalanceEligibilityOutcome;
  balanceAmountCents: number;
  progress: PreReservationDepositProgress;
} {
  const progress = computePreReservationDepositProgress({
    payments,
    depositSettings,
    reservationStatus,
  });

  if (!contactId || isFinalStatus) {
    return {
      outcome: "ineligible",
      balanceAmountCents: 0,
      progress,
    };
  }

  if (reservationStatus !== "pre_reservation_paid") {
    return {
      outcome: "pre_reservation_unpaid",
      balanceAmountCents: 0,
      progress,
    };
  }

  if (progress.hasCompleteDeposit) {
    return {
      outcome: "complete",
      balanceAmountCents: 0,
      progress,
    };
  }

  if (progress.hasActiveArrhesRequest) {
    return {
      outcome: "active_request",
      balanceAmountCents: 0,
      progress,
    };
  }

  if (
    progress.eligibleReceivedCents < depositSettings.preReservationDepositCents
  ) {
    return {
      outcome: "pre_reservation_unpaid",
      balanceAmountCents: 0,
      progress,
    };
  }

  const balanceAmountCents =
    depositSettings.completeDepositCents - progress.eligibleReceivedCents;

  if (balanceAmountCents <= 0) {
    return {
      outcome: "complete",
      balanceAmountCents: 0,
      progress,
    };
  }

  return {
    outcome: "eligible",
    balanceAmountCents,
    progress,
  };
}

export type ReservationHolderPromotionOutcome =
  | "promote"
  | "below_threshold"
  | "ineligible";

/**
 * Pure gate for promoting to reservation_holder once admissible paid deposits
 * reach completeDepositCents. Does not mutate roles.
 */
export function evaluateReservationHolderPromotion({
  payments,
  depositSettings,
  reservationStatus,
  contactId,
  isFinalStatus,
}: {
  payments: DepositPaymentLike[];
  depositSettings: Pick<
    ResolvedDepositSettings,
    | "preReservationDepositCents"
    | "arrhesSecondPaymentCents"
    | "completeDepositCents"
  >;
  reservationStatus: string | null | undefined;
  contactId: string | null | undefined;
  isFinalStatus: boolean;
}): {
  outcome: ReservationHolderPromotionOutcome;
  eligibleReceivedCents: number;
  progress: PreReservationDepositProgress;
} {
  const progress = computePreReservationDepositProgress({
    payments,
    depositSettings,
    reservationStatus,
  });

  if (!contactId || isFinalStatus) {
    return {
      outcome: "ineligible",
      eligibleReceivedCents: progress.eligibleReceivedCents,
      progress,
    };
  }

  if (progress.eligibleReceivedCents < depositSettings.completeDepositCents) {
    return {
      outcome: "below_threshold",
      eligibleReceivedCents: progress.eligibleReceivedCents,
      progress,
    };
  }

  return {
    outcome: "promote",
    eligibleReceivedCents: progress.eligibleReceivedCents,
    progress,
  };
}

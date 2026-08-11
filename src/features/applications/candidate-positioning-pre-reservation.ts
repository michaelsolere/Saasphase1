export type DesiredTimingMode =
  | "unknown"
  | "earliest"
  | "season"
  | "not_before"
  | "no_preference";

export type DesiredSeason = "spring" | "summer" | "autumn" | "winter";

type DesiredTimingInput = {
  mode: DesiredTimingMode;
  season?: DesiredSeason | null;
  seasonYear?: number | null;
  notBeforeDate?: string | null;
};

type DesiredTimingValue = {
  mode: DesiredTimingMode;
  season: DesiredSeason | null;
  seasonYear: number | null;
  notBeforeDate: string | null;
};

export type DesiredTimingValidation =
  | { ok: true; value: DesiredTimingValue }
  | {
      ok: false;
      reason:
        | "season_required"
        | "season_year_required"
        | "season_year_invalid"
        | "not_before_date_required"
        | "not_before_date_invalid";
    };

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateDesiredTiming(
  input: DesiredTimingInput,
): DesiredTimingValidation {
  if (input.mode === "season") {
    if (!input.season) return { ok: false, reason: "season_required" };
    if (input.seasonYear === null || input.seasonYear === undefined) {
      return { ok: false, reason: "season_year_required" };
    }
    if (
      !Number.isInteger(input.seasonYear) ||
      input.seasonYear < 2000 ||
      input.seasonYear > 2200
    ) {
      return { ok: false, reason: "season_year_invalid" };
    }
    return {
      ok: true,
      value: {
        mode: input.mode,
        season: input.season,
        seasonYear: input.seasonYear,
        notBeforeDate: null,
      },
    };
  }

  if (input.mode === "not_before") {
    if (!input.notBeforeDate) {
      return { ok: false, reason: "not_before_date_required" };
    }
    if (!isIsoDate(input.notBeforeDate)) {
      return { ok: false, reason: "not_before_date_invalid" };
    }
    return {
      ok: true,
      value: {
        mode: input.mode,
        season: null,
        seasonYear: null,
        notBeforeDate: input.notBeforeDate,
      },
    };
  }

  return {
    ok: true,
    value: {
      mode: input.mode,
      season: null,
      seasonYear: null,
      notBeforeDate: null,
    },
  };
}

export function evaluatePreReservationProposalEligibility({
  applicationStatus,
  hasStartedJourney,
  recipientEmail,
  targetLitterId,
  targetLitterGroupId,
  targetLitterStatus,
  confirmedLitterCountInGroup,
}: {
  applicationStatus: string;
  hasStartedJourney: boolean;
  recipientEmail: string | null;
  targetLitterId: string | null;
  targetLitterGroupId: string | null;
  targetLitterStatus: string | null;
  confirmedLitterCountInGroup: number;
}): { eligible: boolean; reason: string | null } {
  if (applicationStatus !== "qualified") {
    return { eligible: false, reason: "application_not_qualified" };
  }
  if (hasStartedJourney) {
    return { eligible: false, reason: "journey_already_started" };
  }
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { eligible: false, reason: "recipient_email_invalid" };
  }
  if (targetLitterId && targetLitterStatus !== "pregnancy_confirmed") {
    return { eligible: false, reason: "target_litter_not_confirmed" };
  }
  if (
    (!targetLitterId && !targetLitterGroupId) ||
    (!targetLitterId && confirmedLitterCountInGroup < 1)
  ) {
    return { eligible: false, reason: "confirmed_scope_required" };
  }
  return { eligible: true, reason: null };
}

export function resolveCandidateJourneyEntryMode({
  actualBirthDate,
}: {
  actualBirthDate: string | null;
}) {
  return actualBirthDate
    ? ("direct_reservation_after_birth" as const)
    : ("pre_reservation_before_birth" as const);
}

export function allocateCandidateJourneyPayment({
  expectedFirstCents,
  completeDepositCents,
  receivedCents,
  acceptShortfallForOpening,
}: {
  expectedFirstCents: number;
  completeDepositCents: number;
  receivedCents: number;
  acceptShortfallForOpening: boolean;
}) {
  const firstPaymentAllocatedCents = Math.min(receivedCents, expectedFirstCents);
  const amountAfterFirst = Math.max(0, receivedCents - expectedFirstCents);
  const nextPaymentCapacityCents = Math.max(
    0,
    completeDepositCents - expectedFirstCents,
  );
  const nextPaymentAdvanceCents = Math.min(
    amountAfterFirst,
    nextPaymentCapacityCents,
  );
  const unallocatedSurplusCents = Math.max(
    0,
    amountAfterFirst - nextPaymentCapacityCents,
  );
  const opensJourney =
    receivedCents >= expectedFirstCents ||
    (receivedCents > 0 && acceptShortfallForOpening);

  return {
    receivedCents,
    firstPaymentAllocatedCents,
    nextPaymentAdvanceCents,
    unallocatedSurplusCents,
    remainingCompleteDepositCents: Math.max(
      0,
      completeDepositCents - Math.min(receivedCents, completeDepositCents),
    ),
    opensJourney,
    requiresShortfallReason:
      receivedCents < expectedFirstCents && acceptShortfallForOpening,
  };
}

export function calculateCandidatePaymentRank({
  initialRank,
  deadline,
  acceptedAt,
  activeOnTimeRanks,
  lateAcceptances,
  reservationId,
}: {
  initialRank: number;
  deadline: string;
  acceptedAt: string;
  activeOnTimeRanks: number[];
  lateAcceptances: Array<{ reservationId: string; acceptedAt: string }>;
  reservationId: string;
}) {
  if (acceptedAt <= deadline) {
    return { rank: initialRank, late: false };
  }

  const lastHistoricalRank = Math.max(initialRank, 0, ...activeOnTimeRanks);
  const orderedLateReservations = [
    ...lateAcceptances.filter((item) => item.reservationId !== reservationId),
    { reservationId, acceptedAt },
  ].sort(
    (left, right) =>
      left.acceptedAt.localeCompare(right.acceptedAt) ||
      left.reservationId.localeCompare(right.reservationId),
  );

  return {
    rank:
      lastHistoricalRank +
      orderedLateReservations.findIndex((item) => item.reservationId === reservationId) +
      1,
    late: true,
  };
}

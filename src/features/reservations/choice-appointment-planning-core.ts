export type ChoiceAppointmentEligibilityInput = {
  positionStatus: string | null;
  sex: "male" | "female" | null;
  activeOrder: number | null;
  historicalRank: number | null;
  requiredDocuments: Array<{ type: string; status: string }>;
  paidDepositCents: number;
  completeDepositCents: number;
};

export type ChoiceAppointmentEligibilityBlocker =
  | "place_not_confirmed"
  | "sex_not_confirmed"
  | "active_order_not_confirmed"
  | "required_documents_not_signed"
  | "deposit_incomplete";

const requiredDocumentTypes = [
  "commitment_certificate",
  "reservation_contract",
] as const;

export function evaluateChoiceAppointmentEligibility(
  input: ChoiceAppointmentEligibilityInput,
) {
  const blockers: ChoiceAppointmentEligibilityBlocker[] = [];

  if (input.positionStatus !== "confirmed") {
    blockers.push("place_not_confirmed");
  }
  if (input.sex !== "male" && input.sex !== "female") {
    blockers.push("sex_not_confirmed");
  }
  if (!Number.isInteger(input.activeOrder) || (input.activeOrder ?? 0) < 1) {
    blockers.push("active_order_not_confirmed");
  }
  const signedTypes = new Set(
    input.requiredDocuments
      .filter((document) => document.status === "signed")
      .map((document) => document.type),
  );
  if (requiredDocumentTypes.some((type) => !signedTypes.has(type))) {
    blockers.push("required_documents_not_signed");
  }
  if (input.paidDepositCents < input.completeDepositCents) {
    blockers.push("deposit_incomplete");
  }

  return { eligible: blockers.length === 0, blockers };
}

type ChoiceAppointmentQueueEntry = {
  reservationId: string;
  activeOrder: number;
  historicalRank: number;
};

export type ChoiceAppointmentDraftInput = {
  startsAt: string;
  durationMinutes: number;
  male: ChoiceAppointmentQueueEntry[];
  female: ChoiceAppointmentQueueEntry[];
};

function normalizedFile(entries: ChoiceAppointmentQueueEntry[]) {
  const ordered = [...entries].sort(
    (left, right) =>
      left.activeOrder - right.activeOrder ||
      left.reservationId.localeCompare(right.reservationId),
  );
  if (
    ordered.some(
      (entry, index) =>
        !Number.isInteger(entry.activeOrder) ||
        entry.activeOrder < 1 ||
        (index > 0 && entry.activeOrder === ordered[index - 1]?.activeOrder) ||
        !Number.isInteger(entry.historicalRank) ||
        entry.historicalRank < 1,
    )
  ) {
    throw new Error("invalid_active_file");
  }
  return ordered;
}

export function buildChoiceAppointmentDraft(
  input: ChoiceAppointmentDraftInput,
) {
  const start = new Date(input.startsAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 5 ||
    input.durationMinutes > 480
  ) {
    throw new Error("invalid_schedule");
  }

  const male = normalizedFile(input.male);
  const female = normalizedFile(input.female);
  const reservationIds = [...male, ...female].map((entry) => entry.reservationId);
  if (new Set(reservationIds).size !== reservationIds.length) {
    throw new Error("invalid_active_file");
  }

  const merged: Array<ChoiceAppointmentQueueEntry & { sex: "male" | "female" }> = [];
  let maleIndex = 0;
  let femaleIndex = 0;
  while (maleIndex < male.length || femaleIndex < female.length) {
    const maleHead = male[maleIndex];
    const femaleHead = female[femaleIndex];
    if (
      maleHead &&
      (!femaleHead ||
        maleHead.historicalRank < femaleHead.historicalRank ||
        (maleHead.historicalRank === femaleHead.historicalRank &&
          maleHead.reservationId.localeCompare(femaleHead.reservationId) <= 0))
    ) {
      merged.push({ ...maleHead, sex: "male" });
      maleIndex += 1;
    } else if (femaleHead) {
      merged.push({ ...femaleHead, sex: "female" });
      femaleIndex += 1;
    }
  }

  return merged.map((entry, index) => ({
    ...entry,
    sequence: index + 1,
    plannedAt: new Date(
      start.getTime() + index * input.durationMinutes * 60_000,
    ).toISOString(),
  }));
}

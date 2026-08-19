import { shiftParisCalendarDays } from "@/features/departures/departure-time-zone";

export type DepartureSlotVisibility = "public" | "exceptional";
export type DepartureSlotStatus =
  | "open"
  | "booked"
  | "to_review"
  | "cancelled"
  | "completed"
  | "late"
  | "no_show";

export type DepartureSlot = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  visibility: DepartureSlotVisibility;
  status: DepartureSlotStatus;
  reservationId: string | null;
  litterIds: string[];
};

export function buildDepartureSlot(input: {
  id: string;
  startsAt: string;
  defaultDurationMinutes: number;
  durationMinutes?: number;
  visibility?: DepartureSlotVisibility;
  reservationId?: string | null;
  litterIds: string[];
}): DepartureSlot {
  const startsAt = new Date(input.startsAt);
  const durationMinutes = input.durationMinutes ?? input.defaultDurationMinutes;
  const visibility = input.visibility ?? "public";
  const reservationId = input.reservationId ?? null;
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480 ||
    input.litterIds.length === 0 ||
    new Set(input.litterIds).size !== input.litterIds.length ||
    (visibility === "exceptional" && !reservationId)
  ) {
    throw new Error("invalid_departure_slot");
  }
  return {
    id: input.id,
    startsAt: startsAt.toISOString(),
    durationMinutes,
    visibility,
    status: reservationId ? "booked" : "open",
    reservationId,
    litterIds: [...input.litterIds],
  };
}

function interval(slot: Pick<DepartureSlot, "startsAt" | "durationMinutes">) {
  const start = Date.parse(slot.startsAt);
  return { start, end: start + slot.durationMinutes * 60_000 };
}

export function slotsOverlap(
  left: Pick<DepartureSlot, "startsAt" | "durationMinutes">,
  right: Pick<DepartureSlot, "startsAt" | "durationMinutes">,
) {
  const a = interval(left);
  const b = interval(right);
  if (![a.start, a.end, b.start, b.end].every(Number.isFinite)) {
    throw new Error("invalid_departure_slot");
  }
  return a.start < b.end && b.start < a.end;
}

export function eligiblePublicSlots(
  slots: DepartureSlot[],
  input: { litterId: string; earliestDepartureAt: string },
) {
  const earliest = Date.parse(input.earliestDepartureAt);
  if (!Number.isFinite(earliest)) throw new Error("invalid_earliest_departure");
  return slots
    .filter(
      (slot) =>
        slot.visibility === "public" &&
        slot.status === "open" &&
        !slot.reservationId &&
        slot.litterIds.includes(input.litterId) &&
        Date.parse(slot.startsAt) >= earliest,
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function evaluateDeparturePlanCoverage(input: {
  slots: DepartureSlot[];
  invitedReservationIds: string[];
}) {
  const invitedCount = new Set(input.invitedReservationIds).size;
  const freePublicSlotCount = input.slots.filter(
    (slot) => slot.visibility === "public" && slot.status === "open" && !slot.reservationId,
  ).length;
  return {
    canSend: freePublicSlotCount >= invitedCount,
    invitedCount,
    freePublicSlotCount,
    missingSlotCount: Math.max(0, invitedCount - freePublicSlotCount),
  };
}

export function buildCollectiveShiftDraft(input: {
  slots: DepartureSlot[];
  litterId: string;
  dayDelta: number;
}) {
  if (!Number.isInteger(input.dayDelta) || input.dayDelta === 0) {
    throw new Error("invalid_departure_shift");
  }
  return input.slots
    .filter((slot) => slot.litterIds.includes(input.litterId) && slot.reservationId)
    .map((slot) => ({
      slotId: slot.id,
      previousStartsAt: slot.startsAt,
      proposedStartsAt: shiftParisCalendarDays(slot.startsAt, input.dayDelta)!,
      durationMinutes: slot.durationMinutes,
    }));
}

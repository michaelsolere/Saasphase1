import { isFinalReservationStatus } from "@/features/reservations/statuses";

export function isActionableLinkedReservation(
  reservationId: string | null | undefined,
  reservationStatusById: Map<string, string | null | undefined>,
) {
  if (!reservationId) {
    return true;
  }

  return !isFinalReservationStatus(reservationStatusById.get(reservationId));
}

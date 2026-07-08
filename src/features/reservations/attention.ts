import { COMPLETE_DEPOSIT_AMOUNT_CENTS } from "@/features/payments/deposit-thresholds";
import { isFinalReservationStatus } from "@/features/reservations/statuses";

type AttentionReservation = {
  animal_id: string | null;
  status: string | null;
};

export function reservationNeedsAttention(
  reservation: AttentionReservation,
  paidArrhesCents: number,
) {
  const isPreReservationRequested =
    reservation.status === "pre_reservation_requested";
  const isPreReservationPaid = reservation.status === "pre_reservation_paid";
  const isArrhesCompleteWithoutAnimal =
    paidArrhesCents >= COMPLETE_DEPOSIT_AMOUNT_CENTS &&
    !reservation.animal_id &&
    reservation.status !== "animal_assigned" &&
    !isFinalReservationStatus(reservation.status);

  return (
    isPreReservationRequested ||
    isPreReservationPaid ||
    isArrhesCompleteWithoutAnimal
  );
}

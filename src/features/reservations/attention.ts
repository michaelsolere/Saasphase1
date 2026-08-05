import { resolveDepositSettings } from "@/features/payments/deposit-thresholds";
import { isFinalReservationStatus } from "@/features/reservations/statuses";

type AttentionReservation = {
  animal_id: string | null;
  financial_resolution?: string | null;
  status: string | null;
};

export function reservationNeedsAttention(
  reservation: AttentionReservation,
  paidArrhesCents: number,
  completeDepositCents = resolveDepositSettings(null).completeDepositCents,
) {
  const isPreReservationPaid = reservation.status === "pre_reservation_paid";
  const hasPendingFinancialResolution =
    reservation.financial_resolution === "pending";
  const isArrhesCompleteWithoutAnimal =
    paidArrhesCents >= completeDepositCents &&
    !reservation.animal_id &&
    reservation.status !== "animal_assigned" &&
    !isFinalReservationStatus(reservation.status);

  return (
    hasPendingFinancialResolution ||
    isPreReservationPaid ||
    isArrhesCompleteWithoutAnimal
  );
}

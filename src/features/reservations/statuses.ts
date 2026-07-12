export const FINAL_RESERVATION_STATUSES = [
  "adopted",
  "withdrawn",
  "cancelled",
  "expired",
  "archived",
] as const;

export const NEGATIVE_FINAL_RESERVATION_STATUSES = [
  "withdrawn",
  "cancelled",
  "expired",
  "archived",
] as const;

export const PRE_RESERVATION_REQUEST_VISIBLE_STATUSES = [
  "pre_reservation_requested",
  "pre_reservation_paid",
  "active",
  "confirmed_after_birth",
  "waiting_for_available_sex",
  "postponed",
  "animal_assigned",
  "adoption_ready",
  "adopted",
] as const;

export const PRE_RESERVATION_PAID_VISIBLE_STATUSES =
  PRE_RESERVATION_REQUEST_VISIBLE_STATUSES.filter(
    (status) => status !== "pre_reservation_requested",
  );

export function isFinalReservationStatus(status: string | null | undefined) {
  return !!status && FINAL_RESERVATION_STATUSES.includes(
    status as (typeof FINAL_RESERVATION_STATUSES)[number],
  );
}

export function isNegativeFinalReservationStatus(
  status: string | null | undefined,
) {
  return !!status && NEGATIVE_FINAL_RESERVATION_STATUSES.includes(
    status as (typeof NEGATIVE_FINAL_RESERVATION_STATUSES)[number],
  );
}

export function hasVisiblePreReservationRequest(
  status: string | null | undefined,
) {
  return !!status && PRE_RESERVATION_REQUEST_VISIBLE_STATUSES.includes(
    status as (typeof PRE_RESERVATION_REQUEST_VISIBLE_STATUSES)[number],
  );
}

export function hasVisiblePaidPreReservation(
  status: string | null | undefined,
) {
  return !!status && PRE_RESERVATION_PAID_VISIBLE_STATUSES.includes(
    status as (typeof PRE_RESERVATION_PAID_VISIBLE_STATUSES)[number],
  );
}

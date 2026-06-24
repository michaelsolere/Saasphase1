export const FINAL_RESERVATION_STATUSES = [
  "adopted",
  "withdrawn",
  "cancelled",
  "expired",
  "archived",
] as const;

export function isFinalReservationStatus(status: string | null | undefined) {
  return !!status && FINAL_RESERVATION_STATUSES.includes(
    status as (typeof FINAL_RESERVATION_STATUSES)[number],
  );
}

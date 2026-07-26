import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
  LITTER_JOURNAL_TIME_ZONE,
} from "@/features/litter-journal/date";

import type { AdopterAppointmentBreedingCalendarEvent } from "./breeding-calendar-contract";

export const ADOPTER_APPOINTMENT_EVENT_TYPES = ["puppy_choice", "adoption"] as const;
export type AdopterAppointmentEventType = (typeof ADOPTER_APPOINTMENT_EVENT_TYPES)[number];

export const ADOPTER_APPOINTMENT_VISIBLE_STATUSES = ["planned", "done"] as const;
export type AdopterAppointmentVisibleStatus =
  (typeof ADOPTER_APPOINTMENT_VISIBLE_STATUSES)[number];

export const adopterAppointmentTypeLabels: Record<AdopterAppointmentEventType, string> = {
  puppy_choice: "Choix du chiot/chaton",
  adoption: "Adoption / départ",
};

export const adopterAppointmentStatusLabels: Record<AdopterAppointmentVisibleStatus, string> = {
  planned: "Proposé",
  done: "Confirmé",
};

export type AdopterAppointmentCalendarRecord = {
  id: string;
  reservationId: string;
  eventType: string;
  status: string;
  plannedAt: string;
  updatedAt: string;
  contactLabel: string;
};

export function isAdopterAppointmentEventType(
  value: string,
): value is AdopterAppointmentEventType {
  return (ADOPTER_APPOINTMENT_EVENT_TYPES as readonly string[]).includes(value);
}

export function isAdopterAppointmentVisibleStatus(
  value: string,
): value is AdopterAppointmentVisibleStatus {
  return (ADOPTER_APPOINTMENT_VISIBLE_STATUSES as readonly string[]).includes(value);
}

/** Stable ICS SEQUENCE derived from updated_at when no métier revision exists. */
export function sequenceFromUpdatedAt(updatedAt: string): number {
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 1000));
}

export function reservationAppointmentsHref(reservationId: string) {
  return `/reservations/${reservationId}#appointments`;
}

export function resolveAdopterContactLabel(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const composed = [input.firstName, input.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return composed || "Dossier adoptant";
}

/**
 * Converts a reservation appointment event into a breeding-calendar event.
 * Only puppy_choice / adoption with planned|done and a planned_at instant are admitted.
 */
export function toAdopterAppointmentCalendarEvent(
  record: AdopterAppointmentCalendarRecord,
): AdopterAppointmentBreedingCalendarEvent | null {
  if (!isAdopterAppointmentEventType(record.eventType)) return null;
  if (!isAdopterAppointmentVisibleStatus(record.status)) return null;
  if (!record.reservationId || !record.id) return null;

  const instant = new Date(record.plannedAt);
  if (!Number.isFinite(instant.getTime())) return null;

  const startsOn = formatLitterJournalBusinessDate(instant);
  const startsLocalTime = getLitterJournalBusinessLocalTime(instant);

  return {
    identitySource: "adopter-appointment",
    sourceType: "adopter_appointment",
    sourceRecordId: record.id,
    reservationId: record.reservationId,
    appointmentStatus: record.status,
    title: adopterAppointmentTypeLabels[record.eventType],
    contextLabel: resolveAdopterContactLabel({ displayName: record.contactLabel }),
    startsOn,
    startsLocalTime,
    endsOn: null,
    endsLocalTime: null,
    timezoneName: LITTER_JOURNAL_TIME_ZONE,
    isAllDay: false,
    sequence: sequenceFromUpdatedAt(record.updatedAt),
    lastModifiedAt: record.updatedAt,
    kind: record.eventType,
    category: "adopter_appointment",
    href: reservationAppointmentsHref(record.reservationId),
  };
}

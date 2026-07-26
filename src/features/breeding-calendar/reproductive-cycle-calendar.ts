import { sequenceFromUpdatedAt } from "@/features/breeding-calendar/adopter-appointment-calendar";
import type { ReproductiveCycleBreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";

export const REPRODUCTIVE_CYCLE_CALENDAR_STATUSES = ["planned", "in_progress"] as const;
export type ReproductiveCycleCalendarStatus =
  (typeof REPRODUCTIVE_CYCLE_CALENDAR_STATUSES)[number];

export const reproductiveCycleCalendarTitleLabels: Record<
  ReproductiveCycleCalendarStatus,
  string
> = {
  planned: "Chaleurs prévues",
  in_progress: "Chaleurs en cours",
};

export const reproductiveCycleCalendarStatusLabels: Record<
  ReproductiveCycleCalendarStatus,
  string
> = {
  planned: "Prévu",
  in_progress: "En cours",
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReproductiveCycleCalendarRecord = {
  id: string;
  motherId: string;
  status: string;
  startedOn: string;
  updatedAt: string;
  animalLabel: string;
};

export function isReproductiveCycleCalendarStatus(
  value: string,
): value is ReproductiveCycleCalendarStatus {
  return (REPRODUCTIVE_CYCLE_CALENDAR_STATUSES as readonly string[]).includes(value);
}

export function isValidReproductiveCycleCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function resolveReproductiveCycleAnimalLabel(input: {
  callName?: string | null;
  officialName?: string | null;
}) {
  const callName = input.callName?.trim();
  if (callName) return callName;
  const officialName = input.officialName?.trim();
  if (officialName) return officialName;
  return "Femelle";
}

export function reproductiveCycleHref(motherId: string, cycleId: string) {
  return `/animals/${motherId}/reproduction#cycle-${cycleId}`;
}

/**
 * Converts a reproductive cycle into a breeding-calendar event.
 * Only planned / in_progress cycles with a valid started_on are admitted.
 */
export function toReproductiveCycleCalendarEvent(
  record: ReproductiveCycleCalendarRecord,
): ReproductiveCycleBreedingCalendarEvent | null {
  if (!record.id || !record.motherId) return null;
  if (!isReproductiveCycleCalendarStatus(record.status)) return null;
  if (!isValidReproductiveCycleCalendarDate(record.startedOn)) return null;

  const animalLabel = record.animalLabel.trim() || "Femelle";

  return {
    identitySource: "reproductive-cycle",
    sourceType: "reproductive_cycle",
    sourceRecordId: record.id,
    motherId: record.motherId,
    cycleStatus: record.status,
    title: reproductiveCycleCalendarTitleLabels[record.status],
    contextLabel: animalLabel,
    startsOn: record.startedOn,
    startsLocalTime: null,
    endsOn: null,
    endsLocalTime: null,
    timezoneName: null,
    isAllDay: true,
    sequence: sequenceFromUpdatedAt(record.updatedAt),
    lastModifiedAt: record.updatedAt,
    kind: "heat_cycle",
    category: "reproduction",
    href: reproductiveCycleHref(record.motherId, record.id),
  };
}

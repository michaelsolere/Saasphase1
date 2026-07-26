import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";

export const BREEDING_CALENDAR_SOURCE_TYPES = ["litter_care", "adopter_appointment"] as const;
export type BreedingCalendarSourceType = (typeof BREEDING_CALENDAR_SOURCE_TYPES)[number];

export const BREEDING_CALENDAR_SOURCE_FILTERS = ["all", "litter_care", "adopter_appointment"] as const;
export type BreedingCalendarSourceFilter = (typeof BREEDING_CALENDAR_SOURCE_FILTERS)[number];

export type BreedingCalendarEventCommon = {
  identitySource: "litter-care" | "adopter-appointment";
  sourceType: BreedingCalendarSourceType;
  sourceRecordId: string;
  title: string;
  contextLabel: string;
  startsOn: string;
  startsLocalTime: string | null;
  endsOn: string | null;
  endsLocalTime: string | null;
  timezoneName: string | null;
  isAllDay: boolean;
  sequence: number;
  lastModifiedAt: string;
  kind: string;
  category: string;
  href: string;
};

export type LitterCareBreedingCalendarEvent = BreedingCalendarEventCommon & {
  identitySource: "litter-care";
  sourceType: "litter_care";
  litterId: string;
  itemKind: LitterCareTaskSummary["itemKind"];
};

export type AdopterAppointmentBreedingCalendarEvent = BreedingCalendarEventCommon & {
  identitySource: "adopter-appointment";
  sourceType: "adopter_appointment";
  reservationId: string;
  appointmentStatus: "planned" | "done";
};

export type BreedingCalendarEvent =
  | LitterCareBreedingCalendarEvent
  | AdopterAppointmentBreedingCalendarEvent;

export type OrganizationBreedingCalendar = {
  organizationId: string;
  events: BreedingCalendarEvent[];
  litterNames: Record<string, string>;
};

export function toBreedingCalendarEvent(
  task: LitterCareTaskSummary,
  litterName: string,
): LitterCareBreedingCalendarEvent | null {
  if (task.status !== "planned") return null;
  const isWindow = task.itemKind === "window";
  const startsOn = isWindow ? task.retainedStartsOn : task.plannedFor;
  if (!startsOn) return null;
  return {
    identitySource: "litter-care",
    sourceType: "litter_care",
    category: task.category,
    title: task.title,
    contextLabel: litterName,
    startsOn,
    startsLocalTime: isWindow ? task.retainedStartsLocalTime : task.scheduledLocalTime,
    endsOn: isWindow ? task.retainedEndsOn : null,
    endsLocalTime: isWindow ? task.retainedEndsLocalTime : null,
    timezoneName: task.scheduleTimezoneName,
    isAllDay: isWindow
      ? !(task.retainedStartsLocalTime && task.retainedEndsLocalTime)
      : !task.scheduledLocalTime,
    sequence: task.revisionNo,
    lastModifiedAt: task.createdAt,
    sourceRecordId: task.id,
    litterId: task.litterId,
    itemKind: task.itemKind,
    kind: task.itemKind,
    href: `/litters/journal?litter=${encodeURIComponent(task.litterId)}#litter-care-tasks`,
  };
}

export function isLitterCareBreedingCalendarEvent(
  event: BreedingCalendarEvent,
): event is LitterCareBreedingCalendarEvent {
  return event.sourceType === "litter_care";
}

export function isAdopterAppointmentBreedingCalendarEvent(
  event: BreedingCalendarEvent,
): event is AdopterAppointmentBreedingCalendarEvent {
  return event.sourceType === "adopter_appointment";
}

export function breedingCalendarEventIdentity(event: BreedingCalendarEvent) {
  return `${event.identitySource}:${event.sourceRecordId}`;
}

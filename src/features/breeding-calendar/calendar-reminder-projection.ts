import {
  formatCivilDateInTimeZone,
  isValidCivilDate,
  isValidIanaTimeZone,
  isValidLocalTime,
  localCivilDateTimeToUtcIso,
  subtractCivilDays,
} from "@/lib/timezone";
import type { BreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";
import { breedingCalendarEventIdentity } from "@/features/breeding-calendar/breeding-calendar-contract";

export const CALENDAR_REMINDER_SOURCE_TYPES = [
  "litter_care_task",
  "reproductive_cycle",
  "adopter_event",
] as const;
export type CalendarReminderSourceType =
  (typeof CALENDAR_REMINDER_SOURCE_TYPES)[number];

export const CALENDAR_REMINDER_PROJECTION_STATES = [
  "upcoming",
  "later_today",
  "due",
  "overdue",
  "acknowledged_today",
  "acknowledged",
  "inactive_source",
  "invalid_projection",
] as const;
export type CalendarReminderProjectionState =
  (typeof CALENDAR_REMINDER_PROJECTION_STATES)[number];

export const DEFAULT_CALENDAR_REMINDER_TIMEZONE = "Europe/Paris";

export type CalendarReminderRule = {
  id: string;
  organizationId: string;
  sourceType: CalendarReminderSourceType;
  sourceRecordId: string;
  daysBefore: number;
  localTime: string;
  timezoneName: string;
  revisionNo: number;
  acknowledgedTriggerAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

export type CalendarReminderProjection = {
  id: string;
  organizationId: string;
  sourceType: CalendarReminderSourceType;
  sourceRecordId: string;
  daysBefore: number;
  localTime: string;
  timezoneName: string;
  revisionNo: number;
  eventDate: string | null;
  triggerLocalDate: string | null;
  currentTriggerAt: string | null;
  projectionState: CalendarReminderProjectionState;
  acknowledgedTriggerAt: string | null;
  acknowledgedAt: string | null;
  scheduleLabel: string;
  eventIdentity: string | null;
  event: BreedingCalendarEvent | null;
};

function normalizeLocalTime(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
}

export function formatCalendarReminderScheduleLabel(
  daysBefore: number,
  localTime: string,
): string {
  const time = normalizeLocalTime(localTime);
  if (daysBefore === 0) return `Le jour même à ${time}`;
  if (daysBefore === 1) return `1 jour avant à ${time}`;
  return `${daysBefore} jours avant à ${time}`;
}

export function computeCalendarReminderTriggerLocalDate(
  eventDate: string,
  daysBefore: number,
): string | null {
  if (!isValidCivilDate(eventDate)) return null;
  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 365) {
    return null;
  }
  return subtractCivilDays(eventDate, daysBefore);
}

export function computeCalendarReminderTriggerAt(input: {
  eventDate: string;
  daysBefore: number;
  localTime: string;
  timezoneName: string;
}): string | null {
  const triggerDate = computeCalendarReminderTriggerLocalDate(
    input.eventDate,
    input.daysBefore,
  );
  if (!triggerDate) return null;
  const time = normalizeLocalTime(input.localTime);
  if (!isValidLocalTime(time) || !isValidIanaTimeZone(input.timezoneName)) {
    return null;
  }
  return localCivilDateTimeToUtcIso(triggerDate, time, input.timezoneName);
}

export function resolveCalendarReminderEventDate(
  event: BreedingCalendarEvent,
  timezoneName: string,
): string | null {
  if (event.sourceType === "adopter_appointment") {
    const instant = new Date(event.startsAt);
    if (!Number.isFinite(instant.getTime())) return null;
    return formatCivilDateInTimeZone(instant, timezoneName);
  }
  if (!isValidCivilDate(event.startsOn)) return null;
  return event.startsOn;
}

export function isCalendarReminderSourceActive(
  event: BreedingCalendarEvent | null | undefined,
): event is BreedingCalendarEvent {
  if (!event) return false;
  if (event.sourceType === "litter_care") return true;
  if (event.sourceType === "reproductive_cycle") {
    return event.cycleStatus === "planned" || event.cycleStatus === "in_progress";
  }
  return event.appointmentStatus === "planned";
}

export function classifyCalendarReminderProjectionState(input: {
  now: Date;
  timezoneName: string;
  currentTriggerAt: string | null;
  acknowledgedTriggerAt: string | null;
  acknowledgedAt: string | null;
  sourceActive: boolean;
}): CalendarReminderProjectionState {
  if (!input.sourceActive) return "inactive_source";
  if (!input.currentTriggerAt) return "invalid_projection";

  const trigger = new Date(input.currentTriggerAt);
  if (!Number.isFinite(trigger.getTime())) return "invalid_projection";

  const today = formatCivilDateInTimeZone(input.now, input.timezoneName);
  const triggerDay = formatCivilDateInTimeZone(trigger, input.timezoneName);
  if (!today || !triggerDay) return "invalid_projection";

  const acknowledgedForCurrent =
    input.acknowledgedTriggerAt != null &&
    Number.isFinite(new Date(input.acknowledgedTriggerAt).getTime()) &&
    Number.isFinite(trigger.getTime()) &&
    new Date(input.acknowledgedTriggerAt).getTime() === trigger.getTime();

  if (acknowledgedForCurrent) {
    if (input.acknowledgedAt) {
      const ackInstant = new Date(input.acknowledgedAt);
      const ackDay = Number.isFinite(ackInstant.getTime())
        ? formatCivilDateInTimeZone(ackInstant, input.timezoneName)
        : null;
      if (ackDay === today) return "acknowledged_today";
    }
    return "acknowledged";
  }

  if (triggerDay > today) return "upcoming";
  if (triggerDay < today) return "overdue";

  if (trigger.getTime() > input.now.getTime()) return "later_today";
  return "due";
}

export function projectCalendarReminder(input: {
  reminder: CalendarReminderRule;
  event: BreedingCalendarEvent | null;
  now: Date;
}): CalendarReminderProjection {
  const localTime = normalizeLocalTime(input.reminder.localTime);
  const scheduleLabel = formatCalendarReminderScheduleLabel(
    input.reminder.daysBefore,
    localTime,
  );
  const sourceActive = isCalendarReminderSourceActive(input.event);
  const eventDate = input.event
    ? resolveCalendarReminderEventDate(input.event, input.reminder.timezoneName)
    : null;
  const triggerLocalDate =
    eventDate != null
      ? computeCalendarReminderTriggerLocalDate(
          eventDate,
          input.reminder.daysBefore,
        )
      : null;
  const currentTriggerAt =
    eventDate != null
      ? computeCalendarReminderTriggerAt({
          eventDate,
          daysBefore: input.reminder.daysBefore,
          localTime,
          timezoneName: input.reminder.timezoneName,
        })
      : null;

  const projectionState = classifyCalendarReminderProjectionState({
    now: input.now,
    timezoneName: input.reminder.timezoneName,
    currentTriggerAt,
    acknowledgedTriggerAt: input.reminder.acknowledgedTriggerAt,
    acknowledgedAt: input.reminder.acknowledgedAt,
    sourceActive,
  });

  return {
    id: input.reminder.id,
    organizationId: input.reminder.organizationId,
    sourceType: input.reminder.sourceType,
    sourceRecordId: input.reminder.sourceRecordId,
    daysBefore: input.reminder.daysBefore,
    localTime,
    timezoneName: input.reminder.timezoneName,
    revisionNo: input.reminder.revisionNo,
    eventDate,
    triggerLocalDate,
    currentTriggerAt,
    projectionState,
    acknowledgedTriggerAt: input.reminder.acknowledgedTriggerAt,
    acknowledgedAt: input.reminder.acknowledgedAt,
    scheduleLabel,
    eventIdentity: input.event ? breedingCalendarEventIdentity(input.event) : null,
    event: input.event,
  };
}

export function calendarReminderSourceTypeFromEvent(
  event: BreedingCalendarEvent,
): CalendarReminderSourceType {
  if (event.sourceType === "litter_care") return "litter_care_task";
  if (event.sourceType === "reproductive_cycle") return "reproductive_cycle";
  return "adopter_event";
}

export function calendarReminderEventIdentityFromSource(
  sourceType: CalendarReminderSourceType,
  sourceRecordId: string,
): string {
  if (sourceType === "litter_care_task") return `litter-care:${sourceRecordId}`;
  if (sourceType === "reproductive_cycle") {
    return `reproductive-cycle:${sourceRecordId}`;
  }
  return `adopter-appointment:${sourceRecordId}`;
}

export function isCalendarReminderActionableState(
  state: CalendarReminderProjectionState,
): boolean {
  return state === "due" || state === "overdue" || state === "later_today";
}

export function sortCalendarReminderProjections(
  reminders: readonly CalendarReminderProjection[],
): CalendarReminderProjection[] {
  return [...reminders].sort((left, right) => {
    const leftTrigger = left.currentTriggerAt ?? "";
    const rightTrigger = right.currentTriggerAt ?? "";
    if (leftTrigger !== rightTrigger) {
      return leftTrigger.localeCompare(rightTrigger);
    }
    const leftTitle = left.event?.title ?? "";
    const rightTitle = right.event?.title ?? "";
    if (leftTitle !== rightTitle) return leftTitle.localeCompare(rightTitle, "fr");
    return left.id.localeCompare(right.id);
  });
}

export function partitionCalendarRemindersForToday(
  reminders: readonly CalendarReminderProjection[],
) {
  const actionable: CalendarReminderProjection[] = [];
  const laterToday: CalendarReminderProjection[] = [];
  const acknowledgedToday: CalendarReminderProjection[] = [];

  for (const reminder of sortCalendarReminderProjections(reminders)) {
    if (
      reminder.projectionState === "due" ||
      reminder.projectionState === "overdue"
    ) {
      actionable.push(reminder);
    } else if (reminder.projectionState === "later_today") {
      laterToday.push(reminder);
    } else if (reminder.projectionState === "acknowledged_today") {
      acknowledgedToday.push(reminder);
    }
  }

  return { actionable, laterToday, acknowledgedToday };
}

export function calendarReminderProjectionStateLabel(
  state: CalendarReminderProjectionState,
): string {
  switch (state) {
    case "later_today":
      return "Plus tard aujourd’hui";
    case "due":
      return "À traiter";
    case "overdue":
      return "En retard";
    case "acknowledged_today":
    case "acknowledged":
      return "Traité";
    case "upcoming":
      return "À venir";
    case "inactive_source":
      return "Source inactive";
    case "invalid_projection":
      return "Projection invalide";
  }
}

export function calendarReminderSourceLabel(
  sourceType: CalendarReminderSourceType,
): string {
  switch (sourceType) {
    case "litter_care_task":
      return "Portée";
    case "reproductive_cycle":
      return "Reproduction";
    case "adopter_event":
      return "Rendez-vous adoptant";
  }
}

export function canCreateCalendarReminderForEvent(
  event: BreedingCalendarEvent,
): boolean {
  if (event.sourceType === "adopter_appointment") {
    return event.appointmentStatus === "planned";
  }
  return true;
}

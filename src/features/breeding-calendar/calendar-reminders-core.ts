import type { BreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";
import { breedingCalendarEventIdentity } from "@/features/breeding-calendar/breeding-calendar-contract";
import {
  calendarReminderEventIdentityFromSource,
  calendarReminderSourceTypeFromEvent,
  canCreateCalendarReminderForEvent,
  partitionCalendarRemindersForToday,
  projectCalendarReminder,
  sortCalendarReminderProjections,
  type CalendarReminderProjection,
  type CalendarReminderRule,
  type CalendarReminderSourceType,
} from "@/features/breeding-calendar/calendar-reminder-projection";

export type CalendarReminderRow = {
  id: string;
  organization_id: string;
  litter_care_task_id: string | null;
  reproductive_cycle_id: string | null;
  adopter_event_id: string | null;
  days_before: number;
  local_time: string;
  timezone_name: string;
  revision_no: number;
  acknowledged_trigger_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type CalendarReminderSummary = CalendarReminderProjection;

export function reminderSourceFromRow(
  row: CalendarReminderRow,
): { sourceType: CalendarReminderSourceType; sourceRecordId: string } | null {
  if (row.litter_care_task_id) {
    return {
      sourceType: "litter_care_task",
      sourceRecordId: row.litter_care_task_id,
    };
  }
  if (row.reproductive_cycle_id) {
    return {
      sourceType: "reproductive_cycle",
      sourceRecordId: row.reproductive_cycle_id,
    };
  }
  if (row.adopter_event_id) {
    return {
      sourceType: "adopter_event",
      sourceRecordId: row.adopter_event_id,
    };
  }
  return null;
}

export function toCalendarReminderRule(row: CalendarReminderRow): CalendarReminderRule | null {
  const source = reminderSourceFromRow(row);
  if (!source) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceType: source.sourceType,
    sourceRecordId: source.sourceRecordId,
    daysBefore: row.days_before,
    localTime: row.local_time,
    timezoneName: row.timezone_name,
    revisionNo: row.revision_no,
    acknowledgedTriggerAt: row.acknowledged_trigger_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
  };
}

export function indexBreedingCalendarEventsByIdentity(
  events: readonly BreedingCalendarEvent[],
): Map<string, BreedingCalendarEvent> {
  const map = new Map<string, BreedingCalendarEvent>();
  for (const event of events) {
    map.set(breedingCalendarEventIdentity(event), event);
  }
  return map;
}

export function projectCalendarRemindersForEvents(input: {
  rows: readonly CalendarReminderRow[];
  events: readonly BreedingCalendarEvent[];
  now: Date;
}): CalendarReminderSummary[] {
  const byIdentity = indexBreedingCalendarEventsByIdentity(input.events);
  const projected: CalendarReminderSummary[] = [];

  for (const row of input.rows) {
    const rule = toCalendarReminderRule(row);
    if (!rule) continue;
    const identity = calendarReminderEventIdentityFromSource(
      rule.sourceType,
      rule.sourceRecordId,
    );
    const event = byIdentity.get(identity) ?? null;
    projected.push(
      projectCalendarReminder({
        reminder: rule,
        event,
        now: input.now,
      }),
    );
  }

  return sortCalendarReminderProjections(projected);
}

export function countRemindersByEventIdentity(
  reminders: readonly CalendarReminderSummary[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reminder of reminders) {
    if (!reminder.eventIdentity) continue;
    if (
      reminder.projectionState === "inactive_source" ||
      reminder.projectionState === "invalid_projection"
    ) {
      // Still count active reminder rules attached to calendar cards.
    }
    counts.set(
      reminder.eventIdentity,
      (counts.get(reminder.eventIdentity) ?? 0) + 1,
    );
  }
  return counts;
}

export function remindersForEventIdentity(
  reminders: readonly CalendarReminderSummary[],
  eventIdentity: string,
): CalendarReminderSummary[] {
  return reminders.filter((reminder) => reminder.eventIdentity === eventIdentity);
}

export function buildTodayReminderSections(
  reminders: readonly CalendarReminderSummary[],
) {
  return partitionCalendarRemindersForToday(reminders);
}

export {
  canCreateCalendarReminderForEvent,
  calendarReminderSourceTypeFromEvent,
};

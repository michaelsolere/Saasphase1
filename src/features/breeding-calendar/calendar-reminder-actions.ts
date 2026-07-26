"use server";

import {
  acknowledgeCalendarReminder,
  createCalendarReminder,
  deleteCalendarReminder,
  updateCalendarReminder,
  type CalendarReminderMutationResult,
} from "@/features/breeding-calendar/calendar-reminders";
import type { CalendarReminderSourceType } from "@/features/breeding-calendar/calendar-reminder-projection";

export async function createCalendarReminderAction(input: {
  sourceType: CalendarReminderSourceType;
  sourceRecordId: string;
  daysBefore: number;
  localTime: string;
  clientCommandId: string;
}): Promise<CalendarReminderMutationResult> {
  return createCalendarReminder(input);
}

export async function updateCalendarReminderAction(input: {
  reminderId: string;
  expectedRevisionNo: number;
  daysBefore: number;
  localTime: string;
  clientCommandId: string;
}): Promise<CalendarReminderMutationResult> {
  return updateCalendarReminder(input);
}

export async function acknowledgeCalendarReminderAction(input: {
  reminderId: string;
  expectedRevisionNo: number;
  expectedTriggerAt: string;
  clientCommandId: string;
}): Promise<CalendarReminderMutationResult> {
  return acknowledgeCalendarReminder(input);
}

export async function deleteCalendarReminderAction(input: {
  reminderId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
}): Promise<CalendarReminderMutationResult> {
  return deleteCalendarReminder(input);
}

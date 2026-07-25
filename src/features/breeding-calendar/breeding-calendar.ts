import "server-only";

import { listOrganizationLitterCareTasks } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import { getLitterDisplayName } from "@/features/litters/formatters";
import type { BreedingCalendarEvent, OrganizationBreedingCalendar } from "./breeding-calendar-contract";

export type { BreedingCalendarEvent, BreedingCalendarSourceType, OrganizationBreedingCalendar } from "./breeding-calendar-contract";
export { BREEDING_CALENDAR_SOURCE_TYPES } from "./breeding-calendar-contract";


export function toBreedingCalendarEvent(task: LitterCareTaskSummary, litterName: string): BreedingCalendarEvent | null {
  if (task.status !== "planned") return null;
  const window = task.itemKind === "window";
  const startsOn = window ? task.retainedStartsOn : task.plannedFor;
  if (!startsOn) return null;
  return { identitySource: "litter-care", sourceType: "litter_care", category: task.category, title: task.title, contextLabel: getLitterDisplayName(litterName, task.litterId), startsOn, startsLocalTime: window ? task.retainedStartsLocalTime : task.scheduledLocalTime, endsOn: window ? task.retainedEndsOn : null, endsLocalTime: window ? task.retainedEndsLocalTime : null, timezoneName: task.scheduleTimezoneName, isAllDay: window ? !(task.retainedStartsLocalTime && task.retainedEndsLocalTime) : !task.scheduledLocalTime, revision: task.revisionNo, lastModifiedAt: task.createdAt, sourceRecordId: task.id, litterId: task.litterId, itemKind: task.itemKind };
}

export async function listLitterPlanningCalendarEvents(): Promise<OrganizationBreedingCalendar> {
  const result = await listOrganizationLitterCareTasks();
  if (result.outcome !== "success") throw new Error("Unable to load litter planning calendar events.");
  const events = result.tasks.map((task) => toBreedingCalendarEvent(task, result.litterNames[task.litterId])).filter((event): event is BreedingCalendarEvent => event !== null);
  return { organizationId: result.organizationId, events, litterNames: result.litterNames };
}

export async function listOrganizationBreedingCalendarEvents(): Promise<OrganizationBreedingCalendar> {
  const source = await listLitterPlanningCalendarEvents();
  const seen = new Set<string>();
  const events = source.events.filter((event) => { const identity = `${event.identitySource}:${event.sourceRecordId}`; if (seen.has(identity)) return false; seen.add(identity); return true; }).sort((left, right) => left.startsOn.localeCompare(right.startsOn) || (left.startsLocalTime ?? "").localeCompare(right.startsLocalTime ?? "") || left.contextLabel.localeCompare(right.contextLabel) || left.sourceRecordId.localeCompare(right.sourceRecordId));
  return { ...source, events };
}

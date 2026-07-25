import { expect, test } from "@playwright/test";

import { toBreedingCalendarEvent } from "../../src/features/breeding-calendar/breeding-calendar-contract";
import { buildBreedingCalendarICalendar, buildLitterCareICalendar } from "../../src/features/litter-journal/litter-care-icalendar";
import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";

const litterA = "11111111-1111-4111-8111-111111111111";
const litterB = "11111111-1111-4111-8111-111111111112";
const taskA = "22222222-2222-4222-8222-222222222222";
function task(overrides: Partial<LitterCareTaskSummary> = {}): LitterCareTaskSummary { return { id: taskA, litterId: litterA, source: "manual", litterPlanItemId: null, organizationTemplateId: null, systemTemplateCode: null, occurrenceNo: 1, category: "veterinary", targetScope: "litter", title: "Visite vétérinaire", description: "Description privée", anchorType: null, anchorDate: null, offsetDays: null, itemKind: "task", priority: "normal", suggestedFor: null, suggestedLocalTime: null, plannedFor: "2026-08-12", scheduledLocalTime: null, scheduleTimezoneName: "Europe/Paris", suggestedStartsOn: null, suggestedStartsLocalTime: null, suggestedEndsOn: null, suggestedEndsLocalTime: null, retainedStartsOn: null, retainedStartsLocalTime: null, retainedEndsOn: null, retainedEndsLocalTime: null, scheduleSource: "suggested", isScheduleLocked: false, scheduleLockedAt: null, scheduleLockedBy: null, revisionNo: 2, status: "planned", resolvedAt: null, resolvedTimezoneName: null, resolvedBy: null, resolutionNote: "Ne pas exporter", createdAt: "2026-01-01T00:00:00Z", ...overrides }; }
function event(value: LitterCareTaskSummary, name = "Rosie × Rimbaud") { return toBreedingCalendarEvent(value, name); }

test("convertit les tâches planifiées, fenêtres et contextualise sans mutation", () => {
  const point = task(); const window = task({ id: "22222222-2222-4222-8222-222222222223", itemKind: "window", plannedFor: null, retainedStartsOn: "2026-08-13", retainedEndsOn: "2026-08-15", retainedStartsLocalTime: "08:00", retainedEndsLocalTime: "18:00" }); const snapshot = JSON.stringify([point, window]);
  expect(event(point)).toMatchObject({ startsOn: "2026-08-12", endsOn: null, contextLabel: "Rosie × Rimbaud" });
  expect(event(window)).toMatchObject({ startsOn: "2026-08-13", endsOn: "2026-08-15", isAllDay: false });
  expect(event(task({ status: "done" }))).toBeNull(); expect(event(task({ plannedFor: null }))).toBeNull(); expect(JSON.stringify([point, window])).toBe(snapshot);
});

test("sérialise l’agrégation sans UUID ou descriptions et conserve les UID", () => {
  const first = event(task())!; const second = event(task({ id: "22222222-2222-4222-8222-222222222224", litterId: litterB, title: "Vaccination" }), "Nova × Orion")!;
  const global = buildBreedingCalendarICalendar({ events: [second, first].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.contextLabel.localeCompare(b.contextLabel)), generatedAt: new Date("2026-01-01T00:00:00Z"), calendarName: "Calendrier" });
  const perLitter = buildLitterCareICalendar({ litterName: "Rosie × Rimbaud", tasks: [task()], filters: { kind: "all", category: "all" }, generatedAt: new Date("2026-01-01T00:00:00Z") });
  const uid = /UID:([^\r]+)/.exec(perLitter)?.[1]; expect(global).toContain(`UID:${uid}`); expect([...global.matchAll(/UID:([^\r]+)/g)].map((match) => match[1])).toHaveLength(2); expect(global).not.toContain(taskA); expect(global).not.toContain(litterA); expect(global).not.toContain("Description privée"); expect(global).not.toContain("Ne pas exporter");
  const empty = buildBreedingCalendarICalendar({ events: [], generatedAt: new Date(), calendarName: "Calendrier" }); expect(empty).toContain("BEGIN:VCALENDAR\r\n"); expect(empty).toMatch(/END:VCALENDAR\r\n$/);
});

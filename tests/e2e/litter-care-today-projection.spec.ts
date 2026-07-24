import { expect, test } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import { projectLitterCareToday } from "@/features/litter-journal/litter-care-today";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";

const task = (overrides: Partial<LitterCareTaskSummary>): LitterCareTaskSummary => ({
  id: "task", litterId: "litter", source: "organization_template", litterPlanItemId: null,
  organizationTemplateId: null, systemTemplateCode: null, occurrenceNo: 1, category: "other",
  targetScope: "litter", title: "Tâche", description: null, anchorType: null, anchorDate: null,
  offsetDays: null, itemKind: "task", priority: "normal", suggestedFor: null,
  suggestedLocalTime: null, plannedFor: null, scheduledLocalTime: null, scheduleTimezoneName: null,
  suggestedStartsOn: null, suggestedStartsLocalTime: null, suggestedEndsOn: null,
  suggestedEndsLocalTime: null, retainedStartsOn: null, retainedStartsLocalTime: null,
  retainedEndsOn: null, retainedEndsLocalTime: null, scheduleSource: "suggested",
  isScheduleLocked: false, scheduleLockedAt: null, scheduleLockedBy: null, revisionNo: 1,
  status: "planned", resolvedAt: null, resolvedTimezoneName: null, resolvedBy: null,
  resolutionNote: null, createdAt: "2026-01-01T00:00:00Z", ...overrides,
});

const reference = { date: "2026-07-25", localTime: "12:00" };

test("projette les actions ponctuelles, les fenêtres et les éléments traités du jour", () => {
  const projection = projectLitterCareToday([
    task({ id: "due", title: "Aujourd’hui", itemKind: "task", plannedFor: "2026-07-25" }),
    task({ id: "milestone-overdue", title: "Jalon en retard", itemKind: "milestone", plannedFor: "2026-07-24" }),
    task({ id: "recurring", title: "Occurrence matérialisée", itemKind: "recurring_task", plannedFor: "2026-07-25" }),
    task({ id: "open-all-day", title: "Fenêtre sans horaires", itemKind: "window", retainedStartsOn: "2026-07-25", retainedEndsOn: "2026-07-25" }),
    task({ id: "open-timed", title: "Fenêtre avec horaires", itemKind: "window", retainedStartsOn: "2026-07-25", retainedStartsLocalTime: "09:00", retainedEndsOn: "2026-07-25", retainedEndsLocalTime: "17:00" }),
    task({ id: "window-overdue", title: "Fenêtre dépassée", itemKind: "window", retainedStartsOn: "2026-07-20", retainedEndsOn: "2026-07-24" }),
    task({ id: "future", title: "Future", plannedFor: "2026-07-26" }),
    task({ id: "done-today", title: "Réalisée", status: "done", resolvedAt: "2026-07-25T08:00:00Z" }),
    task({ id: "done-yesterday", title: "Hier", status: "done", resolvedAt: "2026-07-24T21:00:00Z" }),
    task({ id: "cancelled", title: "Annulée", status: "cancelled", resolvedAt: "2026-07-25T10:00:00Z" }),
    task({ id: "not-applicable", title: "Non applicable", status: "not_applicable", resolvedAt: "2026-07-25T11:00:00Z" }),
  ], reference);

  expect(projection.dueToday.map((item) => item.id)).toEqual(["due", "recurring"]);
  expect(projection.overdue.map((item) => item.id)).toEqual(["window-overdue", "milestone-overdue"]);
  expect(projection.openWindows.map((item) => item.id)).toEqual(["open-all-day", "open-timed"]);
  expect(projection.handledToday.map((item) => [item.id, item.status])).toEqual([
    ["cancelled", "cancelled"], ["not-applicable", "not_applicable"], ["done-today", "done"],
  ]);
});

test("trie de façon stable par priorité, date, heure puis titre", () => {
  const projection = projectLitterCareToday([
    task({ id: "normal", title: "Alpha", plannedFor: "2026-07-25", priority: "normal" }),
    task({ id: "important-late", title: "Zèbre", plannedFor: "2026-07-25", scheduledLocalTime: "11:00", priority: "important" }),
    task({ id: "critical", title: "Dernier", plannedFor: "2026-07-25", priority: "organization_critical" }),
    task({ id: "important-early-b", title: "Bravo", plannedFor: "2026-07-25", scheduledLocalTime: "09:00", priority: "important" }),
    task({ id: "important-early-a", title: "Alpha", plannedFor: "2026-07-25", scheduledLocalTime: "09:00", priority: "important" }),
  ], reference);

  expect(projection.dueToday.map((item) => item.id)).toEqual([
    "critical", "important-early-a", "important-early-b", "important-late", "normal",
  ]);
});

test("classe resolvedAt selon la journée Europe/Paris, sans son fuseau de résolution", () => {
  expect(formatLitterJournalBusinessDate(new Date("2026-07-24T22:30:00Z"))).toBe("2026-07-25");

  const projection = projectLitterCareToday([
    task({ id: "paris-today", status: "done", resolvedAt: "2026-07-24T22:30:00Z", resolvedTimezoneName: "America/Los_Angeles" }),
    task({ id: "paris-yesterday", status: "done", resolvedAt: "2026-07-24T21:59:00Z", resolvedTimezoneName: "Europe/Paris" }),
  ], { date: "2026-07-25", localTime: "00:30" });

  expect(projection.handledToday.map((item) => item.id)).toEqual(["paris-today"]);
});

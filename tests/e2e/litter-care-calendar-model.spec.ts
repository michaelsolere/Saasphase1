import { expect, test } from "@playwright/test";

import {
  getLitterCareCalendarDate,
  getLitterCareCalendarMonth,
  getLitterCareCalendarWeekStart,
  projectLitterCareCalendar,
  projectLitterCareCalendarRange,
  projectLitterCareCalendarWeek,
  sortLitterCareAgendaItems,
} from "../../src/features/litter-journal/litter-care-calendar";
import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";

function task(overrides: Partial<LitterCareTaskSummary> = {}): LitterCareTaskSummary {
  return {
    id: "task-1", litterId: "litter-1", source: "manual", litterPlanItemId: null, organizationTemplateId: null, systemTemplateCode: null, occurrenceNo: 1,
    category: "veterinary", targetScope: "litter", title: "Élément calendrier", description: null, anchorType: null, anchorDate: null, offsetDays: null,
    itemKind: "task", priority: "normal", suggestedFor: null, suggestedLocalTime: null, plannedFor: "2024-01-15", scheduledLocalTime: null, scheduleTimezoneName: "Europe/Paris",
    suggestedStartsOn: null, suggestedStartsLocalTime: null, suggestedEndsOn: null, suggestedEndsLocalTime: null,
    retainedStartsOn: null, retainedStartsLocalTime: null, retainedEndsOn: null, retainedEndsLocalTime: null,
    scheduleSource: "suggested", isScheduleLocked: false, scheduleLockedAt: null, scheduleLockedBy: null, revisionNo: 1, status: "planned", resolvedAt: null, resolvedTimezoneName: null, resolvedBy: null, resolutionNote: null, createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function calendar(tasks: LitterCareTaskSummary[], requestedMonth = "2024-01", todayDate = "2024-01-15", todayLocalTime = "12:00") {
  return projectLitterCareCalendar({ tasks, requestedMonth, todayDate, todayLocalTime });
}

test("construit toujours une grille lundi-dimanche de six semaines", () => {
  const january = calendar([], "2024-01");
  expect(january.days).toHaveLength(42);
  expect(january.days[0]?.date).toBe("2024-01-01");
  expect(january.days[6]?.date).toBe("2024-01-07");
  const june = calendar([], "2024-06");
  expect(june.days[0]?.date).toBe("2024-05-27");
  expect(june.days[41]?.date).toBe("2024-07-07");
  expect(calendar([], "2024-02").days.filter((day) => day.isCurrentMonth)).toHaveLength(29);
  expect(getLitterCareCalendarMonth("2024-13", "2024-02-10")).toBe("2024-02");
});

test("calcule une semaine civile lundi-dimanche avec un repli sûr", () => {
  expect(getLitterCareCalendarWeekStart("2024-01-01", "2024-07-25")).toBe("2024-01-01");
  expect(getLitterCareCalendarWeekStart("2024-01-07", "2024-07-25")).toBe("2024-01-01");
  expect(getLitterCareCalendarWeekStart("2024-12-31", "2024-07-25")).toBe("2024-12-30");
  expect(getLitterCareCalendarWeekStart("2025-01-01", "2024-07-25")).toBe("2024-12-30");
  expect(getLitterCareCalendarDate("2024-02-30", "2024-07-25")).toBe("2024-07-25");
  const week = projectLitterCareCalendarWeek({ tasks: [], requestedDate: "2024-12-31", todayDate: "2024-12-31", todayLocalTime: "12:00" });
  expect(week.startsOn).toBe("2024-12-30");
  expect(week.endsOn).toBe("2025-01-05");
  expect(week.days).toHaveLength(7);
});

test("projette points, occurrence matérialisée, filtres et états sans mutation", () => {
  const inputs = [
    task({ id: "late", title: "En retard", plannedFor: "2024-01-10", priority: "normal" }),
    task({ id: "today", title: "Aujourd’hui", plannedFor: "2024-01-15", priority: "important", scheduledLocalTime: "09:00" }),
    task({ id: "recurring", title: "Occurrence", itemKind: "recurring_task", plannedFor: "2024-01-15", scheduledLocalTime: "08:00", priority: "important" }),
    task({ id: "critical", title: "Critique", plannedFor: "2024-01-15", priority: "organization_critical" }),
    task({ id: "done", title: "Fini", plannedFor: "2024-01-15", status: "done" }),
    task({ id: "other", title: "Autre", category: "other", plannedFor: "2024-01-15" }),
  ];
  const before = JSON.stringify(inputs);
  const result = calendar(inputs);
  const day = result.days.find((value) => value.date === "2024-01-15")!;
  expect(day.isToday).toBe(true);
  expect(day.items.map((value) => value.task.id)).toEqual(["critical", "recurring", "today", "other"]);
  expect(result.days.find((value) => value.date === "2024-01-10")?.items[0]?.operationalState).toBe("overdue");
  expect(projectLitterCareCalendar({ tasks: inputs, requestedMonth: "2024-01", todayDate: "2024-01-15", todayLocalTime: "12:00", kind: "recurring_task", category: "all" }).hasFilteredItems).toBe(true);
  expect(projectLitterCareCalendar({ tasks: inputs, requestedMonth: "2024-01", todayDate: "2024-01-15", todayLocalTime: "12:00", kind: "all", category: "other" }).days.find((value) => value.date === "2024-01-15")?.items.map((value) => value.task.id)).toEqual(["other"]);
  expect(JSON.stringify(inputs)).toBe(before);
});

test("projette les fenêtres aux bornes originales, y compris à travers le mois", () => {
  const windows = [
    task({ id: "single", title: "Simple", itemKind: "window", plannedFor: null, retainedStartsOn: "2024-01-10", retainedEndsOn: "2024-01-10" }),
    task({ id: "inside", title: "Interne", itemKind: "window", plannedFor: null, retainedStartsOn: "2024-01-11", retainedEndsOn: "2024-01-13" }),
    task({ id: "before", title: "Avant", itemKind: "window", plannedFor: null, retainedStartsOn: "2023-12-30", retainedEndsOn: "2024-01-02" }),
    task({ id: "after", title: "Après", itemKind: "window", plannedFor: null, retainedStartsOn: "2024-01-30", retainedEndsOn: "2024-02-03", retainedStartsLocalTime: "08:00", retainedEndsLocalTime: "18:00", isScheduleLocked: true, scheduleSource: "manual" }),
  ];
  const result = calendar(windows, "2024-01", "2024-01-31", "12:00");
  const item = (date: string, id: string) => result.days.find((day) => day.date === date)?.items.find((value) => value.task.id === id);
  expect(item("2024-01-10", "single")?.windowPosition).toBe("single");
  expect(item("2024-01-11", "inside")?.windowPosition).toBe("start");
  expect(item("2024-01-12", "inside")?.windowPosition).toBe("middle");
  expect(item("2024-01-13", "inside")?.windowPosition).toBe("end");
  expect(item("2024-01-01", "before")?.retainedStartsOn).toBe("2023-12-30");
  expect(item("2024-01-31", "after")?.operationalState).toBe("open");
  expect(item("2024-02-03", "after")?.retainedEndsOn).toBe("2024-02-03");
});

test("utilise la même projection de plage pour le mois et la semaine", () => {
  const inputs = [task({ id: "crossing", itemKind: "window", plannedFor: null, retainedStartsOn: "2024-01-05", retainedStartsLocalTime: "08:00", retainedEndsOn: "2024-01-15", retainedEndsLocalTime: "18:00" }), task({ id: "timed", plannedFor: "2024-01-08", scheduledLocalTime: "09:30" })];
  const before = JSON.stringify(inputs);
  const week = projectLitterCareCalendarWeek({ tasks: inputs, requestedDate: "2024-01-08", todayDate: "2024-01-08", todayLocalTime: "12:00" });
  const range = projectLitterCareCalendarRange({ tasks: inputs, startsOn: "2024-01-08", endsOn: "2024-01-14", todayDate: "2024-01-08", todayLocalTime: "12:00" });
  expect(week.days).toEqual(range.days);
  expect(week.days[0]?.items.find((item) => item.task.id === "crossing")?.retainedStartsOn).toBe("2024-01-05");
  expect(week.days[0]?.items.find((item) => item.task.id === "crossing")?.time).toBeNull();
  expect(week.days[0]?.items.find((item) => item.task.id === "timed")?.time).toBe("09:30");
  expect(JSON.stringify(inputs)).toBe(before);
});

test("trie l’agenda par heure sans modifier le tri commun de la projection", () => {
  const inputs = [
    task({ id: "late-critical", title: "Prioritaire tardive", plannedFor: "2024-01-15", scheduledLocalTime: "16:00", priority: "organization_critical" }),
    task({ id: "early-normal", title: "Matinale normale", plannedFor: "2024-01-15", scheduledLocalTime: "08:00", priority: "normal" }),
    task({ id: "untimed-important", title: "Sans heure importante", plannedFor: "2024-01-15", scheduledLocalTime: null, priority: "important" }),
    task({ id: "untimed-normal", title: "Sans heure normale", plannedFor: "2024-01-15", scheduledLocalTime: null, priority: "normal" }),
  ];
  const week = projectLitterCareCalendarWeek({ tasks: inputs, requestedDate: "2024-01-15", todayDate: "2024-01-15", todayLocalTime: "12:00" });
  const day = week.days.find((value) => value.date === "2024-01-15")!;
  const sourceOrder = day.items.map((item) => item.task.id);
  expect(sourceOrder).toEqual(["late-critical", "untimed-important", "early-normal", "untimed-normal"]);
  expect(sortLitterCareAgendaItems(day.items).map((item) => item.task.id)).toEqual(["early-normal", "late-critical", "untimed-important", "untimed-normal"]);
  expect(day.items.map((item) => item.task.id)).toEqual(sourceOrder);
});

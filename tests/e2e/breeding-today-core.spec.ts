import { expect, test } from "@playwright/test";

import {
  BREEDING_TODAY_EMPTY_MESSAGE,
  BREEDING_TODAY_UNAVAILABLE_MESSAGE,
} from "@/features/breeding-calendar/breeding-today-panel";
import { projectLitterCareToday } from "@/features/litter-journal/litter-care-today";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";
import { getLitterDisplayName } from "@/features/litters/formatters";

const task = (overrides: Partial<LitterCareTaskSummary>): LitterCareTaskSummary => ({
  id: "task",
  litterId: "litter",
  source: "organization_template",
  litterPlanItemId: null, litterPlanSeriesId: null, recurrenceDayNo: null, slotNo: null, seriesState: null,
  organizationTemplateId: null,
  systemTemplateCode: null,
  occurrenceNo: 1,
  category: "other",
  targetScope: "litter",
  title: "Tâche",
  description: null,
  anchorType: null,
  anchorDate: null,
  offsetDays: null,
  itemKind: "task",
  priority: "normal",
  suggestedFor: null,
  suggestedLocalTime: null,
  plannedFor: null,
  scheduledLocalTime: null,
  scheduleTimezoneName: null,
  suggestedStartsOn: null,
  suggestedStartsLocalTime: null,
  suggestedEndsOn: null,
  suggestedEndsLocalTime: null,
  retainedStartsOn: null,
  retainedStartsLocalTime: null,
  retainedEndsOn: null,
  retainedEndsLocalTime: null,
  scheduleSource: "suggested",
  isScheduleLocked: false,
  scheduleLockedAt: null,
  scheduleLockedBy: null,
  revisionNo: 1,
  status: "planned",
  resolvedAt: null,
  resolvedTimezoneName: null,
  resolvedBy: null,
  resolutionNote: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const reference = { date: "2026-07-25", localTime: "12:00" };
const litterA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const litterB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("agrège plusieurs portées et classe les sections quotidiennes", () => {
  const projection = projectLitterCareToday(
    [
      task({
        id: "due-a",
        litterId: litterA,
        title: "Visite Alpha",
        plannedFor: "2026-07-25",
      }),
      task({
        id: "due-b",
        litterId: litterB,
        title: "Vaccin Bravo",
        plannedFor: "2026-07-25",
        priority: "important",
      }),
      task({
        id: "overdue-a",
        litterId: litterA,
        title: "Retard Alpha",
        plannedFor: "2026-07-24",
      }),
      task({
        id: "window-b",
        litterId: litterB,
        title: "Fenêtre Bravo",
        itemKind: "window",
        retainedStartsOn: "2026-07-25",
        retainedEndsOn: "2026-07-25",
      }),
      task({
        id: "done-a",
        litterId: litterA,
        title: "Traité Alpha",
        status: "done",
        resolvedAt: "2026-07-25T08:00:00Z",
      }),
      task({
        id: "foreign-future",
        litterId: litterB,
        title: "Plus tard",
        plannedFor: "2026-07-26",
      }),
    ],
    reference,
  );

  expect(projection.dueToday.map((item) => [item.id, item.litterId])).toEqual([
    ["due-b", litterB],
    ["due-a", litterA],
  ]);
  expect(projection.overdue.map((item) => item.id)).toEqual(["overdue-a"]);
  expect(projection.openWindows.map((item) => item.id)).toEqual(["window-b"]);
  expect(projection.handledToday.map((item) => item.id)).toEqual(["done-a"]);
});

test("conserve un libellé de portée lisible pour le lien Journal", () => {
  const litterNames: Record<string, string> = {
    [litterA]: "Alpha × Nova",
    [litterB]: "Bravo × Sirius",
  };
  expect(`Portée ${getLitterDisplayName(litterNames[litterA], litterA)}`).toBe(
    "Portée Alpha × Nova",
  );
  expect(`/litters/journal?litter=${encodeURIComponent(litterA)}`).toContain(
    litterA,
  );
  expect(litterNames[litterB]).not.toContain(litterB);
});

test("expose des messages neutres pour vide et indisponibilité", () => {
  expect(BREEDING_TODAY_EMPTY_MESSAGE).toMatch(/Aucune action/i);
  expect(BREEDING_TODAY_UNAVAILABLE_MESSAGE).toMatch(/n’est pas disponible/i);
  expect(BREEDING_TODAY_EMPTY_MESSAGE).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-/i,
  );
  expect(BREEDING_TODAY_UNAVAILABLE_MESSAGE).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-/i,
  );
});

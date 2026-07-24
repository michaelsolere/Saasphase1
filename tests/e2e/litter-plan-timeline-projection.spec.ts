import { expect, test } from "@playwright/test";

import { buildLitterPlanTimelineGeometry, getLitterPlanTimelinePanelState, projectLitterPlanTimeline } from "@/features/litter-journal/litter-plan-timeline";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import type { LitterPlanDetail } from "@/features/litter-journal/litter-plans";

const plan = {
  header: { title: "Planning test" },
  items: [
    { id: "milestone", item_kind: "milestone", category: "preparation", title: "Préparer", materialization_state: "materialized" },
    { id: "window", item_kind: "window", category: "veterinary", title: "Visite", materialization_state: "materialized" },
    { id: "later", item_kind: "task", category: "preparation", title: "Après", materialization_state: "materialized" },
    { id: "pending", item_kind: "task", category: "offspring_health", title: "Contrôle", materialization_state: "pending_anchor" },
  ],
} as unknown as LitterPlanDetail;

const task = (overrides: Partial<LitterCareTaskSummary>): LitterCareTaskSummary => ({
  id: "task", litterId: "litter", source: "organization_template", litterPlanItemId: null,
  organizationTemplateId: null, systemTemplateCode: null, occurrenceNo: 1, category: "other",
  targetScope: "litter", title: "", description: null, anchorType: null, anchorDate: null,
  offsetDays: null, itemKind: "task", priority: "normal", suggestedFor: null,
  suggestedLocalTime: null, plannedFor: null, scheduledLocalTime: null, scheduleTimezoneName: null,
  suggestedStartsOn: null, suggestedStartsLocalTime: null, suggestedEndsOn: null,
  suggestedEndsLocalTime: null, retainedStartsOn: null, retainedStartsLocalTime: null,
  retainedEndsOn: null, retainedEndsLocalTime: null, scheduleSource: "suggested",
  isScheduleLocked: false, scheduleLockedAt: null, scheduleLockedBy: null, revisionNo: 1,
  status: "planned", resolvedAt: null, resolvedTimezoneName: null, resolvedBy: null,
  resolutionNote: null, createdAt: "2026-01-01T00:00:00Z", ...overrides,
});

test("projette seulement les dates persistées et sépare les ancrages en attente", () => {
  const timeline = projectLitterPlanTimeline(plan, [
    task({ litterPlanItemId: "milestone", plannedFor: "2026-06-10" }),
    task({ litterPlanItemId: "window", itemKind: "window", retainedStartsOn: "2026-06-12", retainedEndsOn: "2026-06-15" }),
    task({ litterPlanItemId: "later", plannedFor: "2026-06-20" }),
  ]);

  expect(timeline.title).toBe("Planning test");
  expect(timeline.categories).toEqual([
    { category: "preparation", items: [{ id: "milestone", kind: "milestone", title: "Préparer", date: "2026-06-10" }, { id: "later", kind: "task", title: "Après", date: "2026-06-20" }] },
    { category: "veterinary", items: [{ id: "window", kind: "window", title: "Visite", startsOn: "2026-06-12", endsOn: "2026-06-15" }] },
  ]);
  expect(timeline.pendingAnchorItems).toEqual([
    { id: "pending", kind: "task", title: "Contrôle", category: "offspring_health" },
  ]);
  expect(buildLitterPlanTimelineGeometry(timeline)).toMatchObject({
    startsOn: "2026-06-10", endsOn: "2026-06-20",
    categories: [
      { category: "preparation", items: [{ id: "milestone", startPercent: 0 }, { id: "later", startPercent: 100 }] },
      { category: "veterinary", items: [{ id: "window", startPercent: 20, endPercent: 50 }] },
    ],
  });
});

test("gère une plage d’un jour, les dates incohérentes et les états de panneau", () => {
  const timeline = projectLitterPlanTimeline({ ...plan, items: [plan.items[0], plan.items[1]] } as LitterPlanDetail, [
    task({ litterPlanItemId: "milestone", plannedFor: "2026-06-10" }),
    task({ litterPlanItemId: "window", itemKind: "window", retainedStartsOn: "2026-06-11", retainedEndsOn: "2026-06-10" }),
  ]);
  const geometry = buildLitterPlanTimelineGeometry(timeline);
  expect(geometry).toMatchObject({ startsOn: "2026-06-10", endsOn: "2026-06-10", categories: [{ items: [{ id: "milestone", startPercent: 50, endPercent: 50 }] }], undatedItems: [{ id: "window" }] });
  expect(getLitterPlanTimelinePanelState(null, false)).toBe("empty");
  expect(getLitterPlanTimelinePanelState(timeline, true)).toBe("unavailable");
});

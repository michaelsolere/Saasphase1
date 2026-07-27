import { expect, test } from "@playwright/test";

import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";
import type { LitterPlanDetail } from "../../src/features/litter-journal/litter-plans";
import {
  addCivilDays,
  buildInteractiveLitterPlanTimeline,
  buildInteractiveTimelineGeometry,
  buildLitterPlanTimelineItemPublicKey,
  civilDayDelta,
  civilInclusiveDurationDays,
  computeInteractiveTimelineDomain,
  computeInteractiveTimelineMarginDays,
  dateToDomainPercent,
  domainPercentToDate,
  isOpaqueTimelinePublicKey,
  keyboardScheduleDayStep,
  pointerDeltaToCivilDays,
  previewPointMove,
  previewWindowMove,
  previewWindowResizeEnd,
  previewWindowResizeStart,
  publicKeyContainsForbiddenOpaqueData,
} from "../../src/features/litter-journal/litter-plan-timeline-interaction";

function task(overrides: Partial<LitterCareTaskSummary>): LitterCareTaskSummary {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    litterId: "22222222-2222-4222-8222-222222222222",
    source: "organization_template",
    litterPlanItemId: null,
    litterPlanSeriesId: null,
    organizationTemplateId: null,
    systemTemplateCode: null,
    occurrenceNo: 1,
    recurrenceDayNo: null,
    slotNo: null,
    seriesState: null,
    category: "preparation",
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
  };
}

const plan = {
  header: { title: "Planning interactif" },
  items: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      item_kind: "milestone",
      category: "preparation",
      title: "Radiographie de comptage",
      materialization_state: "materialized",
      display_order: 0,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      item_kind: "task",
      category: "preparation",
      title: "Tâche ponctuelle",
      materialization_state: "materialized",
      display_order: 1,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      item_kind: "window",
      category: "maternal_health",
      title: "Surveillance de la température",
      materialization_state: "materialized",
      display_order: 2,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      item_kind: "window",
      category: "veterinary",
      title: "Fenêtre verrouillée",
      materialization_state: "materialized",
      display_order: 3,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      item_kind: "task",
      category: "other",
      title: "Tâche terminée",
      materialization_state: "materialized",
      display_order: 4,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
      item_kind: "task",
      category: "offspring_health",
      title: "En attente",
      materialization_state: "pending_anchor",
      display_order: 5,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      item_kind: "recurring_task",
      category: "offspring_weight",
      title: "Pesée récurrente",
      materialization_state: "materialized",
      display_order: 6,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      item_kind: "milestone",
      category: "identification",
      title: "Snapshot orphelin",
      materialization_state: "materialized",
      display_order: 7,
    },
  ],
} as unknown as LitterPlanDetail;

const tasks: LitterCareTaskSummary[] = [
  task({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    litterPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    itemKind: "milestone",
    title: "Radiographie de comptage",
    suggestedFor: "2026-07-29",
    plannedFor: "2026-07-29",
    scheduledLocalTime: "09:30:00",
    scheduleTimezoneName: "Europe/Paris",
    scheduleSource: "suggested",
    revisionNo: 3,
  }),
  task({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    litterPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    itemKind: "task",
    title: "Tâche ponctuelle",
    suggestedFor: "2026-07-30",
    plannedFor: "2026-07-31",
    scheduleSource: "manual",
  }),
  task({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    litterPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    itemKind: "window",
    category: "maternal_health",
    title: "Surveillance de la température",
    suggestedStartsOn: "2026-08-10",
    suggestedEndsOn: "2026-08-17",
    retainedStartsOn: "2026-08-10",
    retainedEndsOn: "2026-08-17",
    retainedStartsLocalTime: "08:00:00",
    retainedEndsLocalTime: "18:00:00",
    scheduleTimezoneName: "Europe/Paris",
  }),
  task({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
    litterPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    itemKind: "window",
    category: "veterinary",
    title: "Fenêtre verrouillée",
    suggestedStartsOn: "2026-08-01",
    suggestedEndsOn: "2026-08-03",
    retainedStartsOn: "2026-08-01",
    retainedEndsOn: "2026-08-03",
    isScheduleLocked: true,
  }),
  task({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
    litterPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    itemKind: "task",
    category: "other",
    title: "Tâche terminée",
    plannedFor: "2026-07-20",
    suggestedFor: "2026-07-20",
    status: "done",
  }),
];

test("rapproche snapshot et tâche, conserve l’ordre métier et exclut les récurrences", () => {
  const planCopy = structuredClone(plan);
  const tasksCopy = structuredClone(tasks);
  const built = buildInteractiveLitterPlanTimeline({
    plan: planCopy,
    tasks: tasksCopy,
    role: "owner",
    instanceKey: "inst-a",
  });

  expect(built.items.map((item) => item.title)).toEqual([
    "Radiographie de comptage",
    "Tâche ponctuelle",
    "Surveillance de la température",
    "Fenêtre verrouillée",
    "Tâche terminée",
    "Snapshot orphelin",
  ]);
  expect(built.items.some((item) => item.title === "Pesée récurrente")).toBe(false);
  expect(built.pendingAnchorItems).toHaveLength(1);
  expect(built.pendingAnchorItems[0]?.statusLabel).toBe("En attente d’ancre");
  expect(built.items.find((item) => item.title === "Snapshot orphelin")?.statusLabel).toBe(
    "Programmation indisponible",
  );
  expect(planCopy).toEqual(plan);
  expect(tasksCopy).toEqual(tasks);
});

test("clés publiques opaques, sans UUID ni titre, distinctes entre chargements", () => {
  const loadA = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "member",
    instanceKey: "11111111-1111-4111-8111-111111111111",
  });
  const loadB = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "member",
    instanceKey: "22222222-2222-4222-8222-222222222222",
  });

  expect(buildLitterPlanTimelineItemPublicKey("abc", 1)).toBe("timeline-item-abc-1");
  expect(
    isOpaqueTimelinePublicKey(
      loadA.items[0].publicKey,
      "11111111-1111-4111-8111-111111111111",
    ),
  ).toBe(true);
  for (const item of loadA.items) {
    expect(
      publicKeyContainsForbiddenOpaqueData(item.publicKey, [
        item.title,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        "Radiographie",
        "revision",
      ]),
    ).toBe(false);
  }
  expect(loadA.items[0].publicKey).not.toBe(loadB.items[0].publicKey);
});

test("domaine temporel avec marge et conversion date ↔ position alignée sur le jour civil", () => {
  const built = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "owner",
    instanceKey: "domain",
  });
  const domain = computeInteractiveTimelineDomain(built.items);
  expect(domain).not.toBeNull();
  const contentSpan =
    civilDayDelta(domain!.startsOn, domain!.endsOn)! - 2 * domain!.marginDays;
  expect(domain!.marginDays).toBe(computeInteractiveTimelineMarginDays(contentSpan));
  expect(domain!.marginDays).toBeGreaterThanOrEqual(7);
  expect(domain!.marginDays).toBeLessThanOrEqual(21);
  expect(addCivilDays("2026-07-29", 1)).toBe("2026-07-30");

  const midPercent = dateToDomainPercent(domain!, "2026-07-29");
  expect(midPercent).not.toBeNull();
  expect(domainPercentToDate(domain!, midPercent!)).toBe("2026-07-29");
  expect(
    pointerDeltaToCivilDays(
      domain!,
      domain!.dayCount > 0 ? (2 / domain!.dayCount) * 100 : 0,
      100,
    ),
  ).toBe(2);
});

test("déplacement d’un point et d’une période, redimensionnements et refus début > fin", () => {
  expect(previewPointMove("2026-07-29", 1)).toBe("2026-07-30");
  expect(previewWindowMove("2026-08-10", "2026-08-17", 3)).toEqual({
    startDate: "2026-08-13",
    endDate: "2026-08-20",
  });
  expect(civilInclusiveDurationDays("2026-08-10", "2026-08-17")).toBe(8);
  expect(civilInclusiveDurationDays("2026-08-13", "2026-08-20")).toBe(8);
  expect(previewWindowResizeEnd("2026-08-10", "2026-08-17", 2)).toEqual({
    startDate: "2026-08-10",
    endDate: "2026-08-19",
  });
  expect(previewWindowResizeStart("2026-08-10", "2026-08-17", -1)).toEqual({
    startDate: "2026-08-09",
    endDate: "2026-08-17",
  });
  expect(previewWindowResizeStart("2026-08-10", "2026-08-17", 10)).toBeNull();
  expect(previewWindowResizeEnd("2026-08-10", "2026-08-17", -20)).toBeNull();
});

test("commandes clavier de 1 et 7 jours", () => {
  expect(keyboardScheduleDayStep(false, 1)).toBe(1);
  expect(keyboardScheduleDayStep(false, -1)).toBe(-1);
  expect(keyboardScheduleDayStep(true, 1)).toBe(7);
  expect(keyboardScheduleDayStep(true, -1)).toBe(-7);
});

test("statuts suggested/manual, verrouillé, terminal, viewer et pending non manipulables", () => {
  const owner = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "owner",
    instanceKey: "owner",
  });
  const viewer = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "viewer",
    instanceKey: "viewer",
  });

  const milestone = owner.items.find((item) => item.title === "Radiographie de comptage")!;
  const adjusted = owner.items.find((item) => item.title === "Tâche ponctuelle")!;
  const locked = owner.items.find((item) => item.title === "Fenêtre verrouillée")!;
  const terminal = owner.items.find((item) => item.title === "Tâche terminée")!;
  const pending = owner.pendingAnchorItems[0]!;

  expect(milestone.scheduleSource).toBe("suggested");
  expect(milestone.interactionMode).toBe("point_move");
  expect(adjusted.scheduleSource).toBe("manual");
  expect(adjusted.statusLabel).toBe("Ajusté");
  expect(locked.interactionMode).toBe("read_only");
  expect(locked.readOnlyReason).toBe("locked");
  expect(locked.statusLabel).toBe("Verrouillé");
  expect(terminal.interactionMode).toBe("read_only");
  expect(terminal.readOnlyReason).toBe("terminal");
  expect(terminal.statusLabel).toBe("Traité");
  expect(pending.interactionMode).toBe("read_only");
  expect(pending.readOnlyReason).toBe("pending_anchor");

  expect(viewer.items.every((item) => item.interactionMode === "read_only")).toBe(true);
  expect(viewer.bindings).toEqual([]);
});

test("géométrie interactive suit l’aperçu sans muter les entrées", () => {
  const built = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "owner",
    instanceKey: "geo",
  });
  const before = structuredClone(built);
  const windowItem = built.items.find(
    (item) => item.title === "Surveillance de la température",
  )!;
  const geometry = buildInteractiveTimelineGeometry(built, {
    [windowItem.publicKey]: {
      startDate: "2026-08-12",
      endDate: "2026-08-19",
    },
  });
  expect(geometry).not.toBeNull();
  const projected = geometry!.categories
    .flatMap((category) => category.items)
    .find((item) => item.publicKey === windowItem.publicKey);
  expect(projected?.displayStartDate).toBe("2026-08-12");
  expect(projected?.displayEndDate).toBe("2026-08-19");
  expect(built).toEqual(before);
});

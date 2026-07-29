import { expect, test } from "@playwright/test";

import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";
import type { LitterPlanDetail } from "../../src/features/litter-journal/litter-plans";
import {
  addCivilDays,
  buildInteractiveLitterPlanTimeline,
  buildInteractiveTimelineGeometry,
  buildLitterPlanTimelineItemPublicKey,
  buildTimelinePreviewLiveMessage,
  civilDayDelta,
  civilInclusiveDurationDays,
  computeInteractiveTimelineDomain,
  computeInteractiveTimelineMarginDays,
  cumulativeDayDeltaForHandle,
  dateToDomainPercent,
  domainPercentToDate,
  filterInteractiveLitterPlanTimeline,
  formatHandleDisplacementLabel,
  isOpaqueTimelinePublicKey,
  keyboardScheduleDayStep,
  pointerDeltaToCivilDays,
  previewPointMove,
  previewWindowMove,
  previewWindowResizeEnd,
  previewWindowResizeStart,
  publicKeyContainsForbiddenOpaqueData,
  timelineScheduleResultRequiresRefresh,
} from "../../src/features/litter-journal/litter-plan-timeline-interaction";
import {
  buildLitterPlanAdHocProgrammerDisplayTimeline,
  type LitterPlanAdHocProgrammerPreview,
} from "../../src/features/litter-journal/litter-plan-ad-hoc-programmer";
import {
  scheduleViewContainsForbiddenIdentity,
  toLitterCareTaskScheduleView,
} from "../../src/features/litter-journal/litter-care-task-schedule-view";
import type { LitterCareTaskScheduleActionSet } from "../../src/features/litter-journal/litter-care-task-schedule-dialog";

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

test("filtre sans mutation tous les compartiments et épingle l’aperçu du programmateur", () => {
  const built = buildInteractiveLitterPlanTimeline({
    plan,
    tasks,
    role: "owner",
    instanceKey: "filters",
  });
  const before = structuredClone(built);

  const defaultView = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "all",
    includeTerminal: false,
  });
  expect(defaultView.availableCategories).toEqual([
    "preparation",
    "maternal_health",
    "veterinary",
    "other",
    "identification",
    "offspring_health",
  ]);
  expect(defaultView.totalCount).toBe(7);
  expect(defaultView.visibleCount).toBe(6);
  expect(
    defaultView.timeline.items.some((item) => item.title === "Tâche terminée"),
  ).toBe(false);
  const defaultGeometry = buildInteractiveTimelineGeometry(defaultView.timeline);
  expect(defaultGeometry?.categories.map((entry) => entry.category)).not.toContain(
    "other",
  );

  const preparation = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "preparation",
    includeTerminal: false,
  });
  expect(preparation.timeline.items.map((item) => item.title)).toEqual([
    "Radiographie de comptage",
    "Tâche ponctuelle",
  ]);
  expect(preparation.timeline.pendingAnchorItems).toEqual([]);

  const undated = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "identification",
    includeTerminal: false,
  });
  expect(undated.timeline.items.map((item) => item.title)).toEqual([
    "Snapshot orphelin",
  ]);
  expect(buildInteractiveTimelineGeometry(undated.timeline)).toBeNull();

  const pendingAnchor = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "offspring_health",
    includeTerminal: false,
  });
  expect(pendingAnchor.timeline.items).toEqual([]);
  expect(
    pendingAnchor.timeline.pendingAnchorItems.map((item) => item.title),
  ).toEqual(["En attente"]);

  const terminalHidden = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "other",
    includeTerminal: false,
  });
  expect(terminalHidden.visibleCount).toBe(0);
  const terminalIncluded = filterInteractiveLitterPlanTimeline({
    timeline: built,
    category: "other",
    includeTerminal: true,
  });
  expect(terminalIncluded.timeline.items.map((item) => item.title)).toEqual([
    "Tâche terminée",
  ]);
  const terminalGeometry = buildInteractiveTimelineGeometry(
    terminalIncluded.timeline,
  );
  expect(terminalGeometry?.domain.startsOn).not.toBe(
    defaultGeometry?.domain.startsOn,
  );

  const allTerminalStatuses = {
    ...built,
    items: [
      ...built.items,
      {
        ...built.items[0]!,
        publicKey: "terminal-cancelled",
        title: "Tâche annulée",
        status: "cancelled" as const,
      },
      {
        ...built.items[0]!,
        publicKey: "terminal-not-applicable",
        title: "Tâche non applicable",
        status: "not_applicable" as const,
      },
    ],
  };
  const allTerminalHidden = filterInteractiveLitterPlanTimeline({
    timeline: allTerminalStatuses,
    category: "all",
    includeTerminal: false,
  });
  expect(
    [
      ...allTerminalHidden.timeline.items,
      ...allTerminalHidden.timeline.pendingAnchorItems,
    ].some((item) =>
      ["done", "cancelled", "not_applicable"].includes(item.status),
    ),
  ).toBe(false);
  const allTerminalIncluded = filterInteractiveLitterPlanTimeline({
    timeline: allTerminalStatuses,
    category: "all",
    includeTerminal: true,
  });
  expect(
    allTerminalIncluded.timeline.items.filter((item) =>
      ["done", "cancelled", "not_applicable"].includes(item.status),
    ),
  ).toHaveLength(3);

  const preview: LitterPlanAdHocProgrammerPreview = {
    publicKey: "programmer-preview-filters",
    kind: "task",
    title: "Aperçu hors catégorie",
    category: "socialization",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
    geometryKind: "point",
    statusLabel: "Aperçu — non enregistré",
    panelSummary: {
      kindLabel: "Tâche",
      title: "Aperçu hors catégorie",
      timingLine: "25 août 2026",
    },
    recurringDetails: null,
  };
  const display = buildLitterPlanAdHocProgrammerDisplayTimeline(built, preview)!;
  const withPinnedPreview = filterInteractiveLitterPlanTimeline({
    timeline: display,
    category: "maternal_health",
    includeTerminal: false,
    pinnedPublicKeys: [preview.publicKey],
  });
  expect(withPinnedPreview.timeline.items.map((item) => item.title)).toEqual([
    "Surveillance de la température",
    "Aperçu hors catégorie",
  ]);
  expect(withPinnedPreview.visibleCount).toBe(2);
  expect(withPinnedPreview.totalCount).toBe(8);
  expect(
    withPinnedPreview.timeline.items.some(
      (item) => item.title === "Pesée récurrente",
    ),
  ).toBe(false);

  expect(built).toEqual(before);
  expect(plan.items.find((item) => item.item_kind === "recurring_task")?.title).toBe(
    "Pesée récurrente",
  );
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

  expect(owner.bindings.find((binding) => binding.publicKey === milestone.publicKey)?.canResolve).toBe(true);
  expect(owner.bindings.find((binding) => binding.publicKey === locked.publicKey)?.canResolve).toBe(true);
  expect(owner.bindings.find((binding) => binding.publicKey === terminal.publicKey)).toBeUndefined();
  expect(owner.bindings.find((binding) => binding.publicKey === pending.publicKey)).toBeUndefined();
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

test("DTO de programmation sans UUID ni révision, action set sans taskId", () => {
  const source = tasks.find((entry) => entry.title === "Radiographie de comptage")!;
  const view = toLitterCareTaskScheduleView(source);
  expect(view).not.toBeNull();
  expect(scheduleViewContainsForbiddenIdentity(view!, [
    source.id,
    source.litterId,
    source.createdAt,
  ])).toBe(false);
  expect(Object.keys(view!)).not.toContain("id");
  expect(Object.keys(view!)).not.toContain("revisionNo");

  const actions: LitterCareTaskScheduleActionSet = {
    rescheduleAction: async (state) => state,
    replaceLockedAction: async (state) => state,
    lockAction: async (state) => state,
    unlockAction: async (state) => state,
    reapplySuggestionAction: null,
  };
  expect(Object.keys(actions)).not.toContain("taskId");

  const publicKey = buildLitterPlanTimelineItemPublicKey("opaque-instance", 1);
  expect(isOpaqueTimelinePublicKey(publicKey, "opaque-instance")).toBe(true);
  expect(publicKeyContainsForbiddenOpaqueData(publicKey, [source.id, source.title])).toBe(false);
});

test("libellés de décalage selon la poignée et message aria-live", () => {
  expect(
    cumulativeDayDeltaForHandle(
      "window-end",
      "2026-08-10",
      "2026-08-17",
      "2026-08-10",
      "2026-08-19",
    ),
  ).toBe(2);
  expect(
    cumulativeDayDeltaForHandle(
      "window-start",
      "2026-08-10",
      "2026-08-17",
      "2026-08-09",
      "2026-08-17",
    ),
  ).toBe(-1);
  expect(
    cumulativeDayDeltaForHandle(
      "window-move",
      "2026-08-10",
      "2026-08-17",
      "2026-08-13",
      "2026-08-20",
    ),
  ).toBe(3);
  expect(formatHandleDisplacementLabel("window-start", -1)).toBe(
    "Début déplacé de −1 jour",
  );
  expect(formatHandleDisplacementLabel("window-end", 2)).toBe(
    "Fin déplacée de +2 jours",
  );
  expect(formatHandleDisplacementLabel("window-move", 3)).toBe(
    "Période déplacée de +3 jours",
  );

  const keyboardEnd = previewWindowResizeEnd("2026-08-10", "2026-08-17", keyboardScheduleDayStep(false, 1));
  expect(keyboardEnd).toEqual({ startDate: "2026-08-10", endDate: "2026-08-18" });
  expect(
    cumulativeDayDeltaForHandle(
      "window-end",
      "2026-08-10",
      "2026-08-17",
      keyboardEnd!.startDate,
      keyboardEnd!.endDate,
    ),
  ).toBe(1);

  expect(
    buildTimelinePreviewLiveMessage({
      kind: "milestone",
      handle: "point",
      currentDateLabel: "29 juillet",
      newDateLabel: "30 juillet",
      startLabel: "30 juillet",
      endLabel: "30 juillet",
      durationDays: 1,
      dayDelta: 1,
    }),
  ).toContain("Nouvelle date : 30 juillet");
  expect(
    buildTimelinePreviewLiveMessage({
      kind: "window",
      handle: "window-end",
      currentDateLabel: "10 août",
      newDateLabel: "10 août",
      startLabel: "10 août",
      endLabel: "19 août",
      durationDays: 10,
      dayDelta: 2,
    }),
  ).toBe(
    "Aperçu — non enregistré. Du 10 août au 19 août. Durée : 10 jours. Fin déplacée de +2 jours.",
  );
});

test("erreur locale réessayable versus résultat RPC nécessitant un rafraîchissement", () => {
  expect(
    timelineScheduleResultRequiresRefresh({
      status: "error",
      requiresRefresh: false,
    }),
  ).toBe(false);
  expect(
    timelineScheduleResultRequiresRefresh({
      status: "success",
      requiresRefresh: true,
    }),
  ).toBe(true);
  expect(
    timelineScheduleResultRequiresRefresh({
      status: "error",
      code: "stale_revision",
      requiresRefresh: true,
    }),
  ).toBe(true);
  expect(
    timelineScheduleResultRequiresRefresh({
      status: "error",
      code: "conflict",
      requiresRefresh: true,
    }),
  ).toBe(true);
});

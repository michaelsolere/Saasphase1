import { expect, test } from "@playwright/test";

import {
  buildInteractiveTimelineGeometry,
  type InteractiveLitterPlanTimeline,
} from "../../src/features/litter-journal/litter-plan-timeline-interaction";
import {
  buildLitterPlanAdHocProgrammerDisplayTimeline,
  buildLitterPlanAdHocProgrammerPreview,
  buildLitterPlanAdHocProgrammerPreviewKey,
  buildLitterPlanAdHocProgrammerPublicKey,
  changeLitterPlanAdHocProgrammerKind,
  createInitialLitterPlanAdHocProgrammerFormState,
  estimateLitterPlanAdHocProgrammerOccurrences,
  formatLitterPlanAdHocProgrammerOccurrenceEstimate,
  formatLitterPlanAdHocProgrammerWindowDuration,
  isOpaqueLitterPlanAdHocProgrammerKey,
  litterPlanAdHocProgrammerErrorMessage,
  litterPlanAdHocProgrammerErrorRequiresRefresh,
  litterPlanAdHocProgrammerKeyContainsForbiddenData,
  litterPlanAdHocProgrammerRecurringLastDate,
  litterPlanAdHocProgrammerSuccessMessage,
  validateLitterPlanAdHocProgrammerForm,
  type LitterPlanAdHocProgrammerFormState,
} from "../../src/features/litter-journal/litter-plan-ad-hoc-programmer";

const instanceKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const businessDate = "2026-07-28";

function baseState(
  overrides: Partial<LitterPlanAdHocProgrammerFormState> = {},
): LitterPlanAdHocProgrammerFormState {
  return {
    ...createInitialLitterPlanAdHocProgrammerFormState(businessDate),
    title: "Radiographie de comptage",
    ...overrides,
  };
}

test("état initial par défaut", () => {
  const state = createInitialLitterPlanAdHocProgrammerFormState(businessDate);
  expect(state).toMatchObject({
    kind: "task",
    category: "preparation",
    targetScope: "litter",
    priority: "normal",
    lockSchedule: false,
    scheduledDate: businessDate,
    localTime: "",
    intervalDays: "1",
    endKind: "fixed_recurrence_day_count",
    recurrenceDayCount: "7",
    timeSlots: ["08:00"],
  });
});

test("changement de type conserve les communs et purge les résiduels", () => {
  const task = baseState({
    title: "Commun",
    description: "Desc",
    category: "veterinary",
    targetScope: "mother",
    priority: "important",
    lockSchedule: true,
    scheduledDate: "2026-08-01",
    localTime: "09:00",
  });
  const window = changeLitterPlanAdHocProgrammerKind(
    task,
    "window",
    businessDate,
  );
  expect(window).toMatchObject({
    kind: "window",
    title: "Commun",
    description: "Desc",
    category: "veterinary",
    targetScope: "mother",
    priority: "important",
    lockSchedule: true,
    localTime: "",
    startsOn: businessDate,
    endsOn: businessDate,
  });
  const recurring = changeLitterPlanAdHocProgrammerKind(
    window,
    "recurring_task",
    businessDate,
  );
  expect(recurring.kind).toBe("recurring_task");
  expect(recurring.startsLocalTime).toBe("");
  expect(recurring.timeSlots).toEqual(["08:00"]);
  expect(recurring.title).toBe("Commun");
});

test("payload jalon et tâche", () => {
  const milestone = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "milestone",
      scheduledDate: "2026-07-30",
      localTime: "",
    }),
  );
  expect(milestone.ok).toBe(true);
  if (milestone.ok) {
    expect(milestone.payload).toMatchObject({
      kind: "milestone",
      scheduledDate: "2026-07-30",
      localTime: null,
    });
  }

  const task = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "task",
      scheduledDate: "2026-07-30",
      localTime: "09:00",
    }),
  );
  expect(task.ok).toBe(true);
  if (task.ok) {
    expect(task.payload).toMatchObject({
      kind: "task",
      localTime: "09:00:00",
    });
  }
});

test("payload période et bornes invalides", () => {
  const valid = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "window",
      startsOn: "2026-08-10",
      endsOn: "2026-08-17",
      startsLocalTime: "",
      endsLocalTime: "",
    }),
  );
  expect(valid.ok).toBe(true);
  expect(formatLitterPlanAdHocProgrammerWindowDuration("2026-08-10", "2026-08-17")).toContain(
    "8 jour",
  );

  const inverted = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "window",
      startsOn: "2026-08-17",
      endsOn: "2026-08-10",
    }),
  );
  expect(inverted.ok).toBe(false);

  const sameDayTime = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "window",
      startsOn: "2026-08-10",
      endsOn: "2026-08-10",
      startsLocalTime: "18:00",
      endsLocalTime: "08:00",
    }),
  );
  expect(sameDayTime.ok).toBe(false);
});

test("payload récurrent par date et par nombre de dates", () => {
  const byDate = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "recurring_task",
      recurringStartsOn: "2026-08-01",
      intervalDays: "2",
      endKind: "fixed_end_date",
      recurringEndsOn: "2026-08-09",
      timeSlots: ["20:00", "08:00"],
    }),
  );
  expect(byDate.ok).toBe(true);
  if (byDate.ok && byDate.payload.kind === "recurring_task") {
    expect(byDate.payload.timeSlots).toEqual(["08:00:00", "20:00:00"]);
    expect(byDate.payload.endKind).toBe("fixed_end_date");
  }

  const byCount = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "recurring_task",
      recurringStartsOn: "2026-08-01",
      intervalDays: "1",
      endKind: "fixed_recurrence_day_count",
      recurrenceDayCount: "5",
      timeSlots: ["08:00"],
    }),
  );
  expect(byCount.ok).toBe(true);
  if (byCount.ok && byCount.payload.kind === "recurring_task") {
    expect(byCount.payload.recurrenceDayCount).toBe(5);
  }
});

test("créneaux triés, doublons refusés, maximum 8", () => {
  const estimate = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 3,
    timeSlots: ["20:00", "08:00:00", "14:00"],
  });
  expect(estimate.sortedSlots).toEqual(["08:00:00", "14:00:00", "20:00:00"]);

  const duplicates = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "recurring_task",
      timeSlots: ["08:00", "08:00:00"],
    }),
  );
  expect(duplicates.ok).toBe(false);

  const tooMany = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "recurring_task",
      timeSlots: [
        "01:00",
        "02:00",
        "03:00",
        "04:00",
        "05:00",
        "06:00",
        "07:00",
        "08:00",
        "09:00",
      ],
    }),
  );
  expect(tooMany.ok).toBe(false);
});

test("estimation totale, horizon et plafond 500", () => {
  const estimate = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 14,
    timeSlots: ["08:00"],
  });
  expect(estimate.total).toBe(14);
  expect(estimate.initialPrepared).toBe(14);
  expect(
    formatLitterPlanAdHocProgrammerOccurrenceEstimate(estimate),
  ).toContain("14 occurrences au total");

  const longSeries = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 40,
    timeSlots: ["08:00", "20:00"],
  });
  expect(longSeries.total).toBe(80);
  expect(longSeries.initialPrepared).toBe(60);
  expect(longSeries.horizonDays).toBe(30);
  expect(
    formatLitterPlanAdHocProgrammerOccurrenceEstimate(longSeries),
  ).toContain("60 occurrences préparées sur les 30 premiers jours");

  const over = estimateLitterPlanAdHocProgrammerOccurrences({
    startsOn: "2026-08-01",
    intervalDays: 1,
    endKind: "fixed_recurrence_day_count",
    endsOn: null,
    recurrenceDayCount: 100,
    timeSlots: ["08:00", "20:00", "12:00", "14:00", "16:00", "18:00"],
  });
  expect(over.exceedsCeiling).toBe(true);
  expect(over.total).toBeGreaterThan(500);
  const invalid = validateLitterPlanAdHocProgrammerForm(
    baseState({
      kind: "recurring_task",
      recurrenceDayCount: "100",
      timeSlots: ["08:00", "20:00", "12:00", "14:00", "16:00", "18:00"],
    }),
  );
  expect(invalid.ok).toBe(false);
});

test("dernière date récurrente", () => {
  expect(
    litterPlanAdHocProgrammerRecurringLastDate({
      startsOn: "2026-08-01",
      intervalDays: 3,
      endKind: "fixed_end_date",
      endsOn: "2026-08-10",
      recurrenceDayCount: null,
    }),
  ).toBe("2026-08-10");
  expect(
    litterPlanAdHocProgrammerRecurringLastDate({
      startsOn: "2026-08-01",
      intervalDays: 2,
      endKind: "fixed_recurrence_day_count",
      endsOn: null,
      recurrenceDayCount: 5,
    }),
  ).toBe("2026-08-09");
});

test("aperçu point, période, récurrence et domaine étendu", () => {
  const point = buildLitterPlanAdHocProgrammerPreview(
    baseState({
      kind: "task",
      title: "Radiographie de comptage",
      scheduledDate: "2026-07-30",
      localTime: "09:00",
    }),
    instanceKey,
  );
  expect(point).toMatchObject({
    publicKey: buildLitterPlanAdHocProgrammerPreviewKey(instanceKey),
    geometryKind: "point",
    statusLabel: "Aperçu — non enregistré",
  });
  expect(point?.panelSummary.timingLine).toContain("30");

  const window = buildLitterPlanAdHocProgrammerPreview(
    baseState({
      kind: "window",
      title: "Surveillance",
      startsOn: "2026-08-10",
      endsOn: "2026-08-17",
    }),
    instanceKey,
  );
  expect(window?.geometryKind).toBe("window");
  expect(window?.panelSummary.timingLine).toContain("8 jour");

  const recurring = buildLitterPlanAdHocProgrammerPreview(
    baseState({
      kind: "recurring_task",
      title: "Température",
      recurringStartsOn: "2026-08-01",
      intervalDays: "1",
      endKind: "fixed_recurrence_day_count",
      recurrenceDayCount: "7",
      timeSlots: ["20:00", "08:00"],
    }),
    instanceKey,
  );
  expect(recurring?.title).toBe("Suivi récurrent · aperçu");
  expect(recurring?.recurringDetails?.slotsLabel).toBe("08:00, 20:00");

  const existing: InteractiveLitterPlanTimeline = {
    title: "Planning existant",
    items: [
      {
        publicKey: "timeline-item-1",
        kind: "task",
        title: "Existant",
        category: "preparation",
        suggestedStartDate: "2026-08-05",
        suggestedEndDate: "2026-08-05",
        retainedStartDate: "2026-08-05",
        retainedEndDate: "2026-08-05",
        scheduleSource: "manual",
        isLocked: false,
        status: "planned",
        interactionMode: "point_move",
        readOnlyReason: null,
        statusLabel: "Planifié",
      },
    ],
    pendingAnchorItems: [],
  };
  const frozen = structuredClone(existing);
  const withPreview = buildLitterPlanAdHocProgrammerDisplayTimeline(
    existing,
    point,
  );
  expect(existing).toEqual(frozen);
  expect(withPreview?.items).toHaveLength(2);
  expect(withPreview?.pendingAnchorItems).toHaveLength(0);
  const geometry = buildInteractiveTimelineGeometry(withPreview!);
  expect(geometry?.domain.startsOn <= "2026-07-30").toBe(true);
  expect(geometry?.domain.endsOn >= "2026-07-30").toBe(true);

  const withoutPlan = buildLitterPlanAdHocProgrammerDisplayTimeline(null, window);
  expect(withoutPlan?.items).toHaveLength(1);
  expect(withoutPlan?.title).toBe("Aperçu de programmation");
  const emptyGeometry = buildInteractiveTimelineGeometry(withoutPlan!);
  expect(emptyGeometry).not.toBeNull();

  expect(
    buildLitterPlanAdHocProgrammerDisplayTimeline(existing, null)?.items,
  ).toHaveLength(1);
});

test("synthèse mobile identique et clés opaques", () => {
  const preview = buildLitterPlanAdHocProgrammerPreview(
    baseState({
      kind: "task",
      title: "Radiographie de comptage",
      scheduledDate: "2026-07-30",
      localTime: "09:00",
    }),
    instanceKey,
  );
  const display = buildLitterPlanAdHocProgrammerDisplayTimeline(null, preview);
  expect(display?.items[0]?.publicKey).toBe(preview?.publicKey);
  expect(preview?.panelSummary.kindLabel).toBe("Tâche");
  expect(preview?.panelSummary.title).toBe("Radiographie de comptage");

  const publicKey = buildLitterPlanAdHocProgrammerPublicKey(instanceKey, "title");
  const previewKey = buildLitterPlanAdHocProgrammerPreviewKey(instanceKey);
  expect(isOpaqueLitterPlanAdHocProgrammerKey(publicKey, instanceKey)).toBe(
    true,
  );
  expect(isOpaqueLitterPlanAdHocProgrammerKey(previewKey, instanceKey)).toBe(
    true,
  );
  expect(
    litterPlanAdHocProgrammerKeyContainsForbiddenData(previewKey, [
      "20000000-0000-4000-8000-000000000001",
      "revision",
      "Radiographie",
    ]),
  ).toBe(false);
});

test("messages d’erreur, rafraîchissement et succès", () => {
  expect(litterPlanAdHocProgrammerErrorMessage("invalid_input")).toBe(
    "Vérifiez les informations de programmation.",
  );
  expect(litterPlanAdHocProgrammerErrorMessage("stale_revision")).toContain(
    "Rechargez le Journal",
  );
  expect(litterPlanAdHocProgrammerErrorRequiresRefresh("stale_revision")).toBe(
    true,
  );
  expect(litterPlanAdHocProgrammerErrorRequiresRefresh("invalid_input")).toBe(
    false,
  );
  expect(
    litterPlanAdHocProgrammerSuccessMessage({ kind: "milestone" }),
  ).toBe("Le jalon a été programmé.");
  expect(
    litterPlanAdHocProgrammerSuccessMessage({
      kind: "recurring_task",
      materializedOccurrenceCount: 60,
    }),
  ).toContain("60 occurrences ont été préparées.");
});

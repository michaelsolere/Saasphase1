import { expect, test } from "@playwright/test";

import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks-core";
import {
  addLitterCareTimelineCivilDays,
  buildLitterCareTimelineBiologicalDays,
  buildLitterCareTimelineBiologicalWeeks,
  getLitterCareTimelineCategoryOrder,
  getLitterCareTimelineWeekStart,
  packLitterCareTimelineLanes,
  projectLitterCareTimeline,
  resolveLitterCareTimelineAnchor,
} from "../../src/features/litter-journal/litter-care-timeline";
import type {
  LitterJournalDetails,
  LitterJournalListItem,
} from "../../src/features/litter-journal/types";

function litter(overrides: Partial<LitterJournalListItem> = {}): LitterJournalListItem {
  return {
    id: "litter-1",
    name: "Portée test",
    species: "dog",
    breed: "Golden Retriever",
    status: "pregnancy_confirmed",
    mother_id: "mother-1",
    mother_display_name: "Salomé",
    father_id: "father-1",
    father_display_name: "Mistral",
    expected_birth_date: "2024-08-08",
    actual_birth_date: null,
    expected_puppy_count: null,
    born_total_count: null,
    alive_count: null,
    animal_count: null,
    reservation_count: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function details(overrides: Partial<LitterJournalDetails> = {}): LitterJournalDetails {
  return {
    id: "litter-1",
    mating_date: "2024-06-08",
    mating_date_2: "2024-06-10",
    estimated_ovulation_date: "2024-06-06",
    pregnancy_confirmed_at: "2024-06-28T10:00:00Z",
    pregnancy_confirmation_method: "ultrasound",
    ...overrides,
  };
}

function task(overrides: Partial<LitterCareTaskSummary> = {}): LitterCareTaskSummary {
  return {
    id: "task-1",
    litterId: "litter-1",
    source: "manual",
    litterPlanItemId: null,
    organizationTemplateId: null,
    systemTemplateCode: null,
    occurrenceNo: 1,
    category: "veterinary",
    targetScope: "litter",
    title: "Élément frise",
    description: null,
    anchorType: null,
    anchorDate: null,
    offsetDays: null,
    itemKind: "task",
    priority: "normal",
    suggestedFor: null,
    suggestedLocalTime: null,
    plannedFor: "2024-07-01",
    scheduledLocalTime: null,
    scheduleTimezoneName: "Europe/Paris",
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
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

test("priorise l’ovulation sur la première saillie", () => {
  const anchor = resolveLitterCareTimelineAnchor(details());
  expect(anchor.kind).toBe("estimated_ovulation");
  expect(anchor.date).toBe("2024-06-06");
  expect(anchor.message).toContain("ovulation estimée du");
});

test("replie sur la première saillie sans inventer d’ovulation", () => {
  const anchor = resolveLitterCareTimelineAnchor(
    details({ estimated_ovulation_date: null }),
  );
  expect(anchor.kind).toBe("first_mating");
  expect(anchor.date).toBe("2024-06-08");
  expect(anchor.message).toContain("première saillie");
});

test("n’invente aucun J0 sans ancrage biologique", () => {
  const anchor = resolveLitterCareTimelineAnchor(
    details({ estimated_ovulation_date: null, mating_date: null }),
  );
  expect(anchor.kind).toBeNull();
  expect(anchor.date).toBeNull();
  expect(anchor.message).toContain("Repère biologique J0 indisponible");
  const projection = projectLitterCareTimeline({
    litter: litter(),
    details: details({ estimated_ovulation_date: null, mating_date: null }),
    tasks: [task()],
    todayDate: "2024-07-01",
    zoom: "gestation",
  });
  expect(projection?.gestationZoomAvailable).toBe(false);
  expect(projection?.markers.some((marker) => marker.kind === "biological_day")).toBe(false);
});

test("calcule J0 à J63 et les semaines S1 à S9", () => {
  const days = buildLitterCareTimelineBiologicalDays("2024-06-06");
  expect(days.map((day) => day.label)).toEqual([
    "J0",
    "J7",
    "J14",
    "J21",
    "J28",
    "J35",
    "J42",
    "J49",
    "J56",
    "J63",
  ]);
  expect(days[0]?.date).toBe("2024-06-06");
  expect(days[9]?.date).toBe("2024-08-08");
  const weeks = buildLitterCareTimelineBiologicalWeeks("2024-06-06");
  expect(weeks.map((week) => week.label)).toEqual([
    "S1",
    "S2",
    "S3",
    "S4",
    "S5",
    "S6",
    "S7",
    "S8",
    "S9",
  ]);
  expect(weeks[0]).toMatchObject({ startsOn: "2024-06-06", endsOn: "2024-06-12" });
  expect(weeks[8]).toMatchObject({ startsOn: "2024-08-01", endsOn: "2024-08-07" });
});

test("respecte l’année bissextile et les passages de mois ou d’année", () => {
  expect(addLitterCareTimelineCivilDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addLitterCareTimelineCivilDays("2024-02-29", 1)).toBe("2024-03-01");
  expect(addLitterCareTimelineCivilDays("2023-02-28", 1)).toBe("2023-03-01");
  expect(addLitterCareTimelineCivilDays("2024-12-31", 1)).toBe("2025-01-01");
  expect(getLitterCareTimelineWeekStart("2025-01-01")).toBe("2024-12-30");
});

test("calcule les quatre zooms sans muter les entrées", () => {
  const tasks = [
    task({ id: "a", plannedFor: "2024-06-20", category: "preparation" }),
    task({
      id: "b",
      itemKind: "window",
      plannedFor: null,
      retainedStartsOn: "2024-07-10",
      retainedEndsOn: "2024-07-20",
      category: "veterinary",
    }),
  ];
  const before = JSON.stringify(tasks);
  const cycle = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks,
    todayDate: "2024-07-01",
    zoom: "cycle",
  })!;
  expect(cycle.startsOn).toBe("2024-06-06");
  expect(cycle.endsOn >= "2024-08-08").toBe(true);

  const gestation = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks,
    todayDate: "2024-07-01",
    zoom: "gestation",
  })!;
  expect(gestation.startsOn).toBe("2024-06-06");
  expect(gestation.endsOn).toBe("2024-08-08");
  expect(gestation.dates).toHaveLength(64);

  const fourWeeks = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks,
    todayDate: "2024-07-01",
    zoom: "four_weeks",
    requestedDate: "2024-07-01",
  })!;
  expect(fourWeeks.startsOn).toBe("2024-06-18");
  expect(fourWeeks.endsOn).toBe("2024-07-15");
  expect(fourWeeks.dates).toHaveLength(28);

  const week = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks,
    todayDate: "2024-07-01",
    zoom: "week",
    requestedDate: "2024-07-03",
  })!;
  expect(week.startsOn).toBe("2024-07-01");
  expect(week.endsOn).toBe("2024-07-07");
  expect(JSON.stringify(tasks)).toBe(before);
});

test("projette points, fenêtres tronquées et programmations", () => {
  const tasks = [
    task({
      id: "point",
      title: "Point",
      plannedFor: "2024-07-01",
      scheduleSource: "suggested",
    }),
    task({
      id: "manual",
      title: "Ajustée",
      plannedFor: "2024-07-02",
      scheduleSource: "manual",
      isScheduleLocked: true,
    }),
    task({
      id: "done",
      title: "Réalisée",
      plannedFor: "2024-07-03",
      status: "done",
      resolvedAt: "2024-07-04T10:00:00Z",
    }),
    task({
      id: "cancelled",
      title: "Annulée",
      plannedFor: "2024-07-04",
      status: "cancelled",
    }),
    task({
      id: "na",
      title: "Non applicable",
      plannedFor: "2024-07-05",
      status: "not_applicable",
    }),
    task({
      id: "window",
      title: "Fenêtre",
      itemKind: "window",
      plannedFor: null,
      retainedStartsOn: "2024-06-01",
      retainedEndsOn: "2024-07-10",
      scheduleSource: "manual",
    }),
    task({
      id: "recurring-1",
      title: "Pesée",
      itemKind: "recurring_task",
      plannedFor: "2024-07-01",
      occurrenceNo: 1,
      category: "offspring_weight",
    }),
    task({
      id: "recurring-2",
      title: "Pesée",
      itemKind: "recurring_task",
      plannedFor: "2024-07-08",
      occurrenceNo: 2,
      category: "offspring_weight",
    }),
    task({
      id: "invalid",
      title: "Sans date",
      plannedFor: null,
      suggestedFor: null,
    }),
  ];

  const projection = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks,
    todayDate: "2024-07-06",
    zoom: "four_weeks",
    requestedDate: "2024-07-01",
  })!;

  const byId = new Map(
    projection.categories.flatMap((category) =>
      category.items.map((item) => [item.id, item] as const),
    ),
  );

  expect(byId.get("point")).toMatchObject({
    startColumn: byId.get("point")!.startColumn,
    endColumn: byId.get("point")!.endColumn,
    isSuggestedOnly: true,
  });
  expect(byId.get("point")!.startColumn).toBe(byId.get("point")!.endColumn);

  const windowItem = byId.get("window")!;
  expect(windowItem.truncatedLeft).toBe(true);
  expect(windowItem.truncatedRight).toBe(false);
  expect(windowItem.startsOn).toBe("2024-06-01");
  expect(windowItem.endColumn - windowItem.startColumn).toBeGreaterThan(0);

  expect(byId.get("manual")).toMatchObject({
    scheduleSource: "manual",
    isScheduleLocked: true,
    isSuggestedOnly: false,
  });
  expect(byId.get("done")?.status).toBe("done");
  expect(byId.get("done")?.accessibleLabel).toContain("Réalisée");
  expect(byId.get("cancelled")?.status).toBe("cancelled");
  expect(byId.get("na")?.status).toBe("not_applicable");
  expect(byId.get("recurring-1")).toBeTruthy();
  expect(byId.get("recurring-2")).toBeTruthy();
  expect(projection.unpositionedCount).toBe(1);
});

test("tronque une fenêtre à droite hors période visible", () => {
  const projection = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks: [
      task({
        id: "right",
        itemKind: "window",
        plannedFor: null,
        retainedStartsOn: "2024-07-10",
        retainedEndsOn: "2024-08-01",
      }),
    ],
    todayDate: "2024-07-01",
    zoom: "four_weeks",
    requestedDate: "2024-07-01",
  })!;
  const item = projection.categories[0]?.items[0];
  expect(item?.truncatedRight).toBe(true);
  expect(item?.truncatedLeft).toBe(false);
});

test("packe les sous-lignes sans chevauchement et de façon stable", () => {
  const intervals = [
    { id: "b", startsOn: "2024-07-02", endsOn: "2024-07-05" },
    { id: "a", startsOn: "2024-07-01", endsOn: "2024-07-03" },
    { id: "c", startsOn: "2024-07-04", endsOn: "2024-07-06" },
    { id: "d", startsOn: "2024-07-01", endsOn: "2024-07-01" },
  ];
  const first = packLitterCareTimelineLanes(intervals);
  const second = packLitterCareTimelineLanes([...intervals].reverse());
  expect(Object.fromEntries(first)).toEqual(Object.fromEntries(second));
  expect(first.get("d")).toBe(0);
  expect(first.get("a")).toBe(1);
  expect(first.get("b")).toBe(0);
  expect(first.get("c")).toBe(1);

  const projection = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks: [
      task({ id: "a", plannedFor: "2024-07-01", category: "veterinary" }),
      task({ id: "b", plannedFor: "2024-07-01", category: "veterinary", title: "Autre" }),
      task({
        id: "w",
        itemKind: "window",
        plannedFor: null,
        retainedStartsOn: "2024-07-01",
        retainedEndsOn: "2024-07-03",
        category: "veterinary",
      }),
    ],
    todayDate: "2024-07-01",
    zoom: "week",
    requestedDate: "2024-07-01",
  })!;
  const lanes = projection.categories[0]?.items.map((item) => item.lane) ?? [];
  expect(new Set(lanes).size).toBeGreaterThan(1);
});

test("ordonne les catégories et calcule la prochaine action", () => {
  expect(getLitterCareTimelineCategoryOrder()).toEqual([
    "reproduction",
    "maternal_health",
    "veterinary",
    "maternal_feeding",
    "preparation",
    "offspring_weight",
    "offspring_health",
    "offspring_feeding",
    "socialization",
    "identification",
    "vaccination",
    "other",
  ]);

  const projection = projectLitterCareTimeline({
    litter: litter(),
    details: details(),
    tasks: [
      task({
        id: "past",
        plannedFor: "2024-06-20",
        category: "other",
        title: "Passée",
      }),
      task({
        id: "next",
        plannedFor: "2024-07-10",
        category: "preparation",
        title: "radiographie de comptage",
      }),
      task({
        id: "vet",
        plannedFor: "2024-07-12",
        category: "veterinary",
        title: "Visite",
      }),
    ],
    todayDate: "2024-07-01",
    zoom: "cycle",
  })!;

  expect(projection.categories.map((category) => category.category)).toEqual([
    "veterinary",
    "preparation",
    "other",
  ]);
  expect(projection.header.nextActionLabel).toBe("radiographie de comptage");
  expect(projection.header.parentsLabel).toBe("Salomé × Mistral");
  expect(projection.header.statusLabel).toBe("Gestation confirmée");
});

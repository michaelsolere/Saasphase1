import { expect, test } from "@playwright/test";

import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks-core";
import {
  addLitterCareTimelineCivilDays,
  buildLitterCareTimelineBiologicalDays,
  buildLitterCareTimelineBiologicalWeeks,
  getLitterCareTimelineCategoryOrder,
  getLitterCareTimelineWeekStart,
  packLitterCareTimelineLanes,
  parseTimelineCivilDate,
  projectLitterCareTimeline,
  resolveLitterCareTimelineAnchor,
  timelineBusinessDateFromInstant,
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
    litterPlanItemId: null, litterPlanSeriesId: null, recurrenceDayNo: null, slotNo: null, seriesState: null,
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
  expect(anchor.isDerived).toBe(false);
  expect(anchor.message).toContain("ovulation estimée du");
});

test("replie sur première saillie moins 24 h sans inventer d’ovulation stockée", () => {
  const anchor = resolveLitterCareTimelineAnchor(
    details({ estimated_ovulation_date: null }),
  );
  expect(anchor.kind).toBe("first_mating_minus_24h");
  expect(anchor.date).toBe("2024-06-07");
  expect(anchor.isDerived).toBe(true);
  expect(anchor.sourceDate).toBe("2024-06-08");
  expect(anchor.message).toContain("Ovulation estimée automatiquement");
  expect(anchor.message).toContain("première saillie");
  expect(anchor.message).toContain("− 24 h");
});

test("n’invente aucun J0 sans ancrage biologique", () => {
  const anchor = resolveLitterCareTimelineAnchor(
    details({ estimated_ovulation_date: null, mating_date: null }),
  );
  expect(anchor.kind).toBeNull();
  expect(anchor.date).toBeNull();
  expect(anchor.isDerived).toBe(false);
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

test("projette J0/J7/J63 depuis le repli mating_date − 1 jour", () => {
  const projection = projectLitterCareTimeline({
    litter: litter({ expected_birth_date: "2026-08-09" }),
    details: details({
      estimated_ovulation_date: null,
      mating_date: "2026-06-08",
      mating_date_2: "2026-06-12",
    }),
    tasks: [],
    todayDate: "2026-06-20",
    zoom: "gestation",
  })!;
  expect(projection.anchor.date).toBe("2026-06-07");
  expect(projection.startsOn).toBe("2026-06-07");
  expect(projection.endsOn).toBe("2026-08-09");
  const j0 = projection.markers.find(
    (marker) => marker.kind === "biological_day" && marker.label === "J0",
  );
  const j7 = projection.markers.find(
    (marker) => marker.kind === "biological_day" && marker.label === "J7",
  );
  const j63 = projection.markers.find(
    (marker) => marker.kind === "biological_day" && marker.label === "J63",
  );
  expect(j0?.date).toBe("2026-06-07");
  expect(j7?.date).toBe("2026-06-14");
  expect(j63?.date).toBe("2026-08-09");
  const autoOvulation = projection.markers.find(
    (marker) => marker.kind === "estimated_ovulation",
  );
  expect(autoOvulation).toMatchObject({
    date: "2026-06-07",
    label: "Ovulation estimée automatiquement",
  });
  const firstMating = projection.markers.find(
    (marker) => marker.kind === "first_mating",
  );
  expect(firstMating).toMatchObject({ date: "2026-06-08" });
  const secondMating = projection.markers.find(
    (marker) => marker.kind === "second_mating",
  );
  expect(secondMating).toMatchObject({ date: "2026-06-12" });
  expect(projection.header.ovulationIsDerived).toBe(true);
  expect(projection.header.anchorMessage).toContain("Calcul provisoire");
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

test("convertit les timestamptz dans le fuseau métier Europe/Paris", () => {
  expect(parseTimelineCivilDate("2026-06-01T22:30:00.000Z")).toBeNull();
  expect(parseTimelineCivilDate("2026-06-02")).toBe("2026-06-02");
  expect(timelineBusinessDateFromInstant("2026-06-01T22:30:00.000Z")).toBe("2026-06-02");
  expect(timelineBusinessDateFromInstant("2026-06-01T22:30:00")).toBe("2026-06-02");
  expect(timelineBusinessDateFromInstant("2026-06-01 22:30:00")).toBe("2026-06-02");
  // Hiver (UTC+1) : 23:30Z tombe après minuit à Paris.
  expect(timelineBusinessDateFromInstant("2026-01-15T23:30:00.000Z")).toBe("2026-01-16");
  // Veille du changement d’heure 2026 : 23:30Z = 00:30 le 29 à Paris.
  expect(timelineBusinessDateFromInstant("2026-03-28T23:30:00.000Z")).toBe("2026-03-29");
  expect(timelineBusinessDateFromInstant("not-a-date")).toBeNull();
  expect(timelineBusinessDateFromInstant(null)).toBeNull();
  expect(timelineBusinessDateFromInstant("2026-06-02")).toBeNull();

  const beforeDetails = details({
    pregnancy_confirmed_at: "2026-06-01T22:30:00.000Z",
    estimated_ovulation_date: "2026-05-01",
    mating_date: "2026-05-03",
    mating_date_2: null,
  });
  const snapshot = JSON.stringify(beforeDetails);
  const tasks = [
    task({
      id: "done",
      plannedFor: "2026-06-10",
      status: "done",
      resolvedAt: "2026-06-01T22:30:00.000Z",
      title: "Échographie",
    }),
    task({
      id: "invalid-resolved",
      plannedFor: "2026-06-11",
      status: "done",
      resolvedAt: "invalid",
      title: "Sans date métier",
    }),
  ];
  const beforeTasks = JSON.stringify(tasks);

  const projection = projectLitterCareTimeline({
    litter: litter({
      expected_birth_date: "2026-07-03",
      actual_birth_date: null,
    }),
    details: beforeDetails,
    tasks,
    todayDate: "2026-06-10",
    zoom: "cycle",
  })!;

  expect(
    projection.markers.find((marker) => marker.kind === "pregnancy_confirmed"),
  ).toMatchObject({ date: "2026-06-02" });

  const civilConfirmation = projectLitterCareTimeline({
    litter: litter({ expected_birth_date: "2026-07-03" }),
    details: details({
      pregnancy_confirmed_at: "2026-06-02",
      estimated_ovulation_date: "2026-05-01",
      mating_date: "2026-05-03",
      mating_date_2: null,
    }),
    tasks: [],
    todayDate: "2026-06-10",
    zoom: "cycle",
  })!;
  expect(
    civilConfirmation.markers.find((marker) => marker.kind === "pregnancy_confirmed"),
  ).toMatchObject({ date: "2026-06-02" });
  expect(
    projection.categories
      .flatMap((category) => category.items)
      .find((item) => item.id === "done")?.accessibleLabel,
  ).toContain("réalisée le 2 juin 2026");
  expect(
    projection.categories
      .flatMap((category) => category.items)
      .find((item) => item.id === "invalid-resolved")?.accessibleLabel,
  ).not.toContain("réalisée le");
  expect(JSON.stringify(beforeDetails)).toBe(snapshot);
  expect(JSON.stringify(tasks)).toBe(beforeTasks);
});

test("distingue filtres correspondants et éléments visibles dans la période", () => {
  const tasks = [
    task({
      id: "august",
      plannedFor: "2026-08-10",
      category: "veterinary",
      title: "Contrôle d’août",
    }),
  ];
  const before = JSON.stringify(tasks);
  const projection = projectLitterCareTimeline({
    litter: litter({
      expected_birth_date: "2026-09-01",
      actual_birth_date: null,
    }),
    details: details({
      estimated_ovulation_date: "2026-07-01",
      mating_date: "2026-07-03",
      mating_date_2: null,
      pregnancy_confirmed_at: null,
    }),
    tasks,
    todayDate: "2026-09-15",
    zoom: "week",
    requestedDate: "2026-09-15",
    kind: "task",
    category: "veterinary",
  })!;

  expect(projection.hasPlannedItems).toBe(true);
  expect(projection.hasMatchingItems).toBe(true);
  expect(projection.hasVisibleItems).toBe(false);
  expect(projection.categories).toHaveLength(0);
  expect(JSON.stringify(tasks)).toBe(before);
});

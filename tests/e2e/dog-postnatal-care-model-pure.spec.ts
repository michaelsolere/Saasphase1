import { expect, test } from "@playwright/test";

import {
  LITTER_CARE_TASK_CATEGORIES,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import { litterCareTaskCategoryLabels } from "../../src/features/litter-journal/litter-care-task-labels";
import {
  mapLibraryItem,
  type LibraryItemRow,
  type LibraryItemTimeSlotRow,
} from "../../src/features/litter-journal/litter-planning-model-library-core";
import {
  estimateLitterPlanningModelInitialOccurrences,
  projectLitterPlanningModelItemPreview,
} from "../../src/features/litter-journal/litter-planning-model-apply";
import {
  formatLitterPlanningModelFamilyLabel,
  formatLitterPlanningModelRecurrence,
  formatLitterPlanningModelVariantLabel,
} from "../../src/features/settings/litter-planning-model-labels";

const modelCode = "dog-postnatal-essential-care";
const itemPrefix = "da7b2026-0730-4000-8000-";

function row(
  id: string,
  displayOrder: number,
  overrides: Partial<LibraryItemRow>,
): LibraryItemRow {
  return {
    absolute_max_occurrences: null,
    anchor_type: "offspring_age",
    completion_fact_kind: null,
    created_at: "2026-07-30T00:00:00Z",
    display_order: displayOrder,
    id,
    initial_materialization_horizon_days: null,
    is_required: false,
    is_selected_by_default: true,
    item_kind: "task",
    library_model_code: modelCode,
    library_model_version: 1,
    library_template_code: "dog-postpartum-mother-check",
    library_template_version: 1,
    point_local_time: null,
    point_offset_days: 1,
    priority: "important",
    recurrence_day_count: null,
    recurrence_end_kind: null,
    recurrence_ends_offset_days: null,
    recurrence_interval_days: null,
    recurrence_kind: null,
    recurrence_starts_offset_days: null,
    window_ends_local_time: null,
    window_ends_offset_days: null,
    window_starts_local_time: null,
    window_starts_offset_days: null,
    ...overrides,
  };
}

const dewormingItemId = `${itemPrefix}000000000002`;
const dewormingSlots: LibraryItemTimeSlotRow[] = [
  {
    created_at: "2026-07-30T00:00:00Z",
    id: `${itemPrefix}000000000101`,
    library_model_item_id: dewormingItemId,
    local_time: "09:00:00",
    slot_no: 1,
  },
];

function modelRows(): LibraryItemRow[] {
  return [
    row(`${itemPrefix}000000000001`, 0, {}),
    row(dewormingItemId, 1, {
      absolute_max_occurrences: 4,
      initial_materialization_horizon_days: 43,
      item_kind: "recurring_task",
      library_template_code: "dog-puppy-deworming-schedule",
      point_offset_days: null,
      recurrence_end_kind: "fixed_end_offset",
      recurrence_ends_offset_days: 56,
      recurrence_interval_days: 14,
      recurrence_kind: "daily_interval",
      recurrence_starts_offset_days: 14,
    }),
    row(`${itemPrefix}000000000003`, 2, {
      library_template_code: "dog-puppy-weaning-start",
      point_offset_days: 21,
      priority: "normal",
    }),
    row(`${itemPrefix}000000000004`, 3, {
      item_kind: "window",
      library_template_code:
        "dog-puppy-veterinary-identification-vaccination",
      point_offset_days: null,
      window_ends_offset_days: 56,
      window_starts_offset_days: 49,
    }),
  ];
}

test("expose la catégorie et les libellés postnatals autoritatifs", () => {
  expect(LITTER_CARE_TASK_CATEGORIES).toContain("deworming");
  expect(litterCareTaskCategoryLabels.deworming).toBe("Vermifuges");
  expect(formatLitterPlanningModelFamilyLabel("dog-postnatal")).toBe(
    "Postnatal",
  );
  expect(formatLitterPlanningModelVariantLabel("essential-care")).toBe(
    "Soins essentiels",
  );
});

test("décrit exactement les quatre items facultatifs du modèle", () => {
  const sources = modelRows();
  const before = structuredClone(sources);
  const mapped = sources.map((source) =>
    mapLibraryItem(
      source,
      source.id === dewormingItemId ? dewormingSlots : undefined,
    ),
  );

  expect(mapped).toEqual([
    {
      anchorType: "offspring_age",
      completionFactKind: null,
      displayOrder: 0,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "task",
      libraryTemplateCode: "dog-postpartum-mother-check",
      libraryTemplateVersion: 1,
      pointOffsetDays: 1,
      priority: "important",
      timeSlots: [],
    },
    {
      absoluteMaxOccurrences: 4,
      anchorType: "offspring_age",
      completionFactKind: null,
      displayOrder: 1,
      initialMaterializationHorizonDays: 43,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "recurring_task",
      libraryTemplateCode: "dog-puppy-deworming-schedule",
      libraryTemplateVersion: 1,
      priority: "important",
      recurrenceEndKind: "fixed_end_offset",
      recurrenceEndsOffsetDays: 56,
      recurrenceIntervalDays: 14,
      recurrenceKind: "daily_interval",
      recurrenceStartsOffsetDays: 14,
      timeSlots: ["09:00:00"],
    },
    {
      anchorType: "offspring_age",
      completionFactKind: null,
      displayOrder: 2,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "task",
      libraryTemplateCode: "dog-puppy-weaning-start",
      libraryTemplateVersion: 1,
      pointOffsetDays: 21,
      priority: "normal",
      timeSlots: [],
    },
    {
      anchorType: "offspring_age",
      completionFactKind: null,
      displayOrder: 3,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "window",
      libraryTemplateCode:
        "dog-puppy-veterinary-identification-vaccination",
      libraryTemplateVersion: 1,
      priority: "important",
      timeSlots: [],
      windowEndsOffsetDays: 56,
      windowStartsOffsetDays: 49,
    },
  ]);
  expect(sources).toEqual(before);
});

test("formate les récurrences postnatales sans régression pré-mise-bas", () => {
  expect(
    formatLitterPlanningModelRecurrence({
      anchorType: "offspring_age",
      endKind: "fixed_end_offset",
      endsOffsetDays: 56,
      intervalDays: 14,
      startsOffsetDays: 14,
      timeSlots: ["09:00:00"],
    }),
  ).toBe(
    "Tous les 14 jours · 09 h 00 à partir du 14e jour de vie jusqu’au 56e jour de vie",
  );

  expect(
    formatLitterPlanningModelRecurrence({
      anchorType: "expected_birth",
      endKind: "actual_birth",
      intervalDays: 1,
      startsOffsetDays: -5,
      timeSlots: ["08:00:00", "20:00:00"],
    }),
  ).toBe(
    "Deux fois par jour · 08 h 00 et 20 h 00 à partir de 5 jours avant la mise-bas estimée jusqu’à la mise-bas réelle",
  );
});

test("projette J1, J14, J21, J28, J42 et J49 à J56 depuis la naissance réelle", () => {
  const anchors = {
    matingDate: null,
    estimatedOvulationDate: null,
    expectedBirthDate: "2026-05-28",
    actualBirthDate: "2026-06-01",
  };
  const point = (offset: number) =>
    projectLitterPlanningModelItemPreview({
      anchorType: "offspring_age",
      anchors,
      itemKind: "task",
      pointOffsetDays: offset,
    }).projectedStartDate;

  expect([point(1), point(14), point(21), point(28), point(42)]).toEqual([
    "2026-06-02",
    "2026-06-15",
    "2026-06-22",
    "2026-06-29",
    "2026-07-13",
  ]);
  expect(point(56)).toBe("2026-07-27");
  expect(
    projectLitterPlanningModelItemPreview({
      anchorType: "offspring_age",
      anchors,
      itemKind: "window",
      windowEndsOffsetDays: 56,
      windowStartsOffsetDays: 49,
    }),
  ).toMatchObject({
    kind: "window",
    projectedEndDate: "2026-07-27",
    projectedStartDate: "2026-07-20",
  });
  expect(
    estimateLitterPlanningModelInitialOccurrences({
      absoluteMaxOccurrences: 4,
      endsOn: "2026-07-27",
      horizonDays: 43,
      intervalDays: 14,
      slotCount: 1,
      startsOn: "2026-06-15",
    }),
  ).toBe(4);
});

test("laisse les quatre aperçus en attente sans naissance réelle et ne mute rien", () => {
  const anchors = {
    matingDate: "2026-04-01",
    estimatedOvulationDate: "2026-04-03",
    expectedBirthDate: "2026-06-03",
    actualBirthDate: null,
  };
  const before = structuredClone(anchors);
  const previews = modelRows().map((source) =>
    projectLitterPlanningModelItemPreview({
      anchorType: "offspring_age",
      anchors,
      itemKind: source.item_kind as
        | "task"
        | "window"
        | "recurring_task",
      pointOffsetDays: source.point_offset_days,
      recurrenceStartsOffsetDays: source.recurrence_starts_offset_days,
      timeSlots:
        source.id === dewormingItemId ? dewormingSlots.map((slot) => slot.local_time) : [],
      windowEndsOffsetDays: source.window_ends_offset_days,
      windowStartsOffsetDays: source.window_starts_offset_days,
    }),
  );

  expect(previews).toHaveLength(4);
  expect(previews.every((preview) => preview.kind === "pending_anchor")).toBe(
    true,
  );
  expect(
    previews.every(
      (preview) =>
        preview.projectedStartDate === null && preview.projectedEndDate === null,
    ),
  ).toBe(true);
  expect(anchors).toEqual(before);
});

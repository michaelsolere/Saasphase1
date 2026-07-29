import { expect, test } from "@playwright/test";

import {
  mapLibraryItem,
  type LibraryItemRow,
  type LibraryItemTimeSlotRow,
} from "../../src/features/litter-journal/litter-planning-model-library-core";
import {
  formatLitterPlanningModelFamilyLabel,
  formatLitterPlanningModelRecurrence,
  formatLitterPlanningModelVariantLabel,
} from "../../src/features/settings/litter-planning-model-labels";

const modelCode = "dog-pre-whelping-temperature-monitoring";
const itemPrefix = "ca7a2026-0729-4000-8000-";

function item(
  id: string,
  displayOrder: number,
  overrides: Partial<LibraryItemRow>,
): LibraryItemRow {
  return {
    absolute_max_occurrences: null,
    anchor_type: "expected_birth",
    completion_fact_kind: null,
    created_at: "2026-07-29T00:00:00Z",
    display_order: displayOrder,
    id,
    initial_materialization_horizon_days: null,
    is_required: false,
    is_selected_by_default: true,
    item_kind: "task",
    library_model_code: modelCode,
    library_model_version: 1,
    library_template_code: "dog-prepare-whelping-journal",
    library_template_version: 1,
    point_local_time: null,
    point_offset_days: -2,
    priority: "normal",
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

const temperatureItemId = `${itemPrefix}000000000001`;
const slots: LibraryItemTimeSlotRow[] = [
  {
    created_at: "2026-07-29T00:00:00Z",
    id: `${itemPrefix}000000000011`,
    library_model_item_id: temperatureItemId,
    local_time: "08:00:00",
    slot_no: 1,
  },
  {
    created_at: "2026-07-29T00:00:00Z",
    id: `${itemPrefix}000000000012`,
    library_model_item_id: temperatureItemId,
    local_time: "20:00:00",
    slot_no: 2,
  },
];

test("décrit strictement le modèle facultatif de surveillance pré-mise-bas", () => {
  const mapped = [
    mapLibraryItem(
      item(temperatureItemId, 0, {
        absolute_max_occurrences: 30,
        completion_fact_kind: "maternal_temperature_observation",
        initial_materialization_horizon_days: 7,
        is_required: true,
        item_kind: "recurring_task",
        library_template_code: "dog-temperature-monitoring-period",
        point_offset_days: null,
        priority: "important",
        recurrence_end_kind: "actual_birth",
        recurrence_interval_days: 1,
        recurrence_kind: "daily_interval",
        recurrence_starts_offset_days: -5,
      }),
      slots,
    ),
    mapLibraryItem(
      item(`${itemPrefix}000000000002`, 1, {
        library_template_code: "dog-prepare-whelping-journal",
      }),
    ),
    mapLibraryItem(
      item(`${itemPrefix}000000000003`, 2, {
        item_kind: "window",
        library_template_code: "dog-whelping-vigilance-window",
        point_offset_days: null,
        priority: "important",
        window_ends_offset_days: 2,
        window_starts_offset_days: -1,
      }),
    ),
  ];

  expect(mapped).toEqual([
    {
      absoluteMaxOccurrences: 30,
      anchorType: "expected_birth",
      completionFactKind: "maternal_temperature_observation",
      displayOrder: 0,
      initialMaterializationHorizonDays: 7,
      isRequired: true,
      isSelectedByDefault: true,
      itemKind: "recurring_task",
      libraryTemplateCode: "dog-temperature-monitoring-period",
      libraryTemplateVersion: 1,
      priority: "important",
      recurrenceEndKind: "actual_birth",
      recurrenceIntervalDays: 1,
      recurrenceKind: "daily_interval",
      recurrenceStartsOffsetDays: -5,
      timeSlots: ["08:00:00", "20:00:00"],
    },
    {
      anchorType: "expected_birth",
      completionFactKind: null,
      displayOrder: 1,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "task",
      libraryTemplateCode: "dog-prepare-whelping-journal",
      libraryTemplateVersion: 1,
      pointOffsetDays: -2,
      priority: "normal",
      timeSlots: [],
    },
    {
      anchorType: "expected_birth",
      completionFactKind: null,
      displayOrder: 2,
      isRequired: false,
      isSelectedByDefault: true,
      itemKind: "window",
      libraryTemplateCode: "dog-whelping-vigilance-window",
      libraryTemplateVersion: 1,
      priority: "important",
      timeSlots: [],
      windowEndsOffsetDays: 2,
      windowStartsOffsetDays: -1,
    },
  ]);

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
  expect(formatLitterPlanningModelFamilyLabel("dog-pre-whelping")).toBe(
    "Pré-mise-bas",
  );
  expect(formatLitterPlanningModelVariantLabel("temperature-monitoring")).toBe(
    "Surveillance des températures",
  );
});

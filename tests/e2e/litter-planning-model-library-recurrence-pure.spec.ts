import { expect, test } from "@playwright/test";

import {
  mapLibraryItem,
  type LibraryItemRow,
  type LibraryItemTimeSlotRow,
} from "../../src/features/litter-journal/litter-planning-model-library-core";

const itemId = "e7280002-0000-4000-8000-000000000060";

function item(
  overrides: Partial<LibraryItemRow> = {},
): LibraryItemRow {
  return {
    absolute_max_occurrences: null,
    anchor_type: "expected_birth",
    completion_fact_kind: null,
    created_at: "2026-07-28T00:00:00Z",
    display_order: 0,
    id: itemId,
    initial_materialization_horizon_days: null,
    is_required: true,
    is_selected_by_default: true,
    item_kind: "task",
    library_model_code: "e2e-library-recurrence",
    library_model_version: 1,
    library_template_code: "dog-temperature-monitoring-period",
    library_template_version: 1,
    point_local_time: null,
    point_offset_days: -5,
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

function slot(
  slotNo: number,
  localTime: string,
): LibraryItemTimeSlotRow {
  return {
    created_at: "2026-07-28T00:00:00Z",
    id: `e7280002-0000-4000-8000-${String(slotNo).padStart(12, "0")}`,
    library_model_item_id: itemId,
    local_time: localTime,
    slot_no: slotNo,
  };
}

test("mappe strictement les trois formes ponctuelles", () => {
  expect(
    mapLibraryItem(item({ item_kind: "milestone", point_offset_days: 0 })),
  ).toMatchObject({
    itemKind: "milestone",
    pointOffsetDays: 0,
    timeSlots: [],
  });
  expect(mapLibraryItem(item())).toMatchObject({
    itemKind: "task",
    pointOffsetDays: -5,
    timeSlots: [],
  });
  expect(
    mapLibraryItem(
      item({
        item_kind: "window",
        point_offset_days: null,
        window_starts_offset_days: -5,
        window_ends_offset_days: 0,
      }),
    ),
  ).toMatchObject({
    itemKind: "window",
    windowStartsOffsetDays: -5,
    windowEndsOffsetDays: 0,
    timeSlots: [],
  });
});

test("mappe un suivi récurrent et conserve l’ordre des créneaux", () => {
  expect(
    mapLibraryItem(
      item({
        absolute_max_occurrences: 10,
        initial_materialization_horizon_days: 7,
        item_kind: "recurring_task",
        point_offset_days: null,
        recurrence_day_count: 5,
        recurrence_end_kind: "fixed_recurrence_day_count",
        recurrence_interval_days: 1,
        recurrence_kind: "daily_interval",
        recurrence_starts_offset_days: -5,
      }),
      [slot(1, "08:00:00"), slot(2, "20:00:00")],
    ),
  ).toMatchObject({
    itemKind: "recurring_task",
    recurrenceKind: "daily_interval",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: -5,
    recurrenceEndKind: "fixed_recurrence_day_count",
    recurrenceDayCount: 5,
    initialMaterializationHorizonDays: 7,
    absoluteMaxOccurrences: 10,
    timeSlots: ["08:00:00", "20:00:00"],
  });
});

test("rejette les créneaux absents, dupliqués, désordonnés ou ponctuels", () => {
  const recurring = item({
    absolute_max_occurrences: 10,
    initial_materialization_horizon_days: 7,
    item_kind: "recurring_task",
    point_offset_days: null,
    recurrence_day_count: 5,
    recurrence_end_kind: "fixed_recurrence_day_count",
    recurrence_interval_days: 1,
    recurrence_kind: "daily_interval",
    recurrence_starts_offset_days: -5,
  });

  expect(mapLibraryItem(recurring)).toBeNull();
  expect(
    mapLibraryItem(recurring, [slot(1, "08:00:00"), slot(2, "08:00:00")]),
  ).toBeNull();
  expect(
    mapLibraryItem(recurring, [slot(2, "20:00:00"), slot(1, "08:00:00")]),
  ).toBeNull();
  expect(mapLibraryItem(item(), [slot(1, "08:00:00")])).toBeNull();
  expect(
    mapLibraryItem(
      item({
        recurrence_kind: "daily_interval",
        recurrence_interval_days: 1,
      }),
    ),
  ).toBeNull();
});

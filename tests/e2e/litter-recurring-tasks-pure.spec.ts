import { expect, test } from "@playwright/test";

import { parseLitterPlanningModelItems } from "../../src/features/litter-journal/litter-planning-models-core";
import {
  litterPlanSeriesInitialThroughDate,
  litterPlanSeriesOccurrenceNo,
} from "../../src/features/litter-journal/litter-plans-core";

const templateId = "a7270001-0000-4000-8000-000000000010";

test("validates temperature recurring model item shape", () => {
  const items = parseLitterPlanningModelItems([
    {
      organizationTemplateId: templateId,
      itemKind: "recurring_task",
      priority: "important",
      anchorType: "expected_birth",
      recurrenceKind: "daily_interval",
      recurrenceIntervalDays: 1,
      recurrenceStartsOffsetDays: -5,
      recurrenceEndKind: "actual_birth",
      initialMaterializationHorizonDays: 8,
      absoluteMaxOccurrences: 30,
      timeSlots: ["08:00", "20:00"],
      displayOrder: 0,
      isRequired: true,
      isSelectedByDefault: true,
    },
  ]);

  expect(items).toHaveLength(1);
  expect(items?.[0]).toMatchObject({
    itemKind: "recurring_task",
    recurrenceKind: "daily_interval",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: -5,
    recurrenceEndKind: "actual_birth",
    initialMaterializationHorizonDays: 8,
    absoluteMaxOccurrences: 30,
    timeSlots: ["08:00", "20:00"],
  });
});

test("rejects recurring item with unsorted slots or incompatible day count", () => {
  expect(
    parseLitterPlanningModelItems([
      {
        organizationTemplateId: templateId,
        itemKind: "recurring_task",
        priority: "normal",
        anchorType: "expected_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: -5,
        recurrenceEndKind: "actual_birth",
        initialMaterializationHorizonDays: 8,
        absoluteMaxOccurrences: 30,
        timeSlots: ["20:00", "08:00"],
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ]),
  ).toBeNull();

  expect(
    parseLitterPlanningModelItems([
      {
        organizationTemplateId: templateId,
        itemKind: "recurring_task",
        priority: "normal",
        anchorType: "expected_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: 0,
        recurrenceEndKind: "fixed_recurrence_day_count",
        recurrenceDayCount: 20,
        initialMaterializationHorizonDays: 8,
        absoluteMaxOccurrences: 30,
        timeSlots: ["08:00", "20:00"],
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ]),
  ).toBeNull();
});

test("keeps point and window items compatible", () => {
  const items = parseLitterPlanningModelItems([
    {
      organizationTemplateId: templateId,
      itemKind: "task",
      priority: "normal",
      anchorType: "first_mating",
      pointOffsetDays: 20,
      displayOrder: 0,
      isRequired: true,
      isSelectedByDefault: true,
    },
    {
      organizationTemplateId: templateId,
      itemKind: "window",
      priority: "normal",
      anchorType: "estimated_ovulation",
      windowStartsOffsetDays: 5,
      windowEndsOffsetDays: 8,
      displayOrder: 1,
      isRequired: true,
      isSelectedByDefault: true,
    },
  ]);
  expect(items).toHaveLength(2);
});

test("numbers series occurrences deterministically for two daily slots", () => {
  expect(litterPlanSeriesOccurrenceNo(1, 1, 2)).toBe(1);
  expect(litterPlanSeriesOccurrenceNo(1, 2, 2)).toBe(2);
  expect(litterPlanSeriesOccurrenceNo(2, 1, 2)).toBe(3);
  expect(litterPlanSeriesOccurrenceNo(2, 2, 2)).toBe(4);
  expect(litterPlanSeriesOccurrenceNo(8, 2, 2)).toBe(16);
  expect(litterPlanSeriesOccurrenceNo(0, 1, 2)).toBeNull();
  expect(litterPlanSeriesOccurrenceNo(1, 3, 2)).toBeNull();
});

test("computes initial horizon through date from start offset scenario", () => {
  // expected_birth 2026-08-10, start D-5 → 2026-08-05, horizon 8 → through D+2 = 2026-08-12
  expect(litterPlanSeriesInitialThroughDate("2026-08-05", 8, 1)).toBe(
    "2026-08-12",
  );
  expect(litterPlanSeriesInitialThroughDate("2026-08-05", 0, 1)).toBeNull();
});

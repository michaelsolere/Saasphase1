import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  departureBlockHeightPixels,
  departureDropTargetFromDelta,
  departureDurationFromResize,
  validateDeparturePlanDraft,
} from "../../src/features/departures/departure-calendar-interaction-core";

test("accepts a 60-minute planning when at least one litter is selected", () => {
  expect(validateDeparturePlanDraft({ durationMinutes: 60, litterCount: 1, earliestDatesValid: true })).toEqual({ ok: true });
});

test("reports the missing litter independently from the selected duration", () => {
  expect(validateDeparturePlanDraft({ durationMinutes: 60, litterCount: 0, earliestDatesValid: true })).toEqual({ ok: false, reason: "litter_required" });
});

test("scales block height proportionally to appointment duration", () => {
  expect(departureBlockHeightPixels(5)).toBe(5);
  expect(departureBlockHeightPixels(15)).toBe(16);
  expect(departureBlockHeightPixels(30)).toBe(32);
  expect(departureBlockHeightPixels(60)).toBe(64);
  expect(departureBlockHeightPixels(75)).toBe(80);
  expect(departureBlockHeightPixels(180)).toBe(192);
});

test("resizes by quarter-hour steps from a bottom-edge drag", () => {
  expect(departureDurationFromResize({ initialDurationMinutes: 5, deltaPixels: 0 })).toBe(5);
  expect(departureDurationFromResize({ initialDurationMinutes: 20, deltaPixels: -16 })).toBe(5);
  expect(departureDurationFromResize({ initialDurationMinutes: 60, deltaPixels: 16 })).toBe(75);
  expect(departureDurationFromResize({ initialDurationMinutes: 60, deltaPixels: -16 })).toBe(45);
  expect(departureDurationFromResize({ initialDurationMinutes: 15, deltaPixels: -80 })).toBe(5);
  expect(departureDurationFromResize({ initialDurationMinutes: 480, deltaPixels: 80 })).toBe(480);
  expect(departureDurationFromResize({ initialDurationMinutes: 30, deltaPixels: 16, maxDurationMinutes: 30 })).toBe(30);
});

test("snaps a dragged block to the nearest day and quarter-hour", () => {
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 0, deltaY: 384, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-04", hour: 16, minute: 15 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 120, deltaY: -64, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-05", hour: 9, minute: 15 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 0, durationMinutes: 60, deltaX: 0, deltaY: 16, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-04", hour: 10, minute: 15 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 0, durationMinutes: 60, deltaX: 0, deltaY: 48, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-04", hour: 10, minute: 45 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 11, sourceMinute: 15, durationMinutes: 60, deltaX: 0, deltaY: -16, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-04", hour: 11, minute: 0 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 45, durationMinutes: 60, deltaX: 0, deltaY: 32, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toEqual({ dateKey: "2026-09-04", hour: 11, minute: 15 });
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 18, sourceMinute: 45, durationMinutes: 75, deltaX: 0, deltaY: 16, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 2, deltaY: 2, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 0, deltaY: -400, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 480, deltaY: 0, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-04", sourceHour: 10, sourceMinute: 15, durationMinutes: 75, deltaX: 0, deltaY: 640, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
  expect(departureDropTargetFromDelta({ sourceDateKey: "2026-09-06", sourceHour: 18, sourceMinute: 0, durationMinutes: 180, deltaX: 0, deltaY: 64, dayColumnWidth: 120, weekStartKey: "2026-08-31" })).toBeNull();
});

test("audits previous and new duration for booked appointment resizes", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608190001_departure_calendar_interactions.sql"), "utf8");
  expect(sql).toContain("appointment_duration_changed");
  expect(sql).toContain("previousDurationMinutes");
  expect(sql).toContain("durationMinutes");
  expect(sql).toContain("p_client_command_id");
  expect(sql).not.toContain("gen_random_uuid()");
  expect(sql).toContain("departure_slot_outside_calendar_window");
});

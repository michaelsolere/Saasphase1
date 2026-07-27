import { expect, test } from "@playwright/test";

import {
  formatLitterPlanSeriesEndLabel,
  formatLitterPlanSeriesFrequencyLabel,
  formatLitterPlanSeriesScheduleLabel,
  formatLitterPlanSeriesStateLabel,
  getLitterPlanSeriesAvailableActions,
  proposeLitterPlanSeriesMaterializeThrough,
} from "../../src/features/litter-journal/litter-plan-series-summary";

test("libellé de fréquence et créneaux en langage métier", () => {
  expect(formatLitterPlanSeriesFrequencyLabel(1)).toBe("Tous les jours");
  expect(formatLitterPlanSeriesFrequencyLabel(3)).toBe("Tous les 3 jours");
  expect(
    formatLitterPlanSeriesScheduleLabel({
      recurrenceIntervalDays: 1,
      timeSlots: ["08:00", "20:00"],
    }),
  ).toBe("Tous les jours · 08 h 00 et 20 h 00");
  expect(
    formatLitterPlanSeriesScheduleLabel({
      recurrenceIntervalDays: 3,
      timeSlots: ["18:00"],
    }),
  ).toBe("Tous les 3 jours · 18 h 00");
});

test("libellé de fin selon la règle métier", () => {
  expect(
    formatLitterPlanSeriesEndLabel({
      endKind: "actual_birth",
      endsOn: null,
      recurrenceDayCount: null,
    }),
  ).toBe("Jusqu’à la mise-bas réelle");
  expect(
    formatLitterPlanSeriesEndLabel({
      endKind: "fixed_recurrence_day_count",
      endsOn: "2026-09-07",
      recurrenceDayCount: 7,
    }),
  ).toBe("Pendant 7 jours de suivi");
  expect(
    formatLitterPlanSeriesEndLabel({
      endKind: "fixed_end_offset",
      endsOn: "2026-09-30",
      recurrenceDayCount: null,
    }),
  ).toContain("30");
});

test("états et actions disponibles selon le rôle", () => {
  expect(formatLitterPlanSeriesStateLabel("active")).toBe("Actif");
  expect(formatLitterPlanSeriesStateLabel("suspended")).toBe("Suspendu");
  expect(formatLitterPlanSeriesStateLabel("completed")).toBe("Terminé");
  expect(formatLitterPlanSeriesStateLabel("cancelled")).toBe("Annulé");
  expect(formatLitterPlanSeriesStateLabel("not_applicable")).toBe(
    "Non applicable",
  );

  expect(
    getLitterPlanSeriesAvailableActions({ state: "active", canWrite: true }),
  ).toEqual([
    "suspend",
    "materialize",
    "complete",
    "cancel",
    "not_applicable",
  ]);
  expect(
    getLitterPlanSeriesAvailableActions({
      state: "suspended",
      canWrite: true,
    }),
  ).toEqual(["resume", "complete", "cancel", "not_applicable"]);
  expect(
    getLitterPlanSeriesAvailableActions({
      state: "completed",
      canWrite: true,
    }),
  ).toEqual([]);
  expect(
    getLitterPlanSeriesAvailableActions({ state: "active", canWrite: false }),
  ).toEqual([]);
});

test("viewer n’obtient aucune action d’écriture", () => {
  expect(
    getLitterPlanSeriesAvailableActions({
      state: "active",
      canWrite: false,
    }),
  ).toEqual([]);
  expect(
    getLitterPlanSeriesAvailableActions({
      state: "suspended",
      canWrite: false,
    }),
  ).toEqual([]);
});

test("première proposition inclusive depuis startsOn", () => {
  expect(
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: "2026-08-05",
      endsOn: null,
      materializedThrough: null,
      recurrenceIntervalDays: 1,
      absoluteMaxOccurrences: 30,
      timeSlotCount: 2,
      initialMaterializationHorizonDays: 8,
    }),
  ).toBe("2026-08-12");
});

test("extension d’un horizon existant", () => {
  expect(
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: "2026-08-05",
      endsOn: null,
      materializedThrough: "2026-08-12",
      recurrenceIntervalDays: 1,
      absoluteMaxOccurrences: 40,
      timeSlotCount: 2,
      initialMaterializationHorizonDays: 8,
    }),
  ).toBe("2026-08-20");
});

test("borne endsOn et plafond absolu", () => {
  expect(
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: "2026-08-05",
      endsOn: "2026-08-15",
      materializedThrough: "2026-08-12",
      recurrenceIntervalDays: 1,
      absoluteMaxOccurrences: 30,
      timeSlotCount: 2,
      initialMaterializationHorizonDays: 8,
    }),
  ).toBe("2026-08-15");

  // absolute max 5 occurrences / 2 slots → 3 recurrence days → max date starts + 2
  expect(
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: "2026-08-05",
      endsOn: null,
      materializedThrough: "2026-08-05",
      recurrenceIntervalDays: 1,
      absoluteMaxOccurrences: 5,
      timeSlotCount: 2,
      initialMaterializationHorizonDays: 14,
    }),
  ).toBe("2026-08-07");
});

test("série en attente d’ancre : aucune date proposée", () => {
  expect(
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: null,
      endsOn: null,
      materializedThrough: null,
      recurrenceIntervalDays: 1,
      absoluteMaxOccurrences: 30,
      timeSlotCount: 2,
      initialMaterializationHorizonDays: 8,
    }),
  ).toBeNull();
});

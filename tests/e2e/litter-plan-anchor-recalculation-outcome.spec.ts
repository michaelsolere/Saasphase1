import { expect, test } from "@playwright/test";

import {
  resolveExpectedBirthAnchor,
  resolveExpectedBirthAnchorDate,
} from "../../src/features/litter-journal/expected-birth-anchor";
import {
  resolveGestationAnchor,
  resolveGestationAnchorDate,
} from "../../src/features/litter-journal/gestation-anchor";
import {
  explicitEstimatedOvulationFieldValue,
  explicitExpectedBirthFieldValue,
  expectedBirthFallbackHint,
  gestationAnchorRecalculationErrorMessage,
  gestationAnchorRecalculationSuccessMessage,
  parseOptionalCivilDate,
} from "../../src/features/litters/litter-gestation-anchors-outcome";

test("priorise ovulation explicite pour J0", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: "2026-06-08",
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toEqual({
    outcome: "resolved",
    date: "2026-06-08",
    source: "estimated_ovulation",
    sourceDate: "2026-06-08",
    adjustmentDays: 0,
    isDerived: false,
  });
});

test("repli première saillie −1 pour J0 sans ovulation", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toEqual({
    outcome: "resolved",
    date: "2026-06-09",
    source: "first_mating_minus_24h",
    sourceDate: "2026-06-10",
    adjustmentDays: -1,
    isDerived: true,
  });
  expect(
    resolveGestationAnchorDate({
      estimatedOvulationDate: null,
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toBe("2026-06-09");
});

test("priorise expected_birth explicite", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: "2026-08-20",
      estimatedOvulationDate: "2026-06-08",
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toMatchObject({
    outcome: "resolved",
    date: "2026-08-20",
    source: "expected_birth",
    adjustmentDays: 0,
    isDerived: false,
  });
});

test("repli ovulation +63 pour mise-bas", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: "2026-06-08",
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toMatchObject({
    outcome: "resolved",
    date: "2026-08-10",
    source: "estimated_ovulation",
    adjustmentDays: 63,
    isDerived: true,
  });
});

test("repli première saillie +62 pour mise-bas", () => {
  expect(
    resolveExpectedBirthAnchorDate({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: "2026-06-10",
      matingDate2: "2026-06-12",
    }),
  ).toBe("2026-08-11");
});

test("exclut absolument mating_date_2", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toEqual({ outcome: "missing" });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toEqual({ outcome: "missing" });
});

test("projette messages et compteurs", () => {
  expect(
    gestationAnchorRecalculationSuccessMessage("unchanged", {
      recalculatedItemCount: 0,
      changedTaskCount: 0,
      movedAutomaticScheduleCount: 0,
      preservedManualScheduleCount: 0,
      preservedLockedScheduleCount: 0,
      preservedTerminalCount: 0,
      unchangedTaskCount: 0,
    }).message,
  ).toContain("Aucune modification");

  expect(
    gestationAnchorRecalculationSuccessMessage("updated_without_plan", {
      recalculatedItemCount: 0,
      changedTaskCount: 0,
      movedAutomaticScheduleCount: 0,
      preservedManualScheduleCount: 0,
      preservedLockedScheduleCount: 0,
      preservedTerminalCount: 0,
      unchangedTaskCount: 0,
    }).message,
  ).toContain("Aucun planning actif");

  const recalculated = gestationAnchorRecalculationSuccessMessage(
    "recalculated",
    {
      recalculatedItemCount: 4,
      changedTaskCount: 5,
      movedAutomaticScheduleCount: 2,
      preservedManualScheduleCount: 1,
      preservedLockedScheduleCount: 1,
      preservedTerminalCount: 1,
      unchangedTaskCount: 0,
    },
  );
  expect(recalculated.message).toContain("5 suggestion(s)");
  expect(recalculated.message).toContain("2 programmation(s) automatiques");
  expect(recalculated.message).toContain("2 programmation(s) manuelles ou verrouillées");

  expect(gestationAnchorRecalculationErrorMessage("stale_plan")).toContain(
    "Rechargez",
  );
  expect(
    gestationAnchorRecalculationErrorMessage("anchor_unavailable"),
  ).toContain("Aucune modification n’a été enregistrée");
});

test("parse les dates facultatives et n’autoremplit pas une date dérivée", () => {
  expect(parseOptionalCivilDate("")).toBeNull();
  expect(parseOptionalCivilDate("2026-06-08")).toBe("2026-06-08");
  expect(parseOptionalCivilDate("2026-13-01")).toBe("invalid");
  expect(explicitExpectedBirthFieldValue(null)).toBe("");
  expect(explicitExpectedBirthFieldValue("2026-08-20")).toBe("2026-08-20");
  expect(explicitEstimatedOvulationFieldValue(undefined)).toBe("");
  expect(
    expectedBirthFallbackHint({
      expectedBirthDate: null,
      estimatedOvulationDate: "2026-06-08",
      matingDate: "2026-06-10",
    }),
  ).toContain("ovulation + 63");
  expect(
    expectedBirthFallbackHint({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: "2026-06-10",
    }),
  ).toContain("première saillie + 62");
  expect(
    expectedBirthFallbackHint({
      expectedBirthDate: "2026-08-20",
      estimatedOvulationDate: "2026-06-08",
      matingDate: "2026-06-10",
    }),
  ).toBeNull();
});

import { expect, test } from "@playwright/test";

import {
  isManualReproductiveCycleTransitionAllowed,
  validateReproductiveCycleUpdateFields,
} from "../../src/features/reproduction/reproductive-cycle-transitions";

test("autorise la matrice de transitions manuelles", () => {
  expect(isManualReproductiveCycleTransitionAllowed("planned", "planned")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("planned", "in_progress")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("planned", "cancelled")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("in_progress", "in_progress")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("in_progress", "closed")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("in_progress", "cancelled")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("mated", "mated")).toBe(true);
  expect(isManualReproductiveCycleTransitionAllowed("mated", "closed")).toBe(true);
});

test("refuse les transitions manuelles interdites", () => {
  expect(isManualReproductiveCycleTransitionAllowed("planned", "mated")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("planned", "closed")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("in_progress", "mated")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("in_progress", "planned")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("mated", "cancelled")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("mated", "in_progress")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("closed", "planned")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("closed", "closed")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("cancelled", "planned")).toBe(false);
  expect(isManualReproductiveCycleTransitionAllowed("cancelled", "cancelled")).toBe(false);
});

test("valide les dates et refuse les cas métier invalides", () => {
  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "planned",
      nextStatus: "in_progress",
      startedOn: "2026-07-10",
      notes: "ok",
    }),
  ).toEqual({
    ok: true,
    startedOn: "2026-07-10",
    endedOn: null,
    notes: "ok",
  });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "planned",
      nextStatus: "mated",
      startedOn: "2026-07-10",
    }),
  ).toEqual({ ok: false, reason: "invalid_transition" });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "closed",
      nextStatus: "closed",
      startedOn: "2026-07-10",
      endedOn: "2026-07-20",
    }),
  ).toEqual({ ok: false, reason: "invalid_transition" });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "cancelled",
      nextStatus: "cancelled",
      startedOn: "2026-07-10",
    }),
  ).toEqual({ ok: false, reason: "invalid_transition" });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "in_progress",
      nextStatus: "closed",
      startedOn: "2026-07-20",
      endedOn: "2026-07-10",
    }),
  ).toEqual({ ok: false, reason: "invalid_input" });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "in_progress",
      nextStatus: "closed",
      startedOn: "2026-07-10",
    }),
  ).toEqual({ ok: false, reason: "invalid_input" });

  expect(
    validateReproductiveCycleUpdateFields({
      currentStatus: "planned",
      nextStatus: "planned",
      startedOn: "2026-02-30",
    }),
  ).toEqual({ ok: false, reason: "invalid_input" });
});

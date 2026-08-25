import { expect, test } from "@playwright/test";

import {
  formatSignedPercent,
  computeEntryDeltaPercent,
} from "../../src/features/litter-weights/weight-entry-deltas";

test("formate un pourcentage positif à la française", () => {
  expect(formatSignedPercent(2.44)).toBe("+2,4 %");
});

test("arrondit à une décimale et gère la virgule décimale", () => {
  expect(formatSignedPercent(9.42)).toBe("+9,4 %");
  expect(formatSignedPercent(0)).toBe("+0,0 %");
});

test("calcule le Δ entre deux pesées", () => {
  expect(computeEntryDeltaPercent(590, 604)).toBeCloseTo(2.3728, 3);
});

test("retourne null quand la référence est absente ou nulle", () => {
  expect(computeEntryDeltaPercent(null, 604)).toBeNull();
  expect(computeEntryDeltaPercent(0, 604)).toBeNull();
  expect(computeEntryDeltaPercent(590, null)).toBeNull();
});

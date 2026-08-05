import { expect, test } from "@playwright/test";

import {
  getFinancialResolutionLabel,
  getFinancialResolutionTone,
  parseEuroAmountToCents,
} from "../../src/features/reservations/financial-resolution-core";
import { reservationNeedsAttention } from "../../src/features/reservations/attention";

test("parses euro amounts without accepting hidden fractions of a cent", () => {
  expect(parseEuroAmountToCents("300")).toBe(30_000);
  expect(parseEuroAmountToCents("300,50")).toBe(30_050);
  expect(parseEuroAmountToCents("300.50")).toBe(30_050);
  expect(parseEuroAmountToCents("0,01")).toBe(1);
  expect(parseEuroAmountToCents("1,001")).toBeNull();
  expect(parseEuroAmountToCents("-10")).toBeNull();
  expect(parseEuroAmountToCents("abc")).toBeNull();
});

test("exposes explicit breeder-facing financial-resolution labels", () => {
  expect(getFinancialResolutionLabel("none")).toBe("Aucune résolution nécessaire");
  expect(getFinancialResolutionLabel("pending")).toBe("Résolution financière à traiter");
  expect(getFinancialResolutionLabel("full_refund")).toBe("Remboursement total");
  expect(getFinancialResolutionLabel("partial_refund")).toBe("Remboursement partiel — solde conservé");
  expect(getFinancialResolutionLabel("no_refund")).toBe("Aucun remboursement — somme conservée");
  expect(getFinancialResolutionLabel("unexpected")).toBe("Résolution financière non reconnue");
});

test("keeps pending financial work visually distinct from terminal outcomes", () => {
  expect(getFinancialResolutionTone("pending")).toBe("warning");
  expect(getFinancialResolutionTone("none")).toBe("neutral");
  expect(getFinancialResolutionTone("full_refund")).toBe("success");
  expect(getFinancialResolutionTone("partial_refund")).toBe("attention");
  expect(getFinancialResolutionTone("no_refund")).toBe("attention");
});

test("keeps a final journey visible while its financial resolution is pending", () => {
  expect(
    reservationNeedsAttention(
      {
        animal_id: null,
        status: "withdrawn",
        financial_resolution: "pending",
      },
      0,
    ),
  ).toBe(true);
  expect(
    reservationNeedsAttention(
      {
        animal_id: null,
        status: "withdrawn",
        financial_resolution: "full_refund",
      },
      0,
    ),
  ).toBe(false);
});

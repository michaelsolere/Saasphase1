import { expect, test } from "@playwright/test";

import {
  POSTGRES_INTEGER_MAX_CENTS,
  formatEuroInputValue,
  parseNonNegativeInteger,
  parseOptionalEuroCents,
  parseRequiredPositiveEuroCents,
  previewEuroAmountCents,
} from "../../src/features/payments/payment-settings-parse";

test("parses required positive euro amounts into cents", () => {
  expect(parseRequiredPositiveEuroCents("250")).toEqual({
    ok: true,
    value: 25_000,
  });
  expect(parseRequiredPositiveEuroCents("250,00")).toEqual({
    ok: true,
    value: 25_000,
  });
  expect(parseRequiredPositiveEuroCents("250.50")).toEqual({
    ok: true,
    value: 25_050,
  });
});

test("rejects empty zero negative text and excess decimals for required amounts", () => {
  expect(parseRequiredPositiveEuroCents("")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("   ")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("0")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("0,00")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("-10")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("abc")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents("12.345")).toEqual({ ok: false });
  expect(parseRequiredPositiveEuroCents(null)).toEqual({ ok: false });
});

test("rejects unsafe or excessive euro amounts", () => {
  const tooLargeEuros = `${Math.floor(POSTGRES_INTEGER_MAX_CENTS / 100) + 1}`;
  expect(parseRequiredPositiveEuroCents(tooLargeEuros)).toEqual({ ok: false });
  expect(
    parseOptionalEuroCents(`${POSTGRES_INTEGER_MAX_CENTS + 1}`),
  ).toEqual({ ok: false });
});

test("optional euro amounts allow empty as null and keep zero", () => {
  expect(parseOptionalEuroCents("")).toEqual({ ok: true, value: null });
  expect(parseOptionalEuroCents("0")).toEqual({ ok: true, value: 0 });
  expect(parseOptionalEuroCents("1900,00")).toEqual({
    ok: true,
    value: 190_000,
  });
});

test("parses non-negative delay integers", () => {
  expect(parseNonNegativeInteger("0")).toEqual({ ok: true, value: 0 });
  expect(parseNonNegativeInteger("15")).toEqual({ ok: true, value: 15 });
  expect(parseNonNegativeInteger("-1")).toEqual({ ok: false });
  expect(parseNonNegativeInteger("1.5")).toEqual({ ok: false });
  expect(parseNonNegativeInteger("")).toEqual({ ok: false });
  expect(parseNonNegativeInteger("abc")).toEqual({ ok: false });
});

test("formats euro inputs and live previews", () => {
  expect(formatEuroInputValue(25_000)).toBe("250.00");
  expect(formatEuroInputValue(null)).toBe("");
  expect(previewEuroAmountCents("300")).toBe(30_000);
  expect(previewEuroAmountCents("400,00")).toBe(40_000);
  expect(previewEuroAmountCents("")).toBeNull();
  expect(previewEuroAmountCents("0")).toBe(0);
  expect(previewEuroAmountCents("12.345")).toBeNull();
});

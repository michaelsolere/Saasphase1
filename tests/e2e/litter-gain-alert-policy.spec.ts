import { expect, test } from "@playwright/test";

import {
  DEFAULT_LITTER_GAIN_ALERT_POLICY,
  parseLitterGainAlertPolicy,
} from "../../src/features/litter-weights/litter-gain-alert-policy";

test("accepte les bornes de prise la plus faible jusqu'à trois chiots", () => {
  expect(
    parseLitterGainAlertPolicy({
      version: 1,
      lowestGainCount: 0,
      belowTrendDeviationPercent: 0,
    }),
  ).toEqual({
    ok: true,
    policy: { version: 1, lowestGainCount: 0, belowTrendDeviationPercent: 0 },
  });
  expect(
    parseLitterGainAlertPolicy({
      version: 1,
      lowestGainCount: 3,
      belowTrendDeviationPercent: 50,
    }),
  ).toEqual({
    ok: true,
    policy: { version: 1, lowestGainCount: 3, belowTrendDeviationPercent: 50 },
  });
});

test("expose les défauts recommandés", () => {
  expect(DEFAULT_LITTER_GAIN_ALERT_POLICY).toEqual({
    version: 1,
    lowestGainCount: 1,
    belowTrendDeviationPercent: 0,
  });
});

test("rejette une prise la plus faible supérieure à trois", () => {
  expect(
    parseLitterGainAlertPolicy({
      version: 1,
      lowestGainCount: 4,
      belowTrendDeviationPercent: 30,
    }),
  ).toEqual({ ok: false, error: "invalid_lowest_gain_count" });
});

test("rejette les propriétés inattendues et les seuils non supportés", () => {
  expect(
    parseLitterGainAlertPolicy({
      version: 1,
      lowestGainCount: 1,
      belowTrendDeviationPercent: 25,
      extra: true,
    }),
  ).toEqual({ ok: false, error: "unexpected_property" });
  expect(
    parseLitterGainAlertPolicy({
      version: 1,
      lowestGainCount: 1,
      belowTrendDeviationPercent: 25,
    }),
  ).toEqual({ ok: false, error: "invalid_below_trend_deviation_percent" });
});

test("rejette les objets incomplets ou les versions inconnues", () => {
  expect(
    parseLitterGainAlertPolicy({ version: 1, lowestGainCount: 1 }),
  ).toEqual({ ok: false, error: "unexpected_property" });
  expect(
    parseLitterGainAlertPolicy({
      version: 2,
      lowestGainCount: 1,
      belowTrendDeviationPercent: 30,
    }),
  ).toEqual({ ok: false, error: "invalid_version" });
});

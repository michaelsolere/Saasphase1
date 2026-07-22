import { expect, test } from "@playwright/test";

import {
  buildMaternalTemperatureChartModel,
  type MaternalObservationPanelItem,
} from "../../src/features/litter-journal/maternal-temperature-chart-model";

function observation(
  overrides: Partial<MaternalObservationPanelItem> = {},
): MaternalObservationPanelItem {
  return {
    publicSourceIndex: 1,
    observationType: "temperature",
    observedAt: "2026-07-18T08:00:00.000Z",
    timezoneName: "Europe/Paris",
    numericValue: 38.2,
    unit: "celsius",
    severity: "routine",
    note: null,
    ...overrides,
  };
}

test("produit un état vide et exclut les observations non thermiques", () => {
  const empty = buildMaternalTemperatureChartModel([]);
  expect(empty).toMatchObject({
    status: "empty",
    points: [],
    measurementCount: 0,
    latest: null,
    previous: null,
    differenceCelsius: null,
    intervalMilliseconds: null,
    minimumCelsius: null,
    maximumCelsius: null,
    domain: null,
  });

  const nonThermal = buildMaternalTemperatureChartModel([
    observation({ observationType: "appetite", note: "Appétit conservé." }),
  ]);
  expect(nonThermal).toEqual(empty);
});

test("conserve une mesure Celsius et convertit exactement Fahrenheit", () => {
  const model = buildMaternalTemperatureChartModel([
    observation({ publicSourceIndex: 1, numericValue: 38.2 }),
    observation({
      publicSourceIndex: 2,
      observedAt: "2026-07-18T10:00:00.000Z",
      numericValue: 98.6,
      unit: "fahrenheit",
      severity: "watch",
      note: "Mesure en Fahrenheit.",
    }),
  ]);

  expect(model.points[0]).toMatchObject({
    celsius: 38.2,
    originalValue: 38.2,
    originalUnit: "celsius",
  });
  expect(model.points[1]).toMatchObject({
    celsius: 37,
    originalValue: 98.6,
    originalUnit: "fahrenheit",
    severity: "watch",
    note: "Mesure en Fahrenheit.",
  });
});

test("trie sans mutation et départage plusieurs mesures au même instant", () => {
  const input = [
    observation({
      publicSourceIndex: 1,
      observedAt: "2026-07-18T12:00:00.000Z",
      numericValue: 38.3,
    }),
    observation({
      publicSourceIndex: 2,
      observedAt: "2026-07-18T08:00:00.000Z",
      numericValue: 37.9,
    }),
    observation({
      publicSourceIndex: 3,
      observedAt: "2026-07-18T12:00:00.000Z",
      numericValue: 38.1,
    }),
  ];
  const snapshot = structuredClone(input);
  const model = buildMaternalTemperatureChartModel(input);

  expect(input).toEqual(snapshot);
  expect(model.points.map((point) => point.celsius)).toEqual([37.9, 38.1, 38.3]);
  expect(model.points.map((point) => point.publicIndex)).toEqual([1, 2, 3]);
});

test("gère une seule mesure sans inventer d'écart ni d'intervalle", () => {
  const model = buildMaternalTemperatureChartModel([observation()]);

  expect(model).toMatchObject({
    status: "available",
    measurementCount: 1,
    previous: null,
    differenceCelsius: null,
    intervalMilliseconds: null,
    minimumCelsius: 38.2,
    maximumCelsius: 38.2,
  });
  expect(model.latest?.celsius).toBe(38.2);
  expect(model.domain).not.toBeNull();
  expect(model.domain!.minTimestamp).toBeLessThan(model.points[0].timestamp);
  expect(model.domain!.maxTimestamp).toBeGreaterThan(model.points[0].timestamp);
  expect(model.domain!.minCelsius).toBeLessThan(38.2);
  expect(model.domain!.maxCelsius).toBeGreaterThan(38.2);
});

test("calcule les écarts positif, négatif et nul", () => {
  const difference = (first: number, second: number) =>
    buildMaternalTemperatureChartModel([
      observation({ publicSourceIndex: 1, numericValue: first }),
      observation({
        publicSourceIndex: 2,
        observedAt: "2026-07-18T09:00:00.000Z",
        numericValue: second,
      }),
    ]).differenceCelsius;

  expect(difference(37.8, 38.2)).toBeCloseTo(0.4, 12);
  expect(difference(38.2, 37.8)).toBeCloseTo(-0.4, 12);
  expect(difference(38.2, 38.2)).toBe(0);
});

test("calcule l'intervalle réel, le minimum et le maximum", () => {
  const model = buildMaternalTemperatureChartModel([
    observation({ publicSourceIndex: 1, numericValue: 38.4 }),
    observation({
      publicSourceIndex: 2,
      observedAt: "2026-07-18T14:30:00.000Z",
      numericValue: 37.2,
    }),
    observation({
      publicSourceIndex: 3,
      observedAt: "2026-07-18T16:00:00.000Z",
      numericValue: 38,
    }),
  ]);

  expect(model.intervalMilliseconds).toBe(90 * 60 * 1_000);
  expect(model.minimumCelsius).toBe(37.2);
  expect(model.maximumCelsius).toBe(38.4);
});

test("exclut proprement les valeurs incohérentes", () => {
  const invalid = [
    observation({ publicSourceIndex: 1, numericValue: Number.NaN }),
    observation({ publicSourceIndex: 2, numericValue: 0 }),
    observation({ publicSourceIndex: 3, unit: null }),
    observation({ publicSourceIndex: 4, observedAt: "date-invalide" }),
    observation({ publicSourceIndex: 5, timezoneName: "Fuseau/Invalide" }),
  ];
  const valid = observation({ publicSourceIndex: 6, numericValue: 37.7 });

  expect(buildMaternalTemperatureChartModel([...invalid, valid]).points).toHaveLength(1);
});

test("crée un domaine robuste lorsque toutes les valeurs sont identiques", () => {
  const model = buildMaternalTemperatureChartModel([
    observation({ publicSourceIndex: 1, numericValue: 38 }),
    observation({
      publicSourceIndex: 2,
      observedAt: "2026-07-18T09:00:00.000Z",
      numericValue: 38,
    }),
  ]);

  expect(model.domain).not.toBeNull();
  expect(model.domain!.minCelsius).toBeLessThan(38);
  expect(model.domain!.maxCelsius).toBeGreaterThan(38);
  expect(model.domain!.timestampTicks).toEqual([
    Date.parse("2026-07-18T08:00:00.000Z"),
    Date.parse("2026-07-18T09:00:00.000Z"),
  ]);
});

test("n'expose aucun identifiant technique dans le modèle public", () => {
  const model = buildMaternalTemperatureChartModel([observation()]);
  const serialized = JSON.stringify(model);

  expect(serialized).not.toMatch(/uuid|clientCommandId|createdBy|author|motherId|litterId|internalId/i);
  expect(Object.keys(model.points[0])).toEqual([
    "publicIndex",
    "timestamp",
    "observedAt",
    "celsius",
    "originalValue",
    "originalUnit",
    "timezoneName",
    "severity",
    "note",
  ]);
});

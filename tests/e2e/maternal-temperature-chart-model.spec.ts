import { expect, test } from "@playwright/test";

import {
  buildMaternalTemperatureChartModel,
  type MaternalObservationPanelItem,
} from "../../src/features/litter-journal/maternal-temperature-chart-model";
import { parseMaternalTemperatureDropPolicy } from "../../src/features/litter-journal/maternal-temperature-drop-policy";

const policy = {
  version: 1,
  referenceMeasurementCount: 3,
  dropThresholdCelsius: 0.7,
} as const;

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

test("désactive le repère en l'absence de politique et isole une politique indisponible", () => {
  const disabled = buildMaternalTemperatureChartModel([observation()]);
  expect(disabled.dropMarker).toMatchObject({
    status: "disabled",
    thresholdCelsius: null,
    requiredReferenceMeasurementCount: null,
  });

  const unavailable = buildMaternalTemperatureChartModel(
    [observation()],
    null,
    true,
  );
  expect(unavailable.dropMarker).toMatchObject({
    status: "policy_unavailable",
    referenceCelsius: null,
    observedDropCelsius: null,
  });
});

test("parse strictement et canonicalise uniquement la politique V1 expurgée", () => {
  expect(parseMaternalTemperatureDropPolicy(null)).toEqual({
    ok: false,
    error: "invalid_object",
  });
  expect(parseMaternalTemperatureDropPolicy({ ...policy, technicalId: "secret" })).toEqual({
    ok: false,
    error: "unexpected_property",
  });
  expect(parseMaternalTemperatureDropPolicy({ ...policy, version: 2 })).toEqual({
    ok: false,
    error: "invalid_version",
  });
  expect(parseMaternalTemperatureDropPolicy({ ...policy, referenceMeasurementCount: 2.5 })).toEqual({
    ok: false,
    error: "invalid_reference_measurement_count",
  });
  expect(parseMaternalTemperatureDropPolicy({ ...policy, dropThresholdCelsius: 0.123 })).toEqual({
    ok: false,
    error: "invalid_drop_threshold_celsius",
  });
  const hostileValue = new Proxy({}, {
    ownKeys() {
      throw new Error("technical failure");
    },
  });
  expect(() => parseMaternalTemperatureDropPolicy(hostileValue)).not.toThrow();
  expect(parseMaternalTemperatureDropPolicy(hostileValue)).toEqual({
    ok: false,
    error: "invalid_object",
  });

  const parsed = parseMaternalTemperatureDropPolicy({
    dropThresholdCelsius: 0.7,
    referenceMeasurementCount: 3,
    version: 1,
  });
  expect(parsed).toEqual({ ok: true, policy });
  if (parsed.ok) {
    expect(Object.keys(parsed.policy)).toEqual([
      "version",
      "referenceMeasurementCount",
      "dropThresholdCelsius",
    ]);
    expect(JSON.stringify(parsed.policy)).not.toMatch(/id|uuid|column|table|rpc/i);
  }
});

test("accepte les bornes canoniques et refuse tout dépassement", () => {
  expect(parseMaternalTemperatureDropPolicy({
    version: 1,
    referenceMeasurementCount: 2,
    dropThresholdCelsius: 0.1,
  }).ok).toBe(true);
  expect(parseMaternalTemperatureDropPolicy({
    version: 1,
    referenceMeasurementCount: 10,
    dropThresholdCelsius: 3,
  }).ok).toBe(true);

  for (const candidate of [
    { ...policy, referenceMeasurementCount: 1 },
    { ...policy, referenceMeasurementCount: 11 },
    { ...policy, dropThresholdCelsius: 0.09 },
    { ...policy, dropThresholdCelsius: 3.01 },
    { ...policy, dropThresholdCelsius: Number.POSITIVE_INFINITY },
  ]) {
    expect(parseMaternalTemperatureDropPolicy(candidate).ok).toBe(false);
  }
});

function temperatureSeries(values: readonly number[], unit: "celsius" | "fahrenheit" = "celsius") {
  return values.map((numericValue, index) =>
    observation({
      publicSourceIndex: index + 1,
      observedAt: new Date(Date.UTC(2026, 6, 18, 8 + index)).toISOString(),
      numericValue,
      unit,
    }),
  );
}

test("calcule la médiane de trois mesures précédentes sans inclure la dernière", () => {
  const model = buildMaternalTemperatureChartModel(
    temperatureSeries([38.3, 38.1, 38.2, 37.4]),
    policy,
  );
  expect(model.dropMarker.status).toBe("reached");
  expect(model.dropMarker.referenceCelsius).toBe(38.2);
  expect(model.dropMarker.latestCelsius).toBe(37.4);
  expect(model.dropMarker.observedDropCelsius).toBeCloseTo(0.8, 12);
  expect(model.dropMarker.referencePointPublicIndexes).toEqual([1, 2, 3]);
});

test("calcule la médiane paire comme la moyenne des deux valeurs centrales", () => {
  const evenPolicy = { ...policy, referenceMeasurementCount: 4 } as const;
  const model = buildMaternalTemperatureChartModel(
    temperatureSeries([38.6, 38, 38.4, 38.2, 37]),
    evenPolicy,
  );
  expect(model.dropMarker.referenceCelsius).toBeCloseTo(38.3, 12);
  expect(model.dropMarker.observedDropCelsius).toBeCloseTo(1.3, 12);
});

test("utilise uniquement les N mesures précédentes les plus récentes", () => {
  const model = buildMaternalTemperatureChartModel(
    temperatureSeries([41, 40, 38.1, 38.2, 38.3, 37.5]),
    policy,
  );
  expect(model.dropMarker.referenceCelsius).toBe(38.2);
  expect(model.dropMarker.referencePointPublicIndexes).toEqual([3, 4, 5]);
});

test("attend l'historique complet configuré", () => {
  const model = buildMaternalTemperatureChartModel(
    temperatureSeries([38.2, 38.1, 37.4]),
    policy,
  );
  expect(model.dropMarker).toMatchObject({
    status: "insufficient_history",
    referenceCelsius: null,
    latestCelsius: 37.4,
    observedDropCelsius: null,
    thresholdCelsius: 0.7,
    requiredReferenceMeasurementCount: 3,
    usedReferenceMeasurementCount: 2,
    referencePointPublicIndexes: [1, 2],
  });
});

test("distingue une baisse inférieure, égale ou supérieure au seuil", () => {
  const marker = (latest: number) =>
    buildMaternalTemperatureChartModel(
      temperatureSeries([38.1, 38.2, 38.3, latest]),
      policy,
    ).dropMarker;

  expect(marker(37.51).status).toBe("not_reached");
  expect(marker(37.5).status).toBe("reached");
  expect(marker(37.2).status).toBe("reached");
  expect(marker(37.5).observedDropCelsius).toBeCloseTo(0.7, 12);
});

test("une température stable ou en hausse produit une baisse observée nulle", () => {
  for (const latest of [38.2, 38.6]) {
    const marker = buildMaternalTemperatureChartModel(
      temperatureSeries([38.1, 38.2, 38.3, latest]),
      policy,
    ).dropMarker;
    expect(marker.status).toBe("not_reached");
    expect(marker.observedDropCelsius).toBe(0);
    expect(marker.differenceFromReferenceCelsius).toBeGreaterThanOrEqual(0);
  }
});

test("convertit Fahrenheit en Celsius avant de calculer le repère", () => {
  const model = buildMaternalTemperatureChartModel(
    temperatureSeries([100.76, 100.76, 100.76, 98.6], "fahrenheit"),
    policy,
  );
  expect(model.dropMarker.referenceCelsius).toBeCloseTo(38.2, 12);
  expect(model.dropMarker.latestCelsius).toBeCloseTo(37, 12);
  expect(model.dropMarker.observedDropCelsius).toBeCloseTo(1.2, 12);
  expect(model.dropMarker.status).toBe("reached");
});

test("respecte le tri déterministe des entrées désordonnées et simultanées", () => {
  const input = [
    observation({ publicSourceIndex: 1, observedAt: "2026-07-18T12:00:00Z", numericValue: 37.4 }),
    observation({ publicSourceIndex: 5, observedAt: "2026-07-18T10:00:00Z", numericValue: 38.3 }),
    observation({ publicSourceIndex: 3, observedAt: "2026-07-18T10:00:00Z", numericValue: 38.2 }),
    observation({ publicSourceIndex: 4, observedAt: "2026-07-18T09:00:00Z", numericValue: 38.1 }),
  ];
  const snapshot = structuredClone(input);
  const model = buildMaternalTemperatureChartModel(input, policy);
  expect(input).toEqual(snapshot);
  expect(model.points.map((point) => point.celsius)).toEqual([38.1, 38.3, 38.2, 37.4]);
  expect(model.dropMarker.referenceCelsius).toBe(38.2);
  expect(model.dropMarker.referencePointPublicIndexes).toEqual([1, 2, 3]);
});

test("le DTO du repère ne contient ni identifiant technique ni texte médical prédictif", () => {
  const marker = buildMaternalTemperatureChartModel(
    temperatureSeries([38.1, 38.2, 38.3, 37.4]),
    policy,
  ).dropMarker;
  const serialized = JSON.stringify(marker);
  expect(Object.keys(marker)).toEqual([
    "status",
    "referenceCelsius",
    "latestCelsius",
    "differenceFromReferenceCelsius",
    "observedDropCelsius",
    "thresholdCelsius",
    "requiredReferenceMeasurementCount",
    "usedReferenceMeasurementCount",
    "referencePointPublicIndexes",
  ]);
  expect(serialized).not.toMatch(/uuid|command|author|column|table|rpc|24|36|imminente|anormale|médical|vétérinaire|consultation|intervention/i);
});

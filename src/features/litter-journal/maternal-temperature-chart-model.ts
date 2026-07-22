import type {
  MaternalObservationSeverity,
  MaternalObservationTemperatureUnit,
  MaternalObservationType,
} from "./maternal-observations-core";
import type { MaternalTemperatureDropPolicyV1 } from "./maternal-temperature-drop-policy";

export type MaternalObservationPanelItem = {
  publicSourceIndex: number;
  observationType: MaternalObservationType;
  observedAt: string;
  timezoneName: string;
  numericValue: number | null;
  unit: MaternalObservationTemperatureUnit | null;
  severity: MaternalObservationSeverity;
  note: string | null;
};

export type MaternalTemperatureChartPoint = {
  publicIndex: number;
  timestamp: number;
  observedAt: string;
  celsius: number;
  originalValue: number;
  originalUnit: MaternalObservationTemperatureUnit;
  timezoneName: string;
  severity: MaternalObservationSeverity;
  note: string | null;
};

export type MaternalTemperatureChartDomain = {
  minTimestamp: number;
  maxTimestamp: number;
  minCelsius: number;
  maxCelsius: number;
  timestampTicks: number[];
  celsiusTicks: number[];
};

export type MaternalTemperatureChartModel = {
  status: "empty" | "available";
  points: MaternalTemperatureChartPoint[];
  measurementCount: number;
  latest: MaternalTemperatureChartPoint | null;
  previous: MaternalTemperatureChartPoint | null;
  differenceCelsius: number | null;
  intervalMilliseconds: number | null;
  minimumCelsius: number | null;
  maximumCelsius: number | null;
  domain: MaternalTemperatureChartDomain | null;
  dropMarker: MaternalTemperatureDropMarker;
};

export type MaternalTemperatureDropMarker = {
  status:
    | "disabled"
    | "policy_unavailable"
    | "insufficient_history"
    | "not_reached"
    | "reached";
  referenceCelsius: number | null;
  latestCelsius: number | null;
  differenceFromReferenceCelsius: number | null;
  observedDropCelsius: number | null;
  thresholdCelsius: number | null;
  requiredReferenceMeasurementCount: number | null;
  usedReferenceMeasurementCount: number;
  referencePointPublicIndexes: number[];
};

export type MaternalTemperatureChartPlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const SEVERITIES = new Set<MaternalObservationSeverity>([
  "routine",
  "watch",
  "concern",
  "urgent",
]);
const HALF_HOUR_MS = 30 * 60 * 1_000;
const TICK_COUNT = 5;
// Compense uniquement l'imprécision IEEE-754 lors de la comparaison au seuil.
const TEMPERATURE_COMPARISON_EPSILON_CELSIUS = 1e-9;

function isValidTimezone(timezoneName: string) {
  if (!timezoneName.trim()) return false;
  try {
    Intl.DateTimeFormat("fr-FR", { timeZone: timezoneName });
    return true;
  } catch {
    return false;
  }
}

function toCelsius(
  value: number,
  unit: MaternalObservationTemperatureUnit,
) {
  return unit === "fahrenheit" ? ((value - 32) * 5) / 9 : value;
}

function linearTicks(minimum: number, maximum: number) {
  const step = (maximum - minimum) / (TICK_COUNT - 1);
  return Array.from(
    { length: TICK_COUNT },
    (_, index) => minimum + step * index,
  );
}

function observedTimestampTicks(points: readonly MaternalTemperatureChartPoint[]) {
  const timestamps = [...new Set(points.map((point) => point.timestamp))];
  if (timestamps.length <= TICK_COUNT) return timestamps;

  return [...new Set(
    Array.from({ length: TICK_COUNT }, (_, index) =>
      timestamps[Math.round((index * (timestamps.length - 1)) / (TICK_COUNT - 1))],
    ),
  )];
}

export function buildMaternalTemperatureChartDomain(
  points: readonly MaternalTemperatureChartPoint[],
): MaternalTemperatureChartDomain | null {
  if (points.length === 0) return null;

  const timestamps = points.map((point) => point.timestamp);
  const temperatures = points.map((point) => point.celsius);
  const observedMinTimestamp = Math.min(...timestamps);
  const observedMaxTimestamp = Math.max(...timestamps);
  const minimumMeasured = Math.min(...temperatures);
  const maximumMeasured = Math.max(...temperatures);
  const observedRange = maximumMeasured - minimumMeasured;
  const margin =
    observedRange === 0
      ? Math.max(0.5, Math.abs(maximumMeasured) * 0.02)
      : Math.max(0.25, observedRange * 0.15);
  const minCelsius = Math.floor((minimumMeasured - margin) * 10) / 10;
  let maxCelsius = Math.ceil((maximumMeasured + margin) * 10) / 10;
  if (maxCelsius <= minCelsius) maxCelsius = minCelsius + 0.1;

  return {
    minTimestamp:
      observedMinTimestamp === observedMaxTimestamp
        ? observedMinTimestamp - HALF_HOUR_MS
        : observedMinTimestamp,
    maxTimestamp:
      observedMinTimestamp === observedMaxTimestamp
        ? observedMaxTimestamp + HALF_HOUR_MS
        : observedMaxTimestamp,
    minCelsius,
    maxCelsius,
    timestampTicks: observedTimestampTicks(points),
    celsiusTicks: linearTicks(minCelsius, maxCelsius),
  };
}

export function buildMaternalTemperatureChartModel(
  observations: readonly MaternalObservationPanelItem[],
  dropPolicy: MaternalTemperatureDropPolicyV1 | null = null,
  dropPolicyUnavailable = false,
): MaternalTemperatureChartModel {
  const points = observations
    .flatMap((observation) => {
      if (
        observation.observationType !== "temperature" ||
        typeof observation.numericValue !== "number" ||
        !Number.isFinite(observation.numericValue) ||
        observation.numericValue <= 0 ||
        (observation.unit !== "celsius" &&
          observation.unit !== "fahrenheit") ||
        !SEVERITIES.has(observation.severity) ||
        !Number.isInteger(observation.publicSourceIndex) ||
        observation.publicSourceIndex < 1 ||
        typeof observation.observedAt !== "string" ||
        typeof observation.timezoneName !== "string" ||
        !isValidTimezone(observation.timezoneName) ||
        (observation.note !== null && typeof observation.note !== "string")
      ) {
        return [];
      }

      const timestamp = Date.parse(observation.observedAt);
      const celsius = toCelsius(observation.numericValue, observation.unit);
      if (!Number.isFinite(timestamp) || !Number.isFinite(celsius)) return [];

      return [{
        sourceIndex: observation.publicSourceIndex,
        timestamp,
        observedAt: observation.observedAt,
        celsius,
        originalValue: observation.numericValue,
        originalUnit: observation.unit,
        timezoneName: observation.timezoneName,
        severity: observation.severity,
        note: observation.note,
      }];
    })
    .sort((left, right) =>
      left.timestamp === right.timestamp
        ? right.sourceIndex - left.sourceIndex
        : left.timestamp - right.timestamp,
    )
    .map((point, index) => ({
      publicIndex: index + 1,
      timestamp: point.timestamp,
      observedAt: point.observedAt,
      celsius: point.celsius,
      originalValue: point.originalValue,
      originalUnit: point.originalUnit,
      timezoneName: point.timezoneName,
      severity: point.severity,
      note: point.note,
    }));

  const latest = points.at(-1) ?? null;
  const previous = points.at(-2) ?? null;
  const temperatures = points.map((point) => point.celsius);
  const dropMarker = buildMaternalTemperatureDropMarker(
    points,
    dropPolicy,
    dropPolicyUnavailable,
  );

  return {
    status: points.length === 0 ? "empty" : "available",
    points,
    measurementCount: points.length,
    latest,
    previous,
    differenceCelsius:
      latest && previous ? latest.celsius - previous.celsius : null,
    intervalMilliseconds:
      latest && previous ? latest.timestamp - previous.timestamp : null,
    minimumCelsius:
      temperatures.length > 0 ? Math.min(...temperatures) : null,
    maximumCelsius:
      temperatures.length > 0 ? Math.max(...temperatures) : null,
    domain: buildMaternalTemperatureChartDomain(points),
    dropMarker,
  };
}

function median(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function buildMaternalTemperatureDropMarker(
  points: readonly MaternalTemperatureChartPoint[],
  policy: MaternalTemperatureDropPolicyV1 | null,
  policyUnavailable = false,
): MaternalTemperatureDropMarker {
  const latest = points.at(-1) ?? null;
  const neutral = {
    referenceCelsius: null,
    latestCelsius: latest?.celsius ?? null,
    differenceFromReferenceCelsius: null,
    observedDropCelsius: null,
    thresholdCelsius: null,
    requiredReferenceMeasurementCount: null,
    usedReferenceMeasurementCount: 0,
    referencePointPublicIndexes: [],
  };

  if (policyUnavailable) return { status: "policy_unavailable", ...neutral };
  if (!policy) return { status: "disabled", ...neutral };

  const precedingPoints = points.slice(0, -1);
  const referencePoints = precedingPoints.slice(-policy.referenceMeasurementCount);
  const configured = {
    thresholdCelsius: policy.dropThresholdCelsius,
    requiredReferenceMeasurementCount: policy.referenceMeasurementCount,
    usedReferenceMeasurementCount: referencePoints.length,
    referencePointPublicIndexes: referencePoints.map((point) => point.publicIndex),
  };

  if (!latest || referencePoints.length < policy.referenceMeasurementCount) {
    return {
      status: "insufficient_history",
      referenceCelsius: null,
      latestCelsius: latest?.celsius ?? null,
      differenceFromReferenceCelsius: null,
      observedDropCelsius: null,
      ...configured,
    };
  }

  const referenceCelsius = median(referencePoints.map((point) => point.celsius));
  const differenceFromReferenceCelsius = latest.celsius - referenceCelsius;
  const observedDropCelsius = Math.max(0, referenceCelsius - latest.celsius);
  const thresholdReached =
    observedDropCelsius + TEMPERATURE_COMPARISON_EPSILON_CELSIUS >=
    policy.dropThresholdCelsius;

  return {
    status: thresholdReached ? "reached" : "not_reached",
    referenceCelsius,
    latestCelsius: latest.celsius,
    differenceFromReferenceCelsius,
    observedDropCelsius,
    ...configured,
  };
}

export function projectMaternalTemperaturePoint(
  point: Pick<MaternalTemperatureChartPoint, "timestamp" | "celsius">,
  domain: MaternalTemperatureChartDomain,
  plotArea: MaternalTemperatureChartPlotArea,
) {
  const timestampRatio =
    (point.timestamp - domain.minTimestamp) /
    (domain.maxTimestamp - domain.minTimestamp);
  const temperatureRatio =
    (point.celsius - domain.minCelsius) /
    (domain.maxCelsius - domain.minCelsius);

  return {
    x: plotArea.left + Math.min(1, Math.max(0, timestampRatio)) * plotArea.width,
    y:
      plotArea.top +
      (1 - Math.min(1, Math.max(0, temperatureRatio))) * plotArea.height,
  };
}

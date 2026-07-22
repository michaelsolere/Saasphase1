export type MaternalTemperatureDropPolicyV1 = {
  version: 1;
  referenceMeasurementCount: number;
  dropThresholdCelsius: number;
};

export type MaternalTemperatureDropPolicyParseResult =
  | { ok: true; policy: MaternalTemperatureDropPolicyV1 }
  | {
      ok: false;
      error:
        | "invalid_object"
        | "invalid_version"
        | "invalid_reference_measurement_count"
        | "invalid_drop_threshold_celsius"
        | "unexpected_property";
    };

const POLICY_KEYS = new Set([
  "version",
  "referenceMeasurementCount",
  "dropThresholdCelsius",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasAtMostTwoDecimals(value: number) {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

function parseMaternalTemperatureDropPolicyUnsafe(
  value: unknown,
): MaternalTemperatureDropPolicyParseResult {
  if (!isPlainObject(value)) return { ok: false, error: "invalid_object" };

  const keys = Object.keys(value);
  if (keys.some((key) => !POLICY_KEYS.has(key)) || keys.length !== POLICY_KEYS.size) {
    return { ok: false, error: "unexpected_property" };
  }
  if (value.version !== 1) return { ok: false, error: "invalid_version" };

  const referenceMeasurementCount = value.referenceMeasurementCount;
  if (
    typeof referenceMeasurementCount !== "number" ||
    !Number.isInteger(referenceMeasurementCount) ||
    referenceMeasurementCount < 2 ||
    referenceMeasurementCount > 10
  ) {
    return { ok: false, error: "invalid_reference_measurement_count" };
  }

  const dropThresholdCelsius = value.dropThresholdCelsius;
  if (
    typeof dropThresholdCelsius !== "number" ||
    !Number.isFinite(dropThresholdCelsius) ||
    dropThresholdCelsius < 0.1 ||
    dropThresholdCelsius > 3 ||
    !hasAtMostTwoDecimals(dropThresholdCelsius)
  ) {
    return { ok: false, error: "invalid_drop_threshold_celsius" };
  }

  return {
    ok: true,
    policy: {
      version: 1,
      referenceMeasurementCount,
      dropThresholdCelsius: Number(dropThresholdCelsius.toFixed(2)),
    },
  };
}

export function parseMaternalTemperatureDropPolicy(
  value: unknown,
): MaternalTemperatureDropPolicyParseResult {
  try {
    return parseMaternalTemperatureDropPolicyUnsafe(value);
  } catch {
    return { ok: false, error: "invalid_object" };
  }
}

export function normalizeMaternalTemperatureDropPolicy(
  value: unknown,
): MaternalTemperatureDropPolicyParseResult {
  return parseMaternalTemperatureDropPolicy(value);
}

export type LitterGainAlertPolicyV1 = {
  version: 1;
  lowestGainCount: number;
  belowTrendDeviationPercent: 0 | 20 | 30 | 50;
};

export type LitterGainAlertPolicyParseResult =
  | { ok: true; policy: LitterGainAlertPolicyV1 }
  | {
      ok: false;
      error:
        | "invalid_object"
        | "invalid_version"
        | "invalid_lowest_gain_count"
        | "invalid_below_trend_deviation_percent"
        | "unexpected_property";
    };

export const DEFAULT_LITTER_GAIN_ALERT_POLICY: LitterGainAlertPolicyV1 = {
  version: 1,
  lowestGainCount: 1,
  belowTrendDeviationPercent: 0,
};

const POLICY_KEYS = new Set([
  "version",
  "lowestGainCount",
  "belowTrendDeviationPercent",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseLitterGainAlertPolicy(
  value: unknown,
): LitterGainAlertPolicyParseResult {
  if (!isPlainObject(value)) return { ok: false, error: "invalid_object" };

  const keys = Object.keys(value);
  if (
    keys.length !== POLICY_KEYS.size ||
    keys.some((key) => !POLICY_KEYS.has(key))
  ) {
    return { ok: false, error: "unexpected_property" };
  }
  if (value.version !== 1) return { ok: false, error: "invalid_version" };

  const lowestGainCount = value.lowestGainCount;
  if (
    typeof lowestGainCount !== "number" ||
    !Number.isInteger(lowestGainCount) ||
    lowestGainCount < 0 ||
    lowestGainCount > 3
  ) {
    return { ok: false, error: "invalid_lowest_gain_count" };
  }

  const belowTrendDeviationPercent = value.belowTrendDeviationPercent;
  if (
    belowTrendDeviationPercent !== 0 &&
    belowTrendDeviationPercent !== 20 &&
    belowTrendDeviationPercent !== 30 &&
    belowTrendDeviationPercent !== 50
  ) {
    return {
      ok: false,
      error: "invalid_below_trend_deviation_percent",
    };
  }

  return {
    ok: true,
    policy: {
      version: 1,
      lowestGainCount,
      belowTrendDeviationPercent,
    },
  };
}

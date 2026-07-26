const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const REPRODUCTIVE_CYCLE_STATUSES = [
  "planned",
  "in_progress",
  "mated",
  "closed",
  "cancelled",
] as const;

export type ReproductiveCycleStatus =
  (typeof REPRODUCTIVE_CYCLE_STATUSES)[number];

export const MANUAL_REPRODUCTIVE_CYCLE_TRANSITIONS = {
  planned: ["planned", "in_progress", "cancelled"],
  in_progress: ["in_progress", "closed", "cancelled"],
  mated: ["mated", "closed"],
  closed: [],
  cancelled: [],
} as const satisfies Record<
  ReproductiveCycleStatus,
  readonly ReproductiveCycleStatus[]
>;

export type ReproductiveCycleTransitionValidation =
  | { ok: true; startedOn: string; endedOn: string | null; notes: string | null }
  | { ok: false; reason: "invalid_input" | "invalid_transition" };

export function isReproductiveCycleStatus(
  value: unknown,
): value is ReproductiveCycleStatus {
  return (
    typeof value === "string" &&
    REPRODUCTIVE_CYCLE_STATUSES.includes(value as ReproductiveCycleStatus)
  );
}

export function allowedManualStatusesFor(
  current: ReproductiveCycleStatus,
): readonly ReproductiveCycleStatus[] {
  return MANUAL_REPRODUCTIVE_CYCLE_TRANSITIONS[current];
}

export function isManualReproductiveCycleTransitionAllowed(
  from: ReproductiveCycleStatus,
  to: ReproductiveCycleStatus,
): boolean {
  return (MANUAL_REPRODUCTIVE_CYCLE_TRANSITIONS[from] as readonly string[]).includes(
    to,
  );
}

export function normalizeCivilDate(value: unknown) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function validateReproductiveCycleUpdateFields(input: {
  currentStatus: ReproductiveCycleStatus;
  nextStatus: unknown;
  startedOn: unknown;
  endedOn?: unknown;
  notes?: unknown;
}): ReproductiveCycleTransitionValidation {
  if (!isReproductiveCycleStatus(input.nextStatus)) {
    return { ok: false, reason: "invalid_input" };
  }

  if (
    !isManualReproductiveCycleTransitionAllowed(
      input.currentStatus,
      input.nextStatus,
    )
  ) {
    return { ok: false, reason: "invalid_transition" };
  }

  const startedOn = normalizeCivilDate(input.startedOn);
  if (!startedOn) return { ok: false, reason: "invalid_input" };

  const endedOnRaw = input.endedOn;
  const endedOn =
    endedOnRaw === undefined || endedOnRaw === null || endedOnRaw === ""
      ? null
      : normalizeCivilDate(endedOnRaw);

  if (
    endedOnRaw !== undefined &&
    endedOnRaw !== null &&
    endedOnRaw !== "" &&
    !endedOn
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  if (endedOn !== null && endedOn < startedOn) {
    return { ok: false, reason: "invalid_input" };
  }

  if (input.nextStatus === "closed" && endedOn === null) {
    return { ok: false, reason: "invalid_input" };
  }

  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null && input.notes !== "") {
    if (typeof input.notes !== "string") {
      return { ok: false, reason: "invalid_input" };
    }
    const normalized = input.notes.trim();
    if (!normalized) {
      notes = null;
    } else if (normalized.length > 5_000) {
      return { ok: false, reason: "invalid_input" };
    } else {
      notes = normalized;
    }
  }

  return { ok: true, startedOn, endedOn, notes };
}

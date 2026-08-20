import type { AnimalHistoryEntry } from "./animal-history-model";

export const ANIMAL_PROFILE_TABS = [
  "overview",
  "health",
  "reproduction",
  "documents",
  "history",
] as const;

export type AnimalProfileTab = (typeof ANIMAL_PROFILE_TABS)[number];

const HEALTH_EVENT_TYPES = new Set([
  "vaccination",
  "xray",
  "ultrasound",
  "pregnancy_check",
  "health_other",
]);

const TERMINAL_EVENT_STATUSES = new Set(["done", "cancelled", "not_applicable"]);
const IDENTITY_RELEVANT_STATUSES = new Set(["born", "available", "reserved", "kept"]);

export type AnimalAttentionEvent = {
  id: string;
  title: string;
  status: string;
  priority: string;
  plannedAt: string | null;
  plannedDate: string | null;
};

export type AnimalAttentionPoint = {
  id: string;
  kind: "late" | "urgent" | "high" | "identity";
  title: string;
  detail: string | null;
  tab: AnimalProfileTab;
};

type ReproductionMeasurement = {
  measuredAt: string;
  value: number;
  unit: string;
};

type ReproductionCycle = {
  id: string;
  startedOn: string;
  endedOn: string | null;
  status: string;
  measurements: ReproductionMeasurement[];
  matings: Array<{ id: string }>;
};

export type ReproductionLitter = {
  id: string;
  bornTotalCount: number | null;
  aliveCount: number | null;
};

export function normalizeAnimalProfileTab(value: string | undefined): AnimalProfileTab {
  return ANIMAL_PROFILE_TABS.includes(value as AnimalProfileTab)
    ? (value as AnimalProfileTab)
    : "overview";
}

export function isAnimalHealthEventType(value: string): boolean {
  return HEALTH_EVENT_TYPES.has(value);
}

function eventDueAt(event: AnimalAttentionEvent): string | null {
  return event.plannedAt ?? (event.plannedDate ? `${event.plannedDate}T23:59:59.999Z` : null);
}

export function projectAnimalAttentionPoints(input: {
  now: string;
  events: AnimalAttentionEvent[];
  identity: {
    kennelBorn: boolean;
    status: string;
    identificationNumber: string | null;
    officialName: string | null;
  };
}): AnimalAttentionPoint[] {
  const now = new Date(input.now).getTime();
  const candidates = input.events
    .filter((event) => !TERMINAL_EVENT_STATUSES.has(event.status))
    .map((event): AnimalAttentionPoint | null => {
      const dueAt = eventDueAt(event);
      const isLate =
        event.status === "late" ||
        (dueAt !== null && new Date(dueAt).getTime() < now);
      const kind: AnimalAttentionPoint["kind"] | null = isLate
        ? "late"
        : event.priority === "urgent"
          ? "urgent"
          : event.priority === "high"
            ? "high"
            : null;

      if (!kind) return null;

      return {
        id: event.id,
        kind,
        title: event.title,
        detail: dueAt,
        tab: "health",
      };
    })
    .filter((point): point is AnimalAttentionPoint => point !== null);

  if (
    input.identity.kennelBorn &&
    IDENTITY_RELEVANT_STATUSES.has(input.identity.status) &&
    (!input.identity.identificationNumber?.trim() || !input.identity.officialName?.trim())
  ) {
    candidates.push({
      id: "identity-incomplete",
      kind: "identity",
      title: "Identité définitive incomplète",
      detail: null,
      tab: "overview",
    });
  }

  const rank = { late: 0, urgent: 1, high: 2, identity: 3 } as const;
  return candidates
    .sort((left, right) => {
      const rankDifference = rank[left.kind] - rank[right.kind];
      if (rankDifference !== 0) return rankDifference;
      const detailDifference = (left.detail ?? "").localeCompare(right.detail ?? "");
      return detailDifference !== 0 ? detailDifference : left.id.localeCompare(right.id);
    })
    .slice(0, 3);
}

export function getRecentAnimalActivity(
  entries: readonly AnimalHistoryEntry[],
  limit = 3,
): AnimalHistoryEntry[] {
  return entries.slice(0, limit);
}

export function buildFemaleReproductionSummary(input: {
  cycles: ReproductionCycle[];
  litters: ReproductionLitter[];
}) {
  const latestCycle = [...input.cycles].sort((left, right) =>
    right.startedOn.localeCompare(left.startedOn),
  )[0] ?? null;
  const latestMeasurement = latestCycle
    ? [...latestCycle.measurements].sort((left, right) =>
        right.measuredAt.localeCompare(left.measuredAt),
      )[0] ?? null
    : null;

  return {
    latestCycle,
    latestMeasurement,
    matingCount: latestCycle?.matings.length ?? 0,
    litterCount: input.litters.length,
    descendantCount: input.litters.reduce(
      (total, litter) => total + (litter.bornTotalCount ?? litter.aliveCount ?? 0),
      0,
    ),
  };
}

export function buildMaleReproductionSummary(litters: ReproductionLitter[]) {
  return {
    litterCount: litters.length,
    descendantCount: litters.reduce(
      (total, litter) => total + (litter.bornTotalCount ?? litter.aliveCount ?? 0),
      0,
    ),
    aliveDescendantCount: litters.reduce(
      (total, litter) => total + (litter.aliveCount ?? 0),
      0,
    ),
  };
}
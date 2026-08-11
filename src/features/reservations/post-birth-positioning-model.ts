export type PostBirthSex = "male" | "female";

export type SexCounts = Record<PostBirthSex, number>;

export function summarizePostBirthCapacity({
  born,
  preserved,
  uncertain,
  confirmed,
}: {
  born: SexCounts;
  preserved: SexCounts;
  uncertain: SexCounts;
  confirmed: SexCounts;
}) {
  return Object.fromEntries(
    (["male", "female"] as const).map((sex) => [
      sex,
      {
        total: born[sex],
        preserved: preserved[sex],
        uncertain: uncertain[sex],
        committed: confirmed[sex],
        available: Math.max(
          0,
          born[sex] - preserved[sex] - uncertain[sex] - confirmed[sex],
        ),
      },
    ]),
  ) as Record<
    PostBirthSex,
    {
      total: number;
      preserved: number;
      uncertain: number;
      committed: number;
      available: number;
    }
  >;
}

export type PostBirthQueueFamily = {
  id: string;
  rank: number;
  preference: string;
  late: boolean;
};

export function buildPostBirthQueues(families: PostBirthQueueFamily[]) {
  const historical = families
    .filter((family) => !family.late)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
  const acceptsMale = new Set([
    "male_only",
    "male_preferred_female_possible",
    "female_preferred_male_possible",
    "no_preference",
  ]);
  const acceptsFemale = new Set([
    "female_only",
    "female_preferred_male_possible",
    "male_preferred_female_possible",
    "no_preference",
  ]);

  return {
    male: historical.filter((family) => acceptsMale.has(family.preference)),
    female: historical.filter((family) => acceptsFemale.has(family.preference)),
    complementary: families
      .filter((family) => family.late)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id)),
  };
}

export function diffStalePositioningLines(
  lines: Array<{ id: string; reservationVersion: number; capacityVersion: number }>,
  current: {
    reservationVersions: Record<string, number>;
    capacityVersion: number;
  },
) {
  return lines.flatMap((line) => {
    const reasons: string[] = [];
    if (current.reservationVersions[line.id] !== line.reservationVersion) {
      reasons.push("reservation_changed");
    }
    if (current.capacityVersion !== line.capacityVersion) {
      reasons.push("capacity_changed");
    }
    return reasons.length > 0 ? [{ id: line.id, reasons }] : [];
  });
}

export function previewPostBirthConfirmation({
  available,
  selected,
  activeConfirmed,
}: {
  available: SexCounts;
  selected: Array<{
    id: string;
    rank: number;
    sex: PostBirthSex;
    stale: boolean;
    blocked: boolean;
  }>;
  activeConfirmed: Array<{ id: string; rank: number; sex: PostBirthSex }>;
}) {
  const blocked = selected.flatMap((item) =>
    item.stale || item.blocked
      ? [{ id: item.id, reason: item.stale ? "stale" : "blocked" }]
      : [],
  );
  const readyIds = selected
    .filter((item) => !item.stale && !item.blocked && available[item.sex] > 0)
    .map((item) => item.id);
  const deficitSuggestions = (["male", "female"] as const).flatMap((sex) => {
    if (available[sex] > 0 || !selected.some((item) => item.sex === sex)) return [];
    const leastPriority = activeConfirmed
      .filter((item) => item.sex === sex)
      .sort((left, right) => right.rank - left.rank || right.id.localeCompare(left.id))[0];
    return leastPriority
      ? [{ sex, reservationId: leastPriority.id }]
      : [];
  });
  return { readyIds, blocked, deficitSuggestions };
}

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

export type PostBirthOrderedFamily = {
  id: string;
  historicalRank: number;
  activeOrder: number;
};

export function reorderPostBirthFile<T extends PostBirthOrderedFamily>(
  families: T[],
  familyId: string,
  targetOrder: number,
) {
  const ordered = [...families].sort(
    (left, right) => left.activeOrder - right.activeOrder || left.id.localeCompare(right.id),
  );
  const currentIndex = ordered.findIndex((family) => family.id === familyId);
  if (currentIndex < 0 || targetOrder < 1 || targetOrder > ordered.length) return ordered;
  const [moved] = ordered.splice(currentIndex, 1);
  ordered.splice(targetOrder - 1, 0, moved!);
  return ordered.map((family, index) => ({ ...family, activeOrder: index + 1 }));
}

export type PostBirthProposalFamily = PostBirthOrderedFamily & {
  litterId: string;
  sex: PostBirthSex;
  hasOrderOverride: boolean;
};

export function isPostBirthPreferenceCompatible(preference: string, sex: PostBirthSex) {
  if (preference === "male_only") return sex === "male";
  if (preference === "female_only") return sex === "female";
  return [
    "male_preferred_female_possible",
    "female_preferred_male_possible",
    "no_preference",
  ].includes(preference);
}

export function movePostBirthProposal<T extends PostBirthProposalFamily>(
  families: T[],
  familyId: string,
  destination: { litterId: string; sex: PostBirthSex },
) {
  const moved = families.find((family) => family.id === familyId);
  if (!moved) return families;
  const changed = families.map((family) =>
    family.id === familyId
      ? { ...family, ...destination, hasOrderOverride: false }
      : { ...family },
  );
  const fileKeys = new Set(changed.map((family) => `${family.litterId}:${family.sex}`));
  for (const key of fileKeys) {
    const [litterId, sex] = key.split(":") as [string, PostBirthSex];
    const file = changed
      .filter((family) => family.litterId === litterId && family.sex === sex)
      .sort((left, right) => left.historicalRank - right.historicalRank || left.id.localeCompare(right.id));
    file.forEach((family, index) => {
      family.activeOrder = index + 1;
    });
  }
  return changed.sort(
    (left, right) =>
      left.litterId.localeCompare(right.litterId) ||
      left.sex.localeCompare(right.sex) ||
      left.activeOrder - right.activeOrder,
  );
}

export function annotatePostBirthCapacity<
  T extends { id: string; litterId: string; sex: PostBirthSex; activeOrder: number },
>(families: T[], capacityByFile: Record<string, number>) {
  const overflowByFile: Record<string, number> = {};
  const lines = families.map((family) => {
    const key = `${family.litterId}:${family.sex}`;
    const capacity = capacityByFile[key] ?? 0;
    const capacityOverflow = family.activeOrder > capacity;
    if (capacityOverflow) overflowByFile[key] = (overflowByFile[key] ?? 0) + 1;
    return { ...family, capacityOverflow };
  });
  return { lines, overflowByFile, canConfirm: Object.keys(overflowByFile).length === 0 };
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
